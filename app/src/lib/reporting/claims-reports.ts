// Claims and Insurance Reports - US-103
// Epic 15 - Reports on claims status and insurance performance

import { prisma } from '@/lib/prisma';
import { ClaimStatus } from '@prisma/client';
import type { DateRangeFilter } from './types';

// ============================================
// Types for Claims Reports
// ============================================

export interface ClaimsStatusSummaryReport {
  periodStart: Date;
  periodEnd: Date;
  statusCounts: ClaimStatusCount[];
  totals: {
    totalClaims: number;
    totalCharges: number;
    totalPaid: number;
    pendingCharges: number;
  };
  trends: {
    avgDaysToPayment: number;
    avgDaysToResponse: number;
    cleanClaimRate: number;
  };
}

export interface ClaimStatusCount {
  status: ClaimStatus;
  statusLabel: string;
  count: number;
  totalCharges: number;
  totalPaid: number;
  percentage: number;
}

export interface DenialAnalysisReport {
  periodStart: Date;
  periodEnd: Date;
  denialsByReasonCode: DenialByReasonCode[];
  totals: {
    totalDenials: number;
    totalDeniedAmount: number;
    appealedCount: number;
    overturndCount: number;
    denialRate: number;
  };
  topDenialReasons: string[];
}

export interface DenialByReasonCode {
  reasonCode: string;
  description: string;
  count: number;
  totalAmount: number;
  percentage: number;
  avgDaysToResolution: number | null;
  appealSuccessRate: number | null;
}

export interface PayerPerformanceReport {
  periodStart: Date;
  periodEnd: Date;
  payers: PayerPerformanceRow[];
  totals: {
    totalClaims: number;
    totalCharges: number;
    totalPaid: number;
    avgPaymentRate: number;
    avgDaysToPayment: number;
  };
}

export interface PayerPerformanceRow {
  payerId: string;
  payerName: string;
  claimCount: number;
  totalCharges: number;
  totalAllowed: number;
  totalPaid: number;
  totalAdjusted: number;
  paymentRate: number;
  allowedRate: number;
  avgDaysToPayment: number;
  denialRate: number;
  cleanClaimRate: number;
}

export interface CleanClaimRateReport {
  periodStart: Date;
  periodEnd: Date;
  overallRate: number;
  byPayer: CleanClaimByPayer[];
  byProvider: CleanClaimByProvider[];
  totals: {
    totalClaims: number;
    cleanClaims: number;
    rejectedOnFirstSubmission: number;
    deniedOnFirstSubmission: number;
  };
  trends: CleanClaimTrendPoint[];
}

export interface CleanClaimByPayer {
  payerId: string;
  payerName: string;
  totalClaims: number;
  cleanClaims: number;
  cleanClaimRate: number;
}

export interface CleanClaimByProvider {
  providerId: string;
  providerName: string;
  totalClaims: number;
  cleanClaims: number;
  cleanClaimRate: number;
}

export interface CleanClaimTrendPoint {
  period: string;
  periodStart: Date;
  periodEnd: Date;
  cleanClaimRate: number;
  totalClaims: number;
}

export interface OutstandingClaimsReport {
  asOfDate: Date;
  claims: OutstandingClaimRow[];
  totals: {
    totalClaims: number;
    totalOutstanding: number;
    avgDaysOutstanding: number;
  };
  byAgeBucket: OutstandingByAge[];
  byPayer: OutstandingByPayer[];
}

export interface OutstandingClaimRow {
  claimId: string;
  claimNumber: string | null;
  patientName: string;
  patientId: string;
  payerName: string;
  payerId: string | null;
  submittedDate: Date | null;
  totalCharges: number;
  totalPaid: number;
  outstanding: number;
  daysOutstanding: number;
  status: ClaimStatus;
}

export interface OutstandingByAge {
  bucketLabel: string;
  minDays: number;
  maxDays: number | null;
  claimCount: number;
  totalOutstanding: number;
  percentage: number;
}

export interface OutstandingByPayer {
  payerId: string | null;
  payerName: string;
  claimCount: number;
  totalOutstanding: number;
  avgDaysOutstanding: number;
  percentage: number;
}

