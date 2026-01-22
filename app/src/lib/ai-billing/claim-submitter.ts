/**
 * Epic 31: AI Billing Agent - Claim Submitter
 *
 * US-308: Autonomous claim submission
 *
 * AI agent that automatically submits clean claims with:
 * - Pre-submission validation and scrubbing
 * - Auto-correction of common errors
 * - Optimized code selection for reimbursement
 * - Batch submission scheduling
 * - Submission success rate tracking
 * - Configurable auto-submit rules
 */

import type { PrismaClient, Claim, BillingTaskType, BillingTaskStatus, Prisma } from '@prisma/client';
import { ClaimScrubber } from './claim-scrubber';
import type { ClaimScrubOutput } from './types';

// ============================================
// Types
// ============================================

export interface ClaimSubmissionInput {
  claimIds?: string[];
  autoSelectClaims?: boolean;
  maxClaims?: number;
  minScore?: number;
  autoCorrect?: boolean;
  dryRun?: boolean;
}

export interface ClaimSubmissionResult {
  claimId: string;
  claimNumber: string;
  status: 'submitted' | 'corrected_and_submitted' | 'pending_review' | 'failed' | 'skipped';
  scrubScore?: number;
  corrections?: ClaimCorrection[];
  errors?: string[];
  warnings?: string[];
  submissionMethod?: string;
  batchId?: string;
}

export interface ClaimCorrection {
  field: string;
  originalValue: string | number | null;
  correctedValue: string | number;
  reason: string;
  automatic: boolean;
}

export interface SubmitClaimsOutput {
  submitted: number;
  correctedAndSubmitted: number;
  pendingReview: number;
  failed: number;
  skipped: number;
  results: ClaimSubmissionResult[];
  batchId: string;
  processingTimeMs: number;
  successRate: number;
}

export interface AutoSubmitRule {
  id: string;
  name: string;
  conditions: RuleCondition[];
  enabled: boolean;
  priority: number;
  minScore: number;
  maxClaimsPerRun: number;
  scheduleCron?: string;
}

export interface RuleCondition {
  field: string;
  operator: 'equals' | 'notEquals' | 'contains' | 'greaterThan' | 'lessThan' | 'in' | 'notIn';
  value: string | number | string[] | number[];
}

export interface SubmissionStats {
  totalSubmitted: number;
  acceptedCount: number;
  rejectedCount: number;
  pendingCount: number;
  successRate: number;
  averageScore: number;
  byPayer: Array<{
    payerId: string;
    payerName: string;
    submitted: number;
    accepted: number;
    rejected: number;
    successRate: number;
  }>;
  byTimeframe: Array<{
    date: string;
    submitted: number;
    accepted: number;
    rejected: number;
  }>;
}

// ============================================
// Common Error Auto-Corrections
// ============================================

interface CorrectionContext {
  claim: ClaimWithRelations;
  line?: ClaimLineWithCharge;
}

type ClaimWithRelations = Claim & {
  patient: { demographics: { firstName: string; lastName: string; dateOfBirth: Date; gender: string } | null } | null;
  insurancePolicy: { subscriberId: string; groupNumber: string | null } | null;
  payer: { name: string; payerId: string } | null;
  claimLines: ClaimLineWithCharge[];
  organization: { name: string; npiNumber: string | null } | null;
};

type ClaimLineWithCharge = {
  id: string;
  lineNumber: number;
  cptCode: string;
  modifiers: string[];
  diagnosisPointers: number[];
  units: number;
  chargedAmount: number;
  placeOfService: string | null;
  charge: { description: string } | null;
};

interface CorrectionRule {
  code: string;
  field: string;
  check: (value: unknown, context: CorrectionContext) => boolean;
  correction: (value: unknown, context: CorrectionContext) => unknown;
  reason: string;
}

