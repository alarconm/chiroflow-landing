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
} from '@/lib/payment';

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
          processorId: result.transactionId,
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
            processorId: result.transactionId,
            allocations: allocations.length,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

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

      // Get original transaction
      const originalTransaction = await ctx.prisma.paymentTransaction.findFirst({
        where: {
          id: transactionId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          payment: true,
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

      // Process refund with provider
      const provider = await getPaymentProvider();
      const result = await provider.processRefund({
        transactionId: originalTransaction.processorId!,
        amount: toCents(refundAmount),
        reason,
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.errorMessage ?? 'Refund failed',
        });
      }

      // Create refund records in transaction
      const [refundTransaction, refundRecord] = await ctx.prisma.$transaction(async (tx) => {
        // Create refund transaction
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
            processorId: result.refundId,
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
            status:
              refundAmount === Number(originalTransaction.amount)
                ? PaymentTransactionStatus.REFUNDED
                : PaymentTransactionStatus.PARTIALLY_REFUNDED,
          },
        });

        // If there's a linked payment, void it or adjust
        if (originalTransaction.payment) {
          // This is simplified - in production, you'd need to reverse allocations
          await tx.payment.update({
            where: { id: originalTransaction.payment.id },
            data: {
              isVoid: true,
              voidReason: `Refunded: ${reason}`,
              voidedAt: new Date(),
              voidedBy: ctx.user.id,
            },
          });
        }

        return [refundTx, refund];
      });

      await auditLog(PAYMENT_AUDIT_ACTIONS.PAYMENT_REFUND, 'Refund', {
        entityId: refundRecord.id,
        changes: {
          originalTransactionId: transactionId,
          amount: refundAmount,
          reason,
          processorRefundId: result.refundId,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        refundId: refundRecord.id,
        transactionId: refundTransaction.id,
        amount: refundAmount,
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
