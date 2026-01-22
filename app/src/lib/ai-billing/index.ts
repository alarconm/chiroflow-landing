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
export { DenialAnalyzer } from './denial-analyzer';
export { AutomatedAppealGenerator } from './automated-appeal-generator';
export { ClaimFollowUpAgent } from './claim-follow-up-agent';
export { SmartPaymentPoster } from './smart-payment-poster';
export { BillingOptimizationAdvisor } from './billing-optimization-advisor';

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

// Denial Analyzer types (Epic 31: US-309)
export type {
  DenialCategory,
  DenialWorkflow,
  DenialAnalysisInput,
  DenialAnalysisOutput,
  CorrectionAction,
  AppealRecommendation,
  RelatedDenial,
  ProviderDenialTrend,
  RiskFactor as DenialRiskFactor,
  DenialPatternAnalysis,
} from './denial-analyzer';

// Automated Appeal Generator types (Epic 31: US-310)
export type {
  AppealType,
  AutomatedAppealInput,
  AutomatedAppealOutput,
  AppealAttachment,
  AppealSuccessMetrics,
  PayerAppealTemplate,
  LearnedAppealPattern,
} from './automated-appeal-generator';

// Claim Follow-Up Agent types (Epic 31: US-311)
export type {
  FollowUpAction,
  FollowUpPriority,
  FollowUpTaskStatus,
  FollowUpInput,
  FollowUpOutput,
  BatchFollowUpInput,
  BatchFollowUpOutput,
  StalledClaimCriteria,
  StalledClaim,
  FollowUpTask,
  ARAgingReport,
  ARAgingBucket,
  PayerARSummary,
  PayerResponseAnalysis,
  EscalationCriteria,
  EscalatedClaim,
} from './claim-follow-up-agent';

// Smart Payment Poster types (Epic 31: US-312)
export type {
  PostingStatus,
  DiscrepancyType,
  AdjustmentFlag,
  ERAProcessInput,
  ERAProcessOutput,
  LinePostingResult,
  PostingDiscrepancy,
  PaymentMatchInput as SmartPaymentMatchInput,
  PaymentMatchOutput as SmartPaymentMatchOutput,
  MatchCandidate,
  PartialPaymentResult,
  AdjustmentAnalysis,
  AdjustmentCodeDetail,
  SecondaryClaimResult,
  PatientBalanceUpdate,
  PostingMetrics,
} from './smart-payment-poster';

// Billing Optimization Advisor types (Epic 31: US-313)
export type {
  OptimizationType,
  OptimizationPriority,
  OptimizationStatus,
  OptimizationRecommendation,
  SuggestedAction,
  OptimizationEvidence,
  DataPoint,
  ComparisonData,
  TrendData,
  BenchmarkData,
  GetRecommendationsInput,
  GetRecommendationsOutput,
  OptimizationSummary,
  UndercodingOpportunity,
  ModifierOpportunity,
  DocumentationGap,
  PayerMixAnalysis,
  PayerMixItem,
  FeeScheduleAnalysis,
  FeeCodeAnalysis,
  FeeOptimization,
  ContractInsight,
  ContractCodeAnalysis,
  RevenueLeakage,
  LeakageCategory,
  LeakageItem,
} from './billing-optimization-advisor';
