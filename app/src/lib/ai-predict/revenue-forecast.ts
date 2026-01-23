// Revenue Forecasting - Epic 40: AI Predictive Analytics Agent
// Predicts future revenue with confidence intervals, scenario modeling, and goal attainment analysis

import { prisma } from '@/lib/prisma';
import { ChargeStatus, TrendDirection, PredictionType, PredictionStatus, Prisma } from '@prisma/client';
import type {
  RevenueForecastConfig,
  RevenueForecastResult,
  DailyRevenueForecast,
  WeeklyRevenueForecast,
  MonthlyRevenueForecast,
  CollectionsForecast,
  ARRecoveryPrediction,
  NewPatientRevenueImpact,
  RevenueScenarioModel,
  RevenueConfidenceInterval,
  RevenueVarianceAnalysis,
  GoalAttainmentProbability,
  RevenueForecastAccuracyMetrics,
  RevenueForecastGranularity,
  RevenueScenario,
} from './types';

// Default configuration
const DEFAULT_CONFIG: RevenueForecastConfig = {
  lookbackMonths: 12,
  forecastHorizonMonths: 3,
  minDataPoints: 30,
  includeCharges: true,
  includeCollections: true,
  includeAR: true,
  includeNewPatients: true,
  confidenceLevel: 0.95,
  includeScenarios: true,
};

const MODEL_VERSION = '1.0.0';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// US Federal holidays (simplified)
const US_HOLIDAYS = [
  { name: "New Year's Day", dates: ['2024-01-01', '2025-01-01', '2026-01-01', '2027-01-01'] },
  { name: 'Memorial Day', dates: ['2024-05-27', '2025-05-26', '2026-05-25', '2027-05-31'] },
  { name: 'Independence Day', dates: ['2024-07-04', '2025-07-04', '2026-07-04', '2027-07-04'] },
  { name: 'Labor Day', dates: ['2024-09-02', '2025-09-01', '2026-09-07', '2027-09-06'] },
  { name: 'Thanksgiving', dates: ['2024-11-28', '2025-11-27', '2026-11-26', '2027-11-25'] },
  { name: 'Christmas Day', dates: ['2024-12-25', '2025-12-25', '2026-12-25', '2027-12-25'] },
];

/**
 * Check if a date is a holiday
 */
function isHoliday(date: Date): { isHoliday: boolean; holidayName: string | null } {
  const dateStr = date.toISOString().split('T')[0];

  for (const holiday of US_HOLIDAYS) {
    if (holiday.dates.includes(dateStr)) {
      return { isHoliday: true, holidayName: holiday.name };
    }
  }

  return { isHoliday: false, holidayName: null };
}

/**
 * Calculate confidence interval for a predicted value
 */
function calculateConfidenceInterval(
  mean: number,
  historicalValues: number[],
  confidenceLevel: number
): RevenueConfidenceInterval {
  if (historicalValues.length === 0) {
    return { min: mean * 0.7, max: mean * 1.3, p25: mean * 0.85, p50: mean, p75: mean * 1.15 };
  }

  const sorted = [...historicalValues].sort((a, b) => a - b);
  const n = sorted.length;

  // Calculate standard deviation
  const variance = historicalValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  // Z-score for confidence level
  const zScore = confidenceLevel >= 0.95 ? 1.96 : confidenceLevel >= 0.90 ? 1.645 : 1.28;

  return {
    min: Math.max(0, Math.floor(mean - zScore * stdDev)),
    max: Math.ceil(mean + zScore * stdDev),
    p25: sorted[Math.floor(n * 0.25)] || mean * 0.85,
    p50: sorted[Math.floor(n * 0.5)] || mean,
    p75: sorted[Math.floor(n * 0.75)] || mean * 1.15,
  };
}

/**
 * Calculate day of week factors from historical revenue data
 */
function calculateDayOfWeekFactors(
  revenueByDate: Map<string, number>,
  totalDays: number
): Map<number, number> {
  const dayTotals: Record<number, number[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };

  for (const [dateStr, revenue] of revenueByDate) {
    const dayOfWeek = new Date(dateStr).getDay();
    dayTotals[dayOfWeek].push(revenue);
  }

  const factors = new Map<number, number>();
  let overallAvg = 0;
  let dayCount = 0;

  for (let day = 0; day < 7; day++) {
    const values = dayTotals[day];
    if (values.length > 0) {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      factors.set(day, avg);
      overallAvg += avg;
      dayCount++;
    } else {
      factors.set(day, 0);
    }
  }

  overallAvg = dayCount > 0 ? overallAvg / dayCount : 1;

  // Convert to factors (relative to overall average)
  for (let day = 0; day < 7; day++) {
    const current = factors.get(day) || 0;
    factors.set(day, overallAvg > 0 ? current / overallAvg : 1);
  }

  return factors;
}

/**
 * Calculate seasonal factors by month
 */
