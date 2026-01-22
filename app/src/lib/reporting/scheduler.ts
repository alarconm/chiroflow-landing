// Report Scheduling Service
// Epic 15 - Schedule automatic report generation and delivery

import { prisma } from '@/lib/prisma';
import { ScheduleFrequency, ExportFormat, ReportType } from '@prisma/client';
import type { ReportScheduleConfig, ScheduledReportRun } from './types';

/**
 * Create a new report schedule
 */
export async function createReportSchedule(
  organizationId: string,
  userId: string,
  config: ReportScheduleConfig
) {
  // Calculate next run time
  const nextRunAt = calculateNextRunTime(
    config.frequency,
    config.timeOfDay,
    config.timezone,
    config.dayOfWeek,
    config.dayOfMonth
  );

  return prisma.reportSchedule.create({
    data: {
      name: config.name,
      organizationId,
      userId,
      savedReportId: config.savedReportId,
      frequency: config.frequency,
      dayOfWeek: config.dayOfWeek,
      dayOfMonth: config.dayOfMonth,
      timeOfDay: config.timeOfDay,
      timezone: config.timezone,
      exportFormat: config.exportFormat,
      recipients: config.recipients,
      subject: config.subject,
      message: config.message,
      isActive: true,
      nextRunAt,
    },
    include: {
      savedReport: true,
    },
  });
}

/**
 * Update an existing schedule
 */
export async function updateReportSchedule(
  organizationId: string,
  scheduleId: string,
  updates: Partial<ReportScheduleConfig>
) {
  const existing = await prisma.reportSchedule.findFirst({
    where: { id: scheduleId, organizationId },
  });

  if (!existing) {
    throw new Error('Schedule not found');
  }

  // Recalculate next run if schedule changed
  let nextRunAt = existing.nextRunAt;
  if (updates.frequency || updates.timeOfDay || updates.dayOfWeek || updates.dayOfMonth) {
    nextRunAt = calculateNextRunTime(
      updates.frequency || existing.frequency,
      updates.timeOfDay || existing.timeOfDay,
      updates.timezone || existing.timezone,
      updates.dayOfWeek ?? existing.dayOfWeek,
      updates.dayOfMonth ?? existing.dayOfMonth
    );
  }

  return prisma.reportSchedule.update({
    where: { id: scheduleId },
    data: {
      name: updates.name,
      frequency: updates.frequency,
      dayOfWeek: updates.dayOfWeek,
      dayOfMonth: updates.dayOfMonth,
      timeOfDay: updates.timeOfDay,
      timezone: updates.timezone,
      exportFormat: updates.exportFormat,
      recipients: updates.recipients,
      subject: updates.subject,
      message: updates.message,
      nextRunAt,
    },
    include: {
      savedReport: true,
    },
  });
}

/**
 * Activate/deactivate a schedule
 */
export async function toggleScheduleActive(
  organizationId: string,
  scheduleId: string,
  isActive: boolean
) {
  const existing = await prisma.reportSchedule.findFirst({
    where: { id: scheduleId, organizationId },
  });

  if (!existing) {
    throw new Error('Schedule not found');
  }

  // If activating, recalculate next run time
  let nextRunAt = existing.nextRunAt;
  if (isActive) {
    nextRunAt = calculateNextRunTime(
      existing.frequency,
      existing.timeOfDay,
      existing.timezone,
      existing.dayOfWeek,
      existing.dayOfMonth
    );
  }

  return prisma.reportSchedule.update({
    where: { id: scheduleId },
    data: {
      isActive,
      nextRunAt: isActive ? nextRunAt : null,
    },
  });
}

/**
 * Delete a schedule
 */
export async function deleteReportSchedule(
  organizationId: string,
  scheduleId: string
) {
  const existing = await prisma.reportSchedule.findFirst({
    where: { id: scheduleId, organizationId },
  });

  if (!existing) {
    throw new Error('Schedule not found');
  }

  return prisma.reportSchedule.delete({
    where: { id: scheduleId },
  });
}

/**
 * Get schedules due to run
 */
export async function getSchedulesDueToRun(
  beforeTime: Date = new Date()
): Promise<ScheduledReportRun[]> {
  const schedules = await prisma.reportSchedule.findMany({
    where: {
      isActive: true,
      nextRunAt: { lte: beforeTime },
    },
    include: {
      savedReport: true,
      organization: true,
    },
  });

  return schedules.map((s) => ({
    scheduleId: s.id,
    runAt: s.nextRunAt!,
    status: 'pending' as const,
  }));
}

/**
 * Record a schedule run
 */
export async function recordScheduleRun(
  scheduleId: string,
  status: 'completed' | 'failed',
  exportId?: string,
  error?: string
) {
  const schedule = await prisma.reportSchedule.findUnique({
    where: { id: scheduleId },
  });

  if (!schedule) {
    throw new Error('Schedule not found');
  }

  // Calculate next run time
  const nextRunAt = calculateNextRunTime(
    schedule.frequency,
    schedule.timeOfDay,
    schedule.timezone,
    schedule.dayOfWeek,
    schedule.dayOfMonth
  );

  return prisma.reportSchedule.update({
    where: { id: scheduleId },
    data: {
      lastRunAt: new Date(),
      lastStatus: status,
      lastError: error,
      nextRunAt,
    },
  });
}

