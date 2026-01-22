/**
 * Epic 31: AI Billing Agent - Billing Optimization Advisor
 *
 * US-313: Billing optimization recommendations
 *
 * AI provides recommendations to optimize billing with:
 * - Undercoding opportunity identification
 * - Modifier addition suggestions
 * - Documentation gap flagging
 * - Payer mix optimization
 * - Fee schedule analysis
 * - Contract negotiation insights
 * - Revenue leakage identification
 */

import type { PrismaClient } from '@prisma/client';

// ============================================
// Types
// ============================================

export type OptimizationType =
  | 'UNDERCODING'
  | 'MODIFIER_OPPORTUNITY'
  | 'DOCUMENTATION_GAP'
  | 'PAYER_MIX'
  | 'FEE_SCHEDULE'
  | 'CONTRACT_NEGOTIATION'
  | 'REVENUE_LEAKAGE'
  | 'CODING_OPTIMIZATION'
  | 'PROCEDURE_BUNDLING'
  | 'TIMELY_FILING';

export type OptimizationPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type OptimizationStatus = 'PENDING' | 'REVIEWED' | 'APPLIED' | 'DISMISSED' | 'EXPIRED';

export interface OptimizationRecommendation {
  id: string;
  type: OptimizationType;
  priority: OptimizationPriority;
  title: string;
  description: string;
  potentialRevenue: number;
  confidence: number; // 0-1
  affectedClaims: string[];
  affectedCharges: string[];
  suggestedActions: SuggestedAction[];
  evidence: OptimizationEvidence;
  createdAt: Date;
  expiresAt?: Date;
}

export interface SuggestedAction {
  action: string;
  description: string;
  automatable: boolean;
  impactEstimate: number;
  steps: string[];
}

export interface OptimizationEvidence {
  dataPoints: DataPoint[];
  comparisons: ComparisonData[];
  historicalTrend?: TrendData;
  industryBenchmark?: BenchmarkData;
}

export interface DataPoint {
  label: string;
  value: number | string;
  context?: string;
}

export interface ComparisonData {
  metric: string;
  current: number;
  benchmark: number;
  variance: number;
  variancePercent: number;
}

export interface TrendData {
  periods: string[];
  values: number[];
  trend: 'IMPROVING' | 'DECLINING' | 'STABLE';
  projectedValue?: number;
}

export interface BenchmarkData {
  source: string;
  benchmarkValue: number;
  percentile?: number;
  specialty?: string;
  region?: string;
}

// Input types
export interface GetRecommendationsInput {
  types?: OptimizationType[];
  minPriority?: OptimizationPriority;
  minPotentialRevenue?: number;
  providerId?: string;
  payerId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
}

export interface GetRecommendationsOutput {
  recommendations: OptimizationRecommendation[];
  summary: OptimizationSummary;
  totalPotentialRevenue: number;
  analysisDate: Date;
  processingTimeMs: number;
}

export interface OptimizationSummary {
  totalRecommendations: number;
  byType: Record<OptimizationType, number>;
  byPriority: Record<OptimizationPriority, number>;
  topOpportunities: OptimizationRecommendation[];
}

// Undercoding analysis types
export interface UndercodingOpportunity {
  encounterId: string;
  patientId: string;
  providerId: string;
  serviceDate: Date;
  currentCodes: string[];
  suggestedCodes: string[];
  reason: string;
  additionalRevenue: number;
  documentationSupports: boolean;
  confidence: number;
}

// Modifier analysis types
export interface ModifierOpportunity {
  chargeId: string;
  claimId?: string;
  cptCode: string;
  currentModifiers: string[];
  suggestedModifier: string;
  reason: string;
  revenueImpact: number;
  automatable: boolean;
}

// Documentation gap types
export interface DocumentationGap {
  encounterId: string;
  patientId: string;
  missingElements: string[];
  impactedCodes: string[];
  revenueAtRisk: number;
  urgency: OptimizationPriority;
  suggestedAdditions: string[];
}

// Payer mix analysis types
export interface PayerMixAnalysis {
  currentMix: PayerMixItem[];
  optimalMix: PayerMixItem[];
  recommendations: string[];
  potentialRevenueIncrease: number;
  riskAssessment: string;
}

export interface PayerMixItem {
  payerId: string;
  payerName: string;
  claimCount: number;
  revenuePercent: number;
  avgReimbursementRate: number;
  avgDaysToPayment: number;
  denialRate: number;
}

// Fee schedule analysis types
export interface FeeScheduleAnalysis {
  feeScheduleId: string;
  feeScheduleName: string;
  analysisDate: Date;
  totalCodes: number;
  underpricedCodes: FeeCodeAnalysis[];
  overpricedCodes: FeeCodeAnalysis[];
  optimizationOpportunities: FeeOptimization[];
  totalPotentialIncrease: number;
}

export interface FeeCodeAnalysis {
  cptCode: string;
  currentFee: number;
  marketAverage: number;
  medicareRate: number;
  suggestedFee: number;
  variance: number;
  variancePercent: number;
  volume: number;
  annualImpact: number;
}

export interface FeeOptimization {
  cptCode: string;
  action: 'INCREASE' | 'DECREASE' | 'REVIEW';
  currentFee: number;
  suggestedFee: number;
  rationale: string;
  annualImpact: number;
}

// Contract negotiation types
export interface ContractInsight {
  payerId: string;
  payerName: string;
  contractEndDate?: Date;
  currentReimbursementRate: number;
  marketReimbursementRate: number;
  variancePercent: number;
  topUnderpaidCodes: ContractCodeAnalysis[];
  negotiationPriority: OptimizationPriority;
  estimatedAnnualImpact: number;
  recommendedActions: string[];
}

export interface ContractCodeAnalysis {
  cptCode: string;
  description: string;
  volume: number;
  currentAllowed: number;
  marketAllowed: number;
  variance: number;
  annualImpact: number;
}

// Revenue leakage types
export interface RevenueLeakage {
  category: LeakageCategory;
  description: string;
  affectedItems: LeakageItem[];
  totalLeakage: number;
  recoverable: number;
  preventionActions: string[];
}

export type LeakageCategory =
  | 'MISSED_CHARGES'
  | 'UNDERBILLING'
  | 'UNBILLED_SERVICES'
  | 'TIMELY_FILING_LOSS'
  | 'DENIED_NOT_APPEALED'
  | 'UNDERPAYMENT'
  | 'WRITE_OFF_EXCESS';

export interface LeakageItem {
  entityType: 'CLAIM' | 'CHARGE' | 'ENCOUNTER' | 'DENIAL';
  entityId: string;
  amount: number;
  date: Date;
  reason: string;
}

// ============================================
// Service Class
// ============================================

export class BillingOptimizationAdvisor {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  // ============================================
  // Main Recommendation Engine
  // ============================================

