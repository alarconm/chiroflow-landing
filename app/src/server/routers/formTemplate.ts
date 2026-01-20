import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditAction } from '@/lib/audit';
import { FormFieldType, Prisma } from '@prisma/client';

// ============================================
// INPUT SCHEMAS
// ============================================

const formFieldTypeSchema = z.nativeEnum(FormFieldType);

// Conditional display operator enum
const conditionalOpSchema = z.enum([
  'equals',
  'not_equals',
  'contains',
  'greater_than',
  'less_than',
  'is_empty',
  'is_not_empty',
]);

// Field input schema for create/update
const fieldInputSchema = z.object({
  fieldType: formFieldTypeSchema,
  label: z.string().min(1),
  name: z.string().min(1), // Field name for data storage
  placeholder: z.string().optional(),
  helpText: z.string().optional(),
  isRequired: z.boolean().optional().default(false),
  order: z.number(),
  // Validation
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
  pattern: z.string().optional(),
  patternMessage: z.string().optional(),
  // Options for select/radio/checkbox
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  // Conditional display
  conditionalOn: z.string().optional(),
  conditionalValue: z.string().optional(),
  conditionalOp: conditionalOpSchema.optional(),
  // Patient mapping
  mapsToPatient: z.string().optional(),
  sectionId: z.string().optional(),
});

// Section input schema
const sectionInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  order: z.number(),
});

// Patient field mapping schema (templateId field -> patient field)
const patientMappingSchema = z.record(z.string(), z.string()).optional();

// ============================================
// FORM TEMPLATE ROUTER
// ============================================

