/**
 * Epic 09: AI Billing Agent - Router
 *
 * tRPC router for autonomous billing operations with AI-powered capabilities.
 * Provides pre-submission claim scrubbing, denial prediction, appeal generation,
 * payment matching, underpayment detection, and batch job management.
 */

import { z } from 'zod';
import { router, protectedProcedure, billerProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import {
  ClaimScrubber,
  DenialPredictor,
  AppealGenerator,
  PaymentMatcher,
  UnderpaymentDetector,
  ClaimSubmitter,
  DenialAnalyzer,
  AutomatedAppealGenerator,
  ClaimFollowUpAgent,
  SmartPaymentPoster,
} from '@/lib/ai-billing';

// ============================================
// Input Schemas
// ============================================

const scrubClaimInputSchema = z.object({
  claimId: z.string(),
  includeWarnings: z.boolean().default(true),
  checkHistorical: z.boolean().default(false),
});

const denialPredictionInputSchema = z.object({
  claimId: z.string(),
  useHistoricalData: z.boolean().default(true),
});

const appealGenerationInputSchema = z.object({
  denialId: z.string(),
  appealType: z.enum(['FIRST_LEVEL', 'SECOND_LEVEL', 'EXTERNAL']).default('FIRST_LEVEL'),
  includeClinicSupport: z.boolean().default(true),
});

const paymentMatchInputSchema = z.object({
  remittanceLineId: z.string().optional(),
  paymentAmount: z.number(),
  patientName: z.string().optional(),
  patientAccountNumber: z.string().optional(),
  serviceDate: z.date().optional(),
  cptCode: z.string().optional(),
  payerName: z.string().optional(),
  checkNumber: z.string().optional(),
});

const underpaymentScanInputSchema = z.object({
  claimId: z.string().optional(),
  chargeId: z.string().optional(),
  payerId: z.string().optional(),
  dateFrom: z.date().optional(),
  dateTo: z.date().optional(),
  threshold: z.number().min(0).max(100).default(5),
});

const batchJobInputSchema = z.object({
  jobType: z.enum([
    'CLAIM_SCRUB',
    'DENIAL_PREDICTION',
    'APPEAL_GENERATION',
    'PAYMENT_MATCHING',
    'UNDERPAYMENT_SCAN',
    'STATUS_CHECK',
  ]),
  config: z.record(z.string(), z.unknown()).optional(),
  scheduledFor: z.date().optional(),
});

// US-308: Autonomous Claim Submission Schemas
const submitClaimsInputSchema = z.object({
  claimIds: z.array(z.string()).optional(),
  autoSelectClaims: z.boolean().default(false),
  maxClaims: z.number().min(1).max(100).default(50),
  minScore: z.number().min(0).max(100).optional(),
  autoCorrect: z.boolean().default(true),
  dryRun: z.boolean().default(false),
});

const autoSubmitRuleConditionSchema = z.object({
  field: z.string(),
  operator: z.enum(['equals', 'notEquals', 'contains', 'greaterThan', 'lessThan', 'in', 'notIn']),
  value: z.union([z.string(), z.number(), z.array(z.string()), z.array(z.number())]),
});

const autoSubmitRuleInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  conditions: z.array(autoSubmitRuleConditionSchema),
  enabled: z.boolean().default(true),
  priority: z.number().default(0),
  minScore: z.number().min(0).max(100).default(80),
  maxClaimsPerRun: z.number().min(1).max(1000).default(100),
  scheduleCron: z.string().optional(),
});

// ============================================
// US-309 Helper Functions
// ============================================

function getSuggestionForCategory(category: string): string {
  const suggestions: Record<string, string> = {
    CODING: 'Use claim scrubbing before submission and review payer-specific coding guidelines',
    ELIGIBILITY: 'Verify eligibility before each visit and implement real-time eligibility checks',
    AUTHORIZATION: 'Check authorization requirements before scheduling and maintain tracking system',
    MEDICAL_NECESSITY: 'Document medical necessity clearly in notes and link diagnoses appropriately',
    TIMELY_FILING: 'Implement claims aging alerts and submit claims within 24-48 hours',
    DUPLICATE: 'Track claim status carefully and use frequency codes for corrections',
    BUNDLING: 'Use CCI edits checking before submission and apply correct modifiers',
    DOCUMENTATION: 'Ensure all required documents are attached and create checklists by payer',
    COORDINATION_OF_BENEFITS: 'Verify primary/secondary insurance at check-in and update COB regularly',
    OTHER: 'Review denial reason and implement appropriate prevention measures',
  };
  return suggestions[category] || suggestions.OTHER;
}

// ============================================
// Router
// ============================================

