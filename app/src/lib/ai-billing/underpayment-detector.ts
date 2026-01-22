/**
 * Epic 09: AI Billing Agent - Underpayment Detection Service
 *
 * Identifies underpaid claims by comparing actual payments against
 * expected amounts from fee schedules, contracts, and historical patterns.
 */

import type { PrismaClient } from '@prisma/client';
import type {
  UnderpaymentScanInput,
  UnderpaymentScanOutput,
  UnderpaymentResult,
} from './types';
import { COMMON_CARC_CODES } from './types';

// Underpayment thresholds
const THRESHOLDS = {
  MIN_UNDERPAYMENT_PERCENT: 5, // Minimum % underpaid to flag
  MIN_UNDERPAYMENT_AMOUNT: 5, // Minimum $ amount to flag
  HIGH_RECOVERY_LIKELIHOOD: 0.7,
  MEDIUM_RECOVERY_LIKELIHOOD: 0.4,
};

// Adjustment codes that indicate potential underpayment issues
const QUESTIONABLE_ADJUSTMENT_CODES = new Set([
  '45', // Charge exceeds fee schedule/maximum allowable
  '96', // Non-covered charge(s)
  '97', // Benefit included in another service
  'B1', // Non-covered visits/days
  'B4', // Late filing penalty
  'B5', // Coverage/program guidelines not met
  'B7', // Claim/service denied/reduced for regulatory reasons
  'B15', // Payment adjusted - network provider
  'B16', // Payment adjusted - exceeds negotiated rate
]);

// Codes that typically don't warrant appeal
const VALID_ADJUSTMENT_CODES = new Set([
  '1', // Deductible
  '2', // Coinsurance
  '3', // Copayment
  'PR', // Patient responsibility
  'CO', // Contractual obligation (often valid)
]);

export class UnderpaymentDetector {
  private prisma: PrismaClient;
  private organizationId: string;

  constructor(prisma: PrismaClient, organizationId: string) {
    this.prisma = prisma;
    this.organizationId = organizationId;
  }

