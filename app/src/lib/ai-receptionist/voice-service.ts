/**
 * Epic 30: AI Receptionist Agent - Voice Service
 * US-301: Voice AI Integration
 *
 * Integrates Twilio Voice with OpenAI Realtime API for natural
 * phone conversations with low-latency AI responses.
 */

import type { PrismaClient } from '@prisma/client';
import type {
  VoiceServiceConfig,
  CallState,
  CallContext,
  TranscriptEntry,
  IncomingCallRequest,
  CallResponse,
  ProcessSpeechRequest,
  ProcessSpeechResponse,
  TransferRequest,
  TransferResult,
  TwilioWebhookPayload,
  OpenAISessionConfig,
  OpenAITool,
  VoiceEvent,
  CallAnalytics,
  BusinessHours,
  EscalationRule,
} from './types';
import { AIActionType, AIConversationStatus, AIEscalationReason, ConversationChannel } from './types';

// In-memory call state management (in production, use Redis)
const activeCalls = new Map<string, CallState>();

/**
 * Voice AI Service
 * Handles phone call processing with Twilio + OpenAI Realtime API
 */
export class VoiceService {
  private prisma: PrismaClient;
  private config: VoiceServiceConfig;
  private eventHandlers: Map<string, ((event: VoiceEvent) => void)[]> = new Map();

  constructor(prisma: PrismaClient, config: VoiceServiceConfig) {
    this.prisma = prisma;
    this.config = config;
  }

  // ==================== Call Lifecycle ====================

  /**
   * Handle incoming call webhook from Twilio
   */
  async handleIncomingCall(request: IncomingCallRequest): Promise<CallResponse[]> {
    const { callSid, from, to } = request;

    // Check if within business hours
    const isAfterHours = !this.isWithinBusinessHours();

    // Try to identify patient by phone number
    const patient = await this.lookupPatientByPhone(from);

    // Create call state
    const callState: CallState = {
      callSid,
      organizationId: this.config.organizationId,
      patientId: patient?.id,
      phoneNumber: from,
      status: 'ringing',
      direction: request.direction,
      startedAt: new Date(),
      recordingConsent: false,
      transcript: [],
      context: {
        patientIdentified: !!patient,
        patientName: patient ? `${patient.firstName} ${patient.lastName}` : undefined,
        intents: [],
        turnCount: 0,
        frustrationLevel: 0,
        silenceCount: 0,
        retryCount: 0,
      },
    };

    activeCalls.set(callSid, callState);

    // Create conversation record in database
    const conversation = await this.prisma.aIReceptionistConversation.create({
      data: {
        channel: 'PHONE' as ConversationChannel,
        status: 'ACTIVE' as AIConversationStatus,
        externalCallId: callSid,
        phoneNumber: from,
        patientId: patient?.id,
        organizationId: this.config.organizationId,
        recordingConsent: false,
      },
    });

    callState.conversationId = conversation.id;

    // Emit event
    this.emitEvent({
      type: 'call.incoming',
      callSid,
      organizationId: this.config.organizationId,
      timestamp: new Date(),
      data: { from, to, patientId: patient?.id },
    });

    // Build TwiML response
    const responses: CallResponse[] = [];

    if (isAfterHours) {
      // After-hours handling
      responses.push({
        type: 'say',
        content: this.config.afterHoursMessage ||
          'Thank you for calling. Our office is currently closed. Please call back during business hours.',
        voice: 'Polly.Joanna',
      });

      // Update call state
      callState.status = 'completed';
      await this.endCall(callSid, 'COMPLETED');

      responses.push({ type: 'hangup' });
    } else {
      // Check for recording consent if enabled
      if (this.config.recordByDefault && this.config.recordingDisclosure) {
        responses.push({
          type: 'say',
          content: this.config.recordingDisclosure,
          voice: 'Polly.Joanna',
        });
      }

      // Greeting
      const greeting = this.buildGreeting(patient);
      responses.push({
        type: 'say',
        content: greeting,
        voice: 'Polly.Joanna',
      });

      // Start bi-directional stream for real-time AI
      responses.push({
        type: 'stream',
        url: `wss://${process.env.APP_DOMAIN}/api/voice/stream`,
      });
    }

    return responses;
  }

