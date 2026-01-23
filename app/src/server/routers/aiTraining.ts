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

// ============================================
// US-365: Real-time Practice Feedback Types
// ============================================

interface DetailedAnalysis {
  overall: {
    score: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    summary: string;
  };
  categories: {
    tone: CategoryAnalysis;
    empathy: CategoryAnalysis;
    scriptAdherence: CategoryAnalysis;
    timing: CategoryAnalysis;
    problemSolving: CategoryAnalysis;
    professionalism: CategoryAnalysis;
  };
  missedOpportunities: MissedOpportunity[];
  alternativeResponses: AlternativeResponse[];
  idealComparison: IdealComparison;
  strengthsAndImprovements: {
    strengths: StrengthItem[];
    improvements: ImprovementItem[];
  };
  conversationFlow: ConversationFlowAnalysis;
  recommendedPractice: string[];
}

interface CategoryAnalysis {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  observations: string[];
  keyMoments: {
    timestamp: number;
    description: string;
    impact: 'positive' | 'negative' | 'neutral';
  }[];
  improvementTips: string[];
}

interface MissedOpportunity {
  timestamp: number;
  userMessage: string;
  missedAction: string;
  betterApproach: string;
  impact: 'minor' | 'moderate' | 'significant';
  category: 'empathy' | 'resolution' | 'information' | 'rapport' | 'upsell';
}

interface AlternativeResponse {
  originalMessage: string;
  timestamp: number;
  alternatives: {
    text: string;
    reasoning: string;
    expectedImpact: string;
  }[];
}

interface IdealComparison {
  overallAlignment: number; // 0-100
  keyDifferences: {
    aspect: string;
    userApproach: string;
    idealApproach: string;
    alignmentScore: number;
  }[];
  matchedKeyPhrases: string[];
  missedKeyPhrases: string[];
  usedAvoidPhrases: string[];
}

interface StrengthItem {
  category: string;
  description: string;
  example?: string;
  timestamp?: number;
}

interface ImprovementItem {
  category: string;
  description: string;
  suggestion: string;
  priority: 'low' | 'medium' | 'high';
  practiceResource?: string;
}

interface ConversationFlowAnalysis {
  phases: {
    name: string;
    startTimestamp: number;
    endTimestamp: number;
    quality: 'excellent' | 'good' | 'fair' | 'poor';
    notes: string;
  }[];
  transitions: {
    from: string;
    to: string;
    smooth: boolean;
    notes: string;
  }[];
  pacing: 'too_fast' | 'appropriate' | 'too_slow';
  callControl: 'user_led' | 'balanced' | 'customer_led';
}

// ============================================
// US-365: Feedback Analysis Helpers
// ============================================

function getScoreGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function analyzeTone(
  conversationHistory: ConversationMessage[],
  userMessages: string[]
): CategoryAnalysis {
  const allText = userMessages.join(' ').toLowerCase();

  // Check for positive tone indicators
  const positiveIndicators = [
    'please', 'thank you', 'thanks', 'appreciate', 'certainly',
    'happy to', 'glad to', 'of course', 'absolutely', 'wonderful'
  ];
  const positiveCount = positiveIndicators.filter(p => allText.includes(p)).length;

  // Check for negative tone indicators
  const negativeIndicators = [
    'no', 'can\'t', 'won\'t', 'don\'t', 'unfortunately',
    'sorry but', 'that\'s not', 'you need to', 'you have to'
  ];
  const negativeCount = negativeIndicators.filter(n => allText.includes(n)).length;

  // Calculate base score
  let score = 70 + (positiveCount * 5) - (negativeCount * 8);
  score = Math.min(100, Math.max(0, score));

  const observations: string[] = [];
  const keyMoments: CategoryAnalysis['keyMoments'] = [];
  const improvementTips: string[] = [];

  if (positiveCount >= 3) {
    observations.push('Consistent use of polite and professional language');
  } else if (positiveCount === 0) {
    observations.push('Limited use of courteous phrases');
    improvementTips.push('Try incorporating phrases like "certainly" and "happy to help"');
  }

  if (negativeCount > 2) {
    observations.push('Multiple instances of negative framing detected');
    improvementTips.push('Reframe negative responses positively - instead of "I can\'t do that", try "Here\'s what I can do"');
  }

  // Find specific moments
  conversationHistory.forEach((msg, idx) => {
    if (msg.role === 'user') {
      const lower = msg.content.toLowerCase();
      if (positiveIndicators.some(p => lower.includes(p))) {
        keyMoments.push({
          timestamp: msg.timestamp,
          description: 'Positive professional tone',
          impact: 'positive'
        });
      }
      if (negativeIndicators.filter(n => lower.includes(n)).length > 1) {
        keyMoments.push({
          timestamp: msg.timestamp,
          description: 'Potentially defensive or negative framing',
          impact: 'negative'
        });
      }
    }
  });

  return {
    score,
    grade: getScoreGrade(score),
    observations,
    keyMoments: keyMoments.slice(0, 5), // Limit to 5 moments
    improvementTips
  };
}

function analyzeEmpathy(
  conversationHistory: ConversationMessage[],
  userMessages: string[],
  aiMessages: string[]
): CategoryAnalysis {
  const allText = userMessages.join(' ').toLowerCase();

  // Empathy phrases
  const empathyPhrases = [
    'i understand', 'i can see', 'that must be', 'i hear you',
    'i\'m sorry to hear', 'i appreciate', 'i know', 'you\'re right',
    'that sounds', 'it sounds like', 'i can imagine'
  ];
  const empathyCount = empathyPhrases.filter(p => allText.includes(p)).length;

  // Check if user acknowledged customer emotions
  const emotionalAcknowledgment = [
    'frustrating', 'difficult', 'worried', 'concerned', 'upset',
    'stressful', 'confusing', 'overwhelming'
  ];
  const emotionalCount = emotionalAcknowledgment.filter(e => allText.includes(e)).length;

  let score = 60 + (empathyCount * 10) + (emotionalCount * 5);
  score = Math.min(100, Math.max(0, score));

  const observations: string[] = [];
  const keyMoments: CategoryAnalysis['keyMoments'] = [];
  const improvementTips: string[] = [];

  if (empathyCount >= 2) {
    observations.push('Good use of empathetic language');
  } else if (empathyCount === 0) {
    observations.push('Limited empathetic acknowledgment');
    improvementTips.push('Try using phrases like "I understand how you feel" or "I can see why that would be frustrating"');
  }

  // Check if user responded to AI emotional states
  const aiEmotions = aiMessages.some(m =>
    m.toLowerCase().includes('frustrated') ||
    m.toLowerCase().includes('worried') ||
    m.toLowerCase().includes('upset')
  );

  if (aiEmotions && emotionalCount === 0) {
    observations.push('Customer expressed emotional distress that wasn\'t directly acknowledged');
    improvementTips.push('When a customer expresses frustration or worry, acknowledge their feelings before offering solutions');
    score -= 10;
  }

  conversationHistory.forEach((msg) => {
    if (msg.role === 'user') {
      const lower = msg.content.toLowerCase();
      if (empathyPhrases.some(p => lower.includes(p))) {
        keyMoments.push({
          timestamp: msg.timestamp,
          description: 'Demonstrated empathy',
          impact: 'positive'
        });
      }
    }
  });

  return {
    score: Math.max(0, score),
    grade: getScoreGrade(Math.max(0, score)),
    observations,
    keyMoments: keyMoments.slice(0, 5),
    improvementTips
  };
}

function analyzeScriptAdherence(
  userMessages: string[],
  keyPhrases: string[],
  avoidPhrases: string[]
): CategoryAnalysis {
  const allText = userMessages.join(' ').toLowerCase();

  const matchedPhrases = keyPhrases.filter(p => allText.includes(p.toLowerCase()));
  const usedAvoidPhrases = avoidPhrases.filter(p => allText.includes(p.toLowerCase()));

  const keyPhraseRatio = keyPhrases.length > 0
    ? matchedPhrases.length / keyPhrases.length
    : 1;

  let score = Math.round(60 + (keyPhraseRatio * 30) - (usedAvoidPhrases.length * 10));
  score = Math.min(100, Math.max(0, score));

  const observations: string[] = [];
  const improvementTips: string[] = [];

  if (matchedPhrases.length > 0) {
    observations.push(`Used ${matchedPhrases.length} of ${keyPhrases.length} key phrases`);
  }

  if (keyPhrases.length > 0 && matchedPhrases.length < keyPhrases.length / 2) {
    const missed = keyPhrases.filter(p => !allText.includes(p.toLowerCase()));
    improvementTips.push(`Try incorporating these key phrases: ${missed.slice(0, 3).join(', ')}`);
  }

  if (usedAvoidPhrases.length > 0) {
    observations.push(`Used ${usedAvoidPhrases.length} phrases that should be avoided`);
    improvementTips.push(`Avoid using: ${usedAvoidPhrases.join(', ')}`);
  }

  return {
    score,
    grade: getScoreGrade(score),
    observations,
    keyMoments: [],
    improvementTips
  };
}

function analyzeTiming(
  conversationHistory: ConversationMessage[],
  targetDuration: number,
  actualDuration: number
): CategoryAnalysis {
  const observations: string[] = [];
  const keyMoments: CategoryAnalysis['keyMoments'] = [];
  const improvementTips: string[] = [];

  // Calculate response times
  const responseTimes: number[] = [];
  for (let i = 1; i < conversationHistory.length; i++) {
    if (conversationHistory[i].role === 'user' && conversationHistory[i - 1].role === 'ai') {
      const responseTime = conversationHistory[i].timestamp - conversationHistory[i - 1].timestamp;
      responseTimes.push(responseTime);
    }
  }

  const avgResponseTime = responseTimes.length > 0
    ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
    : 0;

  // Evaluate duration
  const durationRatio = actualDuration / targetDuration;
  let score = 100;

  if (durationRatio < 0.5) {
    score -= 30;
    observations.push('Call was significantly shorter than expected');
    improvementTips.push('Ensure all customer concerns are fully addressed before ending the call');
  } else if (durationRatio > 2) {
    score -= 30;
    observations.push('Call duration exceeded expected time significantly');
    improvementTips.push('Work on being more concise while still being helpful');
  } else if (durationRatio > 1.5) {
    score -= 15;
    observations.push('Call ran longer than target duration');
  } else if (durationRatio >= 0.8 && durationRatio <= 1.2) {
    observations.push('Call duration was within target range');
  }

  // Evaluate response times
  if (avgResponseTime > 10) {
    score -= 20;
    observations.push('Long pauses between responses may indicate hesitation');
    improvementTips.push('Practice common scenarios to improve response confidence');
  } else if (avgResponseTime < 2 && responseTimes.length > 2) {
    score -= 10;
    observations.push('Very quick responses may not allow time for active listening');
    improvementTips.push('Take a moment to fully process what the customer said before responding');
  } else if (avgResponseTime >= 2 && avgResponseTime <= 6) {
    observations.push('Response timing was appropriate - not rushed, not delayed');
  }

  // Find specific timing issues
  responseTimes.forEach((time, idx) => {
    if (time > 15) {
      keyMoments.push({
        timestamp: conversationHistory[idx * 2 + 1]?.timestamp || 0,
        description: 'Long pause before responding',
        impact: 'negative'
      });
    }
  });

  return {
    score: Math.max(0, score),
    grade: getScoreGrade(Math.max(0, score)),
    observations,
    keyMoments: keyMoments.slice(0, 3),
    improvementTips
  };
}

function analyzeProblemSolving(
  conversationHistory: ConversationMessage[],
  expectedOutcomes: string[],
  userMessages: string[]
): CategoryAnalysis {
  const allText = userMessages.join(' ').toLowerCase();

  // Check for solution-oriented language
  const solutionPhrases = [
    'let me', 'i can', 'we can', 'here\'s what', 'option',
    'suggest', 'recommend', 'how about', 'would you like',
    'i\'ll', 'we\'ll', 'schedule', 'book', 'arrange'
  ];
  const solutionCount = solutionPhrases.filter(p => allText.includes(p)).length;

  // Check if outcomes were addressed
  const outcomesAddressed = expectedOutcomes.filter(outcome =>
    allText.includes(outcome.toLowerCase().split(' ')[0])
  );

  const outcomeRatio = expectedOutcomes.length > 0
    ? outcomesAddressed.length / expectedOutcomes.length
    : 1;

  let score = 50 + (solutionCount * 8) + (outcomeRatio * 30);
  score = Math.min(100, Math.max(0, score));

  const observations: string[] = [];
  const improvementTips: string[] = [];

  if (solutionCount >= 3) {
    observations.push('Consistently offered solutions and options');
  } else if (solutionCount === 0) {
    observations.push('Limited proactive solution offering');
    improvementTips.push('Focus on what you CAN do, not what you can\'t');
  }

  if (outcomeRatio >= 0.8) {
    observations.push('Successfully addressed main customer concerns');
  } else if (outcomeRatio < 0.5) {
    observations.push('Some key customer needs may have been left unaddressed');
    improvementTips.push('Review the expected outcomes and ensure each is addressed');
  }

  return {
    score,
    grade: getScoreGrade(score),
    observations,
    keyMoments: [],
    improvementTips
  };
}

function analyzeProfessionalism(
  conversationHistory: ConversationMessage[],
  userMessages: string[]
): CategoryAnalysis {
  const allText = userMessages.join(' ').toLowerCase();

  // Professional indicators
  const professionalPhrases = [
    'certainly', 'absolutely', 'of course', 'i\'d be happy',
    'thank you for', 'is there anything else', 'have a great day',
    'please', 'my pleasure'
  ];
  const profCount = professionalPhrases.filter(p => allText.includes(p)).length;

  // Unprofessional indicators
  const unprofessionalPhrases = [
    'yeah', 'nope', 'uh', 'um', 'like', 'basically',
    'whatever', 'i guess', 'kinda', 'sorta'
  ];
  const unprofCount = unprofessionalPhrases.filter(p => allText.includes(p)).length;

  let score = 75 + (profCount * 5) - (unprofCount * 8);
  score = Math.min(100, Math.max(0, score));

  const observations: string[] = [];
  const improvementTips: string[] = [];

  if (profCount >= 3) {
    observations.push('Maintained professional language throughout');
  }

  if (unprofCount > 2) {
    observations.push('Casual language may undermine professional image');
    improvementTips.push('Replace casual fillers like "yeah" and "um" with professional alternatives');
  }

  // Check greeting and closing
  const hasProperGreeting = userMessages.length > 0 &&
    (userMessages[0].toLowerCase().includes('hello') ||
     userMessages[0].toLowerCase().includes('hi') ||
     userMessages[0].toLowerCase().includes('good'));

  const lastMessage = userMessages[userMessages.length - 1]?.toLowerCase() || '';
  const hasProperClosing =
    lastMessage.includes('thank') ||
    lastMessage.includes('have a') ||
    lastMessage.includes('take care') ||
    lastMessage.includes('goodbye');

  if (hasProperGreeting) {
    observations.push('Proper professional greeting');
  } else {
    improvementTips.push('Start with a warm, professional greeting');
    score -= 5;
  }

  if (hasProperClosing) {
    observations.push('Professional call closing');
  } else {
    improvementTips.push('End calls with a professional closing and offer for further assistance');
    score -= 5;
  }

  return {
    score: Math.max(0, score),
    grade: getScoreGrade(Math.max(0, score)),
    observations,
    keyMoments: [],
    improvementTips
  };
}

function findMissedOpportunities(
  conversationHistory: ConversationMessage[],
  expectedOutcomes: string[]
): MissedOpportunity[] {
  const opportunities: MissedOpportunity[] = [];

  conversationHistory.forEach((msg, idx) => {
    if (msg.role === 'ai' && idx < conversationHistory.length - 1) {
      const aiMsg = msg.content.toLowerCase();
      const userResponse = conversationHistory[idx + 1];

      if (!userResponse || userResponse.role !== 'user') return;

      const userMsg = userResponse.content.toLowerCase();

      // Check for empathy opportunities
      if ((aiMsg.includes('frustrated') || aiMsg.includes('worried') || aiMsg.includes('upset')) &&
          !userMsg.includes('understand') && !userMsg.includes('sorry')) {
        opportunities.push({
          timestamp: userResponse.timestamp,
          userMessage: userResponse.content.substring(0, 100),
          missedAction: 'Acknowledge customer emotion',
          betterApproach: 'When a customer expresses frustration, acknowledge their feelings: "I completely understand your frustration..."',
          impact: 'moderate',
          category: 'empathy'
        });
      }

      // Check for information gathering opportunities
      if (aiMsg.includes('?') && userMsg.length < 30 && !userMsg.includes('?')) {
        opportunities.push({
          timestamp: userResponse.timestamp,
          userMessage: userResponse.content.substring(0, 100),
          missedAction: 'Ask follow-up question',
          betterApproach: 'Gather more information to better understand the customer\'s needs',
          impact: 'minor',
          category: 'information'
        });
      }

      // Check for rapport building opportunities
      if (idx === 0 && !userMsg.includes('how are you') && !userMsg.includes('good to hear')) {
        opportunities.push({
          timestamp: userResponse.timestamp,
          userMessage: userResponse.content.substring(0, 100),
          missedAction: 'Build rapport',
          betterApproach: 'Start with a brief rapport-building moment: "Thank you for calling! How can I help you today?"',
          impact: 'minor',
          category: 'rapport'
        });
      }
    }
  });

  return opportunities.slice(0, 5);
}

function generateAlternativeResponses(
  conversationHistory: ConversationMessage[],
  keyPhrases: string[]
): AlternativeResponse[] {
  const alternatives: AlternativeResponse[] = [];

  conversationHistory.forEach((msg, idx) => {
    if (msg.role === 'user' && idx > 0) {
      const userMsg = msg.content;
      const aiMsg = conversationHistory[idx - 1];

      if (!aiMsg || aiMsg.role !== 'ai') return;

      const aiContent = aiMsg.content.toLowerCase();

      // Generate alternatives for responses that could be improved
      const userLower = userMsg.toLowerCase();

      // If response is very short
      if (userMsg.length < 50) {
        const relevantKeyPhrases = keyPhrases.filter(p =>
          !userLower.includes(p.toLowerCase())
        ).slice(0, 2);

        if (relevantKeyPhrases.length > 0) {
          alternatives.push({
            originalMessage: userMsg,
            timestamp: msg.timestamp,
            alternatives: [
              {
                text: `${userMsg} ${relevantKeyPhrases[0]}`,
                reasoning: 'Incorporate key phrases for better script adherence',
                expectedImpact: 'Higher customer satisfaction and compliance with best practices'
              }
            ]
          });
        }
      }

      // If response lacks empathy
      if (aiContent.includes('problem') || aiContent.includes('issue')) {
        if (!userLower.includes('understand') && !userLower.includes('sorry')) {
          alternatives.push({
            originalMessage: userMsg,
            timestamp: msg.timestamp,
            alternatives: [
              {
                text: `I understand that can be frustrating. ${userMsg}`,
                reasoning: 'Lead with empathy before providing solutions',
                expectedImpact: 'Customer feels heard and validated'
              }
            ]
          });
        }
      }
    }
  });

  return alternatives.slice(0, 3);
}

function compareToIdeal(
  userMessages: string[],
  keyPhrases: string[],
  avoidPhrases: string[],
  idealResponse: string | null
): IdealComparison {
  const allText = userMessages.join(' ').toLowerCase();

  const matchedKeyPhrases = keyPhrases.filter(p => allText.includes(p.toLowerCase()));
  const missedKeyPhrases = keyPhrases.filter(p => !allText.includes(p.toLowerCase()));
  const usedAvoidPhrases = avoidPhrases.filter(p => allText.includes(p.toLowerCase()));

  const keyDifferences: IdealComparison['keyDifferences'] = [];

  // Assess key phrase alignment
  const keyPhraseAlignment = keyPhrases.length > 0
    ? (matchedKeyPhrases.length / keyPhrases.length) * 100
    : 100;

  keyDifferences.push({
    aspect: 'Key Phrases Usage',
    userApproach: `Used ${matchedKeyPhrases.length} of ${keyPhrases.length} key phrases`,
    idealApproach: 'Use all recommended key phrases naturally in conversation',
    alignmentScore: Math.round(keyPhraseAlignment)
  });

  // Assess avoid phrases
  const avoidPhraseAlignment = avoidPhrases.length > 0
    ? ((avoidPhrases.length - usedAvoidPhrases.length) / avoidPhrases.length) * 100
    : 100;

  keyDifferences.push({
    aspect: 'Avoided Phrases',
    userApproach: usedAvoidPhrases.length > 0
      ? `Used ${usedAvoidPhrases.length} phrases to avoid`
      : 'Successfully avoided all negative phrases',
    idealApproach: 'Avoid all discouraged phrases',
    alignmentScore: Math.round(avoidPhraseAlignment)
  });

  // Calculate overall alignment
  const overallAlignment = Math.round((keyPhraseAlignment + avoidPhraseAlignment) / 2);

  return {
    overallAlignment,
    keyDifferences,
    matchedKeyPhrases,
    missedKeyPhrases,
    usedAvoidPhrases
  };
}

function analyzeConversationFlow(
  conversationHistory: ConversationMessage[],
  targetDuration: number
): ConversationFlowAnalysis {
  const phases: ConversationFlowAnalysis['phases'] = [];
  const transitions: ConversationFlowAnalysis['transitions'] = [];

  // Identify conversation phases
  const totalMessages = conversationHistory.length;
  const greetingEnd = Math.min(2, totalMessages);
  const mainEnd = Math.max(greetingEnd, totalMessages - 2);

  if (greetingEnd > 0) {
    phases.push({
      name: 'Greeting',
      startTimestamp: conversationHistory[0]?.timestamp || 0,
      endTimestamp: conversationHistory[greetingEnd - 1]?.timestamp || 0,
      quality: 'good',
      notes: 'Opening of the conversation'
    });
  }

  if (mainEnd > greetingEnd) {
    phases.push({
      name: 'Main Issue',
      startTimestamp: conversationHistory[greetingEnd]?.timestamp || 0,
      endTimestamp: conversationHistory[mainEnd - 1]?.timestamp || 0,
      quality: 'good',
      notes: 'Core of the conversation addressing customer needs'
    });
  }

  if (totalMessages > mainEnd) {
    phases.push({
      name: 'Closing',
      startTimestamp: conversationHistory[mainEnd]?.timestamp || 0,
      endTimestamp: conversationHistory[totalMessages - 1]?.timestamp || 0,
      quality: 'good',
      notes: 'Wrapping up the conversation'
    });
  }

  // Analyze transitions
  if (phases.length >= 2) {
    transitions.push({
      from: 'Greeting',
      to: 'Main Issue',
      smooth: true,
      notes: 'Transition to addressing customer concern'
    });
  }

  if (phases.length >= 3) {
    transitions.push({
      from: 'Main Issue',
      to: 'Closing',
      smooth: true,
      notes: 'Transition to call conclusion'
    });
  }

  // Determine pacing
  const lastTimestamp = conversationHistory[conversationHistory.length - 1]?.timestamp || 0;
  const pacing: ConversationFlowAnalysis['pacing'] =
    lastTimestamp < targetDuration * 0.5 ? 'too_fast' :
    lastTimestamp > targetDuration * 1.5 ? 'too_slow' : 'appropriate';

  // Determine call control
  const userMessages = conversationHistory.filter(m => m.role === 'user').length;
  const aiMessages = conversationHistory.filter(m => m.role === 'ai').length;
  const callControl: ConversationFlowAnalysis['callControl'] =
    userMessages > aiMessages * 1.2 ? 'user_led' :
    aiMessages > userMessages * 1.2 ? 'customer_led' : 'balanced';

  return {
    phases,
    transitions,
    pacing,
    callControl
  };
}

function generateDetailedAnalysis(
  conversationHistory: ConversationMessage[],
  scenario: {
    expectedOutcomes: string[];
    keyPhrases: string[];
    avoidPhrases: string[];
    targetDurationSecs: number;
    idealResponse: string | null;
  },
  durationSecs: number
): DetailedAnalysis {
  const userMessages = conversationHistory
    .filter(m => m.role === 'user')
    .map(m => m.content);

  const aiMessages = conversationHistory
    .filter(m => m.role === 'ai')
    .map(m => m.content);

  // Analyze each category
  const tone = analyzeTone(conversationHistory, userMessages);
  const empathy = analyzeEmpathy(conversationHistory, userMessages, aiMessages);
  const scriptAdherence = analyzeScriptAdherence(userMessages, scenario.keyPhrases, scenario.avoidPhrases);
  const timing = analyzeTiming(conversationHistory, scenario.targetDurationSecs, durationSecs);
  const problemSolving = analyzeProblemSolving(conversationHistory, scenario.expectedOutcomes, userMessages);
  const professionalism = analyzeProfessionalism(conversationHistory, userMessages);

  // Calculate overall score
  const overallScore = Math.round(
    (tone.score * 0.15) +
    (empathy.score * 0.20) +
    (scriptAdherence.score * 0.20) +
    (timing.score * 0.15) +
    (problemSolving.score * 0.15) +
    (professionalism.score * 0.15)
  );

  // Compile strengths and improvements
  const strengths: StrengthItem[] = [];
  const improvements: ImprovementItem[] = [];

  const categories = { tone, empathy, scriptAdherence, timing, problemSolving, professionalism };
  Object.entries(categories).forEach(([name, analysis]) => {
    if (analysis.score >= 80) {
      analysis.observations.forEach(obs => {
        strengths.push({
          category: name,
          description: obs
        });
      });
    }
    if (analysis.score < 70) {
      analysis.improvementTips.forEach(tip => {
        improvements.push({
          category: name,
          description: `${name}: needs improvement`,
          suggestion: tip,
          priority: analysis.score < 50 ? 'high' : 'medium'
        });
      });
    }
  });

  // Generate recommended practice based on lowest scores
  const recommendedPractice: string[] = [];
  const sortedCategories = Object.entries(categories)
    .sort(([, a], [, b]) => a.score - b.score);

  sortedCategories.slice(0, 2).forEach(([name]) => {
    recommendedPractice.push(`Practice scenarios focused on ${name.replace(/([A-Z])/g, ' $1').toLowerCase().trim()}`);
  });

  return {
    overall: {
      score: overallScore,
      grade: getScoreGrade(overallScore),
      summary: `Overall performance: ${getScoreGrade(overallScore)} (${overallScore}/100). ` +
        `${strengths.length > 0 ? 'Key strengths in ' + strengths.slice(0, 2).map(s => s.category).join(', ') + '. ' : ''}` +
        `${improvements.length > 0 ? 'Focus on improving ' + improvements.slice(0, 2).map(i => i.category).join(', ') + '.' : ''}`
    },
    categories: {
      tone,
      empathy,
      scriptAdherence,
      timing,
      problemSolving,
      professionalism
    },
    missedOpportunities: findMissedOpportunities(conversationHistory, scenario.expectedOutcomes),
    alternativeResponses: generateAlternativeResponses(conversationHistory, scenario.keyPhrases),
    idealComparison: compareToIdeal(userMessages, scenario.keyPhrases, scenario.avoidPhrases, scenario.idealResponse),
    strengthsAndImprovements: {
      strengths,
      improvements
    },
    conversationFlow: analyzeConversationFlow(conversationHistory, scenario.targetDurationSecs),
    recommendedPractice
  };
}

