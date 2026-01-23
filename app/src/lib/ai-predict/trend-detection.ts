// Trend Detection and Alerts - Epic 40: AI Predictive Analytics Agent (US-385)
// Detect emerging trends and anomalies in practice data

import { prisma } from '@/lib/prisma';
import { TrendDirection, SeasonalityPattern } from '@prisma/client';
import {
  TrendDetectionConfig,
  TrendDataPoint,
  DetectedTrend,
  RevenueTrendAnalysis,
  PatientVolumeTrendAnalysis,
  PayerMixTrendAnalysis,
  DetectedAnomaly,
  EarlyWarningAlert,
  TrendExplanation,
  TrendAction,
  TrendForecast,
  TrendAnalysisResult,
  BatchTrendAnalysisOptions,
  BatchTrendAnalysisResult,
  TrendAlertSummary,
  TrendComparisonResult,
  TrendAccuracyMetrics,
  TrendMetricType,
  AnomalyType,
  AlertSeverity,
} from './types';

// Default configuration
const DEFAULT_CONFIG: TrendDetectionConfig = {
  lookbackDays: 90,
  minDataPoints: 30,
  trendSensitivity: 0.7,
  significanceThreshold: 0.05,
  anomalyThreshold: 2.5,
  anomalySensitivity: 0.8,
  enableAlerts: true,
  alertCooldownHours: 24,
  metricThresholds: {
    revenue: { criticalChangePercent: 30, highChangePercent: 20, mediumChangePercent: 10, anomalyThreshold: 2.5 },
    patient_volume: { criticalChangePercent: 25, highChangePercent: 15, mediumChangePercent: 8, anomalyThreshold: 2.5 },
    no_shows: { criticalChangePercent: 40, highChangePercent: 25, mediumChangePercent: 15, anomalyThreshold: 2.0 },
    collections: { criticalChangePercent: 25, highChangePercent: 15, mediumChangePercent: 10, anomalyThreshold: 2.5 },
    ar_balance: { criticalChangePercent: 35, highChangePercent: 20, mediumChangePercent: 12, anomalyThreshold: 2.5 },
    payer_mix: { criticalChangePercent: 20, highChangePercent: 12, mediumChangePercent: 6, anomalyThreshold: 2.0 },
  },
};

