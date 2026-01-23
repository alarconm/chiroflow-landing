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

// ============================================
// DEMAND FORECASTING TYPES
// ============================================

export type ForecastGranularity = 'hourly' | 'daily' | 'weekly' | 'monthly';

export interface DemandForecastConfig {
  // Analysis parameters
  lookbackWeeks: number;           // How many weeks of historical data to use
  forecastHorizonDays: number;     // How many days ahead to forecast
  minDataPoints: number;           // Minimum appointments for reliable forecast

  // Seasonality
  includeSeasonalFactors: boolean;
  includeDayOfWeekFactors: boolean;
  includeHolidayFactors: boolean;

  // Confidence intervals
  confidenceLevel: number;         // 0.95 for 95% confidence intervals
}

export interface SeasonalPattern {
  pattern: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  strength: number;                // 0-1, how strong the pattern is
  peakPeriods: string[];           // e.g., ["Monday", "Wednesday"] or ["January", "September"]
  troughPeriods: string[];         // e.g., ["Friday"] or ["July", "December"]
  description: string;
}

export interface DayOfWeekFactor {
  dayOfWeek: number;               // 0=Sunday, 6=Saturday
  dayName: string;
  factor: number;                  // Multiplier relative to average (1.0 = average)
  averageVolume: number;
  description: string;
}

export interface HolidayImpact {
  holiday: string;
  date: Date;
  impactFactor: number;            // 0.5 = 50% reduction, 1.5 = 50% increase
  daysBeforeAffected: number;      // Days before holiday with impact
  daysAfterAffected: number;       // Days after holiday with impact
  description: string;
}

export interface ForecastConfidenceInterval {
  min: number;
  max: number;
  p25: number;                     // 25th percentile
  p50: number;                     // Median
  p75: number;                     // 75th percentile
}

export interface DailyForecast {
  date: Date;
  dayOfWeek: number;
  dayName: string;
  predictedVolume: number;
  confidenceInterval: ForecastConfidenceInterval;
  confidence: number;              // 0-1

  // Factors applied
  seasonalFactor: number;
  dayOfWeekFactor: number;
  holidayImpact: number | null;
  holidayName: string | null;

  // Is this a special day?
  isWeekend: boolean;
  isHoliday: boolean;

  // Comparison
  sameWeekdayAverage: number;
  varianceFromAverage: number;
}

export interface WeeklyForecast {
  weekStartDate: Date;
  weekEndDate: Date;
  weekNumber: number;
  year: number;

  predictedVolume: number;
  confidenceInterval: ForecastConfidenceInterval;
  confidence: number;

  dailyForecasts: DailyForecast[];

  // Weekly patterns
  peakDay: string;
  lowestDay: string;
}

export interface MonthlyForecast {
  month: number;                   // 1-12
  year: number;
  monthName: string;

  predictedVolume: number;
  confidenceInterval: ForecastConfidenceInterval;
  confidence: number;

  weeklyForecasts: WeeklyForecast[];

  // Monthly patterns
  seasonalFactor: number;
  trend: TrendDirection;
}

export interface AppointmentTypeForecast {
  appointmentTypeId: string;
  appointmentTypeName: string;
  appointmentTypeCode: string | null;

  predictedVolume: number;
  confidenceInterval: ForecastConfidenceInterval;
  confidence: number;

  // Share of total
  percentOfTotal: number;

  // Trend
  trend: TrendDirection;
  changeFromPrevious: number;
}

export interface ProviderForecast {
  providerId: string;
  providerName: string;

  predictedVolume: number;
  confidenceInterval: ForecastConfidenceInterval;
  confidence: number;

  // Capacity
  estimatedCapacity: number;       // Based on available hours
  utilizationRate: number;         // Predicted volume / capacity

  // By appointment type
  byAppointmentType: AppointmentTypeForecast[];
}

export interface StaffingRecommendation {
  date: Date;
  dayOfWeek: number;

  // Volume forecast
  predictedVolume: number;
  peakHour: number;                // 0-23
  peakHourVolume: number;

  // Staffing
  recommendedProviders: number;
  recommendedStaff: number;        // Front desk, support
  recommendedRooms: number;

  // Alerts
  isOverCapacity: boolean;
  capacityWarning: string | null;

  // Historical comparison
  sameWeekdayStaffAverage: number;
}

export interface CapacityPlanningInsight {
  type: 'understaffed' | 'overstaffed' | 'optimal' | 'bottleneck';
  severity: 'low' | 'medium' | 'high';

  description: string;
  recommendation: string;

  affectedDates: Date[];
  affectedProviders: string[];