/**
 * Get training resources for a specific feedback category
 */
function getCategoryTrainingResources(category: string): {
  title: string;
  description: string;
  moduleType: string;
  practiceScenarios: string[];
}[] {
  const resources: Record<string, {
    title: string;
    description: string;
    moduleType: string;
    practiceScenarios: string[];
  }[]> = {
    TONE: [
      {
        title: 'Professional Communication Fundamentals',
        description: 'Learn the basics of maintaining a professional tone in all patient interactions.',
        moduleType: 'SKILL_BUILDING',
        practiceScenarios: ['SCHEDULING_CALL', 'BILLING_INQUIRY']
      },
      {
        title: 'Positive Language Techniques',
        description: 'Transform negative phrases into positive, solution-focused language.',
        moduleType: 'SKILL_BUILDING',
        practiceScenarios: ['COMPLAINT_HANDLING', 'CANCELLATION']
      }
    ],
    EMPATHY: [
      {
        title: 'Active Listening Skills',
        description: 'Develop skills to truly hear and acknowledge patient concerns.',
        moduleType: 'SKILL_BUILDING',
        practiceScenarios: ['COMPLAINT_HANDLING', 'EMERGENCY_TRIAGE']
      },
      {
        title: 'Emotional Intelligence in Healthcare',
        description: 'Understand and respond appropriately to patient emotions.',
        moduleType: 'SKILL_BUILDING',
        practiceScenarios: ['COMPLAINT_HANDLING', 'FOLLOW_UP_CALL']
      }
    ],
    SCRIPT_ADHERENCE: [
      {
        title: 'Call Script Mastery',
        description: 'Learn to follow scripts while maintaining natural conversation flow.',
        moduleType: 'SCRIPT_TRAINING',
        practiceScenarios: ['SCHEDULING_CALL', 'NEW_PATIENT_INTAKE']
      },
      {
        title: 'Key Phrase Integration',
        description: 'Practice incorporating required phrases naturally.',
        moduleType: 'SCRIPT_TRAINING',
        practiceScenarios: ['INSURANCE_QUESTIONS', 'BILLING_INQUIRY']
      }
    ],
    RESPONSE_TIME: [
      {
        title: 'Efficient Call Handling',
        description: 'Balance thoroughness with efficiency in patient calls.',
        moduleType: 'SKILL_BUILDING',
        practiceScenarios: ['SCHEDULING_CALL', 'CANCELLATION']
      },
      {
        title: 'Managing Call Duration',
        description: 'Techniques for keeping calls focused without rushing.',
        moduleType: 'SKILL_BUILDING',
        practiceScenarios: ['BILLING_INQUIRY', 'INSURANCE_QUESTIONS']
      }
    ],
    PROBLEM_SOLVING: [
      {
        title: 'Solution-Oriented Communication',
        description: 'Focus on what can be done rather than limitations.',
        moduleType: 'SKILL_BUILDING',
        practiceScenarios: ['COMPLAINT_HANDLING', 'BILLING_INQUIRY']
      },
      {
        title: 'Quick Thinking for Common Issues',
        description: 'Develop rapid response strategies for frequent patient concerns.',
        moduleType: 'SKILL_BUILDING',
        practiceScenarios: ['EMERGENCY_TRIAGE', 'CANCELLATION']
      }
    ],
    PROFESSIONALISM: [
      {
        title: 'Professional Image Training',
        description: 'Maintain a consistent professional presence in all interactions.',
        moduleType: 'SKILL_BUILDING',
        practiceScenarios: ['NEW_PATIENT_INTAKE', 'COMPLAINT_HANDLING']
      },
      {
        title: 'Opening and Closing Excellence',
        description: 'Master the art of professional greetings and call closings.',
        moduleType: 'SKILL_BUILDING',
        practiceScenarios: ['SCHEDULING_CALL', 'FOLLOW_UP_CALL']
      }
    ],
    KNOWLEDGE: [
      {
        title: 'Practice Policies and Procedures',
        description: 'Deep dive into office policies and common patient questions.',
        moduleType: 'COMPLIANCE',
        practiceScenarios: ['INSURANCE_QUESTIONS', 'BILLING_INQUIRY']
      }
    ],
    COMMUNICATION: [
      {
        title: 'Clear Communication Techniques',
        description: 'Learn to communicate complex information simply and clearly.',
        moduleType: 'SKILL_BUILDING',
        practiceScenarios: ['INSURANCE_QUESTIONS', 'NEW_PATIENT_INTAKE']
      }
    ]
  };

  return resources[category] || [];
}

// ============================================
// US-366: Onboarding Workflow Helpers
// ============================================

/**
 * Notify managers when a module is completed
 */
async function notifyManagersOnCompletion(
  ctx: { user: { id: string; organizationId: string; firstName?: string; lastName?: string }; prisma: typeof import('@prisma/client').PrismaClient.prototype },
  moduleName: string,
  score: number | null
): Promise<void> {
  // Get managers (ADMIN and OWNER roles)
  const managers = await ctx.prisma.user.findMany({
    where: {
      organizationId: ctx.user.organizationId,
      role: { in: ['ADMIN', 'OWNER'] },
      id: { not: ctx.user.id },
    },
    select: { id: true, email: true, firstName: true },
  });

  // Create notification records (using audit log for now, could be expanded to actual notifications)
  for (const manager of managers) {
    await ctx.prisma.auditLog.create({
      data: {
        action: 'ONBOARDING_MODULE_COMPLETED_NOTIFICATION',
        userId: manager.id,
        organizationId: ctx.user.organizationId,
        entityType: 'notification',
        entityId: ctx.user.id,
        changes: {
          type: 'module_completion',
          completedBy: ctx.user.id,
          completedByName: `${ctx.user.firstName || ''} ${ctx.user.lastName || ''}`.trim() || 'Staff Member',
          moduleName,
          score,
          timestamp: new Date().toISOString(),
        },
      },
    });
  }
}

/**
 * Notify managers when all onboarding is complete
 */
async function notifyManagersOnOnboardingComplete(
  ctx: { user: { id: string; organizationId: string; firstName?: string; lastName?: string }; prisma: typeof import('@prisma/client').PrismaClient.prototype }
): Promise<void> {
  // Get managers
  const managers = await ctx.prisma.user.findMany({
    where: {
      organizationId: ctx.user.organizationId,
      role: { in: ['ADMIN', 'OWNER'] },
      id: { not: ctx.user.id },
    },
    select: { id: true, email: true },
  });

  // Get completion stats
  const progress = await ctx.prisma.trainingProgress.findMany({
    where: {
      userId: ctx.user.id,
      module: { type: 'ONBOARDING' },
    },
    select: {
      score: true,
      startedAt: true,
      completedAt: true,
    },
  });

  const avgScore = Math.round(
    progress.reduce((sum, p) => sum + (p.score || 0), 0) / progress.length
  );

  const startDate = progress[0]?.startedAt;
  const endDate = progress[progress.length - 1]?.completedAt;
  const daysToComplete = startDate && endDate
    ? Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Create notification records
  for (const manager of managers) {
    await ctx.prisma.auditLog.create({
      data: {
        action: 'ONBOARDING_COMPLETE_NOTIFICATION',
        userId: manager.id,
        organizationId: ctx.user.organizationId,
        entityType: 'notification',
        entityId: ctx.user.id,
        changes: {
          type: 'onboarding_complete',
          completedBy: ctx.user.id,
          completedByName: `${ctx.user.firstName || ''} ${ctx.user.lastName || ''}`.trim() || 'Staff Member',
          averageScore: avgScore,
          daysToComplete,
          modulesCompleted: progress.length,
          timestamp: new Date().toISOString(),
        },
      },
    });
  }
}

// ============================================
// US-367: Script Training Helpers
// ============================================

type MasteryLevel = 'NOVICE' | 'LEARNING' | 'COMPETENT' | 'PROFICIENT' | 'MASTER';

/**
 * Calculate mastery level based on practice count and score
 */
function getMasteryLevel(practiceCount: number, avgScore: number): MasteryLevel {
  if (practiceCount === 0) return 'NOVICE';
  if (practiceCount < 3) return 'LEARNING';
  if (avgScore < 60) return 'LEARNING';
  if (avgScore < 75) return 'COMPETENT';
  if (avgScore < 90) return 'PROFICIENT';
  return 'MASTER';
}

/**
 * Calculate progress to next mastery level
 */
function calculateProgressToNextLevel(scores: { scriptAdherenceScore: number | null }[]): {
  currentLevel: MasteryLevel;
  nextLevel: MasteryLevel | null;
  progressPercent: number;
  requirement: string;
} {
  const count = scores.length;
  const avgScore = count > 0
    ? scores.reduce((sum, s) => sum + (s.scriptAdherenceScore || 0), 0) / count
    : 0;
  const currentLevel = getMasteryLevel(count, avgScore);

  const levels: MasteryLevel[] = ['NOVICE', 'LEARNING', 'COMPETENT', 'PROFICIENT', 'MASTER'];
  const currentIndex = levels.indexOf(currentLevel);
  const nextLevel = currentIndex < levels.length - 1 ? levels[currentIndex + 1] : null;

  let progressPercent = 0;
  let requirement = '';

  switch (currentLevel) {
    case 'NOVICE':
      progressPercent = (count / 3) * 100;
      requirement = `Complete ${3 - count} more practice sessions`;
      break;
    case 'LEARNING':
      if (avgScore < 60) {
        progressPercent = (avgScore / 60) * 100;
        requirement = `Improve average score to 60% (currently ${Math.round(avgScore)}%)`;
      } else {
        progressPercent = (avgScore / 75) * 100;
        requirement = `Improve average score to 75% (currently ${Math.round(avgScore)}%)`;
      }
      break;
    case 'COMPETENT':
      progressPercent = ((avgScore - 60) / 15) * 100;
      requirement = `Improve average score to 75% (currently ${Math.round(avgScore)}%)`;
      break;
    case 'PROFICIENT':
      progressPercent = ((avgScore - 75) / 15) * 100;
      requirement = `Improve average score to 90% (currently ${Math.round(avgScore)}%)`;
      break;
    case 'MASTER':
      progressPercent = 100;
      requirement = 'Mastery achieved!';
      break;
  }

  return {
    currentLevel,
    nextLevel,
    progressPercent: Math.min(100, Math.round(progressPercent)),
    requirement,
  };
}

/**
 * Calculate improvement trend over time
 */