function calculateSeasonalFactors(
  revenueByMonth: Map<string, number>
): Map<number, number> {
  const monthTotals: Record<number, number[]> = {};
  for (let m = 1; m <= 12; m++) {
    monthTotals[m] = [];
  }

  for (const [monthKey, revenue] of revenueByMonth) {
    const month = parseInt(monthKey.split('-')[1], 10);
    monthTotals[month].push(revenue);
  }

  const factors = new Map<number, number>();
  let overallAvg = 0;
  let monthCount = 0;

  for (let month = 1; month <= 12; month++) {
    const values = monthTotals[month];
    if (values.length > 0) {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      factors.set(month, avg);
      overallAvg += avg;
      monthCount++;
    } else {
      factors.set(month, 0);
    }
  }

  overallAvg = monthCount > 0 ? overallAvg / monthCount : 1;

  // Convert to factors
  for (let month = 1; month <= 12; month++) {
    const current = factors.get(month) || overallAvg;
    factors.set(month, overallAvg > 0 ? current / overallAvg : 1);
  }

  return factors;
}

/**
 * Predict AR recovery based on aging buckets
 */
async function predictARRecovery(
  organizationId: string,
  forecastDate: Date
): Promise<ARRecoveryPrediction> {
  // Get current AR status
  const arData = await prisma.charge.groupBy({
    by: ['status'],
    where: {
      organizationId,
      status: { in: [ChargeStatus.PENDING, ChargeStatus.BILLED] },
      balance: { gt: 0 },
    },
    _sum: { balance: true },
    _count: true,
  });

  // Get aging buckets
  const today = new Date();
  const agingBuckets = await Promise.all([
    // 0-30 days
    prisma.charge.aggregate({
      where: {
        organizationId,
        status: { in: [ChargeStatus.PENDING, ChargeStatus.BILLED] },
        balance: { gt: 0 },
        chargeDate: { gte: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000) },
      },
      _sum: { balance: true },
    }),
    // 31-60 days
    prisma.charge.aggregate({
      where: {
        organizationId,
        status: { in: [ChargeStatus.PENDING, ChargeStatus.BILLED] },
        balance: { gt: 0 },
        chargeDate: {
          gte: new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000),
          lt: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000),
        },
      },
      _sum: { balance: true },
    }),
    // 61-90 days
    prisma.charge.aggregate({
      where: {
        organizationId,
        status: { in: [ChargeStatus.PENDING, ChargeStatus.BILLED] },
        balance: { gt: 0 },
        chargeDate: {
          gte: new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000),
          lt: new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000),
        },
      },
      _sum: { balance: true },
    }),
    // 91-120 days
    prisma.charge.aggregate({
      where: {
        organizationId,
        status: { in: [ChargeStatus.PENDING, ChargeStatus.BILLED] },
        balance: { gt: 0 },
        chargeDate: {
          gte: new Date(today.getTime() - 120 * 24 * 60 * 60 * 1000),
          lt: new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000),
        },
      },
      _sum: { balance: true },
    }),
    // Over 120 days
    prisma.charge.aggregate({
      where: {
        organizationId,
        status: { in: [ChargeStatus.PENDING, ChargeStatus.BILLED] },
        balance: { gt: 0 },
        chargeDate: { lt: new Date(today.getTime() - 120 * 24 * 60 * 60 * 1000) },
      },
      _sum: { balance: true },
    }),
  ]);

  const ar0To30 = Number(agingBuckets[0]._sum.balance || 0);
  const ar31To60 = Number(agingBuckets[1]._sum.balance || 0);
  const ar61To90 = Number(agingBuckets[2]._sum.balance || 0);
  const ar91To120 = Number(agingBuckets[3]._sum.balance || 0);
  const arOver120 = Number(agingBuckets[4]._sum.balance || 0);
  const totalARBalance = ar0To30 + ar31To60 + ar61To90 + ar91To120 + arOver120;

  // Industry standard recovery rates by aging bucket
  const recoveryRates = [
    { bucket: '0-30 days', amount: ar0To30, recoveryRate: 0.95, expectedRecovery: ar0To30 * 0.95 },
    { bucket: '31-60 days', amount: ar31To60, recoveryRate: 0.85, expectedRecovery: ar31To60 * 0.85 },
    { bucket: '61-90 days', amount: ar61To90, recoveryRate: 0.70, expectedRecovery: ar61To90 * 0.70 },
    { bucket: '91-120 days', amount: ar91To120, recoveryRate: 0.50, expectedRecovery: ar91To120 * 0.50 },
    { bucket: 'Over 120 days', amount: arOver120, recoveryRate: 0.20, expectedRecovery: arOver120 * 0.20 },
  ];

  const totalExpectedRecovery = recoveryRates.reduce((sum, r) => sum + r.expectedRecovery, 0);

  // Calculate predicted recoveries over time
  const predictedRecovery30Days = (ar0To30 * 0.6) + (ar31To60 * 0.3);
  const predictedRecovery60Days = predictedRecovery30Days + (ar0To30 * 0.3) + (ar31To60 * 0.4) + (ar61To90 * 0.3);
  const predictedRecovery90Days = totalExpectedRecovery * 0.8;

  // Predicted write-offs
  const predictedWriteOffs = totalARBalance - totalExpectedRecovery;
  const badDebtRisk = totalARBalance > 0 ? (arOver120 / totalARBalance) * 100 : 0;

  return {
    forecastDate,
    totalARBalance,
    ar0To30,
    ar31To60,
    ar61To90,
    ar91To120,
    arOver120,
    predictedRecovery30Days,
    predictedRecovery60Days,
    predictedRecovery90Days,
    expectedRecoveryRates: recoveryRates,
    predictedWriteOffs,
    badDebtRisk,
    confidence: 0.75,
  };
}

