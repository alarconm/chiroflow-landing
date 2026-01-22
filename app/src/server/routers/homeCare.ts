import { z } from 'zod';
import { router, protectedProcedure, providerProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import { notificationService } from '@/lib/notification-service';
import { HomeCareInstructionStatus } from '@prisma/client';

// Validation schemas
const homeCareStatusSchema = z.enum(['ACTIVE', 'COMPLETED', 'EXPIRED']);

// Ice/Heat protocol schema
const iceHeatProtocolSchema = z.object({
  type: z.enum(['ice', 'heat', 'alternate']),
  duration: z.number().int().positive(), // minutes
  frequency: z.string(), // e.g., "every 2 hours", "3 times daily"
  area: z.string(), // body area to apply
  specialInstructions: z.string().optional(),
});

// Activity modification schema
const activityModificationSchema = z.object({
  activity: z.string(),
  modification: z.enum(['avoid', 'limit', 'modify', 'encouraged']),
  details: z.string().optional(),
  durationDays: z.number().int().positive().optional(),
});

// Ergonomic recommendation schema
const ergonomicRecSchema = z.object({
  area: z.string(), // workspace, driving, sleeping, etc.
  recommendation: z.string(),
  priority: z.enum(['required', 'recommended', 'optional']).default('recommended'),
});

// Warning sign schema
const warningSignSchema = z.object({
  symptom: z.string(),
  action: z.string(), // what to do if symptom occurs
  urgency: z.enum(['emergency', 'urgent', 'monitor']),
});

export const homeCareRouter = router({
  // List home care instructions for a patient
  list: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        status: homeCareStatusSchema.optional(),
        encounterId: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { patientId, status, encounterId, limit, offset } = input;

      // Verify patient belongs to organization
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

      const where: Record<string, unknown> = {
        patientId,
        organizationId: ctx.user.organizationId,
      };

      if (status) {
        where.status = status;
      }

      if (encounterId) {
        where.encounterId = encounterId;
      }

      const [instructions, total] = await Promise.all([
        ctx.prisma.homeCareInstruction.findMany({
          where,
          include: {
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
            encounter: {
              select: {
                id: true,
                encounterDate: true,
                encounterType: true,
                chiefComplaint: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        ctx.prisma.homeCareInstruction.count({ where }),
      ]);

      return {
        instructions,
        total,
        limit,
        offset,
        hasMore: offset + instructions.length < total,
      };
    }),

  // Get a single home care instruction with full details
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const instruction = await ctx.prisma.homeCareInstruction.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
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
          provider: {
            select: {
              id: true,
              title: true,
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          encounter: {
            select: {
              id: true,
              encounterDate: true,
              encounterType: true,
              chiefComplaint: true,
            },
          },
        },
      });

      if (!instruction) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Home care instruction not found',
        });
      }

      return instruction;
    }),

  // Create a new home care instruction (provider only)
  create: providerProcedure
    .input(
      z.object({
        patientId: z.string(),
        encounterId: z.string().optional().nullable(),
        // Main instructions
        instructions: z.string().min(1, 'Instructions are required'),
        // Ice/Heat protocols
        iceProtocol: z.string().optional().nullable(),
        heatProtocol: z.string().optional().nullable(),
        // Activity modifications
        activityMods: z.string().optional().nullable(),
        // Ergonomic recommendations
        ergonomicRecs: z.string().optional().nullable(),
        // Warning signs
        warningSigns: z.string().optional().nullable(),
        // Follow-up instructions
        followUpInstr: z.string().optional().nullable(),
        // Duration
        durationDays: z.number().int().positive().optional().nullable(),
        startDate: z.date().optional(),
        endDate: z.date().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        patientId,
        encounterId,
        instructions,
        iceProtocol,
        heatProtocol,
        activityMods,
        ergonomicRecs,
        warningSigns,
        followUpInstr,
        durationDays,
        startDate,
        endDate,
      } = input;

      // Verify patient belongs to organization
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          demographics: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          contacts: {
            where: { isPrimary: true },
            select: { email: true },
          },
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Get provider for current user
      const provider = await ctx.prisma.provider.findFirst({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!provider) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You must be a provider to create home care instructions',
        });
      }

      // Verify encounter if provided
      if (encounterId) {
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
      }

      // Calculate end date if duration provided
      const calculatedEndDate = endDate ?? (durationDays
        ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)
        : null);

      const homeCareInstruction = await ctx.prisma.homeCareInstruction.create({
        data: {
          patientId,
          providerId: provider.id,
          organizationId: ctx.user.organizationId,
          encounterId,
          instructions,
          iceProtocol,
          heatProtocol,
          activityMods,
          ergonomicRecs,
          warningSigns,
          followUpInstr,
          durationDays,
          startDate: startDate ?? new Date(),
          endDate: calculatedEndDate,
          status: 'ACTIVE',
        },
        include: {
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
      });

      const patientName = patient.demographics
        ? `${patient.demographics.firstName} ${patient.demographics.lastName}`
        : 'Unknown Patient';

      await auditLog('CREATE', 'HomeCareInstruction', {
        entityId: homeCareInstruction.id,
        changes: {
          patientName,
          hasIceProtocol: !!iceProtocol,
          hasHeatProtocol: !!heatProtocol,
          hasActivityMods: !!activityMods,
          hasErgonomicRecs: !!ergonomicRecs,
          hasWarningSigns: !!warningSigns,
          durationDays,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return homeCareInstruction;
    }),

  // Update a home care instruction (provider only)
  update: providerProcedure
    .input(
      z.object({
        id: z.string(),
        instructions: z.string().optional(),
        iceProtocol: z.string().optional().nullable(),
        heatProtocol: z.string().optional().nullable(),
        activityMods: z.string().optional().nullable(),
        ergonomicRecs: z.string().optional().nullable(),
        warningSigns: z.string().optional().nullable(),
        followUpInstr: z.string().optional().nullable(),
        durationDays: z.number().int().positive().optional().nullable(),
        endDate: z.date().optional().nullable(),
        status: homeCareStatusSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      // Verify instruction exists and belongs to organization
      const existing = await ctx.prisma.homeCareInstruction.findFirst({
        where: {
          id,
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

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Home care instruction not found',
        });
      }

      // Build update object
      const dataToUpdate: Record<string, unknown> = {};

      if (updateData.instructions !== undefined) dataToUpdate.instructions = updateData.instructions;
      if (updateData.iceProtocol !== undefined) dataToUpdate.iceProtocol = updateData.iceProtocol;
      if (updateData.heatProtocol !== undefined) dataToUpdate.heatProtocol = updateData.heatProtocol;
      if (updateData.activityMods !== undefined) dataToUpdate.activityMods = updateData.activityMods;
      if (updateData.ergonomicRecs !== undefined) dataToUpdate.ergonomicRecs = updateData.ergonomicRecs;
      if (updateData.warningSigns !== undefined) dataToUpdate.warningSigns = updateData.warningSigns;
      if (updateData.followUpInstr !== undefined) dataToUpdate.followUpInstr = updateData.followUpInstr;
      if (updateData.durationDays !== undefined) dataToUpdate.durationDays = updateData.durationDays;
      if (updateData.endDate !== undefined) dataToUpdate.endDate = updateData.endDate;
      if (updateData.status !== undefined) dataToUpdate.status = updateData.status;

      const instruction = await ctx.prisma.homeCareInstruction.update({
        where: { id },
        data: dataToUpdate,
        include: {
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
      });

      await auditLog('UPDATE', 'HomeCareInstruction', {
        entityId: id,
        changes: updateData,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return instruction;
    }),

  // Complete/expire a home care instruction (provider only)
  complete: providerProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(['COMPLETED', 'EXPIRED']).default('COMPLETED'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, status } = input;

      const existing = await ctx.prisma.homeCareInstruction.findFirst({
        where: {
          id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Home care instruction not found',
        });
      }

      const instruction = await ctx.prisma.homeCareInstruction.update({
        where: { id },
        data: {
          status,
          endDate: new Date(),
        },
        include: {
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
      });

      await auditLog('UPDATE', 'HomeCareInstruction', {
        entityId: id,
        changes: { status, completedAt: new Date() },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return instruction;
    }),

  // Send home care instructions to patient (provider only)
  send: providerProcedure
    .input(
      z.object({
        id: z.string(),
        method: z.enum(['email', 'portal']),
        email: z.string().email().optional(), // Override patient email
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, method, email: overrideEmail } = input;

      // Get instruction with patient details
      const instruction = await ctx.prisma.homeCareInstruction.findFirst({
        where: {
          id,
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
              contacts: {
                where: { isPrimary: true },
                select: { email: true },
              },
            },
          },
          provider: {
            select: {
              id: true,
              title: true,
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          encounter: {
            select: {
              encounterDate: true,
              chiefComplaint: true,
            },
          },
        },
      });

      if (!instruction) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Home care instruction not found',
        });
      }

      const patientEmail = overrideEmail || instruction.patient?.contacts?.[0]?.email;
      const patientName = instruction.patient?.demographics
        ? `${instruction.patient.demographics.firstName} ${instruction.patient.demographics.lastName}`
        : 'Patient';

      if (method === 'email') {
        if (!patientEmail) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No email address available for patient',
          });
        }

        const providerName = instruction.provider?.user
          ? `${instruction.provider.user.firstName} ${instruction.provider.user.lastName}${instruction.provider.title ? ', ' + instruction.provider.title : ''}`
          : 'Your Provider';

        // Generate HTML content for email
        const htmlContent = generateHomeCareEmailHtml(instruction, patientName, providerName);

        // Send email
        const result = await notificationService.sendEmail(
          patientEmail,
          'Your Home Care Instructions',
          `Dear ${patientName}, please find your home care instructions attached.`,
          { html: htmlContent }
        );

        if (!result.success) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to send email: ${result.error}`,
          });
        }

        // Update delivery status
        await ctx.prisma.homeCareInstruction.update({
          where: { id },
          data: {
            deliveredAt: new Date(),
            deliveryMethod: 'email',
          },
        });

        await auditLog('UPDATE', 'HomeCareInstruction', {
          entityId: id,
          changes: {
            method: 'email',
            recipientEmail: patientEmail,
            patientName,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return {
          success: true,
          method: 'email',
          sentTo: patientEmail,
          messageId: result.messageId,
        };
      }

      if (method === 'portal') {
        // Create a secure message in the patient portal
        // For now, just mark as delivered via portal
        await ctx.prisma.homeCareInstruction.update({
          where: { id },
          data: {
            deliveredAt: new Date(),
            deliveryMethod: 'portal',
          },
        });

        await auditLog('UPDATE', 'HomeCareInstruction', {
          entityId: id,
          changes: {
            method: 'portal',
            patientName,
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return {
          success: true,
          method: 'portal',
          message: 'Instructions are now available in the patient portal',
        };
      }

      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Invalid delivery method',
      });
    }),

  // Generate printable PDF content (returns HTML for printing)
  generatePrintable: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const instruction = await ctx.prisma.homeCareInstruction.findFirst({
        where: {
          id: input.id,
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
            select: {
              id: true,
              title: true,
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          encounter: {
            select: {
              encounterDate: true,
              chiefComplaint: true,
            },
          },
          organization: {
            select: {
              name: true,
              settings: true,
            },
          },
        },
      });

      if (!instruction) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Home care instruction not found',
        });
      }

      const patientName = instruction.patient?.demographics
        ? `${instruction.patient.demographics.firstName} ${instruction.patient.demographics.lastName}`
        : 'Patient';

      const providerName = instruction.provider?.user
        ? `${instruction.provider.user.firstName} ${instruction.provider.user.lastName}${instruction.provider.title ? ', ' + instruction.provider.title : ''}`
        : 'Provider';

      // Generate printable HTML
      const html = generatePrintableHtml(instruction, patientName, providerName);

      // Store PDF URL reference (in production, would generate actual PDF)
      await ctx.prisma.homeCareInstruction.update({
        where: { id: input.id },
        data: {
          pdfUrl: `/api/home-care/${input.id}/pdf`,
        },
      });

      return {
        html,
        pdfUrl: `/api/home-care/${input.id}/pdf`,
        patientName,
        providerName,
        createdAt: instruction.createdAt,
      };
    }),

  // Get active instructions for patient (for patient portal)
  getActiveForPatient: protectedProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      const instructions = await ctx.prisma.homeCareInstruction.findMany({
        where: {
          patientId: input.patientId,
          organizationId: ctx.user.organizationId,
          status: 'ACTIVE',
          OR: [
            { endDate: null },
            { endDate: { gte: new Date() } },
          ],
        },
        include: {
          provider: {
            select: {
              id: true,
              title: true,
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          encounter: {
            select: {
              id: true,
              encounterDate: true,
              chiefComplaint: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return {
        instructions,
        count: instructions.length,
      };
    }),

  // Create from template (provider only)
  createFromTemplate: providerProcedure
    .input(
      z.object({
        patientId: z.string(),
        encounterId: z.string().optional().nullable(),
        templateType: z.enum([
          'general',
          'spinal_adjustment',
          'soft_tissue',
          'acute_injury',
          'chronic_pain',
          'post_treatment',
        ]),
        customizations: z.object({
          area: z.string().optional(),
          durationDays: z.number().int().positive().optional(),
          additionalInstructions: z.string().optional(),
        }).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, encounterId, templateType, customizations } = input;

      // Get template content based on type
      const template = getHomeCareTemplate(templateType, customizations);

      // Verify patient belongs to organization
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

      // Get provider for current user
      const provider = await ctx.prisma.provider.findFirst({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!provider) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You must be a provider to create home care instructions',
        });
      }

      // Verify encounter if provided
      if (encounterId) {
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
      }

      const durationDays = customizations?.durationDays ?? template.durationDays;
      const endDate = durationDays
        ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)
        : null;

      const homeCareInstruction = await ctx.prisma.homeCareInstruction.create({
        data: {
          patientId,
          providerId: provider.id,
          organizationId: ctx.user.organizationId,
          encounterId,
          instructions: template.instructions + (customizations?.additionalInstructions ? '\n\n' + customizations.additionalInstructions : ''),
          iceProtocol: template.iceProtocol,
          heatProtocol: template.heatProtocol,
          activityMods: template.activityMods,
          ergonomicRecs: template.ergonomicRecs,
          warningSigns: template.warningSigns,
          followUpInstr: template.followUpInstr,
          durationDays,
          startDate: new Date(),
          endDate,
          status: 'ACTIVE',
        },
        include: {
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
      });

      await auditLog('CREATE', 'HomeCareInstruction', {
        entityId: homeCareInstruction.id,
        changes: {
          templateType,
          customizations,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return homeCareInstruction;
    }),

  // Get available templates
  getTemplates: protectedProcedure.query(async () => {
    return [
      {
        type: 'general',
        name: 'General Home Care',
        description: 'Basic home care instructions for general wellness',
      },
      {
        type: 'spinal_adjustment',
        name: 'Post-Adjustment Care',
        description: 'Instructions following spinal adjustment',
      },
      {
        type: 'soft_tissue',
        name: 'Soft Tissue Therapy',
        description: 'Care after soft tissue treatment',
      },
      {
        type: 'acute_injury',
        name: 'Acute Injury Protocol',
        description: 'R.I.C.E. protocol for acute injuries',
      },
      {
        type: 'chronic_pain',
        name: 'Chronic Pain Management',
        description: 'Long-term pain management strategies',
      },
      {
        type: 'post_treatment',
        name: 'Post-Treatment Recovery',
        description: 'General post-treatment recovery instructions',
      },
    ];
  }),
});

// Helper function to generate email HTML
function generateHomeCareEmailHtml(
  instruction: {
    instructions: string;
    iceProtocol: string | null;
    heatProtocol: string | null;
    activityMods: string | null;
    ergonomicRecs: string | null;
    warningSigns: string | null;
    followUpInstr: string | null;
    durationDays: number | null;
    startDate: Date;
    endDate: Date | null;
  },
  patientName: string,
  providerName: string
): string {
  const formatDate = (date: Date) => date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  let html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    h1 { color: #053e67; border-bottom: 2px solid #053e67; padding-bottom: 10px; }
    h2 { color: #053e67; margin-top: 20px; }
    .section { background: #f9fafb; padding: 15px; border-radius: 8px; margin: 15px 0; }
    .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 15px 0; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 0.9em; color: #6b7280; }
  </style>
</head>
<body>
  <h1>Home Care Instructions</h1>
  <p>Dear ${patientName},</p>
  <p>Please follow these home care instructions as discussed during your visit.</p>

  <div class="section">
    <h2>Instructions</h2>
    <p>${instruction.instructions.replace(/\n/g, '<br>')}</p>
  </div>
`;

  if (instruction.iceProtocol) {
    html += `
  <div class="section">
    <h2>Ice Therapy</h2>
    <p>${instruction.iceProtocol.replace(/\n/g, '<br>')}</p>
  </div>
`;
  }

  if (instruction.heatProtocol) {
    html += `
  <div class="section">
    <h2>Heat Therapy</h2>
    <p>${instruction.heatProtocol.replace(/\n/g, '<br>')}</p>
  </div>
`;
  }

  if (instruction.activityMods) {
    html += `
  <div class="section">
    <h2>Activity Modifications</h2>
    <p>${instruction.activityMods.replace(/\n/g, '<br>')}</p>
  </div>
`;
  }

  if (instruction.ergonomicRecs) {
    html += `
  <div class="section">
    <h2>Ergonomic Recommendations</h2>
    <p>${instruction.ergonomicRecs.replace(/\n/g, '<br>')}</p>
  </div>
`;
  }

  if (instruction.warningSigns) {
    html += `
  <div class="warning">
    <h2>⚠️ Warning Signs</h2>
    <p>Contact your provider immediately if you experience:</p>
    <p>${instruction.warningSigns.replace(/\n/g, '<br>')}</p>
  </div>
`;
  }

  if (instruction.followUpInstr) {
    html += `
  <div class="section">
    <h2>Follow-Up Instructions</h2>
    <p>${instruction.followUpInstr.replace(/\n/g, '<br>')}</p>
  </div>
`;
  }

  html += `
  <div class="footer">
    <p><strong>Duration:</strong> ${instruction.durationDays ? `${instruction.durationDays} days` : 'As needed'}</p>
    <p><strong>Effective:</strong> ${formatDate(instruction.startDate)}${instruction.endDate ? ` to ${formatDate(instruction.endDate)}` : ''}</p>
    <p><strong>Provider:</strong> ${providerName}</p>
    <p>If you have any questions, please contact our office.</p>
  </div>
</body>
</html>
`;

  return html;
}

// Helper function to generate printable HTML
function generatePrintableHtml(
  instruction: {
    instructions: string;
    iceProtocol: string | null;
    heatProtocol: string | null;
    activityMods: string | null;
    ergonomicRecs: string | null;
    warningSigns: string | null;
    followUpInstr: string | null;
    durationDays: number | null;
    startDate: Date;
    endDate: Date | null;
    organization: { name: string; settings: unknown };
  },
  patientName: string,
  providerName: string
): string {
  const formatDate = (date: Date) => date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  let html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    @media print {
      body { margin: 0; padding: 20px; }
      .no-print { display: none; }
    }
    body { font-family: 'Times New Roman', serif; line-height: 1.6; color: #000; max-width: 800px; margin: 0 auto; padding: 40px; }
    .header { text-align: center; border-bottom: 2px solid #053e67; padding-bottom: 20px; margin-bottom: 20px; }
    .header h1 { color: #053e67; margin: 0; font-size: 24px; }
    .header p { margin: 5px 0; color: #666; }
    .patient-info { background: #f5f5f5; padding: 15px; margin-bottom: 20px; }
    h2 { color: #053e67; border-bottom: 1px solid #ccc; padding-bottom: 5px; margin-top: 25px; font-size: 16px; }
    .section { margin-bottom: 15px; }
    .section p { margin: 5px 0; }
    .warning { border: 2px solid #c90000; padding: 15px; margin: 20px 0; background: #fff5f5; }
    .warning h2 { color: #c90000; border: none; }
    .signature-line { margin-top: 40px; border-top: 1px solid #000; width: 300px; padding-top: 5px; }
    .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #ccc; font-size: 12px; color: #666; }
    @page { margin: 1in; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${instruction.organization.name}</h1>
    <p>Home Care Instructions</p>
  </div>

  <div class="patient-info">
    <p><strong>Patient:</strong> ${patientName}</p>
    <p><strong>Date:</strong> ${formatDate(instruction.startDate)}</p>
    <p><strong>Provider:</strong> ${providerName}</p>
    ${instruction.durationDays ? `<p><strong>Duration:</strong> ${instruction.durationDays} days</p>` : ''}
  </div>

  <div class="section">
    <h2>Instructions</h2>
    <p>${instruction.instructions.replace(/\n/g, '<br>')}</p>
  </div>
`;

  if (instruction.iceProtocol) {
    html += `
  <div class="section">
    <h2>Ice Therapy Protocol</h2>
    <p>${instruction.iceProtocol.replace(/\n/g, '<br>')}</p>
  </div>
`;
  }

  if (instruction.heatProtocol) {
    html += `
  <div class="section">
    <h2>Heat Therapy Protocol</h2>
    <p>${instruction.heatProtocol.replace(/\n/g, '<br>')}</p>
  </div>
`;
  }

  if (instruction.activityMods) {
    html += `
  <div class="section">
    <h2>Activity Modifications</h2>
    <p>${instruction.activityMods.replace(/\n/g, '<br>')}</p>
  </div>
`;
  }

  if (instruction.ergonomicRecs) {
    html += `
  <div class="section">
    <h2>Ergonomic Recommendations</h2>
    <p>${instruction.ergonomicRecs.replace(/\n/g, '<br>')}</p>
  </div>
`;
  }

  if (instruction.warningSigns) {
    html += `
  <div class="warning">
    <h2>⚠ Warning Signs - Contact Provider Immediately</h2>
    <p>${instruction.warningSigns.replace(/\n/g, '<br>')}</p>
  </div>
`;
  }

  if (instruction.followUpInstr) {
    html += `
  <div class="section">
    <h2>Follow-Up Instructions</h2>
    <p>${instruction.followUpInstr.replace(/\n/g, '<br>')}</p>
  </div>
`;
  }

  html += `
  <div class="footer">
    <p>Questions? Contact our office during business hours.</p>
    <p>This document was generated on ${formatDate(new Date())} and is valid for the duration specified above.</p>
  </div>

  <div class="no-print" style="margin-top: 20px; text-align: center;">
    <button onclick="window.print()" style="padding: 10px 20px; font-size: 16px; cursor: pointer;">Print Instructions</button>
  </div>
</body>
</html>
`;

  return html;
}

// Helper function to get template content
function getHomeCareTemplate(
  templateType: string,
  customizations?: { area?: string; durationDays?: number }
): {
  instructions: string;
  iceProtocol: string | null;
  heatProtocol: string | null;
  activityMods: string | null;
  ergonomicRecs: string | null;
  warningSigns: string;
  followUpInstr: string;
  durationDays: number;
} {
  const area = customizations?.area || 'the affected area';

  const templates: Record<string, ReturnType<typeof getHomeCareTemplate>> = {
    general: {
      instructions: `Follow these general home care instructions to support your recovery:\n\n1. Rest adequately but stay moderately active\n2. Stay hydrated - drink 8-10 glasses of water daily\n3. Maintain good posture throughout the day\n4. Avoid staying in one position for too long\n5. Perform any prescribed exercises as directed`,
      iceProtocol: null,
      heatProtocol: null,
      activityMods: `- Avoid heavy lifting (over 10 lbs)\n- Take breaks every 30-45 minutes when sitting\n- Avoid sudden, jerky movements`,
      ergonomicRecs: `- Ensure your workspace is properly set up\n- Use a supportive chair with good lumbar support\n- Position your computer screen at eye level`,
      warningSigns: `- Severe or worsening pain\n- Numbness or tingling that spreads\n- Loss of bladder or bowel control\n- Fever over 101°F\n- Weakness in arms or legs`,
      followUpInstr: 'Please schedule a follow-up appointment within 1-2 weeks to assess your progress.',
      durationDays: 14,
    },
    spinal_adjustment: {
      instructions: `Following your spinal adjustment, please follow these guidelines:\n\n1. Rest for the remainder of the day if possible\n2. Drink plenty of water to help flush toxins\n3. Some soreness is normal for 24-48 hours\n4. Avoid strenuous activity for 24 hours\n5. Sleep on your back or side with proper pillow support`,
      iceProtocol: `Apply ice to ${area} for 15-20 minutes every 2-3 hours as needed for the first 24-48 hours. Use a thin cloth between ice and skin.`,
      heatProtocol: `After 48 hours, you may switch to heat therapy. Apply for 15-20 minutes, 3 times daily.`,
      activityMods: `- Avoid heavy lifting for 48 hours\n- No high-impact exercise for 24 hours\n- Avoid twisting or bending excessively\n- Take it easy with yard work or housework`,
      ergonomicRecs: `- Sleep on a firm mattress\n- Use a cervical pillow if recommended\n- Avoid sleeping on your stomach\n- Sit with feet flat on the floor`,
      warningSigns: `- Severe pain that doesn't improve with rest\n- New numbness or tingling\n- Difficulty walking or maintaining balance\n- Fever or chills\n- Loss of bladder/bowel control (emergency)`,
      followUpInstr: 'Your next adjustment is recommended within 3-5 days. Call to schedule if not already booked.',
      durationDays: 7,
    },
    soft_tissue: {
      instructions: `After your soft tissue therapy session:\n\n1. Some tenderness is normal and should subside within 24-48 hours\n2. Gentle stretching can help maintain the benefits of treatment\n3. Stay well hydrated\n4. Light walking is encouraged\n5. Avoid massage directly over any bruised areas`,
      iceProtocol: `Apply ice to ${area} for 10-15 minutes if you experience any swelling or increased tenderness. Do not apply ice for more than 20 minutes at a time.`,
      heatProtocol: `Warm baths or showers can help relax muscles. Avoid hot tubs for 24 hours after treatment.`,
      activityMods: `- Avoid intense exercise for 24 hours\n- Gentle stretching is encouraged\n- Avoid prolonged static positions\n- Listen to your body - rest if needed`,
      ergonomicRecs: `- Stretch regularly throughout the day\n- Take movement breaks every hour\n- Maintain good posture\n- Consider a standing desk if available`,
      warningSigns: `- Severe bruising or swelling\n- Pain that worsens significantly\n- Numbness or tingling\n- Fever or signs of infection`,
      followUpInstr: 'Schedule your next session within 1-2 weeks for optimal results.',
      durationDays: 7,
    },
    acute_injury: {
      instructions: `For acute injury care, follow the R.I.C.E. protocol:\n\n**R**est - Avoid activities that cause pain\n**I**ce - Apply cold therapy (see ice protocol)\n**C**ompression - Use elastic bandage if appropriate\n**E**levation - Keep ${area} elevated when possible`,
      iceProtocol: `Apply ice to ${area} for 15-20 minutes every 2 hours for the first 48-72 hours. Always use a barrier between ice and skin. Do not fall asleep with ice on.`,
      heatProtocol: null,
      activityMods: `- Complete rest from aggravating activities\n- No sports or exercise until cleared\n- Use assistive devices if prescribed (crutches, sling, etc.)\n- Modify work duties if necessary`,
      ergonomicRecs: `- Keep ${area} supported and elevated\n- Use pillows for positioning\n- Avoid positions that increase pain`,
      warningSigns: `- Severe swelling that continues to worsen\n- Inability to bear weight (if applicable)\n- Severe bruising or deformity\n- Numbness or loss of pulse below injury\n- Pain not controlled with ice and rest\n- Signs of infection (increased redness, warmth, fever)`,
      followUpInstr: 'Return to office in 2-3 days for re-evaluation. If symptoms worsen, contact us immediately or go to urgent care.',
      durationDays: 7,
    },
    chronic_pain: {
      instructions: `Managing chronic pain requires a comprehensive approach:\n\n1. Pace your activities - avoid overdoing it on good days\n2. Practice stress management techniques\n3. Maintain a consistent sleep schedule\n4. Stay as active as possible within your limits\n5. Keep a pain diary to track triggers and patterns`,
      iceProtocol: `Ice can be helpful for flare-ups. Apply to ${area} for 15-20 minutes as needed, up to 4 times daily.`,
      heatProtocol: `Heat therapy can help with chronic muscle tension. Apply moist heat to ${area} for 15-20 minutes before activity or as needed for comfort.`,
      activityMods: `- Use pacing strategies - alternate activity with rest\n- Break tasks into smaller segments\n- Avoid activities that consistently trigger pain\n- Gradually increase activity levels`,
      ergonomicRecs: `- Optimize your home and work environment\n- Use supportive furniture\n- Consider ergonomic tools and aids\n- Take regular breaks from any sustained position`,
      warningSigns: `- Sudden severe increase in pain\n- New symptoms (numbness, weakness)\n- Pain that wakes you from sleep consistently\n- Signs of depression or anxiety\n- Medication not controlling pain as expected`,
      followUpInstr: 'Regular follow-up appointments are important for chronic pain management. Schedule your next visit within 4 weeks.',
      durationDays: 30,
    },
    post_treatment: {
      instructions: `Post-treatment recovery guidelines:\n\n1. Rest as needed but maintain light activity\n2. Stay hydrated throughout the day\n3. Follow any specific exercises provided\n4. Take any prescribed medications as directed\n5. Monitor your symptoms and note any changes`,
      iceProtocol: `If experiencing any discomfort, apply ice to ${area} for 15-20 minutes, 3-4 times daily as needed.`,
      heatProtocol: `Heat may be used for muscle relaxation after 48 hours if recommended by your provider.`,
      activityMods: `- Return to normal activities gradually\n- Avoid high-impact activities for 24-48 hours\n- Listen to your body\n- Take rest breaks as needed`,
      ergonomicRecs: `- Maintain good posture\n- Set up your workspace ergonomically\n- Use proper body mechanics for lifting\n- Take regular movement breaks`,
      warningSigns: `- Worsening pain despite rest\n- New or increasing numbness/tingling\n- Fever or signs of infection\n- Severe headache\n- Any concerning symptoms`,
      followUpInstr: 'Your follow-up appointment should be scheduled within 1-2 weeks. Contact our office if you have any concerns before then.',
      durationDays: 14,
    },
  };

  return templates[templateType] || templates.general;
}
