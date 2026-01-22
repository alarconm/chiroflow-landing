/**
 * AI Scheduling Router
 * Epic 13: AI-powered scheduling optimization
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { createAuditLog } from '@/lib/audit';
import {
  NoShowRiskLevel,
  OverbookingStatus,
  RecallStatus,
  RecallStepType,
  DayOfWeek,
} from '@prisma/client';
import {
  // No-Show Prediction
  predictNoShow,
  batchPredictNoShows,
  storePrediction,
  getHighRiskAppointments,
  refreshUpcomingPredictions,
  getPatientNoShowHistory,
  // Overbooking
  generateOverbookingRecommendations,
  storeOverbookingRecommendations,
  getPendingRecommendations,
  applyOverbookingDecision,
  expireOldRecommendations,
  // Gap Analysis
  detectScheduleGaps,
  storeScheduleGaps,
  getOpenGaps,
  markGapFilled,
  generateGapInsights,
  // Utilization
  calculateDailyUtilization,
  storeUtilizationMetrics,
  getUtilizationTrend,
  getOrganizationUtilization,
  refreshUtilizationData,
  // Scheduling Optimizer
  findOptimalSlots,
  getTodaySuggestions,
  suggestScheduleImprovements,
  // Recall Automation
  createRecallSequence,
  updateRecallSequence,
  getRecallSequences,
  findRecallCandidates,
  enrollPatient,
  batchEnrollPatients,
  getPendingRecallSteps,
  recordStepExecution,
  handlePatientResponse,
  getRecallStatistics,
  generateRecallInsights,
} from '@/lib/ai-scheduling';

// ============================================
// INPUT SCHEMAS
// ============================================

const noShowRiskLevelSchema = z.nativeEnum(NoShowRiskLevel);
const overbookingStatusSchema = z.nativeEnum(OverbookingStatus);
const recallStatusSchema = z.nativeEnum(RecallStatus);
const recallStepTypeSchema = z.nativeEnum(RecallStepType);
const dayOfWeekSchema = z.nativeEnum(DayOfWeek);

const dateRangeSchema = z.object({
  start: z.coerce.date(),
  end: z.coerce.date(),
});

const schedulingPreferencesSchema = z.object({
  preferredDays: z.array(dayOfWeekSchema).optional(),
  preferredTimeStart: z.string().optional(),
  preferredTimeEnd: z.string().optional(),
  preferredProviderIds: z.array(z.string()).optional(),
  avoidDays: z.array(dayOfWeekSchema).optional(),
});

const recallStepSchema = z.object({
  stepNumber: z.number().min(1),
  stepType: recallStepTypeSchema,
  daysFromStart: z.number().min(0),
  templateId: z.string().optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
});

// ============================================
// ROUTER
// ============================================

export const aiSchedulingRouter = router({
  // ==========================================
  // NO-SHOW PREDICTION
  // ==========================================

  /**
   * Predict no-show probability for a single appointment
   */
  predictNoShow: protectedProcedure
    .input(z.object({ appointmentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const prediction = await predictNoShow(input.appointmentId, ctx.user.organizationId);

      // Store the prediction
      await storePrediction(input.appointmentId, prediction);

      await createAuditLog({
        userId: ctx.user.id,
        action: 'VIEW',
        entityType: 'NoShowPrediction',
        entityId: input.appointmentId,
        organizationId: ctx.user.organizationId,
        metadata: { probability: prediction.probability, riskLevel: prediction.riskLevel },
      });

      return prediction;
    }),

  /**
   * Batch predict no-shows for multiple appointments
   */
  batchPredictNoShows: protectedProcedure
    .input(z.object({ appointmentIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const predictions = await batchPredictNoShows(input.appointmentIds, ctx.user.organizationId);

      // Store all predictions
      for (const { appointmentId, prediction } of predictions) {
        await storePrediction(appointmentId, prediction);
      }

      return predictions;
    }),

  /**
   * Get high-risk appointments for a date range
   */
  getHighRiskAppointments: protectedProcedure
    .input(
      z.object({
        dateRange: dateRangeSchema,
        minRiskLevel: noShowRiskLevelSchema.optional().default('HIGH'),
      })
    )
    .query(async ({ ctx, input }) => {
      return getHighRiskAppointments(
        ctx.user.organizationId,
        input.dateRange.start,
        input.dateRange.end,
        input.minRiskLevel
      );
    }),

  /**
   * Refresh predictions for upcoming appointments
   */
  refreshPredictions: protectedProcedure
    .input(z.object({ daysAhead: z.number().min(1).max(30).optional().default(7) }))
    .mutation(async ({ ctx, input }) => {
      const count = await refreshUpcomingPredictions(ctx.user.organizationId, input.daysAhead);

      await createAuditLog({
        userId: ctx.user.id,
        action: 'UPDATE',
        entityType: 'NoShowPrediction',
        organizationId: ctx.user.organizationId,
        metadata: { refreshedCount: count, daysAhead: input.daysAhead },
      });

      return { refreshedCount: count };
    }),

  /**
   * Get patient no-show history
   */
  getPatientNoShowHistory: protectedProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      return getPatientNoShowHistory(input.patientId, ctx.user.organizationId);
    }),

  // ==========================================
  // OVERBOOKING RECOMMENDATIONS
  // ==========================================

  /**
   * Generate overbooking recommendations for a provider
   */
  generateOverbookingRecommendations: protectedProcedure
    .input(z.object({ providerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const recommendations = await generateOverbookingRecommendations(
        ctx.user.organizationId,
        input.providerId
      );

      // Store recommendations
      const ids = await storeOverbookingRecommendations(ctx.user.organizationId, recommendations);

      await createAuditLog({
        userId: ctx.user.id,
        action: 'CREATE',
        entityType: 'OverbookingRecommendation',
        organizationId: ctx.user.organizationId,
        metadata: { providerId: input.providerId, recommendationCount: ids.length },
      });

      return { recommendations, storedIds: ids };
    }),

  /**
   * Get pending overbooking recommendations
   */
  getPendingOverbookingRecommendations: protectedProcedure
    .input(z.object({ providerId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getPendingRecommendations(ctx.user.organizationId, input?.providerId);
    }),

  /**
   * Apply overbooking decision (accept or decline)
   */
  applyOverbookingDecision: protectedProcedure
    .input(
      z.object({
        recommendationId: z.string(),
        accepted: z.boolean(),
        declineReason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await applyOverbookingDecision({
        recommendationId: input.recommendationId,
        accepted: input.accepted,
        userId: ctx.user.id,
        declineReason: input.declineReason,
      });

      await createAuditLog({
        userId: ctx.user.id,
        action: input.accepted ? 'UPDATE' : 'DELETE',
        entityType: 'OverbookingRecommendation',
        entityId: input.recommendationId,
        organizationId: ctx.user.organizationId,
        metadata: { accepted: input.accepted, declineReason: input.declineReason },
      });

      return { success: true };
    }),

  /**
   * Expire old recommendations
   */
  expireOldRecommendations: protectedProcedure.mutation(async ({ ctx }) => {
    const count = await expireOldRecommendations(ctx.user.organizationId);
    return { expiredCount: count };
  }),

  // ==========================================
  // GAP ANALYSIS
  // ==========================================

  /**
   * Detect schedule gaps for a provider on a date
   */
  detectScheduleGaps: protectedProcedure
    .input(
      z.object({
        providerId: z.string(),
        date: z.coerce.date(),
      })
    )
    .query(async ({ ctx, input }) => {
      const gaps = await detectScheduleGaps(
        ctx.user.organizationId,
        input.providerId,
        input.date
      );

      // Store gaps
      if (gaps.length > 0) {
        await storeScheduleGaps(ctx.user.organizationId, gaps);
      }

      return gaps;
    }),

  /**
   * Get open gaps with suggestions
   */
  getOpenGaps: protectedProcedure
    .input(
      z.object({
        providerId: z.string().optional(),
        dateRange: dateRangeSchema.optional(),
        minPriority: z.number().min(1).max(10).optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      return getOpenGaps(ctx.user.organizationId, {
        providerId: input?.providerId,
        startDate: input?.dateRange?.start,
        endDate: input?.dateRange?.end,
        minPriority: input?.minPriority,
      });
    }),

  /**
   * Mark a gap as filled
   */
  markGapFilled: protectedProcedure
    .input(
      z.object({
        gapId: z.string(),
        appointmentId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await markGapFilled(input.gapId, input.appointmentId);

      await createAuditLog({
        userId: ctx.user.id,
        action: 'UPDATE',
        entityType: 'SchedulingGap',
        entityId: input.gapId,
        organizationId: ctx.user.organizationId,
        metadata: { filledByAppointmentId: input.appointmentId },
      });

      return { success: true };
    }),

  /**
   * Get gap insights
   */
  getGapInsights: protectedProcedure
    .input(z.object({ dateRange: dateRangeSchema }))
    .query(async ({ ctx, input }) => {
      return generateGapInsights(ctx.user.organizationId, input.dateRange);
    }),

  // ==========================================
  // UTILIZATION TRACKING
  // ==========================================

  /**
   * Calculate daily utilization for a provider
   */
  calculateDailyUtilization: protectedProcedure
    .input(
      z.object({
        providerId: z.string(),
        date: z.coerce.date(),
      })
    )
    .query(async ({ ctx, input }) => {
      const metrics = await calculateDailyUtilization(
        ctx.user.organizationId,
        input.providerId,
        input.date
      );

      if (metrics) {
        await storeUtilizationMetrics(ctx.user.organizationId, metrics);
      }

      return metrics;
    }),

  /**
   * Get utilization trend for a provider
   */
  getUtilizationTrend: protectedProcedure
    .input(
      z.object({
        providerId: z.string(),
        period: z.enum(['day', 'week', 'month']),
        count: z.number().min(1).max(52).optional().default(7),
      })
    )
    .query(async ({ ctx, input }) => {
      return getUtilizationTrend(
        ctx.user.organizationId,
        input.providerId,
        input.period,
        input.count
      );
    }),

  /**
   * Get organization-wide utilization
   */
  getOrganizationUtilization: protectedProcedure
    .input(z.object({ dateRange: dateRangeSchema }))
    .query(async ({ ctx, input }) => {
      return getOrganizationUtilization(ctx.user.organizationId, input.dateRange);
    }),

  /**
   * Refresh utilization data for a date range
   */
  refreshUtilizationData: protectedProcedure
    .input(z.object({ dateRange: dateRangeSchema }))
    .mutation(async ({ ctx, input }) => {
      const count = await refreshUtilizationData(ctx.user.organizationId, input.dateRange);

      await createAuditLog({
        userId: ctx.user.id,
        action: 'UPDATE',
        entityType: 'ProviderUtilization',
        organizationId: ctx.user.organizationId,
        metadata: { refreshedCount: count, dateRange: input.dateRange },
      });

      return { refreshedCount: count };
    }),

  // ==========================================
  // SCHEDULING OPTIMIZER
  // ==========================================

  /**
   * Find optimal appointment slots
   */
  findOptimalSlots: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        appointmentTypeId: z.string(),
        duration: z.number().min(5).max(480),
        dateRange: dateRangeSchema,
        preferences: schedulingPreferencesSchema.optional(),
        urgency: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return findOptimalSlots(ctx.user.organizationId, {
        patientId: input.patientId,
        appointmentTypeId: input.appointmentTypeId,
        duration: input.duration,
        dateRange: input.dateRange,
        preferences: input.preferences,
        urgency: input.urgency,
      });
    }),

  /**
   * Get today's scheduling suggestions
   */
  getTodaySuggestions: protectedProcedure.query(async ({ ctx }) => {
    return getTodaySuggestions(ctx.user.organizationId);
  }),

  /**
   * Suggest schedule improvements
   */
  suggestScheduleImprovements: protectedProcedure
    .input(z.object({ dateRange: dateRangeSchema }))
    .query(async ({ ctx, input }) => {
      return suggestScheduleImprovements(ctx.user.organizationId, input.dateRange);
    }),

  // ==========================================
  // RECALL AUTOMATION
  // ==========================================

  /**
   * Create a new recall sequence
   */
  createRecallSequence: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().optional(),
        appointmentTypes: z.array(z.string()),
        daysSinceLastVisit: z.number().min(1).max(365),
        steps: z.array(recallStepSchema).min(1),
        maxAttempts: z.number().min(1).max(10),
        stopOnSchedule: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const id = await createRecallSequence(ctx.user.organizationId, input);

      await createAuditLog({
        userId: ctx.user.id,
        action: 'CREATE',
        entityType: 'RecallSequence',
        entityId: id,
        organizationId: ctx.user.organizationId,
        metadata: { name: input.name, stepCount: input.steps.length },
      });

      return { id };
    }),

  /**
   * Update a recall sequence
   */
  updateRecallSequence: protectedProcedure
    .input(
      z.object({
        sequenceId: z.string(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().optional(),
        appointmentTypes: z.array(z.string()).optional(),
        daysSinceLastVisit: z.number().min(1).max(365).optional(),
        steps: z.array(recallStepSchema).min(1).optional(),
        maxAttempts: z.number().min(1).max(10).optional(),
        stopOnSchedule: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { sequenceId, ...updates } = input;
      await updateRecallSequence(sequenceId, updates);

      await createAuditLog({
        userId: ctx.user.id,
        action: 'UPDATE',
        entityType: 'RecallSequence',
        entityId: sequenceId,
        organizationId: ctx.user.organizationId,
        metadata: updates,
      });

      return { success: true };
    }),

  /**
   * Get recall sequences
   */
  getRecallSequences: protectedProcedure
    .input(z.object({ includeInactive: z.boolean().optional().default(false) }).optional())
    .query(async ({ ctx, input }) => {
      return getRecallSequences(ctx.user.organizationId, input?.includeInactive);
    }),

  /**
   * Find recall candidates
   */
  findRecallCandidates: protectedProcedure
    .input(
      z.object({
        sequenceId: z.string().optional(),
        limit: z.number().min(1).max(200).optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      return findRecallCandidates(ctx.user.organizationId, input);
    }),

  /**
   * Enroll a patient in a recall sequence
   */
  enrollPatient: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        sequenceId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const id = await enrollPatient(ctx.user.organizationId, input.patientId, input.sequenceId);

      await createAuditLog({
        userId: ctx.user.id,
        action: 'CREATE',
        entityType: 'RecallEnrollment',
        entityId: id,
        organizationId: ctx.user.organizationId,
        metadata: input,
      });

      return { id };
    }),

  /**
   * Batch enroll patients
   */
  batchEnrollPatients: protectedProcedure
    .input(
      z.object({
        enrollments: z.array(
          z.object({
            patientId: z.string(),
            sequenceId: z.string(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const ids = await batchEnrollPatients(ctx.user.organizationId, input.enrollments);

      await createAuditLog({
        userId: ctx.user.id,
        action: 'CREATE',
        entityType: 'RecallEnrollment',
        organizationId: ctx.user.organizationId,
        metadata: { enrollmentCount: ids.length },
      });

      return { ids, count: ids.length };
    }),

  /**
   * Get pending recall steps
   */
  getPendingRecallSteps: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getPendingRecallSteps(ctx.user.organizationId, input?.limit);
    }),

  /**
   * Record recall step execution
   */
  recordStepExecution: protectedProcedure
    .input(
      z.object({
        enrollmentId: z.string(),
        stepId: z.string(),
        success: z.boolean(),
        messageId: z.string().optional(),
        error: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await recordStepExecution(input.enrollmentId, input.stepId, {
        enrollmentId: input.enrollmentId,
        stepId: input.stepId,
        success: input.success,
        messageId: input.messageId,
        error: input.error,
      });

      await createAuditLog({
        userId: ctx.user.id,
        action: 'UPDATE',
        entityType: 'RecallStepExecution',
        entityId: input.enrollmentId,
        organizationId: ctx.user.organizationId,
        metadata: { stepId: input.stepId, success: input.success },
      });

      return { success: true };
    }),

  /**
   * Handle patient response to recall
   */
  handlePatientResponse: protectedProcedure
    .input(
      z.object({
        enrollmentId: z.string(),
        response: z.enum(['SCHEDULED', 'OPTED_OUT', 'NO_RESPONSE']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await handlePatientResponse(input.enrollmentId, input.response);

      await createAuditLog({
        userId: ctx.user.id,
        action: 'UPDATE',
        entityType: 'RecallEnrollment',
        entityId: input.enrollmentId,
        organizationId: ctx.user.organizationId,
        metadata: { response: input.response },
      });

      return { success: true };
    }),

  /**
   * Get recall statistics
   */
  getRecallStatistics: protectedProcedure
    .input(z.object({ dateRange: dateRangeSchema.optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getRecallStatistics(ctx.user.organizationId, input?.dateRange);
    }),

  /**
   * Get recall insights
   */
  getRecallInsights: protectedProcedure.query(async ({ ctx }) => {
    return generateRecallInsights(ctx.user.organizationId);
  }),

  // ==========================================
  // COMBINED INSIGHTS
  // ==========================================

  /**
   * Get all scheduling insights (combined)
   */
  getAllInsights: protectedProcedure
    .input(z.object({ dateRange: dateRangeSchema.optional() }).optional())
    .query(async ({ ctx, input }) => {
      const today = new Date();
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);

      const dateRange = input?.dateRange || { start: weekAgo, end: today };

      const [gapInsights, recallInsights, todaySuggestions, scheduleImprovements] =
        await Promise.all([
          generateGapInsights(ctx.user.organizationId, dateRange),
          generateRecallInsights(ctx.user.organizationId),
          getTodaySuggestions(ctx.user.organizationId),
          suggestScheduleImprovements(ctx.user.organizationId, dateRange),
        ]);

      const allInsights = [
        ...gapInsights,
        ...recallInsights,
        ...todaySuggestions,
        ...scheduleImprovements,
      ].sort((a, b) => b.priority - a.priority);

      return {
        insights: allInsights,
        counts: {
          total: allInsights.length,
          warnings: allInsights.filter((i) => i.type === 'warning').length,
          opportunities: allInsights.filter((i) => i.type === 'opportunity').length,
          info: allInsights.filter((i) => i.type === 'info').length,
        },
      };
    }),
});
