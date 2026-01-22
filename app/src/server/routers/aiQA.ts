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

        // 1. Completeness Assessment
        const completenessAssessment = assessCompleteness(encounter);
        assessments.push(completenessAssessment);
        encounterScore += completenessAssessment.score;
        maxPossibleScore += completenessAssessment.maxScore;

        // 2. Medical Necessity Assessment
        const medicalNecessityAssessment = assessMedicalNecessity(encounter);
        assessments.push(medicalNecessityAssessment);
        encounterScore += medicalNecessityAssessment.score;
        maxPossibleScore += medicalNecessityAssessment.maxScore;

        // 3. Diagnosis-Procedure Linkage Assessment
        const diagnosisLinkageAssessment = assessDiagnosisLinkage(encounter);
        assessments.push(diagnosisLinkageAssessment);
        encounterScore += diagnosisLinkageAssessment.score;
        maxPossibleScore += diagnosisLinkageAssessment.maxScore;

        // 4. Progress Note Adequacy Assessment
        const progressNoteAssessment = assessProgressNoteAdequacy(encounter);
        assessments.push(progressNoteAssessment);
        encounterScore += progressNoteAssessment.score;
        maxPossibleScore += progressNoteAssessment.maxScore;

        // 5. Treatment Plan Documentation Assessment
        const treatmentPlanAssessment = assessTreatmentPlanDocumentation(encounter);
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
                ...finding,
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
  diagnoses: { id: string; code: string; description: string | null }[];
  procedures: { id: string; code: string; description: string | null }[];
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
      assessmentLower.includes(d.code.toLowerCase()) ||
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

export type AIQARouter = typeof aiQARouter;