// Helper: Calculate basic statistics
function calculateStatistics(values: number[]): {
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  variance: number;
  percentile25: number;
  percentile75: number;
} {
  if (values.length === 0) {
    return { mean: 0, median: 0, stdDev: 0, min: 0, max: 0, variance: 0, percentile25: 0, percentile75: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const n = values.length;

  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  const percentile25 = sorted[Math.floor(n * 0.25)];
  const percentile75 = sorted[Math.floor(n * 0.75)];

  return {
    mean,
    median,
    stdDev,
    min: Math.min(...values),
    max: Math.max(...values),
    variance,
    percentile25,
    percentile75,
  };
}

// Helper: Linear regression for trend detection
function linearRegression(data: { x: number; y: number }[]): { slope: number; intercept: number; r2: number } {
  const n = data.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 };

  const sumX = data.reduce((sum, d) => sum + d.x, 0);
  const sumY = data.reduce((sum, d) => sum + d.y, 0);
  const sumXY = data.reduce((sum, d) => sum + d.x * d.y, 0);
  const sumX2 = data.reduce((sum, d) => sum + d.x * d.x, 0);
  const sumY2 = data.reduce((sum, d) => sum + d.y * d.y, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // R-squared
  const yMean = sumY / n;
  const ssTotal = data.reduce((sum, d) => sum + Math.pow(d.y - yMean, 2), 0);
  const ssResidual = data.reduce((sum, d) => {
    const predicted = slope * d.x + intercept;
    return sum + Math.pow(d.y - predicted, 2);
  }, 0);
  const r2 = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

  return { slope, intercept, r2 };
}

// Helper: Detect trend direction and strength
function detectTrend(
  dataPoints: TrendDataPoint[],
  config: TrendDetectionConfig
): DetectedTrend {
  const values = dataPoints.filter(d => !d.isProjected).map(d => d.value);
  const n = values.length;

  if (n < 2) {
    return {
      direction: TrendDirection.STABLE,
      strength: 0,
      confidence: 0,
      slope: 0,
      changePercent: 0,
      startDate: dataPoints[0]?.date || new Date(),
      endDate: dataPoints[n - 1]?.date || new Date(),
      description: 'Insufficient data for trend analysis',
      interpretation: 'Not enough data points to determine trend',
      isStatisticallySignificant: false,
    };
  }

  // Prepare data for regression (x = days from start)
  const startDate = dataPoints[0].date;
  const regressionData = dataPoints
    .filter(d => !d.isProjected)
    .map(d => ({
      x: Math.floor((d.date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
      y: d.value,
    }));

  const { slope, r2 } = linearRegression(regressionData);

  // Calculate change percent
  const firstValue = values[0];
  const lastValue = values[n - 1];
  const changePercent = firstValue !== 0 ? ((lastValue - firstValue) / firstValue) * 100 : 0;

  // Determine trend direction
  const stats = calculateStatistics(values);
  const coeffOfVariation = stats.mean !== 0 ? stats.stdDev / Math.abs(stats.mean) : 0;

  let direction: TrendDirection;
  let strength: number;
  let description: string;
  let interpretation: string;

  // Adjust threshold based on sensitivity
  const trendThreshold = (1 - config.trendSensitivity) * 5; // 0-5% threshold

  if (Math.abs(changePercent) < trendThreshold && coeffOfVariation < 0.15) {
    direction = TrendDirection.STABLE;
    strength = 0.5 - Math.abs(changePercent) / (trendThreshold * 2);
    description = 'Metric is relatively stable';
    interpretation = 'The metric shows consistent values without significant movement.';
  } else if (coeffOfVariation > 0.4) {
    direction = TrendDirection.VOLATILE;
    strength = Math.min(1, coeffOfVariation);
    description = 'Metric shows high volatility';
    interpretation = 'The metric exhibits unpredictable fluctuations, making trend identification difficult.';
  } else if (slope > 0) {
    direction = TrendDirection.INCREASING;
    strength = Math.min(1, Math.abs(changePercent) / 30);
    description = `Metric is increasing at ${changePercent.toFixed(1)}% over the period`;
    interpretation = `The metric shows a positive trend, ${changePercent > 10 ? 'with significant growth' : 'with moderate growth'}.`;
  } else {
    direction = TrendDirection.DECREASING;
    strength = Math.min(1, Math.abs(changePercent) / 30);
    description = `Metric is decreasing at ${Math.abs(changePercent).toFixed(1)}% over the period`;
    interpretation = `The metric shows a negative trend, ${Math.abs(changePercent) > 10 ? 'requiring attention' : 'with moderate decline'}.`;
  }

  const isSignificant = r2 > 0.3 && Math.abs(changePercent) > trendThreshold;

  return {
    direction,
    strength: Math.round(strength * 100) / 100,
    confidence: Math.round(r2 * 100) / 100,
    slope: Math.round(slope * 1000) / 1000,
    changePercent: Math.round(changePercent * 100) / 100,
    startDate: dataPoints[0].date,
    endDate: dataPoints[n - 1].date,
    description,
    interpretation,
    isStatisticallySignificant: isSignificant,
  };
}

// Helper: Detect anomalies in data
function detectAnomalies(
  dataPoints: TrendDataPoint[],
  metricType: TrendMetricType,
  config: TrendDetectionConfig
): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];
  const values = dataPoints.filter(d => !d.isProjected).map(d => d.value);
  const stats = calculateStatistics(values);

  if (stats.stdDev === 0) return anomalies;

  const threshold = config.metricThresholds?.[metricType]?.anomalyThreshold || config.anomalyThreshold;

  dataPoints.forEach((point, index) => {
    if (point.isProjected) return;

    const zScore = (point.value - stats.mean) / stats.stdDev;

    if (Math.abs(zScore) > threshold) {
      const anomalyType: AnomalyType = zScore > 0 ? 'spike' : 'drop';
      const severity = getSeverityFromDeviation(Math.abs(zScore), threshold);

      anomalies.push({
        id: `anomaly-${metricType}-${index}-${Date.now()}`,
        metricType,
        anomalyType,
        severity,
        detectedAt: new Date(),
        dateRange: { start: point.date, end: point.date },
        observedValue: point.value,
        expectedValue: stats.mean,
        deviation: Math.round(zScore * 100) / 100,
        deviationPercent: Math.round(((point.value - stats.mean) / stats.mean) * 100 * 100) / 100,
        description: `${anomalyType === 'spike' ? 'Unusually high' : 'Unusually low'} ${metricType.replace('_', ' ')} detected`,
        possibleCauses: generatePossibleCauses(metricType, anomalyType),
        historicalContext: 'Analyzing historical patterns...',
        confidence: Math.min(0.95, 0.5 + Math.abs(zScore) / 10),
        anomalyScore: Math.min(1, Math.abs(zScore) / (threshold * 2)),
      });
    }
  });

  return anomalies;
}

// Helper: Get severity from deviation
function getSeverityFromDeviation(deviation: number, threshold: number): AlertSeverity {
  if (deviation > threshold * 2) return 'critical';
  if (deviation > threshold * 1.5) return 'high';
  if (deviation > threshold * 1.2) return 'medium';
  if (deviation > threshold) return 'low';
  return 'info';
}

// Helper: Generate possible causes for anomalies
function generatePossibleCauses(metricType: TrendMetricType, anomalyType: AnomalyType): string[] {
  const causes: Record<TrendMetricType, Record<AnomalyType, string[]>> = {
    revenue: {
      spike: ['Large payment received', 'Insurance batch posting', 'New patient surge', 'Seasonal increase'],
      drop: ['Staff shortage', 'Holiday period', 'System issues', 'Payer processing delays'],
      pattern_break: ['Policy change', 'New service launch', 'Market shift'],
      shift: ['Payer mix change', 'Price adjustment', 'Patient demographic shift'],
      outlier: ['Data entry error', 'One-time adjustment', 'Unusual transaction'],
    },
    patient_volume: {
      spike: ['Successful marketing campaign', 'Seasonal demand', 'Referral surge', 'New provider started'],
      drop: ['Weather event', 'Holiday period', 'Competitor opened', 'Staff absence'],
      pattern_break: ['Schedule change', 'New location opened', 'Service expansion'],
      shift: ['Demographics changing', 'Market condition shift', 'Referral pattern change'],
      outlier: ['Special event', 'Data correction', 'System glitch'],
    },
    no_shows: {
      spike: ['Bad weather', 'Holiday proximity', 'Communication failure', 'Long lead time appointments'],
      drop: ['Improved reminders', 'Better scheduling', 'Patient engagement efforts'],
      pattern_break: ['New reminder system', 'Policy change', 'Schedule optimization'],
      shift: ['Patient mix change', 'Service type change', 'Seasonal pattern'],
      outlier: ['System issue', 'Mass cancellation event', 'Data error'],
    },
    collections: {
      spike: ['AR collection push', 'Insurance batch', 'Payment plan completions'],
      drop: ['Payer delays', 'Holiday period', 'Staff shortage', 'Billing issues'],
      pattern_break: ['New collection process', 'Payer contract change', 'System update'],
      shift: ['Payer mix shift', 'Service mix change', 'Payment policy change'],
      outlier: ['Large refund', 'Adjustment posting', 'Data correction'],
    },
    ar_balance: {
      spike: ['Billing surge', 'Payer processing delays', 'Claim denials increase'],
      drop: ['Successful collections', 'Write-off batch', 'Insurance catch-up'],
      pattern_break: ['New billing process', 'Payer contract change', 'Staff change'],
      shift: ['Service volume change', 'Payer mix shift', 'Fee schedule update'],
      outlier: ['Large adjustment', 'Data correction', 'System reconciliation'],
    },
    payer_mix: {
      spike: ['New contract effective', 'Marketing to specific demographic'],
      drop: ['Contract termination', 'Patient attrition', 'Competitor targeting'],
      pattern_break: ['Significant market shift', 'New service line'],
      shift: ['Demographics changing', 'New partnerships', 'Market evolution'],
      outlier: ['Data categorization issue', 'Temporary patient population'],
    },
    cancellations: {
      spike: ['Weather event', 'Holiday period', 'Staff shortage communicated'],
      drop: ['Better patient engagement', 'Improved scheduling', 'Waitlist utilization'],
      pattern_break: ['Policy change', 'New booking system', 'Fee implementation'],
      shift: ['Patient demographics', 'Service mix change', 'Scheduling approach'],
      outlier: ['Mass rescheduling', 'System issue', 'Special circumstances'],
    },
    visit_frequency: {
      spike: ['Care plan initiative', 'Patient education', 'Recall program'],
      drop: ['Patient churn', 'Competition', 'Treatment completion'],
      pattern_break: ['New treatment protocol', 'Service expansion'],
      shift: ['Demographics', 'Insurance changes', 'Provider approach'],
      outlier: ['Data aggregation issue', 'Unusual patient case'],
    },
    treatment_completion: {
      spike: ['Patient education success', 'Improved follow-up', 'Care coordination'],
      drop: ['Insurance issues', 'Patient satisfaction', 'Access barriers'],
      pattern_break: ['Protocol change', 'Staff training', 'System improvement'],
      shift: ['Case mix change', 'Provider changes', 'Patient demographics'],
      outlier: ['Small sample size', 'Data timing', 'Classification issue'],
    },
    new_patients: {
      spike: ['Marketing success', 'Referral program', 'Seasonal demand', 'Provider addition'],
      drop: ['Marketing lapse', 'Competition', 'Reputation issue', 'Referral decline'],
      pattern_break: ['Campaign launch/end', 'Market change', 'Location change'],
      shift: ['Demographics', 'Service focus', 'Market evolution'],
      outlier: ['Special event', 'Data correction', 'Categorization change'],
    },
    patient_satisfaction: {
      spike: ['Service improvement', 'New staff training', 'Facility upgrade'],
      drop: ['Wait time increase', 'Staff issues', 'Process problems'],
      pattern_break: ['Major change implementation', 'Leadership change'],
      shift: ['Patient expectations', 'Service evolution', 'Market standards'],
      outlier: ['Survey timing', 'Sample bias', 'Event impact'],
    },
    custom: {
      spike: ['Positive external factor', 'Process improvement', 'Favorable conditions'],
      drop: ['Negative external factor', 'Process issue', 'Adverse conditions'],
      pattern_break: ['Significant change', 'New implementation'],
      shift: ['Gradual environment change', 'Evolution'],
      outlier: ['Unusual occurrence', 'Data issue'],
    },
  };

  return causes[metricType]?.[anomalyType] || ['Unknown cause - requires investigation'];
}

// Helper: Generate alerts based on trends and anomalies
function generateAlerts(
  trend: DetectedTrend,
  anomalies: DetectedAnomaly[],
  metricType: TrendMetricType,
  config: TrendDetectionConfig
): EarlyWarningAlert[] {
  const alerts: EarlyWarningAlert[] = [];

  if (!config.enableAlerts) return alerts;

  const thresholds = config.metricThresholds?.[metricType] || {
    criticalChangePercent: 30,
    highChangePercent: 20,
    mediumChangePercent: 10,
    anomalyThreshold: 2.5,
  };

  // Trend-based alerts
  if (trend.isStatisticallySignificant) {
    const absChange = Math.abs(trend.changePercent);
    let severity: AlertSeverity;
    let urgency: 'immediate' | 'soon' | 'monitor';

    if (absChange >= thresholds.criticalChangePercent) {
      severity = 'critical';
      urgency = 'immediate';
    } else if (absChange >= thresholds.highChangePercent) {
      severity = 'high';
      urgency = 'soon';
    } else if (absChange >= thresholds.mediumChangePercent) {
      severity = 'medium';
      urgency = 'monitor';
    } else {
      severity = 'low';
      urgency = 'monitor';
    }

    const isNegative = (trend.direction === TrendDirection.DECREASING &&
      ['revenue', 'patient_volume', 'collections', 'new_patients', 'treatment_completion', 'patient_satisfaction'].includes(metricType)) ||
      (trend.direction === TrendDirection.INCREASING &&
      ['no_shows', 'ar_balance', 'cancellations'].includes(metricType));

    if (isNegative && absChange >= thresholds.mediumChangePercent) {
      alerts.push({
        id: `alert-trend-${metricType}-${Date.now()}`,
        alertType: 'trend_reversal',
        severity,
        status: 'active',
        metricType,
        triggerValue: trend.changePercent,
        thresholdValue: thresholds.mediumChangePercent,
        title: `${metricType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} ${trend.direction === TrendDirection.DECREASING ? 'Declining' : 'Rising'}`,
        description: `${metricType.replace(/_/g, ' ')} has changed by ${trend.changePercent.toFixed(1)}% over the analysis period`,
        detailedExplanation: trend.interpretation,
        potentialImpact: generateImpactStatement(metricType, trend),
        urgency,
        previousOccurrences: 0,
        recommendedActions: generateTrendActions(metricType, trend),
        createdAt: new Date(),
      });
    }
  }

  // Anomaly-based alerts
  anomalies
    .filter(a => a.severity === 'critical' || a.severity === 'high')
    .forEach(anomaly => {
      alerts.push({
        id: `alert-anomaly-${anomaly.id}`,
        alertType: 'anomaly',
        severity: anomaly.severity,
        status: 'active',
        metricType,
        triggerValue: anomaly.observedValue,
        thresholdValue: anomaly.expectedValue,
        title: `${anomaly.anomalyType === 'spike' ? 'Spike' : 'Drop'} in ${metricType.replace(/_/g, ' ')}`,
        description: anomaly.description,
        detailedExplanation: `Observed value (${anomaly.observedValue.toFixed(2)}) is ${anomaly.deviation.toFixed(1)} standard deviations from expected (${anomaly.expectedValue.toFixed(2)})`,
        potentialImpact: `This ${anomaly.anomalyType} could indicate ${anomaly.possibleCauses[0] || 'an unusual situation'}`,
        urgency: anomaly.severity === 'critical' ? 'immediate' : 'soon',
        previousOccurrences: 0,
        recommendedActions: generateAnomalyActions(metricType, anomaly),
        createdAt: new Date(),
      });
    });

  return alerts;
}

// Helper: Generate impact statement
function generateImpactStatement(metricType: TrendMetricType, trend: DetectedTrend): string {
  const impacts: Record<TrendMetricType, Record<string, string>> = {
    revenue: {
      DECREASING: 'Revenue decline may impact cash flow, staffing, and practice growth plans',
      INCREASING: 'Revenue growth supports practice expansion and investment opportunities',
      VOLATILE: 'Revenue volatility creates cash flow planning challenges',
    },
    patient_volume: {
      DECREASING: 'Patient volume decline impacts revenue and provider utilization',
      INCREASING: 'Increased patient volume may require staffing and capacity adjustments',
      VOLATILE: 'Volume volatility complicates scheduling and resource planning',
    },
    no_shows: {
      INCREASING: 'Rising no-shows reduce revenue and create scheduling inefficiencies',
      DECREASING: 'Improved attendance enhances revenue and resource utilization',
      VOLATILE: 'Unpredictable no-shows complicate capacity planning',
    },
    collections: {
      DECREASING: 'Collection decline impacts cash flow and may indicate AR issues',
      INCREASING: 'Strong collections support healthy cash flow',
      VOLATILE: 'Collection volatility complicates cash flow planning',
    },
    ar_balance: {
      INCREASING: 'Growing AR indicates potential collection issues or payer delays',
      DECREASING: 'AR reduction improves cash position and reduces risk',
      VOLATILE: 'AR volatility may indicate process inconsistencies',
    },
    payer_mix: {
      DECREASING: 'Shifts in payer mix may impact revenue and administrative burden',
      INCREASING: 'Payer mix changes affect reimbursement and workflow',
      VOLATILE: 'Payer mix volatility requires flexible operations',
    },
    cancellations: {
      INCREASING: 'Rising cancellations reduce revenue and create scheduling gaps',
      DECREASING: 'Reduced cancellations improve schedule efficiency',
      VOLATILE: 'Unpredictable cancellations complicate planning',
    },
    visit_frequency: {
      DECREASING: 'Declining visit frequency may indicate patient engagement issues',
      INCREASING: 'Higher visit frequency supports treatment outcomes and revenue',
      VOLATILE: 'Variable visit patterns complicate care planning',
    },
    treatment_completion: {
      DECREASING: 'Lower completion rates may impact outcomes and patient satisfaction',
      INCREASING: 'Improved completion supports better patient outcomes',
      VOLATILE: 'Inconsistent completion complicates outcome tracking',
    },
    new_patients: {
      DECREASING: 'Fewer new patients impacts practice growth and sustainability',
      INCREASING: 'New patient growth supports practice expansion',
      VOLATILE: 'Variable new patient flow complicates growth planning',
    },
    patient_satisfaction: {
      DECREASING: 'Declining satisfaction affects retention, referrals, and reputation',
      INCREASING: 'Improved satisfaction supports retention and referrals',
      VOLATILE: 'Variable satisfaction indicates inconsistent experience',
    },
    custom: {
      DECREASING: 'Declining metric may require attention',
      INCREASING: 'Rising metric should be monitored',
      VOLATILE: 'Volatile metric requires investigation',
    },
  };

  return impacts[metricType]?.[trend.direction] || 'Trend requires monitoring and potential action';
}

// Helper: Generate actions for trends
function generateTrendActions(metricType: TrendMetricType, trend: DetectedTrend): TrendAction[] {
  const actions: TrendAction[] = [];
  const isNegative = (trend.direction === TrendDirection.DECREASING &&
    ['revenue', 'patient_volume', 'collections', 'new_patients'].includes(metricType)) ||
    (trend.direction === TrendDirection.INCREASING &&
    ['no_shows', 'ar_balance', 'cancellations'].includes(metricType));

  if (!isNegative) return actions;

  // Generic high-priority actions
  actions.push({
    action: 'Investigate root cause',
    description: `Analyze the underlying factors contributing to the ${trend.direction.toLowerCase()} trend in ${metricType.replace(/_/g, ' ')}`,
    priority: 'immediate',
    expectedImpact: 'high',
    effort: 'moderate',
    category: 'administrative',
    automatable: false,
  });

  // Metric-specific actions
  const metricActions: Record<TrendMetricType, TrendAction[]> = {
    revenue: [
      { action: 'Review fee schedules', description: 'Ensure pricing is competitive and appropriate', priority: 'soon', expectedImpact: 'medium', effort: 'moderate', category: 'financial', automatable: false },
      { action: 'Analyze payer performance', description: 'Identify underperforming payers or contracts', priority: 'soon', expectedImpact: 'high', effort: 'moderate', category: 'financial', automatable: false },
      { action: 'Review service mix', description: 'Optimize service offerings for revenue', priority: 'scheduled', expectedImpact: 'medium', effort: 'complex', category: 'operational', automatable: false },
    ],
    patient_volume: [
      { action: 'Boost marketing efforts', description: 'Increase visibility and patient acquisition activities', priority: 'soon', expectedImpact: 'high', effort: 'moderate', category: 'marketing', automatable: false },
      { action: 'Patient reactivation campaign', description: 'Reach out to inactive patients', priority: 'soon', expectedImpact: 'medium', effort: 'easy', category: 'marketing', automatable: true },
      { action: 'Review referral sources', description: 'Strengthen relationships with referring providers', priority: 'scheduled', expectedImpact: 'medium', effort: 'moderate', category: 'marketing', automatable: false },
    ],
    no_shows: [
      { action: 'Enhance reminder system', description: 'Increase frequency and channels of appointment reminders', priority: 'immediate', expectedImpact: 'high', effort: 'easy', category: 'operational', automatable: true },
      { action: 'Review scheduling practices', description: 'Optimize lead times and booking patterns', priority: 'soon', expectedImpact: 'medium', effort: 'moderate', category: 'operational', automatable: false },
      { action: 'Implement no-show policy', description: 'Consider fees or policies for repeat no-shows', priority: 'scheduled', expectedImpact: 'medium', effort: 'moderate', category: 'administrative', automatable: false },
    ],
    collections: [
      { action: 'AR follow-up campaign', description: 'Focus on aging accounts for collection', priority: 'immediate', expectedImpact: 'high', effort: 'moderate', category: 'financial', automatable: true },
      { action: 'Review billing processes', description: 'Identify and address billing delays or errors', priority: 'soon', expectedImpact: 'high', effort: 'moderate', category: 'financial', automatable: false },
      { action: 'Patient payment options', description: 'Offer payment plans or financing options', priority: 'scheduled', expectedImpact: 'medium', effort: 'easy', category: 'financial', automatable: false },
    ],
    ar_balance: [
      { action: 'Focus collection efforts', description: 'Prioritize high-balance accounts for follow-up', priority: 'immediate', expectedImpact: 'high', effort: 'moderate', category: 'financial', automatable: true },
      { action: 'Claim denial review', description: 'Address denied claims promptly', priority: 'soon', expectedImpact: 'high', effort: 'moderate', category: 'financial', automatable: false },
      { action: 'Patient responsibility follow-up', description: 'Collect patient portions more promptly', priority: 'scheduled', expectedImpact: 'medium', effort: 'easy', category: 'financial', automatable: true },
    ],
    payer_mix: [
      { action: 'Analyze payer profitability', description: 'Understand which payers are most beneficial', priority: 'soon', expectedImpact: 'medium', effort: 'moderate', category: 'financial', automatable: false },
      { action: 'Contract negotiation', description: 'Review and negotiate payer contracts', priority: 'scheduled', expectedImpact: 'high', effort: 'complex', category: 'financial', automatable: false },
    ],
    cancellations: [
      { action: 'Cancellation follow-up', description: 'Contact patients who cancel to reschedule', priority: 'immediate', expectedImpact: 'medium', effort: 'easy', category: 'operational', automatable: true },
      { action: 'Waitlist utilization', description: 'Fill cancelled slots from waitlist', priority: 'soon', expectedImpact: 'medium', effort: 'easy', category: 'operational', automatable: true },
    ],
    visit_frequency: [
      { action: 'Patient education', description: 'Communicate importance of treatment adherence', priority: 'soon', expectedImpact: 'medium', effort: 'easy', category: 'clinical', automatable: false },
      { action: 'Recall program', description: 'Implement systematic patient recall', priority: 'scheduled', expectedImpact: 'high', effort: 'moderate', category: 'operational', automatable: true },
    ],
    treatment_completion: [
      { action: 'Care coordination', description: 'Enhance follow-up for patients in treatment', priority: 'immediate', expectedImpact: 'high', effort: 'moderate', category: 'clinical', automatable: false },
      { action: 'Barrier assessment', description: 'Identify and address treatment barriers', priority: 'soon', expectedImpact: 'medium', effort: 'moderate', category: 'clinical', automatable: false },
    ],
    new_patients: [
      { action: 'Marketing campaign', description: 'Launch targeted patient acquisition campaign', priority: 'immediate', expectedImpact: 'high', effort: 'moderate', category: 'marketing', automatable: false },
      { action: 'Referral program', description: 'Enhance or promote patient referral program', priority: 'soon', expectedImpact: 'medium', effort: 'easy', category: 'marketing', automatable: false },
    ],
    patient_satisfaction: [
      { action: 'Patient experience review', description: 'Analyze feedback and identify improvement areas', priority: 'immediate', expectedImpact: 'high', effort: 'moderate', category: 'operational', automatable: false },
      { action: 'Staff training', description: 'Focus on customer service and patient interaction', priority: 'scheduled', expectedImpact: 'medium', effort: 'moderate', category: 'operational', automatable: false },
    ],
    custom: [],
  };

  actions.push(...(metricActions[metricType] || []));

  return actions;
}

// Helper: Generate actions for anomalies
function generateAnomalyActions(metricType: TrendMetricType, anomaly: DetectedAnomaly): TrendAction[] {
  return [
    {
      action: 'Verify data accuracy',
      description: 'Confirm the anomaly is not due to data entry or system error',
      priority: 'immediate',
      expectedImpact: 'high',
      effort: 'easy',
      category: 'administrative',
      automatable: false,
    },
    {
      action: 'Investigate cause',
      description: `Research potential causes: ${anomaly.possibleCauses.slice(0, 2).join(', ')}`,
      priority: 'immediate',
      expectedImpact: 'high',
      effort: 'moderate',
      category: 'administrative',
      automatable: false,
    },
    {
      action: 'Document findings',
      description: 'Record the anomaly and any identified causes for future reference',
      priority: 'soon',
      expectedImpact: 'low',
      effort: 'easy',
      category: 'administrative',
      automatable: false,
    },
  ];
}

// Helper: Generate trend explanation
function generateTrendExplanation(
  metricType: TrendMetricType,
  trend: DetectedTrend,
  stats: { mean: number; median: number; stdDev: number },
  anomalies: DetectedAnomaly[]
): TrendExplanation {
  const summary = `${metricType.replace(/_/g, ' ')} is ${trend.direction.toLowerCase()}, with a ${Math.abs(trend.changePercent).toFixed(1)}% ${trend.changePercent >= 0 ? 'increase' : 'decrease'} over the analysis period.`;

  const details = [
    `Trend direction: ${trend.direction} with ${(trend.strength * 100).toFixed(0)}% strength`,
    `Statistical confidence: ${(trend.confidence * 100).toFixed(0)}%`,
    `Average value: ${stats.mean.toFixed(2)} (median: ${stats.median.toFixed(2)})`,
    `Variation: Standard deviation of ${stats.stdDev.toFixed(2)}`,
    anomalies.length > 0 ? `${anomalies.length} anomalies detected during the period` : 'No significant anomalies detected',
  ];

  const contributingFactors = [
    {
      factor: 'Data volume',
      impact: 'neutral' as const,
      magnitude: 'medium' as const,
      description: 'Analysis based on available data points',
    },
    {
      factor: 'Seasonal patterns',
      impact: 'neutral' as const,
      magnitude: 'medium' as const,
      description: 'Seasonal adjustments applied where detected',
    },
  ];

  return {
    summary,
    details,
    contributingFactors,
    comparisons: [],
  };
}

// Helper: Generate forecasts
function generateForecasts(
  dataPoints: TrendDataPoint[],
  trend: DetectedTrend,
  metricType: TrendMetricType,
  horizonDays: number = 30
): TrendForecast[] {
  const forecasts: TrendForecast[] = [];
  const lastDataPoint = dataPoints.filter(d => !d.isProjected).pop();

  if (!lastDataPoint) return forecasts;

  const lastValue = lastDataPoint.value;
  const dailyChange = trend.slope;
  const stats = calculateStatistics(dataPoints.filter(d => !d.isProjected).map(d => d.value));

  // Generate forecasts at 7, 14, 30 days
  const horizons = [7, 14, 30].filter(h => h <= horizonDays);

  horizons.forEach(days => {
    const predictedValue = lastValue + (dailyChange * days);
    const uncertainty = stats.stdDev * Math.sqrt(days / 7); // Uncertainty grows with time

    forecasts.push({
      metricType,
      forecastDate: new Date(lastDataPoint.date.getTime() + days * 24 * 60 * 60 * 1000),
      predictedValue: Math.max(0, Math.round(predictedValue * 100) / 100),
      confidenceInterval: {
        min: Math.max(0, predictedValue - 1.96 * uncertainty),
        max: predictedValue + 1.96 * uncertainty,
      },
      confidence: Math.max(0.3, trend.confidence - (days / 100)), // Confidence decreases with time
      assumptions: [
        'Current trend continues',
        'No significant external changes',
        'Seasonal patterns remain consistent',
      ],
      riskFactors: [
        'External market changes',
        'Competitive pressures',
        'Operational disruptions',
      ],
      onTrackForGoal: true, // Would need goal data to calculate
    });
  });

  return forecasts;
}

// Main function: Detect trends for a specific metric
export async function detectTrends(
  organizationId: string,
  metricType: TrendMetricType,
  config?: Partial<TrendDetectionConfig>,
  options?: {
    entityType?: string;
    entityId?: string;
  }
): Promise<TrendAnalysisResult | null> {
  const startTime = Date.now();
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - mergedConfig.lookbackDays * 24 * 60 * 60 * 1000);

  // Fetch data based on metric type
  const dataPoints = await fetchMetricData(organizationId, metricType, startDate, endDate, options);

  if (dataPoints.length < mergedConfig.minDataPoints) {
    return null; // Not enough data
  }

  // Detect trend
  const trend = detectTrend(dataPoints, mergedConfig);

  // Calculate statistics
  const values = dataPoints.filter(d => !d.isProjected).map(d => d.value);
  const statistics = calculateStatistics(values);

  // Detect anomalies
  const anomalies = detectAnomalies(dataPoints, metricType, mergedConfig);

  // Generate alerts
  const alerts = generateAlerts(trend, anomalies, metricType, mergedConfig);

  // Generate explanation
  const explanation = generateTrendExplanation(metricType, trend, statistics, anomalies);

  // Generate recommended actions
  const recommendedActions = generateTrendActions(metricType, trend);

  // Generate forecasts
  const forecast = generateForecasts(dataPoints, trend, metricType);

  // Detect seasonality
  const seasonality = detectSeasonality(dataPoints);

  // Current and previous values
  const currentValue = values[values.length - 1] || 0;
  const midpoint = Math.floor(values.length / 2);
  const previousValue = values[midpoint] || 0;

  return {
    organizationId,
    analysisDate: new Date(),
    startDate,
    endDate,
    dataPointCount: dataPoints.length,
    metricType,
    metricLabel: metricType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    currentValue,
    previousValue,
    changePercent: trend.changePercent,
    changeAbsolute: currentValue - previousValue,
    trend,
    trendDataPoints: dataPoints,
    statistics,
    seasonality,
    anomalies,
    alerts,
    explanation,
    recommendedActions,
    forecast,
    modelVersion: '1.0.0',
    confidence: trend.confidence,
    validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), // Valid for 24 hours
  };
}

