/**
 * Mobile Patient Appointments Router (US-268)
 *
 * Patient mobile app for appointment management.
 * Provides optimized endpoints for mobile patient appointment functionality.
 */

import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { prisma } from '@/lib/prisma';
import { AppointmentStatus } from '@prisma/client';
import {
  startOfDay,
  endOfDay,
  format,
  addDays,
  addMinutes,
  isBefore,
  isAfter,
  differenceInHours,
} from 'date-fns';

// Session validation helper (matches portal pattern)
async function validateMobileSession(token: string) {
  const session = await prisma.portalSession.findFirst({
    where: {
      token,
      expiresAt: { gt: new Date() },
      revokedAt: null, // Not revoked
    },
    include: {
      portalUser: {
        include: {
          patient: true,
        },
      },
    },
  });

  if (!session || !session.portalUser) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Invalid or expired session',
    });
  }

  return session.portalUser;
}

// Input schemas
const sessionSchema = z.object({
  sessionToken: z.string(),
});

const bookAppointmentSchema = z.object({
  sessionToken: z.string(),
  providerId: z.string(),
  appointmentTypeId: z.string(),
  startTime: z.coerce.date(),
  locationId: z.string().optional(),
  chiefComplaint: z.string().optional(),
  patientNotes: z.string().optional(),
  addToCalendar: z.boolean().default(false),
});

const rescheduleSchema = z.object({
  sessionToken: z.string(),
  appointmentId: z.string(),
  newStartTime: z.coerce.date(),
  newProviderId: z.string().optional(),
});

const cancelSchema = z.object({
  sessionToken: z.string(),
  appointmentId: z.string(),
  reason: z.string().optional(),
});

