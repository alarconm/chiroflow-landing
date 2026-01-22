import { z } from 'zod';
import { router, protectedProcedure, providerProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

// Validation schemas
const diagramTypeSchema = z.enum(['body_front', 'body_back', 'spine', 'cervical', 'thoracic', 'lumbar', 'hand_left', 'hand_right', 'foot_left', 'foot_right']);

const markingTypeSchema = z.enum(['pain', 'tenderness', 'subluxation', 'adjustment', 'inflammation', 'spasm', 'numbness', 'radiculopathy']);

const markingSchema = z.object({
  id: z.string(),
  x: z.number().min(0).max(100), // Percentage coordinates
  y: z.number().min(0).max(100),
  type: markingTypeSchema,
  label: z.string().optional(),
  intensity: z.number().min(1).max(10).optional(), // Pain intensity
  color: z.string().optional(), // Override color
  notes: z.string().optional(),
});

export const bodyDiagramRouter = router({
  // Create or update body diagram for an encounter
  save: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        diagramType: diagramTypeSchema,
        markings: z.array(markingSchema),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { encounterId, diagramType, markings, notes } = input;

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
          message: 'Cannot modify diagrams on a signed encounter',
        });
      }

      // Check if diagram already exists for this encounter and type
      const existing = await ctx.prisma.bodyDiagram.findFirst({
        where: { encounterId, diagramType },
      });

      if (existing) {
        // Update existing
        return ctx.prisma.bodyDiagram.update({
          where: { id: existing.id },
          data: { markings, notes },
        });
      }

      // Create new
      return ctx.prisma.bodyDiagram.create({
        data: {
          encounterId,
          diagramType,
          markings,
          notes,
        },
      });
    }),

  // Get a specific diagram
  get: protectedProcedure
    .input(
      z.object({
        encounterId: z.string(),
        diagramType: diagramTypeSchema,
      })
    )
    .query(async ({ ctx, input }) => {
      const { encounterId, diagramType } = input;

      // Verify encounter belongs to org
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

      const diagram = await ctx.prisma.bodyDiagram.findFirst({
        where: { encounterId, diagramType },
      });

      return diagram;
    }),

  // Get all diagrams for an encounter
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

      return ctx.prisma.bodyDiagram.findMany({
        where: { encounterId: input.encounterId },
        orderBy: { createdAt: 'asc' },
      });
    }),

  // Get patient's previous diagram markings (for comparison)
  getPreviousMarkings: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        diagramType: diagramTypeSchema,
        currentEncounterId: z.string().optional(), // Exclude current encounter
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, diagramType, currentEncounterId } = input;

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

      // Get the most recent diagram of this type for the patient
      const diagram = await ctx.prisma.bodyDiagram.findFirst({
        where: {
          diagramType,
          encounter: {
            patientId,
            organizationId: ctx.user.organizationId,
            ...(currentEncounterId ? { id: { not: currentEncounterId } } : {}),
          },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          encounter: {
            select: {
              id: true,
              encounterDate: true,
            },
          },
        },
      });

      return diagram;
    }),

  // Copy markings from previous encounter
  copyFromEncounter: providerProcedure
    .input(
      z.object({
        sourceEncounterId: z.string(),
        targetEncounterId: z.string(),
        diagramTypes: z.array(diagramTypeSchema).optional(), // If not provided, copy all
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { sourceEncounterId, targetEncounterId, diagramTypes } = input;

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
          message: 'Cannot modify diagrams on a signed encounter',
        });
      }

      // Get diagrams to copy
      const where: Record<string, unknown> = { encounterId: sourceEncounterId };
      if (diagramTypes?.length) {
        where.diagramType = { in: diagramTypes };
      }

      const sourceDiagrams = await ctx.prisma.bodyDiagram.findMany({ where });

      if (sourceDiagrams.length === 0) {
        return { copied: 0 };
      }

      // Create copies (or update if already exists)
      let copied = 0;
      for (const diagram of sourceDiagrams) {
        const existing = await ctx.prisma.bodyDiagram.findFirst({
          where: {
            encounterId: targetEncounterId,
            diagramType: diagram.diagramType,
          },
        });

        if (existing) {
          await ctx.prisma.bodyDiagram.update({
            where: { id: existing.id },
            data: {
              markings: diagram.markings as object,
              notes: diagram.notes,
            },
          });
        } else {
          await ctx.prisma.bodyDiagram.create({
            data: {
              encounterId: targetEncounterId,
              diagramType: diagram.diagramType,
              markings: diagram.markings as object,
              notes: diagram.notes,
            },
          });
        }
        copied++;
      }

      return { copied };
    }),

  // Delete a diagram
  delete: providerProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.bodyDiagram.findFirst({
        where: {
          id: input.id,
          encounter: { organizationId: ctx.user.organizationId },
        },
        include: { encounter: true },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Diagram not found',
        });
      }

      if (existing.encounter.status === 'SIGNED' || existing.encounter.status === 'AMENDED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot delete diagrams from a signed encounter',
        });
      }

      await ctx.prisma.bodyDiagram.delete({ where: { id: input.id } });

      return { success: true };
    }),

  // Get available diagram types with metadata
  getDiagramTypes: protectedProcedure.query(() => {
    return [
      {
        type: 'body_front',
        name: 'Body (Anterior)',
        description: 'Front view of full body',
        width: 300,
        height: 600,
      },
      {
        type: 'body_back',
        name: 'Body (Posterior)',
        description: 'Back view of full body',
        width: 300,
        height: 600,
      },
      {
        type: 'spine',
        name: 'Full Spine',
        description: 'Complete spinal column view',
        width: 200,
        height: 600,
      },
      {
        type: 'cervical',
        name: 'Cervical Spine',
        description: 'C1-C7 vertebrae detail',
        width: 200,
        height: 250,
      },
      {
        type: 'thoracic',
        name: 'Thoracic Spine',
        description: 'T1-T12 vertebrae detail',
        width: 200,
        height: 350,
      },
      {
        type: 'lumbar',
        name: 'Lumbar Spine',
        description: 'L1-L5 and sacral detail',
        width: 200,
        height: 250,
      },
      {
        type: 'hand_left',
        name: 'Left Hand',
        description: 'Left hand/wrist detail',
        width: 200,
        height: 250,
      },
      {
        type: 'hand_right',
        name: 'Right Hand',
        description: 'Right hand/wrist detail',
        width: 200,
        height: 250,
      },
      {
        type: 'foot_left',
        name: 'Left Foot',
        description: 'Left foot/ankle detail',
        width: 200,
        height: 250,
      },
      {
        type: 'foot_right',
        name: 'Right Foot',
        description: 'Right foot/ankle detail',
        width: 200,
        height: 250,
      },
    ];
  }),

  // Get marking types with colors
  getMarkingTypes: protectedProcedure.query(() => {
    return [
      { type: 'pain', name: 'Pain', color: '#ef4444', icon: 'flame' },
      { type: 'tenderness', name: 'Tenderness', color: '#f97316', icon: 'hand' },
      { type: 'subluxation', name: 'Subluxation', color: '#8b5cf6', icon: 'circle-x' },
      { type: 'adjustment', name: 'Adjustment', color: '#22c55e', icon: 'check-circle' },
      { type: 'inflammation', name: 'Inflammation', color: '#f59e0b', icon: 'flame' },
      { type: 'spasm', name: 'Muscle Spasm', color: '#ec4899', icon: 'zap' },
      { type: 'numbness', name: 'Numbness/Tingling', color: '#6366f1', icon: 'circle-dot' },
      { type: 'radiculopathy', name: 'Radiculopathy', color: '#14b8a6', icon: 'arrow-down' },
    ];
  }),

  // Get markings summary for patient (across all encounters)
  getPatientSummary: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        diagramType: diagramTypeSchema.optional(),
        limit: z.number().min(1).max(20).default(5),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, diagramType, limit } = input;

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

      if (diagramType) {
        where.diagramType = diagramType;
      }

      const diagrams = await ctx.prisma.bodyDiagram.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          encounter: {
            select: {
              id: true,
              encounterDate: true,
            },
          },
        },
      });

      return diagrams;
    }),
});
