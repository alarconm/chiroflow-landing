/**
 * Payment Plan Billing Scheduler
 * Epic 10: Payment Processing - US-090
 *
 * Handles automated billing for payment plans:
 * - Processes due installments on schedule
 * - Retries failed payments with configurable attempts
 * - Sends payment reminders before due date
 * - Sends confirmation on successful payment
 * - Alerts staff on failed payments
 * - Handles plan completion
 */

import { prisma } from '@/lib/prisma';
import { notificationService } from '@/lib/notification-service';
import { auditLog, type AuditAction } from '@/lib/audit';
import {
  getPaymentProvider,
  formatCurrency,
  toCents,
  getCardBrandDisplayName,
  maskCardNumber,
} from '@/lib/payment';
import {
  PaymentPlanStatus,
  InstallmentStatus,
  PaymentTransactionStatus,
  PaymentMethod as PrismaPaymentMethod,
} from '@prisma/client';

// ============================================
// Types
// ============================================

export interface BillingJobConfig {
  /** Maximum number of retry attempts for failed payments */
  maxRetryAttempts: number;
  /** Days between retry attempts */
  retryIntervalDays: number;
  /** Days before due date to send reminder */
  reminderDaysBeforeDue: number;
  /** Whether to send reminders */
  sendReminders: boolean;
  /** Whether to alert staff on failures */
  alertStaffOnFailure: boolean;
  /** Staff email for failure alerts */
  staffAlertEmail?: string;
}

export interface BillingJobResult {
  processedInstallments: number;
  successfulPayments: number;
  failedPayments: number;
  retriedPayments: number;
  completedPlans: number;
  remindersSent: number;
  errors: Array<{
    installmentId: string;
    error: string;
  }>;
}

export interface InstallmentProcessResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  isRetry: boolean;
  shouldAlert: boolean;
}

// Default configuration
const DEFAULT_CONFIG: BillingJobConfig = {
  maxRetryAttempts: 3,
  retryIntervalDays: 3,
  reminderDaysBeforeDue: 3,
  sendReminders: true,
  alertStaffOnFailure: true,
};

// Audit action for billing
const BILLING_AUDIT_ACTION = 'BILLING_UPDATE' as AuditAction;

// System user ID for automated jobs (used when no user context)
const SYSTEM_USER_ID = 'system-automated-billing';

// ============================================
// Main Billing Job
// ============================================

/**
 * Process all due payment plan installments
 * This should be run as a scheduled job (e.g., daily at 9 AM)
 */
