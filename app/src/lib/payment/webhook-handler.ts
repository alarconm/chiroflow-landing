/**
 * Payment Webhook Handler
 * Epic 10: Payment Processing - US-091
 *
 * Handles webhooks from payment processors (Stripe, Square) for real-time updates.
 * Implements idempotent processing to handle duplicate webhook deliveries.
 */

import { prisma } from '@/lib/prisma';
import {
  PaymentTransactionStatus,
  PaymentProcessorType,
  WebhookProcessingStatus,
  type Prisma,
} from '@prisma/client';
import { getPaymentProvider } from './index';
import { notificationService } from '@/lib/notification-service';
import type {
  WebhookHandlerResult,
  WebhookAction,
  DisputeInfo,
  WebhookEventType,
} from './types';

/**
 * Main webhook handler entry point
 * Verifies signature, checks idempotency, and processes event
 */
export async function handlePaymentWebhook(
  payload: string | Buffer,
  signature: string,
  processorType: PaymentProcessorType = 'STRIPE'
): Promise<WebhookHandlerResult> {
  const startTime = Date.now();

  // 1. Verify webhook signature
  const provider = await getPaymentProvider(processorType === 'STRIPE' ? 'stripe' : 'mock');
  const verification = await provider.verifyWebhook(payload, signature);

  if (!verification.valid || !verification.event) {
    console.error('[WebhookHandler] Signature verification failed:', verification.errorMessage);
    return {
      success: false,
      eventId: 'unknown',
      eventType: 'unknown',
      processed: false,
      error: verification.errorMessage || 'Webhook signature verification failed',
    };
  }

  const event = verification.event;

  // 2. Check idempotency - has this event already been processed?
  const existingEvent = await prisma.processedWebhookEvent.findUnique({
    where: {
      eventId_processorType: {
        eventId: event.id,
        processorType,
      },
    },
  });

  if (existingEvent) {
    if (existingEvent.status === WebhookProcessingStatus.COMPLETED) {
      console.log(`[WebhookHandler] Event ${event.id} already processed, skipping`);
      return {
        success: true,
        eventId: event.id,
        eventType: event.type,
        processed: false,
        skipped: true,
      };
    }
    // If still processing or failed, we might want to retry
    if (existingEvent.status === WebhookProcessingStatus.PROCESSING) {
      console.log(`[WebhookHandler] Event ${event.id} is currently being processed`);
      return {
        success: true,
        eventId: event.id,
        eventType: event.type,
        processed: false,
        skipped: true,
      };
    }
  }

  // 3. Create or update webhook event record
  const webhookEvent = await prisma.processedWebhookEvent.upsert({
    where: {
      eventId_processorType: {
        eventId: event.id,
        processorType,
      },
    },
    create: {
      eventId: event.id,
      eventType: event.type,
      processorType,
      status: WebhookProcessingStatus.PROCESSING,
      rawPayload: event.data as Prisma.InputJsonValue,
      receivedAt: new Date(),
    },
    update: {
      status: WebhookProcessingStatus.PROCESSING,
      retryCount: { increment: 1 },
    },
  });

  // 4. Process the event based on type
  try {
    const actions: WebhookAction[] = [];
    let transactionId: string | undefined;

    // Map event types and process
    const eventTypeStr = event.type as string;

    if (eventTypeStr === 'payment.succeeded' || eventTypeStr === 'payment_intent.succeeded') {
      ({ transactionId } = await handlePaymentSucceeded(event.data, actions));
    } else if (eventTypeStr === 'payment.failed' || eventTypeStr === 'payment_intent.payment_failed') {
      ({ transactionId } = await handlePaymentFailed(event.data, actions));
    } else if (eventTypeStr === 'payment.refunded' || eventTypeStr === 'charge.refunded') {
      ({ transactionId } = await handleRefund(event.data, actions));
    } else if (eventTypeStr === 'payment_method.attached' || eventTypeStr === 'payment_method.detached') {
      await handlePaymentMethodChange(eventTypeStr as WebhookEventType, event.data, actions);
    } else if (eventTypeStr === 'customer.created' || eventTypeStr === 'customer.deleted') {
      // Log but no action needed typically
      console.log(`[WebhookHandler] Customer event: ${eventTypeStr}`);
    } else if (eventTypeStr.startsWith('charge.dispute')) {
      await handleDispute(eventTypeStr, event.data, actions);
    } else {
      console.log(`[WebhookHandler] Unhandled event type: ${eventTypeStr}`);
    }

    // 5. Mark as completed
    await prisma.processedWebhookEvent.update({
      where: { id: webhookEvent.id },
      data: {
        status: WebhookProcessingStatus.COMPLETED,
        processedAt: new Date(),
        actions: actions as unknown as Prisma.InputJsonValue,
        transactionId,
      },
    });

    const duration = Date.now() - startTime;
    console.log(`[WebhookHandler] Processed ${event.type} (${event.id}) in ${duration}ms`);

    return {
      success: true,
      eventId: event.id,
      eventType: event.type,
      processed: true,
      actions,
    };
  } catch (error) {
    // 6. Mark as failed
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await prisma.processedWebhookEvent.update({
      where: { id: webhookEvent.id },
      data: {
        status: WebhookProcessingStatus.FAILED,
        lastError: errorMessage,
      },
    });

    console.error(`[WebhookHandler] Failed to process ${event.type}:`, error);

    return {
      success: false,
      eventId: event.id,
      eventType: event.type,
      processed: false,
      error: errorMessage,
    };
  }
}

