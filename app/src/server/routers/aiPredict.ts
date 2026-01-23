// AI Predict Router - Epic 40: AI Predictive Analytics Agent
// tRPC procedures for AI-powered predictive analytics

import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import { RiskType } from '@prisma/client';

import {
  predictChurn,
  batchPredictChurn,
  saveChurnPrediction,
  trackChurnPredictionAccuracy,
  getChurnPredictionAccuracy,
  forecastDemand,
  saveDemandForecast,
  trackForecastAccuracy,
  getForecastAccuracySummary,
  predictNoShow,
  batchPredictNoShow,
  saveNoShowPrediction,
  trackNoShowPredictionAccuracy,
  getNoShowPredictionAccuracy,
  forecastRevenue,
  saveRevenueForecast,
  trackRevenueForecastAccuracy,
  getRevenueForecastAccuracySummary,
  predictOutcome,
  batchPredictOutcome,
  saveOutcomePrediction,
  trackOutcomePredictionAccuracy,
  getOutcomePredictionAccuracy,
  detectTrends,
  batchDetectTrends,
  saveTrendAnalysis,
  getAlertSummary,
  trackTrendAccuracy,
  getTrendAccuracySummary,
  compareTrends,
  type ChurnPredictionConfig,
  type DemandForecastConfig,
  type NoShowPredictionConfig,
  type RevenueForecastConfig,
  type TreatmentOutcomePredictionConfig,
  type TrendDetectionConfig,
  type TrendMetricType,
} from '@/lib/ai-predict';

// Zod schemas for input validation
const churnConfigSchema = z.object({
  criticalThreshold: z.number().min(50).max(100).optional(),
  highThreshold: z.number().min(40).max(90).optional(),
  mediumThreshold: z.number().min(20).max(70).optional(),
  lowThreshold: z.number().min(10).max(50).optional(),
  factorWeights: z.object({
    visitRecency: z.number().min(0).max(1).optional(),
    visitFrequency: z.number().min(0).max(1).optional(),
    noShowRate: z.number().min(0).max(1).optional(),
    cancellationRate: z.number().min(0).max(1).optional(),
    engagementScore: z.number().min(0).max(1).optional(),
    outstandingBalance: z.number().min(0).max(1).optional(),
    treatmentCompletion: z.number().min(0).max(1).optional(),
  }).optional(),
  lookbackMonths: z.number().min(3).max(24).optional(),
  maxInactiveDays: z.number().min(30).max(365).optional(),
  minDataPoints: z.number().min(1).max(20).optional(),
}).optional();

