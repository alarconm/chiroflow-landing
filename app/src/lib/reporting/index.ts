// Reporting & Analytics - Epic 15
// Export all reporting services and types

// Types
export * from './types';

// Report Service (core infrastructure)
export {
  generateReport,
  getReport,
  listReports,
  deleteReport,
  markReportStale,
  cleanupExpiredReports,
  invalidateReportCache,
  getAvailableReportTypes,
  getDateRangePresets,
} from './report-service';

export type {
  GenerateReportOptions,
  ReportParameters,
  GeneratedReport,
  ReportMetadata,
} from './report-service';

// Dashboard metrics
export {
  getDashboardMetrics,
  getWidgetData,
} from './dashboard';

// Provider production
export {
  getProviderProductionReport,
  getProviderProductionComparison,
  getProviderProductivitySummary,
} from './provider-production';

// Collections and AR
export {
  getCollectionsReport,
  getARAgingReport,
  getCollectionRateByPayer,
} from './collections';

// KPI tracking
export {
  calculateKPIs,
  getKPIHistory,
  getKPITrends,
  createKPISnapshot,
} from './kpi-tracker';

// Custom report builder
export {
  executeCustomReport,
  getAvailableColumns,
} from './report-builder';

// Report scheduling
export {
  createReportSchedule,
  updateReportSchedule,
  toggleScheduleActive,
  deleteReportSchedule,
  getSchedulesDueToRun,
  recordScheduleRun,
  listSchedules,
  getScheduleRunHistory,
  getFrequencyOptions,
  getDayOfWeekOptions,
  validateScheduleConfig,
} from './scheduler';

// Report export
export {
  requestExport,
  processExport,
  getExportStatus,
  listExports,
  deleteExport,
  cleanupExpiredExports,
  reportResultToCSV,
  formatExportType,
  getAvailableExportFormats,
} from './export';

// Financial reports (US-102)
export {
  getDailyCollectionsReport,
  getARAgingDetailReport,
  getRevenueByProviderReport,
  getRevenueByServiceCodeReport,
  getPaymentTypeSummaryReport,
} from './financial-reports';

export type {
  DailyCollectionsReport,
  DailyCollectionsReportRow,
  AccountsReceivableAgingReport,
  ARAgingBucket,
  ARAgingByPatient,
  RevenueByProviderReport,
  RevenueByProviderRow,
  RevenueByServiceCodeReport,
  RevenueByServiceCodeRow,
  PaymentTypeSummaryReport,
  PaymentTypeSummaryRow,
} from './financial-reports';

// Claims and insurance reports (US-103)
export {
  getClaimsStatusSummaryReport,
  getDenialAnalysisReport,
  getPayerPerformanceReport,
  getCleanClaimRateReport,
  getOutstandingClaimsReport,
  getERAPostingSummaryReport,
} from './claims-reports';

export type {
  ClaimsStatusSummaryReport,
  ClaimStatusCount,
  DenialAnalysisReport,
  DenialByReasonCode,
  PayerPerformanceReport,
  PayerPerformanceRow,
  CleanClaimRateReport,
  CleanClaimByPayer,
  CleanClaimByProvider,
  CleanClaimTrendPoint,
  OutstandingClaimsReport,
  OutstandingClaimRow,
  OutstandingByAge,
  OutstandingByPayer,
  ERAPostingSummaryReport,
  ERAByPayer,
  RecentERAEntry,
} from './claims-reports';

// Scheduling and productivity reports (US-104)
export {
  getAppointmentVolumeReport,
  getNoShowCancellationReport,
  getProviderUtilizationReport,
  getNewPatientReport,
  getPatientVisitFrequencyReport,
  getPeakHoursReport,
} from './scheduling-reports';

export type {
  AppointmentVolumeReport,
  AppointmentVolumeRow,
  AppointmentVolumeByProvider,
  AppointmentVolumeByType,
  NoShowCancellationReport,
  NoShowByProvider,
  NoShowByDayOfWeek,
  NoShowByTimeSlot,
  CancellationReason,
  NoShowTrendPoint,
  ProviderUtilizationReport,
  ProviderUtilizationRow,
  UtilizationByDay,
  NewPatientReport,
  NewPatientByReferralSource,
  NewPatientByProvider,
  NewPatientTrendPoint,
  RecentNewPatient,
  PatientVisitFrequencyReport,
  VisitFrequencyBucket,
  PatientVisitCount,
  VisitFrequencyByProvider,
  PeakHoursReport,
  HourlyVolume,
  DayHourHeatmap,
  PeakTimeSummary,
} from './scheduling-reports';
