import { z } from 'zod';
import { router, protectedProcedure, providerProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { SpinalRegion } from '@prisma/client';

// Complete spinal segments with anatomical data for diagram rendering
const SPINAL_SEGMENTS = {
  // Cervical
  C1: { name: 'Atlas', region: 'CERVICAL' as SpinalRegion, index: 1, y: { coronal: 5, sagittal: 5 } },
  C2: { name: 'Axis', region: 'CERVICAL' as SpinalRegion, index: 2, y: { coronal: 7, sagittal: 7 } },
  C3: { name: 'C3', region: 'CERVICAL' as SpinalRegion, index: 3, y: { coronal: 9, sagittal: 9 } },
  C4: { name: 'C4', region: 'CERVICAL' as SpinalRegion, index: 4, y: { coronal: 11, sagittal: 11 } },
  C5: { name: 'C5', region: 'CERVICAL' as SpinalRegion, index: 5, y: { coronal: 13, sagittal: 13 } },
  C6: { name: 'C6', region: 'CERVICAL' as SpinalRegion, index: 6, y: { coronal: 15, sagittal: 15 } },
  C7: { name: 'C7', region: 'CERVICAL' as SpinalRegion, index: 7, y: { coronal: 17, sagittal: 17 } },
  // Thoracic
  T1: { name: 'T1', region: 'THORACIC' as SpinalRegion, index: 8, y: { coronal: 20, sagittal: 20 } },
  T2: { name: 'T2', region: 'THORACIC' as SpinalRegion, index: 9, y: { coronal: 24, sagittal: 24 } },
  T3: { name: 'T3', region: 'THORACIC' as SpinalRegion, index: 10, y: { coronal: 28, sagittal: 28 } },
  T4: { name: 'T4', region: 'THORACIC' as SpinalRegion, index: 11, y: { coronal: 32, sagittal: 32 } },
  T5: { name: 'T5', region: 'THORACIC' as SpinalRegion, index: 12, y: { coronal: 36, sagittal: 36 } },
  T6: { name: 'T6', region: 'THORACIC' as SpinalRegion, index: 13, y: { coronal: 40, sagittal: 40 } },
  T7: { name: 'T7', region: 'THORACIC' as SpinalRegion, index: 14, y: { coronal: 44, sagittal: 44 } },
  T8: { name: 'T8', region: 'THORACIC' as SpinalRegion, index: 15, y: { coronal: 48, sagittal: 48 } },
  T9: { name: 'T9', region: 'THORACIC' as SpinalRegion, index: 16, y: { coronal: 52, sagittal: 52 } },
  T10: { name: 'T10', region: 'THORACIC' as SpinalRegion, index: 17, y: { coronal: 56, sagittal: 56 } },
  T11: { name: 'T11', region: 'THORACIC' as SpinalRegion, index: 18, y: { coronal: 60, sagittal: 60 } },
  T12: { name: 'T12', region: 'THORACIC' as SpinalRegion, index: 19, y: { coronal: 64, sagittal: 64 } },
  // Lumbar
  L1: { name: 'L1', region: 'LUMBAR' as SpinalRegion, index: 20, y: { coronal: 70, sagittal: 70 } },
  L2: { name: 'L2', region: 'LUMBAR' as SpinalRegion, index: 21, y: { coronal: 76, sagittal: 76 } },
  L3: { name: 'L3', region: 'LUMBAR' as SpinalRegion, index: 22, y: { coronal: 82, sagittal: 82 } },
  L4: { name: 'L4', region: 'LUMBAR' as SpinalRegion, index: 23, y: { coronal: 88, sagittal: 88 } },
  L5: { name: 'L5', region: 'LUMBAR' as SpinalRegion, index: 24, y: { coronal: 94, sagittal: 94 } },
  // Sacral
  S1: { name: 'S1', region: 'SACRAL' as SpinalRegion, index: 25, y: { coronal: 98, sagittal: 98 } },
  Sacrum: { name: 'Sacrum', region: 'SACRAL' as SpinalRegion, index: 26, y: { coronal: 100, sagittal: 100 } },
  // Pelvis
  'Left Ilium': { name: 'Left Ilium', region: 'PELVIS' as SpinalRegion, index: 27, y: { coronal: 102, sagittal: 102 } },
  'Right Ilium': { name: 'Right Ilium', region: 'PELVIS' as SpinalRegion, index: 28, y: { coronal: 102, sagittal: 102 } },
  Coccyx: { name: 'Coccyx', region: 'PELVIS' as SpinalRegion, index: 29, y: { coronal: 105, sagittal: 105 } },
};

// Severity color mapping
const SEVERITY_COLORS = {
  1: '#22c55e', // Green - normal/minimal
  2: '#84cc16', // Lime - mild
  3: '#f59e0b', // Amber - moderate
  4: '#f97316', // Orange - severe
  5: '#ef4444', // Red - extreme
};

// Validation schemas
const viewSchema = z.enum(['coronal', 'sagittal']);
const spinalRegionSchema = z.enum(['CERVICAL', 'THORACIC', 'LUMBAR', 'SACRAL', 'PELVIS']);

export const spinalAnalysisRouter = router({
  // Get interactive spine diagram data with findings
  getDiagramData: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        encounterId: z.string().optional(),
        view: viewSchema.default('coronal'),
        includeHistory: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, encounterId, view, includeHistory } = input;

      // Verify patient belongs to org
      const patient = await ctx.prisma.patient.findFirst({
        where: { id: patientId, organizationId: ctx.user.organizationId },
        select: {
          id: true,
          demographics: {
            select: { firstName: true, lastName: true },
          },
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Build where clause for findings
      const findingsWhere: Record<string, unknown> = {
        patientId,
        organizationId: ctx.user.organizationId,
      };

      if (encounterId) {
        findingsWhere.encounterId = encounterId;
      }

      // Get subluxations
      const subluxations = await ctx.prisma.subluxation.findMany({
        where: {
          ...findingsWhere,
          isResolved: false,
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          vertebra: true,
          region: true,
          listing: true,
          severity: true,
          notes: true,
          encounterId: true,
          encounter: {
            select: { encounterDate: true },
          },
        },
      });

      // Get vertebral listings
      const listings = await ctx.prisma.vertebralListing.findMany({
        where: findingsWhere,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          segment: true,
          region: true,
          listing: true,
          laterality: true,
          rotation: true,
          fixation: true,
          tenderness: true,
          muscleSpasm: true,
          edema: true,
          encounterId: true,
          encounter: {
            select: { encounterDate: true },
          },
        },
      });

      // Get adjustments if showing history
      let adjustments: Array<{
        id: string;
        vertebra: string;
        region: SpinalRegion;
        response: string;
        encounterId: string;
        encounter: { encounterDate: Date };
        technique: { name: string } | null;
      }> = [];

      if (includeHistory) {
        adjustments = await ctx.prisma.adjustment.findMany({
          where: findingsWhere,
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            vertebra: true,
            region: true,
            response: true,
            encounterId: true,
            encounter: {
              select: { encounterDate: true },
            },
            technique: {
              select: { name: true },
            },
          },
        });
      }

      // Build diagram segments with findings
      const diagramSegments = Object.entries(SPINAL_SEGMENTS).map(([segment, info]) => {
        // Get most recent subluxation for this segment
        const subluxation = subluxations.find(
          (s) => s.vertebra.toUpperCase() === segment.toUpperCase()
        );

        // Get most recent listing for this segment
        const listing = listings.find(
          (l) => l.segment.toUpperCase() === segment.toUpperCase()
        );

        // Get adjustments for this segment
        const segmentAdjustments = adjustments.filter(
          (a) => a.vertebra.toUpperCase() === segment.toUpperCase()
        );

        // Calculate severity color
        let severityColor = SEVERITY_COLORS[1]; // Default green
        let severityLevel = 0;

        if (subluxation) {
          const severityMap: Record<string, number> = {
            MINIMAL: 1,
            MILD: 2,
            MODERATE: 3,
            SEVERE: 4,
            EXTREME: 5,
          };
          severityLevel = severityMap[subluxation.severity] || 0;
          severityColor = SEVERITY_COLORS[severityLevel as keyof typeof SEVERITY_COLORS] || SEVERITY_COLORS[1];
        } else if (listing) {
          // Calculate severity from listing findings
          const findingScore =
            (listing.fixation ? 2 : 0) +
            (listing.muscleSpasm ? 1 : 0) +
            (listing.edema ? 1 : 0) +
            ((listing.tenderness || 0) > 5 ? 2 : (listing.tenderness || 0) > 2 ? 1 : 0);

          if (findingScore >= 4) {
            severityLevel = 4;
            severityColor = SEVERITY_COLORS[4];
          } else if (findingScore >= 2) {
            severityLevel = 3;
            severityColor = SEVERITY_COLORS[3];
          } else if (findingScore >= 1) {
            severityLevel = 2;
            severityColor = SEVERITY_COLORS[2];
          }
        }

        // Calculate position offset based on laterality (coronal) or AP (sagittal)
        let xOffset = 0;
        if (view === 'coronal' && listing?.laterality) {
          xOffset = listing.laterality === 'L' ? -15 : listing.laterality === 'R' ? 15 : 0;
        } else if (view === 'sagittal' && listing?.listing) {
          const listingUpper = listing.listing.toUpperCase();
          if (listingUpper.includes('A') || listingUpper.includes('AS')) {
            xOffset = 15; // Anterior
          } else if (listingUpper.includes('P') || listingUpper.includes('PI')) {
            xOffset = -15; // Posterior
          }
        }

        return {
          segment,
          name: info.name,
          region: info.region,
          index: info.index,
          y: info.y[view],
          xOffset,
          hasFinding: !!(subluxation || listing),
          severityLevel,
          severityColor,
          subluxation: subluxation
            ? {
                id: subluxation.id,
                listing: subluxation.listing,
                severity: subluxation.severity,
                notes: subluxation.notes,
              }
            : null,
          listing: listing
            ? {
                id: listing.id,
                listing: listing.listing,
                laterality: listing.laterality,
                rotation: listing.rotation,
                fixation: listing.fixation,
                tenderness: listing.tenderness,
              }
            : null,
          adjustmentCount: segmentAdjustments.length,
          lastAdjustment: segmentAdjustments[0]
            ? {
                date: segmentAdjustments[0].encounter.encounterDate,
                technique: segmentAdjustments[0].technique?.name,
                response: segmentAdjustments[0].response,
              }
            : null,
        };
      });

      // Sort by index
      diagramSegments.sort((a, b) => a.index - b.index);

      // Group by region
      const byRegion = {
        CERVICAL: diagramSegments.filter((s) => s.region === 'CERVICAL'),
        THORACIC: diagramSegments.filter((s) => s.region === 'THORACIC'),
        LUMBAR: diagramSegments.filter((s) => s.region === 'LUMBAR'),
        SACRAL: diagramSegments.filter((s) => s.region === 'SACRAL'),
        PELVIS: diagramSegments.filter((s) => s.region === 'PELVIS'),
      };

      // Summary stats
      const summary = {
        totalFindings: diagramSegments.filter((s) => s.hasFinding).length,
        bySeverity: {
          minimal: diagramSegments.filter((s) => s.severityLevel === 1 && s.hasFinding).length,
          mild: diagramSegments.filter((s) => s.severityLevel === 2).length,
          moderate: diagramSegments.filter((s) => s.severityLevel === 3).length,
          severe: diagramSegments.filter((s) => s.severityLevel === 4).length,
          extreme: diagramSegments.filter((s) => s.severityLevel === 5).length,
        },
        byRegion: {
          cervical: byRegion.CERVICAL.filter((s) => s.hasFinding).length,
          thoracic: byRegion.THORACIC.filter((s) => s.hasFinding).length,
          lumbar: byRegion.LUMBAR.filter((s) => s.hasFinding).length,
          sacral: byRegion.SACRAL.filter((s) => s.hasFinding).length,
          pelvis: byRegion.PELVIS.filter((s) => s.hasFinding).length,
        },
      };

      return {
        patient: {
          id: patient.id,
          name: `${patient.demographics?.firstName || ''} ${patient.demographics?.lastName || ''}`.trim(),
        },
        view,
        segments: diagramSegments,
        byRegion,
        summary,
        severityLegend: Object.entries(SEVERITY_COLORS).map(([level, color]) => ({
          level: parseInt(level),
          color,
          label: ['', 'Normal', 'Mild', 'Moderate', 'Severe', 'Extreme'][parseInt(level)] || '',
        })),
      };
    }),

  // Export spine diagram to SOAP note format
  exportToSoapNote: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        encounterId: z.string(),
        includeFindings: z.boolean().default(true),
        includeRecommendations: z.boolean().default(true),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, encounterId, includeFindings, includeRecommendations } = input;

      // Verify patient and encounter
      const patient = await ctx.prisma.patient.findFirst({
        where: { id: patientId, organizationId: ctx.user.organizationId },
        select: {
          demographics: {
            select: { firstName: true, lastName: true },
          },
        },
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
        select: { encounterDate: true },
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

      // Get vertebral listings
      const listings = await ctx.prisma.vertebralListing.findMany({
        where: {
          encounterId,
          organizationId: ctx.user.organizationId,
        },
        orderBy: [{ region: 'asc' }, { segment: 'asc' }],
      });

      // Get adjustments
      const adjustments = await ctx.prisma.adjustment.findMany({
        where: {
          encounterId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          technique: {
            select: { name: true },
          },
        },
        orderBy: [{ region: 'asc' }, { vertebra: 'asc' }],
      });

      // Build SOAP note sections
      const sections: string[] = [];

      // Objective section - Spinal Analysis Findings
      if (includeFindings) {
        sections.push('SPINAL ANALYSIS FINDINGS:');
        sections.push('');

        if (subluxations.length > 0) {
          sections.push('Subluxations:');
          const regionGroups = groupByRegion(subluxations, 'region');
          for (const [region, items] of Object.entries(regionGroups)) {
            sections.push(`  ${formatRegion(region)}:`);
            for (const sub of items) {
              sections.push(
                `    - ${sub.vertebra}: ${sub.listing} (${sub.severity.toLowerCase()})${sub.notes ? ` - ${sub.notes}` : ''}`
              );
            }
          }
          sections.push('');
        }

        if (listings.length > 0) {
          sections.push('Vertebral Listings:');
          const regionGroups = groupByRegion(listings, 'region');
          for (const [region, items] of Object.entries(regionGroups)) {
            sections.push(`  ${formatRegion(region)}:`);
            for (const listing of items) {
              const findings: string[] = [];
              if (listing.fixation) findings.push('fixation');
              if (listing.muscleSpasm) findings.push('muscle spasm');
              if (listing.edema) findings.push('edema');
              if (listing.tenderness) findings.push(`tenderness ${listing.tenderness}/10`);
              sections.push(
                `    - ${listing.segment}: ${listing.listing}${findings.length > 0 ? ` (${findings.join(', ')})` : ''}`
              );
            }
          }
          sections.push('');
        }

        if (adjustments.length > 0) {
          sections.push('Adjustments Performed:');
          const regionGroups = groupByRegion(adjustments, 'region');
          for (const [region, items] of Object.entries(regionGroups)) {
            sections.push(`  ${formatRegion(region)}:`);
            for (const adj of items) {
              const details: string[] = [];
              if (adj.technique) details.push(adj.technique.name);
              if (adj.response) details.push(`response: ${adj.response.toLowerCase()}`);
              if (adj.cavitation) details.push('cavitation');
              sections.push(
                `    - ${adj.vertebra}${details.length > 0 ? `: ${details.join(', ')}` : ''}`
              );
            }
          }
          sections.push('');
        }
      }

      // Assessment/Recommendations
      if (includeRecommendations) {
        const findingCount = subluxations.length + listings.length;
        const severeCount = subluxations.filter(
          (s) => s.severity === 'SEVERE' || s.severity === 'EXTREME'
        ).length;

        sections.push('SPINAL ANALYSIS SUMMARY:');
        sections.push(`  Total findings: ${findingCount}`);
        sections.push(`  Adjustments performed: ${adjustments.length}`);

        if (severeCount > 0) {
          sections.push(`  Severe/Extreme findings: ${severeCount} - recommend close monitoring`);
        }

        sections.push('');
      }

      return {
        patientName: `${patient.demographics?.firstName || ''} ${patient.demographics?.lastName || ''}`.trim(),
        encounterDate: encounter.encounterDate,
        content: sections.join('\n'),
        sections: {
          findings: includeFindings,
          recommendations: includeRecommendations,
        },
        counts: {
          subluxations: subluxations.length,
          listings: listings.length,
          adjustments: adjustments.length,
        },
      };
    }),

  // Generate print-ready patient education diagram
  generatePatientEducationDiagram: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        encounterId: z.string().optional(),
        view: viewSchema.default('coronal'),
        includeExplanations: z.boolean().default(true),
        includeProgress: z.boolean().default(false),
        compareEncounterId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, encounterId, view, includeExplanations, includeProgress, compareEncounterId } = input;

      // Verify patient
      const patient = await ctx.prisma.patient.findFirst({
        where: { id: patientId, organizationId: ctx.user.organizationId },
        select: {
          id: true,
          demographics: {
            select: { firstName: true, lastName: true },
          },
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Get current findings
      const findingsWhere: Record<string, unknown> = {
        patientId,
        organizationId: ctx.user.organizationId,
        isResolved: false,
      };

      if (encounterId) {
        findingsWhere.encounterId = encounterId;
      }

      const subluxations = await ctx.prisma.subluxation.findMany({
        where: findingsWhere,
        orderBy: [{ region: 'asc' }, { vertebra: 'asc' }],
      });

      // Get comparison data if requested
      let comparisonSubluxations: typeof subluxations = [];
      if (includeProgress && compareEncounterId) {
        comparisonSubluxations = await ctx.prisma.subluxation.findMany({
          where: {
            patientId,
            organizationId: ctx.user.organizationId,
            encounterId: compareEncounterId,
          },
          orderBy: [{ region: 'asc' }, { vertebra: 'asc' }],
        });
      }

      // Build patient-friendly findings list
      const findings = subluxations.map((sub) => {
        const explanation = getPatientFriendlyExplanation(sub.vertebra, sub.listing, sub.severity);
        const comparisonSub = comparisonSubluxations.find(
          (c) => c.vertebra === sub.vertebra
        );

        let progressNote = '';
        if (comparisonSub) {
          const currentSeverity = getSeverityValue(sub.severity);
          const previousSeverity = getSeverityValue(comparisonSub.severity);
          if (currentSeverity < previousSeverity) {
            progressNote = 'Improved';
          } else if (currentSeverity > previousSeverity) {
            progressNote = 'Needs attention';
          } else {
            progressNote = 'Stable';
          }
        }

        return {
          segment: sub.vertebra,
          region: sub.region,
          listing: sub.listing,
          severity: sub.severity,
          severityColor: SEVERITY_COLORS[getSeverityValue(sub.severity) as keyof typeof SEVERITY_COLORS],
          explanation: includeExplanations ? explanation : undefined,
          progressNote: includeProgress ? progressNote : undefined,
        };
      });

      // Patient-friendly region explanations
      const regionExplanations = {
        CERVICAL: 'The neck area (cervical spine) - affects head, neck, shoulders, and arms',
        THORACIC: 'The mid-back area (thoracic spine) - affects the chest, upper back, and breathing',
        LUMBAR: 'The lower back area (lumbar spine) - affects lower back, hips, and legs',
        SACRAL: 'The base of the spine (sacrum) - affects pelvis and lower body stability',
        PELVIS: 'The pelvic region - affects overall posture and balance',
      };

      // Summary for patient
      const summary = {
        totalAreas: findings.length,
        regionSummary: Object.entries(
          findings.reduce((acc, f) => {
            acc[f.region] = (acc[f.region] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        ).map(([region, count]) => ({
          region,
          count,
          explanation: regionExplanations[region as keyof typeof regionExplanations],
        })),
        overallMessage: getOverallPatientMessage(findings.length, subluxations),
      };

      return {
        title: 'Your Spinal Health Report',
        patient: {
          name: `${patient.demographics?.firstName || ''} ${patient.demographics?.lastName || ''}`.trim(),
        },
        date: new Date(),
        view,
        viewName: view === 'coronal' ? 'Front View' : 'Side View',
        findings,
        summary,
        instructions: [
          'Areas marked in red or orange need the most attention',
          'Green areas indicate healthy spinal segments',
          'Yellow areas show mild issues that we are monitoring',
          'Follow your recommended treatment plan for best results',
        ],
        printable: true,
      };
    }),

  // Get clickable segment info for interactive diagram
  getSegmentDetails: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        segment: z.string(),
        encounterId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, segment, encounterId } = input;

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

      const segmentUpper = segment.toUpperCase();

      // Get all subluxations for this segment
      const subluxations = await ctx.prisma.subluxation.findMany({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
          vertebra: { equals: segmentUpper, mode: 'insensitive' },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          encounter: {
            select: { id: true, encounterDate: true },
          },
        },
      });

      // Get all listings for this segment
      const listings = await ctx.prisma.vertebralListing.findMany({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
          segment: { equals: segmentUpper, mode: 'insensitive' },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          encounter: {
            select: { id: true, encounterDate: true },
          },
        },
      });

      // Get all adjustments for this segment (via encounter relation)
      const adjustments = await ctx.prisma.adjustment.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          vertebra: { equals: segmentUpper, mode: 'insensitive' },
          encounter: {
            patientId,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          technique: {
            select: { name: true, category: true },
          },
          encounter: {
            select: { id: true, encounterDate: true },
          },
        },
      });

      // Get segment info
      const segmentInfo = SPINAL_SEGMENTS[segmentUpper as keyof typeof SPINAL_SEGMENTS];

      // Current status (from most recent or specified encounter)
      const currentSubluxation = encounterId
        ? subluxations.find((s) => s.encounterId === encounterId)
        : subluxations[0];

      const currentListing = encounterId
        ? listings.find((l) => l.encounterId === encounterId)
        : listings[0];

      return {
        segment: segmentUpper,
        name: segmentInfo?.name || segmentUpper,
        region: segmentInfo?.region || 'LUMBAR',
        current: {
          subluxation: currentSubluxation
            ? {
                id: currentSubluxation.id,
                listing: currentSubluxation.listing,
                severity: currentSubluxation.severity,
                notes: currentSubluxation.notes,
                encounterDate: currentSubluxation.encounter.encounterDate,
              }
            : null,
          listing: currentListing
            ? {
                id: currentListing.id,
                listing: currentListing.listing,
                laterality: currentListing.laterality,
                fixation: currentListing.fixation,
                tenderness: currentListing.tenderness,
                encounterDate: currentListing.encounter.encounterDate,
              }
            : null,
        },
        history: {
          subluxationCount: subluxations.length,
          listingCount: listings.length,
          adjustmentCount: adjustments.length,
          lastAdjustment: adjustments[0]
            ? {
                date: adjustments[0].encounter.encounterDate,
                technique: adjustments[0].technique?.name,
                response: adjustments[0].response,
              }
            : null,
        },
        recentAdjustments: adjustments.slice(0, 5).map((a) => ({
          date: a.encounter.encounterDate,
          technique: a.technique?.name,
          response: a.response,
        })),
      };
    }),

  // Get segments list for quick reference
  getSegmentsList: protectedProcedure
    .input(
      z.object({
        region: spinalRegionSchema.optional(),
      })
    )
    .query(({ input }) => {
      let segments = Object.entries(SPINAL_SEGMENTS).map(([key, info]) => ({
        segment: key,
        ...info,
      }));

      if (input.region) {
        segments = segments.filter((s) => s.region === input.region);
      }

      return segments.sort((a, b) => a.index - b.index);
    }),
});

