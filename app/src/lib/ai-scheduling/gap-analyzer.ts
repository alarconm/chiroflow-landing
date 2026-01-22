/**
 * Schedule Gap Analyzer
 * Detects gaps in provider schedules and suggests how to fill them
 */

import { prisma } from '@/lib/prisma';
import type { DayOfWeek, SuggestionType } from '@prisma/client';
import type { ScheduleGap, GapFillSuggestion, SchedulingInsight } from './types';

// Gap type - stored as string in DB
type GapType = 'CANCELLATION' | 'NATURAL' | 'BETWEEN_BLOCKS';

// Configuration
const GAP_CONFIG = {
  minGapMinutes: 15,           // Minimum gap to consider
  maxGapMinutes: 180,          // Maximum gap to analyze
  cancellationWindow: 48,      // Hours - consider recent cancellations
  waitlistMatchThreshold: 0.6, // Minimum match score for waitlist suggestions
  recallMatchThreshold: 0.5,   // Minimum match score for recall suggestions
};

/**
 * Detect gaps in a provider's schedule for a given date
 */
export async function detectScheduleGaps(
  organizationId: string,
  providerId: string,
  date: Date
): Promise<ScheduleGap[]> {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  // Get provider's schedule for this day
  const dayOfWeek = date.getDay();
  const provider = await prisma.provider.findFirst({
    where: { id: providerId, organizationId },
    include: {
      schedules: {
        where: {
          dayOfWeek: getDayOfWeekEnum(dayOfWeek) as DayOfWeek,
        },
      },
      user: {
        select: { firstName: true, lastName: true },
      },
    },
  });

  if (!provider || provider.schedules.length === 0) {
    return [];
  }

  const schedule = provider.schedules[0];
  const [scheduleStartHour, scheduleStartMin] = schedule.startTime.split(':').map(Number);
  const [scheduleEndHour, scheduleEndMin] = schedule.endTime.split(':').map(Number);

  const scheduleStart = new Date(date);
  scheduleStart.setHours(scheduleStartHour, scheduleStartMin, 0, 0);

  const scheduleEnd = new Date(date);
  scheduleEnd.setHours(scheduleEndHour, scheduleEndMin, 0, 0);

  // Get all appointments for the day
  const appointments = await prisma.appointment.findMany({
    where: {
      organizationId,
      providerId,
      startTime: { gte: dayStart, lte: dayEnd },
      status: { in: ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED'] },
    },
    orderBy: { startTime: 'asc' },
  });

  // Get recent cancellations for gap type detection
  const recentCancellations = await prisma.appointment.findMany({
    where: {
      organizationId,
      providerId,
      startTime: { gte: dayStart, lte: dayEnd },
      status: 'CANCELLED',
      updatedAt: {
        gte: new Date(Date.now() - GAP_CONFIG.cancellationWindow * 60 * 60 * 1000),
      },
    },
  });

  const cancellationTimes = new Set(
    recentCancellations.map((a) => a.startTime.toISOString())
  );

  const gaps: ScheduleGap[] = [];

  // Check for gap at start of day
  if (appointments.length === 0) {
    // Entire day is open
    const duration = (scheduleEnd.getTime() - scheduleStart.getTime()) / (1000 * 60);
    if (duration >= GAP_CONFIG.minGapMinutes && duration <= GAP_CONFIG.maxGapMinutes * 3) {
      gaps.push({
        start: scheduleStart,
        end: scheduleEnd,
        durationMinutes: duration,
        providerId,
        gapType: 'NATURAL',
        fillPriority: calculatePriority(duration, 'NATURAL'),
      });
    }
  } else {
    // Check gap before first appointment
    const firstAppt = appointments[0];
    if (firstAppt.startTime > scheduleStart) {
      const duration = (firstAppt.startTime.getTime() - scheduleStart.getTime()) / (1000 * 60);
      if (duration >= GAP_CONFIG.minGapMinutes && duration <= GAP_CONFIG.maxGapMinutes) {
        gaps.push({
          start: scheduleStart,
          end: firstAppt.startTime,
          durationMinutes: duration,
          providerId,
          gapType: 'NATURAL',
          fillPriority: calculatePriority(duration, 'NATURAL'),
        });
      }
    }

    // Check gaps between appointments
    for (let i = 0; i < appointments.length - 1; i++) {
      const current = appointments[i];
      const next = appointments[i + 1];

      const gapStart = current.endTime;
      const gapEnd = next.startTime;
      const duration = (gapEnd.getTime() - gapStart.getTime()) / (1000 * 60);

      if (duration >= GAP_CONFIG.minGapMinutes && duration <= GAP_CONFIG.maxGapMinutes) {
        // Determine gap type
        let gapType: 'CANCELLATION' | 'NATURAL' | 'BETWEEN_BLOCKS' = 'NATURAL';
        if (cancellationTimes.has(gapStart.toISOString())) {
          gapType = 'CANCELLATION';
        }

        gaps.push({
          start: gapStart,
          end: gapEnd,
          durationMinutes: duration,
          providerId,
          gapType,
          fillPriority: calculatePriority(duration, gapType),
        });
      }
    }

    // Check gap after last appointment
    const lastAppt = appointments[appointments.length - 1];
    if (lastAppt.endTime < scheduleEnd) {
      const duration = (scheduleEnd.getTime() - lastAppt.endTime.getTime()) / (1000 * 60);
      if (duration >= GAP_CONFIG.minGapMinutes && duration <= GAP_CONFIG.maxGapMinutes) {
        gaps.push({
          start: lastAppt.endTime,
          end: scheduleEnd,
          durationMinutes: duration,
          providerId,
          gapType: 'NATURAL',
          fillPriority: calculatePriority(duration, 'NATURAL'),
        });
      }
    }
  }

  return gaps.sort((a, b) => b.fillPriority - a.fillPriority);
}

/**
 * Store detected gaps in the database
 */
export async function storeScheduleGaps(
  organizationId: string,
  gaps: ScheduleGap[]
): Promise<string[]> {
  const ids: string[] = [];

  for (const gap of gaps) {
    // Check if similar gap already exists
    const existing = await prisma.schedulingGap.findFirst({
      where: {
        organizationId,
        providerId: gap.providerId,
        gapStart: gap.start,
        gapEnd: gap.end,
        isFilled: false,
      },
    });

    if (existing) {
      // Update existing
      await prisma.schedulingGap.update({
        where: { id: existing.id },
        data: {
          durationMinutes: gap.durationMinutes,
          gapType: gap.gapType,
          fillPriority: gap.fillPriority,
        },
      });
      ids.push(existing.id);
    } else {
      // Create new
      const created = await prisma.schedulingGap.create({
        data: {
          organizationId,
          providerId: gap.providerId,
          gapStart: gap.start,
          gapEnd: gap.end,
          durationMinutes: gap.durationMinutes,
          gapType: gap.gapType,
          fillPriority: gap.fillPriority,
        },
      });
      ids.push(created.id);
    }
  }

  return ids;
}

/**
 * Get open gaps for an organization
 */
export async function getOpenGaps(
  organizationId: string,
  options?: {
    providerId?: string;
    startDate?: Date;
    endDate?: Date;
    minPriority?: number;
  }
): Promise<
  Array<{
    id: string;
    providerId: string;
    providerName: string;
    startTime: Date;
    endTime: Date;
    durationMinutes: number;
    gapType: string;
    fillPriority: number;
    suggestions: GapFillSuggestion[];
  }>
> {
  const where: Record<string, unknown> = {
    organizationId,
    isFilled: false,
  };

  if (options?.providerId) {
    where.providerId = options.providerId;
  }
  if (options?.startDate) {
    where.gapStart = { gte: options.startDate };
  }
  if (options?.endDate) {
    where.gapEnd = { lte: options.endDate };
  }
  if (options?.minPriority) {
    where.fillPriority = { gte: options.minPriority };
  }

  const gaps = await prisma.schedulingGap.findMany({
    where,
    include: {
      provider: {
        include: {
          user: {
            select: { firstName: true, lastName: true },
          },
        },
      },
    },
    orderBy: [{ fillPriority: 'desc' }, { gapStart: 'asc' }],
  });

  // Generate suggestions for each gap
  const results = await Promise.all(
    gaps.map(async (gap) => {
      const suggestions = await generateGapSuggestions(organizationId, {
        id: gap.id,
        providerId: gap.providerId,
        startTime: gap.gapStart,
        endTime: gap.gapEnd,
        durationMinutes: gap.durationMinutes,
      });
      return {
        id: gap.id,
        providerId: gap.providerId,
        providerName: `${gap.provider.user.firstName} ${gap.provider.user.lastName}`,
        startTime: gap.gapStart,
        endTime: gap.gapEnd,
        durationMinutes: gap.durationMinutes,
        gapType: gap.gapType,
        fillPriority: gap.fillPriority,
        suggestions,
      };
    })
  );

  return results;
}

/**
 * Generate suggestions for filling a gap
 */
async function generateGapSuggestions(
  organizationId: string,
  gap: {
    id: string;
    providerId: string;
    startTime: Date;
    endTime: Date;
    durationMinutes: number;
  }
): Promise<GapFillSuggestion[]> {
  const suggestions: GapFillSuggestion[] = [];

  // 1. Check waitlist for matching patients
  const waitlistMatches = await prisma.waitlistEntry.findMany({
    where: {
      organizationId,
      isActive: true,
      OR: [
        { preferredProviderId: gap.providerId },
        { preferredProviderId: null },
      ],
    },
    include: {
      patient: {
        include: {
          demographics: {
            select: { firstName: true, lastName: true },
          },
        },
      },
      appointmentType: true,
    },
    take: 5,
  });

  for (const entry of waitlistMatches) {
    if (entry.appointmentType.duration <= gap.durationMinutes) {
      const matchScore = calculateWaitlistMatchScore(
        { preferredProviderId: entry.preferredProviderId, appointmentType: { duration: entry.appointmentType.duration } },
        { providerId: gap.providerId, durationMinutes: gap.durationMinutes }
      );
      if (matchScore >= GAP_CONFIG.waitlistMatchThreshold) {
        suggestions.push({
          gapId: gap.id,
          suggestionType: 'WAITLIST',
          patientId: entry.patientId,
          patientName: entry.patient.demographics
            ? `${entry.patient.demographics.firstName} ${entry.patient.demographics.lastName}`
            : 'Unknown',
          appointmentTypeId: entry.appointmentTypeId,
          appointmentTypeName: entry.appointmentType.name,
          matchScore,
          reason: `Waitlist patient seeking ${entry.appointmentType.name} appointment`,
        });
      }
    }
  }

  // 2. Check for recall candidates
  const recallCandidates = await prisma.patient.findMany({
    where: {
      organizationId,
      appointments: {
        some: {
          status: 'COMPLETED',
          providerId: gap.providerId,
        },
        none: {
          status: { in: ['SCHEDULED', 'CONFIRMED'] },
          startTime: { gte: new Date() },
        },
      },
    },
    include: {
      demographics: {
        select: { firstName: true, lastName: true },
      },
      appointments: {
        where: {
          status: 'COMPLETED',
          providerId: gap.providerId,
        },
        orderBy: { startTime: 'desc' },
        take: 1,
        include: { appointmentType: true },
      },
    },
    take: 5,
  });

  for (const patient of recallCandidates) {
    const lastAppt = patient.appointments[0];
    if (lastAppt && lastAppt.appointmentType.duration <= gap.durationMinutes) {
      const daysSinceLastVisit = Math.floor(
        (Date.now() - lastAppt.startTime.getTime()) / (1000 * 60 * 60 * 24)
      );
      const matchScore = calculateRecallMatchScore(daysSinceLastVisit, gap.durationMinutes);
      if (matchScore >= GAP_CONFIG.recallMatchThreshold) {
        suggestions.push({
          gapId: gap.id,
          suggestionType: 'RECALL',
          patientId: patient.id,
          patientName: patient.demographics
            ? `${patient.demographics.firstName} ${patient.demographics.lastName}`
            : 'Unknown',
          appointmentTypeId: lastAppt.appointmentTypeId,
          appointmentTypeName: lastAppt.appointmentType.name,
          matchScore,
          reason: `Patient due for recall - ${daysSinceLastVisit} days since last visit`,
        });
      }
    }
  }

  // 3. Check for rescheduling candidates (patients who cancelled recently)
  const rescheduleCandidates = await prisma.appointment.findMany({
    where: {
      organizationId,
      status: 'CANCELLED',
      providerId: gap.providerId,
      updatedAt: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
      },
    },
    include: {
      patient: {
        include: {
          demographics: {
            select: { firstName: true, lastName: true },
          },
        },
      },
      appointmentType: true,
    },
    take: 5,
  });

  for (const appt of rescheduleCandidates) {
    if (appt.appointmentType.duration <= gap.durationMinutes) {
      const matchScore = 0.75; // High priority for recently cancelled
      suggestions.push({
        gapId: gap.id,
        suggestionType: 'RESCHEDULE',
        patientId: appt.patientId,
        patientName: appt.patient.demographics
          ? `${appt.patient.demographics.firstName} ${appt.patient.demographics.lastName}`
          : 'Unknown',
        appointmentTypeId: appt.appointmentTypeId,
        appointmentTypeName: appt.appointmentType.name,
        matchScore,
        reason: `Recently cancelled - needs to reschedule`,
      });
    }
  }

  // Sort by match score
  return suggestions.sort((a, b) => b.matchScore - a.matchScore);
}

