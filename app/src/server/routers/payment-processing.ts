/**
 * Payment Processing Router
 * Epic 10: Payment Processing
 *
 * Handles credit card processing, payment plans, statements, and refunds.
 */

import { z } from 'zod';
import { router, protectedProcedure, billerProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog, type AuditAction } from '@/lib/audit';
import {
  CardType,
  CardBrand,
  PaymentTransactionStatus,
  PaymentPlanStatus,
  InstallmentStatus,
  StatementStatus,
  AutoPayFrequency,
  PaymentMethod as PrismaPaymentMethod,
  ChargeStatus,
} from '@prisma/client';
import {
  getPaymentProvider,
  calculatePaymentPlanSchedule,
  toCents,
  toDollars,
  formatCurrency,
  getCardBrandDisplayName,
  maskCardNumber,
} from '@/lib/payment';
import { notificationService } from '@/lib/notification-service';

// ============================================
// Audit Action Types for Payment Processing
// ============================================

const PAYMENT_AUDIT_ACTIONS = {
  PAYMENT_METHOD_CREATE: 'PAYMENT_CREATE' as AuditAction,
  PAYMENT_METHOD_DELETE: 'PAYMENT_UPDATE' as AuditAction,
  PAYMENT_PROCESS: 'PAYMENT_CREATE' as AuditAction,
  PAYMENT_REFUND: 'PAYMENT_UPDATE' as AuditAction,
  PAYMENT_PLAN_CREATE: 'BILLING_CREATE' as AuditAction,
  PAYMENT_PLAN_UPDATE: 'BILLING_UPDATE' as AuditAction,
  STATEMENT_GENERATE: 'STATEMENT_GENERATE' as AuditAction,
  AUTOPAY_ENROLL: 'BILLING_CREATE' as AuditAction,
  AUTOPAY_CANCEL: 'BILLING_UPDATE' as AuditAction,
};

