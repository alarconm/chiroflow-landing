/**
 * Epic 30: AI Receptionist Agent - Smart Escalation Agent
 * US-305: Smart escalation
 *
 * Intelligently escalate to human staff when needed. Detects frustration,
 * urgency, clinical questions, billing disputes, and patient requests
 * for human assistance.
 */

import type { PrismaClient, AIEscalationReason, AIActionResult, AIConversationStatus } from '@prisma/client';
import type { CallState, CallContext, TranscriptEntry } from './types';

// ==================== Types ====================

export interface EscalationRequest {
  conversationId?: string;
  reason: AIEscalationReason;
  contextSummary: string;
  suggestedActions?: string[];
  urgencyLevel?: number;
  targetUserId?: string;
  callSid?: string;
}

export interface EscalationResponse {
  success: boolean;
  shouldEscalate: boolean;
  escalationId?: string;
  reason?: AIEscalationReason;
  urgencyLevel: number;
  message: string;
  transferNumber?: string;
  contextHandoff?: ContextHandoff;
  actionResult: AIActionResult;
}

export interface ContextHandoff {
  patientId?: string;
  patientName?: string;
  callerPhone: string;
  conversationSummary: string;
  topicsDiscussed: string[];
  pendingRequests: string[];
  sentiment: 'positive' | 'neutral' | 'negative' | 'frustrated';
  urgencyLevel: number;
  reason: AIEscalationReason;
  suggestedActions: string[];
  transcript: TranscriptEntry[];
}

export interface EscalationAnalysis {
  shouldEscalate: boolean;
  reason?: AIEscalationReason;
  urgencyLevel: number;
  confidence: number;
  indicators: EscalationIndicator[];
}

export interface EscalationIndicator {
  type: 'frustration' | 'urgency' | 'clinical' | 'billing' | 'request' | 'repeated_failure' | 'low_confidence';
  detected: boolean;
  score: number;
  evidence?: string;
}

export interface EscalationMetrics {
  totalEscalations: number;
  byReason: Record<AIEscalationReason, number>;
  averageUrgency: number;
  averageResolutionTime: number;
  unresolved: number;
  escalationRate: number;
  topReasons: { reason: AIEscalationReason; count: number }[];
}

export interface EscalationAgentConfig {
  organizationId: string;
  frustrationThreshold?: number;
  urgencyThreshold?: number;
  confidenceThreshold?: number;
  maxRetries?: number;
  escalationPhone?: string;
  enableAutoEscalation?: boolean;
  escalationKeywords?: string[];
}

// Sentiment analysis patterns
interface SentimentPattern {
  pattern: RegExp;
  weight: number;
  type: 'frustration' | 'urgency' | 'positive' | 'negative';
}

// ==================== Escalation Agent ====================

export class EscalationAgent {
  private prisma: PrismaClient;
  private config: EscalationAgentConfig;