/**
 * Store a suggestion for a gap
 */
export async function storeSuggestion(
  organizationId: string,
  gapId: string,
  suggestion: GapFillSuggestion
): Promise<string> {
  // Map suggestion type to SuggestionType enum
  const suggestionTypeMap: Record<string, SuggestionType> = {
    'WAITLIST': 'WAITLIST_MATCH',
    'RECALL': 'RECALL',
    'RESCHEDULE': 'RESCHEDULE',
    'OPTIMAL_TIME': 'OPTIMAL_TIME',
    'GAP_FILL': 'GAP_FILL',
  };

  const created = await prisma.schedulingSuggestion.create({
    data: {
      organizationId,
      suggestionType: suggestionTypeMap[suggestion.suggestionType] || 'GAP_FILL',
      title: `Fill gap with ${suggestion.appointmentTypeName}`,
      description: suggestion.reason,
      patientId: suggestion.patientId,
      confidenceScore: suggestion.matchScore,
      contextData: {
        gapId,
        appointmentTypeId: suggestion.appointmentTypeId,
        appointmentTypeName: suggestion.appointmentTypeName,
        patientName: suggestion.patientName,
      },
    },
  });

  return created.id;
}

/**
 * Mark a gap as filled
 */
export async function markGapFilled(
  gapId: string,
  appointmentId: string
): Promise<void> {
  await prisma.schedulingGap.update({
    where: { id: gapId },
    data: {
      isFilled: true,
      filledAt: new Date(),
      filledAppointmentId: appointmentId,
    },
  });
}

