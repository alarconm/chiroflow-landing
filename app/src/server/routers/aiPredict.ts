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
  type ChurnPredictionConfig,
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
});
