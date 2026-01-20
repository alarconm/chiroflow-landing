import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import { Prisma } from '@prisma/client';

// Organization settings schema
const settingsSchema = z.object({
  // Practice info
  practiceName: z.string().optional(),
  address: z
    .object({
      street: z.string(),
      city: z.string(),
      state: z.string(),
      zip: z.string(),
      country: z.string().default('US'),
    })
    .optional(),
  phone: z.string().optional(),
  fax: z.string().optional(),
  email: z.string().email().optional(),
  website: z.string().url().optional(),

  // Business settings
  timezone: z.string().default('America/New_York'),
  dateFormat: z.string().default('MM/DD/YYYY'),
  timeFormat: z.enum(['12h', '24h']).default('12h'),

  // Practice settings
  appointmentDuration: z.number().min(5).max(240).default(30),
  workingHours: z
    .object({
      monday: z.object({ start: z.string(), end: z.string(), enabled: z.boolean() }).optional(),
      tuesday: z.object({ start: z.string(), end: z.string(), enabled: z.boolean() }).optional(),
      wednesday: z.object({ start: z.string(), end: z.string(), enabled: z.boolean() }).optional(),
      thursday: z.object({ start: z.string(), end: z.string(), enabled: z.boolean() }).optional(),
      friday: z.object({ start: z.string(), end: z.string(), enabled: z.boolean() }).optional(),
      saturday: z.object({ start: z.string(), end: z.string(), enabled: z.boolean() }).optional(),
      sunday: z.object({ start: z.string(), end: z.string(), enabled: z.boolean() }).optional(),
    })
    .optional(),

  // Billing settings
  taxId: z.string().optional(),
  npi: z.string().optional(),
  taxonomyCode: z.string().optional(),

  // Feature flags
  features: z
    .object({
      onlineBooking: z.boolean().default(false),
      patientPortal: z.boolean().default(false),
      smsReminders: z.boolean().default(false),
      emailReminders: z.boolean().default(true),
    })
    .optional(),
});

export const organizationRouter = router({
  // Get current organization details
  get: protectedProcedure.query(async ({ ctx }) => {
    const organization = await ctx.prisma.organization.findUnique({
      where: { id: ctx.user.organizationId },
    });

    if (!organization) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Organization not found',
      });
    }

    return {
      id: organization.id,
      name: organization.name,
      subdomain: organization.subdomain,
      settings: organization.settings as Record<string, unknown>,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
    };
  }),

  // Update organization details (admin only)
  update: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).optional(),
        settings: settingsSchema.partial().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const organization = await ctx.prisma.organization.findUnique({
        where: { id: ctx.user.organizationId },
      });

      if (!organization) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Organization not found',
        });
      }

      // Merge existing settings with new settings
      const currentSettings = organization.settings as Record<string, unknown>;
      const newSettings = input.settings
        ? { ...currentSettings, ...input.settings }
        : currentSettings;

      // Update organization
      const updated = await ctx.prisma.organization.update({
        where: { id: ctx.user.organizationId },
        data: {
          ...(input.name && { name: input.name }),
          settings: newSettings as Prisma.InputJsonValue,
        },
      });

      // Log organization update
      await auditLog('ORG_UPDATE', 'Organization', {
        entityId: organization.id,
        changes: input,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      // Log settings change if settings were updated
      if (input.settings) {
        await auditLog('ORG_SETTINGS_CHANGE', 'Organization', {
          entityId: organization.id,
          changes: { before: currentSettings, after: newSettings },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });
      }

      return {
        id: updated.id,
        name: updated.name,
        subdomain: updated.subdomain,
        settings: updated.settings as Record<string, unknown>,
        updatedAt: updated.updatedAt,
      };
    }),

  // Get organization statistics
  stats: protectedProcedure.query(async ({ ctx }) => {
    const [userCount, activeUserCount] = await Promise.all([
      ctx.prisma.user.count({
        where: { organizationId: ctx.user.organizationId },
      }),
      ctx.prisma.user.count({
        where: {
          organizationId: ctx.user.organizationId,
          isActive: true,
        },
      }),
    ]);

    return {
      users: {
        total: userCount,
        active: activeUserCount,
        inactive: userCount - activeUserCount,
      },
    };
  }),
});