/**
 * List schedules for an organization
 */
export async function listSchedules(
  organizationId: string,
  options?: {
    savedReportId?: string;
    isActive?: boolean;
  }
) {
  return prisma.reportSchedule.findMany({
    where: {
      organizationId,
      savedReportId: options?.savedReportId,
      isActive: options?.isActive,
    },
    include: {
      savedReport: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Calculate the next run time for a schedule
 */
function calculateNextRunTime(
  frequency: ScheduleFrequency,
  timeOfDay: string,
  timezone: string,
  dayOfWeek?: number | null,
  dayOfMonth?: number | null
): Date {
  const now = new Date();
  const [hours, minutes] = timeOfDay.split(':').map(Number);

  // Start with today at the specified time
  let nextRun = new Date(now);
  nextRun.setHours(hours, minutes, 0, 0);

  // If the time has already passed today, start with tomorrow
  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }

  switch (frequency) {
    case ScheduleFrequency.DAILY:
      // Already set to next occurrence
      break;

    case ScheduleFrequency.WEEKLY:
      const targetDay = dayOfWeek ?? 1; // Default to Monday
      while (nextRun.getDay() !== targetDay) {
        nextRun.setDate(nextRun.getDate() + 1);
      }
      // If we passed the time today and it's the target day, go to next week
      if (nextRun <= now && nextRun.getDay() === targetDay) {
        nextRun.setDate(nextRun.getDate() + 7);
      }
      break;

    case ScheduleFrequency.MONTHLY:
      const targetDate = dayOfMonth ?? 1;
      nextRun.setDate(targetDate);
      // If we've passed this month's date, go to next month
      if (nextRun <= now) {
        nextRun.setMonth(nextRun.getMonth() + 1);
      }
      // Handle months with fewer days
      const maxDays = new Date(nextRun.getFullYear(), nextRun.getMonth() + 1, 0).getDate();
      if (targetDate > maxDays) {
        nextRun.setDate(maxDays);
      }
      break;

    case ScheduleFrequency.QUARTERLY:
      // Run on the first of the quarter
      const currentQuarter = Math.floor(now.getMonth() / 3);
      let nextQuarterStart = new Date(now.getFullYear(), currentQuarter * 3, dayOfMonth ?? 1);
      nextQuarterStart.setHours(hours, minutes, 0, 0);

      if (nextQuarterStart <= now) {
        // Move to next quarter
        nextQuarterStart.setMonth(nextQuarterStart.getMonth() + 3);
      }
      nextRun = nextQuarterStart;
      break;
  }

  return nextRun;
}

/**
 * Get schedule run history (from exports)
 */
export async function getScheduleRunHistory(
  organizationId: string,
  scheduleId: string,
  limit: number = 10
) {
  const schedule = await prisma.reportSchedule.findFirst({
    where: { id: scheduleId, organizationId },
    select: { savedReportId: true },
  });

  if (!schedule) {
    throw new Error('Schedule not found');
  }

  const exports = await prisma.reportExport.findMany({
    where: {
      organizationId,
      savedReportId: schedule.savedReportId,
    },
    orderBy: { requestedAt: 'desc' },
    take: limit,
  });

  return exports;
}

/**
 * Get frequency options for UI
 */
export function getFrequencyOptions() {
  return [
    { value: 'DAILY', label: 'Daily', description: 'Run every day' },
    { value: 'WEEKLY', label: 'Weekly', description: 'Run once a week' },
    { value: 'MONTHLY', label: 'Monthly', description: 'Run once a month' },
    { value: 'QUARTERLY', label: 'Quarterly', description: 'Run once per quarter' },
  ];
}

/**
 * Get day of week options
 */
export function getDayOfWeekOptions() {
  return [
    { value: 0, label: 'Sunday' },
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' },
  ];
}

/**
 * Validate schedule configuration
 */
export function validateScheduleConfig(config: ReportScheduleConfig): string[] {
  const errors: string[] = [];

  if (!config.name || config.name.trim().length === 0) {
    errors.push('Schedule name is required');
  }

  if (!config.savedReportId) {
    errors.push('A saved report must be selected');
  }

  if (!config.recipients || config.recipients.length === 0) {
    errors.push('At least one recipient email is required');
  }

  // Validate emails
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const email of config.recipients) {
    if (!emailRegex.test(email)) {
      errors.push(`Invalid email address: ${email}`);
    }
  }

  // Validate time format
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timeRegex.test(config.timeOfDay)) {
    errors.push('Invalid time format. Use HH:mm format.');
  }

  // Validate day of week for weekly
  if (config.frequency === ScheduleFrequency.WEEKLY) {
    if (config.dayOfWeek === undefined || config.dayOfWeek < 0 || config.dayOfWeek > 6) {
      errors.push('Day of week is required for weekly schedules (0-6)');
    }
  }

  // Validate day of month for monthly/quarterly
  if (config.frequency === ScheduleFrequency.MONTHLY || config.frequency === ScheduleFrequency.QUARTERLY) {
    if (config.dayOfMonth === undefined || config.dayOfMonth < 1 || config.dayOfMonth > 28) {
      errors.push('Day of month is required for monthly schedules (1-28)');
    }
  }

  return errors;
}