  /**
   * Get comprehensive billing optimization recommendations
   */
  async getRecommendations(
    organizationId: string,
    input: GetRecommendationsInput = {}
  ): Promise<GetRecommendationsOutput> {
    const startTime = Date.now();

    const {
      types,
      minPriority = 'LOW',
      minPotentialRevenue = 0,
      providerId,
      payerId,
      dateFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days
      dateTo = new Date(),
      limit = 50,
    } = input;

    const recommendations: OptimizationRecommendation[] = [];
    const typesToAnalyze = types || [
      'UNDERCODING',
      'MODIFIER_OPPORTUNITY',
      'DOCUMENTATION_GAP',
      'PAYER_MIX',
      'FEE_SCHEDULE',
      'CONTRACT_NEGOTIATION',
      'REVENUE_LEAKAGE',
    ];

    // Run analyses in parallel
    const analyses = await Promise.all([
      typesToAnalyze.includes('UNDERCODING')
        ? this.analyzeUndercoding(organizationId, dateFrom, dateTo, providerId)
        : Promise.resolve([]),
      typesToAnalyze.includes('MODIFIER_OPPORTUNITY')
        ? this.analyzeModifierOpportunities(organizationId, dateFrom, dateTo)
        : Promise.resolve([]),
      typesToAnalyze.includes('DOCUMENTATION_GAP')
        ? this.analyzeDocumentationGaps(organizationId, dateFrom, dateTo, providerId)
        : Promise.resolve([]),
      typesToAnalyze.includes('PAYER_MIX')
        ? this.analyzePayerMix(organizationId, dateFrom, dateTo)
        : Promise.resolve(null),
      typesToAnalyze.includes('FEE_SCHEDULE')
        ? this.analyzeFeeSchedules(organizationId)
        : Promise.resolve([]),
      typesToAnalyze.includes('CONTRACT_NEGOTIATION')
        ? this.analyzeContractNegotiation(organizationId, payerId)
        : Promise.resolve([]),
      typesToAnalyze.includes('REVENUE_LEAKAGE')
        ? this.analyzeRevenueLeakage(organizationId, dateFrom, dateTo)
        : Promise.resolve([]),
    ]);

    const [
      undercodingOpps,
      modifierOpps,
      documentationGaps,
      payerMixAnalysis,
      feeScheduleAnalyses,
      contractInsights,
      revenueLeakages,
    ] = analyses;

    // Convert analyses to recommendations
    for (const opp of undercodingOpps as UndercodingOpportunity[]) {
      recommendations.push(this.createUndercodingRecommendation(opp));
    }

    for (const opp of modifierOpps as ModifierOpportunity[]) {
      recommendations.push(this.createModifierRecommendation(opp));
    }

    for (const gap of documentationGaps as DocumentationGap[]) {
      recommendations.push(this.createDocumentationRecommendation(gap));
    }

    if (payerMixAnalysis) {
      recommendations.push(this.createPayerMixRecommendation(payerMixAnalysis as PayerMixAnalysis));
    }

    for (const analysis of feeScheduleAnalyses as FeeScheduleAnalysis[]) {
      recommendations.push(this.createFeeScheduleRecommendation(analysis));
    }

    for (const insight of contractInsights as ContractInsight[]) {
      recommendations.push(this.createContractRecommendation(insight));
    }

    for (const leakage of revenueLeakages as RevenueLeakage[]) {
      recommendations.push(this.createLeakageRecommendation(leakage));
    }

    // Filter by priority and potential revenue
    const priorityOrder: Record<OptimizationPriority, number> = {
      LOW: 0,
      MEDIUM: 1,
      HIGH: 2,
      CRITICAL: 3,
    };

    const filteredRecommendations = recommendations
      .filter((r) => priorityOrder[r.priority] >= priorityOrder[minPriority])
      .filter((r) => r.potentialRevenue >= minPotentialRevenue)
      .sort((a, b) => {
        // Sort by priority (high first), then by potential revenue
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return b.potentialRevenue - a.potentialRevenue;
      })
      .slice(0, limit);

    // Build summary
    const summary = this.buildSummary(filteredRecommendations);

    const totalPotentialRevenue = filteredRecommendations.reduce(
      (sum, r) => sum + r.potentialRevenue,
      0
    );

    return {
      recommendations: filteredRecommendations,
      summary,
      totalPotentialRevenue,
      analysisDate: new Date(),
      processingTimeMs: Date.now() - startTime,
    };
  }

  // ============================================
  // Undercoding Analysis
  // ============================================

  /**
   * Identify undercoding opportunities by analyzing encounter documentation
   */
  private async analyzeUndercoding(
    organizationId: string,
    dateFrom: Date,
    dateTo: Date,
    providerId?: string
  ): Promise<UndercodingOpportunity[]> {
    const opportunities: UndercodingOpportunity[] = [];

    // Get recent encounters with charges
    const whereClause: Record<string, unknown> = {
      organizationId,
      encounterDate: { gte: dateFrom, lte: dateTo },
      status: { in: ['COMPLETED', 'SIGNED'] },
    };
    if (providerId) whereClause.providerId = providerId;

    const encounters = await this.prisma.encounter.findMany({
      where: whereClause,
      include: {
        charges: true,
        soapNote: true,
        diagnoses: true,
        patient: true,
        provider: true,
      },
      take: 200,
    });

    for (const encounter of encounters) {
      const currentCodes = encounter.charges.map((c) => c.cptCode);
      const suggestedCodes: string[] = [];
      let additionalRevenue = 0;
      const reasons: string[] = [];

      // Check for E/M level opportunities
      const emCode = currentCodes.find((c) => c.startsWith('992'));
      if (emCode && encounter.soapNote) {
        const suggestedEM = this.analyzeEMLevel(encounter.soapNote, emCode);
        if (suggestedEM && suggestedEM !== emCode) {
          suggestedCodes.push(suggestedEM);
          reasons.push(`E/M level may support ${suggestedEM} based on documentation complexity`);
          additionalRevenue += this.estimateCodeDifference(emCode, suggestedEM);
        }
      }

      // Check for missing chiropractic manipulation codes
      if (encounter.soapNote) {
        const soapContent = JSON.stringify(encounter.soapNote);
        const hasAdjustmentDoc = soapContent.toLowerCase().includes('adjustment') ||
                                  soapContent.toLowerCase().includes('manipulation') ||
                                  soapContent.toLowerCase().includes('subluxation');
        const hasManipCode = currentCodes.some((c) =>
          ['98940', '98941', '98942', '98943'].includes(c)
        );

        if (hasAdjustmentDoc && !hasManipCode) {
          // Determine appropriate manipulation code based on regions
          const regionCount = this.countSpinalRegions(soapContent);
          const suggestedCode = this.getManipulationCode(regionCount);
          suggestedCodes.push(suggestedCode);
          reasons.push(`Documentation supports spinal manipulation (${regionCount} regions)`);
          additionalRevenue += 50; // Estimate
        }
      }

      // Check for therapeutic exercise opportunities
      const hasExerciseDoc = encounter.soapNote &&
        JSON.stringify(encounter.soapNote).toLowerCase().includes('exercise');
      const hasExerciseCode = currentCodes.includes('97110');
      if (hasExerciseDoc && !hasExerciseCode) {
        suggestedCodes.push('97110');
        reasons.push('Documentation mentions therapeutic exercises but code 97110 not billed');
        additionalRevenue += 35;
      }

      // Check for manual therapy opportunities
      const hasManualDoc = encounter.soapNote &&
        (JSON.stringify(encounter.soapNote).toLowerCase().includes('manual therapy') ||
         JSON.stringify(encounter.soapNote).toLowerCase().includes('myofascial') ||
         JSON.stringify(encounter.soapNote).toLowerCase().includes('soft tissue'));
      const hasManualCode = currentCodes.includes('97140');
      if (hasManualDoc && !hasManualCode) {
        suggestedCodes.push('97140');
        reasons.push('Documentation supports manual therapy techniques not billed');
        additionalRevenue += 40;
      }

      if (suggestedCodes.length > 0) {
        opportunities.push({
          encounterId: encounter.id,
          patientId: encounter.patientId,
          providerId: encounter.providerId,
          serviceDate: encounter.encounterDate,
          currentCodes,
          suggestedCodes,
          reason: reasons.join('; '),
          additionalRevenue,
          documentationSupports: true,
          confidence: 0.75,
        });
      }
    }

    return opportunities;
  }

