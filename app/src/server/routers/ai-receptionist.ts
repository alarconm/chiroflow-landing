/**
 * Epic 30: AI Receptionist Agent - tRPC Router
 * US-301: Voice AI Integration
 *
 * Provides API endpoints for AI-powered voice phone handling.
 */

import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import {
  createVoiceService,
  getVoiceConfig,
  type VoiceServiceConfig,
  type BusinessHours,
  type EscalationRule,
} from '@/lib/ai-receptionist';
import type { Prisma, AIConversationStatus, ConversationChannel } from '@prisma/client';

// Zod schemas for validation
const conversationChannelSchema = z.enum(['PHONE', 'CHAT', 'SMS', 'EMAIL']);
const conversationStatusSchema = z.enum(['ACTIVE', 'COMPLETED', 'ESCALATED', 'ABANDONED', 'FAILED']);
const actionTypeSchema = z.enum([
  'BOOK_APPOINTMENT',
  'RESCHEDULE_APPOINTMENT',
  'CANCEL_APPOINTMENT',
  'ANSWER_QUESTION',
  'IDENTIFY_PATIENT',
  'CREATE_PATIENT',
  'VERIFY_INSURANCE',
  'SEND_CONFIRMATION',
  'TRANSFER_CALL',
  'TAKE_MESSAGE',
  'COLLECT_INFO',
]);
const escalationReasonSchema = z.enum([
  'PATIENT_REQUEST',
  'CLINICAL_QUESTION',
  'BILLING_DISPUTE',
  'FRUSTRATION_DETECTED',
  'URGENCY_DETECTED',
  'COMPLEX_REQUEST',
  'REPEATED_FAILURE',
  'LOW_CONFIDENCE',
  'AFTER_HOURS_URGENT',
]);
const knowledgeCategorySchema = z.enum([
  'PRACTICE_INFO',
  'INSURANCE',
  'SERVICES',
  'PROVIDERS',
  'APPOINTMENT_PREP',
  'NEW_PATIENT',
  'POLICIES',
  'EMERGENCY',
  'CUSTOM',
]);

const businessHoursSchema = z.object({
  monday: z.object({ open: z.string(), close: z.string() }).optional(),
  tuesday: z.object({ open: z.string(), close: z.string() }).optional(),
  wednesday: z.object({ open: z.string(), close: z.string() }).optional(),
  thursday: z.object({ open: z.string(), close: z.string() }).optional(),
  friday: z.object({ open: z.string(), close: z.string() }).optional(),
  saturday: z.object({ open: z.string(), close: z.string() }).optional(),
  sunday: z.object({ open: z.string(), close: z.string() }).optional(),
});

const escalationRuleSchema = z.object({
  trigger: z.enum(['keyword', 'sentiment', 'confidence', 'time', 'intent']),
  condition: z.string(),
  action: z.enum(['transfer', 'queue', 'message']),
  target: z.string().optional(),
});

