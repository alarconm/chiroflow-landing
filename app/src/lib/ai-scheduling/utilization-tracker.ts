/**
 * Provider Utilization Tracker
 * Tracks and analyzes provider schedule utilization
 */

import { prisma } from '@/lib/prisma';
import type { DayOfWeek } from '@prisma/client';
import type { UtilizationMetrics, UtilizationTrend, SchedulingInsight } from './types';

// Configuration
const UTILIZATION_CONFIG = {
  targetBookingRate: 0.85,       // 85% booking target
  targetUtilizationRate: 0.90,   // 90% utilization target (of booked)
  warningThreshold: 0.70,        // Warn below 70%
  criticalThreshold: 0.50,       // Critical below 50%
  revenuePerMinute: 1.25,        // $75/hour average
};

/**
 * Calculate utilization metrics for a provider on a specific date
 */
export async function calculateDailyUtilization(
  organizationId: string,
  providerId: string,
  date: Date
): Promise<UtilizationMetrics | null> {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  // Get provider info and schedule
  const provider = await prisma.provider.findFirst({
    where: { id: providerId, organizationId },
    include: {
      user: { select: { firstName: true, lastName: true } },
      schedules: {
        where: {
          isActive: true,
          dayOfWeek: getDayOfWeekEnum(date.getDay()) as DayOfWeek,
        },
      },
    },
  });

  if (!provider || provider.schedules.length === 0) {
    return null;
  }

  const schedule = provider.schedules[0];
  const availableMinutes = calculateScheduleMinutes(schedule.startTime, schedule.endTime);

  // Get all appointments for the day
  const appointments = await prisma.appointment.findMany({
    where: {
      organizationId,
      providerId,
      startTime: { gte: dayStart, lte: dayEnd },
    },
    include: { appointmentType: true },
  });

  // Calculate metrics
  let bookedMinutes = 0;
  let utilizedMinutes = 0;
  let scheduledCount = 0;
  let completedCount = 0;
  let noShowCount = 0;
  let cancelledCount = 0;

  for (const appt of appointments) {
    const duration = appt.appointmentType.duration;

    if (['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED'].includes(appt.status)) {
      bookedMinutes += duration;
      scheduledCount++;

      if (appt.status === 'COMPLETED') {
        utilizedMinutes += duration;
        completedCount++;
      }
    } else if (appt.status === 'NO_SHOW') {
      noShowCount++;
    } else if (appt.status === 'CANCELLED') {
      cancelledCount++;
    }
  }

  const bookingRate = availableMinutes > 0 ? bookedMinutes / availableMinutes : 0;
  const utilizationRate = bookedMinutes > 0 ? utilizedMinutes / bookedMinutes : 0;
  const overallRate = availableMinutes > 0 ? utilizedMinutes / availableMinutes : 0;

  const potentialRevenue = availableMinutes * UTILIZATION_CONFIG.revenuePerMinute;
  const actualRevenue = utilizedMinutes * UTILIZATION_CONFIG.revenuePerMinute;
  const lostRevenue = (availableMinutes - utilizedMinutes) * UTILIZATION_CONFIG.revenuePerMinute;

  return {
    date,
    providerId,
    providerName: `${provider.user.firstName} ${provider.user.lastName}`,
    availableMinutes,
    bookedMinutes,
    utilizedMinutes,
    bookingRate: Math.round(bookingRate * 100) / 100,
    utilizationRate: Math.round(utilizationRate * 100) / 100,
    overallRate: Math.round(overallRate * 100) / 100,
    scheduledCount,
    completedCount,
    noShowCount,
    cancelledCount,
    potentialRevenue: Math.round(potentialRevenue),
    actualRevenue: Math.round(actualRevenue),
    lostRevenue: Math.round(lostRevenue),
  };
}

/**
 * Store utilization metrics in the database
 */
