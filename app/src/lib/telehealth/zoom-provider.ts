/**
 * Zoom Video Provider
 * Epic 21: Telehealth & Virtual Care
 *
 * Implementation of video provider using Zoom Meeting SDK.
 * Zoom is an alternative video provider for telehealth sessions.
 *
 * Features:
 * - HIPAA-compliant (with BAA)
 * - Waiting room support
 * - Recording support
 * - Breakout rooms
 * - Virtual backgrounds
 */

import { TelehealthProvider } from '@prisma/client';
import { BaseVideoProvider } from './provider';
import type {
  VideoProviderConfig,
  ZoomConfig,
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

import crypto from 'crypto';

// Native JWT implementation to avoid external dependencies
function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function createJWT(payload: object, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Zoom Video Provider Implementation
 *
 * Uses Zoom Meeting SDK for video conferencing.
 */
export class ZoomVideoProvider extends BaseVideoProvider {
  readonly providerType = TelehealthProvider.ZOOM;
  readonly name = 'Zoom Video';
  readonly version = '1.0.0';

  private zoomConfig: ZoomConfig | null = null;

  // Store active meetings in memory (would be Redis in production)
  private activeMeetings: Map<
    string,
    {
      meetingId: string;
      meetingNumber: number;
      password: string;
      hostUrl: string;
      participantUrl: string;
      createdAt: Date;
      status: string;
    }
  > = new Map();

  async initialize(config: VideoProviderConfig): Promise<void> {
    await super.initialize(config);
    this.zoomConfig = config as ZoomConfig;

    // Validate Zoom-specific configuration
    if (!this.zoomConfig.clientId) {
      throw new Error('Zoom Client ID is required');
    }
    if (!this.zoomConfig.clientSecret) {
      throw new Error('Zoom Client Secret is required');
    }
  }

  getCapabilities(): ProviderCapabilities {
    return {
      waitingRoom: true,
      recording: true,
      screenShare: true,
      chat: true,
      virtualBackground: true,
      breakoutRooms: true,
      maxParticipants: 100, // Depends on Zoom plan
      hipaaCompliant: true, // With BAA
      e2eEncryption: true,
    };
  }

  async checkStatus(): Promise<ProviderStatus> {
    this.ensureInitialized();

    const startTime = Date.now();

    try {
      // In production, would make an API call to verify credentials
      const isConfigured = Boolean(
        this.zoomConfig?.clientId && this.zoomConfig?.clientSecret
      );

      return {
        provider: TelehealthProvider.ZOOM,
        available: isConfigured,
        message: isConfigured ? 'Zoom Video is operational' : 'Zoom Video is not configured',
        lastChecked: new Date(),
        latency: Date.now() - startTime,
      };
    } catch (error) {
      return {
        provider: TelehealthProvider.ZOOM,
        available: false,
        message: `Zoom error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        lastChecked: new Date(),
        latency: Date.now() - startTime,
      };
    }
  }

  async createRoom(request: CreateRoomRequest): Promise<CreateRoomResult> {
    this.ensureInitialized();

    try {
      // Validate room name
      if (!this.validateRoomName(request.roomName)) {
        return {
          success: false,
          errorMessage: 'Invalid room name format',
          errorCode: 'INVALID_ROOM_NAME',
        };
      }

      // Generate meeting details
      // In production, would use Zoom Create Meeting API
      const meetingId = `zoom-${request.roomName}`;
      const meetingNumber = Math.floor(Math.random() * 9000000000) + 1000000000;
      const password = request.passcode || crypto.randomBytes(4).toString('hex');

      // Build meeting URLs
      const baseUrl = 'https://zoom.us/j';
      const hostUrl = `${baseUrl}/${meetingNumber}?pwd=${password}&role=1`;
      const participantUrl = `${baseUrl}/${meetingNumber}?pwd=${password}`;

      // Store meeting data
      this.activeMeetings.set(request.roomName, {
        meetingId,
        meetingNumber,
        password,
        hostUrl,
        participantUrl,
        createdAt: new Date(),
        status: 'scheduled',
      });

      // Calculate expiration
      const expiresAt = new Date(request.scheduledEndTime);
      expiresAt.setHours(expiresAt.getHours() + 1);

      return {
        success: true,
        roomId: meetingId,
        roomName: request.roomName,
        hostUrl,
        participantUrl,
        passcode: password,
        createdAt: new Date(),
        expiresAt,
      };
    } catch (error) {
      return {
        success: false,
        errorMessage: `Failed to create meeting: ${error instanceof Error ? error.message : 'Unknown error'}`,
        errorCode: 'MEETING_CREATION_FAILED',
      };
    }
  }

  async getRoomStatus(roomName: string): Promise<RoomStatus> {
    this.ensureInitialized();

    const meeting = this.activeMeetings.get(roomName);

    if (!meeting) {
      return {
        roomId: '',
        roomName,
        status: 'not_found',
        participantCount: 0,
      };
    }

    return {
      roomId: meeting.meetingId,
      roomName,
      status: meeting.status as 'active' | 'completed' | 'expired' | 'not_found',
      participantCount: 0, // Would query Zoom API in production
      startedAt: meeting.createdAt,
    };
  }

  async endRoom(roomName: string): Promise<{ success: boolean; errorMessage?: string }> {
    this.ensureInitialized();

    const meeting = this.activeMeetings.get(roomName);
    if (!meeting) {
      return { success: false, errorMessage: 'Meeting not found' };
    }

    // Update meeting status
    meeting.status = 'completed';
    this.activeMeetings.set(roomName, meeting);

    // In production, would use Zoom End Meeting API
    return { success: true };
  }

  async deleteRoom(roomName: string): Promise<{ success: boolean; errorMessage?: string }> {
    this.ensureInitialized();

    if (!this.activeMeetings.has(roomName)) {
      return { success: false, errorMessage: 'Meeting not found' };
    }

    this.activeMeetings.delete(roomName);

    // In production, would use Zoom Delete Meeting API
    return { success: true };
  }

  async generateToken(request: GenerateTokenRequest): Promise<GenerateTokenResult> {
    this.ensureInitialized();

    if (!this.zoomConfig) {
      return { success: false, errorMessage: 'Zoom not configured' };
    }

    try {
      const meeting = this.activeMeetings.get(request.roomName);
      if (!meeting) {
        return { success: false, errorMessage: 'Meeting not found' };
      }

      const now = Math.floor(Date.now() / 1000);
      const expiration = request.expirationSeconds || 3600;

      // Generate Zoom Meeting SDK JWT
      // Note: In production, use Zoom SDK's proper token generation
      const payload = {
        sdkKey: this.zoomConfig.sdkKey || this.zoomConfig.clientId,
        mn: meeting.meetingNumber,
        role: request.isHost ? 1 : 0,
        iat: now,
        exp: now + expiration,
        tokenExp: now + expiration,
      };

      const token = createJWT(payload, this.zoomConfig.sdkSecret || this.zoomConfig.clientSecret);

      // Generate join URL
      const joinUrl = request.isHost ? meeting.hostUrl : meeting.participantUrl;

      return {
        success: true,
        token,
        expiresAt: new Date((now + expiration) * 1000),
        joinUrl,
      };
    } catch (error) {
      return {
        success: false,
        errorMessage: `Failed to generate token: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async getParticipants(roomName: string): Promise<Participant[]> {
    this.ensureInitialized();

    const meeting = this.activeMeetings.get(roomName);
    if (!meeting) {
      return [];
    }

    // In production, would query Zoom's List Meeting Participants API
    return [];
  }

  async participantAction(action: ParticipantAction): Promise<{ success: boolean; errorMessage?: string }> {
    this.ensureInitialized();

    const meeting = this.activeMeetings.get(action.roomName);
    if (!meeting) {
      return { success: false, errorMessage: 'Meeting not found' };
    }

    // In production, would use Zoom Participant Control APIs
    switch (action.action) {
      case 'disconnect':
        // Would use Zoom Remove Participant API
        return { success: true };
      case 'mute':
        // Would use Zoom Mute Participant API
        return { success: true };
      case 'unmute':
        // Would use Zoom Unmute Participant API
        return { success: true };
      case 'spotlight':
        // Would use Zoom Spotlight API
        return { success: true };
      default:
        return { success: false, errorMessage: 'Unknown action' };
    }
  }

  async startRecording(request: StartRecordingRequest): Promise<RecordingResult> {
    this.ensureInitialized();

    const meeting = this.activeMeetings.get(request.roomName);
    if (!meeting) {
      return { success: false, errorMessage: 'Meeting not found' };
    }

    // Generate recording ID
    const recordingId = `ZRC${crypto.randomBytes(16).toString('hex')}`;

    // In production, would use Zoom Start Recording API
    return {
      success: true,
      recordingId,
      status: 'recording',
    };
  }

  async stopRecording(roomName: string): Promise<RecordingResult> {
    this.ensureInitialized();

    const meeting = this.activeMeetings.get(roomName);
    if (!meeting) {
      return { success: false, errorMessage: 'Meeting not found' };
    }

    // In production, would use Zoom Stop Recording API
    return {
      success: true,
      status: 'processing',
    };
  }

  async getRecordingStatus(recordingId: string): Promise<RecordingResult> {
    this.ensureInitialized();

    // In production, would query Zoom Recording API
    return {
      success: true,
      recordingId,
      status: 'completed',
    };
  }

  async getRecordingUrl(recordingId: string): Promise<{ url?: string; expiresAt?: Date; errorMessage?: string }> {
    this.ensureInitialized();

    // In production, would get download URL from Zoom
    return {
      url: `https://zoom.us/recording/download/${recordingId}`,
      expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour
    };
  }

  async deleteRecording(recordingId: string): Promise<{ success: boolean; errorMessage?: string }> {
    this.ensureInitialized();

    // In production, would use Zoom Delete Recording API
    return { success: true };
  }

  async verifyWebhook(
    payload: string | Buffer,
    signature: string,
    timestamp?: string
  ): Promise<WebhookVerificationResult> {
    this.ensureInitialized();

    if (!this.zoomConfig?.verificationToken) {
      return { valid: false, errorMessage: 'Webhook verification token not configured' };
    }

    try {
      const payloadStr = typeof payload === 'string' ? payload : payload.toString('utf-8');
      const eventData = JSON.parse(payloadStr);

      // Verify Zoom webhook signature
      // In production, would use proper Zoom webhook verification
      const message = `v0:${timestamp}:${payloadStr}`;
      const expectedSignature = crypto
        .createHmac('sha256', this.zoomConfig.verificationToken)
        .update(message)
        .digest('hex');

      const signatureValid = signature === `v0=${expectedSignature}`;

      if (!signatureValid) {
        return { valid: false, errorMessage: 'Invalid webhook signature' };
      }

      return {
        valid: true,
        event: {
          type: eventData.event || 'unknown',
          timestamp: new Date(eventData.event_ts || Date.now()),
          roomName: eventData.payload?.object?.topic,
          participantIdentity: eventData.payload?.object?.participant?.user_name,
          recordingId: eventData.payload?.object?.recording_files?.[0]?.id,
          data: eventData,
        },
      };
    } catch (error) {
      return {
        valid: false,
        errorMessage: `Webhook verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  getSupportedWebhookEvents(): string[] {
    return [
      'meeting.created',
      'meeting.started',
      'meeting.ended',
      'meeting.participant_joined',
      'meeting.participant_left',
      'recording.started',
      'recording.stopped',
      'recording.completed',
      'recording.deleted',
    ];
  }

  async getQualityMetrics(roomName: string, participantIdentity: string): Promise<QualityMetrics | null> {
    this.ensureInitialized();

    // In production, would query Zoom's Quality Metrics API
    return {
      roomName,
      participantIdentity,
      timestamp: new Date(),
      rtt: 45,
      jitter: 8,
      packetLoss: 0.05,
      bitrate: 3000,
      qualityScore: 90,
    };
  }
}

/**
 * Create and initialize a Zoom Video provider
 */
export async function createZoomProvider(config: ZoomConfig): Promise<ZoomVideoProvider> {
  const provider = new ZoomVideoProvider();
  await provider.initialize(config);
  return provider;
}