/**
 * Predict new patient revenue impact
 */
async function predictNewPatientRevenue(
  organizationId: string,
  forecastDate: Date,
  lookbackMonths: number
): Promise<NewPatientRevenueImpact> {
  const lookbackStart = new Date(forecastDate);
  lookbackStart.setMonth(lookbackStart.getMonth() - lookbackMonths);

  // Get new patient count
  const totalNewPatients = await prisma.patient.count({
    where: {
      organizationId,
      createdAt: { gte: lookbackStart, lte: forecastDate },
    },
  });
  const avgNewPatientsPerMonth = totalNewPatients / lookbackMonths;

  // Get average revenue per new patient (first 3 months of appointments)
  const newPatientRevenue = await prisma.charge.aggregate({
    where: {
      organizationId,
      encounter: {
        patient: {
          createdAt: { gte: lookbackStart, lte: forecastDate },
        },
      },
      chargeDate: { gte: lookbackStart, lte: forecastDate },
      status: { not: ChargeStatus.VOID },
    },
    _sum: { fee: true },
    _count: true,
  });

  const totalRevenue = Number(newPatientRevenue._sum.fee || 0);
  const avgFirstVisitRevenue = totalNewPatients > 0 ? totalRevenue / totalNewPatients / 3 : 150; // Default

  // Estimate retention and lifetime value
  const retentionRate = 0.7; // Industry average
  const avgVisitsPerYear = 12;
  const avgLifetimeValue = avgFirstVisitRevenue * avgVisitsPerYear * 2 * retentionRate;

  // Project revenue
  const predictedNewPatients = Math.round(avgNewPatientsPerMonth);
  const firstMonthRevenue = predictedNewPatients * avgFirstVisitRevenue;
  const quarterlyRevenue = predictedNewPatients * 3 * avgFirstVisitRevenue * 1.5;
  const annualRevenue = predictedNewPatients * 12 * avgLifetimeValue * 0.3;

  return {
    forecastDate,
    predictedNewPatients,
    confidenceInterval: {
      min: Math.max(0, Math.round(predictedNewPatients * 0.7)),
      max: Math.round(predictedNewPatients * 1.3),
    },
    averageFirstVisitRevenue: avgFirstVisitRevenue,
    averageLifetimeValue: avgLifetimeValue,
    estimatedRetentionRate: retentionRate,
    firstMonthRevenue,
    quarterlyRevenue,
    annualRevenue,
    byReferralSource: [
      { source: 'Organic/Walk-in', expectedPatients: Math.round(predictedNewPatients * 0.4), expectedRevenue: firstMonthRevenue * 0.4 },
      { source: 'Patient Referral', expectedPatients: Math.round(predictedNewPatients * 0.3), expectedRevenue: firstMonthRevenue * 0.3 },
      { source: 'Provider Referral', expectedPatients: Math.round(predictedNewPatients * 0.2), expectedRevenue: firstMonthRevenue * 0.2 },
      { source: 'Marketing', expectedPatients: Math.round(predictedNewPatients * 0.1), expectedRevenue: firstMonthRevenue * 0.1 },
    ],
  };
}

/**
 * Generate scenario models
 */
function generateScenarios(
  baseRevenue: number,
  chargesRevenue: number,
  collectionsRevenue: number,
  arRecovery: number,
  newPatientRevenue: number
): RevenueScenarioModel[] {
  const scenarios: RevenueScenarioModel[] = [];

  // Expected scenario
  scenarios.push({
    scenario: 'expected',
    description: 'Most likely outcome based on historical trends',
    assumptions: [
      { factor: 'Patient volume', assumption: 'Continues at current rate', impact: 0 },
      { factor: 'Collection rate', assumption: 'Maintains historical average', impact: 0 },
      { factor: 'Payer mix', assumption: 'No significant changes', impact: 0 },
    ],
    totalRevenue: baseRevenue,
    chargesRevenue,
    collectionsRevenue,
    arRecovery,
    newPatientRevenue,
    varianceFromExpected: 0,
    variancePercent: 0,
    probability: 0.6,
  });

  // Optimistic scenario
  const optimisticMultiplier = 1.15;
  const optimisticRevenue = baseRevenue * optimisticMultiplier;
  scenarios.push({
    scenario: 'optimistic',
    description: 'Best case scenario with favorable conditions',
    assumptions: [
      { factor: 'Patient volume', assumption: '10% increase in new patients', impact: baseRevenue * 0.05 },
      { factor: 'Collection rate', assumption: 'Improved collections by 5%', impact: baseRevenue * 0.05 },
      { factor: 'Payer mix', assumption: 'Higher proportion of cash pay', impact: baseRevenue * 0.05 },
    ],
    totalRevenue: optimisticRevenue,
    chargesRevenue: chargesRevenue * optimisticMultiplier,
    collectionsRevenue: collectionsRevenue * 1.05,
    arRecovery: arRecovery * 1.1,
    newPatientRevenue: newPatientRevenue * 1.1,
    varianceFromExpected: optimisticRevenue - baseRevenue,
    variancePercent: (optimisticMultiplier - 1) * 100,
    probability: 0.2,
  });

  // Pessimistic scenario
  const pessimisticMultiplier = 0.85;
  const pessimisticRevenue = baseRevenue * pessimisticMultiplier;
  scenarios.push({
    scenario: 'pessimistic',
    description: 'Worst case scenario with unfavorable conditions',
    assumptions: [
      { factor: 'Patient volume', assumption: '10% decrease in appointments', impact: -baseRevenue * 0.06 },
      { factor: 'Collection rate', assumption: 'Slower collections, more denials', impact: -baseRevenue * 0.05 },
      { factor: 'AR aging', assumption: 'Increased write-offs', impact: -baseRevenue * 0.04 },
    ],
    totalRevenue: pessimisticRevenue,
    chargesRevenue: chargesRevenue * pessimisticMultiplier,
    collectionsRevenue: collectionsRevenue * 0.9,
    arRecovery: arRecovery * 0.8,
    newPatientRevenue: newPatientRevenue * 0.85,
    varianceFromExpected: pessimisticRevenue - baseRevenue,
    variancePercent: (pessimisticMultiplier - 1) * 100,
    probability: 0.2,
  });

  return scenarios;
}