function calculateImprovementTrend(scores: { scriptAdherenceScore: number | null; createdAt: Date }[]): {
  trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
  changePercent: number;
  details: string;
} {
  if (scores.length < 4) {
    return { trend: 'STABLE', changePercent: 0, details: 'Need more practice sessions to determine trend' };
  }

  const half = Math.floor(scores.length / 2);
  const firstHalf = scores.slice(0, half);
  const secondHalf = scores.slice(half);

  const firstAvg = firstHalf.reduce((sum, s) => sum + (s.scriptAdherenceScore || 0), 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((sum, s) => sum + (s.scriptAdherenceScore || 0), 0) / secondHalf.length;

  const change = secondAvg - firstAvg;
  const changePercent = Math.round(Math.abs(change));

  if (change > 5) {
    return {
      trend: 'IMPROVING',
      changePercent,
      details: `Average score improved by ${changePercent}% in recent sessions`,
    };
  } else if (change < -5) {
    return {
      trend: 'DECLINING',
      changePercent,
      details: `Average score declined by ${changePercent}% in recent sessions`,
    };
  }

  return {
    trend: 'STABLE',
    changePercent,
    details: 'Performance is consistent across recent sessions',
  };
}

/**
 * Generate guide for key phrases
 */
function generateKeyPhrasesGuide(keyPhrases: string[], type: ScenarioType): {
  phrase: string;
  context: string;
  example: string;
}[] {
  const contextMap: Record<ScenarioType, Record<string, { context: string; example: string }>> = {
    SCHEDULING_CALL: {
      'default': { context: 'Use when booking appointments', example: 'I have an opening at 2pm on Tuesday.' },
    },
    BILLING_INQUIRY: {
      'default': { context: 'Use when explaining charges', example: 'Let me break down these charges for you.' },
    },
    COMPLAINT_HANDLING: {
      'I understand': { context: 'Show empathy for frustration', example: 'I understand how frustrating this must be.' },
      'apologize': { context: 'Take responsibility', example: 'I sincerely apologize for the inconvenience.' },
      'default': { context: 'Use to de-escalate', example: 'I want to make this right for you.' },
    },
    NEW_PATIENT_INTAKE: {
      'default': { context: 'Welcome new patients warmly', example: 'We look forward to seeing you!' },
    },
    CANCELLATION: {
      'default': { context: 'Be understanding about changes', example: 'No problem at all, things come up.' },
    },
    INSURANCE_QUESTIONS: {
      'default': { context: 'Explain coverage clearly', example: 'Your plan covers up to X visits per year.' },
    },
    FOLLOW_UP_CALL: {
      'default': { context: 'Check on patient progress', example: 'How have you been feeling since your last visit?' },
    },
    EMERGENCY_TRIAGE: {
      'default': { context: 'Assess urgency carefully', example: 'Based on your symptoms, we should see you today.' },
    },
  };

  const typeContext = contextMap[type] || {};

  return keyPhrases.map((phrase) => {
    const specific = typeContext[phrase.toLowerCase()];
    const defaultContext = typeContext['default'] || { context: 'Use appropriately', example: phrase };
    return {
      phrase,
      context: specific?.context || defaultContext.context,
      example: specific?.example || `Example: "${phrase}"`,
    };
  });
}

/**
 * Generate guide for phrases to avoid
 */
function generateAvoidPhrasesGuide(avoidPhrases: string[], type: ScenarioType): {
  phrase: string;
  reason: string;
  alternative: string;
}[] {
  const avoidReasons: Record<string, { reason: string; alternative: string }> = {
    "that's not my job": { reason: 'Sounds dismissive', alternative: 'Let me find the right person to help you' },
    "calm down": { reason: 'Can escalate frustration', alternative: 'I understand this is frustrating' },
    "you should have": { reason: 'Sounds blaming', alternative: "Let's focus on how we can help now" },
    "we can't": { reason: 'Sounds negative', alternative: "Here's what we can do" },
    "policy": { reason: 'Sounds bureaucratic', alternative: 'The way we handle this is...' },
    "default": { reason: 'May come across negatively', alternative: 'Consider rephrasing positively' },
  };

  return avoidPhrases.map((phrase) => {
    const specific = avoidReasons[phrase.toLowerCase()] || avoidReasons['default'];
    return {
      phrase,
      reason: specific.reason,
      alternative: specific.alternative,
    };
  });
}

/**
 * Determine recommended difficulty based on user history
 */
async function determineRecommendedDifficulty(
  ctx: { user: { id: string; organizationId: string }; prisma: typeof import('@prisma/client').PrismaClient.prototype },
  scriptId: string
): Promise<DifficultyLevel> {
  const recentSessions = await ctx.prisma.practiceSession.findMany({
    where: {
      userId: ctx.user.id,
      scenarioId: scriptId,
      status: 'COMPLETED',
    },
    orderBy: { endedAt: 'desc' },
    take: 5,
    select: { scriptAdherenceScore: true, scenario: { select: { difficulty: true } } },
  });

  if (recentSessions.length === 0) return 'BEGINNER';

  const avgScore = recentSessions.reduce((sum, s) => sum + (s.scriptAdherenceScore || 0), 0) / recentSessions.length;
  const currentDifficulty = recentSessions[0]?.scenario?.difficulty || 'BEGINNER';

  // Progress to next difficulty if scoring well
  if (avgScore >= 85) {
    const levels: DifficultyLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'];
    const currentIndex = levels.indexOf(currentDifficulty);
    return currentIndex < levels.length - 1 ? levels[currentIndex + 1] : currentDifficulty;
  }

  // Stay at current or drop if struggling
  if (avgScore < 50 && currentDifficulty !== 'BEGINNER') {
    const levels: DifficultyLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'];
    const currentIndex = levels.indexOf(currentDifficulty);
    return currentIndex > 0 ? levels[currentIndex - 1] : currentDifficulty;
  }

  return currentDifficulty;
}

/**
 * Determine conversation phase
 */
function determineConversationPhase(
  transcript: ConversationMessage[],
  scenario: { expectedOutcomes: string[] }
): 'opening' | 'discovery' | 'resolution' | 'closing' {
  const messageCount = transcript.length;
  const userMessages = transcript.filter((m) => m.role === 'user').map((m) => m.content.toLowerCase());
  const allText = userMessages.join(' ');

  // Check for closing indicators
  if (
    allText.includes('anything else') ||
    allText.includes('thank you') ||
    allText.includes('have a great day') ||
    messageCount > 10
  ) {
    return 'closing';
  }

  // Check for resolution indicators
  const hasResolution = scenario.expectedOutcomes.some((outcome) =>
    allText.includes(outcome.toLowerCase().split(' ')[0])
  );
  if (hasResolution) return 'resolution';

  // Check for discovery phase
  if (messageCount > 3) return 'discovery';

  return 'opening';
}

/**
 * Generate AI response for script practice
 */
function generateScriptAIResponse(
  scenario: {
    type: ScenarioType;
    personaName: string;
    personaTraits: string[];
    expectedOutcomes: string[];
  },
  transcript: ConversationMessage[],
  phase: 'opening' | 'discovery' | 'resolution' | 'closing',
  difficulty: DifficultyLevel
): { message: string; emotion: string; scenarioState: 'ongoing' | 'resolved' | 'escalated'; nextExpectedAction: string } {
  const userMessages = transcript.filter((m) => m.role === 'user').map((m) => m.content.toLowerCase());
  const lastUserMessage = userMessages[userMessages.length - 1] || '';

  // Check for empathetic response
  const isEmpathetic = lastUserMessage.includes('understand') ||
    lastUserMessage.includes('sorry') ||
    lastUserMessage.includes('help you');

  let message = '';
  let emotion = 'neutral';
  let scenarioState: 'ongoing' | 'resolved' | 'escalated' = 'ongoing';
  let nextExpectedAction = '';

  switch (phase) {
    case 'opening':
      message = getElaborationMessage(scenario.type, { name: scenario.personaName, traits: scenario.personaTraits } as AIPersona);
      emotion = difficulty === 'ADVANCED' || difficulty === 'EXPERT' ? 'frustrated' : 'calm';
      nextExpectedAction = 'Acknowledge the concern and ask clarifying questions';
      break;

    case 'discovery':
      if (isEmpathetic) {
        message = getPositiveResponseMessage(scenario.type, { name: scenario.personaName } as AIPersona);
        emotion = 'calm';
        nextExpectedAction = 'Continue gathering information and move toward resolution';
      } else {
        message = `I'm not sure you understood what I meant. ${getElaborationMessage(scenario.type, { name: scenario.personaName } as AIPersona)}`;
        emotion = difficulty === 'BEGINNER' ? 'neutral' : 'frustrated';
        nextExpectedAction = 'Show more empathy and acknowledge the concern';
      }
      break;

    case 'resolution':
      message = 'Okay, that sounds good. Is there anything else I need to know?';
      emotion = 'calm';
      scenarioState = 'resolved';
      nextExpectedAction = 'Confirm all details and prepare to close the call';
      break;

    case 'closing':
      message = 'Thank you for your help today!';
      emotion = 'friendly';
      scenarioState = 'resolved';
      nextExpectedAction = 'Close the call professionally';
      break;
  }

  return { message, emotion, scenarioState, nextExpectedAction };
}

/**
 * Get script hints based on phase
 */
function getScriptHints(type: ScenarioType, difficulty: DifficultyLevel, phase: string): string[] {
  if (difficulty === 'ADVANCED' || difficulty === 'EXPERT') return [];

  const hints: Record<string, Record<string, string[]>> = {
    opening: {
      SCHEDULING_CALL: ['Greet warmly', 'Ask about preferred times', 'Confirm contact information'],
      BILLING_INQUIRY: ['Listen actively', 'Ask for bill/invoice number', 'Express willingness to help'],
      COMPLAINT_HANDLING: ['Show empathy immediately', 'Let them express frustration', 'Avoid being defensive'],
      default: ['Greet professionally', 'Identify yourself and the practice', 'Ask how you can help'],
    },
    discovery: {
      SCHEDULING_CALL: ['Offer multiple options', 'Confirm insurance if needed', 'Explain what to bring'],
      BILLING_INQUIRY: ['Explain charges clearly', 'Offer payment plans if available', 'Document the conversation'],
      COMPLAINT_HANDLING: ['Apologize sincerely', 'Take ownership of finding a solution', 'Avoid blaming others'],
      default: ['Ask clarifying questions', 'Summarize understanding', 'Move toward resolution'],
    },
    resolution: {
      default: ['Confirm all details', 'Provide next steps', 'Ask if there are other questions'],
    },
    closing: {
      default: ['Thank them for calling', 'Confirm follow-up if needed', 'End on a positive note'],
    },
  };

  const phaseHints = hints[phase] || hints['opening'];
  return phaseHints[type] || phaseHints['default'] || [];
}

/**
 * Generate real-time feedback during script practice
 */
function generateRealtimeScriptFeedback(
  response: string,
  keyPhrases: string[],
  avoidPhrases: string[],
  keyPhrasesUsed: string[],
  avoidPhrasesUsed: string[]
): {
  type: 'positive' | 'warning' | 'suggestion';
  message: string;
}[] {
  const feedback: { type: 'positive' | 'warning' | 'suggestion'; message: string }[] = [];

  // Positive feedback for key phrases
  if (keyPhrasesUsed.length > 0) {
    feedback.push({
      type: 'positive',
      message: `Great use of key phrase: "${keyPhrasesUsed[0]}"`,
    });
  }

  // Warning for avoid phrases
  if (avoidPhrasesUsed.length > 0) {
    feedback.push({
      type: 'warning',
      message: `Avoid using: "${avoidPhrasesUsed[0]}" - try rephrasing`,
    });
  }

  // Suggestions for unused key phrases
  const unusedKeyPhrases = keyPhrases.filter((p) => !response.toLowerCase().includes(p.toLowerCase()));
  if (unusedKeyPhrases.length > 0 && keyPhrasesUsed.length === 0) {
    feedback.push({
      type: 'suggestion',
      message: `Consider using: "${unusedKeyPhrases[0]}"`,
    });
  }

  // Check for empathy indicators
  const empathyWords = ['understand', 'sorry', 'appreciate', 'help'];
  const hasEmpathy = empathyWords.some((w) => response.toLowerCase().includes(w));
  if (!hasEmpathy && response.length > 50) {
    feedback.push({
      type: 'suggestion',
      message: 'Consider adding empathetic language',
    });
  }

  return feedback;
}

/**
 * Analyze script adherence in detail
 */
function analyzeScriptAdherenceDetailed(
  transcript: ConversationMessage[],
  keyPhrases: string[],
  avoidPhrases: string[],
  expectedOutcomes: string[]
): {
  adherenceScore: number;
  keyPhrasesBreakdown: { phrase: string; used: boolean; count: number; context: string }[];
  avoidPhrasesBreakdown: { phrase: string; used: boolean; count: number; impact: string }[];
  outcomesAchieved: number;
  outcomesBreakdown: { outcome: string; achieved: boolean; evidence: string }[];
} {
  const userMessages = transcript.filter((m) => m.role === 'user').map((m) => m.content.toLowerCase());
  const allUserText = userMessages.join(' ');

  // Analyze key phrases
  const keyPhrasesBreakdown = keyPhrases.map((phrase) => {
    const lowerPhrase = phrase.toLowerCase();
    const used = allUserText.includes(lowerPhrase);
    const count = (allUserText.match(new RegExp(lowerPhrase, 'gi')) || []).length;
    return {
      phrase,
      used,
      count,
      context: used ? 'Used appropriately' : 'Could have been used',
    };
  });

  // Analyze avoid phrases
  const avoidPhrasesBreakdown = avoidPhrases.map((phrase) => {
    const lowerPhrase = phrase.toLowerCase();
    const used = allUserText.includes(lowerPhrase);
    const count = (allUserText.match(new RegExp(lowerPhrase, 'gi')) || []).length;
    return {
      phrase,
      used,
      count,
      impact: used ? 'May have negatively impacted the interaction' : 'Successfully avoided',
    };
  });

  // Analyze outcomes
  const outcomesBreakdown = expectedOutcomes.map((outcome) => {
    const keywords = outcome.toLowerCase().split(' ').filter((w) => w.length > 3);
    const achieved = keywords.some((kw) => allUserText.includes(kw));
    return {
      outcome,
      achieved,
      evidence: achieved ? 'Found related content in conversation' : 'Not clearly addressed',
    };
  });

  // Calculate adherence score
  const keyPhraseScore = (keyPhrasesBreakdown.filter((p) => p.used).length / Math.max(keyPhrases.length, 1)) * 40;
  const avoidPhraseScore = ((avoidPhrases.length - avoidPhrasesBreakdown.filter((p) => p.used).length) / Math.max(avoidPhrases.length, 1)) * 30;
  const outcomeScore = (outcomesBreakdown.filter((o) => o.achieved).length / Math.max(expectedOutcomes.length, 1)) * 30;

  return {
    adherenceScore: Math.round(keyPhraseScore + avoidPhraseScore + outcomeScore),
    keyPhrasesBreakdown,
    avoidPhrasesBreakdown,
    outcomesAchieved: outcomesBreakdown.filter((o) => o.achieved).length,
    outcomesBreakdown,
  };
}

/**
 * Calculate script practice scores
 */
function calculateScriptPracticeScores(
  transcript: ConversationMessage[],
  scenario: { keyPhrases: string[]; avoidPhrases: string[]; expectedOutcomes: string[]; targetDurationSecs: number },
  scriptAnalysis: ReturnType<typeof analyzeScriptAdherenceDetailed>,
  duration: number
): { overall: number; tone: number; empathy: number; scriptAdherence: number; timing: number } {
  const userMessages = transcript.filter((m) => m.role === 'user').map((m) => m.content);
  const allUserText = userMessages.join(' ').toLowerCase();

  // Tone score
  const politeWords = ['please', 'thank you', 'certainly', 'happy to', 'of course', 'appreciate'];
  const politeCount = politeWords.filter((w) => allUserText.includes(w)).length;
  const tone = Math.min(100, 50 + politeCount * 10);

  // Empathy score
  const empathyPhrases = ['understand', 'sorry to hear', 'i can see', 'that must be', 'i appreciate'];
  const empathyCount = empathyPhrases.filter((p) => allUserText.includes(p)).length;
  const empathy = Math.min(100, 40 + empathyCount * 15);

  // Script adherence (from detailed analysis)
  const scriptAdherence = scriptAnalysis.adherenceScore;

  // Timing score
  const targetDuration = scenario.targetDurationSecs;
  const durationDiff = Math.abs(duration - targetDuration);
  const timing = Math.max(0, 100 - (durationDiff / targetDuration) * 50);

  // Overall weighted score
  const overall = Math.round(tone * 0.2 + empathy * 0.25 + scriptAdherence * 0.4 + timing * 0.15);

  return {
    overall,
    tone: Math.round(tone),
    empathy: Math.round(empathy),
    scriptAdherence: Math.round(scriptAdherence),
    timing: Math.round(timing),
  };
}

/**
 * Generate detailed feedback for script practice
 */
function generateScriptPracticeFeedback(
  transcript: ConversationMessage[],
  scenario: { name: string; type: ScenarioType; keyPhrases: string[]; avoidPhrases: string[] },
  scriptAnalysis: ReturnType<typeof analyzeScriptAdherenceDetailed>,
  scores: { overall: number; tone: number; empathy: number; scriptAdherence: number; timing: number }
): {
  scriptAdherence: { summary: string; suggestions: string[] };
  tone: { summary: string; suggestions: string[] };
  empathy: { summary: string; suggestions: string[] };
  overallSummary: string;
  strengths: string[];
  improvements: string[];
} {
  const strengths: string[] = [];
  const improvements: string[] = [];

  // Script adherence feedback
  const keyUsed = scriptAnalysis.keyPhrasesBreakdown.filter((p) => p.used).length;
  const keyTotal = scriptAnalysis.keyPhrasesBreakdown.length;
  const avoidUsed = scriptAnalysis.avoidPhrasesBreakdown.filter((p) => p.used).length;

  let scriptSummary = '';
  const scriptSuggestions: string[] = [];

  if (scores.scriptAdherence >= 80) {
    scriptSummary = `Excellent script adherence! You used ${keyUsed}/${keyTotal} key phrases effectively.`;
    strengths.push('Strong script adherence');
  } else if (scores.scriptAdherence >= 60) {
    scriptSummary = `Good script adherence with room for improvement. Used ${keyUsed}/${keyTotal} key phrases.`;
    const unused = scriptAnalysis.keyPhrasesBreakdown.filter((p) => !p.used);
    if (unused.length > 0) {
      scriptSuggestions.push(`Try incorporating: "${unused[0].phrase}"`);
    }
  } else {
    scriptSummary = `Script adherence needs work. Only ${keyUsed}/${keyTotal} key phrases used.`;
    improvements.push('Practice using more key phrases from the script');
    scriptAnalysis.keyPhrasesBreakdown.filter((p) => !p.used).slice(0, 2).forEach((p) => {
      scriptSuggestions.push(`Practice using: "${p.phrase}"`);
    });
  }

  if (avoidUsed > 0) {
    improvements.push(`Avoid these phrases: ${scriptAnalysis.avoidPhrasesBreakdown.filter((p) => p.used).map((p) => p.phrase).join(', ')}`);
    scriptSuggestions.push('Review the phrases to avoid and practice alternatives');
  }

  // Tone feedback
  let toneSummary = '';
  const toneSuggestions: string[] = [];

  if (scores.tone >= 80) {
    toneSummary = 'Professional and courteous tone throughout the conversation.';
    strengths.push('Professional tone');
  } else if (scores.tone >= 60) {
    toneSummary = 'Acceptable tone with some room for improvement.';
    toneSuggestions.push('Try using more courteous phrases like "certainly" or "happy to help"');
  } else {
    toneSummary = 'Tone could be more professional and courteous.';
    improvements.push('Work on using more professional language');
    toneSuggestions.push('Add phrases like "please", "thank you", and "I appreciate your patience"');
  }

  // Empathy feedback
  let empathySummary = '';
  const empathySuggestions: string[] = [];

  if (scores.empathy >= 80) {
    empathySummary = 'Showed strong empathy and understanding for the caller.';
    strengths.push('Strong empathy');
  } else if (scores.empathy >= 60) {
    empathySummary = 'Demonstrated some empathy, but could be more supportive.';
    empathySuggestions.push('Use phrases like "I understand how you feel" or "That must be frustrating"');
  } else {
    empathySummary = 'Empathy was lacking in the conversation.';
    improvements.push('Focus on acknowledging the caller\'s feelings');
    empathySuggestions.push('Before offering solutions, acknowledge the caller\'s situation');
  }

  // Overall summary
  let overallSummary = '';
  if (scores.overall >= 85) {
    overallSummary = `Excellent performance on the ${scenario.name} script! You demonstrated strong communication skills.`;
  } else if (scores.overall >= 70) {
    overallSummary = `Good performance on the ${scenario.name} script. Focus on the suggested improvements to reach excellence.`;
  } else if (scores.overall >= 50) {
    overallSummary = `Satisfactory performance on the ${scenario.name} script. Regular practice will help improve your skills.`;
  } else {
    overallSummary = `The ${scenario.name} script needs more practice. Review the key phrases and try again.`;
  }

  return {
    scriptAdherence: { summary: scriptSummary, suggestions: scriptSuggestions },
    tone: { summary: toneSummary, suggestions: toneSuggestions },
    empathy: { summary: empathySummary, suggestions: empathySuggestions },
    overallSummary,
    strengths,
    improvements,
  };
}

/**
 * Update user's script mastery after practice
 */
async function updateScriptMastery(
  ctx: { user: { id: string; organizationId: string }; prisma: typeof import('@prisma/client').PrismaClient.prototype },
  scriptId: string,
  newScore: number
): Promise<MasteryLevel> {
  const sessions = await ctx.prisma.practiceSession.findMany({
    where: {
      userId: ctx.user.id,
      scenarioId: scriptId,
      status: 'COMPLETED',
    },
    select: { scriptAdherenceScore: true },
    orderBy: { endedAt: 'desc' },
    take: 10,
  });

  const avgScore = sessions.reduce((sum, s) => sum + (s.scriptAdherenceScore || 0), 0) / sessions.length;
  return getMasteryLevel(sessions.length, avgScore);
}

/**
 * Generate next steps recommendations
 */
function generateNextSteps(
  scores: { overall: number; tone: number; empathy: number; scriptAdherence: number; timing: number },
  scenarioType: ScenarioType
): string[] {
  const nextSteps: string[] = [];

  // Find weakest area
  const categories = [
    { name: 'tone', score: scores.tone },
    { name: 'empathy', score: scores.empathy },
    { name: 'scriptAdherence', score: scores.scriptAdherence },
    { name: 'timing', score: scores.timing },
  ].sort((a, b) => a.score - b.score);

  const weakest = categories[0];

  switch (weakest.name) {
    case 'tone':
      nextSteps.push('Practice using more courteous and professional language');
      nextSteps.push('Review examples of professional phone etiquette');
      break;
    case 'empathy':
      nextSteps.push('Practice acknowledging caller feelings before solving problems');
      nextSteps.push('Try the complaint handling scenarios to build empathy skills');
      break;
    case 'scriptAdherence':
      nextSteps.push('Review the key phrases for this script type');
      nextSteps.push('Practice this script again focusing on key phrase usage');
      break;
    case 'timing':
      nextSteps.push('Work on being more efficient while still thorough');
      nextSteps.push('Practice transitioning smoothly between conversation phases');
      break;
  }

  if (scores.overall >= 80) {
    nextSteps.push('Try the same scenario at a higher difficulty level');
  } else {
    nextSteps.push('Practice this script a few more times before advancing');
  }

  return nextSteps;
}

// ============================================
// US-369: Performance Coaching Helpers
// ============================================

type CategoryType = 'TONE' | 'EMPATHY' | 'SCRIPT_ADHERENCE' | 'TIMING' | 'PROBLEM_SOLVING' | 'PROFESSIONALISM' | 'OVERALL';

interface RealCallAnalysis {
  overallScore: number;
  toneScore: number;
  empathyScore: number;
  problemSolvingScore: number;
  professionalismScore: number;
  timingScore: number;
  toneObservations: string[];
  empathyObservations: string[];
  problemSolvingObservations: string[];
  professionalismObservations: string[];
  toneKeyMoments: Array<{ timestamp: string; observation: string; impact: 'positive' | 'negative' }>;
  empathyKeyMoments: Array<{ timestamp: string; observation: string; impact: 'positive' | 'negative' }>;
  pacingNotes: string;
}

interface CoachingInsight {
  summary: {
    headline: string;
    overallAssessment: string;
    topStrength: string;
    primaryFocus: string;
  };
  actionItems: string[];
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  detailedFeedback: Array<{
    category: string;
    finding: string;
    suggestion: string;
    resources?: string[];
  }>;
}

interface PerformanceTrends {
  overall: 'IMPROVING' | 'STABLE' | 'DECLINING';
  byCategory: Record<string, 'IMPROVING' | 'STABLE' | 'DECLINING'>;
  recentAverage: number;
  historicalAverage: number;
  bestPerformance: { date: Date | null; score: number };
  sessionsAnalyzed: number;
}

interface MicroLearningSuggestion {
  id: string;
  title: string;
  description: string;
  category: CategoryType;
  durationMinutes: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  exercises: string[];
  tips: string[];
}

interface PerformanceProfile {
  strengths: Array<{ category: CategoryType; avgScore: number; trend: string }>;
  weaknesses: Array<{ category: CategoryType; avgScore: number; trend: string }>;
  overallTrend: 'IMPROVING' | 'STABLE' | 'DECLINING';
  sessionsTotal: number;
  averageScore: number;
  consistency: number;
  byScenarioType: Record<string, { count: number; avgScore: number }>;
}

interface ImprovementPlan {
  focusAreas: Array<{
    category: CategoryType;
    currentScore: number;
    targetScore: number;
    priority: number;
    strategies: string[];
    exercises: string[];
    successCriteria: string[];
  }>;
  weeklySchedule: Array<{
    week: number;
    focus: string;
    activities: string[];
    targetImprovement: number;
  }>;
  totalEstimatedHours: number;
}

interface Milestone {
  week: number;
  target: string;
  measureableGoal: string;
  checkIn: string;
}

/**
 * Get letter grade from score
 */
function getLetterGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Analyze a real call transcript for coaching opportunities
 */
function analyzeRealCallForCoaching(
  transcript: string,
  callType: ScenarioType,
  callDuration: number,
  outcome?: string
): RealCallAnalysis {
  const lines = transcript.toLowerCase();

  // Tone analysis
  const positiveIndicators = ['thank you', 'please', 'happy to', 'absolutely', 'certainly', 'of course'];
  const negativeIndicators = ['no', "can't", "won't", 'unfortunately'];
  const positiveCount = positiveIndicators.filter(p => lines.includes(p)).length;
  const negativeCount = negativeIndicators.filter(n => lines.includes(n)).length;
  const toneScore = Math.min(100, Math.max(0, 70 + (positiveCount * 5) - (negativeCount * 3)));

  // Empathy analysis
  const empathyPhrases = ['i understand', 'i hear you', 'that must be', 'i apologize', 'sorry to hear'];
  const empathyCount = empathyPhrases.filter(e => lines.includes(e)).length;
  const empathyScore = Math.min(100, Math.max(0, 60 + (empathyCount * 10)));

  // Problem solving analysis
  const solutionPhrases = ['let me', "i'll", 'we can', "here's what", 'solution'];
  const solutionCount = solutionPhrases.filter(s => lines.includes(s)).length;
  const problemSolvingScore = outcome === 'RESOLVED' ? 85 + solutionCount * 3 : 50 + solutionCount * 5;

  // Professionalism analysis
  const professionalPhrases = ['thank you for calling', 'is there anything else', 'have a great day'];
  const unprofessionalPhrases = ['yeah', 'uh', 'um', 'like,'];
  const profCount = professionalPhrases.filter(p => lines.includes(p)).length;
  const unprofCount = unprofessionalPhrases.filter(u => lines.includes(u)).length;
  const professionalismScore = Math.min(100, Math.max(0, 75 + (profCount * 8) - (unprofCount * 5)));

  // Timing analysis
  const idealDuration = callType === 'COMPLAINT_HANDLING' ? 420 : 180;
  const timingDiff = Math.abs(callDuration - idealDuration);
  const timingScore = Math.max(0, 100 - (timingDiff / idealDuration) * 50);

  // Overall score
  const overallScore = Math.round(
    (toneScore * 0.2) + (empathyScore * 0.25) + (problemSolvingScore * 0.25) +
    (professionalismScore * 0.15) + (timingScore * 0.15)
  );

  return {
    overallScore,
    toneScore: Math.round(toneScore),
    empathyScore: Math.round(empathyScore),
    problemSolvingScore: Math.round(Math.min(100, problemSolvingScore)),
    professionalismScore: Math.round(professionalismScore),
    timingScore: Math.round(timingScore),
    toneObservations: generateToneObservations(toneScore, positiveCount, negativeCount),
    empathyObservations: generateEmpathyObservations(empathyScore, empathyCount),
    problemSolvingObservations: generateProblemSolvingObservations(problemSolvingScore, outcome),
    professionalismObservations: generateProfessionalismObservations(professionalismScore),
    toneKeyMoments: [],
    empathyKeyMoments: [],
    pacingNotes: callDuration > idealDuration * 1.5 ? 'Call ran longer than expected' :
                 callDuration < idealDuration * 0.5 ? 'Call was shorter than expected - ensure all issues addressed' :
                 'Call duration was appropriate',
  };
}

function generateToneObservations(score: number, positive: number, negative: number): string[] {
  const observations: string[] = [];
  if (score >= 80) observations.push('Maintained professional and courteous tone throughout');
  else if (score >= 60) observations.push('Generally professional tone with room for improvement');
  else observations.push('Tone needs significant improvement');

  if (positive > 3) observations.push('Good use of positive language');
  if (negative > 2) observations.push('Consider reducing negative phrasing');

  return observations;
}

function generateEmpathyObservations(score: number, count: number): string[] {
  const observations: string[] = [];
  if (score >= 80) observations.push('Demonstrated strong empathy and understanding');
  else if (score >= 60) observations.push('Some empathy shown, but could be more consistent');
  else observations.push('Need to demonstrate more empathy and understanding');

  if (count === 0) observations.push('Consider acknowledging caller feelings before problem-solving');

  return observations;
}

function generateProblemSolvingObservations(score: number, outcome?: string): string[] {
  const observations: string[] = [];
  if (outcome === 'RESOLVED') observations.push('Successfully resolved the caller\'s issue');
  else if (outcome === 'ESCALATED') observations.push('Appropriately escalated for additional support');
  else if (outcome === 'UNRESOLVED') observations.push('Issue remained unresolved - review handling approach');

  if (score >= 80) observations.push('Demonstrated proactive solution-oriented approach');
  else if (score >= 60) observations.push('Adequate problem-solving with room for improvement');
  else observations.push('Focus on offering clear solutions and next steps');

  return observations;
}

function generateProfessionalismObservations(score: number): string[] {
  const observations: string[] = [];
  if (score >= 80) observations.push('Maintained high professional standards');
  else if (score >= 60) observations.push('Professional but could improve greeting/closing');
  else observations.push('Review professional communication standards');

  return observations;
}

/**
 * Calculate performance trends from historical data
 */
function calculatePerformanceTrends(
  historicalData: Array<{
    overallScore: number | null;
    toneScore: number | null;
    empathyScore: number | null;
    scriptAdherenceScore: number | null;
    completedAt: Date | null;
  }>
): PerformanceTrends {
  if (historicalData.length < 3) {
    return {
      overall: 'STABLE',
      byCategory: {},
      recentAverage: historicalData[0]?.overallScore || 0,
      historicalAverage: historicalData[0]?.overallScore || 0,
      bestPerformance: { date: null, score: 0 },
      sessionsAnalyzed: historicalData.length,
    };
  }

  const recent = historicalData.slice(0, 5);
  const older = historicalData.slice(5);

  const recentAvg = recent.reduce((s, d) => s + (d.overallScore || 0), 0) / recent.length;
  const olderAvg = older.length > 0 ? older.reduce((s, d) => s + (d.overallScore || 0), 0) / older.length : recentAvg;

  const diff = recentAvg - olderAvg;
  const overall: 'IMPROVING' | 'STABLE' | 'DECLINING' = diff > 5 ? 'IMPROVING' : diff < -5 ? 'DECLINING' : 'STABLE';

  const bestSession = historicalData.reduce((best, curr) =>
    (curr.overallScore || 0) > (best.overallScore || 0) ? curr : best
  , historicalData[0]);

  return {
    overall,
    byCategory: {
      tone: calculateCategoryTrend(historicalData.map(d => d.toneScore)),
      empathy: calculateCategoryTrend(historicalData.map(d => d.empathyScore)),
      scriptAdherence: calculateCategoryTrend(historicalData.map(d => d.scriptAdherenceScore)),
    },
    recentAverage: Math.round(recentAvg),
    historicalAverage: Math.round(olderAvg),
    bestPerformance: { date: bestSession?.completedAt || null, score: bestSession?.overallScore || 0 },
    sessionsAnalyzed: historicalData.length,
  };
}

function calculateCategoryTrend(scores: (number | null)[]): 'IMPROVING' | 'STABLE' | 'DECLINING' {
  const validScores = scores.filter((s): s is number => s !== null);
  if (validScores.length < 3) return 'STABLE';

  const recent = validScores.slice(0, 3).reduce((s, v) => s + v, 0) / 3;
  const older = validScores.slice(3).reduce((s, v) => s + v, 0) / Math.max(1, validScores.length - 3);

  const diff = recent - older;
  return diff > 5 ? 'IMPROVING' : diff < -5 ? 'DECLINING' : 'STABLE';
}

/**
 * Generate personalized coaching insights
 */
function generateCoachingInsights(
  analysis: RealCallAnalysis,
  trends: PerformanceTrends,
  callType: ScenarioType
): CoachingInsight {
  const scores = [
    { category: 'Tone', score: analysis.toneScore },
    { category: 'Empathy', score: analysis.empathyScore },
    { category: 'Problem Solving', score: analysis.problemSolvingScore },
    { category: 'Professionalism', score: analysis.professionalismScore },
    { category: 'Timing', score: analysis.timingScore },
  ];

  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const topStrength = sorted[0];
  const primaryWeakness = sorted[sorted.length - 1];

  const priority: 'HIGH' | 'MEDIUM' | 'LOW' =
    analysis.overallScore < 60 ? 'HIGH' :
    analysis.overallScore < 75 ? 'MEDIUM' : 'LOW';

  const actionItems: string[] = [];
  if (primaryWeakness.score < 70) {
    actionItems.push(`Focus on improving ${primaryWeakness.category.toLowerCase()} - current score: ${primaryWeakness.score}%`);
  }
  if (trends.overall === 'DECLINING') {
    actionItems.push('Schedule additional practice sessions to reverse declining trend');
  }
  if (analysis.overallScore >= 80) {
    actionItems.push('Maintain current performance and try more challenging scenarios');
  } else {
    actionItems.push(`Practice ${callType.toLowerCase().replace('_', ' ')} scenarios at BEGINNER difficulty`);
  }

  const detailedFeedback = scores
    .filter(s => s.score < 80)
    .map(s => ({
      category: s.category,
      finding: `${s.category} score of ${s.score}% is below target`,
      suggestion: getCoachingSuggestion(s.category, s.score),
      resources: getCoachingResources(s.category),
    }));

  return {
    summary: {
      headline: analysis.overallScore >= 80 ? 'Strong Performance!' :
                analysis.overallScore >= 60 ? 'Good Progress' : 'Needs Improvement',
      overallAssessment: `Overall score of ${analysis.overallScore}% (${getLetterGrade(analysis.overallScore)})`,
      topStrength: `${topStrength.category} (${topStrength.score}%)`,
      primaryFocus: `${primaryWeakness.category} (${primaryWeakness.score}%)`,
    },
    actionItems,
    priority,
    detailedFeedback,
  };
}

function getCoachingSuggestion(category: string, score: number): string {
  const suggestions: Record<string, string> = {
    'Tone': 'Practice using more positive and courteous language. Avoid negative phrasing.',
    'Empathy': 'Acknowledge caller feelings before jumping to solutions. Use phrases like "I understand."',
    'Problem Solving': 'Focus on offering clear solutions and next steps. Be proactive.',
    'Professionalism': 'Ensure proper greeting and closing. Avoid filler words.',
    'Timing': 'Work on being efficient while thorough. Practice transitions.',
  };
  return suggestions[category] || 'Continue practicing this area.';
}

function getCoachingResources(category: string): string[] {
  const resources: Record<string, string[]> = {
    'Tone': ['Professional phone etiquette guide', 'Positive language training module'],
    'Empathy': ['Empathy in customer service training', 'Active listening exercises'],
    'Problem Solving': ['Solution-focused communication', 'Call resolution strategies'],
    'Professionalism': ['Professional standards review', 'Greeting and closing scripts'],
    'Timing': ['Call efficiency techniques', 'Conversation pacing guide'],
  };
  return resources[category] || [];
}

/**
 * Generate micro-learning suggestions based on analysis
 */
function generateMicroLearningSuggestions(analysis: RealCallAnalysis, callType: ScenarioType): MicroLearningSuggestion[] {
  const suggestions: MicroLearningSuggestion[] = [];

  if (analysis.empathyScore < 70) {
    suggestions.push({
      id: 'micro-empathy-1',
      title: 'Empathy Quick Practice',
      description: 'Quick exercises to improve empathetic responses',
      category: 'EMPATHY',
      durationMinutes: 5,
      difficulty: 'EASY',
      exercises: [
        'Practice 5 empathy phrases',
        'Role-play acknowledging frustration',
        'Review empathy examples',
      ],
      tips: [
        'Always acknowledge feelings before solving',
        'Use phrases like "I understand" and "That must be frustrating"',
      ],
    });
  }

  if (analysis.toneScore < 70) {
    suggestions.push({
      id: 'micro-tone-1',
      title: 'Positive Language Boost',
      description: 'Quick drills for more positive communication',
      category: 'TONE',
      durationMinutes: 5,
      difficulty: 'EASY',
      exercises: [
        'Transform 5 negative phrases to positive',
        'Practice courteous alternatives',
      ],
      tips: [
        'Replace "can\'t" with "what I can do is..."',
        'Use "please" and "thank you" liberally',
      ],
    });
  }

  if (analysis.problemSolvingScore < 70) {
    suggestions.push({
      id: 'micro-solve-1',
      title: 'Solution-First Approach',
      description: 'Learn to lead with solutions',
      category: 'PROBLEM_SOLVING',
      durationMinutes: 10,
      difficulty: 'MEDIUM',
      exercises: [
        'Practice offering 3 solutions for common issues',
        'Role-play resolving a complaint',
      ],
      tips: [
        'Always offer what you CAN do, not what you can\'t',
        'Summarize the solution and next steps clearly',
      ],
    });
  }

  return suggestions;
}

/**
 * Build a comprehensive performance profile
 */
function buildPerformanceProfile(
  sessions: Array<{
    overallScore: number | null;
    toneScore: number | null;
    empathyScore: number | null;
    scriptAdherenceScore: number | null;
    timingScore: number | null;
    completedAt: Date | null;
    scenario: { type: ScenarioType; name: string };
    feedback: Array<{ category: string; score: number | null }>;
  }>,
  feedbackHistory: Array<{ category: string; score: number | null; createdAt: Date }>
): PerformanceProfile {
  if (sessions.length === 0) {
    return {
      strengths: [],
      weaknesses: [],
      overallTrend: 'STABLE',
      sessionsTotal: 0,
      averageScore: 0,
      consistency: 0,
      byScenarioType: {},
    };
  }

  const avgScores = {
    tone: sessions.reduce((s, d) => s + (d.toneScore || 0), 0) / sessions.length,
    empathy: sessions.reduce((s, d) => s + (d.empathyScore || 0), 0) / sessions.length,
    scriptAdherence: sessions.reduce((s, d) => s + (d.scriptAdherenceScore || 0), 0) / sessions.length,
    timing: sessions.reduce((s, d) => s + (d.timingScore || 0), 0) / sessions.length,
    overall: sessions.reduce((s, d) => s + (d.overallScore || 0), 0) / sessions.length,
  };

  const categories: Array<{ category: CategoryType; avgScore: number; trend: string }> = [
    { category: 'TONE', avgScore: Math.round(avgScores.tone), trend: 'STABLE' },
    { category: 'EMPATHY', avgScore: Math.round(avgScores.empathy), trend: 'STABLE' },
    { category: 'SCRIPT_ADHERENCE', avgScore: Math.round(avgScores.scriptAdherence), trend: 'STABLE' },
    { category: 'TIMING', avgScore: Math.round(avgScores.timing), trend: 'STABLE' },
  ];

  const sorted = [...categories].sort((a, b) => b.avgScore - a.avgScore);
  const strengths = sorted.slice(0, 2);
  const weaknesses = sorted.slice(-2).reverse();

  // Calculate consistency (lower std dev = more consistent)
  const overallScores = sessions.map(s => s.overallScore || 0);
  const mean = avgScores.overall;
  const variance = overallScores.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / overallScores.length;
  const stdDev = Math.sqrt(variance);
  const consistency = Math.max(0, 100 - stdDev);

  // Group by scenario type
  const byScenarioType: Record<string, { count: number; avgScore: number }> = {};
  sessions.forEach(s => {
    const type = s.scenario.type;
    if (!byScenarioType[type]) byScenarioType[type] = { count: 0, avgScore: 0 };
    byScenarioType[type].count++;
    byScenarioType[type].avgScore += s.overallScore || 0;
  });
  Object.keys(byScenarioType).forEach(type => {
    byScenarioType[type].avgScore = Math.round(byScenarioType[type].avgScore / byScenarioType[type].count);
  });

  // Calculate trend
  const trends = calculatePerformanceTrends(sessions.map(s => ({
    overallScore: s.overallScore,
    toneScore: s.toneScore,
    empathyScore: s.empathyScore,
    scriptAdherenceScore: s.scriptAdherenceScore,
    completedAt: s.completedAt,
  })));

  return {
    strengths,
    weaknesses,
    overallTrend: trends.overall,
    sessionsTotal: sessions.length,
    averageScore: Math.round(avgScores.overall),
    consistency: Math.round(consistency),
    byScenarioType,
  };
}

/**
 * Generate a personalized improvement plan
 */
function generateImprovementPlan(
  profile: PerformanceProfile,
  focusAreas: CategoryType[] | undefined,
  timeframeWeeks: number
): ImprovementPlan {
  const areasToImprove = focusAreas
    ? profile.weaknesses.filter(w => focusAreas.includes(w.category))
    : profile.weaknesses;

  const focusAreaPlans = areasToImprove.map((area, index) => ({
    category: area.category,
    currentScore: area.avgScore,
    targetScore: Math.min(100, area.avgScore + 15),
    priority: index + 1,
    strategies: getImprovementStrategies(area.category),
    exercises: getImprovementExercises(area.category),
    successCriteria: [`Achieve ${Math.min(100, area.avgScore + 15)}% average in ${area.category}`],
  }));

  const weeklySchedule: ImprovementPlan['weeklySchedule'] = [];
  for (let week = 1; week <= timeframeWeeks; week++) {
    const weekFocus = focusAreaPlans[(week - 1) % focusAreaPlans.length];
    weeklySchedule.push({
      week,
      focus: weekFocus?.category || 'OVERALL',
      activities: weekFocus?.exercises.slice(0, 2) || ['Practice sessions', 'Review feedback'],
      targetImprovement: 3,
    });
  }

  return {
    focusAreas: focusAreaPlans,
    weeklySchedule,
    totalEstimatedHours: timeframeWeeks * 2,
  };
}

function getImprovementStrategies(category: CategoryType): string[] {
  const strategies: Record<string, string[]> = {
    'TONE': ['Practice positive language patterns', 'Review professional communication standards', 'Record and review your calls'],
    'EMPATHY': ['Lead with acknowledgment', 'Practice active listening', 'Use empathy phrase library'],
    'SCRIPT_ADHERENCE': ['Review key phrases daily', 'Practice scripts before shifts', 'Use script checklists'],
    'TIMING': ['Set time goals for call phases', 'Practice transitions', 'Review efficient call recordings'],
    'PROBLEM_SOLVING': ['Learn common solutions', 'Practice decision trees', 'Review resolved cases'],
    'PROFESSIONALISM': ['Review greeting/closing standards', 'Eliminate filler words', 'Practice formal communication'],
    'OVERALL': ['Consistent practice', 'Regular feedback review', 'Set incremental goals'],
  };
  return strategies[category] || strategies['OVERALL'];
}

function getImprovementExercises(category: CategoryType): string[] {
  const exercises: Record<string, string[]> = {
    'TONE': ['Positive phrase conversion drill', 'Recorded self-assessment', 'Peer feedback session'],
    'EMPATHY': ['Empathy phrase practice', 'Emotional scenario role-play', 'Feedback incorporation'],
    'SCRIPT_ADHERENCE': ['Key phrase memorization', 'Script timing practice', 'Scenario variations'],
    'TIMING': ['Timed call drills', 'Phase transition practice', 'Efficiency review'],
    'PROBLEM_SOLVING': ['Case study analysis', 'Solution brainstorming', 'Decision tree practice'],
    'PROFESSIONALISM': ['Opening/closing practice', 'Filler word elimination', 'Professional language drill'],
    'OVERALL': ['Full scenario practice', 'Multi-skill integration', 'Performance review'],
  };
  return exercises[category] || exercises['OVERALL'];
}

/**
 * Generate milestones for improvement plan
 */
function generateMilestones(plan: ImprovementPlan, weeks: number): Milestone[] {
  const milestones: Milestone[] = [];
  const checkpoints = [Math.floor(weeks / 3), Math.floor(weeks * 2 / 3), weeks];

  checkpoints.forEach((week, index) => {
    const focus = plan.focusAreas[index % plan.focusAreas.length];
    milestones.push({
      week,
      target: focus ? `Improve ${focus.category} to ${focus.targetScore}%` : 'Overall improvement',
      measureableGoal: focus ? `${focus.currentScore + (index + 1) * 5}% average` : 'Consistent scores',
      checkIn: `Week ${week} progress review`,
    });
  });

  return milestones;
}

/**
 * Calculate period metrics from sessions
 */
function calculatePeriodMetrics(
  sessions: Array<{
    overallScore: number | null;
    toneScore: number | null;
    empathyScore: number | null;
    scriptAdherenceScore: number | null;
    timingScore: number | null;
  }>
): {
  overall: number;
  tone: number;
  empathy: number;
  scriptAdherence: number;
  timing: number;
  sessionsCount: number;
} {
  if (sessions.length === 0) {
    return { overall: 0, tone: 0, empathy: 0, scriptAdherence: 0, timing: 0, sessionsCount: 0 };
  }

  return {
    overall: Math.round(sessions.reduce((s, d) => s + (d.overallScore || 0), 0) / sessions.length),
    tone: Math.round(sessions.reduce((s, d) => s + (d.toneScore || 0), 0) / sessions.length),
    empathy: Math.round(sessions.reduce((s, d) => s + (d.empathyScore || 0), 0) / sessions.length),
    scriptAdherence: Math.round(sessions.reduce((s, d) => s + (d.scriptAdherenceScore || 0), 0) / sessions.length),
    timing: Math.round(sessions.reduce((s, d) => s + (d.timingScore || 0), 0) / sessions.length),
    sessionsCount: sessions.length,
  };
}

/**
 * Calculate improvement between periods
 */
function calculateImprovement(
  current: ReturnType<typeof calculatePeriodMetrics>,
  previous: ReturnType<typeof calculatePeriodMetrics>
): {
  overall: number;
  tone: number;
  empathy: number;
  scriptAdherence: number;
  timing: number;
} {
  return {
    overall: current.overall - previous.overall,
    tone: current.tone - previous.tone,
    empathy: current.empathy - previous.empathy,
    scriptAdherence: current.scriptAdherence - previous.scriptAdherence,
    timing: current.timing - previous.timing,
  };
}

/**
 * Determine overall trend from improvement
 */
function determineTrend(improvement: ReturnType<typeof calculateImprovement>): 'IMPROVING' | 'STABLE' | 'DECLINING' {
  if (improvement.overall > 5) return 'IMPROVING';
  if (improvement.overall < -5) return 'DECLINING';
  return 'STABLE';
}

/**
 * Build timeline data for charting
 */
function buildTimelineData(
  sessions: Array<{
    id: string;
    overallScore: number | null;
    toneScore: number | null;
    empathyScore: number | null;
    scriptAdherenceScore: number | null;
    timingScore: number | null;
    completedAt: Date | null;
    scenario: { type: ScenarioType; name: string };
  }>,
  category?: CategoryType
): Array<{ date: string; score: number; sessionId: string; scenarioName: string }> {
  return sessions.map(s => {
    let score = s.overallScore || 0;
    if (category === 'TONE') score = s.toneScore || 0;
    else if (category === 'EMPATHY') score = s.empathyScore || 0;
    else if (category === 'SCRIPT_ADHERENCE') score = s.scriptAdherenceScore || 0;
    else if (category === 'TIMING') score = s.timingScore || 0;

    return {
      date: s.completedAt?.toISOString() || new Date().toISOString(),
      score,
      sessionId: s.id,
      scenarioName: s.scenario.name,
    };
  });
}

/**
 * Generate improvement insights
 */
function generateImprovementInsights(
  current: ReturnType<typeof calculatePeriodMetrics>,
  previous: ReturnType<typeof calculatePeriodMetrics>,
  improvement: ReturnType<typeof calculateImprovement>
): string[] {
  const insights: string[] = [];

  if (improvement.overall > 10) {
    insights.push(`Excellent progress! Overall score improved by ${improvement.overall}%`);
  } else if (improvement.overall > 0) {
    insights.push(`Good progress - overall score improved by ${improvement.overall}%`);
  } else if (improvement.overall < -5) {
    insights.push(`Scores have declined by ${Math.abs(improvement.overall)}% - consider additional practice`);
  }

  // Find biggest improvement
  const categories = [
    { name: 'Tone', diff: improvement.tone },
    { name: 'Empathy', diff: improvement.empathy },
    { name: 'Script Adherence', diff: improvement.scriptAdherence },
    { name: 'Timing', diff: improvement.timing },
  ];

  const bestImproved = categories.sort((a, b) => b.diff - a.diff)[0];
  if (bestImproved.diff > 5) {
    insights.push(`Greatest improvement in ${bestImproved.name} (+${bestImproved.diff}%)`);
  }

  const worstDeclined = categories.sort((a, b) => a.diff - b.diff)[0];
  if (worstDeclined.diff < -5) {
    insights.push(`Focus needed on ${worstDeclined.name} (${worstDeclined.diff}%)`);
  }

  if (current.sessionsCount < 5) {
    insights.push('Complete more practice sessions for accurate trend analysis');
  }

  return insights;
}

/**
 * Identify weak areas from recent sessions
 */
function identifyWeakAreas(
  sessions: Array<{
    overallScore: number | null;
    toneScore: number | null;
    empathyScore: number | null;
    scriptAdherenceScore: number | null;
    timingScore: number | null;
    scenario: { type: ScenarioType };
    feedback: Array<{ category: string; score: number | null }>;
  }>
): Array<{ category: CategoryType; avgScore: number; sessionsBelow70: number }> {
  if (sessions.length === 0) return [];

  const categories: Array<{ category: CategoryType; scores: number[] }> = [
    { category: 'TONE', scores: sessions.map(s => s.toneScore || 0) },
    { category: 'EMPATHY', scores: sessions.map(s => s.empathyScore || 0) },
    { category: 'SCRIPT_ADHERENCE', scores: sessions.map(s => s.scriptAdherenceScore || 0) },
    { category: 'TIMING', scores: sessions.map(s => s.timingScore || 0) },
  ];

  return categories
    .map(c => ({
      category: c.category,
      avgScore: Math.round(c.scores.reduce((s, v) => s + v, 0) / c.scores.length),
      sessionsBelow70: c.scores.filter(s => s < 70).length,
    }))
    .sort((a, b) => a.avgScore - b.avgScore);
}

/**
 * Generate micro-learning for a specific weak area
 */
function generateMicroLearningForArea(
  area: { category: CategoryType; avgScore: number; sessionsBelow70: number }
): MicroLearningSuggestion {
  const resources: Record<CategoryType, MicroLearningSuggestion> = {
    'TONE': {
      id: `micro-tone-${Date.now()}`,
      title: 'Positive Language Quick Drill',
      description: 'Practice converting negative phrases to positive alternatives',
      category: 'TONE',
      durationMinutes: 5,
      difficulty: area.avgScore < 50 ? 'EASY' : 'MEDIUM',
      exercises: ['Convert 5 negative phrases', 'Practice courteous alternatives', 'Self-record and review'],
      tips: ['Replace "can\'t" with "what I can do"', 'Use "please" and "thank you"'],
    },
    'EMPATHY': {
      id: `micro-empathy-${Date.now()}`,
      title: 'Empathy Response Practice',
      description: 'Quick exercises for empathetic communication',
      category: 'EMPATHY',
      durationMinutes: 5,
      difficulty: area.avgScore < 50 ? 'EASY' : 'MEDIUM',
      exercises: ['Practice 5 empathy phrases', 'Acknowledge feelings exercise', 'Active listening drill'],
      tips: ['Always acknowledge before solving', 'Use "I understand" genuinely'],
    },
    'SCRIPT_ADHERENCE': {
      id: `micro-script-${Date.now()}`,
      title: 'Key Phrase Memorization',
      description: 'Review and practice key script phrases',
      category: 'SCRIPT_ADHERENCE',
      durationMinutes: 10,
      difficulty: 'MEDIUM',
      exercises: ['Review key phrases', 'Practice script flow', 'Timed script recitation'],
      tips: ['Keep key phrases visible', 'Practice during slow periods'],
    },
    'TIMING': {
      id: `micro-timing-${Date.now()}`,
      title: 'Call Efficiency Training',
      description: 'Techniques for better call pacing',
      category: 'TIMING',
      durationMinutes: 10,
      difficulty: 'MEDIUM',
      exercises: ['Timed greeting practice', 'Transition drills', 'Wrap-up efficiency'],
      tips: ['Set phase time targets', 'Practice smooth transitions'],
    },
    'PROBLEM_SOLVING': {
      id: `micro-solve-${Date.now()}`,
      title: 'Solution-First Training',
      description: 'Practice leading with solutions',
      category: 'PROBLEM_SOLVING',
      durationMinutes: 10,
      difficulty: 'MEDIUM',
      exercises: ['Common issue solutions', 'Decision tree practice', 'Resolution role-play'],
      tips: ['Focus on what you CAN do', 'Always offer next steps'],
    },
    'PROFESSIONALISM': {
      id: `micro-prof-${Date.now()}`,
      title: 'Professional Standards Review',
      description: 'Polish your professional communication',
      category: 'PROFESSIONALISM',
      durationMinutes: 5,
      difficulty: 'EASY',
      exercises: ['Greeting/closing practice', 'Filler word elimination', 'Formal tone drill'],
      tips: ['Avoid "um", "uh", "like"', 'Use proper greetings'],
    },
    'OVERALL': {
      id: `micro-overall-${Date.now()}`,
      title: 'Comprehensive Skill Review',
      description: 'Overall performance enhancement',
      category: 'OVERALL',
      durationMinutes: 15,
      difficulty: 'MEDIUM',
      exercises: ['Full call simulation', 'Multi-skill practice', 'Feedback review'],
      tips: ['Focus on weakest area first', 'Track your progress'],
    },
  };

  return resources[area.category] || resources['OVERALL'];
}

/**
 * Calculate average scores from sessions
 */
function calculateAverageScores(
  sessions: Array<{
    overallScore: number | null;
    toneScore: number | null;
    empathyScore: number | null;
    scriptAdherenceScore: number | null;
    timingScore: number | null;
  }>
): { overall: number; tone: number; empathy: number; scriptAdherence: number; timing: number } {
  if (sessions.length === 0) {
    return { overall: 0, tone: 0, empathy: 0, scriptAdherence: 0, timing: 0 };
  }

  return {
    overall: Math.round(sessions.reduce((s, d) => s + (d.overallScore || 0), 0) / sessions.length),
    tone: Math.round(sessions.reduce((s, d) => s + (d.toneScore || 0), 0) / sessions.length),
    empathy: Math.round(sessions.reduce((s, d) => s + (d.empathyScore || 0), 0) / sessions.length),
    scriptAdherence: Math.round(sessions.reduce((s, d) => s + (d.scriptAdherenceScore || 0), 0) / sessions.length),
    timing: Math.round(sessions.reduce((s, d) => s + (d.timingScore || 0), 0) / sessions.length),
  };
}

/**
 * Calculate organization-wide statistics
 */
function calculateOrgStatistics(
  sessions: Array<{
    overallScore: number | null;
    toneScore: number | null;
    empathyScore: number | null;
    scriptAdherenceScore: number | null;
    timingScore: number | null;
  }>
): {
  average: { overall: number; tone: number; empathy: number; scriptAdherence: number; timing: number };
  median: number;
  top25: number;
  bottom25: number;
} {
  if (sessions.length === 0) {
    return {
      average: { overall: 0, tone: 0, empathy: 0, scriptAdherence: 0, timing: 0 },
      median: 0,
      top25: 0,
      bottom25: 0,
    };
  }

  const overallScores = sessions.map(s => s.overallScore || 0).sort((a, b) => a - b);
  const median = overallScores[Math.floor(overallScores.length / 2)];
  const top25 = overallScores[Math.floor(overallScores.length * 0.75)];
  const bottom25 = overallScores[Math.floor(overallScores.length * 0.25)];

  return {
    average: calculateAverageScores(sessions),
    median,
    top25,
    bottom25,
  };
}

/**
 * Calculate percentile ranks
 */
function calculatePercentileRanks(
  userAvgs: ReturnType<typeof calculateAverageScores>,
  allSessions: Array<{ overallScore: number | null; toneScore: number | null; empathyScore: number | null; scriptAdherenceScore: number | null; timingScore: number | null }>
): { overall: number; tone: number; empathy: number; scriptAdherence: number; timing: number } {
  const calcPercentile = (userScore: number, allScores: number[]): number => {
    if (allScores.length === 0) return 50;
    const below = allScores.filter(s => s < userScore).length;
    return Math.round((below / allScores.length) * 100);
  };

  return {
    overall: calcPercentile(userAvgs.overall, allSessions.map(s => s.overallScore || 0)),
    tone: calcPercentile(userAvgs.tone, allSessions.map(s => s.toneScore || 0)),
    empathy: calcPercentile(userAvgs.empathy, allSessions.map(s => s.empathyScore || 0)),
    scriptAdherence: calcPercentile(userAvgs.scriptAdherence, allSessions.map(s => s.scriptAdherenceScore || 0)),
    timing: calcPercentile(userAvgs.timing, allSessions.map(s => s.timingScore || 0)),
  };
}

/**
 * Generate peer comparison insights
 */
function generatePeerComparisonInsights(
  userAvgs: ReturnType<typeof calculateAverageScores>,
  orgStats: ReturnType<typeof calculateOrgStatistics>,
  percentiles: ReturnType<typeof calculatePercentileRanks>
): string[] {
  const insights: string[] = [];

  if (percentiles.overall >= 75) {
    insights.push('You are in the top 25% of performers in your organization!');
  } else if (percentiles.overall >= 50) {
    insights.push('You are performing above the median for your organization.');
  } else {
    insights.push('There is opportunity to improve relative to your peers.');
  }

  // Find strongest relative area
  const areas = [
    { name: 'Tone', percentile: percentiles.tone },
    { name: 'Empathy', percentile: percentiles.empathy },
    { name: 'Script Adherence', percentile: percentiles.scriptAdherence },
    { name: 'Timing', percentile: percentiles.timing },
  ];

  const strongest = areas.sort((a, b) => b.percentile - a.percentile)[0];
  const weakest = areas.sort((a, b) => a.percentile - b.percentile)[0];

  if (strongest.percentile >= 75) {
    insights.push(`Your ${strongest.name} is a standout strength (top ${100 - strongest.percentile}%)`);
  }

  if (weakest.percentile < 50) {
    insights.push(`Focus on ${weakest.name} to catch up with peers`);
  }

  const diff = userAvgs.overall - orgStats.average.overall;
  if (diff > 0) {
    insights.push(`You're ${diff} points above the organization average`);
  } else if (diff < 0) {
    insights.push(`You're ${Math.abs(diff)} points below the organization average`);
  }

  return insights;
}

/**
 * Calculate category average for goal tracking
 */
function calculateCategoryAverage(
  sessions: Array<{
    overallScore: number | null;
    toneScore: number | null;
    empathyScore: number | null;
    scriptAdherenceScore: number | null;
    timingScore: number | null;
  }>,
  category: CategoryType | string
): number {
  if (sessions.length === 0) return 0;

  let sum = 0;
  sessions.forEach(s => {
    switch (category) {
      case 'TONE': sum += s.toneScore || 0; break;
      case 'EMPATHY': sum += s.empathyScore || 0; break;
      case 'SCRIPT_ADHERENCE': sum += s.scriptAdherenceScore || 0; break;
      case 'TIMING': sum += s.timingScore || 0; break;
      case 'OVERALL': default: sum += s.overallScore || 0; break;
    }
  });

  return Math.round(sum / sessions.length);
}

/**
 * Calculate goal progress
 */
function calculateGoalProgress(baseline: number, current: number, target: number): number {
  if (target <= baseline) return 100;
  const progress = ((current - baseline) / (target - baseline)) * 100;
  return Math.max(0, Math.min(100, Math.round(progress)));
}

/**
 * Generate goal recommendations
 */
function generateGoalRecommendations(category: CategoryType, currentScore: number, targetScore: number): string[] {
  const gap = targetScore - currentScore;
  const recommendations: string[] = [];

  if (gap > 20) {
    recommendations.push('This is an ambitious goal - consider breaking it into smaller milestones');
  }

  recommendations.push(`Focus on ${category.toLowerCase().replace('_', ' ')} in your next 5 practice sessions`);
  recommendations.push('Review feedback from recent sessions for specific improvement areas');

  if (gap > 10) {
    recommendations.push('Consider scheduling dedicated practice time daily');
  }

  recommendations.push('Track your progress weekly and adjust strategies as needed');

  return recommendations;
}

/**
 * Identify top strength from scores
 */
function identifyTopStrength(
  avgScores: ReturnType<typeof calculateAverageScores>
): string {
  const categories = [
    { name: 'Tone', score: avgScores.tone },
    { name: 'Empathy', score: avgScores.empathy },
    { name: 'Script Adherence', score: avgScores.scriptAdherence },
    { name: 'Timing', score: avgScores.timing },
  ];

  return categories.sort((a, b) => b.score - a.score)[0].name;
}

/**
 * Identify primary weakness from scores
 */
function identifyPrimaryWeakness(
  avgScores: ReturnType<typeof calculateAverageScores>
): string {
  const categories = [
    { name: 'Tone', score: avgScores.tone },
    { name: 'Empathy', score: avgScores.empathy },
    { name: 'Script Adherence', score: avgScores.scriptAdherence },
    { name: 'Timing', score: avgScores.timing },
  ];

  return categories.sort((a, b) => a.score - b.score)[0].name;
}

/**
 * Generate organization improvement opportunities
 */
function generateOrgImprovementOpportunities(
  staffPerformance: Array<{
    userId: string;
    name: string | null;
    role: string;
    sessionsCount: number;
    averageScores: ReturnType<typeof calculateAverageScores>;
    needsAttention: boolean;
    topStrength: string;
    primaryWeakness: string;
  }>
): string[] {
  const opportunities: string[] = [];

  // Find common weaknesses
  const weaknesses = staffPerformance.map(s => s.primaryWeakness);
  const weaknessCounts: Record<string, number> = {};
  weaknesses.forEach(w => { weaknessCounts[w] = (weaknessCounts[w] || 0) + 1; });

  const mostCommonWeakness = Object.entries(weaknessCounts)
    .sort(([, a], [, b]) => b - a)[0];

  if (mostCommonWeakness && mostCommonWeakness[1] > 1) {
    opportunities.push(`Team-wide training opportunity: ${mostCommonWeakness[0]} (${mostCommonWeakness[1]} staff members)`);
  }

  // Check for low practice frequency
  const lowPractice = staffPerformance.filter(s => s.sessionsCount < 3);
  if (lowPractice.length > 0) {
    opportunities.push(`${lowPractice.length} staff member(s) need more practice sessions`);
  }

  // Check for high performers to leverage as mentors
  const highPerformers = staffPerformance.filter(s => s.averageScores.overall >= 85);
  if (highPerformers.length > 0) {
    opportunities.push(`${highPerformers.length} high performer(s) could mentor others`);
  }

  return opportunities;
}

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
  // US-365: Real-time Practice Feedback
  // ============================================

  /**
   * Analyze a practice session and generate detailed feedback
   * This is the core procedure for US-365
   */
  analyzePractice: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        includeAlternatives: z.boolean().default(true),
        includeIdealComparison: z.boolean().default(true),
      })
    )
    .query(async ({ ctx, input }) => {
      const { sessionId, includeAlternatives, includeIdealComparison } = input;

      // Get session with scenario details
      const session = await ctx.prisma.practiceSession.findFirst({
        where: {
          id: sessionId,
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

      if (session.status === 'IN_PROGRESS') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot analyze session that is still in progress',
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

      if (conversationHistory.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Session has no conversation history to analyze',
        });
      }

      // Generate detailed analysis
      const analysis = generateDetailedAnalysis(
        conversationHistory,
        {
          expectedOutcomes: session.scenario.expectedOutcomes,
          keyPhrases: session.scenario.keyPhrases,
          avoidPhrases: session.scenario.avoidPhrases,
          targetDurationSecs: session.scenario.targetDurationSecs,
          idealResponse: session.scenario.idealResponse,
        },
        session.durationSecs || 0
      );

      // Store analysis in session if not already stored
      if (!session.aiAnalysis) {
        await ctx.prisma.practiceSession.update({
          where: { id: sessionId },
          data: {
            aiAnalysis: analysis as unknown as Prisma.InputJsonValue,
          },
        });
      }

      // Create detailed performance feedback entries if they don't exist
      const existingFeedbackCategories = new Set(session.feedback.map(f => f.category));
      const newFeedbackEntries: Prisma.PerformanceFeedbackCreateManyInput[] = [];

      const categoryMappings: { key: keyof typeof analysis.categories; dbCategory: 'TONE' | 'EMPATHY' | 'SCRIPT_ADHERENCE' | 'RESPONSE_TIME' | 'PROBLEM_SOLVING' | 'PROFESSIONALISM' }[] = [
        { key: 'tone', dbCategory: 'TONE' },
        { key: 'empathy', dbCategory: 'EMPATHY' },
        { key: 'scriptAdherence', dbCategory: 'SCRIPT_ADHERENCE' },
        { key: 'timing', dbCategory: 'RESPONSE_TIME' },
        { key: 'problemSolving', dbCategory: 'PROBLEM_SOLVING' },
        { key: 'professionalism', dbCategory: 'PROFESSIONALISM' },
      ];

      for (const mapping of categoryMappings) {
        if (!existingFeedbackCategories.has(mapping.dbCategory)) {
          const categoryAnalysis = analysis.categories[mapping.key];
          newFeedbackEntries.push({
            sessionId: session.id,
            organizationId: ctx.user.organizationId,
            category: mapping.dbCategory,
            feedback: categoryAnalysis.observations.join('. '),
            score: categoryAnalysis.score,
            suggestions: categoryAnalysis.improvementTips,
            priority: categoryAnalysis.score < 50 ? 'HIGH' : categoryAnalysis.score < 70 ? 'NORMAL' : 'LOW',
            isAIGenerated: true,
          });
        }
      }

      if (newFeedbackEntries.length > 0) {
        await ctx.prisma.performanceFeedback.createMany({
          data: newFeedbackEntries,
        });
      }

      // Build response
      const response: {
        sessionId: string;
        scenario: { name: string; type: string; difficulty: string };
        overall: typeof analysis.overall;
        categories: typeof analysis.categories;
        strengthsAndImprovements: typeof analysis.strengthsAndImprovements;
        conversationFlow: typeof analysis.conversationFlow;
        missedOpportunities: typeof analysis.missedOpportunities;
        recommendedPractice: typeof analysis.recommendedPractice;
        alternativeResponses?: typeof analysis.alternativeResponses;
        idealComparison?: typeof analysis.idealComparison;
      } = {
        sessionId: session.id,
        scenario: {
          name: session.scenario.name,
          type: session.scenario.type,
          difficulty: session.scenario.difficulty,
        },
        overall: analysis.overall,
        categories: analysis.categories,
        strengthsAndImprovements: analysis.strengthsAndImprovements,
        conversationFlow: analysis.conversationFlow,
        missedOpportunities: analysis.missedOpportunities,
        recommendedPractice: analysis.recommendedPractice,
      };

      if (includeAlternatives) {
        response.alternativeResponses = analysis.alternativeResponses;
      }

      if (includeIdealComparison) {
        response.idealComparison = analysis.idealComparison;
      }

      return response;
    }),

  /**
   * Get real-time feedback during an active session
   * Provides live guidance without ending the session
   */
  getLiveFeedback: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        lastMessageTimestamp: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { sessionId, lastMessageTimestamp } = input;

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

      // Parse conversation history
      let conversationHistory: ConversationMessage[] = [];
      if (session.transcript) {
        try {
          conversationHistory = JSON.parse(session.transcript);
        } catch {
          conversationHistory = [];
        }
      }

      // Get messages since last timestamp
      const recentMessages = lastMessageTimestamp
        ? conversationHistory.filter(m => m.timestamp > lastMessageTimestamp)
        : conversationHistory;

      if (recentMessages.length === 0) {
        return {
          sessionId,
          currentStatus: 'waiting_for_input',
          liveFeedback: [],
          suggestions: [],
          progressIndicators: {
            messageCount: conversationHistory.length,
            estimatedProgress: Math.min(100, (conversationHistory.length / 10) * 100),
          },
        };
      }

      // Analyze recent messages for live feedback
      const userMessages = recentMessages
        .filter(m => m.role === 'user')
        .map(m => m.content);

      const liveFeedback: {
        type: 'positive' | 'suggestion' | 'warning';
        message: string;
        category: string;
      }[] = [];

      // Check for positive indicators
      const empathyPhrases = ['understand', 'sorry to hear', 'i can see'];
      const hasEmpathy = userMessages.some(m =>
        empathyPhrases.some(p => m.toLowerCase().includes(p))
      );

      if (hasEmpathy) {
        liveFeedback.push({
          type: 'positive',
          message: 'Great use of empathetic language!',
          category: 'empathy',
        });
      }

      // Check for areas needing improvement
      const lastUserMessage = userMessages[userMessages.length - 1];
      if (lastUserMessage) {
        if (lastUserMessage.length < 20) {
          liveFeedback.push({
            type: 'suggestion',
            message: 'Consider providing more detail in your response',
            category: 'communication',
          });
        }

        if (!lastUserMessage.toLowerCase().includes('?') &&
            conversationHistory.length < 4) {
          liveFeedback.push({
            type: 'suggestion',
            message: 'Ask clarifying questions to better understand the caller\'s needs',
            category: 'problem_solving',
          });
        }
      }

      // Generate contextual suggestions
      const suggestions: string[] = [];
      const conversationLength = conversationHistory.length;

      if (conversationLength < 3) {
        suggestions.push('Build rapport with the caller');
        suggestions.push('Gather information about their main concern');
      } else if (conversationLength < 6) {
        suggestions.push('Work toward resolving the main issue');
        if (!hasEmpathy) {
          suggestions.push('Acknowledge the caller\'s feelings');
        }
      } else {
        suggestions.push('Begin wrapping up the call');
        suggestions.push('Confirm the resolution meets their needs');
        suggestions.push('Offer additional assistance');
      }

      // Calculate progress
      const targetMessages = 10; // Typical call length
      const estimatedProgress = Math.min(100, Math.round((conversationLength / targetMessages) * 100));

      return {
        sessionId,
        currentStatus: 'in_progress',
        liveFeedback,
        suggestions: suggestions.slice(0, 3),
        progressIndicators: {
          messageCount: conversationLength,
          estimatedProgress,
          keyPhrasesUsed: session.scenario.keyPhrases.filter(p =>
            userMessages.some(m => m.toLowerCase().includes(p.toLowerCase()))
          ).length,
          totalKeyPhrases: session.scenario.keyPhrases.length,
        },
      };
    }),

  /**
   * Get feedback comparison across multiple sessions
   * Shows improvement trends over time
   */
  getFeedbackTrends: protectedProcedure
    .input(
      z.object({
        scenarioType: scenarioTypeEnum.optional(),
        limit: z.number().min(2).max(20).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const { scenarioType, limit } = input;

      const sessions = await ctx.prisma.practiceSession.findMany({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
          status: 'COMPLETED',
          ...(scenarioType && { scenario: { type: scenarioType } }),
        },
        orderBy: { startedAt: 'desc' },
        take: limit,
        select: {
          id: true,
          startedAt: true,
          overallScore: true,
          toneScore: true,
          empathyScore: true,
          scriptAdherenceScore: true,
          timingScore: true,
          outcomeAchieved: true,
          scenario: {
            select: {
              name: true,
              type: true,
              difficulty: true,
            },
          },
        },
      });

      if (sessions.length < 2) {
        return {
          message: 'Need at least 2 completed sessions to show trends',
          sessions: sessions,
          trends: null,
        };
      }

      // Calculate trends (newest to oldest)
      const sortedSessions = [...sessions].reverse(); // oldest first for trend calculation

      const calculateTrend = (scores: (number | null)[]): { direction: 'improving' | 'stable' | 'declining'; percentage: number } => {
        const validScores = scores.filter((s): s is number => s !== null);
        if (validScores.length < 2) return { direction: 'stable', percentage: 0 };

        const firstHalf = validScores.slice(0, Math.floor(validScores.length / 2));
        const secondHalf = validScores.slice(Math.floor(validScores.length / 2));

        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

        const change = ((secondAvg - firstAvg) / firstAvg) * 100;

        if (change > 5) return { direction: 'improving', percentage: Math.round(change) };
        if (change < -5) return { direction: 'declining', percentage: Math.round(Math.abs(change)) };
        return { direction: 'stable', percentage: 0 };
      };

      const trends = {
        overall: calculateTrend(sortedSessions.map(s => s.overallScore)),
        tone: calculateTrend(sortedSessions.map(s => s.toneScore)),
        empathy: calculateTrend(sortedSessions.map(s => s.empathyScore)),
        scriptAdherence: calculateTrend(sortedSessions.map(s => s.scriptAdherenceScore)),
        timing: calculateTrend(sortedSessions.map(s => s.timingScore)),
        outcomeRate: {
          current: Math.round((sessions.filter(s => s.outcomeAchieved).length / sessions.length) * 100),
          sessions: sessions.length,
        },
      };

      // Identify areas of most improvement and areas needing focus
      const categoryTrends = [
        { name: 'tone', ...trends.tone },
        { name: 'empathy', ...trends.empathy },
        { name: 'scriptAdherence', ...trends.scriptAdherence },
        { name: 'timing', ...trends.timing },
      ];

      const improving = categoryTrends
        .filter(t => t.direction === 'improving')
        .sort((a, b) => b.percentage - a.percentage);

      const declining = categoryTrends
        .filter(t => t.direction === 'declining')
        .sort((a, b) => b.percentage - a.percentage);

      return {
        sessions: sessions.map(s => ({
          id: s.id,
          date: s.startedAt,
          scenario: s.scenario.name,
          type: s.scenario.type,
          difficulty: s.scenario.difficulty,
          overallScore: s.overallScore,
          outcomeAchieved: s.outcomeAchieved,
        })),
        trends,
        insights: {
          improving: improving.map(t => t.name),
          needsWork: declining.map(t => t.name),
          recommendation: declining.length > 0
            ? `Focus on improving ${declining[0].name.replace(/([A-Z])/g, ' $1').toLowerCase()}`
            : improving.length > 0
              ? `Great progress on ${improving[0].name.replace(/([A-Z])/g, ' $1').toLowerCase()}! Keep it up.`
              : 'Maintain consistent practice to see improvement trends.',
        },
      };
    }),

  /**
   * Get specific feedback for a category
   */
  getCategoryFeedback: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        category: z.enum(['TONE', 'EMPATHY', 'SCRIPT_ADHERENCE', 'RESPONSE_TIME', 'PROBLEM_SOLVING', 'PROFESSIONALISM', 'KNOWLEDGE', 'COMMUNICATION']),
      })
    )
    .query(async ({ ctx, input }) => {
      const { sessionId, category } = input;

      const session = await ctx.prisma.practiceSession.findFirst({
        where: {
          id: sessionId,
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          scenario: true,
          feedback: {
            where: { category },
          },
        },
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Session not found',
        });
      }

      // Parse conversation for specific examples
      let conversationHistory: ConversationMessage[] = [];
      if (session.transcript) {
        try {
          conversationHistory = JSON.parse(session.transcript);
        } catch {
          conversationHistory = [];
        }
      }

      const userMessages = conversationHistory
        .filter(m => m.role === 'user')
        .map(m => m.content);

      // Get the stored feedback
      const feedback = session.feedback[0];

      // Generate category-specific analysis
      const categoryAnalysis = (() => {
        switch (category) {
          case 'TONE':
            return analyzeTone(conversationHistory, userMessages);
          case 'EMPATHY':
            return analyzeEmpathy(conversationHistory, userMessages, conversationHistory.filter(m => m.role === 'ai').map(m => m.content));
          case 'SCRIPT_ADHERENCE':
            return analyzeScriptAdherence(userMessages, session.scenario.keyPhrases, session.scenario.avoidPhrases);
          case 'RESPONSE_TIME':
            return analyzeTiming(conversationHistory, session.scenario.targetDurationSecs, session.durationSecs || 0);
          case 'PROBLEM_SOLVING':
            return analyzeProblemSolving(conversationHistory, session.scenario.expectedOutcomes, userMessages);
          case 'PROFESSIONALISM':
            return analyzeProfessionalism(conversationHistory, userMessages);
          default:
            return null;
        }
      })();

      return {
        sessionId,
        category,
        storedFeedback: feedback || null,
        detailedAnalysis: categoryAnalysis,
        relatedTrainingResources: getCategoryTrainingResources(category),
      };
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

  // ============================================
  // US-366: Onboarding Workflows
  // ============================================

  /**
   * Start onboarding journey for a new employee
   * Creates personalized onboarding path based on role
   */
  startOnboarding: protectedProcedure
    .input(
      z.object({
        userId: z.string().optional(), // If not provided, starts for current user
        role: z.enum(['OWNER', 'ADMIN', 'PROVIDER', 'STAFF', 'BILLER']).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const targetUserId = input.userId || ctx.user.id;

      // Get user to determine role
      const user = await ctx.prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, firstName: true, lastName: true, role: true, email: true },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      const userRole = input.role || user.role;

      // Get role-specific onboarding modules
      const onboardingModules = await ctx.prisma.trainingModule.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          type: 'ONBOARDING',
          isActive: true,
          requiredFor: { has: userRole },
        },
        orderBy: { order: 'asc' },
      });

      if (onboardingModules.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `No onboarding modules configured for role: ${userRole}`,
        });
      }

      // Create or update progress for each module
      const progressRecords = await Promise.all(
        onboardingModules.map(async (module, index) => {
          // Calculate due date based on module's dueWithinDays
          const dueDate = module.dueWithinDays
            ? new Date(Date.now() + module.dueWithinDays * 24 * 60 * 60 * 1000)
            : null;

          // Check if progress already exists
          const existing = await ctx.prisma.trainingProgress.findUnique({
            where: {
              userId_moduleId: {
                userId: targetUserId,
                moduleId: module.id,
              },
            },
          });

          if (existing) {
            // Reset if failed or expired
            if (existing.status === 'FAILED' || existing.status === 'EXPIRED') {
              return ctx.prisma.trainingProgress.update({
                where: { id: existing.id },
                data: {
                  status: index === 0 ? 'IN_PROGRESS' : 'NOT_STARTED',
                  startedAt: index === 0 ? new Date() : null,
                  completedAt: null,
                  score: null,
                  attemptNumber: existing.attemptNumber + 1,
                  currentStep: 0,
                  progressData: Prisma.JsonNull,
                  quizResults: Prisma.JsonNull,
                  dueDate,
                },
              });
            }
            return existing;
          }

          // Create new progress record
          return ctx.prisma.trainingProgress.create({
            data: {
              userId: targetUserId,
              moduleId: module.id,
              organizationId: ctx.user.organizationId,
              status: index === 0 ? 'IN_PROGRESS' : 'NOT_STARTED',
              startedAt: index === 0 ? new Date() : null,
              totalSteps: (module.content as { steps?: unknown[] })?.steps?.length || 1,
              dueDate,
            },
          });
        })
      );

      // Audit log
      await auditLog('CREATE', 'OnboardingProgress', {
        entityId: targetUserId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          targetUser: `${user.firstName} ${user.lastName}`,
          role: userRole,
          modulesCount: onboardingModules.length,
        },
      });

      // Calculate onboarding path summary
      const totalDuration = onboardingModules.reduce((sum, m) => sum + m.duration, 0);
      const firstModule = onboardingModules[0];

      return {
        userId: targetUserId,
        userName: `${user.firstName} ${user.lastName}`,
        role: userRole,
        onboardingPath: {
          totalModules: onboardingModules.length,
          totalDurationMinutes: totalDuration,
          estimatedCompletionDays: Math.ceil(totalDuration / 120), // ~2 hours/day
          modules: onboardingModules.map((m, i) => ({
            id: m.id,
            name: m.name,
            description: m.description,
            duration: m.duration,
            order: i + 1,
            status: progressRecords[i].status,
            dueDate: progressRecords[i].dueDate,
          })),
        },
        currentModule: {
          id: firstModule.id,
          name: firstModule.name,
          description: firstModule.description,
          type: firstModule.type,
          content: firstModule.content,
          duration: firstModule.duration,
          passingScore: firstModule.passingScore,
        },
        startedAt: new Date(),
      };
    }),

  /**
   * Get onboarding progress for a user
   */
  getOnboardingProgress: protectedProcedure
    .input(
      z.object({
        userId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const targetUserId = input.userId || ctx.user.id;

      // Get user info
      const user = await ctx.prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, firstName: true, lastName: true, role: true, createdAt: true },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Get all onboarding progress
      const progress = await ctx.prisma.trainingProgress.findMany({
        where: {
          userId: targetUserId,
          organizationId: ctx.user.organizationId,
          module: {
            type: 'ONBOARDING',
          },
        },
        include: {
          module: {
            select: {
              id: true,
              name: true,
              description: true,
              type: true,
              duration: true,
              passingScore: true,
              order: true,
              content: true,
            },
          },
        },
        orderBy: { module: { order: 'asc' } },
      });

      if (progress.length === 0) {
        return {
          userId: targetUserId,
          userName: `${user.firstName} ${user.lastName}`,
          role: user.role,
          onboardingStarted: false,
          modules: [],
          overallProgress: 0,
          currentModule: null,
          checkpoints: [],
          timeToCompetency: null,
        };
      }

      // Calculate overall progress
      const completedCount = progress.filter((p) => p.status === 'COMPLETED').length;
      const overallProgress = Math.round((completedCount / progress.length) * 100);

      // Find current module (first non-completed)
      const currentProgress = progress.find(
        (p) => p.status === 'IN_PROGRESS' || p.status === 'NOT_STARTED'
      );

      // Calculate time to competency
      const startDate = progress[0]?.startedAt || user.createdAt;
      const completionDate = progress.every((p) => p.status === 'COMPLETED')
        ? progress[progress.length - 1]?.completedAt
        : null;
      const timeToCompetencyDays = completionDate
        ? Math.ceil((completionDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      // Build checkpoints
      const checkpoints = progress
        .filter((p) => p.status === 'COMPLETED')
        .map((p) => ({
          moduleId: p.moduleId,
          moduleName: p.module.name,
          completedAt: p.completedAt,
          score: p.score,
          timeSpentMinutes: p.timeSpentMinutes,
        }));

      return {
        userId: targetUserId,
        userName: `${user.firstName} ${user.lastName}`,
        role: user.role,
        onboardingStarted: true,
        startedAt: startDate,
        completedAt: completionDate,
        modules: progress.map((p) => ({
          id: p.module.id,
          name: p.module.name,
          description: p.module.description,
          duration: p.module.duration,
          status: p.status,
          score: p.score,
          startedAt: p.startedAt,
          completedAt: p.completedAt,
          currentStep: p.currentStep,
          totalSteps: p.totalSteps,
          dueDate: p.dueDate,
          progressPercent: p.totalSteps > 0 ? Math.round((p.currentStep / p.totalSteps) * 100) : 0,
        })),
        overallProgress,
        currentModule: currentProgress
          ? {
              id: currentProgress.module.id,
              name: currentProgress.module.name,
              description: currentProgress.module.description,
              content: currentProgress.module.content,
              duration: currentProgress.module.duration,
              passingScore: currentProgress.module.passingScore,
              currentStep: currentProgress.currentStep,
              totalSteps: currentProgress.totalSteps,
            }
          : null,
        checkpoints,
        timeToCompetency: timeToCompetencyDays
          ? {
              days: timeToCompetencyDays,
              completedAt: completionDate,
            }
          : null,
      };
    }),

  /**
   * Update onboarding progress (advance step, complete module)
   */
  updateOnboardingProgress: protectedProcedure
    .input(
      z.object({
        moduleId: z.string(),
        currentStep: z.number().optional(),
        progressData: jsonSchema.optional(),
        quizResults: jsonSchema.optional(),
        markComplete: z.boolean().optional(),
        score: z.number().min(0).max(100).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { moduleId, currentStep, progressData, quizResults, markComplete, score } = input;

      // Get current progress
      const progress = await ctx.prisma.trainingProgress.findUnique({
        where: {
          userId_moduleId: {
            userId: ctx.user.id,
            moduleId,
          },
        },
        include: {
          module: {
            select: {
              id: true,
              name: true,
              passingScore: true,
              maxAttempts: true,
              order: true,
            },
          },
        },
      });

      if (!progress) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Training progress not found',
        });
      }

      if (progress.status === 'COMPLETED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Module already completed',
        });
      }

      const updateData: Prisma.TrainingProgressUpdateInput = {
        lastAccessAt: new Date(),
      };

      // Update step progress
      if (currentStep !== undefined) {
        updateData.currentStep = currentStep;
        if (progress.status === 'NOT_STARTED') {
          updateData.status = 'IN_PROGRESS';
          updateData.startedAt = new Date();
        }
      }

      // Update progress data
      if (progressData !== undefined) {
        updateData.progressData = progressData;
      }

      // Update quiz results
      if (quizResults !== undefined) {
        updateData.quizResults = quizResults;
      }

      // Handle completion
      if (markComplete && score !== undefined) {
        const passed = score >= progress.module.passingScore;

        if (passed) {
          updateData.status = 'COMPLETED';
          updateData.completedAt = new Date();
          updateData.score = score;
          updateData.currentStep = progress.totalSteps;
        } else {
          // Check if max attempts exceeded
          if (progress.attemptNumber >= progress.module.maxAttempts) {
            updateData.status = 'FAILED';
          } else {
            updateData.attemptNumber = progress.attemptNumber + 1;
            updateData.currentStep = 0;
            updateData.progressData = Prisma.JsonNull;
            updateData.quizResults = Prisma.JsonNull;
          }
          updateData.score = score;
        }
      }

      // Calculate time spent
      if (progress.startedAt) {
        const timeSpent = Math.round((Date.now() - progress.startedAt.getTime()) / 60000);
        updateData.timeSpentMinutes = timeSpent;
      }

      const updated = await ctx.prisma.trainingProgress.update({
        where: { id: progress.id },
        data: updateData,
        include: {
          module: true,
        },
      });

      // If completed, start next module and notify manager
      let nextModule = null;
      if (updated.status === 'COMPLETED') {
        // Find next module
        const nextProgress = await ctx.prisma.trainingProgress.findFirst({
          where: {
            userId: ctx.user.id,
            organizationId: ctx.user.organizationId,
            module: { type: 'ONBOARDING' },
            status: 'NOT_STARTED',
          },
          include: { module: true },
          orderBy: { module: { order: 'asc' } },
        });

        if (nextProgress) {
          await ctx.prisma.trainingProgress.update({
            where: { id: nextProgress.id },
            data: {
              status: 'IN_PROGRESS',
              startedAt: new Date(),
            },
          });
          nextModule = nextProgress.module;
        }

        // Notify managers
        await notifyManagersOnCompletion(ctx, progress.module.name, updated.score);

        // Check if all onboarding complete
        const remainingModules = await ctx.prisma.trainingProgress.count({
          where: {
            userId: ctx.user.id,
            organizationId: ctx.user.organizationId,
            module: { type: 'ONBOARDING' },
            status: { notIn: ['COMPLETED'] },
          },
        });

        if (remainingModules === 0) {
          // All onboarding complete - notify managers
          await notifyManagersOnOnboardingComplete(ctx);
        }
      }

      // Audit log
      await auditLog('UPDATE', 'TrainingProgress', {
        entityId: progress.moduleId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          moduleName: progress.module.name,
          status: updated.status,
          score: updated.score,
          currentStep: updated.currentStep,
        },
      });

      return {
        progress: {
          id: updated.id,
          moduleId: updated.moduleId,
          moduleName: updated.module.name,
          status: updated.status,
          score: updated.score,
          currentStep: updated.currentStep,
          totalSteps: updated.totalSteps,
          completedAt: updated.completedAt,
        },
        passed: updated.status === 'COMPLETED',
        nextModule: nextModule
          ? {
              id: nextModule.id,
              name: nextModule.name,
              description: nextModule.description,
              duration: nextModule.duration,
            }
          : null,
      };
    }),

  /**
   * Get onboarding pipeline (for managers)
   * Shows all employees in onboarding with their progress
   */
  getOnboardingPipeline: adminProcedure
    .input(
      z.object({
        status: z
          .enum(['all', 'in_progress', 'completed', 'overdue'])
          .optional()
          .default('all'),
        role: z.enum(['OWNER', 'ADMIN', 'PROVIDER', 'STAFF', 'BILLER']).optional(),
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { status, role, limit, cursor } = input;

      // Get all users with onboarding progress
      const userWhere: Prisma.UserWhereInput = {
        organizationId: ctx.user.organizationId,
        ...(role && { role }),
        trainingProgress: {
          some: {
            module: { type: 'ONBOARDING' },
          },
        },
      };

      const users = await ctx.prisma.user.findMany({
        where: userWhere,
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          createdAt: true,
          trainingProgress: {
            where: {
              module: { type: 'ONBOARDING' },
            },
            include: {
              module: {
                select: {
                  id: true,
                  name: true,
                  order: true,
                  duration: true,
                },
              },
            },
            orderBy: { module: { order: 'asc' } },
          },
        },
      });

      let hasMore = false;
      if (users.length > limit) {
        hasMore = true;
        users.pop();
      }

      // Process users into pipeline view
      const pipeline = users
        .map((user) => {
          const progress = user.trainingProgress;
          const completedCount = progress.filter((p) => p.status === 'COMPLETED').length;
          const totalCount = progress.length;
          const overallPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

          // Check for overdue
          const hasOverdue = progress.some(
            (p) => p.dueDate && p.dueDate < new Date() && p.status !== 'COMPLETED'
          );

          // Current module
          const current = progress.find(
            (p) => p.status === 'IN_PROGRESS' || p.status === 'NOT_STARTED'
          );

          // Time tracking
          const startDate = progress[0]?.startedAt || user.createdAt;
          const completionDate =
            completedCount === totalCount ? progress[totalCount - 1]?.completedAt : null;
          const daysInOnboarding = Math.ceil(
            (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24)
          );

          const userStatus =
            completedCount === totalCount
              ? 'completed'
              : hasOverdue
                ? 'overdue'
                : 'in_progress';

          return {
            userId: user.id,
            userName: `${user.firstName} ${user.lastName}`,
            email: user.email,
            role: user.role,
            startDate,
            completionDate,
            daysInOnboarding,
            status: userStatus,
            progress: {
              completed: completedCount,
              total: totalCount,
              percent: overallPercent,
            },
            currentModule: current
              ? {
                  id: current.module.id,
                  name: current.module.name,
                  dueDate: current.dueDate,
                  isOverdue: current.dueDate && current.dueDate < new Date(),
                }
              : null,
            hasOverdue,
          };
        })
        .filter((u) => {
          if (status === 'all') return true;
          return u.status === status;
        });

      // Summary stats
      const summary = {
        total: pipeline.length,
        inProgress: pipeline.filter((p) => p.status === 'in_progress').length,
        completed: pipeline.filter((p) => p.status === 'completed').length,
        overdue: pipeline.filter((p) => p.status === 'overdue').length,
        averageDaysToComplete:
          pipeline.filter((p) => p.status === 'completed').length > 0
            ? Math.round(
                pipeline
                  .filter((p) => p.status === 'completed')
                  .reduce((sum, p) => sum + p.daysInOnboarding, 0) /
                  pipeline.filter((p) => p.status === 'completed').length
              )
            : null,
      };

      return {
        employees: pipeline,
        summary,
        hasMore,
        nextCursor: hasMore ? users[users.length - 1].id : null,
      };
    }),

  /**
   * Create onboarding module (admin)
   */
  createOnboardingModule: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().optional(),
        content: jsonSchema,
        duration: z.number().min(1), // minutes
        requiredFor: z.array(z.enum(['OWNER', 'ADMIN', 'PROVIDER', 'STAFF', 'BILLER'])),
        prerequisiteIds: z.array(z.string()).optional(),
        order: z.number().optional(),
        passingScore: z.number().min(0).max(100).default(80),
        maxAttempts: z.number().min(1).default(3),
        dueWithinDays: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const module = await ctx.prisma.trainingModule.create({
        data: {
          name: input.name,
          description: input.description,
          type: 'ONBOARDING',
          content: input.content,
          duration: input.duration,
          requiredFor: input.requiredFor,
          prerequisiteIds: input.prerequisiteIds || [],
          order: input.order || 0,
          passingScore: input.passingScore,
          maxAttempts: input.maxAttempts,
          dueWithinDays: input.dueWithinDays,
          organizationId: ctx.user.organizationId,
        },
      });

      await auditLog('CREATE', 'TrainingModule', {
        entityId: module.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          moduleName: module.name,
          requiredFor: input.requiredFor,
        },
      });

      return module;
    }),

  /**
   * Update onboarding module (admin)
   */
  updateOnboardingModule: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
        description: z.string().optional(),
        content: jsonSchema.optional(),
        duration: z.number().min(1).optional(),
        requiredFor: z.array(z.enum(['OWNER', 'ADMIN', 'PROVIDER', 'STAFF', 'BILLER'])).optional(),
        prerequisiteIds: z.array(z.string()).optional(),
        order: z.number().optional(),
        passingScore: z.number().min(0).max(100).optional(),
        maxAttempts: z.number().min(1).optional(),
        dueWithinDays: z.number().nullable().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      const module = await ctx.prisma.trainingModule.update({
        where: { id, organizationId: ctx.user.organizationId },
        data: updateData,
      });

      await auditLog('UPDATE', 'TrainingModule', {
        entityId: module.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { moduleName: module.name, updates: Object.keys(updateData) },
      });

      return module;
    }),

  /**
   * Get onboarding modules (list for configuration)
   */
  getOnboardingModules: protectedProcedure
    .input(
      z.object({
        includeInactive: z.boolean().optional().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const modules = await ctx.prisma.trainingModule.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          type: 'ONBOARDING',
          ...(input.includeInactive ? {} : { isActive: true }),
        },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          name: true,
          description: true,
          duration: true,
          requiredFor: true,
          prerequisiteIds: true,
          order: true,
          passingScore: true,
          maxAttempts: true,
          dueWithinDays: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              progress: true,
            },
          },
        },
      });

      return modules;
    }),

  /**
   * Assign onboarding to user (manager action)
   */
  assignOnboarding: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        moduleIds: z.array(z.string()).optional(), // If not provided, assigns all required for role
        dueDate: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { userId, moduleIds, dueDate } = input;

      // Get user
      const user = await ctx.prisma.user.findUnique({
        where: { id: userId, organizationId: ctx.user.organizationId },
        select: { id: true, firstName: true, lastName: true, role: true },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Get modules to assign
      let modules;
      if (moduleIds && moduleIds.length > 0) {
        modules = await ctx.prisma.trainingModule.findMany({
          where: {
            id: { in: moduleIds },
            organizationId: ctx.user.organizationId,
            type: 'ONBOARDING',
            isActive: true,
          },
          orderBy: { order: 'asc' },
        });
      } else {
        modules = await ctx.prisma.trainingModule.findMany({
          where: {
            organizationId: ctx.user.organizationId,
            type: 'ONBOARDING',
            isActive: true,
            requiredFor: { has: user.role },
          },
          orderBy: { order: 'asc' },
        });
      }

      if (modules.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No modules found to assign',
        });
      }

      // Create progress records
      const created = await Promise.all(
        modules.map(async (module, index) => {
          const moduleDueDate = dueDate
            ? dueDate
            : module.dueWithinDays
              ? new Date(Date.now() + module.dueWithinDays * 24 * 60 * 60 * 1000)
              : null;

          return ctx.prisma.trainingProgress.upsert({
            where: {
              userId_moduleId: {
                userId,
                moduleId: module.id,
              },
            },
            create: {
              userId,
              moduleId: module.id,
              organizationId: ctx.user.organizationId,
              status: index === 0 ? 'IN_PROGRESS' : 'NOT_STARTED',
              startedAt: index === 0 ? new Date() : null,
              totalSteps: (module.content as { steps?: unknown[] })?.steps?.length || 1,
              dueDate: moduleDueDate,
            },
            update: {}, // Don't update if already exists
          });
        })
      );

      await auditLog('CREATE', 'OnboardingAssignment', {
        entityId: userId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          targetUser: `${user.firstName} ${user.lastName}`,
          modulesAssigned: modules.length,
          moduleNames: modules.map((m) => m.name),
        },
      });

      return {
        userId,
        userName: `${user.firstName} ${user.lastName}`,
        assignedModules: modules.length,
        modules: modules.map((m, i) => ({
          id: m.id,
          name: m.name,
          status: created[i].status,
          dueDate: created[i].dueDate,
        })),
      };
    }),

  /**
   * Get time-to-competency metrics
   */
  getTimeToCompetencyStats: adminProcedure
    .input(
      z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        role: z.enum(['OWNER', 'ADMIN', 'PROVIDER', 'STAFF', 'BILLER']).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { startDate, endDate, role } = input;

      // Get completed onboarding users
      const completedUsers = await ctx.prisma.user.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          ...(role && { role }),
          trainingProgress: {
            some: {
              module: { type: 'ONBOARDING' },
              status: 'COMPLETED',
              ...(startDate && { completedAt: { gte: startDate } }),
              ...(endDate && { completedAt: { lte: endDate } }),
            },
          },
        },
        select: {
          id: true,
          role: true,
          createdAt: true,
          trainingProgress: {
            where: {
              module: { type: 'ONBOARDING' },
            },
            select: {
              status: true,
              startedAt: true,
              completedAt: true,
              score: true,
              timeSpentMinutes: true,
              module: {
                select: { name: true, duration: true },
              },
            },
            orderBy: { module: { order: 'asc' } },
          },
        },
      });

      // Calculate metrics
      const metrics: {
        byRole: Record<
          string,
          { count: number; avgDays: number; avgScore: number; avgTimeMinutes: number }
        >;
        overall: { count: number; avgDays: number; avgScore: number; avgTimeMinutes: number };
        byModule: Record<string, { avgScore: number; avgTimeMinutes: number; completionRate: number }>;
      } = {
        byRole: {},
        overall: { count: 0, avgDays: 0, avgScore: 0, avgTimeMinutes: 0 },
        byModule: {},
      };

      completedUsers.forEach((user) => {
        const allCompleted = user.trainingProgress.every((p) => p.status === 'COMPLETED');
        if (!allCompleted) return;

        const firstStart = user.trainingProgress[0]?.startedAt || user.createdAt;
        const lastComplete = user.trainingProgress[user.trainingProgress.length - 1]?.completedAt;
        if (!lastComplete) return;

        const daysToComplete = Math.ceil(
          (lastComplete.getTime() - firstStart.getTime()) / (1000 * 60 * 60 * 24)
        );
        const avgScore =
          user.trainingProgress.reduce((sum, p) => sum + (p.score || 0), 0) /
          user.trainingProgress.length;
        const totalTime = user.trainingProgress.reduce((sum, p) => sum + p.timeSpentMinutes, 0);

        // Overall
        metrics.overall.count++;
        metrics.overall.avgDays += daysToComplete;
        metrics.overall.avgScore += avgScore;
        metrics.overall.avgTimeMinutes += totalTime;

        // By role
        if (!metrics.byRole[user.role]) {
          metrics.byRole[user.role] = { count: 0, avgDays: 0, avgScore: 0, avgTimeMinutes: 0 };
        }
        metrics.byRole[user.role].count++;
        metrics.byRole[user.role].avgDays += daysToComplete;
        metrics.byRole[user.role].avgScore += avgScore;
        metrics.byRole[user.role].avgTimeMinutes += totalTime;

        // By module
        user.trainingProgress.forEach((p) => {
          const moduleName = p.module.name;
          if (!metrics.byModule[moduleName]) {
            metrics.byModule[moduleName] = { avgScore: 0, avgTimeMinutes: 0, completionRate: 0 };
          }
          metrics.byModule[moduleName].avgScore += p.score || 0;
          metrics.byModule[moduleName].avgTimeMinutes += p.timeSpentMinutes;
          metrics.byModule[moduleName].completionRate++;
        });
      });

      // Calculate averages
      if (metrics.overall.count > 0) {
        metrics.overall.avgDays = Math.round(metrics.overall.avgDays / metrics.overall.count);
        metrics.overall.avgScore = Math.round(metrics.overall.avgScore / metrics.overall.count);
        metrics.overall.avgTimeMinutes = Math.round(
          metrics.overall.avgTimeMinutes / metrics.overall.count
        );
      }

      Object.keys(metrics.byRole).forEach((r) => {
        const data = metrics.byRole[r];
        data.avgDays = Math.round(data.avgDays / data.count);
        data.avgScore = Math.round(data.avgScore / data.count);
        data.avgTimeMinutes = Math.round(data.avgTimeMinutes / data.count);
      });

      Object.keys(metrics.byModule).forEach((m) => {
        const data = metrics.byModule[m];
        const count = data.completionRate;
        data.avgScore = Math.round(data.avgScore / count);
        data.avgTimeMinutes = Math.round(data.avgTimeMinutes / count);
        data.completionRate = count;
      });

      return metrics;
    }),

  // ============================================
  // US-367: Script Training and Practice
  // ============================================

  /**
   * Get available phone scripts for training
   */
  getScripts: protectedProcedure
    .input(
      z.object({
        type: z
          .enum([
            'SCHEDULING_CALL',
            'BILLING_INQUIRY',
            'COMPLAINT_HANDLING',
            'NEW_PATIENT_INTAKE',
            'CANCELLATION',
            'INSURANCE_QUESTIONS',
            'FOLLOW_UP_CALL',
            'EMERGENCY_TRIAGE',
          ])
          .optional(),
        includeArchived: z.boolean().optional().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const { type, includeArchived } = input;

      // Get scripts from scenarios that have detailed script content
      const scripts = await ctx.prisma.trainingScenario.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          ...(type && { type }),
          ...(includeArchived ? {} : { isActive: true }),
          script: { not: '' },
        },
        select: {
          id: true,
          name: true,
          description: true,
          type: true,
          difficulty: true,
          script: true,
          keyPhrases: true,
          avoidPhrases: true,
          expectedOutcomes: true,
          targetDurationSecs: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ type: 'asc' }, { difficulty: 'asc' }, { name: 'asc' }],
      });

      // Get user's mastery levels for each script
      const userMastery = await ctx.prisma.practiceSession.groupBy({
        by: ['scenarioId'],
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
          status: 'COMPLETED',
          scenarioId: { in: scripts.map((s) => s.id) },
        },
        _count: { id: true },
        _avg: { scriptAdherenceScore: true, overallScore: true },
        _max: { scriptAdherenceScore: true },
      });

      const masteryMap = new Map(
        userMastery.map((m) => [
          m.scenarioId,
          {
            practiceCount: m._count.id,
            avgAdherence: Math.round(m._avg.scriptAdherenceScore || 0),
            avgOverall: Math.round(m._avg.overallScore || 0),
            bestAdherence: m._max.scriptAdherenceScore || 0,
            masteryLevel: getMasteryLevel(m._count.id, m._avg.scriptAdherenceScore || 0),
          },
        ])
      );

      return scripts.map((script) => ({
        ...script,
        mastery: masteryMap.get(script.id) || {
          practiceCount: 0,
          avgAdherence: 0,
          avgOverall: 0,
          bestAdherence: 0,
          masteryLevel: 'NOVICE' as const,
        },
      }));
    }),

  /**
   * Get a specific script with full details
   */
  getScript: protectedProcedure
    .input(z.object({ scriptId: z.string() }))
    .query(async ({ ctx, input }) => {
      const script = await ctx.prisma.trainingScenario.findFirst({
        where: {
          id: input.scriptId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!script) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Script not found',
        });
      }

      // Get user's practice history for this script
      const practiceHistory = await ctx.prisma.practiceSession.findMany({
        where: {
          userId: ctx.user.id,
          scenarioId: script.id,
          status: 'COMPLETED',
        },
        orderBy: { endedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          overallScore: true,
          scriptAdherenceScore: true,
          endedAt: true,
          feedback: {
            where: { category: 'SCRIPT_ADHERENCE' },
            select: { feedback: true, suggestions: true },
          },
        },
      });

      // Calculate mastery progress
      const allScores = await ctx.prisma.practiceSession.findMany({
        where: {
          userId: ctx.user.id,
          scenarioId: script.id,
          status: 'COMPLETED',
        },
        select: { scriptAdherenceScore: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });

      const masteryProgress = {
        totalPractices: allScores.length,
        currentLevel: getMasteryLevel(allScores.length, allScores[allScores.length - 1]?.scriptAdherenceScore || 0),
        progressToNextLevel: calculateProgressToNextLevel(allScores),
        improvementTrend: calculateImprovementTrend(allScores),
      };

      return {
        script,
        practiceHistory,
        masteryProgress,
        keyPhrasesGuide: generateKeyPhrasesGuide(script.keyPhrases, script.type),
        avoidPhrasesGuide: generateAvoidPhrasesGuide(script.avoidPhrases, script.type),
      };
    }),

  /**
   * Start a script practice session
   */
  practiceScript: protectedProcedure
    .input(
      z.object({
        scriptId: z.string(),
        difficulty: difficultyLevelEnum.optional(),
        focusAreas: z
          .array(z.enum(['KEY_PHRASES', 'AVOID_PHRASES', 'TIMING', 'PERSONALIZATION', 'FULL_SCRIPT']))
          .optional()
          .default(['FULL_SCRIPT']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { scriptId, difficulty, focusAreas } = input;

      const script = await ctx.prisma.trainingScenario.findFirst({
        where: {
          id: scriptId,
          organizationId: ctx.user.organizationId,
          isActive: true,
        },
      });

      if (!script) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Script not found',
        });
      }

      // Determine difficulty based on user's history if not specified
      const effectiveDifficulty = difficulty || (await determineRecommendedDifficulty(ctx, script.id));

      // Generate AI persona for this practice
      const persona = generateAIPersona(script, effectiveDifficulty);

      // Create practice session
      const session = await ctx.prisma.practiceSession.create({
        data: {
          userId: ctx.user.id,
          scenarioId: script.id,
          organizationId: ctx.user.organizationId,
          status: 'IN_PROGRESS',
          transcript: JSON.stringify([]),
          aiAnalysis: {
            sessionType: 'SCRIPT_PRACTICE',
            difficulty: effectiveDifficulty,
            focusAreas,
            persona,
            expectedKeyPhrases: script.keyPhrases,
            avoidPhrases: script.avoidPhrases,
            currentPhase: 'opening',
          } as unknown as Prisma.InputJsonValue,
        },
      });

      // Generate opening based on script type
      const opening = generateOpeningLine(script.type, persona, script.openingLine);

      // Update transcript with opening
      await ctx.prisma.practiceSession.update({
        where: { id: session.id },
        data: {
          transcript: JSON.stringify([
            {
              role: 'ai',
              content: opening,
              timestamp: Date.now(),
              phase: 'opening',
            },
          ]),
        },
      });

      await auditLog('CREATE', 'ScriptPractice', {
        entityId: session.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { scriptId, difficulty: effectiveDifficulty, focusAreas },
      });

      return {
        sessionId: session.id,
        scriptName: script.name,
        scriptType: script.type,
        difficulty: effectiveDifficulty,
        persona: {
          name: persona.name,
          emotionalState: persona.emotionalState,
          speakingStyle: persona.speakingStyle,
        },
        opening,
        focusAreas,
        keyPhrases: script.keyPhrases,
        avoidPhrases: script.avoidPhrases,
        expectedOutcomes: script.expectedOutcomes,
        targetDurationSecs: script.targetDurationSecs,
        hints: getScriptHints(script.type, effectiveDifficulty, 'opening'),
      };
    }),

  /**
   * Submit a response during script practice
   */
  submitScriptResponse: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        response: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { sessionId, response } = input;

      const session = await ctx.prisma.practiceSession.findFirst({
        where: {
          id: sessionId,
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
          status: 'IN_PROGRESS',
        },
        include: { scenario: true },
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Active practice session not found',
        });
      }

      // Parse existing transcript
      let transcript: ConversationMessage[] = [];
      if (session.transcript) {
        try {
          transcript = JSON.parse(session.transcript);
        } catch {
          transcript = [];
        }
      }

      // Analyze response for key phrases
      const keyPhrasesUsed = session.scenario.keyPhrases.filter((phrase) =>
        response.toLowerCase().includes(phrase.toLowerCase())
      );
      const avoidPhrasesUsed = session.scenario.avoidPhrases.filter((phrase) =>
        response.toLowerCase().includes(phrase.toLowerCase())
      );

      // Add user response to transcript
      transcript.push({
        role: 'user',
        content: response,
        timestamp: Date.now(),
        keyPhrasesUsed,
        keyPhrasesAvoid: avoidPhrasesUsed,
      });

      // Determine current phase and generate AI response
      const sessionAnalysis = (session.aiAnalysis as Record<string, unknown>) || {};
      const sessionDifficulty = (sessionAnalysis.difficulty as DifficultyLevel) || session.scenario.difficulty;
      const phase = determineConversationPhase(transcript, session.scenario);
      const aiResponse = generateScriptAIResponse(session.scenario, transcript, phase, sessionDifficulty);

      // Add AI response to transcript
      transcript.push({
        role: 'ai',
        content: aiResponse.message,
        timestamp: Date.now(),
        sentiment: aiResponse.emotion as 'positive' | 'neutral' | 'negative',
      });

      // Update session
      await ctx.prisma.practiceSession.update({
        where: { id: sessionId },
        data: {
          transcript: JSON.stringify(transcript),
          aiAnalysis: {
            ...sessionAnalysis,
            currentPhase: phase,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      // Generate real-time feedback
      const realtimeFeedback = generateRealtimeScriptFeedback(
        response,
        session.scenario.keyPhrases,
        session.scenario.avoidPhrases,
        keyPhrasesUsed,
        avoidPhrasesUsed
      );

      return {
        aiResponse: aiResponse.message,
        aiEmotion: aiResponse.emotion,
        scenarioState: aiResponse.scenarioState,
        currentPhase: phase,
        keyPhrasesUsed,
        avoidPhrasesUsed,
        realtimeFeedback,
        hints: getScriptHints(session.scenario.type, sessionDifficulty, phase),
        nextExpectedAction: aiResponse.nextExpectedAction,
      };
    }),

  /**
   * Complete a script practice session
   */
  completeScriptPractice: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { sessionId } = input;

      const session = await ctx.prisma.practiceSession.findFirst({
        where: {
          id: sessionId,
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
          status: 'IN_PROGRESS',
        },
        include: { scenario: true },
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Active practice session not found',
        });
      }

      // Parse transcript
      let transcript: ConversationMessage[] = [];
      if (session.transcript) {
        try {
          transcript = JSON.parse(session.transcript);
        } catch {
          transcript = [];
        }
      }

      // Calculate script adherence score
      const scriptAnalysis = analyzeScriptAdherenceDetailed(
        transcript,
        session.scenario.keyPhrases,
        session.scenario.avoidPhrases,
        session.scenario.expectedOutcomes
      );

      // Calculate all scores
      const duration = Math.round((Date.now() - session.createdAt.getTime()) / 1000);
      const scores = calculateScriptPracticeScores(
        transcript,
        session.scenario,
        scriptAnalysis,
        duration
      );

      // Determine if outcomes achieved
      const outcomeAchieved = scriptAnalysis.outcomesAchieved >= session.scenario.expectedOutcomes.length * 0.7;

      // Generate detailed feedback
      const detailedFeedback = generateScriptPracticeFeedback(
        transcript,
        session.scenario,
        scriptAnalysis,
        scores
      );

      // Update session
      const updatedSession = await ctx.prisma.practiceSession.update({
        where: { id: sessionId },
        data: {
          status: 'COMPLETED',
          endedAt: new Date(),
          durationSecs: duration,
          overallScore: scores.overall,
          toneScore: scores.tone,
          empathyScore: scores.empathy,
          scriptAdherenceScore: scores.scriptAdherence,
          timingScore: scores.timing,
          outcomeAchieved,
          aiAnalysis: detailedFeedback as unknown as Prisma.InputJsonValue,
        },
      });

      // Create performance feedback entries
      await ctx.prisma.performanceFeedback.createMany({
        data: [
          {
            sessionId,
            category: 'SCRIPT_ADHERENCE',
            feedback: detailedFeedback.scriptAdherence.summary,
            suggestions: detailedFeedback.scriptAdherence.suggestions,
            score: scores.scriptAdherence,
            organizationId: ctx.user.organizationId,
          },
          {
            sessionId,
            category: 'TONE',
            feedback: detailedFeedback.tone.summary,
            suggestions: detailedFeedback.tone.suggestions,
            score: scores.tone,
            organizationId: ctx.user.organizationId,
          },
          {
            sessionId,
            category: 'EMPATHY',
            feedback: detailedFeedback.empathy.summary,
            suggestions: detailedFeedback.empathy.suggestions,
            score: scores.empathy,
            organizationId: ctx.user.organizationId,
          },
        ],
      });

      // Update mastery level
      const newMasteryLevel = await updateScriptMastery(ctx, session.scenario.id, scores.scriptAdherence);

      await auditLog('UPDATE', 'ScriptPractice', {
        entityId: sessionId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { status: 'COMPLETED', scores, masteryLevel: newMasteryLevel },
      });

      return {
        sessionId,
        scores,
        outcomeAchieved,
        detailedFeedback,
        scriptAnalysis,
        masteryLevel: newMasteryLevel,
        keyPhrasesBreakdown: scriptAnalysis.keyPhrasesBreakdown,
        avoidPhrasesBreakdown: scriptAnalysis.avoidPhrasesBreakdown,
        recommendedNextSteps: generateNextSteps(scores, session.scenario.type),
      };
    }),

  /**
   * Get script mastery levels for all scripts
   */
  getScriptMasteryLevels: protectedProcedure
    .input(
      z.object({
        userId: z.string().optional(), // Admin can view other users
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = input.userId || ctx.user.id;

      // Verify access if viewing other user
      if (input.userId && input.userId !== ctx.user.id) {
        const user = await ctx.prisma.user.findFirst({
          where: {
            id: ctx.user.id,
            organizationId: ctx.user.organizationId,
            role: { in: ['OWNER', 'ADMIN'] },
          },
        });
        if (!user) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Not authorized to view other users mastery',
          });
        }
      }

      // Get all scripts
      const scripts = await ctx.prisma.trainingScenario.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          type: true,
          difficulty: true,
        },
      });

      // Get mastery data for each script
      const masteryData = await Promise.all(
        scripts.map(async (script) => {
          const sessions = await ctx.prisma.practiceSession.findMany({
            where: {
              userId,
              scenarioId: script.id,
              status: 'COMPLETED',
            },
            select: {
              scriptAdherenceScore: true,
              overallScore: true,
              endedAt: true,
            },
            orderBy: { endedAt: 'desc' },
          });

          if (sessions.length === 0) {
            return {
              scriptId: script.id,
              scriptName: script.name,
              scriptType: script.type,
              difficulty: script.difficulty,
              masteryLevel: 'NOVICE' as const,
              practiceCount: 0,
              avgAdherence: 0,
              bestAdherence: 0,
              recentTrend: 'NEUTRAL' as const,
              lastPracticed: null,
            };
          }

          const avgAdherence = Math.round(
            sessions.reduce((sum, s) => sum + (s.scriptAdherenceScore || 0), 0) / sessions.length
          );
          const bestAdherence = Math.max(...sessions.map((s) => s.scriptAdherenceScore || 0));
          const masteryLevel = getMasteryLevel(sessions.length, avgAdherence);

          // Calculate recent trend (last 5 vs previous 5)
          const recent = sessions.slice(0, 5);
          const previous = sessions.slice(5, 10);
          const recentAvg =
            recent.reduce((sum, s) => sum + (s.scriptAdherenceScore || 0), 0) / recent.length;
          const previousAvg =
            previous.length > 0
              ? previous.reduce((sum, s) => sum + (s.scriptAdherenceScore || 0), 0) / previous.length
              : recentAvg;

          const recentTrend =
            recentAvg > previousAvg + 5
              ? ('IMPROVING' as const)
              : recentAvg < previousAvg - 5
                ? ('DECLINING' as const)
                : ('STABLE' as const);

          return {
            scriptId: script.id,
            scriptName: script.name,
            scriptType: script.type,
            difficulty: script.difficulty,
            masteryLevel,
            practiceCount: sessions.length,
            avgAdherence,
            bestAdherence,
            recentTrend,
            lastPracticed: sessions[0]?.endedAt || null,
          };
        })
      );

      // Group by type
      const byType = masteryData.reduce(
        (acc, item) => {
          if (!acc[item.scriptType]) {
            acc[item.scriptType] = [];
          }
          acc[item.scriptType].push(item);
          return acc;
        },
        {} as Record<string, typeof masteryData>
      );

      // Calculate overall stats
      const totalScripts = masteryData.length;
      const masteredCount = masteryData.filter((m) => m.masteryLevel === 'MASTER').length;
      const proficientCount = masteryData.filter((m) => m.masteryLevel === 'PROFICIENT').length;
      const competentCount = masteryData.filter((m) => m.masteryLevel === 'COMPETENT').length;
      const learningCount = masteryData.filter((m) => m.masteryLevel === 'LEARNING').length;
      const noviceCount = masteryData.filter((m) => m.masteryLevel === 'NOVICE').length;

      return {
        userId,
        overall: {
          totalScripts,
          masteredCount,
          proficientCount,
          competentCount,
          learningCount,
          noviceCount,
          overallProgress: Math.round(
            ((masteredCount * 100 + proficientCount * 80 + competentCount * 60 + learningCount * 30) /
              totalScripts)
          ),
        },
        byType,
        scripts: masteryData,
      };
    }),

  /**
   * Create a custom script for training
   */
  createScript: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().optional(),
        type: scenarioTypeEnum,
        difficulty: difficultyLevelEnum.default('BEGINNER'),
        script: z.string().min(10),
        keyPhrases: z.array(z.string()).min(1),
        avoidPhrases: z.array(z.string()).default([]),
        expectedOutcomes: z.array(z.string()).min(1),
        personaName: z.string().default('Patient'),
        personaTraits: z.array(z.string()).default([]),
        openingLine: z.string().optional(),
        targetDurationSecs: z.number().int().min(30).max(600).default(180),
        maxDurationSecs: z.number().int().min(60).max(900).default(300),
        tags: z.array(z.string()).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const script = await ctx.prisma.trainingScenario.create({
        data: {
          name: input.name,
          description: input.description,
          type: input.type,
          difficulty: input.difficulty,
          script: input.script,
          keyPhrases: input.keyPhrases,
          avoidPhrases: input.avoidPhrases,
          expectedOutcomes: input.expectedOutcomes,
          personaName: input.personaName,
          personaTraits: input.personaTraits,
          openingLine: input.openingLine,
          targetDurationSecs: input.targetDurationSecs,
          maxDurationSecs: input.maxDurationSecs,
          tags: [...input.tags, 'script_training'],
          organizationId: ctx.user.organizationId,
        },
      });

      await auditLog('CREATE', 'TrainingScript', {
        entityId: script.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: input as Record<string, unknown>,
      });

      return script;
    }),

  /**
   * Get recommended scripts based on user's weaknesses
   */
  getRecommendedScripts: protectedProcedure.query(async ({ ctx }) => {
    // Get user's practice history
    const recentSessions = await ctx.prisma.practiceSession.findMany({
      where: {
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        status: 'COMPLETED',
      },
      include: {
        scenario: {
          select: {
            type: true,
            difficulty: true,
          },
        },
      },
      orderBy: { endedAt: 'desc' },
      take: 50,
    });

    // Analyze weaknesses by type
    const typeScores: Record<string, { total: number; count: number }> = {};
    recentSessions.forEach((session) => {
      const type = session.scenario.type;
      if (!typeScores[type]) {
        typeScores[type] = { total: 0, count: 0 };
      }
      typeScores[type].total += session.scriptAdherenceScore || 0;
      typeScores[type].count++;
    });

    // Find weak areas
    const weakTypes = Object.entries(typeScores)
      .filter(([_, data]) => data.count >= 2 && data.total / data.count < 70)
      .map(([type]) => type);

    // Find unpracticed types
    const practicedTypes = new Set(Object.keys(typeScores));
    const allTypes: ScenarioType[] = [
      'SCHEDULING_CALL',
      'BILLING_INQUIRY',
      'COMPLAINT_HANDLING',
      'NEW_PATIENT_INTAKE',
      'CANCELLATION',
      'INSURANCE_QUESTIONS',
      'FOLLOW_UP_CALL',
      'EMERGENCY_TRIAGE',
    ];
    const unpracticedTypes = allTypes.filter((t) => !practicedTypes.has(t));

    // Get recommended scripts
    const recommendations = await ctx.prisma.trainingScenario.findMany({
      where: {
        organizationId: ctx.user.organizationId,
        isActive: true,
        OR: [
          { type: { in: weakTypes as ScenarioType[] } },
          { type: { in: unpracticedTypes } },
        ],
      },
      select: {
        id: true,
        name: true,
        type: true,
        difficulty: true,
        description: true,
        keyPhrases: true,
      },
      take: 10,
    });

    return {
      recommendations: recommendations.map((script) => ({
        ...script,
        reason: weakTypes.includes(script.type)
          ? `Needs improvement - average score: ${Math.round((typeScores[script.type]?.total || 0) / (typeScores[script.type]?.count || 1))}%`
          : 'Not yet practiced',
        priority: weakTypes.includes(script.type) ? 'HIGH' : 'MEDIUM',
      })),
      weakAreas: weakTypes,
      unpracticedTypes,
      stats: {
        totalPracticed: recentSessions.length,
        typesCovered: practicedTypes.size,
        typesRemaining: unpracticedTypes.length,
      },
    };
  }),

  // ============================================
  // US-368: Compliance Training
  // ============================================

  /**
   * Get all compliance training modules
   */
  getComplianceModules: protectedProcedure
    .input(
      z.object({
        includeInactive: z.boolean().default(false),
        certType: z.enum([
          'HIPAA_PRIVACY',
          'HIPAA_SECURITY',
          'BILLING_COMPLIANCE',
          'WORKPLACE_SAFETY',
          'BLOOD_BORNE_PATHOGENS',
          'CUSTOMER_SERVICE',
          'PHONE_ETIQUETTE',
          'EHR_PROFICIENCY',
          'FRONT_DESK_OPERATIONS',
        ]).optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const modules = await ctx.prisma.trainingModule.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          type: 'COMPLIANCE',
          isActive: input?.includeInactive ? undefined : true,
        },
        orderBy: { order: 'asc' },
        include: {
          progress: {
            where: { userId: ctx.user.id },
          },
          certifications: {
            where: {
              userId: ctx.user.id,
              isActive: true,
            },
          },
        },
      });

      // Get renewal info for each module
      return modules.map((module) => {
        const progress = module.progress[0];
        const certification = module.certifications[0];
        const isExpired = certification?.expirationDate
          ? new Date(certification.expirationDate) < new Date()
          : false;
        const isExpiringSoon = certification?.expirationDate
          ? new Date(certification.expirationDate) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          : false;

        return {
          id: module.id,
          name: module.name,
          description: module.description,
          duration: module.duration,
          passingScore: module.passingScore,
          maxAttempts: module.maxAttempts,
          renewalDays: module.renewalDays,
          isActive: module.isActive,
          version: module.version,
          requiredFor: module.requiredFor,
          progress: progress
            ? {
                status: progress.status,
                score: progress.score,
                attemptNumber: progress.attemptNumber,
                startedAt: progress.startedAt,
                completedAt: progress.completedAt,
                dueDate: progress.dueDate,
              }
            : null,
          certification: certification
            ? {
                id: certification.id,
                certType: certification.certType,
                earnedDate: certification.earnedDate,
                expirationDate: certification.expirationDate,
                score: certification.score,
                certificateNumber: certification.certificateNumber,
                isExpired,
                isExpiringSoon,
              }
            : null,
        };
      });
    }),

  /**
   * Start a compliance training module
   */
  startComplianceModule: protectedProcedure
    .input(
      z.object({
        moduleId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const module = await ctx.prisma.trainingModule.findFirst({
        where: {
          id: input.moduleId,
          organizationId: ctx.user.organizationId,
          type: 'COMPLIANCE',
          isActive: true,
        },
      });

      if (!module) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Compliance training module not found',
        });
      }

      // Check prerequisites
      if (module.prerequisiteIds.length > 0) {
        const completedPrereqs = await ctx.prisma.trainingProgress.findMany({
          where: {
            userId: ctx.user.id,
            moduleId: { in: module.prerequisiteIds },
            status: 'COMPLETED',
          },
        });

        if (completedPrereqs.length < module.prerequisiteIds.length) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Prerequisites not completed',
          });
        }
      }

      // Check existing progress
      const existingProgress = await ctx.prisma.trainingProgress.findUnique({
        where: {
          userId_moduleId: {
            userId: ctx.user.id,
            moduleId: input.moduleId,
          },
        },
      });

      // Check if max attempts reached
      if (existingProgress && existingProgress.attemptNumber >= module.maxAttempts) {
        if (existingProgress.status !== 'COMPLETED') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: `Maximum attempts (${module.maxAttempts}) reached for this module`,
          });
        }
      }

      // Create or update progress
      const dueDate = module.dueWithinDays
        ? new Date(Date.now() + module.dueWithinDays * 24 * 60 * 60 * 1000)
        : null;

      const content = module.content as {
        sections?: Array<{
          id: string;
          title: string;
          content: string;
          quiz?: {
            questions: Array<{
              id: string;
              question: string;
              type: 'multiple_choice' | 'true_false';
              options?: string[];
              correctAnswer: string | number;
              explanation: string;
            }>;
          };
        }>;
        totalSteps?: number;
      } | null;

      const totalSteps = content?.sections?.length || content?.totalSteps || 1;

      const progress = existingProgress
        ? await ctx.prisma.trainingProgress.update({
            where: { id: existingProgress.id },
            data: {
              status: 'IN_PROGRESS',
              startedAt: new Date(),
              lastAccessAt: new Date(),
              currentStep: 0,
              totalSteps,
              progressData: Prisma.JsonNull,
              quizResults: Prisma.JsonNull,
              attemptNumber: existingProgress.status === 'COMPLETED'
                ? 1
                : existingProgress.attemptNumber + 1,
              dueDate,
            },
          })
        : await ctx.prisma.trainingProgress.create({
            data: {
              userId: ctx.user.id,
              moduleId: input.moduleId,
              organizationId: ctx.user.organizationId,
              status: 'IN_PROGRESS',
              startedAt: new Date(),
              lastAccessAt: new Date(),
              totalSteps,
              dueDate,
            },
          });

      await auditLog('TRAINING_START', 'ComplianceTraining', {
        entityId: input.moduleId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { moduleName: module.name, attemptNumber: progress.attemptNumber },
      });

      return {
        progressId: progress.id,
        moduleId: module.id,
        moduleName: module.name,
        description: module.description,
        duration: module.duration,
        passingScore: module.passingScore,
        attemptNumber: progress.attemptNumber,
        maxAttempts: module.maxAttempts,
        content: module.content,
        currentStep: 0,
        totalSteps,
        dueDate: progress.dueDate,
      };
    }),

  /**
   * Submit quiz answers for a compliance module section
   */
  submitComplianceQuiz: protectedProcedure
    .input(
      z.object({
        moduleId: z.string(),
        sectionIndex: z.number().int().min(0),
        answers: z.array(
          z.object({
            questionId: z.string(),
            answer: z.union([z.string(), z.number()]),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const module = await ctx.prisma.trainingModule.findFirst({
        where: {
          id: input.moduleId,
          organizationId: ctx.user.organizationId,
          type: 'COMPLIANCE',
        },
      });

      if (!module) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Module not found',
        });
      }

      const progress = await ctx.prisma.trainingProgress.findUnique({
        where: {
          userId_moduleId: {
            userId: ctx.user.id,
            moduleId: input.moduleId,
          },
        },
      });

      if (!progress || progress.status !== 'IN_PROGRESS') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No active training session found',
        });
      }

      // Get section quiz from module content
      const content = module.content as {
        sections?: Array<{
          id: string;
          title: string;
          quiz?: {
            questions: Array<{
              id: string;
              question: string;
              correctAnswer: string | number;
              explanation: string;
            }>;
          };
        }>;
      } | null;

      const section = content?.sections?.[input.sectionIndex];
      if (!section?.quiz) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Section does not have a quiz',
        });
      }

      // Grade the quiz
      const questions = section.quiz.questions;
      let correctCount = 0;
      const results: Array<{
        questionId: string;
        correct: boolean;
        userAnswer: string | number;
        correctAnswer: string | number;
        explanation: string;
      }> = [];

      input.answers.forEach((answer) => {
        const question = questions.find((q) => q.id === answer.questionId);
        if (question) {
          const isCorrect = String(question.correctAnswer) === String(answer.answer);
          if (isCorrect) correctCount++;
          results.push({
            questionId: answer.questionId,
            correct: isCorrect,
            userAnswer: answer.answer,
            correctAnswer: question.correctAnswer,
            explanation: question.explanation,
          });
        }
      });

      const sectionScore = Math.round((correctCount / questions.length) * 100);
      const passed = sectionScore >= module.passingScore;

      // Update quiz results
      const existingQuizResults = (progress.quizResults as Record<string, unknown>) || {};
      const updatedQuizResults = {
        ...existingQuizResults,
        [`section_${input.sectionIndex}`]: {
          score: sectionScore,
          passed,
          results,
          completedAt: new Date().toISOString(),
        },
      };

      await ctx.prisma.trainingProgress.update({
        where: { id: progress.id },
        data: {
          quizResults: updatedQuizResults as Prisma.InputJsonValue,
          lastAccessAt: new Date(),
        },
      });

      return {
        sectionIndex: input.sectionIndex,
        score: sectionScore,
        passed,
        passingScore: module.passingScore,
        correctCount,
        totalQuestions: questions.length,
        results,
        canProceed: passed,
      };
    }),

  /**
   * Advance to next section or complete compliance module
   */
  advanceComplianceModule: protectedProcedure
    .input(
      z.object({
        moduleId: z.string(),
        timeSpentMinutes: z.number().int().min(0).default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const module = await ctx.prisma.trainingModule.findFirst({
        where: {
          id: input.moduleId,
          organizationId: ctx.user.organizationId,
          type: 'COMPLIANCE',
        },
      });

      if (!module) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Module not found',
        });
      }

      const progress = await ctx.prisma.trainingProgress.findUnique({
        where: {
          userId_moduleId: {
            userId: ctx.user.id,
            moduleId: input.moduleId,
          },
        },
      });

      if (!progress || progress.status !== 'IN_PROGRESS') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No active training session found',
        });
      }

      const newStep = progress.currentStep + 1;
      const isComplete = newStep >= progress.totalSteps;

      if (isComplete) {
        // Calculate final score from all quiz results
        const quizResults = (progress.quizResults as Record<string, { score: number; passed: boolean }>) || {};
        const scores = Object.values(quizResults).map((r) => r.score);
        const finalScore = scores.length > 0
          ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
          : 100;
        const passed = finalScore >= module.passingScore;

        // Update progress
        await ctx.prisma.trainingProgress.update({
          where: { id: progress.id },
          data: {
            status: passed ? 'COMPLETED' : 'FAILED',
            currentStep: newStep,
            completedAt: new Date(),
            score: finalScore,
            timeSpentMinutes: progress.timeSpentMinutes + input.timeSpentMinutes,
            lastAccessAt: new Date(),
          },
        });

        // If passed, create or update certification
        if (passed) {
          const content = module.content as { certType?: string } | null;
          const certType = (content?.certType || 'HIPAA_PRIVACY') as 'HIPAA_PRIVACY' | 'HIPAA_SECURITY' | 'BILLING_COMPLIANCE' | 'WORKPLACE_SAFETY' | 'BLOOD_BORNE_PATHOGENS' | 'CUSTOMER_SERVICE' | 'PHONE_ETIQUETTE' | 'EHR_PROFICIENCY' | 'FRONT_DESK_OPERATIONS';

          // Calculate expiration date based on renewal days
          const expirationDate = module.renewalDays
            ? new Date(Date.now() + module.renewalDays * 24 * 60 * 60 * 1000)
            : null;

          // Check for existing certification
          const existingCert = await ctx.prisma.staffCertification.findFirst({
            where: {
              userId: ctx.user.id,
              moduleId: module.id,
              isActive: true,
            },
          });

          if (existingCert) {
            // Update existing certification
            await ctx.prisma.staffCertification.update({
              where: { id: existingCert.id },
              data: {
                earnedDate: new Date(),
                expirationDate,
                score: finalScore,
                attemptNumber: progress.attemptNumber,
                renewalReminderSent: false,
                renewalReminderDate: null,
              },
            });
          } else {
            // Create new certification
            await ctx.prisma.staffCertification.create({
              data: {
                userId: ctx.user.id,
                moduleId: module.id,
                organizationId: ctx.user.organizationId,
                certType,
                earnedDate: new Date(),
                expirationDate,
                score: finalScore,
                attemptNumber: progress.attemptNumber,
                certificateNumber: `CERT-${module.id.substring(0, 4).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
              },
            });
          }

          await auditLog('TRAINING_COMPLETE', 'ComplianceTraining', {
            entityId: input.moduleId,
            userId: ctx.user.id,
            organizationId: ctx.user.organizationId,
            changes: {
              moduleName: module.name,
              score: finalScore,
              passed: true,
              certType,
              expirationDate,
            },
          });
        } else {
          await auditLog('TRAINING_FAIL', 'ComplianceTraining', {
            entityId: input.moduleId,
            userId: ctx.user.id,
            organizationId: ctx.user.organizationId,
            changes: {
              moduleName: module.name,
              score: finalScore,
              passed: false,
              attemptNumber: progress.attemptNumber,
              maxAttempts: module.maxAttempts,
            },
          });
        }

        return {
          completed: true,
          passed,
          finalScore,
          passingScore: module.passingScore,
          attemptsRemaining: module.maxAttempts - progress.attemptNumber,
          canRetry: !passed && progress.attemptNumber < module.maxAttempts,
        };
      } else {
        // Just advance to next section
        await ctx.prisma.trainingProgress.update({
          where: { id: progress.id },
          data: {
            currentStep: newStep,
            timeSpentMinutes: progress.timeSpentMinutes + input.timeSpentMinutes,
            lastAccessAt: new Date(),
          },
        });

        return {
          completed: false,
          currentStep: newStep,
          totalSteps: progress.totalSteps,
        };
      }
    }),

  /**
   * Get user's certifications
   */
  getCertifications: protectedProcedure
    .input(
      z.object({
        userId: z.string().optional(),
        includeExpired: z.boolean().default(false),
        includeInactive: z.boolean().default(false),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const targetUserId = input?.userId || ctx.user.id;

      const certifications = await ctx.prisma.staffCertification.findMany({
        where: {
          userId: targetUserId,
          organizationId: ctx.user.organizationId,
          isActive: input?.includeInactive ? undefined : true,
          ...(input?.includeExpired
            ? {}
            : {
                OR: [
                  { expirationDate: null },
                  { expirationDate: { gte: new Date() } },
                ],
              }),
        },
        include: {
          module: {
            select: {
              id: true,
              name: true,
              description: true,
              renewalDays: true,
            },
          },
        },
        orderBy: { earnedDate: 'desc' },
      });

      const user = await ctx.prisma.user.findUnique({
        where: { id: targetUserId },
        select: { firstName: true, lastName: true, role: true },
      });

      return {
        userId: targetUserId,
        userName: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
        role: user?.role,
        certifications: certifications.map((cert) => {
          const isExpired = cert.expirationDate
            ? new Date(cert.expirationDate) < new Date()
            : false;
          const isExpiringSoon = cert.expirationDate
            ? new Date(cert.expirationDate) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) &&
              !isExpired
            : false;
          const daysUntilExpiration = cert.expirationDate
            ? Math.ceil(
                (new Date(cert.expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
              )
            : null;

          return {
            id: cert.id,
            certType: cert.certType,
            moduleName: cert.module?.name,
            moduleId: cert.moduleId,
            earnedDate: cert.earnedDate,
            expirationDate: cert.expirationDate,
            score: cert.score,
            certificateNumber: cert.certificateNumber,
            issuingAuthority: cert.issuingAuthority,
            isExpired,
            isExpiringSoon,
            daysUntilExpiration,
            renewalDays: cert.module?.renewalDays,
          };
        }),
        summary: {
          total: certifications.length,
          active: certifications.filter(
            (c) => !c.expirationDate || new Date(c.expirationDate) >= new Date()
          ).length,
          expiringSoon: certifications.filter(
            (c) =>
              c.expirationDate &&
              new Date(c.expirationDate) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) &&
              new Date(c.expirationDate) >= new Date()
          ).length,
          expired: certifications.filter(
            (c) => c.expirationDate && new Date(c.expirationDate) < new Date()
          ).length,
        },
      };
    }),

  /**
   * Get expiration alerts for staff certifications
   */
  getExpirationAlerts: protectedProcedure
    .input(
      z.object({
        daysAhead: z.number().int().min(1).max(365).default(30),
        includeExpired: z.boolean().default(true),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const daysAhead = input?.daysAhead || 30;
      const futureDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);

      const alerts = await ctx.prisma.staffCertification.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          isActive: true,
          expirationDate: {
            lte: futureDate,
            ...(input?.includeExpired ? {} : { gte: new Date() }),
          },
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            },
          },
          module: {
            select: {
              id: true,
              name: true,
              renewalDays: true,
            },
          },
        },
        orderBy: { expirationDate: 'asc' },
      });

      return {
        alerts: alerts.map((cert) => {
          const isExpired = new Date(cert.expirationDate!) < new Date();
          const daysUntilExpiration = Math.ceil(
            (new Date(cert.expirationDate!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          );

          return {
            certificationId: cert.id,
            certType: cert.certType,
            moduleName: cert.module?.name,
            moduleId: cert.moduleId,
            userId: cert.user.id,
            userName: `${cert.user.firstName} ${cert.user.lastName}`,
            userEmail: cert.user.email,
            userRole: cert.user.role,
            expirationDate: cert.expirationDate,
            isExpired,
            daysUntilExpiration,
            urgency: isExpired
              ? 'EXPIRED'
              : daysUntilExpiration <= 7
              ? 'CRITICAL'
              : daysUntilExpiration <= 14
              ? 'HIGH'
              : daysUntilExpiration <= 30
              ? 'MEDIUM'
              : 'LOW',
            renewalReminderSent: cert.renewalReminderSent,
          };
        }),
        summary: {
          total: alerts.length,
          expired: alerts.filter((a) => new Date(a.expirationDate!) < new Date()).length,
          criticallyExpiring: alerts.filter((a) => {
            const days = Math.ceil(
              (new Date(a.expirationDate!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            );
            return days > 0 && days <= 7;
          }).length,
          expiringSoon: alerts.filter((a) => {
            const days = Math.ceil(
              (new Date(a.expirationDate!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            );
            return days > 7 && days <= 30;
          }).length,
        },
      };
    }),

  /**
   * Send renewal reminder for a certification
   */
  sendRenewalReminder: adminProcedure
    .input(
      z.object({
        certificationId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const certification = await ctx.prisma.staffCertification.findFirst({
        where: {
          id: input.certificationId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          module: {
            select: {
              name: true,
            },
          },
        },
      });

      if (!certification) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Certification not found',
        });
      }

      // Mark reminder as sent
      await ctx.prisma.staffCertification.update({
        where: { id: input.certificationId },
        data: {
          renewalReminderSent: true,
          renewalReminderDate: new Date(),
        },
      });

      await auditLog('CERTIFICATION_RENEWAL_REMINDER', 'StaffCertification', {
        entityId: input.certificationId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          targetUser: `${certification.user.firstName} ${certification.user.lastName}`,
          certType: certification.certType,
          moduleName: certification.module?.name,
          expirationDate: certification.expirationDate,
        },
      });

      return {
        success: true,
        recipient: {
          name: `${certification.user.firstName} ${certification.user.lastName}`,
          email: certification.user.email,
        },
        certification: {
          type: certification.certType,
          moduleName: certification.module?.name,
          expirationDate: certification.expirationDate,
        },
      };
    }),

  /**
   * Get compliance training report for organization
   */
  getComplianceReport: adminProcedure
    .input(
      z.object({
        includeInactive: z.boolean().default(false),
        roleFilter: z.enum(['OWNER', 'ADMIN', 'PROVIDER', 'STAFF', 'BILLER']).optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      // Get all users
      const users = await ctx.prisma.user.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          isActive: input?.includeInactive ? undefined : true,
          ...(input?.roleFilter ? { role: input.roleFilter } : {}),
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
        },
      });

      // Get all compliance modules
      const modules = await ctx.prisma.trainingModule.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          type: 'COMPLIANCE',
          isActive: true,
        },
        orderBy: { order: 'asc' },
      });

      // Get all progress records
      const progress = await ctx.prisma.trainingProgress.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          moduleId: { in: modules.map((m) => m.id) },
        },
      });

      // Get all certifications
      const certifications = await ctx.prisma.staffCertification.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          moduleId: { in: modules.map((m) => m.id) },
          isActive: true,
        },
      });

      // Build report for each user
      const userReports = users.map((user) => {
        const userProgress = progress.filter((p) => p.userId === user.id);
        const userCerts = certifications.filter((c) => c.userId === user.id);

        // Check which modules are required for this user's role
        const requiredModules = modules.filter((m) => m.requiredFor.includes(user.role));
        const completedModules = requiredModules.filter((m) =>
          userCerts.some(
            (c) =>
              c.moduleId === m.id &&
              (!c.expirationDate || new Date(c.expirationDate) >= new Date())
          )
        );

        const expiredCerts = userCerts.filter(
          (c) => c.expirationDate && new Date(c.expirationDate) < new Date()
        );
        const expiringSoonCerts = userCerts.filter(
          (c) =>
            c.expirationDate &&
            new Date(c.expirationDate) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) &&
            new Date(c.expirationDate) >= new Date()
        );

        const complianceRate =
          requiredModules.length > 0
            ? Math.round((completedModules.length / requiredModules.length) * 100)
            : 100;

        return {
          userId: user.id,
          userName: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role,
          requiredModules: requiredModules.length,
          completedModules: completedModules.length,
          complianceRate,
          isFullyCompliant: complianceRate === 100,
          expiredCertifications: expiredCerts.length,
          expiringSoon: expiringSoonCerts.length,
          inProgressModules: userProgress.filter((p) => p.status === 'IN_PROGRESS').length,
          moduleDetails: requiredModules.map((m) => {
            const prog = userProgress.find((p) => p.moduleId === m.id);
            const cert = userCerts.find((c) => c.moduleId === m.id);
            const isExpired = cert?.expirationDate
              ? new Date(cert.expirationDate) < new Date()
              : false;

            return {
              moduleId: m.id,
              moduleName: m.name,
              status: cert && !isExpired
                ? 'CERTIFIED'
                : prog?.status === 'IN_PROGRESS'
                ? 'IN_PROGRESS'
                : isExpired
                ? 'EXPIRED'
                : 'NOT_STARTED',
              score: cert?.score || prog?.score,
              completedAt: prog?.completedAt,
              expirationDate: cert?.expirationDate,
            };
          }),
        };
      });

      // Calculate organization-wide metrics
      const totalRequired = userReports.reduce((sum, u) => sum + u.requiredModules, 0);
      const totalCompleted = userReports.reduce((sum, u) => sum + u.completedModules, 0);
      const fullyCompliantUsers = userReports.filter((u) => u.isFullyCompliant).length;

      return {
        generatedAt: new Date(),
        organizationId: ctx.user.organizationId,
        summary: {
          totalUsers: users.length,
          fullyCompliantUsers,
          complianceRate: totalRequired > 0 ? Math.round((totalCompleted / totalRequired) * 100) : 100,
          totalRequiredTrainings: totalRequired,
          totalCompletedTrainings: totalCompleted,
          usersWithExpiredCerts: userReports.filter((u) => u.expiredCertifications > 0).length,
          usersWithExpiringSoon: userReports.filter((u) => u.expiringSoon > 0).length,
        },
        modules: modules.map((m) => {
          const moduleProgress = progress.filter((p) => p.moduleId === m.id);
          const moduleCerts = certifications.filter((c) => c.moduleId === m.id);
          const validCerts = moduleCerts.filter(
            (c) => !c.expirationDate || new Date(c.expirationDate) >= new Date()
          );
          const usersRequired = users.filter((u) => m.requiredFor.includes(u.role)).length;

          return {
            moduleId: m.id,
            moduleName: m.name,
            requiredFor: m.requiredFor,
            usersRequired,
            usersCertified: validCerts.length,
            certificationRate: usersRequired > 0 ? Math.round((validCerts.length / usersRequired) * 100) : 100,
            inProgress: moduleProgress.filter((p) => p.status === 'IN_PROGRESS').length,
            averageScore: moduleCerts.length > 0
              ? Math.round(moduleCerts.reduce((sum, c) => sum + (c.score || 0), 0) / moduleCerts.length)
              : null,
          };
        }),
        users: userReports,
      };
    }),

  /**
   * Auto-assign required compliance training to users
   */
  autoAssignComplianceTraining: adminProcedure
    .input(
      z.object({
        userId: z.string().optional(), // If not provided, assigns to all users
        moduleIds: z.array(z.string()).optional(), // If not provided, assigns all required modules
        forceReassign: z.boolean().default(false), // Reassign even if already assigned
      }).optional()
    )
    .mutation(async ({ ctx, input }) => {
      // Get target users
      const users = input?.userId
        ? await ctx.prisma.user.findMany({
            where: {
              id: input.userId,
              organizationId: ctx.user.organizationId,
              isActive: true,
            },
          })
        : await ctx.prisma.user.findMany({
            where: {
              organizationId: ctx.user.organizationId,
              isActive: true,
            },
          });

      if (users.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No users found',
        });
      }

      // Get compliance modules
      const modules = await ctx.prisma.trainingModule.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          type: 'COMPLIANCE',
          isActive: true,
          ...(input?.moduleIds ? { id: { in: input.moduleIds } } : {}),
        },
      });

      if (modules.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No compliance modules found',
        });
      }

      // Get existing progress and certifications
      const existingProgress = await ctx.prisma.trainingProgress.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          moduleId: { in: modules.map((m) => m.id) },
          userId: { in: users.map((u) => u.id) },
        },
      });

      const existingCerts = await ctx.prisma.staffCertification.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          moduleId: { in: modules.map((m) => m.id) },
          userId: { in: users.map((u) => u.id) },
          isActive: true,
        },
      });

      // Track assignments
      const assignments: Array<{
        userId: string;
        userName: string;
        moduleId: string;
        moduleName: string;
        action: 'CREATED' | 'SKIPPED_EXISTING' | 'SKIPPED_CERTIFIED' | 'SKIPPED_NOT_REQUIRED';
      }> = [];

      // Assign modules to users
      for (const user of users) {
        for (const module of modules) {
          // Check if module is required for user's role
          if (!module.requiredFor.includes(user.role)) {
            assignments.push({
              userId: user.id,
              userName: `${user.firstName} ${user.lastName}`,
              moduleId: module.id,
              moduleName: module.name,
              action: 'SKIPPED_NOT_REQUIRED',
            });
            continue;
          }

          // Check for existing valid certification
          const hasCert = existingCerts.some(
            (c) =>
              c.userId === user.id &&
              c.moduleId === module.id &&
              (!c.expirationDate || new Date(c.expirationDate) >= new Date())
          );

          if (hasCert && !input?.forceReassign) {
            assignments.push({
              userId: user.id,
              userName: `${user.firstName} ${user.lastName}`,
              moduleId: module.id,
              moduleName: module.name,
              action: 'SKIPPED_CERTIFIED',
            });
            continue;
          }

          // Check for existing progress
          const hasProgress = existingProgress.some(
            (p) => p.userId === user.id && p.moduleId === module.id
          );

          if (hasProgress && !input?.forceReassign) {
            assignments.push({
              userId: user.id,
              userName: `${user.firstName} ${user.lastName}`,
              moduleId: module.id,
              moduleName: module.name,
              action: 'SKIPPED_EXISTING',
            });
            continue;
          }

          // Calculate due date
          const dueDate = module.dueWithinDays
            ? new Date(Date.now() + module.dueWithinDays * 24 * 60 * 60 * 1000)
            : null;

          const content = module.content as { sections?: unknown[] } | null;
          const totalSteps = content?.sections?.length || 1;

          // Create or reset progress
          if (hasProgress) {
            await ctx.prisma.trainingProgress.updateMany({
              where: {
                userId: user.id,
                moduleId: module.id,
              },
              data: {
                status: 'NOT_STARTED',
                startedAt: null,
                completedAt: null,
                score: null,
                currentStep: 0,
                totalSteps,
                progressData: Prisma.JsonNull,
                quizResults: Prisma.JsonNull,
                dueDate,
              },
            });
          } else {
            await ctx.prisma.trainingProgress.create({
              data: {
                userId: user.id,
                moduleId: module.id,
                organizationId: ctx.user.organizationId,
                status: 'NOT_STARTED',
                totalSteps,
                dueDate,
              },
            });
          }

          assignments.push({
            userId: user.id,
            userName: `${user.firstName} ${user.lastName}`,
            moduleId: module.id,
            moduleName: module.name,
            action: 'CREATED',
          });
        }
      }

      await auditLog('TRAINING_AUTO_ASSIGN', 'ComplianceTraining', {
        entityId: 'bulk',
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          usersProcessed: users.length,
          modulesProcessed: modules.length,
          assignmentsCreated: assignments.filter((a) => a.action === 'CREATED').length,
        },
      });

      const created = assignments.filter((a) => a.action === 'CREATED');
      const skippedCertified = assignments.filter((a) => a.action === 'SKIPPED_CERTIFIED');
      const skippedExisting = assignments.filter((a) => a.action === 'SKIPPED_EXISTING');
      const skippedNotRequired = assignments.filter((a) => a.action === 'SKIPPED_NOT_REQUIRED');

      return {
        success: true,
        summary: {
          usersProcessed: users.length,
          modulesProcessed: modules.length,
          assignmentsCreated: created.length,
          skippedAlreadyCertified: skippedCertified.length,
          skippedAlreadyAssigned: skippedExisting.length,
          skippedNotRequired: skippedNotRequired.length,
        },
        assignments,
      };
    }),

  /**
   * Create a new compliance training module
   */
  createComplianceModule: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().optional(),
        certType: z.enum([
          'HIPAA_PRIVACY',
          'HIPAA_SECURITY',
          'BILLING_COMPLIANCE',
          'WORKPLACE_SAFETY',
          'BLOOD_BORNE_PATHOGENS',
          'CUSTOMER_SERVICE',
          'PHONE_ETIQUETTE',
          'EHR_PROFICIENCY',
          'FRONT_DESK_OPERATIONS',
        ]),
        duration: z.number().int().min(5).max(480), // 5 minutes to 8 hours
        passingScore: z.number().int().min(50).max(100).default(80),
        maxAttempts: z.number().int().min(1).max(10).default(3),
        renewalDays: z.number().int().min(30).max(365).optional(), // Annual renewal
        dueWithinDays: z.number().int().min(1).max(90).optional(),
        requiredFor: z.array(z.enum(['OWNER', 'ADMIN', 'PROVIDER', 'STAFF', 'BILLER'])),
        prerequisiteIds: z.array(z.string()).default([]),
        content: z.object({
          certType: z.string(),
          sections: z.array(
            z.object({
              id: z.string(),
              title: z.string(),
              content: z.string(),
              videoUrl: z.string().optional(),
              quiz: z.object({
                questions: z.array(
                  z.object({
                    id: z.string(),
                    question: z.string(),
                    type: z.enum(['multiple_choice', 'true_false']),
                    options: z.array(z.string()).optional(),
                    correctAnswer: z.union([z.string(), z.number()]),
                    explanation: z.string(),
                  })
                ),
              }).optional(),
            })
          ),
        }),
        order: z.number().int().min(0).default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const module = await ctx.prisma.trainingModule.create({
        data: {
          name: input.name,
          description: input.description,
          type: 'COMPLIANCE',
          duration: input.duration,
          passingScore: input.passingScore,
          maxAttempts: input.maxAttempts,
          renewalDays: input.renewalDays,
          dueWithinDays: input.dueWithinDays,
          requiredFor: input.requiredFor,
          prerequisiteIds: input.prerequisiteIds,
          content: input.content as Prisma.InputJsonValue,
          order: input.order,
          organizationId: ctx.user.organizationId,
        },
      });

      await auditLog('CREATE', 'ComplianceModule', {
        entityId: module.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: {
          name: input.name,
          certType: input.certType,
          requiredFor: input.requiredFor,
          renewalDays: input.renewalDays,
        },
      });

      return module;
    }),

  /**
   * Update a compliance training module
   */
  updateComplianceModule: adminProcedure
    .input(
      z.object({
        moduleId: z.string(),
        name: z.string().min(1).max(200).optional(),
        description: z.string().optional(),
        duration: z.number().int().min(5).max(480).optional(),
        passingScore: z.number().int().min(50).max(100).optional(),
        maxAttempts: z.number().int().min(1).max(10).optional(),
        renewalDays: z.number().int().min(30).max(365).nullable().optional(),
        dueWithinDays: z.number().int().min(1).max(90).nullable().optional(),
        requiredFor: z.array(z.enum(['OWNER', 'ADMIN', 'PROVIDER', 'STAFF', 'BILLER'])).optional(),
        prerequisiteIds: z.array(z.string()).optional(),
        content: jsonSchema.optional(),
        order: z.number().int().min(0).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { moduleId, ...data } = input;

      const existing = await ctx.prisma.trainingModule.findFirst({
        where: {
          id: moduleId,
          organizationId: ctx.user.organizationId,
          type: 'COMPLIANCE',
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Compliance module not found',
        });
      }

      const updateData: Prisma.TrainingModuleUpdateInput = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.duration !== undefined) updateData.duration = data.duration;
      if (data.passingScore !== undefined) updateData.passingScore = data.passingScore;
      if (data.maxAttempts !== undefined) updateData.maxAttempts = data.maxAttempts;
      if (data.renewalDays !== undefined) updateData.renewalDays = data.renewalDays;
      if (data.dueWithinDays !== undefined) updateData.dueWithinDays = data.dueWithinDays;
      if (data.requiredFor !== undefined) updateData.requiredFor = data.requiredFor;
      if (data.prerequisiteIds !== undefined) updateData.prerequisiteIds = data.prerequisiteIds;
      if (data.content !== undefined) updateData.content = data.content;
      if (data.order !== undefined) updateData.order = data.order;
      if (data.isActive !== undefined) updateData.isActive = data.isActive;

      const updated = await ctx.prisma.trainingModule.update({
        where: { id: moduleId },
        data: updateData,
      });

      await auditLog('UPDATE', 'ComplianceModule', {
        entityId: moduleId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: updateData as Record<string, unknown>,
      });

      return updated;
    }),

  // ============================================
  // US-369: Performance Coaching
  // ============================================

  /**
   * Analyze a real call for coaching opportunities
   * Main entry point for US-369
   */
  coachFromCall: protectedProcedure
    .input(
      z.object({
        callId: z.string().optional(),
        transcript: z.string().optional(),
        callType: scenarioTypeEnum,
        callDuration: z.number().int().min(0),
        metadata: z
          .object({
            callerName: z.string().optional(),
            callDateTime: z.string().optional(),
            outcome: z.enum(['RESOLVED', 'ESCALATED', 'CALLBACK_SCHEDULED', 'UNRESOLVED']).optional(),
            notes: z.string().optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { callId, transcript, callType, callDuration, metadata } = input;

      if (!transcript) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Call transcript is required for coaching analysis',
        });
      }

      // Analyze the call transcript
      const analysis = analyzeRealCallForCoaching(transcript, callType, callDuration, metadata?.outcome);

      // Get user's historical performance for comparison
      const historicalData = await ctx.prisma.practiceSession.findMany({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
          status: 'COMPLETED',
          scenario: { type: callType },
        },
        orderBy: { endedAt: 'desc' },
        take: 20,
        select: {
          overallScore: true,
          toneScore: true,
          empathyScore: true,
          scriptAdherenceScore: true,
          endedAt: true,
        },
      });

      // Calculate performance trends - map to expected format
      const trends = calculatePerformanceTrends(
        historicalData.map(d => ({
          overallScore: d.overallScore,
          toneScore: d.toneScore,
          empathyScore: d.empathyScore,
          scriptAdherenceScore: d.scriptAdherenceScore,
          completedAt: d.endedAt,
        }))
      );

      // Generate personalized coaching insights
      const coachingInsights = generateCoachingInsights(analysis, trends, callType);

      // Create a performance feedback record
      const feedbackRecord = await ctx.prisma.performanceFeedback.create({
        data: {
          sessionId: callId || `real-call-${Date.now()}`,
          organizationId: ctx.user.organizationId,
          category: 'PROFESSIONALISM', // Using valid enum - OVERALL not available
          feedback: JSON.stringify(coachingInsights.summary),
          suggestions: coachingInsights.actionItems,
          score: analysis.overallScore,
          priority: coachingInsights.priority,
        },
      });

      // Check for micro-learning suggestions
      const microLearning = generateMicroLearningSuggestions(analysis, callType);

      await auditLog('CREATE', 'CoachingAnalysis', {
        entityId: feedbackRecord.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { callType, overallScore: analysis.overallScore },
      });

      return {
        analysisId: feedbackRecord.id,
        callType,
        duration: callDuration,
        analysis: {
          overallScore: analysis.overallScore,
          letterGrade: getLetterGrade(analysis.overallScore),
          categories: {
            tone: {
              score: analysis.toneScore,
              observations: analysis.toneObservations,
              keyMoments: analysis.toneKeyMoments,
            },
            empathy: {
              score: analysis.empathyScore,
              observations: analysis.empathyObservations,
              keyMoments: analysis.empathyKeyMoments,
            },
            problemSolving: {
              score: analysis.problemSolvingScore,
              observations: analysis.problemSolvingObservations,
              outcomeAchieved: metadata?.outcome === 'RESOLVED',
            },
            professionalism: {
              score: analysis.professionalismScore,
              observations: analysis.professionalismObservations,
            },
            timing: {
              score: analysis.timingScore,
              callDuration,
              pacingNotes: analysis.pacingNotes,
            },
          },
        },
        coachingInsights,
        trends,
        microLearning,
        metadata,
      };
    }),

  /**
   * Generate a personalized improvement plan based on performance history
   */
  generateImprovementPlan: protectedProcedure
    .input(
      z.object({
        userId: z.string().optional(), // Admin can view other users
        focusAreas: z.array(z.enum(['TONE', 'EMPATHY', 'SCRIPT_ADHERENCE', 'TIMING', 'PROBLEM_SOLVING', 'PROFESSIONALISM'])).optional(),
        timeframeWeeks: z.number().int().min(1).max(12).default(4),
      })
    )
    .query(async ({ ctx, input }) => {
      const targetUserId = input.userId || ctx.user.id;

      // Verify permission to view other users
      if (input.userId && input.userId !== ctx.user.id) {
        const user = await ctx.prisma.user.findFirst({
          where: { id: ctx.user.id },
        });
        if (user?.role !== 'OWNER' && user?.role !== 'ADMIN') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have permission to view other users improvement plans',
          });
        }
      }

      // Get comprehensive performance data
      const sessions = await ctx.prisma.practiceSession.findMany({
        where: {
          userId: targetUserId,
          organizationId: ctx.user.organizationId,
          status: 'COMPLETED',
        },
        orderBy: { endedAt: 'desc' },
        take: 50,
        include: {
          scenario: { select: { type: true, name: true } },
          feedback: true,
        },
      });

      // Get coaching feedback history
      const feedbackHistory = await ctx.prisma.performanceFeedback.findMany({
        where: {
          organizationId: ctx.user.organizationId,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      // Identify weaknesses and strengths - map to expected format
      const mappedSessions = sessions.map(s => ({
        overallScore: s.overallScore,
        toneScore: s.toneScore,
        empathyScore: s.empathyScore,
        scriptAdherenceScore: s.scriptAdherenceScore,
        timingScore: s.timingScore,
        completedAt: s.endedAt,
        scenario: s.scenario,
        feedback: s.feedback,
      }));
      const performanceProfile = buildPerformanceProfile(mappedSessions, feedbackHistory);

      // Generate improvement plan
      const improvementPlan = generateImprovementPlan(
        performanceProfile,
        input.focusAreas,
        input.timeframeWeeks
      );

      // Get user info
      const user = await ctx.prisma.user.findUnique({
        where: { id: targetUserId },
        select: { firstName: true, lastName: true, role: true },
      });

      return {
        userId: targetUserId,
        userName: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
        userRole: user?.role,
        generatedAt: new Date().toISOString(),
        timeframeWeeks: input.timeframeWeeks,
        performanceProfile,
        plan: improvementPlan,
        milestones: generateMilestones(improvementPlan, input.timeframeWeeks),
      };
    }),

  /**
   * Track improvement over time
   */
  getImprovementTracking: protectedProcedure
    .input(
      z.object({
        userId: z.string().optional(),
        periodDays: z.number().int().min(7).max(365).default(30),
        category: z.enum(['TONE', 'EMPATHY', 'SCRIPT_ADHERENCE', 'TIMING', 'PROBLEM_SOLVING', 'PROFESSIONALISM', 'OVERALL']).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const targetUserId = input.userId || ctx.user.id;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - input.periodDays);

      // Verify permission
      if (input.userId && input.userId !== ctx.user.id) {
        const user = await ctx.prisma.user.findFirst({ where: { id: ctx.user.id } });
        if (user?.role !== 'OWNER' && user?.role !== 'ADMIN') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Permission denied' });
        }
      }

      // Get sessions in period
      const sessionsRaw = await ctx.prisma.practiceSession.findMany({
        where: {
          userId: targetUserId,
          organizationId: ctx.user.organizationId,
          status: 'COMPLETED',
          endedAt: { gte: startDate },
        },
        orderBy: { endedAt: 'asc' },
        select: {
          id: true,
          overallScore: true,
          toneScore: true,
          empathyScore: true,
          scriptAdherenceScore: true,
          timingScore: true,
          endedAt: true,
          scenario: { select: { type: true, name: true } },
        },
      });

      // Map to expected format
      const sessions = sessionsRaw.map(s => ({
        id: s.id,
        overallScore: s.overallScore,
        toneScore: s.toneScore,
        empathyScore: s.empathyScore,
        scriptAdherenceScore: s.scriptAdherenceScore,
        timingScore: s.timingScore,
        completedAt: s.endedAt,
        scenario: s.scenario,
      }));

      // Get previous period for comparison
      const previousStartDate = new Date(startDate);
      previousStartDate.setDate(previousStartDate.getDate() - input.periodDays);

      const previousSessions = await ctx.prisma.practiceSession.findMany({
        where: {
          userId: targetUserId,
          organizationId: ctx.user.organizationId,
          status: 'COMPLETED',
          endedAt: {
            gte: previousStartDate,
            lt: startDate,
          },
        },
        select: {
          overallScore: true,
          toneScore: true,
          empathyScore: true,
          scriptAdherenceScore: true,
          timingScore: true,
        },
      });

      // Calculate metrics
      const currentMetrics = calculatePeriodMetrics(sessions);
      const previousMetrics = calculatePeriodMetrics(previousSessions);
      const improvement = calculateImprovement(currentMetrics, previousMetrics);

      // Build timeline data
      const timeline = buildTimelineData(sessions, input.category);

      return {
        userId: targetUserId,
        period: {
          start: startDate.toISOString(),
          end: new Date().toISOString(),
          days: input.periodDays,
        },
        currentPeriod: currentMetrics,
        previousPeriod: previousMetrics,
        improvement,
        timeline,
        sessionsCount: sessions.length,
        trend: determineTrend(improvement),
        insights: generateImprovementInsights(currentMetrics, previousMetrics, improvement),
      };
    }),

  /**
   * Get micro-learning suggestions based on recent performance
   */
  getMicroLearningSuggestions: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(10).default(5),
      })
    )
    .query(async ({ ctx, input }) => {
      // Get recent sessions
      const recentSessionsRaw = await ctx.prisma.practiceSession.findMany({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
          status: 'COMPLETED',
        },
        orderBy: { endedAt: 'desc' },
        take: 10,
        include: {
          scenario: { select: { type: true } },
          feedback: true,
        },
      });

      // Map to expected format
      const recentSessions = recentSessionsRaw.map(s => ({
        overallScore: s.overallScore,
        toneScore: s.toneScore,
        empathyScore: s.empathyScore,
        scriptAdherenceScore: s.scriptAdherenceScore,
        timingScore: s.timingScore,
        scenario: s.scenario,
        feedback: s.feedback,
      }));

      // Identify weak areas
      const weakAreas = identifyWeakAreas(recentSessions);

      // Generate micro-learning suggestions
      const suggestions = weakAreas
        .slice(0, input.limit)
        .map((area) => generateMicroLearningForArea(area));

      return {
        suggestions,
        basedOnSessionsCount: recentSessions.length,
        weakestAreas: weakAreas.slice(0, 3).map((a) => a.category),
        lastUpdated: new Date().toISOString(),
      };
    }),

  /**
   * Get peer comparison (anonymized)
   */
  getPeerComparison: protectedProcedure
    .input(
      z.object({
        category: z.enum(['TONE', 'EMPATHY', 'SCRIPT_ADHERENCE', 'TIMING', 'PROBLEM_SOLVING', 'OVERALL']).optional(),
        periodDays: z.number().int().min(7).max(90).default(30),
      })
    )
    .query(async ({ ctx, input }) => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - input.periodDays);

      // Get user's scores
      const userSessions = await ctx.prisma.practiceSession.findMany({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
          status: 'COMPLETED',
          endedAt: { gte: startDate },
        },
        select: {
          overallScore: true,
          toneScore: true,
          empathyScore: true,
          scriptAdherenceScore: true,
          timingScore: true,
        },
      });

      // Get all org scores (anonymized)
      const allSessions = await ctx.prisma.practiceSession.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          status: 'COMPLETED',
          endedAt: { gte: startDate },
        },
        select: {
          overallScore: true,
          toneScore: true,
          empathyScore: true,
          scriptAdherenceScore: true,
          timingScore: true,
        },
      });

      // Calculate percentiles and rankings
      const userAvgs = calculateAverageScores(userSessions);
      const orgStats = calculateOrgStatistics(allSessions);

      // Calculate percentile rank for each category
      const percentiles = calculatePercentileRanks(userAvgs, allSessions);

      return {
        userScores: userAvgs,
        orgStatistics: {
          average: orgStats.average,
          median: orgStats.median,
          top25Percent: orgStats.top25,
          bottom25Percent: orgStats.bottom25,
        },
        percentileRanks: percentiles,
        peerCount: await ctx.prisma.user.count({
          where: { organizationId: ctx.user.organizationId },
        }),
        period: {
          start: startDate.toISOString(),
          end: new Date().toISOString(),
          days: input.periodDays,
        },
        insights: generatePeerComparisonInsights(userAvgs, orgStats, percentiles),
      };
    }),

  /**
   * Set and track performance goals
   */
  setGoal: protectedProcedure
    .input(
      z.object({
        category: z.enum(['TONE', 'EMPATHY', 'SCRIPT_ADHERENCE', 'TIMING', 'PROBLEM_SOLVING', 'OVERALL']),
        targetScore: z.number().int().min(1).max(100),
        targetDate: z.string(), // ISO date string
        description: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get current score for baseline
      const recentSessions = await ctx.prisma.practiceSession.findMany({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
          status: 'COMPLETED',
        },
        orderBy: { endedAt: 'desc' },
        take: 5,
        select: {
          overallScore: true,
          toneScore: true,
          empathyScore: true,
          scriptAdherenceScore: true,
          timingScore: true,
        },
      });

      const currentAvg = calculateCategoryAverage(recentSessions, input.category);

      // Store goal in training progress (using JSON field for goals)
      // First, check if user has a goals record
      let goalsModule = await ctx.prisma.trainingModule.findFirst({
        where: {
          organizationId: ctx.user.organizationId,
          type: 'SKILL_BUILDING',
          name: 'Performance Goals',
        },
      });

      if (!goalsModule) {
        goalsModule = await ctx.prisma.trainingModule.create({
          data: {
            name: 'Performance Goals',
            type: 'SKILL_BUILDING',
            organizationId: ctx.user.organizationId,
            content: { isGoalsTracker: true } as unknown as Prisma.InputJsonValue,
            duration: 0,
            passingScore: 0,
          },
        });
      }

      // Create or update progress for this goal
      const goalId = `goal-${input.category}-${Date.now()}`;
      const goalData = {
        goalId,
        category: input.category,
        targetScore: input.targetScore,
        baselineScore: currentAvg,
        targetDate: input.targetDate,
        description: input.description,
        createdAt: new Date().toISOString(),
        status: 'ACTIVE',
        checkpoints: [] as Array<{ date: string; score: number }>,
      };

      await ctx.prisma.trainingProgress.create({
        data: {
          userId: ctx.user.id,
          moduleId: goalsModule.id,
          organizationId: ctx.user.organizationId,
          status: 'IN_PROGRESS',
          currentStep: 0,
          totalSteps: 1,
          progressData: goalData as unknown as Prisma.InputJsonValue,
        },
      });

      await auditLog('CREATE', 'PerformanceGoal', {
        entityId: goalId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        changes: { category: input.category, targetScore: input.targetScore },
      });

      return {
        goalId,
        category: input.category,
        baselineScore: currentAvg,
        targetScore: input.targetScore,
        targetDate: input.targetDate,
        gapToClose: input.targetScore - currentAvg,
        daysToTarget: Math.ceil((new Date(input.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
        recommendations: generateGoalRecommendations(input.category, currentAvg, input.targetScore),
      };
    }),

  /**
   * Get all active goals and their progress
   */
  getGoals: protectedProcedure
    .input(
      z.object({
        status: z.enum(['ACTIVE', 'COMPLETED', 'EXPIRED', 'ALL']).default('ACTIVE'),
      })
    )
    .query(async ({ ctx, input }) => {
      const goalsModule = await ctx.prisma.trainingModule.findFirst({
        where: {
          organizationId: ctx.user.organizationId,
          type: 'SKILL_BUILDING',
          name: 'Performance Goals',
        },
      });

      if (!goalsModule) {
        return { goals: [], summary: { total: 0, active: 0, completed: 0, expired: 0 } };
      }

      const goalRecords = await ctx.prisma.trainingProgress.findMany({
        where: {
          userId: ctx.user.id,
          moduleId: goalsModule.id,
          organizationId: ctx.user.organizationId,
        },
        orderBy: { createdAt: 'desc' },
      });

      // Get current scores for progress calculation
      const recentSessions = await ctx.prisma.practiceSession.findMany({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
          status: 'COMPLETED',
        },
        orderBy: { endedAt: 'desc' },
        take: 10,
        select: {
          overallScore: true,
          toneScore: true,
          empathyScore: true,
          scriptAdherenceScore: true,
          timingScore: true,
          endedAt: true,
        },
      });

      const goals = goalRecords.map((record) => {
        const goalData = record.progressData as unknown as {
          goalId: string;
          category: string;
          targetScore: number;
          baselineScore: number;
          targetDate: string;
          description?: string;
          createdAt: string;
          status: string;
        };

        const currentScore = calculateCategoryAverage(recentSessions, goalData.category as CategoryType);
        const progress = calculateGoalProgress(goalData.baselineScore, currentScore, goalData.targetScore);
        const isExpired = new Date(goalData.targetDate) < new Date();
        const isCompleted = currentScore >= goalData.targetScore;

        let status = goalData.status;
        if (isCompleted && status === 'ACTIVE') status = 'COMPLETED';
        if (isExpired && status === 'ACTIVE') status = 'EXPIRED';

        return {
          ...goalData,
          currentScore,
          progress,
          status,
          daysRemaining: Math.max(
            0,
            Math.ceil((new Date(goalData.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          ),
        };
      });

      // Filter by status
      const filteredGoals =
        input.status === 'ALL' ? goals : goals.filter((g) => g.status === input.status);

      return {
        goals: filteredGoals,
        summary: {
          total: goals.length,
          active: goals.filter((g) => g.status === 'ACTIVE').length,
          completed: goals.filter((g) => g.status === 'COMPLETED').length,
          expired: goals.filter((g) => g.status === 'EXPIRED').length,
        },
      };
    }),

  /**
   * Update goal progress checkpoint
   */
  updateGoalCheckpoint: protectedProcedure
    .input(
      z.object({
        goalId: z.string(),
        notes: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const goalsModule = await ctx.prisma.trainingModule.findFirst({
        where: {
          organizationId: ctx.user.organizationId,
          type: 'SKILL_BUILDING',
          name: 'Performance Goals',
        },
      });

      if (!goalsModule) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Goals module not found' });
      }

      const goalRecord = await ctx.prisma.trainingProgress.findFirst({
        where: {
          userId: ctx.user.id,
          moduleId: goalsModule.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!goalRecord) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Goal not found' });
      }

      const goalData = goalRecord.progressData as unknown as {
        goalId: string;
        category: string;
        targetScore: number;
        baselineScore: number;
        checkpoints: Array<{ date: string; score: number; notes?: string }>;
      };

      if (goalData.goalId !== input.goalId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Goal not found' });
      }

      // Get current score
      const recentSessions = await ctx.prisma.practiceSession.findMany({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
          status: 'COMPLETED',
        },
        orderBy: { endedAt: 'desc' },
        take: 5,
        select: {
          overallScore: true,
          toneScore: true,
          empathyScore: true,
          scriptAdherenceScore: true,
          timingScore: true,
        },
      });

      const currentScore = calculateCategoryAverage(recentSessions, goalData.category as CategoryType);

      // Add checkpoint
      goalData.checkpoints = goalData.checkpoints || [];
      goalData.checkpoints.push({
        date: new Date().toISOString(),
        score: currentScore,
        notes: input.notes,
      });

      await ctx.prisma.trainingProgress.update({
        where: { id: goalRecord.id },
        data: { progressData: goalData as unknown as Prisma.InputJsonValue },
      });

      return {
        goalId: input.goalId,
        currentScore,
        targetScore: goalData.targetScore,
        checkpointsCount: goalData.checkpoints.length,
        progress: calculateGoalProgress(goalData.baselineScore, currentScore, goalData.targetScore),
      };
    }),

  /**
   * Get coaching dashboard for managers
   */
  getCoachingDashboard: adminProcedure
    .input(
      z.object({
        periodDays: z.number().int().min(7).max(90).default(30),
      })
    )
    .query(async ({ ctx, input }) => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - input.periodDays);

      // Get all staff in organization
      const staffRaw = await ctx.prisma.user.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          role: { in: ['STAFF', 'BILLER'] },
        },
        select: { id: true, firstName: true, lastName: true, role: true },
      });

      // Map to expected format
      const staff = staffRaw.map(s => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        role: s.role,
      }));

      // Get sessions for all staff
      const allSessions = await ctx.prisma.practiceSession.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          status: 'COMPLETED',
          endedAt: { gte: startDate },
        },
        select: {
          userId: true,
          overallScore: true,
          toneScore: true,
          empathyScore: true,
          scriptAdherenceScore: true,
          timingScore: true,
          endedAt: true,
        },
      });

      // Build staff performance summaries
      const staffPerformance = staff.map((s) => {
        const sessions = allSessions.filter((sess) => sess.userId === s.id);
        const avgScores = calculateAverageScores(sessions);

        return {
          userId: s.id,
          name: s.name,
          role: s.role,
          sessionsCount: sessions.length,
          averageScores: avgScores,
          needsAttention: avgScores.overall < 70 || sessions.length < 3,
          topStrength: identifyTopStrength(avgScores),
          primaryWeakness: identifyPrimaryWeakness(avgScores),
        };
      });

      // Calculate org-wide metrics
      const orgMetrics = calculateOrgStatistics(allSessions);

      // Identify coaching priorities
      const coachingPriorities = staffPerformance
        .filter((s) => s.needsAttention)
        .sort((a, b) => a.averageScores.overall - b.averageScores.overall)
        .slice(0, 5);

      return {
        period: {
          start: startDate.toISOString(),
          end: new Date().toISOString(),
          days: input.periodDays,
        },
        staffPerformance,
        organizationMetrics: orgMetrics,
        coachingPriorities,
        totalSessions: allSessions.length,
        averageSessionsPerStaff: allSessions.length / staff.length || 0,
        improvementOpportunities: generateOrgImprovementOpportunities(staffPerformance),
      };
    }),
});
