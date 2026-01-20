/**
 * formDelivery router
 * Epic 04: Digital Intake System
 * US-043: Form delivery via email/SMS
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, publicProcedure } from '../trpc';
import { prisma } from '@/lib/prisma';
import { FormDeliveryMethod } from '@prisma/client';
import { createAuditLog } from '@/lib/audit';

// ============================================
// SCHEMAS
// ============================================

const sendFormSchema = z.object({
  patientId: z.string(),
  templateIds: z.array(z.string()).min(1),
  method: z.enum(['EMAIL', 'SMS']),
  scheduledFor: z.string().datetime().optional(), // ISO datetime for scheduled send
});

const bulkSendSchema = z.object({
  patientIds: z.array(z.string()).min(1),
  templateIds: z.array(z.string()).min(1),
  method: z.enum(['EMAIL', 'SMS']),
  scheduledFor: z.string().datetime().optional(),
});

// ============================================
// HELPER FUNCTIONS
// ============================================

// Get contact info from patient
async function getPatientContactInfo(
  patientId: string,
  method: 'EMAIL' | 'SMS'
): Promise<{ email?: string; phone?: string }> {
  const contact = await prisma.patientContact.findFirst({
    where: {
      patientId,
      isPrimary: true,
    },
  });

  if (!contact) {
    // Try to get any contact
    const anyContact = await prisma.patientContact.findFirst({
      where: { patientId },
    });
    return {
      email: anyContact?.email || undefined,
      phone: anyContact?.mobilePhone || anyContact?.homePhone || undefined,
    };
  }

  return {
    email: contact.email || undefined,
    phone: contact.mobilePhone || contact.homePhone || undefined,
  };
}

// Email/SMS sending would integrate with actual providers
// For now, these are placeholder functions that update the status

async function sendEmail(
  to: string,
  subject: string,
  body: string,
  _deliveryId: string
): Promise<{ success: boolean; error?: string }> {
  // TODO: Integrate with email provider (SendGrid, AWS SES, etc.)
  // For now, simulate successful send
  console.log(`[EMAIL] To: ${to}, Subject: ${subject}`);
  return { success: true };
}

async function sendSMS(
  to: string,
  message: string,
  _deliveryId: string
): Promise<{ success: boolean; error?: string }> {
  // TODO: Integrate with SMS provider (Twilio, etc.)
  // For now, simulate successful send
  console.log(`[SMS] To: ${to}, Message: ${message}`);
  return { success: true };
}

// ============================================
// ROUTER
// ============================================

export const formDeliveryRouter = router({
  // ==========================================
  // SEND - Send forms to a patient
  // ==========================================
  send: protectedProcedure
    .input(sendFormSchema)
    .mutation(async ({ ctx, input }) => {
      const { patientId, templateIds, method, scheduledFor } = input;

      // Verify patient exists
      const patient = await prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          demographics: true,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Verify templates exist and are active
      const templates = await prisma.formTemplate.findMany({
        where: {
          id: { in: templateIds },
          organizationId: ctx.user.organizationId,
          isActive: true,
          publishedAt: { not: null },
        },
      });

      if (templates.length !== templateIds.length) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'One or more templates not found or inactive',
        });
      }

      // Get contact info
      const contactInfo = await getPatientContactInfo(patientId, method);
      let sentTo: string | null = null;

      if (method === 'EMAIL') {
        sentTo = contactInfo.email || null;
        if (!sentTo) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Patient does not have an email address',
          });
        }
      } else if (method === 'SMS') {
        sentTo = contactInfo.phone || null;
        if (!sentTo) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Patient does not have a phone number',
          });
        }
      }

      // Create deliveries for each template
      const deliveries = [];
      const isScheduled = scheduledFor && new Date(scheduledFor) > new Date();

      for (const template of templates) {
        const delivery = await prisma.formDelivery.create({
          data: {
            organizationId: ctx.user.organizationId,
            templateId: template.id,
            patientId: patient.id,
            method,
            sentTo,
            scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
            sendStatus: isScheduled ? 'pending' : 'sending',
            nextReminderAt: null,
          },
          include: {
            template: { select: { id: true, name: true } },
          },
        });

        // Create a submission linked to this delivery
        const submission = await prisma.formSubmission.create({
          data: {
            organizationId: ctx.user.organizationId,
            templateId: template.id,
            patientId: patient.id,
            source: method,
            status: 'PENDING',
            deliveryId: delivery.id,
          },
        });

        // Send immediately if not scheduled
        if (!isScheduled) {
          const formUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/forms/${submission.accessToken}`;

          let sendResult: { success: boolean; error?: string };

          if (method === 'EMAIL') {
            const subject = `Please complete: ${template.name}`;
            const body = `
Hello ${patient.demographics?.firstName || 'Patient'},

Please complete the following form before your appointment:

${template.name}

Click here to complete the form:
${formUrl}

This link will expire in 7 days.

Thank you,
Your Healthcare Provider
            `.trim();

            sendResult = await sendEmail(sentTo!, subject, body, delivery.id);
          } else {
            const message = `Complete your form: ${formUrl}`;
            sendResult = await sendSMS(sentTo!, message, delivery.id);
          }

          // Update delivery status
          await prisma.formDelivery.update({
            where: { id: delivery.id },
            data: {
              sentAt: sendResult.success ? new Date() : null,
              sendStatus: sendResult.success ? 'sent' : 'failed',
              sendError: sendResult.error,
              // Set reminder for 24 hours later if sent successfully
              nextReminderAt: sendResult.success
                ? new Date(Date.now() + 24 * 60 * 60 * 1000)
                : null,
            },
          });
        }

        deliveries.push(delivery);
      }

      // Create audit log
      await createAuditLog({
        organizationId: ctx.user.organizationId,
        userId: ctx.user.id,
        action: 'CREATE',
        entityType: 'FormDelivery',
        entityId: deliveries.map((d) => d.id).join(','),
        changes: {
          patientId,
          templateIds,
          method,
          scheduledFor: scheduledFor || null,
        },
      });

      return {
        deliveries: deliveries.map((d) => ({
          id: d.id,
          templateName: d.template.name,
          method: d.method,
          sentTo: d.sentTo,
          sendStatus: d.sendStatus,
        })),
      };
    }),

  // ==========================================
  // BULK SEND - Send forms to multiple patients
  // ==========================================
  bulkSend: protectedProcedure
    .input(bulkSendSchema)
    .mutation(async ({ ctx, input }) => {
      const { patientIds, templateIds, method, scheduledFor } = input;

      const results = [];

      for (const patientId of patientIds) {
        try {
          // Reuse the send logic for each patient
          const result = await prisma.$transaction(async (tx) => {
            const patient = await tx.patient.findFirst({
              where: {
                id: patientId,
                organizationId: ctx.user.organizationId,
              },
              include: { demographics: true },
            });

            if (!patient) {
              return { patientId, success: false, error: 'Patient not found' };
            }

            const contactInfo = await getPatientContactInfo(patientId, method);
            const sentTo =
              method === 'EMAIL' ? contactInfo.email : contactInfo.phone;

            if (!sentTo) {
              return {
                patientId,
                success: false,
                error: `No ${method.toLowerCase()} contact info`,
              };
            }

            const templates = await tx.formTemplate.findMany({
              where: {
                id: { in: templateIds },
                organizationId: ctx.user.organizationId,
                isActive: true,
                publishedAt: { not: null },
              },
            });

            const deliveryIds = [];
            for (const template of templates) {
              const delivery = await tx.formDelivery.create({
                data: {
                  organizationId: ctx.user.organizationId,
                  templateId: template.id,
                  patientId: patient.id,
                  method,
                  sentTo,
                  scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
                  sendStatus: scheduledFor ? 'pending' : 'sent',
                  sentAt: scheduledFor ? null : new Date(),
                },
              });
              deliveryIds.push(delivery.id);

              await tx.formSubmission.create({
                data: {
                  organizationId: ctx.user.organizationId,
                  templateId: template.id,
                  patientId: patient.id,
                  source: method,
                  status: 'PENDING',
                  deliveryId: delivery.id,
                },
              });
            }

            return { patientId, success: true, deliveryIds };
          });

          results.push(result);
        } catch (error) {
          results.push({
            patientId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Create audit log
      await createAuditLog({
        organizationId: ctx.user.organizationId,
        userId: ctx.user.id,
        action: 'CREATE',
        entityType: 'FormDelivery',
        entityId: 'bulk',
        changes: {
          patientIds,
          templateIds,
          method,
          scheduledFor: scheduledFor || null,
          results: results.map((r) => ({
            patientId: r.patientId,
            success: r.success,
          })),
        },
      });

      return {
        total: patientIds.length,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        results,
      };
    }),

  // ==========================================
  // LIST - List deliveries with filters
  // ==========================================
  list: protectedProcedure
    .input(
      z.object({
        patientId: z.string().optional(),
        templateId: z.string().optional(),
        status: z.enum(['pending', 'sent', 'failed', 'completed']).optional(),
        method: z.enum(['EMAIL', 'SMS']).optional(),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
        limit: z.number().min(1).max(100).optional().default(50),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
      };

      if (input.patientId) {
        where.patientId = input.patientId;
      }

      if (input.templateId) {
        where.templateId = input.templateId;
      }

      if (input.status) {
        if (input.status === 'completed') {
          where.completedAt = { not: null };
        } else {
          where.sendStatus = input.status;
        }
      }

      if (input.method) {
        where.method = input.method;
      }

      if (input.startDate || input.endDate) {
        where.createdAt = {};
        if (input.startDate) {
          (where.createdAt as Record<string, Date>).gte = new Date(
            input.startDate
          );
        }
        if (input.endDate) {
          (where.createdAt as Record<string, Date>).lte = new Date(
            input.endDate
          );
        }
      }

      const deliveries = await prisma.formDelivery.findMany({
        where,
        include: {
          template: { select: { id: true, name: true } },
          patient: {
            include: {
              demographics: {
                select: { firstName: true, lastName: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
      });

      let nextCursor: string | undefined = undefined;
      if (deliveries.length > input.limit) {
        const nextItem = deliveries.pop();
        nextCursor = nextItem?.id;
      }

      return {
        deliveries: deliveries.map((d) => ({
          id: d.id,
          method: d.method,
          sentTo: d.sentTo,
          sendStatus: d.sendStatus,
          sentAt: d.sentAt,
          openedAt: d.openedAt,
          completedAt: d.completedAt,
          scheduledFor: d.scheduledFor,
          reminderCount: d.reminderCount,
          template: d.template,
          patient: {
            id: d.patient.id,
            firstName: d.patient.demographics?.firstName || '',
            lastName: d.patient.demographics?.lastName || '',
          },
          createdAt: d.createdAt,
        })),
        nextCursor,
      };
    }),

  // ==========================================
  // GET - Get single delivery details
  // ==========================================
  get: protectedProcedure.input(z.string()).query(async ({ ctx, input }) => {
    const delivery = await prisma.formDelivery.findFirst({
      where: {
        id: input,
        organizationId: ctx.user.organizationId,
      },
      include: {
        template: { select: { id: true, name: true, description: true } },
        patient: {
          include: {
            demographics: {
              select: { firstName: true, lastName: true },
            },
            contacts: {
              where: { isPrimary: true },
              take: 1,
            },
          },
        },
      },
    });

    if (!delivery) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Delivery not found',
      });
    }

    // Get linked submission
    const submission = await prisma.formSubmission.findFirst({
      where: { deliveryId: delivery.id },
      select: { id: true, accessToken: true, status: true },
    });

    const contact = delivery.patient.contacts[0];

    return {
      ...delivery,
      patient: {
        ...delivery.patient,
        email: contact?.email,
        phone: contact?.mobilePhone || contact?.homePhone,
      },
      submission,
    };
  }),

  // ==========================================
  // SEND REMINDER - Manually trigger reminder
  // ==========================================
  sendReminder: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      const delivery = await prisma.formDelivery.findFirst({
        where: {
          id: input,
          organizationId: ctx.user.organizationId,
        },
        include: {
          template: { select: { name: true } },
          patient: {
            include: {
              demographics: { select: { firstName: true } },
            },
          },
        },
      });

      if (!delivery) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Delivery not found',
        });
      }

      if (delivery.completedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Form already completed',
        });
      }

      if (delivery.reminderCount >= delivery.maxReminders) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Maximum reminders already sent',
        });
      }

      // Get the submission for the form URL
      const submission = await prisma.formSubmission.findFirst({
        where: { deliveryId: delivery.id },
      });

      if (!submission) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No submission linked to this delivery',
        });
      }

      const formUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/forms/${submission.accessToken}`;

      let sendResult: { success: boolean; error?: string };

      if (delivery.method === 'EMAIL') {
        const subject = `Reminder: Please complete ${delivery.template.name}`;
        const body = `
Hello ${delivery.patient.demographics?.firstName || 'Patient'},

This is a friendly reminder to complete your form:

${delivery.template.name}

Click here to complete the form:
${formUrl}

Thank you,
Your Healthcare Provider
        `.trim();

        sendResult = await sendEmail(
          delivery.sentTo!,
          subject,
          body,
          delivery.id
        );
      } else {
        const message = `Reminder: Complete your form: ${formUrl}`;
        sendResult = await sendSMS(delivery.sentTo!, message, delivery.id);
      }

      // Update delivery with reminder info
      await prisma.formDelivery.update({
        where: { id: delivery.id },
        data: {
          reminderCount: { increment: 1 },
          reminderSentAt: new Date(),
          nextReminderAt:
            delivery.reminderCount + 1 < delivery.maxReminders
              ? new Date(Date.now() + 24 * 60 * 60 * 1000)
              : null,
        },
      });

      await createAuditLog({
        organizationId: ctx.user.organizationId,
        userId: ctx.user.id,
        action: 'UPDATE',
        entityType: 'FormDelivery',
        entityId: delivery.id,
        changes: {
          action: 'reminder_sent',
          reminderCount: delivery.reminderCount + 1,
        },
      });

      return { success: sendResult.success, error: sendResult.error };
    }),

  // ==========================================
  // CANCEL - Cancel a scheduled delivery
  // ==========================================
  cancel: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      const delivery = await prisma.formDelivery.findFirst({
        where: {
          id: input,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!delivery) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Delivery not found',
        });
      }

      if (delivery.sendStatus !== 'pending') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Can only cancel pending deliveries',
        });
      }

      await prisma.formDelivery.update({
        where: { id: input },
        data: {
          sendStatus: 'cancelled',
          scheduledFor: null,
        },
      });

      await createAuditLog({
        organizationId: ctx.user.organizationId,
        userId: ctx.user.id,
        action: 'UPDATE',
        entityType: 'FormDelivery',
        entityId: input,
        changes: { action: 'cancelled' },
      });

      return { success: true };
    }),

  // ==========================================
  // TRACK OPEN - Public endpoint to track form open
  // ==========================================
  trackOpen: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input }) => {
      // Find submission by token
      const submission = await prisma.formSubmission.findFirst({
        where: { accessToken: input.token },
        select: { deliveryId: true },
      });

      if (submission?.deliveryId) {
        await prisma.formDelivery.update({
          where: { id: submission.deliveryId },
          data: {
            openedAt: new Date(),
          },
        });
      }

      return { success: true };
    }),

  // ==========================================
  // MARK COMPLETE - Update delivery when form completed
  // ==========================================
  markComplete: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input }) => {
      const submission = await prisma.formSubmission.findFirst({
        where: { accessToken: input.token },
        select: { deliveryId: true },
      });

      if (submission?.deliveryId) {
        await prisma.formDelivery.update({
          where: { id: submission.deliveryId },
          data: {
            completedAt: new Date(),
            nextReminderAt: null, // Stop reminders
          },
        });
      }

      return { success: true };
    }),

  // ==========================================
  // GET PENDING REMINDERS - For cron job
  // ==========================================
  getPendingReminders: protectedProcedure.query(async ({ ctx }) => {
    const deliveries = await prisma.formDelivery.findMany({
      where: {
        organizationId: ctx.user.organizationId,
        completedAt: null,
        nextReminderAt: { lte: new Date() },
      },
      include: {
        template: { select: { name: true } },
        patient: {
          include: {
            demographics: { select: { firstName: true, lastName: true } },
          },
        },
      },
      take: 100,
    });

    // Filter in memory for reminder count check
    return deliveries.filter((d) => d.reminderCount < d.maxReminders);
  }),

  // ==========================================
  // GET SCHEDULED - For cron job
  // ==========================================
  getScheduledDeliveries: protectedProcedure.query(async ({ ctx }) => {
    const deliveries = await prisma.formDelivery.findMany({
      where: {
        organizationId: ctx.user.organizationId,
        sendStatus: 'pending',
        scheduledFor: { lte: new Date() },
      },
      include: {
        template: { select: { name: true } },
        patient: {
          include: {
            demographics: true,
          },
        },
      },
      take: 100,
    });

    return deliveries;
  }),
});
