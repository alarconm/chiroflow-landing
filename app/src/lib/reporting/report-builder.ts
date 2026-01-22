// Custom Report Builder
// Epic 15 - Build custom reports with flexible filtering and aggregation

import { prisma } from '@/lib/prisma';
import type {
  CustomReportConfig,
  CustomReportResult,
  ReportColumn,
  ReportFilter,
  ReportAggregation,
} from './types';

/**
 * Execute a custom report configuration
 */
export async function executeCustomReport(
  organizationId: string,
  config: CustomReportConfig
): Promise<CustomReportResult> {
  const startTime = Date.now();

  // Build the query based on data source
  let rows: Record<string, unknown>[] = [];
  let totals: Record<string, number> = {};

  switch (config.dataSource) {
    case 'appointments':
      ({ rows, totals } = await queryAppointments(organizationId, config));
      break;

    case 'charges':
      ({ rows, totals } = await queryCharges(organizationId, config));
      break;

    case 'payments':
      ({ rows, totals } = await queryPayments(organizationId, config));
      break;

    case 'claims':
      ({ rows, totals } = await queryClaims(organizationId, config));
      break;

    case 'patients':
      ({ rows, totals } = await queryPatients(organizationId, config));
      break;

    case 'encounters':
      ({ rows, totals } = await queryEncounters(organizationId, config));
      break;

    default:
      throw new Error(`Unknown data source: ${config.dataSource}`);
  }

  // Apply sorting
  if (config.sortBy) {
    const sortField = config.sortBy;
    const sortOrder = config.sortOrder === 'desc' ? -1 : 1;

    rows.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];

      if (aVal === null || aVal === undefined) return sortOrder;
      if (bVal === null || bVal === undefined) return -sortOrder;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.localeCompare(bVal) * sortOrder;
      }

      return ((aVal as number) - (bVal as number)) * sortOrder;
    });
  }

  return {
    columns: config.columns.filter((c) => c.visible !== false),
    rows,
    totals: Object.keys(totals).length > 0 ? totals : undefined,
    rowCount: rows.length,
    executionTime: Date.now() - startTime,
  };
}

/**
 * Query appointments
 */
async function queryAppointments(
  organizationId: string,
  config: CustomReportConfig
): Promise<{ rows: Record<string, unknown>[]; totals: Record<string, number> }> {
  const where = buildAppointmentWhere(organizationId, config.filters, config.dateRange);

  const appointments = await prisma.appointment.findMany({
    where,
    include: {
      patient: {
        include: { demographics: true },
      },
      provider: {
        include: { user: true },
      },
      appointmentType: true,
    },
    orderBy: { startTime: 'desc' },
  });

  const rows = appointments.map((apt) => ({
    id: apt.id,
    date: apt.startTime,
    time: apt.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    patientName: apt.patient.demographics
      ? `${apt.patient.demographics.lastName}, ${apt.patient.demographics.firstName}`
      : 'Unknown',
    patientMrn: apt.patient.mrn,
    providerName: `${apt.provider.user.firstName} ${apt.provider.user.lastName}`,
    appointmentType: apt.appointmentType.name,
    status: apt.status,
    duration: (apt.endTime.getTime() - apt.startTime.getTime()) / (1000 * 60),
    chiefComplaint: apt.chiefComplaint,
    notes: apt.notes,
  }));

  // Calculate totals if aggregations requested
  const totals: Record<string, number> = {};
  if (config.aggregations) {
    for (const agg of config.aggregations) {
      totals[agg.alias || agg.field] = calculateAggregation(rows, agg);
    }
  }

  return { rows, totals };
}

/**
 * Query charges
 */
