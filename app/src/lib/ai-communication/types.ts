/**
 * Epic 12: AI Communication Agent - Type Definitions
 */

import type {
  AIIntent,
  ChatSessionStatus,
  ChatSenderType,
  CampaignStatus,
  CampaignType,
  PatientCampaignStatus,
  FeedbackSentiment,
  CommunicationChannel,
} from '@prisma/client';

// Re-export Prisma enums for convenience
export type {
  AIIntent,
  ChatSessionStatus,
  ChatSenderType,
  CampaignStatus,
  CampaignType,
  PatientCampaignStatus,
  FeedbackSentiment,
};

// ==================== Chatbot Types ====================

export interface ChatContext {
  patientId?: string;
  patientName?: string;
  recentAppointments?: AppointmentSummary[];
  insuranceInfo?: InsuranceSummary[];
  pendingBooking?: PendingBooking | null;
  conversationHistory?: ConversationTurn[];
  detectedIntents?: AIIntent[];
  organizationSettings?: OrganizationSettings;
}

export interface AppointmentSummary {
  id: string;
  date: Date;
  type: string;
  provider: string;
  status: string;
}

export interface InsuranceSummary {
  payerName: string;
  planType?: string;
  policyNumber: string;
  copay?: number;
  isActive: boolean;
}

export interface PendingBooking {
  appointmentTypeId?: string;
  appointmentTypeName?: string;
  providerId?: string;
  providerName?: string;
  preferredDate?: Date;
  preferredTimeRange?: { start: string; end: string };
  availableSlots?: TimeSlot[];
  selectedSlot?: TimeSlot;
  step: 'type' | 'provider' | 'date' | 'time' | 'confirm';
}

export interface TimeSlot {
  startTime: Date;
  endTime: Date;
  providerId: string;
  providerName: string;
  roomId?: string;
}

export interface ConversationTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  intent?: AIIntent;
}

export interface OrganizationSettings {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  hours?: BusinessHours;
  services?: string[];
  acceptedInsurances?: string[];
}

export interface BusinessHours {
  monday?: { open: string; close: string };
  tuesday?: { open: string; close: string };
  wednesday?: { open: string; close: string };
  thursday?: { open: string; close: string };
  friday?: { open: string; close: string };
  saturday?: { open: string; close: string };
  sunday?: { open: string; close: string };
}

// ==================== Intent Detection ====================

export interface IntentDetectionResult {
  intent: AIIntent;
  confidence: number;
  entities?: ExtractedEntities;
}

export interface ExtractedEntities {
  date?: string;
  time?: string;
  provider?: string;
  appointmentType?: string;
  insuranceName?: string;
  complaint?: string;
  topic?: string;
}

// ==================== Chatbot Response ====================

export interface ChatbotResponse {
  message: string;
  intent: AIIntent;
  confidence: number;
  suggestedActions?: SuggestedAction[];
  context?: Partial<ChatContext>;
  metadata?: ResponseMetadata;
}

export interface SuggestedAction {
  type: 'button' | 'quickReply' | 'link';
  label: string;
  value: string;
  url?: string;
}

export interface ResponseMetadata {
  model?: string;
  tokens?: number;
  latencyMs?: number;
  fallback?: boolean;
}

// ==================== Booking Agent ====================

export interface BookingRequest {
  userMessage: string;
  context: ChatContext;
  organizationId: string;
}

export interface BookingResponse {
  message: string;
  updatedBooking?: PendingBooking;
  suggestedSlots?: TimeSlot[];
  bookingComplete?: boolean;
  appointmentId?: string;
}

// ==================== FAQ Agent ====================

export interface FAQRequest {
  question: string;
  category?: 'insurance' | 'general' | 'services' | 'hours' | 'location';
  context: ChatContext;
  organizationId: string;
}

export interface FAQResponse {
  answer: string;
  confidence: number;
  sources?: string[];
  relatedQuestions?: string[];
}

export interface FAQEntry {
  question: string;
  answer: string;
  keywords: string[];
  category: string;
}

// ==================== Sentiment Analysis ====================

export interface SentimentAnalysisRequest {
  text: string;
  source?: string;
}

export interface SentimentAnalysisResult {
  sentiment: FeedbackSentiment;
  score: number; // -1 to 1
  confidence: number; // 0 to 1
  keyPhrases?: string[];
  topics?: string[];
  suggestedActions?: string[];
}

// ==================== Campaign Types ====================

export interface RecallCampaignCriteria {
  lastVisitDateRange?: {
    start?: Date;
    end?: Date;
  };
  appointmentTypes?: string[];
  providers?: string[];
  excludePatientIds?: string[];
  patientStatus?: string[];
  minVisits?: number;
  maxVisits?: number;
}

export interface ReactivationCampaignCriteria {
  minDaysSinceVisit: number;
  maxDaysSinceVisit?: number;
  excludeActivePatients: boolean;
  appointmentTypes?: string[];
  providers?: string[];
}

export interface CampaignSequenceStep {
  stepNumber: number;
  delayDays: number;
  channel: CommunicationChannel;
  templateId?: string;
  customSubject?: string;
  customBody?: string;
}

export interface CampaignStats {
  totalTargeted: number;
  totalSent: number;
  totalDelivered: number;
  totalResponded: number;
  totalConverted: number;
  deliveryRate: number;
  responseRate: number;
  conversionRate: number;
}

export interface CampaignPatientResult {
  patientId: string;
  status: PatientCampaignStatus;
  sentAt?: Date;
  deliveredAt?: Date;
  respondedAt?: Date;
  convertedAt?: Date;
  response?: string;
  failureReason?: string;
}

// ==================== Feedback Summary ====================

export interface FeedbackSummary {
  totalFeedback: number;
  averageSentiment: number;
  sentimentBreakdown: {
    positive: number;
    neutral: number;
    negative: number;
  };
  topTopics: { topic: string; count: number }[];
  recentNegative: PatientFeedbackSummary[];
  requiresFollowUp: number;
  trendsOverTime?: SentimentTrend[];
}

export interface PatientFeedbackSummary {
  id: string;
  patientName: string;
  content: string;
  sentiment: FeedbackSentiment;
  sentimentScore: number;
  source: string;
  createdAt: Date;
}

export interface SentimentTrend {
  date: Date;
  averageScore: number;
  count: number;
}
