import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import { Prisma } from '@prisma/client';

// Address schema for validation
const addressSchema = z.object({
  addressLine1: z.string().min(1, 'Address line 1 is required'),
  addressLine2: z.string().optional().nullable(),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(2, 'State is required').max(2, 'Use 2-letter state code'),
  zipCode: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code format'),
  country: z.string().default('US'),
});

// Branding options schema
const brandingSchema = z.object({
  logoUrl: z.string().url().optional().nullable(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
});

// Location settings schema
const locationSettingsSchema = z.object({
  defaultAppointmentDuration: z.number().min(5).max(240).optional(),
  slotInterval: z.number().min(5).max(60).optional(),
  bufferTime: z.number().min(0).max(60).optional(),
  allowOnlineBooking: z.boolean().optional(),
  allowWalkIns: z.boolean().optional(),
  maxAdvanceBookingDays: z.number().min(1).max(365).optional(),
  minAdvanceBookingHours: z.number().min(0).max(168).optional(),
  allowCrossLocationAccess: z.boolean().optional(),
  sharePatientRecords: z.boolean().optional(),
  trackInventory: z.boolean().optional(),
  lowStockAlertEnabled: z.boolean().optional(),
  billingSeparate: z.boolean().optional(),
  defaultFeeScheduleId: z.string().optional().nullable(),
  appointmentReminderEnabled: z.boolean().optional(),
  reminderHoursBeforeAppt: z.number().min(1).max(168).optional(),
  customSettings: z.record(z.string(), z.unknown()).optional(),
});

// Operating hours schema
const hoursSchema = z.object({
  dayOfWeek: z.number().min(0).max(6),
  isOpen: z.boolean(),
  openTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  breakStart: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  breakEnd: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
});

// Create location input schema
const createLocationSchema = z.object({
  name: z.string().min(1, 'Location name is required'),
  code: z.string().min(1).max(10, 'Code must be 1-10 characters'),
  isPrimary: z.boolean().default(false),
  ...addressSchema.shape,
  phone: z.string().min(10, 'Phone number is required'),
  fax: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  timezone: z.string().default('America/New_York'),
  ...brandingSchema.shape,
  settings: locationSettingsSchema.optional(),
  hours: z.array(hoursSchema).optional(),
});

// Update location input schema
const updateLocationSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  code: z.string().min(1).max(10).optional(),
  isPrimary: z.boolean().optional(),
  isActive: z.boolean().optional(),
  addressLine1: z.string().min(1).optional(),
  addressLine2: z.string().optional().nullable(),
  city: z.string().min(1).optional(),
  state: z.string().min(2).max(2).optional(),
  zipCode: z.string().regex(/^\d{5}(-\d{4})?$/).optional(),
  country: z.string().optional(),
  phone: z.string().min(10).optional(),
  fax: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  timezone: z.string().optional(),
  logoUrl: z.string().url().optional().nullable(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  settings: locationSettingsSchema.optional(),
});

