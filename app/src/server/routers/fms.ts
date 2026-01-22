import { z } from 'zod';
import { router, protectedProcedure, providerProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import {
  FMS_DEFINITIONS,
  FMS_EXERCISE_RECOMMENDATIONS,
  getAllTestNames,
  detectAsymmetry,
  getBilateralScore,
  getScoringDescription,
  calculateFMSSummary,
  compareFMSAssessments,
  getExerciseRecommendations,
  interpretTotalScore,
  getTestsByCategory,
  type FMSTestType,
  type FMSScore,
  type FMSResult,
  type MovementCategory,
} from '@/lib/services/fmsAnalysis';

// Valid FMS test types
const fmsTestTypeValues = [
  'deep_squat',
  'hurdle_step',
  'inline_lunge',
  'shoulder_mobility',
  'active_straight_leg_raise',
  'trunk_stability_pushup',
  'rotary_stability',
] as const;

const fmsTestTypeSchema = z.enum(fmsTestTypeValues);
const fmsScoreSchema = z.number().int().min(0).max(3) as z.ZodType<FMSScore>;
const movementCategorySchema = z.enum(['mobility', 'stability', 'movement_pattern']);

export const fmsRouter = router({
  // ============================================
  // CREATE FMS ASSESSMENT
  // ============================================

  /**
   * Record a single FMS test result
   */
  create: providerProcedure
    .input(
      z.object({
        patientId: z.string(),
        encounterId: z.string().optional(),
        testName: fmsTestTypeSchema,
        score: fmsScoreSchema,
        leftScore: fmsScoreSchema.optional().nullable(),
        rightScore: fmsScoreSchema.optional().nullable(),
        painDuringTest: z.boolean().default(false),
        painLocation: z.string().optional().nullable(),
        compensations: z.array(z.string()).default([]),
        limitingFactors: z.array(z.string()).default([]),
        movementQuality: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        assessmentDate: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        patientId,
        encounterId,
        testName,
        score,
        leftScore,
        rightScore,
        painDuringTest,
        painLocation,
        compensations,
        limitingFactors,
        movementQuality,
        notes,
        assessmentDate,
      } = input;

      // Verify patient belongs to org
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

      // Verify encounter if provided
      if (encounterId) {
        const encounter = await ctx.prisma.encounter.findFirst({
          where: {
            id: encounterId,
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

      // Detect asymmetry if bilateral scores provided
      const isAsymmetric = detectAsymmetry(
        leftScore ?? null,
        rightScore ?? null
      );

      // Get exercise recommendations for this test
      const exercises = FMS_EXERCISE_RECOMMENDATIONS[testName];
      const exerciseRecommendations = score <= 2 || isAsymmetric
        ? {
            mobility: exercises.mobilityExercises,
            stability: exercises.stabilityExercises,
            corrective: exercises.correctiveExercises,
          }
        : null;

      return ctx.prisma.functionalMovement.create({
        data: {
          patientId,
          encounterId: encounterId || null,
          organizationId: ctx.user.organizationId,
          testName,
          score,
          leftScore: leftScore ?? null,
          rightScore: rightScore ?? null,
          isAsymmetric,
          painDuringTest,
          painLocation: painLocation || null,
          compensations,
          limitingFactors,
          movementQuality: movementQuality || null,
          notes: notes || null,
          exerciseRecommendations: exerciseRecommendations as object,
          assessmentDate: assessmentDate || new Date(),
        },
      });
    }),

  /**
   * Record a complete FMS assessment (all 7 tests)
   */
  createFullAssessment: providerProcedure
    .input(
      z.object({
        patientId: z.string(),
        encounterId: z.string().optional(),
        tests: z.array(
          z.object({
            testName: fmsTestTypeSchema,
            score: fmsScoreSchema,
            leftScore: fmsScoreSchema.optional().nullable(),
            rightScore: fmsScoreSchema.optional().nullable(),
            painDuringTest: z.boolean().default(false),
            painLocation: z.string().optional().nullable(),
            compensations: z.array(z.string()).default([]),
            limitingFactors: z.array(z.string()).default([]),
            movementQuality: z.string().optional().nullable(),
            notes: z.string().optional().nullable(),
          })
        ),
        assessmentDate: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, encounterId, tests, assessmentDate } = input;

      // Verify patient belongs to org
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

      // Verify encounter if provided
      if (encounterId) {
        const encounter = await ctx.prisma.encounter.findFirst({
          where: {
            id: encounterId,
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

      const date = assessmentDate || new Date();

      // Create all tests in a transaction
      const created = await ctx.prisma.$transaction(
        tests.map((test) => {
          const isAsymmetric = detectAsymmetry(
            test.leftScore ?? null,
            test.rightScore ?? null
          );

          const exercises = FMS_EXERCISE_RECOMMENDATIONS[test.testName];
          const exerciseRecommendations = test.score <= 2 || isAsymmetric
            ? {
                mobility: exercises.mobilityExercises,
                stability: exercises.stabilityExercises,
                corrective: exercises.correctiveExercises,
              }
            : null;

          return ctx.prisma.functionalMovement.create({
            data: {
              patientId,
              encounterId: encounterId || null,
              organizationId: ctx.user.organizationId,
              testName: test.testName,
              score: test.score,
              leftScore: test.leftScore ?? null,
              rightScore: test.rightScore ?? null,
              isAsymmetric,
              painDuringTest: test.painDuringTest,
              painLocation: test.painLocation || null,
              compensations: test.compensations,
              limitingFactors: test.limitingFactors,
              movementQuality: test.movementQuality || null,
              notes: test.notes || null,
              exerciseRecommendations: exerciseRecommendations as object,
              assessmentDate: date,
            },
          });
        })
      );

      // Build FMS results for summary calculation
      const results: FMSResult[] = created.map((c) => ({
        testName: c.testName as FMSTestType,
        score: c.score as FMSScore,
        leftScore: c.leftScore as FMSScore | null,
        rightScore: c.rightScore as FMSScore | null,
        isAsymmetric: c.isAsymmetric,
        painDuringTest: c.painDuringTest,
        painLocation: c.painLocation,
        compensations: c.compensations,
        limitingFactors: c.limitingFactors,
        movementQuality: c.movementQuality || '',
      }));

      const summary = calculateFMSSummary(results);
      const interpretation = interpretTotalScore(summary.totalScore);

      return {
        count: created.length,
        tests: created,
        summary,
        interpretation,
        assessmentDate: date,
      };
    }),

  // ============================================
  // LIST / GET FMS ASSESSMENTS
  // ============================================

  /**
   * List FMS tests for a patient
   */
  list: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        encounterId: z.string().optional(),
        testName: fmsTestTypeSchema.optional(),
        fromDate: z.date().optional(),
        toDate: z.date().optional(),
        asymmetricOnly: z.boolean().default(false),
        painOnly: z.boolean().default(false),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const {
        patientId,
        encounterId,
        testName,
        fromDate,
        toDate,
        asymmetricOnly,
        painOnly,
        limit,
        cursor,
      } = input;

      // Verify patient belongs to org
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

      const where = {
        patientId,
        organizationId: ctx.user.organizationId,
        ...(encounterId && { encounterId }),
        ...(testName && { testName }),
        ...(asymmetricOnly && { isAsymmetric: true }),
        ...(painOnly && { painDuringTest: true }),
        ...(fromDate || toDate
          ? {
              assessmentDate: {
                ...(fromDate && { gte: fromDate }),
                ...(toDate && { lte: toDate }),
              },
            }
          : {}),
      };

      const tests = await ctx.prisma.functionalMovement.findMany({
        where,
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: [{ assessmentDate: 'desc' }, { testName: 'asc' }],
        include: {
          encounter: {
            select: {
              id: true,
              encounterDate: true,
            },
          },
        },
      });

      let nextCursor: string | undefined;
      if (tests.length > limit) {
        const nextItem = tests.pop();
        nextCursor = nextItem?.id;
      }

      // Enhance with definition data
      const enhanced = tests.map((t) => ({
        ...t,
        definition: FMS_DEFINITIONS[t.testName as FMSTestType],
        scoreDescription: getScoringDescription(t.testName as FMSTestType, t.score as FMSScore),
      }));

      return {
        tests: enhanced,
        nextCursor,
      };
    }),

  /**
   * Get FMS assessments grouped by date
   */
  listByDate: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        limit: z.number().min(1).max(20).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, limit } = input;

      // Verify patient
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

      // Get distinct dates
      const dates = await ctx.prisma.functionalMovement.findMany({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
        },
        select: {
          assessmentDate: true,
        },
        distinct: ['assessmentDate'],
        orderBy: {
          assessmentDate: 'desc',
        },
        take: limit,
      });

      // Get tests for each date
      const byDate = await Promise.all(
        dates.map(async (d) => {
          const tests = await ctx.prisma.functionalMovement.findMany({
            where: {
              patientId,
              organizationId: ctx.user.organizationId,
              assessmentDate: d.assessmentDate,
            },
            orderBy: { testName: 'asc' },
          });

          const results: FMSResult[] = tests.map((t) => ({
            testName: t.testName as FMSTestType,
            score: t.score as FMSScore,
            leftScore: t.leftScore as FMSScore | null,
            rightScore: t.rightScore as FMSScore | null,
            isAsymmetric: t.isAsymmetric,
            painDuringTest: t.painDuringTest,
            painLocation: t.painLocation,
            compensations: t.compensations,
            limitingFactors: t.limitingFactors,
            movementQuality: t.movementQuality || '',
          }));

          const summary = calculateFMSSummary(results);
          const interpretation = interpretTotalScore(summary.totalScore);

          return {
            date: d.assessmentDate,
            tests: tests.map((t) => ({
              ...t,
              definition: FMS_DEFINITIONS[t.testName as FMSTestType],
              scoreDescription: getScoringDescription(t.testName as FMSTestType, t.score as FMSScore),
            })),
            summary,
            interpretation,
          };
        })
      );

      return byDate;
    }),

  /**
   * Get a single FMS test by ID
   */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const test = await ctx.prisma.functionalMovement.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
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
          encounter: {
            select: {
              id: true,
              encounterDate: true,
            },
          },
        },
      });

      if (!test) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'FMS test not found',
        });
      }

      const definition = FMS_DEFINITIONS[test.testName as FMSTestType];
      const scoreDescription = getScoringDescription(test.testName as FMSTestType, test.score as FMSScore);

      return {
        ...test,
        definition,
        scoreDescription,
      };
    }),

  // ============================================
  // COMPARE FMS ACROSS VISITS
  // ============================================

  /**
   * Compare FMS assessments between two dates
   */
  compare: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        currentDate: z.date(),
        previousDate: z.date(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, currentDate, previousDate } = input;

      // Verify patient
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

      // Get tests for both dates
      const [currentTests, previousTests] = await Promise.all([
        ctx.prisma.functionalMovement.findMany({
          where: {
            patientId,
            organizationId: ctx.user.organizationId,
            assessmentDate: currentDate,
          },
        }),
        ctx.prisma.functionalMovement.findMany({
          where: {
            patientId,
            organizationId: ctx.user.organizationId,
            assessmentDate: previousDate,
          },
        }),
      ]);

      // Convert to FMSResult format
      const currentResults: FMSResult[] = currentTests.map((t) => ({
        testName: t.testName as FMSTestType,
        score: t.score as FMSScore,
        leftScore: t.leftScore as FMSScore | null,
        rightScore: t.rightScore as FMSScore | null,
        isAsymmetric: t.isAsymmetric,
        painDuringTest: t.painDuringTest,
        painLocation: t.painLocation,
        compensations: t.compensations,
        limitingFactors: t.limitingFactors,
        movementQuality: t.movementQuality || '',
      }));

      const previousResults: FMSResult[] = previousTests.map((t) => ({
        testName: t.testName as FMSTestType,
        score: t.score as FMSScore,
        leftScore: t.leftScore as FMSScore | null,
        rightScore: t.rightScore as FMSScore | null,
        isAsymmetric: t.isAsymmetric,
        painDuringTest: t.painDuringTest,
        painLocation: t.painLocation,
        compensations: t.compensations,
        limitingFactors: t.limitingFactors,
        movementQuality: t.movementQuality || '',
      }));

      const comparisons = compareFMSAssessments(previousResults, currentResults, previousDate, currentDate);

      const currentSummary = calculateFMSSummary(currentResults);
      const previousSummary = calculateFMSSummary(previousResults);

      const totalChange = currentSummary.totalScore - previousSummary.totalScore;
      const improvedTests = comparisons.filter((c) => c.improvement === 'improved').length;
      const declinedTests = comparisons.filter((c) => c.improvement === 'declined').length;
      const asymmetriesResolved = comparisons.filter((c) => c.asymmetryResolved).length;

      return {
        comparisons: comparisons.map((c) => ({
          ...c,
          definition: FMS_DEFINITIONS[c.testName],
        })),
        currentSummary,
        previousSummary,
        summary: {
          totalChange,
          improvedTests,
          declinedTests,
          stableTests: comparisons.length - improvedTests - declinedTests,
          asymmetriesResolved,
          currentInterpretation: interpretTotalScore(currentSummary.totalScore),
          previousInterpretation: interpretTotalScore(previousSummary.totalScore),
        },
        currentDate,
        previousDate,
      };
    }),

  /**
   * Get progress trend for a specific test over time
   */
  getTrend: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        testName: fmsTestTypeSchema,
        limit: z.number().min(2).max(20).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, testName, limit } = input;

      // Verify patient
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

      const tests = await ctx.prisma.functionalMovement.findMany({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
          testName,
        },
        orderBy: { assessmentDate: 'asc' },
        take: limit,
      });

      const definition = FMS_DEFINITIONS[testName];

      // Calculate trend direction
      let trendDirection: 'improving' | 'declining' | 'stable' = 'stable';
      if (tests.length >= 3) {
        const recent = tests.slice(-3);
        const first = recent[0].score;
        const last = recent[recent.length - 1].score;
        const change = last - first;

        if (change > 0) trendDirection = 'improving';
        if (change < 0) trendDirection = 'declining';
      }

      // Track asymmetry resolution
      const asymmetryTrend = tests.map((t) => ({
        date: t.assessmentDate,
        isAsymmetric: t.isAsymmetric,
      }));

      const hadAsymmetry = tests.some((t) => t.isAsymmetric);
      const currentlyAsymmetric = tests.length > 0 ? tests[tests.length - 1].isAsymmetric : false;
      const asymmetryResolved = hadAsymmetry && !currentlyAsymmetric;

      return {
        testName,
        definition,
        tests: tests.map((t) => ({
          id: t.id,
          date: t.assessmentDate,
          score: t.score,
          leftScore: t.leftScore,
          rightScore: t.rightScore,
          isAsymmetric: t.isAsymmetric,
          painDuringTest: t.painDuringTest,
          scoreDescription: getScoringDescription(testName, t.score as FMSScore),
        })),
        trend: {
          direction: trendDirection,
          dataPoints: tests.length,
          firstAssessment: tests[0] || null,
          lastAssessment: tests[tests.length - 1] || null,
          asymmetryResolved,
        },
        asymmetryTrend,
      };
    }),

  // ============================================
  // REFERENCE DATA
  // ============================================

  /**
   * Get all FMS test definitions
   */
  getTestDefinitions: protectedProcedure.query(() => {
    return getAllTestNames().map((testName) => ({
      testName,
      ...FMS_DEFINITIONS[testName],
    }));
  }),

  /**
   * Get a single test definition
   */
  getTestDefinition: protectedProcedure
    .input(z.object({ testName: fmsTestTypeSchema }))
    .query(({ input }) => {
      return {
        testName: input.testName,
        ...FMS_DEFINITIONS[input.testName],
      };
    }),

  /**
   * Get tests by category
   */
  getTestsByCategory: protectedProcedure
    .input(z.object({ category: movementCategorySchema }))
    .query(({ input }) => {
      const tests = getTestsByCategory(input.category);
      return tests.map((testName) => ({
        testName,
        ...FMS_DEFINITIONS[testName],
      }));
    }),

  /**
   * Get exercise recommendations for a test
   */
  getExerciseRecommendations: protectedProcedure
    .input(z.object({ testName: fmsTestTypeSchema }))
    .query(({ input }) => {
      return {
        testName: input.testName,
        testDefinition: FMS_DEFINITIONS[input.testName],
        exercises: FMS_EXERCISE_RECOMMENDATIONS[input.testName],
      };
    }),

  // ============================================
  // SUMMARY / DASHBOARD
  // ============================================

  /**
   * Get patient FMS summary for dashboard
   */
  getPatientSummary: protectedProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { patientId } = input;

      // Verify patient
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

      // Get most recent assessment date
      const latestTest = await ctx.prisma.functionalMovement.findFirst({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
        },
        orderBy: { assessmentDate: 'desc' },
        select: { assessmentDate: true },
      });

      if (!latestTest) {
        return {
          patientId,
          hasAssessments: false,
          latestDate: null,
          summary: null,
          interpretation: null,
          totalAssessments: 0,
          sessionCount: 0,
        };
      }

      // Get all tests from latest assessment
      const latestTests = await ctx.prisma.functionalMovement.findMany({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
          assessmentDate: latestTest.assessmentDate,
        },
      });

      const results: FMSResult[] = latestTests.map((t) => ({
        testName: t.testName as FMSTestType,
        score: t.score as FMSScore,
        leftScore: t.leftScore as FMSScore | null,
        rightScore: t.rightScore as FMSScore | null,
        isAsymmetric: t.isAsymmetric,
        painDuringTest: t.painDuringTest,
        painLocation: t.painLocation,
        compensations: t.compensations,
        limitingFactors: t.limitingFactors,
        movementQuality: t.movementQuality || '',
      }));

      const summary = calculateFMSSummary(results);
      const interpretation = interpretTotalScore(summary.totalScore);

      // Get total count and session count
      const totalAssessments = await ctx.prisma.functionalMovement.count({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      const sessions = await ctx.prisma.functionalMovement.findMany({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
        },
        select: { assessmentDate: true },
        distinct: ['assessmentDate'],
      });

      // Get exercise recommendations for deficits
      const exerciseRecommendations = getExerciseRecommendations(results);

      return {
        patientId,
        hasAssessments: true,
        latestDate: latestTest.assessmentDate,
        summary,
        interpretation,
        totalAssessments,
        sessionCount: sessions.length,
        latestTests: latestTests.map((t) => ({
          id: t.id,
          testName: t.testName,
          score: t.score,
          leftScore: t.leftScore,
          rightScore: t.rightScore,
          isAsymmetric: t.isAsymmetric,
          painDuringTest: t.painDuringTest,
          definition: FMS_DEFINITIONS[t.testName as FMSTestType],
          scoreDescription: getScoringDescription(t.testName as FMSTestType, t.score as FMSScore),
        })),
        exerciseRecommendations,
      };
    }),

  // ============================================
  // UPDATE / DELETE
  // ============================================

  /**
   * Update an FMS test result
   */
  update: providerProcedure
    .input(
      z.object({
        id: z.string(),
        score: fmsScoreSchema.optional(),
        leftScore: fmsScoreSchema.optional().nullable(),
        rightScore: fmsScoreSchema.optional().nullable(),
        painDuringTest: z.boolean().optional(),
        painLocation: z.string().optional().nullable(),
        compensations: z.array(z.string()).optional(),
        limitingFactors: z.array(z.string()).optional(),
        movementQuality: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, leftScore, rightScore, score, ...updateData } = input;

      // Verify access
      const test = await ctx.prisma.functionalMovement.findFirst({
        where: {
          id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!test) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'FMS test not found',
        });
      }

      // Recalculate asymmetry if scores are being updated
      let derivedData: Record<string, unknown> = {};
      const newLeftScore = leftScore !== undefined ? leftScore : test.leftScore;
      const newRightScore = rightScore !== undefined ? rightScore : test.rightScore;
      const newScore = score !== undefined ? score : test.score;

      if (leftScore !== undefined || rightScore !== undefined) {
        derivedData.isAsymmetric = detectAsymmetry(
          newLeftScore as FMSScore | null,
          newRightScore as FMSScore | null
        );
        derivedData.leftScore = newLeftScore;
        derivedData.rightScore = newRightScore;
      }

      if (score !== undefined) {
        derivedData.score = score;
      }

      // Update exercise recommendations if score changed
      if (score !== undefined || leftScore !== undefined || rightScore !== undefined) {
        const isAsymmetric = detectAsymmetry(
          newLeftScore as FMSScore | null,
          newRightScore as FMSScore | null
        );
        const exercises = FMS_EXERCISE_RECOMMENDATIONS[test.testName as FMSTestType];
        derivedData.exerciseRecommendations = newScore <= 2 || isAsymmetric
          ? {
              mobility: exercises.mobilityExercises,
              stability: exercises.stabilityExercises,
              corrective: exercises.correctiveExercises,
            }
          : null;
      }

      return ctx.prisma.functionalMovement.update({
        where: { id },
        data: {
          ...derivedData,
          ...updateData,
        },
      });
    }),

  /**
   * Delete an FMS test result
   */
  delete: providerProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify access
      const test = await ctx.prisma.functionalMovement.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!test) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'FMS test not found',
        });
      }

      await ctx.prisma.functionalMovement.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),

  /**
   * Delete all FMS tests for a specific date
   */
  deleteByDate: providerProcedure
    .input(
      z.object({
        patientId: z.string(),
        date: z.date(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, date } = input;

      // Verify patient
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

      const result = await ctx.prisma.functionalMovement.deleteMany({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
          assessmentDate: date,
        },
      });

      return {
        success: true,
        deletedCount: result.count,
      };
    }),
});