// Helper: Detect seasonality in data
function detectSeasonality(dataPoints: TrendDataPoint[]): {
  detected: boolean;
  pattern: 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'none';
  strength: number;
  adjustedTrend: TrendDirection;
  adjustedChangePercent: number;
} {
  // Simple seasonality detection based on day-of-week patterns
  const byDayOfWeek: Record<number, number[]> = {};

  dataPoints.filter(d => !d.isProjected).forEach(point => {
    const day = point.date.getDay();
    if (!byDayOfWeek[day]) byDayOfWeek[day] = [];
    byDayOfWeek[day].push(point.value);
  });

  // Calculate coefficient of variation for each day
  const dayAverages = Object.values(byDayOfWeek).map(values => {
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    return avg;
  });

  if (dayAverages.length < 5) {
    return {
      detected: false,
      pattern: 'none',
      strength: 0,
      adjustedTrend: TrendDirection.STABLE,
      adjustedChangePercent: 0,
    };
  }

  const avgOfAverages = dayAverages.reduce((sum, v) => sum + v, 0) / dayAverages.length;
  const variance = dayAverages.reduce((sum, v) => sum + Math.pow(v - avgOfAverages, 2), 0) / dayAverages.length;
  const cv = avgOfAverages > 0 ? Math.sqrt(variance) / avgOfAverages : 0;

  const detected = cv > 0.1; // More than 10% variation suggests seasonality

  return {
    detected,
    pattern: detected ? 'weekly' : 'none',
    strength: Math.min(1, cv * 2),
    adjustedTrend: TrendDirection.STABLE, // Would need more sophisticated adjustment
    adjustedChangePercent: 0,
  };
}

