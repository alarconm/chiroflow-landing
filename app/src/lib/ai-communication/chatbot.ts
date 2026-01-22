/**
 * Epic 12: AI Communication Agent - Chatbot Service
 *
 * Provides 24/7 AI chatbot functionality for patient inquiries.
 */

import type { AIIntent } from '@prisma/client';
import type {
  ChatContext,
  ChatbotResponse,
  ConversationTurn,
  OrganizationSettings,
  ExtractedEntities,
} from './types';
import { mockLLM } from './mock-llm';

/**
 * AI Chatbot Service
 */
export class ChatbotService {
  private context: ChatContext;
  private conversationHistory: ConversationTurn[] = [];

  constructor(initialContext: Partial<ChatContext> = {}) {
    this.context = {
      conversationHistory: [],
      detectedIntents: [],
      ...initialContext,
    };
  }

  /**
   * Process a user message and generate a response
   */
  async processMessage(userMessage: string): Promise<ChatbotResponse> {
    const startTime = Date.now();

    // Add user message to history
    this.addToHistory('user', userMessage);

    // Detect intent
    const intentResult = mockLLM.detectIntent(userMessage);

    // Track detected intents
    if (!this.context.detectedIntents) {
      this.context.detectedIntents = [];
    }
    this.context.detectedIntents.push(intentResult.intent);

    // Generate response based on intent
    const response = mockLLM.generateResponse(
      intentResult.intent,
      userMessage,
      this.context
    );

    // Add assistant response to history
    this.addToHistory('assistant', response.message, intentResult.intent);

    // Update context based on intent
    this.updateContextForIntent(intentResult.intent, intentResult.entities);

    const latencyMs = Date.now() - startTime;

    return {
      message: response.message,
      intent: intentResult.intent,
      confidence: intentResult.confidence,
      suggestedActions: response.suggestedActions,
      context: this.getPublicContext(),
      metadata: {
        model: 'mock-llm-v1',
        latencyMs,
        fallback: false,
      },
    };
  }

  /**
   * Process a quick reply or button action
   */
  async processAction(actionValue: string): Promise<ChatbotResponse> {
    // Map action values to messages
    const actionMessages: Record<string, string> = {
      'type_new_patient': 'I need a new patient exam',
      'type_followup': 'I need a follow-up visit',
      'type_adjustment': 'I just need an adjustment',
      'reschedule_tomorrow': 'I want to reschedule to tomorrow',
      'reschedule_next_week': 'I want to reschedule to next week',
      'view_appointments': 'Show me my appointments',
      'check_coverage': 'Please check my insurance coverage',
      'self_pay_rates': 'What are your self-pay rates?',
      'get_directions': 'Give me directions to your office',
      'schedule_visit': 'I want to schedule a visit',
      'book_appointment': 'I want to book an appointment',
      'insurance_questions': 'I have questions about insurance',
      'office_hours': 'What are your office hours?',
      'services_offered': 'What services do you offer?',
      'confirm_booking': 'Confirm my booking',
      'change_time': 'I want to change the time',
      'transfer_coordinator': 'Connect me to a coordinator',
      'share_complaint': 'I want to share my concern here',
    };

    const message = actionMessages[actionValue] || actionValue;
    return this.processMessage(message);
  }

  /**
   * Add a message to conversation history
   */
  private addToHistory(role: 'user' | 'assistant' | 'system', content: string, intent?: AIIntent): void {
    const turn: ConversationTurn = {
      role,
      content,
      timestamp: new Date(),
      intent,
    };

    this.conversationHistory.push(turn);

    // Keep only last 20 turns
    if (this.conversationHistory.length > 20) {
      this.conversationHistory = this.conversationHistory.slice(-20);
    }

    // Update context
    this.context.conversationHistory = this.conversationHistory;
  }