// Simple address validation function (checks format, not actual address validity)
function validateAddress(address: { addressLine1: string; city: string; state: string; zipCode: string; country: string }) {
  const errors: string[] = [];

  // Basic format validation
  if (address.addressLine1.length < 5) {
    errors.push('Address line 1 appears too short');
  }

  // US state validation
  if (address.country === 'US') {
    const usStates = [
      'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
      'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
      'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
      'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
      'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
      'DC', 'PR', 'VI', 'GU', 'AS', 'MP'
    ];
    if (!usStates.includes(address.state.toUpperCase())) {
      errors.push(`Invalid US state code: ${address.state}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export const locationRouter = router({
  // Create a new location
  create: adminProcedure
    .input(createLocationSchema)
    .mutation(async ({ ctx, input }) => {
      const { settings, hours, ...locationData } = input;

      // Validate address
      const addressValidation = validateAddress({
        addressLine1: input.addressLine1,
        city: input.city,
        state: input.state,
        zipCode: input.zipCode,
        country: input.country,
      });

      if (!addressValidation.valid) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Address validation failed: ${addressValidation.errors.join(', ')}`,
        });
      }

      // Check for duplicate code within organization
      const existingLocation = await ctx.prisma.location.findFirst({
        where: {
          code: input.code,
          organizationId: ctx.user.organizationId,
          deletedAt: null,
        },
      });

      if (existingLocation) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `A location with code "${input.code}" already exists`,
        });
      }

      // If this is the primary location, unset any existing primary
      if (input.isPrimary) {
        await ctx.prisma.location.updateMany({
          where: {
            organizationId: ctx.user.organizationId,
            isPrimary: true,
            deletedAt: null,
          },
          data: { isPrimary: false },
        });
      }

      // Create location with settings and hours in a transaction
      const location = await ctx.prisma.$transaction(async (tx) => {
        // Create the location
        const newLocation = await tx.location.create({
          data: {
            ...locationData,
            organizationId: ctx.user.organizationId,
          },
        });

        // Create location settings if provided
        if (settings) {
          await tx.locationSettings.create({
            data: {
              locationId: newLocation.id,
              ...settings,
              customSettings: settings.customSettings as Prisma.InputJsonValue || {},
            },
          });
        } else {
          // Create default settings
          await tx.locationSettings.create({
            data: {
              locationId: newLocation.id,
            },
          });
        }

        // Create operating hours if provided
        if (hours && hours.length > 0) {
          await tx.locationHours.createMany({
            data: hours.map(h => ({
              locationId: newLocation.id,
              ...h,
            })),
          });
        } else {
          // Create default hours (Mon-Fri 9-5)
          const defaultHours = [];
          for (let day = 0; day <= 6; day++) {
            defaultHours.push({
              locationId: newLocation.id,
              dayOfWeek: day,
              isOpen: day >= 1 && day <= 5, // Mon-Fri
              openTime: day >= 1 && day <= 5 ? '09:00' : null,
              closeTime: day >= 1 && day <= 5 ? '17:00' : null,
            });
          }
          await tx.locationHours.createMany({
            data: defaultHours,
          });
        }

        return newLocation;
      });

      // Log the creation
      await auditLog('LOCATION_CREATE', 'Location', {
        entityId: location.id,
        changes: { created: locationData },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      // Return the complete location with settings and hours
      return ctx.prisma.location.findUnique({
        where: { id: location.id },
        include: {
          locationSettings: true,
          locationHours: {
            orderBy: { dayOfWeek: 'asc' },
          },
        },
      });
    }),

  // Update an existing location
  update: adminProcedure
    .input(updateLocationSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, settings, ...updateData } = input;

      // Verify location belongs to organization
      const existingLocation = await ctx.prisma.location.findFirst({
        where: {
          id,
          organizationId: ctx.user.organizationId,
          deletedAt: null,
        },
        include: {
          locationSettings: true,
        },
      });

      if (!existingLocation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Location not found',
        });
      }

      // Validate address if address fields are being updated
      if (updateData.addressLine1 || updateData.city || updateData.state || updateData.zipCode) {
        const addressValidation = validateAddress({
          addressLine1: updateData.addressLine1 || existingLocation.addressLine1,
          city: updateData.city || existingLocation.city,
          state: updateData.state || existingLocation.state,
          zipCode: updateData.zipCode || existingLocation.zipCode,
          country: updateData.country || existingLocation.country,
        });

        if (!addressValidation.valid) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Address validation failed: ${addressValidation.errors.join(', ')}`,
          });
        }
      }

      // Check for duplicate code if code is being changed
      if (updateData.code && updateData.code !== existingLocation.code) {
        const duplicateCode = await ctx.prisma.location.findFirst({
          where: {
            code: updateData.code,
            organizationId: ctx.user.organizationId,
            id: { not: id },
            deletedAt: null,
          },
        });

        if (duplicateCode) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `A location with code "${updateData.code}" already exists`,
          });
        }
      }

      // If setting as primary, unset any existing primary
      if (updateData.isPrimary && !existingLocation.isPrimary) {
        await ctx.prisma.location.updateMany({
          where: {
            organizationId: ctx.user.organizationId,
            isPrimary: true,
            id: { not: id },
            deletedAt: null,
          },
          data: { isPrimary: false },
        });
      }

      // Update location and settings in a transaction
      const updatedLocation = await ctx.prisma.$transaction(async (tx) => {
        // Update location
        const location = await tx.location.update({
          where: { id },
          data: updateData,
        });

        // Update settings if provided
        if (settings) {
          await tx.locationSettings.upsert({
            where: { locationId: id },
            update: {
              ...settings,
              customSettings: settings.customSettings as Prisma.InputJsonValue,
            },
            create: {
              locationId: id,
              ...settings,
              customSettings: settings.customSettings as Prisma.InputJsonValue || {},
            },
          });
        }

        return location;
      });

      // Log the update
      await auditLog('LOCATION_UPDATE', 'Location', {
        entityId: id,
        changes: { before: existingLocation, after: updateData },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      // Return the complete updated location
      return ctx.prisma.location.findUnique({
        where: { id },
        include: {
          locationSettings: true,
          locationHours: {
            orderBy: { dayOfWeek: 'asc' },
          },
        },
      });
    }),

  // List all locations for the organization
  list: protectedProcedure
    .input(z.object({
      includeInactive: z.boolean().default(false),
      includeDeleted: z.boolean().default(false),
    }).optional())
    .query(async ({ ctx, input }) => {
      const where: Prisma.LocationWhereInput = {
        organizationId: ctx.user.organizationId,
      };

      if (!input?.includeDeleted) {
        where.deletedAt = null;
      }

      if (!input?.includeInactive) {
        where.isActive = true;
      }

      const locations = await ctx.prisma.location.findMany({
        where,
        include: {
          locationSettings: true,
          locationHours: {
            orderBy: { dayOfWeek: 'asc' },
          },
          _count: {
            select: {
              locationStaff: { where: { isActive: true } },
              appointments: true,
            },
          },
        },
        orderBy: [
          { isPrimary: 'desc' },
          { name: 'asc' },
        ],
      });

      return locations;
    }),

  // Get a single location with full details
  get: protectedProcedure
    .input(z.object({
      id: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const location = await ctx.prisma.location.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
          deletedAt: null,
        },
        include: {
          locationSettings: true,
          locationHours: {
            orderBy: { dayOfWeek: 'asc' },
          },
          locationStaff: {
            where: { isActive: true },
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  role: true,
                },
              },
            },
          },
          _count: {
            select: {
              appointments: true,
              encounters: true,
              inventoryItems: true,
            },
          },
        },
      });

      if (!location) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Location not found',
        });
      }

      return location;
    }),

  // Soft delete (deactivate) a location
  deactivate: adminProcedure
    .input(z.object({
      id: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify location exists and belongs to organization
      const location = await ctx.prisma.location.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
          deletedAt: null,
        },
        include: {
          _count: {
            select: {
              appointments: {
                where: {
                  startTime: { gte: new Date() },
                  status: { in: ['SCHEDULED', 'CONFIRMED'] },
                },
              },
            },
          },
        },
      });

      if (!location) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Location not found',
        });
      }

      // Prevent deactivation if there are future appointments
      if (location._count.appointments > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Cannot deactivate location with ${location._count.appointments} upcoming appointments. Please reschedule or cancel them first.`,
        });
      }

      // Prevent deactivation of the only active location
      const activeLocationCount = await ctx.prisma.location.count({
        where: {
          organizationId: ctx.user.organizationId,
          isActive: true,
          deletedAt: null,
        },
      });

      if (activeLocationCount <= 1) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Cannot deactivate the only active location. Create another location first.',
        });
      }

      // Soft delete the location
      const deactivatedLocation = await ctx.prisma.location.update({
        where: { id: input.id },
        data: {
          isActive: false,
          deletedAt: new Date(),
        },
      });

      // Deactivate all staff assignments at this location
      await ctx.prisma.locationStaff.updateMany({
        where: { locationId: input.id },
        data: { isActive: false },
      });

      // Log the deactivation
      await auditLog('LOCATION_DEACTIVATE', 'Location', {
        entityId: input.id,
        changes: { deactivated: true },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return deactivatedLocation;
    }),

  // Reactivate a deactivated location
  reactivate: adminProcedure
    .input(z.object({
      id: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const location = await ctx.prisma.location.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
          isActive: false,
        },
      });

      if (!location) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Inactive location not found',
        });
      }

      const reactivatedLocation = await ctx.prisma.location.update({
        where: { id: input.id },
        data: {
          isActive: true,
          deletedAt: null,
        },
      });

      // Log the reactivation
      await auditLog('LOCATION_REACTIVATE', 'Location', {
        entityId: input.id,
        changes: { reactivated: true },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return reactivatedLocation;
    }),

  // Update operating hours for a location
  updateHours: adminProcedure
    .input(z.object({
      locationId: z.string(),
      hours: z.array(hoursSchema),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify location belongs to organization
      const location = await ctx.prisma.location.findFirst({
        where: {
          id: input.locationId,
          organizationId: ctx.user.organizationId,
          deletedAt: null,
        },
      });

      if (!location) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Location not found',
        });
      }

      // Update hours in a transaction
      const updatedHours = await ctx.prisma.$transaction(async (tx) => {
        // Delete existing regular hours (not holiday overrides)
        await tx.locationHours.deleteMany({
          where: {
            locationId: input.locationId,
            effectiveDate: null,
          },
        });

        // Create new hours
        await tx.locationHours.createMany({
          data: input.hours.map(h => ({
            locationId: input.locationId,
            ...h,
          })),
        });

        return tx.locationHours.findMany({
          where: { locationId: input.locationId },
          orderBy: { dayOfWeek: 'asc' },
        });
      });

      // Log the update
      await auditLog('LOCATION_HOURS_UPDATE', 'Location', {
        entityId: input.locationId,
        changes: { hours: input.hours },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updatedHours;
    }),

  // Update location-specific branding
  updateBranding: adminProcedure
    .input(z.object({
      locationId: z.string(),
      ...brandingSchema.shape,
    }))
    .mutation(async ({ ctx, input }) => {
      const { locationId, ...brandingData } = input;

      // Verify location belongs to organization
      const location = await ctx.prisma.location.findFirst({
        where: {
          id: locationId,
          organizationId: ctx.user.organizationId,
          deletedAt: null,
        },
      });

      if (!location) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Location not found',
        });
      }

      const updatedLocation = await ctx.prisma.location.update({
        where: { id: locationId },
        data: brandingData,
      });

      // Log the branding update
      await auditLog('LOCATION_BRANDING_UPDATE', 'Location', {
        entityId: locationId,
        changes: { branding: brandingData },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updatedLocation;
    }),

  // Get primary location for the organization
  getPrimary: protectedProcedure.query(async ({ ctx }) => {
    const primaryLocation = await ctx.prisma.location.findFirst({
      where: {
        organizationId: ctx.user.organizationId,
        isPrimary: true,
        isActive: true,
        deletedAt: null,
      },
      include: {
        locationSettings: true,
        locationHours: {
          orderBy: { dayOfWeek: 'asc' },
        },
      },
    });

    // If no primary set, return the first active location
    if (!primaryLocation) {
      return ctx.prisma.location.findFirst({
        where: {
          organizationId: ctx.user.organizationId,
          isActive: true,
          deletedAt: null,
        },
        include: {
          locationSettings: true,
          locationHours: {
            orderBy: { dayOfWeek: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
    }

    return primaryLocation;
  }),
});
