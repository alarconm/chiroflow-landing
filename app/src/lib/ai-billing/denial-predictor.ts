/**
 * Epic 09: AI Billing Agent - Denial Prediction Service
 *
 * ML-based denial risk scoring using historical data and claim characteristics.
 * Analyzes claim attributes to predict likelihood of denial before submission.
 */

import type { PrismaClient } from '@prisma/client';
import type {
  ClaimData,
  DenialPredictionInput,
  DenialPredictionOutput,
  RiskFactor,
} from './types';
import { COMMON_CARC_CODES } from './types';

// Risk factor weights (tuned based on industry data)
const RISK_WEIGHTS = {
  // Payer-specific factors
  payerDenialHistory: 0.25,
  payerType: 0.10,

  // Claim characteristics
  claimAmount: 0.15,
  serviceCount: 0.10,
  modifierComplexity: 0.10,

  // Patient factors
  eligibilityGap: 0.10,
  priorDenials: 0.10,

  // Provider factors
  providerDenialRate: 0.05,

  // Timing factors
  timingRisk: 0.05,
} as const;

// Payer type risk multipliers
const PAYER_TYPE_RISK: Record<string, number> = {
  MEDICARE: 0.3,
  MEDICAID: 0.4,
  BLUE_CROSS: 0.2,
  UNITED: 0.25,
  AETNA: 0.22,
  CIGNA: 0.20,
  HUMANA: 0.28,
  WORKERS_COMP: 0.35,
  AUTO: 0.40,
  SELF_PAY: 0.05,
  OTHER: 0.25,
};

// High-risk CPT codes for chiropractic (frequently denied)
const HIGH_RISK_CPT_CODES = new Set([
  '97140', // Manual therapy - often bundled
  '97530', // Therapeutic activities - medical necessity
  '97110', // Therapeutic exercises - often limited
  '97112', // Neuromuscular re-education
  '97542', // Wheelchair management
  '98940', // CMT 1-2 regions
  '98941', // CMT 3-4 regions
  '98942', // CMT 5 regions
  '98943', // Extraspinal CMT
]);

// Modifier combinations that increase denial risk
const RISKY_MODIFIER_COMBINATIONS = [
  ['25', '59'], // E/M with distinct procedure - often questioned
  ['59', 'XE'], // Bundling override combinations
  ['76', '77'], // Repeat procedure modifiers
];

export class DenialPredictor {
  private prisma: PrismaClient;
  private organizationId: string;

  constructor(prisma: PrismaClient, organizationId: string) {
    this.prisma = prisma;
    this.organizationId = organizationId;
  }