export const aiPredictRouter = router({
  // ============================================
  // CHURN PREDICTION
  // ============================================

  // Predict churn risk for a single patient
  predictChurn: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        config: churnConfigSchema,
      })
    )
    .query(async ({ ctx, input }) => {
      const prediction = await predictChurn(
        ctx.user.organizationId,
        input.patientId,
        input.config as Partial<ChurnPredictionConfig> | undefined
      );

      if (!prediction) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found or not active',
        });
      }

      return prediction;
    }),

  // Batch predict churn for all patients
  batchPredictChurn: adminProcedure
    .input(
      z.object({
        minRiskLevel: z.enum(['critical', 'high', 'medium', 'low']).optional(),
        limit: z.number().min(1).max(500).optional(),
        saveResults: z.boolean().optional(),
      }).optional()
    )
    .mutation(async ({ ctx, input }) => {
      const result = await batchPredictChurn({
        organizationId: ctx.user.organizationId,
        minRiskLevel: input?.minRiskLevel || 'low',
        limit: input?.limit || 100,
      });

      // Save results if requested
      if (input?.saveResults) {
        for (const prediction of result.topAtRiskPatients) {
          await saveChurnPrediction(ctx.user.organizationId, prediction);
        }
      }

      await auditLog('AI_BATCH_CHURN_PREDICTION', 'Prediction', {
        changes: {
          processedCount: result.processedCount,
          savedCount: result.savedCount,
          byRiskLevel: result.byRiskLevel,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return result;
    }),

  // Get at-risk patients list
  getAtRiskPatients: protectedProcedure
    .input(
      z.object({
        minRiskLevel: z.enum(['critical', 'high', 'medium', 'low']).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const result = await batchPredictChurn({
        organizationId: ctx.user.organizationId,
        minRiskLevel: input?.minRiskLevel || 'medium',
        limit: (input?.limit || 50) + (input?.offset || 0),
      });

      // Apply offset
      const patients = result.topAtRiskPatients.slice(
        input?.offset || 0,
        (input?.offset || 0) + (input?.limit || 50)
      );

      return {
        patients,
        total: result.byRiskLevel.critical +
          result.byRiskLevel.high +
          result.byRiskLevel.medium +
          (input?.minRiskLevel === 'low' ? result.byRiskLevel.low : 0),
        byRiskLevel: result.byRiskLevel,
      };
    }),

  // Get churn risk summary
  getChurnSummary: protectedProcedure.query(async ({ ctx }) => {
    const [riskCounts, accuracy] = await Promise.all([
      ctx.prisma.patientRiskScore.groupBy({
        by: ['scoreLevel'],
        where: {
          organizationId: ctx.user.organizationId,
          riskType: RiskType.CHURN,
        },
        _count: true,
      }),
      getChurnPredictionAccuracy(ctx.user.organizationId),
    ]);

    const byRiskLevel = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      minimal: 0,
    };

    for (const count of riskCounts) {
      if (count.scoreLevel in byRiskLevel) {
        byRiskLevel[count.scoreLevel as keyof typeof byRiskLevel] = count._count;
      }
    }

    const total = Object.values(byRiskLevel).reduce((sum, val) => sum + val, 0);
    const atRisk = byRiskLevel.critical + byRiskLevel.high + byRiskLevel.medium;

    return {
      totalPatients: total,
      atRiskPatients: atRisk,
      byRiskLevel,
      accuracy,
      lastUpdated: new Date(),
    };
  }),

  // Save churn prediction
  saveChurnPrediction: adminProcedure
    .input(z.object({ patientId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const prediction = await predictChurn(
        ctx.user.organizationId,
        input.patientId
      );

      if (!prediction) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found or not active',
        });
      }

      await saveChurnPrediction(ctx.user.organizationId, prediction);

      await auditLog('AI_CHURN_PREDICTION_SAVED', 'PatientRiskScore', {
        entityId: input.patientId,
        changes: {
          churnProbability: prediction.churnProbability,
          riskLevel: prediction.riskLevel,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true, prediction };
    }),

  // Track prediction outcome (for accuracy)
  trackPredictionOutcome: adminProcedure
    .input(
      z.object({
        patientId: z.string(),
        actuallyChurned: z.boolean(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await trackChurnPredictionAccuracy(
        ctx.user.organizationId,
        input.patientId,
        input.actuallyChurned
      );

      // Update the risk score with intervention outcome
      await ctx.prisma.patientRiskScore.updateMany({
        where: {
          organizationId: ctx.user.organizationId,
          patientId: input.patientId,
          riskType: RiskType.CHURN,
        },
        data: {
          interventionOutcome: input.actuallyChurned ? 'churned' : 'retained',
          interventionDate: new Date(),
        },
      });

      await auditLog('AI_PREDICTION_OUTCOME_TRACKED', 'Prediction', {
        entityId: input.patientId,
        changes: {
          actuallyChurned: input.actuallyChurned,
          notes: input.notes,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // Get prediction accuracy metrics
  getPredictionAccuracy: protectedProcedure
    .input(
      z.object({
        predictionType: z.enum(['churn']).optional(),
      }).optional()
    )
    .query(async ({ ctx }) => {
      return getChurnPredictionAccuracy(ctx.user.organizationId);
    }),

  // ============================================
  // PATIENT RISK SCORES
  // ============================================

  // Get patient risk score
  getPatientRiskScore: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        riskType: z.nativeEnum(RiskType).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: {
        organizationId: string;
        patientId: string;
        riskType?: RiskType;
      } = {
        organizationId: ctx.user.organizationId,
        patientId: input.patientId,
      };

      if (input.riskType) {
        where.riskType = input.riskType;
      }

      const scores = await ctx.prisma.patientRiskScore.findMany({
        where,
        include: {
          patient: {
            include: { demographics: true },
          },
        },
        orderBy: { score: 'desc' },
      });

      return scores.map((score) => ({
        id: score.id,
        patientId: score.patientId,
        patientName: score.patient.demographics
          ? `${score.patient.demographics.firstName} ${score.patient.demographics.lastName}`
          : 'Unknown',
        riskType: score.riskType,
        score: score.score,
        scoreLevel: score.scoreLevel,
        confidence: Number(score.confidence),
        topFactors: score.topFactors,
        previousScore: score.previousScore,
        scoreChange: score.scoreChange,
        scoreTrend: score.scoreTrend,
        isAboveThreshold: score.isAboveThreshold,
        interventionRecommended: score.interventionRecommended,
        calculatedAt: score.calculatedAt,
      }));
    }),

  // Get all risk scores for organization (dashboard)
  getAllRiskScores: protectedProcedure
    .input(
      z.object({
        riskType: z.nativeEnum(RiskType).optional(),
        minScore: z.number().min(0).max(100).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const where: {
        organizationId: string;
        riskType?: RiskType;
        score?: { gte: number };
      } = {
        organizationId: ctx.user.organizationId,
      };

      if (input?.riskType) {
        where.riskType = input.riskType;
      }

      if (input?.minScore) {
        where.score = { gte: input.minScore };
      }

      const [scores, total] = await Promise.all([
        ctx.prisma.patientRiskScore.findMany({
          where,
          include: {
            patient: {
              include: { demographics: true },
            },
          },
          orderBy: { score: 'desc' },
          take: input?.limit || 50,
          skip: input?.offset || 0,
        }),
        ctx.prisma.patientRiskScore.count({ where }),
      ]);

      return {
        scores: scores.map((score) => ({
          id: score.id,
          patientId: score.patientId,
          patientName: score.patient.demographics
            ? `${score.patient.demographics.firstName} ${score.patient.demographics.lastName}`
            : 'Unknown',
          riskType: score.riskType,
          score: score.score,
          scoreLevel: score.scoreLevel,
          confidence: Number(score.confidence),
          topFactors: score.topFactors,
          isAboveThreshold: score.isAboveThreshold,
          calculatedAt: score.calculatedAt,
        })),
        total,
      };
    }),

  // Record intervention for risk score
  recordIntervention: protectedProcedure
    .input(
      z.object({
        riskScoreId: z.string(),
        intervention: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const riskScore = await ctx.prisma.patientRiskScore.findFirst({
        where: {
          id: input.riskScoreId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!riskScore) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Risk score not found',
        });
      }

      const updated = await ctx.prisma.patientRiskScore.update({
        where: { id: input.riskScoreId },
        data: {
          interventionTaken: input.intervention,
          interventionDate: new Date(),
        },
      });

      await auditLog('RISK_SCORE_INTERVENTION', 'PatientRiskScore', {
        entityId: input.riskScoreId,
        changes: { intervention: input.intervention },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  // ============================================
  // DEMAND FORECASTING
  // ============================================

  // Forecast demand for the organization
  forecastDemand: protectedProcedure
    .input(
      z.object({
        config: z.object({
          lookbackWeeks: z.number().min(4).max(52).optional(),
          forecastHorizonDays: z.number().min(7).max(90).optional(),
          minDataPoints: z.number().min(5).max(100).optional(),
          includeSeasonalFactors: z.boolean().optional(),
          includeDayOfWeekFactors: z.boolean().optional(),
          includeHolidayFactors: z.boolean().optional(),
          confidenceLevel: z.number().min(0.8).max(0.99).optional(),
        }).optional(),
        filters: z.object({
          appointmentTypeId: z.string().optional(),
          providerId: z.string().optional(),
          locationId: z.string().optional(),
        }).optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const forecast = await forecastDemand(
        ctx.user.organizationId,
        input?.config as Partial<DemandForecastConfig> | undefined,
        input?.filters || {}
      );

      return forecast;
    }),

  // Get daily forecasts
  getDailyForecasts: protectedProcedure
    .input(
      z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        appointmentTypeId: z.string().optional(),
        providerId: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const forecast = await forecastDemand(
        ctx.user.organizationId,
        {
          forecastHorizonDays: input?.endDate
            ? Math.ceil((input.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            : 30,
        },
        {
          appointmentTypeId: input?.appointmentTypeId,
          providerId: input?.providerId,
        }
      );

      let dailyForecasts = forecast.dailyForecasts;

      // Filter by date range if specified
      if (input?.startDate) {
        dailyForecasts = dailyForecasts.filter(d => d.date >= input.startDate!);
      }
      if (input?.endDate) {
        dailyForecasts = dailyForecasts.filter(d => d.date <= input.endDate!);
      }

      return {
        forecasts: dailyForecasts,
        totalPredictedVolume: dailyForecasts.reduce((sum, d) => sum + d.predictedVolume, 0),
        averageDailyVolume: forecast.averageDailyVolume,
        confidence: forecast.confidence,
      };
    }),

  // Get weekly forecasts
  getWeeklyForecasts: protectedProcedure
    .input(
      z.object({
        weeks: z.number().min(1).max(12).default(4),
        appointmentTypeId: z.string().optional(),
        providerId: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const forecast = await forecastDemand(
        ctx.user.organizationId,
        { forecastHorizonDays: (input?.weeks || 4) * 7 },
        {
          appointmentTypeId: input?.appointmentTypeId,
          providerId: input?.providerId,
        }
      );

      return {
        forecasts: forecast.weeklyForecasts,
        totalPredictedVolume: forecast.totalPredictedVolume,
        confidence: forecast.confidence,
      };
    }),

  // Get monthly forecasts
  getMonthlyForecasts: protectedProcedure
    .input(
      z.object({
        months: z.number().min(1).max(3).default(1),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const forecast = await forecastDemand(
        ctx.user.organizationId,
        { forecastHorizonDays: (input?.months || 1) * 30 }
      );

      return {
        forecasts: forecast.monthlyForecasts,
        totalPredictedVolume: forecast.totalPredictedVolume,
        confidence: forecast.confidence,
      };
    }),

  // Get forecast by appointment type
  getForecastByAppointmentType: protectedProcedure
    .input(
      z.object({
        forecastDays: z.number().min(7).max(90).default(30),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const forecast = await forecastDemand(
        ctx.user.organizationId,
        { forecastHorizonDays: input?.forecastDays || 30 }
      );

      return {
        byAppointmentType: forecast.byAppointmentType,
        totalPredictedVolume: forecast.totalPredictedVolume,
        confidence: forecast.confidence,
      };
    }),

  // Get forecast by provider
  getForecastByProvider: protectedProcedure
    .input(
      z.object({
        forecastDays: z.number().min(7).max(90).default(30),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const forecast = await forecastDemand(
        ctx.user.organizationId,
        { forecastHorizonDays: input?.forecastDays || 30 }
      );

      return {
        byProvider: forecast.byProvider,
        totalPredictedVolume: forecast.totalPredictedVolume,
        confidence: forecast.confidence,
      };
    }),

  // Get staffing recommendations
  getStaffingRecommendations: protectedProcedure
    .input(
      z.object({
        forecastDays: z.number().min(7).max(30).default(14),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const forecast = await forecastDemand(
        ctx.user.organizationId,
        { forecastHorizonDays: input?.forecastDays || 14 }
      );

      return {
        recommendations: forecast.staffingRecommendations,
        capacityInsights: forecast.capacityInsights,
        totalPredictedVolume: forecast.totalPredictedVolume,
      };
    }),

  // Get capacity planning insights
  getCapacityInsights: protectedProcedure.query(async ({ ctx }) => {
    const forecast = await forecastDemand(ctx.user.organizationId);

    return {
      insights: forecast.capacityInsights,
      staffingRecommendations: forecast.staffingRecommendations,
      seasonalPatterns: forecast.seasonalPatterns,
      dayOfWeekFactors: forecast.dayOfWeekFactors,
    };
  }),

  // Get seasonal patterns
  getSeasonalPatterns: protectedProcedure.query(async ({ ctx }) => {
    const forecast = await forecastDemand(ctx.user.organizationId, {
      lookbackWeeks: 24, // Look back further for seasonal patterns
    });

    return {
      seasonalPatterns: forecast.seasonalPatterns,
      dayOfWeekFactors: forecast.dayOfWeekFactors,
      holidayImpacts: forecast.holidayImpacts,
    };
  }),

  // Save forecast to database
  saveForecast: adminProcedure
    .input(
      z.object({
        forecastDays: z.number().min(7).max(90).default(30),
      }).optional()
    )
    .mutation(async ({ ctx, input }) => {
      const forecast = await forecastDemand(
        ctx.user.organizationId,
        { forecastHorizonDays: input?.forecastDays || 30 }
      );

      await saveDemandForecast(ctx.user.organizationId, forecast);

      await auditLog('AI_DEMAND_FORECAST_SAVED', 'DemandForecast', {
        changes: {
          forecastDays: input?.forecastDays || 30,
          totalPredictedVolume: forecast.totalPredictedVolume,
          dataPointsUsed: forecast.dataPointsUsed,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        forecastsCreated: forecast.dailyForecasts.length,
        totalPredictedVolume: forecast.totalPredictedVolume,
      };
    }),

  // Track forecast accuracy for a specific date
  trackForecastAccuracy: adminProcedure
    .input(
      z.object({
        date: z.date(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const accuracy = await trackForecastAccuracy(
        ctx.user.organizationId,
        input.date
      );

      if (!accuracy) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No forecast found for this date',
        });
      }

      await auditLog('AI_FORECAST_ACCURACY_TRACKED', 'DemandForecast', {
        changes: {
          date: input.date,
          predictedVolume: accuracy.predictedVolume,
          actualVolume: accuracy.actualVolume,
          variance: accuracy.variance,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return accuracy;
    }),

  // Get forecast accuracy summary
  getForecastAccuracySummary: protectedProcedure
    .input(
      z.object({
        lookbackDays: z.number().min(7).max(90).default(30),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      return getForecastAccuracySummary(
        ctx.user.organizationId,
        input?.lookbackDays || 30
      );
    }),

  // Get demand forecast summary for dashboard
  getDemandSummary: protectedProcedure.query(async ({ ctx }) => {
    const forecast = await forecastDemand(ctx.user.organizationId);
    const accuracy = await getForecastAccuracySummary(ctx.user.organizationId);

    // Get next 7 days forecast
    const next7Days = forecast.dailyForecasts.slice(0, 7);
    const peakDay = next7Days.reduce((max, d) =>
      d.predictedVolume > max.predictedVolume ? d : max
    , next7Days[0]);
    const lowestDay = next7Days.reduce((min, d) =>
      d.predictedVolume < min.predictedVolume ? d : min
    , next7Days[0]);

    return {
      next7DaysTotal: next7Days.reduce((sum, d) => sum + d.predictedVolume, 0),
      next7DaysAverage: next7Days.reduce((sum, d) => sum + d.predictedVolume, 0) / 7,
      next30DaysTotal: forecast.totalPredictedVolume,
      peakDay: {
        date: peakDay?.date,
        dayName: peakDay?.dayName,
        predictedVolume: peakDay?.predictedVolume,
      },
      lowestDay: {
        date: lowestDay?.date,
        dayName: lowestDay?.dayName,
        predictedVolume: lowestDay?.predictedVolume,
      },
      capacityAlerts: forecast.capacityInsights.filter(i => i.actionRequired).length,
      seasonalPatternsDetected: forecast.seasonalPatterns.length,
      accuracy: {
        averageMape: accuracy.averageMape,
        withinConfidenceRate: accuracy.withinConfidenceRate,
      },
      lastUpdated: forecast.forecastGeneratedAt,
    };
  }),

  // ============================================
  // NO-SHOW PREDICTION
  // ============================================

  // Predict no-show risk for a single appointment
  predictNoShow: protectedProcedure
    .input(
      z.object({
        appointmentId: z.string(),
        config: z.object({
          criticalThreshold: z.number().min(50).max(100).optional(),
          highThreshold: z.number().min(40).max(90).optional(),
          mediumThreshold: z.number().min(20).max(70).optional(),
          lowThreshold: z.number().min(10).max(50).optional(),
          lookbackMonths: z.number().min(3).max(24).optional(),
          minAppointments: z.number().min(1).max(20).optional(),
          overbookingThreshold: z.number().min(5).max(50).optional(),
        }).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const prediction = await predictNoShow(
        ctx.user.organizationId,
        input.appointmentId,
        input.config as Partial<NoShowPredictionConfig> | undefined
      );

      if (!prediction) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Appointment not found or not in scheduled/confirmed status',
        });
      }

      return prediction;
    }),

  // Batch predict no-shows for upcoming appointments
  batchPredictNoShow: adminProcedure
    .input(
      z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        providerId: z.string().optional(),
        appointmentTypeId: z.string().optional(),
        minRiskLevel: z.enum(['critical', 'high', 'medium', 'low']).optional(),
        limit: z.number().min(1).max(500).optional(),
        saveResults: z.boolean().optional(),
      }).optional()
    )
    .mutation(async ({ ctx, input }) => {
      const result = await batchPredictNoShow({
        organizationId: ctx.user.organizationId,
        startDate: input?.startDate,
        endDate: input?.endDate,
        providerId: input?.providerId,
        appointmentTypeId: input?.appointmentTypeId,
        minRiskLevel: input?.minRiskLevel || 'low',
        limit: input?.limit || 100,
        saveResults: input?.saveResults || false,
      });

      await auditLog('AI_NOSHOW_BATCH_PREDICTION', 'Prediction', {
        changes: {
          processedCount: result.processedCount,
          atRiskCount: result.atRiskCount,
          byRiskLevel: result.byRiskLevel,
          aggregateStats: result.aggregateStats,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return result;
    }),

  // Get at-risk appointments list
  getAtRiskAppointments: protectedProcedure
    .input(
      z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        providerId: z.string().optional(),
        minRiskLevel: z.enum(['critical', 'high', 'medium', 'low']).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const result = await batchPredictNoShow({
        organizationId: ctx.user.organizationId,
        startDate: input?.startDate || new Date(),
        endDate: input?.endDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // Default 2 weeks
        providerId: input?.providerId,
        minRiskLevel: input?.minRiskLevel || 'medium',
        limit: (input?.limit || 50) + (input?.offset || 0),
      });

      // Apply offset
      const appointments = result.atRiskAppointments.slice(
        input?.offset || 0,
        (input?.offset || 0) + (input?.limit || 50)
      );

      return {
        appointments,
        total: result.atRiskCount,
        byRiskLevel: result.byRiskLevel,
        aggregateStats: result.aggregateStats,
      };
    }),

  // Get no-show risk summary
  getNoShowSummary: protectedProcedure
    .input(
      z.object({
        forecastDays: z.number().min(1).max(30).default(14),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const endDate = new Date(Date.now() + (input?.forecastDays || 14) * 24 * 60 * 60 * 1000);

      const [predictions, accuracy] = await Promise.all([
        batchPredictNoShow({
          organizationId: ctx.user.organizationId,
          startDate: new Date(),
          endDate,
          minRiskLevel: 'low',
          limit: 500,
        }),
        getNoShowPredictionAccuracy(ctx.user.organizationId),
      ]);

      return {
        totalAppointments: predictions.processedCount,
        atRiskAppointments: predictions.atRiskCount,
        byRiskLevel: predictions.byRiskLevel,
        aggregateStats: predictions.aggregateStats,
        overbookingRecommendations: predictions.overbookingRecommendations,
        accuracy: {
          overallAccuracy: accuracy.accuracy,
          precision: accuracy.precision,
          recall: accuracy.recall,
          f1Score: accuracy.f1Score,
        },
        lastUpdated: new Date(),
      };
    }),

  // Save no-show prediction
  saveNoShowPrediction: adminProcedure
    .input(z.object({ appointmentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const prediction = await predictNoShow(
        ctx.user.organizationId,
        input.appointmentId
      );

      if (!prediction) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Appointment not found or not in scheduled/confirmed status',
        });
      }

      await saveNoShowPrediction(ctx.user.organizationId, prediction);

      await auditLog('AI_NOSHOW_PREDICTION_SAVED', 'Prediction', {
        entityId: input.appointmentId,
        changes: {
          noShowProbability: prediction.noShowProbability,
          riskLevel: prediction.riskLevel,
          topRiskFactors: prediction.topRiskFactors,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true, prediction };
    }),

  // Track no-show prediction outcome
  trackNoShowOutcome: adminProcedure
    .input(
      z.object({
        appointmentId: z.string(),
        actuallyNoShowed: z.boolean(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await trackNoShowPredictionAccuracy(
        ctx.user.organizationId,
        input.appointmentId,
        input.actuallyNoShowed
      );

      await auditLog('AI_NOSHOW_OUTCOME_TRACKED', 'Prediction', {
        entityId: input.appointmentId,
        changes: {
          actuallyNoShowed: input.actuallyNoShowed,
          notes: input.notes,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // Get no-show prediction accuracy metrics
  getNoShowPredictionAccuracy: protectedProcedure.query(async ({ ctx }) => {
    return getNoShowPredictionAccuracy(ctx.user.organizationId);
  }),

  // Get interventions for high-risk appointments
  getInterventionsForRiskyAppointments: protectedProcedure
    .input(
      z.object({
        minRiskLevel: z.enum(['critical', 'high', 'medium']).default('high'),
        forecastDays: z.number().min(1).max(14).default(7),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const endDate = new Date(Date.now() + (input?.forecastDays || 7) * 24 * 60 * 60 * 1000);

      const result = await batchPredictNoShow({
        organizationId: ctx.user.organizationId,
        startDate: new Date(),
        endDate,
        minRiskLevel: input?.minRiskLevel || 'high',
        limit: 50,
      });

      // Extract and aggregate interventions
      const allInterventions = result.atRiskAppointments.flatMap((apt) =>
        apt.interventions.map((intervention) => ({
          ...intervention,
          appointmentId: apt.appointmentId,
          patientId: apt.patientId,
          patientName: apt.patientName,
          noShowProbability: apt.noShowProbability,
          riskLevel: apt.riskLevel,
          appointmentDateTime: apt.appointmentDetails.scheduledDateTime,
        }))
      );

      // Group by intervention type
      const byInterventionType = allInterventions.reduce((acc, intervention) => {
        const key = intervention.intervention;
        if (!acc[key]) {
          acc[key] = {
            intervention: key,
            description: intervention.description,
            count: 0,
            appointments: [],
          };
        }
        acc[key].count++;
        acc[key].appointments.push({
          appointmentId: intervention.appointmentId,
          patientName: intervention.patientName,
          noShowProbability: intervention.noShowProbability,
          appointmentDateTime: intervention.appointmentDateTime,
        });
        return acc;
      }, {} as Record<string, { intervention: string; description: string; count: number; appointments: { appointmentId: string; patientName: string; noShowProbability: number; appointmentDateTime: Date }[] }>);

      return {
        totalAtRiskAppointments: result.atRiskCount,
        interventionSummary: Object.values(byInterventionType),
        detailedInterventions: allInterventions.slice(0, 50),
        overbookingRecommendations: result.overbookingRecommendations,
      };
    }),

  // Get overbooking suggestions
  getOverbookingSuggestions: protectedProcedure
    .input(
      z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        providerId: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const startDate = input?.startDate || new Date();
      const endDate = input?.endDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

      const result = await batchPredictNoShow({
        organizationId: ctx.user.organizationId,
        startDate,
        endDate,
        providerId: input?.providerId,
        minRiskLevel: 'low',
        limit: 500,
      });

      // Group by day for daily overbooking recommendations
      const byDay = result.atRiskAppointments.reduce((acc, apt) => {
        const dayKey = apt.appointmentDetails.scheduledDateTime.toISOString().split('T')[0];
        if (!acc[dayKey]) {
          acc[dayKey] = {
            date: dayKey,
            appointments: [],
            totalExpectedNoShows: 0,
            averageNoShowRisk: 0,
          };
        }
        acc[dayKey].appointments.push(apt);
        acc[dayKey].totalExpectedNoShows += apt.noShowProbability / 100;
        return acc;
      }, {} as Record<string, { date: string; appointments: typeof result.atRiskAppointments; totalExpectedNoShows: number; averageNoShowRisk: number }>);

      // Calculate daily recommendations
      const dailyRecommendations = Object.values(byDay).map((day) => {
        const avgRisk = day.appointments.reduce((sum, a) => sum + a.noShowProbability, 0) / day.appointments.length;
        day.averageNoShowRisk = avgRisk;

        return {
          date: day.date,
          appointmentCount: day.appointments.length,
          expectedNoShows: Math.round(day.totalExpectedNoShows * 10) / 10,
          averageNoShowRisk: Math.round(avgRisk * 10) / 10,
          recommendedOverbooking: day.totalExpectedNoShows >= 1 ? Math.min(3, Math.ceil(day.totalExpectedNoShows * 0.5)) : 0,
          riskLevel: avgRisk >= 30 ? 'high' : avgRisk >= 15 ? 'moderate' : 'low',
        };
      });

      return {
        dailyRecommendations: dailyRecommendations.sort((a, b) => a.date.localeCompare(b.date)),
        aggregateStats: result.aggregateStats,
        summary: {
          totalAppointments: result.processedCount,
          totalExpectedNoShows: result.aggregateStats.expectedNoShows,
          averageNoShowRisk: result.aggregateStats.averageNoShowRisk,
          totalRecommendedOverbooking: dailyRecommendations.reduce((sum, d) => sum + d.recommendedOverbooking, 0),
        },
      };
    }),

  // Get confirmation strategy recommendations
  getConfirmationStrategies: protectedProcedure
    .input(
      z.object({
        forecastDays: z.number().min(1).max(14).default(7),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const endDate = new Date(Date.now() + (input?.forecastDays || 7) * 24 * 60 * 60 * 1000);

      const result = await batchPredictNoShow({
        organizationId: ctx.user.organizationId,
        startDate: new Date(),
        endDate,
        minRiskLevel: 'low',
        limit: 200,
      });

      // Group by confirmation strategy needs
      const needsMultiChannel = result.atRiskAppointments.filter(
        (apt) => apt.confirmationStrategy.reminderChannels.length >= 3
      );
      const needsPhoneCall = result.atRiskAppointments.filter(
        (apt) => apt.confirmationStrategy.reminderChannels.includes('phone')
      );
      const requiresConfirmation = result.atRiskAppointments.filter(
        (apt) => apt.confirmationStrategy.requireConfirmation && !apt.appointmentDetails.appointmentType.includes('Confirmed')
      );
      const escalationNeeded = result.atRiskAppointments.filter(
        (apt) => apt.confirmationStrategy.escalateIfNoConfirmation
      );

      return {
        summary: {
          totalAppointments: result.processedCount,
          needsMultiChannelReminders: needsMultiChannel.length,
          needsPhoneCall: needsPhoneCall.length,
          needsConfirmation: requiresConfirmation.length,
          needsEscalation: escalationNeeded.length,
        },
        byPriority: {
          immediate: result.atRiskAppointments
            .filter((apt) => apt.interventions.some((i) => i.timing === 'immediate'))
            .map((apt) => ({
              appointmentId: apt.appointmentId,
              patientName: apt.patientName,
              appointmentDateTime: apt.appointmentDetails.scheduledDateTime,
              noShowProbability: apt.noShowProbability,
              strategy: apt.confirmationStrategy,
            }))
            .slice(0, 20),
          dayBefore: result.atRiskAppointments
            .filter((apt) => apt.interventions.some((i) => i.timing === 'day_before'))
            .length,
          weekBefore: result.atRiskAppointments
            .filter((apt) => apt.interventions.some((i) => i.timing === 'week_before'))
            .length,
        },
      };
    }),

  // ============================================
  // REVENUE FORECASTING
  // ============================================

  // Forecast revenue for the organization
  forecastRevenue: protectedProcedure
    .input(
      z.object({
        config: z.object({
          lookbackMonths: z.number().min(3).max(24).optional(),
          forecastHorizonMonths: z.number().min(1).max(12).optional(),
          minDataPoints: z.number().min(10).max(200).optional(),
          includeCharges: z.boolean().optional(),
          includeCollections: z.boolean().optional(),
          includeAR: z.boolean().optional(),
          includeNewPatients: z.boolean().optional(),
          confidenceLevel: z.number().min(0.8).max(0.99).optional(),
          includeScenarios: z.boolean().optional(),
        }).optional(),
        goals: z.array(z.object({
          type: z.enum(['monthly', 'quarterly', 'annual']),
          amount: z.number().positive(),
          period: z.string(),
        })).optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const forecast = await forecastRevenue(
        ctx.user.organizationId,
        input?.config as Partial<RevenueForecastConfig> | undefined,
        { goals: input?.goals }
      );

      return forecast;
    }),

  // Get monthly revenue forecasts
  getMonthlyRevenueForecasts: protectedProcedure
    .input(
      z.object({
        months: z.number().min(1).max(12).default(3),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const forecast = await forecastRevenue(
        ctx.user.organizationId,
        { forecastHorizonMonths: input?.months || 3 }
      );

      return {
        forecasts: forecast.monthlyForecasts,
        totalPredictedRevenue: forecast.totalPredictedRevenue,
        averageMonthlyRevenue: forecast.averageMonthlyRevenue,
        confidence: forecast.confidence,
      };
    }),

  // Get collections forecast
  getCollectionsForecast: protectedProcedure
    .input(
      z.object({
        months: z.number().min(1).max(6).default(3),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const forecast = await forecastRevenue(
        ctx.user.organizationId,
        { forecastHorizonMonths: input?.months || 3 }
      );

      return {
        forecasts: forecast.collectionsForecast,
        totalPredictedCollections: forecast.totalPredictedCollections,
        confidence: forecast.confidence,
      };
    }),

  // Get AR recovery predictions
  getARRecoveryPrediction: protectedProcedure.query(async ({ ctx }) => {
    const forecast = await forecastRevenue(ctx.user.organizationId);

    return {
      prediction: forecast.arRecoveryPrediction,
      totalARRecovery: forecast.totalARRecovery,
      confidence: forecast.confidence,
    };
  }),

  // Get new patient revenue impact
  getNewPatientRevenueImpact: protectedProcedure.query(async ({ ctx }) => {
    const forecast = await forecastRevenue(ctx.user.organizationId);

    return {
      impact: forecast.newPatientImpact,
      totalNewPatientRevenue: forecast.totalNewPatientRevenue,
      confidence: forecast.confidence,
    };
  }),

  // Get revenue scenarios
  getRevenueScenarios: protectedProcedure
    .input(
      z.object({
        forecastMonths: z.number().min(1).max(12).default(3),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const forecast = await forecastRevenue(
        ctx.user.organizationId,
        {
          forecastHorizonMonths: input?.forecastMonths || 3,
          includeScenarios: true,
        }
      );

      return {
        scenarios: forecast.scenarios,
        expectedScenario: forecast.expectedScenario,
        confidence: forecast.confidence,
      };
    }),

  // Get goal attainment probability
  getGoalAttainment: protectedProcedure
    .input(
      z.object({
        goals: z.array(z.object({
          type: z.enum(['monthly', 'quarterly', 'annual']),
          amount: z.number().positive(),
          period: z.string(),
        })),
        forecastMonths: z.number().min(1).max(12).default(3),
      })
    )
    .query(async ({ ctx, input }) => {
      const forecast = await forecastRevenue(
        ctx.user.organizationId,
        { forecastHorizonMonths: input.forecastMonths },
        { goals: input.goals }
      );

      return {
        goalAttainment: forecast.goalAttainment,
        totalPredictedRevenue: forecast.totalPredictedRevenue,
        overallConfidenceInterval: forecast.overallConfidenceInterval,
        confidence: forecast.confidence,
      };
    }),

  // Get revenue variance analysis
  getRevenueVarianceAnalysis: protectedProcedure
    .input(
      z.object({
        lookbackMonths: z.number().min(1).max(12).default(6),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const forecast = await forecastRevenue(
        ctx.user.organizationId,
        { lookbackMonths: input?.lookbackMonths || 6 }
      );

      return {
        variance: forecast.historicalVariance,
        confidence: forecast.confidence,
        modelVersion: forecast.modelVersion,
      };
    }),

  // Save revenue forecast to database
  saveRevenueForecast: adminProcedure
    .input(
      z.object({
        forecastMonths: z.number().min(1).max(12).default(3),
      }).optional()
    )
    .mutation(async ({ ctx, input }) => {
      const forecast = await forecastRevenue(
        ctx.user.organizationId,
        { forecastHorizonMonths: input?.forecastMonths || 3 }
      );

      await saveRevenueForecast(ctx.user.organizationId, forecast);

      await auditLog('AI_REVENUE_FORECAST_SAVED', 'Prediction', {
        changes: {
          forecastMonths: input?.forecastMonths || 3,
          totalPredictedRevenue: forecast.totalPredictedRevenue,
          totalPredictedCharges: forecast.totalPredictedCharges,
          totalPredictedCollections: forecast.totalPredictedCollections,
          dataPointsUsed: forecast.dataPointsUsed,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        totalPredictedRevenue: forecast.totalPredictedRevenue,
        confidence: forecast.confidence,
      };
    }),

  // Track revenue forecast accuracy
  trackRevenueForecastAccuracy: adminProcedure
    .input(
      z.object({
        year: z.number().min(2020).max(2030),
        month: z.number().min(1).max(12),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const accuracy = await trackRevenueForecastAccuracy(
        ctx.user.organizationId,
        input
      );

      if (!accuracy) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No revenue forecast found for this period',
        });
      }

      await auditLog('AI_REVENUE_FORECAST_ACCURACY_TRACKED', 'Prediction', {
        changes: {
          period: accuracy.period,
          predictedRevenue: accuracy.predictedRevenue,
          actualRevenue: accuracy.actualRevenue,
          variance: accuracy.variance,
          variancePercent: accuracy.variancePercent,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return accuracy;
    }),

  // Get revenue forecast accuracy summary
  getRevenueForecastAccuracySummary: protectedProcedure
    .input(
      z.object({
        lookbackMonths: z.number().min(1).max(12).default(6),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      return getRevenueForecastAccuracySummary(
        ctx.user.organizationId,
        input?.lookbackMonths || 6
      );
    }),

  // Get revenue forecast summary for dashboard
  getRevenueSummary: protectedProcedure.query(async ({ ctx }) => {
    const forecast = await forecastRevenue(ctx.user.organizationId);
    const accuracy = await getRevenueForecastAccuracySummary(ctx.user.organizationId);

    // Get next 3 months forecast
    const next3Months = forecast.monthlyForecasts.slice(0, 3);

    return {
      // Summary projections
      next3MonthsRevenue: next3Months.reduce((sum, m) => sum + m.predictedRevenue, 0),
      averageMonthlyRevenue: forecast.averageMonthlyRevenue,

      // Component breakdown
      totalCharges: forecast.totalPredictedCharges,
      totalCollections: forecast.totalPredictedCollections,
      totalARRecovery: forecast.totalARRecovery,
      totalNewPatientRevenue: forecast.totalNewPatientRevenue,

      // Monthly breakdown
      byMonth: next3Months.map(m => ({
        month: m.monthName,
        year: m.year,
        predictedRevenue: m.predictedRevenue,
        predictedCharges: m.predictedCharges,
        predictedCollections: m.predictedCollections,
        confidence: m.confidence,
        trend: m.trend,
      })),

      // Scenarios
      optimisticRevenue: forecast.scenarios.find(s => s.scenario === 'optimistic')?.totalRevenue || 0,
      pessimisticRevenue: forecast.scenarios.find(s => s.scenario === 'pessimistic')?.totalRevenue || 0,

      // AR insights
      arInsights: {
        totalARBalance: forecast.arRecoveryPrediction.totalARBalance,
        expected30DayRecovery: forecast.arRecoveryPrediction.predictedRecovery30Days,
        badDebtRisk: forecast.arRecoveryPrediction.badDebtRisk,
      },

      // Goal attainment
      goalAttainment: forecast.goalAttainment.length > 0 ? {
        probability: forecast.goalAttainment[0].probability,
        gap: forecast.goalAttainment[0].gap,
        suggestedActionsCount: forecast.goalAttainment[0].suggestedActions.length,
      } : null,

      // Confidence and accuracy
      confidence: forecast.confidence,
      confidenceInterval: forecast.overallConfidenceInterval,
      accuracy: {
        averageMape: accuracy.averageMape,
        withinConfidenceRate: accuracy.withinConfidenceRate,
      },

      lastUpdated: forecast.forecastGeneratedAt,
    };
  }),

  // ============================================
  // TREATMENT OUTCOME PREDICTION
  // ============================================

  // Predict treatment outcome for a patient
  predictOutcome: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        treatmentPlanId: z.string().optional(),
        config: z.object({
          confidenceThreshold: z.number().min(0).max(1).optional(),
          minSimilarCases: z.number().min(1).max(100).optional(),
          excellentThreshold: z.number().min(50).max(100).optional(),
          goodThreshold: z.number().min(30).max(90).optional(),
          moderateThreshold: z.number().min(10).max(70).optional(),
          includeComorbidities: z.boolean().optional(),
          includeSimilarCases: z.boolean().optional(),
          includeHistoricalOutcomes: z.boolean().optional(),
          shortTermWeeks: z.number().min(1).max(12).optional(),
          mediumTermWeeks: z.number().min(4).max(24).optional(),
          longTermWeeks: z.number().min(8).max(52).optional(),
        }).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const prediction = await predictOutcome(
        ctx.user.organizationId,
        input.patientId,
        input.treatmentPlanId,
        input.config as Partial<TreatmentOutcomePredictionConfig> | undefined
      );

      if (!prediction) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found or not active',
        });
      }

      await auditLog('AI_OUTCOME_PREDICTION', 'Prediction', {
        entityId: input.patientId,
        changes: {
          predictedOutcome: prediction.predictedOutcome,
          predictedImprovement: prediction.predictedImprovement,
          confidenceScore: prediction.confidenceScore,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return prediction;
    }),

  // Batch predict outcomes for multiple patients
  batchPredictOutcome: adminProcedure
    .input(
      z.object({
        patientIds: z.array(z.string()).optional(),
        treatmentPlanIds: z.array(z.string()).optional(),
        conditionCodes: z.array(z.string()).optional(),
        minConfidence: z.number().min(0).max(1).optional(),
        limit: z.number().min(1).max(200).optional(),
        saveResults: z.boolean().optional(),
      }).optional()
    )
    .mutation(async ({ ctx, input }) => {
      const result = await batchPredictOutcome({
        organizationId: ctx.user.organizationId,
        patientIds: input?.patientIds,
        treatmentPlanIds: input?.treatmentPlanIds,
        conditionCodes: input?.conditionCodes,
        minConfidence: input?.minConfidence,
        limit: input?.limit || 50,
        saveResults: input?.saveResults || false,
      });

      await auditLog('AI_BATCH_OUTCOME_PREDICTION', 'Prediction', {
        changes: {
          processedCount: result.processedCount,
          savedCount: result.savedCount,
          byResponseLevel: result.byResponseLevel,
          averagePredictedImprovement: result.averagePredictedImprovement,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return result;
    }),

  // Get outcome predictions list
  getOutcomePredictions: protectedProcedure
    .input(
      z.object({
        minResponseLevel: z.enum(['excellent', 'good', 'moderate', 'poor']).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const result = await batchPredictOutcome({
        organizationId: ctx.user.organizationId,
        minConfidence: 0.3,
        limit: (input?.limit || 50) + (input?.offset || 0),
      });

      // Filter by response level if specified
      let predictions = result.predictions;
      if (input?.minResponseLevel) {
        const levelOrder = { 'excellent': 4, 'good': 3, 'moderate': 2, 'poor': 1, 'unknown': 0 };
        const minLevel = levelOrder[input.minResponseLevel];
        predictions = predictions.filter(p => levelOrder[p.predictedOutcome] >= minLevel);
      }

      // Apply offset
      predictions = predictions.slice(
        input?.offset || 0,
        (input?.offset || 0) + (input?.limit || 50)
      );

      return {
        predictions,
        total: result.processedCount,
        byResponseLevel: result.byResponseLevel,
        averagePredictedImprovement: result.averagePredictedImprovement,
      };
    }),

  // Get outcome prediction summary
  getOutcomeSummary: protectedProcedure.query(async ({ ctx }) => {
    const [predictions, accuracy] = await Promise.all([
      batchPredictOutcome({
        organizationId: ctx.user.organizationId,
        limit: 100,
      }),
      getOutcomePredictionAccuracy(ctx.user.organizationId),
    ]);

    return {
      totalPatients: predictions.processedCount,
      byResponseLevel: predictions.byResponseLevel,
      averagePredictedImprovement: predictions.averagePredictedImprovement,
      averageConfidence: predictions.averageConfidence,
      accuracy: {
        overall: accuracy.overall.accuracy,
        mape: accuracy.mape,
        byResponseLevel: accuracy.byResponseLevel,
      },
      topPredictions: predictions.predictions.slice(0, 5).map(p => ({
        patientId: p.patientId,
        patientName: p.patientName,
        predictedOutcome: p.predictedOutcome,
        predictedImprovement: p.predictedImprovement,
        conditionDescription: p.conditionDescription,
      })),
      lastUpdated: new Date(),
    };
  }),

  // Save outcome prediction
  saveOutcomePrediction: adminProcedure
    .input(z.object({
      patientId: z.string(),
      treatmentPlanId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const prediction = await predictOutcome(
        ctx.user.organizationId,
        input.patientId,
        input.treatmentPlanId
      );

      if (!prediction) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found or not active',
        });
      }

      await saveOutcomePrediction(ctx.user.organizationId, prediction);

      await auditLog('AI_OUTCOME_PREDICTION_SAVED', 'Prediction', {
        entityId: input.patientId,
        changes: {
          predictedOutcome: prediction.predictedOutcome,
          predictedImprovement: prediction.predictedImprovement,
          treatmentPlanId: input.treatmentPlanId,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true, prediction };
    }),

  // Track actual outcome for accuracy measurement
  trackOutcomeAccuracy: adminProcedure
    .input(
      z.object({
        patientId: z.string(),
        treatmentPlanId: z.string(),
        actualImprovement: z.number().min(0).max(100),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await trackOutcomePredictionAccuracy(
        ctx.user.organizationId,
        input.patientId,
        input.treatmentPlanId,
        input.actualImprovement,
        input.notes
      );

      if (!result) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No outcome prediction found for this patient and treatment plan',
        });
      }

      await auditLog('AI_OUTCOME_ACCURACY_TRACKED', 'Prediction', {
        entityId: input.patientId,
        changes: {
          predictedImprovement: result.predictedImprovement,
          actualImprovement: result.actualImprovement,
          variance: result.variance,
          wasAccurate: result.wasAccurate,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return result;
    }),

  // Get outcome prediction accuracy metrics
  getOutcomePredictionAccuracy: protectedProcedure.query(async ({ ctx }) => {
    return getOutcomePredictionAccuracy(ctx.user.organizationId);
  }),

  // Get similar patients analysis for a condition
  getSimilarPatientsAnalysis: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        treatmentPlanId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const prediction = await predictOutcome(
        ctx.user.organizationId,
        input.patientId,
        input.treatmentPlanId,
        { includeSimilarCases: true }
      );

      if (!prediction) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found or not active',
        });
      }

      return {
        similarCasesAnalysis: prediction.similarCasesAnalysis,
        patientComparison: prediction.patientComparison,
        conditionCode: prediction.conditionCode,
        conditionDescription: prediction.conditionDescription,
      };
    }),

  // Get optimal treatment duration for a patient
  getOptimalTreatmentDuration: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        treatmentPlanId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const prediction = await predictOutcome(
        ctx.user.organizationId,
        input.patientId,
        input.treatmentPlanId
      );

      if (!prediction) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found or not active',
        });
      }

      return {
        optimalDuration: prediction.optimalDuration,
        expectedTimelineWeeks: prediction.expectedTimelineWeeks,
        improvementTimeline: prediction.improvementTimeline,
        conditionDescription: prediction.conditionDescription,
      };
    }),

  // Get non-response risk assessment
  getNonResponseRisk: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        treatmentPlanId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const prediction = await predictOutcome(
        ctx.user.organizationId,
        input.patientId,
        input.treatmentPlanId
      );

      if (!prediction) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found or not active',
        });
      }

      return {
        nonResponseRisk: prediction.nonResponseRisk,
        riskOfChronicity: prediction.riskOfChronicity,
        topNegativeFactors: prediction.topNegativeFactors,
        modifiableFactors: prediction.modifiableFactors.map(f => ({
          name: f.name,
          value: f.value,
          impact: f.impact,
          improvementSuggestion: f.improvementSuggestion,
        })),
      };
    }),

  // Get patient communication content
  getPatientCommunication: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        treatmentPlanId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const prediction = await predictOutcome(
        ctx.user.organizationId,
        input.patientId,
        input.treatmentPlanId
      );

      if (!prediction) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found or not active',
        });
      }

      return {
        patientExplanation: prediction.patientExplanation,
        expectationPoints: prediction.expectationPoints,
        homeInstructions: prediction.homeInstructions,
        predictedOutcome: prediction.predictedOutcome,
        predictedImprovement: prediction.predictedImprovement,
        expectedTimelineWeeks: prediction.expectedTimelineWeeks,
      };
    }),

  // ============================================
  // TREND DETECTION AND ALERTS
  // ============================================

  // Detect trends for a specific metric
  detectTrends: protectedProcedure
    .input(
      z.object({
        metricType: z.enum([
          'revenue',
          'patient_volume',
          'new_patients',
          'no_shows',
          'cancellations',
          'collections',
          'ar_balance',
          'payer_mix',
          'visit_frequency',
          'treatment_completion',
          'patient_satisfaction',
          'custom',
        ]),
        config: z.object({
          lookbackDays: z.number().min(7).max(365).optional(),
          minDataPoints: z.number().min(5).max(100).optional(),
          trendSensitivity: z.number().min(0).max(1).optional(),
          significanceThreshold: z.number().min(0.01).max(0.2).optional(),
          anomalyThreshold: z.number().min(1.5).max(4).optional(),
          anomalySensitivity: z.number().min(0).max(1).optional(),
          enableAlerts: z.boolean().optional(),
          alertCooldownHours: z.number().min(1).max(168).optional(),
        }).optional(),
        entityType: z.string().optional(),
        entityId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const analysis = await detectTrends(
        ctx.user.organizationId,
        input.metricType as TrendMetricType,
        input.config as Partial<TrendDetectionConfig> | undefined,
        { entityType: input.entityType, entityId: input.entityId }
      );

      if (!analysis) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Insufficient data for trend analysis',
        });
      }

      return analysis;
    }),

  // Batch detect trends for multiple metrics
  batchDetectTrends: adminProcedure
    .input(
      z.object({
        metricTypes: z.array(z.enum([
          'revenue',
          'patient_volume',
          'new_patients',
          'no_shows',
          'cancellations',
          'collections',
          'ar_balance',
          'payer_mix',
          'visit_frequency',
          'treatment_completion',
          'patient_satisfaction',
          'custom',
        ])).optional(),
        lookbackDays: z.number().min(7).max(365).optional(),
        includeForecasts: z.boolean().optional(),
        includeAlerts: z.boolean().optional(),
        saveResults: z.boolean().optional(),
        entityType: z.string().optional(),
        entityId: z.string().optional(),
      }).optional()
    )
    .mutation(async ({ ctx, input }) => {
      const result = await batchDetectTrends({
        organizationId: ctx.user.organizationId,
        metricTypes: input?.metricTypes as TrendMetricType[] | undefined,
        lookbackDays: input?.lookbackDays,
        includeForecasts: input?.includeForecasts,
        includeAlerts: input?.includeAlerts,
        saveResults: input?.saveResults,
        entityType: input?.entityType,
        entityId: input?.entityId,
      });

      await auditLog('AI_TREND_DETECTION_BATCH', 'TrendAnalysis', {
        changes: {
          metricsAnalyzed: result.metricsAnalyzed,
          alertsGenerated: result.alertsGenerated,
          anomaliesDetected: result.anomaliesDetected,
          practiceHealthScore: result.practiceHealthScore,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return result;
    }),

  // Get revenue trend analysis
  getRevenueTrends: protectedProcedure
    .input(
      z.object({
        lookbackDays: z.number().min(7).max(365).default(90),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const analysis = await detectTrends(
        ctx.user.organizationId,
        'revenue',
        { lookbackDays: input?.lookbackDays || 90 }
      );

      return analysis;
    }),

  // Get patient volume trends
  getPatientVolumeTrends: protectedProcedure
    .input(
      z.object({
        lookbackDays: z.number().min(7).max(365).default(90),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const analysis = await detectTrends(
        ctx.user.organizationId,
        'patient_volume',
        { lookbackDays: input?.lookbackDays || 90 }
      );

      return analysis;
    }),

  // Get payer mix trends
  getPayerMixTrends: protectedProcedure
    .input(
      z.object({
        lookbackDays: z.number().min(30).max(365).default(90),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const analysis = await detectTrends(
        ctx.user.organizationId,
        'payer_mix',
        { lookbackDays: input?.lookbackDays || 90 }
      );

      return analysis;
    }),

  // Get all detected anomalies
  getAnomalies: protectedProcedure
    .input(
      z.object({
        metricType: z.enum([
          'revenue',
          'patient_volume',
          'new_patients',
          'no_shows',
          'cancellations',
          'collections',
          'ar_balance',
          'payer_mix',
        ]).optional(),
        severity: z.enum(['critical', 'high', 'medium', 'low', 'info']).optional(),
        lookbackDays: z.number().min(7).max(90).default(30),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const metrics = input?.metricType
        ? [input.metricType as TrendMetricType]
        : ['revenue', 'patient_volume', 'no_shows', 'collections'] as TrendMetricType[];

      const allAnomalies: { metricType: string; anomalies: unknown[] }[] = [];

      for (const metric of metrics) {
        const analysis = await detectTrends(
          ctx.user.organizationId,
          metric,
          { lookbackDays: input?.lookbackDays || 30 }
        );

        if (analysis) {
          let anomalies = analysis.anomalies;
          if (input?.severity) {
            anomalies = anomalies.filter(a => a.severity === input.severity);
          }
          if (anomalies.length > 0) {
            allAnomalies.push({
              metricType: metric,
              anomalies,
            });
          }
        }
      }

      return {
        totalAnomalies: allAnomalies.reduce((sum, m) => sum + m.anomalies.length, 0),
        byMetric: allAnomalies,
      };
    }),

  // Get alert summary
  getAlertSummary: protectedProcedure.query(async ({ ctx }) => {
    return getAlertSummary(ctx.user.organizationId);
  }),

  // Get active alerts
  getActiveAlerts: protectedProcedure
    .input(
      z.object({
        metricType: z.enum([
          'revenue',
          'patient_volume',
          'new_patients',
          'no_shows',
          'cancellations',
          'collections',
          'ar_balance',
          'payer_mix',
        ]).optional(),
        severity: z.enum(['critical', 'high', 'medium', 'low', 'info']).optional(),
        limit: z.number().min(1).max(100).default(50),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const summary = await getAlertSummary(ctx.user.organizationId);

      let alerts = summary.unresolvedAlerts;

      if (input?.metricType) {
        alerts = alerts.filter(a => a.metricType === input.metricType);
      }
      if (input?.severity) {
        alerts = alerts.filter(a => a.severity === input.severity);
      }

      return {
        alerts: alerts.slice(0, input?.limit || 50),
        total: alerts.length,
        bySeverity: summary.bySeverity,
      };
    }),

  // Acknowledge an alert
  acknowledgeAlert: protectedProcedure
    .input(
      z.object({
        alertId: z.string(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Update the trend analysis record
      await ctx.prisma.trendAnalysis.update({
        where: { id: input.alertId },
        data: {
          // Mark as acknowledged (using recommendations field for notes)
          recommendations: {
            acknowledged: true,
            acknowledgedAt: new Date().toISOString(),
            acknowledgedBy: ctx.user.id,
            notes: input.notes,
          },
        },
      });

      await auditLog('AI_TREND_ALERT_ACKNOWLEDGED', 'TrendAnalysis', {
        entityId: input.alertId,
        changes: {
          acknowledgedBy: ctx.user.id,
          notes: input.notes,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // Resolve an alert
  resolveAlert: protectedProcedure
    .input(
      z.object({
        alertId: z.string(),
        resolutionNotes: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.trendAnalysis.update({
        where: { id: input.alertId },
        data: {
          alertTriggered: false,
          recommendations: {
            resolved: true,
            resolvedAt: new Date().toISOString(),
            resolvedBy: ctx.user.id,
            resolutionNotes: input.resolutionNotes,
          },
        },
      });

      await auditLog('AI_TREND_ALERT_RESOLVED', 'TrendAnalysis', {
        entityId: input.alertId,
        changes: {
          resolvedBy: ctx.user.id,
          resolutionNotes: input.resolutionNotes,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // Get trend explanation
  getTrendExplanation: protectedProcedure
    .input(
      z.object({
        metricType: z.enum([
          'revenue',
          'patient_volume',
          'new_patients',
          'no_shows',
          'cancellations',
          'collections',
          'ar_balance',
          'payer_mix',
        ]),
        lookbackDays: z.number().min(7).max(365).default(90),
      })
    )
    .query(async ({ ctx, input }) => {
      const analysis = await detectTrends(
        ctx.user.organizationId,
        input.metricType as TrendMetricType,
        { lookbackDays: input.lookbackDays }
      );

      if (!analysis) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Insufficient data for trend analysis',
        });
      }

      return {
        explanation: analysis.explanation,
        trend: analysis.trend,
        recommendedActions: analysis.recommendedActions,
      };
    }),

  // Get recommended actions based on trends
  getTrendRecommendations: protectedProcedure
    .input(
      z.object({
        category: z.enum(['operational', 'marketing', 'financial', 'clinical', 'administrative']).optional(),
        priority: z.enum(['immediate', 'soon', 'scheduled']).optional(),
        limit: z.number().min(1).max(50).default(10),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const result = await batchDetectTrends({
        organizationId: ctx.user.organizationId,
        lookbackDays: 90,
      });

      let recommendations = result.topRecommendations;

      if (input?.category) {
        recommendations = recommendations.filter(r => r.category === input.category);
      }
      if (input?.priority) {
        recommendations = recommendations.filter(r => r.priority === input.priority);
      }

      return {
        recommendations: recommendations.slice(0, input?.limit || 10),
        total: recommendations.length,
        practiceHealthScore: result.practiceHealthScore,
        practiceHealthTrend: result.practiceHealthTrend,
      };
    }),

  // Save trend analysis to database
  saveTrendAnalysis: adminProcedure
    .input(
      z.object({
        metricType: z.enum([
          'revenue',
          'patient_volume',
          'new_patients',
          'no_shows',
          'cancellations',
          'collections',
          'ar_balance',
          'payer_mix',
        ]),
        lookbackDays: z.number().min(7).max(365).default(90),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const analysis = await detectTrends(
        ctx.user.organizationId,
        input.metricType as TrendMetricType,
        { lookbackDays: input.lookbackDays }
      );

      if (!analysis) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Insufficient data for trend analysis',
        });
      }

      await saveTrendAnalysis(ctx.user.organizationId, analysis);

      await auditLog('AI_TREND_ANALYSIS_SAVED', 'TrendAnalysis', {
        changes: {
          metricType: input.metricType,
          trend: analysis.trend.direction,
          changePercent: analysis.changePercent,
          anomaliesDetected: analysis.anomalies.length,
          alertsGenerated: analysis.alerts.length,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        trend: analysis.trend,
        anomalies: analysis.anomalies.length,
        alerts: analysis.alerts.length,
      };
    }),

  // Track trend prediction accuracy
  trackTrendAccuracy: adminProcedure
    .input(
      z.object({
        metricType: z.enum([
          'revenue',
          'patient_volume',
          'new_patients',
          'no_shows',
          'collections',
          'ar_balance',
        ]),
        forecastDate: z.date(),
        actualValue: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const accuracy = await trackTrendAccuracy(
        ctx.user.organizationId,
        input.metricType as TrendMetricType,
        input.forecastDate,
        input.actualValue
      );

      if (!accuracy) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No trend forecast found for this date and metric',
        });
      }

      await auditLog('AI_TREND_ACCURACY_TRACKED', 'TrendAnalysis', {
        changes: {
          metricType: input.metricType,
          forecastDate: input.forecastDate,
          actualValue: input.actualValue,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return accuracy;
    }),

  // Get trend accuracy summary
  getTrendAccuracySummary: protectedProcedure
    .input(
      z.object({
        lookbackDays: z.number().min(30).max(365).default(90),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      return getTrendAccuracySummary(
        ctx.user.organizationId,
        input?.lookbackDays || 90
      );
    }),

  // Compare trends between two periods
  compareTrends: protectedProcedure
    .input(
      z.object({
        metricType: z.enum([
          'revenue',
          'patient_volume',
          'new_patients',
          'no_shows',
          'cancellations',
          'collections',
          'ar_balance',
          'payer_mix',
        ]),
        period1: z.object({
          start: z.date(),
          end: z.date(),
          label: z.string(),
        }),
        period2: z.object({
          start: z.date(),
          end: z.date(),
          label: z.string(),
        }),
      })
    )
    .query(async ({ ctx, input }) => {
      const comparison = await compareTrends(
        ctx.user.organizationId,
        input.metricType as TrendMetricType,
        input.period1,
        input.period2
      );

      return comparison;
    }),

  // Get trend dashboard summary
  getTrendSummary: protectedProcedure.query(async ({ ctx }) => {
    const result = await batchDetectTrends({
      organizationId: ctx.user.organizationId,
      lookbackDays: 90,
    });

    const alertSummary = await getAlertSummary(ctx.user.organizationId);

    return {
      // Overall health
      practiceHealthScore: result.practiceHealthScore,
      practiceHealthTrend: result.practiceHealthTrend,

      // Trend summary
      metricsAnalyzed: result.metricsAnalyzed,
      positiveMetrics: result.summaryInsights.positiveMetrics,
      negativeMetrics: result.summaryInsights.negativeMetrics,
      stableMetrics: result.summaryInsights.stableMetrics,

      // Alerts
      totalAlerts: alertSummary.totalActiveAlerts,
      criticalAlerts: alertSummary.bySeverity.critical,
      highAlerts: alertSummary.bySeverity.high,
      alertTrend: alertSummary.alertTrend,

      // Anomalies
      totalAnomalies: result.anomaliesDetected,

      // Top recommendations
      topRecommendations: result.topRecommendations.slice(0, 3),

      // Key metrics snapshot
      keyMetrics: result.analyses.slice(0, 6).map(a => ({
        metricType: a.metricType,
        metricLabel: a.metricLabel,
        currentValue: a.currentValue,
        changePercent: a.changePercent,
        trend: a.trend.direction,
        alertCount: a.alerts.length,
      })),

      lastUpdated: result.analysisDate,
    };
  }),
});
