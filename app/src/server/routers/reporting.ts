// Reporting & Analytics Router
// Epic 15 - tRPC procedures for reporting and analytics

import { z } from 'zod';
import { router, protectedProcedure, billerProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import {
  WidgetType,
  ReportType,
  ExportFormat,
  ScheduleFrequency,
} from '@prisma/client';

import {
  getDashboardMetrics,
  getWidgetData,
  getProviderProductionReport,
  getProviderProductionComparison,
  getCollectionsReport,
  getARAgingReport,
  calculateKPIs,
  getKPIHistory,
  getKPITrends,
  createKPISnapshot,
  executeCustomReport,
  getAvailableColumns,
  createReportSchedule,
  updateReportSchedule,
  toggleScheduleActive,
  deleteReportSchedule,
  listSchedules,
  requestExport,
  getExportStatus,
  listExports,
} from '@/lib/reporting';

import type {
  WidgetDataSource,
  CustomReportConfig,
  ReportScheduleConfig,
} from '@/lib/reporting';

// Zod schemas for input validation
const dateRangeSchema = z.object({
  start: z.date(),
  end: z.date(),
});

const widgetConfigSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  format: z.enum(['number', 'currency', 'percentage']).optional(),
  precision: z.number().optional(),
  showTrend: z.boolean().optional(),
  trendPeriod: z.enum(['day', 'week', 'month']).optional(),
});

const reportFilterSchema = z.object({
  field: z.string(),
  operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'in', 'between']),
  value: z.unknown(),
  value2: z.unknown().optional(),
});

const reportColumnSchema = z.object({
  field: z.string(),
  label: z.string(),
  type: z.enum(['string', 'number', 'date', 'currency', 'percentage', 'boolean']),
  visible: z.boolean().optional(),
  width: z.number().optional(),
  format: z.string().optional(),
});

const reportAggregationSchema = z.object({
  field: z.string(),
  function: z.enum(['sum', 'avg', 'min', 'max', 'count', 'countDistinct']),
  alias: z.string().optional(),
});

const customReportConfigSchema = z.object({
  reportType: z.nativeEnum(ReportType),
  name: z.string(),
  description: z.string().optional(),
  dataSource: z.enum(['appointments', 'charges', 'payments', 'claims', 'patients', 'encounters']),
  columns: z.array(reportColumnSchema),
  filters: z.array(reportFilterSchema),
  groupBy: z.array(z.string()).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  aggregations: z.array(reportAggregationSchema).optional(),
  dateRange: z.object({
    field: z.string(),
    start: z.date().optional(),
    end: z.date().optional(),
    preset: z.string().optional(),
  }).optional(),
});

