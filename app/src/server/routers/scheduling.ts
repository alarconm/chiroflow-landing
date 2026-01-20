import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditAction } from '@/lib/audit';
import {
  DayOfWeek,
  AppointmentStatus,
  RecurringFrequency,
  BlockType,
  WaitlistPriority,
  Prisma,
} from '@prisma/client';

// ============================================
// INPUT SCHEMAS
// ============================================

const dayOfWeekSchema = z.nativeEnum(DayOfWeek);
const appointmentStatusSchema = z.nativeEnum(AppointmentStatus);
const recurringFrequencySchema = z.nativeEnum(RecurringFrequency);
const blockTypeSchema = z.nativeEnum(BlockType);
const waitlistPrioritySchema = z.nativeEnum(WaitlistPriority);

// Time string validation (HH:MM format)
const timeStringSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be in HH:MM format');

// ============================================
// PROVIDER ROUTES
// ============================================

export const schedulingRouter = router({
  // ==========================================
  // PROVIDERS
  // ==========================================

  listProviders: protectedProcedure
    .input(
      z.object({
        includeInactive: z.boolean().optional().default(false),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const providers = await prisma.provider.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          ...(input?.includeInactive ? {} : { isActive: true }),
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { user: { lastName: 'asc' } }],
      });

      return providers;
    }),

  getProvider: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const provider = await prisma.provider.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
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
          schedules: {
            where: { isActive: true },
            orderBy: { dayOfWeek: 'asc' },
          },
          exceptions: {
            where: {
              date: { gte: new Date() },
            },
            orderBy: { date: 'asc' },
            take: 30,
          },
        },
      });

      if (!provider) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Provider not found',
        });
      }

      return provider;
    }),

  createProvider: protectedProcedure
    .input(
      z.object({
        userId: z.string(),
        title: z.string().optional(),
        specialty: z.string().optional(),
        npiNumber: z.string().optional(),
        licenseNumber: z.string().optional(),
        color: z.string().optional(),
        bio: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify user exists and belongs to org
      const user = await prisma.user.findFirst({
        where: {
          id: input.userId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Check if user already has a provider profile
      const existing = await prisma.provider.findUnique({
        where: { userId: input.userId },
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'User already has a provider profile',
        });
      }

      const provider = await prisma.provider.create({
        data: {
          userId: input.userId,
          organizationId: ctx.user.organizationId,
          title: input.title,
          specialty: input.specialty,
          npiNumber: input.npiNumber,
          licenseNumber: input.licenseNumber,
          color: input.color || '#3B82F6',
          bio: input.bio,
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      await createAuditLog({
        action: 'CREATE' as AuditAction,
        entityType: 'Provider',
        entityId: provider.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { created: input },
      });

      return provider;
    }),

  updateProvider: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        specialty: z.string().optional(),
        npiNumber: z.string().optional(),
        licenseNumber: z.string().optional(),
        color: z.string().optional(),
        bio: z.string().optional(),
        isActive: z.boolean().optional(),
        sortOrder: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const existing = await prisma.provider.findFirst({
        where: { id, organizationId: ctx.user.organizationId },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Provider not found',
        });
      }

      const provider = await prisma.provider.update({
        where: { id },
        data,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      await createAuditLog({
        action: 'UPDATE' as AuditAction,
        entityType: 'Provider',
        entityId: id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { before: existing, after: data },
      });

      return provider;
    }),

  // ==========================================
  // PROVIDER SCHEDULES
  // ==========================================

  getProviderSchedule: protectedProcedure
    .input(z.object({ providerId: z.string() }))
    .query(async ({ ctx, input }) => {
      const schedules = await prisma.providerSchedule.findMany({
        where: {
          providerId: input.providerId,
          provider: { organizationId: ctx.user.organizationId },
        },
        orderBy: { dayOfWeek: 'asc' },
      });

      return schedules;
    }),

  setProviderSchedule: protectedProcedure
    .input(
      z.object({
        providerId: z.string(),
        schedules: z.array(
          z.object({
            dayOfWeek: dayOfWeekSchema,
            startTime: timeStringSchema,
            endTime: timeStringSchema,
            isActive: z.boolean().optional().default(true),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify provider belongs to org
      const provider = await prisma.provider.findFirst({
        where: {
          id: input.providerId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!provider) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Provider not found',
        });
      }

      // Delete existing schedules and create new ones
      await prisma.$transaction([
        prisma.providerSchedule.deleteMany({
          where: { providerId: input.providerId },
        }),
        prisma.providerSchedule.createMany({
          data: input.schedules.map((s) => ({
            providerId: input.providerId,
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            isActive: s.isActive,
          })),
        }),
      ]);

      await createAuditLog({
        action: 'UPDATE' as AuditAction,
        entityType: 'ProviderSchedule',
        entityId: input.providerId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { schedules: input.schedules },
      });

      return { success: true };
    }),

  // ==========================================
  // PROVIDER EXCEPTIONS
  // ==========================================

  createProviderException: protectedProcedure
    .input(
      z.object({
        providerId: z.string(),
        date: z.date(),
        isAvailable: z.boolean().default(false),
        startTime: timeStringSchema.optional(),
        endTime: timeStringSchema.optional(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const provider = await prisma.provider.findFirst({
        where: {
          id: input.providerId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!provider) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Provider not found',
        });
      }

      const exception = await prisma.providerException.upsert({
        where: {
          providerId_date: {
            providerId: input.providerId,
            date: input.date,
          },
        },
        create: {
          providerId: input.providerId,
          date: input.date,
          isAvailable: input.isAvailable,
          startTime: input.startTime,
          endTime: input.endTime,
          reason: input.reason,
        },
        update: {
          isAvailable: input.isAvailable,
          startTime: input.startTime,
          endTime: input.endTime,
          reason: input.reason,
        },
      });

      await createAuditLog({
        action: 'CREATE' as AuditAction,
        entityType: 'ProviderException',
        entityId: exception.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: input,
      });

      return exception;
    }),

  deleteProviderException: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const exception = await prisma.providerException.findFirst({
        where: {
          id: input.id,
          provider: { organizationId: ctx.user.organizationId },
        },
      });

      if (!exception) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Exception not found',
        });
      }

      await prisma.providerException.delete({
        where: { id: input.id },
      });

      await createAuditLog({
        action: 'DELETE' as AuditAction,
        entityType: 'ProviderException',
        entityId: input.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // Get provider availability for a date range
  getProviderAvailability: protectedProcedure
    .input(
      z.object({
        providerId: z.string(),
        startDate: z.date(),
        endDate: z.date(),
      })
    )
    .query(async ({ ctx, input }) => {
      const provider = await prisma.provider.findFirst({
        where: {
          id: input.providerId,
          organizationId: ctx.user.organizationId,
        },
        include: {
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

      // Get existing appointments in range
      const appointments = await prisma.appointment.findMany({
        where: {
          providerId: input.providerId,
          startTime: { gte: input.startDate },
          endTime: { lte: input.endDate },
          status: {
            notIn: ['CANCELLED', 'NO_SHOW'],
          },
        },
        select: {
          startTime: true,
          endTime: true,
        },
      });

      // Get blocks in range
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
        },
      });

      return {
        schedules: provider.schedules,
        exceptions: provider.exceptions,
        appointments,
        blocks,
      };
    }),

  // ==========================================
  // APPOINTMENT TYPES
  // ==========================================

  listAppointmentTypes: protectedProcedure
    .input(
      z.object({
        includeInactive: z.boolean().optional().default(false),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const types = await prisma.appointmentType.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          ...(input?.includeInactive ? {} : { isActive: true }),
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });

      return types;
    }),

  getAppointmentType: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const type = await prisma.appointmentType.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!type) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Appointment type not found',
        });
      }

      return type;
    }),

  createAppointmentType: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        code: z.string().optional(),
        description: z.string().optional(),
        duration: z.number().min(5).max(480),
        color: z.string().optional(),
        requiresRoom: z.boolean().optional(),
        defaultPrice: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check for duplicate code
      if (input.code) {
        const existing = await prisma.appointmentType.findFirst({
          where: {
            code: input.code,
            organizationId: ctx.user.organizationId,
          },
        });

        if (existing) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Appointment type code already exists',
          });
        }
      }

      const type = await prisma.appointmentType.create({
        data: {
          organizationId: ctx.user.organizationId,
          name: input.name,
          code: input.code,
          description: input.description,
          duration: input.duration,
          color: input.color || '#10B981',
          requiresRoom: input.requiresRoom ?? true,
          defaultPrice: input.defaultPrice,
        },
      });

      await createAuditLog({
        action: 'CREATE' as AuditAction,
        entityType: 'AppointmentType',
        entityId: type.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { created: input },
      });

      return type;
    }),

  updateAppointmentType: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        code: z.string().optional(),
        description: z.string().optional(),
        duration: z.number().min(5).max(480).optional(),
        color: z.string().optional(),
        requiresRoom: z.boolean().optional(),
        defaultPrice: z.number().optional(),
        isActive: z.boolean().optional(),
        sortOrder: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const existing = await prisma.appointmentType.findFirst({
        where: { id, organizationId: ctx.user.organizationId },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Appointment type not found',
        });
      }

      const type = await prisma.appointmentType.update({
        where: { id },
        data,
      });

      await createAuditLog({
        action: 'UPDATE' as AuditAction,
        entityType: 'AppointmentType',
        entityId: id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { before: existing, after: data },
      });

      return type;
    }),

  // ==========================================
  // ROOMS
  // ==========================================

  listRooms: protectedProcedure
    .input(
      z.object({
        includeInactive: z.boolean().optional().default(false),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const rooms = await prisma.room.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          ...(input?.includeInactive ? {} : { isActive: true }),
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });

      return rooms;
    }),

  createRoom: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        capacity: z.number().min(1).optional(),
        equipment: z.array(z.string()).optional(),
        color: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const room = await prisma.room.create({
        data: {
          organizationId: ctx.user.organizationId,
          name: input.name,
          description: input.description,
          capacity: input.capacity || 1,
          equipment: input.equipment || [],
          color: input.color || '#6366F1',
        },
      });

      await createAuditLog({
        action: 'CREATE' as AuditAction,
        entityType: 'Room',
        entityId: room.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { created: input },
      });

      return room;
    }),

  updateRoom: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        capacity: z.number().min(1).optional(),
        equipment: z.array(z.string()).optional(),
        color: z.string().optional(),
        isActive: z.boolean().optional(),
        sortOrder: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const existing = await prisma.room.findFirst({
        where: { id, organizationId: ctx.user.organizationId },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Room not found',
        });
      }

      const room = await prisma.room.update({
        where: { id },
        data,
      });

      await createAuditLog({
        action: 'UPDATE' as AuditAction,
        entityType: 'Room',
        entityId: id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { before: existing, after: data },
      });

      return room;
    }),

  // Get room availability for a time slot
  getRoomAvailability: protectedProcedure
    .input(
      z.object({
        startTime: z.date(),
        endTime: z.date(),
        excludeAppointmentId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const rooms = await prisma.room.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          isActive: true,
        },
      });

      // Find appointments in time range
      const appointments = await prisma.appointment.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          roomId: { not: null },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          id: input.excludeAppointmentId ? { not: input.excludeAppointmentId } : undefined,
          OR: [
            {
              startTime: { lt: input.endTime },
              endTime: { gt: input.startTime },
            },
          ],
        },
        select: {
          roomId: true,
        },
      });

      const bookedRoomIds = new Set(appointments.map((a) => a.roomId));

      return rooms.map((room) => ({
        ...room,
        isAvailable: !bookedRoomIds.has(room.id),
      }));
    }),

  // ==========================================
  // RESOURCES
  // ==========================================

  listResources: protectedProcedure
    .input(
      z.object({
        includeInactive: z.boolean().optional().default(false),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const resources = await prisma.resource.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          ...(input?.includeInactive ? {} : { isActive: true }),
        },
        orderBy: { name: 'asc' },
      });

      return resources;
    }),

  createResource: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        type: z.string().optional(),
        description: z.string().optional(),
        quantity: z.number().min(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const resource = await prisma.resource.create({
        data: {
          organizationId: ctx.user.organizationId,
          name: input.name,
          type: input.type,
          description: input.description,
          quantity: input.quantity || 1,
        },
      });

      await createAuditLog({
        action: 'CREATE' as AuditAction,
        entityType: 'Resource',
        entityId: resource.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { created: input },
      });

      return resource;
    }),

  updateResource: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        type: z.string().optional(),
        description: z.string().optional(),
        quantity: z.number().min(1).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const existing = await prisma.resource.findFirst({
        where: { id, organizationId: ctx.user.organizationId },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Resource not found',
        });
      }

      const resource = await prisma.resource.update({
        where: { id },
        data,
      });

      await createAuditLog({
        action: 'UPDATE' as AuditAction,
        entityType: 'Resource',
        entityId: id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { before: existing, after: data },
      });

      return resource;
    }),

  // ==========================================
  // APPOINTMENTS
  // ==========================================

  listAppointments: protectedProcedure
    .input(
      z.object({
        startDate: z.date(),
        endDate: z.date(),
        providerId: z.string().optional(),
        providerIds: z.array(z.string()).optional(),
        patientId: z.string().optional(),
        roomId: z.string().optional(),
        status: z.array(appointmentStatusSchema).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Support both single providerId and multiple providerIds
      const providerFilter = input.providerIds
        ? { providerId: { in: input.providerIds } }
        : input.providerId
        ? { providerId: input.providerId }
        : {};

      const appointments = await prisma.appointment.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          startTime: { gte: input.startDate },
          endTime: { lte: input.endDate },
          ...providerFilter,
          ...(input.patientId && { patientId: input.patientId }),
          ...(input.roomId && { roomId: input.roomId }),
          ...(input.status && { status: { in: input.status } }),
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
        },
        orderBy: { startTime: 'asc' },
      });

      return appointments;
    }),

  getAppointment: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const appointment = await prisma.appointment.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            include: {
              demographics: true,
              contacts: { where: { isPrimary: true }, take: 1 },
            },
          },
          provider: {
            include: {
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
          appointmentType: true,
          room: true,
          recurringSeries: true,
          resources: {
            include: { resource: true },
          },
        },
      });

      if (!appointment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Appointment not found',
        });
      }

      await createAuditLog({
        action: 'VIEW' as AuditAction,
        entityType: 'Appointment',
        entityId: input.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return appointment;
    }),

  createAppointment: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
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
      // Verify patient exists
      const patient = await prisma.patient.findFirst({
        where: { id: input.patientId, organizationId: ctx.user.organizationId },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Verify provider exists
      const provider = await prisma.provider.findFirst({
        where: { id: input.providerId, organizationId: ctx.user.organizationId },
      });

      if (!provider) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Provider not found',
        });
      }

      // Check for provider conflicts
      const providerConflict = await prisma.appointment.findFirst({
        where: {
          providerId: input.providerId,
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          OR: [
            {
              startTime: { lt: input.endTime },
              endTime: { gt: input.startTime },
            },
          ],
        },
      });

      if (providerConflict) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Provider already has an appointment at this time',
        });
      }

      // Check for room conflicts if room specified
      if (input.roomId) {
        const roomConflict = await prisma.appointment.findFirst({
          where: {
            roomId: input.roomId,
            status: { notIn: ['CANCELLED', 'NO_SHOW'] },
            OR: [
              {
                startTime: { lt: input.endTime },
                endTime: { gt: input.startTime },
              },
            ],
          },
        });

        if (roomConflict) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Room is already booked at this time',
          });
        }
      }

      // Check for schedule blocks
      const blockConflict = await prisma.scheduleBlock.findFirst({
        where: {
          OR: [
            { providerId: input.providerId },
            { providerId: null, organizationId: ctx.user.organizationId },
          ],
          startTime: { lt: input.endTime },
          endTime: { gt: input.startTime },
        },
      });

      if (blockConflict) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Cannot book during ${blockConflict.title} (${blockConflict.blockType})`,
        });
      }

      const appointment = await prisma.appointment.create({
        data: {
          organizationId: ctx.user.organizationId,
          patientId: input.patientId,
          providerId: input.providerId,
          appointmentTypeId: input.appointmentTypeId,
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
        },
      });

      await createAuditLog({
        action: 'CREATE' as AuditAction,
        entityType: 'Appointment',
        entityId: appointment.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { created: input },
      });

      return appointment;
    }),

  updateAppointment: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        startTime: z.date().optional(),
        endTime: z.date().optional(),
        providerId: z.string().optional(),
        roomId: z.string().nullable().optional(),
        appointmentTypeId: z.string().optional(),
        notes: z.string().optional(),
        patientNotes: z.string().optional(),
        chiefComplaint: z.string().optional(),
        status: appointmentStatusSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const existing = await prisma.appointment.findFirst({
        where: { id, organizationId: ctx.user.organizationId },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Appointment not found',
        });
      }

      // Check for conflicts if time or provider changed
      const startTime = input.startTime || existing.startTime;
      const endTime = input.endTime || existing.endTime;
      const providerId = input.providerId || existing.providerId;
      const roomId = input.roomId === null ? null : (input.roomId || existing.roomId);

      if (input.startTime || input.endTime || input.providerId) {
        const providerConflict = await prisma.appointment.findFirst({
          where: {
            id: { not: id },
            providerId,
            status: { notIn: ['CANCELLED', 'NO_SHOW'] },
            OR: [
              {
                startTime: { lt: endTime },
                endTime: { gt: startTime },
              },
            ],
          },
        });

        if (providerConflict) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Provider already has an appointment at this time',
          });
        }
      }

      if (roomId && (input.startTime || input.endTime || input.roomId)) {
        const roomConflict = await prisma.appointment.findFirst({
          where: {
            id: { not: id },
            roomId,
            status: { notIn: ['CANCELLED', 'NO_SHOW'] },
            OR: [
              {
                startTime: { lt: endTime },
                endTime: { gt: startTime },
              },
            ],
          },
        });

        if (roomConflict) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Room is already booked at this time',
          });
        }
      }

      const appointment = await prisma.appointment.update({
        where: { id },
        data: {
          ...data,
          roomId,
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
        },
      });

      await createAuditLog({
        action: 'UPDATE' as AuditAction,
        entityType: 'Appointment',
        entityId: id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { before: existing, after: data },
      });

      return appointment;
    }),

  updateAppointmentStatus: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: appointmentStatusSchema,
        reason: z.string().optional(), // For cancellation
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.appointment.findFirst({
        where: { id: input.id, organizationId: ctx.user.organizationId },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Appointment not found',
        });
      }

      const updateData: Prisma.AppointmentUpdateInput = {
        status: input.status,
      };

      // Add tracking fields based on status
      switch (input.status) {
        case 'CONFIRMED':
          updateData.confirmedAt = new Date();
          updateData.confirmedBy = ctx.user.id;
          break;
        case 'CHECKED_IN':
          updateData.checkedInAt = new Date();
          updateData.checkedInBy = ctx.user.id;
          break;
        case 'COMPLETED':
          updateData.completedAt = new Date();
          updateData.completedBy = ctx.user.id;
          break;
        case 'CANCELLED':
          updateData.cancelledAt = new Date();
          updateData.cancelledBy = ctx.user.id;
          updateData.cancelReason = input.reason;
          break;
      }

      const appointment = await prisma.appointment.update({
        where: { id: input.id },
        data: updateData,
      });

      await createAuditLog({
        action: 'UPDATE' as AuditAction,
        entityType: 'Appointment',
        entityId: input.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          statusChange: {
            from: existing.status,
            to: input.status,
            reason: input.reason,
          },
        },
      });

      return appointment;
    }),

  cancelAppointment: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        reason: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.appointment.findFirst({
        where: { id: input.id, organizationId: ctx.user.organizationId },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Appointment not found',
        });
      }

      const appointment = await prisma.appointment.update({
        where: { id: input.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledBy: ctx.user.id,
          cancelReason: input.reason,
        },
      });

      await createAuditLog({
        action: 'UPDATE' as AuditAction,
        entityType: 'Appointment',
        entityId: input.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          cancelled: true,
          reason: input.reason,
        },
      });

      return appointment;
    }),

  getPatientAppointments: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        includeHistory: z.boolean().optional().default(false),
        limit: z.number().optional().default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();

      const appointments = await prisma.appointment.findMany({
        where: {
          patientId: input.patientId,
          organizationId: ctx.user.organizationId,
          ...(input.includeHistory
            ? {}
            : {
                OR: [
                  { startTime: { gte: now } },
                  { status: { in: ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'] } },
                ],
              }),
        },
        include: {
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
        },
        orderBy: { startTime: input.includeHistory ? 'desc' : 'asc' },
        take: input.limit,
      });

      return appointments;
    }),

  // ==========================================
  // SCHEDULE BLOCKS
  // ==========================================

  listScheduleBlocks: protectedProcedure
    .input(
      z.object({
        startDate: z.date(),
        endDate: z.date(),
        providerId: z.string().optional(),
        providerIds: z.array(z.string()).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Support both single providerId and multiple providerIds
      // Also include blocks without a provider (org-wide blocks)
      const providerFilter = input.providerIds
        ? { OR: [{ providerId: { in: input.providerIds } }, { providerId: null }] }
        : input.providerId
        ? { OR: [{ providerId: input.providerId }, { providerId: null }] }
        : {};

      const blocks = await prisma.scheduleBlock.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          startTime: { gte: input.startDate },
          endTime: { lte: input.endDate },
          ...providerFilter,
        },
        include: {
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
        },
        orderBy: { startTime: 'asc' },
      });

      return blocks;
    }),

  createScheduleBlock: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        blockType: blockTypeSchema,
        startTime: z.date(),
        endTime: z.date(),
        providerId: z.string().optional(), // null = org-wide
        isRecurring: z.boolean().optional(),
        recurrenceRule: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // If provider specified, verify they exist
      if (input.providerId) {
        const provider = await prisma.provider.findFirst({
          where: { id: input.providerId, organizationId: ctx.user.organizationId },
        });

        if (!provider) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Provider not found',
          });
        }
      }

      const block = await prisma.scheduleBlock.create({
        data: {
          organizationId: ctx.user.organizationId,
          title: input.title,
          blockType: input.blockType,
          startTime: input.startTime,
          endTime: input.endTime,
          providerId: input.providerId,
          isRecurring: input.isRecurring || false,
          recurrenceRule: input.recurrenceRule,
          notes: input.notes,
        },
      });

      await createAuditLog({
        action: 'CREATE' as AuditAction,
        entityType: 'ScheduleBlock',
        entityId: block.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { created: input },
      });

      return block;
    }),

  updateScheduleBlock: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).optional(),
        blockType: blockTypeSchema.optional(),
        startTime: z.date().optional(),
        endTime: z.date().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const existing = await prisma.scheduleBlock.findFirst({
        where: { id, organizationId: ctx.user.organizationId },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Schedule block not found',
        });
      }

      const block = await prisma.scheduleBlock.update({
        where: { id },
        data,
      });

      await createAuditLog({
        action: 'UPDATE' as AuditAction,
        entityType: 'ScheduleBlock',
        entityId: id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { before: existing, after: data },
      });

      return block;
    }),

  deleteScheduleBlock: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.scheduleBlock.findFirst({
        where: { id: input.id, organizationId: ctx.user.organizationId },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Schedule block not found',
        });
      }

      await prisma.scheduleBlock.delete({
        where: { id: input.id },
      });

      await createAuditLog({
        action: 'DELETE' as AuditAction,
        entityType: 'ScheduleBlock',
        entityId: input.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // ==========================================
  // WAITLIST
  // ==========================================

  listWaitlist: protectedProcedure
    .input(
      z.object({
        appointmentTypeId: z.string().optional(),
        providerId: z.string().optional(),
        includeExpired: z.boolean().optional().default(false),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const entries = await prisma.waitlistEntry.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          isActive: true,
          ...(input?.appointmentTypeId && { appointmentTypeId: input.appointmentTypeId }),
          ...(input?.providerId && { preferredProviderId: input.providerId }),
          ...(input?.includeExpired ? {} : {
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } },
            ],
          }),
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
              contacts: {
                where: { isPrimary: true },
                take: 1,
              },
            },
          },
          appointmentType: true,
          preferredProvider: {
            include: {
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      });

      return entries;
    }),

  addToWaitlist: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        appointmentTypeId: z.string(),
        preferredProviderId: z.string().optional(),
        priority: waitlistPrioritySchema.optional(),
        preferredDays: z.array(dayOfWeekSchema).optional(),
        preferredTimeStart: timeStringSchema.optional(),
        preferredTimeEnd: timeStringSchema.optional(),
        expiresAt: z.date().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify patient
      const patient = await prisma.patient.findFirst({
        where: { id: input.patientId, organizationId: ctx.user.organizationId },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const entry = await prisma.waitlistEntry.create({
        data: {
          organizationId: ctx.user.organizationId,
          patientId: input.patientId,
          appointmentTypeId: input.appointmentTypeId,
          preferredProviderId: input.preferredProviderId,
          priority: input.priority || 'NORMAL',
          preferredDays: input.preferredDays || [],
          preferredTimeStart: input.preferredTimeStart,
          preferredTimeEnd: input.preferredTimeEnd,
          expiresAt: input.expiresAt,
          notes: input.notes,
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
          appointmentType: true,
        },
      });

      await createAuditLog({
        action: 'CREATE' as AuditAction,
        entityType: 'WaitlistEntry',
        entityId: entry.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { created: input },
      });

      return entry;
    }),

  updateWaitlistEntry: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        priority: waitlistPrioritySchema.optional(),
        preferredProviderId: z.string().nullable().optional(),
        preferredDays: z.array(dayOfWeekSchema).optional(),
        preferredTimeStart: timeStringSchema.nullable().optional(),
        preferredTimeEnd: timeStringSchema.nullable().optional(),
        expiresAt: z.date().nullable().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const existing = await prisma.waitlistEntry.findFirst({
        where: { id, organizationId: ctx.user.organizationId },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Waitlist entry not found',
        });
      }

      const entry = await prisma.waitlistEntry.update({
        where: { id },
        data,
      });

      await createAuditLog({
        action: 'UPDATE' as AuditAction,
        entityType: 'WaitlistEntry',
        entityId: id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { before: existing, after: data },
      });

      return entry;
    }),

  removeFromWaitlist: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        scheduledAt: z.date().optional(), // Set if they were scheduled
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.waitlistEntry.findFirst({
        where: { id: input.id, organizationId: ctx.user.organizationId },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Waitlist entry not found',
        });
      }

      await prisma.waitlistEntry.update({
        where: { id: input.id },
        data: {
          isActive: false,
          scheduledAt: input.scheduledAt,
        },
      });

      await createAuditLog({
        action: 'UPDATE' as AuditAction,
        entityType: 'WaitlistEntry',
        entityId: input.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          removed: true,
          scheduledAt: input.scheduledAt,
        },
      });

      return { success: true };
    }),

  // ==========================================
  // RECURRING SERIES
  // ==========================================

  createRecurringSeries: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        providerId: z.string(),
        appointmentTypeId: z.string(),
        roomId: z.string().optional(),
        startTime: z.date(), // First appointment time
        endTime: z.date(), // First appointment end time
        frequency: recurringFrequencySchema,
        occurrences: z.number().min(2).max(52).optional(),
        seriesEndDate: z.date().optional(),
        notes: z.string().optional(),
        skipConflicts: z.boolean().optional().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Calculate appointment dates
      const dates: { start: Date; end: Date }[] = [];
      let currentStart = new Date(input.startTime);
      let currentEnd = new Date(input.endTime);
      const duration = currentEnd.getTime() - currentStart.getTime();

      const maxOccurrences = input.occurrences || 52;
      const seriesEnd = input.seriesEndDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

      while (dates.length < maxOccurrences && currentStart < seriesEnd) {
        dates.push({ start: new Date(currentStart), end: new Date(currentEnd) });

        // Advance to next occurrence
        switch (input.frequency) {
          case 'WEEKLY':
            currentStart.setDate(currentStart.getDate() + 7);
            break;
          case 'BI_WEEKLY':
            currentStart.setDate(currentStart.getDate() + 14);
            break;
          case 'MONTHLY':
            currentStart.setMonth(currentStart.getMonth() + 1);
            break;
        }
        currentEnd = new Date(currentStart.getTime() + duration);
      }

      // Create series
      const series = await prisma.recurringSeries.create({
        data: {
          organizationId: ctx.user.organizationId,
          frequency: input.frequency,
          endDate: input.seriesEndDate,
          maxOccurrences: input.occurrences,
          notes: input.notes,
        },
      });

      // Create appointments, checking for conflicts
      const created: string[] = [];
      const skipped: { date: Date; reason: string }[] = [];

      for (const date of dates) {
        // Check provider conflict
        const providerConflict = await prisma.appointment.findFirst({
          where: {
            providerId: input.providerId,
            status: { notIn: ['CANCELLED', 'NO_SHOW'] },
            startTime: { lt: date.end },
            endTime: { gt: date.start },
          },
        });

        if (providerConflict) {
          if (input.skipConflicts) {
            skipped.push({ date: date.start, reason: 'Provider conflict' });
            continue;
          } else {
            throw new TRPCError({
              code: 'CONFLICT',
              message: `Provider conflict on ${date.start.toISOString()}`,
            });
          }
        }

        // Check room conflict
        if (input.roomId) {
          const roomConflict = await prisma.appointment.findFirst({
            where: {
              roomId: input.roomId,
              status: { notIn: ['CANCELLED', 'NO_SHOW'] },
              startTime: { lt: date.end },
              endTime: { gt: date.start },
            },
          });

          if (roomConflict) {
            if (input.skipConflicts) {
              skipped.push({ date: date.start, reason: 'Room conflict' });
              continue;
            } else {
              throw new TRPCError({
                code: 'CONFLICT',
                message: `Room conflict on ${date.start.toISOString()}`,
              });
            }
          }
        }

        // Create appointment
        const appointment = await prisma.appointment.create({
          data: {
            organizationId: ctx.user.organizationId,
            patientId: input.patientId,
            providerId: input.providerId,
            appointmentTypeId: input.appointmentTypeId,
            roomId: input.roomId,
            startTime: date.start,
            endTime: date.end,
            recurringSeriesId: series.id,
            createdBy: ctx.user.id,
          },
        });

        created.push(appointment.id);
      }

      await createAuditLog({
        action: 'CREATE' as AuditAction,
        entityType: 'RecurringSeries',
        entityId: series.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          created: input,
          appointmentsCreated: created.length,
          appointmentsSkipped: skipped.length,
        },
      });

      return {
        series,
        appointmentsCreated: created.length,
        appointmentsSkipped: skipped,
      };
    }),

  cancelRecurringSeries: protectedProcedure
    .input(
      z.object({
        seriesId: z.string(),
        cancelFutureOnly: z.boolean().optional().default(true),
        reason: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const series = await prisma.recurringSeries.findFirst({
        where: { id: input.seriesId, organizationId: ctx.user.organizationId },
      });

      if (!series) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Recurring series not found',
        });
      }

      const whereClause: Prisma.AppointmentWhereInput = {
        recurringSeriesId: input.seriesId,
        status: { notIn: ['CANCELLED', 'COMPLETED'] },
      };

      if (input.cancelFutureOnly) {
        whereClause.startTime = { gte: new Date() };
      }

      const result = await prisma.appointment.updateMany({
        where: whereClause,
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledBy: ctx.user.id,
          cancelReason: input.reason,
        },
      });

      await createAuditLog({
        action: 'UPDATE' as AuditAction,
        entityType: 'RecurringSeries',
        entityId: input.seriesId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          cancelled: true,
          reason: input.reason,
          appointmentsCancelled: result.count,
        },
      });

      return {
        success: true,
        appointmentsCancelled: result.count,
      };
    }),
});