/**
 * Generate insights about schedule gaps
 */
export async function generateGapInsights(
  organizationId: string,
  dateRange: { start: Date; end: Date }
): Promise<SchedulingInsight[]> {
  const insights: SchedulingInsight[] = [];

  // Count gaps by type
  const gaps = await prisma.schedulingGap.groupBy({
    by: ['gapType'],
    where: {
      organizationId,
      gapStart: { gte: dateRange.start, lte: dateRange.end },
    },
    _count: { id: true },
    _sum: { durationMinutes: true },
  });

  const cancellationGaps = gaps.find((g) => g.gapType === 'CANCELLATION');
  if (cancellationGaps && cancellationGaps._count.id > 3) {
    insights.push({
      id: `gap-cancellation-${Date.now()}`,
      type: 'warning',
      category: 'gap',
      title: 'High Cancellation Gaps',
      description: `${cancellationGaps._count.id} gaps created by cancellations, totaling ${cancellationGaps._sum?.durationMinutes || 0} minutes of lost time.`,
      priority: 8,
      actionable: true,
      suggestedAction: 'Review cancellation policies and consider appointment reminders',
      createdAt: new Date(),
    });
  }

  // Check for unfilled high-priority gaps
  const unfilledHighPriority = await prisma.schedulingGap.count({
    where: {
      organizationId,
      gapStart: { gte: new Date() },
      isFilled: false,
      fillPriority: { gte: 7 },
    },
  });

  if (unfilledHighPriority > 0) {
    insights.push({
      id: `gap-unfilled-${Date.now()}`,
      type: 'opportunity',
      category: 'gap',
      title: 'High-Priority Gaps Available',
      description: `${unfilledHighPriority} high-priority gaps could be filled from waitlist or recalls.`,
      priority: 9,
      actionable: true,
      suggestedAction: 'Review gap suggestions and contact potential patients',
      createdAt: new Date(),
    });
  }

  return insights;
}

