/**
 * Epic 30: AI Receptionist Agent - Type Definitions
 * US-301: Voice AI Integration
 */

import type {
  ConversationChannel,
  AIConversationStatus,
  AIActionType,
  AIActionResult,
  AIEscalationReason,
  KnowledgeBaseCategory,
} from '@prisma/client';

// Re-export Prisma enums for convenience
export type {
  ConversationChannel,
  AIConversationStatus,
  AIActionType,
  AIActionResult,
  AIEscalationReason,
  KnowledgeBaseCategory,
};

// ==================== Voice Configuration ====================

export interface VoiceConfig {
  voiceProvider: 'openai' | 'elevenlabs' | 'azure';
  voiceId: string;
  voiceSpeed: number;
  voicePitch: number;
  primaryLanguage: string;
  supportedLanguages: string[];
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

export interface EscalationRule {
  trigger: 'keyword' | 'sentiment' | 'confidence' | 'time' | 'intent';
  condition: string;
  action: 'transfer' | 'queue' | 'message';
  target?: string;
}

// ==================== Call State Management ====================

export interface CallState {
  callSid: string;
  organizationId: string;
  conversationId?: string;
  patientId?: string;
  phoneNumber: string;
  status: 'ringing' | 'in-progress' | 'on-hold' | 'transferring' | 'completed' | 'failed';
  direction: 'inbound' | 'outbound';
  startedAt: Date;
  recordingConsent: boolean;
  recordingSid?: string;
  transcript: TranscriptEntry[];
  context: CallContext;
  metadata?: Record<string, unknown>;
}

export interface TranscriptEntry {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  confidence?: number;
  duration?: number; // Audio duration in milliseconds
}

export interface CallContext {
  patientIdentified: boolean;
  patientName?: string;
  intent?: AIActionType;
  intents: AIActionType[];
  pendingAction?: PendingAction;
  appointmentContext?: AppointmentContext;
  lastResponse?: string;
  turnCount: number;
  frustrationLevel: number; // 0-1
  silenceCount: number;
  retryCount: number;
}

export interface PendingAction {
  type: AIActionType;
  parameters: Record<string, unknown>;
  awaitingConfirmation: boolean;
}

export interface AppointmentContext {
  appointmentTypeId?: string;
  appointmentTypeName?: string;
  providerId?: string;
  providerName?: string;
  preferredDate?: Date;
  preferredTimeRange?: { start: string; end: string };
  selectedSlot?: AvailableSlot;
  step: 'type' | 'provider' | 'date' | 'time' | 'confirm';
}

export interface AvailableSlot {
  startTime: Date;
  endTime: Date;
  providerId: string;
  providerName: string;
  roomId?: string;
}

// ==================== Twilio Integration ====================

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
  statusCallbackUrl: string;
  recordingStatusCallbackUrl?: string;
  transcriptionCallbackUrl?: string;
}

export interface TwilioWebhookPayload {
  CallSid: string;
  AccountSid: string;
  From: string;
  To: string;
  CallStatus: 'queued' | 'ringing' | 'in-progress' | 'completed' | 'busy' | 'failed' | 'no-answer' | 'canceled';
  Direction: 'inbound' | 'outbound' | 'outbound-api' | 'outbound-dial';
  CallerName?: string;
  CallerCity?: string;
  CallerState?: string;
  CallerCountry?: string;
  CallerZip?: string;
  Digits?: string;
  SpeechResult?: string;
  Confidence?: string;
  RecordingUrl?: string;
  RecordingSid?: string;
  RecordingDuration?: string;
  TranscriptionText?: string;
  TranscriptionStatus?: 'completed' | 'failed';
}

export interface TwilioStreamPayload {
  event: 'connected' | 'start' | 'media' | 'stop' | 'mark';
  sequenceNumber?: string;
  streamSid?: string;
  media?: {
    track: 'inbound' | 'outbound';
    chunk: string;
    timestamp: string;
    payload: string; // Base64 encoded audio
  };
  start?: {
    streamSid: string;
    accountSid: string;
    callSid: string;
    tracks: string[];
    customParameters?: Record<string, string>;
  };
  stop?: {
    accountSid: string;
    callSid: string;
  };
  mark?: {
    name: string;
  };
}

// ==================== OpenAI Realtime API ====================

export interface OpenAIRealtimeConfig {
  apiKey: string;
  model: 'gpt-4o-realtime-preview' | 'gpt-4o-realtime-preview-2024-10-01';
  voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  instructions?: string;
  inputAudioFormat?: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
  outputAudioFormat?: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
  inputAudioTranscription?: {
    model: 'whisper-1';
  };
  turnDetection?: {
    type: 'server_vad';
    threshold?: number;
    prefix_padding_ms?: number;
    silence_duration_ms?: number;
  };
}

export interface OpenAISessionConfig {
  modalities: ('text' | 'audio')[];
  voice: string;
  instructions: string;
  input_audio_format: string;
  output_audio_format: string;
  input_audio_transcription?: {
    model: string;
  };
  turn_detection?: {
    type: string;
    threshold?: number;
    prefix_padding_ms?: number;
    silence_duration_ms?: number;
  };
  tools?: OpenAITool[];
}