/**
 * Handle payment.succeeded event
 * Updates transaction status and triggers confirmation workflows
 */
async function handlePaymentSucceeded(
  data: Record<string, unknown>,
  actions: WebhookAction[]
): Promise<{ transactionId?: string }> {
  const paymentIntent = data as {
    id?: string;
    amount?: number;
    currency?: string;
    metadata?: Record<string, string>;
  };

  if (!paymentIntent.id) {
    console.warn('[WebhookHandler] payment.succeeded missing payment intent ID');
    return {};
  }

  // Find the transaction by external ID
  const transaction = await prisma.paymentTransaction.findFirst({
    where: { externalTransactionId: paymentIntent.id },
    include: {
      patient: {
        include: {
          demographics: true,
          contacts: { where: { isPrimary: true } },
        },
      },
      organization: true,
    },
  });

  if (!transaction) {
    console.log(`[WebhookHandler] No transaction found for payment intent: ${paymentIntent.id}`);
    return {};
  }

  // Only update if not already completed
  if (transaction.status === PaymentTransactionStatus.COMPLETED) {
    console.log(`[WebhookHandler] Transaction ${transaction.id} already completed`);
    return { transactionId: transaction.id };
  }

  // Update transaction status
  await prisma.paymentTransaction.update({
    where: { id: transaction.id },
    data: {
      status: PaymentTransactionStatus.COMPLETED,
      processedAt: new Date(),
      processorResponse: data as Prisma.InputJsonValue,
    },
  });

  actions.push({
    type: 'transaction_updated',
    entityId: transaction.id,
    entityType: 'PaymentTransaction',
    details: { newStatus: 'COMPLETED' },
  });

  // Get patient name from demographics
  const patientName = transaction.patient.demographics
    ? `${transaction.patient.demographics.firstName} ${transaction.patient.demographics.lastName}`
    : 'Valued Patient';

  // Send confirmation email if patient has email
  const patientContact = transaction.patient.contacts?.[0];
  const patientEmail = patientContact?.email && patientContact.allowEmail
    ? patientContact.email
    : null;

  if (patientEmail) {
    try {
      await notificationService.sendEmail(
        patientEmail,
        `Payment Confirmation - ${transaction.organization.name}`,
        `Your payment of $${(Number(transaction.amount) / 100).toFixed(2)} has been confirmed.`,
        {
          html: generatePaymentConfirmationEmail({
            patientName,
            amount: Number(transaction.amount),
            organizationName: transaction.organization.name,
            transactionId: transaction.externalTransactionId || transaction.id,
            date: new Date(),
          }),
        }
      );

      actions.push({
        type: 'email_sent',
        details: { recipient: patientEmail, type: 'payment_confirmation' },
      });
    } catch (emailError) {
      console.error('[WebhookHandler] Failed to send confirmation email:', emailError);
    }
  }

  // Log webhook processing (no user context available)
  console.log(`[WebhookHandler] Payment succeeded for transaction ${transaction.id}`, {
    amount: transaction.amount,
    externalId: paymentIntent.id,
    organizationId: transaction.organizationId,
  });

  return { transactionId: transaction.id };
}

