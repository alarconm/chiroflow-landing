/**
 * Mobile Schedule Router (US-266)
 *
 * Mobile schedule view and management for providers.
 * Provides optimized endpoints for mobile app schedule functionality.
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditAction } from '@/lib/audit';
import { AppointmentStatus, Prisma } from '@prisma/client';
import {
  startOfDay,
  endOfDay,
  format,
} from 'date-fns';

// Input schemas
const appointmentStatusSchema = z.enum([
  'SCHEDULED',
  'CONFIRMED',
  'CHECKED_IN',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
  'RESCHEDULED',
]);

const appointmentNotesSchema = z.object({
  appointmentId: z.string(),
  notes: z.string().optional(),
  patientNotes: z.string().optional(),
  chiefComplaint: z.string().optional(),
});

// Helper to get primary phone from contact
function getPrimaryPhone(contact: { homePhone: string | null; mobilePhone: string | null; workPhone: string | null } | null | undefined): string | null {
  if (!contact) return null;
  return contact.mobilePhone || contact.homePhone || contact.workPhone || null;
}

export const mobileScheduleRouter = router({
  // ==========================================
  // TODAY'S SCHEDULE VIEW
  // ==========================================

  /**
   * Get today's schedule for the current provider
   * Optimized for mobile with essential data only
   */
  getTodaySchedule: protectedProcedure.query(async ({ ctx }) => {
    // Get the provider associated with the current user
    const provider = await prisma.provider.findFirst({
      where: {
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        isActive: true,
      },
    });

    if (!provider) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'No provider profile found for this user',
      });
    }

    const today = new Date();
    const dayStart = startOfDay(today);
    const dayEnd = endOfDay(today);

    const appointments = await prisma.appointment.findMany({
      where: {
        providerId: provider.id,
        organizationId: ctx.user.organizationId,
        startTime: { gte: dayStart },
        endTime: { lte: dayEnd },
        status: { notIn: ['CANCELLED'] },
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
            contacts: {
              where: { isPrimary: true },
              take: 1,
              select: {
                homePhone: true,
                mobilePhone: true,
                workPhone: true,
                email: true,
              },
            },
          },
        },
        appointmentType: {
          select: {
            id: true,
            name: true,
            color: true,
            duration: true,
          },
        },
        room: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { startTime: 'asc' },
    });

    // Calculate stats
    const stats = {
      total: appointments.length,
      scheduled: appointments.filter(a => a.status === 'SCHEDULED').length,
      confirmed: appointments.filter(a => a.status === 'CONFIRMED').length,
      checkedIn: appointments.filter(a => a.status === 'CHECKED_IN').length,
      inProgress: appointments.filter(a => a.status === 'IN_PROGRESS').length,
      completed: appointments.filter(a => a.status === 'COMPLETED').length,
      noShow: appointments.filter(a => a.status === 'NO_SHOW').length,
    };

    // Find next appointment
    const now = new Date();
    const nextAppointment = appointments.find(
      a => new Date(a.startTime) > now && ['SCHEDULED', 'CONFIRMED'].includes(a.status)
    );

    // Find current appointment (in progress or should be happening now)
    const currentAppointment = appointments.find(
      a =>
        (a.status === 'IN_PROGRESS' || a.status === 'CHECKED_IN') ||
        (new Date(a.startTime) <= now && new Date(a.endTime) >= now && ['SCHEDULED', 'CONFIRMED'].includes(a.status))
    );

    return {
      date: format(today, 'yyyy-MM-dd'),
      providerId: provider.id,
      providerName: `${ctx.user.firstName} ${ctx.user.lastName}`,
      stats,
      appointments: appointments.map(a => ({
        id: a.id,
        startTime: a.startTime.toISOString(),
        endTime: a.endTime.toISOString(),
        status: a.status,
        chiefComplaint: a.chiefComplaint,
        notes: a.notes,
        patientNotes: a.patientNotes,
        isTelehealth: a.isTelehealth,
        patient: {
          id: a.patient.id,
          mrn: a.patient.mrn,
          name: a.patient.demographics
            ? `${a.patient.demographics.preferredName || a.patient.demographics.firstName} ${a.patient.demographics.lastName}`
            : 'Unknown',
          firstName: a.patient.demographics?.firstName || '',
          lastName: a.patient.demographics?.lastName || '',
          preferredName: a.patient.demographics?.preferredName,
          dateOfBirth: a.patient.demographics?.dateOfBirth?.toISOString(),
          phone: getPrimaryPhone(a.patient.contacts[0]),
          email: a.patient.contacts[0]?.email,
        },
        appointmentType: a.appointmentType,
        room: a.room,
      })),
      nextAppointment: nextAppointment ? {
        id: nextAppointment.id,
        startTime: nextAppointment.startTime.toISOString(),
        patientName: nextAppointment.patient.demographics
          ? `${nextAppointment.patient.demographics.preferredName || nextAppointment.patient.demographics.firstName} ${nextAppointment.patient.demographics.lastName}`
          : 'Unknown',
      } : null,
      currentAppointment: currentAppointment ? {
        id: currentAppointment.id,
        startTime: currentAppointment.startTime.toISOString(),
        status: currentAppointment.status,
        patientName: currentAppointment.patient.demographics
          ? `${currentAppointment.patient.demographics.preferredName || currentAppointment.patient.demographics.firstName} ${currentAppointment.patient.demographics.lastName}`
          : 'Unknown',
      } : null,
      serverTimestamp: new Date().toISOString(),
    };
  }),

  // ==========================================
  // WEEK/DAY CALENDAR VIEW
  // ==========================================

  /**
   * Get schedule for a date range (week or day view)
   * Supports pull-to-refresh with serverTimestamp
   */
  getScheduleRange: protectedProcedure
    .input(
      z.object({
        startDate: z.string().datetime(),
        endDate: z.string().datetime(),
        providerId: z.string().optional(), // Optional: view another provider's schedule if authorized
      })
    )
    .query(async ({ ctx, input }) => {
      // Determine which provider to query
      let providerId = input.providerId;

      if (!providerId) {
        const provider = await prisma.provider.findFirst({
          where: {
            userId: ctx.user.id,
            organizationId: ctx.user.organizationId,
            isActive: true,
          },
        });

        if (!provider) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'No provider profile found for this user',
          });
        }
        providerId = provider.id;
      } else {
        // Verify the provider exists and belongs to the organization
        const provider = await prisma.provider.findFirst({
          where: {
            id: providerId,
            organizationId: ctx.user.organizationId,
          },
        });

        if (!provider) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Provider not found',
          });
        }
      }

      const startDate = new Date(input.startDate);
      const endDate = new Date(input.endDate);

      const appointments = await prisma.appointment.findMany({
        where: {
          providerId,
          organizationId: ctx.user.organizationId,
          startTime: { gte: startDate },
          endTime: { lte: endDate },
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
          appointmentType: {
            select: {
              id: true,
              name: true,
              color: true,
              duration: true,
            },
          },
          room: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { startTime: 'asc' },
      });

      // Also get schedule blocks for the range
      const blocks = await prisma.scheduleBlock.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          OR: [
            { providerId },
            { providerId: null }, // Org-wide blocks
          ],
          startTime: { gte: startDate },
          endTime: { lte: endDate },
        },
        select: {
          id: true,
          title: true,
          blockType: true,
          startTime: true,
          endTime: true,
          providerId: true,
        },
        orderBy: { startTime: 'asc' },
      });

      return {
        providerId,
        startDate: input.startDate,
        endDate: input.endDate,
        appointments: appointments.map(a => ({
          id: a.id,
          startTime: a.startTime.toISOString(),
          endTime: a.endTime.toISOString(),
          status: a.status,
          chiefComplaint: a.chiefComplaint,
          notes: a.notes,
          isTelehealth: a.isTelehealth,
          patient: {
            id: a.patient.id,
            mrn: a.patient.mrn,
            name: a.patient.demographics
              ? `${a.patient.demographics.preferredName || a.patient.demographics.firstName} ${a.patient.demographics.lastName}`
              : 'Unknown',
            dateOfBirth: a.patient.demographics?.dateOfBirth?.toISOString(),
          },
          appointmentType: a.appointmentType,
          room: a.room,
        })),
        blocks: blocks.map(b => ({
          id: b.id,
          title: b.title,
          blockType: b.blockType,
          startTime: b.startTime.toISOString(),
          endTime: b.endTime.toISOString(),
          isOrgWide: b.providerId === null,
        })),
        serverTimestamp: new Date().toISOString(),
      };
    }),

  // ==========================================
  // QUICK PATIENT CHECK-IN
  // ==========================================

  /**
   * Quick check-in a patient from mobile
   */
  quickCheckIn: protectedProcedure
    .input(z.object({ appointmentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const appointment = await prisma.appointment.findFirst({
        where: {
          id: input.appointmentId,
          organizationId: ctx.user.organizationId,
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
          message: `Cannot check in appointment with status: ${appointment.status}`,
        });
      }

      const updatedAppointment = await prisma.appointment.update({
        where: { id: input.appointmentId },
        data: {
          status: 'CHECKED_IN',
          checkedInAt: new Date(),
          checkedInBy: ctx.user.id,
        },
      });

      await createAuditLog({
        action: 'UPDATE' as AuditAction,
        entityType: 'Appointment',
        entityId: input.appointmentId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          mobileCheckIn: true,
          previousStatus: appointment.status,
          newStatus: 'CHECKED_IN',
        },
      });

      return {
        success: true,
        appointmentId: input.appointmentId,
        status: 'CHECKED_IN',
        checkedInAt: updatedAppointment.checkedInAt?.toISOString(),
        patientName: appointment.patient.demographics
          ? `${appointment.patient.demographics.firstName} ${appointment.patient.demographics.lastName}`
          : 'Unknown',
      };
    }),

  // ==========================================
  // VIEW PATIENT SUMMARY
  // ==========================================

  /**
   * Get patient summary for an appointment
   * Includes recent visits, active treatment plans, and key demographics
   */
  getPatientSummary: protectedProcedure
    .input(z.object({
      appointmentId: z.string().optional(),
      patientId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      if (!input.appointmentId && !input.patientId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Either appointmentId or patientId is required',
        });
      }

      let patientId = input.patientId;

      if (input.appointmentId) {
        const appointment = await prisma.appointment.findFirst({
          where: {
            id: input.appointmentId,
            organizationId: ctx.user.organizationId,
          },
          select: { patientId: true },
        });

        if (!appointment) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Appointment not found',
          });
        }
        patientId = appointment.patientId;
      }

      const patient = await prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          demographics: true,
          contacts: {
            where: { isPrimary: true },
            take: 1,
          },
          emergencyContacts: {
            take: 1,
          },
          insurances: {
            where: { isActive: true },
            take: 1,
          },
          treatmentPlans: {
            where: { status: 'ACTIVE' },
            select: {
              id: true,
              name: true,
              goals: true,
              startDate: true,
            },
            take: 3,
          },
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Get recent appointments (last 5)
      const recentAppointments = await prisma.appointment.findMany({
        where: {
          patientId: patient.id,
          organizationId: ctx.user.organizationId,
          status: 'COMPLETED',
        },
        include: {
          appointmentType: {
            select: {
              name: true,
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
        take: 5,
      });

      // Get any alerts or notes (placeholder for future medical alert system)
      const alerts: string[] = [];

      await createAuditLog({
        action: 'VIEW' as AuditAction,
        entityType: 'Patient',
        entityId: patient.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        metadata: { source: 'mobile_schedule' },
      });

      return {
        patient: {
          id: patient.id,
          mrn: patient.mrn,
          status: patient.status,
          demographics: patient.demographics ? {
            firstName: patient.demographics.firstName,
            lastName: patient.demographics.lastName,
            preferredName: patient.demographics.preferredName,
            dateOfBirth: patient.demographics.dateOfBirth?.toISOString(),
            gender: patient.demographics.gender,
          } : null,
          contact: patient.contacts[0] ? {
            phone: getPrimaryPhone(patient.contacts[0]),
            email: patient.contacts[0].email,
          } : null,
          emergencyContact: patient.emergencyContacts[0] ? {
            name: patient.emergencyContacts[0].name,
            relationship: patient.emergencyContacts[0].relationship,
            phone: patient.emergencyContacts[0].phone,
          } : null,
          insurance: patient.insurances[0] ? {
            payerName: patient.insurances[0].payerName,
            policyNumber: patient.insurances[0].policyNumber,
          } : null,
        },
        alerts,
        activeTreatmentPlans: patient.treatmentPlans.map((tp) => ({
          id: tp.id,
          name: tp.name,
          goals: tp.goals as unknown,
          startDate: tp.startDate?.toISOString(),
        })),
        recentVisits: recentAppointments.map(a => ({
          id: a.id,
          date: a.startTime.toISOString(),
          type: a.appointmentType.name,
          provider: `${a.provider.user.firstName} ${a.provider.user.lastName}`,
        })),
        totalVisits: await prisma.appointment.count({
          where: {
            patientId: patient.id,
            organizationId: ctx.user.organizationId,
            status: 'COMPLETED',
          },
        }),
      };
    }),

  // ==========================================
  // APPOINTMENT NOTES
  // ==========================================

  /**
   * Update appointment notes from mobile
   */
  updateAppointmentNotes: protectedProcedure
    .input(appointmentNotesSchema)
    .mutation(async ({ ctx, input }) => {
      const appointment = await prisma.appointment.findFirst({
        where: {
          id: input.appointmentId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!appointment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Appointment not found',
        });
      }

      const updateData: Prisma.AppointmentUpdateInput = {};
      if (input.notes !== undefined) updateData.notes = input.notes;
      if (input.patientNotes !== undefined) updateData.patientNotes = input.patientNotes;
      if (input.chiefComplaint !== undefined) updateData.chiefComplaint = input.chiefComplaint;

      const updated = await prisma.appointment.update({
        where: { id: input.appointmentId },
        data: updateData,
      });

      await createAuditLog({
        action: 'UPDATE' as AuditAction,
        entityType: 'Appointment',
        entityId: input.appointmentId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          mobileNotesUpdate: true,
          fields: Object.keys(updateData),
        },
      });

      return {
        success: true,
        appointmentId: input.appointmentId,
        notes: updated.notes,
        patientNotes: updated.patientNotes,
        chiefComplaint: updated.chiefComplaint,
      };
    }),

  /**
   * Get appointment notes
   */
  getAppointmentNotes: protectedProcedure
    .input(z.object({ appointmentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const appointment = await prisma.appointment.findFirst({
        where: {
          id: input.appointmentId,
          organizationId: ctx.user.organizationId,
        },
        select: {
          id: true,
          notes: true,
          patientNotes: true,
          chiefComplaint: true,
          status: true,
        },
      });

      if (!appointment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Appointment not found',
        });
      }

      return {
        appointmentId: appointment.id,
        notes: appointment.notes,
        patientNotes: appointment.patientNotes,
        chiefComplaint: appointment.chiefComplaint,
        status: appointment.status,
      };
    }),

  // ==========================================
  // SCHEDULE CHANGE NOTIFICATIONS SUBSCRIPTION
  // ==========================================

  /**
   * Get recent schedule changes since a timestamp
   * Used for push notification updates and polling
   */
  getScheduleChanges: protectedProcedure
    .input(
      z.object({
        since: z.string().datetime(),
        providerId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      let providerId = input.providerId;

      if (!providerId) {
        const provider = await prisma.provider.findFirst({
          where: {
            userId: ctx.user.id,
            organizationId: ctx.user.organizationId,
          },
        });
        providerId = provider?.id;
      }

      if (!providerId) {
        return {
          changes: [],
          serverTimestamp: new Date().toISOString(),
        };
      }

      const sinceDate = new Date(input.since);

      // Get appointments that were created or updated since the timestamp
      const changedAppointments = await prisma.appointment.findMany({
        where: {
          providerId,
          organizationId: ctx.user.organizationId,
          OR: [
            { createdAt: { gt: sinceDate } },
            { updatedAt: { gt: sinceDate } },
          ],
        },
        include: {
          patient: {
            include: {
              demographics: {
                select: {
                  firstName: true,
                  lastName: true,
                  preferredName: true,
                },
              },
            },
          },
          appointmentType: {
            select: {
              name: true,
              color: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      });

      return {
        changes: changedAppointments.map(a => ({
          id: a.id,
          changeType: a.createdAt > sinceDate ? 'created' : 'updated',
          startTime: a.startTime.toISOString(),
          endTime: a.endTime.toISOString(),
          status: a.status,
          patientName: a.patient.demographics
            ? `${a.patient.demographics.preferredName || a.patient.demographics.firstName} ${a.patient.demographics.lastName}`
            : 'Unknown',
          appointmentType: a.appointmentType.name,
          appointmentColor: a.appointmentType.color,
          updatedAt: a.updatedAt.toISOString(),
        })),
        serverTimestamp: new Date().toISOString(),
      };
    }),

  // ==========================================
  // UPDATE APPOINTMENT STATUS
  // ==========================================

  /**
   * Update appointment status (mobile optimized)
   */
  updateStatus: protectedProcedure
    .input(
      z.object({
        appointmentId: z.string(),
        status: appointmentStatusSchema,
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const appointment = await prisma.appointment.findFirst({
        where: {
          id: input.appointmentId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!appointment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Appointment not found',
        });
      }

      const updateData: Prisma.AppointmentUpdateInput = {
        status: input.status as AppointmentStatus,
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

      const updated = await prisma.appointment.update({
        where: { id: input.appointmentId },
        data: updateData,
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
        },
      });

      await createAuditLog({
        action: 'UPDATE' as AuditAction,
        entityType: 'Appointment',
        entityId: input.appointmentId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          mobileStatusUpdate: true,
          previousStatus: appointment.status,
          newStatus: input.status,
          reason: input.reason,
        },
      });

      return {
        success: true,
        appointmentId: input.appointmentId,
        status: updated.status,
        patientName: updated.patient.demographics
          ? `${updated.patient.demographics.firstName} ${updated.patient.demographics.lastName}`
          : 'Unknown',
      };
    }),

  // ==========================================
  // PULL-TO-REFRESH DATA
  // ==========================================

  /**
   * Refresh all schedule data (optimized for pull-to-refresh)
   */
  refreshSchedule: protectedProcedure
    .input(
      z.object({
        date: z.string().datetime().optional(),
        lastSyncTimestamp: z.string().datetime().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const provider = await prisma.provider.findFirst({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
          isActive: true,
        },
      });

      if (!provider) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No provider profile found',
        });
      }

      const targetDate = input.date ? new Date(input.date) : new Date();
      const dayStart = startOfDay(targetDate);
      const dayEnd = endOfDay(targetDate);

      const appointments = await prisma.appointment.findMany({
        where: {
          providerId: provider.id,
          organizationId: ctx.user.organizationId,
          startTime: { gte: dayStart },
          endTime: { lte: dayEnd },
          status: { notIn: ['CANCELLED'] },
        },
        include: {
          patient: {
            include: {
              demographics: {
                select: {
                  firstName: true,
                  lastName: true,
                  preferredName: true,
                },
              },
            },
          },
          appointmentType: {
            select: {
              id: true,
              name: true,
              color: true,
              duration: true,
            },
          },
          room: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { startTime: 'asc' },
      });

      // Check if there are changes since last sync
      let hasChanges = true;
      if (input.lastSyncTimestamp) {
        const lastSync = new Date(input.lastSyncTimestamp);
        hasChanges = appointments.some(a => a.updatedAt > lastSync);
      }

      return {
        date: format(targetDate, 'yyyy-MM-dd'),
        providerId: provider.id,
        hasChanges,
        appointmentCount: appointments.length,
        appointments: appointments.map(a => ({
          id: a.id,
          startTime: a.startTime.toISOString(),
          endTime: a.endTime.toISOString(),
          status: a.status,
          chiefComplaint: a.chiefComplaint,
          patient: {
            id: a.patient.id,
            mrn: a.patient.mrn,
            name: a.patient.demographics
              ? `${a.patient.demographics.preferredName || a.patient.demographics.firstName} ${a.patient.demographics.lastName}`
              : 'Unknown',
          },
          appointmentType: a.appointmentType,
          room: a.room,
          updatedAt: a.updatedAt.toISOString(),
        })),
        serverTimestamp: new Date().toISOString(),
      };
    }),
});
