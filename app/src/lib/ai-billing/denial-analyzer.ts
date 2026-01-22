/**
 * Epic 31: AI Billing Agent - Denial Analyzer
 *
 * US-309: Denial analysis and routing
 *
 * AI agent that analyzes claim denials with:
 * - Denial type categorization (coding, eligibility, authorization)
 * - Determination if correctable or needs appeal
 * - Intelligent routing to appropriate workflow
 * - Learning from denial patterns
 * - Prevention strategy suggestions
 * - Provider-level denial trending
 */

import type { PrismaClient, Denial, DenialStatus } from '@prisma/client';
import { COMMON_CARC_CODES } from './types';

// ============================================
// Types
// ============================================

export type DenialCategory =
  | 'CODING'
  | 'ELIGIBILITY'
  | 'AUTHORIZATION'
  | 'MEDICAL_NECESSITY'
  | 'TIMELY_FILING'
  | 'DUPLICATE'
  | 'BUNDLING'
  | 'DOCUMENTATION'
  | 'COORDINATION_OF_BENEFITS'
  | 'OTHER';

export type DenialWorkflow =
  | 'CORRECT_AND_RESUBMIT'
  | 'APPEAL'
  | 'PATIENT_RESPONSIBILITY'
  | 'WRITE_OFF'
  | 'ESCALATE'
  | 'NEEDS_REVIEW';

export interface DenialAnalysisInput {
  denialId: string;
  includeHistoricalAnalysis?: boolean;
  includePreventionStrategies?: boolean;
}

export interface DenialAnalysisOutput {
  denialId: string;
  claimId: string;
  category: DenialCategory;
  subCategories: string[];
  isCorrectable: boolean;
  recommendedWorkflow: DenialWorkflow;
  confidence: number;
  reasoning: string;
  rootCause: string;
  correctionActions?: CorrectionAction[];
  appealRecommendation?: AppealRecommendation;
  preventionStrategies: string[];
  relatedDenials: RelatedDenial[];
  providerTrending?: ProviderDenialTrend;
  riskFactors: RiskFactor[];
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  deadline?: Date;
  processingTimeMs: number;
}

export interface CorrectionAction {
  field: string;
  currentValue: string | number | null;
  suggestedValue: string | number;
  reason: string;
  confidence: number;
}

export interface AppealRecommendation {
  recommended: boolean;
  appealType: 'FIRST_LEVEL' | 'SECOND_LEVEL' | 'EXTERNAL';
  successLikelihood: number;
  arguments: string[];
  requiredDocuments: string[];
  deadline?: Date;
}

export interface RelatedDenial {
  denialId: string;
  claimId: string;
  denialCode: string;
  similarity: number;
  outcome?: string;
  wasAppealed: boolean;
  wasOverturned: boolean;
}

export interface ProviderDenialTrend {
  providerId: string;
  providerName: string;
  totalDenials: number;
  denialsByCategory: Record<DenialCategory, number>;
  denialRate: number;
  trending: 'UP' | 'DOWN' | 'STABLE';
  topDenialCodes: Array<{ code: string; count: number; description: string }>;
}

export interface RiskFactor {
  factor: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
  impact: string;
}

export interface DenialPatternAnalysis {
  organizationId: string;
  totalDenials: number;
  totalDeniedAmount: number;
  byCategory: Array<{
    category: DenialCategory;
    count: number;
    amount: number;
    percentage: number;
  }>;
  byPayer: Array<{
    payerId: string;
    payerName: string;
    count: number;
    amount: number;
    denialRate: number;
  }>;
  byProvider: Array<{
    providerId: string;
    providerName: string;
    count: number;
    amount: number;
    denialRate: number;
  }>;
  byCode: Array<{
    code: string;
    description: string;
    count: number;
    amount: number;
  }>;
  trends: Array<{
    month: string;
    count: number;
    amount: number;
  }>;
  topPreventionOpportunities: string[];
}

// ============================================
// Denial Code Categorization
// ============================================

// Map CARC codes to denial categories
const CARC_CATEGORY_MAP: Record<string, DenialCategory> = {
  // Coding-related
  '4': 'CODING',
  '5': 'CODING',
  '6': 'CODING',
  '49': 'CODING',
  '97': 'BUNDLING',
  '59': 'BUNDLING',

  // Eligibility-related
  '26': 'ELIGIBILITY',
  '27': 'ELIGIBILITY',
  '31': 'ELIGIBILITY',
  '32': 'ELIGIBILITY',
  '33': 'ELIGIBILITY',
  '39': 'ELIGIBILITY',

  // Authorization-related
  '197': 'AUTHORIZATION',
  '198': 'AUTHORIZATION',
  '199': 'AUTHORIZATION',
  '15': 'AUTHORIZATION',

  // Medical Necessity
  '50': 'MEDICAL_NECESSITY',
  '56': 'MEDICAL_NECESSITY',
  '57': 'MEDICAL_NECESSITY',
  '58': 'MEDICAL_NECESSITY',
  '96': 'MEDICAL_NECESSITY',
  '167': 'MEDICAL_NECESSITY',
  '204': 'MEDICAL_NECESSITY',

  // Timely Filing
  '29': 'TIMELY_FILING',

  // Duplicate
  '18': 'DUPLICATE',

  // Documentation
  '16': 'DOCUMENTATION',
  '252': 'DOCUMENTATION',
  '24': 'DOCUMENTATION',

  // COB
  '22': 'COORDINATION_OF_BENEFITS',
  '23': 'COORDINATION_OF_BENEFITS',
  '109': 'COORDINATION_OF_BENEFITS',
};