  /**
   * Analyze E/M level based on documentation
   */
  private analyzeEMLevel(soapNote: unknown, currentCode: string): string | null {
    const content = JSON.stringify(soapNote).toLowerCase();

    // Count complexity indicators
    let complexityScore = 0;

    // History elements
    if (content.includes('history of present illness') || content.includes('hpi')) complexityScore++;
    if (content.includes('review of systems') || content.includes('ros')) complexityScore++;
    if (content.includes('past medical history') || content.includes('pmh')) complexityScore++;
    if (content.includes('family history')) complexityScore++;
    if (content.includes('social history')) complexityScore++;

    // Examination elements
    if (content.includes('examination') || content.includes('exam')) complexityScore++;
    if (content.includes('range of motion') || content.includes('rom')) complexityScore++;
    if (content.includes('palpation')) complexityScore++;
    if (content.includes('neurological') || content.includes('neuro')) complexityScore++;
    if (content.includes('orthopedic')) complexityScore++;

    // Decision making
    if (content.includes('diagnosis') || content.includes('impression')) complexityScore++;
    if (content.includes('treatment plan') || content.includes('plan')) complexityScore++;
    if (content.includes('medication')) complexityScore++;
    if (content.includes('referral')) complexityScore++;

    // Map score to E/M level (established patient)
    if (complexityScore >= 12 && ['99212', '99213', '99214'].includes(currentCode)) {
      return '99215';
    } else if (complexityScore >= 9 && ['99212', '99213'].includes(currentCode)) {
      return '99214';
    } else if (complexityScore >= 6 && currentCode === '99212') {
      return '99213';
    }

    return null;
  }

  /**
   * Count spinal regions mentioned in documentation
   */
  private countSpinalRegions(content: string): number {
    const lowerContent = content.toLowerCase();
    let count = 0;

    if (lowerContent.includes('cervical') || lowerContent.includes('neck')) count++;
    if (lowerContent.includes('thoracic') || lowerContent.includes('mid-back') || lowerContent.includes('mid back')) count++;
    if (lowerContent.includes('lumbar') || lowerContent.includes('low back') || lowerContent.includes('lower back')) count++;
    if (lowerContent.includes('sacral') || lowerContent.includes('sacrum') || lowerContent.includes('pelvis')) count++;

    return Math.min(count, 5); // Max 5 regions
  }

  /**
   * Get appropriate manipulation code based on region count
   */
  private getManipulationCode(regionCount: number): string {
    if (regionCount >= 5) return '98942';
    if (regionCount >= 3) return '98941';
    return '98940';
  }

  /**
   * Estimate revenue difference between codes
   */
  private estimateCodeDifference(currentCode: string, suggestedCode: string): number {
    const codeValues: Record<string, number> = {
      '99211': 25, '99212': 50, '99213': 85, '99214': 130, '99215': 200,
      '98940': 35, '98941': 50, '98942': 65, '98943': 30,
      '97110': 35, '97140': 40, '97530': 38,
    };

    const currentValue = codeValues[currentCode] || 0;
    const suggestedValue = codeValues[suggestedCode] || 0;

    return Math.max(0, suggestedValue - currentValue);
  }

  // ============================================
  // Modifier Opportunity Analysis
  // ============================================

  /**
   * Identify modifier addition opportunities
   */
  private async analyzeModifierOpportunities(
    organizationId: string,
    dateFrom: Date,
    dateTo: Date
  ): Promise<ModifierOpportunity[]> {
    const opportunities: ModifierOpportunity[] = [];

    // Get charges that may need modifiers - use PENDING and BILLED statuses
    const charges = await this.prisma.charge.findMany({
      where: {
        organizationId,
        serviceDate: { gte: dateFrom, lte: dateTo },
        status: { in: ['PENDING', 'BILLED'] },
      },
      include: {
        encounter: {
          include: {
            charges: true,
            provider: true,
          },
        },
      },
      take: 500,
    });

    for (const charge of charges) {
      const currentModifiers = charge.modifiers || [];

      // Check for AT modifier on chiropractic codes
      if (
        ['98940', '98941', '98942'].includes(charge.cptCode) &&
        !currentModifiers.includes('AT')
      ) {
        opportunities.push({
          chargeId: charge.id,
          cptCode: charge.cptCode,
          currentModifiers,
          suggestedModifier: 'AT',
          reason: 'Medicare requires AT modifier for active treatment manipulation codes',
          revenueImpact: 0, // Compliance, not revenue
          automatable: true,
        });
      }

      // Check for 25 modifier on E/M with procedures same day
      if (
        charge.cptCode.startsWith('992') &&
        !currentModifiers.includes('25') &&
        charge.encounter
      ) {
        const otherCharges = charge.encounter.charges.filter(
          (c) => c.id !== charge.id && !c.cptCode.startsWith('992')
        );
        if (otherCharges.length > 0) {
          opportunities.push({
            chargeId: charge.id,
            cptCode: charge.cptCode,
            currentModifiers,
            suggestedModifier: '25',
            reason: 'E/M service on same day as procedures requires modifier 25',
            revenueImpact: 0, // Prevents denial
            automatable: true,
          });
        }
      }

      // Check for 59 modifier on potentially bundled codes
      const bundledCodes = ['97140', '97110', '97530'];
      if (
        bundledCodes.includes(charge.cptCode) &&
        !currentModifiers.includes('59') &&
        !currentModifiers.includes('XE') &&
        !currentModifiers.includes('XS') &&
        charge.encounter
      ) {
        const otherBundledCharges = charge.encounter.charges.filter(
          (c) => c.id !== charge.id && bundledCodes.includes(c.cptCode)
        );
        if (otherBundledCharges.length > 0) {
          opportunities.push({
            chargeId: charge.id,
            cptCode: charge.cptCode,
            currentModifiers,
            suggestedModifier: '59',
            reason: 'Multiple therapy services may require modifier 59 to prevent bundling denial',
            revenueImpact: charge.fee?.toNumber() || 40,
            automatable: false, // Requires clinical review
          });
        }
      }

      // Check for GP modifier for Medicare PT services
      const ptCodes = ['97110', '97140', '97530', '97112', '97116', '97542'];
      if (
        ptCodes.includes(charge.cptCode) &&
        !currentModifiers.includes('GP')
      ) {
        opportunities.push({
          chargeId: charge.id,
          cptCode: charge.cptCode,
          currentModifiers,
          suggestedModifier: 'GP',
          reason: 'Physical therapy services under a PT plan of care require GP modifier',
          revenueImpact: 0,
          automatable: true,
        });
      }
    }

    return opportunities;
  }

