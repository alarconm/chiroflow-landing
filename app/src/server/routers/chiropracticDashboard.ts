import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { SpinalRegion, AdjustmentResponse, SubluxationSeverity, TechniqueCategory } from '@prisma/client';

// Severity info for display
const SEVERITY_INFO = [
  { value: 'MINIMAL', label: 'Minimal', numeric: 1, color: '#22c55e' },
  { value: 'MILD', label: 'Mild', numeric: 2, color: '#84cc16' },
  { value: 'MODERATE', label: 'Moderate', numeric: 3, color: '#f59e0b' },
  { value: 'SEVERE', label: 'Severe', numeric: 4, color: '#f97316' },
  { value: 'EXTREME', label: 'Extreme', numeric: 5, color: '#ef4444' },
];

const SEVERITY_VALUES: Record<SubluxationSeverity, number> = {
  MINIMAL: 1,
  MILD: 2,
  MODERATE: 3,
  SEVERE: 4,
  EXTREME: 5,
};

// Response info
const RESPONSE_INFO = [
  { value: 'EXCELLENT', label: 'Excellent', color: '#22c55e' },
  { value: 'GOOD', label: 'Good', color: '#84cc16' },
  { value: 'FAIR', label: 'Fair', color: '#f59e0b' },
  { value: 'GUARDED', label: 'Guarded', color: '#f97316' },
  { value: 'POOR', label: 'Poor', color: '#ef4444' },
];

