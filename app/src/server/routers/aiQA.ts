/**
 * AI Quality Assurance Agent Router (Epic 36)
 *
 * AI agent that continuously audits documentation, coding, compliance, and clinical quality.
 * Identifies risks before they become problems and ensures consistent quality standards.
 */

import { z } from 'zod';
import { router, providerProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
// AI service will be used for future AI-powered recommendations
// import { aiService } from '@/lib/ai-service';
import type { Prisma } from '@prisma/client';

// ============================================
// US-348: Documentation quality audit
// ============================================

// Quality scoring criteria
interface QualityCriteria {
  name: string;
  weight: number;
  description: string;
}

const documentationCriteria: QualityCriteria[] = [
  { name: 'completeness', weight: 20, description: 'All SOAP sections present and adequate' },
  { name: 'medicalNecessity', weight: 25, description: 'Clear documentation of medical necessity' },
  { name: 'diagnosisLinkage', weight: 20, description: 'Diagnoses linked to procedures performed' },
  { name: 'progressNoteAdequacy', weight: 15, description: 'Adequate progress documentation' },
  { name: 'treatmentPlanDocumentation', weight: 20, description: 'Treatment plan clearly documented' },
];

// Assessment result interface
interface DocumentationAssessment {
  criteriaName: string;
  score: number;
  maxScore: number;
  passed: boolean;
  issues: string[];
  recommendations: string[];
}

// Finding generator helper
function generateFindingsFromAssessment(
  assessment: DocumentationAssessment,
  entityType: string,
  entityId: string,
  providerId?: string,
  patientId?: string
): {
  findingType: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  title: string;
  description: string;
  recommendation: string;
  entityType: string;
  entityId: string;
  providerId?: string;
  patientId?: string;
  riskScore: number;
  complianceImpact: boolean;
}[] {
  const findings: ReturnType<typeof generateFindingsFromAssessment> = [];

  const percentage = (assessment.score / assessment.maxScore) * 100;

  // Determine severity based on score
  let severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  if (percentage < 50) severity = 'CRITICAL';
  else if (percentage < 70) severity = 'HIGH';
  else if (percentage < 85) severity = 'MEDIUM';
  else if (percentage < 95) severity = 'LOW';
  else severity = 'INFO';

  for (const issue of assessment.issues) {
    findings.push({
      findingType: `DOCUMENTATION_${assessment.criteriaName.toUpperCase()}`,
      severity,
      title: `${assessment.criteriaName} issue detected`,
      description: issue,
      recommendation: assessment.recommendations[0] || 'Review and update documentation',
      entityType,
      entityId,
      providerId,
      patientId,
      riskScore: Math.round(100 - percentage),
      complianceImpact: severity === 'CRITICAL' || severity === 'HIGH',
    });
  }

  return findings;
}

export const aiQARouter = router({
  /**
   * Audit documentation quality for a specific encounter or range of encounters
   * Reviews note quality, completeness, medical necessity, diagnosis-procedure linkage,
   * progress note adequacy, and treatment plan documentation
   */
  auditDocumentation: providerProcedure
    .input(
      z.object({
        // Can audit a single encounter or a date range
        encounterId: z.string().optional(),
        providerId: z.string().optional(),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
        // Pagination for range audits
        limit: z.number().min(1).max(100).default(10),
        offset: z.number().min(0).default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { encounterId, providerId, dateFrom, dateTo, limit, offset } = input;

      // Build where clause for encounters
      const whereClause: Prisma.EncounterWhereInput = {
        organizationId: ctx.user.organizationId,
        status: { in: ['COMPLETED', 'SIGNED'] },
      };

      if (encounterId) {
        whereClause.id = encounterId;
      }
      if (providerId) {
        whereClause.providerId = providerId;
      }
      if (dateFrom || dateTo) {
        whereClause.encounterDate = {};
        if (dateFrom) whereClause.encounterDate.gte = dateFrom;
        if (dateTo) whereClause.encounterDate.lte = dateTo;
      }

      // Get encounters to audit
      const encounters = await ctx.prisma.encounter.findMany({
        where: whereClause,
        include: {
          soapNote: true,
          diagnoses: true,
          procedures: true,
          treatmentPlan: true,
          patient: {
            include: {
              demographics: true,
            },
          },
          provider: {
            include: {
              user: true,
            },
          },
        },
        orderBy: { encounterDate: 'desc' },
        take: limit,
        skip: offset,
      });

      if (encounters.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No encounters found matching criteria',
        });
      }

      // Create the audit record
      const audit = await ctx.prisma.qAAudit.create({
        data: {
          organizationId: ctx.user.organizationId,
          auditType: 'DOCUMENTATION',
          targetType: encounterId ? 'Encounter' : 'EncounterRange',
          targetId: encounterId || null,
          providerId: providerId || null,
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
          sampleSize: encounters.length,
          populationSize: encounters.length,
          methodology: 'AI-assisted documentation quality audit',
          status: 'IN_PROGRESS',
        },
      });

      // Audit results aggregation
      const allFindings: Prisma.QAFindingCreateManyInput[] = [];
      const encounterScores: { encounterId: string; score: number; assessments: DocumentationAssessment[] }[] = [];
      let totalScore = 0;
      let criticalCount = 0;
      let highCount = 0;
      let mediumCount = 0;
      let lowCount = 0;

      // Process each encounter
      for (const encounter of encounters) {
        const assessments: DocumentationAssessment[] = [];
        let encounterScore = 0;
        let maxPossibleScore = 0;

        // Cast encounter to interface (Prisma returns compatible structure)
        const encData = encounter as unknown as EncounterWithRelations;

        // 1. Completeness Assessment
        const completenessAssessment = assessCompleteness(encData);
        assessments.push(completenessAssessment);
        encounterScore += completenessAssessment.score;
        maxPossibleScore += completenessAssessment.maxScore;

        // 2. Medical Necessity Assessment
        const medicalNecessityAssessment = assessMedicalNecessity(encData);
        assessments.push(medicalNecessityAssessment);
        encounterScore += medicalNecessityAssessment.score;
        maxPossibleScore += medicalNecessityAssessment.maxScore;

        // 3. Diagnosis-Procedure Linkage Assessment
        const diagnosisLinkageAssessment = assessDiagnosisLinkage(encData);
        assessments.push(diagnosisLinkageAssessment);
        encounterScore += diagnosisLinkageAssessment.score;
        maxPossibleScore += diagnosisLinkageAssessment.maxScore;

        // 4. Progress Note Adequacy Assessment
        const progressNoteAssessment = assessProgressNoteAdequacy(encData);
        assessments.push(progressNoteAssessment);
        encounterScore += progressNoteAssessment.score;
        maxPossibleScore += progressNoteAssessment.maxScore;

        // 5. Treatment Plan Documentation Assessment
        const treatmentPlanAssessment = assessTreatmentPlanDocumentation(encData);
        assessments.push(treatmentPlanAssessment);
        encounterScore += treatmentPlanAssessment.score;
        maxPossibleScore += treatmentPlanAssessment.maxScore;

        // Calculate normalized score (0-100)
        const normalizedScore = Math.round((encounterScore / maxPossibleScore) * 100);
        totalScore += normalizedScore;

        encounterScores.push({
          encounterId: encounter.id,
          score: normalizedScore,
          assessments,
        });

        // Generate findings from all assessments
        for (const assessment of assessments) {
          if (!assessment.passed || assessment.issues.length > 0) {
            const findings = generateFindingsFromAssessment(
              assessment,
              'Encounter',
              encounter.id,
              encounter.providerId,
              encounter.patientId
            );

            for (const finding of findings) {
              if (finding.severity === 'CRITICAL') criticalCount++;
              else if (finding.severity === 'HIGH') highCount++;
              else if (finding.severity === 'MEDIUM') mediumCount++;
              else if (finding.severity === 'LOW') lowCount++;

              allFindings.push({
                auditId: audit.id,
                organizationId: ctx.user.organizationId,
                findingType: finding.findingType,
                severity: finding.severity,
                title: finding.title,
                description: finding.description,
                recommendation: finding.recommendation,
                entityType: finding.entityType,
                entityId: finding.entityId,
                providerId: finding.providerId,
                patientId: finding.patientId,
                riskScore: finding.riskScore,
                complianceImpact: finding.complianceImpact,
              });
            }
          }
        }
      }

      // Calculate overall audit score
      const overallScore = Math.round(totalScore / encounters.length);
      const scoreCategory = getScoreCategory(overallScore);

      // Create findings in database
      if (allFindings.length > 0) {
        await ctx.prisma.qAFinding.createMany({
          data: allFindings,
        });
      }

      // Generate recommendations using AI
      const recommendations = await generateAIRecommendations(
        encounterScores,
        allFindings.length,
        criticalCount,
        highCount
      );

      // Update audit with final results
      const updatedAudit = await ctx.prisma.qAAudit.update({
        where: { id: audit.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          score: overallScore,
          scoreCategory,
          findingsCount: allFindings.length,
          criticalCount,
          highCount,
          mediumCount,
          lowCount,
          summary: `Documentation quality audit completed for ${encounters.length} encounters. Overall score: ${overallScore}/100 (${scoreCategory}). Found ${allFindings.length} issues requiring attention.`,
          recommendations: recommendations,
        },
        include: {
          findings: {
            orderBy: [
              { severity: 'asc' },
              { createdAt: 'desc' },
            ],
            take: 20,
          },
        },
      });

      // Create or update quality metrics
      await updateQualityMetrics(ctx, overallScore, encounters.length, providerId);

      // Log the audit action
      await auditLog('AI_QA_DOCUMENTATION_AUDIT', 'QAAudit', {
        entityId: audit.id,
        changes: {
          encountersAudited: encounters.length,
          score: overallScore,
          findingsCount: allFindings.length,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        auditId: updatedAudit.id,
        score: overallScore,
        scoreCategory,
        encountersAudited: encounters.length,
        summary: {
          total: allFindings.length,
          critical: criticalCount,
          high: highCount,
          medium: mediumCount,
          low: lowCount,
        },
        findings: updatedAudit.findings,
        encounterScores,
        recommendations,
      };
    }),

  /**
   * Get documentation quality score history
   * Tracks quality scores over time for trend analysis
   */
  getDocumentationScoreHistory: providerProcedure
    .input(
      z.object({
        providerId: z.string().optional(),
        period: z.enum(['weekly', 'monthly', 'quarterly']).default('monthly'),
        limit: z.number().min(1).max(24).default(12),
      })
    )
    .query(async ({ ctx, input }) => {
      const { providerId, period, limit } = input;

      const whereClause: Prisma.QAMetricWhereInput = {
        organizationId: ctx.user.organizationId,
        metricType: { in: ['DOCUMENTATION_COMPLETENESS', 'DOCUMENTATION_ACCURACY'] },
        period,
      };

      if (providerId) {
        whereClause.providerId = providerId;
      }

      const metrics = await ctx.prisma.qAMetric.findMany({
        where: whereClause,
        orderBy: { periodStart: 'desc' },
        take: limit,
      });

      // Group by period and calculate averages
      const periodMap = new Map<string, { scores: number[]; periodStart: Date; periodEnd: Date }>();

      for (const metric of metrics) {
        const key = metric.periodStart.toISOString();
        if (!periodMap.has(key)) {
          periodMap.set(key, {
            scores: [],
            periodStart: metric.periodStart,
            periodEnd: metric.periodEnd,
          });
        }
        periodMap.get(key)!.scores.push(Number(metric.percentage));
      }

      const history = Array.from(periodMap.entries()).map(([, data]) => ({
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        averageScore: Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length),
        dataPoints: data.scores.length,
      }));

      return {
        history,
        trend: calculateTrend(history.map(h => h.averageScore)),
      };
    }),

  /**
   * Get audit history for documentation audits
   */
  getDocumentationAuditHistory: providerProcedure
    .input(
      z.object({
        providerId: z.string().optional(),
        limit: z.number().min(1).max(50).default(10),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { providerId, limit, offset } = input;

      const whereClause: Prisma.QAAuditWhereInput = {
        organizationId: ctx.user.organizationId,
        auditType: 'DOCUMENTATION',
        status: 'COMPLETED',
      };

      if (providerId) {
        whereClause.providerId = providerId;
      }

      const [audits, total] = await Promise.all([
        ctx.prisma.qAAudit.findMany({
          where: whereClause,
          orderBy: { auditDate: 'desc' },
          take: limit,
          skip: offset,
          include: {
            _count: {
              select: { findings: true },
            },
          },
        }),
        ctx.prisma.qAAudit.count({ where: whereClause }),
      ]);

      return {
        audits: audits.map(a => ({
          id: a.id,
          auditDate: a.auditDate,
          score: a.score,
          scoreCategory: a.scoreCategory,
          sampleSize: a.sampleSize,
          findingsCount: a._count.findings,
          summary: a.summary,
        })),
        total,
        hasMore: offset + limit < total,
      };
    }),

  /**
   * Get specific documentation finding details
   */
  getDocumentationFinding: providerProcedure
    .input(z.object({ findingId: z.string() }))
    .query(async ({ ctx, input }) => {
      const finding = await ctx.prisma.qAFinding.findFirst({
        where: {
          id: input.findingId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          audit: true,
        },
      });

      if (!finding) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Finding not found',
        });
      }

      return finding;
    }),

  /**
   * Resolve a documentation finding
   */
  resolveFinding: providerProcedure
    .input(
      z.object({
        findingId: z.string(),
        resolutionNote: z.string().min(1),
        status: z.enum(['RESOLVED', 'DISMISSED', 'DEFERRED']).default('RESOLVED'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { findingId, resolutionNote, status } = input;

      const finding = await ctx.prisma.qAFinding.findFirst({
        where: {
          id: findingId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!finding) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Finding not found',
        });
      }

      const updated = await ctx.prisma.qAFinding.update({
        where: { id: findingId },
        data: {
          status,
          resolvedAt: new Date(),
          resolvedBy: ctx.user.id,
          resolutionNote,
        },
      });

      await auditLog('AI_QA_FINDING_RESOLVED', 'QAFinding', {
        entityId: findingId,
        changes: { status, resolutionNote },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  // ============================================
  // US-349: Coding accuracy audit
  // ============================================

  /**
   * Audit coding accuracy for claims and encounters
   * Reviews code-to-documentation match, modifier appropriateness, upcoding/downcoding,
   * bundling compliance, and LCD/NCD compliance
   */
  auditCoding: providerProcedure
    .input(
      z.object({
        // Can audit a single claim or a date range
        claimId: z.string().optional(),
        encounterId: z.string().optional(),
        providerId: z.string().optional(),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
        // Pagination for range audits
        limit: z.number().min(1).max(100).default(10),
        offset: z.number().min(0).default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { claimId, encounterId, providerId, dateFrom, dateTo, limit, offset } = input;

      // Build where clause for claims
      const whereClause: Prisma.ClaimWhereInput = {
        organizationId: ctx.user.organizationId,
        status: { notIn: ['DRAFT'] }, // Only audit submitted claims
      };

      if (claimId) {
        whereClause.id = claimId;
      }
      if (encounterId) {
        whereClause.encounterId = encounterId;
      }
      if (providerId) {
        whereClause.encounter = { providerId };
      }
      if (dateFrom || dateTo) {
        whereClause.createdDate = {};
        if (dateFrom) whereClause.createdDate.gte = dateFrom;
        if (dateTo) whereClause.createdDate.lte = dateTo;
      }

      // Get claims to audit
      const claims = await ctx.prisma.claim.findMany({
        where: whereClause,
        include: {
          claimLines: {
            include: {
              charge: true,
            },
          },
          encounter: {
            include: {
              soapNote: true,
              diagnoses: true,
              procedures: true,
              provider: {
                include: {
                  user: true,
                },
              },
            },
          },
          patient: {
            include: {
              demographics: true,
            },
          },
        },
        orderBy: { createdDate: 'desc' },
        take: limit,
        skip: offset,
      });

      if (claims.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No claims found matching criteria',
        });
      }

      // Create the audit record
      const audit = await ctx.prisma.qAAudit.create({
        data: {
          organizationId: ctx.user.organizationId,
          auditType: 'CODING',
          targetType: claimId ? 'Claim' : 'ClaimRange',
          targetId: claimId || null,
          providerId: providerId || null,
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
          sampleSize: claims.length,
          populationSize: claims.length,
          methodology: 'AI-assisted coding accuracy audit',
          status: 'IN_PROGRESS',
        },
      });

      // Audit results aggregation
      const allFindings: Prisma.QAFindingCreateManyInput[] = [];
      const claimScores: { claimId: string; score: number; assessments: CodingAssessment[] }[] = [];
      let totalScore = 0;
      let criticalCount = 0;
      let highCount = 0;
      let mediumCount = 0;
      let lowCount = 0;

      // Provider-level accuracy tracking
      const providerStats = new Map<string, {
        providerId: string;
        providerName: string;
        claimsAudited: number;
        totalScore: number;
        findings: number;
      }>();

      // Process each claim
      for (const claim of claims) {
        const assessments: CodingAssessment[] = [];
        let claimScore = 0;
        let maxPossibleScore = 0;

        // 1. Code-to-Documentation Match Assessment
        const codeDocMatchAssessment = assessCodeDocumentationMatch(claim);
        assessments.push(codeDocMatchAssessment);
        claimScore += codeDocMatchAssessment.score;
        maxPossibleScore += codeDocMatchAssessment.maxScore;

        // 2. Modifier Appropriateness Assessment
        const modifierAssessment = assessModifierAppropriateness(claim);
        assessments.push(modifierAssessment);
        claimScore += modifierAssessment.score;
        maxPossibleScore += modifierAssessment.maxScore;

        // 3. Upcoding/Downcoding Detection
        const upDownCodingAssessment = assessUpDownCoding(claim);
        assessments.push(upDownCodingAssessment);
        claimScore += upDownCodingAssessment.score;
        maxPossibleScore += upDownCodingAssessment.maxScore;

        // 4. Bundling Compliance Assessment
        const bundlingAssessment = assessBundlingCompliance(claim);
        assessments.push(bundlingAssessment);
        claimScore += bundlingAssessment.score;
        maxPossibleScore += bundlingAssessment.maxScore;

        // 5. LCD/NCD Compliance Assessment
        const lcdNcdAssessment = assessLcdNcdCompliance(claim);
        assessments.push(lcdNcdAssessment);
        claimScore += lcdNcdAssessment.score;
        maxPossibleScore += lcdNcdAssessment.maxScore;

        // Calculate normalized score (0-100)
        const normalizedScore = maxPossibleScore > 0
          ? Math.round((claimScore / maxPossibleScore) * 100)
          : 100;
        totalScore += normalizedScore;

        claimScores.push({
          claimId: claim.id,
          score: normalizedScore,
          assessments,
        });

        // Track provider stats
        if (claim.encounter?.providerId) {
          const providerId = claim.encounter.providerId;
          const providerName = claim.encounter.provider
            ? `${claim.encounter.provider.user.firstName} ${claim.encounter.provider.user.lastName}`
            : 'Unknown';

          const existing = providerStats.get(providerId) || {
            providerId,
            providerName,
            claimsAudited: 0,
            totalScore: 0,
            findings: 0,
          };
          existing.claimsAudited++;
          existing.totalScore += normalizedScore;
          providerStats.set(providerId, existing);
        }

        // Generate findings from all assessments
        for (const assessment of assessments) {
          if (!assessment.passed || assessment.issues.length > 0) {
            const findings = generateCodingFindingsFromAssessment(
              assessment,
              'Claim',
              claim.id,
              claim.encounter?.providerId,
              claim.patientId
            );

            for (const finding of findings) {
              if (finding.severity === 'CRITICAL') criticalCount++;
              else if (finding.severity === 'HIGH') highCount++;
              else if (finding.severity === 'MEDIUM') mediumCount++;
              else if (finding.severity === 'LOW') lowCount++;

              // Update provider stats
              if (claim.encounter?.providerId) {
                const stats = providerStats.get(claim.encounter.providerId);
                if (stats) stats.findings++;
              }

              allFindings.push({
                auditId: audit.id,
                organizationId: ctx.user.organizationId,
                findingType: finding.findingType,
                severity: finding.severity,
                title: finding.title,
                description: finding.description,
                recommendation: finding.recommendation,
                entityType: finding.entityType,
                entityId: finding.entityId,
                providerId: finding.providerId,
                patientId: finding.patientId,
                riskScore: finding.riskScore,
                complianceImpact: finding.complianceImpact,
                relatedCodes: finding.relatedCodes as Prisma.InputJsonValue,
              });
            }
          }
        }
      }

      // Calculate overall audit score
      const overallScore = Math.round(totalScore / claims.length);
      const scoreCategory = getScoreCategory(overallScore);

      // Create findings in database
      if (allFindings.length > 0) {
        await ctx.prisma.qAFinding.createMany({
          data: allFindings,
        });
      }

      // Generate targeted education recommendations
      const recommendations = await generateCodingRecommendations(
        claimScores,
        providerStats,
        allFindings.length,
        criticalCount,
        highCount
      );

      // Update audit with final results
      const updatedAudit = await ctx.prisma.qAAudit.update({
        where: { id: audit.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          score: overallScore,
          scoreCategory,
          findingsCount: allFindings.length,
          criticalCount,
          highCount,
          mediumCount,
          lowCount,
          summary: `Coding accuracy audit completed for ${claims.length} claims. Overall accuracy: ${overallScore}% (${scoreCategory}). Found ${allFindings.length} coding issues requiring attention.`,
          recommendations: recommendations,
        },
        include: {
          findings: {
            orderBy: [
              { severity: 'asc' },
              { createdAt: 'desc' },
            ],
            take: 20,
          },
        },
      });

      // Update coding accuracy metrics
      await updateCodingMetrics(ctx, overallScore, claims.length, providerId);

      // Update provider-level metrics
      for (const [pid, stats] of providerStats) {
        const avgScore = Math.round(stats.totalScore / stats.claimsAudited);
        await updateCodingMetrics(ctx, avgScore, stats.claimsAudited, pid);
      }

      // Log the audit action
      await auditLog('AI_QA_CODING_AUDIT', 'QAAudit', {
        entityId: audit.id,
        changes: {
          claimsAudited: claims.length,
          score: overallScore,
          findingsCount: allFindings.length,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      // Convert provider stats map to array for return
      const providerAccuracyRates = Array.from(providerStats.values()).map(s => ({
        ...s,
        averageScore: Math.round(s.totalScore / s.claimsAudited),
      }));

      return {
        auditId: updatedAudit.id,
        score: overallScore,
        scoreCategory,
        claimsAudited: claims.length,
        summary: {
          total: allFindings.length,
          critical: criticalCount,
          high: highCount,
          medium: mediumCount,
          low: lowCount,
        },
        findings: updatedAudit.findings,
        claimScores,
        providerAccuracyRates,
        recommendations,
      };
    }),

  /**
   * Get coding accuracy score history
   * Tracks coding accuracy over time for trend analysis
   */
  getCodingAccuracyHistory: providerProcedure
    .input(
      z.object({
        providerId: z.string().optional(),
        period: z.enum(['weekly', 'monthly', 'quarterly']).default('monthly'),
        limit: z.number().min(1).max(24).default(12),
      })
    )
    .query(async ({ ctx, input }) => {
      const { providerId, period, limit } = input;

      const whereClause: Prisma.QAMetricWhereInput = {
        organizationId: ctx.user.organizationId,
        metricType: { in: ['CODING_ACCURACY', 'CODING_COMPLIANCE', 'MODIFIER_ACCURACY'] },
        period,
      };

      if (providerId) {
        whereClause.providerId = providerId;
      }

      const metrics = await ctx.prisma.qAMetric.findMany({
        where: whereClause,
        orderBy: { periodStart: 'desc' },
        take: limit * 3, // Get more to account for multiple metric types
      });

      // Group by period and calculate averages
      const periodMap = new Map<string, {
        scores: number[];
        periodStart: Date;
        periodEnd: Date;
        breakdown: {
          codingAccuracy: number[];
          codingCompliance: number[];
          modifierAccuracy: number[];
        };
      }>();

      for (const metric of metrics) {
        const key = metric.periodStart.toISOString();
        if (!periodMap.has(key)) {
          periodMap.set(key, {
            scores: [],
            periodStart: metric.periodStart,
            periodEnd: metric.periodEnd,
            breakdown: {
              codingAccuracy: [],
              codingCompliance: [],
              modifierAccuracy: [],
            },
          });
        }
        const entry = periodMap.get(key)!;
        entry.scores.push(Number(metric.percentage));

        if (metric.metricType === 'CODING_ACCURACY') {
          entry.breakdown.codingAccuracy.push(Number(metric.percentage));
        } else if (metric.metricType === 'CODING_COMPLIANCE') {
          entry.breakdown.codingCompliance.push(Number(metric.percentage));
        } else if (metric.metricType === 'MODIFIER_ACCURACY') {
          entry.breakdown.modifierAccuracy.push(Number(metric.percentage));
        }
      }

      const history = Array.from(periodMap.entries())
        .map(([, data]) => ({
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
          averageScore: data.scores.length > 0
            ? Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length)
            : 0,
          breakdown: {
            codingAccuracy: data.breakdown.codingAccuracy.length > 0
              ? Math.round(data.breakdown.codingAccuracy.reduce((a, b) => a + b, 0) / data.breakdown.codingAccuracy.length)
              : null,
            codingCompliance: data.breakdown.codingCompliance.length > 0
              ? Math.round(data.breakdown.codingCompliance.reduce((a, b) => a + b, 0) / data.breakdown.codingCompliance.length)
              : null,
            modifierAccuracy: data.breakdown.modifierAccuracy.length > 0
              ? Math.round(data.breakdown.modifierAccuracy.reduce((a, b) => a + b, 0) / data.breakdown.modifierAccuracy.length)
              : null,
          },
          dataPoints: data.scores.length,
        }))
        .slice(0, limit);

      return {
        history,
        trend: calculateTrend(history.map(h => h.averageScore)),
      };
    }),

  /**
   * Get coding audit history
   */
  getCodingAuditHistory: providerProcedure
    .input(
      z.object({
        providerId: z.string().optional(),
        limit: z.number().min(1).max(50).default(10),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { providerId, limit, offset } = input;

      const whereClause: Prisma.QAAuditWhereInput = {
        organizationId: ctx.user.organizationId,
        auditType: 'CODING',
        status: 'COMPLETED',
      };

      if (providerId) {
        whereClause.providerId = providerId;
      }

      const [audits, total] = await Promise.all([
        ctx.prisma.qAAudit.findMany({
          where: whereClause,
          orderBy: { auditDate: 'desc' },
          take: limit,
          skip: offset,
          include: {
            _count: {
              select: { findings: true },
            },
          },
        }),
        ctx.prisma.qAAudit.count({ where: whereClause }),
      ]);

      return {
        audits: audits.map(a => ({
          id: a.id,
          auditDate: a.auditDate,
          score: a.score,
          scoreCategory: a.scoreCategory,
          sampleSize: a.sampleSize,
          findingsCount: a._count.findings,
          criticalCount: a.criticalCount,
          highCount: a.highCount,
          summary: a.summary,
        })),
        total,
        hasMore: offset + limit < total,
      };
    }),

  /**
   * Get provider-level coding accuracy rates
   */
  getProviderCodingAccuracy: providerProcedure
    .input(
      z.object({
        period: z.enum(['monthly', 'quarterly', 'yearly']).default('monthly'),
      })
    )
    .query(async ({ ctx, input }) => {
      const { period } = input;

      // Get the current period dates
      const now = new Date();
      let periodStart: Date;
      let periodEnd: Date;

      if (period === 'monthly') {
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      } else if (period === 'quarterly') {
        const quarter = Math.floor(now.getMonth() / 3);
        periodStart = new Date(now.getFullYear(), quarter * 3, 1);
        periodEnd = new Date(now.getFullYear(), (quarter + 1) * 3, 0);
      } else {
        periodStart = new Date(now.getFullYear(), 0, 1);
        periodEnd = new Date(now.getFullYear(), 11, 31);
      }

      const metrics = await ctx.prisma.qAMetric.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          metricType: 'CODING_ACCURACY',
          period,
          periodStart: { gte: periodStart },
          periodEnd: { lte: periodEnd },
          providerId: { not: null },
        },
        orderBy: { score: 'desc' },
      });

      // Get all providers for context
      const providers = await ctx.prisma.provider.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          isActive: true,
        },
        include: {
          user: true,
        },
      });

      const providerMap = new Map(
        providers.map(p => [p.id, `${p.user.firstName} ${p.user.lastName}`])
      );

      // Calculate benchmarks
      const scores = metrics.map(m => Number(m.percentage));
      const avgScore = scores.length > 0
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : 0;

      return {
        providers: metrics.map((m, index) => ({
          providerId: m.providerId,
          providerName: m.providerId ? providerMap.get(m.providerId) || 'Unknown' : 'Unknown',
          score: Number(m.percentage),
          rank: index + 1,
          sampleSize: m.sampleSize,
          meetsTarget: m.meetsTarget,
          trend: m.trend,
        })),
        benchmark: Math.round(avgScore),
        target: 90, // Industry target of 90% coding accuracy
        periodStart,
        periodEnd,
      };
    }),

  /**
   * Get specific coding finding details with education content
   */
  getCodingFinding: providerProcedure
    .input(z.object({ findingId: z.string() }))
    .query(async ({ ctx, input }) => {
      const finding = await ctx.prisma.qAFinding.findFirst({
        where: {
          id: input.findingId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          audit: true,
        },
      });

      if (!finding) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Finding not found',
        });
      }

      // Generate education content based on finding type
      const educationContent = generateCodingEducationContent(finding);

      return {
        ...finding,
        educationContent,
      };
    }),
});

