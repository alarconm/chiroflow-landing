// KPI Tracking Service
// Epic 15 - Key Performance Indicator calculation and history

import { prisma } from '@/lib/prisma';
import { AppointmentStatus, ChargeStatus, ClaimStatus } from '@prisma/client';
import type { KPIMetrics, KPIHistoryPoint, KPITrend } from './types';

/**
 * Calculate current KPI metrics
 */
export async function calculateKPIs(
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<KPIMetrics> {
  // Get appointments for the period
  const appointments = await prisma.appointment.findMany({
    where: {
      organizationId,
      startTime: { gte: startDate, lte: endDate },
    },
    select: {
      status: true,
      patientId: true,
      startTime: true,
    },
  });

  // Get financial data
  const [chargesAgg, paymentsAgg, adjustmentsAgg] = await Promise.all([
    prisma.charge.aggregate({
      where: {
        organizationId,
        serviceDate: { gte: startDate, lte: endDate },
      },
      _sum: { fee: true },
      _count: true,
    }),
    prisma.payment.aggregate({
      where: {
        organizationId,
        paymentDate: { gte: startDate, lte: endDate },
        isVoid: false,
      },
      _sum: { amount: true },
    }),
    prisma.charge.aggregate({
      where: {
        organizationId,
        updatedAt: { gte: startDate, lte: endDate },
      },
      _sum: { adjustments: true },
    }),
  ]);

  // Get claims data
  const claims = await prisma.claim.findMany({
    where: {
      organizationId,
      submittedDate: { gte: startDate, lte: endDate },
    },
    select: {
      status: true,
    },
  });

  // Get patient data for retention
  const activePatients = await getActivePatientCount(organizationId, startDate, endDate);
  const returningPatients = await getReturningPatientCount(organizationId, startDate, endDate);

  // Calculate metrics
  const totalAppointments = appointments.length;
  const completedAppointments = appointments.filter(
    (a) => a.status === AppointmentStatus.COMPLETED
  ).length;
  const noShowAppointments = appointments.filter(
    (a) => a.status === AppointmentStatus.NO_SHOW
  ).length;

  const totalCharges = Number(chargesAgg._sum.fee || 0);
  const totalPayments = Number(paymentsAgg._sum.amount || 0);

  // Collection rate
  const collectionRate = totalCharges > 0
    ? Math.round((totalPayments / totalCharges) * 100)
    : 0;

  // No-show rate
  const noShowRate = totalAppointments > 0
    ? Math.round((noShowAppointments / totalAppointments) * 100)
    : 0;

  // Patient retention
  const patientRetention = activePatients > 0
    ? Math.round((returningPatients / activePatients) * 100)
    : 0;

  // Average visit value
  const avgVisitValue = completedAppointments > 0
    ? Math.round((totalPayments / completedAppointments) * 100) / 100
    : 0;

  // Average days to collect
  const avgDaysToCollect = await calculateAvgDaysToCollect(organizationId, startDate, endDate);

  // New patient rate
  const newPatients = await prisma.patient.count({
    where: {
      organizationId,
      createdAt: { gte: startDate, lte: endDate },
    },
  });

  const newPatientRate = activePatients > 0
    ? Math.round((newPatients / activePatients) * 100)
    : 0;

  // Visit completion rate
  const visitCompletionRate = totalAppointments > 0
    ? Math.round((completedAppointments / totalAppointments) * 100)
    : 0;

  // Claims metrics
  const submittedClaims = claims.length;
  const paidClaims = claims.filter((c) => c.status === ClaimStatus.PAID).length;
  const deniedClaims = claims.filter((c) => c.status === ClaimStatus.DENIED).length;
  const rejectedClaims = claims.filter((c) => c.status === ClaimStatus.REJECTED).length;

  // Clean claim rate (submitted and not rejected on first pass)
  const cleanClaimRate = submittedClaims > 0
    ? Math.round(((submittedClaims - rejectedClaims) / submittedClaims) * 100)
    : 0;

  // Denial rate
  const denialRate = submittedClaims > 0
    ? Math.round((deniedClaims / submittedClaims) * 100)
    : 0;

  return {
    collectionRate,
    noShowRate,
    patientRetention,
    avgVisitValue,
    avgDaysToCollect,
    newPatientRate,
    visitCompletionRate,
    cleanClaimRate,
    denialRate,
  };
}

/**
 * Get KPI history for trending
 */
export async function getKPIHistory(
  organizationId: string,
  periodType: 'daily' | 'weekly' | 'monthly',
  count: number = 12
): Promise<KPIHistoryPoint[]> {
  // Try to get from KPISnapshot first
  const snapshots = await prisma.kPISnapshot.findMany({
    where: {
      organizationId,
      periodType,
    },
    orderBy: { periodStart: 'desc' },
    take: count,
  });

  if (snapshots.length > 0) {
    return snapshots.map((snap) => ({
      date: snap.periodStart,
      periodType: snap.periodType as 'daily' | 'weekly' | 'monthly',
      metrics: {
        collectionRate: Number(snap.collectionRate || 0),
        noShowRate: Number(snap.noShowRate || 0),
        patientRetention: Number(snap.patientRetention || 0),
        avgVisitValue: Number(snap.avgVisitValue || 0),
        avgDaysToCollect: Number(snap.avgDaysToCollect || 0),
        newPatientRate: 0,
        visitCompletionRate: snap.completedVisits > 0 && snap.totalVisits > 0
          ? Math.round((snap.completedVisits / snap.totalVisits) * 100)
          : 0,
        cleanClaimRate: Number(snap.cleanClaimRate || 0),
        denialRate: snap.claimsSubmitted > 0
          ? Math.round((snap.claimsDenied / snap.claimsSubmitted) * 100)
          : 0,
      },
    })).reverse();
  }

  // Calculate on the fly if no snapshots
  const points: KPIHistoryPoint[] = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    let periodStart: Date;
    let periodEnd: Date;

    switch (periodType) {
      case 'daily':
        periodStart = new Date(now);
        periodStart.setDate(periodStart.getDate() - i);
        periodStart.setHours(0, 0, 0, 0);
        periodEnd = new Date(periodStart);
        periodEnd.setHours(23, 59, 59, 999);
        break;

      case 'weekly':
        periodEnd = new Date(now);
        periodEnd.setDate(periodEnd.getDate() - (i * 7));
        periodStart = new Date(periodEnd);
        periodStart.setDate(periodStart.getDate() - 6);
        periodStart.setHours(0, 0, 0, 0);
        periodEnd.setHours(23, 59, 59, 999);
        break;

      case 'monthly':
        periodStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        periodEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
        break;
    }

    const metrics = await calculateKPIs(organizationId, periodStart, periodEnd);
    points.push({
      date: periodStart,
      periodType,
      metrics,
    });
  }

  return points.reverse();
}

