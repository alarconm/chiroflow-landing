import { z } from 'zod';
import { router, protectedProcedure, providerProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import { notificationService } from '@/lib/notification-service';
import type { PrismaClient } from '@prisma/client';

// Validation schemas
const painLevelSchema = z.number().int().min(0).max(10);
const difficultySchema = z.number().int().min(1).max(5);

// Achievement badge types
const ACHIEVEMENT_BADGES = {
  FIRST_EXERCISE: {
    id: 'first_exercise',
    name: 'First Steps',
    description: 'Completed your first exercise',
    icon: '🎯',
    threshold: 1,
  },
  WEEK_STREAK: {
    id: 'week_streak',
    name: 'Week Warrior',
    description: 'Completed exercises for 7 days in a row',
    icon: '🔥',
    threshold: 7,
  },
  TWO_WEEK_STREAK: {
    id: 'two_week_streak',
    name: 'Fortnight Fighter',
    description: 'Completed exercises for 14 days in a row',
    icon: '💪',
    threshold: 14,
  },
  MONTH_STREAK: {
    id: 'month_streak',
    name: 'Monthly Master',
    description: 'Completed exercises for 30 days in a row',
    icon: '🏆',
    threshold: 30,
  },
  PERFECT_WEEK: {
    id: 'perfect_week',
    name: 'Perfect Week',
    description: '100% compliance for a full week',
    icon: '⭐',
    threshold: 100,
  },
  TEN_EXERCISES: {
    id: 'ten_exercises',
    name: 'Getting Started',
    description: 'Logged 10 exercise sessions',
    icon: '✅',
    threshold: 10,
  },
  FIFTY_EXERCISES: {
    id: 'fifty_exercises',
    name: 'Dedicated',
    description: 'Logged 50 exercise sessions',
    icon: '🌟',
    threshold: 50,
  },
  HUNDRED_EXERCISES: {
    id: 'hundred_exercises',
    name: 'Century Club',
    description: 'Logged 100 exercise sessions',
    icon: '💯',
    threshold: 100,
  },
  PAIN_IMPROVEMENT: {
    id: 'pain_improvement',
    name: 'Pain Fighter',
    description: 'Showed consistent pain reduction after exercises',
    icon: '🩹',
    threshold: 5,
  },
} as const;

// Helper function to calculate achievements
async function calculateAchievements(
  prisma: PrismaClient,
  patientId: string,
  organizationId: string
) {
  const achievements: Array<{
    id: string;
    name: string;
    description: string;
    icon: string;
    earned: boolean;
    earnedAt?: Date | null;
    progress?: number;
    threshold: number;
  }> = [];

  // Get all progress logs
  const logs = await prisma.patientExerciseProgress.findMany({
    where: {
      patientId,
      organizationId,
      skipped: false,
    },
    orderBy: { completedAt: 'asc' },
  });

  const totalCompleted = logs.length;

  // First Exercise badge
  achievements.push({
    ...ACHIEVEMENT_BADGES.FIRST_EXERCISE,
    earned: totalCompleted >= 1,
    earnedAt: totalCompleted >= 1 ? logs[0]?.completedAt : null,
    progress: Math.min(totalCompleted, 1),
  });

  // Ten Exercises badge
  achievements.push({
    ...ACHIEVEMENT_BADGES.TEN_EXERCISES,
    earned: totalCompleted >= 10,
    earnedAt: totalCompleted >= 10 ? logs[9]?.completedAt : null,
    progress: Math.min(totalCompleted, 10),
  });

  // Fifty Exercises badge
  achievements.push({
    ...ACHIEVEMENT_BADGES.FIFTY_EXERCISES,
    earned: totalCompleted >= 50,
    earnedAt: totalCompleted >= 50 ? logs[49]?.completedAt : null,
    progress: Math.min(totalCompleted, 50),
  });

  // Hundred Exercises badge
  achievements.push({
    ...ACHIEVEMENT_BADGES.HUNDRED_EXERCISES,
    earned: totalCompleted >= 100,
    earnedAt: totalCompleted >= 100 ? logs[99]?.completedAt : null,
    progress: Math.min(totalCompleted, 100),
  });

  // Calculate streaks
  let currentStreak = 0;
  let maxStreak = 0;
  let lastDate: Date | null = null;

  for (const log of logs) {
    const logDate = new Date(log.completedAt);
    logDate.setHours(0, 0, 0, 0);

    if (lastDate === null) {
      currentStreak = 1;
    } else {
      const dayDiff = Math.floor(
        (logDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (dayDiff === 1) {
        currentStreak++;
      } else if (dayDiff > 1) {
        currentStreak = 1;
      }
    }

    maxStreak = Math.max(maxStreak, currentStreak);
    lastDate = logDate;
  }

  // Week Streak badge
  achievements.push({
    ...ACHIEVEMENT_BADGES.WEEK_STREAK,
    earned: maxStreak >= 7,
    earnedAt: null,
    progress: Math.min(maxStreak, 7),
  });

  // Two Week Streak badge
  achievements.push({
    ...ACHIEVEMENT_BADGES.TWO_WEEK_STREAK,
    earned: maxStreak >= 14,
    earnedAt: null,
    progress: Math.min(maxStreak, 14),
  });

  // Month Streak badge
  achievements.push({
    ...ACHIEVEMENT_BADGES.MONTH_STREAK,
    earned: maxStreak >= 30,
    earnedAt: null,
    progress: Math.min(maxStreak, 30),
  });

  // Pain Improvement badge (5+ sessions with pain reduction)
  const painImprovementCount = logs.filter(
    (log) =>
      log.painBefore !== null &&
      log.painAfter !== null &&
      log.painAfter < log.painBefore
  ).length;

  achievements.push({
    ...ACHIEVEMENT_BADGES.PAIN_IMPROVEMENT,
    earned: painImprovementCount >= 5,
    earnedAt: null,
    progress: Math.min(painImprovementCount, 5),
  });

  return achievements;
}

export const progressRouter = router({
  // Log completed exercise (patient or provider can log)
  logExercise: protectedProcedure
    .input(
      z.object({
        prescriptionId: z.string(),
        setsCompleted: z.number().int().positive().optional().nullable(),
        repsCompleted: z.number().int().positive().optional().nullable(),
        holdTime: z.number().int().positive().optional().nullable(),
        duration: z.number().int().positive().optional().nullable(),
        painBefore: painLevelSchema.optional().nullable(),
        painAfter: painLevelSchema.optional().nullable(),
        difficulty: difficultySchema.optional().nullable(),
        notes: z.string().optional().nullable(),
        skipped: z.boolean().default(false),
        skipReason: z.string().optional().nullable(),
        completedAt: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        prescriptionId,
        setsCompleted,
        repsCompleted,
        holdTime,
        duration,
        painBefore,
        painAfter,
        difficulty,
        notes,
        skipped,
        skipReason,
        completedAt,
      } = input;

      // Verify prescription exists and belongs to organization
      const prescription = await ctx.prisma.exercisePrescription.findFirst({
        where: {
          id: prescriptionId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          exercise: {
            select: {
              id: true,
              name: true,
            },
          },
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

      if (!prescription) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Prescription not found',
        });
      }

      // Verify prescription is active
      if (prescription.status !== 'ACTIVE') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Can only log progress for active prescriptions',
        });
      }

      // Create progress log
      const progressLog = await ctx.prisma.patientExerciseProgress.create({
        data: {
          prescriptionId,
          exerciseId: prescription.exerciseId,
          patientId: prescription.patientId,
          organizationId: ctx.user.organizationId,
          setsCompleted,
          repsCompleted,
          holdTime,
          duration,
          painBefore,
          painAfter,
          difficulty,
          notes,
          skipped,
          skipReason: skipped ? skipReason : null,
          completedAt: completedAt ?? new Date(),
        },
        include: {
          prescription: {
            include: {
              exercise: true,
            },
          },
        },
      });

      // Check for new achievements
      const achievements = await calculateAchievements(
        ctx.prisma,
        prescription.patientId,
        ctx.user.organizationId
      );
      const newAchievements = achievements.filter((a) => a.earned);

      const patientName = prescription.patient.demographics
        ? `${prescription.patient.demographics.firstName} ${prescription.patient.demographics.lastName}`
        : 'Unknown Patient';

      await auditLog('CREATE', 'PatientExerciseProgress', {
        entityId: progressLog.id,
        changes: {
          exerciseName: prescription.exercise.name,
          patientName,
          skipped,
          painBefore,
          painAfter,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        progressLog,
        newAchievements,
      };
    }),

  // Get compliance rate for a patient
  getCompliance: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        prescriptionId: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        period: z.enum(['week', 'month', 'quarter', 'year', 'all']).default('month'),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, prescriptionId, startDate, endDate, period } = input;

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

      // Calculate date range based on period
      let dateFrom: Date;
      const dateTo = endDate ?? new Date();

      if (startDate) {
        dateFrom = startDate;
      } else {
        dateFrom = new Date();
        switch (period) {
          case 'week':
            dateFrom.setDate(dateFrom.getDate() - 7);
            break;
          case 'month':
            dateFrom.setMonth(dateFrom.getMonth() - 1);
            break;
          case 'quarter':
            dateFrom.setMonth(dateFrom.getMonth() - 3);
            break;
          case 'year':
            dateFrom.setFullYear(dateFrom.getFullYear() - 1);
            break;
          case 'all':
            dateFrom = new Date(0);
            break;
        }
      }

      const whereClause: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
        patientId,
        completedAt: {
          gte: dateFrom,
          lte: dateTo,
        },
      };

      if (prescriptionId) {
        whereClause.prescriptionId = prescriptionId;
      }

      // Get total logs and completed logs
      const [totalLogs, completedLogs, skippedLogs] = await Promise.all([
        ctx.prisma.patientExerciseProgress.count({ where: whereClause }),
        ctx.prisma.patientExerciseProgress.count({
          where: { ...whereClause, skipped: false },
        }),
        ctx.prisma.patientExerciseProgress.count({
          where: { ...whereClause, skipped: true },
        }),
      ]);

      // Calculate daily compliance for chart data
      const dailyLogs = await ctx.prisma.patientExerciseProgress.groupBy({
        by: ['completedAt'],
        where: whereClause,
        _count: { id: true },
      });

      // Calculate weekly compliance trend
      const weeklyTrend = [];
      const weekStart = new Date(dateFrom);
      while (weekStart < dateTo) {
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        const weekLogs = await ctx.prisma.patientExerciseProgress.count({
          where: {
            ...whereClause,
            completedAt: {
              gte: weekStart,
              lt: weekEnd,
            },
          },
        });

        const weekCompleted = await ctx.prisma.patientExerciseProgress.count({
          where: {
            ...whereClause,
            skipped: false,
            completedAt: {
              gte: weekStart,
              lt: weekEnd,
            },
          },
        });

        weeklyTrend.push({
          weekStart: new Date(weekStart),
          weekEnd: new Date(weekEnd),
          total: weekLogs,
          completed: weekCompleted,
          rate: weekLogs > 0 ? Math.round((weekCompleted / weekLogs) * 100) : null,
        });

        weekStart.setDate(weekStart.getDate() + 7);
      }

      const overallRate = totalLogs > 0 ? Math.round((completedLogs / totalLogs) * 100) : null;

      return {
        compliance: {
          rate: overallRate,
          totalLogs,
          completedLogs,
          skippedLogs,
          period,
          dateFrom,
          dateTo,
        },
        weeklyTrend,
        dailyLogs: dailyLogs.map((d) => ({
          date: d.completedAt,
          count: d._count.id,
        })),
      };
    }),

  // Get pain tracking data
  getPainHistory: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        prescriptionId: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        limit: z.number().min(1).max(100).default(30),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, prescriptionId, startDate, endDate, limit } = input;

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

      const whereClause: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
        patientId,
        OR: [{ painBefore: { not: null } }, { painAfter: { not: null } }],
      };

      if (prescriptionId) {
        whereClause.prescriptionId = prescriptionId;
      }

      if (startDate || endDate) {
        whereClause.completedAt = {};
        if (startDate) {
          (whereClause.completedAt as Record<string, unknown>).gte = startDate;
        }
        if (endDate) {
          (whereClause.completedAt as Record<string, unknown>).lte = endDate;
        }
      }

      const painLogs = await ctx.prisma.patientExerciseProgress.findMany({
        where: whereClause,
        select: {
          id: true,
          completedAt: true,
          painBefore: true,
          painAfter: true,
          prescription: {
            select: {
              exercise: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: { completedAt: 'desc' },
        take: limit,
      });

      // Calculate average pain reduction
      const logsWithBothPain = painLogs.filter(
        (log) => log.painBefore !== null && log.painAfter !== null
      );

      let averagePainBefore: number | null = null;
      let averagePainAfter: number | null = null;
      let averageReduction: number | null = null;

      if (logsWithBothPain.length > 0) {
        const totalBefore = logsWithBothPain.reduce((sum, log) => sum + (log.painBefore ?? 0), 0);
        const totalAfter = logsWithBothPain.reduce((sum, log) => sum + (log.painAfter ?? 0), 0);

        averagePainBefore = Math.round((totalBefore / logsWithBothPain.length) * 10) / 10;
        averagePainAfter = Math.round((totalAfter / logsWithBothPain.length) * 10) / 10;
        averageReduction = Math.round((averagePainBefore - averagePainAfter) * 10) / 10;
      }

      return {
        painLogs: painLogs.map((log) => ({
          ...log,
          exerciseName: log.prescription.exercise.name,
        })),
        summary: {
          averagePainBefore,
          averagePainAfter,
          averageReduction,
          totalEntries: logsWithBothPain.length,
        },
      };
    }),

  // Get difficulty feedback data
  getDifficultyFeedback: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        prescriptionId: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, prescriptionId, startDate, endDate } = input;

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

      const whereClause: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
        patientId,
        difficulty: { not: null },
      };

      if (prescriptionId) {
        whereClause.prescriptionId = prescriptionId;
      }

      if (startDate || endDate) {
        whereClause.completedAt = {};
        if (startDate) {
          (whereClause.completedAt as Record<string, unknown>).gte = startDate;
        }
        if (endDate) {
          (whereClause.completedAt as Record<string, unknown>).lte = endDate;
        }
      }

      const difficultyLogs = await ctx.prisma.patientExerciseProgress.findMany({
        where: whereClause,
        select: {
          id: true,
          completedAt: true,
          difficulty: true,
          prescription: {
            select: {
              id: true,
              exercise: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: { completedAt: 'desc' },
      });

      // Calculate difficulty distribution
      const difficultyDistribution: Record<number, number> = {
        1: 0, // Very Easy
        2: 0, // Easy
        3: 0, // Moderate
        4: 0, // Difficult
        5: 0, // Very Difficult
      };

      difficultyLogs.forEach((log) => {
        if (log.difficulty !== null && log.difficulty >= 1 && log.difficulty <= 5) {
          difficultyDistribution[log.difficulty]++;
        }
      });

      // Calculate average difficulty
      const totalDifficulty = difficultyLogs.reduce((sum, log) => sum + (log.difficulty ?? 0), 0);
      const averageDifficulty =
        difficultyLogs.length > 0
          ? Math.round((totalDifficulty / difficultyLogs.length) * 10) / 10
          : null;

      // Group by exercise
      const byExercise = difficultyLogs.reduce(
        (acc, log) => {
          const exerciseName = log.prescription.exercise.name;
          if (!acc[exerciseName]) {
            acc[exerciseName] = {
              total: 0,
              sum: 0,
              entries: [] as Array<{ date: Date; difficulty: number | null }>,
            };
          }
          acc[exerciseName].total++;
          acc[exerciseName].sum += log.difficulty ?? 0;
          acc[exerciseName].entries.push({
            date: log.completedAt,
            difficulty: log.difficulty,
          });
          return acc;
        },
        {} as Record<
          string,
          { total: number; sum: number; entries: Array<{ date: Date; difficulty: number | null }> }
        >
      );

      const exerciseDifficulty = Object.entries(byExercise).map(([name, data]) => ({
        exerciseName: name,
        averageDifficulty: Math.round((data.sum / data.total) * 10) / 10,
        entryCount: data.total,
        trend: data.entries.slice(-5).map((e) => e.difficulty), // Last 5 entries
      }));

      return {
        difficultyLogs: difficultyLogs.map((log) => ({
          ...log,
          exerciseName: log.prescription.exercise.name,
        })),
        summary: {
          averageDifficulty,
          distribution: difficultyDistribution,
          totalEntries: difficultyLogs.length,
        },
        byExercise: exerciseDifficulty,
        difficultyLabels: {
          1: 'Very Easy',
          2: 'Easy',
          3: 'Moderate',
          4: 'Difficult',
          5: 'Very Difficult',
        },
      };
    }),

  // Provider view of patient compliance (provider only)
  getProviderComplianceView: providerProcedure
    .input(
      z.object({
        patientId: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        period: z.enum(['week', 'month', 'quarter']).default('month'),
        sortBy: z
          .enum(['compliance', 'lastActivity', 'totalExercises', 'patientName'])
          .default('compliance'),
        sortOrder: z.enum(['asc', 'desc']).default('desc'),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, startDate, endDate, period, sortBy, sortOrder, limit, offset } = input;

      // Calculate date range
      let dateFrom: Date;
      const dateTo = endDate ?? new Date();

      if (startDate) {
        dateFrom = startDate;
      } else {
        dateFrom = new Date();
        switch (period) {
          case 'week':
            dateFrom.setDate(dateFrom.getDate() - 7);
            break;
          case 'month':
            dateFrom.setMonth(dateFrom.getMonth() - 1);
            break;
          case 'quarter':
            dateFrom.setMonth(dateFrom.getMonth() - 3);
            break;
        }
      }

      // If specific patient, return detailed view
      if (patientId) {
        const patient = await ctx.prisma.patient.findFirst({
          where: {
            id: patientId,
            organizationId: ctx.user.organizationId,
          },
          include: {
            demographics: true,
          },
        });

        if (!patient) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Patient not found',
          });
        }

        // Get prescriptions with compliance data
        const prescriptions = await ctx.prisma.exercisePrescription.findMany({
          where: {
            patientId,
            organizationId: ctx.user.organizationId,
            status: 'ACTIVE',
          },
          include: {
            exercise: true,
            progressLogs: {
              where: {
                completedAt: {
                  gte: dateFrom,
                  lte: dateTo,
                },
              },
              orderBy: { completedAt: 'desc' },
            },
          },
        });

        const prescriptionCompliance = prescriptions.map((p) => {
          const total = p.progressLogs.length;
          const completed = p.progressLogs.filter((l) => !l.skipped).length;
          const lastActivity = p.progressLogs[0]?.completedAt ?? null;

          return {
            prescriptionId: p.id,
            exerciseName: p.exercise.name,
            total,
            completed,
            skipped: total - completed,
            complianceRate: total > 0 ? Math.round((completed / total) * 100) : null,
            lastActivity,
            recentLogs: p.progressLogs.slice(0, 5),
          };
        });

        return {
          type: 'single' as const,
          patient: {
            id: patient.id,
            firstName: patient.demographics?.firstName ?? 'Unknown',
            lastName: patient.demographics?.lastName ?? '',
          },
          prescriptionCompliance,
          period,
          dateFrom,
          dateTo,
        };
      }

      // Get all patients with prescriptions
      const patientsWithPrescriptions = await ctx.prisma.patient.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          exercisePrescriptions: {
            some: {
              status: 'ACTIVE',
            },
          },
        },
        include: {
          demographics: true,
          exercisePrescriptions: {
            where: { status: 'ACTIVE' },
            select: { id: true },
          },
          patientExerciseProgress: {
            where: {
              completedAt: {
                gte: dateFrom,
                lte: dateTo,
              },
            },
            orderBy: { completedAt: 'desc' },
            select: {
              id: true,
              completedAt: true,
              skipped: true,
            },
          },
        },
      });

      // Calculate compliance for each patient
      const patientCompliance = patientsWithPrescriptions.map((patient) => {
        const logs = patient.patientExerciseProgress;
        const total = logs.length;
        const completed = logs.filter((l) => !l.skipped).length;
        const lastActivity = logs[0]?.completedAt ?? null;

        return {
          patientId: patient.id,
          firstName: patient.demographics?.firstName ?? 'Unknown',
          lastName: patient.demographics?.lastName ?? '',
          activePrescriptions: patient.exercisePrescriptions.length,
          totalLogs: total,
          completedLogs: completed,
          complianceRate: total > 0 ? Math.round((completed / total) * 100) : null,
          lastActivity,
        };
      });

      // Sort
      const sortedPatients = patientCompliance.sort((a, b) => {
        let comparison = 0;
        switch (sortBy) {
          case 'compliance':
            comparison = (a.complianceRate ?? -1) - (b.complianceRate ?? -1);
            break;
          case 'lastActivity':
            comparison =
              (a.lastActivity?.getTime() ?? 0) - (b.lastActivity?.getTime() ?? 0);
            break;
          case 'totalExercises':
            comparison = a.totalLogs - b.totalLogs;
            break;
          case 'patientName':
            comparison = `${a.lastName}${a.firstName}`.localeCompare(
              `${b.lastName}${b.firstName}`
            );
            break;
        }
        return sortOrder === 'desc' ? -comparison : comparison;
      });

      // Paginate
      const paginatedPatients = sortedPatients.slice(offset, offset + limit);

      // Calculate summary stats
      const totalPatients = patientCompliance.length;
      const compliantPatients = patientCompliance.filter(
        (p) => p.complianceRate !== null && p.complianceRate >= 80
      ).length;
      const atRiskPatients = patientCompliance.filter(
        (p) => p.complianceRate !== null && p.complianceRate < 50
      ).length;

      const averageCompliance =
        patientCompliance.filter((p) => p.complianceRate !== null).length > 0
          ? Math.round(
              patientCompliance
                .filter((p) => p.complianceRate !== null)
                .reduce((sum, p) => sum + (p.complianceRate ?? 0), 0) /
                patientCompliance.filter((p) => p.complianceRate !== null).length
            )
          : null;

      return {
        type: 'overview' as const,
        patients: paginatedPatients,
        summary: {
          totalPatients,
          compliantPatients,
          atRiskPatients,
          averageCompliance,
        },
        period,
        dateFrom,
        dateTo,
        pagination: {
          total: totalPatients,
          limit,
          offset,
          hasMore: offset + limit < totalPatients,
        },
      };
    }),

  // Schedule exercise reminder
  scheduleReminder: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        reminderTime: z.string(), // HH:mm format
        frequency: z.enum(['daily', 'weekdays', 'custom']),
        customDays: z.array(z.number().min(0).max(6)).optional(), // 0 = Sunday
        channel: z.enum(['SMS', 'EMAIL', 'PUSH']).default('EMAIL'),
        enabled: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, reminderTime, frequency, customDays, channel, enabled } = input;

      // Verify patient belongs to organization
      const patient = await ctx.prisma.patient.findFirst({
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
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Store reminder settings (using the audit log and return the configured settings)
      const reminderConfig = {
        patientId,
        reminderTime,
        frequency,
        customDays: frequency === 'custom' ? customDays : null,
        channel,
        enabled,
        organizationId: ctx.user.organizationId,
        configuredAt: new Date(),
        configuredBy: ctx.user.id,
      };

      await auditLog('CREATE', 'ExerciseReminder', {
        changes: reminderConfig,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        config: reminderConfig,
        message: enabled
          ? `Exercise reminders scheduled for ${reminderTime} (${frequency})`
          : 'Exercise reminders disabled',
      };
    }),

  // Send immediate exercise reminder (provider only)
  sendReminder: providerProcedure
    .input(
      z.object({
        patientId: z.string(),
        channel: z.enum(['SMS', 'EMAIL']),
        customMessage: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, channel, customMessage } = input;

      // Get patient with contact info and prescriptions
      const patient = await ctx.prisma.patient.findFirst({
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
          exercisePrescriptions: {
            where: { status: 'ACTIVE' },
            include: {
              exercise: {
                select: {
                  name: true,
                },
              },
            },
            take: 5,
          },
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const firstName = patient.demographics?.firstName ?? 'Patient';
      const exerciseNames = patient.exercisePrescriptions.map((p) => p.exercise.name);
      const primaryContact = patient.contacts[0];

      const defaultMessage = `Hi ${firstName}! Just a friendly reminder to complete your home exercises today. You have ${exerciseNames.length} exercise(s) assigned: ${exerciseNames.slice(0, 3).join(', ')}${exerciseNames.length > 3 ? '...' : ''}. Keep up the great work!`;

      const message = customMessage || defaultMessage;

      let result;
      const phone = primaryContact?.mobilePhone || primaryContact?.homePhone;
      const email = primaryContact?.email;

      if (channel === 'SMS' && phone) {
        result = await notificationService.sendSMS(phone, message);
      } else if (channel === 'EMAIL' && email) {
        result = await notificationService.sendEmail(
          email,
          'Exercise Reminder',
          message,
          {
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #053e67;">Exercise Reminder</h2>
                <p>${message.replace(/\n/g, '<br/>')}</p>
                <p style="margin-top: 20px;">
                  <strong>Your exercises for today:</strong>
                </p>
                <ul>
                  ${exerciseNames.map((name: string) => `<li>${name}</li>`).join('')}
                </ul>
                <p style="color: #666; font-size: 12px; margin-top: 30px;">
                  This is an automated reminder from your healthcare provider.
                </p>
              </div>
            `,
          }
        );
      } else {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `No ${channel === 'SMS' ? 'phone number' : 'email'} on file for this patient`,
        });
      }

      await auditLog('CREATE', 'ExerciseReminderSent', {
        changes: {
          patientId,
          channel,
          success: result.success,
          messageId: result.messageId,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: result.success,
        messageId: result.messageId,
        error: result.error,
      };
    }),

  // Get achievement badges for a patient
  getAchievements: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId } = input;

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

      // Calculate achievements
      const achievements = await calculateAchievements(
        ctx.prisma,
        patientId,
        ctx.user.organizationId
      );

      return {
        achievements,
        allBadges: Object.values(ACHIEVEMENT_BADGES),
      };
    }),

  // Get progress history for a patient
  getHistory: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        prescriptionId: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, prescriptionId, startDate, endDate, limit, offset } = input;

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

      const whereClause: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
        patientId,
      };

      if (prescriptionId) {
        whereClause.prescriptionId = prescriptionId;
      }

      if (startDate || endDate) {
        whereClause.completedAt = {};
        if (startDate) {
          (whereClause.completedAt as Record<string, unknown>).gte = startDate;
        }
        if (endDate) {
          (whereClause.completedAt as Record<string, unknown>).lte = endDate;
        }
      }

      const [logs, total] = await Promise.all([
        ctx.prisma.patientExerciseProgress.findMany({
          where: whereClause,
          include: {
            prescription: {
              include: {
                exercise: {
                  select: {
                    name: true,
                    bodyRegion: true,
                  },
                },
              },
            },
          },
          orderBy: { completedAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        ctx.prisma.patientExerciseProgress.count({ where: whereClause }),
      ]);

      return {
        logs: logs.map((log) => ({
          ...log,
          exerciseName: log.prescription.exercise.name,
          bodyRegion: log.prescription.exercise.bodyRegion,
        })),
        total,
        limit,
        offset,
        hasMore: offset + logs.length < total,
      };
    }),

  // Update a progress log
  updateLog: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        setsCompleted: z.number().int().positive().optional().nullable(),
        repsCompleted: z.number().int().positive().optional().nullable(),
        holdTime: z.number().int().positive().optional().nullable(),
        duration: z.number().int().positive().optional().nullable(),
        painBefore: painLevelSchema.optional().nullable(),
        painAfter: painLevelSchema.optional().nullable(),
        difficulty: difficultySchema.optional().nullable(),
        notes: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      // Verify log exists and belongs to organization
      const existing = await ctx.prisma.patientExerciseProgress.findFirst({
        where: {
          id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Progress log not found',
        });
      }

      const log = await ctx.prisma.patientExerciseProgress.update({
        where: { id },
        data: updateData,
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

      await auditLog('UPDATE', 'PatientExerciseProgress', {
        entityId: id,
        changes: updateData,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return log;
    }),

  // Delete a progress log
  deleteLog: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify log exists and belongs to organization
      const existing = await ctx.prisma.patientExerciseProgress.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Progress log not found',
        });
      }

      await ctx.prisma.patientExerciseProgress.delete({
        where: { id: input.id },
      });

      await auditLog('DELETE', 'PatientExerciseProgress', {
        entityId: input.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),
});
