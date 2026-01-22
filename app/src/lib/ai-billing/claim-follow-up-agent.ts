/**
 * Epic 31: AI Billing Agent - Claim Follow-Up Agent
 *
 * US-311: Claim follow-up automation
 *
 * AI agent that automatically follows up on pending claims with:
 * - Automated status checks on schedule
 * - Identification of stalled claims
 * - Determination of follow-up actions needed
 * - Generation of follow-up tasks for staff
 * - Days in AR tracking
 * - Escalation of aged claims
 * - Payer response time analysis
 */

import type { PrismaClient, Claim, BillingTaskType, BillingTaskStatus } from '@prisma/client';

// ============================================
// Types
// ============================================

export type FollowUpAction =
  | 'CHECK_STATUS'
  | 'CALL_PAYER'
  | 'RESUBMIT'
  | 'ESCALATE'
  | 'WRITE_OFF_REVIEW'
  | 'APPEAL'
  | 'SECONDARY_CLAIM'
  | 'PATIENT_STATEMENT'
  | 'WAIT'
  | 'CLOSE';

export type FollowUpPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type FollowUpTaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED' | 'ESCALATED';

export interface FollowUpInput {
  claimId: string;
  forceCheck?: boolean;
  includePayerCall?: boolean;
}

export interface FollowUpOutput {
  claimId: string;
  claimNumber: string;
  currentStatus: string;
  previousStatus: string | null;
  statusChanged: boolean;
  daysInAR: number;
  arAgingBucket: string;
  recommendedAction: FollowUpAction;
  actionReason: string;
  priority: FollowUpPriority;
  nextFollowUpDate: Date;
  payerResponseTime: number | null;
  stalledDays: number | null;
  isStalled: boolean;
  escalationRequired: boolean;
  staffTaskCreated: boolean;
  staffTaskId: string | null;
  processingTimeMs: number;
}

export interface BatchFollowUpInput {
  claimIds?: string[];
  autoSelectClaims?: boolean;
  maxClaims?: number;
  includeAgedOnly?: boolean;
  minDaysInAR?: number;
  payerIds?: string[];
  statuses?: string[];
}

export interface BatchFollowUpOutput {
  totalProcessed: number;
  statusUpdates: number;
  stalledClaims: number;
  escalations: number;
  tasksGenerated: number;
  results: FollowUpOutput[];
  batchId: string;
  processingTimeMs: number;
}

export interface StalledClaimCriteria {
  minDaysStalled: number;
  excludeStatuses: string[];
  includePayerIds?: string[];
}

export interface StalledClaim {
  claimId: string;
  claimNumber: string;
  patientName: string;
  payerName: string;
  totalCharges: number;
  status: string;
  submittedDate: Date | null;
  lastStatusChange: Date | null;
  daysStalled: number;
  daysInAR: number;
  lastFollowUpDate: Date | null;
  followUpCount: number;
  recommendedAction: FollowUpAction;
  priority: FollowUpPriority;
}

export interface FollowUpTask {
  id: string;
  claimId: string;
  taskType: 'CALL_PAYER' | 'REVIEW_CLAIM' | 'ESCALATE' | 'RESUBMIT' | 'PATIENT_CONTACT' | 'OTHER';
  description: string;
  priority: FollowUpPriority;
  dueDate: Date;
  assignedTo?: string;
  status: FollowUpTaskStatus;
  notes?: string;
  createdAt: Date;
}

export interface ARAgingReport {
  totalClaims: number;
  totalAmount: number;
  byBucket: ARAgingBucket[];
  byPayer: PayerARSummary[];
  stalledClaimsCount: number;
  averageDaysInAR: number;
  oldestClaimDays: number;
}

export interface ARAgingBucket {
  bucket: string;
  minDays: number;
  maxDays: number | null;
  claimCount: number;
  totalAmount: number;
  percentOfTotal: number;
}

export interface PayerARSummary {
  payerId: string;
  payerName: string;
  claimCount: number;
  totalAmount: number;
  averageDaysInAR: number;
  averageResponseDays: number;
  stalledClaimCount: number;
}

export interface PayerResponseAnalysis {
  payerId: string;
  payerName: string;
  totalClaims: number;
  averageResponseDays: number;
  medianResponseDays: number;
  minResponseDays: number;
  maxResponseDays: number;
  responseDistribution: {
    bucket: string;
    count: number;
    percentage: number;
  }[];
  trend: 'IMPROVING' | 'STABLE' | 'WORSENING';
  expectedResponseDays: number;
  anomalies: string[];
}

export interface EscalationCriteria {
  minDaysInAR?: number;
  minAmount?: number;
  stalledDays?: number;
  missedFollowUps?: number;
}