/**
 * Handle payment.failed event
 * Updates transaction status and alerts staff
 */
async function handlePaymentFailed(
  data: Record<string, unknown>,
  actions: WebhookAction[]
): Promise<{ transactionId?: string }> {
  const paymentIntent = data as {
    id?: string;
    last_payment_error?: {
      code?: string;
      message?: string;
      decline_code?: string;
    };
  };

  if (!paymentIntent.id) {
    console.warn('[WebhookHandler] payment.failed missing payment intent ID');
    return {};
  }

  // Find the transaction
  const transaction = await prisma.paymentTransaction.findFirst({
    where: { externalTransactionId: paymentIntent.id },
    include: {
      patient: {
        include: { demographics: true },
      },
      organization: true,
      installment: {
        include: { paymentPlan: true },
      },
    },
  });

  if (!transaction) {
    console.log(`[WebhookHandler] No transaction found for failed payment: ${paymentIntent.id}`);
    return {};
  }

  // Update transaction with failure details
  await prisma.paymentTransaction.update({
    where: { id: transaction.id },
    data: {
      status: PaymentTransactionStatus.FAILED,
      errorCode: paymentIntent.last_payment_error?.code,
      errorMessage: paymentIntent.last_payment_error?.message,
      declineCode: paymentIntent.last_payment_error?.decline_code,
      processorResponse: data as Prisma.InputJsonValue,
    },
  });

  actions.push({
    type: 'transaction_updated',
    entityId: transaction.id,
    entityType: 'PaymentTransaction',
    details: {
      newStatus: 'FAILED',
      errorCode: paymentIntent.last_payment_error?.code,
      declineCode: paymentIntent.last_payment_error?.decline_code,
    },
  });

  // If this was a payment plan installment, update the installment status
  if (transaction.installment) {
    await prisma.paymentPlanInstallment.update({
      where: { id: transaction.installment.id },
      data: {
        status: 'FAILED',
        attemptCount: { increment: 1 },
      },
    });
  }

  // Get patient name
  const patientName = transaction.patient.demographics
    ? `${transaction.patient.demographics.firstName} ${transaction.patient.demographics.lastName}`
    : 'Unknown Patient';

  // Alert staff about the failure
  try {
    const orgSettings = transaction.organization.settings as Record<string, unknown> | null;
    const staffEmail = (orgSettings?.billingAlertEmail as string) ||
      (orgSettings?.primaryEmail as string);

    if (staffEmail) {
      await notificationService.sendEmail(
        staffEmail,
        `Payment Failed - ${patientName}`,
        `Payment of $${(Number(transaction.amount) / 100).toFixed(2)} failed for patient ${patientName}.`,
        {
          html: generatePaymentFailedAlertEmail({
            patientName,
            patientId: transaction.patientId,
            amount: Number(transaction.amount),
            errorMessage: paymentIntent.last_payment_error?.message,
            declineCode: paymentIntent.last_payment_error?.decline_code,
            isPaymentPlan: !!transaction.installment,
            organizationName: transaction.organization.name,
          }),
        }
      );

      actions.push({
        type: 'alert_created',
        details: { recipient: staffEmail, type: 'payment_failed_alert' },
      });
    }
  } catch (emailError) {
    console.error('[WebhookHandler] Failed to send failure alert:', emailError);
  }

  // Log webhook processing
  console.log(`[WebhookHandler] Payment failed for transaction ${transaction.id}`, {
    errorCode: paymentIntent.last_payment_error?.code,
    declineCode: paymentIntent.last_payment_error?.decline_code,
    organizationId: transaction.organizationId,
  });

  return { transactionId: transaction.id };
}

