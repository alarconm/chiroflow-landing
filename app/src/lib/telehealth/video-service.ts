/**
 * Video Service
 * Epic 21: Telehealth & Virtual Care
 *
 * Main service for video provider management with:
 * - Provider initialization and configuration
 * - Room creation on appointment creation
 * - Unique room URL generation
 * - Fallback provider support
 */

import { TelehealthProvider } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { VideoProvider } from './provider';
import { TwilioVideoProvider, createTwilioProvider } from './twilio-provider';
import { ZoomVideoProvider, createZoomProvider } from './zoom-provider';
import type {
  TwilioConfig,
  ZoomConfig,
  CreateRoomRequest,
  CreateRoomResult,
  GenerateTokenRequest,
  GenerateTokenResult,
  ProviderStatus,
} from './types';
import crypto from 'crypto';

// ============================================
// CONFIGURATION
// ============================================

export interface VideoServiceConfig {
  /** Default provider to use */
  defaultProvider: TelehealthProvider;
  /** Provider configurations */
  providers: {
    twilio?: TwilioConfig;
    zoom?: ZoomConfig;
    googleMeet?: Record<string, string>;
  };
  /** Enable fallback to secondary provider on failure */
  enableFallback: boolean;
  /** Fallback provider order */
  fallbackOrder: TelehealthProvider[];
  /** Base URL for room URLs */
  baseUrl: string;
}

// ============================================
// VIDEO SERVICE
// ============================================

/**
 * VideoService - Main service for telehealth video integration
 *
 * Manages multiple video providers with automatic fallback support.
 */
export class VideoService {
  private config: VideoServiceConfig | null = null;
  private providers: Map<TelehealthProvider, VideoProvider> = new Map();
  private initialized = false;

  /**
   * Initialize the video service with configuration
   */
  async initialize(config: VideoServiceConfig): Promise<void> {
    this.config = config;

    // Initialize configured providers
    if (config.providers.twilio) {
      const twilio = await createTwilioProvider(config.providers.twilio);
      this.providers.set(TelehealthProvider.TWILIO, twilio);
    }

    if (config.providers.zoom) {
      const zoom = await createZoomProvider(config.providers.zoom);
      this.providers.set(TelehealthProvider.ZOOM, zoom);
    }

    this.initialized = true;
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.initialized && this.providers.size > 0;
  }

  /**
   * Get a specific provider
   */
  getProvider(providerType: TelehealthProvider): VideoProvider | undefined {
    return this.providers.get(providerType);
  }

  /**
   * Get the default provider
   */
  getDefaultProvider(): VideoProvider | undefined {
    if (!this.config) return undefined;
    return this.providers.get(this.config.defaultProvider);
  }

  /**
   * Check all provider statuses
   */
  async checkAllProviders(): Promise<ProviderStatus[]> {
    const statuses: ProviderStatus[] = [];

    for (const [type, provider] of this.providers) {
      const status = await provider.checkStatus();
      statuses.push(status);
    }

    return statuses;
  }

  /**
   * Generate a unique room name for an appointment
   */
  generateRoomName(appointmentId: string): string {
    // Create a unique, URL-safe room name
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `cf-${appointmentId.slice(-8)}-${timestamp}-${random}`;
  }

  /**
   * Generate a unique room URL
   */
  generateRoomUrl(roomName: string, isHost: boolean = false): string {
    const baseUrl = this.config?.baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://app.chiroflow.com';
    const roleParam = isHost ? '?role=host' : '';
    return `${baseUrl}/telehealth/room/${roomName}${roleParam}`;
  }

