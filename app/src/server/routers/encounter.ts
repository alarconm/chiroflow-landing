import { z } from 'zod';
import { router, protectedProcedure, providerProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import type { EncounterStatus, EncounterType } from '@prisma/client';

// Validation schemas
const encounterStatusSchema = z.enum([
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'SIGNED',
  'AMENDED',
]);

const encounterTypeSchema = z.enum([
  'INITIAL_EVAL',
  'FOLLOW_UP',
  'RE_EVALUATION',
  'DISCHARGE',
  'MAINTENANCE',
  'ACUTE',
  'WORKERS_COMP',
  'PERSONAL_INJURY',
]);

export const encounterRouter = router({
  // Create a new encounter (from appointment or standalone)
  create: providerProcedure
    .input(
      z.object({
        patientId: z.string(),
        providerId: z.string().optional(), // Defaults to current user's provider
        appointmentId: z.string().optional(), // Link to existing appointment
        encounterType: encounterTypeSchema.default('FOLLOW_UP'),
        chiefComplaint: z.string().optional(),
        location: z.string().optional(),
        treatmentPlanId: z.string().optional(),
        encounterDate: z.coerce.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        patientId,
        providerId: inputProviderId,
        appointmentId,
        encounterType,
        chiefComplaint,
        location,
        treatmentPlanId,
        encounterDate,
      } = input;

      // Verify patient exists and belongs to org
      const patient = await ctx.prisma.patient.findFirst({
        where: { id: patientId, organizationId: ctx.user.organizationId },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Get provider (default to current user's provider record)
      let providerId = inputProviderId;
      if (!providerId) {
        const userProvider = await ctx.prisma.provider.findFirst({
          where: { userId: ctx.user.id, organizationId: ctx.user.organizationId },
        });
        if (!userProvider) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Current user is not a provider. Please specify a provider ID.',
          });
        }
        providerId = userProvider.id;
      } else {
        // Verify provider exists and belongs to org
        const provider = await ctx.prisma.provider.findFirst({
          where: { id: providerId, organizationId: ctx.user.organizationId },
        });
        if (!provider) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Provider not found',
          });
        }
      }

      // If appointmentId provided, verify it exists and link
      if (appointmentId) {
        const appointment = await ctx.prisma.appointment.findFirst({
          where: {
            id: appointmentId,
            organizationId: ctx.user.organizationId,
          },
          include: { encounter: true },
        });

        if (!appointment) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Appointment not found',
          });
        }

        if (appointment.encounter) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'This appointment already has an encounter',
          });
        }
      }

      // Verify treatment plan if provided
      if (treatmentPlanId) {
        const plan = await ctx.prisma.treatmentPlan.findFirst({
          where: {
            id: treatmentPlanId,
            patientId,
            organizationId: ctx.user.organizationId,
          },
        });

        if (!plan) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Treatment plan not found or does not belong to this patient',
          });
        }
      }

      // Calculate visit number if linked to treatment plan
      let visitNumber: number | undefined;
      if (treatmentPlanId) {
        const existingEncounters = await ctx.prisma.encounter.count({
          where: { treatmentPlanId },
        });
        visitNumber = existingEncounters + 1;
      }

      // Create the encounter
      const encounter = await ctx.prisma.encounter.create({
        data: {
          patientId,
          providerId,
          appointmentId,
          encounterType,
          chiefComplaint,
          location,
          treatmentPlanId,
          visitNumber,
          encounterDate: encounterDate ?? new Date(),
          status: 'IN_PROGRESS',
          organizationId: ctx.user.organizationId,
          createdBy: ctx.user.id,
        },
        include: {
          patient: {
            include: {
              demographics: {
                select: {
                  firstName: true,
                  lastName: true,
                  dateOfBirth: true,
                },
              },
            },
          },
          provider: {
            select: {
              id: true,
              title: true,
              specialty: true,
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          appointment: {
            select: {
              id: true,
              startTime: true,
              endTime: true,
            },
          },
          treatmentPlan: {
            select: {
              id: true,
              name: true,
              plannedVisits: true,
              completedVisits: true,
            },
          },
        },
      });

      // Update treatment plan completed visits count
      if (treatmentPlanId) {
        await ctx.prisma.treatmentPlan.update({
          where: { id: treatmentPlanId },
          data: { completedVisits: { increment: 1 } },
        });
      }

      // Log creation
      await auditLog('CREATE', 'Encounter', {
        entityId: encounter.id,
        changes: {
          encounterType,
          patientId,
          providerId,
          appointmentId,
          treatmentPlanId,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return encounter;
    }),

  // Get single encounter with all related data
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const encounter = await ctx.prisma.encounter.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            include: {
              demographics: true,
            },
          },
          provider: {
            select: {
              id: true,
              title: true,
              specialty: true,
              npiNumber: true,
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          appointment: {
            select: {
              id: true,
              startTime: true,
              endTime: true,
              status: true,
              appointmentType: {
                select: { name: true },
              },
            },
          },
          treatmentPlan: {
            select: {
              id: true,
              name: true,
              status: true,
              plannedVisits: true,
              completedVisits: true,
              startDate: true,
              endDate: true,
            },
          },
          soapNote: {
            include: {
              template: {
                select: { id: true, name: true },
              },
            },
          },
          diagnoses: {
            orderBy: [{ isPrimary: 'desc' }, { sequence: 'asc' }],
          },
          procedures: {
            orderBy: { createdAt: 'asc' },
          },
          assessments: {
            orderBy: { administeredAt: 'desc' },
          },
          bodyDiagrams: {
            orderBy: { createdAt: 'desc' },
          },
          addendums: {
            orderBy: { addedAt: 'desc' },
          },
        },
      });

      if (!encounter) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        });
      }

      // Log view action
      await auditLog('VIEW', 'Encounter', {
        entityId: encounter.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return encounter;
    }),

  // Update encounter
  update: providerProcedure
    .input(
      z.object({
        id: z.string(),
        status: encounterStatusSchema.optional(),
        encounterType: encounterTypeSchema.optional(),
        chiefComplaint: z.string().optional(),
        location: z.string().optional(),
        encounterDate: z.coerce.date().optional(),
        treatmentPlanId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, status, treatmentPlanId, ...updateData } = input;

      // Verify encounter exists and belongs to org
      const existing = await ctx.prisma.encounter.findFirst({
        where: { id, organizationId: ctx.user.organizationId },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        });
      }

      // Check if encounter is locked
      if (existing.status === 'SIGNED' || existing.status === 'AMENDED') {
        if (status !== 'AMENDED') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cannot modify a signed encounter. Use addendum instead.',
          });
        }
      }

      // If changing treatment plan, verify it
      if (treatmentPlanId !== undefined) {
        if (treatmentPlanId !== null) {
          const plan = await ctx.prisma.treatmentPlan.findFirst({
            where: {
              id: treatmentPlanId,
              patientId: existing.patientId,
              organizationId: ctx.user.organizationId,
            },
          });

          if (!plan) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Treatment plan not found',
            });
          }
        }
      }

      // Build update data
      const data: Record<string, unknown> = { ...updateData };

      if (status) {
        data.status = status;

        // Set timestamps based on status
        if (status === 'COMPLETED') {
          data.completedAt = new Date();
        } else if (status === 'SIGNED') {
          data.signedAt = new Date();
          data.signedBy = ctx.user.id;
        }
      }

      if (treatmentPlanId !== undefined) {
        data.treatmentPlanId = treatmentPlanId;
      }

      const encounter = await ctx.prisma.encounter.update({
        where: { id },
        data,
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
      });

      // Log update
      await auditLog('UPDATE', 'Encounter', {
        entityId: id,
        changes: { status, ...updateData },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return encounter;
    }),

  // List encounters with filters
  list: protectedProcedure
    .input(
      z.object({
        patientId: z.string().optional(),
        providerId: z.string().optional(),
        status: encounterStatusSchema.optional(),
        encounterType: encounterTypeSchema.optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        treatmentPlanId: z.string().optional(),
        limit: z.number().min(1).max(100).default(25),
        offset: z.number().min(0).default(0),
        sortBy: z.enum(['encounterDate', 'createdAt', 'status']).default('encounterDate'),
        sortOrder: z.enum(['asc', 'desc']).default('desc'),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const {
        patientId,
        providerId,
        status,
        encounterType,
        startDate,
        endDate,
        treatmentPlanId,
        limit = 25,
        offset = 0,
        sortBy = 'encounterDate',
        sortOrder = 'desc',
      } = input ?? {};

      // Build where clause
      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
      };

      if (patientId) where.patientId = patientId;
      if (providerId) where.providerId = providerId;
      if (status) where.status = status;
      if (encounterType) where.encounterType = encounterType;
      if (treatmentPlanId) where.treatmentPlanId = treatmentPlanId;

      // Date range filter
      if (startDate || endDate) {
        where.encounterDate = {
          ...(startDate && { gte: startDate }),
          ...(endDate && { lte: endDate }),
        };
      }

      const [encounters, total] = await Promise.all([
        ctx.prisma.encounter.findMany({
          where,
          orderBy: { [sortBy]: sortOrder },
          take: limit,
          skip: offset,
          include: {
            patient: {
              include: {
                demographics: {
                  select: {
                    firstName: true,
                    lastName: true,
                    dateOfBirth: true,
                  },
                },
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
            soapNote: {
              select: {
                id: true,
                isLocked: true,
                version: true,
              },
            },
            diagnoses: {
              where: { isPrimary: true },
              take: 1,
              select: {
                icd10Code: true,
                description: true,
              },
            },
            _count: {
              select: {
                diagnoses: true,
                procedures: true,
                assessments: true,
              },
            },
          },
        }),
        ctx.prisma.encounter.count({ where }),
      ]);

      return {
        encounters: encounters.map((e) => ({
          id: e.id,
          encounterDate: e.encounterDate,
          status: e.status,
          encounterType: e.encounterType,
          chiefComplaint: e.chiefComplaint,
          visitNumber: e.visitNumber,
          patient: {
            id: e.patient.id,
            mrn: e.patient.mrn,
            firstName: e.patient.demographics?.firstName ?? '',
            lastName: e.patient.demographics?.lastName ?? '',
            dateOfBirth: e.patient.demographics?.dateOfBirth,
          },
          provider: {
            id: e.provider.id,
            name: `${e.provider.user.firstName} ${e.provider.user.lastName}${e.provider.title ? ', ' + e.provider.title : ''}`,
          },
          hasSoapNote: !!e.soapNote,
          isLocked: e.soapNote?.isLocked ?? false,
          primaryDiagnosis: e.diagnoses[0] ?? null,
          counts: e._count,
          signedAt: e.signedAt,
          createdAt: e.createdAt,
        })),
        total,
        limit,
        offset,
        hasMore: offset + encounters.length < total,
      };
    }),

  // Get encounter by appointment ID
  getByAppointment: protectedProcedure
    .input(z.object({ appointmentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const encounter = await ctx.prisma.encounter.findFirst({
        where: {
          appointmentId: input.appointmentId,
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
          soapNote: {
            select: {
              id: true,
              isLocked: true,
            },
          },
        },
      });

      return encounter;
    }),

  // Sign an encounter (lock it)
  sign: providerProcedure
    .input(
      z.object({
        id: z.string(),
        signature: z.string().optional(), // Base64 signature or reference
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, signature } = input;

      const encounter = await ctx.prisma.encounter.findFirst({
        where: { id, organizationId: ctx.user.organizationId },
        include: {
          soapNote: true,
          provider: true,
        },
      });

      if (!encounter) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        });
      }

      // Verify user is the provider or has permission
      const userProvider = await ctx.prisma.provider.findFirst({
        where: { userId: ctx.user.id, organizationId: ctx.user.organizationId },
      });

      if (!userProvider || userProvider.id !== encounter.providerId) {
        // Check if user is admin
        if (ctx.user.role !== 'ADMIN' && ctx.user.role !== 'OWNER') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only the encounter provider can sign this encounter',
          });
        }
      }

      if (encounter.status === 'SIGNED' || encounter.status === 'AMENDED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Encounter is already signed',
        });
      }

      // Update encounter and lock SOAP note
      const [updatedEncounter] = await ctx.prisma.$transaction([
        ctx.prisma.encounter.update({
          where: { id },
          data: {
            status: 'SIGNED',
            signedAt: new Date(),
            signedBy: ctx.user.id,
          },
        }),
        ...(encounter.soapNote
          ? [
              ctx.prisma.sOAPNote.update({
                where: { id: encounter.soapNote.id },
                data: {
                  isLocked: true,
                  lockedAt: new Date(),
                  lockedBy: ctx.user.id,
                },
              }),
            ]
          : []),
      ]);

      // Log signing
      await auditLog('UPDATE', 'Encounter', {
        entityId: id,
        changes: { action: 'signed', signature: !!signature },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updatedEncounter;
    }),

  // Get unsigned encounters for a provider (for workqueue)
  getUnsigned: providerProcedure
    .input(
      z.object({
        providerId: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const { providerId, limit = 50 } = input ?? {};

      // If no providerId, get current user's provider
      let targetProviderId = providerId;
      if (!targetProviderId) {
        const userProvider = await ctx.prisma.provider.findFirst({
          where: { userId: ctx.user.id, organizationId: ctx.user.organizationId },
        });
        if (userProvider) {
          targetProviderId = userProvider.id;
        }
      }

      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
        status: { in: ['IN_PROGRESS', 'COMPLETED'] },
      };

      if (targetProviderId) {
        where.providerId = targetProviderId;
      }

      const encounters = await ctx.prisma.encounter.findMany({
        where,
        orderBy: { encounterDate: 'asc' },
        take: limit,
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
          soapNote: {
            select: {
              id: true,
              subjective: true,
              objective: true,
              assessment: true,
              plan: true,
            },
          },
        },
      });

      // Calculate days since encounter
      const now = new Date();
      return encounters.map((e) => {
        const daysSince = Math.floor(
          (now.getTime() - e.encounterDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Check if SOAP sections are complete
        const soapComplete =
          e.soapNote &&
          e.soapNote.subjective &&
          e.soapNote.objective &&
          e.soapNote.assessment &&
          e.soapNote.plan;

        return {
          id: e.id,
          encounterDate: e.encounterDate,
          status: e.status,
          encounterType: e.encounterType,
          chiefComplaint: e.chiefComplaint,
          patientId: e.patient.id,
          patientName: `${e.patient.demographics?.firstName ?? ''} ${e.patient.demographics?.lastName ?? ''}`.trim(),
          patientMrn: e.patient.mrn,
          daysSince,
          hasSoapNote: !!e.soapNote,
          soapComplete,
          isUrgent: daysSince >= 3, // Flag encounters over 3 days old
        };
      });
    }),

  // Get encounter statistics for dashboard
  getStats: protectedProcedure
    .input(
      z.object({
        providerId: z.string().optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const { providerId, startDate, endDate } = input ?? {};

      const baseWhere: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
      };

      if (providerId) baseWhere.providerId = providerId;
      if (startDate || endDate) {
        baseWhere.encounterDate = {
          ...(startDate && { gte: startDate }),
          ...(endDate && { lte: endDate }),
        };
      }

      // Get counts by status
      const [total, inProgress, completed, signed, byType] = await Promise.all([
        ctx.prisma.encounter.count({ where: baseWhere }),
        ctx.prisma.encounter.count({
          where: { ...baseWhere, status: 'IN_PROGRESS' },
        }),
        ctx.prisma.encounter.count({
          where: { ...baseWhere, status: 'COMPLETED' },
        }),
        ctx.prisma.encounter.count({
          where: { ...baseWhere, status: 'SIGNED' },
        }),
        ctx.prisma.encounter.groupBy({
          by: ['encounterType'],
          where: baseWhere,
          _count: true,
        }),
      ]);

      return {
        total,
        byStatus: {
          inProgress,
          completed,
          signed,
          unsigned: inProgress + completed,
        },
        byType: byType.reduce(
          (acc, item) => {
            acc[item.encounterType] = item._count;
            return acc;
          },
          {} as Record<string, number>
        ),
      };
    }),

  // Delete encounter (admin only, must not be signed)
  delete: protectedProcedure
    .input(z.object({ id: z.string(), reason: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { id, reason } = input;

      // Only admins can delete
      if (ctx.user.role !== 'ADMIN' && ctx.user.role !== 'OWNER') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only administrators can delete encounters',
        });
      }

      const encounter = await ctx.prisma.encounter.findFirst({
        where: { id, organizationId: ctx.user.organizationId },
      });

      if (!encounter) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        });
      }

      if (encounter.status === 'SIGNED' || encounter.status === 'AMENDED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot delete a signed encounter',
        });
      }

      // Log before deletion
      await auditLog('DELETE', 'Encounter', {
        entityId: id,
        changes: {
          reason,
          encounterType: encounter.encounterType,
          patientId: encounter.patientId,
          providerId: encounter.providerId,
          encounterDate: encounter.encounterDate,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      // Delete encounter (cascades to SOAP note, diagnoses, procedures)
      await ctx.prisma.encounter.delete({ where: { id } });

      return { success: true };
    }),

  // Provider workqueue - today's appointments with charting status
  getProviderWorkqueue: providerProcedure
    .input(
      z.object({
        providerId: z.string().optional(),
        date: z.coerce.date().optional(), // Defaults to today
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const targetDate = input?.date || new Date();
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Get provider ID from user if not specified
      let providerId = input?.providerId;
      if (!providerId) {
        const provider = await ctx.prisma.provider.findFirst({
          where: { userId: ctx.user.id, organizationId: ctx.user.organizationId },
        });
        providerId = provider?.id;
      }

      if (!providerId) {
        return { appointments: [], encounters: [] };
      }

      // Get appointments for the day
      const appointments = await ctx.prisma.appointment.findMany({
        where: {
          providerId,
          organizationId: ctx.user.organizationId,
          startTime: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        orderBy: { startTime: 'asc' },
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
          encounter: {
            select: {
              id: true,
              status: true,
              encounterType: true,
              soapNote: {
                select: {
                  id: true,
                  isLocked: true,
                  version: true,
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
      });

      // Determine charting status for each appointment
      const appointmentsWithStatus = appointments.map((apt) => ({
        ...apt,
        chartingStatus: apt.encounter
          ? apt.encounter.status === 'SIGNED'
            ? 'signed'
            : apt.encounter.soapNote
            ? 'in_progress'
            : 'started'
          : 'not_started',
      }));

      return {
        appointments: appointmentsWithStatus,
        date: targetDate,
        providerId,
      };
    }),

  // Get unsigned/incomplete notes for provider
  getUnsignedNotes: providerProcedure
    .input(
      z.object({
        providerId: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      // Get provider ID from user if not specified
      let providerId = input?.providerId;
      if (!providerId) {
        const provider = await ctx.prisma.provider.findFirst({
          where: { userId: ctx.user.id, organizationId: ctx.user.organizationId },
        });
        providerId = provider?.id;
      }

      if (!providerId) {
        return { notes: [] };
      }

      // Get encounters that are not SIGNED or AMENDED
      const encounters = await ctx.prisma.encounter.findMany({
        where: {
          providerId,
          organizationId: ctx.user.organizationId,
          status: {
            notIn: ['SIGNED', 'AMENDED'],
          },
        },
        orderBy: { encounterDate: 'desc' },
        take: input?.limit ?? 50,
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
          soapNote: {
            select: {
              id: true,
              isLocked: true,
              version: true,
              subjective: true,
              objective: true,
              assessment: true,
              plan: true,
            },
          },
        },
      });

      // Calculate days since encounter
      const now = new Date();
      const notesWithAge = encounters.map((enc) => {
        const encounterDate = new Date(enc.encounterDate);
        const daysSince = Math.floor(
          (now.getTime() - encounterDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        const hasContent = enc.soapNote && (
          enc.soapNote.subjective ||
          enc.soapNote.objective ||
          enc.soapNote.assessment ||
          enc.soapNote.plan
        );
        return {
          ...enc,
          daysSinceVisit: daysSince,
          isOverdue: daysSince > 3,
          completeness: hasContent ? 'partial' : 'empty',
        };
      });

      return {
        notes: notesWithAge,
        total: notesWithAge.length,
        overdue: notesWithAge.filter((n) => n.isOverdue).length,
      };
    }),

  // Provider charting statistics
  getProviderStats: providerProcedure
    .input(
      z.object({
        providerId: z.string().optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      // Get provider ID from user if not specified
      let providerId = input?.providerId;
      if (!providerId) {
        const provider = await ctx.prisma.provider.findFirst({
          where: { userId: ctx.user.id, organizationId: ctx.user.organizationId },
        });
        providerId = provider?.id;
      }

      if (!providerId) {
        return {
          totalEncounters: 0,
          signedNotes: 0,
          pendingNotes: 0,
          avgDaysToSign: 0,
          byType: [],
        };
      }

      // Date range defaults to last 30 days
      const endDate = input?.endDate || new Date();
      const startDate = input?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const where = {
        providerId,
        organizationId: ctx.user.organizationId,
        encounterDate: {
          gte: startDate,
          lte: endDate,
        },
      };

      // Get total encounters
      const totalEncounters = await ctx.prisma.encounter.count({ where });

      // Get signed notes count
      const signedNotes = await ctx.prisma.encounter.count({
        where: { ...where, status: { in: ['SIGNED', 'AMENDED'] } },
      });

      // Get pending notes count
      const pendingNotes = await ctx.prisma.encounter.count({
        where: { ...where, status: { notIn: ['SIGNED', 'AMENDED'] } },
      });

      // Get encounters by type
      const byType = await ctx.prisma.encounter.groupBy({
        by: ['encounterType'],
        where,
        _count: true,
      });

      // Calculate average days to sign (simplified - would need signedAt timestamp for accuracy)
      const recentSigned = await ctx.prisma.encounter.findMany({
        where: { ...where, status: 'SIGNED' },
        select: {
          encounterDate: true,
          updatedAt: true,
        },
        take: 50,
      });

      let avgDaysToSign = 0;
      if (recentSigned.length > 0) {
        const totalDays = recentSigned.reduce((acc, enc) => {
          const days = Math.max(
            0,
            (enc.updatedAt.getTime() - new Date(enc.encounterDate).getTime()) /
              (1000 * 60 * 60 * 24)
          );
          return acc + days;
        }, 0);
        avgDaysToSign = Math.round((totalDays / recentSigned.length) * 10) / 10;
      }

      return {
        totalEncounters,
        signedNotes,
        pendingNotes,
        avgDaysToSign,
        byType: byType.map((t) => ({
          type: t.encounterType,
          count: t._count,
        })),
        dateRange: { startDate, endDate },
      };
    }),

  // Batch sign multiple notes
  batchSign: providerProcedure
    .input(
      z.object({
        encounterIds: z.array(z.string()).min(1).max(20),
        attestation: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { encounterIds, attestation } = input;

      // Verify all encounters belong to provider and can be signed
      const encounters = await ctx.prisma.encounter.findMany({
        where: {
          id: { in: encounterIds },
          organizationId: ctx.user.organizationId,
        },
        include: {
          provider: true,
          soapNote: true,
        },
      });

      // Verify provider owns these encounters
      const provider = await ctx.prisma.provider.findFirst({
        where: { userId: ctx.user.id, organizationId: ctx.user.organizationId },
      });

      if (!provider) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Provider profile not found',
        });
      }

      const errors: { id: string; error: string }[] = [];
      const signed: string[] = [];

      for (const encounter of encounters) {
        // Check ownership
        if (encounter.providerId !== provider.id) {
          errors.push({ id: encounter.id, error: 'Not your encounter' });
          continue;
        }

        // Check if already signed
        if (encounter.status === 'SIGNED' || encounter.status === 'AMENDED') {
          errors.push({ id: encounter.id, error: 'Already signed' });
          continue;
        }

        // Check if has SOAP note
        if (!encounter.soapNote) {
          errors.push({ id: encounter.id, error: 'No SOAP note to sign' });
          continue;
        }

        // Sign the encounter
        await ctx.prisma.$transaction([
          ctx.prisma.encounter.update({
            where: { id: encounter.id },
            data: { status: 'SIGNED' },
          }),
          ctx.prisma.sOAPNote.update({
            where: { id: encounter.soapNote.id },
            data: {
              isLocked: true,
              lockedAt: new Date(),
              lockedBy: ctx.user.id,
            },
          }),
        ]);

        await auditLog('ENCOUNTER_SIGN', 'SOAPNote', {
          entityId: encounter.soapNote.id,
          changes: { batchSign: true, encounterId: encounter.id },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        signed.push(encounter.id);
      }

      return {
        success: signed.length > 0,
        signed,
        errors,
        total: encounterIds.length,
        signedCount: signed.length,
        errorCount: errors.length,
      };
    }),
});
