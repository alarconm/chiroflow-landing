// Anomaly Detector - AI Insights Agent
// Detects unusual patterns in revenue, visits, payments, and other metrics

import { prisma } from '@/lib/prisma';
import { AnomalyType, InsightPriority } from '@prisma/client';
import type {
  AnomalyDetectionConfig,
  DetectedAnomaly,
  TimeSeriesDataPoint,
  AnomalyStatistics,
} from './types';

// Default configuration
const DEFAULT_CONFIG: AnomalyDetectionConfig = {
  zScoreThreshold: 2.0,
  minDataPoints: 7,
  lookbackDays: 90,
  enabledTypes: Object.values(AnomalyType) as AnomalyType[],
  sensitivity: {
    revenue: 'medium',
    visits: 'medium',
    payments: 'medium',
    noShows: 'high',
  },
};

// Sensitivity multipliers for z-score threshold
const SENSITIVITY_MULTIPLIERS = {
  low: 1.5, // More anomalies detected
  medium: 1.0,
  high: 0.7, // Fewer anomalies detected
};

/**
 * Calculate basic statistics for a time series
 */
function calculateStatistics(data: TimeSeriesDataPoint[]): AnomalyStatistics {
  if (data.length === 0) {
    return {
      mean: 0,
      stdDev: 0,
      median: 0,
      min: 0,
      max: 0,
      trend: 'stable',
      trendStrength: 0,
    };
  }

  const values = data.map((d) => d.value);
  const n = values.length;

  // Mean
  const mean = values.reduce((a, b) => a + b, 0) / n;

  // Standard deviation
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / n;
  const stdDev = Math.sqrt(avgSquaredDiff);

  // Median
  const sorted = [...values].sort((a, b) => a - b);
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];

  // Min/Max
  const min = Math.min(...values);
  const max = Math.max(...values);

  // Trend detection using linear regression
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const trendStrength = Math.abs(slope) / (mean || 1);

  let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
  if (trendStrength > 0.05) {
    trend = slope > 0 ? 'increasing' : 'decreasing';
  }

  return {
    mean,
    stdDev,
    median,
    min,
    max,
    trend,
    trendStrength: Math.min(1, trendStrength),
  };
}

/**
 * Calculate z-score for a value given statistics
 */
function calculateZScore(value: number, stats: AnomalyStatistics): number {
  if (stats.stdDev === 0) return 0;
  return (value - stats.mean) / stats.stdDev;
}

/**
 * Get priority based on z-score magnitude
 */
function getPriorityFromZScore(zScore: number): InsightPriority {
  const absZ = Math.abs(zScore);
  if (absZ >= 4) return InsightPriority.CRITICAL;
  if (absZ >= 3) return InsightPriority.HIGH;
  if (absZ >= 2.5) return InsightPriority.MEDIUM;
  return InsightPriority.LOW;
}

/**
 * Fetch daily revenue data
 */