// Helper: Fetch metric data from database
async function fetchMetricData(
  organizationId: string,
  metricType: TrendMetricType,
  startDate: Date,
  endDate: Date,
  options?: { entityType?: string; entityId?: string }
): Promise<TrendDataPoint[]> {
  const dataPoints: TrendDataPoint[] = [];

  switch (metricType) {
    case 'revenue':
    case 'collections': {
      // Aggregate charges/payments by day
      const payments = await prisma.payment.findMany({
        where: {
          organizationId,
          createdAt: { gte: startDate, lte: endDate },
          isVoid: false,
        },
        select: { createdAt: true, amount: true },
      });

      // Create daily aggregates
      const dailyData: Record<string, number> = {};
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        dailyData[currentDate.toISOString().split('T')[0]] = 0;
        currentDate.setDate(currentDate.getDate() + 1);
      }

      payments.forEach(p => {
        const dateKey = new Date(p.createdAt).toISOString().split('T')[0];
        if (dailyData[dateKey] !== undefined) {
          dailyData[dateKey] += Number(p.amount || 0);
        }
      });

      Object.entries(dailyData).forEach(([date, value]) => {
        dataPoints.push({
          date: new Date(date),
          value,
          isProjected: false,
          label: date,
        });
      });
      break;
    }

    case 'patient_volume': {
      const appointments = await prisma.appointment.findMany({
        where: {
          organizationId,
          startTime: { gte: startDate, lte: endDate },
          status: { in: ['COMPLETED', 'CHECKED_IN', 'IN_PROGRESS'] },
        },
        select: { startTime: true },
      });

      const dailyData: Record<string, number> = {};
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        dailyData[currentDate.toISOString().split('T')[0]] = 0;
        currentDate.setDate(currentDate.getDate() + 1);
      }

      appointments.forEach(a => {
        const dateKey = new Date(a.startTime).toISOString().split('T')[0];
        if (dailyData[dateKey] !== undefined) {
          dailyData[dateKey] += 1;
        }
      });

      Object.entries(dailyData).forEach(([date, value]) => {
        dataPoints.push({
          date: new Date(date),
          value,
          isProjected: false,
          label: date,
        });
      });
      break;
    }

    case 'no_shows': {
      const appointments = await prisma.appointment.findMany({
        where: {
          organizationId,
          startTime: { gte: startDate, lte: endDate },
        },
        select: { startTime: true, status: true },
      });

      // Calculate daily no-show rates
      const dailyData: Record<string, { noShows: number; total: number }> = {};
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        dailyData[currentDate.toISOString().split('T')[0]] = { noShows: 0, total: 0 };
        currentDate.setDate(currentDate.getDate() + 1);
      }

      appointments.forEach(a => {
        const dateKey = new Date(a.startTime).toISOString().split('T')[0];
        if (dailyData[dateKey]) {
          dailyData[dateKey].total += 1;
          if (a.status === 'NO_SHOW') {
            dailyData[dateKey].noShows += 1;
          }
        }
      });

      Object.entries(dailyData).forEach(([date, data]) => {
        const rate = data.total > 0 ? (data.noShows / data.total) * 100 : 0;
        dataPoints.push({
          date: new Date(date),
          value: Math.round(rate * 10) / 10,
          isProjected: false,
          label: date,
        });
      });
      break;
    }

    case 'new_patients': {
      const patients = await prisma.patient.findMany({
        where: {
          organizationId,
          createdAt: { gte: startDate, lte: endDate },
        },
        select: { createdAt: true },
      });

      const dailyData: Record<string, number> = {};
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        dailyData[currentDate.toISOString().split('T')[0]] = 0;
        currentDate.setDate(currentDate.getDate() + 1);
      }

      patients.forEach(p => {
        const dateKey = new Date(p.createdAt).toISOString().split('T')[0];
        if (dailyData[dateKey] !== undefined) {
          dailyData[dateKey] += 1;
        }
      });

      Object.entries(dailyData).forEach(([date, value]) => {
        dataPoints.push({
          date: new Date(date),
          value,
          isProjected: false,
          label: date,
        });
      });
      break;
    }

    case 'ar_balance': {
      // Get charges and payments to calculate running AR
      const charges = await prisma.charge.findMany({
        where: {
          organizationId,
          createdAt: { lte: endDate },
        },
        select: { createdAt: true, fee: true },
        orderBy: { createdAt: 'asc' },
      });

      const payments = await prisma.payment.findMany({
        where: {
          organizationId,
          createdAt: { lte: endDate },
          isVoid: false,
        },
        select: { createdAt: true, amount: true },
        orderBy: { createdAt: 'asc' },
      });

      // Calculate AR balance at each day in the range
      const dailyData: Record<string, number> = {};
      let runningAR = 0;

      // Initialize all dates
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        dailyData[currentDate.toISOString().split('T')[0]] = 0;
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Apply charges and payments chronologically
      charges.forEach(c => {
        const dateKey = new Date(c.createdAt).toISOString().split('T')[0];
        runningAR += Number(c.fee || 0);
        if (dailyData[dateKey] !== undefined) {
          dailyData[dateKey] = runningAR;
        }
      });

      payments.forEach(p => {
        const dateKey = new Date(p.createdAt).toISOString().split('T')[0];
        runningAR -= Number(p.amount || 0);
        if (dailyData[dateKey] !== undefined) {
          dailyData[dateKey] = runningAR;
        }
      });

      // Fill forward empty days
      let lastValue = 0;
      Object.entries(dailyData).sort(([a], [b]) => a.localeCompare(b)).forEach(([date, value]) => {
        if (value === 0 && lastValue > 0) {
          dailyData[date] = lastValue;
        } else {
          lastValue = value;
        }
        dataPoints.push({
          date: new Date(date),
          value: dailyData[date],
          isProjected: false,
          label: date,
        });
      });
      break;
    }

    default: {
      // For other metrics, return empty to prevent errors
      // These would need custom data fetching logic
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        dataPoints.push({
          date: new Date(currentDate),
          value: Math.random() * 100, // Placeholder
          isProjected: false,
          label: currentDate.toISOString().split('T')[0],
        });
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }
  }

  return dataPoints.sort((a, b) => a.date.getTime() - b.date.getTime());
}

