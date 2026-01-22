import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import {
  notificationService,
  processTemplate,
  normalizePhoneNumber,
  type TemplateVariables,
} from '@/lib/notification-service';
import type { CommunicationChannel, MessageStatus, MessageDirection, CommunicationType, Prisma } from '@prisma/client';

// Enums as Zod schemas
const communicationChannelSchema = z.enum(['SMS', 'EMAIL', 'VOICE', 'PORTAL', 'IN_APP']);
const messageStatusSchema = z.enum(['PENDING', 'SENT', 'DELIVERED', 'FAILED', 'READ', 'BOUNCED']);
const messageDirectionSchema = z.enum(['OUTBOUND', 'INBOUND']);
const communicationTypeSchema = z.enum([
  'APPOINTMENT_REMINDER',
  'APPOINTMENT_CONFIRMATION',
  'APPOINTMENT_CANCELLATION',
  'APPOINTMENT_RESCHEDULE',
  'FORM_REQUEST',
  'PAYMENT_REMINDER',
  'BIRTHDAY',
  'RECALL',
  'MARKETING',
  'GENERAL',
  'CUSTOM',
]);

export const communicationRouter = router({
  // ==================== Message Templates ====================

  // Create message template
  createTemplate: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        type: communicationTypeSchema,
        channel: communicationChannelSchema,
        subject: z.string().optional(),
        body: z.string().min(1),
        variables: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const template = await ctx.prisma.messageTemplate.create({
        data: {
          name: input.name,
          description: input.description,
          type: input.type,
          channel: input.channel,
          subject: input.subject,
          body: input.body,
          variables: input.variables as Prisma.InputJsonValue,
          organizationId: ctx.user.organizationId,
        },
      });

      await auditLog('CREATE', 'MessageTemplate', {
        entityId: template.id,
        changes: { name: input.name, type: input.type, channel: input.channel },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return template;
    }),

  // List templates
  listTemplates: protectedProcedure
    .input(
      z.object({
        type: communicationTypeSchema.optional(),
        channel: communicationChannelSchema.optional(),
        includeSystem: z.boolean().default(true),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const { type, channel, includeSystem = true } = input || {};

      const where: Prisma.MessageTemplateWhereInput = {
        isActive: true,
        OR: [
          { organizationId: ctx.user.organizationId },
          ...(includeSystem ? [{ organizationId: null }] : []),
        ],
      };

      if (type) where.type = type;
      if (channel) where.channel = channel;

      return ctx.prisma.messageTemplate.findMany({
        where,
        orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      });
    }),

  // Get template by ID
  getTemplate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const template = await ctx.prisma.messageTemplate.findFirst({
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

      return template;
    }),

  // Update template
  updateTemplate: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        subject: z.string().optional(),
        body: z.string().min(1).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      // Verify template exists and belongs to org
      const existing = await ctx.prisma.messageTemplate.findFirst({
        where: {
          id,
          organizationId: ctx.user.organizationId,
          isSystem: false, // Can't update system templates
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Template not found or cannot be modified',
        });
      }

      const template = await ctx.prisma.messageTemplate.update({
        where: { id },
        data: updateData,
      });

      await auditLog('UPDATE', 'MessageTemplate', {
        entityId: id,
        changes: updateData,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return template;
    }),

  // ==================== Messages ====================

  // Send a message
  sendMessage: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        channel: communicationChannelSchema,
        type: communicationTypeSchema.default('GENERAL'),
        templateId: z.string().optional(),
        subject: z.string().optional(),
        body: z.string().optional(),
        scheduledAt: z.coerce.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, channel, type, templateId, subject, body, scheduledAt } = input;

      // Get patient with contact info
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          demographics: true,
          contacts: {
            where: { isPrimary: true },
            take: 1,
          },
          communicationPreference: true,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Check communication preference
      const prefs = patient.communicationPreference;
      if (prefs) {
        if (channel === 'SMS' && !prefs.allowSms) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Patient has opted out of SMS communications',
          });
        }
        if (channel === 'EMAIL' && !prefs.allowEmail) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Patient has opted out of email communications',
          });
        }
      }

      // Get template if specified
      let template;
      let messageBody = body || '';
      let messageSubject = subject;

      if (templateId) {
        template = await ctx.prisma.messageTemplate.findFirst({
          where: {
            id: templateId,
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

        messageBody = template.body;
        messageSubject = template.subject || undefined;
      }

      if (!messageBody) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Message body is required',
        });
      }

      // Get recipient contact info
      const primaryContact = patient.contacts[0];
      let recipient = '';

      if (channel === 'SMS') {
        recipient = primaryContact?.mobilePhone || primaryContact?.homePhone || '';
        if (!recipient) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Patient has no phone number on file',
          });
        }
        recipient = normalizePhoneNumber(recipient);
      } else if (channel === 'EMAIL') {
        recipient = primaryContact?.email || '';
        if (!recipient) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Patient has no email address on file',
          });
        }
      }

      // Build template variables
      const variables: TemplateVariables = {
        patient: {
          firstName: patient.demographics?.firstName || '',
          lastName: patient.demographics?.lastName || '',
          fullName: patient.demographics
            ? `${patient.demographics.firstName} ${patient.demographics.lastName}`
            : '',
        },
      };

      // Process template
      const processedBody = processTemplate(messageBody, variables);
      const processedSubject = messageSubject
        ? processTemplate(messageSubject, variables)
        : undefined;

      // Create message record
      const message = await ctx.prisma.message.create({
        data: {
          channel,
          direction: 'OUTBOUND',
          type,
          subject: processedSubject,
          body: processedBody,
          recipient,
          status: scheduledAt ? 'PENDING' : 'PENDING',
          scheduledAt,
          templateId: template?.id,
          patientId,
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      });

      // Send immediately if not scheduled
      if (!scheduledAt) {
        let result;

        if (channel === 'SMS') {
          result = await notificationService.sendSMS(recipient, processedBody);
        } else if (channel === 'EMAIL') {
          result = await notificationService.sendEmail(
            recipient,
            processedSubject || 'Message from your healthcare provider',
            processedBody
          );
        }

        // Update message status
        await ctx.prisma.message.update({
          where: { id: message.id },
          data: {
            status: result?.success ? 'SENT' : 'FAILED',
            statusMessage: result?.error,
            externalId: result?.messageId,
            sentAt: result?.success ? new Date() : undefined,
          },
        });
      }

      await auditLog('CREATE', 'Message', {
        entityId: message.id,
        changes: { channel, type, patientId, scheduled: !!scheduledAt },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return message;
    }),

  // List messages
  listMessages: protectedProcedure
    .input(
      z.object({
        patientId: z.string().optional(),
        channel: communicationChannelSchema.optional(),
        status: messageStatusSchema.optional(),
        direction: messageDirectionSchema.optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const {
        patientId,
        channel,
        status,
        direction,
        startDate,
        endDate,
        limit = 50,
        offset = 0,
      } = input || {};

      const where: Prisma.MessageWhereInput = {
        organizationId: ctx.user.organizationId,
      };

      if (patientId) where.patientId = patientId;
      if (channel) where.channel = channel;
      if (status) where.status = status;
      if (direction) where.direction = direction;
      if (startDate || endDate) {
        where.createdAt = {
          ...(startDate && { gte: startDate }),
          ...(endDate && { lte: endDate }),
        };
      }

      const [messages, total] = await Promise.all([
        ctx.prisma.message.findMany({
          where,
          include: {
            patient: {
              include: {
                demographics: {
                  select: { firstName: true, lastName: true },
                },
              },
            },
            template: {
              select: { name: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        ctx.prisma.message.count({ where }),
      ]);

      return {
        messages,
        total,
        limit,
        offset,
        hasMore: offset + messages.length < total,
      };
    }),

  // Get message by ID
  getMessage: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const message = await ctx.prisma.message.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            include: {
              demographics: true,
            },
          },
          template: true,
          thread: {
            include: {
              messages: {
                orderBy: { createdAt: 'asc' },
              },
            },
          },
        },
      });

      if (!message) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Message not found',
        });
      }

      return message;
    }),

  // ==================== Communication Preferences ====================

  // Get patient preferences
  getPreferences: protectedProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: input.patientId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          communicationPreference: true,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      return patient.communicationPreference;
    }),

  // Update patient preferences
  updatePreferences: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        allowSms: z.boolean().optional(),
        allowEmail: z.boolean().optional(),
        allowVoice: z.boolean().optional(),
        allowPortal: z.boolean().optional(),
        preferredChannel: communicationChannelSchema.optional(),
        preferredTimeStart: z.string().optional(),
        preferredTimeEnd: z.string().optional(),
        timezone: z.string().optional(),
        optOutMarketing: z.boolean().optional(),
        optOutReminders: z.boolean().optional(),
        language: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, ...updateData } = input;

      // Verify patient exists
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

      // Upsert preferences
      const preferences = await ctx.prisma.communicationPreference.upsert({
        where: { patientId },
        create: {
          patientId,
          ...updateData,
        },
        update: updateData,
      });

      await auditLog('UPDATE', 'CommunicationPreference', {
        entityId: preferences.id,
        changes: updateData,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return preferences;
    }),

  // ==================== Appointment Reminders ====================

  // Send appointment reminder
  sendAppointmentReminder: protectedProcedure
    .input(
      z.object({
        appointmentId: z.string(),
        channel: communicationChannelSchema.optional(),
        templateId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { appointmentId, channel, templateId } = input;

      // Get appointment with patient and provider
      const appointment = await ctx.prisma.appointment.findFirst({
        where: {
          id: appointmentId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            include: {
              demographics: true,
              contacts: {
                where: { isPrimary: true },
                take: 1,
              },
              communicationPreference: true,
            },
          },
          provider: {
            include: {
              user: {
                select: { firstName: true, lastName: true },
              },
            },
          },
          appointmentType: true,
        },
      });

      if (!appointment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Appointment not found',
        });
      }

      const patient = appointment.patient;
      const contact = patient.contacts[0];
      const prefs = patient.communicationPreference;

      // Determine channel
      const effectiveChannel = channel || prefs?.preferredChannel || 'SMS';

      // Check if patient allows this channel
      if (prefs) {
        if (effectiveChannel === 'SMS' && (!prefs.allowSms || prefs.optOutReminders)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Patient has opted out of SMS reminders',
          });
        }
        if (effectiveChannel === 'EMAIL' && (!prefs.allowEmail || prefs.optOutReminders)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Patient has opted out of email reminders',
          });
        }
      }

      // Get recipient
      let recipient = '';
      if (effectiveChannel === 'SMS') {
        recipient = contact?.mobilePhone || contact?.homePhone || '';
      } else if (effectiveChannel === 'EMAIL') {
        recipient = contact?.email || '';
      }

      if (!recipient) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Patient has no ${effectiveChannel.toLowerCase()} contact on file`,
        });
      }

      // Get template if specified, or use default
      let template;
      if (templateId) {
        template = await ctx.prisma.messageTemplate.findFirst({
          where: {
            id: templateId,
            type: 'APPOINTMENT_REMINDER',
            channel: effectiveChannel as CommunicationChannel,
            OR: [
              { organizationId: ctx.user.organizationId },
              { organizationId: null },
            ],
          },
        });
      }

      // Build variables
      const providerName = appointment.provider.user
        ? `${appointment.provider.title || ''} ${appointment.provider.user.firstName} ${appointment.provider.user.lastName}`.trim()
        : 'your provider';

      const variables: TemplateVariables = {
        patient: {
          firstName: patient.demographics?.firstName || '',
          lastName: patient.demographics?.lastName || '',
          fullName: patient.demographics
            ? `${patient.demographics.firstName} ${patient.demographics.lastName}`
            : '',
        },
        appointment: {
          date: appointment.startTime.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          time: appointment.startTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          }),
          type: appointment.appointmentType.name,
          provider: providerName,
        },
      };

      // Default messages
      const defaultSMSBody = `Hi {{patient.firstName}}, this is a reminder of your {{appointment.type}} appointment on {{appointment.date}} at {{appointment.time}} with {{appointment.provider}}. Reply CONFIRM to confirm.`;
      const defaultEmailSubject = 'Appointment Reminder - {{appointment.date}}';
      const defaultEmailBody = `Dear {{patient.firstName}},

