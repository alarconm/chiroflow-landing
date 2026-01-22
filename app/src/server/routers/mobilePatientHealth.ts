import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import { BodyLocation, PainQuality, PatientHealthGoalStatus, PatientHealthGoalType, PhotoType, Prisma } from '@prisma/client';

// Validation schemas
const bodyLocationSchema = z.nativeEnum(BodyLocation);
const painQualitySchema = z.nativeEnum(PainQuality);
const goalStatusSchema = z.nativeEnum(PatientHealthGoalStatus);
const goalTypeSchema = z.nativeEnum(PatientHealthGoalType);
const photoTypeSchema = z.nativeEnum(PhotoType);
const painLevelSchema = z.number().int().min(0).max(10);

// Pain quality labels for display
const PAIN_QUALITY_LABELS: Record<PainQuality, string> = {
  SHARP: 'Sharp',
  DULL: 'Dull',
  ACHING: 'Aching',
  BURNING: 'Burning',
  THROBBING: 'Throbbing',
  STABBING: 'Stabbing',
  SHOOTING: 'Shooting',
  TINGLING: 'Tingling',
  NUMBNESS: 'Numbness',
  CRAMPING: 'Cramping',
  OTHER: 'Other',
};

// Body location labels for display
const BODY_LOCATION_LABELS: Record<BodyLocation, string> = {
  HEAD: 'Head',
  NECK: 'Neck',
  UPPER_BACK: 'Upper Back',
  MID_BACK: 'Mid Back',
  LOWER_BACK: 'Lower Back',
  LEFT_SHOULDER: 'Left Shoulder',
  RIGHT_SHOULDER: 'Right Shoulder',
  LEFT_ARM: 'Left Arm',
  RIGHT_ARM: 'Right Arm',
  LEFT_WRIST_HAND: 'Left Wrist/Hand',
  RIGHT_WRIST_HAND: 'Right Wrist/Hand',
  CHEST: 'Chest',
  ABDOMEN: 'Abdomen',
  LEFT_HIP: 'Left Hip',
  RIGHT_HIP: 'Right Hip',
  LEFT_LEG: 'Left Leg',
  RIGHT_LEG: 'Right Leg',
  LEFT_KNEE: 'Left Knee',
  RIGHT_KNEE: 'Right Knee',
  LEFT_ANKLE_FOOT: 'Left Ankle/Foot',
  RIGHT_ANKLE_FOOT: 'Right Ankle/Foot',
  OTHER: 'Other',
};

// Common pain triggers
const COMMON_TRIGGERS = [
  'Sitting',
  'Standing',
  'Walking',
  'Bending',
  'Lifting',
  'Exercise',
  'Work',
  'Stress',
  'Weather',
  'Sleep position',
  'Driving',
  'Morning stiffness',
];

// Common relieving factors
const COMMON_RELIEVING_FACTORS = [
  'Rest',
  'Ice',
  'Heat',
  'Stretching',
  'Exercise',
  'Medication',
  'Chiropractic adjustment',
  'Massage',
  'Position change',
  'Walking',
  'Lying down',
];

