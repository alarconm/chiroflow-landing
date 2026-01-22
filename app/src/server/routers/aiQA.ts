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

  // ============================================
  // US-350: Compliance monitoring
  // ============================================

  /**
   * Monitor compliance across the organization
   * Performs ongoing compliance watch including HIPAA, billing, consent, and audit trail checks
   */
  monitorCompliance: providerProcedure
    .input(
      z.object({
        // Scope of monitoring
        scope: z.enum(['full', 'hipaa', 'billing', 'consent', 'audit_trail', 'patterns']).default('full'),
        // Date range for monitoring
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
        // Optional provider filter
        providerId: z.string().optional(),
        // Sample size for random checks
        sampleSize: z.number().min(1).max(1000).default(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { scope, dateFrom, dateTo, providerId, sampleSize } = input;

      // Default date range to last 30 days
      const endDate = dateTo || new Date();
      const startDate = dateFrom || new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Create compliance audit record
      const audit = await ctx.prisma.qAAudit.create({
        data: {
          organizationId: ctx.user.organizationId,
          auditType: 'COMPLIANCE',
          targetType: 'Organization',
          providerId: providerId || null,
          dateFrom: startDate,
          dateTo: endDate,
          sampleSize,
          methodology: `AI-assisted compliance monitoring (scope: ${scope})`,
          status: 'IN_PROGRESS',
        },
      });

      // Initialize results
      const alerts: ComplianceAlertInput[] = [];
      const findings: Prisma.QAFindingCreateManyInput[] = [];
      let totalScore = 0;
      let checksPerformed = 0;
      let criticalCount = 0;
      let highCount = 0;
      let mediumCount = 0;
      let lowCount = 0;

      // Run compliance checks based on scope
      if (scope === 'full' || scope === 'hipaa') {
        const hipaaResult = await performHIPAAComplianceChecks(ctx, startDate, endDate, providerId, sampleSize);
        alerts.push(...hipaaResult.alerts);
        findings.push(...hipaaResult.findings.map(f => ({ ...f, auditId: audit.id })));
        totalScore += hipaaResult.score;
        checksPerformed++;
        criticalCount += hipaaResult.criticalCount;
        highCount += hipaaResult.highCount;
        mediumCount += hipaaResult.mediumCount;
        lowCount += hipaaResult.lowCount;
      }

      if (scope === 'full' || scope === 'billing') {
        const billingResult = await performBillingComplianceChecks(ctx, startDate, endDate, providerId, sampleSize);
        alerts.push(...billingResult.alerts);
        findings.push(...billingResult.findings.map(f => ({ ...f, auditId: audit.id })));
        totalScore += billingResult.score;
        checksPerformed++;
        criticalCount += billingResult.criticalCount;
        highCount += billingResult.highCount;
        mediumCount += billingResult.mediumCount;
        lowCount += billingResult.lowCount;
      }

      if (scope === 'full' || scope === 'consent') {
        const consentResult = await performConsentComplianceChecks(ctx, startDate, endDate, sampleSize);
        alerts.push(...consentResult.alerts);
        findings.push(...consentResult.findings.map(f => ({ ...f, auditId: audit.id })));
        totalScore += consentResult.score;
        checksPerformed++;
        criticalCount += consentResult.criticalCount;
        highCount += consentResult.highCount;
        mediumCount += consentResult.mediumCount;
        lowCount += consentResult.lowCount;
      }

      if (scope === 'full' || scope === 'audit_trail') {
        const auditTrailResult = await performAuditTrailChecks(ctx, startDate, endDate, sampleSize);
        alerts.push(...auditTrailResult.alerts);
        findings.push(...auditTrailResult.findings.map(f => ({ ...f, auditId: audit.id })));
        totalScore += auditTrailResult.score;
        checksPerformed++;
        criticalCount += auditTrailResult.criticalCount;
        highCount += auditTrailResult.highCount;
        mediumCount += auditTrailResult.mediumCount;
        lowCount += auditTrailResult.lowCount;
      }

      if (scope === 'full' || scope === 'patterns') {
        const patternResult = await performUnusualPatternDetection(ctx, startDate, endDate, providerId);
        alerts.push(...patternResult.alerts);
        findings.push(...patternResult.findings.map(f => ({ ...f, auditId: audit.id })));
        totalScore += patternResult.score;
        checksPerformed++;
        criticalCount += patternResult.criticalCount;
        highCount += patternResult.highCount;
        mediumCount += patternResult.mediumCount;
        lowCount += patternResult.lowCount;
      }

      // Calculate overall compliance score
      const overallScore = checksPerformed > 0 ? Math.round(totalScore / checksPerformed) : 100;
      const scoreCategory = getScoreCategory(overallScore);

      // Create findings in database
      if (findings.length > 0) {
        await ctx.prisma.qAFinding.createMany({ data: findings });
      }

      // Create compliance alerts in database
      if (alerts.length > 0) {
        await ctx.prisma.complianceAlert.createMany({
          data: alerts.map(a => ({
            organizationId: ctx.user.organizationId,
            ...a,
          })),
        });
      }

      // Update compliance metrics
      await updateComplianceMetrics(ctx, overallScore, sampleSize, scope);

      // Update audit with final results
      const updatedAudit = await ctx.prisma.qAAudit.update({
        where: { id: audit.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          score: overallScore,
          scoreCategory,
          findingsCount: findings.length,
          criticalCount,
          highCount,
          mediumCount,
          lowCount,
          summary: `Compliance monitoring completed. Overall score: ${overallScore}/100 (${scoreCategory}). Found ${findings.length} findings and ${alerts.length} alerts requiring attention.`,
          recommendations: generateComplianceRecommendations(alerts, findings.length, overallScore),
        },
      });

      // Log the compliance monitoring action
      await auditLog('AI_QA_COMPLIANCE_MONITORING', 'QAAudit', {
        entityId: audit.id,
        changes: {
          scope,
          score: overallScore,
          findingsCount: findings.length,
          alertsCount: alerts.length,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        auditId: updatedAudit.id,
        score: overallScore,
        scoreCategory,
        summary: {
          total: findings.length,
          critical: criticalCount,
          high: highCount,
          medium: mediumCount,
          low: lowCount,
          alertsGenerated: alerts.length,
        },
        alerts: alerts.slice(0, 20), // Return top 20 alerts
        checksPerformed,
        period: { from: startDate, to: endDate },
      };
    }),

  /**
   * Get compliance alerts with filtering
   */
  getComplianceAlerts: providerProcedure
    .input(
      z.object({
        status: z.enum(['NEW', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED', 'ESCALATED']).optional(),
        type: z.enum(['HIPAA_VIOLATION', 'BILLING_IRREGULARITY', 'DOCUMENTATION_GAP', 'CONSENT_MISSING', 'AUDIT_TRAIL_GAP', 'UNUSUAL_PATTERN', 'POLICY_VIOLATION', 'CREDENTIAL_EXPIRING', 'TRAINING_DUE']).optional(),
        severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']).optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { status, type, severity, limit, offset } = input;

      const whereClause: Prisma.ComplianceAlertWhereInput = {
        organizationId: ctx.user.organizationId,
      };

      if (status) whereClause.status = status;
      if (type) whereClause.type = type;
      if (severity) whereClause.severity = severity;

      const [alerts, total] = await Promise.all([
        ctx.prisma.complianceAlert.findMany({
          where: whereClause,
          orderBy: [
            { severity: 'asc' }, // CRITICAL first
            { detectedAt: 'desc' },
          ],
          take: limit,
          skip: offset,
        }),
        ctx.prisma.complianceAlert.count({ where: whereClause }),
      ]);

      return {
        alerts,
        total,
        hasMore: offset + limit < total,
        summary: {
          new: await ctx.prisma.complianceAlert.count({
            where: { ...whereClause, status: 'NEW' },
          }),
          inProgress: await ctx.prisma.complianceAlert.count({
            where: { ...whereClause, status: 'IN_PROGRESS' },
          }),
          critical: await ctx.prisma.complianceAlert.count({
            where: { ...whereClause, severity: 'CRITICAL', status: { notIn: ['RESOLVED', 'DISMISSED'] } },
          }),
        },
      };
    }),

  /**
   * Acknowledge a compliance alert
   */
  acknowledgeAlert: providerProcedure
    .input(z.object({ alertId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const alert = await ctx.prisma.complianceAlert.findFirst({
        where: {
          id: input.alertId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!alert) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Compliance alert not found',
        });
      }

      const updated = await ctx.prisma.complianceAlert.update({
        where: { id: input.alertId },
        data: {
          status: 'ACKNOWLEDGED',
          acknowledgedAt: new Date(),
          acknowledgedBy: ctx.user.id,
        },
      });

      await auditLog('AI_QA_COMPLIANCE_ALERT_ACKNOWLEDGED', 'ComplianceAlert', {
        entityId: input.alertId,
        changes: { status: 'ACKNOWLEDGED' },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  /**
   * Resolve a compliance alert
   */
  resolveAlert: providerProcedure
    .input(
      z.object({
        alertId: z.string(),
        resolutionNote: z.string().min(1),
        status: z.enum(['RESOLVED', 'DISMISSED']).default('RESOLVED'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { alertId, resolutionNote, status } = input;

      const alert = await ctx.prisma.complianceAlert.findFirst({
        where: {
          id: alertId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!alert) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Compliance alert not found',
        });
      }

      const updated = await ctx.prisma.complianceAlert.update({
        where: { id: alertId },
        data: {
          status,
          resolvedAt: new Date(),
          resolvedBy: ctx.user.id,
          resolutionNote,
        },
      });

      await auditLog('AI_QA_COMPLIANCE_ALERT_RESOLVED', 'ComplianceAlert', {
        entityId: alertId,
        changes: { status, resolutionNote },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  /**
   * Escalate a compliance alert
   */
  escalateAlert: providerProcedure
    .input(
      z.object({
        alertId: z.string(),
        escalateTo: z.string(),
        reason: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { alertId, escalateTo, reason } = input;

      const alert = await ctx.prisma.complianceAlert.findFirst({
        where: {
          id: alertId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!alert) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Compliance alert not found',
        });
      }

      const updated = await ctx.prisma.complianceAlert.update({
        where: { id: alertId },
        data: {
          status: 'ESCALATED',
          escalatedAt: new Date(),
          escalatedTo: escalateTo,
          escalationReason: reason,
        },
      });

      await auditLog('AI_QA_COMPLIANCE_ALERT_ESCALATED', 'ComplianceAlert', {
        entityId: alertId,
        changes: { status: 'ESCALATED', escalatedTo: escalateTo, reason },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  /**
   * Get compliance score trending over time
   */
  getComplianceScoreTrending: providerProcedure
    .input(
      z.object({
        period: z.enum(['weekly', 'monthly', 'quarterly']).default('monthly'),
        limit: z.number().min(1).max(24).default(12),
      })
    )
    .query(async ({ ctx, input }) => {
      const { period, limit } = input;

      const metrics = await ctx.prisma.qAMetric.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          metricType: { in: ['COMPLIANCE_OVERALL', 'COMPLIANCE_HIPAA', 'COMPLIANCE_BILLING', 'COMPLIANCE_CONSENT', 'COMPLIANCE_AUDIT_TRAIL'] },
          period,
        },
        orderBy: { periodStart: 'desc' },
        take: limit * 5, // Get all types
      });

      // Group by period
      const periodMap = new Map<string, {
        periodStart: Date;
        periodEnd: Date;
        overall: number[];
        hipaa: number[];
        billing: number[];
        consent: number[];
        auditTrail: number[];
      }>();

      for (const metric of metrics) {
        const key = metric.periodStart.toISOString();
        if (!periodMap.has(key)) {
          periodMap.set(key, {
            periodStart: metric.periodStart,
            periodEnd: metric.periodEnd,
            overall: [],
            hipaa: [],
            billing: [],
            consent: [],
            auditTrail: [],
          });
        }
        const entry = periodMap.get(key)!;
        const score = Number(metric.percentage);

        if (metric.metricType === 'COMPLIANCE_OVERALL') entry.overall.push(score);
        else if (metric.metricType === 'COMPLIANCE_HIPAA') entry.hipaa.push(score);
        else if (metric.metricType === 'COMPLIANCE_BILLING') entry.billing.push(score);
        else if (metric.metricType === 'COMPLIANCE_CONSENT') entry.consent.push(score);
        else if (metric.metricType === 'COMPLIANCE_AUDIT_TRAIL') entry.auditTrail.push(score);
      }

      const history = Array.from(periodMap.entries())
        .map(([, data]) => ({
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
          overall: data.overall.length > 0 ? Math.round(data.overall.reduce((a, b) => a + b, 0) / data.overall.length) : null,
          breakdown: {
            hipaa: data.hipaa.length > 0 ? Math.round(data.hipaa.reduce((a, b) => a + b, 0) / data.hipaa.length) : null,
            billing: data.billing.length > 0 ? Math.round(data.billing.reduce((a, b) => a + b, 0) / data.billing.length) : null,
            consent: data.consent.length > 0 ? Math.round(data.consent.reduce((a, b) => a + b, 0) / data.consent.length) : null,
            auditTrail: data.auditTrail.length > 0 ? Math.round(data.auditTrail.reduce((a, b) => a + b, 0) / data.auditTrail.length) : null,
          },
        }))
        .slice(0, limit);

      const overallScores = history.map(h => h.overall).filter((s): s is number => s !== null);

      return {
        history,
        trend: calculateTrend(overallScores),
        currentScore: overallScores[0] || null,
        averageScore: overallScores.length > 0 ? Math.round(overallScores.reduce((a, b) => a + b, 0) / overallScores.length) : null,
      };
    }),

  /**
   * Get compliance dashboard summary
   */
  getComplianceDashboard: providerProcedure
    .query(async ({ ctx }) => {
      // Get current compliance metrics
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const currentMetrics = await ctx.prisma.qAMetric.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          metricType: { in: ['COMPLIANCE_OVERALL', 'COMPLIANCE_HIPAA', 'COMPLIANCE_BILLING', 'COMPLIANCE_CONSENT', 'COMPLIANCE_AUDIT_TRAIL'] },
          periodStart: { gte: monthStart },
        },
      });

      // Get open alerts by severity
      const alertCounts = await ctx.prisma.complianceAlert.groupBy({
        by: ['severity'],
        where: {
          organizationId: ctx.user.organizationId,
          status: { notIn: ['RESOLVED', 'DISMISSED'] },
        },
        _count: true,
      });

      // Get recent audits
      const recentAudits = await ctx.prisma.qAAudit.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          auditType: 'COMPLIANCE',
          status: 'COMPLETED',
        },
        orderBy: { completedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          auditDate: true,
          score: true,
          scoreCategory: true,
          findingsCount: true,
        },
      });

      // Build metrics object
      const metricsMap = new Map<string, number>();
      for (const m of currentMetrics) {
        metricsMap.set(m.metricType, Number(m.percentage));
      }

      // Build alert counts
      const alertsBySeverity: { [key: string]: number } = {};
      for (const ac of alertCounts) {
        alertsBySeverity[ac.severity] = ac._count;
      }

      return {
        scores: {
          overall: metricsMap.get('COMPLIANCE_OVERALL') || null,
          hipaa: metricsMap.get('COMPLIANCE_HIPAA') || null,
          billing: metricsMap.get('COMPLIANCE_BILLING') || null,
          consent: metricsMap.get('COMPLIANCE_CONSENT') || null,
          auditTrail: metricsMap.get('COMPLIANCE_AUDIT_TRAIL') || null,
        },
        alerts: {
          total: Object.values(alertsBySeverity).reduce((a, b) => a + b, 0),
          critical: alertsBySeverity['CRITICAL'] || 0,
          high: alertsBySeverity['HIGH'] || 0,
          medium: alertsBySeverity['MEDIUM'] || 0,
          low: alertsBySeverity['LOW'] || 0,
        },
        recentAudits,
        lastAuditDate: recentAudits[0]?.auditDate || null,
      };
    }),

  // ============================================
  // US-351: Clinical quality measures endpoints
  // ============================================

  /**
   * Track clinical quality metrics across the organization
   * Monitors outcome measures, treatment effectiveness, patient satisfaction,
   * care gap closure rates, and provides benchmark comparisons
   */
  trackQuality: providerProcedure
    .input(
      z.object({
        providerId: z.string().optional(),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
        includeDetails: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { providerId, dateFrom, dateTo, includeDetails } = input;
      const now = new Date();
      const startDate = dateFrom || new Date(now.getFullYear(), now.getMonth() - 3, 1); // Default 3 months
      const endDate = dateTo || now;

      // Create the audit record
      const audit = await ctx.prisma.qAAudit.create({
        data: {
          organizationId: ctx.user.organizationId,
          auditType: 'CLINICAL',
          targetType: 'Organization',
          targetId: ctx.user.organizationId,
          providerId: providerId || null,
          dateFrom: startDate,
          dateTo: endDate,
          methodology: 'AI-assisted clinical quality assessment',
          status: 'IN_PROGRESS',
        },
      });

      const assessments: ClinicalQualityAssessment[] = [];
      const allFindings: Prisma.QAFindingCreateManyInput[] = [];
      let totalScore = 0;
      let criticalCount = 0;
      let highCount = 0;
      let mediumCount = 0;
      let lowCount = 0;

      // Build where clause for provider filter
      const providerFilter = providerId ? { providerId } : {};

      // 1. Outcome Measure Tracking Assessment
      const outcomeAssessment = await assessOutcomeTracking(
        ctx,
        startDate,
        endDate,
        providerFilter
      );
      assessments.push(outcomeAssessment);
      totalScore += outcomeAssessment.score;

      if (!outcomeAssessment.passed) {
        const severity = outcomeAssessment.score < 50 ? 'HIGH' : 'MEDIUM';
        if (severity === 'HIGH') highCount++;
        else mediumCount++;

        for (const finding of outcomeAssessment.findings) {
          allFindings.push({
            auditId: audit.id,
            organizationId: ctx.user.organizationId,
            findingType: 'CLINICAL_OUTCOME_TRACKING',
            severity,
            title: 'Outcome tracking deficiency',
            description: finding,
            recommendation: outcomeAssessment.recommendations[0] || 'Implement regular outcome assessments',
            providerId: providerId || null,
            riskScore: Math.round(100 - outcomeAssessment.score),
            complianceImpact: false,
          });
        }
      }

      // 2. Treatment Effectiveness Assessment
      const effectivenessAssessment = await assessTreatmentEffectiveness(
        ctx,
        startDate,
        endDate,
        providerFilter
      );
      assessments.push(effectivenessAssessment);
      totalScore += effectivenessAssessment.score;

      if (!effectivenessAssessment.passed) {
        const severity = effectivenessAssessment.score < 50 ? 'HIGH' : 'MEDIUM';
        if (severity === 'HIGH') highCount++;
        else mediumCount++;

        for (const finding of effectivenessAssessment.findings) {
          allFindings.push({
            auditId: audit.id,
            organizationId: ctx.user.organizationId,
            findingType: 'CLINICAL_TREATMENT_EFFECTIVENESS',
            severity,
            title: 'Treatment effectiveness concern',
            description: finding,
            recommendation: effectivenessAssessment.recommendations[0] || 'Review treatment protocols',
            providerId: providerId || null,
            riskScore: Math.round(100 - effectivenessAssessment.score),
            complianceImpact: false,
          });
        }
      }

      // 3. Patient Satisfaction Assessment
      const satisfactionAssessment = await assessPatientSatisfaction(
        ctx,
        startDate,
        endDate,
        providerFilter
      );
      assessments.push(satisfactionAssessment);
      totalScore += satisfactionAssessment.score;

      if (!satisfactionAssessment.passed) {
        const severity = satisfactionAssessment.score < 50 ? 'MEDIUM' : 'LOW';
        if (severity === 'MEDIUM') mediumCount++;
        else lowCount++;

        for (const finding of satisfactionAssessment.findings) {
          allFindings.push({
            auditId: audit.id,
            organizationId: ctx.user.organizationId,
            findingType: 'CLINICAL_PATIENT_SATISFACTION',
            severity,
            title: 'Patient satisfaction concern',
            description: finding,
            recommendation: satisfactionAssessment.recommendations[0] || 'Focus on patient experience',
            providerId: providerId || null,
            riskScore: Math.round(100 - satisfactionAssessment.score),
            complianceImpact: false,
          });
        }
      }

      // 4. Care Gap Closure Assessment
      const careGapAssessment = await assessCareGapClosure(
        ctx,
        startDate,
        endDate,
        providerFilter
      );
      assessments.push(careGapAssessment);
      totalScore += careGapAssessment.score;

      if (!careGapAssessment.passed) {
        const severity = careGapAssessment.score < 50 ? 'HIGH' : 'MEDIUM';
        if (severity === 'HIGH') highCount++;
        else mediumCount++;

        for (const finding of careGapAssessment.findings) {
          allFindings.push({
            auditId: audit.id,
            organizationId: ctx.user.organizationId,
            findingType: 'CLINICAL_CARE_GAP',
            severity,
            title: 'Care gap closure issue',
            description: finding,
            recommendation: careGapAssessment.recommendations[0] || 'Implement care gap outreach',
            providerId: providerId || null,
            riskScore: Math.round(100 - careGapAssessment.score),
            complianceImpact: true,
          });
        }
      }

      // 5. Visit Compliance Assessment
      const visitComplianceAssessment = await assessVisitCompliance(
        ctx,
        startDate,
        endDate,
        providerFilter
      );
      assessments.push(visitComplianceAssessment);
      totalScore += visitComplianceAssessment.score;

      if (!visitComplianceAssessment.passed) {
        const severity = visitComplianceAssessment.score < 50 ? 'MEDIUM' : 'LOW';
        if (severity === 'MEDIUM') mediumCount++;
        else lowCount++;

        for (const finding of visitComplianceAssessment.findings) {
          allFindings.push({
            auditId: audit.id,
            organizationId: ctx.user.organizationId,
            findingType: 'CLINICAL_VISIT_COMPLIANCE',
            severity,
            title: 'Visit compliance issue',
            description: finding,
            recommendation: visitComplianceAssessment.recommendations[0] || 'Improve patient engagement',
            providerId: providerId || null,
            riskScore: Math.round(100 - visitComplianceAssessment.score),
            complianceImpact: false,
          });
        }
      }

      // Calculate overall score (weighted average)
      const maxPossibleScore = clinicalQualityCriteria.reduce((sum, c) => sum + c.weight, 0);
      const overallScore = Math.round((totalScore / maxPossibleScore) * 100);
      const scoreCategory = getScoreCategory(overallScore);

      // Create findings in database
      if (allFindings.length > 0) {
        await ctx.prisma.qAFinding.createMany({
          data: allFindings,
        });
      }

      // Generate quality improvement recommendations
      const recommendations = generateClinicalQualityRecommendations(
        assessments,
        overallScore,
        criticalCount,
        highCount
      );

      // Update the audit record
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
          summary: `Clinical quality assessment completed. Overall score: ${overallScore}/100 (${scoreCategory}). Found ${allFindings.length} areas for improvement.`,
          recommendations,
        },
        include: {
          findings: {
            orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
            take: 20,
          },
        },
      });

      // Update clinical quality metrics
      await updateClinicalQualityMetrics(ctx, assessments, overallScore, providerId);

      // Log the audit action
      await auditLog('AI_QA_CLINICAL_QUALITY', 'QAAudit', {
        entityId: audit.id,
        changes: {
          score: overallScore,
          findingsCount: allFindings.length,
          period: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      // Get provider performance comparison if requested
      let providerComparison: ProviderPerformanceMetrics[] | null = null;
      if (includeDetails && !providerId) {
        providerComparison = await getProviderPerformanceComparison(ctx, startDate, endDate);
      }

      return {
        auditId: updatedAudit.id,
        score: overallScore,
        scoreCategory,
        period: { from: startDate, to: endDate },
        assessments: assessments.map(a => ({
          criteria: a.criteriaName,
          score: Math.round((a.score / a.maxScore) * 100),
          passed: a.passed,
          metrics: a.metrics,
          findings: a.findings,
          recommendations: a.recommendations,
        })),
        summary: {
          total: allFindings.length,
          critical: criticalCount,
          high: highCount,
          medium: mediumCount,
          low: lowCount,
        },
        benchmarkComparison: {
          outcomeAssessmentRate: {
            actual: assessments.find(a => a.criteriaName === 'outcomeTracking')?.metrics.percentage || 0,
            benchmark: clinicalBenchmarks.outcomeAssessmentRate,
            meetsBenchmark: (assessments.find(a => a.criteriaName === 'outcomeTracking')?.metrics.percentage || 0) >= clinicalBenchmarks.outcomeAssessmentRate,
          },
          improvementRate: {
            actual: assessments.find(a => a.criteriaName === 'treatmentEffectiveness')?.metrics.percentage || 0,
            benchmark: clinicalBenchmarks.improvementRate,
            meetsBenchmark: (assessments.find(a => a.criteriaName === 'treatmentEffectiveness')?.metrics.percentage || 0) >= clinicalBenchmarks.improvementRate,
          },
          satisfactionScore: {
            actual: assessments.find(a => a.criteriaName === 'patientSatisfaction')?.metrics.percentage || 0,
            benchmark: clinicalBenchmarks.satisfactionScore * 20, // Convert to percentage
            meetsBenchmark: (assessments.find(a => a.criteriaName === 'patientSatisfaction')?.metrics.percentage || 0) >= clinicalBenchmarks.satisfactionScore * 20,
          },
          careGapClosureRate: {
            actual: assessments.find(a => a.criteriaName === 'careGapClosure')?.metrics.percentage || 0,
            benchmark: clinicalBenchmarks.careGapClosureRate,
            meetsBenchmark: (assessments.find(a => a.criteriaName === 'careGapClosure')?.metrics.percentage || 0) >= clinicalBenchmarks.careGapClosureRate,
          },
          visitComplianceRate: {
            actual: assessments.find(a => a.criteriaName === 'visitCompliance')?.metrics.percentage || 0,
            benchmark: clinicalBenchmarks.visitComplianceRate,
            meetsBenchmark: (assessments.find(a => a.criteriaName === 'visitCompliance')?.metrics.percentage || 0) >= clinicalBenchmarks.visitComplianceRate,
          },
        },
        recommendations,
        providerComparison,
        findings: updatedAudit.findings,
      };
    }),

  /**
   * Get clinical quality score history for trend analysis
   */
  getQualityScoreHistory: providerProcedure
    .input(
      z.object({
        providerId: z.string().optional(),
        metricType: z.enum([
          'CLINICAL_QUALITY_OVERALL',
          'OUTCOME_TRACKING',
          'TREATMENT_EFFECTIVENESS',
          'PATIENT_SATISFACTION',
          'CARE_GAP_CLOSURE',
          'VISIT_COMPLIANCE',
        ]).optional(),
        period: z.enum(['weekly', 'monthly', 'quarterly']).default('monthly'),
        limit: z.number().min(1).max(24).default(12),
      })
    )
    .query(async ({ ctx, input }) => {
      const { providerId, metricType, period, limit } = input;

      const metricTypes = metricType
        ? [metricType]
        : ['CLINICAL_QUALITY_OVERALL', 'OUTCOME_TRACKING', 'TREATMENT_EFFECTIVENESS', 'PATIENT_SATISFACTION', 'CARE_GAP_CLOSURE', 'VISIT_COMPLIANCE'] as const;

      const whereClause: Prisma.QAMetricWhereInput = {
        organizationId: ctx.user.organizationId,
        metricType: { in: metricTypes as unknown as Prisma.EnumQAMetricTypeFilter['in'] },
        period,
      };

      if (providerId) {
        whereClause.providerId = providerId;
      }

      const metrics = await ctx.prisma.qAMetric.findMany({
        where: whereClause,
        orderBy: { periodStart: 'desc' },
        take: limit * metricTypes.length,
      });

      // Group by period
      const periodMap = new Map<string, {
        periodStart: Date;
        periodEnd: Date;
        metrics: { type: string; score: number }[];
      }>();

      for (const metric of metrics) {
        const key = metric.periodStart.toISOString();
        if (!periodMap.has(key)) {
          periodMap.set(key, {
            periodStart: metric.periodStart,
            periodEnd: metric.periodEnd,
            metrics: [],
          });
        }
        periodMap.get(key)!.metrics.push({
          type: metric.metricType,
          score: Number(metric.percentage),
        });
      }

      const history = Array.from(periodMap.entries())
        .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
        .slice(0, limit)
        .map(([, data]) => {
          const overallScore = data.metrics.find(m => m.type === 'CLINICAL_QUALITY_OVERALL')?.score
            || Math.round(data.metrics.reduce((sum, m) => sum + m.score, 0) / data.metrics.length);

          return {
            periodStart: data.periodStart,
            periodEnd: data.periodEnd,
            overallScore,
            metrics: data.metrics.reduce((acc, m) => {
              acc[m.type] = m.score;
              return acc;
            }, {} as Record<string, number>),
          };
        });

      const scores = history.map(h => h.overallScore);

      return {
        history,
        trend: calculateTrend(scores),
        currentScore: scores[0] || null,
        averageScore: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      };
    }),

  /**
   * Get provider performance comparison
   */
  getProviderQualityComparison: providerProcedure
    .input(
      z.object({
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
        sortBy: z.enum(['score', 'patients', 'improvement', 'satisfaction']).default('score'),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { dateFrom, dateTo, sortBy, limit } = input;
      const now = new Date();
      const startDate = dateFrom || new Date(now.getFullYear(), now.getMonth() - 3, 1);
      const endDate = dateTo || now;

      const comparison = await getProviderPerformanceComparison(ctx, startDate, endDate);

      // Sort based on input
      comparison.sort((a, b) => {
        switch (sortBy) {
          case 'patients':
            return b.totalPatients - a.totalPatients;
          case 'improvement':
            return b.avgOutcomeImprovement - a.avgOutcomeImprovement;
          case 'satisfaction':
            return b.avgSatisfactionScore - a.avgSatisfactionScore;
          case 'score':
          default:
            return b.overallQualityScore - a.overallQualityScore;
        }
      });

      // Add ranks
      const rankedComparison = comparison.slice(0, limit).map((p, index) => ({
        ...p,
        rank: index + 1,
      }));

      // Calculate organization averages
      const orgAverages = {
        avgOutcomeImprovement: comparison.length > 0
          ? Math.round(comparison.reduce((sum, p) => sum + p.avgOutcomeImprovement, 0) / comparison.length)
          : 0,
        avgSatisfactionScore: comparison.length > 0
          ? Number((comparison.reduce((sum, p) => sum + p.avgSatisfactionScore, 0) / comparison.length).toFixed(1))
          : 0,
        avgCareGapClosure: comparison.length > 0
          ? Math.round(comparison.reduce((sum, p) => sum + p.careGapClosureRate, 0) / comparison.length)
          : 0,
        avgOverallScore: comparison.length > 0
          ? Math.round(comparison.reduce((sum, p) => sum + p.overallQualityScore, 0) / comparison.length)
          : 0,
      };

      return {
        providers: rankedComparison,
        organizationAverages: orgAverages,
        totalProviders: comparison.length,
        period: { from: startDate, to: endDate },
      };
    }),

  /**
   * Get clinical quality dashboard
   */
  getClinicalQualityDashboard: providerProcedure
    .input(
      z.object({
        providerId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { providerId } = input;
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);

      const providerFilter = providerId ? { providerId } : {};

      // Get current month metrics
      const currentMetrics = await ctx.prisma.qAMetric.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          metricType: {
            in: [
              'CLINICAL_QUALITY_OVERALL',
              'OUTCOME_TRACKING',
              'TREATMENT_EFFECTIVENESS',
              'PATIENT_SATISFACTION',
              'CARE_GAP_CLOSURE',
              'VISIT_COMPLIANCE',
            ],
          },
          periodStart: { gte: monthStart },
          ...providerFilter,
        },
      });

      // Get recent clinical audits
      const recentAudits = await ctx.prisma.qAAudit.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          auditType: 'CLINICAL',
          status: 'COMPLETED',
          ...providerFilter,
        },
        orderBy: { completedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          auditDate: true,
          score: true,
          scoreCategory: true,
          findingsCount: true,
          completedAt: true,
        },
      });

      // Get open care gaps
      const openCareGaps = await ctx.prisma.careGap.count({
        where: {
          organizationId: ctx.user.organizationId,
          status: { notIn: ['RESOLVED', 'DISMISSED'] },
        },
      });

      // Get patients with outcome assessments this month
      const patientsWithAssessments = await ctx.prisma.outcomeAssessment.groupBy({
        by: ['patientId'],
        where: {
          patient: { organizationId: ctx.user.organizationId },
          administeredAt: { gte: monthStart },
        },
      });

      // Get total active patients
      const activePatients = await ctx.prisma.patient.count({
        where: {
          organizationId: ctx.user.organizationId,
          status: 'ACTIVE',
        },
      });

      // Get treatment plans completion rate
      const completedPlans = await ctx.prisma.treatmentPlan.count({
        where: {
          organizationId: ctx.user.organizationId,
          status: 'COMPLETED',
          endDate: { gte: quarterStart },
        },
      });

      const totalPlansThisQuarter = await ctx.prisma.treatmentPlan.count({
        where: {
          organizationId: ctx.user.organizationId,
          startDate: { gte: quarterStart },
        },
      });

      // Build metrics object
      const metricsMap = new Map<string, { score: number; trend: string | null }>();
      for (const m of currentMetrics) {
        metricsMap.set(m.metricType, {
          score: Number(m.percentage),
          trend: m.trend,
        });
      }

      return {
        scores: {
          overall: metricsMap.get('CLINICAL_QUALITY_OVERALL')?.score || null,
          outcomeTracking: metricsMap.get('OUTCOME_TRACKING')?.score || null,
          treatmentEffectiveness: metricsMap.get('TREATMENT_EFFECTIVENESS')?.score || null,
          patientSatisfaction: metricsMap.get('PATIENT_SATISFACTION')?.score || null,
          careGapClosure: metricsMap.get('CARE_GAP_CLOSURE')?.score || null,
          visitCompliance: metricsMap.get('VISIT_COMPLIANCE')?.score || null,
        },
        trends: {
          overall: metricsMap.get('CLINICAL_QUALITY_OVERALL')?.trend || null,
          outcomeTracking: metricsMap.get('OUTCOME_TRACKING')?.trend || null,
          treatmentEffectiveness: metricsMap.get('TREATMENT_EFFECTIVENESS')?.trend || null,
          patientSatisfaction: metricsMap.get('PATIENT_SATISFACTION')?.trend || null,
          careGapClosure: metricsMap.get('CARE_GAP_CLOSURE')?.trend || null,
          visitCompliance: metricsMap.get('VISIT_COMPLIANCE')?.trend || null,
        },
        quickStats: {
          activePatients,
          patientsWithAssessments: patientsWithAssessments.length,
          assessmentRate: activePatients > 0
            ? Math.round((patientsWithAssessments.length / activePatients) * 100)
            : 0,
          openCareGaps,
          treatmentPlanCompletionRate: totalPlansThisQuarter > 0
            ? Math.round((completedPlans / totalPlansThisQuarter) * 100)
            : 0,
        },
        recentAudits,
        lastAuditDate: recentAudits[0]?.completedAt || null,
        benchmarks: clinicalBenchmarks,
      };
    }),

  /**
   * Get specific clinical quality finding details
   */
  getClinicalQualityFinding: providerProcedure
    .input(z.object({ findingId: z.string() }))
    .query(async ({ ctx, input }) => {
      const finding = await ctx.prisma.qAFinding.findFirst({
        where: {
          id: input.findingId,
          organizationId: ctx.user.organizationId,
          findingType: { startsWith: 'CLINICAL_' },
        },
        include: {
          audit: true,
        },
      });

      if (!finding) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Clinical quality finding not found',
        });
      }

      // Generate education content based on finding type
      const educationContent = generateClinicalEducationContent(finding.findingType);

      return {
        ...finding,
        educationContent,
      };
    }),

  /**
   * Get clinical quality audit history
   */
  getClinicalQualityAuditHistory: providerProcedure
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
        auditType: 'CLINICAL',
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
          dateFrom: a.dateFrom,
          dateTo: a.dateTo,
          findingsCount: a._count.findings,
          summary: a.summary,
          recommendations: a.recommendations,
        })),
        total,
        hasMore: offset + limit < total,
      };
    }),
});

