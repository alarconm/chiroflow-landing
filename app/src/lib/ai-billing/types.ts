/**
 * Epic 09: AI Billing Agent - Type Definitions
 *
 * TypeScript interfaces for all AI billing operations.
 */

import type {
  ScrubSeverity,
  ScrubResultStatus,
  DenialRiskLevel,
  AppealLetterStatus,
  PaymentMatchStatus,
  UnderpaymentStatus,
  AIBillingJobType,
  AIBillingJobStatus,
} from '@prisma/client';

// ============================================
// Claim Scrubbing Types
// ============================================

export interface ClaimScrubInput {
  claimId: string;
  includeWarnings?: boolean;
  checkHistorical?: boolean;
}

export interface ClaimScrubIssueInput {
  severity: ScrubSeverity;
  code: string;
  category: string;
  field?: string;
  message: string;
  suggestion?: string;
  claimLineNumber?: number;
  cptCode?: string;
}

export interface ClaimScrubOutput {
  status: ScrubResultStatus;
  overallScore: number;
  passedChecks: number;
  failedChecks: number;
  warningChecks: number;
  summary: string;
  recommendation: 'SUBMIT' | 'REVIEW' | 'FIX_REQUIRED';
  issues: ClaimScrubIssueInput[];
  processingTimeMs: number;
}

// Scrub rule definition
export interface ScrubRule {
  code: string;
  category: string;
  severity: ScrubSeverity;
  description: string;
  validate: (claim: ClaimData) => ScrubRuleResult;
}

export interface ScrubRuleResult {
  passed: boolean;
  message?: string;
  suggestion?: string;
  field?: string;
  claimLineNumber?: number;
  cptCode?: string;
}

// ============================================
// Denial Prediction Types
// ============================================

export interface DenialPredictionInput {
  claimId: string;
  useHistoricalData?: boolean;
}

export interface RiskFactor {
  factor: string;
  weight: number;
  description: string;
  value?: string | number;
}

export interface DenialPredictionOutput {
  riskLevel: DenialRiskLevel;
  riskScore: number; // 0-100
  confidenceScore: number; // 0-1
  primaryReason?: string;
  riskFactors: RiskFactor[];
  historicalDenialRate?: number;
  payerDenialRate?: number;
  recommendations: string[];
  processingTimeMs: number;
}

// ============================================
// Appeal Generation Types
// ============================================

export interface AppealGenerationInput {
  denialId: string;
  appealType?: 'FIRST_LEVEL' | 'SECOND_LEVEL' | 'EXTERNAL';
  includeClinicSupport?: boolean;
}

export interface AppealArgument {
  type: string;
  text: string;
  supporting?: string;
}

export interface AppealCitation {
  type: 'MEDICAL' | 'LEGAL' | 'GUIDELINE' | 'POLICY';
  source: string;
  text: string;
  reference?: string;
}

export interface AppealGenerationOutput {
  subject: string;
  body: string;
  appealType: string;
  denialCode?: string;
  denialReason?: string;
  arguments: AppealArgument[];
  citations: AppealCitation[];
  clinicalSummary?: string;
  medicalNecessity?: string;
  recommendedDocs: string[];
  templateName?: string;
  processingTimeMs: number;
}

// ============================================
// Payment Matching Types
// ============================================

export interface PaymentMatchInput {
  remittanceLineId?: string;
  paymentAmount: number;
  patientName?: string;
  patientAccountNumber?: string;
  serviceDate?: Date;
  cptCode?: string;
  payerName?: string;
  checkNumber?: string;
  organizationId: string;
}

export interface MatchCriteria {
  patientMatch: number; // 0-1 confidence
  dateMatch: number;
  amountMatch: number;
  codeMatch: number;
  overall: number;
}

export interface SuggestedAllocation {
  chargeId: string;
  amount: number;
  adjustmentAmount?: number;
  patientResponsibility?: number;
}

export interface PaymentMatchOutput {
  matches: PaymentMatchResult[];
  processingTimeMs: number;
}

export interface PaymentMatchResult {
  chargeId: string;
  patientId: string;
  patientName: string;
  chargeAmount: number;
  serviceDate: Date;
  cptCode: string;
  confidenceScore: number;
  matchMethod: string;
  matchCriteria: MatchCriteria;
  suggestedAllocation: SuggestedAllocation;
}

// ============================================
// Underpayment Detection Types
// ============================================

export interface UnderpaymentScanInput {
  claimId?: string;
  chargeId?: string;
  payerId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  threshold?: number; // Minimum underpayment % to flag
  organizationId: string;
}

export interface UnderpaymentResult {
  claimId?: string;
  chargeId?: string;
  patientId: string;
  payerId?: string;
  payerName?: string;
  billedAmount: number;
  expectedAmount: number;
  paidAmount: number;
  underpaidAmount: number;
  calculationBasis: 'FEE_SCHEDULE' | 'CONTRACT' | 'HISTORICAL';
  underpaymentReason?: string;
  adjustmentCodes?: string[];
  recoveryLikelihood: number;
  recoveryAmount: number;
  cptCode?: string;
  serviceDate?: Date;
}

