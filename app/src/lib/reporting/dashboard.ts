// Dashboard Metrics Service
// Epic 15 - Real-time dashboard data

import { prisma } from '@/lib/prisma';
import { AppointmentStatus, ChargeStatus, ClaimStatus } from '@prisma/client';
import type { DashboardMetrics, WidgetData, WidgetDataSource, ChartDataPoint } from './types';

/**
 * Get real-time dashboard metrics for an organization
 */
export async function getDashboardMetrics(
  organizationId: string,
  date: Date = new Date()
): Promise<DashboardMetrics> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const startOfPreviousDay = new Date(startOfDay);
  startOfPreviousDay.setDate(startOfPreviousDay.getDate() - 1);

  const endOfPreviousDay = new Date(endOfDay);
  endOfPreviousDay.setDate(endOfPreviousDay.getDate() - 1);

  // Today's metrics
  const [
    todayAppointments,
    todayPayments,
    todayNewPatients,
    previousDayAppointments,
    previousDayPayments,
    previousDayNewPatients,
    totalAR,
    pendingClaims,
    recentPayments,
  ] = await Promise.all([
    // Today's appointments
    prisma.appointment.findMany({
      where: {
        organizationId,
        startTime: { gte: startOfDay, lte: endOfDay },
      },
      select: {
        status: true,
        chargeAmount: true,
      },
    }),

    // Today's payments
    prisma.payment.aggregate({
      where: {
        organizationId,
        paymentDate: { gte: startOfDay, lte: endOfDay },
        isVoid: false,
      },
      _sum: { amount: true },
    }),

    // Today's new patients
    prisma.patient.count({
      where: {
        organizationId,
        createdAt: { gte: startOfDay, lte: endOfDay },
      },
    }),

    // Previous day's appointments for comparison
    prisma.appointment.findMany({
      where: {
        organizationId,
        startTime: { gte: startOfPreviousDay, lte: endOfPreviousDay },
      },
      select: {
        status: true,
        chargeAmount: true,
      },
    }),

    // Previous day's payments
    prisma.payment.aggregate({
      where: {
        organizationId,
        paymentDate: { gte: startOfPreviousDay, lte: endOfPreviousDay },
        isVoid: false,
      },
      _sum: { amount: true },
    }),

    // Previous day's new patients
    prisma.patient.count({
      where: {
        organizationId,
        createdAt: { gte: startOfPreviousDay, lte: endOfPreviousDay },
      },
    }),

    // Total AR
    prisma.charge.aggregate({
      where: {
        organizationId,
        status: { in: [ChargeStatus.PENDING, ChargeStatus.BILLED] },
      },
      _sum: { balance: true },
    }),

    // Pending claims
    prisma.claim.count({
      where: {
        organizationId,
        status: { in: [ClaimStatus.DRAFT, ClaimStatus.READY, ClaimStatus.SUBMITTED] },
      },
    }),

    // Recent payments for avg days to collect calculation
    prisma.payment.findMany({
      where: {
        organizationId,
        paymentDate: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
        isVoid: false,
      },
      include: {
        allocations: {
          include: {
            charge: true,
          },
        },
      },
      take: 100,
    }),
  ]);

  // Calculate today's metrics
  const todayVisits = todayAppointments.filter(
    (a) => a.status === AppointmentStatus.COMPLETED || a.status === AppointmentStatus.IN_PROGRESS
  ).length;

  const todayNoShows = todayAppointments.filter(
    (a) => a.status === AppointmentStatus.NO_SHOW
  ).length;

  const todayRevenue = Number(todayPayments._sum.amount || 0);

  // Calculate previous day's metrics
  const prevDayVisits = previousDayAppointments.filter(
    (a) => a.status === AppointmentStatus.COMPLETED || a.status === AppointmentStatus.IN_PROGRESS
  ).length;

  const prevDayNoShows = previousDayAppointments.filter(
    (a) => a.status === AppointmentStatus.NO_SHOW
  ).length;

  const prevDayRevenue = Number(previousDayPayments._sum.amount || 0);

  // Calculate trends (percentage change)
  const visitsTrend = prevDayVisits > 0
    ? ((todayVisits - prevDayVisits) / prevDayVisits) * 100
    : 0;

  const revenueTrend = prevDayRevenue > 0
    ? ((todayRevenue - prevDayRevenue) / prevDayRevenue) * 100
    : 0;

  const newPatientsTrend = previousDayNewPatients > 0
    ? ((todayNewPatients - previousDayNewPatients) / previousDayNewPatients) * 100
    : 0;

  const noShowsTrend = prevDayNoShows > 0
    ? ((todayNoShows - prevDayNoShows) / prevDayNoShows) * 100
    : 0;

  // Calculate average days to collect
  let avgDaysToCollect = 0;
  let daysToCollectCount = 0;

  for (const payment of recentPayments) {
    for (const allocation of payment.allocations) {
      const charge = allocation.charge;
      if (charge.serviceDate) {
        const daysDiff = Math.floor(
          (payment.paymentDate.getTime() - charge.serviceDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        avgDaysToCollect += daysDiff;
        daysToCollectCount++;
      }
    }
  }

  avgDaysToCollect = daysToCollectCount > 0
    ? Math.round(avgDaysToCollect / daysToCollectCount)
    : 0;

  // Calculate collection rate (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [chargesLast30, paymentsLast30] = await Promise.all([
    prisma.charge.aggregate({
      where: {
        organizationId,
        chargeDate: { gte: thirtyDaysAgo },
      },
      _sum: { fee: true },
    }),
    prisma.payment.aggregate({
      where: {
        organizationId,
        paymentDate: { gte: thirtyDaysAgo },
        isVoid: false,
      },
      _sum: { amount: true },
    }),
  ]);

  const totalCharges = Number(chargesLast30._sum.fee || 0);
  const totalPaymentsAmount = Number(paymentsLast30._sum.amount || 0);
  const collectionRate = totalCharges > 0
    ? Math.round((totalPaymentsAmount / totalCharges) * 100)
    : 0;

  return {
    todayVisits,
    todayRevenue,
    todayNewPatients,
    todayNoShows,
    visitsTrend: Math.round(visitsTrend * 10) / 10,
    revenueTrend: Math.round(revenueTrend * 10) / 10,
    newPatientsTrend: Math.round(newPatientsTrend * 10) / 10,
    noShowsTrend: Math.round(noShowsTrend * 10) / 10,
    totalAR: Number(totalAR._sum.balance || 0),
    pendingClaims,
    avgDaysToCollect,
    collectionRate,
  };
}