export const aiReceptionistRouter = router({
  // ==================== Voice Configuration ====================

  /**
   * Get voice configuration for organization
   */
  getVoiceConfig: protectedProcedure.query(async ({ ctx }) => {
    const config = await ctx.prisma.aIVoiceConfig.findUnique({
      where: { organizationId: ctx.user.organizationId },
    });

    return config;
  }),

  /**
   * Create or update voice configuration
   */
  upsertVoiceConfig: adminProcedure
    .input(
      z.object({
        voiceProvider: z.enum(['openai', 'elevenlabs', 'azure']).default('openai'),
        voiceId: z.string().default('alloy'),
        voiceSpeed: z.number().min(0.5).max(2.0).default(1.0),
        voicePitch: z.number().min(0.5).max(2.0).default(1.0),
        greeting: z.string().min(1),
        holdMessage: z.string().optional(),
        transferMessage: z.string().optional(),
        afterHoursMsg: z.string().optional(),
        emergencyMsg: z.string().optional(),
        holdMusicUrl: z.string().url().optional(),
        maxHoldSeconds: z.number().min(30).max(600).default(120),
        maxCallDuration: z.number().min(60).max(3600).default(900),
        silenceTimeout: z.number().min(5).max(30).default(10),
        businessHours: businessHoursSchema.optional(),
        timezone: z.string().default('America/Los_Angeles'),
        recordByDefault: z.boolean().default(false),
        recordingDisclosure: z.string().optional(),
        escalationPhone: z.string().optional(),
        escalationRules: z.array(escalationRuleSchema).optional(),
        primaryLanguage: z.string().default('en-US'),
        supportedLangs: z.array(z.string()).default(['en-US']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existingConfig = await ctx.prisma.aIVoiceConfig.findUnique({
        where: { organizationId: ctx.user.organizationId },
      });

      const data: Prisma.AIVoiceConfigUncheckedCreateInput = {
        organizationId: ctx.user.organizationId,
        voiceProvider: input.voiceProvider,
        voiceId: input.voiceId,
        voiceSpeed: input.voiceSpeed,
        voicePitch: input.voicePitch,
        greeting: input.greeting,
        holdMessage: input.holdMessage,
        transferMessage: input.transferMessage,
        afterHoursMsg: input.afterHoursMsg,
        emergencyMsg: input.emergencyMsg,
        holdMusicUrl: input.holdMusicUrl,
        maxHoldSeconds: input.maxHoldSeconds,
        maxCallDuration: input.maxCallDuration,
        silenceTimeout: input.silenceTimeout,
        businessHours: input.businessHours as Prisma.InputJsonValue,
        timezone: input.timezone,
        recordByDefault: input.recordByDefault,
        recordingDisclosure: input.recordingDisclosure,
        escalationPhone: input.escalationPhone,
        escalationRules: input.escalationRules as Prisma.InputJsonValue,
        primaryLanguage: input.primaryLanguage,
        supportedLangs: input.supportedLangs,
      };

      let config;
      if (existingConfig) {
        config = await ctx.prisma.aIVoiceConfig.update({
          where: { id: existingConfig.id },
          data,
        });
      } else {
        config = await ctx.prisma.aIVoiceConfig.create({ data });
      }

      await auditLog(existingConfig ? 'UPDATE' : 'CREATE', 'AIVoiceConfig', {
        entityId: config.id,
        changes: input,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return config;
    }),

  // ==================== Incoming Call Handling ====================

  /**
   * Handle incoming call webhook (simulated for API access)
   */
  handleIncomingCall: protectedProcedure
    .input(
      z.object({
        callSid: z.string(),
        from: z.string(),
        to: z.string(),
        direction: z.enum(['inbound', 'outbound']).default('inbound'),
        callerName: z.string().optional(),
        callerCity: z.string().optional(),
        callerState: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const voiceConfig = await getVoiceConfig(ctx.prisma, ctx.user.organizationId);

      if (!voiceConfig) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Voice configuration not found. Please configure voice settings first.',
        });
      }

      const voiceService = createVoiceService(ctx.prisma, voiceConfig);

      const responses = await voiceService.handleIncomingCall({
        callSid: input.callSid,
        from: input.from,
        to: input.to,
        direction: input.direction,
        callerName: input.callerName,
        callerCity: input.callerCity,
        callerState: input.callerState,
      });

      await auditLog('CREATE', 'VoiceCall', {
        entityId: input.callSid,
        changes: { from: input.from, direction: input.direction },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { responses, callSid: input.callSid };
    }),

  /**
   * Process speech input
   */
  processSpeech: protectedProcedure
    .input(
      z.object({
        callSid: z.string(),
        speechResult: z.string(),
        confidence: z.number().min(0).max(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const voiceConfig = await getVoiceConfig(ctx.prisma, ctx.user.organizationId);

      if (!voiceConfig) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Voice configuration not found',
        });
      }

      const voiceService = createVoiceService(ctx.prisma, voiceConfig);
      const callState = voiceService.getCallState(input.callSid);

      if (!callState) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Call not found or already ended',
        });
      }

      const result = await voiceService.processSpeech({
        callSid: input.callSid,
        speechResult: input.speechResult,
        confidence: input.confidence,
        callState,
      });

      return result;
    }),

  /**
   * Transfer call to human
   */
  transferCall: protectedProcedure
    .input(
      z.object({
        callSid: z.string(),
        targetNumber: z.string(),
        reason: z.string(),
        contextSummary: z.string(),
        timeout: z.number().default(30),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const voiceConfig = await getVoiceConfig(ctx.prisma, ctx.user.organizationId);

      if (!voiceConfig) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Voice configuration not found',
        });
      }

      const voiceService = createVoiceService(ctx.prisma, voiceConfig);
      const result = await voiceService.transferCall({
        callSid: input.callSid,
        targetNumber: input.targetNumber,
        reason: input.reason,
        contextSummary: input.contextSummary,
        timeout: input.timeout,
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error || 'Failed to transfer call',
        });
      }

      await auditLog('UPDATE', 'VoiceCall', {
        entityId: input.callSid,
        changes: { action: 'transfer', targetNumber: input.targetNumber },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return result;
    }),

  /**
   * Start recording a call
   */
  startRecording: protectedProcedure
    .input(z.object({ callSid: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const voiceConfig = await getVoiceConfig(ctx.prisma, ctx.user.organizationId);

      if (!voiceConfig) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Voice configuration not found',
        });
      }

      const voiceService = createVoiceService(ctx.prisma, voiceConfig);
      const result = await voiceService.startRecording(input.callSid);

      if (result.success) {
        await auditLog('UPDATE', 'VoiceCall', {
          entityId: input.callSid,
          changes: { action: 'startRecording', recordingSid: result.recordingSid },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });
      }

      return result;
    }),

  /**
   * End a call
   */
  endCall: protectedProcedure
    .input(
      z.object({
        callSid: z.string(),
        status: conversationStatusSchema.default('COMPLETED'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const voiceConfig = await getVoiceConfig(ctx.prisma, ctx.user.organizationId);

      if (!voiceConfig) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Voice configuration not found',
        });
      }

      const voiceService = createVoiceService(ctx.prisma, voiceConfig);
      await voiceService.endCall(input.callSid, input.status as AIConversationStatus);

      await auditLog('UPDATE', 'VoiceCall', {
        entityId: input.callSid,
        changes: { status: input.status },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // ==================== Active Calls ====================

  /**
   * Get active calls
   */
  getActiveCalls: protectedProcedure.query(async ({ ctx }) => {
    const voiceConfig = await getVoiceConfig(ctx.prisma, ctx.user.organizationId);

    if (!voiceConfig) {
      return [];
    }

    const voiceService = createVoiceService(ctx.prisma, voiceConfig);
    return voiceService.getActiveCalls();
  }),

  /**
   * Get call state
   */
  getCallState: protectedProcedure
    .input(z.object({ callSid: z.string() }))
    .query(async ({ ctx, input }) => {
      const voiceConfig = await getVoiceConfig(ctx.prisma, ctx.user.organizationId);

      if (!voiceConfig) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Voice configuration not found',
        });
      }

      const voiceService = createVoiceService(ctx.prisma, voiceConfig);
      const callState = voiceService.getCallState(input.callSid);

      if (!callState) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Call not found',
        });
      }

      return callState;
    }),

  // ==================== Conversations ====================

  /**
   * Get conversation history
   */
  getConversations: protectedProcedure
    .input(
      z.object({
        channel: conversationChannelSchema.optional(),
        status: conversationStatusSchema.optional(),
        patientId: z.string().optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const { channel, status, patientId, startDate, endDate, limit = 50, offset = 0 } = input || {};

      const where: Prisma.AIReceptionistConversationWhereInput = {
        organizationId: ctx.user.organizationId,
      };

      if (channel) where.channel = channel as ConversationChannel;
      if (status) where.status = status as AIConversationStatus;
      if (patientId) where.patientId = patientId;
      if (startDate || endDate) {
        where.startedAt = {};
        if (startDate) where.startedAt.gte = startDate;
        if (endDate) where.startedAt.lte = endDate;
      }

      const [conversations, total] = await Promise.all([
        ctx.prisma.aIReceptionistConversation.findMany({
          where,
          include: {
            patient: {
              include: { demographics: { select: { firstName: true, lastName: true } } },
            },
            actions: { orderBy: { executedAt: 'asc' } },
            escalation: true,
          },
          orderBy: { startedAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        ctx.prisma.aIReceptionistConversation.count({ where }),
      ]);

      return { conversations, total };
    }),

  /**
   * Get single conversation with full details
   */
  getConversation: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const conversation = await ctx.prisma.aIReceptionistConversation.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            include: { demographics: true },
          },
          actions: { orderBy: { executedAt: 'asc' } },
          escalation: true,
        },
      });

      if (!conversation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Conversation not found',
        });
      }

      return conversation;
    }),

  // ==================== Escalations ====================

  /**
   * Get pending escalations
   */
  getPendingEscalations: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const { limit = 20 } = input || {};

      const escalations = await ctx.prisma.aIReceptionistEscalation.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          resolvedAt: null,
        },
        include: {
          conversation: {
            include: {
              patient: {
                include: { demographics: { select: { firstName: true, lastName: true } } },
              },
            },
          },
        },
        orderBy: [{ urgencyLevel: 'desc' }, { createdAt: 'asc' }],
        take: limit,
      });

      return escalations;
    }),

  /**
   * Resolve an escalation
   */
  resolveEscalation: protectedProcedure
    .input(
      z.object({
        escalationId: z.string(),
        resolutionNotes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const escalation = await ctx.prisma.aIReceptionistEscalation.findFirst({
        where: {
          id: input.escalationId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!escalation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Escalation not found',
        });
      }

      await ctx.prisma.aIReceptionistEscalation.update({
        where: { id: input.escalationId },
        data: {
          resolvedAt: new Date(),
          resolutionNotes: input.resolutionNotes,
          resolvedByUserId: ctx.user.id,
        },
      });

      await auditLog('UPDATE', 'AIReceptionistEscalation', {
        entityId: input.escalationId,
        changes: { resolved: true, resolutionNotes: input.resolutionNotes },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  /**
   * Assign escalation to staff member
   */
  assignEscalation: protectedProcedure
    .input(
      z.object({
        escalationId: z.string(),
        assignToUserId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const escalation = await ctx.prisma.aIReceptionistEscalation.findFirst({
        where: {
          id: input.escalationId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!escalation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Escalation not found',
        });
      }

      await ctx.prisma.aIReceptionistEscalation.update({
        where: { id: input.escalationId },
        data: { assignedToUserId: input.assignToUserId },
      });

      await auditLog('UPDATE', 'AIReceptionistEscalation', {
        entityId: input.escalationId,
        changes: { assignedToUserId: input.assignToUserId },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // ==================== Knowledge Base ====================

  /**
   * List knowledge base entries
   */
  getKnowledgeBase: protectedProcedure
    .input(
      z.object({
        category: knowledgeCategorySchema.optional(),
        isActive: z.boolean().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const { category, isActive, limit = 50, offset = 0 } = input || {};

      const where: Prisma.AIKnowledgeBaseWhereInput = {
        organizationId: ctx.user.organizationId,
      };

      if (category) where.category = category;
      if (isActive !== undefined) where.isActive = isActive;

      const [entries, total] = await Promise.all([
        ctx.prisma.aIKnowledgeBase.findMany({
          where,
          orderBy: [{ category: 'asc' }, { priority: 'desc' }],
          take: limit,
          skip: offset,
        }),
        ctx.prisma.aIKnowledgeBase.count({ where }),
      ]);

      return { entries, total };
    }),

  /**
   * Create knowledge base entry
   */
  createKnowledgeEntry: adminProcedure
    .input(
      z.object({
        category: knowledgeCategorySchema,
        question: z.string().min(1),
        answer: z.string().min(1),
        keywords: z.array(z.string()).default([]),
        variations: z.array(z.string()).default([]),
        priority: z.number().min(0).max(100).default(0),
        isActive: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.prisma.aIKnowledgeBase.create({
        data: {
          organizationId: ctx.user.organizationId,
          category: input.category,
          question: input.question,
          answer: input.answer,
          keywords: input.keywords,
          variations: input.variations,
          priority: input.priority,
          isActive: input.isActive,
        },
      });

      await auditLog('CREATE', 'AIKnowledgeBase', {
        entityId: entry.id,
        changes: { category: input.category, question: input.question },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return entry;
    }),

  /**
   * Update knowledge base entry
   */
  updateKnowledgeEntry: adminProcedure
    .input(
      z.object({
        id: z.string(),
        category: knowledgeCategorySchema.optional(),
        question: z.string().min(1).optional(),
        answer: z.string().min(1).optional(),
        keywords: z.array(z.string()).optional(),
        variations: z.array(z.string()).optional(),
        priority: z.number().min(0).max(100).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.aIKnowledgeBase.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Knowledge entry not found',
        });
      }

      const { id, ...updateData } = input;

      const entry = await ctx.prisma.aIKnowledgeBase.update({
        where: { id },
        data: updateData,
      });

      await auditLog('UPDATE', 'AIKnowledgeBase', {
        entityId: id,
        changes: updateData,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return entry;
    }),

  /**
   * Delete knowledge base entry
   */
  deleteKnowledgeEntry: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.aIKnowledgeBase.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Knowledge entry not found',
        });
      }

      await ctx.prisma.aIKnowledgeBase.delete({
        where: { id: input.id },
      });

      await auditLog('DELETE', 'AIKnowledgeBase', {
        entityId: input.id,
        changes: {},
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // ==================== Analytics ====================

  /**
   * Get voice metrics
   */
  getVoiceMetrics: protectedProcedure
    .input(
      z.object({
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { startDate, endDate } = input;

      // Get conversation stats
      const conversations = await ctx.prisma.aIReceptionistConversation.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          startedAt: { gte: startDate, lte: endDate },
        },
        include: {
          actions: true,
          escalation: true,
        },
      });

      // Calculate metrics
      const totalCalls = conversations.length;
      const completedCalls = conversations.filter(c => c.status === 'COMPLETED').length;
      const escalatedCalls = conversations.filter(c => c.status === 'ESCALATED').length;
      const totalDuration = conversations.reduce((sum, c) => sum + (c.duration || 0), 0);

      // Get appointments booked
      const appointmentsBooked = conversations.reduce(
        (sum, c) => sum + c.actions.filter(a => a.actionType === 'BOOK_APPOINTMENT' && a.result === 'SUCCESS').length,
        0
      );

      // Get questions answered
      const questionsAnswered = conversations.reduce(
        (sum, c) => sum + c.actions.filter(a => a.actionType === 'ANSWER_QUESTION' && a.result === 'SUCCESS').length,
        0
      );

      // Get common intents
      const intentCounts = new Map<string, number>();
      conversations.forEach(c => {
        c.actions.forEach(a => {
          const count = intentCounts.get(a.actionType) || 0;
          intentCounts.set(a.actionType, count + 1);
        });
      });

      const commonIntents = Array.from(intentCounts.entries())
        .map(([intent, count]) => ({ intent, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Get hourly distribution
      const hourCounts = new Map<number, number>();
      conversations.forEach(c => {
        const hour = c.startedAt.getHours();
        hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
      });

      const peakHours = Array.from(hourCounts.entries())
        .map(([hour, count]) => ({ hour, count }))
        .sort((a, b) => b.count - a.count);

      return {
        totalCalls,
        answeredCalls: completedCalls,
        missedCalls: 0, // Would need to track missed calls
        averageDuration: totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0,
        resolutionRate: totalCalls > 0 ? completedCalls / totalCalls : 0,
        escalationRate: totalCalls > 0 ? escalatedCalls / totalCalls : 0,
        appointmentsBooked,
        questionsAnswered,
        averageSentiment: 0.5, // Would need sentiment analysis
        peakHours,
        commonIntents,
      };
    }),

  /**
   * Get call analytics for date range
   */
  getCallAnalytics: protectedProcedure
    .input(
      z.object({
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
      })
    )
    .query(async ({ ctx, input }) => {
      const voiceConfig = await getVoiceConfig(ctx.prisma, ctx.user.organizationId);

      if (!voiceConfig) {
        return [];
      }

      const voiceService = createVoiceService(ctx.prisma, voiceConfig);
      return voiceService.getCallAnalytics(input.startDate, input.endDate);
    }),
});
