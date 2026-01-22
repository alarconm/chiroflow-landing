/**
 * Telehealth Module
 * Epic 21: Telehealth & Virtual Care
 *
 * Exports for video provider integration
 */

// Types
export type {
  VideoProviderConfig,
  TwilioConfig,
  ZoomConfig,
  GoogleMeetConfig,
  CreateRoomRequest,
  CreateRoomResult,
  RoomStatus,
  GenerateTokenRequest,
  GenerateTokenResult,
  Participant,
  ParticipantAction,
  StartRecordingRequest,
  RecordingResult,
  VideoWebhookEvent,
  WebhookVerificationResult,
  QualityMetrics,
  ProviderCapabilities,
  ProviderStatus,
  // Telehealth documentation types (US-220)
  TelehealthPlaceOfService,
  TelehealthModifier,
  TelehealthTechnologyType,
  TelehealthSOAPContent,
  TelehealthPatientLocation,
  TelehealthProviderLocation,
  TelehealthDocumentation,
  TelehealthSOAPTemplate,
} from './types';

// Telehealth documentation constants and templates (US-220)
export {
  TELEHEALTH_PLACE_OF_SERVICE,
  TELEHEALTH_MODIFIERS,
  DEFAULT_TELEHEALTH_SOAP_TEMPLATE,
} from './types';

// Provider interface and base class
export type { VideoProvider } from './provider';
export { BaseVideoProvider } from './provider';

// Provider implementations
export { TwilioVideoProvider, createTwilioProvider } from './twilio-provider';
export { ZoomVideoProvider, createZoomProvider } from './zoom-provider';

// Video service
export type { VideoServiceConfig } from './video-service';
export {
  VideoService,
  getVideoService,
  initializeVideoService,
  createTelehealthRoom,
} from './video-service';