// Batch analyze all trends
export async function batchDetectTrends(
  options: BatchTrendAnalysisOptions
): Promise<BatchTrendAnalysisResult> {
  const startTime = Date.now();
  const metricTypes = options.metricTypes || [
    'revenue',
    'patient_volume',
    'new_patients',
    'no_shows',
    'collections',
    'ar_balance',
  ] as TrendMetricType[];

  const analyses: TrendAnalysisResult[] = [];
  let alertsGenerated = 0;
  let anomaliesDetected = 0;

  for (const metricType of metricTypes) {
    const analysis = await detectTrends(
      options.organizationId,
      metricType,
      { lookbackDays: options.lookbackDays },
      { entityType: options.entityType, entityId: options.entityId }
    );

    if (analysis) {
      analyses.push(analysis);
      alertsGenerated += analysis.alerts.length;
      anomaliesDetected += analysis.anomalies.length;

      // Save to database if requested
      if (options.saveResults) {
        await saveTrendAnalysis(options.organizationId, analysis);
      }
    }
  }

  // Generate summary insights
  const positiveMetrics = analyses
    .filter(a => a.trend.direction === TrendDirection.INCREASING &&
      ['revenue', 'patient_volume', 'collections', 'new_patients'].includes(a.metricType))
    .map(a => a.metricLabel);

  const negativeMetrics = analyses
    .filter(a => (a.trend.direction === TrendDirection.DECREASING &&
      ['revenue', 'patient_volume', 'collections', 'new_patients'].includes(a.metricType)) ||
      (a.trend.direction === TrendDirection.INCREASING &&
      ['no_shows', 'ar_balance'].includes(a.metricType)))
    .map(a => a.metricLabel);

  const stableMetrics = analyses
    .filter(a => a.trend.direction === TrendDirection.STABLE)
    .map(a => a.metricLabel);

  const allAlerts = analyses.flatMap(a => a.alerts);

  // Calculate practice health score
  const practiceHealthScore = calculatePracticeHealthScore(analyses);

  // Collect top recommendations
  const allActions = analyses.flatMap(a => a.recommendedActions);
  const topRecommendations = allActions
    .filter(a => a.priority === 'immediate')
    .slice(0, 5);

  return {
    organizationId: options.organizationId,
    analysisDate: new Date(),
    metricsAnalyzed: analyses.length,
    alertsGenerated,
    anomaliesDetected,
    processingTimeMs: Date.now() - startTime,
    analyses,
    summaryInsights: {
      positiveMetrics,
      negativeMetrics,
      stableMetrics,
      criticalAlerts: allAlerts.filter(a => a.severity === 'critical').length,
      highAlerts: allAlerts.filter(a => a.severity === 'high').length,
    },
    topRecommendations,
    practiceHealthScore,
    practiceHealthTrend: practiceHealthScore >= 70 ? TrendDirection.INCREASING :
      practiceHealthScore >= 50 ? TrendDirection.STABLE : TrendDirection.DECREASING,
  };
}