/**
 * Get KPI trends (comparing to previous period)
 */
export async function getKPITrends(
  organizationId: string,
  currentStart: Date,
  currentEnd: Date,
  previousStart: Date,
  previousEnd: Date,
  targets?: KPIMetrics['targets']
): Promise<KPITrend[]> {
  const [current, previous] = await Promise.all([
    calculateKPIs(organizationId, currentStart, currentEnd),
    calculateKPIs(organizationId, previousStart, previousEnd),
  ]);

  const kpis: KPITrend[] = [];

  // Collection Rate
  kpis.push(createTrend(
    'Collection Rate',
    current.collectionRate,
    previous.collectionRate,
    targets?.collectionRate,
    true // higher is better
  ));

  // No-Show Rate
  kpis.push(createTrend(
    'No-Show Rate',
    current.noShowRate,
    previous.noShowRate,
    targets?.noShowRate,
    false // lower is better
  ));

  // Patient Retention
  kpis.push(createTrend(
    'Patient Retention',
    current.patientRetention,
    previous.patientRetention,
    targets?.patientRetention,
    true
  ));

  // Average Visit Value
  kpis.push(createTrend(
    'Avg Visit Value',
    current.avgVisitValue,
    previous.avgVisitValue,
    targets?.avgVisitValue,
    true
  ));

  // Average Days to Collect
  kpis.push(createTrend(
    'Avg Days to Collect',
    current.avgDaysToCollect,
    previous.avgDaysToCollect,
    targets?.avgDaysToCollect,
    false // lower is better
  ));

  // Visit Completion Rate
  kpis.push(createTrend(
    'Visit Completion Rate',
    current.visitCompletionRate,
    previous.visitCompletionRate,
    undefined,
    true
  ));

  // Clean Claim Rate
  kpis.push(createTrend(
    'Clean Claim Rate',
    current.cleanClaimRate,
    previous.cleanClaimRate,
    undefined,
    true
  ));

  return kpis;
}

