/**
 * Epic 31: AI Billing Agent - Smart Payment Poster
 *
 * US-312: Smart payment posting
 *
 * AI-assisted ERA processing and payment posting with:
 * - Auto-post from ERA (Electronic Remittance Advice)
 * - Intelligent payment-to-claim matching
 * - Partial payments and adjustments handling
 * - Posting discrepancy identification
 * - Unusual adjustment flagging
 * - Secondary claim triggering
 * - Patient responsibility calculation
 * - Balance forward automation
 */

import type { PrismaClient, Claim, Charge, Remittance, RemittanceLineItem } from '@prisma/client';

// ============================================
// Types
// ============================================

export type PostingStatus = 'PENDING' | 'POSTED' | 'PARTIAL' | 'FAILED' | 'REVIEW_REQUIRED' | 'SKIPPED';

export type DiscrepancyType =
  | 'AMOUNT_MISMATCH'
  | 'CLAIM_NOT_FOUND'
  | 'CHARGE_NOT_FOUND'
  | 'ALREADY_POSTED'
  | 'DUPLICATE_PAYMENT'
  | 'UNEXPECTED_ADJUSTMENT'
  | 'PATIENT_INFO_MISMATCH'
  | 'SERVICE_DATE_MISMATCH'
  | 'CPT_MISMATCH'
  | 'OVERPAYMENT';

export type AdjustmentFlag =
  | 'NORMAL'
  | 'LARGE_ADJUSTMENT'
  | 'UNUSUAL_CODE'
  | 'CONTRACTUAL_EXCEEDS_ALLOWED'
  | 'FULL_DENIAL'
  | 'REQUIRES_REVIEW';

export interface ERAProcessInput {
  remittanceId: string;
  autoPost?: boolean;
  reviewThreshold?: number; // Confidence threshold for auto-posting (0-1)
  maxAdjustmentPercent?: number; // Max adjustment percent before flagging
  skipAlreadyPosted?: boolean;
}

export interface ERAProcessOutput {
  remittanceId: string;
  totalLines: number;
  posted: number;
  partiallyPosted: number;
  failed: number;
  reviewRequired: number;
  skipped: number;
  totalPostedAmount: number;
  totalAdjustmentAmount: number;
  totalPatientResponsibility: number;
  secondaryClaimsTriggered: number;
  discrepancies: PostingDiscrepancy[];
  results: LinePostingResult[];
  processingTimeMs: number;
}

export interface LinePostingResult {
  lineItemId: string;
  claimId: string | null;
  chargeId: string | null;
  status: PostingStatus;
  matchConfidence: number;
  postedAmount: number;
  adjustmentAmount: number;
  patientResponsibility: number;
  adjustmentFlags: AdjustmentFlag[];
  discrepancy: PostingDiscrepancy | null;
  secondaryClaimTriggered: boolean;
  notes: string;
}

export interface PostingDiscrepancy {
  lineItemId: string;
  type: DiscrepancyType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  expectedValue?: string | number;
  actualValue?: string | number;
  suggestedAction: string;
}

export interface PaymentMatchInput {
  remittanceLineId?: string;
  paymentAmount: number;
  patientName?: string;
  patientAccountNumber?: string;
  serviceDate?: Date;
  cptCode?: string;
  payerClaimNumber?: string;
  checkNumber?: string;
}

export interface PaymentMatchOutput {
  matches: MatchCandidate[];
  bestMatch: MatchCandidate | null;
  matchConfidence: number;
  requiresManualReview: boolean;
  reviewReason?: string;
}

export interface MatchCandidate {
  claimId: string;
  claimNumber: string;
  chargeId: string;
  patientId: string;
  patientName: string;
  serviceDate: Date;
  cptCode: string;
  billedAmount: number;
  expectedAmount: number;
  confidence: number;
  matchReasons: string[];
}

export interface PartialPaymentResult {
  chargeId: string;
  insurancePaid: number;
  contractualAdjustment: number;
  otherAdjustment: number;
  patientResponsibility: number;
  remainingBalance: number;
  isPaidInFull: boolean;
  hasSecondaryInsurance: boolean;
  secondaryClaimNeeded: boolean;
}

export interface AdjustmentAnalysis {
  totalAdjustment: number;
  contractualAdjustment: number;
  nonContractualAdjustment: number;
  adjustmentPercent: number;
  adjustmentCodes: AdjustmentCodeDetail[];
  flags: AdjustmentFlag[];
  requiresReview: boolean;
  reviewReasons: string[];
}

export interface AdjustmentCodeDetail {
  code: string;
  reasonCode: string;
  amount: number;
  description: string;
  isContractual: boolean;
  isPatientResponsibility: boolean;
}

export interface SecondaryClaimResult {
  originalClaimId: string;
  secondaryClaimId: string;
  primaryPaidAmount: number;
  remainingBalance: number;
  secondaryPayerId: string;
  triggerReason: string;
}

export interface PatientBalanceUpdate {
  patientId: string;
  claimId: string;
  previousBalance: number;
  newCharges: number;
  insurancePayments: number;
  adjustments: number;
  newBalance: number;
  needsStatement: boolean;
}

export interface PostingMetrics {
  periodStart: Date;
  periodEnd: Date;
  totalErasProcessed: number;
  totalLinesProcessed: number;
  autoPostRate: number;
  averageMatchConfidence: number;
  discrepancyRate: number;
  averagePostingTimeMs: number;
  topDiscrepancyTypes: { type: DiscrepancyType; count: number }[];
  topAdjustmentCodes: { code: string; count: number; totalAmount: number }[];
  secondaryClaimRate: number;
  totalPostedAmount: number;
  totalAdjustmentAmount: number;
  totalPatientResponsibility: number;
}