  potentialImpact: string;         // e.g., "May result in 15% longer wait times"
  actionRequired: boolean;
}

export interface EventImpactModel {
  eventType: 'holiday' | 'weather' | 'local_event' | 'marketing_campaign' | 'seasonal';
  eventName: string;
  startDate: Date;
  endDate: Date;

  impactFactor: number;            // Multiplier on normal volume
  confidence: number;

  description: string;
  historicalBasis: string | null;  // What historical data supports this
}

export interface DemandForecastResult {
  organizationId: string;

  // Forecast parameters
  forecastStartDate: Date;
  forecastEndDate: Date;
  granularity: ForecastGranularity;

  // Summary
  totalPredictedVolume: number;
  averageDailyVolume: number;
  confidence: number;

  // Detailed forecasts
  dailyForecasts: DailyForecast[];
  weeklyForecasts: WeeklyForecast[];
  monthlyForecasts: MonthlyForecast[];

  // By segment
  byAppointmentType: AppointmentTypeForecast[];
  byProvider: ProviderForecast[];

  // Patterns detected
  seasonalPatterns: SeasonalPattern[];
  dayOfWeekFactors: DayOfWeekFactor[];
  holidayImpacts: HolidayImpact[];
  eventImpacts: EventImpactModel[];

  // Staffing recommendations
  staffingRecommendations: StaffingRecommendation[];
  capacityInsights: CapacityPlanningInsight[];

  // Model info
  modelVersion: string;
  dataPointsUsed: number;
  forecastGeneratedAt: Date;
  validUntil: Date;
}

export interface ForecastAccuracyMetrics {
  forecastDate: Date;
  granularity: ForecastGranularity;

  // Predictions vs actuals
  predictedVolume: number;
  actualVolume: number;
  variance: number;
  variancePercent: number;

  // Accuracy metrics
  mape: number;                    // Mean Absolute Percentage Error
  rmse: number;                    // Root Mean Square Error
  withinConfidenceInterval: boolean;

  // By segment accuracy
  byAppointmentTypeAccuracy: {
    appointmentType: string;
    predicted: number;
    actual: number;
    variancePercent: number;
  }[];

  byProviderAccuracy: {
    providerId: string;
    predicted: number;
    actual: number;
    variancePercent: number;
  }[];
}

// ============================================
// NO-SHOW PREDICTION TYPES
// ============================================

export interface NoShowPredictionConfig {
  // Risk level thresholds (0-100)
  criticalThreshold: number;      // Above this = critical risk
  highThreshold: number;          // Above this = high risk
  mediumThreshold: number;        // Above this = medium risk
  lowThreshold: number;           // Above this = low risk

  // Factor weights (must sum to 1.0)
  factorWeights: {
    historicalNoShowRate: number;   // Patient's no-show history
    daysSinceLastVisit: number;     // Recency impacts attendance
    appointmentLeadTime: number;    // How far in advance booked
    appointmentTimeOfDay: number;   // Morning vs afternoon vs evening
    dayOfWeek: number;              // Monday vs Friday patterns
    appointmentType: number;        // New patient vs follow-up
    weatherForecast: number;        // Bad weather = more no-shows
    patientAge: number;             // Age-related patterns
    outstandingBalance: number;     // Financial barriers
    confirmationStatus: number;     // Confirmed vs unconfirmed
  };

  // Analysis parameters
  lookbackMonths: number;           // Historical data window
  minAppointments: number;          // Min appointments for reliable prediction
  overbookingThreshold: number;     // No-show % to trigger overbooking
}

export interface NoShowRiskFactor {
  name: string;
  weight: number;
  rawValue: number | string;
  normalizedScore: number;        // 0-100 (higher = more risk)
  impact: 'increases_risk' | 'neutral' | 'decreases_risk';
  contribution: number;           // Weight * normalized score
  description: string;
}

export interface ExternalFactor {
  factor: 'weather' | 'holiday' | 'local_event' | 'season';
  name: string;
  impactScore: number;            // How much this increases no-show risk (0-100)
  confidence: number;             // How confident we are in this factor
  description: string;
  dataSource?: string;
}

export interface AppointmentCharacteristics {
  appointmentId: string;
  appointmentType: string;
  appointmentTypeId: string;
  scheduledDateTime: Date;
  dayOfWeek: number;
  dayName: string;
  timeOfDay: 'morning' | 'midday' | 'afternoon' | 'evening';
  hour: number;
  leadTimeDays: number;           // Days between booking and appointment
  providerId: string;
  providerName: string;
  isNewPatient: boolean;
  isFirstAppointment: boolean;
  duration: number;               // Minutes
}

