import { z } from 'zod';
import { router, protectedProcedure, providerProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import { SpinalRegion, AdjustmentResponse } from '@prisma/client';

// Validation schemas
const spinalRegionSchema = z.enum(['CERVICAL', 'THORACIC', 'LUMBAR', 'SACRAL', 'PELVIS']);
const adjustmentResponseSchema = z.enum(['EXCELLENT', 'GOOD', 'FAIR', 'GUARDED', 'POOR']);
const forceSchema = z.enum(['LIGHT', 'MODERATE', 'FIRM']);
const positionSchema = z.enum(['PRONE', 'SUPINE', 'SIDE_LYING', 'SEATED', 'STANDING']);

// Helper to determine region from vertebra
function getRegionFromVertebra(vertebra: string): SpinalRegion {
  const upper = vertebra.toUpperCase();
  if (upper.startsWith('C') && /^C[1-7]$/i.test(upper)) return 'CERVICAL';
  if (upper.startsWith('T') && /^T([1-9]|1[0-2])$/i.test(upper)) return 'THORACIC';
  if (upper.startsWith('L') && /^L[1-5]$/i.test(upper)) return 'LUMBAR';
  if (upper === 'SACRUM' || upper.startsWith('S') && /^S[1-5]$/i.test(upper)) return 'SACRAL';
  if (['ILIUM', 'ISCHIUM', 'PUBIS', 'COCCYX', 'PELVIS', 'SI', 'LEFT ILIUM', 'RIGHT ILIUM'].includes(upper)) return 'PELVIS';
  if (upper.includes('SACR')) return 'SACRAL';
  if (upper.includes('PELV') || upper.includes('ILI')) return 'PELVIS';
  return 'LUMBAR'; // Default fallback
}

// Response info for display
const RESPONSE_INFO = [
  { value: 'EXCELLENT', label: 'Excellent', color: '#22c55e', description: 'Cavitation with immediate relief' },
  { value: 'GOOD', label: 'Good', color: '#84cc16', description: 'Partial correction, positive response' },
  { value: 'FAIR', label: 'Fair', color: '#f59e0b', description: 'Minimal response' },
  { value: 'GUARDED', label: 'Guarded', color: '#f97316', description: 'Muscle guarding present' },
  { value: 'POOR', label: 'Poor', color: '#ef4444', description: 'No correction achieved' },
];

// Common adjustment pattern templates
const ADJUSTMENT_TEMPLATES = [
  {
    id: 'full-spine-diversified',
    name: 'Full Spine - Diversified',
    description: 'Standard full spine adjustment using Diversified technique',
    segments: ['C1', 'C2', 'C5', 'T4', 'T8', 'L3', 'L5', 'SACRUM'],
    technique: 'Diversified',
    force: 'MODERATE',
    position: 'PRONE',
  },
  {
    id: 'cervical-focus',
    name: 'Cervical Focus',
    description: 'Upper cervical and mid-cervical adjustment',
    segments: ['C1', 'C2', 'C3', 'C5', 'C6', 'C7'],
    technique: 'Diversified',
    force: 'MODERATE',
    position: 'SUPINE',
  },
  {
    id: 'low-back-pelvis',
    name: 'Low Back & Pelvis',
    description: 'Lumbar spine and pelvic adjustment',
    segments: ['L3', 'L4', 'L5', 'SACRUM', 'LEFT ILIUM', 'RIGHT ILIUM'],
    technique: 'Thompson Drop',
    force: 'MODERATE',
    position: 'PRONE',
  },
  {
    id: 'activator-full',
    name: 'Activator Full Spine',
    description: 'Low-force full spine using Activator instrument',
    segments: ['C1', 'C2', 'C5', 'T4', 'T8', 'T12', 'L3', 'L5', 'SACRUM'],
    technique: 'Activator Methods',
    force: 'LIGHT',
    position: 'PRONE',
  },
  {
    id: 'cox-flexion-lumbar',
    name: 'Cox Flexion - Lumbar',
    description: 'Flexion-distraction for lumbar disc issues',
    segments: ['L3', 'L4', 'L5'],
    technique: 'Cox Flexion-Distraction',
    force: 'LIGHT',
    position: 'PRONE',
  },
  {
    id: 'thoracic-focus',
    name: 'Thoracic Focus',
    description: 'Mid and lower thoracic adjustment',
    segments: ['T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9'],
    technique: 'Diversified',
    force: 'MODERATE',
    position: 'PRONE',
  },
  {
    id: 'upper-cervical',
    name: 'Upper Cervical Only',
    description: 'Atlas and Axis specific adjustment',
    segments: ['C1', 'C2'],
    technique: 'Toggle Recoil',
    force: 'LIGHT',
    position: 'SIDE_LYING',
  },
  {
    id: 'sot-category-2',
    name: 'SOT Category II',
    description: 'SOT block placement for category II pelvis',
    segments: ['SACRUM', 'LEFT ILIUM', 'RIGHT ILIUM'],
    technique: 'Sacro-Occipital Technique (SOT)',
    force: 'LIGHT',
    position: 'PRONE',
  },
];

export const adjustmentRouter = router({
  // Create/record an adjustment with technique, segment, response
  create: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        vertebra: z.string().min(1, 'Vertebra/segment is required'),
        techniqueId: z.string().optional(),
        techniqueNotes: z.string().optional(),
        force: forceSchema.optional(),
        direction: z.string().optional(),
        position: positionSchema.optional(),
        // Pre-adjustment findings
        preLegLength: z.string().optional(),
        preROM: z.string().optional(),
        prePain: z.number().min(0).max(10).optional(),
        // Post-adjustment findings
        postLegLength: z.string().optional(),
        postROM: z.string().optional(),
        postPain: z.number().min(0).max(10).optional(),
        // Patient response
        response: adjustmentResponseSchema.default('GOOD'),
        cavitation: z.boolean().default(false),
        muscleGuarding: z.boolean().default(false),
        immediateRelief: z.boolean().default(false),
        responseNotes: z.string().optional(),
        // Optional link to subluxation
        subluxationId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        encounterId,
        vertebra,
        techniqueId,
        techniqueNotes,
        force,
        direction,
        position,
        preLegLength,
        preROM,
        prePain,
        postLegLength,
        postROM,
        postPain,
        response,
        cavitation,
        muscleGuarding,
        immediateRelief,
        responseNotes,
        subluxationId,
      } = input;

      // Verify encounter belongs to org
      const encounter = await ctx.prisma.encounter.findFirst({
        where: {
          id: encounterId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: true,
        },
      });

      if (!encounter) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        });
      }

      // Can't add adjustments to signed encounters
      if (encounter.status === 'SIGNED' || encounter.status === 'AMENDED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot add adjustments to a signed encounter',
        });
      }

      // Verify technique if provided
      if (techniqueId) {
        const technique = await ctx.prisma.technique.findFirst({
          where: {
            id: techniqueId,
            isActive: true,
            OR: [
              { isSystem: true },
              { organizationId: ctx.user.organizationId },
            ],
          },
        });

        if (!technique) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Technique not found or not available',
          });
        }
      }

      // Verify subluxation if provided
      if (subluxationId) {
        const subluxation = await ctx.prisma.subluxation.findFirst({
          where: {
            id: subluxationId,
            organizationId: ctx.user.organizationId,
            patientId: encounter.patientId,
          },
        });

        if (!subluxation) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Subluxation not found or does not belong to this patient',
          });
        }
      }

      // Determine region from vertebra
      const region = getRegionFromVertebra(vertebra);

      const adjustment = await ctx.prisma.adjustment.create({
        data: {
          vertebra: vertebra.toUpperCase(),
          region,
          techniqueId,
          techniqueNotes,
          force,
          direction,
          position,
          preLegLength,
          preROM,
          prePain,
          postLegLength,
          postROM,
          postPain,
          response,
          cavitation,
          muscleGuarding,
          immediateRelief,
          responseNotes,
          subluxationId,
          encounterId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          technique: {
            select: {
              id: true,
              name: true,
              category: true,
            },
          },
          subluxation: {
            select: {
              id: true,
              vertebra: true,
              listing: true,
              severity: true,
            },
          },
        },
      });

      await auditLog('CREATE', 'Adjustment', {
        entityId: adjustment.id,
        changes: { vertebra, techniqueId, response },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        ...adjustment,
        responseInfo: RESPONSE_INFO.find((r) => r.value === response),
      };
    }),

  // Update an adjustment
  update: providerProcedure
    .input(
      z.object({
        id: z.string(),
        techniqueId: z.string().optional(),
        techniqueNotes: z.string().nullable().optional(),
        force: forceSchema.nullable().optional(),
        direction: z.string().nullable().optional(),
        position: positionSchema.nullable().optional(),
        preLegLength: z.string().nullable().optional(),
        preROM: z.string().nullable().optional(),
        prePain: z.number().min(0).max(10).nullable().optional(),
        postLegLength: z.string().nullable().optional(),
        postROM: z.string().nullable().optional(),
        postPain: z.number().min(0).max(10).nullable().optional(),
        response: adjustmentResponseSchema.optional(),
        cavitation: z.boolean().optional(),
        muscleGuarding: z.boolean().optional(),
        immediateRelief: z.boolean().optional(),
        responseNotes: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      const existing = await ctx.prisma.adjustment.findFirst({
        where: {
          id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          encounter: true,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Adjustment not found',
        });
      }

      if (existing.encounter.status === 'SIGNED' || existing.encounter.status === 'AMENDED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot modify adjustments in a signed encounter',
        });
      }

      // Verify new technique if provided
      if (updateData.techniqueId) {
        const technique = await ctx.prisma.technique.findFirst({
          where: {
            id: updateData.techniqueId,
            isActive: true,
            OR: [
              { isSystem: true },
              { organizationId: ctx.user.organizationId },
            ],
          },
        });

        if (!technique) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Technique not found or not available',
          });
        }
      }

      const adjustment = await ctx.prisma.adjustment.update({
        where: { id },
        data: updateData,
        include: {
          technique: {
            select: {
              id: true,
              name: true,
              category: true,
            },
          },
          subluxation: {
            select: {
              id: true,
              vertebra: true,
              listing: true,
              severity: true,
            },
          },
        },
      });

      await auditLog('UPDATE', 'Adjustment', {
        entityId: id,
        changes: updateData,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        ...adjustment,
        responseInfo: RESPONSE_INFO.find((r) => r.value === adjustment.response),
      };
    }),

  // List adjustments by encounter
  list: protectedProcedure
    .input(
      z.object({
        encounterId: z.string(),
        region: spinalRegionSchema.optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { encounterId, region, limit, offset } = input;

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

      const where: Record<string, unknown> = {
        encounterId,
        organizationId: ctx.user.organizationId,
      };

      if (region) {
        where.region = region;
      }

      const [adjustments, total] = await Promise.all([
        ctx.prisma.adjustment.findMany({
          where,
          orderBy: [{ region: 'asc' }, { vertebra: 'asc' }, { createdAt: 'asc' }],
          take: limit,
          skip: offset,
          include: {
            technique: {
              select: {
                id: true,
                name: true,
                category: true,
              },
            },
            subluxation: {
              select: {
                id: true,
                vertebra: true,
                listing: true,
                severity: true,
              },
            },
          },
        }),
        ctx.prisma.adjustment.count({ where }),
      ]);

      // Group by region
      type AdjustmentWithExtras = (typeof adjustments)[0] & {
        responseInfo: typeof RESPONSE_INFO[0] | undefined;
      };
      const byRegion = adjustments.reduce(
        (acc, adj) => {
          if (!acc[adj.region]) {
            acc[adj.region] = [];
          }
          acc[adj.region].push({
            ...adj,
            responseInfo: RESPONSE_INFO.find((r) => r.value === adj.response),
          } as AdjustmentWithExtras);
          return acc;
        },
        {} as Record<SpinalRegion, AdjustmentWithExtras[]>
      );

      return {
        adjustments: adjustments.map((a) => ({
          ...a,
          responseInfo: RESPONSE_INFO.find((r) => r.value === a.response),
        })),
        byRegion,
        total,
        limit,
        offset,
        hasMore: offset + adjustments.length < total,
      };
    }),

  // Get single adjustment details
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const adjustment = await ctx.prisma.adjustment.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          technique: true,
          subluxation: {
            include: {
              encounter: {
                select: { encounterDate: true },
              },
            },
          },
          encounter: {
            select: {
              id: true,
              encounterDate: true,
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
              patient: {
                select: {
                  id: true,
                  demographics: {
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

      if (!adjustment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Adjustment not found',
        });
      }

      return {
        ...adjustment,
        responseInfo: RESPONSE_INFO.find((r) => r.value === adjustment.response),
      };
    }),

  // Get all adjustments for a patient (history)
  getPatientHistory: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        region: spinalRegionSchema.optional(),
        vertebra: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        limit: z.number().min(1).max(200).default(100),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, region, vertebra, startDate, endDate, limit, offset } = input;

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
        organizationId: ctx.user.organizationId,
        encounter: {
          patientId,
        },
      };

      if (region) {
        where.region = region;
      }

      if (vertebra) {
        where.vertebra = { equals: vertebra.toUpperCase(), mode: 'insensitive' };
      }

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) {
          (where.createdAt as Record<string, Date>).gte = startDate;
        }
        if (endDate) {
          (where.createdAt as Record<string, Date>).lte = endDate;
        }
      }

      const [adjustments, total] = await Promise.all([
        ctx.prisma.adjustment.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
          include: {
            technique: {
              select: {
                id: true,
                name: true,
                category: true,
              },
            },
            encounter: {
              select: {
                id: true,
                encounterDate: true,
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
            subluxation: {
              select: {
                id: true,
                vertebra: true,
                listing: true,
                severity: true,
              },
            },
          },
        }),
        ctx.prisma.adjustment.count({ where }),
      ]);

      return {
        adjustments: adjustments.map((a) => ({
          ...a,
          responseInfo: RESPONSE_INFO.find((r) => r.value === a.response),
        })),
        total,
        limit,
        offset,
        hasMore: offset + adjustments.length < total,
      };
    }),

  // Get adjustment count by segment over time
  getSegmentStats: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, startDate, endDate } = input;

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

      const dateFilter: Record<string, Date> = {};
      if (startDate) dateFilter.gte = startDate;
      if (endDate) dateFilter.lte = endDate;

      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
        encounter: { patientId },
        ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
      };

      // Get all adjustments for grouping
      const adjustments = await ctx.prisma.adjustment.findMany({
        where,
        select: {
          vertebra: true,
          region: true,
          response: true,
          techniqueId: true,
          createdAt: true,
        },
      });

      // Group by vertebra
      const byVertebra = adjustments.reduce(
        (acc, adj) => {
          if (!acc[adj.vertebra]) {
            acc[adj.vertebra] = {
              vertebra: adj.vertebra,
              region: adj.region,
              count: 0,
              responses: {} as Record<AdjustmentResponse, number>,
            };
          }
          acc[adj.vertebra].count++;
          acc[adj.vertebra].responses[adj.response] = (acc[adj.vertebra].responses[adj.response] || 0) + 1;
          return acc;
        },
        {} as Record<string, { vertebra: string; region: SpinalRegion; count: number; responses: Record<AdjustmentResponse, number> }>
      );

      // Group by region
      const byRegion = adjustments.reduce(
        (acc, adj) => {
          if (!acc[adj.region]) {
            acc[adj.region] = { count: 0, responses: {} as Record<AdjustmentResponse, number> };
          }
          acc[adj.region].count++;
          acc[adj.region].responses[adj.response] = (acc[adj.region].responses[adj.response] || 0) + 1;
          return acc;
        },
        {} as Record<SpinalRegion, { count: number; responses: Record<AdjustmentResponse, number> }>
      );

      // Group by technique
      const techniqueIds = [...new Set(adjustments.filter((a) => a.techniqueId).map((a) => a.techniqueId as string))];
      const techniques = techniqueIds.length > 0
        ? await ctx.prisma.technique.findMany({
            where: { id: { in: techniqueIds } },
            select: { id: true, name: true, category: true },
          })
        : [];

      const byTechnique = adjustments.reduce(
        (acc, adj) => {
          if (!adj.techniqueId) return acc;
          if (!acc[adj.techniqueId]) {
            const tech = techniques.find((t) => t.id === adj.techniqueId);
            acc[adj.techniqueId] = {
              techniqueId: adj.techniqueId,
              name: tech?.name || 'Unknown',
              category: tech?.category,
              count: 0,
            };
          }
          acc[adj.techniqueId].count++;
          return acc;
        },
        {} as Record<string, { techniqueId: string; name: string; category?: string; count: number }>
      );

      // Monthly trend
      const monthlyTrend = adjustments.reduce(
        (acc, adj) => {
          const month = adj.createdAt.toISOString().substring(0, 7); // YYYY-MM
          if (!acc[month]) {
            acc[month] = 0;
          }
          acc[month]++;
          return acc;
        },
        {} as Record<string, number>
      );

      return {
        totalAdjustments: adjustments.length,
        byVertebra: Object.values(byVertebra).sort((a, b) => b.count - a.count),
        byRegion,
        byTechnique: Object.values(byTechnique).sort((a, b) => b.count - a.count),
        monthlyTrend: Object.entries(monthlyTrend)
          .map(([month, count]) => ({ month, count }))
          .sort((a, b) => a.month.localeCompare(b.month)),
        responseDistribution: adjustments.reduce(
          (acc, adj) => {
            acc[adj.response] = (acc[adj.response] || 0) + 1;
            return acc;
          },
          {} as Record<AdjustmentResponse, number>
        ),
      };
    }),

  // Delete adjustment
  delete: providerProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const adjustment = await ctx.prisma.adjustment.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          encounter: true,
        },
      });

      if (!adjustment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Adjustment not found',
        });
      }

      if (adjustment.encounter.status === 'SIGNED' || adjustment.encounter.status === 'AMENDED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot delete adjustments from a signed encounter',
        });
      }

      await auditLog('DELETE', 'Adjustment', {
        entityId: input.id,
        changes: { vertebra: adjustment.vertebra, response: adjustment.response },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      await ctx.prisma.adjustment.delete({ where: { id: input.id } });

      return { success: true };
    }),

  // Get response scale info
  getResponseScale: protectedProcedure.query(() => {
    return RESPONSE_INFO;
  }),

  // Get force options
  getForceOptions: protectedProcedure.query(() => {
    return [
      { value: 'LIGHT', label: 'Light', description: 'Gentle force, suitable for sensitive patients' },
      { value: 'MODERATE', label: 'Moderate', description: 'Standard force for most adjustments' },
      { value: 'FIRM', label: 'Firm', description: 'Strong force for resistant fixations' },
    ];
  }),

  // Get position options
  getPositionOptions: protectedProcedure.query(() => {
    return [
      { value: 'PRONE', label: 'Prone', description: 'Face down' },
      { value: 'SUPINE', label: 'Supine', description: 'Face up' },
      { value: 'SIDE_LYING', label: 'Side Lying', description: 'On side (left or right)' },
      { value: 'SEATED', label: 'Seated', description: 'Sitting position' },
      { value: 'STANDING', label: 'Standing', description: 'Standing position' },
    ];
  }),

  // Get quick entry templates for common adjustment patterns
  getTemplates: protectedProcedure.query(async ({ ctx }) => {
    // Get technique IDs for templates
    const techniqueNames = [...new Set(ADJUSTMENT_TEMPLATES.map((t) => t.technique))];
    const techniques = await ctx.prisma.technique.findMany({
      where: {
        name: { in: techniqueNames },
        isActive: true,
        OR: [
          { isSystem: true },
          { organizationId: ctx.user.organizationId },
        ],
      },
      select: {
        id: true,
        name: true,
        category: true,
      },
    });

    const techniqueMap = new Map(techniques.map((t) => [t.name, t]));

    return ADJUSTMENT_TEMPLATES.map((template) => ({
      ...template,
      techniqueId: techniqueMap.get(template.technique)?.id,
      techniqueCategory: techniqueMap.get(template.technique)?.category,
    }));
  }),

  // Apply a quick entry template to create multiple adjustments
  applyTemplate: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        templateId: z.string(),
        // Optional overrides
        techniqueId: z.string().optional(),
        force: forceSchema.optional(),
        position: positionSchema.optional(),
        response: adjustmentResponseSchema.default('GOOD'),
        // Optional pre/post findings to apply to all
        prePain: z.number().min(0).max(10).optional(),
        postPain: z.number().min(0).max(10).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { encounterId, templateId, techniqueId, force, position, response, prePain, postPain } = input;

      const template = ADJUSTMENT_TEMPLATES.find((t) => t.id === templateId);
      if (!template) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Template not found',
        });
      }

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

      if (encounter.status === 'SIGNED' || encounter.status === 'AMENDED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot add adjustments to a signed encounter',
        });
      }

      // Resolve technique ID
      let resolvedTechniqueId = techniqueId;
      if (!resolvedTechniqueId) {
        const technique = await ctx.prisma.technique.findFirst({
          where: {
            name: template.technique,
            isActive: true,
            OR: [
              { isSystem: true },
              { organizationId: ctx.user.organizationId },
            ],
          },
        });
        resolvedTechniqueId = technique?.id;
      }

      // Create adjustments for each segment
      const adjustments = await ctx.prisma.$transaction(
        template.segments.map((vertebra) =>
          ctx.prisma.adjustment.create({
            data: {
              vertebra: vertebra.toUpperCase(),
              region: getRegionFromVertebra(vertebra),
              techniqueId: resolvedTechniqueId,
              force: force || template.force,
              position: position || template.position,
              response,
              prePain,
              postPain,
              encounterId,
              organizationId: ctx.user.organizationId,
            },
            include: {
              technique: {
                select: {
                  id: true,
                  name: true,
                  category: true,
                },
              },
            },
          })
        )
      );

      await auditLog('CREATE', 'Adjustment', {
        changes: {
          action: 'apply_template',
          templateId,
          encounterId,
          count: adjustments.length,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        created: adjustments.length,
        adjustments: adjustments.map((a) => ({
          ...a,
          responseInfo: RESPONSE_INFO.find((r) => r.value === a.response),
        })),
      };
    }),

  // Bulk create adjustments (for custom quick entry)
  bulkCreate: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        adjustments: z.array(
          z.object({
            vertebra: z.string(),
            techniqueId: z.string().optional(),
            force: forceSchema.optional(),
            position: positionSchema.optional(),
            response: adjustmentResponseSchema.default('GOOD'),
            subluxationId: z.string().optional(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { encounterId, adjustments: adjustmentInputs } = input;

      // Verify encounter
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
          message: 'Cannot add adjustments to a signed encounter',
        });
      }

      const created = await ctx.prisma.$transaction(
        adjustmentInputs.map((adj) =>
          ctx.prisma.adjustment.create({
            data: {
              vertebra: adj.vertebra.toUpperCase(),
              region: getRegionFromVertebra(adj.vertebra),
              techniqueId: adj.techniqueId,
              force: adj.force,
              position: adj.position,
              response: adj.response,
              subluxationId: adj.subluxationId,
              encounterId,
              organizationId: ctx.user.organizationId,
            },
            include: {
              technique: {
                select: {
                  id: true,
                  name: true,
                  category: true,
                },
              },
            },
          })
        )
      );

      await auditLog('CREATE', 'Adjustment', {
        changes: {
          action: 'bulk_create',
          encounterId,
          count: created.length,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        created: created.length,
        adjustments: created.map((a) => ({
          ...a,
          responseInfo: RESPONSE_INFO.find((r) => r.value === a.response),
        })),
      };
    }),
});
