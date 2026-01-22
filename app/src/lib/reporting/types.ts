// Reporting & Analytics Types for ChiroFlow
// Epic 15 - Types and Interfaces

import type {
  WidgetType,
  ReportType,
  ExportFormat,
  ScheduleFrequency
} from '@prisma/client';

// ============================================
// Dashboard Types
// ============================================

export interface DashboardMetrics {
  // Today's stats
  todayVisits: number;
  todayRevenue: number;
  todayNewPatients: number;
  todayNoShows: number;

  // Period comparison (vs previous period)
  visitsTrend: number; // percentage change
  revenueTrend: number;
  newPatientsTrend: number;
  noShowsTrend: number;

  // Quick stats
  totalAR: number;
  pendingClaims: number;
  avgDaysToCollect: number;
  collectionRate: number;
}

export interface WidgetConfig {
  title?: string;
  subtitle?: string;
  color?: string;
  icon?: string;
  format?: 'number' | 'currency' | 'percentage';
  precision?: number;
  showTrend?: boolean;
  trendPeriod?: 'day' | 'week' | 'month';
}

export interface WidgetData {
  value: number | string;
  previousValue?: number;
  trend?: number; // percentage change
  trendDirection?: 'up' | 'down' | 'flat';
  label?: string;
  chartData?: ChartDataPoint[];
  tableData?: TableRow[];
  listItems?: ListItem[];
}

export interface ChartDataPoint {
  label: string;
  value: number;
  date?: Date;
  category?: string;
}

export interface TableRow {
  id: string;
  [key: string]: unknown;
}

export interface ListItem {
  id: string;
  label: string;
  value: string | number;
  subLabel?: string;
  icon?: string;
}

// ============================================
// Provider Production Types
// ============================================

export interface ProviderProductionReport {
  providerId: string;
  providerName: string;
  periodStart: Date;
  periodEnd: Date;

  // Visit metrics
  totalVisits: number;
  completedVisits: number;
  cancelledVisits: number;
  noShows: number;
  newPatients: number;

  // Financial metrics
  totalCharges: number;
  totalCollections: number;
  totalAdjustments: number;
  netRevenue: number;

  // Productivity metrics
  avgVisitsPerDay: number;
  avgRevenuePerVisit: number;
  collectionRate: number;
  noShowRate: number;

  // By appointment type
  byAppointmentType: AppointmentTypeBreakdown[];

  // By day of week
  byDayOfWeek: DayOfWeekBreakdown[];

  // Daily details
  dailyDetails: DailyProductionDetail[];
}

export interface AppointmentTypeBreakdown {
  appointmentTypeId: string;
  appointmentTypeName: string;
  count: number;
  charges: number;
  collections: number;
  avgDuration: number;
}

export interface DayOfWeekBreakdown {
  dayOfWeek: number; // 0-6, Sunday=0
  dayName: string;
  visits: number;
  charges: number;
  collections: number;
}

export interface DailyProductionDetail {
  date: Date;
  visits: number;
  newPatients: number;
  charges: number;
  collections: number;
  noShows: number;
}

// ============================================
// Collections Types
// ============================================

export interface CollectionsReport {
  periodStart: Date;
  periodEnd: Date;

  // Summary
  totalCharges: number;
  totalCollections: number;
  totalAdjustments: number;
  netCollections: number;
  collectionRate: number;

  // By payment method
  byPaymentMethod: PaymentMethodBreakdown[];

  // By payer type
  byPayerType: PayerTypeBreakdown[];

  // Daily collections
  dailyCollections: DailyCollectionDetail[];

  // Outstanding
  totalOutstanding: number;
  avgDaysOutstanding: number;
}

export interface PaymentMethodBreakdown {
  method: string;
  count: number;
  amount: number;
  percentage: number;
}

export interface PayerTypeBreakdown {
  payerType: 'patient' | 'insurance' | 'other';
  payerName?: string;
  count: number;
  amount: number;
  percentage: number;
}

export interface DailyCollectionDetail {
  date: Date;
  charges: number;
  collections: number;
  adjustments: number;
  netCollections: number;
}

// ============================================
// AR Aging Types
// ============================================

export interface ARAgingReport {
  asOfDate: Date;

  // Totals by bucket
  current: number;      // 0-30 days
  days30: number;       // 31-60 days
  days60: number;       // 61-90 days
  days90: number;       // 91-120 days
  days120Plus: number;  // 120+ days
  totalAR: number;

  // Percentages
  currentPercent: number;
  days30Percent: number;
  days60Percent: number;
  days90Percent: number;
  days120PlusPercent: number;

  // By payer
  byPayer: ARByPayer[];

  // Detail by patient
  patientDetail: ARPatientDetail[];