// ============================================
// Helper functions for documentation assessment
// ============================================

interface EncounterWithRelations {
  id: string;
  soapNote: {
    subjective: string | null;
    objective: string | null;
    assessment: string | null;
    plan: string | null;
  } | null;
  diagnoses: { id: string; icd10Code: string; description: string | null }[];
  procedures: { id: string; cptCode: string; description: string | null }[];
  treatmentPlan: {
    id: string;
    goals: unknown;
    status: string;
  } | null;
  encounterType: string;
  chiefComplaint: string | null;
}

function assessCompleteness(encounter: EncounterWithRelations): DocumentationAssessment {
  const maxScore = documentationCriteria.find(c => c.name === 'completeness')!.weight;
  let score = maxScore;
  const issues: string[] = [];
  const recommendations: string[] = [];

  if (!encounter.soapNote) {
    score = 0;
    issues.push('SOAP note is missing entirely');
    recommendations.push('Create a complete SOAP note for this encounter');
    return { criteriaName: 'completeness', score, maxScore, passed: false, issues, recommendations };
  }

  const soapNote = encounter.soapNote;
  const sectionWeight = maxScore / 4;

  // Check each SOAP section
  if (!soapNote.subjective || soapNote.subjective.trim().length < 20) {
    score -= sectionWeight;
    issues.push('Subjective section is missing or inadequate (less than 20 characters)');
    recommendations.push('Document patient-reported symptoms, history, and chief complaint in Subjective section');
  }

  if (!soapNote.objective || soapNote.objective.trim().length < 30) {
    score -= sectionWeight;
    issues.push('Objective section is missing or inadequate (less than 30 characters)');
    recommendations.push('Document physical exam findings, vital signs, and objective measurements');
  }

  if (!soapNote.assessment || soapNote.assessment.trim().length < 20) {
    score -= sectionWeight;
    issues.push('Assessment section is missing or inadequate');
    recommendations.push('Document clinical impression, diagnosis, and reasoning');
  }

  if (!soapNote.plan || soapNote.plan.trim().length < 20) {
    score -= sectionWeight;
    issues.push('Plan section is missing or inadequate');
    recommendations.push('Document treatment plan, recommendations, and follow-up instructions');
  }

  return {
    criteriaName: 'completeness',
    score: Math.max(0, score),
    maxScore,
    passed: score >= maxScore * 0.8,
    issues,
    recommendations,
  };
}

