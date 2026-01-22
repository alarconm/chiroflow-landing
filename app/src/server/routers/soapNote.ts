import { z } from 'zod';
import { router, protectedProcedure, providerProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import type { EncounterType } from '@prisma/client';
import type { Prisma } from '@prisma/client';

// Validation schemas
const soapSectionSchema = z.object({
  text: z.string().optional(),
  structured: z.record(z.string(), z.unknown()).optional(), // JSON structure for template-based content
});

const encounterTypeSchema = z.enum([
  'INITIAL_EVAL',
  'FOLLOW_UP',
  'RE_EVALUATION',
  'DISCHARGE',
  'MAINTENANCE',
  'ACUTE',
  'WORKERS_COMP',
  'PERSONAL_INJURY',
]);

export const soapNoteRouter = router({
  // Create a new SOAP note for an encounter
  create: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        templateId: z.string().optional(),
        subjective: z.string().optional(),
        objective: z.string().optional(),
        assessment: z.string().optional(),
        plan: z.string().optional(),
        subjectiveJson: z.record(z.string(), z.unknown()).optional(),
        objectiveJson: z.record(z.string(), z.unknown()).optional(),
        assessmentJson: z.record(z.string(), z.unknown()).optional(),
        planJson: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { encounterId, templateId, ...noteData } = input;

      // Verify encounter exists and belongs to org
      const encounter = await ctx.prisma.encounter.findFirst({
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

      if (encounter.soapNote) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Encounter already has a SOAP note',
        });
      }

      if (encounter.status === 'SIGNED' || encounter.status === 'AMENDED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot add SOAP note to a signed encounter',
        });
      }

      // Verify template if provided
      if (templateId) {
        const template = await ctx.prisma.noteTemplate.findFirst({
          where: {
            id: templateId,
            isActive: true,
            OR: [
              { organizationId: ctx.user.organizationId },
              { organizationId: null }, // System templates
            ],
          },
        });

        if (!template) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Template not found',
          });
        }
      }

      // Create SOAP note
      const soapNote = await ctx.prisma.sOAPNote.create({
        data: {
          encounterId,
          templateId,
          subjective: noteData.subjective,
          objective: noteData.objective,
          assessment: noteData.assessment,
          plan: noteData.plan,
          subjectiveJson: noteData.subjectiveJson as Prisma.InputJsonValue,
          objectiveJson: noteData.objectiveJson as Prisma.InputJsonValue,
          assessmentJson: noteData.assessmentJson as Prisma.InputJsonValue,
          planJson: noteData.planJson as Prisma.InputJsonValue,
          version: 1,
        },
        include: {
          template: {
            select: { id: true, name: true },
          },
        },
      });

      // Log creation
      await auditLog('SOAP_NOTE_CREATE', 'SOAPNote', {
        entityId: soapNote.id,
        changes: { encounterId, templateId, hasContent: !!noteData.subjective || !!noteData.objective },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return soapNote;
    }),

  // Get SOAP note by ID
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const soapNote = await ctx.prisma.sOAPNote.findFirst({
        where: {
          id: input.id,
          encounter: { organizationId: ctx.user.organizationId },
        },
        include: {
          encounter: {
            select: {
              id: true,
              status: true,
              encounterType: true,
              encounterDate: true,
              patient: {
                select: {
                  id: true,
                  mrn: true,
                  demographics: {
                    select: {
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
              },
            },
          },
          template: {
            select: { id: true, name: true },
          },
        },
      });

      if (!soapNote) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'SOAP note not found',
        });
      }

      return soapNote;
    }),

  // Get SOAP note by encounter ID
  getByEncounter: protectedProcedure
    .input(z.object({ encounterId: z.string() }))
    .query(async ({ ctx, input }) => {
      const soapNote = await ctx.prisma.sOAPNote.findFirst({
        where: {
          encounterId: input.encounterId,
          encounter: { organizationId: ctx.user.organizationId },
        },
        include: {
          template: {
            select: { id: true, name: true },
          },
        },
      });

      return soapNote;
    }),

  // Update SOAP note sections
  update: providerProcedure
    .input(
      z.object({
        id: z.string(),
        subjective: z.string().optional(),
        objective: z.string().optional(),
        assessment: z.string().optional(),
        plan: z.string().optional(),
        subjectiveJson: z.record(z.string(), z.unknown()).optional(),
        objectiveJson: z.record(z.string(), z.unknown()).optional(),
        assessmentJson: z.record(z.string(), z.unknown()).optional(),
        planJson: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      // Verify SOAP note exists and belongs to org
      const existing = await ctx.prisma.sOAPNote.findFirst({
        where: {
          id,
          encounter: { organizationId: ctx.user.organizationId },
        },
        include: { encounter: true },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'SOAP note not found',
        });
      }

      if (existing.isLocked) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'SOAP note is locked. Use addendum to add content.',
        });
      }

      // Build update data
      const data: Record<string, unknown> = {
        version: { increment: 1 },
      };

      if (updateData.subjective !== undefined) data.subjective = updateData.subjective;
      if (updateData.objective !== undefined) data.objective = updateData.objective;
      if (updateData.assessment !== undefined) data.assessment = updateData.assessment;
      if (updateData.plan !== undefined) data.plan = updateData.plan;
      if (updateData.subjectiveJson !== undefined) data.subjectiveJson = updateData.subjectiveJson as Prisma.InputJsonValue;
      if (updateData.objectiveJson !== undefined) data.objectiveJson = updateData.objectiveJson as Prisma.InputJsonValue;
      if (updateData.assessmentJson !== undefined) data.assessmentJson = updateData.assessmentJson as Prisma.InputJsonValue;
      if (updateData.planJson !== undefined) data.planJson = updateData.planJson as Prisma.InputJsonValue;

      const soapNote = await ctx.prisma.sOAPNote.update({
        where: { id },
        data,
      });

      // Log update
      await auditLog('SOAP_NOTE_UPDATE', 'SOAPNote', {
        entityId: id,
        changes: {
          sections: Object.keys(updateData).filter(k => updateData[k as keyof typeof updateData] !== undefined),
          newVersion: soapNote.version,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return soapNote;
    }),

  // List available SOAP templates
  getTemplates: protectedProcedure
    .input(
      z.object({
        category: encounterTypeSchema.optional(),
        includeSystem: z.boolean().default(true),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const { category, includeSystem = true } = input ?? {};

      const where: Record<string, unknown> = {
        isActive: true,
        OR: [
          { organizationId: ctx.user.organizationId },
          ...(includeSystem ? [{ organizationId: null }] : []),
        ],
      };

      if (category) {
        where.category = category;
      }

      const templates = await ctx.prisma.noteTemplate.findMany({
        where,
        orderBy: [{ isSystem: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          isSystem: true,
          sortOrder: true,
          subjectiveTemplate: true,
          objectiveTemplate: true,
          assessmentTemplate: true,
          planTemplate: true,
          variables: true,
        },
      });

      return templates;
    }),

  // Apply a template to a SOAP note
  applyTemplate: providerProcedure
    .input(
      z.object({
        soapNoteId: z.string(),
        templateId: z.string(),
        overwrite: z.boolean().default(false), // Whether to overwrite existing content
        patientContext: z.object({
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          dateOfBirth: z.coerce.date().optional(),
          mrn: z.string().optional(),
        }).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { soapNoteId, templateId, overwrite, patientContext } = input;

      // Verify SOAP note exists and is not locked
      const soapNote = await ctx.prisma.sOAPNote.findFirst({
        where: {
          id: soapNoteId,
          encounter: { organizationId: ctx.user.organizationId },
        },
        include: {
          encounter: {
            include: {
              patient: {
                include: { demographics: true },
              },
            },
          },
        },
      });

      if (!soapNote) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'SOAP note not found',
        });
      }

      if (soapNote.isLocked) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot apply template to a locked SOAP note',
        });
      }

      // Verify template exists
      const template = await ctx.prisma.noteTemplate.findFirst({
        where: {
          id: templateId,
          isActive: true,
          OR: [
            { organizationId: ctx.user.organizationId },
            { organizationId: null },
          ],
        },
      });

      if (!template) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Template not found',
        });
      }

      // Prepare template variable substitutions
      const patient = soapNote.encounter.patient;
      const demographics = patient.demographics;
      const variables: Record<string, string> = {
        '{{patient.firstName}}': patientContext?.firstName ?? demographics?.firstName ?? '',
        '{{patient.lastName}}': patientContext?.lastName ?? demographics?.lastName ?? '',
        '{{patient.fullName}}': `${patientContext?.firstName ?? demographics?.firstName ?? ''} ${patientContext?.lastName ?? demographics?.lastName ?? ''}`.trim(),
        '{{patient.mrn}}': patientContext?.mrn ?? patient.mrn ?? '',
        '{{date}}': new Date().toLocaleDateString(),
        '{{encounterDate}}': soapNote.encounter.encounterDate.toLocaleDateString(),
      };

      // Function to apply variables to template content
      const applyVariables = (content: string | null): string | null => {
        if (!content) return null;
        let result = content;
        for (const [key, value] of Object.entries(variables)) {
          result = result.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
        }
        return result;
      };

      // Build update data
      const updateData: Record<string, unknown> = {
        templateId,
        version: { increment: 1 },
      };

      // Apply template content (only if overwrite is true or field is empty)
      if (template.subjectiveTemplate) {
        const templateContent = typeof template.subjectiveTemplate === 'string'
          ? template.subjectiveTemplate
          : JSON.stringify(template.subjectiveTemplate);
        if (overwrite || !soapNote.subjective) {
          updateData.subjective = applyVariables(templateContent);
        }
        updateData.subjectiveJson = template.subjectiveTemplate;
      }

      if (template.objectiveTemplate) {
        const templateContent = typeof template.objectiveTemplate === 'string'
          ? template.objectiveTemplate
          : JSON.stringify(template.objectiveTemplate);
        if (overwrite || !soapNote.objective) {
          updateData.objective = applyVariables(templateContent);
        }
        updateData.objectiveJson = template.objectiveTemplate;
      }

      if (template.assessmentTemplate) {
        const templateContent = typeof template.assessmentTemplate === 'string'
          ? template.assessmentTemplate
          : JSON.stringify(template.assessmentTemplate);
        if (overwrite || !soapNote.assessment) {
          updateData.assessment = applyVariables(templateContent);
        }
        updateData.assessmentJson = template.assessmentTemplate;
      }

      if (template.planTemplate) {
        const templateContent = typeof template.planTemplate === 'string'
          ? template.planTemplate
          : JSON.stringify(template.planTemplate);
        if (overwrite || !soapNote.plan) {
          updateData.plan = applyVariables(templateContent);
        }
        updateData.planJson = template.planTemplate;
      }

      const updated = await ctx.prisma.sOAPNote.update({
        where: { id: soapNoteId },
        data: updateData,
        include: {
          template: {
            select: { id: true, name: true },
          },
        },
      });

      // Log template application
      await auditLog('SOAP_NOTE_UPDATE', 'SOAPNote', {
        entityId: soapNoteId,
        changes: { action: 'template_applied', templateId, overwrite },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  // Lock a SOAP note (prevents further edits)
  lock: providerProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const soapNote = await ctx.prisma.sOAPNote.findFirst({
        where: {
          id: input.id,
          encounter: { organizationId: ctx.user.organizationId },
        },
        include: {
          encounter: {
            include: {
              provider: true,
            },
          },
        },
      });

      if (!soapNote) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'SOAP note not found',
        });
      }

      if (soapNote.isLocked) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'SOAP note is already locked',
        });
      }

      // Verify user is the provider or admin
      const userProvider = await ctx.prisma.provider.findFirst({
        where: { userId: ctx.user.id, organizationId: ctx.user.organizationId },
      });

      if (!userProvider || userProvider.id !== soapNote.encounter.providerId) {
        if (ctx.user.role !== 'ADMIN' && ctx.user.role !== 'OWNER') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only the encounter provider can lock this SOAP note',
          });
        }
      }

      const updated = await ctx.prisma.sOAPNote.update({
        where: { id: input.id },
        data: {
          isLocked: true,
          lockedAt: new Date(),
          lockedBy: ctx.user.id,
        },
      });

      // Log locking
      await auditLog('SOAP_NOTE_LOCK', 'SOAPNote', {
        entityId: input.id,
        changes: { lockedBy: ctx.user.id },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  // Add an addendum to a locked SOAP note
  addAddendum: providerProcedure
    .input(
      z.object({
        encounterId: z.string(),
        content: z.string().min(1, 'Addendum content is required'),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { encounterId, content, reason } = input;

      // Verify encounter exists and has a SOAP note
      const encounter = await ctx.prisma.encounter.findFirst({
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

      if (!encounter.soapNote) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Encounter does not have a SOAP note',
        });
      }

      // Create addendum
      const addendum = await ctx.prisma.noteAddendum.create({
        data: {
          encounterId,
          content,
          reason,
          addedBy: ctx.user.id,
        },
      });

      // Update encounter status to AMENDED if it was SIGNED
      if (encounter.status === 'SIGNED') {
        await ctx.prisma.encounter.update({
          where: { id: encounterId },
          data: { status: 'AMENDED' },
        });
      }

      // Log addendum creation
      await auditLog('ADDENDUM_CREATE', 'NoteAddendum', {
        entityId: addendum.id,
        changes: { encounterId, reason, contentLength: content.length },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return addendum;
    }),

  // Get addendums for an encounter
  getAddendums: protectedProcedure
    .input(z.object({ encounterId: z.string() }))
    .query(async ({ ctx, input }) => {
      const encounter = await ctx.prisma.encounter.findFirst({
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

      const addendums = await ctx.prisma.noteAddendum.findMany({
        where: { encounterId: input.encounterId },
        orderBy: { addedAt: 'desc' },
      });

      return addendums;
    }),

  // Sign an addendum
  signAddendum: providerProcedure
    .input(
      z.object({
        id: z.string(),
        signature: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, signature } = input;

      const addendum = await ctx.prisma.noteAddendum.findFirst({
        where: {
          id,
          encounter: { organizationId: ctx.user.organizationId },
        },
      });

      if (!addendum) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Addendum not found',
        });
      }

      if (addendum.signedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Addendum is already signed',
        });
      }

      // Verify user is the one who created the addendum or admin
      if (addendum.addedBy !== ctx.user.id) {
        if (ctx.user.role !== 'ADMIN' && ctx.user.role !== 'OWNER') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only the addendum creator can sign it',
          });
        }
      }

      const updated = await ctx.prisma.noteAddendum.update({
        where: { id },
        data: {
          signedAt: new Date(),
          signature,
        },
      });

      return updated;
    }),

  // Get version history (for audit purposes)
  getVersionHistory: protectedProcedure
    .input(z.object({ soapNoteId: z.string() }))
    .query(async ({ ctx, input }) => {
      const soapNote = await ctx.prisma.sOAPNote.findFirst({
        where: {
          id: input.soapNoteId,
          encounter: { organizationId: ctx.user.organizationId },
        },
      });

      if (!soapNote) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'SOAP note not found',
        });
      }

      // Get audit logs for this SOAP note
      const auditLogs = await ctx.prisma.auditLog.findMany({
        where: {
          entityType: 'SOAPNote',
          entityId: input.soapNoteId,
          organizationId: ctx.user.organizationId,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      return {
        currentVersion: soapNote.version,
        isLocked: soapNote.isLocked,
        lockedAt: soapNote.lockedAt,
        lockedBy: soapNote.lockedBy,
        history: auditLogs.map((log) => ({
          id: log.id,
          action: log.action,
          changes: log.changes,
          timestamp: log.createdAt,
          user: log.user
            ? `${log.user.firstName} ${log.user.lastName}`
            : 'Unknown',
        })),
      };
    }),
});
