// AI Insights Agent Types - Epic 16
// Types and interfaces for the AI Insights system

import type {
  InsightCategory,
  InsightPriority,
  InsightStatus,
  AnomalyType,
  ChurnRiskLevel,
} from '@prisma/client';

// ============================================
// Anomaly Detection Types
// ============================================

export interface AnomalyDetectionConfig {
  // Statistical thresholds
  zScoreThreshold: number; // Default: 2.0 (95% confidence)
  minDataPoints: number; // Minimum data points needed for detection
  lookbackDays: number; // Days of history to consider

  // Enabled anomaly types
  enabledTypes: AnomalyType[];

  // Sensitivity by metric
  sensitivity: {
    revenue: 'low' | 'medium' | 'high';
    visits: 'low' | 'medium' | 'high';
    payments: 'low' | 'medium' | 'high';
    noShows: 'low' | 'medium' | 'high';
  };
}

export interface DetectedAnomaly {
  type: AnomalyType;
  title: string;
  description: string;
  metric: string;
  expectedValue: number;
  actualValue: number;
  deviationPercent: number;
  zScore: number;
  confidence: number;
  priority: InsightPriority;
  periodStart: Date;
  periodEnd: Date;
  dataSnapshot: Record<string, unknown>;
  recommendation?: string;
}

export interface TimeSeriesDataPoint {
  date: Date;
  value: number;
  label?: string;
}

export interface AnomalyStatistics {
  mean: number;
  stdDev: number;
  median: number;
  min: number;
  max: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  trendStrength: number; // 0-1
}

// ============================================
// Churn Prediction Types
// ============================================

export interface ChurnPredictionConfig {
  // Risk thresholds (percentile-based)
  veryHighRiskThreshold: number; // Default: 80
  highRiskThreshold: number; // Default: 60
  mediumRiskThreshold: number; // Default: 40
  lowRiskThreshold: number; // Default: 20

  // Factor weights (must sum to 1)
  factorWeights: {
    daysSinceLastVisit: number;
    visitFrequencyChange: number;
    missedAppointments: number;
    outstandingBalance: number;
    engagementScore: number;
  };

  // Time thresholds
  maxDaysSinceVisit: number; // Days until considered at risk
  lookbackMonths: number; // Months to analyze for patterns
}

export interface ChurnRiskFactor {
  factor: string;
  weight: number;
  value: number | string;
  impact: 'positive' | 'negative' | 'neutral';
  contribution: number; // Contribution to total score
  description: string;
}

export interface PatientChurnAnalysis {
  patientId: string;
  patientName: string;
  riskScore: number;
  riskLevel: ChurnRiskLevel;
  confidence: number;
  riskFactors: ChurnRiskFactor[];

  // Key metrics
  daysSinceLastVisit: number;
  avgVisitFrequency: number;
  visitFrequencyChange: number;
  totalVisits: number;
  missedAppointments: number;
  cancelledAppointments: number;
  hasUpcomingAppointment: boolean;
  outstandingBalance: number;
  paymentHistory: 'good' | 'fair' | 'poor';

  // Recommendation
  suggestedAction: string;
  priority: InsightPriority;
}

// ============================================
// Revenue Opportunity Types
// ============================================

export interface OpportunityConfig {
  // Minimum value thresholds
  minOpportunityValue: number; // Default: $50

  // Opportunity types to detect
  enabledTypes: OpportunityType[];

  // Service-specific settings
  recallIntervalDays: number; // Default: 180 (6 months)
  missedServiceLookbackDays: number; // Default: 90
}

export type OpportunityType =
  | 'underbilled_service'
  | 'missed_modifier'
  | 'recall_due'
  | 'treatment_plan_incomplete'
  | 'reactivation_candidate'
  | 'upsell_opportunity'
  | 'insurance_benefit_unused'
  | 'cash_patient_conversion';

export interface RevenueOpportunityAnalysis {
  opportunityType: OpportunityType;
  title: string;
  description: string;
  estimatedValue: number;
  confidence: number;

  // Context
  entityType: 'Patient' | 'Service' | 'Payer' | 'Provider';
  entityId: string;
  entityName?: string;
  serviceCode?: string;
  payerName?: string;

  // Action
  suggestedAction: string;
  actionSteps?: string[];
  expiresAt?: Date;
}

// ============================================
// Natural Language Query Types
// ============================================