function assessMedicalNecessity(encounter: EncounterWithRelations): DocumentationAssessment {
  const maxScore = documentationCriteria.find(c => c.name === 'medicalNecessity')!.weight;
  let score = maxScore;
  const issues: string[] = [];
  const recommendations: string[] = [];

  // Check for chief complaint
  if (!encounter.chiefComplaint || encounter.chiefComplaint.trim().length < 5) {
    score -= maxScore * 0.2;
    issues.push('Chief complaint not documented');
    recommendations.push('Document the primary reason for the visit');
  }

  // Check for diagnosis codes
  if (encounter.diagnoses.length === 0) {
    score -= maxScore * 0.3;
    issues.push('No diagnosis codes documented');
    recommendations.push('Add ICD-10 diagnosis codes to support medical necessity');
  }

  // Check if SOAP note contains medical necessity keywords
  if (encounter.soapNote) {
    const necessityKeywords = ['pain', 'dysfunction', 'limitation', 'impairment', 'difficulty', 'unable', 'decreased', 'restricted'];
    const noteText = `${encounter.soapNote.subjective || ''} ${encounter.soapNote.objective || ''} ${encounter.soapNote.assessment || ''}`.toLowerCase();

    const hasNecessityDocumentation = necessityKeywords.some(keyword => noteText.includes(keyword));

    if (!hasNecessityDocumentation) {
      score -= maxScore * 0.3;
      issues.push('Documentation lacks clear medical necessity language');
      recommendations.push('Include functional limitations, pain levels, or impairments to establish medical necessity');
    }

    // Check for functional outcomes/goals
    const functionalKeywords = ['function', 'activity', 'daily', 'work', 'sleep', 'mobility', 'range of motion'];
    const hasFunctionalDocumentation = functionalKeywords.some(keyword => noteText.includes(keyword));

    if (!hasFunctionalDocumentation) {
      score -= maxScore * 0.2;
      issues.push('No functional impact documented');
      recommendations.push('Document impact on activities of daily living and functional goals');
    }
  } else {
    score = 0;
    issues.push('Cannot assess medical necessity without SOAP note');
    recommendations.push('Create complete documentation to establish medical necessity');
  }

  return {
    criteriaName: 'medicalNecessity',
    score: Math.max(0, score),
    maxScore,
    passed: score >= maxScore * 0.8,
    issues,
    recommendations,
  };
}