export interface EscalatedClaim {
  claimId: string;
  claimNumber: string;
  reason: string;
  daysInAR: number;
  amount: number;
  priority: FollowUpPriority;
  escalatedAt: Date;
  assignedTo?: string;
}

// ============================================
// AR Aging Configuration
// ============================================

const AR_AGING_BUCKETS = [
  { bucket: '0-30', minDays: 0, maxDays: 30 },
  { bucket: '31-60', minDays: 31, maxDays: 60 },
  { bucket: '61-90', minDays: 61, maxDays: 90 },
  { bucket: '91-120', minDays: 91, maxDays: 120 },
  { bucket: '120+', minDays: 121, maxDays: null },
];

// Default follow-up intervals by status (in days)
const FOLLOW_UP_INTERVALS: Record<string, number> = {
  SUBMITTED: 14,
  ACCEPTED: 30,
  PENDING: 7,
  IN_PROCESS: 21,
  DEFAULT: 14,
};

// Stalled claim thresholds (days without status change)
const STALLED_THRESHOLDS: Record<string, number> = {
  SUBMITTED: 14,
  ACCEPTED: 45,
  PENDING: 7,
  IN_PROCESS: 30,
  DEFAULT: 21,
};

// ============================================
// ClaimFollowUpAgent Class
// ============================================

export class ClaimFollowUpAgent {
  constructor(
    private prisma: PrismaClient,
    private organizationId: string
  ) {}

