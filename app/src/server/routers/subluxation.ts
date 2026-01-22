import { z } from 'zod';
import { router, protectedProcedure, providerProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import { SpinalRegion, SubluxationSeverity } from '@prisma/client';

// Standard listing notations - support both Gonstead and Palmer
const GONSTEAD_LISTINGS = ['PLS', 'PRS', 'PLI', 'PRI', 'AS', 'PI', 'IN', 'EX', 'AS-IN', 'AS-EX', 'PI-IN', 'PI-EX'];
const PALMER_LISTINGS = ['PL', 'PR', 'P', 'A', 'L', 'R', 'I', 'S', 'RL', 'RR', 'PS', 'AS'];
const COMBINED_LISTINGS = [...new Set([...GONSTEAD_LISTINGS, ...PALMER_LISTINGS])];

// Validation schemas
const spinalRegionSchema = z.enum(['CERVICAL', 'THORACIC', 'LUMBAR', 'SACRAL', 'PELVIS']);
const severitySchema = z.enum(['MINIMAL', 'MILD', 'MODERATE', 'SEVERE', 'EXTREME']);

// Helper to determine region from vertebra
function getRegionFromVertebra(vertebra: string): SpinalRegion {
  const upper = vertebra.toUpperCase();
  if (upper.startsWith('C') && /^C[1-7]$/i.test(upper)) return 'CERVICAL';
  if (upper.startsWith('T') && /^T([1-9]|1[0-2])$/i.test(upper)) return 'THORACIC';
  if (upper.startsWith('L') && /^L[1-5]$/i.test(upper)) return 'LUMBAR';
  if (upper === 'SACRUM' || upper.startsWith('S') && /^S[1-5]$/i.test(upper)) return 'SACRAL';
  if (['ILIUM', 'ISCHIUM', 'PUBIS', 'COCCYX', 'PELVIS', 'SI', 'LEFT ILIUM', 'RIGHT ILIUM'].includes(upper)) return 'PELVIS';
  // Default to region based on naming
  if (upper.includes('SACR')) return 'SACRAL';
  if (upper.includes('PELV') || upper.includes('ILI')) return 'PELVIS';
  return 'LUMBAR'; // Default fallback
}

// Severity numeric values for comparisons
const SEVERITY_VALUES: Record<SubluxationSeverity, number> = {
  MINIMAL: 1,
  MILD: 2,
  MODERATE: 3,
  SEVERE: 4,
  EXTREME: 5,
};

// Severity display info
const SEVERITY_INFO = [
  { value: 'MINIMAL', label: 'Minimal', numeric: 1, color: '#22c55e', description: 'Minimal dysfunction - slight restriction' },
  { value: 'MILD', label: 'Mild', numeric: 2, color: '#84cc16', description: 'Mild dysfunction - noticeable restriction' },
  { value: 'MODERATE', label: 'Moderate', numeric: 3, color: '#f59e0b', description: 'Moderate dysfunction - significant restriction' },
  { value: 'SEVERE', label: 'Severe', numeric: 4, color: '#f97316', description: 'Severe dysfunction - major restriction with symptoms' },
  { value: 'EXTREME', label: 'Extreme', numeric: 5, color: '#ef4444', description: 'Extreme dysfunction - critical, requires immediate care' },
];

export const subluxationRouter = router({
  // Create a new subluxation finding
  create: providerProcedure
    .input(
      z.object({
        patientId: z.string(),
        encounterId: z.string(),
        vertebra: z.string().min(1, 'Vertebra is required'),
        listing: z.string().min(1, 'Listing is required'),
        severity: severitySchema.default('MODERATE'),
        notes: z.string().optional(),
        bodyDiagramId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, encounterId, vertebra, listing, severity, notes, bodyDiagramId } = input;

      // Verify patient belongs to org
      const patient = await ctx.prisma.patient.findFirst({
        where: { id: patientId, organizationId: ctx.user.organizationId },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Verify encounter belongs to patient and org
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

      // Determine region from vertebra
      const region = getRegionFromVertebra(vertebra);

      // Check for existing subluxation at same vertebra in this encounter
      const existing = await ctx.prisma.subluxation.findFirst({
        where: {
          encounterId,
          vertebra: { equals: vertebra, mode: 'insensitive' },
        },
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Subluxation already documented for ${vertebra} in this encounter. Use update to modify.`,
        });
      }

      // Create subluxation
      const subluxation = await ctx.prisma.subluxation.create({
        data: {
          vertebra: vertebra.toUpperCase(),
          region,
          listing: listing.toUpperCase(),
          severity,
          notes,
          bodyDiagramId,
          patientId,
          encounterId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          bodyDiagram: true,
          encounter: {
            select: { encounterDate: true },
          },
        },
      });

      // Create initial history entry
      await ctx.prisma.subluxationHistory.create({
        data: {
          subluxationId: subluxation.id,
          encounterId,
          newListing: listing.toUpperCase(),
          newSeverity: severity,
          notes: 'Initial documentation',
          documentedById: ctx.user.id,
        },
      });

      await auditLog('CREATE', 'Subluxation', {
        entityId: subluxation.id,
        changes: { vertebra, listing, severity },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        ...subluxation,
        severityInfo: SEVERITY_INFO.find((s) => s.value === severity),
      };
    }),

  // Update subluxation status
  update: providerProcedure
    .input(
      z.object({
        id: z.string(),
        listing: z.string().optional(),
        severity: severitySchema.optional(),
        notes: z.string().optional(),
        isResolved: z.boolean().optional(),
        resolvedNotes: z.string().optional(),
        changeReason: z.string().optional(),
        encounterId: z.string(), // Current encounter for history tracking
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, listing, severity, notes, isResolved, resolvedNotes, changeReason, encounterId } = input;

      // Get existing subluxation
      const existing = await ctx.prisma.subluxation.findFirst({
        where: {
          id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Subluxation not found',
        });
      }

      // Verify encounter exists
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

      // Build update data
      const updateData: Record<string, unknown> = {};
      const changes: Record<string, unknown> = {};

      if (listing !== undefined && listing !== existing.listing) {
        updateData.listing = listing.toUpperCase();
        changes.listing = { from: existing.listing, to: listing.toUpperCase() };
      }

      if (severity !== undefined && severity !== existing.severity) {
        updateData.severity = severity;
        changes.severity = { from: existing.severity, to: severity };
      }

      if (notes !== undefined) {
        updateData.notes = notes;
      }

      if (isResolved !== undefined) {
        updateData.isResolved = isResolved;
        if (isResolved) {
          updateData.resolvedAt = new Date();
          updateData.resolvedNotes = resolvedNotes;
        } else {
          updateData.resolvedAt = null;
          updateData.resolvedNotes = null;
        }
        changes.isResolved = isResolved;
      }

      // Update subluxation
      const subluxation = await ctx.prisma.subluxation.update({
        where: { id },
        data: updateData,
        include: {
          bodyDiagram: true,
          encounter: {
            select: { encounterDate: true },
          },
        },
      });

      // Create history entry if listing or severity changed
      if (changes.listing || changes.severity) {
        await ctx.prisma.subluxationHistory.create({
          data: {
            subluxationId: id,
            encounterId,
            previousListing: existing.listing,
            newListing: (listing || existing.listing).toUpperCase(),
            previousSeverity: existing.severity,
            newSeverity: severity || existing.severity,
            notes,
            changeReason,
            documentedById: ctx.user.id,
          },
        });
      }

      await auditLog('UPDATE', 'Subluxation', {
        entityId: id,
        changes,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        ...subluxation,
        severityInfo: SEVERITY_INFO.find((s) => s.value === subluxation.severity),
      };
    }),

  // List patient subluxations by region with filtering
  list: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        region: spinalRegionSchema.optional(),
        includeResolved: z.boolean().default(false),
        encounterId: z.string().optional(), // Filter to specific encounter
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, region, includeResolved, encounterId, limit, offset } = input;

      // Verify patient belongs to org
      const patient = await ctx.prisma.patient.findFirst({
        where: { id: patientId, organizationId: ctx.user.organizationId },
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

      if (region) {
        where.region = region;
      }

      if (!includeResolved) {
        where.isResolved = false;
      }

      if (encounterId) {
        where.encounterId = encounterId;
      }

      const [subluxations, total] = await Promise.all([
        ctx.prisma.subluxation.findMany({
          where,
          orderBy: [{ region: 'asc' }, { vertebra: 'asc' }, { createdAt: 'desc' }],
          take: limit,
          skip: offset,
          include: {
            bodyDiagram: true,
            encounter: {
              select: {
                id: true,
                encounterDate: true,
              },
            },
            _count: {
              select: { history: true, adjustments: true },
            },
          },
        }),
        ctx.prisma.subluxation.count({ where }),
      ]);

      // Group by region - use explicit type
      type SubluxationWithExtras = (typeof subluxations)[0] & {
        severityInfo: typeof SEVERITY_INFO[0] | undefined;
        severityValue: number;
      };
      const byRegion = subluxations.reduce(
        (acc, sub) => {
          if (!acc[sub.region]) {
            acc[sub.region] = [];
          }
          acc[sub.region].push({
            ...sub,
            severityInfo: SEVERITY_INFO.find((s) => s.value === sub.severity),
            severityValue: SEVERITY_VALUES[sub.severity],
          } as SubluxationWithExtras);
          return acc;
        },
        {} as Record<SpinalRegion, SubluxationWithExtras[]>
      );

      return {
        subluxations: subluxations.map((s) => ({
          ...s,
          severityInfo: SEVERITY_INFO.find((si) => si.value === s.severity),
          severityValue: SEVERITY_VALUES[s.severity],
        })),
        byRegion,
        total,
        limit,
        offset,
        hasMore: offset + subluxations.length < total,
      };
    }),

  // Get subluxation with full details
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const subluxation = await ctx.prisma.subluxation.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          bodyDiagram: true,
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
          history: {
            orderBy: { createdAt: 'desc' },
            include: {
              documentedBy: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
              encounter: {
                select: {
                  id: true,
                  encounterDate: true,
                },
              },
            },
          },
          adjustments: {
            orderBy: { createdAt: 'desc' },
            take: 5,
            include: {
              technique: {
                select: {
                  id: true,
                  name: true,
                  category: true,
                },
              },
            },
          },
        },
      });

      if (!subluxation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Subluxation not found',
        });
      }

      return {
        ...subluxation,
        severityInfo: SEVERITY_INFO.find((s) => s.value === subluxation.severity),
        severityValue: SEVERITY_VALUES[subluxation.severity],
      };
    }),

  // Get subluxation history timeline
  getHistory: protectedProcedure
    .input(
      z.object({
        subluxationId: z.string().optional(),
        patientId: z.string().optional(),
        vertebra: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { subluxationId, patientId, vertebra, limit } = input;

      if (!subluxationId && !patientId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Either subluxationId or patientId is required',
        });
      }

      // If patientId provided, verify it belongs to org
      if (patientId) {
        const patient = await ctx.prisma.patient.findFirst({
          where: { id: patientId, organizationId: ctx.user.organizationId },
        });

        if (!patient) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Patient not found',
          });
        }
      }

      // If subluxationId provided, verify it belongs to org
      if (subluxationId) {
        const subluxation = await ctx.prisma.subluxation.findFirst({
          where: { id: subluxationId, organizationId: ctx.user.organizationId },
        });

        if (!subluxation) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Subluxation not found',
          });
        }
      }

      const where: Record<string, unknown> = {};

      if (subluxationId) {
        where.subluxationId = subluxationId;
      } else if (patientId) {
        where.subluxation = {
          patientId,
          organizationId: ctx.user.organizationId,
          ...(vertebra ? { vertebra: { equals: vertebra, mode: 'insensitive' } } : {}),
        };
      }

      const history = await ctx.prisma.subluxationHistory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          subluxation: {
            select: {
              id: true,
              vertebra: true,
              region: true,
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
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      return history.map((h) => ({
        ...h,
        previousSeverityInfo: h.previousSeverity ? SEVERITY_INFO.find((s) => s.value === h.previousSeverity) : null,
        newSeverityInfo: SEVERITY_INFO.find((s) => s.value === h.newSeverity),
        severityChange: h.previousSeverity
          ? SEVERITY_VALUES[h.newSeverity] - SEVERITY_VALUES[h.previousSeverity]
          : null,
      }));
    }),

  // Compare subluxations between visits
  compare: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        encounter1Id: z.string(),
        encounter2Id: z.string(),
        region: spinalRegionSchema.optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, encounter1Id, encounter2Id, region } = input;

      // Verify patient belongs to org
      const patient = await ctx.prisma.patient.findFirst({
        where: { id: patientId, organizationId: ctx.user.organizationId },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Verify both encounters belong to patient
      const [encounter1, encounter2] = await Promise.all([
        ctx.prisma.encounter.findFirst({
          where: { id: encounter1Id, patientId, organizationId: ctx.user.organizationId },
        }),
        ctx.prisma.encounter.findFirst({
          where: { id: encounter2Id, patientId, organizationId: ctx.user.organizationId },
        }),
      ]);

      if (!encounter1 || !encounter2) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'One or both encounters not found',
        });
      }

      const whereBase: Record<string, unknown> = {
        patientId,
        organizationId: ctx.user.organizationId,
        ...(region ? { region } : {}),
      };

      // Get subluxations for both encounters
      const [subs1, subs2] = await Promise.all([
        ctx.prisma.subluxation.findMany({
          where: { ...whereBase, encounterId: encounter1Id },
          orderBy: [{ region: 'asc' }, { vertebra: 'asc' }],
        }),
        ctx.prisma.subluxation.findMany({
          where: { ...whereBase, encounterId: encounter2Id },
          orderBy: [{ region: 'asc' }, { vertebra: 'asc' }],
        }),
      ]);

      // Create comparison map
      const vertebraMap = new Map<string, { visit1: typeof subs1[0] | null; visit2: typeof subs2[0] | null }>();

      // Add visit 1 subluxations
      for (const sub of subs1) {
        vertebraMap.set(sub.vertebra, { visit1: sub, visit2: null });
      }

      // Add visit 2 subluxations
      for (const sub of subs2) {
        const existing = vertebraMap.get(sub.vertebra);
        if (existing) {
          existing.visit2 = sub;
        } else {
          vertebraMap.set(sub.vertebra, { visit1: null, visit2: sub });
        }
      }

      // Build comparison results
      const comparisons = Array.from(vertebraMap.entries()).map(([vertebra, { visit1, visit2 }]) => {
        let status: 'new' | 'resolved' | 'improved' | 'worsened' | 'unchanged';
        let severityChange = 0;

        if (!visit1 && visit2) {
          status = 'new';
        } else if (visit1 && !visit2) {
          status = 'resolved';
        } else if (visit1 && visit2) {
          severityChange = SEVERITY_VALUES[visit2.severity] - SEVERITY_VALUES[visit1.severity];
          if (severityChange < 0) {
            status = 'improved';
          } else if (severityChange > 0) {
            status = 'worsened';
          } else {
            status = 'unchanged';
          }
        } else {
          status = 'unchanged';
        }

        return {
          vertebra,
          region: visit1?.region || visit2?.region,
          visit1: visit1
            ? {
                ...visit1,
                severityInfo: SEVERITY_INFO.find((s) => s.value === visit1.severity),
              }
            : null,
          visit2: visit2
            ? {
                ...visit2,
                severityInfo: SEVERITY_INFO.find((s) => s.value === visit2.severity),
              }
            : null,
          status,
          severityChange,
          listingChanged: visit1 && visit2 ? visit1.listing !== visit2.listing : false,
        };
      });

      // Sort by region then vertebra
      comparisons.sort((a, b) => {
        const regionOrder: Record<SpinalRegion, number> = {
          CERVICAL: 1,
          THORACIC: 2,
          LUMBAR: 3,
          SACRAL: 4,
          PELVIS: 5,
        };
        const regionDiff = regionOrder[a.region as SpinalRegion] - regionOrder[b.region as SpinalRegion];
        if (regionDiff !== 0) return regionDiff;
        return a.vertebra.localeCompare(b.vertebra);
      });

      // Summary stats
      const summary = {
        total: comparisons.length,
        new: comparisons.filter((c) => c.status === 'new').length,
        resolved: comparisons.filter((c) => c.status === 'resolved').length,
        improved: comparisons.filter((c) => c.status === 'improved').length,
        worsened: comparisons.filter((c) => c.status === 'worsened').length,
        unchanged: comparisons.filter((c) => c.status === 'unchanged').length,
        overallTrend: comparisons.reduce((sum, c) => sum + c.severityChange, 0),
      };

      return {
        encounter1: {
          id: encounter1.id,
          date: encounter1.encounterDate,
          subluxationCount: subs1.length,
        },
        encounter2: {
          id: encounter2.id,
          date: encounter2.encounterDate,
          subluxationCount: subs2.length,
        },
        comparisons,
        summary,
      };
    }),

  // Delete subluxation
  delete: providerProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const subluxation = await ctx.prisma.subluxation.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          encounter: true,
          _count: { select: { adjustments: true } },
        },
      });

      if (!subluxation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Subluxation not found',
        });
      }

      if (subluxation.encounter.status === 'SIGNED' || subluxation.encounter.status === 'AMENDED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot delete subluxation from a signed encounter',
        });
      }

      if (subluxation._count.adjustments > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot delete subluxation with ${subluxation._count.adjustments} adjustment(s). Mark as resolved instead.`,
        });
      }

      await auditLog('DELETE', 'Subluxation', {
        entityId: input.id,
        changes: { vertebra: subluxation.vertebra, listing: subluxation.listing },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      await ctx.prisma.subluxation.delete({ where: { id: input.id } });

      return { success: true };
    }),

  // Get severity scale info
  getSeverityScale: protectedProcedure.query(() => {
    return SEVERITY_INFO;
  }),

  // Get standard listing notations
  getListingNotations: protectedProcedure.query(() => {
    return {
      gonstead: GONSTEAD_LISTINGS.map((l) => ({
        code: l,
        description: getListingDescription(l, 'gonstead'),
      })),
      palmer: PALMER_LISTINGS.map((l) => ({
        code: l,
        description: getListingDescription(l, 'palmer'),
      })),
      combined: COMBINED_LISTINGS,
    };
  }),

  // Get patient spine overview (all current subluxations)
  getPatientOverview: protectedProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      const patient = await ctx.prisma.patient.findFirst({
        where: { id: input.patientId, organizationId: ctx.user.organizationId },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Get all active subluxations
      const subluxations = await ctx.prisma.subluxation.findMany({
        where: {
          patientId: input.patientId,
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

      // Group by region
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
      };

      return {
        subluxations: subluxations.map((s) => ({
          ...s,
          severityInfo: SEVERITY_INFO.find((si) => si.value === s.severity),
          severityValue: SEVERITY_VALUES[s.severity],
        })),
        byRegion,
        stats,
      };
    }),
});

// Helper to get listing descriptions
function getListingDescription(code: string, system: 'gonstead' | 'palmer'): string {
  const descriptions: Record<string, Record<string, string>> = {
    gonstead: {
      PLS: 'Posterior-Left-Superior (body rotated left, superior)',
      PRS: 'Posterior-Right-Superior (body rotated right, superior)',
      PLI: 'Posterior-Left-Inferior (body rotated left, inferior)',
      PRI: 'Posterior-Right-Inferior (body rotated right, inferior)',
      AS: 'Anterior-Superior (anterior disc wedging)',
      PI: 'Posterior-Inferior (posterior disc wedging)',
      IN: 'Inferior (caudal)',
      EX: 'Extension (extended position)',
      'AS-IN': 'Anterior-Superior with Inferior rotation',
      'AS-EX': 'Anterior-Superior with Extension',
      'PI-IN': 'Posterior-Inferior with Inferior rotation',
      'PI-EX': 'Posterior-Inferior with Extension',
    },
    palmer: {
      PL: 'Posterior-Left',
      PR: 'Posterior-Right',
      P: 'Posterior',
      A: 'Anterior',
      L: 'Left lateral',
      R: 'Right lateral',
      I: 'Inferior',
      S: 'Superior',
      RL: 'Right lateral rotation',
      RR: 'Right rotation',
      PS: 'Posterior-Superior',
      AS: 'Anterior-Superior',
    },
  };

  return descriptions[system][code] || code;
}
