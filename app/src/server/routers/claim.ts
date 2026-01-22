import { z } from 'zod';
import { router, protectedProcedure, billerProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import { ClaimStatus, ChargeStatus } from '@prisma/client';

export const claimRouter = router({
  // Create claim from charges
  create: billerProcedure
    .input(
      z.object({
        patientId: z.string(),
        insurancePolicyId: z.string(),
        chargeIds: z.array(z.string()).min(1, 'At least one charge is required'),
        encounterId: z.string().optional(),
        claimType: z.enum(['professional', 'institutional']).default('professional'),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, insurancePolicyId, chargeIds, encounterId, claimType, notes } = input;

      // Verify patient and insurance policy
      const [patient, policy] = await Promise.all([
        ctx.prisma.patient.findFirst({
          where: { id: patientId, organizationId: ctx.user.organizationId },
        }),
        ctx.prisma.patientInsurance.findFirst({
          where: { id: insurancePolicyId, patientId },
          include: { insurancePayer: true },
        }),
      ]);

      if (!patient) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Patient not found' });
      }

      if (!policy) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Insurance policy not found' });
      }

      // Get charges
      const charges = await ctx.prisma.charge.findMany({
        where: {
          id: { in: chargeIds },
          organizationId: ctx.user.organizationId,
          status: { in: [ChargeStatus.PENDING, ChargeStatus.BILLED] },
        },
        include: { encounter: { include: { diagnoses: true } } },
      });

      if (charges.length !== chargeIds.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Some charges not found or not eligible for billing',
        });
      }

      // Validate all charges are for same patient
      if (!charges.every((c) => c.patientId === patientId)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'All charges must be for the same patient',
        });
      }

      // Generate claim number
      const claimCount = await ctx.prisma.claim.count({
        where: { organizationId: ctx.user.organizationId },
      });
      const claimNumber = `CLM-${String(claimCount + 1).padStart(6, '0')}`;

      // Calculate totals
      const totalCharges = charges.reduce((sum, c) => sum + Number(c.fee) * c.units, 0);

      // Get diagnoses from encounter or charges
      const allDiagnoses = new Set<string>();
      charges.forEach((c) => {
        c.icd10Codes.forEach((code) => allDiagnoses.add(code));
        c.encounter?.diagnoses.forEach((d) => allDiagnoses.add(d.icd10Code));
      });

      // Create claim with lines in transaction
      const claim = await ctx.prisma.$transaction(async (tx) => {
        const newClaim = await tx.claim.create({
          data: {
            patientId,
            organizationId: ctx.user.organizationId,
            insurancePolicyId,
            payerId: policy.insurancePayerId,
            encounterId,
            claimNumber,
            claimType,
            status: ClaimStatus.DRAFT,
            totalCharges,
            notes,
          },
        });

        // Create claim lines
        for (let i = 0; i < charges.length; i++) {
          const charge = charges[i];
          await tx.claimLine.create({
            data: {
              claimId: newClaim.id,
              chargeId: charge.id,
              lineNumber: i + 1,
              serviceDateFrom: charge.serviceDate,
              serviceDateTo: charge.serviceDate,
              placeOfService: charge.placeOfService,
              cptCode: charge.cptCode,
              modifiers: charge.modifiers,
              description: charge.description,
              units: charge.units,
              diagnosisPointers: charge.diagnosisPointers,
              chargedAmount: Number(charge.fee) * charge.units,
            },
          });

          // Update charge status
          await tx.charge.update({
            where: { id: charge.id },
            data: { status: ChargeStatus.BILLED },
          });
        }

        // Add creation note
        await tx.claimNote.create({
          data: {
            claimId: newClaim.id,
            noteType: 'creation',
            note: `Claim created with ${charges.length} service line(s)`,
            userId: ctx.user.id,
          },
        });

        return newClaim;
      });

      await auditLog('CLAIM_CREATE', 'Claim', {
        entityId: claim.id,
        changes: { claimNumber, patientId, chargeCount: charges.length, totalCharges },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return claim;
    }),

  // Update claim details
  update: billerProcedure
    .input(
      z.object({
        id: z.string(),
        notes: z.string().nullable().optional(),
        internalNotes: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      const existing = await ctx.prisma.claim.findFirst({
        where: { id, organizationId: ctx.user.organizationId },
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Claim not found' });
      }

      if (['PAID', 'DENIED', 'VOID'].includes(existing.status)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot update a finalized claim',
        });
      }

      const claim = await ctx.prisma.claim.update({
        where: { id },
        data: updateData,
      });

      await auditLog('CLAIM_UPDATE', 'Claim', {
        entityId: id,
        changes: updateData,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return claim;
    }),

  // List claims
  list: protectedProcedure
    .input(
      z.object({
        status: z.nativeEnum(ClaimStatus).optional(),
        payerId: z.string().optional(),
        patientId: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const { status, payerId, patientId, startDate, endDate, page, limit } = input;

      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
      };

      if (status) where.status = status;
      if (payerId) where.payerId = payerId;
      if (patientId) where.patientId = patientId;

      if (startDate || endDate) {
        where.createdDate = {};
        if (startDate) (where.createdDate as Record<string, Date>).gte = startDate;
        if (endDate) (where.createdDate as Record<string, Date>).lte = endDate;
      }

      const [claims, total] = await Promise.all([
        ctx.prisma.claim.findMany({
          where,
          include: {
            patient: { include: { demographics: true } },
            payer: true,
            insurancePolicy: true,
            _count: { select: { claimLines: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        ctx.prisma.claim.count({ where }),
      ]);

      return {
        claims,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    }),

  // Get claim with all lines and history
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const claim = await ctx.prisma.claim.findFirst({
        where: { id: input.id, organizationId: ctx.user.organizationId },
        include: {
          patient: { include: { demographics: true, contacts: { where: { isPrimary: true } } } },
          payer: true,
          insurancePolicy: true,
          encounter: { include: { diagnoses: true, provider: { include: { user: true } } } },
          claimLines: { include: { charge: true }, orderBy: { lineNumber: 'asc' } },
          claimNotes: { orderBy: { createdAt: 'desc' } },
          payments: true,
        },
      });

      if (!claim) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Claim not found' });
      }

      return claim;
    }),

  // Mark claim as submitted
  submit: billerProcedure
    .input(
      z.object({
        id: z.string(),
        submissionMethod: z.enum(['electronic', 'paper', 'portal']).default('electronic'),
        batchId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, submissionMethod, batchId } = input;

      const existing = await ctx.prisma.claim.findFirst({
        where: { id, organizationId: ctx.user.organizationId },
        include: { claimLines: true },
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Claim not found' });
      }

      if (existing.status !== ClaimStatus.DRAFT && existing.status !== ClaimStatus.READY) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot submit a claim with status ${existing.status}`,
        });
      }

      // Basic validation
      if (existing.claimLines.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Claim has no service lines',
        });
      }

      const claim = await ctx.prisma.$transaction(async (tx) => {
        const updated = await tx.claim.update({
          where: { id },
          data: {
            status: ClaimStatus.SUBMITTED,
            submittedDate: new Date(),
            submissionMethod,
            batchId,
          },
        });

        await tx.claimNote.create({
          data: {
            claimId: id,
            noteType: 'submission',
            note: `Claim submitted via ${submissionMethod}${batchId ? ` (Batch: ${batchId})` : ''}`,
            userId: ctx.user.id,
          },
        });

        return updated;
      });

      await auditLog('CLAIM_SUBMIT', 'Claim', {
        entityId: id,
        changes: { submissionMethod, batchId },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return claim;
    }),

  // Add note to claim
  addNote: billerProcedure
    .input(
      z.object({
        claimId: z.string(),
        noteType: z.string().default('general'),
        note: z.string().min(1, 'Note is required'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { claimId, noteType, note } = input;

      const claim = await ctx.prisma.claim.findFirst({
        where: { id: claimId, organizationId: ctx.user.organizationId },
      });

      if (!claim) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Claim not found' });
      }

      const claimNote = await ctx.prisma.claimNote.create({
        data: {
          claimId,
          noteType,
          note,
          userId: ctx.user.id,
        },
      });

      return claimNote;
    }),

  // Void claim
  void: billerProcedure
    .input(
      z.object({
        id: z.string(),
        reason: z.string().min(1, 'Void reason is required'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, reason } = input;

      const existing = await ctx.prisma.claim.findFirst({
        where: { id, organizationId: ctx.user.organizationId },
        include: { claimLines: true, payments: true },
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Claim not found' });
      }

      if (existing.status === ClaimStatus.VOID) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Claim is already voided' });
      }

      if (existing.payments.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot void a claim with payments. Void payments first.',
        });
      }

      const claim = await ctx.prisma.$transaction(async (tx) => {
        // Revert charge statuses
        for (const line of existing.claimLines) {
          if (line.chargeId) {
            await tx.charge.update({
              where: { id: line.chargeId },
              data: { status: ChargeStatus.PENDING },
            });
          }
        }

        const updated = await tx.claim.update({
          where: { id },
          data: { status: ClaimStatus.VOID, statusMessage: reason },
        });

        await tx.claimNote.create({
          data: {
            claimId: id,
            noteType: 'void',
            note: `Claim voided: ${reason}`,
            userId: ctx.user.id,
          },
        });

        return updated;
      });

      await auditLog('CLAIM_VOID', 'Claim', {
        entityId: id,
        changes: { reason, previousStatus: existing.status },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return claim;
    }),

  // Update claim status (for tracking responses)
  updateStatus: billerProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.nativeEnum(ClaimStatus),
        statusMessage: z.string().optional(),
        payerClaimNumber: z.string().optional(),
        // For payment posting
        totalAllowed: z.number().optional(),
        totalPaid: z.number().optional(),
        totalAdjusted: z.number().optional(),
        patientResponsibility: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, status, statusMessage, payerClaimNumber, ...amounts } = input;

      const existing = await ctx.prisma.claim.findFirst({
        where: { id, organizationId: ctx.user.organizationId },
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Claim not found' });
      }

      const updateData: Record<string, unknown> = { status, statusMessage };

      if (payerClaimNumber) updateData.payerClaimNumber = payerClaimNumber;
      if (status === ClaimStatus.ACCEPTED) updateData.acceptedDate = new Date();
      if (status === ClaimStatus.PAID) updateData.paidDate = new Date();

      if (amounts.totalAllowed !== undefined) updateData.totalAllowed = amounts.totalAllowed;
      if (amounts.totalPaid !== undefined) updateData.totalPaid = amounts.totalPaid;
      if (amounts.totalAdjusted !== undefined) updateData.totalAdjusted = amounts.totalAdjusted;
      if (amounts.patientResponsibility !== undefined) updateData.patientResponsibility = amounts.patientResponsibility;

      const claim = await ctx.prisma.$transaction(async (tx) => {
        const updated = await tx.claim.update({
          where: { id },
          data: updateData,
        });

        await tx.claimNote.create({
          data: {
            claimId: id,
            noteType: 'status_change',
            note: `Status changed to ${status}${statusMessage ? `: ${statusMessage}` : ''}`,
            userId: ctx.user.id,
          },
        });

        return updated;
      });

      await auditLog('CLAIM_STATUS_UPDATE', 'Claim', {
        entityId: id,
        changes: { status, statusMessage, previousStatus: existing.status },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return claim;
    }),

  // Get claims pending submission
  getPending: billerProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }))
    .query(async ({ ctx, input }) => {
      const claims = await ctx.prisma.claim.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          status: { in: [ClaimStatus.DRAFT, ClaimStatus.READY] },
        },
        include: {
          patient: { include: { demographics: true } },
          payer: true,
          _count: { select: { claimLines: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: input.limit,
      });

      return claims;
    }),

  // Validate claim before submission
  validate: billerProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const claim = await ctx.prisma.claim.findFirst({
        where: { id: input.id, organizationId: ctx.user.organizationId },
        include: {
          patient: { include: { demographics: true } },
          payer: true,
          insurancePolicy: true,
          encounter: { include: { diagnoses: true, provider: { include: { user: true } } } },
          claimLines: { include: { charge: true } },
        },
      });

      if (!claim) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Claim not found' });
      }

      const errors: string[] = [];
      const warnings: string[] = [];

      // Required fields validation
      if (!claim.patient.demographics) errors.push('Patient demographics missing');
      if (!claim.payer) errors.push('Payer information missing');
      if (!claim.insurancePolicy) errors.push('Insurance policy missing');
      if (claim.claimLines.length === 0) errors.push('No service lines on claim');

      // Diagnosis validation
      const hasDiagnosis = claim.claimLines.some(
        (l) => l.diagnosisPointers && l.diagnosisPointers.length > 0
      );
      if (!hasDiagnosis) errors.push('No diagnosis codes linked to services');

      // Date validations
      if (claim.insurancePolicy?.terminationDate) {
        const termDate = new Date(claim.insurancePolicy.terminationDate);
        const serviceDate = claim.claimLines[0]?.serviceDateFrom;
        if (serviceDate && new Date(serviceDate) > termDate) {
          errors.push('Service date is after insurance termination date');
        }
      }

      // Provider NPI
      if (!claim.encounter?.provider?.npiNumber) {
        warnings.push('Provider NPI number not set');
      }

      // Timely filing check
      if (claim.payer?.timelyFilingDays) {
        const oldestService = claim.claimLines.reduce(
          (oldest, l) =>
            !oldest || new Date(l.serviceDateFrom) < oldest ? new Date(l.serviceDateFrom) : oldest,
          null as Date | null
        );
        if (oldestService) {
          const daysSinceService = Math.floor(
            (Date.now() - oldestService.getTime()) / (1000 * 60 * 60 * 24)
          );
          if (daysSinceService > claim.payer.timelyFilingDays * 0.8) {
            warnings.push(
              `Approaching timely filing limit (${daysSinceService}/${claim.payer.timelyFilingDays} days)`
            );
          }
          if (daysSinceService > claim.payer.timelyFilingDays) {
            errors.push(`Past timely filing deadline of ${claim.payer.timelyFilingDays} days`);
          }
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        claim,
      };
    }),
});