/**
 * Get data for a specific widget
 */
export async function getWidgetData(
  organizationId: string,
  dataSource: WidgetDataSource,
  dateRange?: { start: Date; end: Date }
): Promise<WidgetData> {
  const now = new Date();
  const start = dateRange?.start || new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = dateRange?.end || now;

  switch (dataSource) {
    case 'todayVisits':
      return await getTodayVisitsWidget(organizationId);

    case 'todayRevenue':
      return await getTodayRevenueWidget(organizationId);

    case 'todayNewPatients':
      return await getTodayNewPatientsWidget(organizationId);

    case 'todayNoShows':
      return await getTodayNoShowsWidget(organizationId);

    case 'totalAR':
      return await getTotalARWidget(organizationId);

    case 'collectionRate':
      return await getCollectionRateWidget(organizationId);

    case 'pendingClaims':
      return await getPendingClaimsWidget(organizationId);

    case 'visitTrend':
      return await getVisitTrendWidget(organizationId, start, end);

    case 'revenueTrend':
      return await getRevenueTrendWidget(organizationId, start, end);

    case 'arAging':
      return await getARAgingWidget(organizationId);

    case 'topProcedures':
      return await getTopProceduresWidget(organizationId, start, end);

    case 'upcomingAppointments':
      return await getUpcomingAppointmentsWidget(organizationId);

    case 'recentPayments':
      return await getRecentPaymentsWidget(organizationId);

    default:
      return { value: 0 };
  }
}

// Widget implementations

