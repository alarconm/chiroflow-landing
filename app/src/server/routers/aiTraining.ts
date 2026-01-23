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
});
