/**
 * Telehealth Types
 * Epic 21: Telehealth & Virtual Care
 *
 * Type definitions for video provider integration
 */

import { TelehealthProvider, TelehealthSessionStatus } from '@prisma/client';

// ============================================
// CONFIGURATION TYPES
// ============================================

/**
 * Base configuration for all video providers
 */
export interface VideoProviderConfig {
  /** API key or account SID */
  apiKey: string;
  /** API secret or auth token */
  apiSecret: string;
  /** Optional webhook URL for events */
  webhookUrl?: string;
  /** Optional webhook secret for verification */
  webhookSecret?: string;
  /** Environment (development, production) */
  environment?: 'development' | 'production';
}

/**
 * Twilio-specific configuration
 */
export interface TwilioConfig extends VideoProviderConfig {
  accountSid: string;
  apiKeySid: string;
  apiKeySecret: string;
  /** Optional status callback URL */
  statusCallbackUrl?: string;
}

/**
 * Zoom-specific configuration
 */
export interface ZoomConfig extends VideoProviderConfig {
  clientId: string;
  clientSecret: string;
  /** SDK key for web client */
  sdkKey?: string;
  /** SDK secret for web client */
  sdkSecret?: string;
  /** Zoom webhook verification token */
  verificationToken?: string;
}

/**
 * Google Meet-specific configuration
 */
export interface GoogleMeetConfig extends VideoProviderConfig {
  /** Service account credentials JSON */
  serviceAccountKey: string;
  /** Delegated user email for domain-wide delegation */
  delegatedUserEmail?: string;
}

// ============================================
// ROOM TYPES
// ============================================

/**
 * Request to create a video room
 */
export interface CreateRoomRequest {
  /** Unique identifier for the room (e.g., appointment ID) */
  roomName: string;
  /** Display name for the room */
  displayName?: string;
  /** Scheduled start time */
  scheduledStartTime: Date;
  /** Scheduled end time */
  scheduledEndTime: Date;
  /** Maximum participants allowed */
  maxParticipants?: number;
  /** Enable recording */
  recordingEnabled?: boolean;
  /** Enable waiting room */
  waitingRoomEnabled?: boolean;
  /** Passcode for the room */
  passcode?: string;
  /** Additional metadata */
  metadata?: Record<string, string>;
}

/**
 * Result of creating a video room
 */
export interface CreateRoomResult {
  success: boolean;
  /** Provider-specific room ID */
  roomId?: string;
  /** Room name/unique identifier */
  roomName?: string;
  /** URL for the host to join */
  hostUrl?: string;
  /** URL for participants to join */
  participantUrl?: string;
  /** Passcode if required */
  passcode?: string;
  /** Room creation timestamp */
  createdAt?: Date;
  /** Room expiration timestamp */
  expiresAt?: Date;
  /** Error message if failed */
  errorMessage?: string;
  /** Error code if failed */
  errorCode?: string;
}

/**
 * Room status information
 */
export interface RoomStatus {
  roomId: string;
  roomName: string;
  status: 'active' | 'completed' | 'expired' | 'not_found';
  participantCount: number;
  duration?: number;
  startedAt?: Date;
  endedAt?: Date;
}

// ============================================
// TOKEN TYPES
// ============================================

/**
 * Request to generate an access token for a room
 */
export interface GenerateTokenRequest {
  /** Room identifier */
  roomName: string;
  /** Participant identity (user ID) */
  identity: string;
  /** Participant display name */
  displayName: string;
  /** Is this participant a host/provider */
  isHost?: boolean;
  /** Token expiration in seconds */
  expirationSeconds?: number;
  /** Additional grants/permissions */
  grants?: {
    canPublish?: boolean;
    canSubscribe?: boolean;
    canShareScreen?: boolean;
    canRecord?: boolean;
  };
}

/**
 * Result of generating an access token
 */