function assessDiagnosisLinkage(encounter: EncounterWithRelations): DocumentationAssessment {
  const maxScore = documentationCriteria.find(c => c.name === 'diagnosisLinkage')!.weight;
  let score = maxScore;
  const issues: string[] = [];
  const recommendations: string[] = [];

  // Need both diagnoses and procedures for linkage
  if (encounter.diagnoses.length === 0) {
    score -= maxScore * 0.5;
    issues.push('No diagnoses documented for procedure linkage');
    recommendations.push('Add diagnosis codes to support procedures performed');
  }

  if (encounter.procedures.length === 0) {
    score -= maxScore * 0.5;
    issues.push('No procedures documented');
    recommendations.push('Document procedures performed during the encounter');
  }

  // Check if procedure count is reasonable for diagnosis count
  if (encounter.diagnoses.length > 0 && encounter.procedures.length > 0) {
    const ratio = encounter.procedures.length / encounter.diagnoses.length;

    // More than 5 procedures per diagnosis is suspicious
    if (ratio > 5) {
      score -= maxScore * 0.3;
      issues.push(`High procedure-to-diagnosis ratio (${ratio.toFixed(1)}:1) may indicate insufficient diagnostic support`);
      recommendations.push('Ensure all procedures are supported by appropriate diagnoses');
    }
  }

  // Check if assessment mentions diagnoses
  if (encounter.soapNote?.assessment && encounter.diagnoses.length > 0) {
    const assessmentLower = encounter.soapNote.assessment.toLowerCase();
    const hasReferencedDiagnosis = encounter.diagnoses.some(d =>
      assessmentLower.includes(d.icd10Code.toLowerCase()) ||
      (d.description && assessmentLower.includes(d.description.toLowerCase().substring(0, 20)))
    );

    if (!hasReferencedDiagnosis) {
      score -= maxScore * 0.2;
      issues.push('Assessment section does not clearly reference documented diagnoses');
      recommendations.push('Include diagnosis codes or descriptions in assessment narrative');
    }
  }

  return {
    criteriaName: 'diagnosisLinkage',
    score: Math.max(0, score),
    maxScore,
    passed: score >= maxScore * 0.8,
    issues,
    recommendations,
  };
}

function assessProgressNoteAdequacy(encounter: EncounterWithRelations): DocumentationAssessment {
  const maxScore = documentationCriteria.find(c => c.name === 'progressNoteAdequacy')!.weight;
  let score = maxScore;
  const issues: string[] = [];
  const recommendations: string[] = [];

  // Progress notes are especially important for follow-up visits
  const isFollowUp = encounter.encounterType === 'FOLLOW_UP' || encounter.encounterType === 'RE_EXAM';

  if (!encounter.soapNote) {
    return {
      criteriaName: 'progressNoteAdequacy',
      score: 0,
      maxScore,
      passed: false,
      issues: ['No SOAP note for progress documentation'],
      recommendations: ['Create a progress note documenting patient status'],
    };
  }

  // Check for progress indicators in subjective
  const progressKeywords = ['better', 'worse', 'same', 'improved', 'unchanged', 'progress', 'responded', 'relief', 'decrease', 'increase'];
  const subjectiveLower = (encounter.soapNote.subjective || '').toLowerCase();
  const hasProgressInSubjective = progressKeywords.some(k => subjectiveLower.includes(k));

  if (!hasProgressInSubjective && isFollowUp) {
    score -= maxScore * 0.3;
    issues.push('Subjective section lacks patient-reported progress indicators');
    recommendations.push('Document patient-reported changes since last visit (better, worse, same)');
  }

  // Check for objective comparison indicators
  const objectiveLower = (encounter.soapNote.objective || '').toLowerCase();
  const comparisonKeywords = ['compared to', 'from last', 'previously', 'prior', 'improvement', 'worsening', 'change'];
  const hasObjectiveComparison = comparisonKeywords.some(k => objectiveLower.includes(k));

  if (!hasObjectiveComparison && isFollowUp) {
    score -= maxScore * 0.3;
    issues.push('Objective findings not compared to previous visit');
    recommendations.push('Compare current findings to previous visit findings');
  }

  // Check plan section for follow-up
  const planLower = (encounter.soapNote.plan || '').toLowerCase();
  const followUpKeywords = ['return', 'follow', 'next', 'continue', 'reassess', 'schedule', 'week', 'visit'];
  const hasFollowUpPlan = followUpKeywords.some(k => planLower.includes(k));

  if (!hasFollowUpPlan) {
    score -= maxScore * 0.2;
    issues.push('Plan does not include follow-up instructions');
    recommendations.push('Document follow-up timeframe and instructions');
  }

  return {
    criteriaName: 'progressNoteAdequacy',
    score: Math.max(0, score),
    maxScore,
    passed: score >= maxScore * 0.8,
    issues,
    recommendations,
  };
}

