/**
 * Epic 30: AI Receptionist Agent - FAQ Agent
 * US-303: FAQ and information agent
 *
 * AI agent that answers common patient questions using the knowledge base.
 * Handles practice information, insurance questions, service inquiries,
 * and appointment preparation guidance.
 */

import type { PrismaClient, KnowledgeBaseCategory, AIActionResult } from '@prisma/client';
import type { CallState, CallContext } from './types';

// ==================== Types ====================

export interface FAQRequest {
  question: string;
  category?: KnowledgeBaseCategory;
  patientId?: string;
  context?: QuestionContext;
}

export interface FAQResponse {
  success: boolean;
  answer: string;
  confidence: number;
  source?: {
    entryId: string;
    category: KnowledgeBaseCategory;
    question: string;
  };
  suggestedFollowUps?: string[];
  shouldEscalate: boolean;
  escalationReason?: string;
  actionResult: AIActionResult;
}

export interface QuestionContext {
  previousQuestions?: string[];
  patientIsNew?: boolean;
  appointmentDate?: Date;
  appointmentType?: string;
  providerName?: string;
}

export interface FAQAgentConfig {
  organizationId: string;
  confidenceThreshold?: number;
  maxSuggestions?: number;
  enableSemanticSearch?: boolean;
  escalationCategories?: KnowledgeBaseCategory[];
}

export interface KnowledgeEntry {
  id: string;
  category: KnowledgeBaseCategory;
  question: string;
  answer: string;
  keywords: string[];
  variations: string[];
  priority: number;
  isActive: boolean;
  timesUsed: number;
  helpfulCount: number;
  unhelpfulCount: number;
}

// Question classification patterns
interface QuestionPattern {
  category: KnowledgeBaseCategory;
  patterns: RegExp[];
  keywords: string[];
}

// ==================== FAQ Agent ====================

export class FAQAgent {
  private prisma: PrismaClient;
  private config: FAQAgentConfig;