export async function processDueInstallments(
  config: Partial<BillingJobConfig> = {}
): Promise<BillingJobResult> {
  const jobConfig = { ...DEFAULT_CONFIG, ...config };
  const result: BillingJobResult = {
    processedInstallments: 0,
    successfulPayments: 0,
    failedPayments: 0,
    retriedPayments: 0,
    completedPlans: 0,
    remindersSent: 0,
    errors: [],
  };

  const now = new Date();

  // 1. Send payment reminders for upcoming installments
  if (jobConfig.sendReminders) {
    const reminderCount = await sendPaymentReminders(jobConfig.reminderDaysBeforeDue);
    result.remindersSent = reminderCount;
  }

  // 2. Get all due installments (scheduled and due today or earlier)
  const dueInstallments = await getDueInstallments(now);

  // 3. Get failed installments that are ready for retry
  const retryInstallments = await getRetryReadyInstallments(now, jobConfig.maxRetryAttempts);

  // Combine both lists
  const allInstallments = [
    ...dueInstallments.map(i => ({ ...i, isRetry: false })),
    ...retryInstallments.map(i => ({ ...i, isRetry: true })),
  ];

  // 4. Process each installment
  for (const installment of allInstallments) {
    result.processedInstallments++;

    try {
      const processResult = await processInstallmentPayment(
        installment,
        installment.isRetry,
        jobConfig
      );

      if (processResult.success) {
        result.successfulPayments++;
        if (installment.isRetry) {
          result.retriedPayments++;
        }

        // Check if plan is now complete
        const planComplete = await checkAndCompletePlan(installment.paymentPlanId);
        if (planComplete) {
          result.completedPlans++;
        }
      } else {
        result.failedPayments++;
        result.errors.push({
          installmentId: installment.id,
          error: processResult.error || 'Unknown error',
        });

        // Alert staff if configured and this is a final failure
        if (processResult.shouldAlert && jobConfig.alertStaffOnFailure) {
          await alertStaffOnFailure(installment, processResult.error, jobConfig.staffAlertEmail);
        }
      }
    } catch (error) {
      result.failedPayments++;
      result.errors.push({
        installmentId: installment.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return result;
}

// ============================================
// Installment Processing
// ============================================

/**
 * Get all installments that are due for payment
 */
async function getDueInstallments(asOf: Date) {
  return prisma.paymentPlanInstallment.findMany({
    where: {
      status: InstallmentStatus.SCHEDULED,
      dueDate: { lte: asOf },
      paymentPlan: {
        status: PaymentPlanStatus.ACTIVE,
      },
    },
    include: {
      paymentPlan: {
        include: {
          patient: {
            include: {
              demographics: true,
              contacts: { where: { isPrimary: true }, take: 1 },
              storedPaymentMethods: {
                where: { isActive: true, isDefault: true },
                take: 1,
              },
            },
          },
          organization: true,
        },
      },
    },
    orderBy: { dueDate: 'asc' },
  });
}

/**
 * Get failed installments that are ready for retry
 */
async function getRetryReadyInstallments(asOf: Date, maxAttempts: number) {
  return prisma.paymentPlanInstallment.findMany({
    where: {
      status: InstallmentStatus.FAILED,
      attemptCount: { lt: maxAttempts },
      nextRetryAt: { lte: asOf },
      paymentPlan: {
        status: PaymentPlanStatus.ACTIVE,
      },
    },
    include: {
      paymentPlan: {
        include: {
          patient: {
            include: {
              demographics: true,
              contacts: { where: { isPrimary: true }, take: 1 },
              storedPaymentMethods: {
                where: { isActive: true, isDefault: true },
                take: 1,
              },
            },
          },
          organization: true,
        },
      },
    },
    orderBy: { nextRetryAt: 'asc' },
  });
}

/**
 * Process a single installment payment
 */
async function processInstallmentPayment(
  installment: Awaited<ReturnType<typeof getDueInstallments>>[0],
  isRetry: boolean,
  config: BillingJobConfig
): Promise<InstallmentProcessResult> {
  const { paymentPlan } = installment;
  const { patient } = paymentPlan;
  const paymentMethod = patient.storedPaymentMethods[0];

  // Check if patient has a valid payment method
  if (!paymentMethod) {
    // Mark as failed but don't retry - needs manual intervention
    await prisma.paymentPlanInstallment.update({
      where: { id: installment.id },
      data: {
        status: InstallmentStatus.FAILED,
        attemptCount: installment.attemptCount + 1,
        lastAttemptAt: new Date(),
        // No retry - needs payment method
      },
    });

    return {
      success: false,
      error: 'No active payment method on file',
      isRetry,
      shouldAlert: true,
    };
  }

  // Set installment to pending before attempting charge
  await prisma.paymentPlanInstallment.update({
    where: { id: installment.id },
    data: { status: InstallmentStatus.PENDING },
  });

  try {
    // Process payment through provider
    const provider = await getPaymentProvider();
    const amount = Number(installment.amount);

    const result = await provider.processPayment({
      amount: toCents(amount),
      currency: 'USD',
      paymentToken: paymentMethod.paymentToken,
      description: `Payment Plan: ${paymentPlan.name} - Installment ${installment.installmentNumber}`,
    });

    if (result.success) {
      // Create transaction record
      const transaction = await prisma.paymentTransaction.create({
        data: {
          patientId: patient.id,
          organizationId: paymentPlan.organizationId,
          paymentMethodId: paymentMethod.id,
          installmentId: installment.id,
          amount,
          currency: 'USD',
          status: PaymentTransactionStatus.COMPLETED,
          externalTransactionId: result.transactionId,
          processorResponse: result.rawResponse as object,
          processedAt: new Date(),
        },
      });

      // Update installment as paid
      await prisma.paymentPlanInstallment.update({
        where: { id: installment.id },
        data: {
          status: InstallmentStatus.PAID,
          paidAt: new Date(),
          paidAmount: amount,
          attemptCount: installment.attemptCount + 1,
          lastAttemptAt: new Date(),
        },
      });

      // Update plan progress
      await updatePlanProgress(paymentPlan.id, amount);

      // Send payment confirmation
      await sendPaymentConfirmation(installment, transaction.id, amount);

      // Audit log
      await auditLog(BILLING_AUDIT_ACTION, 'PaymentPlanInstallment', {
        entityId: installment.id,
        changes: {
          action: 'auto_payment_success',
          installmentNumber: installment.installmentNumber,
          amount,
          transactionId: transaction.id,
          isRetry,
        },
        userId: SYSTEM_USER_ID,
        organizationId: paymentPlan.organizationId,
      });

      return {
        success: true,
        transactionId: transaction.id,
        isRetry,
        shouldAlert: false,
      };
    } else {
      // Payment failed - construct failure result
      return await handlePaymentFailure(
        installment,
        {
          success: false as const,
          status: result.status,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
        },
        config,
        isRetry
      );
    }
  } catch (error) {
    // Unexpected error
    return await handlePaymentFailure(
      installment,
      {
        success: false,
        status: PaymentTransactionStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      },
      config,
      isRetry
    );
  }
}

/**
 * Handle payment failure - update installment and schedule retry
 */
async function handlePaymentFailure(
  installment: Awaited<ReturnType<typeof getDueInstallments>>[0],
  result: { success: false; status?: PaymentTransactionStatus; errorCode?: string; errorMessage?: string },
  config: BillingJobConfig,
  isRetry: boolean
): Promise<InstallmentProcessResult> {
  const newAttemptCount = installment.attemptCount + 1;
  const hasMoreRetries = newAttemptCount < config.maxRetryAttempts;

  // Calculate next retry date
  const nextRetryAt = hasMoreRetries
    ? new Date(Date.now() + config.retryIntervalDays * 24 * 60 * 60 * 1000)
    : null;

  // Update installment
  await prisma.paymentPlanInstallment.update({
    where: { id: installment.id },
    data: {
      status: InstallmentStatus.FAILED,
      attemptCount: newAttemptCount,
      lastAttemptAt: new Date(),
      nextRetryAt,
    },
  });

  // Create failed transaction record for audit trail
  await prisma.paymentTransaction.create({
    data: {
      patientId: installment.paymentPlan.patient.id,
      organizationId: installment.paymentPlan.organizationId,
      paymentMethodId: installment.paymentPlan.patient.storedPaymentMethods[0]?.id,
      installmentId: installment.id,
      amount: Number(installment.amount),
      currency: 'USD',
      status: PaymentTransactionStatus.FAILED,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    },
  });

  // Audit log
  await auditLog(BILLING_AUDIT_ACTION, 'PaymentPlanInstallment', {
    entityId: installment.id,
    userId: SYSTEM_USER_ID,
    changes: {
      action: 'auto_payment_failed',
      installmentNumber: installment.installmentNumber,
      amount: Number(installment.amount),
      attemptCount: newAttemptCount,
      errorMessage: result.errorMessage,
      hasMoreRetries,
      nextRetryAt,
      isRetry,
    },
    organizationId: installment.paymentPlan.organizationId,
  });

  // Send failure notification to patient if no more retries
  if (!hasMoreRetries) {
    await sendPaymentFailureNotification(installment, result.errorMessage);
  }

  return {
    success: false,
    error: result.errorMessage || 'Payment failed',
    isRetry,
    shouldAlert: !hasMoreRetries, // Alert staff only on final failure
  };
}

// ============================================
// Plan Completion
// ============================================

/**
 * Check if a plan is complete and update its status
 */
async function checkAndCompletePlan(planId: string): Promise<boolean> {
  // Get all installments for the plan
  const plan = await prisma.paymentPlan.findUnique({
    where: { id: planId },
    include: {
      installments: true,
      patient: {
        include: {
          demographics: true,
          contacts: { where: { isPrimary: true }, take: 1 },
        },
      },
      organization: true,
    },
  });

  if (!plan) return false;

  // Check if all installments are paid or skipped
  const remainingInstallments = plan.installments.filter(
    (i) => i.status === InstallmentStatus.SCHEDULED || i.status === InstallmentStatus.PENDING
  );

  if (remainingInstallments.length === 0) {
    // All installments processed - complete the plan
    await prisma.paymentPlan.update({
      where: { id: planId },
      data: {
        status: PaymentPlanStatus.COMPLETED,
        endDate: new Date(),
        amountRemaining: 0,
      },
    });

    // Send plan completion notification
    await sendPlanCompletionNotification(plan);

    // Audit log
    await auditLog(BILLING_AUDIT_ACTION, 'PaymentPlan', {
      entityId: planId,
      userId: SYSTEM_USER_ID,
      changes: {
        action: 'plan_completed',
        totalPaid: Number(plan.amountPaid),
      },
      organizationId: plan.organizationId,
    });

    return true;
  }

  return false;
}

/**
 * Update plan progress after a successful payment
 */
async function updatePlanProgress(planId: string, paidAmount: number): Promise<void> {
  const plan = await prisma.paymentPlan.findUnique({
    where: { id: planId },
    include: {
      installments: {
        where: { status: InstallmentStatus.SCHEDULED },
        orderBy: { dueDate: 'asc' },
        take: 1,
      },
    },
  });

  if (!plan) return;

  const newAmountPaid = Number(plan.amountPaid) + paidAmount;
  const newAmountRemaining = Math.max(0, Number(plan.totalAmount) - newAmountPaid);
  const nextInstallment = plan.installments[0];

  await prisma.paymentPlan.update({
    where: { id: planId },
    data: {
      amountPaid: newAmountPaid,
      amountRemaining: newAmountRemaining,
      installmentsPaid: plan.installmentsPaid + 1,
      nextDueDate: nextInstallment?.dueDate ?? null,
    },
  });
}

// ============================================
// Notifications
// ============================================

/**
 * Send payment reminders for upcoming installments
 */
async function sendPaymentReminders(daysBeforeDue: number): Promise<number> {
  const reminderDate = new Date();
  reminderDate.setDate(reminderDate.getDate() + daysBeforeDue);

  // Set to end of day
  reminderDate.setHours(23, 59, 59, 999);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get installments due in the reminder window that haven't been reminded
  const upcomingInstallments = await prisma.paymentPlanInstallment.findMany({
    where: {
      status: InstallmentStatus.SCHEDULED,
      dueDate: {
        gte: today,
        lte: reminderDate,
      },
      paymentPlan: {
        status: PaymentPlanStatus.ACTIVE,
      },
      // Only get ones we haven't reminded yet today
      OR: [
        { lastAttemptAt: null },
        { lastAttemptAt: { lt: today } },
      ],
    },
    include: {
      paymentPlan: {
        include: {
          patient: {
            include: {
              demographics: true,
              contacts: { where: { isPrimary: true }, take: 1 },
            },
          },
          organization: true,
        },
      },
    },
  });

  let remindersSent = 0;

  for (const installment of upcomingInstallments) {
    const sent = await sendPaymentReminderNotification(installment);
    if (sent) remindersSent++;
  }

  return remindersSent;
}

/**
 * Send a payment reminder notification
 */
async function sendPaymentReminderNotification(
  installment: Awaited<ReturnType<typeof getDueInstallments>>[0]
): Promise<boolean> {
  const { paymentPlan } = installment;
  const { patient, organization } = paymentPlan;
  const contact = patient.contacts[0];

  if (!contact?.email || !contact.allowEmail) {
    return false;
  }

  const patientName = patient.demographics
    ? `${patient.demographics.firstName} ${patient.demographics.lastName}`
    : 'Valued Patient';
  const orgName = organization.name;
  const amount = formatCurrency(toCents(Number(installment.amount)));
  const dueDate = installment.dueDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  try {
    await notificationService.sendEmail(
      contact.email,
      `Payment Reminder - ${paymentPlan.name}`,
      `Dear ${patientName},

This is a friendly reminder that your upcoming payment is due soon.

Payment Details
---------------
Plan: ${paymentPlan.name}
Installment: ${installment.installmentNumber} of ${paymentPlan.numberOfInstallments}
Amount: ${amount}
Due Date: ${dueDate}

Your payment will be automatically processed on the due date using your payment method on file.

If you need to update your payment method or have any questions, please contact our office.

Thank you for choosing ${orgName}.

This is an automated reminder. Please do not reply to this email.`,
      {
        html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #053e67; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
    .reminder-box { background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e0e0e0; }
    .amount { font-size: 32px; font-weight: bold; color: #053e67; }
    .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
    .detail-label { color: #666; }
    .detail-value { font-weight: 500; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
    .reminder-icon { font-size: 48px; margin-bottom: 10px; }
    .warning-box { background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 15px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="reminder-icon">🔔</div>
      <h1 style="margin: 0;">Payment Reminder</h1>
    </div>
    <div class="content">
      <p>Dear ${patientName},</p>
      <p>This is a friendly reminder that your upcoming payment is due soon.</p>

      <div class="reminder-box">
        <div style="text-align: center; margin-bottom: 20px;">
          <div class="amount">${amount}</div>
          <div style="color: #666;">Due: ${dueDate}</div>
        </div>

        <div class="detail-row">
          <span class="detail-label">Plan</span>
          <span class="detail-value">${paymentPlan.name}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Installment</span>
          <span class="detail-value">${installment.installmentNumber} of ${paymentPlan.numberOfInstallments}</span>
        </div>
      </div>

      <div class="warning-box">
        <p style="margin: 0;"><strong>Automatic Payment:</strong> Your payment will be automatically processed on the due date using your payment method on file.</p>
      </div>

      <p style="margin-top: 20px;">If you need to update your payment method or have any questions, please contact our office.</p>
      <p>Thank you for choosing ${orgName}.</p>
    </div>
    <div class="footer">
      <p>This is an automated reminder. Please do not reply to this email.</p>
      <p>${orgName}</p>
    </div>
  </div>
</body>
</html>
        `,
      }
    );

    return true;
  } catch (error) {
    console.error('Failed to send payment reminder:', error);
    return false;
  }
}

/**
 * Send payment confirmation after successful payment
 */
async function sendPaymentConfirmation(
  installment: Awaited<ReturnType<typeof getDueInstallments>>[0],
  transactionId: string,
  amount: number
): Promise<void> {
  const { paymentPlan } = installment;
  const { patient, organization } = paymentPlan;
  const contact = patient.contacts[0];
  const paymentMethod = patient.storedPaymentMethods[0];

  if (!contact?.email || !contact.allowEmail) {
    return;
  }

  const patientName = patient.demographics
    ? `${patient.demographics.firstName} ${patient.demographics.lastName}`
    : 'Valued Patient';
  const orgName = organization.name;
  const formattedAmount = formatCurrency(toCents(amount));
  const cardDisplay = paymentMethod
    ? `${getCardBrandDisplayName(paymentMethod.cardBrand)} ${maskCardNumber(paymentMethod.last4)}`
    : 'Payment method on file';
  const paymentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Calculate remaining
  const remainingInstallments = paymentPlan.numberOfInstallments - installment.installmentNumber;
  const remainingAmount = formatCurrency(toCents(Number(paymentPlan.amountRemaining) - amount));

  try {
    await notificationService.sendEmail(
      contact.email,
      `Payment Confirmation - ${formattedAmount}`,
      `Dear ${patientName},

Your payment plan payment has been successfully processed.

Payment Details
---------------
Date: ${paymentDate}
Amount: ${formattedAmount}
Payment Method: ${cardDisplay}
Reference: ${transactionId}

Plan Progress
-------------
Plan: ${paymentPlan.name}
Installment: ${installment.installmentNumber} of ${paymentPlan.numberOfInstallments}
Remaining Payments: ${remainingInstallments}
${remainingInstallments > 0 ? `Remaining Balance: ${remainingAmount}` : 'This was your final payment!'}

Thank you for your payment. If you have any questions, please contact our office.

Thank you for choosing ${orgName}.

This is an automated receipt. Please do not reply to this email.`,
      {
        html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #053e67; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
    .receipt-box { background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e0e0e0; }
    .amount { font-size: 32px; font-weight: bold; color: #053e67; }
    .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
    .detail-label { color: #666; }
    .detail-value { font-weight: 500; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
    .success-icon { font-size: 48px; margin-bottom: 10px; }
    .progress-bar { background-color: #e0e0e0; border-radius: 10px; height: 20px; margin: 10px 0; overflow: hidden; }
    .progress-fill { background-color: #28a745; height: 100%; border-radius: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="success-icon">✓</div>
      <h1 style="margin: 0;">Payment Received</h1>
    </div>
    <div class="content">
      <p>Dear ${patientName},</p>
      <p>Your payment plan payment has been successfully processed.</p>

      <div class="receipt-box">
        <div style="text-align: center; margin-bottom: 20px;">
          <div class="amount">${formattedAmount}</div>
          <div style="color: #28a745;">Payment Successful</div>
        </div>

        <div class="detail-row">
          <span class="detail-label">Date</span>
          <span class="detail-value">${paymentDate}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Payment Method</span>
          <span class="detail-value">${cardDisplay}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Reference #</span>
          <span class="detail-value">${transactionId}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Plan</span>
          <span class="detail-value">${paymentPlan.name}</span>
        </div>

        <div style="margin-top: 20px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
            <span>Progress: ${installment.installmentNumber} of ${paymentPlan.numberOfInstallments}</span>
            <span>${Math.round((installment.installmentNumber / paymentPlan.numberOfInstallments) * 100)}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${Math.round((installment.installmentNumber / paymentPlan.numberOfInstallments) * 100)}%"></div>
          </div>
        </div>

        ${remainingInstallments > 0 ? `
        <div class="detail-row" style="margin-top: 10px;">
          <span class="detail-label">Remaining Balance</span>
          <span class="detail-value">${remainingAmount}</span>
        </div>
        ` : `
        <div style="text-align: center; margin-top: 20px; padding: 15px; background-color: #d4edda; border-radius: 8px;">
          <strong style="color: #155724;">🎉 Congratulations! This was your final payment.</strong>
        </div>
        `}
      </div>

      <p>If you have any questions about your payment, please contact our office.</p>
      <p>Thank you for choosing ${orgName}.</p>
    </div>
    <div class="footer">
      <p>This is an automated receipt. Please do not reply to this email.</p>
      <p>${orgName}</p>
    </div>
  </div>
</body>
</html>
        `,
      }
    );
  } catch (error) {
    console.error('Failed to send payment confirmation:', error);
    // Don't throw - confirmation email failure shouldn't fail the payment
  }
}

/**
 * Send payment failure notification to patient
 */
async function sendPaymentFailureNotification(
  installment: Awaited<ReturnType<typeof getDueInstallments>>[0],
  errorMessage?: string
): Promise<void> {
  const { paymentPlan } = installment;
  const { patient, organization } = paymentPlan;
  const contact = patient.contacts[0];

  if (!contact?.email || !contact.allowEmail) {
    return;
  }

  const patientName = patient.demographics
    ? `${patient.demographics.firstName} ${patient.demographics.lastName}`
    : 'Valued Patient';
  const orgName = organization.name;
  const amount = formatCurrency(toCents(Number(installment.amount)));

  try {
    await notificationService.sendEmail(
      contact.email,
      `Action Required: Payment Failed - ${paymentPlan.name}`,
      `Dear ${patientName},

We were unable to process your scheduled payment.

Payment Details
---------------
Plan: ${paymentPlan.name}
Amount: ${amount}
Installment: ${installment.installmentNumber} of ${paymentPlan.numberOfInstallments}

Please contact our office to update your payment method or make a payment. Failure to resolve this may result in your payment plan being placed on hold.

If you have any questions, please contact us immediately.

Thank you for choosing ${orgName}.`,
      {
        html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #c90000; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
    .alert-box { background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #c90000; }
    .amount { font-size: 32px; font-weight: bold; color: #c90000; }
    .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
    .detail-label { color: #666; }
    .detail-value { font-weight: 500; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
    .error-icon { font-size: 48px; margin-bottom: 10px; }
    .action-box { background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 15px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="error-icon">⚠️</div>
      <h1 style="margin: 0;">Payment Failed</h1>
    </div>
    <div class="content">
      <p>Dear ${patientName},</p>
      <p>We were unable to process your scheduled payment for your payment plan.</p>

      <div class="alert-box">
        <div style="text-align: center; margin-bottom: 20px;">
          <div class="amount">${amount}</div>
          <div style="color: #c90000;">Payment Declined</div>
        </div>

        <div class="detail-row">
          <span class="detail-label">Plan</span>
          <span class="detail-value">${paymentPlan.name}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Installment</span>
          <span class="detail-value">${installment.installmentNumber} of ${paymentPlan.numberOfInstallments}</span>
        </div>
      </div>

      <div class="action-box">
        <p style="margin: 0;"><strong>Action Required:</strong> Please contact our office to update your payment method or make a payment. Failure to resolve this may result in your payment plan being placed on hold.</p>
      </div>

      <p style="margin-top: 20px;">If you have any questions, please contact us immediately.</p>
      <p>Thank you for choosing ${orgName}.</p>
    </div>
    <div class="footer">
      <p>${orgName}</p>
    </div>
  </div>
</body>
</html>
        `,
      }
    );
  } catch (error) {
    console.error('Failed to send payment failure notification:', error);
  }
}

/**
 * Send plan completion notification
 */
async function sendPlanCompletionNotification(
  plan: NonNullable<Awaited<ReturnType<typeof prisma.paymentPlan.findUnique>>>
): Promise<void> {
  const patient = (plan as { patient?: { demographics?: { firstName: string; lastName: string }; contacts?: { email?: string; allowEmail?: boolean }[] } }).patient;
  const organization = (plan as { organization?: { name: string } }).organization;
  const contact = patient?.contacts?.[0];

  if (!contact?.email || !contact.allowEmail) {
    return;
  }

  const patientName = patient?.demographics
    ? `${patient.demographics.firstName} ${patient.demographics.lastName}`
    : 'Valued Patient';
  const orgName = organization?.name ?? 'Our Practice';
  const totalPaid = formatCurrency(toCents(Number(plan.totalAmount)));

  try {
    await notificationService.sendEmail(
      contact.email,
      `🎉 Payment Plan Completed - ${plan.name}`,
      `Dear ${patientName},

Congratulations! You have successfully completed your payment plan.

Plan Summary
------------
Plan: ${plan.name}
Total Paid: ${totalPaid}
Installments: ${plan.numberOfInstallments}
Completed: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

Thank you for your commitment to completing your payment plan. Your account balance is now clear.

If you have any questions, please contact our office.

Thank you for choosing ${orgName}.`,
      {
        html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #053e67 0%, #0a5c9a 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
    .celebration-box { background-color: white; padding: 30px; border-radius: 8px; margin: 20px 0; border: 2px solid #28a745; text-align: center; }
    .total { font-size: 36px; font-weight: bold; color: #28a745; }
    .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
    .detail-label { color: #666; }
    .detail-value { font-weight: 500; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
    .celebration-icon { font-size: 64px; margin-bottom: 10px; }
    .checkmark { color: #28a745; font-size: 72px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="celebration-icon">🎉</div>
      <h1 style="margin: 0;">Congratulations!</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">Payment Plan Completed</p>
    </div>
    <div class="content">
      <p>Dear ${patientName},</p>

      <div class="celebration-box">
        <div class="checkmark">✓</div>
        <h2 style="color: #28a745; margin: 10px 0;">Plan Complete!</h2>
        <div class="total">${totalPaid}</div>
        <p style="color: #666; margin-top: 10px;">Total Paid</p>
      </div>

      <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <div class="detail-row">
          <span class="detail-label">Plan</span>
          <span class="detail-value">${plan.name}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Installments Completed</span>
          <span class="detail-value">${plan.numberOfInstallments} of ${plan.numberOfInstallments}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Completion Date</span>
          <span class="detail-value">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
      </div>

      <p>Thank you for your commitment to completing your payment plan. Your account balance is now clear.</p>
      <p>If you have any questions, please contact our office.</p>
      <p>Thank you for choosing ${orgName}.</p>
    </div>
    <div class="footer">
      <p>${orgName}</p>
    </div>
  </div>
</body>
</html>
        `,
      }
    );
  } catch (error) {
    console.error('Failed to send plan completion notification:', error);
  }
}

/**
 * Alert staff about failed payment requiring attention
 */
async function alertStaffOnFailure(
  installment: Awaited<ReturnType<typeof getDueInstallments>>[0],
  error: string | undefined,
  staffEmail?: string
): Promise<void> {
  // Get organization billing email or use provided staff email
  const { paymentPlan } = installment;
  const { patient, organization } = paymentPlan;

  // Check organization settings for billing email
  const orgSettings = organization.settings as { billingEmail?: string; contactEmail?: string } | null;
  const alertEmail = staffEmail || orgSettings?.billingEmail || orgSettings?.contactEmail;

  if (!alertEmail) {
    console.warn('No staff email configured for failure alerts');
    return;
  }

  const patientName = patient.demographics
    ? `${patient.demographics.firstName} ${patient.demographics.lastName}`
    : 'Unknown Patient';
  const amount = formatCurrency(toCents(Number(installment.amount)));

  try {
    await notificationService.sendEmail(
      alertEmail,
      `⚠️ Payment Plan Failure Alert - ${patientName}`,
      `A payment plan payment has failed after all retry attempts.

Patient: ${patientName}
Patient ID: ${patient.id}
Plan: ${paymentPlan.name}
Plan ID: ${paymentPlan.id}
Installment: ${installment.installmentNumber} of ${paymentPlan.numberOfInstallments}
Amount: ${amount}
Error: ${error || 'Unknown'}
Attempts: ${installment.attemptCount}

Action Required: Please contact the patient to resolve this payment issue.

This is an automated alert from the payment plan billing system.`,
      {
        html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #c90000; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
    .alert-box { background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #c90000; }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
    .detail-label { color: #666; font-weight: 500; }
    .detail-value { }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
    .action-required { background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 15px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">⚠️ Payment Failure Alert</h1>
    </div>
    <div class="content">
      <p>A payment plan payment has failed after all retry attempts and requires manual intervention.</p>

      <div class="alert-box">
        <h3 style="margin-top: 0; color: #c90000;">Payment Details</h3>
        <div class="detail-row">
          <span class="detail-label">Patient</span>
          <span class="detail-value">${patientName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Patient ID</span>
          <span class="detail-value"><code>${patient.id}</code></span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Plan</span>
          <span class="detail-value">${paymentPlan.name}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Installment</span>
          <span class="detail-value">${installment.installmentNumber} of ${paymentPlan.numberOfInstallments}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Amount</span>
          <span class="detail-value"><strong>${amount}</strong></span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Error</span>
          <span class="detail-value" style="color: #c90000;">${error || 'Unknown'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Attempts</span>
          <span class="detail-value">${installment.attemptCount}</span>
        </div>
      </div>

      <div class="action-required">
        <p style="margin: 0;"><strong>Action Required:</strong> Please contact the patient to resolve this payment issue. The patient has been notified of the failure.</p>
      </div>
    </div>
    <div class="footer">
      <p>This is an automated alert from the payment plan billing system.</p>
    </div>
  </div>
</body>
</html>
        `,
      }
    );
  } catch (error) {
    console.error('Failed to send staff failure alert:', error);
  }
}

// ============================================
// API Endpoint Handler
// ============================================

/**
 * Get billing job configuration for an organization
 */
export async function getBillingConfig(organizationId: string): Promise<BillingJobConfig | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      settings: true,
    },
  });

  if (!org) return null;

  const settings = org.settings as {
    paymentPlanBilling?: Partial<BillingJobConfig>;
    billingEmail?: string;
    contactEmail?: string;
  } | null;
  const billingSettings = settings?.paymentPlanBilling || {};

  return {
    ...DEFAULT_CONFIG,
    ...billingSettings,
    staffAlertEmail: settings?.billingEmail || settings?.contactEmail || undefined,
  };
}

/**
 * Update billing job configuration for an organization
 */
export async function updateBillingConfig(
  organizationId: string,
  config: Partial<BillingJobConfig>
): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  const currentSettings = (org?.settings as Record<string, unknown>) || {};

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      settings: {
        ...currentSettings,
        paymentPlanBilling: {
          ...(currentSettings.paymentPlanBilling as Record<string, unknown> || {}),
          ...config,
        },
      },
    },
  });
}