// Correctable denial categories and their correction approaches
const CORRECTABLE_CATEGORIES: Record<DenialCategory, { correctable: boolean; approach: string }> = {
  'CODING': { correctable: true, approach: 'Correct codes and resubmit' },
  'ELIGIBILITY': { correctable: false, approach: 'Verify coverage, may be patient responsibility' },
  'AUTHORIZATION': { correctable: false, approach: 'Appeal with medical records' },
  'MEDICAL_NECESSITY': { correctable: false, approach: 'Appeal with clinical documentation' },
  'TIMELY_FILING': { correctable: false, approach: 'Appeal if extenuating circumstances' },
  'DUPLICATE': { correctable: true, approach: 'Verify and correct claim if legitimate resubmission' },
  'BUNDLING': { correctable: true, approach: 'Apply correct modifiers or rebundle' },
  'DOCUMENTATION': { correctable: true, approach: 'Attach required documentation and resubmit' },
  'COORDINATION_OF_BENEFITS': { correctable: true, approach: 'Update COB info and resubmit' },
  'OTHER': { correctable: false, approach: 'Manual review required' },
};

// ============================================
// DenialAnalyzer Class
// ============================================

export class DenialAnalyzer {
  private prisma: PrismaClient;
  private organizationId: string;

  constructor(prisma: PrismaClient, organizationId: string) {
    this.prisma = prisma;
    this.organizationId = organizationId;
  }