  // Pre-defined question patterns for classification
  private questionPatterns: QuestionPattern[] = [
    {
      category: 'PRACTICE_INFO',
      patterns: [
        /\b(hours?|open|close|location|address|parking|directions?|where|when)\b/i,
        /\b(phone|call|contact|email)\b/i,
      ],
      keywords: ['hours', 'open', 'close', 'location', 'address', 'parking', 'directions', 'phone', 'contact', 'email'],
    },
    {
      category: 'INSURANCE',
      patterns: [
        /\b(insurance|coverage|accept|pay|cost|price|fee|bill|copay|deductible|out.of.pocket)\b/i,
        /\b(medicare|medicaid|blue.?cross|aetna|cigna|united)\b/i,
      ],
      keywords: ['insurance', 'coverage', 'accept', 'pay', 'cost', 'price', 'copay', 'deductible', 'medicare'],
    },
    {
      category: 'SERVICES',
      patterns: [
        /\b(treat|service|offer|do you|can you|help with|condition|pain|injury)\b/i,
        /\b(adjustment|therapy|massage|x.?ray|exam|technique)\b/i,
      ],
      keywords: ['treat', 'service', 'adjustment', 'therapy', 'massage', 'x-ray', 'technique', 'condition'],
    },
    {
      category: 'PROVIDERS',
      patterns: [
        /\b(doctor|dr\.?|provider|chiropractor|who|specialist|experience|background|trained)\b/i,
      ],
      keywords: ['doctor', 'provider', 'chiropractor', 'specialist', 'experience', 'trained', 'background'],
    },
    {
      category: 'APPOINTMENT_PREP',
      patterns: [
        /\b(prepare|bring|wear|expect|first|before|paperwork|forms?|what.+happen)\b/i,
        /\b(how.long|duration|time|early|arrive)\b/i,
      ],
      keywords: ['prepare', 'bring', 'wear', 'expect', 'first', 'paperwork', 'forms', 'how long', 'arrive early'],
    },
    {
      category: 'NEW_PATIENT',
      patterns: [
        /\b(new.patient|first.time|never.been|initial|sign.?up|register|start)\b/i,
      ],
      keywords: ['new patient', 'first time', 'initial', 'sign up', 'register'],
    },
    {
      category: 'POLICIES',
      patterns: [
        /\b(cancel|reschedule|policy|policies|late|miss|no.?show)\b/i,
        /\b(refund|guarantee|privacy|hipaa)\b/i,
      ],
      keywords: ['cancel', 'reschedule', 'policy', 'late', 'miss', 'no show', 'refund', 'privacy'],
    },
    {
      category: 'EMERGENCY',
      patterns: [
        /\b(emergency|urgent|severe|accident|can't.move|extreme|worst|unbearable)\b/i,
        /\b(hospital|er|ambulance|911)\b/i,
      ],
      keywords: ['emergency', 'urgent', 'severe', 'accident', 'extreme', 'hospital'],
    },
  ];

  constructor(prisma: PrismaClient, config: FAQAgentConfig) {
    this.prisma = prisma;
    this.config = {
      confidenceThreshold: config.confidenceThreshold ?? 0.6,
      maxSuggestions: config.maxSuggestions ?? 3,
      enableSemanticSearch: config.enableSemanticSearch ?? false,
      escalationCategories: config.escalationCategories ?? ['EMERGENCY'],
      ...config,
    };
  }

  // ==================== Main Question Answering ====================

  /**
   * Answer a patient question using the knowledge base
   */
  async answerQuestion(
    request: FAQRequest,
    callState?: CallState
  ): Promise<FAQResponse> {
    const { question, category: requestedCategory, patientId, context } = request;

    // Check for emergency/urgent situations first
    if (this.detectEmergency(question)) {
      return this.handleEmergency(question);
    }

    // Classify the question to determine category
    const detectedCategory = requestedCategory || this.classifyQuestion(question);

    // Search the knowledge base for matching entries
    const matches = await this.searchKnowledgeBase(question, detectedCategory);

    if (matches.length === 0) {
      // No direct match found - try broader search
      const broadMatches = await this.searchKnowledgeBase(question, undefined);

      if (broadMatches.length === 0) {
        // No matches at all - escalate to staff
        return {
          success: false,
          answer: "I don't have specific information about that question. Let me connect you with one of our team members who can help you better.",
          confidence: 0,
          shouldEscalate: true,
          escalationReason: 'Question not found in knowledge base',
          actionResult: 'PARTIAL',
        };
      }

      matches.push(...broadMatches);
    }

    // Get the best match
    const bestMatch = matches[0];

    // Check if confidence is too low
    if (bestMatch.score < this.config.confidenceThreshold!) {
      return {
        success: true,
        answer: this.formatAnswer(bestMatch.entry.answer, context),
        confidence: bestMatch.score,
        source: {
          entryId: bestMatch.entry.id,
          category: bestMatch.entry.category,
          question: bestMatch.entry.question,
        },
        suggestedFollowUps: this.generateFollowUpSuggestions(bestMatch.entry.category, context),
        shouldEscalate: false,
        actionResult: 'PARTIAL', // Low confidence
      };
    }

    // Record usage
    await this.recordUsage(bestMatch.entry.id);

    // Format the answer with any context-specific customizations
    const formattedAnswer = this.formatAnswer(bestMatch.entry.answer, context);

    // Generate follow-up suggestions
    const followUps = this.generateFollowUpSuggestions(bestMatch.entry.category, context);

    return {
      success: true,
      answer: formattedAnswer,
      confidence: bestMatch.score,
      source: {
        entryId: bestMatch.entry.id,
        category: bestMatch.entry.category,
        question: bestMatch.entry.question,
      },
      suggestedFollowUps: followUps,
      shouldEscalate: false,
      actionResult: 'SUCCESS',
    };
  }

  /**
   * Get practice information (hours, location, parking, etc.)
   */
  async getPracticeInfo(
    infoType: 'hours' | 'location' | 'parking' | 'contact' | 'general'
  ): Promise<FAQResponse> {
    const question = {
      hours: "What are your hours?",
      location: "Where are you located?",
      parking: "Where do I park?",
      contact: "How do I contact you?",
      general: "Tell me about your practice",
    }[infoType];

    return this.answerQuestion({
      question,
      category: 'PRACTICE_INFO',
    });
  }

  /**
   * Get insurance information
   */
  async getInsuranceInfo(
    insuranceProvider?: string
  ): Promise<FAQResponse> {
    const question = insuranceProvider
      ? `Do you accept ${insuranceProvider} insurance?`
      : "What insurance do you accept?";

    return this.answerQuestion({
      question,
      category: 'INSURANCE',
    });
  }

  /**
   * Get service/treatment information
   */
  async getServiceInfo(
    serviceName?: string,
    condition?: string
  ): Promise<FAQResponse> {
    let question: string;

    if (condition) {
      question = `Can you help with ${condition}?`;
    } else if (serviceName) {
      question = `Tell me about ${serviceName}`;
    } else {
      question = "What services do you offer?";
    }

    return this.answerQuestion({
      question,
      category: 'SERVICES',
    });
  }

  /**
   * Get provider information
   */
  async getProviderInfo(
    providerName?: string
  ): Promise<FAQResponse> {
    const question = providerName
      ? `Tell me about Dr. ${providerName}`
      : "Tell me about your doctors";

    return this.answerQuestion({
      question,
      category: 'PROVIDERS',
    });
  }

  /**
   * Get appointment preparation instructions
   */
  async getAppointmentPrep(
    appointmentType?: string,
    isNewPatient?: boolean
  ): Promise<FAQResponse> {
    let question: string;

    if (isNewPatient) {
      question = "What should I bring to my first appointment?";
    } else if (appointmentType) {
      question = `How should I prepare for my ${appointmentType} appointment?`;
    } else {
      question = "What should I expect at my appointment?";
    }

    const context: QuestionContext = {
      patientIsNew: isNewPatient,
      appointmentType,
    };

    return this.answerQuestion({
      question,
      category: isNewPatient ? 'NEW_PATIENT' : 'APPOINTMENT_PREP',
      context,
    });
  }

  /**
   * Get new patient process information
   */
  async getNewPatientInfo(): Promise<FAQResponse> {
    return this.answerQuestion({
      question: "How does the new patient process work?",
      category: 'NEW_PATIENT',
      context: { patientIsNew: true },
    });
  }

  // ==================== Question Classification ====================

  /**
   * Classify a question into a knowledge base category
   */
  classifyQuestion(question: string): KnowledgeBaseCategory {
    const lowerQuestion = question.toLowerCase();
    let bestMatch: { category: KnowledgeBaseCategory; score: number } | null = null;

    for (const pattern of this.questionPatterns) {
      let score = 0;

      // Check regex patterns
      for (const regex of pattern.patterns) {
        if (regex.test(lowerQuestion)) {
          score += 2;
        }
      }

      // Check keywords
      for (const keyword of pattern.keywords) {
        if (lowerQuestion.includes(keyword.toLowerCase())) {
          score += 1;
        }
      }

      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { category: pattern.category, score };
      }
    }

    // Default to CUSTOM if no match
    return bestMatch?.category || 'CUSTOM';
  }