export interface GenerateTokenResult {
  success: boolean;
  /** Access token for the video service */
  token?: string;
  /** Token expiration timestamp */
  expiresAt?: Date;
  /** Join URL with embedded token (if supported) */
  joinUrl?: string;
  /** Error message if failed */
  errorMessage?: string;
}

// ============================================
// PARTICIPANT TYPES
// ============================================

/**
 * Participant information
 */
export interface Participant {
  identity: string;
  displayName: string;
  isHost: boolean;
  joinedAt: Date;
  leftAt?: Date;
  audioEnabled: boolean;
  videoEnabled: boolean;
  connectionQuality?: 'excellent' | 'good' | 'fair' | 'poor';
}

/**
 * Request to manage a participant
 */
export interface ParticipantAction {
  roomName: string;
  participantIdentity: string;
  action: 'mute' | 'unmute' | 'disconnect' | 'spotlight';
}

// ============================================
// RECORDING TYPES
// ============================================

/**
 * Request to start recording
 */
export interface StartRecordingRequest {
  roomName: string;
  /** Recording layout (speaker view, gallery, etc.) */
  layout?: 'speaker' | 'gallery' | 'grid';
  /** Video resolution */
  resolution?: '720p' | '1080p';
  /** Audio only recording */
  audioOnly?: boolean;
}

/**
 * Recording result
 */
export interface RecordingResult {
  success: boolean;
  /** Recording ID */
  recordingId?: string;
  /** Recording status */
  status?: 'recording' | 'processing' | 'completed' | 'failed';
  /** Recording URL (when completed) */
  url?: string;
  /** Duration in seconds */
  duration?: number;
  /** File size in bytes */
  fileSize?: number;
  /** Error message if failed */
  errorMessage?: string;
}

// ============================================
// WEBHOOK TYPES
// ============================================

/**
 * Webhook event from video provider
 */
export interface VideoWebhookEvent {
  /** Event type */
  type: string;
  /** Event timestamp */
  timestamp: Date;
  /** Room identifier */
  roomName?: string;
  /** Participant identity */
  participantIdentity?: string;
  /** Recording ID (for recording events) */
  recordingId?: string;
  /** Raw event data */
  data: Record<string, unknown>;
}

/**
 * Webhook verification result
 */
export interface WebhookVerificationResult {
  valid: boolean;
  event?: VideoWebhookEvent;
  errorMessage?: string;
}

// ============================================
// QUALITY METRICS
// ============================================

/**
 * Connection quality metrics
 */
export interface QualityMetrics {
  roomName: string;
  participantIdentity: string;
  /** Timestamp of metrics */
  timestamp: Date;
  /** Round-trip time in ms */
  rtt?: number;
  /** Jitter in ms */
  jitter?: number;
  /** Packet loss percentage */
  packetLoss?: number;
  /** Bitrate in kbps */
  bitrate?: number;
  /** Overall quality score (0-100) */
  qualityScore?: number;
}

// ============================================
// PROVIDER CAPABILITY FLAGS
// ============================================

/**
 * Capabilities supported by a video provider
 */
export interface ProviderCapabilities {
  /** Supports waiting room */
  waitingRoom: boolean;
  /** Supports recording */
  recording: boolean;
  /** Supports screen sharing */
  screenShare: boolean;
  /** Supports chat */
  chat: boolean;
  /** Supports background blur/virtual backgrounds */
  virtualBackground: boolean;
  /** Supports breakout rooms */
  breakoutRooms: boolean;
  /** Maximum participants */
  maxParticipants: number;
  /** Supports HIPAA compliance */
  hipaaCompliant: boolean;
  /** Supports end-to-end encryption */
  e2eEncryption: boolean;
}

// ============================================
// PROVIDER STATUS
// ============================================

/**
 * Provider health status
 */
export interface ProviderStatus {
  provider: TelehealthProvider;
  /** Is provider available */
  available: boolean;
  /** Status message */
  message?: string;
  /** Last checked timestamp */
  lastChecked: Date;
  /** Latency in ms */
  latency?: number;
}
