// Demand Forecasting - Epic 40: AI Predictive Analytics Agent
// Predicts future appointment demand with seasonal patterns and staffing recommendations

import { prisma } from '@/lib/prisma';
import { AppointmentStatus, TrendDirection } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import type {
  DemandForecastConfig,
  DemandForecastResult,
  DailyForecast,
  WeeklyForecast,
  MonthlyForecast,
  AppointmentTypeForecast,
  ProviderForecast,
  SeasonalPattern,
  DayOfWeekFactor,
  HolidayImpact,
  StaffingRecommendation,
  CapacityPlanningInsight,
  EventImpactModel,
  ForecastConfidenceInterval,
  ForecastGranularity,
  ForecastAccuracyMetrics,
} from './types';

// Default configuration
const DEFAULT_CONFIG: DemandForecastConfig = {
  lookbackWeeks: 12,
  forecastHorizonDays: 30,
  minDataPoints: 10,
  includeSeasonalFactors: true,
  includeDayOfWeekFactors: true,
  includeHolidayFactors: true,
  confidenceLevel: 0.95,
};

const MODEL_VERSION = '1.0.0';

// US Federal holidays (simplified)
const US_HOLIDAYS_2024_2025 = [
  { name: "New Year's Day", dates: ['2024-01-01', '2025-01-01', '2026-01-01'] },
  { name: 'Martin Luther King Jr. Day', dates: ['2024-01-15', '2025-01-20', '2026-01-19'] },
  { name: "Presidents' Day", dates: ['2024-02-19', '2025-02-17', '2026-02-16'] },
  { name: 'Memorial Day', dates: ['2024-05-27', '2025-05-26', '2026-05-25'] },
  { name: 'Independence Day', dates: ['2024-07-04', '2025-07-04', '2026-07-04'] },
  { name: 'Labor Day', dates: ['2024-09-02', '2025-09-01', '2026-09-07'] },
  { name: 'Columbus Day', dates: ['2024-10-14', '2025-10-13', '2026-10-12'] },
  { name: 'Veterans Day', dates: ['2024-11-11', '2025-11-11', '2026-11-11'] },
  { name: 'Thanksgiving', dates: ['2024-11-28', '2025-11-27', '2026-11-26'] },
  { name: 'Christmas Day', dates: ['2024-12-25', '2025-12-25', '2026-12-25'] },
];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Get holidays for a date range
 */
function getHolidaysInRange(startDate: Date, endDate: Date): { name: string; date: Date }[] {
  const holidays: { name: string; date: Date }[] = [];

  for (const holiday of US_HOLIDAYS_2024_2025) {
    for (const dateStr of holiday.dates) {
      const date = new Date(dateStr);
      if (date >= startDate && date <= endDate) {
        holidays.push({ name: holiday.name, date });
      }
    }
  }

  return holidays;
}

/**
 * Check if a date is a holiday
 */
function isHoliday(date: Date): { isHoliday: boolean; holidayName: string | null } {
  const dateStr = date.toISOString().split('T')[0];

  for (const holiday of US_HOLIDAYS_2024_2025) {
    if (holiday.dates.includes(dateStr)) {
      return { isHoliday: true, holidayName: holiday.name };
    }
  }

  return { isHoliday: false, holidayName: null };
}

/**
 * Calculate day of week factors from historical data
 */
