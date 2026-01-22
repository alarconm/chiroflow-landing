/**
 * Epic 09: AI Billing Agent - Payment Matching Service
 *
 * Intelligent matching of ERA/remittance payments to charges.
 * Uses fuzzy matching and confidence scoring to suggest payment allocations.
 */

import type { PrismaClient } from '@prisma/client';
import type {
  PaymentMatchInput,
  PaymentMatchOutput,
  PaymentMatchResult,
  MatchCriteria,
  SuggestedAllocation,
} from './types';

// Matching thresholds
const MATCH_THRESHOLDS = {
  HIGH_CONFIDENCE: 0.85,
  MEDIUM_CONFIDENCE: 0.65,
  LOW_CONFIDENCE: 0.45,
  MIN_ACCEPTABLE: 0.30,
};

// Weight factors for match scoring
const MATCH_WEIGHTS = {
  patientMatch: 0.30,
  dateMatch: 0.25,
  amountMatch: 0.25,
  codeMatch: 0.20,
};

// Levenshtein distance for fuzzy name matching
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;

  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

// Calculate string similarity (0-1)
function stringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;

  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1;

  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1;

  const distance = levenshteinDistance(s1, s2);
  return 1 - distance / maxLen;
}

// Parse patient name components
function parsePatientName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/[\s,]+/);

  // Handle "LAST, FIRST" format
  if (fullName.includes(',')) {
    return {
      lastName: parts[0] || '',
      firstName: parts[1] || '',
    };
  }

  // Handle "FIRST LAST" format
  return {
    firstName: parts[0] || '',
    lastName: parts[parts.length - 1] || '',
  };
}

export class PaymentMatcher {
  private prisma: PrismaClient;
  private organizationId: string;

  constructor(prisma: PrismaClient, organizationId: string) {
    this.prisma = prisma;
    this.organizationId = organizationId;
  }