  /**
   * Create a telehealth room for an appointment
   *
   * This should be called when a telehealth appointment is created.
   */
  async createRoomForAppointment(
    appointmentId: string,
    scheduledStartTime: Date,
    scheduledEndTime: Date,
    preferredProvider?: TelehealthProvider
  ): Promise<CreateRoomResult> {
    if (!this.config || !this.initialized) {
      return { success: false, errorMessage: 'Video service not initialized' };
    }

    // Generate unique room name
    const roomName = this.generateRoomName(appointmentId);

    // Determine which provider to use
    const providerType = preferredProvider || this.config.defaultProvider;
    const provider = this.providers.get(providerType);

    if (!provider) {
      // Try fallback if enabled
      if (this.config.enableFallback) {
        return this.createRoomWithFallback(roomName, scheduledStartTime, scheduledEndTime);
      }
      return { success: false, errorMessage: `Provider ${providerType} not configured` };
    }

    // Create room request
    const request: CreateRoomRequest = {
      roomName,
      displayName: `Telehealth Session - ${roomName}`,
      scheduledStartTime,
      scheduledEndTime,
      maxParticipants: 2,
      waitingRoomEnabled: true,
    };

    try {
      const result = await provider.createRoom(request);

      if (result.success) {
        // Generate ChiroFlow-specific URLs
        result.hostUrl = this.generateRoomUrl(roomName, true);
        result.participantUrl = this.generateRoomUrl(roomName, false);
      } else if (this.config.enableFallback) {
        // Try fallback providers
        return this.createRoomWithFallback(roomName, scheduledStartTime, scheduledEndTime, providerType);
      }

      return result;
    } catch (error) {
      if (this.config.enableFallback) {
        return this.createRoomWithFallback(roomName, scheduledStartTime, scheduledEndTime, providerType);
      }
      return {
        success: false,
        errorMessage: `Failed to create room: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Create room with fallback providers
   */
  private async createRoomWithFallback(
    roomName: string,
    scheduledStartTime: Date,
    scheduledEndTime: Date,
    excludeProvider?: TelehealthProvider
  ): Promise<CreateRoomResult> {
    if (!this.config) {
      return { success: false, errorMessage: 'Video service not initialized' };
    }

    const request: CreateRoomRequest = {
      roomName,
      displayName: `Telehealth Session - ${roomName}`,
      scheduledStartTime,
      scheduledEndTime,
      maxParticipants: 2,
      waitingRoomEnabled: true,
    };

    // Try fallback providers in order
    for (const providerType of this.config.fallbackOrder) {
      if (providerType === excludeProvider) continue;

      const provider = this.providers.get(providerType);
      if (!provider) continue;

      try {
        const result = await provider.createRoom(request);
        if (result.success) {
          result.hostUrl = this.generateRoomUrl(roomName, true);
          result.participantUrl = this.generateRoomUrl(roomName, false);
          return result;
        }
      } catch (error) {
        // Continue to next provider
        console.error(`Fallback provider ${providerType} failed:`, error);
      }
    }

    return {
      success: false,
      errorMessage: 'All providers failed to create room',
      errorCode: 'ALL_PROVIDERS_FAILED',
    };
  }

  /**
   * Generate access token for a participant
   */
  async generateAccessToken(
    roomName: string,
    userId: string,
    displayName: string,
    isHost: boolean,
    providerType?: TelehealthProvider
  ): Promise<GenerateTokenResult> {
    if (!this.config || !this.initialized) {
      return { success: false, errorMessage: 'Video service not initialized' };
    }

    const provider = providerType
      ? this.providers.get(providerType)
      : this.getDefaultProvider();

    if (!provider) {
      return { success: false, errorMessage: 'No provider available' };
    }

    const request: GenerateTokenRequest = {
      roomName,
      identity: userId,
      displayName,
      isHost,
      expirationSeconds: 3600, // 1 hour
      grants: {
        canPublish: true,
        canSubscribe: true,
        canShareScreen: isHost,
        canRecord: isHost,
      },
    };

    return provider.generateToken(request);
  }

  /**
   * Create telehealth session record in database
   */
  async createTelehealthSession(
    organizationId: string,
    appointmentId: string,
    provider: TelehealthProvider,
    roomUrl: string,
    scheduledStartTime: Date,
    scheduledEndTime: Date
  ): Promise<string> {
    const session = await prisma.telehealthSession.create({
      data: {
        organizationId,
        appointmentId,
        provider,
        roomUrl,
        status: 'SCHEDULED',
        scheduledStartTime,
        scheduledEndTime,
        placeOfServiceCode: '02', // Telehealth place of service
        telehealthModifier: '95', // Synchronous telehealth modifier
      },
    });

    return session.id;
  }

  /**
   * Update appointment to mark it as telehealth
   */
  async markAppointmentAsTelehealth(appointmentId: string): Promise<void> {
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { isTelehealth: true },
    });
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let videoServiceInstance: VideoService | null = null;

/**
 * Get or create the video service singleton
 */
export function getVideoService(): VideoService {
  if (!videoServiceInstance) {
    videoServiceInstance = new VideoService();
  }
  return videoServiceInstance;
}

/**
 * Initialize the video service with configuration from environment
 */
export async function initializeVideoService(): Promise<VideoService> {
  const service = getVideoService();

  if (service.isReady()) {
    return service;
  }

  // Build configuration from environment variables
  const config: VideoServiceConfig = {
    defaultProvider: (process.env.DEFAULT_VIDEO_PROVIDER as TelehealthProvider) || TelehealthProvider.TWILIO,
    providers: {},
    enableFallback: process.env.VIDEO_ENABLE_FALLBACK === 'true',
    fallbackOrder: [TelehealthProvider.TWILIO, TelehealthProvider.ZOOM],
    baseUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://app.chiroflow.com',
  };

  // Configure Twilio if credentials are available
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_API_KEY_SID) {
    config.providers.twilio = {
      apiKey: process.env.TWILIO_API_KEY_SID,
      apiSecret: process.env.TWILIO_API_KEY_SECRET || '',
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      apiKeySid: process.env.TWILIO_API_KEY_SID,
      apiKeySecret: process.env.TWILIO_API_KEY_SECRET || '',
      webhookUrl: process.env.TWILIO_WEBHOOK_URL,
      webhookSecret: process.env.TWILIO_WEBHOOK_SECRET,
    };
  }

  // Configure Zoom if credentials are available
  if (process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET) {
    config.providers.zoom = {
      apiKey: process.env.ZOOM_CLIENT_ID,
      apiSecret: process.env.ZOOM_CLIENT_SECRET,
      clientId: process.env.ZOOM_CLIENT_ID,
      clientSecret: process.env.ZOOM_CLIENT_SECRET,
      sdkKey: process.env.ZOOM_SDK_KEY,
      sdkSecret: process.env.ZOOM_SDK_SECRET,
      verificationToken: process.env.ZOOM_VERIFICATION_TOKEN,
    };
  }

  await service.initialize(config);
  return service;
}

/**
 * Create room for a telehealth appointment
 *
 * Convenience function that initializes the service if needed.
 */
export async function createTelehealthRoom(
  appointmentId: string,
  scheduledStartTime: Date,
  scheduledEndTime: Date,
  preferredProvider?: TelehealthProvider
): Promise<CreateRoomResult> {
  const service = await initializeVideoService();
  return service.createRoomForAppointment(
    appointmentId,
    scheduledStartTime,
    scheduledEndTime,
    preferredProvider
  );
}
