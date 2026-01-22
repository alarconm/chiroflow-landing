// Report Export Service
// Epic 15 - Export reports to PDF, CSV, Excel

import { prisma } from '@/lib/prisma';
import { ExportFormat, ReportType } from '@prisma/client';
import type { ExportRequest, ExportResult, CustomReportResult } from './types';

/**
 * Request a report export
 */
export async function requestExport(
  organizationId: string,
  userId: string,
  request: ExportRequest
): Promise<ExportResult> {
  // Create export record
  const fileName = generateFileName(request.reportType, request.format);

  const exportRecord = await prisma.reportExport.create({
    data: {
      organizationId,
      userId,
      reportType: request.reportType,
      exportFormat: request.format,
      fileName,
      parameters: request.parameters as object,
      savedReportId: request.savedReportId,
      status: 'pending',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    },
  });

  // In production, you would queue this for async processing
  // For now, we'll return the pending export
  return {
    exportId: exportRecord.id,
    fileName,
    status: 'pending',
    expiresAt: exportRecord.expiresAt || undefined,
  };
}

/**
 * Process an export (would be called by a background job in production)
 */
export async function processExport(exportId: string): Promise<ExportResult> {
  const exportRecord = await prisma.reportExport.findUnique({
    where: { id: exportId },
  });

  if (!exportRecord) {
    throw new Error('Export not found');
  }

  try {
    // Update status to processing
    await prisma.reportExport.update({
      where: { id: exportId },
      data: { status: 'processing' },
    });

    // Generate the export content
    let content: string;
    let contentType: string;
    let fileSize: number;

    switch (exportRecord.exportFormat) {
      case ExportFormat.CSV:
        ({ content, fileSize } = await generateCSV(exportRecord));
        contentType = 'text/csv';
        break;

      case ExportFormat.JSON:
        ({ content, fileSize } = await generateJSON(exportRecord));
        contentType = 'application/json';
        break;

      case ExportFormat.PDF:
        // PDF would require a library like puppeteer or jspdf
        // For now, we'll return a placeholder
        content = 'PDF generation not implemented';
        fileSize = content.length;
        contentType = 'application/pdf';
        break;

      case ExportFormat.EXCEL:
        // Excel would require a library like exceljs
        // For now, we'll generate CSV as a fallback
        ({ content, fileSize } = await generateCSV(exportRecord));
        contentType = 'text/csv';
        break;

      default:
        throw new Error(`Unsupported export format: ${exportRecord.exportFormat}`);
    }

    // In production, you would upload to S3 or similar storage
    // For now, we'll just update the record
    const updated = await prisma.reportExport.update({
      where: { id: exportId },
      data: {
        status: 'completed',
        fileSize,
        completedAt: new Date(),
        // storageKey would be set after upload
      },
    });

    return {
      exportId: updated.id,
      fileName: updated.fileName,
      fileSize: updated.fileSize || undefined,
      status: 'completed',
      expiresAt: updated.expiresAt || undefined,
      // downloadUrl would be generated from storageKey
    };
  } catch (error) {
    await prisma.reportExport.update({
      where: { id: exportId },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });

    throw error;
  }
}

/**
 * Get export status
 */
export async function getExportStatus(
  organizationId: string,
  exportId: string
): Promise<ExportResult | null> {
  const exportRecord = await prisma.reportExport.findFirst({
    where: { id: exportId, organizationId },
  });

  if (!exportRecord) {
    return null;
  }

  return {
    exportId: exportRecord.id,
    fileName: exportRecord.fileName,
    fileSize: exportRecord.fileSize || undefined,
    status: exportRecord.status as ExportResult['status'],
    error: exportRecord.error || undefined,
    expiresAt: exportRecord.expiresAt || undefined,
  };
}

/**
 * List recent exports for a user
 */
export async function listExports(
  organizationId: string,
  userId: string,
  limit: number = 20
) {
  return prisma.reportExport.findMany({
    where: {
      organizationId,
      userId,
    },
    orderBy: { requestedAt: 'desc' },
    take: limit,
  });
}

/**
 * Delete an export
 */
