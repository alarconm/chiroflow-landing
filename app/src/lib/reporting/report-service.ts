// Report Service - Epic 15
// Core report generation, retrieval, and caching service

import { prisma } from '@/lib/prisma';
import { ReportType } from '@prisma/client';
import type {
  CustomReportConfig,
  CustomReportResult,
  DateRangeFilter,
} from './types';
import { executeCustomReport } from './report-builder';
import { getProviderProductionReport, getProviderProductionComparison } from './provider-production';
import { getCollectionsReport, getARAgingReport } from './collections';
import { calculateKPIs } from './kpi-tracker';

// Cache duration in milliseconds (default: 15 minutes)
const DEFAULT_CACHE_DURATION = 15 * 60 * 1000;

// Report generation options
export interface GenerateReportOptions {
  reportType: ReportType;
  name: string;
  parameters: ReportParameters;
  cacheDuration?: number; // Override default cache duration
  forceRefresh?: boolean; // Bypass cache and regenerate
}

// Report parameters for different report types
export interface ReportParameters {
  // Date range (common to most reports)
  dateRange?: DateRangeFilter;
  asOfDate?: Date;

  // Provider-specific
  providerId?: string;

  // Custom report config (for CUSTOM type)
  customConfig?: CustomReportConfig;

  // Additional filters
  filters?: Record<string, unknown>;
}

// Generated report result
export interface GeneratedReport {
  id: string;
  name: string;
  reportType: ReportType;
  parameters: ReportParameters;
  data: unknown;
  metadata: ReportMetadata;
  generatedAt: Date;
  expiresAt: Date | null;
  isStale: boolean;
  fromCache: boolean;
}

// Report metadata
export interface ReportMetadata {
  rowCount?: number;
  executionTime: number;
  cacheHit: boolean;
  dataSource?: string;
}

/**
 * Generate a report with optional caching
 */
export async function generateReport(
  organizationId: string,
  userId: string,
  options: GenerateReportOptions
): Promise<GeneratedReport> {
  const startTime = Date.now();

  // Check cache if not forcing refresh
  if (!options.forceRefresh) {
    const cachedReport = await getCachedReport(
      organizationId,
      options.reportType,
      options.parameters
    );

    if (cachedReport && !cachedReport.isStale) {
      const cachedMetadata = (cachedReport.metadata as unknown as ReportMetadata) || {
        executionTime: 0,
        cacheHit: true,
      };
      return {
        id: cachedReport.id,
        name: cachedReport.name,
        reportType: cachedReport.reportType,
        parameters: cachedReport.parameters as unknown as ReportParameters,
        data: cachedReport.data,
        metadata: {
          ...cachedMetadata,
          cacheHit: true,
        },
        generatedAt: cachedReport.generatedAt,
        expiresAt: cachedReport.expiresAt,
        isStale: cachedReport.isStale,
        fromCache: true,
      };
    }
  }

  // Generate fresh report
  const { data, metadata } = await executeReport(organizationId, options);

  const executionTime = Date.now() - startTime;
  const cacheDuration = options.cacheDuration ?? DEFAULT_CACHE_DURATION;
  const expiresAt = new Date(Date.now() + cacheDuration);

  // Store in cache
  const report = await prisma.report.create({
    data: {
      name: options.name,
      reportType: options.reportType,
      parameters: options.parameters as object,
      data: data as object,
      metadata: {
        ...metadata,
        executionTime,
        cacheHit: false,
      } as object,
      generatedAt: new Date(),
      expiresAt,
      isStale: false,
      organizationId,
      userId,
    },
  });

  const reportMetadata = (report.metadata as unknown as ReportMetadata) || {
    executionTime: 0,
    cacheHit: false,
  };
  return {
    id: report.id,
    name: report.name,
    reportType: report.reportType,
    parameters: report.parameters as unknown as ReportParameters,
    data: report.data,
    metadata: {
      ...reportMetadata,
      executionTime,
      cacheHit: false,
    },
    generatedAt: report.generatedAt,
    expiresAt: report.expiresAt,
    isStale: report.isStale,
    fromCache: false,
  };
}

/**
 * Get a specific report by ID
 */
export async function getReport(
  organizationId: string,
  reportId: string
): Promise<GeneratedReport | null> {
  const report = await prisma.report.findFirst({
    where: {
      id: reportId,
      organizationId,
    },
  });

  if (!report) {
    return null;
  }

  // Check if expired
  const isExpired = report.expiresAt ? report.expiresAt < new Date() : false;
  const reportMetadata = (report.metadata as unknown as ReportMetadata) || {
    executionTime: 0,
    cacheHit: true,
  };

  return {
    id: report.id,
    name: report.name,
    reportType: report.reportType,
    parameters: report.parameters as unknown as ReportParameters,
    data: report.data,
    metadata: reportMetadata,
    generatedAt: report.generatedAt,
    expiresAt: report.expiresAt,
    isStale: report.isStale || isExpired,
    fromCache: true,
  };
}