/**
 * Handle refund events (charge.refunded, charge.refund.updated)
 */
async function handleRefund(
  data: Record<string, unknown>,
  actions: WebhookAction[]
): Promise<{ transactionId?: string }> {
  const chargeData = data as {
    id?: string;
    payment_intent?: string;
    amount_refunded?: number;
    refunds?: {
      data?: Array<{
        id: string;
        amount: number;
        status: string;
        reason?: string;
      }>;
    };
  };

  const paymentIntentId = chargeData.payment_intent;
  if (!paymentIntentId) {
    console.warn('[WebhookHandler] refund event missing payment_intent');
    return {};
  }

  // Find the original transaction
  const transaction = await prisma.paymentTransaction.findFirst({
    where: { externalTransactionId: paymentIntentId },
    include: {
      patient: {
        include: {
          demographics: true,
          contacts: { where: { isPrimary: true } },
        },
      },
      organization: true,
    },
  });

  if (!transaction) {
    console.log(`[WebhookHandler] No transaction found for refund: ${paymentIntentId}`);
    return {};
  }

  // Determine if fully or partially refunded
  const originalAmount = Number(transaction.amount) * 100; // Convert to cents
  const refundedAmount = chargeData.amount_refunded || 0;
  const isFullRefund = refundedAmount >= originalAmount;

  // Update transaction status
  await prisma.paymentTransaction.update({
    where: { id: transaction.id },
    data: {
      status: isFullRefund
        ? PaymentTransactionStatus.REFUNDED
        : PaymentTransactionStatus.PARTIALLY_REFUNDED,
      processorResponse: data as Prisma.InputJsonValue,
    },
  });

  actions.push({
    type: 'transaction_updated',
    entityId: transaction.id,
    entityType: 'PaymentTransaction',
    details: {
      newStatus: isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
      refundedAmount: refundedAmount / 100,
    },
  });

  // Get patient name
  const patientName = transaction.patient.demographics
    ? `${transaction.patient.demographics.firstName} ${transaction.patient.demographics.lastName}`
    : 'Valued Patient';

  // Send refund notification to patient
  const patientContact = transaction.patient.contacts?.[0];
  const patientEmail = patientContact?.email && patientContact.allowEmail
    ? patientContact.email
    : null;

  if (patientEmail) {
    try {
      await notificationService.sendEmail(
        patientEmail,
        `Refund Processed - ${transaction.organization.name}`,
        `A refund of $${(refundedAmount / 100).toFixed(2)} has been processed.`,
        {
          html: generateRefundNotificationEmail({
            patientName,
            refundAmount: refundedAmount / 100,
            isFullRefund,
            organizationName: transaction.organization.name,
            date: new Date(),
          }),
        }
      );

      actions.push({
        type: 'email_sent',
        details: { recipient: patientEmail, type: 'refund_notification' },
      });
    } catch (emailError) {
      console.error('[WebhookHandler] Failed to send refund notification:', emailError);
    }
  }

  // Log webhook processing
  console.log(`[WebhookHandler] Refund processed for transaction ${transaction.id}`, {
    refundedAmount: refundedAmount / 100,
    isFullRefund,
    organizationId: transaction.organizationId,
  });

  return { transactionId: transaction.id };
}

/**
 * Handle dispute/chargeback events
 */