// ============================================
// Helper functions for clinical quality assessment (US-351)
// ============================================

/**
 * Assess outcome tracking - are patients getting regular outcome assessments?
 */
async function assessOutcomeTracking(
  ctx: { prisma: import('@prisma/client').PrismaClient; user: { organizationId: string } },
  startDate: Date,
  endDate: Date,
  providerFilter: { providerId?: string }
): Promise<ClinicalQualityAssessment> {
  const maxScore = clinicalQualityCriteria.find(c => c.name === 'outcomeTracking')!.weight;
  let score = maxScore;
  const findings: string[] = [];
  const recommendations: string[] = [];

  // Get active patients in the period
  const activePatients = await ctx.prisma.patient.count({
    where: {
      organizationId: ctx.user.organizationId,
      status: 'ACTIVE',
      encounters: {
        some: {
          encounterDate: { gte: startDate, lte: endDate },
          ...providerFilter,
        },
      },
    },
  });

  // Get patients with outcome assessments
  const patientsWithAssessments = await ctx.prisma.outcomeAssessment.groupBy({
    by: ['patientId'],
    where: {
      patient: { organizationId: ctx.user.organizationId },
      administeredAt: { gte: startDate, lte: endDate },
      completedAt: { not: null },
      encounter: providerFilter.providerId ? { providerId: providerFilter.providerId } : {},
    },
  });

  const assessmentRate = activePatients > 0
    ? Math.round((patientsWithAssessments.length / activePatients) * 100)
    : 0;

  // Score based on assessment rate vs benchmark
  if (assessmentRate < clinicalBenchmarks.outcomeAssessmentRate * 0.5) {
    score = maxScore * 0.3;
    findings.push(`Only ${assessmentRate}% of active patients have outcome assessments (target: ${clinicalBenchmarks.outcomeAssessmentRate}%)`);
    recommendations.push('Implement routine outcome assessments at initial visit and every 4-6 weeks');
    recommendations.push('Consider using standardized tools like ODI, NDI, or NPRS');
  } else if (assessmentRate < clinicalBenchmarks.outcomeAssessmentRate) {
    score = maxScore * (assessmentRate / clinicalBenchmarks.outcomeAssessmentRate);
    findings.push(`${assessmentRate}% outcome assessment rate is below target of ${clinicalBenchmarks.outcomeAssessmentRate}%`);
    recommendations.push('Increase frequency of outcome assessments to track patient progress');
  }

  // Check for assessment diversity (different types used)
  const assessmentTypes = await ctx.prisma.outcomeAssessment.groupBy({
    by: ['assessmentType'],
    where: {
      patient: { organizationId: ctx.user.organizationId },
      administeredAt: { gte: startDate, lte: endDate },
    },
    _count: true,
  });

  if (assessmentTypes.length < 2) {
    score -= maxScore * 0.1;
    findings.push('Limited variety in outcome assessment types');
    recommendations.push('Consider using region-specific assessments (ODI for lumbar, NDI for cervical)');
  }

  return {
    criteriaName: 'outcomeTracking',
    score: Math.max(0, score),
    maxScore,
    passed: score >= maxScore * 0.8,
    metrics: {
      measured: patientsWithAssessments.length,
      target: Math.round(activePatients * clinicalBenchmarks.outcomeAssessmentRate / 100),
      percentage: assessmentRate,
    },
    findings,
    recommendations,
  };
}

