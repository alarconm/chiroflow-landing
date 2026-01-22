/**
 * Epic 12: AI Communication Agent - Mock LLM Service
 *
 * Provides simulated AI responses for development and testing.
 * In production, this would be replaced with actual LLM API calls.
 */

import type { AIIntent } from '@prisma/client';
import type {
  IntentDetectionResult,
  ExtractedEntities,
  ChatContext,
  SentimentAnalysisResult,
  FeedbackSentiment,
} from './types';

// Intent detection patterns
const INTENT_PATTERNS: { intent: AIIntent; patterns: RegExp[]; keywords: string[] }[] = [
  {
    intent: 'BOOKING',
    patterns: [
      /book|schedule|appointment|make an appointment|see the doctor|need to come in/i,
      /can i (come|visit|see|schedule)/i,
      /i('d| would) like (to|an) (book|schedule|appointment)/i,
    ],
    keywords: ['book', 'schedule', 'appointment', 'visit', 'see doctor', 'come in'],
  },
  {
    intent: 'RESCHEDULE',
    patterns: [
      /reschedule|change|move|different (time|date|day)/i,
      /can('t| not) make (it|my appointment)/i,
      /need to (reschedule|change|move)/i,
    ],
    keywords: ['reschedule', 'change appointment', 'move', 'different time'],
  },
  {
    intent: 'CANCEL',
    patterns: [
      /cancel|cancellation/i,
      /don't want|won't be able/i,
    ],
    keywords: ['cancel', 'cancellation'],
  },
  {
    intent: 'FAQ_INSURANCE',
    patterns: [
      /insurance|coverage|covered|pay|copay|deductible/i,
      /accept|take|do you (accept|take)/i,
      /billing|cost|price|how much/i,
    ],
    keywords: ['insurance', 'coverage', 'copay', 'deductible', 'accept', 'billing', 'cost'],
  },
  {
    intent: 'FAQ_HOURS',
    patterns: [
      /hours|open|close|when are you/i,
      /what time|available/i,
    ],
    keywords: ['hours', 'open', 'close', 'available', 'time'],
  },
  {
    intent: 'FAQ_LOCATION',
    patterns: [
      /location|address|where|directions|parking/i,
      /how (do i|to) (get|find)/i,
    ],
    keywords: ['location', 'address', 'where', 'directions', 'parking'],
  },
  {
    intent: 'FAQ_SERVICES',
    patterns: [
      /services|treatments|offer|do you (do|treat|offer)/i,
      /chiropractic|adjustment|massage|therapy/i,
    ],
    keywords: ['services', 'treatments', 'offer', 'adjustment', 'therapy'],
  },
  {
    intent: 'COMPLAINT',
    patterns: [
      /complaint|unhappy|dissatisfied|problem|issue|terrible|awful/i,
      /not happy|frustrated|angry|upset/i,
    ],
    keywords: ['complaint', 'unhappy', 'problem', 'issue', 'frustrated'],
  },
  {
    intent: 'COMPLIMENT',
    patterns: [
      /thank|great|excellent|wonderful|amazing|love|appreciate/i,
      /best|fantastic|helpful|kind/i,
    ],
    keywords: ['thank', 'great', 'excellent', 'wonderful', 'appreciate'],
  },
];

// Entity extraction patterns
const ENTITY_PATTERNS = {
  date: /(?:on\s+)?(?:(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:today|tomorrow|this week|next week)|(?:\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?))/i,
  time: /(?:at\s+)?(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?|morning|afternoon|evening)/i,
  provider: /(?:dr\.?\s+|doctor\s+)?([a-z]+(?:\s+[a-z]+)?)/i,
};

/**
 * Mock LLM service for AI communication
 */
export const mockLLM = {
  /**
   * Detect user intent from message
   */
  detectIntent(message: string): IntentDetectionResult {
    const normalizedMessage = message.toLowerCase().trim();

    // Check each intent pattern
    for (const { intent, patterns, keywords } of INTENT_PATTERNS) {
      // Check regex patterns
      for (const pattern of patterns) {
        if (pattern.test(normalizedMessage)) {
          return {
            intent,
            confidence: 0.85 + Math.random() * 0.1,
            entities: this.extractEntities(message),
          };
        }
      }

      // Check keywords
      for (const keyword of keywords) {
        if (normalizedMessage.includes(keyword)) {
          return {
            intent,
            confidence: 0.7 + Math.random() * 0.15,
            entities: this.extractEntities(message),
          };
        }
      }
    }

    // Default to general inquiry
    return {
      intent: 'GENERAL_INQUIRY',
      confidence: 0.5,
      entities: this.extractEntities(message),
    };
  },

  /**
   * Extract entities from message
   */
  extractEntities(message: string): ExtractedEntities {
    const entities: ExtractedEntities = {};

    const dateMatch = message.match(ENTITY_PATTERNS.date);
    if (dateMatch) {
      entities.date = dateMatch[0];
    }

    const timeMatch = message.match(ENTITY_PATTERNS.time);
    if (timeMatch) {
      entities.time = timeMatch[0];
    }

    return entities;
  },

  /**
   * Generate chatbot response based on intent and context
   */
  generateResponse(
    intent: AIIntent,
    message: string,
    context: ChatContext
  ): { message: string; suggestedActions?: { type: 'button' | 'quickReply'; label: string; value: string }[] } {
    const patientName = context.patientName || 'there';
    const orgSettings = context.organizationSettings;

    switch (intent) {
      case 'BOOKING':
        if (context.pendingBooking?.step === 'confirm') {
          return {
            message: `Great! I'll confirm your appointment for ${context.pendingBooking.appointmentTypeName} with ${context.pendingBooking.providerName}. Please click "Confirm" to finalize your booking.`,
            suggestedActions: [
              { type: 'button', label: 'Confirm Booking', value: 'confirm_booking' },
              { type: 'button', label: 'Change Time', value: 'change_time' },
            ],
          };
        }
        return {
          message: `Hi ${patientName}! I'd be happy to help you schedule an appointment. What type of visit do you need?`,
          suggestedActions: [
            { type: 'quickReply', label: 'New Patient Exam', value: 'type_new_patient' },
            { type: 'quickReply', label: 'Follow-up Visit', value: 'type_followup' },
            { type: 'quickReply', label: 'Adjustment Only', value: 'type_adjustment' },
          ],
        };

      case 'RESCHEDULE':
        if (context.recentAppointments?.length) {
          const upcoming = context.recentAppointments.find(a => new Date(a.date) > new Date());
          if (upcoming) {
            return {
              message: `I can help you reschedule your ${upcoming.type} appointment on ${new Date(upcoming.date).toLocaleDateString()}. When would you prefer?`,
              suggestedActions: [
                { type: 'quickReply', label: 'Tomorrow', value: 'reschedule_tomorrow' },
                { type: 'quickReply', label: 'Next Week', value: 'reschedule_next_week' },
                { type: 'quickReply', label: 'Pick a Date', value: 'reschedule_pick_date' },
              ],
            };
          }
        }
        return {
          message: `I'd be happy to help you reschedule. Can you tell me which appointment you'd like to change, or would you like me to look up your upcoming appointments?`,
        };

      case 'CANCEL':
        return {
          message: `I can help you cancel your appointment. Please note that we request at least 24 hours notice for cancellations. Which appointment would you like to cancel?`,
          suggestedActions: [
            { type: 'button', label: 'View My Appointments', value: 'view_appointments' },
          ],
        };

      case 'FAQ_INSURANCE':
        const insuranceList = orgSettings?.acceptedInsurances?.slice(0, 5).join(', ') ||
          'most major insurance plans including Blue Cross, Aetna, United Healthcare, and Cigna';
        return {
          message: `Great question! We accept ${insuranceList}. We also offer a self-pay discount for patients without insurance. Would you like me to verify your specific coverage?`,
          suggestedActions: [
            { type: 'quickReply', label: 'Check My Coverage', value: 'check_coverage' },
            { type: 'quickReply', label: 'Self-Pay Rates', value: 'self_pay_rates' },
          ],
        };

      case 'FAQ_HOURS':
        const hours = orgSettings?.hours;
        if (hours) {
          const today = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()];
          const todayHours = hours[today as keyof typeof hours];
          const hoursStr = todayHours ? `${todayHours.open} - ${todayHours.close}` : 'closed';
          return {
            message: `We're open today from ${hoursStr}. Our regular hours are Monday-Friday 8am-6pm and Saturday 9am-1pm. Would you like to schedule an appointment?`,
          };
        }
        return {
          message: `Our office is typically open Monday through Friday from 8am to 6pm, and Saturday from 9am to 1pm. Would you like to schedule an appointment?`,
        };

      case 'FAQ_LOCATION':
        const address = orgSettings?.address || '123 Main Street, Suite 100';
        return {
          message: `We're located at ${address}. We have free parking available in the lot behind the building. Would you like directions or to schedule a visit?`,
          suggestedActions: [
            { type: 'quickReply', label: 'Get Directions', value: 'get_directions' },
            { type: 'quickReply', label: 'Schedule Visit', value: 'schedule_visit' },
          ],
        };

      case 'FAQ_SERVICES':
        const services = orgSettings?.services || [
          'Chiropractic adjustments',
          'Spinal decompression',
          'Massage therapy',
          'Physical rehabilitation',
        ];
        return {
          message: `We offer a range of services including ${services.slice(0, 4).join(', ')}, and more. What specific treatment are you interested in?`,
        };

      case 'COMPLAINT':
        return {
          message: `I'm sorry to hear you've had a concern. Your feedback is important to us, and we want to make this right. Would you like me to connect you with our patient care coordinator, or would you prefer to share the details here?`,
          suggestedActions: [
            { type: 'button', label: 'Speak to Coordinator', value: 'transfer_coordinator' },
            { type: 'quickReply', label: 'Share Here', value: 'share_complaint' },
          ],
        };

      case 'COMPLIMENT':
        return {
          message: `Thank you so much for your kind words! We really appreciate you taking the time to share that with us. Is there anything else I can help you with today?`,
        };

      case 'GENERAL_INQUIRY':
      default:
        return {
          message: `Hi ${patientName}! I'm your virtual assistant. I can help you with scheduling appointments, answering questions about our services, insurance, or hours. What can I help you with today?`,
          suggestedActions: [
            { type: 'quickReply', label: 'Book Appointment', value: 'book_appointment' },
            { type: 'quickReply', label: 'Insurance Questions', value: 'insurance_questions' },
            { type: 'quickReply', label: 'Office Hours', value: 'office_hours' },
            { type: 'quickReply', label: 'Services Offered', value: 'services_offered' },
          ],
        };
    }
  },

  /**
   * Analyze sentiment of text
   */
  analyzeSentiment(text: string): SentimentAnalysisResult {
    const normalizedText = text.toLowerCase();

    // Positive indicators
    const positiveWords = [
      'thank', 'thanks', 'great', 'excellent', 'wonderful', 'amazing',
      'love', 'appreciate', 'helpful', 'kind', 'friendly', 'professional',
      'best', 'fantastic', 'happy', 'pleased', 'satisfied', 'recommend',
    ];

    // Negative indicators
    const negativeWords = [
      'terrible', 'awful', 'horrible', 'worst', 'hate', 'unhappy',
      'disappointed', 'frustrated', 'angry', 'upset', 'rude', 'unprofessional',
      'problem', 'issue', 'complaint', 'bad', 'poor', 'never again',
    ];

    let score = 0;
    const keyPhrases: string[] = [];

    // Count positive words
    for (const word of positiveWords) {
      if (normalizedText.includes(word)) {
        score += 0.15;
        keyPhrases.push(word);
      }
    }

    // Count negative words
    for (const word of negativeWords) {
      if (normalizedText.includes(word)) {
        score -= 0.2;
        keyPhrases.push(word);
      }
    }

    // Clamp score between -1 and 1
    score = Math.max(-1, Math.min(1, score));

    // Determine sentiment category
    let sentiment: FeedbackSentiment;
    if (score > 0.2) {
      sentiment = 'POSITIVE';
    } else if (score < -0.2) {
      sentiment = 'NEGATIVE';
    } else {
      sentiment = 'NEUTRAL';
    }

    // Calculate confidence based on how many indicators were found
    const confidence = Math.min(0.95, 0.5 + (keyPhrases.length * 0.1));

    // Extract topics
    const topicPatterns = [
      { pattern: /wait|waiting|time|long/i, topic: 'wait times' },
      { pattern: /staff|receptionist|front desk/i, topic: 'staff' },
      { pattern: /doctor|dr\.|provider|chiropractor/i, topic: 'provider' },
      { pattern: /treatment|care|adjustment/i, topic: 'treatment' },
      { pattern: /billing|insurance|payment|cost|price/i, topic: 'billing' },
      { pattern: /clean|facility|office|room/i, topic: 'facility' },
      { pattern: /appointment|scheduling|book/i, topic: 'scheduling' },
    ];

    const topics = topicPatterns
      .filter(({ pattern }) => pattern.test(text))
      .map(({ topic }) => topic);

    // Generate suggested actions for negative feedback
    const suggestedActions: string[] = [];
    if (sentiment === 'NEGATIVE') {
      suggestedActions.push('Follow up with patient within 24 hours');
      if (topics.includes('staff') || topics.includes('provider')) {
        suggestedActions.push('Review with mentioned staff member');
      }
      if (topics.includes('billing')) {
        suggestedActions.push('Escalate to billing department');
      }
    }

    return {
      sentiment,
      score,
      confidence,
      keyPhrases: keyPhrases.slice(0, 5),
      topics,
      suggestedActions,
    };
  },

  /**
   * Generate FAQ answer
   */
  generateFAQAnswer(
    question: string,
    category: string,
    context: ChatContext
  ): { answer: string; confidence: number; relatedQuestions: string[] } {
    const normalizedQuestion = question.toLowerCase();
    const orgSettings = context.organizationSettings;

    // Insurance FAQ
    if (category === 'insurance' || normalizedQuestion.includes('insurance')) {
      if (normalizedQuestion.includes('accept') || normalizedQuestion.includes('take')) {
        return {
          answer: `We accept most major insurance plans including Blue Cross Blue Shield, Aetna, United Healthcare, Cigna, Medicare, and many others. We recommend calling our office with your insurance information so we can verify your specific coverage and benefits.`,
          confidence: 0.9,
          relatedQuestions: [
            'What if my insurance is not listed?',
            'Do you offer self-pay options?',
            'How do I verify my coverage?',
          ],
        };
      }
      if (normalizedQuestion.includes('copay') || normalizedQuestion.includes('cost')) {
        return {
          answer: `Copays and costs vary depending on your specific insurance plan and benefits. Most chiropractic plans have a copay ranging from $20-$50 per visit. We can verify your exact benefits when you provide your insurance information.`,
          confidence: 0.85,
          relatedQuestions: [
            'Do you offer payment plans?',
            'What is the self-pay rate?',
            'Is a referral required?',
          ],
        };
      }
    }

    // Services FAQ
    if (category === 'services' || normalizedQuestion.includes('service') || normalizedQuestion.includes('treatment')) {
      return {
        answer: `We offer comprehensive chiropractic care including spinal adjustments, therapeutic exercises, massage therapy, spinal decompression, and rehabilitation services. Our doctors create personalized treatment plans based on your specific needs and goals.`,
        confidence: 0.88,
        relatedQuestions: [
          'Do you treat back pain?',
          'What should I expect on my first visit?',
          'How many visits will I need?',
        ],
      };
    }

    // Hours FAQ
    if (category === 'hours' || normalizedQuestion.includes('hour') || normalizedQuestion.includes('open')) {
      return {
        answer: `Our office hours are Monday through Friday from 8:00 AM to 6:00 PM, and Saturday from 9:00 AM to 1:00 PM. We are closed on Sundays. We recommend scheduling your appointment in advance, but we do accept walk-ins when available.`,
        confidence: 0.95,
        relatedQuestions: [
          'Can I schedule same-day appointments?',
          'Do you offer early morning appointments?',
          'What holidays are you closed?',
        ],
      };
    }

    // Location FAQ
    if (category === 'location' || normalizedQuestion.includes('where') || normalizedQuestion.includes('address')) {
      const address = orgSettings?.address || '123 Main Street, Suite 100, Anytown, ST 12345';
      return {
        answer: `We are located at ${address}. We have free parking available in the lot directly behind our building. The entrance is wheelchair accessible.`,
        confidence: 0.95,
        relatedQuestions: [
          'Is there wheelchair access?',
          'What are the parking options?',
          'Are you near public transit?',
        ],
      };
    }

    // Default general answer
    return {
      answer: `Thank you for your question. For the most accurate information, I recommend contacting our office directly or scheduling a consultation where we can address your specific needs. Is there something else I can help you with?`,
      confidence: 0.5,
      relatedQuestions: [
        'How do I contact the office?',
        'Can I schedule an appointment?',
        'What services do you offer?',
      ],
    };
  },
};

export default mockLLM;
