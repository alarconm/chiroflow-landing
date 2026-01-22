/**
 * Epic 30: AI Receptionist Agent - Multi-Channel Support
 * US-306: Multi-channel support
 *
 * Handles conversations across phone, chat, SMS, and email channels
 * with unified processing, channel preference learning, and seamless handoffs.
 */

import type { PrismaClient, Prisma } from '@prisma/client';
import type {
  CallState,
  CallContext,
  TranscriptEntry,
} from './types';
import type { ConversationChannel, AIConversationStatus, AIActionType } from '@prisma/client';

// ==================== Types ====================

export interface MultiChannelConfig {
  organizationId: string;
  defaultLanguage?: string;
  supportedLanguages?: string[];
  chatWidgetConfig?: ChatWidgetConfig;
  smsConfig?: SMSConfig;
  emailConfig?: EmailConfig;
}

export interface ChatWidgetConfig {
  enabled: boolean;
  position?: 'bottom-right' | 'bottom-left';
  primaryColor?: string;
  greeting?: string;
  offlineMessage?: string;
  collectEmail?: boolean;
  collectPhone?: boolean;
  showAvatar?: boolean;
  avatarUrl?: string;
  businessHoursOnly?: boolean;
}

export interface SMSConfig {
  enabled: boolean;
  phoneNumber?: string;
  provider?: 'twilio' | 'vonage' | 'messagebird';
  optInRequired?: boolean;
  optInMessage?: string;
  optOutKeyword?: string;
}

export interface EmailConfig {
  enabled: boolean;
  fromAddress?: string;
  replyToAddress?: string;
  autoResponseEnabled?: boolean;
  autoResponseDelay?: number; // minutes
}

export interface ChannelMessage {
  id: string;
  channel: ConversationChannel;
  content: string;
  sender: 'patient' | 'ai' | 'staff';
  timestamp: Date;
  metadata?: Record<string, unknown>;
  attachments?: MessageAttachment[];
  language?: string;
}

export interface MessageAttachment {
  id: string;
  type: 'image' | 'document' | 'audio' | 'video';
  url: string;
  filename: string;
  mimeType: string;
  size?: number;
}

export interface ConversationState {
  conversationId: string;
  channel: ConversationChannel;
  organizationId: string;
  patientId?: string;
  sessionId?: string;
  status: AIConversationStatus;
  startedAt: Date;
  lastActivityAt: Date;
  messages: ChannelMessage[];
  context: ConversationContext;
  metadata?: Record<string, unknown>;
}

export interface ConversationContext {
  patientIdentified: boolean;
  patientName?: string;
  patientEmail?: string;
  patientPhone?: string;
  intent?: AIActionType;
  intents: AIActionType[];
  language: string;
  channelPreference?: ConversationChannel;
  previousChannels?: ConversationChannel[];
  pendingAction?: {
    type: AIActionType;
    parameters: Record<string, unknown>;
    awaitingConfirmation: boolean;
  };
  turnCount: number;
  frustrationLevel: number;
}

export interface ChannelHandoffRequest {
  sourceConversationId: string;
  targetChannel: ConversationChannel;
  reason?: string;
  notifyPatient?: boolean;
  preserveContext?: boolean;
}

export interface ChannelHandoffResult {
  success: boolean;
  newConversationId?: string;
  targetChannel: ConversationChannel;
  message: string;
  handoffSummary?: string;
  error?: string;
}

export interface ChannelPreference {
  patientId: string;
  preferredChannel: ConversationChannel;
  secondaryChannel?: ConversationChannel;
  optOutChannels: ConversationChannel[];
  languagePreference: string;
  timezone?: string;
  bestTimeToContact?: { start: string; end: string };
  lastUpdated: Date;
}

export interface MultiChannelResponse {
  success: boolean;
  message: string;
  responseText?: string;
  suggestedResponses?: string[];
  shouldEscalate: boolean;
  escalationReason?: string;
  actionResult?: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'PENDING';
  detectedLanguage?: string;
  channelSpecificData?: Record<string, unknown>;
}

export interface LanguageDetectionResult {
  detectedLanguage: string;
  confidence: number;
  isSupported: boolean;
  suggestedLanguage?: string;
}

// Supported languages with their codes
export const SUPPORTED_LANGUAGES: Record<string, string> = {
  'en': 'English',
  'es': 'Spanish',
  'zh': 'Chinese (Simplified)',
  'vi': 'Vietnamese',
  'tl': 'Tagalog',
  'ko': 'Korean',
  'ru': 'Russian',
  'ar': 'Arabic',
  'pt': 'Portuguese',
  'fr': 'French',
  'de': 'German',
  'ja': 'Japanese',
  'hi': 'Hindi',
};

