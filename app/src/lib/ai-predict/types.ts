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

// ============================================
// REVENUE FORECASTING TYPES
// ============================================

export type RevenueForecastGranularity = 'daily' | 'weekly' | 'monthly' | 'quarterly';
export type RevenueScenario = 'optimistic' | 'expected' | 'pessimistic';

export interface RevenueForecastConfig {
  // Analysis parameters
  lookbackMonths: number;          // How many months of historical data to use
  forecastHorizonMonths: number;   // How many months ahead to forecast
  minDataPoints: number;           // Minimum transactions for reliable forecast

  // Forecast components
  includeCharges: boolean;         // Include billed charges
  includeCollections: boolean;     // Include collected payments
  includeAR: boolean;              // Include AR recovery predictions
  includeNewPatients: boolean;     // Include new patient revenue impact

  // Confidence intervals
  confidenceLevel: number;         // 0.95 for 95% confidence intervals

  // Scenario modeling
  includeScenarios: boolean;       // Generate optimistic/pessimistic scenarios
}

export interface RevenueConfidenceInterval {
  min: number;
  max: number;
  p25: number;
  p50: number;
  p75: number;
}

export interface CollectionsForecast {
  forecastDate: Date;
  predictedCollections: number;
  confidenceInterval: RevenueConfidenceInterval;
  confidence: number;

  // By source
  fromPatients: number;
  fromInsurance: number;
  fromOther: number;

  // Historical comparison
  sameMonthLastYear: number | null;
  monthOverMonthChange: number | null;
  yearOverYearChange: number | null;
}

export interface ARRecoveryPrediction {
  forecastDate: Date;

  // Current AR status
  totalARBalance: number;
  ar0To30: number;
  ar31To60: number;
  ar61To90: number;
  ar91To120: number;
  arOver120: number;

  // Predicted recoveries
  predictedRecovery30Days: number;
  predictedRecovery60Days: number;
  predictedRecovery90Days: number;

  // Recovery rates by age
  expectedRecoveryRates: {
    bucket: string;
    amount: number;
    recoveryRate: number;
    expectedRecovery: number;
  }[];

  // Write-off predictions
  predictedWriteOffs: number;
  badDebtRisk: number;

  confidence: number;
}

export interface NewPatientRevenueImpact {
  forecastDate: Date;

  // New patient predictions
  predictedNewPatients: number;
  confidenceInterval: { min: number; max: number };

  // Revenue per new patient
  averageFirstVisitRevenue: number;
  averageLifetimeValue: number;
  estimatedRetentionRate: number;

  // Projected revenue
  firstMonthRevenue: number;
  quarterlyRevenue: number;
  annualRevenue: number;

  // By source
  byReferralSource: {
    source: string;
    expectedPatients: number;
    expectedRevenue: number;
  }[];
}

export interface RevenueScenarioModel {
  scenario: RevenueScenario;
  description: string;

  // Assumptions
  assumptions: {
    factor: string;
    assumption: string;
    impact: number;
  }[];

  // Projected revenue
  totalRevenue: number;
  chargesRevenue: number;
  collectionsRevenue: number;
  arRecovery: number;
  newPatientRevenue: number;

  // Compared to expected
  varianceFromExpected: number;
  variancePercent: number;

  // Probability
  probability: number;
}

export interface DailyRevenueForecast {
  date: Date;
  dayOfWeek: number;
  dayName: string;

  predictedRevenue: number;
  predictedCharges: number;
  predictedCollections: number;
  confidenceInterval: RevenueConfidenceInterval;
  confidence: number;

  // Factors
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName: string | null;
  seasonalFactor: number;
  dayOfWeekFactor: number;

  // Comparison
  sameWeekdayAverage: number;
  varianceFromAverage: number;
}

export interface WeeklyRevenueForecast {
  weekStartDate: Date;
  weekEndDate: Date;
  weekNumber: number;
  year: number;

  predictedRevenue: number;
  predictedCharges: number;
  predictedCollections: number;
  confidenceInterval: RevenueConfidenceInterval;
  confidence: number;

  dailyForecasts: DailyRevenueForecast[];

  // Week patterns
  peakDay: string;
  lowestDay: string;
}

export interface MonthlyRevenueForecast {
  month: number;
  year: number;
  monthName: string;

  predictedRevenue: number;
  predictedCharges: number;
  predictedCollections: number;
  arRecovery: number;
  newPatientRevenue: number;