/**
 * Calculate goal attainment probability
 */
function calculateGoalAttainment(
  forecastedRevenue: number,
  confidence: number,
  confidenceInterval: RevenueConfidenceInterval,
  goals: { type: 'monthly' | 'quarterly' | 'annual'; amount: number; period: string }[]
): GoalAttainmentProbability[] {
  return goals.map(goal => {
    const gap = goal.amount - forecastedRevenue;
    let probability: number;

    if (forecastedRevenue >= goal.amount) {
      probability = Math.min(0.95, 0.5 + (confidence * 0.5));
    } else if (forecastedRevenue >= confidenceInterval.p25) {
      probability = 0.25 + ((forecastedRevenue - confidenceInterval.p25) / (goal.amount - confidenceInterval.p25)) * 0.5;
    } else {
      probability = Math.max(0.05, (forecastedRevenue / goal.amount) * 0.3);
    }

    const riskFactors: string[] = [];
    const opportunities: string[] = [];

    if (gap > 0) {
      if (gap > forecastedRevenue * 0.2) {
        riskFactors.push('Significant gap between forecast and goal');
      }
      if (confidence < 0.7) {
        riskFactors.push('Low forecast confidence due to limited historical data');
      }
      opportunities.push('Increase patient volume through marketing');
      opportunities.push('Improve collection rates on outstanding AR');
      opportunities.push('Add new service offerings');
    }

    const suggestedActions = [];
    if (gap > 0) {
      suggestedActions.push({
        action: 'Run patient reactivation campaign',
        estimatedImpact: gap * 0.15,
        difficulty: 'easy' as const,
      });
      suggestedActions.push({
        action: 'Increase appointment availability',
        estimatedImpact: gap * 0.25,
        difficulty: 'medium' as const,
      });
      suggestedActions.push({
        action: 'Launch referral program',
        estimatedImpact: gap * 0.2,
        difficulty: 'medium' as const,
      });
    }

    return {
      goalType: goal.type,
      goalAmount: goal.amount,
      period: goal.period,
      predictedAmount: forecastedRevenue,
      gap: Math.max(0, gap),
      probability,
      riskFactors,
      opportunities,
      suggestedActions,
    };
  });
}

/**
 * Main function: Forecast revenue for an organization
 */