export const chiropracticDashboardRouter = router({
  // Get patient spine overview with current subluxations
  getPatientSpineOverview: protectedProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { patientId } = input;

      // Verify patient belongs to org
      const patient = await ctx.prisma.patient.findFirst({
        where: { id: patientId, organizationId: ctx.user.organizationId },
        include: {
          demographics: {
            select: {
              firstName: true,
              lastName: true,
              dateOfBirth: true,
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

      // Get active subluxations
      const subluxations = await ctx.prisma.subluxation.findMany({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
          isResolved: false,
        },
        orderBy: [{ region: 'asc' }, { vertebra: 'asc' }],
        include: {
          encounter: {
            select: {
              id: true,
              encounterDate: true,
            },
          },
        },
      });

      // Get vertebral listings
      const latestEncounter = await ctx.prisma.encounter.findFirst({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
        },
        orderBy: { encounterDate: 'desc' },
        select: { id: true },
      });

      const listings = latestEncounter
        ? await ctx.prisma.vertebralListing.findMany({
            where: {
              encounterId: latestEncounter.id,
              organizationId: ctx.user.organizationId,
            },
            orderBy: [{ region: 'asc' }, { segment: 'asc' }],
          })
        : [];

      // Group subluxations by region
      const byRegion = Object.values(SpinalRegion).reduce(
        (acc, region) => {
          acc[region] = subluxations
            .filter((s) => s.region === region)
            .map((s) => ({
              ...s,
              severityInfo: SEVERITY_INFO.find((si) => si.value === s.severity),
              severityValue: SEVERITY_VALUES[s.severity],
            }));
          return acc;
        },
        {} as Record<SpinalRegion, typeof subluxations>
      );

      // Calculate stats
      const stats = {
        total: subluxations.length,
        bySeverity: Object.values(SubluxationSeverity).reduce(
          (acc, severity) => {
            acc[severity] = subluxations.filter((s) => s.severity === severity).length;
            return acc;
          },
          {} as Record<SubluxationSeverity, number>
        ),
        byRegion: Object.values(SpinalRegion).reduce(
          (acc, region) => {
            acc[region] = subluxations.filter((s) => s.region === region).length;
            return acc;
          },
          {} as Record<SpinalRegion, number>
        ),
        averageSeverity:
          subluxations.length > 0
            ? subluxations.reduce((sum, s) => sum + SEVERITY_VALUES[s.severity], 0) / subluxations.length
            : 0,
        mostAffectedRegion: Object.entries(
          subluxations.reduce(
            (acc, s) => {
              acc[s.region] = (acc[s.region] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>
          )
        ).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
      };

      return {
        patient: {
          id: patient.id,
          firstName: patient.demographics?.firstName,
          lastName: patient.demographics?.lastName,
          dateOfBirth: patient.demographics?.dateOfBirth,
        },
        subluxations: subluxations.map((s) => ({
          ...s,
          severityInfo: SEVERITY_INFO.find((si) => si.value === s.severity),
          severityValue: SEVERITY_VALUES[s.severity],
        })),
        listings,
        byRegion,
        stats,
      };
    }),

  // Get adjustment history timeline
  getAdjustmentTimeline: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, limit, offset, startDate, endDate } = input;

      // Verify patient
      const patient = await ctx.prisma.patient.findFirst({
        where: { id: patientId, organizationId: ctx.user.organizationId },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const dateFilter: Record<string, Date> = {};
      if (startDate) dateFilter.gte = startDate;
      if (endDate) dateFilter.lte = endDate;

      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
        encounter: { patientId },
        ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
      };

      const [adjustments, total] = await Promise.all([
        ctx.prisma.adjustment.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
          include: {
            technique: {
              select: {
                id: true,
                name: true,
                category: true,
              },
            },
            encounter: {
              select: {
                id: true,
                encounterDate: true,
                provider: {
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
            },
            subluxation: {
              select: {
                id: true,
                vertebra: true,
                listing: true,
                severity: true,
              },
            },
          },
        }),
        ctx.prisma.adjustment.count({ where }),
      ]);

      // Create a type for adjustment with response info
      type AdjustmentWithInfo = typeof adjustments[number] & {
        responseInfo: typeof RESPONSE_INFO[number] | undefined;
      };

      // Group by date for timeline
      const byDate = adjustments.reduce(
        (acc, adj) => {
          const date = adj.encounter.encounterDate.toISOString().split('T')[0];
          if (!acc[date]) {
            acc[date] = {
              date: adj.encounter.encounterDate,
              encounterId: adj.encounter.id,
              provider: adj.encounter.provider?.user
                ? `${adj.encounter.provider.user.firstName} ${adj.encounter.provider.user.lastName}`
                : 'Unknown',
              adjustments: [] as AdjustmentWithInfo[],
            };
          }
          acc[date].adjustments.push({
            ...adj,
            responseInfo: RESPONSE_INFO.find((r) => r.value === adj.response),
          });
          return acc;
        },
        {} as Record<string, {
          date: Date;
          encounterId: string;
          provider: string;
          adjustments: AdjustmentWithInfo[];
        }>
      );

      return {
        timeline: Object.values(byDate).sort(
          (a, b) => b.date.getTime() - a.date.getTime()
        ),
        adjustments: adjustments.map((a) => ({
          ...a,
          responseInfo: RESPONSE_INFO.find((r) => r.value === a.response),
        })),
        total,
        limit,
        offset,
        hasMore: offset + adjustments.length < total,
      };
    }),

  // Get treatment response trends
  getTreatmentResponseTrends: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        months: z.number().min(1).max(24).default(6),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, months } = input;

      // Verify patient
      const patient = await ctx.prisma.patient.findFirst({
        where: { id: patientId, organizationId: ctx.user.organizationId },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - months);

      // Get all adjustments in period
      const adjustments = await ctx.prisma.adjustment.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          encounter: { patientId },
          createdAt: { gte: startDate },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          vertebra: true,
          region: true,
          response: true,
          prePain: true,
          postPain: true,
          createdAt: true,
        },
      });

      // Get subluxation history
      const subluxationHistory = await ctx.prisma.subluxationHistory.findMany({
        where: {
          subluxation: {
            patientId,
            organizationId: ctx.user.organizationId,
          },
          createdAt: { gte: startDate },
        },
        orderBy: { createdAt: 'asc' },
        include: {
          subluxation: {
            select: {
              vertebra: true,
              region: true,
            },
          },
        },
      });

      // Response trend by month
      const responseByMonth = adjustments.reduce(
        (acc, adj) => {
          const month = adj.createdAt.toISOString().substring(0, 7);
          if (!acc[month]) {
            acc[month] = {
              month,
              total: 0,
              excellent: 0,
              good: 0,
              fair: 0,
              guarded: 0,
              poor: 0,
              avgPainReduction: 0,
              painReadings: 0,
            };
          }
          acc[month].total++;
          const respKey = adj.response.toLowerCase() as keyof typeof acc[string];
          if (typeof acc[month][respKey] === 'number') {
            (acc[month][respKey] as number)++;
          }
          if (adj.prePain !== null && adj.postPain !== null) {
            acc[month].avgPainReduction += (adj.prePain - adj.postPain);
            acc[month].painReadings++;
          }
          return acc;
        },
        {} as Record<string, {
          month: string;
          total: number;
          excellent: number;
          good: number;
          fair: number;
          guarded: number;
          poor: number;
          avgPainReduction: number;
          painReadings: number;
        }>
      );

      // Severity trend by month
      const severityByMonth = subluxationHistory.reduce(
        (acc, h) => {
          const month = h.createdAt.toISOString().substring(0, 7);
          if (!acc[month]) {
            acc[month] = {
              month,
              avgSeverity: 0,
              readings: 0,
              improved: 0,
              worsened: 0,
              unchanged: 0,
            };
          }
          acc[month].avgSeverity += SEVERITY_VALUES[h.newSeverity];
          acc[month].readings++;
          if (h.previousSeverity) {
            const change = SEVERITY_VALUES[h.newSeverity] - SEVERITY_VALUES[h.previousSeverity];
            if (change < 0) acc[month].improved++;
            else if (change > 0) acc[month].worsened++;
            else acc[month].unchanged++;
          }
          return acc;
        },
        {} as Record<string, {
          month: string;
          avgSeverity: number;
          readings: number;
          improved: number;
          worsened: number;
          unchanged: number;
        }>
      );

      // Calculate overall trend
      const recentAdjustments = adjustments.slice(-20);
      const olderAdjustments = adjustments.slice(0, 20);

      const getAvgResponseScore = (adjs: typeof adjustments) => {
        if (adjs.length === 0) return 0;
        const scores: Record<AdjustmentResponse, number> = {
          EXCELLENT: 5,
          GOOD: 4,
          FAIR: 3,
          GUARDED: 2,
          POOR: 1,
        };
        return adjs.reduce((sum, a) => sum + scores[a.response], 0) / adjs.length;
      };

      const overallTrend = {
        recentAvgResponse: getAvgResponseScore(recentAdjustments),
        olderAvgResponse: getAvgResponseScore(olderAdjustments),
        trending: getAvgResponseScore(recentAdjustments) > getAvgResponseScore(olderAdjustments)
          ? 'improving'
          : getAvgResponseScore(recentAdjustments) < getAvgResponseScore(olderAdjustments)
          ? 'declining'
          : 'stable',
        totalAdjustments: adjustments.length,
        avgPainReduction:
          adjustments.filter((a) => a.prePain !== null && a.postPain !== null).length > 0
            ? adjustments
                .filter((a) => a.prePain !== null && a.postPain !== null)
                .reduce((sum, a) => sum + ((a.prePain || 0) - (a.postPain || 0)), 0) /
              adjustments.filter((a) => a.prePain !== null && a.postPain !== null).length
            : 0,
      };

      return {
        responseByMonth: Object.values(responseByMonth)
          .map((m) => ({
            ...m,
            avgPainReduction: m.painReadings > 0 ? m.avgPainReduction / m.painReadings : 0,
          }))
          .sort((a, b) => a.month.localeCompare(b.month)),
        severityByMonth: Object.values(severityByMonth)
          .map((m) => ({
            ...m,
            avgSeverity: m.readings > 0 ? m.avgSeverity / m.readings : 0,
          }))
          .sort((a, b) => a.month.localeCompare(b.month)),
        overallTrend,
      };
    }),

  // Subluxation progress visualization
  getSubluxationProgress: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        vertebra: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, vertebra } = input;

      // Verify patient
      const patient = await ctx.prisma.patient.findFirst({
        where: { id: patientId, organizationId: ctx.user.organizationId },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Get subluxation history
      const where: Record<string, unknown> = {
        subluxation: {
          patientId,
          organizationId: ctx.user.organizationId,
          ...(vertebra ? { vertebra: { equals: vertebra, mode: 'insensitive' } } : {}),
        },
      };

      const history = await ctx.prisma.subluxationHistory.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        include: {
          subluxation: {
            select: {
              id: true,
              vertebra: true,
              region: true,
              isResolved: true,
            },
          },
          encounter: {
            select: {
              id: true,
              encounterDate: true,
            },
          },
          documentedBy: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      // Type for history entry with additional info
      type HistoryEntryWithInfo = typeof history[number] & {
        severityInfo: typeof SEVERITY_INFO[number] | undefined;
        previousSeverityInfo: typeof SEVERITY_INFO[number] | null;
        change: number;
      };

      // Type for vertebra progress
      type VertebraProgress = {
        vertebra: string;
        region: SpinalRegion;
        isResolved: boolean;
        history: HistoryEntryWithInfo[];
        firstSeverity: SubluxationSeverity;
        currentSeverity: SubluxationSeverity;
        totalChanges: number;
        improvements: number;
      };

      // Group by vertebra
      const byVertebra = history.reduce(
        (acc, h) => {
          const v = h.subluxation.vertebra;
          if (!acc[v]) {
            acc[v] = {
              vertebra: v,
              region: h.subluxation.region,
              isResolved: h.subluxation.isResolved,
              history: [] as HistoryEntryWithInfo[],
              firstSeverity: h.newSeverity,
              currentSeverity: h.newSeverity,
              totalChanges: 0,
              improvements: 0,
            };
          }
          acc[v].currentSeverity = h.newSeverity;
          acc[v].history.push({
            ...h,
            severityInfo: SEVERITY_INFO.find((s) => s.value === h.newSeverity),
            previousSeverityInfo: h.previousSeverity
              ? SEVERITY_INFO.find((s) => s.value === h.previousSeverity) ?? null
              : null,
            change: h.previousSeverity
              ? SEVERITY_VALUES[h.newSeverity] - SEVERITY_VALUES[h.previousSeverity]
              : 0,
          });
          if (h.previousSeverity) {
            acc[v].totalChanges++;
            if (SEVERITY_VALUES[h.newSeverity] < SEVERITY_VALUES[h.previousSeverity]) {
              acc[v].improvements++;
            }
          }
          return acc;
        },
        {} as Record<string, VertebraProgress>
      );

      // Calculate overall progress
      const vertebrae = Object.values(byVertebra);
      const overallProgress = {
        totalVertebrae: vertebrae.length,
        resolved: vertebrae.filter((v) => v.isResolved).length,
        improved: vertebrae.filter(
          (v) => SEVERITY_VALUES[v.currentSeverity] < SEVERITY_VALUES[v.firstSeverity]
        ).length,
        worsened: vertebrae.filter(
          (v) => SEVERITY_VALUES[v.currentSeverity] > SEVERITY_VALUES[v.firstSeverity]
        ).length,
        unchanged: vertebrae.filter(
          (v) => SEVERITY_VALUES[v.currentSeverity] === SEVERITY_VALUES[v.firstSeverity] && !v.isResolved
        ).length,
        avgInitialSeverity:
          vertebrae.length > 0
            ? vertebrae.reduce((sum, v) => sum + SEVERITY_VALUES[v.firstSeverity], 0) / vertebrae.length
            : 0,
        avgCurrentSeverity:
          vertebrae.filter((v) => !v.isResolved).length > 0
            ? vertebrae
                .filter((v) => !v.isResolved)
                .reduce((sum, v) => sum + SEVERITY_VALUES[v.currentSeverity], 0) /
              vertebrae.filter((v) => !v.isResolved).length
            : 0,
      };

      return {
        byVertebra,
        overallProgress,
      };
    }),

  // Get technique usage statistics
  getTechniqueUsageStats: protectedProcedure
    .input(
      z.object({
        patientId: z.string().optional(),
        providerId: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, providerId, startDate, endDate } = input;

      const dateFilter: Record<string, Date> = {};
      if (startDate) dateFilter.gte = startDate;
      if (endDate) dateFilter.lte = endDate;

      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
        techniqueId: { not: null },
        ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
      };

      if (patientId) {
        where.encounter = { patientId };
      }

      if (providerId) {
        where.encounter = {
          ...(where.encounter as object || {}),
          providerId,
        };
      }

      const adjustments = await ctx.prisma.adjustment.findMany({
        where,
        select: {
          techniqueId: true,
          region: true,
          response: true,
          createdAt: true,
        },
      });

      // Get technique details
      const techniqueIds = [...new Set(adjustments.map((a) => a.techniqueId).filter(Boolean))] as string[];
      const techniques = await ctx.prisma.technique.findMany({
        where: { id: { in: techniqueIds } },
        select: {
          id: true,
          name: true,
          category: true,
        },
      });

      const techniqueMap = new Map(techniques.map((t) => [t.id, t]));

      // Group by technique
      const byTechnique = adjustments.reduce(
        (acc, adj) => {
          if (!adj.techniqueId) return acc;
          if (!acc[adj.techniqueId]) {
            const tech = techniqueMap.get(adj.techniqueId);
            acc[adj.techniqueId] = {
              techniqueId: adj.techniqueId,
              name: tech?.name || 'Unknown',
              category: tech?.category || 'MANUAL',
              count: 0,
              responseDistribution: {} as Record<AdjustmentResponse, number>,
              regionDistribution: {} as Record<SpinalRegion, number>,
              successRate: 0,
              totalSuccessful: 0,
            };
          }
          acc[adj.techniqueId].count++;
          acc[adj.techniqueId].responseDistribution[adj.response] =
            (acc[adj.techniqueId].responseDistribution[adj.response] || 0) + 1;
          acc[adj.techniqueId].regionDistribution[adj.region] =
            (acc[adj.techniqueId].regionDistribution[adj.region] || 0) + 1;
          if (adj.response === 'EXCELLENT' || adj.response === 'GOOD') {
            acc[adj.techniqueId].totalSuccessful++;
          }
          return acc;
        },
        {} as Record<string, {
          techniqueId: string;
          name: string;
          category: TechniqueCategory | string;
          count: number;
          responseDistribution: Record<AdjustmentResponse, number>;
          regionDistribution: Record<SpinalRegion, number>;
          successRate: number;
          totalSuccessful: number;
        }>
      );

      // Calculate success rates
      Object.values(byTechnique).forEach((t) => {
        t.successRate = t.count > 0 ? (t.totalSuccessful / t.count) * 100 : 0;
      });

      // Group by category
      const byCategory = Object.values(byTechnique).reduce(
        (acc, t) => {
          const cat = t.category;
          if (!acc[cat]) {
            acc[cat] = {
              category: cat,
              count: 0,
              techniques: [],
            };
          }
          acc[cat].count += t.count;
          acc[cat].techniques.push(t);
          return acc;
        },
        {} as Record<string, {
          category: string;
          count: number;
          techniques: typeof byTechnique[string][];
        }>
      );

      return {
        byTechnique: Object.values(byTechnique).sort((a, b) => b.count - a.count),
        byCategory: Object.values(byCategory).sort((a, b) => b.count - a.count),
        totalAdjustments: adjustments.length,
        uniqueTechniques: techniqueIds.length,
      };
    }),

  // Quick adjustment entry interface data
  getQuickEntryData: protectedProcedure
    .input(z.object({ patientId: z.string(), encounterId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { patientId, encounterId } = input;

      // Verify encounter
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

      // Get active subluxations for quick selection
      const subluxations = await ctx.prisma.subluxation.findMany({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
          isResolved: false,
        },
        orderBy: [{ region: 'asc' }, { vertebra: 'asc' }],
        select: {
          id: true,
          vertebra: true,
          region: true,
          listing: true,
          severity: true,
        },
      });

      // Get provider's favorite techniques
      const provider = await ctx.prisma.provider.findFirst({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      });

      const favorites = provider
        ? await ctx.prisma.techniqueFavorite.findMany({
            where: { providerId: provider.id },
            orderBy: { displayOrder: 'asc' },
            include: {
              technique: {
                select: {
                  id: true,
                  name: true,
                  category: true,
                },
              },
            },
          })
        : [];

      // Get commonly used techniques for this patient
      const recentTechniques = await ctx.prisma.adjustment.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          encounter: { patientId },
          techniqueId: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          techniqueId: true,
        },
      });

      const techniqueUsage = recentTechniques.reduce(
        (acc, a) => {
          if (a.techniqueId) {
            acc[a.techniqueId] = (acc[a.techniqueId] || 0) + 1;
          }
          return acc;
        },
        {} as Record<string, number>
      );

      const frequentTechniqueIds = Object.entries(techniqueUsage)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id]) => id);

      const frequentTechniques =
        frequentTechniqueIds.length > 0
          ? await ctx.prisma.technique.findMany({
              where: { id: { in: frequentTechniqueIds } },
              select: {
                id: true,
                name: true,
                category: true,
              },
            })
          : [];

      // Get existing adjustments for this encounter
      const existingAdjustments = await ctx.prisma.adjustment.findMany({
        where: {
          encounterId,
          organizationId: ctx.user.organizationId,
        },
        select: {
          vertebra: true,
        },
      });

      const adjustedSegments = existingAdjustments.map((a) => a.vertebra);

      return {
        subluxations: subluxations.map((s) => ({
          ...s,
          alreadyAdjusted: adjustedSegments.includes(s.vertebra),
          severityInfo: SEVERITY_INFO.find((si) => si.value === s.severity),
        })),
        favorites: favorites.map((f) => f.technique).filter(Boolean),
        frequentTechniques: frequentTechniqueIds.map(
          (id) => frequentTechniques.find((t) => t.id === id)!
        ).filter(Boolean),
        adjustedSegments,
        encounterStatus: encounter.status,
      };
    }),

  // Integration with SOAP note workflow
  getSoapNoteIntegration: protectedProcedure
    .input(z.object({ encounterId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { encounterId } = input;

      // Verify encounter
      const encounter = await ctx.prisma.encounter.findFirst({
        where: {
          id: encounterId,
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

      if (!encounter) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        });
      }

      // Get subluxations for this encounter
      const subluxations = await ctx.prisma.subluxation.findMany({
        where: {
          encounterId,
          organizationId: ctx.user.organizationId,
        },
        orderBy: [{ region: 'asc' }, { vertebra: 'asc' }],
      });

      // Get adjustments for this encounter
      const adjustments = await ctx.prisma.adjustment.findMany({
        where: {
          encounterId,
          organizationId: ctx.user.organizationId,
        },
        orderBy: [{ region: 'asc' }, { vertebra: 'asc' }],
        include: {
          technique: {
            select: {
              name: true,
            },
          },
        },
      });

      // Get chiropractic exam
      const exam = await ctx.prisma.chiropracticExam.findFirst({
        where: {
          encounterId,
          organizationId: ctx.user.organizationId,
        },
      });

      // Generate SOAP note sections
      const objectiveSection = generateObjectiveSection(subluxations, exam);
      const assessmentSection = generateAssessmentSection(subluxations);
      const planSection = generatePlanSection(adjustments);

      return {
        encounter: {
          id: encounter.id,
          date: encounter.encounterDate,
          status: encounter.status,
          patientName: `${encounter.patient.demographics?.firstName} ${encounter.patient.demographics?.lastName}`,
        },
        subluxations: subluxations.map((s) => ({
          ...s,
          severityInfo: SEVERITY_INFO.find((si) => si.value === s.severity),
        })),
        adjustments: adjustments.map((a) => ({
          ...a,
          responseInfo: RESPONSE_INFO.find((r) => r.value === a.response),
        })),
        exam,
        soapSections: {
          objective: objectiveSection,
          assessment: assessmentSection,
          plan: planSection,
        },
      };
    }),
});