  /**
   * Find matching charges for a payment
   */
  async matchPayment(input: PaymentMatchInput): Promise<PaymentMatchOutput> {
    const startTime = Date.now();

    // Build search criteria
    const searchCriteria = this.buildSearchCriteria(input);

    // Fetch potential matching charges
    const potentialMatches = await this.fetchPotentialMatches(searchCriteria, input);

    // Score and rank matches
    const scoredMatches = await this.scoreMatches(potentialMatches, input);

    // Filter to acceptable confidence levels
    const validMatches = scoredMatches.filter(
      m => m.confidenceScore >= MATCH_THRESHOLDS.MIN_ACCEPTABLE
    );

    // Sort by confidence score descending
    validMatches.sort((a, b) => b.confidenceScore - a.confidenceScore);

    return {
      matches: validMatches.slice(0, 10), // Return top 10 matches
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Build search criteria from input
   */
  private buildSearchCriteria(input: PaymentMatchInput): any {
    const criteria: any = {
      organizationId: input.organizationId,
      // Only match unposted or partially posted charges
      paymentStatus: { in: ['PENDING', 'PARTIAL'] },
    };

    // Add date range if service date provided
    if (input.serviceDate) {
      const startDate = new Date(input.serviceDate);
      startDate.setDate(startDate.getDate() - 30); // 30 days before

      const endDate = new Date(input.serviceDate);
      endDate.setDate(endDate.getDate() + 30); // 30 days after

      criteria.serviceDate = {
        gte: startDate,
        lte: endDate,
      };
    }

    // Add CPT code filter if provided
    if (input.cptCode) {
      criteria.cptCode = input.cptCode;
    }

    return criteria;
  }

  /**
   * Fetch potential matching charges from database
   */
  private async fetchPotentialMatches(criteria: any, input: PaymentMatchInput): Promise<any[]> {
    // Get charges that could potentially match
    const charges = await this.prisma.charge.findMany({
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
      },
      take: 100, // Limit to top 100 potential matches
      orderBy: {
        serviceDate: 'desc',
      },
    });

    return charges;
  }

  /**
   * Score all potential matches
   */
  private async scoreMatches(
    charges: any[],
    input: PaymentMatchInput
  ): Promise<PaymentMatchResult[]> {
    const results: PaymentMatchResult[] = [];

    for (const charge of charges) {
      const matchCriteria = this.calculateMatchCriteria(charge, input);
      const confidenceScore = this.calculateOverallScore(matchCriteria);

      if (confidenceScore >= MATCH_THRESHOLDS.MIN_ACCEPTABLE) {
        const suggestedAllocation = this.calculateAllocation(charge, input.paymentAmount);

        results.push({
          chargeId: charge.id,
          patientId: charge.patientId,
          patientName: `${charge.patient?.demographics?.firstName || ''} ${charge.patient?.demographics?.lastName || ''}`.trim(),
          chargeAmount: charge.amount?.toNumber() || 0,
          serviceDate: charge.serviceDate,
          cptCode: charge.cptCode || charge.procedure?.cptCode || '',
          confidenceScore: Math.round(confidenceScore * 100) / 100,
          matchMethod: this.determineMatchMethod(matchCriteria),
          matchCriteria,
          suggestedAllocation,
        });
      }
    }

    return results;
  }

  /**
   * Calculate match criteria scores
   */
  private calculateMatchCriteria(charge: any, input: PaymentMatchInput): MatchCriteria {
    // Patient name matching
    const patientMatch = this.calculatePatientMatch(charge, input);

    // Date matching
    const dateMatch = this.calculateDateMatch(charge.serviceDate, input.serviceDate);

    // Amount matching
    const amountMatch = this.calculateAmountMatch(
      charge.amount?.toNumber() || 0,
      input.paymentAmount
    );

    // CPT code matching
    const codeMatch = this.calculateCodeMatch(
      charge.cptCode || charge.procedure?.cptCode,
      input.cptCode
    );

    // Calculate overall weighted score
    const overall =
      patientMatch * MATCH_WEIGHTS.patientMatch +
      dateMatch * MATCH_WEIGHTS.dateMatch +
      amountMatch * MATCH_WEIGHTS.amountMatch +
      codeMatch * MATCH_WEIGHTS.codeMatch;

    return {
      patientMatch: Math.round(patientMatch * 100) / 100,
      dateMatch: Math.round(dateMatch * 100) / 100,
      amountMatch: Math.round(amountMatch * 100) / 100,
      codeMatch: Math.round(codeMatch * 100) / 100,
      overall: Math.round(overall * 100) / 100,
    };
  }

  /**
   * Calculate patient name match score
   */
  private calculatePatientMatch(charge: any, input: PaymentMatchInput): number {
    let score = 0;
    let factors = 0;

    // Match by patient name
    if (input.patientName) {
      const chargeName = `${charge.patient.firstName} ${charge.patient.lastName}`;
      const inputParsed = parsePatientName(input.patientName);
      const chargeParsed = {
        firstName: charge.patient.firstName || '',
        lastName: charge.patient.lastName || '',
      };

      // Last name match (more important)
      const lastNameScore = stringSimilarity(inputParsed.lastName, chargeParsed.lastName);

      // First name match
      const firstNameScore = stringSimilarity(inputParsed.firstName, chargeParsed.firstName);

      // Full name similarity
      const fullNameScore = stringSimilarity(input.patientName, chargeName);

      score += Math.max(
        fullNameScore,
        lastNameScore * 0.6 + firstNameScore * 0.4
      );
      factors++;
    }

    // Match by patient account number
    if (input.patientAccountNumber) {
      // Check if account number matches patient ID or any identifier
      if (
        charge.patient.id === input.patientAccountNumber ||
        charge.patient.accountNumber === input.patientAccountNumber
      ) {
        score += 1;
      } else {
        // Partial match
        const patientId = charge.patient.id || '';
        const accountNum = input.patientAccountNumber || '';
        if (patientId.includes(accountNum) || accountNum.includes(patientId)) {
          score += 0.7;
        }
      }
      factors++;
    }

    return factors > 0 ? score / factors : 0;
  }

  /**
   * Calculate date match score
   */
  private calculateDateMatch(chargeDate: Date | null, inputDate?: Date): number {
    if (!inputDate || !chargeDate) return 0.5; // Neutral if no date to compare

    const chargeDateMs = new Date(chargeDate).getTime();
    const inputDateMs = new Date(inputDate).getTime();
    const daysDiff = Math.abs(chargeDateMs - inputDateMs) / (1000 * 60 * 60 * 24);

    if (daysDiff === 0) return 1;
    if (daysDiff <= 1) return 0.95;
    if (daysDiff <= 3) return 0.85;
    if (daysDiff <= 7) return 0.7;
    if (daysDiff <= 14) return 0.5;
    if (daysDiff <= 30) return 0.3;
    return 0.1;
  }

  /**
   * Calculate amount match score
   */
  private calculateAmountMatch(chargeAmount: number, paymentAmount: number): number {
    if (chargeAmount === 0) return 0;

    // Calculate remaining balance on charge
    const ratio = paymentAmount / chargeAmount;

    // Exact match
    if (Math.abs(ratio - 1) < 0.01) return 1;

    // Within 5%
    if (Math.abs(ratio - 1) < 0.05) return 0.95;

    // Payment less than charge (common)
    if (ratio > 0.5 && ratio < 1) return 0.8;

    // Payment is typical percentage (80-90% of charge)
    if (ratio >= 0.7 && ratio <= 0.9) return 0.85;

    // Payment significantly less (possible copay adjustment)
    if (ratio >= 0.3 && ratio < 0.7) return 0.6;

    // Payment very different
    if (ratio < 0.3 || ratio > 1.5) return 0.2;

    return 0.4;
  }

  /**
   * Calculate CPT code match score
   */
  private calculateCodeMatch(chargeCode?: string, inputCode?: string): number {
    if (!inputCode) return 0.5; // Neutral if no code to compare
    if (!chargeCode) return 0.2;

    if (chargeCode === inputCode) return 1;

    // Check for related codes (same category)
    if (chargeCode.substring(0, 3) === inputCode.substring(0, 3)) return 0.7;

    return 0.1;
  }

  /**
   * Calculate overall confidence score
   */
  private calculateOverallScore(criteria: MatchCriteria): number {
    return criteria.overall;
  }

  /**
   * Determine the primary match method
   */
  private determineMatchMethod(criteria: MatchCriteria): string {
    const scores = [
      { method: 'PATIENT_NAME', score: criteria.patientMatch },
      { method: 'SERVICE_DATE', score: criteria.dateMatch },
      { method: 'AMOUNT', score: criteria.amountMatch },
      { method: 'CPT_CODE', score: criteria.codeMatch },
    ];

    scores.sort((a, b) => b.score - a.score);
    return scores[0].method;
  }

  /**
   * Calculate suggested payment allocation
   */
  private calculateAllocation(
    charge: any,
    paymentAmount: number
  ): SuggestedAllocation {
    const chargeAmount = charge.amount?.toNumber() || 0;
    const alreadyPaid = charge.paidAmount?.toNumber() || 0;
    const remainingBalance = chargeAmount - alreadyPaid;

    // If payment covers the remaining balance
    if (paymentAmount >= remainingBalance) {
      return {
        chargeId: charge.id,
        amount: remainingBalance,
        adjustmentAmount: 0,
        patientResponsibility: 0,
      };
    }

    // If payment is less than remaining balance
    // Estimate patient responsibility based on typical insurance patterns
    const estimatedAllowedAmount = chargeAmount * 0.8; // 80% is common
    const insurancePaid = paymentAmount;
    const adjustmentAmount = Math.max(0, chargeAmount - estimatedAllowedAmount);
    const patientResponsibility = Math.max(
      0,
      remainingBalance - paymentAmount - adjustmentAmount
    );

    return {
      chargeId: charge.id,
      amount: paymentAmount,
      adjustmentAmount: Math.round(adjustmentAmount * 100) / 100,
      patientResponsibility: Math.round(patientResponsibility * 100) / 100,
    };
  }

  /**
   * Auto-match multiple payments from an ERA
   */
  async batchMatchPayments(
    payments: PaymentMatchInput[]
  ): Promise<Map<string, PaymentMatchOutput>> {
    const results = new Map<string, PaymentMatchOutput>();

    for (const payment of payments) {
      const key = payment.remittanceLineId || `${payment.patientName}-${payment.serviceDate}`;
      try {
        const matches = await this.matchPayment(payment);
        results.set(key, matches);
      } catch (error) {
        console.error(`Failed to match payment ${key}:`, error);
        results.set(key, { matches: [], processingTimeMs: 0 });
      }
    }

    return results;
  }

  /**
   * Get match confidence level label
   */
  static getConfidenceLevel(score: number): 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY_LOW' {
    if (score >= MATCH_THRESHOLDS.HIGH_CONFIDENCE) return 'HIGH';
    if (score >= MATCH_THRESHOLDS.MEDIUM_CONFIDENCE) return 'MEDIUM';
    if (score >= MATCH_THRESHOLDS.LOW_CONFIDENCE) return 'LOW';
    return 'VERY_LOW';
  }