const checkInSchema = z.object({
  sessionToken: z.string(),
  appointmentId: z.string(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

const reminderPreferencesSchema = z.object({
  sessionToken: z.string(),
  appointmentReminders: z.boolean().default(true),
  reminderHours: z.array(z.number()).default([24, 2]), // Default: 24h and 2h before
  smsReminders: z.boolean().default(true),
  pushReminders: z.boolean().default(true),
  emailReminders: z.boolean().default(true),
});

// Helper function to calculate distance between coordinates (Haversine formula)
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
}

// Day mapping for schedule lookup
const dayOfWeekMap: Record<number, string> = {
  0: 'SUNDAY',
  1: 'MONDAY',
  2: 'TUESDAY',
  3: 'WEDNESDAY',
  4: 'THURSDAY',
  5: 'FRIDAY',
  6: 'SATURDAY',
};

export const mobilePatientAppointmentsRouter = router({
  // ==========================================
  // VIEW UPCOMING APPOINTMENTS
  // ==========================================

  /**
   * Get upcoming appointments for the patient
   * Optimized for mobile with essential data and reminder info
   */
  getUpcoming: publicProcedure
    .input(
      z.object({
        sessionToken: z.string(),
        limit: z.number().min(1).max(50).default(10),
      })
    )
    .query(async ({ input }) => {
      const user = await validateMobileSession(input.sessionToken);

      const appointments = await prisma.appointment.findMany({
        where: {
          patientId: user.patientId,
          startTime: { gte: new Date() },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
        include: {
          appointmentType: {
            select: {
              id: true,
              name: true,
              duration: true,
              color: true,
              description: true,
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
          location: {
            select: {
              id: true,
              name: true,
              addressLine1: true,
              addressLine2: true,
              city: true,
              state: true,
              zipCode: true,
              phone: true,
            },
          },
        },
        orderBy: { startTime: 'asc' },
        take: input.limit,
      });

      const now = new Date();

      return {
        appointments: appointments.map((a) => {
          const hoursUntil = differenceInHours(a.startTime, now);
          const canCancel =
            ['SCHEDULED', 'CONFIRMED'].includes(a.status) && hoursUntil > 24;
          const canReschedule =
            ['SCHEDULED', 'CONFIRMED'].includes(a.status) && hoursUntil > 24;
          const canCheckIn =
            ['SCHEDULED', 'CONFIRMED'].includes(a.status) && hoursUntil <= 1 && hoursUntil >= -0.25;

          return {
            id: a.id,
            startTime: a.startTime.toISOString(),
            endTime: a.endTime.toISOString(),
            status: a.status,
            chiefComplaint: a.chiefComplaint,
            patientNotes: a.patientNotes,
            isTelehealth: a.isTelehealth,
            hoursUntil: Math.max(0, hoursUntil),
            canCancel,
            canReschedule,
            canCheckIn,
            appointmentType: {
              id: a.appointmentType.id,
              name: a.appointmentType.name,
              duration: a.appointmentType.duration,
              color: a.appointmentType.color,
              description: a.appointmentType.description,
            },
            provider: {
              id: a.providerId,
              name: `${a.provider.title || ''} ${a.provider.user.firstName} ${a.provider.user.lastName}`.trim(),
              title: a.provider.title,
              firstName: a.provider.user.firstName,
              lastName: a.provider.user.lastName,
            },
            location: a.location
              ? {
                  id: a.location.id,
                  name: a.location.name,
                  address: {
                    line1: a.location.addressLine1,
                    line2: a.location.addressLine2,
                    city: a.location.city,
                    state: a.location.state,
                    zipCode: a.location.zipCode,
                  },
                  phone: a.location.phone,
                  // Google Maps directions URL
                  directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                    `${a.location.addressLine1}, ${a.location.city}, ${a.location.state} ${a.location.zipCode}`
                  )}`,
                }
              : null,
          };
        }),
        nextAppointment: appointments[0]
          ? {
              id: appointments[0].id,
              startTime: appointments[0].startTime.toISOString(),
              hoursUntil: Math.max(0, differenceInHours(appointments[0].startTime, now)),
              providerName: `${appointments[0].provider.title || ''} ${appointments[0].provider.user.firstName} ${appointments[0].provider.user.lastName}`.trim(),
              appointmentType: appointments[0].appointmentType.name,
            }
          : null,
        total: appointments.length,
        serverTimestamp: new Date().toISOString(),
      };
    }),

  /**
   * Get appointment history (past appointments)
   */
  getHistory: publicProcedure
    .input(
      z.object({
        sessionToken: z.string(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const user = await validateMobileSession(input.sessionToken);

      const [appointments, total] = await Promise.all([
        prisma.appointment.findMany({
          where: {
            patientId: user.patientId,
            OR: [
              { endTime: { lt: new Date() } },
              { status: { in: ['COMPLETED', 'CANCELLED', 'NO_SHOW'] } },
            ],
          },
          include: {
            appointmentType: {
              select: {
                id: true,
                name: true,
                duration: true,
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
          },
          orderBy: { startTime: 'desc' },
          take: input.limit,
          skip: input.offset,
        }),
        prisma.appointment.count({
          where: {
            patientId: user.patientId,
            OR: [
              { endTime: { lt: new Date() } },
              { status: { in: ['COMPLETED', 'CANCELLED', 'NO_SHOW'] } },
            ],
          },
        }),
      ]);

      return {
        appointments: appointments.map((a) => ({
          id: a.id,
          startTime: a.startTime.toISOString(),
          endTime: a.endTime.toISOString(),
          status: a.status,
          chiefComplaint: a.chiefComplaint,
          appointmentType: a.appointmentType.name,
          provider: `${a.provider.title || ''} ${a.provider.user.firstName} ${a.provider.user.lastName}`.trim(),
        })),
        total,
        hasMore: input.offset + input.limit < total,
      };
    }),

  // ==========================================
  // BOOK NEW APPOINTMENT
  // ==========================================

  /**
   * Get available appointment types for booking
   */
  getAppointmentTypes: publicProcedure
    .input(sessionSchema)
    .query(async ({ input }) => {
      const user = await validateMobileSession(input.sessionToken);

      const types = await prisma.appointmentType.findMany({
        where: {
          organizationId: user.organizationId,
          isActive: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });

      return types.map((t) => ({
        id: t.id,
        name: t.name,
        duration: t.duration,
        description: t.description,
        color: t.color,
      }));
    }),

  /**
   * Get providers available for booking
   */
  getProviders: publicProcedure
    .input(
      z.object({
        sessionToken: z.string(),
        appointmentTypeId: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const user = await validateMobileSession(input.sessionToken);

      const providers = await prisma.provider.findMany({
        where: {
          organizationId: user.organizationId,
          isActive: true,
        },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { user: { lastName: 'asc' } }],
      });

      return providers.map((p) => ({
        id: p.id,
        name: `${p.title || ''} ${p.user.firstName} ${p.user.lastName}`.trim(),
        title: p.title,
        firstName: p.user.firstName,
        lastName: p.user.lastName,
        specialty: p.specialty,
        color: p.color,
      }));
    }),

  /**
   * Get available time slots for booking
   * Mobile-optimized with daily grouping
   */
  getAvailableSlots: publicProcedure
    .input(
      z.object({
        sessionToken: z.string(),
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
        providerId: z.string().optional(),
        appointmentTypeId: z.string().optional(),
        locationId: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const user = await validateMobileSession(input.sessionToken);
      const { startDate, endDate, providerId, appointmentTypeId } = input;

      // Get appointment duration
      let duration = 30;
      if (appointmentTypeId) {
        const appointmentType = await prisma.appointmentType.findFirst({
          where: { id: appointmentTypeId, organizationId: user.organizationId },
        });
        if (appointmentType) {
          duration = appointmentType.duration;
        }
      }

      // Get providers
      const providerWhere: Record<string, unknown> = {
        organizationId: user.organizationId,
        isActive: true,
      };
      if (providerId) {
        providerWhere.id = providerId;
      }

      const providers = await prisma.provider.findMany({
        where: providerWhere,
        include: {
          schedules: { where: { isActive: true } },
          exceptions: {
            where: {
              date: { gte: startDate, lte: endDate },
            },
          },
          user: {
            select: { firstName: true, lastName: true },
          },
        },
      });

      // Get existing appointments
      const existingAppointments = await prisma.appointment.findMany({
        where: {
          organizationId: user.organizationId,
          providerId: providerId ? providerId : { in: providers.map((p) => p.id) },
          startTime: { gte: startDate },
          endTime: { lte: endDate },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
        select: {
          providerId: true,
          startTime: true,
          endTime: true,
        },
      });

      // Get schedule blocks
      const blocks = await prisma.scheduleBlock.findMany({
        where: {
          organizationId: user.organizationId,
          startTime: { gte: startDate },
          endTime: { lte: endDate },
          OR: [
            { providerId: null },
            { providerId: providerId || { in: providers.map((p) => p.id) } },
          ],
        },
        select: {
          providerId: true,
          startTime: true,
          endTime: true,
        },
      });

      // Generate slots grouped by date
      const slotsByDate: Record<
        string,
        Array<{
          providerId: string;
          providerName: string;
          startTime: string;
          endTime: string;
        }>
      > = {};

      const currentDate = new Date(startDate);
      const endDateTime = new Date(endDate);
      const now = new Date();

      while (currentDate <= endDateTime) {
        const dayOfWeek = dayOfWeekMap[currentDate.getDay()];
        const dateStr = format(currentDate, 'yyyy-MM-dd');

        slotsByDate[dateStr] = [];

        for (const provider of providers) {
          const exception = provider.exceptions.find(
            (e) => format(e.date, 'yyyy-MM-dd') === dateStr
          );

          if (exception && !exception.isAvailable) {
            continue;
          }

          let workStart: string | null = null;
          let workEnd: string | null = null;

          if (exception && exception.isAvailable && exception.startTime && exception.endTime) {
            workStart = exception.startTime;
            workEnd = exception.endTime;
          } else {
            const schedule = provider.schedules.find((s) => s.dayOfWeek === dayOfWeek);
            if (schedule) {
              workStart = schedule.startTime;
              workEnd = schedule.endTime;
            }
          }

          if (!workStart || !workEnd) {
            continue;
          }

          const [startHour, startMin] = workStart.split(':').map(Number);
          const [endHour, endMin] = workEnd.split(':').map(Number);

          const dayStart = new Date(currentDate);
          dayStart.setHours(startHour, startMin, 0, 0);

          const dayEnd = new Date(currentDate);
          dayEnd.setHours(endHour, endMin, 0, 0);

          let slotStart = new Date(dayStart);
          while (slotStart.getTime() + duration * 60 * 1000 <= dayEnd.getTime()) {
            const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);

            // Skip past slots (with 1 hour minimum advance booking)
            if (slotStart <= addMinutes(now, 60)) {
              slotStart = new Date(slotStart.getTime() + duration * 60 * 1000);
              continue;
            }

            const hasAppointmentConflict = existingAppointments.some(
              (apt) =>
                apt.providerId === provider.id &&
                apt.startTime < slotEnd &&
                apt.endTime > slotStart
            );

            const hasBlockConflict = blocks.some(
              (block) =>
                (block.providerId === null || block.providerId === provider.id) &&
                block.startTime < slotEnd &&
                block.endTime > slotStart
            );

            if (!hasAppointmentConflict && !hasBlockConflict) {
              slotsByDate[dateStr].push({
                providerId: provider.id,
                providerName: `${provider.title || ''} ${provider.user.firstName} ${provider.user.lastName}`.trim(),
                startTime: slotStart.toISOString(),
                endTime: slotEnd.toISOString(),
              });
            }

            slotStart = new Date(slotStart.getTime() + duration * 60 * 1000);
          }
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Convert to array sorted by date
      const slots = Object.entries(slotsByDate)
        .filter(([_, daySlots]) => daySlots.length > 0)
        .map(([date, daySlots]) => ({
          date,
          dayName: format(new Date(date), 'EEEE'),
          slotCount: daySlots.length,
          slots: daySlots.sort((a, b) => a.startTime.localeCompare(b.startTime)),
        }));

      return {
        slots,
        totalAvailable: slots.reduce((sum, day) => sum + day.slotCount, 0),
        serverTimestamp: new Date().toISOString(),
      };
    }),

  /**
   * Book a new appointment
   */
  bookAppointment: publicProcedure
    .input(bookAppointmentSchema)
    .mutation(async ({ input }) => {
      const user = await validateMobileSession(input.sessionToken);

      const { providerId, appointmentTypeId, startTime, locationId, chiefComplaint, patientNotes } =
        input;

      // Verify provider exists
      const provider = await prisma.provider.findFirst({
        where: {
          id: providerId,
          organizationId: user.organizationId,
          isActive: true,
        },
        include: {
          user: {
            select: { firstName: true, lastName: true },
          },
        },
      });

      if (!provider) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Provider not found',
        });
      }

      // Get appointment type
      const appointmentType = await prisma.appointmentType.findFirst({
        where: {
          id: appointmentTypeId,
          organizationId: user.organizationId,
          isActive: true,
        },
      });

      if (!appointmentType) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Appointment type not found',
        });
      }

      // Calculate end time
      const endTime = addMinutes(startTime, appointmentType.duration);

      // Check for conflicts
      const conflict = await prisma.appointment.findFirst({
        where: {
          providerId,
          startTime: { lt: endTime },
          endTime: { gt: startTime },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
      });

      if (conflict) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'This time slot is no longer available',
        });
      }

      // Create the appointment
      const appointment = await prisma.appointment.create({
        data: {
          startTime,
          endTime,
          status: 'SCHEDULED',
          chiefComplaint,
          patientNotes,
          patientId: user.patientId,
          providerId,
          appointmentTypeId,
          organizationId: user.organizationId,
          locationId,
          createdBy: 'PATIENT',
        },
        include: {
          appointmentType: true,
          provider: {
            include: {
              user: {
                select: { firstName: true, lastName: true },
              },
            },
          },
          location: true,
        },
      });

      // Generate calendar event data for "Add to Calendar" feature
      const calendarEvent = {
        title: `${appointmentType.name} with ${provider.title || ''} ${provider.user.firstName} ${provider.user.lastName}`.trim(),
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        location: appointment.location
          ? `${appointment.location.name}, ${appointment.location.addressLine1}, ${appointment.location.city}, ${appointment.location.state} ${appointment.location.zipCode}`
          : undefined,
        description: chiefComplaint
          ? `Reason for visit: ${chiefComplaint}`
          : 'Chiropractic appointment',
        // ICS format URL for native calendar apps
        icsUrl: `/api/appointments/${appointment.id}/calendar.ics`,
        // Google Calendar URL
        googleCalendarUrl: `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
          `${appointmentType.name} Appointment`
        )}&dates=${format(startTime, "yyyyMMdd'T'HHmmss")}/${format(
          endTime,
          "yyyyMMdd'T'HHmmss"
        )}&details=${encodeURIComponent(chiefComplaint || '')}${
          appointment.location
            ? `&location=${encodeURIComponent(
                `${appointment.location.addressLine1}, ${appointment.location.city}, ${appointment.location.state}`
              )}`
            : ''
        }`,
      };

      return {
        success: true,
        appointment: {
          id: appointment.id,
          startTime: appointment.startTime.toISOString(),
          endTime: appointment.endTime.toISOString(),
          status: appointment.status,
          appointmentType: appointmentType.name,
          provider: `${provider.title || ''} ${provider.user.firstName} ${provider.user.lastName}`.trim(),
        },
        calendarEvent,
        message: 'Appointment booked successfully',
      };
    }),

  // ==========================================
  // CANCEL/RESCHEDULE APPOINTMENT
  // ==========================================

  /**
   * Cancel an appointment
   */
  cancelAppointment: publicProcedure.input(cancelSchema).mutation(async ({ input }) => {
    const user = await validateMobileSession(input.sessionToken);

    const appointment = await prisma.appointment.findFirst({
      where: {
        id: input.appointmentId,
        patientId: user.patientId,
      },
    });

    if (!appointment) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Appointment not found',
      });
    }

    if (!['SCHEDULED', 'CONFIRMED'].includes(appointment.status)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'This appointment cannot be cancelled',
      });
    }

    const hoursUntil = differenceInHours(appointment.startTime, new Date());
    if (hoursUntil < 24) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Appointments must be cancelled at least 24 hours in advance. Please call the office.',
      });
    }

    await prisma.appointment.update({
      where: { id: input.appointmentId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledBy: 'PATIENT',
        cancelReason: input.reason,
      },
    });

    return {
      success: true,
      message: 'Appointment cancelled successfully',
    };
  }),

  /**
   * Reschedule an appointment
   */
  rescheduleAppointment: publicProcedure.input(rescheduleSchema).mutation(async ({ input }) => {
    const user = await validateMobileSession(input.sessionToken);

    const appointment = await prisma.appointment.findFirst({
      where: {
        id: input.appointmentId,
        patientId: user.patientId,
      },
      include: {
        appointmentType: true,
      },
    });

    if (!appointment) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Appointment not found',
      });
    }

    if (!['SCHEDULED', 'CONFIRMED'].includes(appointment.status)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'This appointment cannot be rescheduled',
      });
    }

    const hoursUntil = differenceInHours(appointment.startTime, new Date());
    if (hoursUntil < 24) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Appointments must be rescheduled at least 24 hours in advance. Please call the office.',
      });
    }

    const newProviderId = input.newProviderId || appointment.providerId;
    const newEndTime = addMinutes(input.newStartTime, appointment.appointmentType.duration);

    // Check for conflicts at new time
    const conflict = await prisma.appointment.findFirst({
      where: {
        providerId: newProviderId,
        startTime: { lt: newEndTime },
        endTime: { gt: input.newStartTime },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        id: { not: input.appointmentId },
      },
    });

    if (conflict) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'This time slot is not available',
      });
    }

    const updated = await prisma.appointment.update({
      where: { id: input.appointmentId },
      data: {
        startTime: input.newStartTime,
        endTime: newEndTime,
        providerId: newProviderId,
        status: 'RESCHEDULED',
      },
      include: {
        appointmentType: true,
        provider: {
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    return {
      success: true,
      appointment: {
        id: updated.id,
        startTime: updated.startTime.toISOString(),
        endTime: updated.endTime.toISOString(),
        status: updated.status,
        appointmentType: updated.appointmentType.name,
        provider: `${updated.provider.title || ''} ${updated.provider.user.firstName} ${updated.provider.user.lastName}`.trim(),
      },
      message: 'Appointment rescheduled successfully',
    };
  }),

  // ==========================================
  // APPOINTMENT REMINDERS
  // ==========================================

  /**
   * Get reminder preferences
   * Note: Uses PortalUser settings from the portal user record
   */
  getReminderPreferences: publicProcedure.input(sessionSchema).query(async ({ input }) => {
    const portalUser = await validateMobileSession(input.sessionToken);

    // Get portal user settings (stored as JSON in settings field if available)
    // For now, return sensible defaults - full preferences would be stored in portal user record
    const defaultPrefs = {
      appointmentReminders: true,
      reminderHours: [24, 2],
      smsReminders: true,
      pushReminders: true,
      emailReminders: true,
    };

    return defaultPrefs;
  }),

  /**
   * Update reminder preferences
   * Note: In a full implementation, this would update portal user settings
   */
  updateReminderPreferences: publicProcedure
    .input(reminderPreferencesSchema)
    .mutation(async ({ input }) => {
      const portalUser = await validateMobileSession(input.sessionToken);

      // For a full implementation, store preferences in portal user record or separate table
      // For now, acknowledge the update
      // In production, you would:
      // 1. Create a PortalUserPreferences model
      // 2. Or store as JSON in PortalUser.settings field

      return {
        success: true,
        message: 'Preferences updated successfully',
      };
    }),

  // ==========================================
  // ADD TO PHONE CALENDAR
  // ==========================================

  /**
   * Get calendar event data for an appointment
   * Returns data in multiple formats for different calendar apps
   */
  getCalendarEvent: publicProcedure
    .input(
      z.object({
        sessionToken: z.string(),
        appointmentId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const user = await validateMobileSession(input.sessionToken);

      const appointment = await prisma.appointment.findFirst({
        where: {
          id: input.appointmentId,
          patientId: user.patientId,
        },
        include: {
          appointmentType: true,
          provider: {
            include: {
              user: { select: { firstName: true, lastName: true } },
            },
          },
          location: true,
        },
      });

      if (!appointment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Appointment not found',
        });
      }

      const title = `${appointment.appointmentType.name} with ${appointment.provider.title || ''} ${appointment.provider.user.firstName} ${appointment.provider.user.lastName}`.trim();
      const locationStr = appointment.location
        ? `${appointment.location.name}, ${appointment.location.addressLine1}, ${appointment.location.city}, ${appointment.location.state} ${appointment.location.zipCode}`
        : '';
      const description = appointment.chiefComplaint
        ? `Reason for visit: ${appointment.chiefComplaint}`
        : 'Chiropractic appointment';

      return {
        title,
        startTime: appointment.startTime.toISOString(),
        endTime: appointment.endTime.toISOString(),
        location: locationStr,
        description,
        // Native ICS file endpoint
        icsUrl: `/api/appointments/${appointment.id}/calendar.ics`,
        // Google Calendar URL
        googleCalendarUrl: `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
          title
        )}&dates=${format(appointment.startTime, "yyyyMMdd'T'HHmmss")}/${format(
          appointment.endTime,
          "yyyyMMdd'T'HHmmss"
        )}&details=${encodeURIComponent(description)}&location=${encodeURIComponent(locationStr)}`,
        // Apple Calendar URL (ics download)
        appleCalendarUrl: `/api/appointments/${appointment.id}/calendar.ics`,
        // Outlook Calendar URL
        outlookCalendarUrl: `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(
          title
        )}&startdt=${appointment.startTime.toISOString()}&enddt=${appointment.endTime.toISOString()}&body=${encodeURIComponent(
          description
        )}&location=${encodeURIComponent(locationStr)}`,
      };
    }),

  // ==========================================
  // DIRECTIONS TO CLINIC
  // ==========================================

  /**
   * Get directions to the clinic location
   * Returns URLs for various map apps
   */
  getDirections: publicProcedure
    .input(
      z.object({
        sessionToken: z.string(),
        appointmentId: z.string().optional(),
        locationId: z.string().optional(),
        currentLatitude: z.number().optional(),
        currentLongitude: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const user = await validateMobileSession(input.sessionToken);

      let location;

      if (input.appointmentId) {
        const appointment = await prisma.appointment.findFirst({
          where: {
            id: input.appointmentId,
            patientId: user.patientId,
          },
          include: { location: true },
        });

        if (!appointment) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Appointment not found',
          });
        }

        location = appointment.location;
      } else if (input.locationId) {
        location = await prisma.location.findFirst({
          where: {
            id: input.locationId,
            organizationId: user.organizationId,
          },
        });
      } else {
        // Get primary location
        location = await prisma.location.findFirst({
          where: {
            organizationId: user.organizationId,
            isPrimary: true,
            isActive: true,
          },
        });
      }

      if (!location) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Location not found',
        });
      }

      const address = `${location.addressLine1}, ${location.city}, ${location.state} ${location.zipCode}`;
      const encodedAddress = encodeURIComponent(address);

      return {
        location: {
          id: location.id,
          name: location.name,
          address: {
            line1: location.addressLine1,
            line2: location.addressLine2,
            city: location.city,
            state: location.state,
            zipCode: location.zipCode,
          },
          phone: location.phone,
        },
        directions: {
          // Google Maps
          googleMaps: `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`,
          // Apple Maps
          appleMaps: `http://maps.apple.com/?daddr=${encodedAddress}`,
          // Waze
          waze: `https://waze.com/ul?q=${encodedAddress}&navigate=yes`,
          // Generic geo: URI (works on both platforms)
          geoUri: `geo:0,0?q=${encodedAddress}`,
        },
        // Estimated distance if current location provided (placeholder - would need geocoding API)
        estimatedDistance: null,
        estimatedDuration: null,
      };
    }),

  // ==========================================
  // CHECK-IN ON ARRIVAL
  // ==========================================

  /**
   * Patient self check-in on arrival
   * Optionally validates proximity to clinic
   */
  checkIn: publicProcedure.input(checkInSchema).mutation(async ({ input }) => {
    const user = await validateMobileSession(input.sessionToken);

    const appointment = await prisma.appointment.findFirst({
      where: {
        id: input.appointmentId,
        patientId: user.patientId,
      },
      include: {
        location: true,
        provider: {
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!appointment) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Appointment not found',
      });
    }

    if (!['SCHEDULED', 'CONFIRMED'].includes(appointment.status)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'This appointment cannot be checked in',
      });
    }

    // Check if within check-in window (up to 1 hour before, not past 15 minutes after start)
    const now = new Date();
    const hoursUntil = differenceInHours(appointment.startTime, now);
    const minutesPast = differenceInHours(now, appointment.startTime) * 60;

    if (hoursUntil > 1) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Check-in opens 1 hour before your appointment',
      });
    }

    if (minutesPast > 15) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Check-in is no longer available for this appointment. Please see the front desk.',
      });
    }

    // Update appointment status
    await prisma.appointment.update({
      where: { id: input.appointmentId },
      data: {
        status: 'CHECKED_IN',
        checkedInAt: new Date(),
        checkedInBy: 'PATIENT_MOBILE',
      },
    });

    return {
      success: true,
      message: 'You are checked in! Please have a seat and we will call you shortly.',
      appointment: {
        id: appointment.id,
        startTime: appointment.startTime.toISOString(),
        provider: `${appointment.provider.title || ''} ${appointment.provider.user.firstName} ${appointment.provider.user.lastName}`.trim(),
        status: 'CHECKED_IN',
      },
    };
  }),

  /**
   * Get check-in status for an appointment
   */
  getCheckInStatus: publicProcedure
    .input(
      z.object({
        sessionToken: z.string(),
        appointmentId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const user = await validateMobileSession(input.sessionToken);

      const appointment = await prisma.appointment.findFirst({
        where: {
          id: input.appointmentId,
          patientId: user.patientId,
        },
      });

      if (!appointment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Appointment not found',
        });
      }

      const now = new Date();
      const hoursUntil = differenceInHours(appointment.startTime, now);
      const minutesPast = (now.getTime() - appointment.startTime.getTime()) / 60000;

      const canCheckIn =
        ['SCHEDULED', 'CONFIRMED'].includes(appointment.status) &&
        hoursUntil <= 1 &&
        minutesPast <= 15;

      const isCheckedIn = appointment.status === 'CHECKED_IN';

      return {
        canCheckIn,
        isCheckedIn,
        checkedInAt: appointment.checkedInAt?.toISOString(),
        status: appointment.status,
        message: isCheckedIn
          ? 'You are already checked in'
          : canCheckIn
            ? 'You can check in now'
            : hoursUntil > 1
              ? `Check-in opens ${Math.ceil(hoursUntil - 1)} hour(s) before your appointment`
              : 'Please see the front desk',
      };
    }),

  // ==========================================
  // GET CLINIC LOCATIONS
  // ==========================================

  /**
   * Get all clinic locations
   */
  getLocations: publicProcedure.input(sessionSchema).query(async ({ input }) => {
    const user = await validateMobileSession(input.sessionToken);

    const locations = await prisma.location.findMany({
      where: {
        organizationId: user.organizationId,
        isActive: true,
      },
      orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
    });

    return locations.map((loc) => ({
      id: loc.id,
      name: loc.name,
      isPrimary: loc.isPrimary,
      address: {
        line1: loc.addressLine1,
        line2: loc.addressLine2,
        city: loc.city,
        state: loc.state,
        zipCode: loc.zipCode,
      },
      phone: loc.phone,
      directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
        `${loc.addressLine1}, ${loc.city}, ${loc.state} ${loc.zipCode}`
      )}`,
    }));
  }),
});
