/**
 * Epic 09: AI Billing Agent - Service Library Index
 *
 * Exports all AI billing services and types for use throughout the application.
 */

// Type exports
export * from './types';

// Service class exports
export { ClaimScrubber } from './claim-scrubber';
export { DenialPredictor } from './denial-predictor';
export { AppealGenerator } from './appeal-generator';
export { PaymentMatcher } from './payment-matcher';
export { UnderpaymentDetector } from './underpayment-detector';
export { ClaimSubmitter } from './claim-submitter';

// Convenience type re-exports for common usage
export type {
  ClaimScrubInput,
  ClaimScrubOutput,
  ClaimScrubIssueInput,
  DenialPredictionInput,
  DenialPredictionOutput,
  RiskFactor,
  AppealGenerationInput,
  AppealGenerationOutput,
  AppealArgument,
  AppealCitation,
  PaymentMatchInput,
  PaymentMatchOutput,
  PaymentMatchResult,
  MatchCriteria,
  SuggestedAllocation,
  UnderpaymentScanInput,
  UnderpaymentScanOutput,
  UnderpaymentResult,
  ClaimData,
  BatchJobInput,
  BatchJobProgress,
  BatchJobResult,
  AuditLogInput,
} from './types';

// Claim Submitter types (Epic 31: US-308)
export type {
  ClaimSubmissionInput,
  ClaimSubmissionResult,
  ClaimCorrection,
  SubmitClaimsOutput,
  AutoSubmitRule,
  RuleCondition,
  SubmissionStats,
} from './claim-submitter';
