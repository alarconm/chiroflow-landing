/**
 * Scheduling Optimizer
 * Finds optimal appointment slots based on multiple factors
 */

import { prisma } from '@/lib/prisma';
import type { DayOfWeek } from '@prisma/client';
import type {
  OptimalSlot,
  OptimalScheduleRequest,
  SchedulingPreferences,
  SchedulingInsight,
} from './types';
import { predictNoShow } from './no-show-predictor';

// Configuration
const OPTIMIZER_CONFIG = {
  maxSlotsToReturn: 10,
  lookAheadDays: 30,
  urgencyWeights: {
    low: 0.5,
    normal: 1.0,
    high: 1.5,
    urgent: 2.0,
  },
  weights: {
    providerUtilization: 0.25,
    patientPreference: 0.30,
    appointmentTypeMatch: 0.20,
    dayBalance: 0.15,
    noShowRisk: 0.10,
  },
};

/**
 * Find optimal appointment slots for a patient
 */
export async function findOptimalSlots(
  organizationId: string,
  request: OptimalScheduleRequest
): Promise<OptimalSlot[]> {
  const { patientId, appointmentTypeId, duration, dateRange, preferences, urgency = 'normal' } = request;

  // Get appointment type details
  const appointmentType = await prisma.appointmentType.findFirst({
    where: { id: appointmentTypeId, organizationId },
  });

  if (!appointmentType) {
    throw new Error('Appointment type not found');
  }

  // Get patient preferences and history
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId },
    include: {
      appointments: {
        where: { status: 'COMPLETED' },
        orderBy: { startTime: 'desc' },
        take: 10,
        include: { provider: true },
      },
    },
  });

  if (!patient) {
    throw new Error('Patient not found');
  }

  // Get eligible providers
  const providers = await getEligibleProviders(
    organizationId,
    appointmentTypeId,
    preferences?.preferredProviderIds
  );

  if (providers.length === 0) {
    return [];
  }

  // Collect all potential slots
  const allSlots: OptimalSlot[] = [];

  // Iterate through date range
  const currentDate = new Date(dateRange.start);
  while (currentDate <= dateRange.end) {
    // Skip days based on preferences
    const dayOfWeek = getDayOfWeekEnum(currentDate.getDay());
    if (preferences?.avoidDays?.includes(dayOfWeek)) {
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }

    // Check if this is a preferred day
    const isPreferredDay = !preferences?.preferredDays ||
      preferences.preferredDays.length === 0 ||
      preferences.preferredDays.includes(dayOfWeek);

    // Check each provider's availability
    for (const provider of providers) {
      const slots = await findProviderSlots(
        organizationId,
        provider,
        new Date(currentDate),
        duration,
        preferences,
        isPreferredDay,
        patient.appointments.map((a) => a.providerId)
      );

      allSlots.push(...slots);
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Score and rank slots
  const scoredSlots = await scoreSlots(
    organizationId,
    allSlots,
    patientId,
    appointmentTypeId,
    urgency
  );

  // Return top slots
  return scoredSlots
    .sort((a, b) => b.score - a.score)
    .slice(0, OPTIMIZER_CONFIG.maxSlotsToReturn);
}

/**
 * Get providers eligible for an appointment type
 */
async function getEligibleProviders(
  organizationId: string,
  appointmentTypeId: string,
  preferredProviderIds?: string[]
): Promise<Array<{ id: string; name: string }>> {
  const where: Record<string, unknown> = {
    organizationId,
    isActive: true,
    appointmentTypes: {
      some: { id: appointmentTypeId },
    },
  };

  if (preferredProviderIds && preferredProviderIds.length > 0) {
    where.id = { in: preferredProviderIds };
  }

  const providers = await prisma.provider.findMany({
    where,
    include: {
      user: { select: { firstName: true, lastName: true } },
    },
  });

  return providers.map((p) => ({
    id: p.id,
    name: `${p.user.firstName} ${p.user.lastName}`,
  }));
}

/**
 * Find available slots for a provider on a specific date
 */
async function findProviderSlots(
  organizationId: string,
  provider: { id: string; name: string },
  date: Date,
  duration: number,
  preferences: SchedulingPreferences | undefined,
  isPreferredDay: boolean,
  patientProviderHistory: string[]
): Promise<OptimalSlot[]> {
  const slots: OptimalSlot[] = [];

  // Get provider's schedule for this day
  const dayOfWeek = getDayOfWeekEnum(date.getDay());
  const schedule = await prisma.providerSchedule.findFirst({
    where: {
      providerId: provider.id,
      dayOfWeek,
      isActive: true,
    },
  });

  if (!schedule) {
    return slots;
  }

  // Get existing appointments for the day
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const existingAppointments = await prisma.appointment.findMany({
    where: {
      organizationId,
      providerId: provider.id,
      startTime: { gte: dayStart, lte: dayEnd },
      status: { in: ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'] },
    },
    orderBy: { startTime: 'asc' },
  });

  // Find available time slots
  const availableSlots = findAvailableTimeSlots(
    schedule.startTime,
    schedule.endTime,
    duration,
    existingAppointments,
    preferences?.preferredTimeStart,
    preferences?.preferredTimeEnd
  );

  // Create optimal slot objects
  for (const slot of availableSlots) {
    const slotDate = new Date(date);
    const [hour, min] = slot.split(':').map(Number);
    slotDate.setHours(hour, min, 0, 0);

    const isPreviousProvider = patientProviderHistory.includes(provider.id);

    slots.push({
      date: slotDate,
      time: slot,
      providerId: provider.id,
      providerName: provider.name,
      score: 0, // Will be calculated later
      factors: {
        providerUtilization: 0,
        patientPreference: isPreferredDay ? 0.8 : 0.5,
        appointmentTypeMatch: isPreviousProvider ? 0.9 : 0.7,
      },
    });
  }

  return slots;
}

/**
 * Find available time slots within a schedule
 */
function findAvailableTimeSlots(
  scheduleStart: string,
  scheduleEnd: string,
  duration: number,
  existingAppointments: Array<{ startTime: Date; endTime: Date }>,
  preferredStart?: string,
  preferredEnd?: string
): string[] {
  const slots: string[] = [];

  const [startHour, startMin] = scheduleStart.split(':').map(Number);
  const [endHour, endMin] = scheduleEnd.split(':').map(Number);

  // Apply preferred time constraints
  let effectiveStartHour = startHour;
  let effectiveStartMin = startMin;
  let effectiveEndHour = endHour;
  let effectiveEndMin = endMin;

  if (preferredStart) {
    const [prefStartHour, prefStartMin] = preferredStart.split(':').map(Number);
    if (prefStartHour > effectiveStartHour || (prefStartHour === effectiveStartHour && prefStartMin > effectiveStartMin)) {
      effectiveStartHour = prefStartHour;
      effectiveStartMin = prefStartMin;
    }
  }

  if (preferredEnd) {
    const [prefEndHour, prefEndMin] = preferredEnd.split(':').map(Number);
    if (prefEndHour < effectiveEndHour || (prefEndHour === effectiveEndHour && prefEndMin < effectiveEndMin)) {
      effectiveEndHour = prefEndHour;
      effectiveEndMin = prefEndMin;
    }
  }

  // Generate potential start times (every 15 minutes)
  let currentMinutes = effectiveStartHour * 60 + effectiveStartMin;
  const endMinutes = effectiveEndHour * 60 + effectiveEndMin;

  while (currentMinutes + duration <= endMinutes) {
    const slotStart = currentMinutes;
    const slotEnd = slotStart + duration;

    // Check if slot conflicts with existing appointments
    const hasConflict = existingAppointments.some((appt) => {
      const apptStartMinutes = appt.startTime.getHours() * 60 + appt.startTime.getMinutes();
      const apptEndMinutes = appt.endTime.getHours() * 60 + appt.endTime.getMinutes();

      return (
        (slotStart >= apptStartMinutes && slotStart < apptEndMinutes) ||
        (slotEnd > apptStartMinutes && slotEnd <= apptEndMinutes) ||
        (slotStart <= apptStartMinutes && slotEnd >= apptEndMinutes)
      );
    });

    if (!hasConflict) {
      const hour = Math.floor(slotStart / 60);
      const min = slotStart % 60;
      slots.push(`${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`);
    }

    currentMinutes += 15; // 15-minute intervals
  }

  return slots;
}

/**
 * Score and rank slots
 */
async function scoreSlots(
  organizationId: string,
  slots: OptimalSlot[],
  patientId: string,
  appointmentTypeId: string,
  urgency: 'low' | 'normal' | 'high' | 'urgent'
): Promise<OptimalSlot[]> {
  const urgencyWeight = OPTIMIZER_CONFIG.urgencyWeights[urgency];

  // Get utilization data for providers
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const utilizations = await prisma.providerUtilization.groupBy({
    by: ['providerId'],
    where: {
      organizationId,
      date: { gte: weekAgo, lte: today },
    },
    _avg: { overallRate: true },
  });

  const utilizationMap = new Map(
    utilizations.map((u) => [u.providerId, u._avg.overallRate || 0.5])
  );

  // Score each slot
  for (const slot of slots) {
    // Provider utilization factor (prefer providers with lower utilization to balance load)
    const providerUtil = utilizationMap.get(slot.providerId) || 0.5;
    slot.factors.providerUtilization = 1 - providerUtil; // Invert: lower util = higher score

    // Time of day factor (prefer morning slots for urgent, afternoon for routine)
    const [hour] = slot.time.split(':').map(Number);
    let timeScore = 0.5;
    if (urgency === 'urgent' && hour < 12) {
      timeScore = 0.9;
    } else if (urgency === 'low' && hour >= 14) {
      timeScore = 0.8;
    } else if (hour >= 9 && hour <= 16) {
      timeScore = 0.7; // Peak hours
    }

    // Days away factor (sooner is better for high urgency)
    const daysAway = Math.floor((slot.date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    let daysFactor = 0.5;
    if (urgency === 'urgent' && daysAway <= 1) {
      daysFactor = 1.0;
    } else if (urgency === 'high' && daysAway <= 3) {
      daysFactor = 0.9;
    } else if (daysAway <= 7) {
      daysFactor = 0.7;
    }

    // Calculate final score
    const weights = OPTIMIZER_CONFIG.weights;
    slot.score = Math.round(
      (slot.factors.providerUtilization * weights.providerUtilization +
        slot.factors.patientPreference * weights.patientPreference +
        slot.factors.appointmentTypeMatch * weights.appointmentTypeMatch +
        timeScore * weights.dayBalance +
        (1 - providerUtil) * weights.noShowRisk) *
        urgencyWeight *
        100
    );
  }

  return slots;
}

/**
 * Get scheduling suggestions for today
 */
export async function getTodaySuggestions(
  organizationId: string
): Promise<SchedulingInsight[]> {
  const insights: SchedulingInsight[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Check for unconfirmed appointments
  const unconfirmedCount = await prisma.appointment.count({
    where: {
      organizationId,
      status: 'SCHEDULED',
      startTime: { gte: today, lt: tomorrow },
    },
  });

  if (unconfirmedCount > 0) {
    insights.push({
      id: `suggest-unconfirmed-${Date.now()}`,
      type: 'warning',
      category: 'no_show',
      title: 'Unconfirmed Appointments',
      description: `${unconfirmedCount} appointment(s) for today haven't been confirmed yet.`,
      priority: 8,
      actionable: true,
      suggestedAction: 'Send confirmation reminders to these patients.',
      data: { count: unconfirmedCount },
      createdAt: new Date(),
    });
  }

  // Check for low booking days this week
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const dailyBookings = await prisma.appointment.groupBy({
    by: ['startTime'],
    where: {
      organizationId,
      startTime: { gte: today, lt: weekEnd },
      status: { in: ['SCHEDULED', 'CONFIRMED'] },
    },
    _count: true,
  });

  // Find days with low bookings
  const avgBookings = dailyBookings.length > 0
    ? dailyBookings.reduce((sum, d) => sum + d._count, 0) / dailyBookings.length
    : 0;

  if (avgBookings < 5) {
    insights.push({
      id: `suggest-low-bookings-${Date.now()}`,
      type: 'opportunity',
      category: 'utilization',
      title: 'Low Booking Week',
      description: `Average of ${avgBookings.toFixed(1)} bookings per day this week. Consider promotional outreach.`,
      priority: 6,
      actionable: true,
      suggestedAction: 'Run a recall campaign or contact waitlist patients.',
      createdAt: new Date(),
    });
  }

  return insights;
}

/**
 * Suggest schedule improvements
 */
export async function suggestScheduleImprovements(
  organizationId: string,
  dateRange: { start: Date; end: Date }
): Promise<SchedulingInsight[]> {
  const insights: SchedulingInsight[] = [];

  // Analyze appointment type distribution
  const typeDistribution = await prisma.appointment.groupBy({
    by: ['appointmentTypeId'],
    where: {
      organizationId,
      startTime: { gte: dateRange.start, lte: dateRange.end },
    },
    _count: true,
  });

  // Check for imbalanced distribution
  if (typeDistribution.length > 1) {
    const total = typeDistribution.reduce((sum, t) => sum + t._count, 0);
    const maxType = typeDistribution.reduce((max, t) => t._count > max._count ? t : max);

    if (maxType._count / total > 0.6) {
      const appointmentType = await prisma.appointmentType.findUnique({
        where: { id: maxType.appointmentTypeId },
      });

      if (appointmentType) {
        insights.push({
          id: `suggest-type-balance-${Date.now()}`,
          type: 'info',
          category: 'utilization',
          title: 'Appointment Type Concentration',
          description: `${Math.round((maxType._count / total) * 100)}% of appointments are ${appointmentType.name}. Consider diversifying services.`,
          priority: 4,
          actionable: false,
          createdAt: new Date(),
        });
      }
    }
  }

  // Analyze no-show patterns by time
  const noShows = await prisma.appointment.findMany({
    where: {
      organizationId,
      status: 'NO_SHOW',
      startTime: { gte: dateRange.start, lte: dateRange.end },
    },
    select: { startTime: true },
  });

  if (noShows.length >= 5) {
    const hourCounts: Record<number, number> = {};
    for (const appt of noShows) {
      const hour = appt.startTime.getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }

    const maxHour = Object.entries(hourCounts).reduce(
      (max, [hour, count]) => (count > max.count ? { hour: parseInt(hour), count } : max),
      { hour: 0, count: 0 }
    );

    if (maxHour.count >= 3) {
      const period = maxHour.hour < 12 ? 'morning' : maxHour.hour < 17 ? 'afternoon' : 'evening';
      insights.push({
        id: `suggest-noshow-pattern-${Date.now()}`,
        type: 'warning',
        category: 'no_show',
        title: 'No-Show Time Pattern',
        description: `Higher no-show rate for ${period} appointments around ${maxHour.hour}:00. Consider additional reminders for this time slot.`,
        priority: 7,
        actionable: true,
        suggestedAction: `Add an extra reminder for appointments scheduled around ${maxHour.hour}:00.`,
        data: { hour: maxHour.hour, count: maxHour.count },
        createdAt: new Date(),
      });
    }
  }

  return insights;
}

// Helper functions

function getDayOfWeekEnum(day: number): DayOfWeek {
  const days: DayOfWeek[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  return days[day];
}