function assessTreatmentPlanDocumentation(encounter: EncounterWithRelations): DocumentationAssessment {
  const maxScore = documentationCriteria.find(c => c.name === 'treatmentPlanDocumentation')!.weight;
  let score = maxScore;
  const issues: string[] = [];
  const recommendations: string[] = [];

  // Check for treatment plan linkage
  if (!encounter.treatmentPlan && encounter.encounterType !== 'INITIAL') {
    score -= maxScore * 0.3;
    issues.push('Encounter not linked to a treatment plan');
    recommendations.push('Link encounter to an active treatment plan');
  }

  // Check plan section in SOAP note
  if (!encounter.soapNote?.plan || encounter.soapNote.plan.trim().length < 30) {
    score -= maxScore * 0.3;
    issues.push('Plan section inadequately documents treatment approach');
    recommendations.push('Expand plan section to include specific treatment recommendations');
  }

  // Check for treatment specifics in plan
  const planLower = (encounter.soapNote?.plan || '').toLowerCase();
  const treatmentKeywords = ['adjustment', 'manipulation', 'therapy', 'exercise', 'stretch', 'modality', 'treatment', 'recommend'];
  const hasTreatmentSpecifics = treatmentKeywords.some(k => planLower.includes(k));

  if (!hasTreatmentSpecifics) {
    score -= maxScore * 0.2;
    issues.push('Plan lacks specific treatment interventions');
    recommendations.push('Document specific treatments performed or recommended');
  }

  // Check for frequency/duration if treatment plan exists
  const frequencyKeywords = ['times per week', 'daily', 'weekly', 'visits', 'sessions', 'weeks', 'month'];
  const hasFrequency = frequencyKeywords.some(k => planLower.includes(k));

  if (!hasFrequency && encounter.treatmentPlan) {
    score -= maxScore * 0.2;
    issues.push('Treatment frequency/duration not documented in plan');
    recommendations.push('Include treatment frequency and expected duration');
  }

  return {
    criteriaName: 'treatmentPlanDocumentation',
    score: Math.max(0, score),
    maxScore,
    passed: score >= maxScore * 0.8,
    issues,
    recommendations,
  };
}

function getScoreCategory(score: number): string {
  if (score >= 90) return 'excellent';
  if (score >= 80) return 'good';
  if (score >= 70) return 'acceptable';
  if (score >= 60) return 'needs_improvement';
  return 'poor';
}

function calculateTrend(scores: number[]): string {
  if (scores.length < 2) return 'insufficient_data';

  // Compare first half average to second half average
  const midpoint = Math.floor(scores.length / 2);
  const recentAvg = scores.slice(0, midpoint).reduce((a, b) => a + b, 0) / midpoint;
  const olderAvg = scores.slice(midpoint).reduce((a, b) => a + b, 0) / (scores.length - midpoint);

  const change = recentAvg - olderAvg;

  if (change > 5) return 'improving';
  if (change < -5) return 'declining';
  return 'stable';
}

async function generateAIRecommendations(
  encounterScores: { encounterId: string; score: number; assessments: DocumentationAssessment[] }[],
  totalFindings: number,
  criticalCount: number,
  highCount: number
): Promise<string[]> {
  const recommendations: string[] = [];

  // Analyze common patterns
  const lowScoreAreas = new Map<string, number>();

  for (const es of encounterScores) {
    for (const assessment of es.assessments) {
      if (!assessment.passed) {
        const count = lowScoreAreas.get(assessment.criteriaName) || 0;
        lowScoreAreas.set(assessment.criteriaName, count + 1);
      }
    }
  }

  // Generate recommendations based on patterns
  const sortedAreas = Array.from(lowScoreAreas.entries()).sort((a, b) => b[1] - a[1]);

  if (sortedAreas.length > 0) {
    const [topArea, count] = sortedAreas[0];
    const percentage = Math.round((count / encounterScores.length) * 100);
    recommendations.push(`Focus on improving ${topArea} - ${percentage}% of encounters have deficiencies in this area`);
  }

  if (criticalCount > 0) {
    recommendations.push(`Address ${criticalCount} critical finding(s) immediately to reduce compliance risk`);
  }

  if (highCount > 0) {
    recommendations.push(`Review ${highCount} high-priority finding(s) within the next week`);
  }

  // Add general recommendations based on score distribution
  const avgScore = encounterScores.reduce((sum, es) => sum + es.score, 0) / encounterScores.length;

  if (avgScore < 70) {
    recommendations.push('Consider implementing documentation templates to ensure consistency');
    recommendations.push('Schedule a team training session on documentation best practices');
  } else if (avgScore < 85) {
    recommendations.push('Review documentation guidelines with providers scoring below average');
  }

  return recommendations;
}

async function updateQualityMetrics(
  ctx: { prisma: import('@prisma/client').PrismaClient; user: { organizationId: string } },
  score: number,
  sampleSize: number,
  providerId?: string
): Promise<void> {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Upsert the metric for this period
  const existingMetric = await ctx.prisma.qAMetric.findFirst({
    where: {
      organizationId: ctx.user.organizationId,
      metricType: 'DOCUMENTATION_COMPLETENESS',
      period: 'monthly',
      periodStart,
      providerId: providerId || null,
    },
  });

  if (existingMetric) {
    // Update with rolling average
    const newSampleSize = (existingMetric.sampleSize || 0) + sampleSize;
    const existingTotal = Number(existingMetric.score) * (existingMetric.sampleSize || 1);
    const newTotal = existingTotal + (score * sampleSize);
    const newScore = newTotal / newSampleSize;

    await ctx.prisma.qAMetric.update({
      where: { id: existingMetric.id },
      data: {
        score: newScore,
        percentage: newScore,
        sampleSize: newSampleSize,
      },
    });
  } else {
    // Create new metric
    await ctx.prisma.qAMetric.create({
      data: {
        organizationId: ctx.user.organizationId,
        metricType: 'DOCUMENTATION_COMPLETENESS',
        period: 'monthly',
        periodStart,
        periodEnd,
        score,
        maxScore: 100,
        percentage: score,
        sampleSize,
        providerId,
        target: 85, // Default target of 85%
        benchmark: 80, // Industry benchmark
      },
    });
  }
}

// ============================================
// US-349: Coding accuracy audit helper functions
// ============================================

// Coding quality criteria
const codingCriteria: QualityCriteria[] = [
  { name: 'codeDocumentationMatch', weight: 25, description: 'Codes match documentation' },
  { name: 'modifierAppropriateness', weight: 20, description: 'Modifiers used correctly' },
  { name: 'upDownCoding', weight: 25, description: 'No upcoding or downcoding' },
  { name: 'bundlingCompliance', weight: 15, description: 'Proper bundling and unbundling' },
  { name: 'lcdNcdCompliance', weight: 15, description: 'LCD/NCD coverage criteria met' },
];

// Coding assessment result interface
interface CodingAssessment {
  criteriaName: string;
  score: number;
  maxScore: number;
  passed: boolean;
  issues: string[];
  recommendations: string[];
  relatedCodes?: string[];
}

// Claim with relations interface for coding audit
interface ClaimWithRelations {
  id: string;
  claimNumber: string | null;
  status: string;
  totalCharges: unknown;
  claimLines: {
    id: string;
    cptCode: string;
    modifiers: string[];
    description: string;
    units: number;
    chargedAmount: unknown;
    diagnosisPointers: number[];
    charge: {
      diagnosisPointers: number[];
      icd10Codes: string[];
    } | null;
  }[];
  encounter: {
    id: string;
    providerId: string;
    chiefComplaint: string | null;
    soapNote: {
      subjective: string | null;
      objective: string | null;
      assessment: string | null;
      plan: string | null;
    } | null;
    diagnoses: {
      id: string;
      icd10Code: string;
      description: string;
      sequence: number;
    }[];
    procedures: {
      id: string;
      cptCode: string;
      description: string;
      units: number;
      modifier1: string | null;
      modifier2: string | null;
      notes: string | null;
    }[];
    provider: {
      id: string;
      user: {
        firstName: string;
        lastName: string;
      };
    } | null;
  } | null;
  patientId: string;
}

// Common chiropractic CPT codes for reference
const chiropracticCptCodes = {
  spinalManipulation: ['98940', '98941', '98942', '98943'],
  evaluation: ['99201', '99202', '99203', '99204', '99205', '99211', '99212', '99213', '99214', '99215'],
  reExam: ['99201', '99202', '99203', '99204', '99205'],
  physicalTherapy: ['97110', '97112', '97140', '97530', '97542'],
  modalities: ['97010', '97012', '97014', '97016', '97018', '97022', '97024', '97026', '97028', '97032', '97033', '97034', '97035', '97036', '97039'],
  xray: ['72020', '72040', '72050', '72052', '72070', '72072', '72074', '72080', '72100', '72110', '72114', '72120'],
};

// Codes that commonly require specific modifiers
const modifierRequirements: { [key: string]: { modifier: string; reason: string }[] } = {
  '97140': [
    { modifier: '59', reason: 'Distinct from manipulation on same day' },
    { modifier: 'GP', reason: 'Physical therapy service' },
  ],
  '97530': [
    { modifier: '59', reason: 'Distinct procedural service' },
  ],
};

// Codes that are commonly bundled
const bundledCodePairs: { codes: string[]; description: string }[] = [
  { codes: ['98941', '98940'], description: 'Cannot bill both 1-2 region and 3-4 region manipulation together' },
  { codes: ['97140', '98941'], description: 'Manual therapy may bundle with manipulation without modifier 59' },
  { codes: ['97110', '97530'], description: 'Therapeutic exercises and activities may require distinct documentation' },
];