export interface ERAPostingSummaryReport {
  periodStart: Date;
  periodEnd: Date;
  summary: {
    totalERAReceived: number;
    totalPaymentsPosted: number;
    autoPostedCount: number;
    autoPostedAmount: number;
    manualPostedCount: number;
    manualPostedAmount: number;
    pendingReviewCount: number;
    pendingReviewAmount: number;
    autoPostRate: number;
  };
  byPayer: ERAByPayer[];
  recentERAs: RecentERAEntry[];
}

export interface ERAByPayer {
  payerId: string | null;
  payerName: string;
  eraCount: number;
  totalAmount: number;
  autoPostedCount: number;
  autoPostRate: number;
  avgProcessingTime: number | null; // hours
}

export interface RecentERAEntry {
  paymentId: string;
  receivedDate: Date;
  payerName: string;
  totalAmount: number;
  claimsPosted: number;
  postingMethod: 'auto' | 'manual' | 'pending';
  processingTimeHours: number | null;
}

// ============================================
// Claim Status Labels
// ============================================

const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  [ClaimStatus.DRAFT]: 'Draft',
  [ClaimStatus.READY]: 'Ready to Submit',
  [ClaimStatus.SUBMITTED]: 'Submitted',
  [ClaimStatus.ACCEPTED]: 'Accepted',
  [ClaimStatus.REJECTED]: 'Rejected',
  [ClaimStatus.PAID]: 'Paid',
  [ClaimStatus.DENIED]: 'Denied',
  [ClaimStatus.APPEALED]: 'Appealed',
  [ClaimStatus.VOID]: 'Void',
};

// ============================================
// Claims Status Summary Report
// ============================================

/**
 * Get claims status summary - submitted, pending, paid, denied counts
 */