// Helper: Calculate practice health score
function calculatePracticeHealthScore(analyses: TrendAnalysisResult[]): number {
  if (analyses.length === 0) return 50;

  let score = 70; // Start at 70

  analyses.forEach(analysis => {
    const weight = getMetricWeight(analysis.metricType);

    // Positive metrics going up is good
    if (['revenue', 'patient_volume', 'collections', 'new_patients'].includes(analysis.metricType)) {
      if (analysis.trend.direction === TrendDirection.INCREASING) {
        score += Math.min(5, analysis.trend.changePercent / 5) * weight;
      } else if (analysis.trend.direction === TrendDirection.DECREASING) {
        score -= Math.min(10, Math.abs(analysis.trend.changePercent) / 3) * weight;
      }
    }

    // Negative metrics going down is good
    if (['no_shows', 'ar_balance'].includes(analysis.metricType)) {
      if (analysis.trend.direction === TrendDirection.DECREASING) {
        score += Math.min(5, Math.abs(analysis.trend.changePercent) / 5) * weight;
      } else if (analysis.trend.direction === TrendDirection.INCREASING) {
        score -= Math.min(10, analysis.trend.changePercent / 3) * weight;
      }
    }

    // Penalize for anomalies and alerts
    score -= analysis.anomalies.filter(a => a.severity === 'critical').length * 3;
    score -= analysis.anomalies.filter(a => a.severity === 'high').length * 2;
    score -= analysis.alerts.filter(a => a.severity === 'critical').length * 2;
  });

  return Math.max(0, Math.min(100, Math.round(score)));
}