/**
 * List reports with filtering options
 */
export async function listReports(
  organizationId: string,
  options?: {
    reportType?: ReportType;
    userId?: string;
    includeStale?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<{ reports: GeneratedReport[]; total: number }> {
  const where: Record<string, unknown> = {
    organizationId,
  };

  if (options?.reportType) {
    where.reportType = options.reportType;
  }

  if (options?.userId) {
    where.userId = options.userId;
  }

  if (!options?.includeStale) {
    where.isStale = false;
    where.OR = [
      { expiresAt: null },
      { expiresAt: { gt: new Date() } },
    ];
  }

  const [reports, total] = await Promise.all([
    prisma.report.findMany({
      where,
      orderBy: { generatedAt: 'desc' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    }),
    prisma.report.count({ where }),
  ]);

  return {
    reports: reports.map((report) => {
      const reportMetadata = (report.metadata as unknown as ReportMetadata) || {
        executionTime: 0,
        cacheHit: true,
      };
      return {
        id: report.id,
        name: report.name,
        reportType: report.reportType,
        parameters: report.parameters as unknown as ReportParameters,
        data: report.data,
        metadata: reportMetadata,
        generatedAt: report.generatedAt,
        expiresAt: report.expiresAt,
        isStale: report.isStale || (report.expiresAt ? report.expiresAt < new Date() : false),
        fromCache: true,
      };
    }),
    total,
  };
}

/**
 * Delete a report from cache
 */
export async function deleteReport(
  organizationId: string,
  reportId: string
): Promise<void> {
  await prisma.report.deleteMany({
    where: {
      id: reportId,
      organizationId,
    },
  });
}

/**
 * Mark a report as stale (needs regeneration)
 */
export async function markReportStale(
  organizationId: string,
  reportId: string
): Promise<void> {
  await prisma.report.updateMany({
    where: {
      id: reportId,
      organizationId,
    },
    data: {
      isStale: true,
    },
  });
}

/**
 * Clean up expired reports
 */
export async function cleanupExpiredReports(): Promise<number> {
  const result = await prisma.report.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { isStale: true, generatedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      ],
    },
  });

  return result.count;
}

/**
 * Invalidate cache for a specific report type
 */
export async function invalidateReportCache(
  organizationId: string,
  reportType?: ReportType
): Promise<number> {
  const where: Record<string, unknown> = { organizationId };
  if (reportType) {
    where.reportType = reportType;
  }

  const result = await prisma.report.updateMany({
    where,
    data: { isStale: true },
  });

  return result.count;
}

/**
 * Get available report types for UI
 */
export function getAvailableReportTypes(): Array<{
  value: ReportType;
  label: string;
  description: string;
}> {
  return [
    {
      value: ReportType.DASHBOARD,
      label: 'Dashboard Overview',
      description: 'Real-time dashboard metrics and KPIs',
    },
    {
      value: ReportType.PROVIDER_PRODUCTION,
      label: 'Provider Production',
      description: 'Provider productivity and revenue metrics',
    },
    {
      value: ReportType.COLLECTIONS,
      label: 'Collections Report',
      description: 'Payment collections and receivables',
    },
    {
      value: ReportType.AR_AGING,
      label: 'AR Aging Report',
      description: 'Accounts receivable aging analysis',
    },
    {
      value: ReportType.KPI_SUMMARY,
      label: 'KPI Summary',
      description: 'Key performance indicators summary',
    },
    {
      value: ReportType.CUSTOM,
      label: 'Custom Report',
      description: 'Build a custom report with flexible options',
    },
  ];
}

/**
 * Get date range presets for report filtering
 */