/**
 * Create a KPI snapshot for persistence
 */
export async function createKPISnapshot(
  organizationId: string,
  periodType: 'daily' | 'weekly' | 'monthly',
  periodStart: Date,
  periodEnd: Date
) {
  // Check if snapshot already exists
  const existing = await prisma.kPISnapshot.findFirst({
    where: {
      organizationId,
      periodType,
      periodStart,
    },
  });

  if (existing) {
    return existing;
  }

  // Get all the data for the snapshot
  const [appointments, charges, payments, claims, newPatients] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        organizationId,
        startTime: { gte: periodStart, lte: periodEnd },
      },
      select: { status: true },
    }),
    prisma.charge.aggregate({
      where: {
        organizationId,
        serviceDate: { gte: periodStart, lte: periodEnd },
      },
      _sum: { fee: true, adjustments: true },
    }),
    prisma.payment.aggregate({
      where: {
        organizationId,
        paymentDate: { gte: periodStart, lte: periodEnd },
        isVoid: false,
      },
      _sum: { amount: true },
    }),
    prisma.claim.findMany({
      where: {
        organizationId,
        submittedDate: { gte: periodStart, lte: periodEnd },
      },
      select: { status: true },
    }),
    prisma.patient.count({
      where: {
        organizationId,
        createdAt: { gte: periodStart, lte: periodEnd },
      },
    }),
  ]);

  // Get AR aging
  const arAging = await getARAgingBuckets(organizationId, periodEnd);

  // Calculate metrics
  const totalVisits = appointments.length;
  const completedVisits = appointments.filter(
    (a) => a.status === AppointmentStatus.COMPLETED
  ).length;
  const cancelledVisits = appointments.filter(
    (a) => a.status === AppointmentStatus.CANCELLED
  ).length;
  const noShowVisits = appointments.filter(
    (a) => a.status === AppointmentStatus.NO_SHOW
  ).length;

  const totalCharges = Number(charges._sum.fee || 0);
  const totalPayments = Number(payments._sum.amount || 0);
  const totalAdjustments = Number(charges._sum.adjustments || 0);

  const totalAR = await prisma.charge.aggregate({
    where: {
      organizationId,
      status: { in: [ChargeStatus.PENDING, ChargeStatus.BILLED] },
      serviceDate: { lte: periodEnd },
    },
    _sum: { balance: true },
  });

  const claimsSubmitted = claims.length;
  const claimsPaid = claims.filter((c) => c.status === ClaimStatus.PAID).length;
  const claimsDenied = claims.filter((c) => c.status === ClaimStatus.DENIED).length;

  // Calculate KPI values
  const collectionRate = totalCharges > 0
    ? Math.round((totalPayments / totalCharges) * 100)
    : null;

  const noShowRate = totalVisits > 0
    ? Math.round((noShowVisits / totalVisits) * 100)
    : null;

  const avgVisitValue = completedVisits > 0
    ? Math.round((totalPayments / completedVisits) * 100) / 100
    : null;

  const cleanClaimRate = claimsSubmitted > 0
    ? Math.round(((claimsSubmitted - claims.filter((c) => c.status === ClaimStatus.REJECTED).length) / claimsSubmitted) * 100)
    : null;

  // Create the snapshot
  return prisma.kPISnapshot.create({
    data: {
      organizationId,
      periodType,
      periodStart,
      periodEnd,
      totalVisits,
      completedVisits,
      cancelledVisits,
      noShowVisits,
      newPatients,
      totalCharges,
      totalPayments,
      totalAdjustments,
      totalAR: Number(totalAR._sum.balance || 0),
      collectionRate,
      noShowRate,
      avgVisitValue,
      arCurrent: arAging.current,
      ar30Days: arAging.days30,
      ar60Days: arAging.days60,
      ar90Days: arAging.days90,
      ar120PlusDays: arAging.days120Plus,
      claimsSubmitted,
      claimsPaid,
      claimsDenied,
      cleanClaimRate,
    },
  });
}