  // ============================================
  // Documentation Gap Analysis
  // ============================================

  /**
   * Identify documentation gaps affecting billing
   */
  private async analyzeDocumentationGaps(
    organizationId: string,
    dateFrom: Date,
    dateTo: Date,
    providerId?: string
  ): Promise<DocumentationGap[]> {
    const gaps: DocumentationGap[] = [];

    const whereClause: Record<string, unknown> = {
      organizationId,
      encounterDate: { gte: dateFrom, lte: dateTo },
      status: 'COMPLETED',
    };
    if (providerId) whereClause.providerId = providerId;

    const encounters = await this.prisma.encounter.findMany({
      where: whereClause,
      include: {
        soapNote: true,
        diagnoses: true,
        charges: true,
        patient: true,
      },
      take: 200,
    });

    for (const encounter of encounters) {
      const missingElements: string[] = [];
      const impactedCodes: string[] = [];
      let revenueAtRisk = 0;
      const suggestedAdditions: string[] = [];

      const soapContent = encounter.soapNote ? JSON.stringify(encounter.soapNote).toLowerCase() : '';

      // Check for diagnosis documentation
      if (!encounter.diagnoses || encounter.diagnoses.length === 0) {
        missingElements.push('Primary diagnosis');
        impactedCodes.push(...encounter.charges.map((c) => c.cptCode));
        revenueAtRisk += encounter.charges.reduce((sum, c) => sum + (c.fee?.toNumber() || 0), 0);
        suggestedAdditions.push('Add ICD-10 diagnosis codes with documentation of medical necessity');
      }

      // Check for medical necessity documentation
      const hasHighValueCodes = encounter.charges.some((c) =>
        ['98941', '98942', '97110', '97140'].includes(c.cptCode)
      );
      if (hasHighValueCodes && !soapContent.includes('medical necessity') && !soapContent.includes('medically necessary')) {
        missingElements.push('Medical necessity statement');
        impactedCodes.push(...encounter.charges.filter((c) =>
          ['98941', '98942', '97110', '97140'].includes(c.cptCode)
        ).map((c) => c.cptCode));
        revenueAtRisk += 50;
        suggestedAdditions.push('Add explicit medical necessity statement linking treatment to diagnosis');
      }

      // Check for treatment goals
      if (!soapContent.includes('goal') && !soapContent.includes('objective')) {
        missingElements.push('Treatment goals');
        suggestedAdditions.push('Document measurable treatment goals with timeline');
      }

      // Check for functional limitations
      if (!soapContent.includes('function') && !soapContent.includes('adl') && !soapContent.includes('activity')) {
        missingElements.push('Functional limitations');
        suggestedAdditions.push('Document how condition affects daily activities and function');
      }

      // Check for progress notes on ongoing treatment
      if (encounter.charges.some((c) => ['97110', '97140', '97530'].includes(c.cptCode))) {
        if (!soapContent.includes('progress') && !soapContent.includes('improve') && !soapContent.includes('response')) {
          missingElements.push('Treatment progress documentation');
          suggestedAdditions.push('Document patient response to treatment and progress toward goals');
        }
      }

      // Check for time documentation on timed codes
      const timedCodes = ['97110', '97140', '97530', '97542', '97112'];
      const hasTimedCodes = encounter.charges.some((c) => timedCodes.includes(c.cptCode));
      if (hasTimedCodes && !soapContent.includes('minute') && !soapContent.includes('min')) {
        missingElements.push('Time documentation for timed codes');
        const timedCharges = encounter.charges.filter((c) => timedCodes.includes(c.cptCode));
        impactedCodes.push(...timedCharges.map((c) => c.cptCode));
        revenueAtRisk += timedCharges.reduce((sum, c) => sum + (c.fee?.toNumber() || 0), 0) * 0.3;
        suggestedAdditions.push('Document actual time spent for each timed service (8-minute rule)');
      }

      if (missingElements.length > 0) {
        gaps.push({
          encounterId: encounter.id,
          patientId: encounter.patientId,
          missingElements,
          impactedCodes: Array.from(new Set(impactedCodes)),
          revenueAtRisk,
          urgency: revenueAtRisk > 100 ? 'HIGH' : revenueAtRisk > 50 ? 'MEDIUM' : 'LOW',
          suggestedAdditions,
        });
      }
    }

    return gaps;
  }

  // ============================================
  // Payer Mix Analysis
  // ============================================

  /**
   * Analyze payer mix and identify optimization opportunities
   */
  private async analyzePayerMix(
    organizationId: string,
    dateFrom: Date,
    dateTo: Date
  ): Promise<PayerMixAnalysis | null> {
    // Get claims by payer
    const claims = await this.prisma.claim.findMany({
      where: {
        organizationId,
        createdDate: { gte: dateFrom, lte: dateTo },
        status: { not: 'DRAFT' },
      },
      include: {
        payer: true,
        payments: true,
      },
    });

    if (claims.length === 0) return null;

    // Group by payer
    const payerStats: Record<string, {
      payerId: string;
      payerName: string;
      claims: typeof claims;
      totalBilled: number;
      totalPaid: number;
      totalDays: number;
      deniedCount: number;
    }> = {};

    for (const claim of claims) {
      const payerId = claim.payerId || 'SELF_PAY';
      const payerName = claim.payer?.name || 'Self Pay';

      if (!payerStats[payerId]) {
        payerStats[payerId] = {
          payerId,
          payerName,
          claims: [],
          totalBilled: 0,
          totalPaid: 0,
          totalDays: 0,
          deniedCount: 0,
        };
      }

      payerStats[payerId].claims.push(claim);
      payerStats[payerId].totalBilled += claim.totalCharges?.toNumber() || 0;

      for (const payment of claim.payments) {
        payerStats[payerId].totalPaid += payment.amount?.toNumber() || 0;
      }

      if (claim.paidDate && claim.submittedDate) {
        payerStats[payerId].totalDays +=
          (claim.paidDate.getTime() - claim.submittedDate.getTime()) / (1000 * 60 * 60 * 24);
      }

      if (claim.status === 'DENIED') {
        payerStats[payerId].deniedCount++;
      }
    }

    const totalRevenue = Object.values(payerStats).reduce((sum, p) => sum + p.totalPaid, 0);

    const currentMix: PayerMixItem[] = Object.values(payerStats).map((stats) => ({
      payerId: stats.payerId,
      payerName: stats.payerName,
      claimCount: stats.claims.length,
      revenuePercent: totalRevenue > 0 ? (stats.totalPaid / totalRevenue) * 100 : 0,
      avgReimbursementRate: stats.totalBilled > 0 ? (stats.totalPaid / stats.totalBilled) * 100 : 0,
      avgDaysToPayment: stats.claims.length > 0 ? stats.totalDays / stats.claims.length : 0,
      denialRate: stats.claims.length > 0 ? (stats.deniedCount / stats.claims.length) * 100 : 0,
    }));

    // Sort by reimbursement rate
    currentMix.sort((a, b) => b.avgReimbursementRate - a.avgReimbursementRate);

    // Generate recommendations
    const recommendations: string[] = [];
    let potentialRevenueIncrease = 0;

    // Identify low-reimbursing payers
    const lowReimbursers = currentMix.filter((p) => p.avgReimbursementRate < 50 && p.revenuePercent > 5);
    for (const payer of lowReimbursers) {
      recommendations.push(
        `${payer.payerName} has ${payer.avgReimbursementRate.toFixed(1)}% reimbursement rate - consider contract renegotiation or network status review`
      );
      potentialRevenueIncrease += (payer.revenuePercent / 100) * totalRevenue * 0.1;
    }

    // Identify high-denial payers
    const highDenialPayers = currentMix.filter((p) => p.denialRate > 10 && p.claimCount > 5);
    for (const payer of highDenialPayers) {
      recommendations.push(
        `${payer.payerName} has ${payer.denialRate.toFixed(1)}% denial rate - review payer-specific billing requirements`
      );
    }

    // Identify slow payers
    const slowPayers = currentMix.filter((p) => p.avgDaysToPayment > 45 && p.claimCount > 5);
    for (const payer of slowPayers) {
      recommendations.push(
        `${payer.payerName} averages ${payer.avgDaysToPayment.toFixed(0)} days to payment - implement earlier follow-up protocols`
      );
    }

    return {
      currentMix,
      optimalMix: currentMix, // Optimal would require market data
      recommendations,
      potentialRevenueIncrease,
      riskAssessment: lowReimbursers.length > 2 ? 'HIGH' : lowReimbursers.length > 0 ? 'MEDIUM' : 'LOW',
    };
  }