  // Trends
  arTrend: ARTrendPoint[];
}

export interface ARByPayer {
  payerName: string;
  payerId?: string;
  current: number;
  days30: number;
  days60: number;
  days90: number;
  days120Plus: number;
  total: number;
  claimCount: number;
}

export interface ARPatientDetail {
  patientId: string;
  patientName: string;
  mrn: string;
  current: number;
  days30: number;
  days60: number;
  days90: number;
  days120Plus: number;
  total: number;
  lastPaymentDate?: Date;
  lastPaymentAmount?: number;
  chargeCount: number;
}

export interface ARTrendPoint {
  date: Date;
  totalAR: number;
  current: number;
  aged: number; // 30+ days
}

// ============================================
// KPI Types
// ============================================

export interface KPIMetrics {
  // Core KPIs
  collectionRate: number;
  noShowRate: number;
  patientRetention: number;
  avgVisitValue: number;
  avgDaysToCollect: number;

  // Secondary KPIs
  newPatientRate: number;
  visitCompletionRate: number;
  cleanClaimRate: number;
  denialRate: number;

  // Targets (for comparison)
  targets?: {
    collectionRate?: number;
    noShowRate?: number;
    patientRetention?: number;
    avgVisitValue?: number;
    avgDaysToCollect?: number;
  };
}

export interface KPIHistoryPoint {
  date: Date;
  periodType: 'daily' | 'weekly' | 'monthly';
  metrics: KPIMetrics;
}

export interface KPITrend {
  kpiName: string;
  currentValue: number;
  previousValue: number;
  change: number;
  changePercent: number;
  trend: 'improving' | 'declining' | 'stable';
  target?: number;
  targetStatus?: 'above' | 'below' | 'at';
}

// ============================================
// Custom Report Types
// ============================================

export interface CustomReportConfig {
  reportType: ReportType;
  name: string;
  description?: string;

  // Data source
  dataSource: 'appointments' | 'charges' | 'payments' | 'claims' | 'patients' | 'encounters';

  // Columns to include
  columns: ReportColumn[];

  // Filters
  filters: ReportFilter[];

  // Grouping
  groupBy?: string[];

  // Sorting
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';

  // Aggregations
  aggregations?: ReportAggregation[];

  // Date range
  dateRange?: {
    field: string;
    start?: Date;
    end?: Date;
    preset?: 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'lastQuarter' | 'thisYear' | 'lastYear';
  };
}

export interface ReportColumn {
  field: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'currency' | 'percentage' | 'boolean';
  visible?: boolean;
  width?: number;
  format?: string;
}

export interface ReportFilter {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in' | 'between';
  value: unknown;
  value2?: unknown; // For 'between' operator
}

export interface ReportAggregation {
  field: string;
  function: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'countDistinct';
  alias?: string;
}

export interface CustomReportResult {
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  totals?: Record<string, number>;
  rowCount: number;
  executionTime: number;
}

// ============================================
// Schedule Types
// ============================================

export interface ReportScheduleConfig {
  name: string;
  savedReportId: string;
  frequency: ScheduleFrequency;
  dayOfWeek?: number;
  dayOfMonth?: number;
  timeOfDay: string;
  timezone: string;
  exportFormat: ExportFormat;
  recipients: string[];
  subject?: string;
  message?: string;
}

export interface ScheduledReportRun {
  scheduleId: string;
  runAt: Date;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
  exportId?: string;
}

// ============================================
// Export Types
// ============================================

export interface ExportRequest {
  reportType: ReportType;
  format: ExportFormat;
  parameters: Record<string, unknown>;
  savedReportId?: string;
}

export interface ExportResult {
  exportId: string;
  fileName: string;
  fileSize?: number;
  downloadUrl?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  expiresAt?: Date;
}

// ============================================
// Date Range Helper Types
// ============================================

export interface DateRangePreset {
  label: string;
  value: string;
  getRange: () => { start: Date; end: Date };
}

export interface DateRangeFilter {
  start: Date;
  end: Date;
  preset?: string;
}

// ============================================
// Widget Type Definitions
// ============================================

export type WidgetDataSource =
  | 'todayVisits'
  | 'todayRevenue'
  | 'todayNewPatients'
  | 'todayNoShows'
  | 'totalAR'
  | 'collectionRate'
  | 'avgDaysToCollect'
  | 'pendingClaims'
  | 'visitTrend'
  | 'revenueTrend'
  | 'arAging'
  | 'topProcedures'
  | 'upcomingAppointments'
  | 'recentPayments';

export interface DashboardWidgetDefinition {
  id: string;
  name: string;
  widgetType: WidgetType;
  dataSource: WidgetDataSource;
  config: WidgetConfig;
  position: number;
  width: number;
  height: number;
}