  /**
   * Auto-post high-confidence matches
   */
  async autoPostHighConfidenceMatches(
    matches: PaymentMatchResult[],
    remittanceId: string
  ): Promise<{ posted: number; skipped: number }> {
    let posted = 0;
    let skipped = 0;

    for (const match of matches) {
      if (match.confidenceScore >= MATCH_THRESHOLDS.HIGH_CONFIDENCE) {
        try {
          // Create payment record with allocation
          const payment = await this.prisma.payment.create({
            data: {
              amount: match.suggestedAllocation.amount,
              paymentDate: new Date(),
              paymentMethod: 'ACH',
              payerType: 'insurance',
              patientId: match.patientId,
              organizationId: this.organizationId,
              notes: `Auto-posted from ERA. Confidence: ${match.confidenceScore}`,
              allocations: {
                create: {
                  amount: match.suggestedAllocation.amount,
                  chargeId: match.chargeId,
                },
              },
            },
          });

          // Update charge payments total
          await this.prisma.charge.update({
            where: { id: match.chargeId },
            data: {
              payments: {
                increment: match.suggestedAllocation.amount,
              },
            },
          });

          posted++;
        } catch (error) {
          console.error(`Failed to auto-post match for charge ${match.chargeId}:`, error);
          skipped++;
        }
      } else {
        skipped++;
      }
    }

    return { posted, skipped };
  }

  /**
   * Find unmatched payments (for review queue)
   */
  async findUnmatchedPayments(remittanceId: string): Promise<any[]> {
    const remittanceLines = await this.prisma.remittanceLineItem.findMany({
      where: {
        remittanceId,
        isPosted: false,
      },
      include: {
        remittance: true,
      },
    });

    return remittanceLines;
  }
}