  // ============================================
  // Fee Schedule Analysis
  // ============================================

  /**
   * Analyze fee schedules for optimization opportunities
   */
  private async analyzeFeeSchedules(organizationId: string): Promise<FeeScheduleAnalysis[]> {
    const analyses: FeeScheduleAnalysis[] = [];

    const feeSchedules = await this.prisma.feeSchedule.findMany({
      where: { organizationId },
      include: {
        items: true,
      },
    });

    // Medicare reference rates (simplified)
    const medicareRates: Record<string, number> = {
      '99212': 45, '99213': 75, '99214': 110, '99215': 150,
      '98940': 30, '98941': 45, '98942': 55,
      '97110': 32, '97140': 35, '97530': 33,
      '97112': 30, '97116': 28, '97542': 25,
    };

    // Market average (Medicare * 1.5 as estimate)
    const marketMultiplier = 1.5;

    for (const schedule of feeSchedules) {
      const underpricedCodes: FeeCodeAnalysis[] = [];
      const overpricedCodes: FeeCodeAnalysis[] = [];
      const optimizationOpportunities: FeeOptimization[] = [];
      let totalPotentialIncrease = 0;

      for (const item of schedule.items) {
        const medicareRate = medicareRates[item.cptCode];
        if (!medicareRate) continue;

        const marketAverage = medicareRate * marketMultiplier;
        const currentFee = item.fee.toNumber();
        const variance = currentFee - marketAverage;
        const variancePercent = (variance / marketAverage) * 100;

        // Get volume for this code
        const volume = await this.prisma.charge.count({
          where: {
            organizationId,
            cptCode: item.cptCode,
            serviceDate: { gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) },
          },
        });

        const annualImpact = (marketAverage - currentFee) * volume;

        const codeAnalysis: FeeCodeAnalysis = {
          cptCode: item.cptCode,
          currentFee,
          marketAverage,
          medicareRate,
          suggestedFee: marketAverage,
          variance,
          variancePercent,
          volume,
          annualImpact,
        };

        if (variancePercent < -15 && annualImpact > 100) {
          underpricedCodes.push(codeAnalysis);
          totalPotentialIncrease += annualImpact;

          optimizationOpportunities.push({
            cptCode: item.cptCode,
            action: 'INCREASE',
            currentFee,
            suggestedFee: marketAverage,
            rationale: `${variancePercent.toFixed(0)}% below market average`,
            annualImpact,
          });
        } else if (variancePercent > 30) {
          overpricedCodes.push(codeAnalysis);
          // Note: Overpriced codes may lead to lower collections
        }
      }

      if (optimizationOpportunities.length > 0) {
        analyses.push({
          feeScheduleId: schedule.id,
          feeScheduleName: schedule.name,
          analysisDate: new Date(),
          totalCodes: schedule.items.length,
          underpricedCodes,
          overpricedCodes,
          optimizationOpportunities,
          totalPotentialIncrease,
        });
      }
    }