// Helper functions

function createTrend(
  kpiName: string,
  currentValue: number,
  previousValue: number,
  target?: number,
  higherIsBetter: boolean = true
): KPITrend {
  const change = currentValue - previousValue;
  const changePercent = previousValue > 0
    ? Math.round((change / previousValue) * 100)
    : 0;

  let trend: 'improving' | 'declining' | 'stable';
  if (Math.abs(changePercent) < 5) {
    trend = 'stable';
  } else if (higherIsBetter) {
    trend = change > 0 ? 'improving' : 'declining';
  } else {
    trend = change < 0 ? 'improving' : 'declining';
  }

  let targetStatus: 'above' | 'below' | 'at' | undefined;
  if (target !== undefined) {
    if (Math.abs(currentValue - target) < 1) {
      targetStatus = 'at';
    } else if (higherIsBetter) {
      targetStatus = currentValue >= target ? 'above' : 'below';
    } else {
      targetStatus = currentValue <= target ? 'above' : 'below';
    }
  }

  return {
    kpiName,
    currentValue,
    previousValue,
    change,
    changePercent,
    trend,
    target,
    targetStatus,
  };
}

async function getActivePatientCount(
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<number> {
  const patients = await prisma.appointment.findMany({
    where: {
      organizationId,
      startTime: { gte: startDate, lte: endDate },
      status: AppointmentStatus.COMPLETED,
    },
    select: {
      patientId: true,
    },
    distinct: ['patientId'],
  });

  return patients.length;
}

async function getReturningPatientCount(
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<number> {
  // Get patients who had visits in the current period
  const currentPeriodPatients = await prisma.appointment.findMany({
    where: {
      organizationId,
      startTime: { gte: startDate, lte: endDate },
      status: AppointmentStatus.COMPLETED,
    },
    select: { patientId: true },
    distinct: ['patientId'],
  });

  const patientIds = currentPeriodPatients.map((p) => p.patientId);

  // Check which of these had visits before the current period
  const returningPatients = await prisma.appointment.findMany({
    where: {
      organizationId,
      patientId: { in: patientIds },
      startTime: { lt: startDate },
      status: AppointmentStatus.COMPLETED,
    },
    select: { patientId: true },
    distinct: ['patientId'],
  });

  return returningPatients.length;
}

async function calculateAvgDaysToCollect(
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<number> {
  const payments = await prisma.payment.findMany({
    where: {
      organizationId,
      paymentDate: { gte: startDate, lte: endDate },
      isVoid: false,
    },
    include: {
      allocations: {
        include: {
          charge: true,
        },
      },
    },
    take: 200,
  });

  let totalDays = 0;
  let count = 0;

  for (const payment of payments) {
    for (const allocation of payment.allocations) {
      if (allocation.charge.serviceDate) {
        const days = Math.floor(
          (payment.paymentDate.getTime() - allocation.charge.serviceDate.getTime()) /
            (1000 * 60 * 60 * 24)
        );
        if (days >= 0) {
          totalDays += days;
          count++;
        }
      }
    }
  }

  return count > 0 ? Math.round(totalDays / count) : 0;
}

async function getARAgingBuckets(organizationId: string, asOfDate: Date) {
  const charges = await prisma.charge.findMany({
    where: {
      organizationId,
      status: { in: [ChargeStatus.PENDING, ChargeStatus.BILLED] },
      balance: { gt: 0 },
      serviceDate: { lte: asOfDate },
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
      (asOfDate.getTime() - charge.serviceDate.getTime()) / (1000 * 60 * 60 * 24)
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

  return buckets;
}
