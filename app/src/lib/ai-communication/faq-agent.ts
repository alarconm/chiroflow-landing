/**
 * Epic 12: AI Communication Agent - FAQ Agent
 *
 * Handles insurance and practice FAQ answering.
 */

import type { PrismaClient } from '@prisma/client';
import type { FAQRequest, FAQResponse, FAQEntry, ChatContext } from './types';
import { mockLLM } from './mock-llm';

// Default FAQ database
const DEFAULT_FAQS: FAQEntry[] = [
  // Insurance FAQs
  {
    question: 'What insurance do you accept?',
    answer: 'We accept most major insurance plans including Blue Cross Blue Shield, Aetna, United Healthcare, Cigna, Humana, Medicare, and many others. We recommend calling our office with your specific insurance information so we can verify your coverage and benefits before your visit.',
    keywords: ['insurance', 'accept', 'take', 'plans', 'coverage'],
    category: 'insurance',
  },
  {
    question: 'How do I verify my insurance coverage?',
    answer: 'You can verify your insurance coverage by calling our office with your insurance card information. Our billing team will contact your insurance provider to confirm your benefits, including any copays, deductibles, and the number of covered visits. We typically verify benefits within 24-48 hours.',
    keywords: ['verify', 'coverage', 'benefits', 'check'],
    category: 'insurance',
  },
  {
    question: 'What if my insurance is not accepted?',
    answer: 'If we do not accept your insurance, we offer competitive self-pay rates. We also accept HSA/FSA cards and offer payment plans for patients who need financial flexibility. Many patients choose our cash-pay option for its simplicity and value.',
    keywords: ['not accepted', 'self-pay', 'cash', 'payment'],
    category: 'insurance',
  },
  {
    question: 'Do I need a referral for chiropractic care?',
    answer: 'Most insurance plans do not require a referral for chiropractic care, as chiropractors are typically considered primary care providers. However, some HMO plans may require a referral. We recommend checking with your insurance provider or our office to confirm your specific plan requirements.',
    keywords: ['referral', 'authorization', 'primary care'],
    category: 'insurance',
  },
  {
    question: 'What is my copay for a chiropractic visit?',
    answer: 'Copays vary depending on your specific insurance plan. Common chiropractic copays range from $20 to $50 per visit. Your exact copay will be determined when we verify your benefits. We collect copays at the time of service.',
    keywords: ['copay', 'cost', 'pay', 'visit cost'],
    category: 'insurance',
  },
  // Services FAQs
  {
    question: 'What services do you offer?',
    answer: 'We offer comprehensive chiropractic care including: spinal adjustments (manual and instrument-assisted), therapeutic exercises and stretches, massage therapy, spinal decompression therapy, electrical muscle stimulation, ultrasound therapy, and custom orthotics. Our doctors will recommend the best treatment plan based on your specific needs.',
    keywords: ['services', 'offer', 'treatments', 'provide'],
    category: 'services',
  },
  {
    question: 'What conditions do you treat?',
    answer: 'We treat a wide range of musculoskeletal conditions including back pain, neck pain, headaches, sciatica, shoulder pain, hip pain, sports injuries, auto accident injuries, work injuries, and general joint pain. We also provide wellness care to maintain spinal health and prevent future problems.',
    keywords: ['conditions', 'treat', 'pain', 'injuries'],
    category: 'services',
  },
  {
    question: 'What should I expect on my first visit?',
    answer: 'Your first visit typically lasts 45-60 minutes. You will complete intake paperwork, have a consultation with the doctor about your health history and concerns, receive a thorough examination including orthopedic and neurological tests, and may have X-rays if needed. The doctor will then discuss findings and recommend a treatment plan.',
    keywords: ['first visit', 'expect', 'initial', 'new patient'],
    category: 'services',
  },
  {
    question: 'How long is a typical appointment?',
    answer: 'A typical follow-up chiropractic appointment is 15-30 minutes. New patient visits and re-evaluations are longer, typically 45-60 minutes. The length depends on the treatments needed during your visit.',
    keywords: ['long', 'duration', 'time', 'minutes'],
    category: 'services',
  },
  // Hours FAQs
  {
    question: 'What are your office hours?',
    answer: 'Our office is open Monday through Friday from 8:00 AM to 6:00 PM, and Saturday from 9:00 AM to 1:00 PM. We are closed on Sundays and major holidays. We recommend scheduling your appointment in advance, but we do accept walk-ins based on availability.',
    keywords: ['hours', 'open', 'schedule', 'when'],
    category: 'hours',
  },
  {
    question: 'Do you offer early morning or evening appointments?',
    answer: 'Yes! We offer early morning appointments starting at 7:00 AM on Tuesdays and Thursdays, and late evening appointments until 7:00 PM on Mondays and Wednesdays to accommodate busy schedules. Please call our office to schedule these special appointment times.',
    keywords: ['early', 'evening', 'late', 'morning', 'after work'],
    category: 'hours',
  },
  {
    question: 'Can I get a same-day appointment?',
    answer: 'We do our best to accommodate same-day appointments, especially for acute injuries or urgent needs. Call our office as early as possible, and we will work to fit you into the schedule. Walk-ins are also welcome based on availability.',
    keywords: ['same day', 'today', 'urgent', 'walk-in'],
    category: 'hours',
  },
  // Location FAQs
  {
    question: 'Where are you located?',
    answer: 'We are conveniently located at 123 Main Street, Suite 100, in downtown. We are near the intersection of Main Street and First Avenue, next to the City Bank building. Our entrance is on the ground floor with wheelchair accessibility.',
    keywords: ['location', 'address', 'where', 'located'],
    category: 'location',
  },
  {
    question: 'Is there parking available?',
    answer: 'Yes, we have free parking available in the lot directly behind our building. Additional street parking is available on Main Street and First Avenue with 2-hour limits. We also have two handicapped-accessible parking spaces near the building entrance.',
    keywords: ['parking', 'park', 'lot', 'street parking'],
    category: 'location',
  },
  {
    question: 'Are you accessible by public transit?',
    answer: 'Yes! We are located two blocks from the Main Street Metro station and several bus routes stop nearby. The building is fully ADA accessible with elevator access to all floors.',
    keywords: ['transit', 'bus', 'metro', 'train', 'public transportation'],
    category: 'location',
  },
  // General FAQs
  {
    question: 'How do I cancel or reschedule my appointment?',
    answer: 'You can cancel or reschedule your appointment by calling our office, using the patient portal, or replying to your appointment reminder message. We request at least 24 hours notice for cancellations to avoid a cancellation fee. Same-day cancellations may be subject to a fee.',
    keywords: ['cancel', 'reschedule', 'change appointment', 'cancel appointment'],
    category: 'general',
  },
  {
    question: 'Do you offer telehealth appointments?',
    answer: 'While chiropractic adjustments require in-person visits, we do offer telehealth consultations for certain services such as initial consultations, follow-up discussions, exercise instruction, and nutritional counseling. Contact our office to learn more about telehealth options.',
    keywords: ['telehealth', 'virtual', 'online', 'video'],
    category: 'general',
  },
];