// Helper functions for SOAP note generation
function generateObjectiveSection(
  subluxations: Array<{ vertebra: string; region: SpinalRegion; listing: string; severity: SubluxationSeverity }>,
  exam: { summary?: string | null } | null
): string {
  const lines: string[] = [];

  if (subluxations.length > 0) {
    lines.push('CHIROPRACTIC FINDINGS:');
    const byRegion = subluxations.reduce(
      (acc, s) => {
        if (!acc[s.region]) acc[s.region] = [];
        acc[s.region].push(s);
        return acc;
      },
      {} as Record<SpinalRegion, typeof subluxations>
    );

    Object.entries(byRegion).forEach(([region, subs]) => {
      lines.push(`  ${region.charAt(0) + region.slice(1).toLowerCase()} Spine:`);
      subs.forEach((s) => {
        lines.push(`    - ${s.vertebra}: ${s.listing} (${s.severity.toLowerCase()})`);
      });
    });
  }

  if (exam?.summary) {
    lines.push('');
    lines.push('EXAMINATION:');
    lines.push(exam.summary);
  }

  return lines.join('\n');
}

function generateAssessmentSection(
  subluxations: Array<{ vertebra: string; region: SpinalRegion; severity: SubluxationSeverity }>
): string {
  if (subluxations.length === 0) {
    return 'No vertebral subluxations identified.';
  }

  const severe = subluxations.filter((s) => s.severity === 'SEVERE' || s.severity === 'EXTREME');
  const moderate = subluxations.filter((s) => s.severity === 'MODERATE');
  const mild = subluxations.filter((s) => s.severity === 'MILD' || s.severity === 'MINIMAL');

  const lines: string[] = [
    `${subluxations.length} vertebral subluxation(s) identified:`,
  ];

  if (severe.length > 0) {
    lines.push(`- ${severe.length} severe/extreme: ${severe.map((s) => s.vertebra).join(', ')}`);
  }
  if (moderate.length > 0) {
    lines.push(`- ${moderate.length} moderate: ${moderate.map((s) => s.vertebra).join(', ')}`);
  }
  if (mild.length > 0) {
    lines.push(`- ${mild.length} mild/minimal: ${mild.map((s) => s.vertebra).join(', ')}`);
  }

  return lines.join('\n');
}

function generatePlanSection(
  adjustments: Array<{ vertebra: string; technique: { name: string } | null; response: AdjustmentResponse }>
): string {
  if (adjustments.length === 0) {
    return 'No adjustments performed this visit.';
  }

  const lines: string[] = [
    'ADJUSTMENTS PERFORMED:',
  ];

  const byTechnique = adjustments.reduce(
    (acc, a) => {
      const tech = a.technique?.name || 'Manual';
      if (!acc[tech]) acc[tech] = [];
      acc[tech].push(a);
      return acc;
    },
    {} as Record<string, typeof adjustments>
  );

  Object.entries(byTechnique).forEach(([technique, adjs]) => {
    lines.push(`  ${technique}: ${adjs.map((a) => a.vertebra).join(', ')}`);
  });

  const excellentOrGood = adjustments.filter(
    (a) => a.response === 'EXCELLENT' || a.response === 'GOOD'
  ).length;
  const successRate = Math.round((excellentOrGood / adjustments.length) * 100);

  lines.push('');
  lines.push(`Response: ${excellentOrGood}/${adjustments.length} segments with good/excellent response (${successRate}%)`);

  return lines.join('\n');
}