async function getRevenueTimeSeries(
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<TimeSeriesDataPoint[]> {
  const payments = await prisma.payment.groupBy({
    by: ['paymentDate'],
    where: {
      organizationId,
      paymentDate: { gte: startDate, lte: endDate },
      isVoid: false,
    },
    _sum: { amount: true },
    orderBy: { paymentDate: 'asc' },
  });

  return payments.map((p) => ({
    date: p.paymentDate,
    value: Number(p._sum.amount || 0),
  }));
}

/**
 * Fetch daily visit data
 */
async function getVisitsTimeSeries(
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<TimeSeriesDataPoint[]> {
  const appointments = await prisma.appointment.groupBy({
    by: ['startTime'],
    where: {
      organizationId,
      startTime: { gte: startDate, lte: endDate },
      status: { in: ['COMPLETED', 'CHECKED_IN'] },
    },
    _count: true,
    orderBy: { startTime: 'asc' },
  });

  // Aggregate by day
  const byDay = new Map<string, number>();
  for (const apt of appointments) {
    const dateKey = apt.startTime.toISOString().split('T')[0];
    byDay.set(dateKey, (byDay.get(dateKey) || 0) + apt._count);
  }

  return Array.from(byDay.entries()).map(([dateStr, count]) => ({
    date: new Date(dateStr),
    value: count,
  }));
}

/**
 * Fetch daily no-show data
 */
async function getNoShowTimeSeries(
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<TimeSeriesDataPoint[]> {
  const appointments = await prisma.appointment.groupBy({
    by: ['startTime'],
    where: {
      organizationId,
      startTime: { gte: startDate, lte: endDate },
    },
    _count: true,
    orderBy: { startTime: 'asc' },
  });

  const noShows = await prisma.appointment.groupBy({
    by: ['startTime'],
    where: {
      organizationId,
      startTime: { gte: startDate, lte: endDate },
      status: 'NO_SHOW',
    },
    _count: true,
    orderBy: { startTime: 'asc' },
  });

  // Calculate daily no-show rate
  const totalByDay = new Map<string, number>();
  const noShowByDay = new Map<string, number>();

  for (const apt of appointments) {
    const dateKey = apt.startTime.toISOString().split('T')[0];
    totalByDay.set(dateKey, (totalByDay.get(dateKey) || 0) + apt._count);
  }

  for (const ns of noShows) {
    const dateKey = ns.startTime.toISOString().split('T')[0];
    noShowByDay.set(dateKey, (noShowByDay.get(dateKey) || 0) + ns._count);
  }

  return Array.from(totalByDay.entries()).map(([dateStr, total]) => ({
    date: new Date(dateStr),
    value: total > 0 ? ((noShowByDay.get(dateStr) || 0) / total) * 100 : 0,
  }));
}

/**
 * Fetch new patient data
 */
async function getNewPatientTimeSeries(
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<TimeSeriesDataPoint[]> {
  const patients = await prisma.patient.groupBy({
    by: ['createdAt'],
    where: {
      organizationId,
      createdAt: { gte: startDate, lte: endDate },
    },
    _count: true,
    orderBy: { createdAt: 'asc' },
  });

  // Aggregate by day
  const byDay = new Map<string, number>();
  for (const p of patients) {
    const dateKey = p.createdAt.toISOString().split('T')[0];
    byDay.set(dateKey, (byDay.get(dateKey) || 0) + p._count);
  }

  return Array.from(byDay.entries()).map(([dateStr, count]) => ({
    date: new Date(dateStr),
    value: count,
  }));
}

/**
 * Fetch claim denial data
 */
async function getClaimDenialTimeSeries(
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<TimeSeriesDataPoint[]> {
  const claims = await prisma.claim.groupBy({
    by: ['submittedDate'],
    where: {
      organizationId,
      submittedDate: { gte: startDate, lte: endDate },
      status: { in: ['SUBMITTED', 'ACCEPTED', 'PAID', 'DENIED'] },
    },
    _count: true,
    orderBy: { submittedDate: 'asc' },
  });

  const denials = await prisma.claim.groupBy({
    by: ['submittedDate'],
    where: {
      organizationId,
      submittedDate: { gte: startDate, lte: endDate },
      status: 'DENIED',
    },
    _count: true,
    orderBy: { submittedDate: 'asc' },
  });

  // Calculate daily denial rate
  const totalByDay = new Map<string, number>();
  const denialByDay = new Map<string, number>();

  for (const c of claims) {
    if (c.submittedDate) {
      const dateKey = c.submittedDate.toISOString().split('T')[0];
      totalByDay.set(dateKey, (totalByDay.get(dateKey) || 0) + c._count);
    }
  }

  for (const d of denials) {
    if (d.submittedDate) {
      const dateKey = d.submittedDate.toISOString().split('T')[0];
      denialByDay.set(dateKey, (denialByDay.get(dateKey) || 0) + d._count);
    }
  }

  return Array.from(totalByDay.entries()).map(([dateStr, total]) => ({
    date: new Date(dateStr),
    value: total > 0 ? ((denialByDay.get(dateStr) || 0) / total) * 100 : 0,
  }));
}

/**
 * Detect anomalies in a time series
 */
function detectTimeSeriesAnomalies(
  data: TimeSeriesDataPoint[],
  config: AnomalyDetectionConfig,
  metricType: keyof AnomalyDetectionConfig['sensitivity']
): { anomalyIndex: number; zScore: number; stats: AnomalyStatistics }[] {
  if (data.length < config.minDataPoints) {
    return [];
  }

  const stats = calculateStatistics(data);
  const sensitivityMultiplier = SENSITIVITY_MULTIPLIERS[config.sensitivity[metricType]];
  const threshold = config.zScoreThreshold * sensitivityMultiplier;

  const anomalies: { anomalyIndex: number; zScore: number; stats: AnomalyStatistics }[] = [];

  // Check the most recent data point (or last few)
  for (let i = Math.max(0, data.length - 3); i < data.length; i++) {
    const zScore = calculateZScore(data[i].value, stats);
    if (Math.abs(zScore) >= threshold) {
      anomalies.push({ anomalyIndex: i, zScore, stats });
    }
  }

  return anomalies;
}

/**
 * Main anomaly detection function
 */
export async function detectAnomalies(
  organizationId: string,
  config: Partial<AnomalyDetectionConfig> = {}
): Promise<DetectedAnomaly[]> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - finalConfig.lookbackDays);

  const anomalies: DetectedAnomaly[] = [];

  // Check revenue anomalies
  if (
    finalConfig.enabledTypes.includes(AnomalyType.REVENUE_SPIKE) ||
    finalConfig.enabledTypes.includes(AnomalyType.REVENUE_DROP)
  ) {
    const revenueData = await getRevenueTimeSeries(organizationId, startDate, endDate);
    const revenueAnomalies = detectTimeSeriesAnomalies(revenueData, finalConfig, 'revenue');

    for (const anomaly of revenueAnomalies) {
      const dataPoint = revenueData[anomaly.anomalyIndex];
      const isSpike = anomaly.zScore > 0;
      const type = isSpike ? AnomalyType.REVENUE_SPIKE : AnomalyType.REVENUE_DROP;

      if (!finalConfig.enabledTypes.includes(type)) continue;

      anomalies.push({
        type,
        title: isSpike
          ? `Revenue spike detected: $${dataPoint.value.toFixed(0)}`
          : `Revenue drop detected: $${dataPoint.value.toFixed(0)}`,
        description: `Daily revenue of $${dataPoint.value.toFixed(2)} is ${Math.abs(anomaly.zScore).toFixed(1)} standard deviations ${isSpike ? 'above' : 'below'} the ${finalConfig.lookbackDays}-day average of $${anomaly.stats.mean.toFixed(2)}.`,
        metric: 'dailyRevenue',
        expectedValue: anomaly.stats.mean,
        actualValue: dataPoint.value,
        deviationPercent: ((dataPoint.value - anomaly.stats.mean) / anomaly.stats.mean) * 100,
        zScore: anomaly.zScore,
        confidence: Math.min(99, 50 + Math.abs(anomaly.zScore) * 15),
        priority: getPriorityFromZScore(anomaly.zScore),
        periodStart: dataPoint.date,
        periodEnd: dataPoint.date,
        dataSnapshot: {
          recentData: revenueData.slice(-7),
          statistics: anomaly.stats,
        },
        recommendation: isSpike
          ? 'Investigate what drove this revenue increase. Consider if this is repeatable.'
          : 'Review scheduling, cancellations, and collections for this day. Check for any billing issues.',
      });
    }
  }

  // Check visit anomalies
  if (
    finalConfig.enabledTypes.includes(AnomalyType.VISIT_SPIKE) ||
    finalConfig.enabledTypes.includes(AnomalyType.VISIT_DROP)
  ) {
    const visitData = await getVisitsTimeSeries(organizationId, startDate, endDate);
    const visitAnomalies = detectTimeSeriesAnomalies(visitData, finalConfig, 'visits');

    for (const anomaly of visitAnomalies) {
      const dataPoint = visitData[anomaly.anomalyIndex];
      const isSpike = anomaly.zScore > 0;
      const type = isSpike ? AnomalyType.VISIT_SPIKE : AnomalyType.VISIT_DROP;

      if (!finalConfig.enabledTypes.includes(type)) continue;

      anomalies.push({
        type,
        title: isSpike
          ? `Visit volume spike: ${dataPoint.value} visits`
          : `Visit volume drop: ${dataPoint.value} visits`,
        description: `${dataPoint.value} visits is ${Math.abs(anomaly.zScore).toFixed(1)} standard deviations ${isSpike ? 'above' : 'below'} the average of ${anomaly.stats.mean.toFixed(1)} visits.`,
        metric: 'dailyVisits',
        expectedValue: anomaly.stats.mean,
        actualValue: dataPoint.value,
        deviationPercent: ((dataPoint.value - anomaly.stats.mean) / anomaly.stats.mean) * 100,
        zScore: anomaly.zScore,
        confidence: Math.min(99, 50 + Math.abs(anomaly.zScore) * 15),
        priority: getPriorityFromZScore(anomaly.zScore),
        periodStart: dataPoint.date,
        periodEnd: dataPoint.date,
        dataSnapshot: {
          recentData: visitData.slice(-7),
          statistics: anomaly.stats,
        },
        recommendation: isSpike
          ? 'Review if providers were adequately staffed. Monitor patient satisfaction.'
          : 'Check for scheduling issues, cancellations, or external factors affecting visits.',
      });
    }
  }

  // Check no-show anomalies
  if (finalConfig.enabledTypes.includes(AnomalyType.NO_SHOW_SPIKE)) {
    const noShowData = await getNoShowTimeSeries(organizationId, startDate, endDate);
    const noShowAnomalies = detectTimeSeriesAnomalies(noShowData, finalConfig, 'noShows');

    for (const anomaly of noShowAnomalies) {
      const dataPoint = noShowData[anomaly.anomalyIndex];
      if (anomaly.zScore <= 0) continue; // Only care about spikes

      anomalies.push({
        type: AnomalyType.NO_SHOW_SPIKE,
        title: `No-show rate spike: ${dataPoint.value.toFixed(1)}%`,
        description: `No-show rate of ${dataPoint.value.toFixed(1)}% is ${anomaly.zScore.toFixed(1)} standard deviations above the average of ${anomaly.stats.mean.toFixed(1)}%.`,
        metric: 'noShowRate',
        expectedValue: anomaly.stats.mean,
        actualValue: dataPoint.value,
        deviationPercent: ((dataPoint.value - anomaly.stats.mean) / anomaly.stats.mean) * 100,
        zScore: anomaly.zScore,
        confidence: Math.min(99, 50 + Math.abs(anomaly.zScore) * 15),
        priority: getPriorityFromZScore(anomaly.zScore),
        periodStart: dataPoint.date,
        periodEnd: dataPoint.date,
        dataSnapshot: {
          recentData: noShowData.slice(-7),
          statistics: anomaly.stats,
        },
        recommendation:
          'Review reminder effectiveness. Consider follow-up calls. Check if specific providers or times are affected.',
      });
    }
  }

  // Check new patient anomalies
  if (
    finalConfig.enabledTypes.includes(AnomalyType.NEW_PATIENT_SPIKE) ||
    finalConfig.enabledTypes.includes(AnomalyType.NEW_PATIENT_DROP)
  ) {
    const newPatientData = await getNewPatientTimeSeries(organizationId, startDate, endDate);
    const newPatientAnomalies = detectTimeSeriesAnomalies(newPatientData, finalConfig, 'visits');

    for (const anomaly of newPatientAnomalies) {
      const dataPoint = newPatientData[anomaly.anomalyIndex];
      const isSpike = anomaly.zScore > 0;
      const type = isSpike ? AnomalyType.NEW_PATIENT_SPIKE : AnomalyType.NEW_PATIENT_DROP;

      if (!finalConfig.enabledTypes.includes(type)) continue;

      anomalies.push({
        type,
        title: isSpike
          ? `New patient surge: ${dataPoint.value} new patients`
          : `New patient decline: ${dataPoint.value} new patients`,
        description: `${dataPoint.value} new patients is ${Math.abs(anomaly.zScore).toFixed(1)} standard deviations ${isSpike ? 'above' : 'below'} the average.`,
        metric: 'newPatients',
        expectedValue: anomaly.stats.mean,
        actualValue: dataPoint.value,
        deviationPercent: ((dataPoint.value - anomaly.stats.mean) / (anomaly.stats.mean || 1)) * 100,
        zScore: anomaly.zScore,
        confidence: Math.min(99, 50 + Math.abs(anomaly.zScore) * 15),
        priority: getPriorityFromZScore(anomaly.zScore),
        periodStart: dataPoint.date,
        periodEnd: dataPoint.date,
        dataSnapshot: {
          recentData: newPatientData.slice(-7),
          statistics: anomaly.stats,
        },
        recommendation: isSpike
          ? 'Great result! Identify the source of these new patients for future marketing.'
          : 'Review marketing effectiveness and referral sources. Check website and online presence.',
      });
    }
  }

  // Check claim denial anomalies
  if (finalConfig.enabledTypes.includes(AnomalyType.CLAIM_DENIAL_SPIKE)) {
    const denialData = await getClaimDenialTimeSeries(organizationId, startDate, endDate);
    const denialAnomalies = detectTimeSeriesAnomalies(denialData, finalConfig, 'payments');

    for (const anomaly of denialAnomalies) {
      const dataPoint = denialData[anomaly.anomalyIndex];
      if (anomaly.zScore <= 0) continue; // Only care about spikes

      anomalies.push({
        type: AnomalyType.CLAIM_DENIAL_SPIKE,
        title: `Claim denial rate spike: ${dataPoint.value.toFixed(1)}%`,
        description: `Denial rate of ${dataPoint.value.toFixed(1)}% is significantly above the average of ${anomaly.stats.mean.toFixed(1)}%.`,
        metric: 'denialRate',
        expectedValue: anomaly.stats.mean,
        actualValue: dataPoint.value,
        deviationPercent: ((dataPoint.value - anomaly.stats.mean) / anomaly.stats.mean) * 100,
        zScore: anomaly.zScore,
        confidence: Math.min(99, 50 + Math.abs(anomaly.zScore) * 15),
        priority: InsightPriority.HIGH, // Denials are always important
        periodStart: dataPoint.date,
        periodEnd: dataPoint.date,
        dataSnapshot: {
          recentData: denialData.slice(-7),
          statistics: anomaly.stats,
        },
        recommendation:
          'Review denied claims for common denial reasons. Check for coding issues or payer policy changes.',
      });
    }
  }

  // Sort by priority and return
  const priorityOrder = {
    [InsightPriority.CRITICAL]: 0,
    [InsightPriority.HIGH]: 1,
    [InsightPriority.MEDIUM]: 2,
    [InsightPriority.LOW]: 3,
    [InsightPriority.INFO]: 4,
  };

  return anomalies.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

/**
 * Get statistics for a specific metric
 */
export async function getMetricStatistics(
  organizationId: string,
  metric: 'revenue' | 'visits' | 'noShows' | 'newPatients' | 'denials',
  lookbackDays = 90
): Promise<AnomalyStatistics & { data: TimeSeriesDataPoint[] }> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - lookbackDays);

  let data: TimeSeriesDataPoint[];
  switch (metric) {
    case 'revenue':
      data = await getRevenueTimeSeries(organizationId, startDate, endDate);
      break;
    case 'visits':
      data = await getVisitsTimeSeries(organizationId, startDate, endDate);
      break;
    case 'noShows':
      data = await getNoShowTimeSeries(organizationId, startDate, endDate);
      break;
    case 'newPatients':
      data = await getNewPatientTimeSeries(organizationId, startDate, endDate);
      break;
    case 'denials':
      data = await getClaimDenialTimeSeries(organizationId, startDate, endDate);
      break;
    default:
      throw new Error(`Unknown metric: ${metric}`);
  }

  const stats = calculateStatistics(data);
  return { ...stats, data };
}
