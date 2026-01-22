// Reporting & Analytics - Epic 15
// Export all reporting services and types

// Types
export * from './types';

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
