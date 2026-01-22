/**
 * Epic 14: Patient Portal - tRPC Router
 * Handles all portal API endpoints for patient self-service
 */

import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { prisma } from '@/lib/prisma';
import {
  loginPortalUser,
  logoutPortalUser,
  validateSession,
  registerPortalUser,
  requestPasswordReset,
  resetPassword,
  changePassword,
  verifyEmail,
  logPortalAccess,
  getPatientMessages,
  getMessageThread,
  sendPatientMessage,
  archiveMessage,
  getUnreadMessageCount,
  getPatientDocuments,
  getDocument,
  recordDocumentDownload,
  getNewDocumentCount,
} from '@/lib/portal';

// Middleware to validate portal session
import { initTRPC, type inferAsyncReturnType } from '@trpc/server';

// Helper to get portal user from session token
async function getPortalUserFromToken(token: string) {
  const result = await validateSession(token);
  if (!result.valid || !result.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: result.error || 'Invalid session',
    });
  }
  return result.user;
}

// Validation schemas
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  organizationId: z.string().optional(),
});

const registerSchema = z.object({
  patientId: z.string(),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  organizationId: z.string(),
});

const passwordResetRequestSchema = z.object({
  email: z.string().email('Invalid email address'),
  organizationId: z.string().optional(),
});

const passwordResetSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

