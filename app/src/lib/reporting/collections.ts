// Collections Reports
// Epic 15 - Payment collections and AR analysis

import { prisma } from '@/lib/prisma';
import { ChargeStatus, ClaimStatus, PaymentMethod } from '@prisma/client';
import type {
  CollectionsReport,
  PaymentMethodBreakdown,
  PayerTypeBreakdown,
  DailyCollectionDetail,
  ARAgingReport,
  ARByPayer,
  ARPatientDetail,
  ARTrendPoint,
} from './types';

/**
 * Get collections report for a date range
 */
export async function getCollectionsReport(
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<CollectionsReport> {
  // Get all charges in the period
  const chargesAgg = await prisma.charge.aggregate({
    where: {
      organizationId,
      serviceDate: { gte: startDate, lte: endDate },
    },
    _sum: {
      fee: true,
      adjustments: true,
    },
  });

  // Get all payments in the period
  const payments = await prisma.payment.findMany({
    where: {
      organizationId,
      paymentDate: { gte: startDate, lte: endDate },
      isVoid: false,
    },
    include: {
      allocations: true,
    },
  });

  const totalCharges = Number(chargesAgg._sum.fee || 0);
  const totalAdjustments = Number(chargesAgg._sum.adjustments || 0);
  const totalCollections = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const netCollections = totalCollections - totalAdjustments;
  const collectionRate = totalCharges > 0
    ? Math.round((totalCollections / totalCharges) * 100)
    : 0;

  // Breakdown by payment method
  const byPaymentMethod = getPaymentMethodBreakdown(payments, totalCollections);

  // Breakdown by payer type
  const byPayerType = await getPayerTypeBreakdown(organizationId, payments, totalCollections);

  // Daily collections
  const dailyCollections = await getDailyCollections(organizationId, startDate, endDate);

  // Outstanding AR
  const outstandingAR = await prisma.charge.aggregate({
    where: {
      organizationId,
      status: { in: [ChargeStatus.PENDING, ChargeStatus.BILLED] },
      balance: { gt: 0 },
    },
    _sum: { balance: true },
  });

  // Average days outstanding
  const avgDaysOutstanding = await calculateAvgDaysOutstanding(organizationId);

  return {
    periodStart: startDate,
    periodEnd: endDate,
    totalCharges,
    totalCollections,
    totalAdjustments,
    netCollections,
    collectionRate,
    byPaymentMethod,
    byPayerType,
    dailyCollections,
    totalOutstanding: Number(outstandingAR._sum.balance || 0),
    avgDaysOutstanding,
  };
}

/**
 * Get AR Aging Report
 */
export async function getARAgingReport(
  organizationId: string,
  asOfDate: Date = new Date()
): Promise<ARAgingReport> {
  // Get all outstanding charges
  const charges = await prisma.charge.findMany({
    where: {
      organizationId,
      status: { in: [ChargeStatus.PENDING, ChargeStatus.BILLED] },
      balance: { gt: 0 },
    },
    include: {
      patient: {
        include: {
          demographics: true,
        },
      },
      claimLines: {
        include: {
          claim: {
            include: {
              payer: true,
            },
          },
        },
      },
    },
  });

  // Initialize aging buckets
  const buckets = {
    current: 0,
    days30: 0,
    days60: 0,
    days90: 0,
    days120Plus: 0,
  };

  // Payer buckets
  const payerBuckets = new Map<string, {
    payerName: string;
    payerId?: string;
    current: number;
    days30: number;
    days60: number;
    days90: number;
    days120Plus: number;
    claimCount: number;
  }>();

  // Patient detail
  const patientBuckets = new Map<string, {
    patientId: string;
    patientName: string;
    mrn: string;
    current: number;
    days30: number;
    days60: number;
    days90: number;
    days120Plus: number;
    chargeCount: number;
  }>();

  // Process each charge
  for (const charge of charges) {
    const daysDiff = Math.floor(
      (asOfDate.getTime() - charge.serviceDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const balance = Number(charge.balance);

    // Determine bucket
    let bucket: 'current' | 'days30' | 'days60' | 'days90' | 'days120Plus';
    if (daysDiff <= 30) {
      bucket = 'current';
    } else if (daysDiff <= 60) {
      bucket = 'days30';
    } else if (daysDiff <= 90) {
      bucket = 'days60';
    } else if (daysDiff <= 120) {
      bucket = 'days90';
    } else {
      bucket = 'days120Plus';
    }

    buckets[bucket] += balance;

    // Add to payer buckets
    const payer = charge.claimLines[0]?.claim?.payer;
    const payerKey = payer?.id || 'patient_responsibility';
    const payerName = payer?.name || 'Patient Responsibility';

    if (!payerBuckets.has(payerKey)) {
      payerBuckets.set(payerKey, {
        payerName,
        payerId: payer?.id,
        current: 0,
        days30: 0,
        days60: 0,
        days90: 0,
        days120Plus: 0,
        claimCount: 0,
      });
    }

    const payerData = payerBuckets.get(payerKey)!;
    payerData[bucket] += balance;
    payerData.claimCount += 1;

    // Add to patient buckets
    const patientKey = charge.patientId;
    if (!patientBuckets.has(patientKey)) {
      const demo = charge.patient.demographics;
      patientBuckets.set(patientKey, {
        patientId: charge.patientId,
        patientName: demo ? `${demo.lastName}, ${demo.firstName}` : 'Unknown',
        mrn: charge.patient.mrn,
        current: 0,
        days30: 0,
        days60: 0,
        days90: 0,
        days120Plus: 0,
        chargeCount: 0,
      });
    }

    const patientData = patientBuckets.get(patientKey)!;
    patientData[bucket] += balance;
    patientData.chargeCount += 1;
  }

  const totalAR = Object.values(buckets).reduce((sum, v) => sum + v, 0);

  // Calculate percentages
  const getPercent = (value: number) =>
    totalAR > 0 ? Math.round((value / totalAR) * 100) : 0;

  // Format payer data
  const byPayer: ARByPayer[] = Array.from(payerBuckets.values())
    .map((data) => ({
      ...data,
      total: data.current + data.days30 + data.days60 + data.days90 + data.days120Plus,
    }))
    .sort((a, b) => b.total - a.total);

  // Format patient data
  const patientDetail: ARPatientDetail[] = Array.from(patientBuckets.values())
    .map((data) => ({
      ...data,
      total: data.current + data.days30 + data.days60 + data.days90 + data.days120Plus,
    }))
    .sort((a, b) => b.total - a.total);

  // Get AR trend (last 12 months)
  const arTrend = await getARTrend(organizationId);

  return {
    asOfDate,
    current: Math.round(buckets.current * 100) / 100,
    days30: Math.round(buckets.days30 * 100) / 100,
    days60: Math.round(buckets.days60 * 100) / 100,
    days90: Math.round(buckets.days90 * 100) / 100,
    days120Plus: Math.round(buckets.days120Plus * 100) / 100,
    totalAR: Math.round(totalAR * 100) / 100,
    currentPercent: getPercent(buckets.current),
    days30Percent: getPercent(buckets.days30),
    days60Percent: getPercent(buckets.days60),
    days90Percent: getPercent(buckets.days90),
    days120PlusPercent: getPercent(buckets.days120Plus),
    byPayer,
    patientDetail,
    arTrend,
  };
}

/**
 * Get payment method breakdown
 */
function getPaymentMethodBreakdown(
  payments: Array<{ paymentMethod: PaymentMethod; amount: unknown }>,
  totalCollections: number
): PaymentMethodBreakdown[] {
  const byMethod = new Map<string, { count: number; amount: number }>();

  for (const payment of payments) {
    const existing = byMethod.get(payment.paymentMethod) || { count: 0, amount: 0 };
    existing.count += 1;
    existing.amount += Number(payment.amount);
    byMethod.set(payment.paymentMethod, existing);
  }

  return Array.from(byMethod.entries())
    .map(([method, data]) => ({
      method,
      count: data.count,
      amount: Math.round(data.amount * 100) / 100,
      percentage: totalCollections > 0
        ? Math.round((data.amount / totalCollections) * 100)
        : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Get payer type breakdown
 */
async function getPayerTypeBreakdown(
  organizationId: string,
  payments: Array<{ payerType: string; payerName: string | null; amount: unknown }>,
  totalCollections: number
): Promise<PayerTypeBreakdown[]> {
  const byPayer = new Map<string, { payerType: string; payerName?: string; count: number; amount: number }>();

  for (const payment of payments) {
    const key = payment.payerType === 'patient'
      ? 'patient'
      : payment.payerName || 'insurance';

    const existing = byPayer.get(key) || {
      payerType: payment.payerType as 'patient' | 'insurance' | 'other',
      payerName: payment.payerName || undefined,
      count: 0,
      amount: 0,
    };
    existing.count += 1;
    existing.amount += Number(payment.amount);
    byPayer.set(key, existing);
  }

  return Array.from(byPayer.values())
    .map((data) => ({
      ...data,
      payerType: data.payerType as 'patient' | 'insurance' | 'other',
      percentage: totalCollections > 0
        ? Math.round((data.amount / totalCollections) * 100)
        : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Get daily collections detail
 */
async function getDailyCollections(
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<DailyCollectionDetail[]> {
  const days: DailyCollectionDetail[] = [];
  const current = new Date(startDate);

  while (current <= endDate) {
    const dayStart = new Date(current);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(current);
    dayEnd.setHours(23, 59, 59, 999);

    const [chargesAgg, paymentsAgg, adjustmentsAgg] = await Promise.all([
      prisma.charge.aggregate({
        where: {
          organizationId,
          chargeDate: { gte: dayStart, lte: dayEnd },
        },
        _sum: { fee: true },
      }),
      prisma.payment.aggregate({
        where: {
          organizationId,
          paymentDate: { gte: dayStart, lte: dayEnd },
          isVoid: false,
        },
        _sum: { amount: true },
      }),
      prisma.charge.aggregate({
        where: {
          organizationId,
          updatedAt: { gte: dayStart, lte: dayEnd },
          adjustments: { gt: 0 },
        },
        _sum: { adjustments: true },
      }),
    ]);

    const charges = Number(chargesAgg._sum.fee || 0);
    const collections = Number(paymentsAgg._sum.amount || 0);
    const adjustments = Number(adjustmentsAgg._sum.adjustments || 0);

    days.push({
      date: new Date(current),
      charges,
      collections,
      adjustments,
      netCollections: collections - adjustments,
    });

    current.setDate(current.getDate() + 1);
  }

  return days;
}

/**
 * Calculate average days to collect
 */
async function calculateAvgDaysOutstanding(organizationId: string): Promise<number> {
  // Get recent payments with their charge service dates
  const recentPayments = await prisma.payment.findMany({
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
    take: 500,
  });

  let totalDays = 0;
  let count = 0;

  for (const payment of recentPayments) {
    for (const allocation of payment.allocations) {
      if (allocation.charge.serviceDate) {
        const daysDiff = Math.floor(
          (payment.paymentDate.getTime() - allocation.charge.serviceDate.getTime()) /
            (1000 * 60 * 60 * 24)
        );
        totalDays += daysDiff;
        count += 1;
      }
    }
  }

  return count > 0 ? Math.round(totalDays / count) : 0;
}

/**
 * Get AR trend for the last 12 months
 */
async function getARTrend(organizationId: string): Promise<ARTrendPoint[]> {
  const points: ARTrendPoint[] = [];
  const now = new Date();

  // Get KPI snapshots if available
  const snapshots = await prisma.kPISnapshot.findMany({
    where: {
      organizationId,
      periodType: 'monthly',
      periodStart: { gte: new Date(now.getFullYear() - 1, now.getMonth(), 1) },
    },
    orderBy: { periodStart: 'asc' },
  });

  if (snapshots.length > 0) {
    // Use snapshots
    for (const snap of snapshots) {
      const aged = Number(snap.ar30Days || 0) +
        Number(snap.ar60Days || 0) +
        Number(snap.ar90Days || 0) +
        Number(snap.ar120PlusDays || 0);

      points.push({
        date: snap.periodStart,
        totalAR: Number(snap.totalAR),
        current: Number(snap.arCurrent || 0),
        aged,
      });
    }
  } else {
    // Generate approximation from current data
    // Just show current point
    const currentAR = await prisma.charge.aggregate({
      where: {
        organizationId,
        status: { in: [ChargeStatus.PENDING, ChargeStatus.BILLED] },
        balance: { gt: 0 },
      },
      _sum: { balance: true },
    });

    points.push({
      date: now,
      totalAR: Number(currentAR._sum.balance || 0),
      current: Number(currentAR._sum.balance || 0) * 0.4, // Estimate
      aged: Number(currentAR._sum.balance || 0) * 0.6,
    });
  }

  return points;
}

/**
 * Get collection rate by payer
 */
export async function getCollectionRateByPayer(
  organizationId: string,
  startDate: Date,
  endDate: Date
) {
  // Get claims with their charges and payments
  const claims = await prisma.claim.findMany({
    where: {
      organizationId,
      createdDate: { gte: startDate, lte: endDate },
    },
    include: {
      payer: true,
      claimLines: true,
      payments: true,
    },
  });

  const byPayer = new Map<string, {
    payerName: string;
    totalCharged: number;
    totalPaid: number;
    claimCount: number;
  }>();

  for (const claim of claims) {
    const payerKey = claim.payer?.id || 'unknown';
    const payerName = claim.payer?.name || 'Unknown';

    const existing = byPayer.get(payerKey) || {
      payerName,
      totalCharged: 0,
      totalPaid: 0,
      claimCount: 0,
    };

    existing.totalCharged += Number(claim.totalCharges);
    existing.totalPaid += Number(claim.totalPaid);
    existing.claimCount += 1;

    byPayer.set(payerKey, existing);
  }

  return Array.from(byPayer.values())
    .map((data) => ({
      ...data,
      collectionRate: data.totalCharged > 0
        ? Math.round((data.totalPaid / data.totalCharged) * 100)
        : 0,
    }))
    .sort((a, b) => b.totalPaid - a.totalPaid);
}
