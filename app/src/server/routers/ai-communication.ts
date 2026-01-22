/**
 * Epic 12: AI Communication Agent - tRPC Router
 *
 * Provides API endpoints for AI-powered patient communication.
 */

import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import {
  createChatbot,
  createBookingAgent,
  createFAQAgent,
  createSentimentService,
  createCampaignEngine,
  type OrganizationSettings,
  type CampaignSequenceStep,
} from '@/lib/ai-communication';
import type {
  CampaignStatus,
  CommunicationChannel,
  Prisma,
} from '@prisma/client';

// Zod schemas for validation
const campaignStatusSchema = z.enum(['DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']);
const communicationChannelSchema = z.enum(['SMS', 'EMAIL', 'VOICE', 'PORTAL', 'IN_APP']);
const faqCategorySchema = z.enum(['insurance', 'general', 'services', 'hours', 'location']);
const feedbackSentimentSchema = z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE']);

// Campaign sequence step schema
const campaignSequenceStepSchema = z.object({
  stepNumber: z.number().min(1),
  delayDays: z.number().min(0),
  channel: communicationChannelSchema,
  templateId: z.string().optional(),
  customSubject: z.string().optional(),
  customBody: z.string().optional(),
});

export const aiCommunicationRouter = router({
  // ==================== Chatbot ====================

  /**
   * Start a new chat session
   */
  startChatSession: protectedProcedure
    .input(
      z.object({
        patientId: z.string().optional(),
        source: z.string().default('portal'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, source } = input;

      // Get patient info if provided
      let patientContext = null;
      if (patientId) {
        const patient = await ctx.prisma.patient.findFirst({
          where: {
            id: patientId,
            organizationId: ctx.user.organizationId,
          },
          include: {
            demographics: true,
            appointments: {
              where: { status: { in: ['SCHEDULED', 'CONFIRMED', 'COMPLETED'] } },
              orderBy: { startTime: 'desc' },
              take: 5,
              include: {
                appointmentType: true,
                provider: { include: { user: { select: { firstName: true, lastName: true } } } },
              },
            },
            insurances: {
              where: { type: 'PRIMARY' },
              take: 1,
            },
          },
        });

        if (patient) {
          patientContext = {
            patientId: patient.id,
            patientName: patient.demographics
              ? `${patient.demographics.firstName} ${patient.demographics.lastName}`
              : undefined,
            recentAppointments: patient.appointments.map(a => ({
              id: a.id,
              date: a.startTime,
              type: a.appointmentType.name,
              provider: a.provider.user
                ? `${a.provider.user.firstName} ${a.provider.user.lastName}`
                : 'Provider',
              status: a.status,
            })),
            insuranceInfo: patient.insurances.map(ins => ({
              payerName: ins.payerName,
              planType: ins.planType || undefined,
              policyNumber: ins.policyNumber,
              isActive: ins.isActive,
            })),
          };
        }
      }

      // Get organization settings
      const org = await ctx.prisma.organization.findUnique({
        where: { id: ctx.user.organizationId },
      });

      // Extract settings from organization JSON field
      const orgSettingsJson = (org?.settings || {}) as Record<string, unknown>;
      const orgSettings: OrganizationSettings = {
        name: org?.name || 'Our Practice',
        phone: (orgSettingsJson.phone as string) || undefined,
        email: (orgSettingsJson.email as string) || undefined,
        address: (orgSettingsJson.address as string) || undefined,
      };

      // Create chat session in database
      // Store source in metadata since ChatSession doesn't have a source field
      const session = await ctx.prisma.chatSession.create({
        data: {
          organizationId: ctx.user.organizationId,
          patientId: patientId || null,
          status: 'ACTIVE',
          metadata: { source },
        },
      });

      await auditLog('CREATE', 'ChatSession', {
        entityId: session.id,
        changes: { source, patientId },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        sessionId: session.id,
        context: patientContext,
        organizationSettings: orgSettings,
      };
    }),

  /**
   * Send a message in a chat session
   */
  sendChatMessage: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        message: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { sessionId, message } = input;

      // Verify session exists and belongs to org
      const session = await ctx.prisma.chatSession.findFirst({
        where: {
          id: sessionId,
          organizationId: ctx.user.organizationId,
          status: 'ACTIVE',
        },
        include: {
          patient: {
            include: {
              demographics: true,
              appointments: {
                where: { status: { in: ['SCHEDULED', 'CONFIRMED'] } },
                orderBy: { startTime: 'asc' },
                take: 5,
                include: {
                  appointmentType: true,
                  provider: { include: { user: { select: { firstName: true, lastName: true } } } },
                },
              },
            },
          },
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 20,
          },
        },
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Chat session not found or inactive',
        });
      }

      // Save user message
      await ctx.prisma.chatMessage.create({
        data: {
          sessionId,
          senderType: 'USER',
          content: message,
        },
      });

      // Build context for chatbot
      const chatbot = createChatbot({
        patientId: session.patientId || undefined,
        patientName: session.patient?.demographics
          ? `${session.patient.demographics.firstName} ${session.patient.demographics.lastName}`
          : undefined,
        recentAppointments: session.patient?.appointments.map(a => ({
          id: a.id,
          date: a.startTime,
          type: a.appointmentType.name,
          provider: a.provider.user
            ? `${a.provider.user.firstName} ${a.provider.user.lastName}`
            : 'Provider',
          status: a.status,
        })),
        conversationHistory: session.messages.map(m => ({
          role: m.senderType === 'USER' ? 'user' as const : 'assistant' as const,
          content: m.content,
          timestamp: m.createdAt,
          intent: m.detectedIntent || undefined,
        })),
      });

      // Get organization settings
      const org = await ctx.prisma.organization.findUnique({
        where: { id: ctx.user.organizationId },
      });

      if (org) {
        const orgSettingsJson = (org.settings || {}) as Record<string, unknown>;
        chatbot.setOrganizationSettings({
          name: org.name,
          phone: (orgSettingsJson.phone as string) || undefined,
          email: (orgSettingsJson.email as string) || undefined,
          address: (orgSettingsJson.address as string) || undefined,
        });
      }

      // Process message
      const response = await chatbot.processMessage(message);

      // Save AI response
      const aiMessage = await ctx.prisma.chatMessage.create({
        data: {
          sessionId,
          senderType: 'AI',
          content: response.message,
          detectedIntent: response.intent,
          intentConfidence: response.confidence,
          responseMetadata: {
            suggestedActions: response.suggestedActions,
            latencyMs: response.metadata?.latencyMs,
          } as Prisma.InputJsonValue,
        },
      });

      // Update session context (stored as Json field on ChatSession)
      const existingContext = (session.context || {}) as Record<string, unknown>;
      const detectedIntents = (existingContext.detectedIntents || []) as string[];
      detectedIntents.push(response.intent);

      await ctx.prisma.chatSession.update({
        where: { id: sessionId },
        data: {
          context: {
            ...existingContext,
            detectedIntents,
            pendingBooking: response.context?.pendingBooking || existingContext.pendingBooking,
          } as Prisma.InputJsonValue,
        },
      });

      return {
        messageId: aiMessage.id,
        response: response.message,
        intent: response.intent,
        confidence: response.confidence,
        suggestedActions: response.suggestedActions,
        context: response.context,
      };
    }),

  /**
   * End a chat session
   */
  endChatSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.chatSession.findFirst({
        where: {
          id: input.sessionId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Chat session not found',
        });
      }

      await ctx.prisma.chatSession.update({
        where: { id: input.sessionId },
        data: {
          status: 'ENDED',
          endedAt: new Date(),
        },
      });

      await auditLog('UPDATE', 'ChatSession', {
        entityId: input.sessionId,
        changes: { status: 'ENDED' },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  /**
   * Get chat session history
   */
  getChatHistory: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().optional(),
        patientId: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { sessionId, patientId, limit, offset } = input;

      if (sessionId) {
        // Get specific session
        const session = await ctx.prisma.chatSession.findFirst({
          where: {
            id: sessionId,
            organizationId: ctx.user.organizationId,
          },
          include: {
            messages: {
              orderBy: { createdAt: 'asc' },
            },
            patient: {
              include: { demographics: true },
            },
          },
        });

        if (!session) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Chat session not found',
          });
        }

        return { sessions: [session], total: 1 };
      }

      // List sessions
      const where: Prisma.ChatSessionWhereInput = {
        organizationId: ctx.user.organizationId,
      };

      if (patientId) {
        where.patientId = patientId;
      }

      const [sessions, total] = await Promise.all([
        ctx.prisma.chatSession.findMany({
          where,
          include: {
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
            patient: {
              include: { demographics: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        ctx.prisma.chatSession.count({ where }),
      ]);

      return { sessions, total };
    }),

  // ==================== Natural Language Booking ====================

  /**
   * Process a natural language booking request
   */
  processBookingRequest: protectedProcedure
    .input(
      z.object({
        message: z.string().min(1),
        patientId: z.string(),
        pendingBooking: z.object({
          appointmentTypeId: z.string().optional(),
          appointmentTypeName: z.string().optional(),
          providerId: z.string().optional(),
          providerName: z.string().optional(),
          preferredDate: z.coerce.date().optional(),
          preferredTimeRange: z.object({
            start: z.string(),
            end: z.string(),
          }).optional(),
          step: z.enum(['type', 'provider', 'date', 'time', 'confirm']),
        }).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { message, patientId, pendingBooking } = input;

      // Verify patient exists
      const patient = await ctx.prisma.patient.findFirst({
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

      // Create booking agent
      const bookingAgent = createBookingAgent(ctx.prisma);

      // Build context
      const context = {
        patientId,
        patientName: patient.demographics
          ? `${patient.demographics.firstName} ${patient.demographics.lastName}`
          : undefined,
        pendingBooking: pendingBooking ? {
          ...pendingBooking,
          preferredDate: pendingBooking.preferredDate || undefined,
        } : undefined,
        conversationHistory: [],
        detectedIntents: [],
      };

      // Process request
      const response = await bookingAgent.processBookingRequest({
        userMessage: message,
        context,
        organizationId: ctx.user.organizationId,
      });

      // If booking complete, create appointment
      if (response.bookingComplete && response.appointmentId) {
        await auditLog('CREATE', 'Appointment', {
          entityId: response.appointmentId,
          changes: { source: 'ai_booking', patientId },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });
      }

      return response;
    }),

  // ==================== FAQ ====================

  /**
   * Get answer to a FAQ question
   */
  askFAQ: protectedProcedure
    .input(
      z.object({
        question: z.string().min(1),
        category: faqCategorySchema.optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { question, category } = input;

      // Get organization settings
      const org = await ctx.prisma.organization.findUnique({
        where: { id: ctx.user.organizationId },
      });

      const faqAgent = createFAQAgent(ctx.prisma);
      const orgSettingsJson = (org?.settings || {}) as Record<string, unknown>;

      const response = await faqAgent.answerQuestion({
        question,
        category,
        context: {
          organizationSettings: {
            name: org?.name || 'Our Practice',
            phone: (orgSettingsJson.phone as string) || undefined,
            email: (orgSettingsJson.email as string) || undefined,
            address: (orgSettingsJson.address as string) || undefined,
          },
          conversationHistory: [],
          detectedIntents: [],
        },
        organizationId: ctx.user.organizationId,
      });

      return response;
    }),

  /**
   * Get FAQs by category
   */
  getFAQsByCategory: protectedProcedure
    .input(
      z.object({
        category: faqCategorySchema,
      })
    )
    .query(async ({ ctx, input }) => {
      const faqAgent = createFAQAgent(ctx.prisma);
      return faqAgent.getFAQsByCategory(input.category);
    }),

  /**
   * Get all FAQ categories
   */
  getFAQCategories: protectedProcedure.query(async ({ ctx }) => {
    const faqAgent = createFAQAgent(ctx.prisma);
    return faqAgent.getCategories();
  }),

  /**
   * Search FAQs
   */
  searchFAQs: protectedProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const faqAgent = createFAQAgent(ctx.prisma);
      return faqAgent.searchFAQs(input.query);
    }),

  /**
   * Get popular FAQ questions
   */
  getPopularFAQs: protectedProcedure.query(async ({ ctx }) => {
    const faqAgent = createFAQAgent(ctx.prisma);
    return faqAgent.getPopularQuestions();
  }),

  // ==================== Recall Campaigns ====================

  /**
   * Create a recall campaign
   */
  createRecallCampaign: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        criteria: z.object({
          lastVisitDateRange: z.object({
            start: z.coerce.date().optional(),
            end: z.coerce.date().optional(),
          }).optional(),
          appointmentTypes: z.array(z.string()).optional(),
          providers: z.array(z.string()).optional(),
          excludePatientIds: z.array(z.string()).optional(),
          minVisits: z.number().optional(),
          maxVisits: z.number().optional(),
        }),
        sequence: z.array(campaignSequenceStepSchema),
        scheduledStartDate: z.coerce.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const campaignEngine = createCampaignEngine(ctx.prisma);

      const result = await campaignEngine.createRecallCampaign(
        ctx.user.organizationId,
        {
          name: input.name,
          description: input.description,
          criteria: input.criteria,
          sequence: input.sequence as CampaignSequenceStep[],
          scheduledStartDate: input.scheduledStartDate,
        }
      );

      await auditLog('CREATE', 'RecallCampaign', {
        entityId: result.id,
        changes: { name: input.name, patientCount: result.patientCount },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return result;
    }),

  /**
   * Start a recall campaign
   */
  startRecallCampaign: adminProcedure
    .input(z.object({ campaignId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.recallCampaign.findFirst({
        where: {
          id: input.campaignId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!campaign) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Campaign not found',
        });
      }

      if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Campaign cannot be started in current status',
        });
      }

      const campaignEngine = createCampaignEngine(ctx.prisma);
      await campaignEngine.startRecallCampaign(input.campaignId);

      await auditLog('UPDATE', 'RecallCampaign', {
        entityId: input.campaignId,
        changes: { status: 'ACTIVE' },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  /**
   * Pause a recall campaign
   */
  pauseRecallCampaign: adminProcedure
    .input(z.object({ campaignId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const campaignEngine = createCampaignEngine(ctx.prisma);
      await campaignEngine.pauseRecallCampaign(input.campaignId);

      await auditLog('UPDATE', 'RecallCampaign', {
        entityId: input.campaignId,
        changes: { status: 'PAUSED' },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  /**
   * Get recall campaign statistics
   */
  getRecallCampaignStats: protectedProcedure
    .input(z.object({ campaignId: z.string() }))
    .query(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.recallCampaign.findFirst({
        where: {
          id: input.campaignId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!campaign) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Campaign not found',
        });
      }

      const campaignEngine = createCampaignEngine(ctx.prisma);
      return campaignEngine.getRecallCampaignStats(input.campaignId);
    }),

  // ==================== Reactivation Campaigns ====================

  /**
   * Create a reactivation campaign
   */
  createReactivationCampaign: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        criteria: z.object({
          minDaysSinceVisit: z.number().min(1),
          maxDaysSinceVisit: z.number().optional(),
          excludeActivePatients: z.boolean().default(true),
          appointmentTypes: z.array(z.string()).optional(),
          providers: z.array(z.string()).optional(),
        }),
        sequence: z.array(campaignSequenceStepSchema),
        scheduledStartDate: z.coerce.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const campaignEngine = createCampaignEngine(ctx.prisma);

      const result = await campaignEngine.createReactivationCampaign(
        ctx.user.organizationId,
        {
          name: input.name,
          description: input.description,
          criteria: input.criteria,
          sequence: input.sequence as CampaignSequenceStep[],
          scheduledStartDate: input.scheduledStartDate,
        }
      );

      await auditLog('CREATE', 'ReactivationCampaign', {
        entityId: result.id,
        changes: { name: input.name, patientCount: result.patientCount },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return result;
    }),

  /**
   * Start a reactivation campaign
   */
  startReactivationCampaign: adminProcedure
    .input(z.object({ campaignId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.reactivationCampaign.findFirst({
        where: {
          id: input.campaignId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!campaign) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Campaign not found',
        });
      }

      if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Campaign cannot be started in current status',
        });
      }

      const campaignEngine = createCampaignEngine(ctx.prisma);
      await campaignEngine.startReactivationCampaign(input.campaignId);

      await auditLog('UPDATE', 'ReactivationCampaign', {
        entityId: input.campaignId,
        changes: { status: 'ACTIVE' },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  /**
   * Get reactivation campaign statistics
   */
  getReactivationCampaignStats: protectedProcedure
    .input(z.object({ campaignId: z.string() }))
    .query(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.reactivationCampaign.findFirst({
        where: {
          id: input.campaignId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!campaign) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Campaign not found',
        });
      }

      const campaignEngine = createCampaignEngine(ctx.prisma);
      return campaignEngine.getReactivationCampaignStats(input.campaignId);
    }),

  /**
   * List all campaigns
   */
  listCampaigns: protectedProcedure
    .input(
      z.object({
        type: z.enum(['recall', 'reactivation']).optional(),
        status: campaignStatusSchema.optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const { type, status, limit = 20, offset = 0 } = input || {};

      const campaignEngine = createCampaignEngine(ctx.prisma);
      return campaignEngine.listCampaigns(ctx.user.organizationId, {
        type,
        status,
        limit,
        offset,
      });
    }),

  // ==================== Sentiment Analysis ====================

  /**
   * Analyze sentiment of text
   */
  analyzeSentiment: protectedProcedure
    .input(
      z.object({
        text: z.string().min(1),
        source: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const sentimentService = createSentimentService(ctx.prisma);
      return sentimentService.analyzeSentiment(input);
    }),

  /**
   * Store patient feedback with sentiment analysis
   */
  storeFeedback: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        content: z.string().min(1),
        source: z.string().default('portal'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { patientId, content, source } = input;

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

      const sentimentService = createSentimentService(ctx.prisma);
      const result = await sentimentService.storeFeedback(
        ctx.user.organizationId,
        patientId,
        content,
        source
      );

      await auditLog('CREATE', 'PatientFeedback', {
        entityId: result.id,
        changes: { sentiment: result.sentiment, source },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return result;
    }),

  /**
   * Get feedback summary
   */
  getFeedbackSummary: protectedProcedure
    .input(
      z.object({
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        sources: z.array(z.string()).optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const sentimentService = createSentimentService(ctx.prisma);
      return sentimentService.getFeedbackSummary(ctx.user.organizationId, input || {});
    }),

  /**
   * Get sentiment trends
   */
  getSentimentTrends: protectedProcedure
    .input(
      z.object({
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
        groupBy: z.enum(['day', 'week', 'month']).default('week'),
      })
    )
    .query(async ({ ctx, input }) => {
      const sentimentService = createSentimentService(ctx.prisma);
      return sentimentService.getSentimentTrends(ctx.user.organizationId, input);
    }),

  /**
   * Get feedback requiring follow-up
   */
  getFeedbackRequiringFollowUp: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }).optional())
    .query(async ({ ctx, input }) => {
      const sentimentService = createSentimentService(ctx.prisma);
      return sentimentService.getFeedbackRequiringFollowUp(
        ctx.user.organizationId,
        input?.limit || 20
      );
    }),

  /**
   * Mark feedback as followed up
   */
  markFeedbackFollowedUp: protectedProcedure
    .input(
      z.object({
        feedbackId: z.string(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { feedbackId, notes } = input;

      // Verify feedback exists
      const feedback = await ctx.prisma.patientFeedback.findFirst({
        where: {
          id: feedbackId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!feedback) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Feedback not found',
        });
      }

      const sentimentService = createSentimentService(ctx.prisma);
      await sentimentService.markFollowUpComplete(feedbackId, notes);

      await auditLog('UPDATE', 'PatientFeedback', {
        entityId: feedbackId,
        changes: { followUpCompleted: true, notes },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),
});
