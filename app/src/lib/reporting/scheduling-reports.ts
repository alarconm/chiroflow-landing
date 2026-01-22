// Scheduling and Productivity Reports - US-104
// Epic 15 - Reports on scheduling utilization and provider productivity

import { prisma } from '@/lib/prisma';
import { AppointmentStatus } from '@prisma/client';
import type { DateRangeFilter } from './types';

// ============================================
// Types for Scheduling Reports
// ============================================

export interface AppointmentVolumeReport {
  periodStart: Date;
  periodEnd: Date;
  groupBy: 'day' | 'week' | 'month';
  data: AppointmentVolumeRow[];
  totals: {
    totalAppointments: number;
    totalCompleted: number;
    totalCancelled: number;
    totalNoShows: number;
    avgAppointmentsPerPeriod: number;
  };
  byProvider: AppointmentVolumeByProvider[];
  byAppointmentType: AppointmentVolumeByType[];
}

export interface AppointmentVolumeRow {
  periodLabel: string;
  periodStart: Date;
  periodEnd: Date;
  scheduled: number;
  completed: number;
  cancelled: number;
  noShows: number;
  completionRate: number;
}

export interface AppointmentVolumeByProvider {
  providerId: string;
  providerName: string;
  totalAppointments: number;
  completed: number;
  percentage: number;
}

export interface AppointmentVolumeByType {
  appointmentTypeId: string;
  appointmentTypeName: string;
  count: number;
  percentage: number;
  avgDuration: number;
}

export interface NoShowCancellationReport {
  periodStart: Date;
  periodEnd: Date;
  summary: {
    totalAppointments: number;
    totalNoShows: number;
    totalCancellations: number;
    noShowRate: number;
    cancellationRate: number;
    combinedLossRate: number;
    estimatedRevenueLoss: number;
  };
  byProvider: NoShowByProvider[];
  byDayOfWeek: NoShowByDayOfWeek[];
  byTimeSlot: NoShowByTimeSlot[];
  topReasons: CancellationReason[];
  trends: NoShowTrendPoint[];
}

export interface NoShowByProvider {
  providerId: string;
  providerName: string;
  totalAppointments: number;
  noShows: number;
  cancellations: number;
  noShowRate: number;
  cancellationRate: number;
}

export interface NoShowByDayOfWeek {
  dayOfWeek: number;
  dayName: string;
  totalAppointments: number;
  noShows: number;
  cancellations: number;
  noShowRate: number;
  cancellationRate: number;
}

export interface NoShowByTimeSlot {
  timeSlot: string;
  startHour: number;
  totalAppointments: number;
  noShows: number;
  cancellations: number;
  noShowRate: number;
}

export interface CancellationReason {
  reason: string;
  count: number;
  percentage: number;
}

export interface NoShowTrendPoint {
  periodLabel: string;
  periodStart: Date;
  noShowRate: number;
  cancellationRate: number;
  totalAppointments: number;
}

export interface ProviderUtilizationReport {
  periodStart: Date;
  periodEnd: Date;
  providers: ProviderUtilizationRow[];
  totals: {
    totalAvailableMinutes: number;
    totalScheduledMinutes: number;
    totalCompletedMinutes: number;
    overallUtilization: number;
  };
}

export interface ProviderUtilizationRow {
  providerId: string;
  providerName: string;
  availableMinutes: number;
  scheduledMinutes: number;
  completedMinutes: number;
  blockedMinutes: number;
  utilizationRate: number;
  completionRate: number;
  byDayOfWeek: UtilizationByDay[];
}

export interface UtilizationByDay {
  dayOfWeek: number;
  dayName: string;
  availableMinutes: number;
  scheduledMinutes: number;
  utilizationRate: number;
}

export interface NewPatientReport {
  periodStart: Date;
  periodEnd: Date;
  summary: {
    totalNewPatients: number;
    avgNewPatientsPerWeek: number;
    conversionRate: number | null;
  };
  byReferralSource: NewPatientByReferralSource[];
  byProvider: NewPatientByProvider[];
  byMonth: NewPatientTrendPoint[];
  recentNewPatients: RecentNewPatient[];
}

export interface NewPatientByReferralSource {
  source: string;
  count: number;
  percentage: number;
}

export interface NewPatientByProvider {
  providerId: string;
  providerName: string;
  newPatientCount: number;
  percentage: number;
}

export interface NewPatientTrendPoint {
  periodLabel: string;
  periodStart: Date;
  count: number;
}

export interface RecentNewPatient {
  patientId: string;
  patientName: string;
  firstVisitDate: Date;
  providerId: string;
  providerName: string;
  appointmentType: string;
}

export interface PatientVisitFrequencyReport {
  periodStart: Date;
  periodEnd: Date;
  summary: {
    totalPatients: number;
    totalVisits: number;
    avgVisitsPerPatient: number;
    medianVisitsPerPatient: number;
  };
  frequencyDistribution: VisitFrequencyBucket[];
  topPatients: PatientVisitCount[];
  byProvider: VisitFrequencyByProvider[];
}

export interface VisitFrequencyBucket {
  bucketLabel: string;
  minVisits: number;
  maxVisits: number | null;
  patientCount: number;
  percentage: number;
}