export const aiBillingRouter = router({
  // ============================================
  // Claim Scrubbing
  // ============================================

  /**
   * Scrub a single claim for errors before submission
   */
  scrubClaim: billerProcedure
    .input(scrubClaimInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { claimId, includeWarnings, checkHistorical } = input;

      // Verify claim exists and belongs to organization
      const claim = await ctx.prisma.claim.findFirst({
        where: {
          id: claimId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!claim) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Claim not found',
        });
      }

      try {
        const scrubber = new ClaimScrubber(ctx.prisma);
        const result = await scrubber.scrubClaim({
          claimId,
          includeWarnings,
          checkHistorical,
        });

        // Save scrub result to database
        const scrubResult = await ctx.prisma.claimScrubResult.create({
          data: {
            claimId,
            status: result.status,
            overallScore: result.overallScore,
            passedChecks: result.passedChecks,
            failedChecks: result.failedChecks,
            warningChecks: result.warningChecks,
            summary: result.summary,
            recommendation: result.recommendation,
            processingTimeMs: result.processingTimeMs,
            organizationId: ctx.user.organizationId,
            issues: {
              create: result.issues.map((issue) => ({
                severity: issue.severity,
                code: issue.code,
                category: issue.category,
                field: issue.field,
                message: issue.message,
                suggestion: issue.suggestion,
                claimLineNumber: issue.claimLineNumber,
                cptCode: issue.cptCode,
              })),
            },
          },
          include: {
            issues: true,
          },
        });

        // Audit log
        await ctx.prisma.aIBillingAudit.create({
          data: {
            action: 'SCRUB_CLAIM',
            entityType: 'Claim',
            entityId: claimId,
            decision: result.recommendation,
            confidence: result.overallScore / 100,
            reasoning: result.summary,
            inputData: { claimId, includeWarnings, checkHistorical },
            outputData: {
              status: result.status,
              score: result.overallScore,
              issueCount: result.issues.length,
            },
            processingTimeMs: result.processingTimeMs,
            organizationId: ctx.user.organizationId,
          },
        });

        await auditLog('AI_BILLING_SCRUB', 'Claim', {
          entityId: claimId,
          changes: {
            action: 'scrub',
            score: result.overallScore,
            recommendation: result.recommendation,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return scrubResult;
      } catch (error) {
        console.error('Claim scrubbing failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to scrub claim',
          cause: error,
        });
      }
    }),

  /**
   * Get scrub results for a claim
   */
  getScrubResults: billerProcedure
    .input(z.object({ claimId: z.string() }))
    .query(async ({ ctx, input }) => {
      const results = await ctx.prisma.claimScrubResult.findMany({
        where: {
          claimId: input.claimId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          issues: true,
        },
        orderBy: {
          scrubDate: 'desc',
        },
        take: 10,
      });

      return results;
    }),

  /**
   * Get claims needing scrubbing
   */
  getClaimsForScrubbing: billerProcedure
    .input(
      z.object({
        status: z.array(z.enum(['DRAFT', 'READY', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'PAID', 'DENIED', 'APPEALED', 'VOID'])).optional(),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const claims = await ctx.prisma.claim.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          status: {
            in: input.status || ['DRAFT', 'READY'],
          },
          // Claims that haven't been scrubbed recently
          scrubResults: {
            none: {
              scrubDate: {
                gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours
              },
            },
          },
        },
        include: {
          patient: {
            include: { demographics: true },
          },
          insurancePolicy: true,
          payer: true,
          scrubResults: {
            take: 1,
            orderBy: { scrubDate: 'desc' },
          },
        },
        take: input.limit,
        orderBy: {
          createdAt: 'desc',
        },
      });

      return claims;
    }),

  // ============================================
  // Denial Prediction
  // ============================================

  /**
   * Predict denial risk for a claim
   */
  predictDenial: billerProcedure
    .input(denialPredictionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { claimId, useHistoricalData } = input;

      // Verify claim exists
      const claim = await ctx.prisma.claim.findFirst({
        where: {
          id: claimId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!claim) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Claim not found',
        });
      }

      try {
        const predictor = new DenialPredictor(ctx.prisma, ctx.user.organizationId);
        const prediction = await predictor.predictDenial({
          claimId,
          useHistoricalData,
        });

        // Save prediction to database
        const savedPrediction = await ctx.prisma.denialPrediction.create({
          data: {
            claimId,
            riskLevel: prediction.riskLevel,
            riskScore: prediction.riskScore,
            confidenceScore: prediction.confidenceScore,
            riskFactors: prediction.riskFactors as unknown as object,
            primaryReason: prediction.primaryReason,
            historicalDenialRate: prediction.historicalDenialRate,
            payerDenialRate: prediction.payerDenialRate,
            recommendations: prediction.recommendations as unknown as object,
            processingTimeMs: prediction.processingTimeMs,
            organizationId: ctx.user.organizationId,
          },
        });

        // Audit log
        await ctx.prisma.aIBillingAudit.create({
          data: {
            action: 'PREDICT_DENIAL',
            entityType: 'Claim',
            entityId: claimId,
            decision: prediction.riskLevel,
            confidence: prediction.confidenceScore,
            reasoning: prediction.primaryReason,
            inputData: { claimId, useHistoricalData },
            outputData: {
              riskLevel: prediction.riskLevel,
              riskScore: prediction.riskScore,
              factorCount: prediction.riskFactors.length,
            },
            processingTimeMs: prediction.processingTimeMs,
            organizationId: ctx.user.organizationId,
          },
        });

        await auditLog('AI_BILLING_PREDICT', 'Claim', {
          entityId: claimId,
          changes: {
            action: 'predict_denial',
            riskScore: prediction.riskScore,
            riskLevel: prediction.riskLevel,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return savedPrediction;
      } catch (error) {
        console.error('Denial prediction failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to predict denial risk',
          cause: error,
        });
      }
    }),

  /**
   * Get denial predictions for a claim
   */
  getDenialPredictions: billerProcedure
    .input(z.object({ claimId: z.string() }))
    .query(async ({ ctx, input }) => {
      const predictions = await ctx.prisma.denialPrediction.findMany({
        where: {
          claimId: input.claimId,
          organizationId: ctx.user.organizationId,
        },
        orderBy: {
          predictionDate: 'desc',
        },
        take: 5,
      });

      return predictions;
    }),

  /**
   * Get high-risk claims
   */
  getHighRiskClaims: billerProcedure
    .input(
      z.object({
        minRiskScore: z.number().min(0).max(100).default(50),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const predictions = await ctx.prisma.denialPrediction.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          riskScore: { gte: input.minRiskScore },
        },
        include: {
          claim: {
            include: {
              patient: {
                include: { demographics: true },
              },
              insurancePolicy: true,
              payer: true,
            },
          },
        },
        orderBy: {
          riskScore: 'desc',
        },
        take: input.limit,
      });

      return predictions;
    }),

  // ============================================
  // Appeal Generation
  // ============================================

  /**
   * Generate an appeal letter for a denial
   */
  generateAppeal: billerProcedure
    .input(appealGenerationInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { denialId, appealType, includeClinicSupport } = input;

      // Verify denial exists
      const denial = await ctx.prisma.denial.findFirst({
        where: {
          id: denialId,
          claim: {
            organizationId: ctx.user.organizationId,
          },
        },
      });

      if (!denial) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Denial not found',
        });
      }

      try {
        const generator = new AppealGenerator(ctx.prisma, ctx.user.organizationId);
        const appeal = await generator.generateAppeal({
          denialId,
          appealType,
          includeClinicSupport,
        });

        // Save appeal letter to database
        const savedAppeal = await ctx.prisma.appealLetter.create({
          data: {
            denialId,
            subject: appeal.subject,
            body: appeal.body,
            appealType: appeal.appealType,
            denialCode: appeal.denialCode,
            denialReason: appeal.denialReason,
            arguments: appeal.arguments as unknown as object,
            citations: appeal.citations as unknown as object,
            clinicalSummary: appeal.clinicalSummary,
            medicalNecessity: appeal.medicalNecessity,
            recommendedDocs: appeal.recommendedDocs as unknown as object,
            templateName: appeal.templateName,
            processingTimeMs: appeal.processingTimeMs,
            status: 'DRAFT',
            organizationId: ctx.user.organizationId,
          },
        });

        // Audit log
        await ctx.prisma.aIBillingAudit.create({
          data: {
            action: 'GENERATE_APPEAL',
            entityType: 'Denial',
            entityId: denialId,
            decision: `Generated ${appealType} appeal`,
            reasoning: `Appeal generated for denial code: ${appeal.denialCode}`,
            inputData: { denialId, appealType, includeClinicSupport },
            outputData: {
              appealId: savedAppeal.id,
              templateUsed: appeal.templateName,
            },
            processingTimeMs: appeal.processingTimeMs,
            organizationId: ctx.user.organizationId,
          },
        });

        await auditLog('AI_BILLING_APPEAL', 'Denial', {
          entityId: denialId,
          changes: {
            action: 'generate_appeal',
            appealType,
            appealId: savedAppeal.id,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return savedAppeal;
      } catch (error) {
        console.error('Appeal generation failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate appeal letter',
          cause: error,
        });
      }
    }),

  /**
   * Get appeal letters for a denial
   */
  getAppealLetters: billerProcedure
    .input(z.object({ denialId: z.string() }))
    .query(async ({ ctx, input }) => {
      const appeals = await ctx.prisma.appealLetter.findMany({
        where: {
          denialId: input.denialId,
          organizationId: ctx.user.organizationId,
        },
        orderBy: {
          generatedAt: 'desc',
        },
      });

      return appeals;
    }),

  /**
   * Update appeal letter status
   */
  updateAppealStatus: billerProcedure
    .input(
      z.object({
        appealId: z.string(),
        status: z.enum(['DRAFT', 'READY', 'SENT', 'RESPONDED']),
        outcome: z.string().optional(),
        payerResponse: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const appeal = await ctx.prisma.appealLetter.findFirst({
        where: {
          id: input.appealId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!appeal) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Appeal letter not found',
        });
      }

      const updated = await ctx.prisma.appealLetter.update({
        where: { id: input.appealId },
        data: {
          status: input.status,
          outcome: input.outcome,
          payerResponse: input.payerResponse,
          sentAt: input.status === 'SENT' ? new Date() : undefined,
          sentBy: input.status === 'SENT' ? ctx.user.id : undefined,
          responseDate: input.status === 'RESPONDED' ? new Date() : undefined,
        },
      });

      await auditLog('UPDATE', 'AppealLetter', {
        entityId: input.appealId,
        changes: { status: input.status, outcome: input.outcome },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  /**
   * Get denials needing appeals
   */
  getDenialsForAppeal: billerProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const denials = await ctx.prisma.denial.findMany({
        where: {
          claim: {
            organizationId: ctx.user.organizationId,
          },
          status: { in: ['NEW', 'UNDER_REVIEW'] },
          // No appeal letters yet
          appealLetters: {
            none: {},
          },
        },
        include: {
          claim: {
            include: {
              patient: {
                include: { demographics: true },
              },
              insurancePolicy: true,
              payer: true,
            },
          },
        },
        take: input.limit,
        orderBy: {
          createdAt: 'desc',
        },
      });

      return denials;
    }),

  // ============================================
  // Payment Matching
  // ============================================

  /**
   * Match a payment to charges
   */
  matchPayment: billerProcedure
    .input(paymentMatchInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const matcher = new PaymentMatcher(ctx.prisma, ctx.user.organizationId);
        const result = await matcher.matchPayment({
          ...input,
          organizationId: ctx.user.organizationId,
        });

        // Save suggestions to database
        for (const match of result.matches) {
          await ctx.prisma.paymentMatchSuggestion.create({
            data: {
              remittanceLineId: input.remittanceLineId,
              status: 'SUGGESTED',
              confidenceScore: match.confidenceScore,
              matchMethod: match.matchMethod,
              matchCriteria: match.matchCriteria as unknown as object,
              paymentAmount: input.paymentAmount,
              payerName: input.payerName,
              checkNumber: input.checkNumber,
              chargeAmount: match.chargeAmount,
              serviceDate: match.serviceDate,
              cptCode: match.cptCode,
              suggestedAllocation: match.suggestedAllocation as unknown as object,
              chargeId: match.chargeId,
              patientId: match.patientId,
              organizationId: ctx.user.organizationId,
            },
          });
        }

        // Audit log
        await ctx.prisma.aIBillingAudit.create({
          data: {
            action: 'MATCH_PAYMENT',
            entityType: 'Payment',
            entityId: input.remittanceLineId || 'manual',
            decision: result.matches.length > 0 ? 'MATCHES_FOUND' : 'NO_MATCHES',
            confidence: result.matches[0]?.confidenceScore,
            reasoning: `Found ${result.matches.length} potential matches`,
            inputData: input,
            outputData: {
              matchCount: result.matches.length,
              topMatch: result.matches[0]?.chargeId,
            },
            processingTimeMs: result.processingTimeMs,
            organizationId: ctx.user.organizationId,
          },
        });

        return result;
      } catch (error) {
        console.error('Payment matching failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to match payment',
          cause: error,
        });
      }
    }),

  /**
   * Get payment match suggestions
   */
  getMatchSuggestions: billerProcedure
    .input(
      z.object({
        status: z.enum(['UNMATCHED', 'SUGGESTED', 'CONFIRMED', 'POSTED', 'REJECTED']).optional(),
        remittanceId: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const suggestions = await ctx.prisma.paymentMatchSuggestion.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          ...(input.status && { status: input.status }),
          ...(input.remittanceId && {
            remittanceLine: {
              remittanceId: input.remittanceId,
            },
          }),
        },
        include: {
          charge: {
            include: {
              patient: {
                include: { demographics: true },
              },
            },
          },
          patient: {
            include: { demographics: true },
          },
        },
        orderBy: {
          confidenceScore: 'desc',
        },
        take: input.limit,
      });

      return suggestions;
    }),

  /**
   * Confirm or reject a payment match
   */
  actionMatchSuggestion: billerProcedure
    .input(
      z.object({
        suggestionId: z.string(),
        action: z.enum(['CONFIRM', 'REJECT', 'POST']),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const suggestion = await ctx.prisma.paymentMatchSuggestion.findFirst({
        where: {
          id: input.suggestionId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          charge: true,
        },
      });

      if (!suggestion) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Match suggestion not found',
        });
      }

      let newStatus: 'CONFIRMED' | 'REJECTED' | 'POSTED' = 'CONFIRMED';
      if (input.action === 'REJECT') {
        newStatus = 'REJECTED';
      } else if (input.action === 'POST') {
        newStatus = 'POSTED';

        // Create payment record with allocation if posting
        if (suggestion.chargeId) {
          await ctx.prisma.payment.create({
            data: {
              amount: suggestion.paymentAmount,
              paymentDate: new Date(),
              paymentMethod: 'ACH',
              payerType: 'insurance',
              patientId: suggestion.patientId,
              organizationId: ctx.user.organizationId,
              notes: `Auto-posted from match suggestion. Confidence: ${suggestion.confidenceScore}`,
              allocations: {
                create: {
                  amount: suggestion.paymentAmount,
                  chargeId: suggestion.chargeId,
                },
              },
            },
          });
        }
      }

      const updated = await ctx.prisma.paymentMatchSuggestion.update({
        where: { id: input.suggestionId },
        data: {
          status: newStatus,
          actionedAt: new Date(),
          actionedBy: ctx.user.id,
          actionNotes: input.notes,
        },
      });

      await auditLog('AI_BILLING_MATCH', 'PaymentMatchSuggestion', {
        entityId: input.suggestionId,
        changes: { action: input.action, newStatus },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  // ============================================
  // Underpayment Detection
  // ============================================

  /**
   * Scan for underpayments
   */
  scanUnderpayments: billerProcedure
    .input(underpaymentScanInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const detector = new UnderpaymentDetector(ctx.prisma, ctx.user.organizationId);
        const result = await detector.scanForUnderpayments({
          ...input,
          organizationId: ctx.user.organizationId,
        });

        // Save detections to database
        for (const detection of result.results) {
          await ctx.prisma.underpaymentDetection.create({
            data: {
              claimId: detection.claimId,
              chargeId: detection.chargeId,
              payerId: detection.payerId,
              payerName: detection.payerName,
              billedAmount: detection.billedAmount,
              expectedAmount: detection.expectedAmount,
              paidAmount: detection.paidAmount,
              underpaidAmount: detection.underpaidAmount,
              calculationBasis: detection.calculationBasis,
              underpaymentReason: detection.underpaymentReason,
              recoveryLikelihood: detection.recoveryLikelihood,
              recoveryAmount: detection.recoveryAmount,
              status: 'DETECTED',
              organizationId: ctx.user.organizationId,
            },
          });
        }

        // Audit log
        await ctx.prisma.aIBillingAudit.create({
          data: {
            action: 'SCAN_UNDERPAYMENTS',
            entityType: 'Charge',
            entityId: 'batch',
            decision: `Found ${result.underpaymentCount} underpayments`,
            reasoning: `Scanned ${result.totalScanned} charges, potential recovery: $${result.potentialRecovery}`,
            inputData: input,
            outputData: {
              scanned: result.totalScanned,
              found: result.underpaymentCount,
              totalUnderpaid: result.totalUnderpaidAmount,
              potentialRecovery: result.potentialRecovery,
            },
            processingTimeMs: result.processingTimeMs,
            organizationId: ctx.user.organizationId,
          },
        });

        await auditLog('AI_BILLING_UNDERPAYMENT', 'Batch', {
          entityId: 'scan',
          changes: {
            action: 'scan',
            found: result.underpaymentCount,
            totalUnderpaid: result.totalUnderpaidAmount,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return result;
      } catch (error) {
        console.error('Underpayment scan failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to scan for underpayments',
          cause: error,
        });
      }
    }),

  /**
   * Get underpayment detections
   */
  getUnderpayments: billerProcedure
    .input(
      z.object({
        status: z.enum(['DETECTED', 'UNDER_REVIEW', 'APPEALED', 'ADJUSTED', 'RESOLVED', 'IGNORED']).optional(),
        minAmount: z.number().optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const detections = await ctx.prisma.underpaymentDetection.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          ...(input.status && { status: input.status }),
          ...(input.minAmount && {
            underpaidAmount: { gte: input.minAmount },
          }),
        },
        include: {
          claim: {
            include: {
              patient: {
                include: { demographics: true },
              },
            },
          },
          charge: true,
        },
        orderBy: {
          recoveryAmount: 'desc',
        },
        take: input.limit,
      });

      return detections;
    }),

  /**
   * Update underpayment status
   */
  updateUnderpaymentStatus: billerProcedure
    .input(
      z.object({
        detectionId: z.string(),
        status: z.enum(['UNDER_REVIEW', 'APPEALED', 'ADJUSTED', 'RESOLVED', 'IGNORED']),
        resolutionType: z.string().optional(),
        recoveredAmount: z.number().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const detection = await ctx.prisma.underpaymentDetection.findFirst({
        where: {
          id: input.detectionId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!detection) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Underpayment detection not found',
        });
      }

      const updated = await ctx.prisma.underpaymentDetection.update({
        where: { id: input.detectionId },
        data: {
          status: input.status,
          resolutionType: input.resolutionType,
          recoveredAmount: input.recoveredAmount,
          resolutionNotes: input.notes,
          resolvedAt: ['ADJUSTED', 'RESOLVED', 'IGNORED'].includes(input.status)
            ? new Date()
            : undefined,
          resolvedBy: ['ADJUSTED', 'RESOLVED', 'IGNORED'].includes(input.status)
            ? ctx.user.id
            : undefined,
        },
      });

      await auditLog('UPDATE', 'UnderpaymentDetection', {
        entityId: input.detectionId,
        changes: {
          status: input.status,
          resolutionType: input.resolutionType,
          recoveredAmount: input.recoveredAmount,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  /**
   * Get underpayment summary by payer
   */
  getUnderpaymentSummaryByPayer: billerProcedure.query(async ({ ctx }) => {
    const detector = new UnderpaymentDetector(ctx.prisma, ctx.user.organizationId);
    return detector.getUnderpaymentsByPayer();
  }),

  // ============================================
  // Batch Jobs
  // ============================================

  /**
   * Create a batch job
   */
  createBatchJob: billerProcedure
    .input(batchJobInputSchema)
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.prisma.aIBillingJob.create({
        data: {
          jobType: input.jobType,
          config: (input.config || {}) as unknown as object,
          scheduledFor: input.scheduledFor,
          status: 'QUEUED',
          createdBy: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      });

      await auditLog('CREATE', 'AIBillingJob', {
        entityId: job.id,
        changes: { jobType: input.jobType, scheduledFor: input.scheduledFor },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return job;
    }),

  /**
   * Get batch jobs
   */
  getBatchJobs: billerProcedure
    .input(
      z.object({
        status: z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']).optional(),
        jobType: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const jobs = await ctx.prisma.aIBillingJob.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          ...(input.status && { status: input.status }),
          ...(input.jobType && { jobType: input.jobType as any }),
        },
        include: {
          logs: {
            take: 10,
            orderBy: { timestamp: 'desc' },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: input.limit,
      });

      return jobs;
    }),

  /**
   * Cancel a batch job
   */
  cancelBatchJob: billerProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.prisma.aIBillingJob.findFirst({
        where: {
          id: input.jobId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!job) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Job not found',
        });
      }

      if (job.status !== 'QUEUED' && job.status !== 'RUNNING') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Job cannot be cancelled in current status',
        });
      }

      const updated = await ctx.prisma.aIBillingJob.update({
        where: { id: input.jobId },
        data: {
          status: 'CANCELLED',
          completedAt: new Date(),
        },
      });

      await auditLog('UPDATE', 'AIBillingJob', {
        entityId: input.jobId,
        changes: { status: 'CANCELLED' },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  // ============================================
  // Dashboard & Analytics
  // ============================================

  /**
   * Get AI billing dashboard summary
   */
  getDashboardSummary: billerProcedure.query(async ({ ctx }) => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Get various counts in parallel
    const [
      claimsNeedingScrub,
      highRiskClaims,
      pendingAppeals,
      unmatchedPayments,
      underpaymentSummary,
      recentJobs,
    ] = await Promise.all([
      // Claims needing scrub
      ctx.prisma.claim.count({
        where: {
          organizationId: ctx.user.organizationId,
          status: { in: ['DRAFT', 'READY'] },
          scrubResults: {
            none: {
              scrubDate: { gte: thirtyDaysAgo },
            },
          },
        },
      }),

      // High risk claims (score >= 50)
      ctx.prisma.denialPrediction.count({
        where: {
          organizationId: ctx.user.organizationId,
          riskScore: { gte: 50 },
          predictionDate: { gte: thirtyDaysAgo },
        },
      }),

      // Pending appeals
      ctx.prisma.appealLetter.count({
        where: {
          organizationId: ctx.user.organizationId,
          status: { in: ['DRAFT', 'READY'] },
        },
      }),

      // Unmatched payments
      ctx.prisma.paymentMatchSuggestion.count({
        where: {
          organizationId: ctx.user.organizationId,
          status: 'SUGGESTED',
        },
      }),

      // Underpayment totals
      ctx.prisma.underpaymentDetection.aggregate({
        where: {
          organizationId: ctx.user.organizationId,
          status: 'DETECTED',
        },
        _sum: {
          underpaidAmount: true,
          recoveryAmount: true,
        },
        _count: true,
      }),

      // Recent jobs
      ctx.prisma.aIBillingJob.findMany({
        where: {
          organizationId: ctx.user.organizationId,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    return {
      scrubQueue: {
        count: claimsNeedingScrub,
        label: 'Claims needing scrub',
      },
      highRiskClaims: {
        count: highRiskClaims,
        label: 'High risk claims',
      },
      pendingAppeals: {
        count: pendingAppeals,
        label: 'Pending appeals',
      },
      unmatchedPayments: {
        count: unmatchedPayments,
        label: 'Unmatched payments',
      },
      underpayments: {
        count: underpaymentSummary._count,
        totalAmount: underpaymentSummary._sum.underpaidAmount?.toNumber() || 0,
        potentialRecovery: underpaymentSummary._sum.recoveryAmount?.toNumber() || 0,
      },
      recentJobs,
    };
  }),

  /**
   * Get AI billing audit log
   */
  getAuditLog: billerProcedure
    .input(
      z.object({
        action: z.string().optional(),
        entityType: z.string().optional(),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
        limit: z.number().min(1).max(200).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const logs = await ctx.prisma.aIBillingAudit.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          ...(input.action && { action: input.action }),
          ...(input.entityType && { entityType: input.entityType }),
          ...(input.dateFrom && { timestamp: { gte: input.dateFrom } }),
          ...(input.dateTo && { timestamp: { lte: input.dateTo } }),
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: input.limit,
      });

      return logs;
    }),

  // ============================================
  // US-308: Autonomous Claim Submission
  // ============================================

  /**
   * Submit claims automatically with validation and auto-correction
   */
  submitClaims: billerProcedure
    .input(submitClaimsInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const submitter = new ClaimSubmitter(ctx.prisma, ctx.user.organizationId);
        const result = await submitter.submitClaims(input);

        // Audit log
        await ctx.prisma.aIBillingAudit.create({
          data: {
            action: 'SUBMIT_CLAIMS',
            entityType: 'Batch',
            entityId: result.batchId,
            decision: `Submitted ${result.submitted + result.correctedAndSubmitted} claims`,
            confidence: result.successRate / 100,
            reasoning: `Batch submission: ${result.submitted} direct, ${result.correctedAndSubmitted} corrected, ${result.pendingReview} pending, ${result.failed} failed, ${result.skipped} skipped`,
            inputData: input,
            outputData: {
              batchId: result.batchId,
              submitted: result.submitted,
              correctedAndSubmitted: result.correctedAndSubmitted,
              pendingReview: result.pendingReview,
              failed: result.failed,
              skipped: result.skipped,
              successRate: result.successRate,
            },
            processingTimeMs: result.processingTimeMs,
            organizationId: ctx.user.organizationId,
          },
        });

        await auditLog('AI_BILLING_SUBMIT', 'Batch', {
          entityId: result.batchId,
          changes: {
            action: 'batch_submit',
            submitted: result.submitted + result.correctedAndSubmitted,
            failed: result.failed,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return result;
      } catch (error) {
        console.error('Claim submission failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to submit claims',
          cause: error,
        });
      }
    }),

  /**
   * Get submission statistics and success rates
   */
  getSubmissionStats: billerProcedure
    .input(
      z.object({
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const submitter = new ClaimSubmitter(ctx.prisma, ctx.user.organizationId);
        return submitter.getSubmissionStats(input.dateFrom, input.dateTo);
      } catch (error) {
        console.error('Failed to get submission stats:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get submission statistics',
          cause: error,
        });
      }
    }),

  /**
   * Get claims ready for auto-submission
   */
  getClaimsReadyForSubmission: billerProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        minScore: z.number().min(0).max(100).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Get claims in DRAFT or READY status
      const claims = await ctx.prisma.claim.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          status: { in: ['DRAFT', 'READY'] },
        },
        include: {
          patient: {
            include: { demographics: true },
          },
          payer: true,
          insurancePolicy: true,
          scrubResults: {
            take: 1,
            orderBy: { scrubDate: 'desc' },
            where: input.minScore ? { overallScore: { gte: input.minScore } } : undefined,
          },
          _count: { select: { claimLines: true } },
        },
        take: input.limit,
        orderBy: { createdAt: 'asc' },
      });

      // Filter by scrub score if specified
      const filteredClaims = input.minScore
        ? claims.filter(c => c.scrubResults.length > 0 && c.scrubResults[0].overallScore >= input.minScore!)
        : claims;

      return filteredClaims.map(c => ({
        ...c,
        lastScrubScore: c.scrubResults[0]?.overallScore || null,
        lastScrubDate: c.scrubResults[0]?.scrubDate || null,
        lastScrubStatus: c.scrubResults[0]?.status || null,
      }));
    }),

  /**
   * Get auto-submit rules
   */
  getAutoSubmitRules: billerProcedure.query(async ({ ctx }) => {
    try {
      const submitter = new ClaimSubmitter(ctx.prisma, ctx.user.organizationId);
      return submitter.getAutoSubmitRules();
    } catch (error) {
      console.error('Failed to get auto-submit rules:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get auto-submit rules',
        cause: error,
      });
    }
  }),

  /**
   * Create or update an auto-submit rule
   */
  saveAutoSubmitRule: billerProcedure
    .input(autoSubmitRuleInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const submitter = new ClaimSubmitter(ctx.prisma, ctx.user.organizationId);
        const rule = await submitter.saveAutoSubmitRule(input);

        await auditLog(input.id ? 'UPDATE' : 'CREATE', 'AIBillingRule', {
          entityId: rule.id,
          changes: { name: rule.name, enabled: rule.enabled, priority: rule.priority },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return rule;
      } catch (error) {
        console.error('Failed to save auto-submit rule:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to save auto-submit rule',
          cause: error,
        });
      }
    }),

  /**
   * Delete an auto-submit rule
   */
  deleteAutoSubmitRule: billerProcedure
    .input(z.object({ ruleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const rule = await ctx.prisma.aIBillingRule.findFirst({
        where: {
          id: input.ruleId,
          organizationId: ctx.user.organizationId,
          category: 'submission',
        },
      });

      if (!rule) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Auto-submit rule not found',
        });
      }

      await ctx.prisma.aIBillingRule.delete({
        where: { id: input.ruleId },
      });

      await auditLog('DELETE', 'AIBillingRule', {
        entityId: input.ruleId,
        changes: { name: rule.name },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  /**
   * Toggle auto-submit rule enabled status
   */
  toggleAutoSubmitRule: billerProcedure
    .input(z.object({ ruleId: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const rule = await ctx.prisma.aIBillingRule.findFirst({
        where: {
          id: input.ruleId,
          organizationId: ctx.user.organizationId,
          category: 'submission',
        },
      });

      if (!rule) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Auto-submit rule not found',
        });
      }

      const updated = await ctx.prisma.aIBillingRule.update({
        where: { id: input.ruleId },
        data: { isActive: input.enabled },
      });

      await auditLog('UPDATE', 'AIBillingRule', {
        entityId: input.ruleId,
        changes: { enabled: input.enabled },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        id: updated.id,
        name: updated.name,
        enabled: updated.isActive,
      };
    }),

  /**
   * Get submission alerts (failed submissions)
   */
  getSubmissionAlerts: billerProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        includeResolved: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const alerts = await ctx.prisma.claimNote.findMany({
        where: {
          noteType: 'ai_alert',
          claim: {
            organizationId: ctx.user.organizationId,
          },
        },
        include: {
          claim: {
            select: {
              id: true,
              claimNumber: true,
              status: true,
              patient: {
                include: { demographics: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: input.limit,
      });

      return alerts;
    }),

  // ============================================
  // US-309: Denial Analysis and Routing
  // ============================================

  /**
   * Analyze a denial and determine appropriate routing
   */
  analyzeDenial: billerProcedure
    .input(
      z.object({
        denialId: z.string(),
        includeHistoricalAnalysis: z.boolean().default(true),
        includePreventionStrategies: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const analyzer = new DenialAnalyzer(ctx.prisma, ctx.user.organizationId);
        const result = await analyzer.analyzeDenial(input);

        // Audit log
        await ctx.prisma.aIBillingAudit.create({
          data: {
            action: 'ANALYZE_DENIAL',
            entityType: 'Denial',
            entityId: input.denialId,
            decision: result.recommendedWorkflow,
            confidence: result.confidence,
            reasoning: result.reasoning,
            inputData: input,
            outputData: {
              category: result.category,
              isCorrectable: result.isCorrectable,
              recommendedWorkflow: result.recommendedWorkflow,
              priority: result.priority,
              riskFactorCount: result.riskFactors.length,
            },
            processingTimeMs: result.processingTimeMs,
            organizationId: ctx.user.organizationId,
          },
        });

        await auditLog('AI_BILLING_ANALYZE_DENIAL', 'Denial', {
          entityId: input.denialId,
          changes: {
            action: 'analyze',
            category: result.category,
            workflow: result.recommendedWorkflow,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return result;
      } catch (error) {
        console.error('Denial analysis failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to analyze denial',
          cause: error,
        });
      }
    }),

  /**
   * Route a denial to a specific workflow
   */
  routeDenial: billerProcedure
    .input(
      z.object({
        denialId: z.string(),
        workflow: z.enum([
          'CORRECT_AND_RESUBMIT',
          'APPEAL',
          'PATIENT_RESPONSIBILITY',
          'WRITE_OFF',
          'ESCALATE',
          'NEEDS_REVIEW',
        ]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const analyzer = new DenialAnalyzer(ctx.prisma, ctx.user.organizationId);
        await analyzer.routeDenial(input.denialId, input.workflow);

        await auditLog('AI_BILLING_ROUTE_DENIAL', 'Denial', {
          entityId: input.denialId,
          changes: {
            action: 'route',
            workflow: input.workflow,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return { success: true, workflow: input.workflow };
      } catch (error) {
        console.error('Denial routing failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to route denial',
          cause: error,
        });
      }
    }),

  /**
   * Get denial pattern analysis
   */
  getDenialPatterns: billerProcedure
    .input(
      z.object({
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const analyzer = new DenialAnalyzer(ctx.prisma, ctx.user.organizationId);
        return analyzer.getPatternAnalysis(input.dateFrom, input.dateTo);
      } catch (error) {
        console.error('Pattern analysis failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get denial patterns',
          cause: error,
        });
      }
    }),

  /**
   * Record denial outcome for learning
   */
  recordDenialOutcome: billerProcedure
    .input(
      z.object({
        denialId: z.string(),
        wasSuccessful: z.boolean(),
        actualWorkflow: z.string(),
        recoveredAmount: z.number().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const analyzer = new DenialAnalyzer(ctx.prisma, ctx.user.organizationId);
        await analyzer.recordOutcome(input.denialId, input);

        await auditLog('AI_BILLING_DENIAL_OUTCOME', 'Denial', {
          entityId: input.denialId,
          changes: {
            wasSuccessful: input.wasSuccessful,
            actualWorkflow: input.actualWorkflow,
            recoveredAmount: input.recoveredAmount,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return { success: true };
      } catch (error) {
        console.error('Recording denial outcome failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to record denial outcome',
          cause: error,
        });
      }
    }),

  /**
   * Get denials pending analysis
   */
  getDenialsPendingAnalysis: billerProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const denials = await ctx.prisma.denial.findMany({
        where: {
          claim: { organizationId: ctx.user.organizationId },
          status: { in: ['NEW', 'UNDER_REVIEW'] },
        },
        include: {
          claim: {
            include: {
              patient: { include: { demographics: true } },
              payer: true,
            },
          },
        },
        orderBy: [
          { appealDeadline: 'asc' },
          { deniedAmount: 'desc' },
          { createdAt: 'asc' },
        ],
        take: input.limit,
      });

      return denials;
    }),

  /**
   * Get provider denial trending
   */
  getProviderDenialTrending: billerProcedure
    .input(
      z.object({
        providerId: z.string().optional(),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const threeMonthsAgo = input.dateFrom || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const endDate = input.dateTo || new Date();

      const where = {
        claim: {
          organizationId: ctx.user.organizationId,
          ...(input.providerId && { encounter: { providerId: input.providerId } }),
        },
        createdAt: { gte: threeMonthsAgo, lte: endDate },
      };

      // Get denials grouped by provider
      const denials = await ctx.prisma.denial.findMany({
        where,
        include: {
          claim: {
            include: {
              encounter: { include: { provider: { include: { user: { select: { firstName: true, lastName: true } } } } } },
            },
          },
        },
      });

      // Group by provider
      const providerMap = new Map<string, {
        id: string;
        name: string;
        denials: number;
        totalAmount: number;
        codes: Map<string, number>;
      }>();

      for (const d of denials) {
        const provider = d.claim?.encounter?.provider;
        if (!provider) continue;

        const existing = providerMap.get(provider.id) || {
          id: provider.id,
          name: `${provider.user?.firstName || ''} ${provider.user?.lastName || ''}`.trim() || 'Unknown Provider',
          denials: 0,
          totalAmount: 0,
          codes: new Map(),
        };

        existing.denials++;
        existing.totalAmount += d.deniedAmount?.toNumber() || 0;
        if (d.denialCode) {
          existing.codes.set(d.denialCode, (existing.codes.get(d.denialCode) || 0) + 1);
        }

        providerMap.set(provider.id, existing);
      }

      // Get total claims per provider for denial rate
      const results = await Promise.all(
        Array.from(providerMap.entries()).map(async ([providerId, stats]) => {
          const totalClaims = await ctx.prisma.claim.count({
            where: {
              organizationId: ctx.user.organizationId,
              encounter: { providerId },
              createdAt: { gte: threeMonthsAgo, lte: endDate },
            },
          });

          const topCodes = Array.from(stats.codes.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([code, count]) => ({ code, count }));

          return {
            providerId: stats.id,
            providerName: stats.name,
            totalDenials: stats.denials,
            totalAmount: stats.totalAmount,
            totalClaims,
            denialRate: totalClaims > 0 ? (stats.denials / totalClaims) * 100 : 0,
            topDenialCodes: topCodes,
          };
        })
      );

      return results.sort((a, b) => b.denialRate - a.denialRate);
    }),

  /**
   * Get denial prevention suggestions
   */
  getPreventionSuggestions: billerProcedure.query(async ({ ctx }) => {
    const analyzer = new DenialAnalyzer(ctx.prisma, ctx.user.organizationId);
    const patterns = await analyzer.getPatternAnalysis();

    return {
      topOpportunities: patterns.topPreventionOpportunities,
      byCategory: patterns.byCategory.slice(0, 5).map(cat => ({
        category: cat.category,
        count: cat.count,
        amount: cat.amount,
        suggestion: getSuggestionForCategory(cat.category),
      })),
    };
  }),

  // ============================================
  // US-310: Automated Appeal Generation
  // ============================================

  /**
   * Generate an automated appeal letter for a denied claim
   */
  generateAutomatedAppeal: billerProcedure
    .input(
      z.object({
        claimId: z.string(),
        denialId: z.string().optional(),
        denialCode: z.string().optional(),
        denialReason: z.string().optional(),
        denialAmount: z.number().optional(),
        appealType: z.enum(['FIRST_LEVEL', 'SECOND_LEVEL', 'EXTERNAL']).default('FIRST_LEVEL'),
        payerId: z.string().optional(),
        includeAllDocumentation: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const generator = new AutomatedAppealGenerator(ctx.prisma, ctx.user.organizationId);
        const result = await generator.generateAppeal(input);

        // Audit log
        await ctx.prisma.aIBillingAudit.create({
          data: {
            action: 'GENERATE_AUTOMATED_APPEAL',
            entityType: 'Claim',
            entityId: input.claimId,
            decision: `Generated ${input.appealType} appeal`,
            confidence: result.successLikelihood,
            reasoning: `Appeal generated for claim ${input.claimId}. Success likelihood: ${(result.successLikelihood * 100).toFixed(0)}%`,
            inputData: input,
            outputData: {
              appealId: result.appealId,
              appealType: result.appealType,
              successLikelihood: result.successLikelihood,
              argumentCount: result.arguments.length,
              citationCount: result.citations.length,
            },
            processingTimeMs: result.processingTimeMs,
            organizationId: ctx.user.organizationId,
          },
        });

        await auditLog('AI_BILLING_GENERATE_APPEAL', 'Claim', {
          entityId: input.claimId,
          changes: {
            action: 'generate_automated_appeal',
            appealId: result.appealId,
            appealType: result.appealType,
            successLikelihood: result.successLikelihood,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return result;
      } catch (error) {
        console.error('Automated appeal generation failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate automated appeal',
          cause: error,
        });
      }
    }),

  /**
   * Get appeal success metrics for reporting
   */
  getAppealSuccessMetrics: billerProcedure
    .input(
      z.object({
        payerId: z.string().optional(),
        denialCode: z.string().optional(),
        appealType: z.enum(['FIRST_LEVEL', 'SECOND_LEVEL', 'EXTERNAL']).optional(),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const generator = new AutomatedAppealGenerator(ctx.prisma, ctx.user.organizationId);
        return generator.getAppealSuccessMetrics(input);
      } catch (error) {
        console.error('Failed to get appeal success metrics:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get appeal success metrics',
          cause: error,
        });
      }
    }),

  /**
   * Submit an appeal (update status)
   */
  submitAutomatedAppeal: billerProcedure
    .input(
      z.object({
        appealId: z.string(),
        submissionMethod: z.enum(['mail', 'fax', 'portal', 'electronic']),
        confirmationNumber: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const generator = new AutomatedAppealGenerator(ctx.prisma, ctx.user.organizationId);
        const result = await generator.submitAppeal(input.appealId, {
          submissionMethod: input.submissionMethod,
          confirmationNumber: input.confirmationNumber,
          notes: input.notes,
        });

        await auditLog('AI_BILLING_SUBMIT_APPEAL', 'AIAppeal', {
          entityId: input.appealId,
          changes: {
            action: 'submit_appeal',
            submissionMethod: input.submissionMethod,
            confirmationNumber: input.confirmationNumber,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return result;
      } catch (error) {
        console.error('Failed to submit appeal:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to submit appeal',
          cause: error,
        });
      }
    }),

  /**
   * Record appeal outcome for learning
   */
  recordAutomatedAppealOutcome: billerProcedure
    .input(
      z.object({
        appealId: z.string(),
        status: z.enum(['APPROVED', 'DENIED', 'PARTIAL']),
        responseDetails: z.string().optional(),
        recoveredAmount: z.number().optional(),
        adjustmentCodes: z.array(z.string()).optional(),
        successFactors: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const generator = new AutomatedAppealGenerator(ctx.prisma, ctx.user.organizationId);
        const result = await generator.recordAppealOutcome(input.appealId, {
          status: input.status,
          responseDetails: input.responseDetails,
          recoveredAmount: input.recoveredAmount,
          adjustmentCodes: input.adjustmentCodes,
          successFactors: input.successFactors,
        });

        await auditLog('AI_BILLING_APPEAL_OUTCOME', 'AIAppeal', {
          entityId: input.appealId,
          changes: {
            action: 'record_outcome',
            status: input.status,
            recoveredAmount: input.recoveredAmount,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return result;
      } catch (error) {
        console.error('Failed to record appeal outcome:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to record appeal outcome',
          cause: error,
        });
      }
    }),

  /**
   * Get appeals pending submission with deadline tracking
   */
  getAppealsPendingSubmission: billerProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const generator = new AutomatedAppealGenerator(ctx.prisma, ctx.user.organizationId);
        return generator.getAppealsPendingSubmission(input.limit);
      } catch (error) {
        console.error('Failed to get appeals pending submission:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get appeals pending submission',
          cause: error,
        });
      }
    }),

  /**
   * Batch generate appeals for multiple claims
   */
  batchGenerateAppeals: billerProcedure
    .input(
      z.object({
        claimIds: z.array(z.string()).min(1).max(50),
        appealType: z.enum(['FIRST_LEVEL', 'SECOND_LEVEL', 'EXTERNAL']).default('FIRST_LEVEL'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const generator = new AutomatedAppealGenerator(ctx.prisma, ctx.user.organizationId);
        const resultsMap = await generator.batchGenerateAppeals(input.claimIds, input.appealType);

        // Convert Map to object for serialization
        const results: Record<string, { success: boolean; appealId?: string; error?: string }> = {};
        for (const [claimId, result] of resultsMap) {
          if ('error' in result) {
            results[claimId] = { success: false, error: result.error };
          } else {
            results[claimId] = { success: true, appealId: result.appealId };
          }
        }

        const successCount = Object.values(results).filter(r => r.success).length;
        const failureCount = Object.values(results).filter(r => !r.success).length;

        // Audit log
        await ctx.prisma.aIBillingAudit.create({
          data: {
            action: 'BATCH_GENERATE_APPEALS',
            entityType: 'Batch',
            entityId: 'batch',
            decision: `Generated ${successCount} appeals, ${failureCount} failed`,
            reasoning: `Batch appeal generation for ${input.claimIds.length} claims`,
            inputData: input,
            outputData: {
              successCount,
              failureCount,
              results,
            },
            organizationId: ctx.user.organizationId,
          },
        });

        await auditLog('AI_BILLING_BATCH_APPEALS', 'Batch', {
          entityId: 'batch',
          changes: {
            action: 'batch_generate',
            totalClaims: input.claimIds.length,
            successCount,
            failureCount,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return {
          totalRequested: input.claimIds.length,
          successCount,
          failureCount,
          results,
        };
      } catch (error) {
        console.error('Batch appeal generation failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to batch generate appeals',
          cause: error,
        });
      }
    }),

  /**
   * Get AI appeals list with filtering
   */
  getAIAppeals: billerProcedure
    .input(
      z.object({
        status: z.enum(['DRAFT', 'READY', 'SUBMITTED', 'ACKNOWLEDGED', 'IN_REVIEW', 'ADDITIONAL_INFO', 'APPROVED', 'PARTIAL', 'DENIED', 'ESCALATED']).optional(),
        claimId: z.string().optional(),
        payerId: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
      };

      if (input.status) {
        where.status = input.status;
      }
      if (input.claimId) {
        where.claimId = input.claimId;
      }
      if (input.payerId) {
        where.claim = { payerId: input.payerId };
      }

      const [appeals, total] = await Promise.all([
        ctx.prisma.aIAppeal.findMany({
          where,
          include: {
            claim: {
              select: {
                id: true,
                claimNumber: true,
                patient: {
                  include: { demographics: true },
                },
                payer: true,
              },
            },
          },
          orderBy: [
            { appealDeadline: 'asc' },
            { createdAt: 'desc' },
          ],
          take: input.limit,
          skip: input.offset,
        }),
        ctx.prisma.aIAppeal.count({ where }),
      ]);

      return {
        appeals,
        total,
        hasMore: input.offset + appeals.length < total,
      };
    }),

  /**
   * Get a single AI appeal by ID
   */
  getAIAppeal: billerProcedure
    .input(z.object({ appealId: z.string() }))
    .query(async ({ ctx, input }) => {
      const appeal = await ctx.prisma.aIAppeal.findFirst({
        where: {
          id: input.appealId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          claim: {
            include: {
              patient: { include: { demographics: true } },
              payer: true,
              insurancePolicy: true,
              encounter: {
                include: {
                  provider: { include: { user: { select: { firstName: true, lastName: true } } } },
                  diagnoses: true,
                  charges: true,
                },
              },
            },
          },
        },
      });

      if (!appeal) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Appeal not found',
        });
      }

      return appeal;
    }),

  // ============================================
  // US-311: Claim Follow-Up Automation
  // ============================================

  /**
   * Follow up on a single claim - check status and determine next action
   */
  followUp: billerProcedure
    .input(
      z.object({
        claimId: z.string(),
        forceCheck: z.boolean().default(false),
        includePayerCall: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const agent = new ClaimFollowUpAgent(ctx.prisma, ctx.user.organizationId);
        const result = await agent.followUp(input);

        // Audit log
        await ctx.prisma.aIBillingAudit.create({
          data: {
            action: 'FOLLOW_UP_CLAIM',
            entityType: 'Claim',
            entityId: input.claimId,
            decision: result.recommendedAction,
            confidence: result.isStalled ? 0.9 : 0.7,
            reasoning: result.actionReason,
            inputData: input,
            outputData: {
              daysInAR: result.daysInAR,
              isStalled: result.isStalled,
              stalledDays: result.stalledDays,
              priority: result.priority,
              escalationRequired: result.escalationRequired,
              staffTaskCreated: result.staffTaskCreated,
            },
            processingTimeMs: result.processingTimeMs,
            organizationId: ctx.user.organizationId,
          },
        });

        await auditLog('AI_BILLING_FOLLOW_UP', 'Claim', {
          entityId: input.claimId,
          changes: {
            action: 'follow_up',
            recommendedAction: result.recommendedAction,
            daysInAR: result.daysInAR,
            priority: result.priority,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return result;
      } catch (error) {
        console.error('Claim follow-up failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to follow up on claim',
          cause: error,
        });
      }
    }),

  /**
   * Batch follow-up on multiple claims
   */
  batchFollowUp: billerProcedure
    .input(
      z.object({
        claimIds: z.array(z.string()).optional(),
        autoSelectClaims: z.boolean().default(false),
        maxClaims: z.number().min(1).max(200).default(100),
        includeAgedOnly: z.boolean().default(false),
        minDaysInAR: z.number().min(0).optional(),
        payerIds: z.array(z.string()).optional(),
        statuses: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const agent = new ClaimFollowUpAgent(ctx.prisma, ctx.user.organizationId);
        const result = await agent.batchFollowUp(input);

        // Audit log
        await ctx.prisma.aIBillingAudit.create({
          data: {
            action: 'BATCH_FOLLOW_UP',
            entityType: 'Batch',
            entityId: result.batchId,
            decision: `Processed ${result.totalProcessed} claims`,
            reasoning: `Status updates: ${result.statusUpdates}, Stalled: ${result.stalledClaims}, Escalations: ${result.escalations}, Tasks: ${result.tasksGenerated}`,
            inputData: input,
            outputData: {
              totalProcessed: result.totalProcessed,
              statusUpdates: result.statusUpdates,
              stalledClaims: result.stalledClaims,
              escalations: result.escalations,
              tasksGenerated: result.tasksGenerated,
            },
            processingTimeMs: result.processingTimeMs,
            organizationId: ctx.user.organizationId,
          },
        });

        await auditLog('AI_BILLING_BATCH_FOLLOW_UP', 'Batch', {
          entityId: result.batchId,
          changes: {
            action: 'batch_follow_up',
            totalProcessed: result.totalProcessed,
            statusUpdates: result.statusUpdates,
            escalations: result.escalations,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return result;
      } catch (error) {
        console.error('Batch follow-up failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to process batch follow-up',
          cause: error,
        });
      }
    }),

  /**
   * Get stalled claims that need attention
   */
  getStalledClaims: billerProcedure
    .input(
      z.object({
        minDaysStalled: z.number().min(1).default(14),
        excludeStatuses: z.array(z.string()).optional(),
        includePayerIds: z.array(z.string()).optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const agent = new ClaimFollowUpAgent(ctx.prisma, ctx.user.organizationId);
        const claims = await agent.getStalledClaims({
          minDaysStalled: input.minDaysStalled,
          excludeStatuses: input.excludeStatuses || ['PAID', 'DENIED', 'VOID', 'APPEALED'],
          includePayerIds: input.includePayerIds,
        });

        return claims.slice(0, input.limit);
      } catch (error) {
        console.error('Failed to get stalled claims:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get stalled claims',
          cause: error,
        });
      }
    }),

  /**
   * Get AR aging report
   */
  getARAgingReport: billerProcedure.query(async ({ ctx }) => {
    try {
      const agent = new ClaimFollowUpAgent(ctx.prisma, ctx.user.organizationId);
      const report = await agent.getARAgingReport();

      await auditLog('AI_BILLING_GET_AR_AGING', 'Report', {
        entityId: 'ar_aging',
        changes: {
          action: 'view_report',
          totalClaims: report.totalClaims,
          totalAmount: report.totalAmount,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return report;
    } catch (error) {
      console.error('Failed to get AR aging report:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get AR aging report',
        cause: error,
      });
    }
  }),

  /**
   * Get payer response time analysis
   */
  getPayerResponseAnalysis: billerProcedure
    .input(
      z.object({
        payerId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const agent = new ClaimFollowUpAgent(ctx.prisma, ctx.user.organizationId);
        return agent.getPayerResponseAnalysis(input.payerId);
      } catch (error) {
        console.error('Failed to get payer response analysis:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get payer response analysis',
          cause: error,
        });
      }
    }),

  /**
   * Escalate aged claims
   */
  escalateAgedClaims: billerProcedure
    .input(
      z.object({
        minDaysInAR: z.number().min(1).optional(),
        minAmount: z.number().min(0).optional(),
        stalledDays: z.number().min(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const agent = new ClaimFollowUpAgent(ctx.prisma, ctx.user.organizationId);
        const escalated = await agent.escalateAgedClaims(input);

        // Audit log
        await ctx.prisma.aIBillingAudit.create({
          data: {
            action: 'ESCALATE_AGED_CLAIMS',
            entityType: 'Batch',
            entityId: 'escalation',
            decision: `Escalated ${escalated.length} claims`,
            reasoning: `Criteria: minDaysInAR=${input.minDaysInAR || 90}, minAmount=${input.minAmount || 500}, stalledDays=${input.stalledDays || 30}`,
            inputData: input,
            outputData: {
              escalatedCount: escalated.length,
              claimIds: escalated.map(c => c.claimId),
            },
            organizationId: ctx.user.organizationId,
          },
        });

        await auditLog('AI_BILLING_ESCALATE_CLAIMS', 'Batch', {
          entityId: 'escalation',
          changes: {
            action: 'escalate_aged_claims',
            escalatedCount: escalated.length,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return escalated;
      } catch (error) {
        console.error('Failed to escalate aged claims:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to escalate aged claims',
          cause: error,
        });
      }
    }),

  /**
   * Get follow-up schedule (upcoming and overdue)
   */
  getFollowUpSchedule: billerProcedure
    .input(
      z.object({
        daysAhead: z.number().min(1).max(30).default(7),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const agent = new ClaimFollowUpAgent(ctx.prisma, ctx.user.organizationId);
        return agent.getFollowUpSchedule(input.daysAhead);
      } catch (error) {
        console.error('Failed to get follow-up schedule:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get follow-up schedule',
          cause: error,
        });
      }
    }),

  /**
   * Get claims needing follow-up (prioritized list)
   */
  getClaimsNeedingFollowUp: billerProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const agent = new ClaimFollowUpAgent(ctx.prisma, ctx.user.organizationId);
        return agent.getClaimsNeedingFollowUp(input.limit);
      } catch (error) {
        console.error('Failed to get claims needing follow-up:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get claims needing follow-up',
          cause: error,
        });
      }
    }),

  // ============================================
  // US-312: Smart Payment Posting
  // ============================================

  /**
   * Process ERA and auto-post payments
   */
  processERA: billerProcedure
    .input(
      z.object({
        remittanceId: z.string(),
        autoPost: z.boolean().default(true),
        reviewThreshold: z.number().min(0).max(1).default(0.85),
        maxAdjustmentPercent: z.number().min(0).max(100).default(50),
        skipAlreadyPosted: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { SmartPaymentPoster } = await import('@/lib/ai-billing');
        const poster = new SmartPaymentPoster(ctx.prisma, ctx.user.organizationId);
        const result = await poster.processERA(input);

        // Audit log
        await ctx.prisma.aIBillingAudit.create({
          data: {
            action: 'PROCESS_ERA',
            entityType: 'Remittance',
            entityId: input.remittanceId,
            decision: `Posted ${result.posted} of ${result.totalLines} payments`,
            confidence: result.posted / Math.max(result.totalLines, 1),
            reasoning: `Auto-post: ${input.autoPost}, Threshold: ${input.reviewThreshold}`,
            inputData: input,
            outputData: {
              posted: result.posted,
              partiallyPosted: result.partiallyPosted,
              failed: result.failed,
              reviewRequired: result.reviewRequired,
              totalPostedAmount: result.totalPostedAmount,
              discrepancyCount: result.discrepancies.length,
            },
            processingTimeMs: result.processingTimeMs,
            organizationId: ctx.user.organizationId,
          },
        });

        await auditLog('AI_BILLING_PROCESS_ERA', 'Remittance', {
          entityId: input.remittanceId,
          changes: {
            action: 'process_era',
            posted: result.posted,
            totalLines: result.totalLines,
            totalPostedAmount: result.totalPostedAmount,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return result;
      } catch (error) {
        console.error('ERA processing failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to process ERA',
          cause: error,
        });
      }
    }),

  /**
   * Smart match payment to claims (US-312)
   */
  smartMatchPayment: billerProcedure
    .input(
      z.object({
        remittanceLineId: z.string().optional(),
        paymentAmount: z.number(),
        patientName: z.string().optional(),
        patientAccountNumber: z.string().optional(),
        serviceDate: z.date().optional(),
        cptCode: z.string().optional(),
        payerClaimNumber: z.string().optional(),
        checkNumber: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { SmartPaymentPoster } = await import('@/lib/ai-billing');
        const poster = new SmartPaymentPoster(ctx.prisma, ctx.user.organizationId);
        const result = await poster.matchPayment(input);

        await auditLog('AI_BILLING_MATCH_PAYMENT', 'Payment', {
          entityId: input.remittanceLineId || 'manual',
          changes: {
            action: 'match_payment',
            matchCount: result.matches.length,
            matchConfidence: result.matchConfidence,
            requiresReview: result.requiresManualReview,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return result;
      } catch (error) {
        console.error('Payment matching failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to match payment',
          cause: error,
        });
      }
    }),

  /**
   * Manual post payment with user override
   */
  manualPostPayment: billerProcedure
    .input(
      z.object({
        lineItemId: z.string(),
        claimId: z.string(),
        chargeId: z.string(),
        overrideAmount: z.number().optional(),
        adjustmentOverride: z
          .array(
            z.object({
              code: z.string(),
              reasonCode: z.string(),
              amount: z.number(),
              description: z.string(),
              isContractual: z.boolean(),
              isPatientResponsibility: z.boolean(),
            })
          )
          .optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { SmartPaymentPoster } = await import('@/lib/ai-billing');
        const poster = new SmartPaymentPoster(ctx.prisma, ctx.user.organizationId);
        const result = await poster.manualPostPayment(input.lineItemId, input.claimId, input.chargeId, {
          overrideAmount: input.overrideAmount,
          adjustmentOverride: input.adjustmentOverride,
          notes: input.notes,
        });

        await auditLog('AI_BILLING_MANUAL_POST', 'Payment', {
          entityId: input.lineItemId,
          changes: {
            action: 'manual_post',
            claimId: input.claimId,
            chargeId: input.chargeId,
            postedAmount: result.postedAmount,
            status: result.status,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return result;
      } catch (error) {
        console.error('Manual payment posting failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to post payment manually',
          cause: error,
        });
      }
    }),

  /**
   * Get unposted remittance line items
   */
  getUnpostedLineItems: billerProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const { SmartPaymentPoster } = await import('@/lib/ai-billing');
        const poster = new SmartPaymentPoster(ctx.prisma, ctx.user.organizationId);
        return poster.getUnpostedLineItems(input.limit);
      } catch (error) {
        console.error('Failed to get unposted line items:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get unposted line items',
          cause: error,
        });
      }
    }),

  /**
   * Get posting metrics for reporting
   */
  getPostingMetrics: billerProcedure
    .input(
      z.object({
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const { SmartPaymentPoster } = await import('@/lib/ai-billing');
        const poster = new SmartPaymentPoster(ctx.prisma, ctx.user.organizationId);
        return poster.getPostingMetrics(input.dateFrom, input.dateTo);
      } catch (error) {
        console.error('Failed to get posting metrics:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get posting metrics',
          cause: error,
        });
      }
    }),

  /**
   * Handle partial payment for a charge
   */
  handlePartialPayment: billerProcedure
    .input(
      z.object({
        chargeId: z.string(),
        paidAmount: z.number(),
        adjustments: z.array(
          z.object({
            code: z.string(),
            reasonCode: z.string(),
            amount: z.number(),
            description: z.string(),
            isContractual: z.boolean(),
            isPatientResponsibility: z.boolean(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { SmartPaymentPoster } = await import('@/lib/ai-billing');
        const poster = new SmartPaymentPoster(ctx.prisma, ctx.user.organizationId);
        const result = await poster.handlePartialPayment(
          input.chargeId,
          input.paidAmount,
          input.adjustments
        );

        await auditLog('AI_BILLING_PARTIAL_PAYMENT', 'Charge', {
          entityId: input.chargeId,
          changes: {
            action: 'handle_partial_payment',
            paidAmount: input.paidAmount,
            remainingBalance: result.remainingBalance,
            isPaidInFull: result.isPaidInFull,
            secondaryClaimNeeded: result.secondaryClaimNeeded,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return result;
      } catch (error) {
        console.error('Failed to handle partial payment:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to handle partial payment',
          cause: error,
        });
      }
    }),

  /**
   * Trigger secondary claim after primary payment
   */
  triggerSecondaryClaim: billerProcedure
    .input(
      z.object({
        primaryClaimId: z.string(),
        remittanceLineItemId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Get remittance line item
        const lineItem = await ctx.prisma.remittanceLineItem.findFirst({
          where: {
            id: input.remittanceLineItemId,
            remittance: { organizationId: ctx.user.organizationId },
          },
        });

        if (!lineItem) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Remittance line item not found',
          });
        }

        const { SmartPaymentPoster } = await import('@/lib/ai-billing');
        const poster = new SmartPaymentPoster(ctx.prisma, ctx.user.organizationId);
        const result = await poster.triggerSecondaryClaim(input.primaryClaimId, lineItem);

        if (result) {
          await auditLog('AI_BILLING_SECONDARY_CLAIM', 'Claim', {
            entityId: input.primaryClaimId,
            changes: {
              action: 'trigger_secondary_claim',
              secondaryClaimId: result.secondaryClaimId,
              primaryPaidAmount: result.primaryPaidAmount,
              remainingBalance: result.remainingBalance,
            },
            userId: ctx.user.id,
            organizationId: ctx.user.organizationId,
          });
        }

        return result;
      } catch (error) {
        console.error('Failed to trigger secondary claim:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to trigger secondary claim',
          cause: error,
        });
      }
    }),

  // ============================================
  // US-313: Billing Optimization Recommendations
  // ============================================

  /**
   * Get billing optimization recommendations
   */
  getRecommendations: billerProcedure
    .input(
      z.object({
        types: z.array(z.enum([
          'UNDERCODING',
          'MODIFIER_OPPORTUNITY',
          'DOCUMENTATION_GAP',
          'PAYER_MIX',
          'FEE_SCHEDULE',
          'CONTRACT_NEGOTIATION',
          'REVENUE_LEAKAGE',
          'CODING_OPTIMIZATION',
          'PROCEDURE_BUNDLING',
          'TIMELY_FILING',
        ])).optional(),
        minPriority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
        minPotentialRevenue: z.number().optional(),
        providerId: z.string().optional(),
        payerId: z.string().optional(),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const { BillingOptimizationAdvisor } = await import('@/lib/ai-billing');
        const advisor = new BillingOptimizationAdvisor(ctx.prisma);
        const result = await advisor.getRecommendations(ctx.user.organizationId, input);

        await auditLog('AI_BILLING_GET_RECOMMENDATIONS', 'Recommendation', {
          entityId: 'query',
          changes: {
            action: 'get_recommendations',
            types: input.types,
            count: result.recommendations.length,
            totalPotentialRevenue: result.totalPotentialRevenue,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return result;
      } catch (error) {
        console.error('Failed to get billing recommendations:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get billing recommendations',
          cause: error,
        });
      }
    }),

  /**
   * Mark recommendation as reviewed
   */
  markRecommendationReviewed: billerProcedure
    .input(
      z.object({
        recommendationId: z.string(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { BillingOptimizationAdvisor } = await import('@/lib/ai-billing');
        const advisor = new BillingOptimizationAdvisor(ctx.prisma);
        await advisor.markReviewed(
          ctx.user.organizationId,
          input.recommendationId,
          ctx.user.id,
          input.notes
        );

        await auditLog('AI_BILLING_REVIEW_RECOMMENDATION', 'Recommendation', {
          entityId: input.recommendationId,
          changes: {
            action: 'mark_reviewed',
            notes: input.notes,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return { success: true };
      } catch (error) {
        console.error('Failed to mark recommendation as reviewed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to mark recommendation as reviewed',
          cause: error,
        });
      }
    }),

  /**
   * Apply recommendation action
   */
  applyRecommendation: billerProcedure
    .input(
      z.object({
        recommendationId: z.string(),
        actionIndex: z.number().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { BillingOptimizationAdvisor } = await import('@/lib/ai-billing');
        const advisor = new BillingOptimizationAdvisor(ctx.prisma);
        const result = await advisor.applyRecommendation(
          ctx.user.organizationId,
          input.recommendationId,
          ctx.user.id,
          input.actionIndex
        );

        await auditLog('AI_BILLING_APPLY_RECOMMENDATION', 'Recommendation', {
          entityId: input.recommendationId,
          changes: {
            action: 'apply',
            actionIndex: input.actionIndex,
            success: result.success,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return result;
      } catch (error) {
        console.error('Failed to apply recommendation:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to apply recommendation',
          cause: error,
        });
      }
    }),

  /**
   * Dismiss recommendation
   */
  dismissRecommendation: billerProcedure
    .input(
      z.object({
        recommendationId: z.string(),
        reason: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { BillingOptimizationAdvisor } = await import('@/lib/ai-billing');
        const advisor = new BillingOptimizationAdvisor(ctx.prisma);
        await advisor.dismissRecommendation(
          ctx.user.organizationId,
          input.recommendationId,
          ctx.user.id,
          input.reason
        );

        await auditLog('AI_BILLING_DISMISS_RECOMMENDATION', 'Recommendation', {
          entityId: input.recommendationId,
          changes: {
            action: 'dismiss',
            reason: input.reason,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return { success: true };
      } catch (error) {
        console.error('Failed to dismiss recommendation:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to dismiss recommendation',
          cause: error,
        });
      }
    }),

  /**
   * Get fee schedule analysis
   */
  getFeeScheduleAnalysis: billerProcedure.query(async ({ ctx }) => {
    try {
      const { BillingOptimizationAdvisor } = await import('@/lib/ai-billing');
      const advisor = new BillingOptimizationAdvisor(ctx.prisma);
      const recommendations = await advisor.getRecommendations(ctx.user.organizationId, {
        types: ['FEE_SCHEDULE'],
      });

      await auditLog('AI_BILLING_FEE_SCHEDULE_ANALYSIS', 'FeeSchedule', {
        entityId: 'analysis',
        changes: {
          action: 'analyze',
          count: recommendations.recommendations.length,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return recommendations;
    } catch (error) {
      console.error('Failed to get fee schedule analysis:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get fee schedule analysis',
        cause: error,
      });
    }
  }),

  /**
   * Get contract negotiation insights
   */
  getContractInsights: billerProcedure
    .input(
      z.object({
        payerId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const { BillingOptimizationAdvisor } = await import('@/lib/ai-billing');
        const advisor = new BillingOptimizationAdvisor(ctx.prisma);
        const recommendations = await advisor.getRecommendations(ctx.user.organizationId, {
          types: ['CONTRACT_NEGOTIATION'],
          payerId: input.payerId,
        });

        await auditLog('AI_BILLING_CONTRACT_INSIGHTS', 'Contract', {
          entityId: input.payerId || 'all',
          changes: {
            action: 'analyze',
            count: recommendations.recommendations.length,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return recommendations;
      } catch (error) {
        console.error('Failed to get contract insights:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get contract insights',
          cause: error,
        });
      }
    }),

  /**
   * Get revenue leakage analysis
   */
  getRevenueLeakageAnalysis: billerProcedure
    .input(
      z.object({
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const { BillingOptimizationAdvisor } = await import('@/lib/ai-billing');
        const advisor = new BillingOptimizationAdvisor(ctx.prisma);
        const recommendations = await advisor.getRecommendations(ctx.user.organizationId, {
          types: ['REVENUE_LEAKAGE'],
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
        });

        await auditLog('AI_BILLING_REVENUE_LEAKAGE', 'RevenueLeakage', {
          entityId: 'analysis',
          changes: {
            action: 'analyze',
            count: recommendations.recommendations.length,
            totalPotentialRevenue: recommendations.totalPotentialRevenue,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return recommendations;
      } catch (error) {
        console.error('Failed to get revenue leakage analysis:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get revenue leakage analysis',
          cause: error,
        });
      }
    }),

  /**
   * Get optimization summary (dashboard data)
   */
  getOptimizationSummary: billerProcedure.query(async ({ ctx }) => {
    try {
      const { BillingOptimizationAdvisor } = await import('@/lib/ai-billing');
      const advisor = new BillingOptimizationAdvisor(ctx.prisma);
      const recommendations = await advisor.getRecommendations(ctx.user.organizationId, {
        limit: 100,
      });

      return {
        summary: recommendations.summary,
        totalPotentialRevenue: recommendations.totalPotentialRevenue,
        topOpportunities: recommendations.recommendations.slice(0, 10),
        analysisDate: recommendations.analysisDate,
      };
    } catch (error) {
      console.error('Failed to get optimization summary:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get optimization summary',
        cause: error,
      });
    }
  }),

  // ============================================
  // US-314: AI Billing Agent Dashboard
  // ============================================

  /**
   * Get agent activity feed - recent tasks and actions
   */
  getAgentActivityFeed: billerProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
        taskTypes: z.array(z.nativeEnum({
          SUBMIT: 'SUBMIT',
          FOLLOW_UP: 'FOLLOW_UP',
          APPEAL: 'APPEAL',
          CORRECT: 'CORRECT',
          POST: 'POST',
          SCRUB: 'SCRUB',
          ELIGIBILITY: 'ELIGIBILITY',
          STATUS: 'STATUS',
        } as const)).optional(),
        status: z.array(z.string()).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Build where clause
      const whereClause = {
        organizationId: ctx.user.organizationId,
        ...(input.taskTypes && input.taskTypes.length > 0 && { taskType: { in: input.taskTypes as any } }),
        ...(input.status && input.status.length > 0 && { status: { in: input.status as any } }),
      };

      const tasks = await ctx.prisma.aIBillingTask.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: input.limit,
        skip: input.offset,
      });

      // Get related data separately
      const claimIds = tasks.map((t) => t.claimId).filter(Boolean) as string[];
      const patientIds = tasks.map((t) => t.patientId).filter(Boolean) as string[];
      const payerIds = tasks.map((t) => t.payerId).filter(Boolean) as string[];
      const taskIds = tasks.map((t) => t.id);

      const [claims, patientDemographics, payers, decisions] = await Promise.all([
        claimIds.length > 0 ? ctx.prisma.claim.findMany({
          where: { id: { in: claimIds } },
          select: { id: true, totalCharges: true, status: true },
        }) : [],
        patientIds.length > 0 ? ctx.prisma.patientDemographics.findMany({
          where: { patientId: { in: patientIds } },
          select: { patientId: true, firstName: true, lastName: true },
        }) : [],
        payerIds.length > 0 ? ctx.prisma.insurancePayer.findMany({
          where: { id: { in: payerIds } },
          select: { id: true, name: true },
        }) : [],
        taskIds.length > 0 ? ctx.prisma.aIBillingDecision.findMany({
          where: { taskId: { in: taskIds } },
          orderBy: { createdAt: 'desc' },
        }) : [],
      ]);

      const claimsMap = new Map(claims.map((c) => [c.id, c]));
      const patientDemoMap = new Map(patientDemographics.map((p) => [p.patientId, p]));
      const payersMap = new Map(payers.map((p) => [p.id, p]));
      const decisionsMap = new Map<string, typeof decisions[0]>();
      decisions.forEach((d) => {
        if (!decisionsMap.has(d.taskId)) {
          decisionsMap.set(d.taskId, d);
        }
      });

      const total = await ctx.prisma.aIBillingTask.count({
        where: whereClause,
      });

      return {
        tasks: tasks.map((task) => {
          const claim = task.claimId ? claimsMap.get(task.claimId) : null;
          const patientDemo = task.patientId ? patientDemoMap.get(task.patientId) : null;
          const payer = task.payerId ? payersMap.get(task.payerId) : null;
          const latestDecision = decisionsMap.get(task.id);

          return {
            id: task.id,
            taskType: task.taskType,
            status: task.status,
            priority: task.priority,
            attempts: task.attempts,
            maxAttempts: task.maxAttempts,
            resultSummary: task.resultSummary,
            amountRecovered: task.amountRecovered ? Number(task.amountRecovered) : null,
            processingTimeMs: task.processingTimeMs,
            startedAt: task.startedAt,
            completedAt: task.completedAt,
            createdAt: task.createdAt,
            claim: claim ? { id: claim.id, patientName: 'Patient', totalCharges: claim.totalCharges, status: claim.status } : null,
            patient: patientDemo ? { id: task.patientId!, name: `${patientDemo.firstName} ${patientDemo.lastName}` } : null,
            payer: payer ? { id: payer.id, name: payer.name } : null,
            latestDecision: latestDecision ? {
              decision: latestDecision.decision,
              confidence: latestDecision.confidence,
              riskLevel: latestDecision.riskLevel,
            } : null,
          };
        }),
        total,
        hasMore: input.offset + input.limit < total,
      };
    }),

  /**
   * Get claims processed metrics - summary of claim operations
   */
  getClaimsProcessedMetrics: billerProcedure
    .input(
      z.object({
        periodType: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const dateFrom = input.dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const dateTo = input.dateTo || new Date();

      const metrics = await ctx.prisma.aIBillingMetric.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          periodType: input.periodType,
          metricDate: {
            gte: dateFrom,
            lte: dateTo,
          },
        },
        orderBy: { metricDate: 'asc' },
      });

      // Aggregate totals
      const totals = metrics.reduce(
        (acc, m) => ({
          claimsSubmitted: acc.claimsSubmitted + m.claimsSubmitted,
          claimsAccepted: acc.claimsAccepted + m.claimsAccepted,
          claimsRejected: acc.claimsRejected + m.claimsRejected,
          tasksCompleted: acc.tasksCompleted + m.tasksCompleted,
          tasksFailed: acc.tasksFailed + m.tasksFailed,
          paymentsPosted: acc.paymentsPosted + m.paymentsPosted,
          amountPosted: acc.amountPosted + Number(m.amountPosted),
          revenueRecovered: acc.revenueRecovered + Number(m.revenueRecovered),
        }),
        {
          claimsSubmitted: 0,
          claimsAccepted: 0,
          claimsRejected: 0,
          tasksCompleted: 0,
          tasksFailed: 0,
          paymentsPosted: 0,
          amountPosted: 0,
          revenueRecovered: 0,
        }
      );

      // Calculate rates
      const submissionRate = totals.claimsSubmitted > 0
        ? (totals.claimsAccepted / totals.claimsSubmitted) * 100
        : 0;
      const successRate = totals.tasksCompleted + totals.tasksFailed > 0
        ? (totals.tasksCompleted / (totals.tasksCompleted + totals.tasksFailed)) * 100
        : 0;

      return {
        periodType: input.periodType,
        dateFrom,
        dateTo,
        totals,
        submissionRate,
        successRate,
        metrics: metrics.map((m) => ({
          date: m.metricDate,
          claimsSubmitted: m.claimsSubmitted,
          claimsAccepted: m.claimsAccepted,
          claimsRejected: m.claimsRejected,
          submissionRate: m.submissionRate,
          tasksCompleted: m.tasksCompleted,
          tasksFailed: m.tasksFailed,
          paymentsPosted: m.paymentsPosted,
          amountPosted: Number(m.amountPosted),
          revenueRecovered: Number(m.revenueRecovered),
        })),
      };
    }),

  /**
   * Get denial and appeal tracking dashboard data
   */
  getDenialAppealTracking: billerProcedure
    .input(
      z.object({
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const dateFrom = input.dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const dateTo = input.dateTo || new Date();

      // Get denial counts by category
      const denialTasks = await ctx.prisma.aIBillingTask.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          taskType: 'APPEAL',
          createdAt: { gte: dateFrom, lte: dateTo },
        },
        include: {
          decisions: true,
        },
      });

      // Get AI appeals
      const appeals = await ctx.prisma.aIAppeal.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          createdAt: { gte: dateFrom, lte: dateTo },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Calculate appeal metrics
      const totalAppeals = appeals.length;
      const pendingAppeals = appeals.filter((a) => ['DRAFT', 'PENDING', 'SUBMITTED'].includes(a.status)).length;
      const wonAppeals = appeals.filter((a) => a.status === 'APPROVED').length;
      const lostAppeals = appeals.filter((a) => a.status === 'DENIED').length;
      const totalRecovered = appeals
        .filter((a) => a.status === 'APPROVED' && a.recoveredAmount)
        .reduce((sum, a) => sum + Number(a.recoveredAmount), 0);

      // Calculate success rate
      const decidedAppeals = wonAppeals + lostAppeals;
      const successRate = decidedAppeals > 0 ? (wonAppeals / decidedAppeals) * 100 : 0;

      // Group by denial category (using denialCode as category fallback)
      const categoryBreakdown = appeals.reduce((acc, a) => {
        const category = a.denialCode || 'OTHER';
        if (!acc[category]) {
          acc[category] = { count: 0, won: 0, lost: 0, pending: 0, amountAtRisk: 0, amountRecovered: 0 };
        }
        acc[category].count++;
        if (a.status === 'APPROVED') {
          acc[category].won++;
          acc[category].amountRecovered += Number(a.recoveredAmount || 0);
        } else if (a.status === 'DENIED') {
          acc[category].lost++;
        } else {
          acc[category].pending++;
          acc[category].amountAtRisk += Number(a.originalAmount || 0);
        }
        return acc;
      }, {} as Record<string, { count: number; won: number; lost: number; pending: number; amountAtRisk: number; amountRecovered: number }>);

      return {
        summary: {
          totalAppeals,
          pendingAppeals,
          wonAppeals,
          lostAppeals,
          successRate,
          totalRecovered,
          totalAtRisk: appeals
            .filter((a) => ['DRAFT', 'PENDING', 'SUBMITTED'].includes(a.status))
            .reduce((sum, a) => sum + Number(a.originalAmount || 0), 0),
        },
        categoryBreakdown: Object.entries(categoryBreakdown).map(([category, data]) => ({
          category,
          ...data,
          successRate: data.won + data.lost > 0 ? (data.won / (data.won + data.lost)) * 100 : 0,
        })),
        recentAppeals: appeals.slice(0, 10).map((a) => ({
          id: a.id,
          claimId: a.claimId,
          denialCode: a.denialCode,
          denialCategory: a.denialCode, // Use denialCode as category
          status: a.status,
          appealType: a.appealType,
          amountAtRisk: Number(a.originalAmount || 0),
          amountRecovered: Number(a.recoveredAmount || 0),
          deadline: a.appealDeadline,
          submittedDate: a.submittedAt,
          createdAt: a.createdAt,
        })),
      };
    }),

  /**
   * Get revenue impact visualization data
   */
  getRevenueImpactData: billerProcedure
    .input(
      z.object({
        periodType: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const dateFrom = input.dateFrom || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const dateTo = input.dateTo || new Date();

      const metrics = await ctx.prisma.aIBillingMetric.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          periodType: input.periodType,
          metricDate: { gte: dateFrom, lte: dateTo },
        },
        orderBy: { metricDate: 'asc' },
      });

      // Calculate cumulative revenue impact
      let cumulativeRecovered = 0;
      let cumulativeSaved = 0;
      const timeSeriesData = metrics.map((m) => {
        cumulativeRecovered += Number(m.revenueRecovered);
        cumulativeSaved += Number(m.denialPreventionSaved);
        return {
          date: m.metricDate,
          revenueRecovered: Number(m.revenueRecovered),
          denialPreventionSaved: Number(m.denialPreventionSaved),
          underpaymentAmount: Number(m.underpaymentAmount),
          amountPosted: Number(m.amountPosted),
          cumulativeRecovered,
          cumulativeSaved,
        };
      });

      // Calculate totals
      const totalRevenueRecovered = metrics.reduce((sum, m) => sum + Number(m.revenueRecovered), 0);
      const totalDenialsSaved = metrics.reduce((sum, m) => sum + Number(m.denialPreventionSaved), 0);
      const totalUnderpayments = metrics.reduce((sum, m) => sum + Number(m.underpaymentAmount), 0);
      const totalCostSavings = metrics.reduce((sum, m) => sum + Number(m.costSavingsUsd), 0);

      return {
        periodType: input.periodType,
        dateFrom,
        dateTo,
        totals: {
          revenueRecovered: totalRevenueRecovered,
          denialsSaved: totalDenialsSaved,
          underpaymentsCaught: totalUnderpayments,
          costSavings: totalCostSavings,
          totalImpact: totalRevenueRecovered + totalDenialsSaved + totalUnderpayments,
        },
        timeSeries: timeSeriesData,
      };
    }),

  /**
   * Get pending tasks queue
   */
  getPendingTasksQueue: billerProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        sortBy: z.enum(['priority', 'scheduledFor', 'createdAt']).default('priority'),
      })
    )
    .query(async ({ ctx, input }) => {
      const tasks = await ctx.prisma.aIBillingTask.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          status: { in: ['QUEUED', 'IN_PROGRESS'] },
        },
        orderBy: input.sortBy === 'priority'
          ? [{ priority: 'desc' }, { createdAt: 'asc' }]
          : input.sortBy === 'scheduledFor'
          ? [{ scheduledFor: 'asc' }, { priority: 'desc' }]
          : [{ createdAt: 'asc' }],
        take: input.limit,
      });

      // Get related data separately
      const claimIds = tasks.map((t) => t.claimId).filter(Boolean) as string[];
      const payerIds = tasks.map((t) => t.payerId).filter(Boolean) as string[];

      const [claims, payers] = await Promise.all([
        claimIds.length > 0 ? ctx.prisma.claim.findMany({
          where: { id: { in: claimIds } },
          select: { id: true, totalCharges: true },
        }) : [],
        payerIds.length > 0 ? ctx.prisma.insurancePayer.findMany({
          where: { id: { in: payerIds } },
          select: { id: true, name: true },
        }) : [],
      ]);

      const claimsMap = new Map(claims.map((c) => [c.id, c]));
      const payersMap = new Map(payers.map((p) => [p.id, p]));

      const queueStats = await ctx.prisma.aIBillingTask.groupBy({
        by: ['taskType', 'status'],
        where: {
          organizationId: ctx.user.organizationId,
          status: { in: ['QUEUED', 'IN_PROGRESS'] },
        },
        _count: true,
      });

      return {
        tasks: tasks.map((t) => {
          const claim = t.claimId ? claimsMap.get(t.claimId) : null;
          const payer = t.payerId ? payersMap.get(t.payerId) : null;

          return {
            id: t.id,
            taskType: t.taskType,
            status: t.status,
            priority: t.priority,
            scheduledFor: t.scheduledFor,
            attempts: t.attempts,
            maxAttempts: t.maxAttempts,
            lastError: t.lastError,
            claim: claim ? { id: claim.id, patientName: 'Patient', totalCharges: claim.totalCharges } : null,
            payer: payer ? { id: payer.id, name: payer.name } : null,
            createdAt: t.createdAt,
          };
        }),
        stats: queueStats.reduce((acc, s) => {
          if (!acc[s.taskType]) acc[s.taskType] = { queued: 0, inProgress: 0 };
          if (s.status === 'QUEUED') acc[s.taskType].queued = s._count;
          if (s.status === 'IN_PROGRESS') acc[s.taskType].inProgress = s._count;
          return acc;
        }, {} as Record<string, { queued: number; inProgress: number }>),
        totalPending: queueStats.reduce((sum, s) => sum + s._count, 0),
      };
    }),

  /**
   * Get agent configuration and rules
   */
  getAgentConfiguration: billerProcedure.query(async ({ ctx }) => {
    const rules = await ctx.prisma.aIBillingRule.findMany({
      where: {
        organizationId: ctx.user.organizationId,
        isActive: true,
      },
      orderBy: { priority: 'desc' },
    });

    // Group rules by category
    const rulesByType = rules.reduce((acc, rule) => {
      const ruleType = rule.category || 'OTHER';
      if (!acc[ruleType]) acc[ruleType] = [];
      acc[ruleType].push({
        id: rule.id,
        name: rule.name,
        description: rule.description,
        priority: rule.priority,
        isActive: rule.isActive,
        conditions: rule.conditions,
        actions: rule.actions,
        triggerType: rule.triggerType,
        lastTriggered: rule.lastRunAt,
        triggerCount: rule.runCount,
      });
      return acc;
    }, {} as Record<string, any[]>);

    return {
      totalRules: rules.length,
      rulesByType,
      automationEnabled: true, // Could be stored in org settings
    };
  }),

  /**
   * Update agent rule
   */
  updateAgentRule: billerProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        isActive: z.boolean().optional(),
        priority: z.number().optional(),
        conditions: z.record(z.string(), z.unknown()).optional(),
        actions: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      // Build update data - cast conditions and actions properly
      const updateData: any = {};
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.isActive !== undefined) updateData.isActive = updates.isActive;
      if (updates.priority !== undefined) updateData.priority = updates.priority;
      if (updates.conditions !== undefined) updateData.conditions = updates.conditions;
      if (updates.actions !== undefined) updateData.actions = updates.actions;

      const rule = await ctx.prisma.aIBillingRule.update({
        where: {
          id,
          organizationId: ctx.user.organizationId,
        },
        data: updateData,
      });

      await auditLog('AI_BILLING_UPDATE_RULE', 'AIBillingRule', {
        entityId: id,
        changes: updates,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return rule;
    }),

  /**
   * Get performance comparison (manual vs AI)
   */
  getPerformanceComparison: billerProcedure
    .input(
      z.object({
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const dateFrom = input.dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const dateTo = input.dateTo || new Date();

      const metrics = await ctx.prisma.aIBillingMetric.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          metricDate: { gte: dateFrom, lte: dateTo },
        },
      });

      // Calculate totals
      const totals = metrics.reduce(
        (acc, m) => ({
          tasksCompleted: acc.tasksCompleted + m.tasksCompleted,
          aiDecisionsMade: acc.aiDecisionsMade + m.aiDecisionsMade,
          aiDecisionsCorrect: acc.aiDecisionsCorrect + m.aiDecisionsCorrect,
          userOverrides: acc.userOverrides + m.userOverrides,
          manualHoursEquivalent: acc.manualHoursEquivalent + m.manualHoursEquivalent,
          costSavingsUsd: acc.costSavingsUsd + Number(m.costSavingsUsd),
          aiCostUsd: acc.aiCostUsd + Number(m.aiCostUsd),
          avgProcessingMs: acc.avgProcessingMs + m.avgProcessingMs,
          appealSuccessRate: acc.appealSuccessRate + m.appealSuccessRate,
          collectionRate: acc.collectionRate + m.collectionRate,
          avgDaysInAR: acc.avgDaysInAR + m.avgDaysInAR,
        }),
        {
          tasksCompleted: 0,
          aiDecisionsMade: 0,
          aiDecisionsCorrect: 0,
          userOverrides: 0,
          manualHoursEquivalent: 0,
          costSavingsUsd: 0,
          aiCostUsd: 0,
          avgProcessingMs: 0,
          appealSuccessRate: 0,
          collectionRate: 0,
          avgDaysInAR: 0,
        }
      );

      const count = metrics.length || 1;
      const aiAccuracyRate = totals.aiDecisionsMade > 0
        ? (totals.aiDecisionsCorrect / totals.aiDecisionsMade) * 100
        : 0;

      return {
        dateFrom,
        dateTo,
        ai: {
          tasksCompleted: totals.tasksCompleted,
          decisionsAccuracyRate: aiAccuracyRate,
          avgProcessingTimeMs: Math.round(totals.avgProcessingMs / count),
          appealSuccessRate: totals.appealSuccessRate / count,
          collectionRate: totals.collectionRate / count,
          avgDaysInAR: totals.avgDaysInAR / count,
          costUsd: totals.aiCostUsd,
        },
        manual: {
          hoursEquivalent: totals.manualHoursEquivalent,
          estimatedCostUsd: totals.manualHoursEquivalent * 35, // Assume $35/hour
          avgProcessingTimeMs: 300000, // 5 minutes per task estimate
          appealSuccessRate: 45, // Industry average
          collectionRate: 85, // Industry average
          avgDaysInAR: 45, // Industry average
        },
        savings: {
          hoursSaved: totals.manualHoursEquivalent,
          costSavingsUsd: totals.costSavingsUsd,
          netSavingsUsd: totals.costSavingsUsd - totals.aiCostUsd,
          efficiencyGain: totals.tasksCompleted > 0
            ? ((300000 - (totals.avgProcessingMs / count)) / 300000) * 100
            : 0,
        },
        userOverrides: totals.userOverrides,
        overrideRate: totals.aiDecisionsMade > 0
          ? (totals.userOverrides / totals.aiDecisionsMade) * 100
          : 0,
      };
    }),

  /**
   * Get ROI calculator data
   */
  getROICalculator: billerProcedure
    .input(
      z.object({
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const dateFrom = input.dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const dateTo = input.dateTo || new Date();

      const metrics = await ctx.prisma.aIBillingMetric.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          metricDate: { gte: dateFrom, lte: dateTo },
        },
      });

      // Calculate totals
      const revenueRecovered = metrics.reduce((sum, m) => sum + Number(m.revenueRecovered), 0);
      const denialsSaved = metrics.reduce((sum, m) => sum + Number(m.denialPreventionSaved), 0);
      const underpaymentsCaught = metrics.reduce((sum, m) => sum + Number(m.underpaymentAmount), 0);
      const manualHoursSaved = metrics.reduce((sum, m) => sum + m.manualHoursEquivalent, 0);
      const aiCost = metrics.reduce((sum, m) => sum + Number(m.aiCostUsd), 0);

      // Calculate labor savings (assume $35/hour)
      const laborRate = 35;
      const laborSavings = manualHoursSaved * laborRate;

      // Calculate total benefits
      const totalBenefits = revenueRecovered + denialsSaved + underpaymentsCaught + laborSavings;

      // Calculate ROI
      const roi = aiCost > 0 ? ((totalBenefits - aiCost) / aiCost) * 100 : 0;

      // Monthly projections
      const daysCovered = Math.max(1, Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (24 * 60 * 60 * 1000)));
      const dailyBenefits = totalBenefits / daysCovered;
      const monthlyProjection = dailyBenefits * 30;
      const annualProjection = dailyBenefits * 365;

      return {
        period: {
          dateFrom,
          dateTo,
          daysCovered,
        },
        benefits: {
          revenueRecovered,
          denialsSaved,
          underpaymentsCaught,
          laborSavings,
          totalBenefits,
        },
        costs: {
          aiCost,
          laborRate,
          hoursEquivalent: manualHoursSaved,
        },
        roi: {
          percentage: roi,
          netBenefit: totalBenefits - aiCost,
          paybackDays: totalBenefits > 0 ? Math.ceil((aiCost / totalBenefits) * daysCovered) : 0,
        },
        projections: {
          daily: dailyBenefits,
          monthly: monthlyProjection,
          annual: annualProjection,
          monthlyROI: aiCost > 0 ? ((monthlyProjection - (aiCost / daysCovered * 30)) / (aiCost / daysCovered * 30)) * 100 : 0,
        },
      };
    }),
});
