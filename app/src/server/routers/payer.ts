import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';

export const payerRouter = router({
  // Create new insurance payer
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1, 'Name is required'),
        payerId: z.string().optional(), // EDI payer ID
        electronicPayerId: z.string().optional(),
        address1: z.string().optional(),
        address2: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        zip: z.string().optional(),
        phone: z.string().optional(),
        fax: z.string().optional(),
        website: z.string().optional(),
        claimSubmissionMethod: z.enum(['electronic', 'paper', 'portal']).default('electronic'),
        acceptsEdi: z.boolean().default(true),
        timelyFilingDays: z.number().min(1).default(90),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check if payer ID already exists (if provided)
      if (input.payerId) {
        const existing = await ctx.prisma.insurancePayer.findFirst({
          where: { payerId: input.payerId },
        });

        if (existing) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Payer with ID ${input.payerId} already exists`,
          });
        }
      }

      const payer = await ctx.prisma.insurancePayer.create({
        data: {
          ...input,
        },
      });

      await auditLog('PAYER_CREATE', 'InsurancePayer', {
        entityId: payer.id,
        changes: { name: input.name, payerId: input.payerId },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return payer;
    }),

  // Update payer details
  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        payerId: z.string().nullable().optional(),
        electronicPayerId: z.string().nullable().optional(),
        address1: z.string().nullable().optional(),
        address2: z.string().nullable().optional(),
        city: z.string().nullable().optional(),
        state: z.string().nullable().optional(),
        zip: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        fax: z.string().nullable().optional(),
        website: z.string().nullable().optional(),
        claimSubmissionMethod: z.enum(['electronic', 'paper', 'portal']).optional(),
        acceptsEdi: z.boolean().optional(),
        timelyFilingDays: z.number().min(1).optional(),
        notes: z.string().nullable().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      const existing = await ctx.prisma.insurancePayer.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Payer not found',
        });
      }

      // Check for duplicate payer ID if being changed
      if (updateData.payerId && updateData.payerId !== existing.payerId) {
        const duplicate = await ctx.prisma.insurancePayer.findFirst({
          where: { payerId: updateData.payerId },
        });

        if (duplicate) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Payer with ID ${updateData.payerId} already exists`,
          });
        }
      }

      const payer = await ctx.prisma.insurancePayer.update({
        where: { id },
        data: updateData,
      });

      await auditLog('PAYER_UPDATE', 'InsurancePayer', {
        entityId: id,
        changes: updateData,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return payer;
    }),

  // List all payers with search/filter
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        isActive: z.boolean().optional(),
        acceptsEdi: z.boolean().optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const { search, isActive, acceptsEdi, page, limit } = input;

      const where: Record<string, unknown> = {};

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { payerId: { contains: search, mode: 'insensitive' } },
        ];
      }

      if (isActive !== undefined) {
        where.isActive = isActive;
      }

      if (acceptsEdi !== undefined) {
        where.acceptsEdi = acceptsEdi;
      }

      const [payers, total] = await Promise.all([
        ctx.prisma.insurancePayer.findMany({
          where,
          orderBy: { name: 'asc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        ctx.prisma.insurancePayer.count({ where }),
      ]);

      return {
        payers,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }),

  // Get payer details with submission requirements
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const payer = await ctx.prisma.insurancePayer.findUnique({
        where: { id: input.id },
        include: {
          _count: {
            select: {
              patientInsurances: true,
              claims: true,
            },
          },
        },
      });

      if (!payer) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Payer not found',
        });
      }

      return payer;
    }),

  // Soft delete payer (set isActive = false)
  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.insurancePayer.findUnique({
        where: { id: input.id },
        include: {
          _count: {
            select: {
              claims: { where: { status: { notIn: ['PAID', 'DENIED', 'VOID'] } } },
            },
          },
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Payer not found',
        });
      }

      // Check for active claims
      if (existing._count.claims > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot deactivate payer with active claims',
        });
      }

      const payer = await ctx.prisma.insurancePayer.update({
        where: { id: input.id },
        data: { isActive: false },
      });

      await auditLog('PAYER_DEACTIVATE', 'InsurancePayer', {
        entityId: input.id,
        changes: { isActive: false },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return payer;
    }),

  // Reactivate a payer
  reactivate: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const payer = await ctx.prisma.insurancePayer.update({
        where: { id: input.id },
        data: { isActive: true },
      });

      await auditLog('PAYER_REACTIVATE', 'InsurancePayer', {
        entityId: input.id,
        changes: { isActive: true },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return payer;
    }),

  // Get common payers (Medicare, Medicaid, major insurers)
  getCommonPayers: protectedProcedure.query(async ({ ctx }) => {
    // Return payers that are commonly used
    const payers = await ctx.prisma.insurancePayer.findMany({
      where: {
        isActive: true,
        payerId: { not: null },
      },
      orderBy: { name: 'asc' },
      take: 20,
    });

    return payers;
  }),

  // Search payers by name or ID
  search: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1),
        limit: z.number().min(1).max(20).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const { query, limit } = input;

      const payers = await ctx.prisma.insurancePayer.findMany({
        where: {
          isActive: true,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { payerId: { contains: query, mode: 'insensitive' } },
          ],
        },
        orderBy: { name: 'asc' },
        take: limit,
      });

      return payers;
    }),
});