/**
 * Assess treatment effectiveness - are patients showing improvement?
 */
async function assessTreatmentEffectiveness(
  ctx: { prisma: import('@prisma/client').PrismaClient; user: { organizationId: string } },
  startDate: Date,
  endDate: Date,
  providerFilter: { providerId?: string }
): Promise<ClinicalQualityAssessment> {
  const maxScore = clinicalQualityCriteria.find(c => c.name === 'treatmentEffectiveness')!.weight;
  let score = maxScore;
  const findings: string[] = [];
  const recommendations: string[] = [];

  // Get patients with multiple assessments to track change
  const patientsWithMultipleAssessments = await ctx.prisma.outcomeAssessment.groupBy({
    by: ['patientId'],
    where: {
      patient: { organizationId: ctx.user.organizationId },
      completedAt: { not: null },
      encounter: providerFilter.providerId ? { providerId: providerFilter.providerId } : {},
    },
    having: {
      patientId: {
        _count: { gte: 2 },
      },
    },
  });

  // Get assessments with improvement (positive change)
  const assessmentsWithChange = await ctx.prisma.outcomeAssessment.findMany({
    where: {
      patient: { organizationId: ctx.user.organizationId },
      administeredAt: { gte: startDate, lte: endDate },
      changeScore: { not: null },
      encounter: providerFilter.providerId ? { providerId: providerFilter.providerId } : {},
    },
    select: {
      changeScore: true,
      changePercent: true,
      assessmentType: true,
    },
  });

  // Count improvements (negative change in pain/disability scores is improvement)
  const improvements = assessmentsWithChange.filter(a =>
    Number(a.changeScore) < 0 || Number(a.changePercent) < 0
  );

  const improvementRate = assessmentsWithChange.length > 0
    ? Math.round((improvements.length / assessmentsWithChange.length) * 100)
    : 0;

  if (patientsWithMultipleAssessments.length < 10) {
    score *= 0.7;
    findings.push('Insufficient data for treatment effectiveness analysis (need more follow-up assessments)');
    recommendations.push('Ensure patients receive outcome assessments at multiple points in treatment');
  } else {
    if (improvementRate < clinicalBenchmarks.improvementRate * 0.7) {
      score = maxScore * 0.4;
      findings.push(`Only ${improvementRate}% of patients showing improvement (target: ${clinicalBenchmarks.improvementRate}%)`);
      recommendations.push('Review treatment protocols for effectiveness');
      recommendations.push('Consider additional training or peer consultation for challenging cases');
    } else if (improvementRate < clinicalBenchmarks.improvementRate) {
      score = maxScore * (improvementRate / clinicalBenchmarks.improvementRate);
      findings.push(`${improvementRate}% improvement rate is below target of ${clinicalBenchmarks.improvementRate}%`);
      recommendations.push('Analyze non-improving cases to identify patterns');
    }
  }

  // Calculate average improvement percentage
  const avgImprovement = assessmentsWithChange.length > 0
    ? Math.round(assessmentsWithChange.reduce((sum, a) => sum + Math.abs(Number(a.changePercent) || 0), 0) / assessmentsWithChange.length)
    : 0;

  return {
    criteriaName: 'treatmentEffectiveness',
    score: Math.max(0, score),
    maxScore,
    passed: score >= maxScore * 0.8,
    metrics: {
      measured: improvements.length,
      target: Math.round(assessmentsWithChange.length * clinicalBenchmarks.improvementRate / 100),
      percentage: improvementRate,
    },
    findings,
    recommendations,
  };
}

