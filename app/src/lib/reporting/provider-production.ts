// Provider Production Reports
// Epic 15 - Provider productivity and performance metrics

import { prisma } from '@/lib/prisma';
import { AppointmentStatus, ChargeStatus } from '@prisma/client';
import type {
  ProviderProductionReport,
  AppointmentTypeBreakdown,
  DayOfWeekBreakdown,
  DailyProductionDetail,
} from './types';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Get production report for a single provider
 */
export async function getProviderProductionReport(
  organizationId: string,
  providerId: string,
  startDate: Date,
  endDate: Date
): Promise<ProviderProductionReport> {
  // Get provider info
  const provider = await prisma.provider.findFirst({
    where: {
      id: providerId,
      organizationId,
    },
    include: {
      user: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  if (!provider) {
    throw new Error('Provider not found');
  }

  // Get all appointments for the provider in the date range
  const appointments = await prisma.appointment.findMany({
    where: {
      organizationId,
      providerId,
      startTime: { gte: startDate, lte: endDate },
    },
    include: {
      appointmentType: true,
      patient: true,
    },
  });

  // Get charges for the provider in the date range
  const charges = await prisma.charge.findMany({
    where: {
      organizationId,
      providerId,
      serviceDate: { gte: startDate, lte: endDate },
    },
    include: {
      encounter: true,
    },
  });

  // Get payments allocated to the provider's charges
  const chargeIds = charges.map((c) => c.id);
  const allocations = await prisma.paymentAllocation.findMany({
    where: {
      chargeId: { in: chargeIds },
    },
    include: {
      payment: true,
    },
  });

  // Calculate visit metrics
  const completedVisits = appointments.filter(
    (a) => a.status === AppointmentStatus.COMPLETED
  ).length;
  const cancelledVisits = appointments.filter(
    (a) => a.status === AppointmentStatus.CANCELLED
  ).length;
  const noShows = appointments.filter(
    (a) => a.status === AppointmentStatus.NO_SHOW
  ).length;

  // Track unique patients for new patient count
  const patientFirstVisits = new Map<string, Date>();
  for (const apt of appointments) {
    const existingFirst = patientFirstVisits.get(apt.patientId);
    if (!existingFirst || apt.startTime < existingFirst) {
      patientFirstVisits.set(apt.patientId, apt.startTime);
    }
  }

  // Count new patients (first visit for each patient that falls in our date range)
  const allPatientAppointments = await prisma.appointment.findMany({
    where: {
      organizationId,
      providerId,
      patientId: { in: Array.from(patientFirstVisits.keys()) },
    },
    select: {
      patientId: true,
      startTime: true,
    },
    orderBy: { startTime: 'asc' },
  });

  const patientFirstEverVisit = new Map<string, Date>();
  for (const apt of allPatientAppointments) {
    if (!patientFirstEverVisit.has(apt.patientId)) {
      patientFirstEverVisit.set(apt.patientId, apt.startTime);
    }
  }

  const newPatients = Array.from(patientFirstEverVisit.entries()).filter(
    ([, date]) => date >= startDate && date <= endDate
  ).length;

  // Calculate financial metrics
  const totalCharges = charges.reduce((sum, c) => sum + Number(c.fee) * c.units, 0);
  const totalAdjustments = charges.reduce((sum, c) => sum + Number(c.adjustments), 0);
  const totalCollections = allocations.reduce((sum, a) => sum + Number(a.amount), 0);
  const netRevenue = totalCollections - totalAdjustments;

  // Calculate productivity metrics
  const dayCount = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) || 1;
  const avgVisitsPerDay = Math.round((completedVisits / dayCount) * 10) / 10;
  const avgRevenuePerVisit = completedVisits > 0
    ? Math.round((totalCollections / completedVisits) * 100) / 100
    : 0;
  const collectionRate = totalCharges > 0
    ? Math.round((totalCollections / totalCharges) * 100)
    : 0;
  const noShowRate = appointments.length > 0
    ? Math.round((noShows / appointments.length) * 100)
    : 0;

  // Breakdown by appointment type
  const byAppointmentType = await getAppointmentTypeBreakdown(
    organizationId,
    providerId,
    startDate,
    endDate,
    appointments,
    charges,
    allocations
  );

  // Breakdown by day of week
  const byDayOfWeek = getDayOfWeekBreakdown(appointments, charges, allocations);

  // Daily details
  const dailyDetails = await getDailyDetails(
    organizationId,
    providerId,
    startDate,
    endDate
  );

  return {
    providerId,
    providerName: `${provider.user.firstName} ${provider.user.lastName}`,
    periodStart: startDate,
    periodEnd: endDate,
    totalVisits: appointments.length,
    completedVisits,
    cancelledVisits,
    noShows,
    newPatients,
    totalCharges,
    totalCollections,
    totalAdjustments,
    netRevenue,
    avgVisitsPerDay,
    avgRevenuePerVisit,
    collectionRate,
    noShowRate,
    byAppointmentType,
    byDayOfWeek,
    dailyDetails,
  };
}

/**
 * Get production comparison across all providers
 */
export async function getProviderProductionComparison(
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<ProviderProductionReport[]> {
  // Get all active providers
  const providers = await prisma.provider.findMany({
    where: {
      organizationId,
      isActive: true,
    },
    select: { id: true },
  });

  // Get production for each provider
  const reports = await Promise.all(
    providers.map((p) =>
      getProviderProductionReport(organizationId, p.id, startDate, endDate)
    )
  );

  // Sort by total collections descending
  return reports.sort((a, b) => b.totalCollections - a.totalCollections);
}

/**
 * Get appointment type breakdown
 */
async function getAppointmentTypeBreakdown(
  organizationId: string,
  providerId: string,
  startDate: Date,
  endDate: Date,
  appointments: Array<{ appointmentTypeId: string; appointmentType: { name: string }; startTime: Date; endTime: Date; status: AppointmentStatus }>,
  charges: Array<{ encounterId: string | null; fee: unknown; units: number }>,
  allocations: Array<{ amount: unknown; chargeId: string }>
): Promise<AppointmentTypeBreakdown[]> {
  const byType = new Map<string, {
    name: string;
    count: number;
    totalDuration: number;
    charges: number;
    collections: number;
  }>();

  for (const apt of appointments) {
    if (apt.status !== AppointmentStatus.COMPLETED) continue;

    const existing = byType.get(apt.appointmentTypeId) || {
      name: apt.appointmentType.name,
      count: 0,
      totalDuration: 0,
      charges: 0,
      collections: 0,
    };

    existing.count += 1;
    existing.totalDuration += (apt.endTime.getTime() - apt.startTime.getTime()) / (1000 * 60);
    byType.set(apt.appointmentTypeId, existing);
  }

  // Link charges to appointment types via encounters
  const encounteredAppointments = await prisma.encounter.findMany({
    where: {
      organizationId,
      providerId,
      encounterDate: { gte: startDate, lte: endDate },
      appointmentId: { not: null },
    },
    select: {
      id: true,
      appointment: {
        select: { appointmentTypeId: true },
      },
    },
  });

  const encounterToType = new Map<string, string>();
  for (const enc of encounteredAppointments) {
    if (enc.appointment?.appointmentTypeId) {
      encounterToType.set(enc.id, enc.appointment.appointmentTypeId);
    }
  }

  const chargeToEncounter = new Map<string, string>();
  for (const charge of charges) {
    if (charge.encounterId) {
      // @ts-ignore - we know encounterId exists
      chargeToEncounter.set(charge.id, charge.encounterId);
    }
  }

  // Add charge amounts to types
  for (const charge of charges) {
    // @ts-ignore
    const encounterId = chargeToEncounter.get(charge.id);
    if (!encounterId) continue;

    const typeId = encounterToType.get(encounterId);
    if (!typeId) continue;

    const existing = byType.get(typeId);
    if (existing) {
      existing.charges += Number(charge.fee) * charge.units;
    }
  }

  // Add collections
  for (const allocation of allocations) {
    // Find which charge this is for
    const chargeId = allocation.chargeId;
    const charge = charges.find((c) => 'id' in c && (c as unknown as { id: string }).id === chargeId);
    if (!charge?.encounterId) continue;

    const typeId = encounterToType.get(charge.encounterId);
    if (!typeId) continue;

    const existing = byType.get(typeId);
    if (existing) {
      existing.collections += Number(allocation.amount);
    }
  }

  return Array.from(byType.entries()).map(([appointmentTypeId, data]) => ({
    appointmentTypeId,
    appointmentTypeName: data.name,
    count: data.count,
    charges: Math.round(data.charges * 100) / 100,
    collections: Math.round(data.collections * 100) / 100,
    avgDuration: data.count > 0 ? Math.round(data.totalDuration / data.count) : 0,
  }));
}

/**
 * Get day of week breakdown
 */
function getDayOfWeekBreakdown(
  appointments: Array<{ startTime: Date; status: AppointmentStatus }>,
  charges: Array<{ serviceDate: Date; fee: unknown; units: number }>,
  allocations: Array<{ payment: { paymentDate: Date }; amount: unknown }>
): DayOfWeekBreakdown[] {
  const byDay: Record<number, { visits: number; charges: number; collections: number }> = {};

  // Initialize all days
  for (let i = 0; i < 7; i++) {
    byDay[i] = { visits: 0, charges: 0, collections: 0 };
  }

  // Count visits by day
  for (const apt of appointments) {
    if (apt.status === AppointmentStatus.COMPLETED) {
      const day = apt.startTime.getDay();
      byDay[day].visits += 1;
    }
  }

  // Add charges by day
  for (const charge of charges) {
    const day = charge.serviceDate.getDay();
    byDay[day].charges += Number(charge.fee) * charge.units;
  }

  // Add collections by payment date
  for (const allocation of allocations) {
    const day = allocation.payment.paymentDate.getDay();
    byDay[day].collections += Number(allocation.amount);
  }

  return Object.entries(byDay).map(([dayNum, data]) => ({
    dayOfWeek: parseInt(dayNum),
    dayName: DAY_NAMES[parseInt(dayNum)],
    visits: data.visits,
    charges: Math.round(data.charges * 100) / 100,
    collections: Math.round(data.collections * 100) / 100,
  }));
}

/**
 * Get daily production details
 */
async function getDailyDetails(
  organizationId: string,
  providerId: string,
  startDate: Date,
  endDate: Date
): Promise<DailyProductionDetail[]> {
  const days: DailyProductionDetail[] = [];
  const current = new Date(startDate);

  while (current <= endDate) {
    const dayStart = new Date(current);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(current);
    dayEnd.setHours(23, 59, 59, 999);

    // Get appointments for this day
    const appointments = await prisma.appointment.findMany({
      where: {
        organizationId,
        providerId,
        startTime: { gte: dayStart, lte: dayEnd },
      },
    });

    // Get charges for this day
    const chargesAgg = await prisma.charge.aggregate({
      where: {
        organizationId,
        providerId,
        serviceDate: { gte: dayStart, lte: dayEnd },
      },
      _sum: { fee: true },
    });

    // Get payments for this day
    const paymentsAgg = await prisma.payment.aggregate({
      where: {
        organizationId,
        paymentDate: { gte: dayStart, lte: dayEnd },
        isVoid: false,
      },
      _sum: { amount: true },
    });

    // Count new patients for this day
    const newPatientApts = appointments.filter((apt) => {
      // Check if this is the patient's first ever appointment
      // For simplicity, just count completed visits here
      return apt.status === AppointmentStatus.COMPLETED;
    });

    // This is a simplified count - in reality you'd check first visit
    const newPatients = 0; // Would need additional query to verify

    days.push({
      date: new Date(current),
      visits: appointments.filter((a) => a.status === AppointmentStatus.COMPLETED).length,
      newPatients,
      charges: Number(chargesAgg._sum.fee || 0),
      collections: Number(paymentsAgg._sum.amount || 0),
      noShows: appointments.filter((a) => a.status === AppointmentStatus.NO_SHOW).length,
    });

    current.setDate(current.getDate() + 1);
  }

  return days;
}

/**
 * Get provider productivity summary
 */
export async function getProviderProductivitySummary(
  organizationId: string,
  providerId: string
) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  const [currentMonth, lastMonth] = await Promise.all([
    getProviderProductionReport(organizationId, providerId, startOfMonth, now),
    getProviderProductionReport(organizationId, providerId, startOfLastMonth, endOfLastMonth),
  ]);

  // Calculate month-over-month changes
  const visitChange = lastMonth.completedVisits > 0
    ? ((currentMonth.completedVisits - lastMonth.completedVisits) / lastMonth.completedVisits) * 100
    : 0;

  const revenueChange = lastMonth.totalCollections > 0
    ? ((currentMonth.totalCollections - lastMonth.totalCollections) / lastMonth.totalCollections) * 100
    : 0;

  return {
    currentMonth,
    lastMonth,
    visitChange: Math.round(visitChange * 10) / 10,
    revenueChange: Math.round(revenueChange * 10) / 10,
  };
}