export function getDateRangePresets(): Array<{
  value: string;
  label: string;
  getRange: () => { start: Date; end: Date };
}> {
  return [
    {
      value: 'today',
      label: 'Today',
      getRange: () => {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        return { start, end };
      },
    },
    {
      value: 'yesterday',
      label: 'Yesterday',
      getRange: () => {
        const start = new Date();
        start.setDate(start.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setHours(23, 59, 59, 999);
        return { start, end };
      },
    },
    {
      value: 'thisWeek',
      label: 'This Week',
      getRange: () => {
        const start = new Date();
        start.setDate(start.getDate() - start.getDay());
        start.setHours(0, 0, 0, 0);
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        return { start, end };
      },
    },
    {
      value: 'lastWeek',
      label: 'Last Week',
      getRange: () => {
        const end = new Date();
        end.setDate(end.getDate() - end.getDay() - 1);
        end.setHours(23, 59, 59, 999);
        const start = new Date(end);
        start.setDate(start.getDate() - 6);
        start.setHours(0, 0, 0, 0);
        return { start, end };
      },
    },
    {
      value: 'thisMonth',
      label: 'This Month',
      getRange: () => {
        const start = new Date();
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        return { start, end };
      },
    },
    {
      value: 'lastMonth',
      label: 'Last Month',
      getRange: () => {
        const end = new Date();
        end.setDate(0); // Last day of previous month
        end.setHours(23, 59, 59, 999);
        const start = new Date(end);
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        return { start, end };
      },
    },
    {
      value: 'thisQuarter',
      label: 'This Quarter',
      getRange: () => {
        const now = new Date();
        const quarter = Math.floor(now.getMonth() / 3);
        const start = new Date(now.getFullYear(), quarter * 3, 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        return { start, end };
      },
    },
    {
      value: 'lastQuarter',
      label: 'Last Quarter',
      getRange: () => {
        const now = new Date();
        const quarter = Math.floor(now.getMonth() / 3) - 1;
        const year = quarter < 0 ? now.getFullYear() - 1 : now.getFullYear();
        const adjustedQuarter = quarter < 0 ? 3 : quarter;
        const start = new Date(year, adjustedQuarter * 3, 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date(year, adjustedQuarter * 3 + 3, 0);
        end.setHours(23, 59, 59, 999);
        return { start, end };
      },
    },
    {
      value: 'thisYear',
      label: 'This Year',
      getRange: () => {
        const start = new Date();
        start.setMonth(0, 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        return { start, end };
      },
    },
    {
      value: 'lastYear',
      label: 'Last Year',
      getRange: () => {
        const now = new Date();
        const start = new Date(now.getFullYear() - 1, 0, 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date(now.getFullYear() - 1, 11, 31);
        end.setHours(23, 59, 59, 999);
        return { start, end };
      },
    },
  ];
}

// Internal helper functions

/**
 * Check for cached report matching parameters
 */
async function getCachedReport(
  organizationId: string,
  reportType: ReportType,
  parameters: ReportParameters
) {
  // Create a hash of parameters for comparison
  const paramHash = JSON.stringify(parameters);

  const cached = await prisma.report.findFirst({
    where: {
      organizationId,
      reportType,
      isStale: false,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    orderBy: { generatedAt: 'desc' },
  });

  if (cached) {
    const cachedParamHash = JSON.stringify(cached.parameters);
    if (cachedParamHash === paramHash) {
      return cached;
    }
  }

  return null;
}

/**
 * Execute report based on type
 */
async function executeReport(
  organizationId: string,
  options: GenerateReportOptions
): Promise<{ data: unknown; metadata: Partial<ReportMetadata> }> {
  const { reportType, parameters } = options;

  switch (reportType) {
    case ReportType.PROVIDER_PRODUCTION: {
      if (!parameters.dateRange) {
        throw new Error('Date range is required for provider production report');
      }

      if (parameters.providerId) {
        const data = await getProviderProductionReport(
          organizationId,
          parameters.providerId,
          parameters.dateRange.start,
          parameters.dateRange.end
        );
        return {
          data,
          metadata: { dataSource: 'provider_production' },
        };
      }

      const data = await getProviderProductionComparison(
        organizationId,
        parameters.dateRange.start,
        parameters.dateRange.end
      );
      return {
        data,
        metadata: { dataSource: 'provider_comparison' },
      };
    }

    case ReportType.COLLECTIONS: {
      if (!parameters.dateRange) {
        throw new Error('Date range is required for collections report');
      }

      const data = await getCollectionsReport(
        organizationId,
        parameters.dateRange.start,
        parameters.dateRange.end
      );
      return {
        data,
        metadata: { dataSource: 'collections' },
      };
    }

    case ReportType.AR_AGING: {
      const data = await getARAgingReport(organizationId, parameters.asOfDate);
      return {
        data,
        metadata: { dataSource: 'ar_aging' },
      };
    }

    case ReportType.KPI_SUMMARY: {
      if (!parameters.dateRange) {
        throw new Error('Date range is required for KPI summary');
      }

      const data = await calculateKPIs(
        organizationId,
        parameters.dateRange.start,
        parameters.dateRange.end
      );
      return {
        data,
        metadata: { dataSource: 'kpi_summary' },
      };
    }

    case ReportType.CUSTOM: {
      if (!parameters.customConfig) {
        throw new Error('Custom config is required for custom reports');
      }

      const result = await executeCustomReport(
        organizationId,
        parameters.customConfig
      );
      return {
        data: result,
        metadata: {
          rowCount: result.rowCount,
          executionTime: result.executionTime,
          dataSource: parameters.customConfig.dataSource,
        },
      };
    }

    case ReportType.DASHBOARD:
    default: {
      // Dashboard is typically not cached - return empty
      return {
        data: {},
        metadata: { dataSource: 'dashboard' },
      };
    }
  }
}