/**
 * Assess patient satisfaction
 */
async function assessPatientSatisfaction(
  ctx: { prisma: import('@prisma/client').PrismaClient; user: { organizationId: string } },
  startDate: Date,
  endDate: Date,
  providerFilter: { providerId?: string }
): Promise<ClinicalQualityAssessment> {
  const maxScore = clinicalQualityCriteria.find(c => c.name === 'patientSatisfaction')!.weight;
  let score = maxScore;
  const findings: string[] = [];
  const recommendations: string[] = [];

  // Get satisfaction scores from chat sessions (if available)
  // Note: Provider filtering not available on ChatSession - using org-wide data
  const satisfactionScores = await ctx.prisma.chatSession.findMany({
    where: {
      organizationId: ctx.user.organizationId,
      satisfactionScore: { not: null },
      createdAt: { gte: startDate, lte: endDate },
    },
    select: {
      satisfactionScore: true,
    },
  });

  // Calculate average satisfaction
  const avgSatisfaction = satisfactionScores.length > 0
    ? satisfactionScores.reduce((sum: number, s: { satisfactionScore: number | null }) => sum + (s.satisfactionScore || 0), 0) / satisfactionScores.length
    : 0;

  const satisfactionPercentage = Math.round((avgSatisfaction / 5) * 100); // Convert 1-5 to percentage

  if (satisfactionScores.length < 10) {
    score *= 0.7;
    findings.push('Limited patient satisfaction data available');
    recommendations.push('Implement systematic patient satisfaction surveys');
    recommendations.push('Request feedback at discharge or after completed treatment plans');
  } else {
    if (avgSatisfaction < clinicalBenchmarks.satisfactionScore * 0.8) {
      score = maxScore * 0.5;
      findings.push(`Average satisfaction score ${avgSatisfaction.toFixed(1)}/5 is below benchmark of ${clinicalBenchmarks.satisfactionScore}/5`);
      recommendations.push('Review patient feedback for common concerns');
      recommendations.push('Consider patient experience improvement initiatives');
    } else if (avgSatisfaction < clinicalBenchmarks.satisfactionScore) {
      score = maxScore * (avgSatisfaction / clinicalBenchmarks.satisfactionScore);
      findings.push(`Satisfaction score ${avgSatisfaction.toFixed(1)}/5 slightly below target of ${clinicalBenchmarks.satisfactionScore}/5`);
      recommendations.push('Focus on communication and patient education');
    }
  }

  // Check for low satisfaction outliers
  const lowScores = satisfactionScores.filter((s: { satisfactionScore: number | null }) => (s.satisfactionScore || 0) <= 2);
  if (lowScores.length > satisfactionScores.length * 0.1 && satisfactionScores.length >= 10) {
    score -= maxScore * 0.15;
    findings.push(`${Math.round((lowScores.length / satisfactionScores.length) * 100)}% of satisfaction scores are 2 or below`);
    recommendations.push('Investigate root causes of low satisfaction scores');
  }

  return {
    criteriaName: 'patientSatisfaction',
    score: Math.max(0, score),
    maxScore,
    passed: score >= maxScore * 0.8,
    metrics: {
      measured: satisfactionScores.length,
      target: Math.round(clinicalBenchmarks.satisfactionScore * 20), // Target as percentage
      percentage: satisfactionPercentage,
    },
    findings,
    recommendations,
  };
}

/**
 * Assess care gap closure rates
 */
async function assessCareGapClosure(
  ctx: { prisma: import('@prisma/client').PrismaClient; user: { organizationId: string } },
  startDate: Date,
  endDate: Date,
  _providerFilter: { providerId?: string }
): Promise<ClinicalQualityAssessment> {
  const maxScore = clinicalQualityCriteria.find(c => c.name === 'careGapClosure')!.weight;
  let score = maxScore;
  const findings: string[] = [];
  const recommendations: string[] = [];

  // Get care gaps identified in the period
  const identifiedGaps = await ctx.prisma.careGap.count({
    where: {
      organizationId: ctx.user.organizationId,
      createdAt: { gte: startDate, lte: endDate },
    },
  });

  // Get care gaps resolved in the period
  const resolvedGaps = await ctx.prisma.careGap.count({
    where: {
      organizationId: ctx.user.organizationId,
      status: 'RESOLVED',
      resolvedDate: { gte: startDate, lte: endDate },
    },
  });

  // Get currently open gaps
  const openGaps = await ctx.prisma.careGap.count({
    where: {
      organizationId: ctx.user.organizationId,
      status: { notIn: ['RESOLVED', 'DISMISSED'] },
    },
  });

  // Get overdue gaps (past due date)
  const overdueGaps = await ctx.prisma.careGap.count({
    where: {
      organizationId: ctx.user.organizationId,
      status: { notIn: ['RESOLVED', 'DISMISSED'] },
      dueDate: { lt: new Date() },
    },
  });

  const closureRate = identifiedGaps > 0
    ? Math.round((resolvedGaps / identifiedGaps) * 100)
    : (openGaps === 0 ? 100 : 0);

  if (closureRate < clinicalBenchmarks.careGapClosureRate * 0.7) {
    score = maxScore * 0.4;
    findings.push(`Care gap closure rate of ${closureRate}% is significantly below target of ${clinicalBenchmarks.careGapClosureRate}%`);
    recommendations.push('Implement systematic care gap outreach program');
    recommendations.push('Review and prioritize open care gaps weekly');
  } else if (closureRate < clinicalBenchmarks.careGapClosureRate) {
    score = maxScore * (closureRate / clinicalBenchmarks.careGapClosureRate);
    findings.push(`Care gap closure rate of ${closureRate}% is below target of ${clinicalBenchmarks.careGapClosureRate}%`);
    recommendations.push('Increase follow-up frequency for patients with care gaps');
  }

  if (overdueGaps > 0) {
    const overduePercentage = Math.round((overdueGaps / (openGaps || 1)) * 100);
    if (overduePercentage > 30) {
      score -= maxScore * 0.2;
      findings.push(`${overdueGaps} care gaps are past due date (${overduePercentage}% of open gaps)`);
      recommendations.push('Address overdue care gaps immediately');
    }
  }

  // Check gap types
  const gapsByType = await ctx.prisma.careGap.groupBy({
    by: ['gapType'],
    where: {
      organizationId: ctx.user.organizationId,
      status: { notIn: ['RESOLVED', 'DISMISSED'] },
    },
    _count: true,
  });

  const missedFollowUps = gapsByType.find(g => g.gapType === 'OVERDUE_FOLLOWUP')?._count || 0;
  if (missedFollowUps > 10) {
    findings.push(`${missedFollowUps} patients are overdue for follow-up visits`);
    recommendations.push('Implement appointment reminder system');
  }

  return {
    criteriaName: 'careGapClosure',
    score: Math.max(0, score),
    maxScore,
    passed: score >= maxScore * 0.8,
    metrics: {
      measured: resolvedGaps,
      target: Math.round(identifiedGaps * clinicalBenchmarks.careGapClosureRate / 100),
      percentage: closureRate,
    },
    findings,
    recommendations,
  };
}

/**
 * Assess visit compliance - are patients completing recommended visits?
 */
async function assessVisitCompliance(
  ctx: { prisma: import('@prisma/client').PrismaClient; user: { organizationId: string } },
  startDate: Date,
  endDate: Date,
  providerFilter: { providerId?: string }
): Promise<ClinicalQualityAssessment> {
  const maxScore = clinicalQualityCriteria.find(c => c.name === 'visitCompliance')!.weight;
  let score = maxScore;
  const findings: string[] = [];
  const recommendations: string[] = [];

  // Get treatment plans active in the period
  const activePlans = await ctx.prisma.treatmentPlan.findMany({
    where: {
      organizationId: ctx.user.organizationId,
      status: { in: ['ACTIVE', 'COMPLETED'] },
      startDate: { lte: endDate },
      OR: [
        { endDate: null },
        { endDate: { gte: startDate } },
      ],
      ...(providerFilter.providerId ? { providerId: providerFilter.providerId } : {}),
    },
    select: {
      id: true,
      plannedVisits: true,
      completedVisits: true,
      status: true,
    },
  });

  // Calculate overall visit compliance
  const totalPlanned = activePlans.reduce((sum, p) => sum + (p.plannedVisits || 0), 0);
  const totalCompleted = activePlans.reduce((sum, p) => sum + (p.completedVisits || 0), 0);

  const complianceRate = totalPlanned > 0
    ? Math.round((totalCompleted / totalPlanned) * 100)
    : 100;

  if (activePlans.length < 5) {
    score *= 0.7;
    findings.push('Limited treatment plan data for visit compliance analysis');
    recommendations.push('Ensure all patients have documented treatment plans with visit goals');
  } else {
    if (complianceRate < clinicalBenchmarks.visitComplianceRate * 0.7) {
      score = maxScore * 0.4;
      findings.push(`Visit compliance rate of ${complianceRate}% is significantly below target of ${clinicalBenchmarks.visitComplianceRate}%`);
      recommendations.push('Implement patient engagement strategies to improve visit compliance');
      recommendations.push('Review treatment plan visit frequency - may be too aggressive for patients');
    } else if (complianceRate < clinicalBenchmarks.visitComplianceRate) {
      score = maxScore * (complianceRate / clinicalBenchmarks.visitComplianceRate);
      findings.push(`Visit compliance rate of ${complianceRate}% is below target of ${clinicalBenchmarks.visitComplianceRate}%`);
      recommendations.push('Send appointment reminders and follow up on no-shows');
    }
  }

  // Check for incomplete treatment plans
  const incompletePlans = activePlans.filter(p =>
    p.status !== 'COMPLETED' &&
    p.plannedVisits &&
    p.completedVisits < p.plannedVisits * 0.5
  );

  if (incompletePlans.length > activePlans.length * 0.3 && activePlans.length >= 5) {
    score -= maxScore * 0.15;
    findings.push(`${Math.round((incompletePlans.length / activePlans.length) * 100)}% of treatment plans have less than 50% visit completion`);
    recommendations.push('Contact patients with incomplete treatment plans to discuss barriers');
  }

  return {
    criteriaName: 'visitCompliance',
    score: Math.max(0, score),
    maxScore,
    passed: score >= maxScore * 0.8,
    metrics: {
      measured: totalCompleted,
      target: Math.round(totalPlanned * clinicalBenchmarks.visitComplianceRate / 100),
      percentage: complianceRate,
    },
    findings,
    recommendations,
  };
}