  /**
   * Detect if the question is an emergency
   */
  private detectEmergency(question: string): boolean {
    const emergencyPatterns = [
      /\b(can't\s+move|paralyz|numb|tingling|weakness)\b/i,
      /\b(severe|extreme|worst|unbearable)\s+(pain|headache)\b/i,
      /\b(accident|injury|fell|hurt)\s+(today|just|recently)\b/i,
      /\b(chest\s+pain|difficulty\s+breathing|loss\s+of\s+consciousness)\b/i,
      /\b(emergency|urgent|911|hospital)\b/i,
    ];

    return emergencyPatterns.some(pattern => pattern.test(question));
  }

  /**
   * Handle emergency situations
   */
  private handleEmergency(question: string): FAQResponse {
    const isLifeThreatening = /\b(chest|breathing|consciousness|paralyz)\b/i.test(question);

    if (isLifeThreatening) {
      return {
        success: true,
        answer: "If you're experiencing a medical emergency such as chest pain, difficulty breathing, or loss of consciousness, please call 911 immediately. These symptoms require emergency medical care. If you'd like to speak with our office about a non-emergency concern, I can connect you with our staff.",
        confidence: 1,
        shouldEscalate: true,
        escalationReason: 'Potential life-threatening emergency',
        actionResult: 'SUCCESS',
      };
    }

    return {
      success: true,
      answer: "I understand you may be in pain or have an urgent concern. For severe injuries or emergencies, please call 911 or go to your nearest emergency room. For urgent but non-emergency concerns, let me connect you with our staff right away so they can help you.",
      confidence: 1,
      shouldEscalate: true,
      escalationReason: 'Urgent medical concern',
      actionResult: 'SUCCESS',
    };
  }

  // ==================== Knowledge Base Search ====================

  /**
   * Search the knowledge base for matching entries
   */
  private async searchKnowledgeBase(
    question: string,
    category?: KnowledgeBaseCategory
  ): Promise<{ entry: KnowledgeEntry; score: number }[]> {
    // Get all active entries (filtered by category if provided)
    const where: { organizationId: string; isActive: boolean; category?: KnowledgeBaseCategory } = {
      organizationId: this.config.organizationId,
      isActive: true,
    };

    if (category) {
      where.category = category;
    }

    const entries = await this.prisma.aIKnowledgeBase.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { timesUsed: 'desc' }],
    });

    // Score each entry
    const scoredEntries = entries.map(entry => ({
      entry: entry as KnowledgeEntry,
      score: this.calculateMatchScore(question, entry as KnowledgeEntry),
    }));

    // Filter and sort by score
    return scoredEntries
      .filter(e => e.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate match score between question and knowledge entry
   */
  private calculateMatchScore(question: string, entry: KnowledgeEntry): number {
    const lowerQuestion = question.toLowerCase();
    const words = lowerQuestion.split(/\s+/).filter(w => w.length > 2);
    let score = 0;

    // Check question match
    const entryQuestion = entry.question.toLowerCase();
    if (entryQuestion === lowerQuestion) {
      score += 10; // Exact match
    } else if (entryQuestion.includes(lowerQuestion) || lowerQuestion.includes(entryQuestion)) {
      score += 5; // Partial match
    }

    // Check keyword matches
    for (const keyword of entry.keywords) {
      if (lowerQuestion.includes(keyword.toLowerCase())) {
        score += 2;
      }
    }

    // Check variation matches
    for (const variation of entry.variations) {
      const lowerVariation = variation.toLowerCase();
      if (lowerVariation === lowerQuestion) {
        score += 8;
      } else if (lowerVariation.includes(lowerQuestion) || lowerQuestion.includes(lowerVariation)) {
        score += 4;
      }
    }

    // Check word overlap
    for (const word of words) {
      if (entryQuestion.includes(word)) {
        score += 0.5;
      }
      if (entry.keywords.some(k => k.toLowerCase().includes(word))) {
        score += 0.5;
      }
    }

    // Apply priority bonus
    score += entry.priority * 0.1;

    // Normalize score to 0-1 range (rough approximation)
    return Math.min(score / 10, 1);
  }

  // ==================== Answer Formatting ====================

  /**
   * Format answer with context-specific customizations
   */
  private formatAnswer(answer: string, context?: QuestionContext): string {
    let formatted = answer;

    // Replace placeholders if we have context
    if (context) {
      if (context.appointmentDate) {
        const dateStr = context.appointmentDate.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        });
        formatted = formatted.replace(/{appointmentDate}/g, dateStr);
      }

      if (context.appointmentType) {
        formatted = formatted.replace(/{appointmentType}/g, context.appointmentType);
      }

      if (context.providerName) {
        formatted = formatted.replace(/{providerName}/g, context.providerName);
      }
    }

    // Clean up any unreplaced placeholders
    formatted = formatted.replace(/{[^}]+}/g, '');

    return formatted;
  }

  /**
   * Generate follow-up question suggestions
   */
  private generateFollowUpSuggestions(
    category: KnowledgeBaseCategory,
    context?: QuestionContext
  ): string[] {
    const suggestions: string[] = [];

    switch (category) {
      case 'PRACTICE_INFO':
        suggestions.push(
          "Would you like to schedule an appointment?",
          "Do you have any questions about our services?"
        );
        break;

      case 'INSURANCE':
        suggestions.push(
          "Would you like to verify your specific coverage?",
          "Do you have questions about payment options?"
        );
        break;

      case 'SERVICES':
        suggestions.push(
          "Would you like more information about this treatment?",
          "Are you interested in scheduling a consultation?"
        );
        break;

      case 'PROVIDERS':
        suggestions.push(
          "Would you like to schedule an appointment with this provider?",
          "Do you have any other questions about our team?"
        );
        break;

      case 'APPOINTMENT_PREP':
        suggestions.push(
          "Do you have any other questions about your upcoming visit?",
          "Would you like to confirm your appointment details?"
        );
        break;

      case 'NEW_PATIENT':
        suggestions.push(
          "Would you like to schedule your first appointment?",
          "Do you have questions about what to bring?"
        );
        if (!context?.patientIsNew) {
          suggestions.push("Would you like information about our new patient forms?");
        }
        break;

      case 'POLICIES':
        suggestions.push(
          "Do you need help rescheduling an appointment?",
          "Is there anything else about our policies I can clarify?"
        );
        break;

      default:
        suggestions.push(
          "Is there anything else I can help you with?",
          "Would you like to speak with one of our staff members?"
        );
    }

    return suggestions.slice(0, this.config.maxSuggestions!);
  }

  // ==================== Usage Tracking ====================

  /**
   * Record that a knowledge entry was used
   */
  private async recordUsage(entryId: string): Promise<void> {
    try {
      await this.prisma.aIKnowledgeBase.update({
        where: { id: entryId },
        data: {
          timesUsed: { increment: 1 },
        },
      });
    } catch (error) {
      // Non-critical error, just log it
      console.error('Failed to record knowledge entry usage:', error);
    }
  }

  /**
   * Record feedback on an answer
   */
  async recordFeedback(
    entryId: string,
    helpful: boolean
  ): Promise<void> {
    const data = helpful
      ? { helpfulCount: { increment: 1 } }
      : { unhelpfulCount: { increment: 1 } };

    await this.prisma.aIKnowledgeBase.update({
      where: { id: entryId },
      data,
    });
  }

  // ==================== Bulk Operations ====================

  /**
   * Get all FAQ entries by category
   */
  async getFAQsByCategory(category: KnowledgeBaseCategory): Promise<KnowledgeEntry[]> {
    const entries = await this.prisma.aIKnowledgeBase.findMany({
      where: {
        organizationId: this.config.organizationId,
        category,
        isActive: true,
      },
      orderBy: [{ priority: 'desc' }, { question: 'asc' }],
    });

    return entries as KnowledgeEntry[];
  }

  /**
   * Get popular/frequently asked questions
   */
  async getPopularQuestions(limit: number = 10): Promise<KnowledgeEntry[]> {
    const entries = await this.prisma.aIKnowledgeBase.findMany({
      where: {
        organizationId: this.config.organizationId,
        isActive: true,
      },
      orderBy: { timesUsed: 'desc' },
      take: limit,
    });

    return entries as KnowledgeEntry[];
  }

  /**
   * Search FAQs for chat/widget display
   */
  async searchFAQs(searchTerm: string): Promise<{ entry: KnowledgeEntry; score: number }[]> {
    const results = await this.searchKnowledgeBase(searchTerm, undefined);
    return results.slice(0, this.config.maxSuggestions! * 2);
  }
}

// ==================== Factory ====================

export function createFAQAgent(
  prisma: PrismaClient,
  config: FAQAgentConfig
): FAQAgent {
  return new FAQAgent(prisma, config);
}
