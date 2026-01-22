/**
 * Epic 08: Clearinghouse Integration - Type Definitions
 *
 * TypeScript interfaces for all X12 EDI transactions and clearinghouse operations.
 */

import { ClearinghouseProvider, SubmissionStatus, EligibilityStatus, DenialStatus } from '@prisma/client';

// ============================================
// Configuration Types
// ============================================

export interface ClearinghouseCredentials {
  submitterId?: string;
  username?: string;
  password?: string;
  apiKey?: string;
  siteId?: string;
}

export interface ClearinghouseEndpoints {
  baseUrl?: string;
  claimEndpoint?: string;
  eligibilityEndpoint?: string;
  statusEndpoint?: string;
  eraEndpoint?: string;
}

export interface ClearinghouseSettings {
  batchSize: number;
  autoSubmit: boolean;
  autoPostEra: boolean;
  billingNpi?: string;
  billingTaxId?: string;
  [key: string]: unknown;
}

export interface ClearinghouseConfigData {
  id: string;
  provider: ClearinghouseProvider;
  name: string;
  isActive: boolean;
  isPrimary: boolean;
  credentials: ClearinghouseCredentials;
  endpoints: ClearinghouseEndpoints;
  settings: ClearinghouseSettings;
  organizationId: string;
}

// ============================================
// 837P Claim Submission Types
// ============================================

export interface ClaimSubmissionRequest {
  claimId: string;
  clearinghouseConfigId: string;
  // Patient info
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    dateOfBirth: Date;
    gender: string;
    address?: {
      line1: string;
      line2?: string;
      city: string;
      state: string;
      zip: string;
    };
  };
  // Insurance info
  insurance: {
    payerId: string;
    payerName: string;
    subscriberId: string;
    groupNumber?: string;
    relationshipCode: string;
    subscriber?: {
      firstName: string;
      lastName: string;
      dateOfBirth?: Date;
    };
  };
  // Provider info
  provider: {
    npi: string;
    taxId?: string;
    name: string;
    address?: {
      line1: string;
      line2?: string;
      city: string;
      state: string;
      zip: string;
    };
  };
  // Claim info
  claim: {
    id: string;
    claimNumber: string;
    totalCharges: number;
    claimType: string;
    placeOfService: string;
    diagnoses: Array<{
      code: string;
      sequence: number;
      isPrimary: boolean;
    }>;
    services: Array<{
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
  };
}

export interface ClaimSubmissionResponse {
  success: boolean;
  batchId?: string;
  controlNumber?: string;
  status: SubmissionStatus;
  responseCode?: string;
  responseMessage?: string;
  ediContent?: string;
  rawResponse?: string;
  errors?: ClaimError[];
}

export interface ClaimError {
  code: string;
  message: string;
  field?: string;
  lineNumber?: number;
}

// ============================================
// 270/271 Eligibility Types
// ============================================

export interface EligibilityRequest {
  clearinghouseConfigId: string;
  patientId: string;
  insuranceId?: string;
  // Patient info
  patient: {
    firstName: string;
    lastName: string;
    dateOfBirth: Date;
    gender?: string;
  };
  // Subscriber info (if different from patient)
  subscriber?: {
    memberId: string;
    firstName: string;
    lastName: string;
    dateOfBirth?: Date;
    relationshipCode: string;
  };
  // Payer info
  payer: {
    payerId: string;
    payerName: string;
  };
  // Request parameters
  serviceDate?: Date;
  serviceTypes?: string[]; // Service type codes (e.g., "30" for health benefit)
}

export interface EligibilityResponse {
  success: boolean;
  status: EligibilityStatus;
  responseDate: Date;
  errorMessage?: string;
  // Coverage info
  coverage: {
    status: string; // Active, Inactive
    planName?: string;
    planType?: string; // HMO, PPO, etc.
    effectiveDate?: Date;
    terminationDate?: Date;
  };
  // Benefits info
  benefits: {
    deductible?: number;
    deductibleMet?: number;
    outOfPocketMax?: number;
    outOfPocketMet?: number;
    copay?: number;
    coinsurance?: number; // Percentage
  };
  // Visit limits (chiropractic specific)
  visitLimits?: {
    remaining?: number;
    used?: number;
    max?: number;
  };
  // Authorization info
  authorization?: {
    required: boolean;
    number?: string;
    effectiveDate?: Date;
    terminationDate?: Date;
  };
  // Raw response
  responseJson?: Record<string, unknown>;
  ediRequest?: string;
  ediResponse?: string;
}

// ============================================
// 276/277 Claim Status Types
// ============================================

export interface ClaimStatusRequest {
  clearinghouseConfigId: string;
  claimId: string;
  // Claim identifiers
  claimNumber?: string;
  payerClaimNumber?: string;
  // Patient info
  patient: {
    firstName: string;
    lastName: string;
    dateOfBirth: Date;
    memberId?: string;
  };
  // Payer info
  payer: {
    payerId: string;
    payerName: string;
  };
  // Service date range
  serviceDateFrom?: Date;
  serviceDateTo?: Date;
}

export interface ClaimStatusResponse {
  success: boolean;
  status: SubmissionStatus;
  responseDate: Date;
  errorMessage?: string;
  traceNumber?: string;
  // Claim status
  claimStatus: {
    categoryCode: string; // A0-A8, P0-P4, etc.
    categoryDescription: string;
    statusCode?: string;
    statusDescription?: string;
  };
  // Financial info
  financial?: {
    totalCharged?: number;
    totalPaid?: number;
    patientResponsibility?: number;
    adjudicationDate?: Date;
    checkNumber?: string;
    paymentDate?: Date;
  };
  // Payer claim info
  payerClaimNumber?: string;
  // Raw response
  responseJson?: Record<string, unknown>;
  ediRequest?: string;
  ediResponse?: string;
}