export interface UnderpaymentScanOutput {
  totalScanned: number;
  underpaymentCount: number;
  totalUnderpaidAmount: number;
  potentialRecovery: number;
  results: UnderpaymentResult[];
  processingTimeMs: number;
}

// ============================================
// Claim Data Types (for internal processing)
// ============================================

export interface ClaimData {
  id: string;
  claimNumber?: string;
  status: string;
  totalCharges: number;
  claimType: string;
  // Patient info
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    dateOfBirth: Date;
    gender: string;
    address?: {
      line1: string;
      city: string;
      state: string;
      zip: string;
    };
  };
  // Insurance info
  insurance?: {
    payerId?: string;
    payerName?: string;
    subscriberId?: string;
    groupNumber?: string;
    relationshipCode?: string;
  };
  // Provider info
  provider?: {
    npi?: string;
    taxId?: string;
    name?: string;
  };
  // Diagnoses
  diagnoses: Array<{
    code: string;
    sequence: number;
    isPrimary: boolean;
  }>;
  // Claim lines
  lines: Array<{
    lineNumber: number;
    cptCode: string;
    modifiers: string[];
    description: string;
    units: number;
    chargeAmount: number;
    serviceDateFrom: Date;
    serviceDateTo: Date;
    diagnosisPointers: number[];
    placeOfService: string;
  }>;
  // Submission details
  billingNpi?: string;
  renderingNpi?: string;
  facilityNpi?: string;
  // Organization
  organizationId: string;
}

// ============================================
// Batch Job Types
// ============================================

export interface BatchJobInput {
  jobType: AIBillingJobType;
  config?: Record<string, unknown>;
  scheduledFor?: Date;
  organizationId: string;
  createdBy?: string;
}

export interface BatchJobProgress {
  totalItems: number;
  processedItems: number;
  successCount: number;
  failureCount: number;
  currentItem?: string;
}

export interface BatchJobResult {
  jobId: string;
  status: AIBillingJobStatus;
  progress: BatchJobProgress;
  resultSummary?: Record<string, unknown>;
  errorMessage?: string;
  processingTimeMs?: number;
}

// ============================================
// Audit Types
// ============================================

export interface AuditLogInput {
  action: string;
  entityType: string;
  entityId: string;
  decision?: string;
  confidence?: number;
  reasoning?: string;
  inputData?: Record<string, unknown>;
  outputData?: Record<string, unknown>;
  processingTimeMs?: number;
  modelVersion?: string;
  organizationId: string;
}

// ============================================
// CARC/RARC Code Reference
// ============================================

// Common Claim Adjustment Reason Codes (CARC)
export const COMMON_CARC_CODES: Record<string, string> = {
  '1': 'Deductible amount',
  '2': 'Coinsurance amount',
  '3': 'Copayment amount',
  '4': 'The procedure code is inconsistent with the modifier used',
  '5': 'The procedure code/bill type is inconsistent with the place of service',
  '6': 'The procedure/revenue code is inconsistent with the patient\'s age',
  '16': 'Claim/service lacks information needed for adjudication',
  '18': 'Duplicate claim/service',
  '22': 'This care may be covered by another payer',
  '26': 'Expenses incurred prior to coverage',
  '27': 'Expenses incurred after coverage terminated',
  '29': 'The time limit for filing has expired',
  '31': 'Patient cannot be identified as our insured',
  '32': 'Our records indicate that this dependent is not an eligible dependent',
  '33': 'Insured has no dependent coverage',
  '45': 'Charge exceeds fee schedule/maximum allowable',
  '50': 'These are non-covered services because this is not deemed a medical necessity',
  '96': 'Non-covered charge(s)',
  '97': 'The benefit for this service is included in the payment/allowance for another service',
  '109': 'Claim/service not covered by this payer/contractor',
  '167': 'This is not, or is no longer, a covered diagnosis',
  '197': 'Precertification/authorization/notification absent',
  '204': 'This service/equipment/drug is not covered under the patient\'s current benefit plan',
};

// Common Remittance Advice Remark Codes (RARC)
export const COMMON_RARC_CODES: Record<string, string> = {
  'M1': 'X-ray not taken within the past 12 months or near enough to admission date',
  'M2': 'Not paid separately when the patient is an inpatient',
  'M15': 'Separately billed services/tests denied',
  'M20': 'Anesthesia time units must be reported',
  'N30': 'Patient ineligible for this service',
  'N56': 'Procedure code billed is not correct/valid for the services billed',
  'N95': 'Missing/incomplete/invalid diagnosis or condition',
  'N130': 'Consult the Medicare Claims Processing Manual for further clarification',
  'N425': 'Missing/incomplete/invalid information on the date the service was ordered',
  'N432': 'Alert: An issue with the prescriber was identified but the payer processed the claim',
  'MA04': 'Secondary payment cannot be considered without the identity of the primary payer',
  'MA130': 'Your claim has been assigned to a different payer for processing',
};