// Language detection patterns
const LANGUAGE_PATTERNS: Record<string, RegExp[]> = {
  'es': [
    /\b(hola|gracias|por favor|buenos días|buenas tardes|cita|doctor|enfermo|ayuda|necesito|cuando|donde|como|que|si|no|tengo|quiero|puedo)\b/i,
    /[áéíóúñü]/i,
  ],
  'zh': [
    /[\u4e00-\u9fff]/,
  ],
  'vi': [
    /[àảãáạăằẳẵắặâầẩẫấậèẻẽéẹêềểễếệìỉĩíịòỏõóọôồổỗốộơờởỡớợùủũúụưừửữứựỳỷỹýỵđ]/i,
  ],
  'ko': [
    /[\uAC00-\uD7AF\u1100-\u11FF]/,
  ],
  'ru': [
    /[а-яА-ЯёЁ]/,
  ],
  'ar': [
    /[\u0600-\u06FF]/,
  ],
  'ja': [
    /[\u3040-\u309F\u30A0-\u30FF]/,
  ],
  'pt': [
    /\b(olá|obrigado|por favor|bom dia|boa tarde|consulta|médico|doente|ajuda|preciso|quando|onde|como|que|sim|não|tenho|quero|posso)\b/i,
    /[ãõç]/i,
  ],
  'fr': [
    /\b(bonjour|merci|s'il vous plaît|rendez-vous|médecin|malade|aide|besoin|quand|où|comment|que|oui|non|j'ai|je veux|je peux)\b/i,
    /[àâäéèêëîïôùûüÿç]/i,
  ],
};

// In-memory conversation state (in production, use Redis)
const activeConversations = new Map<string, ConversationState>();

/**
 * Multi-Channel Agent
 * Provides unified conversation handling across all channels
 */
export class MultiChannelAgent {
  private prisma: PrismaClient;
  private config: MultiChannelConfig;

  constructor(prisma: PrismaClient, config: MultiChannelConfig) {
    this.prisma = prisma;
    this.config = {
      defaultLanguage: 'en',
      supportedLanguages: Object.keys(SUPPORTED_LANGUAGES),
      ...config,
    };
  }

  // ==================== Unified Conversation Handling ====================

  /**
   * Start a new conversation on any channel
   */
  async startConversation(
    channel: ConversationChannel,
    initialMessage: string,
    metadata?: {
      patientId?: string;
      sessionId?: string;
      phoneNumber?: string;
      email?: string;
      browserInfo?: Record<string, unknown>;
    }
  ): Promise<{ conversationId: string; response: MultiChannelResponse }> {
    // Detect language from initial message
    const languageResult = this.detectLanguage(initialMessage);

    // Try to identify patient if not provided
    let patientId = metadata?.patientId;
    let patientInfo: { id: string; firstName: string; lastName: string; email?: string } | null = null;

    if (!patientId && metadata?.phoneNumber) {
      patientInfo = await this.lookupPatientByPhone(metadata.phoneNumber);
      patientId = patientInfo?.id;
    } else if (!patientId && metadata?.email) {
      patientInfo = await this.lookupPatientByEmail(metadata.email);
      patientId = patientInfo?.id;
    }

    // Create conversation in database
    const conversation = await this.prisma.aIReceptionistConversation.create({
      data: {
        channel,
        status: 'ACTIVE',
        phoneNumber: metadata?.phoneNumber,
        patientId,
        organizationId: this.config.organizationId,
        metadata: {
          sessionId: metadata?.sessionId,
          browserInfo: metadata?.browserInfo,
          initialLanguage: languageResult.detectedLanguage,
        } as Prisma.InputJsonValue,
        transcript: [] as Prisma.InputJsonValue,
      },
    });

    // Create conversation state
    const state: ConversationState = {
      conversationId: conversation.id,
      channel,
      organizationId: this.config.organizationId,
      patientId,
      sessionId: metadata?.sessionId,
      status: 'ACTIVE',
      startedAt: new Date(),
      lastActivityAt: new Date(),
      messages: [],
      context: {
        patientIdentified: !!patientId,
        patientName: patientInfo ? `${patientInfo.firstName} ${patientInfo.lastName}` : undefined,
        patientEmail: metadata?.email,
        patientPhone: metadata?.phoneNumber,
        intents: [],
        language: languageResult.detectedLanguage,
        turnCount: 0,
        frustrationLevel: 0,
      },
    };

    activeConversations.set(conversation.id, state);

    // Process the initial message
    const response = await this.processMessage(conversation.id, initialMessage, 'patient');

    return { conversationId: conversation.id, response };
  }