// ============================================
// 835 ERA/Remittance Types
// ============================================

export interface RemittanceFetchRequest {
  clearinghouseConfigId: string;
  startDate?: Date;
  endDate?: Date;
  checkNumber?: string;
}

export interface RemittanceData {
  checkNumber: string;
  checkDate: Date;
  payerName: string;
  payerId?: string;
  totalPaid: number;
  totalAdjusted: number;
  totalCharges: number;
  claims: RemittanceClaimData[];
  // Raw data
  ediContent?: string;
  parsedData?: Record<string, unknown>;
}

export interface RemittanceClaimData {
  patientName: string;
  patientAccountNumber?: string;
  payerClaimNumber?: string;
  services: RemittanceServiceData[];
}

export interface RemittanceServiceData {
  lineNumber: number;
  serviceDate?: Date;
  cptCode: string;
  modifiers: string[];
  units: number;
  chargedAmount: number;
  allowedAmount: number;
  paidAmount: number;
  adjustedAmount: number;
  patientAmount: number;
  adjustmentReasonCodes: string[]; // CARC codes
  adjustmentAmounts: Record<string, number>;
  remarkCodes: string[]; // RARC codes
}

export interface RemittancePostResult {
  success: boolean;
  postedCount: number;
  errors: Array<{
    lineItemId: string;
    error: string;
  }>;
}

// ============================================
// Denial Types
// ============================================

export interface DenialData {
  claimId: string;
  patientId: string;
  denialCode: string;
  denialReason: string;
  category?: string;
  deniedAmount: number;
  billedAmount: number;
  serviceDate?: Date;
  cptCode?: string;
  payerId?: string;
  payerName?: string;
  appealDeadline?: Date;
}

export interface AppealRequest {
  denialId: string;
  appealNotes: string;
  supportingDocuments?: string[];
}

export interface AppealResponse {
  success: boolean;
  appealNumber?: string;
  message?: string;
  errors?: string[];
}

// ============================================
// Batch Operations
// ============================================

export interface BatchSubmissionRequest {
  clearinghouseConfigId: string;
  claimIds: string[];
}

export interface BatchSubmissionResponse {
  batchId: string;
  totalClaims: number;
  submittedClaims: number;
  failedClaims: number;
  results: Array<{
    claimId: string;
    success: boolean;
    controlNumber?: string;
    error?: string;
  }>;
}

// ============================================
// Provider Interface
// ============================================

export interface IClearinghouseProvider {
  readonly providerType: ClearinghouseProvider;

  // Configuration
  configure(config: ClearinghouseConfigData): Promise<void>;
  testConnection(): Promise<{ success: boolean; message?: string }>;

  // 837P Claim Submission
  submitClaim(request: ClaimSubmissionRequest): Promise<ClaimSubmissionResponse>;
  submitClaimBatch(request: BatchSubmissionRequest): Promise<BatchSubmissionResponse>;

  // 270/271 Eligibility
  checkEligibility(request: EligibilityRequest): Promise<EligibilityResponse>;

  // 276/277 Claim Status
  checkClaimStatus(request: ClaimStatusRequest): Promise<ClaimStatusResponse>;

  // 835 ERA/Remittance
  fetchRemittances(request: RemittanceFetchRequest): Promise<RemittanceData[]>;

  // Appeal
  submitAppeal?(request: AppealRequest): Promise<AppealResponse>;
}

// ============================================
// Helper Types
// ============================================

// X12 Segment Delimiters
export interface X12Delimiters {
  segment: string;
  element: string;
  subelement: string;
}

// Common X12 codes
export const RELATIONSHIP_CODES = {
  SELF: '18',
  SPOUSE: '01',
  CHILD: '19',
  OTHER: '21',
} as const;

export const GENDER_CODES = {
  MALE: 'M',
  FEMALE: 'F',
  UNKNOWN: 'U',
} as const;

export const CLAIM_STATUS_CATEGORY = {
  A0: 'Acknowledgment/Forwarded',
  A1: 'Acknowledgment/Receipt',
  A2: 'Acknowledgment/Acceptance into adjudication system',
  A3: 'Acknowledgment/Returned as unprocessable',
  A4: 'Acknowledgment/Not Found',
  A5: 'Acknowledgment/Split',
  A6: 'Acknowledgment/Rejected for Missing Information',
  A7: 'Acknowledgment/Receipt into the final adjudication system',
  A8: 'Acknowledgment/System Status',
  P0: 'Pending/Adjudication',
  P1: 'Pending/Payer Review',
  P2: 'Pending/Medical Review',
  P3: 'Pending/Provider Requested Information',
  P4: 'Pending/Patient Requested Information',
  F0: 'Finalized/Payment',
  F1: 'Finalized/Denial',
  F2: 'Finalized/Partially Paid',
  F3: 'Finalized/Adjusted',
  F4: 'Finalized/Appeal',
  R0: 'Request for Additional Information/General',
  R1: 'Request for Additional Information/Entity Requests',
  R3: 'Request for Additional Information/Claim/Service Requests',
  R4: 'Request for Additional Information/Documentation Requests',
  R5: 'Request for Additional Information/More specific detail requests',
  E0: 'Error/Authentication',
  E1: 'Error/Authorization',
  E2: 'Error/Syntax error',
  E3: 'Error/Informational Only',
  E4: 'Error/Subscriber not Found',
} as const;

export type ClaimStatusCategoryCode = keyof typeof CLAIM_STATUS_CATEGORY;
