import { z } from 'zod';
import { router, protectedProcedure, billerProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import { PaymentMethod, ChargeStatus } from '@prisma/client';

export const paymentRouter = router({
  // Post new payment
  create: billerProcedure
    .input(
      z.object({
        patientId: z.string(),
        amount: z.number().positive('Amount must be positive'),
        paymentMethod: z.nativeEnum(PaymentMethod),
        referenceNumber: z.string().optional(),
        payerType: z.enum(['patient', 'insurance', 'other']).default('patient'),
        payerName: z.string().optional(),
        checkNumber: z.string().optional(),
        checkDate: z.date().optional(),
        notes: z.string().optional(),
        paymentDate: z.date().default(() => new Date()),
        // Optional: auto-apply to specific charges
        applyTo: z
          .array(
            z.object({
              chargeId: z.string(),
              amount: z.number().positive(),
            })
          )
          .optional(),
        // Optional: auto-allocate to oldest charges
        autoAllocate: z.boolean().default(false),
        // If from insurance
        claimId: z.string().optional(),
        eobDate: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        patientId,
        amount,
        paymentMethod,
        payerType,
        applyTo,
        autoAllocate,
        claimId,
        ...paymentData
      } = input;

      // Verify patient belongs to org
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

      // Calculate unapplied amount
      let unappliedAmount = amount;
      const allocations: { chargeId: string; amount: number }[] = [];

      // If applyTo is provided, validate and prepare allocations
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
        // Get unpaid charges for patient, oldest first
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

      // Create payment with allocations in transaction
      const result = await ctx.prisma.$transaction(async (tx) => {
        // Create the payment
        const payment = await tx.payment.create({
          data: {
            patientId,
            organizationId: ctx.user.organizationId,
            amount,
            paymentMethod,
            payerType,
            unappliedAmount,
            claimId,
            ...paymentData,
          },
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

          // Update charge
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

      await auditLog('PAYMENT_CREATE', 'Payment', {
        entityId: result.id,
        changes: { patientId, amount, paymentMethod, allocations: allocations.length },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return result;
    }),

  // Update payment details (not allocations)
  update: billerProcedure
    .input(
      z.object({
        id: z.string(),
        referenceNumber: z.string().nullable().optional(),
        checkNumber: z.string().nullable().optional(),
        checkDate: z.date().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      const existing = await ctx.prisma.payment.findFirst({
        where: {
          id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Payment not found',
        });
      }

      if (existing.isVoid) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot update a voided payment',
        });
      }

      const payment = await ctx.prisma.payment.update({
        where: { id },
        data: updateData,
      });

      await auditLog('PAYMENT_UPDATE', 'Payment', {
        entityId: id,
        changes: updateData,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return payment;
    }),

  // List payments
  list: protectedProcedure
    .input(
      z.object({
        patientId: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        paymentMethod: z.nativeEnum(PaymentMethod).optional(),
        payerType: z.enum(['patient', 'insurance', 'other']).optional(),
        includeVoid: z.boolean().default(false),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, startDate, endDate, paymentMethod, payerType, includeVoid, page, limit } = input;

      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
      };

      if (patientId) where.patientId = patientId;
      if (paymentMethod) where.paymentMethod = paymentMethod;
      if (payerType) where.payerType = payerType;
      if (!includeVoid) where.isVoid = false;

      if (startDate || endDate) {
        where.paymentDate = {};
        if (startDate) (where.paymentDate as Record<string, Date>).gte = startDate;
        if (endDate) (where.paymentDate as Record<string, Date>).lte = endDate;
      }

      const [payments, total] = await Promise.all([
        ctx.prisma.payment.findMany({
          where,
          include: {
            patient: {
              include: { demographics: true },
            },
            allocations: {
              include: { charge: true },
            },
          },
          orderBy: { paymentDate: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        ctx.prisma.payment.count({ where }),
      ]);

      return {
        payments,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }),

  // Get payment with allocations
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const payment = await ctx.prisma.payment.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            include: { demographics: true },
          },
          allocations: {
            include: {
              charge: {
                include: { encounter: true },
              },
            },
          },
          claim: true,
        },
      });

      if (!payment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Payment not found',
        });
      }

      return payment;
    }),

  // Void payment
  void: billerProcedure
    .input(
      z.object({
        id: z.string(),
        reason: z.string().min(1, 'Void reason is required'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, reason } = input;

      const existing = await ctx.prisma.payment.findFirst({
        where: {
          id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          allocations: true,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Payment not found',
        });
      }

      if (existing.isVoid) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Payment is already voided',
        });
      }

      // Reverse all allocations and void payment in transaction
      await ctx.prisma.$transaction(async (tx) => {
        // Reverse each allocation
        for (const allocation of existing.allocations) {
          const charge = await tx.charge.findUnique({ where: { id: allocation.chargeId } });
          if (charge) {
            const newPayments = Number(charge.payments) - Number(allocation.amount);
            const newBalance = Number(charge.fee) * charge.units - newPayments - Number(charge.adjustments);

            await tx.charge.update({
              where: { id: allocation.chargeId },
              data: {
                payments: Math.max(0, newPayments),
                balance: newBalance,
                status: charge.status === ChargeStatus.PAID ? ChargeStatus.BILLED : charge.status,
              },
            });
          }
        }

        // Delete allocations
        await tx.paymentAllocation.deleteMany({
          where: { paymentId: id },
        });

        // Void payment
        await tx.payment.update({
          where: { id },
          data: {
            isVoid: true,
            voidReason: reason,
            voidedAt: new Date(),
            voidedBy: ctx.user.id,
            unappliedAmount: 0,
          },
        });
      });

      await auditLog('PAYMENT_VOID', 'Payment', {
        entityId: id,
        changes: { reason, amount: existing.amount, allocations: existing.allocations.length },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // Apply payment to specific charges
  applyToCharges: billerProcedure
    .input(
      z.object({
        paymentId: z.string(),
        allocations: z.array(
          z.object({
            chargeId: z.string(),
            amount: z.number().positive(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { paymentId, allocations } = input;

      const payment = await ctx.prisma.payment.findFirst({
        where: {
          id: paymentId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!payment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Payment not found',
        });
      }

      if (payment.isVoid) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot apply a voided payment',
        });
      }

      const totalToApply = allocations.reduce((sum, a) => sum + a.amount, 0);
      if (totalToApply > Number(payment.unappliedAmount)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot apply $${totalToApply}. Only $${payment.unappliedAmount} unapplied.`,
        });
      }

      // Validate charges
      const chargeIds = allocations.map((a) => a.chargeId);
      const charges = await ctx.prisma.charge.findMany({
        where: {
          id: { in: chargeIds },
          organizationId: ctx.user.organizationId,
          status: { not: ChargeStatus.VOID },
        },
      });

      if (charges.length !== chargeIds.length) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'One or more charges not found',
        });
      }

      const chargeMap = new Map(charges.map((c) => [c.id, c]));

      // Apply in transaction
      await ctx.prisma.$transaction(async (tx) => {
        for (const allocation of allocations) {
          const charge = chargeMap.get(allocation.chargeId)!;

          if (allocation.amount > Number(charge.balance)) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Payment amount $${allocation.amount} exceeds balance $${charge.balance} for charge`,
            });
          }

          // Create allocation
          await tx.paymentAllocation.create({
            data: {
              paymentId,
              chargeId: allocation.chargeId,
              amount: allocation.amount,
            },
          });

          // Update charge
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

        // Update payment unapplied amount
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            unappliedAmount: Number(payment.unappliedAmount) - totalToApply,
          },
        });
      });

      await auditLog('PAYMENT_APPLY', 'Payment', {
        entityId: paymentId,
        changes: { allocations: allocations.length, totalApplied: totalToApply },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // Unapply payment from charges
  unapplyFromCharge: billerProcedure
    .input(
      z.object({
        allocationId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const allocation = await ctx.prisma.paymentAllocation.findFirst({
        where: {
          id: input.allocationId,
          payment: { organizationId: ctx.user.organizationId },
        },
        include: {
          payment: true,
          charge: true,
        },
      });

      if (!allocation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Allocation not found',
        });
      }

      if (allocation.payment.isVoid) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot unapply from a voided payment',
        });
      }

      // Unapply in transaction
      await ctx.prisma.$transaction(async (tx) => {
        // Update charge
        const charge = allocation.charge;
        const newPayments = Number(charge.payments) - Number(allocation.amount);
        const newBalance = Number(charge.fee) * charge.units - newPayments - Number(charge.adjustments);

        await tx.charge.update({
          where: { id: charge.id },
          data: {
            payments: Math.max(0, newPayments),
            balance: newBalance,
            status: charge.status === ChargeStatus.PAID ? ChargeStatus.BILLED : charge.status,
          },
        });

        // Update payment unapplied amount
        await tx.payment.update({
          where: { id: allocation.paymentId },
          data: {
            unappliedAmount: Number(allocation.payment.unappliedAmount) + Number(allocation.amount),
          },
        });

        // Delete allocation
        await tx.paymentAllocation.delete({
          where: { id: input.allocationId },
        });
      });

      await auditLog('PAYMENT_UNAPPLY', 'Payment', {
        entityId: allocation.paymentId,
        changes: { chargeId: allocation.chargeId, amount: allocation.amount },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // Get recent payments for dashboard
  getRecent: billerProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(10) }))
    .query(async ({ ctx, input }) => {
      const payments = await ctx.prisma.payment.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          isVoid: false,
        },
        include: {
          patient: {
            include: { demographics: true },
          },
        },
        orderBy: { paymentDate: 'desc' },
        take: input.limit,
      });

      return payments;
    }),

  // Get daily collections summary
  getDailyCollections: billerProcedure
    .input(
      z.object({
        date: z.date().default(() => new Date()),
      })
    )
    .query(async ({ ctx, input }) => {
      const startOfDay = new Date(input.date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(input.date);
      endOfDay.setHours(23, 59, 59, 999);

      const payments = await ctx.prisma.payment.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          isVoid: false,
          paymentDate: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      });

      const byMethod = payments.reduce(
        (acc, p) => {
          const method = p.paymentMethod;
          if (!acc[method]) {
            acc[method] = { count: 0, total: 0 };
          }
          acc[method].count++;
          acc[method].total += Number(p.amount);
          return acc;
        },
        {} as Record<string, { count: number; total: number }>
      );

      const byPayerType = payments.reduce(
        (acc, p) => {
          const type = p.payerType;
          if (!acc[type]) {
            acc[type] = { count: 0, total: 0 };
          }
          acc[type].count++;
          acc[type].total += Number(p.amount);
          return acc;
        },
        {} as Record<string, { count: number; total: number }>
      );

      return {
        date: input.date,
        totalPayments: payments.length,
        totalAmount: payments.reduce((sum, p) => sum + Number(p.amount), 0),
        byMethod,
        byPayerType,
      };
    }),
});