// ============================================
// Adjustment Code Reference
// ============================================

const CONTRACTUAL_ADJUSTMENT_CODES = [
  '45', // Charge exceeds fee schedule/maximum allowable
  '253', // Sequestration - loss of Medicaid payment
  'A2', // Contractual adjustment
  'P1', // Capitation adjustment
  'P2', // Capitation adjustment
];

const PATIENT_RESPONSIBILITY_CODES = [
  '1', // Deductible
  '2', // Coinsurance
  '3', // Copay
  '26', // Expenses incurred prior to coverage
  '27', // Expenses incurred after coverage terminated
];

const DENIAL_CODES = [
  '4', // Procedure code inconsistent with modifier
  '16', // Claim/service lacks information
  '18', // Duplicate claim/service
  '29', // Time limit for filing has expired
  '50', // Non-covered services (medical necessity)
  '96', // Non-covered charge
  '97', // Bundled/incidental procedure
  '109', // Claim not covered by this payer
  '119', // Benefit maximum reached
  '183', // Provider's incorrect/missing information
];

// Adjustment code descriptions
const ADJUSTMENT_CODE_DESCRIPTIONS: Record<string, string> = {
  '1': 'Deductible Amount',
  '2': 'Coinsurance Amount',
  '3': 'Co-payment Amount',
  '4': 'Procedure code inconsistent with modifier used',
  '5': 'Procedure code inconsistent with place of service',
  '6': 'Procedure/Revenue code incidental to primary procedure',
  '16': 'Claim/service lacks information needed for adjudication',
  '18': 'Duplicate claim/service',
  '22': 'This care may be covered by another payer per coordination of benefits',
  '23': 'Payment adjusted based on multiple procedure rules',
  '24': 'Charges are covered under a capitation agreement',
  '26': 'Expenses incurred prior to coverage',
  '27': 'Expenses incurred after coverage terminated',
  '29': 'The time limit for filing has expired',
  '45': 'Charge exceeds fee schedule/maximum allowable',
  '50': 'These services are not covered (not medically necessary)',
  '59': 'Multiple claims for same service',
  '96': 'Non-covered charge(s)',
  '97': 'Payment adjusted because this procedure was bundled',
  '109': 'Claim not covered by this payer',
  '119': 'Benefit maximum has been reached',
  '167': 'This claim has been denied as a duplicate',
  '183': 'Provider claims incorrect/missing information',
  '253': 'Sequestration - Loss of Medicaid Payment',
  'A2': 'Contractual Adjustment',
  'PR': 'Patient Responsibility',
  'CO': 'Contractual Obligation',
  'OA': 'Other Adjustment',
  'PI': 'Payer Initiated Reduction',
};

// ============================================
// SmartPaymentPoster Class
// ============================================

export class SmartPaymentPoster {
  constructor(
    private prisma: PrismaClient,
    private organizationId: string
  ) {}