async function queryCharges(
  organizationId: string,
  config: CustomReportConfig
): Promise<{ rows: Record<string, unknown>[]; totals: Record<string, number> }> {
  const where = buildChargeWhere(organizationId, config.filters, config.dateRange);

  const charges = await prisma.charge.findMany({
    where,
    include: {
      patient: {
        include: { demographics: true },
      },
      provider: {
        include: { user: true },
      },
      encounter: true,
    },
    orderBy: { serviceDate: 'desc' },
  });

  const rows = charges.map((charge) => ({
    id: charge.id,
    serviceDate: charge.serviceDate,
    chargeDate: charge.chargeDate,
    patientName: charge.patient.demographics
      ? `${charge.patient.demographics.lastName}, ${charge.patient.demographics.firstName}`
      : 'Unknown',
    patientMrn: charge.patient.mrn,
    providerName: charge.provider
      ? `${charge.provider.user.firstName} ${charge.provider.user.lastName}`
      : 'N/A',
    cptCode: charge.cptCode,
    description: charge.description,
    modifiers: charge.modifiers.join(', '),
    units: charge.units,
    fee: Number(charge.fee),
    adjustments: Number(charge.adjustments),
    payments: Number(charge.payments),
    balance: Number(charge.balance),
    status: charge.status,
    placeOfService: charge.placeOfService,
    icd10Codes: charge.icd10Codes.join(', '),
  }));

  const totals: Record<string, number> = {};
  if (config.aggregations) {
    for (const agg of config.aggregations) {
      totals[agg.alias || agg.field] = calculateAggregation(rows, agg);
    }
  } else {
    // Default totals for charges
    totals.totalFee = rows.reduce((sum, r) => sum + (r.fee as number), 0);
    totals.totalPayments = rows.reduce((sum, r) => sum + (r.payments as number), 0);
    totals.totalBalance = rows.reduce((sum, r) => sum + (r.balance as number), 0);
  }

  return { rows, totals };
}

/**
 * Query payments
 */
async function queryPayments(
  organizationId: string,
  config: CustomReportConfig
): Promise<{ rows: Record<string, unknown>[]; totals: Record<string, number> }> {
  const where = buildPaymentWhere(organizationId, config.filters, config.dateRange);

  const payments = await prisma.payment.findMany({
    where,
    include: {
      patient: {
        include: { demographics: true },
      },
      allocations: {
        include: { charge: true },
      },
    },
    orderBy: { paymentDate: 'desc' },
  });

  const rows = payments.map((pmt) => ({
    id: pmt.id,
    paymentDate: pmt.paymentDate,
    postedDate: pmt.postedDate,
    patientName: pmt.patient.demographics
      ? `${pmt.patient.demographics.lastName}, ${pmt.patient.demographics.firstName}`
      : 'Unknown',
    patientMrn: pmt.patient.mrn,
    amount: Number(pmt.amount),
    paymentMethod: pmt.paymentMethod,
    payerType: pmt.payerType,
    payerName: pmt.payerName,
    referenceNumber: pmt.referenceNumber,
    checkNumber: pmt.checkNumber,
    unappliedAmount: Number(pmt.unappliedAmount),
    allocatedAmount: pmt.allocations.reduce((sum, a) => sum + Number(a.amount), 0),
    notes: pmt.notes,
  }));

  const totals: Record<string, number> = {};
  if (config.aggregations) {
    for (const agg of config.aggregations) {
      totals[agg.alias || agg.field] = calculateAggregation(rows, agg);
    }
  } else {
    totals.totalAmount = rows.reduce((sum, r) => sum + (r.amount as number), 0);
    totals.totalUnapplied = rows.reduce((sum, r) => sum + (r.unappliedAmount as number), 0);
  }

  return { rows, totals };
}

/**
 * Query claims
 */
async function queryClaims(
  organizationId: string,
  config: CustomReportConfig
): Promise<{ rows: Record<string, unknown>[]; totals: Record<string, number> }> {
  const where = buildClaimWhere(organizationId, config.filters, config.dateRange);

  const claims = await prisma.claim.findMany({
    where,
    include: {
      patient: {
        include: { demographics: true },
      },
      payer: true,
      claimLines: true,
    },
    orderBy: { createdDate: 'desc' },
  });

  const rows = claims.map((claim) => ({
    id: claim.id,
    claimNumber: claim.claimNumber,
    payerClaimNumber: claim.payerClaimNumber,
    createdDate: claim.createdDate,
    submittedDate: claim.submittedDate,
    patientName: claim.patient.demographics
      ? `${claim.patient.demographics.lastName}, ${claim.patient.demographics.firstName}`
      : 'Unknown',
    patientMrn: claim.patient.mrn,
    payerName: claim.payer?.name || 'N/A',
    status: claim.status,
    totalCharges: Number(claim.totalCharges),
    totalAllowed: Number(claim.totalAllowed),
    totalPaid: Number(claim.totalPaid),
    totalAdjusted: Number(claim.totalAdjusted),
    patientResponsibility: Number(claim.patientResponsibility),
    lineCount: claim.claimLines.length,
    claimType: claim.claimType,
    statusMessage: claim.statusMessage,
  }));

  const totals: Record<string, number> = {};
  if (config.aggregations) {
    for (const agg of config.aggregations) {
      totals[agg.alias || agg.field] = calculateAggregation(rows, agg);
    }
  } else {
    totals.totalCharges = rows.reduce((sum, r) => sum + (r.totalCharges as number), 0);
    totals.totalPaid = rows.reduce((sum, r) => sum + (r.totalPaid as number), 0);
    totals.claimCount = rows.length;
  }

  return { rows, totals };
}