export type QueryIntent =
  | 'revenue_query'
  | 'visit_query'
  | 'patient_query'
  | 'provider_query'
  | 'payment_query'
  | 'claim_query'
  | 'trend_query'
  | 'comparison_query'
  | 'forecast_query'
  | 'unknown';

export interface ParsedQuery {
  originalQuery: string;
  intent: QueryIntent;
  entities: ParsedEntity[];
  timeRange?: {
    start: Date;
    end: Date;
    preset?: string;
  };
  aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max';
  groupBy?: string[];
  filters?: ParsedFilter[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}

export interface ParsedEntity {
  type: 'metric' | 'dimension' | 'value' | 'date' | 'provider' | 'patient' | 'payer';
  value: string;
  originalText: string;
  confidence: number;
}

export interface ParsedFilter {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'between';
  value: unknown;
  value2?: unknown;
}

export interface QueryResponse {
  query: string;
  intent: QueryIntent;
  responseType: 'number' | 'chart' | 'table' | 'text' | 'comparison';
  data: unknown;
  explanation: string;
  suggestedFollowUps?: string[];
  executionTimeMs: number;
}

// ============================================
// Recommendation Engine Types
// ============================================

export type RecommendationType =
  | 'improve_collections'
  | 'reduce_no_shows'
  | 'increase_revenue'
  | 'improve_retention'
  | 'optimize_scheduling'
  | 'billing_opportunity'
  | 'patient_engagement'
  | 'operational_efficiency';

export interface Recommendation {
  id: string;
  type: RecommendationType;
  title: string;
  description: string;
  impact: string;
  priority: InsightPriority;
  confidence: number;

  // Action details
  actionSteps: string[];
  estimatedEffort: 'low' | 'medium' | 'high';
  estimatedImpact: number; // Dollar value or percentage

  // Supporting data
  supportingMetrics: {
    metricName: string;
    currentValue: number;
    targetValue?: number;
    benchmarkValue?: number;
  }[];

  // Context
  relatedInsights?: string[]; // IDs of related insights
  expiresAt?: Date;
}

// ============================================
// Benchmark Comparison Types
// ============================================

export interface BenchmarkComparison {
  metricName: string;
  practiceValue: number;
  industryMedian: number;
  industryPercentile25: number;
  industryPercentile75: number;
  industryPercentile90: number;

  // Position
  percentileRank: number; // Where practice falls (0-100)
  performance: 'below' | 'at' | 'above';
  gap: number; // Difference from median
  gapPercent: number;

  // Trend
  trendDirection: 'improving' | 'declining' | 'stable';

  // Recommendation
  recommendation?: string;
}

// ============================================
// Insight Summary Types
// ============================================

export interface InsightsSummary {
  total: number;
  byCategory: Record<InsightCategory, number>;
  byPriority: Record<InsightPriority, number>;
  byStatus: Record<InsightStatus, number>;

  // Key metrics
  newInsightsToday: number;
  actionedThisWeek: number;
  dismissedThisWeek: number;
  avgConfidence: number;

  // Top items
  topAnomalies: DetectedAnomaly[];
  topOpportunities: RevenueOpportunityAnalysis[];
  highRiskPatients: PatientChurnAnalysis[];
  topRecommendations: Recommendation[];
}

// ============================================
// Dashboard Widget Types
// ============================================

export interface InsightWidgetData {
  widgetType: 'anomaly_alerts' | 'churn_risk' | 'opportunities' | 'nl_query' | 'recommendations' | 'benchmarks';
  data: unknown;
  lastUpdated: Date;
  refreshIntervalMs?: number;
}

export interface AnomalyAlertWidget {
  alerts: DetectedAnomaly[];
  totalCount: number;
  criticalCount: number;
  highCount: number;
}

export interface ChurnRiskWidget {
  patients: PatientChurnAnalysis[];
  totalAtRisk: number;
  highRiskCount: number;
  totalPotentialLoss: number;
}

export interface OpportunitiesWidget {
  opportunities: RevenueOpportunityAnalysis[];
  totalOpportunities: number;
  totalEstimatedValue: number;
  capturedThisMonth: number;
}

export interface BenchmarkWidget {
  comparisons: BenchmarkComparison[];
  overallPerformance: 'below' | 'at' | 'above';
  areasToImprove: string[];
  strengths: string[];
}
