import { z } from 'zod';
import { router, protectedProcedure, providerProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import type { Prisma } from '@prisma/client';

// Validation schemas
const diagnosisStatusSchema = z.enum(['ACTIVE', 'RESOLVED', 'CHRONIC', 'RECURRENT']);

export const diagnosisRouter = router({
  // Add diagnosis to an encounter
  add: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        icd10Code: z.string().min(1, 'ICD-10 code is required'),
        description: z.string().min(1, 'Description is required'),
        isPrimary: z.boolean().default(false),
        status: diagnosisStatusSchema.default('ACTIVE'),
        onsetDate: z.coerce.date().optional(),
        bodySite: z.string().optional(),
        laterality: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        encounterId,
        icd10Code,
        description,
        isPrimary,
        status,
        onsetDate,
        bodySite,
        laterality,
        notes,
      } = input;

      // Verify encounter exists and belongs to org
      const encounter = await ctx.prisma.encounter.findFirst({
        where: {
          id: encounterId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!encounter) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        });
      }

      if (encounter.status === 'SIGNED' || encounter.status === 'AMENDED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot add diagnosis to a signed encounter',
        });
      }

      // Get current highest sequence number
      const highestSeq = await ctx.prisma.diagnosis.findFirst({
        where: { encounterId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });

      const sequence = (highestSeq?.sequence ?? 0) + 1;

      // If this is primary, unset other primary diagnoses
      if (isPrimary) {
        await ctx.prisma.diagnosis.updateMany({
          where: { encounterId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      const diagnosis = await ctx.prisma.diagnosis.create({
        data: {
          encounterId,
          icd10Code: icd10Code.toUpperCase(),
          description,
          isPrimary,
          status,
          onsetDate,
          bodySite,
          laterality,
          notes,
          sequence,
        },
      });

      // Log diagnosis addition
      await auditLog('DIAGNOSIS_ADD', 'Diagnosis', {
        entityId: diagnosis.id,
        changes: { icd10Code, description, isPrimary, encounterId },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return diagnosis;
    }),

  // Update diagnosis
  update: providerProcedure
    .input(
      z.object({
        id: z.string(),
        icd10Code: z.string().optional(),
        description: z.string().optional(),
        isPrimary: z.boolean().optional(),
        status: diagnosisStatusSchema.optional(),
        onsetDate: z.coerce.date().nullable().optional(),
        resolvedDate: z.coerce.date().nullable().optional(),
        bodySite: z.string().nullable().optional(),
        laterality: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        sequence: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, isPrimary, ...updateData } = input;

      // Verify diagnosis exists and encounter belongs to org
      const existing = await ctx.prisma.diagnosis.findFirst({
        where: {
          id,
          encounter: { organizationId: ctx.user.organizationId },
        },
        include: { encounter: true },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Diagnosis not found',
        });
      }

      if (existing.encounter.status === 'SIGNED' || existing.encounter.status === 'AMENDED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot modify diagnosis on a signed encounter',
        });
      }

      // If setting this as primary, unset others
      if (isPrimary) {
        await ctx.prisma.diagnosis.updateMany({
          where: { encounterId: existing.encounterId, isPrimary: true, id: { not: id } },
          data: { isPrimary: false },
        });
      }

      const data: Record<string, unknown> = { ...updateData };
      if (isPrimary !== undefined) data.isPrimary = isPrimary;
      if (updateData.icd10Code) data.icd10Code = updateData.icd10Code.toUpperCase();

      const diagnosis = await ctx.prisma.diagnosis.update({
        where: { id },
        data,
      });

      // Log update
      await auditLog('DIAGNOSIS_UPDATE', 'Diagnosis', {
        entityId: id,
        changes: { isPrimary, ...updateData },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return diagnosis;
    }),

  // Remove diagnosis from encounter
  remove: providerProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.diagnosis.findFirst({
        where: {
          id: input.id,
          encounter: { organizationId: ctx.user.organizationId },
        },
        include: { encounter: true },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Diagnosis not found',
        });
      }

      if (existing.encounter.status === 'SIGNED' || existing.encounter.status === 'AMENDED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot remove diagnosis from a signed encounter',
        });
      }

      // Log before deletion
      await auditLog('DIAGNOSIS_REMOVE', 'Diagnosis', {
        entityId: input.id,
        changes: { icd10Code: existing.icd10Code, description: existing.description },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      await ctx.prisma.diagnosis.delete({ where: { id: input.id } });

      return { success: true };
    }),

  // List diagnoses for an encounter
  listByEncounter: protectedProcedure
    .input(z.object({ encounterId: z.string() }))
    .query(async ({ ctx, input }) => {
      const encounter = await ctx.prisma.encounter.findFirst({
        where: {
          id: input.encounterId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!encounter) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        });
      }

      return ctx.prisma.diagnosis.findMany({
        where: { encounterId: input.encounterId },
        orderBy: [{ isPrimary: 'desc' }, { sequence: 'asc' }],
      });
    }),

  // Search ICD-10 codes
  searchCodes: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { query, limit } = input;

      // Search in reference ICD-10 table
      const codes = await ctx.prisma.iCD10Code.findMany({
        where: {
          OR: [
            { code: { contains: query.toUpperCase(), mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
        orderBy: [
          // Prioritize exact code matches
          { code: 'asc' },
        ],
        take: limit,
      });

      return codes;
    }),

  // Get patient's diagnosis history
  getPatientHistory: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        status: diagnosisStatusSchema.optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, status, limit } = input;

      // Verify patient belongs to org
      const patient = await ctx.prisma.patient.findFirst({
        where: { id: patientId, organizationId: ctx.user.organizationId },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const where: Record<string, unknown> = {
        encounter: {
          patientId,
          organizationId: ctx.user.organizationId,
        },
      };

      if (status) {
        where.status = status;
      }

      const diagnoses = await ctx.prisma.diagnosis.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          encounter: {
            select: {
              id: true,
              encounterDate: true,
              encounterType: true,
              provider: {
                select: {
                  id: true,
                  user: {
                    select: {
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      // Group by ICD-10 code to show frequency
      const byCode = diagnoses.reduce(
        (acc, diag) => {
          if (!acc[diag.icd10Code]) {
            acc[diag.icd10Code] = {
              code: diag.icd10Code,
              description: diag.description,
              count: 0,
              firstSeen: diag.createdAt,
              lastSeen: diag.createdAt,
              currentStatus: diag.status,
            };
          }
          acc[diag.icd10Code].count++;
          if (diag.createdAt < acc[diag.icd10Code].firstSeen) {
            acc[diag.icd10Code].firstSeen = diag.createdAt;
          }
          if (diag.createdAt > acc[diag.icd10Code].lastSeen) {
            acc[diag.icd10Code].lastSeen = diag.createdAt;
            acc[diag.icd10Code].currentStatus = diag.status;
          }
          return acc;
        },
        {} as Record<string, { code: string; description: string; count: number; firstSeen: Date; lastSeen: Date; currentStatus: string }>
      );

      return {
        diagnoses,
        summary: Object.values(byCode).sort((a, b) => b.count - a.count),
      };
    }),

  // Reorder diagnoses (change sequence)
  reorder: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        orders: z.array(
          z.object({
            id: z.string(),
            sequence: z.number(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { encounterId, orders } = input;

      // Verify encounter exists and is not signed
      const encounter = await ctx.prisma.encounter.findFirst({
        where: {
          id: encounterId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!encounter) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        });
      }

      if (encounter.status === 'SIGNED' || encounter.status === 'AMENDED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot reorder diagnoses on a signed encounter',
        });
      }

      // Update sequences
      await ctx.prisma.$transaction(
        orders.map((order) =>
          ctx.prisma.diagnosis.update({
            where: { id: order.id },
            data: { sequence: order.sequence },
          })
        )
      );

      return { success: true };
    }),

  // Copy diagnoses from previous encounter
  copyFromEncounter: providerProcedure
    .input(
      z.object({
        sourceEncounterId: z.string(),
        targetEncounterId: z.string(),
        diagnosisIds: z.array(z.string()).optional(), // If not provided, copy all
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { sourceEncounterId, targetEncounterId, diagnosisIds } = input;

      // Verify both encounters exist and belong to org
      const [sourceEncounter, targetEncounter] = await Promise.all([
        ctx.prisma.encounter.findFirst({
          where: { id: sourceEncounterId, organizationId: ctx.user.organizationId },
        }),
        ctx.prisma.encounter.findFirst({
          where: { id: targetEncounterId, organizationId: ctx.user.organizationId },
        }),
      ]);

      if (!sourceEncounter) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Source encounter not found',
        });
      }

      if (!targetEncounter) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Target encounter not found',
        });
      }

      if (targetEncounter.status === 'SIGNED' || targetEncounter.status === 'AMENDED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot add diagnoses to a signed encounter',
        });
      }

      // Get diagnoses to copy
      const where: Record<string, unknown> = { encounterId: sourceEncounterId };
      if (diagnosisIds?.length) {
        where.id = { in: diagnosisIds };
      }

      const sourceDiagnoses = await ctx.prisma.diagnosis.findMany({
        where,
        orderBy: { sequence: 'asc' },
      });

      if (sourceDiagnoses.length === 0) {
        return { copied: 0 };
      }

      // Get current highest sequence in target
      const highestSeq = await ctx.prisma.diagnosis.findFirst({
        where: { encounterId: targetEncounterId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });

      let nextSeq = (highestSeq?.sequence ?? 0) + 1;

      // Create copies
      const created = await ctx.prisma.$transaction(
        sourceDiagnoses.map((diag) =>
          ctx.prisma.diagnosis.create({
            data: {
              encounterId: targetEncounterId,
              icd10Code: diag.icd10Code,
              description: diag.description,
              isPrimary: false, // Don't copy primary status
              status: diag.status,
              onsetDate: diag.onsetDate,
              bodySite: diag.bodySite,
              laterality: diag.laterality,
              notes: diag.notes,
              sequence: nextSeq++,
            },
          })
        )
      );

      return { copied: created.length };
    }),
});
