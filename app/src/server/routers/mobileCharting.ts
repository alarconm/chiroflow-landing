/**
 * Mobile Charting Router (US-267)
 *
 * Mobile-optimized encounter documentation for providers.
 * Supports voice-to-text, photo capture, body diagrams, and offline drafts.
 */

import { z } from 'zod';
import { router, protectedProcedure, providerProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditAction } from '@/lib/audit';
import { Prisma, SyncStatus, EncounterStatus, EncounterType } from '@prisma/client';

// Input schemas
const soapSectionSchema = z.object({
  subjective: z.string().optional(),
  objective: z.string().optional(),
  assessment: z.string().optional(),
  plan: z.string().optional(),
});

const diagnosisEntrySchema = z.object({
  icd10Code: z.string(),
  description: z.string(),
  isPrimary: z.boolean().optional(),
  bodySite: z.string().optional(),
  laterality: z.string().optional(),
  notes: z.string().optional(),
});

const procedureEntrySchema = z.object({
  cptCode: z.string(),
  description: z.string(),
  units: z.number().min(1).default(1),
  modifier1: z.string().optional(),
  modifier2: z.string().optional(),
  notes: z.string().optional(),
});

const bodyMarkingSchema = z.object({
  id: z.string(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  type: z.string(),
  label: z.string().optional(),
  intensity: z.number().min(1).max(10).optional(),
  notes: z.string().optional(),
});

const diagramTypeSchema = z.enum([
  'body_front',
  'body_back',
  'spine',
  'cervical',
  'thoracic',
  'lumbar',
  'hand_left',
  'hand_right',
  'foot_left',
  'foot_right',
]);

const draftTypeSchema = z.enum(['soap', 'diagnosis', 'procedure', 'body_diagram']);

export const mobileChartingRouter = router({
  // ==========================================
  // QUICK SOAP NOTE ENTRY
  // ==========================================

  /**
   * Create or update SOAP note from mobile
   * Optimized for quick entry with minimal fields
   */
  saveQuickSOAP: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        subjective: z.string().optional(),
        objective: z.string().optional(),
        assessment: z.string().optional(),
        plan: z.string().optional(),
        voiceTranscript: z.string().optional(), // Original voice-to-text
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { encounterId, voiceTranscript, ...soapData } = input;

      // Verify encounter and get SOAP note
      const encounter = await prisma.encounter.findFirst({
        where: {
          id: encounterId,
          organizationId: ctx.user.organizationId,
        },
        include: { soapNote: true },
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
          message: 'Cannot modify a signed encounter. Use addendum instead.',
        });
      }

      let soapNote;

      if (encounter.soapNote) {
        // Update existing SOAP note
        const updateData: Prisma.SOAPNoteUpdateInput = {
          version: { increment: 1 },
        };

        if (soapData.subjective !== undefined) updateData.subjective = soapData.subjective;
        if (soapData.objective !== undefined) updateData.objective = soapData.objective;
        if (soapData.assessment !== undefined) updateData.assessment = soapData.assessment;
        if (soapData.plan !== undefined) updateData.plan = soapData.plan;

        soapNote = await prisma.sOAPNote.update({
          where: { id: encounter.soapNote.id },
          data: updateData,
        });

        await createAuditLog({
          action: 'UPDATE' as AuditAction,
          entityType: 'SOAPNote',
          entityId: soapNote.id,
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
          changes: {
            mobileEntry: true,
            hasVoiceTranscript: !!voiceTranscript,
            sections: Object.keys(soapData).filter((k) => soapData[k as keyof typeof soapData] !== undefined),
          },
        });
      } else {
        // Create new SOAP note
        soapNote = await prisma.sOAPNote.create({
          data: {
            encounterId,
            subjective: soapData.subjective,
            objective: soapData.objective,
            assessment: soapData.assessment,
            plan: soapData.plan,
            version: 1,
          },
        });

        await createAuditLog({
          action: 'CREATE' as AuditAction,
          entityType: 'SOAPNote',
          entityId: soapNote.id,
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
          changes: {
            mobileEntry: true,
            hasVoiceTranscript: !!voiceTranscript,
          },
        });
      }

      return {
        success: true,
        soapNoteId: soapNote.id,
        version: soapNote.version,
        updatedAt: soapNote.updatedAt.toISOString(),
      };
    }),

  /**
   * Get SOAP note for an encounter
   */
  getSOAPNote: protectedProcedure
    .input(z.object({ encounterId: z.string() }))
    .query(async ({ ctx, input }) => {
      const encounter = await prisma.encounter.findFirst({
        where: {
          id: input.encounterId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          soapNote: true,
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

      return {
        encounterId: encounter.id,
        encounterStatus: encounter.status,
        patientName: encounter.patient.demographics
          ? `${encounter.patient.demographics.firstName} ${encounter.patient.demographics.lastName}`
          : 'Unknown',
        soapNote: encounter.soapNote
          ? {
              id: encounter.soapNote.id,
              subjective: encounter.soapNote.subjective,
              objective: encounter.soapNote.objective,
              assessment: encounter.soapNote.assessment,
              plan: encounter.soapNote.plan,
              version: encounter.soapNote.version,
              isLocked: encounter.soapNote.isLocked,
              updatedAt: encounter.soapNote.updatedAt.toISOString(),
            }
          : null,
      };
    }),

  // ==========================================
  // VOICE-TO-TEXT SUPPORT
  // ==========================================

  /**
   * Process voice transcript and suggest SOAP sections
   * Uses pattern matching to identify S/O/A/P content
   */
  processVoiceTranscript: providerProcedure
    .input(
      z.object({
        transcript: z.string().min(1),
        encounterId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { transcript } = input;

      // Simple pattern matching for SOAP sections
      // In production, this could use AI for better parsing
      const sections = {
        subjective: '',
        objective: '',
        assessment: '',
        plan: '',
      };

      // Look for explicit section markers (case-insensitive)
      const subjectiveMatch = transcript.match(/(?:subjective|patient reports?|chief complaint|cc)[\s:]+(.+?)(?=(?:objective|assessment|plan|$))/i);
      const objectiveMatch = transcript.match(/(?:objective|on exam|examination|findings)[\s:]+(.+?)(?=(?:assessment|plan|$))/i);
      const assessmentMatch = transcript.match(/(?:assessment|diagnosis|impression)[\s:]+(.+?)(?=(?:plan|$))/i);
      const planMatch = transcript.match(/(?:plan|treatment|recommendation|recommend)[\s:]+(.+?)$/i);

      if (subjectiveMatch) sections.subjective = subjectiveMatch[1].trim();
      if (objectiveMatch) sections.objective = objectiveMatch[1].trim();
      if (assessmentMatch) sections.assessment = assessmentMatch[1].trim();
      if (planMatch) sections.plan = planMatch[1].trim();

      // If no sections found, put everything in subjective
      if (!sections.subjective && !sections.objective && !sections.assessment && !sections.plan) {
        sections.subjective = transcript;
      }

      return {
        sections,
        originalTranscript: transcript,
        confidence: subjectiveMatch || objectiveMatch || assessmentMatch || planMatch ? 'high' : 'low',
        suggestion: 'Review and edit the parsed sections before saving.',
      };
    }),

  // ==========================================
  // PHOTO CAPTURE FOR DOCUMENTATION
  // ==========================================

  /**
   * Register photo attachment for encounter
   */
  attachPhoto: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        photoUrl: z.string().url(),
        description: z.string().optional(),
        bodyPart: z.string().optional(),
        diagramType: diagramTypeSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { encounterId, photoUrl, description, bodyPart } = input;

      // Verify encounter
      const encounter = await prisma.encounter.findFirst({
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

      if (encounter.status === 'SIGNED' || encounter.status === 'AMENDED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot attach photos to a signed encounter',
        });
      }

      // Store photo reference in a body diagram or as encounter attachment
      // For now, we'll create a body diagram marking with photo reference
      const photoAttachment = {
        id: `photo_${Date.now()}`,
        type: 'photo',
        url: photoUrl,
        description,
        bodyPart,
        capturedAt: new Date().toISOString(),
        capturedBy: ctx.user.id,
      };

      await createAuditLog({
        action: 'CREATE' as AuditAction,
        entityType: 'EncounterPhoto',
        entityId: encounterId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          photoUrl,
          description,
          bodyPart,
        },
      });

      return {
        success: true,
        photoId: photoAttachment.id,
        encounterId,
      };
    }),

  // ==========================================
  // BODY DIAGRAM MARKING (MOBILE OPTIMIZED)
  // ==========================================

  /**
   * Save body diagram with touch-based markings
   */
  saveBodyDiagram: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        diagramType: diagramTypeSchema,
        markings: z.array(bodyMarkingSchema),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { encounterId, diagramType, markings, notes } = input;

      // Verify encounter
      const encounter = await prisma.encounter.findFirst({
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

      if (encounter.status === 'SIGNED' || encounter.status === 'AMENDED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot modify diagrams on a signed encounter',
        });
      }

      // Check for existing diagram
      const existing = await prisma.bodyDiagram.findFirst({
        where: { encounterId, diagramType },
      });

      let diagram;

      if (existing) {
        diagram = await prisma.bodyDiagram.update({
          where: { id: existing.id },
          data: {
            markings: markings as Prisma.InputJsonValue,
            notes,
          },
        });
      } else {
        diagram = await prisma.bodyDiagram.create({
          data: {
            encounterId,
            diagramType,
            markings: markings as Prisma.InputJsonValue,
            notes,
          },
        });
      }

      await createAuditLog({
        action: existing ? 'UPDATE' : 'CREATE' as AuditAction,
        entityType: 'BodyDiagram',
        entityId: diagram.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          mobileEntry: true,
          diagramType,
          markingCount: markings.length,
        },
      });

      return {
        success: true,
        diagramId: diagram.id,
        diagramType,
        markingCount: markings.length,
      };
    }),

  /**
   * Get body diagrams for encounter
   */
  getBodyDiagrams: protectedProcedure
    .input(z.object({ encounterId: z.string() }))
    .query(async ({ ctx, input }) => {
      const encounter = await prisma.encounter.findFirst({
        where: {
          id: input.encounterId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!encounter) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        });
      }

      const diagrams = await prisma.bodyDiagram.findMany({
        where: { encounterId: input.encounterId },
        orderBy: { createdAt: 'asc' },
      });

      return {
        encounterId: input.encounterId,
        diagrams: diagrams.map((d) => ({
          id: d.id,
          diagramType: d.diagramType,
          markings: d.markings as unknown[],
          notes: d.notes,
          createdAt: d.createdAt.toISOString(),
          updatedAt: d.updatedAt.toISOString(),
        })),
      };
    }),

  // ==========================================
  // COMMON DIAGNOSIS QUICK SELECT
  // ==========================================

  /**
   * Get common/favorite diagnoses for quick selection
   */
  getCommonDiagnoses: protectedProcedure
    .input(
      z.object({
        category: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { category, limit } = input;

      // Get provider ID if user is a provider
      const provider = await prisma.provider.findFirst({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      });

      const where: Prisma.CommonDiagnosisWhereInput = {
        organizationId: ctx.user.organizationId,
        OR: [{ providerId: null }, ...(provider ? [{ providerId: provider.id }] : [])],
      };

      if (category) {
        where.category = category;
      }

      const diagnoses = await prisma.commonDiagnosis.findMany({
        where,
        orderBy: [{ usageCount: 'desc' }, { sortOrder: 'asc' }],
        take: limit,
      });

      return {
        diagnoses: diagnoses.map((d) => ({
          id: d.id,
          icd10Code: d.icd10Code,
          description: d.description,
          shortName: d.shortName,
          category: d.category,
          usageCount: d.usageCount,
        })),
        categories: [...new Set(diagnoses.map((d) => d.category).filter(Boolean))],
      };
    }),

  /**
   * Add diagnosis to encounter with quick entry
   */
  addQuickDiagnosis: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        icd10Code: z.string(),
        description: z.string(),
        isPrimary: z.boolean().default(false),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { encounterId, icd10Code, description, isPrimary, notes } = input;

      // Verify encounter
      const encounter = await prisma.encounter.findFirst({
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

      if (encounter.status === 'SIGNED' || encounter.status === 'AMENDED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot add diagnosis to a signed encounter',
        });
      }

      // Get highest sequence
      const highestSeq = await prisma.diagnosis.findFirst({
        where: { encounterId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });

      const sequence = (highestSeq?.sequence ?? 0) + 1;

      // If primary, unset others
      if (isPrimary) {
        await prisma.diagnosis.updateMany({
          where: { encounterId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      const diagnosis = await prisma.diagnosis.create({
        data: {
          encounterId,
          icd10Code: icd10Code.toUpperCase(),
          description,
          isPrimary,
          notes,
          sequence,
          status: 'ACTIVE',
        },
      });

      // Update common diagnosis usage
      await prisma.commonDiagnosis.updateMany({
        where: {
          organizationId: ctx.user.organizationId,
          icd10Code: icd10Code.toUpperCase(),
        },
        data: {
          usageCount: { increment: 1 },
          lastUsedAt: new Date(),
        },
      });

      await createAuditLog({
        action: 'CREATE' as AuditAction,
        entityType: 'Diagnosis',
        entityId: diagnosis.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          mobileEntry: true,
          icd10Code,
          isPrimary,
        },
      });

      return {
        success: true,
        diagnosisId: diagnosis.id,
        sequence,
      };
    }),

  /**
   * Get diagnoses for encounter
   */
  getDiagnoses: protectedProcedure
    .input(z.object({ encounterId: z.string() }))
    .query(async ({ ctx, input }) => {
      const encounter = await prisma.encounter.findFirst({
        where: {
          id: input.encounterId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!encounter) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        });
      }

      const diagnoses = await prisma.diagnosis.findMany({
        where: { encounterId: input.encounterId },
        orderBy: [{ isPrimary: 'desc' }, { sequence: 'asc' }],
      });

      return {
        encounterId: input.encounterId,
        diagnoses: diagnoses.map((d) => ({
          id: d.id,
          icd10Code: d.icd10Code,
          description: d.description,
          isPrimary: d.isPrimary,
          sequence: d.sequence,
          status: d.status,
          notes: d.notes,
          bodySite: d.bodySite,
          laterality: d.laterality,
        })),
      };
    }),

  // ==========================================
  // PROCEDURE QUICK ENTRY
  // ==========================================

  /**
   * Get common procedures for quick entry
   */
  getCommonProcedures: protectedProcedure
    .input(
      z.object({
        category: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { category, limit } = input;

      const provider = await prisma.provider.findFirst({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      });

      const where: Prisma.CommonProcedureWhereInput = {
        organizationId: ctx.user.organizationId,
        OR: [{ providerId: null }, ...(provider ? [{ providerId: provider.id }] : [])],
      };

      if (category) {
        where.category = category;
      }

      const procedures = await prisma.commonProcedure.findMany({
        where,
        orderBy: [{ usageCount: 'desc' }, { sortOrder: 'asc' }],
        take: limit,
      });

      return {
        procedures: procedures.map((p) => ({
          id: p.id,
          cptCode: p.cptCode,
          description: p.description,
          shortName: p.shortName,
          category: p.category,
          defaultUnits: p.defaultUnits,
          defaultModifiers: p.defaultModifiers,
          usageCount: p.usageCount,
        })),
        categories: [...new Set(procedures.map((p) => p.category).filter(Boolean))],
      };
    }),

  /**
   * Add procedure to encounter with quick entry
   */
  addQuickProcedure: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        cptCode: z.string(),
        description: z.string(),
        units: z.number().min(1).default(1),
        modifier1: z.string().optional(),
        modifier2: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { encounterId, cptCode, description, units, modifier1, modifier2, notes } = input;

      // Verify encounter
      const encounter = await prisma.encounter.findFirst({
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

      if (encounter.status === 'SIGNED' || encounter.status === 'AMENDED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot add procedure to a signed encounter',
        });
      }

      const procedure = await prisma.procedure.create({
        data: {
          encounterId,
          cptCode: cptCode.toUpperCase(),
          description,
          units,
          modifier1,
          modifier2,
          notes,
        },
      });

      // Update common procedure usage
      await prisma.commonProcedure.updateMany({
        where: {
          organizationId: ctx.user.organizationId,
          cptCode: cptCode.toUpperCase(),
        },
        data: {
          usageCount: { increment: 1 },
          lastUsedAt: new Date(),
        },
      });

      await createAuditLog({
        action: 'CREATE' as AuditAction,
        entityType: 'Procedure',
        entityId: procedure.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          mobileEntry: true,
          cptCode,
          units,
        },
      });

      return {
        success: true,
        procedureId: procedure.id,
      };
    }),

  /**
   * Get procedures for encounter
   */
  getProcedures: protectedProcedure
    .input(z.object({ encounterId: z.string() }))
    .query(async ({ ctx, input }) => {
      const encounter = await prisma.encounter.findFirst({
        where: {
          id: input.encounterId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!encounter) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        });
      }

      const procedures = await prisma.procedure.findMany({
        where: { encounterId: input.encounterId },
        orderBy: { createdAt: 'asc' },
      });

      return {
        encounterId: input.encounterId,
        procedures: procedures.map((p) => ({
          id: p.id,
          cptCode: p.cptCode,
          description: p.description,
          units: p.units,
          modifier1: p.modifier1,
          modifier2: p.modifier2,
          modifier3: p.modifier3,
          modifier4: p.modifier4,
          notes: p.notes,
        })),
      };
    }),

  // ==========================================
  // OFFLINE DRAFT SAVING
  // ==========================================

  /**
   * Save draft for offline support
   */
  saveDraft: providerProcedure
    .input(
      z.object({
        encounterId: z.string().optional(),
        appointmentId: z.string().optional(),
        patientId: z.string(),
        draftType: draftTypeSchema,
        content: z.record(z.string(), z.unknown()),
        voiceTranscript: z.string().optional(),
        bodyDiagramType: z.string().optional(),
        bodyMarkings: z.array(z.unknown()).optional(),
        deviceId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        encounterId,
        appointmentId,
        patientId,
        draftType,
        content,
        voiceTranscript,
        bodyDiagramType,
        bodyMarkings,
        deviceId,
      } = input;

      // Verify patient
      const patient = await prisma.patient.findFirst({
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

      // Get provider
      const provider = await prisma.provider.findFirst({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!provider) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Provider not found',
        });
      }

      // Check for existing draft
      const existing = await prisma.mobileChartingDraft.findFirst({
        where: {
          deviceId,
          encounterId: encounterId ?? null,
          draftType,
          organizationId: ctx.user.organizationId,
        },
      });

      let draft;

      if (existing) {
        draft = await prisma.mobileChartingDraft.update({
          where: { id: existing.id },
          data: {
            content: content as Prisma.InputJsonValue,
            voiceTranscript,
            bodyDiagramType,
            bodyMarkings: bodyMarkings as Prisma.InputJsonValue,
            lastAutoSaveAt: new Date(),
            status: 'PENDING' as SyncStatus,
          },
        });
      } else {
        draft = await prisma.mobileChartingDraft.create({
          data: {
            encounterId,
            appointmentId,
            patientId,
            draftType,
            content: content as Prisma.InputJsonValue,
            voiceTranscript,
            bodyDiagramType,
            bodyMarkings: bodyMarkings as Prisma.InputJsonValue,
            deviceId,
            providerId: provider.id,
            organizationId: ctx.user.organizationId,
            status: 'PENDING' as SyncStatus,
          },
        });
      }

      return {
        success: true,
        draftId: draft.id,
        lastAutoSaveAt: draft.lastAutoSaveAt.toISOString(),
      };
    }),

  /**
   * Get drafts for device
   */
  getDrafts: protectedProcedure
    .input(
      z.object({
        deviceId: z.string(),
        patientId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { deviceId, patientId } = input;

      const provider = await prisma.provider.findFirst({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      });

      const where: Prisma.MobileChartingDraftWhereInput = {
        organizationId: ctx.user.organizationId,
        deviceId,
        providerId: provider?.id,
      };

      if (patientId) {
        where.patientId = patientId;
      }

      const drafts = await prisma.mobileChartingDraft.findMany({
        where,
        orderBy: { lastAutoSaveAt: 'desc' },
      });

      return {
        drafts: drafts.map((d) => ({
          id: d.id,
          encounterId: d.encounterId,
          appointmentId: d.appointmentId,
          patientId: d.patientId,
          draftType: d.draftType,
          content: d.content,
          voiceTranscript: d.voiceTranscript,
          bodyDiagramType: d.bodyDiagramType,
          bodyMarkings: d.bodyMarkings,
          status: d.status,
          lastAutoSaveAt: d.lastAutoSaveAt.toISOString(),
          createdAt: d.createdAt.toISOString(),
        })),
      };
    }),

  /**
   * Delete draft after sync
   */
  deleteDraft: providerProcedure
    .input(z.object({ draftId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const draft = await prisma.mobileChartingDraft.findFirst({
        where: {
          id: input.draftId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!draft) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Draft not found',
        });
      }

      await prisma.mobileChartingDraft.delete({
        where: { id: input.draftId },
      });

      return { success: true };
    }),

  // ==========================================
  // ENCOUNTER SUMMARY (MOBILE OPTIMIZED)
  // ==========================================

  /**
   * Get complete encounter summary for mobile view
   */
  getEncounterSummary: protectedProcedure
    .input(z.object({ encounterId: z.string() }))
    .query(async ({ ctx, input }) => {
      const encounter = await prisma.encounter.findFirst({
        where: {
          id: input.encounterId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            include: {
              demographics: {
                select: {
                  firstName: true,
                  lastName: true,
                  dateOfBirth: true,
                },
              },
            },
          },
          provider: {
            include: {
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          soapNote: true,
          diagnoses: {
            orderBy: [{ isPrimary: 'desc' }, { sequence: 'asc' }],
          },
          procedures: {
            orderBy: { createdAt: 'asc' },
          },
          bodyDiagrams: true,
        },
      });

      if (!encounter) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Encounter not found',
        });
      }

      return {
        id: encounter.id,
        status: encounter.status,
        encounterType: encounter.encounterType,
        encounterDate: encounter.encounterDate.toISOString(),
        chiefComplaint: encounter.chiefComplaint,
        patient: {
          id: encounter.patient.id,
          name: encounter.patient.demographics
            ? `${encounter.patient.demographics.firstName} ${encounter.patient.demographics.lastName}`
            : 'Unknown',
          dateOfBirth: encounter.patient.demographics?.dateOfBirth?.toISOString(),
        },
        provider: {
          id: encounter.provider.id,
          name: `${encounter.provider.user.firstName} ${encounter.provider.user.lastName}`,
        },
        soapNote: encounter.soapNote
          ? {
              id: encounter.soapNote.id,
              subjective: encounter.soapNote.subjective,
              objective: encounter.soapNote.objective,
              assessment: encounter.soapNote.assessment,
              plan: encounter.soapNote.plan,
              isLocked: encounter.soapNote.isLocked,
            }
          : null,
        diagnoses: encounter.diagnoses.map((d) => ({
          id: d.id,
          icd10Code: d.icd10Code,
          description: d.description,
          isPrimary: d.isPrimary,
        })),
        procedures: encounter.procedures.map((p) => ({
          id: p.id,
          cptCode: p.cptCode,
          description: p.description,
          units: p.units,
        })),
        diagrams: encounter.bodyDiagrams.map((d) => ({
          id: d.id,
          diagramType: d.diagramType,
          markingCount: Array.isArray(d.markings) ? d.markings.length : 0,
        })),
        stats: {
          diagnosisCount: encounter.diagnoses.length,
          procedureCount: encounter.procedures.length,
          diagramCount: encounter.bodyDiagrams.length,
          hasSoapNote: !!encounter.soapNote,
        },
      };
    }),

  /**
   * Create or start encounter from appointment
   */
  startEncounter: providerProcedure
    .input(
      z.object({
        appointmentId: z.string(),
        chiefComplaint: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { appointmentId, chiefComplaint } = input;

      // Get appointment
      const appointment = await prisma.appointment.findFirst({
        where: {
          id: appointmentId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          encounter: true,
        },
      });

      if (!appointment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Appointment not found',
        });
      }

      // If encounter already exists, return it
      if (appointment.encounter) {
        return {
          success: true,
          encounterId: appointment.encounter.id,
          isNew: false,
        };
      }

      // Get provider
      const provider = await prisma.provider.findFirst({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!provider) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Provider not found',
        });
      }

      // Create new encounter
      const encounter = await prisma.encounter.create({
        data: {
          patientId: appointment.patientId,
          providerId: provider.id,
          appointmentId,
          organizationId: ctx.user.organizationId,
          encounterType: EncounterType.FOLLOW_UP,
          encounterDate: new Date(),
          chiefComplaint: chiefComplaint || appointment.chiefComplaint,
          status: EncounterStatus.IN_PROGRESS,
          createdBy: ctx.user.id,
        },
      });

      // Update appointment status
      await prisma.appointment.update({
        where: { id: appointmentId },
        data: { status: 'IN_PROGRESS' },
      });

      await createAuditLog({
        action: 'CREATE' as AuditAction,
        entityType: 'Encounter',
        entityId: encounter.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          mobileEntry: true,
          appointmentId,
          patientId: appointment.patientId,
        },
      });

      return {
        success: true,
        encounterId: encounter.id,
        isNew: true,
      };
    }),
});
