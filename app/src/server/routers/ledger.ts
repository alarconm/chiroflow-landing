import { z } from 'zod';
import { router, protectedProcedure, billerProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import { ChargeStatus } from '@prisma/client';

export const ledgerRouter = router({
  // Get complete patient ledger
  getByPatient: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        includeVoid: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, startDate, endDate, includeVoid } = input;

      // Verify patient belongs to org
      const patient = await ctx.prisma.patient.findFirst({
        where: { id: patientId, organizationId: ctx.user.organizationId },
        include: { demographics: true },
      });

      if (!patient) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Patient not found' });
      }

      // Build date filter
      const dateFilter: Record<string, unknown> = {};
      if (startDate) dateFilter.gte = startDate;
      if (endDate) dateFilter.lte = endDate;
      const hasDateFilter = Object.keys(dateFilter).length > 0;

      // Get all charges
      const chargeWhere: Record<string, unknown> = {
        patientId,
        organizationId: ctx.user.organizationId,
      };
      if (!includeVoid) chargeWhere.status = { not: ChargeStatus.VOID };
      if (hasDateFilter) chargeWhere.serviceDate = dateFilter;

      const charges = await ctx.prisma.charge.findMany({
        where: chargeWhere,
        include: {
          encounter: true,
          provider: { include: { user: true } },
        },
        orderBy: { serviceDate: 'asc' },
      });

      // Get all payments
      const paymentWhere: Record<string, unknown> = {
        patientId,
        organizationId: ctx.user.organizationId,
      };
      if (!includeVoid) paymentWhere.isVoid = false;
      if (hasDateFilter) paymentWhere.paymentDate = dateFilter;

      const payments = await ctx.prisma.payment.findMany({
        where: paymentWhere,
        include: {
          allocations: { include: { charge: true } },
        },
        orderBy: { paymentDate: 'asc' },
      });

      // Combine into ledger entries
      type LedgerEntry = {
        id: string;
        date: Date;
        type: 'charge' | 'payment' | 'adjustment';
        description: string;
        charges: number;
        payments: number;
        adjustments: number;
        balance: number;
        reference?: string;
        status?: string;
      };

      const entries: LedgerEntry[] = [];

      // Add charges
      for (const charge of charges) {
        entries.push({
          id: charge.id,
          date: charge.serviceDate,
          type: 'charge',
          description: `${charge.cptCode} - ${charge.description}`,
          charges: Number(charge.fee) * charge.units,
          payments: 0,
          adjustments: 0,
          balance: 0, // Will calculate running balance later
          reference: charge.encounter?.id,
          status: charge.status,
        });

        // Add adjustment if any
        if (Number(charge.adjustments) > 0) {
          entries.push({
            id: `${charge.id}-adj`,
            date: charge.updatedAt,
            type: 'adjustment',
            description: `Adjustment for ${charge.cptCode}`,
            charges: 0,
            payments: 0,
            adjustments: Number(charge.adjustments),
            balance: 0,
            reference: charge.id,
          });
        }
      }

      // Add payments
      for (const payment of payments) {
        entries.push({
          id: payment.id,
          date: payment.paymentDate,
          type: 'payment',
          description: `${payment.payerType === 'patient' ? 'Patient' : 'Insurance'} Payment - ${payment.paymentMethod}`,
          charges: 0,
          payments: Number(payment.amount),
          adjustments: 0,
          balance: 0,
          reference: payment.referenceNumber || undefined,
          status: payment.isVoid ? 'VOID' : 'POSTED',
        });
      }

      // Sort by date
      entries.sort((a, b) => a.date.getTime() - b.date.getTime());

      // Calculate running balance
      let runningBalance = 0;
      for (const entry of entries) {
        runningBalance += entry.charges - entry.payments - entry.adjustments;
        entry.balance = runningBalance;
      }

      // Calculate totals
      const totals = {
        totalCharges: entries.reduce((sum, e) => sum + e.charges, 0),
        totalPayments: entries.reduce((sum, e) => sum + e.payments, 0),
        totalAdjustments: entries.reduce((sum, e) => sum + e.adjustments, 0),
        currentBalance: runningBalance,
      };

      return {
        patient,
        entries,
        totals,
      };
    }),

  // Get current patient balance
  getBalance: protectedProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      const patient = await ctx.prisma.patient.findFirst({
        where: { id: input.patientId, organizationId: ctx.user.organizationId },
      });

      if (!patient) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Patient not found' });
      }

      // Sum of all charge balances
      const chargeResult = await ctx.prisma.charge.aggregate({
        where: {
          patientId: input.patientId,
          organizationId: ctx.user.organizationId,
          status: { not: ChargeStatus.VOID },
        },
        _sum: { balance: true },
      });

      // Unapplied payments (credit balance)
      const paymentResult = await ctx.prisma.payment.aggregate({
        where: {
          patientId: input.patientId,
          organizationId: ctx.user.organizationId,
          isVoid: false,
        },
        _sum: { unappliedAmount: true },
      });

      const chargeBalance = Number(chargeResult._sum.balance || 0);
      const creditBalance = Number(paymentResult._sum.unappliedAmount || 0);

      return {
        patientId: input.patientId,
        chargeBalance,
        creditBalance,
        netBalance: chargeBalance - creditBalance,
      };
    }),

  // Get transactions with pagination
  getTransactions: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(25),
        type: z.enum(['all', 'charges', 'payments']).default('all'),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, page, limit, type, startDate, endDate } = input;

      const patient = await ctx.prisma.patient.findFirst({
        where: { id: patientId, organizationId: ctx.user.organizationId },
      });

      if (!patient) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Patient not found' });
      }

      type Transaction = {
        id: string;
        date: Date;
        type: 'charge' | 'payment';
        description: string;
        amount: number;
        balance?: number;
        status: string;
        details: unknown;
      };

      const transactions: Transaction[] = [];

      if (type === 'all' || type === 'charges') {
        const chargeWhere: Record<string, unknown> = {
          patientId,
          organizationId: ctx.user.organizationId,
          status: { not: ChargeStatus.VOID },
        };
        if (startDate || endDate) {
          chargeWhere.serviceDate = {};
          if (startDate) (chargeWhere.serviceDate as Record<string, Date>).gte = startDate;
          if (endDate) (chargeWhere.serviceDate as Record<string, Date>).lte = endDate;
        }

        const charges = await ctx.prisma.charge.findMany({
          where: chargeWhere,
          include: { encounter: true },
        });

        charges.forEach((c) => {
          transactions.push({
            id: c.id,
            date: c.serviceDate,
            type: 'charge',
            description: `${c.cptCode} - ${c.description}`,
            amount: Number(c.fee) * c.units,
            balance: Number(c.balance),
            status: c.status,
            details: c,
          });
        });
      }

      if (type === 'all' || type === 'payments') {
        const paymentWhere: Record<string, unknown> = {
          patientId,
          organizationId: ctx.user.organizationId,
          isVoid: false,
        };
        if (startDate || endDate) {
          paymentWhere.paymentDate = {};
          if (startDate) (paymentWhere.paymentDate as Record<string, Date>).gte = startDate;
          if (endDate) (paymentWhere.paymentDate as Record<string, Date>).lte = endDate;
        }

        const payments = await ctx.prisma.payment.findMany({
          where: paymentWhere,
          include: { allocations: true },
        });

        payments.forEach((p) => {
          transactions.push({
            id: p.id,
            date: p.paymentDate,
            type: 'payment',
            description: `${p.payerType === 'patient' ? 'Patient' : 'Insurance'} Payment`,
            amount: Number(p.amount),
            status: 'POSTED',
            details: p,
          });
        });
      }

      // Sort by date desc
      transactions.sort((a, b) => b.date.getTime() - a.date.getTime());

      // Paginate
      const total = transactions.length;
      const paginatedTransactions = transactions.slice((page - 1) * limit, page * limit);

      return {
        transactions: paginatedTransactions,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }),

  // Generate patient statement data (for PDF generation)
  generateStatement: billerProcedure
    .input(
      z.object({
        patientId: z.string(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        includeZeroBalance: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, startDate, endDate, includeZeroBalance } = input;

      // Get patient with contact info
      const patient = await ctx.prisma.patient.findFirst({
        where: { id: patientId, organizationId: ctx.user.organizationId },
        include: {
          demographics: true,
          contacts: { where: { isPrimary: true } },
        },
      });

      if (!patient) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Patient not found' });
      }

      // Get organization info
      const org = await ctx.prisma.organization.findUnique({
        where: { id: ctx.user.organizationId },
      });

      // Build charge filter
      const chargeWhere: Record<string, unknown> = {
        patientId,
        organizationId: ctx.user.organizationId,
        status: { not: ChargeStatus.VOID },
      };
      if (!includeZeroBalance) {
        chargeWhere.balance = { gt: 0 };
      }
      if (startDate || endDate) {
        chargeWhere.serviceDate = {};
        if (startDate) (chargeWhere.serviceDate as Record<string, Date>).gte = startDate;
        if (endDate) (chargeWhere.serviceDate as Record<string, Date>).lte = endDate;
      }

      // Get charges
      const charges = await ctx.prisma.charge.findMany({
        where: chargeWhere,
        include: {
          provider: { include: { user: true } },
          paymentAllocations: {
            include: { payment: true },
          },
        },
        orderBy: { serviceDate: 'asc' },
      });

      // Calculate aging buckets
      const today = new Date();
      const aging = {
        current: 0,
        thirtyDays: 0,
        sixtyDays: 0,
        ninetyDays: 0,
        over90: 0,
      };

      const statementLines = charges.map((charge) => {
        const daysOld = Math.floor(
          (today.getTime() - charge.serviceDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        const balance = Number(charge.balance);

        // Add to aging bucket
        if (daysOld <= 30) aging.current += balance;
        else if (daysOld <= 60) aging.thirtyDays += balance;
        else if (daysOld <= 90) aging.sixtyDays += balance;
        else if (daysOld <= 120) aging.ninetyDays += balance;
        else aging.over90 += balance;

        return {
          date: charge.serviceDate,
          description: `${charge.cptCode} - ${charge.description}`,
          provider: charge.provider?.user
            ? `${charge.provider.user.firstName} ${charge.provider.user.lastName}`
            : 'Provider',
          charges: Number(charge.fee) * charge.units,
          payments: Number(charge.payments),
          adjustments: Number(charge.adjustments),
          balance,
          daysOld,
        };
      });

      // Get total balance
      const totalBalance = statementLines.reduce((sum, l) => sum + l.balance, 0);

      // Generate statement number
      const statementNumber = `STM-${Date.now()}`;

      // Log statement generation
      await auditLog('STATEMENT_GENERATE', 'Patient', {
        entityId: patientId,
        changes: { statementNumber, totalBalance, lineCount: statementLines.length },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        statementNumber,
        statementDate: new Date(),
        organization: org,
        patient: {
          name: patient.demographics
            ? `${patient.demographics.firstName} ${patient.demographics.lastName}`
            : 'Patient',
          address: patient.contacts[0],
          mrn: patient.mrn,
        },
        lines: statementLines,
        aging,
        totals: {
          totalCharges: statementLines.reduce((sum, l) => sum + l.charges, 0),
          totalPayments: statementLines.reduce((sum, l) => sum + l.payments, 0),
          totalAdjustments: statementLines.reduce((sum, l) => sum + l.adjustments, 0),
          totalBalance,
        },
        message:
          totalBalance > 0
            ? 'Please remit payment promptly. If you have questions about your bill, please contact our office.'
            : 'Thank you for your payment. Your account balance is $0.00.',
      };
    }),

  // List generated statements (tracking)
  listStatements: protectedProcedure
    .input(
      z.object({
        patientId: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(25),
      })
    )
    .query(async ({ ctx, input }) => {
      // Note: For full implementation, you would need a Statement model to track generated statements
      // This is a simplified version that returns recent audit logs of statement generation
      const { patientId, startDate, endDate, page, limit } = input;

      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
        action: 'STATEMENT_GENERATE',
        entityType: 'Patient',
      };

      if (patientId) where.entityId = patientId;

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) (where.createdAt as Record<string, Date>).gte = startDate;
        if (endDate) (where.createdAt as Record<string, Date>).lte = endDate;
      }

      const [logs, total] = await Promise.all([
        ctx.prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        ctx.prisma.auditLog.count({ where }),
      ]);

      return {
        statements: logs.map((log) => ({
          id: log.id,
          patientId: log.entityId,
          generatedAt: log.createdAt,
          generatedBy: log.userId,
          details: log.changes,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }),

  // Get AR aging report
  getAgingReport: billerProcedure
    .input(
      z.object({
        asOfDate: z.date().default(() => new Date()),
        providerId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { asOfDate, providerId } = input;

      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
        status: { not: ChargeStatus.VOID },
        balance: { gt: 0 },
      };

      if (providerId) where.providerId = providerId;

      const charges = await ctx.prisma.charge.findMany({
        where,
        include: {
          patient: { include: { demographics: true } },
        },
      });

      // Calculate aging buckets by patient
      const patientAging: Record<
        string,
        {
          patient: { id: string; name: string; mrn: string };
          current: number;
          thirtyDays: number;
          sixtyDays: number;
          ninetyDays: number;
          over90: number;
          total: number;
        }
      > = {};

      for (const charge of charges) {
        const daysOld = Math.floor(
          (asOfDate.getTime() - charge.serviceDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        const balance = Number(charge.balance);
        const patientId = charge.patientId;

        if (!patientAging[patientId]) {
          patientAging[patientId] = {
            patient: {
              id: patientId,
              name: charge.patient.demographics
                ? `${charge.patient.demographics.lastName}, ${charge.patient.demographics.firstName}`
                : 'Unknown',
              mrn: charge.patient.mrn,
            },
            current: 0,
            thirtyDays: 0,
            sixtyDays: 0,
            ninetyDays: 0,
            over90: 0,
            total: 0,
          };
        }

        if (daysOld <= 30) patientAging[patientId].current += balance;
        else if (daysOld <= 60) patientAging[patientId].thirtyDays += balance;
        else if (daysOld <= 90) patientAging[patientId].sixtyDays += balance;
        else if (daysOld <= 120) patientAging[patientId].ninetyDays += balance;
        else patientAging[patientId].over90 += balance;

        patientAging[patientId].total += balance;
      }

      const patients = Object.values(patientAging).sort((a, b) => b.total - a.total);

      // Calculate totals
      const totals = patients.reduce(
        (acc, p) => ({
          current: acc.current + p.current,
          thirtyDays: acc.thirtyDays + p.thirtyDays,
          sixtyDays: acc.sixtyDays + p.sixtyDays,
          ninetyDays: acc.ninetyDays + p.ninetyDays,
          over90: acc.over90 + p.over90,
          total: acc.total + p.total,
        }),
        { current: 0, thirtyDays: 0, sixtyDays: 0, ninetyDays: 0, over90: 0, total: 0 }
      );

      return {
        asOfDate,
        patients,
        totals,
        patientCount: patients.length,
      };
    }),
});
