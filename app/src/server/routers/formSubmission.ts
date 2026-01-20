/**
 * formSubmission router
 * Epic 04: Digital Intake System
 * US-038: Form submission and responses
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, publicProcedure } from '../trpc';
import { prisma } from '@/lib/prisma';
import { FormSubmissionStatus, FormDeliveryMethod, Prisma } from '@prisma/client';
import { createAuditLog, type AuditAction } from '@/lib/audit';
import { validateForm, FormFieldDefinition, FormValues } from '@/lib/form-validation';

// ============================================
// SCHEMAS
// ============================================

const submissionStatusSchema = z.nativeEnum(FormSubmissionStatus);
const deliveryMethodSchema = z.nativeEnum(FormDeliveryMethod);

const responseInputSchema = z.object({
  fieldId: z.string(),
  value: z.string().nullable().optional(),
  valueJson: z.any().optional(),
});

// ============================================
// ROUTER
// ============================================

export const formSubmissionRouter = router({
  // ==========================================
  // CREATE - Start a new form submission
  // ==========================================
  create: protectedProcedure
    .input(
      z.object({
        templateId: z.string(),
        patientId: z.string().optional(),
        source: deliveryMethodSchema.optional().default('PORTAL'),
        deliveryId: z.string().optional(),
        appointmentId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify template exists and is active
      const template = await prisma.formTemplate.findFirst({
        where: {
          id: input.templateId,
          organizationId: ctx.user.organizationId,
          isActive: true,
        },
      });

      if (!template) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Form template not found or inactive',
        });
      }

      // Verify patient exists if provided
      if (input.patientId) {
        const patient = await prisma.patient.findFirst({
          where: {
            id: input.patientId,
            organizationId: ctx.user.organizationId,
          },
        });

        if (!patient) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Patient not found',
          });
        }
      }

      const submission = await prisma.formSubmission.create({
        data: {
          templateId: input.templateId,
          patientId: input.patientId,
          source: input.source,
          deliveryId: input.deliveryId,
          appointmentId: input.appointmentId,
          organizationId: ctx.user.organizationId,
          status: 'DRAFT',
        },
        include: {
          template: {
            include: {
              fields: { orderBy: { order: 'asc' } },
              sections: { orderBy: { order: 'asc' } },
            },
          },
        },
      });

      await createAuditLog({
        action: 'CREATE' as AuditAction,
        entityType: 'FormSubmission',
        entityId: submission.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { created: input },
      });

      return submission;
    }),

  // ==========================================
  // GET - Get a submission by ID
  // ==========================================
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const submission = await prisma.formSubmission.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          template: {
            include: {
              fields: { orderBy: { order: 'asc' } },
              sections: { orderBy: { order: 'asc' } },
            },
          },
          patient: {
            include: {
              demographics: true,
            },
          },
          responses: {
            include: {
              field: true,
            },
          },
          signatures: true,
        },
      });

      if (!submission) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Form submission not found',
        });
      }

      return submission;
    }),

  // ==========================================
  // GET BY TOKEN - Public endpoint for patient form access
  // ==========================================
  getByToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const submission = await prisma.formSubmission.findUnique({
        where: { accessToken: input.token },
        include: {
          template: {
            include: {
              fields: { orderBy: { order: 'asc' } },
              sections: { orderBy: { order: 'asc' } },
            },
          },
          patient: {
            select: {
              id: true,
              mrn: true,
              demographics: {
                select: {
                  firstName: true,
                  lastName: true,
                  dateOfBirth: true,
                },
              },
            },
          },
          responses: {
            include: {
              field: true,
            },
          },
        },
      });

      if (!submission) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Form not found or link has expired',
        });
      }

      // Check if submission is expired
      if (submission.template.expiresInDays) {
        const expiresAt = new Date(submission.startedAt);
        expiresAt.setDate(expiresAt.getDate() + submission.template.expiresInDays);
        if (new Date() > expiresAt) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'This form link has expired',
          });
        }
      }

      // Don't allow access to completed/reviewed forms
      if (submission.status === 'COMPLETED' || submission.status === 'REJECTED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This form has already been submitted',
        });
      }

      return submission;
    }),

  // ==========================================
  // LIST - List submissions with filters
  // ==========================================
  list: protectedProcedure
    .input(
      z
        .object({
          patientId: z.string().optional(),
          templateId: z.string().optional(),
          status: submissionStatusSchema.optional(),
          source: deliveryMethodSchema.optional(),
          startDate: z.date().optional(),
          endDate: z.date().optional(),
          limit: z.number().min(1).max(100).optional().default(50),
          cursor: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.FormSubmissionWhereInput = {
        organizationId: ctx.user.organizationId,
        ...(input?.patientId && { patientId: input.patientId }),
        ...(input?.templateId && { templateId: input.templateId }),
        ...(input?.status && { status: input.status }),
        ...(input?.source && { source: input.source }),
        ...(input?.startDate || input?.endDate
          ? {
              submittedAt: {
                ...(input.startDate && { gte: input.startDate }),
                ...(input.endDate && { lte: input.endDate }),
              },
            }
          : {}),
      };

      const submissions = await prisma.formSubmission.findMany({
        where,
        include: {
          template: {
            select: {
              id: true,
              name: true,
            },
          },
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
          _count: {
            select: {
              responses: true,
              signatures: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: (input?.limit || 50) + 1,
        ...(input?.cursor && { cursor: { id: input.cursor }, skip: 1 }),
      });

      let nextCursor: string | undefined;
      if (submissions.length > (input?.limit || 50)) {
        const lastItem = submissions.pop();
        nextCursor = lastItem?.id;
      }

      return { submissions, nextCursor };
    }),

  // ==========================================
  // SAVE RESPONSES - Save field responses (draft or partial)
  // ==========================================
  saveResponses: publicProcedure
    .input(
      z.object({
        token: z.string(),
        responses: z.array(responseInputSchema),
        ipAddress: z.string().optional(),
        userAgent: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const submission = await prisma.formSubmission.findUnique({
        where: { accessToken: input.token },
        include: {
          template: {
            include: {
              fields: true,
            },
          },
        },
      });

      if (!submission) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Form submission not found',
        });
      }

      if (submission.status === 'COMPLETED' || submission.status === 'REJECTED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot modify a submitted form',
        });
      }

      // Upsert responses
      const operations = input.responses.map((response) =>
        prisma.formResponse.upsert({
          where: {
            submissionId_fieldId: {
              submissionId: submission.id,
              fieldId: response.fieldId,
            },
          },
          create: {
            submissionId: submission.id,
            fieldId: response.fieldId,
            value: response.value,
            valueJson: response.valueJson as Prisma.InputJsonValue,
          },
          update: {
            value: response.value,
            valueJson: response.valueJson as Prisma.InputJsonValue,
          },
        })
      );

      await prisma.$transaction([
        ...operations,
        prisma.formSubmission.update({
          where: { id: submission.id },
          data: {
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
          },
        }),
      ]);

      return { success: true };
    }),

  // ==========================================
  // SUBMIT - Validate and submit the form
  // ==========================================
  submit: publicProcedure
    .input(
      z.object({
        token: z.string(),
        responses: z.array(responseInputSchema),
        ipAddress: z.string().optional(),
        userAgent: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const submission = await prisma.formSubmission.findUnique({
        where: { accessToken: input.token },
        include: {
          template: {
            include: {
              fields: true,
            },
          },
        },
      });

      if (!submission) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Form submission not found',
        });
      }

      if (submission.status === 'COMPLETED' || submission.status === 'REJECTED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This form has already been submitted',
        });
      }

      // Build form values for validation
      const formValues: FormValues = {};
      for (const response of input.responses) {
        const field = submission.template.fields.find((f) => f.id === response.fieldId);
        if (field) {
          formValues[field.name] = response.value || '';
        }
      }

      // Convert Prisma fields to validation format
      const fieldDefinitions: FormFieldDefinition[] = submission.template.fields.map((f) => ({
        id: f.id,
        fieldType: f.fieldType,
        label: f.label,
        name: f.name,
        isRequired: f.isRequired,
        minLength: f.minLength,
        maxLength: f.maxLength,
        minValue: f.minValue ? Number(f.minValue) : undefined,
        maxValue: f.maxValue ? Number(f.maxValue) : undefined,
        pattern: f.pattern,
        patternMessage: f.patternMessage,
        options: f.options as Array<{ value: string; label: string }> | undefined,
        conditionalOn: f.conditionalOn,
        conditionalValue: f.conditionalValue,
        conditionalOp: f.conditionalOp as 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'is_empty' | 'is_not_empty' | undefined,
      }));

      // Validate all fields
      const validationResult = validateForm(fieldDefinitions, formValues);

      if (!validationResult.valid) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Validation failed',
          cause: validationResult.errors,
        });
      }

      // Save responses and update status
      const operations = input.responses.map((response) =>
        prisma.formResponse.upsert({
          where: {
            submissionId_fieldId: {
              submissionId: submission.id,
              fieldId: response.fieldId,
            },
          },
          create: {
            submissionId: submission.id,
            fieldId: response.fieldId,
            value: response.value,
            valueJson: response.valueJson as Prisma.InputJsonValue,
          },
          update: {
            value: response.value,
            valueJson: response.valueJson as Prisma.InputJsonValue,
          },
        })
      );

      await prisma.$transaction([
        ...operations,
        prisma.formSubmission.update({
          where: { id: submission.id },
          data: {
            status: 'PENDING',
            submittedAt: new Date(),
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
          },
        }),
      ]);

      return { success: true, submissionId: submission.id };
    }),

  // ==========================================
  // UPDATE STATUS - Update submission workflow status
  // ==========================================
  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: submissionStatusSchema,
        staffNotes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.formSubmission.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Form submission not found',
        });
      }

      const updateData: Prisma.FormSubmissionUpdateInput = {
        status: input.status,
        staffNotes: input.staffNotes,
      };

      // Track review if status is COMPLETED
      if (input.status === 'COMPLETED' && existing.status !== 'COMPLETED') {
        updateData.reviewedAt = new Date();
        updateData.reviewedBy = ctx.user.id;
      }

      const submission = await prisma.formSubmission.update({
        where: { id: input.id },
        data: updateData,
      });

      await createAuditLog({
        action: 'UPDATE' as AuditAction,
        entityType: 'FormSubmission',
        entityId: input.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          before: { status: existing.status },
          after: { status: input.status },
        },
      });

      return submission;
    }),

  // ==========================================
  // ADD SIGNATURE - Add e-signature to submission
  // ==========================================
  addSignature: publicProcedure
    .input(
      z.object({
        token: z.string(),
        signatureData: z.string(), // Base64 encoded image
        signerName: z.string().optional(),
        signerEmail: z.string().email().optional(),
        relationship: z.string().optional(),
        consentText: z.string().optional(),
        ipAddress: z.string().optional(),
        userAgent: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const submission = await prisma.formSubmission.findUnique({
        where: { accessToken: input.token },
      });

      if (!submission) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Form submission not found',
        });
      }

      if (submission.status === 'COMPLETED' || submission.status === 'REJECTED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot modify a submitted form',
        });
      }

      const signature = await prisma.eSignature.create({
        data: {
          submissionId: submission.id,
          signatureData: input.signatureData,
          signerName: input.signerName,
          signerEmail: input.signerEmail,
          relationship: input.relationship,
          consentText: input.consentText,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        },
      });

      return signature;
    }),

  // ==========================================
  // DELETE - Delete a submission (admin only)
  // ==========================================
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.formSubmission.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Form submission not found',
        });
      }

      await prisma.formSubmission.delete({
        where: { id: input.id },
      });

      await createAuditLog({
        action: 'DELETE' as AuditAction,
        entityType: 'FormSubmission',
        entityId: input.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // ==========================================
  // STATS - Get submission statistics
  // ==========================================
  stats: protectedProcedure
    .input(
      z
        .object({
          templateId: z.string().optional(),
          startDate: z.date().optional(),
          endDate: z.date().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.FormSubmissionWhereInput = {
        organizationId: ctx.user.organizationId,
        ...(input?.templateId && { templateId: input.templateId }),
        ...(input?.startDate || input?.endDate
          ? {
              createdAt: {
                ...(input?.startDate && { gte: input.startDate }),
                ...(input?.endDate && { lte: input.endDate }),
              },
            }
          : {}),
      };

      const [total, byStatus, bySource] = await Promise.all([
        prisma.formSubmission.count({ where }),
        prisma.formSubmission.groupBy({
          by: ['status'],
          where,
          _count: { status: true },
        }),
        prisma.formSubmission.groupBy({
          by: ['source'],
          where,
          _count: { source: true },
        }),
      ]);

      return {
        total,
        byStatus: byStatus.reduce(
          (acc, item) => {
            acc[item.status] = item._count.status;
            return acc;
          },
          {} as Record<string, number>
        ),
        bySource: bySource.reduce(
          (acc, item) => {
            acc[item.source] = item._count.source;
            return acc;
          },
          {} as Record<string, number>
        ),
      };
    }),
});