  // Frustration detection patterns
  private frustrationPatterns: SentimentPattern[] = [
    { pattern: /\b(frustrated|frustrating|annoying|annoyed|angry|mad|upset)\b/i, weight: 0.8, type: 'frustration' },
    { pattern: /\b(ridiculous|terrible|awful|horrible|worst)\b/i, weight: 0.7, type: 'frustration' },
    { pattern: /\b(can't believe|unbelievable|unacceptable|useless)\b/i, weight: 0.7, type: 'frustration' },
    { pattern: /\b(wasting my time|waste of time|had enough)\b/i, weight: 0.8, type: 'frustration' },
    { pattern: /\b(already told you|said that already|keep repeating|how many times)\b/i, weight: 0.6, type: 'frustration' },
    { pattern: /\b(just (want|need)|simple (question|thing)|not that hard)\b/i, weight: 0.5, type: 'frustration' },
    { pattern: /!{2,}|\?{2,}/g, weight: 0.3, type: 'frustration' },
    { pattern: /\b(CAPS WORDS|[A-Z]{4,})\b/g, weight: 0.4, type: 'frustration' },
    { pattern: /\b(ugh|aargh|argh|grr|sigh)\b/i, weight: 0.4, type: 'frustration' },
    { pattern: /\b(give up|forget it|never mind|done with this)\b/i, weight: 0.7, type: 'frustration' },
  ];

  // Urgency detection patterns
  private urgencyPatterns: SentimentPattern[] = [
    { pattern: /\b(emergency|urgent|asap|immediately|right now|right away)\b/i, weight: 0.9, type: 'urgency' },
    { pattern: /\b(severe|extreme|worst|unbearable|excruciating)\s+(pain|headache|symptom)/i, weight: 0.9, type: 'urgency' },
    { pattern: /\b(can't (move|walk|stand|sit|sleep)|paralyz|numb|tingling)\b/i, weight: 0.9, type: 'urgency' },
    { pattern: /\b(accident|injury|fell|hurt)\s+(today|just|recently|this morning)/i, weight: 0.8, type: 'urgency' },
    { pattern: /\b(getting worse|deteriorating|spreading|increasing)\b/i, weight: 0.6, type: 'urgency' },
    { pattern: /\b(can't wait|need to be seen|today|as soon as possible)\b/i, weight: 0.7, type: 'urgency' },
    { pattern: /\b(really|very|extremely|incredibly)\s+(worried|concerned|scared)\b/i, weight: 0.6, type: 'urgency' },
    { pattern: /\b(911|hospital|er|ambulance)\b/i, weight: 1.0, type: 'urgency' },
  ];

  // Clinical question patterns (need provider input)
  private clinicalPatterns: RegExp[] = [
    /\b(should I|do I need|is it safe|can I take|will it|what if)\b.*\b(medication|medicine|drug|treatment|surgery|procedure)\b/i,
    /\b(diagnosis|prognosis|side effect|complication|symptom|condition)\b/i,
    /\b(x-ray|mri|scan|test|lab)\s+(result|show|mean)/i,
    /\b(doctor|dr\.?)\s+(say|said|recommend|think|opinion)/i,
    /\b(how long|when will|should I worry|is this normal)\b/i,
    /\b(medical|clinical|health)\s+(advice|recommendation|question)/i,
    /\b(second opinion|another doctor|specialist)\b/i,
    /\b(pain level|scale of 1|how bad)\b/i,
  ];

  // Billing dispute patterns
  private billingPatterns: RegExp[] = [
    /\b(bill|charge|invoice|statement|payment)\b.*\b(wrong|incorrect|error|mistake|dispute)\b/i,
    /\b(overcharged|double charged|didn't receive|never had|didn't authorize)\b/i,
    /\b(insurance|coverage|claim|denied|rejected)\b.*\b(problem|issue|question)\b/i,
    /\b(refund|credit|adjustment|correction)\b/i,
    /\b(collection|collector|agency|credit report)\b/i,
    /\b(payment plan|financial|afford|too expensive|can't pay)\b/i,
    /\b(manager|supervisor|someone in charge)\b.*\b(billing|account|payment)\b/i,
  ];

  // Human request patterns
  private humanRequestPatterns: RegExp[] = [
    /\b(speak|talk|transfer|connect)\s+(to|with)?\s*(a\s+)?(human|person|someone|staff|representative|agent|real person)\b/i,
    /\b(not a (robot|bot|computer|machine))\b/i,
    /\b(want|need|prefer)\s+(a\s+)?(human|person|someone real)\b/i,
    /\b(is (this|there)\s+a\s+(real\s+)?person|are you (a\s+)?(robot|bot|ai|computer))\b/i,
    /\b(stop|enough|quit)\s+(with\s+)?(the\s+)?(automated|automatic|robot|bot)\b/i,
    /\b(let me speak|put me through|get me|transfer me)\b/i,
    /\b(operator|receptionist|front desk|office manager)\b/i,
  ];

  constructor(prisma: PrismaClient, config: EscalationAgentConfig) {
    this.prisma = prisma;
    this.config = {
      frustrationThreshold: config.frustrationThreshold ?? 0.6,
      urgencyThreshold: config.urgencyThreshold ?? 0.7,
      confidenceThreshold: config.confidenceThreshold ?? 0.5,
      maxRetries: config.maxRetries ?? 3,
      enableAutoEscalation: config.enableAutoEscalation ?? true,
      escalationKeywords: config.escalationKeywords ?? [],
      ...config,
    };
  }

  // ==================== Main Escalation Logic ====================

  /**
   * Analyze conversation for escalation triggers
   * Main entry point for escalation detection
   */
  async analyzeForEscalation(
    callState: CallState,
    latestInput?: string
  ): Promise<EscalationAnalysis> {
    const indicators: EscalationIndicator[] = [];
    let maxUrgency = 0;
    let shouldEscalate = false;
    let primaryReason: AIEscalationReason | undefined;

    // 1. Check for explicit human request (highest priority)
    const humanRequest = this.detectHumanRequest(latestInput || '', callState);
    indicators.push(humanRequest);
    if (humanRequest.detected) {
      shouldEscalate = true;
      primaryReason = 'PATIENT_REQUEST';
      maxUrgency = Math.max(maxUrgency, 8);
    }

    // 2. Check for frustration
    const frustration = this.detectFrustration(latestInput || '', callState);
    indicators.push(frustration);
    if (frustration.detected && frustration.score >= this.config.frustrationThreshold!) {
      shouldEscalate = true;
      if (!primaryReason) primaryReason = 'FRUSTRATION_DETECTED';
      maxUrgency = Math.max(maxUrgency, Math.round(frustration.score * 7));
    }

    // 3. Check for urgency
    const urgency = this.detectUrgency(latestInput || '', callState);
    indicators.push(urgency);
    if (urgency.detected && urgency.score >= this.config.urgencyThreshold!) {
      shouldEscalate = true;
      if (!primaryReason || urgency.score > frustration.score) {
        primaryReason = 'URGENCY_DETECTED';
      }
      maxUrgency = Math.max(maxUrgency, Math.round(urgency.score * 10));
    }

    // 4. Check for clinical questions
    const clinical = this.detectClinicalQuestion(latestInput || '');
    indicators.push(clinical);
    if (clinical.detected) {
      shouldEscalate = true;
      if (!primaryReason) primaryReason = 'CLINICAL_QUESTION';
      maxUrgency = Math.max(maxUrgency, 6);
    }

    // 5. Check for billing disputes
    const billing = this.detectBillingDispute(latestInput || '');
    indicators.push(billing);
    if (billing.detected) {
      shouldEscalate = true;
      if (!primaryReason) primaryReason = 'BILLING_DISPUTE';
      maxUrgency = Math.max(maxUrgency, 5);
    }

    // 6. Check for repeated failures
    const repeatedFailure = this.detectRepeatedFailure(callState);
    indicators.push(repeatedFailure);
    if (repeatedFailure.detected) {
      shouldEscalate = true;
      if (!primaryReason) primaryReason = 'REPEATED_FAILURE';
      maxUrgency = Math.max(maxUrgency, 4);
    }

    // 7. Check for low confidence in AI responses
    const lowConfidence = this.detectLowConfidence(callState);
    indicators.push(lowConfidence);
    if (lowConfidence.detected) {
      shouldEscalate = true;
      if (!primaryReason) primaryReason = 'LOW_CONFIDENCE';
      maxUrgency = Math.max(maxUrgency, 3);
    }

    // Calculate overall confidence
    const detectedIndicators = indicators.filter(i => i.detected);
    const avgScore = detectedIndicators.length > 0
      ? detectedIndicators.reduce((sum, i) => sum + i.score, 0) / detectedIndicators.length
      : 0;

    return {
      shouldEscalate,
      reason: primaryReason,
      urgencyLevel: Math.min(maxUrgency, 10),
      confidence: avgScore,
      indicators,
    };
  }

  /**
   * Escalate the conversation to human staff
   */
  async escalate(
    request: EscalationRequest,
    callState?: CallState
  ): Promise<EscalationResponse> {
    const {
      conversationId,
      reason,
      contextSummary,
      suggestedActions = [],
      urgencyLevel = 5,
      targetUserId,
      callSid,
    } = request;

    // Build context handoff
    const contextHandoff = callState
      ? this.buildContextHandoff(callState, reason, suggestedActions)
      : undefined;

    // Get transfer number
    const voiceConfig = await this.prisma.aIVoiceConfig.findUnique({
      where: { organizationId: this.config.organizationId },
    });
    const transferNumber = this.config.escalationPhone || voiceConfig?.escalationPhone || undefined;

    // Create escalation record
    let escalationId: string | undefined;
    if (conversationId) {
      const escalation = await this.prisma.aIReceptionistEscalation.create({
        data: {
          organizationId: this.config.organizationId,
          conversationId,
          reason,
          contextSummary,
          suggestedActions,
          urgencyLevel,
          assignedToUserId: targetUserId,
        },
      });
      escalationId = escalation.id;

      // Update conversation status
      await this.prisma.aIReceptionistConversation.update({
        where: { id: conversationId },
        data: { status: 'ESCALATED' },
      });

      // Record the escalation action
      await this.prisma.aIReceptionistAction.create({
        data: {
          organizationId: this.config.organizationId,
          conversationId,
          actionType: 'TRANSFER_CALL',
          parameters: {
            reason,
            urgencyLevel,
            targetUserId,
            callSid,
          },
          result: 'SUCCESS',
          confidence: 1.0,
          reasoning: contextSummary,
        },
      });
    }

    // Generate appropriate response message
    const message = this.generateEscalationMessage(reason, urgencyLevel);

    return {
      success: true,
      shouldEscalate: true,
      escalationId,
      reason,
      urgencyLevel,
      message,
      transferNumber,
      contextHandoff,
      actionResult: 'SUCCESS',
    };
  }

  /**
   * Check if a conversation should be escalated based on current state
   */
  async checkAndEscalate(
    callState: CallState,
    latestInput: string
  ): Promise<EscalationResponse> {
    // Analyze for escalation triggers
    const analysis = await this.analyzeForEscalation(callState, latestInput);

    if (!analysis.shouldEscalate) {
      return {
        success: true,
        shouldEscalate: false,
        urgencyLevel: analysis.urgencyLevel,
        message: '',
        actionResult: 'SUCCESS',
      };
    }

    // Escalate
    const request: EscalationRequest = {
      conversationId: callState.conversationId,
      reason: analysis.reason!,
      contextSummary: this.generateContextSummary(callState, analysis),
      suggestedActions: this.generateSuggestedActions(analysis),
      urgencyLevel: analysis.urgencyLevel,
      callSid: callState.callSid,
    };

    return this.escalate(request, callState);
  }

  // ==================== Detection Methods ====================

  /**
   * Detect explicit request for human
   */
  private detectHumanRequest(input: string, callState: CallState): EscalationIndicator {
    for (const pattern of this.humanRequestPatterns) {
      if (pattern.test(input)) {
        return {
          type: 'request',
          detected: true,
          score: 1.0,
          evidence: input.match(pattern)?.[0],
        };
      }
    }

    // Check transcript for repeated requests
    const recentTranscript = callState.transcript.slice(-5);
    const humanRequests = recentTranscript.filter(t =>
      t.role === 'user' && this.humanRequestPatterns.some(p => p.test(t.content))
    );

    if (humanRequests.length >= 2) {
      return {
        type: 'request',
        detected: true,
        score: 1.0,
        evidence: 'Multiple human requests in conversation',
      };
    }

    return { type: 'request', detected: false, score: 0 };
  }

  /**
   * Detect frustration in conversation
   */
  private detectFrustration(input: string, callState: CallState): EscalationIndicator {
    let score = 0;
    let evidence: string | undefined;

    // Check current input
    for (const pattern of this.frustrationPatterns) {
      if (pattern.pattern.test(input)) {
        score += pattern.weight;
        if (!evidence) evidence = input.match(pattern.pattern)?.[0];
      }
    }

    // Check context frustration level
    const contextFrustration = callState.context.frustrationLevel;
    score = Math.max(score, contextFrustration);

    // Check for escalating frustration in transcript
    const recentTranscript = callState.transcript.slice(-6);
    let frustrationTrend = 0;
    recentTranscript.forEach((t, idx) => {
      if (t.role === 'user') {
        const turnScore = this.calculateFrustrationScore(t.content);
        // Weight recent turns more heavily
        frustrationTrend += turnScore * (idx + 1) / recentTranscript.length;
      }
    });

    score = Math.max(score, frustrationTrend);

    return {
      type: 'frustration',
      detected: score >= this.config.frustrationThreshold!,
      score: Math.min(score, 1),
      evidence,
    };
  }

  /**
   * Detect urgency in conversation
   */
  private detectUrgency(input: string, callState: CallState): EscalationIndicator {
    let score = 0;
    let evidence: string | undefined;

    // Check current input
    for (const pattern of this.urgencyPatterns) {
      if (pattern.pattern.test(input)) {
        score = Math.max(score, pattern.weight);
        if (!evidence) evidence = input.match(pattern.pattern)?.[0];
      }
    }

    // Check full transcript for urgency indicators
    const urgentMentions = callState.transcript.filter(t =>
      t.role === 'user' && this.urgencyPatterns.some(p => p.pattern.test(t.content))
    );

    if (urgentMentions.length > 0) {
      score = Math.max(score, 0.5 + (urgentMentions.length * 0.1));
    }

    return {
      type: 'urgency',
      detected: score >= this.config.urgencyThreshold!,
      score: Math.min(score, 1),
      evidence,
    };
  }

  /**
   * Detect clinical questions that need provider input
   */
  private detectClinicalQuestion(input: string): EscalationIndicator {
    for (const pattern of this.clinicalPatterns) {
      if (pattern.test(input)) {
        return {
          type: 'clinical',
          detected: true,
          score: 0.8,
          evidence: input.match(pattern)?.[0],
        };
      }
    }

    return { type: 'clinical', detected: false, score: 0 };
  }

  /**
   * Detect billing disputes
   */
  private detectBillingDispute(input: string): EscalationIndicator {
    for (const pattern of this.billingPatterns) {
      if (pattern.test(input)) {
        return {
          type: 'billing',
          detected: true,
          score: 0.8,
          evidence: input.match(pattern)?.[0],
        };
      }
    }

    return { type: 'billing', detected: false, score: 0 };
  }

  /**
   * Detect repeated failures (AI unable to help)
   */
  private detectRepeatedFailure(callState: CallState): EscalationIndicator {
    const retryCount = callState.context.retryCount;
    const silenceCount = callState.context.silenceCount;

    // Check retry count
    if (retryCount >= this.config.maxRetries!) {
      return {
        type: 'repeated_failure',
        detected: true,
        score: 0.8,
        evidence: `${retryCount} failed attempts`,
      };
    }

    // Check for repeated similar questions (user not getting what they need)
    const recentUserInputs = callState.transcript
      .filter(t => t.role === 'user')
      .slice(-5)
      .map(t => t.content.toLowerCase());

    const uniqueInputs = new Set(recentUserInputs);
    if (recentUserInputs.length >= 4 && uniqueInputs.size <= 2) {
      return {
        type: 'repeated_failure',
        detected: true,
        score: 0.7,
        evidence: 'User repeating similar requests',
      };
    }

    // High silence count indicates confusion
    if (silenceCount >= 3) {
      return {
        type: 'repeated_failure',
        detected: true,
        score: 0.5,
        evidence: `${silenceCount} silences detected`,
      };
    }

    return { type: 'repeated_failure', detected: false, score: 0 };
  }

  /**
   * Detect low confidence in AI responses
   */
  private detectLowConfidence(callState: CallState): EscalationIndicator {
    // Check if we have recent actions with low confidence
    const recentTranscript = callState.transcript.slice(-4);
    const lowConfidenceResponses = recentTranscript.filter(t =>
      t.role === 'assistant' && t.confidence && t.confidence < this.config.confidenceThreshold!
    );

    if (lowConfidenceResponses.length >= 2) {
      return {
        type: 'low_confidence',
        detected: true,
        score: 0.6,
        evidence: 'Multiple low-confidence responses',
      };
    }

    return { type: 'low_confidence', detected: false, score: 0 };
  }

  // ==================== Helper Methods ====================

  /**
   * Calculate frustration score for a single input
   */
  private calculateFrustrationScore(input: string): number {
    let score = 0;
    for (const pattern of this.frustrationPatterns) {
      if (pattern.pattern.test(input)) {
        score += pattern.weight;
      }
    }
    return Math.min(score, 1);
  }

  /**
   * Build context handoff for human staff
   */
  private buildContextHandoff(
    callState: CallState,
    reason: AIEscalationReason,
    suggestedActions: string[]
  ): ContextHandoff {
    // Determine sentiment
    const frustrationScore = callState.context.frustrationLevel;
    let sentiment: 'positive' | 'neutral' | 'negative' | 'frustrated';
    if (frustrationScore >= 0.7) {
      sentiment = 'frustrated';
    } else if (frustrationScore >= 0.4) {
      sentiment = 'negative';
    } else if (frustrationScore <= 0.2) {
      sentiment = 'positive';
    } else {
      sentiment = 'neutral';
    }

    // Extract topics discussed
    const topics = new Set<string>();
    const intents = callState.context.intents;
    intents.forEach(intent => {
      switch (intent) {
        case 'BOOK_APPOINTMENT':
          topics.add('Appointment booking');
          break;
        case 'RESCHEDULE_APPOINTMENT':
          topics.add('Appointment rescheduling');
          break;
        case 'CANCEL_APPOINTMENT':
          topics.add('Appointment cancellation');
          break;
        case 'ANSWER_QUESTION':
          topics.add('General questions');
          break;
        case 'VERIFY_INSURANCE':
          topics.add('Insurance verification');
          break;
        default:
          topics.add(intent.toLowerCase().replace(/_/g, ' '));
      }
    });

    // Extract pending requests
    const pendingRequests: string[] = [];
    if (callState.context.pendingAction) {
      pendingRequests.push(
        `Pending: ${callState.context.pendingAction.type.toLowerCase().replace(/_/g, ' ')}`
      );
    }

    // Generate conversation summary
    const conversationSummary = this.generateConversationSummary(callState);

    return {
      patientId: callState.patientId,
      patientName: callState.context.patientName,
      callerPhone: callState.phoneNumber,
      conversationSummary,
      topicsDiscussed: Array.from(topics),
      pendingRequests,
      sentiment,
      urgencyLevel: reason === 'URGENCY_DETECTED' ? 9 : reason === 'FRUSTRATION_DETECTED' ? 7 : 5,
      reason,
      suggestedActions,
      transcript: callState.transcript.slice(-10), // Last 10 exchanges
    };
  }

  /**
   * Generate context summary for escalation
   */
  private generateContextSummary(callState: CallState, analysis: EscalationAnalysis): string {
    const parts: string[] = [];

    // Add patient info if available
    if (callState.context.patientName) {
      parts.push(`Patient: ${callState.context.patientName}`);
    }

    // Add reason
    if (analysis.reason) {
      parts.push(`Reason: ${this.formatReason(analysis.reason)}`);
    }

    // Add key indicators
    const detectedIndicators = analysis.indicators.filter(i => i.detected);
    if (detectedIndicators.length > 0) {
      const indicatorSummary = detectedIndicators
        .map(i => `${i.type}${i.evidence ? `: "${i.evidence}"` : ''}`)
        .join('; ');
      parts.push(`Indicators: ${indicatorSummary}`);
    }

    // Add conversation length
    parts.push(`Conversation: ${callState.context.turnCount} turns`);

    // Add last user message
    const lastUserMessage = callState.transcript
      .filter(t => t.role === 'user')
      .slice(-1)[0];
    if (lastUserMessage) {
      const truncated = lastUserMessage.content.length > 100
        ? lastUserMessage.content.substring(0, 100) + '...'
        : lastUserMessage.content;
      parts.push(`Last message: "${truncated}"`);
    }

    return parts.join(' | ');
  }

  /**
   * Generate suggested actions based on escalation analysis
   */
  private generateSuggestedActions(analysis: EscalationAnalysis): string[] {
    const actions: string[] = [];

    switch (analysis.reason) {
      case 'PATIENT_REQUEST':
        actions.push('Caller specifically requested human assistance');
        actions.push('Begin by acknowledging their request');
        break;

      case 'FRUSTRATION_DETECTED':
        actions.push('Caller appears frustrated - begin with empathy');
        actions.push('Acknowledge any delays or difficulties they experienced');
        actions.push('Offer to resolve their concern directly');
        break;

      case 'URGENCY_DETECTED':
        actions.push('URGENT - Caller may need immediate attention');
        actions.push('Assess if same-day appointment is needed');
        actions.push('If medical emergency, advise calling 911');
        break;

      case 'CLINICAL_QUESTION':
        actions.push('Caller has clinical/medical question');
        actions.push('May need provider or clinical staff input');
        actions.push('Review patient chart before responding');
        break;

      case 'BILLING_DISPUTE':
        actions.push('Caller has billing concern');
        actions.push('Review account and recent charges');
        actions.push('Be prepared to explain charges or issue adjustments');
        break;

      case 'REPEATED_FAILURE':
        actions.push('AI was unable to resolve caller needs');
        actions.push('Review transcript to understand original request');
        actions.push('Provide direct assistance without requiring re-explanation');
        break;

      case 'LOW_CONFIDENCE':
        actions.push('AI responses had low confidence');
        actions.push('May need clarification on caller intent');
        break;

      default:
        actions.push('Review conversation context before responding');
    }

    return actions;
  }

  /**
   * Generate conversation summary
   */
  private generateConversationSummary(callState: CallState): string {
    const duration = Math.round(
      (Date.now() - callState.startedAt.getTime()) / 1000 / 60
    );
    const turnCount = callState.context.turnCount;

    const parts = [
      `${duration} minute call`,
      `${turnCount} exchanges`,
    ];

    if (callState.context.patientIdentified) {
      parts.push('patient identified');
    }

    const intents = callState.context.intents;
    if (intents.length > 0) {
      parts.push(`discussed: ${intents.slice(0, 3).join(', ').toLowerCase()}`);
    }

    if (callState.context.pendingAction) {
      parts.push(`pending action: ${callState.context.pendingAction.type}`);
    }

    return parts.join(', ');
  }

  /**
   * Generate escalation message for caller
   */
  private generateEscalationMessage(reason: AIEscalationReason, urgencyLevel: number): string {
    const messages: Record<AIEscalationReason, string> = {
      PATIENT_REQUEST: "Absolutely, I'll connect you with one of our team members right away. Please hold for just a moment.",
      CLINICAL_QUESTION: "That's an excellent question that one of our clinical staff can best answer. Let me connect you with them now.",
      BILLING_DISPUTE: "I understand you have questions about your account. Let me connect you with our billing team who can help you directly.",
      FRUSTRATION_DETECTED: "I apologize for any frustration. Let me get you to one of our team members who can assist you right away.",
      URGENCY_DETECTED: "I can hear this is urgent. Let me connect you with someone immediately who can help.",
      COMPLEX_REQUEST: "Your request would be best handled by one of our team members. I'm transferring you now.",
      REPEATED_FAILURE: "I want to make sure you get the help you need. Let me connect you with someone who can assist you directly.",
      LOW_CONFIDENCE: "I want to be sure you get accurate information. Let me transfer you to one of our team members.",
      AFTER_HOURS_URGENT: "For urgent matters after hours, I'm connecting you with our on-call staff.",
    };

    let message = messages[reason] || "Let me connect you with one of our team members.";

    if (urgencyLevel >= 8) {
      message = message.replace('Please hold for just a moment.', 'Connecting you now.');
    }

    return message;
  }

  /**
   * Format escalation reason for display
   */
  private formatReason(reason: AIEscalationReason): string {
    const formats: Record<AIEscalationReason, string> = {
      PATIENT_REQUEST: 'Patient requested human',
      CLINICAL_QUESTION: 'Clinical question',
      BILLING_DISPUTE: 'Billing concern',
      FRUSTRATION_DETECTED: 'Frustration detected',
      URGENCY_DETECTED: 'Urgent situation',
      COMPLEX_REQUEST: 'Complex request',
      REPEATED_FAILURE: 'AI unable to resolve',
      LOW_CONFIDENCE: 'Low confidence responses',
      AFTER_HOURS_URGENT: 'After-hours urgent',
    };

    return formats[reason] || reason;
  }

  // ==================== Metrics and Tracking ====================

  /**
   * Get escalation metrics for date range
   */
  async getMetrics(startDate: Date, endDate: Date): Promise<EscalationMetrics> {
    const escalations = await this.prisma.aIReceptionistEscalation.findMany({
      where: {
        organizationId: this.config.organizationId,
        createdAt: { gte: startDate, lte: endDate },
      },
    });

    // Count by reason
    const byReason = {} as Record<AIEscalationReason, number>;
    const reasons = [
      'PATIENT_REQUEST',
      'CLINICAL_QUESTION',
      'BILLING_DISPUTE',
      'FRUSTRATION_DETECTED',
      'URGENCY_DETECTED',
      'COMPLEX_REQUEST',
      'REPEATED_FAILURE',
      'LOW_CONFIDENCE',
      'AFTER_HOURS_URGENT',
    ] as AIEscalationReason[];

    reasons.forEach(r => {
      byReason[r] = escalations.filter(e => e.reason === r).length;
    });

    // Calculate averages
    const avgUrgency = escalations.length > 0
      ? escalations.reduce((sum, e) => sum + e.urgencyLevel, 0) / escalations.length
      : 0;

    const resolved = escalations.filter(e => e.resolvedAt);
    const avgResolutionTime = resolved.length > 0
      ? resolved.reduce((sum, e) => {
          const created = new Date(e.createdAt).getTime();
          const resolvedAt = new Date(e.resolvedAt!).getTime();
          return sum + (resolvedAt - created);
        }, 0) / resolved.length / 1000 / 60 // Convert to minutes
      : 0;

    // Get total conversations for escalation rate
    const totalConversations = await this.prisma.aIReceptionistConversation.count({
      where: {
        organizationId: this.config.organizationId,
        startedAt: { gte: startDate, lte: endDate },
      },
    });

    const escalationRate = totalConversations > 0
      ? escalations.length / totalConversations
      : 0;

    // Top reasons
    const topReasons = Object.entries(byReason)
      .map(([reason, count]) => ({ reason: reason as AIEscalationReason, count }))
      .filter(r => r.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalEscalations: escalations.length,
      byReason,
      averageUrgency: Math.round(avgUrgency * 10) / 10,
      averageResolutionTime: Math.round(avgResolutionTime),
      unresolved: escalations.filter(e => !e.resolvedAt).length,
      escalationRate: Math.round(escalationRate * 1000) / 10, // As percentage
      topReasons,
    };
  }

  /**
   * Track escalation feedback for learning
   */
  async recordEscalationFeedback(
    escalationId: string,
    wasAppropriate: boolean,
    notes?: string
  ): Promise<void> {
    await this.prisma.aIReceptionistEscalation.update({
      where: { id: escalationId },
      data: {
        resolutionNotes: notes
          ? `${wasAppropriate ? 'Appropriate' : 'Unnecessary'} escalation. ${notes}`
          : `${wasAppropriate ? 'Appropriate' : 'Unnecessary'} escalation.`,
      },
    });
  }
}

// ==================== Factory ====================

export function createEscalationAgent(
  prisma: PrismaClient,
  config: EscalationAgentConfig
): EscalationAgent {
  return new EscalationAgent(prisma, config);
}
