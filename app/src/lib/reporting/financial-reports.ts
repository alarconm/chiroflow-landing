// Financial Reports - US-102
// Epic 15 - Standard financial reports for practice management

import { prisma } from '@/lib/prisma';
import { PaymentMethod } from '@prisma/client';
import type { DateRangeFilter } from './types';

// ============================================
// Types for Financial Reports
// ============================================

export interface DailyCollectionsReportRow {
  date: Date;
  cashPayments: number;
  cardPayments: number;
  checkPayments: number;
  insurancePayments: number;
  otherPayments: number;
  totalPayments: number;
  paymentCount: number;
}

export interface DailyCollectionsReport {
  periodStart: Date;
  periodEnd: Date;
  rows: DailyCollectionsReportRow[];
  totals: {
    cashPayments: number;
    cardPayments: number;
    checkPayments: number;
    insurancePayments: number;
    otherPayments: number;
    totalPayments: number;
    paymentCount: number;
  };
  dailyAverage: number;
}

export interface ARAgingBucket {
  bucketLabel: string;
  minDays: number;
  maxDays: number | null;
  totalAmount: number;
  chargeCount: number;
  percentage: number;
}

export interface ARAgingByPatient {
  patientId: string;
  patientName: string;
  mrn: string;
  current: number;
  days31_60: number;
  days61_90: number;
  days91_120: number;
  over120: number;
  total: number;
  oldestChargeDate: Date | null;
}

export interface AccountsReceivableAgingReport {
  asOfDate: Date;
  buckets: ARAgingBucket[];
  totalAR: number;
  byPatient: ARAgingByPatient[];
  summary: {
    averageAge: number;
    totalPatients: number;
    totalCharges: number;
  };
}

export interface RevenueByProviderRow {
  providerId: string;
  providerName: string;
  totalCharges: number;
  totalCollections: number;
  totalAdjustments: number;
  netRevenue: number;
  collectionRate: number;
  visitCount: number;
  avgRevenuePerVisit: number;
}

export interface RevenueByProviderReport {
  periodStart: Date;
  periodEnd: Date;
  rows: RevenueByProviderRow[];
  totals: {
    totalCharges: number;
    totalCollections: number;
    totalAdjustments: number;
    netRevenue: number;
    collectionRate: number;
    visitCount: number;
  };
}

export interface RevenueByServiceCodeRow {
  cptCode: string;
  description: string;
  unitCount: number;
  totalCharges: number;
  totalCollections: number;
  totalAdjustments: number;
  netRevenue: number;
  avgFeePerUnit: number;
  collectionRate: number;
}

export interface RevenueByServiceCodeReport {
  periodStart: Date;
  periodEnd: Date;
  rows: RevenueByServiceCodeRow[];
  totals: {
    unitCount: number;
    totalCharges: number;
    totalCollections: number;
    totalAdjustments: number;
    netRevenue: number;
  };
}

export interface PaymentTypeSummaryRow {
  paymentMethod: string;
  paymentMethodLabel: string;
  count: number;
  totalAmount: number;
  percentage: number;
  avgPayment: number;
}

export interface PaymentTypeSummaryReport {
  periodStart: Date;
  periodEnd: Date;
  rows: PaymentTypeSummaryRow[];
  totals: {
    count: number;
    totalAmount: number;
  };
  byPayerType: {
    payerType: string;
    count: number;
    totalAmount: number;
    percentage: number;
  }[];
}

// ============================================
// Daily Collections Report
// ============================================

/**
 * Get daily collections report - payments received by date
 */