/**
 * Get provider performance comparison
 */
async function getProviderPerformanceComparison(
  ctx: { prisma: import('@prisma/client').PrismaClient; user: { organizationId: string } },
  startDate: Date,
  endDate: Date
): Promise<ProviderPerformanceMetrics[]> {
  // Get all active providers
  const providers = await ctx.prisma.provider.findMany({
    where: {
      organizationId: ctx.user.organizationId,
      isActive: true,
    },
    include: {
      user: true,
    },
  });

  const providerMetrics: ProviderPerformanceMetrics[] = [];

  for (const provider of providers) {
    // Get patient count
    const patientCount = await ctx.prisma.patient.count({
      where: {
        organizationId: ctx.user.organizationId,
        status: 'ACTIVE',
        encounters: {
          some: {
            providerId: provider.id,
            encounterDate: { gte: startDate, lte: endDate },
          },
        },
      },
    });

    // Skip providers with no patients in period
    if (patientCount === 0) continue;

    // Get completed treatment plans
    const completedPlans = await ctx.prisma.treatmentPlan.count({
      where: {
        organizationId: ctx.user.organizationId,
        providerId: provider.id,
        status: 'COMPLETED',
        endDate: { gte: startDate, lte: endDate },
      },
    });

    // Get outcome improvements
    const assessmentsWithChange = await ctx.prisma.outcomeAssessment.findMany({
      where: {
        patient: { organizationId: ctx.user.organizationId },
        encounter: { providerId: provider.id },
        changePercent: { not: null },
        administeredAt: { gte: startDate, lte: endDate },
      },
      select: { changePercent: true },
    });

    const avgImprovement = assessmentsWithChange.length > 0
      ? Math.abs(assessmentsWithChange.reduce((sum, a) => sum + Number(a.changePercent), 0) / assessmentsWithChange.length)
      : 0;

    // Get satisfaction scores (org-wide as ChatSession doesn't have provider assignment)
    // Using overall org satisfaction as proxy for provider performance
    const satisfactionScores = await ctx.prisma.chatSession.findMany({
      where: {
        organizationId: ctx.user.organizationId,
        satisfactionScore: { not: null },
        createdAt: { gte: startDate, lte: endDate },
      },
      select: { satisfactionScore: true },
    });

    const avgSatisfaction = satisfactionScores.length > 0
      ? satisfactionScores.reduce((sum: number, s: { satisfactionScore: number | null }) => sum + (s.satisfactionScore || 0), 0) / satisfactionScores.length
      : 0;

    // Get care gap closure rate
    const providerGapsIdentified = await ctx.prisma.encounter.count({
      where: {
        providerId: provider.id,
        organizationId: ctx.user.organizationId,
        patient: {
          careGaps: {
            some: {
              createdAt: { gte: startDate, lte: endDate },
            },
          },
        },
      },
    });

    const providerGapsResolved = await ctx.prisma.encounter.count({
      where: {
        providerId: provider.id,
        organizationId: ctx.user.organizationId,
        patient: {
          careGaps: {
            some: {
              status: 'RESOLVED',
              resolvedDate: { gte: startDate, lte: endDate },
            },
          },
        },
      },
    });

    const careGapClosureRate = providerGapsIdentified > 0
      ? Math.round((providerGapsResolved / providerGapsIdentified) * 100)
      : 100;

    // Get visit compliance
    const providerPlans = await ctx.prisma.treatmentPlan.findMany({
      where: {
        organizationId: ctx.user.organizationId,
        providerId: provider.id,
        status: { in: ['ACTIVE', 'COMPLETED'] },
        startDate: { lte: endDate },
      },
      select: {
        plannedVisits: true,
        completedVisits: true,
      },
    });

    const totalPlanned = providerPlans.reduce((sum, p) => sum + (p.plannedVisits || 0), 0);
    const totalCompleted = providerPlans.reduce((sum, p) => sum + (p.completedVisits || 0), 0);
    const visitComplianceRate = totalPlanned > 0 ? Math.round((totalCompleted / totalPlanned) * 100) : 100;

    // Calculate overall quality score
    const overallScore = Math.round(
      (avgImprovement * 0.3) +
      (avgSatisfaction * 20 * 0.2) +
      (careGapClosureRate * 0.25) +
      (visitComplianceRate * 0.25)
    );

    // Get previous period metric for trend
    const prevPeriodMetric = await ctx.prisma.qAMetric.findFirst({
      where: {
        organizationId: ctx.user.organizationId,
        providerId: provider.id,
        metricType: 'PROVIDER_PERFORMANCE',
        periodEnd: { lt: startDate },
      },
      orderBy: { periodEnd: 'desc' },
    });

    const trend = prevPeriodMetric
      ? (overallScore > Number(prevPeriodMetric.percentage) ? 'improving' :
         overallScore < Number(prevPeriodMetric.percentage) ? 'declining' : 'stable')
      : 'insufficient_data';

    const user = provider.user as { firstName: string; lastName: string };
    providerMetrics.push({
      providerId: provider.id,
      providerName: `${user.firstName} ${user.lastName}`,
      totalPatients: patientCount,
      activePatients: patientCount,
      completedTreatmentPlans: completedPlans,
      avgOutcomeImprovement: Math.round(avgImprovement),
      avgSatisfactionScore: Number(avgSatisfaction.toFixed(1)),
      careGapClosureRate,
      visitComplianceRate,
      overallQualityScore: overallScore,
      rank: 0, // Will be set after sorting
      trend,
    });
  }

  // Sort by overall score and assign ranks
  providerMetrics.sort((a, b) => b.overallQualityScore - a.overallQualityScore);
  providerMetrics.forEach((p, i) => { p.rank = i + 1; });

  return providerMetrics;
}

/**
 * Update clinical quality metrics
 */
async function updateClinicalQualityMetrics(
  ctx: { prisma: import('@prisma/client').PrismaClient; user: { organizationId: string } },
  assessments: ClinicalQualityAssessment[],
  overallScore: number,
  providerId?: string
): Promise<void> {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Update overall clinical quality metric
  await upsertQualityMetric(ctx, 'CLINICAL_QUALITY_OVERALL', overallScore, periodStart, periodEnd, providerId);

  // Update individual assessment metrics
  for (const assessment of assessments) {
    const metricType: 'OUTCOME_TRACKING' | 'TREATMENT_EFFECTIVENESS' | 'PATIENT_SATISFACTION' | 'CARE_GAP_CLOSURE' | 'VISIT_COMPLIANCE' =
      assessment.criteriaName === 'outcomeTracking' ? 'OUTCOME_TRACKING' :
      assessment.criteriaName === 'treatmentEffectiveness' ? 'TREATMENT_EFFECTIVENESS' :
      assessment.criteriaName === 'patientSatisfaction' ? 'PATIENT_SATISFACTION' :
      assessment.criteriaName === 'careGapClosure' ? 'CARE_GAP_CLOSURE' :
      'VISIT_COMPLIANCE';

    await upsertQualityMetric(ctx, metricType, assessment.metrics.percentage, periodStart, periodEnd, providerId);
  }
}

/**
 * Upsert a quality metric
 */
async function upsertQualityMetric(
  ctx: { prisma: import('@prisma/client').PrismaClient; user: { organizationId: string } },
  metricType: 'CLINICAL_QUALITY_OVERALL' | 'OUTCOME_TRACKING' | 'TREATMENT_EFFECTIVENESS' | 'PATIENT_SATISFACTION' | 'CARE_GAP_CLOSURE' | 'VISIT_COMPLIANCE' | 'PROVIDER_PERFORMANCE',
  score: number,
  periodStart: Date,
  periodEnd: Date,
  providerId?: string
): Promise<void> {
  const existing = await ctx.prisma.qAMetric.findFirst({
    where: {
      organizationId: ctx.user.organizationId,
      metricType,
      period: 'monthly',
      periodStart,
      providerId: providerId || null,
    },
  });

  if (existing) {
    const prevScore = Number(existing.percentage);
    await ctx.prisma.qAMetric.update({
      where: { id: existing.id },
      data: {
        score,
        percentage: score,
        meetsTarget: score >= 80,
        trend: score > prevScore ? 'improving' : score < prevScore ? 'declining' : 'stable',
      },
    });
  } else {
    await ctx.prisma.qAMetric.create({
      data: {
        organizationId: ctx.user.organizationId,
        metricType,
        period: 'monthly',
        periodStart,
        periodEnd,
        score,
        maxScore: 100,
        percentage: score,
        target: 80,
        benchmark: 75,
        meetsTarget: score >= 80,
        providerId,
      },
    });
  }
}

/**
 * Generate clinical quality improvement recommendations
 */
function generateClinicalQualityRecommendations(
  assessments: ClinicalQualityAssessment[],
  overallScore: number,
  criticalCount: number,
  highCount: number
): string[] {
  const recommendations: string[] = [];

  // Sort assessments by score (lowest first)
  const sortedAssessments = [...assessments].sort((a, b) =>
    (a.score / a.maxScore) - (b.score / b.maxScore)
  );

  // Prioritize recommendations based on lowest scoring areas
  const lowestArea = sortedAssessments[0];
  if (lowestArea && (lowestArea.score / lowestArea.maxScore) < 0.7) {
    recommendations.push(`Priority focus: ${lowestArea.criteriaName} - currently scoring ${Math.round((lowestArea.score / lowestArea.maxScore) * 100)}%`);
  }

  // Add area-specific recommendations
  for (const assessment of sortedAssessments.slice(0, 3)) {
    if (!assessment.passed && assessment.recommendations.length > 0) {
      recommendations.push(assessment.recommendations[0]);
    }
  }

  // Overall score-based recommendations
  if (overallScore < 60) {
    recommendations.push('Consider comprehensive quality improvement initiative across all clinical metrics');
    recommendations.push('Schedule team meeting to review clinical quality goals and processes');
  } else if (overallScore < 80) {
    recommendations.push('Focus improvement efforts on the lowest-scoring quality metrics');
  }

  if (criticalCount > 0 || highCount > 0) {
    recommendations.push(`Address ${criticalCount + highCount} high-priority findings to improve quality scores`);
  }

  // Dedup and limit recommendations
  const uniqueRecs = [...new Set(recommendations)];
  return uniqueRecs.slice(0, 7);
}

/**
 * Generate education content for clinical findings
 */