  /**
   * Process a message from any channel
   */
  async processMessage(
    conversationId: string,
    content: string,
    sender: 'patient' | 'ai' | 'staff',
    metadata?: Record<string, unknown>
  ): Promise<MultiChannelResponse> {
    // Get conversation state
    let state = activeConversations.get(conversationId);

    if (!state) {
      // Try to load from database
      const dbConversation = await this.prisma.aIReceptionistConversation.findUnique({
        where: { id: conversationId },
        include: { patient: { include: { demographics: true } } },
      });

      if (!dbConversation) {
        return {
          success: false,
          message: 'Conversation not found',
          shouldEscalate: false,
          actionResult: 'FAILED',
        };
      }

      // Rebuild state from database
      state = this.rebuildStateFromDb(dbConversation);
      activeConversations.set(conversationId, state);
    }

    // Detect language of this message
    const languageResult = this.detectLanguage(content);
    if (languageResult.confidence > 0.7) {
      state.context.language = languageResult.detectedLanguage;
    }

    // Add message to state
    const message: ChannelMessage = {
      id: `msg_${Date.now()}`,
      channel: state.channel,
      content,
      sender,
      timestamp: new Date(),
      metadata,
      language: languageResult.detectedLanguage,
    };
    state.messages.push(message);
    state.lastActivityAt = new Date();
    state.context.turnCount++;

    // Generate response based on channel and content
    const response = await this.generateResponse(state, content, languageResult);

    // Add AI response to messages
    if (response.responseText) {
      const aiMessage: ChannelMessage = {
        id: `msg_${Date.now() + 1}`,
        channel: state.channel,
        content: response.responseText,
        sender: 'ai',
        timestamp: new Date(),
        language: state.context.language,
      };
      state.messages.push(aiMessage);
    }

    // Update database
    await this.updateConversationTranscript(conversationId, state.messages);

    // Update channel preference if patient is identified
    if (state.patientId && state.context.turnCount >= 2) {
      await this.updateChannelPreference(state.patientId, state.channel);
    }

    return response;
  }

  /**
   * Generate a response based on the conversation state and input
   */
  private async generateResponse(
    state: ConversationState,
    input: string,
    languageResult: LanguageDetectionResult
  ): Promise<MultiChannelResponse> {
    const lowerInput = input.toLowerCase();

    // Check for language support
    if (!languageResult.isSupported) {
      return {
        success: true,
        message: 'Unsupported language detected',
        responseText: this.getUnsupportedLanguageMessage(languageResult.suggestedLanguage || 'en'),
        shouldEscalate: true,
        escalationReason: 'Unsupported language',
        detectedLanguage: languageResult.detectedLanguage,
      };
    }

    // Detect intent
    const intent = this.detectIntent(lowerInput);
    if (intent && !state.context.intents.includes(intent)) {
      state.context.intents.push(intent);
    }
    state.context.intent = intent || state.context.intent;

    // Generate response based on detected intent
    const responseText = await this.generateIntentResponse(state, intent, input);

    // Check if escalation is needed
    const shouldEscalate = this.checkForEscalation(state, input);

    return {
      success: true,
      message: 'Message processed successfully',
      responseText,
      suggestedResponses: this.getSuggestedResponses(state, intent),
      shouldEscalate,
      escalationReason: shouldEscalate ? this.getEscalationReason(state, input) : undefined,
      actionResult: 'SUCCESS',
      detectedLanguage: languageResult.detectedLanguage,
      channelSpecificData: this.getChannelSpecificData(state),
    };
  }

  /**
   * Generate a response based on detected intent
   */
  private async generateIntentResponse(
    state: ConversationState,
    intent: AIActionType | undefined,
    input: string
  ): Promise<string> {
    const lang = state.context.language;
    const patientName = state.context.patientName;

    // Greeting handling
    if (state.context.turnCount === 1) {
      return this.getGreeting(state, lang);
    }

    switch (intent) {
      case 'BOOK_APPOINTMENT':
        return this.getLocalizedMessage('booking_prompt', lang, { patientName });

      case 'RESCHEDULE_APPOINTMENT':
        return this.getLocalizedMessage('reschedule_prompt', lang, { patientName });

      case 'CANCEL_APPOINTMENT':
        return this.getLocalizedMessage('cancel_prompt', lang, { patientName });

      case 'ANSWER_QUESTION':
        return this.getLocalizedMessage('question_received', lang, {});

      case 'IDENTIFY_PATIENT':
        return this.getLocalizedMessage('identification_prompt', lang, {});

      default:
        return this.getLocalizedMessage('general_help', lang, { patientName });
    }
  }

  // ==================== Channel Handoff ====================