export async function getDailyCollectionsReport(
  organizationId: string,
  dateRange: DateRangeFilter
): Promise<DailyCollectionsReport> {
  const { start, end } = dateRange;

  // Get all payments in the date range
  const payments = await prisma.payment.findMany({
    where: {
      organizationId,
      paymentDate: { gte: start, lte: end },
      isVoid: false,
    },
    orderBy: { paymentDate: 'asc' },
  });

  // Group payments by date
  const dailyMap = new Map<string, DailyCollectionsReportRow>();

  // Initialize all dates in range
  const current = new Date(start);
  while (current <= end) {
    const dateKey = current.toISOString().split('T')[0];
    dailyMap.set(dateKey, {
      date: new Date(current),
      cashPayments: 0,
      cardPayments: 0,
      checkPayments: 0,
      insurancePayments: 0,
      otherPayments: 0,
      totalPayments: 0,
      paymentCount: 0,
    });
    current.setDate(current.getDate() + 1);
  }

  // Process payments
  for (const payment of payments) {
    const dateKey = payment.paymentDate.toISOString().split('T')[0];
    const row = dailyMap.get(dateKey);
    if (!row) continue;

    const amount = Number(payment.amount);
    row.totalPayments += amount;
    row.paymentCount += 1;

    // Categorize by payment method
    switch (payment.paymentMethod) {
      case PaymentMethod.CASH:
        row.cashPayments += amount;
        break;
      case PaymentMethod.CREDIT_CARD:
      case PaymentMethod.DEBIT_CARD:
        row.cardPayments += amount;
        break;
      case PaymentMethod.CHECK:
        row.checkPayments += amount;
        break;
      case PaymentMethod.INSURANCE:
      case PaymentMethod.ACH:
        row.insurancePayments += amount;
        break;
      default:
        row.otherPayments += amount;
    }
  }

  const rows = Array.from(dailyMap.values());

  // Calculate totals
  const totals = {
    cashPayments: 0,
    cardPayments: 0,
    checkPayments: 0,
    insurancePayments: 0,
    otherPayments: 0,
    totalPayments: 0,
    paymentCount: 0,
  };

  for (const row of rows) {
    totals.cashPayments += row.cashPayments;
    totals.cardPayments += row.cardPayments;
    totals.checkPayments += row.checkPayments;
    totals.insurancePayments += row.insurancePayments;
    totals.otherPayments += row.otherPayments;
    totals.totalPayments += row.totalPayments;
    totals.paymentCount += row.paymentCount;
  }

  const daysWithPayments = rows.filter((r) => r.paymentCount > 0).length;
  const dailyAverage = daysWithPayments > 0 ? totals.totalPayments / daysWithPayments : 0;

  return {
    periodStart: start,
    periodEnd: end,
    rows,
    totals,
    dailyAverage: Math.round(dailyAverage * 100) / 100,
  };
}

// ============================================
// Accounts Receivable Aging Report
// ============================================

/**
 * Get AR aging report with outstanding balances by age bucket
 */