async function handleDispute(
  eventType: string,
  data: Record<string, unknown>,
  actions: WebhookAction[]
): Promise<void> {
  const dispute = data as {
    id?: string;
    payment_intent?: string;
    charge?: string;
    amount?: number;
    reason?: string;
    status?: string;
    evidence_details?: {
      due_by?: number;
    };
    created?: number;
  };

  if (!dispute.id) {
    console.warn('[WebhookHandler] dispute event missing dispute ID');
    return;
  }

  const paymentIntentId = dispute.payment_intent;

  // Find the related transaction
  const transaction = paymentIntentId
    ? await prisma.paymentTransaction.findFirst({
        where: { externalTransactionId: paymentIntentId },
        include: {
          patient: { include: { demographics: true } },
          organization: true,
        },
      })
    : null;

  // Prepare dispute info
  const disputeInfo: DisputeInfo = {
    disputeId: dispute.id,
    transactionId: paymentIntentId || '',
    amount: (dispute.amount || 0) / 100,
    reason: dispute.reason || 'unknown',
    status: mapDisputeStatus(dispute.status),
    evidenceDueDate: dispute.evidence_details?.due_by
      ? new Date(dispute.evidence_details.due_by * 1000)
      : undefined,
    createdAt: dispute.created
      ? new Date(dispute.created * 1000)
      : new Date(),
  };

  // Determine action based on event type
  const isNewDispute = eventType === 'charge.dispute.created';
  const isClosed = eventType === 'charge.dispute.closed';

  if (transaction) {
    // Update transaction status if dispute is open
    if (!isClosed && dispute.status !== 'won') {
      const existingResponse = transaction.processorResponse as Record<string, unknown> | null;
      await prisma.paymentTransaction.update({
        where: { id: transaction.id },
        data: {
          processorResponse: {
            ...(existingResponse || {}),
            dispute: {
              disputeId: disputeInfo.disputeId,
              status: disputeInfo.status,
              amount: disputeInfo.amount,
              reason: disputeInfo.reason,
            },
          } as Prisma.InputJsonValue,
        },
      });
    }

    // Get patient name
    const patientName = transaction.patient.demographics
      ? `${transaction.patient.demographics.firstName} ${transaction.patient.demographics.lastName}`
      : 'Unknown Patient';

    // Alert staff about dispute
    const orgSettings = transaction.organization.settings as Record<string, unknown> | null;
    const staffEmail = (orgSettings?.billingAlertEmail as string) ||
      (orgSettings?.primaryEmail as string);

    if (staffEmail) {
      try {
        await notificationService.sendEmail(
          staffEmail,
          isNewDispute
            ? `URGENT: New Chargeback Dispute - $${disputeInfo.amount.toFixed(2)}`
            : `Dispute Update - ${disputeInfo.status}`,
          isNewDispute
            ? `New chargeback dispute of $${disputeInfo.amount.toFixed(2)} requires immediate attention.`
            : `Dispute status updated to: ${disputeInfo.status}`,
          {
            html: generateDisputeAlertEmail({
              disputeInfo,
              patientName,
              organizationName: transaction.organization.name,
              isNew: isNewDispute,
              isClosed,
            }),
          }
        );

        actions.push({
          type: 'alert_created',
          details: {
            recipient: staffEmail,
            type: isNewDispute ? 'dispute_created' : 'dispute_updated',
          },
        });
      } catch (emailError) {
        console.error('[WebhookHandler] Failed to send dispute alert:', emailError);
      }
    }

    // Log webhook processing
    console.log(`[WebhookHandler] Dispute ${isNewDispute ? 'created' : isClosed ? 'closed' : 'updated'} for transaction ${transaction.id}`, {
      disputeId: disputeInfo.disputeId,
      status: disputeInfo.status,
      amount: disputeInfo.amount,
      organizationId: transaction.organizationId,
    });
  }

  actions.push({
    type: 'dispute_created',
    entityId: dispute.id,
    entityType: 'Dispute',
    details: {
      eventType,
      disputeId: disputeInfo.disputeId,
      status: disputeInfo.status,
      amount: disputeInfo.amount,
      reason: disputeInfo.reason,
    },
  });

  console.log(`[WebhookHandler] Processed dispute event: ${eventType}`, {
    disputeId: dispute.id,
    status: dispute.status,
    amount: disputeInfo.amount,
  });
}

