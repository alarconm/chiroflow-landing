import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditAction } from '@/lib/audit';
import { DayOfWeek, Prisma } from '@prisma/client';

// ============================================
// INPUT SCHEMAS
// ============================================

const dayOfWeekSchema = z.nativeEnum(DayOfWeek);

// Time string validation (HH:MM format)
const timeStringSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be in HH:MM format');

// ============================================
// CROSS-LOCATION SCHEDULING ROUTER
// ============================================

export const crossLocationSchedulingRouter = router({
  // ==========================================
  // LOCATION SELECTOR FOR BOOKING
  // ==========================================

  /**
   * Get available locations for booking appointments
   * Returns locations with their settings and availability
   */
  getBookableLocations: protectedProcedure
    .input(
      z.object({
        includeSettings: z.boolean().optional().default(false),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const locations = await prisma.location.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          isActive: true,
          deletedAt: null,
        },
        include: {
          locationSettings: input?.includeSettings ?? false,
          locationHours: true,
          _count: {
            select: {
              appointments: {
                where: {
                  startTime: { gte: new Date() },
                  status: { notIn: ['CANCELLED', 'NO_SHOW'] },
                },
              },
            },
          },
        },
        orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
      });

      return locations;
    }),

  // ==========================================
  // PROVIDER AVAILABILITY BY LOCATION
  // ==========================================

  /**
   * Get provider availability at a specific location
   * Combines provider schedules with location hours and existing appointments
   */
  getProviderAvailabilityByLocation: protectedProcedure
    .input(
      z.object({
        locationId: z.string(),
        providerId: z.string(),
        startDate: z.date(),
        endDate: z.date(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify location belongs to org
      const location = await prisma.location.findFirst({
        where: {
          id: input.locationId,
          organizationId: ctx.user.organizationId,
          isActive: true,
          deletedAt: null,
        },
        include: {
          locationHours: true,
          locationSettings: true,
        },
      });

      if (!location) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Location not found',
        });
      }

      // Verify provider belongs to org and is assigned to location
      const provider = await prisma.provider.findFirst({
        where: {
          id: input.providerId,
          organizationId: ctx.user.organizationId,
          isActive: true,
        },
        include: {
          user: {
            include: {
              locationAssignments: {
                where: {
                  locationId: input.locationId,
                  isActive: true,
                },
              },
            },
          },
          schedules: { where: { isActive: true } },
          exceptions: {
            where: {
              date: {
                gte: input.startDate,
                lte: input.endDate,
              },
            },
          },
        },
      });

      if (!provider) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Provider not found',
        });
      }

      // Check if provider is assigned to this location
      const isAssignedToLocation = provider.user.locationAssignments.length > 0;

      // Get existing appointments at this location for this provider
      const appointments = await prisma.appointment.findMany({
        where: {
          providerId: input.providerId,
          locationId: input.locationId,
          startTime: { gte: input.startDate },
          endTime: { lte: input.endDate },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
        select: {
          id: true,
          startTime: true,
          endTime: true,
        },
      });

      // Get schedule blocks
      const blocks = await prisma.scheduleBlock.findMany({
        where: {
          OR: [
            { providerId: input.providerId },
            { providerId: null, organizationId: ctx.user.organizationId },
          ],
          startTime: { gte: input.startDate },
          endTime: { lte: input.endDate },
        },
        select: {
          startTime: true,
          endTime: true,
          blockType: true,
          title: true,
        },
      });

      return {
        provider: {
          id: provider.id,
          title: provider.title,
          specialty: provider.specialty,
          color: provider.color,
          user: {
            firstName: provider.user.firstName,
            lastName: provider.user.lastName,
          },
        },
        location: {
          id: location.id,
          name: location.name,
          code: location.code,
          timezone: location.timezone,
        },
        isAssignedToLocation,
        schedules: provider.schedules,
        exceptions: provider.exceptions,
        appointments,
        blocks,
        locationHours: location.locationHours,
        settings: location.locationSettings,
      };
    }),

  /**
   * Get all providers available at a location with their availability
   */
  getLocationProviders: protectedProcedure
    .input(
      z.object({
        locationId: z.string(),
        date: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify location
      const location = await prisma.location.findFirst({
        where: {
          id: input.locationId,
          organizationId: ctx.user.organizationId,
          isActive: true,
          deletedAt: null,
        },
      });

      if (!location) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Location not found',
        });
      }

      // Get staff assigned to this location who are providers
      const locationStaff = await prisma.locationStaff.findMany({
        where: {
          locationId: input.locationId,
          isActive: true,
          user: {
            provider: { isNot: null },
          },
        },
        include: {
          user: {
            include: {
              provider: {
                include: {
                  schedules: { where: { isActive: true } },
                },
              },
            },
          },
        },
      });

      // Transform to provider list with schedule info
      const providers = locationStaff
        .filter((ls) => ls.user.provider !== null)
        .map((ls) => ({
          id: ls.user.provider!.id,
          title: ls.user.provider!.title,
          specialty: ls.user.provider!.specialty,
          color: ls.user.provider!.color,
          isActive: ls.user.provider!.isActive,
          user: {
            id: ls.user.id,
            firstName: ls.user.firstName,
            lastName: ls.user.lastName,
            email: ls.user.email,
          },
          isPrimaryLocation: ls.isPrimary,
          canViewSchedule: ls.canViewSchedule,
          canManageSchedule: ls.canManageSchedule,
          schedules: ls.user.provider!.schedules,
        }));

      return {
        location: {
          id: location.id,
          name: location.name,
          code: location.code,
        },
        providers,
      };
    }),

  // ==========================================
  // RESOURCE AVAILABILITY BY LOCATION
  // ==========================================

  /**
   * Get resources available at a specific location
   */
  getLocationResources: protectedProcedure
    .input(
      z.object({
        locationId: z.string(),
        startTime: z.date().optional(),
        endTime: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify location
      const location = await prisma.location.findFirst({
        where: {
          id: input.locationId,
          organizationId: ctx.user.organizationId,
          isActive: true,
          deletedAt: null,
        },
      });

      if (!location) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Location not found',
        });
      }

      // Get resources at this location (or shared resources with no location)
      const resources = await prisma.resource.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          isActive: true,
          OR: [
            { locationId: input.locationId },
            { locationId: null }, // Shared resources
          ],
        },
        orderBy: { name: 'asc' },
      });

      // If time range provided, check availability
      if (input.startTime && input.endTime) {
        const bookedResources = await prisma.appointmentResource.findMany({
          where: {
            resourceId: { in: resources.map((r) => r.id) },
            appointment: {
              status: { notIn: ['CANCELLED', 'NO_SHOW'] },
              OR: [
                {
                  startTime: { lt: input.endTime },
                  endTime: { gt: input.startTime },
                },
              ],
            },
          },
          select: {
            resourceId: true,
            quantity: true,
          },
        });

        // Calculate booked quantities per resource
        const bookedQuantities: Record<string, number> = {};
        for (const booking of bookedResources) {
          bookedQuantities[booking.resourceId] = (bookedQuantities[booking.resourceId] || 0) + booking.quantity;
        }

        return resources.map((resource) => ({
          ...resource,
          availableQuantity: resource.quantity - (bookedQuantities[resource.id] || 0),
          isShared: resource.locationId === null,
        }));
      }

      return resources.map((resource) => ({
        ...resource,
        availableQuantity: resource.quantity,
        isShared: resource.locationId === null,
      }));
    }),

  /**
   * Get rooms available at a specific location
   */
  getLocationRooms: protectedProcedure
    .input(
      z.object({
        locationId: z.string(),
        startTime: z.date().optional(),
        endTime: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify location
      const location = await prisma.location.findFirst({
        where: {
          id: input.locationId,
          organizationId: ctx.user.organizationId,
          isActive: true,
          deletedAt: null,
        },
      });

      if (!location) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Location not found',
        });
      }

      // Get rooms at this location
      const rooms = await prisma.room.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          isActive: true,
          OR: [
            { locationId: input.locationId },
            { locationId: null }, // Legacy rooms without location
          ],
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });

      // If time range provided, check availability
      if (input.startTime && input.endTime) {
        const bookedRooms = await prisma.appointment.findMany({
          where: {
            roomId: { in: rooms.map((r) => r.id) },
            status: { notIn: ['CANCELLED', 'NO_SHOW'] },
            startTime: { lt: input.endTime },
            endTime: { gt: input.startTime },
          },
          select: {
            roomId: true,
          },
        });

        const bookedRoomIds = new Set(bookedRooms.map((a) => a.roomId));

        return rooms.map((room) => ({
          ...room,
          isAvailable: !bookedRoomIds.has(room.id),
          isShared: room.locationId === null,
        }));
      }

      return rooms.map((room) => ({
        ...room,
        isAvailable: true,
        isShared: room.locationId === null,
      }));
    }),

  /**
   * Assign a room to a location
   */
  assignRoomToLocation: protectedProcedure
    .input(
      z.object({
        roomId: z.string(),
        locationId: z.string().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify room belongs to org
      const room = await prisma.room.findFirst({
        where: {
          id: input.roomId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!room) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Room not found',
        });
      }

      // Verify location if provided
      if (input.locationId) {
        const location = await prisma.location.findFirst({
          where: {
            id: input.locationId,
            organizationId: ctx.user.organizationId,
            isActive: true,
            deletedAt: null,
          },
        });

        if (!location) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Location not found',
          });
        }
      }

      const updatedRoom = await prisma.room.update({
        where: { id: input.roomId },
        data: { locationId: input.locationId },
      });

      await createAuditLog({
        action: 'ROOM_LOCATION_ASSIGN' as AuditAction,
        entityType: 'Room',
        entityId: input.roomId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          locationId: input.locationId,
          previous: room.locationId,
        },
      });

      return updatedRoom;
    }),

  /**
   * Assign a resource to a location
   */
  assignResourceToLocation: protectedProcedure
    .input(
      z.object({
        resourceId: z.string(),
        locationId: z.string().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify resource belongs to org
      const resource = await prisma.resource.findFirst({
        where: {
          id: input.resourceId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!resource) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Resource not found',
        });
      }

      // Verify location if provided
      if (input.locationId) {
        const location = await prisma.location.findFirst({
          where: {
            id: input.locationId,
            organizationId: ctx.user.organizationId,
            isActive: true,
            deletedAt: null,
          },
        });

        if (!location) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Location not found',
          });
        }
      }

      const updatedResource = await prisma.resource.update({
        where: { id: input.resourceId },
        data: { locationId: input.locationId },
      });

      await createAuditLog({
        action: 'RESOURCE_LOCATION_ASSIGN' as AuditAction,
        entityType: 'Resource',
        entityId: input.resourceId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          locationId: input.locationId,
          previous: resource.locationId,
        },
      });

      return updatedResource;
    }),

  // ==========================================
  // CROSS-LOCATION APPOINTMENT BOOKING
  // ==========================================

  /**
   * Book appointment at any location
   * Patient can book at any location within the organization
   */
  bookAtLocation: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        locationId: z.string(),
        providerId: z.string(),
        appointmentTypeId: z.string(),
        startTime: z.date(),
        endTime: z.date(),
        roomId: z.string().optional(),
        notes: z.string().optional(),
        chiefComplaint: z.string().optional(),
        resourceIds: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify patient exists and belongs to org
      const patient = await prisma.patient.findFirst({
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

      // Verify location
      const location = await prisma.location.findFirst({
        where: {
          id: input.locationId,
          organizationId: ctx.user.organizationId,
          isActive: true,
          deletedAt: null,
        },
        include: {
          locationSettings: true,
        },
      });

      if (!location) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Location not found',
        });
      }

      // Check if location allows online booking
      if (location.locationSettings && !location.locationSettings.allowOnlineBooking) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'This location does not allow online booking',
        });
      }

      // Verify provider exists and is assigned to location
      const provider = await prisma.provider.findFirst({
        where: {
          id: input.providerId,
          organizationId: ctx.user.organizationId,
          isActive: true,
        },
        include: {
          user: {
            include: {
              locationAssignments: {
                where: {
                  locationId: input.locationId,
                  isActive: true,
                },
              },
            },
          },
        },
      });

      if (!provider) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Provider not found',
        });
      }

      // Warn (but don't block) if provider not assigned to location
      const isAssignedToLocation = provider.user.locationAssignments.length > 0;

      // Check if appointment type is available at this location
      const appointmentTypeLocation = await prisma.appointmentTypeLocation.findFirst({
        where: {
          appointmentTypeId: input.appointmentTypeId,
          locationId: input.locationId,
        },
      });

      // If explicit configuration exists and is disabled, block
      if (appointmentTypeLocation && !appointmentTypeLocation.isEnabled) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This appointment type is not available at this location',
        });
      }

      // Check for provider conflicts at any location
      const providerConflict = await prisma.appointment.findFirst({
        where: {
          providerId: input.providerId,
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          startTime: { lt: input.endTime },
          endTime: { gt: input.startTime },
        },
      });

      if (providerConflict) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Provider already has an appointment at this time',
        });
      }

      // Check for room conflicts at this location
      if (input.roomId) {
        const roomConflict = await prisma.appointment.findFirst({
          where: {
            roomId: input.roomId,
            locationId: input.locationId,
            status: { notIn: ['CANCELLED', 'NO_SHOW'] },
            startTime: { lt: input.endTime },
            endTime: { gt: input.startTime },
          },
        });

        if (roomConflict) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Room is already booked at this time',
          });
        }
      }

      // Create the appointment
      const appointment = await prisma.appointment.create({
        data: {
          organizationId: ctx.user.organizationId,
          patientId: input.patientId,
          providerId: input.providerId,
          appointmentTypeId: input.appointmentTypeId,
          locationId: input.locationId,
          startTime: input.startTime,
          endTime: input.endTime,
          roomId: input.roomId,
          notes: input.notes,
          chiefComplaint: input.chiefComplaint,
          createdBy: ctx.user.id,
          resources: input.resourceIds
            ? {
                create: input.resourceIds.map((resourceId) => ({
                  resourceId,
                })),
              }
            : undefined,
        },
        include: {
          patient: {
            include: {
              demographics: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          provider: {
            include: {
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          appointmentType: true,
          room: true,
          location: true,
        },
      });

      await createAuditLog({
        action: 'APPOINTMENT_CREATE' as AuditAction,
        entityType: 'Appointment',
        entityId: appointment.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          created: input,
          locationId: input.locationId,
          providerAssignedToLocation: isAssignedToLocation,
        },
      });

      return appointment;
    }),

  // ==========================================
  // TRANSFER APPOINTMENT BETWEEN LOCATIONS
  // ==========================================

  /**
   * Transfer an appointment from one location to another
   */
  transferAppointment: protectedProcedure
    .input(
      z.object({
        appointmentId: z.string(),
        newLocationId: z.string(),
        newProviderId: z.string().optional(),
        newRoomId: z.string().optional(),
        newStartTime: z.date().optional(),
        newEndTime: z.date().optional(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get existing appointment
      const existing = await prisma.appointment.findFirst({
        where: {
          id: input.appointmentId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          location: true,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Appointment not found',
        });
      }

      // Can't transfer completed or cancelled appointments
      if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(existing.status)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot transfer completed or cancelled appointments',
        });
      }

      // Verify new location
      const newLocation = await prisma.location.findFirst({
        where: {
          id: input.newLocationId,
          organizationId: ctx.user.organizationId,
          isActive: true,
          deletedAt: null,
        },
      });

      if (!newLocation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'New location not found',
        });
      }

      const providerId = input.newProviderId || existing.providerId;
      const startTime = input.newStartTime || existing.startTime;
      const endTime = input.newEndTime || existing.endTime;

      // Check for provider conflicts at the new time
      const providerConflict = await prisma.appointment.findFirst({
        where: {
          id: { not: input.appointmentId },
          providerId,
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
      });

      if (providerConflict) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Provider already has an appointment at this time',
        });
      }

      // Check room conflicts at new location
      if (input.newRoomId) {
        const roomConflict = await prisma.appointment.findFirst({
          where: {
            id: { not: input.appointmentId },
            roomId: input.newRoomId,
            locationId: input.newLocationId,
            status: { notIn: ['CANCELLED', 'NO_SHOW'] },
            startTime: { lt: endTime },
            endTime: { gt: startTime },
          },
        });

        if (roomConflict) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Room is already booked at this time at the new location',
          });
        }
      }

      // Update the appointment
      const appointment = await prisma.appointment.update({
        where: { id: input.appointmentId },
        data: {
          locationId: input.newLocationId,
          providerId,
          roomId: input.newRoomId ?? null,
          startTime,
          endTime,
          notes: input.reason
            ? `${existing.notes || ''}\n[Transfer Note: ${input.reason}]`.trim()
            : existing.notes,
        },
        include: {
          patient: {
            include: {
              demographics: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          provider: {
            include: {
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          appointmentType: true,
          room: true,
          location: true,
        },
      });

      await createAuditLog({
        action: 'APPOINTMENT_TRANSFER_LOCATION' as AuditAction,
        entityType: 'Appointment',
        entityId: input.appointmentId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          fromLocationId: existing.locationId,
          toLocationId: input.newLocationId,
          fromProviderId: existing.providerId,
          toProviderId: providerId,
          reason: input.reason,
          timeChanged: !!(input.newStartTime || input.newEndTime),
        },
      });

      return appointment;
    }),

  // ==========================================
  // MULTI-LOCATION AVAILABILITY VIEW
  // ==========================================

  /**
   * Get availability across all locations for a date range
   */
  getMultiLocationAvailability: protectedProcedure
    .input(
      z.object({
        startDate: z.date(),
        endDate: z.date(),
        appointmentTypeId: z.string().optional(),
        providerId: z.string().optional(),
        duration: z.number().optional(), // Duration in minutes
      })
    )
    .query(async ({ ctx, input }) => {
      // Get all active locations
      const locations = await prisma.location.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          isActive: true,
          deletedAt: null,
        },
        include: {
          locationHours: true,
          locationSettings: true,
          _count: {
            select: {
              appointments: {
                where: {
                  startTime: {
                    gte: input.startDate,
                    lte: input.endDate,
                  },
                  status: { notIn: ['CANCELLED', 'NO_SHOW'] },
                },
              },
            },
          },
        },
        orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
      });

      // Get appointment counts per location
      const appointmentCounts = await prisma.appointment.groupBy({
        by: ['locationId'],
        where: {
          organizationId: ctx.user.organizationId,
          locationId: { not: null },
          startTime: {
            gte: input.startDate,
            lte: input.endDate,
          },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
        _count: { id: true },
      });

      const countByLocation: Record<string, number> = {};
      for (const count of appointmentCounts) {
        if (count.locationId) {
          countByLocation[count.locationId] = count._count.id;
        }
      }

      // Get providers per location
      const locationStaff = await prisma.locationStaff.findMany({
        where: {
          locationId: { in: locations.map((l) => l.id) },
          isActive: true,
          user: {
            provider: {
              isActive: true,
            },
          },
        },
        include: {
          user: {
            include: {
              provider: true,
            },
          },
        },
      });

      const providersByLocation: Record<string, number> = {};
      for (const staff of locationStaff) {
        providersByLocation[staff.locationId] = (providersByLocation[staff.locationId] || 0) + 1;
      }

      // Check appointment type availability per location
      let appointmentTypeLocations: Record<string, boolean> = {};
      if (input.appointmentTypeId) {
        const typeLocations = await prisma.appointmentTypeLocation.findMany({
          where: {
            appointmentTypeId: input.appointmentTypeId,
            locationId: { in: locations.map((l) => l.id) },
          },
        });

        for (const tl of typeLocations) {
          appointmentTypeLocations[tl.locationId] = tl.isEnabled;
        }
      }

      return locations.map((location) => ({
        location: {
          id: location.id,
          name: location.name,
          code: location.code,
          address: `${location.addressLine1}, ${location.city}, ${location.state}`,
          timezone: location.timezone,
          isPrimary: location.isPrimary,
        },
        hours: location.locationHours,
        settings: location.locationSettings,
        appointmentCount: countByLocation[location.id] || 0,
        providerCount: providersByLocation[location.id] || 0,
        appointmentTypeAvailable: input.appointmentTypeId
          ? appointmentTypeLocations[location.id] !== false // Default to available if not configured
          : true,
        hasAvailability: (providersByLocation[location.id] || 0) > 0,
      }));
    }),

  /**
   * Find available slots across all locations
   */
  findAvailableSlots: protectedProcedure
    .input(
      z.object({
        date: z.date(),
        duration: z.number(), // Minutes
        appointmentTypeId: z.string().optional(),
        providerId: z.string().optional(),
        locationIds: z.array(z.string()).optional(), // Filter to specific locations
      })
    )
    .query(async ({ ctx, input }) => {
      // Get locations to search
      const whereLocation: Prisma.LocationWhereInput = {
        organizationId: ctx.user.organizationId,
        isActive: true,
        deletedAt: null,
      };

      if (input.locationIds && input.locationIds.length > 0) {
        whereLocation.id = { in: input.locationIds };
      }

      const locations = await prisma.location.findMany({
        where: whereLocation,
        include: {
          locationHours: true,
          locationSettings: true,
        },
      });

      const startOfDay = new Date(input.date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(input.date);
      endOfDay.setHours(23, 59, 59, 999);

      const dayOfWeek = input.date.getDay();

      const results: Array<{
        locationId: string;
        locationName: string;
        providerId: string;
        providerName: string;
        slots: Array<{ start: Date; end: Date }>;
      }> = [];

      for (const location of locations) {
        // Get location hours for this day
        const hours = location.locationHours.find((h) => h.dayOfWeek === dayOfWeek);
        if (!hours || !hours.isOpen || !hours.openTime || !hours.closeTime) {
          continue; // Location closed this day
        }

        // Get providers at this location
        const locationProviders = await prisma.locationStaff.findMany({
          where: {
            locationId: location.id,
            isActive: true,
            ...(input.providerId && { user: { provider: { id: input.providerId } } }),
            user: {
              provider: {
                isActive: true,
              },
            },
          },
          include: {
            user: {
              include: {
                provider: {
                  include: {
                    schedules: { where: { isActive: true } },
                    exceptions: {
                      where: {
                        date: {
                          gte: startOfDay,
                          lte: endOfDay,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        });

        for (const staff of locationProviders) {
          const provider = staff.user.provider;
          if (!provider) continue;

          // Check provider schedule for this day
          const providerSchedule = provider.schedules.find((s) => {
            const dayMap: Record<string, number> = {
              SUNDAY: 0,
              MONDAY: 1,
              TUESDAY: 2,
              WEDNESDAY: 3,
              THURSDAY: 4,
              FRIDAY: 5,
              SATURDAY: 6,
            };
            return dayMap[s.dayOfWeek] === dayOfWeek;
          });

          if (!providerSchedule) continue;

          // Check for exceptions
          const exception = provider.exceptions.find(
            (e) => e.date.toDateString() === input.date.toDateString()
          );

          if (exception && !exception.isAvailable) continue;

          // Get existing appointments for this provider on this day
          const appointments = await prisma.appointment.findMany({
            where: {
              providerId: provider.id,
              startTime: { gte: startOfDay },
              endTime: { lte: endOfDay },
              status: { notIn: ['CANCELLED', 'NO_SHOW'] },
            },
            orderBy: { startTime: 'asc' },
          });

          // Calculate available slots
          const slots: Array<{ start: Date; end: Date }> = [];
          const slotInterval = location.locationSettings?.slotInterval || 15;

          // Parse schedule times
          const [startHour, startMin] = (exception?.startTime || providerSchedule.startTime)
            .split(':')
            .map(Number);
          const [endHour, endMin] = (exception?.endTime || providerSchedule.endTime).split(':').map(Number);

          let current = new Date(input.date);
          current.setHours(startHour, startMin, 0, 0);

          const scheduleEnd = new Date(input.date);
          scheduleEnd.setHours(endHour, endMin, 0, 0);

          while (current.getTime() + input.duration * 60000 <= scheduleEnd.getTime()) {
            const slotEnd = new Date(current.getTime() + input.duration * 60000);

            // Check if slot overlaps with any appointment
            const hasConflict = appointments.some(
              (apt) =>
                current < apt.endTime && slotEnd > apt.startTime
            );

            if (!hasConflict && current > new Date()) {
              slots.push({
                start: new Date(current),
                end: new Date(slotEnd),
              });
            }

            current = new Date(current.getTime() + slotInterval * 60000);
          }

          if (slots.length > 0) {
            results.push({
              locationId: location.id,
              locationName: location.name,
              providerId: provider.id,
              providerName: `${staff.user.firstName} ${staff.user.lastName}`,
              slots,
            });
          }
        }
      }

      return results;
    }),

  // ==========================================
  // LOCATION-SPECIFIC APPOINTMENT TYPES
  // ==========================================

  /**
   * Get appointment types available at a location
   */
  getLocationAppointmentTypes: protectedProcedure
    .input(
      z.object({
        locationId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify location
      const location = await prisma.location.findFirst({
        where: {
          id: input.locationId,
          organizationId: ctx.user.organizationId,
          isActive: true,
          deletedAt: null,
        },
      });

      if (!location) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Location not found',
        });
      }

      // Get all appointment types with their location-specific settings
      const appointmentTypes = await prisma.appointmentType.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          isActive: true,
        },
        include: {
          locationAvailability: {
            where: {
              locationId: input.locationId,
            },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });

      return appointmentTypes.map((type) => {
        const locationConfig = type.locationAvailability[0];
        return {
          ...type,
          isEnabledAtLocation: locationConfig ? locationConfig.isEnabled : true, // Default to enabled
          durationAtLocation: locationConfig?.durationOverride || type.duration,
          priceAtLocation: locationConfig?.priceOverride || type.defaultPrice,
          hasLocationConfig: !!locationConfig,
        };
      });
    }),

  /**
   * Configure appointment type availability at a location
   */
  setAppointmentTypeLocation: protectedProcedure
    .input(
      z.object({
        appointmentTypeId: z.string(),
        locationId: z.string(),
        isEnabled: z.boolean(),
        durationOverride: z.number().optional(),
        priceOverride: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify appointment type
      const appointmentType = await prisma.appointmentType.findFirst({
        where: {
          id: input.appointmentTypeId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!appointmentType) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Appointment type not found',
        });
      }

      // Verify location
      const location = await prisma.location.findFirst({
        where: {
          id: input.locationId,
          organizationId: ctx.user.organizationId,
          isActive: true,
          deletedAt: null,
        },
      });

      if (!location) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Location not found',
        });
      }

      // Upsert the location configuration
      const config = await prisma.appointmentTypeLocation.upsert({
        where: {
          appointmentTypeId_locationId: {
            appointmentTypeId: input.appointmentTypeId,
            locationId: input.locationId,
          },
        },
        create: {
          appointmentTypeId: input.appointmentTypeId,
          locationId: input.locationId,
          isEnabled: input.isEnabled,
          durationOverride: input.durationOverride,
          priceOverride: input.priceOverride,
        },
        update: {
          isEnabled: input.isEnabled,
          durationOverride: input.durationOverride,
          priceOverride: input.priceOverride,
        },
      });

      await createAuditLog({
        action: 'APPOINTMENT_TYPE_LOCATION_UPDATE' as AuditAction,
        entityType: 'AppointmentTypeLocation',
        entityId: config.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          appointmentTypeId: input.appointmentTypeId,
          locationId: input.locationId,
          isEnabled: input.isEnabled,
          durationOverride: input.durationOverride,
          priceOverride: input.priceOverride,
        },
      });

      return config;
    }),

  /**
   * Bulk configure appointment types for a location
   */
  bulkSetAppointmentTypeLocations: protectedProcedure
    .input(
      z.object({
        locationId: z.string(),
        configurations: z.array(
          z.object({
            appointmentTypeId: z.string(),
            isEnabled: z.boolean(),
            durationOverride: z.number().optional(),
            priceOverride: z.number().optional(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify location
      const location = await prisma.location.findFirst({
        where: {
          id: input.locationId,
          organizationId: ctx.user.organizationId,
          isActive: true,
          deletedAt: null,
        },
      });

      if (!location) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Location not found',
        });
      }

      // Verify all appointment types
      const typeIds = input.configurations.map((c) => c.appointmentTypeId);
      const types = await prisma.appointmentType.findMany({
        where: {
          id: { in: typeIds },
          organizationId: ctx.user.organizationId,
        },
      });

      if (types.length !== typeIds.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'One or more appointment types not found',
        });
      }

      // Upsert all configurations in a transaction
      const results = await prisma.$transaction(
        input.configurations.map((config) =>
          prisma.appointmentTypeLocation.upsert({
            where: {
              appointmentTypeId_locationId: {
                appointmentTypeId: config.appointmentTypeId,
                locationId: input.locationId,
              },
            },
            create: {
              appointmentTypeId: config.appointmentTypeId,
              locationId: input.locationId,
              isEnabled: config.isEnabled,
              durationOverride: config.durationOverride,
              priceOverride: config.priceOverride,
            },
            update: {
              isEnabled: config.isEnabled,
              durationOverride: config.durationOverride,
              priceOverride: config.priceOverride,
            },
          })
        )
      );

      await createAuditLog({
        action: 'APPOINTMENT_TYPE_LOCATION_UPDATE' as AuditAction,
        entityType: 'AppointmentTypeLocation',
        entityId: input.locationId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          locationId: input.locationId,
          bulkUpdate: true,
          count: input.configurations.length,
        },
      });

      return { updated: results.length };
    }),

  // ==========================================
  // APPOINTMENTS BY LOCATION
  // ==========================================

  /**
   * List appointments at a specific location
   */
  listAppointmentsByLocation: protectedProcedure
    .input(
      z.object({
        locationId: z.string(),
        startDate: z.date(),
        endDate: z.date(),
        providerId: z.string().optional(),
        status: z.array(z.string()).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify location
      const location = await prisma.location.findFirst({
        where: {
          id: input.locationId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!location) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Location not found',
        });
      }

      const appointments = await prisma.appointment.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          locationId: input.locationId,
          startTime: { gte: input.startDate },
          endTime: { lte: input.endDate },
          ...(input.providerId && { providerId: input.providerId }),
          ...(input.status && { status: { in: input.status as any[] } }),
        },
        include: {
          patient: {
            include: {
              demographics: {
                select: {
                  firstName: true,
                  lastName: true,
                  preferredName: true,
                  dateOfBirth: true,
                },
              },
            },
          },
          provider: {
            include: {
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          appointmentType: true,
          room: true,
          location: true,
        },
        orderBy: { startTime: 'asc' },
      });

      return appointments;
    }),

  /**
   * Get appointment statistics by location
   */
  getLocationStats: protectedProcedure
    .input(
      z.object({
        startDate: z.date(),
        endDate: z.date(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Get all locations
      const locations = await prisma.location.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          isActive: true,
          deletedAt: null,
        },
      });

      // Get appointment counts by location and status
      const stats = await prisma.appointment.groupBy({
        by: ['locationId', 'status'],
        where: {
          organizationId: ctx.user.organizationId,
          startTime: { gte: input.startDate },
          endTime: { lte: input.endDate },
          locationId: { not: null },
        },
        _count: { id: true },
      });

      // Organize stats by location
      const statsByLocation: Record<
        string,
        {
          total: number;
          scheduled: number;
          confirmed: number;
          checkedIn: number;
          inProgress: number;
          completed: number;
          cancelled: number;
          noShow: number;
        }
      > = {};

      for (const location of locations) {
        statsByLocation[location.id] = {
          total: 0,
          scheduled: 0,
          confirmed: 0,
          checkedIn: 0,
          inProgress: 0,
          completed: 0,
          cancelled: 0,
          noShow: 0,
        };
      }

      for (const stat of stats) {
        if (stat.locationId && statsByLocation[stat.locationId]) {
          const count = stat._count.id;
          statsByLocation[stat.locationId].total += count;

          switch (stat.status) {
            case 'SCHEDULED':
              statsByLocation[stat.locationId].scheduled = count;
              break;
            case 'CONFIRMED':
              statsByLocation[stat.locationId].confirmed = count;
              break;
            case 'CHECKED_IN':
              statsByLocation[stat.locationId].checkedIn = count;
              break;
            case 'IN_PROGRESS':
              statsByLocation[stat.locationId].inProgress = count;
              break;
            case 'COMPLETED':
              statsByLocation[stat.locationId].completed = count;
              break;
            case 'CANCELLED':
              statsByLocation[stat.locationId].cancelled = count;
              break;
            case 'NO_SHOW':
              statsByLocation[stat.locationId].noShow = count;
              break;
          }
        }
      }

      return locations.map((location) => ({
        location: {
          id: location.id,
          name: location.name,
          code: location.code,
        },
        stats: statsByLocation[location.id],
      }));
    }),
});
