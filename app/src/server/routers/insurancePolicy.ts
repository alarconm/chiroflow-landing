import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import { InsuranceType, SubscriberRelationship } from '@prisma/client';

export const insurancePolicyRouter = router({
  // Add insurance policy to patient
  create: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        type: z.nativeEnum(InsuranceType).default(InsuranceType.PRIMARY),
        payerName: z.string().min(1, 'Payer name is required'),
        payerId: z.string().optional(),
        planName: z.string().optional(),
        planType: z.string().optional(),
        policyNumber: z.string().min(1, 'Policy number is required'),
        groupNumber: z.string().optional(),
        subscriberRelationship: z.nativeEnum(SubscriberRelationship).default(SubscriberRelationship.SELF),
        subscriberId: z.string().optional(),
        subscriberFirstName: z.string().optional(),
        subscriberLastName: z.string().optional(),
        subscriberDob: z.date().optional(),
        effectiveDate: z.date().optional(),
        terminationDate: z.date().optional(),
        copay: z.number().optional(),
        deductible: z.number().optional(),
        deductibleMet: z.number().optional(),
        outOfPocketMax: z.number().optional(),
        outOfPocketMet: z.number().optional(),
        insurancePayerId: z.string().optional(), // Link to InsurancePayer if in system
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, ...policyData } = input;

      // Verify patient exists and belongs to org
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Check if patient already has this type of insurance
      const existingOfType = await ctx.prisma.patientInsurance.findFirst({
        where: {
          patientId,
          type: policyData.type,
          isActive: true,
        },
      });

      if (existingOfType) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Patient already has an active ${policyData.type} insurance`,
        });
      }

      const policy = await ctx.prisma.patientInsurance.create({
        data: {
          patientId,
          ...policyData,
        },
      });

      await auditLog('INSURANCE_CREATE', 'PatientInsurance', {
        entityId: policy.id,
        changes: { patientId, payerName: policyData.payerName, type: policyData.type },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return policy;
    }),

  // Update policy details
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        type: z.nativeEnum(InsuranceType).optional(),
        payerName: z.string().optional(),
        payerId: z.string().nullable().optional(),
        planName: z.string().nullable().optional(),
        planType: z.string().nullable().optional(),
        policyNumber: z.string().optional(),
        groupNumber: z.string().nullable().optional(),
        subscriberRelationship: z.nativeEnum(SubscriberRelationship).optional(),
        subscriberId: z.string().nullable().optional(),
        subscriberFirstName: z.string().nullable().optional(),
        subscriberLastName: z.string().nullable().optional(),
        subscriberDob: z.date().nullable().optional(),
        effectiveDate: z.date().nullable().optional(),
        terminationDate: z.date().nullable().optional(),
        copay: z.number().nullable().optional(),
        deductible: z.number().nullable().optional(),
        deductibleMet: z.number().nullable().optional(),
        outOfPocketMax: z.number().nullable().optional(),
        outOfPocketMet: z.number().nullable().optional(),
        insurancePayerId: z.string().nullable().optional(),
        isActive: z.boolean().optional(),
        verifiedAt: z.date().nullable().optional(),
        verifiedBy: z.string().nullable().optional(),
        verificationNotes: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      // Verify policy exists and patient belongs to org
      const existing = await ctx.prisma.patientInsurance.findFirst({
        where: {
          id,
          patient: { organizationId: ctx.user.organizationId },
        },
        include: { patient: true },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Insurance policy not found',
        });
      }

      // If changing type, check for conflicts
      if (updateData.type && updateData.type !== existing.type) {
        const existingOfType = await ctx.prisma.patientInsurance.findFirst({
          where: {
            patientId: existing.patientId,
            type: updateData.type,
            isActive: true,
            id: { not: id },
          },
        });

        if (existingOfType) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Patient already has an active ${updateData.type} insurance`,
          });
        }
      }

      const policy = await ctx.prisma.patientInsurance.update({
        where: { id },
        data: updateData,
      });

      await auditLog('INSURANCE_UPDATE', 'PatientInsurance', {
        entityId: id,
        changes: updateData,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return policy;
    }),

  // List patient's insurance policies
  list: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        includeInactive: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, includeInactive } = input;

      // Verify patient belongs to org
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const where: Record<string, unknown> = { patientId };
      if (!includeInactive) {
        where.isActive = true;
      }

      const policies = await ctx.prisma.patientInsurance.findMany({
        where,
        include: {
          insurancePayer: true,
        },
        orderBy: [{ type: 'asc' }, { createdAt: 'desc' }],
      });

      return policies;
    }),

  // Get policy with payer details
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const policy = await ctx.prisma.patientInsurance.findFirst({
        where: {
          id: input.id,
          patient: { organizationId: ctx.user.organizationId },
        },
        include: {
          patient: {
            include: {
              demographics: true,
            },
          },
          insurancePayer: true,
          claims: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      });

      if (!policy) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Insurance policy not found',
        });
      }

      return policy;
    }),

  // Remove policy from patient (soft delete)
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.patientInsurance.findFirst({
        where: {
          id: input.id,
          patient: { organizationId: ctx.user.organizationId },
        },
        include: {
          claims: {
            where: { status: { notIn: ['PAID', 'DENIED', 'VOID'] } },
          },
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Insurance policy not found',
        });
      }

      // Check for pending claims
      if (existing.claims.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot remove insurance with pending claims',
        });
      }

      const policy = await ctx.prisma.patientInsurance.update({
        where: { id: input.id },
        data: { isActive: false },
      });

      await auditLog('INSURANCE_DEACTIVATE', 'PatientInsurance', {
        entityId: input.id,
        changes: { isActive: false },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return policy;
    }),

  // Set primary/secondary order
  setPrimary: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        policyId: z.string(),
        type: z.nativeEnum(InsuranceType),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, policyId, type } = input;

      // Verify patient belongs to org
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Verify policy belongs to patient
      const policy = await ctx.prisma.patientInsurance.findFirst({
        where: {
          id: policyId,
          patientId,
          isActive: true,
        },
      });

      if (!policy) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Insurance policy not found',
        });
      }

      // If there's already a policy of this type, swap them
      const existingOfType = await ctx.prisma.patientInsurance.findFirst({
        where: {
          patientId,
          type,
          isActive: true,
          id: { not: policyId },
        },
      });

      // Transaction to swap types
      await ctx.prisma.$transaction(async (tx) => {
        if (existingOfType) {
          // Move existing to the old type of the policy we're promoting
          await tx.patientInsurance.update({
            where: { id: existingOfType.id },
            data: { type: policy.type },
          });
        }

        // Update the target policy to new type
        await tx.patientInsurance.update({
          where: { id: policyId },
          data: { type },
        });
      });

      await auditLog('INSURANCE_REORDER', 'PatientInsurance', {
        entityId: policyId,
        changes: { type, patientId },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // Verify insurance eligibility (mark as verified)
  verify: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        verificationNotes: z.string().optional(),
        copay: z.number().optional(),
        deductible: z.number().optional(),
        deductibleMet: z.number().optional(),
        outOfPocketMax: z.number().optional(),
        outOfPocketMet: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...verificationData } = input;

      const existing = await ctx.prisma.patientInsurance.findFirst({
        where: {
          id,
          patient: { organizationId: ctx.user.organizationId },
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Insurance policy not found',
        });
      }

      const policy = await ctx.prisma.patientInsurance.update({
        where: { id },
        data: {
          verifiedAt: new Date(),
          verifiedBy: ctx.user.id,
          ...verificationData,
        },
      });

      await auditLog('INSURANCE_VERIFY', 'PatientInsurance', {
        entityId: id,
        changes: verificationData,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return policy;
    }),

  // Get subscriber info (if relationship is not SELF)
  getSubscriberInfo: protectedProcedure
    .input(z.object({ policyId: z.string() }))
    .query(async ({ ctx, input }) => {
      const policy = await ctx.prisma.patientInsurance.findFirst({
        where: {
          id: input.policyId,
          patient: { organizationId: ctx.user.organizationId },
        },
        select: {
          subscriberRelationship: true,
          subscriberId: true,
          subscriberFirstName: true,
          subscriberLastName: true,
          subscriberDob: true,
          patient: {
            include: {
              demographics: true,
            },
          },
        },
      });

      if (!policy) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Insurance policy not found',
        });
      }

      // If self, return patient info
      if (policy.subscriberRelationship === 'SELF') {
        return {
          relationship: 'SELF',
          subscriberId: policy.subscriberId,
          firstName: policy.patient.demographics?.firstName || '',
          lastName: policy.patient.demographics?.lastName || '',
          dateOfBirth: policy.patient.demographics?.dateOfBirth,
        };
      }

      return {
        relationship: policy.subscriberRelationship,
        subscriberId: policy.subscriberId,
        firstName: policy.subscriberFirstName || '',
        lastName: policy.subscriberLastName || '',
        dateOfBirth: policy.subscriberDob,
      };
    }),
});
