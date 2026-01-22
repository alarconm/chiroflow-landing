import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import type { Prisma } from '@prisma/client';

// Validation schemas
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

// Template section schema (JSON structure for SOAP sections)
const templateSectionSchema = z.object({
  defaultText: z.string().optional(),
  sections: z.array(z.object({
    id: z.string(),
    label: z.string(),
    type: z.enum(['text', 'textarea', 'checkbox', 'select', 'multiselect', 'number']),
    placeholder: z.string().optional(),
    defaultValue: z.union([z.string(), z.boolean(), z.number(), z.array(z.string())]).optional(),
    options: z.array(z.object({
      value: z.string(),
      label: z.string(),
    })).optional(),
    required: z.boolean().optional(),
    order: z.number().optional(),
  })).optional(),
  prompts: z.array(z.string()).optional(), // Quick-insert phrases
});

// Available template variables
const TEMPLATE_VARIABLES = [
  { variable: '{{patient.firstName}}', description: "Patient's first name" },
  { variable: '{{patient.lastName}}', description: "Patient's last name" },
  { variable: '{{patient.fullName}}', description: "Patient's full name" },
  { variable: '{{patient.mrn}}', description: "Patient's medical record number" },
  { variable: '{{patient.dob}}', description: "Patient's date of birth" },
  { variable: '{{patient.age}}', description: "Patient's age" },
  { variable: '{{date}}', description: "Current date" },
  { variable: '{{encounterDate}}', description: "Encounter date" },
  { variable: '{{provider.name}}', description: "Provider's name" },
  { variable: '{{provider.credentials}}', description: "Provider's credentials" },
  { variable: '{{visitNumber}}', description: "Visit number in treatment plan" },
];