/**
 * Handle payment method changes
 */
async function handlePaymentMethodChange(
  eventType: WebhookEventType,
  data: Record<string, unknown>,
  actions: WebhookAction[]
): Promise<void> {
  const paymentMethod = data as {
    id?: string;
    customer?: string;
    card?: {
      last4?: string;
      brand?: string;
    };
  };

  console.log(`[WebhookHandler] Payment method ${eventType}:`, {
    methodId: paymentMethod.id,
    customerId: paymentMethod.customer,
  });

  // We typically don't need to do much here since we manage payment methods
  // through our own API. This is mainly for logging/audit purposes.
  actions.push({
    type: 'transaction_updated',
    entityType: 'PaymentMethod',
    details: {
      eventType,
      methodId: paymentMethod.id,
      customerId: paymentMethod.customer,
    },
  });
}

// ============================================
// Helper Functions
// ============================================

function mapDisputeStatus(
  status?: string
): DisputeInfo['status'] {
  switch (status) {
    case 'warning_needs_response':
      return 'warning_needs_response';
    case 'warning_closed':
      return 'warning_closed';
    case 'needs_response':
      return 'needs_response';
    case 'under_review':
      return 'under_review';
    case 'won':
      return 'won';
    case 'lost':
      return 'lost';
    default:
      return 'needs_response';
  }
}

// ============================================
// Email Templates
// ============================================