export async function storeUtilizationMetrics(
  organizationId: string,
  metrics: UtilizationMetrics
): Promise<string> {
  const existing = await prisma.providerUtilization.findFirst({
    where: {
      organizationId,
      providerId: metrics.providerId,
      date: metrics.date,
    },
  });

  if (existing) {
    await prisma.providerUtilization.update({
      where: { id: existing.id },
      data: {
        availableMinutes: metrics.availableMinutes,
        bookedMinutes: metrics.bookedMinutes,
        utilizedMinutes: metrics.utilizedMinutes,
        bookingRate: metrics.bookingRate,
        utilizationRate: metrics.utilizationRate,
        overallRate: metrics.overallRate,
        scheduledCount: metrics.scheduledCount,
        completedCount: metrics.completedCount,
        noShowCount: metrics.noShowCount,
        cancelledCount: metrics.cancelledCount,
        potentialRevenue: metrics.potentialRevenue,
        actualRevenue: metrics.actualRevenue,
      },
    });
    return existing.id;
  }

  const created = await prisma.providerUtilization.create({
    data: {
      organizationId,
      providerId: metrics.providerId,
      date: metrics.date,
      availableMinutes: metrics.availableMinutes,
      bookedMinutes: metrics.bookedMinutes,
      utilizedMinutes: metrics.utilizedMinutes,
      bookingRate: metrics.bookingRate,
      utilizationRate: metrics.utilizationRate,
      overallRate: metrics.overallRate,
      scheduledCount: metrics.scheduledCount,
      completedCount: metrics.completedCount,
      noShowCount: metrics.noShowCount,
      cancelledCount: metrics.cancelledCount,
      potentialRevenue: metrics.potentialRevenue,
      actualRevenue: metrics.actualRevenue,
    },
  });

  return created.id;
}

/**
 * Get utilization trend for a provider
 */
export async function getUtilizationTrend(
  organizationId: string,
  providerId: string,
  period: 'day' | 'week' | 'month',
  count: number = 7
): Promise<UtilizationTrend> {
  const endDate = new Date();
  const startDate = new Date();

  switch (period) {
    case 'day':
      startDate.setDate(startDate.getDate() - count);
      break;
    case 'week':
      startDate.setDate(startDate.getDate() - count * 7);
      break;
    case 'month':
      startDate.setMonth(startDate.getMonth() - count);
      break;
  }

  const metrics = await prisma.providerUtilization.findMany({
    where: {
      organizationId,
      providerId,
      date: { gte: startDate, lte: endDate },
    },
    orderBy: { date: 'asc' },
  });

  const data = metrics.map((m) => ({
    date: m.date,
    bookingRate: m.bookingRate,
    utilizationRate: m.utilizationRate,
    overallRate: m.overallRate,
  }));

  // Calculate averages
  const totals = data.reduce(
    (acc, d) => ({
      bookingRate: acc.bookingRate + d.bookingRate,
      utilizationRate: acc.utilizationRate + d.utilizationRate,
      overallRate: acc.overallRate + d.overallRate,
    }),
    { bookingRate: 0, utilizationRate: 0, overallRate: 0 }
  );

  const count_actual = data.length || 1;
  const averages = {
    bookingRate: Math.round((totals.bookingRate / count_actual) * 100) / 100,
    utilizationRate: Math.round((totals.utilizationRate / count_actual) * 100) / 100,
    overallRate: Math.round((totals.overallRate / count_actual) * 100) / 100,
  };

  // Determine trend
  let trend: 'improving' | 'stable' | 'declining' = 'stable';
  if (data.length >= 3) {
    const recentAvg = data.slice(-3).reduce((acc, d) => acc + d.overallRate, 0) / 3;
    const olderAvg = data.slice(0, 3).reduce((acc, d) => acc + d.overallRate, 0) / 3;

    if (recentAvg > olderAvg + 0.05) {
      trend = 'improving';
    } else if (recentAvg < olderAvg - 0.05) {
      trend = 'declining';
    }
  }

  return { period, data, averages, trend };
}

/**
 * Get organization-wide utilization summary
 */