/**
 * FAQ Agent for answering patient questions
 */
export class FAQAgent {
  private prisma: PrismaClient;
  private faqs: FAQEntry[];

  constructor(prisma: PrismaClient, customFAQs?: FAQEntry[]) {
    this.prisma = prisma;
    this.faqs = customFAQs || DEFAULT_FAQS;
  }

  /**
   * Answer a FAQ question
   */
  async answerQuestion(request: FAQRequest): Promise<FAQResponse> {
    const { question, category, context, organizationId } = request;

    // First, try to find a matching FAQ from the database
    const matchingFAQ = this.findMatchingFAQ(question, category);

    if (matchingFAQ) {
      // Personalize the answer with organization-specific info
      const personalizedAnswer = this.personalizeAnswer(
        matchingFAQ.answer,
        context.organizationSettings
      );

      return {
        answer: personalizedAnswer,
        confidence: 0.85,
        sources: ['Practice FAQ Database'],
        relatedQuestions: this.findRelatedQuestions(matchingFAQ, question),
      };
    }

    // Fall back to LLM-generated answer
    const llmResponse = mockLLM.generateFAQAnswer(
      question,
      category || 'general',
      context
    );

    return {
      answer: llmResponse.answer,
      confidence: llmResponse.confidence,
      relatedQuestions: llmResponse.relatedQuestions,
    };
  }