  /**
   * Main follow-up method - checks claim status and determines next action
   */
  async followUp(input: FollowUpInput): Promise<FollowUpOutput> {
    const startTime = Date.now();

    // Get claim with full context
    const claim = await this.prisma.claim.findFirst({
      where: {
        id: input.claimId,
        organizationId: this.organizationId,
      },
      include: {
        patient: {
          include: { demographics: true },
        },
        payer: true,
        insurancePolicy: true,
        submissions: {
          orderBy: { submissionDate: 'desc' },
          take: 5,
        },
        claimNotes: {
          where: { noteType: { in: ['follow_up', 'status_check', 'ai_follow_up'] } },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        aiBillingTasks: {
          where: { taskType: 'FOLLOW_UP' },
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
      },
    });

    if (!claim) {
      throw new Error(`Claim not found: ${input.claimId}`);
    }

    // Calculate key metrics
    const daysInAR = this.calculateDaysInAR(claim.submittedDate);
    const arAgingBucket = this.getAgingBucket(daysInAR);
    const stalledDays = this.calculateStalledDays(claim);
    const isStalled = this.isClaimStalled(claim, stalledDays);
    const previousStatus = claim.submissions[0]?.status || null;
    const payerResponseTime = await this.getPayerResponseTime(claim.payerId || '');

    // Determine recommended action
    const { action, reason, priority } = this.determineFollowUpAction(claim, {
      daysInAR,
      isStalled,
      stalledDays,
      payerResponseTime,
    });

    // Calculate next follow-up date
    const nextFollowUpDate = this.calculateNextFollowUpDate(claim.status, action);

    // Check if escalation is needed
    const escalationRequired = this.checkEscalationRequired(claim, daysInAR, isStalled);

    // Create follow-up task record
    const taskId = await this.createFollowUpTaskRecord(claim, action, priority, reason);

    // Generate staff task if needed
    let staffTaskCreated = false;
    let staffTaskId: string | null = null;

    if (this.requiresStaffIntervention(action)) {
      const task = await this.createStaffTask(claim, action, priority, reason);
      staffTaskCreated = true;
      staffTaskId = task.id;
    }

    // Update claim notes with follow-up activity
    await this.recordFollowUpActivity(claim.id, action, reason, priority);

    // Update metrics
    await this.updateFollowUpMetrics(claim, action, isStalled, escalationRequired);

    const processingTimeMs = Date.now() - startTime;

    return {
      claimId: claim.id,
      claimNumber: claim.claimNumber || '',
      currentStatus: claim.status,
      previousStatus,
      statusChanged: previousStatus !== null && previousStatus !== claim.status,
      daysInAR,
      arAgingBucket,
      recommendedAction: action,
      actionReason: reason,
      priority,
      nextFollowUpDate,
      payerResponseTime,
      stalledDays,
      isStalled,
      escalationRequired,
      staffTaskCreated,
      staffTaskId,
      processingTimeMs,
    };
  }

  /**
   * Batch follow-up processing
   */
  async batchFollowUp(input: BatchFollowUpInput): Promise<BatchFollowUpOutput> {
    const startTime = Date.now();
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Select claims for follow-up
    let claims: Claim[];

    if (input.claimIds && input.claimIds.length > 0) {
      claims = await this.prisma.claim.findMany({
        where: {
          id: { in: input.claimIds },
          organizationId: this.organizationId,
        },
      });
    } else if (input.autoSelectClaims) {
      claims = await this.selectClaimsForFollowUp(input);
    } else {
      claims = [];
    }

    // Process each claim
    const results: FollowUpOutput[] = [];
    let statusUpdates = 0;
    let stalledClaims = 0;
    let escalations = 0;
    let tasksGenerated = 0;

    for (const claim of claims.slice(0, input.maxClaims || 100)) {
      try {
        const result = await this.followUp({ claimId: claim.id });
        results.push(result);

        if (result.statusChanged) statusUpdates++;
        if (result.isStalled) stalledClaims++;
        if (result.escalationRequired) escalations++;
        if (result.staffTaskCreated) tasksGenerated++;
      } catch (error) {
        console.error(`Follow-up failed for claim ${claim.id}:`, error);
        // Continue with other claims
      }
    }

    const processingTimeMs = Date.now() - startTime;

    return {
      totalProcessed: results.length,
      statusUpdates,
      stalledClaims,
      escalations,
      tasksGenerated,
      results,
      batchId,
      processingTimeMs,
    };
  }

  /**
   * Get stalled claims
   */
  async getStalledClaims(criteria?: StalledClaimCriteria): Promise<StalledClaim[]> {
    const minDaysStalled = criteria?.minDaysStalled || 14;
    const excludeStatuses = criteria?.excludeStatuses || ['PAID', 'DENIED', 'VOID', 'APPEALED'];

    const pendingClaims = await this.prisma.claim.findMany({
      where: {
        organizationId: this.organizationId,
        status: { notIn: excludeStatuses as any },
        ...(criteria?.includePayerIds && { payerId: { in: criteria.includePayerIds } }),
      },
      include: {
        patient: { include: { demographics: true } },
        payer: true,
        claimNotes: {
          where: { noteType: { in: ['follow_up', 'status_check', 'ai_follow_up'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        aiBillingTasks: {
          where: { taskType: 'FOLLOW_UP' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const stalledClaims: StalledClaim[] = [];

    for (const claim of pendingClaims) {
      const stalledDays = this.calculateStalledDays(claim);

      if (stalledDays >= minDaysStalled) {
        const daysInAR = this.calculateDaysInAR(claim.submittedDate);
        const { action, priority } = this.determineFollowUpAction(claim, {
          daysInAR,
          isStalled: true,
          stalledDays,
          payerResponseTime: null,
        });

        const patientName = claim.patient?.demographics
          ? `${claim.patient.demographics.firstName} ${claim.patient.demographics.lastName}`
          : 'Unknown';

        stalledClaims.push({
          claimId: claim.id,
          claimNumber: claim.claimNumber || '',
          patientName,
          payerName: claim.payer?.name || 'Unknown',
          totalCharges: claim.totalCharges.toNumber(),
          status: claim.status,
          submittedDate: claim.submittedDate,
          lastStatusChange: claim.updatedAt,
          daysStalled: stalledDays,
          daysInAR,
          lastFollowUpDate: claim.claimNotes[0]?.createdAt || null,
          followUpCount: claim.aiBillingTasks?.length || 0,
          recommendedAction: action,
          priority,
        });
      }
    }

    // Sort by priority and stalled days
    return stalledClaims.sort((a, b) => {
      const priorityOrder = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.daysStalled - a.daysStalled;
    });
  }

  /**
   * Get AR aging report
   */
  async getARAgingReport(): Promise<ARAgingReport> {
    const pendingClaims = await this.prisma.claim.findMany({
      where: {
        organizationId: this.organizationId,
        status: { notIn: ['PAID', 'VOID'] },
        submittedDate: { not: null },
      },
      include: {
        payer: true,
      },
    });

    // Initialize buckets
    const buckets = AR_AGING_BUCKETS.map(b => ({
      ...b,
      claimCount: 0,
      totalAmount: 0,
      percentOfTotal: 0,
    }));

    // Initialize payer summaries
    const payerMap = new Map<string, PayerARSummary>();

    let totalAmount = 0;
    let totalDaysInAR = 0;
    let oldestClaimDays = 0;
    let stalledCount = 0;

    for (const claim of pendingClaims) {
      const daysInAR = this.calculateDaysInAR(claim.submittedDate);
      const amount = claim.totalCharges.toNumber() - claim.totalPaid.toNumber();

      totalAmount += amount;
      totalDaysInAR += daysInAR;

      if (daysInAR > oldestClaimDays) {
        oldestClaimDays = daysInAR;
      }

      // Check if stalled
      const stalledDays = this.calculateStalledDays(claim);
      if (this.isClaimStalled(claim, stalledDays)) {
        stalledCount++;
      }

      // Add to appropriate bucket
      for (const bucket of buckets) {
        if (daysInAR >= bucket.minDays && (bucket.maxDays === null || daysInAR <= bucket.maxDays)) {
          bucket.claimCount++;
          bucket.totalAmount += amount;
          break;
        }
      }

      // Add to payer summary
      if (claim.payerId) {
        const existing = payerMap.get(claim.payerId) || {
          payerId: claim.payerId,
          payerName: claim.payer?.name || 'Unknown',
          claimCount: 0,
          totalAmount: 0,
          averageDaysInAR: 0,
          averageResponseDays: 0,
          stalledClaimCount: 0,
          _totalDays: 0,
        };

        existing.claimCount++;
        existing.totalAmount += amount;
        (existing as any)._totalDays += daysInAR;

        if (this.isClaimStalled(claim, stalledDays)) {
          existing.stalledClaimCount++;
        }

        payerMap.set(claim.payerId, existing);
      }
    }

    // Calculate percentages and averages
    for (const bucket of buckets) {
      bucket.percentOfTotal = totalAmount > 0 ? (bucket.totalAmount / totalAmount) * 100 : 0;
    }

    const byPayer: PayerARSummary[] = [];
    for (const summary of payerMap.values()) {
      summary.averageDaysInAR = summary.claimCount > 0
        ? (summary as any)._totalDays / summary.claimCount
        : 0;

      // Get average response time for this payer
      summary.averageResponseDays = await this.getPayerResponseTime(summary.payerId) || 0;

      delete (summary as any)._totalDays;
      byPayer.push(summary);
    }

    // Sort payers by amount outstanding
    byPayer.sort((a, b) => b.totalAmount - a.totalAmount);

    return {
      totalClaims: pendingClaims.length,
      totalAmount,
      byBucket: buckets,
      byPayer,
      stalledClaimsCount: stalledCount,
      averageDaysInAR: pendingClaims.length > 0 ? totalDaysInAR / pendingClaims.length : 0,
      oldestClaimDays,
    };
  }

  /**
   * Get payer response time analysis
   */
  async getPayerResponseAnalysis(payerId?: string): Promise<PayerResponseAnalysis[]> {
    const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

    const paidClaims = await this.prisma.claim.findMany({
      where: {
        organizationId: this.organizationId,
        status: 'PAID',
        submittedDate: { not: null, gte: sixMonthsAgo },
        paidDate: { not: null },
        ...(payerId && { payerId }),
      },
      include: {
        payer: true,
      },
    });

    // Group by payer
    const payerData = new Map<string, {
      payerId: string;
      payerName: string;
      responseDays: number[];
    }>();

    for (const claim of paidClaims) {
      if (!claim.payerId || !claim.submittedDate || !claim.paidDate) continue;

      const responseDays = Math.floor(
        (claim.paidDate.getTime() - claim.submittedDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      const existing = payerData.get(claim.payerId) || {
        payerId: claim.payerId,
        payerName: claim.payer?.name || 'Unknown',
        responseDays: [],
      };

      existing.responseDays.push(responseDays);
      payerData.set(claim.payerId, existing);
    }

    const results: PayerResponseAnalysis[] = [];

    for (const data of payerData.values()) {
      if (data.responseDays.length === 0) continue;

      const sorted = [...data.responseDays].sort((a, b) => a - b);
      const sum = sorted.reduce((a, b) => a + b, 0);
      const avg = sum / sorted.length;
      const median = sorted[Math.floor(sorted.length / 2)];

      // Create distribution buckets
      const distribution = [
        { bucket: '0-7 days', count: 0, percentage: 0 },
        { bucket: '8-14 days', count: 0, percentage: 0 },
        { bucket: '15-30 days', count: 0, percentage: 0 },
        { bucket: '31-45 days', count: 0, percentage: 0 },
        { bucket: '46-60 days', count: 0, percentage: 0 },
        { bucket: '60+ days', count: 0, percentage: 0 },
      ];

      for (const days of sorted) {
        if (days <= 7) distribution[0].count++;
        else if (days <= 14) distribution[1].count++;
        else if (days <= 30) distribution[2].count++;
        else if (days <= 45) distribution[3].count++;
        else if (days <= 60) distribution[4].count++;
        else distribution[5].count++;
      }

      for (const d of distribution) {
        d.percentage = (d.count / sorted.length) * 100;
      }

      // Determine trend (compare first half vs second half)
      const halfIndex = Math.floor(sorted.length / 2);
      const firstHalfAvg = sorted.slice(0, halfIndex).reduce((a, b) => a + b, 0) / halfIndex || 0;
      const secondHalfAvg = sorted.slice(halfIndex).reduce((a, b) => a + b, 0) / (sorted.length - halfIndex) || 0;

      let trend: 'IMPROVING' | 'STABLE' | 'WORSENING' = 'STABLE';
      const trendThreshold = 3; // 3 days difference considered significant
      if (secondHalfAvg < firstHalfAvg - trendThreshold) trend = 'IMPROVING';
      else if (secondHalfAvg > firstHalfAvg + trendThreshold) trend = 'WORSENING';

      // Identify anomalies
      const anomalies: string[] = [];
      const stdDev = Math.sqrt(sorted.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / sorted.length);

      if (sorted[sorted.length - 1] > avg + 2 * stdDev) {
        anomalies.push(`Outlier claims taking ${sorted[sorted.length - 1]} days`);
      }
      if (distribution[5].percentage > 10) {
        anomalies.push(`${distribution[5].percentage.toFixed(1)}% of claims taking over 60 days`);
      }
      if (trend === 'WORSENING') {
        anomalies.push('Response times trending slower');
      }

      results.push({
        payerId: data.payerId,
        payerName: data.payerName,
        totalClaims: data.responseDays.length,
        averageResponseDays: Math.round(avg),
        medianResponseDays: median,
        minResponseDays: sorted[0],
        maxResponseDays: sorted[sorted.length - 1],
        responseDistribution: distribution,
        trend,
        expectedResponseDays: Math.round(median * 1.2), // Expected with 20% buffer
        anomalies,
      });
    }

    // Sort by average response time (slowest first)
    return results.sort((a, b) => b.averageResponseDays - a.averageResponseDays);
  }

  /**
   * Escalate aged claims
   */
  async escalateAgedClaims(criteria?: EscalationCriteria): Promise<EscalatedClaim[]> {
    const minDaysInAR = criteria?.minDaysInAR || 90;
    const minAmount = criteria?.minAmount || 500;
    const stalledDays = criteria?.stalledDays || 30;

    const pendingClaims = await this.prisma.claim.findMany({
      where: {
        organizationId: this.organizationId,
        status: { notIn: ['PAID', 'VOID', 'DENIED'] },
        submittedDate: { not: null },
      },
      include: {
        patient: { include: { demographics: true } },
        payer: true,
      },
    });

    const escalatedClaims: EscalatedClaim[] = [];

    for (const claim of pendingClaims) {
      const daysInAR = this.calculateDaysInAR(claim.submittedDate);
      const amount = claim.totalCharges.toNumber() - claim.totalPaid.toNumber();
      const claimStalledDays = this.calculateStalledDays(claim);

      let escalationReason: string | null = null;

      if (daysInAR >= minDaysInAR && amount >= minAmount) {
        escalationReason = `Aged ${daysInAR} days with $${amount.toFixed(2)} outstanding`;
      } else if (claimStalledDays >= stalledDays && amount >= minAmount / 2) {
        escalationReason = `Stalled for ${claimStalledDays} days with no status change`;
      }

      if (escalationReason) {
        // Determine priority
        let priority: FollowUpPriority = 'MEDIUM';
        if (daysInAR > 120 || amount > 2000) priority = 'URGENT';
        else if (daysInAR > 90 || amount > 1000) priority = 'HIGH';

        // Record escalation
        const escalation: EscalatedClaim = {
          claimId: claim.id,
          claimNumber: claim.claimNumber || '',
          reason: escalationReason,
          daysInAR,
          amount,
          priority,
          escalatedAt: new Date(),
        };

        // Create escalation task
        await this.createAIBillingTask(claim.id, 'FOLLOW_UP', 'NEEDS_REVIEW', {
          action: 'ESCALATE',
          reason: escalationReason,
          priority,
        });

        // Add note to claim
        await this.prisma.claimNote.create({
          data: {
            claimId: claim.id,
            noteType: 'ai_escalation',
            note: `[AI ESCALATION] ${escalationReason}. Priority: ${priority}. Requires supervisor review.`,
          },
        });

        escalatedClaims.push(escalation);
      }
    }

    return escalatedClaims.sort((a, b) => {
      const priorityOrder = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Get follow-up schedule
   */
  async getFollowUpSchedule(daysAhead: number = 7): Promise<{
    scheduled: Array<{
      claimId: string;
      claimNumber: string;
      patientName: string;
      payerName: string;
      scheduledDate: Date;
      action: FollowUpAction;
      priority: FollowUpPriority;
    }>;
    overdue: Array<{
      claimId: string;
      claimNumber: string;
      daysOverdue: number;
      priority: FollowUpPriority;
    }>;
  }> {
    const today = new Date();
    const futureDate = new Date(today.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    // Get claims with scheduled follow-ups
    const tasks = await this.prisma.aIBillingTask.findMany({
      where: {
        organizationId: this.organizationId,
        taskType: 'FOLLOW_UP',
        status: { in: ['QUEUED', 'NEEDS_REVIEW'] },
        scheduledFor: { lte: futureDate },
      },
      include: {
        claim: {
          include: {
            patient: { include: { demographics: true } },
            payer: true,
          },
        },
      },
      orderBy: { scheduledFor: 'asc' },
    });

    const scheduled: Array<{
      claimId: string;
      claimNumber: string;
      patientName: string;
      payerName: string;
      scheduledDate: Date;
      action: FollowUpAction;
      priority: FollowUpPriority;
    }> = [];

    const overdue: Array<{
      claimId: string;
      claimNumber: string;
      daysOverdue: number;
      priority: FollowUpPriority;
    }> = [];

    for (const task of tasks) {
      if (!task.claim) continue;

      const scheduledFor = task.scheduledFor || task.createdAt;
      const isOverdue = scheduledFor < today;

      const patientName = task.claim.patient?.demographics
        ? `${task.claim.patient.demographics.firstName} ${task.claim.patient.demographics.lastName}`
        : 'Unknown';

      const result = task.result as { action?: string; priority?: string } | null;
      const action = (result?.action as FollowUpAction) || 'CHECK_STATUS';
      const priority = (result?.priority as FollowUpPriority) || this.mapPriorityFromInt(task.priority);

      if (isOverdue) {
        const daysOverdue = Math.floor((today.getTime() - scheduledFor.getTime()) / (1000 * 60 * 60 * 24));
        overdue.push({
          claimId: task.claim.id,
          claimNumber: task.claim.claimNumber || '',
          daysOverdue,
          priority,
        });
      } else {
        scheduled.push({
          claimId: task.claim.id,
          claimNumber: task.claim.claimNumber || '',
          patientName,
          payerName: task.claim.payer?.name || 'Unknown',
          scheduledDate: scheduledFor,
          action,
          priority,
        });
      }
    }

    // Sort overdue by days overdue (most overdue first)
    overdue.sort((a, b) => b.daysOverdue - a.daysOverdue);

    return { scheduled, overdue };
  }

  /**
   * Get claims needing follow-up
   */
  async getClaimsNeedingFollowUp(limit: number = 50): Promise<Array<{
    claimId: string;
    claimNumber: string;
    patientName: string;
    payerName: string;
    status: string;
    daysInAR: number;
    lastFollowUp: Date | null;
    daysSinceLastFollowUp: number;
    urgencyScore: number;
    recommendedAction: FollowUpAction;
  }>> {
    const claims = await this.prisma.claim.findMany({
      where: {
        organizationId: this.organizationId,
        status: { in: ['SUBMITTED', 'ACCEPTED', 'READY'] },
        submittedDate: { not: null },
      },
      include: {
        patient: { include: { demographics: true } },
        payer: true,
        aiBillingTasks: {
          where: { taskType: 'FOLLOW_UP' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const results = claims.map(claim => {
      const daysInAR = this.calculateDaysInAR(claim.submittedDate);
      const lastFollowUp = claim.aiBillingTasks[0]?.completedAt || null;
      const daysSinceLastFollowUp = lastFollowUp
        ? Math.floor((Date.now() - lastFollowUp.getTime()) / (1000 * 60 * 60 * 24))
        : daysInAR;

      // Calculate urgency score (higher = more urgent)
      const amount = claim.totalCharges.toNumber();
      let urgencyScore = 0;
      urgencyScore += Math.min(daysInAR / 10, 10); // AR days contribution (max 10)
      urgencyScore += Math.min(daysSinceLastFollowUp / 7, 5); // Days since follow-up (max 5)
      urgencyScore += Math.min(amount / 1000, 5); // Amount contribution (max 5)

      const { action } = this.determineFollowUpAction(claim, {
        daysInAR,
        isStalled: this.isClaimStalled(claim, this.calculateStalledDays(claim)),
        stalledDays: this.calculateStalledDays(claim),
        payerResponseTime: null,
      });

      const patientName = claim.patient?.demographics
        ? `${claim.patient.demographics.firstName} ${claim.patient.demographics.lastName}`
        : 'Unknown';

      return {
        claimId: claim.id,
        claimNumber: claim.claimNumber || '',
        patientName,
        payerName: claim.payer?.name || 'Unknown',
        status: claim.status,
        daysInAR,
        lastFollowUp,
        daysSinceLastFollowUp,
        urgencyScore,
        recommendedAction: action,
      };
    });

    // Sort by urgency score (highest first)
    return results
      .sort((a, b) => b.urgencyScore - a.urgencyScore)
      .slice(0, limit);
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  private calculateDaysInAR(submittedDate: Date | null): number {
    if (!submittedDate) return 0;
    return Math.floor((Date.now() - submittedDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  private getAgingBucket(daysInAR: number): string {
    for (const bucket of AR_AGING_BUCKETS) {
      if (daysInAR >= bucket.minDays && (bucket.maxDays === null || daysInAR <= bucket.maxDays)) {
        return bucket.bucket;
      }
    }
    return '120+';
  }

  private calculateStalledDays(claim: Claim & { submissions?: any[] }): number {
    // Use the most recent submission date or claim update date
    const lastActivity = claim.submissions?.[0]?.submissionDate || claim.updatedAt;
    return Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
  }

  private isClaimStalled(claim: Claim, stalledDays: number): boolean {
    const threshold = STALLED_THRESHOLDS[claim.status] || STALLED_THRESHOLDS.DEFAULT;
    return stalledDays >= threshold;
  }

  private determineFollowUpAction(
    claim: any,
    context: {
      daysInAR: number;
      isStalled: boolean;
      stalledDays: number | null;
      payerResponseTime: number | null;
    }
  ): { action: FollowUpAction; reason: string; priority: FollowUpPriority } {
    const { daysInAR, isStalled, stalledDays } = context;
    const amount = claim.totalCharges?.toNumber() || 0;

    // Determine priority
    let priority: FollowUpPriority = 'LOW';
    if (daysInAR > 90 || amount > 2000) priority = 'URGENT';
    else if (daysInAR > 60 || amount > 1000 || isStalled) priority = 'HIGH';
    else if (daysInAR > 30 || amount > 500) priority = 'MEDIUM';

    // Determine action based on claim status and age
    if (claim.status === 'DENIED') {
      return {
        action: 'APPEAL',
        reason: 'Claim denied - appeal or write-off review required',
        priority: 'HIGH',
      };
    }

    if (claim.status === 'REJECTED') {
      return {
        action: 'RESUBMIT',
        reason: 'Claim rejected - correction and resubmission needed',
        priority: 'HIGH',
      };
    }

    if (daysInAR > 120) {
      return {
        action: 'ESCALATE',
        reason: `Claim aged ${daysInAR} days - escalation to supervisor required`,
        priority: 'URGENT',
      };
    }

    if (isStalled && stalledDays && stalledDays > 30) {
      return {
        action: 'CALL_PAYER',
        reason: `No status change in ${stalledDays} days - direct payer contact needed`,
        priority,
      };
    }

    if (daysInAR > 45 && claim.status === 'SUBMITTED') {
      return {
        action: 'CHECK_STATUS',
        reason: 'Submitted claim exceeds expected response time',
        priority,
      };
    }

    if (claim.status === 'PAID' && claim.patientResponsibility?.toNumber() > 0) {
      return {
        action: 'PATIENT_STATEMENT',
        reason: 'Patient balance remaining after insurance payment',
        priority: 'MEDIUM',
      };
    }

    // Default action
    return {
      action: 'CHECK_STATUS',
      reason: 'Routine follow-up status check',
      priority,
    };
  }

  private calculateNextFollowUpDate(status: string, action: FollowUpAction): Date {
    let intervalDays = FOLLOW_UP_INTERVALS[status] || FOLLOW_UP_INTERVALS.DEFAULT;

    // Adjust interval based on action
    if (action === 'ESCALATE' || action === 'CALL_PAYER') {
      intervalDays = Math.min(intervalDays, 3);
    } else if (action === 'APPEAL' || action === 'RESUBMIT') {
      intervalDays = 7;
    }

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + intervalDays);
    return nextDate;
  }

  private checkEscalationRequired(claim: Claim, daysInAR: number, isStalled: boolean): boolean {
    const amount = claim.totalCharges.toNumber();

    // Escalation criteria
    if (daysInAR > 90 && amount > 1000) return true;
    if (daysInAR > 120) return true;
    if (isStalled && daysInAR > 60) return true;
    if (claim.status === 'REJECTED' && daysInAR > 30) return true;

    return false;
  }

  private requiresStaffIntervention(action: FollowUpAction): boolean {
    return ['CALL_PAYER', 'ESCALATE', 'APPEAL', 'WRITE_OFF_REVIEW'].includes(action);
  }

  private async getPayerResponseTime(payerId: string): Promise<number | null> {
    if (!payerId) return null;

    const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

    const paidClaims = await this.prisma.claim.findMany({
      where: {
        organizationId: this.organizationId,
        payerId,
        status: 'PAID',
        submittedDate: { not: null, gte: sixMonthsAgo },
        paidDate: { not: null },
      },
      select: {
        submittedDate: true,
        paidDate: true,
      },
      take: 100,
    });

    if (paidClaims.length === 0) return null;

    const responseTimes = paidClaims.map(c => {
      return Math.floor(
        (c.paidDate!.getTime() - c.submittedDate!.getTime()) / (1000 * 60 * 60 * 24)
      );
    });

    return Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length);
  }

  private async selectClaimsForFollowUp(input: BatchFollowUpInput): Promise<Claim[]> {
    const where: any = {
      organizationId: this.organizationId,
      status: { in: input.statuses || ['SUBMITTED', 'ACCEPTED', 'READY'] },
      submittedDate: { not: null },
    };

    if (input.minDaysInAR) {
      const minDate = new Date(Date.now() - input.minDaysInAR * 24 * 60 * 60 * 1000);
      where.submittedDate = { ...where.submittedDate, lte: minDate };
    }

    if (input.payerIds && input.payerIds.length > 0) {
      where.payerId = { in: input.payerIds };
    }

    return this.prisma.claim.findMany({
      where,
      orderBy: [
        { submittedDate: 'asc' },
        { totalCharges: 'desc' },
      ],
      take: input.maxClaims || 100,
    });
  }

  private async createFollowUpTaskRecord(
    claim: any,
    action: FollowUpAction,
    priority: FollowUpPriority,
    reason: string
  ): Promise<string> {
    const priorityInt = { URGENT: 10, HIGH: 7, MEDIUM: 4, LOW: 1 }[priority];

    const task = await this.prisma.aIBillingTask.create({
      data: {
        taskType: 'FOLLOW_UP',
        status: 'COMPLETED',
        claimId: claim.id,
        priority: priorityInt,
        completedAt: new Date(),
        result: { action, reason, priority },
        organizationId: this.organizationId,
      },
    });

    return task.id;
  }

  private async createStaffTask(
    claim: any,
    action: FollowUpAction,
    priority: FollowUpPriority,
    reason: string
  ): Promise<FollowUpTask> {
    const taskTypeMap: Record<FollowUpAction, string> = {
      CALL_PAYER: 'CALL_PAYER',
      ESCALATE: 'ESCALATE',
      APPEAL: 'REVIEW_CLAIM',
      RESUBMIT: 'RESUBMIT',
      PATIENT_STATEMENT: 'PATIENT_CONTACT',
      WRITE_OFF_REVIEW: 'REVIEW_CLAIM',
      CHECK_STATUS: 'OTHER',
      SECONDARY_CLAIM: 'OTHER',
      WAIT: 'OTHER',
      CLOSE: 'OTHER',
    };

    const dueDate = new Date();
    if (priority === 'URGENT') dueDate.setDate(dueDate.getDate() + 1);
    else if (priority === 'HIGH') dueDate.setDate(dueDate.getDate() + 3);
    else if (priority === 'MEDIUM') dueDate.setDate(dueDate.getDate() + 7);
    else dueDate.setDate(dueDate.getDate() + 14);

    // Create a claim note as the staff task
    const note = await this.prisma.claimNote.create({
      data: {
        claimId: claim.id,
        noteType: 'ai_staff_task',
        note: `[AI TASK] Action: ${action}\nPriority: ${priority}\nReason: ${reason}\nDue: ${dueDate.toISOString().split('T')[0]}`,
      },
    });

    return {
      id: note.id,
      claimId: claim.id,
      taskType: taskTypeMap[action] as any,
      description: reason,
      priority,
      dueDate,
      status: 'PENDING',
      createdAt: note.createdAt,
    };
  }

  private async recordFollowUpActivity(
    claimId: string,
    action: FollowUpAction,
    reason: string,
    priority: FollowUpPriority
  ): Promise<void> {
    await this.prisma.claimNote.create({
      data: {
        claimId,
        noteType: 'ai_follow_up',
        note: `[AI Follow-Up] Action: ${action} | Priority: ${priority} | ${reason}`,
      },
    });
  }

  private async createAIBillingTask(
    claimId: string,
    taskType: BillingTaskType,
    status: BillingTaskStatus,
    result: object
  ): Promise<void> {
    await this.prisma.aIBillingTask.create({
      data: {
        taskType,
        status,
        claimId,
        result,
        organizationId: this.organizationId,
      },
    });
  }

  private async updateFollowUpMetrics(
    claim: Claim,
    action: FollowUpAction,
    isStalled: boolean,
    escalationRequired: boolean
  ): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get or create today's metrics
    const existingMetric = await this.prisma.aIBillingMetric.findFirst({
      where: {
        organizationId: this.organizationId,
        metricDate: { gte: today },
        periodType: 'daily',
      },
    });

    if (existingMetric) {
      await this.prisma.aIBillingMetric.update({
        where: { id: existingMetric.id },
        data: {
          followUpsPerformed: { increment: 1 },
          ...(action === 'CHECK_STATUS' && { statusesUpdated: { increment: 1 } }),
        },
      });
    } else {
      await this.prisma.aIBillingMetric.create({
        data: {
          metricDate: today,
          periodType: 'daily',
          followUpsPerformed: 1,
          statusesUpdated: action === 'CHECK_STATUS' ? 1 : 0,
          organizationId: this.organizationId,
        },
      });
    }
  }

  private mapPriorityFromInt(priority: number): FollowUpPriority {
    if (priority >= 10) return 'URGENT';
    if (priority >= 7) return 'HIGH';
    if (priority >= 4) return 'MEDIUM';
    return 'LOW';
  }
}