export async function getOrganizationUtilization(
  organizationId: string,
  dateRange: { start: Date; end: Date }
): Promise<{
  overall: UtilizationMetrics;
  byProvider: UtilizationMetrics[];
  insights: SchedulingInsight[];
}> {
  // Get all providers
  const providers = await prisma.provider.findMany({
    where: { organizationId, isActive: true },
    include: { user: { select: { firstName: true, lastName: true } } },
  });

  const providerMetrics: UtilizationMetrics[] = [];

  // Calculate metrics for each provider
  for (const provider of providers) {
    const metrics = await prisma.providerUtilization.aggregate({
      where: {
        organizationId,
        providerId: provider.id,
        date: { gte: dateRange.start, lte: dateRange.end },
      },
      _sum: {
        availableMinutes: true,
        bookedMinutes: true,
        utilizedMinutes: true,
        scheduledCount: true,
        completedCount: true,
        noShowCount: true,
        cancelledCount: true,
        potentialRevenue: true,
        actualRevenue: true,
      },
      _avg: {
        bookingRate: true,
        utilizationRate: true,
        overallRate: true,
      },
    });

    // Calculate lost revenue from available - actual
    const availableMinutes = metrics._sum?.availableMinutes || 0;
    const actualRevenue = metrics._sum?.actualRevenue || 0;
    const potentialRevenue = metrics._sum?.potentialRevenue || 0;
    const lostRevenue = potentialRevenue - actualRevenue;

    providerMetrics.push({
      date: dateRange.start,
      providerId: provider.id,
      providerName: `${provider.user.firstName} ${provider.user.lastName}`,
      availableMinutes,
      bookedMinutes: metrics._sum?.bookedMinutes || 0,
      utilizedMinutes: metrics._sum?.utilizedMinutes || 0,
      bookingRate: Math.round((metrics._avg?.bookingRate || 0) * 100) / 100,
      utilizationRate: Math.round((metrics._avg?.utilizationRate || 0) * 100) / 100,
      overallRate: Math.round((metrics._avg?.overallRate || 0) * 100) / 100,
      scheduledCount: metrics._sum?.scheduledCount || 0,
      completedCount: metrics._sum?.completedCount || 0,
      noShowCount: metrics._sum?.noShowCount || 0,
      cancelledCount: metrics._sum?.cancelledCount || 0,
      potentialRevenue,
      actualRevenue,
      lostRevenue,
    });
  }

  // Calculate overall metrics
  const overall: UtilizationMetrics = {
    date: dateRange.start,
    providerId: 'all',
    providerName: 'All Providers',
    availableMinutes: providerMetrics.reduce((acc, p) => acc + p.availableMinutes, 0),
    bookedMinutes: providerMetrics.reduce((acc, p) => acc + p.bookedMinutes, 0),
    utilizedMinutes: providerMetrics.reduce((acc, p) => acc + p.utilizedMinutes, 0),
    bookingRate: 0,
    utilizationRate: 0,
    overallRate: 0,
    scheduledCount: providerMetrics.reduce((acc, p) => acc + p.scheduledCount, 0),
    completedCount: providerMetrics.reduce((acc, p) => acc + p.completedCount, 0),
    noShowCount: providerMetrics.reduce((acc, p) => acc + p.noShowCount, 0),
    cancelledCount: providerMetrics.reduce((acc, p) => acc + p.cancelledCount, 0),
    potentialRevenue: providerMetrics.reduce((acc, p) => acc + (p.potentialRevenue || 0), 0),
    actualRevenue: providerMetrics.reduce((acc, p) => acc + (p.actualRevenue || 0), 0),
    lostRevenue: providerMetrics.reduce((acc, p) => acc + (p.lostRevenue || 0), 0),
  };

  if (overall.availableMinutes > 0) {
    overall.bookingRate = Math.round((overall.bookedMinutes / overall.availableMinutes) * 100) / 100;
  }
  if (overall.bookedMinutes > 0) {
    overall.utilizationRate = Math.round((overall.utilizedMinutes / overall.bookedMinutes) * 100) / 100;
  }
  if (overall.availableMinutes > 0) {
    overall.overallRate = Math.round((overall.utilizedMinutes / overall.availableMinutes) * 100) / 100;
  }

  // Generate insights
  const insights = generateUtilizationInsights(overall, providerMetrics);

  return { overall, byProvider: providerMetrics, insights };
}

/**
 * Generate utilization insights
 */