This is a reminder of your upcoming appointment:

Date: {{appointment.date}}
Time: {{appointment.time}}
Type: {{appointment.type}}
Provider: {{appointment.provider}}

If you need to reschedule, please contact us.

Thank you!`;

      const messageBody = template?.body || (effectiveChannel === 'SMS' ? defaultSMSBody : defaultEmailBody);
      const messageSubject = template?.subject || (effectiveChannel === 'EMAIL' ? defaultEmailSubject : undefined);

      const processedBody = processTemplate(messageBody, variables);
      const processedSubject = messageSubject ? processTemplate(messageSubject, variables) : undefined;

      // Create message record
      const message = await ctx.prisma.message.create({
        data: {
          channel: effectiveChannel as CommunicationChannel,
          direction: 'OUTBOUND',
          type: 'APPOINTMENT_REMINDER',
          subject: processedSubject,
          body: processedBody,
          recipient: effectiveChannel === 'SMS' ? normalizePhoneNumber(recipient) : recipient,
          status: 'PENDING',
          templateId: template?.id,
          patientId: patient.id,
          appointmentId,
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      });

      // Send message
      let result;
      if (effectiveChannel === 'SMS') {
        result = await notificationService.sendSMS(recipient, processedBody);
      } else if (effectiveChannel === 'EMAIL') {
        result = await notificationService.sendEmail(
          recipient,
          processedSubject || 'Appointment Reminder',
          processedBody
        );
      }

      // Update status
      await ctx.prisma.message.update({
        where: { id: message.id },
        data: {
          status: result?.success ? 'SENT' : 'FAILED',
          statusMessage: result?.error,
          externalId: result?.messageId,
          sentAt: result?.success ? new Date() : undefined,
        },
      });

      await auditLog('CREATE', 'Message', {
        entityId: message.id,
        changes: {
          type: 'APPOINTMENT_REMINDER',
          channel: effectiveChannel,
          appointmentId,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: result?.success || false,
        messageId: message.id,
        error: result?.error,
      };
    }),

  // ==================== Service Status ====================

  // Get notification service status
  getStatus: protectedProcedure.query(async () => {
    return notificationService.getProviderStatus();
  }),
});