async function getTodayVisitsWidget(organizationId: string): Promise<WidgetData> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [completed, scheduled] = await Promise.all([
    prisma.appointment.count({
      where: {
        organizationId,
        startTime: { gte: startOfDay },
        status: { in: [AppointmentStatus.COMPLETED, AppointmentStatus.IN_PROGRESS] },
      },
    }),
    prisma.appointment.count({
      where: {
        organizationId,
        startTime: { gte: startOfDay },
      },
    }),
  ]);

  return {
    value: completed,
    label: `${completed} of ${scheduled} completed`,
  };
}

async function getTodayRevenueWidget(organizationId: string): Promise<WidgetData> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const result = await prisma.payment.aggregate({
    where: {
      organizationId,
      paymentDate: { gte: startOfDay },
      isVoid: false,
    },
    _sum: { amount: true },
  });

  return {
    value: Number(result._sum.amount || 0),
  };
}

async function getTodayNewPatientsWidget(organizationId: string): Promise<WidgetData> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const count = await prisma.patient.count({
    where: {
      organizationId,
      createdAt: { gte: startOfDay },
    },
  });

  return { value: count };
}

async function getTodayNoShowsWidget(organizationId: string): Promise<WidgetData> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [noShows, total] = await Promise.all([
    prisma.appointment.count({
      where: {
        organizationId,
        startTime: { gte: startOfDay },
        status: AppointmentStatus.NO_SHOW,
      },
    }),
    prisma.appointment.count({
      where: {
        organizationId,
        startTime: { gte: startOfDay },
      },
    }),
  ]);

  const rate = total > 0 ? Math.round((noShows / total) * 100) : 0;

  return {
    value: noShows,
    label: `${rate}% of scheduled`,
  };
}

async function getTotalARWidget(organizationId: string): Promise<WidgetData> {
  const result = await prisma.charge.aggregate({
    where: {
      organizationId,
      status: { in: [ChargeStatus.PENDING, ChargeStatus.BILLED] },
    },
    _sum: { balance: true },
  });

  return { value: Number(result._sum.balance || 0) };
}

async function getCollectionRateWidget(organizationId: string): Promise<WidgetData> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [charges, payments] = await Promise.all([
    prisma.charge.aggregate({
      where: {
        organizationId,
        chargeDate: { gte: thirtyDaysAgo },
      },
      _sum: { fee: true },
    }),
    prisma.payment.aggregate({
      where: {
        organizationId,
        paymentDate: { gte: thirtyDaysAgo },
        isVoid: false,
      },
      _sum: { amount: true },
    }),
  ]);

  const totalCharges = Number(charges._sum.fee || 0);
  const totalPayments = Number(payments._sum.amount || 0);
  const rate = totalCharges > 0 ? Math.round((totalPayments / totalCharges) * 100) : 0;

  return {
    value: rate,
    label: 'Last 30 days',
  };
}

async function getPendingClaimsWidget(organizationId: string): Promise<WidgetData> {
  const count = await prisma.claim.count({
    where: {
      organizationId,
      status: { in: [ClaimStatus.DRAFT, ClaimStatus.READY, ClaimStatus.SUBMITTED] },
    },
  });

  return { value: count };
}

async function getVisitTrendWidget(
  organizationId: string,
  start: Date,
  end: Date
): Promise<WidgetData> {
  const appointments = await prisma.appointment.findMany({
    where: {
      organizationId,
      startTime: { gte: start, lte: end },
      status: AppointmentStatus.COMPLETED,
    },
    select: {
      startTime: true,
    },
  });

  // Group by day
  const byDay = new Map<string, number>();
  for (const apt of appointments) {
    const day = apt.startTime.toISOString().split('T')[0];
    byDay.set(day, (byDay.get(day) || 0) + 1);
  }

  const chartData: ChartDataPoint[] = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, value]) => ({ label, value }));

  return {
    value: appointments.length,
    chartData,
  };
}

async function getRevenueTrendWidget(
  organizationId: string,
  start: Date,
  end: Date
): Promise<WidgetData> {
  const payments = await prisma.payment.findMany({
    where: {
      organizationId,
      paymentDate: { gte: start, lte: end },
      isVoid: false,
    },
    select: {
      paymentDate: true,
      amount: true,
    },
  });

  // Group by day
  const byDay = new Map<string, number>();
  for (const pmt of payments) {
    const day = pmt.paymentDate.toISOString().split('T')[0];
    byDay.set(day, (byDay.get(day) || 0) + Number(pmt.amount));
  }

  const chartData: ChartDataPoint[] = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, value]) => ({ label, value }));

  const total = payments.reduce((sum, p) => sum + Number(p.amount), 0);

  return {
    value: total,
    chartData,
  };
}

