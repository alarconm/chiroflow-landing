import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';

export const feeScheduleRouter = router({
  // Create new fee schedule
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1, 'Name is required'),
        description: z.string().optional(),
        isDefault: z.boolean().default(false),
        effectiveDate: z.date().default(() => new Date()),
        endDate: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check for duplicate name in org
      const existing = await ctx.prisma.feeSchedule.findFirst({
        where: {
          organizationId: ctx.user.organizationId,
          name: input.name,
        },
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Fee schedule "${input.name}" already exists`,
        });
      }

      // If setting as default, unset other defaults
      if (input.isDefault) {
        await ctx.prisma.feeSchedule.updateMany({
          where: {
            organizationId: ctx.user.organizationId,
            isDefault: true,
          },
          data: { isDefault: false },
        });
      }

      const feeSchedule = await ctx.prisma.feeSchedule.create({
        data: {
          ...input,
          organizationId: ctx.user.organizationId,
        },
      });

      await auditLog('FEE_SCHEDULE_CREATE', 'FeeSchedule', {
        entityId: feeSchedule.id,
        changes: { name: input.name, isDefault: input.isDefault },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return feeSchedule;
    }),

  // Update fee schedule details
  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        description: z.string().nullable().optional(),
        effectiveDate: z.date().optional(),
        endDate: z.date().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      const existing = await ctx.prisma.feeSchedule.findFirst({
        where: {
          id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Fee schedule not found',
        });
      }

      // Check for duplicate name if being changed
      if (updateData.name && updateData.name !== existing.name) {
        const duplicate = await ctx.prisma.feeSchedule.findFirst({
          where: {
            organizationId: ctx.user.organizationId,
            name: updateData.name,
            id: { not: id },
          },
        });

        if (duplicate) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Fee schedule "${updateData.name}" already exists`,
          });
        }
      }

      const feeSchedule = await ctx.prisma.feeSchedule.update({
        where: { id },
        data: updateData,
      });

      await auditLog('FEE_SCHEDULE_UPDATE', 'FeeSchedule', {
        entityId: id,
        changes: updateData,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return feeSchedule;
    }),

  // List organization fee schedules
  list: protectedProcedure
    .input(
      z.object({
        includeItems: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const feeSchedules = await ctx.prisma.feeSchedule.findMany({
        where: {
          organizationId: ctx.user.organizationId,
        },
        include: input.includeItems
          ? {
              items: {
                orderBy: { cptCode: 'asc' },
              },
              _count: { select: { items: true } },
            }
          : {
              _count: { select: { items: true } },
            },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      });

      return feeSchedules;
    }),

  // Get fee schedule with all items
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const feeSchedule = await ctx.prisma.feeSchedule.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          items: {
            orderBy: { cptCode: 'asc' },
          },
        },
      });

      if (!feeSchedule) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Fee schedule not found',
        });
      }

      return feeSchedule;
    }),

  // Delete fee schedule
  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.feeSchedule.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Fee schedule not found',
        });
      }

      if (existing.isDefault) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot delete the default fee schedule. Set another as default first.',
        });
      }

      await ctx.prisma.feeSchedule.delete({
        where: { id: input.id },
      });

      await auditLog('FEE_SCHEDULE_DELETE', 'FeeSchedule', {
        entityId: input.id,
        changes: { name: existing.name },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // Set as organization default
  setDefault: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.feeSchedule.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Fee schedule not found',
        });
      }

      // Transaction to update defaults
      await ctx.prisma.$transaction([
        // Unset all other defaults
        ctx.prisma.feeSchedule.updateMany({
          where: {
            organizationId: ctx.user.organizationId,
            isDefault: true,
          },
          data: { isDefault: false },
        }),
        // Set this as default
        ctx.prisma.feeSchedule.update({
          where: { id: input.id },
          data: { isDefault: true },
        }),
      ]);

      await auditLog('FEE_SCHEDULE_SET_DEFAULT', 'FeeSchedule', {
        entityId: input.id,
        changes: { isDefault: true },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // Add/update fee for CPT code (upsert)
  upsertItem: adminProcedure
    .input(
      z.object({
        feeScheduleId: z.string(),
        cptCode: z.string().min(1, 'CPT code is required'),
        description: z.string().optional(),
        fee: z.number().min(0, 'Fee must be positive'),
        allowedAmount: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { feeScheduleId, cptCode, description, fee, allowedAmount } = input;

      // Verify fee schedule belongs to org
      const feeSchedule = await ctx.prisma.feeSchedule.findFirst({
        where: {
          id: feeScheduleId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!feeSchedule) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Fee schedule not found',
        });
      }

      const item = await ctx.prisma.feeScheduleItem.upsert({
        where: {
          feeScheduleId_cptCode: {
            feeScheduleId,
            cptCode: cptCode.toUpperCase(),
          },
        },
        update: {
          description,
          fee,
          allowedAmount,
        },
        create: {
          feeScheduleId,
          cptCode: cptCode.toUpperCase(),
          description,
          fee,
          allowedAmount,
        },
      });

      await auditLog('FEE_SCHEDULE_ITEM_UPSERT', 'FeeScheduleItem', {
        entityId: item.id,
        changes: { cptCode, fee, allowedAmount },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return item;
    }),

  // Delete fee schedule item
  deleteItem: adminProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.prisma.feeScheduleItem.findFirst({
        where: {
          id: input.itemId,
          feeSchedule: { organizationId: ctx.user.organizationId },
        },
      });

      if (!item) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Fee schedule item not found',
        });
      }

      await ctx.prisma.feeScheduleItem.delete({
        where: { id: input.itemId },
      });

      await auditLog('FEE_SCHEDULE_ITEM_DELETE', 'FeeScheduleItem', {
        entityId: input.itemId,
        changes: { cptCode: item.cptCode },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // Bulk import fees from CSV data
  bulkImport: adminProcedure
    .input(
      z.object({
        feeScheduleId: z.string(),
        items: z.array(
          z.object({
            cptCode: z.string().min(1),
            description: z.string().optional(),
            fee: z.number().min(0),
            allowedAmount: z.number().optional(),
          })
        ),
        overwriteExisting: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { feeScheduleId, items, overwriteExisting } = input;

      // Verify fee schedule belongs to org
      const feeSchedule = await ctx.prisma.feeSchedule.findFirst({
        where: {
          id: feeScheduleId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!feeSchedule) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Fee schedule not found',
        });
      }

      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const item of items) {
        const existing = await ctx.prisma.feeScheduleItem.findFirst({
          where: {
            feeScheduleId,
            cptCode: item.cptCode.toUpperCase(),
          },
        });

        if (existing) {
          if (overwriteExisting) {
            await ctx.prisma.feeScheduleItem.update({
              where: { id: existing.id },
              data: {
                description: item.description,
                fee: item.fee,
                allowedAmount: item.allowedAmount,
              },
            });
            updated++;
          } else {
            skipped++;
          }
        } else {
          await ctx.prisma.feeScheduleItem.create({
            data: {
              feeScheduleId,
              cptCode: item.cptCode.toUpperCase(),
              description: item.description,
              fee: item.fee,
              allowedAmount: item.allowedAmount,
            },
          });
          created++;
        }
      }

      await auditLog('FEE_SCHEDULE_BULK_IMPORT', 'FeeSchedule', {
        entityId: feeScheduleId,
        changes: { created, updated, skipped, total: items.length },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { created, updated, skipped, total: items.length };
    }),

  // Get fee for a specific CPT code from default schedule
  getFee: protectedProcedure
    .input(
      z.object({
        cptCode: z.string(),
        feeScheduleId: z.string().optional(), // If not provided, use default
      })
    )
    .query(async ({ ctx, input }) => {
      const { cptCode, feeScheduleId } = input;

      let scheduleId = feeScheduleId;

      // Get default fee schedule if not specified
      if (!scheduleId) {
        const defaultSchedule = await ctx.prisma.feeSchedule.findFirst({
          where: {
            organizationId: ctx.user.organizationId,
            isDefault: true,
          },
        });

        if (!defaultSchedule) {
          return null;
        }

        scheduleId = defaultSchedule.id;
      }

      const item = await ctx.prisma.feeScheduleItem.findFirst({
        where: {
          feeScheduleId: scheduleId,
          cptCode: cptCode.toUpperCase(),
        },
      });

      return item;
    }),

  // Get fees for multiple CPT codes
  getFees: protectedProcedure
    .input(
      z.object({
        cptCodes: z.array(z.string()),
        feeScheduleId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { cptCodes, feeScheduleId } = input;

      let scheduleId = feeScheduleId;

      if (!scheduleId) {
        const defaultSchedule = await ctx.prisma.feeSchedule.findFirst({
          where: {
            organizationId: ctx.user.organizationId,
            isDefault: true,
          },
        });

        if (!defaultSchedule) {
          return [];
        }

        scheduleId = defaultSchedule.id;
      }

      const items = await ctx.prisma.feeScheduleItem.findMany({
        where: {
          feeScheduleId: scheduleId,
          cptCode: { in: cptCodes.map((c) => c.toUpperCase()) },
        },
      });

      return items;
    }),

  // Copy fee schedule
  copy: adminProcedure
    .input(
      z.object({
        sourceId: z.string(),
        newName: z.string().min(1, 'Name is required'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { sourceId, newName } = input;

      // Verify source exists
      const source = await ctx.prisma.feeSchedule.findFirst({
        where: {
          id: sourceId,
          organizationId: ctx.user.organizationId,
        },
        include: { items: true },
      });

      if (!source) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Source fee schedule not found',
        });
      }

      // Check new name doesn't exist
      const existing = await ctx.prisma.feeSchedule.findFirst({
        where: {
          organizationId: ctx.user.organizationId,
          name: newName,
        },
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Fee schedule "${newName}" already exists`,
        });
      }

      // Create new fee schedule with items
      const newSchedule = await ctx.prisma.feeSchedule.create({
        data: {
          organizationId: ctx.user.organizationId,
          name: newName,
          description: source.description,
          isDefault: false,
          effectiveDate: new Date(),
          items: {
            create: source.items.map((item) => ({
              cptCode: item.cptCode,
              description: item.description,
              fee: item.fee,
              allowedAmount: item.allowedAmount,
            })),
          },
        },
        include: { items: true },
      });

      await auditLog('FEE_SCHEDULE_COPY', 'FeeSchedule', {
        entityId: newSchedule.id,
        changes: { sourceId, newName, itemCount: source.items.length },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return newSchedule;
    }),
});