const changePasswordSchema = z.object({
  sessionToken: z.string(),
  currentPassword: z.string(),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

const profileUpdateSchema = z.object({
  sessionToken: z.string(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  preferredName: z.string().optional(),
});

const appointmentRequestSchema = z.object({
  sessionToken: z.string(),
  requestedDate: z.coerce.date().optional(),
  preferredDates: z
    .array(
      z.object({
        date: z.coerce.date(),
        timePreference: z.enum(['morning', 'afternoon', 'evening', 'any']).optional(),
      })
    )
    .optional(),
  appointmentTypeId: z.string().optional(),
  providerId: z.string().optional(),
  reason: z.string().optional(),
  patientNotes: z.string().optional(),
  isUrgent: z.boolean().default(false),
});

const bookAppointmentSchema = z.object({
  sessionToken: z.string(),
  providerId: z.string(),
  appointmentTypeId: z.string(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  chiefComplaint: z.string().optional(),
  patientNotes: z.string().optional(),
});

const rescheduleSchema = z.object({
  sessionToken: z.string(),
  appointmentId: z.string(),
  newStartTime: z.coerce.date(),
  newEndTime: z.coerce.date(),
  newProviderId: z.string().optional(),
});

const messageSchema = z.object({
  sessionToken: z.string(),
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Message body is required'),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  parentMessageId: z.string().optional(),
});

const paymentSchema = z.object({
  sessionToken: z.string(),
  amount: z.number().positive('Amount must be positive'),
  paymentMethodId: z.string().optional(),
  // New card details
  cardNumber: z.string().optional(),
  expiryMonth: z.string().optional(),
  expiryYear: z.string().optional(),
  cvv: z.string().optional(),
  cardholderName: z.string().optional(),
  billingAddress: z
    .object({
      line1: z.string(),
      city: z.string(),
      state: z.string(),
      zipCode: z.string(),
      country: z.string().default('US'),
    })
    .optional(),
  savePaymentMethod: z.boolean().default(false),
});

const preferencesSchema = z.object({
  sessionToken: z.string(),
  emailNotifications: z.boolean().optional(),
  smsNotifications: z.boolean().optional(),
  notifyAppointmentReminders: z.boolean().optional(),
  notifyAppointmentChanges: z.boolean().optional(),
  notifyNewMessages: z.boolean().optional(),
  notifyNewDocuments: z.boolean().optional(),
  notifyBillingStatements: z.boolean().optional(),
  notifyFormRequests: z.boolean().optional(),
  preferredLanguage: z.string().optional(),
  timezone: z.string().optional(),
  dateFormat: z.string().optional(),
  timeFormat: z.enum(['12h', '24h']).optional(),
});

export const portalRouter = router({
  // ============================================
  // AUTHENTICATION
  // ============================================

  // Login to portal
  login: publicProcedure.input(loginSchema).mutation(async ({ input, ctx }) => {
    const { email, password, organizationId } = input;

    if (!organizationId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Organization ID is required for login',
      });
    }

    // Get IP and user agent from context if available
    const ipAddress = (ctx as Record<string, unknown>).ipAddress as string | undefined;
    const userAgent = (ctx as Record<string, unknown>).userAgent as string | undefined;

    const result = await loginPortalUser(email, password, organizationId, ipAddress, userAgent);

    if (!result.success) {
      throw new TRPCError({
        code: result.requiresVerification ? 'FORBIDDEN' : 'UNAUTHORIZED',
        message: result.error || 'Login failed',
      });
    }

    return {
      token: result.token!,
      user: result.user!,
    };
  }),

  // Logout
  logout: publicProcedure
    .input(z.object({ sessionToken: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const ipAddress = (ctx as Record<string, unknown>).ipAddress as string | undefined;
      const userAgent = (ctx as Record<string, unknown>).userAgent as string | undefined;

      await logoutPortalUser(input.sessionToken, ipAddress, userAgent);
      return { success: true };
    }),

  // Register new portal account
  register: publicProcedure.input(registerSchema).mutation(async ({ input }) => {
    const { patientId, email, password, organizationId } = input;

    const result = await registerPortalUser(patientId, email, password, organizationId);

    if (!result.success) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: result.error || 'Registration failed',
      });
    }

    return { success: true, userId: result.userId };
  }),

  // Request password reset
  requestPasswordReset: publicProcedure
    .input(passwordResetRequestSchema)
    .mutation(async ({ input }) => {
      const { email, organizationId } = input;
      if (organizationId) {
        await requestPasswordReset(email, organizationId);
      }
      // Always return success to prevent email enumeration
      return { success: true };
    }),

  // Reset password with token
  resetPassword: publicProcedure.input(passwordResetSchema).mutation(async ({ input }) => {
    const { token, newPassword } = input;

    const result = await resetPassword(token, newPassword);

    if (!result.success) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: result.error || 'Password reset failed',
      });
    }

    return { success: true };
  }),

  // Verify email with token (account activation)
  verifyEmail: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input }) => {
      const { token } = input;

      const result = await verifyEmail(token);

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error || 'Email verification failed',
        });
      }

      return { success: true };
    }),

  // Change password (when logged in)
  changePassword: publicProcedure.input(changePasswordSchema).mutation(async ({ input }) => {
    const { sessionToken, currentPassword, newPassword } = input;

    const user = await getPortalUserFromToken(sessionToken);

    const result = await changePassword(user.id, currentPassword, newPassword);

    if (!result.success) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: result.error || 'Password change failed',
      });
    }

    return { success: true };
  }),

  // Validate session
  validateSession: publicProcedure
    .input(z.object({ sessionToken: z.string() }))
    .query(async ({ input }) => {
      const result = await validateSession(input.sessionToken);
      return { valid: result.valid, user: result.user };
    }),

  // ============================================
  // PROFILE
  // ============================================

  // Get patient profile
  getProfile: publicProcedure
    .input(z.object({ sessionToken: z.string() }))
    .query(async ({ input }) => {
      const user = await getPortalUserFromToken(input.sessionToken);

      const patient = await prisma.patient.findFirst({
        where: {
          id: user.patientId,
          organizationId: user.organizationId,
        },
        include: {
          demographics: true,
          contacts: {
            where: { isPrimary: true },
            take: 1,
          },
        },
      });

      if (!patient || !patient.demographics) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient profile not found',
        });
      }

      const contact = patient.contacts[0];

      return {
        id: patient.id,
        mrn: patient.mrn,
        firstName: patient.demographics.firstName,
        lastName: patient.demographics.lastName,
        preferredName: patient.demographics.preferredName,
        dateOfBirth: patient.demographics.dateOfBirth,
        gender: patient.demographics.gender,
        email: contact?.email || user.email,
        phone: contact?.mobilePhone || contact?.homePhone,
        address: contact
          ? {
              line1: contact.addressLine1,
              line2: contact.addressLine2,
              city: contact.city,
              state: contact.state,
              zipCode: contact.zipCode,
            }
          : null,
      };
    }),

  // Update profile
  updateProfile: publicProcedure.input(profileUpdateSchema).mutation(async ({ input, ctx }) => {
    const { sessionToken, ...updateData } = input;

    const user = await getPortalUserFromToken(sessionToken);
    const ipAddress = (ctx as Record<string, unknown>).ipAddress as string | undefined;

    // Get primary contact to update
    const contact = await prisma.patientContact.findFirst({
      where: {
        patientId: user.patientId,
        isPrimary: true,
      },
    });

    // Update contact info
    if (contact) {
      await prisma.patientContact.update({
        where: { id: contact.id },
        data: {
          email: updateData.email,
          mobilePhone: updateData.phone,
          addressLine1: updateData.addressLine1,
          addressLine2: updateData.addressLine2,
          city: updateData.city,
          state: updateData.state,
          zipCode: updateData.zipCode,
        },
      });
    }

    // Update preferred name in demographics
    if (updateData.preferredName !== undefined) {
      await prisma.patientDemographics.updateMany({
        where: { patientId: user.patientId },
        data: { preferredName: updateData.preferredName },
      });
    }

    // Log the update
    await logPortalAccess({
      action: 'PORTAL_UPDATE_PROFILE',
      portalUserId: user.id,
      organizationId: user.organizationId,
      resource: 'Patient',
      resourceId: user.patientId,
      ipAddress,
      success: true,
    });

    return { success: true };
  }),

  // ============================================
  // APPOINTMENTS
  // ============================================

  // List upcoming appointments
  listAppointments: publicProcedure
    .input(
      z.object({
        sessionToken: z.string(),
        includeHistory: z.boolean().default(false),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      const { sessionToken, includeHistory, limit, offset } = input;
      const user = await getPortalUserFromToken(sessionToken);
      const ipAddress = (ctx as Record<string, unknown>).ipAddress as string | undefined;

      const where: Record<string, unknown> = {
        patientId: user.patientId,
        ...(includeHistory
          ? {}
          : {
              startTime: { gte: new Date() },
              status: { notIn: ['CANCELLED', 'NO_SHOW'] },
            }),
      };

      const [appointments, total] = await Promise.all([
        prisma.appointment.findMany({
          where,
          include: {
            appointmentType: {
              select: {
                id: true,
                name: true,
                duration: true,
              },
            },
            provider: {
              select: {
                id: true,
                title: true,
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
          orderBy: includeHistory ? { startTime: 'desc' } : { startTime: 'asc' },
          take: limit,
          skip: offset,
        }),
        prisma.appointment.count({ where }),
      ]);

      // Log access
      await logPortalAccess({
        action: 'PORTAL_VIEW_APPOINTMENTS',
        portalUserId: user.id,
        organizationId: user.organizationId,
        ipAddress,
        success: true,
      });

      return {
        appointments: appointments.map((apt) => ({
          id: apt.id,
          startTime: apt.startTime,
          endTime: apt.endTime,
          status: apt.status,
          appointmentType: apt.appointmentType
            ? {
                id: apt.appointmentType.id,
                name: apt.appointmentType.name,
                duration: apt.appointmentType.duration,
              }
            : undefined,
          provider: apt.provider
            ? {
                id: apt.provider.id,
                firstName: apt.provider.user.firstName,
                lastName: apt.provider.user.lastName,
                title: apt.provider.title,
              }
            : undefined,
          notes: apt.patientNotes,
          chiefComplaint: apt.chiefComplaint,
          // Can cancel if status is SCHEDULED or CONFIRMED and appointment is in future
          canCancel:
            ['SCHEDULED', 'CONFIRMED'].includes(apt.status) && apt.startTime > new Date(),
        })),
        total,
      };
    }),

  // Request new appointment
  requestAppointment: publicProcedure
    .input(appointmentRequestSchema)
    .mutation(async ({ input, ctx }) => {
      const { sessionToken, ...requestData } = input;
      const user = await getPortalUserFromToken(sessionToken);
      const ipAddress = (ctx as Record<string, unknown>).ipAddress as string | undefined;

      // Create appointment request
      const request = await prisma.appointmentRequest.create({
        data: {
          patientId: user.patientId,
          organizationId: user.organizationId,
          requestedDate: requestData.requestedDate,
          preferredDates: requestData.preferredDates
            ? JSON.parse(JSON.stringify(requestData.preferredDates))
            : undefined,
          appointmentTypeId: requestData.appointmentTypeId,
          providerId: requestData.providerId,
          reason: requestData.reason,
          patientNotes: requestData.patientNotes,
          isUrgent: requestData.isUrgent,
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });

      // Log the request
      await logPortalAccess({
        action: 'PORTAL_REQUEST_APPOINTMENT',
        portalUserId: user.id,
        organizationId: user.organizationId,
        resource: 'AppointmentRequest',
        resourceId: request.id,
        ipAddress,
        success: true,
      });

      // TODO: Notify practice staff about new appointment request

      return { success: true, requestId: request.id };
    }),

  // Cancel appointment
  cancelAppointment: publicProcedure
    .input(
      z.object({
        sessionToken: z.string(),
        appointmentId: z.string(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { sessionToken, appointmentId, reason } = input;
      const user = await getPortalUserFromToken(sessionToken);
      const ipAddress = (ctx as Record<string, unknown>).ipAddress as string | undefined;

      // Verify appointment belongs to patient
      const appointment = await prisma.appointment.findFirst({
        where: {
          id: appointmentId,
          patientId: user.patientId,
        },
      });

      if (!appointment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Appointment not found',
        });
      }

      // Check if can be cancelled
      if (!['SCHEDULED', 'CONFIRMED'].includes(appointment.status)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This appointment cannot be cancelled',
        });
      }

      if (appointment.startTime <= new Date()) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot cancel past appointments',
        });
      }

      // Cancel the appointment
      await prisma.appointment.update({
        where: { id: appointmentId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledBy: 'PATIENT',
          cancelReason: reason,
        },
      });

      // Log the cancellation
      await logPortalAccess({
        action: 'PORTAL_CANCEL_APPOINTMENT',
        portalUserId: user.id,
        organizationId: user.organizationId,
        resource: 'Appointment',
        resourceId: appointmentId,
        ipAddress,
        success: true,
        metadata: { reason },
      });

      // TODO: Notify practice about cancellation

      return { success: true };
    }),

  // Get providers for online booking
  getProviders: publicProcedure
    .input(z.object({ sessionToken: z.string() }))
    .query(async ({ input }) => {
      const user = await getPortalUserFromToken(input.sessionToken);

      const providers = await prisma.provider.findMany({
        where: {
          organizationId: user.organizationId,
          isActive: true,
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { user: { lastName: 'asc' } }],
      });

      return providers.map((p) => ({
        id: p.id,
        title: p.title,
        firstName: p.user.firstName,
        lastName: p.user.lastName,
        specialty: p.specialty,
        color: p.color,
      }));
    }),

  // Get appointment types for online booking
  getAppointmentTypes: publicProcedure
    .input(z.object({ sessionToken: z.string() }))
    .query(async ({ input }) => {
      const user = await getPortalUserFromToken(input.sessionToken);

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

  // Get available time slots for a date range
  getAvailableSlots: publicProcedure
    .input(
      z.object({
        sessionToken: z.string(),
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
        providerId: z.string().optional(),
        appointmentTypeId: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const { sessionToken, startDate, endDate, providerId, appointmentTypeId } = input;
      const user = await getPortalUserFromToken(sessionToken);

      // Get appointment duration
      let duration = 30; // Default duration in minutes
      if (appointmentTypeId) {
        const appointmentType = await prisma.appointmentType.findFirst({
          where: { id: appointmentTypeId, organizationId: user.organizationId },
        });
        if (appointmentType) {
          duration = appointmentType.duration;
        }
      }

      // Get providers to check availability for
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

      // Get existing appointments in range
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

      // Day mapping for DayOfWeek enum
      const dayOfWeekMap: Record<number, string> = {
        0: 'SUNDAY',
        1: 'MONDAY',
        2: 'TUESDAY',
        3: 'WEDNESDAY',
        4: 'THURSDAY',
        5: 'FRIDAY',
        6: 'SATURDAY',
      };

      // Generate available slots for each day
      const slots: Array<{
        date: string;
        providerId: string;
        providerName: string;
        startTime: Date;
        endTime: Date;
      }> = [];

      const currentDate = new Date(startDate);
      const endDateTime = new Date(endDate);
      const now = new Date();

      while (currentDate <= endDateTime) {
        const dayOfWeek = dayOfWeekMap[currentDate.getDay()];
        const dateStr = currentDate.toISOString().split('T')[0];

        for (const provider of providers) {
          // Check for exceptions (days off or custom hours)
          const exception = provider.exceptions.find(
            (e) => e.date.toISOString().split('T')[0] === dateStr
          );

          if (exception && !exception.isAvailable) {
            // Provider is off this day
            continue;
          }

          // Get working hours for this day
          let workStart: string | null = null;
          let workEnd: string | null = null;

          if (exception && exception.isAvailable && exception.startTime && exception.endTime) {
            // Use exception hours
            workStart = exception.startTime;
            workEnd = exception.endTime;
          } else {
            // Use regular schedule
            const schedule = provider.schedules.find((s) => s.dayOfWeek === dayOfWeek);
            if (schedule) {
              workStart = schedule.startTime;
              workEnd = schedule.endTime;
            }
          }

          if (!workStart || !workEnd) {
            continue;
          }

          // Parse work hours
          const [startHour, startMin] = workStart.split(':').map(Number);
          const [endHour, endMin] = workEnd.split(':').map(Number);

          const dayStart = new Date(currentDate);
          dayStart.setHours(startHour, startMin, 0, 0);

          const dayEnd = new Date(currentDate);
          dayEnd.setHours(endHour, endMin, 0, 0);

          // Generate slots for this day
          let slotStart = new Date(dayStart);
          while (slotStart.getTime() + duration * 60 * 1000 <= dayEnd.getTime()) {
            const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);

            // Skip slots in the past
            if (slotStart <= now) {
              slotStart = new Date(slotStart.getTime() + duration * 60 * 1000);
              continue;
            }

            // Check for conflicts with existing appointments
            const hasAppointmentConflict = existingAppointments.some(
              (apt) =>
                apt.providerId === provider.id &&
                apt.startTime < slotEnd &&
                apt.endTime > slotStart
            );

            // Check for conflicts with schedule blocks
            const hasBlockConflict = blocks.some(
              (block) =>
                (block.providerId === null || block.providerId === provider.id) &&
                block.startTime < slotEnd &&
                block.endTime > slotStart
            );

            if (!hasAppointmentConflict && !hasBlockConflict) {
              slots.push({
                date: dateStr,
                providerId: provider.id,
                providerName: `${provider.title || ''} ${provider.user.firstName} ${provider.user.lastName}`.trim(),
                startTime: new Date(slotStart),
                endTime: new Date(slotEnd),
              });
            }

            slotStart = new Date(slotStart.getTime() + duration * 60 * 1000);
          }
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      return slots;
    }),

  // Book an appointment directly
  bookAppointment: publicProcedure.input(bookAppointmentSchema).mutation(async ({ input, ctx }) => {
    const { sessionToken, providerId, appointmentTypeId, startTime, endTime, chiefComplaint, patientNotes } = input;
    const user = await getPortalUserFromToken(sessionToken);
    const ipAddress = (ctx as Record<string, unknown>).ipAddress as string | undefined;

    // Validate provider exists
    const provider = await prisma.provider.findFirst({
      where: { id: providerId, organizationId: user.organizationId, isActive: true },
    });

    if (!provider) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Provider not found' });
    }

    // Validate appointment type
    const appointmentType = await prisma.appointmentType.findFirst({
      where: { id: appointmentTypeId, organizationId: user.organizationId, isActive: true },
    });

    if (!appointmentType) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Appointment type not found' });
    }

    // Check for conflicts
    const conflict = await prisma.appointment.findFirst({
      where: {
        providerId,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });

    if (conflict) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'This time slot is no longer available. Please select another time.',
      });
    }

    // Check for schedule blocks
    const blockConflict = await prisma.scheduleBlock.findFirst({
      where: {
        OR: [{ providerId }, { providerId: null, organizationId: user.organizationId }],
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });

    if (blockConflict) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'This time slot is blocked. Please select another time.',
      });
    }

    // Create the appointment
    const appointment = await prisma.appointment.create({
      data: {
        organizationId: user.organizationId,
        patientId: user.patientId,
        providerId,
        appointmentTypeId,
        startTime,
        endTime,
        chiefComplaint,
        patientNotes,
        status: 'SCHEDULED',
        createdBy: 'PORTAL',
      },
      include: {
        provider: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        appointmentType: { select: { name: true, duration: true } },
      },
    });

    // Log the booking
    await logPortalAccess({
      action: 'PORTAL_BOOK_APPOINTMENT',
      portalUserId: user.id,
      organizationId: user.organizationId,
      resource: 'Appointment',
      resourceId: appointment.id,
      ipAddress,
      success: true,
    });

    // TODO: Send confirmation email

    return {
      success: true,
      appointment: {
        id: appointment.id,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        provider: {
          id: appointment.provider.id,
          name: `${appointment.provider.title || ''} ${appointment.provider.user.firstName} ${appointment.provider.user.lastName}`.trim(),
        },
        appointmentType: appointment.appointmentType
          ? {
              name: appointment.appointmentType.name,
              duration: appointment.appointmentType.duration,
            }
          : undefined,
      },
    };
  }),

  // Reschedule an appointment
  rescheduleAppointment: publicProcedure.input(rescheduleSchema).mutation(async ({ input, ctx }) => {
    const { sessionToken, appointmentId, newStartTime, newEndTime, newProviderId } = input;
    const user = await getPortalUserFromToken(sessionToken);
    const ipAddress = (ctx as Record<string, unknown>).ipAddress as string | undefined;

    // Verify appointment belongs to patient
    const appointment = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        patientId: user.patientId,
        organizationId: user.organizationId,
      },
    });

    if (!appointment) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Appointment not found' });
    }

    // Check if can be rescheduled
    if (!['SCHEDULED', 'CONFIRMED'].includes(appointment.status)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'This appointment cannot be rescheduled',
      });
    }

    if (appointment.startTime <= new Date()) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Cannot reschedule past appointments',
      });
    }

    const targetProviderId = newProviderId || appointment.providerId;

    // Validate new provider if different
    if (newProviderId && newProviderId !== appointment.providerId) {
      const newProvider = await prisma.provider.findFirst({
        where: { id: newProviderId, organizationId: user.organizationId, isActive: true },
      });

      if (!newProvider) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Provider not found' });
      }
    }

    // Check for conflicts at new time (excluding current appointment)
    const conflict = await prisma.appointment.findFirst({
      where: {
        id: { not: appointmentId },
        providerId: targetProviderId,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        startTime: { lt: newEndTime },
        endTime: { gt: newStartTime },
      },
    });

    if (conflict) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'This time slot is no longer available. Please select another time.',
      });
    }

    // Check for schedule blocks
    const blockConflict = await prisma.scheduleBlock.findFirst({
      where: {
        OR: [
          { providerId: targetProviderId },
          { providerId: null, organizationId: user.organizationId },
        ],
        startTime: { lt: newEndTime },
        endTime: { gt: newStartTime },
      },
    });

    if (blockConflict) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'This time slot is blocked. Please select another time.',
      });
    }

    // Update the appointment
    const updated = await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        startTime: newStartTime,
        endTime: newEndTime,
        providerId: targetProviderId,
        status: 'SCHEDULED', // Reset to scheduled after reschedule
      },
      include: {
        provider: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        appointmentType: { select: { name: true, duration: true } },
      },
    });

    // Log the reschedule
    await logPortalAccess({
      action: 'PORTAL_RESCHEDULE_APPOINTMENT',
      portalUserId: user.id,
      organizationId: user.organizationId,
      resource: 'Appointment',
      resourceId: appointmentId,
      ipAddress,
      success: true,
      metadata: { oldStartTime: appointment.startTime, newStartTime },
    });

    // TODO: Send confirmation email

    return {
      success: true,
      appointment: {
        id: updated.id,
        startTime: updated.startTime,
        endTime: updated.endTime,
        provider: {
          id: updated.provider.id,
          name: `${updated.provider.title || ''} ${updated.provider.user.firstName} ${updated.provider.user.lastName}`.trim(),
        },
        appointmentType: updated.appointmentType
          ? {
              name: updated.appointmentType.name,
              duration: updated.appointmentType.duration,
            }
          : undefined,
      },
    };
  }),

  // ============================================
  // FORMS
  // ============================================

  // List pending forms
  listForms: publicProcedure
    .input(
      z.object({
        sessionToken: z.string(),
        status: z.enum(['DRAFT', 'PENDING', 'COMPLETED', 'REJECTED', 'EXPIRED']).optional(),
        limit: z.number().min(1).max(50).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      const { sessionToken, status, limit, offset } = input;
      const user = await getPortalUserFromToken(sessionToken);
      const ipAddress = (ctx as Record<string, unknown>).ipAddress as string | undefined;

      const where: Record<string, unknown> = {
        patientId: user.patientId,
        organizationId: user.organizationId,
      };

      if (status) {
        where.status = status;
      }

      const [submissions, total] = await Promise.all([
        prisma.formSubmission.findMany({
          where,
          include: {
            template: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        prisma.formSubmission.count({ where }),
      ]);

      // Also get pending form deliveries that don't have submissions yet
      const pendingDeliveries = await prisma.formDelivery.findMany({
        where: {
          patientId: user.patientId,
          organizationId: user.organizationId,
          completedAt: null,
          submissions: { none: {} },
        },
        include: {
          template: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      // Log access
      await logPortalAccess({
        action: 'PORTAL_VIEW_FORMS',
        portalUserId: user.id,
        organizationId: user.organizationId,
        ipAddress,
        success: true,
      });

      return {
        forms: [
          ...pendingDeliveries.map((d) => ({
            id: d.id,
            templateId: d.template.id,
            templateName: d.template.name,
            status: 'PENDING' as const,
            dueDate: d.scheduledFor,
            accessToken: d.id, // Use delivery ID as access token for now
          })),
          ...submissions.map((s) => ({
            id: s.id,
            templateId: s.template.id,
            templateName: s.template.name,
            status: s.status,
            completedAt: s.submittedAt,
            accessToken: s.accessToken,
          })),
        ],
        total: total + pendingDeliveries.length,
      };
    }),

  // Submit form response
  submitForm: publicProcedure
    .input(
      z.object({
        sessionToken: z.string(),
        submissionId: z.string(),
        responses: z.array(
          z.object({
            fieldId: z.string(),
            value: z.string().optional(),
            valueJson: z.any().optional(),
          })
        ),
        signatures: z
          .array(
            z.object({
              signatureData: z.string(), // Base64 encoded
              signerName: z.string().optional(),
              signerEmail: z.string().optional(),
              relationship: z.string().optional(),
              consentText: z.string().optional(),
            })
          )
          .optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { sessionToken, submissionId, responses, signatures } = input;
      const user = await getPortalUserFromToken(sessionToken);
      const ipAddress = (ctx as Record<string, unknown>).ipAddress as string | undefined;
      const userAgent = (ctx as Record<string, unknown>).userAgent as string | undefined;

      // Verify submission belongs to patient
      const submission = await prisma.formSubmission.findFirst({
        where: {
          id: submissionId,
          patientId: user.patientId,
          status: { in: ['DRAFT', 'PENDING'] },
        },
      });

      if (!submission) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Form submission not found or already completed',
        });
      }

      // Save responses
      await prisma.$transaction(async (tx) => {
        // Delete existing responses if resubmitting
        await tx.formResponse.deleteMany({
          where: { submissionId },
        });

        // Create new responses
        await tx.formResponse.createMany({
          data: responses.map((r) => ({
            submissionId,
            fieldId: r.fieldId,
            value: r.value,
            valueJson: r.valueJson ? JSON.parse(JSON.stringify(r.valueJson)) : undefined,
          })),
        });

        // Add signatures if provided
        if (signatures && signatures.length > 0) {
          await tx.eSignature.createMany({
            data: signatures.map((s) => ({
              submissionId,
              signatureData: s.signatureData,
              signerName: s.signerName,
              signerEmail: s.signerEmail,
              relationship: s.relationship,
              consentText: s.consentText,
              ipAddress,
              userAgent,
            })),
          });
        }

        // Update submission status
        await tx.formSubmission.update({
          where: { id: submissionId },
          data: {
            status: 'PENDING', // Ready for staff review
            submittedAt: new Date(),
            source: 'PORTAL',
            ipAddress,
            userAgent,
          },
        });
      });

      // Log the submission
      await logPortalAccess({
        action: 'PORTAL_SUBMIT_FORM',
        portalUserId: user.id,
        organizationId: user.organizationId,
        resource: 'FormSubmission',
        resourceId: submissionId,
        ipAddress,
        success: true,
      });

      return { success: true };
    }),

  // ============================================
  // BILLING & STATEMENTS
  // ============================================

  // List statements
  listStatements: publicProcedure
    .input(
      z.object({
        sessionToken: z.string(),
        limit: z.number().min(1).max(50).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      const { sessionToken, limit, offset } = input;
      const user = await getPortalUserFromToken(sessionToken);
      const ipAddress = (ctx as Record<string, unknown>).ipAddress as string | undefined;

      const [statements, total] = await Promise.all([
        prisma.patientStatement.findMany({
          where: {
            patientId: user.patientId,
            organizationId: user.organizationId,
            status: { not: 'DRAFT' }, // Don't show draft statements
          },
          orderBy: { statementDate: 'desc' },
          take: limit,
          skip: offset,
        }),
        prisma.patientStatement.count({
          where: {
            patientId: user.patientId,
            organizationId: user.organizationId,
            status: { not: 'DRAFT' },
          },
        }),
      ]);

      // Log access
      await logPortalAccess({
        action: 'PORTAL_VIEW_STATEMENTS',
        portalUserId: user.id,
        organizationId: user.organizationId,
        ipAddress,
        success: true,
      });

      return {
        statements: statements.map((s) => ({
          id: s.id,
          statementNumber: s.statementNumber,
          statementDate: s.statementDate,
          periodStart: s.periodStart,
          periodEnd: s.periodEnd,
          previousBalance: Number(s.previousBalance),
          newCharges: Number(s.newCharges),
          payments: Number(s.payments),
          adjustments: Number(s.adjustments),
          totalDue: Number(s.totalDue),
          dueDate: s.dueDate,
          status: s.status,
          pdfUrl: s.pdfStorageKey ? `/api/portal/statements/${s.id}/pdf` : undefined,
        })),
        total,
      };
    }),

  // Get current balance
  getCurrentBalance: publicProcedure
    .input(z.object({ sessionToken: z.string() }))
    .query(async ({ input }) => {
      const user = await getPortalUserFromToken(input.sessionToken);

      // Get outstanding charges
      const charges = await prisma.charge.aggregate({
        where: {
          patientId: user.patientId,
          organizationId: user.organizationId,
          status: { in: ['PENDING', 'BILLED'] },
        },
        _sum: {
          balance: true,
        },
      });

      return {
        balance: Number(charges._sum.balance || 0),
      };
    }),

  // Make a payment
  makePayment: publicProcedure.input(paymentSchema).mutation(async ({ input, ctx }) => {
    const { sessionToken, amount, paymentMethodId, ...cardDetails } = input;
    const user = await getPortalUserFromToken(sessionToken);
    const ipAddress = (ctx as Record<string, unknown>).ipAddress as string | undefined;

    // Verify patient has an outstanding balance
    const balance = await prisma.charge.aggregate({
      where: {
        patientId: user.patientId,
        organizationId: user.organizationId,
        status: { in: ['PENDING', 'BILLED'] },
      },
      _sum: { balance: true },
    });

    const outstandingBalance = Number(balance._sum.balance || 0);

    if (outstandingBalance <= 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'No outstanding balance to pay',
      });
    }

    if (amount > outstandingBalance) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Payment amount exceeds balance of $${outstandingBalance.toFixed(2)}`,
      });
    }

    // TODO: Process payment through payment gateway (Epic 10)
    // This is a placeholder - actual payment processing would involve:
    // 1. Getting or creating a payment method in Stripe/payment gateway
    // 2. Creating a payment intent
    // 3. Recording the transaction
    // 4. Applying to charges

    // For now, just log the attempt
    await logPortalAccess({
      action: 'PORTAL_MAKE_PAYMENT',
      portalUserId: user.id,
      organizationId: user.organizationId,
      ipAddress,
      success: true,
      metadata: { amount },
    });

    // Create a placeholder payment record
    // In real implementation, this would come from payment processing
    const payment = await prisma.payment.create({
      data: {
        patientId: user.patientId,
        organizationId: user.organizationId,
        amount,
        paymentMethod: 'CREDIT_CARD',
        payerType: 'patient',
        referenceNumber: `PORTAL-${Date.now()}`,
        notes: 'Payment submitted via patient portal',
      },
    });

    return {
      success: true,
      transactionId: payment.id,
      // confirmationNumber would come from payment gateway
    };
  }),

  // ============================================
  // SECURE MESSAGING
  // ============================================

  // List messages
  listMessages: publicProcedure
    .input(
      z.object({
        sessionToken: z.string(),
        status: z.enum(['UNREAD', 'READ', 'ARCHIVED', 'DELETED']).optional(),
        includeArchived: z.boolean().default(false),
        limit: z.number().min(1).max(50).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      const { sessionToken, status, includeArchived, limit, offset } = input;
      const user = await getPortalUserFromToken(sessionToken);
      const ipAddress = (ctx as Record<string, unknown>).ipAddress as string | undefined;

      const result = await getPatientMessages(user.patientId, user.organizationId, {
        status: status as never,
        includeArchived,
        limit,
        offset,
      });

      // Log access
      await logPortalAccess({
        action: 'PORTAL_VIEW_MESSAGES',
        portalUserId: user.id,
        organizationId: user.organizationId,
        ipAddress,
        success: true,
      });

      return result;
    }),

  // Get message with thread
  getMessage: publicProcedure
    .input(
      z.object({
        sessionToken: z.string(),
        messageId: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { sessionToken, messageId } = input;
      const user = await getPortalUserFromToken(sessionToken);
      const ipAddress = (ctx as Record<string, unknown>).ipAddress as string | undefined;

      const result = await getMessageThread(
        messageId,
        user.patientId,
        user.organizationId,
        user.id,
        ipAddress
      );

      if (!result.message) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Message not found',
        });
      }

      return result;
    }),

  // Send message
  sendMessage: publicProcedure.input(messageSchema).mutation(async ({ input, ctx }) => {
    const { sessionToken, subject, body, priority, parentMessageId } = input;
    const user = await getPortalUserFromToken(sessionToken);
    const ipAddress = (ctx as Record<string, unknown>).ipAddress as string | undefined;

    const result = await sendPatientMessage(
      user.patientId,
      user.organizationId,
      subject,
      body,
      {
        priority: priority as never,
        parentMessageId,
        portalUserId: user.id,
        senderName: `${user.patient.firstName} ${user.patient.lastName}`,
        ipAddress,
      }
    );

    if (!result.success) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: result.error || 'Failed to send message',
      });
    }

    return { success: true, messageId: result.messageId };
  }),

  // Archive message
  archiveMessage: publicProcedure
    .input(
      z.object({
        sessionToken: z.string(),
        messageId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { sessionToken, messageId } = input;
      const user = await getPortalUserFromToken(sessionToken);

      const result = await archiveMessage(messageId, user.patientId, user.organizationId);

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error || 'Failed to archive message',
        });
      }

      return { success: true };
    }),

  // Get unread count
  getUnreadCount: publicProcedure
    .input(z.object({ sessionToken: z.string() }))
    .query(async ({ input }) => {
      const user = await getPortalUserFromToken(input.sessionToken);
      const count = await getUnreadMessageCount(user.patientId, user.organizationId);
      return { count };
    }),

  // ============================================
  // DOCUMENTS
  // ============================================

  // List documents
  listDocuments: publicProcedure
    .input(
      z.object({
        sessionToken: z.string(),
        category: z
          .enum([
            'VISIT_SUMMARY',
            'TREATMENT_PLAN',
            'LAB_RESULTS',
            'IMAGING',
            'CONSENT_FORM',
            'EDUCATION',
            'BILLING',
            'INSURANCE',
            'OTHER',
          ])
          .optional(),
        limit: z.number().min(1).max(50).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      const { sessionToken, category, limit, offset } = input;
      const user = await getPortalUserFromToken(sessionToken);
      const ipAddress = (ctx as Record<string, unknown>).ipAddress as string | undefined;

      const result = await getPatientDocuments(user.patientId, user.organizationId, {
        category: category as never,
        limit,
        offset,
      });

      // Log access
      await logPortalAccess({
        action: 'PORTAL_VIEW_DOCUMENTS',
        portalUserId: user.id,
        organizationId: user.organizationId,
        ipAddress,
        success: true,
      });

      return result;
    }),

  // Download document
  downloadDocument: publicProcedure
    .input(
      z.object({
        sessionToken: z.string(),
        documentId: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { sessionToken, documentId } = input;
      const user = await getPortalUserFromToken(sessionToken);
      const ipAddress = (ctx as Record<string, unknown>).ipAddress as string | undefined;

      const result = await getDocument(
        documentId,
        user.patientId,
        user.organizationId,
        user.id,
        ipAddress
      );

      if (!result.success) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: result.error || 'Document not found',
        });
      }

      // Record download
      await recordDocumentDownload(
        documentId,
        user.patientId,
        user.organizationId,
        user.id,
        ipAddress
      );

      // Return document info (actual file serving would be separate API endpoint)
      return {
        document: result.document,
        downloadUrl: `/api/portal/documents/${documentId}/download`,
      };
    }),

  // Get new documents count
  getNewDocumentsCount: publicProcedure
    .input(z.object({ sessionToken: z.string() }))
    .query(async ({ input }) => {
      const user = await getPortalUserFromToken(input.sessionToken);
      const count = await getNewDocumentCount(user.patientId, user.organizationId);
      return { count };
    }),

  // ============================================
  // TREATMENT PLAN
  // ============================================

  // Get active treatment plan
  getTreatmentPlan: publicProcedure
    .input(z.object({ sessionToken: z.string() }))
    .query(async ({ input, ctx }) => {
      const user = await getPortalUserFromToken(input.sessionToken);
      const ipAddress = (ctx as Record<string, unknown>).ipAddress as string | undefined;

      const plan = await prisma.treatmentPlan.findFirst({
        where: {
          patientId: user.patientId,
          organizationId: user.organizationId,
          status: 'ACTIVE',
        },
        include: {
          provider: {
            select: {
              title: true,
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          goals: {
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { startDate: 'desc' },
      });

      if (!plan) {
        return { treatmentPlan: null };
      }

      // Log access
      await logPortalAccess({
        action: 'PORTAL_VIEW_TREATMENT_PLAN',
        portalUserId: user.id,
        organizationId: user.organizationId,
        resource: 'TreatmentPlan',
        resourceId: plan.id,
        ipAddress,
        success: true,
      });

      return {
        treatmentPlan: {
          id: plan.id,
          name: plan.name,
          description: plan.description,
          status: plan.status,
          startDate: plan.startDate,
          endDate: plan.endDate,
          plannedVisits: plan.plannedVisits,
          completedVisits: plan.completedVisits,
          frequency: plan.frequency,
          duration: plan.duration,
          shortTermGoals: plan.shortTermGoals,
          longTermGoals: plan.longTermGoals,
          provider: {
            firstName: plan.provider.user.firstName,
            lastName: plan.provider.user.lastName,
            title: plan.provider.title,
          },
          goals: plan.goals.map((g) => ({
            id: g.id,
            description: g.description,
            status: g.status,
            progress: g.progress,
            targetDate: g.targetDate,
          })),
        },
      };
    }),

  // ============================================
  // PREFERENCES
  // ============================================

  // Get preferences
  getPreferences: publicProcedure
    .input(z.object({ sessionToken: z.string() }))
    .query(async ({ input }) => {
      const user = await getPortalUserFromToken(input.sessionToken);

      let preferences = await prisma.portalPreferences.findFirst({
        where: { portalUserId: user.id },
      });

      // Create default preferences if not exist
      if (!preferences) {
        preferences = await prisma.portalPreferences.create({
          data: { portalUserId: user.id },
        });
      }

      return {
        emailNotifications: preferences.emailNotifications,
        smsNotifications: preferences.smsNotifications,
        notifyAppointmentReminders: preferences.notifyAppointmentReminders,
        notifyAppointmentChanges: preferences.notifyAppointmentChanges,
        notifyNewMessages: preferences.notifyNewMessages,
        notifyNewDocuments: preferences.notifyNewDocuments,
        notifyBillingStatements: preferences.notifyBillingStatements,
        notifyFormRequests: preferences.notifyFormRequests,
        preferredLanguage: preferences.preferredLanguage,
        timezone: preferences.timezone,
        dateFormat: preferences.dateFormat,
        timeFormat: preferences.timeFormat,
      };
    }),

  // Update preferences
  updatePreferences: publicProcedure.input(preferencesSchema).mutation(async ({ input, ctx }) => {
    const { sessionToken, ...prefData } = input;
    const user = await getPortalUserFromToken(sessionToken);
    const ipAddress = (ctx as Record<string, unknown>).ipAddress as string | undefined;

    await prisma.portalPreferences.upsert({
      where: { portalUserId: user.id },
      create: {
        portalUserId: user.id,
        ...prefData,
      },
      update: prefData,
    });

    // Log the update
    await logPortalAccess({
      action: 'PORTAL_UPDATE_PREFERENCES',
      portalUserId: user.id,
      organizationId: user.organizationId,
      ipAddress,
      success: true,
    });

    return { success: true };
  }),

  // ============================================
  // DASHBOARD SUMMARY
  // ============================================

  // Get dashboard summary
  getDashboardSummary: publicProcedure
    .input(z.object({ sessionToken: z.string() }))
    .query(async ({ input }) => {
      const user = await getPortalUserFromToken(input.sessionToken);

      const [
        upcomingAppointments,
        pendingForms,
        unreadMessages,
        outstandingBalance,
        newDocuments,
        nextAppointment,
      ] = await Promise.all([
        // Upcoming appointments count
        prisma.appointment.count({
          where: {
            patientId: user.patientId,
            startTime: { gte: new Date() },
            status: { in: ['SCHEDULED', 'CONFIRMED'] },
          },
        }),
        // Pending forms count
        prisma.formDelivery.count({
          where: {
            patientId: user.patientId,
            completedAt: null,
          },
        }),
        // Unread messages count
        getUnreadMessageCount(user.patientId, user.organizationId),
        // Outstanding balance
        prisma.charge
          .aggregate({
            where: {
              patientId: user.patientId,
              organizationId: user.organizationId,
              status: { in: ['PENDING', 'BILLED'] },
            },
            _sum: { balance: true },
          })
          .then((r) => Number(r._sum.balance || 0)),
        // New documents count
        getNewDocumentCount(user.patientId, user.organizationId),
        // Next appointment
        prisma.appointment.findFirst({
          where: {
            patientId: user.patientId,
            startTime: { gte: new Date() },
            status: { in: ['SCHEDULED', 'CONFIRMED'] },
          },
          include: {
            appointmentType: {
              select: { id: true, name: true, duration: true },
            },
            provider: {
              select: {
                id: true,
                title: true,
                user: { select: { firstName: true, lastName: true } },
              },
            },
          },
          orderBy: { startTime: 'asc' },
        }),
      ]);

      return {
        upcomingAppointments,
        pendingForms,
        unreadMessages,
        outstandingBalance,
        newDocuments,
        nextAppointment: nextAppointment
          ? {
              id: nextAppointment.id,
              startTime: nextAppointment.startTime,
              endTime: nextAppointment.endTime,
              status: nextAppointment.status,
              appointmentType: nextAppointment.appointmentType
                ? {
                    id: nextAppointment.appointmentType.id,
                    name: nextAppointment.appointmentType.name,
                    duration: nextAppointment.appointmentType.duration,
                  }
                : undefined,
              provider: nextAppointment.provider
                ? {
                    id: nextAppointment.provider.id,
                    firstName: nextAppointment.provider.user.firstName,
                    lastName: nextAppointment.provider.user.lastName,
                    title: nextAppointment.provider.title,
                  }
                : undefined,
              canCancel: true,
            }
          : undefined,
      };
    }),
});