export const noteTemplateRouter = router({
  // Create a new template
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1, 'Template name is required'),
        description: z.string().optional(),
        category: encounterTypeSchema,
        subjectiveTemplate: z.union([z.string(), templateSectionSchema]).optional(),
        objectiveTemplate: z.union([z.string(), templateSectionSchema]).optional(),
        assessmentTemplate: z.union([z.string(), templateSectionSchema]).optional(),
        planTemplate: z.union([z.string(), templateSectionSchema]).optional(),
        variables: z.array(z.string()).optional(), // List of variables used
        sortOrder: z.number().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        name,
        description,
        category,
        subjectiveTemplate,
        objectiveTemplate,
        assessmentTemplate,
        planTemplate,
        variables,
        sortOrder,
      } = input;

      // Check for duplicate name in organization
      const existing = await ctx.prisma.noteTemplate.findFirst({
        where: {
          name,
          organizationId: ctx.user.organizationId,
          isActive: true,
        },
      });

      if (existing) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'A template with this name already exists',
        });
      }

      const template = await ctx.prisma.noteTemplate.create({
        data: {
          name,
          description,
          category,
          subjectiveTemplate: subjectiveTemplate as Prisma.InputJsonValue,
          objectiveTemplate: objectiveTemplate as Prisma.InputJsonValue,
          assessmentTemplate: assessmentTemplate as Prisma.InputJsonValue,
          planTemplate: planTemplate as Prisma.InputJsonValue,
          variables: variables as Prisma.InputJsonValue,
          sortOrder,
          isActive: true,
          isSystem: false,
          organizationId: ctx.user.organizationId,
        },
      });

      // Log creation
      await auditLog('CREATE', 'NoteTemplate', {
        entityId: template.id,
        changes: { name, category },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return template;
    }),

  // Get a single template
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const template = await ctx.prisma.noteTemplate.findFirst({
        where: {
          id: input.id,
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

      return template;
    }),

  // List templates
  list: protectedProcedure
    .input(
      z.object({
        category: encounterTypeSchema.optional(),
        includeSystem: z.boolean().default(true),
        includeInactive: z.boolean().default(false),
        search: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const {
        category,
        includeSystem = true,
        includeInactive = false,
        search,
      } = input ?? {};

      const orConditions: Record<string, unknown>[] = [
        { organizationId: ctx.user.organizationId },
      ];

      if (includeSystem) {
        orConditions.push({ organizationId: null });
      }

      const where: Record<string, unknown> = {
        OR: orConditions,
      };

      if (!includeInactive) {
        where.isActive = true;
      }

      if (category) {
        where.category = category;
      }

      if (search) {
        where.AND = [
          {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          },
        ];
      }

      const templates = await ctx.prisma.noteTemplate.findMany({
        where,
        orderBy: [
          { isSystem: 'desc' },
          { sortOrder: 'asc' },
          { name: 'asc' },
        ],
      });

      // Group by category for easier UI rendering
      const byCategory = templates.reduce(
        (acc, template) => {
          const cat = template.category;
          if (!acc[cat]) {
            acc[cat] = [];
          }
          acc[cat].push(template);
          return acc;
        },
        {} as Record<string, typeof templates>
      );

      return {
        templates,
        byCategory,
        total: templates.length,
      };
    }),

  // Update a template
  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        category: encounterTypeSchema.optional(),
        subjectiveTemplate: z.union([z.string(), templateSectionSchema]).optional(),
        objectiveTemplate: z.union([z.string(), templateSectionSchema]).optional(),
        assessmentTemplate: z.union([z.string(), templateSectionSchema]).optional(),
        planTemplate: z.union([z.string(), templateSectionSchema]).optional(),
        variables: z.array(z.string()).optional(),
        sortOrder: z.number().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      // Verify template exists and belongs to org (can't update system templates)
      const existing = await ctx.prisma.noteTemplate.findFirst({
        where: { id },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Template not found',
        });
      }

      if (existing.isSystem) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Cannot modify system templates. Create a copy instead.',
        });
      }

      if (existing.organizationId !== ctx.user.organizationId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Cannot modify templates from other organizations',
        });
      }

      // Check name uniqueness if name is being changed
      if (updateData.name && updateData.name !== existing.name) {
        const duplicate = await ctx.prisma.noteTemplate.findFirst({
          where: {
            name: updateData.name,
            organizationId: ctx.user.organizationId,
            isActive: true,
            id: { not: id },
          },
        });

        if (duplicate) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'A template with this name already exists',
          });
        }
      }

      // Build update data
      const data: Record<string, unknown> = {};
      if (updateData.name !== undefined) data.name = updateData.name;
      if (updateData.description !== undefined) data.description = updateData.description;
      if (updateData.category !== undefined) data.category = updateData.category;
      if (updateData.sortOrder !== undefined) data.sortOrder = updateData.sortOrder;
      if (updateData.isActive !== undefined) data.isActive = updateData.isActive;
      if (updateData.subjectiveTemplate !== undefined) {
        data.subjectiveTemplate = updateData.subjectiveTemplate as Prisma.InputJsonValue;
      }
      if (updateData.objectiveTemplate !== undefined) {
        data.objectiveTemplate = updateData.objectiveTemplate as Prisma.InputJsonValue;
      }
      if (updateData.assessmentTemplate !== undefined) {
        data.assessmentTemplate = updateData.assessmentTemplate as Prisma.InputJsonValue;
      }
      if (updateData.planTemplate !== undefined) {
        data.planTemplate = updateData.planTemplate as Prisma.InputJsonValue;
      }
      if (updateData.variables !== undefined) {
        data.variables = updateData.variables as Prisma.InputJsonValue;
      }

      const template = await ctx.prisma.noteTemplate.update({
        where: { id },
        data,
      });

      // Log update
      await auditLog('UPDATE', 'NoteTemplate', {
        entityId: id,
        changes: updateData,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return template;
    }),

  // Soft delete a template
  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.noteTemplate.findFirst({
        where: { id: input.id },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Template not found',
        });
      }

      if (existing.isSystem) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Cannot delete system templates',
        });
      }

      if (existing.organizationId !== ctx.user.organizationId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Cannot delete templates from other organizations',
        });
      }

      // Soft delete by setting isActive to false
      const template = await ctx.prisma.noteTemplate.update({
        where: { id: input.id },
        data: { isActive: false },
      });

      // Log deletion
      await auditLog('DELETE', 'NoteTemplate', {
        entityId: input.id,
        changes: { name: existing.name },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return template;
    }),

  // Duplicate (clone) a template
  duplicate: adminProcedure
    .input(
      z.object({
        id: z.string(),
        newName: z.string().min(1, 'New template name is required'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, newName } = input;

      // Get source template (can be system or org template)
      const source = await ctx.prisma.noteTemplate.findFirst({
        where: {
          id,
          OR: [
            { organizationId: ctx.user.organizationId },
            { organizationId: null }, // Allow duplicating system templates
          ],
        },
      });

      if (!source) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Template not found',
        });
      }

      // Check name uniqueness
      const existing = await ctx.prisma.noteTemplate.findFirst({
        where: {
          name: newName,
          organizationId: ctx.user.organizationId,
          isActive: true,
        },
      });

      if (existing) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'A template with this name already exists',
        });
      }

      // Create the duplicate
      const template = await ctx.prisma.noteTemplate.create({
        data: {
          name: newName,
          description: source.description ? `Copy of: ${source.description}` : `Copy of ${source.name}`,
          category: source.category,
          subjectiveTemplate: source.subjectiveTemplate ?? undefined,
          objectiveTemplate: source.objectiveTemplate ?? undefined,
          assessmentTemplate: source.assessmentTemplate ?? undefined,
          planTemplate: source.planTemplate ?? undefined,
          variables: source.variables ?? undefined,
          sortOrder: source.sortOrder,
          isActive: true,
          isSystem: false,
          organizationId: ctx.user.organizationId,
        },
      });

      // Log creation
      await auditLog('CREATE', 'NoteTemplate', {
        entityId: template.id,
        changes: { name: newName, duplicatedFrom: source.id, sourceIsSystem: source.isSystem },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return template;
    }),

  // Get available template variables
  getVariables: protectedProcedure.query(async () => {
    return TEMPLATE_VARIABLES;
  }),

  // Preview template with sample data
  preview: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        patientData: z.object({
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          dateOfBirth: z.coerce.date().optional(),
          mrn: z.string().optional(),
        }).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { id, patientData } = input;

      const template = await ctx.prisma.noteTemplate.findFirst({
        where: {
          id,
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

      // Build sample variables
      const sampleData = {
        firstName: patientData?.firstName ?? 'John',
        lastName: patientData?.lastName ?? 'Doe',
        dateOfBirth: patientData?.dateOfBirth ?? new Date('1980-01-15'),
        mrn: patientData?.mrn ?? 'MRN12345',
      };

      const variables: Record<string, string> = {
        '{{patient.firstName}}': sampleData.firstName,
        '{{patient.lastName}}': sampleData.lastName,
        '{{patient.fullName}}': `${sampleData.firstName} ${sampleData.lastName}`,
        '{{patient.mrn}}': sampleData.mrn,
        '{{patient.dob}}': sampleData.dateOfBirth.toLocaleDateString(),
        '{{patient.age}}': String(Math.floor((Date.now() - sampleData.dateOfBirth.getTime()) / 31557600000)),
        '{{date}}': new Date().toLocaleDateString(),
        '{{encounterDate}}': new Date().toLocaleDateString(),
        '{{provider.name}}': 'Dr. Sample Provider',
        '{{provider.credentials}}': 'DC',
        '{{visitNumber}}': '3',
      };

      // Apply variables to template content
      const applyVariables = (content: unknown): string | null => {
        if (!content) return null;
        let text = typeof content === 'string' ? content : JSON.stringify(content);
        for (const [key, value] of Object.entries(variables)) {
          text = text.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
        }
        return text;
      };

      return {
        template: {
          id: template.id,
          name: template.name,
          category: template.category,
        },
        preview: {
          subjective: applyVariables(template.subjectiveTemplate),
          objective: applyVariables(template.objectiveTemplate),
          assessment: applyVariables(template.assessmentTemplate),
          plan: applyVariables(template.planTemplate),
        },
        variablesUsed: variables,
      };
    }),

  // Reorder templates
  reorder: adminProcedure
    .input(
      z.object({
        orders: z.array(
          z.object({
            id: z.string(),
            sortOrder: z.number(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { orders } = input;

      // Verify all templates belong to org
      const templateIds = orders.map((o) => o.id);
      const templates = await ctx.prisma.noteTemplate.findMany({
        where: {
          id: { in: templateIds },
          organizationId: ctx.user.organizationId,
        },
      });

      if (templates.length !== templateIds.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'One or more templates not found or not accessible',
        });
      }

      // Update sort orders
      await ctx.prisma.$transaction(
        orders.map((order) =>
          ctx.prisma.noteTemplate.update({
            where: { id: order.id },
            data: { sortOrder: order.sortOrder },
          })
        )
      );

      return { success: true };
    }),

  // Get template usage statistics
  getUsageStats: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const template = await ctx.prisma.noteTemplate.findFirst({
        where: {
          id: input.id,
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

      // Count SOAP notes using this template
      const usageCount = await ctx.prisma.sOAPNote.count({
        where: {
          templateId: input.id,
          encounter: { organizationId: ctx.user.organizationId },
        },
      });

      // Get recent usage
      const recentUses = await ctx.prisma.sOAPNote.findMany({
        where: {
          templateId: input.id,
          encounter: { organizationId: ctx.user.organizationId },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          createdAt: true,
          encounter: {
            select: {
              encounterDate: true,
              patient: {
                select: {
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
        },
      });

      return {
        templateId: input.id,
        templateName: template.name,
        totalUses: usageCount,
        recentUses: recentUses.map((use) => ({
          soapNoteId: use.id,
          date: use.createdAt,
          encounterDate: use.encounter.encounterDate,
          patientName: `${use.encounter.patient.demographics?.firstName ?? ''} ${use.encounter.patient.demographics?.lastName ?? ''}`.trim(),
          patientMrn: use.encounter.patient.mrn,
        })),
      };
    }),
});