  confidenceInterval: RevenueConfidenceInterval;
  confidence: number;

  // Weekly breakdown
  weeklyForecasts: WeeklyRevenueForecast[];

  // Trends
  trend: TrendDirection;
  monthOverMonthChange: number;
  yearOverYearChange: number | null;
  seasonalFactor: number;
}

export interface RevenueVarianceAnalysis {
  period: string;
  predicted: number;
  actual: number;
  variance: number;
  variancePercent: number;
  withinConfidenceInterval: boolean;

  // Variance breakdown
  varianceByCategory: {
    category: string;
    predicted: number;
    actual: number;
    variance: number;
  }[];

  // Top contributors to variance
  topVarianceDrivers: string[];
}

export interface GoalAttainmentProbability {
  goalType: 'monthly' | 'quarterly' | 'annual';
  goalAmount: number;
  period: string;

  predictedAmount: number;
  gap: number;
  probability: number;

  // Risk factors
  riskFactors: string[];
  opportunities: string[];

  // Actions to improve probability
  suggestedActions: {
    action: string;
    estimatedImpact: number;
    difficulty: 'easy' | 'medium' | 'hard';
  }[];
}

export interface RevenueForecastResult {
  organizationId: string;

  // Forecast parameters
  forecastStartDate: Date;
  forecastEndDate: Date;
  granularity: RevenueForecastGranularity;

  // Summary projections
  totalPredictedRevenue: number;
  totalPredictedCharges: number;
  totalPredictedCollections: number;
  totalARRecovery: number;
  totalNewPatientRevenue: number;
  averageMonthlyRevenue: number;
  confidence: number;

  // Detailed forecasts
  dailyForecasts: DailyRevenueForecast[];
  weeklyForecasts: WeeklyRevenueForecast[];
  monthlyForecasts: MonthlyRevenueForecast[];

  // Component forecasts
  collectionsForecast: CollectionsForecast[];
  arRecoveryPrediction: ARRecoveryPrediction;
  newPatientImpact: NewPatientRevenueImpact;

  // Scenario modeling
  scenarios: RevenueScenarioModel[];
  expectedScenario: RevenueScenarioModel;

  // Confidence intervals
  overallConfidenceInterval: RevenueConfidenceInterval;

  // Variance analysis (if historical data available)
  historicalVariance: RevenueVarianceAnalysis[];

  // Goal attainment
  goalAttainment: GoalAttainmentProbability[];

  // Model info
  modelVersion: string;
  dataPointsUsed: number;
  forecastGeneratedAt: Date;
  validUntil: Date;
}

export interface RevenueForecastAccuracyMetrics {
  period: string;
  granularity: RevenueForecastGranularity;

  // Predictions vs actuals
  predictedRevenue: number;
  actualRevenue: number;
  variance: number;
  variancePercent: number;

  // By component
  chargesAccuracy: { predicted: number; actual: number; variance: number };
  collectionsAccuracy: { predicted: number; actual: number; variance: number };
  arRecoveryAccuracy: { predicted: number; actual: number; variance: number };

  // Metrics
  mape: number;
  rmse: number;
  withinConfidenceInterval: boolean;

  // By scenario
  scenarioAccuracy: {
    scenario: RevenueScenario;
    predictedRevenue: number;
    wasClosest: boolean;
  }[];
}

// ============================================
// TREATMENT OUTCOME PREDICTION TYPES
// ============================================

export type TreatmentResponseLevel = 'excellent' | 'good' | 'moderate' | 'poor' | 'unknown';
export type SymptomDuration = 'acute' | 'subacute' | 'chronic';

export interface TreatmentOutcomePredictionConfig {
  // Model parameters
  confidenceThreshold: number;     // Minimum confidence to make prediction (0-1)
  minSimilarCases: number;         // Minimum similar cases needed for comparison

  // Outcome categories
  excellentThreshold: number;      // Improvement % for excellent (default 80)
  goodThreshold: number;           // Improvement % for good (default 60)
  moderateThreshold: number;       // Improvement % for moderate (default 40)

  // Analysis parameters
  includeComorbidities: boolean;   // Consider comorbidities in prediction
  includeSimilarCases: boolean;    // Analyze similar patient cases
  includeHistoricalOutcomes: boolean; // Include organization's historical data

  // Time horizons
  shortTermWeeks: number;          // Weeks for short-term prediction (default 4)
  mediumTermWeeks: number;         // Weeks for medium-term prediction (default 12)
  longTermWeeks: number;           // Weeks for long-term prediction (default 26)
}