function generateClinicalEducationContent(findingType: string): {
  title: string;
  description: string;
  actionItems: string[];
  resources: string[];
} {
  const educationMap: Record<string, ReturnType<typeof generateClinicalEducationContent>> = {
    'CLINICAL_OUTCOME_TRACKING': {
      title: 'Outcome Assessment Best Practices',
      description: 'Regular outcome assessments are essential for tracking patient progress and demonstrating treatment effectiveness.',
      actionItems: [
        'Administer baseline outcome assessment at initial visit',
        'Re-assess at regular intervals (every 4-6 weeks)',
        'Use appropriate tools for the condition (ODI for lumbar, NDI for cervical)',
        'Document and discuss results with patients',
      ],
      resources: [
        'Oswestry Disability Index (ODI) administration guide',
        'Neck Disability Index (NDI) scoring instructions',
        'NPRS pain scale documentation tips',
      ],
    },
    'CLINICAL_TREATMENT_EFFECTIVENESS': {
      title: 'Improving Treatment Outcomes',
      description: 'Treatment effectiveness is measured by meaningful improvement in patient-reported outcomes and functional status.',
      actionItems: [
        'Review treatment protocols for non-improving patients',
        'Consider additional modalities or referrals for challenging cases',
        'Engage patients in their treatment goals',
        'Track minimum clinically important difference (MCID)',
      ],
      resources: [
        'Evidence-based chiropractic protocols',
        'MCID values for common outcome measures',
        'Treatment modification guidelines',
      ],
    },
    'CLINICAL_PATIENT_SATISFACTION': {
      title: 'Patient Experience Excellence',
      description: 'Patient satisfaction correlates with treatment adherence and outcomes.',
      actionItems: [
        'Communicate clearly about treatment plans and expectations',
        'Address patient concerns promptly',
        'Minimize wait times',
        'Follow up after visits',
      ],
      resources: [
        'Patient communication best practices',
        'Service recovery guidelines',
        'Satisfaction survey implementation guide',
      ],
    },
    'CLINICAL_CARE_GAP': {
      title: 'Care Gap Management',
      description: 'Proactively identifying and closing care gaps improves patient outcomes and practice efficiency.',
      actionItems: [
        'Review care gap reports weekly',
        'Implement patient outreach for overdue follow-ups',
        'Track care gap closure rates by type',
        'Address systemic issues causing gaps',
      ],
      resources: [
        'Care gap identification criteria',
        'Patient outreach templates',
        'Care gap dashboard guide',
      ],
    },
    'CLINICAL_VISIT_COMPLIANCE': {
      title: 'Improving Visit Compliance',
      description: 'Patients who complete recommended visits achieve better outcomes.',
      actionItems: [
        'Discuss importance of treatment plan completion with patients',
        'Send appointment reminders',
        'Follow up on no-shows promptly',
        'Address barriers to care (scheduling, cost)',
      ],
      resources: [
        'Patient engagement strategies',
        'No-show reduction techniques',
        'Flexible scheduling options',
      ],
    },
  };

  return educationMap[findingType] || {
    title: 'Clinical Quality Improvement',
    description: 'Focus on continuous improvement in clinical quality metrics.',
    actionItems: ['Review finding details', 'Implement recommended changes', 'Monitor for improvement'],
    resources: ['Quality improvement framework'],
  };
}

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

// ============================================
// US-350: Compliance monitoring helper functions
// ============================================

// Compliance alert input type
interface ComplianceAlertInput {
  type: 'HIPAA_VIOLATION' | 'BILLING_IRREGULARITY' | 'DOCUMENTATION_GAP' | 'CONSENT_MISSING' | 'AUDIT_TRAIL_GAP' | 'UNUSUAL_PATTERN' | 'POLICY_VIOLATION' | 'CREDENTIAL_EXPIRING' | 'TRAINING_DUE';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  title: string;
  description: string;
  evidence?: string;
  entityType?: string;
  entityId?: string;
  providerId?: string;
  patientId?: string;
  riskLevel?: string;
  riskScore?: number;
  complianceRisk?: boolean;
  financialRisk?: boolean;
  requiredAction?: string;
  actionDueDate?: Date;
}

// Compliance check result interface
interface ComplianceCheckResult {
  score: number;
  findings: Omit<Prisma.QAFindingCreateManyInput, 'auditId'>[];
  alerts: ComplianceAlertInput[];
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
}

// Type for context parameter in compliance functions
type ComplianceContext = {
  prisma: import('@prisma/client').PrismaClient;
  user: { organizationId: string; id: string };
};

/**
 * Perform HIPAA compliance checks
 * Checks for PHI access patterns, disclosure logs, minimum necessary, etc.
 */
async function performHIPAAComplianceChecks(
  ctx: ComplianceContext,
  startDate: Date,
  endDate: Date,
  providerId: string | undefined,
  sampleSize: number
): Promise<ComplianceCheckResult> {
  const findings: Omit<Prisma.QAFindingCreateManyInput, 'auditId'>[] = [];
  const alerts: ComplianceAlertInput[] = [];
  let score = 100;
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;

  // 1. Check for excessive patient record access (break-the-glass scenarios)
  const patientAccessLogs = await ctx.prisma.auditLog.findMany({
    where: {
      organizationId: ctx.user.organizationId,
      entityType: 'Patient',
      action: 'VIEW',
      createdAt: { gte: startDate, lte: endDate },
    },
    take: sampleSize,
  });

  // Group by user to detect excessive access
  const userAccessCounts = new Map<string, { count: number; patients: Set<string> }>();
  for (const log of patientAccessLogs) {
    if (!log.userId) continue;
    const existing = userAccessCounts.get(log.userId) || { count: 0, patients: new Set() };
    existing.count++;
    if (log.entityId) existing.patients.add(log.entityId);
    userAccessCounts.set(log.userId, existing);
  }

  // Flag users with unusually high access
  const averageAccess = patientAccessLogs.length / Math.max(userAccessCounts.size, 1);
  for (const [userId, data] of userAccessCounts) {
    if (data.count > averageAccess * 3 && data.patients.size > 50) {
      score -= 5;
      highCount++;
      alerts.push({
        type: 'HIPAA_VIOLATION',
        severity: 'HIGH',
        title: 'Excessive patient record access detected',
        description: `User accessed ${data.count} patient records (${data.patients.size} unique patients) in the audit period, significantly above average.`,
        entityType: 'User',
        entityId: userId,
        riskLevel: 'high',
        riskScore: 75,
        complianceRisk: true,
        requiredAction: 'Review user access patterns and verify legitimate business need',
      });
      findings.push({
        organizationId: ctx.user.organizationId,
        findingType: 'HIPAA_EXCESSIVE_ACCESS',
        severity: 'HIGH',
        title: 'Excessive patient record access',
        description: `User accessed ${data.count} patient records in audit period`,
        recommendation: 'Review access patterns and implement minimum necessary principle',
        entityType: 'User',
        entityId: userId,
        riskScore: 75,
        complianceImpact: true,
      });
    }
  }

  // 2. Check for PHI exports/downloads
  const exportLogs = await ctx.prisma.auditLog.findMany({
    where: {
      organizationId: ctx.user.organizationId,
      action: { in: ['EXPORT', 'DOWNLOAD', 'PRINT'] },
      createdAt: { gte: startDate, lte: endDate },
    },
  });

  // Flag excessive exports
  const userExportCounts = new Map<string, number>();
  for (const log of exportLogs) {
    if (!log.userId) continue;
    userExportCounts.set(log.userId, (userExportCounts.get(log.userId) || 0) + 1);
  }

  for (const [userId, count] of userExportCounts) {
    if (count > 50) {
      score -= 3;
      mediumCount++;
      alerts.push({
        type: 'HIPAA_VIOLATION',
        severity: 'MEDIUM',
        title: 'High volume of PHI exports',
        description: `User exported/downloaded PHI ${count} times in the audit period.`,
        entityType: 'User',
        entityId: userId,
        riskLevel: 'medium',
        riskScore: 60,
        complianceRisk: true,
        requiredAction: 'Verify export activity is for legitimate purposes',
      });
    }
  }

  // 3. Check for after-hours access
  const afterHoursLogs = await ctx.prisma.auditLog.findMany({
    where: {
      organizationId: ctx.user.organizationId,
      entityType: 'Patient',
      action: 'VIEW',
      createdAt: { gte: startDate, lte: endDate },
    },
    select: {
      id: true,
      userId: true,
      createdAt: true,
      entityId: true,
    },
    take: sampleSize,
  });

  let afterHoursAccessCount = 0;
  for (const log of afterHoursLogs) {
    const hour = log.createdAt.getHours();
    // Flag access between 10pm and 6am
    if (hour >= 22 || hour < 6) {
      afterHoursAccessCount++;
    }
  }

  if (afterHoursAccessCount > sampleSize * 0.1) {
    score -= 2;
    lowCount++;
    findings.push({
      organizationId: ctx.user.organizationId,
      findingType: 'HIPAA_AFTER_HOURS_ACCESS',
      severity: 'LOW',
      title: 'After-hours patient record access',
      description: `${afterHoursAccessCount} patient record accesses occurred outside normal business hours`,
      recommendation: 'Review after-hours access policy and ensure legitimate need',
      riskScore: 30,
      complianceImpact: false,
    });
  }

  // 4. Check for audit log gaps (potential tampering)
  const logsByDay = new Map<string, number>();
  for (const log of patientAccessLogs) {
    const day = log.createdAt.toISOString().split('T')[0];
    logsByDay.set(day, (logsByDay.get(day) || 0) + 1);
  }

  // Check for days with zero logs in the middle of the period
  const days = Array.from(logsByDay.keys()).sort();
  if (days.length >= 2) {
    const startDay = new Date(days[0]);
    const endDay = new Date(days[days.length - 1]);
    const totalDays = Math.ceil((endDay.getTime() - startDay.getTime()) / (24 * 60 * 60 * 1000));
    const missingDays = totalDays - days.length;

    if (missingDays > 5 && totalDays > 10) {
      score -= 10;
      criticalCount++;
      alerts.push({
        type: 'AUDIT_TRAIL_GAP',
        severity: 'CRITICAL',
        title: 'Audit trail gaps detected',
        description: `${missingDays} days with no audit logs detected between ${days[0]} and ${days[days.length - 1]}. This may indicate log tampering or system issues.`,
        riskLevel: 'critical',
        riskScore: 95,
        complianceRisk: true,
        requiredAction: 'Investigate audit log integrity immediately',
      });
    }
  }

  return {
    score: Math.max(0, score),
    findings,
    alerts,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
  };
}

/**
 * Perform billing compliance checks
 * Checks for billing irregularities, duplicate claims, unusual patterns
 */
async function performBillingComplianceChecks(
  ctx: ComplianceContext,
  startDate: Date,
  endDate: Date,
  providerId: string | undefined,
  sampleSize: number
): Promise<ComplianceCheckResult> {
  const findings: Omit<Prisma.QAFindingCreateManyInput, 'auditId'>[] = [];
  const alerts: ComplianceAlertInput[] = [];
  let score = 100;
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;

  // Build where clause
  const whereClause: Prisma.ClaimWhereInput = {
    organizationId: ctx.user.organizationId,
    createdDate: { gte: startDate, lte: endDate },
  };

  if (providerId) {
    whereClause.encounter = { providerId };
  }

  // 1. Check for duplicate claims
  const claims = await ctx.prisma.claim.findMany({
    where: whereClause,
    include: {
      claimLines: true,
      encounter: {
        select: {
          id: true,
          patientId: true,
          providerId: true,
          encounterDate: true,
        },
      },
    },
    take: sampleSize,
  });

  // Group by patient + date + total to find potential duplicates
  const claimSignatures = new Map<string, { claimId: string; patientId: string; date: Date; total: number }[]>();
  for (const claim of claims) {
    if (!claim.encounter) continue;
    const signature = `${claim.encounter.patientId}-${claim.encounter.encounterDate.toISOString().split('T')[0]}-${claim.totalCharges}`;
    const existing = claimSignatures.get(signature) || [];
    existing.push({
      claimId: claim.id,
      patientId: claim.encounter.patientId,
      date: claim.encounter.encounterDate,
      total: Number(claim.totalCharges),
    });
    claimSignatures.set(signature, existing);
  }

  // Flag potential duplicates
  for (const [signature, duplicates] of claimSignatures) {
    if (duplicates.length > 1) {
      score -= 5 * duplicates.length;
      highCount++;
      alerts.push({
        type: 'BILLING_IRREGULARITY',
        severity: 'HIGH',
        title: 'Potential duplicate claims detected',
        description: `${duplicates.length} claims with identical patient, date, and charges found: ${signature}`,
        evidence: JSON.stringify(duplicates.map(d => d.claimId)),
        patientId: duplicates[0].patientId,
        riskLevel: 'high',
        riskScore: 80,
        complianceRisk: true,
        financialRisk: true,
        requiredAction: 'Review claims for duplicate billing',
      });
      findings.push({
        organizationId: ctx.user.organizationId,
        findingType: 'BILLING_DUPLICATE_CLAIM',
        severity: 'HIGH',
        title: 'Potential duplicate claims',
        description: `${duplicates.length} claims appear to be duplicates`,
        recommendation: 'Void duplicate claims and implement duplicate checking',
        patientId: duplicates[0].patientId,
        riskScore: 80,
        complianceImpact: true,
      });
    }
  }

  // 2. Check for unusually high claim amounts
  const claimAmounts = claims.map(c => Number(c.totalCharges)).filter(a => a > 0);
  const avgAmount = claimAmounts.length > 0 ? claimAmounts.reduce((a, b) => a + b, 0) / claimAmounts.length : 0;
  const stdDev = Math.sqrt(claimAmounts.reduce((sum, a) => sum + Math.pow(a - avgAmount, 2), 0) / claimAmounts.length);

  for (const claim of claims) {
    const amount = Number(claim.totalCharges);
    if (amount > avgAmount + 3 * stdDev && amount > 1000) {
      score -= 2;
      mediumCount++;
      findings.push({
        organizationId: ctx.user.organizationId,
        findingType: 'BILLING_UNUSUAL_AMOUNT',
        severity: 'MEDIUM',
        title: 'Unusually high claim amount',
        description: `Claim ${claim.claimNumber || claim.id} has amount $${amount.toFixed(2)}, significantly above average ($${avgAmount.toFixed(2)})`,
        recommendation: 'Review claim for accuracy and appropriate coding',
        entityType: 'Claim',
        entityId: claim.id,
        patientId: claim.encounter?.patientId,
        riskScore: 50,
        complianceImpact: false,
      });
    }
  }

  // 3. Check for claims without proper diagnosis support
  for (const claim of claims) {
    for (const line of claim.claimLines) {
      if (line.diagnosisPointers.length === 0) {
        score -= 1;
        lowCount++;
        findings.push({
          organizationId: ctx.user.organizationId,
          findingType: 'BILLING_NO_DIAGNOSIS',
          severity: 'LOW',
          title: 'Claim line without diagnosis pointer',
          description: `CPT ${line.cptCode} on claim ${claim.claimNumber || claim.id} has no diagnosis pointer`,
          recommendation: 'Add appropriate diagnosis codes to support medical necessity',
          entityType: 'Claim',
          entityId: claim.id,
          riskScore: 30,
          complianceImpact: true,
        });
      }
    }
  }

  // 4. Check denial rates
  const deniedClaims = claims.filter(c => c.status === 'DENIED');
  const denialRate = claims.length > 0 ? (deniedClaims.length / claims.length) * 100 : 0;

  if (denialRate > 15) {
    score -= 10;
    highCount++;
    alerts.push({
      type: 'BILLING_IRREGULARITY',
      severity: 'HIGH',
      title: 'High claim denial rate',
      description: `Denial rate of ${denialRate.toFixed(1)}% exceeds acceptable threshold (15%)`,
      riskLevel: 'high',
      riskScore: 70,
      complianceRisk: true,
      financialRisk: true,
      requiredAction: 'Analyze denial reasons and implement corrective actions',
    });
  } else if (denialRate > 10) {
    score -= 5;
    mediumCount++;
    findings.push({
      organizationId: ctx.user.organizationId,
      findingType: 'BILLING_ELEVATED_DENIALS',
      severity: 'MEDIUM',
      title: 'Elevated claim denial rate',
      description: `Denial rate of ${denialRate.toFixed(1)}% is above target (10%)`,
      recommendation: 'Review denial patterns and implement process improvements',
      riskScore: 50,
      complianceImpact: false,
    });
  }

  return {
    score: Math.max(0, score),
    findings,
    alerts,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
  };
}

