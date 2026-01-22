// AI Insights Router - Epic 16
// tRPC procedures for AI-powered business intelligence

import { z } from 'zod';
import { router, protectedProcedure, billerProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import {
  InsightCategory,
  InsightPriority,
  InsightStatus,
  AnomalyType,
  ChurnRiskLevel,
} from '@prisma/client';

import {
  detectAnomalies,
  getMetricStatistics,
  analyzePatientChurnRisk,
  analyzeAllPatientsChurnRisk,
  getHighRiskPatientCount,
  saveChurnPredictions,
  findRevenueOpportunities,
  getOpportunitySummary,
  saveOpportunities,
  executeNLQuery,
  getSuggestedQueries,
  getQueryHistory,
  generateRecommendations,
  compareToBenchmarks,
  getRecommendationSummary,
} from '@/lib/ai-insights';

// Zod schemas for input validation
const anomalyConfigSchema = z.object({
  zScoreThreshold: z.number().min(1).max(5).optional(),
  minDataPoints: z.number().min(3).max(30).optional(),
  lookbackDays: z.number().min(7).max(365).optional(),
  enabledTypes: z.array(z.nativeEnum(AnomalyType)).optional(),
  sensitivity: z.object({
    revenue: z.enum(['low', 'medium', 'high']).optional(),
    visits: z.enum(['low', 'medium', 'high']).optional(),
    payments: z.enum(['low', 'medium', 'high']).optional(),
    noShows: z.enum(['low', 'medium', 'high']).optional(),
  }).optional(),
});

const churnConfigSchema = z.object({
  veryHighRiskThreshold: z.number().min(50).max(100).optional(),
  highRiskThreshold: z.number().min(40).max(90).optional(),
  mediumRiskThreshold: z.number().min(20).max(70).optional(),
  lowRiskThreshold: z.number().min(10).max(50).optional(),
  factorWeights: z.object({
    daysSinceLastVisit: z.number().min(0).max(1).optional(),
    visitFrequencyChange: z.number().min(0).max(1).optional(),
    missedAppointments: z.number().min(0).max(1).optional(),
    outstandingBalance: z.number().min(0).max(1).optional(),
    engagementScore: z.number().min(0).max(1).optional(),
  }).optional(),
  maxDaysSinceVisit: z.number().min(30).max(365).optional(),
  lookbackMonths: z.number().min(3).max(24).optional(),
});

export const aiInsightsRouter = router({
  // ============================================
  // INSIGHTS DASHBOARD
  // ============================================

  // Get all insights summary
  getSummary: protectedProcedure.query(async ({ ctx }) => {
    const [
      insights,
      churnCount,
      opportunitySummary,
      recommendationSummary,
    ] = await Promise.all([
      ctx.prisma.aIInsight.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          status: { in: [InsightStatus.NEW, InsightStatus.VIEWED] },
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
        orderBy: [{ priority: 'asc' }, { detectedAt: 'desc' }],
        take: 50,
      }),
      getHighRiskPatientCount(ctx.user.organizationId),
      getOpportunitySummary(ctx.user.organizationId).catch(() => null),
      getRecommendationSummary(ctx.user.organizationId).catch(() => null),
    ]);

    // Group insights by category
    const byCategory: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const insight of insights) {
      byCategory[insight.category] = (byCategory[insight.category] || 0) + 1;
      byPriority[insight.priority] = (byPriority[insight.priority] || 0) + 1;
      byStatus[insight.status] = (byStatus[insight.status] || 0) + 1;
    }

    const newInsightsToday = insights.filter(
      (i) => i.detectedAt >= new Date(new Date().setHours(0, 0, 0, 0))
    ).length;

    return {
      total: insights.length,
      byCategory,
      byPriority,
      byStatus,
      newInsightsToday,
      churnRiskCount: churnCount,
      opportunities: opportunitySummary,
      recommendations: recommendationSummary,
      topInsights: insights.slice(0, 5),
    };
  }),

  // Get list of insights with filtering
  getInsights: protectedProcedure
    .input(
      z.object({
        category: z.nativeEnum(InsightCategory).optional(),
        priority: z.nativeEnum(InsightPriority).optional(),
        status: z.nativeEnum(InsightStatus).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const where: {
        organizationId: string;
        category?: InsightCategory;
        priority?: InsightPriority;
        status?: InsightStatus;
        OR?: Array<{ expiresAt: null | { gt: Date } }>;
      } = {
        organizationId: ctx.user.organizationId,
        ...(input?.category && { category: input.category }),
        ...(input?.priority && { priority: input.priority }),
        ...(input?.status && { status: input.status }),
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      };

      const [insights, total] = await Promise.all([
        ctx.prisma.aIInsight.findMany({
          where,
          orderBy: [{ priority: 'asc' }, { detectedAt: 'desc' }],
          take: input?.limit ?? 50,
          skip: input?.offset ?? 0,
        }),
        ctx.prisma.aIInsight.count({ where }),
      ]);

      return { insights, total };
    }),

  // Get single insight detail
  getInsight: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const insight = await ctx.prisma.aIInsight.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          actions: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      });

      if (!insight) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Insight not found' });
      }

      // Mark as viewed if new
      if (insight.status === InsightStatus.NEW) {
        await ctx.prisma.aIInsight.update({
          where: { id: insight.id },
          data: {
            status: InsightStatus.VIEWED,
            viewedAt: new Date(),
            viewedBy: ctx.user.id,
          },
        });
      }

      return insight;
    }),

  // Update insight status
  updateInsightStatus: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.nativeEnum(InsightStatus),
        notes: z.string().optional(),
        dismissReason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const insight = await ctx.prisma.aIInsight.findFirst({
        where: { id: input.id, organizationId: ctx.user.organizationId },
      });

      if (!insight) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Insight not found' });
      }

      const updateData: Record<string, unknown> = { status: input.status };

      if (input.status === InsightStatus.ACTIONED) {
        updateData.actionedAt = new Date();
        updateData.actionedBy = ctx.user.id;
        updateData.actionNotes = input.notes;
      } else if (input.status === InsightStatus.DISMISSED) {
        updateData.dismissedAt = new Date();
        updateData.dismissedBy = ctx.user.id;
        updateData.dismissReason = input.dismissReason;
      }

      const updated = await ctx.prisma.aIInsight.update({
        where: { id: input.id },
        data: updateData,
      });

      await auditLog('AI_INSIGHT_STATUS_UPDATE', 'AIInsight', {
        entityId: input.id,
        changes: { status: input.status },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  // Record action on insight
  recordAction: protectedProcedure
    .input(
      z.object({
        insightId: z.string(),
        actionType: z.string(),
        actionData: z.record(z.string(), z.unknown()).optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const insight = await ctx.prisma.aIInsight.findFirst({
        where: { id: input.insightId, organizationId: ctx.user.organizationId },
      });

      if (!insight) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Insight not found' });
      }

      const action = await ctx.prisma.insightAction.create({
        data: {
          insightId: input.insightId,
          userId: ctx.user.id,
          actionType: input.actionType,
          actionData: input.actionData as object,
          notes: input.notes,
        },
      });

      // Update insight status to actioned
      await ctx.prisma.aIInsight.update({
        where: { id: input.insightId },
        data: {
          status: InsightStatus.ACTIONED,
          actionedAt: new Date(),
          actionedBy: ctx.user.id,
        },
      });

      return action;
    }),

  // ============================================
  // ANOMALY DETECTION
  // ============================================

  // Detect anomalies
  detectAnomalies: billerProcedure
    .input(anomalyConfigSchema.optional())
    .query(async ({ ctx, input }) => {
      // Cast input to allow optional nested fields - defaults are applied in detectAnomalies
      return detectAnomalies(ctx.user.organizationId, input as Parameters<typeof detectAnomalies>[1]);
    }),

  // Get metric statistics
  getMetricStats: protectedProcedure
    .input(
      z.object({
        metric: z.enum(['revenue', 'visits', 'noShows', 'newPatients', 'denials']),
        lookbackDays: z.number().min(7).max(365).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return getMetricStatistics(ctx.user.organizationId, input.metric, input.lookbackDays);
    }),

  // Save detected anomalies as insights
  saveAnomalies: adminProcedure
    .input(anomalyConfigSchema.optional())
    .mutation(async ({ ctx, input }) => {
      // Cast input to allow optional nested fields - defaults are applied in detectAnomalies
      const anomalies = await detectAnomalies(ctx.user.organizationId, input as Parameters<typeof detectAnomalies>[1]);
      let savedCount = 0;

      for (const anomaly of anomalies) {
        await ctx.prisma.aIInsight.create({
          data: {
            organizationId: ctx.user.organizationId,
            category: InsightCategory.ANOMALY,
            priority: anomaly.priority,
            title: anomaly.title,
            description: anomaly.description,
            recommendation: anomaly.recommendation,
            confidence: anomaly.confidence,
            metricName: anomaly.metric,
            anomalyType: anomaly.type,
            expectedValue: anomaly.expectedValue,
            actualValue: anomaly.actualValue,
            deviationPercent: anomaly.deviationPercent,
            zScore: anomaly.zScore,
            periodStart: anomaly.periodStart,
            periodEnd: anomaly.periodEnd,
            dataSnapshot: anomaly.dataSnapshot as object,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          },
        });
        savedCount++;
      }

      return { savedCount };
    }),

  // ============================================
  // CHURN PREDICTION
  // ============================================

  // Get churn predictions
  getChurnPredictions: protectedProcedure
    .input(
      z.object({
        minRiskLevel: z.nativeEnum(ChurnRiskLevel).optional(),
        limit: z.number().min(1).max(200).optional(),
        config: churnConfigSchema.optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      // Cast config to allow optional nested fields - defaults are applied in the function
      return analyzeAllPatientsChurnRisk(
        ctx.user.organizationId,
        input?.config as Parameters<typeof analyzeAllPatientsChurnRisk>[1],
        {
          minRiskLevel: input?.minRiskLevel,
          limit: input?.limit,
        }
      );
    }),

  // Get single patient churn analysis
  getPatientChurnRisk: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        config: churnConfigSchema.optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Cast config to allow optional nested fields - defaults are applied in the function
      return analyzePatientChurnRisk(
        ctx.user.organizationId,
        input.patientId,
        input.config as Parameters<typeof analyzePatientChurnRisk>[2]
      );
    }),

  // Get churn risk counts
  getChurnCounts: protectedProcedure.query(async ({ ctx }) => {
    return getHighRiskPatientCount(ctx.user.organizationId);
  }),

  // Save churn predictions to database
  saveChurnPredictions: adminProcedure
    .input(churnConfigSchema.optional())
    .mutation(async ({ ctx, input }) => {
      // Cast input to allow optional nested fields - defaults are applied in the function
      const analyses = await analyzeAllPatientsChurnRisk(ctx.user.organizationId, input as Parameters<typeof analyzeAllPatientsChurnRisk>[1]);
      const savedCount = await saveChurnPredictions(ctx.user.organizationId, analyses);
      return { savedCount };
    }),

  // Update churn prediction status
  updateChurnStatus: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        status: z.enum(['active', 'contacted', 'recovered', 'churned']),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // patientId is @unique, but verify organization access
      const prediction = await ctx.prisma.churnPrediction.findFirst({
        where: {
          patientId: input.patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!prediction) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Churn prediction not found' });
      }

      const updateData: Record<string, unknown> = { status: input.status };

      if (input.status === 'contacted') {
        updateData.contactedAt = new Date();
        updateData.contactedBy = ctx.user.id;
        updateData.contactNotes = input.notes;
      } else if (input.status === 'recovered') {
        updateData.recoveredAt = new Date();
      } else if (input.status === 'churned') {
        updateData.churnedAt = new Date();
      }

      return ctx.prisma.churnPrediction.update({
        where: {
          patientId: input.patientId,
        },
        data: updateData,
      });
    }),

  // ============================================
  // REVENUE OPPORTUNITIES
  // ============================================

  // Get revenue opportunities
  getOpportunities: protectedProcedure
    .input(
      z.object({
        types: z.array(z.string()).optional(),
        minValue: z.number().optional(),
        limit: z.number().min(1).max(200).optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const opportunities = await findRevenueOpportunities(ctx.user.organizationId, {
        minOpportunityValue: input?.minValue,
        enabledTypes: input?.types as never,
      });

      return input?.limit ? opportunities.slice(0, input.limit) : opportunities;
    }),

  // Get opportunity summary
  getOpportunitySummary: protectedProcedure.query(async ({ ctx }) => {
    return getOpportunitySummary(ctx.user.organizationId);
  }),

  // Update opportunity status
  updateOpportunityStatus: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(['identified', 'in_progress', 'captured', 'declined']),
        capturedValue: z.number().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const opportunity = await ctx.prisma.revenueOpportunity.findFirst({
        where: { id: input.id, organizationId: ctx.user.organizationId },
      });

      if (!opportunity) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Opportunity not found' });
      }

      const updateData: Record<string, unknown> = {
        status: input.status,
        notes: input.notes,
      };

      if (input.status === 'captured') {
        updateData.capturedAt = new Date();
        updateData.capturedBy = ctx.user.id;
        updateData.capturedValue = input.capturedValue;
      }

      return ctx.prisma.revenueOpportunity.update({
        where: { id: input.id },
        data: updateData,
      });
    }),

  // Save opportunities to database
  saveOpportunities: adminProcedure.mutation(async ({ ctx }) => {
    const opportunities = await findRevenueOpportunities(ctx.user.organizationId);
    const savedCount = await saveOpportunities(ctx.user.organizationId, opportunities);
    return { savedCount };
  }),

  // ============================================
  // NATURAL LANGUAGE QUERIES
  // ============================================

  // Execute natural language query
  query: protectedProcedure
    .input(z.object({ query: z.string().min(3).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const response = await executeNLQuery(ctx.user.organizationId, input.query);

      // Update the query history with user ID
      await ctx.prisma.nLQueryHistory.updateMany({
        where: {
          organizationId: ctx.user.organizationId,
          query: input.query,
          userId: 'system',
        },
        data: { userId: ctx.user.id },
      });

      await auditLog('AI_NL_QUERY', 'NLQueryHistory', {
        changes: { query: input.query, intent: response.intent },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return response;
    }),

  // Get suggested queries
  getSuggestedQueries: protectedProcedure.query(() => {
    return getSuggestedQueries();
  }),

  // Get query history
  getQueryHistory: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).optional(),
        onlyMine: z.boolean().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      return getQueryHistory(
        ctx.user.organizationId,
        input?.onlyMine ? ctx.user.id : undefined,
        input?.limit
      );
    }),

  // Rate query response
  rateQuery: protectedProcedure
    .input(
      z.object({
        queryId: z.string(),
        rating: z.number().min(1).max(5),
        wasHelpful: z.boolean(),
        feedback: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.nLQueryHistory.update({
        where: { id: input.queryId },
        data: {
          userRating: input.rating,
          wasHelpful: input.wasHelpful,
          userFeedback: input.feedback,
        },
      });
    }),

  // ============================================
  // RECOMMENDATIONS & BENCHMARKS
  // ============================================

  // Get recommendations
  getRecommendations: protectedProcedure.query(async ({ ctx }) => {
    return generateRecommendations(ctx.user.organizationId);
  }),

  // Get benchmark comparisons
  getBenchmarks: billerProcedure.query(async ({ ctx }) => {
    return compareToBenchmarks(ctx.user.organizationId);
  }),

  // Get recommendation summary
  getRecommendationSummary: protectedProcedure.query(async ({ ctx }) => {
    return getRecommendationSummary(ctx.user.organizationId);
  }),

  // ============================================
  // BATCH OPERATIONS
  // ============================================

  // Run full analysis (admin only, typically scheduled)
  runFullAnalysis: adminProcedure.mutation(async ({ ctx }) => {
    const results = {
      anomalies: 0,
      churnPredictions: 0,
      opportunities: 0,
      recommendations: 0,
    };

    // Detect and save anomalies
    const anomalies = await detectAnomalies(ctx.user.organizationId);
    for (const anomaly of anomalies) {
      await ctx.prisma.aIInsight.create({
        data: {
          organizationId: ctx.user.organizationId,
          category: InsightCategory.ANOMALY,
          priority: anomaly.priority,
          title: anomaly.title,
          description: anomaly.description,
          recommendation: anomaly.recommendation,
          confidence: anomaly.confidence,
          metricName: anomaly.metric,
          anomalyType: anomaly.type,
          expectedValue: anomaly.expectedValue,
          actualValue: anomaly.actualValue,
          deviationPercent: anomaly.deviationPercent,
          zScore: anomaly.zScore,
          periodStart: anomaly.periodStart,
          periodEnd: anomaly.periodEnd,
          dataSnapshot: anomaly.dataSnapshot as object,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      results.anomalies++;
    }

    // Run and save churn predictions
    const churnAnalyses = await analyzeAllPatientsChurnRisk(ctx.user.organizationId);
    results.churnPredictions = await saveChurnPredictions(ctx.user.organizationId, churnAnalyses);

    // Find and save opportunities
    const opportunities = await findRevenueOpportunities(ctx.user.organizationId);
    results.opportunities = await saveOpportunities(ctx.user.organizationId, opportunities);

    // Generate recommendations
    const recommendations = await generateRecommendations(ctx.user.organizationId);
    for (const rec of recommendations) {
      await ctx.prisma.aIInsight.create({
        data: {
          organizationId: ctx.user.organizationId,
          category: InsightCategory.RECOMMENDATION,
          priority: rec.priority,
          title: rec.title,
          description: rec.description,
          impact: rec.impact,
          recommendation: rec.actionSteps.join('\n'),
          confidence: rec.confidence,
          relatedMetrics: rec.supportingMetrics as object,
          expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
        },
      });
      results.recommendations++;
    }

    await auditLog('AI_FULL_ANALYSIS', 'AIInsight', {
      changes: results,
      userId: ctx.user.id,
      organizationId: ctx.user.organizationId,
    });

    return results;
  }),

  // Clean up expired insights
  cleanupExpired: adminProcedure.mutation(async ({ ctx }) => {
    const result = await ctx.prisma.aIInsight.updateMany({
      where: {
        organizationId: ctx.user.organizationId,
        expiresAt: { lt: new Date() },
        status: { in: [InsightStatus.NEW, InsightStatus.VIEWED] },
      },
      data: { status: InsightStatus.EXPIRED },
    });

    return { expiredCount: result.count };
  }),
});