  /**
   * Main method: Process ERA and auto-post payments
   */
  async processERA(input: ERAProcessInput): Promise<ERAProcessOutput> {
    const startTime = Date.now();
    const {
      remittanceId,
      autoPost = true,
      reviewThreshold = 0.85,
      maxAdjustmentPercent = 50,
      skipAlreadyPosted = true,
    } = input;

    // Get remittance with line items
    const remittance = await this.prisma.remittance.findFirst({
      where: {
        id: remittanceId,
        organizationId: this.organizationId,
      },
      include: {
        lineItems: true,
      },
    });

    if (!remittance) {
      throw new Error(`Remittance not found: ${remittanceId}`);
    }

    const results: LinePostingResult[] = [];
    const discrepancies: PostingDiscrepancy[] = [];
    let posted = 0;
    let partiallyPosted = 0;
    let failed = 0;
    let reviewRequired = 0;
    let skipped = 0;
    let totalPostedAmount = 0;
    let totalAdjustmentAmount = 0;
    let totalPatientResponsibility = 0;
    let secondaryClaimsTriggered = 0;

    // Process each line item
    for (const lineItem of remittance.lineItems) {
      // Skip already posted items if configured
      if (skipAlreadyPosted && lineItem.isPosted) {
        skipped++;
        results.push({
          lineItemId: lineItem.id,
          claimId: lineItem.claimId,
          chargeId: lineItem.chargeId,
          status: 'SKIPPED',
          matchConfidence: 1,
          postedAmount: 0,
          adjustmentAmount: 0,
          patientResponsibility: 0,
          adjustmentFlags: [],
          discrepancy: null,
          secondaryClaimTriggered: false,
          notes: 'Already posted',
        });
        continue;
      }

      try {
        // Match payment to claim/charge
        const matchResult = await this.matchPayment({
          remittanceLineId: lineItem.id,
          paymentAmount: lineItem.paidAmount?.toNumber() || 0,
          patientName: lineItem.patientName || undefined,
          patientAccountNumber: lineItem.patientAccountNumber || undefined,
          serviceDate: lineItem.serviceDate || undefined,
          cptCode: lineItem.cptCode || undefined,
          payerClaimNumber: lineItem.payerClaimNumber || undefined,
        });

        // Analyze adjustments
        const adjustmentAnalysis = this.analyzeAdjustments(lineItem, maxAdjustmentPercent);

        // Calculate patient responsibility
        const patientResponsibility = this.calculatePatientResponsibility(lineItem);

        // Determine if auto-post is appropriate
        const shouldAutoPost =
          autoPost &&
          matchResult.matchConfidence >= reviewThreshold &&
          !matchResult.requiresManualReview &&
          !adjustmentAnalysis.requiresReview;

        let status: PostingStatus;
        let postedAmount = 0;
        let secondaryClaimTriggered = false;

        if (matchResult.bestMatch) {
          if (shouldAutoPost) {
            // Auto-post the payment
            const postResult = await this.postPayment(
              lineItem,
              matchResult.bestMatch,
              adjustmentAnalysis,
              patientResponsibility
            );

            if (postResult.success) {
              postedAmount = lineItem.paidAmount?.toNumber() || 0;
              totalPostedAmount += postedAmount;
              totalAdjustmentAmount += adjustmentAnalysis.totalAdjustment;
              totalPatientResponsibility += patientResponsibility;

              // Check for secondary insurance
              if (postResult.secondaryClaimNeeded) {
                const secondaryResult = await this.triggerSecondaryClaim(
                  matchResult.bestMatch.claimId,
                  lineItem
                );
                if (secondaryResult) {
                  secondaryClaimTriggered = true;
                  secondaryClaimsTriggered++;
                }
              }

              status = postResult.isPaidInFull ? 'POSTED' : 'PARTIAL';
              if (status === 'POSTED') posted++;
              else partiallyPosted++;
            } else {
              status = 'FAILED';
              failed++;
            }
          } else {
            // Needs review
            status = 'REVIEW_REQUIRED';
            reviewRequired++;
          }
        } else {
          // No match found
          status = 'FAILED';
          failed++;

          const discrepancy: PostingDiscrepancy = {
            lineItemId: lineItem.id,
            type: 'CLAIM_NOT_FOUND',
            severity: 'HIGH',
            description: 'Could not match payment to any claim',
            suggestedAction: 'Manually review and match to appropriate claim',
          };
          discrepancies.push(discrepancy);
        }

        // Check for discrepancies
        if (matchResult.bestMatch && !['SKIPPED'].includes(status)) {
          const lineDiscrepancies = this.identifyDiscrepancies(
            lineItem,
            matchResult.bestMatch,
            adjustmentAnalysis
          );
          discrepancies.push(...lineDiscrepancies);
        }

        results.push({
          lineItemId: lineItem.id,
          claimId: matchResult.bestMatch?.claimId || null,
          chargeId: matchResult.bestMatch?.chargeId || null,
          status,
          matchConfidence: matchResult.matchConfidence,
          postedAmount,
          adjustmentAmount: adjustmentAnalysis.totalAdjustment,
          patientResponsibility,
          adjustmentFlags: adjustmentAnalysis.flags,
          discrepancy: discrepancies.find(d => d.lineItemId === lineItem.id) || null,
          secondaryClaimTriggered,
          notes: this.generatePostingNotes(status, matchResult, adjustmentAnalysis),
        });
      } catch (error) {
        failed++;
        results.push({
          lineItemId: lineItem.id,
          claimId: null,
          chargeId: null,
          status: 'FAILED',
          matchConfidence: 0,
          postedAmount: 0,
          adjustmentAmount: 0,
          patientResponsibility: 0,
          adjustmentFlags: [],
          discrepancy: {
            lineItemId: lineItem.id,
            type: 'CLAIM_NOT_FOUND',
            severity: 'CRITICAL',
            description: `Error processing line: ${error instanceof Error ? error.message : 'Unknown error'}`,
            suggestedAction: 'Review error and reprocess',
          },
          secondaryClaimTriggered: false,
          notes: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }

    // Update remittance status
    await this.prisma.remittance.update({
      where: { id: remittanceId },
      data: {
        isProcessed: posted + partiallyPosted > 0,
        processedDate: new Date(),
      },
    });

    // Update metrics
    await this.updatePostingMetrics(results, discrepancies);

    const processingTimeMs = Date.now() - startTime;

    return {
      remittanceId,
      totalLines: remittance.lineItems.length,
      posted,
      partiallyPosted,
      failed,
      reviewRequired,
      skipped,
      totalPostedAmount,
      totalAdjustmentAmount,
      totalPatientResponsibility,
      secondaryClaimsTriggered,
      discrepancies,
      results,
      processingTimeMs,
    };
  }

  /**
   * Match payment to claims intelligently
   */
  async matchPayment(input: PaymentMatchInput): Promise<PaymentMatchOutput> {
    const matches: MatchCandidate[] = [];

    // Build search criteria
    const searchCriteria: Record<string, unknown> = {
      organizationId: this.organizationId,
      status: { in: ['SUBMITTED', 'ACCEPTED'] },
    };

    // Get potential matching claims
    const claims = await this.prisma.claim.findMany({
      where: searchCriteria,
      include: {
        patient: { include: { demographics: true } },
        claimLines: {
          include: { charge: true },
        },
        payer: true,
      },
      take: 100,
    });

    for (const claim of claims) {
      for (const line of claim.claimLines) {
        let confidence = 0;
        const matchReasons: string[] = [];

        // Match by patient name
        if (input.patientName && claim.patient?.demographics) {
          const patientFullName =
            `${claim.patient.demographics.firstName} ${claim.patient.demographics.lastName}`.toLowerCase();
          const inputName = input.patientName.toLowerCase();

          if (patientFullName === inputName) {
            confidence += 0.25;
            matchReasons.push('Exact patient name match');
          } else if (patientFullName.includes(inputName) || inputName.includes(patientFullName)) {
            confidence += 0.15;
            matchReasons.push('Partial patient name match');
          }
        }

        // Match by patient account number (using patient ID as account number)
        if (input.patientAccountNumber && claim.patientId) {
          if (claim.patientId === input.patientAccountNumber) {
            confidence += 0.3;
            matchReasons.push('Patient account number match');
          }
        }

        // Match by service date
        if (input.serviceDate && line.charge?.serviceDate) {
          const inputDate = input.serviceDate.toISOString().split('T')[0];
          const chargeDate = line.charge.serviceDate.toISOString().split('T')[0];
          if (inputDate === chargeDate) {
            confidence += 0.2;
            matchReasons.push('Service date match');
          }
        }

        // Match by CPT code
        if (input.cptCode && line.charge?.cptCode) {
          if (line.charge.cptCode === input.cptCode) {
            confidence += 0.2;
            matchReasons.push('CPT code match');
          }
        }

        // Match by claim number
        if (input.payerClaimNumber && claim.claimNumber) {
          if (claim.claimNumber === input.payerClaimNumber) {
            confidence += 0.4;
            matchReasons.push('Payer claim number match');
          }
        }

        // Match by amount (approximate)
        if (input.paymentAmount > 0 && line.charge?.fee) {
          const chargeAmount = line.charge.fee.toNumber();
          const expectedPay = chargeAmount * 0.8; // Assume ~80% expected payment
          const amountDiff = Math.abs(input.paymentAmount - expectedPay) / expectedPay;

          if (amountDiff < 0.1) {
            confidence += 0.1;
            matchReasons.push('Payment amount within expected range');
          }
        }

        if (matchReasons.length > 0) {
          const patientName = claim.patient?.demographics
            ? `${claim.patient.demographics.firstName} ${claim.patient.demographics.lastName}`
            : 'Unknown';

          matches.push({
            claimId: claim.id,
            claimNumber: claim.claimNumber || '',
            chargeId: line.charge?.id || '',
            patientId: claim.patientId,
            patientName,
            serviceDate: line.charge?.serviceDate || new Date(),
            cptCode: line.charge?.cptCode || '',
            billedAmount: line.charge?.fee?.toNumber() || 0,
            expectedAmount: (line.charge?.fee?.toNumber() || 0) * 0.8,
            confidence: Math.min(confidence, 1),
            matchReasons,
          });
        }
      }
    }

    // Sort by confidence
    matches.sort((a, b) => b.confidence - a.confidence);

    const bestMatch = matches.length > 0 ? matches[0] : null;
    const matchConfidence = bestMatch?.confidence || 0;

    // Determine if manual review is needed
    let requiresManualReview = false;
    let reviewReason: string | undefined;

    if (!bestMatch) {
      requiresManualReview = true;
      reviewReason = 'No matching claim found';
    } else if (matchConfidence < 0.5) {
      requiresManualReview = true;
      reviewReason = 'Low match confidence';
    } else if (matches.length > 1 && matches[0].confidence - matches[1].confidence < 0.1) {
      requiresManualReview = true;
      reviewReason = 'Multiple similar matches found';
    }

    return {
      matches: matches.slice(0, 10),
      bestMatch,
      matchConfidence,
      requiresManualReview,
      reviewReason,
    };
  }

  /**
   * Handle partial payments and adjustments
   */
  async handlePartialPayment(
    chargeId: string,
    paidAmount: number,
    adjustments: AdjustmentCodeDetail[]
  ): Promise<PartialPaymentResult> {
    const charge = await this.prisma.charge.findFirst({
      where: {
        id: chargeId,
        organizationId: this.organizationId,
      },
      include: {
        claimLines: {
          include: {
            claim: {
              include: {
                insurancePolicy: true,
              },
            },
          },
          take: 1,
        },
      },
    });

    if (!charge) {
      throw new Error(`Charge not found: ${chargeId}`);
    }

    const billedAmount = charge.fee.toNumber();
    const contractualAdjustment = adjustments
      .filter(a => a.isContractual)
      .reduce((sum, a) => sum + a.amount, 0);
    const otherAdjustment = adjustments
      .filter(a => !a.isContractual && !a.isPatientResponsibility)
      .reduce((sum, a) => sum + a.amount, 0);
    const patientResponsibility = adjustments
      .filter(a => a.isPatientResponsibility)
      .reduce((sum, a) => sum + a.amount, 0);

    const totalAdjustments = contractualAdjustment + otherAdjustment + patientResponsibility;
    const remainingBalance = billedAmount - paidAmount - totalAdjustments;
    const isPaidInFull = remainingBalance <= 0.01; // Allow for rounding

    // Check for secondary insurance by looking at the patient's other policies
    const claimLine = charge.claimLines?.[0];
    const hasSecondaryInsurance = false; // Simplified - would need patient policy check
    const secondaryClaimNeeded = hasSecondaryInsurance && remainingBalance > 0;

    return {
      chargeId,
      insurancePaid: paidAmount,
      contractualAdjustment,
      otherAdjustment,
      patientResponsibility,
      remainingBalance: Math.max(0, remainingBalance),
      isPaidInFull,
      hasSecondaryInsurance,
      secondaryClaimNeeded,
    };
  }

  /**
   * Identify posting discrepancies
   */
  identifyDiscrepancies(
    lineItem: RemittanceLineItem,
    match: MatchCandidate,
    adjustmentAnalysis: AdjustmentAnalysis
  ): PostingDiscrepancy[] {
    const discrepancies: PostingDiscrepancy[] = [];

    // Amount mismatch check
    const paidAmount = lineItem.paidAmount?.toNumber() || 0;
    const expectedAmount = match.expectedAmount;
    const amountVariance = Math.abs(paidAmount - expectedAmount) / expectedAmount;

    if (amountVariance > 0.2 && paidAmount !== 0) {
      discrepancies.push({
        lineItemId: lineItem.id,
        type: 'AMOUNT_MISMATCH',
        severity: amountVariance > 0.5 ? 'HIGH' : 'MEDIUM',
        description: `Payment amount differs significantly from expected`,
        expectedValue: expectedAmount,
        actualValue: paidAmount,
        suggestedAction: 'Review payment amount and verify contract rates',
      });
    }

    // Overpayment check
    if (paidAmount > match.billedAmount) {
      discrepancies.push({
        lineItemId: lineItem.id,
        type: 'OVERPAYMENT',
        severity: 'HIGH',
        description: 'Payment exceeds billed amount',
        expectedValue: match.billedAmount,
        actualValue: paidAmount,
        suggestedAction: 'Verify payment and consider refund if overpaid',
      });
    }

    // Service date mismatch
    if (lineItem.serviceDate && match.serviceDate) {
      const lineDate = lineItem.serviceDate.toISOString().split('T')[0];
      const matchDate = match.serviceDate.toISOString().split('T')[0];
      if (lineDate !== matchDate) {
        discrepancies.push({
          lineItemId: lineItem.id,
          type: 'SERVICE_DATE_MISMATCH',
          severity: 'MEDIUM',
          description: 'Service date on ERA does not match claim',
          expectedValue: matchDate,
          actualValue: lineDate,
          suggestedAction: 'Verify correct service date and update if needed',
        });
      }
    }

    // CPT code mismatch
    if (lineItem.cptCode && match.cptCode && lineItem.cptCode !== match.cptCode) {
      discrepancies.push({
        lineItemId: lineItem.id,
        type: 'CPT_MISMATCH',
        severity: 'MEDIUM',
        description: 'CPT code on ERA does not match claim',
        expectedValue: match.cptCode,
        actualValue: lineItem.cptCode,
        suggestedAction: 'Verify correct procedure code',
      });
    }

    // Unusual adjustment check
    if (adjustmentAnalysis.flags.includes('LARGE_ADJUSTMENT')) {
      discrepancies.push({
        lineItemId: lineItem.id,
        type: 'UNEXPECTED_ADJUSTMENT',
        severity: 'MEDIUM',
        description: `Adjustment is ${adjustmentAnalysis.adjustmentPercent.toFixed(0)}% of billed amount`,
        expectedValue: 'Normal adjustment',
        actualValue: adjustmentAnalysis.totalAdjustment,
        suggestedAction: 'Review adjustment codes and verify contract terms',
      });
    }

    // Full denial check
    if (adjustmentAnalysis.flags.includes('FULL_DENIAL')) {
      discrepancies.push({
        lineItemId: lineItem.id,
        type: 'UNEXPECTED_ADJUSTMENT',
        severity: 'HIGH',
        description: 'Claim was fully denied with no payment',
        suggestedAction: 'Review denial reason and consider appeal',
      });
    }

    return discrepancies;
  }

  /**
   * Flag unusual adjustments for review
   */
  analyzeAdjustments(lineItem: RemittanceLineItem, maxAdjustmentPercent: number): AdjustmentAnalysis {
    const adjustmentCodes: AdjustmentCodeDetail[] = [];
    const flags: AdjustmentFlag[] = [];
    const reviewReasons: string[] = [];

    const billedAmount = lineItem.chargedAmount?.toNumber() || 0;
    const paidAmount = lineItem.paidAmount?.toNumber() || 0;
    const adjustmentAmounts = lineItem.adjustmentAmounts as { codes?: Array<{ code: string; amount: number }> } | null;

    // Parse adjustment codes from line item
    let contractualAdjustment = 0;
    let nonContractualAdjustment = 0;

    if (adjustmentAmounts?.codes) {
      for (const adj of adjustmentAmounts.codes) {
        const isContractual = CONTRACTUAL_ADJUSTMENT_CODES.includes(adj.code);
        const isPatientResp = PATIENT_RESPONSIBILITY_CODES.includes(adj.code);
        const isDenial = DENIAL_CODES.includes(adj.code);

        adjustmentCodes.push({
          code: adj.code,
          reasonCode: adj.code,
          amount: adj.amount,
          description: ADJUSTMENT_CODE_DESCRIPTIONS[adj.code] || 'Unknown adjustment',
          isContractual,
          isPatientResponsibility: isPatientResp,
        });

        if (isContractual) {
          contractualAdjustment += adj.amount;
        } else {
          nonContractualAdjustment += adj.amount;
        }

        if (isDenial) {
          flags.push('UNUSUAL_CODE');
          reviewReasons.push(`Denial code ${adj.code}: ${ADJUSTMENT_CODE_DESCRIPTIONS[adj.code]}`);
        }
      }
    }

    const totalAdjustment = contractualAdjustment + nonContractualAdjustment;
    const adjustmentPercent = billedAmount > 0 ? (totalAdjustment / billedAmount) * 100 : 0;

    // Check for large adjustments
    if (adjustmentPercent > maxAdjustmentPercent) {
      flags.push('LARGE_ADJUSTMENT');
      reviewReasons.push(`Adjustment is ${adjustmentPercent.toFixed(0)}% of billed amount`);
    }

    // Check for full denial
    if (paidAmount === 0 && billedAmount > 0) {
      flags.push('FULL_DENIAL');
      reviewReasons.push('Payment is $0 - claim may be denied');
    }

    // Check if contractual exceeds allowed amount
    if (contractualAdjustment > billedAmount * 0.6) {
      flags.push('CONTRACTUAL_EXCEEDS_ALLOWED');
      reviewReasons.push('Contractual adjustment exceeds 60% of billed amount');
    }

    if (flags.length === 0) {
      flags.push('NORMAL');
    }

    return {
      totalAdjustment,
      contractualAdjustment,
      nonContractualAdjustment,
      adjustmentPercent,
      adjustmentCodes,
      flags,
      requiresReview: flags.some(f => f !== 'NORMAL'),
      reviewReasons,
    };
  }

  /**
   * Trigger secondary claim when needed
   */
  async triggerSecondaryClaim(
    primaryClaimId: string,
    lineItem: RemittanceLineItem
  ): Promise<SecondaryClaimResult | null> {
    const primaryClaim = await this.prisma.claim.findFirst({
      where: {
        id: primaryClaimId,
        organizationId: this.organizationId,
      },
      include: {
        patient: {
          include: {
            insurances: {
              where: { isActive: true },
              orderBy: { type: 'asc' }, // PRIMARY < SECONDARY < TERTIARY
              take: 2,
            },
          },
        },
      },
    });

    if (!primaryClaim) {
      return null;
    }

    // Check if patient has a secondary insurance
    const patientInsurances = primaryClaim.patient?.insurances || [];
    const secondaryInsurance = patientInsurances.find((ins: { type: string }) => ins.type === 'SECONDARY');

    if (!secondaryInsurance) {
      return null;
    }

    // Create secondary claim
    const secondaryClaim = await this.prisma.claim.create({
      data: {
        patientId: primaryClaim.patientId,
        payerId: secondaryInsurance.payerId,
        insurancePolicyId: secondaryInsurance.id,
        status: 'DRAFT',
        totalCharges: primaryClaim.totalCharges,
        totalPaid: 0,
        totalAdjusted: 0,
        claimType: 'secondary',
        isSecondary: true,
        originalClaimId: primaryClaimId,
        organizationId: this.organizationId,
      },
    });

    // Add note to original claim
    await this.prisma.claimNote.create({
      data: {
        claimId: primaryClaimId,
        noteType: 'ai_posting',
        note: `[AI Smart Posting] Secondary claim ${secondaryClaim.id} triggered after primary payment. Remaining balance: $${lineItem.paidAmount?.toNumber() || 0}`,
      },
    });

    return {
      originalClaimId: primaryClaimId,
      secondaryClaimId: secondaryClaim.id,
      primaryPaidAmount: lineItem.paidAmount?.toNumber() || 0,
      remainingBalance: (lineItem.chargedAmount?.toNumber() || 0) - (lineItem.paidAmount?.toNumber() || 0),
      secondaryPayerId: secondaryInsurance.payerId || '',
      triggerReason: 'Primary insurance paid, secondary coverage available',
    };
  }

  /**
   * Calculate patient responsibility
   */
  calculatePatientResponsibility(lineItem: RemittanceLineItem): number {
    let patientResponsibility = lineItem.patientAmount?.toNumber() || 0;
    const adjustmentAmounts = lineItem.adjustmentAmounts as { codes?: Array<{ code: string; amount: number }> } | null;

    // Also check adjustment codes for patient responsibility
    if (adjustmentAmounts?.codes) {
      for (const adj of adjustmentAmounts.codes) {
        if (PATIENT_RESPONSIBILITY_CODES.includes(adj.code)) {
          patientResponsibility += adj.amount;
        }
      }
    }

    return patientResponsibility;
  }

  /**
   * Update patient balance (balance forward)
   */
  async updatePatientBalance(
    patientId: string,
    claimId: string,
    payment: number,
    adjustments: number,
    patientResponsibility: number
  ): Promise<PatientBalanceUpdate> {
    // Get patient's current balance
    const balanceRecord = await this.prisma.patientLocationBalance.findFirst({
      where: {
        patientId,
      },
    });

    const previousBalance = balanceRecord?.currentBalance?.toNumber() || 0;

    // Update balance
    const newBalance = previousBalance - payment - adjustments + patientResponsibility;

    if (balanceRecord) {
      await this.prisma.patientLocationBalance.update({
        where: { id: balanceRecord.id },
        data: {
          currentBalance: newBalance,
          totalPayments: { increment: payment },
          totalAdjustments: { increment: adjustments },
          lastPaymentDate: new Date(),
        },
      });
    }

    // Determine if statement is needed
    const needsStatement = patientResponsibility > 0 && newBalance > 10;

    return {
      patientId,
      claimId,
      previousBalance,
      newCharges: 0,
      insurancePayments: payment,
      adjustments,
      newBalance,
      needsStatement,
    };
  }

  /**
   * Get posting metrics for reporting
   */
  async getPostingMetrics(dateFrom?: Date, dateTo?: Date): Promise<PostingMetrics> {
    const startDate = dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = dateTo || new Date();

    // Get processed remittances
    const remittances = await this.prisma.remittance.findMany({
      where: {
        organizationId: this.organizationId,
        processedDate: { gte: startDate, lte: endDate },
        isProcessed: true,
      },
      include: {
        lineItems: true,
      },
    });

    // Get AI billing tasks for posting
    const postingTasks = await this.prisma.aIBillingTask.findMany({
      where: {
        organizationId: this.organizationId,
        taskType: 'POST',
        createdAt: { gte: startDate, lte: endDate },
      },
    });

    let totalLines = 0;
    let autoPostedLines = 0;
    let totalConfidence = 0;
    let discrepancyCount = 0;
    let totalPostedAmount = 0;
    let totalAdjustmentAmount = 0;
    let totalPatientResponsibility = 0;
    let secondaryClaimsTriggered = 0;
    const adjustmentCodeCounts = new Map<string, { count: number; totalAmount: number }>();
    const discrepancyTypeCounts = new Map<DiscrepancyType, number>();

    for (const remittance of remittances) {
      for (const lineItem of remittance.lineItems) {
        totalLines++;

        if (lineItem.isPosted) {
          autoPostedLines++;
          totalPostedAmount += lineItem.paidAmount?.toNumber() || 0;
        }

        // Track adjustments
        const adjustmentAmounts = lineItem.adjustmentAmounts as { codes?: Array<{ code: string; amount: number }> } | null;
        if (adjustmentAmounts?.codes) {
          for (const adj of adjustmentAmounts.codes) {
            const existing = adjustmentCodeCounts.get(adj.code) || { count: 0, totalAmount: 0 };
            adjustmentCodeCounts.set(adj.code, {
              count: existing.count + 1,
              totalAmount: existing.totalAmount + adj.amount,
            });
            totalAdjustmentAmount += adj.amount;

            if (PATIENT_RESPONSIBILITY_CODES.includes(adj.code)) {
              totalPatientResponsibility += adj.amount;
            }
          }
        }
      }
    }

    // Calculate metrics
    const autoPostRate = totalLines > 0 ? (autoPostedLines / totalLines) * 100 : 0;
    const averageMatchConfidence = autoPostedLines > 0 ? totalConfidence / autoPostedLines : 0;
    const discrepancyRate = totalLines > 0 ? (discrepancyCount / totalLines) * 100 : 0;
    const averagePostingTimeMs = postingTasks.length > 0
      ? postingTasks.reduce((sum, t) => sum + ((t.result as { processingTimeMs?: number })?.processingTimeMs || 0), 0) / postingTasks.length
      : 0;

    // Top adjustment codes
    const topAdjustmentCodes = Array.from(adjustmentCodeCounts.entries())
      .map(([code, data]) => ({ code, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Top discrepancy types
    const topDiscrepancyTypes = Array.from(discrepancyTypeCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      periodStart: startDate,
      periodEnd: endDate,
      totalErasProcessed: remittances.length,
      totalLinesProcessed: totalLines,
      autoPostRate,
      averageMatchConfidence,
      discrepancyRate,
      averagePostingTimeMs,
      topDiscrepancyTypes,
      topAdjustmentCodes,
      secondaryClaimRate: totalLines > 0 ? (secondaryClaimsTriggered / totalLines) * 100 : 0,
      totalPostedAmount,
      totalAdjustmentAmount,
      totalPatientResponsibility,
    };
  }

  /**
   * Get unposted remittance line items
   */
  async getUnpostedLineItems(limit: number = 50): Promise<{
    items: Array<{
      lineItem: RemittanceLineItem;
      remittance: { id: string; checkNumber: string | null; receivedDate: Date };
      suggestedMatch: MatchCandidate | null;
      matchConfidence: number;
    }>;
    total: number;
  }> {
    const unpostedLines = await this.prisma.remittanceLineItem.findMany({
      where: {
        remittance: {
          organizationId: this.organizationId,
        },
        isPosted: false,
      },
      include: {
        remittance: {
          select: { id: true, checkNumber: true, receivedDate: true },
        },
      },
      take: limit,
      orderBy: { remittance: { receivedDate: 'asc' } },
    });

    const total = await this.prisma.remittanceLineItem.count({
      where: {
        remittance: {
          organizationId: this.organizationId,
        },
        isPosted: false,
      },
    });

    const items = await Promise.all(
      unpostedLines.map(async line => {
        const matchResult = await this.matchPayment({
          remittanceLineId: line.id,
          paymentAmount: line.paidAmount?.toNumber() || 0,
          patientName: line.patientName || undefined,
          serviceDate: line.serviceDate || undefined,
          cptCode: line.cptCode || undefined,
        });

        return {
          lineItem: line,
          remittance: line.remittance,
          suggestedMatch: matchResult.bestMatch,
          matchConfidence: matchResult.matchConfidence,
        };
      })
    );

    return { items, total };
  }

  /**
   * Manual post payment with override
   */
  async manualPostPayment(
    lineItemId: string,
    claimId: string,
    chargeId: string,
    options: {
      overrideAmount?: number;
      adjustmentOverride?: AdjustmentCodeDetail[];
      notes?: string;
    } = {}
  ): Promise<LinePostingResult> {
    const lineItem = await this.prisma.remittanceLineItem.findFirst({
      where: {
        id: lineItemId,
        remittance: { organizationId: this.organizationId },
      },
    });

    if (!lineItem) {
      throw new Error(`Line item not found: ${lineItemId}`);
    }

    const claim = await this.prisma.claim.findFirst({
      where: {
        id: claimId,
        organizationId: this.organizationId,
      },
      include: {
        patient: { include: { demographics: true } },
      },
    });

    if (!claim) {
      throw new Error(`Claim not found: ${claimId}`);
    }

    const charge = await this.prisma.charge.findFirst({
      where: {
        id: chargeId,
        organizationId: this.organizationId,
      },
    });

    if (!charge) {
      throw new Error(`Charge not found: ${chargeId}`);
    }

    const postAmount = options.overrideAmount ?? lineItem.paidAmount?.toNumber() ?? 0;
    const adjustmentAnalysis = options.adjustmentOverride
      ? {
          totalAdjustment: options.adjustmentOverride.reduce((sum, a) => sum + a.amount, 0),
          contractualAdjustment: options.adjustmentOverride.filter(a => a.isContractual).reduce((sum, a) => sum + a.amount, 0),
          nonContractualAdjustment: options.adjustmentOverride.filter(a => !a.isContractual).reduce((sum, a) => sum + a.amount, 0),
          adjustmentPercent: 0,
          adjustmentCodes: options.adjustmentOverride,
          flags: ['NORMAL'] as AdjustmentFlag[],
          requiresReview: false,
          reviewReasons: [],
        }
      : this.analyzeAdjustments(lineItem, 50);

    const patientResponsibility = this.calculatePatientResponsibility(lineItem);

    const patientName = claim.patient?.demographics
      ? `${claim.patient.demographics.firstName} ${claim.patient.demographics.lastName}`
      : 'Unknown';

    const match: MatchCandidate = {
      claimId,
      claimNumber: claim.claimNumber || '',
      chargeId,
      patientId: claim.patientId,
      patientName,
      serviceDate: charge.serviceDate,
      cptCode: charge.cptCode || '',
      billedAmount: charge.fee.toNumber(),
      expectedAmount: charge.fee.toNumber() * 0.8,
      confidence: 1, // Manual match
      matchReasons: ['Manual match by user'],
    };

    const postResult = await this.postPayment(lineItem, match, adjustmentAnalysis, patientResponsibility);

    return {
      lineItemId,
      claimId,
      chargeId,
      status: postResult.success ? (postResult.isPaidInFull ? 'POSTED' : 'PARTIAL') : 'FAILED',
      matchConfidence: 1,
      postedAmount: postAmount,
      adjustmentAmount: adjustmentAnalysis.totalAdjustment,
      patientResponsibility,
      adjustmentFlags: adjustmentAnalysis.flags,
      discrepancy: null,
      secondaryClaimTriggered: postResult.secondaryClaimNeeded,
      notes: options.notes || 'Manual posting',
    };
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  private async postPayment(
    lineItem: RemittanceLineItem,
    match: MatchCandidate,
    adjustmentAnalysis: AdjustmentAnalysis,
    patientResponsibility: number
  ): Promise<{ success: boolean; isPaidInFull: boolean; secondaryClaimNeeded: boolean }> {
    try {
      const paidAmount = lineItem.paidAmount?.toNumber() || 0;

      // Create payment record
      const payment = await this.prisma.payment.create({
        data: {
          amount: paidAmount,
          paymentDate: new Date(),
          postedDate: new Date(),
          paymentMethod: 'ACH',
          payerType: 'insurance',
          patientId: match.patientId,
          claimId: match.claimId,
          notes: `ERA posting - Check: ${lineItem.remittanceId}`,
          organizationId: this.organizationId,
          allocations: {
            create: {
              amount: paidAmount,
              chargeId: match.chargeId,
            },
          },
        },
      });

      // Update charge status
      const charge = await this.prisma.charge.findUnique({
        where: { id: match.chargeId },
      });

      if (charge) {
        const totalPaid = charge.payments.toNumber() + paidAmount;
        const isPaidInFull = totalPaid >= charge.fee.toNumber() - adjustmentAnalysis.totalAdjustment;

        await this.prisma.charge.update({
          where: { id: match.chargeId },
          data: {
            payments: { increment: paidAmount },
            status: isPaidInFull ? 'PAID' : 'BILLED',
          },
        });

        // Update claim totals
        await this.prisma.claim.update({
          where: { id: match.claimId },
          data: {
            totalPaid: { increment: paidAmount },
            totalAdjusted: { increment: adjustmentAnalysis.totalAdjustment },
          },
        });

        // Mark line item as posted
        await this.prisma.remittanceLineItem.update({
          where: { id: lineItem.id },
          data: {
            isPosted: true,
            claimId: match.claimId,
            chargeId: match.chargeId,
          },
        });

        // Update patient balance
        await this.updatePatientBalance(
          match.patientId,
          match.claimId,
          paidAmount,
          adjustmentAnalysis.totalAdjustment,
          patientResponsibility
        );

        // Check for secondary insurance need
        const partialResult = await this.handlePartialPayment(
          match.chargeId,
          paidAmount,
          adjustmentAnalysis.adjustmentCodes
        );

        // Create AI billing task record
        await this.prisma.aIBillingTask.create({
          data: {
            taskType: 'POST',
            status: 'COMPLETED',
            claimId: match.claimId,
            completedAt: new Date(),
            result: {
              paymentId: payment.id,
              amount: paidAmount,
              adjustments: adjustmentAnalysis.totalAdjustment,
              isPaidInFull,
            },
            organizationId: this.organizationId,
          },
        });

        return {
          success: true,
          isPaidInFull,
          secondaryClaimNeeded: partialResult.secondaryClaimNeeded,
        };
      }

      return { success: false, isPaidInFull: false, secondaryClaimNeeded: false };
    } catch (error) {
      console.error('Payment posting failed:', error);
      return { success: false, isPaidInFull: false, secondaryClaimNeeded: false };
    }
  }

  private generatePostingNotes(
    status: PostingStatus,
    matchResult: PaymentMatchOutput,
    adjustmentAnalysis: AdjustmentAnalysis
  ): string {
    const notes: string[] = [];

    notes.push(`Status: ${status}`);
    notes.push(`Match confidence: ${(matchResult.matchConfidence * 100).toFixed(0)}%`);

    if (matchResult.bestMatch) {
      notes.push(`Matched to claim: ${matchResult.bestMatch.claimNumber}`);
    }

    if (adjustmentAnalysis.flags.length > 0 && !adjustmentAnalysis.flags.includes('NORMAL')) {
      notes.push(`Flags: ${adjustmentAnalysis.flags.join(', ')}`);
    }

    if (adjustmentAnalysis.reviewReasons.length > 0) {
      notes.push(`Review reasons: ${adjustmentAnalysis.reviewReasons.join('; ')}`);
    }

    return notes.join(' | ');
  }

  private async updatePostingMetrics(
    results: LinePostingResult[],
    discrepancies: PostingDiscrepancy[]
  ): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingMetric = await this.prisma.aIBillingMetric.findFirst({
      where: {
        organizationId: this.organizationId,
        metricDate: { gte: today },
        periodType: 'daily',
      },
    });

    const posted = results.filter(r => r.status === 'POSTED').length;
    const totalAmount = results.reduce((sum, r) => sum + r.postedAmount, 0);

    if (existingMetric) {
      await this.prisma.aIBillingMetric.update({
        where: { id: existingMetric.id },
        data: {
          paymentsPosted: { increment: posted },
          amountPosted: { increment: totalAmount },
        },
      });
    } else {
      await this.prisma.aIBillingMetric.create({
        data: {
          metricDate: today,
          periodType: 'daily',
          paymentsPosted: posted,
          amountPosted: totalAmount,
          organizationId: this.organizationId,
        },
      });
    }
  }
}