const AUTO_CORRECTION_RULES: CorrectionRule[] = [
  // Fix missing place of service (default to office - 11)
  {
    code: 'POS_001',
    field: 'placeOfService',
    check: (v: unknown) => !v || v === '',
    correction: () => '11',
    reason: 'Default place of service set to Office (11)',
  },
  // Standardize modifier format (uppercase, no spaces)
  {
    code: 'MOD_001',
    field: 'modifiers',
    check: (v: unknown) => Array.isArray(v) && v.some((m: string) => m !== m.toUpperCase().trim()),
    correction: (v: unknown) => (v as string[]).map((m: string) => m.toUpperCase().trim()),
    reason: 'Modifiers standardized to uppercase',
  },
  // Add AT modifier to CMT codes if missing
  {
    code: 'CHI_AT_001',
    field: 'modifiers',
    check: (v: unknown, ctx: CorrectionContext) => {
      const cmtCodes = ['98940', '98941', '98942', '98943'];
      const line = ctx.line;
      if (!line) return false;
      return cmtCodes.includes(line.cptCode) && !(v as string[]).includes('AT');
    },
    correction: (v: unknown) => [...(v as string[]), 'AT'],
    reason: 'Added AT modifier for active chiropractic treatment',
  },
  // Add modifier 25 to E/M with CMT on same day
  {
    code: 'CHI_25_001',
    field: 'modifiers',
    check: (v: unknown, ctx: CorrectionContext) => {
      const emCodes = ['99201', '99202', '99203', '99204', '99205', '99211', '99212', '99213', '99214', '99215'];
      const cmtCodes = ['98940', '98941', '98942', '98943'];
      const line = ctx.line;
      if (!line) return false;

      const hasCmtOnClaim = ctx.claim.claimLines.some(l => cmtCodes.includes(l.cptCode));
      return emCodes.includes(line.cptCode) && hasCmtOnClaim && !(v as string[]).includes('25');
    },
    correction: (v: unknown) => [...(v as string[]), '25'],
    reason: 'Added modifier 25 for separately identifiable E/M with CMT',
  },
  // Fix diagnosis pointers (ensure they start from 1, not 0)
  {
    code: 'DX_PTR_001',
    field: 'diagnosisPointers',
    check: (v: unknown) => Array.isArray(v) && v.some((p: number) => p === 0),
    correction: (v: unknown) => (v as number[]).map((p: number) => p === 0 ? 1 : p),
    reason: 'Corrected diagnosis pointers to use 1-based indexing',
  },
  // Set units to 1 if missing or 0
  {
    code: 'UNIT_001',
    field: 'units',
    check: (v: unknown) => !v || v === 0,
    correction: () => 1,
    reason: 'Set units to 1 (minimum required)',
  },
];

// ============================================
// ClaimSubmitter Class
// ============================================

export class ClaimSubmitter {
  private prisma: PrismaClient;
  private organizationId: string;
  private scrubber: ClaimScrubber;

  constructor(prisma: PrismaClient, organizationId: string) {
    this.prisma = prisma;
    this.organizationId = organizationId;
    this.scrubber = new ClaimScrubber(prisma);
  }

