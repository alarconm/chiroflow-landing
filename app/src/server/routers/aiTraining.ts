/**
 * Epic 38: AI Staff Training Agent - Router
 *
 * tRPC router for AI-powered staff training operations including:
 * - Video practice sessions (US-364)
 * - Interactive AI patient role-play
 * - Real-time voice conversation simulation
 * - Session recording and review
 * - Difficulty-based scenario selection
 * - AI persona management
 */

import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { auditLog } from '@/lib/audit';
import type { ScenarioType, DifficultyLevel, TrainingStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';

// JSON schema for Prisma compatibility
const jsonSchema = z.any().transform((val) => val as Prisma.InputJsonValue);

// ============================================
// Types for Video Practice Sessions
// ============================================

interface AIPersona {
  name: string;
  age: number | null;
  gender: string | null;
  traits: string[];
  history: string | null;
  emotionalState: 'calm' | 'anxious' | 'frustrated' | 'friendly' | 'demanding' | 'confused';
  speakingStyle: 'formal' | 'casual' | 'curt' | 'verbose';
}

interface ConversationMessage {
  role: 'ai' | 'user';
  content: string;
  timestamp: number;
  sentiment?: 'positive' | 'neutral' | 'negative';
  keyPhrasesUsed?: string[];
  keyPhrasesAvoid?: string[];
}

interface SessionContext {
  scenarioType: ScenarioType;
  difficulty: DifficultyLevel;
  persona: AIPersona;
  expectedOutcomes: string[];
  currentState: 'greeting' | 'main_issue' | 'resolution' | 'closing';
  issueResolved: boolean;
  conversationHistory: ConversationMessage[];
}

interface PracticeSessionResult {
  sessionId: string;
  status: 'completed' | 'in_progress' | 'abandoned';
  duration: number;
  scores: {
    overall: number;
    tone: number;
    empathy: number;
    scriptAdherence: number;
    timing: number;
  };
  outcomeAchieved: boolean;
  strengths: string[];
  improvements: string[];
  feedback: string;
}

interface AIResponse {
  message: string;
  emotion: string;
  nextExpectedAction: string;
  scenarioState: 'ongoing' | 'resolved' | 'escalated' | 'failed';
  hints?: string[];
}

// ============================================
// Zod Schemas
// ============================================

const scenarioTypeEnum = z.enum([
  'SCHEDULING_CALL',
  'BILLING_INQUIRY',
  'COMPLAINT_HANDLING',
  'NEW_PATIENT_INTAKE',
  'CANCELLATION',
  'INSURANCE_QUESTIONS',
  'FOLLOW_UP_CALL',
  'EMERGENCY_TRIAGE',
]);

const difficultyLevelEnum = z.enum([
  'BEGINNER',
  'INTERMEDIATE',
  'ADVANCED',
  'EXPERT',
]);

const emotionalStateEnum = z.enum([
  'calm',
  'anxious',
  'frustrated',
  'friendly',
  'demanding',
  'confused',
]);

// ============================================
// AI Practice Session Helpers
// ============================================

/**
 * Generate AI persona based on scenario and difficulty
 */
function generateAIPersona(
  scenario: {
    personaName: string;
    personaAge: number | null;
    personaGender: string | null;
    personaTraits: string[];
    personaHistory: string | null;
  },
  difficulty: DifficultyLevel
): AIPersona {
  // Adjust emotional state based on difficulty
  const emotionalStates: Record<DifficultyLevel, AIPersona['emotionalState'][]> = {
    BEGINNER: ['calm', 'friendly'],
    INTERMEDIATE: ['calm', 'anxious', 'confused'],
    ADVANCED: ['frustrated', 'demanding', 'anxious'],
    EXPERT: ['frustrated', 'demanding', 'anxious', 'confused'],
  };

  const possibleStates = emotionalStates[difficulty] || ['calm'];
  const emotionalState = possibleStates[Math.floor(Math.random() * possibleStates.length)];

  // Adjust speaking style based on difficulty
  const speakingStyles: Record<DifficultyLevel, AIPersona['speakingStyle'][]> = {
    BEGINNER: ['casual', 'formal'],
    INTERMEDIATE: ['casual', 'formal', 'verbose'],
    ADVANCED: ['curt', 'verbose', 'formal'],
    EXPERT: ['curt', 'verbose'],
  };

  const possibleStyles = speakingStyles[difficulty] || ['casual'];
  const speakingStyle = possibleStyles[Math.floor(Math.random() * possibleStyles.length)];

  return {
    name: scenario.personaName,
    age: scenario.personaAge,
    gender: scenario.personaGender,
    traits: scenario.personaTraits,
    history: scenario.personaHistory,
    emotionalState,
    speakingStyle,
  };
}

/**
 * Generate AI opening line based on scenario type and persona
 */
function generateOpeningLine(
  scenarioType: ScenarioType,
  persona: AIPersona,
  customOpening: string | null
): string {
  if (customOpening) {
    return customOpening;
  }

  const openings: Record<ScenarioType, Record<AIPersona['emotionalState'], string>> = {
    SCHEDULING_CALL: {
      calm: `Hi, this is ${persona.name}. I'd like to schedule an appointment please.`,
      anxious: `Hello? Is this the chiropractic office? I really need to get in soon, I've been having terrible pain.`,
      frustrated: `Yeah, hi. I've been trying to call for the past hour. I need an appointment.`,
      friendly: `Good morning! This is ${persona.name}. I hope you're having a great day! I wanted to see about booking an appointment.`,
      demanding: `I need to see the doctor today. What's the earliest available?`,
      confused: `Um, hi. I'm not sure if I called the right place... do you do chiropractic appointments here?`,
    },
    BILLING_INQUIRY: {
      calm: `Hi, I received a bill and I have some questions about the charges.`,
      anxious: `I got this bill and I don't understand it at all. The amount seems really high.`,
      frustrated: `I've called three times about this bill and no one can explain these charges to me!`,
      friendly: `Hey there! I just got my statement and wanted to clarify a few things when you have a moment.`,
      demanding: `This bill is wrong and I need it fixed immediately. I'm not paying this amount.`,
      confused: `I received something in the mail... I'm not sure what all these codes mean?`,
    },
    COMPLAINT_HANDLING: {
      calm: `I wanted to discuss an issue I had during my last visit.`,
      anxious: `I'm really worried about what happened at my appointment...`,
      frustrated: `I am extremely unhappy with the service I received. This is unacceptable!`,
      friendly: `I hate to complain, but there was a small issue I thought you should know about.`,
      demanding: `I want to speak to a manager right now about how I was treated!`,
      confused: `I'm not sure who to talk to, but something didn't seem right at my visit...`,
    },
    NEW_PATIENT_INTAKE: {
      calm: `Hi, I'm interested in becoming a new patient. What's the process?`,
      anxious: `I've never been to a chiropractor before and I'm a little nervous. What should I expect?`,
      frustrated: `Your website was confusing. Can someone just tell me what I need to do?`,
      friendly: `Hello! A friend recommended your office and I'd love to schedule my first visit!`,
      demanding: `I want to start treatment this week. What's the fastest way to get in?`,
      confused: `Do I need a referral? What insurance do you take? I have so many questions...`,
    },
    CANCELLATION: {
      calm: `I need to cancel my appointment for tomorrow.`,
      anxious: `I'm so sorry, but something came up and I can't make my appointment...`,
      frustrated: `I tried to cancel online but your system wouldn't let me!`,
      friendly: `Unfortunately, I need to reschedule. Is there another time available soon?`,
      demanding: `Cancel my appointment. And I better not be charged any fees.`,
      confused: `I think I have an appointment? But I'm not sure when it was...`,
    },
    INSURANCE_QUESTIONS: {
      calm: `I wanted to verify my insurance coverage before my visit.`,
      anxious: `I really hope my insurance covers this... can you check for me?`,
      frustrated: `My insurance company said you're in-network but your office said different!`,
      friendly: `Just want to make sure everything is in order with my insurance!`,
      demanding: `I need to know exactly what my out-of-pocket will be before I come in.`,
      confused: `I don't really understand my insurance. What does "covered" mean exactly?`,
    },
    FOLLOW_UP_CALL: {
      calm: `Hi, I had an appointment last week and wanted to discuss how I'm doing.`,
      anxious: `I'm calling because I'm still having some pain and I'm not sure if that's normal.`,
      frustrated: `I followed all the instructions and I'm not feeling any better!`,
      friendly: `Just calling to say how much better I feel! But I had a quick question.`,
      demanding: `The treatment isn't working. I need a different approach.`,
      confused: `Was I supposed to do the exercises every day or just when I have pain?`,
    },
    EMERGENCY_TRIAGE: {
      calm: `I'm having some new symptoms and wanted to check if I should come in.`,
      anxious: `Something is really wrong. I woke up and I can barely move!`,
      frustrated: `I've been dealing with this for days and it keeps getting worse!`,
      friendly: `I hate to bother you, but this seems more serious than usual...`,
      demanding: `I need to be seen right now. This is an emergency.`,
      confused: `I fell yesterday and now my back hurts. Should I go to the ER or come see you?`,
    },
  };

  const scenarioOpenings = openings[scenarioType];
  if (scenarioOpenings && scenarioOpenings[persona.emotionalState]) {
    return scenarioOpenings[persona.emotionalState];
  }

  return `Hello, this is ${persona.name} calling.`;
}

/**
 * Generate AI response based on conversation context
 */
function generateAIResponse(
  context: SessionContext,
  userMessage: string
): AIResponse {
  const { persona, scenarioType, difficulty, expectedOutcomes, conversationHistory } = context;

  // Basic response generation (would be replaced by actual AI in production)
  // This provides a realistic simulation framework

  const messageCount = conversationHistory.length;
  const hasGreeted = conversationHistory.some(
    (m) => m.role === 'user' && m.content.toLowerCase().includes('hello')
  );

  let message = '';
  let emotion = persona.emotionalState;
  let nextExpectedAction = '';
  let scenarioState: AIResponse['scenarioState'] = 'ongoing';
  const hints: string[] = [];

  // Simulate conversation progression based on scenario type
  if (messageCount < 2) {
    // Early conversation - AI elaborates on their issue
    message = getElaborationMessage(scenarioType, persona);
    nextExpectedAction = 'Acknowledge the concern and gather more information';
    hints.push('Try using empathetic phrases like "I understand" or "Let me help you with that"');
  } else if (messageCount < 5) {
    // Mid conversation - AI responds to staff's handling
    const isPositiveHandling = userMessage.toLowerCase().includes('understand') ||
      userMessage.toLowerCase().includes('help') ||
      userMessage.toLowerCase().includes('certainly');

    if (isPositiveHandling) {
      emotion = 'calm';
      message = getPositiveResponseMessage(scenarioType, persona);
      nextExpectedAction = 'Continue to resolution';
    } else {
      message = getNeutralResponseMessage(scenarioType, persona);
      nextExpectedAction = 'Address the concern more directly';
      hints.push('The caller may need more reassurance');
    }
  } else {
    // Late conversation - moving toward resolution
    const mentionedResolution = expectedOutcomes.some((outcome) =>
      userMessage.toLowerCase().includes(outcome.toLowerCase().split(' ')[0])
    );

    if (mentionedResolution) {
      message = getResolutionMessage(scenarioType, persona);
      scenarioState = 'resolved';
      nextExpectedAction = 'Wrap up the call professionally';
    } else {
      message = getFollowUpMessage(scenarioType, persona);
      nextExpectedAction = 'Guide toward resolution of the main issue';
    }
  }

  return {
    message,
    emotion,
    nextExpectedAction,
    scenarioState,
    hints: difficulty === 'BEGINNER' || difficulty === 'INTERMEDIATE' ? hints : undefined,
  };
}

function getElaborationMessage(scenarioType: ScenarioType, persona: AIPersona): string {
  const elaborations: Record<ScenarioType, string[]> = {
    SCHEDULING_CALL: [
      `I've been having back pain for about a week now. It's getting hard to sleep.`,
      `My doctor recommended I see a chiropractor. Do I need a referral from them?`,
      `I work during the day, so I really need an evening or early morning slot.`,
    ],
    BILLING_INQUIRY: [
      `I see a charge for something called "manipulation" - what is that exactly?`,
      `My insurance was supposed to cover this. Why am I being billed?`,
      `The total is way more than what I was quoted when I came in.`,
    ],
    COMPLAINT_HANDLING: [
      `I waited 45 minutes past my appointment time, and nobody apologized.`,
      `The front desk was very rude when I asked a simple question.`,
      `I was told the treatment would help, but I feel worse than before.`,
    ],
    NEW_PATIENT_INTAKE: [
      `What forms do I need to fill out before I come in?`,
      `How long does the first appointment usually take?`,
      `What should I bring? Just my insurance card?`,
    ],
    CANCELLATION: [
      `I have a work emergency. Is there a fee for canceling?`,
      `Can I move it to next week instead of canceling completely?`,
      `I'm so sorry for the short notice. Is there a waitlist I bumped someone from?`,
    ],
    INSURANCE_QUESTIONS: [
      `I just switched jobs and have new insurance. Will it still cover me?`,
      `What's my copay going to be? My plan is kind of complicated.`,
      `Do you bill insurance directly or do I pay and get reimbursed?`,
    ],
    FOLLOW_UP_CALL: [
      `I did the exercises but I'm still sore. Is that normal?`,
      `Should I use ice or heat? I forget what the doctor said.`,
      `When should I schedule my next appointment?`,
    ],
    EMERGENCY_TRIAGE: [
      `I can't turn my neck at all. The pain shoots down my arm.`,
      `I had a car accident yesterday and now my back is really stiff.`,
      `I have numbness and tingling in my legs. Should I be worried?`,
    ],
  };

  const messages = elaborations[scenarioType] || [`Can you help me with this?`];
  return messages[Math.floor(Math.random() * messages.length)];
}

function getPositiveResponseMessage(scenarioType: ScenarioType, persona: AIPersona): string {
  const responses: Record<ScenarioType, string[]> = {
    SCHEDULING_CALL: [
      `Oh, that time works perfectly for me. Thank you for being so helpful.`,
      `Great, I really appreciate you finding something so soon.`,
      `That's wonderful. What should I bring to my first visit?`,
    ],
    BILLING_INQUIRY: [
      `Oh, that makes sense now. Thank you for explaining it.`,
      `Okay, so if I pay this today, we're all settled?`,
      `I appreciate you taking the time to go through this with me.`,
    ],
    COMPLAINT_HANDLING: [
      `Thank you for listening. That does make me feel better.`,
      `I appreciate you taking my concern seriously.`,
      `Okay, I'm willing to give it another try if you can help.`,
    ],
    NEW_PATIENT_INTAKE: [
      `That's very helpful information. I'll fill those out ahead of time.`,
      `Perfect, this is exactly what I needed to know.`,
      `Great, I'm excited to get started!`,
    ],
    CANCELLATION: [
      `Thank you for being understanding about this.`,
      `I really appreciate you not charging me a fee.`,
      `That new time works great. Sorry again for the inconvenience.`,
    ],
    INSURANCE_QUESTIONS: [
      `That's a relief. Thank you for checking for me.`,
      `Great, so I just need to bring my card and you'll handle the rest?`,
      `I appreciate you explaining all that. It's much clearer now.`,
    ],
    FOLLOW_UP_CALL: [
      `That's reassuring to hear. I'll keep doing the exercises then.`,
      `Okay, heat it is. Thanks for the reminder.`,
      `Great, I'll call back to schedule my next appointment.`,
    ],
    EMERGENCY_TRIAGE: [
      `Okay, I'll come right in. Thank you for fitting me in.`,
      `Should I go to the ER first or come straight to you?`,
      `I appreciate you taking this seriously.`,
    ],
  };

  const messages = responses[scenarioType] || [`Thank you for your help.`];
  return messages[Math.floor(Math.random() * messages.length)];
}

function getNeutralResponseMessage(scenarioType: ScenarioType, persona: AIPersona): string {
  return `I'm not sure I understand. Can you explain that again?`;
}

function getResolutionMessage(scenarioType: ScenarioType, persona: AIPersona): string {
  return `Perfect, I think we're all set then. Thank you for your help today.`;
}

function getFollowUpMessage(scenarioType: ScenarioType, persona: AIPersona): string {
  return `Is there anything else I need to know before we finish up?`;
}

/**
 * Calculate practice session scores
 */
function calculateSessionScores(
  conversationHistory: ConversationMessage[],
  expectedOutcomes: string[],
  keyPhrases: string[],
  avoidPhrases: string[],
  targetDuration: number,
  actualDuration: number
): PracticeSessionResult['scores'] {
  const userMessages = conversationHistory.filter((m) => m.role === 'user');
  const allUserText = userMessages.map((m) => m.content.toLowerCase()).join(' ');

  // Tone score - based on polite language usage
  const politeWords = ['please', 'thank you', 'certainly', 'happy to', 'of course', 'appreciate'];
  const politeCount = politeWords.filter((w) => allUserText.includes(w)).length;
  const toneScore = Math.min(100, 50 + politeCount * 10);

  // Empathy score - based on empathetic phrases
  const empathyPhrases = ['understand', 'sorry to hear', 'i can see', 'that must be', 'i appreciate'];
  const empathyCount = empathyPhrases.filter((p) => allUserText.includes(p)).length;
  const empathyScore = Math.min(100, 40 + empathyCount * 15);

  // Script adherence - based on key phrases used vs avoided
  const keyPhrasesUsed = keyPhrases.filter((p) => allUserText.includes(p.toLowerCase())).length;
  const avoidPhrasesUsed = avoidPhrases.filter((p) => allUserText.includes(p.toLowerCase())).length;
  const scriptAdherenceScore = Math.min(
    100,
    Math.max(0, 60 + keyPhrasesUsed * 10 - avoidPhrasesUsed * 20)
  );

  // Timing score - based on response times and call duration
  const durationDiff = Math.abs(actualDuration - targetDuration);
  const timingScore = Math.max(0, 100 - (durationDiff / targetDuration) * 50);

  // Overall score - weighted average
  const overall = Math.round(
    toneScore * 0.25 + empathyScore * 0.25 + scriptAdherenceScore * 0.3 + timingScore * 0.2
  );

  return {
    overall,
    tone: Math.round(toneScore),
    empathy: Math.round(empathyScore),
    scriptAdherence: Math.round(scriptAdherenceScore),
    timing: Math.round(timingScore),
  };
}

// ============================================
// Router Definition
// ============================================

export const aiTrainingRouter = router({
  // ============================================
  // US-364: Video Practice Sessions
  // ============================================

  /**
   * Get available practice scenarios
   * Retrieves scenarios filtered by type, difficulty, and tags
   */
  getScenarios: protectedProcedure
    .input(
      z.object({
        type: scenarioTypeEnum.optional(),
        difficulty: difficultyLevelEnum.optional(),
        tags: z.array(z.string()).optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { type, difficulty, tags, search, limit, cursor } = input;

      const where: Prisma.TrainingScenarioWhereInput = {
        organizationId: ctx.user.organizationId,
        isActive: true,
        ...(type && { type }),
        ...(difficulty && { difficulty }),
        ...(tags && tags.length > 0 && { tags: { hasSome: tags } }),
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        }),
      };

      const scenarios = await ctx.prisma.trainingScenario.findMany({
        where,
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: [{ difficulty: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          description: true,
          type: true,
          difficulty: true,
          personaName: true,
          personaTraits: true,
          targetDurationSecs: true,
          tags: true,
          _count: {
            select: { practiceSessions: true },
          },
        },
      });

      let nextCursor: string | undefined;
      if (scenarios.length > limit) {
        const nextItem = scenarios.pop();
        nextCursor = nextItem?.id;
      }

      // Get user's history with each scenario
      const sessionStats = await ctx.prisma.practiceSession.groupBy({
        by: ['scenarioId'],
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
          scenarioId: { in: scenarios.map((s) => s.id) },
        },
        _count: { id: true },
        _max: { overallScore: true },
        _avg: { overallScore: true },
      });

      const statsMap = new Map(sessionStats.map((s) => [s.scenarioId, s]));

      const scenariosWithStats = scenarios.map((scenario) => {
        const stats = statsMap.get(scenario.id);
        return {
          ...scenario,
          userStats: stats
            ? {
                attempts: stats._count.id,
                bestScore: stats._max.overallScore,
                avgScore: Math.round(stats._avg.overallScore || 0),
              }
            : null,
        };
      });

      return {
        scenarios: scenariosWithStats,
        nextCursor,
      };
    }),

  /**
   * Get scenario by ID with full details
   */
  getScenario: protectedProcedure
    .input(z.object({ scenarioId: z.string() }))
    .query(async ({ ctx, input }) => {
      const scenario = await ctx.prisma.trainingScenario.findFirst({
        where: {
          id: input.scenarioId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!scenario) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Scenario not found',
        });
      }

      return scenario;
    }),

  /**
   * Start a new practice session
   * Creates session record and returns AI persona details
   */
  startPractice: protectedProcedure
    .input(
      z.object({
        scenarioId: z.string(),
        difficultyOverride: difficultyLevelEnum.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { scenarioId, difficultyOverride } = input;

      // Get the scenario
      const scenario = await ctx.prisma.trainingScenario.findFirst({
        where: {
          id: scenarioId,
          organizationId: ctx.user.organizationId,
          isActive: true,
        },
      });

      if (!scenario) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Scenario not found or not active',
        });
      }

      const difficulty = difficultyOverride || scenario.difficulty;

      // Generate AI persona
      const persona = generateAIPersona(scenario, difficulty);

      // Generate opening line
      const openingLine = generateOpeningLine(scenario.type, persona, scenario.openingLine);

      // Create practice session
      const session = await ctx.prisma.practiceSession.create({
        data: {
          userId: ctx.user.id,
          scenarioId: scenario.id,
          organizationId: ctx.user.organizationId,
          status: 'IN_PROGRESS',
          startedAt: new Date(),
        },
      });

      // Log the action
      await auditLog('CREATE', 'PracticeSession', {
        entityId: session.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          scenarioId,
          difficulty,
        },
      });

      return {
        sessionId: session.id,
        scenario: {
          id: scenario.id,
          name: scenario.name,
          type: scenario.type,
          difficulty,
          expectedOutcomes: scenario.expectedOutcomes,
          keyPhrases: scenario.keyPhrases,
          avoidPhrases: scenario.avoidPhrases,
          targetDurationSecs: scenario.targetDurationSecs,
          maxDurationSecs: scenario.maxDurationSecs,
        },
        persona: {
          name: persona.name,
          traits: persona.traits,
          emotionalState: persona.emotionalState,
          speakingStyle: persona.speakingStyle,
        },
        openingLine,
        hints:
          difficulty === 'BEGINNER'
            ? [
                'Listen carefully to the caller\'s concerns',
                'Use empathetic language like "I understand"',
                'Offer clear solutions',
              ]
            : undefined,
      };
    }),

  /**
   * Send message to AI during practice session
   * Processes user response and generates AI reply
   */
  sendMessage: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        message: z.string().min(1).max(2000),
        timestamp: z.number(), // Seconds since session start
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { sessionId, message, timestamp } = input;

      // Get session with scenario
      const session = await ctx.prisma.practiceSession.findFirst({
        where: {
          id: sessionId,
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
          status: 'IN_PROGRESS',
        },
        include: {
          scenario: true,
        },
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Active session not found',
        });
      }

      // Parse existing transcript or initialize
      let conversationHistory: ConversationMessage[] = [];
      if (session.transcript) {
        try {
          conversationHistory = JSON.parse(session.transcript);
        } catch {
          conversationHistory = [];
        }
      }

      // If this is the first user message, add AI opening
      if (conversationHistory.length === 0) {
        const persona = generateAIPersona(session.scenario, session.scenario.difficulty);
        const openingLine = generateOpeningLine(
          session.scenario.type,
          persona,
          session.scenario.openingLine
        );
        conversationHistory.push({
          role: 'ai',
          content: openingLine,
          timestamp: 0,
        });
      }

      // Add user message
      conversationHistory.push({
        role: 'user',
        content: message,
        timestamp,
      });

      // Generate AI response
      const context: SessionContext = {
        scenarioType: session.scenario.type,
        difficulty: session.scenario.difficulty,
        persona: generateAIPersona(session.scenario, session.scenario.difficulty),
        expectedOutcomes: session.scenario.expectedOutcomes,
        currentState: 'main_issue',
        issueResolved: false,
        conversationHistory,
      };

      const aiResponse = generateAIResponse(context, message);

      // Add AI response to history
      conversationHistory.push({
        role: 'ai',
        content: aiResponse.message,
        timestamp: timestamp + 2, // Simulate 2 second response time
      });

      // Update session transcript
      await ctx.prisma.practiceSession.update({
        where: { id: sessionId },
        data: {
          transcript: JSON.stringify(conversationHistory),
        },
      });

      return {
        response: aiResponse.message,
        emotion: aiResponse.emotion,
        nextExpectedAction: aiResponse.nextExpectedAction,
        scenarioState: aiResponse.scenarioState,
        hints: aiResponse.hints,
        conversationLength: conversationHistory.length,
      };
    }),

  /**
   * End practice session
   * Calculates scores and generates feedback
   */
  endSession: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        recordingUrl: z.string().url().optional(),
        recordingFormat: z.string().optional(),
        userNotes: z.string().optional(),
        userSelfRating: z.number().min(1).max(5).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { sessionId, recordingUrl, recordingFormat, userNotes, userSelfRating } = input;

      // Get session with scenario
      const session = await ctx.prisma.practiceSession.findFirst({
        where: {
          id: sessionId,
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          scenario: true,
        },
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Session not found',
        });
      }

      // Parse conversation history
      let conversationHistory: ConversationMessage[] = [];
      if (session.transcript) {
        try {
          conversationHistory = JSON.parse(session.transcript);
        } catch {
          conversationHistory = [];
        }
      }

      // Calculate duration
      const endTime = new Date();
      const durationSecs = Math.round(
        (endTime.getTime() - session.startedAt.getTime()) / 1000
      );

      // Calculate scores
      const scores = calculateSessionScores(
        conversationHistory,
        session.scenario.expectedOutcomes,
        session.scenario.keyPhrases,
        session.scenario.avoidPhrases,
        session.scenario.targetDurationSecs,
        durationSecs
      );

      // Determine if outcome was achieved
      const userMessages = conversationHistory
        .filter((m) => m.role === 'user')
        .map((m) => m.content.toLowerCase())
        .join(' ');
      const outcomeAchieved = session.scenario.expectedOutcomes.some((outcome) =>
        userMessages.includes(outcome.toLowerCase().split(' ')[0])
      );

      // Generate feedback
      const strengths: string[] = [];
      const improvements: string[] = [];

      if (scores.tone >= 80) strengths.push('Excellent professional tone throughout the call');
      else if (scores.tone < 60) improvements.push('Work on maintaining a more professional tone');

      if (scores.empathy >= 80) strengths.push('Strong empathy and understanding shown');
      else if (scores.empathy < 60)
        improvements.push('Try to acknowledge the caller\'s feelings more');

      if (scores.scriptAdherence >= 80) strengths.push('Good adherence to key phrases and scripts');
      else if (scores.scriptAdherence < 60)
        improvements.push('Review the key phrases for this scenario type');

      if (scores.timing >= 80) strengths.push('Good call pacing and duration');
      else if (scores.timing < 60)
        improvements.push('Work on call efficiency - aim for the target duration');

      const aiFeedback = `Overall score: ${scores.overall}/100. ${strengths.length > 0 ? 'Strengths: ' + strengths.join(', ') + '. ' : ''}${improvements.length > 0 ? 'Areas for improvement: ' + improvements.join(', ') + '.' : ''}`;

      // Update session
      const updatedSession = await ctx.prisma.practiceSession.update({
        where: { id: sessionId },
        data: {
          status: 'COMPLETED',
          endedAt: endTime,
          durationSecs,
          recordingUrl,
          recordingFormat,
          overallScore: scores.overall,
          toneScore: scores.tone,
          empathyScore: scores.empathy,
          scriptAdherenceScore: scores.scriptAdherence,
          timingScore: scores.timing,
          outcomeAchieved,
          strengths,
          improvements,
          aiFeedback,
          userNotes,
          userSelfRating,
        },
      });

      // Create performance feedback entries
      const feedbackCategories = [
        { category: 'TONE' as const, score: scores.tone },
        { category: 'EMPATHY' as const, score: scores.empathy },
        { category: 'SCRIPT_ADHERENCE' as const, score: scores.scriptAdherence },
        { category: 'RESPONSE_TIME' as const, score: scores.timing },
      ];

      await ctx.prisma.performanceFeedback.createMany({
        data: feedbackCategories.map((fc) => ({
          sessionId: session.id,
          organizationId: ctx.user.organizationId,
          category: fc.category,
          feedback: `Score: ${fc.score}/100`,
          score: fc.score,
          suggestions:
            fc.score < 70
              ? [
                  `Review training materials for ${fc.category.toLowerCase().replace('_', ' ')}`,
                ]
              : [],
          isAIGenerated: true,
        })),
      });

      // Log the action
      await auditLog('UPDATE', 'PracticeSession', {
        entityId: session.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          overallScore: scores.overall,
          durationSecs,
          outcomeAchieved,
          status: 'COMPLETED',
        },
      });

      return {
        sessionId: session.id,
        status: 'completed' as const,
        duration: durationSecs,
        scores,
        outcomeAchieved,
        strengths,
        improvements,
        feedback: aiFeedback,
        conversationHistory,
      };
    }),

  /**
   * Get user's practice session history
   */
  getSessionHistory: protectedProcedure
    .input(
      z.object({
        scenarioId: z.string().optional(),
        scenarioType: scenarioTypeEnum.optional(),
        status: z.enum(['IN_PROGRESS', 'COMPLETED', 'FAILED']).optional(),
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { scenarioId, scenarioType, status, limit, cursor } = input;

      const where: Prisma.PracticeSessionWhereInput = {
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        ...(scenarioId && { scenarioId }),
        ...(scenarioType && { scenario: { type: scenarioType } }),
        ...(status && { status }),
      };

      const sessions = await ctx.prisma.practiceSession.findMany({
        where,
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { startedAt: 'desc' },
        include: {
          scenario: {
            select: {
              id: true,
              name: true,
              type: true,
              difficulty: true,
            },
          },
        },
      });

      let nextCursor: string | undefined;
      if (sessions.length > limit) {
        const nextItem = sessions.pop();
        nextCursor = nextItem?.id;
      }

      return {
        sessions,
        nextCursor,
      };
    }),

  /**
   * Get session details with full feedback
   */
  getSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const session = await ctx.prisma.practiceSession.findFirst({
        where: {
          id: input.sessionId,
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          scenario: true,
          feedback: {
            orderBy: { category: 'asc' },
          },
        },
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Session not found',
        });
      }

      return session;
    }),

  /**
   * Save recording URL after upload
   */
  saveRecording: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        recordingUrl: z.string().url(),
        recordingFormat: z.string().default('video/webm'),
        transcriptUrl: z.string().url().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { sessionId, recordingUrl, recordingFormat, transcriptUrl } = input;

      const session = await ctx.prisma.practiceSession.findFirst({
        where: {
          id: sessionId,
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Session not found',
        });
      }

      const updated = await ctx.prisma.practiceSession.update({
        where: { id: sessionId },
        data: {
          recordingUrl,
          recordingFormat,
          transcriptUrl,
        },
      });

      return { success: true, sessionId: updated.id };
    }),

  /**
   * Abandon an in-progress session
   */
  abandonSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.practiceSession.findFirst({
        where: {
          id: input.sessionId,
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
          status: 'IN_PROGRESS',
        },
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Active session not found',
        });
      }

      await ctx.prisma.practiceSession.update({
        where: { id: input.sessionId },
        data: {
          status: 'FAILED',
          endedAt: new Date(),
          durationSecs: Math.round(
            (new Date().getTime() - session.startedAt.getTime()) / 1000
          ),
        },
      });

      await auditLog('UPDATE', 'PracticeSession', {
        entityId: session.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          status: 'FAILED',
          abandoned: true,
        },
      });

      return { success: true };
    }),

  // ============================================
  // Scenario Management (Admin)
  // ============================================

  /**
   * Create a new training scenario
   */
  createScenario: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().optional(),
        type: scenarioTypeEnum,
        difficulty: difficultyLevelEnum.default('BEGINNER'),
        personaName: z.string().min(1).max(100),
        personaAge: z.number().int().min(18).max(100).optional(),
        personaGender: z.string().optional(),
        personaTraits: z.array(z.string()).default([]),
        personaHistory: z.string().optional(),
        script: z.string().min(1),
        context: jsonSchema.optional(),
        openingLine: z.string().optional(),
        expectedOutcomes: z.array(z.string()).default([]),
        keyPhrases: z.array(z.string()).default([]),
        avoidPhrases: z.array(z.string()).default([]),
        scoringRubric: jsonSchema.optional(),
        idealResponse: z.string().optional(),
        targetDurationSecs: z.number().int().min(30).max(900).default(180),
        maxDurationSecs: z.number().int().min(60).max(1800).default(300),
        tags: z.array(z.string()).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const scenario = await ctx.prisma.trainingScenario.create({
        data: {
          name: input.name,
          description: input.description,
          type: input.type,
          difficulty: input.difficulty,
          personaName: input.personaName,
          personaAge: input.personaAge,
          personaGender: input.personaGender,
          personaTraits: input.personaTraits,
          personaHistory: input.personaHistory,
          script: input.script,
          context: input.context ?? undefined,
          openingLine: input.openingLine,
          expectedOutcomes: input.expectedOutcomes,
          keyPhrases: input.keyPhrases,
          avoidPhrases: input.avoidPhrases,
          scoringRubric: input.scoringRubric ?? undefined,
          idealResponse: input.idealResponse,
          targetDurationSecs: input.targetDurationSecs,
          maxDurationSecs: input.maxDurationSecs,
          tags: input.tags,
          organizationId: ctx.user.organizationId,
        },
      });

      await auditLog('CREATE', 'TrainingScenario', {
        entityId: scenario.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: input as Record<string, unknown>,
      });

      return scenario;
    }),

  /**
   * Update a training scenario
   */
  updateScenario: adminProcedure
    .input(
      z.object({
        scenarioId: z.string(),
        name: z.string().min(1).max(200).optional(),
        description: z.string().optional(),
        type: scenarioTypeEnum.optional(),
        difficulty: difficultyLevelEnum.optional(),
        personaName: z.string().min(1).max(100).optional(),
        personaAge: z.number().int().min(18).max(100).optional(),
        personaGender: z.string().optional(),
        personaTraits: z.array(z.string()).optional(),
        personaHistory: z.string().optional(),
        script: z.string().min(1).optional(),
        context: jsonSchema.optional(),
        openingLine: z.string().optional(),
        expectedOutcomes: z.array(z.string()).optional(),
        keyPhrases: z.array(z.string()).optional(),
        avoidPhrases: z.array(z.string()).optional(),
        scoringRubric: jsonSchema.optional(),
        idealResponse: z.string().optional(),
        targetDurationSecs: z.number().int().min(30).max(900).optional(),
        maxDurationSecs: z.number().int().min(60).max(1800).optional(),
        tags: z.array(z.string()).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { scenarioId, ...data } = input;

      const scenario = await ctx.prisma.trainingScenario.findFirst({
        where: {
          id: scenarioId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!scenario) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Scenario not found',
        });
      }

      // Build update data - use Prisma's update type
      const updateData: Prisma.TrainingScenarioUpdateInput = {};

      if (data.name !== undefined) updateData.name = data.name;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.type !== undefined) updateData.type = data.type;
      if (data.difficulty !== undefined) updateData.difficulty = data.difficulty;
      if (data.personaName !== undefined) updateData.personaName = data.personaName;
      if (data.personaAge !== undefined) updateData.personaAge = data.personaAge;
      if (data.personaGender !== undefined) updateData.personaGender = data.personaGender;
      if (data.personaTraits !== undefined) updateData.personaTraits = data.personaTraits;
      if (data.personaHistory !== undefined) updateData.personaHistory = data.personaHistory;
      if (data.script !== undefined) updateData.script = data.script;
      if (data.context !== undefined) updateData.context = data.context;
      if (data.openingLine !== undefined) updateData.openingLine = data.openingLine;
      if (data.expectedOutcomes !== undefined) updateData.expectedOutcomes = data.expectedOutcomes;
      if (data.keyPhrases !== undefined) updateData.keyPhrases = data.keyPhrases;
      if (data.avoidPhrases !== undefined) updateData.avoidPhrases = data.avoidPhrases;
      if (data.scoringRubric !== undefined) updateData.scoringRubric = data.scoringRubric;
      if (data.idealResponse !== undefined) updateData.idealResponse = data.idealResponse;
      if (data.targetDurationSecs !== undefined) updateData.targetDurationSecs = data.targetDurationSecs;
      if (data.maxDurationSecs !== undefined) updateData.maxDurationSecs = data.maxDurationSecs;
      if (data.tags !== undefined) updateData.tags = data.tags;
      if (data.isActive !== undefined) updateData.isActive = data.isActive;

      const updated = await ctx.prisma.trainingScenario.update({
        where: { id: scenarioId },
        data: updateData,
      });

      await auditLog('UPDATE', 'TrainingScenario', {
        entityId: scenarioId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: updateData as Record<string, unknown>,
      });

      return updated;
    }),

  /**
   * Delete a training scenario
   */
  deleteScenario: adminProcedure
    .input(z.object({ scenarioId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const scenario = await ctx.prisma.trainingScenario.findFirst({
        where: {
          id: input.scenarioId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!scenario) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Scenario not found',
        });
      }

      // Soft delete by setting isActive to false
      await ctx.prisma.trainingScenario.update({
        where: { id: input.scenarioId },
        data: { isActive: false },
      });

      await auditLog('DELETE', 'TrainingScenario', {
        entityId: input.scenarioId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // ============================================
  // Statistics and Reporting
  // ============================================

  /**
   * Get user's practice statistics
   */
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const sessions = await ctx.prisma.practiceSession.findMany({
      where: {
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        status: 'COMPLETED',
      },
      select: {
        overallScore: true,
        toneScore: true,
        empathyScore: true,
        scriptAdherenceScore: true,
        timingScore: true,
        outcomeAchieved: true,
        durationSecs: true,
        scenario: {
          select: {
            type: true,
            difficulty: true,
          },
        },
      },
    });

    if (sessions.length === 0) {
      return {
        totalSessions: 0,
        averageScore: 0,
        scoreBreakdown: null,
        outcomeRate: 0,
        averageDuration: 0,
        byScenarioType: {},
        byDifficulty: {},
        recentTrend: [],
      };
    }

    const totalSessions = sessions.length;
    const averageScore = Math.round(
      sessions.reduce((sum, s) => sum + (s.overallScore || 0), 0) / totalSessions
    );

    const scoreBreakdown = {
      tone: Math.round(
        sessions.reduce((sum, s) => sum + (s.toneScore || 0), 0) / totalSessions
      ),
      empathy: Math.round(
        sessions.reduce((sum, s) => sum + (s.empathyScore || 0), 0) / totalSessions
      ),
      scriptAdherence: Math.round(
        sessions.reduce((sum, s) => sum + (s.scriptAdherenceScore || 0), 0) / totalSessions
      ),
      timing: Math.round(
        sessions.reduce((sum, s) => sum + (s.timingScore || 0), 0) / totalSessions
      ),
    };

    const outcomeRate = Math.round(
      (sessions.filter((s) => s.outcomeAchieved).length / totalSessions) * 100
    );

    const averageDuration = Math.round(
      sessions.reduce((sum, s) => sum + (s.durationSecs || 0), 0) / totalSessions
    );

    // Group by scenario type
    const byScenarioType: Record<string, { count: number; avgScore: number }> = {};
    sessions.forEach((s) => {
      const type = s.scenario.type;
      if (!byScenarioType[type]) {
        byScenarioType[type] = { count: 0, avgScore: 0 };
      }
      byScenarioType[type].count++;
      byScenarioType[type].avgScore += s.overallScore || 0;
    });
    Object.keys(byScenarioType).forEach((type) => {
      byScenarioType[type].avgScore = Math.round(
        byScenarioType[type].avgScore / byScenarioType[type].count
      );
    });

    // Group by difficulty
    const byDifficulty: Record<string, { count: number; avgScore: number }> = {};
    sessions.forEach((s) => {
      const diff = s.scenario.difficulty;
      if (!byDifficulty[diff]) {
        byDifficulty[diff] = { count: 0, avgScore: 0 };
      }
      byDifficulty[diff].count++;
      byDifficulty[diff].avgScore += s.overallScore || 0;
    });
    Object.keys(byDifficulty).forEach((diff) => {
      byDifficulty[diff].avgScore = Math.round(
        byDifficulty[diff].avgScore / byDifficulty[diff].count
      );
    });

    return {
      totalSessions,
      averageScore,
      scoreBreakdown,
      outcomeRate,
      averageDuration,
      byScenarioType,
      byDifficulty,
    };
  }),
});