  /**
   * Analyze a denial and determine appropriate routing
   */
  async analyzeDenial(input: DenialAnalysisInput): Promise<DenialAnalysisOutput> {
    const startTime = Date.now();

    // Fetch denial with related data
    const denial = await this.prisma.denial.findFirst({
      where: {
        id: input.denialId,
        claim: { organizationId: this.organizationId },
      },
      include: {
        claim: {
          include: {
            patient: { include: { demographics: true } },
            payer: true,
            insurancePolicy: true,
            encounter: {
              include: {
                provider: { include: { user: { select: { firstName: true, lastName: true } } } },
                diagnoses: true,
                charges: true,
              },
            },
            claimLines: true,
          },
        },
        patient: true,
        notes: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });

    if (!denial) {
      throw new Error(`Denial not found: ${input.denialId}`);
    }

    // Categorize the denial
    const { category, subCategories } = this.categorizeDenial(denial);

    // Determine if correctable
    const isCorrectable = this.determineCorrectability(denial, category);

    // Analyze root cause
    const rootCause = this.analyzeRootCause(denial, category);

    // Get correction actions if correctable
    const correctionActions = isCorrectable
      ? await this.getCorrectionActions(denial, category)
      : undefined;

    // Get appeal recommendation if not correctable
    const appealRecommendation = !isCorrectable
      ? await this.getAppealRecommendation(denial, category)
      : undefined;

    // Determine recommended workflow
    const recommendedWorkflow = this.determineWorkflow(
      denial,
      category,
      isCorrectable,
      appealRecommendation
    );

    // Calculate confidence
    const confidence = this.calculateConfidence(denial, category);

    // Generate reasoning
    const reasoning = this.generateReasoning(denial, category, isCorrectable, recommendedWorkflow);

    // Get prevention strategies if requested
    const preventionStrategies = input.includePreventionStrategies
      ? await this.getPreventionStrategies(category, denial)
      : [];

    // Get related denials if historical analysis requested
    const relatedDenials = input.includeHistoricalAnalysis
      ? await this.findRelatedDenials(denial)
      : [];

    // Get provider trending if historical analysis requested
    const providerTrending = input.includeHistoricalAnalysis
      ? await this.getProviderTrending(denial)
      : undefined;

    // Identify risk factors
    const riskFactors = this.identifyRiskFactors(denial, category);

    // Calculate priority
    const priority = this.calculatePriority(denial, category, riskFactors);

    // Calculate deadline (appeal deadline if applicable)
    const deadline = denial.appealDeadline || undefined;

    // Create AI billing task record
    await this.createAnalysisTask(denial, {
      category,
      isCorrectable,
      recommendedWorkflow,
      confidence,
    });

    return {
      denialId: denial.id,
      claimId: denial.claimId,
      category,
      subCategories,
      isCorrectable,
      recommendedWorkflow,
      confidence,
      reasoning,
      rootCause,
      correctionActions,
      appealRecommendation,
      preventionStrategies,
      relatedDenials,
      providerTrending,
      riskFactors,
      priority,
      deadline,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Categorize a denial based on denial code and reason
   */
  private categorizeDenial(denial: Denial & { claim: unknown }): {
    category: DenialCategory;
    subCategories: string[];
  } {
    const denialCode = denial.denialCode?.trim() || '';
    const denialReason = denial.denialReason?.toLowerCase() || '';
    const subCategories: string[] = [];

    // Check mapped CARC codes first
    if (denialCode && CARC_CATEGORY_MAP[denialCode]) {
      const category = CARC_CATEGORY_MAP[denialCode];
      subCategories.push(COMMON_CARC_CODES[denialCode] || denialCode);
      return { category, subCategories };
    }

    // Keyword-based categorization
    if (this.matchesKeywords(denialReason, ['code', 'coding', 'cpt', 'icd', 'modifier', 'procedure'])) {
      subCategories.push('Code-related issue');
      return { category: 'CODING', subCategories };
    }

    if (this.matchesKeywords(denialReason, ['eligible', 'eligibility', 'coverage', 'not covered', 'member', 'subscriber'])) {
      subCategories.push('Eligibility issue');
      return { category: 'ELIGIBILITY', subCategories };
    }

    if (this.matchesKeywords(denialReason, ['auth', 'authorization', 'pre-auth', 'prior auth', 'precert'])) {
      subCategories.push('Authorization required');
      return { category: 'AUTHORIZATION', subCategories };
    }

    if (this.matchesKeywords(denialReason, ['medical necessity', 'medically necessary', 'not necessary', 'experimental'])) {
      subCategories.push('Medical necessity questioned');
      return { category: 'MEDICAL_NECESSITY', subCategories };
    }

    if (this.matchesKeywords(denialReason, ['timely', 'filing limit', 'time limit', 'late', 'deadline'])) {
      subCategories.push('Filing deadline issue');
      return { category: 'TIMELY_FILING', subCategories };
    }

    if (this.matchesKeywords(denialReason, ['duplicate', 'already paid', 'already processed'])) {
      subCategories.push('Duplicate claim');
      return { category: 'DUPLICATE', subCategories };
    }

    if (this.matchesKeywords(denialReason, ['bundle', 'bundled', 'inclusive', 'included in'])) {
      subCategories.push('Bundling issue');
      return { category: 'BUNDLING', subCategories };
    }

    if (this.matchesKeywords(denialReason, ['document', 'missing', 'attachment', 'record', 'incomplete'])) {
      subCategories.push('Documentation issue');
      return { category: 'DOCUMENTATION', subCategories };
    }

    if (this.matchesKeywords(denialReason, ['coordination', 'cob', 'other insurance', 'primary', 'secondary'])) {
      subCategories.push('COB issue');
      return { category: 'COORDINATION_OF_BENEFITS', subCategories };
    }

    return { category: 'OTHER', subCategories: ['Requires manual review'] };
  }

  /**
   * Check if text matches any keywords
   */
  private matchesKeywords(text: string, keywords: string[]): boolean {
    return keywords.some(keyword => text.includes(keyword));
  }

  /**
   * Determine if denial is correctable
   */
  private determineCorrectability(denial: Denial, category: DenialCategory): boolean {
    // Check category-based correctability
    const categoryInfo = CORRECTABLE_CATEGORIES[category];
    if (!categoryInfo.correctable) {
      // Some denials might still be correctable if specific conditions are met
      if (category === 'AUTHORIZATION' && denial.status === 'NEW') {
        // If authorization can be obtained retroactively
        return false;
      }
      if (category === 'TIMELY_FILING' && denial.status === 'NEW') {
        // Timely filing denials are rarely correctable
        return false;
      }
      return false;
    }

    return true;
  }

  /**
   * Analyze the root cause of the denial
   */
  private analyzeRootCause(denial: Denial, category: DenialCategory): string {
    const denialCode = denial.denialCode || '';
    const denialReason = denial.denialReason || '';

    switch (category) {
      case 'CODING':
        return `Coding error detected. ${COMMON_CARC_CODES[denialCode] || denialReason}. Review CPT/ICD codes and modifiers.`;
      case 'ELIGIBILITY':
        return `Patient eligibility issue. ${denialReason}. Verify insurance coverage dates and plan details.`;
      case 'AUTHORIZATION':
        return `Missing or invalid authorization. ${denialReason}. Prior authorization may be required for this service.`;
      case 'MEDICAL_NECESSITY':
        return `Medical necessity not established. ${denialReason}. Clinical documentation may need to support the service.`;
      case 'TIMELY_FILING':
        return `Claim submitted after filing deadline. ${denialReason}. Review submission date requirements.`;
      case 'DUPLICATE':
        return `Duplicate claim detected. ${denialReason}. Verify if original claim was processed.`;
      case 'BUNDLING':
        return `Services are bundled. ${denialReason}. Review CPT bundling edits and modifier usage.`;
      case 'DOCUMENTATION':
        return `Missing or incomplete documentation. ${denialReason}. Required records or forms may be missing.`;
      case 'COORDINATION_OF_BENEFITS':
        return `Coordination of benefits issue. ${denialReason}. Other insurance information may need to be updated.`;
      default:
        return `Denial reason: ${denialReason}. Manual review required.`;
    }
  }

  /**
   * Get correction actions for correctable denials
   */
  private async getCorrectionActions(
    denial: Denial & { claim: { claimLines: { cptCode: string; modifiers: string[] }[] } },
    category: DenialCategory
  ): Promise<CorrectionAction[]> {
    const actions: CorrectionAction[] = [];

    switch (category) {
      case 'CODING':
        // Suggest code corrections based on denial reason
        if (denial.denialReason?.toLowerCase().includes('modifier')) {
          for (const line of denial.claim?.claimLines || []) {
            actions.push({
              field: `claimLine.modifiers`,
              currentValue: line.modifiers.join(', '),
              suggestedValue: 'Review and add appropriate modifiers',
              reason: 'Modifier may be missing or incorrect',
              confidence: 0.7,
            });
          }
        }
        break;

      case 'BUNDLING':
        actions.push({
          field: 'claimLine.modifiers',
          currentValue: null,
          suggestedValue: 'Add modifier 59 or X modifiers if services are distinct',
          reason: 'Services may need modifier to indicate separate procedures',
          confidence: 0.6,
        });
        break;

      case 'DOCUMENTATION':
        actions.push({
          field: 'attachments',
          currentValue: null,
          suggestedValue: 'Attach required clinical documentation',
          reason: 'Missing documentation that supports medical necessity',
          confidence: 0.8,
        });
        break;

      case 'COORDINATION_OF_BENEFITS':
        actions.push({
          field: 'insurancePolicy.priority',
          currentValue: null,
          suggestedValue: 'Update primary/secondary insurance information',
          reason: 'COB information may be incorrect or missing',
          confidence: 0.75,
        });
        break;

      case 'DUPLICATE':
        actions.push({
          field: 'claim.frequency',
          currentValue: null,
          suggestedValue: 'Set frequency code to 7 (replacement) or 8 (void)',
          reason: 'Indicate this is a corrected claim, not a duplicate',
          confidence: 0.7,
        });
        break;
    }

    return actions;
  }

  /**
   * Get appeal recommendation for non-correctable denials
   */
  private async getAppealRecommendation(
    denial: Denial,
    category: DenialCategory
  ): Promise<AppealRecommendation> {
    const arguments_: string[] = [];
    const requiredDocuments: string[] = [];
    let successLikelihood = 0.3; // Base likelihood

    switch (category) {
      case 'MEDICAL_NECESSITY':
        arguments_.push('Clinical documentation supports medical necessity');
        arguments_.push('Treatment aligns with established guidelines');
        arguments_.push('Patient history demonstrates need for services');
        requiredDocuments.push('Progress notes', 'Treatment plan', 'Diagnostic results');
        successLikelihood = 0.45;
        break;

      case 'AUTHORIZATION':
        arguments_.push('Services were medically urgent');
        arguments_.push('Patient would have suffered harm without treatment');
        arguments_.push('Authorization process was followed');
        requiredDocuments.push('Emergency documentation', 'Clinical notes', 'Communication records');
        successLikelihood = 0.35;
        break;

      case 'TIMELY_FILING':
        arguments_.push('Extenuating circumstances prevented timely filing');
        arguments_.push('Claim was originally submitted within deadline');
        requiredDocuments.push('Proof of original submission', 'System logs', 'Communication records');
        successLikelihood = 0.2;
        break;

      case 'ELIGIBILITY':
        arguments_.push('Patient was eligible at time of service');
        arguments_.push('Coverage information was verified');
        requiredDocuments.push('Eligibility verification records', 'Insurance card copy');
        successLikelihood = 0.4;
        break;

      default:
        arguments_.push('Denial reason is disputed');
        requiredDocuments.push('Supporting documentation');
        successLikelihood = 0.25;
    }

    // Check historical appeal success for similar denials
    const historicalSuccess = await this.getHistoricalAppealSuccess(denial);
    if (historicalSuccess !== null) {
      successLikelihood = (successLikelihood + historicalSuccess) / 2;
    }

    return {
      recommended: successLikelihood >= 0.3,
      appealType: successLikelihood >= 0.5 ? 'FIRST_LEVEL' : 'SECOND_LEVEL',
      successLikelihood,
      arguments: arguments_,
      requiredDocuments,
      deadline: denial.appealDeadline || undefined,
    };
  }

  /**
   * Get historical appeal success rate for similar denials
   */
  private async getHistoricalAppealSuccess(denial: Denial): Promise<number | null> {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const similarDenials = await this.prisma.denial.findMany({
      where: {
        claim: { organizationId: this.organizationId },
        denialCode: denial.denialCode,
        createdAt: { gte: sixMonthsAgo },
        appealedAt: { not: null },
      },
      select: {
        appealOutcome: true,
      },
    });

    if (similarDenials.length < 5) return null; // Not enough data

    const overturned = similarDenials.filter(
      d => d.appealOutcome === 'Overturned' || d.appealOutcome === 'Partial'
    ).length;

    return overturned / similarDenials.length;
  }

  /**
   * Determine the recommended workflow
   */
  private determineWorkflow(
    denial: Denial,
    category: DenialCategory,
    isCorrectable: boolean,
    appealRecommendation?: AppealRecommendation
  ): DenialWorkflow {
    if (isCorrectable) {
      return 'CORRECT_AND_RESUBMIT';
    }

    if (category === 'ELIGIBILITY') {
      // Check if it's truly patient responsibility
      return 'PATIENT_RESPONSIBILITY';
    }

    if (appealRecommendation?.recommended) {
      return 'APPEAL';
    }

    // Small amounts may not be worth pursuing
    const deniedAmount = denial.deniedAmount?.toNumber() || 0;
    if (deniedAmount < 25) {
      return 'WRITE_OFF';
    }

    // Complex cases need escalation
    if (category === 'OTHER' || deniedAmount > 1000) {
      return 'ESCALATE';
    }

    return 'NEEDS_REVIEW';
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(denial: Denial, category: DenialCategory): number {
    let confidence = 0.5;

    // Higher confidence if we have a clear denial code
    if (denial.denialCode && CARC_CATEGORY_MAP[denial.denialCode]) {
      confidence += 0.2;
    }

    // Higher confidence if category is clearly identified
    if (category !== 'OTHER') {
      confidence += 0.15;
    }

    // Lower confidence for large amounts (more scrutiny needed)
    const deniedAmount = denial.deniedAmount?.toNumber() || 0;
    if (deniedAmount > 500) {
      confidence -= 0.1;
    }

    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * Generate human-readable reasoning
   */
  private generateReasoning(
    denial: Denial,
    category: DenialCategory,
    isCorrectable: boolean,
    workflow: DenialWorkflow
  ): string {
    const parts: string[] = [];

    parts.push(`Denial categorized as ${category.replace(/_/g, ' ')}.`);
    parts.push(
      isCorrectable
        ? 'This denial type is typically correctable.'
        : 'This denial type typically requires appeal or other action.'
    );
    parts.push(`Recommended workflow: ${workflow.replace(/_/g, ' ')}.`);

    if (denial.denialCode) {
      const description = COMMON_CARC_CODES[denial.denialCode];
      if (description) {
        parts.push(`Code ${denial.denialCode}: ${description}`);
      }
    }

    return parts.join(' ');
  }

  /**
   * Get prevention strategies for future denials
   */
  private async getPreventionStrategies(
    category: DenialCategory,
    denial: Denial
  ): Promise<string[]> {
    const strategies: string[] = [];

    switch (category) {
      case 'CODING':
        strategies.push('Use claim scrubbing before submission');
        strategies.push('Review payer-specific coding guidelines');
        strategies.push('Verify modifier requirements for procedures');
        break;

      case 'ELIGIBILITY':
        strategies.push('Verify eligibility before each visit');
        strategies.push('Implement real-time eligibility checks');
        strategies.push('Keep insurance information updated');
        break;

      case 'AUTHORIZATION':
        strategies.push('Check authorization requirements before scheduling');
        strategies.push('Maintain authorization tracking system');
        strategies.push('Obtain authorizations in advance');
        break;

      case 'MEDICAL_NECESSITY':
        strategies.push('Document medical necessity clearly in notes');
        strategies.push('Link diagnoses to procedures appropriately');
        strategies.push('Include supporting clinical evidence');
        break;

      case 'TIMELY_FILING':
        strategies.push('Implement claims aging alerts');
        strategies.push('Submit claims within 24-48 hours of service');
        strategies.push('Track rejected claims for resubmission');
        break;

      case 'BUNDLING':
        strategies.push('Use CCI edits checking before submission');
        strategies.push('Apply correct modifiers for distinct procedures');
        strategies.push('Review bundling rules for common codes');
        break;

      case 'DOCUMENTATION':
        strategies.push('Ensure all required documents are attached');
        strategies.push('Create documentation checklists by payer');
        strategies.push('Verify attachment transmission success');
        break;

      case 'COORDINATION_OF_BENEFITS':
        strategies.push('Verify primary/secondary insurance at check-in');
        strategies.push('Update COB information regularly');
        strategies.push('Submit to primary payer first');
        break;
    }

    // Add payer-specific strategies if patterns exist
    const payerStrategies = await this.getPayerSpecificStrategies(denial);
    strategies.push(...payerStrategies);

    return [...new Set(strategies)]; // Remove duplicates
  }

  /**
   * Get payer-specific prevention strategies
   */
  private async getPayerSpecificStrategies(denial: Denial): Promise<string[]> {
    const strategies: string[] = [];

    const claim = await this.prisma.claim.findUnique({
      where: { id: denial.claimId },
      include: { payer: true },
    });

    if (!claim?.payer) return strategies;

    // Get common denial patterns for this payer
    const payerDenials = await this.prisma.denial.groupBy({
      by: ['denialCode'],
      where: {
        claim: {
          organizationId: this.organizationId,
          payerId: claim.payerId,
        },
        createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      },
      _count: true,
      orderBy: { _count: { denialCode: 'desc' } },
      take: 3,
    });

    if (payerDenials.length > 0) {
      const topCode = payerDenials[0];
      if (topCode._count > 5 && topCode.denialCode) {
        strategies.push(
          `${claim.payer.name} frequently denies with code ${topCode.denialCode}. Consider reviewing requirements.`
        );
      }
    }

    return strategies;
  }

  /**
   * Find related denials for pattern analysis
   */
  private async findRelatedDenials(denial: Denial): Promise<RelatedDenial[]> {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const related = await this.prisma.denial.findMany({
      where: {
        id: { not: denial.id },
        claim: { organizationId: this.organizationId },
        denialCode: denial.denialCode || undefined,
        createdAt: { gte: threeMonthsAgo },
      },
      take: 5,
      orderBy: { createdAt: 'desc' },
    });

    return related.map(d => ({
      denialId: d.id,
      claimId: d.claimId,
      denialCode: d.denialCode || 'UNKNOWN',
      similarity: d.denialCode === denial.denialCode ? 0.9 : 0.5,
      outcome: d.appealOutcome || undefined,
      wasAppealed: !!d.appealedAt,
      wasOverturned: d.appealOutcome === 'Overturned',
    }));
  }

  /**
   * Get provider denial trending
   */
  private async getProviderTrending(
    denial: Denial & { claim: { encounter: { provider: { id: string; user: { firstName: string; lastName: string } } | null } | null } | null }
  ): Promise<ProviderDenialTrend | undefined> {
    const claim = denial.claim as { encounter: { provider: { id: string; user: { firstName: string; lastName: string } } | null } | null } | null;
    if (!claim?.encounter?.provider) return undefined;

    const provider = claim.encounter.provider;
    const providerName = `${provider.user.firstName} ${provider.user.lastName}`;
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    // Get total claims and denials for provider
    const [totalClaims, providerDenials] = await Promise.all([
      this.prisma.claim.count({
        where: {
          organizationId: this.organizationId,
          encounter: { providerId: provider.id },
          createdAt: { gte: threeMonthsAgo },
        },
      }),
      this.prisma.denial.findMany({
        where: {
          claim: {
            organizationId: this.organizationId,
            encounter: { providerId: provider.id },
          },
          createdAt: { gte: threeMonthsAgo },
        },
      }),
    ]);

    // Categorize denials
    const byCategory: Record<DenialCategory, number> = {
      CODING: 0,
      ELIGIBILITY: 0,
      AUTHORIZATION: 0,
      MEDICAL_NECESSITY: 0,
      TIMELY_FILING: 0,
      DUPLICATE: 0,
      BUNDLING: 0,
      DOCUMENTATION: 0,
      COORDINATION_OF_BENEFITS: 0,
      OTHER: 0,
    };

    const codeCounts = new Map<string, number>();

    for (const d of providerDenials) {
      const { category } = this.categorizeDenial(d as Denial & { claim: unknown });
      byCategory[category]++;

      if (d.denialCode) {
        codeCounts.set(d.denialCode, (codeCounts.get(d.denialCode) || 0) + 1);
      }
    }

    // Get top denial codes
    const topCodes = Array.from(codeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([code, count]) => ({
        code,
        count,
        description: COMMON_CARC_CODES[code] || 'Unknown',
      }));

    // Determine trending (compare current vs previous period)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const previousPeriodDenials = await this.prisma.denial.count({
      where: {
        claim: {
          organizationId: this.organizationId,
          encounter: { providerId: provider.id },
        },
        createdAt: { gte: sixMonthsAgo, lt: threeMonthsAgo },
      },
    });

    let trending: 'UP' | 'DOWN' | 'STABLE' = 'STABLE';
    if (providerDenials.length > previousPeriodDenials * 1.2) trending = 'UP';
    else if (providerDenials.length < previousPeriodDenials * 0.8) trending = 'DOWN';

    return {
      providerId: provider.id,
      providerName,
      totalDenials: providerDenials.length,
      denialsByCategory: byCategory,
      denialRate: totalClaims > 0 ? providerDenials.length / totalClaims : 0,
      trending,
      topDenialCodes: topCodes,
    };
  }

  /**
   * Identify risk factors
   */
  private identifyRiskFactors(denial: Denial, category: DenialCategory): RiskFactor[] {
    const factors: RiskFactor[] = [];
    const deniedAmount = denial.deniedAmount?.toNumber() || 0;

    // High amount risk
    if (deniedAmount > 500) {
      factors.push({
        factor: 'HIGH_AMOUNT',
        severity: deniedAmount > 1000 ? 'HIGH' : 'MEDIUM',
        description: `Denied amount is $${deniedAmount.toFixed(2)}`,
        impact: 'Significant revenue impact',
      });
    }

    // Appeal deadline risk
    if (denial.appealDeadline) {
      const daysUntilDeadline = Math.ceil(
        (denial.appealDeadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      if (daysUntilDeadline <= 7) {
        factors.push({
          factor: 'URGENT_DEADLINE',
          severity: 'HIGH',
          description: `Appeal deadline in ${daysUntilDeadline} days`,
          impact: 'May lose appeal rights',
        });
      } else if (daysUntilDeadline <= 14) {
        factors.push({
          factor: 'APPROACHING_DEADLINE',
          severity: 'MEDIUM',
          description: `Appeal deadline in ${daysUntilDeadline} days`,
          impact: 'Action needed soon',
        });
      }
    }

    // Category-specific risks
    if (category === 'MEDICAL_NECESSITY') {
      factors.push({
        factor: 'DOCUMENTATION_CRITICAL',
        severity: 'MEDIUM',
        description: 'Medical necessity denials require strong documentation',
        impact: 'Success depends on clinical evidence',
      });
    }

    if (category === 'TIMELY_FILING') {
      factors.push({
        factor: 'LOW_SUCCESS_RATE',
        severity: 'HIGH',
        description: 'Timely filing denials are difficult to overturn',
        impact: 'Appeal success unlikely without proof of circumstances',
      });
    }

    return factors;
  }

  /**
   * Calculate priority
   */
  private calculatePriority(
    denial: Denial,
    category: DenialCategory,
    riskFactors: RiskFactor[]
  ): 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' {
    const deniedAmount = denial.deniedAmount?.toNumber() || 0;
    const hasUrgentFactor = riskFactors.some(f => f.severity === 'HIGH');
    const hasApproachingDeadline = denial.appealDeadline
      ? (denial.appealDeadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24) <= 14
      : false;

    if (hasApproachingDeadline && deniedAmount > 500) {
      return 'URGENT';
    }

    if (hasUrgentFactor || deniedAmount > 1000) {
      return 'HIGH';
    }

    if (deniedAmount > 100 || category !== 'OTHER') {
      return 'MEDIUM';
    }

    return 'LOW';
  }

  /**
   * Create AI billing task for the analysis
   */
  private async createAnalysisTask(
    denial: Denial,
    result: {
      category: DenialCategory;
      isCorrectable: boolean;
      recommendedWorkflow: DenialWorkflow;
      confidence: number;
    }
  ): Promise<void> {
    const claim = await this.prisma.claim.findUnique({
      where: { id: denial.claimId },
      select: { id: true, organizationId: true },
    });

    if (!claim) return;

    // Create task record
    const task = await this.prisma.aIBillingTask.create({
      data: {
        taskType: 'SCRUB', // Using SCRUB as closest match for analysis
        status: 'COMPLETED',
        claimId: denial.claimId,
        organizationId: claim.organizationId,
        result: {
          denialId: denial.id,
          category: result.category,
          isCorrectable: result.isCorrectable,
          recommendedWorkflow: result.recommendedWorkflow,
        },
        resultSummary: `Denial analyzed: ${result.category}. ${result.isCorrectable ? 'Correctable' : 'Requires ' + result.recommendedWorkflow}.`,
        completedAt: new Date(),
        attempts: 1,
      },
    });

    // Create decision record
    await this.prisma.aIBillingDecision.create({
      data: {
        taskId: task.id,
        decision: result.recommendedWorkflow,
        reasoning: `Category: ${result.category}. Correctable: ${result.isCorrectable}. Workflow: ${result.recommendedWorkflow}.`,
        confidence: result.confidence,
        organizationId: claim.organizationId,
      },
    });
  }

  /**
   * Get denial pattern analysis for the organization
   */
  async getPatternAnalysis(
    dateFrom?: Date,
    dateTo?: Date
  ): Promise<DenialPatternAnalysis> {
    const where = {
      claim: { organizationId: this.organizationId },
      ...(dateFrom && { createdAt: { gte: dateFrom } }),
      ...(dateTo && { createdAt: { lte: dateTo } }),
    };

    const denials = await this.prisma.denial.findMany({
      where,
      include: {
        claim: {
          include: {
            payer: true,
            encounter: { include: { provider: { include: { user: { select: { firstName: true, lastName: true } } } } } },
          },
        },
      },
    });

    // Calculate totals
    const totalDenials = denials.length;
    const totalDeniedAmount = denials.reduce(
      (sum, d) => sum + (d.deniedAmount?.toNumber() || 0),
      0
    );

    // Group by category
    const categoryMap = new Map<DenialCategory, { count: number; amount: number }>();
    for (const d of denials) {
      const { category } = this.categorizeDenial(d as Denial & { claim: unknown });
      const existing = categoryMap.get(category) || { count: 0, amount: 0 };
      existing.count++;
      existing.amount += d.deniedAmount?.toNumber() || 0;
      categoryMap.set(category, existing);
    }

    const byCategory = Array.from(categoryMap.entries()).map(([category, stats]) => ({
      category,
      count: stats.count,
      amount: stats.amount,
      percentage: totalDenials > 0 ? (stats.count / totalDenials) * 100 : 0,
    })).sort((a, b) => b.count - a.count);

    // Group by payer
    const payerMap = new Map<string, { name: string; count: number; amount: number; totalClaims: number }>();
    for (const d of denials) {
      if (!d.claim?.payerId) continue;
      const existing = payerMap.get(d.claim.payerId) || {
        name: d.claim.payer?.name || 'Unknown',
        count: 0,
        amount: 0,
        totalClaims: 0,
      };
      existing.count++;
      existing.amount += d.deniedAmount?.toNumber() || 0;
      payerMap.set(d.claim.payerId, existing);
    }

    // Get total claims by payer for denial rate
    const byPayer = await Promise.all(
      Array.from(payerMap.entries()).map(async ([payerId, stats]) => {
        const totalClaims = await this.prisma.claim.count({
          where: {
            organizationId: this.organizationId,
            payerId,
            ...(dateFrom && { createdAt: { gte: dateFrom } }),
            ...(dateTo && { createdAt: { lte: dateTo } }),
          },
        });
        return {
          payerId,
          payerName: stats.name,
          count: stats.count,
          amount: stats.amount,
          denialRate: totalClaims > 0 ? (stats.count / totalClaims) * 100 : 0,
        };
      })
    );

    // Group by provider
    const providerMap = new Map<string, { name: string; count: number; amount: number }>();
    for (const d of denials) {
      const provider = d.claim?.encounter?.provider;
      if (!provider) continue;
      const providerUser = provider.user as { firstName: string; lastName: string } | null;
      const existing = providerMap.get(provider.id) || {
        name: providerUser ? `${providerUser.firstName} ${providerUser.lastName}` : 'Unknown Provider',
        count: 0,
        amount: 0,
      };
      existing.count++;
      existing.amount += d.deniedAmount?.toNumber() || 0;
      providerMap.set(provider.id, existing);
    }

    const byProvider = await Promise.all(
      Array.from(providerMap.entries()).map(async ([providerId, stats]) => {
        const totalClaims = await this.prisma.claim.count({
          where: {
            organizationId: this.organizationId,
            encounter: { providerId },
            ...(dateFrom && { createdAt: { gte: dateFrom } }),
            ...(dateTo && { createdAt: { lte: dateTo } }),
          },
        });
        return {
          providerId,
          providerName: stats.name,
          count: stats.count,
          amount: stats.amount,
          denialRate: totalClaims > 0 ? (stats.count / totalClaims) * 100 : 0,
        };
      })
    );

    // Group by code
    const codeMap = new Map<string, { count: number; amount: number }>();
    for (const d of denials) {
      if (!d.denialCode) continue;
      const existing = codeMap.get(d.denialCode) || { count: 0, amount: 0 };
      existing.count++;
      existing.amount += d.deniedAmount?.toNumber() || 0;
      codeMap.set(d.denialCode, existing);
    }

    const byCode = Array.from(codeMap.entries())
      .map(([code, stats]) => ({
        code,
        description: COMMON_CARC_CODES[code] || 'Unknown',
        count: stats.count,
        amount: stats.amount,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Monthly trends
    const monthMap = new Map<string, { count: number; amount: number }>();
    for (const d of denials) {
      const month = d.createdAt.toISOString().substring(0, 7); // YYYY-MM
      const existing = monthMap.get(month) || { count: 0, amount: 0 };
      existing.count++;
      existing.amount += d.deniedAmount?.toNumber() || 0;
      monthMap.set(month, existing);
    }

    const trends = Array.from(monthMap.entries())
      .map(([month, stats]) => ({
        month,
        count: stats.count,
        amount: stats.amount,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Top prevention opportunities
    const topPreventionOpportunities = byCategory.slice(0, 3).map(cat => {
      const strategies = CORRECTABLE_CATEGORIES[cat.category];
      return `${cat.category}: ${strategies.approach} (${cat.count} denials, $${cat.amount.toFixed(2)})`;
    });

    return {
      organizationId: this.organizationId,
      totalDenials,
      totalDeniedAmount,
      byCategory,
      byPayer: byPayer.sort((a, b) => b.count - a.count),
      byProvider: byProvider.sort((a, b) => b.count - a.count),
      byCode,
      trends,
      topPreventionOpportunities,
    };
  }

  /**
   * Route denial to appropriate workflow
   */
  async routeDenial(denialId: string, workflow: DenialWorkflow): Promise<void> {
    let newStatus: DenialStatus;

    switch (workflow) {
      case 'CORRECT_AND_RESUBMIT':
        newStatus = 'REBILLED';
        break;
      case 'APPEAL':
        newStatus = 'APPEALED';
        break;
      case 'PATIENT_RESPONSIBILITY':
        newStatus = 'CLOSED';
        break;
      case 'WRITE_OFF':
        newStatus = 'WRITTEN_OFF';
        break;
      case 'ESCALATE':
        newStatus = 'UNDER_REVIEW';
        break;
      default:
        newStatus = 'UNDER_REVIEW';
    }

    await this.prisma.denial.update({
      where: { id: denialId },
      data: {
        status: newStatus,
        category: workflow,
      },
    });

    // Create note for routing decision
    await this.prisma.denialNote.create({
      data: {
        denialId,
        noteType: 'ai_routing',
        note: `AI Agent routed denial to ${workflow.replace(/_/g, ' ')} workflow.`,
        createdBy: 'SYSTEM',
      },
    });
  }

  /**
   * Learn from denial outcome (for future improvement)
   */
  async recordOutcome(
    denialId: string,
    outcome: {
      wasSuccessful: boolean;
      actualWorkflow: string;
      recoveredAmount?: number;
      notes?: string;
    }
  ): Promise<void> {
    const denial = await this.prisma.denial.findFirst({
      where: {
        id: denialId,
        claim: { organizationId: this.organizationId },
      },
    });

    if (!denial) return;

    await this.prisma.denial.update({
      where: { id: denialId },
      data: {
        resolvedAt: new Date(),
        recoveredAmount: outcome.recoveredAmount,
        resolutionNotes: outcome.notes,
      },
    });

    // Log for learning
    await this.prisma.denialNote.create({
      data: {
        denialId,
        noteType: 'outcome',
        note: `Outcome recorded: ${outcome.wasSuccessful ? 'Successful' : 'Unsuccessful'}. Workflow: ${outcome.actualWorkflow}. ${outcome.notes || ''}`,
        createdBy: 'SYSTEM',
      },
    });
  }
}

export const createDenialAnalyzer = (prisma: PrismaClient, organizationId: string) =>
  new DenialAnalyzer(prisma, organizationId);
