/**
 * Epic 12: AI Communication Agent - Main Entry Point
 *
 * Exports all AI communication services and types.
 */

// Types
export * from './types';

// Services
export { ChatbotService, createChatbot } from './chatbot';
export { BookingAgent, createBookingAgent } from './booking-agent';
export { FAQAgent, createFAQAgent } from './faq-agent';
export { SentimentAnalysisService, createSentimentService } from './sentiment';
export { CampaignEngine, createCampaignEngine } from './campaign-engine';

// Mock LLM (for development)
export { mockLLM } from './mock-llm';

// Re-export types for convenience
export type {
  // Chatbot
  ChatContext,
  ChatbotResponse,
  ConversationTurn,
  SuggestedAction,
  ResponseMetadata,
  OrganizationSettings,
  BusinessHours,
  AppointmentSummary,
  InsuranceSummary,
  PendingBooking,
  TimeSlot,

  // Intent Detection
  IntentDetectionResult,
  ExtractedEntities,

  // Booking
  BookingRequest,
  BookingResponse,

  // FAQ
  FAQRequest,
  FAQResponse,
  FAQEntry,

  // Sentiment
  SentimentAnalysisRequest,
  SentimentAnalysisResult,
  FeedbackSummary,
  PatientFeedbackSummary,
  SentimentTrend,

  // Campaigns
  RecallCampaignCriteria,
  ReactivationCampaignCriteria,
  CampaignSequenceStep,
  CampaignStats,
  CampaignPatientResult,
} from './types';