  /**
   * Process speech input from caller
   */
  async processSpeech(request: ProcessSpeechRequest): Promise<ProcessSpeechResponse> {
    const { callSid, speechResult, confidence, callState } = request;

    // Add to transcript
    const transcriptEntry: TranscriptEntry = {
      role: 'user',
      content: speechResult,
      timestamp: new Date(),
      confidence,
    };
    callState.transcript.push(transcriptEntry);
    callState.context.turnCount++;

    // Detect intent and sentiment
    const { intent, frustration } = await this.analyzeInput(speechResult, callState.context);

    if (intent) {
      callState.context.intents.push(intent);
      callState.context.intent = intent;
    }

    // Update frustration level
    callState.context.frustrationLevel = Math.min(1, callState.context.frustrationLevel + frustration);

    // Check escalation rules
    const escalation = this.checkEscalationRules(speechResult, callState.context);
    if (escalation) {
      return {
        response: this.config.transferMessage || 'Let me transfer you to a team member who can help.',
        shouldEscalate: true,
        escalationReason: escalation.reason,
        updatedContext: callState.context,
      };
    }

    // Generate AI response
    const response = await this.generateResponse(speechResult, callState);

    // Add response to transcript
    callState.transcript.push({
      role: 'assistant',
      content: response.response,
      timestamp: new Date(),
    });
    callState.context.lastResponse = response.response;

    // Update call state
    activeCalls.set(callSid, callState);

    // Emit event
    this.emitEvent({
      type: 'speech.detected',
      callSid,
      organizationId: this.config.organizationId,
      timestamp: new Date(),
      data: { text: speechResult, confidence, intent },
    });

    return response;
  }

  /**
   * Generate AI response using context
   */
  private async generateResponse(
    userInput: string,
    callState: CallState
  ): Promise<ProcessSpeechResponse> {
    const context = callState.context;

    // Build response based on detected intent
    let response = '';
    let action: AIActionType | undefined;
    let shouldEscalate = false;
    let escalationReason: AIEscalationReason | undefined;

    // Check for explicit request for human
    if (this.wantsHuman(userInput)) {
      return {
        response: 'Of course, let me connect you with a team member right away.',
        shouldEscalate: true,
        escalationReason: 'PATIENT_REQUEST' as AIEscalationReason,
        updatedContext: context,
      };
    }

    // Intent-based response generation
    switch (context.intent) {
      case 'BOOK_APPOINTMENT':
        response = await this.handleBookingIntent(userInput, context, callState);
        action = 'BOOK_APPOINTMENT' as AIActionType;
        break;

      case 'RESCHEDULE_APPOINTMENT':
        response = await this.handleRescheduleIntent(userInput, context, callState);
        action = 'RESCHEDULE_APPOINTMENT' as AIActionType;
        break;

      case 'CANCEL_APPOINTMENT':
        response = await this.handleCancelIntent(userInput, context, callState);
        action = 'CANCEL_APPOINTMENT' as AIActionType;
        break;

      case 'ANSWER_QUESTION':
        response = await this.handleQuestionIntent(userInput, context, callState);
        action = 'ANSWER_QUESTION' as AIActionType;
        break;

      default:
        // General conversation handling
        response = await this.handleGeneralIntent(userInput, context, callState);
    }

    return {
      response,
      action,
      shouldEscalate,
      escalationReason,
      updatedContext: context,
    };
  }

  // ==================== Intent Handlers ====================