export const paymentProcessingRouter = router({
  // ============================================
  // Payment Methods (Stored Cards)
  // ============================================

  /**
   * Create/store a payment method (card tokenization)
   * Note: In production, card details should be tokenized client-side with Stripe.js
   */
  createPaymentMethod: billerProcedure
    .input(
      z.object({
        patientId: z.string(),
        // Tokenized card info (from client-side Stripe.js)
        paymentToken: z.string(),
        last4: z.string().length(4),
        cardBrand: z.nativeEnum(CardBrand),
        cardType: z.nativeEnum(CardType).default('CREDIT'),
        expiryMonth: z.number().min(1).max(12),
        expiryYear: z.number().min(2024),
        cardholderName: z.string().min(1),
        billingZip: z.string().optional(),
        isDefault: z.boolean().default(false),
        nickname: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify patient belongs to org
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: input.patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // If setting as default, unset other defaults
      if (input.isDefault) {
        await ctx.prisma.storedPaymentMethod.updateMany({
          where: {
            patientId: input.patientId,
            organizationId: ctx.user.organizationId,
            isDefault: true,
          },
          data: { isDefault: false },
        });
      }

      // Create the stored payment method
      const paymentMethod = await ctx.prisma.storedPaymentMethod.create({
        data: {
          patientId: input.patientId,
          organizationId: ctx.user.organizationId,
          paymentToken: input.paymentToken,
          last4: input.last4,
          cardBrand: input.cardBrand,
          cardType: input.cardType,
          expiryMonth: input.expiryMonth,
          expiryYear: input.expiryYear,
          cardholderName: input.cardholderName,
          billingZip: input.billingZip,
          isDefault: input.isDefault,
          nickname: input.nickname,
        },
      });

      await auditLog(PAYMENT_AUDIT_ACTIONS.PAYMENT_METHOD_CREATE, 'StoredPaymentMethod', {
        entityId: paymentMethod.id,
        changes: {
          patientId: input.patientId,
          cardBrand: input.cardBrand,
          last4: input.last4,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return paymentMethod;
    }),

  /**
   * List patient's stored payment methods
   */
  listPaymentMethods: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        includeInactive: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {
        patientId: input.patientId,
        organizationId: ctx.user.organizationId,
      };

      if (!input.includeInactive) {
        where.isActive = true;
      }

      const paymentMethods = await ctx.prisma.storedPaymentMethod.findMany({
        where,
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      });

      return paymentMethods;
    }),

  /**
   * Update a payment method (set default, nickname, etc.)
   */
  updatePaymentMethod: billerProcedure
    .input(
      z.object({
        id: z.string(),
        isDefault: z.boolean().optional(),
        nickname: z.string().nullable().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      const existing = await ctx.prisma.storedPaymentMethod.findFirst({
        where: {
          id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Payment method not found',
        });
      }

      // If setting as default, unset other defaults
      if (updateData.isDefault === true) {
        await ctx.prisma.storedPaymentMethod.updateMany({
          where: {
            patientId: existing.patientId,
            organizationId: ctx.user.organizationId,
            isDefault: true,
            id: { not: id },
          },
          data: { isDefault: false },
        });
      }

      const paymentMethod = await ctx.prisma.storedPaymentMethod.update({
        where: { id },
        data: updateData,
      });

      await auditLog(PAYMENT_AUDIT_ACTIONS.PAYMENT_METHOD_DELETE, 'StoredPaymentMethod', {
        entityId: id,
        changes: updateData,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return paymentMethod;
    }),

  /**
   * Delete (deactivate) a payment method
   */
  deletePaymentMethod: billerProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.storedPaymentMethod.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          autoPayEnrollments: { where: { isActive: true } },
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Payment method not found',
        });
      }

      // Check if used for active auto-pay
      if (existing.autoPayEnrollments.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot delete payment method with active auto-pay enrollment',
        });
      }

      // Soft delete (deactivate)
      await ctx.prisma.storedPaymentMethod.update({
        where: { id: input.id },
        data: { isActive: false },
      });

      // Delete from payment processor
      try {
        const provider = await getPaymentProvider();
        await provider.deletePaymentMethod(existing.paymentToken);
      } catch (error) {
        console.error('Failed to delete payment method from processor:', error);
        // Continue anyway - local deactivation is what matters
      }

      await auditLog(PAYMENT_AUDIT_ACTIONS.PAYMENT_METHOD_DELETE, 'StoredPaymentMethod', {
        entityId: input.id,
        changes: { action: 'deactivate' },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // ============================================
  // Payment Processing
  // ============================================

  /**
   * Process a payment (charge a card)
   */
  processPayment: billerProcedure
    .input(
      z.object({
        patientId: z.string(),
        paymentMethodId: z.string(),
        amount: z.number().positive('Amount must be positive'),
        description: z.string().optional(),
        // Auto-apply to charges
        applyTo: z
          .array(
            z.object({
              chargeId: z.string(),
              amount: z.number().positive(),
            })
          )
          .optional(),
        autoAllocate: z.boolean().default(false),
        // Idempotency
        idempotencyKey: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, paymentMethodId, amount, description, applyTo, autoAllocate, idempotencyKey } = input;

      // Verify patient and get contact info for receipt
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          demographics: true,
          contacts: {
            where: { isPrimary: true },
            take: 1,
          },
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Get organization for receipt branding
      const organization = await ctx.prisma.organization.findUnique({
        where: { id: ctx.user.organizationId },
      });

      // Get payment method
      const paymentMethod = await ctx.prisma.storedPaymentMethod.findFirst({
        where: {
          id: paymentMethodId,
          patientId,
          organizationId: ctx.user.organizationId,
          isActive: true,
        },
      });

      if (!paymentMethod) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Payment method not found or inactive',
        });
      }

      // Process payment with provider
      const provider = await getPaymentProvider();
      const result = await provider.processPayment({
        amount: toCents(amount),
        currency: 'USD',
        paymentToken: paymentMethod.paymentToken,
        description: description ?? `Payment for ${patient.demographics?.firstName} ${patient.demographics?.lastName}`,
        idempotencyKey,
      });

      // Create transaction record
      const transaction = await ctx.prisma.paymentTransaction.create({
        data: {
          patientId,
          organizationId: ctx.user.organizationId,
          paymentMethodId,
          amount,
          currency: 'USD',
          status: result.status,
          externalTransactionId: result.transactionId,
          processorResponse: result.rawResponse as object,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
          declineCode: result.declineCode,
          processedAt: result.success ? new Date() : null,
        },
      });

      // If successful, create a Payment record and allocate
      if (result.success) {
        // Update last used date
        await ctx.prisma.storedPaymentMethod.update({
          where: { id: paymentMethodId },
          data: { lastUsedAt: new Date() },
        });

        // Calculate allocations
        let unappliedAmount = amount;
        const allocations: { chargeId: string; amount: number }[] = [];

        if (applyTo && applyTo.length > 0) {
          const chargeIds = applyTo.map((a) => a.chargeId);
          const charges = await ctx.prisma.charge.findMany({
            where: {
              id: { in: chargeIds },
              organizationId: ctx.user.organizationId,
              status: { not: ChargeStatus.VOID },
            },
          });

          const chargeMap = new Map(charges.map((c) => [c.id, c]));

          for (const allocation of applyTo) {
            const charge = chargeMap.get(allocation.chargeId);
            if (!charge) {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: `Charge ${allocation.chargeId} not found`,
              });
            }

            if (allocation.amount > Number(charge.balance)) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: `Payment amount exceeds balance for charge ${charge.cptCode}`,
              });
            }

            allocations.push(allocation);
            unappliedAmount -= allocation.amount;
          }
        } else if (autoAllocate) {
          const unpaidCharges = await ctx.prisma.charge.findMany({
            where: {
              patientId,
              organizationId: ctx.user.organizationId,
              status: { in: [ChargeStatus.PENDING, ChargeStatus.BILLED] },
              balance: { gt: 0 },
            },
            orderBy: { serviceDate: 'asc' },
          });

          let remaining = amount;
          for (const charge of unpaidCharges) {
            if (remaining <= 0) break;
            const allocationAmount = Math.min(remaining, Number(charge.balance));
            allocations.push({
              chargeId: charge.id,
              amount: allocationAmount,
            });
            remaining -= allocationAmount;
          }
          unappliedAmount = remaining;
        }

        // Create Payment record and link to transaction
        const payment = await ctx.prisma.$transaction(async (tx) => {
          const payment = await tx.payment.create({
            data: {
              patientId,
              organizationId: ctx.user.organizationId,
              amount,
              paymentMethod: mapCardTypeToPaymentMethod(paymentMethod.cardType),
              payerType: 'patient',
              referenceNumber: result.transactionId,
              unappliedAmount,
              notes: description,
            },
          });

          // Link transaction to payment
          await tx.paymentTransaction.update({
            where: { id: transaction.id },
            data: { paymentId: payment.id },
          });

          // Create allocations and update charges
          for (const allocation of allocations) {
            await tx.paymentAllocation.create({
              data: {
                paymentId: payment.id,
                chargeId: allocation.chargeId,
                amount: allocation.amount,
              },
            });

            const charge = await tx.charge.findUnique({ where: { id: allocation.chargeId } });
            if (charge) {
              const newPayments = Number(charge.payments) + allocation.amount;
              const newBalance = Number(charge.fee) * charge.units - newPayments - Number(charge.adjustments);

              await tx.charge.update({
                where: { id: allocation.chargeId },
                data: {
                  payments: newPayments,
                  balance: Math.max(0, newBalance),
                  status: newBalance <= 0 ? ChargeStatus.PAID : charge.status,
                },
              });
            }
          }

          return payment;
        });

        await auditLog(PAYMENT_AUDIT_ACTIONS.PAYMENT_PROCESS, 'PaymentTransaction', {
          entityId: transaction.id,
          changes: {
            patientId,
            amount,
            status: 'success',
            externalTransactionId: result.transactionId,
            allocations: allocations.length,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        // Send email receipt to patient (non-blocking)
        const patientContact = patient.contacts[0];
        if (patientContact?.email && patientContact.allowEmail) {
          const patientName = patient.demographics
            ? `${patient.demographics.firstName} ${patient.demographics.lastName}`
            : 'Valued Patient';
          const orgName = organization?.name ?? 'Our Practice';
          const cardDisplay = `${getCardBrandDisplayName(paymentMethod.cardBrand)} ${maskCardNumber(paymentMethod.last4)}`;
          const formattedAmount = formatCurrency(toCents(amount));
          const receiptDate = new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });

          // Fire and forget - don't block the payment response
          notificationService.sendEmail(
            patientContact.email,
            `Payment Receipt - ${formattedAmount}`,
            `Dear ${patientName},

Thank you for your payment. Here are your receipt details:

Payment Details
---------------
Date: ${receiptDate}
Amount: ${formattedAmount}
Payment Method: ${cardDisplay}
Reference: ${result.transactionId ?? payment.id}
${description ? `Description: ${description}` : ''}

${allocations.length > 0 ? `This payment was applied to ${allocations.length} charge(s) on your account.` : 'This payment has been recorded on your account.'}

${unappliedAmount > 0 ? `Credit Balance: ${formatCurrency(toCents(unappliedAmount))} will be applied to future charges.` : ''}

If you have any questions about this payment, please contact our office.

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
      <p>Thank you for your payment. Your transaction has been processed successfully.</p>

      <div class="receipt-box">
        <div style="text-align: center; margin-bottom: 20px;">
          <div class="amount">${formattedAmount}</div>
          <div style="color: #28a745;">Payment Successful</div>
        </div>

        <div class="detail-row">
          <span class="detail-label">Date</span>
          <span class="detail-value">${receiptDate}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Payment Method</span>
          <span class="detail-value">${cardDisplay}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Reference #</span>
          <span class="detail-value">${result.transactionId ?? payment.id}</span>
        </div>
        ${description ? `<div class="detail-row"><span class="detail-label">Description</span><span class="detail-value">${description}</span></div>` : ''}
        ${allocations.length > 0 ? `<div class="detail-row"><span class="detail-label">Applied to</span><span class="detail-value">${allocations.length} charge(s)</span></div>` : ''}
        ${unappliedAmount > 0 ? `<div class="detail-row"><span class="detail-label">Credit Balance</span><span class="detail-value">${formatCurrency(toCents(unappliedAmount))}</span></div>` : ''}
      </div>

      <p>If you have any questions about this payment, please contact our office.</p>
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
          ).catch((err) => {
            console.error('Failed to send payment receipt email:', err);
            // Don't throw - receipt email failure shouldn't fail the payment
          });
        }

        return {
          success: true,
          transactionId: transaction.id,
          paymentId: payment.id,
          amount,
          allocatedAmount: amount - unappliedAmount,
          unappliedAmount,
        };
      }

      // Payment failed
      await auditLog(PAYMENT_AUDIT_ACTIONS.PAYMENT_PROCESS, 'PaymentTransaction', {
        entityId: transaction.id,
        changes: {
          patientId,
          amount,
          status: 'failed',
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: result.errorMessage ?? 'Payment failed',
      });
    }),

  /**
   * Process a refund
   *
   * US-088: Refund processing with proper accounting
   * - Requires reason for refund
   * - Creates reversing ledger entry
   * - Updates patient balance (reverses payment allocations)
   * - Emails refund confirmation to patient
   * - Full audit trail
   */
  processRefund: billerProcedure
    .input(
      z.object({
        transactionId: z.string(),
        amount: z.number().positive().optional(), // Partial refund amount
        reason: z.string().min(1, 'Refund reason is required'),
        reasonCategory: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { transactionId, amount, reason, reasonCategory } = input;

      // Get original transaction with payment and allocations
      const originalTransaction = await ctx.prisma.paymentTransaction.findFirst({
        where: {
          id: transactionId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          payment: {
            include: {
              allocations: {
                include: {
                  charge: true,
                },
              },
            },
          },
          paymentMethod: true,
          patient: {
            include: {
              demographics: true,
              contacts: {
                where: { isPrimary: true },
                take: 1,
              },
            },
          },
        },
      });

      if (!originalTransaction) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Transaction not found',
        });
      }

      if (originalTransaction.status !== PaymentTransactionStatus.COMPLETED) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Can only refund completed transactions',
        });
      }

      if (originalTransaction.isRefund) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot refund a refund transaction',
        });
      }

      const refundAmount = amount ?? Number(originalTransaction.amount);
      if (refundAmount > Number(originalTransaction.amount)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Refund amount exceeds original transaction',
        });
      }

      // Get organization for email branding
      const organization = await ctx.prisma.organization.findUnique({
        where: { id: ctx.user.organizationId },
      });

      // Process refund with provider
      const provider = await getPaymentProvider();
      const result = await provider.processRefund({
        transactionId: originalTransaction.externalTransactionId!,
        amount: toCents(refundAmount),
        reason,
      });

      if (!result.success) {
        // Log failed refund attempt
        await auditLog(PAYMENT_AUDIT_ACTIONS.PAYMENT_REFUND, 'PaymentTransaction', {
          entityId: transactionId,
          changes: {
            action: 'refund_failed',
            amount: refundAmount,
            reason,
            errorMessage: result.errorMessage,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.errorMessage ?? 'Refund failed',
        });
      }

      // Calculate how much of each allocation to reverse (proportional to refund amount)
      const originalPaymentAmount = Number(originalTransaction.payment?.amount ?? originalTransaction.amount);
      const refundRatio = refundAmount / originalPaymentAmount;
      const isFullRefund = refundAmount === originalPaymentAmount;

      // Create refund records and reverse allocations in transaction
      const [refundTransaction, refundRecord, reversedAllocations] = await ctx.prisma.$transaction(async (tx) => {
        // Create refund transaction record
        const refundTx = await tx.paymentTransaction.create({
          data: {
            patientId: originalTransaction.patientId,
            organizationId: ctx.user.organizationId,
            paymentMethodId: originalTransaction.paymentMethodId,
            amount: refundAmount,
            currency: 'USD',
            status: PaymentTransactionStatus.COMPLETED,
            isRefund: true,
            originalTransactionId: transactionId,
            refundReason: reason,
            externalTransactionId: result.refundId,
            processorResponse: result.rawResponse as object,
            processedAt: new Date(),
          },
        });

        // Create refund record
        const refund = await tx.refund.create({
          data: {
            patientId: originalTransaction.patientId,
            organizationId: ctx.user.organizationId,
            amount: refundAmount,
            reason,
            reasonCategory,
            status: PaymentTransactionStatus.COMPLETED,
            processorRefundId: result.refundId,
            originalPaymentId: originalTransaction.paymentId!,
            originalTransactionId: transactionId,
            initiatedBy: ctx.user.id,
            processedAt: new Date(),
          },
        });

        // Update original transaction status
        await tx.paymentTransaction.update({
          where: { id: transactionId },
          data: {
            status: isFullRefund
              ? PaymentTransactionStatus.REFUNDED
              : PaymentTransactionStatus.PARTIALLY_REFUNDED,
          },
        });

        // Track reversed allocations for audit trail
        const reversedAllocs: { chargeId: string; amount: number; cptCode: string }[] = [];

        // Reverse payment allocations and update charge balances
        if (originalTransaction.payment?.allocations) {
          for (const allocation of originalTransaction.payment.allocations) {
            // Calculate amount to reverse for this allocation
            const allocationRefundAmount = isFullRefund
              ? Number(allocation.amount)
              : Math.round(Number(allocation.amount) * refundRatio * 100) / 100;

            if (allocationRefundAmount > 0) {
              // Update charge: reduce payments, increase balance
              const charge = allocation.charge;
              const newPayments = Math.max(0, Number(charge.payments) - allocationRefundAmount);
              const newBalance = Number(charge.fee) * charge.units - newPayments - Number(charge.adjustments);

              await tx.charge.update({
                where: { id: charge.id },
                data: {
                  payments: newPayments,
                  balance: Math.max(0, newBalance),
                  // If charge was paid, revert to previous status
                  status: newBalance > 0 && charge.status === ChargeStatus.PAID
                    ? ChargeStatus.BILLED
                    : charge.status,
                },
              });

              reversedAllocs.push({
                chargeId: charge.id,
                amount: allocationRefundAmount,
                cptCode: charge.cptCode,
              });
            }
          }
        }

        // Handle the payment record
        if (originalTransaction.payment) {
          if (isFullRefund) {
            // Full refund: void the entire payment
            await tx.payment.update({
              where: { id: originalTransaction.payment.id },
              data: {
                isVoid: true,
                voidReason: `Full refund: ${reason}`,
                voidedAt: new Date(),
                voidedBy: ctx.user.id,
              },
            });
          } else {
            // Partial refund: adjust the payment amount and unapplied amount
            const currentUnapplied = Number(originalTransaction.payment.unappliedAmount ?? 0);
            const reversedAllocTotal = reversedAllocs.reduce((sum, a) => sum + a.amount, 0);
            const adjustedUnapplied = Math.max(0, currentUnapplied - (refundAmount - reversedAllocTotal));

            await tx.payment.update({
              where: { id: originalTransaction.payment.id },
              data: {
                amount: Number(originalTransaction.payment.amount) - refundAmount,
                unappliedAmount: adjustedUnapplied,
                notes: `${originalTransaction.payment.notes ?? ''}\nPartial refund of ${formatCurrency(toCents(refundAmount))} on ${new Date().toISOString().split('T')[0]}: ${reason}`.trim(),
              },
            });
          }
        }

        return [refundTx, refund, reversedAllocs];
      });

      // Audit log with full details
      await auditLog(PAYMENT_AUDIT_ACTIONS.PAYMENT_REFUND, 'Refund', {
        entityId: refundRecord.id,
        changes: {
          originalTransactionId: transactionId,
          originalPaymentId: originalTransaction.paymentId,
          amount: refundAmount,
          isFullRefund,
          reason,
          reasonCategory,
          processorRefundId: result.refundId,
          reversedAllocations: reversedAllocations.map(a => ({
            chargeId: a.chargeId,
            cptCode: a.cptCode,
            amount: a.amount,
          })),
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      // Send refund confirmation email to patient (non-blocking)
      const patientContact = originalTransaction.patient.contacts[0];
      if (patientContact?.email && patientContact.allowEmail) {
        const patientName = originalTransaction.patient.demographics
          ? `${originalTransaction.patient.demographics.firstName} ${originalTransaction.patient.demographics.lastName}`
          : 'Valued Patient';
        const orgName = organization?.name ?? 'Our Practice';
        const cardDisplay = originalTransaction.paymentMethod
          ? `${getCardBrandDisplayName(originalTransaction.paymentMethod.cardBrand)} ****${originalTransaction.paymentMethod.last4}`
          : 'original payment method';
        const formattedAmount = formatCurrency(toCents(refundAmount));
        const refundDate = new Date().toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });

        // Fire and forget - don't block the refund response
        notificationService.sendEmail(
          patientContact.email,
          `Refund Confirmation - ${formattedAmount}`,
          `Dear ${patientName},

We have processed a refund to your account. Here are the details:

Refund Details
--------------
Date: ${refundDate}
Amount: ${formattedAmount}
Refund Reference: ${result.refundId ?? refundRecord.id}
Original Transaction: ${originalTransaction.externalTransactionId ?? transactionId}
${isFullRefund ? 'Type: Full Refund' : 'Type: Partial Refund'}

The refund will be credited to your ${cardDisplay} within 5-10 business days, depending on your financial institution.

If you have any questions about this refund, please contact our office.

Thank you for choosing ${orgName}.

This is an automated notification. Please do not reply to this email.`,
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
    .refund-box { background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e0e0e0; }
    .amount { font-size: 32px; font-weight: bold; color: #053e67; }
    .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
    .detail-label { color: #666; }
    .detail-value { font-weight: 500; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
    .refund-icon { font-size: 48px; margin-bottom: 10px; }
    .info-box { background-color: #e8f4fd; border: 1px solid #b8daff; border-radius: 8px; padding: 15px; margin-top: 20px; }
    .info-box p { margin: 0; color: #004085; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="refund-icon">↩</div>
      <h1 style="margin: 0;">Refund Processed</h1>
    </div>
    <div class="content">
      <p>Dear ${patientName},</p>
      <p>We have processed a refund to your account. The funds will be returned to your original payment method.</p>

      <div class="refund-box">
        <div style="text-align: center; margin-bottom: 20px;">
          <div class="amount">${formattedAmount}</div>
          <div style="color: #28a745;">${isFullRefund ? 'Full Refund' : 'Partial Refund'}</div>
        </div>

        <div class="detail-row">
          <span class="detail-label">Date</span>
          <span class="detail-value">${refundDate}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Refund Reference</span>
          <span class="detail-value">${result.refundId ?? refundRecord.id}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Original Transaction</span>
          <span class="detail-value">${originalTransaction.externalTransactionId ?? transactionId}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Payment Method</span>
          <span class="detail-value">${cardDisplay}</span>
        </div>
      </div>

      <div class="info-box">
        <p><strong>Please note:</strong> Refunds typically take 5-10 business days to appear on your statement, depending on your financial institution.</p>
      </div>

      <p style="margin-top: 20px;">If you have any questions about this refund, please contact our office.</p>
      <p>Thank you for choosing ${orgName}.</p>
    </div>
    <div class="footer">
      <p>This is an automated notification. Please do not reply to this email.</p>
      <p>${orgName}</p>
    </div>
  </div>
</body>
</html>
            `,
          }
        ).catch((err) => {
          console.error('Failed to send refund confirmation email:', err);
          // Don't throw - email failure shouldn't fail the refund
        });
      }

      return {
        success: true,
        refundId: refundRecord.id,
        transactionId: refundTransaction.id,
        amount: refundAmount,
        isFullRefund,
        reversedAllocations: reversedAllocations.length,
      };
    }),

  // ============================================
  // Payment Plans
  // ============================================

  /**
   * Create a payment plan
   */
  createPaymentPlan: billerProcedure
    .input(
      z.object({
        patientId: z.string(),
        name: z.string().optional(),
        totalAmount: z.number().positive(),
        downPayment: z.number().nonnegative().default(0),
        numberOfInstallments: z.number().int().min(2).max(48),
        frequency: z.nativeEnum(AutoPayFrequency).default('MONTHLY'),
        startDate: z.date(),
        interestRate: z.number().nonnegative().max(0.30).optional(), // Max 30% APR
        setupFee: z.number().nonnegative().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        patientId,
        name,
        totalAmount,
        downPayment,
        numberOfInstallments,
        frequency,
        startDate,
        interestRate,
        setupFee,
        notes,
      } = input;

      // Verify patient
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Calculate schedule
      const schedule = calculatePaymentPlanSchedule({
        totalAmount: toCents(totalAmount),
        downPayment: downPayment ? toCents(downPayment) : 0,
        numberOfInstallments,
        frequency: frequency === 'WEEKLY' ? 'weekly' : frequency === 'BI_WEEKLY' ? 'bi_weekly' : 'monthly',
        startDate,
        interestRate: interestRate ?? 0,
        setupFee: setupFee ? toCents(setupFee) : 0,
      });

      const installmentAmount = toDollars(schedule.installments[0]?.amount ?? 0);

      // Create plan with installments
      const plan = await ctx.prisma.$transaction(async (tx) => {
        const plan = await tx.paymentPlan.create({
          data: {
            patientId,
            organizationId: ctx.user.organizationId,
            name: name ?? `${numberOfInstallments}-Payment Plan`,
            totalAmount,
            downPayment,
            numberOfInstallments,
            installmentAmount,
            frequency,
            interestRate,
            setupFee,
            amountRemaining: totalAmount + (setupFee ?? 0),
            startDate,
            nextDueDate: schedule.installments[0]?.dueDate,
            notes,
          },
        });

        // Create installment records
        for (const inst of schedule.installments) {
          await tx.paymentPlanInstallment.create({
            data: {
              paymentPlanId: plan.id,
              installmentNumber: inst.number,
              amount: toDollars(inst.amount),
              dueDate: inst.dueDate,
              status: InstallmentStatus.SCHEDULED,
            },
          });
        }

        return plan;
      });

      await auditLog(PAYMENT_AUDIT_ACTIONS.PAYMENT_PLAN_CREATE, 'PaymentPlan', {
        entityId: plan.id,
        changes: {
          patientId,
          totalAmount,
          numberOfInstallments,
          frequency,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return plan;
    }),

  /**
   * List payment plans for a patient
   */
  listPaymentPlans: protectedProcedure
    .input(
      z.object({
        patientId: z.string().optional(),
        status: z.nativeEnum(PaymentPlanStatus).optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, status, page, limit } = input;

      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
      };

      if (patientId) where.patientId = patientId;
      if (status) where.status = status;

      const [plans, total] = await Promise.all([
        ctx.prisma.paymentPlan.findMany({
          where,
          include: {
            patient: {
              include: { demographics: true },
            },
            installments: {
              orderBy: { installmentNumber: 'asc' },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        ctx.prisma.paymentPlan.count({ where }),
      ]);

      return {
        plans,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }),

  /**
   * Get a payment plan with details
   */
  getPaymentPlan: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const plan = await ctx.prisma.paymentPlan.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            include: { demographics: true },
          },
          installments: {
            orderBy: { installmentNumber: 'asc' },
            include: {
              transaction: true,
            },
          },
        },
      });

      if (!plan) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Payment plan not found',
        });
      }

      return plan;
    }),

  /**
   * Cancel a payment plan
   */
  cancelPaymentPlan: billerProcedure
    .input(
      z.object({
        id: z.string(),
        reason: z.string().min(1, 'Cancellation reason is required'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, reason } = input;

      const plan = await ctx.prisma.paymentPlan.findFirst({
        where: {
          id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!plan) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Payment plan not found',
        });
      }

      if (plan.status !== PaymentPlanStatus.ACTIVE) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Can only cancel active payment plans',
        });
      }

      // Cancel plan and skip remaining installments
      await ctx.prisma.$transaction(async (tx) => {
        await tx.paymentPlan.update({
          where: { id },
          data: {
            status: PaymentPlanStatus.CANCELLED,
            cancelledAt: new Date(),
            cancelReason: reason,
          },
        });

        // Skip remaining scheduled installments
        await tx.paymentPlanInstallment.updateMany({
          where: {
            paymentPlanId: id,
            status: InstallmentStatus.SCHEDULED,
          },
          data: {
            status: InstallmentStatus.SKIPPED,
          },
        });
      });

      await auditLog(PAYMENT_AUDIT_ACTIONS.PAYMENT_PLAN_UPDATE, 'PaymentPlan', {
        entityId: id,
        changes: { action: 'cancel', reason },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  /**
   * Get payment plan status with detailed progress
   *
   * US-089: View plan progress and remaining balance
   */
  getPlanStatus: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const plan = await ctx.prisma.paymentPlan.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            include: { demographics: true },
          },
          installments: {
            orderBy: { installmentNumber: 'asc' },
            include: {
              transaction: true,
            },
          },
        },
      });

      if (!plan) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Payment plan not found',
        });
      }

      // Calculate detailed progress
      const paidInstallments = plan.installments.filter(
        (i) => i.status === InstallmentStatus.PAID
      );
      const failedInstallments = plan.installments.filter(
        (i) => i.status === InstallmentStatus.FAILED
      );
      const scheduledInstallments = plan.installments.filter(
        (i) => i.status === InstallmentStatus.SCHEDULED
      );
      const pendingInstallments = plan.installments.filter(
        (i) => i.status === InstallmentStatus.PENDING
      );

      // Find overdue installments (scheduled but past due date)
      const now = new Date();
      const overdueInstallments = scheduledInstallments.filter(
        (i) => i.dueDate < now
      );

      // Calculate amounts
      const totalPaid = paidInstallments.reduce(
        (sum, i) => sum + Number(i.paidAmount ?? i.amount),
        0
      );
      const totalRemaining = Number(plan.totalAmount) + Number(plan.setupFee ?? 0) - totalPaid;
      const nextInstallment = scheduledInstallments.find(
        (i) => i.dueDate >= now
      ) ?? pendingInstallments[0];

      // Calculate progress percentage
      const progressPercentage = Math.round(
        (paidInstallments.length / plan.numberOfInstallments) * 100
      );

      // Determine if plan is on track
      const isOnTrack = overdueInstallments.length === 0 && failedInstallments.length === 0;

      return {
        plan: {
          id: plan.id,
          name: plan.name,
          status: plan.status,
          totalAmount: Number(plan.totalAmount),
          downPayment: Number(plan.downPayment),
          numberOfInstallments: plan.numberOfInstallments,
          installmentAmount: Number(plan.installmentAmount),
          frequency: plan.frequency,
          interestRate: plan.interestRate ? Number(plan.interestRate) : null,
          setupFee: plan.setupFee ? Number(plan.setupFee) : null,
          startDate: plan.startDate,
          endDate: plan.endDate,
          createdAt: plan.createdAt,
        },
        patient: {
          id: plan.patient.id,
          name: plan.patient.demographics
            ? `${plan.patient.demographics.firstName} ${plan.patient.demographics.lastName}`
            : 'Unknown Patient',
        },
        progress: {
          installmentsPaid: paidInstallments.length,
          installmentsRemaining: scheduledInstallments.length + pendingInstallments.length,
          totalInstallments: plan.numberOfInstallments,
          progressPercentage,
          amountPaid: totalPaid,
          amountRemaining: Math.max(0, totalRemaining),
          isOnTrack,
        },
        nextPayment: nextInstallment
          ? {
              installmentNumber: nextInstallment.installmentNumber,
              amount: Number(nextInstallment.amount),
              dueDate: nextInstallment.dueDate,
              status: nextInstallment.status,
            }
          : null,
        issues: {
          overdueCount: overdueInstallments.length,
          failedCount: failedInstallments.length,
          overdueInstallments: overdueInstallments.map((i) => ({
            installmentNumber: i.installmentNumber,
            amount: Number(i.amount),
            dueDate: i.dueDate,
            daysPastDue: Math.floor(
              (now.getTime() - i.dueDate.getTime()) / (1000 * 60 * 60 * 24)
            ),
          })),
          failedInstallments: failedInstallments.map((i) => ({
            installmentNumber: i.installmentNumber,
            amount: Number(i.amount),
            dueDate: i.dueDate,
            attemptCount: i.attemptCount,
            lastAttemptAt: i.lastAttemptAt,
          })),
        },
        installments: plan.installments.map((i) => ({
          id: i.id,
          installmentNumber: i.installmentNumber,
          amount: Number(i.amount),
          dueDate: i.dueDate,
          status: i.status,
          paidAt: i.paidAt,
          paidAmount: i.paidAmount ? Number(i.paidAmount) : null,
          attemptCount: i.attemptCount,
          hasTransaction: !!i.transaction,
        })),
      };
    }),

  /**
   * Modify a payment plan
   *
   * US-089: Adjust plan terms
   * - Can adjust frequency, extend dates, or restructure remaining installments
   */
  modifyPlan: billerProcedure
    .input(
      z.object({
        id: z.string(),
        // Optional modifications
        frequency: z.nativeEnum(AutoPayFrequency).optional(),
        extendByInstallments: z.number().int().min(1).max(12).optional(),
        pauseUntil: z.date().optional(),
        resume: z.boolean().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, frequency, extendByInstallments, pauseUntil, resume, notes } = input;

      const plan = await ctx.prisma.paymentPlan.findFirst({
        where: {
          id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          installments: {
            orderBy: { installmentNumber: 'asc' },
          },
        },
      });

      if (!plan) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Payment plan not found',
        });
      }

      // Can only modify active or paused plans
      if (plan.status !== PaymentPlanStatus.ACTIVE && plan.status !== PaymentPlanStatus.PAUSED) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Can only modify active or paused payment plans',
        });
      }

      const changes: Record<string, unknown> = {};
      const updateData: Record<string, unknown> = {};

      // Handle pause
      if (pauseUntil) {
        if (plan.status === PaymentPlanStatus.PAUSED) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Plan is already paused',
          });
        }
        updateData.status = PaymentPlanStatus.PAUSED;
        changes.paused = true;
        changes.pauseUntil = pauseUntil;
      }

      // Handle resume
      if (resume) {
        if (plan.status !== PaymentPlanStatus.PAUSED) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Plan is not paused',
          });
        }
        updateData.status = PaymentPlanStatus.ACTIVE;
        changes.resumed = true;
      }

      // Handle frequency change
      if (frequency && frequency !== plan.frequency) {
        updateData.frequency = frequency;
        changes.frequencyChanged = { from: plan.frequency, to: frequency };

        // Recalculate remaining installment dates
        const scheduledInstallments = plan.installments.filter(
          (i) => i.status === InstallmentStatus.SCHEDULED
        );

        if (scheduledInstallments.length > 0) {
          // Update dates for scheduled installments
          let currentDate = new Date();
          for (let i = 0; i < scheduledInstallments.length; i++) {
            const installment = scheduledInstallments[i];

            // Calculate next date based on new frequency
            if (i > 0) {
              switch (frequency) {
                case AutoPayFrequency.WEEKLY:
                  currentDate.setDate(currentDate.getDate() + 7);
                  break;
                case AutoPayFrequency.BI_WEEKLY:
                  currentDate.setDate(currentDate.getDate() + 14);
                  break;
                case AutoPayFrequency.MONTHLY:
                  currentDate.setMonth(currentDate.getMonth() + 1);
                  break;
                default:
                  currentDate.setMonth(currentDate.getMonth() + 1);
              }
            } else {
              // First scheduled installment - set to today or next appropriate day
              switch (frequency) {
                case AutoPayFrequency.WEEKLY:
                  currentDate.setDate(currentDate.getDate() + 7);
                  break;
                case AutoPayFrequency.BI_WEEKLY:
                  currentDate.setDate(currentDate.getDate() + 14);
                  break;
                case AutoPayFrequency.MONTHLY:
                  currentDate.setMonth(currentDate.getMonth() + 1);
                  break;
                default:
                  currentDate.setMonth(currentDate.getMonth() + 1);
              }
            }

            await ctx.prisma.paymentPlanInstallment.update({
              where: { id: installment.id },
              data: { dueDate: new Date(currentDate) },
            });
          }

          // Update next due date on plan
          updateData.nextDueDate = scheduledInstallments[0]
            ? new Date(scheduledInstallments[0].dueDate)
            : null;
        }
      }

      // Handle extending the plan
      if (extendByInstallments) {
        const lastInstallment = plan.installments[plan.installments.length - 1];
        const lastNumber = lastInstallment?.installmentNumber ?? 0;
        const lastDate = lastInstallment?.dueDate ?? new Date();

        // Calculate new installment amount by redistributing remaining amount
        const paidInstallments = plan.installments.filter(
          (i) => i.status === InstallmentStatus.PAID
        );
        const totalPaid = paidInstallments.reduce(
          (sum, i) => sum + Number(i.paidAmount ?? i.amount),
          0
        );
        const remaining = Number(plan.totalAmount) + Number(plan.setupFee ?? 0) - totalPaid;
        const scheduledCount = plan.installments.filter(
          (i) => i.status === InstallmentStatus.SCHEDULED
        ).length;
        const newTotalRemaining = scheduledCount + extendByInstallments;
        const newInstallmentAmount = Math.ceil(remaining / newTotalRemaining * 100) / 100;

        // Update existing scheduled installments with new amount
        await ctx.prisma.paymentPlanInstallment.updateMany({
          where: {
            paymentPlanId: id,
            status: InstallmentStatus.SCHEDULED,
          },
          data: {
            amount: newInstallmentAmount,
          },
        });

        // Create new installments
        let currentDate = new Date(lastDate);
        const freq = frequency ?? plan.frequency;

        for (let i = 0; i < extendByInstallments; i++) {
          switch (freq) {
            case AutoPayFrequency.WEEKLY:
              currentDate.setDate(currentDate.getDate() + 7);
              break;
            case AutoPayFrequency.BI_WEEKLY:
              currentDate.setDate(currentDate.getDate() + 14);
              break;
            case AutoPayFrequency.MONTHLY:
              currentDate.setMonth(currentDate.getMonth() + 1);
              break;
            default:
              currentDate.setMonth(currentDate.getMonth() + 1);
          }

          await ctx.prisma.paymentPlanInstallment.create({
            data: {
              paymentPlanId: id,
              installmentNumber: lastNumber + i + 1,
              amount: newInstallmentAmount,
              dueDate: new Date(currentDate),
              status: InstallmentStatus.SCHEDULED,
            },
          });
        }

        updateData.numberOfInstallments = plan.numberOfInstallments + extendByInstallments;
        updateData.installmentAmount = newInstallmentAmount;
        changes.extended = {
          addedInstallments: extendByInstallments,
          newInstallmentAmount,
        };
      }

      // Update notes
      if (notes) {
        const existingNotes = plan.notes ?? '';
        const timestamp = new Date().toISOString().split('T')[0];
        updateData.notes = `${existingNotes}\n[${timestamp}] Modified: ${notes}`.trim();
        changes.notesAdded = notes;
      }

      // Apply updates
      if (Object.keys(updateData).length > 0) {
        await ctx.prisma.paymentPlan.update({
          where: { id },
          data: updateData,
        });
      }

      await auditLog(PAYMENT_AUDIT_ACTIONS.PAYMENT_PLAN_UPDATE, 'PaymentPlan', {
        entityId: id,
        changes,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        changes,
      };
    }),

  /**
   * Get missed/failed payments across all plans
   *
   * US-089: Track missed payments
   */
  getMissedPayments: billerProcedure
    .input(
      z.object({
        patientId: z.string().optional(),
        includeResolved: z.boolean().default(false),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, includeResolved, page, limit } = input;

      // Find all overdue or failed installments
      const now = new Date();
      const whereConditions: Record<string, unknown> = {
        paymentPlan: {
          organizationId: ctx.user.organizationId,
          status: PaymentPlanStatus.ACTIVE,
          ...(patientId ? { patientId } : {}),
        },
      };

      if (includeResolved) {
        // Include failed, pending (past due), and paid (late payments)
        whereConditions.OR = [
          { status: InstallmentStatus.FAILED },
          {
            status: InstallmentStatus.SCHEDULED,
            dueDate: { lt: now },
          },
        ];
      } else {
        // Only active issues
        whereConditions.OR = [
          { status: InstallmentStatus.FAILED },
          {
            status: InstallmentStatus.SCHEDULED,
            dueDate: { lt: now },
          },
        ];
      }

      const [installments, total] = await Promise.all([
        ctx.prisma.paymentPlanInstallment.findMany({
          where: whereConditions,
          include: {
            paymentPlan: {
              include: {
                patient: {
                  include: { demographics: true },
                },
              },
            },
            transaction: true,
          },
          orderBy: { dueDate: 'asc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        ctx.prisma.paymentPlanInstallment.count({ where: whereConditions }),
      ]);

      // Calculate summary stats
      const totalOverdueAmount = installments
        .filter((i) => i.status === InstallmentStatus.SCHEDULED && i.dueDate < now)
        .reduce((sum, i) => sum + Number(i.amount), 0);
      const totalFailedAmount = installments
        .filter((i) => i.status === InstallmentStatus.FAILED)
        .reduce((sum, i) => sum + Number(i.amount), 0);

      return {
        missedPayments: installments.map((i) => {
          const daysPastDue = Math.floor(
            (now.getTime() - i.dueDate.getTime()) / (1000 * 60 * 60 * 24)
          );

          return {
            installmentId: i.id,
            planId: i.paymentPlanId,
            planName: i.paymentPlan.name,
            patientId: i.paymentPlan.patientId,
            patientName: i.paymentPlan.patient.demographics
              ? `${i.paymentPlan.patient.demographics.firstName} ${i.paymentPlan.patient.demographics.lastName}`
              : 'Unknown Patient',
            installmentNumber: i.installmentNumber,
            amount: Number(i.amount),
            dueDate: i.dueDate,
            status: i.status === InstallmentStatus.FAILED ? 'failed' : 'overdue',
            daysPastDue: Math.max(0, daysPastDue),
            attemptCount: i.attemptCount,
            lastAttemptAt: i.lastAttemptAt,
            nextRetryAt: i.nextRetryAt,
          };
        }),
        summary: {
          totalOverdue: installments.filter(
            (i) => i.status === InstallmentStatus.SCHEDULED && i.dueDate < now
          ).length,
          totalFailed: installments.filter((i) => i.status === InstallmentStatus.FAILED).length,
          totalOverdueAmount,
          totalFailedAmount,
          totalAtRisk: totalOverdueAmount + totalFailedAmount,
        },
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }),

  /**
   * Mark a missed payment as manually resolved
   */
  resolveInstallment: billerProcedure
    .input(
      z.object({
        installmentId: z.string(),
        resolution: z.enum(['paid_outside_system', 'waived', 'rescheduled']),
        notes: z.string().min(1, 'Resolution notes are required'),
        newDueDate: z.date().optional(), // For rescheduled
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { installmentId, resolution, notes, newDueDate } = input;

      const installment = await ctx.prisma.paymentPlanInstallment.findFirst({
        where: {
          id: installmentId,
          paymentPlan: {
            organizationId: ctx.user.organizationId,
          },
        },
        include: {
          paymentPlan: true,
        },
      });

      if (!installment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Installment not found',
        });
      }

      if (installment.status === InstallmentStatus.PAID) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Installment is already paid',
        });
      }

      const updateData: Record<string, unknown> = {};
      const planUpdateData: Record<string, unknown> = {};

      switch (resolution) {
        case 'paid_outside_system':
          updateData.status = InstallmentStatus.PAID;
          updateData.paidAt = new Date();
          updateData.paidAmount = installment.amount;

          // Update plan progress
          planUpdateData.installmentsPaid = installment.paymentPlan.installmentsPaid + 1;
          planUpdateData.amountPaid =
            Number(installment.paymentPlan.amountPaid) + Number(installment.amount);
          planUpdateData.amountRemaining =
            Number(installment.paymentPlan.amountRemaining) - Number(installment.amount);
          break;

        case 'waived':
          updateData.status = InstallmentStatus.SKIPPED;
          // Reduce the total amount remaining without marking as paid
          planUpdateData.amountRemaining =
            Number(installment.paymentPlan.amountRemaining) - Number(installment.amount);
          break;

        case 'rescheduled':
          if (!newDueDate) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'New due date is required for rescheduled installments',
            });
          }
          updateData.dueDate = newDueDate;
          updateData.status = InstallmentStatus.SCHEDULED;
          updateData.attemptCount = 0;
          updateData.lastAttemptAt = null;
          updateData.nextRetryAt = null;
          break;
      }

      await ctx.prisma.$transaction(async (tx) => {
        await tx.paymentPlanInstallment.update({
          where: { id: installmentId },
          data: updateData,
        });

        if (Object.keys(planUpdateData).length > 0) {
          // Check if plan is complete
          const remainingInstallments = await tx.paymentPlanInstallment.count({
            where: {
              paymentPlanId: installment.paymentPlanId,
              status: { in: [InstallmentStatus.SCHEDULED, InstallmentStatus.PENDING] },
            },
          });

          if (remainingInstallments === 0) {
            planUpdateData.status = PaymentPlanStatus.COMPLETED;
            planUpdateData.endDate = new Date();
          }

          // Update next due date
          const nextScheduled = await tx.paymentPlanInstallment.findFirst({
            where: {
              paymentPlanId: installment.paymentPlanId,
              status: InstallmentStatus.SCHEDULED,
            },
            orderBy: { dueDate: 'asc' },
          });
          planUpdateData.nextDueDate = nextScheduled?.dueDate ?? null;

          await tx.paymentPlan.update({
            where: { id: installment.paymentPlanId },
            data: planUpdateData,
          });
        }
      });

      await auditLog(PAYMENT_AUDIT_ACTIONS.PAYMENT_PLAN_UPDATE, 'PaymentPlanInstallment', {
        entityId: installmentId,
        changes: {
          resolution,
          notes,
          newDueDate,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true, resolution };
    }),

  // ============================================
  // Auto-Pay Enrollment
  // ============================================

  /**
   * Enroll in auto-pay
   */
  enrollAutoPay: billerProcedure
    .input(
      z.object({
        patientId: z.string(),
        paymentMethodId: z.string(),
        frequency: z.nativeEnum(AutoPayFrequency).default('ON_STATEMENT'),
        maxAmount: z.number().positive().optional(),
        dayOfMonth: z.number().min(1).max(28).optional(),
        dayOfWeek: z.number().min(0).max(6).optional(),
        consentIp: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, paymentMethodId, frequency, maxAmount, dayOfMonth, dayOfWeek, consentIp } = input;

      // Verify patient and payment method
      const [patient, paymentMethod] = await Promise.all([
        ctx.prisma.patient.findFirst({
          where: { id: patientId, organizationId: ctx.user.organizationId },
        }),
        ctx.prisma.storedPaymentMethod.findFirst({
          where: {
            id: paymentMethodId,
            patientId,
            organizationId: ctx.user.organizationId,
            isActive: true,
          },
        }),
      ]);

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      if (!paymentMethod) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Payment method not found or inactive',
        });
      }

      // Check for existing enrollment
      const existing = await ctx.prisma.autoPayEnrollment.findUnique({
        where: {
          patientId_organizationId: {
            patientId,
            organizationId: ctx.user.organizationId,
          },
        },
      });

      if (existing?.isActive) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Patient already has active auto-pay enrollment',
        });
      }

      // Calculate next charge date
      let nextChargeDate: Date | null = null;
      const now = new Date();

      if (frequency === 'MONTHLY' && dayOfMonth) {
        nextChargeDate = new Date(now.getFullYear(), now.getMonth(), dayOfMonth);
        if (nextChargeDate <= now) {
          nextChargeDate.setMonth(nextChargeDate.getMonth() + 1);
        }
      } else if (frequency === 'WEEKLY' && dayOfWeek !== undefined) {
        nextChargeDate = new Date(now);
        const currentDay = nextChargeDate.getDay();
        const daysUntil = (dayOfWeek - currentDay + 7) % 7 || 7;
        nextChargeDate.setDate(nextChargeDate.getDate() + daysUntil);
      }

      // Create or update enrollment
      const enrollment = existing
        ? await ctx.prisma.autoPayEnrollment.update({
            where: { id: existing.id },
            data: {
              paymentMethodId,
              frequency,
              maxAmount,
              dayOfMonth,
              dayOfWeek,
              isActive: true,
              nextChargeDate,
              consentedAt: new Date(),
              consentIp,
              cancelledAt: null,
            },
          })
        : await ctx.prisma.autoPayEnrollment.create({
            data: {
              patientId,
              organizationId: ctx.user.organizationId,
              paymentMethodId,
              frequency,
              maxAmount,
              dayOfMonth,
              dayOfWeek,
              nextChargeDate,
              consentIp,
            },
          });

      await auditLog(PAYMENT_AUDIT_ACTIONS.AUTOPAY_ENROLL, 'AutoPayEnrollment', {
        entityId: enrollment.id,
        changes: {
          patientId,
          paymentMethodId,
          frequency,
          maxAmount,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return enrollment;
    }),

  /**
   * Cancel auto-pay enrollment
   */
  cancelAutoPay: billerProcedure
    .input(z.object({ patientId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const enrollment = await ctx.prisma.autoPayEnrollment.findUnique({
        where: {
          patientId_organizationId: {
            patientId: input.patientId,
            organizationId: ctx.user.organizationId,
          },
        },
      });

      if (!enrollment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Auto-pay enrollment not found',
        });
      }

      if (!enrollment.isActive) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Auto-pay is already cancelled',
        });
      }

      await ctx.prisma.autoPayEnrollment.update({
        where: { id: enrollment.id },
        data: {
          isActive: false,
          cancelledAt: new Date(),
        },
      });

      await auditLog(PAYMENT_AUDIT_ACTIONS.AUTOPAY_CANCEL, 'AutoPayEnrollment', {
        entityId: enrollment.id,
        changes: { action: 'cancel', patientId: input.patientId },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  /**
   * Get auto-pay status for a patient
   */
  getAutoPayStatus: protectedProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      const enrollment = await ctx.prisma.autoPayEnrollment.findUnique({
        where: {
          patientId_organizationId: {
            patientId: input.patientId,
            organizationId: ctx.user.organizationId,
          },
        },
        include: {
          paymentMethod: true,
        },
      });

      return enrollment;
    }),

  // ============================================
  // Patient Statements
  // ============================================

  /**
   * Generate a patient statement
   */
  generateStatement: billerProcedure
    .input(
      z.object({
        patientId: z.string(),
        periodStart: z.date(),
        periodEnd: z.date(),
        dueDate: z.date(),
        messageToPatient: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, periodStart, periodEnd, dueDate, messageToPatient } = input;

      // Verify patient
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          demographics: true,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Get charges in period
      const charges = await ctx.prisma.charge.findMany({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
          serviceDate: {
            gte: periodStart,
            lte: periodEnd,
          },
          status: { not: ChargeStatus.VOID },
        },
        orderBy: { serviceDate: 'asc' },
      });

      // Get payments in period
      const payments = await ctx.prisma.payment.findMany({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
          paymentDate: {
            gte: periodStart,
            lte: periodEnd,
          },
          isVoid: false,
        },
        orderBy: { paymentDate: 'asc' },
      });

      // Calculate previous balance (charges before period minus payments before period)
      const [previousCharges, previousPayments] = await Promise.all([
        ctx.prisma.charge.aggregate({
          where: {
            patientId,
            organizationId: ctx.user.organizationId,
            serviceDate: { lt: periodStart },
            status: { not: ChargeStatus.VOID },
          },
          _sum: { balance: true },
        }),
        ctx.prisma.payment.aggregate({
          where: {
            patientId,
            organizationId: ctx.user.organizationId,
            paymentDate: { lt: periodStart },
            isVoid: false,
          },
          _sum: { amount: true },
        }),
      ]);

      // Calculate totals
      const newCharges = charges.reduce((sum, c) => sum + Number(c.fee) * c.units, 0);
      const paymentsTotal = payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const adjustments = charges.reduce((sum, c) => sum + Number(c.adjustments), 0);
      const previousBalance = Number(previousCharges._sum.balance ?? 0);
      const totalDue = previousBalance + newCharges - paymentsTotal - adjustments;

      // Generate statement number
      const year = new Date().getFullYear();
      const count = await ctx.prisma.patientStatement.count({
        where: {
          organizationId: ctx.user.organizationId,
          statementNumber: { startsWith: `STM-${year}` },
        },
      });
      const statementNumber = `STM-${year}-${String(count + 1).padStart(4, '0')}`;

      // Create statement
      const statement = await ctx.prisma.patientStatement.create({
        data: {
          patientId,
          organizationId: ctx.user.organizationId,
          statementNumber,
          periodStart,
          periodEnd,
          dueDate,
          previousBalance,
          newCharges,
          payments: paymentsTotal,
          adjustments,
          totalDue: Math.max(0, totalDue),
          status: StatementStatus.DRAFT,
          chargeDetails: charges.map((c) => ({
            id: c.id,
            date: c.serviceDate,
            description: c.description,
            cptCode: c.cptCode,
            amount: Number(c.fee) * c.units,
            balance: Number(c.balance),
          })),
          paymentDetails: payments.map((p) => ({
            id: p.id,
            date: p.paymentDate,
            method: p.paymentMethod,
            amount: Number(p.amount),
            reference: p.referenceNumber,
          })),
          messageToPatient,
        },
      });

      await auditLog(PAYMENT_AUDIT_ACTIONS.STATEMENT_GENERATE, 'PatientStatement', {
        entityId: statement.id,
        changes: {
          patientId,
          statementNumber,
          totalDue,
          periodStart,
          periodEnd,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return statement;
    }),

  /**
   * List statements
   */
  listStatements: protectedProcedure
    .input(
      z.object({
        patientId: z.string().optional(),
        status: z.nativeEnum(StatementStatus).optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, status, startDate, endDate, page, limit } = input;

      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
      };

      if (patientId) where.patientId = patientId;
      if (status) where.status = status;
      if (startDate || endDate) {
        where.statementDate = {};
        if (startDate) (where.statementDate as Record<string, Date>).gte = startDate;
        if (endDate) (where.statementDate as Record<string, Date>).lte = endDate;
      }

      const [statements, total] = await Promise.all([
        ctx.prisma.patientStatement.findMany({
          where,
          include: {
            patient: {
              include: { demographics: true },
            },
          },
          orderBy: { statementDate: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        ctx.prisma.patientStatement.count({ where }),
      ]);

      return {
        statements,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }),

  /**
   * Get a statement with details
   */
  getStatement: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const statement = await ctx.prisma.patientStatement.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            include: {
              demographics: true,
              contacts: { where: { isPrimary: true } },
            },
          },
        },
      });

      if (!statement) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Statement not found',
        });
      }

      return statement;
    }),

  /**
   * Mark statement as sent (via email)
   */
  emailStatement: billerProcedure
    .input(
      z.object({
        id: z.string(),
        email: z.string().email(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const statement = await ctx.prisma.patientStatement.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!statement) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Statement not found',
        });
      }

      // TODO: Integrate with email service to actually send the statement
      // For now, we just mark it as sent

      await ctx.prisma.patientStatement.update({
        where: { id: input.id },
        data: {
          status: StatementStatus.SENT,
          sentAt: new Date(),
          sentVia: 'email',
          sentTo: input.email,
        },
      });

      return { success: true, sentTo: input.email };
    }),

  // ============================================
  // Dashboard & Reporting
  // ============================================

  /**
   * Get payment processing dashboard data
   */
  getDashboardStats: billerProcedure
    .input(
      z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { startDate = new Date(new Date().setDate(1)), endDate = new Date() } = input;

      const [
        transactions,
        refunds,
        activePlans,
        pendingStatements,
        autoPayEnrollments,
      ] = await Promise.all([
        // Transaction stats
        ctx.prisma.paymentTransaction.aggregate({
          where: {
            organizationId: ctx.user.organizationId,
            status: PaymentTransactionStatus.COMPLETED,
            isRefund: false,
            createdAt: { gte: startDate, lte: endDate },
          },
          _sum: { amount: true },
          _count: true,
        }),
        // Refund stats
        ctx.prisma.paymentTransaction.aggregate({
          where: {
            organizationId: ctx.user.organizationId,
            status: PaymentTransactionStatus.COMPLETED,
            isRefund: true,
            createdAt: { gte: startDate, lte: endDate },
          },
          _sum: { amount: true },
          _count: true,
        }),
        // Active payment plans
        ctx.prisma.paymentPlan.count({
          where: {
            organizationId: ctx.user.organizationId,
            status: PaymentPlanStatus.ACTIVE,
          },
        }),
        // Pending statements
        ctx.prisma.patientStatement.count({
          where: {
            organizationId: ctx.user.organizationId,
            status: { in: [StatementStatus.DRAFT, StatementStatus.SENT] },
          },
        }),
        // Auto-pay enrollments
        ctx.prisma.autoPayEnrollment.count({
          where: {
            organizationId: ctx.user.organizationId,
            isActive: true,
          },
        }),
      ]);

      // Get failed transactions
      const failedTransactions = await ctx.prisma.paymentTransaction.count({
        where: {
          organizationId: ctx.user.organizationId,
          status: PaymentTransactionStatus.FAILED,
          createdAt: { gte: startDate, lte: endDate },
        },
      });

      return {
        periodStart: startDate,
        periodEnd: endDate,
        totalCollected: Number(transactions._sum.amount ?? 0),
        transactionCount: transactions._count,
        totalRefunded: Number(refunds._sum.amount ?? 0),
        refundCount: refunds._count,
        failedTransactions,
        activePlans,
        pendingStatements,
        autoPayEnrollments,
        successRate:
          transactions._count + failedTransactions > 0
            ? Math.round(
                (transactions._count / (transactions._count + failedTransactions)) * 100
              )
            : 100,
      };
    }),

  /**
   * Get recent transactions
   */
  getRecentTransactions: billerProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(10) }))
    .query(async ({ ctx, input }) => {
      const transactions = await ctx.prisma.paymentTransaction.findMany({
        where: {
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            include: { demographics: true },
          },
          paymentMethod: true,
        },
        orderBy: { createdAt: 'desc' },
        take: input.limit,
      });

      return transactions;
    }),

  // ============================================
  // Automated Payment Plan Billing (US-090)
  // ============================================

  /**
   * Get billing configuration for the organization
   */
  getBillingConfig: billerProcedure.query(async ({ ctx }) => {
    const { getBillingConfig } = await import('@/lib/payment/plan-billing-scheduler');
    return getBillingConfig(ctx.user.organizationId);
  }),

  /**
   * Update billing configuration
   */
  updateBillingConfig: billerProcedure
    .input(
      z.object({
        maxRetryAttempts: z.number().int().min(1).max(10).optional(),
        retryIntervalDays: z.number().int().min(1).max(14).optional(),
        reminderDaysBeforeDue: z.number().int().min(1).max(14).optional(),
        sendReminders: z.boolean().optional(),
        alertStaffOnFailure: z.boolean().optional(),
        staffAlertEmail: z.string().email().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { updateBillingConfig } = await import('@/lib/payment/plan-billing-scheduler');
      await updateBillingConfig(ctx.user.organizationId, input);

      await auditLog(PAYMENT_AUDIT_ACTIONS.PAYMENT_PLAN_UPDATE, 'Organization', {
        entityId: ctx.user.organizationId,
        changes: {
          action: 'update_billing_config',
          ...input,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  /**
   * Manually trigger billing job (for testing or manual runs)
   * In production, this would be called by a cron job
   */
  runBillingJob: billerProcedure
    .input(
      z.object({
        dryRun: z.boolean().default(false),
      }).optional()
    )
    .mutation(async ({ ctx, input }) => {
      const { processDueInstallments, getBillingConfig } = await import(
        '@/lib/payment/plan-billing-scheduler'
      );

      // Get org config
      const config = await getBillingConfig(ctx.user.organizationId);

      if (input?.dryRun) {
        // In dry run mode, just return what would be processed
        const dueCount = await ctx.prisma.paymentPlanInstallment.count({
          where: {
            status: InstallmentStatus.SCHEDULED,
            dueDate: { lte: new Date() },
            paymentPlan: {
              organizationId: ctx.user.organizationId,
              status: PaymentPlanStatus.ACTIVE,
            },
          },
        });

        const retryCount = await ctx.prisma.paymentPlanInstallment.count({
          where: {
            status: InstallmentStatus.FAILED,
            attemptCount: { lt: config?.maxRetryAttempts ?? 3 },
            nextRetryAt: { lte: new Date() },
            paymentPlan: {
              organizationId: ctx.user.organizationId,
              status: PaymentPlanStatus.ACTIVE,
            },
          },
        });

        return {
          dryRun: true,
          wouldProcess: {
            dueInstallments: dueCount,
            retryInstallments: retryCount,
            total: dueCount + retryCount,
          },
        };
      }

      // Run the actual billing job
      const result = await processDueInstallments(config || undefined);

      await auditLog(PAYMENT_AUDIT_ACTIONS.PAYMENT_PLAN_UPDATE, 'Organization', {
        entityId: ctx.user.organizationId,
        changes: {
          action: 'manual_billing_job_run',
          result: {
            processed: result.processedInstallments,
            successful: result.successfulPayments,
            failed: result.failedPayments,
            retried: result.retriedPayments,
            completed: result.completedPlans,
            reminders: result.remindersSent,
          },
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        dryRun: false,
        result,
      };
    }),

  /**
   * Get upcoming installments that will be processed
   */
  getUpcomingBillingItems: protectedProcedure
    .input(
      z.object({
        daysAhead: z.number().int().min(1).max(30).default(7),
      })
    )
    .query(async ({ ctx, input }) => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + input.daysAhead);

      const installments = await ctx.prisma.paymentPlanInstallment.findMany({
        where: {
          status: { in: [InstallmentStatus.SCHEDULED, InstallmentStatus.FAILED] },
          OR: [
            {
              status: InstallmentStatus.SCHEDULED,
              dueDate: { lte: futureDate },
            },
            {
              status: InstallmentStatus.FAILED,
              nextRetryAt: { lte: futureDate },
            },
          ],
          paymentPlan: {
            organizationId: ctx.user.organizationId,
            status: PaymentPlanStatus.ACTIVE,
          },
        },
        include: {
          paymentPlan: {
            include: {
              patient: {
                include: { demographics: true },
              },
            },
          },
        },
        orderBy: [
          { status: 'asc' }, // Failed first (need attention)
          { dueDate: 'asc' },
        ],
      });

      const now = new Date();
      return installments.map((i) => ({
        installmentId: i.id,
        planId: i.paymentPlanId,
        planName: i.paymentPlan.name,
        patientId: i.paymentPlan.patientId,
        patientName: i.paymentPlan.patient.demographics
          ? `${i.paymentPlan.patient.demographics.firstName} ${i.paymentPlan.patient.demographics.lastName}`
          : 'Unknown Patient',
        installmentNumber: i.installmentNumber,
        totalInstallments: i.paymentPlan.numberOfInstallments,
        amount: Number(i.amount),
        dueDate: i.dueDate,
        status: i.status,
        isOverdue: i.status === InstallmentStatus.SCHEDULED && i.dueDate < now,
        isRetry: i.status === InstallmentStatus.FAILED,
        attemptCount: i.attemptCount,
        nextRetryAt: i.nextRetryAt,
      }));
    }),

  /**
   * Get billing job history/stats
   */
  getBillingStats: billerProcedure
    .input(
      z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { startDate = new Date(new Date().setDate(1)), endDate = new Date() } = input;

      const [
        totalPlansActive,
        installmentsPaidInPeriod,
        installmentsFailedInPeriod,
        plansCompletedInPeriod,
        totalAmountCollected,
        upcomingDue,
      ] = await Promise.all([
        // Active plans
        ctx.prisma.paymentPlan.count({
          where: {
            organizationId: ctx.user.organizationId,
            status: PaymentPlanStatus.ACTIVE,
          },
        }),
        // Installments paid in period
        ctx.prisma.paymentPlanInstallment.count({
          where: {
            paymentPlan: { organizationId: ctx.user.organizationId },
            status: InstallmentStatus.PAID,
            paidAt: { gte: startDate, lte: endDate },
          },
        }),
        // Installments failed (currently in failed state)
        ctx.prisma.paymentPlanInstallment.count({
          where: {
            paymentPlan: { organizationId: ctx.user.organizationId },
            status: InstallmentStatus.FAILED,
          },
        }),
        // Plans completed in period
        ctx.prisma.paymentPlan.count({
          where: {
            organizationId: ctx.user.organizationId,
            status: PaymentPlanStatus.COMPLETED,
            endDate: { gte: startDate, lte: endDate },
          },
        }),
        // Total amount collected
        ctx.prisma.paymentPlanInstallment.aggregate({
          where: {
            paymentPlan: { organizationId: ctx.user.organizationId },
            status: InstallmentStatus.PAID,
            paidAt: { gte: startDate, lte: endDate },
          },
          _sum: { paidAmount: true },
        }),
        // Upcoming due (next 7 days)
        ctx.prisma.paymentPlanInstallment.count({
          where: {
            paymentPlan: {
              organizationId: ctx.user.organizationId,
              status: PaymentPlanStatus.ACTIVE,
            },
            status: InstallmentStatus.SCHEDULED,
            dueDate: {
              gte: new Date(),
              lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
          },
        }),
      ]);

      return {
        periodStart: startDate,
        periodEnd: endDate,
        activePlans: totalPlansActive,
        installmentsPaid: installmentsPaidInPeriod,
        installmentsFailed: installmentsFailedInPeriod,
        plansCompleted: plansCompletedInPeriod,
        amountCollected: Number(totalAmountCollected._sum.paidAmount ?? 0),
        upcomingDue,
      };
    }),
});

// Helper function to map card type to existing PaymentMethod enum
function mapCardTypeToPaymentMethod(cardType: CardType): PrismaPaymentMethod {
  switch (cardType) {
    case 'DEBIT':
      return PrismaPaymentMethod.DEBIT_CARD;
    case 'HSA':
    case 'FSA':
    case 'CREDIT':
    default:
      return PrismaPaymentMethod.CREDIT_CARD;
  }
}