export interface PatientVisitCount {
  patientId: string;
  patientName: string;
  visitCount: number;
  lastVisitDate: Date;
  totalCharges: number;
}

export interface VisitFrequencyByProvider {
  providerId: string;
  providerName: string;
  uniquePatients: number;
  totalVisits: number;
  avgVisitsPerPatient: number;
}

export interface PeakHoursReport {
  periodStart: Date;
  periodEnd: Date;
  byHour: HourlyVolume[];
  byDayAndHour: DayHourHeatmap[];
  peakTimes: PeakTimeSummary[];
  recommendations: string[];
}

export interface HourlyVolume {
  hour: number;
  hourLabel: string;
  totalAppointments: number;
  avgAppointmentsPerDay: number;
  noShowRate: number;
}

export interface DayHourHeatmap {
  dayOfWeek: number;
  dayName: string;
  hourlyData: { hour: number; count: number; intensity: number }[];
}

export interface PeakTimeSummary {
  timeRange: string;
  avgAppointments: number;
  isPeak: boolean;
  recommendation?: string;
}

// ============================================
// Helper Functions
// ============================================

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getDayName(dayOfWeek: number): string {
  return DAY_NAMES[dayOfWeek] || 'Unknown';
}

function formatHour(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:00 ${period}`;
}

function getWeekNumber(date: Date): number {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const diff = date.getTime() - startOfYear.getTime();
  const oneWeek = 1000 * 60 * 60 * 24 * 7;
  return Math.ceil(diff / oneWeek);
}

function getMonthLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
}

function getWeekLabel(date: Date): string {
  const weekNum = getWeekNumber(date);
  return `Week ${weekNum}, ${date.getFullYear()}`;
}

function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ============================================
// Appointment Volume Report
// ============================================

/**
 * Get appointment volume report - appointments by day/week/month
 */
export async function getAppointmentVolumeReport(
  organizationId: string,
  dateRange: DateRangeFilter,
  groupBy: 'day' | 'week' | 'month' = 'day'
): Promise<AppointmentVolumeReport> {
  const { start, end } = dateRange;

  // Get all appointments in the date range
  const appointments = await prisma.appointment.findMany({
    where: {
      organizationId,
      startTime: { gte: start, lte: end },
    },
    include: {
      provider: {
        include: { user: true },
      },
      appointmentType: true,
    },
    orderBy: { startTime: 'asc' },
  });

  // Group appointments by period
  const periodMap = new Map<string, {
    periodStart: Date;
    periodEnd: Date;
    scheduled: number;
    completed: number;
    cancelled: number;
    noShows: number;
  }>();

  // Group by provider
  const providerMap = new Map<string, { providerId: string; providerName: string; total: number; completed: number }>();

  // Group by appointment type
  const typeMap = new Map<string, { id: string; name: string; count: number; totalDuration: number }>();

  for (const appt of appointments) {
    // Determine period key and bounds
    let periodKey: string;
    let periodStart: Date;
    let periodEnd: Date;

    if (groupBy === 'day') {
      const dateStr = appt.startTime.toISOString().split('T')[0];
      periodKey = dateStr;
      periodStart = new Date(dateStr);
      periodEnd = new Date(dateStr);
      periodEnd.setHours(23, 59, 59, 999);
    } else if (groupBy === 'week') {
      const weekStart = new Date(appt.startTime);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      periodKey = weekStart.toISOString().split('T')[0];
      periodStart = weekStart;
      periodEnd = new Date(weekStart);
      periodEnd.setDate(periodEnd.getDate() + 6);
      periodEnd.setHours(23, 59, 59, 999);
    } else {
      // month
      const monthKey = `${appt.startTime.getFullYear()}-${String(appt.startTime.getMonth() + 1).padStart(2, '0')}`;
      periodKey = monthKey;
      periodStart = new Date(appt.startTime.getFullYear(), appt.startTime.getMonth(), 1);
      periodEnd = new Date(appt.startTime.getFullYear(), appt.startTime.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    // Initialize or get period data
    const periodData = periodMap.get(periodKey) || {
      periodStart,
      periodEnd,
      scheduled: 0,
      completed: 0,
      cancelled: 0,
      noShows: 0,
    };

    periodData.scheduled += 1;
    if (appt.status === AppointmentStatus.COMPLETED) {
      periodData.completed += 1;
    } else if (appt.status === AppointmentStatus.CANCELLED) {
      periodData.cancelled += 1;
    } else if (appt.status === AppointmentStatus.NO_SHOW) {
      periodData.noShows += 1;
    }
    periodMap.set(periodKey, periodData);

    // Track by provider
    const providerId = appt.providerId;
    const providerName = appt.provider.user
      ? `${appt.provider.user.firstName} ${appt.provider.user.lastName}`.trim()
      : 'Unknown Provider';
    const providerData = providerMap.get(providerId) || { providerId, providerName, total: 0, completed: 0 };
    providerData.total += 1;
    if (appt.status === AppointmentStatus.COMPLETED) {
      providerData.completed += 1;
    }
    providerMap.set(providerId, providerData);

    // Track by appointment type
    const typeId = appt.appointmentTypeId;
    const typeName = appt.appointmentType.name;
    const duration = (appt.endTime.getTime() - appt.startTime.getTime()) / (1000 * 60);
    const typeData = typeMap.get(typeId) || { id: typeId, name: typeName, count: 0, totalDuration: 0 };
    typeData.count += 1;
    typeData.totalDuration += duration;
    typeMap.set(typeId, typeData);
  }

  // Build period data array
  const data: AppointmentVolumeRow[] = Array.from(periodMap.entries())
    .map(([key, d]) => {
      let periodLabel: string;
      if (groupBy === 'day') {
        periodLabel = new Date(key).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      } else if (groupBy === 'week') {
        periodLabel = getWeekLabel(d.periodStart);
      } else {
        periodLabel = getMonthLabel(d.periodStart);
      }

      const completionRate = d.scheduled > 0 ? Math.round((d.completed / d.scheduled) * 1000) / 10 : 0;

      return {
        periodLabel,
        periodStart: d.periodStart,
        periodEnd: d.periodEnd,
        scheduled: d.scheduled,
        completed: d.completed,
        cancelled: d.cancelled,
        noShows: d.noShows,
        completionRate,
      };
    })
    .sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime());

  // Calculate totals
  const totalAppointments = appointments.length;
  const totalCompleted = appointments.filter(a => a.status === AppointmentStatus.COMPLETED).length;
  const totalCancelled = appointments.filter(a => a.status === AppointmentStatus.CANCELLED).length;
  const totalNoShows = appointments.filter(a => a.status === AppointmentStatus.NO_SHOW).length;
  const avgAppointmentsPerPeriod = data.length > 0 ? Math.round((totalAppointments / data.length) * 10) / 10 : 0;

  // Build by provider array
  const byProvider: AppointmentVolumeByProvider[] = Array.from(providerMap.values())
    .map(d => ({
      providerId: d.providerId,
      providerName: d.providerName,
      totalAppointments: d.total,
      completed: d.completed,
      percentage: totalAppointments > 0 ? Math.round((d.total / totalAppointments) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.totalAppointments - a.totalAppointments);

  // Build by appointment type array
  const byAppointmentType: AppointmentVolumeByType[] = Array.from(typeMap.values())
    .map(d => ({
      appointmentTypeId: d.id,
      appointmentTypeName: d.name,
      count: d.count,
      percentage: totalAppointments > 0 ? Math.round((d.count / totalAppointments) * 1000) / 10 : 0,
      avgDuration: d.count > 0 ? Math.round(d.totalDuration / d.count) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    periodStart: start,
    periodEnd: end,
    groupBy,
    data,
    totals: {
      totalAppointments,
      totalCompleted,
      totalCancelled,
      totalNoShows,
      avgAppointmentsPerPeriod,
    },
    byProvider,
    byAppointmentType,
  };
}

// ============================================
// No-Show and Cancellation Report
// ============================================

/**
 * Get no-show and cancellation report with rates
 */
export async function getNoShowCancellationReport(
  organizationId: string,
  dateRange: DateRangeFilter
): Promise<NoShowCancellationReport> {
  const { start, end } = dateRange;

  // Get all appointments in the date range
  const appointments = await prisma.appointment.findMany({
    where: {
      organizationId,
      startTime: { gte: start, lte: end },
      status: { not: AppointmentStatus.SCHEDULED }, // Exclude future scheduled
    },
    include: {
      provider: {
        include: { user: true },
      },
      appointmentType: true,
    },
  });

  let totalNoShows = 0;
  let totalCancellations = 0;
  let estimatedRevenueLoss = 0;

  // Group by provider
  const providerMap = new Map<string, {
    providerId: string;
    providerName: string;
    total: number;
    noShows: number;
    cancellations: number;
  }>();

  // Group by day of week
  const dayOfWeekMap = new Map<number, { total: number; noShows: number; cancellations: number }>();
  for (let i = 0; i < 7; i++) {
    dayOfWeekMap.set(i, { total: 0, noShows: 0, cancellations: 0 });
  }

  // Group by time slot (2-hour buckets)
  const timeSlotMap = new Map<number, { total: number; noShows: number; cancellations: number }>();

  // Track cancellation reasons
  const reasonMap = new Map<string, number>();

  // Monthly trends
  const monthlyMap = new Map<string, { total: number; noShows: number; cancellations: number }>();

  for (const appt of appointments) {
    const isNoShow = appt.status === AppointmentStatus.NO_SHOW;
    const isCancelled = appt.status === AppointmentStatus.CANCELLED;

    if (isNoShow) {
      totalNoShows += 1;
      estimatedRevenueLoss += Number(appt.chargeAmount || appt.appointmentType.defaultPrice || 0);
    }
    if (isCancelled) {
      totalCancellations += 1;
      // Track cancellation reason
      const reason = appt.cancelReason || 'Not specified';
      reasonMap.set(reason, (reasonMap.get(reason) || 0) + 1);
    }

    // Track by provider
    const providerId = appt.providerId;
    const providerName = appt.provider.user
      ? `${appt.provider.user.firstName} ${appt.provider.user.lastName}`.trim()
      : 'Unknown Provider';
    const providerData = providerMap.get(providerId) || {
      providerId,
      providerName,
      total: 0,
      noShows: 0,
      cancellations: 0,
    };
    providerData.total += 1;
    if (isNoShow) providerData.noShows += 1;
    if (isCancelled) providerData.cancellations += 1;
    providerMap.set(providerId, providerData);

    // Track by day of week
    const dayOfWeek = appt.startTime.getDay();
    const dayData = dayOfWeekMap.get(dayOfWeek)!;
    dayData.total += 1;
    if (isNoShow) dayData.noShows += 1;
    if (isCancelled) dayData.cancellations += 1;

    // Track by time slot (2-hour buckets starting at 6am)
    const hour = appt.startTime.getHours();
    const slotHour = Math.floor(hour / 2) * 2;
    const slotData = timeSlotMap.get(slotHour) || { total: 0, noShows: 0, cancellations: 0 };
    slotData.total += 1;
    if (isNoShow) slotData.noShows += 1;
    if (isCancelled) slotData.cancellations += 1;
    timeSlotMap.set(slotHour, slotData);

    // Track monthly trends
    const monthKey = `${appt.startTime.getFullYear()}-${String(appt.startTime.getMonth() + 1).padStart(2, '0')}`;
    const monthData = monthlyMap.get(monthKey) || { total: 0, noShows: 0, cancellations: 0 };
    monthData.total += 1;
    if (isNoShow) monthData.noShows += 1;
    if (isCancelled) monthData.cancellations += 1;
    monthlyMap.set(monthKey, monthData);
  }

  const totalAppointments = appointments.length;
  const noShowRate = totalAppointments > 0 ? Math.round((totalNoShows / totalAppointments) * 1000) / 10 : 0;
  const cancellationRate = totalAppointments > 0 ? Math.round((totalCancellations / totalAppointments) * 1000) / 10 : 0;
  const combinedLossRate = totalAppointments > 0
    ? Math.round(((totalNoShows + totalCancellations) / totalAppointments) * 1000) / 10
    : 0;

  // Build by provider array
  const byProvider: NoShowByProvider[] = Array.from(providerMap.values())
    .map(d => ({
      providerId: d.providerId,
      providerName: d.providerName,
      totalAppointments: d.total,
      noShows: d.noShows,
      cancellations: d.cancellations,
      noShowRate: d.total > 0 ? Math.round((d.noShows / d.total) * 1000) / 10 : 0,
      cancellationRate: d.total > 0 ? Math.round((d.cancellations / d.total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.totalAppointments - a.totalAppointments);

  // Build by day of week array
  const byDayOfWeek: NoShowByDayOfWeek[] = Array.from(dayOfWeekMap.entries())
    .map(([day, d]) => ({
      dayOfWeek: day,
      dayName: getDayName(day),
      totalAppointments: d.total,
      noShows: d.noShows,
      cancellations: d.cancellations,
      noShowRate: d.total > 0 ? Math.round((d.noShows / d.total) * 1000) / 10 : 0,
      cancellationRate: d.total > 0 ? Math.round((d.cancellations / d.total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek);

  // Build by time slot array
  const byTimeSlot: NoShowByTimeSlot[] = Array.from(timeSlotMap.entries())
    .map(([hour, d]) => ({
      timeSlot: `${formatHour(hour)} - ${formatHour(hour + 2)}`,
      startHour: hour,
      totalAppointments: d.total,
      noShows: d.noShows,
      cancellations: d.cancellations,
      noShowRate: d.total > 0 ? Math.round((d.noShows / d.total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => a.startHour - b.startHour);

  // Build top reasons array
  const topReasons: CancellationReason[] = Array.from(reasonMap.entries())
    .map(([reason, count]) => ({
      reason,
      count,
      percentage: totalCancellations > 0 ? Math.round((count / totalCancellations) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Build trends array
  const trends: NoShowTrendPoint[] = Array.from(monthlyMap.entries())
    .map(([key, d]) => ({
      periodLabel: getMonthLabel(new Date(key + '-01')),
      periodStart: new Date(key + '-01'),
      noShowRate: d.total > 0 ? Math.round((d.noShows / d.total) * 1000) / 10 : 0,
      cancellationRate: d.total > 0 ? Math.round((d.cancellations / d.total) * 1000) / 10 : 0,
      totalAppointments: d.total,
    }))
    .sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime());

  return {
    periodStart: start,
    periodEnd: end,
    summary: {
      totalAppointments,
      totalNoShows,
      totalCancellations,
      noShowRate,
      cancellationRate,
      combinedLossRate,
      estimatedRevenueLoss: Math.round(estimatedRevenueLoss * 100) / 100,
    },
    byProvider,
    byDayOfWeek,
    byTimeSlot,
    topReasons,
    trends,
  };
}

// ============================================
// Provider Utilization Report
// ============================================

/**
 * Get provider utilization report - scheduled vs available time
 */
export async function getProviderUtilizationReport(
  organizationId: string,
  dateRange: DateRangeFilter
): Promise<ProviderUtilizationReport> {
  const { start, end } = dateRange;

  // Get all providers
  const providers = await prisma.provider.findMany({
    where: { organizationId, isActive: true },
    include: {
      user: true,
      schedules: true,
    },
  });

  // Get all appointments in the date range
  const appointments = await prisma.appointment.findMany({
    where: {
      organizationId,
      startTime: { gte: start, lte: end },
    },
  });

  // Get schedule blocks (time off, meetings, etc.)
  const scheduleBlocks = await prisma.scheduleBlock.findMany({
    where: {
      organizationId,
      startTime: { lte: end },
      endTime: { gte: start },
    },
  });

  // Calculate number of days in range
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysInRange = Math.ceil((end.getTime() - start.getTime()) / msPerDay);

  // Build provider utilization data
  const providerRows: ProviderUtilizationRow[] = [];
  let totalAvailable = 0;
  let totalScheduled = 0;
  let totalCompleted = 0;

  for (const provider of providers) {
    const providerName = provider.user
      ? `${provider.user.firstName} ${provider.user.lastName}`.trim()
      : 'Unknown Provider';

    // Calculate available minutes from provider schedule
    let availableMinutes = 0;
    const dailyAvailable = new Map<number, number>(); // day of week -> minutes

    for (const schedule of provider.schedules) {
      const dayNum = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'].indexOf(schedule.dayOfWeek);
      const startParts = schedule.startTime.split(':').map(Number);
      const endParts = schedule.endTime.split(':').map(Number);
      const startMinutes = startParts[0] * 60 + startParts[1];
      const endMinutes = endParts[0] * 60 + endParts[1];
      const dayMinutes = endMinutes - startMinutes;
      dailyAvailable.set(dayNum, (dailyAvailable.get(dayNum) || 0) + dayMinutes);
    }

    // Calculate total available minutes for the period
    const currentDate = new Date(start);
    while (currentDate <= end) {
      const dayOfWeek = currentDate.getDay();
      availableMinutes += dailyAvailable.get(dayOfWeek) || 0;
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Subtract blocked time
    let blockedMinutes = 0;
    for (const block of scheduleBlocks) {
      if (block.providerId === provider.id || block.providerId === null) {
        const blockStart = block.startTime > start ? block.startTime : start;
        const blockEnd = block.endTime < end ? block.endTime : end;
        const blockDuration = (blockEnd.getTime() - blockStart.getTime()) / (1000 * 60);
        blockedMinutes += Math.max(0, blockDuration);
      }
    }
    availableMinutes = Math.max(0, availableMinutes - blockedMinutes);

    // Calculate scheduled and completed minutes
    const providerAppts = appointments.filter(a => a.providerId === provider.id);
    let scheduledMinutes = 0;
    let completedMinutes = 0;

    for (const appt of providerAppts) {
      const duration = (appt.endTime.getTime() - appt.startTime.getTime()) / (1000 * 60);
      scheduledMinutes += duration;
      if (appt.status === AppointmentStatus.COMPLETED) {
        completedMinutes += duration;
      }
    }

    // Calculate utilization by day of week
    const byDayOfWeek: UtilizationByDay[] = [];
    for (let day = 0; day < 7; day++) {
      const dayAvailable = dailyAvailable.get(day) || 0;
      // Count days of this weekday in the range
      let dayCount = 0;
      const checkDate = new Date(start);
      while (checkDate <= end) {
        if (checkDate.getDay() === day) dayCount++;
        checkDate.setDate(checkDate.getDate() + 1);
      }
      const totalDayAvailable = dayAvailable * dayCount;

      // Sum scheduled minutes for this day of week
      const dayScheduled = providerAppts
        .filter(a => a.startTime.getDay() === day)
        .reduce((sum, a) => sum + (a.endTime.getTime() - a.startTime.getTime()) / (1000 * 60), 0);

      byDayOfWeek.push({
        dayOfWeek: day,
        dayName: getDayName(day),
        availableMinutes: totalDayAvailable,
        scheduledMinutes: dayScheduled,
        utilizationRate: totalDayAvailable > 0 ? Math.round((dayScheduled / totalDayAvailable) * 1000) / 10 : 0,
      });
    }

    const utilizationRate = availableMinutes > 0 ? Math.round((scheduledMinutes / availableMinutes) * 1000) / 10 : 0;
    const completionRate = scheduledMinutes > 0 ? Math.round((completedMinutes / scheduledMinutes) * 1000) / 10 : 0;

    providerRows.push({
      providerId: provider.id,
      providerName,
      availableMinutes,
      scheduledMinutes,
      completedMinutes,
      blockedMinutes,
      utilizationRate,
      completionRate,
      byDayOfWeek,
    });

    totalAvailable += availableMinutes;
    totalScheduled += scheduledMinutes;
    totalCompleted += completedMinutes;
  }

  // Sort by utilization rate descending
  providerRows.sort((a, b) => b.utilizationRate - a.utilizationRate);

  const overallUtilization = totalAvailable > 0 ? Math.round((totalScheduled / totalAvailable) * 1000) / 10 : 0;

  return {
    periodStart: start,
    periodEnd: end,
    providers: providerRows,
    totals: {
      totalAvailableMinutes: totalAvailable,
      totalScheduledMinutes: totalScheduled,
      totalCompletedMinutes: totalCompleted,
      overallUtilization,
    },
  };
}

// ============================================
// New Patient Report
// ============================================

/**
 * Get new patient report - new patients by referral source
 */
export async function getNewPatientReport(
  organizationId: string,
  dateRange: DateRangeFilter
): Promise<NewPatientReport> {
  const { start, end } = dateRange;

  // Get patients who had their first appointment in the date range
  // A "new patient" is identified by having their first completed appointment in this period
  const firstAppointments = await prisma.appointment.findMany({
    where: {
      organizationId,
      startTime: { gte: start, lte: end },
      status: AppointmentStatus.COMPLETED,
    },
    include: {
      patient: {
        include: { demographics: true },
      },
      provider: {
        include: { user: true },
      },
      appointmentType: true,
    },
    orderBy: { startTime: 'asc' },
  });

  // Find patients whose first-ever completed appointment is in this period
  const newPatientIds = new Set<string>();
  const newPatientMap = new Map<string, {
    patientId: string;
    patientName: string;
    firstVisitDate: Date;
    providerId: string;
    providerName: string;
    appointmentType: string;
  }>();

  // Group by provider
  const providerMap = new Map<string, { providerId: string; providerName: string; count: number }>();

  // Group by month
  const monthMap = new Map<string, number>();

  // Track referral sources - since schema doesn't have referralSource,
  // we'll use a placeholder for now (could be extended to use intake forms or custom fields)
  const sourceMap = new Map<string, number>();

  for (const appt of firstAppointments) {
    // Check if this patient has any earlier completed appointments
    const earlierAppt = await prisma.appointment.findFirst({
      where: {
        patientId: appt.patientId,
        organizationId,
        status: AppointmentStatus.COMPLETED,
        startTime: { lt: start },
      },
    });

    if (!earlierAppt && !newPatientIds.has(appt.patientId)) {
      // This is a new patient
      newPatientIds.add(appt.patientId);

      const demo = appt.patient.demographics;
      const patientName = demo ? `${demo.lastName}, ${demo.firstName}` : 'Unknown';
      const providerName = appt.provider.user
        ? `${appt.provider.user.firstName} ${appt.provider.user.lastName}`.trim()
        : 'Unknown Provider';

      newPatientMap.set(appt.patientId, {
        patientId: appt.patientId,
        patientName,
        firstVisitDate: appt.startTime,
        providerId: appt.providerId,
        providerName,
        appointmentType: appt.appointmentType.name,
      });

      // Track by provider
      const providerData = providerMap.get(appt.providerId) || {
        providerId: appt.providerId,
        providerName,
        count: 0,
      };
      providerData.count += 1;
      providerMap.set(appt.providerId, providerData);

      // Track by month
      const monthKey = `${appt.startTime.getFullYear()}-${String(appt.startTime.getMonth() + 1).padStart(2, '0')}`;
      monthMap.set(monthKey, (monthMap.get(monthKey) || 0) + 1);

      // Track referral source (using appointment type as proxy for now)
      // In a real system, this would come from intake forms or patient metadata
      const source = appt.appointmentType.name.includes('Referral') ? 'Referral' : 'Direct';
      sourceMap.set(source, (sourceMap.get(source) || 0) + 1);
    }
  }

  const totalNewPatients = newPatientIds.size;
  const weeksInRange = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)));
  const avgNewPatientsPerWeek = Math.round((totalNewPatients / weeksInRange) * 10) / 10;

  // Build by referral source array
  const byReferralSource: NewPatientByReferralSource[] = Array.from(sourceMap.entries())
    .map(([source, count]) => ({
      source,
      count,
      percentage: totalNewPatients > 0 ? Math.round((count / totalNewPatients) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Build by provider array
  const byProvider: NewPatientByProvider[] = Array.from(providerMap.values())
    .map(d => ({
      providerId: d.providerId,
      providerName: d.providerName,
      newPatientCount: d.count,
      percentage: totalNewPatients > 0 ? Math.round((d.count / totalNewPatients) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.newPatientCount - a.newPatientCount);

  // Build by month array
  const byMonth: NewPatientTrendPoint[] = Array.from(monthMap.entries())
    .map(([key, count]) => ({
      periodLabel: getMonthLabel(new Date(key + '-01')),
      periodStart: new Date(key + '-01'),
      count,
    }))
    .sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime());

  // Build recent new patients list (last 20)
  const recentNewPatients: RecentNewPatient[] = Array.from(newPatientMap.values())
    .sort((a, b) => b.firstVisitDate.getTime() - a.firstVisitDate.getTime())
    .slice(0, 20);

  return {
    periodStart: start,
    periodEnd: end,
    summary: {
      totalNewPatients,
      avgNewPatientsPerWeek,
      conversionRate: null, // Would need lead/inquiry tracking to calculate
    },
    byReferralSource,
    byProvider,
    byMonth,
    recentNewPatients,
  };
}

// ============================================
// Patient Visit Frequency Report
// ============================================

/**
 * Get patient visit frequency report
 */
export async function getPatientVisitFrequencyReport(
  organizationId: string,
  dateRange: DateRangeFilter
): Promise<PatientVisitFrequencyReport> {
  const { start, end } = dateRange;

  // Get all completed appointments in the date range
  const appointments = await prisma.appointment.findMany({
    where: {
      organizationId,
      startTime: { gte: start, lte: end },
      status: AppointmentStatus.COMPLETED,
    },
    include: {
      patient: {
        include: { demographics: true },
      },
      provider: {
        include: { user: true },
      },
    },
  });

  // Get charges for patients to calculate total revenue
  const charges = await prisma.charge.findMany({
    where: {
      organizationId,
      serviceDate: { gte: start, lte: end },
    },
  });

  // Group by patient
  const patientMap = new Map<string, {
    patientId: string;
    patientName: string;
    visitCount: number;
    lastVisitDate: Date;
    totalCharges: number;
  }>();

  // Group by provider
  const providerMap = new Map<string, {
    providerId: string;
    providerName: string;
    patientIds: Set<string>;
    totalVisits: number;
  }>();

  // Create charge lookup by patient
  const patientCharges = new Map<string, number>();
  for (const charge of charges) {
    const current = patientCharges.get(charge.patientId) || 0;
    patientCharges.set(charge.patientId, current + Number(charge.fee));
  }

  for (const appt of appointments) {
    const patientId = appt.patientId;
    const demo = appt.patient.demographics;
    const patientName = demo ? `${demo.lastName}, ${demo.firstName}` : 'Unknown';

    const patientData = patientMap.get(patientId) || {
      patientId,
      patientName,
      visitCount: 0,
      lastVisitDate: appt.startTime,
      totalCharges: patientCharges.get(patientId) || 0,
    };
    patientData.visitCount += 1;
    if (appt.startTime > patientData.lastVisitDate) {
      patientData.lastVisitDate = appt.startTime;
    }
    patientMap.set(patientId, patientData);

    // Track by provider
    const providerId = appt.providerId;
    const providerName = appt.provider.user
      ? `${appt.provider.user.firstName} ${appt.provider.user.lastName}`.trim()
      : 'Unknown Provider';
    const providerData = providerMap.get(providerId) || {
      providerId,
      providerName,
      patientIds: new Set<string>(),
      totalVisits: 0,
    };
    providerData.patientIds.add(patientId);
    providerData.totalVisits += 1;
    providerMap.set(providerId, providerData);
  }

  const totalPatients = patientMap.size;
  const totalVisits = appointments.length;
  const visitCounts = Array.from(patientMap.values()).map(p => p.visitCount);
  const avgVisitsPerPatient = totalPatients > 0 ? Math.round((totalVisits / totalPatients) * 10) / 10 : 0;
  const medianVisitsPerPatient = calculateMedian(visitCounts);

  // Build frequency distribution buckets
  const buckets = [
    { label: '1 visit', min: 1, max: 1 },
    { label: '2-3 visits', min: 2, max: 3 },
    { label: '4-6 visits', min: 4, max: 6 },
    { label: '7-12 visits', min: 7, max: 12 },
    { label: '13+ visits', min: 13, max: null },
  ];

  const frequencyDistribution: VisitFrequencyBucket[] = buckets.map(bucket => {
    const count = visitCounts.filter(v =>
      v >= bucket.min && (bucket.max === null || v <= bucket.max)
    ).length;
    return {
      bucketLabel: bucket.label,
      minVisits: bucket.min,
      maxVisits: bucket.max,
      patientCount: count,
      percentage: totalPatients > 0 ? Math.round((count / totalPatients) * 1000) / 10 : 0,
    };
  });

  // Build top patients array (by visit count)
  const topPatients: PatientVisitCount[] = Array.from(patientMap.values())
    .sort((a, b) => b.visitCount - a.visitCount)
    .slice(0, 20)
    .map(p => ({
      patientId: p.patientId,
      patientName: p.patientName,
      visitCount: p.visitCount,
      lastVisitDate: p.lastVisitDate,
      totalCharges: Math.round(p.totalCharges * 100) / 100,
    }));

  // Build by provider array
  const byProvider: VisitFrequencyByProvider[] = Array.from(providerMap.values())
    .map(d => ({
      providerId: d.providerId,
      providerName: d.providerName,
      uniquePatients: d.patientIds.size,
      totalVisits: d.totalVisits,
      avgVisitsPerPatient: d.patientIds.size > 0
        ? Math.round((d.totalVisits / d.patientIds.size) * 10) / 10
        : 0,
    }))
    .sort((a, b) => b.totalVisits - a.totalVisits);

  return {
    periodStart: start,
    periodEnd: end,
    summary: {
      totalPatients,
      totalVisits,
      avgVisitsPerPatient,
      medianVisitsPerPatient,
    },
    frequencyDistribution,
    topPatients,
    byProvider,
  };
}

// ============================================
// Peak Hours Analysis Report
// ============================================

/**
 * Get peak hours analysis
 */
export async function getPeakHoursReport(
  organizationId: string,
  dateRange: DateRangeFilter
): Promise<PeakHoursReport> {
  const { start, end } = dateRange;

  // Get all appointments in the date range (not cancelled)
  const appointments = await prisma.appointment.findMany({
    where: {
      organizationId,
      startTime: { gte: start, lte: end },
      status: { not: AppointmentStatus.CANCELLED },
    },
  });

  // Calculate number of days in range
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysInRange = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / msPerDay));

  // Group by hour
  const hourMap = new Map<number, { total: number; noShows: number }>();
  for (let h = 6; h <= 20; h++) { // 6 AM to 8 PM typical business hours
    hourMap.set(h, { total: 0, noShows: 0 });
  }

  // Group by day and hour for heatmap
  const dayHourMap = new Map<string, number>();

  for (const appt of appointments) {
    const hour = appt.startTime.getHours();
    const dayOfWeek = appt.startTime.getDay();

    // Track by hour
    if (hourMap.has(hour)) {
      const hourData = hourMap.get(hour)!;
      hourData.total += 1;
      if (appt.status === AppointmentStatus.NO_SHOW) {
        hourData.noShows += 1;
      }
    }

    // Track by day and hour
    const key = `${dayOfWeek}-${hour}`;
    dayHourMap.set(key, (dayHourMap.get(key) || 0) + 1);
  }

  // Build by hour array
  const byHour: HourlyVolume[] = Array.from(hourMap.entries())
    .map(([hour, data]) => ({
      hour,
      hourLabel: formatHour(hour),
      totalAppointments: data.total,
      avgAppointmentsPerDay: Math.round((data.total / daysInRange) * 10) / 10,
      noShowRate: data.total > 0 ? Math.round((data.noShows / data.total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => a.hour - b.hour);

  // Find max appointments for intensity calculation
  const maxAppts = Math.max(...Array.from(dayHourMap.values()), 1);

  // Build day-hour heatmap
  const byDayAndHour: DayHourHeatmap[] = [];
  for (let day = 0; day < 7; day++) {
    const hourlyData: { hour: number; count: number; intensity: number }[] = [];
    for (let hour = 6; hour <= 20; hour++) {
      const key = `${day}-${hour}`;
      const count = dayHourMap.get(key) || 0;
      hourlyData.push({
        hour,
        count,
        intensity: Math.round((count / maxAppts) * 100) / 100,
      });
    }
    byDayAndHour.push({
      dayOfWeek: day,
      dayName: getDayName(day),
      hourlyData,
    });
  }

  // Identify peak times
  const sortedHours = [...byHour].sort((a, b) => b.avgAppointmentsPerDay - a.avgAppointmentsPerDay);
  const avgApptsPerHour = appointments.length / (byHour.length * daysInRange);

  const peakTimes: PeakTimeSummary[] = [
    {
      timeRange: 'Morning (8-11 AM)',
      avgAppointments: byHour.filter(h => h.hour >= 8 && h.hour < 11)
        .reduce((sum, h) => sum + h.avgAppointmentsPerDay, 0),
      isPeak: false,
    },
    {
      timeRange: 'Midday (11 AM-2 PM)',
      avgAppointments: byHour.filter(h => h.hour >= 11 && h.hour < 14)
        .reduce((sum, h) => sum + h.avgAppointmentsPerDay, 0),
      isPeak: false,
    },
    {
      timeRange: 'Afternoon (2-5 PM)',
      avgAppointments: byHour.filter(h => h.hour >= 14 && h.hour < 17)
        .reduce((sum, h) => sum + h.avgAppointmentsPerDay, 0),
      isPeak: false,
    },
    {
      timeRange: 'Evening (5-8 PM)',
      avgAppointments: byHour.filter(h => h.hour >= 17 && h.hour <= 20)
        .reduce((sum, h) => sum + h.avgAppointmentsPerDay, 0),
      isPeak: false,
    },
  ];

  // Mark peak time
  const maxPeakAvg = Math.max(...peakTimes.map(p => p.avgAppointments));
  for (const peak of peakTimes) {
    peak.isPeak = peak.avgAppointments === maxPeakAvg && maxPeakAvg > 0;
    peak.avgAppointments = Math.round(peak.avgAppointments * 10) / 10;
  }

  // Generate recommendations
  const recommendations: string[] = [];

  // Find underutilized hours
  const lowHours = byHour.filter(h => h.avgAppointmentsPerDay < avgApptsPerHour * 0.5 && h.totalAppointments > 0);
  if (lowHours.length > 0) {
    const lowRange = `${formatHour(lowHours[0].hour)} - ${formatHour(lowHours[lowHours.length - 1].hour + 1)}`;
    recommendations.push(`Consider promotions for ${lowRange} time slots which are underutilized`);
  }

  // Find high no-show hours
  const highNoShowHours = byHour.filter(h => h.noShowRate > 15);
  if (highNoShowHours.length > 0) {
    recommendations.push(`Implement reminder calls for appointments around ${highNoShowHours.map(h => formatHour(h.hour)).join(', ')} which have higher no-show rates`);
  }

  // Check for even distribution
  const peakHour = sortedHours[0];
  const lowestHour = sortedHours[sortedHours.length - 1];
  if (peakHour.avgAppointmentsPerDay > lowestHour.avgAppointmentsPerDay * 3) {
    recommendations.push(`Consider incentives to shift appointments from ${formatHour(peakHour.hour)} to ${formatHour(lowestHour.hour)} to balance load`);
  }

  if (recommendations.length === 0) {
    recommendations.push('Schedule distribution appears well-balanced across time slots');
  }

  return {
    periodStart: start,
    periodEnd: end,
    byHour,
    byDayAndHour,
    peakTimes,
    recommendations,
  };
}
