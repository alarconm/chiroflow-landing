import { z } from 'zod';
import { router, protectedProcedure, providerProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import { SpinalRegion } from '@prisma/client';

// Standard listing notations
const GONSTEAD_LISTINGS = {
  // Body position listings
  PLS: { name: 'Posterior-Left-Superior', description: 'Body rotated left and superior', laterality: 'L', rotation: 'S' },
  PRS: { name: 'Posterior-Right-Superior', description: 'Body rotated right and superior', laterality: 'R', rotation: 'S' },
  PLI: { name: 'Posterior-Left-Inferior', description: 'Body rotated left and inferior', laterality: 'L', rotation: 'I' },
  PRI: { name: 'Posterior-Right-Inferior', description: 'Body rotated right and inferior', laterality: 'R', rotation: 'I' },
  // Disc wedging
  AS: { name: 'Anterior-Superior', description: 'Anterior disc wedging with extension', laterality: null, rotation: null },
  PI: { name: 'Posterior-Inferior', description: 'Posterior disc wedging with flexion', laterality: null, rotation: null },
  // Additional
  IN: { name: 'Inferior', description: 'Caudal malposition', laterality: null, rotation: 'I' },
  EX: { name: 'Extension', description: 'Extended position', laterality: null, rotation: null },
  // Compound listings
  'AS-IN': { name: 'Anterior-Superior-Inferior', description: 'Anterior-superior with inferior rotation', laterality: null, rotation: 'I' },
  'AS-EX': { name: 'Anterior-Superior-Extension', description: 'Anterior-superior with extension', laterality: null, rotation: null },
  'PI-IN': { name: 'Posterior-Inferior-Inferior', description: 'Posterior-inferior with inferior rotation', laterality: null, rotation: 'I' },
  'PI-EX': { name: 'Posterior-Inferior-Extension', description: 'Posterior-inferior with extension', laterality: null, rotation: null },
  // Additional Gonstead listings
  'PLS-m': { name: 'Posterior-Left-Superior (major)', description: 'Major subluxation: Body rotated left and superior', laterality: 'L', rotation: 'S' },
  'PRS-m': { name: 'Posterior-Right-Superior (major)', description: 'Major subluxation: Body rotated right and superior', laterality: 'R', rotation: 'S' },
};

const PALMER_LISTINGS = {
  PL: { name: 'Posterior-Left', description: 'Posterior and left malposition', laterality: 'L', rotation: null },
  PR: { name: 'Posterior-Right', description: 'Posterior and right malposition', laterality: 'R', rotation: null },
  P: { name: 'Posterior', description: 'Posterior malposition', laterality: null, rotation: null },
  A: { name: 'Anterior', description: 'Anterior malposition', laterality: null, rotation: null },
  L: { name: 'Left', description: 'Left lateral malposition', laterality: 'L', rotation: null },
  R: { name: 'Right', description: 'Right lateral malposition', laterality: 'R', rotation: null },
  I: { name: 'Inferior', description: 'Inferior malposition', laterality: null, rotation: 'I' },
  S: { name: 'Superior', description: 'Superior malposition', laterality: null, rotation: 'S' },
  RL: { name: 'Right-Lateral', description: 'Right lateral rotation', laterality: 'R', rotation: null },
  RR: { name: 'Right-Rotation', description: 'Right rotation', laterality: 'R', rotation: null },
  PS: { name: 'Posterior-Superior', description: 'Posterior and superior malposition', laterality: null, rotation: 'S' },
  AI: { name: 'Anterior-Inferior', description: 'Anterior and inferior malposition', laterality: null, rotation: 'I' },
};

// Complete spinal segments with anatomical data
const SPINAL_SEGMENTS = {
  // Cervical
  C1: { name: 'Atlas', region: 'CERVICAL' as SpinalRegion, index: 1, related: ['C2', 'Occiput'] },
  C2: { name: 'Axis', region: 'CERVICAL' as SpinalRegion, index: 2, related: ['C1', 'C3'] },
  C3: { name: 'C3', region: 'CERVICAL' as SpinalRegion, index: 3, related: ['C2', 'C4'] },
  C4: { name: 'C4', region: 'CERVICAL' as SpinalRegion, index: 4, related: ['C3', 'C5'] },
  C5: { name: 'C5', region: 'CERVICAL' as SpinalRegion, index: 5, related: ['C4', 'C6'] },
  C6: { name: 'C6', region: 'CERVICAL' as SpinalRegion, index: 6, related: ['C5', 'C7'] },
  C7: { name: 'C7', region: 'CERVICAL' as SpinalRegion, index: 7, related: ['C6', 'T1'] },
  // Thoracic
  T1: { name: 'T1', region: 'THORACIC' as SpinalRegion, index: 8, related: ['C7', 'T2'] },
  T2: { name: 'T2', region: 'THORACIC' as SpinalRegion, index: 9, related: ['T1', 'T3'] },
  T3: { name: 'T3', region: 'THORACIC' as SpinalRegion, index: 10, related: ['T2', 'T4'] },
  T4: { name: 'T4', region: 'THORACIC' as SpinalRegion, index: 11, related: ['T3', 'T5'] },
  T5: { name: 'T5', region: 'THORACIC' as SpinalRegion, index: 12, related: ['T4', 'T6'] },
  T6: { name: 'T6', region: 'THORACIC' as SpinalRegion, index: 13, related: ['T5', 'T7'] },
  T7: { name: 'T7', region: 'THORACIC' as SpinalRegion, index: 14, related: ['T6', 'T8'] },
  T8: { name: 'T8', region: 'THORACIC' as SpinalRegion, index: 15, related: ['T7', 'T9'] },
  T9: { name: 'T9', region: 'THORACIC' as SpinalRegion, index: 16, related: ['T8', 'T10'] },
  T10: { name: 'T10', region: 'THORACIC' as SpinalRegion, index: 17, related: ['T9', 'T11'] },
  T11: { name: 'T11', region: 'THORACIC' as SpinalRegion, index: 18, related: ['T10', 'T12'] },
  T12: { name: 'T12', region: 'THORACIC' as SpinalRegion, index: 19, related: ['T11', 'L1'] },
  // Lumbar
  L1: { name: 'L1', region: 'LUMBAR' as SpinalRegion, index: 20, related: ['T12', 'L2'] },
  L2: { name: 'L2', region: 'LUMBAR' as SpinalRegion, index: 21, related: ['L1', 'L3'] },
  L3: { name: 'L3', region: 'LUMBAR' as SpinalRegion, index: 22, related: ['L2', 'L4'] },
  L4: { name: 'L4', region: 'LUMBAR' as SpinalRegion, index: 23, related: ['L3', 'L5'] },
  L5: { name: 'L5', region: 'LUMBAR' as SpinalRegion, index: 24, related: ['L4', 'S1'] },
  // Sacral
  S1: { name: 'S1', region: 'SACRAL' as SpinalRegion, index: 25, related: ['L5', 'S2'] },
  S2: { name: 'S2', region: 'SACRAL' as SpinalRegion, index: 26, related: ['S1', 'S3'] },
  S3: { name: 'S3', region: 'SACRAL' as SpinalRegion, index: 27, related: ['S2', 'S4'] },
  S4: { name: 'S4', region: 'SACRAL' as SpinalRegion, index: 28, related: ['S3', 'S5'] },
  S5: { name: 'S5', region: 'SACRAL' as SpinalRegion, index: 29, related: ['S4', 'Coccyx'] },
  Sacrum: { name: 'Sacrum', region: 'SACRAL' as SpinalRegion, index: 30, related: ['L5', 'Ilium'] },
  // Pelvis
  Coccyx: { name: 'Coccyx', region: 'PELVIS' as SpinalRegion, index: 31, related: ['S5'] },
  'Left Ilium': { name: 'Left Ilium', region: 'PELVIS' as SpinalRegion, index: 32, related: ['Sacrum', 'Right Ilium'] },
  'Right Ilium': { name: 'Right Ilium', region: 'PELVIS' as SpinalRegion, index: 33, related: ['Sacrum', 'Left Ilium'] },
  Ilium: { name: 'Ilium', region: 'PELVIS' as SpinalRegion, index: 34, related: ['Sacrum'] },
  SI: { name: 'Sacroiliac Joint', region: 'PELVIS' as SpinalRegion, index: 35, related: ['Sacrum', 'Ilium'] },
};

// Biomechanical relationships - segments that commonly have compensatory patterns
const BIOMECHANICAL_RELATIONSHIPS: Record<string, { compensatory: string[]; functional: string[]; reason: string }> = {
  C1: {
    compensatory: ['C2', 'Occiput'],
    functional: ['C5', 'C6', 'T4'],
    reason: 'Atlas subluxation often causes lower cervical and mid-thoracic compensation'
  },
  C2: {
    compensatory: ['C1', 'C3'],
    functional: ['L5', 'Sacrum'],
    reason: 'Axis subluxation affects global spinal balance including lumbosacral junction'
  },
  C5: {
    compensatory: ['C4', 'C6'],
    functional: ['T1', 'L3'],
    reason: 'Mid-cervical affects cervicothoracic junction and lumbar curve'
  },
  C7: {
    compensatory: ['C6', 'T1'],
    functional: ['L4', 'L5'],
    reason: 'Cervicothoracic junction often paired with lower lumbar findings'
  },
  T4: {
    compensatory: ['T3', 'T5'],
    functional: ['T9', 'L1'],
    reason: 'Upper thoracic apex affects thoracolumbar transition'
  },
  T12: {
    compensatory: ['T11', 'L1'],
    functional: ['C7', 'T4'],
    reason: 'Thoracolumbar junction affects entire spinal mechanics'
  },
  L4: {
    compensatory: ['L3', 'L5'],
    functional: ['T12', 'Sacrum'],
    reason: 'L4 affects both thoracolumbar and lumbosacral regions'
  },
  L5: {
    compensatory: ['L4', 'S1'],
    functional: ['C2', 'T12'],
    reason: 'Lumbosacral junction has global spinal implications'
  },
  Sacrum: {
    compensatory: ['L5', 'Left Ilium', 'Right Ilium'],
    functional: ['C2', 'Occiput'],
    reason: 'Sacral subluxation affects entire spinal mechanics via dural attachments'
  },
  'Left Ilium': {
    compensatory: ['Sacrum', 'Right Ilium'],
    functional: ['L5', 'T12'],
    reason: 'Pelvic tilt affects lumbar and thoracolumbar mechanics'
  },
  'Right Ilium': {
    compensatory: ['Sacrum', 'Left Ilium'],
    functional: ['L5', 'T12'],
    reason: 'Pelvic tilt affects lumbar and thoracolumbar mechanics'
  },
};

// Validation schemas
const spinalRegionSchema = z.enum(['CERVICAL', 'THORACIC', 'LUMBAR', 'SACRAL', 'PELVIS']);
const gonsteadListingSchema = z.enum(['PLS', 'PRS', 'PLI', 'PRI', 'AS', 'PI', 'IN', 'EX', 'AS-IN', 'AS-EX', 'PI-IN', 'PI-EX', 'PLS-m', 'PRS-m']);
const palmerListingSchema = z.enum(['PL', 'PR', 'P', 'A', 'L', 'R', 'I', 'S', 'RL', 'RR', 'PS', 'AI']);

// Helper to determine region from segment
function getRegionFromSegment(segment: string): SpinalRegion {
  const upper = segment.toUpperCase();
  if (upper.startsWith('C') && /^C[1-7]$/i.test(upper)) return 'CERVICAL';
  if (upper.startsWith('T') && /^T([1-9]|1[0-2])$/i.test(upper)) return 'THORACIC';
  if (upper.startsWith('L') && /^L[1-5]$/i.test(upper)) return 'LUMBAR';
  if (upper === 'SACRUM' || upper.startsWith('S') && /^S[1-5]$/i.test(upper)) return 'SACRAL';
  if (['ILIUM', 'ISCHIUM', 'PUBIS', 'COCCYX', 'PELVIS', 'SI', 'LEFT ILIUM', 'RIGHT ILIUM'].includes(upper)) return 'PELVIS';
  if (upper.includes('SACR')) return 'SACRAL';
  if (upper.includes('PELV') || upper.includes('ILI')) return 'PELVIS';
  return 'LUMBAR';
}

// Parse listing to extract components
function parseListingNotation(listing: string): { laterality: string | null; rotation: string | null; type: 'gonstead' | 'palmer' | 'custom' } {
  const upper = listing.toUpperCase();

  // Check Gonstead first
  if (GONSTEAD_LISTINGS[upper as keyof typeof GONSTEAD_LISTINGS]) {
    const g = GONSTEAD_LISTINGS[upper as keyof typeof GONSTEAD_LISTINGS];
    return { laterality: g.laterality, rotation: g.rotation, type: 'gonstead' };
  }

  // Check Palmer
  if (PALMER_LISTINGS[upper as keyof typeof PALMER_LISTINGS]) {
    const p = PALMER_LISTINGS[upper as keyof typeof PALMER_LISTINGS];
    return { laterality: p.laterality, rotation: p.rotation, type: 'palmer' };
  }

  // Custom - attempt to parse
  const laterality = upper.includes('L') ? 'L' : upper.includes('R') ? 'R' : null;
  const rotation = upper.includes('S') ? 'S' : upper.includes('I') ? 'I' : null;

  return { laterality, rotation, type: 'custom' };
}

export const vertebralListingRouter = router({
  // Create a new vertebral listing
  create: providerProcedure
    .input(
      z.object({
        patientId: z.string(),
        encounterId: z.string(),
        segment: z.string().min(1, 'Segment is required'),
        listing: z.string().min(1, 'Listing is required'),
        palmerListing: z.string().optional(),
        // Positional analysis
        flexion: z.boolean().default(false),
        extension: z.boolean().default(false),
        lateralFlexion: z.enum(['Left', 'Right']).optional(),
        rotationDir: z.enum(['Left', 'Right']).optional(),
        // Additional findings
        fixation: z.boolean().default(false),
        hypermobility: z.boolean().default(false),
        edema: z.boolean().default(false),
        tenderness: z.number().min(0).max(10).optional(),
        muscleSpasm: z.boolean().default(false),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        patientId, encounterId, segment, listing, palmerListing,
        flexion, extension, lateralFlexion, rotationDir,
        fixation, hypermobility, edema, tenderness, muscleSpasm, notes
      } = input;

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

      // Check encounter is not signed
      if (encounter.status === 'SIGNED' || encounter.status === 'AMENDED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot add listing to a signed encounter',
        });
      }

      // Check for existing listing at same segment in this encounter
      const existing = await ctx.prisma.vertebralListing.findFirst({
        where: {
          encounterId,
          segment: { equals: segment, mode: 'insensitive' },
        },
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Listing already documented for ${segment} in this encounter. Use update to modify.`,
        });
      }

      // Parse listing notation
      const parsed = parseListingNotation(listing);
      const region = getRegionFromSegment(segment);

      // Create vertebral listing
      const vertebralListing = await ctx.prisma.vertebralListing.create({
        data: {
          segment: segment.toUpperCase(),
          region,
          listing: listing.toUpperCase(),
          laterality: parsed.laterality,
          rotation: parsed.rotation,
          palmerListing: palmerListing?.toUpperCase(),
          flexion,
          extension,
          lateralFlexion,
          rotationDir,
          fixation,
          hypermobility,
          edema,
          tenderness,
          muscleSpasm,
          notes,
          patientId,
          encounterId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          encounter: {
            select: { id: true, encounterDate: true },
          },
        },
      });

      await auditLog('CREATE', 'VertebralListing', {
        entityId: vertebralListing.id,
        changes: { segment, listing, region },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      // Get related segments for suggestions
      const relatedSegments = getRelatedSegments(segment);

      return {
        ...vertebralListing,
        listingInfo: getListingInfo(listing),
        relatedSegments,
      };
    }),

  // Update vertebral listing
  update: providerProcedure
    .input(
      z.object({
        id: z.string(),
        listing: z.string().optional(),
        palmerListing: z.string().optional(),
        flexion: z.boolean().optional(),
        extension: z.boolean().optional(),
        lateralFlexion: z.enum(['Left', 'Right']).nullish(),
        rotationDir: z.enum(['Left', 'Right']).nullish(),
        fixation: z.boolean().optional(),
        hypermobility: z.boolean().optional(),
        edema: z.boolean().optional(),
        tenderness: z.number().min(0).max(10).nullish(),
        muscleSpasm: z.boolean().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, listing, palmerListing, ...rest } = input;

      // Get existing listing
      const existing = await ctx.prisma.vertebralListing.findFirst({
        where: {
          id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          encounter: true,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Vertebral listing not found',
        });
      }

      // Check encounter is not signed
      if (existing.encounter.status === 'SIGNED' || existing.encounter.status === 'AMENDED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot modify listing in a signed encounter',
        });
      }

      // Build update data
      const updateData: Record<string, unknown> = {};
      const changes: Record<string, unknown> = {};

      if (listing !== undefined) {
        const parsed = parseListingNotation(listing);
        updateData.listing = listing.toUpperCase();
        updateData.laterality = parsed.laterality;
        updateData.rotation = parsed.rotation;
        changes.listing = { from: existing.listing, to: listing.toUpperCase() };
      }

      if (palmerListing !== undefined) {
        updateData.palmerListing = palmerListing?.toUpperCase() || null;
      }

      // Handle optional fields
      Object.entries(rest).forEach(([key, value]) => {
        if (value !== undefined) {
          updateData[key] = value;
          if ((existing as Record<string, unknown>)[key] !== value) {
            changes[key] = { from: (existing as Record<string, unknown>)[key], to: value };
          }
        }
      });

      const vertebralListing = await ctx.prisma.vertebralListing.update({
        where: { id },
        data: updateData,
        include: {
          encounter: {
            select: { id: true, encounterDate: true },
          },
        },
      });

      if (Object.keys(changes).length > 0) {
        await auditLog('UPDATE', 'VertebralListing', {
          entityId: id,
          changes,
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });
      }

      return {
        ...vertebralListing,
        listingInfo: getListingInfo(vertebralListing.listing),
      };
    }),

  // List vertebral listings for a patient or encounter
  list: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        encounterId: z.string().optional(),
        region: spinalRegionSchema.optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, encounterId, region, limit, offset } = input;

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

      if (encounterId) {
        where.encounterId = encounterId;
      }

      if (region) {
        where.region = region;
      }

      const [listings, total] = await Promise.all([
        ctx.prisma.vertebralListing.findMany({
          where,
          orderBy: [{ region: 'asc' }, { segment: 'asc' }, { createdAt: 'desc' }],
          take: limit,
          skip: offset,
          include: {
            encounter: {
              select: {
                id: true,
                encounterDate: true,
              },
            },
          },
        }),
        ctx.prisma.vertebralListing.count({ where }),
      ]);

      // Group by region
      type ListingWithInfo = (typeof listings)[0] & { listingInfo: ReturnType<typeof getListingInfo> };
      const byRegion = listings.reduce(
        (acc, listing) => {
          if (!acc[listing.region]) {
            acc[listing.region] = [];
          }
          acc[listing.region].push({
            ...listing,
            listingInfo: getListingInfo(listing.listing),
          } as ListingWithInfo);
          return acc;
        },
        {} as Record<SpinalRegion, ListingWithInfo[]>
      );

      return {
        listings: listings.map((l) => ({
          ...l,
          listingInfo: getListingInfo(l.listing),
        })),
        byRegion,
        total,
        limit,
        offset,
        hasMore: offset + listings.length < total,
      };
    }),

  // Get single vertebral listing
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const listing = await ctx.prisma.vertebralListing.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
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
                },
              },
            },
          },
        },
      });

      if (!listing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Vertebral listing not found',
        });
      }

      const relatedSegments = getRelatedSegments(listing.segment);

      return {
        ...listing,
        listingInfo: getListingInfo(listing.listing),
        palmerInfo: listing.palmerListing ? getListingInfo(listing.palmerListing, 'palmer') : null,
        relatedSegments,
      };
    }),

  // Compare listings across visits
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

      // Get listings for both encounters
      const [listings1, listings2] = await Promise.all([
        ctx.prisma.vertebralListing.findMany({
          where: { ...whereBase, encounterId: encounter1Id },
          orderBy: [{ region: 'asc' }, { segment: 'asc' }],
        }),
        ctx.prisma.vertebralListing.findMany({
          where: { ...whereBase, encounterId: encounter2Id },
          orderBy: [{ region: 'asc' }, { segment: 'asc' }],
        }),
      ]);

      // Create comparison map
      const segmentMap = new Map<string, { visit1: typeof listings1[0] | null; visit2: typeof listings2[0] | null }>();

      // Add visit 1 listings
      for (const listing of listings1) {
        segmentMap.set(listing.segment, { visit1: listing, visit2: null });
      }

      // Add visit 2 listings
      for (const listing of listings2) {
        const existing = segmentMap.get(listing.segment);
        if (existing) {
          existing.visit2 = listing;
        } else {
          segmentMap.set(listing.segment, { visit1: null, visit2: listing });
        }
      }

      // Build comparison results
      const comparisons = Array.from(segmentMap.entries()).map(([segment, { visit1, visit2 }]) => {
        let status: 'new' | 'resolved' | 'changed' | 'unchanged';
        let changes: string[] = [];

        if (!visit1 && visit2) {
          status = 'new';
        } else if (visit1 && !visit2) {
          status = 'resolved';
        } else if (visit1 && visit2) {
          // Check what changed
          if (visit1.listing !== visit2.listing) {
            changes.push(`Listing: ${visit1.listing} → ${visit2.listing}`);
          }
          if (visit1.fixation !== visit2.fixation) {
            changes.push(`Fixation: ${visit1.fixation} → ${visit2.fixation}`);
          }
          if (visit1.tenderness !== visit2.tenderness) {
            changes.push(`Tenderness: ${visit1.tenderness || 0} → ${visit2.tenderness || 0}`);
          }
          if (visit1.edema !== visit2.edema) {
            changes.push(`Edema: ${visit1.edema} → ${visit2.edema}`);
          }
          if (visit1.muscleSpasm !== visit2.muscleSpasm) {
            changes.push(`Muscle Spasm: ${visit1.muscleSpasm} → ${visit2.muscleSpasm}`);
          }

          status = changes.length > 0 ? 'changed' : 'unchanged';
        } else {
          status = 'unchanged';
        }

        return {
          segment,
          region: visit1?.region || visit2?.region,
          visit1: visit1
            ? {
                ...visit1,
                listingInfo: getListingInfo(visit1.listing),
              }
            : null,
          visit2: visit2
            ? {
                ...visit2,
                listingInfo: getListingInfo(visit2.listing),
              }
            : null,
          status,
          changes,
          listingChanged: visit1 && visit2 ? visit1.listing !== visit2.listing : false,
        };
      });

      // Sort by region then segment
      const regionOrder: Record<SpinalRegion, number> = {
        CERVICAL: 1,
        THORACIC: 2,
        LUMBAR: 3,
        SACRAL: 4,
        PELVIS: 5,
      };

      comparisons.sort((a, b) => {
        const regionDiff = regionOrder[a.region as SpinalRegion] - regionOrder[b.region as SpinalRegion];
        if (regionDiff !== 0) return regionDiff;
        return a.segment.localeCompare(b.segment);
      });

      // Summary stats
      const summary = {
        total: comparisons.length,
        new: comparisons.filter((c) => c.status === 'new').length,
        resolved: comparisons.filter((c) => c.status === 'resolved').length,
        changed: comparisons.filter((c) => c.status === 'changed').length,
        unchanged: comparisons.filter((c) => c.status === 'unchanged').length,
      };

      return {
        encounter1: {
          id: encounter1.id,
          date: encounter1.encounterDate,
          listingCount: listings1.length,
        },
        encounter2: {
          id: encounter2.id,
          date: encounter2.encounterDate,
          listingCount: listings2.length,
        },
        comparisons,
        summary,
      };
    }),

  // Delete vertebral listing
  delete: providerProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const listing = await ctx.prisma.vertebralListing.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          encounter: true,
        },
      });

      if (!listing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Vertebral listing not found',
        });
      }

      if (listing.encounter.status === 'SIGNED' || listing.encounter.status === 'AMENDED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot delete listing from a signed encounter',
        });
      }

      await auditLog('DELETE', 'VertebralListing', {
        entityId: input.id,
        changes: { segment: listing.segment, listing: listing.listing },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      await ctx.prisma.vertebralListing.delete({ where: { id: input.id } });

      return { success: true };
    }),

  // Get listing notation reference (Gonstead)
  getGonsteadNotations: protectedProcedure.query(() => {
    return Object.entries(GONSTEAD_LISTINGS).map(([code, info]) => ({
      code,
      ...info,
    }));
  }),

  // Get listing notation reference (Palmer)
  getPalmerNotations: protectedProcedure.query(() => {
    return Object.entries(PALMER_LISTINGS).map(([code, info]) => ({
      code,
      ...info,
    }));
  }),

  // Get all spinal segments with metadata
  getSpinalSegments: protectedProcedure.query(() => {
    return Object.entries(SPINAL_SEGMENTS).map(([segment, info]) => ({
      segment,
      ...info,
    }));
  }),

  // Get spine diagram data for visualization
  getSpineDiagramData: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        encounterId: z.string().optional(),
        view: z.enum(['sagittal', 'coronal']).default('coronal'),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, encounterId, view } = input;

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

      if (encounterId) {
        where.encounterId = encounterId;
      }

      // Get listings
      const listings = await ctx.prisma.vertebralListing.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
      });

      // Get most recent listing per segment
      const latestBySegment = new Map<string, typeof listings[0]>();
      for (const listing of listings) {
        if (!latestBySegment.has(listing.segment)) {
          latestBySegment.set(listing.segment, listing);
        }
      }

      // Build diagram data with all segments
      const diagramData = Object.entries(SPINAL_SEGMENTS).map(([segment, info]) => {
        const listing = latestBySegment.get(segment);

        // Calculate position indicators based on view
        let position = { x: 0, y: 0 };
        if (view === 'coronal') {
          // Front view - x is left/right deviation
          if (listing?.laterality === 'L') {
            position.x = -10;
          } else if (listing?.laterality === 'R') {
            position.x = 10;
          }
        } else {
          // Side view - x is anterior/posterior
          if (listing?.listing.includes('A') || listing?.listing.includes('AS')) {
            position.x = 10;
          } else if (listing?.listing.includes('P') || listing?.listing.includes('PI')) {
            position.x = -10;
          }
        }

        // Determine severity color based on findings
        let severityColor = '#22c55e'; // Green - normal
        if (listing) {
          const severityScore =
            (listing.fixation ? 2 : 0) +
            (listing.edema ? 1 : 0) +
            (listing.muscleSpasm ? 1 : 0) +
            ((listing.tenderness || 0) > 5 ? 2 : (listing.tenderness || 0) > 2 ? 1 : 0);

          if (severityScore >= 4) {
            severityColor = '#ef4444'; // Red - severe
          } else if (severityScore >= 2) {
            severityColor = '#f59e0b'; // Amber - moderate
          } else if (severityScore >= 1) {
            severityColor = '#84cc16'; // Lime - mild
          }
        }

        return {
          segment,
          name: info.name,
          region: info.region,
          index: info.index,
          hasListing: !!listing,
          listing: listing ? {
            id: listing.id,
            listing: listing.listing,
            laterality: listing.laterality,
            rotation: listing.rotation,
            fixation: listing.fixation,
            edema: listing.edema,
            tenderness: listing.tenderness,
            muscleSpasm: listing.muscleSpasm,
          } : null,
          position,
          severityColor,
        };
      });

      // Sort by index for proper spine order
      diagramData.sort((a, b) => a.index - b.index);

      return {
        view,
        segments: diagramData,
        affectedCount: Array.from(latestBySegment.values()).length,
        regions: {
          CERVICAL: diagramData.filter(d => d.region === 'CERVICAL'),
          THORACIC: diagramData.filter(d => d.region === 'THORACIC'),
          LUMBAR: diagramData.filter(d => d.region === 'LUMBAR'),
          SACRAL: diagramData.filter(d => d.region === 'SACRAL'),
          PELVIS: diagramData.filter(d => d.region === 'PELVIS'),
        },
      };
    }),

  // Get related/suggested segments based on biomechanics
  getSuggestedSegments: protectedProcedure
    .input(
      z.object({
        segment: z.string(),
        patientId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { segment, patientId } = input;

      const suggestions = getRelatedSegments(segment);

      // If patient provided, check which suggested segments already have findings
      if (patientId) {
        const existingListings = await ctx.prisma.vertebralListing.findMany({
          where: {
            patientId,
            organizationId: ctx.user.organizationId,
            segment: {
              in: [...suggestions.compensatory.map(s => s.segment), ...suggestions.functional.map(s => s.segment)],
            },
          },
          select: { segment: true },
        });

        const existingSet = new Set(existingListings.map(l => l.segment));

        return {
          ...suggestions,
          compensatory: suggestions.compensatory.map(s => ({
            ...s,
            hasExistingFinding: existingSet.has(s.segment),
          })),
          functional: suggestions.functional.map(s => ({
            ...s,
            hasExistingFinding: existingSet.has(s.segment),
          })),
        };
      }

      return suggestions;
    }),

  // Bulk create listings from quick entry
  bulkCreate: providerProcedure
    .input(
      z.object({
        patientId: z.string(),
        encounterId: z.string(),
        listings: z.array(
          z.object({
            segment: z.string(),
            listing: z.string(),
            palmerListing: z.string().optional(),
            fixation: z.boolean().optional(),
            tenderness: z.number().min(0).max(10).optional(),
            notes: z.string().optional(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, encounterId, listings } = input;

      // Verify patient and encounter
      const patient = await ctx.prisma.patient.findFirst({
        where: { id: patientId, organizationId: ctx.user.organizationId },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

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

      if (encounter.status === 'SIGNED' || encounter.status === 'AMENDED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot add listings to a signed encounter',
        });
      }

      // Check for existing listings
      const existingListings = await ctx.prisma.vertebralListing.findMany({
        where: {
          encounterId,
          segment: { in: listings.map(l => l.segment.toUpperCase()) },
        },
        select: { segment: true },
      });

      const existingSet = new Set(existingListings.map(l => l.segment));
      const newListings = listings.filter(l => !existingSet.has(l.segment.toUpperCase()));

      if (newListings.length === 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'All specified segments already have listings in this encounter',
        });
      }

      // Create listings
      const created = await ctx.prisma.$transaction(
        newListings.map(l => {
          const parsed = parseListingNotation(l.listing);
          const region = getRegionFromSegment(l.segment);

          return ctx.prisma.vertebralListing.create({
            data: {
              segment: l.segment.toUpperCase(),
              region,
              listing: l.listing.toUpperCase(),
              laterality: parsed.laterality,
              rotation: parsed.rotation,
              palmerListing: l.palmerListing?.toUpperCase(),
              fixation: l.fixation || false,
              tenderness: l.tenderness,
              notes: l.notes,
              patientId,
              encounterId,
              organizationId: ctx.user.organizationId,
            },
          });
        })
      );

      await auditLog('CREATE', 'VertebralListing', {
        entityId: 'bulk',
        changes: { count: created.length, segments: created.map(c => c.segment) },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        created: created.length,
        skipped: listings.length - newListings.length,
        listings: created.map(l => ({
          ...l,
          listingInfo: getListingInfo(l.listing),
        })),
      };
    }),
});

// Helper to get listing info
function getListingInfo(listing: string, system?: 'gonstead' | 'palmer'): { code: string; name: string; description: string; type: string } {
  const upper = listing.toUpperCase();

  // Check Gonstead
  if (!system || system === 'gonstead') {
    const gonstead = GONSTEAD_LISTINGS[upper as keyof typeof GONSTEAD_LISTINGS];
    if (gonstead) {
      return {
        code: upper,
        name: gonstead.name,
        description: gonstead.description,
        type: 'gonstead',
      };
    }
  }

  // Check Palmer
  if (!system || system === 'palmer') {
    const palmer = PALMER_LISTINGS[upper as keyof typeof PALMER_LISTINGS];
    if (palmer) {
      return {
        code: upper,
        name: palmer.name,
        description: palmer.description,
        type: 'palmer',
      };
    }
  }

  return {
    code: upper,
    name: upper,
    description: 'Custom listing notation',
    type: 'custom',
  };
}

// Helper to get related segments
function getRelatedSegments(segment: string): { compensatory: Array<{ segment: string; reason: string }>; functional: Array<{ segment: string; reason: string }>; biomechanicalReason: string | null } {
  const upper = segment.toUpperCase();

  // Get from biomechanical relationships
  const relationships = BIOMECHANICAL_RELATIONSHIPS[upper];

  if (relationships) {
    return {
      compensatory: relationships.compensatory.map(s => ({
        segment: s,
        reason: 'Adjacent segment - often affected together',
      })),
      functional: relationships.functional.map(s => ({
        segment: s,
        reason: 'Functional relationship - check for compensation pattern',
      })),
      biomechanicalReason: relationships.reason,
    };
  }

  // Default: suggest adjacent segments
  const segmentInfo = SPINAL_SEGMENTS[upper as keyof typeof SPINAL_SEGMENTS];
  if (segmentInfo) {
    return {
      compensatory: segmentInfo.related.map(s => ({
        segment: s,
        reason: 'Adjacent segment',
      })),
      functional: [],
      biomechanicalReason: null,
    };
  }

  return {
    compensatory: [],
    functional: [],
    biomechanicalReason: null,
  };
}