export interface OpenAITool {
  type: 'function';
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface OpenAIRealtimeEvent {
  type: string;
  event_id?: string;
  [key: string]: unknown;
}

export interface OpenAIResponseEvent extends OpenAIRealtimeEvent {
  type: 'response.text.delta' | 'response.audio.delta' | 'response.text.done' | 'response.audio.done' | 'response.done' | 'response.function_call_arguments.done';
  delta?: string;
  text?: string;
  transcript?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
}

export interface OpenAITranscriptEvent extends OpenAIRealtimeEvent {
  type: 'conversation.item.input_audio_transcription.completed' | 'response.audio_transcript.delta' | 'response.audio_transcript.done';
  transcript?: string;
  delta?: string;
  item_id?: string;
}

export interface OpenAIErrorEvent extends OpenAIRealtimeEvent {
  type: 'error';
  error: {
    type: string;
    code?: string;
    message: string;
    param?: string;
  };
}

// ==================== Speech Services ====================

export interface SpeechToTextResult {
  text: string;
  confidence: number;
  isFinal: boolean;
  language?: string;
  words?: WordTiming[];
}

export interface WordTiming {
  word: string;
  startTime: number;
  endTime: number;
  confidence: number;
}

export interface TextToSpeechRequest {
  text: string;
  voice?: string;
  speed?: number;
  pitch?: number;
  format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
}

export interface TextToSpeechResult {
  audio: Buffer;
  duration: number;
  format: string;
}

// ==================== Voice Service Interface ====================

export interface VoiceServiceConfig {
  twilioConfig: TwilioConfig;
  openaiConfig: OpenAIRealtimeConfig;
  voiceConfig: VoiceConfig;
  organizationId: string;
  businessHours?: BusinessHours;
  escalationRules?: EscalationRule[];
  escalationPhone?: string;
  recordByDefault?: boolean;
  recordingDisclosure?: string;
  greeting?: string;
  afterHoursMessage?: string;
  holdMessage?: string;
  transferMessage?: string;
  maxCallDuration?: number;
  silenceTimeout?: number;
}

export interface IncomingCallRequest {
  callSid: string;
  from: string;
  to: string;
  direction: 'inbound' | 'outbound';
  callerName?: string;
  callerCity?: string;
  callerState?: string;
}

export interface CallResponse {
  type: 'gather' | 'say' | 'play' | 'stream' | 'record' | 'dial' | 'hangup' | 'redirect';
  content?: string;
  voice?: string;
  language?: string;
  url?: string;
  timeout?: number;
  finishOnKey?: string;
  speechTimeout?: string;
  speechModel?: string;
  hints?: string;
  actionUrl?: string;
  recordingStatusCallback?: string;
  transcribe?: boolean;
}

export interface ProcessSpeechRequest {
  callSid: string;
  speechResult: string;
  confidence: number;
  callState: CallState;
}

export interface ProcessSpeechResponse {
  response: string;
  action?: AIActionType;
  shouldEscalate: boolean;
  escalationReason?: AIEscalationReason;
  updatedContext: CallContext;
  suggestedResponses?: string[];
}

// ==================== Call Recording ====================

export interface RecordingConfig {
  maxDuration: number;
  playBeep: boolean;
  trim: 'trim-silence' | 'do-not-trim';
  recordingStatusCallback: string;
  recordingChannels: 'mono' | 'dual';
  recordingTrack: 'inbound' | 'outbound' | 'both';
}

export interface RecordingResult {
  recordingSid: string;
  recordingUrl: string;
  duration: number;
  channels: number;
  source: string;
}

// ==================== Call Transfer ====================

export interface TransferRequest {
  callSid: string;
  targetNumber: string;
  reason: string;
  contextSummary: string;
  timeout?: number;
  callerId?: string;
  statusCallback?: string;
}

export interface TransferResult {
  success: boolean;
  transferSid?: string;
  error?: string;
}

// ==================== After Hours Handling ====================

export interface AfterHoursConfig {
  message: string;
  allowVoicemail: boolean;
  voicemailMaxDuration: number;
  emergencyOptions: EmergencyOption[];
  escalationPhone?: string;
}

export interface EmergencyOption {
  digit: string;
  label: string;
  action: 'transfer' | 'message' | 'redirect';
  target?: string;
}

// ==================== Voice AI Events ====================

export type VoiceEventType =
  | 'call.incoming'
  | 'call.answered'
  | 'call.completed'
  | 'call.failed'
  | 'speech.detected'
  | 'speech.timeout'
  | 'transcription.ready'
  | 'response.generated'
  | 'response.spoken'
  | 'action.executed'
  | 'escalation.triggered'
  | 'transfer.initiated'
  | 'transfer.completed'
  | 'recording.started'
  | 'recording.completed'
  | 'error';

export interface VoiceEvent {
  type: VoiceEventType;
  callSid: string;
  organizationId: string;
  timestamp: Date;
  data: Record<string, unknown>;
}

// ==================== Analytics ====================

export interface CallAnalytics {
  callSid: string;
  organizationId: string;
  duration: number;
  status: AIConversationStatus;
  channel: ConversationChannel;
  actionsPerformed: AIActionType[];
  intentsDetected: AIActionType[];
  escalated: boolean;
  escalationReason?: AIEscalationReason;
  patientIdentified: boolean;
  appointmentBooked: boolean;
  questionsAnswered: number;
  averageConfidence: number;
  turnCount: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  recordingDuration?: number;
  holdDuration?: number;
}

export interface VoiceMetrics {
  totalCalls: number;
  answeredCalls: number;
  missedCalls: number;
  averageDuration: number;
  resolutionRate: number;
  escalationRate: number;
  appointmentsBooked: number;
  questionsAnswered: number;
  averageSentiment: number;
  peakHours: { hour: number; count: number }[];
  commonIntents: { intent: AIActionType; count: number }[];
}