export const formTemplateRouter = router({
  // ==========================================
  // CREATE - formTemplate.create mutation with fields and sections
  // ==========================================
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, 'Template name is required'),
        description: z.string().optional(),
        sections: z.array(sectionInputSchema).optional(),
        fields: z.array(fieldInputSchema).optional(),
        patientMapping: patientMappingSchema,
        expiresInDays: z.number().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const template = await prisma.$transaction(async (tx) => {
        // Create the template
        const newTemplate = await tx.formTemplate.create({
          data: {
            name: input.name,
            description: input.description,
            organizationId: ctx.user.organizationId,
            patientMapping: input.patientMapping as Prisma.InputJsonValue,
            expiresInDays: input.expiresInDays,
            isDraft: true,
            version: 1,
          },
        });

        // Create sections if provided
        const sectionIdMap = new Map<number, string>();
        if (input.sections && input.sections.length > 0) {
          for (const section of input.sections) {
            const createdSection = await tx.formSection.create({
              data: {
                templateId: newTemplate.id,
                title: section.title,
                description: section.description,
                order: section.order,
              },
            });
            sectionIdMap.set(section.order, createdSection.id);
          }
        }

        // Create fields if provided
        if (input.fields && input.fields.length > 0) {
          await tx.formField.createMany({
            data: input.fields.map((field) => ({
              templateId: newTemplate.id,
              sectionId: field.sectionId,
              fieldType: field.fieldType,
              label: field.label,
              name: field.name,
              placeholder: field.placeholder,
              helpText: field.helpText,
              isRequired: field.isRequired || false,
              order: field.order,
              minLength: field.minLength,
              maxLength: field.maxLength,
              minValue: field.minValue,
              maxValue: field.maxValue,
              pattern: field.pattern,
              patternMessage: field.patternMessage,
              options: field.options as Prisma.InputJsonValue,
              conditionalOn: field.conditionalOn,
              conditionalValue: field.conditionalValue,
              conditionalOp: field.conditionalOp,
              mapsToPatient: field.mapsToPatient,
            })),
          });
        }

        return newTemplate;
      });

      // Fetch complete template with relations
      const completeTemplate = await prisma.formTemplate.findUnique({
        where: { id: template.id },
        include: {
          sections: { orderBy: { order: 'asc' } },
          fields: { orderBy: { order: 'asc' } },
        },
      });

      await createAuditLog({
        action: 'CREATE' as AuditAction,
        entityType: 'FormTemplate',
        entityId: template.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { created: input },
      });

      return completeTemplate;
    }),

  // ==========================================
  // GET - formTemplate.get query returns template with all fields and sections
  // ==========================================
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const template = await prisma.formTemplate.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          sections: { orderBy: { order: 'asc' } },
          fields: {
            orderBy: { order: 'asc' },
            include: {
              section: true,
            },
          },
        },
      });

      if (!template) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Form template not found',
        });
      }

      return template;
    }),

  // ==========================================
  // UPDATE - formTemplate.update mutation preserves version history
  // ==========================================
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        sections: z.array(sectionInputSchema.extend({ id: z.string().optional() })).optional(),
        fields: z.array(fieldInputSchema.extend({ id: z.string().optional() })).optional(),
        patientMapping: patientMappingSchema,
        expiresInDays: z.number().positive().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, sections, fields, ...updateData } = input;

      const existing = await prisma.formTemplate.findFirst({
        where: { id, organizationId: ctx.user.organizationId },
        include: {
          sections: true,
          fields: true,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Form template not found',
        });
      }

      // If template is published, increment version on update
      const shouldIncrementVersion = existing.publishedAt !== null;

      const template = await prisma.$transaction(async (tx) => {
        // Update template
        const updated = await tx.formTemplate.update({
          where: { id },
          data: {
            ...updateData,
            patientMapping: updateData.patientMapping as Prisma.InputJsonValue,
            version: shouldIncrementVersion ? existing.version + 1 : existing.version,
            isDraft: shouldIncrementVersion ? true : existing.isDraft,
          },
        });

        // Update sections if provided
        if (sections !== undefined) {
          // Delete existing sections not in new list
          const existingSectionIds = existing.sections.map((s) => s.id);
          const newSectionIds = sections.filter((s) => s.id).map((s) => s.id as string);
          const sectionsToDelete = existingSectionIds.filter((id) => !newSectionIds.includes(id));

          if (sectionsToDelete.length > 0) {
            await tx.formSection.deleteMany({
              where: { id: { in: sectionsToDelete } },
            });
          }

          // Upsert sections
          for (const section of sections) {
            if (section.id) {
              await tx.formSection.update({
                where: { id: section.id },
                data: {
                  title: section.title,
                  description: section.description,
                  order: section.order,
                },
              });
            } else {
              await tx.formSection.create({
                data: {
                  templateId: id,
                  title: section.title,
                  description: section.description,
                  order: section.order,
                },
              });
            }
          }
        }

        // Update fields if provided
        if (fields !== undefined) {
          // Delete existing fields not in new list
          const existingFieldIds = existing.fields.map((f) => f.id);
          const newFieldIds = fields.filter((f) => f.id).map((f) => f.id as string);
          const fieldsToDelete = existingFieldIds.filter((id) => !newFieldIds.includes(id));

          if (fieldsToDelete.length > 0) {
            await tx.formField.deleteMany({
              where: { id: { in: fieldsToDelete } },
            });
          }

          // Upsert fields
          for (const field of fields) {
            const fieldData = {
              templateId: id,
              sectionId: field.sectionId,
              fieldType: field.fieldType,
              label: field.label,
              name: field.name,
              placeholder: field.placeholder,
              helpText: field.helpText,
              isRequired: field.isRequired || false,
              order: field.order,
              minLength: field.minLength,
              maxLength: field.maxLength,
              minValue: field.minValue,
              maxValue: field.maxValue,
              pattern: field.pattern,
              patternMessage: field.patternMessage,
              options: field.options as Prisma.InputJsonValue,
              conditionalOn: field.conditionalOn,
              conditionalValue: field.conditionalValue,
              conditionalOp: field.conditionalOp,
              mapsToPatient: field.mapsToPatient,
            };

            if (field.id) {
              await tx.formField.update({
                where: { id: field.id },
                data: fieldData,
              });
            } else {
              await tx.formField.create({
                data: fieldData,
              });
            }
          }
        }

        return updated;
      });

      // Fetch complete template with relations
      const completeTemplate = await prisma.formTemplate.findUnique({
        where: { id },
        include: {
          sections: { orderBy: { order: 'asc' } },
          fields: { orderBy: { order: 'asc' } },
        },
      });

      await createAuditLog({
        action: 'UPDATE' as AuditAction,
        entityType: 'FormTemplate',
        entityId: id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          before: { name: existing.name, version: existing.version },
          after: { name: template.name, version: template.version },
        },
      });

      return completeTemplate;
    }),

  // ==========================================
  // LIST - formTemplate.list query with active/inactive filter
  // ==========================================
  list: protectedProcedure
    .input(
      z.object({
        includeInactive: z.boolean().optional().default(false),
        includeSystem: z.boolean().optional().default(true),
        includeDrafts: z.boolean().optional().default(true),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const templates = await prisma.formTemplate.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          ...(input?.includeInactive ? {} : { isActive: true }),
          ...(input?.includeSystem ? {} : { isSystem: false }),
          ...(input?.includeDrafts ? {} : { isDraft: false }),
        },
        include: {
          sections: { orderBy: { order: 'asc' } },
          fields: { orderBy: { order: 'asc' } },
          _count: {
            select: { submissions: true },
          },
        },
        orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      });

      return templates;
    }),

  // ==========================================
  // DUPLICATE - formTemplate.duplicate to create copy of existing template
  // ==========================================
  duplicate: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        newName: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const source = await prisma.formTemplate.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          sections: { orderBy: { order: 'asc' } },
          fields: { orderBy: { order: 'asc' } },
        },
      });

      if (!source) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Form template not found',
        });
      }

      const duplicated = await prisma.$transaction(async (tx) => {
        // Create new template
        const newTemplate = await tx.formTemplate.create({
          data: {
            name: input.newName || `${source.name} (Copy)`,
            description: source.description,
            organizationId: ctx.user.organizationId,
            patientMapping: source.patientMapping as Prisma.InputJsonValue,
            expiresInDays: source.expiresInDays,
            isDraft: true,
            isSystem: false, // Duplicated templates are never system templates
            version: 1,
          },
        });

        // Create section ID mapping for field references
        const sectionIdMap = new Map<string, string>();

        // Duplicate sections
        for (const section of source.sections) {
          const newSection = await tx.formSection.create({
            data: {
              templateId: newTemplate.id,
              title: section.title,
              description: section.description,
              order: section.order,
            },
          });
          sectionIdMap.set(section.id, newSection.id);
        }

        // Duplicate fields
        if (source.fields.length > 0) {
          await tx.formField.createMany({
            data: source.fields.map((field) => ({
              templateId: newTemplate.id,
              sectionId: field.sectionId ? sectionIdMap.get(field.sectionId) : null,
              fieldType: field.fieldType,
              label: field.label,
              name: field.name,
              placeholder: field.placeholder,
              helpText: field.helpText,
              isRequired: field.isRequired,
              order: field.order,
              minLength: field.minLength,
              maxLength: field.maxLength,
              minValue: field.minValue,
              maxValue: field.maxValue,
              pattern: field.pattern,
              patternMessage: field.patternMessage,
              options: field.options as Prisma.InputJsonValue,
              conditionalOn: field.conditionalOn,
              conditionalValue: field.conditionalValue,
              conditionalOp: field.conditionalOp,
              mapsToPatient: field.mapsToPatient,
            })),
          });
        }

        return newTemplate;
      });

      // Fetch complete template
      const completeTemplate = await prisma.formTemplate.findUnique({
        where: { id: duplicated.id },
        include: {
          sections: { orderBy: { order: 'asc' } },
          fields: { orderBy: { order: 'asc' } },
        },
      });

      await createAuditLog({
        action: 'CREATE' as AuditAction,
        entityType: 'FormTemplate',
        entityId: duplicated.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { duplicatedFrom: input.id },
      });

      return completeTemplate;
    }),

  // ==========================================
  // ARCHIVE - formTemplate.archive for soft delete (keeps submissions)
  // ==========================================
  archive: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.formTemplate.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Form template not found',
        });
      }

      if (existing.isSystem) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'System templates cannot be archived',
        });
      }

      const template = await prisma.formTemplate.update({
        where: { id: input.id },
        data: { isActive: false },
      });

      await createAuditLog({
        action: 'UPDATE' as AuditAction,
        entityType: 'FormTemplate',
        entityId: input.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { archived: true },
      });

      return template;
    }),

  // ==========================================
  // RESTORE - formTemplate.restore to unarchive
  // ==========================================
  restore: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.formTemplate.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Form template not found',
        });
      }

      const template = await prisma.formTemplate.update({
        where: { id: input.id },
        data: { isActive: true },
      });

      await createAuditLog({
        action: 'UPDATE' as AuditAction,
        entityType: 'FormTemplate',
        entityId: input.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { restored: true },
      });

      return template;
    }),

  // ==========================================
  // PUBLISH - formTemplate.publish to make template active
  // ==========================================
  publish: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.formTemplate.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          fields: true,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Form template not found',
        });
      }

      // Validate template has at least one field
      if (existing.fields.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot publish a template with no fields',
        });
      }

      const template = await prisma.formTemplate.update({
        where: { id: input.id },
        data: {
          isDraft: false,
          publishedAt: new Date(),
          isActive: true,
        },
      });

      await createAuditLog({
        action: 'UPDATE' as AuditAction,
        entityType: 'FormTemplate',
        entityId: input.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { published: true, version: template.version },
      });

      return template;
    }),

  // ==========================================
  // UNPUBLISH - formTemplate.unpublish to revert to draft
  // ==========================================
  unpublish: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.formTemplate.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Form template not found',
        });
      }

      if (existing.isSystem) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'System templates cannot be unpublished',
        });
      }

      const template = await prisma.formTemplate.update({
        where: { id: input.id },
        data: { isDraft: true },
      });

      await createAuditLog({
        action: 'UPDATE' as AuditAction,
        entityType: 'FormTemplate',
        entityId: input.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { unpublished: true },
      });

      return template;
    }),

  // ==========================================
  // SECTION CRUD
  // ==========================================
  addSection: protectedProcedure
    .input(
      z.object({
        templateId: z.string(),
        title: z.string().min(1),
        description: z.string().optional(),
        order: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const template = await prisma.formTemplate.findFirst({
        where: {
          id: input.templateId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!template) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Form template not found',
        });
      }

      const section = await prisma.formSection.create({
        data: {
          templateId: input.templateId,
          title: input.title,
          description: input.description,
          order: input.order,
        },
      });

      await createAuditLog({
        action: 'CREATE' as AuditAction,
        entityType: 'FormSection',
        entityId: section.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { created: input },
      });

      return section;
    }),

  updateSection: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        order: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const existing = await prisma.formSection.findFirst({
        where: { id },
        include: {
          template: true,
        },
      });

      if (!existing || existing.template.organizationId !== ctx.user.organizationId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Form section not found',
        });
      }

      const section = await prisma.formSection.update({
        where: { id },
        data,
      });

      await createAuditLog({
        action: 'UPDATE' as AuditAction,
        entityType: 'FormSection',
        entityId: id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { before: existing, after: data },
      });

      return section;
    }),

  deleteSection: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.formSection.findFirst({
        where: { id: input.id },
        include: {
          template: true,
          fields: true,
        },
      });

      if (!existing || existing.template.organizationId !== ctx.user.organizationId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Form section not found',
        });
      }

      // Move fields to no section
      await prisma.formField.updateMany({
        where: { sectionId: input.id },
        data: { sectionId: null },
      });

      await prisma.formSection.delete({
        where: { id: input.id },
      });

      await createAuditLog({
        action: 'DELETE' as AuditAction,
        entityType: 'FormSection',
        entityId: input.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // ==========================================
  // FIELD CRUD
  // ==========================================
  addField: protectedProcedure
    .input(
      z.object({
        templateId: z.string(),
        sectionId: z.string().optional(),
        fieldType: formFieldTypeSchema,
        label: z.string().min(1),
        name: z.string().min(1),
        placeholder: z.string().optional(),
        helpText: z.string().optional(),
        isRequired: z.boolean().optional(),
        order: z.number(),
        minLength: z.number().optional(),
        maxLength: z.number().optional(),
        minValue: z.number().optional(),
        maxValue: z.number().optional(),
        pattern: z.string().optional(),
        patternMessage: z.string().optional(),
        options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
        conditionalOn: z.string().optional(),
        conditionalValue: z.string().optional(),
        conditionalOp: conditionalOpSchema.optional(),
        mapsToPatient: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const template = await prisma.formTemplate.findFirst({
        where: {
          id: input.templateId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!template) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Form template not found',
        });
      }

      const field = await prisma.formField.create({
        data: {
          templateId: input.templateId,
          sectionId: input.sectionId,
          fieldType: input.fieldType,
          label: input.label,
          name: input.name,
          placeholder: input.placeholder,
          helpText: input.helpText,
          isRequired: input.isRequired || false,
          order: input.order,
          minLength: input.minLength,
          maxLength: input.maxLength,
          minValue: input.minValue,
          maxValue: input.maxValue,
          pattern: input.pattern,
          patternMessage: input.patternMessage,
          options: input.options as Prisma.InputJsonValue,
          conditionalOn: input.conditionalOn,
          conditionalValue: input.conditionalValue,
          conditionalOp: input.conditionalOp,
          mapsToPatient: input.mapsToPatient,
        },
      });

      await createAuditLog({
        action: 'CREATE' as AuditAction,
        entityType: 'FormField',
        entityId: field.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { created: input },
      });

      return field;
    }),

  updateField: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        sectionId: z.string().nullable().optional(),
        fieldType: formFieldTypeSchema.optional(),
        label: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        placeholder: z.string().optional(),
        helpText: z.string().optional(),
        isRequired: z.boolean().optional(),
        order: z.number().optional(),
        minLength: z.number().nullable().optional(),
        maxLength: z.number().nullable().optional(),
        minValue: z.number().nullable().optional(),
        maxValue: z.number().nullable().optional(),
        pattern: z.string().nullable().optional(),
        patternMessage: z.string().nullable().optional(),
        options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
        conditionalOn: z.string().nullable().optional(),
        conditionalValue: z.string().nullable().optional(),
        conditionalOp: conditionalOpSchema.nullable().optional(),
        mapsToPatient: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, options, ...data } = input;

      const existing = await prisma.formField.findFirst({
        where: { id },
        include: {
          template: true,
        },
      });

      if (!existing || existing.template.organizationId !== ctx.user.organizationId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Form field not found',
        });
      }

      const field = await prisma.formField.update({
        where: { id },
        data: {
          ...data,
          options: options as Prisma.InputJsonValue,
        },
      });

      await createAuditLog({
        action: 'UPDATE' as AuditAction,
        entityType: 'FormField',
        entityId: id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { before: existing, after: data },
      });

      return field;
    }),

  deleteField: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.formField.findFirst({
        where: { id: input.id },
        include: {
          template: true,
        },
      });

      if (!existing || existing.template.organizationId !== ctx.user.organizationId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Form field not found',
        });
      }

      await prisma.formField.delete({
        where: { id: input.id },
      });

      await createAuditLog({
        action: 'DELETE' as AuditAction,
        entityType: 'FormField',
        entityId: input.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // Bulk reorder fields
  reorderFields: protectedProcedure
    .input(
      z.object({
        templateId: z.string(),
        fieldOrders: z.array(
          z.object({
            id: z.string(),
            order: z.number(),
            sectionId: z.string().nullable().optional(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const template = await prisma.formTemplate.findFirst({
        where: {
          id: input.templateId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!template) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Form template not found',
        });
      }

      await prisma.$transaction(
        input.fieldOrders.map((field) =>
          prisma.formField.update({
            where: { id: field.id },
            data: {
              order: field.order,
              sectionId: field.sectionId,
            },
          })
        )
      );

      await createAuditLog({
        action: 'UPDATE' as AuditAction,
        entityType: 'FormTemplate',
        entityId: input.templateId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { fieldsReordered: true },
      });

      return { success: true };
    }),
});
