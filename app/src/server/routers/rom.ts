import { z } from 'zod';
import { router, protectedProcedure, providerProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { ROMJoint } from '@prisma/client';
import {
  ROM_DEFINITIONS,
  ROM_REGIONS,
  calculatePercentOfNormal,
  isRestricted,
  getRestrictionSeverity,
  compareROMReadings,
  calculateROMSummary,
  getJointsForRegion,
  getAllJointsGrouped,
  generateROMDiagramData,
  type ROMJointType,
  type JointRegion,
} from '@/lib/services/romAnalysis';

// All valid ROM joint types for validation
const romJointValues = [
  'CERVICAL_FLEXION',
  'CERVICAL_EXTENSION',
  'CERVICAL_LATERAL_LEFT',
  'CERVICAL_LATERAL_RIGHT',
  'CERVICAL_ROTATION_LEFT',
  'CERVICAL_ROTATION_RIGHT',
  'THORACIC_FLEXION',
  'THORACIC_EXTENSION',
  'THORACIC_ROTATION_LEFT',
  'THORACIC_ROTATION_RIGHT',
  'LUMBAR_FLEXION',
  'LUMBAR_EXTENSION',
  'LUMBAR_LATERAL_LEFT',
  'LUMBAR_LATERAL_RIGHT',
  'SHOULDER_FLEXION',
  'SHOULDER_EXTENSION',
  'SHOULDER_ABDUCTION',
  'SHOULDER_ADDUCTION',
  'SHOULDER_INTERNAL_ROTATION',
  'SHOULDER_EXTERNAL_ROTATION',
  'ELBOW_FLEXION',
  'ELBOW_EXTENSION',
  'HIP_FLEXION',
  'HIP_EXTENSION',
  'HIP_ABDUCTION',
  'HIP_ADDUCTION',
  'HIP_INTERNAL_ROTATION',
  'HIP_EXTERNAL_ROTATION',
  'KNEE_FLEXION',
  'KNEE_EXTENSION',
  'ANKLE_DORSIFLEXION',
  'ANKLE_PLANTARFLEXION',
  'ANKLE_INVERSION',
  'ANKLE_EVERSION',
] as const;

const romJointSchema = z.enum(romJointValues);
const sideSchema = z.enum(['left', 'right', 'bilateral']).nullable();
const regionSchema = z.enum([
  'cervical',
  'thoracic',
  'lumbar',
  'shoulder',
  'elbow',
  'hip',
  'knee',
  'ankle',
]);

export const romRouter = router({
  // ============================================
  // CREATE / RECORD ROM MEASUREMENT
  // ============================================

  /**
   * Record a new ROM measurement
   */
  create: providerProcedure
    .input(
      z.object({
        patientId: z.string(),
        encounterId: z.string().optional(),
        joint: romJointSchema,
        degrees: z.number().min(-15).max(200),
        side: sideSchema.optional().default(null),
        position: z.string().optional(),
        painLevel: z.number().min(0).max(10).optional(),
        painAtDegrees: z.number().optional(),
        notes: z.string().optional(),
        measurementDate: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        patientId,
        encounterId,
        joint,
        degrees,
        side,
        position,
        painLevel,
        painAtDegrees,
        notes,
        measurementDate,
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

      // Get normal range from definitions
      const definition = ROM_DEFINITIONS[joint as ROMJointType];
      if (!definition) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Invalid joint type: ${joint}`,
        });
      }

      const normalDegrees = definition.normalDegrees;
      const percentOfNormal = calculatePercentOfNormal(degrees, normalDegrees);
      const restricted = isRestricted(degrees, joint as ROMJointType);

      return ctx.prisma.rangeOfMotion.create({
        data: {
          patientId,
          encounterId: encounterId || null,
          organizationId: ctx.user.organizationId,
          joint,
          degrees,
          normalDegrees,
          percentOfNormal,
          isRestricted: restricted,
          side: side || null,
          position: position || null,
          painLevel: painLevel ?? null,
          painAtDegrees: painAtDegrees ?? null,
          notes: notes || null,
          measurementDate: measurementDate || new Date(),
        },
      });
    }),

  /**
   * Record multiple ROM measurements at once (batch)
   */
  createBatch: providerProcedure
    .input(
      z.object({
        patientId: z.string(),
        encounterId: z.string().optional(),
        measurements: z.array(
          z.object({
            joint: romJointSchema,
            degrees: z.number().min(-15).max(200),
            side: sideSchema.optional().default(null),
            position: z.string().optional(),
            painLevel: z.number().min(0).max(10).optional(),
            painAtDegrees: z.number().optional(),
            notes: z.string().optional(),
          })
        ),
        measurementDate: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, encounterId, measurements, measurementDate } = input;

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

      const date = measurementDate || new Date();

      const created = await Promise.all(
        measurements.map(async (m) => {
          const definition = ROM_DEFINITIONS[m.joint as ROMJointType];
          const normalDegrees = definition?.normalDegrees || 0;
          const percentOfNormal = calculatePercentOfNormal(m.degrees, normalDegrees);
          const restricted = isRestricted(m.degrees, m.joint as ROMJointType);

          return ctx.prisma.rangeOfMotion.create({
            data: {
              patientId,
              encounterId: encounterId || null,
              organizationId: ctx.user.organizationId,
              joint: m.joint,
              degrees: m.degrees,
              normalDegrees,
              percentOfNormal,
              isRestricted: restricted,
              side: m.side || null,
              position: m.position || null,
              painLevel: m.painLevel ?? null,
              painAtDegrees: m.painAtDegrees ?? null,
              notes: m.notes || null,
              measurementDate: date,
            },
          });
        })
      );

      return {
        count: created.length,
        measurements: created,
      };
    }),

  // ============================================
  // LIST ROM MEASUREMENTS
  // ============================================

  /**
   * List ROM measurements for a patient
   */
  list: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        encounterId: z.string().optional(),
        region: regionSchema.optional(),
        joint: romJointSchema.optional(),
        fromDate: z.date().optional(),
        toDate: z.date().optional(),
        restrictedOnly: z.boolean().default(false),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const {
        patientId,
        encounterId,
        region,
        joint,
        fromDate,
        toDate,
        restrictedOnly,
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

      // Build filter for joints based on region
      let jointFilter: ROMJoint[] | undefined;
      if (region) {
        jointFilter = getJointsForRegion(region as JointRegion) as ROMJoint[];
      } else if (joint) {
        jointFilter = [joint as ROMJoint];
      }

      const where = {
        patientId,
        organizationId: ctx.user.organizationId,
        ...(encounterId && { encounterId }),
        ...(jointFilter && { joint: { in: jointFilter } }),
        ...(restrictedOnly && { isRestricted: true }),
        ...(fromDate || toDate
          ? {
              measurementDate: {
                ...(fromDate && { gte: fromDate }),
                ...(toDate && { lte: toDate }),
              },
            }
          : {}),
      };

      const measurements = await ctx.prisma.rangeOfMotion.findMany({
        where,
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: [{ measurementDate: 'desc' }, { joint: 'asc' }],
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
      if (measurements.length > limit) {
        const nextItem = measurements.pop();
        nextCursor = nextItem?.id;
      }

      // Enhance with definition data
      const enhanced = measurements.map((m) => ({
        ...m,
        definition: ROM_DEFINITIONS[m.joint as ROMJointType],
        severity: getRestrictionSeverity(m.degrees, m.joint as ROMJointType),
      }));

      return {
        measurements: enhanced,
        nextCursor,
      };
    }),

  /**
   * Get ROM history grouped by date
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
      const dates = await ctx.prisma.rangeOfMotion.findMany({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
        },
        select: {
          measurementDate: true,
        },
        distinct: ['measurementDate'],
        orderBy: {
          measurementDate: 'desc',
        },
        take: limit,
      });

      // Get measurements for each date
      const byDate = await Promise.all(
        dates.map(async (d) => {
          const measurements = await ctx.prisma.rangeOfMotion.findMany({
            where: {
              patientId,
              organizationId: ctx.user.organizationId,
              measurementDate: d.measurementDate,
            },
            orderBy: { joint: 'asc' },
          });

          const summary = calculateROMSummary(
            measurements.map((m) => ({
              joint: m.joint as ROMJointType,
              side: m.side,
              degrees: m.degrees,
              normalDegrees: m.normalDegrees,
              isRestricted: m.isRestricted,
            }))
          );

          return {
            date: d.measurementDate,
            measurements: measurements.map((m) => ({
              ...m,
              definition: ROM_DEFINITIONS[m.joint as ROMJointType],
              severity: getRestrictionSeverity(m.degrees, m.joint as ROMJointType),
            })),
            summary,
          };
        })
      );

      return byDate;
    }),

  // ============================================
  // COMPARE ROM ACROSS VISITS
  // ============================================

  /**
   * Compare ROM measurements across visits
   */
  compare: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        currentDate: z.date(),
        previousDate: z.date(),
        region: regionSchema.optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, currentDate, previousDate, region } = input;

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

      // Build joint filter
      let jointFilter: ROMJoint[] | undefined;
      if (region) {
        jointFilter = getJointsForRegion(region as JointRegion) as ROMJoint[];
      }

      // Get measurements for both dates
      const [currentMeasurements, previousMeasurements] = await Promise.all([
        ctx.prisma.rangeOfMotion.findMany({
          where: {
            patientId,
            organizationId: ctx.user.organizationId,
            measurementDate: currentDate,
            ...(jointFilter && { joint: { in: jointFilter } }),
          },
        }),
        ctx.prisma.rangeOfMotion.findMany({
          where: {
            patientId,
            organizationId: ctx.user.organizationId,
            measurementDate: previousDate,
            ...(jointFilter && { joint: { in: jointFilter } }),
          },
        }),
      ]);

      // Match measurements by joint and side
      const comparisons = [];
      for (const current of currentMeasurements) {
        const previous = previousMeasurements.find(
          (p) => p.joint === current.joint && p.side === current.side
        );

        if (previous) {
          const comparison = compareROMReadings(
            previous.degrees,
            current.degrees,
            current.joint as ROMJointType,
            previousDate,
            currentDate,
            current.side
          );

          comparisons.push({
            ...comparison,
            currentId: current.id,
            previousId: previous.id,
            definition: ROM_DEFINITIONS[current.joint as ROMJointType],
          });
        }
      }

      // Calculate overall summary
      const improvedCount = comparisons.filter((c) => c.improvement === 'improved').length;
      const declinedCount = comparisons.filter((c) => c.improvement === 'declined').length;
      const stableCount = comparisons.filter((c) => c.improvement === 'stable').length;

      const avgChangePercent =
        comparisons.length > 0
          ? Math.round(
              comparisons.reduce((sum, c) => sum + c.changePercent, 0) / comparisons.length
            )
          : 0;

      return {
        comparisons,
        summary: {
          total: comparisons.length,
          improved: improvedCount,
          declined: declinedCount,
          stable: stableCount,
          averageChangePercent: avgChangePercent,
        },
        currentDate,
        previousDate,
      };
    }),

  /**
   * Get trend data for specific joints over time
   */
  getTrend: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        joint: romJointSchema,
        side: sideSchema.optional(),
        limit: z.number().min(2).max(50).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, joint, side, limit } = input;

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

      const measurements = await ctx.prisma.rangeOfMotion.findMany({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
          joint,
          ...(side !== undefined && { side }),
        },
        orderBy: { measurementDate: 'asc' },
        take: limit,
      });

      const definition = ROM_DEFINITIONS[joint as ROMJointType];

      // Calculate trend direction
      let trendDirection: 'improving' | 'declining' | 'stable' = 'stable';
      if (measurements.length >= 3) {
        const recent = measurements.slice(-3);
        const first = recent[0].degrees;
        const last = recent[recent.length - 1].degrees;
        const change = last - first;
        const changePercent = first !== 0 ? (change / first) * 100 : 0;

        if (changePercent > 5) {
          trendDirection = 'improving';
        } else if (changePercent < -5) {
          trendDirection = 'declining';
        }
      }

      return {
        joint,
        side,
        definition,
        measurements: measurements.map((m) => ({
          id: m.id,
          date: m.measurementDate,
          degrees: m.degrees,
          percentOfNormal: m.percentOfNormal,
          isRestricted: m.isRestricted,
          painLevel: m.painLevel,
        })),
        trend: {
          direction: trendDirection,
          dataPoints: measurements.length,
          firstMeasurement: measurements[0] || null,
          lastMeasurement: measurements[measurements.length - 1] || null,
        },
      };
    }),

  // ============================================
  // GET REFERENCE DATA
  // ============================================

  /**
   * Get all joint definitions with normal ranges
   */
  getJointDefinitions: protectedProcedure
    .input(z.object({ region: regionSchema.optional() }).optional())
    .query(({ input }) => {
      if (input?.region) {
        const joints = getJointsForRegion(input.region as JointRegion);
        return joints.map((joint) => ({
          joint,
          ...ROM_DEFINITIONS[joint],
        }));
      }

      return Object.entries(ROM_DEFINITIONS).map(([joint, definition]) => ({
        joint: joint as ROMJointType,
        ...definition,
      }));
    }),

  /**
   * Get joints grouped by region
   */
  getJointsGrouped: protectedProcedure.query(() => {
    return getAllJointsGrouped();
  }),

  /**
   * Get region definitions
   */
  getRegions: protectedProcedure.query(() => {
    return Object.entries(ROM_REGIONS).map(([key, value]) => ({
      key: key as JointRegion,
      ...value,
    }));
  }),

  // ============================================
  // DIAGRAM DATA
  // ============================================

  /**
   * Get ROM data formatted for visual diagram
   */
  getDiagramData: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        date: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
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

      // Get measurements - either for specific date or most recent for each joint
      let measurements;
      if (date) {
        measurements = await ctx.prisma.rangeOfMotion.findMany({
          where: {
            patientId,
            organizationId: ctx.user.organizationId,
            measurementDate: date,
          },
        });
      } else {
        // Get most recent for each joint/side combination
        const allMeasurements = await ctx.prisma.rangeOfMotion.findMany({
          where: {
            patientId,
            organizationId: ctx.user.organizationId,
          },
          orderBy: { measurementDate: 'desc' },
        });

        // Dedupe by joint + side
        const seen = new Set<string>();
        measurements = allMeasurements.filter((m) => {
          const key = `${m.joint}:${m.side}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

      // Generate diagram data
      const diagramData = generateROMDiagramData(
        measurements.map((m) => ({
          joint: m.joint as ROMJointType,
          side: m.side,
          degrees: m.degrees,
          isRestricted: m.isRestricted,
        }))
      );

      return {
        diagramData,
        measurementCount: measurements.length,
        date: date || (measurements.length > 0 ? measurements[0].measurementDate : null),
      };
    }),

  // ============================================
  // SUMMARY / DASHBOARD
  // ============================================

  /**
   * Get patient ROM summary for dashboard
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

      // Get recent measurements
      const recentMeasurements = await ctx.prisma.rangeOfMotion.findMany({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
        },
        orderBy: { measurementDate: 'desc' },
        take: 100,
      });

      // Get most recent date
      const latestDate =
        recentMeasurements.length > 0 ? recentMeasurements[0].measurementDate : null;

      // Filter to just the most recent session
      const latestMeasurements = latestDate
        ? recentMeasurements.filter(
            (m) => m.measurementDate.getTime() === latestDate.getTime()
          )
        : [];

      // Calculate summary
      const summary = calculateROMSummary(
        latestMeasurements.map((m) => ({
          joint: m.joint as ROMJointType,
          side: m.side,
          degrees: m.degrees,
          normalDegrees: m.normalDegrees,
          isRestricted: m.isRestricted,
        }))
      );

      // Get total measurement count and dates
      const totalCount = await ctx.prisma.rangeOfMotion.count({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      const sessionCount = await ctx.prisma.rangeOfMotion.findMany({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
        },
        select: {
          measurementDate: true,
        },
        distinct: ['measurementDate'],
      });

      return {
        patientId,
        latestDate,
        summary,
        totalMeasurements: totalCount,
        sessionCount: sessionCount.length,
        latestMeasurements: latestMeasurements.map((m) => ({
          id: m.id,
          joint: m.joint,
          side: m.side,
          degrees: m.degrees,
          percentOfNormal: m.percentOfNormal,
          isRestricted: m.isRestricted,
          severity: getRestrictionSeverity(m.degrees, m.joint as ROMJointType),
          definition: ROM_DEFINITIONS[m.joint as ROMJointType],
        })),
      };
    }),

  // ============================================
  // UPDATE / DELETE
  // ============================================

  /**
   * Update a ROM measurement
   */
  update: providerProcedure
    .input(
      z.object({
        id: z.string(),
        degrees: z.number().min(-15).max(200).optional(),
        painLevel: z.number().min(0).max(10).optional().nullable(),
        painAtDegrees: z.number().optional().nullable(),
        notes: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, degrees, ...updateData } = input;

      // Verify access
      const measurement = await ctx.prisma.rangeOfMotion.findFirst({
        where: {
          id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!measurement) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'ROM measurement not found',
        });
      }

      // If degrees updated, recalculate derived fields
      let derivedData = {};
      if (degrees !== undefined) {
        const definition = ROM_DEFINITIONS[measurement.joint as ROMJointType];
        const normalDegrees = definition?.normalDegrees || measurement.normalDegrees;
        const percentOfNormal = calculatePercentOfNormal(degrees, normalDegrees);
        const restricted = isRestricted(degrees, measurement.joint as ROMJointType);

        derivedData = {
          degrees,
          percentOfNormal,
          isRestricted: restricted,
        };
      }

      return ctx.prisma.rangeOfMotion.update({
        where: { id },
        data: {
          ...derivedData,
          ...updateData,
        },
      });
    }),

  /**
   * Delete a ROM measurement
   */
  delete: providerProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify access
      const measurement = await ctx.prisma.rangeOfMotion.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!measurement) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'ROM measurement not found',
        });
      }

      await ctx.prisma.rangeOfMotion.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),

  /**
   * Delete all ROM measurements for a specific date
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

      const result = await ctx.prisma.rangeOfMotion.deleteMany({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
          measurementDate: date,
        },
      });

      return {
        success: true,
        deletedCount: result.count,
      };
    }),
});