  /**
   * Scan for underpayments based on input criteria
   */
  async scanForUnderpayments(input: UnderpaymentScanInput): Promise<UnderpaymentScanOutput> {
    const startTime = Date.now();

    const threshold = input.threshold || THRESHOLDS.MIN_UNDERPAYMENT_PERCENT;

    // Build query criteria
    const criteria = this.buildSearchCriteria(input);

    // Fetch charges with payments
    const charges = await this.fetchChargesWithPayments(criteria);

    // Analyze each charge for underpayment
    const results: UnderpaymentResult[] = [];

    for (const charge of charges) {
      const underpayment = await this.analyzeCharge(charge, threshold);
      if (underpayment) {
        results.push(underpayment);
      }
    }

    // Calculate totals
    const totalUnderpaidAmount = results.reduce((sum, r) => sum + r.underpaidAmount, 0);
    const potentialRecovery = results.reduce((sum, r) => sum + r.recoveryAmount, 0);

    // Sort by recovery amount descending
    results.sort((a, b) => b.recoveryAmount - a.recoveryAmount);

    return {
      totalScanned: charges.length,
      underpaymentCount: results.length,
      totalUnderpaidAmount: Math.round(totalUnderpaidAmount * 100) / 100,
      potentialRecovery: Math.round(potentialRecovery * 100) / 100,
      results: results.slice(0, 100), // Limit to top 100
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Build search criteria from input
   */
  private buildSearchCriteria(input: UnderpaymentScanInput): any {
    const criteria: any = {
      organizationId: input.organizationId,
      // Only check charges with some payment
      payments: {
        some: {},
      },
    };

    if (input.claimId) {
      criteria.claimId = input.claimId;
    }

    if (input.chargeId) {
      criteria.id = input.chargeId;
    }

    if (input.payerId) {
      criteria.claim = {
        insurancePolicy: {
          payerId: input.payerId,
        },
      };
    }

    if (input.dateFrom || input.dateTo) {
      criteria.serviceDate = {};
      if (input.dateFrom) {
        criteria.serviceDate.gte = input.dateFrom;
      }
      if (input.dateTo) {
        criteria.serviceDate.lte = input.dateTo;
      }
    }

    return criteria;
  }

  /**
   * Fetch charges with payment information
   */
  private async fetchChargesWithPayments(criteria: any): Promise<any[]> {
    return this.prisma.charge.findMany({
      where: criteria,
      include: {
        patient: {
          include: {
            demographics: true,
          },
        },
        encounter: {
          include: {
            claims: {
              include: {
                insurancePolicy: true,
                payer: true,
              },
            },
          },
        },
        paymentAllocations: {
          include: {
            payment: true,
          },
        },
      },
      take: 500, // Limit for performance
    });
  }

  /**
   * Analyze a single charge for underpayment
   */
  private async analyzeCharge(
    charge: any,
    threshold: number
  ): Promise<UnderpaymentResult | null> {
    const billedAmount = charge.fee?.toNumber() || 0;
    const paidAmount = charge.paymentAllocations?.reduce(
      (sum: number, alloc: any) => sum + (alloc.amount?.toNumber() || 0),
      0
    ) || 0;

    // Get expected amount from fee schedule or contract
    const expectedAmount = await this.getExpectedAmount(charge);

    // Calculate underpayment
    const underpaidAmount = expectedAmount - paidAmount;
    const underpaymentPercent = expectedAmount > 0 ? (underpaidAmount / expectedAmount) * 100 : 0;

    // Check if it meets threshold
    if (
      underpaidAmount < THRESHOLDS.MIN_UNDERPAYMENT_AMOUNT ||
      underpaymentPercent < threshold
    ) {
      return null;
    }

    // Analyze adjustment codes
    const adjustmentCodes = this.getAdjustmentCodes(charge);
    const calculationBasis = await this.determineCalculationBasis(charge);

    // Determine recovery likelihood
    const recoveryLikelihood = this.calculateRecoveryLikelihood(
      charge,
      adjustmentCodes,
      underpaymentPercent
    );

    // Calculate potential recovery
    const recoveryAmount = underpaidAmount * recoveryLikelihood;

    // Determine underpayment reason
    const underpaymentReason = this.determineUnderpaymentReason(
      charge,
      adjustmentCodes,
      underpaymentPercent
    );

    return {
      claimId: charge.claimId || undefined,
      chargeId: charge.id,
      patientId: charge.patientId,
      payerId: charge.claim?.insurancePolicy?.payerId || undefined,
      payerName: charge.claim?.insurancePolicy?.payer?.name || undefined,
      billedAmount,
      expectedAmount,
      paidAmount,
      underpaidAmount: Math.round(underpaidAmount * 100) / 100,
      calculationBasis,
      underpaymentReason,
      adjustmentCodes: adjustmentCodes.length > 0 ? adjustmentCodes : undefined,
      recoveryLikelihood: Math.round(recoveryLikelihood * 100) / 100,
      recoveryAmount: Math.round(recoveryAmount * 100) / 100,
      cptCode: charge.cptCode || charge.procedure?.cptCode || undefined,
      serviceDate: charge.serviceDate || undefined,
    };
  }

  /**
   * Get expected payment amount based on fee schedule or contract
   */
  private async getExpectedAmount(charge: any): Promise<number> {
    const billedAmount = charge.fee?.toNumber() || 0;
    const cptCode = charge.cptCode;
    const payerId = charge.encounter?.claims?.[0]?.payerId;

    if (!cptCode) {
      return billedAmount * 0.8; // Default to 80% of billed
    }

    // Try to find fee schedule entry with allowed amount
    const feeScheduleItem = await this.prisma.feeScheduleItem.findFirst({
      where: {
        cptCode,
        feeSchedule: {
          organizationId: this.organizationId,
          effectiveDate: {
            lte: charge.serviceDate || new Date(),
          },
          OR: [
            { endDate: null },
            { endDate: { gte: charge.serviceDate || new Date() } },
          ],
        },
      },
      include: {
        feeSchedule: true,
      },
      orderBy: {
        feeSchedule: {
          effectiveDate: 'desc',
        },
      },
    });

    if (feeScheduleItem?.allowedAmount) {
      return Number(feeScheduleItem.allowedAmount);
    }

    // Try to get historical average for this payer/code combination
    const historicalAvg = await this.getHistoricalAverage(cptCode, payerId);
    if (historicalAvg) {
      return historicalAvg;
    }

    // Default to 80% of billed amount
    return billedAmount * 0.8;
  }

  /**
   * Get historical average payment for CPT code and payer
   */
  private async getHistoricalAverage(
    cptCode: string,
    payerId?: string
  ): Promise<number | null> {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Get payment allocations for charges with this CPT code
    const result = await this.prisma.paymentAllocation.aggregate({
      where: {
        charge: {
          cptCode,
          organizationId: this.organizationId,
          ...(payerId && {
            encounter: {
              claims: {
                some: {
                  payerId,
                },
              },
            },
          }),
        },
        payment: {
          isVoid: false,
          paymentDate: { gte: sixMonthsAgo },
        },
      },
      _avg: {
        amount: true,
      },
      _count: true,
    });

    // Only use if we have enough data points
    if ((result._count || 0) >= 5 && result._avg.amount) {
      return Number(result._avg.amount);
    }

    return null;
  }

  /**
   * Extract adjustment codes from charge
   */
  private getAdjustmentCodes(charge: any): string[] {
    const codes: string[] = [];

    if (charge.adjustments) {
      for (const adj of charge.adjustments) {
        if (adj.reasonCode) {
          codes.push(adj.reasonCode);
        }
      }
    }

    return codes;
  }

  /**
   * Determine the calculation basis
   */
  private async determineCalculationBasis(
    charge: any
  ): Promise<'FEE_SCHEDULE' | 'CONTRACT' | 'HISTORICAL'> {
    const cptCode = charge.cptCode;

    if (cptCode) {
      // Check for fee schedule entry with this CPT code
      const feeScheduleItem = await this.prisma.feeScheduleItem.findFirst({
        where: {
          cptCode,
          feeSchedule: {
            organizationId: this.organizationId,
          },
        },
      });

      if (feeScheduleItem) {
        return 'FEE_SCHEDULE';
      }
    }

    return 'HISTORICAL';
  }

  /**
   * Calculate likelihood of recovering the underpayment
   */
  private calculateRecoveryLikelihood(
    charge: any,
    adjustmentCodes: string[],
    underpaymentPercent: number
  ): number {
    let likelihood = 0.5; // Base likelihood

    // Check adjustment codes
    const hasQuestionableCodes = adjustmentCodes.some(c =>
      QUESTIONABLE_ADJUSTMENT_CODES.has(c)
    );
    const hasValidCodes = adjustmentCodes.some(c => VALID_ADJUSTMENT_CODES.has(c));

    if (hasQuestionableCodes && !hasValidCodes) {
      likelihood += 0.2; // More likely recoverable
    } else if (hasValidCodes && !hasQuestionableCodes) {
      likelihood -= 0.2; // Less likely recoverable
    }

    // Higher underpayment % = more scrutiny, potentially more recoverable
    if (underpaymentPercent > 30) {
      likelihood += 0.15;
    } else if (underpaymentPercent > 20) {
      likelihood += 0.1;
    }

    // Payer type affects recovery
    const payerName = charge.claim?.insurancePolicy?.payer?.name?.toUpperCase() || '';
    if (payerName.includes('MEDICARE')) {
      likelihood -= 0.1; // Medicare is more accurate
    } else if (payerName.includes('MEDICAID')) {
      likelihood -= 0.15; // Medicaid is difficult
    }

    // Clamp to valid range
    return Math.max(0.1, Math.min(0.9, likelihood));
  }

  /**
   * Determine the likely reason for underpayment
   */
  private determineUnderpaymentReason(
    charge: any,
    adjustmentCodes: string[],
    underpaymentPercent: number
  ): string | undefined {
    // Check adjustment codes for specific reasons
    for (const code of adjustmentCodes) {
      if (code === '45') {
        return 'Payment reduced to fee schedule maximum';
      }
      if (code === '96') {
        return 'Non-covered services - review medical necessity';
      }
      if (code === '97') {
        return 'Bundled with another service - review CCI edits';
      }
      if (code === 'B15' || code === 'B16') {
        return 'Network rate adjustment - verify contract terms';
      }
    }

    // Generic reasons based on percent
    if (underpaymentPercent > 50) {
      return 'Significant underpayment - recommend contract review';
    } else if (underpaymentPercent > 30) {
      return 'Moderate underpayment - verify fee schedule';
    } else if (underpaymentPercent > 15) {
      return 'Minor underpayment - may be within variance';
    }

    return 'Review payment against expected amount';
  }

  /**
   * Get summary statistics by payer
   */
  async getUnderpaymentsByPayer(): Promise<
    Array<{
      payerId: string;
      payerName: string;
      totalUnderpaid: number;
      claimCount: number;
      avgUnderpaymentPercent: number;
    }>
  > {
    const results = await this.scanForUnderpayments({
      organizationId: this.organizationId,
      dateFrom: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // Last 90 days
    });

    // Group by payer
    const byPayer = new Map<
      string,
      {
        payerName: string;
        totalUnderpaid: number;
        totalExpected: number;
        claimCount: number;
      }
    >();

    for (const result of results.results) {
      const payerId = result.payerId || 'UNKNOWN';
      const existing = byPayer.get(payerId) || {
        payerName: result.payerName || 'Unknown Payer',
        totalUnderpaid: 0,
        totalExpected: 0,
        claimCount: 0,
      };

      existing.totalUnderpaid += result.underpaidAmount;
      existing.totalExpected += result.expectedAmount;
      existing.claimCount++;

      byPayer.set(payerId, existing);
    }

    // Convert to array and calculate averages
    const summary = Array.from(byPayer.entries()).map(([payerId, data]) => ({
      payerId,
      payerName: data.payerName,
      totalUnderpaid: Math.round(data.totalUnderpaid * 100) / 100,
      claimCount: data.claimCount,
      avgUnderpaymentPercent: Math.round(
        (data.totalUnderpaid / data.totalExpected) * 100 * 10
      ) / 10,
    }));

    // Sort by total underpaid
    summary.sort((a, b) => b.totalUnderpaid - a.totalUnderpaid);

    return summary;
  }

  /**
   * Get actionable underpayment items (ready for appeal/rebilling)
   */
  async getActionableUnderpayments(
    minRecoveryLikelihood: number = 0.5,
    minAmount: number = 25
  ): Promise<UnderpaymentResult[]> {
    const results = await this.scanForUnderpayments({
      organizationId: this.organizationId,
      dateFrom: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000), // Last 180 days
    });

    return results.results.filter(
      r =>
        r.recoveryLikelihood >= minRecoveryLikelihood &&
        r.recoveryAmount >= minAmount
    );
  }

  /**
   * Create underpayment detection record in database
   */
  async saveUnderpaymentDetection(result: UnderpaymentResult): Promise<string> {
    const detection = await this.prisma.underpaymentDetection.create({
      data: {
        claimId: result.claimId,
        chargeId: result.chargeId,
        payerId: result.payerId,
        billedAmount: result.billedAmount,
        expectedAmount: result.expectedAmount,
        paidAmount: result.paidAmount,
        underpaidAmount: result.underpaidAmount,
        calculationBasis: result.calculationBasis,
        underpaymentReason: result.underpaymentReason,
        recoveryLikelihood: result.recoveryLikelihood,
        recoveryAmount: result.recoveryAmount,
        status: 'DETECTED',
        organizationId: this.organizationId,
      },
    });

    return detection.id;
  }

  /**
   * Batch save underpayment detections
   */
  async batchSaveUnderpayments(
    results: UnderpaymentResult[]
  ): Promise<{ saved: number; failed: number }> {
    let saved = 0;
    let failed = 0;

    for (const result of results) {
      try {
        await this.saveUnderpaymentDetection(result);
        saved++;
      } catch (error) {
        console.error(`Failed to save underpayment detection:`, error);
        failed++;
      }
    }

    return { saved, failed };
  }
}