  /**
   * Update context based on detected intent
   */
  private updateContextForIntent(intent: AIIntent, entities?: ExtractedEntities): void {
    switch (intent) {
      case 'BOOKING':
        if (!this.context.pendingBooking) {
          this.context.pendingBooking = {
            step: 'type',
          };
        }
        // Update booking state based on entities
        if (entities?.date) {
          this.context.pendingBooking.preferredDate = this.parseDate(entities.date);
          if (this.context.pendingBooking.step === 'type' || this.context.pendingBooking.step === 'provider') {
            this.context.pendingBooking.step = 'date';
          }
        }
        break;

      case 'CANCEL':
      case 'RESCHEDULE':
        // Clear any pending booking
        this.context.pendingBooking = null;
        break;

      default:
        // No context update needed
        break;
    }
  }

  /**
   * Parse date string to Date object
   */
  private parseDate(dateStr: string): Date {
    const lower = dateStr.toLowerCase();
    const today = new Date();

    if (lower === 'today') {
      return today;
    }
    if (lower === 'tomorrow') {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }
    if (lower.includes('next week')) {
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);
      return nextWeek;
    }

    // Try to parse as a date
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }

    // Default to next available weekday
    const nextWeekday = new Date(today);
    nextWeekday.setDate(nextWeekday.getDate() + 1);
    while (nextWeekday.getDay() === 0 || nextWeekday.getDay() === 6) {
      nextWeekday.setDate(nextWeekday.getDate() + 1);
    }
    return nextWeekday;
  }

  /**
   * Get public context (safe to send to client)
   */
  private getPublicContext(): Partial<ChatContext> {
    return {
      pendingBooking: this.context.pendingBooking,
      detectedIntents: this.context.detectedIntents?.slice(-5),
    };
  }

  /**
   * Set patient context
   */
  setPatientContext(patientId: string, patientName: string): void {
    this.context.patientId = patientId;
    this.context.patientName = patientName;
  }

  /**
   * Set organization settings
   */
  setOrganizationSettings(settings: OrganizationSettings): void {
    this.context.organizationSettings = settings;
  }

  /**
   * Set recent appointments
   */
  setRecentAppointments(appointments: ChatContext['recentAppointments']): void {
    this.context.recentAppointments = appointments;
  }

  /**
   * Set insurance information
   */
  setInsuranceInfo(info: ChatContext['insuranceInfo']): void {
    this.context.insuranceInfo = info;
  }

  /**
   * Get conversation summary
   */
  getSummary(): string {
    if (this.conversationHistory.length === 0) {
      return 'No conversation yet.';
    }

    const intents = this.context.detectedIntents || [];
    const uniqueIntents = [...new Set(intents)];
    const turns = this.conversationHistory.length;

    let summary = `Conversation with ${turns} exchanges. `;
    summary += `Topics discussed: ${uniqueIntents.join(', ') || 'general inquiry'}. `;

    // Check if any action was taken
    if (this.context.pendingBooking?.appointmentTypeName) {
      summary += `Patient started booking process for ${this.context.pendingBooking.appointmentTypeName}. `;
    }

    return summary;
  }

  /**
   * Get full context (for persistence)
   */
  getFullContext(): ChatContext {
    return { ...this.context };
  }

  /**
   * Restore context from saved state
   */
  restoreContext(savedContext: ChatContext): void {
    this.context = { ...savedContext };
    this.conversationHistory = savedContext.conversationHistory || [];
  }

  /**
   * Clear conversation and start fresh
   */
  reset(): void {
    this.conversationHistory = [];
    this.context = {
      patientId: this.context.patientId,
      patientName: this.context.patientName,
      organizationSettings: this.context.organizationSettings,
      conversationHistory: [],
      detectedIntents: [],
    };
  }
}

/**
 * Create a new chatbot instance
 */
export function createChatbot(initialContext?: Partial<ChatContext>): ChatbotService {
  return new ChatbotService(initialContext);
}

export default ChatbotService;
