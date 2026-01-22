import { z } from 'zod';
import { router, protectedProcedure, providerProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import { PrescriptionStatus } from '@prisma/client';

// Validation schemas
const prescriptionStatusSchema = z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'DISCONTINUED']);

// Progression schedule schema
const progressionWeekSchema = z.object({
  week: z.number().int().positive(),
  sets: z.number().int().positive().optional(),
  reps: z.number().int().positive().optional(),
  holdTime: z.number().int().positive().optional(),
  frequency: z.string().optional(),
  notes: z.string().optional(),
});

const progressionScheduleSchema = z.array(progressionWeekSchema);

export const prescriptionRouter = router({
  // List prescriptions for a patient
  list: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        status: prescriptionStatusSchema.optional(),
        encounterId: z.string().optional(),
        treatmentPlanId: z.string().optional(),
        diagnosisId: z.string().optional(),
        includeExercise: z.boolean().default(true),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const {
        patientId,
        status,
        encounterId,
        treatmentPlanId,
        diagnosisId,
        includeExercise,
        limit,
        offset,
      } = input;

      // Verify patient belongs to organization
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const where: Record<string, unknown> = {
        patientId,
        organizationId: ctx.user.organizationId,
      };

      if (status) {
        where.status = status;
      }

      if (encounterId) {
        where.encounterId = encounterId;
      }

      if (treatmentPlanId) {
        where.treatmentPlanId = treatmentPlanId;
      }

      if (diagnosisId) {
        where.diagnosisId = diagnosisId;
      }

      const [prescriptions, total] = await Promise.all([
        ctx.prisma.exercisePrescription.findMany({
          where,
          include: {
            exercise: includeExercise
              ? {
                  include: {
                    category: true,
                  },
                }
              : false,
            prescriber: {
              select: {
                id: true,
                user: {
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
                encounterDate: true,
                encounterType: true,
              },
            },
            treatmentPlan: {
              select: {
                id: true,
                name: true,
              },
            },
            diagnosis: {
              select: {
                id: true,
                icd10Code: true,
                description: true,
              },
            },
            _count: {
              select: {
                progressLogs: true,
              },
            },
          },
          orderBy: [{ status: 'asc' }, { prescribedAt: 'desc' }],
          take: limit,
          skip: offset,
        }),
        ctx.prisma.exercisePrescription.count({ where }),
      ]);

      // Group by status for summary
      const byStatus = prescriptions.reduce(
        (acc, prescription) => {
          if (!acc[prescription.status]) {
            acc[prescription.status] = [];
          }
          acc[prescription.status].push(prescription);
          return acc;
        },
        {} as Record<PrescriptionStatus, typeof prescriptions>
      );

      return {
        prescriptions,
        byStatus,
        total,
        limit,
        offset,
        hasMore: offset + prescriptions.length < total,
      };
    }),

  // Get a single prescription with full details
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const prescription = await ctx.prisma.exercisePrescription.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          exercise: {
            include: {
              category: true,
            },
          },
          patient: {
            select: {
              id: true,
              demographics: {
                select: {
                  firstName: true,
                  lastName: true,
                  dateOfBirth: true,
                },
              },
            },
          },
          prescriber: {
            select: {
              id: true,
              user: {
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
              encounterDate: true,
              encounterType: true,
              chiefComplaint: true,
            },
          },
          treatmentPlan: {
            select: {
              id: true,
              name: true,
              status: true,
            },
          },
          diagnosis: {
            select: {
              id: true,
              icd10Code: true,
              description: true,
            },
          },
          progressLogs: {
            orderBy: { completedAt: 'desc' },
            take: 10,
          },
        },
      });

      if (!prescription) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Prescription not found',
        });
      }

      // Calculate compliance rate
      const totalLogs = await ctx.prisma.patientExerciseProgress.count({
        where: { prescriptionId: input.id },
      });

      const completedLogs = await ctx.prisma.patientExerciseProgress.count({
        where: {
          prescriptionId: input.id,
          skipped: false,
        },
      });

      const complianceRate = totalLogs > 0 ? (completedLogs / totalLogs) * 100 : null;

      return {
        ...prescription,
        stats: {
          totalLogs,
          completedLogs,
          complianceRate,
        },
      };
    }),

  // Create a new prescription (provider only)
  create: providerProcedure
    .input(
      z.object({
        patientId: z.string(),
        exerciseId: z.string(),
        sets: z.number().int().positive().optional().nullable(),
        reps: z.number().int().positive().optional().nullable(),
        holdTime: z.number().int().positive().optional().nullable(),
        frequency: z.string().optional().nullable(),
        duration: z.string().optional().nullable(),
        startDate: z.date().optional(),
        endDate: z.date().optional().nullable(),
        specialInstructions: z.string().optional().nullable(),
        precautions: z.string().optional().nullable(),
        progressionSchedule: progressionScheduleSchema.optional().nullable(),
        encounterId: z.string().optional().nullable(),
        treatmentPlanId: z.string().optional().nullable(),
        diagnosisId: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        patientId,
        exerciseId,
        sets,
        reps,
        holdTime,
        frequency,
        duration,
        startDate,
        endDate,
        specialInstructions,
        precautions,
        progressionSchedule,
        encounterId,
        treatmentPlanId,
        diagnosisId,
      } = input;

      // Verify patient belongs to organization
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          demographics: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Verify exercise exists
      const exercise = await ctx.prisma.exercise.findFirst({
        where: {
          id: exerciseId,
          isActive: true,
        },
      });

      if (!exercise) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Exercise not found',
        });
      }

      // Get provider for current user
      const provider = await ctx.prisma.provider.findFirst({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!provider) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You must be a provider to prescribe exercises',
        });
      }

      // Verify encounter if provided
      if (encounterId) {
        const encounter = await ctx.prisma.encounter.findFirst({
          where: {
            id: encounterId,
            patientId,
            organizationId: ctx.user.organizationId,
          },
        });

        if (!encounter) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Encounter not found',
          });
        }
      }

      // Verify treatment plan if provided
      if (treatmentPlanId) {
        const treatmentPlan = await ctx.prisma.treatmentPlan.findFirst({
          where: {
            id: treatmentPlanId,
            patientId,
            organizationId: ctx.user.organizationId,
          },
        });

        if (!treatmentPlan) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Treatment plan not found',
          });
        }
      }

      // Verify diagnosis if provided (diagnosis is linked via encounter)
      if (diagnosisId) {
        const diagnosis = await ctx.prisma.diagnosis.findFirst({
          where: {
            id: diagnosisId,
            encounter: {
              patientId,
              organizationId: ctx.user.organizationId,
            },
          },
        });

        if (!diagnosis) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Diagnosis not found',
          });
        }
      }

      // Use exercise defaults if not specified
      const finalSets = sets ?? exercise.defaultSets;
      const finalReps = reps ?? exercise.defaultReps;
      const finalHoldTime = holdTime ?? exercise.defaultHoldTime;
      const finalFrequency = frequency ?? exercise.defaultFrequency;

      const prescription = await ctx.prisma.exercisePrescription.create({
        data: {
          patientId,
          exerciseId,
          prescriberId: provider.id,
          organizationId: ctx.user.organizationId,
          sets: finalSets,
          reps: finalReps,
          holdTime: finalHoldTime,
          frequency: finalFrequency,
          duration,
          startDate: startDate ?? new Date(),
          endDate,
          specialInstructions,
          precautions,
          progressionSchedule: progressionSchedule ?? undefined,
          encounterId,
          treatmentPlanId,
          diagnosisId,
          status: 'ACTIVE',
        },
        include: {
          exercise: {
            include: {
              category: true,
            },
          },
          patient: {
            select: {
              id: true,
              demographics: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          prescriber: {
            select: {
              id: true,
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

      const patientName = patient.demographics
        ? `${patient.demographics.firstName} ${patient.demographics.lastName}`
        : 'Unknown Patient';

      await auditLog('CREATE', 'ExercisePrescription', {
        entityId: prescription.id,
        changes: {
          exerciseName: exercise.name,
          patientName,
          sets: finalSets,
          reps: finalReps,
          frequency: finalFrequency,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return prescription;
    }),

  // Update a prescription (provider only)
  update: providerProcedure
    .input(
      z.object({
        id: z.string(),
        sets: z.number().int().positive().optional().nullable(),
        reps: z.number().int().positive().optional().nullable(),
        holdTime: z.number().int().positive().optional().nullable(),
        frequency: z.string().optional().nullable(),
        duration: z.string().optional().nullable(),
        startDate: z.date().optional(),
        endDate: z.date().optional().nullable(),
        specialInstructions: z.string().optional().nullable(),
        precautions: z.string().optional().nullable(),
        progressionSchedule: progressionScheduleSchema.optional().nullable(),
        currentWeek: z.number().int().positive().optional(),
        status: prescriptionStatusSchema.optional(),
        treatmentPlanId: z.string().optional().nullable(),
        diagnosisId: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      // Verify prescription exists and belongs to organization
      const existing = await ctx.prisma.exercisePrescription.findFirst({
        where: {
          id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          exercise: true,
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

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Prescription not found',
        });
      }

      // Cannot modify discontinued prescriptions
      if (existing.status === 'DISCONTINUED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot modify a discontinued prescription',
        });
      }

      // Verify treatment plan if provided
      if (updateData.treatmentPlanId) {
        const treatmentPlan = await ctx.prisma.treatmentPlan.findFirst({
          where: {
            id: updateData.treatmentPlanId,
            patientId: existing.patientId,
            organizationId: ctx.user.organizationId,
          },
        });

        if (!treatmentPlan) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Treatment plan not found',
          });
        }
      }

      // Verify diagnosis if provided (diagnosis is linked via encounter)
      if (updateData.diagnosisId) {
        const diagnosis = await ctx.prisma.diagnosis.findFirst({
          where: {
            id: updateData.diagnosisId,
            encounter: {
              patientId: existing.patientId,
              organizationId: ctx.user.organizationId,
            },
          },
        });

        if (!diagnosis) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Diagnosis not found',
          });
        }
      }

      // Build update object, handling null values properly
      const dataToUpdate: Record<string, unknown> = {};

      if (updateData.sets !== undefined) dataToUpdate.sets = updateData.sets;
      if (updateData.reps !== undefined) dataToUpdate.reps = updateData.reps;
      if (updateData.holdTime !== undefined) dataToUpdate.holdTime = updateData.holdTime;
      if (updateData.frequency !== undefined) dataToUpdate.frequency = updateData.frequency;
      if (updateData.duration !== undefined) dataToUpdate.duration = updateData.duration;
      if (updateData.startDate !== undefined) dataToUpdate.startDate = updateData.startDate;
      if (updateData.endDate !== undefined) dataToUpdate.endDate = updateData.endDate;
      if (updateData.specialInstructions !== undefined) dataToUpdate.specialInstructions = updateData.specialInstructions;
      if (updateData.precautions !== undefined) dataToUpdate.precautions = updateData.precautions;
      if (updateData.progressionSchedule !== undefined) dataToUpdate.progressionSchedule = updateData.progressionSchedule ?? undefined;
      if (updateData.currentWeek !== undefined) dataToUpdate.currentWeek = updateData.currentWeek;
      if (updateData.status !== undefined) dataToUpdate.status = updateData.status;
      if (updateData.treatmentPlanId !== undefined) dataToUpdate.treatmentPlanId = updateData.treatmentPlanId;
      if (updateData.diagnosisId !== undefined) dataToUpdate.diagnosisId = updateData.diagnosisId;

      const prescription = await ctx.prisma.exercisePrescription.update({
        where: { id },
        data: dataToUpdate,
        include: {
          exercise: {
            include: {
              category: true,
            },
          },
          patient: {
            select: {
              id: true,
              demographics: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          prescriber: {
            select: {
              id: true,
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

      await auditLog('UPDATE', 'ExercisePrescription', {
        entityId: id,
        changes: updateData,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return prescription;
    }),

  // Discontinue a prescription (provider only)
  discontinue: providerProcedure
    .input(
      z.object({
        id: z.string(),
        reason: z.string().min(1, 'Discontinuation reason is required'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, reason } = input;

      // Verify prescription exists and belongs to organization
      const existing = await ctx.prisma.exercisePrescription.findFirst({
        where: {
          id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          exercise: true,
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

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Prescription not found',
        });
      }

      // Cannot discontinue already discontinued prescriptions
      if (existing.status === 'DISCONTINUED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Prescription is already discontinued',
        });
      }

      const prescription = await ctx.prisma.exercisePrescription.update({
        where: { id },
        data: {
          status: 'DISCONTINUED',
          discontinuedAt: new Date(),
          discontinuedReason: reason,
        },
        include: {
          exercise: {
            include: {
              category: true,
            },
          },
          patient: {
            select: {
              id: true,
              demographics: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          prescriber: {
            select: {
              id: true,
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

      const patientName = existing.patient.demographics
        ? `${existing.patient.demographics.firstName} ${existing.patient.demographics.lastName}`
        : 'Unknown Patient';

      await auditLog('UPDATE', 'ExercisePrescription', {
        entityId: id,
        changes: {
          status: 'DISCONTINUED',
          discontinuedReason: reason,
          exerciseName: existing.exercise.name,
          patientName,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return prescription;
    }),

  // Bulk create prescriptions (provider only)
  bulkCreate: providerProcedure
    .input(
      z.object({
        patientId: z.string(),
        prescriptions: z.array(
          z.object({
            exerciseId: z.string(),
            sets: z.number().int().positive().optional().nullable(),
            reps: z.number().int().positive().optional().nullable(),
            holdTime: z.number().int().positive().optional().nullable(),
            frequency: z.string().optional().nullable(),
            duration: z.string().optional().nullable(),
            specialInstructions: z.string().optional().nullable(),
            precautions: z.string().optional().nullable(),
            progressionSchedule: progressionScheduleSchema.optional().nullable(),
          })
        ),
        startDate: z.date().optional(),
        endDate: z.date().optional().nullable(),
        encounterId: z.string().optional().nullable(),
        treatmentPlanId: z.string().optional().nullable(),
        diagnosisId: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        patientId,
        prescriptions,
        startDate,
        endDate,
        encounterId,
        treatmentPlanId,
        diagnosisId,
      } = input;

      // Verify patient belongs to organization
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          demographics: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Get provider for current user
      const provider = await ctx.prisma.provider.findFirst({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!provider) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You must be a provider to prescribe exercises',
        });
      }

      // Get all exercises
      const exerciseIds = prescriptions.map((p) => p.exerciseId);
      const exercises = await ctx.prisma.exercise.findMany({
        where: {
          id: { in: exerciseIds },
          isActive: true,
        },
      });

      const exerciseMap = new Map(exercises.map((e) => [e.id, e]));

      // Validate all exercises exist
      for (const prescription of prescriptions) {
        if (!exerciseMap.has(prescription.exerciseId)) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Exercise not found: ${prescription.exerciseId}`,
          });
        }
      }

      // Create all prescriptions
      const createdPrescriptions = await Promise.all(
        prescriptions.map(async (p) => {
          const exercise = exerciseMap.get(p.exerciseId)!;
          return ctx.prisma.exercisePrescription.create({
            data: {
              patientId,
              exerciseId: p.exerciseId,
              prescriberId: provider.id,
              organizationId: ctx.user.organizationId,
              sets: p.sets ?? exercise.defaultSets,
              reps: p.reps ?? exercise.defaultReps,
              holdTime: p.holdTime ?? exercise.defaultHoldTime,
              frequency: p.frequency ?? exercise.defaultFrequency,
              duration: p.duration,
              startDate: startDate ?? new Date(),
              endDate,
              specialInstructions: p.specialInstructions,
              precautions: p.precautions,
              progressionSchedule: p.progressionSchedule ?? undefined,
              encounterId,
              treatmentPlanId,
              diagnosisId,
              status: 'ACTIVE',
            },
            include: {
              exercise: {
                include: {
                  category: true,
                },
              },
            },
          });
        })
      );

      const patientName = patient.demographics
        ? `${patient.demographics.firstName} ${patient.demographics.lastName}`
        : 'Unknown Patient';

      await auditLog('CREATE', 'ExercisePrescription', {
        changes: {
          action: 'bulk_create',
          patientName,
          count: createdPrescriptions.length,
          exerciseNames: createdPrescriptions.map((p) => p.exercise.name),
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        count: createdPrescriptions.length,
        prescriptions: createdPrescriptions,
      };
    }),

  // Get active prescriptions for patient (for patient portal)
  getActiveForPatient: protectedProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      const prescriptions = await ctx.prisma.exercisePrescription.findMany({
        where: {
          patientId: input.patientId,
          organizationId: ctx.user.organizationId,
          status: 'ACTIVE',
          OR: [
            { endDate: null },
            { endDate: { gte: new Date() } },
          ],
        },
        include: {
          exercise: {
            include: {
              category: true,
            },
          },
          _count: {
            select: {
              progressLogs: true,
            },
          },
        },
        orderBy: [
          { currentWeek: 'asc' },
          { prescribedAt: 'desc' },
        ],
      });

      // Calculate today's exercises based on frequency
      const todaysExercises = prescriptions.filter(() => {
        // For now, include all active prescriptions
        // A more sophisticated implementation would parse frequency
        return true;
      });

      return {
        prescriptions,
        todaysExercises,
        totalActive: prescriptions.length,
      };
    }),

  // Advance progression week (provider only)
  advanceProgression: providerProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.exercisePrescription.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Prescription not found',
        });
      }

      if (existing.status !== 'ACTIVE') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Can only advance progression on active prescriptions',
        });
      }

      // Check if there's a progression schedule
      const progressionSchedule = existing.progressionSchedule as Array<{
        week: number;
        sets?: number;
        reps?: number;
        holdTime?: number;
        frequency?: string;
      }> | null;

      const nextWeek = existing.currentWeek + 1;
      const updateData: Record<string, unknown> = { currentWeek: nextWeek };

      // If there's a progression schedule, apply the next week's parameters
      if (progressionSchedule && Array.isArray(progressionSchedule)) {
        const nextWeekParams = progressionSchedule.find((w) => w.week === nextWeek);
        if (nextWeekParams) {
          if (nextWeekParams.sets) updateData.sets = nextWeekParams.sets;
          if (nextWeekParams.reps) updateData.reps = nextWeekParams.reps;
          if (nextWeekParams.holdTime) updateData.holdTime = nextWeekParams.holdTime;
          if (nextWeekParams.frequency) updateData.frequency = nextWeekParams.frequency;
        }
      }

      const prescription = await ctx.prisma.exercisePrescription.update({
        where: { id: input.id },
        data: updateData,
        include: {
          exercise: {
            include: {
              category: true,
            },
          },
        },
      });

      await auditLog('UPDATE', 'ExercisePrescription', {
        entityId: input.id,
        changes: {
          action: 'advance_progression',
          fromWeek: existing.currentWeek,
          toWeek: nextWeek,
          newParams: updateData,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return prescription;
    }),

  // Get prescription summary for a patient
  getSummary: protectedProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [active, paused, completed, discontinued] = await Promise.all([
        ctx.prisma.exercisePrescription.count({
          where: {
            patientId: input.patientId,
            organizationId: ctx.user.organizationId,
            status: 'ACTIVE',
          },
        }),
        ctx.prisma.exercisePrescription.count({
          where: {
            patientId: input.patientId,
            organizationId: ctx.user.organizationId,
            status: 'PAUSED',
          },
        }),
        ctx.prisma.exercisePrescription.count({
          where: {
            patientId: input.patientId,
            organizationId: ctx.user.organizationId,
            status: 'COMPLETED',
          },
        }),
        ctx.prisma.exercisePrescription.count({
          where: {
            patientId: input.patientId,
            organizationId: ctx.user.organizationId,
            status: 'DISCONTINUED',
          },
        }),
      ]);

      // Get recent progress logs
      const recentProgress = await ctx.prisma.patientExerciseProgress.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          prescription: {
            patientId: input.patientId,
          },
        },
        orderBy: { completedAt: 'desc' },
        take: 7,
        include: {
          prescription: {
            include: {
              exercise: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });

      // Calculate overall compliance (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [totalLogs, completedLogs] = await Promise.all([
        ctx.prisma.patientExerciseProgress.count({
          where: {
            organizationId: ctx.user.organizationId,
            prescription: {
              patientId: input.patientId,
            },
            completedAt: { gte: thirtyDaysAgo },
          },
        }),
        ctx.prisma.patientExerciseProgress.count({
          where: {
            organizationId: ctx.user.organizationId,
            prescription: {
              patientId: input.patientId,
            },
            completedAt: { gte: thirtyDaysAgo },
            skipped: false,
          },
        }),
      ]);

      const complianceRate = totalLogs > 0 ? Math.round((completedLogs / totalLogs) * 100) : null;

      return {
        counts: {
          active,
          paused,
          completed,
          discontinued,
          total: active + paused + completed + discontinued,
        },
        compliance: {
          rate: complianceRate,
          totalLogs,
          completedLogs,
          period: '30 days',
        },
        recentProgress,
      };
    }),
});
