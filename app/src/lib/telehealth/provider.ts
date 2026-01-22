/**
 * Video Provider Interface
 * Epic 21: Telehealth & Virtual Care
 *
 * Abstract interface for video conferencing providers (Twilio, Zoom, etc.)
 */

import { TelehealthProvider } from '@prisma/client';
import type {
  VideoProviderConfig,
  CreateRoomRequest,
  CreateRoomResult,
  RoomStatus,
  GenerateTokenRequest,
  GenerateTokenResult,
  Participant,
  ParticipantAction,
  StartRecordingRequest,
  RecordingResult,
  WebhookVerificationResult,
  QualityMetrics,
  ProviderCapabilities,
  ProviderStatus,
} from './types';

/**
 * VideoProvider interface
 *
 * All video conferencing providers must implement this interface.
 * This allows swapping between Twilio, Zoom, or any other provider.
 */
export interface VideoProvider {
  /**
   * Provider identification
   */
  readonly providerType: TelehealthProvider;
  readonly name: string;
  readonly version: string;

  /**
   * Initialize the provider with configuration
   */
  initialize(config: VideoProviderConfig): Promise<void>;

  /**
   * Check if the provider is properly configured and ready
   */
  isReady(): boolean;

  /**
   * Get provider capabilities
   */
  getCapabilities(): ProviderCapabilities;

  /**
   * Check provider health/availability
   */
  checkStatus(): Promise<ProviderStatus>;

  // ============================================
  // Room Management
  // ============================================

  /**
   * Create a video room for a telehealth session
   */
  createRoom(request: CreateRoomRequest): Promise<CreateRoomResult>;

  /**
   * Get room status
   */
  getRoomStatus(roomName: string): Promise<RoomStatus>;

  /**
   * End/close a room
   */
  endRoom(roomName: string): Promise<{ success: boolean; errorMessage?: string }>;

  /**
   * Delete a room (cleanup)
   */
  deleteRoom(roomName: string): Promise<{ success: boolean; errorMessage?: string }>;

  // ============================================
  // Token Generation
  // ============================================

  /**
   * Generate an access token for a participant to join a room
   */
  generateToken(request: GenerateTokenRequest): Promise<GenerateTokenResult>;

  /**
   * Revoke a token (if supported)
   */
  revokeToken?(token: string): Promise<{ success: boolean; errorMessage?: string }>;

  // ============================================
  // Participant Management
  // ============================================

  /**
   * Get list of participants in a room
   */
  getParticipants(roomName: string): Promise<Participant[]>;

  /**
   * Perform an action on a participant (mute, disconnect, etc.)
   */
  participantAction(action: ParticipantAction): Promise<{ success: boolean; errorMessage?: string }>;

  // ============================================
  // Recording
  // ============================================

  /**
   * Start recording a session
   */
  startRecording?(request: StartRecordingRequest): Promise<RecordingResult>;

  /**
   * Stop recording
   */
  stopRecording?(roomName: string): Promise<RecordingResult>;

  /**
   * Get recording status
   */
  getRecordingStatus?(recordingId: string): Promise<RecordingResult>;

  /**
   * Get recording download URL
   */
  getRecordingUrl?(recordingId: string): Promise<{ url?: string; expiresAt?: Date; errorMessage?: string }>;

  /**
   * Delete a recording
   */
  deleteRecording?(recordingId: string): Promise<{ success: boolean; errorMessage?: string }>;

  // ============================================
  // Webhooks
  // ============================================

  /**
   * Verify webhook signature and parse event
   */
  verifyWebhook(
    payload: string | Buffer,
    signature: string,
    timestamp?: string
  ): Promise<WebhookVerificationResult>;

  /**
   * Get supported webhook event types
   */
  getSupportedWebhookEvents(): string[];

  // ============================================
  // Quality Metrics
  // ============================================

  /**
   * Get quality metrics for a participant
   */
  getQualityMetrics?(roomName: string, participantIdentity: string): Promise<QualityMetrics | null>;
}

/**
 * Base class with common functionality
 */
export abstract class BaseVideoProvider implements VideoProvider {
  abstract readonly providerType: TelehealthProvider;
  abstract readonly name: string;
  abstract readonly version: string;

  protected config: VideoProviderConfig | null = null;
  protected initialized = false;

  async initialize(config: VideoProviderConfig): Promise<void> {
    this.config = config;
    this.initialized = true;
  }

  isReady(): boolean {
    return this.initialized && this.config !== null;
  }

  protected ensureInitialized(): void {
    if (!this.isReady()) {
      throw new Error(`${this.name} provider is not initialized. Call initialize() first.`);
    }
  }

  /**
   * Generate a unique room name based on appointment ID
   */
  protected generateRoomName(appointmentId: string): string {
    // Use appointment ID with a timestamp to ensure uniqueness
    const timestamp = Date.now().toString(36);
    return `chiroflow-${appointmentId}-${timestamp}`;
  }

  /**
   * Validate room name format
   */
  protected validateRoomName(roomName: string): boolean {
    // Room names should be alphanumeric with hyphens, max 128 chars
    const pattern = /^[a-zA-Z0-9-_]{1,128}$/;
    return pattern.test(roomName);
  }

  // Abstract methods that must be implemented
  abstract getCapabilities(): ProviderCapabilities;
  abstract checkStatus(): Promise<ProviderStatus>;
  abstract createRoom(request: CreateRoomRequest): Promise<CreateRoomResult>;
  abstract getRoomStatus(roomName: string): Promise<RoomStatus>;
  abstract endRoom(roomName: string): Promise<{ success: boolean; errorMessage?: string }>;
  abstract deleteRoom(roomName: string): Promise<{ success: boolean; errorMessage?: string }>;
  abstract generateToken(request: GenerateTokenRequest): Promise<GenerateTokenResult>;
  abstract getParticipants(roomName: string): Promise<Participant[]>;
  abstract participantAction(action: ParticipantAction): Promise<{ success: boolean; errorMessage?: string }>;
  abstract verifyWebhook(
    payload: string | Buffer,
    signature: string,
    timestamp?: string
  ): Promise<WebhookVerificationResult>;
  abstract getSupportedWebhookEvents(): string[];
}
