// Report Delivery Service
// Epic 15 - US-106: Email delivery for scheduled reports

import { prisma } from '@/lib/prisma';
import { notificationService } from '@/lib/notification-service';
import { processExport, getExportStatus } from './export';
import type { ExportFormat, ScheduleFrequency } from '@prisma/client';

/**
 * Schedule run result
 */
export interface ScheduleRunResult {
  scheduleId: string;
  runHistoryId: string;
  status: 'completed' | 'partial' | 'failed';
  deliveredTo: string[];
  failedDeliveries: Array<{ email: string; error: string }>;
  exportId?: string;
  duration: number;
}

/**
 * Failure notification options
 */
export interface FailureNotificationOptions {
  scheduleId: string;
  scheduleName: string;
  error: string;
  runAt: Date;
  notifyEmails: string[];
  organizationName?: string;
}

/**
 * Execute a scheduled report and deliver to recipients
 */
export async function executeScheduledReport(
  scheduleId: string
): Promise<ScheduleRunResult> {
  const startTime = Date.now();

  // Get schedule with saved report details
  const schedule = await prisma.reportSchedule.findUnique({
    where: { id: scheduleId },
    include: {
      savedReport: true,
      organization: true,
    },
  });

  if (!schedule) {
    throw new Error('Schedule not found');
  }

  if (!schedule.isActive) {
    throw new Error('Schedule is not active');
  }

  // Create run history entry
  const runHistory = await prisma.scheduleRunHistory.create({
    data: {
      scheduleId,
      organizationId: schedule.organizationId,
      status: 'running',
      deliveredTo: [],
      deliveryCount: 0,
      failedCount: 0,
      startedAt: new Date(),
    },
  });

  const deliveredTo: string[] = [];
  const failedDeliveries: Array<{ email: string; error: string }> = [];
  let exportId: string | undefined;

  try {
    // Generate the report export
    const exportResult = await requestAndProcessExport(
      schedule.organizationId,
      schedule.userId,
      schedule.savedReport.reportType,
      schedule.exportFormat,
      schedule.savedReport.config as Record<string, unknown>,
      schedule.savedReportId
    );

    exportId = exportResult.exportId;

    // Wait for export to complete
    let exportStatus = await getExportStatus(schedule.organizationId, exportId);
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds max wait

    while (exportStatus?.status === 'processing' && attempts < maxAttempts) {
      await sleep(1000);
      exportStatus = await getExportStatus(schedule.organizationId, exportId);
      attempts++;
    }

    if (exportStatus?.status !== 'completed') {
      throw new Error(`Export failed: ${exportStatus?.error || 'Timeout'}`);
    }

    // Send emails to all recipients
    for (const email of schedule.recipients) {
      try {
        const result = await sendReportEmail({
          to: email,
          subject: schedule.subject || `Scheduled Report: ${schedule.name}`,
          reportName: schedule.name,
          savedReportName: schedule.savedReport.name,
          organizationName: schedule.organization.name,
          frequency: schedule.frequency,
          message: schedule.message || undefined,
          exportFileName: exportStatus.fileName,
          downloadUrl: exportStatus.downloadUrl,
        });

        if (result.success) {
          deliveredTo.push(email);
        } else {
          failedDeliveries.push({ email, error: result.error || 'Unknown error' });
        }
      } catch (error) {
        failedDeliveries.push({
          email,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const duration = Date.now() - startTime;
    const status = failedDeliveries.length === 0
      ? 'completed'
      : deliveredTo.length > 0
        ? 'partial'
        : 'failed';

    // Update run history
    await prisma.scheduleRunHistory.update({
      where: { id: runHistory.id },
      data: {
        status,
        deliveredTo,
        deliveryCount: deliveredTo.length,
        failedCount: failedDeliveries.length,
        exportId,
        completedAt: new Date(),
        duration,
        error: failedDeliveries.length > 0
          ? `Failed to deliver to: ${failedDeliveries.map(f => f.email).join(', ')}`
          : undefined,
      },
    });

    // Update schedule with last run info
    await updateScheduleAfterRun(scheduleId, status === 'completed' ? 'success' : 'partial', schedule.frequency);

    // Send failure notifications if any deliveries failed
    if (failedDeliveries.length > 0 && status !== 'failed') {
      await sendPartialFailureNotification({
        scheduleId,
        scheduleName: schedule.name,
        failedDeliveries,
        successCount: deliveredTo.length,
        organizationName: schedule.organization.name,
      });
    }

    return {
      scheduleId,
      runHistoryId: runHistory.id,
      status: status as 'completed' | 'partial' | 'failed',
      deliveredTo,
      failedDeliveries,
      exportId,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Update run history with failure
    await prisma.scheduleRunHistory.update({
      where: { id: runHistory.id },
      data: {
        status: 'failed',
        error: errorMessage,
        completedAt: new Date(),
        duration,
      },
    });

    // Update schedule with failure info
    await updateScheduleAfterRun(scheduleId, 'error', schedule.frequency, errorMessage);

    // Send failure notification
    await sendFailureNotification({
      scheduleId,
      scheduleName: schedule.name,
      error: errorMessage,
      runAt: new Date(),
      notifyEmails: schedule.recipients,
      organizationName: schedule.organization.name,
    });

    return {
      scheduleId,
      runHistoryId: runHistory.id,
      status: 'failed',
      deliveredTo: [],
      failedDeliveries: schedule.recipients.map(email => ({ email, error: errorMessage })),
      exportId,
      duration,
    };
  }
}

/**
 * Send report email to a recipient
 */
async function sendReportEmail(options: {
  to: string;
  subject: string;
  reportName: string;
  savedReportName: string;
  organizationName: string;
  frequency: ScheduleFrequency;
  message?: string;
  exportFileName?: string;
  downloadUrl?: string;
}): Promise<{ success: boolean; error?: string }> {
  const frequencyLabel = getFrequencyLabel(options.frequency);

  const body = `
Hello,

Your ${frequencyLabel.toLowerCase()} scheduled report "${options.reportName}" is ready.

Report: ${options.savedReportName}
Generated: ${new Date().toLocaleString()}
${options.message ? `\nMessage from sender:\n${options.message}\n` : ''}
${options.downloadUrl ? `\nDownload your report: ${options.downloadUrl}` : ''}
${options.exportFileName ? `\nFile: ${options.exportFileName}` : ''}

This report was automatically generated and sent by ${options.organizationName}.

If you no longer wish to receive this report, please contact your administrator.

Best regards,
${options.organizationName}
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #053e67; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
    .button { display: inline-block; background: #053e67; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 10px 0; }
    .info { background: white; padding: 15px; border-radius: 4px; margin: 10px 0; }
    .message { background: #e8f4fd; padding: 15px; border-left: 4px solid #053e67; margin: 15px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">Scheduled Report Ready</h1>
    </div>
    <div class="content">
      <p>Hello,</p>
      <p>Your <strong>${frequencyLabel.toLowerCase()}</strong> scheduled report is ready.</p>

      <div class="info">
        <p><strong>Report Name:</strong> ${options.reportName}</p>
        <p><strong>Report:</strong> ${options.savedReportName}</p>
        <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
        ${options.exportFileName ? `<p><strong>File:</strong> ${options.exportFileName}</p>` : ''}
      </div>

      ${options.message ? `<div class="message"><strong>Message:</strong><br>${options.message}</div>` : ''}

      ${options.downloadUrl ? `<p style="text-align: center;"><a href="${options.downloadUrl}" class="button">Download Report</a></p>` : ''}

      <p style="color: #666; font-size: 14px;">This report was automatically generated and sent by ${options.organizationName}.</p>
    </div>
    <div class="footer">
      <p>If you no longer wish to receive this report, please contact your administrator.</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return notificationService.sendEmail(options.to, options.subject, body, { html });
}

/**
 * Send failure notification to relevant parties
 */
export async function sendFailureNotification(
  options: FailureNotificationOptions
): Promise<void> {
  const subject = `[ALERT] Scheduled Report Failed: ${options.scheduleName}`;

  const body = `
Alert: Scheduled Report Failure

A scheduled report has failed to generate or deliver.

Schedule: ${options.scheduleName}
Schedule ID: ${options.scheduleId}
Time: ${options.runAt.toLocaleString()}
Error: ${options.error}

Organization: ${options.organizationName || 'Unknown'}

Please check the report schedule configuration and try again.

This is an automated notification.
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #c90000; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .error { background: #fff0f0; border: 1px solid #c90000; padding: 15px; border-radius: 4px; margin: 10px 0; }
    .info { background: white; padding: 15px; border-radius: 4px; margin: 10px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">Scheduled Report Failed</h1>
    </div>
    <div class="content">
      <p>A scheduled report has failed to generate or deliver.</p>

      <div class="info">
        <p><strong>Schedule:</strong> ${options.scheduleName}</p>
        <p><strong>Schedule ID:</strong> ${options.scheduleId}</p>
        <p><strong>Time:</strong> ${options.runAt.toLocaleString()}</p>
        <p><strong>Organization:</strong> ${options.organizationName || 'Unknown'}</p>
      </div>

      <div class="error">
        <p><strong>Error:</strong></p>
        <pre style="white-space: pre-wrap; word-break: break-word;">${options.error}</pre>
      </div>

      <p>Please check the report schedule configuration and try again.</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  // Send to all recipients
  for (const email of options.notifyEmails) {
    await notificationService.sendEmail(email, subject, body, { html });
  }
}

/**
 * Send partial failure notification (some deliveries succeeded, some failed)
 */
async function sendPartialFailureNotification(options: {
  scheduleId: string;
  scheduleName: string;
  failedDeliveries: Array<{ email: string; error: string }>;
  successCount: number;
  organizationName: string;
}): Promise<void> {
  // Get schedule to find admin contacts
  const schedule = await prisma.reportSchedule.findUnique({
    where: { id: options.scheduleId },
    select: { userId: true, organizationId: true },
  });

  if (!schedule) return;

  // Get the user who created the schedule
  const user = await prisma.user.findUnique({
    where: { id: schedule.userId },
    select: { email: true },
  });

  if (!user) return;

  const subject = `[Warning] Partial Delivery Failure: ${options.scheduleName}`;

  const body = `
Warning: Partial Report Delivery Failure

Some recipients did not receive the scheduled report.

Schedule: ${options.scheduleName}
Successful Deliveries: ${options.successCount}
Failed Deliveries: ${options.failedDeliveries.length}

Failed Recipients:
${options.failedDeliveries.map(f => `- ${f.email}: ${f.error}`).join('\n')}

Please verify the email addresses and try again.

This is an automated notification.
  `.trim();

  await notificationService.sendEmail(user.email, subject, body);
}

/**
 * Get schedule run history
 */
export async function getScheduleRunHistoryList(
  organizationId: string,
  scheduleId: string,
  options?: {
    limit?: number;
    offset?: number;
    status?: string;
  }
): Promise<{
  runs: Array<{
    id: string;
    runAt: Date;
    status: string;
    error?: string;
    deliveredTo: string[];
    deliveryCount: number;
    failedCount: number;
    exportId?: string;
    duration?: number;
  }>;
  total: number;
}> {
  // Verify schedule exists and belongs to org
  const schedule = await prisma.reportSchedule.findFirst({
    where: { id: scheduleId, organizationId },
  });

  if (!schedule) {
    throw new Error('Schedule not found');
  }

  const where: Record<string, unknown> = {
    scheduleId,
    organizationId,
  };

  if (options?.status) {
    where.status = options.status;
  }

  const [runs, total] = await Promise.all([
    prisma.scheduleRunHistory.findMany({
      where,
      orderBy: { runAt: 'desc' },
      take: options?.limit ?? 20,
      skip: options?.offset ?? 0,
    }),
    prisma.scheduleRunHistory.count({ where }),
  ]);

  return {
    runs: runs.map((run) => ({
      id: run.id,
      runAt: run.runAt,
      status: run.status,
      error: run.error || undefined,
      deliveredTo: run.deliveredTo,
      deliveryCount: run.deliveryCount,
      failedCount: run.failedCount,
      exportId: run.exportId || undefined,
      duration: run.duration || undefined,
    })),
    total,
  };
}

/**
 * Get schedules due for execution
 */
export async function getSchedulesDueForExecution(
  beforeTime: Date = new Date()
): Promise<Array<{
  id: string;
  name: string;
  organizationId: string;
  savedReportId: string;
  nextRunAt: Date;
}>> {
  const schedules = await prisma.reportSchedule.findMany({
    where: {
      isActive: true,
      nextRunAt: { lte: beforeTime },
    },
    select: {
      id: true,
      name: true,
      organizationId: true,
      savedReportId: true,
      nextRunAt: true,
    },
  });

  return schedules.map((s) => ({
    id: s.id,
    name: s.name,
    organizationId: s.organizationId,
    savedReportId: s.savedReportId,
    nextRunAt: s.nextRunAt!,
  }));
}

// Helper functions

async function requestAndProcessExport(
  organizationId: string,
  userId: string,
  reportType: string,
  exportFormat: ExportFormat,
  config: Record<string, unknown>,
  savedReportId: string
): Promise<{ exportId: string }> {
  // Import dynamically to avoid circular dependency
  const { requestExport } = await import('./export');

  const result = await requestExport(organizationId, userId, {
    reportType: reportType as any,
    format: exportFormat,
    parameters: config,
    savedReportId,
  });

  // Process the export immediately
  await processExport(result.exportId);

  return { exportId: result.exportId };
}

async function updateScheduleAfterRun(
  scheduleId: string,
  status: 'success' | 'error' | 'partial',
  frequency: ScheduleFrequency,
  error?: string
): Promise<void> {
  const nextRunAt = calculateNextRunTime(frequency);

  await prisma.reportSchedule.update({
    where: { id: scheduleId },
    data: {
      lastRunAt: new Date(),
      lastStatus: status,
      lastError: error || null,
      nextRunAt,
    },
  });
}

function calculateNextRunTime(frequency: ScheduleFrequency): Date {
  const now = new Date();

  switch (frequency) {
    case 'DAILY':
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case 'WEEKLY':
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case 'MONTHLY':
      const nextMonth = new Date(now);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      return nextMonth;
    case 'QUARTERLY':
      const nextQuarter = new Date(now);
      nextQuarter.setMonth(nextQuarter.getMonth() + 3);
      return nextQuarter;
    default:
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }
}

function getFrequencyLabel(frequency: ScheduleFrequency): string {
  switch (frequency) {
    case 'DAILY':
      return 'Daily';
    case 'WEEKLY':
      return 'Weekly';
    case 'MONTHLY':
      return 'Monthly';
    case 'QUARTERLY':
      return 'Quarterly';
    default:
      return 'Scheduled';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
