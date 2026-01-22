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
  createSchedulingAgent,
  createFAQAgent,
  createPatientIdentificationAgent,
  type VoiceServiceConfig,
  type BusinessHours,
  type EscalationRule,
  type SchedulingRequest,
  type FAQRequest,
  type PatientIdentificationRequest,
  type NewPatientInfo,
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

  // ==================== Appointment Scheduling Agent ====================

  /**
   * Book an appointment through AI conversation
   * US-302: Appointment scheduling agent
   */
  bookAppointment: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().optional(),
        callSid: z.string().optional(),
        patientId: z.string().optional(),
        appointmentTypeId: z.string().optional(),
        appointmentTypeName: z.string().optional(),
        providerId: z.string().optional(),
        providerName: z.string().optional(),
        preferredDate: z.coerce.date().optional(),
        preferredTimeStart: z.string().optional(),
        preferredTimeEnd: z.string().optional(),
        notes: z.string().optional(),
        awaitingConfirmation: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const schedulingAgent = createSchedulingAgent(ctx.prisma, {
        organizationId: ctx.user.organizationId,
      });

      const request: SchedulingRequest = {
        type: 'book',
        patientId: input.patientId,
        appointmentTypeId: input.appointmentTypeId,
        appointmentTypeName: input.appointmentTypeName,
        providerId: input.providerId,
        providerName: input.providerName,
        preferredDate: input.preferredDate,
        preferredTimeStart: input.preferredTimeStart,
        preferredTimeEnd: input.preferredTimeEnd,
        notes: input.notes,
      };

      // Build a minimal call state
      const callState = {
        callSid: input.callSid || `API-${Date.now()}`,
        organizationId: ctx.user.organizationId,
        patientId: input.patientId,
        phoneNumber: '',
        status: 'in-progress' as const,
        direction: 'inbound' as const,
        startedAt: new Date(),
        recordingConsent: false,
        transcript: [],
        context: {
          patientIdentified: !!input.patientId,
          intents: ['BOOK_APPOINTMENT' as const],
          turnCount: 1,
          frustrationLevel: 0,
          silenceCount: 0,
          retryCount: 0,
          pendingAction: input.awaitingConfirmation
            ? { type: 'BOOK_APPOINTMENT' as const, parameters: {}, awaitingConfirmation: true }
            : undefined,
        },
      };

      const result = await schedulingAgent.bookAppointment(request, callState);

      // Record the action
      if (input.conversationId) {
        await ctx.prisma.aIReceptionistAction.create({
          data: {
            organizationId: ctx.user.organizationId,
            conversationId: input.conversationId,
            actionType: 'BOOK_APPOINTMENT',
            parameters: input as object,
            result: result.actionResult,
            confidence: 0.9,
            appointmentId: result.appointmentId,
            patientId: input.patientId,
          },
        });
      }

      await auditLog('CREATE', 'AppointmentBooking', {
        entityId: result.appointmentId || 'pending',
        changes: { request: input, result: result.actionResult },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return result;
    }),

  /**
   * Reschedule an existing appointment
   * US-302: Appointment scheduling agent
   */
  rescheduleAppointment: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().optional(),
        callSid: z.string().optional(),
        patientId: z.string(),
        appointmentId: z.string().optional(),
        preferredDate: z.coerce.date().optional(),
        preferredTimeStart: z.string().optional(),
        preferredTimeEnd: z.string().optional(),
        awaitingConfirmation: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const schedulingAgent = createSchedulingAgent(ctx.prisma, {
        organizationId: ctx.user.organizationId,
      });

      const request: SchedulingRequest = {
        type: 'reschedule',
        patientId: input.patientId,
        appointmentId: input.appointmentId,
        preferredDate: input.preferredDate,
        preferredTimeStart: input.preferredTimeStart,
        preferredTimeEnd: input.preferredTimeEnd,
      };

      const callState = {
        callSid: input.callSid || `API-${Date.now()}`,
        organizationId: ctx.user.organizationId,
        patientId: input.patientId,
        phoneNumber: '',
        status: 'in-progress' as const,
        direction: 'inbound' as const,
        startedAt: new Date(),
        recordingConsent: false,
        transcript: [],
        context: {
          patientIdentified: true,
          intents: ['RESCHEDULE_APPOINTMENT' as const],
          turnCount: 1,
          frustrationLevel: 0,
          silenceCount: 0,
          retryCount: 0,
          pendingAction: input.awaitingConfirmation
            ? { type: 'RESCHEDULE_APPOINTMENT' as const, parameters: {}, awaitingConfirmation: true }
            : undefined,
        },
      };

      const result = await schedulingAgent.rescheduleAppointment(request, callState);

      if (input.conversationId) {
        await ctx.prisma.aIReceptionistAction.create({
          data: {
            organizationId: ctx.user.organizationId,
            conversationId: input.conversationId,
            actionType: 'RESCHEDULE_APPOINTMENT',
            parameters: input as object,
            result: result.actionResult,
            confidence: 0.9,
            appointmentId: result.appointmentId || input.appointmentId,
            patientId: input.patientId,
          },
        });
      }

      await auditLog('UPDATE', 'AppointmentReschedule', {
        entityId: result.appointmentId || input.appointmentId || 'pending',
        changes: { request: input, result: result.actionResult },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return result;
    }),

  /**
   * Cancel an appointment
   * US-302: Appointment scheduling agent
   */
  cancelAppointment: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().optional(),
        callSid: z.string().optional(),
        patientId: z.string(),
        appointmentId: z.string().optional(),
        awaitingConfirmation: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const schedulingAgent = createSchedulingAgent(ctx.prisma, {
        organizationId: ctx.user.organizationId,
      });

      const request: SchedulingRequest = {
        type: 'cancel',
        patientId: input.patientId,
        appointmentId: input.appointmentId,
      };

      const callState = {
        callSid: input.callSid || `API-${Date.now()}`,
        organizationId: ctx.user.organizationId,
        patientId: input.patientId,
        phoneNumber: '',
        status: 'in-progress' as const,
        direction: 'inbound' as const,
        startedAt: new Date(),
        recordingConsent: false,
        transcript: [],
        context: {
          patientIdentified: true,
          intents: ['CANCEL_APPOINTMENT' as const],
          turnCount: 1,
          frustrationLevel: 0,
          silenceCount: 0,
          retryCount: 0,
          pendingAction: input.awaitingConfirmation
            ? { type: 'CANCEL_APPOINTMENT' as const, parameters: {}, awaitingConfirmation: true }
            : undefined,
        },
      };

      const result = await schedulingAgent.cancelAppointment(request, callState);

      if (input.conversationId) {
        await ctx.prisma.aIReceptionistAction.create({
          data: {
            organizationId: ctx.user.organizationId,
            conversationId: input.conversationId,
            actionType: 'CANCEL_APPOINTMENT',
            parameters: input as object,
            result: result.actionResult,
            confidence: 0.9,
            appointmentId: result.appointmentId || input.appointmentId,
            patientId: input.patientId,
          },
        });
      }

      await auditLog('DELETE', 'AppointmentCancellation', {
        entityId: result.appointmentId || input.appointmentId || 'pending',
        changes: { request: input, result: result.actionResult },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return result;
    }),

  /**
   * Parse natural language scheduling request
   * US-302: Appointment scheduling agent
   */
  parseSchedulingRequest: protectedProcedure
    .input(
      z.object({
        userInput: z.string(),
        currentContext: z
          .object({
            appointmentTypeId: z.string().optional(),
            appointmentTypeName: z.string().optional(),
            providerId: z.string().optional(),
            providerName: z.string().optional(),
            preferredDate: z.coerce.date().optional(),
            preferredTimeRange: z
              .object({
                start: z.string(),
                end: z.string(),
              })
              .optional(),
            step: z.enum(['type', 'provider', 'date', 'time', 'confirm']).optional(),
          })
          .optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const schedulingAgent = createSchedulingAgent(ctx.prisma, {
        organizationId: ctx.user.organizationId,
      });

      const callContext = {
        patientIdentified: false,
        intents: [] as ('BOOK_APPOINTMENT' | 'RESCHEDULE_APPOINTMENT' | 'CANCEL_APPOINTMENT' | 'ANSWER_QUESTION' | 'IDENTIFY_PATIENT' | 'CREATE_PATIENT' | 'VERIFY_INSURANCE' | 'SEND_CONFIRMATION' | 'TRANSFER_CALL' | 'TAKE_MESSAGE' | 'COLLECT_INFO')[],
        turnCount: 1,
        frustrationLevel: 0,
        silenceCount: 0,
        retryCount: 0,
        appointmentContext: input.currentContext
          ? {
              appointmentTypeId: input.currentContext.appointmentTypeId,
              appointmentTypeName: input.currentContext.appointmentTypeName,
              providerId: input.currentContext.providerId,
              providerName: input.currentContext.providerName,
              preferredDate: input.currentContext.preferredDate,
              preferredTimeRange: input.currentContext.preferredTimeRange,
              step: input.currentContext.step || 'type',
            }
          : undefined,
      };

      const parsed = schedulingAgent.parseSchedulingRequest(input.userInput, callContext);

      return parsed;
    }),

  /**
   * Find available appointment slots
   * US-302: Appointment scheduling agent
   */
  findAvailableSlots: protectedProcedure
    .input(
      z.object({
        appointmentTypeId: z.string(),
        duration: z.number().min(5).max(480).optional(),
        providerId: z.string().optional(),
        preferredDate: z.coerce.date().optional(),
        preferredTimeStart: z.string().optional(),
        preferredTimeEnd: z.string().optional(),
        maxResults: z.number().min(1).max(20).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Get appointment type for duration if not provided
      let duration = input.duration;
      if (!duration) {
        const apptType = await ctx.prisma.appointmentType.findFirst({
          where: { id: input.appointmentTypeId, organizationId: ctx.user.organizationId },
        });
        duration = apptType?.duration || 30;
      }

      const schedulingAgent = createSchedulingAgent(ctx.prisma, {
        organizationId: ctx.user.organizationId,
        maxSuggestions: input.maxResults || 5,
      });

      const slots = await schedulingAgent.findAvailableSlots({
        appointmentTypeId: input.appointmentTypeId,
        duration,
        providerId: input.providerId,
        preferredDate: input.preferredDate,
        preferredTimeStart: input.preferredTimeStart,
        preferredTimeEnd: input.preferredTimeEnd,
      });

      return slots;
    }),

  /**
   * Collect new patient information from conversation
   * US-302: Appointment scheduling agent
   */
  collectPatientInfo: protectedProcedure
    .input(
      z.object({
        userInput: z.string(),
        currentInfo: z
          .object({
            firstName: z.string().optional(),
            lastName: z.string().optional(),
            dateOfBirth: z.coerce.date().optional(),
            phone: z.string().optional(),
            email: z.string().optional(),
            insuranceProvider: z.string().optional(),
            insuranceMemberId: z.string().optional(),
            isNewPatient: z.boolean().optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const schedulingAgent = createSchedulingAgent(ctx.prisma, {
        organizationId: ctx.user.organizationId,
      });

      const result = await schedulingAgent.collectPatientInfo(
        input.userInput,
        input.currentInfo || { isNewPatient: true }
      );

      return result;
    }),

  /**
   * Confirm insurance information
   * US-302: Appointment scheduling agent
   */
  confirmInsurance: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        userInput: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const schedulingAgent = createSchedulingAgent(ctx.prisma, {
        organizationId: ctx.user.organizationId,
      });

      const result = await schedulingAgent.confirmInsurance(input.patientId, input.userInput);

      return result;
    }),

  /**
   * Send appointment confirmation
   * US-302: Appointment scheduling agent
   */
  sendConfirmation: protectedProcedure
    .input(
      z.object({
        appointmentId: z.string(),
        patientId: z.string(),
        method: z.enum(['sms', 'email', 'both']).default('both'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const schedulingAgent = createSchedulingAgent(ctx.prisma, {
        organizationId: ctx.user.organizationId,
      });

      const result = await schedulingAgent.sendConfirmation(input);

      if (result.success) {
        await auditLog('CREATE', 'AppointmentConfirmation', {
          entityId: input.appointmentId,
          changes: { method: input.method, sentVia: result.methods },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });
      }

      return result;
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

  // ==================== FAQ Agent (US-303) ====================

  /**
   * Answer a patient question using the knowledge base
   * US-303: FAQ and information agent
   */
  answerQuestion: protectedProcedure
    .input(
      z.object({
        question: z.string().min(1),
        category: knowledgeCategorySchema.optional(),
        patientId: z.string().optional(),
        conversationId: z.string().optional(),
        context: z
          .object({
            previousQuestions: z.array(z.string()).optional(),
            patientIsNew: z.boolean().optional(),
            appointmentDate: z.coerce.date().optional(),
            appointmentType: z.string().optional(),
            providerName: z.string().optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const faqAgent = createFAQAgent(ctx.prisma, {
        organizationId: ctx.user.organizationId,
      });

      const result = await faqAgent.answerQuestion({
        question: input.question,
        category: input.category,
        patientId: input.patientId,
        context: input.context,
      });

      // Record the action if we have a conversation
      if (input.conversationId) {
        await ctx.prisma.aIReceptionistAction.create({
          data: {
            organizationId: ctx.user.organizationId,
            conversationId: input.conversationId,
            actionType: 'ANSWER_QUESTION',
            parameters: {
              question: input.question,
              category: input.category,
            },
            result: result.actionResult,
            confidence: result.confidence,
            reasoning: result.source?.question,
            patientId: input.patientId,
          },
        });
      }

      // Log escalations
      if (result.shouldEscalate && input.conversationId) {
        await ctx.prisma.aIReceptionistEscalation.create({
          data: {
            organizationId: ctx.user.organizationId,
            conversationId: input.conversationId,
            reason: 'COMPLEX_REQUEST',
            contextSummary: `Question: ${input.question}`,
            suggestedActions: [result.escalationReason || 'Unknown question - needs human assistance'],
            urgencyLevel: 1,
          },
        });
      }

      await auditLog('CREATE', 'FAQAnswer', {
        entityId: result.source?.entryId || 'none',
        changes: {
          question: input.question,
          answered: result.success,
          confidence: result.confidence,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return result;
    }),

  /**
   * Get practice information (hours, location, etc.)
   * US-303: FAQ and information agent
   */
  getPracticeInfo: protectedProcedure
    .input(
      z.object({
        infoType: z.enum(['hours', 'location', 'parking', 'contact', 'general']),
      })
    )
    .query(async ({ ctx, input }) => {
      const faqAgent = createFAQAgent(ctx.prisma, {
        organizationId: ctx.user.organizationId,
      });

      return faqAgent.getPracticeInfo(input.infoType);
    }),

  /**
   * Get insurance information
   * US-303: FAQ and information agent
   */
  getInsuranceInfo: protectedProcedure
    .input(
      z.object({
        insuranceProvider: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const faqAgent = createFAQAgent(ctx.prisma, {
        organizationId: ctx.user.organizationId,
      });

      return faqAgent.getInsuranceInfo(input?.insuranceProvider);
    }),

  /**
   * Get service/treatment information
   * US-303: FAQ and information agent
   */
  getServiceInfo: protectedProcedure
    .input(
      z.object({
        serviceName: z.string().optional(),
        condition: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const faqAgent = createFAQAgent(ctx.prisma, {
        organizationId: ctx.user.organizationId,
      });

      return faqAgent.getServiceInfo(input?.serviceName, input?.condition);
    }),

  /**
   * Get provider information
   * US-303: FAQ and information agent
   */
  getProviderInfo: protectedProcedure
    .input(
      z.object({
        providerName: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const faqAgent = createFAQAgent(ctx.prisma, {
        organizationId: ctx.user.organizationId,
      });

      return faqAgent.getProviderInfo(input?.providerName);
    }),

  /**
   * Get appointment preparation instructions
   * US-303: FAQ and information agent
   */
  getAppointmentPrep: protectedProcedure
    .input(
      z.object({
        appointmentType: z.string().optional(),
        isNewPatient: z.boolean().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const faqAgent = createFAQAgent(ctx.prisma, {
        organizationId: ctx.user.organizationId,
      });

      return faqAgent.getAppointmentPrep(input?.appointmentType, input?.isNewPatient);
    }),

  /**
   * Get new patient process information
   * US-303: FAQ and information agent
   */
  getNewPatientInfo: protectedProcedure.query(async ({ ctx }) => {
    const faqAgent = createFAQAgent(ctx.prisma, {
      organizationId: ctx.user.organizationId,
    });

    return faqAgent.getNewPatientInfo();
  }),

  /**
   * Search FAQs for chat/widget display
   * US-303: FAQ and information agent
   */
  searchFAQs: protectedProcedure
    .input(
      z.object({
        searchTerm: z.string().min(1),
        limit: z.number().min(1).max(20).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const faqAgent = createFAQAgent(ctx.prisma, {
        organizationId: ctx.user.organizationId,
        maxSuggestions: input.limit,
      });

      return faqAgent.searchFAQs(input.searchTerm);
    }),

  /**
   * Get FAQs by category
   * US-303: FAQ and information agent
   */
  getFAQsByCategory: protectedProcedure
    .input(
      z.object({
        category: knowledgeCategorySchema,
      })
    )
    .query(async ({ ctx, input }) => {
      const faqAgent = createFAQAgent(ctx.prisma, {
        organizationId: ctx.user.organizationId,
      });

      return faqAgent.getFAQsByCategory(input.category);
    }),

  /**
   * Get popular/frequently asked questions
   * US-303: FAQ and information agent
   */
  getPopularQuestions: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(10),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const faqAgent = createFAQAgent(ctx.prisma, {
        organizationId: ctx.user.organizationId,
      });

      return faqAgent.getPopularQuestions(input?.limit || 10);
    }),

  /**
   * Record feedback on an FAQ answer
   * US-303: FAQ and information agent
   */
  recordFAQFeedback: protectedProcedure
    .input(
      z.object({
        entryId: z.string(),
        helpful: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const faqAgent = createFAQAgent(ctx.prisma, {
        organizationId: ctx.user.organizationId,
      });

      await faqAgent.recordFeedback(input.entryId, input.helpful);

      await auditLog('UPDATE', 'FAQFeedback', {
        entityId: input.entryId,
        changes: { helpful: input.helpful },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // ==================== Patient Identification Agent (US-304) ====================

  /**
   * Identify patient by caller ID (phone number lookup)
   * US-304: Patient identification
   */
  identifyByCallerId: protectedProcedure
    .input(
      z.object({
        phoneNumber: z.string().min(10),
        callSid: z.string().optional(),
        conversationId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const identificationAgent = createPatientIdentificationAgent(ctx.prisma, {
        organizationId: ctx.user.organizationId,
      });

      const callState = {
        callSid: input.callSid || `API-${Date.now()}`,
        organizationId: ctx.user.organizationId,
        phoneNumber: input.phoneNumber,
        conversationId: input.conversationId,
        status: 'in-progress' as const,
        direction: 'inbound' as const,
        startedAt: new Date(),
        recordingConsent: false,
        transcript: [],
        context: {
          patientIdentified: false,
          intents: ['IDENTIFY_PATIENT' as const],
          turnCount: 1,
          frustrationLevel: 0,
          silenceCount: 0,
          retryCount: 0,
        },
      };

      const result = await identificationAgent.lookupByCallerId(input.phoneNumber, callState);

      // Record the action
      if (input.conversationId) {
        await ctx.prisma.aIReceptionistAction.create({
          data: {
            organizationId: ctx.user.organizationId,
            conversationId: input.conversationId,
            actionType: 'IDENTIFY_PATIENT',
            parameters: { phoneNumber: input.phoneNumber, method: 'caller_id' },
            result: result.actionResult,
            confidence: result.verified ? 1.0 : 0.5,
            patientId: result.patientId,
          },
        });
      }

      await auditLog('CREATE', 'PatientIdentification', {
        entityId: result.patientId || 'unknown',
        changes: { method: 'caller_id', verified: result.verified },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return result;
    }),

  /**
   * Verify patient by name and date of birth
   * US-304: Patient identification
   */
  verifyByNameAndDOB: protectedProcedure
    .input(
      z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        dateOfBirth: z.coerce.date(),
        callSid: z.string().optional(),
        conversationId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const identificationAgent = createPatientIdentificationAgent(ctx.prisma, {
        organizationId: ctx.user.organizationId,
      });

      const callState = {
        callSid: input.callSid || `API-${Date.now()}`,
        organizationId: ctx.user.organizationId,
        phoneNumber: '',
        conversationId: input.conversationId,
        status: 'in-progress' as const,
        direction: 'inbound' as const,
        startedAt: new Date(),
        recordingConsent: false,
        transcript: [],
        context: {
          patientIdentified: false,
          intents: ['IDENTIFY_PATIENT' as const],
          turnCount: 1,
          frustrationLevel: 0,
          silenceCount: 0,
          retryCount: 0,
        },
      };

      const result = await identificationAgent.verifyByNameAndDOB(
        input.firstName,
        input.lastName,
        input.dateOfBirth,
        callState
      );

      // Record the action
      if (input.conversationId) {
        await ctx.prisma.aIReceptionistAction.create({
          data: {
            organizationId: ctx.user.organizationId,
            conversationId: input.conversationId,
            actionType: 'IDENTIFY_PATIENT',
            parameters: {
              firstName: input.firstName,
              lastName: input.lastName,
              method: 'dob_name',
            },
            result: result.actionResult,
            confidence: result.verified ? 1.0 : 0.5,
            patientId: result.patientId,
          },
        });
      }

      await auditLog('CREATE', 'PatientIdentification', {
        entityId: result.patientId || 'unknown',
        changes: { method: 'dob_name', verified: result.verified },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return result;
    }),

  /**
   * Parse verification info from natural language
   * US-304: Patient identification
   */
  parseVerificationInfo: protectedProcedure
    .input(
      z.object({
        userInput: z.string().min(1),
        currentInfo: z
          .object({
            firstName: z.string().optional(),
            lastName: z.string().optional(),
            dateOfBirth: z.coerce.date().optional(),
            phoneNumber: z.string().optional(),
          })
          .optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const identificationAgent = createPatientIdentificationAgent(ctx.prisma, {
        organizationId: ctx.user.organizationId,
      });

      const result = identificationAgent.parseVerificationInfo(
        input.userInput,
        input.currentInfo || {}
      );

      return result;
    }),

  /**
   * Main identification flow - orchestrates the full verification process
   * US-304: Patient identification
   */
  identifyPatient: protectedProcedure
    .input(
      z.object({
        phoneNumber: z.string().optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        dateOfBirth: z.coerce.date().optional(),
        verificationMethod: z.enum(['caller_id', 'voice', 'dob_name']).optional(),
        callSid: z.string().optional(),
        conversationId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const identificationAgent = createPatientIdentificationAgent(ctx.prisma, {
        organizationId: ctx.user.organizationId,
      });

      const callState = {
        callSid: input.callSid || `API-${Date.now()}`,
        organizationId: ctx.user.organizationId,
        phoneNumber: input.phoneNumber || '',
        conversationId: input.conversationId,
        status: 'in-progress' as const,
        direction: 'inbound' as const,
        startedAt: new Date(),
        recordingConsent: false,
        transcript: [],
        context: {
          patientIdentified: false,
          intents: ['IDENTIFY_PATIENT' as const],
          turnCount: 1,
          frustrationLevel: 0,
          silenceCount: 0,
          retryCount: 0,
        },
      };

      const result = await identificationAgent.identifyPatient(
        {
          phoneNumber: input.phoneNumber,
          firstName: input.firstName,
          lastName: input.lastName,
          dateOfBirth: input.dateOfBirth,
          verificationMethod: input.verificationMethod,
        },
        callState
      );

      // Record the action
      if (input.conversationId) {
        await ctx.prisma.aIReceptionistAction.create({
          data: {
            organizationId: ctx.user.organizationId,
            conversationId: input.conversationId,
            actionType: 'IDENTIFY_PATIENT',
            parameters: {
              method: result.verificationMethod,
            },
            result: result.actionResult,
            confidence: result.verified ? 1.0 : 0.5,
            patientId: result.patientId,
          },
        });
      }

      await auditLog('CREATE', 'PatientIdentification', {
        entityId: result.patientId || 'unknown',
        changes: { method: result.verificationMethod, verified: result.verified },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return result;
    }),

  /**
   * Create a new patient during a call
   * US-304: Patient identification
   */
  createPatientDuringCall: protectedProcedure
    .input(
      z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        dateOfBirth: z.coerce.date(),
        phone: z.string().min(10),
        email: z.string().email().optional(),
        address: z
          .object({
            street: z.string().optional(),
            city: z.string().optional(),
            state: z.string().optional(),
            zip: z.string().optional(),
          })
          .optional(),
        insuranceProvider: z.string().optional(),
        insuranceMemberId: z.string().optional(),
        emergencyContactName: z.string().optional(),
        emergencyContactPhone: z.string().optional(),
        referralSource: z.string().optional(),
        callSid: z.string().optional(),
        conversationId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const identificationAgent = createPatientIdentificationAgent(ctx.prisma, {
        organizationId: ctx.user.organizationId,
        allowNewPatientCreation: true,
      });

      const callState = {
        callSid: input.callSid || `API-${Date.now()}`,
        organizationId: ctx.user.organizationId,
        phoneNumber: input.phone,
        conversationId: input.conversationId,
        status: 'in-progress' as const,
        direction: 'inbound' as const,
        startedAt: new Date(),
        recordingConsent: false,
        transcript: [],
        context: {
          patientIdentified: false,
          intents: ['CREATE_PATIENT' as const],
          turnCount: 1,
          frustrationLevel: 0,
          silenceCount: 0,
          retryCount: 0,
        },
      };

      const patientInfo: NewPatientInfo = {
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: input.dateOfBirth,
        phone: input.phone,
        email: input.email,
        address: input.address,
        insuranceProvider: input.insuranceProvider,
        insuranceMemberId: input.insuranceMemberId,
        emergencyContactName: input.emergencyContactName,
        emergencyContactPhone: input.emergencyContactPhone,
        referralSource: input.referralSource,
      };

      const result = await identificationAgent.createNewPatient(patientInfo, callState);

      // Record the action
      if (input.conversationId) {
        await ctx.prisma.aIReceptionistAction.create({
          data: {
            organizationId: ctx.user.organizationId,
            conversationId: input.conversationId,
            actionType: 'CREATE_PATIENT',
            parameters: {
              firstName: input.firstName,
              lastName: input.lastName,
            },
            result: result.actionResult,
            confidence: 1.0,
            patientId: result.patientId,
          },
        });
      }

      await auditLog('CREATE', 'Patient', {
        entityId: result.patientId || 'unknown',
        changes: {
          firstName: input.firstName,
          lastName: input.lastName,
          createdDuringCall: true,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return result;
    }),

  /**
   * Collect new patient information from conversation
   * US-304: Patient identification
   */
  collectNewPatientInfo: protectedProcedure
    .input(
      z.object({
        userInput: z.string().min(1),
        currentInfo: z
          .object({
            firstName: z.string().optional(),
            lastName: z.string().optional(),
            dateOfBirth: z.coerce.date().optional(),
            phone: z.string().optional(),
            email: z.string().optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const identificationAgent = createPatientIdentificationAgent(ctx.prisma, {
        organizationId: ctx.user.organizationId,
      });

      const result = await identificationAgent.collectNewPatientInfo(
        input.userInput,
        input.currentInfo || {}
      );

      return result;
    }),

  /**
   * Handle family member calling on behalf of patient
   * US-304: Patient identification
   */
  handleFamilyMemberCalling: protectedProcedure
    .input(
      z.object({
        callerPatientId: z.string(),
        callingForPatientId: z.string(),
        callSid: z.string().optional(),
        conversationId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const identificationAgent = createPatientIdentificationAgent(ctx.prisma, {
        organizationId: ctx.user.organizationId,
      });

      const callState = {
        callSid: input.callSid || `API-${Date.now()}`,
        organizationId: ctx.user.organizationId,
        phoneNumber: '',
        conversationId: input.conversationId,
        patientId: input.callerPatientId,
        status: 'in-progress' as const,
        direction: 'inbound' as const,
        startedAt: new Date(),
        recordingConsent: false,
        transcript: [],
        context: {
          patientIdentified: true,
          intents: ['IDENTIFY_PATIENT' as const],
          turnCount: 1,
          frustrationLevel: 0,
          silenceCount: 0,
          retryCount: 0,
        },
      };

      const result = await identificationAgent.handleFamilyMemberCalling(
        input.callerPatientId,
        input.callingForPatientId,
        callState
      );

      // Record the action
      if (input.conversationId) {
        await ctx.prisma.aIReceptionistAction.create({
          data: {
            organizationId: ctx.user.organizationId,
            conversationId: input.conversationId,
            actionType: 'IDENTIFY_PATIENT',
            parameters: {
              method: 'family_member',
              callerPatientId: input.callerPatientId,
              callingForPatientId: input.callingForPatientId,
            },
            result: result.actionResult,
            confidence: result.verified ? 1.0 : 0.5,
            patientId: result.patientId,
          },
        });
      }

      await auditLog('CREATE', 'PatientIdentification', {
        entityId: result.patientId || 'unknown',
        changes: {
          method: 'family_member',
          callerPatientId: input.callerPatientId,
          verified: result.verified,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return result;
    }),

  /**
   * Prompt for family member selection when household has multiple patients
   * US-304: Patient identification
   */
  promptForFamilyMember: protectedProcedure
    .input(
      z.object({
        callerPatientId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const identificationAgent = createPatientIdentificationAgent(ctx.prisma, {
        organizationId: ctx.user.organizationId,
      });

      return identificationAgent.promptForFamilyMember(input.callerPatientId);
    }),

  /**
   * Verify caller authorization to access patient information (HIPAA compliance)
   * US-304: Patient identification
   */
  verifyAuthorization: protectedProcedure
    .input(
      z.object({
        callerId: z.string(),
        patientId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const identificationAgent = createPatientIdentificationAgent(ctx.prisma, {
        organizationId: ctx.user.organizationId,
      });

      return identificationAgent.verifyAuthorization(input.callerId, input.patientId);
    }),

  /**
   * Get privacy-safe patient info for verification without revealing full details
   * US-304: Patient identification
   */
  getPrivacySafePatientInfo: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const identificationAgent = createPatientIdentificationAgent(ctx.prisma, {
        organizationId: ctx.user.organizationId,
      });

      return identificationAgent.getPrivacySafePatientInfo(input.patientId);
    }),

  /**
   * Link a conversation to a patient record
   * US-304: Patient identification
   */
  linkConversationToPatient: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        patientId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const identificationAgent = createPatientIdentificationAgent(ctx.prisma, {
        organizationId: ctx.user.organizationId,
      });

      await identificationAgent.linkConversationToPatient(input.conversationId, input.patientId);

      await auditLog('UPDATE', 'AIReceptionistConversation', {
        entityId: input.conversationId,
        changes: { patientId: input.patientId },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),
});