export interface OutcomePredictionFactor {
  name: string;
  category: 'patient' | 'condition' | 'treatment' | 'provider' | 'adherence';
  weight: number;                  // 0-1, importance of this factor
  value: string | number;
  impact: 'positive' | 'negative' | 'neutral';
  contribution: number;            // Contribution to overall prediction
  description: string;
  modifiable: boolean;             // Can this factor be improved?
  improvementSuggestion?: string;  // How to improve if modifiable
}

export interface TreatmentResponsePrediction {
  responseLevel: TreatmentResponseLevel;
  probability: number;             // 0-1 probability of this response level
  timeToResponseWeeks: number;     // Expected weeks to see this response
  description: string;
}

export interface ImprovementTimeline {
  week: number;
  expectedImprovement: number;     // 0-100 expected improvement %
  confidenceInterval: { min: number; max: number };
  milestone: string | null;        // Key milestone expected this week
  isKeyWeek: boolean;              // Is this a significant checkpoint?
}

export interface NonResponseRisk {
  riskScore: number;               // 0-100 risk of non-response
  riskLevel: 'high' | 'medium' | 'low';
  riskFactors: string[];           // Factors contributing to non-response risk
  mitigationStrategies: string[];  // Strategies to reduce risk
  alternativeTreatments: string[]; // Alternative approaches if non-response
}

export interface OptimalTreatmentDuration {
  recommendedVisits: number;
  recommendedWeeks: number;
  confidenceInterval: { minVisits: number; maxVisits: number; minWeeks: number; maxWeeks: number };
  rationale: string;
  diminishingReturnsAt: number;    // Visit number where returns diminish
  frequency: string;               // Recommended frequency (e.g., "2x/week")
  phasedPlan: {
    phase: string;
    visits: number;
    weeks: number;
    frequency: string;
    goals: string[];
  }[];
}

export interface SimilarPatientOutcome {
  caseCount: number;
  averageImprovement: number;
  averageVisits: number;
  averageWeeks: number;
  successRate: number;             // % who achieved good/excellent outcome
  outcomeDistribution: {
    excellent: number;
    good: number;
    moderate: number;
    poor: number;
  };
  keySuccessFactors: string[];     // Common factors in successful cases
  keyFailureFactors: string[];     // Common factors in unsuccessful cases
}

export interface PatientOutcomeComparison {
  patientValue: string | number;
  averageValue: string | number;
  percentile: number;              // Where patient falls in distribution
  interpretation: string;
  isAboveAverage: boolean;
}

export interface OutcomeValidationResult {
  predictionId: string;
  predictedImprovement: number;
  actualImprovement: number;
  variance: number;
  wasAccurate: boolean;
  accuracyScore: number;           // 0-1 how close prediction was
  timeToOutcome: number;           // Weeks until outcome measured
  notes: string | null;
}

export interface TreatmentOutcomePredictionResult {
  // Patient and treatment context
  patientId: string;
  patientName: string;
  treatmentPlanId: string | null;
  conditionCode: string;           // ICD-10
  conditionDescription: string;
  treatmentApproach: string;

  // Core prediction
  predictedOutcome: TreatmentResponseLevel;
  predictedImprovement: number;    // 0-100 expected improvement %
  confidenceScore: number;         // 0-1 confidence in prediction
  confidenceLevel: 'high' | 'medium' | 'low';

  // Response predictions
  responsePredictions: TreatmentResponsePrediction[];

  // Timeline
  expectedTimelineWeeks: number;   // Expected weeks to reach predicted outcome
  improvementTimeline: ImprovementTimeline[];

  // Risk assessment
  nonResponseRisk: NonResponseRisk;
  riskOfChronicity: number;        // 0-100 risk of becoming chronic

  // Treatment duration
  optimalDuration: OptimalTreatmentDuration;

  // Factor analysis
  outcomeFactors: OutcomePredictionFactor[];
  topPositiveFactors: string[];
  topNegativeFactors: string[];
  modifiableFactors: OutcomePredictionFactor[];

  // Similar cases
  similarCasesAnalysis: SimilarPatientOutcome | null;
  patientComparison: {
    age: PatientOutcomeComparison | null;
    symptomDuration: PatientOutcomeComparison | null;
    comorbidityCount: PatientOutcomeComparison | null;
    baseline: PatientOutcomeComparison | null;
  };