  private async handleBookingIntent(
    userInput: string,
    context: CallContext,
    callState: CallState
  ): Promise<string> {
    // Initialize appointment context if needed
    if (!context.appointmentContext) {
      context.appointmentContext = { step: 'type' };
    }

    const apptContext = context.appointmentContext;

    switch (apptContext.step) {
      case 'type':
        // Get appointment types
        const types = await this.prisma.appointmentType.findMany({
          where: { organizationId: this.config.organizationId, isActive: true },
          take: 5,
        });

        if (types.length === 0) {
          return "I apologize, but I'm having trouble accessing our appointment types. Let me transfer you to our scheduling team.";
        }

        const typeNames = types.map(t => t.name).join(', ');
        apptContext.step = 'provider';
        return `I'd be happy to help you schedule an appointment. What type of appointment are you looking for? We offer ${typeNames}.`;

      case 'provider':
        // Get providers
        const providers = await this.prisma.provider.findMany({
          where: { organizationId: this.config.organizationId, isActive: true },
          include: { user: { select: { firstName: true, lastName: true } } },
          take: 5,
        });

        if (providers.length === 0) {
          return 'Let me check on available providers and get back to you.';
        }

        const providerNames = providers
          .filter(p => p.user)
          .map(p => `Dr. ${p.user!.lastName}`)
          .join(', ');
        apptContext.step = 'date';
        return `Great! Do you have a preference for which provider you'd like to see? We have ${providerNames} available.`;

      case 'date':
        apptContext.step = 'time';
        return 'What date works best for you? We have availability this week and next.';

      case 'time':
        apptContext.step = 'confirm';
        return 'I have some openings. Would morning or afternoon work better for you?';

      case 'confirm':
        return `Perfect! Let me confirm: you'd like to schedule an appointment. Should I book this for you?`;

      default:
        return 'I can help you schedule an appointment. What type of visit are you looking for?';
    }
  }

