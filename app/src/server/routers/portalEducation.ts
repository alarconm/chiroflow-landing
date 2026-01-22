/**
 * Epic 23: Patient Education Portal - tRPC Router
 * US-238: Patient-facing interface for education and exercises
 *
 * Features:
 * - My Exercises page in patient portal
 * - Exercise video player with instructions
 * - Daily exercise checklist
 * - Progress history and charts
 * - Home care instructions view
 * - Educational articles library
 * - Ask provider question feature
 */

import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { prisma } from '@/lib/prisma';
import { validateSession } from '@/lib/portal';

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

export const portalEducationRouter = router({
  // Get active exercise prescriptions for patient
  getMyExercises: publicProcedure
    .input(
      z.object({
        sessionToken: z.string(),
        includeCompleted: z.boolean().default(false),
      })
    )
    .query(async ({ input }) => {
      const user = await getPortalUserFromToken(input.sessionToken);
      const patientId = user.patient.id;
      const organizationId = user.organizationId;

      const where: Record<string, unknown> = {
        patientId,
        organizationId,
      };

      if (!input.includeCompleted) {
        where.status = 'ACTIVE';
      }

      const prescriptions = await prisma.exercisePrescription.findMany({
        where,
        include: {
          exercise: {
            include: {
              category: true,
            },
          },
          prescriber: {
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
          _count: {
            select: {
              progressLogs: true,
            },
          },
        },
        orderBy: [{ status: 'asc' }, { prescribedAt: 'desc' }],
      });

      // Get today's progress logs
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todaysLogs = await prisma.patientExerciseProgress.findMany({
        where: {
          patientId,
          organizationId,
          completedAt: {
            gte: today,
            lt: tomorrow,
          },
        },
        select: {
          prescriptionId: true,
          skipped: true,
        },
      });

      const completedToday = new Set(
        todaysLogs.filter((l) => !l.skipped).map((l) => l.prescriptionId)
      );
      const skippedToday = new Set(
        todaysLogs.filter((l) => l.skipped).map((l) => l.prescriptionId)
      );

      return {
        prescriptions: prescriptions.map((p) => ({
          id: p.id,
          status: p.status,
          prescribedAt: p.prescribedAt,
          startDate: p.startDate,
          endDate: p.endDate,
          sets: p.sets,
          reps: p.reps,
          holdTime: p.holdTime,
          frequency: p.frequency,
          specialInstructions: p.specialInstructions,
          precautions: p.precautions,
          progressionSchedule: p.progressionSchedule,
          currentProgressionWeek: p.currentWeek,
          exercise: {
            id: p.exercise.id,
            name: p.exercise.name,
            description: p.exercise.description,
            instructions: p.exercise.instructions,
            videoUrl: p.exercise.videoUrl,
            imageUrl: p.exercise.imageUrl,
            difficulty: p.exercise.difficulty,
            bodyRegion: p.exercise.bodyRegion,
            targetMuscles: p.exercise.targetMuscles,
            equipmentRequired: p.exercise.equipmentRequired,
            contraindications: p.exercise.contraindications,
            modifications: p.exercise.modifications,
            category: p.exercise.category
              ? {
                  id: p.exercise.category.id,
                  name: p.exercise.category.name,
                  type: p.exercise.category.type,
                }
              : null,
          },
          prescriber: p.prescriber
            ? {
                name: `${p.prescriber.user.firstName} ${p.prescriber.user.lastName}`,
                title: p.prescriber.title,
              }
            : null,
          totalLogs: p._count.progressLogs,
          completedToday: completedToday.has(p.id),
          skippedToday: skippedToday.has(p.id),
        })),
        summary: {
          total: prescriptions.length,
          active: prescriptions.filter((p) => p.status === 'ACTIVE').length,
          completedToday: completedToday.size,
          skippedToday: skippedToday.size,
          remainingToday:
            prescriptions.filter((p) => p.status === 'ACTIVE').length -
            completedToday.size -
            skippedToday.size,
        },
      };
    }),

  // Get single exercise details
  getExerciseDetails: publicProcedure
    .input(
      z.object({
        sessionToken: z.string(),
        prescriptionId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const user = await getPortalUserFromToken(input.sessionToken);

      const prescription = await prisma.exercisePrescription.findFirst({
        where: {
          id: input.prescriptionId,
          patientId: user.patient.id,
          organizationId: user.organizationId,
        },
        include: {
          exercise: {
            include: {
              category: true,
            },
          },
          prescriber: {
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
          progressLogs: {
            orderBy: { completedAt: 'desc' },
            take: 10,
          },
        },
      });

      if (!prescription) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Exercise prescription not found',
        });
      }

      return {
        prescription: {
          ...prescription,
          prescriber: prescription.prescriber
            ? {
                name: `${prescription.prescriber.user.firstName} ${prescription.prescriber.user.lastName}`,
                title: prescription.prescriber.title,
              }
            : null,
        },
      };
    }),

  // Log exercise completion (patient action)
  logExerciseCompletion: publicProcedure
    .input(
      z.object({
        sessionToken: z.string(),
        prescriptionId: z.string(),
        setsCompleted: z.number().int().positive().optional().nullable(),
        repsCompleted: z.number().int().positive().optional().nullable(),
        holdTime: z.number().int().positive().optional().nullable(),
        duration: z.number().int().positive().optional().nullable(),
        painBefore: z.number().int().min(0).max(10).optional().nullable(),
        painAfter: z.number().int().min(0).max(10).optional().nullable(),
        difficulty: z.number().int().min(1).max(5).optional().nullable(),
        notes: z.string().optional().nullable(),
        skipped: z.boolean().default(false),
        skipReason: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const user = await getPortalUserFromToken(input.sessionToken);
      const patientId = user.patient.id;
      const organizationId = user.organizationId;

      // Verify prescription belongs to patient
      const prescription = await prisma.exercisePrescription.findFirst({
        where: {
          id: input.prescriptionId,
          patientId,
          organizationId,
          status: 'ACTIVE',
        },
        include: {
          exercise: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!prescription) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Exercise prescription not found or not active',
        });
      }

      // Create progress log
      const progressLog = await prisma.patientExerciseProgress.create({
        data: {
          prescriptionId: input.prescriptionId,
          exerciseId: prescription.exerciseId,
          patientId,
          organizationId,
          setsCompleted: input.setsCompleted,
          repsCompleted: input.repsCompleted,
          holdTime: input.holdTime,
          duration: input.duration,
          painBefore: input.painBefore,
          painAfter: input.painAfter,
          difficulty: input.difficulty,
          notes: input.notes,
          skipped: input.skipped,
          skipReason: input.skipped ? input.skipReason : null,
          completedAt: new Date(),
        },
      });

      // Check for achievements (simplified for patient portal)
      const totalLogs = await prisma.patientExerciseProgress.count({
        where: {
          patientId,
          organizationId,
          skipped: false,
        },
      });

      const newBadges: string[] = [];
      if (totalLogs === 1) {
        newBadges.push('First Steps - Completed your first exercise!');
      } else if (totalLogs === 10) {
        newBadges.push('Getting Started - Logged 10 exercise sessions!');
      } else if (totalLogs === 50) {
        newBadges.push('Dedicated - Logged 50 exercise sessions!');
      } else if (totalLogs === 100) {
        newBadges.push('Century Club - Logged 100 exercise sessions!');
      }

      return {
        success: true,
        progressLog,
        exerciseName: prescription.exercise.name,
        newBadges,
        totalCompleted: totalLogs,
      };
    }),

  // Get exercise progress history
  getProgressHistory: publicProcedure
    .input(
      z.object({
        sessionToken: z.string(),
        prescriptionId: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        limit: z.number().min(1).max(100).default(30),
      })
    )
    .query(async ({ input }) => {
      const user = await getPortalUserFromToken(input.sessionToken);
      const patientId = user.patient.id;
      const organizationId = user.organizationId;

      const where: Record<string, unknown> = {
        patientId,
        organizationId,
      };

      if (input.prescriptionId) {
        where.prescriptionId = input.prescriptionId;
      }

      if (input.startDate || input.endDate) {
        where.completedAt = {};
        if (input.startDate) {
          (where.completedAt as Record<string, unknown>).gte = input.startDate;
        }
        if (input.endDate) {
          (where.completedAt as Record<string, unknown>).lte = input.endDate;
        }
      }

      const logs = await prisma.patientExerciseProgress.findMany({
        where,
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
        take: input.limit,
      });

      // Calculate weekly compliance for chart
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentLogs = await prisma.patientExerciseProgress.findMany({
        where: {
          patientId,
          organizationId,
          completedAt: {
            gte: thirtyDaysAgo,
          },
        },
        select: {
          completedAt: true,
          skipped: true,
        },
      });

      // Group by day for chart
      const dailyStats: Record<string, { completed: number; skipped: number }> = {};
      recentLogs.forEach((log) => {
        const dateKey = log.completedAt.toISOString().split('T')[0];
        if (!dailyStats[dateKey]) {
          dailyStats[dateKey] = { completed: 0, skipped: 0 };
        }
        if (log.skipped) {
          dailyStats[dateKey].skipped++;
        } else {
          dailyStats[dateKey].completed++;
        }
      });

      const chartData = Object.entries(dailyStats)
        .map(([date, stats]) => ({
          date,
          completed: stats.completed,
          skipped: stats.skipped,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return {
        logs: logs.map((log) => ({
          id: log.id,
          completedAt: log.completedAt,
          exerciseName: log.prescription.exercise.name,
          bodyRegion: log.prescription.exercise.bodyRegion,
          setsCompleted: log.setsCompleted,
          repsCompleted: log.repsCompleted,
          holdTime: log.holdTime,
          painBefore: log.painBefore,
          painAfter: log.painAfter,
          difficulty: log.difficulty,
          skipped: log.skipped,
          skipReason: log.skipReason,
          notes: log.notes,
        })),
        chartData,
        summary: {
          totalLogs: recentLogs.length,
          completed: recentLogs.filter((l) => !l.skipped).length,
          skipped: recentLogs.filter((l) => l.skipped).length,
        },
      };
    }),

  // Get achievements/badges
  getAchievements: publicProcedure
    .input(z.object({ sessionToken: z.string() }))
    .query(async ({ input }) => {
      const user = await getPortalUserFromToken(input.sessionToken);
      const patientId = user.patient.id;
      const organizationId = user.organizationId;

      // Get all progress logs
      const logs = await prisma.patientExerciseProgress.findMany({
        where: {
          patientId,
          organizationId,
          skipped: false,
        },
        orderBy: { completedAt: 'asc' },
        select: {
          completedAt: true,
          painBefore: true,
          painAfter: true,
        },
      });

      const totalCompleted = logs.length;

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

      // Pain improvement count
      const painImprovementCount = logs.filter(
        (log) =>
          log.painBefore !== null &&
          log.painAfter !== null &&
          log.painAfter < log.painBefore
      ).length;

      const achievements = [
        {
          id: 'first_exercise',
          name: 'First Steps',
          description: 'Completed your first exercise',
          icon: '🎯',
          earned: totalCompleted >= 1,
          progress: Math.min(totalCompleted, 1),
          threshold: 1,
        },
        {
          id: 'week_streak',
          name: 'Week Warrior',
          description: 'Completed exercises for 7 days in a row',
          icon: '🔥',
          earned: maxStreak >= 7,
          progress: Math.min(maxStreak, 7),
          threshold: 7,
        },
        {
          id: 'two_week_streak',
          name: 'Fortnight Fighter',
          description: 'Completed exercises for 14 days in a row',
          icon: '💪',
          earned: maxStreak >= 14,
          progress: Math.min(maxStreak, 14),
          threshold: 14,
        },
        {
          id: 'month_streak',
          name: 'Monthly Master',
          description: 'Completed exercises for 30 days in a row',
          icon: '🏆',
          earned: maxStreak >= 30,
          progress: Math.min(maxStreak, 30),
          threshold: 30,
        },
        {
          id: 'ten_exercises',
          name: 'Getting Started',
          description: 'Logged 10 exercise sessions',
          icon: '✅',
          earned: totalCompleted >= 10,
          progress: Math.min(totalCompleted, 10),
          threshold: 10,
        },
        {
          id: 'fifty_exercises',
          name: 'Dedicated',
          description: 'Logged 50 exercise sessions',
          icon: '🌟',
          earned: totalCompleted >= 50,
          progress: Math.min(totalCompleted, 50),
          threshold: 50,
        },
        {
          id: 'hundred_exercises',
          name: 'Century Club',
          description: 'Logged 100 exercise sessions',
          icon: '💯',
          earned: totalCompleted >= 100,
          progress: Math.min(totalCompleted, 100),
          threshold: 100,
        },
        {
          id: 'pain_improvement',
          name: 'Pain Fighter',
          description: 'Showed pain reduction in 5+ sessions',
          icon: '🩹',
          earned: painImprovementCount >= 5,
          progress: Math.min(painImprovementCount, 5),
          threshold: 5,
        },
      ];

      return {
        achievements,
        stats: {
          totalCompleted,
          currentStreak,
          maxStreak,
          painImprovementCount,
          earnedCount: achievements.filter((a) => a.earned).length,
        },
      };
    }),

  // Get active home care instructions
  getHomeCareInstructions: publicProcedure
    .input(
      z.object({
        sessionToken: z.string(),
        status: z.enum(['ACTIVE', 'COMPLETED', 'EXPIRED']).optional(),
      })
    )
    .query(async ({ input }) => {
      const user = await getPortalUserFromToken(input.sessionToken);
      const patientId = user.patient.id;
      const organizationId = user.organizationId;

      const where: Record<string, unknown> = {
        patientId,
        organizationId,
      };

      if (input.status) {
        where.status = input.status;
      } else {
        where.status = 'ACTIVE';
      }

      const instructions = await prisma.homeCareInstruction.findMany({
        where,
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
          encounter: {
            select: {
              encounterDate: true,
              encounterType: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return {
        instructions: instructions.map((i) => ({
          id: i.id,
          instructions: i.instructions,
          iceProtocol: i.iceProtocol,
          heatProtocol: i.heatProtocol,
          activityMods: i.activityMods,
          ergonomicRecs: i.ergonomicRecs,
          warningSigns: i.warningSigns,
          followUpInstr: i.followUpInstr,
          durationDays: i.durationDays,
          startDate: i.startDate,
          endDate: i.endDate,
          status: i.status,
          createdAt: i.createdAt,
          provider: i.provider
            ? {
                name: `${i.provider.user.firstName} ${i.provider.user.lastName}`,
                title: i.provider.title,
              }
            : null,
          encounterDate: i.encounter?.encounterDate,
        })),
      };
    }),

  // Get education articles for patient
  getEducationArticles: publicProcedure
    .input(
      z.object({
        sessionToken: z.string(),
        category: z.string().optional(),
        language: z.string().default('en'),
        readingLevel: z.enum(['SIMPLE', 'STANDARD', 'DETAILED']).optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const user = await getPortalUserFromToken(input.sessionToken);
      const organizationId = user.organizationId;

      const where: Record<string, unknown> = {
        isPublished: true,
        language: input.language,
      };

      if (input.category) {
        where.category = input.category;
      }

      if (input.readingLevel) {
        where.readingLevel = input.readingLevel;
      }

      if (input.search) {
        where.OR = [
          { title: { contains: input.search, mode: 'insensitive' } },
          { keywords: { has: input.search } },
          { relatedConditions: { has: input.search } },
        ];
      }

      const [articles, total] = await Promise.all([
        prisma.educationArticle.findMany({
          where,
          select: {
            id: true,
            title: true,
            summary: true,
            category: true,
            readingLevel: true,
            keywords: true,
            relatedConditions: true,
            viewCount: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: [{ viewCount: 'desc' }, { createdAt: 'desc' }],
          take: input.limit,
          skip: input.offset,
        }),
        prisma.educationArticle.count({ where }),
      ]);

      // Get categories for filter
      const categories = await prisma.educationArticle.groupBy({
        by: ['category'],
        where: {
          isPublished: true,
          language: input.language,
        },
        _count: { _all: true },
      });

      return {
        articles,
        categories: categories.map((c) => ({
          name: c.category,
          count: c._count._all,
        })),
        total,
        hasMore: input.offset + articles.length < total,
      };
    }),

  // Get single education article
  getArticle: publicProcedure
    .input(
      z.object({
        sessionToken: z.string(),
        articleId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const user = await getPortalUserFromToken(input.sessionToken);
      const organizationId = user.organizationId;

      const article = await prisma.educationArticle.findFirst({
        where: {
          id: input.articleId,
          isPublished: true,
        },
      });

      if (!article) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Article not found',
        });
      }

      // Increment view count
      await prisma.educationArticle.update({
        where: { id: article.id },
        data: { viewCount: { increment: 1 } },
      });

      return { article };
    }),

  // Get prescribed articles for patient
  getPrescribedArticles: publicProcedure
    .input(z.object({ sessionToken: z.string() }))
    .query(async ({ input }) => {
      const user = await getPortalUserFromToken(input.sessionToken);
      const patientId = user.patient.id;
      const organizationId = user.organizationId;

      const prescribed = await prisma.prescribedArticle.findMany({
        where: {
          patientId,
          organizationId,
        },
        include: {
          article: {
            select: {
              id: true,
              title: true,
              summary: true,
              category: true,
              readingLevel: true,
            },
          },
          prescriber: {
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
        },
        orderBy: { assignedAt: 'desc' },
      });

      return {
        articles: prescribed.map((p) => ({
          id: p.id,
          articleId: p.articleId,
          article: p.article,
          readAt: p.readAt,
          prescribedAt: p.assignedAt,
          prescriber: p.prescriber
            ? {
                name: `${p.prescriber.user.firstName} ${p.prescriber.user.lastName}`,
                title: p.prescriber.title,
              }
            : null,
        })),
        unreadCount: prescribed.filter((p) => !p.readAt).length,
      };
    }),

  // Mark prescribed article as read
  markArticleRead: publicProcedure
    .input(
      z.object({
        sessionToken: z.string(),
        prescribedArticleId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const user = await getPortalUserFromToken(input.sessionToken);

      const prescribed = await prisma.prescribedArticle.findFirst({
        where: {
          id: input.prescribedArticleId,
          patientId: user.patient.id,
          organizationId: user.organizationId,
        },
      });

      if (!prescribed) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Prescribed article not found',
        });
      }

      if (!prescribed.readAt) {
        await prisma.prescribedArticle.update({
          where: { id: input.prescribedArticleId },
          data: { readAt: new Date() },
        });
      }

      return { success: true };
    }),

  // Ask provider a question (creates a message)
  askProviderQuestion: publicProcedure
    .input(
      z.object({
        sessionToken: z.string(),
        subject: z.string().min(1, 'Subject is required'),
        message: z.string().min(1, 'Message is required'),
        relatedTo: z
          .object({
            type: z.enum(['exercise', 'instruction', 'article']),
            id: z.string(),
            name: z.string(),
          })
          .optional(),
      })
    )
    .mutation(async ({ input }) => {
      const user = await getPortalUserFromToken(input.sessionToken);
      const patientId = user.patient.id;
      const organizationId = user.organizationId;

      // Get patient's primary provider
      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
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

      // Build message content
      let messageContent = input.message;
      if (input.relatedTo) {
        messageContent = `[Question about ${input.relatedTo.type}: ${input.relatedTo.name}]\n\n${input.message}`;
      }

      // Create the message using the secure message system
      // Note: This creates a portal message that providers can respond to
      const message = await prisma.secureMessage.create({
        data: {
          patientId,
          organizationId,
          subject: input.subject,
          body: messageContent,
          isFromPatient: true,
          senderName: patient.demographics
            ? `${patient.demographics.firstName} ${patient.demographics.lastName}`
            : 'Patient',
          status: 'UNREAD',
          priority: 'NORMAL',
        },
      });

      return {
        success: true,
        messageId: message.id,
        message: 'Your question has been sent to your care team. They will respond within 1-2 business days.',
      };
    }),

  // Get daily exercise checklist
  getDailyChecklist: publicProcedure
    .input(
      z.object({
        sessionToken: z.string(),
        date: z.date().optional(),
      })
    )
    .query(async ({ input }) => {
      const user = await getPortalUserFromToken(input.sessionToken);
      const patientId = user.patient.id;
      const organizationId = user.organizationId;

      const targetDate = input.date || new Date();
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);

      // Get active prescriptions
      const prescriptions = await prisma.exercisePrescription.findMany({
        where: {
          patientId,
          organizationId,
          status: 'ACTIVE',
        },
        include: {
          exercise: {
            select: {
              id: true,
              name: true,
              bodyRegion: true,
              difficulty: true,
            },
          },
        },
      });

      // Get today's logs
      const logs = await prisma.patientExerciseProgress.findMany({
        where: {
          patientId,
          organizationId,
          completedAt: {
            gte: startOfDay,
            lt: endOfDay,
          },
        },
        select: {
          prescriptionId: true,
          skipped: true,
          completedAt: true,
          painBefore: true,
          painAfter: true,
        },
      });

      const logsByPrescription = new Map(
        logs.map((l) => [l.prescriptionId, l])
      );

      const checklist = prescriptions.map((p) => {
        const log = logsByPrescription.get(p.id);
        return {
          prescriptionId: p.id,
          exerciseName: p.exercise.name,
          bodyRegion: p.exercise.bodyRegion,
          difficulty: p.exercise.difficulty,
          sets: p.sets,
          reps: p.reps,
          holdTime: p.holdTime,
          frequency: p.frequency,
          status: log
            ? log.skipped
              ? 'skipped'
              : 'completed'
            : 'pending',
          completedAt: log?.completedAt,
          painBefore: log?.painBefore,
          painAfter: log?.painAfter,
        };
      });

      return {
        date: startOfDay,
        checklist,
        summary: {
          total: checklist.length,
          completed: checklist.filter((c) => c.status === 'completed').length,
          skipped: checklist.filter((c) => c.status === 'skipped').length,
          pending: checklist.filter((c) => c.status === 'pending').length,
        },
      };
    }),
});