  /**
   * Handoff conversation to a different channel
   */
  async handoffToChannel(request: ChannelHandoffRequest): Promise<ChannelHandoffResult> {
    const { sourceConversationId, targetChannel, reason, notifyPatient, preserveContext } = request;

    // Get source conversation
    const sourceConversation = await this.prisma.aIReceptionistConversation.findUnique({
      where: { id: sourceConversationId },
      include: { patient: true },
    });

    if (!sourceConversation) {
      return {
        success: false,
        targetChannel,
        message: 'Source conversation not found',
        error: 'CONVERSATION_NOT_FOUND',
      };
    }

    // Get source state
    const sourceState = activeConversations.get(sourceConversationId);

    // Create summary of the conversation
    const handoffSummary = this.generateHandoffSummary(sourceState, sourceConversation);

    // Create new conversation on target channel
    const newConversation = await this.prisma.aIReceptionistConversation.create({
      data: {
        channel: targetChannel,
        status: 'ACTIVE',
        phoneNumber: sourceConversation.phoneNumber,
        patientId: sourceConversation.patientId,
        organizationId: sourceConversation.organizationId,
        metadata: {
          handoffFrom: sourceConversationId,
          handoffReason: reason,
          previousChannel: sourceConversation.channel,
          preservedContext: preserveContext ? sourceConversation.context : undefined,
        } as Prisma.InputJsonValue,
        context: preserveContext ? sourceConversation.context as Prisma.InputJsonValue : undefined,
      },
    });

    // Update source conversation status
    await this.prisma.aIReceptionistConversation.update({
      where: { id: sourceConversationId },
      data: {
        status: 'COMPLETED',
        endedAt: new Date(),
        summary: `Handed off to ${targetChannel}. ${reason || ''}`,
        metadata: {
          ...(sourceConversation.metadata as Record<string, unknown> || {}),
          handoffTo: newConversation.id,
          handoffChannel: targetChannel,
        } as Prisma.InputJsonValue,
      },
    });

    // Create new state for target channel
    if (sourceState && preserveContext) {
      const newState: ConversationState = {
        ...sourceState,
        conversationId: newConversation.id,
        channel: targetChannel,
        context: {
          ...sourceState.context,
          previousChannels: [
            ...(sourceState.context.previousChannels || []),
            sourceState.channel,
          ],
        },
      };
      activeConversations.set(newConversation.id, newState);
    }

    // Clean up source state
    activeConversations.delete(sourceConversationId);

    // Notify patient if requested
    if (notifyPatient && sourceConversation.patientId) {
      await this.notifyPatientOfHandoff(
        sourceConversation.patientId,
        sourceConversation.channel,
        targetChannel
      );
    }

    return {
      success: true,
      newConversationId: newConversation.id,
      targetChannel,
      message: `Conversation handed off to ${targetChannel} successfully`,
      handoffSummary,
    };
  }

  /**
   * Generate a summary for handoff
   */
  private generateHandoffSummary(
    state: ConversationState | undefined,
    conversation: { transcript: Prisma.JsonValue; context: Prisma.JsonValue }
  ): string {
    const summary: string[] = [];

    if (state) {
      summary.push(`Channel: ${state.channel}`);
      summary.push(`Messages: ${state.messages.length}`);
      summary.push(`Language: ${state.context.language}`);

      if (state.context.patientIdentified) {
        summary.push(`Patient: ${state.context.patientName || 'Identified'}`);
      }

      if (state.context.intents.length > 0) {
        summary.push(`Intents: ${state.context.intents.join(', ')}`);
      }

      // Last few messages
      const lastMessages = state.messages.slice(-3);
      if (lastMessages.length > 0) {
        summary.push('\nRecent messages:');
        lastMessages.forEach(m => {
          summary.push(`  ${m.sender}: ${m.content.slice(0, 100)}${m.content.length > 100 ? '...' : ''}`);
        });
      }
    }

    return summary.join('\n');
  }

  // ==================== Channel Preference Learning ====================

  /**
   * Get patient's channel preferences
   */
  async getChannelPreference(patientId: string): Promise<ChannelPreference | null> {
    // Get patient's conversation history
    const conversations = await this.prisma.aIReceptionistConversation.findMany({
      where: {
        patientId,
        organizationId: this.config.organizationId,
        status: 'COMPLETED',
      },
      orderBy: { startedAt: 'desc' },
      take: 20,
      select: {
        channel: true,
        startedAt: true,
        metadata: true,
      },
    });

    if (conversations.length === 0) {
      return null;
    }

    // Count channel usage
    const channelCounts = new Map<ConversationChannel, number>();
    conversations.forEach(c => {
      channelCounts.set(c.channel, (channelCounts.get(c.channel) || 0) + 1);
    });

    // Find most used channel
    let preferredChannel: ConversationChannel = 'PHONE';
    let maxCount = 0;
    channelCounts.forEach((count, channel) => {
      if (count > maxCount) {
        maxCount = count;
        preferredChannel = channel;
      }
    });

    // Find second most used
    let secondaryChannel: ConversationChannel | undefined;
    let secondMaxCount = 0;
    channelCounts.forEach((count, channel) => {
      if (count > secondMaxCount && channel !== preferredChannel) {
        secondMaxCount = count;
        secondaryChannel = channel;
      }
    });

    // Detect language preference from metadata
    const languages = conversations
      .map(c => (c.metadata as Record<string, unknown>)?.initialLanguage as string)
      .filter(Boolean);
    const languagePreference = languages[0] || this.config.defaultLanguage || 'en';

    return {
      patientId,
      preferredChannel,
      secondaryChannel,
      optOutChannels: [],
      languagePreference,
      lastUpdated: new Date(),
    };
  }

