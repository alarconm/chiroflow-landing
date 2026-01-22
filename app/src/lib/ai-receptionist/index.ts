/**
 * Epic 30: AI Receptionist Agent
 *
 * Public API exports for the AI Receptionist library.
 */

// Types
export * from './types';

// Voice Service
export {
  VoiceService,
  createVoiceService,
  getVoiceConfig,
} from './voice-service';

// Scheduling Agent (US-302)
export {
  SchedulingAgent,
  createSchedulingAgent,
  type SchedulingRequest,
  type SchedulingResponse,
  type PatientInfo,
  type SchedulingAgentConfig,
} from './scheduling-agent';

// FAQ Agent (US-303)
export {
  FAQAgent,
  createFAQAgent,
  type FAQRequest,
  type FAQResponse,
  type QuestionContext,
  type FAQAgentConfig,
  type KnowledgeEntry,
} from './faq-agent';

// Patient Identification Agent (US-304)
export {
  PatientIdentificationAgent,
  createPatientIdentificationAgent,
  type PatientIdentificationRequest,
  type PatientIdentificationResponse,
  type PatientMatch,
  type VoiceVerificationData,
  type FamilyContext,
  type NewPatientInfo,
  type PatientIdentificationConfig,
} from './patient-identification-agent';

// Escalation Agent (US-305)
export {
  EscalationAgent,
  createEscalationAgent,
  type EscalationRequest,
  type EscalationResponse,
  type ContextHandoff,
  type EscalationAnalysis,
  type EscalationIndicator,
  type EscalationMetrics,
  type EscalationAgentConfig,
} from './escalation-agent';

// Multi-Channel Agent (US-306)
export {
  MultiChannelAgent,
  createMultiChannelAgent,
  SUPPORTED_LANGUAGES,
  type MultiChannelConfig,
  type ChatWidgetConfig,
  type SMSConfig,
  type EmailConfig,
  type ChannelMessage,
  type MessageAttachment,
  type ConversationState,
  type ConversationContext,
  type ChannelHandoffRequest,
  type ChannelHandoffResult,
  type ChannelPreference,
  type MultiChannelResponse,
  type LanguageDetectionResult,
} from './multi-channel-agent';