/**
 * Perform consent documentation verification
 * Checks for missing consent forms and expired consents
 */
async function performConsentComplianceChecks(
  ctx: ComplianceContext,
  startDate: Date,
  endDate: Date,
  sampleSize: number
): Promise<ComplianceCheckResult> {
  const findings: Omit<Prisma.QAFindingCreateManyInput, 'auditId'>[] = [];
  const alerts: ComplianceAlertInput[] = [];
  let score = 100;
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;

  // 1. Get patients with encounters in the period
  const encounters = await ctx.prisma.encounter.findMany({
    where: {
      organizationId: ctx.user.organizationId,
      encounterDate: { gte: startDate, lte: endDate },
      status: { in: ['COMPLETED', 'SIGNED'] },
    },
    select: {
      id: true,
      patientId: true,
      encounterDate: true,
      encounterType: true,
    },
    take: sampleSize,
  });

  const patientIds = [...new Set(encounters.map(e => e.patientId))];

  // 2. Check for consent form submissions
  // Search for consent-related forms by name pattern
  const consentSubmissions = await ctx.prisma.formSubmission.findMany({
    where: {
      organizationId: ctx.user.organizationId,
      patientId: { in: patientIds },
      template: {
        OR: [
          { name: { contains: 'consent', mode: 'insensitive' } },
          { name: { contains: 'hipaa', mode: 'insensitive' } },
          { name: { contains: 'privacy', mode: 'insensitive' } },
          { name: { contains: 'authorization', mode: 'insensitive' } },
        ],
      },
    },
    include: {
      template: {
        select: { name: true },
      },
    },
  });

  // Group consents by patient
  const patientConsents = new Map<string, { submittedAt: Date; templateName: string }[]>();
  for (const submission of consentSubmissions) {
    if (!submission.patientId) continue;
    const existing = patientConsents.get(submission.patientId) || [];
    existing.push({
      submittedAt: submission.submittedAt || submission.createdAt,
      templateName: submission.template?.name || 'Unknown Form',
    });
    patientConsents.set(submission.patientId, existing);
  }

  // 3. Check each patient for consent compliance
  let patientsWithoutConsent = 0;
  let patientsWithExpiredConsent = 0;

  for (const patientId of patientIds) {
    const consents = patientConsents.get(patientId) || [];

    if (consents.length === 0) {
      patientsWithoutConsent++;
    } else {
      // Check if consent is older than 12 months (typical annual requirement)
      const latestConsent = consents.sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())[0];
      const consentAge = (new Date().getTime() - latestConsent.submittedAt.getTime()) / (1000 * 60 * 60 * 24 * 365);

      if (consentAge > 1) {
        patientsWithExpiredConsent++;
      }
    }
  }

  // 4. Generate findings and alerts based on consent issues
  const consentRate = patientIds.length > 0 ? ((patientIds.length - patientsWithoutConsent) / patientIds.length) * 100 : 100;

  if (patientsWithoutConsent > 0) {
    const percentage = (patientsWithoutConsent / patientIds.length) * 100;

    if (percentage > 20) {
      score -= 20;
      criticalCount++;
      alerts.push({
        type: 'CONSENT_MISSING',
        severity: 'CRITICAL',
        title: 'High rate of missing consent forms',
        description: `${patientsWithoutConsent} patients (${percentage.toFixed(1)}%) with recent encounters have no consent documentation on file.`,
        riskLevel: 'critical',
        riskScore: 90,
        complianceRisk: true,
        requiredAction: 'Immediately implement consent collection process for all patients',
      });
    } else if (percentage > 10) {
      score -= 10;
      highCount++;
      alerts.push({
        type: 'CONSENT_MISSING',
        severity: 'HIGH',
        title: 'Elevated missing consent rate',
        description: `${patientsWithoutConsent} patients (${percentage.toFixed(1)}%) missing consent forms`,
        riskLevel: 'high',
        riskScore: 70,
        complianceRisk: true,
        requiredAction: 'Collect consent forms from patients without documentation',
      });
    } else {
      score -= 5;
      mediumCount++;
      findings.push({
        organizationId: ctx.user.organizationId,
        findingType: 'CONSENT_MISSING',
        severity: 'MEDIUM',
        title: 'Some patients missing consent forms',
        description: `${patientsWithoutConsent} patients without consent documentation`,
        recommendation: 'Review and collect missing consent forms',
        riskScore: 50,
        complianceImpact: true,
      });
    }
  }

  if (patientsWithExpiredConsent > 0) {
    const percentage = (patientsWithExpiredConsent / patientIds.length) * 100;
    score -= Math.min(15, percentage * 0.5);
    mediumCount++;
    findings.push({
      organizationId: ctx.user.organizationId,
      findingType: 'CONSENT_EXPIRED',
      severity: 'MEDIUM',
      title: 'Expired consent forms',
      description: `${patientsWithExpiredConsent} patients (${percentage.toFixed(1)}%) have consent forms older than 12 months`,
      recommendation: 'Implement annual consent renewal process',
      riskScore: 45,
      complianceImpact: true,
    });
  }

  // 5. Check telehealth consent for telehealth sessions (if applicable)
  // Query for telehealth sessions in the period via the appointment relationship
  const telehealthSessions = await ctx.prisma.telehealthSession.findMany({
    where: {
      organizationId: ctx.user.organizationId,
      scheduledStartTime: { gte: startDate, lte: endDate },
      status: { in: ['COMPLETED', 'IN_PROGRESS'] },
    },
    include: {
      appointment: {
        select: {
          patientId: true,
        },
      },
    },
  });

  const telehealthPatientIds = [...new Set(telehealthSessions.map(s => s.appointment.patientId))];

  if (telehealthPatientIds.length > 0) {
    const telehealthConsents = await ctx.prisma.telehealthConsent.findMany({
      where: {
        organizationId: ctx.user.organizationId,
        patientId: { in: telehealthPatientIds },
        status: 'SIGNED',
      },
    });

    const consentedPatients = new Set(telehealthConsents.map(c => c.patientId));
    const missingTelehealthConsent = telehealthPatientIds.filter(p => !consentedPatients.has(p));

    if (missingTelehealthConsent.length > 0) {
      score -= 10;
      highCount++;
      alerts.push({
        type: 'CONSENT_MISSING',
        severity: 'HIGH',
        title: 'Missing telehealth consent',
        description: `${missingTelehealthConsent.length} patients had telehealth sessions without telehealth-specific consent`,
        riskLevel: 'high',
        riskScore: 75,
        complianceRisk: true,
        requiredAction: 'Collect telehealth consent before providing virtual care',
      });
    }
  }

  return {
    score: Math.max(0, score),
    findings,
    alerts,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
  };
}

/**
 * Perform audit trail completeness checks
 */
async function performAuditTrailChecks(
  ctx: ComplianceContext,
  startDate: Date,
  endDate: Date,
  sampleSize: number
): Promise<ComplianceCheckResult> {
  const findings: Omit<Prisma.QAFindingCreateManyInput, 'auditId'>[] = [];
  const alerts: ComplianceAlertInput[] = [];
  let score = 100;
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;

  // 1. Check audit log coverage for key actions
  const expectedEntityTypes = ['Patient', 'Encounter', 'Claim', 'Payment', 'User'];
  const logCounts = await ctx.prisma.auditLog.groupBy({
    by: ['entityType'],
    where: {
      organizationId: ctx.user.organizationId,
      createdAt: { gte: startDate, lte: endDate },
    },
    _count: true,
  });

  const logCountMap = new Map(logCounts.map(l => [l.entityType, l._count]));

  // Check for entity types with no logs
  const missingEntityTypes = expectedEntityTypes.filter(t => !logCountMap.has(t) || logCountMap.get(t)! < 10);

  if (missingEntityTypes.length > 0) {
    score -= missingEntityTypes.length * 5;
    highCount++;
    findings.push({
      organizationId: ctx.user.organizationId,
      findingType: 'AUDIT_TRAIL_INCOMPLETE',
      severity: 'HIGH',
      title: 'Incomplete audit trail coverage',
      description: `Missing or minimal audit logs for: ${missingEntityTypes.join(', ')}`,
      recommendation: 'Verify audit logging is enabled for all entity types',
      riskScore: 70,
      complianceImpact: true,
    });
  }

  // 2. Check for audit log modifications (should never happen)
  const auditLogModifications = await ctx.prisma.auditLog.findMany({
    where: {
      organizationId: ctx.user.organizationId,
      entityType: 'AuditLog',
      action: { in: ['UPDATE', 'DELETE'] },
      createdAt: { gte: startDate, lte: endDate },
    },
  });

  if (auditLogModifications.length > 0) {
    score -= 30;
    criticalCount++;
    alerts.push({
      type: 'AUDIT_TRAIL_GAP',
      severity: 'CRITICAL',
      title: 'Audit log tampering detected',
      description: `${auditLogModifications.length} audit log modification attempts detected. Audit logs should be immutable.`,
      evidence: JSON.stringify(auditLogModifications.slice(0, 5).map(l => ({ id: l.id, action: l.action, date: l.createdAt }))),
      riskLevel: 'critical',
      riskScore: 100,
      complianceRisk: true,
      requiredAction: 'Investigate immediately - potential compliance breach',
    });
  }

  // 3. Check for login/logout tracking
  const authLogs = await ctx.prisma.auditLog.count({
    where: {
      organizationId: ctx.user.organizationId,
      action: { in: ['LOGIN', 'LOGOUT'] },
      createdAt: { gte: startDate, lte: endDate },
    },
  });

  const activeSessions = await ctx.prisma.userSession.count({
    where: {
      user: { organizationId: ctx.user.organizationId },
      createdAt: { gte: startDate, lte: endDate },
    },
  });

  if (authLogs < activeSessions * 0.5) {
    score -= 10;
    mediumCount++;
    findings.push({
      organizationId: ctx.user.organizationId,
      findingType: 'AUDIT_TRAIL_AUTH_GAP',
      severity: 'MEDIUM',
      title: 'Incomplete authentication logging',
      description: 'Login/logout events may not be fully captured in audit logs',
      recommendation: 'Review authentication logging configuration',
      riskScore: 55,
      complianceImpact: true,
    });
  }

  // 4. Check for PHI access logging
  const phiAccessLogs = await ctx.prisma.auditLog.count({
    where: {
      organizationId: ctx.user.organizationId,
      entityType: 'Patient',
      createdAt: { gte: startDate, lte: endDate },
    },
  });

  const totalPatientViews = await ctx.prisma.encounter.count({
    where: {
      organizationId: ctx.user.organizationId,
      encounterDate: { gte: startDate, lte: endDate },
    },
  });

  // We should have more access logs than encounters (multiple views per encounter)
  if (phiAccessLogs < totalPatientViews) {
    score -= 5;
    lowCount++;
    findings.push({
      organizationId: ctx.user.organizationId,
      findingType: 'AUDIT_TRAIL_PHI_GAP',
      severity: 'LOW',
      title: 'PHI access logging may be incomplete',
      description: `Only ${phiAccessLogs} patient access logs for ${totalPatientViews} encounters`,
      recommendation: 'Verify all patient data access is being logged',
      riskScore: 35,
      complianceImpact: true,
    });
  }

  // 5. Check for timestamp consistency
  const recentLogs = await ctx.prisma.auditLog.findMany({
    where: {
      organizationId: ctx.user.organizationId,
      createdAt: { gte: startDate, lte: endDate },
    },
    orderBy: { createdAt: 'asc' },
    take: sampleSize,
    select: { createdAt: true },
  });

  // Check for suspicious timestamp patterns (logs out of order or identical timestamps)
  let identicalTimestamps = 0;
  for (let i = 1; i < recentLogs.length; i++) {
    if (recentLogs[i].createdAt.getTime() === recentLogs[i - 1].createdAt.getTime()) {
      identicalTimestamps++;
    }
  }

  if (identicalTimestamps > sampleSize * 0.3) {
    score -= 5;
    lowCount++;
    findings.push({
      organizationId: ctx.user.organizationId,
      findingType: 'AUDIT_TRAIL_TIMESTAMP_ISSUE',
      severity: 'LOW',
      title: 'Audit log timestamp anomaly',
      description: `High number of identical timestamps (${identicalTimestamps}) may indicate logging issues`,
      recommendation: 'Review audit logging timestamp precision',
      riskScore: 25,
      complianceImpact: false,
    });
  }

  return {
    score: Math.max(0, score),
    findings,
    alerts,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
  };
}