// Helper functions

function getDayOfWeekEnum(day: number): string {
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  return days[day];
}

function calculatePriority(
  durationMinutes: number,
  gapType: 'CANCELLATION' | 'NATURAL' | 'BETWEEN_BLOCKS'
): number {
  let priority = 5; // Base priority

  // Shorter gaps get higher priority (easier to fill)
  if (durationMinutes <= 30) priority += 2;
  else if (durationMinutes <= 60) priority += 1;
  else if (durationMinutes > 120) priority -= 1;

  // Cancellation gaps get highest priority
  if (gapType === 'CANCELLATION') priority += 2;

  return Math.min(10, Math.max(1, priority));
}

function calculateWaitlistMatchScore(
  entry: { preferredProviderId: string | null; appointmentType: { duration: number } },
  gap: { providerId: string; durationMinutes: number }
): number {
  let score = 0.5; // Base score

  // Preferred provider match
  if (entry.preferredProviderId === gap.providerId) {
    score += 0.3;
  }

  // Duration match (closer to gap duration = better)
  const durationRatio = entry.appointmentType.duration / gap.durationMinutes;
  if (durationRatio >= 0.8 && durationRatio <= 1.0) {
    score += 0.2;
  } else if (durationRatio >= 0.5) {
    score += 0.1;
  }

  return Math.min(1.0, score);
}

function calculateRecallMatchScore(
  daysSinceLastVisit: number,
  gapDurationMinutes: number
): number {
  let score = 0.4; // Base score

  // Longer time since last visit = higher priority
  if (daysSinceLastVisit >= 90) score += 0.3;
  else if (daysSinceLastVisit >= 60) score += 0.2;
  else if (daysSinceLastVisit >= 30) score += 0.1;

  // Longer gaps can accommodate more appointment types
  if (gapDurationMinutes >= 60) score += 0.1;

  return Math.min(1.0, score);
}