function generateUtilizationInsights(
  overall: UtilizationMetrics,
  byProvider: UtilizationMetrics[]
): SchedulingInsight[] {
  const insights: SchedulingInsight[] = [];

  // Overall booking rate insight
  if (overall.bookingRate < UTILIZATION_CONFIG.criticalThreshold) {
    insights.push({
      id: `util-booking-critical-${Date.now()}`,
      type: 'warning',
      category: 'utilization',
      title: 'Critical: Low Booking Rate',
      description: `Overall booking rate is ${Math.round(overall.bookingRate * 100)}%, below the critical threshold of ${Math.round(UTILIZATION_CONFIG.criticalThreshold * 100)}%.`,
      priority: 10,
      actionable: true,
      suggestedAction: 'Review marketing efforts and consider promotional campaigns to increase bookings.',
      createdAt: new Date(),
    });
  } else if (overall.bookingRate < UTILIZATION_CONFIG.warningThreshold) {
    insights.push({
      id: `util-booking-warning-${Date.now()}`,
      type: 'warning',
      category: 'utilization',
      title: 'Low Booking Rate',
      description: `Overall booking rate is ${Math.round(overall.bookingRate * 100)}%, below the target of ${Math.round(UTILIZATION_CONFIG.targetBookingRate * 100)}%.`,
      priority: 7,
      actionable: true,
      suggestedAction: 'Consider running recall campaigns or contacting waitlist patients.',
      createdAt: new Date(),
    });
  }

  // No-show rate insight
  const noShowRate = overall.scheduledCount > 0
    ? overall.noShowCount / overall.scheduledCount
    : 0;

  if (noShowRate > 0.15) {
    insights.push({
      id: `util-noshow-high-${Date.now()}`,
      type: 'warning',
      category: 'no_show',
      title: 'High No-Show Rate',
      description: `No-show rate is ${Math.round(noShowRate * 100)}%, which is above the acceptable threshold of 15%.`,
      priority: 8,
      actionable: true,
      suggestedAction: 'Implement or enhance appointment reminders and consider deposit requirements.',
      data: { noShowCount: overall.noShowCount, rate: noShowRate },
      createdAt: new Date(),
    });
  }

  // Provider-specific insights
  for (const provider of byProvider) {
    if (provider.overallRate < UTILIZATION_CONFIG.criticalThreshold) {
      insights.push({
        id: `util-provider-${provider.providerId}-${Date.now()}`,
        type: 'warning',
        category: 'utilization',
        title: `Low Utilization: ${provider.providerName}`,
        description: `${provider.providerName} has an overall utilization of ${Math.round(provider.overallRate * 100)}%.`,
        priority: 6,
        actionable: true,
        suggestedAction: `Review ${provider.providerName}'s schedule and consider adjusting availability.`,
        createdAt: new Date(),
      });
    }
  }

  // Revenue opportunity insight
  if ((overall.lostRevenue || 0) > 1000) {
    insights.push({
      id: `util-revenue-${Date.now()}`,
      type: 'opportunity',
      category: 'utilization',
      title: 'Revenue Opportunity',
      description: `$${overall.lostRevenue?.toLocaleString()} in potential revenue lost due to unfilled time slots.`,
      priority: 9,
      actionable: true,
      suggestedAction: 'Focus on filling gaps and reducing no-shows to capture this revenue.',
      data: { lostRevenue: overall.lostRevenue },
      createdAt: new Date(),
    });
  }

  return insights.sort((a, b) => b.priority - a.priority);
}

/**
 * Refresh utilization data for a date range
 */
export async function refreshUtilizationData(
  organizationId: string,
  dateRange: { start: Date; end: Date }
): Promise<number> {
  const providers = await prisma.provider.findMany({
    where: { organizationId, isActive: true },
  });

  let count = 0;

  for (const provider of providers) {
    const currentDate = new Date(dateRange.start);
    while (currentDate <= dateRange.end) {
      const metrics = await calculateDailyUtilization(
        organizationId,
        provider.id,
        new Date(currentDate)
      );

      if (metrics) {
        await storeUtilizationMetrics(organizationId, metrics);
        count++;
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  return count;
}

// Helper functions

function getDayOfWeekEnum(day: number): string {
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  return days[day];
}

function calculateScheduleMinutes(startTime: string, endTime: string): number {
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);

  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  return endMinutes - startMinutes;
}