/**
 * Detect unusual patterns in the system
 */
async function performUnusualPatternDetection(
  ctx: ComplianceContext,
  startDate: Date,
  endDate: Date,
  providerId: string | undefined
): Promise<ComplianceCheckResult> {
  const findings: Omit<Prisma.QAFindingCreateManyInput, 'auditId'>[] = [];
  const alerts: ComplianceAlertInput[] = [];
  let score = 100;
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;

  // 1. Check for unusual appointment patterns
  const whereClause: Prisma.AppointmentWhereInput = {
    organizationId: ctx.user.organizationId,
    startTime: { gte: startDate, lte: endDate },
    status: 'COMPLETED',
  };

  if (providerId) {
    whereClause.providerId = providerId;
  }

  const appointments = await ctx.prisma.appointment.findMany({
    where: whereClause,
    select: {
      id: true,
      providerId: true,
      patientId: true,
      startTime: true,
      endTime: true,
    },
  });

  // Group appointments by provider and date
  const providerDailyCounts = new Map<string, Map<string, number>>();
  for (const appt of appointments) {
    const day = appt.startTime.toISOString().split('T')[0];
    const providerId = appt.providerId;

    if (!providerDailyCounts.has(providerId)) {
      providerDailyCounts.set(providerId, new Map());
    }
    const dailyMap = providerDailyCounts.get(providerId)!;
    dailyMap.set(day, (dailyMap.get(day) || 0) + 1);
  }

  // Check for unusually high daily volumes
  for (const [pid, dailyMap] of providerDailyCounts) {
    const counts = Array.from(dailyMap.values());
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    const max = Math.max(...counts);

    if (max > avg * 2 && max > 30) {
      score -= 3;
      mediumCount++;
      findings.push({
        organizationId: ctx.user.organizationId,
        findingType: 'PATTERN_HIGH_VOLUME',
        severity: 'MEDIUM',
        title: 'Unusually high appointment volume',
        description: `Provider had ${max} appointments on a single day (average: ${avg.toFixed(1)})`,
        recommendation: 'Review scheduling patterns for this provider',
        providerId: pid,
        riskScore: 45,
        complianceImpact: false,
      });
    }
  }

  // 2. Check for same-day visit patterns (potential upcoding indicator)
  const patientDailyVisits = new Map<string, Map<string, number>>();
  for (const appt of appointments) {
    const day = appt.startTime.toISOString().split('T')[0];
    const key = `${appt.patientId}-${day}`;

    if (!patientDailyVisits.has(key)) {
      patientDailyVisits.set(key, new Map());
    }
    patientDailyVisits.get(key)!.set(appt.id, 1);
  }

  let multipleVisits = 0;
  for (const [, visits] of patientDailyVisits) {
    if (visits.size > 2) {
      multipleVisits++;
    }
  }

  if (multipleVisits > appointments.length * 0.05) {
    score -= 5;
    mediumCount++;
    findings.push({
      organizationId: ctx.user.organizationId,
      findingType: 'PATTERN_MULTIPLE_SAME_DAY',
      severity: 'MEDIUM',
      title: 'Frequent same-day multiple visits',
      description: `${multipleVisits} instances of patients with 3+ visits on the same day`,
      recommendation: 'Review same-day visit patterns for appropriateness',
      riskScore: 50,
      complianceImpact: true,
    });
  }

  // 3. Check for unusual billing patterns
  const claims = await ctx.prisma.claim.findMany({
    where: {
      organizationId: ctx.user.organizationId,
      createdDate: { gte: startDate, lte: endDate },
    },
    include: {
      claimLines: true,
      encounter: {
        select: { providerId: true },
      },
    },
  });

  // Check for high manipulation code usage
  const manipulationByProvider = new Map<string, number>();
  const totalClaimsByProvider = new Map<string, number>();

  for (const claim of claims) {
    const pid = claim.encounter?.providerId;
    if (!pid) continue;

    totalClaimsByProvider.set(pid, (totalClaimsByProvider.get(pid) || 0) + 1);

    const hasManipulation = claim.claimLines.some(l =>
      ['98940', '98941', '98942', '98943'].includes(l.cptCode)
    );
    if (hasManipulation) {
      manipulationByProvider.set(pid, (manipulationByProvider.get(pid) || 0) + 1);
    }
  }

  // Flag providers with 100% manipulation (no other services)
  for (const [pid, manipCount] of manipulationByProvider) {
    const totalCount = totalClaimsByProvider.get(pid) || 1;
    const manipRate = manipCount / totalCount;

    if (manipRate === 1 && totalCount > 20) {
      score -= 3;
      lowCount++;
      findings.push({
        organizationId: ctx.user.organizationId,
        findingType: 'PATTERN_MANIPULATION_ONLY',
        severity: 'LOW',
        title: 'Provider billing only manipulation codes',
        description: `Provider has ${totalCount} claims with 100% manipulation services`,
        recommendation: 'Review service mix - may indicate limited scope or coding issue',
        providerId: pid,
        riskScore: 30,
        complianceImpact: false,
      });
    }
  }

  // 4. Check for weekend/holiday appointments (unusual for chiropractic)
  const weekendAppointments = appointments.filter(a => {
    const day = a.startTime.getDay();
    return day === 0 || day === 6;
  });

  if (weekendAppointments.length > appointments.length * 0.15) {
    score -= 2;
    lowCount++;
    findings.push({
      organizationId: ctx.user.organizationId,
      findingType: 'PATTERN_WEEKEND_APPOINTMENTS',
      severity: 'LOW',
      title: 'High weekend appointment volume',
      description: `${weekendAppointments.length} appointments (${((weekendAppointments.length / appointments.length) * 100).toFixed(1)}%) scheduled on weekends`,
      recommendation: 'Review weekend scheduling patterns',
      riskScore: 20,
      complianceImpact: false,
    });
  }

  // 5. Check for unusual payment patterns
  const payments = await ctx.prisma.payment.findMany({
    where: {
      organizationId: ctx.user.organizationId,
      paymentDate: { gte: startDate, lte: endDate },
    },
    select: {
      id: true,
      amount: true,
      paymentMethod: true,
    },
  });

  // Check for round number payments (may indicate estimating)
  const roundPayments = payments.filter(p => Number(p.amount) % 100 === 0 && Number(p.amount) > 0);
  if (roundPayments.length > payments.length * 0.3 && payments.length > 50) {
    score -= 2;
    lowCount++;
    findings.push({
      organizationId: ctx.user.organizationId,
      findingType: 'PATTERN_ROUND_PAYMENTS',
      severity: 'LOW',
      title: 'High rate of round-number payments',
      description: `${((roundPayments.length / payments.length) * 100).toFixed(1)}% of payments are round numbers`,
      recommendation: 'Review payment posting accuracy',
      riskScore: 20,
      complianceImpact: false,
    });
  }

  return {
    score: Math.max(0, score),
    findings,
    alerts,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
  };
}

/**
 * Update compliance metrics
 */
async function updateComplianceMetrics(
  ctx: ComplianceContext,
  score: number,
  sampleSize: number,
  scope: string
): Promise<void> {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Determine metric type based on scope
  const metricType = scope === 'full' ? 'COMPLIANCE_OVERALL' :
    scope === 'hipaa' ? 'COMPLIANCE_HIPAA' :
    scope === 'billing' ? 'COMPLIANCE_BILLING' :
    scope === 'consent' ? 'COMPLIANCE_CONSENT' :
    scope === 'audit_trail' ? 'COMPLIANCE_AUDIT_TRAIL' :
    'COMPLIANCE_OVERALL';

  const existingMetric = await ctx.prisma.qAMetric.findFirst({
    where: {
      organizationId: ctx.user.organizationId,
      metricType,
      period: 'monthly',
      periodStart,
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
        meetsTarget: newScore >= 85,
        trend: newScore > Number(existingMetric.percentage) ? 'improving' :
               newScore < Number(existingMetric.percentage) ? 'declining' : 'stable',
      },
    });
  } else {
    await ctx.prisma.qAMetric.create({
      data: {
        organizationId: ctx.user.organizationId,
        metricType,
        period: 'monthly',
        periodStart,
        periodEnd,
        score,
        maxScore: 100,
        percentage: score,
        sampleSize,
        target: 85,
        benchmark: 80,
        meetsTarget: score >= 85,
      },
    });
  }
}

// ============================================
// US-351: Clinical quality measures
// ============================================

// Clinical quality criteria weights
const clinicalQualityCriteria: QualityCriteria[] = [
  { name: 'outcomeTracking', weight: 25, description: 'Regular outcome assessments completed' },
  { name: 'treatmentEffectiveness', weight: 25, description: 'Patients showing measurable improvement' },
  { name: 'patientSatisfaction', weight: 15, description: 'Patient satisfaction scores' },
  { name: 'careGapClosure', weight: 20, description: 'Care gaps resolved timely' },
  { name: 'visitCompliance', weight: 15, description: 'Patients completing recommended visits' },
];

// Clinical quality assessment interface
interface ClinicalQualityAssessment {
  criteriaName: string;
  score: number;
  maxScore: number;
  passed: boolean;
  metrics: {
    measured: number;
    target: number;
    percentage: number;
  };
  findings: string[];
  recommendations: string[];
}

// Provider performance metrics interface
interface ProviderPerformanceMetrics {
  providerId: string;
  providerName: string;
  totalPatients: number;
  activePatients: number;
  completedTreatmentPlans: number;
  avgOutcomeImprovement: number;
  avgSatisfactionScore: number;
  careGapClosureRate: number;
  visitComplianceRate: number;
  overallQualityScore: number;
  rank: number;
  trend: string;
}

// Benchmark data for clinical quality
const clinicalBenchmarks = {
  outcomeAssessmentRate: 80, // % of patients with outcome assessments
  improvementRate: 70, // % of patients showing improvement
  satisfactionScore: 4.0, // Average satisfaction (1-5)
  careGapClosureRate: 85, // % of care gaps resolved
  visitComplianceRate: 75, // % of recommended visits completed
};

/**
 * Generate compliance recommendations
 */
function generateComplianceRecommendations(
  alerts: ComplianceAlertInput[],
  findingsCount: number,
  score: number
): string[] {
  const recommendations: string[] = [];

  // Count alerts by type
  const alertsByType = new Map<string, number>();
  for (const alert of alerts) {
    alertsByType.set(alert.type, (alertsByType.get(alert.type) || 0) + 1);
  }

  // Critical alerts
  const criticalAlerts = alerts.filter(a => a.severity === 'CRITICAL');
  if (criticalAlerts.length > 0) {
    recommendations.push(`URGENT: Address ${criticalAlerts.length} critical compliance issue(s) immediately`);
  }

  // HIPAA issues
  if (alertsByType.has('HIPAA_VIOLATION')) {
    recommendations.push('Review HIPAA policies and conduct refresher training on PHI handling');
  }

  // Billing issues
  if (alertsByType.has('BILLING_IRREGULARITY')) {
    recommendations.push('Implement pre-submission claim review process to catch billing issues');
  }

  // Consent issues
  if (alertsByType.has('CONSENT_MISSING')) {
    recommendations.push('Implement systematic consent collection at patient check-in');
  }

  // Audit trail issues
  if (alertsByType.has('AUDIT_TRAIL_GAP')) {
    recommendations.push('Review and enhance audit logging configuration');
  }

  // Pattern issues
  if (alertsByType.has('UNUSUAL_PATTERN')) {
    recommendations.push('Conduct targeted review of unusual activity patterns');
  }

  // Overall score-based recommendations
  if (score < 70) {
    recommendations.push('Schedule comprehensive compliance training for all staff');
    recommendations.push('Consider engaging external compliance consultant for review');
  } else if (score < 85) {
    recommendations.push('Focus on addressing high-priority findings to improve compliance score');
  }

  if (findingsCount > 20) {
    recommendations.push('Create an action plan with prioritized remediation steps');
  }

  return recommendations;
}

export type AIQARouter = typeof aiQARouter;