// Assessment functions for coding audit
function assessCodeDocumentationMatch(claim: ClaimWithRelations): CodingAssessment {
  const maxScore = codingCriteria.find(c => c.name === 'codeDocumentationMatch')!.weight;
  let score = maxScore;
  const issues: string[] = [];
  const recommendations: string[] = [];
  const relatedCodes: string[] = [];

  if (!claim.encounter) {
    return {
      criteriaName: 'codeDocumentationMatch',
      score: 0,
      maxScore,
      passed: false,
      issues: ['No encounter linked to claim'],
      recommendations: ['Link claim to encounter with proper documentation'],
    };
  }

  const encounter = claim.encounter;

  // Check if SOAP note exists
  if (!encounter.soapNote) {
    score = 0;
    issues.push('No SOAP note documentation to support codes');
    recommendations.push('Create SOAP note documentation before billing');
    return { criteriaName: 'codeDocumentationMatch', score, maxScore, passed: false, issues, recommendations };
  }

  // TypeScript doesn't narrow after early return, so capture the soapNote
  const soapNote = encounter.soapNote;

  // Check each billed code against documentation
  for (const line of claim.claimLines) {
    relatedCodes.push(line.cptCode);

    // Check if CPT code appears in encounter procedures
    const hasMatchingProcedure = encounter.procedures.some(p => p.cptCode === line.cptCode);

    if (!hasMatchingProcedure) {
      score -= maxScore * 0.1;
      issues.push(`CPT ${line.cptCode} billed but not documented in encounter procedures`);
      recommendations.push(`Document procedure ${line.cptCode} in encounter before billing`);
    }

    // Check diagnosis support for the code
    if (line.diagnosisPointers.length === 0 && line.charge?.icd10Codes?.length === 0) {
      score -= maxScore * 0.1;
      issues.push(`CPT ${line.cptCode} has no diagnosis pointers`);
      recommendations.push('Link diagnosis codes to support medical necessity');
    }

    // Check for E/M codes - need specific documentation
    if (chiropracticCptCodes.evaluation.includes(line.cptCode)) {
      const noteLength = (soapNote.subjective || '').length +
        (soapNote.objective || '').length +
        (soapNote.assessment || '').length +
        (soapNote.plan || '').length;

      // Higher E/M codes need more documentation
      if (line.cptCode.endsWith('4') || line.cptCode.endsWith('5')) {
        if (noteLength < 500) {
          score -= maxScore * 0.15;
          issues.push(`E/M code ${line.cptCode} requires more extensive documentation`);
          recommendations.push('Document medical decision making complexity to support high-level E/M');
        }
      }
    }

    // Check manipulation codes - need spinal region documentation
    if (chiropracticCptCodes.spinalManipulation.includes(line.cptCode)) {
      const objectiveLower = (soapNote.objective || '').toLowerCase();
      const spinalRegions = ['cervical', 'thoracic', 'lumbar', 'sacral', 'c-spine', 't-spine', 'l-spine'];
      const hasSpinalDocumentation = spinalRegions.some(r => objectiveLower.includes(r));

      if (!hasSpinalDocumentation) {
        score -= maxScore * 0.15;
        issues.push(`Manipulation code ${line.cptCode} lacks spinal region documentation`);
        recommendations.push('Document specific spinal regions treated (cervical, thoracic, lumbar, etc.)');
      }

      // Check region count matches code
      const regionCount = spinalRegions.filter(r => objectiveLower.includes(r)).length;
      if (line.cptCode === '98940' && regionCount > 2) {
        issues.push('Documentation suggests more than 1-2 spinal regions but 98940 billed');
        recommendations.push('Consider 98941 or 98942 if treating 3+ regions');
      }
      if (line.cptCode === '98941' && regionCount <= 2) {
        score -= maxScore * 0.1;
        issues.push('Documentation shows only 1-2 regions but 98941 (3-4 regions) billed');
        recommendations.push('Ensure documentation supports the number of regions billed');
      }
    }

    // Check physical therapy codes - need time documentation
    if (chiropracticCptCodes.physicalTherapy.includes(line.cptCode)) {
      const planLower = (soapNote.plan || '').toLowerCase();
      const hasTimeDoc = /\d+\s*(min|minutes?)/.test(planLower) ||
        /time\s*:?\s*\d+/.test(planLower);

      if (!hasTimeDoc && line.units > 1) {
        score -= maxScore * 0.1;
        issues.push(`Time-based code ${line.cptCode} with ${line.units} units lacks time documentation`);
        recommendations.push('Document time spent for time-based codes (8-min rule applies)');
      }
    }
  }

  return {
    criteriaName: 'codeDocumentationMatch',
    score: Math.max(0, score),
    maxScore,
    passed: score >= maxScore * 0.8,
    issues,
    recommendations,
    relatedCodes,
  };
}

function assessModifierAppropriateness(claim: ClaimWithRelations): CodingAssessment {
  const maxScore = codingCriteria.find(c => c.name === 'modifierAppropriateness')!.weight;
  let score = maxScore;
  const issues: string[] = [];
  const recommendations: string[] = [];
  const relatedCodes: string[] = [];

  // Check each line for modifier issues
  for (const line of claim.claimLines) {
    relatedCodes.push(line.cptCode);

    // Check if modifier 59 or XE/XP/XS/XU is needed
    const requiresDistinctModifier = modifierRequirements[line.cptCode];
    if (requiresDistinctModifier) {
      const hasDistinctModifier = line.modifiers.some(m =>
        ['59', 'XE', 'XP', 'XS', 'XU'].includes(m)
      );

      // Check if there's a manipulation on the same claim
      const hasManipulation = claim.claimLines.some(l =>
        chiropracticCptCodes.spinalManipulation.includes(l.cptCode)
      );

      if (hasManipulation && !hasDistinctModifier && chiropracticCptCodes.physicalTherapy.includes(line.cptCode)) {
        issues.push(`${line.cptCode} may need modifier 59 when billed with manipulation`);
        recommendations.push('Consider adding modifier 59 to indicate distinct service');
      }
    }

    // Check for modifier 25 on E/M codes
    if (chiropracticCptCodes.evaluation.includes(line.cptCode)) {
      const hasOtherProcedures = claim.claimLines.some(l =>
        l.id !== line.id && !chiropracticCptCodes.evaluation.includes(l.cptCode)
      );

      if (hasOtherProcedures && !line.modifiers.includes('25')) {
        score -= maxScore * 0.15;
        issues.push(`E/M code ${line.cptCode} billed with procedures but missing modifier 25`);
        recommendations.push('Add modifier 25 to indicate significant, separately identifiable E/M');
      }
    }

    // Check for inappropriate modifier stacking
    if (line.modifiers.length > 3) {
      score -= maxScore * 0.1;
      issues.push(`${line.cptCode} has ${line.modifiers.length} modifiers - may be excessive`);
      recommendations.push('Review modifier usage - typically 2-3 modifiers maximum');
    }

    // Check for conflicting modifiers
    const leftRightModifiers = line.modifiers.filter(m => ['LT', 'RT', '50'].includes(m));
    if (leftRightModifiers.length > 1) {
      score -= maxScore * 0.2;
      issues.push(`${line.cptCode} has conflicting laterality modifiers: ${leftRightModifiers.join(', ')}`);
      recommendations.push('Use only one laterality modifier per line');
    }

    // AT modifier for chiropractic - should be on manipulation codes for Medicare
    if (chiropracticCptCodes.spinalManipulation.includes(line.cptCode)) {
      if (!line.modifiers.includes('AT')) {
        issues.push(`Manipulation code ${line.cptCode} may need modifier AT for Medicare active treatment`);
        recommendations.push('Consider modifier AT if patient is in active treatment phase');
      }
    }
  }

  return {
    criteriaName: 'modifierAppropriateness',
    score: Math.max(0, score),
    maxScore,
    passed: score >= maxScore * 0.8,
    issues,
    recommendations,
    relatedCodes,
  };
}

function assessUpDownCoding(claim: ClaimWithRelations): CodingAssessment {
  const maxScore = codingCriteria.find(c => c.name === 'upDownCoding')!.weight;
  let score = maxScore;
  const issues: string[] = [];
  const recommendations: string[] = [];
  const relatedCodes: string[] = [];

  if (!claim.encounter || !claim.encounter.soapNote) {
    return {
      criteriaName: 'upDownCoding',
      score: maxScore * 0.5, // Partial score - can't fully assess
      maxScore,
      passed: false,
      issues: ['Cannot fully assess coding level without documentation'],
      recommendations: ['Ensure documentation supports code selection'],
    };
  }

  const encounter = claim.encounter;
  // soapNote is guaranteed non-null by the guard above
  const soapNote = encounter.soapNote!;

  for (const line of claim.claimLines) {
    relatedCodes.push(line.cptCode);

    // Check E/M code level against documentation
    if (chiropracticCptCodes.evaluation.includes(line.cptCode)) {
      const noteLength = (soapNote.subjective || '').length +
        (soapNote.objective || '').length +
        (soapNote.assessment || '').length +
        (soapNote.plan || '').length;

      const diagnosisCount = encounter.diagnoses.length;
      const codeLevel = parseInt(line.cptCode.slice(-1));

      // Simple heuristic for E/M level appropriateness
      if (codeLevel >= 4) {
        // Level 4-5 should have substantial documentation and multiple diagnoses
        if (noteLength < 400 && diagnosisCount < 2) {
          score -= maxScore * 0.2;
          issues.push(`High-level E/M ${line.cptCode} may be upcoded - documentation appears limited`);
          recommendations.push('Ensure documentation supports medical decision making complexity');
        }
      }

      if (codeLevel <= 2 && noteLength > 800 && diagnosisCount >= 3) {
        score -= maxScore * 0.1;
        issues.push(`Low-level E/M ${line.cptCode} may be downcoded - documentation supports higher level`);
        recommendations.push('Consider higher E/M level if documentation supports it');
      }
    }

    // Check manipulation code regions
    if (chiropracticCptCodes.spinalManipulation.includes(line.cptCode)) {
      const objectiveLower = (soapNote.objective || '').toLowerCase();
      const spinalRegions = ['cervical', 'thoracic', 'lumbar', 'sacral', 'c-spine', 't-spine', 'l-spine'];
      const documentedRegions = spinalRegions.filter(r => objectiveLower.includes(r)).length;

      if (line.cptCode === '98942' && documentedRegions < 5) {
        score -= maxScore * 0.15;
        issues.push('98942 (5+ regions) billed but documentation may not support');
        recommendations.push('Document all spinal regions treated or use appropriate lower code');
      }

      if (line.cptCode === '98940' && documentedRegions >= 3) {
        issues.push('98940 (1-2 regions) billed but documentation suggests 3+ regions');
        recommendations.push('Consider 98941 if treating 3-4 regions to capture full work');
      }
    }

    // Check time-based code units
    if (chiropracticCptCodes.physicalTherapy.includes(line.cptCode)) {
      // Each unit typically = 15 minutes; flag if many units without extensive documentation
      if (line.units >= 4) {
        const planLength = (soapNote.plan || '').length;
        if (planLength < 200) {
          score -= maxScore * 0.1;
          issues.push(`${line.cptCode} with ${line.units} units (${line.units * 15} min) - verify time documentation`);
          recommendations.push('Document time spent for each therapeutic activity');
        }
      }
    }
  }

  return {
    criteriaName: 'upDownCoding',
    score: Math.max(0, score),
    maxScore,
    passed: score >= maxScore * 0.8,
    issues,
    recommendations,
    relatedCodes,
  };
}