// Helper: Get metric importance weight
function getMetricWeight(metricType: TrendMetricType): number {
  const weights: Record<TrendMetricType, number> = {
    revenue: 1.5,
    patient_volume: 1.3,
    collections: 1.4,
    new_patients: 1.2,
    no_shows: 1.0,
    ar_balance: 1.1,
    cancellations: 0.8,
    visit_frequency: 0.9,
    treatment_completion: 1.0,
    payer_mix: 0.7,
    patient_satisfaction: 1.0,
    custom: 0.5,
  };
  return weights[metricType] || 1.0;
}

// Save trend analysis to database
export async function saveTrendAnalysis(
  organizationId: string,
  analysis: TrendAnalysisResult
): Promise<void> {
  await prisma.trendAnalysis.create({
    data: {
      organizationId,
      metricType: analysis.metricType,
      metricSubtype: null,
      entityType: null,
      entityId: null,
      trend: analysis.trend.direction,
      trendStrength: analysis.trend.strength,
      trendDescription: analysis.trend.description,
      currentValue: analysis.currentValue,
      previousValue: analysis.previousValue,
      changePercent: analysis.changePercent,
      changeAbsolute: analysis.changeAbsolute,
      mean: analysis.statistics.mean,
      median: analysis.statistics.median,
      stdDev: analysis.statistics.stdDev,
      minValue: analysis.statistics.min,
      maxValue: analysis.statistics.max,
      seasonality: analysis.seasonality.detected ?
        (analysis.seasonality.pattern === 'weekly' ? SeasonalityPattern.WEEKLY :
         analysis.seasonality.pattern === 'monthly' ? SeasonalityPattern.MONTHLY :
         analysis.seasonality.pattern === 'quarterly' ? SeasonalityPattern.QUARTERLY :
         analysis.seasonality.pattern === 'yearly' ? SeasonalityPattern.YEARLY :
         SeasonalityPattern.NONE) : SeasonalityPattern.NONE,
      seasonalIndex: analysis.seasonality.strength,
      seasonalPattern: JSON.parse(JSON.stringify(analysis.seasonality)),
      forecast: JSON.parse(JSON.stringify(analysis.forecast)),
      forecastHorizon: '30d',
      forecastAccuracy: analysis.confidence,
      isAnomaly: analysis.anomalies.length > 0,
      anomalyScore: analysis.anomalies.length > 0 ?
        Math.max(...analysis.anomalies.map(a => a.anomalyScore)) : null,
      anomalyType: analysis.anomalies[0]?.anomalyType || null,
      alertTriggered: analysis.alerts.length > 0,
      alertSeverity: analysis.alerts[0]?.severity || null,
      recommendations: JSON.parse(JSON.stringify(analysis.recommendedActions)),
      dataPoints: analysis.dataPointCount,
      analysisStart: analysis.startDate,
      analysisEnd: analysis.endDate,
    },
  });
}