/**
 * Query patients
 */
async function queryPatients(
  organizationId: string,
  config: CustomReportConfig
): Promise<{ rows: Record<string, unknown>[]; totals: Record<string, number> }> {
  const where: Record<string, unknown> = { organizationId };

  // Apply filters
  for (const filter of config.filters) {
    applyFilter(where, filter);
  }

  const patients = await prisma.patient.findMany({
    where,
    include: {
      demographics: true,
      contacts: {
        where: { isPrimary: true },
        take: 1,
      },
      insurances: {
        where: { isActive: true },
      },
      _count: {
        select: {
          appointments: true,
          charges: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const rows = patients.map((patient) => ({
    id: patient.id,
    mrn: patient.mrn,
    firstName: patient.demographics?.firstName || 'Unknown',
    lastName: patient.demographics?.lastName || 'Unknown',
    dateOfBirth: patient.demographics?.dateOfBirth,
    gender: patient.demographics?.gender,
    status: patient.status,
    email: patient.contacts[0]?.email,
    phone: patient.contacts[0]?.mobilePhone || patient.contacts[0]?.homePhone,
    insuranceCount: patient.insurances.length,
    appointmentCount: patient._count.appointments,
    chargeCount: patient._count.charges,
    createdAt: patient.createdAt,
  }));

  const totals: Record<string, number> = {
    patientCount: rows.length,
    totalAppointments: rows.reduce((sum, r) => sum + (r.appointmentCount as number), 0),
  };

  return { rows, totals };
}

/**
 * Query encounters
 */
async function queryEncounters(
  organizationId: string,
  config: CustomReportConfig
): Promise<{ rows: Record<string, unknown>[]; totals: Record<string, number> }> {
  const where = buildEncounterWhere(organizationId, config.filters, config.dateRange);

  const encounters = await prisma.encounter.findMany({
    where,
    include: {
      patient: {
        include: { demographics: true },
      },
      provider: {
        include: { user: true },
      },
      diagnoses: true,
      procedures: true,
      soapNote: true,
    },
    orderBy: { encounterDate: 'desc' },
  });

  const rows = encounters.map((enc) => ({
    id: enc.id,
    encounterDate: enc.encounterDate,
    patientName: enc.patient.demographics
      ? `${enc.patient.demographics.lastName}, ${enc.patient.demographics.firstName}`
      : 'Unknown',
    patientMrn: enc.patient.mrn,
    providerName: `${enc.provider.user.firstName} ${enc.provider.user.lastName}`,
    encounterType: enc.encounterType,
    status: enc.status,
    chiefComplaint: enc.chiefComplaint,
    diagnosisCount: enc.diagnoses.length,
    procedureCount: enc.procedures.length,
    primaryDiagnosis: enc.diagnoses.find((d) => d.isPrimary)?.description || 'N/A',
    visitNumber: enc.visitNumber,
    location: enc.location,
    signedAt: enc.signedAt,
  }));

  const totals: Record<string, number> = {
    encounterCount: rows.length,
    signedCount: rows.filter((r) => r.signedAt).length,
  };

  return { rows, totals };
}

// Helper functions

function buildAppointmentWhere(
  organizationId: string,
  filters: ReportFilter[],
  dateRange?: CustomReportConfig['dateRange']
) {
  const where: Record<string, unknown> = { organizationId };

  if (dateRange) {
    const dateField = dateRange.field || 'startTime';
    where[dateField] = {};
    if (dateRange.start) {
      (where[dateField] as Record<string, Date>).gte = dateRange.start;
    }
    if (dateRange.end) {
      (where[dateField] as Record<string, Date>).lte = dateRange.end;
    }
  }

  for (const filter of filters) {
    applyFilter(where, filter);
  }

  return where;
}

function buildChargeWhere(
  organizationId: string,
  filters: ReportFilter[],
  dateRange?: CustomReportConfig['dateRange']
) {
  const where: Record<string, unknown> = { organizationId };

  if (dateRange) {
    const dateField = dateRange.field || 'serviceDate';
    where[dateField] = {};
    if (dateRange.start) {
      (where[dateField] as Record<string, Date>).gte = dateRange.start;
    }
    if (dateRange.end) {
      (where[dateField] as Record<string, Date>).lte = dateRange.end;
    }
  }

  for (const filter of filters) {
    applyFilter(where, filter);
  }

  return where;
}

function buildPaymentWhere(
  organizationId: string,
  filters: ReportFilter[],
  dateRange?: CustomReportConfig['dateRange']
) {
  const where: Record<string, unknown> = {
    organizationId,
    isVoid: false,
  };

  if (dateRange) {
    const dateField = dateRange.field || 'paymentDate';
    where[dateField] = {};
    if (dateRange.start) {
      (where[dateField] as Record<string, Date>).gte = dateRange.start;
    }
    if (dateRange.end) {
      (where[dateField] as Record<string, Date>).lte = dateRange.end;
    }
  }

  for (const filter of filters) {
    applyFilter(where, filter);
  }

  return where;
}

function buildClaimWhere(
  organizationId: string,
  filters: ReportFilter[],
  dateRange?: CustomReportConfig['dateRange']
) {
  const where: Record<string, unknown> = { organizationId };

  if (dateRange) {
    const dateField = dateRange.field || 'createdDate';
    where[dateField] = {};
    if (dateRange.start) {
      (where[dateField] as Record<string, Date>).gte = dateRange.start;
    }
    if (dateRange.end) {
      (where[dateField] as Record<string, Date>).lte = dateRange.end;
    }
  }

  for (const filter of filters) {
    applyFilter(where, filter);
  }

  return where;
}

function buildEncounterWhere(
  organizationId: string,
  filters: ReportFilter[],
  dateRange?: CustomReportConfig['dateRange']
) {
  const where: Record<string, unknown> = { organizationId };

  if (dateRange) {
    const dateField = dateRange.field || 'encounterDate';
    where[dateField] = {};
    if (dateRange.start) {
      (where[dateField] as Record<string, Date>).gte = dateRange.start;
    }
    if (dateRange.end) {
      (where[dateField] as Record<string, Date>).lte = dateRange.end;
    }
  }

  for (const filter of filters) {
    applyFilter(where, filter);
  }

  return where;
}

function applyFilter(where: Record<string, unknown>, filter: ReportFilter) {
  switch (filter.operator) {
    case 'eq':
      where[filter.field] = filter.value;
      break;
    case 'neq':
      where[filter.field] = { not: filter.value };
      break;
    case 'gt':
      where[filter.field] = { gt: filter.value };
      break;
    case 'gte':
      where[filter.field] = { gte: filter.value };
      break;
    case 'lt':
      where[filter.field] = { lt: filter.value };
      break;
    case 'lte':
      where[filter.field] = { lte: filter.value };
      break;
    case 'contains':
      where[filter.field] = { contains: filter.value, mode: 'insensitive' };
      break;
    case 'in':
      where[filter.field] = { in: filter.value };
      break;
    case 'between':
      where[filter.field] = { gte: filter.value, lte: filter.value2 };
      break;
  }
}

function calculateAggregation(rows: Record<string, unknown>[], agg: ReportAggregation): number {
  const values = rows.map((r) => r[agg.field]).filter((v): v is number => typeof v === 'number');

  switch (agg.function) {
    case 'sum':
      return values.reduce((sum, v) => sum + v, 0);
    case 'avg':
      return values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
    case 'min':
      return values.length > 0 ? Math.min(...values) : 0;
    case 'max':
      return values.length > 0 ? Math.max(...values) : 0;
    case 'count':
      return rows.length;
    case 'countDistinct':
      return new Set(rows.map((r) => r[agg.field])).size;
    default:
      return 0;
  }
}

/**
 * Get available columns for a data source
 */
export function getAvailableColumns(dataSource: string): ReportColumn[] {
  switch (dataSource) {
    case 'appointments':
      return [
        { field: 'date', label: 'Date', type: 'date' },
        { field: 'time', label: 'Time', type: 'string' },
        { field: 'patientName', label: 'Patient', type: 'string' },
        { field: 'patientMrn', label: 'MRN', type: 'string' },
        { field: 'providerName', label: 'Provider', type: 'string' },
        { field: 'appointmentType', label: 'Type', type: 'string' },
        { field: 'status', label: 'Status', type: 'string' },
        { field: 'duration', label: 'Duration (min)', type: 'number' },
        { field: 'chiefComplaint', label: 'Chief Complaint', type: 'string' },
      ];

    case 'charges':
      return [
        { field: 'serviceDate', label: 'Service Date', type: 'date' },
        { field: 'patientName', label: 'Patient', type: 'string' },
        { field: 'providerName', label: 'Provider', type: 'string' },
        { field: 'cptCode', label: 'CPT Code', type: 'string' },
        { field: 'description', label: 'Description', type: 'string' },
        { field: 'units', label: 'Units', type: 'number' },
        { field: 'fee', label: 'Fee', type: 'currency' },
        { field: 'adjustments', label: 'Adjustments', type: 'currency' },
        { field: 'payments', label: 'Payments', type: 'currency' },
        { field: 'balance', label: 'Balance', type: 'currency' },
        { field: 'status', label: 'Status', type: 'string' },
      ];

    case 'payments':
      return [
        { field: 'paymentDate', label: 'Payment Date', type: 'date' },
        { field: 'patientName', label: 'Patient', type: 'string' },
        { field: 'amount', label: 'Amount', type: 'currency' },
        { field: 'paymentMethod', label: 'Method', type: 'string' },
        { field: 'payerType', label: 'Payer Type', type: 'string' },
        { field: 'payerName', label: 'Payer', type: 'string' },
        { field: 'referenceNumber', label: 'Reference', type: 'string' },
        { field: 'unappliedAmount', label: 'Unapplied', type: 'currency' },
      ];

    case 'claims':
      return [
        { field: 'claimNumber', label: 'Claim #', type: 'string' },
        { field: 'createdDate', label: 'Created', type: 'date' },
        { field: 'submittedDate', label: 'Submitted', type: 'date' },
        { field: 'patientName', label: 'Patient', type: 'string' },
        { field: 'payerName', label: 'Payer', type: 'string' },
        { field: 'status', label: 'Status', type: 'string' },
        { field: 'totalCharges', label: 'Charges', type: 'currency' },
        { field: 'totalPaid', label: 'Paid', type: 'currency' },
        { field: 'totalAdjusted', label: 'Adjusted', type: 'currency' },
        { field: 'patientResponsibility', label: 'Patient Resp', type: 'currency' },
      ];

    case 'patients':
      return [
        { field: 'mrn', label: 'MRN', type: 'string' },
        { field: 'lastName', label: 'Last Name', type: 'string' },
        { field: 'firstName', label: 'First Name', type: 'string' },
        { field: 'dateOfBirth', label: 'DOB', type: 'date' },
        { field: 'gender', label: 'Gender', type: 'string' },
        { field: 'status', label: 'Status', type: 'string' },
        { field: 'email', label: 'Email', type: 'string' },
        { field: 'phone', label: 'Phone', type: 'string' },
        { field: 'appointmentCount', label: 'Appointments', type: 'number' },
        { field: 'createdAt', label: 'Created', type: 'date' },
      ];

    case 'encounters':
      return [
        { field: 'encounterDate', label: 'Date', type: 'date' },
        { field: 'patientName', label: 'Patient', type: 'string' },
        { field: 'providerName', label: 'Provider', type: 'string' },
        { field: 'encounterType', label: 'Type', type: 'string' },
        { field: 'status', label: 'Status', type: 'string' },
        { field: 'chiefComplaint', label: 'Chief Complaint', type: 'string' },
        { field: 'primaryDiagnosis', label: 'Primary Dx', type: 'string' },
        { field: 'diagnosisCount', label: 'Dx Count', type: 'number' },
        { field: 'procedureCount', label: 'Proc Count', type: 'number' },
        { field: 'signedAt', label: 'Signed', type: 'date' },
      ];

    default:
      return [];
  }
}