async function getARAgingWidget(organizationId: string): Promise<WidgetData> {
  const now = new Date();
  const charges = await prisma.charge.findMany({
    where: {
      organizationId,
      status: { in: [ChargeStatus.PENDING, ChargeStatus.BILLED] },
      balance: { gt: 0 },
    },
    select: {
      balance: true,
      serviceDate: true,
    },
  });

  const buckets = {
    current: 0,
    days30: 0,
    days60: 0,
    days90: 0,
    days120Plus: 0,
  };

  for (const charge of charges) {
    const daysDiff = Math.floor(
      (now.getTime() - charge.serviceDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const balance = Number(charge.balance);

    if (daysDiff <= 30) {
      buckets.current += balance;
    } else if (daysDiff <= 60) {
      buckets.days30 += balance;
    } else if (daysDiff <= 90) {
      buckets.days60 += balance;
    } else if (daysDiff <= 120) {
      buckets.days90 += balance;
    } else {
      buckets.days120Plus += balance;
    }
  }

  const chartData: ChartDataPoint[] = [
    { label: 'Current', value: buckets.current },
    { label: '31-60', value: buckets.days30 },
    { label: '61-90', value: buckets.days60 },
    { label: '91-120', value: buckets.days90 },
    { label: '120+', value: buckets.days120Plus },
  ];

  const total = Object.values(buckets).reduce((sum, v) => sum + v, 0);

  return {
    value: total,
    chartData,
  };
}

async function getTopProceduresWidget(
  organizationId: string,
  start: Date,
  end: Date
): Promise<WidgetData> {
  const charges = await prisma.charge.findMany({
    where: {
      organizationId,
      serviceDate: { gte: start, lte: end },
    },
    select: {
      cptCode: true,
      description: true,
      fee: true,
    },
  });

  // Group by CPT code
  const byCode = new Map<string, { count: number; revenue: number; description: string }>();
  for (const charge of charges) {
    const existing = byCode.get(charge.cptCode) || { count: 0, revenue: 0, description: charge.description };
    existing.count += 1;
    existing.revenue += Number(charge.fee);
    byCode.set(charge.cptCode, existing);
  }

  const sorted = Array.from(byCode.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10);

  const listItems = sorted.map(([code, data]) => ({
    id: code,
    label: data.description,
    value: data.count,
    subLabel: `$${data.revenue.toLocaleString()}`,
  }));

  return {
    value: charges.length,
    listItems,
  };
}

async function getUpcomingAppointmentsWidget(organizationId: string): Promise<WidgetData> {
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const appointments = await prisma.appointment.findMany({
    where: {
      organizationId,
      startTime: { gte: now, lte: endOfDay },
      status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
    },
    include: {
      patient: {
        include: { demographics: true },
      },
      appointmentType: true,
    },
    orderBy: { startTime: 'asc' },
    take: 10,
  });

  const listItems = appointments.map((apt) => ({
    id: apt.id,
    label: `${apt.patient.demographics?.firstName} ${apt.patient.demographics?.lastName}`,
    value: apt.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    subLabel: apt.appointmentType.name,
  }));

  return {
    value: appointments.length,
    listItems,
  };
}

async function getRecentPaymentsWidget(organizationId: string): Promise<WidgetData> {
  const payments = await prisma.payment.findMany({
    where: {
      organizationId,
      isVoid: false,
    },
    include: {
      patient: {
        include: { demographics: true },
      },
    },
    orderBy: { paymentDate: 'desc' },
    take: 10,
  });

  const listItems = payments.map((pmt) => ({
    id: pmt.id,
    label: `${pmt.patient.demographics?.firstName} ${pmt.patient.demographics?.lastName}`,
    value: `$${Number(pmt.amount).toLocaleString()}`,
    subLabel: pmt.paymentMethod,
  }));

  return {
    value: payments.reduce((sum, p) => sum + Number(p.amount), 0),
    listItems,
  };
}