  /**
   * Update patient's channel preference based on usage
   */
  async updateChannelPreference(
    patientId: string,
    usedChannel: ConversationChannel
  ): Promise<void> {
    // This could be stored in a dedicated table, but for now we track via conversation metadata
    // In a production system, you'd want a PatientChannelPreference table

    // Update the patient's most recent preference
    const recentConversation = await this.prisma.aIReceptionistConversation.findFirst({
      where: {
        patientId,
        organizationId: this.config.organizationId,
      },
      orderBy: { startedAt: 'desc' },
    });

    if (recentConversation) {
      await this.prisma.aIReceptionistConversation.update({
        where: { id: recentConversation.id },
        data: {
          metadata: {
            ...(recentConversation.metadata as Record<string, unknown> || {}),
            lastUsedChannel: usedChannel,
            channelPreferenceUpdated: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
    }
  }

  // ==================== Multi-Language Support ====================

  /**
   * Detect language from text
   */
  detectLanguage(text: string): LanguageDetectionResult {
    const supportedLanguages = this.config.supportedLanguages || Object.keys(SUPPORTED_LANGUAGES);

    // Check each language pattern
    for (const [lang, patterns] of Object.entries(LANGUAGE_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          return {
            detectedLanguage: lang,
            confidence: 0.85,
            isSupported: supportedLanguages.includes(lang),
            suggestedLanguage: supportedLanguages.includes(lang) ? lang : 'en',
          };
        }
      }
    }

    // Default to English
    return {
      detectedLanguage: 'en',
      confidence: 0.5,
      isSupported: true,
    };
  }

  /**
   * Get localized message
   */
  private getLocalizedMessage(
    key: string,
    language: string,
    params: Record<string, string | undefined>
  ): string {
    const messages: Record<string, Record<string, string>> = {
      en: {
        greeting: `Hello${params.patientName ? `, ${params.patientName}` : ''}! How can I help you today?`,
        greeting_new: 'Hello! Welcome to our practice. How can I assist you today?',
        booking_prompt: `I'd be happy to help you book an appointment${params.patientName ? `, ${params.patientName}` : ''}. What type of appointment do you need?`,
        reschedule_prompt: 'I can help you reschedule. Can you tell me which appointment you need to change?',
        cancel_prompt: 'I can help with that. Which appointment would you like to cancel?',
        question_received: "I'll do my best to answer your question. What would you like to know?",
        identification_prompt: 'For security, could you please verify your name and date of birth?',
        general_help: 'I can help you with scheduling appointments, answering questions, or updating your information. What would you like to do?',
        unsupported_language: 'I apologize, but I can only assist in English at this time. Would you like to continue in English, or would you prefer to speak with a staff member?',
      },
      es: {
        greeting: `¡Hola${params.patientName ? `, ${params.patientName}` : ''}! ¿Cómo puedo ayudarle hoy?`,
        greeting_new: '¡Hola! Bienvenido a nuestra práctica. ¿Cómo puedo ayudarle hoy?',
        booking_prompt: `Con mucho gusto le ayudo a programar una cita${params.patientName ? `, ${params.patientName}` : ''}. ¿Qué tipo de cita necesita?`,
        reschedule_prompt: 'Puedo ayudarle a reprogramar. ¿Cuál cita necesita cambiar?',
        cancel_prompt: 'Puedo ayudarle con eso. ¿Cuál cita desea cancelar?',
        question_received: 'Haré lo mejor para responder su pregunta. ¿Qué le gustaría saber?',
        identification_prompt: 'Por seguridad, ¿podría verificar su nombre y fecha de nacimiento?',
        general_help: 'Puedo ayudarle con programar citas, responder preguntas, o actualizar su información. ¿Qué le gustaría hacer?',
        unsupported_language: 'Lo siento, pero solo puedo ayudar en español o inglés en este momento.',
      },
    };

    const langMessages = messages[language] || messages['en'];
    return langMessages[key] || messages['en'][key] || '';
  }

  /**
   * Get greeting based on state
   */
  private getGreeting(state: ConversationState, language: string): string {
    if (state.context.patientIdentified) {
      return this.getLocalizedMessage('greeting', language, {
        patientName: state.context.patientName,
      });
    }
    return this.getLocalizedMessage('greeting_new', language, {});
  }

  /**
   * Get unsupported language message
   */
  private getUnsupportedLanguageMessage(suggestedLanguage: string): string {
    return this.getLocalizedMessage('unsupported_language', suggestedLanguage, {});
  }

  // ==================== Chat Widget Integration ====================

  /**
   * Initialize chat widget session
   */
  async initializeChatWidget(
    sessionId: string,
    metadata?: {
      pageUrl?: string;
      referrer?: string;
      browserInfo?: Record<string, unknown>;
    }
  ): Promise<{
    sessionId: string;
    config: ChatWidgetConfig;
    greeting: string;
    suggestedQuestions: string[];
  }> {
    const widgetConfig = this.config.chatWidgetConfig || {
      enabled: true,
      position: 'bottom-right',
      greeting: 'Hi there! How can I help you today?',
      collectEmail: true,
      collectPhone: false,
      showAvatar: true,
    };

    return {
      sessionId,
      config: widgetConfig,
      greeting: widgetConfig.greeting || 'Hi there! How can I help you today?',
      suggestedQuestions: [
        'I need to book an appointment',
        'What are your hours?',
        'Do you accept my insurance?',
        'I need to reschedule my appointment',
      ],
    };
  }

  /**
   * Handle chat widget message
   */
  async handleChatMessage(
    sessionId: string,
    message: string,
    conversationId?: string,
    metadata?: {
      patientEmail?: string;
      patientPhone?: string;
    }
  ): Promise<{
    conversationId: string;
    response: MultiChannelResponse;
    typing?: boolean;
  }> {
    if (conversationId) {
      // Continue existing conversation
      const response = await this.processMessage(conversationId, message, 'patient', metadata);
      return { conversationId, response };
    }

    // Start new conversation
    const result = await this.startConversation('CHAT', message, {
      sessionId,
      email: metadata?.patientEmail,
      phoneNumber: metadata?.patientPhone,
    });

    return {
      conversationId: result.conversationId,
      response: result.response,
    };
  }

  // ==================== SMS Support ====================

  /**
   * Handle incoming SMS message
   */
  async handleSMSMessage(
    phoneNumber: string,
    message: string,
    externalId?: string
  ): Promise<{ conversationId: string; response: MultiChannelResponse }> {
    // Look for existing active SMS conversation with this number
    const existingConversation = await this.prisma.aIReceptionistConversation.findFirst({
      where: {
        phoneNumber,
        channel: 'SMS',
        status: 'ACTIVE',
        organizationId: this.config.organizationId,
      },
      orderBy: { startedAt: 'desc' },
    });

    if (existingConversation) {
      const response = await this.processMessage(existingConversation.id, message, 'patient');
      return { conversationId: existingConversation.id, response };
    }

    // Start new SMS conversation
    const result = await this.startConversation('SMS', message, {
      phoneNumber,
    });

    // Update external ID if provided
    if (externalId) {
      await this.prisma.aIReceptionistConversation.update({
        where: { id: result.conversationId },
        data: { externalCallId: externalId },
      });
    }

    return result;
  }

  /**
   * Send SMS response
   */
  async sendSMSResponse(
    phoneNumber: string,
    message: string,
    conversationId: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    // This would integrate with Twilio or another SMS provider
    // For now, we just record it

    const smsMessage: ChannelMessage = {
      id: `sms_${Date.now()}`,
      channel: 'SMS',
      content: message,
      sender: 'ai',
      timestamp: new Date(),
    };

    const state = activeConversations.get(conversationId);
    if (state) {
      state.messages.push(smsMessage);
      await this.updateConversationTranscript(conversationId, state.messages);
    }

    return { success: true, messageId: smsMessage.id };
  }

  // ==================== Helper Methods ====================

  /**
   * Detect intent from message
   */
  private detectIntent(input: string): AIActionType | undefined {
    const lowerInput = input.toLowerCase();

    // Booking intent
    if (
      /\b(book|schedule|make|set up|need)\s+(an?\s+)?appointment/i.test(lowerInput) ||
      /\b(want|like|need)\s+to\s+(see|visit)/i.test(lowerInput) ||
      /\bcita\b/i.test(lowerInput) // Spanish
    ) {
      return 'BOOK_APPOINTMENT';
    }

    // Reschedule intent
    if (
      /\b(reschedule|change|move|postpone)\s+(my\s+)?appointment/i.test(lowerInput) ||
      /\b(different|new)\s+(time|date)/i.test(lowerInput)
    ) {
      return 'RESCHEDULE_APPOINTMENT';
    }

    // Cancel intent
    if (
      /\b(cancel|delete|remove)\s+(my\s+)?appointment/i.test(lowerInput) ||
      /\bcan't\s+(make|come)/i.test(lowerInput)
    ) {
      return 'CANCEL_APPOINTMENT';
    }

    // Question intent
    if (
      /\?$/.test(input) ||
      /\b(what|when|where|how|who|why|do you|can you|is there|are there)\b/i.test(lowerInput) ||
      /\b(hours|location|insurance|cost|price)/i.test(lowerInput)
    ) {
      return 'ANSWER_QUESTION';
    }

    return undefined;
  }

  /**
   * Check if escalation is needed
   */
  private checkForEscalation(state: ConversationState, input: string): boolean {
    const lowerInput = input.toLowerCase();

    // Human request
    if (/\b(speak|talk|transfer)\s+(to|with)\s+(a\s+)?(human|person|staff|someone|representative)/i.test(lowerInput)) {
      return true;
    }

    // High frustration
    if (state.context.frustrationLevel > 0.7) {
      return true;
    }

    // Too many turns without resolution
    if (state.context.turnCount > 10 && state.context.intents.length === 0) {
      return true;
    }

    return false;
  }

  /**
   * Get escalation reason
   */
  private getEscalationReason(state: ConversationState, input: string): string {
    const lowerInput = input.toLowerCase();

    if (/\b(speak|talk|transfer)\s+(to|with)\s+(a\s+)?(human|person|staff)/i.test(lowerInput)) {
      return 'Patient requested human assistance';
    }

    if (state.context.frustrationLevel > 0.7) {
      return 'Frustration detected';
    }

    if (state.context.turnCount > 10) {
      return 'Extended conversation without resolution';
    }

    return 'Escalation required';
  }

  /**
   * Get suggested responses based on state
   */
  private getSuggestedResponses(
    state: ConversationState,
    intent: AIActionType | undefined
  ): string[] {
    switch (intent) {
      case 'BOOK_APPOINTMENT':
        return [
          'Initial consultation',
          'Follow-up visit',
          'Adjustment',
          'Something else',
        ];
      case 'ANSWER_QUESTION':
        return [
          'Tell me about your hours',
          'What insurance do you accept?',
          'Where are you located?',
          'Something else',
        ];
      default:
        return [
          'Book an appointment',
          'Ask a question',
          'Speak to someone',
        ];
    }
  }

  /**
   * Get channel-specific data
   */
  private getChannelSpecificData(state: ConversationState): Record<string, unknown> {
    switch (state.channel) {
      case 'CHAT':
        return {
          showTypingIndicator: true,
          canAttachFiles: true,
        };
      case 'SMS':
        return {
          maxLength: 160,
          splitLongMessages: true,
        };
      case 'EMAIL':
        return {
          supportsHtml: true,
          includeSignature: true,
        };
      default:
        return {};
    }
  }

  /**
   * Lookup patient by phone number
   */
  private async lookupPatientByPhone(
    phone: string
  ): Promise<{ id: string; firstName: string; lastName: string; email?: string } | null> {
    const normalizedPhone = phone.replace(/\D/g, '');

    // Search via PatientContact table
    const patientContact = await this.prisma.patientContact.findFirst({
      where: {
        patient: {
          organizationId: this.config.organizationId,
          status: 'ACTIVE',
        },
        OR: [
          { homePhone: { contains: normalizedPhone } },
          { mobilePhone: { contains: normalizedPhone } },
          { workPhone: { contains: normalizedPhone } },
        ],
      },
      include: {
        patient: {
          include: {
            demographics: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!patientContact || !patientContact.patient.demographics) return null;

    return {
      id: patientContact.patient.id,
      firstName: patientContact.patient.demographics.firstName,
      lastName: patientContact.patient.demographics.lastName,
      email: patientContact.email || undefined,
    };
  }

  /**
   * Lookup patient by email
   */
  private async lookupPatientByEmail(
    email: string
  ): Promise<{ id: string; firstName: string; lastName: string; email?: string } | null> {
    // Search via PatientContact table
    const patientContact = await this.prisma.patientContact.findFirst({
      where: {
        patient: {
          organizationId: this.config.organizationId,
          status: 'ACTIVE',
        },
        email: { equals: email, mode: 'insensitive' },
      },
      include: {
        patient: {
          include: {
            demographics: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!patientContact || !patientContact.patient.demographics) return null;

    return {
      id: patientContact.patient.id,
      firstName: patientContact.patient.demographics.firstName,
      lastName: patientContact.patient.demographics.lastName,
      email: patientContact.email || undefined,
    };
  }

  /**
   * Update conversation transcript in database
   */
  private async updateConversationTranscript(
    conversationId: string,
    messages: ChannelMessage[]
  ): Promise<void> {
    await this.prisma.aIReceptionistConversation.update({
      where: { id: conversationId },
      data: {
        transcript: messages.map(m => ({
          id: m.id,
          role: m.sender,
          content: m.content,
          timestamp: m.timestamp.toISOString(),
          language: m.language,
        })) as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Rebuild state from database record
   */
  private rebuildStateFromDb(dbConversation: {
    id: string;
    channel: ConversationChannel;
    organizationId: string;
    patientId: string | null;
    status: AIConversationStatus;
    startedAt: Date;
    transcript: Prisma.JsonValue;
    context: Prisma.JsonValue;
    metadata: Prisma.JsonValue;
    patient: { demographics: { firstName: string; lastName: string } | null } | null;
  }): ConversationState {
    const transcript = (dbConversation.transcript as Array<{
      id: string;
      role: string;
      content: string;
      timestamp: string;
      language?: string;
    }>) || [];

    const contextData = (dbConversation.context as Record<string, unknown>) || {};

    return {
      conversationId: dbConversation.id,
      channel: dbConversation.channel,
      organizationId: dbConversation.organizationId,
      patientId: dbConversation.patientId || undefined,
      status: dbConversation.status,
      startedAt: dbConversation.startedAt,
      lastActivityAt: new Date(),
      messages: transcript.map(t => ({
        id: t.id,
        channel: dbConversation.channel,
        content: t.content,
        sender: t.role as 'patient' | 'ai' | 'staff',
        timestamp: new Date(t.timestamp),
        language: t.language,
      })),
      context: {
        patientIdentified: !!dbConversation.patientId,
        patientName: dbConversation.patient?.demographics
          ? `${dbConversation.patient.demographics.firstName} ${dbConversation.patient.demographics.lastName}`
          : undefined,
        intents: (contextData.intents as AIActionType[]) || [],
        language: (contextData.language as string) || 'en',
        turnCount: transcript.filter(t => t.role === 'patient').length,
        frustrationLevel: (contextData.frustrationLevel as number) || 0,
      },
      metadata: dbConversation.metadata as Record<string, unknown>,
    };
  }

  /**
   * Notify patient of channel handoff
   */
  private async notifyPatientOfHandoff(
    patientId: string,
    fromChannel: ConversationChannel,
    toChannel: ConversationChannel
  ): Promise<void> {
    // This would send a notification via the target channel
    // For now, we just log it
    console.log(`Patient ${patientId} notified of handoff from ${fromChannel} to ${toChannel}`);
  }

  // ==================== Conversation Management ====================

  /**
   * End a conversation
   */
  async endConversation(
    conversationId: string,
    status: AIConversationStatus = 'COMPLETED',
    summary?: string
  ): Promise<void> {
    const state = activeConversations.get(conversationId);

    // Generate summary if not provided
    const finalSummary = summary || (state ? this.generateConversationSummary(state) : undefined);

    await this.prisma.aIReceptionistConversation.update({
      where: { id: conversationId },
      data: {
        status,
        endedAt: new Date(),
        summary: finalSummary,
        duration: state
          ? Math.floor((Date.now() - state.startedAt.getTime()) / 1000)
          : undefined,
        resolvedTopics: state?.context.intents || [],
      },
    });

    activeConversations.delete(conversationId);
  }

  /**
   * Generate conversation summary
   */
  private generateConversationSummary(state: ConversationState): string {
    const parts: string[] = [];

    parts.push(`Channel: ${state.channel}`);
    parts.push(`Duration: ${Math.floor((Date.now() - state.startedAt.getTime()) / 1000)}s`);
    parts.push(`Messages: ${state.messages.length}`);

    if (state.context.patientIdentified) {
      parts.push(`Patient: ${state.context.patientName || 'Identified'}`);
    }

    if (state.context.intents.length > 0) {
      parts.push(`Topics: ${state.context.intents.join(', ')}`);
    }

    return parts.join(' | ');
  }

  /**
   * Get active conversations
   */
  getActiveConversations(): ConversationState[] {
    return Array.from(activeConversations.values()).filter(
      c => c.organizationId === this.config.organizationId
    );
  }

  /**
   * Get conversation state
   */
  getConversationState(conversationId: string): ConversationState | undefined {
    return activeConversations.get(conversationId);
  }
}

// ==================== Factory Functions ====================

/**
 * Create a new MultiChannelAgent instance
 */
export function createMultiChannelAgent(
  prisma: PrismaClient,
  config: MultiChannelConfig
): MultiChannelAgent {
  return new MultiChannelAgent(prisma, config);
}