export const reportingRouter = router({
  // ============================================
  // DASHBOARD
  // ============================================

  // Get real-time dashboard metrics
  getDashboard: protectedProcedure
    .input(
      z.object({
        date: z.date().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      return getDashboardMetrics(ctx.user.organizationId, input?.date || new Date());
    }),

  // Get user's dashboard widgets
  getWidgets: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.dashboardWidget.findMany({
      where: {
        organizationId: ctx.user.organizationId,
        userId: ctx.user.id,
        isActive: true,
      },
      orderBy: { position: 'asc' },
    });
  }),

  // Get data for a specific widget
  getWidgetData: protectedProcedure
    .input(
      z.object({
        dataSource: z.string(),
        dateRange: dateRangeSchema.optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return getWidgetData(
        ctx.user.organizationId,
        input.dataSource as WidgetDataSource,
        input.dateRange
      );
    }),

  // Save/update a widget
  saveWidget: protectedProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1),
        widgetType: z.nativeEnum(WidgetType),
        dataSource: z.string(),
        config: widgetConfigSchema,
        filters: z.record(z.string(), z.unknown()).optional(),
        position: z.number().optional(),
        width: z.number().min(1).max(4).optional(),
        height: z.number().min(1).max(4).optional(),
        refreshRate: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      if (id) {
        // Update existing
        const existing = await ctx.prisma.dashboardWidget.findFirst({
          where: { id, organizationId: ctx.user.organizationId, userId: ctx.user.id },
        });

        if (!existing) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Widget not found' });
        }

        return ctx.prisma.dashboardWidget.update({
          where: { id },
          data: {
            ...data,
            config: data.config as object,
            filters: data.filters as object | undefined,
          },
        });
      }

      // Create new
      const maxPosition = await ctx.prisma.dashboardWidget.aggregate({
        where: { organizationId: ctx.user.organizationId, userId: ctx.user.id },
        _max: { position: true },
      });

      return ctx.prisma.dashboardWidget.create({
        data: {
          ...data,
          config: data.config as object,
          filters: data.filters as object | undefined,
          position: data.position ?? (maxPosition._max.position ?? 0) + 1,
          organizationId: ctx.user.organizationId,
          userId: ctx.user.id,
        },
      });
    }),

  // Delete a widget
  deleteWidget: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.dashboardWidget.findFirst({
        where: { id: input.id, organizationId: ctx.user.organizationId, userId: ctx.user.id },
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Widget not found' });
      }

      return ctx.prisma.dashboardWidget.delete({ where: { id: input.id } });
    }),

  // Reorder widgets
  reorderWidgets: protectedProcedure
    .input(
      z.object({
        widgetIds: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updates = input.widgetIds.map((id, index) =>
        ctx.prisma.dashboardWidget.updateMany({
          where: { id, organizationId: ctx.user.organizationId, userId: ctx.user.id },
          data: { position: index },
        })
      );

      await ctx.prisma.$transaction(updates);
      return { success: true };
    }),

  // ============================================
  // PROVIDER PRODUCTION
  // ============================================

  getProviderProduction: billerProcedure
    .input(
      z.object({
        providerId: z.string().optional(),
        startDate: z.date(),
        endDate: z.date(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (input.providerId) {
        return getProviderProductionReport(
          ctx.user.organizationId,
          input.providerId,
          input.startDate,
          input.endDate
        );
      }

      return getProviderProductionComparison(
        ctx.user.organizationId,
        input.startDate,
        input.endDate
      );
    }),

  // ============================================
  // COLLECTIONS
  // ============================================

  getCollections: billerProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      return getCollectionsReport(ctx.user.organizationId, input.start, input.end);
    }),

  // ============================================
  // AR AGING
  // ============================================

  getARaging: billerProcedure
    .input(
      z.object({
        asOfDate: z.date().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      return getARAgingReport(ctx.user.organizationId, input?.asOfDate);
    }),

  // ============================================
  // KPIs
  // ============================================

  getKPIs: protectedProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      return calculateKPIs(ctx.user.organizationId, input.start, input.end);
    }),

  getKPIHistory: protectedProcedure
    .input(
      z.object({
        periodType: z.enum(['daily', 'weekly', 'monthly']),
        count: z.number().min(1).max(24).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return getKPIHistory(ctx.user.organizationId, input.periodType, input.count);
    }),

  getKPITrends: protectedProcedure
    .input(
      z.object({
        currentStart: z.date(),
        currentEnd: z.date(),
        previousStart: z.date(),
        previousEnd: z.date(),
        targets: z.object({
          collectionRate: z.number().optional(),
          noShowRate: z.number().optional(),
          patientRetention: z.number().optional(),
          avgVisitValue: z.number().optional(),
          avgDaysToCollect: z.number().optional(),
        }).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return getKPITrends(
        ctx.user.organizationId,
        input.currentStart,
        input.currentEnd,
        input.previousStart,
        input.previousEnd,
        input.targets
      );
    }),

  // Create KPI snapshot (admin only - used for scheduled jobs)
  createKPISnapshot: adminProcedure
    .input(
      z.object({
        periodType: z.enum(['daily', 'weekly', 'monthly']),
        periodStart: z.date(),
        periodEnd: z.date(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return createKPISnapshot(
        ctx.user.organizationId,
        input.periodType,
        input.periodStart,
        input.periodEnd
      );
    }),

  // ============================================
  // CUSTOM REPORTS
  // ============================================

  buildCustomReport: protectedProcedure
    .input(customReportConfigSchema)
    .query(async ({ ctx, input }) => {
      return executeCustomReport(ctx.user.organizationId, input as CustomReportConfig);
    }),

  getAvailableColumns: protectedProcedure
    .input(
      z.object({
        dataSource: z.enum(['appointments', 'charges', 'payments', 'claims', 'patients', 'encounters']),
      })
    )
    .query(async ({ input }) => {
      return getAvailableColumns(input.dataSource);
    }),

  // ============================================
  // SAVED REPORTS
  // ============================================

  saveReport: protectedProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1),
        description: z.string().optional(),
        reportType: z.nativeEnum(ReportType),
        config: z.record(z.string(), z.unknown()),
        filters: z.record(z.string(), z.unknown()).optional(),
        columns: z.array(reportColumnSchema).optional(),
        sortBy: z.string().optional(),
        sortOrder: z.string().optional(),
        isShared: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      if (id) {
        const existing = await ctx.prisma.savedReport.findFirst({
          where: { id, organizationId: ctx.user.organizationId },
        });

        if (!existing) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Report not found' });
        }

        // Only owner or admin can edit
        if (existing.userId !== ctx.user.id && ctx.user.role !== 'ADMIN' && ctx.user.role !== 'OWNER') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot edit this report' });
        }

        const updated = await ctx.prisma.savedReport.update({
          where: { id },
          data: {
            ...data,
            config: data.config as object,
            filters: data.filters as object | undefined,
            columns: data.columns as object[] | undefined,
          },
        });

        await auditLog('SAVED_REPORT_UPDATE', 'SavedReport', {
          entityId: id,
          changes: { name: data.name },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return updated;
      }

      const created = await ctx.prisma.savedReport.create({
        data: {
          ...data,
          config: data.config as object,
          filters: data.filters as object | undefined,
          columns: data.columns as object[] | undefined,
          organizationId: ctx.user.organizationId,
          userId: ctx.user.id,
        },
      });

      await auditLog('SAVED_REPORT_CREATE', 'SavedReport', {
        entityId: created.id,
        changes: { name: data.name, reportType: data.reportType },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return created;
    }),

  listSavedReports: protectedProcedure
    .input(
      z.object({
        reportType: z.nativeEnum(ReportType).optional(),
        includeShared: z.boolean().default(true),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const where: { organizationId: string; reportType?: ReportType; OR?: Array<{ userId?: string; isShared?: boolean }> } = {
        organizationId: ctx.user.organizationId,
      };

      if (input?.reportType) {
        where.reportType = input.reportType;
      }

      if (input?.includeShared !== false) {
        where.OR = [
          { userId: ctx.user.id },
          { isShared: true },
        ];
      } else {
        where.OR = [{ userId: ctx.user.id }];
      }

      return ctx.prisma.savedReport.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
      });
    }),

  getSavedReport: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const report = await ctx.prisma.savedReport.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
          OR: [
            { userId: ctx.user.id },
            { isShared: true },
          ],
        },
        include: {
          schedules: true,
        },
      });

      if (!report) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Report not found' });
      }

      return report;
    }),

  deleteSavedReport: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.savedReport.findFirst({
        where: { id: input.id, organizationId: ctx.user.organizationId },
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Report not found' });
      }

      if (existing.userId !== ctx.user.id && ctx.user.role !== 'ADMIN' && ctx.user.role !== 'OWNER') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot delete this report' });
      }

      await ctx.prisma.savedReport.delete({ where: { id: input.id } });

      await auditLog('SAVED_REPORT_DELETE', 'SavedReport', {
        entityId: input.id,
        changes: { name: existing.name },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // ============================================
  // SCHEDULES
  // ============================================

  scheduleReport: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        savedReportId: z.string(),
        frequency: z.nativeEnum(ScheduleFrequency),
        dayOfWeek: z.number().min(0).max(6).optional(),
        dayOfMonth: z.number().min(1).max(28).optional(),
        timeOfDay: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
        timezone: z.string().default('America/Los_Angeles'),
        exportFormat: z.nativeEnum(ExportFormat).default(ExportFormat.PDF),
        recipients: z.array(z.string().email()),
        subject: z.string().optional(),
        message: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify saved report exists and user has access
      const report = await ctx.prisma.savedReport.findFirst({
        where: {
          id: input.savedReportId,
          organizationId: ctx.user.organizationId,
          OR: [
            { userId: ctx.user.id },
            { isShared: true },
          ],
        },
      });

      if (!report) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Saved report not found' });
      }

      const schedule = await createReportSchedule(
        ctx.user.organizationId,
        ctx.user.id,
        input as ReportScheduleConfig
      );

      await auditLog('REPORT_SCHEDULE_CREATE', 'ReportSchedule', {
        entityId: schedule.id,
        changes: { name: input.name, frequency: input.frequency },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return schedule;
    }),

  listSchedules: protectedProcedure
    .input(
      z.object({
        savedReportId: z.string().optional(),
        isActive: z.boolean().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      return listSchedules(ctx.user.organizationId, input);
    }),

  updateSchedule: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        frequency: z.nativeEnum(ScheduleFrequency).optional(),
        dayOfWeek: z.number().min(0).max(6).optional(),
        dayOfMonth: z.number().min(1).max(28).optional(),
        timeOfDay: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
        timezone: z.string().optional(),
        exportFormat: z.nativeEnum(ExportFormat).optional(),
        recipients: z.array(z.string().email()).optional(),
        subject: z.string().optional(),
        message: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      const schedule = await updateReportSchedule(
        ctx.user.organizationId,
        id,
        updates as Partial<ReportScheduleConfig>
      );

      await auditLog('REPORT_SCHEDULE_UPDATE', 'ReportSchedule', {
        entityId: id,
        changes: updates,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return schedule;
    }),

  toggleScheduleActive: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        isActive: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const schedule = await toggleScheduleActive(
        ctx.user.organizationId,
        input.id,
        input.isActive
      );

      await auditLog('REPORT_SCHEDULE_TOGGLE', 'ReportSchedule', {
        entityId: input.id,
        changes: { isActive: input.isActive },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return schedule;
    }),

  cancelSchedule: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await deleteReportSchedule(ctx.user.organizationId, input.id);

      await auditLog('REPORT_SCHEDULE_DELETE', 'ReportSchedule', {
        entityId: input.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // ============================================
  // EXPORT
  // ============================================

  exportReport: protectedProcedure
    .input(
      z.object({
        reportType: z.nativeEnum(ReportType),
        format: z.nativeEnum(ExportFormat),
        parameters: z.record(z.string(), z.unknown()),
        savedReportId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await requestExport(ctx.user.organizationId, ctx.user.id, {
        reportType: input.reportType,
        format: input.format,
        parameters: input.parameters as Record<string, unknown>,
        savedReportId: input.savedReportId,
      });

      await auditLog('REPORT_EXPORT_REQUEST', 'ReportExport', {
        entityId: result.exportId,
        changes: { reportType: input.reportType, format: input.format },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return result;
    }),

  getExportStatus: protectedProcedure
    .input(z.object({ exportId: z.string() }))
    .query(async ({ ctx, input }) => {
      const status = await getExportStatus(ctx.user.organizationId, input.exportId);

      if (!status) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Export not found' });
      }

      return status;
    }),

  listExports: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      return listExports(ctx.user.organizationId, ctx.user.id, input?.limit);
    }),
});