function assessBundlingCompliance(claim: ClaimWithRelations): CodingAssessment {
  const maxScore = codingCriteria.find(c => c.name === 'bundlingCompliance')!.weight;
  let score = maxScore;
  const issues: string[] = [];
  const recommendations: string[] = [];
  const relatedCodes: string[] = [];

  const billedCodes = claim.claimLines.map(l => l.cptCode);

  // Check for known bundled code pairs
  for (const bundle of bundledCodePairs) {
    const bundleCodesPresent = bundle.codes.filter(c => billedCodes.includes(c));
    if (bundleCodesPresent.length >= 2) {
      // Check if modifier 59 is present to allow unbundling
      const hasUnbundlingModifier = claim.claimLines.some(l =>
        bundle.codes.includes(l.cptCode) && l.modifiers.some(m => ['59', 'XE', 'XP', 'XS', 'XU'].includes(m))
      );

      if (!hasUnbundlingModifier) {
        score -= maxScore * 0.2;
        issues.push(`Potential bundling issue: ${bundleCodesPresent.join(' + ')} - ${bundle.description}`);
        recommendations.push('Add modifier 59/X{EPSU} if services are truly distinct, or remove duplicate billing');
        relatedCodes.push(...bundleCodesPresent);
      }
    }
  }

  // Check for multiple manipulation codes
  const manipulationCodes = billedCodes.filter(c => chiropracticCptCodes.spinalManipulation.includes(c));
  if (manipulationCodes.length > 1) {
    score -= maxScore * 0.3;
    issues.push(`Multiple manipulation codes billed: ${manipulationCodes.join(', ')} - typically only one per visit`);
    recommendations.push('Bill the single most appropriate manipulation code based on regions treated');
    relatedCodes.push(...manipulationCodes);
  }

  // Check for duplicate codes (same CPT billed multiple times)
  const codeCounts = new Map<string, number>();
  for (const code of billedCodes) {
    codeCounts.set(code, (codeCounts.get(code) || 0) + 1);
  }

  for (const [code, count] of codeCounts) {
    if (count > 1 && !chiropracticCptCodes.modalities.includes(code)) {
      score -= maxScore * 0.15;
      issues.push(`Code ${code} appears ${count} times on claim`);
      recommendations.push('Consolidate to single line with appropriate units unless truly distinct services');
      relatedCodes.push(code);
    }
  }

  // Check for E/M + manipulation without proper documentation
  const hasEM = billedCodes.some(c => chiropracticCptCodes.evaluation.includes(c));
  const hasManipulation = billedCodes.some(c => chiropracticCptCodes.spinalManipulation.includes(c));

  if (hasEM && hasManipulation) {
    const emLine = claim.claimLines.find(l => chiropracticCptCodes.evaluation.includes(l.cptCode));
    if (emLine && !emLine.modifiers.includes('25')) {
      issues.push('E/M billed with manipulation but may lack modifier 25');
      recommendations.push('Ensure E/M represents significant, separately identifiable service');
    }
  }

  return {
    criteriaName: 'bundlingCompliance',
    score: Math.max(0, score),
    maxScore,
    passed: score >= maxScore * 0.8,
    issues,
    recommendations,
    relatedCodes,
  };
}

function assessLcdNcdCompliance(claim: ClaimWithRelations): CodingAssessment {
  const maxScore = codingCriteria.find(c => c.name === 'lcdNcdCompliance')!.weight;
  let score = maxScore;
  const issues: string[] = [];
  const recommendations: string[] = [];
  const relatedCodes: string[] = [];

  if (!claim.encounter) {
    return {
      criteriaName: 'lcdNcdCompliance',
      score: maxScore * 0.5,
      maxScore,
      passed: false,
      issues: ['Cannot assess LCD/NCD compliance without encounter data'],
      recommendations: ['Link encounter to claim for compliance assessment'],
    };
  }

  const diagnoses = claim.encounter.diagnoses;
  const diagnosisCodes = diagnoses.map(d => d.icd10Code);

  // Check chiropractic manipulation LCD requirements
  const hasManipulation = claim.claimLines.some(l =>
    chiropracticCptCodes.spinalManipulation.includes(l.cptCode)
  );

  if (hasManipulation) {
    // Medicare LCD typically requires M99.0x subluxation codes or specific neuromusculoskeletal diagnoses
    const hasSubluxation = diagnosisCodes.some(c => c.startsWith('M99.0'));
    const hasSpinalDiagnosis = diagnosisCodes.some(c =>
      c.startsWith('M54') || // Dorsalgia
      c.startsWith('M47') || // Spondylosis
      c.startsWith('M50') || // Cervical disc disorders
      c.startsWith('M51') || // Thoracic/lumbar disc disorders
      c.startsWith('M53') || // Other dorsopathies
      c.startsWith('M99')    // Biomechanical lesions
    );

    if (!hasSubluxation && !hasSpinalDiagnosis) {
      score -= maxScore * 0.3;
      issues.push('Manipulation codes may lack LCD-compliant diagnosis codes');
      recommendations.push('Document subluxation (M99.0x) or specific spinal diagnosis for manipulation coverage');
      relatedCodes.push(...chiropracticCptCodes.spinalManipulation.filter(c =>
        claim.claimLines.some(l => l.cptCode === c)
      ));
    }

    // Check for acute vs maintenance care
    if (claim.encounter.soapNote) {
      const planLower = (claim.encounter.soapNote.plan || '').toLowerCase();
      const hasMaintenanceLanguage = planLower.includes('maintenance') ||
        planLower.includes('wellness') ||
        planLower.includes('preventive');

      if (hasMaintenanceLanguage) {
        issues.push('Documentation mentions maintenance/wellness care - may not be covered');
        recommendations.push('Ensure treatment is for acute/active condition; maintenance care typically not covered by Medicare');
      }
    }
  }

  // Check physical therapy medical necessity
  const hasPT = claim.claimLines.some(l =>
    chiropracticCptCodes.physicalTherapy.includes(l.cptCode)
  );

  if (hasPT) {
    // PT typically requires functional limitation documentation
    const hasFunctionalDiagnosis = diagnosisCodes.some(c =>
      c.startsWith('M') || c.startsWith('S') || c.startsWith('G') || c.startsWith('R26')
    );

    if (!hasFunctionalDiagnosis) {
      score -= maxScore * 0.2;
      issues.push('Physical therapy codes may need functional limitation diagnosis');
      recommendations.push('Include diagnosis codes indicating functional impairment');
    }

    // Check for PT time documentation
    const soapNote = claim.encounter.soapNote;
    if (soapNote) {
      const hasTimeDoc = /\d+\s*(min|minutes?)/.test(soapNote.plan || '') ||
        /time\s*:?\s*\d+/.test(soapNote.objective || '');

      if (!hasTimeDoc) {
        score -= maxScore * 0.15;
        issues.push('Time-based PT codes lack documented treatment time');
        recommendations.push('Document minutes spent on each therapeutic service');
      }
    }
  }

  // Check X-ray LCD requirements
  const hasXray = claim.claimLines.some(l =>
    chiropracticCptCodes.xray.includes(l.cptCode)
  );

  if (hasXray) {
    // X-rays typically need clinical indication
    const hasPainDiagnosis = diagnosisCodes.some(c =>
      c.startsWith('M54') || c.startsWith('R10') || c.startsWith('G89')
    );
    const hasTraumaDiagnosis = diagnosisCodes.some(c =>
      c.startsWith('S') || c.startsWith('T')
    );

    if (!hasPainDiagnosis && !hasTraumaDiagnosis) {
      score -= maxScore * 0.2;
      issues.push('X-ray codes may lack clinical indication diagnosis');
      recommendations.push('Document pain, trauma, or other clinical indication for imaging');
    }
  }

  return {
    criteriaName: 'lcdNcdCompliance',
    score: Math.max(0, score),
    maxScore,
    passed: score >= maxScore * 0.8,
    issues,
    recommendations,
    relatedCodes,
  };
}