  // Patient communication
  patientExplanation: string;      // Plain-language explanation
  expectationPoints: string[];     // Key expectations to set
  homeInstructions: string[];      // Home care recommendations

  // Metadata
  predictionDate: Date;
  validUntil: Date;
  modelVersion: string;
}

export interface BatchOutcomePredictionOptions {
  organizationId: string;
  treatmentPlanIds?: string[];     // Specific plans to analyze
  patientIds?: string[];           // Specific patients to analyze
  conditionCodes?: string[];       // Filter by condition
  minConfidence?: number;          // Minimum confidence threshold
  limit?: number;
  saveResults?: boolean;
}

export interface BatchOutcomePredictionResult {
  processedCount: number;
  savedCount: number;
  errorCount: number;
  byResponseLevel: {
    excellent: number;
    good: number;
    moderate: number;
    poor: number;
    unknown: number;
  };
  averageConfidence: number;
  averagePredictedImprovement: number;
  processingTimeMs: number;
  predictions: TreatmentOutcomePredictionResult[];
}

export interface OutcomePredictionAccuracyMetrics {
  totalPredictions: number;
  validatedPredictions: number;

  // Accuracy metrics
  mape: number;                    // Mean Absolute Percentage Error
  rmse: number;                    // Root Mean Square Error
  correlationCoefficient: number;  // Correlation between predicted and actual

  // By response level
  byResponseLevel: {
    level: TreatmentResponseLevel;
    predictions: number;
    accurate: number;
    accuracy: number;
  }[];

  // By confidence level
  byConfidenceLevel: {
    level: string;
    predictions: number;
    accurate: number;
    accuracy: number;
  }[];

  // By condition
  byCondition: {
    conditionCode: string;
    conditionDescription: string;
    predictions: number;
    averageAccuracy: number;
  }[];

  // Time periods
  last30Days: { predictions: number; accuracy: number };
  last90Days: { predictions: number; accuracy: number };
  overall: { predictions: number; accuracy: number };
}

// ============================================
// TREND DETECTION AND ALERTS TYPES
// ============================================

export type TrendMetricType =
  | 'revenue'
  | 'patient_volume'
  | 'new_patients'
  | 'no_shows'
  | 'cancellations'
  | 'collections'
  | 'ar_balance'
  | 'payer_mix'
  | 'visit_frequency'
  | 'treatment_completion'
  | 'patient_satisfaction'
  | 'custom';

export type AnomalyType = 'spike' | 'drop' | 'pattern_break' | 'shift' | 'outlier';
export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved' | 'dismissed';

export interface TrendDetectionConfig {
  // Analysis parameters
  lookbackDays: number;            // How far back to analyze (default: 90)
  minDataPoints: number;           // Minimum data points required (default: 30)

  // Trend detection
  trendSensitivity: number;        // 0-1, how sensitive to trend changes (default: 0.7)
  significanceThreshold: number;   // Statistical significance threshold (default: 0.05)

  // Anomaly detection
  anomalyThreshold: number;        // Standard deviations for anomaly (default: 2.5)
  anomalySensitivity: number;      // 0-1, how sensitive to anomalies (default: 0.8)

  // Alert configuration
  enableAlerts: boolean;           // Whether to generate alerts
  alertCooldownHours: number;      // Hours between repeat alerts (default: 24)

  // Metric-specific thresholds
  metricThresholds?: {
    [key in TrendMetricType]?: {
      criticalChangePercent: number;   // % change for critical alert
      highChangePercent: number;       // % change for high alert
      mediumChangePercent: number;     // % change for medium alert
      anomalyThreshold: number;        // Custom anomaly threshold
    };
  };
}

export interface TrendDataPoint {
  date: Date;
  value: number;
  isProjected: boolean;
  label?: string;
}

export interface DetectedTrend {
  direction: TrendDirection;
  strength: number;                // 0-1 how strong the trend is
  confidence: number;              // 0-1 statistical confidence
  slope: number;                   // Rate of change per day
  changePercent: number;           // Total percent change over period
  startDate: Date;
  endDate: Date;
  description: string;
  interpretation: string;
  isStatisticallySignificant: boolean;
}

export interface RevenueTrendAnalysis {
  metricType: 'revenue';
  currentPeriodTotal: number;
  previousPeriodTotal: number;
  changePercent: number;
  changeAbsolute: number;
  trend: DetectedTrend;