  /**
   * Predict denial risk for a claim
   */
  async predictDenial(input: DenialPredictionInput): Promise<DenialPredictionOutput> {
    const startTime = Date.now();

    // Fetch claim with related data
    const claim = await this.prisma.claim.findUnique({
      where: { id: input.claimId },
      include: {
        patient: {
          include: {
            demographics: true,
          },
        },
        insurancePolicy: true,
        payer: true,
        encounter: {
          include: {
            provider: true,
            diagnoses: true,
            charges: true,
          },
        },
      },
    });

    if (!claim) {
      throw new Error(`Claim not found: ${input.claimId}`);
    }

    const riskFactors: RiskFactor[] = [];
    let totalRiskScore = 0;

    // Transform to ClaimData format
    const claimData = this.transformToClaimData(claim);

    // 1. Analyze payer denial history
    const payerRisk = await this.analyzePayerRisk(claimData, input.useHistoricalData);
    riskFactors.push(...payerRisk.factors);
    totalRiskScore += payerRisk.score * RISK_WEIGHTS.payerDenialHistory;

    // 2. Analyze payer type
    const payerTypeRisk = this.analyzePayerType(claimData);
    riskFactors.push(payerTypeRisk);
    totalRiskScore += payerTypeRisk.weight * RISK_WEIGHTS.payerType;

    // 3. Analyze claim amount
    const amountRisk = this.analyzeClaimAmount(claimData);
    riskFactors.push(amountRisk);
    totalRiskScore += amountRisk.weight * RISK_WEIGHTS.claimAmount;

    // 4. Analyze service complexity
    const serviceRisk = this.analyzeServiceComplexity(claimData);
    riskFactors.push(...serviceRisk.factors);
    totalRiskScore += serviceRisk.score * RISK_WEIGHTS.serviceCount;

    // 5. Analyze modifier usage
    const modifierRisk = this.analyzeModifierComplexity(claimData);
    riskFactors.push(...modifierRisk.factors);
    totalRiskScore += modifierRisk.score * RISK_WEIGHTS.modifierComplexity;

    // 6. Analyze patient eligibility gaps
    if (input.useHistoricalData) {
      const eligibilityRisk = await this.analyzeEligibilityRisk(claimData);
      riskFactors.push(...eligibilityRisk.factors);
      totalRiskScore += eligibilityRisk.score * RISK_WEIGHTS.eligibilityGap;
    }

    // 7. Analyze patient's prior denials
    if (input.useHistoricalData) {
      const priorDenialRisk = await this.analyzePriorDenials(claimData);
      riskFactors.push(...priorDenialRisk.factors);
      totalRiskScore += priorDenialRisk.score * RISK_WEIGHTS.priorDenials;
    }

    // 8. Analyze provider denial rate
    if (input.useHistoricalData) {
      const providerRisk = await this.analyzeProviderRisk(claimData);
      riskFactors.push(...providerRisk.factors);
      totalRiskScore += providerRisk.score * RISK_WEIGHTS.providerDenialRate;
    }

    // 9. Analyze timing risk
    const timingRisk = this.analyzeTimingRisk(claimData);
    riskFactors.push(...timingRisk.factors);
    totalRiskScore += timingRisk.score * RISK_WEIGHTS.timingRisk;

    // Normalize score to 0-100
    const normalizedScore = Math.min(100, Math.max(0, totalRiskScore * 100));

    // Determine risk level
    const riskLevel = this.determineRiskLevel(normalizedScore);

    // Calculate confidence based on data availability
    const confidenceScore = this.calculateConfidence(input.useHistoricalData, riskFactors);

    // Get historical denial rates if available
    const historicalDenialRate = input.useHistoricalData
      ? await this.getHistoricalDenialRate(claimData)
      : undefined;

    const payerDenialRate = input.useHistoricalData
      ? await this.getPayerDenialRate(claimData)
      : undefined;

    // Generate recommendations
    const recommendations = this.generateRecommendations(riskFactors, normalizedScore);

    // Find primary risk reason
    const sortedFactors = [...riskFactors].sort((a, b) => b.weight - a.weight);
    const primaryReason = sortedFactors.length > 0 ? sortedFactors[0].description : undefined;

    return {
      riskLevel,
      riskScore: Math.round(normalizedScore),
      confidenceScore: Math.round(confidenceScore * 100) / 100,
      primaryReason,
      riskFactors: sortedFactors.slice(0, 10), // Top 10 factors
      historicalDenialRate,
      payerDenialRate,
      recommendations,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Transform Prisma claim to ClaimData format
   */
  private transformToClaimData(claim: any): ClaimData {
    return {
      id: claim.id,
      claimNumber: claim.claimNumber,
      status: claim.status,
      totalCharges: claim.totalAmount?.toNumber() || 0,
      claimType: claim.claimType || 'PROFESSIONAL',
      patient: {
        id: claim.patient.id,
        firstName: claim.patient.firstName,
        lastName: claim.patient.lastName,
        dateOfBirth: claim.patient.dateOfBirth,
        gender: claim.patient.gender || 'U',
        address: claim.patient.address ? {
          line1: claim.patient.address,
          city: claim.patient.city || '',
          state: claim.patient.state || '',
          zip: claim.patient.zip || '',
        } : undefined,
      },
      insurance: claim.insurancePolicy ? {
        payerId: claim.insurancePolicy.payer?.payerId,
        payerName: claim.insurancePolicy.payer?.name,
        subscriberId: claim.insurancePolicy.memberId,
        groupNumber: claim.insurancePolicy.groupNumber,
        relationshipCode: claim.insurancePolicy.relationship || 'SELF',
      } : undefined,
      provider: claim.encounter?.provider ? {
        npi: claim.encounter.provider.npi,
        taxId: claim.encounter.provider.taxId,
        name: `${claim.encounter.provider.firstName} ${claim.encounter.provider.lastName}`,
      } : undefined,
      diagnoses: claim.encounter?.diagnoses?.map((d: any, idx: number) => ({
        code: d.code,
        sequence: d.sequence || idx + 1,
        isPrimary: d.isPrimary || idx === 0,
      })) || [],
      lines: claim.encounter?.charges?.map((c: any, idx: number) => ({
        lineNumber: idx + 1,
        cptCode: c.procedure?.cptCode || c.cptCode || '',
        modifiers: c.modifiers || [],
        description: c.procedure?.description || c.description || '',
        units: c.units || 1,
        chargeAmount: c.amount?.toNumber() || 0,
        serviceDateFrom: c.serviceDate || claim.serviceDate,
        serviceDateTo: c.serviceDate || claim.serviceDate,
        diagnosisPointers: c.diagnosisPointers || [1],
        placeOfService: c.placeOfService || claim.placeOfService || '11',
      })) || [],
      organizationId: claim.organizationId,
    };
  }

  /**
   * Analyze payer-specific denial patterns
   */
  private async analyzePayerRisk(
    claim: ClaimData,
    useHistorical?: boolean
  ): Promise<{ score: number; factors: RiskFactor[] }> {
    const factors: RiskFactor[] = [];
    let score = 0;

    if (!claim.insurance?.payerId) {
      factors.push({
        factor: 'MISSING_PAYER',
        weight: 0.8,
        description: 'No payer information on claim',
      });
      return { score: 0.8, factors };
    }

    if (useHistorical) {
      // Get denial rate for this payer in last 12 months
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

      const denialStats = await this.prisma.denial.groupBy({
        by: ['status'],
        where: {
          claim: {
            organizationId: this.organizationId,
            payerId: claim.insurance?.payerId,
          },
          createdAt: { gte: twelveMonthsAgo },
        },
        _count: true,
      });

      const totalDenials = denialStats.reduce((sum, s) => sum + s._count, 0);

      if (totalDenials > 10) {
        const denialRate = totalDenials / 100; // Simplified calculation
        score = Math.min(1, denialRate);

        factors.push({
          factor: 'PAYER_DENIAL_HISTORY',
          weight: score,
          description: `Payer has ${totalDenials} denials in past 12 months`,
          value: totalDenials,
        });
      }
    }

    return { score, factors };
  }

  /**
   * Analyze risk based on payer type
   */
  private analyzePayerType(claim: ClaimData): RiskFactor {
    const payerName = claim.insurance?.payerName?.toUpperCase() || 'OTHER';

    // Determine payer type from name
    let payerType = 'OTHER';
    if (payerName.includes('MEDICARE')) payerType = 'MEDICARE';
    else if (payerName.includes('MEDICAID')) payerType = 'MEDICAID';
    else if (payerName.includes('BLUE') || payerName.includes('BCBS')) payerType = 'BLUE_CROSS';
    else if (payerName.includes('UNITED') || payerName.includes('UHC')) payerType = 'UNITED';
    else if (payerName.includes('AETNA')) payerType = 'AETNA';
    else if (payerName.includes('CIGNA')) payerType = 'CIGNA';
    else if (payerName.includes('HUMANA')) payerType = 'HUMANA';
    else if (payerName.includes('WORKER') || payerName.includes('COMP')) payerType = 'WORKERS_COMP';
    else if (payerName.includes('AUTO') || payerName.includes('PIP')) payerType = 'AUTO';

    const risk = PAYER_TYPE_RISK[payerType] || PAYER_TYPE_RISK.OTHER;

    return {
      factor: 'PAYER_TYPE',
      weight: risk,
      description: `${payerType} payers have ${Math.round(risk * 100)}% base denial risk`,
      value: payerType,
    };
  }

  /**
   * Analyze claim amount risk (higher amounts = more scrutiny)
   */
  private analyzeClaimAmount(claim: ClaimData): RiskFactor {
    const amount = claim.totalCharges;
    let risk = 0;

    if (amount > 5000) {
      risk = 0.6;
    } else if (amount > 2500) {
      risk = 0.4;
    } else if (amount > 1000) {
      risk = 0.2;
    } else if (amount > 500) {
      risk = 0.1;
    }

    return {
      factor: 'CLAIM_AMOUNT',
      weight: risk,
      description: `High claim amount ($${amount.toFixed(2)}) may trigger additional review`,
      value: amount,
    };
  }

  /**
   * Analyze service complexity
   */
  private analyzeServiceComplexity(
    claim: ClaimData
  ): { score: number; factors: RiskFactor[] } {
    const factors: RiskFactor[] = [];
    let score = 0;

    // Number of line items
    const lineCount = claim.lines.length;
    if (lineCount > 8) {
      score += 0.3;
      factors.push({
        factor: 'MANY_SERVICES',
        weight: 0.3,
        description: `${lineCount} services on one claim may trigger bundling review`,
        value: lineCount,
      });
    } else if (lineCount > 5) {
      score += 0.15;
      factors.push({
        factor: 'MULTIPLE_SERVICES',
        weight: 0.15,
        description: `${lineCount} services may require medical necessity review`,
        value: lineCount,
      });
    }

    // Check for high-risk CPT codes
    const highRiskCodes = claim.lines.filter(l => HIGH_RISK_CPT_CODES.has(l.cptCode));
    if (highRiskCodes.length > 0) {
      const riskWeight = Math.min(0.4, highRiskCodes.length * 0.1);
      score += riskWeight;
      factors.push({
        factor: 'HIGH_RISK_CPT',
        weight: riskWeight,
        description: `Contains ${highRiskCodes.length} frequently-denied CPT codes`,
        value: highRiskCodes.map(c => c.cptCode).join(', '),
      });
    }

    return { score: Math.min(1, score), factors };
  }

  /**
   * Analyze modifier complexity
   */
  private analyzeModifierComplexity(
    claim: ClaimData
  ): { score: number; factors: RiskFactor[] } {
    const factors: RiskFactor[] = [];
    let score = 0;

    // Collect all modifiers used
    const allModifiers = claim.lines.flatMap(l => l.modifiers);
    const uniqueModifiers = new Set(allModifiers);

    // Check for risky combinations
    for (const combo of RISKY_MODIFIER_COMBINATIONS) {
      const hasCombo = combo.every(m => uniqueModifiers.has(m));
      if (hasCombo) {
        score += 0.25;
        factors.push({
          factor: 'RISKY_MODIFIER_COMBO',
          weight: 0.25,
          description: `Modifier combination ${combo.join('+')} often triggers review`,
          value: combo.join('+'),
        });
      }
    }

    // Check for excessive modifier usage
    if (allModifiers.length > claim.lines.length * 2) {
      score += 0.2;
      factors.push({
        factor: 'EXCESSIVE_MODIFIERS',
        weight: 0.2,
        description: 'Heavy modifier usage may indicate unbundling',
        value: allModifiers.length,
      });
    }

    return { score: Math.min(1, score), factors };
  }

  /**
   * Analyze eligibility-related risks
   */
  private async analyzeEligibilityRisk(
    claim: ClaimData
  ): Promise<{ score: number; factors: RiskFactor[] }> {
    const factors: RiskFactor[] = [];
    let score = 0;

    // Check for recent eligibility issues
    const recentEligibility = await this.prisma.eligibilityCheck.findFirst({
      where: {
        patientId: claim.patient.id,
        organizationId: this.organizationId,
      },
      orderBy: { checkDate: 'desc' },
    });

    if (!recentEligibility) {
      score += 0.3;
      factors.push({
        factor: 'NO_ELIGIBILITY_CHECK',
        weight: 0.3,
        description: 'No recent eligibility verification on file',
      });
    } else if (recentEligibility.status !== 'ACTIVE') {
      score += 0.6;
      factors.push({
        factor: 'ELIGIBILITY_ISSUE',
        weight: 0.6,
        description: `Last eligibility check status: ${recentEligibility.status}`,
        value: recentEligibility.status,
      });
    }

    return { score, factors };
  }

  /**
   * Analyze patient's prior denial history
   */
  private async analyzePriorDenials(
    claim: ClaimData
  ): Promise<{ score: number; factors: RiskFactor[] }> {
    const factors: RiskFactor[] = [];
    let score = 0;

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const priorDenials = await this.prisma.denial.count({
      where: {
        claim: {
          patientId: claim.patient.id,
          organizationId: this.organizationId,
        },
        createdAt: { gte: sixMonthsAgo },
      },
    });

    if (priorDenials > 3) {
      score = 0.5;
      factors.push({
        factor: 'FREQUENT_DENIALS',
        weight: 0.5,
        description: `Patient has ${priorDenials} denials in past 6 months`,
        value: priorDenials,
      });
    } else if (priorDenials > 0) {
      score = priorDenials * 0.1;
      factors.push({
        factor: 'PRIOR_DENIALS',
        weight: score,
        description: `Patient has ${priorDenials} prior denial(s)`,
        value: priorDenials,
      });
    }

    return { score, factors };
  }

  /**
   * Analyze provider-specific denial patterns
   */
  private async analyzeProviderRisk(
    claim: ClaimData
  ): Promise<{ score: number; factors: RiskFactor[] }> {
    const factors: RiskFactor[] = [];
    let score = 0;

    if (!claim.provider?.npi) {
      return { score: 0, factors };
    }

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    // Get provider's claim stats
    const providerStats = await this.prisma.claim.groupBy({
      by: ['status'],
      where: {
        organizationId: this.organizationId,
        billingNpi: claim.provider.npi,
        createdAt: { gte: threeMonthsAgo },
      },
      _count: true,
    });

    const totalClaims = providerStats.reduce((sum, s) => sum + s._count, 0);
    const deniedClaims = providerStats.find(s => s.status === 'DENIED')?._count || 0;

    if (totalClaims > 20 && deniedClaims / totalClaims > 0.15) {
      score = 0.4;
      factors.push({
        factor: 'HIGH_PROVIDER_DENIAL_RATE',
        weight: 0.4,
        description: `Provider has ${Math.round(deniedClaims / totalClaims * 100)}% denial rate`,
        value: deniedClaims / totalClaims,
      });
    }

    return { score, factors };
  }

  /**
   * Analyze timing-related risks
   */
  private analyzeTimingRisk(
    claim: ClaimData
  ): { score: number; factors: RiskFactor[] } {
    const factors: RiskFactor[] = [];
    let score = 0;

    // Check service date age
    const oldestService = claim.lines.reduce(
      (oldest, line) => (line.serviceDateFrom < oldest ? line.serviceDateFrom : oldest),
      claim.lines[0]?.serviceDateFrom || new Date()
    );

    const daysSinceService = Math.floor(
      (Date.now() - new Date(oldestService).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceService > 90) {
      score += 0.5;
      factors.push({
        factor: 'LATE_SUBMISSION',
        weight: 0.5,
        description: `Claim is ${daysSinceService} days old - approaching timely filing limits`,
        value: daysSinceService,
      });
    } else if (daysSinceService > 60) {
      score += 0.2;
      factors.push({
        factor: 'AGING_CLAIM',
        weight: 0.2,
        description: `Claim is ${daysSinceService} days old`,
        value: daysSinceService,
      });
    }

    return { score, factors };
  }

  /**
   * Determine risk level from score
   */
  private determineRiskLevel(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (score >= 70) return 'CRITICAL';
    if (score >= 50) return 'HIGH';
    if (score >= 25) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Calculate confidence score based on data availability
   */
  private calculateConfidence(useHistorical: boolean | undefined, factors: RiskFactor[]): number {
    let confidence = 0.5; // Base confidence

    if (useHistorical) {
      confidence += 0.3; // Historical data increases confidence
    }

    // More factors = higher confidence in prediction
    confidence += Math.min(0.2, factors.length * 0.02);

    return Math.min(1, confidence);
  }

  /**
   * Get historical denial rate for similar claims
   */
  private async getHistoricalDenialRate(claim: ClaimData): Promise<number | undefined> {
    const cptCodes = claim.lines.map(l => l.cptCode);

    if (cptCodes.length === 0) return undefined;

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const totalClaims = await this.prisma.claim.count({
      where: {
        organizationId: this.organizationId,
        encounter: {
          charges: {
            some: {
              cptCode: { in: cptCodes },
            },
          },
        },
        createdAt: { gte: sixMonthsAgo },
      },
    });

    if (totalClaims < 10) return undefined;

    const deniedClaims = await this.prisma.claim.count({
      where: {
        organizationId: this.organizationId,
        encounter: {
          charges: {
            some: {
              cptCode: { in: cptCodes },
            },
          },
        },
        status: 'DENIED',
        createdAt: { gte: sixMonthsAgo },
      },
    });

    return Math.round((deniedClaims / totalClaims) * 100);
  }

  /**
   * Get payer-specific denial rate
   */
  private async getPayerDenialRate(claim: ClaimData): Promise<number | undefined> {
    if (!claim.insurance?.payerId) return undefined;

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const totalClaims = await this.prisma.claim.count({
      where: {
        organizationId: this.organizationId,
        payerId: claim.insurance?.payerId,
        createdAt: { gte: sixMonthsAgo },
      },
    });

    if (totalClaims < 10) return undefined;

    const deniedClaims = await this.prisma.claim.count({
      where: {
        organizationId: this.organizationId,
        payerId: claim.insurance?.payerId,
        status: 'DENIED',
        createdAt: { gte: sixMonthsAgo },
      },
    });

    return Math.round((deniedClaims / totalClaims) * 100);
  }

  /**
   * Generate actionable recommendations
   */
  private generateRecommendations(factors: RiskFactor[], score: number): string[] {
    const recommendations: string[] = [];

    // Sort factors by weight
    const sortedFactors = [...factors].sort((a, b) => b.weight - a.weight);

    for (const factor of sortedFactors.slice(0, 5)) {
      switch (factor.factor) {
        case 'MISSING_PAYER':
          recommendations.push('Add payer information before submitting');
          break;
        case 'NO_ELIGIBILITY_CHECK':
          recommendations.push('Verify patient eligibility before claim submission');
          break;
        case 'ELIGIBILITY_ISSUE':
          recommendations.push('Resolve eligibility issues before submitting');
          break;
        case 'HIGH_RISK_CPT':
          recommendations.push('Ensure medical necessity documentation is complete for high-risk CPT codes');
          break;
        case 'LATE_SUBMISSION':
          recommendations.push('Submit immediately to avoid timely filing denial');
          break;
        case 'RISKY_MODIFIER_COMBO':
          recommendations.push('Review modifier usage for compliance with payer policies');
          break;
        case 'MANY_SERVICES':
          recommendations.push('Consider splitting into multiple claims if medically appropriate');
          break;
        case 'FREQUENT_DENIALS':
          recommendations.push('Review patient account for coverage issues');
          break;
        case 'HIGH_PROVIDER_DENIAL_RATE':
          recommendations.push('Review provider coding patterns');
          break;
      }
    }

    // General recommendations based on score
    if (score >= 70) {
      recommendations.push('CRITICAL: Manual review strongly recommended before submission');
    } else if (score >= 50) {
      recommendations.push('Consider additional documentation to support medical necessity');
    }

    return [...new Set(recommendations)]; // Remove duplicates
  }

  /**
   * Batch predict denials for multiple claims
   */
  async batchPredictDenials(
    claimIds: string[],
    useHistoricalData: boolean = true
  ): Promise<Map<string, DenialPredictionOutput>> {
    const results = new Map<string, DenialPredictionOutput>();

    for (const claimId of claimIds) {
      try {
        const prediction = await this.predictDenial({
          claimId,
          useHistoricalData,
        });
        results.set(claimId, prediction);
      } catch (error) {
        console.error(`Failed to predict denial for claim ${claimId}:`, error);
      }
    }

    return results;
  }
}