export async function forecastRevenue(
  organizationId: string,
  config: Partial<RevenueForecastConfig> = {},
  options: {
    goals?: { type: 'monthly' | 'quarterly' | 'annual'; amount: number; period: string }[];
  } = {}
): Promise<RevenueForecastResult> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  // Calculate date ranges
  const forecastStartDate = new Date();
  forecastStartDate.setHours(0, 0, 0, 0);
  forecastStartDate.setDate(1); // Start of current month

  const forecastEndDate = new Date(forecastStartDate);
  forecastEndDate.setMonth(forecastEndDate.getMonth() + finalConfig.forecastHorizonMonths);

  const lookbackStartDate = new Date(forecastStartDate);
  lookbackStartDate.setMonth(lookbackStartDate.getMonth() - finalConfig.lookbackMonths);

  // Fetch historical charges
  const historicalCharges = await prisma.charge.findMany({
    where: {
      organizationId,
      chargeDate: { gte: lookbackStartDate, lte: forecastStartDate },
      status: { not: ChargeStatus.VOID },
    },
    select: {
      chargeDate: true,
      fee: true,
      payments: true,
      balance: true,
      status: true,
    },
    orderBy: { chargeDate: 'asc' },
  });

  // Fetch historical payments
  const historicalPayments = await prisma.payment.findMany({
    where: {
      organizationId,
      paymentDate: { gte: lookbackStartDate, lte: forecastStartDate },
      isVoid: false,
    },
    select: {
      paymentDate: true,
      amount: true,
      payerType: true,
    },
    orderBy: { paymentDate: 'asc' },
  });

  // Group charges by date and month
  const chargesByDate = new Map<string, number>();
  const chargesByMonth = new Map<string, number>();

  for (const charge of historicalCharges) {
    const dateKey = charge.chargeDate.toISOString().split('T')[0];
    const monthKey = `${charge.chargeDate.getFullYear()}-${String(charge.chargeDate.getMonth() + 1).padStart(2, '0')}`;

    chargesByDate.set(dateKey, (chargesByDate.get(dateKey) || 0) + Number(charge.fee));
    chargesByMonth.set(monthKey, (chargesByMonth.get(monthKey) || 0) + Number(charge.fee));
  }

  // Group payments by date and month
  const paymentsByDate = new Map<string, number>();
  const paymentsByMonth = new Map<string, number>();

  for (const payment of historicalPayments) {
    const dateKey = payment.paymentDate.toISOString().split('T')[0];
    const monthKey = `${payment.paymentDate.getFullYear()}-${String(payment.paymentDate.getMonth() + 1).padStart(2, '0')}`;

    paymentsByDate.set(dateKey, (paymentsByDate.get(dateKey) || 0) + Number(payment.amount));
    paymentsByMonth.set(monthKey, (paymentsByMonth.get(monthKey) || 0) + Number(payment.amount));
  }

  // Calculate revenue by date (charges + payments for combined view)
  const revenueByDate = new Map<string, number>();
  for (const [date, charges] of chargesByDate) {
    revenueByDate.set(date, charges);
  }

  // Calculate totals
  const totalHistoricalCharges = Array.from(chargesByMonth.values()).reduce((a, b) => a + b, 0);
  const totalHistoricalPayments = Array.from(paymentsByMonth.values()).reduce((a, b) => a + b, 0);
  const totalDays = Math.ceil((forecastStartDate.getTime() - lookbackStartDate.getTime()) / (1000 * 60 * 60 * 24));

  const avgDailyCharges = totalHistoricalCharges / totalDays;
  const avgDailyCollections = totalHistoricalPayments / totalDays;
  const avgMonthlyCharges = totalHistoricalCharges / finalConfig.lookbackMonths;
  const avgMonthlyCollections = totalHistoricalPayments / finalConfig.lookbackMonths;

  // Calculate factors
  const dayOfWeekFactors = calculateDayOfWeekFactors(revenueByDate, totalDays);
  const seasonalFactors = calculateSeasonalFactors(chargesByMonth);

  // Get AR recovery prediction
  const arRecoveryPrediction = await predictARRecovery(organizationId, forecastStartDate);

  // Get new patient revenue impact
  const newPatientImpact = await predictNewPatientRevenue(organizationId, forecastStartDate, finalConfig.lookbackMonths);

  // Generate daily forecasts
  const dailyForecasts: DailyRevenueForecast[] = [];
  const historicalDailyValues = Array.from(chargesByDate.values());

  let currentDate = new Date(forecastStartDate);
  currentDate.setDate(currentDate.getDate() + 1); // Start tomorrow

  const dailyEndDate = new Date(forecastStartDate);
  dailyEndDate.setMonth(dailyEndDate.getMonth() + 1); // 30 days of daily forecasts

  while (currentDate <= dailyEndDate) {
    const dayOfWeek = currentDate.getDay();
    const dayOfWeekFactor = dayOfWeekFactors.get(dayOfWeek) || 1;
    const month = currentDate.getMonth() + 1;
    const seasonalFactor = seasonalFactors.get(month) || 1;

    const { isHoliday: isHol, holidayName } = isHoliday(currentDate);
    const holidayFactor = isHol ? 0.2 : 1;

    const predictedCharges = Math.round(avgDailyCharges * dayOfWeekFactor * seasonalFactor * holidayFactor);
    const predictedCollections = Math.round(avgDailyCollections * dayOfWeekFactor * seasonalFactor * holidayFactor);
    const predictedRevenue = predictedCharges;

    const confidence = Math.min(0.9, 0.5 + (historicalCharges.length / 500) * 0.4);

    dailyForecasts.push({
      date: new Date(currentDate),
      dayOfWeek,
      dayName: DAY_NAMES[dayOfWeek],
      predictedRevenue,
      predictedCharges,
      predictedCollections,
      confidenceInterval: calculateConfidenceInterval(predictedRevenue, historicalDailyValues, finalConfig.confidenceLevel),
      confidence,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      isHoliday: isHol,
      holidayName,
      seasonalFactor,
      dayOfWeekFactor,
      sameWeekdayAverage: avgDailyCharges * dayOfWeekFactor,
      varianceFromAverage: predictedRevenue - (avgDailyCharges * dayOfWeekFactor),
    });

    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Generate weekly forecasts
  const weeklyForecasts: WeeklyRevenueForecast[] = [];
  const weeks: Map<string, DailyRevenueForecast[]> = new Map();

  for (const daily of dailyForecasts) {
    const date = new Date(daily.date);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const weekKey = weekStart.toISOString().split('T')[0];

    if (!weeks.has(weekKey)) {
      weeks.set(weekKey, []);
    }
    weeks.get(weekKey)!.push(daily);
  }

  for (const [weekKey, days] of weeks) {
    const weekStart = new Date(weekKey);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const totalRevenue = days.reduce((sum, d) => sum + d.predictedRevenue, 0);
    const totalCharges = days.reduce((sum, d) => sum + d.predictedCharges, 0);
    const totalCollections = days.reduce((sum, d) => sum + d.predictedCollections, 0);
    const avgConfidence = days.reduce((sum, d) => sum + d.confidence, 0) / days.length;

    const sortedByRevenue = [...days].sort((a, b) => b.predictedRevenue - a.predictedRevenue);

    const startOfYear = new Date(weekStart.getFullYear(), 0, 1);
    const daysSinceStart = Math.floor((weekStart.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
    const weekNumber = Math.ceil((daysSinceStart + startOfYear.getDay() + 1) / 7);

    weeklyForecasts.push({
      weekStartDate: weekStart,
      weekEndDate: weekEnd,
      weekNumber,
      year: weekStart.getFullYear(),
      predictedRevenue: totalRevenue,
      predictedCharges: totalCharges,
      predictedCollections: totalCollections,
      confidenceInterval: {
        min: days.reduce((sum, d) => sum + d.confidenceInterval.min, 0),
        max: days.reduce((sum, d) => sum + d.confidenceInterval.max, 0),
        p25: days.reduce((sum, d) => sum + d.confidenceInterval.p25, 0),
        p50: days.reduce((sum, d) => sum + d.confidenceInterval.p50, 0),
        p75: days.reduce((sum, d) => sum + d.confidenceInterval.p75, 0),
      },
      confidence: avgConfidence,
      dailyForecasts: days,
      peakDay: sortedByRevenue[0]?.dayName || 'Unknown',
      lowestDay: sortedByRevenue[sortedByRevenue.length - 1]?.dayName || 'Unknown',
    });
  }

  // Generate monthly forecasts
  const monthlyForecasts: MonthlyRevenueForecast[] = [];
  const historicalMonthlyValues = Array.from(chargesByMonth.values());

  for (let i = 0; i < finalConfig.forecastHorizonMonths; i++) {
    const forecastMonth = new Date(forecastStartDate);
    forecastMonth.setMonth(forecastMonth.getMonth() + i);

    const month = forecastMonth.getMonth() + 1;
    const year = forecastMonth.getFullYear();
    const seasonalFactor = seasonalFactors.get(month) || 1;

    const predictedCharges = Math.round(avgMonthlyCharges * seasonalFactor);
    const predictedCollections = Math.round(avgMonthlyCollections * seasonalFactor);
    const arRecovery = Math.round(arRecoveryPrediction.predictedRecovery30Days * (1 / finalConfig.forecastHorizonMonths));
    const newPatientRev = Math.round(newPatientImpact.firstMonthRevenue);
    const predictedRevenue = predictedCharges;

    // Get monthly weeks
    const monthWeeks = weeklyForecasts.filter(w =>
      w.weekStartDate.getMonth() === forecastMonth.getMonth() &&
      w.weekStartDate.getFullYear() === forecastMonth.getFullYear()
    );

    // Calculate trend
    const prevMonth = i > 0 ? monthlyForecasts[i - 1] : null;
    const monthOverMonthChange = prevMonth
      ? ((predictedRevenue - prevMonth.predictedRevenue) / prevMonth.predictedRevenue) * 100
      : 0;

    let trend: TrendDirection = TrendDirection.STABLE;
    if (monthOverMonthChange > 5) trend = TrendDirection.INCREASING;
    else if (monthOverMonthChange < -5) trend = TrendDirection.DECREASING;

    // Year over year comparison
    const sameMonthLastYear = chargesByMonth.get(`${year - 1}-${String(month).padStart(2, '0')}`);
    const yearOverYearChange = sameMonthLastYear
      ? ((predictedRevenue - sameMonthLastYear) / sameMonthLastYear) * 100
      : null;

    const confidence = Math.min(0.85, 0.5 + (historicalCharges.length / 1000) * 0.35);

    monthlyForecasts.push({
      month,
      year,
      monthName: MONTH_NAMES[month - 1],
      predictedRevenue,
      predictedCharges,
      predictedCollections,
      arRecovery,
      newPatientRevenue: newPatientRev,
      confidenceInterval: calculateConfidenceInterval(predictedRevenue, historicalMonthlyValues, finalConfig.confidenceLevel),
      confidence,
      weeklyForecasts: monthWeeks,
      trend,
      monthOverMonthChange,
      yearOverYearChange,
      seasonalFactor,
    });
  }

  // Calculate totals
  const totalPredictedCharges = monthlyForecasts.reduce((sum, m) => sum + m.predictedCharges, 0);
  const totalPredictedCollections = monthlyForecasts.reduce((sum, m) => sum + m.predictedCollections, 0);
  const totalARRecovery = arRecoveryPrediction.predictedRecovery90Days;
  const totalNewPatientRevenue = newPatientImpact.quarterlyRevenue;
  const totalPredictedRevenue = totalPredictedCharges;
  const averageMonthlyRevenue = totalPredictedRevenue / finalConfig.forecastHorizonMonths;

  // Generate collections forecast
  const collectionsForecast: CollectionsForecast[] = monthlyForecasts.map(m => ({
    forecastDate: new Date(m.year, m.month - 1, 1),
    predictedCollections: m.predictedCollections,
    confidenceInterval: m.confidenceInterval,
    confidence: m.confidence,
    fromPatients: Math.round(m.predictedCollections * 0.3),
    fromInsurance: Math.round(m.predictedCollections * 0.65),
    fromOther: Math.round(m.predictedCollections * 0.05),
    sameMonthLastYear: chargesByMonth.get(`${m.year - 1}-${String(m.month).padStart(2, '0')}`) || null,
    monthOverMonthChange: m.monthOverMonthChange,
    yearOverYearChange: m.yearOverYearChange,
  }));

  // Generate scenarios
  const scenarios = finalConfig.includeScenarios
    ? generateScenarios(
        totalPredictedRevenue,
        totalPredictedCharges,
        totalPredictedCollections,
        totalARRecovery,
        totalNewPatientRevenue
      )
    : [];

  const expectedScenario = scenarios.find(s => s.scenario === 'expected') || scenarios[0];

  // Overall confidence interval
  const overallConfidenceInterval = calculateConfidenceInterval(
    totalPredictedRevenue,
    historicalMonthlyValues.map(v => v * finalConfig.forecastHorizonMonths),
    finalConfig.confidenceLevel
  );

  // Goal attainment
  const defaultGoals = options.goals || [
    { type: 'monthly' as const, amount: averageMonthlyRevenue * 1.1, period: MONTH_NAMES[forecastStartDate.getMonth()] },
    { type: 'quarterly' as const, amount: totalPredictedRevenue * 1.1, period: `Q${Math.ceil((forecastStartDate.getMonth() + 1) / 3)}` },
  ];

  const goalAttainment = calculateGoalAttainment(
    totalPredictedRevenue,
    monthlyForecasts[0]?.confidence || 0.7,
    overallConfidenceInterval,
    defaultGoals
  );

  // Historical variance (simplified)
  const historicalVariance: RevenueVarianceAnalysis[] = [];

  // Overall confidence
  const overallConfidence = historicalCharges.length >= finalConfig.minDataPoints
    ? Math.min(0.85, 0.5 + (historicalCharges.length / 500) * 0.35)
    : 0.5;

  return {
    organizationId,
    forecastStartDate,
    forecastEndDate,
    granularity: 'monthly' as RevenueForecastGranularity,
    totalPredictedRevenue,
    totalPredictedCharges,
    totalPredictedCollections,
    totalARRecovery,
    totalNewPatientRevenue,
    averageMonthlyRevenue,
    confidence: overallConfidence,
    dailyForecasts,
    weeklyForecasts: weeklyForecasts.sort((a, b) => a.weekStartDate.getTime() - b.weekStartDate.getTime()),
    monthlyForecasts,
    collectionsForecast,
    arRecoveryPrediction,
    newPatientImpact,
    scenarios,
    expectedScenario,
    overallConfidenceInterval,
    historicalVariance,
    goalAttainment,
    modelVersion: MODEL_VERSION,
    dataPointsUsed: historicalCharges.length,
    forecastGeneratedAt: new Date(),
    validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Valid for 7 days
  };
}

/**
 * Save revenue forecast to database
 */
export async function saveRevenueForecast(
  organizationId: string,
  forecast: RevenueForecastResult
): Promise<void> {
  // Save as a Prediction record
  await prisma.prediction.create({
    data: {
      predictionType: PredictionType.REVENUE,
      status: PredictionStatus.PENDING,
      targetEntityType: 'Organization',
      targetEntityId: organizationId,
      prediction: {
        totalPredictedRevenue: forecast.totalPredictedRevenue,
        totalPredictedCharges: forecast.totalPredictedCharges,
        totalPredictedCollections: forecast.totalPredictedCollections,
        totalARRecovery: forecast.totalARRecovery,
        totalNewPatientRevenue: forecast.totalNewPatientRevenue,
        averageMonthlyRevenue: forecast.averageMonthlyRevenue,
        scenarios: forecast.scenarios.map(s => ({
          scenario: s.scenario,
          totalRevenue: s.totalRevenue,
          probability: s.probability,
        })),
        goalAttainment: forecast.goalAttainment.map(g => ({
          goalType: g.goalType,
          goalAmount: g.goalAmount,
          probability: g.probability,
        })),
      } as unknown as Prisma.InputJsonValue,
      confidence: forecast.confidence,
      confidenceLevel: forecast.confidence >= 0.8 ? 'high' : forecast.confidence >= 0.6 ? 'medium' : 'low',
      modelName: 'RevenueForecast',
      modelVersion: forecast.modelVersion,
      features: {
        lookbackMonths: 12,
        forecastHorizonMonths: 3,
        dataPointsUsed: forecast.dataPointsUsed,
      } as unknown as Prisma.InputJsonValue,
      predictionDate: forecast.forecastGeneratedAt,
      validFrom: forecast.forecastStartDate,
      validUntil: forecast.validUntil,
      horizon: `${3}mo`,
      organizationId,
    },
  });
}

/**
 * Track revenue forecast accuracy
 */
export async function trackRevenueForecastAccuracy(
  organizationId: string,
  period: { year: number; month: number }
): Promise<RevenueForecastAccuracyMetrics | null> {
  const periodStart = new Date(period.year, period.month - 1, 1);
  const periodEnd = new Date(period.year, period.month, 0);

  // Get the forecast for this period
  const forecast = await prisma.prediction.findFirst({
    where: {
      organizationId,
      predictionType: PredictionType.REVENUE,
      validFrom: { lte: periodStart },
      validUntil: { gte: periodEnd },
    },
    orderBy: { predictionDate: 'desc' },
  });

  if (!forecast) return null;

  // Get actual revenue
  const actualCharges = await prisma.charge.aggregate({
    where: {
      organizationId,
      chargeDate: { gte: periodStart, lte: periodEnd },
      status: { not: ChargeStatus.VOID },
    },
    _sum: { fee: true },
  });

  const actualCollections = await prisma.payment.aggregate({
    where: {
      organizationId,
      paymentDate: { gte: periodStart, lte: periodEnd },
      isVoid: false,
    },
    _sum: { amount: true },
  });

  const actualRevenue = Number(actualCharges._sum.fee || 0);
  const actualPayments = Number(actualCollections._sum.amount || 0);

  const predictionData = forecast.prediction as { totalPredictedRevenue?: number; totalPredictedCharges?: number; totalPredictedCollections?: number };
  const predictedRevenue = predictionData.totalPredictedRevenue || 0;
  const predictedCharges = predictionData.totalPredictedCharges || 0;
  const predictedCollections = predictionData.totalPredictedCollections || 0;

  const variance = actualRevenue - predictedRevenue;
  const variancePercent = predictedRevenue > 0 ? (variance / predictedRevenue) * 100 : 0;
  const mape = predictedRevenue > 0 ? Math.abs(variance / predictedRevenue) * 100 : 0;
  const rmse = Math.sqrt(Math.pow(variance, 2));

  // Update prediction with actual outcome
  await prisma.prediction.update({
    where: { id: forecast.id },
    data: {
      status: PredictionStatus.VALIDATED,
      actualOutcome: {
        actualRevenue,
        actualCharges: Number(actualCharges._sum.fee || 0),
        actualCollections: actualPayments,
      } as unknown as Prisma.InputJsonValue,
      outcomeDate: new Date(),
      wasAccurate: Math.abs(variancePercent) <= 15,
      accuracyScore: Math.max(0, 1 - Math.abs(variancePercent) / 100),
    },
  });

  return {
    period: `${period.year}-${String(period.month).padStart(2, '0')}`,
    granularity: 'monthly',
    predictedRevenue,
    actualRevenue,
    variance,
    variancePercent,
    chargesAccuracy: {
      predicted: predictedCharges,
      actual: Number(actualCharges._sum.fee || 0),
      variance: Number(actualCharges._sum.fee || 0) - predictedCharges,
    },
    collectionsAccuracy: {
      predicted: predictedCollections,
      actual: actualPayments,
      variance: actualPayments - predictedCollections,
    },
    arRecoveryAccuracy: {
      predicted: 0,
      actual: 0,
      variance: 0,
    },
    mape,
    rmse,
    withinConfidenceInterval: Math.abs(variancePercent) <= 15,
    scenarioAccuracy: [],
  };
}

/**
 * Get revenue forecast accuracy summary
 */
export async function getRevenueForecastAccuracySummary(
  organizationId: string,
  lookbackMonths: number = 6
): Promise<{
  totalForecasts: number;
  validatedForecasts: number;
  averageMape: number;
  averageVariancePercent: number;
  withinConfidenceRate: number;
}> {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - lookbackMonths);

  const forecasts = await prisma.prediction.findMany({
    where: {
      organizationId,
      predictionType: PredictionType.REVENUE,
      predictionDate: { gte: startDate },
      status: PredictionStatus.VALIDATED,
    },
    select: {
      prediction: true,
      actualOutcome: true,
      wasAccurate: true,
      accuracyScore: true,
    },
  });

  const totalForecasts = await prisma.prediction.count({
    where: {
      organizationId,
      predictionType: PredictionType.REVENUE,
      predictionDate: { gte: startDate },
    },
  });

  const validatedForecasts = forecasts.length;

  if (validatedForecasts === 0) {
    return {
      totalForecasts,
      validatedForecasts: 0,
      averageMape: 0,
      averageVariancePercent: 0,
      withinConfidenceRate: 0,
    };
  }

  let totalMape = 0;
  let totalVariancePercent = 0;
  let accurateCount = 0;

  for (const f of forecasts) {
    const pred = f.prediction as { totalPredictedRevenue?: number };
    const actual = f.actualOutcome as { actualRevenue?: number };

    if (pred.totalPredictedRevenue && actual.actualRevenue) {
      const variance = actual.actualRevenue - pred.totalPredictedRevenue;
      const variancePercent = Math.abs(variance / pred.totalPredictedRevenue) * 100;
      totalMape += variancePercent;
      totalVariancePercent += variancePercent;
    }

    if (f.wasAccurate) {
      accurateCount++;
    }
  }

  return {
    totalForecasts,
    validatedForecasts,
    averageMape: totalMape / validatedForecasts,
    averageVariancePercent: totalVariancePercent / validatedForecasts,
    withinConfidenceRate: (accurateCount / validatedForecasts) * 100,
  };
}
