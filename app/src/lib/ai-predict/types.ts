// AI Predict Types - Epic 40: AI Predictive Analytics Agent

import { RiskType, TrendDirection, PredictionType, PredictionStatus } from '@prisma/client';

// ============================================
// CHURN PREDICTION TYPES
// ============================================

export interface ChurnPredictionConfig {
  // Risk level thresholds (0-100)
  criticalThreshold: number;
  highThreshold: number;
  mediumThreshold: number;
  lowThreshold: number;

  // Factor weights (must sum to 1.0)
  factorWeights: {
    visitRecency: number;        // Days since last visit
    visitFrequency: number;      // Change in visit frequency
    noShowRate: number;          // No-show behavior
    cancellationRate: number;    // Cancellation behavior
    engagementScore: number;     // Portal, forms, messages
    outstandingBalance: number;  // Financial factors
    treatmentCompletion: number; // Treatment plan adherence
  };

  // Analysis parameters
  lookbackMonths: number;        // How far back to analyze
  maxInactiveDays: number;       // Days after which patient is considered lapsed
  minDataPoints: number;         // Minimum visits for reliable prediction
}

export interface ChurnRiskFactor {
  name: string;
  weight: number;
  rawValue: number | string;
  normalizedScore: number;  // 0-100
  impact: 'positive' | 'neutral' | 'negative';
  contribution: number;     // Weight * normalized score
  description: string;
  trend?: TrendDirection;
}

export interface ChurnBehavioralSignal {
  signal: string;
  detected: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  detectedAt?: Date;
}

export interface VisitPatternChange {
  previousPeriodVisits: number;
  currentPeriodVisits: number;
  changePercent: number;
  trend: TrendDirection;
  averageDaysBetweenVisits: number;
  expectedNextVisitDate?: Date;
  daysOverdue: number;
}

export interface EngagementScoreDetails {
  overallScore: number;  // 0-100
  components: {
    portalActivity: number;
    formCompletions: number;
    messageResponsiveness: number;
    appointmentAttendance: number;
    paymentTimeliness: number;
  };
  trend: TrendDirection;
  lastEngagementDate?: Date;
}

export interface ChurnPredictionResult {
  patientId: string;
  patientName: string;

  // Core prediction
  churnProbability: number;     // 0-100
  confidenceScore: number;      // 0-1
  riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'minimal';

  // Detailed analysis
  riskFactors: ChurnRiskFactor[];
  topRiskFactors: string[];     // Top 3 contributing factors
  behavioralSignals: ChurnBehavioralSignal[];
  visitPatternChange: VisitPatternChange;
  engagementDetails: EngagementScoreDetails;

  // Recommendations
  retentionActions: RetentionAction[];
  priorityScore: number;        // For ranking patients to contact

  // Tracking
  predictionDate: Date;
  validUntil: Date;
  modelVersion: string;
}

export interface RetentionAction {
  action: string;
  description: string;
  priority: 'immediate' | 'soon' | 'scheduled';
  expectedImpact: 'high' | 'medium' | 'low';
  suggestedBy: string;          // Which factor triggered this
  automatable: boolean;
}

// ============================================
// PREDICTION ACCURACY TRACKING
// ============================================

export interface PredictionAccuracyMetrics {
  predictionType: PredictionType;
  totalPredictions: number;
  validatedPredictions: number;
  accuratePredictions: number;

  // Metrics
  accuracy: number;              // % correct
  precision: number;             // True positives / (True + False positives)
  recall: number;                // True positives / (True + False negatives)
  f1Score: number;               // Harmonic mean of precision and recall

  // By risk level
  byRiskLevel: {
    level: string;
    predictions: number;
    accuracy: number;
  }[];

  // Time-based
  last7Days: { predictions: number; accuracy: number };
  last30Days: { predictions: number; accuracy: number };
  last90Days: { predictions: number; accuracy: number };
}

// ============================================
// PATIENT RISK SCORE TYPES
// ============================================

export interface PatientRiskScoreInput {
  patientId: string;
  riskType: RiskType;
  recalculate?: boolean;
}

export interface PatientRiskScoreResult {
  patientId: string;
  patientName: string;
  riskType: RiskType;

  score: number;                 // 0-100
  scoreLevel: 'critical' | 'high' | 'medium' | 'low' | 'minimal';
  confidence: number;            // 0-1

  factors: ChurnRiskFactor[];
  topFactors: string[];

  // Trends
  previousScore?: number;
  scoreChange?: number;
  scoreTrend?: TrendDirection;

  // Alerts
  alertThreshold: number;
  isAboveThreshold: boolean;
  shouldAlert: boolean;

  // Recommendations
  interventionRecommended: string;

  calculatedAt: Date;
  expiresAt: Date;
}

// ============================================
// BATCH OPERATION TYPES
// ============================================

export interface BatchChurnPredictionOptions {
  organizationId: string;
  minRiskLevel?: 'critical' | 'high' | 'medium' | 'low';
  limit?: number;
  includeInactive?: boolean;
  recalculateAll?: boolean;
}

export interface BatchChurnPredictionResult {
  processedCount: number;
  savedCount: number;
  errorCount: number;
  byRiskLevel: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    minimal: number;
  };
  processingTimeMs: number;
  topAtRiskPatients: ChurnPredictionResult[];
}