export async function getARAgingDetailReport(
  organizationId: string,
  asOfDate: Date = new Date()
): Promise<AccountsReceivableAgingReport> {
  // Get all charges with outstanding balances
  const charges = await prisma.charge.findMany({
    where: {
      organizationId,
      balance: { gt: 0 },
    },
    include: {
      patient: {
        include: {
          demographics: true,
        },
      },
    },
  });

  // Define aging buckets
  const buckets: ARAgingBucket[] = [
    { bucketLabel: 'Current (0-30)', minDays: 0, maxDays: 30, totalAmount: 0, chargeCount: 0, percentage: 0 },
    { bucketLabel: '31-60 Days', minDays: 31, maxDays: 60, totalAmount: 0, chargeCount: 0, percentage: 0 },
    { bucketLabel: '61-90 Days', minDays: 61, maxDays: 90, totalAmount: 0, chargeCount: 0, percentage: 0 },
    { bucketLabel: '91-120 Days', minDays: 91, maxDays: 120, totalAmount: 0, chargeCount: 0, percentage: 0 },
    { bucketLabel: 'Over 120 Days', minDays: 121, maxDays: null, totalAmount: 0, chargeCount: 0, percentage: 0 },
  ];

  // Patient-level AR tracking
  const patientMap = new Map<string, ARAgingByPatient>();

  let totalAR = 0;
  let totalDaysWeighted = 0;

  for (const charge of charges) {
    const balance = Number(charge.balance);
    const daysOld = Math.floor(
      (asOfDate.getTime() - charge.serviceDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    totalAR += balance;
    totalDaysWeighted += balance * daysOld;

    // Assign to bucket
    for (const bucket of buckets) {
      if (daysOld >= bucket.minDays && (bucket.maxDays === null || daysOld <= bucket.maxDays)) {
        bucket.totalAmount += balance;
        bucket.chargeCount += 1;
        break;
      }
    }

    // Track by patient
    const patientKey = charge.patientId;
    const demo = charge.patient.demographics;
    const patientName = demo ? `${demo.lastName}, ${demo.firstName}` : 'Unknown';

    if (!patientMap.has(patientKey)) {
      patientMap.set(patientKey, {
        patientId: charge.patientId,
        patientName,
        mrn: charge.patient.mrn,
        current: 0,
        days31_60: 0,
        days61_90: 0,
        days91_120: 0,
        over120: 0,
        total: 0,
        oldestChargeDate: charge.serviceDate,
      });
    }

    const patientData = patientMap.get(patientKey)!;
    patientData.total += balance;

    if (daysOld <= 30) {
      patientData.current += balance;
    } else if (daysOld <= 60) {
      patientData.days31_60 += balance;
    } else if (daysOld <= 90) {
      patientData.days61_90 += balance;
    } else if (daysOld <= 120) {
      patientData.days91_120 += balance;
    } else {
      patientData.over120 += balance;
    }

    // Track oldest charge date
    if (!patientData.oldestChargeDate || charge.serviceDate < patientData.oldestChargeDate) {
      patientData.oldestChargeDate = charge.serviceDate;
    }
  }

  // Calculate percentages for buckets
  for (const bucket of buckets) {
    bucket.totalAmount = Math.round(bucket.totalAmount * 100) / 100;
    bucket.percentage = totalAR > 0 ? Math.round((bucket.totalAmount / totalAR) * 1000) / 10 : 0;
  }

  // Sort patients by total AR descending
  const byPatient = Array.from(patientMap.values())
    .map((p) => ({
      ...p,
      current: Math.round(p.current * 100) / 100,
      days31_60: Math.round(p.days31_60 * 100) / 100,
      days61_90: Math.round(p.days61_90 * 100) / 100,
      days91_120: Math.round(p.days91_120 * 100) / 100,
      over120: Math.round(p.over120 * 100) / 100,
      total: Math.round(p.total * 100) / 100,
    }))
    .sort((a, b) => b.total - a.total);

  const averageAge = totalAR > 0 ? Math.round(totalDaysWeighted / totalAR) : 0;

  return {
    asOfDate,
    buckets,
    totalAR: Math.round(totalAR * 100) / 100,
    byPatient,
    summary: {
      averageAge,
      totalPatients: patientMap.size,
      totalCharges: charges.length,
    },
  };
}

// ============================================
// Revenue by Provider Report
// ============================================

/**
 * Get revenue breakdown by provider
 */
export async function getRevenueByProviderReport(
  organizationId: string,
  dateRange: DateRangeFilter
): Promise<RevenueByProviderReport> {
  const { start, end } = dateRange;

  // Get all providers for the organization
  const providers = await prisma.provider.findMany({
    where: { organizationId, isActive: true },
    include: {
      user: true,
    },
  });

  // Get charges and payments grouped by provider
  const charges = await prisma.charge.findMany({
    where: {
      organizationId,
      serviceDate: { gte: start, lte: end },
      providerId: { not: null },
    },
    include: {
      provider: {
        include: { user: true },
      },
    },
  });

  // Get payments with allocations
  const payments = await prisma.payment.findMany({
    where: {
      organizationId,
      paymentDate: { gte: start, lte: end },
      isVoid: false,
    },
    include: {
      allocations: {
        include: {
          charge: true,
        },
      },
    },
  });

  // Build provider revenue map
  const providerMap = new Map<string, RevenueByProviderRow>();

  // Initialize all providers
  for (const provider of providers) {
    const providerName = provider.user
      ? `${provider.user.firstName} ${provider.user.lastName}`.trim()
      : 'Unknown Provider';
    providerMap.set(provider.id, {
      providerId: provider.id,
      providerName,
      totalCharges: 0,
      totalCollections: 0,
      totalAdjustments: 0,
      netRevenue: 0,
      collectionRate: 0,
      visitCount: 0,
      avgRevenuePerVisit: 0,
    });
  }

  // Aggregate charges
  for (const charge of charges) {
    if (!charge.providerId) continue;

    let row = providerMap.get(charge.providerId);
    if (!row && charge.provider) {
      const providerName = charge.provider.user
        ? `${charge.provider.user.firstName} ${charge.provider.user.lastName}`.trim()
        : 'Unknown Provider';
      row = {
        providerId: charge.providerId,
        providerName,
        totalCharges: 0,
        totalCollections: 0,
        totalAdjustments: 0,
        netRevenue: 0,
        collectionRate: 0,
        visitCount: 0,
        avgRevenuePerVisit: 0,
      };
      providerMap.set(charge.providerId, row);
    }

    if (row) {
      row.totalCharges += Number(charge.fee);
      row.totalAdjustments += Number(charge.adjustments);
      row.visitCount += 1;
    }
  }

  // Aggregate payments by provider (via charge allocations)
  for (const payment of payments) {
    for (const allocation of payment.allocations) {
      const charge = allocation.charge;
      if (!charge.providerId) continue;

      const row = providerMap.get(charge.providerId);
      if (row) {
        row.totalCollections += Number(allocation.amount);
      }
    }
  }

  // Calculate derived metrics
  const rows: RevenueByProviderRow[] = [];
  for (const row of providerMap.values()) {
    row.totalCharges = Math.round(row.totalCharges * 100) / 100;
    row.totalCollections = Math.round(row.totalCollections * 100) / 100;
    row.totalAdjustments = Math.round(row.totalAdjustments * 100) / 100;
    row.netRevenue = Math.round((row.totalCollections - row.totalAdjustments) * 100) / 100;
    row.collectionRate = row.totalCharges > 0
      ? Math.round((row.totalCollections / row.totalCharges) * 1000) / 10
      : 0;
    row.avgRevenuePerVisit = row.visitCount > 0
      ? Math.round((row.totalCollections / row.visitCount) * 100) / 100
      : 0;

    if (row.totalCharges > 0 || row.totalCollections > 0) {
      rows.push(row);
    }
  }

  // Sort by total collections descending
  rows.sort((a, b) => b.totalCollections - a.totalCollections);

  // Calculate totals
  const totals = {
    totalCharges: 0,
    totalCollections: 0,
    totalAdjustments: 0,
    netRevenue: 0,
    collectionRate: 0,
    visitCount: 0,
  };

  for (const row of rows) {
    totals.totalCharges += row.totalCharges;
    totals.totalCollections += row.totalCollections;
    totals.totalAdjustments += row.totalAdjustments;
    totals.netRevenue += row.netRevenue;
    totals.visitCount += row.visitCount;
  }

  totals.collectionRate = totals.totalCharges > 0
    ? Math.round((totals.totalCollections / totals.totalCharges) * 1000) / 10
    : 0;

  return {
    periodStart: start,
    periodEnd: end,
    rows,
    totals,
  };
}

// ============================================
// Revenue by Service Code Report
// ============================================

/**
 * Get revenue breakdown by CPT/service code
 */
export async function getRevenueByServiceCodeReport(
  organizationId: string,
  dateRange: DateRangeFilter
): Promise<RevenueByServiceCodeReport> {
  const { start, end } = dateRange;

  // Get all charges grouped by CPT code
  const charges = await prisma.charge.findMany({
    where: {
      organizationId,
      serviceDate: { gte: start, lte: end },
    },
    include: {
      paymentAllocations: true,
    },
  });

  // Group by CPT code
  const cptMap = new Map<string, RevenueByServiceCodeRow>();

  for (const charge of charges) {
    let row = cptMap.get(charge.cptCode);
    if (!row) {
      row = {
        cptCode: charge.cptCode,
        description: charge.description,
        unitCount: 0,
        totalCharges: 0,
        totalCollections: 0,
        totalAdjustments: 0,
        netRevenue: 0,
        avgFeePerUnit: 0,
        collectionRate: 0,
      };
      cptMap.set(charge.cptCode, row);
    }

    row.unitCount += charge.units;
    row.totalCharges += Number(charge.fee);
    row.totalAdjustments += Number(charge.adjustments);

    // Sum payment allocations
    for (const allocation of charge.paymentAllocations) {
      row.totalCollections += Number(allocation.amount);
    }
  }

  // Calculate derived metrics
  const rows: RevenueByServiceCodeRow[] = [];
  for (const row of cptMap.values()) {
    row.totalCharges = Math.round(row.totalCharges * 100) / 100;
    row.totalCollections = Math.round(row.totalCollections * 100) / 100;
    row.totalAdjustments = Math.round(row.totalAdjustments * 100) / 100;
    row.netRevenue = Math.round((row.totalCollections - row.totalAdjustments) * 100) / 100;
    row.avgFeePerUnit = row.unitCount > 0
      ? Math.round((row.totalCharges / row.unitCount) * 100) / 100
      : 0;
    row.collectionRate = row.totalCharges > 0
      ? Math.round((row.totalCollections / row.totalCharges) * 1000) / 10
      : 0;

    rows.push(row);
  }

  // Sort by total collections descending
  rows.sort((a, b) => b.totalCollections - a.totalCollections);

  // Calculate totals
  const totals = {
    unitCount: 0,
    totalCharges: 0,
    totalCollections: 0,
    totalAdjustments: 0,
    netRevenue: 0,
  };

  for (const row of rows) {
    totals.unitCount += row.unitCount;
    totals.totalCharges += row.totalCharges;
    totals.totalCollections += row.totalCollections;
    totals.totalAdjustments += row.totalAdjustments;
    totals.netRevenue += row.netRevenue;
  }

  return {
    periodStart: start,
    periodEnd: end,
    rows,
    totals,
  };
}

// ============================================
// Payment Type Summary Report
// ============================================

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]: 'Cash',
  [PaymentMethod.CHECK]: 'Check',
  [PaymentMethod.CREDIT_CARD]: 'Credit Card',
  [PaymentMethod.DEBIT_CARD]: 'Debit Card',
  [PaymentMethod.ACH]: 'ACH/Electronic Funds Transfer',
  [PaymentMethod.INSURANCE]: 'Insurance Payment',
  [PaymentMethod.OTHER]: 'Other',
};