  // Breakdown
  bySource: {
    source: 'patient_payments' | 'insurance_payments' | 'other';
    current: number;
    previous: number;
    changePercent: number;
    trend: TrendDirection;
  }[];

  // Daily pattern
  dailyAverage: number;
  peakDay: { day: string; amount: number };
  lowestDay: { day: string; amount: number };

  // Seasonality
  seasonalAdjustment: number;
  adjustedChangePercent: number;
}

export interface PatientVolumeTrendAnalysis {
  metricType: 'patient_volume';
  currentPeriodTotal: number;
  previousPeriodTotal: number;
  changePercent: number;
  trend: DetectedTrend;

  // Types of patients
  newPatients: { current: number; previous: number; changePercent: number };
  returningPatients: { current: number; previous: number; changePercent: number };
  reactivatedPatients: { current: number; previous: number; changePercent: number };

  // Visit patterns
  averageVisitsPerPatient: number;
  visitFrequencyTrend: TrendDirection;

  // Comparison
  projectedNextPeriod: number;
  yearOverYearChange: number | null;
}

export interface PayerMixTrendAnalysis {
  metricType: 'payer_mix';
  analysisDate: Date;

  // Current mix
  currentMix: {
    payerType: string;          // 'self_pay', 'commercial', 'medicare', 'medicaid', 'workers_comp', etc.
    payerName: string | null;
    patientCount: number;
    patientPercent: number;
    revenueAmount: number;
    revenuePercent: number;
  }[];

  // Changes
  mixShifts: {
    payerType: string;
    previousPercent: number;
    currentPercent: number;
    shift: number;              // Positive = gaining share
    trend: TrendDirection;
    significance: 'significant' | 'minor' | 'none';
    impact: string;             // Interpretation of impact
  }[];

  // Alerts for concerning shifts
  concerningShifts: string[];
  opportunities: string[];
}

export interface DetectedAnomaly {
  id: string;
  metricType: TrendMetricType;
  anomalyType: AnomalyType;
  severity: AlertSeverity;

  // When and what
  detectedAt: Date;
  dateRange: { start: Date; end: Date };

  // Values
  observedValue: number;
  expectedValue: number;
  deviation: number;             // Standard deviations from expected
  deviationPercent: number;

  // Context
  description: string;
  possibleCauses: string[];
  historicalContext: string;     // Has this happened before?

  // Statistical
  confidence: number;
  anomalyScore: number;          // 0-1 how anomalous
}

export interface EarlyWarningAlert {
  id: string;
  alertType: 'trend_reversal' | 'approaching_threshold' | 'anomaly' | 'pattern_change' | 'forecast_miss';
  severity: AlertSeverity;
  status: AlertStatus;

  // What triggered it
  metricType: TrendMetricType;
  metricSubtype?: string;
  triggerValue: number;
  thresholdValue: number;

  // Details
  title: string;
  description: string;
  detailedExplanation: string;

  // Impact assessment
  potentialImpact: string;
  urgency: 'immediate' | 'soon' | 'monitor';

  // Historical
  previousOccurrences: number;
  lastOccurred?: Date;

  // Actions
  recommendedActions: TrendAction[];

  // Timestamps
  createdAt: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  acknowledgedBy?: string;
  resolvedBy?: string;
  resolutionNotes?: string;
}

export interface TrendExplanation {
  summary: string;               // One-sentence summary
  details: string[];             // Bullet points of detail
  contributingFactors: {
    factor: string;
    impact: 'positive' | 'negative' | 'neutral';
    magnitude: 'high' | 'medium' | 'low';
    description: string;
  }[];
  comparisons: {
    comparison: string;          // e.g., "vs. same period last year"
    difference: number;
    differencePercent: number;
    interpretation: string;
  }[];
  visualizations?: {
    type: 'chart' | 'sparkline' | 'comparison';
    data: unknown;
  }[];
}

export interface TrendAction {
  action: string;
  description: string;
  priority: 'immediate' | 'soon' | 'scheduled';
  expectedImpact: 'high' | 'medium' | 'low';
  effort: 'easy' | 'moderate' | 'complex';
  category: 'operational' | 'marketing' | 'financial' | 'clinical' | 'administrative';
  automatable: boolean;
  suggestedDeadline?: Date;
}

export interface TrendForecast {
  metricType: TrendMetricType;
  forecastDate: Date;
  predictedValue: number;
  confidenceInterval: { min: number; max: number };
  confidence: number;

