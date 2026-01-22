import { z } from 'zod';
import { router, protectedProcedure, providerProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';

export const procedureRouter = router({
  // Add procedure to an encounter
  add: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        cptCode: z.string().min(1, 'CPT code is required'),
        description: z.string().min(1, 'Description is required'),
        units: z.number().min(1).default(1),
        modifier1: z.string().optional(),
        modifier2: z.string().optional(),
        modifier3: z.string().optional(),
        modifier4: z.string().optional(),
        notes: z.string().optional(),
        chargeAmount: z.number().optional(),
        allowedAmount: z.number().optional(),
        renderingProviderId: z.string().optional(),
        diagnosisPointers: z.array(z.number()).optional(), // Diagnosis sequence numbers
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        encounterId,
        cptCode,
        description,
        units,
        modifier1,
        modifier2,
        modifier3,
        modifier4,
        notes,
        chargeAmount,
        allowedAmount,
        renderingProviderId,
        diagnosisPointers,
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
          message: 'Cannot add procedure to a signed encounter',
        });
      }

      const procedure = await ctx.prisma.procedure.create({
        data: {
          encounterId,
          cptCode: cptCode.toUpperCase(),
          description,
          units,
          modifier1,
          modifier2,
          modifier3,
          modifier4,
          notes,
          chargeAmount,
          allowedAmount,
          renderingProviderId,
          ...(diagnosisPointers ? { diagnosisPointers } : {}),
        },
      });

      // Log procedure addition
      await auditLog('PROCEDURE_ADD', 'Procedure', {
        entityId: procedure.id,
        changes: { cptCode, description, units, encounterId },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return procedure;
    }),

  // Update procedure
  update: providerProcedure
    .input(
      z.object({
        id: z.string(),
        cptCode: z.string().optional(),
        description: z.string().optional(),
        units: z.number().min(1).optional(),
        modifier1: z.string().nullable().optional(),
        modifier2: z.string().nullable().optional(),
        modifier3: z.string().nullable().optional(),
        modifier4: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        chargeAmount: z.number().nullable().optional(),
        allowedAmount: z.number().nullable().optional(),
        renderingProviderId: z.string().nullable().optional(),
        diagnosisPointers: z.array(z.number()).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      // Verify procedure exists and encounter belongs to org
      const existing = await ctx.prisma.procedure.findFirst({
        where: {
          id,
          encounter: { organizationId: ctx.user.organizationId },
        },
        include: { encounter: true },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Procedure not found',
        });
      }

      if (existing.encounter.status === 'SIGNED' || existing.encounter.status === 'AMENDED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot modify procedure on a signed encounter',
        });
      }

      const data: Record<string, unknown> = { ...updateData };
      if (updateData.cptCode) data.cptCode = updateData.cptCode.toUpperCase();

      const procedure = await ctx.prisma.procedure.update({
        where: { id },
        data,
      });

      // Log update
      await auditLog('PROCEDURE_UPDATE', 'Procedure', {
        entityId: id,
        changes: updateData,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return procedure;
    }),

  // Remove procedure from encounter
  remove: providerProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.procedure.findFirst({
        where: {
          id: input.id,
          encounter: { organizationId: ctx.user.organizationId },
        },
        include: { encounter: true },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Procedure not found',
        });
      }

      if (existing.encounter.status === 'SIGNED' || existing.encounter.status === 'AMENDED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot remove procedure from a signed encounter',
        });
      }

      // Log before deletion
      await auditLog('PROCEDURE_REMOVE', 'Procedure', {
        entityId: input.id,
        changes: { cptCode: existing.cptCode, description: existing.description },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      await ctx.prisma.procedure.delete({ where: { id: input.id } });

      return { success: true };
    }),

  // List procedures for an encounter
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

      return ctx.prisma.procedure.findMany({
        where: { encounterId: input.encounterId },
        orderBy: { createdAt: 'asc' },
      });
    }),

  // Search CPT codes
  searchCodes: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1),
        category: z.string().optional(),
        chiroOnly: z.boolean().default(false),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { query, category, chiroOnly, limit } = input;

      const where: Record<string, unknown> = {
        OR: [
          { code: { contains: query.toUpperCase(), mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { shortDesc: { contains: query, mode: 'insensitive' } },
        ],
      };

      if (category) {
        where.category = category;
      }

      if (chiroOnly) {
        where.isChiroCommon = true;
      }

      const codes = await ctx.prisma.cPTCode.findMany({
        where,
        orderBy: [{ code: 'asc' }],
        take: limit,
      });

      return codes;
    }),

  // Get organization's favorite codes
  getFavorites: protectedProcedure
    .input(
      z.object({
        codeType: z.enum(['icd10', 'cpt']),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.prisma.codeFavorite.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          codeType: input.codeType,
        },
        orderBy: { sortOrder: 'asc' },
      });
    }),

  // Add code to favorites
  addFavorite: adminProcedure
    .input(
      z.object({
        codeType: z.enum(['icd10', 'cpt']),
        code: z.string().min(1),
        description: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { codeType, code, description } = input;

      // Check if already exists
      const existing = await ctx.prisma.codeFavorite.findFirst({
        where: {
          organizationId: ctx.user.organizationId,
          codeType,
          code: code.toUpperCase(),
        },
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Code is already in favorites',
        });
      }

      // Get highest sort order
      const highestOrder = await ctx.prisma.codeFavorite.findFirst({
        where: {
          organizationId: ctx.user.organizationId,
          codeType,
        },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });

      const sortOrder = (highestOrder?.sortOrder ?? 0) + 1;

      const favorite = await ctx.prisma.codeFavorite.create({
        data: {
          organizationId: ctx.user.organizationId,
          codeType,
          code: code.toUpperCase(),
          description,
          sortOrder,
        },
      });

      return favorite;
    }),

  // Remove code from favorites
  removeFavorite: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.codeFavorite.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Favorite not found',
        });
      }

      await ctx.prisma.codeFavorite.delete({ where: { id: input.id } });

      return { success: true };
    }),

  // Reorder favorites
  reorderFavorites: adminProcedure
    .input(
      z.object({
        codeType: z.enum(['icd10', 'cpt']),
        orders: z.array(
          z.object({
            id: z.string(),
            sortOrder: z.number(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { codeType, orders } = input;

      // Verify all belong to org
      const favorites = await ctx.prisma.codeFavorite.findMany({
        where: {
          id: { in: orders.map((o) => o.id) },
          organizationId: ctx.user.organizationId,
          codeType,
        },
      });

      if (favorites.length !== orders.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Some favorites not found or do not belong to your organization',
        });
      }

      // Update all sort orders
      await ctx.prisma.$transaction(
        orders.map((order) =>
          ctx.prisma.codeFavorite.update({
            where: { id: order.id },
            data: { sortOrder: order.sortOrder },
          })
        )
      );

      return { success: true };
    }),

  // Get procedure statistics for an encounter (for billing summary)
  getEncounterSummary: protectedProcedure
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

      const procedures = await ctx.prisma.procedure.findMany({
        where: { encounterId: input.encounterId },
      });

      const totalCharges = procedures.reduce(
        (sum, p) => sum + (p.chargeAmount ? Number(p.chargeAmount) * p.units : 0),
        0
      );

      const totalAllowed = procedures.reduce(
        (sum, p) => sum + (p.allowedAmount ? Number(p.allowedAmount) * p.units : 0),
        0
      );

      return {
        procedureCount: procedures.length,
        totalUnits: procedures.reduce((sum, p) => sum + p.units, 0),
        totalCharges,
        totalAllowed,
        procedures: procedures.map((p) => ({
          cptCode: p.cptCode,
          description: p.description,
          units: p.units,
          chargeAmount: p.chargeAmount,
          modifiers: [p.modifier1, p.modifier2, p.modifier3, p.modifier4].filter(Boolean),
        })),
      };
    }),

  // Copy procedures from previous encounter
  copyFromEncounter: providerProcedure
    .input(
      z.object({
        sourceEncounterId: z.string(),
        targetEncounterId: z.string(),
        procedureIds: z.array(z.string()).optional(), // If not provided, copy all
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { sourceEncounterId, targetEncounterId, procedureIds } = input;

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
          message: 'Cannot add procedures to a signed encounter',
        });
      }

      // Get procedures to copy
      const where: Record<string, unknown> = { encounterId: sourceEncounterId };
      if (procedureIds?.length) {
        where.id = { in: procedureIds };
      }

      const sourceProcedures = await ctx.prisma.procedure.findMany({
        where,
        orderBy: { createdAt: 'asc' },
      });

      if (sourceProcedures.length === 0) {
        return { copied: 0 };
      }

      // Create copies (don't copy diagnosisPointers as they may be different)
      const created = await ctx.prisma.$transaction(
        sourceProcedures.map((proc) =>
          ctx.prisma.procedure.create({
            data: {
              encounterId: targetEncounterId,
              cptCode: proc.cptCode,
              description: proc.description,
              units: proc.units,
              modifier1: proc.modifier1,
              modifier2: proc.modifier2,
              modifier3: proc.modifier3,
              modifier4: proc.modifier4,
              notes: proc.notes,
              chargeAmount: proc.chargeAmount,
              allowedAmount: proc.allowedAmount,
            },
          })
        )
      );

      return { copied: created.length };
    }),

  // Get commonly used procedures for this org
  getCommonProcedures: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(20).default(10) }))
    .query(async ({ ctx, input }) => {
      // Get procedures from recent encounters
      const recentProcedures = await ctx.prisma.procedure.findMany({
        where: {
          encounter: { organizationId: ctx.user.organizationId },
        },
        orderBy: { createdAt: 'desc' },
        take: 500, // Look at last 500 procedures
      });

      // Count frequency of each code
      const codeCounts = recentProcedures.reduce(
        (acc, proc) => {
          const key = proc.cptCode;
          if (!acc[key]) {
            acc[key] = { code: proc.cptCode, description: proc.description, count: 0 };
          }
          acc[key].count++;
          return acc;
        },
        {} as Record<string, { code: string; description: string; count: number }>
      );

      // Sort by frequency and return top N
      return Object.values(codeCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, input.limit);
    }),
});
