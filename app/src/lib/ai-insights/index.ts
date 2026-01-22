// AI Insights Agent - Epic 16
// Export all AI insights services and types

// Types
export * from './types';

// Anomaly Detection
export {
  detectAnomalies,
  getMetricStatistics,
} from './anomaly-detector';

// Churn Prediction
export {
  analyzePatientChurnRisk,
  analyzeAllPatientsChurnRisk,
  getHighRiskPatientCount,
  saveChurnPredictions,
} from './churn-predictor';

// Revenue Opportunities
export {
  findRevenueOpportunities,
  getOpportunitySummary,
  saveOpportunities,
} from './opportunity-finder';

// Natural Language Queries
export {
  parseQuery,
  executeNLQuery,
  getSuggestedQueries,
  getQueryHistory,
} from './nl-query-engine';

// Recommendations & Benchmarks
export {
  generateRecommendations,
  compareToBenchmarks,
  getRecommendationSummary,
} from './recommendation-engine';