export const mobilePatientHealthRouter = router({
  // ========================================
  // Pain Diary Methods
  // ========================================

  // Create a pain diary entry
  createPainEntry: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        painLevel: painLevelSchema,
        bodyLocation: bodyLocationSchema,
        bodyLocationOther: z.string().optional().nullable(),
        painQuality: z.array(painQualitySchema),
        painQualityOther: z.string().optional().nullable(),
        triggers: z.array(z.string()).default([]),
        relievingFactors: z.array(z.string()).default([]),
        affectsWork: z.boolean().default(false),
        affectsSleep: z.boolean().default(false),
        affectsActivity: z.boolean().default(false),
        affectsMood: z.boolean().default(false),
        duration: z.string().optional().nullable(),
        medicationTaken: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        entryDate: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, ...data } = input;

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

      const entry = await ctx.prisma.painDiaryEntry.create({
        data: {
          ...data,
          entryDate: data.entryDate ?? new Date(),
          patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      await auditLog('CREATE', 'PainDiaryEntry', {
        entityId: entry.id,
        changes: { patientId, painLevel: data.painLevel, bodyLocation: data.bodyLocation },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return entry;
    }),

  // Get pain diary entries for a patient
  getPainEntries: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        bodyLocation: bodyLocationSchema.optional(),
        limit: z.number().min(1).max(100).default(30),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, startDate, endDate, bodyLocation, limit, offset } = input;

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

      if (startDate || endDate) {
        where.entryDate = {};
        if (startDate) {
          (where.entryDate as Record<string, unknown>).gte = startDate;
        }
        if (endDate) {
          (where.entryDate as Record<string, unknown>).lte = endDate;
        }
      }

      if (bodyLocation) {
        where.bodyLocation = bodyLocation;
      }

      const [entries, total] = await Promise.all([
        ctx.prisma.painDiaryEntry.findMany({
          where,
          orderBy: { entryDate: 'desc' },
          take: limit,
          skip: offset,
        }),
        ctx.prisma.painDiaryEntry.count({ where }),
      ]);

      return {
        entries,
        total,
        limit,
        offset,
        hasMore: offset + entries.length < total,
      };
    }),

  // Get pain summary/trends for a patient
  getPainSummary: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        period: z.enum(['week', 'month', 'quarter']).default('month'),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, period } = input;

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

      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      switch (period) {
        case 'week':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        case 'quarter':
          startDate.setMonth(startDate.getMonth() - 3);
          break;
      }

      const entries = await ctx.prisma.painDiaryEntry.findMany({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
          entryDate: { gte: startDate, lte: endDate },
        },
        orderBy: { entryDate: 'asc' },
      });

      // Calculate averages
      const totalEntries = entries.length;
      const avgPainLevel = totalEntries > 0
        ? Math.round((entries.reduce((sum, e) => sum + e.painLevel, 0) / totalEntries) * 10) / 10
        : null;

      // Body location frequency
      const locationFrequency = entries.reduce((acc, e) => {
        acc[e.bodyLocation] = (acc[e.bodyLocation] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Most common location
      const mostCommonLocation = Object.entries(locationFrequency).sort((a, b) => b[1] - a[1])[0];

      // Pain trend (comparing first half vs second half)
      const midIndex = Math.floor(entries.length / 2);
      const firstHalf = entries.slice(0, midIndex);
      const secondHalf = entries.slice(midIndex);
      const firstHalfAvg = firstHalf.length > 0
        ? firstHalf.reduce((sum, e) => sum + e.painLevel, 0) / firstHalf.length
        : null;
      const secondHalfAvg = secondHalf.length > 0
        ? secondHalf.reduce((sum, e) => sum + e.painLevel, 0) / secondHalf.length
        : null;

      let trend: 'improving' | 'worsening' | 'stable' | 'insufficient_data' = 'insufficient_data';
      if (firstHalfAvg !== null && secondHalfAvg !== null) {
        const diff = secondHalfAvg - firstHalfAvg;
        if (diff <= -0.5) trend = 'improving';
        else if (diff >= 0.5) trend = 'worsening';
        else trend = 'stable';
      }

      // Impact analysis
      const impactCounts = {
        work: entries.filter(e => e.affectsWork).length,
        sleep: entries.filter(e => e.affectsSleep).length,
        activity: entries.filter(e => e.affectsActivity).length,
        mood: entries.filter(e => e.affectsMood).length,
      };

      // Daily pain levels for charting
      const dailyPainLevels = entries.map(e => ({
        date: e.entryDate,
        painLevel: e.painLevel,
        location: e.bodyLocation,
      }));

      return {
        period,
        startDate,
        endDate,
        totalEntries,
        averagePainLevel: avgPainLevel,
        trend,
        mostCommonLocation: mostCommonLocation
          ? { location: mostCommonLocation[0], count: mostCommonLocation[1] }
          : null,
        locationFrequency,
        impactCounts,
        dailyPainLevels,
      };
    }),

  // Update a pain diary entry
  updatePainEntry: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        painLevel: painLevelSchema.optional(),
        bodyLocation: bodyLocationSchema.optional(),
        bodyLocationOther: z.string().optional().nullable(),
        painQuality: z.array(painQualitySchema).optional(),
        painQualityOther: z.string().optional().nullable(),
        triggers: z.array(z.string()).optional(),
        relievingFactors: z.array(z.string()).optional(),
        affectsWork: z.boolean().optional(),
        affectsSleep: z.boolean().optional(),
        affectsActivity: z.boolean().optional(),
        affectsMood: z.boolean().optional(),
        duration: z.string().optional().nullable(),
        medicationTaken: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      const existing = await ctx.prisma.painDiaryEntry.findFirst({
        where: {
          id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pain diary entry not found',
        });
      }

      const entry = await ctx.prisma.painDiaryEntry.update({
        where: { id },
        data: updateData,
      });

      await auditLog('UPDATE', 'PainDiaryEntry', {
        entityId: id,
        changes: updateData,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return entry;
    }),

  // Delete a pain diary entry
  deletePainEntry: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.painDiaryEntry.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pain diary entry not found',
        });
      }

      await ctx.prisma.painDiaryEntry.delete({ where: { id: input.id } });

      await auditLog('DELETE', 'PainDiaryEntry', {
        entityId: input.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // ========================================
  // Progress Photo Methods
  // ========================================

  // Upload a progress photo
  createProgressPhoto: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        photoUrl: z.string().url(),
        thumbnailUrl: z.string().url().optional().nullable(),
        photoType: photoTypeSchema,
        caption: z.string().optional().nullable(),
        angle: z.string().optional().nullable(),
        bodyArea: bodyLocationSchema.optional().nullable(),
        isBaseline: z.boolean().default(false),
        comparisonGroupId: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        takenAt: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, ...data } = input;

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

      const photo = await ctx.prisma.progressPhoto.create({
        data: {
          ...data,
          takenAt: data.takenAt ?? new Date(),
          patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      await auditLog('CREATE', 'ProgressPhoto', {
        entityId: photo.id,
        changes: { patientId, photoType: data.photoType },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return photo;
    }),

  // Get progress photos for a patient
  getProgressPhotos: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        photoType: photoTypeSchema.optional(),
        bodyArea: bodyLocationSchema.optional(),
        baselineOnly: z.boolean().default(false),
        comparisonGroupId: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, photoType, bodyArea, baselineOnly, comparisonGroupId, limit, offset } = input;

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

      if (photoType) where.photoType = photoType;
      if (bodyArea) where.bodyArea = bodyArea;
      if (baselineOnly) where.isBaseline = true;
      if (comparisonGroupId) where.comparisonGroupId = comparisonGroupId;

      const [photos, total] = await Promise.all([
        ctx.prisma.progressPhoto.findMany({
          where,
          orderBy: { takenAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        ctx.prisma.progressPhoto.count({ where }),
      ]);

      return {
        photos,
        total,
        limit,
        offset,
        hasMore: offset + photos.length < total,
      };
    }),

  // Get comparison photos (baseline vs current)
  getComparisonPhotos: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        bodyArea: bodyLocationSchema.optional(),
        photoType: photoTypeSchema.optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, bodyArea, photoType } = input;

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

      if (bodyArea) where.bodyArea = bodyArea;
      if (photoType) where.photoType = photoType;

      // Get baseline photo
      const baseline = await ctx.prisma.progressPhoto.findFirst({
        where: { ...where, isBaseline: true },
        orderBy: { takenAt: 'asc' },
      });

      // Get most recent photo
      const current = await ctx.prisma.progressPhoto.findFirst({
        where: { ...where, isBaseline: false },
        orderBy: { takenAt: 'desc' },
      });

      return {
        baseline,
        current,
        hasComparison: baseline !== null && current !== null,
      };
    }),

  // Delete a progress photo
  deleteProgressPhoto: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.progressPhoto.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Progress photo not found',
        });
      }

      await ctx.prisma.progressPhoto.delete({ where: { id: input.id } });

      await auditLog('DELETE', 'ProgressPhoto', {
        entityId: input.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // ========================================
  // Patient Goals Methods
  // ========================================

  // Create a patient goal
  createGoal: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        title: z.string().min(1, 'Title is required'),
        description: z.string().optional().nullable(),
        goalType: goalTypeSchema,
        targetValue: z.number().optional().nullable(),
        targetUnit: z.string().optional().nullable(),
        startValue: z.number().optional().nullable(),
        targetDate: z.date().optional().nullable(),
        milestones: z.any().optional().nullable(),
        isProviderAssigned: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, ...data } = input;

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

      const goal = await ctx.prisma.patientGoal.create({
        data: {
          ...data,
          currentValue: data.startValue,
          patientId,
          assignedBy: data.isProviderAssigned ? ctx.user.id : null,
          organizationId: ctx.user.organizationId,
        },
      });

      await auditLog('CREATE', 'PatientGoal', {
        entityId: goal.id,
        changes: { patientId, title: data.title, goalType: data.goalType },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return goal;
    }),

  // Get patient goals
  getGoals: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        status: goalStatusSchema.optional(),
        goalType: goalTypeSchema.optional(),
        includeCompleted: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, status, goalType, includeCompleted } = input;

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
      } else if (!includeCompleted) {
        where.status = { in: ['ACTIVE', 'PAUSED'] };
      }

      if (goalType) where.goalType = goalType;

      const goals = await ctx.prisma.patientGoal.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      });

      // Calculate progress percentage for each goal
      const goalsWithProgress = goals.map(goal => {
        let progressPercentage: number | null = null;
        if (goal.startValue !== null && goal.targetValue !== null && goal.currentValue !== null) {
          const range = goal.targetValue - goal.startValue;
          const progress = goal.currentValue - goal.startValue;
          progressPercentage = range !== 0 ? Math.round((progress / range) * 100) : 0;
          // Clamp between 0 and 100
          progressPercentage = Math.max(0, Math.min(100, progressPercentage));
        }
        return { ...goal, progressPercentage };
      });

      return goalsWithProgress;
    }),

  // Update goal progress
  updateGoalProgress: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        currentValue: z.number(),
        note: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, currentValue, note } = input;

      const existing = await ctx.prisma.patientGoal.findFirst({
        where: {
          id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Goal not found',
        });
      }

      // Build progress note entry
      const progressEntry = {
        date: new Date().toISOString(),
        value: currentValue,
        note: note || null,
      };

      // Get existing progress notes
      const existingNotes = (existing.progressNotes as Array<Record<string, unknown>>) || [];
      const updatedNotes = [...existingNotes, progressEntry];

      // Check if goal is completed
      const isCompleted = existing.targetValue !== null && currentValue >= existing.targetValue;

      const goal = await ctx.prisma.patientGoal.update({
        where: { id },
        data: {
          currentValue,
          progressNotes: updatedNotes as unknown as Prisma.InputJsonValue,
          lastProgressUpdate: new Date(),
          status: isCompleted ? 'COMPLETED' : existing.status,
          completedAt: isCompleted ? new Date() : null,
        },
      });

      await auditLog('UPDATE', 'PatientGoal', {
        entityId: id,
        changes: { currentValue, note },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return goal;
    }),

  // Update goal status
  updateGoalStatus: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: goalStatusSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, status } = input;

      const existing = await ctx.prisma.patientGoal.findFirst({
        where: {
          id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Goal not found',
        });
      }

      const goal = await ctx.prisma.patientGoal.update({
        where: { id },
        data: {
          status,
          completedAt: status === 'COMPLETED' ? new Date() : null,
        },
      });

      await auditLog('UPDATE', 'PatientGoal', {
        entityId: id,
        changes: { status },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return goal;
    }),

  // Delete a goal
  deleteGoal: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.patientGoal.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Goal not found',
        });
      }

      await ctx.prisma.patientGoal.delete({ where: { id: input.id } });

      await auditLog('DELETE', 'PatientGoal', {
        entityId: input.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // ========================================
  // Education & Wellness Content Methods
  // ========================================

  // Get prescribed education for patient
  getPatientEducation: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        unreadOnly: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, unreadOnly } = input;

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

      if (unreadOnly) {
        where.isRead = false;
      }

      const prescribedArticles = await ctx.prisma.prescribedArticle.findMany({
        where,
        include: {
          article: true,
          prescriber: {
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
        orderBy: { assignedAt: 'desc' },
      });

      return prescribedArticles;
    }),

  // Get wellness tips relevant to patient's care
  getWellnessTips: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        category: z.string().optional(),
        limit: z.number().min(1).max(20).default(5),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, category, limit } = input;

      // Verify patient belongs to organization
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          painDiaryEntries: {
            orderBy: { entryDate: 'desc' },
            take: 10,
          },
          exercisePrescriptions: {
            where: { status: 'ACTIVE' },
            include: {
              exercise: {
                select: { conditions: true },
              },
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

      // Build relevant keywords from patient's conditions and pain locations
      const keywords: string[] = [];

      // Add keywords from pain diary
      const bodyLocations = [...new Set(patient.painDiaryEntries.map(e => e.bodyLocation.toLowerCase()))];
      keywords.push(...bodyLocations);

      // Add keywords from exercise conditions
      patient.exercisePrescriptions.forEach(p => {
        keywords.push(...(p.exercise.conditions || []));
      });

      // Find relevant articles
      const where: Record<string, unknown> = {
        isPublished: true,
        OR: [
          { category: 'Self Care' },
          { category: 'Prevention' },
          { category: 'Lifestyle Modifications' },
          ...(keywords.length > 0 ? [{ keywords: { hasSome: keywords } }] : []),
        ],
      };

      if (category) {
        where.category = category;
      }

      const articles = await ctx.prisma.educationArticle.findMany({
        where,
        orderBy: { viewCount: 'desc' },
        take: limit,
      });

      return articles;
    }),

  // Mark education article as read
  markArticleRead: protectedProcedure
    .input(z.object({ prescribedArticleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { prescribedArticleId } = input;

      const prescribedArticle = await ctx.prisma.prescribedArticle.findFirst({
        where: {
          id: prescribedArticleId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!prescribedArticle) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Prescribed article not found',
        });
      }

      const updated = await ctx.prisma.prescribedArticle.update({
        where: { id: prescribedArticleId },
        data: {
          isRead: true,
          readAt: new Date(),
        },
        include: {
          article: true,
        },
      });

      return updated;
    }),

  // ========================================
  // Reference Data Methods
  // ========================================

  // Get reference data for forms
  getReferenceData: protectedProcedure.query(async () => {
    return {
      bodyLocations: Object.entries(BODY_LOCATION_LABELS).map(([value, label]) => ({
        value,
        label,
      })),
      painQualities: Object.entries(PAIN_QUALITY_LABELS).map(([value, label]) => ({
        value,
        label,
      })),
      commonTriggers: COMMON_TRIGGERS,
      commonRelievingFactors: COMMON_RELIEVING_FACTORS,
      goalTypes: [
        { value: 'PAIN_REDUCTION', label: 'Pain Reduction' },
        { value: 'MOBILITY', label: 'Mobility/Flexibility' },
        { value: 'EXERCISE', label: 'Exercise Compliance' },
        { value: 'ACTIVITY', label: 'Activity Level' },
        { value: 'WELLNESS', label: 'General Wellness' },
        { value: 'CUSTOM', label: 'Custom Goal' },
      ],
      photoTypes: [
        { value: 'POSTURE_FRONT', label: 'Posture (Front)' },
        { value: 'POSTURE_SIDE', label: 'Posture (Side)' },
        { value: 'POSTURE_BACK', label: 'Posture (Back)' },
        { value: 'RANGE_OF_MOTION', label: 'Range of Motion' },
        { value: 'INJURY_DOCUMENTATION', label: 'Injury Documentation' },
        { value: 'PROGRESS_COMPARISON', label: 'Progress Comparison' },
        { value: 'OTHER', label: 'Other' },
      ],
    };
  }),

  // ========================================
  // Dashboard/Summary Methods
  // ========================================

  // Get health dashboard summary for patient
  getHealthDashboard: protectedProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { patientId } = input;

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

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Get recent pain entries
      const recentPainEntries = await ctx.prisma.painDiaryEntry.findMany({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
          entryDate: { gte: weekAgo },
        },
        orderBy: { entryDate: 'desc' },
        take: 7,
      });

      // Get active goals
      const activeGoals = await ctx.prisma.patientGoal.findMany({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
          status: 'ACTIVE',
        },
      });

      // Get unread education articles
      const unreadArticles = await ctx.prisma.prescribedArticle.count({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
          isRead: false,
        },
      });

      // Get active exercise prescriptions
      const activeExercises = await ctx.prisma.exercisePrescription.count({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
          status: 'ACTIVE',
        },
      });

      // Calculate average pain this week
      const avgPainThisWeek = recentPainEntries.length > 0
        ? Math.round((recentPainEntries.reduce((sum, e) => sum + e.painLevel, 0) / recentPainEntries.length) * 10) / 10
        : null;

      // Get latest pain entry
      const latestPainEntry = recentPainEntries[0] || null;

      return {
        patient: {
          id: patient.id,
          firstName: patient.demographics?.firstName ?? 'Patient',
          lastName: patient.demographics?.lastName ?? '',
        },
        painSummary: {
          averagePainThisWeek: avgPainThisWeek,
          latestPainLevel: latestPainEntry?.painLevel ?? null,
          latestPainLocation: latestPainEntry?.bodyLocation ?? null,
          entriesThisWeek: recentPainEntries.length,
        },
        goals: {
          activeCount: activeGoals.length,
          goals: activeGoals.slice(0, 3), // Top 3 active goals
        },
        education: {
          unreadCount: unreadArticles,
        },
        exercises: {
          activeCount: activeExercises,
        },
      };
    }),
});