function generatePaymentConfirmationEmail(params: {
  patientName: string;
  amount: number;
  organizationName: string;
  transactionId: string;
  date: Date;
}): string {
  const formattedAmount = (params.amount / 100).toFixed(2);
  const formattedDate = params.date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; padding: 20px; background: #053e67; color: white; border-radius: 8px 8px 0 0; }
        .content { padding: 30px; background: #f9f9f9; }
        .amount { font-size: 32px; color: #053e67; font-weight: bold; text-align: center; margin: 20px 0; }
        .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Payment Confirmed</h1>
        </div>
        <div class="content">
          <p>Dear ${params.patientName},</p>
          <p>Your payment has been successfully processed.</p>
          <div class="amount">$${formattedAmount}</div>
          <div class="details">
            <p><strong>Date:</strong> ${formattedDate}</p>
            <p><strong>Reference:</strong> ${params.transactionId}</p>
          </div>
          <p>Thank you for your payment.</p>
        </div>
        <div class="footer">
          <p>${params.organizationName}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

function generatePaymentFailedAlertEmail(params: {
  patientName: string;
  patientId: string;
  amount: number;
  errorMessage?: string;
  declineCode?: string;
  isPaymentPlan: boolean;
  organizationName: string;
}): string {
  const formattedAmount = (params.amount / 100).toFixed(2);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; padding: 20px; background: #c90000; color: white; border-radius: 8px 8px 0 0; }
        .content { padding: 30px; background: #fff5f5; }
        .alert-box { background: white; padding: 20px; border-left: 4px solid #c90000; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Payment Failed</h1>
        </div>
        <div class="content">
          <div class="alert-box">
            <p><strong>Patient:</strong> ${params.patientName}</p>
            <p><strong>Patient ID:</strong> ${params.patientId}</p>
            <p><strong>Amount:</strong> $${formattedAmount}</p>
            ${params.isPaymentPlan ? '<p><strong>Type:</strong> Payment Plan Installment</p>' : ''}
            ${params.errorMessage ? `<p><strong>Error:</strong> ${params.errorMessage}</p>` : ''}
            ${params.declineCode ? `<p><strong>Decline Code:</strong> ${params.declineCode}</p>` : ''}
          </div>
          <p><strong>Action Required:</strong> Please contact the patient to update their payment method or arrange alternative payment.</p>
        </div>
        <div class="footer">
          <p>${params.organizationName} - Billing Alert</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

function generateRefundNotificationEmail(params: {
  patientName: string;
  refundAmount: number;
  isFullRefund: boolean;
  organizationName: string;
  date: Date;
}): string {
  const formattedAmount = params.refundAmount.toFixed(2);
  const formattedDate = params.date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; padding: 20px; background: #053e67; color: white; border-radius: 8px 8px 0 0; }
        .content { padding: 30px; background: #f9f9f9; }
        .amount { font-size: 32px; color: #053e67; font-weight: bold; text-align: center; margin: 20px 0; }
        .notice { background: #e8f4fd; padding: 15px; border-radius: 8px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Refund Processed</h1>
        </div>
        <div class="content">
          <p>Dear ${params.patientName},</p>
          <p>A ${params.isFullRefund ? 'full' : 'partial'} refund has been processed for your account.</p>
          <div class="amount">$${formattedAmount}</div>
          <p><strong>Date:</strong> ${formattedDate}</p>
          <div class="notice">
            <p>Please allow 5-10 business days for the refund to appear on your statement, depending on your financial institution.</p>
          </div>
          <p>If you have any questions, please contact our office.</p>
        </div>
        <div class="footer">
          <p>${params.organizationName}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

function generateDisputeAlertEmail(params: {
  disputeInfo: DisputeInfo;
  patientName: string;
  organizationName: string;
  isNew: boolean;
  isClosed: boolean;
}): string {
  const { disputeInfo } = params;
  const evidenceDue = disputeInfo.evidenceDueDate
    ? disputeInfo.evidenceDueDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'N/A';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; padding: 20px; background: ${params.isNew ? '#c90000' : '#053e67'}; color: white; border-radius: 8px 8px 0 0; }
        .content { padding: 30px; background: ${params.isNew ? '#fff5f5' : '#f9f9f9'}; }
        .alert-box { background: white; padding: 20px; border-left: 4px solid ${params.isNew ? '#c90000' : '#053e67'}; margin: 20px 0; }
        .urgent { color: #c90000; font-weight: bold; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${params.isNew ? 'URGENT: New Dispute' : params.isClosed ? 'Dispute Closed' : 'Dispute Update'}</h1>
        </div>
        <div class="content">
          ${params.isNew ? '<p class="urgent">IMMEDIATE ACTION REQUIRED</p>' : ''}
          <div class="alert-box">
            <p><strong>Dispute ID:</strong> ${disputeInfo.disputeId}</p>
            <p><strong>Amount:</strong> $${disputeInfo.amount.toFixed(2)}</p>
            <p><strong>Reason:</strong> ${disputeInfo.reason}</p>
            <p><strong>Status:</strong> ${disputeInfo.status.replace(/_/g, ' ')}</p>
            <p><strong>Patient:</strong> ${params.patientName}</p>
            ${!params.isClosed ? `<p><strong>Evidence Due:</strong> ${evidenceDue}</p>` : ''}
          </div>
          ${params.isNew ? `
            <p><strong>Next Steps:</strong></p>
            <ol>
              <li>Review the original transaction and any related documentation</li>
              <li>Gather evidence (receipts, signed forms, communication history)</li>
              <li>Submit evidence through Stripe Dashboard before the deadline</li>
            </ol>
          ` : params.isClosed ? `
            <p>This dispute has been ${disputeInfo.status === 'won' ? 'resolved in your favor' : 'closed'}.</p>
          ` : `
            <p>The dispute status has been updated. Please review and take appropriate action if needed.</p>
          `}
        </div>
        <div class="footer">
          <p>${params.organizationName} - Billing Alert</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Export types for use in API route
export type { WebhookHandlerResult };