  // Assumptions
  assumptions: string[];
  riskFactors: string[];

  // Comparison to goal if available
  goalValue?: number;
  onTrackForGoal: boolean;
  gapToGoal?: number;
}

export interface TrendAnalysisResult {
  organizationId: string;
  analysisDate: Date;

  // Time period analyzed
  startDate: Date;
  endDate: Date;
  dataPointCount: number;

  // Requested metric analysis
  metricType: TrendMetricType;
  metricLabel: string;

  // Current values
  currentValue: number;
  previousValue: number;
  changePercent: number;
  changeAbsolute: number;

  // Trend detection
  trend: DetectedTrend;
  trendDataPoints: TrendDataPoint[];

  // Statistical analysis
  statistics: {
    mean: number;
    median: number;
    stdDev: number;
    min: number;
    max: number;
    variance: number;
    percentile25: number;
    percentile75: number;
  };

  // Seasonality
  seasonality: {
    detected: boolean;
    pattern: 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'none';
    strength: number;
    adjustedTrend: TrendDirection;
    adjustedChangePercent: number;
  };

  // Anomalies detected
  anomalies: DetectedAnomaly[];

  // Alerts generated
  alerts: EarlyWarningAlert[];

  // Explanation and actions
  explanation: TrendExplanation;
  recommendedActions: TrendAction[];

  // Forecast
  forecast: TrendForecast[];

  // Model info
  modelVersion: string;
  confidence: number;
  validUntil: Date;
}

export interface BatchTrendAnalysisOptions {
  organizationId: string;
  metricTypes?: TrendMetricType[];    // Which metrics to analyze (default: all)
  lookbackDays?: number;              // Analysis period
  includeForecasts?: boolean;         // Generate forecasts
  includeAlerts?: boolean;            // Generate alerts
  saveResults?: boolean;              // Persist to database
  entityType?: string;                // 'provider', 'location', etc.
  entityId?: string;                  // Specific entity to analyze
}

export interface BatchTrendAnalysisResult {
  organizationId: string;
  analysisDate: Date;

  // Processing summary
  metricsAnalyzed: number;
  alertsGenerated: number;
  anomaliesDetected: number;
  processingTimeMs: number;

  // Individual analyses
  analyses: TrendAnalysisResult[];

  // Aggregated insights
  summaryInsights: {
    positiveMetrics: string[];     // Metrics showing improvement
    negativeMetrics: string[];     // Metrics showing decline
    stableMetrics: string[];       // Metrics relatively stable
    criticalAlerts: number;
    highAlerts: number;
  };

  // Top recommendations
  topRecommendations: TrendAction[];

  // Overall health score
  practiceHealthScore: number;        // 0-100 overall practice health
  practiceHealthTrend: TrendDirection;
}

export interface TrendAlertSummary {
  totalActiveAlerts: number;
  byMetric: {
    metricType: TrendMetricType;
    count: number;
    highestSeverity: AlertSeverity;
  }[];
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  recentAlerts: EarlyWarningAlert[];
  unresolvedAlerts: EarlyWarningAlert[];
  alertTrend: TrendDirection;         // Are alerts increasing or decreasing?
}

export interface TrendComparisonResult {
  metricType: TrendMetricType;

  // Periods being compared
  period1: { start: Date; end: Date; label: string };
  period2: { start: Date; end: Date; label: string };

  // Values
  period1Value: number;
  period2Value: number;
  absoluteChange: number;
  percentChange: number;

  // Context
  interpretation: string;
  isSignificant: boolean;
  significance: number;              // Statistical significance

  // Historical context
  historicalAverage: number;
  vsHistoricalPercent: number;

  // Visualization data
  period1Data: TrendDataPoint[];
  period2Data: TrendDataPoint[];
}

export interface TrendAccuracyMetrics {
  metricType: TrendMetricType;
  totalForecasts: number;
  evaluatedForecasts: number;

  // Accuracy metrics
  mape: number;                      // Mean Absolute Percentage Error
  rmse: number;                      // Root Mean Square Error
  directionalAccuracy: number;       // % times direction was correct

  // By time horizon
  byHorizon: {
    horizon: string;                 // '7d', '30d', '90d'
    forecasts: number;
    accuracy: number;
    avgError: number;
  }[];

  // Alert accuracy
  alertAccuracy: {
    totalAlerts: number;
    truePositives: number;
    falsePositives: number;
    precision: number;
  };
}