// Generate findings from coding assessment
function generateCodingFindingsFromAssessment(
  assessment: CodingAssessment,
  entityType: string,
  entityId: string,
  providerId?: string,
  patientId?: string
): {
  findingType: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  title: string;
  description: string;
  recommendation: string;
  entityType: string;
  entityId: string;
  providerId?: string;
  patientId?: string;
  riskScore: number;
  complianceImpact: boolean;
  relatedCodes?: unknown;
}[] {
  const findings: ReturnType<typeof generateCodingFindingsFromAssessment> = [];

  const percentage = (assessment.score / assessment.maxScore) * 100;

  // Determine severity based on score
  let severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  if (percentage < 50) severity = 'CRITICAL';
  else if (percentage < 70) severity = 'HIGH';
  else if (percentage < 85) severity = 'MEDIUM';
  else if (percentage < 95) severity = 'LOW';
  else severity = 'INFO';

  for (let i = 0; i < assessment.issues.length; i++) {
    findings.push({
      findingType: `CODING_${assessment.criteriaName.toUpperCase()}`,
      severity,
      title: `${assessment.criteriaName} coding issue`,
      description: assessment.issues[i],
      recommendation: assessment.recommendations[i] || 'Review coding practices',
      entityType,
      entityId,
      providerId,
      patientId,
      riskScore: Math.round(100 - percentage),
      complianceImpact: ['codeDocumentationMatch', 'lcdNcdCompliance', 'bundlingCompliance'].includes(assessment.criteriaName),
      relatedCodes: assessment.relatedCodes,
    });
  }

  return findings;
}

// Generate targeted education recommendations based on coding audit
async function generateCodingRecommendations(
  claimScores: { claimId: string; score: number; assessments: CodingAssessment[] }[],
  providerStats: Map<string, { providerId: string; providerName: string; claimsAudited: number; totalScore: number; findings: number }>,
  totalFindings: number,
  criticalCount: number,
  highCount: number
): Promise<string[]> {
  const recommendations: string[] = [];

  // Analyze common patterns
  const lowScoreAreas = new Map<string, number>();

  for (const cs of claimScores) {
    for (const assessment of cs.assessments) {
      if (!assessment.passed) {
        const count = lowScoreAreas.get(assessment.criteriaName) || 0;
        lowScoreAreas.set(assessment.criteriaName, count + 1);
      }
    }
  }

  // Generate recommendations based on patterns
  const sortedAreas = Array.from(lowScoreAreas.entries()).sort((a, b) => b[1] - a[1]);

  if (sortedAreas.length > 0) {
    const [topArea, count] = sortedAreas[0];
    const percentage = Math.round((count / claimScores.length) * 100);

    const areaEducation: { [key: string]: string } = {
      codeDocumentationMatch: 'Training on matching CPT codes to clinical documentation',
      modifierAppropriateness: 'Education on proper modifier usage (59, 25, AT, etc.)',
      upDownCoding: 'Review of E/M level selection and code specificity',
      bundlingCompliance: 'Training on bundling rules and NCCI edits',
      lcdNcdCompliance: 'Education on LCD/NCD coverage criteria and medical necessity',
    };

    recommendations.push(`Priority: ${areaEducation[topArea] || topArea} - ${percentage}% of claims have deficiencies`);
  }

  if (criticalCount > 0) {
    recommendations.push(`Urgent: Address ${criticalCount} critical coding error(s) immediately - potential audit risk`);
  }

  if (highCount > 0) {
    recommendations.push(`Important: Review ${highCount} high-priority finding(s) within 48 hours`);
  }

  // Provider-specific recommendations
  const providerArray = Array.from(providerStats.values());
  const lowScoreProviders = providerArray.filter(p => p.claimsAudited > 0 && (p.totalScore / p.claimsAudited) < 80);

  if (lowScoreProviders.length > 0) {
    const providerNames = lowScoreProviders.map(p => p.providerName).join(', ');
    recommendations.push(`Targeted training recommended for: ${providerNames}`);
  }

  // Calculate average score
  const avgScore = claimScores.reduce((sum, cs) => sum + cs.score, 0) / claimScores.length;

  if (avgScore < 70) {
    recommendations.push('Consider implementing a coding review workflow before claim submission');
    recommendations.push('Schedule comprehensive coding education session for all providers');
  } else if (avgScore < 85) {
    recommendations.push('Review coding guidelines with providers showing below-average accuracy');
  }

  // Always include LCD/NCD recommendation if it was a problem area
  if (lowScoreAreas.has('lcdNcdCompliance') && (lowScoreAreas.get('lcdNcdCompliance') || 0) > claimScores.length * 0.2) {
    recommendations.push('Review payer-specific LCD/NCD requirements, especially for chiropractic manipulation and PT services');
  }

  return recommendations;
}

// Update coding metrics
async function updateCodingMetrics(
  ctx: { prisma: import('@prisma/client').PrismaClient; user: { organizationId: string } },
  score: number,
  sampleSize: number,
  providerId?: string
): Promise<void> {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Upsert the metric for this period
  const existingMetric = await ctx.prisma.qAMetric.findFirst({
    where: {
      organizationId: ctx.user.organizationId,
      metricType: 'CODING_ACCURACY',
      period: 'monthly',
      periodStart,
      providerId: providerId || null,
    },
  });

  if (existingMetric) {
    // Update with rolling average
    const newSampleSize = (existingMetric.sampleSize || 0) + sampleSize;
    const existingTotal = Number(existingMetric.score) * (existingMetric.sampleSize || 1);
    const newTotal = existingTotal + (score * sampleSize);
    const newScore = newTotal / newSampleSize;

    await ctx.prisma.qAMetric.update({
      where: { id: existingMetric.id },
      data: {
        score: newScore,
        percentage: newScore,
        sampleSize: newSampleSize,
        meetsTarget: newScore >= 90,
        trend: newScore > Number(existingMetric.percentage) ? 'improving' : newScore < Number(existingMetric.percentage) ? 'declining' : 'stable',
      },
    });
  } else {
    // Create new metric
    await ctx.prisma.qAMetric.create({
      data: {
        organizationId: ctx.user.organizationId,
        metricType: 'CODING_ACCURACY',
        period: 'monthly',
        periodStart,
        periodEnd,
        score,
        maxScore: 100,
        percentage: score,
        sampleSize,
        providerId,
        target: 90, // Target 90% coding accuracy
        benchmark: 85, // Industry benchmark
        meetsTarget: score >= 90,
      },
    });
  }
}

// Generate education content for a finding
function generateCodingEducationContent(finding: {
  findingType: string;
  description: string;
  recommendation: string | null;
  relatedCodes: unknown;
}): {
  topic: string;
  overview: string;
  keyPoints: string[];
  resources: string[];
} {
  const findingTypeMap: { [key: string]: { topic: string; overview: string; keyPoints: string[]; resources: string[] } } = {
    CODING_CODEDOCUMENTATIONMATCH: {
      topic: 'Code-to-Documentation Match',
      overview: 'CPT codes must be supported by clinical documentation. Every code billed should have corresponding documentation in the medical record.',
      keyPoints: [
        'Document all procedures performed during the encounter',
        'Ensure diagnosis codes support the medical necessity of each procedure',
        'Match the level of service to the complexity documented',
        'Include specific spinal regions for manipulation codes',
      ],
      resources: [
        'AMA CPT Guidelines',
        'CMS Documentation Requirements',
        'Payer-specific billing manuals',
      ],
    },
    CODING_MODIFIERAPPROPRIATENESS: {
      topic: 'Modifier Usage Guidelines',
      overview: 'Modifiers provide additional information about services rendered. Proper modifier usage ensures accurate reimbursement and prevents audit issues.',
      keyPoints: [
        'Use modifier 25 for significant, separately identifiable E/M services',
        'Use modifier 59 or X{EPSU} for distinct procedural services',
        'Use modifier AT for active chiropractic treatment (Medicare)',
        'Never use conflicting modifiers on the same line',
      ],
      resources: [
        'CMS NCCI Policy Manual',
        'Modifier Usage Guidelines',
        'Medicare Claims Processing Manual',
      ],
    },
    CODING_UPDOWNCODING: {
      topic: 'Appropriate Code Level Selection',
      overview: 'Code level must match the documented level of service. Both upcoding (billing higher than documented) and downcoding (billing lower than performed) are problematic.',
      keyPoints: [
        'Match E/M level to medical decision making complexity',
        'Document time when billing time-based codes',
        'Select manipulation code based on documented spinal regions',
        'Ensure units reflect actual service duration',
      ],
      resources: [
        'E/M Documentation Guidelines',
        '8-Minute Rule for Timed Codes',
        'Chiropractic Manipulation Coding',
      ],
    },
    CODING_BUNDLINGCOMPLIANCE: {
      topic: 'Bundling and Unbundling Rules',
      overview: 'NCCI edits determine which codes can be billed together. Understanding bundling rules prevents claim denials and audit risk.',
      keyPoints: [
        'Review NCCI edits before submitting claims',
        'Use modifier 59 only when services are truly distinct',
        'Do not bill multiple manipulation codes on same date',
        'Consolidate similar services into single line with units',
      ],
      resources: [
        'CMS NCCI Edits',
        'Unbundling Guidelines',
        'CPT Code Bundling Rules',
      ],
    },
    CODING_LCDNCDCOMPLIANCE: {
      topic: 'LCD/NCD Coverage Requirements',
      overview: 'Local and National Coverage Determinations define what Medicare will cover. Compliance with these policies is essential for reimbursement.',
      keyPoints: [
        'Document subluxation or neuromusculoskeletal diagnosis for manipulation',
        'Distinguish acute treatment from maintenance care',
        'Include clinical indication for diagnostic imaging',
        'Document functional improvement or goals for ongoing therapy',
      ],
      resources: [
        'Medicare LCD for Chiropractic Services',
        'NCD Manual',
        'MAC-specific coverage policies',
      ],
    },
  };

  // Extract the main finding type (e.g., CODING_CODEDOCUMENTATIONMATCH)
  const baseType = finding.findingType.split('_').slice(0, 2).join('_');
  const education = findingTypeMap[baseType] || {
    topic: 'Coding Compliance',
    overview: finding.description,
    keyPoints: [finding.recommendation || 'Review coding guidelines'],
    resources: ['AMA CPT Manual', 'CMS Guidelines'],
  };

  return education;
}

export type AIQARouter = typeof aiQARouter;