    return analyses;
  }

  // ============================================
  // Contract Negotiation Analysis
  // ============================================

  /**
   * Analyze contracts for negotiation opportunities
   */
  private async analyzeContractNegotiation(
    organizationId: string,
    payerId?: string
  ): Promise<ContractInsight[]> {
    const insights: ContractInsight[] = [];

    const whereClause: Record<string, unknown> = { isActive: true };
    if (payerId) whereClause.id = payerId;

    const payers = await this.prisma.insurancePayer.findMany({
      where: whereClause,
    });

    for (const payer of payers) {
      // Get payment history for this payer
      const claims = await this.prisma.claim.findMany({
        where: {
          organizationId,
          payerId: payer.id,
          status: 'PAID',
          paidDate: { gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) },
        },
        include: {
          claimLines: true,
          payments: true,
        },
        take: 500,
      });

      if (claims.length < 10) continue;

      // Calculate actual reimbursement rates by CPT code
      const codeStats: Record<string, { billed: number; paid: number; count: number }> = {};

      for (const claim of claims) {
        for (const line of claim.claimLines) {
          if (!codeStats[line.cptCode]) {
            codeStats[line.cptCode] = { billed: 0, paid: 0, count: 0 };
          }
          codeStats[line.cptCode].billed += line.chargedAmount?.toNumber() || 0;
          codeStats[line.cptCode].count++;
        }

        // Allocate payments proportionally
        const totalBilled = claim.claimLines.reduce((sum, l) => sum + (l.chargedAmount?.toNumber() || 0), 0);
        const totalPaid = claim.payments.reduce((sum, p) => sum + (p.amount?.toNumber() || 0), 0);

        for (const line of claim.claimLines) {
          const proportion = totalBilled > 0 ? (line.chargedAmount?.toNumber() || 0) / totalBilled : 0;
          codeStats[line.cptCode].paid += totalPaid * proportion;
        }
      }

      // Compare to market rates
      const topUnderpaidCodes: ContractCodeAnalysis[] = [];
      let totalVariance = 0;

      // Market allowed amounts (simplified)
      const marketAllowed: Record<string, number> = {
        '99212': 40, '99213': 70, '99214': 100, '99215': 140,
        '98940': 28, '98941': 42, '98942': 52,
        '97110': 30, '97140': 33, '97530': 31,
      };

      for (const [code, stats] of Object.entries(codeStats)) {
        if (stats.count < 5) continue;

        const avgPaid = stats.paid / stats.count;
        const marketRate = marketAllowed[code] || avgPaid;
        const variance = marketRate - avgPaid;

        if (variance > 5) {
          const annualImpact = variance * stats.count;
          totalVariance += annualImpact;

          topUnderpaidCodes.push({
            cptCode: code,
            description: `CPT ${code}`,
            volume: stats.count,
            currentAllowed: avgPaid,
            marketAllowed: marketRate,
            variance,
            annualImpact,
          });
        }
      }

      // Sort by annual impact
      topUnderpaidCodes.sort((a, b) => b.annualImpact - a.annualImpact);

      if (topUnderpaidCodes.length > 0) {
        const totalBilled = Object.values(codeStats).reduce((sum, s) => sum + s.billed, 0);
        const totalPaid = Object.values(codeStats).reduce((sum, s) => sum + s.paid, 0);
        const currentRate = totalBilled > 0 ? (totalPaid / totalBilled) * 100 : 0;

        // Estimate market rate
        const marketRate = Math.min(currentRate + 10, 85);

        insights.push({
          payerId: payer.id,
          payerName: payer.name,
          contractEndDate: undefined, // Would need to be stored
          currentReimbursementRate: currentRate,
          marketReimbursementRate: marketRate,
          variancePercent: ((marketRate - currentRate) / currentRate) * 100,
          topUnderpaidCodes: topUnderpaidCodes.slice(0, 10),
          negotiationPriority: totalVariance > 10000 ? 'HIGH' : totalVariance > 5000 ? 'MEDIUM' : 'LOW',
          estimatedAnnualImpact: totalVariance,
          recommendedActions: [
            `Request fee schedule increase for top ${Math.min(5, topUnderpaidCodes.length)} underpaid codes`,
            'Benchmark against regional Medicare rates',
            'Document volume to demonstrate value to payer',
            totalVariance > 10000 ? 'Consider network status if negotiation fails' : 'Schedule annual contract review',
          ],
        });
      }
    }

    return insights;
  }

  // ============================================
  // Revenue Leakage Analysis
  // ============================================

  /**
   * Identify revenue leakage across billing process
   */
  private async analyzeRevenueLeakage(
    organizationId: string,
    dateFrom: Date,
    dateTo: Date
  ): Promise<RevenueLeakage[]> {
    const leakages: RevenueLeakage[] = [];

    // 1. Unbilled encounters
    const unbilledEncounters = await this.prisma.encounter.findMany({
      where: {
        organizationId,
        encounterDate: { gte: dateFrom, lte: dateTo },
        status: { in: ['COMPLETED', 'SIGNED'] },
        charges: { none: {} },
      },
      include: {
        patient: true,
        provider: true,
      },
      take: 100,
    });

    if (unbilledEncounters.length > 0) {
      const estimatedLeakage = unbilledEncounters.length * 150; // Estimate $150/encounter
      leakages.push({
        category: 'UNBILLED_SERVICES',
        description: `${unbilledEncounters.length} completed encounters have no charges`,
        affectedItems: unbilledEncounters.map((e) => ({
          entityType: 'ENCOUNTER' as const,
          entityId: e.id,
          amount: 150,
          date: e.encounterDate,
          reason: 'Completed encounter without charges',
        })),
        totalLeakage: estimatedLeakage,
        recoverable: estimatedLeakage,
        preventionActions: [
          'Implement charge capture alerts for unsigned encounters',
          'Require charge entry before encounter completion',
          'Daily review of unbilled encounters report',
        ],
      });
    }

    // 2. Timely filing at risk
    const timelyFilingRisk = await this.prisma.claim.findMany({
      where: {
        organizationId,
        status: 'DRAFT',
        createdDate: { lte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) },
      },
      include: {
        payer: true,
      },
      take: 100,
    });

    if (timelyFilingRisk.length > 0) {
      const totalAtRisk = timelyFilingRisk.reduce(
        (sum, c) => sum + (c.totalCharges?.toNumber() || 0),
        0
      );
      leakages.push({
        category: 'TIMELY_FILING_LOSS',
        description: `${timelyFilingRisk.length} claims over 60 days old still in draft status`,
        affectedItems: timelyFilingRisk.map((c) => ({
          entityType: 'CLAIM' as const,
          entityId: c.id,
          amount: c.totalCharges?.toNumber() || 0,
          date: c.createdDate,
          reason: `Draft claim ${Math.floor((Date.now() - c.createdDate.getTime()) / (1000 * 60 * 60 * 24))} days old`,
        })),
        totalLeakage: totalAtRisk,
        recoverable: totalAtRisk * 0.9, // 90% may be recoverable if submitted now
        preventionActions: [
          'Implement 14-day draft claim alerts',
          'Auto-escalate claims approaching filing deadline',
          'Weekly clean-up of draft claims queue',
        ],
      });
    }

    // 3. Denied claims not appealed
    const unappealedDenials = await this.prisma.claim.findMany({
      where: {
        organizationId,
        status: 'DENIED',
        createdDate: { gte: dateFrom },
        aiAppeals: { none: {} },
      },
      take: 100,
    });

    if (unappealedDenials.length > 0) {
      const totalDenied = unappealedDenials.reduce(
        (sum, c) => sum + (c.totalCharges?.toNumber() || 0),
        0
      );
      const recoverableEstimate = totalDenied * 0.4; // 40% appeal success rate estimate

      leakages.push({
        category: 'DENIED_NOT_APPEALED',
        description: `${unappealedDenials.length} denied claims have no appeal on file`,
        affectedItems: unappealedDenials.map((c) => ({
          entityType: 'CLAIM' as const,
          entityId: c.id,
          amount: c.totalCharges?.toNumber() || 0,
          date: c.createdDate,
          reason: c.statusMessage || 'Denial not appealed',
        })),
        totalLeakage: totalDenied,
        recoverable: recoverableEstimate,
        preventionActions: [
          'Enable AI-powered appeal generation',
          'Auto-queue appealable denials',
          'Track appeal deadline dates',
        ],
      });
    }

    // 4. Underpayments not followed up
    const potentialUnderpayments = await this.prisma.charge.findMany({
      where: {
        organizationId,
        serviceDate: { gte: dateFrom, lte: dateTo },
        status: 'PAID',
      },
      take: 500,
    });

    const underpaymentItems: LeakageItem[] = [];
    let underpaymentTotal = 0;

    for (const charge of potentialUnderpayments) {
      // Using fee as expected amount and payments as actual
      const expectedAmount = charge.fee?.toNumber() || 0;
      const paidAmount = charge.payments?.toNumber() || 0;

      if (expectedAmount > 0 && paidAmount < expectedAmount * 0.7) {
        const variance = expectedAmount - paidAmount;
        if (variance > 5) {
          underpaymentItems.push({
            entityType: 'CHARGE',
            entityId: charge.id,
            amount: variance,
            date: charge.serviceDate,
            reason: `Paid $${paidAmount.toFixed(2)} vs fee $${expectedAmount.toFixed(2)}`,
          });
          underpaymentTotal += variance;
        }
      }
    }

    if (underpaymentItems.length > 0) {
      leakages.push({
        category: 'UNDERPAYMENT',
        description: `${underpaymentItems.length} charges appear underpaid by payers`,
        affectedItems: underpaymentItems.slice(0, 50),
        totalLeakage: underpaymentTotal,
        recoverable: underpaymentTotal * 0.7,
        preventionActions: [
          'Enable underpayment detection scanning',
          'Verify fee schedules match contracted rates',
          'Appeal systematic underpayments to payer',
        ],
      });
    }

    return leakages;
  }

  // ============================================
  // Recommendation Builders
  // ============================================

  private createUndercodingRecommendation(opp: UndercodingOpportunity): OptimizationRecommendation {
    return {
      id: `undercoding-${opp.encounterId}`,
      type: 'UNDERCODING',
      priority: opp.additionalRevenue > 100 ? 'HIGH' : opp.additionalRevenue > 50 ? 'MEDIUM' : 'LOW',
      title: 'Undercoding Opportunity Detected',
      description: opp.reason,
      potentialRevenue: opp.additionalRevenue,
      confidence: opp.confidence,
      affectedClaims: [],
      affectedCharges: [],
      suggestedActions: [
        {
          action: 'Review coding',
          description: `Consider adding codes: ${opp.suggestedCodes.join(', ')}`,
          automatable: false,
          impactEstimate: opp.additionalRevenue,
          steps: [
            'Review encounter documentation',
            'Verify suggested codes are supported',
            'Add applicable codes to charge entry',
            'Resubmit claim if already submitted',
          ],
        },
      ],
      evidence: {
        dataPoints: [
          { label: 'Current codes', value: opp.currentCodes.join(', ') },
          { label: 'Suggested codes', value: opp.suggestedCodes.join(', ') },
          { label: 'Service date', value: opp.serviceDate.toISOString().split('T')[0] },
        ],
        comparisons: [],
      },
      createdAt: new Date(),
    };
  }

  private createModifierRecommendation(opp: ModifierOpportunity): OptimizationRecommendation {
    return {
      id: `modifier-${opp.chargeId}`,
      type: 'MODIFIER_OPPORTUNITY',
      priority: opp.automatable ? 'MEDIUM' : 'LOW',
      title: `Add Modifier ${opp.suggestedModifier} to ${opp.cptCode}`,
      description: opp.reason,
      potentialRevenue: opp.revenueImpact,
      confidence: 0.9,
      affectedClaims: opp.claimId ? [opp.claimId] : [],
      affectedCharges: [opp.chargeId],
      suggestedActions: [
        {
          action: 'Add modifier',
          description: `Add modifier ${opp.suggestedModifier} to CPT ${opp.cptCode}`,
          automatable: opp.automatable,
          impactEstimate: opp.revenueImpact,
          steps: opp.automatable
            ? ['Apply modifier automatically']
            : ['Review clinical documentation', 'Verify modifier applicability', 'Apply modifier'],
        },
      ],
      evidence: {
        dataPoints: [
          { label: 'CPT code', value: opp.cptCode },
          { label: 'Current modifiers', value: opp.currentModifiers.join(', ') || 'None' },
          { label: 'Suggested modifier', value: opp.suggestedModifier },
        ],
        comparisons: [],
      },
      createdAt: new Date(),
    };
  }

  private createDocumentationRecommendation(gap: DocumentationGap): OptimizationRecommendation {
    return {
      id: `docgap-${gap.encounterId}`,
      type: 'DOCUMENTATION_GAP',
      priority: gap.urgency,
      title: 'Documentation Gap Affecting Billing',
      description: `Missing: ${gap.missingElements.join(', ')}`,
      potentialRevenue: gap.revenueAtRisk,
      confidence: 0.8,
      affectedClaims: [],
      affectedCharges: [],
      suggestedActions: gap.suggestedAdditions.map((suggestion) => ({
        action: 'Update documentation',
        description: suggestion,
        automatable: false,
        impactEstimate: gap.revenueAtRisk / gap.suggestedAdditions.length,
        steps: ['Review encounter', 'Add missing documentation', 'Verify billing codes still appropriate'],
      })),
      evidence: {
        dataPoints: [
          { label: 'Missing elements', value: gap.missingElements.length.toString() },
          { label: 'Impacted codes', value: gap.impactedCodes.join(', ') },
          { label: 'Revenue at risk', value: `$${gap.revenueAtRisk.toFixed(2)}` },
        ],
        comparisons: [],
      },
      createdAt: new Date(),
    };
  }

  private createPayerMixRecommendation(analysis: PayerMixAnalysis): OptimizationRecommendation {
    return {
      id: `payermix-${Date.now()}`,
      type: 'PAYER_MIX',
      priority: analysis.riskAssessment === 'HIGH' ? 'HIGH' : analysis.riskAssessment === 'MEDIUM' ? 'MEDIUM' : 'LOW',
      title: 'Payer Mix Optimization Opportunity',
      description: analysis.recommendations.join('; '),
      potentialRevenue: analysis.potentialRevenueIncrease,
      confidence: 0.7,
      affectedClaims: [],
      affectedCharges: [],
      suggestedActions: analysis.recommendations.map((rec) => ({
        action: 'Review payer relationship',
        description: rec,
        automatable: false,
        impactEstimate: analysis.potentialRevenueIncrease / analysis.recommendations.length,
        steps: ['Analyze payer performance', 'Identify opportunities', 'Develop action plan'],
      })),
      evidence: {
        dataPoints: analysis.currentMix.slice(0, 5).map((p) => ({
          label: p.payerName,
          value: `${p.revenuePercent.toFixed(1)}% revenue, ${p.avgReimbursementRate.toFixed(1)}% reimbursement`,
        })),
        comparisons: analysis.currentMix.slice(0, 3).map((p) => ({
          metric: `${p.payerName} reimbursement rate`,
          current: p.avgReimbursementRate,
          benchmark: 70, // Industry average
          variance: p.avgReimbursementRate - 70,
          variancePercent: ((p.avgReimbursementRate - 70) / 70) * 100,
        })),
      },
      createdAt: new Date(),
    };
  }

  private createFeeScheduleRecommendation(analysis: FeeScheduleAnalysis): OptimizationRecommendation {
    return {
      id: `feeschedule-${analysis.feeScheduleId}`,
      type: 'FEE_SCHEDULE',
      priority: analysis.totalPotentialIncrease > 10000 ? 'HIGH' : analysis.totalPotentialIncrease > 5000 ? 'MEDIUM' : 'LOW',
      title: `Fee Schedule "${analysis.feeScheduleName}" Optimization`,
      description: `${analysis.underpricedCodes.length} codes below market rate`,
      potentialRevenue: analysis.totalPotentialIncrease,
      confidence: 0.85,
      affectedClaims: [],
      affectedCharges: [],
      suggestedActions: analysis.optimizationOpportunities.slice(0, 5).map((opt) => ({
        action: `${opt.action} ${opt.cptCode}`,
        description: opt.rationale,
        automatable: false,
        impactEstimate: opt.annualImpact,
        steps: [
          `Review current fee: $${opt.currentFee.toFixed(2)}`,
          `Consider new fee: $${opt.suggestedFee.toFixed(2)}`,
          'Update fee schedule',
          'Apply to future charges',
        ],
      })),
      evidence: {
        dataPoints: [
          { label: 'Total codes analyzed', value: analysis.totalCodes.toString() },
          { label: 'Underpriced codes', value: analysis.underpricedCodes.length.toString() },
          { label: 'Potential annual increase', value: `$${analysis.totalPotentialIncrease.toFixed(2)}` },
        ],
        comparisons: analysis.underpricedCodes.slice(0, 5).map((code) => ({
          metric: code.cptCode,
          current: code.currentFee,
          benchmark: code.marketAverage,
          variance: code.variance,
          variancePercent: code.variancePercent,
        })),
      },
      createdAt: new Date(),
    };
  }

  private createContractRecommendation(insight: ContractInsight): OptimizationRecommendation {
    return {
      id: `contract-${insight.payerId}`,
      type: 'CONTRACT_NEGOTIATION',
      priority: insight.negotiationPriority,
      title: `Contract Negotiation: ${insight.payerName}`,
      description: `${insight.variancePercent.toFixed(1)}% below market reimbursement rate`,
      potentialRevenue: insight.estimatedAnnualImpact,
      confidence: 0.75,
      affectedClaims: [],
      affectedCharges: [],
      suggestedActions: insight.recommendedActions.map((action) => ({
        action: 'Contract negotiation',
        description: action,
        automatable: false,
        impactEstimate: insight.estimatedAnnualImpact / insight.recommendedActions.length,
        steps: ['Prepare data', 'Schedule meeting', 'Present analysis', 'Negotiate terms'],
      })),
      evidence: {
        dataPoints: [
          { label: 'Current rate', value: `${insight.currentReimbursementRate.toFixed(1)}%` },
          { label: 'Market rate', value: `${insight.marketReimbursementRate.toFixed(1)}%` },
          { label: 'Annual impact', value: `$${insight.estimatedAnnualImpact.toFixed(2)}` },
        ],
        comparisons: insight.topUnderpaidCodes.slice(0, 5).map((code) => ({
          metric: code.cptCode,
          current: code.currentAllowed,
          benchmark: code.marketAllowed,
          variance: code.variance,
          variancePercent: (code.variance / code.marketAllowed) * 100,
        })),
      },
      createdAt: new Date(),
    };
  }

  private createLeakageRecommendation(leakage: RevenueLeakage): OptimizationRecommendation {
    const categoryTitles: Record<LeakageCategory, string> = {
      MISSED_CHARGES: 'Missed Charge Capture',
      UNDERBILLING: 'Underbilling Detected',
      UNBILLED_SERVICES: 'Unbilled Services',
      TIMELY_FILING_LOSS: 'Timely Filing Risk',
      DENIED_NOT_APPEALED: 'Unappealed Denials',
      UNDERPAYMENT: 'Underpayment Detected',
      WRITE_OFF_EXCESS: 'Excessive Write-offs',
    };

    return {
      id: `leakage-${leakage.category}-${Date.now()}`,
      type: 'REVENUE_LEAKAGE',
      priority: leakage.recoverable > 5000 ? 'HIGH' : leakage.recoverable > 2000 ? 'MEDIUM' : 'LOW',
      title: categoryTitles[leakage.category],
      description: leakage.description,
      potentialRevenue: leakage.recoverable,
      confidence: 0.85,
      affectedClaims: leakage.affectedItems.filter((i) => i.entityType === 'CLAIM').map((i) => i.entityId),
      affectedCharges: leakage.affectedItems.filter((i) => i.entityType === 'CHARGE').map((i) => i.entityId),
      suggestedActions: leakage.preventionActions.map((action) => ({
        action: 'Prevent leakage',
        description: action,
        automatable: action.toLowerCase().includes('auto') || action.toLowerCase().includes('enable'),
        impactEstimate: leakage.recoverable / leakage.preventionActions.length,
        steps: ['Implement action', 'Monitor results', 'Adjust as needed'],
      })),
      evidence: {
        dataPoints: [
          { label: 'Total leakage', value: `$${leakage.totalLeakage.toFixed(2)}` },
          { label: 'Recoverable', value: `$${leakage.recoverable.toFixed(2)}` },
          { label: 'Affected items', value: leakage.affectedItems.length.toString() },
        ],
        comparisons: [],
      },
      createdAt: new Date(),
    };
  }

  // ============================================
  // Summary Builder
  // ============================================

  private buildSummary(recommendations: OptimizationRecommendation[]): OptimizationSummary {
    const byType: Record<OptimizationType, number> = {
      UNDERCODING: 0,
      MODIFIER_OPPORTUNITY: 0,
      DOCUMENTATION_GAP: 0,
      PAYER_MIX: 0,
      FEE_SCHEDULE: 0,
      CONTRACT_NEGOTIATION: 0,
      REVENUE_LEAKAGE: 0,
      CODING_OPTIMIZATION: 0,
      PROCEDURE_BUNDLING: 0,
      TIMELY_FILING: 0,
    };

    const byPriority: Record<OptimizationPriority, number> = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      CRITICAL: 0,
    };

    for (const rec of recommendations) {
      byType[rec.type]++;
      byPriority[rec.priority]++;
    }

    return {
      totalRecommendations: recommendations.length,
      byType,
      byPriority,
      topOpportunities: recommendations.slice(0, 5),
    };
  }

  // ============================================
  // Action Methods
  // ============================================

  /**
   * Mark recommendation as reviewed
   */
  async markReviewed(
    organizationId: string,
    recommendationId: string,
    _userId: string,
    notes?: string
  ): Promise<void> {
    // In a full implementation, this would update a recommendations table
    // For now, log to audit
    await this.prisma.aIBillingAudit.create({
      data: {
        action: 'OPTIMIZATION_REVIEWED',
        entityType: 'Recommendation',
        entityId: recommendationId,
        organizationId,
        inputData: { notes },
        outputData: { status: 'REVIEWED' },
      },
    });
  }

  /**
   * Apply recommendation action
   */
  async applyRecommendation(
    organizationId: string,
    recommendationId: string,
    _userId: string,
    actionIndex: number
  ): Promise<{ success: boolean; message: string }> {
    // Log the application
    await this.prisma.aIBillingAudit.create({
      data: {
        action: 'OPTIMIZATION_APPLIED',
        entityType: 'Recommendation',
        entityId: recommendationId,
        organizationId,
        inputData: { actionIndex },
        outputData: { status: 'APPLIED' },
      },
    });

    return {
      success: true,
      message: 'Recommendation action logged. Please complete the suggested steps manually.',
    };
  }

  /**
   * Dismiss recommendation
   */
  async dismissRecommendation(
    organizationId: string,
    recommendationId: string,
    _userId: string,
    reason: string
  ): Promise<void> {
    await this.prisma.aIBillingAudit.create({
      data: {
        action: 'OPTIMIZATION_DISMISSED',
        entityType: 'Recommendation',
        entityId: recommendationId,
        organizationId,
        inputData: { reason },
        outputData: { status: 'DISMISSED' },
      },
    });
  }
}