export async function getClaimsStatusSummaryReport(
  organizationId: string,
  dateRange: DateRangeFilter
): Promise<ClaimsStatusSummaryReport> {
  const { start, end } = dateRange;

  // Get all claims in the date range
  const claims = await prisma.claim.findMany({
    where: {
      organizationId,
      createdDate: { gte: start, lte: end },
    },
  });

  // Initialize status counts for all statuses
  const statusMap = new Map<ClaimStatus, { count: number; totalCharges: number; totalPaid: number }>();
  for (const status of Object.values(ClaimStatus)) {
    statusMap.set(status, { count: 0, totalCharges: 0, totalPaid: 0 });
  }

  let totalClaims = 0;
  let totalCharges = 0;
  let totalPaid = 0;
  let pendingCharges = 0;
  let totalDaysToPayment = 0;
  let paidClaimsCount = 0;
  let totalDaysToResponse = 0;
  let respondedClaimsCount = 0;
  let cleanClaims = 0;

  for (const claim of claims) {
    totalClaims += 1;
    const charges = Number(claim.totalCharges);
    const paid = Number(claim.totalPaid);
    totalCharges += charges;
    totalPaid += paid;

    const statusData = statusMap.get(claim.status)!;
    statusData.count += 1;
    statusData.totalCharges += charges;
    statusData.totalPaid += paid;

    // Track pending amounts
    if (
      claim.status === ClaimStatus.SUBMITTED ||
      claim.status === ClaimStatus.ACCEPTED
    ) {
      pendingCharges += charges - paid;
    }

    // Track days to payment
    if (claim.status === ClaimStatus.PAID && claim.paidDate && claim.submittedDate) {
      const daysToPayment = Math.floor(
        (claim.paidDate.getTime() - claim.submittedDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      totalDaysToPayment += daysToPayment;
      paidClaimsCount += 1;
    }

    // Track days to response
    if (claim.acceptedDate && claim.submittedDate) {
      const daysToResponse = Math.floor(
        (claim.acceptedDate.getTime() - claim.submittedDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      totalDaysToResponse += daysToResponse;
      respondedClaimsCount += 1;
    }

    // Clean claim = paid without rejection/denial
    if (claim.status === ClaimStatus.PAID) {
      cleanClaims += 1;
    }
  }

  // Build status counts array
  const statusCounts: ClaimStatusCount[] = [];
  for (const [status, data] of statusMap.entries()) {
    if (data.count > 0) {
      statusCounts.push({
        status,
        statusLabel: CLAIM_STATUS_LABELS[status],
        count: data.count,
        totalCharges: Math.round(data.totalCharges * 100) / 100,
        totalPaid: Math.round(data.totalPaid * 100) / 100,
        percentage: totalClaims > 0 ? Math.round((data.count / totalClaims) * 1000) / 10 : 0,
      });
    }
  }

  // Sort by count descending
  statusCounts.sort((a, b) => b.count - a.count);

  const avgDaysToPayment = paidClaimsCount > 0 ? Math.round(totalDaysToPayment / paidClaimsCount) : 0;
  const avgDaysToResponse = respondedClaimsCount > 0 ? Math.round(totalDaysToResponse / respondedClaimsCount) : 0;
  const cleanClaimRate = totalClaims > 0 ? Math.round((cleanClaims / totalClaims) * 1000) / 10 : 0;

  return {
    periodStart: start,
    periodEnd: end,
    statusCounts,
    totals: {
      totalClaims,
      totalCharges: Math.round(totalCharges * 100) / 100,
      totalPaid: Math.round(totalPaid * 100) / 100,
      pendingCharges: Math.round(pendingCharges * 100) / 100,
    },
    trends: {
      avgDaysToPayment,
      avgDaysToResponse,
      cleanClaimRate,
    },
  };
}

// ============================================
// Denial Analysis Report
// ============================================

/**
 * Get denial analysis report - denials by reason code
 */
export async function getDenialAnalysisReport(
  organizationId: string,
  dateRange: DateRangeFilter
): Promise<DenialAnalysisReport> {
  const { start, end } = dateRange;

  // Get denied and appealed claims
  const deniedClaims = await prisma.claim.findMany({
    where: {
      organizationId,
      createdDate: { gte: start, lte: end },
      status: { in: [ClaimStatus.DENIED, ClaimStatus.APPEALED] },
    },
    include: {
      claimLines: true,
    },
  });

  // Count total claims for denial rate calculation
  const totalClaimsCount = await prisma.claim.count({
    where: {
      organizationId,
      createdDate: { gte: start, lte: end },
      status: { not: ClaimStatus.DRAFT },
    },
  });

  // Group by denial reason code
  const reasonMap = new Map<string, {
    count: number;
    totalAmount: number;
    appealedCount: number;
    resolvedCount: number;
    totalDaysToResolution: number;
  }>();

  let totalDenials = 0;
  let totalDeniedAmount = 0;
  let appealedCount = 0;
  let overturnedCount = 0;

  for (const claim of deniedClaims) {
    totalDenials += 1;
    const amount = Number(claim.totalCharges);
    totalDeniedAmount += amount;

    if (claim.status === ClaimStatus.APPEALED) {
      appealedCount += 1;
    }

    // Extract reason codes from claim lines
    for (const line of claim.claimLines) {
      for (const reasonCode of line.adjustmentReasonCodes) {
        const existing = reasonMap.get(reasonCode) || {
          count: 0,
          totalAmount: 0,
          appealedCount: 0,
          resolvedCount: 0,
          totalDaysToResolution: 0,
        };
        existing.count += 1;
        existing.totalAmount += Number(line.chargedAmount);
        if (claim.status === ClaimStatus.APPEALED) {
          existing.appealedCount += 1;
        }
        reasonMap.set(reasonCode, existing);
      }
    }

    // If no reason codes on lines, use the status message as reason
    if (claim.claimLines.length === 0 || claim.claimLines.every((l: { adjustmentReasonCodes: string[] }) => l.adjustmentReasonCodes.length === 0)) {
      const reasonCode = claim.statusMessage || 'UNKNOWN';
      const existing = reasonMap.get(reasonCode) || {
        count: 0,
        totalAmount: 0,
        appealedCount: 0,
        resolvedCount: 0,
        totalDaysToResolution: 0,
      };
      existing.count += 1;
      existing.totalAmount += amount;
      if (claim.status === ClaimStatus.APPEALED) {
        existing.appealedCount += 1;
      }
      reasonMap.set(reasonCode, existing);
    }
  }

  // Build denials by reason code array
  const denialsByReasonCode: DenialByReasonCode[] = [];
  for (const [reasonCode, data] of reasonMap.entries()) {
    denialsByReasonCode.push({
      reasonCode,
      description: getReasonCodeDescription(reasonCode),
      count: data.count,
      totalAmount: Math.round(data.totalAmount * 100) / 100,
      percentage: totalDenials > 0 ? Math.round((data.count / totalDenials) * 1000) / 10 : 0,
      avgDaysToResolution: data.resolvedCount > 0 ? Math.round(data.totalDaysToResolution / data.resolvedCount) : null,
      appealSuccessRate: data.appealedCount > 0 ? Math.round((data.resolvedCount / data.appealedCount) * 1000) / 10 : null,
    });
  }

  // Sort by count descending
  denialsByReasonCode.sort((a, b) => b.count - a.count);

  const denialRate = totalClaimsCount > 0 ? Math.round((totalDenials / totalClaimsCount) * 1000) / 10 : 0;
  const topDenialReasons = denialsByReasonCode.slice(0, 5).map(d => d.reasonCode);

  return {
    periodStart: start,
    periodEnd: end,
    denialsByReasonCode,
    totals: {
      totalDenials,
      totalDeniedAmount: Math.round(totalDeniedAmount * 100) / 100,
      appealedCount,
      overturndCount: overturnedCount,
      denialRate,
    },
    topDenialReasons,
  };
}

/**
 * Get human-readable description for common denial reason codes (CARC codes)
 */
function getReasonCodeDescription(code: string): string {
  const descriptions: Record<string, string> = {
    '1': 'Deductible amount',
    '2': 'Coinsurance amount',
    '3': 'Co-payment amount',
    '4': 'The procedure code is inconsistent with the modifier used',
    '5': 'The procedure code/bill type is inconsistent with the place of service',
    '6': 'The procedure/revenue code is inconsistent with the patient\'s age',
    '16': 'Claim lacks information needed for adjudication',
    '18': 'Duplicate claim',
    '22': 'Exceeds maximum frequency',
    '23': 'Authorization number missing/invalid',
    '27': 'Expenses incurred after coverage terminated',
    '29': 'Time limit for filing has expired',
    '31': 'Patient cannot be identified as our insured',
    '32': 'Member\'s cost share is greater than allowable',
    '39': 'Services denied at the time authorization was requested',
    '45': 'Charge exceeds fee schedule/maximum allowable',
    '50': 'Non-covered services - not deemed medically necessary',
    '96': 'Non-covered charge(s)',
    '97': 'Payment is included in the allowance for another service',
    '109': 'Claim not covered by this payer',
    '119': 'Benefit maximum for this time period has been reached',
    '140': 'Patient/insured health ID number and name do not match',
    '197': 'Precertification/authorization absent',
    'UNKNOWN': 'Unknown/unspecified reason',
  };

  return descriptions[code] || `Reason code ${code}`;
}

// ============================================
// Payer Performance Report
// ============================================

/**
 * Get payer performance report - payment rate and timing by payer
 */
export async function getPayerPerformanceReport(
  organizationId: string,
  dateRange: DateRangeFilter
): Promise<PayerPerformanceReport> {
  const { start, end } = dateRange;

  // Get all claims with payer info
  const claims = await prisma.claim.findMany({
    where: {
      organizationId,
      createdDate: { gte: start, lte: end },
      status: { not: ClaimStatus.DRAFT },
    },
    include: {
      payer: true,
    },
  });

  // Group by payer
  const payerMap = new Map<string, {
    payerId: string;
    payerName: string;
    claimCount: number;
    totalCharges: number;
    totalAllowed: number;
    totalPaid: number;
    totalAdjusted: number;
    paidClaimsCount: number;
    totalDaysToPayment: number;
    deniedCount: number;
    cleanClaimsCount: number;
  }>();

  for (const claim of claims) {
    const payerId = claim.payerId || 'self-pay';
    const payerName = claim.payer?.name || 'Self Pay';

    const existing = payerMap.get(payerId) || {
      payerId,
      payerName,
      claimCount: 0,
      totalCharges: 0,
      totalAllowed: 0,
      totalPaid: 0,
      totalAdjusted: 0,
      paidClaimsCount: 0,
      totalDaysToPayment: 0,
      deniedCount: 0,
      cleanClaimsCount: 0,
    };

    existing.claimCount += 1;
    existing.totalCharges += Number(claim.totalCharges);
    existing.totalAllowed += Number(claim.totalAllowed);
    existing.totalPaid += Number(claim.totalPaid);
    existing.totalAdjusted += Number(claim.totalAdjusted);

    if (claim.status === ClaimStatus.PAID && claim.paidDate && claim.submittedDate) {
      existing.paidClaimsCount += 1;
      const daysToPayment = Math.floor(
        (claim.paidDate.getTime() - claim.submittedDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      existing.totalDaysToPayment += daysToPayment;
      existing.cleanClaimsCount += 1;
    }

    if (claim.status === ClaimStatus.DENIED) {
      existing.deniedCount += 1;
    }

    payerMap.set(payerId, existing);
  }

  // Build payer performance rows
  const payers: PayerPerformanceRow[] = [];
  let totalClaimsSum = 0;
  let totalChargesSum = 0;
  let totalPaidSum = 0;
  let totalDaysSum = 0;
  let paidClaimsSum = 0;

  for (const data of payerMap.values()) {
    const paymentRate = data.totalCharges > 0 ? Math.round((data.totalPaid / data.totalCharges) * 1000) / 10 : 0;
    const allowedRate = data.totalCharges > 0 ? Math.round((data.totalAllowed / data.totalCharges) * 1000) / 10 : 0;
    const avgDaysToPayment = data.paidClaimsCount > 0 ? Math.round(data.totalDaysToPayment / data.paidClaimsCount) : 0;
    const denialRate = data.claimCount > 0 ? Math.round((data.deniedCount / data.claimCount) * 1000) / 10 : 0;
    const cleanClaimRate = data.claimCount > 0 ? Math.round((data.cleanClaimsCount / data.claimCount) * 1000) / 10 : 0;

    payers.push({
      payerId: data.payerId,
      payerName: data.payerName,
      claimCount: data.claimCount,
      totalCharges: Math.round(data.totalCharges * 100) / 100,
      totalAllowed: Math.round(data.totalAllowed * 100) / 100,
      totalPaid: Math.round(data.totalPaid * 100) / 100,
      totalAdjusted: Math.round(data.totalAdjusted * 100) / 100,
      paymentRate,
      allowedRate,
      avgDaysToPayment,
      denialRate,
      cleanClaimRate,
    });

    totalClaimsSum += data.claimCount;
    totalChargesSum += data.totalCharges;
    totalPaidSum += data.totalPaid;
    totalDaysSum += data.totalDaysToPayment;
    paidClaimsSum += data.paidClaimsCount;
  }

  // Sort by total paid descending
  payers.sort((a, b) => b.totalPaid - a.totalPaid);

  const avgPaymentRate = totalChargesSum > 0 ? Math.round((totalPaidSum / totalChargesSum) * 1000) / 10 : 0;
  const avgDaysToPayment = paidClaimsSum > 0 ? Math.round(totalDaysSum / paidClaimsSum) : 0;

  return {
    periodStart: start,
    periodEnd: end,
    payers,
    totals: {
      totalClaims: totalClaimsSum,
      totalCharges: Math.round(totalChargesSum * 100) / 100,
      totalPaid: Math.round(totalPaidSum * 100) / 100,
      avgPaymentRate,
      avgDaysToPayment,
    },
  };
}

// ============================================
// Clean Claim Rate Report
// ============================================

/**
 * Get clean claim rate report - percentage of claims paid on first submission
 */
export async function getCleanClaimRateReport(
  organizationId: string,
  dateRange: DateRangeFilter
): Promise<CleanClaimRateReport> {
  const { start, end } = dateRange;

  // Get all claims with provider
  const claims = await prisma.claim.findMany({
    where: {
      organizationId,
      createdDate: { gte: start, lte: end },
      status: { not: ClaimStatus.DRAFT },
    },
    include: {
      payer: true,
    },
  });

  // Get providers for name lookup
  const providers = await prisma.provider.findMany({
    where: { organizationId },
    include: { user: true },
  });
  const providerLookup = new Map(providers.map(p => [p.id, p]));

  let totalClaims = 0;
  let cleanClaims = 0;
  let rejectedOnFirst = 0;
  let deniedOnFirst = 0;

  // Group by payer
  const payerMap = new Map<string, { payerId: string; payerName: string; total: number; clean: number }>();

  // Group by provider
  const providerMap = new Map<string, { providerId: string; providerName: string; total: number; clean: number }>();

  for (const claim of claims) {
    totalClaims += 1;

    // Determine if clean (paid without rejection/denial)
    const isClean = claim.status === ClaimStatus.PAID && !claim.originalClaimId;
    if (isClean) {
      cleanClaims += 1;
    }

    if (claim.status === ClaimStatus.REJECTED && !claim.originalClaimId) {
      rejectedOnFirst += 1;
    }
    if (claim.status === ClaimStatus.DENIED && !claim.originalClaimId) {
      deniedOnFirst += 1;
    }

    // Track by payer
    const payerId = claim.payerId || 'self-pay';
    const payerName = claim.payer?.name || 'Self Pay';
    const payerData = payerMap.get(payerId) || { payerId, payerName, total: 0, clean: 0 };
    payerData.total += 1;
    if (isClean) payerData.clean += 1;
    payerMap.set(payerId, payerData);

    // Track by provider
    if (claim.billingProviderId) {
      const providerId = claim.billingProviderId;
      const provider = providerLookup.get(providerId);
      const providerName = provider?.user
        ? `${provider.user.firstName} ${provider.user.lastName}`.trim()
        : 'Unknown Provider';
      const providerData = providerMap.get(providerId) || { providerId, providerName, total: 0, clean: 0 };
      providerData.total += 1;
      if (isClean) providerData.clean += 1;
      providerMap.set(providerId, providerData);
    }
  }

  // Build by payer array
  const byPayer: CleanClaimByPayer[] = Array.from(payerMap.values())
    .map(d => ({
      payerId: d.payerId,
      payerName: d.payerName,
      totalClaims: d.total,
      cleanClaims: d.clean,
      cleanClaimRate: d.total > 0 ? Math.round((d.clean / d.total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.totalClaims - a.totalClaims);

  // Build by provider array
  const byProvider: CleanClaimByProvider[] = Array.from(providerMap.values())
    .map(d => ({
      providerId: d.providerId,
      providerName: d.providerName,
      totalClaims: d.total,
      cleanClaims: d.clean,
      cleanClaimRate: d.total > 0 ? Math.round((d.clean / d.total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.totalClaims - a.totalClaims);

  const overallRate = totalClaims > 0 ? Math.round((cleanClaims / totalClaims) * 1000) / 10 : 0;

  // Build simple trends (we could expand this with historical data)
  const trends: CleanClaimTrendPoint[] = [{
    period: 'Current Period',
    periodStart: start,
    periodEnd: end,
    cleanClaimRate: overallRate,
    totalClaims,
  }];

  return {
    periodStart: start,
    periodEnd: end,
    overallRate,
    byPayer,
    byProvider,
    totals: {
      totalClaims,
      cleanClaims,
      rejectedOnFirstSubmission: rejectedOnFirst,
      deniedOnFirstSubmission: deniedOnFirst,
    },
    trends,
  };
}

// ============================================
// Outstanding Claims Report
// ============================================

/**
 * Get outstanding claims report - claims awaiting response
 */
export async function getOutstandingClaimsReport(
  organizationId: string,
  asOfDate: Date = new Date()
): Promise<OutstandingClaimsReport> {
  // Get all claims with outstanding balances
  const claims = await prisma.claim.findMany({
    where: {
      organizationId,
      status: { in: [ClaimStatus.SUBMITTED, ClaimStatus.ACCEPTED, ClaimStatus.APPEALED] },
    },
    include: {
      patient: {
        include: { demographics: true },
      },
      payer: true,
    },
    orderBy: { submittedDate: 'asc' },
  });

  const claimRows: OutstandingClaimRow[] = [];
  const ageBuckets: OutstandingByAge[] = [
    { bucketLabel: '0-30 Days', minDays: 0, maxDays: 30, claimCount: 0, totalOutstanding: 0, percentage: 0 },
    { bucketLabel: '31-60 Days', minDays: 31, maxDays: 60, claimCount: 0, totalOutstanding: 0, percentage: 0 },
    { bucketLabel: '61-90 Days', minDays: 61, maxDays: 90, claimCount: 0, totalOutstanding: 0, percentage: 0 },
    { bucketLabel: '91-120 Days', minDays: 91, maxDays: 120, claimCount: 0, totalOutstanding: 0, percentage: 0 },
    { bucketLabel: 'Over 120 Days', minDays: 121, maxDays: null, claimCount: 0, totalOutstanding: 0, percentage: 0 },
  ];

  const payerMap = new Map<string, { payerId: string | null; payerName: string; claimCount: number; totalOutstanding: number; totalDays: number }>();

  let totalClaims = 0;
  let totalOutstanding = 0;
  let totalDaysSum = 0;

  for (const claim of claims) {
    const outstanding = Number(claim.totalCharges) - Number(claim.totalPaid);
    if (outstanding <= 0) continue;

    totalClaims += 1;
    totalOutstanding += outstanding;

    const daysOutstanding = claim.submittedDate
      ? Math.floor((asOfDate.getTime() - claim.submittedDate.getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    totalDaysSum += daysOutstanding;

    const demo = claim.patient.demographics;
    const patientName = demo ? `${demo.lastName}, ${demo.firstName}` : 'Unknown';

    claimRows.push({
      claimId: claim.id,
      claimNumber: claim.claimNumber,
      patientName,
      patientId: claim.patientId,
      payerName: claim.payer?.name || 'Self Pay',
      payerId: claim.payerId,
      submittedDate: claim.submittedDate,
      totalCharges: Number(claim.totalCharges),
      totalPaid: Number(claim.totalPaid),
      outstanding: Math.round(outstanding * 100) / 100,
      daysOutstanding,
      status: claim.status,
    });

    // Add to age bucket
    for (const bucket of ageBuckets) {
      if (daysOutstanding >= bucket.minDays && (bucket.maxDays === null || daysOutstanding <= bucket.maxDays)) {
        bucket.claimCount += 1;
        bucket.totalOutstanding += outstanding;
        break;
      }
    }

    // Track by payer
    const payerId = claim.payerId || 'self-pay';
    const payerName = claim.payer?.name || 'Self Pay';
    const payerData = payerMap.get(payerId) || { payerId: claim.payerId, payerName, claimCount: 0, totalOutstanding: 0, totalDays: 0 };
    payerData.claimCount += 1;
    payerData.totalOutstanding += outstanding;
    payerData.totalDays += daysOutstanding;
    payerMap.set(payerId, payerData);
  }

  // Calculate percentages for age buckets
  for (const bucket of ageBuckets) {
    bucket.totalOutstanding = Math.round(bucket.totalOutstanding * 100) / 100;
    bucket.percentage = totalOutstanding > 0 ? Math.round((bucket.totalOutstanding / totalOutstanding) * 1000) / 10 : 0;
  }

  // Build by payer array
  const byPayer: OutstandingByPayer[] = Array.from(payerMap.values())
    .map(d => ({
      payerId: d.payerId,
      payerName: d.payerName,
      claimCount: d.claimCount,
      totalOutstanding: Math.round(d.totalOutstanding * 100) / 100,
      avgDaysOutstanding: d.claimCount > 0 ? Math.round(d.totalDays / d.claimCount) : 0,
      percentage: totalOutstanding > 0 ? Math.round((d.totalOutstanding / totalOutstanding) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.totalOutstanding - a.totalOutstanding);

  const avgDaysOutstanding = totalClaims > 0 ? Math.round(totalDaysSum / totalClaims) : 0;

  return {
    asOfDate,
    claims: claimRows,
    totals: {
      totalClaims,
      totalOutstanding: Math.round(totalOutstanding * 100) / 100,
      avgDaysOutstanding,
    },
    byAgeBucket: ageBuckets,
    byPayer,
  };
}

// ============================================
// ERA Posting Summary Report
// ============================================

/**
 * Get ERA posting summary - auto-posted vs manual posting
 */
export async function getERAPostingSummaryReport(
  organizationId: string,
  dateRange: DateRangeFilter
): Promise<ERAPostingSummaryReport> {
  const { start, end } = dateRange;

  // Get insurance payments with ERA posting info
  const payments = await prisma.payment.findMany({
    where: {
      organizationId,
      paymentDate: { gte: start, lte: end },
      payerType: 'insurance',
    },
    include: {
      allocations: {
        include: {
          charge: true,
        },
      },
      claim: {
        include: {
          payer: true,
        },
      },
    },
    orderBy: { paymentDate: 'desc' },
  });

  let totalERAReceived = 0;
  let totalPaymentsPosted = 0;
  let autoPostedCount = 0;
  let autoPostedAmount = 0;
  let manualPostedCount = 0;
  let manualPostedAmount = 0;
  let pendingReviewCount = 0;
  let pendingReviewAmount = 0;

  const payerMap = new Map<string, {
    payerId: string | null;
    payerName: string;
    eraCount: number;
    totalAmount: number;
    autoPostedCount: number;
    totalProcessingTime: number;
    processedCount: number;
  }>();

  const recentERAs: RecentERAEntry[] = [];

  for (const payment of payments) {
    totalERAReceived += 1;
    const amount = Number(payment.amount);
    totalPaymentsPosted += amount;

    // Determine posting method based on metadata
    // In a real system, this would come from ERA processing metadata
    const isAutoPosted = payment.referenceNumber?.startsWith('ERA-') ?? false;
    const isPending = payment.isVoid;

    if (isPending) {
      pendingReviewCount += 1;
      pendingReviewAmount += amount;
    } else if (isAutoPosted) {
      autoPostedCount += 1;
      autoPostedAmount += amount;
    } else {
      manualPostedCount += 1;
      manualPostedAmount += amount;
    }

    // Get payer info from linked claim
    let payerId: string | null = null;
    let payerName = payment.payerName || 'Unknown Payer';
    if (payment.claim) {
      payerId = payment.claim.payerId;
      payerName = payment.claim.payer?.name || payerName;
    }

    // Track by payer
    const payerKey = payerId || 'unknown';
    const payerData = payerMap.get(payerKey) || {
      payerId,
      payerName,
      eraCount: 0,
      totalAmount: 0,
      autoPostedCount: 0,
      totalProcessingTime: 0,
      processedCount: 0,
    };
    payerData.eraCount += 1;
    payerData.totalAmount += amount;
    if (isAutoPosted) payerData.autoPostedCount += 1;
    payerMap.set(payerKey, payerData);

    // Add to recent ERAs (first 20)
    if (recentERAs.length < 20) {
      recentERAs.push({
        paymentId: payment.id,
        receivedDate: payment.paymentDate,
        payerName,
        totalAmount: Math.round(amount * 100) / 100,
        claimsPosted: payment.allocations.length,
        postingMethod: isPending ? 'pending' : isAutoPosted ? 'auto' : 'manual',
        processingTimeHours: null, // Would need ERA received timestamp
      });
    }
  }

  // Build by payer array
  const byPayer: ERAByPayer[] = Array.from(payerMap.values())
    .map(d => ({
      payerId: d.payerId,
      payerName: d.payerName,
      eraCount: d.eraCount,
      totalAmount: Math.round(d.totalAmount * 100) / 100,
      autoPostedCount: d.autoPostedCount,
      autoPostRate: d.eraCount > 0 ? Math.round((d.autoPostedCount / d.eraCount) * 1000) / 10 : 0,
      avgProcessingTime: d.processedCount > 0 ? Math.round(d.totalProcessingTime / d.processedCount) : null,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  const autoPostRate = totalERAReceived > 0 ? Math.round((autoPostedCount / totalERAReceived) * 1000) / 10 : 0;

  return {
    periodStart: start,
    periodEnd: end,
    summary: {
      totalERAReceived,
      totalPaymentsPosted: Math.round(totalPaymentsPosted * 100) / 100,
      autoPostedCount,
      autoPostedAmount: Math.round(autoPostedAmount * 100) / 100,
      manualPostedCount,
      manualPostedAmount: Math.round(manualPostedAmount * 100) / 100,
      pendingReviewCount,
      pendingReviewAmount: Math.round(pendingReviewAmount * 100) / 100,
      autoPostRate,
    },
    byPayer,
    recentERAs,
  };
}
