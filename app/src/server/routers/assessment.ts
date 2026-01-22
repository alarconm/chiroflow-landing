import { z } from 'zod';
import { router, protectedProcedure, providerProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';

// Validation schemas
const assessmentTypeSchema = z.enum([
  'ODI',
  'NDI',
  'VAS_PAIN',
  'NPRS',
  'FABQ',
  'DASH',
  'SF36',
  'CUSTOM',
]);

// Answer schema for submission
const answerSchema = z.object({
  questionId: z.string(),
  answer: z.union([z.string(), z.number(), z.array(z.string())]),
  score: z.number().optional(),
});

export const assessmentRouter = router({
  // Get available assessment types and templates
  getAvailable: protectedProcedure.query(async ({ ctx }) => {
    // Get system templates and organization templates
    const templates = await ctx.prisma.assessmentTemplate.findMany({
      where: {
        isActive: true,
        OR: [{ isSystem: true }, { organizationId: ctx.user.organizationId }],
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });

    // Group by assessment type
    const byType = templates.reduce(
      (acc, template) => {
        const type = template.assessmentType;
        if (!acc[type]) {
          acc[type] = [];
        }
        acc[type].push(template);
        return acc;
      },
      {} as Record<string, typeof templates>
    );

    return {
      templates,
      byType,
      availableTypes: [
        { type: 'ODI', name: 'Oswestry Disability Index', description: 'Low back pain assessment' },
        { type: 'NDI', name: 'Neck Disability Index', description: 'Neck pain assessment' },
        { type: 'VAS_PAIN', name: 'Visual Analog Scale', description: 'Pain intensity rating' },
        { type: 'NPRS', name: 'Numeric Pain Rating Scale', description: '0-10 pain scale' },
        { type: 'FABQ', name: 'Fear-Avoidance Beliefs', description: 'Fear of movement assessment' },
        { type: 'DASH', name: 'DASH', description: 'Upper extremity function' },
        { type: 'SF36', name: 'SF-36', description: 'General health quality of life' },
        { type: 'CUSTOM', name: 'Custom', description: 'Organization-specific assessments' },
      ],
    };
  }),

  // Start/administer an assessment for a patient
  administer: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        patientId: z.string(),
        assessmentType: assessmentTypeSchema,
        templateId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { encounterId, patientId, assessmentType, templateId } = input;

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

      // Verify patient
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

      // Get most recent previous score for this type
      const previousAssessment = await ctx.prisma.outcomeAssessment.findFirst({
        where: {
          patientId,
          assessmentType,
          completedAt: { not: null },
        },
        orderBy: { completedAt: 'desc' },
        select: { rawScore: true, percentScore: true },
      });

      // Get template if specified
      let template = null;
      if (templateId) {
        template = await ctx.prisma.assessmentTemplate.findFirst({
          where: {
            id: templateId,
            isActive: true,
            OR: [{ isSystem: true }, { organizationId: ctx.user.organizationId }],
          },
        });

        if (!template) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Assessment template not found',
          });
        }
      }

      // Create assessment
      const assessment = await ctx.prisma.outcomeAssessment.create({
        data: {
          encounterId,
          patientId,
          organizationId: ctx.user.organizationId,
          assessmentType,
          templateId,
          ...(previousAssessment?.rawScore ? { previousScore: previousAssessment.rawScore } : {}),
          administeredAt: new Date(),
        },
      });

      return {
        assessment,
        template,
        previousScore: previousAssessment
          ? {
              raw: previousAssessment.rawScore,
              percent: previousAssessment.percentScore,
            }
          : null,
      };
    }),

  // Submit completed assessment with answers
  submit: providerProcedure
    .input(
      z.object({
        id: z.string(),
        answers: z.array(answerSchema),
        rawScore: z.number().optional(),
        percentScore: z.number().min(0).max(100).optional(),
        maxPossible: z.number().optional(),
        interpretation: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, answers, rawScore, percentScore, maxPossible, interpretation } = input;

      // Verify assessment exists
      const existing = await ctx.prisma.outcomeAssessment.findFirst({
        where: {
          id,
          encounter: { organizationId: ctx.user.organizationId },
        },
        include: { encounter: true },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Assessment not found',
        });
      }

      if (existing.completedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Assessment has already been submitted',
        });
      }

      // Calculate change from previous if we have both scores
      let changeScore = null;
      let changePercent = null;
      if (rawScore !== undefined && existing.previousScore) {
        changeScore = rawScore - Number(existing.previousScore);
        if (maxPossible) {
          changePercent = (changeScore / maxPossible) * 100;
        }
      }

      // Auto-calculate interpretation if not provided
      let finalInterpretation = interpretation;
      if (!finalInterpretation && percentScore !== undefined) {
        finalInterpretation = getDefaultInterpretation(existing.assessmentType, percentScore);
      }

      const assessment = await ctx.prisma.outcomeAssessment.update({
        where: { id },
        data: {
          answers,
          rawScore,
          percentScore,
          maxPossible,
          interpretation: finalInterpretation,
          changeScore,
          changePercent,
          completedAt: new Date(),
        },
      });

      // Log submission
      await auditLog('ASSESSMENT_SUBMIT', 'OutcomeAssessment', {
        entityId: id,
        changes: { assessmentType: existing.assessmentType, rawScore, percentScore },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return assessment;
    }),

  // Get a single assessment
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const assessment = await ctx.prisma.outcomeAssessment.findFirst({
        where: {
          id: input.id,
          encounter: { organizationId: ctx.user.organizationId },
        },
        include: {
          encounter: {
            select: {
              id: true,
              encounterDate: true,
              provider: {
                select: {
                  user: { select: { firstName: true, lastName: true } },
                },
              },
            },
          },
          patient: {
            select: {
              id: true,
              mrn: true,
              demographics: { select: { firstName: true, lastName: true } },
            },
          },
        },
      });

      if (!assessment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Assessment not found',
        });
      }

      return assessment;
    }),

  // Get assessment history for a patient
  getHistory: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        assessmentType: assessmentTypeSchema.optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, assessmentType, limit } = input;

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
        patientId,
        completedAt: { not: null },
      };

      if (assessmentType) {
        where.assessmentType = assessmentType;
      }

      const assessments = await ctx.prisma.outcomeAssessment.findMany({
        where,
        orderBy: { completedAt: 'desc' },
        take: limit,
        include: {
          encounter: {
            select: {
              encounterDate: true,
              provider: {
                select: {
                  user: { select: { firstName: true, lastName: true } },
                },
              },
            },
          },
        },
      });

      // Group by assessment type for summary
      const byType = assessments.reduce(
        (acc, assessment) => {
          const type = assessment.assessmentType;
          if (!acc[type]) {
            acc[type] = [];
          }
          acc[type].push(assessment);
          return acc;
        },
        {} as Record<string, typeof assessments>
      );

      return {
        assessments,
        byType,
        summary: Object.entries(byType).map(([type, items]) => ({
          type,
          count: items.length,
          latestScore: items[0]?.rawScore,
          latestPercent: items[0]?.percentScore,
          latestDate: items[0]?.completedAt,
          firstScore: items[items.length - 1]?.rawScore,
          firstPercent: items[items.length - 1]?.percentScore,
          totalChange: items.length > 1
            ? Number(items[0]?.rawScore ?? 0) - Number(items[items.length - 1]?.rawScore ?? 0)
            : null,
        })),
      };
    }),

  // Compare scores over time (for charting)
  compare: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        assessmentType: assessmentTypeSchema,
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, assessmentType, startDate, endDate } = input;

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
        patientId,
        assessmentType,
        completedAt: { not: null },
      };

      if (startDate || endDate) {
        where.completedAt = {
          ...(startDate ? { gte: startDate } : {}),
          ...(endDate ? { lte: endDate } : {}),
        };
      }

      const assessments = await ctx.prisma.outcomeAssessment.findMany({
        where,
        orderBy: { completedAt: 'asc' },
        select: {
          id: true,
          rawScore: true,
          percentScore: true,
          interpretation: true,
          completedAt: true,
          changeScore: true,
          changePercent: true,
        },
      });

      // Calculate trend data for charts
      const dataPoints = assessments.map((a) => ({
        date: a.completedAt,
        score: Number(a.rawScore ?? 0),
        percent: Number(a.percentScore ?? 0),
        interpretation: a.interpretation,
      }));

      // Calculate overall trend
      let trend = 'stable';
      if (assessments.length >= 2) {
        const first = Number(assessments[0]?.rawScore ?? 0);
        const last = Number(assessments[assessments.length - 1]?.rawScore ?? 0);
        const change = last - first;
        if (change > 0) trend = 'improving';
        else if (change < 0) trend = 'declining';
      }

      return {
        assessmentType,
        dataPoints,
        trend,
        totalAssessments: assessments.length,
        firstAssessment: assessments[0] ?? null,
        latestAssessment: assessments[assessments.length - 1] ?? null,
        totalChange:
          assessments.length >= 2
            ? Number(assessments[assessments.length - 1]?.rawScore ?? 0) -
              Number(assessments[0]?.rawScore ?? 0)
            : null,
      };
    }),

  // Get assessments for an encounter
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

      return ctx.prisma.outcomeAssessment.findMany({
        where: { encounterId: input.encounterId },
        orderBy: { administeredAt: 'desc' },
      });
    }),

  // Delete/cancel an incomplete assessment
  cancel: providerProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.outcomeAssessment.findFirst({
        where: {
          id: input.id,
          encounter: { organizationId: ctx.user.organizationId },
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Assessment not found',
        });
      }

      if (existing.completedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot cancel a completed assessment',
        });
      }

      await ctx.prisma.outcomeAssessment.delete({ where: { id: input.id } });

      return { success: true };
    }),

  // ===== TEMPLATE MANAGEMENT =====

  // Create custom assessment template
  createTemplate: adminProcedure
    .input(
      z.object({
        name: z.string().min(1, 'Template name is required'),
        assessmentType: assessmentTypeSchema.default('CUSTOM'),
        description: z.string().optional(),
        questions: z.array(
          z.object({
            id: z.string(),
            text: z.string(),
            type: z.enum(['scale', 'multiple_choice', 'yes_no', 'text', 'number']),
            options: z.array(z.object({ value: z.string(), label: z.string(), score: z.number() })).optional(),
            required: z.boolean().default(true),
            minValue: z.number().optional(),
            maxValue: z.number().optional(),
          })
        ),
        scoringMethod: z.enum(['sum', 'average', 'weighted']).default('sum'),
        maxScore: z.number().optional(),
        interpretation: z
          .array(
            z.object({
              minPercent: z.number(),
              maxPercent: z.number(),
              label: z.string(),
              description: z.string().optional(),
            })
          )
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { name, assessmentType, description, questions, scoringMethod, maxScore, interpretation } =
        input;

      const template = await ctx.prisma.assessmentTemplate.create({
        data: {
          name,
          assessmentType,
          description,
          questions,
          scoringMethod,
          maxScore,
          interpretation,
          organizationId: ctx.user.organizationId,
        },
      });

      return template;
    }),

  // Get a template
  getTemplate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const template = await ctx.prisma.assessmentTemplate.findFirst({
        where: {
          id: input.id,
          OR: [{ isSystem: true }, { organizationId: ctx.user.organizationId }],
        },
      });

      if (!template) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Template not found',
        });
      }

      return template;
    }),

  // List templates
  listTemplates: protectedProcedure
    .input(
      z.object({
        assessmentType: assessmentTypeSchema.optional(),
        includeSystem: z.boolean().default(true),
      })
    )
    .query(async ({ ctx, input }) => {
      const { assessmentType, includeSystem } = input;

      const where: Record<string, unknown> = {
        isActive: true,
        OR: includeSystem
          ? [{ isSystem: true }, { organizationId: ctx.user.organizationId }]
          : [{ organizationId: ctx.user.organizationId }],
      };

      if (assessmentType) {
        where.assessmentType = assessmentType;
      }

      return ctx.prisma.assessmentTemplate.findMany({
        where,
        orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      });
    }),

  // Update template (org templates only)
  updateTemplate: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        description: z.string().nullable().optional(),
        questions: z
          .array(
            z.object({
              id: z.string(),
              text: z.string(),
              type: z.enum(['scale', 'multiple_choice', 'yes_no', 'text', 'number']),
              options: z.array(z.object({ value: z.string(), label: z.string(), score: z.number() })).optional(),
              required: z.boolean().default(true),
              minValue: z.number().optional(),
              maxValue: z.number().optional(),
            })
          )
          .optional(),
        scoringMethod: z.enum(['sum', 'average', 'weighted']).optional(),
        maxScore: z.number().nullable().optional(),
        interpretation: z
          .array(
            z.object({
              minPercent: z.number(),
              maxPercent: z.number(),
              label: z.string(),
              description: z.string().optional(),
            })
          )
          .nullable()
          .optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, interpretation, questions, ...restData } = input;

      const existing = await ctx.prisma.assessmentTemplate.findFirst({
        where: {
          id,
          organizationId: ctx.user.organizationId,
          isSystem: false,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Template not found or is a system template',
        });
      }

      // Build update data, handling nullable JSON fields
      const updateData: Record<string, unknown> = { ...restData };
      if (interpretation !== undefined && interpretation !== null) {
        updateData.interpretation = interpretation;
      }
      if (questions !== undefined) {
        updateData.questions = questions;
      }

      return ctx.prisma.assessmentTemplate.update({
        where: { id },
        data: updateData,
      });
    }),

  // Delete template (soft delete)
  deleteTemplate: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.assessmentTemplate.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
          isSystem: false,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Template not found or is a system template',
        });
      }

      await ctx.prisma.assessmentTemplate.update({
        where: { id: input.id },
        data: { isActive: false },
      });

      return { success: true };
    }),

  // Duplicate a template (including system templates)
  duplicateTemplate: adminProcedure
    .input(
      z.object({
        id: z.string(),
        newName: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const source = await ctx.prisma.assessmentTemplate.findFirst({
        where: {
          id: input.id,
          OR: [{ isSystem: true }, { organizationId: ctx.user.organizationId }],
        },
      });

      if (!source) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Source template not found',
        });
      }

      const duplicate = await ctx.prisma.assessmentTemplate.create({
        data: {
          name: input.newName,
          assessmentType: source.assessmentType,
          description: source.description,
          questions: source.questions ?? [],
          scoringMethod: source.scoringMethod,
          maxScore: source.maxScore,
          ...(source.interpretation ? { interpretation: source.interpretation } : {}),
          isSystem: false,
          organizationId: ctx.user.organizationId,
        },
      });

      return duplicate;
    }),
});

// Helper function to get default interpretation based on score
function getDefaultInterpretation(type: string, percentScore: number): string {
  switch (type) {
    case 'ODI':
    case 'NDI':
      if (percentScore <= 20) return 'Minimal disability';
      if (percentScore <= 40) return 'Moderate disability';
      if (percentScore <= 60) return 'Severe disability';
      if (percentScore <= 80) return 'Crippling disability';
      return 'Bed-bound or exaggerating';
    case 'VAS_PAIN':
    case 'NPRS':
      if (percentScore <= 30) return 'Mild pain';
      if (percentScore <= 60) return 'Moderate pain';
      return 'Severe pain';
    default:
      if (percentScore <= 25) return 'Minimal';
      if (percentScore <= 50) return 'Mild';
      if (percentScore <= 75) return 'Moderate';
      return 'Severe';
  }
}
