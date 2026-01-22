import { z } from 'zod';
import { router, protectedProcedure, providerProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';

// Validation schemas
const treatmentPlanStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'DISCONTINUED', 'EXPIRED']);
const goalStatusSchema = z.enum(['NOT_STARTED', 'IN_PROGRESS', 'ACHIEVED', 'PARTIALLY_ACHIEVED', 'NOT_ACHIEVED']);

export const treatmentPlanRouter = router({
  // Create treatment plan for patient
  create: providerProcedure
    .input(
      z.object({
        patientId: z.string(),
        providerId: z.string(),
        name: z.string().min(1, 'Plan name is required'),
        description: z.string().optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        plannedVisits: z.number().min(1).optional(),
        frequency: z.string().optional(),
        duration: z.string().optional(),
        shortTermGoals: z.string().optional(),
        longTermGoals: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        patientId,
        providerId,
        name,
        description,
        startDate,
        endDate,
        plannedVisits,
        frequency,
        duration,
        shortTermGoals,
        longTermGoals,
      } = input;

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

      // Verify provider belongs to org
      const provider = await ctx.prisma.provider.findFirst({
        where: { id: providerId, organizationId: ctx.user.organizationId },
      });

      if (!provider) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Provider not found',
        });
      }

      const plan = await ctx.prisma.treatmentPlan.create({
        data: {
          patientId,
          providerId,
          organizationId: ctx.user.organizationId,
          name,
          description,
          startDate: startDate ?? new Date(),
          endDate,
          plannedVisits,
          frequency,
          duration,
          shortTermGoals,
          longTermGoals,
          createdBy: ctx.user.id,
        },
        include: {
          patient: {
            select: {
              demographics: { select: { firstName: true, lastName: true } },
            },
          },
          provider: {
            select: {
              user: { select: { firstName: true, lastName: true } },
            },
          },
        },
      });

      // Log creation
      await auditLog('TREATMENT_PLAN_CREATE', 'TreatmentPlan', {
        entityId: plan.id,
        changes: { name, patientId, providerId },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return plan;
    }),

  // Get treatment plan by ID
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const plan = await ctx.prisma.treatmentPlan.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            select: {
              id: true,
              mrn: true,
              demographics: { select: { firstName: true, lastName: true } },
            },
          },
          provider: {
            select: {
              id: true,
              user: { select: { firstName: true, lastName: true } },
            },
          },
          goals: {
            orderBy: { createdAt: 'asc' },
          },
          encounters: {
            orderBy: { encounterDate: 'desc' },
            take: 10,
            select: {
              id: true,
              encounterDate: true,
              encounterType: true,
              status: true,
              visitNumber: true,
            },
          },
        },
      });

      if (!plan) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Treatment plan not found',
        });
      }

      return plan;
    }),

  // Update treatment plan
  update: providerProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        description: z.string().nullable().optional(),
        status: treatmentPlanStatusSchema.optional(),
        endDate: z.coerce.date().nullable().optional(),
        plannedVisits: z.number().min(1).nullable().optional(),
        frequency: z.string().nullable().optional(),
        duration: z.string().nullable().optional(),
        shortTermGoals: z.string().nullable().optional(),
        longTermGoals: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      const existing = await ctx.prisma.treatmentPlan.findFirst({
        where: {
          id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Treatment plan not found',
        });
      }

      const plan = await ctx.prisma.treatmentPlan.update({
        where: { id },
        data: updateData,
      });

      // Log update
      await auditLog('TREATMENT_PLAN_UPDATE', 'TreatmentPlan', {
        entityId: id,
        changes: updateData,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return plan;
    }),

  // List treatment plans with filters
  list: protectedProcedure
    .input(
      z.object({
        patientId: z.string().optional(),
        providerId: z.string().optional(),
        status: treatmentPlanStatusSchema.optional(),
        activeOnly: z.boolean().default(false),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, providerId, status, activeOnly, limit, offset } = input;

      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
      };

      if (patientId) where.patientId = patientId;
      if (providerId) where.providerId = providerId;
      if (status) where.status = status;
      if (activeOnly) where.status = 'ACTIVE';

      const [plans, total] = await Promise.all([
        ctx.prisma.treatmentPlan.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
          include: {
            patient: {
              select: {
                demographics: { select: { firstName: true, lastName: true } },
              },
            },
            provider: {
              select: {
                user: { select: { firstName: true, lastName: true } },
              },
            },
            _count: { select: { goals: true, encounters: true } },
          },
        }),
        ctx.prisma.treatmentPlan.count({ where }),
      ]);

      return { plans, total };
    }),

  // Get treatment plans by patient
  getByPatient: protectedProcedure
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
        organizationId: ctx.user.organizationId,
      };

      if (!includeInactive) {
        where.status = { in: ['DRAFT', 'ACTIVE'] };
      }

      const plans = await ctx.prisma.treatmentPlan.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          provider: {
            select: {
              user: { select: { firstName: true, lastName: true } },
            },
          },
          goals: {
            orderBy: { createdAt: 'asc' },
          },
          _count: { select: { encounters: true } },
        },
      });

      return plans;
    }),

  // Activate a treatment plan
  activate: providerProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const plan = await ctx.prisma.treatmentPlan.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!plan) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Treatment plan not found',
        });
      }

      if (plan.status !== 'DRAFT') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only draft plans can be activated',
        });
      }

      const updated = await ctx.prisma.treatmentPlan.update({
        where: { id: input.id },
        data: {
          status: 'ACTIVE',
          approvedAt: new Date(),
          approvedBy: ctx.user.id,
        },
      });

      await auditLog('TREATMENT_PLAN_UPDATE', 'TreatmentPlan', {
        entityId: input.id,
        changes: { status: 'ACTIVE', approvedAt: new Date() },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  // Complete a treatment plan
  complete: providerProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const plan = await ctx.prisma.treatmentPlan.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!plan) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Treatment plan not found',
        });
      }

      if (plan.status !== 'ACTIVE') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only active plans can be completed',
        });
      }

      const updated = await ctx.prisma.treatmentPlan.update({
        where: { id: input.id },
        data: {
          status: 'COMPLETED',
          endDate: new Date(),
        },
      });

      await auditLog('TREATMENT_PLAN_UPDATE', 'TreatmentPlan', {
        entityId: input.id,
        changes: { status: 'COMPLETED', endDate: new Date() },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  // Discontinue a treatment plan
  discontinue: providerProcedure
    .input(
      z.object({
        id: z.string(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const plan = await ctx.prisma.treatmentPlan.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!plan) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Treatment plan not found',
        });
      }

      if (plan.status === 'COMPLETED' || plan.status === 'DISCONTINUED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Plan is already completed or discontinued',
        });
      }

      const updated = await ctx.prisma.treatmentPlan.update({
        where: { id: input.id },
        data: {
          status: 'DISCONTINUED',
          endDate: new Date(),
          description: input.reason
            ? `${plan.description ?? ''}\n\nDiscontinued: ${input.reason}`
            : plan.description,
        },
      });

      await auditLog('TREATMENT_PLAN_UPDATE', 'TreatmentPlan', {
        entityId: input.id,
        changes: { status: 'DISCONTINUED', reason: input.reason },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  // Add goal to treatment plan
  addGoal: providerProcedure
    .input(
      z.object({
        treatmentPlanId: z.string(),
        description: z.string().min(1, 'Goal description is required'),
        targetDate: z.coerce.date().optional(),
        metric: z.string().optional(),
        baselineValue: z.string().optional(),
        targetValue: z.string().optional(),
        unit: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        treatmentPlanId,
        description,
        targetDate,
        metric,
        baselineValue,
        targetValue,
        unit,
        notes,
      } = input;

      // Verify plan exists and belongs to org
      const plan = await ctx.prisma.treatmentPlan.findFirst({
        where: {
          id: treatmentPlanId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!plan) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Treatment plan not found',
        });
      }

      const goal = await ctx.prisma.treatmentGoal.create({
        data: {
          treatmentPlanId,
          description,
          targetDate,
          metric,
          baselineValue,
          targetValue,
          currentValue: baselineValue, // Start at baseline
          unit,
          notes,
        },
      });

      return goal;
    }),

  // Update goal progress
  updateGoal: providerProcedure
    .input(
      z.object({
        id: z.string(),
        description: z.string().optional(),
        status: goalStatusSchema.optional(),
        targetDate: z.coerce.date().nullable().optional(),
        currentValue: z.string().nullable().optional(),
        progress: z.number().min(0).max(100).optional(),
        notes: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, status, ...updateData } = input;

      // Verify goal's plan belongs to org
      const existing = await ctx.prisma.treatmentGoal.findFirst({
        where: {
          id,
          treatmentPlan: { organizationId: ctx.user.organizationId },
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Goal not found',
        });
      }

      const data: Record<string, unknown> = { ...updateData };

      if (status) {
        data.status = status;
        // Set achievedAt if marking as achieved
        if (status === 'ACHIEVED' && existing.status !== 'ACHIEVED') {
          data.achievedAt = new Date();
          data.progress = 100;
        }
      }

      const goal = await ctx.prisma.treatmentGoal.update({
        where: { id },
        data,
      });

      return goal;
    }),

  // Remove goal from treatment plan
  removeGoal: providerProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.treatmentGoal.findFirst({
        where: {
          id: input.id,
          treatmentPlan: { organizationId: ctx.user.organizationId },
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Goal not found',
        });
      }

      await ctx.prisma.treatmentGoal.delete({ where: { id: input.id } });

      return { success: true };
    }),

  // Increment visit count (called when encounter is linked)
  incrementVisit: providerProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const plan = await ctx.prisma.treatmentPlan.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!plan) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Treatment plan not found',
        });
      }

      const updated = await ctx.prisma.treatmentPlan.update({
        where: { id: input.id },
        data: {
          completedVisits: { increment: 1 },
        },
      });

      // Auto-complete if all visits done
      if (updated.plannedVisits && updated.completedVisits >= updated.plannedVisits) {
        await ctx.prisma.treatmentPlan.update({
          where: { id: input.id },
          data: { status: 'COMPLETED', endDate: new Date() },
        });
      }

      return updated;
    }),

  // Get progress summary for a treatment plan
  getProgress: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const plan = await ctx.prisma.treatmentPlan.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          goals: true,
          encounters: {
            orderBy: { encounterDate: 'asc' },
            select: {
              id: true,
              encounterDate: true,
              status: true,
            },
          },
        },
      });

      if (!plan) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Treatment plan not found',
        });
      }

      // Calculate goal progress
      const goalStats = {
        total: plan.goals.length,
        achieved: plan.goals.filter((g) => g.status === 'ACHIEVED').length,
        inProgress: plan.goals.filter((g) => g.status === 'IN_PROGRESS').length,
        notStarted: plan.goals.filter((g) => g.status === 'NOT_STARTED').length,
        averageProgress:
          plan.goals.length > 0
            ? Math.round(plan.goals.reduce((sum, g) => sum + g.progress, 0) / plan.goals.length)
            : 0,
      };

      // Calculate visit progress
      const visitStats = {
        planned: plan.plannedVisits ?? null,
        completed: plan.completedVisits,
        remaining: plan.plannedVisits ? plan.plannedVisits - plan.completedVisits : null,
        percentComplete: plan.plannedVisits
          ? Math.round((plan.completedVisits / plan.plannedVisits) * 100)
          : null,
      };

      // Calculate days remaining
      const daysStats =
        plan.endDate
          ? {
              endDate: plan.endDate,
              daysRemaining: Math.max(
                0,
                Math.ceil((plan.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
              ),
              isOverdue: plan.endDate < new Date(),
            }
          : null;

      return {
        plan: {
          id: plan.id,
          name: plan.name,
          status: plan.status,
          startDate: plan.startDate,
          endDate: plan.endDate,
        },
        goalStats,
        visitStats,
        daysStats,
        encounters: plan.encounters,
      };
    }),

  // Get active plans for dashboard
  getActivePlans: protectedProcedure
    .input(
      z.object({
        providerId: z.string().optional(),
        limit: z.number().min(1).max(50).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const { providerId, limit } = input;

      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
        status: 'ACTIVE',
      };

      if (providerId) where.providerId = providerId;

      const plans = await ctx.prisma.treatmentPlan.findMany({
        where,
        orderBy: { startDate: 'desc' },
        take: limit,
        include: {
          patient: {
            select: {
              id: true,
              demographics: { select: { firstName: true, lastName: true } },
            },
          },
          provider: {
            select: {
              user: { select: { firstName: true, lastName: true } },
            },
          },
          _count: { select: { goals: true } },
        },
      });

      // Add progress info to each plan
      return Promise.all(
        plans.map(async (plan) => {
          const goals = await ctx.prisma.treatmentGoal.findMany({
            where: { treatmentPlanId: plan.id },
            select: { status: true, progress: true },
          });

          const averageProgress =
            goals.length > 0
              ? Math.round(goals.reduce((sum, g) => sum + g.progress, 0) / goals.length)
              : 0;

          return {
            ...plan,
            averageProgress,
            goalsAchieved: goals.filter((g) => g.status === 'ACHIEVED').length,
            visitsRemaining: plan.plannedVisits
              ? plan.plannedVisits - plan.completedVisits
              : null,
          };
        })
      );
    }),

  // Delete treatment plan (admin only, draft only)
  delete: providerProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const plan = await ctx.prisma.treatmentPlan.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!plan) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Treatment plan not found',
        });
      }

      if (plan.status !== 'DRAFT') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only draft plans can be deleted. Use discontinue for active plans.',
        });
      }

      await ctx.prisma.treatmentPlan.delete({ where: { id: input.id } });

      return { success: true };
    }),
});