  private async handleRescheduleIntent(
    userInput: string,
    context: CallContext,
    callState: CallState
  ): Promise<string> {
    if (!callState.patientId) {
      return "I'd be happy to help you reschedule. Can you confirm your name and date of birth so I can pull up your appointment?";
    }

    // Look up patient's upcoming appointments
    const appointments = await this.prisma.appointment.findMany({
      where: {
        patientId: callState.patientId,
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
        startTime: { gte: new Date() },
      },
      include: {
        appointmentType: true,
        provider: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { startTime: 'asc' },
      take: 1,
    });

    if (appointments.length === 0) {
      return "I don't see any upcoming appointments on your account. Would you like to schedule a new appointment?";
    }

    const appt = appointments[0];
    const apptDate = appt.startTime.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    return `I see you have a ${appt.appointmentType.name} appointment scheduled for ${apptDate}. What date and time would work better for you?`;
  }

  private async handleCancelIntent(
    userInput: string,
    context: CallContext,
    callState: CallState
  ): Promise<string> {
    if (!callState.patientId) {
      return "I can help you cancel your appointment. Can you confirm your name and date of birth?";
    }

    const appointments = await this.prisma.appointment.findMany({
      where: {
        patientId: callState.patientId,
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
        startTime: { gte: new Date() },
      },
      include: { appointmentType: true },
      orderBy: { startTime: 'asc' },
      take: 1,
    });

    if (appointments.length === 0) {
      return "I don't see any upcoming appointments to cancel. Is there anything else I can help you with?";
    }

    const appt = appointments[0];
    const apptDate = appt.startTime.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    return `I see your ${appt.appointmentType.name} appointment on ${apptDate}. Are you sure you'd like to cancel this appointment?`;
  }

  private async handleQuestionIntent(
    userInput: string,
    context: CallContext,
    callState: CallState
  ): Promise<string> {
    // Search knowledge base
    const searchTerms = userInput.toLowerCase().split(' ').filter(w => w.length > 3);

    const knowledgeEntry = await this.prisma.aIKnowledgeBase.findFirst({
      where: {
        organizationId: this.config.organizationId,
        isActive: true,
        OR: [
          { keywords: { hasSome: searchTerms } },
          { question: { contains: userInput, mode: 'insensitive' } },
        ],
      },
      orderBy: { priority: 'desc' },
    });

    if (knowledgeEntry) {
      // Update usage stats
      await this.prisma.aIKnowledgeBase.update({
        where: { id: knowledgeEntry.id },
        data: { timesUsed: { increment: 1 }, lastUsedAt: new Date() },
      });

      return knowledgeEntry.answer;
    }

    // Fallback response
    return "I want to make sure I give you accurate information. Let me transfer you to someone who can help with that specific question.";
  }

  private async handleGeneralIntent(
    userInput: string,
    context: CallContext,
    callState: CallState
  ): Promise<string> {
    // Detect booking-related keywords
    const bookingKeywords = ['appointment', 'schedule', 'book', 'visit', 'see the doctor', 'come in'];
    const rescheduleKeywords = ['reschedule', 'change', 'move', 'different time', 'different day'];
    const cancelKeywords = ['cancel', 'remove', 'delete'];
    const questionKeywords = ['hours', 'location', 'address', 'insurance', 'accept', 'cost', 'price'];

    const lowerInput = userInput.toLowerCase();

    if (bookingKeywords.some(k => lowerInput.includes(k))) {
      context.intent = 'BOOK_APPOINTMENT' as AIActionType;
      return this.handleBookingIntent(userInput, context, callState);
    }

    if (rescheduleKeywords.some(k => lowerInput.includes(k))) {
      context.intent = 'RESCHEDULE_APPOINTMENT' as AIActionType;
      return this.handleRescheduleIntent(userInput, context, callState);
    }

    if (cancelKeywords.some(k => lowerInput.includes(k))) {
      context.intent = 'CANCEL_APPOINTMENT' as AIActionType;
      return this.handleCancelIntent(userInput, context, callState);
    }

    if (questionKeywords.some(k => lowerInput.includes(k))) {
      context.intent = 'ANSWER_QUESTION' as AIActionType;
      return this.handleQuestionIntent(userInput, context, callState);
    }

    // Default helpful response
    return 'How can I help you today? I can schedule appointments, answer questions about our office, or connect you with our team.';
  }

  // ==================== Call Management ====================

  /**
   * Transfer call to human
   */
  async transferCall(request: TransferRequest): Promise<TransferResult> {
    const { callSid, targetNumber, reason, contextSummary } = request;
    const callState = activeCalls.get(callSid);

    if (!callState) {
      return { success: false, error: 'Call not found' };
    }

    // Create escalation record
    if (callState.conversationId) {
      await this.prisma.aIReceptionistEscalation.create({
        data: {
          conversationId: callState.conversationId,
          reason: 'PATIENT_REQUEST' as AIEscalationReason,
          reasonDetails: reason,
          contextSummary,
          urgencyLevel: 2,
          organizationId: this.config.organizationId,
        },
      });
    }

    // Update call state
    callState.status = 'transferring';
    activeCalls.set(callSid, callState);

    // Emit event
    this.emitEvent({
      type: 'transfer.initiated',
      callSid,
      organizationId: this.config.organizationId,
      timestamp: new Date(),
      data: { targetNumber, reason },
    });

    // Note: In production, this would use Twilio API to transfer
    // For now, return success and the router will handle TwiML generation
    return {
      success: true,
      transferSid: `TR${Date.now()}`,
    };
  }

  /**
   * Start call recording
   */
  async startRecording(callSid: string): Promise<{ success: boolean; recordingSid?: string }> {
    const callState = activeCalls.get(callSid);
    if (!callState) {
      return { success: false };
    }

    callState.recordingConsent = true;

    // Update database
    if (callState.conversationId) {
      await this.prisma.aIReceptionistConversation.update({
        where: { id: callState.conversationId },
        data: { recordingConsent: true },
      });
    }

    this.emitEvent({
      type: 'recording.started',
      callSid,
      organizationId: this.config.organizationId,
      timestamp: new Date(),
      data: {},
    });

    // Note: In production, initiate Twilio recording
    const recordingSid = `RE${Date.now()}`;
    callState.recordingSid = recordingSid;
    activeCalls.set(callSid, callState);

    return { success: true, recordingSid };
  }

  /**
   * Handle recording completion
   */
  async handleRecordingComplete(
    callSid: string,
    recordingUrl: string,
    duration: number
  ): Promise<void> {
    const callState = activeCalls.get(callSid);
    if (!callState?.conversationId) return;

    await this.prisma.aIReceptionistConversation.update({
      where: { id: callState.conversationId },
      data: {
        recordingUrl,
        duration,
      },
    });

    this.emitEvent({
      type: 'recording.completed',
      callSid,
      organizationId: this.config.organizationId,
      timestamp: new Date(),
      data: { recordingUrl, duration },
    });
  }

  /**
   * End call and save conversation
   */
  async endCall(callSid: string, status: AIConversationStatus): Promise<void> {
    const callState = activeCalls.get(callSid);
    if (!callState) return;

    const duration = Math.floor((Date.now() - callState.startedAt.getTime()) / 1000);

    // Update conversation record
    if (callState.conversationId) {
      await this.prisma.aIReceptionistConversation.update({
        where: { id: callState.conversationId },
        data: {
          status,
          duration,
          transcript: JSON.parse(JSON.stringify(callState.transcript)),
          context: JSON.parse(JSON.stringify(callState.context)),
          summary: this.generateSummary(callState),
          resolvedTopics: callState.context.intents.map(i => i.toString()),
          endedAt: new Date(),
        },
      });
    }

    // Emit event
    this.emitEvent({
      type: 'call.completed',
      callSid,
      organizationId: this.config.organizationId,
      timestamp: new Date(),
      data: { duration, status },
    });

    // Clean up
    activeCalls.delete(callSid);
  }

  // ==================== Helper Methods ====================

  /**
   * Look up patient by phone number
   */
  private async lookupPatientByPhone(phoneNumber: string): Promise<{ id: string; firstName: string; lastName: string } | null> {
    // Normalize phone number (remove non-digits)
    const normalizedPhone = phoneNumber.replace(/\D/g, '');

    // Search in PatientContact for phone numbers
    const contact = await this.prisma.patientContact.findFirst({
      where: {
        OR: [
          { homePhone: { contains: normalizedPhone } },
          { mobilePhone: { contains: normalizedPhone } },
          { workPhone: { contains: normalizedPhone } },
        ],
        patient: { organizationId: this.config.organizationId },
      },
      include: {
        patient: {
          include: { demographics: true },
        },
      },
    });

    if (contact?.patient?.demographics) {
      return {
        id: contact.patientId,
        firstName: contact.patient.demographics.firstName,
        lastName: contact.patient.demographics.lastName,
      };
    }

    return null;
  }

  /**
   * Check if current time is within business hours
   */
  private isWithinBusinessHours(): boolean {
    if (!this.config.businessHours) return true;

    const now = new Date();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = days[now.getDay()] as keyof BusinessHours;
    const hours = this.config.businessHours[dayName];

    if (!hours) return false;

    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
    return currentTime >= hours.open && currentTime <= hours.close;
  }

  /**
   * Build personalized greeting
   */
  private buildGreeting(patient: { firstName: string; lastName: string } | null): string {
    const baseGreeting = this.config.greeting ||
      'Thank you for calling. I\'m your AI assistant and I can help you schedule appointments, answer questions, or connect you with our team.';

    if (patient) {
      return `Hello ${patient.firstName}! ${baseGreeting}`;
    }

    return baseGreeting;
  }

  /**
   * Analyze user input for intent and frustration
   */
  private async analyzeInput(
    input: string,
    context: CallContext
  ): Promise<{ intent: AIActionType | null; frustration: number }> {
    let intent: AIActionType | null = null;
    let frustration = 0;

    const lowerInput = input.toLowerCase();

    // Intent detection (simple keyword matching)
    if (lowerInput.match(/\b(schedule|book|appointment|visit)\b/)) {
      intent = 'BOOK_APPOINTMENT' as AIActionType;
    } else if (lowerInput.match(/\b(reschedule|change|move)\b/)) {
      intent = 'RESCHEDULE_APPOINTMENT' as AIActionType;
    } else if (lowerInput.match(/\b(cancel)\b/)) {
      intent = 'CANCEL_APPOINTMENT' as AIActionType;
    } else if (lowerInput.match(/\b(hours|location|insurance|cost|price|address)\b/)) {
      intent = 'ANSWER_QUESTION' as AIActionType;
    }

    // Frustration detection
    if (lowerInput.match(/\b(frustrated|annoyed|angry|upset|ridiculous)\b/)) {
      frustration = 0.3;
    }
    if (lowerInput.match(/\b(damn|hell|stupid|idiot)\b/)) {
      frustration = 0.5;
    }
    if (context.retryCount > 2) {
      frustration += 0.2;
    }
    if (context.turnCount > 10) {
      frustration += 0.1;
    }

    return { intent, frustration };
  }

  /**
   * Check if user wants to speak to a human
   */
  private wantsHuman(input: string): boolean {
    const humanPhrases = [
      'speak to someone',
      'talk to a person',
      'real person',
      'human',
      'representative',
      'operator',
      'someone real',
      'actual person',
      'transfer me',
      'connect me',
    ];

    const lowerInput = input.toLowerCase();
    return humanPhrases.some(phrase => lowerInput.includes(phrase));
  }

  /**
   * Check escalation rules
   */
  private checkEscalationRules(
    input: string,
    context: CallContext
  ): { reason: AIEscalationReason; details: string } | null {
    // Clinical keywords trigger escalation
    const clinicalKeywords = ['pain', 'emergency', 'hurt', 'bleeding', 'accident', 'injury'];
    const lowerInput = input.toLowerCase();

    if (clinicalKeywords.some(k => lowerInput.includes(k)) && lowerInput.includes('severe')) {
      return {
        reason: 'CLINICAL_QUESTION' as AIEscalationReason,
        details: 'Clinical/emergency keywords detected',
      };
    }

    // High frustration
    if (context.frustrationLevel >= 0.7) {
      return {
        reason: 'FRUSTRATION_DETECTED' as AIEscalationReason,
        details: `Frustration level: ${context.frustrationLevel}`,
      };
    }

    // Too many retries
    if (context.retryCount >= 3) {
      return {
        reason: 'REPEATED_FAILURE' as AIEscalationReason,
        details: `Failed attempts: ${context.retryCount}`,
      };
    }

    // Billing dispute keywords
    if (lowerInput.match(/\b(dispute|wrong charge|overcharged|billing error|refund)\b/)) {
      return {
        reason: 'BILLING_DISPUTE' as AIEscalationReason,
        details: 'Billing dispute keywords detected',
      };
    }

    return null;
  }

  /**
   * Generate conversation summary
   */
  private generateSummary(callState: CallState): string {
    const context = callState.context;
    const parts: string[] = [];

    if (context.patientIdentified) {
      parts.push(`Patient: ${context.patientName || 'Identified'}`);
    } else {
      parts.push('Patient: Unidentified caller');
    }

    if (context.intents.length > 0) {
      parts.push(`Topics: ${[...new Set(context.intents)].join(', ')}`);
    }

    parts.push(`Turns: ${context.turnCount}`);
    parts.push(`Duration: ${Math.floor((Date.now() - callState.startedAt.getTime()) / 1000)}s`);

    return parts.join(' | ');
  }

  // ==================== OpenAI Realtime Session ====================

  /**
   * Get OpenAI session configuration
   */
  getOpenAISessionConfig(): OpenAISessionConfig {
    const tools = this.getOpenAITools();

    return {
      modalities: ['text', 'audio'],
      voice: this.config.openaiConfig.voice,
      instructions: this.buildSystemInstructions(),
      input_audio_format: this.config.openaiConfig.inputAudioFormat || 'g711_ulaw',
      output_audio_format: this.config.openaiConfig.outputAudioFormat || 'g711_ulaw',
      input_audio_transcription: { model: 'whisper-1' },
      turn_detection: {
        type: 'server_vad',
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500,
      },
      tools,
    };
  }

  /**
   * Build system instructions for OpenAI
   */
  private buildSystemInstructions(): string {
    return `You are a friendly and professional AI receptionist for a chiropractic practice. Your role is to:

1. Help patients schedule, reschedule, or cancel appointments
2. Answer questions about the practice (hours, location, services, insurance)
3. Identify callers and retrieve their information when possible
4. Transfer calls to human staff when necessary

Guidelines:
- Be warm, professional, and concise
- Speak naturally as if on a phone call
- If you don't know something, offer to transfer to staff
- For clinical or emergency questions, always transfer to staff
- Confirm important details before taking action
- Keep responses brief (1-2 sentences when possible)

Current organization: ${this.config.organizationId}
${this.config.businessHours ? `Business hours are configured in the system.` : ''}`;
  }

  /**
   * Get OpenAI function tools
   */
  private getOpenAITools(): OpenAITool[] {
    return [
      {
        type: 'function',
        name: 'schedule_appointment',
        description: 'Schedule a new appointment for the patient',
        parameters: {
          type: 'object',
          properties: {
            appointment_type: { type: 'string', description: 'Type of appointment' },
            preferred_date: { type: 'string', description: 'Preferred date (YYYY-MM-DD)' },
            preferred_time: { type: 'string', description: 'Preferred time (HH:MM)' },
            provider_preference: { type: 'string', description: 'Preferred provider name' },
          },
          required: ['appointment_type'],
        },
      },
      {
        type: 'function',
        name: 'lookup_patient',
        description: 'Look up patient information by phone or name',
        parameters: {
          type: 'object',
          properties: {
            phone_number: { type: 'string', description: 'Patient phone number' },
            first_name: { type: 'string', description: 'Patient first name' },
            last_name: { type: 'string', description: 'Patient last name' },
            date_of_birth: { type: 'string', description: 'Patient DOB (MM/DD/YYYY)' },
          },
        },
      },
      {
        type: 'function',
        name: 'get_office_info',
        description: 'Get information about the practice',
        parameters: {
          type: 'object',
          properties: {
            info_type: {
              type: 'string',
              enum: ['hours', 'location', 'insurance', 'services', 'providers'],
              description: 'Type of information requested',
            },
          },
          required: ['info_type'],
        },
      },
      {
        type: 'function',
        name: 'transfer_to_human',
        description: 'Transfer the call to a human staff member',
        parameters: {
          type: 'object',
          properties: {
            reason: { type: 'string', description: 'Reason for transfer' },
            urgency: { type: 'number', description: 'Urgency level 1-5' },
          },
          required: ['reason'],
        },
      },
    ];
  }

  // ==================== Event System ====================

  /**
   * Register event handler
   */
  on(eventType: string, handler: (event: VoiceEvent) => void): void {
    const handlers = this.eventHandlers.get(eventType) || [];
    handlers.push(handler);
    this.eventHandlers.set(eventType, handlers);
  }

  /**
   * Emit event
   */
  private emitEvent(event: VoiceEvent): void {
    const handlers = this.eventHandlers.get(event.type) || [];
    handlers.forEach(handler => handler(event));
  }

  // ==================== Call State Access ====================

  /**
   * Get current call state
   */
  getCallState(callSid: string): CallState | undefined {
    return activeCalls.get(callSid);
  }

  /**
   * Get all active calls for organization
   */
  getActiveCalls(): CallState[] {
    return Array.from(activeCalls.values())
      .filter(call => call.organizationId === this.config.organizationId);
  }

  /**
   * Get call analytics
   */
  async getCallAnalytics(
    startDate: Date,
    endDate: Date
  ): Promise<CallAnalytics[]> {
    const conversations = await this.prisma.aIReceptionistConversation.findMany({
      where: {
        organizationId: this.config.organizationId,
        startedAt: { gte: startDate, lte: endDate },
      },
      include: {
        actions: true,
        escalation: true,
      },
    });

    return conversations.map(conv => ({
      callSid: conv.externalCallId || conv.id,
      organizationId: conv.organizationId,
      duration: conv.duration || 0,
      status: conv.status,
      channel: conv.channel,
      actionsPerformed: conv.actions.map(a => a.actionType),
      intentsDetected: conv.actions.map(a => a.actionType),
      escalated: !!conv.escalation,
      escalationReason: conv.escalation?.reason,
      patientIdentified: !!conv.patientId,
      appointmentBooked: conv.actions.some(a => a.actionType === 'BOOK_APPOINTMENT' && a.result === 'SUCCESS'),
      questionsAnswered: conv.actions.filter(a => a.actionType === 'ANSWER_QUESTION').length,
      averageConfidence: conv.actions.length > 0
        ? conv.actions.reduce((sum, a) => sum + (a.confidence || 0), 0) / conv.actions.length
        : 0,
      turnCount: (conv.transcript as unknown as TranscriptEntry[])?.length || 0,
      sentiment: 'neutral' as const, // Would need sentiment analysis
      recordingDuration: conv.duration || undefined,
    }));
  }
}

/**
 * Factory function to create voice service
 */
export function createVoiceService(
  prisma: PrismaClient,
  config: VoiceServiceConfig
): VoiceService {
  return new VoiceService(prisma, config);
}

/**
 * Get voice configuration from database
 */
export async function getVoiceConfig(
  prisma: PrismaClient,
  organizationId: string
): Promise<VoiceServiceConfig | null> {
  const voiceConfig = await prisma.aIVoiceConfig.findUnique({
    where: { organizationId },
  });

  if (!voiceConfig) return null;

  const businessHours = voiceConfig.businessHours as BusinessHours | null;
  const escalationRules = voiceConfig.escalationRules as EscalationRule[] | null;

  return {
    twilioConfig: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
      statusCallbackUrl: `${process.env.APP_URL}/api/voice/status`,
      recordingStatusCallbackUrl: `${process.env.APP_URL}/api/voice/recording`,
    },
    openaiConfig: {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: 'gpt-4o-realtime-preview',
      voice: voiceConfig.voiceId as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
    },
    voiceConfig: {
      voiceProvider: voiceConfig.voiceProvider as 'openai' | 'elevenlabs' | 'azure',
      voiceId: voiceConfig.voiceId,
      voiceSpeed: voiceConfig.voiceSpeed,
      voicePitch: voiceConfig.voicePitch,
      primaryLanguage: voiceConfig.primaryLanguage,
      supportedLanguages: voiceConfig.supportedLangs,
    },
    organizationId,
    businessHours: businessHours || undefined,
    escalationRules: escalationRules || undefined,
    escalationPhone: voiceConfig.escalationPhone || undefined,
    recordByDefault: voiceConfig.recordByDefault,
    recordingDisclosure: voiceConfig.recordingDisclosure || undefined,
    greeting: voiceConfig.greeting,
    afterHoursMessage: voiceConfig.afterHoursMsg || undefined,
    holdMessage: voiceConfig.holdMessage || undefined,
    transferMessage: voiceConfig.transferMessage || undefined,
    maxCallDuration: voiceConfig.maxCallDuration,
    silenceTimeout: voiceConfig.silenceTimeout,
  };
}