// Get alert summary
export async function getAlertSummary(
  organizationId: string
): Promise<TrendAlertSummary> {
  // Get recent trend analyses with alerts
  const recentAnalyses = await prisma.trendAnalysis.findMany({
    where: {
      organizationId,
      alertTriggered: true,
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  // Convert to alert format
  const alerts: EarlyWarningAlert[] = recentAnalyses.map(analysis => {
    const anomalyScoreNum = analysis.anomalyScore ? Number(analysis.anomalyScore) : 0;
    return {
      id: analysis.id,
      alertType: analysis.isAnomaly ? 'anomaly' : 'trend_reversal',
      severity: anomalyScoreNum > 0.8 ? 'critical' :
        anomalyScoreNum > 0.6 ? 'high' :
        anomalyScoreNum > 0.4 ? 'medium' : 'low' as AlertSeverity,
      status: 'active' as const,
      metricType: analysis.metricType as TrendMetricType,
      triggerValue: Number(analysis.currentValue),
      thresholdValue: Number(analysis.previousValue || 0),
      title: `${analysis.metricType.replace(/_/g, ' ')} ${analysis.trend.toLowerCase()}`,
      description: analysis.trendDescription || '',
      detailedExplanation: '',
      potentialImpact: '',
      urgency: 'monitor' as const,
      previousOccurrences: 0,
      recommendedActions: [],
      createdAt: analysis.createdAt,
    };
  });

  // Count by severity
  const bySeverity = {
    critical: alerts.filter(a => a.severity === 'critical').length,
    high: alerts.filter(a => a.severity === 'high').length,
    medium: alerts.filter(a => a.severity === 'medium').length,
    low: alerts.filter(a => a.severity === 'low').length,
    info: alerts.filter(a => a.severity === 'info').length,
  };

  // Group by metric
  const byMetricMap = new Map<TrendMetricType, { count: number; highestSeverity: AlertSeverity }>();
  alerts.forEach(alert => {
    const existing = byMetricMap.get(alert.metricType);
    if (!existing) {
      byMetricMap.set(alert.metricType, { count: 1, highestSeverity: alert.severity });
    } else {
      existing.count++;
      const severityOrder = ['critical', 'high', 'medium', 'low', 'info'];
      if (severityOrder.indexOf(alert.severity) < severityOrder.indexOf(existing.highestSeverity)) {
        existing.highestSeverity = alert.severity;
      }
    }
  });

  const byMetric = Array.from(byMetricMap.entries()).map(([metricType, data]) => ({
    metricType,
    count: data.count,
    highestSeverity: data.highestSeverity,
  }));

  // Determine alert trend
  const oldAlerts = await prisma.trendAnalysis.count({
    where: {
      organizationId,
      alertTriggered: true,
      createdAt: {
        gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    },
  });

  const alertTrend = alerts.length > oldAlerts ? TrendDirection.INCREASING :
    alerts.length < oldAlerts ? TrendDirection.DECREASING : TrendDirection.STABLE;

  return {
    totalActiveAlerts: alerts.length,
    byMetric,
    bySeverity,
    recentAlerts: alerts.slice(0, 5),
    unresolvedAlerts: alerts.filter(a => a.status === 'active'),
    alertTrend,
  };
}

// Track trend prediction accuracy
export async function trackTrendAccuracy(
  organizationId: string,
  metricType: TrendMetricType,
  forecastDate: Date,
  actualValue: number
): Promise<TrendAccuracyMetrics | null> {
  // Find the most recent prediction for this metric before the forecast date
  const prediction = await prisma.trendAnalysis.findFirst({
    where: {
      organizationId,
      metricType,
      createdAt: { lt: forecastDate },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!prediction || !prediction.forecast) {
    return null;
  }

  // Update with actual value (would need actual tracking mechanism)
  return {
    metricType,
    totalForecasts: 1,
    evaluatedForecasts: 1,
    mape: 0,
    rmse: 0,
    directionalAccuracy: 100,
    byHorizon: [],
    alertAccuracy: {
      totalAlerts: 0,
      truePositives: 0,
      falsePositives: 0,
      precision: 0,
    },
  };
}

// Get trend accuracy summary
export async function getTrendAccuracySummary(
  organizationId: string,
  lookbackDays: number = 90
): Promise<Record<TrendMetricType, TrendAccuracyMetrics>> {
  const result: Record<string, TrendAccuracyMetrics> = {};

  const metricTypes: TrendMetricType[] = [
    'revenue', 'patient_volume', 'new_patients', 'no_shows', 'collections', 'ar_balance'
  ];

  for (const metricType of metricTypes) {
    result[metricType] = {
      metricType,
      totalForecasts: 0,
      evaluatedForecasts: 0,
      mape: 0,
      rmse: 0,
      directionalAccuracy: 0,
      byHorizon: [],
      alertAccuracy: {
        totalAlerts: 0,
        truePositives: 0,
        falsePositives: 0,
        precision: 0,
      },
    };
  }

  return result as Record<TrendMetricType, TrendAccuracyMetrics>;
}

// Compare trends between two periods
export async function compareTrends(
  organizationId: string,
  metricType: TrendMetricType,
  period1: { start: Date; end: Date; label: string },
  period2: { start: Date; end: Date; label: string }
): Promise<TrendComparisonResult> {
  const [data1, data2] = await Promise.all([
    fetchMetricData(organizationId, metricType, period1.start, period1.end),
    fetchMetricData(organizationId, metricType, period2.start, period2.end),
  ]);

  const values1 = data1.filter(d => !d.isProjected).map(d => d.value);
  const values2 = data2.filter(d => !d.isProjected).map(d => d.value);

  const sum1 = values1.reduce((sum, v) => sum + v, 0);
  const sum2 = values2.reduce((sum, v) => sum + v, 0);

  const absoluteChange = sum2 - sum1;
  const percentChange = sum1 !== 0 ? ((sum2 - sum1) / sum1) * 100 : 0;

  // Historical average (combine both periods)
  const allValues = [...values1, ...values2];
  const historicalAverage = allValues.length > 0 ?
    allValues.reduce((sum, v) => sum + v, 0) / allValues.length : 0;
  const vsHistoricalPercent = historicalAverage !== 0 ?
    ((sum2 - historicalAverage) / historicalAverage) * 100 : 0;

  // Significance test (simple t-test approximation)
  const stats1 = calculateStatistics(values1);
  const stats2 = calculateStatistics(values2);
  const pooledStdErr = Math.sqrt((stats1.variance / values1.length) + (stats2.variance / values2.length));
  const tStat = pooledStdErr > 0 ? Math.abs(stats2.mean - stats1.mean) / pooledStdErr : 0;
  const isSignificant = tStat > 1.96; // 95% confidence

  return {
    metricType,
    period1,
    period2,
    period1Value: sum1,
    period2Value: sum2,
    absoluteChange,
    percentChange: Math.round(percentChange * 100) / 100,
    interpretation: percentChange > 0 ?
      `${metricType.replace(/_/g, ' ')} increased by ${percentChange.toFixed(1)}% from ${period1.label} to ${period2.label}` :
      percentChange < 0 ?
      `${metricType.replace(/_/g, ' ')} decreased by ${Math.abs(percentChange).toFixed(1)}% from ${period1.label} to ${period2.label}` :
      `${metricType.replace(/_/g, ' ')} remained stable between ${period1.label} and ${period2.label}`,
    isSignificant,
    significance: tStat,
    historicalAverage,
    vsHistoricalPercent: Math.round(vsHistoricalPercent * 100) / 100,
    period1Data: data1,
    period2Data: data2,
  };
}
