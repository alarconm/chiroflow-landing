import { z } from 'zod';
import { router, protectedProcedure, billerProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import { ChargeStatus, PlaceOfService, Prisma } from '@prisma/client';

export const chargeRouter = router({
  // Generate charges from encounter procedures
  createFromEncounter: billerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        feeScheduleId: z.string().optional(), // Use default if not provided
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { encounterId, feeScheduleId } = input;

      // Get encounter with procedures and diagnoses
      const encounter = await ctx.prisma.encounter.findFirst({
        where: {
          id: encounterId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          procedures: true,
          diagnoses: {
            orderBy: { sequence: 'asc' },
          },
          patient: true,
          provider: true,
        },
      });

      if (!encounter) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        });
      }

      if (encounter.procedures.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Encounter has no procedures to bill',
        });
      }

      // Check for existing charges
      const existingCharges = await ctx.prisma.charge.findMany({
        where: { encounterId },
      });

      if (existingCharges.length > 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Charges already exist for this encounter',
        });
      }

      // Get fee schedule
      let scheduleId = feeScheduleId;
      if (!scheduleId) {
        const defaultSchedule = await ctx.prisma.feeSchedule.findFirst({
          where: {
            organizationId: ctx.user.organizationId,
            isDefault: true,
          },
        });
        scheduleId = defaultSchedule?.id;
      }

      // Get fees for all CPT codes
      const cptCodes = encounter.procedures.map((p) => p.cptCode);
      const feeItems = scheduleId
        ? await ctx.prisma.feeScheduleItem.findMany({
            where: {
              feeScheduleId: scheduleId,
              cptCode: { in: cptCodes },
            },
          })
        : [];

      const feeMap = new Map(feeItems.map((f) => [f.cptCode, f]));

      // Get ICD-10 codes from diagnoses
      const icd10Codes = encounter.diagnoses.map((d) => d.icd10Code);

      // Create charges for each procedure
      const charges = await ctx.prisma.$transaction(
        encounter.procedures.map((proc) => {
          const feeItem = feeMap.get(proc.cptCode);
          const fee = feeItem?.fee ?? proc.chargeAmount ?? 0;

          return ctx.prisma.charge.create({
            data: {
              patientId: encounter.patientId,
              encounterId: encounter.id,
              procedureId: proc.id,
              providerId: encounter.providerId,
              organizationId: ctx.user.organizationId,
              serviceDate: encounter.encounterDate,
              cptCode: proc.cptCode,
              description: proc.description,
              modifiers: [proc.modifier1, proc.modifier2, proc.modifier3, proc.modifier4].filter(
                Boolean
              ) as string[],
              units: proc.units,
              diagnosisPointers: proc.diagnosisPointers as number[] | undefined || [1],
              icd10Codes,
              fee,
              balance: fee,
              status: ChargeStatus.PENDING,
              placeOfService: PlaceOfService.OFFICE,
            },
          });
        })
      );

      await auditLog('CHARGE_CREATE_FROM_ENCOUNTER', 'Charge', {
        entityId: encounterId,
        changes: { chargeCount: charges.length, total: charges.reduce((s, c) => s + Number(c.fee), 0) },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return charges;
    }),

  // Manual charge entry
  create: billerProcedure
    .input(
      z.object({
        patientId: z.string(),
        serviceDate: z.date(),
        cptCode: z.string().min(1, 'CPT code is required'),
        description: z.string().min(1, 'Description is required'),
        modifiers: z.array(z.string()).default([]),
        units: z.number().min(1).default(1),
        diagnosisPointers: z.array(z.number()).default([1]),
        icd10Codes: z.array(z.string()).default([]),
        fee: z.number().min(0),
        placeOfService: z.nativeEnum(PlaceOfService).default(PlaceOfService.OFFICE),
        providerId: z.string().optional(),
        encounterId: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify patient belongs to org
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: input.patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const charge = await ctx.prisma.charge.create({
        data: {
          ...input,
          organizationId: ctx.user.organizationId,
          balance: input.fee,
          status: ChargeStatus.PENDING,
        },
      });

      await auditLog('CHARGE_CREATE', 'Charge', {
        entityId: charge.id,
        changes: { patientId: input.patientId, cptCode: input.cptCode, fee: input.fee },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return charge;
    }),

  // Update charge details
  update: billerProcedure
    .input(
      z.object({
        id: z.string(),
        cptCode: z.string().optional(),
        description: z.string().optional(),
        modifiers: z.array(z.string()).optional(),
        units: z.number().min(1).optional(),
        diagnosisPointers: z.array(z.number()).optional(),
        icd10Codes: z.array(z.string()).optional(),
        fee: z.number().min(0).optional(),
        placeOfService: z.nativeEnum(PlaceOfService).optional(),
        notes: z.string().nullable().optional(),
        internalNotes: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      const existing = await ctx.prisma.charge.findFirst({
        where: {
          id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Charge not found',
        });
      }

      if (existing.status === ChargeStatus.VOID) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot update a voided charge',
        });
      }

      // Recalculate balance if fee changes
      let balance: Prisma.Decimal | number = existing.balance;
      if (updateData.fee !== undefined) {
        const newTotal = updateData.fee * (updateData.units ?? existing.units);
        const oldTotal = Number(existing.fee) * existing.units;
        balance = new Prisma.Decimal(Number(existing.balance) + (newTotal - oldTotal));
      }

      const charge = await ctx.prisma.charge.update({
        where: { id },
        data: {
          ...updateData,
          balance,
        },
      });

      await auditLog('CHARGE_UPDATE', 'Charge', {
        entityId: id,
        changes: updateData,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return charge;
    }),

  // List charges
  list: protectedProcedure
    .input(
      z.object({
        patientId: z.string().optional(),
        encounterId: z.string().optional(),
        status: z.nativeEnum(ChargeStatus).optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        providerId: z.string().optional(),
        unbilledOnly: z.boolean().default(false),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, encounterId, status, startDate, endDate, providerId, unbilledOnly, page, limit } = input;

      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
      };

      if (patientId) where.patientId = patientId;
      if (encounterId) where.encounterId = encounterId;
      if (status) where.status = status;
      if (providerId) where.providerId = providerId;
      if (unbilledOnly) where.status = ChargeStatus.PENDING;

      if (startDate || endDate) {
        where.serviceDate = {};
        if (startDate) (where.serviceDate as Record<string, Date>).gte = startDate;
        if (endDate) (where.serviceDate as Record<string, Date>).lte = endDate;
      }

      const [charges, total] = await Promise.all([
        ctx.prisma.charge.findMany({
          where,
          include: {
            patient: {
              include: { demographics: true },
            },
            provider: { include: { user: true } },
            encounter: true,
          },
          orderBy: { serviceDate: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        ctx.prisma.charge.count({ where }),
      ]);

      return {
        charges,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }),

  // Get charge with linked encounter/procedure
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const charge = await ctx.prisma.charge.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            include: { demographics: true },
          },
          provider: { include: { user: true } },
          encounter: {
            include: {
              diagnoses: true,
              procedures: true,
            },
          },
          paymentAllocations: {
            include: { payment: true },
          },
          claimLines: {
            include: { claim: true },
          },
        },
      });

      if (!charge) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Charge not found',
        });
      }

      return charge;
    }),

  // Void a charge
  void: billerProcedure
    .input(
      z.object({
        id: z.string(),
        reason: z.string().min(1, 'Void reason is required'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, reason } = input;

      const existing = await ctx.prisma.charge.findFirst({
        where: {
          id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          paymentAllocations: true,
          claimLines: {
            include: { claim: true },
          },
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Charge not found',
        });
      }

      if (existing.status === ChargeStatus.VOID) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Charge is already voided',
        });
      }

      // Check for payments
      if (existing.paymentAllocations.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot void a charge with payments applied. Unapply payments first.',
        });
      }

      // Check for active claims
      const activeClaims = existing.claimLines.filter(
        (cl) => !['PAID', 'DENIED', 'VOID'].includes(cl.claim.status)
      );
      if (activeClaims.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot void a charge with active claims',
        });
      }

      const charge = await ctx.prisma.charge.update({
        where: { id },
        data: {
          status: ChargeStatus.VOID,
          voidReason: reason,
          voidedAt: new Date(),
          voidedBy: ctx.user.id,
          balance: 0,
        },
      });

      await auditLog('CHARGE_VOID', 'Charge', {
        entityId: id,
        changes: { reason, previousStatus: existing.status },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return charge;
    }),

  // Get unbilled charges for billing dashboard
  getUnbilled: billerProcedure
    .input(
      z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        providerId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { startDate, endDate, providerId } = input;

      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
        status: ChargeStatus.PENDING,
      };

      if (providerId) where.providerId = providerId;

      if (startDate || endDate) {
        where.serviceDate = {};
        if (startDate) (where.serviceDate as Record<string, Date>).gte = startDate;
        if (endDate) (where.serviceDate as Record<string, Date>).lte = endDate;
      }

      const charges = await ctx.prisma.charge.findMany({
        where,
        include: {
          patient: {
            include: { demographics: true },
          },
          encounter: true,
        },
        orderBy: { serviceDate: 'asc' },
      });

      // Group by patient
      const byPatient = charges.reduce(
        (acc, charge) => {
          const key = charge.patientId;
          if (!acc[key]) {
            acc[key] = {
              patient: charge.patient,
              charges: [],
              total: 0,
            };
          }
          acc[key].charges.push(charge);
          acc[key].total += Number(charge.fee) * charge.units;
          return acc;
        },
        {} as Record<string, { patient: typeof charges[0]['patient']; charges: typeof charges; total: number }>
      );

      return {
        total: charges.length,
        totalAmount: charges.reduce((sum, c) => sum + Number(c.fee) * c.units, 0),
        byPatient: Object.values(byPatient),
      };
    }),

  // Apply adjustment to charge
  adjust: billerProcedure
    .input(
      z.object({
        id: z.string(),
        adjustmentAmount: z.number(),
        reason: z.string().min(1, 'Adjustment reason is required'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, adjustmentAmount, reason } = input;

      const existing = await ctx.prisma.charge.findFirst({
        where: {
          id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Charge not found',
        });
      }

      if (existing.status === ChargeStatus.VOID) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot adjust a voided charge',
        });
      }

      const newAdjustments = Number(existing.adjustments) + adjustmentAmount;
      const newBalance = Number(existing.fee) * existing.units - Number(existing.payments) - newAdjustments;

      const charge = await ctx.prisma.charge.update({
        where: { id },
        data: {
          adjustments: newAdjustments,
          balance: Math.max(0, newBalance),
          status: newBalance <= 0 ? ChargeStatus.ADJUSTED : existing.status,
          internalNotes: existing.internalNotes
            ? `${existing.internalNotes}\n${new Date().toISOString()}: Adjustment $${adjustmentAmount} - ${reason}`
            : `${new Date().toISOString()}: Adjustment $${adjustmentAmount} - ${reason}`,
        },
      });

      await auditLog('CHARGE_ADJUST', 'Charge', {
        entityId: id,
        changes: { adjustmentAmount, reason, newBalance },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return charge;
    }),
});