// Helper functions

function groupByRegion<T extends { region: SpinalRegion }>(
  items: T[],
  _key: string
): Record<SpinalRegion, T[]> {
  return items.reduce(
    (acc, item) => {
      if (!acc[item.region]) {
        acc[item.region] = [];
      }
      acc[item.region].push(item);
      return acc;
    },
    {} as Record<SpinalRegion, T[]>
  );
}

function formatRegion(region: string): string {
  return region.charAt(0) + region.slice(1).toLowerCase();
}

function getSeverityValue(severity: string): number {
  const map: Record<string, number> = {
    MINIMAL: 1,
    MILD: 2,
    MODERATE: 3,
    SEVERE: 4,
    EXTREME: 5,
  };
  return map[severity] || 3;
}

function getPatientFriendlyExplanation(
  vertebra: string,
  listing: string,
  severity: string
): string {
  const region = vertebra.toUpperCase().charAt(0);
  let areaDescription = '';

  switch (region) {
    case 'C':
      areaDescription = 'in your neck area';
      break;
    case 'T':
      areaDescription = 'in your mid-back';
      break;
    case 'L':
      areaDescription = 'in your lower back';
      break;
    case 'S':
      areaDescription = 'at the base of your spine';
      break;
    default:
      areaDescription = 'in your spine';
  }

  const severityDescription =
    severity === 'MINIMAL' || severity === 'MILD'
      ? 'minor misalignment'
      : severity === 'MODERATE'
        ? 'moderate misalignment'
        : 'significant misalignment';

  return `There is a ${severityDescription} ${areaDescription} at ${vertebra}. The listing "${listing}" describes the direction of the misalignment.`;
}

function getOverallPatientMessage(
  findingCount: number,
  subluxations: Array<{ severity: string }>
): string {
  if (findingCount === 0) {
    return 'Great news! Your spine shows no significant areas of concern.';
  }

  const severeCount = subluxations.filter(
    (s) => s.severity === 'SEVERE' || s.severity === 'EXTREME'
  ).length;

  if (severeCount > 0) {
    return `We found ${findingCount} area(s) that need attention, including ${severeCount} significant finding(s). Following your treatment plan will help address these issues.`;
  }

  if (findingCount <= 3) {
    return `We found ${findingCount} area(s) of mild to moderate concern. Regular adjustments will help improve these areas.`;
  }

  return `We found ${findingCount} areas throughout your spine that could benefit from care. Your personalized treatment plan will address these systematically.`;
}
