/**
 * AI Scheduling Agent
 * Epic 13: AI-powered scheduling optimization for ChiroFlow
 *
 * This module provides intelligent scheduling features including:
 * - No-show prediction based on patient history and patterns
 * - Smart overbooking recommendations
 * - Schedule gap detection and fill suggestions
 * - Provider utilization tracking and optimization
 * - Optimal appointment slot recommendations
 * - Automated recall sequences for patient re-engagement
 */

// Types
export type {
  NoShowFactors,
  NoShowPredictionResult,
  PatientNoShowHistory,
  OverbookingCandidate,
  OverbookingDecision,
  ScheduleGap,
  GapFillSuggestion,
  UtilizationMetrics,
  UtilizationTrend,
  OptimalSlot,
  SchedulingPreferences,
  OptimalScheduleRequest,
  RecallSequenceConfig,
  RecallStepConfig,
  RecallCandidate,
  RecallExecutionResult,
  SchedulingInsight,
  DailyScheduleAnalysis,
  MLModelConfig,
  PredictionInput,
  BatchPredictionResult,
} from './types';

// No-Show Prediction
export {
  getPatientNoShowHistory,
  predictNoShow,
  batchPredictNoShows,
  storePrediction,
  recordOutcome,
  getHighRiskAppointments,
  refreshUpcomingPredictions,
} from './no-show-predictor';

// Overbooking Engine
export {
  generateOverbookingRecommendations,
  storeOverbookingRecommendations,
  getPendingRecommendations,
  applyOverbookingDecision,
  recordOverbooking,
  expireOldRecommendations,
} from './overbooking-engine';

// Gap Analyzer
export {
  detectScheduleGaps,
  storeScheduleGaps,
  getOpenGaps,
  storeSuggestion,
  markGapFilled,
  generateGapInsights,
} from './gap-analyzer';

// Utilization Tracker
export {
  calculateDailyUtilization,
  storeUtilizationMetrics,
  getUtilizationTrend,
  getOrganizationUtilization,
  refreshUtilizationData,
} from './utilization-tracker';

// Scheduling Optimizer
export {
  findOptimalSlots,
  getTodaySuggestions,
  suggestScheduleImprovements,
} from './scheduling-optimizer';

// Recall Automation
export {
  createRecallSequence,
  updateRecallSequence,
  getRecallSequences,
  findRecallCandidates,
  enrollPatient,
  batchEnrollPatients,
  getPendingRecallSteps,
  recordStepExecution,
  handlePatientResponse,
  getRecallStatistics,
  generateRecallInsights,
} from './recall-automation';

// Mock ML utilities (for development)
export {
  predictNoShow as mockPredictNoShow,
  batchPredictNoShow as mockBatchPredictNoShow,
  calculateCombinedNoShowProbability,
  generateMockPatientHistory,
  getRiskLevel,
  MODEL_CONFIG,
} from './mock-ml';