export interface PatientNoShowHistory {
  totalAppointments: number;
  completedAppointments: number;
  noShowAppointments: number;
  cancelledAppointments: number;
  noShowRate: number;             // Percentage
  recentNoShowRate: number;       // Last 6 months
  lastNoShowDate?: Date;
  daysSinceLastNoShow?: number;
  streakType: 'attendance' | 'no_shows' | 'mixed';
  currentStreak: number;          // Consecutive attended or no-showed
  averageLeadTime: number;        // Days patient typically books ahead
  preferredTimeOfDay: 'morning' | 'midday' | 'afternoon' | 'evening' | null;
}

export interface NoShowIntervention {
  intervention: string;
  description: string;
  timing: 'immediate' | 'day_before' | 'week_before' | 'at_booking';
  channel: 'sms' | 'email' | 'phone' | 'automated' | 'multiple';
  expectedImpact: 'high' | 'medium' | 'low';
  priority: number;               // 1 = highest
  automatable: boolean;
}

export interface OverbookingSuggestion {
  recommendedOverbook: boolean;
  overbookSlots: number;          // How many extra appointments to book
  confidence: number;             // 0-1
  expectedNoShows: number;        // How many no-shows predicted for the time slot
  timeSlot: string;               // e.g., "Monday 9am-10am"
  riskLevel: 'safe' | 'moderate' | 'risky';
  reasoning: string;
}

export interface ConfirmationStrategy {
  recommendedReminders: number;   // How many reminders to send
  reminderTiming: string[];       // e.g., ["7 days", "2 days", "1 day", "2 hours"]
  reminderChannels: ('sms' | 'email' | 'phone')[];
  requireConfirmation: boolean;
  confirmationDeadline?: number;  // Hours before appointment
  escalateIfNoConfirmation: boolean;
  personalizedMessage: boolean;
  includeReschedulingOption: boolean;
}

export interface NoShowPredictionResult {
  appointmentId: string;
  patientId: string;
  patientName: string;

  // Core prediction
  noShowProbability: number;      // 0-100
  confidenceScore: number;        // 0-1
  riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'minimal';

  // Detailed analysis
  riskFactors: NoShowRiskFactor[];
  topRiskFactors: string[];       // Top 3 contributing factors
  patientHistory: PatientNoShowHistory;
  appointmentDetails: AppointmentCharacteristics;
  externalFactors: ExternalFactor[];

  // Recommendations
  interventions: NoShowIntervention[];
  overbookingSuggestion: OverbookingSuggestion;
  confirmationStrategy: ConfirmationStrategy;

  // Tracking
  predictionDate: Date;
  validUntil: Date;
  modelVersion: string;
}

export interface BatchNoShowPredictionOptions {
  organizationId: string;
  startDate?: Date;               // Filter appointments from this date
  endDate?: Date;                 // Filter appointments until this date
  providerId?: string;            // Filter by provider
  appointmentTypeId?: string;     // Filter by appointment type
  minRiskLevel?: 'critical' | 'high' | 'medium' | 'low';
  limit?: number;
  saveResults?: boolean;
}

export interface BatchNoShowPredictionResult {
  processedCount: number;
  atRiskCount: number;
  errorCount: number;
  byRiskLevel: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    minimal: number;
  };
  processingTimeMs: number;
  atRiskAppointments: NoShowPredictionResult[];
  overbookingRecommendations: OverbookingSuggestion[];
  aggregateStats: {
    averageNoShowRisk: number;
    expectedNoShows: number;
    expectedAttendance: number;
  };
}

export interface NoShowAccuracyMetrics {
  totalPredictions: number;
  validatedPredictions: number;
  accuratePredictions: number;

  // Classification metrics
  truePositives: number;          // Predicted no-show, actually no-showed
  trueNegatives: number;          // Predicted attend, actually attended
  falsePositives: number;         // Predicted no-show, actually attended
  falseNegatives: number;         // Predicted attend, actually no-showed

  // Accuracy metrics
  accuracy: number;               // Overall accuracy
  precision: number;              // TP / (TP + FP)
  recall: number;                 // TP / (TP + FN)
  f1Score: number;                // Harmonic mean

  // By risk level
  byRiskLevel: {
    level: string;
    predictions: number;
    actualNoShows: number;
    accuracy: number;
  }[];

  // By appointment characteristics
  byDayOfWeek: {
    day: string;
    predictions: number;
    accuracy: number;
  }[];

  byTimeOfDay: {
    timeSlot: string;
    predictions: number;
    accuracy: number;
  }[];
}