export async function deleteExport(
  organizationId: string,
  exportId: string
) {
  const existing = await prisma.reportExport.findFirst({
    where: { id: exportId, organizationId },
  });

  if (!existing) {
    throw new Error('Export not found');
  }

  // In production, also delete from storage
  return prisma.reportExport.delete({
    where: { id: exportId },
  });
}

/**
 * Clean up expired exports
 */
export async function cleanupExpiredExports() {
  const expired = await prisma.reportExport.findMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });

  // In production, delete files from storage
  for (const exp of expired) {
    if (exp.storageKey) {
      // Delete from storage
    }
  }

  return prisma.reportExport.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });
}

// Helper functions

function generateFileName(reportType: ReportType, format: ExportFormat): string {
  const timestamp = new Date().toISOString().slice(0, 10);
  const typeSlug = reportType.toLowerCase().replace(/_/g, '-');
  const extension = format.toLowerCase();

  return `${typeSlug}-${timestamp}.${extension}`;
}

async function generateCSV(
  exportRecord: {
    reportType: ReportType;
    parameters: unknown;
    organizationId: string;
  }
): Promise<{ content: string; fileSize: number }> {
  // This would call the appropriate report function based on reportType
  // and convert the result to CSV

  // For demonstration, generate a simple CSV
  const headers = ['Column1', 'Column2', 'Column3'];
  const rows = [
    ['Value1', 'Value2', 'Value3'],
    ['Value4', 'Value5', 'Value6'],
  ];

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map(escapeCSV).join(',')),
  ].join('\n');

  return {
    content: csvContent,
    fileSize: csvContent.length,
  };
}

async function generateJSON(
  exportRecord: {
    reportType: ReportType;
    parameters: unknown;
    organizationId: string;
  }
): Promise<{ content: string; fileSize: number }> {
  // This would call the appropriate report function based on reportType
  // and return JSON

  const data = {
    reportType: exportRecord.reportType,
    generatedAt: new Date().toISOString(),
    parameters: exportRecord.parameters,
    data: [], // Would contain actual report data
  };

  const jsonContent = JSON.stringify(data, null, 2);

  return {
    content: jsonContent,
    fileSize: jsonContent.length,
  };
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Convert report result to CSV
 */
export function reportResultToCSV(result: CustomReportResult): string {
  const headers = result.columns.map((c) => c.label);
  const rows = result.rows.map((row) =>
    result.columns.map((col) => {
      const value = row[col.field];
      if (value === null || value === undefined) return '';
      if (col.type === 'date' && value instanceof Date) {
        return value.toISOString().slice(0, 10);
      }
      if (col.type === 'currency' && typeof value === 'number') {
        return value.toFixed(2);
      }
      return String(value);
    })
  );

  const csvContent = [
    headers.map(escapeCSV).join(','),
    ...rows.map((row) => row.map(escapeCSV).join(',')),
  ].join('\n');

  // Add totals row if present
  if (result.totals) {
    const totalsRow = result.columns.map((col) => {
      const total = result.totals?.[col.field];
      return total !== undefined ? total.toFixed(2) : '';
    });
    return csvContent + '\n' + ['TOTALS', ...totalsRow.slice(1)].map(escapeCSV).join(',');
  }

  return csvContent;
}

/**
 * Format export format for display
 */
export function formatExportType(format: ExportFormat): string {
  switch (format) {
    case ExportFormat.PDF:
      return 'PDF Document';
    case ExportFormat.CSV:
      return 'CSV Spreadsheet';
    case ExportFormat.EXCEL:
      return 'Excel Spreadsheet';
    case ExportFormat.JSON:
      return 'JSON Data';
    default:
      return format;
  }
}

/**
 * Get available export formats
 */
export function getAvailableExportFormats() {
  return [
    { value: 'PDF', label: 'PDF Document', icon: 'file-text' },
    { value: 'CSV', label: 'CSV Spreadsheet', icon: 'file-spreadsheet' },
    { value: 'EXCEL', label: 'Excel Spreadsheet', icon: 'file-spreadsheet' },
    { value: 'JSON', label: 'JSON Data', icon: 'file-code' },
  ];
}