  /**
   * Submit claims automatically with validation and optional auto-correction
   */
  async submitClaims(input: ClaimSubmissionInput): Promise<SubmitClaimsOutput> {
    const startTime = Date.now();
    const batchId = `BATCH-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Get claims to process
    let claimIds = input.claimIds || [];

    if (input.autoSelectClaims || claimIds.length === 0) {
      claimIds = await this.selectClaimsForSubmission(input.maxClaims || 50, input.minScore);
    }

    const results: ClaimSubmissionResult[] = [];
    let submitted = 0;
    let correctedAndSubmitted = 0;
    let pendingReview = 0;
    let failed = 0;
    let skipped = 0;

    // Process each claim
    for (const claimId of claimIds) {
      const result = await this.processClaim(claimId, {
        autoCorrect: input.autoCorrect ?? true,
        dryRun: input.dryRun ?? false,
        batchId,
      });

      results.push(result);

      switch (result.status) {
        case 'submitted':
          submitted++;
          break;
        case 'corrected_and_submitted':
          correctedAndSubmitted++;
          break;
        case 'pending_review':
          pendingReview++;
          break;
        case 'failed':
          failed++;
          break;
        case 'skipped':
          skipped++;
          break;
      }

      // Create AI billing task record
      await this.createTaskRecord(claimId, result, batchId);
    }

    // Update metrics
    await this.updateMetrics({
      submitted: submitted + correctedAndSubmitted,
      failed,
      skipped,
      pendingReview,
    });

    const totalProcessed = submitted + correctedAndSubmitted + failed;
    const successRate = totalProcessed > 0
      ? ((submitted + correctedAndSubmitted) / totalProcessed) * 100
      : 0;

    return {
      submitted,
      correctedAndSubmitted,
      pendingReview,
      failed,
      skipped,
      results,
      batchId,
      processingTimeMs: Date.now() - startTime,
      successRate: Math.round(successRate * 100) / 100,
    };
  }

  /**
   * Process a single claim for submission
   */
  private async processClaim(
    claimId: string,
    options: { autoCorrect: boolean; dryRun: boolean; batchId: string }
  ): Promise<ClaimSubmissionResult> {
    // Fetch claim with all relations
    const claim = await this.prisma.claim.findFirst({
      where: {
        id: claimId,
        organizationId: this.organizationId,
      },
      include: {
        patient: {
          include: { demographics: true },
        },
        insurancePolicy: true,
        payer: true,
        claimLines: {
          include: { charge: true },
        },
        organization: true,
      },
    }) as ClaimWithRelations | null;

    if (!claim) {
      return {
        claimId,
        claimNumber: 'UNKNOWN',
        status: 'failed',
        errors: ['Claim not found'],
      };
    }

    // Check claim is in submittable state
    if (!['DRAFT', 'READY'].includes(claim.status)) {
      return {
        claimId,
        claimNumber: claim.claimNumber || 'PENDING',
        status: 'skipped',
        errors: [`Claim status ${claim.status} is not submittable`],
      };
    }

    // Scrub the claim
    let scrubResult: ClaimScrubOutput;
    try {
      scrubResult = await this.scrubber.scrubClaim({
        claimId,
        includeWarnings: true,
        checkHistorical: false,
      });
    } catch (error) {
      return {
        claimId,
        claimNumber: claim.claimNumber || 'PENDING',
        status: 'failed',
        errors: [`Scrub failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      };
    }

    const corrections: ClaimCorrection[] = [];

    // Attempt auto-corrections if enabled and needed
    if (options.autoCorrect && scrubResult.status !== 'PASSED') {
      const correctionResults = await this.applyAutoCorrections(claim);
      corrections.push(...correctionResults);

      // Re-scrub after corrections
      if (corrections.length > 0) {
        try {
          scrubResult = await this.scrubber.scrubClaim({
            claimId,
            includeWarnings: true,
            checkHistorical: false,
          });
        } catch {
          // Use original scrub result if re-scrub fails
        }
      }
    }

    // Determine if claim can be submitted
    const hasErrors = scrubResult.issues.some(i => i.severity === 'ERROR');
    const warnings = scrubResult.issues
      .filter(i => i.severity === 'WARNING')
      .map(i => i.message);

    if (hasErrors) {
      return {
        claimId,
        claimNumber: claim.claimNumber || 'PENDING',
        status: 'pending_review',
        scrubScore: scrubResult.overallScore,
        corrections: corrections.length > 0 ? corrections : undefined,
        errors: scrubResult.issues.filter(i => i.severity === 'ERROR').map(i => i.message),
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    }

    // Submit the claim if not a dry run
    if (!options.dryRun) {
      try {
        await this.prisma.claim.update({
          where: { id: claimId },
          data: {
            status: 'SUBMITTED',
            submittedDate: new Date(),
            submissionMethod: 'electronic',
            batchId: options.batchId,
          },
        });

        // Create submission note
        await this.prisma.claimNote.create({
          data: {
            claimId,
            noteType: 'ai_submission',
            note: `AI Agent auto-submitted claim. Scrub score: ${scrubResult.overallScore}/100. ${corrections.length > 0 ? `${corrections.length} auto-correction(s) applied.` : 'No corrections needed.'}`,
            userId: 'SYSTEM',
          },
        });
      } catch (error) {
        return {
          claimId,
          claimNumber: claim.claimNumber || 'PENDING',
          status: 'failed',
          scrubScore: scrubResult.overallScore,
          corrections: corrections.length > 0 ? corrections : undefined,
          errors: [`Submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        };
      }
    }

    return {
      claimId,
      claimNumber: claim.claimNumber || 'PENDING',
      status: corrections.length > 0 ? 'corrected_and_submitted' : 'submitted',
      scrubScore: scrubResult.overallScore,
      corrections: corrections.length > 0 ? corrections : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      submissionMethod: 'electronic',
      batchId: options.batchId,
    };
  }

  /**
   * Apply auto-corrections to a claim
   */
  private async applyAutoCorrections(claim: ClaimWithRelations): Promise<ClaimCorrection[]> {
    const corrections: ClaimCorrection[] = [];

    // Process each claim line
    for (const line of claim.claimLines) {
      const context: CorrectionContext = { claim, line };

      for (const rule of AUTO_CORRECTION_RULES) {
        if (rule.field === 'placeOfService' || rule.field === 'modifiers' ||
            rule.field === 'diagnosisPointers' || rule.field === 'units') {
          const currentValue = line[rule.field as keyof typeof line];

          if (rule.check(currentValue, context)) {
            const correctedValue = rule.correction(currentValue, context);

            // Apply correction to database
            await this.prisma.claimLine.update({
              where: { id: line.id },
              data: { [rule.field]: correctedValue },
            });

            corrections.push({
              field: `line${line.lineNumber}.${rule.field}`,
              originalValue: currentValue as string | number | null,
              correctedValue: correctedValue as string | number,
              reason: rule.reason,
              automatic: true,
            });
          }
        }
      }
    }

    return corrections;
  }

  /**
   * Select claims ready for auto-submission
   */
  private async selectClaimsForSubmission(maxClaims: number, minScore?: number): Promise<string[]> {
    // Get active auto-submit rules
    const rules = await this.prisma.aIBillingRule.findMany({
      where: {
        organizationId: this.organizationId,
        category: 'submission',
        isActive: true,
      },
      orderBy: { priority: 'desc' },
    });

    // Build where clause based on rules
    const whereConditions: Record<string, unknown> = {
      organizationId: this.organizationId,
      status: { in: ['DRAFT', 'READY'] },
    };

    // Apply rule conditions
    for (const rule of rules) {
      const conditions = rule.conditions as unknown as Array<{ field: string; operator: string; value: unknown }>;
      if (Array.isArray(conditions)) {
        for (const condition of conditions) {
          this.applyRuleCondition(whereConditions, condition);
        }
      }
    }

    // Fetch claims
    const claims = await this.prisma.claim.findMany({
      where: whereConditions,
      select: { id: true },
      take: maxClaims,
      orderBy: { createdAt: 'asc' },
    });

    // If minScore is specified, filter by recent scrub results
    if (minScore !== undefined) {
      const claimIdsWithScores = await this.prisma.claimScrubResult.findMany({
        where: {
          claimId: { in: claims.map(c => c.id) },
          organizationId: this.organizationId,
          overallScore: { gte: minScore },
        },
        select: { claimId: true },
        distinct: ['claimId'],
      });

      const qualifiedIds = new Set(claimIdsWithScores.map(r => r.claimId));
      return claims.filter(c => qualifiedIds.has(c.id)).map(c => c.id);
    }

    return claims.map(c => c.id);
  }

  /**
   * Apply a rule condition to the where clause
   */
  private applyRuleCondition(
    where: Record<string, unknown>,
    condition: { field: string; operator: string; value: unknown }
  ): void {
    const { field, operator, value } = condition;

    switch (operator) {
      case 'equals':
        where[field] = value;
        break;
      case 'notEquals':
        where[field] = { not: value };
        break;
      case 'contains':
        where[field] = { contains: value };
        break;
      case 'greaterThan':
        where[field] = { gt: value };
        break;
      case 'lessThan':
        where[field] = { lt: value };
        break;
      case 'in':
        where[field] = { in: value as unknown[] };
        break;
      case 'notIn':
        where[field] = { notIn: value as unknown[] };
        break;
    }
  }

  /**
   * Create an AI billing task record
   */
  private async createTaskRecord(
    claimId: string,
    result: ClaimSubmissionResult,
    batchId: string
  ): Promise<void> {
    const taskStatus: BillingTaskStatus =
      result.status === 'submitted' || result.status === 'corrected_and_submitted'
        ? 'COMPLETED'
        : result.status === 'pending_review'
        ? 'NEEDS_REVIEW'
        : result.status === 'failed'
        ? 'FAILED'
        : 'SKIPPED';

    const task = await this.prisma.aIBillingTask.create({
      data: {
        taskType: 'SUBMIT' as BillingTaskType,
        status: taskStatus,
        claimId,
        organizationId: this.organizationId,
        result: {
          status: result.status,
          scrubScore: result.scrubScore ?? null,
          corrections: result.corrections?.map(c => ({
            field: c.field,
            originalValue: c.originalValue,
            correctedValue: c.correctedValue,
            reason: c.reason,
            automatic: c.automatic,
          })) ?? [],
          errors: result.errors ?? [],
          warnings: result.warnings ?? [],
        },
        resultSummary: this.generateResultSummary(result),
        metadata: { batchId },
        completedAt: new Date(),
        attempts: 1,
      },
    });

    // Create decision record
    await this.prisma.aIBillingDecision.create({
      data: {
        taskId: task.id,
        decision: result.status === 'submitted' || result.status === 'corrected_and_submitted'
          ? 'SUBMIT'
          : result.status === 'pending_review'
          ? 'HOLD_FOR_REVIEW'
          : 'REJECT',
        reasoning: this.generateDecisionReasoning(result),
        confidence: result.scrubScore ? result.scrubScore / 100 : 0,
        organizationId: this.organizationId,
      },
    });
  }

  /**
   * Generate a result summary string
   */
  private generateResultSummary(result: ClaimSubmissionResult): string {
    switch (result.status) {
      case 'submitted':
        return `Claim ${result.claimNumber} submitted successfully. Score: ${result.scrubScore}/100.`;
      case 'corrected_and_submitted':
        return `Claim ${result.claimNumber} auto-corrected (${result.corrections?.length} fixes) and submitted. Score: ${result.scrubScore}/100.`;
      case 'pending_review':
        return `Claim ${result.claimNumber} needs review. ${result.errors?.length || 0} error(s) found.`;
      case 'failed':
        return `Claim ${result.claimNumber} submission failed: ${result.errors?.join(', ')}`;
      case 'skipped':
        return `Claim ${result.claimNumber} skipped: ${result.errors?.join(', ')}`;
      default:
        return `Claim ${result.claimNumber} processed.`;
    }
  }

  /**
   * Generate decision reasoning
   */
  private generateDecisionReasoning(result: ClaimSubmissionResult): string {
    const parts: string[] = [];

    if (result.scrubScore !== undefined) {
      parts.push(`Scrub score: ${result.scrubScore}/100`);
    }

    if (result.corrections && result.corrections.length > 0) {
      parts.push(`${result.corrections.length} auto-correction(s) applied`);
    }

    if (result.errors && result.errors.length > 0) {
      parts.push(`Errors: ${result.errors.join('; ')}`);
    }

    if (result.warnings && result.warnings.length > 0) {
      parts.push(`Warnings: ${result.warnings.join('; ')}`);
    }

    return parts.join('. ') || 'No specific reasoning recorded.';
  }

  /**
   * Update billing metrics
   */
  private async updateMetrics(stats: {
    submitted: number;
    failed: number;
    skipped: number;
    pendingReview: number;
  }): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await this.prisma.aIBillingMetric.upsert({
      where: {
        organizationId_metricDate_periodType: {
          organizationId: this.organizationId,
          metricDate: today,
          periodType: 'daily',
        },
      },
      create: {
        organizationId: this.organizationId,
        metricDate: today,
        periodType: 'daily',
        claimsSubmitted: stats.submitted,
        tasksFailed: stats.failed,
        tasksSkipped: stats.skipped,
        tasksCompleted: stats.submitted,
      },
      update: {
        claimsSubmitted: { increment: stats.submitted },
        tasksFailed: { increment: stats.failed },
        tasksSkipped: { increment: stats.skipped },
        tasksCompleted: { increment: stats.submitted },
      },
    });
  }

  /**
   * Get submission statistics
   */
  async getSubmissionStats(dateFrom?: Date, dateTo?: Date): Promise<SubmissionStats> {
    const where: Record<string, unknown> = {
      organizationId: this.organizationId,
      submittedDate: { not: null },
    };

    if (dateFrom) {
      where.submittedDate = { ...(where.submittedDate as object), gte: dateFrom };
    }
    if (dateTo) {
      where.submittedDate = { ...(where.submittedDate as object), lte: dateTo };
    }

    // Get overall stats
    const claims = await this.prisma.claim.findMany({
      where,
      select: {
        id: true,
        status: true,
        payerId: true,
        submittedDate: true,
        payer: { select: { name: true } },
      },
    });

    const totalSubmitted = claims.length;
    const acceptedCount = claims.filter(c => c.status === 'ACCEPTED' || c.status === 'PAID').length;
    const rejectedCount = claims.filter(c => c.status === 'REJECTED' || c.status === 'DENIED').length;
    const pendingCount = claims.filter(c => c.status === 'SUBMITTED').length;

    // Get average scrub score
    const scrubResults = await this.prisma.claimScrubResult.findMany({
      where: {
        claimId: { in: claims.map(c => c.id) },
        organizationId: this.organizationId,
      },
      select: { overallScore: true },
    });

    const averageScore = scrubResults.length > 0
      ? scrubResults.reduce((sum, r) => sum + r.overallScore, 0) / scrubResults.length
      : 0;

    // Group by payer
    const payerMap = new Map<string, { name: string; submitted: number; accepted: number; rejected: number }>();
    for (const claim of claims) {
      if (!claim.payerId) continue;

      const existing = payerMap.get(claim.payerId) || {
        name: claim.payer?.name || 'Unknown',
        submitted: 0,
        accepted: 0,
        rejected: 0,
      };

      existing.submitted++;
      if (claim.status === 'ACCEPTED' || claim.status === 'PAID') {
        existing.accepted++;
      } else if (claim.status === 'REJECTED' || claim.status === 'DENIED') {
        existing.rejected++;
      }

      payerMap.set(claim.payerId, existing);
    }

    const byPayer = Array.from(payerMap.entries()).map(([payerId, stats]) => ({
      payerId,
      payerName: stats.name,
      submitted: stats.submitted,
      accepted: stats.accepted,
      rejected: stats.rejected,
      successRate: stats.submitted > 0 ? (stats.accepted / stats.submitted) * 100 : 0,
    }));

    // Group by date
    const dateMap = new Map<string, { submitted: number; accepted: number; rejected: number }>();
    for (const claim of claims) {
      if (!claim.submittedDate) continue;

      const dateKey = claim.submittedDate.toISOString().split('T')[0];
      const existing = dateMap.get(dateKey) || { submitted: 0, accepted: 0, rejected: 0 };

      existing.submitted++;
      if (claim.status === 'ACCEPTED' || claim.status === 'PAID') {
        existing.accepted++;
      } else if (claim.status === 'REJECTED' || claim.status === 'DENIED') {
        existing.rejected++;
      }

      dateMap.set(dateKey, existing);
    }

    const byTimeframe = Array.from(dateMap.entries())
      .map(([date, stats]) => ({
        date,
        submitted: stats.submitted,
        accepted: stats.accepted,
        rejected: stats.rejected,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalSubmitted,
      acceptedCount,
      rejectedCount,
      pendingCount,
      successRate: totalSubmitted > 0 ? (acceptedCount / totalSubmitted) * 100 : 0,
      averageScore: Math.round(averageScore * 100) / 100,
      byPayer,
      byTimeframe,
    };
  }

  /**
   * Get or create auto-submit rules
   */
  async getAutoSubmitRules(): Promise<AutoSubmitRule[]> {
    const rules = await this.prisma.aIBillingRule.findMany({
      where: {
        organizationId: this.organizationId,
        category: 'submission',
      },
      orderBy: { priority: 'desc' },
    });

    return rules.map(r => ({
      id: r.id,
      name: r.name,
      conditions: (r.conditions as unknown as RuleCondition[]) || [],
      enabled: r.isActive,
      priority: r.priority,
      minScore: this.extractMinScoreFromConditions(r.conditions as unknown as RuleCondition[]),
      maxClaimsPerRun: r.maxActionsPerDay,
      scheduleCron: r.triggerTime || undefined,
    }));
  }

  /**
   * Extract minScore from conditions array
   */
  private extractMinScoreFromConditions(conditions: RuleCondition[] | null): number {
    if (!Array.isArray(conditions)) return 80;
    const minScoreCondition = conditions.find(c => c.field === 'minScore');
    if (minScoreCondition && typeof minScoreCondition.value === 'number') {
      return minScoreCondition.value;
    }
    return 80;
  }

  /**
   * Create or update an auto-submit rule
   */
  async saveAutoSubmitRule(rule: Omit<AutoSubmitRule, 'id'> & { id?: string }): Promise<AutoSubmitRule> {
    const data = {
      name: rule.name,
      category: 'submission',
      description: `Auto-submit rule: ${rule.name}`,
      conditions: rule.conditions as unknown as object,
      actions: [{ action: 'submit', parameters: {} }],
      isActive: rule.enabled,
      priority: rule.priority,
      maxActionsPerDay: rule.maxClaimsPerRun,
      triggerType: rule.scheduleCron ? 'scheduled' : 'automatic',
      triggerTime: rule.scheduleCron,
      organizationId: this.organizationId,
    };

    if (rule.id) {
      const updated = await this.prisma.aIBillingRule.update({
        where: { id: rule.id },
        data,
      });
      return this.ruleToAutoSubmitRule(updated);
    } else {
      const created = await this.prisma.aIBillingRule.create({
        data,
      });
      return this.ruleToAutoSubmitRule(created);
    }
  }

  /**
   * Convert database rule to AutoSubmitRule
   */
  private ruleToAutoSubmitRule(rule: {
    id: string;
    name: string;
    conditions: unknown;
    isActive: boolean;
    priority: number;
    maxActionsPerDay: number;
    triggerTime: string | null;
  }): AutoSubmitRule {
    const conditions = (rule.conditions as unknown as RuleCondition[]) || [];
    return {
      id: rule.id,
      name: rule.name,
      conditions,
      enabled: rule.isActive,
      priority: rule.priority,
      minScore: this.extractMinScoreFromConditions(conditions),
      maxClaimsPerRun: rule.maxActionsPerDay,
      scheduleCron: rule.triggerTime || undefined,
    };
  }

  /**
   * Create submission failure alert
   */
  async createFailureAlert(
    claimId: string,
    error: string,
    details: Record<string, unknown>
  ): Promise<void> {
    // Log the failure for monitoring and alerting
    console.error('[AI_BILLING_ALERT] Claim submission failed:', {
      claimId,
      error,
      details,
      organizationId: this.organizationId,
      timestamp: new Date().toISOString(),
    });

    // Also create a claim note
    await this.prisma.claimNote.create({
      data: {
        claimId,
        noteType: 'ai_alert',
        note: `AI BILLING ALERT: Submission failed - ${error}`,
        userId: 'SYSTEM',
      },
    });
  }
}

export const createClaimSubmitter = (prisma: PrismaClient, organizationId: string) =>
  new ClaimSubmitter(prisma, organizationId);