/**
 * Get payment type summary - cash, card, insurance breakdown
 */
export async function getPaymentTypeSummaryReport(
  organizationId: string,
  dateRange: DateRangeFilter
): Promise<PaymentTypeSummaryReport> {
  const { start, end } = dateRange;

  // Get all payments
  const payments = await prisma.payment.findMany({
    where: {
      organizationId,
      paymentDate: { gte: start, lte: end },
      isVoid: false,
    },
  });

  // Group by payment method
  const methodMap = new Map<PaymentMethod, { count: number; totalAmount: number }>();
  const payerTypeMap = new Map<string, { count: number; totalAmount: number }>();

  let grandTotal = 0;

  for (const payment of payments) {
    const amount = Number(payment.amount);
    grandTotal += amount;

    // By payment method
    const methodData = methodMap.get(payment.paymentMethod) || { count: 0, totalAmount: 0 };
    methodData.count += 1;
    methodData.totalAmount += amount;
    methodMap.set(payment.paymentMethod, methodData);

    // By payer type
    const payerType = payment.payerType || 'other';
    const payerData = payerTypeMap.get(payerType) || { count: 0, totalAmount: 0 };
    payerData.count += 1;
    payerData.totalAmount += amount;
    payerTypeMap.set(payerType, payerData);
  }

  // Build payment method rows
  const rows: PaymentTypeSummaryRow[] = [];
  for (const [method, data] of methodMap.entries()) {
    rows.push({
      paymentMethod: method,
      paymentMethodLabel: PAYMENT_METHOD_LABELS[method] || method,
      count: data.count,
      totalAmount: Math.round(data.totalAmount * 100) / 100,
      percentage: grandTotal > 0 ? Math.round((data.totalAmount / grandTotal) * 1000) / 10 : 0,
      avgPayment: data.count > 0 ? Math.round((data.totalAmount / data.count) * 100) / 100 : 0,
    });
  }

  // Sort by total amount descending
  rows.sort((a, b) => b.totalAmount - a.totalAmount);

  // Build payer type breakdown
  const byPayerType = Array.from(payerTypeMap.entries())
    .map(([payerType, data]) => ({
      payerType,
      count: data.count,
      totalAmount: Math.round(data.totalAmount * 100) / 100,
      percentage: grandTotal > 0 ? Math.round((data.totalAmount / grandTotal) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  return {
    periodStart: start,
    periodEnd: end,
    rows,
    totals: {
      count: payments.length,
      totalAmount: Math.round(grandTotal * 100) / 100,
    },
    byPayerType,
  };
}
