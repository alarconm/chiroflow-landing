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
