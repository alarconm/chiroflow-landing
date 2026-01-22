/**
 * Cron Job Endpoint: Payment Plan Billing
 * Epic 10: Payment Processing - US-090
 *
 * This endpoint is designed to be called by a cron job scheduler
 * (e.g., Vercel Cron, GitHub Actions, or external service like cron-job.org)
 *
 * Recommended schedule: Daily at 9:00 AM local time
 *
 * Authentication: Uses a secret key to prevent unauthorized access
 */

import { NextRequest, NextResponse } from 'next/server';
import { processDueInstallments, type BillingJobConfig, type BillingJobResult } from '@/lib/payment/plan-billing-scheduler';

// Verify cron secret to prevent unauthorized access
function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  // If no secret is configured, reject all requests in production
  if (!cronSecret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('CRON_SECRET not configured - rejecting cron request');
      return false;
    }
    // Allow in development without secret
    return true;
  }

  // Check Authorization header
  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  // Check x-cron-secret header (alternative)
  const cronHeader = request.headers.get('x-cron-secret');
  if (cronHeader === cronSecret) {
    return true;
  }

  return false;
}

export async function GET(request: NextRequest) {
  // Verify authorization
  if (!verifyCronSecret(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const startTime = Date.now();

  try {
    console.log('[PaymentPlanBilling] Starting scheduled billing job...');

    // Parse optional config from query params
    const searchParams = request.nextUrl.searchParams;
    const config: Partial<BillingJobConfig> = {};

    if (searchParams.has('maxRetryAttempts')) {
      config.maxRetryAttempts = parseInt(searchParams.get('maxRetryAttempts')!, 10);
    }
    if (searchParams.has('retryIntervalDays')) {
      config.retryIntervalDays = parseInt(searchParams.get('retryIntervalDays')!, 10);
    }
    if (searchParams.has('reminderDaysBeforeDue')) {
      config.reminderDaysBeforeDue = parseInt(searchParams.get('reminderDaysBeforeDue')!, 10);
    }
    if (searchParams.has('sendReminders')) {
      config.sendReminders = searchParams.get('sendReminders') === 'true';
    }
    if (searchParams.has('alertStaffOnFailure')) {
      config.alertStaffOnFailure = searchParams.get('alertStaffOnFailure') === 'true';
    }

    // Run the billing job
    const result: BillingJobResult = await processDueInstallments(config);

    const duration = Date.now() - startTime;

    console.log('[PaymentPlanBilling] Billing job completed:', {
      duration: `${duration}ms`,
      processed: result.processedInstallments,
      successful: result.successfulPayments,
      failed: result.failedPayments,
      retried: result.retriedPayments,
      completed: result.completedPlans,
      reminders: result.remindersSent,
      errors: result.errors.length,
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      result: {
        processedInstallments: result.processedInstallments,
        successfulPayments: result.successfulPayments,
        failedPayments: result.failedPayments,
        retriedPayments: result.retriedPayments,
        completedPlans: result.completedPlans,
        remindersSent: result.remindersSent,
        errorCount: result.errors.length,
        // Only include error details if there are any
        ...(result.errors.length > 0 && {
          errors: result.errors.slice(0, 10), // Limit to first 10 errors
        }),
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    console.error('[PaymentPlanBilling] Billing job failed:', error);

    return NextResponse.json(
      {
        success: false,
        timestamp: new Date().toISOString(),
        duration: `${duration}ms`,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Also support POST for services that require it
export async function POST(request: NextRequest) {
  return GET(request);
}

// Vercel Cron configuration
// Add this to vercel.json:
// {
//   "crons": [{
//     "path": "/api/cron/payment-plan-billing",
//     "schedule": "0 9 * * *"
//   }]
// }