  /**
   * Find the best matching FAQ entry
   */
  private findMatchingFAQ(question: string, category?: string): FAQEntry | null {
    const normalizedQuestion = question.toLowerCase();
    let bestMatch: FAQEntry | null = null;
    let bestScore = 0;

    for (const faq of this.faqs) {
      // Skip if category doesn't match
      if (category && faq.category !== category) {
        continue;
      }

      // Calculate match score
      let score = 0;

      // Check keyword matches
      for (const keyword of faq.keywords) {
        if (normalizedQuestion.includes(keyword.toLowerCase())) {
          score += 2;
        }
      }

      // Check question similarity
      const faqWords = faq.question.toLowerCase().split(/\s+/);
      for (const word of faqWords) {
        if (word.length > 3 && normalizedQuestion.includes(word)) {
          score += 1;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = faq;
      }
    }

    // Return match if confidence is high enough
    return bestScore >= 3 ? bestMatch : null;
  }

  /**
   * Personalize answer with organization-specific information
   */
  private personalizeAnswer(
    answer: string,
    settings?: ChatContext['organizationSettings']
  ): string {
    if (!settings) return answer;

    let personalized = answer;

    // Replace generic location with actual address
    if (settings.address) {
      personalized = personalized.replace(
        /123 Main Street, Suite 100/g,
        settings.address
      );
    }

    // Add phone number if relevant
    if (settings.phone && personalized.includes('call our office')) {
      personalized = personalized.replace(
        'call our office',
        `call our office at ${settings.phone}`
      );
    }

    return personalized;
  }

  /**
   * Find related questions
   */
  private findRelatedQuestions(matchedFAQ: FAQEntry, originalQuestion: string): string[] {
    const related: string[] = [];
    const category = matchedFAQ.category;

    // Find other FAQs in the same category
    for (const faq of this.faqs) {
      if (
        faq.category === category &&
        faq.question !== matchedFAQ.question &&
        faq.question.toLowerCase() !== originalQuestion.toLowerCase()
      ) {
        related.push(faq.question);
      }

      if (related.length >= 3) break;
    }

    return related;
  }

  /**
   * Get all FAQs by category
   */
  getFAQsByCategory(category: string): FAQEntry[] {
    return this.faqs.filter(faq => faq.category === category);
  }

  /**
   * Get all available categories
   */
  getCategories(): string[] {
    return [...new Set(this.faqs.map(faq => faq.category))];
  }

  /**
   * Search FAQs
   */
  searchFAQs(query: string): FAQEntry[] {
    const normalizedQuery = query.toLowerCase();

    return this.faqs
      .filter(faq => {
        const questionMatch = faq.question.toLowerCase().includes(normalizedQuery);
        const keywordMatch = faq.keywords.some(k => k.toLowerCase().includes(normalizedQuery));
        const answerMatch = faq.answer.toLowerCase().includes(normalizedQuery);
        return questionMatch || keywordMatch || answerMatch;
      })
      .slice(0, 10);
  }

  /**
   * Add custom FAQ
   */
  addFAQ(faq: FAQEntry): void {
    this.faqs.push(faq);
  }

  /**
   * Get popular/common questions
   */
  getPopularQuestions(): string[] {
    return [
      'What insurance do you accept?',
      'What are your office hours?',
      'What should I expect on my first visit?',
      'Where are you located?',
      'Do I need a referral?',
    ];
  }
}

/**
 * Create an FAQ agent instance
 */
export function createFAQAgent(prisma: PrismaClient, customFAQs?: FAQEntry[]): FAQAgent {
  return new FAQAgent(prisma, customFAQs);
}

export default FAQAgent;