function calculateDayOfWeekFactors(
  appointments: { startTime: Date }[],
  totalDays: number
): DayOfWeekFactor[] {
  const dayData: Record<number, number[]> = {
    0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [],
  };

  // Group appointments by day of week
  for (const apt of appointments) {
    const dayOfWeek = new Date(apt.startTime).getDay();
    const dateKey = apt.startTime.toISOString().split('T')[0];

    // Count per day
    if (!dayData[dayOfWeek].includes(dateKey as unknown as number)) {
      dayData[dayOfWeek].push(1);
    } else {
      const lastIdx = dayData[dayOfWeek].length - 1;
      dayData[dayOfWeek][lastIdx]++;
    }
  }

  // Calculate actual daily counts
  const dailyCounts: Record<number, number[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  const byDate: Record<string, number> = {};

  for (const apt of appointments) {
    const dateKey = apt.startTime.toISOString().split('T')[0];
    byDate[dateKey] = (byDate[dateKey] || 0) + 1;
  }

  for (const [dateKey, count] of Object.entries(byDate)) {
    const dayOfWeek = new Date(dateKey).getDay();
    dailyCounts[dayOfWeek].push(count);
  }

  // Calculate averages and factors
  const totalAppointments = appointments.length;
  const avgPerDay = totalAppointments / totalDays;

  const factors: DayOfWeekFactor[] = [];

  for (let day = 0; day < 7; day++) {
    const counts = dailyCounts[day];
    const avgForDay = counts.length > 0
      ? counts.reduce((a, b) => a + b, 0) / counts.length
      : 0;
    const factor = avgPerDay > 0 ? avgForDay / avgPerDay : 1;

    let description = '';
    if (factor >= 1.2) {
      description = `High volume day (${(factor * 100 - 100).toFixed(0)}% above average)`;
    } else if (factor <= 0.8) {
      description = `Low volume day (${(100 - factor * 100).toFixed(0)}% below average)`;
    } else {
      description = 'Average volume day';
    }

    factors.push({
      dayOfWeek: day,
      dayName: DAY_NAMES[day],
      factor,
      averageVolume: avgForDay,
      description,
    });
  }

  return factors;
}

/**
 * Detect seasonal patterns
 */
function detectSeasonalPatterns(
  appointments: { startTime: Date }[],
  lookbackWeeks: number
): SeasonalPattern[] {
  const patterns: SeasonalPattern[] = [];

  // Weekly pattern - day of week analysis
  const dayOfWeekCounts: number[] = [0, 0, 0, 0, 0, 0, 0];
  for (const apt of appointments) {
    dayOfWeekCounts[new Date(apt.startTime).getDay()]++;
  }

  const avgDayCount = dayOfWeekCounts.reduce((a, b) => a + b, 0) / 7;
  const peakDays = DAY_NAMES.filter((_, i) => dayOfWeekCounts[i] > avgDayCount * 1.1);
  const troughDays = DAY_NAMES.filter((_, i) => dayOfWeekCounts[i] < avgDayCount * 0.9);

  const maxDayCount = Math.max(...dayOfWeekCounts);
  const minDayCount = Math.min(...dayOfWeekCounts.filter(c => c > 0));
  const weeklyStrength = maxDayCount > 0 ? (maxDayCount - minDayCount) / maxDayCount : 0;

  if (weeklyStrength > 0.2) {
    patterns.push({
      pattern: 'weekly',
      strength: weeklyStrength,
      peakPeriods: peakDays,
      troughPeriods: troughDays,
      description: `Weekly pattern detected: Peak on ${peakDays.join(', ')}, lowest on ${troughDays.join(', ')}`,
    });
  }

  // Monthly pattern (if enough data)
  if (lookbackWeeks >= 12) {
    const monthCounts: number[] = new Array(12).fill(0);
    for (const apt of appointments) {
      monthCounts[new Date(apt.startTime).getMonth()]++;
    }

    const avgMonthCount = monthCounts.reduce((a, b) => a + b, 0) / 12;
    const peakMonths = MONTH_NAMES.filter((_, i) => monthCounts[i] > avgMonthCount * 1.15);
    const troughMonths = MONTH_NAMES.filter((_, i) => monthCounts[i] < avgMonthCount * 0.85 && monthCounts[i] > 0);

    const maxMonthCount = Math.max(...monthCounts);
    const minMonthCount = Math.min(...monthCounts.filter(c => c > 0));
    const monthlyStrength = maxMonthCount > 0 ? (maxMonthCount - minMonthCount) / maxMonthCount : 0;

    if (monthlyStrength > 0.2 && peakMonths.length > 0) {
      patterns.push({
        pattern: 'yearly',
        strength: monthlyStrength,
        peakPeriods: peakMonths,
        troughPeriods: troughMonths,
        description: `Seasonal pattern detected: Higher volume in ${peakMonths.join(', ')}`,
      });
    }
  }

  return patterns;
}

/**
 * Calculate holiday impacts from historical data
 */
function calculateHolidayImpacts(
  appointments: { startTime: Date }[],
  startDate: Date,
  endDate: Date
): HolidayImpact[] {
  const impacts: HolidayImpact[] = [];

  // Get holidays that occurred in the historical period
  const historicalHolidays = getHolidaysInRange(startDate, endDate);

  // Calculate average daily volume
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const avgDailyVolume = appointments.length / totalDays;

  // For each holiday, calculate the impact
  for (const holiday of historicalHolidays) {
    const holidayDate = holiday.date;

    // Count appointments on the holiday
    const holidayAppointments = appointments.filter(apt => {
      const aptDate = apt.startTime.toISOString().split('T')[0];
      const holidayDateStr = holidayDate.toISOString().split('T')[0];
      return aptDate === holidayDateStr;
    });

    const holidayVolume = holidayAppointments.length;
    const impactFactor = avgDailyVolume > 0 ? holidayVolume / avgDailyVolume : 0;

    // Most holidays reduce volume
    const isReduced = impactFactor < 0.7;

    impacts.push({
      holiday: holiday.name,
      date: holidayDate,
      impactFactor,
      daysBeforeAffected: isReduced ? 1 : 0,
      daysAfterAffected: isReduced ? 1 : 0,
      description: isReduced
        ? `${holiday.name} typically reduces volume by ${((1 - impactFactor) * 100).toFixed(0)}%`
        : `${holiday.name} has minimal impact on volume`,
    });
  }

  return impacts;
}

/**
 * Calculate confidence interval for a predicted value
 */
function calculateConfidenceInterval(
  mean: number,
  historicalValues: number[],
  confidenceLevel: number
): ForecastConfidenceInterval {
  if (historicalValues.length === 0) {
    return { min: mean * 0.7, max: mean * 1.3, p25: mean * 0.85, p50: mean, p75: mean * 1.15 };
  }

  const sorted = [...historicalValues].sort((a, b) => a - b);
  const n = sorted.length;

  // Calculate standard deviation
  const variance = historicalValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  // Z-score for confidence level (simplified)
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
 * Generate daily forecasts
 */
function generateDailyForecasts(
  startDate: Date,
  endDate: Date,
  avgDailyVolume: number,
  dayOfWeekFactors: DayOfWeekFactor[],
  holidayImpacts: HolidayImpact[],
  historicalDailyCounts: number[],
  config: DemandForecastConfig
): DailyForecast[] {
  const forecasts: DailyForecast[] = [];
  const currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay();
    const dayFactor = dayOfWeekFactors.find(f => f.dayOfWeek === dayOfWeek);
    const dayOfWeekFactor = dayFactor?.factor || 1;

    // Check for holiday
    const { isHoliday: isHol, holidayName } = isHoliday(currentDate);
    let holidayImpact: number | null = null;

    if (isHol) {
      const impact = holidayImpacts.find(h => h.holiday === holidayName);
      holidayImpact = impact?.impactFactor || 0.3; // Default to 70% reduction for holidays
    }

    // Seasonal factor (simplified - assume 1.0 for now)
    const seasonalFactor = 1.0;

    // Calculate predicted volume
    let predictedVolume = avgDailyVolume * dayOfWeekFactor * seasonalFactor;
    if (holidayImpact !== null) {
      predictedVolume *= holidayImpact;
    }
    predictedVolume = Math.round(predictedVolume);

    // Calculate confidence
    const confidence = Math.min(0.95, 0.6 + (historicalDailyCounts.length / 100) * 0.35);

    const forecast: DailyForecast = {
      date: new Date(currentDate),
      dayOfWeek,
      dayName: DAY_NAMES[dayOfWeek],
      predictedVolume,
      confidenceInterval: calculateConfidenceInterval(
        predictedVolume,
        historicalDailyCounts.filter(c => c > 0),
        config.confidenceLevel
      ),
      confidence,
      seasonalFactor,
      dayOfWeekFactor,
      holidayImpact,
      holidayName,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      isHoliday: isHol,
      sameWeekdayAverage: dayFactor?.averageVolume || avgDailyVolume,
      varianceFromAverage: predictedVolume - (dayFactor?.averageVolume || avgDailyVolume),
    };

    forecasts.push(forecast);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return forecasts;
}

/**
 * Group daily forecasts into weekly forecasts
 */
function generateWeeklyForecasts(dailyForecasts: DailyForecast[]): WeeklyForecast[] {
  const weeklyForecasts: WeeklyForecast[] = [];
  const weeks: Map<string, DailyForecast[]> = new Map();

  // Group by week
  for (const daily of dailyForecasts) {
    const date = new Date(daily.date);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
    const weekKey = weekStart.toISOString().split('T')[0];

    if (!weeks.has(weekKey)) {
      weeks.set(weekKey, []);
    }
    weeks.get(weekKey)!.push(daily);
  }

  // Create weekly forecasts
  for (const [weekKey, days] of weeks) {
    const weekStart = new Date(weekKey);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const totalVolume = days.reduce((sum, d) => sum + d.predictedVolume, 0);
    const avgConfidence = days.reduce((sum, d) => sum + d.confidence, 0) / days.length;

    // Find peak and lowest days
    const sortedByVolume = [...days].sort((a, b) => b.predictedVolume - a.predictedVolume);
    const peakDay = sortedByVolume[0]?.dayName || 'Unknown';
    const lowestDay = sortedByVolume[sortedByVolume.length - 1]?.dayName || 'Unknown';

    // Week number calculation
    const startOfYear = new Date(weekStart.getFullYear(), 0, 1);
    const daysSinceStart = Math.floor((weekStart.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
    const weekNumber = Math.ceil((daysSinceStart + startOfYear.getDay() + 1) / 7);

    weeklyForecasts.push({
      weekStartDate: weekStart,
      weekEndDate: weekEnd,
      weekNumber,
      year: weekStart.getFullYear(),
      predictedVolume: totalVolume,
      confidenceInterval: {
        min: days.reduce((sum, d) => sum + d.confidenceInterval.min, 0),
        max: days.reduce((sum, d) => sum + d.confidenceInterval.max, 0),
        p25: days.reduce((sum, d) => sum + d.confidenceInterval.p25, 0),
        p50: days.reduce((sum, d) => sum + d.confidenceInterval.p50, 0),
        p75: days.reduce((sum, d) => sum + d.confidenceInterval.p75, 0),
      },
      confidence: avgConfidence,
      dailyForecasts: days,
      peakDay,
      lowestDay,
    });
  }

  return weeklyForecasts.sort((a, b) => a.weekStartDate.getTime() - b.weekStartDate.getTime());
}

/**
 * Group weekly forecasts into monthly forecasts
 */
function generateMonthlyForecasts(weeklyForecasts: WeeklyForecast[]): MonthlyForecast[] {
  const monthlyForecasts: MonthlyForecast[] = [];
  const months: Map<string, WeeklyForecast[]> = new Map();

  // Group by month
  for (const weekly of weeklyForecasts) {
    const monthKey = `${weekly.year}-${String(weekly.weekStartDate.getMonth() + 1).padStart(2, '0')}`;

    if (!months.has(monthKey)) {
      months.set(monthKey, []);
    }
    months.get(monthKey)!.push(weekly);
  }

  // Create monthly forecasts
  for (const [monthKey, weeks] of months) {
    const [year, month] = monthKey.split('-').map(Number);

    const totalVolume = weeks.reduce((sum, w) => sum + w.predictedVolume, 0);
    const avgConfidence = weeks.reduce((sum, w) => sum + w.confidence, 0) / weeks.length;

    monthlyForecasts.push({
      month,
      year,
      monthName: MONTH_NAMES[month - 1],
      predictedVolume: totalVolume,
      confidenceInterval: {
        min: weeks.reduce((sum, w) => sum + w.confidenceInterval.min, 0),
        max: weeks.reduce((sum, w) => sum + w.confidenceInterval.max, 0),
        p25: weeks.reduce((sum, w) => sum + w.confidenceInterval.p25, 0),
        p50: weeks.reduce((sum, w) => sum + w.confidenceInterval.p50, 0),
        p75: weeks.reduce((sum, w) => sum + w.confidenceInterval.p75, 0),
      },
      confidence: avgConfidence,
      weeklyForecasts: weeks,
      seasonalFactor: 1.0, // Could be calculated from historical data
      trend: TrendDirection.STABLE,
    });
  }

  return monthlyForecasts.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });
}

/**
 * Generate staffing recommendations
 */
function generateStaffingRecommendations(
  dailyForecasts: DailyForecast[],
  avgAppointmentsPerProvider: number,
  avgRoomsNeeded: number
): StaffingRecommendation[] {
  return dailyForecasts.map(forecast => {
    const volume = forecast.predictedVolume;

    // Calculate staffing needs
    const recommendedProviders = Math.ceil(volume / avgAppointmentsPerProvider) || 1;
    const recommendedStaff = Math.ceil(recommendedProviders * 0.75) || 1; // 0.75 support staff per provider
    const recommendedRooms = Math.ceil(volume / avgRoomsNeeded) || 1;

    // Estimate capacity
    const estimatedCapacity = recommendedProviders * avgAppointmentsPerProvider;
    const isOverCapacity = volume > estimatedCapacity * 1.1;

    // Peak hour estimation (simplified - assume 10am)
    const peakHour = 10;
    const peakHourVolume = Math.ceil(volume * 0.15); // 15% of daily volume in peak hour

    return {
      date: forecast.date,
      dayOfWeek: forecast.dayOfWeek,
      predictedVolume: volume,
      peakHour,
      peakHourVolume,
      recommendedProviders,
      recommendedStaff,
      recommendedRooms,
      isOverCapacity,
      capacityWarning: isOverCapacity
        ? `Predicted volume (${volume}) exceeds recommended capacity (${estimatedCapacity}). Consider opening additional slots.`
        : null,
      sameWeekdayStaffAverage: recommendedProviders,
    };
  });
}

/**
 * Generate capacity planning insights
 */
function generateCapacityInsights(
  staffingRecommendations: StaffingRecommendation[],
  providers: { id: string; name: string }[]
): CapacityPlanningInsight[] {
  const insights: CapacityPlanningInsight[] = [];

  // Check for consistently over-capacity days
  const overCapacityDays = staffingRecommendations.filter(s => s.isOverCapacity);
  if (overCapacityDays.length >= 3) {
    insights.push({
      type: 'understaffed',
      severity: overCapacityDays.length >= 5 ? 'high' : 'medium',
      description: `${overCapacityDays.length} days in the forecast period are predicted to exceed capacity`,
      recommendation: 'Consider adding provider availability or hiring additional staff',
      affectedDates: overCapacityDays.map(d => d.date),
      affectedProviders: providers.map(p => p.id),
      potentialImpact: `May result in ${Math.ceil(overCapacityDays.length * 0.1 * 100)}% longer wait times on affected days`,
      actionRequired: true,
    });
  }

  // Check for low-volume days (potential overstaffing)
  const lowVolumeDays = staffingRecommendations.filter(
    s => s.predictedVolume < 5 && !s.date.toISOString().includes('Sat') && !s.date.toISOString().includes('Sun')
  );
  if (lowVolumeDays.length >= 3) {
    insights.push({
      type: 'overstaffed',
      severity: 'low',
      description: `${lowVolumeDays.length} weekdays have very low predicted volume`,
      recommendation: 'Consider reducing staff hours or offering promotional appointments',
      affectedDates: lowVolumeDays.map(d => d.date),
      affectedProviders: [],
      potentialImpact: 'Opportunity to optimize labor costs',
      actionRequired: false,
    });
  }

  // Check for bottleneck patterns (single high-volume day surrounded by low)
  for (let i = 1; i < staffingRecommendations.length - 1; i++) {
    const prev = staffingRecommendations[i - 1];
    const curr = staffingRecommendations[i];
    const next = staffingRecommendations[i + 1];

    if (
      curr.predictedVolume > prev.predictedVolume * 1.5 &&
      curr.predictedVolume > next.predictedVolume * 1.5 &&
      curr.isOverCapacity
    ) {
      insights.push({
        type: 'bottleneck',
        severity: 'medium',
        description: `${curr.date.toDateString()} has significantly higher demand than surrounding days`,
        recommendation: 'Consider redistributing appointments to adjacent days or adding temporary capacity',
        affectedDates: [curr.date],
        affectedProviders: providers.map(p => p.id),
        potentialImpact: 'Could cause long wait times and patient dissatisfaction',
        actionRequired: true,
      });
    }
  }

  // Add optimal insight if no issues
  if (insights.length === 0) {
    insights.push({
      type: 'optimal',
      severity: 'low',
      description: 'Staffing levels appear well-matched to predicted demand',
      recommendation: 'Continue monitoring and adjust as needed',
      affectedDates: [],
      affectedProviders: [],
      potentialImpact: 'None - operations are optimized',
      actionRequired: false,
    });
  }

  return insights;
}

/**
 * Main function: Forecast demand for an organization
 */
export async function forecastDemand(
  organizationId: string,
  config: Partial<DemandForecastConfig> = {},
  options: {
    appointmentTypeId?: string;
    providerId?: string;
    locationId?: string;
  } = {}
): Promise<DemandForecastResult> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  // Calculate date ranges
  const forecastStartDate = new Date();
  forecastStartDate.setHours(0, 0, 0, 0);
  forecastStartDate.setDate(forecastStartDate.getDate() + 1); // Start tomorrow

  const forecastEndDate = new Date(forecastStartDate);
  forecastEndDate.setDate(forecastEndDate.getDate() + finalConfig.forecastHorizonDays);

  const lookbackStartDate = new Date();
  lookbackStartDate.setDate(lookbackStartDate.getDate() - finalConfig.lookbackWeeks * 7);

  // Build where clause for appointments
  const appointmentWhere: Prisma.AppointmentWhereInput = {
    organizationId,
    startTime: {
      gte: lookbackStartDate,
      lte: new Date(),
    },
    status: {
      in: [AppointmentStatus.COMPLETED, AppointmentStatus.CHECKED_IN, AppointmentStatus.SCHEDULED],
    },
  };

  if (options.appointmentTypeId) {
    appointmentWhere.appointmentTypeId = options.appointmentTypeId;
  }
  if (options.providerId) {
    appointmentWhere.providerId = options.providerId;
  }
  if (options.locationId) {
    appointmentWhere.locationId = options.locationId;
  }

  // Fetch historical appointments
  const historicalAppointments = await prisma.appointment.findMany({
    where: appointmentWhere,
    include: {
      appointmentType: true,
      provider: {
        include: { user: true },
      },
    },
    orderBy: { startTime: 'asc' },
  });

  // Fetch providers
  const providers = await prisma.provider.findMany({
    where: { organizationId, isActive: true },
    include: { user: true },
  });

  // Fetch appointment types
  const appointmentTypes = await prisma.appointmentType.findMany({
    where: { organizationId, isActive: true },
    select: { id: true, name: true, code: true },
  });

  // Calculate basic metrics
  const totalDays = Math.ceil(
    (new Date().getTime() - lookbackStartDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const avgDailyVolume = historicalAppointments.length / totalDays;

  // Calculate daily counts for confidence intervals
  const dailyCounts: Map<string, number> = new Map();
  for (const apt of historicalAppointments) {
    const dateKey = apt.startTime.toISOString().split('T')[0];
    dailyCounts.set(dateKey, (dailyCounts.get(dateKey) || 0) + 1);
  }
  const historicalDailyCounts = Array.from(dailyCounts.values());

  // Calculate day of week factors
  const dayOfWeekFactors = calculateDayOfWeekFactors(historicalAppointments, totalDays);

  // Detect seasonal patterns
  const seasonalPatterns = detectSeasonalPatterns(historicalAppointments, finalConfig.lookbackWeeks);

  // Calculate holiday impacts
  const holidayImpacts = calculateHolidayImpacts(
    historicalAppointments,
    lookbackStartDate,
    new Date()
  );

  // Generate daily forecasts
  const dailyForecasts = generateDailyForecasts(
    forecastStartDate,
    forecastEndDate,
    avgDailyVolume,
    dayOfWeekFactors,
    holidayImpacts,
    historicalDailyCounts,
    finalConfig
  );

  // Generate weekly and monthly forecasts
  const weeklyForecasts = generateWeeklyForecasts(dailyForecasts);
  const monthlyForecasts = generateMonthlyForecasts(weeklyForecasts);

  // Forecast by appointment type
  const byAppointmentType: AppointmentTypeForecast[] = [];
  const appointmentsByType: Map<string, typeof historicalAppointments> = new Map();

  for (const apt of historicalAppointments) {
    const typeId = apt.appointmentTypeId;
    if (!appointmentsByType.has(typeId)) {
      appointmentsByType.set(typeId, []);
    }
    appointmentsByType.get(typeId)!.push(apt);
  }

  const totalPredictedVolume = dailyForecasts.reduce((sum, d) => sum + d.predictedVolume, 0);

  for (const [typeId, typeAppointments] of appointmentsByType) {
    const typeInfo = appointmentTypes.find(t => t.id === typeId);
    const typeAvgDaily = typeAppointments.length / totalDays;
    const typePredictedVolume = Math.round(typeAvgDaily * finalConfig.forecastHorizonDays);
    const percentOfTotal = totalPredictedVolume > 0 ? (typePredictedVolume / totalPredictedVolume) * 100 : 0;

    // Simple trend detection
    const firstHalf = typeAppointments.filter(
      a => a.startTime < new Date(lookbackStartDate.getTime() + (new Date().getTime() - lookbackStartDate.getTime()) / 2)
    ).length;
    const secondHalf = typeAppointments.length - firstHalf;
    let trend: TrendDirection = TrendDirection.STABLE;
    if (secondHalf > firstHalf * 1.1) trend = TrendDirection.INCREASING;
    else if (secondHalf < firstHalf * 0.9) trend = TrendDirection.DECREASING;

    byAppointmentType.push({
      appointmentTypeId: typeId,
      appointmentTypeName: typeInfo?.name || 'Unknown',
      appointmentTypeCode: typeInfo?.code || null,
      predictedVolume: typePredictedVolume,
      confidenceInterval: calculateConfidenceInterval(
        typePredictedVolume,
        historicalDailyCounts,
        finalConfig.confidenceLevel
      ),
      confidence: 0.75,
      percentOfTotal,
      trend,
      changeFromPrevious: secondHalf - firstHalf,
    });
  }

  // Forecast by provider
  const byProvider: ProviderForecast[] = [];
  const appointmentsByProvider: Map<string, typeof historicalAppointments> = new Map();

  for (const apt of historicalAppointments) {
    const providerId = apt.providerId;
    if (!appointmentsByProvider.has(providerId)) {
      appointmentsByProvider.set(providerId, []);
    }
    appointmentsByProvider.get(providerId)!.push(apt);
  }

  for (const [providerId, providerAppointments] of appointmentsByProvider) {
    const providerInfo = providers.find(p => p.id === providerId);
    const providerAvgDaily = providerAppointments.length / totalDays;
    const providerPredictedVolume = Math.round(providerAvgDaily * finalConfig.forecastHorizonDays);

    // Estimate capacity (assume 8 appointments per day capacity)
    const estimatedCapacity = 8 * finalConfig.forecastHorizonDays;
    const utilizationRate = estimatedCapacity > 0 ? providerPredictedVolume / estimatedCapacity : 0;

    // By appointment type for this provider
    const providerByType: AppointmentTypeForecast[] = [];
    for (const [typeId, typeAppts] of appointmentsByType) {
      const providerTypeAppts = typeAppts.filter(a => a.providerId === providerId);
      if (providerTypeAppts.length > 0) {
        const typeInfo = appointmentTypes.find(t => t.id === typeId);
        const typePredicted = Math.round((providerTypeAppts.length / totalDays) * finalConfig.forecastHorizonDays);
        providerByType.push({
          appointmentTypeId: typeId,
          appointmentTypeName: typeInfo?.name || 'Unknown',
          appointmentTypeCode: typeInfo?.code || null,
          predictedVolume: typePredicted,
          confidenceInterval: calculateConfidenceInterval(typePredicted, [], finalConfig.confidenceLevel),
          confidence: 0.7,
          percentOfTotal: providerPredictedVolume > 0 ? (typePredicted / providerPredictedVolume) * 100 : 0,
          trend: TrendDirection.STABLE,
          changeFromPrevious: 0,
        });
      }
    }

    byProvider.push({
      providerId,
      providerName: providerInfo?.user ? `${providerInfo.user.firstName} ${providerInfo.user.lastName}` : 'Unknown',
      predictedVolume: providerPredictedVolume,
      confidenceInterval: calculateConfidenceInterval(
        providerPredictedVolume,
        historicalDailyCounts,
        finalConfig.confidenceLevel
      ),
      confidence: 0.75,
      estimatedCapacity,
      utilizationRate,
      byAppointmentType: providerByType,
    });
  }

  // Generate staffing recommendations
  const avgAppointmentsPerProvider = avgDailyVolume / Math.max(1, providers.length);
  const avgRoomsNeeded = avgDailyVolume / 6; // Assume 6 appointments per room per day

  const staffingRecommendations = generateStaffingRecommendations(
    dailyForecasts,
    avgAppointmentsPerProvider,
    avgRoomsNeeded
  );

  // Generate capacity insights
  const capacityInsights = generateCapacityInsights(
    staffingRecommendations,
    providers.map(p => ({ id: p.id, name: p.user ? `${p.user.firstName} ${p.user.lastName}` : 'Unknown' }))
  );

  // Overall confidence
  const overallConfidence = historicalAppointments.length >= finalConfig.minDataPoints
    ? Math.min(0.9, 0.5 + (historicalAppointments.length / 500) * 0.4)
    : 0.5;

  return {
    organizationId,
    forecastStartDate,
    forecastEndDate,
    granularity: 'daily' as ForecastGranularity,
    totalPredictedVolume,
    averageDailyVolume: avgDailyVolume,
    confidence: overallConfidence,
    dailyForecasts,
    weeklyForecasts,
    monthlyForecasts,
    byAppointmentType,
    byProvider,
    seasonalPatterns,
    dayOfWeekFactors,
    holidayImpacts,
    eventImpacts: [],
    staffingRecommendations,
    capacityInsights,
    modelVersion: MODEL_VERSION,
    dataPointsUsed: historicalAppointments.length,
    forecastGeneratedAt: new Date(),
    validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), // Valid for 24 hours
  };
}

/**
 * Save demand forecast to database
 */
export async function saveDemandForecast(
  organizationId: string,
  forecast: DemandForecastResult
): Promise<void> {
  // Save each daily forecast
  for (const daily of forecast.dailyForecasts) {
    await prisma.demandForecast.upsert({
      where: {
        id: `${organizationId}-${daily.date.toISOString().split('T')[0]}`,
      },
      create: {
        id: `${organizationId}-${daily.date.toISOString().split('T')[0]}`,
        organizationId,
        forecastDate: daily.date,
        appointmentType: null,
        providerId: null,
        locationId: null,
        predictedVolume: daily.predictedVolume,
        predictedRange: daily.confidenceInterval as unknown as Prisma.InputJsonValue,
        confidence: daily.confidence,
        granularity: 'daily',
        seasonalFactor: daily.seasonalFactor,
        dayOfWeekFactor: daily.dayOfWeekFactor,
        holidayImpact: daily.holidayImpact,
        modelVersion: forecast.modelVersion,
      },
      update: {
        predictedVolume: daily.predictedVolume,
        predictedRange: daily.confidenceInterval as unknown as Prisma.InputJsonValue,
        confidence: daily.confidence,
        seasonalFactor: daily.seasonalFactor,
        dayOfWeekFactor: daily.dayOfWeekFactor,
        holidayImpact: daily.holidayImpact,
        modelVersion: forecast.modelVersion,
        updatedAt: new Date(),
      },
    });
  }
}

/**
 * Track forecast accuracy
 */
export async function trackForecastAccuracy(
  organizationId: string,
  date: Date
): Promise<ForecastAccuracyMetrics | null> {
  const dateStr = date.toISOString().split('T')[0];

  // Get the forecast for this date
  const forecast = await prisma.demandForecast.findFirst({
    where: {
      organizationId,
      forecastDate: {
        gte: new Date(dateStr),
        lt: new Date(new Date(dateStr).getTime() + 24 * 60 * 60 * 1000),
      },
    },
  });

  if (!forecast) return null;

  // Count actual appointments
  const actualAppointments = await prisma.appointment.count({
    where: {
      organizationId,
      startTime: {
        gte: new Date(dateStr),
        lt: new Date(new Date(dateStr).getTime() + 24 * 60 * 60 * 1000),
      },
      status: {
        in: [AppointmentStatus.COMPLETED, AppointmentStatus.CHECKED_IN],
      },
    },
  });

  // Calculate metrics
  const predicted = forecast.predictedVolume;
  const actual = actualAppointments;
  const variance = actual - predicted;
  const variancePercent = predicted > 0 ? (variance / predicted) * 100 : 0;
  const mape = predicted > 0 ? Math.abs(variance / predicted) * 100 : 0;
  const rmse = Math.sqrt(Math.pow(variance, 2));

  // Check if within confidence interval
  const range = forecast.predictedRange as { min?: number; max?: number } | null;
  const withinConfidenceInterval =
    range && range.min !== undefined && range.max !== undefined
      ? actual >= range.min && actual <= range.max
      : false;

  // Update the forecast with actual values
  await prisma.demandForecast.update({
    where: { id: forecast.id },
    data: {
      actualVolume: actual,
      variance,
      variancePercent,
    },
  });

  return {
    forecastDate: date,
    granularity: forecast.granularity as ForecastGranularity,
    predictedVolume: predicted,
    actualVolume: actual,
    variance,
    variancePercent,
    mape,
    rmse,
    withinConfidenceInterval,
    byAppointmentTypeAccuracy: [],
    byProviderAccuracy: [],
  };
}

/**
 * Get forecast accuracy summary
 */
export async function getForecastAccuracySummary(
  organizationId: string,
  lookbackDays: number = 30
): Promise<{
  totalForecasts: number;
  validatedForecasts: number;
  averageMape: number;
  averageVariancePercent: number;
  withinConfidenceRate: number;
}> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - lookbackDays);

  const forecasts = await prisma.demandForecast.findMany({
    where: {
      organizationId,
      forecastDate: { gte: startDate, lte: new Date() },
      actualVolume: { not: null },
    },
    select: {
      predictedVolume: true,
      actualVolume: true,
      variance: true,
      variancePercent: true,
      predictedRange: true,
    },
  });

  const totalForecasts = await prisma.demandForecast.count({
    where: {
      organizationId,
      forecastDate: { gte: startDate, lte: new Date() },
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
  let withinConfidenceCount = 0;

  for (const f of forecasts) {
    const mape =
      f.predictedVolume > 0 ? Math.abs((f.actualVolume! - f.predictedVolume) / f.predictedVolume) * 100 : 0;
    totalMape += mape;
    totalVariancePercent += Math.abs(Number(f.variancePercent) || 0);

    const range = f.predictedRange as { min?: number; max?: number } | null;
    if (range && range.min !== undefined && range.max !== undefined) {
      if (f.actualVolume! >= range.min && f.actualVolume! <= range.max) {
        withinConfidenceCount++;
      }
    }
  }

  return {
    totalForecasts,
    validatedForecasts,
    averageMape: totalMape / validatedForecasts,
    averageVariancePercent: totalVariancePercent / validatedForecasts,
    withinConfidenceRate: (withinConfidenceCount / validatedForecasts) * 100,
  };
}
