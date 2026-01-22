import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import { DeviceType, DeviceConnectionStatus } from '@prisma/client';
import crypto from 'crypto';

// OAuth configuration for Apple Health
// Note: In production, these would be environment variables
const APPLE_HEALTH_CONFIG = {
  clientId: process.env.APPLE_HEALTH_CLIENT_ID || 'chiroflow-health',
  authorizationEndpoint: 'https://appleid.apple.com/auth/authorize',
  tokenEndpoint: 'https://appleid.apple.com/auth/token',
  scopes: [
    'health.activity',
    'health.sleep',
    'health.workout',
    'health.heart',
  ],
  redirectUri: process.env.APPLE_HEALTH_REDIRECT_URI || 'https://app.chiroflow.com/api/devices/apple-health/callback',
};

// OAuth2 configuration for Google Fit
const GOOGLE_FIT_CONFIG = {
  clientId: process.env.GOOGLE_FIT_CLIENT_ID || 'chiroflow-google-fit.apps.googleusercontent.com',
  clientSecret: process.env.GOOGLE_FIT_CLIENT_SECRET || '',
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revokeEndpoint: 'https://oauth2.googleapis.com/revoke',
  fitnessApiBase: 'https://www.googleapis.com/fitness/v1/users/me',
  scopes: [
    'https://www.googleapis.com/auth/fitness.activity.read',
    'https://www.googleapis.com/auth/fitness.sleep.read',
    'https://www.googleapis.com/auth/fitness.heart_rate.read',
    'https://www.googleapis.com/auth/fitness.body.read',
  ],
  redirectUri: process.env.GOOGLE_FIT_REDIRECT_URI || 'https://app.chiroflow.com/api/devices/google-fit/callback',
};

// Encryption key for storing tokens (in production, use a proper key management service)
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

// Helper to encrypt tokens
function encryptToken(token: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv);
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

// Helper to decrypt tokens
function decryptToken(encryptedToken: string): string {
  const [ivHex, encrypted] = encryptedToken.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Validation schemas
const deviceTypeSchema = z.enum(['APPLE_HEALTH', 'GOOGLE_FIT', 'FITBIT', 'WHOOP', 'POSTURE_SENSOR']);

// Apple Health data types mapping
const APPLE_HEALTH_DATA_TYPES = {
  activity: [
    'HKQuantityTypeIdentifierStepCount',
    'HKQuantityTypeIdentifierDistanceWalkingRunning',
    'HKQuantityTypeIdentifierActiveEnergyBurned',
    'HKQuantityTypeIdentifierAppleExerciseTime',
  ],
  sleep: [
    'HKCategoryTypeIdentifierSleepAnalysis',
  ],
  workout: [
    'HKWorkoutTypeIdentifier',
  ],
  heartRate: [
    'HKQuantityTypeIdentifierHeartRate',
    'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
    'HKQuantityTypeIdentifierRestingHeartRate',
  ],
};

// Google Fit data source types mapping
const GOOGLE_FIT_DATA_SOURCES = {
  activity: [
    'derived:com.google.step_count.delta:com.google.android.gms:estimated_steps',
    'derived:com.google.distance.delta:com.google.android.gms:merge_distance_delta',
    'derived:com.google.calories.expended:com.google.android.gms:merge_calories_expended',
    'derived:com.google.active_minutes:com.google.android.gms:merge_active_minutes',
  ],
  sleep: [
    'derived:com.google.sleep.segment:com.google.android.gms:merged',
  ],
  heartRate: [
    'derived:com.google.heart_rate.bpm:com.google.android.gms:merge_heart_rate_bpm',
    'derived:com.google.heart_minutes:com.google.android.gms:merge_heart_minutes',
  ],
};

// Google Fit sleep stage mapping
const GOOGLE_FIT_SLEEP_STAGES = {
  1: 'awake',    // Awake (during sleep)
  2: 'sleep',    // Sleep (generic)
  3: 'out_of_bed', // Out of bed
  4: 'light',    // Light sleep
  5: 'deep',     // Deep sleep
  6: 'rem',      // REM sleep
};

export const devicesRouter = router({
  // Get all device connections for a patient
  getConnections: protectedProcedure
    .input(z.object({
      patientId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const { patientId } = input;

      // Verify patient belongs to organization
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const connections = await ctx.prisma.deviceConnection.findMany({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
        },
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              activityData: true,
              sleepData: true,
              heartRateData: true,
              postureData: true,
            },
          },
        },
      });

      // Don't expose tokens in response
      return connections.map((conn) => ({
        ...conn,
        connectionToken: conn.connectionToken ? '***' : null,
        refreshToken: conn.refreshToken ? '***' : null,
      }));
    }),

  // Get a single device connection
  getConnection: protectedProcedure
    .input(z.object({
      connectionId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const connection = await ctx.prisma.deviceConnection.findFirst({
        where: {
          id: input.connectionId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          patient: {
            select: {
              id: true,
              demographics: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          _count: {
            select: {
              activityData: true,
              sleepData: true,
              heartRateData: true,
              postureData: true,
            },
          },
        },
      });

      if (!connection) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Device connection not found',
        });
      }

      return {
        ...connection,
        connectionToken: connection.connectionToken ? '***' : null,
        refreshToken: connection.refreshToken ? '***' : null,
      };
    }),

  // ============================================
  // Apple Health Integration
  // ============================================

  // Initiate Apple Health connection - generates authorization URL
  connectAppleHealth: protectedProcedure
    .input(z.object({
      patientId: z.string(),
      deviceName: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { patientId, deviceName } = input;

      // Verify patient belongs to organization
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Check for existing connection
      const existing = await ctx.prisma.deviceConnection.findFirst({
        where: {
          patientId,
          deviceType: DeviceType.APPLE_HEALTH,
        },
      });

      if (existing && existing.status === DeviceConnectionStatus.CONNECTED) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Apple Health is already connected for this patient',
        });
      }

      // Generate state token for OAuth flow
      const stateToken = crypto.randomBytes(32).toString('hex');

      // Create or update device connection in PENDING state
      const connection = existing
        ? await ctx.prisma.deviceConnection.update({
            where: { id: existing.id },
            data: {
              status: DeviceConnectionStatus.PENDING,
              deviceName: deviceName || 'Apple Health',
              connectionToken: encryptToken(stateToken), // Store state temporarily
              lastError: null,
              errorCount: 0,
            },
          })
        : await ctx.prisma.deviceConnection.create({
            data: {
              patientId,
              organizationId: ctx.user.organizationId,
              deviceType: DeviceType.APPLE_HEALTH,
              deviceName: deviceName || 'Apple Health',
              status: DeviceConnectionStatus.PENDING,
              connectionToken: encryptToken(stateToken),
              scopes: APPLE_HEALTH_CONFIG.scopes,
              syncFrequency: 60, // Sync every hour by default
            },
          });

      // Build authorization URL
      const authParams = new URLSearchParams({
        client_id: APPLE_HEALTH_CONFIG.clientId,
        redirect_uri: APPLE_HEALTH_CONFIG.redirectUri,
        response_type: 'code',
        scope: APPLE_HEALTH_CONFIG.scopes.join(' '),
        state: stateToken,
        response_mode: 'form_post',
      });

      const authorizationUrl = `${APPLE_HEALTH_CONFIG.authorizationEndpoint}?${authParams.toString()}`;

      await auditLog('CREATE', 'DeviceConnection', {
        entityId: connection.id,
        changes: {
          action: 'initiate_apple_health_connection',
          patientId,
          deviceType: 'APPLE_HEALTH',
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        connectionId: connection.id,
        authorizationUrl,
        scopes: APPLE_HEALTH_CONFIG.scopes,
        instructions: [
          'Open the authorization URL on the patient\'s Apple device',
          'Patient will sign in with their Apple ID',
          'Patient grants permission to share health data',
          'After authorization, data will sync automatically',
        ],
      };
    }),

  // Complete Apple Health OAuth flow - exchange code for tokens
  completeAppleHealthAuth: protectedProcedure
    .input(z.object({
      connectionId: z.string(),
      code: z.string(),
      state: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { connectionId, code, state } = input;

      const connection = await ctx.prisma.deviceConnection.findFirst({
        where: {
          id: connectionId,
          organizationId: ctx.user.organizationId,
          deviceType: DeviceType.APPLE_HEALTH,
        },
      });

      if (!connection) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Device connection not found',
        });
      }

      // Verify state token matches
      if (connection.connectionToken) {
        const storedState = decryptToken(connection.connectionToken);
        if (storedState !== state) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Invalid state token - possible CSRF attack',
          });
        }
      }

      // In production, exchange code for tokens via Apple's token endpoint
      // For now, simulate the token exchange
      const mockAccessToken = crypto.randomBytes(64).toString('hex');
      const mockRefreshToken = crypto.randomBytes(64).toString('hex');
      const tokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Update connection with tokens
      const updatedConnection = await ctx.prisma.deviceConnection.update({
        where: { id: connectionId },
        data: {
          status: DeviceConnectionStatus.CONNECTED,
          connectionToken: encryptToken(mockAccessToken),
          refreshToken: encryptToken(mockRefreshToken),
          tokenExpiresAt: tokenExpiry,
          lastSyncAt: null, // Will be set on first sync
        },
      });

      await auditLog('UPDATE', 'DeviceConnection', {
        entityId: connectionId,
        changes: {
          action: 'complete_apple_health_auth',
          status: 'CONNECTED',
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        connectionId: updatedConnection.id,
        status: updatedConnection.status,
        message: 'Apple Health connected successfully. Data will sync shortly.',
      };
    }),

  // Manual sync trigger for Apple Health
  syncAppleHealth: protectedProcedure
    .input(z.object({
      connectionId: z.string(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
      dataTypes: z.array(z.enum(['activity', 'sleep', 'workout', 'heartRate'])).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { connectionId, startDate, endDate, dataTypes } = input;

      const connection = await ctx.prisma.deviceConnection.findFirst({
        where: {
          id: connectionId,
          organizationId: ctx.user.organizationId,
          deviceType: DeviceType.APPLE_HEALTH,
        },
      });

      if (!connection) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Device connection not found',
        });
      }

      if (connection.status !== DeviceConnectionStatus.CONNECTED) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot sync - connection status is ${connection.status}`,
        });
      }

      // Check if token needs refresh
      if (connection.tokenExpiresAt && new Date() > connection.tokenExpiresAt) {
        // In production, refresh the token
        // For now, mark as expired
        await ctx.prisma.deviceConnection.update({
          where: { id: connectionId },
          data: {
            status: DeviceConnectionStatus.EXPIRED,
            lastError: 'Access token expired - reauthorization required',
            lastErrorAt: new Date(),
          },
        });

        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Access token expired. Please reconnect Apple Health.',
        });
      }

      // Default date range: last 7 days
      const syncStartDate = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const syncEndDate = endDate || new Date();
      const typesToSync = dataTypes || ['activity', 'sleep', 'workout', 'heartRate'];

      // In production, this would call the Apple HealthKit API
      // For now, simulate synced data
      const syncResults = {
        activity: 0,
        sleep: 0,
        workout: 0,
        heartRate: 0,
      };

      // Simulate activity data sync
      if (typesToSync.includes('activity')) {
        const days = Math.ceil((syncEndDate.getTime() - syncStartDate.getTime()) / (24 * 60 * 60 * 1000));

        for (let i = 0; i < days; i++) {
          const date = new Date(syncStartDate.getTime() + i * 24 * 60 * 60 * 1000);
          date.setHours(0, 0, 0, 0);

          // Check if data already exists for this date
          const existing = await ctx.prisma.activityData.findFirst({
            where: {
              patientId: connection.patientId,
              deviceConnectionId: connectionId,
              date,
            },
          });

          if (!existing) {
            // Simulate activity data from Apple Health
            const simulatedData = {
              steps: Math.floor(Math.random() * 10000) + 2000,
              distance: Math.floor(Math.random() * 8000) + 1000, // meters
              activeMinutes: Math.floor(Math.random() * 60) + 15,
              calories: Math.floor(Math.random() * 500) + 100,
              hourlySteps: generateHourlySteps(),
              workouts: generateWorkouts(),
            };

            await ctx.prisma.activityData.create({
              data: {
                patientId: connection.patientId,
                deviceConnectionId: connectionId,
                organizationId: ctx.user.organizationId,
                date,
                steps: simulatedData.steps,
                distance: simulatedData.distance,
                activeMinutes: simulatedData.activeMinutes,
                calories: simulatedData.calories,
                hourlySteps: simulatedData.hourlySteps,
                workouts: simulatedData.workouts,
                sourceDevice: 'Apple Watch',
              },
            });

            syncResults.activity++;
          }
        }
      }

      // Simulate sleep data sync
      if (typesToSync.includes('sleep')) {
        const days = Math.ceil((syncEndDate.getTime() - syncStartDate.getTime()) / (24 * 60 * 60 * 1000));

        for (let i = 0; i < days; i++) {
          const date = new Date(syncStartDate.getTime() + i * 24 * 60 * 60 * 1000);
          date.setHours(0, 0, 0, 0);

          const existing = await ctx.prisma.sleepData.findFirst({
            where: {
              patientId: connection.patientId,
              deviceConnectionId: connectionId,
              date,
            },
          });

          if (!existing) {
            const simulatedSleep = generateSleepData(date);

            await ctx.prisma.sleepData.create({
              data: {
                patientId: connection.patientId,
                deviceConnectionId: connectionId,
                organizationId: ctx.user.organizationId,
                date,
                ...simulatedSleep,
                sourceDevice: 'Apple Watch',
              },
            });

            syncResults.sleep++;
          }
        }
      }

      // Update last sync timestamp
      await ctx.prisma.deviceConnection.update({
        where: { id: connectionId },
        data: {
          lastSyncAt: new Date(),
          lastError: null,
          errorCount: 0,
        },
      });

      await auditLog('UPDATE', 'DeviceConnection', {
        entityId: connectionId,
        changes: {
          action: 'sync_apple_health',
          syncResults,
          dateRange: { start: syncStartDate, end: syncEndDate },
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        syncResults,
        dateRange: {
          start: syncStartDate,
          end: syncEndDate,
        },
        lastSyncAt: new Date(),
      };
    }),

  // Schedule background sync for Apple Health
  scheduleAppleHealthSync: protectedProcedure
    .input(z.object({
      connectionId: z.string(),
      frequency: z.number().min(15).max(1440), // 15 minutes to 24 hours
      enabled: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { connectionId, frequency, enabled } = input;

      const connection = await ctx.prisma.deviceConnection.findFirst({
        where: {
          id: connectionId,
          organizationId: ctx.user.organizationId,
          deviceType: DeviceType.APPLE_HEALTH,
        },
      });

      if (!connection) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Device connection not found',
        });
      }

      const updated = await ctx.prisma.deviceConnection.update({
        where: { id: connectionId },
        data: {
          syncFrequency: frequency,
          syncEnabled: enabled,
        },
      });

      await auditLog('UPDATE', 'DeviceConnection', {
        entityId: connectionId,
        changes: {
          action: 'schedule_sync',
          syncFrequency: frequency,
          syncEnabled: enabled,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        syncFrequency: updated.syncFrequency,
        syncEnabled: updated.syncEnabled,
      };
    }),

  // ============================================
  // Google Fit Integration
  // ============================================

  // Initiate Google Fit connection - generates OAuth2 authorization URL
  connectGoogleFit: protectedProcedure
    .input(z.object({
      patientId: z.string(),
      deviceName: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { patientId, deviceName } = input;

      // Verify patient belongs to organization
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Check for existing connection
      const existing = await ctx.prisma.deviceConnection.findFirst({
        where: {
          patientId,
          deviceType: DeviceType.GOOGLE_FIT,
        },
      });

      if (existing && existing.status === DeviceConnectionStatus.CONNECTED) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Google Fit is already connected for this patient',
        });
      }

      // Generate state token for OAuth2 flow (CSRF protection)
      const stateToken = crypto.randomBytes(32).toString('hex');
      // Include connection context in state for callback processing
      const statePayload = JSON.stringify({
        token: stateToken,
        patientId,
        organizationId: ctx.user.organizationId,
      });
      const encodedState = Buffer.from(statePayload).toString('base64url');

      // Create or update device connection in PENDING state
      const connection = existing
        ? await ctx.prisma.deviceConnection.update({
            where: { id: existing.id },
            data: {
              status: DeviceConnectionStatus.PENDING,
              deviceName: deviceName || 'Google Fit',
              connectionToken: encryptToken(stateToken), // Store state temporarily
              lastError: null,
              errorCount: 0,
            },
          })
        : await ctx.prisma.deviceConnection.create({
            data: {
              patientId,
              organizationId: ctx.user.organizationId,
              deviceType: DeviceType.GOOGLE_FIT,
              deviceName: deviceName || 'Google Fit',
              status: DeviceConnectionStatus.PENDING,
              connectionToken: encryptToken(stateToken),
              scopes: GOOGLE_FIT_CONFIG.scopes,
              syncFrequency: 60, // Sync every hour by default
            },
          });

      // Build OAuth2 authorization URL
      const authParams = new URLSearchParams({
        client_id: GOOGLE_FIT_CONFIG.clientId,
        redirect_uri: GOOGLE_FIT_CONFIG.redirectUri,
        response_type: 'code',
        scope: GOOGLE_FIT_CONFIG.scopes.join(' '),
        state: encodedState,
        access_type: 'offline', // Request refresh token
        prompt: 'consent', // Force consent to get refresh token
        include_granted_scopes: 'true',
      });

      const authorizationUrl = `${GOOGLE_FIT_CONFIG.authorizationEndpoint}?${authParams.toString()}`;

      await auditLog('CREATE', 'DeviceConnection', {
        entityId: connection.id,
        changes: {
          action: 'initiate_google_fit_connection',
          patientId,
          deviceType: 'GOOGLE_FIT',
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        connectionId: connection.id,
        authorizationUrl,
        scopes: GOOGLE_FIT_CONFIG.scopes,
        instructions: [
          'Open the authorization URL on the patient\'s Android device or computer',
          'Patient will sign in with their Google account',
          'Patient grants permission to share Google Fit data',
          'After authorization, data will sync automatically',
        ],
      };
    }),

  // Complete Google Fit OAuth2 flow - exchange code for tokens
  completeGoogleFitAuth: protectedProcedure
    .input(z.object({
      connectionId: z.string(),
      code: z.string(),
      state: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { connectionId, code, state } = input;

      const connection = await ctx.prisma.deviceConnection.findFirst({
        where: {
          id: connectionId,
          organizationId: ctx.user.organizationId,
          deviceType: DeviceType.GOOGLE_FIT,
        },
      });

      if (!connection) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Device connection not found',
        });
      }

      // Decode and verify state token
      try {
        const decodedState = JSON.parse(Buffer.from(state, 'base64url').toString());
        if (connection.connectionToken) {
          const storedState = decryptToken(connection.connectionToken);
          if (storedState !== decodedState.token) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Invalid state token - possible CSRF attack',
            });
          }
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid state format',
        });
      }

      // In production, exchange code for tokens via Google's token endpoint
      // POST to https://oauth2.googleapis.com/token with:
      // - code, client_id, client_secret, redirect_uri, grant_type=authorization_code
      // For now, simulate the token exchange
      const mockAccessToken = crypto.randomBytes(64).toString('hex');
      const mockRefreshToken = crypto.randomBytes(64).toString('hex');
      const tokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Update connection with tokens
      const updatedConnection = await ctx.prisma.deviceConnection.update({
        where: { id: connectionId },
        data: {
          status: DeviceConnectionStatus.CONNECTED,
          connectionToken: encryptToken(mockAccessToken),
          refreshToken: encryptToken(mockRefreshToken),
          tokenExpiresAt: tokenExpiry,
          lastSyncAt: null, // Will be set on first sync
        },
      });

      await auditLog('UPDATE', 'DeviceConnection', {
        entityId: connectionId,
        changes: {
          action: 'complete_google_fit_auth',
          status: 'CONNECTED',
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        connectionId: updatedConnection.id,
        status: updatedConnection.status,
        message: 'Google Fit connected successfully. Data will sync shortly.',
      };
    }),

  // Refresh Google Fit access token using refresh token
  refreshGoogleFitToken: protectedProcedure
    .input(z.object({
      connectionId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { connectionId } = input;

      const connection = await ctx.prisma.deviceConnection.findFirst({
        where: {
          id: connectionId,
          organizationId: ctx.user.organizationId,
          deviceType: DeviceType.GOOGLE_FIT,
        },
      });

      if (!connection) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Device connection not found',
        });
      }

      if (!connection.refreshToken) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No refresh token available. Please reconnect Google Fit.',
        });
      }

      // In production, call Google's token endpoint with:
      // - refresh_token, client_id, client_secret, grant_type=refresh_token
      // POST https://oauth2.googleapis.com/token
      // For now, simulate token refresh
      const newAccessToken = crypto.randomBytes(64).toString('hex');
      const newExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      const updated = await ctx.prisma.deviceConnection.update({
        where: { id: connectionId },
        data: {
          connectionToken: encryptToken(newAccessToken),
          tokenExpiresAt: newExpiry,
          status: DeviceConnectionStatus.CONNECTED,
          lastError: null,
          errorCount: 0,
        },
      });

      await auditLog('UPDATE', 'DeviceConnection', {
        entityId: connectionId,
        changes: {
          action: 'refresh_google_fit_token',
          tokenRefreshed: true,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        tokenExpiresAt: updated.tokenExpiresAt,
        status: updated.status,
      };
    }),

  // Manual sync trigger for Google Fit
  syncGoogleFit: protectedProcedure
    .input(z.object({
      connectionId: z.string(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
      dataTypes: z.array(z.enum(['activity', 'sleep', 'heartRate'])).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { connectionId, startDate, endDate, dataTypes } = input;

      const connection = await ctx.prisma.deviceConnection.findFirst({
        where: {
          id: connectionId,
          organizationId: ctx.user.organizationId,
          deviceType: DeviceType.GOOGLE_FIT,
        },
      });

      if (!connection) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Device connection not found',
        });
      }

      if (connection.status !== DeviceConnectionStatus.CONNECTED) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot sync - connection status is ${connection.status}`,
        });
      }

      // Check if token needs refresh
      if (connection.tokenExpiresAt && new Date() > connection.tokenExpiresAt) {
        if (connection.refreshToken) {
          // In production, automatically refresh the token
          // For now, mark as needing refresh
          await ctx.prisma.deviceConnection.update({
            where: { id: connectionId },
            data: {
              lastError: 'Access token expired - attempting refresh',
              lastErrorAt: new Date(),
            },
          });

          // Simulate automatic token refresh
          const newAccessToken = crypto.randomBytes(64).toString('hex');
          const newExpiry = new Date(Date.now() + 60 * 60 * 1000);

          await ctx.prisma.deviceConnection.update({
            where: { id: connectionId },
            data: {
              connectionToken: encryptToken(newAccessToken),
              tokenExpiresAt: newExpiry,
              lastError: null,
            },
          });
        } else {
          // No refresh token, mark as expired
          await ctx.prisma.deviceConnection.update({
            where: { id: connectionId },
            data: {
              status: DeviceConnectionStatus.EXPIRED,
              lastError: 'Access token expired - reauthorization required',
              lastErrorAt: new Date(),
            },
          });

          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Access token expired. Please reconnect Google Fit.',
          });
        }
      }

      // Default date range: last 7 days
      const syncStartDate = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const syncEndDate = endDate || new Date();
      const typesToSync = dataTypes || ['activity', 'sleep', 'heartRate'];

      // In production, this would call the Google Fitness REST API
      // https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate
      // For now, simulate synced data
      const syncResults = {
        activity: 0,
        sleep: 0,
        heartRate: 0,
      };

      // Simulate activity data sync from Google Fit
      if (typesToSync.includes('activity')) {
        const days = Math.ceil((syncEndDate.getTime() - syncStartDate.getTime()) / (24 * 60 * 60 * 1000));

        for (let i = 0; i < days; i++) {
          const date = new Date(syncStartDate.getTime() + i * 24 * 60 * 60 * 1000);
          date.setHours(0, 0, 0, 0);

          // Check if data already exists for this date
          const existing = await ctx.prisma.activityData.findFirst({
            where: {
              patientId: connection.patientId,
              deviceConnectionId: connectionId,
              date,
            },
          });

          if (!existing) {
            // Simulate activity data from Google Fit
            const simulatedData = {
              steps: Math.floor(Math.random() * 10000) + 2000,
              distance: Math.floor(Math.random() * 8000) + 1000, // meters
              activeMinutes: Math.floor(Math.random() * 60) + 15,
              calories: Math.floor(Math.random() * 500) + 100,
              hourlySteps: generateHourlySteps(),
              workouts: generateGoogleFitWorkouts(),
            };

            await ctx.prisma.activityData.create({
              data: {
                patientId: connection.patientId,
                deviceConnectionId: connectionId,
                organizationId: ctx.user.organizationId,
                date,
                steps: simulatedData.steps,
                distance: simulatedData.distance,
                activeMinutes: simulatedData.activeMinutes,
                calories: simulatedData.calories,
                hourlySteps: simulatedData.hourlySteps,
                workouts: simulatedData.workouts,
                sourceDevice: 'Google Fit',
              },
            });

            syncResults.activity++;
          }
        }
      }

      // Simulate sleep data sync from Google Fit
      if (typesToSync.includes('sleep')) {
        const days = Math.ceil((syncEndDate.getTime() - syncStartDate.getTime()) / (24 * 60 * 60 * 1000));

        for (let i = 0; i < days; i++) {
          const date = new Date(syncStartDate.getTime() + i * 24 * 60 * 60 * 1000);
          date.setHours(0, 0, 0, 0);

          const existing = await ctx.prisma.sleepData.findFirst({
            where: {
              patientId: connection.patientId,
              deviceConnectionId: connectionId,
              date,
            },
          });

          if (!existing) {
            const simulatedSleep = generateGoogleFitSleepData(date);

            await ctx.prisma.sleepData.create({
              data: {
                patientId: connection.patientId,
                deviceConnectionId: connectionId,
                organizationId: ctx.user.organizationId,
                date,
                ...simulatedSleep,
                sourceDevice: 'Google Fit',
              },
            });

            syncResults.sleep++;
          }
        }
      }

      // Simulate heart rate data sync from Google Fit
      if (typesToSync.includes('heartRate')) {
        // Get heart rate samples throughout the sync period
        const samplesPerDay = 24; // One per hour average
        const days = Math.ceil((syncEndDate.getTime() - syncStartDate.getTime()) / (24 * 60 * 60 * 1000));

        for (let d = 0; d < days; d++) {
          const dayStart = new Date(syncStartDate.getTime() + d * 24 * 60 * 60 * 1000);

          for (let h = 0; h < samplesPerDay; h++) {
            const timestamp = new Date(dayStart.getTime() + h * 60 * 60 * 1000);

            // Check if we already have data for this timestamp
            const existing = await ctx.prisma.heartRateData.findFirst({
              where: {
                patientId: connection.patientId,
                deviceConnectionId: connectionId,
                timestamp: {
                  gte: new Date(timestamp.getTime() - 30 * 60 * 1000), // Within 30 min
                  lte: new Date(timestamp.getTime() + 30 * 60 * 1000),
                },
              },
            });

            if (!existing) {
              // Simulate heart rate based on time of day
              const hour = timestamp.getHours();
              const isActiveHour = hour >= 8 && hour <= 20;
              const baseBpm = isActiveHour ? 75 : 60;
              const variance = isActiveHour ? 20 : 10;

              await ctx.prisma.heartRateData.create({
                data: {
                  patientId: connection.patientId,
                  deviceConnectionId: connectionId,
                  organizationId: ctx.user.organizationId,
                  timestamp,
                  bpm: baseBpm + Math.floor(Math.random() * variance),
                  type: isActiveHour ? 'CONTINUOUS' : 'RESTING',
                  hrv: Math.floor(Math.random() * 30) + 40, // 40-70ms
                  activityLevel: isActiveHour ? 'LIGHT' : 'SEDENTARY',
                  sourceDevice: 'Google Fit',
                },
              });

              syncResults.heartRate++;
            }
          }
        }
      }

      // Update last sync timestamp
      await ctx.prisma.deviceConnection.update({
        where: { id: connectionId },
        data: {
          lastSyncAt: new Date(),
          lastError: null,
          errorCount: 0,
        },
      });

      await auditLog('UPDATE', 'DeviceConnection', {
        entityId: connectionId,
        changes: {
          action: 'sync_google_fit',
          syncResults,
          dateRange: { start: syncStartDate, end: syncEndDate },
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        syncResults,
        dateRange: {
          start: syncStartDate,
          end: syncEndDate,
        },
        lastSyncAt: new Date(),
      };
    }),

  // Schedule background sync for Google Fit
  scheduleGoogleFitSync: protectedProcedure
    .input(z.object({
      connectionId: z.string(),
      frequency: z.number().min(15).max(1440), // 15 minutes to 24 hours
      enabled: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { connectionId, frequency, enabled } = input;

      const connection = await ctx.prisma.deviceConnection.findFirst({
        where: {
          id: connectionId,
          organizationId: ctx.user.organizationId,
          deviceType: DeviceType.GOOGLE_FIT,
        },
      });

      if (!connection) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Device connection not found',
        });
      }

      const updated = await ctx.prisma.deviceConnection.update({
        where: { id: connectionId },
        data: {
          syncFrequency: frequency,
          syncEnabled: enabled,
        },
      });

      await auditLog('UPDATE', 'DeviceConnection', {
        entityId: connectionId,
        changes: {
          action: 'schedule_google_fit_sync',
          syncFrequency: frequency,
          syncEnabled: enabled,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        syncFrequency: updated.syncFrequency,
        syncEnabled: updated.syncEnabled,
      };
    }),

  // Subscribe to real-time Google Fit data updates
  subscribeGoogleFitUpdates: protectedProcedure
    .input(z.object({
      connectionId: z.string(),
      dataTypes: z.array(z.enum(['activity', 'sleep', 'heartRate'])),
      webhookUrl: z.string().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { connectionId, dataTypes, webhookUrl } = input;

      const connection = await ctx.prisma.deviceConnection.findFirst({
        where: {
          id: connectionId,
          organizationId: ctx.user.organizationId,
          deviceType: DeviceType.GOOGLE_FIT,
        },
      });

      if (!connection) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Device connection not found',
        });
      }

      if (connection.status !== DeviceConnectionStatus.CONNECTED) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Device must be connected to subscribe to updates',
        });
      }

      // In production, this would set up Google Fit push notifications
      // Using the Google Fit REST API notification channels:
      // POST https://www.googleapis.com/fitness/v1/users/me/dataSources/{dataSourceId}/dataPointChanges/watch

      // Map data types to Google Fit data sources for subscription
      const subscriptionTargets = dataTypes.map(type => ({
        type,
        dataSource: GOOGLE_FIT_DATA_SOURCES[type]?.[0] || '',
      }));

      const effectiveWebhookUrl = webhookUrl || `https://app.chiroflow.com/api/devices/google-fit/webhook/${connectionId}`;

      // Store subscription info in scopes array (append subscription markers)
      const subscriptionScopes = dataTypes.map(dt => `subscription:${dt}`);
      const existingScopes = connection.scopes.filter(s => !s.startsWith('subscription:'));

      await ctx.prisma.deviceConnection.update({
        where: { id: connectionId },
        data: {
          scopes: [...existingScopes, ...subscriptionScopes],
        },
      });

      await auditLog('UPDATE', 'DeviceConnection', {
        entityId: connectionId,
        changes: {
          action: 'subscribe_google_fit_updates',
          dataTypes,
          webhookUrl: effectiveWebhookUrl,
          subscriptionTargets,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        subscribed: dataTypes,
        webhookUrl: effectiveWebhookUrl,
        message: 'Subscribed to real-time Google Fit updates',
      };
    }),

  // Unsubscribe from Google Fit real-time updates
  unsubscribeGoogleFitUpdates: protectedProcedure
    .input(z.object({
      connectionId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { connectionId } = input;

      const connection = await ctx.prisma.deviceConnection.findFirst({
        where: {
          id: connectionId,
          organizationId: ctx.user.organizationId,
          deviceType: DeviceType.GOOGLE_FIT,
        },
      });

      if (!connection) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Device connection not found',
        });
      }

      // In production, cancel the watch channels with Google Fit API
      // DELETE https://www.googleapis.com/fitness/v1/users/me/dataSources/{dataSourceId}/dataPointChanges/watch

      // Remove subscription markers from scopes
      const updatedScopes = connection.scopes.filter(s => !s.startsWith('subscription:'));

      await ctx.prisma.deviceConnection.update({
        where: { id: connectionId },
        data: {
          scopes: updatedScopes,
        },
      });

      await auditLog('UPDATE', 'DeviceConnection', {
        entityId: connectionId,
        changes: {
          action: 'unsubscribe_google_fit_updates',
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        message: 'Unsubscribed from Google Fit real-time updates',
      };
    }),

  // Get heart rate data for a patient
  getHeartRateData: protectedProcedure
    .input(z.object({
      patientId: z.string(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
      type: z.enum(['RESTING', 'ACTIVE', 'WORKOUT', 'CONTINUOUS', 'SPOT_CHECK']).optional(),
      limit: z.number().min(1).max(500).default(100),
    }))
    .query(async ({ ctx, input }) => {
      const { patientId, startDate, endDate, type, limit } = input;

      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const where: Record<string, unknown> = {
        patientId,
        organizationId: ctx.user.organizationId,
      };

      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) (where.timestamp as Record<string, Date>).gte = startDate;
        if (endDate) (where.timestamp as Record<string, Date>).lte = endDate;
      }

      if (type) {
        where.type = type;
      }

      const data = await ctx.prisma.heartRateData.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        include: {
          deviceConnection: {
            select: {
              deviceType: true,
              deviceName: true,
            },
          },
        },
      });

      // Calculate statistics
      const bpmValues = data.map(d => d.bpm);
      const hrvValues = data.filter(d => d.hrv !== null).map(d => d.hrv as number);

      return {
        data,
        summary: {
          count: data.length,
          averageBpm: bpmValues.length > 0 ? Math.round(bpmValues.reduce((a, b) => a + b, 0) / bpmValues.length) : 0,
          minBpm: bpmValues.length > 0 ? Math.min(...bpmValues) : 0,
          maxBpm: bpmValues.length > 0 ? Math.max(...bpmValues) : 0,
          averageHrv: hrvValues.length > 0 ? Math.round(hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length) : null,
        },
      };
    }),

  // Get activity data for a patient
  getActivityData: protectedProcedure
    .input(z.object({
      patientId: z.string(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
      limit: z.number().min(1).max(100).default(30),
    }))
    .query(async ({ ctx, input }) => {
      const { patientId, startDate, endDate, limit } = input;

      // Verify patient belongs to organization
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const where: Record<string, unknown> = {
        patientId,
        organizationId: ctx.user.organizationId,
      };

      if (startDate || endDate) {
        where.date = {};
        if (startDate) (where.date as Record<string, Date>).gte = startDate;
        if (endDate) (where.date as Record<string, Date>).lte = endDate;
      }

      const data = await ctx.prisma.activityData.findMany({
        where,
        orderBy: { date: 'desc' },
        take: limit,
        include: {
          deviceConnection: {
            select: {
              deviceType: true,
              deviceName: true,
            },
          },
        },
      });

      // Calculate averages
      const totalSteps = data.reduce((sum, d) => sum + (d.steps || 0), 0);
      const totalActiveMinutes = data.reduce((sum, d) => sum + (d.activeMinutes || 0), 0);
      const totalCalories = data.reduce((sum, d) => sum + (d.calories || 0), 0);

      return {
        data,
        summary: {
          totalDays: data.length,
          averageSteps: data.length > 0 ? Math.round(totalSteps / data.length) : 0,
          averageActiveMinutes: data.length > 0 ? Math.round(totalActiveMinutes / data.length) : 0,
          averageCalories: data.length > 0 ? Math.round(totalCalories / data.length) : 0,
          totalSteps,
          totalActiveMinutes,
          totalCalories,
        },
      };
    }),

  // Get sleep data for a patient
  getSleepData: protectedProcedure
    .input(z.object({
      patientId: z.string(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
      limit: z.number().min(1).max(100).default(30),
    }))
    .query(async ({ ctx, input }) => {
      const { patientId, startDate, endDate, limit } = input;

      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const where: Record<string, unknown> = {
        patientId,
        organizationId: ctx.user.organizationId,
      };

      if (startDate || endDate) {
        where.date = {};
        if (startDate) (where.date as Record<string, Date>).gte = startDate;
        if (endDate) (where.date as Record<string, Date>).lte = endDate;
      }

      const data = await ctx.prisma.sleepData.findMany({
        where,
        orderBy: { date: 'desc' },
        take: limit,
        include: {
          deviceConnection: {
            select: {
              deviceType: true,
              deviceName: true,
            },
          },
        },
      });

      // Calculate averages
      const validData = data.filter((d) => d.duration !== null);
      const totalDuration = validData.reduce((sum, d) => sum + (d.duration || 0), 0);
      const totalQuality = validData.reduce((sum, d) => sum + (d.quality || 0), 0);
      const totalDeep = validData.reduce((sum, d) => sum + (d.deepMinutes || 0), 0);
      const totalRem = validData.reduce((sum, d) => sum + (d.remMinutes || 0), 0);

      return {
        data,
        summary: {
          totalNights: validData.length,
          averageDuration: validData.length > 0 ? Math.round(totalDuration / validData.length) : 0,
          averageQuality: validData.length > 0 ? Math.round(totalQuality / validData.length) : 0,
          averageDeepSleep: validData.length > 0 ? Math.round(totalDeep / validData.length) : 0,
          averageRemSleep: validData.length > 0 ? Math.round(totalRem / validData.length) : 0,
        },
      };
    }),

  // Disconnect a device
  disconnect: protectedProcedure
    .input(z.object({
      connectionId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { connectionId } = input;

      const connection = await ctx.prisma.deviceConnection.findFirst({
        where: {
          id: connectionId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!connection) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Device connection not found',
        });
      }

      // In production, revoke tokens with the provider
      // For Apple Health, call the revoke endpoint

      const updated = await ctx.prisma.deviceConnection.update({
        where: { id: connectionId },
        data: {
          status: DeviceConnectionStatus.DISCONNECTED,
          connectionToken: null,
          refreshToken: null,
          tokenExpiresAt: null,
          syncEnabled: false,
        },
      });

      await auditLog('UPDATE', 'DeviceConnection', {
        entityId: connectionId,
        changes: {
          action: 'disconnect',
          deviceType: connection.deviceType,
          previousStatus: connection.status,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        status: updated.status,
      };
    }),

  // Get supported device types
  getSupportedDevices: protectedProcedure
    .query(() => {
      return [
        {
          type: DeviceType.APPLE_HEALTH,
          name: 'Apple Health',
          description: 'Sync data from Apple Health on iPhone and Apple Watch',
          supportedData: ['activity', 'sleep', 'workout', 'heartRate'],
          connectionType: 'oauth',
          icon: 'apple',
        },
        {
          type: DeviceType.GOOGLE_FIT,
          name: 'Google Fit',
          description: 'Sync data from Google Fit on Android devices',
          supportedData: ['activity', 'sleep', 'heartRate'],
          connectionType: 'oauth',
          icon: 'google',
        },
        {
          type: DeviceType.FITBIT,
          name: 'Fitbit',
          description: 'Sync data from Fitbit devices and app',
          supportedData: ['activity', 'sleep', 'heartRate'],
          connectionType: 'oauth',
          icon: 'fitbit',
        },
        {
          type: DeviceType.WHOOP,
          name: 'WHOOP',
          description: 'Sync strain, recovery, and sleep data from WHOOP',
          supportedData: ['activity', 'sleep', 'heartRate'],
          connectionType: 'oauth',
          icon: 'whoop',
        },
        {
          type: DeviceType.POSTURE_SENSOR,
          name: 'Posture Sensor',
          description: 'Connect posture monitoring devices like Upright Go',
          supportedData: ['posture'],
          connectionType: 'api',
          icon: 'posture',
        },
      ];
    }),

  // ============================================
  // Posture Sensor Integration
  // ============================================

  // Connect Upright Go device
  connectUprightGo: protectedProcedure
    .input(z.object({
      patientId: z.string(),
      apiKey: z.string(), // User's Upright Go API key
      deviceName: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { patientId, apiKey, deviceName } = input;

      // Verify patient belongs to organization
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Check for existing connection
      const existing = await ctx.prisma.deviceConnection.findFirst({
        where: {
          patientId,
          deviceType: DeviceType.POSTURE_SENSOR,
          deviceName: { contains: 'Upright' },
        },
      });

      if (existing && existing.status === DeviceConnectionStatus.CONNECTED) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Upright Go is already connected for this patient',
        });
      }

      // In production, validate API key with Upright API
      // For now, simulate validation
      const isValidKey = apiKey.length >= 20;
      if (!isValidKey) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid Upright Go API key format',
        });
      }

      // Create or update device connection
      const connection = existing
        ? await ctx.prisma.deviceConnection.update({
            where: { id: existing.id },
            data: {
              status: DeviceConnectionStatus.CONNECTED,
              deviceName: deviceName || 'Upright Go',
              connectionToken: encryptToken(apiKey),
              lastError: null,
              errorCount: 0,
              scopes: ['posture.realtime', 'posture.history', 'posture.alerts'],
              syncFrequency: 5, // Sync every 5 minutes
            },
          })
        : await ctx.prisma.deviceConnection.create({
            data: {
              patientId,
              organizationId: ctx.user.organizationId,
              deviceType: DeviceType.POSTURE_SENSOR,
              deviceName: deviceName || 'Upright Go',
              status: DeviceConnectionStatus.CONNECTED,
              connectionToken: encryptToken(apiKey),
              scopes: ['posture.realtime', 'posture.history', 'posture.alerts'],
              syncFrequency: 5, // Sync every 5 minutes
            },
          });

      await auditLog('CREATE', 'DeviceConnection', {
        entityId: connection.id,
        changes: {
          action: 'connect_upright_go',
          patientId,
          deviceType: 'POSTURE_SENSOR',
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        connectionId: connection.id,
        status: connection.status,
        deviceName: connection.deviceName,
        message: 'Upright Go connected successfully. Posture data will sync automatically.',
        features: POSTURE_SENSOR_TYPES.UPRIGHT_GO.features,
      };
    }),

  // Connect generic posture sensor via API
  connectPostureSensor: protectedProcedure
    .input(z.object({
      patientId: z.string(),
      apiEndpoint: z.string().url(),
      apiKey: z.string(),
      deviceName: z.string(),
      manufacturer: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { patientId, apiEndpoint, apiKey, deviceName, manufacturer } = input;

      // Verify patient belongs to organization
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Create device connection
      // Store manufacturer and endpoint info in the deviceName and scopes
      const connection = await ctx.prisma.deviceConnection.create({
        data: {
          patientId,
          organizationId: ctx.user.organizationId,
          deviceType: DeviceType.POSTURE_SENSOR,
          deviceName: `${deviceName} (${manufacturer || 'Generic'})`,
          deviceModel: manufacturer || 'Generic',
          status: DeviceConnectionStatus.CONNECTED,
          connectionToken: encryptToken(JSON.stringify({ apiEndpoint, apiKey })),
          scopes: ['posture.realtime', 'posture.alerts', `endpoint:${apiEndpoint}`],
          syncFrequency: 5,
        },
      });

      await auditLog('CREATE', 'DeviceConnection', {
        entityId: connection.id,
        changes: {
          action: 'connect_posture_sensor',
          patientId,
          deviceType: 'POSTURE_SENSOR',
          manufacturer,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        connectionId: connection.id,
        status: connection.status,
        deviceName: connection.deviceName,
        message: 'Posture sensor connected successfully.',
        features: POSTURE_SENSOR_TYPES.GENERIC_API.features,
      };
    }),

  // Record real-time posture data
  recordPostureData: protectedProcedure
    .input(z.object({
      connectionId: z.string(),
      score: z.number().min(0).max(100),
      isAlert: z.boolean().default(false),
      alertType: z.enum(['slouch', 'hunched', 'head_forward', 'tilted', 'prolonged_sitting']).optional(),
      angle: z.number().optional(),
      position: z.enum(['sitting', 'standing', 'walking', 'lying', 'unknown']).optional(),
      sessionId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { connectionId, score, isAlert, alertType, angle, position, sessionId } = input;

      const connection = await ctx.prisma.deviceConnection.findFirst({
        where: {
          id: connectionId,
          organizationId: ctx.user.organizationId,
          deviceType: DeviceType.POSTURE_SENSOR,
        },
      });

      if (!connection) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Posture sensor connection not found',
        });
      }

      if (connection.status !== DeviceConnectionStatus.CONNECTED) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Posture sensor is not connected',
        });
      }

      const postureData = await ctx.prisma.postureData.create({
        data: {
          patientId: connection.patientId,
          deviceConnectionId: connectionId,
          organizationId: ctx.user.organizationId,
          timestamp: new Date(),
          score,
          isAlert,
          alertType: isAlert ? alertType : null,
          angle,
          position,
          sessionId: sessionId || crypto.randomBytes(8).toString('hex'),
          sourceDevice: connection.deviceName,
        },
      });

      // Update last sync time
      await ctx.prisma.deviceConnection.update({
        where: { id: connectionId },
        data: { lastSyncAt: new Date() },
      });

      return {
        id: postureData.id,
        timestamp: postureData.timestamp,
        score: postureData.score,
        isAlert: postureData.isAlert,
      };
    }),

  // Sync posture data from sensor API
  syncPostureData: protectedProcedure
    .input(z.object({
      connectionId: z.string(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { connectionId, startDate, endDate } = input;

      const connection = await ctx.prisma.deviceConnection.findFirst({
        where: {
          id: connectionId,
          organizationId: ctx.user.organizationId,
          deviceType: DeviceType.POSTURE_SENSOR,
        },
      });

      if (!connection) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Posture sensor connection not found',
        });
      }

      if (connection.status !== DeviceConnectionStatus.CONNECTED) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Posture sensor is not connected',
        });
      }

      // Default date range: last 24 hours
      const syncStartDate = startDate || new Date(Date.now() - 24 * 60 * 60 * 1000);
      const syncEndDate = endDate || new Date();

      // In production, this would call the posture sensor API
      // For now, simulate synced data
      const syncResults = {
        dataPoints: 0,
        alerts: 0,
        sessions: 0,
      };

      // Simulate posture data from the sensor
      const hoursToSync = Math.ceil((syncEndDate.getTime() - syncStartDate.getTime()) / (60 * 60 * 1000));
      const sessionId = crypto.randomBytes(8).toString('hex');
      let currentScore = 75;

      for (let h = 0; h < hoursToSync; h++) {
        // Generate 6 readings per hour (every 10 minutes during active hours)
        const hourTimestamp = new Date(syncStartDate.getTime() + h * 60 * 60 * 1000);
        const hour = hourTimestamp.getHours();

        // Only generate data during typical active hours (8am - 10pm)
        if (hour >= 8 && hour <= 22) {
          for (let m = 0; m < 6; m++) {
            const timestamp = new Date(hourTimestamp.getTime() + m * 10 * 60 * 1000);

            // Check for existing data point
            const existing = await ctx.prisma.postureData.findFirst({
              where: {
                patientId: connection.patientId,
                deviceConnectionId: connectionId,
                timestamp: {
                  gte: new Date(timestamp.getTime() - 5 * 60 * 1000),
                  lte: new Date(timestamp.getTime() + 5 * 60 * 1000),
                },
              },
            });

            if (!existing) {
              // Simulate posture score variation
              const scoreChange = Math.floor(Math.random() * 20) - 10;
              currentScore = Math.max(20, Math.min(100, currentScore + scoreChange));

              const isAlert = currentScore < 40;
              const alertType = isAlert
                ? (['slouch', 'hunched', 'head_forward'] as const)[Math.floor(Math.random() * 3)]
                : null;

              await ctx.prisma.postureData.create({
                data: {
                  patientId: connection.patientId,
                  deviceConnectionId: connectionId,
                  organizationId: ctx.user.organizationId,
                  timestamp,
                  score: currentScore,
                  isAlert,
                  alertType,
                  angle: Math.floor(Math.random() * 30) - 15, // -15 to +15 degrees
                  position: Math.random() > 0.3 ? 'sitting' : 'standing',
                  sessionId,
                  sourceDevice: connection.deviceName,
                  duration: 10 * 60, // 10 minutes
                },
              });

              syncResults.dataPoints++;
              if (isAlert) syncResults.alerts++;
            }
          }
        }
      }

      syncResults.sessions = 1; // Simulated single session

      // Update last sync timestamp
      await ctx.prisma.deviceConnection.update({
        where: { id: connectionId },
        data: {
          lastSyncAt: new Date(),
          lastError: null,
          errorCount: 0,
        },
      });

      await auditLog('UPDATE', 'DeviceConnection', {
        entityId: connectionId,
        changes: {
          action: 'sync_posture_data',
          syncResults,
          dateRange: { start: syncStartDate, end: syncEndDate },
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        success: true,
        syncResults,
        dateRange: {
          start: syncStartDate,
          end: syncEndDate,
        },
        lastSyncAt: new Date(),
      };
    }),

  // Get posture data for a patient
  getPostureData: protectedProcedure
    .input(z.object({
      patientId: z.string(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
      alertsOnly: z.boolean().default(false),
      limit: z.number().min(1).max(500).default(100),
    }))
    .query(async ({ ctx, input }) => {
      const { patientId, startDate, endDate, alertsOnly, limit } = input;

      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const where: Record<string, unknown> = {
        patientId,
        organizationId: ctx.user.organizationId,
      };

      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) (where.timestamp as Record<string, Date>).gte = startDate;
        if (endDate) (where.timestamp as Record<string, Date>).lte = endDate;
      }

      if (alertsOnly) {
        where.isAlert = true;
      }

      const data = await ctx.prisma.postureData.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        include: {
          deviceConnection: {
            select: {
              deviceType: true,
              deviceName: true,
            },
          },
        },
      });

      // Calculate statistics
      const scores = data.map(d => d.score).filter((s): s is number => s !== null);
      const alerts = data.filter(d => d.isAlert);

      return {
        data,
        summary: {
          count: data.length,
          averageScore: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
          minScore: scores.length > 0 ? Math.min(...scores) : 0,
          maxScore: scores.length > 0 ? Math.max(...scores) : 0,
          alertCount: alerts.length,
          alertTypes: alerts.reduce((acc, a) => {
            const type = a.alertType || 'unknown';
            acc[type] = (acc[type] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
        },
      };
    }),

  // Get slouch alert history
  getSlouchAlertHistory: protectedProcedure
    .input(z.object({
      patientId: z.string(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
      limit: z.number().min(1).max(200).default(50),
    }))
    .query(async ({ ctx, input }) => {
      const { patientId, startDate, endDate, limit } = input;

      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const where: Record<string, unknown> = {
        patientId,
        organizationId: ctx.user.organizationId,
        isAlert: true,
      };

      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) (where.timestamp as Record<string, Date>).gte = startDate;
        if (endDate) (where.timestamp as Record<string, Date>).lte = endDate;
      }

      const alerts = await ctx.prisma.postureData.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        include: {
          deviceConnection: {
            select: {
              deviceName: true,
            },
          },
        },
      });

      // Group alerts by day
      const alertsByDay: Record<string, number> = {};
      const alertsByType: Record<string, number> = {};
      const alertsByHour: Record<number, number> = {};

      alerts.forEach(alert => {
        // By day
        const day = alert.timestamp.toISOString().split('T')[0];
        alertsByDay[day] = (alertsByDay[day] || 0) + 1;

        // By type
        const type = alert.alertType || 'unknown';
        alertsByType[type] = (alertsByType[type] || 0) + 1;

        // By hour
        const hour = alert.timestamp.getHours();
        alertsByHour[hour] = (alertsByHour[hour] || 0) + 1;
      });

      return {
        alerts,
        summary: {
          totalAlerts: alerts.length,
          alertsByDay,
          alertsByType,
          alertsByHour,
          mostCommonType: Object.entries(alertsByType).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
          peakHour: Object.entries(alertsByHour).sort((a, b) => b[1] - a[1])[0]?.[0]
            ? parseInt(Object.entries(alertsByHour).sort((a, b) => b[1] - a[1])[0][0])
            : null,
        },
      };
    }),

  // Get daily posture summary
  getDailyPostureSummary: protectedProcedure
    .input(z.object({
      patientId: z.string(),
      date: z.date().optional(),
      days: z.number().min(1).max(90).default(7),
    }))
    .query(async ({ ctx, input }) => {
      const { patientId, date, days } = input;

      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const endDate = date || new Date();
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - days);

      const data = await ctx.prisma.postureData.findMany({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
          timestamp: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { timestamp: 'asc' },
      });

      // Group by day and calculate summaries
      const dailySummaries: Array<{
        date: string;
        averageScore: number;
        minScore: number;
        maxScore: number;
        alertCount: number;
        dataPoints: number;
        totalMinutesTracked: number;
        goodPostureMinutes: number;
        poorPostureMinutes: number;
      }> = [];

      const dataByDay: Record<string, typeof data> = {};
      data.forEach(d => {
        const day = d.timestamp.toISOString().split('T')[0];
        if (!dataByDay[day]) dataByDay[day] = [];
        dataByDay[day].push(d);
      });

      Object.entries(dataByDay).forEach(([day, dayData]) => {
        const scores = dayData.map(d => d.score).filter((s): s is number => s !== null);
        const alerts = dayData.filter(d => d.isAlert);
        const durations = dayData.map(d => d.duration).filter((d): d is number => d !== null);
        const totalMinutes = durations.reduce((a, b) => a + b, 0) / 60;

        // Good posture = score >= 70
        const goodPostureData = dayData.filter(d => d.score !== null && d.score >= 70);
        const goodPostureMinutes = goodPostureData
          .map(d => d.duration)
          .filter((d): d is number => d !== null)
          .reduce((a, b) => a + b, 0) / 60;

        dailySummaries.push({
          date: day,
          averageScore: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
          minScore: scores.length > 0 ? Math.min(...scores) : 0,
          maxScore: scores.length > 0 ? Math.max(...scores) : 0,
          alertCount: alerts.length,
          dataPoints: dayData.length,
          totalMinutesTracked: Math.round(totalMinutes),
          goodPostureMinutes: Math.round(goodPostureMinutes),
          poorPostureMinutes: Math.round(totalMinutes - goodPostureMinutes),
        });
      });

      // Calculate overall trends
      const allScores = data.map(d => d.score).filter((s): s is number => s !== null);
      const firstHalfScores = allScores.slice(0, Math.floor(allScores.length / 2));
      const secondHalfScores = allScores.slice(Math.floor(allScores.length / 2));

      const firstHalfAvg = firstHalfScores.length > 0
        ? firstHalfScores.reduce((a, b) => a + b, 0) / firstHalfScores.length
        : 0;
      const secondHalfAvg = secondHalfScores.length > 0
        ? secondHalfScores.reduce((a, b) => a + b, 0) / secondHalfScores.length
        : 0;

      const trend = secondHalfAvg > firstHalfAvg ? 'improving' :
                    secondHalfAvg < firstHalfAvg ? 'declining' : 'stable';

      return {
        dailySummaries,
        overallSummary: {
          totalDays: dailySummaries.length,
          averageScore: allScores.length > 0
            ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
            : 0,
          totalAlerts: data.filter(d => d.isAlert).length,
          trend,
          trendChange: Math.round(secondHalfAvg - firstHalfAvg),
        },
      };
    }),

  // Correlate posture data with patient symptoms
  correlatePostureWithSymptoms: protectedProcedure
    .input(z.object({
      patientId: z.string(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { patientId, startDate, endDate } = input;

      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const queryEndDate = endDate || new Date();
      const queryStartDate = startDate || new Date(queryEndDate.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Get posture data
      const postureData = await ctx.prisma.postureData.findMany({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
          timestamp: {
            gte: queryStartDate,
            lte: queryEndDate,
          },
        },
        orderBy: { timestamp: 'asc' },
      });

      // Get patient's encounters and SOAP notes for symptoms
      const encounters = await ctx.prisma.encounter.findMany({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
          encounterDate: {
            gte: queryStartDate,
            lte: queryEndDate,
          },
        },
        include: {
          soapNote: {
            select: {
              subjective: true,
              createdAt: true,
            },
          },
          diagnoses: {
            select: {
              icd10Code: true,
              description: true,
            },
          },
        },
        orderBy: { encounterDate: 'asc' },
      });

      // Analyze correlations
      const correlations: Array<{
        date: string;
        averagePostureScore: number;
        alertCount: number;
        symptomReport: string | null;
        diagnoses: Array<{ code: string; description: string | null }>;
        correlation: 'poor_posture_pain' | 'good_posture_comfort' | 'no_data' | 'unclear';
      }> = [];

      // Group posture data by day
      const postureByDay: Record<string, typeof postureData> = {};
      postureData.forEach(d => {
        const day = d.timestamp.toISOString().split('T')[0];
        if (!postureByDay[day]) postureByDay[day] = [];
        postureByDay[day].push(d);
      });

      // Match with encounters
      encounters.forEach(encounter => {
        const encounterDay = encounter.encounterDate.toISOString().split('T')[0];
        const dayBeforeEncounter = new Date(encounter.encounterDate);
        dayBeforeEncounter.setDate(dayBeforeEncounter.getDate() - 1);
        const prevDay = dayBeforeEncounter.toISOString().split('T')[0];

        // Get posture data from day before encounter (causation timeframe)
        const relevantPosture = postureByDay[prevDay] || postureByDay[encounterDay] || [];
        const scores = relevantPosture.map(d => d.score).filter((s): s is number => s !== null);
        const avgScore = scores.length > 0
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : null;
        const alertCount = relevantPosture.filter(d => d.isAlert).length;

        // Extract symptoms from SOAP note
        const symptoms = encounter.soapNote?.subjective || null;

        // Determine correlation
        let correlation: typeof correlations[0]['correlation'] = 'no_data';
        if (avgScore !== null && symptoms) {
          const hasPainKeywords = /pain|ache|sore|stiff|discomfort|tight/i.test(symptoms);
          if (avgScore < 50 && hasPainKeywords) {
            correlation = 'poor_posture_pain';
          } else if (avgScore >= 70 && !hasPainKeywords) {
            correlation = 'good_posture_comfort';
          } else {
            correlation = 'unclear';
          }
        }

        correlations.push({
          date: encounterDay,
          averagePostureScore: avgScore || 0,
          alertCount,
          symptomReport: symptoms,
          diagnoses: encounter.diagnoses.map(d => ({ code: d.icd10Code, description: d.description })),
          correlation,
        });
      });

      // Calculate insights
      const poorPosturePainCount = correlations.filter(c => c.correlation === 'poor_posture_pain').length;
      const goodPostureComfortCount = correlations.filter(c => c.correlation === 'good_posture_comfort').length;
      const totalWithData = correlations.filter(c => c.correlation !== 'no_data').length;

      return {
        correlations,
        insights: {
          totalEncounters: encounters.length,
          correlationsFound: totalWithData,
          poorPosturePainCorrelation: poorPosturePainCount,
          goodPostureComfortCorrelation: goodPostureComfortCount,
          correlationStrength: totalWithData > 0
            ? Math.round(((poorPosturePainCount + goodPostureComfortCount) / totalWithData) * 100)
            : 0,
          recommendation: poorPosturePainCount > goodPostureComfortCount
            ? 'Patient symptoms appear correlated with poor posture. Consider emphasizing posture improvement in treatment plan.'
            : totalWithData > 0
            ? 'Posture-symptom correlation is moderate. Continue monitoring.'
            : 'Insufficient data to determine correlation. Encourage patient to wear posture sensor consistently.',
        },
      };
    }),

  // Check for poor posture trends and create provider alerts
  checkPostureTrends: protectedProcedure
    .input(z.object({
      patientId: z.string(),
      thresholdScore: z.number().min(0).max(100).default(50),
      thresholdAlerts: z.number().min(1).default(10),
      daysToAnalyze: z.number().min(1).max(30).default(7),
    }))
    .mutation(async ({ ctx, input }) => {
      const { patientId, thresholdScore, thresholdAlerts, daysToAnalyze } = input;

      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          demographics: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysToAnalyze);

      const postureData = await ctx.prisma.postureData.findMany({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
          timestamp: {
            gte: startDate,
          },
        },
      });

      if (postureData.length === 0) {
        return {
          alertTriggered: false,
          reason: 'No posture data available for analysis',
          metrics: null,
        };
      }

      // Calculate metrics
      const scores = postureData.map(d => d.score).filter((s): s is number => s !== null);
      const avgScore = scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0;
      const alertCount = postureData.filter(d => d.isAlert).length;
      const poorPosturePercentage = scores.filter(s => s < thresholdScore).length / scores.length * 100;

      const shouldAlert = avgScore < thresholdScore || alertCount >= thresholdAlerts;

      const metrics = {
        averageScore: avgScore,
        totalAlerts: alertCount,
        dataPoints: postureData.length,
        poorPosturePercentage: Math.round(poorPosturePercentage),
        daysAnalyzed: daysToAnalyze,
      };

      if (shouldAlert) {
        // In production, this would create a notification/alert for the provider
        // For now, we'll return the alert information

        await auditLog('CREATE', 'PostureAlert', {
          entityId: patientId,
          changes: {
            action: 'posture_trend_alert',
            patientName: `${patient.demographics?.firstName} ${patient.demographics?.lastName}`,
            metrics,
            thresholds: { score: thresholdScore, alerts: thresholdAlerts },
          },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });

        return {
          alertTriggered: true,
          reason: avgScore < thresholdScore
            ? `Average posture score (${avgScore}) is below threshold (${thresholdScore})`
            : `Alert count (${alertCount}) exceeds threshold (${thresholdAlerts})`,
          metrics,
          patientName: `${patient.demographics?.firstName} ${patient.demographics?.lastName}`,
          recommendation: 'Schedule follow-up to address posture concerns. Consider adjusting treatment plan.',
        };
      }

      return {
        alertTriggered: false,
        reason: 'Posture metrics are within acceptable range',
        metrics,
      };
    }),

  // Get supported posture sensor types
  getSupportedPostureSensors: protectedProcedure
    .query(() => {
      return [
        {
          type: 'UPRIGHT_GO',
          name: 'Upright Go',
          manufacturer: 'Upright',
          description: 'Wearable posture trainer that attaches to your back',
          connectionType: 'api',
          features: ['realTimePosture', 'slouchAlerts', 'dailySummary', 'trainingPrograms'],
          setupInstructions: [
            'Install the Upright app on your phone',
            'Create an Upright account and connect your device',
            'Go to Settings > API Access in the Upright app',
            'Generate an API key and enter it here',
          ],
        },
        {
          type: 'GENERIC_API',
          name: 'Generic Posture Sensor',
          manufacturer: 'Various',
          description: 'Connect any posture sensor that provides an API',
          connectionType: 'api',
          features: ['realTimePosture', 'slouchAlerts'],
          setupInstructions: [
            'Obtain the API endpoint URL from your sensor manufacturer',
            'Generate or obtain an API key for authentication',
            'Enter the endpoint and key to connect',
          ],
        },
      ];
    }),

  // ============================================
  // Activity Correlation Analysis (US-244)
  // ============================================

  // Main correlation analysis - correlates activity data with patient symptoms and outcomes
  analyzeCorrelation: protectedProcedure
    .input(z.object({
      patientId: z.string(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
      analysisTypes: z.array(z.enum(['activityPain', 'sleepPain', 'activityRecovery', 'all'])).default(['all']),
    }))
    .query(async ({ ctx, input }) => {
      const { patientId, startDate, endDate, analysisTypes } = input;

      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          demographics: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const queryEndDate = endDate || new Date();
      const queryStartDate = startDate || new Date(queryEndDate.getTime() - 90 * 24 * 60 * 60 * 1000); // 90 days default

      // Fetch all relevant data
      const [activityData, sleepData, encounters] = await Promise.all([
        ctx.prisma.activityData.findMany({
          where: {
            patientId,
            organizationId: ctx.user.organizationId,
            date: {
              gte: queryStartDate,
              lte: queryEndDate,
            },
          },
          orderBy: { date: 'asc' },
        }),
        ctx.prisma.sleepData.findMany({
          where: {
            patientId,
            organizationId: ctx.user.organizationId,
            date: {
              gte: queryStartDate,
              lte: queryEndDate,
            },
          },
          orderBy: { date: 'asc' },
        }),
        ctx.prisma.encounter.findMany({
          where: {
            patientId,
            organizationId: ctx.user.organizationId,
            encounterDate: {
              gte: queryStartDate,
              lte: queryEndDate,
            },
          },
          include: {
            soapNote: {
              select: {
                subjective: true,
                objective: true,
                assessment: true,
              },
            },
            diagnoses: {
              select: {
                icd10Code: true,
                description: true,
              },
            },
          },
          orderBy: { encounterDate: 'asc' },
        }),
      ]);

      const runAll = analysisTypes.includes('all');
      const results: {
        activityPainCorrelation?: ReturnType<typeof analyzeActivityPainCorrelation>;
        sleepPainCorrelation?: ReturnType<typeof analyzeSleepPainCorrelation>;
        activityRecoveryCorrelation?: ReturnType<typeof analyzeActivityRecoveryCorrelation>;
        providerInsights: Array<{
          type: string;
          severity: 'info' | 'warning' | 'critical';
          message: string;
          recommendation: string;
          data?: Record<string, unknown>;
        }>;
        patientRecommendations: Array<{
          category: string;
          recommendation: string;
          priority: 'low' | 'medium' | 'high';
          reasoning: string;
        }>;
        trendData: {
          activityTrend: Array<{ date: string; steps: number | null; activeMinutes: number | null; painLevel: number | null }>;
          sleepTrend: Array<{ date: string; duration: number | null; quality: number | null; painNextDay: number | null }>;
          recoveryTrend: Array<{ date: string; encounterDate: string | null; activityChange: number | null; outcome: string | null }>;
        };
      } = {
        providerInsights: [],
        patientRecommendations: [],
        trendData: {
          activityTrend: [],
          sleepTrend: [],
          recoveryTrend: [],
        },
      };

      // Extract pain levels from SOAP notes
      const painDataByDate = extractPainDataFromEncounters(encounters);

      // Activity vs Pain correlation
      if (runAll || analysisTypes.includes('activityPain')) {
        results.activityPainCorrelation = analyzeActivityPainCorrelation(activityData, painDataByDate, encounters);

        // Add provider insights
        if (results.activityPainCorrelation.correlationStrength > 60) {
          results.providerInsights.push({
            type: 'activityPain',
            severity: results.activityPainCorrelation.correlationStrength > 80 ? 'critical' : 'warning',
            message: `Strong correlation found between activity patterns and pain flares (${results.activityPainCorrelation.correlationStrength}% confidence)`,
            recommendation: results.activityPainCorrelation.primaryPattern === 'overexertion'
              ? 'Patient may benefit from activity pacing guidance. Consider reducing high-intensity days.'
              : results.activityPainCorrelation.primaryPattern === 'sedentary'
              ? 'Patient shows pain increase with low activity. Encourage gentle movement on sedentary days.'
              : 'Monitor activity patterns for additional data.',
            data: { pattern: results.activityPainCorrelation.primaryPattern },
          });
        }

        // Build trend data
        results.trendData.activityTrend = buildActivityTrendData(activityData, painDataByDate);
      }

      // Sleep vs Pain correlation
      if (runAll || analysisTypes.includes('sleepPain')) {
        results.sleepPainCorrelation = analyzeSleepPainCorrelation(sleepData, painDataByDate, encounters);

        if (results.sleepPainCorrelation.correlationStrength > 50) {
          results.providerInsights.push({
            type: 'sleepPain',
            severity: results.sleepPainCorrelation.correlationStrength > 70 ? 'warning' : 'info',
            message: `Sleep quality impacts next-day pain levels (${results.sleepPainCorrelation.correlationStrength}% correlation)`,
            recommendation: 'Consider sleep hygiene counseling. Address any sleep disorders that may be affecting recovery.',
            data: {
              avgQualityOnPainDays: results.sleepPainCorrelation.avgSleepQualityBeforePain,
              avgQualityOnGoodDays: results.sleepPainCorrelation.avgSleepQualityBeforeNoPain,
            },
          });
        }

        // Build sleep trend data
        results.trendData.sleepTrend = buildSleepTrendData(sleepData, painDataByDate);
      }

      // Activity vs Recovery correlation
      if (runAll || analysisTypes.includes('activityRecovery')) {
        results.activityRecoveryCorrelation = analyzeActivityRecoveryCorrelation(activityData, encounters);

        if (results.activityRecoveryCorrelation.optimalActivityRange) {
          results.providerInsights.push({
            type: 'activityRecovery',
            severity: 'info',
            message: `Optimal activity range identified: ${results.activityRecoveryCorrelation.optimalActivityRange.minSteps}-${results.activityRecoveryCorrelation.optimalActivityRange.maxSteps} steps/day`,
            recommendation: 'Set activity goals within this range for optimal recovery outcomes.',
            data: results.activityRecoveryCorrelation.optimalActivityRange,
          });
        }

        // Build recovery trend data
        results.trendData.recoveryTrend = buildRecoveryTrendData(activityData, encounters);
      }

      // Generate patient recommendations
      results.patientRecommendations = generatePatientRecommendations(
        results.activityPainCorrelation,
        results.sleepPainCorrelation,
        results.activityRecoveryCorrelation
      );

      await auditLog('VIEW', 'ActivityCorrelation', {
        entityId: patientId,
        changes: {
          action: 'analyze_correlation',
          analysisTypes,
          dateRange: { start: queryStartDate, end: queryEndDate },
          insightsGenerated: results.providerInsights.length,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        patientId,
        patientName: `${patient.demographics?.firstName} ${patient.demographics?.lastName}`,
        analysisDateRange: {
          start: queryStartDate,
          end: queryEndDate,
        },
        dataAvailable: {
          activityDays: activityData.length,
          sleepDays: sleepData.length,
          encounters: encounters.length,
        },
        ...results,
      };
    }),

  // Get activity patterns before pain flares
  getActivityPatternsBeforePain: protectedProcedure
    .input(z.object({
      patientId: z.string(),
      daysBeforeFlare: z.number().min(1).max(7).default(3),
      lookbackDays: z.number().min(7).max(180).default(90),
    }))
    .query(async ({ ctx, input }) => {
      const { patientId, daysBeforeFlare, lookbackDays } = input;

      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

      // Get activity data and encounters
      const [activityData, encounters] = await Promise.all([
        ctx.prisma.activityData.findMany({
          where: {
            patientId,
            organizationId: ctx.user.organizationId,
            date: { gte: startDate, lte: endDate },
          },
          orderBy: { date: 'asc' },
        }),
        ctx.prisma.encounter.findMany({
          where: {
            patientId,
            organizationId: ctx.user.organizationId,
            encounterDate: { gte: startDate, lte: endDate },
          },
          include: {
            soapNote: {
              select: { subjective: true },
            },
          },
          orderBy: { encounterDate: 'asc' },
        }),
      ]);

      // Identify pain flare days (encounters with pain keywords)
      const painKeywords = /pain|ache|sore|stiff|discomfort|flare|worse|severe|sharp|burning|throbbing/i;
      const painFlares = encounters.filter(e =>
        e.soapNote?.subjective && painKeywords.test(e.soapNote.subjective)
      );

      // Analyze activity patterns before each flare
      const patterns: Array<{
        flareDate: string;
        painDescription: string;
        activityBefore: Array<{
          daysBeforeFlare: number;
          date: string;
          steps: number | null;
          activeMinutes: number | null;
          calories: number | null;
        }>;
        pattern: 'overexertion' | 'sedentary' | 'inconsistent' | 'normal';
        avgSteps: number;
        avgActiveMinutes: number;
      }> = [];

      const activityByDate = new Map(
        activityData.map(a => [a.date.toISOString().split('T')[0], a])
      );

      // Calculate baseline activity
      const allSteps = activityData.map(a => a.steps).filter((s): s is number => s !== null);
      const baselineSteps = allSteps.length > 0
        ? allSteps.reduce((a, b) => a + b, 0) / allSteps.length
        : 0;
      const baselineStdDev = calculateStdDev(allSteps);

      painFlares.forEach(flare => {
        const flareDate = flare.encounterDate;
        const activityBefore: typeof patterns[0]['activityBefore'] = [];
        let totalSteps = 0;
        let totalActiveMinutes = 0;
        let count = 0;

        for (let i = 1; i <= daysBeforeFlare; i++) {
          const checkDate = new Date(flareDate);
          checkDate.setDate(checkDate.getDate() - i);
          const dateStr = checkDate.toISOString().split('T')[0];
          const activity = activityByDate.get(dateStr);

          activityBefore.push({
            daysBeforeFlare: i,
            date: dateStr,
            steps: activity?.steps ?? null,
            activeMinutes: activity?.activeMinutes ?? null,
            calories: activity?.calories ?? null,
          });

          if (activity?.steps) {
            totalSteps += activity.steps;
            count++;
          }
          if (activity?.activeMinutes) {
            totalActiveMinutes += activity.activeMinutes;
          }
        }

        const avgSteps = count > 0 ? Math.round(totalSteps / count) : 0;
        const avgActiveMinutes = count > 0 ? Math.round(totalActiveMinutes / count) : 0;

        // Determine pattern
        let pattern: typeof patterns[0]['pattern'] = 'normal';
        if (avgSteps > baselineSteps + baselineStdDev * 1.5) {
          pattern = 'overexertion';
        } else if (avgSteps < baselineSteps - baselineStdDev) {
          pattern = 'sedentary';
        } else if (baselineStdDev > baselineSteps * 0.3) {
          pattern = 'inconsistent';
        }

        patterns.push({
          flareDate: flareDate.toISOString().split('T')[0],
          painDescription: flare.soapNote?.subjective?.substring(0, 200) || 'Pain reported',
          activityBefore,
          pattern,
          avgSteps,
          avgActiveMinutes,
        });
      });

      // Summarize patterns
      const patternCounts = patterns.reduce((acc, p) => {
        acc[p.pattern] = (acc[p.pattern] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const dominantPattern = Object.entries(patternCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'insufficient_data';

      return {
        totalPainFlares: painFlares.length,
        patterns,
        summary: {
          dominantPattern,
          patternBreakdown: patternCounts,
          baselineSteps: Math.round(baselineSteps),
          recommendation: dominantPattern === 'overexertion'
            ? 'Pain flares frequently follow high-activity days. Consider activity pacing and recovery days.'
            : dominantPattern === 'sedentary'
            ? 'Pain flares often occur after low-activity periods. Gentle, consistent movement may help.'
            : dominantPattern === 'inconsistent'
            ? 'Activity levels are highly variable. Aim for more consistent daily movement.'
            : 'No clear activity-pain pattern identified. Continue monitoring.',
        },
      };
    }),

  // Get sleep quality vs pain correlation details
  getSleepPainCorrelation: protectedProcedure
    .input(z.object({
      patientId: z.string(),
      lookbackDays: z.number().min(7).max(180).default(60),
    }))
    .query(async ({ ctx, input }) => {
      const { patientId, lookbackDays } = input;

      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

      const [sleepData, encounters] = await Promise.all([
        ctx.prisma.sleepData.findMany({
          where: {
            patientId,
            organizationId: ctx.user.organizationId,
            date: { gte: startDate, lte: endDate },
          },
          orderBy: { date: 'asc' },
        }),
        ctx.prisma.encounter.findMany({
          where: {
            patientId,
            organizationId: ctx.user.organizationId,
            encounterDate: { gte: startDate, lte: endDate },
          },
          include: {
            soapNote: {
              select: { subjective: true },
            },
          },
          orderBy: { encounterDate: 'asc' },
        }),
      ]);

      // Build pain data map
      const painDataByDate = extractPainDataFromEncounters(encounters);

      // Analyze sleep before pain days vs good days
      const sleepByDate = new Map(
        sleepData.map(s => [s.date.toISOString().split('T')[0], s])
      );

      const sleepBeforePainDays: Array<{
        sleepDate: string;
        painDate: string;
        quality: number | null;
        duration: number | null;
        deepMinutes: number | null;
        painLevel: number;
      }> = [];

      const sleepBeforeGoodDays: Array<{
        sleepDate: string;
        quality: number | null;
        duration: number | null;
        deepMinutes: number | null;
      }> = [];

      // For each day with data, check if next day had pain
      sleepData.forEach(sleep => {
        const sleepDateStr = sleep.date.toISOString().split('T')[0];
        const nextDay = new Date(sleep.date);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayStr = nextDay.toISOString().split('T')[0];

        const painData = painDataByDate.get(nextDayStr);
        if (painData && painData.level >= 5) {
          sleepBeforePainDays.push({
            sleepDate: sleepDateStr,
            painDate: nextDayStr,
            quality: sleep.quality,
            duration: sleep.duration,
            deepMinutes: sleep.deepMinutes,
            painLevel: painData.level,
          });
        } else if (!painData || painData.level < 3) {
          sleepBeforeGoodDays.push({
            sleepDate: sleepDateStr,
            quality: sleep.quality,
            duration: sleep.duration,
            deepMinutes: sleep.deepMinutes,
          });
        }
      });

      // Calculate averages
      const avgQualityBeforePain = calculateAverage(sleepBeforePainDays.map(s => s.quality).filter((q): q is number => q !== null));
      const avgQualityBeforeGood = calculateAverage(sleepBeforeGoodDays.map(s => s.quality).filter((q): q is number => q !== null));
      const avgDurationBeforePain = calculateAverage(sleepBeforePainDays.map(s => s.duration).filter((d): d is number => d !== null));
      const avgDurationBeforeGood = calculateAverage(sleepBeforeGoodDays.map(s => s.duration).filter((d): d is number => d !== null));
      const avgDeepBeforePain = calculateAverage(sleepBeforePainDays.map(s => s.deepMinutes).filter((d): d is number => d !== null));
      const avgDeepBeforeGood = calculateAverage(sleepBeforeGoodDays.map(s => s.deepMinutes).filter((d): d is number => d !== null));

      // Calculate correlation strength
      const qualityDiff = avgQualityBeforeGood - avgQualityBeforePain;
      const correlationStrength = Math.min(100, Math.abs(qualityDiff) * 2);

      return {
        dataPoints: {
          sleepDays: sleepData.length,
          painDays: sleepBeforePainDays.length,
          goodDays: sleepBeforeGoodDays.length,
        },
        sleepBeforePainDays,
        sleepBeforeGoodDays: sleepBeforeGoodDays.slice(0, 10), // Limit for response size
        comparison: {
          avgQualityBeforePain: Math.round(avgQualityBeforePain),
          avgQualityBeforeGood: Math.round(avgQualityBeforeGood),
          avgDurationBeforePain: Math.round(avgDurationBeforePain),
          avgDurationBeforeGood: Math.round(avgDurationBeforeGood),
          avgDeepMinutesBeforePain: Math.round(avgDeepBeforePain),
          avgDeepMinutesBeforeGood: Math.round(avgDeepBeforeGood),
        },
        correlationStrength: Math.round(correlationStrength),
        insights: {
          qualityImpact: qualityDiff > 10
            ? 'Poor sleep quality strongly associated with next-day pain'
            : qualityDiff > 5
            ? 'Moderate sleep-pain relationship detected'
            : 'Sleep quality impact on pain is minimal',
          recommendation: avgQualityBeforePain < 60
            ? 'Focus on improving sleep quality. Consider sleep hygiene assessment and possible sleep study referral.'
            : avgDurationBeforePain < 360 // Less than 6 hours
            ? 'Sleep duration may be insufficient. Recommend 7-8 hours minimum.'
            : avgDeepBeforePain < 60
            ? 'Deep sleep duration is low. May benefit from sleep optimization strategies.'
            : 'Sleep patterns appear adequate. Continue monitoring.',
        },
      };
    }),

  // Get activity level vs recovery correlation
  getActivityRecoveryCorrelation: protectedProcedure
    .input(z.object({
      patientId: z.string(),
      lookbackDays: z.number().min(30).max(365).default(90),
    }))
    .query(async ({ ctx, input }) => {
      const { patientId, lookbackDays } = input;

      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

      const [activityData, encounters] = await Promise.all([
        ctx.prisma.activityData.findMany({
          where: {
            patientId,
            organizationId: ctx.user.organizationId,
            date: { gte: startDate, lte: endDate },
          },
          orderBy: { date: 'asc' },
        }),
        ctx.prisma.encounter.findMany({
          where: {
            patientId,
            organizationId: ctx.user.organizationId,
            encounterDate: { gte: startDate, lte: endDate },
          },
          include: {
            soapNote: {
              select: { subjective: true, objective: true, assessment: true },
            },
          },
          orderBy: { encounterDate: 'asc' },
        }),
      ]);

      // Track recovery progress between encounters
      const recoveryPeriods: Array<{
        startDate: string;
        endDate: string;
        daysBetween: number;
        avgSteps: number;
        avgActiveMinutes: number;
        startAssessment: string;
        endAssessment: string;
        outcome: 'improved' | 'stable' | 'worsened' | 'unknown';
      }> = [];

      for (let i = 1; i < encounters.length; i++) {
        const prevEncounter = encounters[i - 1];
        const currEncounter = encounters[i];

        const periodStart = prevEncounter.encounterDate;
        const periodEnd = currEncounter.encounterDate;
        const daysBetween = Math.round((periodEnd.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000));

        // Get activity data for this period
        const periodActivity = activityData.filter(a =>
          a.date >= periodStart && a.date <= periodEnd
        );

        const steps = periodActivity.map(a => a.steps).filter((s): s is number => s !== null);
        const activeMinutes = periodActivity.map(a => a.activeMinutes).filter((m): m is number => m !== null);

        // Determine outcome based on SOAP notes
        const startAssessment = prevEncounter.soapNote?.assessment || '';
        const endAssessment = currEncounter.soapNote?.assessment || '';
        const outcome = determineRecoveryOutcome(startAssessment, endAssessment, currEncounter.soapNote?.subjective || '');

        recoveryPeriods.push({
          startDate: periodStart.toISOString().split('T')[0],
          endDate: periodEnd.toISOString().split('T')[0],
          daysBetween,
          avgSteps: steps.length > 0 ? Math.round(steps.reduce((a, b) => a + b, 0) / steps.length) : 0,
          avgActiveMinutes: activeMinutes.length > 0 ? Math.round(activeMinutes.reduce((a, b) => a + b, 0) / activeMinutes.length) : 0,
          startAssessment: startAssessment.substring(0, 100),
          endAssessment: endAssessment.substring(0, 100),
          outcome,
        });
      }

      // Find optimal activity range for recovery
      const improvedPeriods = recoveryPeriods.filter(p => p.outcome === 'improved');
      const worsenedPeriods = recoveryPeriods.filter(p => p.outcome === 'worsened');

      const optimalRange = improvedPeriods.length >= 3 ? {
        minSteps: Math.round(Math.min(...improvedPeriods.map(p => p.avgSteps)) * 0.9),
        maxSteps: Math.round(Math.max(...improvedPeriods.map(p => p.avgSteps)) * 1.1),
        avgActiveMinutes: Math.round(calculateAverage(improvedPeriods.map(p => p.avgActiveMinutes))),
      } : null;

      // Activity levels to avoid
      const riskRange = worsenedPeriods.length >= 2 ? {
        avgSteps: Math.round(calculateAverage(worsenedPeriods.map(p => p.avgSteps))),
        avgActiveMinutes: Math.round(calculateAverage(worsenedPeriods.map(p => p.avgActiveMinutes))),
      } : null;

      return {
        totalPeriods: recoveryPeriods.length,
        recoveryPeriods,
        outcomes: {
          improved: improvedPeriods.length,
          stable: recoveryPeriods.filter(p => p.outcome === 'stable').length,
          worsened: worsenedPeriods.length,
          unknown: recoveryPeriods.filter(p => p.outcome === 'unknown').length,
        },
        optimalRange,
        riskRange,
        insights: {
          recoveryRate: recoveryPeriods.length > 0
            ? Math.round((improvedPeriods.length / recoveryPeriods.length) * 100)
            : 0,
          recommendation: optimalRange
            ? `Optimal recovery occurs with ${optimalRange.minSteps}-${optimalRange.maxSteps} steps/day and ~${optimalRange.avgActiveMinutes} active minutes.`
            : riskRange
            ? `Activity levels around ${riskRange.avgSteps} steps/day may hinder recovery. Adjust activity levels.`
            : 'Insufficient data to determine optimal activity range. Continue monitoring.',
        },
      };
    }),

  // Get trend visualization data for charts
  getCorrelationTrends: protectedProcedure
    .input(z.object({
      patientId: z.string(),
      days: z.number().min(7).max(180).default(30),
      granularity: z.enum(['daily', 'weekly']).default('daily'),
    }))
    .query(async ({ ctx, input }) => {
      const { patientId, days, granularity } = input;

      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

      const [activityData, sleepData, encounters] = await Promise.all([
        ctx.prisma.activityData.findMany({
          where: {
            patientId,
            organizationId: ctx.user.organizationId,
            date: { gte: startDate, lte: endDate },
          },
          orderBy: { date: 'asc' },
        }),
        ctx.prisma.sleepData.findMany({
          where: {
            patientId,
            organizationId: ctx.user.organizationId,
            date: { gte: startDate, lte: endDate },
          },
          orderBy: { date: 'asc' },
        }),
        ctx.prisma.encounter.findMany({
          where: {
            patientId,
            organizationId: ctx.user.organizationId,
            encounterDate: { gte: startDate, lte: endDate },
          },
          include: {
            soapNote: {
              select: { subjective: true },
            },
          },
          orderBy: { encounterDate: 'asc' },
        }),
      ]);

      const painDataByDate = extractPainDataFromEncounters(encounters);

      if (granularity === 'daily') {
        return {
          granularity: 'daily',
          activityTrend: activityData.map(a => ({
            date: a.date.toISOString().split('T')[0],
            steps: a.steps,
            activeMinutes: a.activeMinutes,
            calories: a.calories,
          })),
          sleepTrend: sleepData.map(s => ({
            date: s.date.toISOString().split('T')[0],
            duration: s.duration,
            quality: s.quality,
            deepMinutes: s.deepMinutes,
          })),
          painTrend: Array.from(painDataByDate.entries()).map(([date, data]) => ({
            date,
            level: data.level,
            hasEncounter: true,
          })),
          correlationMarkers: encounters.map(e => ({
            date: e.encounterDate.toISOString().split('T')[0],
            type: 'encounter',
            label: e.chiefComplaint || 'Visit',
          })),
        };
      } else {
        // Weekly aggregation
        const weeklyActivity: Record<string, { steps: number[]; activeMinutes: number[]; calories: number[] }> = {};
        const weeklySleep: Record<string, { duration: number[]; quality: number[]; deepMinutes: number[] }> = {};
        const weeklyPain: Record<string, number[]> = {};

        activityData.forEach(a => {
          const weekStart = getWeekStart(a.date);
          if (!weeklyActivity[weekStart]) {
            weeklyActivity[weekStart] = { steps: [], activeMinutes: [], calories: [] };
          }
          if (a.steps) weeklyActivity[weekStart].steps.push(a.steps);
          if (a.activeMinutes) weeklyActivity[weekStart].activeMinutes.push(a.activeMinutes);
          if (a.calories) weeklyActivity[weekStart].calories.push(a.calories);
        });

        sleepData.forEach(s => {
          const weekStart = getWeekStart(s.date);
          if (!weeklySleep[weekStart]) {
            weeklySleep[weekStart] = { duration: [], quality: [], deepMinutes: [] };
          }
          if (s.duration) weeklySleep[weekStart].duration.push(s.duration);
          if (s.quality) weeklySleep[weekStart].quality.push(s.quality);
          if (s.deepMinutes) weeklySleep[weekStart].deepMinutes.push(s.deepMinutes);
        });

        painDataByDate.forEach((data, date) => {
          const weekStart = getWeekStart(new Date(date));
          if (!weeklyPain[weekStart]) {
            weeklyPain[weekStart] = [];
          }
          weeklyPain[weekStart].push(data.level);
        });

        return {
          granularity: 'weekly',
          activityTrend: Object.entries(weeklyActivity).map(([week, data]) => ({
            weekStart: week,
            avgSteps: Math.round(calculateAverage(data.steps)),
            avgActiveMinutes: Math.round(calculateAverage(data.activeMinutes)),
            avgCalories: Math.round(calculateAverage(data.calories)),
            dataPoints: data.steps.length,
          })),
          sleepTrend: Object.entries(weeklySleep).map(([week, data]) => ({
            weekStart: week,
            avgDuration: Math.round(calculateAverage(data.duration)),
            avgQuality: Math.round(calculateAverage(data.quality)),
            avgDeepMinutes: Math.round(calculateAverage(data.deepMinutes)),
            dataPoints: data.duration.length,
          })),
          painTrend: Object.entries(weeklyPain).map(([week, levels]) => ({
            weekStart: week,
            avgLevel: Math.round(calculateAverage(levels) * 10) / 10,
            encounters: levels.length,
          })),
        };
      }
    }),

  // ============================================
  // Activity Goals and Alerts (US-245)
  // ============================================

  // Set a daily activity goal for a patient
  setGoal: protectedProcedure
    .input(z.object({
      patientId: z.string(),
      goalType: z.enum(['STEPS', 'ACTIVE_MINUTES', 'SLEEP_DURATION', 'CALORIES', 'DISTANCE']),
      targetValue: z.number().positive(),
      unit: z.string().optional(),
      alertOnAchieve: z.boolean().optional().default(true),
      alertOnDecrease: z.boolean().optional().default(true),
      decreaseThreshold: z.number().min(10).max(90).optional().default(30),
      notes: z.string().optional(),
      startDate: z.date().optional(),
      endDate: z.date().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const {
        patientId,
        goalType,
        targetValue,
        unit,
        alertOnAchieve,
        alertOnDecrease,
        decreaseThreshold,
        notes,
        startDate,
        endDate,
      } = input;

      // Verify patient belongs to organization
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Determine default unit based on goal type
      const defaultUnits: Record<string, string> = {
        STEPS: 'steps',
        ACTIVE_MINUTES: 'minutes',
        SLEEP_DURATION: 'hours',
        CALORIES: 'calories',
        DISTANCE: 'meters',
      };

      const goalUnit = unit || defaultUnits[goalType] || 'units';

      // Upsert goal (one per type per patient)
      const goal = await ctx.prisma.activityGoal.upsert({
        where: {
          patientId_goalType: {
            patientId,
            goalType,
          },
        },
        create: {
          patientId,
          goalType,
          targetValue,
          unit: goalUnit,
          alertOnAchieve: alertOnAchieve ?? true,
          alertOnDecrease: alertOnDecrease ?? true,
          decreaseThreshold: decreaseThreshold ?? 30,
          notes,
          startDate: startDate || new Date(),
          endDate,
          organizationId: ctx.user.organizationId,
          createdById: ctx.user.id,
        },
        update: {
          targetValue,
          unit: goalUnit,
          alertOnAchieve: alertOnAchieve ?? true,
          alertOnDecrease: alertOnDecrease ?? true,
          decreaseThreshold: decreaseThreshold ?? 30,
          notes,
          startDate: startDate || undefined,
          endDate,
          isActive: true,
        },
      });

      await auditLog('CREATE', 'ActivityGoal', {
        entityId: goal.id,
        changes: {
          goalType,
          targetValue,
          patientId,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return goal;
    }),

  // Get all goals for a patient
  getGoals: protectedProcedure
    .input(z.object({
      patientId: z.string(),
      activeOnly: z.boolean().optional().default(true),
    }))
    .query(async ({ ctx, input }) => {
      const { patientId, activeOnly } = input;

      // Verify patient belongs to organization
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      const goals = await ctx.prisma.activityGoal.findMany({
        where: {
          patientId,
          organizationId: ctx.user.organizationId,
          ...(activeOnly ? { isActive: true } : {}),
        },
        include: {
          createdBy: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return goals;
    }),

  // Update a goal
  updateGoal: protectedProcedure
    .input(z.object({
      goalId: z.string(),
      targetValue: z.number().positive().optional(),
      alertOnAchieve: z.boolean().optional(),
      alertOnDecrease: z.boolean().optional(),
      decreaseThreshold: z.number().min(10).max(90).optional(),
      isActive: z.boolean().optional(),
      notes: z.string().optional(),
      endDate: z.date().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { goalId, ...updates } = input;

      const existingGoal = await ctx.prisma.activityGoal.findFirst({
        where: {
          id: goalId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existingGoal) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Goal not found',
        });
      }

      const updatedGoal = await ctx.prisma.activityGoal.update({
        where: { id: goalId },
        data: updates,
      });

      await auditLog('UPDATE', 'ActivityGoal', {
        entityId: goalId,
        changes: updates,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updatedGoal;
    }),

  // Delete (deactivate) a goal
  deleteGoal: protectedProcedure
    .input(z.object({
      goalId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { goalId } = input;

      const existingGoal = await ctx.prisma.activityGoal.findFirst({
        where: {
          id: goalId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existingGoal) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Goal not found',
        });
      }

      // Soft delete by deactivating
      await ctx.prisma.activityGoal.update({
        where: { id: goalId },
        data: { isActive: false },
      });

      await auditLog('DELETE', 'ActivityGoal', {
        entityId: goalId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // Check goal achievement for a patient (called after data sync)
  checkGoalAchievement: protectedProcedure
    .input(z.object({
      patientId: z.string(),
      date: z.date().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { patientId, date = new Date() } = input;

      // Verify patient belongs to organization
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Get active goals
      const goals = await ctx.prisma.activityGoal.findMany({
        where: {
          patientId,
          isActive: true,
          organizationId: ctx.user.organizationId,
        },
      });

      if (goals.length === 0) {
        return { achievements: [], alerts: [] };
      }

      // Get activity data for the date
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const activityData = await ctx.prisma.activityData.findFirst({
        where: {
          patientId,
          date: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      });

      const sleepData = await ctx.prisma.sleepData.findFirst({
        where: {
          patientId,
          date: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      });

      const achievements: Array<{
        goalId: string;
        goalType: string;
        targetValue: number;
        actualValue: number;
        achieved: boolean;
        percentComplete: number;
      }> = [];

      const alerts: Array<{
        type: 'achievement' | 'decrease';
        goalType: string;
        message: string;
        severity: 'info' | 'warning' | 'success';
      }> = [];

      for (const goal of goals) {
        let actualValue = 0;

        switch (goal.goalType) {
          case 'STEPS':
            actualValue = activityData?.steps ?? 0;
            break;
          case 'ACTIVE_MINUTES':
            actualValue = activityData?.activeMinutes ?? 0;
            break;
          case 'SLEEP_DURATION':
            // Sleep duration is in minutes, convert to hours if needed
            actualValue = sleepData && sleepData.duration ? sleepData.duration / 60 : 0;
            break;
          case 'CALORIES':
            actualValue = activityData?.calories ?? 0;
            break;
          case 'DISTANCE':
            actualValue = activityData?.distance ?? 0;
            break;
        }

        const percentComplete = Math.round((actualValue / goal.targetValue) * 100);
        const achieved = actualValue >= goal.targetValue;

        achievements.push({
          goalId: goal.id,
          goalType: goal.goalType,
          targetValue: goal.targetValue,
          actualValue,
          achieved,
          percentComplete,
        });

        // Check if goal was just achieved (wasn't achieved yesterday)
        if (achieved && goal.alertOnAchieve) {
          const wasAchievedToday = goal.lastAchievedAt &&
            goal.lastAchievedAt >= startOfDay;

          if (!wasAchievedToday) {
            alerts.push({
              type: 'achievement',
              goalType: goal.goalType,
              message: `Goal achieved! ${actualValue} ${goal.unit} (target: ${goal.targetValue})`,
              severity: 'success',
            });

            // Update goal achievement tracking
            await ctx.prisma.activityGoal.update({
              where: { id: goal.id },
              data: {
                lastAchievedAt: new Date(),
                totalAchievements: { increment: 1 },
                currentStreak: { increment: 1 },
                longestStreak: goal.currentStreak + 1 > goal.longestStreak
                  ? goal.currentStreak + 1
                  : goal.longestStreak,
              },
            });
          }
        } else if (!achieved && goal.currentStreak > 0) {
          // Reset streak if goal not achieved today
          await ctx.prisma.activityGoal.update({
            where: { id: goal.id },
            data: { currentStreak: 0 },
          });
        }
      }

      await auditLog('VIEW', 'GoalAchievement', {
        entityId: patientId,
        changes: { date: date.toISOString(), achievements: achievements.length },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { achievements, alerts };
    }),

  // Check for significant activity decrease
  checkActivityDecrease: protectedProcedure
    .input(z.object({
      patientId: z.string(),
      lookbackDays: z.number().min(3).max(30).optional().default(7),
    }))
    .query(async ({ ctx, input }) => {
      const { patientId, lookbackDays } = input;

      // Verify patient belongs to organization
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Get active goals with decrease alerts enabled
      const goals = await ctx.prisma.activityGoal.findMany({
        where: {
          patientId,
          isActive: true,
          alertOnDecrease: true,
          organizationId: ctx.user.organizationId,
        },
      });

      if (goals.length === 0) {
        return { alerts: [], summary: null };
      }

      // Calculate date ranges
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - lookbackDays);
      startDate.setHours(0, 0, 0, 0);

      const midPoint = new Date(today);
      midPoint.setDate(midPoint.getDate() - Math.floor(lookbackDays / 2));

      // Get activity data for the period
      const activityData = await ctx.prisma.activityData.findMany({
        where: {
          patientId,
          date: { gte: startDate },
        },
        orderBy: { date: 'asc' },
      });

      const sleepData = await ctx.prisma.sleepData.findMany({
        where: {
          patientId,
          date: { gte: startDate },
        },
        orderBy: { date: 'asc' },
      });

      // Split data into first half and second half
      const firstHalfActivity = activityData.filter(d => d.date < midPoint);
      const secondHalfActivity = activityData.filter(d => d.date >= midPoint);
      const firstHalfSleep = sleepData.filter(d => d.date < midPoint);
      const secondHalfSleep = sleepData.filter(d => d.date >= midPoint);

      const alerts: Array<{
        goalType: string;
        previousAvg: number;
        currentAvg: number;
        decreasePercent: number;
        threshold: number;
        severity: 'warning' | 'critical';
        recommendation: string;
      }> = [];

      for (const goal of goals) {
        let firstHalfValues: number[] = [];
        let secondHalfValues: number[] = [];

        switch (goal.goalType) {
          case 'STEPS':
            firstHalfValues = firstHalfActivity.map(d => d.steps ?? 0);
            secondHalfValues = secondHalfActivity.map(d => d.steps ?? 0);
            break;
          case 'ACTIVE_MINUTES':
            firstHalfValues = firstHalfActivity.map(d => d.activeMinutes ?? 0);
            secondHalfValues = secondHalfActivity.map(d => d.activeMinutes ?? 0);
            break;
          case 'SLEEP_DURATION':
            firstHalfValues = firstHalfSleep.map(d => (d.duration ?? 0) / 60); // Convert to hours
            secondHalfValues = secondHalfSleep.map(d => (d.duration ?? 0) / 60);
            break;
          case 'CALORIES':
            firstHalfValues = firstHalfActivity.map(d => d.calories ?? 0);
            secondHalfValues = secondHalfActivity.map(d => d.calories ?? 0);
            break;
          case 'DISTANCE':
            firstHalfValues = firstHalfActivity.map(d => d.distance ?? 0);
            secondHalfValues = secondHalfActivity.map(d => d.distance ?? 0);
            break;
        }

        if (firstHalfValues.length === 0 || secondHalfValues.length === 0) {
          continue;
        }

        const previousAvg = calculateAverage(firstHalfValues);
        const currentAvg = calculateAverage(secondHalfValues);

        if (previousAvg === 0) continue;

        const decreasePercent = Math.round(((previousAvg - currentAvg) / previousAvg) * 100);

        if (decreasePercent >= goal.decreaseThreshold) {
          const severity = decreasePercent >= 50 ? 'critical' : 'warning';

          let recommendation = '';
          switch (goal.goalType) {
            case 'STEPS':
              recommendation = 'Consider scheduling a follow-up to discuss activity level changes and any pain concerns.';
              break;
            case 'ACTIVE_MINUTES':
              recommendation = 'Patient may be experiencing pain or mobility issues limiting activity. Review recent symptoms.';
              break;
            case 'SLEEP_DURATION':
              recommendation = 'Sleep quality decrease may indicate pain or discomfort. Consider sleep hygiene discussion.';
              break;
            case 'CALORIES':
              recommendation = 'Reduced calorie burn may indicate decreased activity. Check for mobility or pain issues.';
              break;
            case 'DISTANCE':
              recommendation = 'Reduced movement distance may indicate mobility concerns. Consider assessment.';
              break;
          }

          alerts.push({
            goalType: goal.goalType,
            previousAvg: Math.round(previousAvg * 10) / 10,
            currentAvg: Math.round(currentAvg * 10) / 10,
            decreasePercent,
            threshold: goal.decreaseThreshold,
            severity,
            recommendation,
          });
        }
      }

      return {
        alerts,
        summary: {
          lookbackDays,
          activityDaysRecorded: activityData.length,
          sleepDaysRecorded: sleepData.length,
          alertCount: alerts.length,
          criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
        },
      };
    }),

  // Generate weekly progress report
  getWeeklyProgressReport: protectedProcedure
    .input(z.object({
      patientId: z.string(),
      weekStartDate: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { patientId, weekStartDate } = input;

      // Verify patient belongs to organization
      const patient = await ctx.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          demographics: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patient not found',
        });
      }

      // Calculate week boundaries
      const endDate = weekStartDate ? new Date(weekStartDate) : new Date();
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);

      // Previous week for comparison
      const prevWeekEnd = new Date(startDate);
      prevWeekEnd.setMilliseconds(-1);
      const prevWeekStart = new Date(prevWeekEnd);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);
      prevWeekStart.setHours(0, 0, 0, 0);

      // Get goals
      const goals = await ctx.prisma.activityGoal.findMany({
        where: {
          patientId,
          isActive: true,
          organizationId: ctx.user.organizationId,
        },
      });

      // Get activity data for this week and previous week
      const thisWeekActivity = await ctx.prisma.activityData.findMany({
        where: {
          patientId,
          date: { gte: startDate, lte: endDate },
        },
        orderBy: { date: 'asc' },
      });

      const prevWeekActivity = await ctx.prisma.activityData.findMany({
        where: {
          patientId,
          date: { gte: prevWeekStart, lte: prevWeekEnd },
        },
      });

      // Get sleep data
      const thisWeekSleep = await ctx.prisma.sleepData.findMany({
        where: {
          patientId,
          date: { gte: startDate, lte: endDate },
        },
        orderBy: { date: 'asc' },
      });

      const prevWeekSleep = await ctx.prisma.sleepData.findMany({
        where: {
          patientId,
          date: { gte: prevWeekStart, lte: prevWeekEnd },
        },
      });

      // Calculate summaries
      const thisWeekSteps = thisWeekActivity.map(d => d.steps ?? 0);
      const prevWeekSteps = prevWeekActivity.map(d => d.steps ?? 0);
      const thisWeekActiveMin = thisWeekActivity.map(d => d.activeMinutes ?? 0);
      const prevWeekActiveMin = prevWeekActivity.map(d => d.activeMinutes ?? 0);
      const thisWeekCalories = thisWeekActivity.map(d => d.calories ?? 0);
      const prevWeekCalories = prevWeekActivity.map(d => d.calories ?? 0);
      const thisWeekSleepHours = thisWeekSleep.map(d => (d.duration ?? 0) / 60);
      const prevWeekSleepHours = prevWeekSleep.map(d => (d.duration ?? 0) / 60);

      const goalProgress = goals.map(goal => {
        let thisWeekValues: number[] = [];
        let daysAchieved = 0;

        switch (goal.goalType) {
          case 'STEPS':
            thisWeekValues = thisWeekSteps;
            daysAchieved = thisWeekSteps.filter(v => v >= goal.targetValue).length;
            break;
          case 'ACTIVE_MINUTES':
            thisWeekValues = thisWeekActiveMin;
            daysAchieved = thisWeekActiveMin.filter(v => v >= goal.targetValue).length;
            break;
          case 'SLEEP_DURATION':
            thisWeekValues = thisWeekSleepHours;
            daysAchieved = thisWeekSleepHours.filter(v => v >= goal.targetValue).length;
            break;
          case 'CALORIES':
            thisWeekValues = thisWeekCalories;
            daysAchieved = thisWeekCalories.filter(v => v >= goal.targetValue).length;
            break;
          case 'DISTANCE':
            thisWeekValues = thisWeekActivity.map(d => d.distance ?? 0);
            daysAchieved = thisWeekValues.filter(v => v >= goal.targetValue).length;
            break;
        }

        const avgValue = thisWeekValues.length > 0
          ? Math.round(calculateAverage(thisWeekValues) * 10) / 10
          : 0;

        return {
          goalType: goal.goalType,
          targetValue: goal.targetValue,
          unit: goal.unit,
          avgValue,
          daysAchieved,
          daysTracked: thisWeekValues.length,
          achievementRate: thisWeekValues.length > 0
            ? Math.round((daysAchieved / thisWeekValues.length) * 100)
            : 0,
          currentStreak: goal.currentStreak,
          longestStreak: goal.longestStreak,
        };
      });

      // Calculate week-over-week changes
      const weekOverWeek = {
        steps: {
          thisWeek: Math.round(calculateAverage(thisWeekSteps)),
          prevWeek: Math.round(calculateAverage(prevWeekSteps)),
          change: calculatePercentChange(
            calculateAverage(prevWeekSteps),
            calculateAverage(thisWeekSteps)
          ),
        },
        activeMinutes: {
          thisWeek: Math.round(calculateAverage(thisWeekActiveMin)),
          prevWeek: Math.round(calculateAverage(prevWeekActiveMin)),
          change: calculatePercentChange(
            calculateAverage(prevWeekActiveMin),
            calculateAverage(thisWeekActiveMin)
          ),
        },
        calories: {
          thisWeek: Math.round(calculateAverage(thisWeekCalories)),
          prevWeek: Math.round(calculateAverage(prevWeekCalories)),
          change: calculatePercentChange(
            calculateAverage(prevWeekCalories),
            calculateAverage(thisWeekCalories)
          ),
        },
        sleepHours: {
          thisWeek: Math.round(calculateAverage(thisWeekSleepHours) * 10) / 10,
          prevWeek: Math.round(calculateAverage(prevWeekSleepHours) * 10) / 10,
          change: calculatePercentChange(
            calculateAverage(prevWeekSleepHours),
            calculateAverage(thisWeekSleepHours)
          ),
        },
      };

      // Daily breakdown
      const dailyBreakdown = thisWeekActivity.map(activity => {
        const sleepForDay = thisWeekSleep.find(s =>
          s.date.toDateString() === activity.date.toDateString()
        );

        return {
          date: activity.date,
          steps: activity.steps ?? 0,
          activeMinutes: activity.activeMinutes ?? 0,
          calories: activity.calories ?? 0,
          distance: activity.distance ?? 0,
          sleepHours: sleepForDay && sleepForDay.duration ? Math.round(sleepForDay.duration / 6) / 10 : null,
          sleepQuality: sleepForDay?.quality ?? null,
        };
      });

      // Generate highlights and recommendations
      const highlights: string[] = [];
      const recommendations: string[] = [];

      if (weekOverWeek.steps.change > 10) {
        highlights.push(`Great job! Steps increased by ${weekOverWeek.steps.change}% this week.`);
      } else if (weekOverWeek.steps.change < -20) {
        recommendations.push('Activity has decreased significantly. Consider a follow-up.');
      }

      if (weekOverWeek.sleepHours.thisWeek < 7) {
        recommendations.push('Average sleep is below 7 hours. Discuss sleep hygiene.');
      } else if (weekOverWeek.sleepHours.thisWeek >= 7 && weekOverWeek.sleepHours.thisWeek <= 9) {
        highlights.push('Sleep duration is in the healthy 7-9 hour range.');
      }

      const highAchievementGoals = goalProgress.filter(g => g.achievementRate >= 80);
      if (highAchievementGoals.length > 0) {
        highlights.push(
          `Excellent consistency on ${highAchievementGoals.map(g => g.goalType.toLowerCase().replace('_', ' ')).join(', ')} goals.`
        );
      }

      const lowAchievementGoals = goalProgress.filter(g => g.achievementRate < 50 && g.daysTracked >= 3);
      if (lowAchievementGoals.length > 0) {
        recommendations.push(
          `Consider adjusting ${lowAchievementGoals.map(g => g.goalType.toLowerCase().replace('_', ' ')).join(', ')} targets.`
        );
      }

      return {
        patient: {
          id: patient.id,
          name: patient.demographics
            ? `${patient.demographics.firstName} ${patient.demographics.lastName}`
            : 'Unknown',
        },
        period: {
          startDate,
          endDate,
        },
        goalProgress,
        weekOverWeek,
        dailyBreakdown,
        summary: {
          totalSteps: thisWeekSteps.reduce((a, b) => a + b, 0),
          totalActiveMinutes: thisWeekActiveMin.reduce((a, b) => a + b, 0),
          totalCalories: thisWeekCalories.reduce((a, b) => a + b, 0),
          avgSleepHours: Math.round(calculateAverage(thisWeekSleepHours) * 10) / 10,
          daysWithData: thisWeekActivity.length,
          overallTrend: weekOverWeek.steps.change >= 0 && weekOverWeek.activeMinutes.change >= 0
            ? 'improving'
            : weekOverWeek.steps.change <= -10 || weekOverWeek.activeMinutes.change <= -10
              ? 'declining'
              : 'stable',
        },
        highlights,
        recommendations,
      };
    }),

  // Get provider alert summary for all patients with goals
  getProviderAlertSummary: protectedProcedure
    .input(z.object({
      lookbackDays: z.number().min(1).max(30).optional().default(7),
    }))
    .query(async ({ ctx, input }) => {
      const { lookbackDays } = input;

      // Get all patients with active goals
      const patientsWithGoals = await ctx.prisma.patient.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          activityGoals: {
            some: {
              isActive: true,
              alertOnDecrease: true,
            },
          },
        },
        include: {
          demographics: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          activityGoals: {
            where: {
              isActive: true,
            },
          },
        },
      });

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - lookbackDays);
      startDate.setHours(0, 0, 0, 0);

      const midPoint = new Date();
      midPoint.setDate(midPoint.getDate() - Math.floor(lookbackDays / 2));

      const patientAlerts: Array<{
        patientId: string;
        patientName: string;
        alerts: Array<{
          goalType: string;
          severity: string;
          decreasePercent: number;
        }>;
      }> = [];

      for (const patient of patientsWithGoals) {
        const activityData = await ctx.prisma.activityData.findMany({
          where: {
            patientId: patient.id,
            date: { gte: startDate },
          },
          orderBy: { date: 'asc' },
        });

        const sleepData = await ctx.prisma.sleepData.findMany({
          where: {
            patientId: patient.id,
            date: { gte: startDate },
          },
          orderBy: { date: 'asc' },
        });

        const firstHalfActivity = activityData.filter(d => d.date < midPoint);
        const secondHalfActivity = activityData.filter(d => d.date >= midPoint);
        const firstHalfSleep = sleepData.filter(d => d.date < midPoint);
        const secondHalfSleep = sleepData.filter(d => d.date >= midPoint);

        const alerts: Array<{
          goalType: string;
          severity: string;
          decreasePercent: number;
        }> = [];

        for (const goal of patient.activityGoals) {
          if (!goal.alertOnDecrease) continue;

          let firstHalfValues: number[] = [];
          let secondHalfValues: number[] = [];

          switch (goal.goalType) {
            case 'STEPS':
              firstHalfValues = firstHalfActivity.map(d => d.steps ?? 0);
              secondHalfValues = secondHalfActivity.map(d => d.steps ?? 0);
              break;
            case 'ACTIVE_MINUTES':
              firstHalfValues = firstHalfActivity.map(d => d.activeMinutes ?? 0);
              secondHalfValues = secondHalfActivity.map(d => d.activeMinutes ?? 0);
              break;
            case 'SLEEP_DURATION':
              firstHalfValues = firstHalfSleep.map(d => (d.duration ?? 0) / 60);
              secondHalfValues = secondHalfSleep.map(d => (d.duration ?? 0) / 60);
              break;
            case 'CALORIES':
              firstHalfValues = firstHalfActivity.map(d => d.calories ?? 0);
              secondHalfValues = secondHalfActivity.map(d => d.calories ?? 0);
              break;
            case 'DISTANCE':
              firstHalfValues = firstHalfActivity.map(d => d.distance ?? 0);
              secondHalfValues = secondHalfActivity.map(d => d.distance ?? 0);
              break;
          }

          if (firstHalfValues.length === 0 || secondHalfValues.length === 0) continue;

          const previousAvg = calculateAverage(firstHalfValues);
          const currentAvg = calculateAverage(secondHalfValues);

          if (previousAvg === 0) continue;

          const decreasePercent = Math.round(((previousAvg - currentAvg) / previousAvg) * 100);

          if (decreasePercent >= goal.decreaseThreshold) {
            alerts.push({
              goalType: goal.goalType,
              severity: decreasePercent >= 50 ? 'critical' : 'warning',
              decreasePercent,
            });
          }
        }

        if (alerts.length > 0) {
          patientAlerts.push({
            patientId: patient.id,
            patientName: patient.demographics
              ? `${patient.demographics.firstName} ${patient.demographics.lastName}`
              : 'Unknown',
            alerts,
          });
        }
      }

      // Sort by severity (critical first) and number of alerts
      patientAlerts.sort((a, b) => {
        const aCritical = a.alerts.filter(al => al.severity === 'critical').length;
        const bCritical = b.alerts.filter(al => al.severity === 'critical').length;
        if (aCritical !== bCritical) return bCritical - aCritical;
        return b.alerts.length - a.alerts.length;
      });

      return {
        lookbackDays,
        totalPatientsMonitored: patientsWithGoals.length,
        patientsWithAlerts: patientAlerts.length,
        totalAlerts: patientAlerts.reduce((sum, p) => sum + p.alerts.length, 0),
        criticalAlerts: patientAlerts.reduce(
          (sum, p) => sum + p.alerts.filter(a => a.severity === 'critical').length,
          0
        ),
        patientAlerts,
      };
    }),
});

// ============================================
// Helper Functions for Activity Correlation Analysis
// ============================================

interface PainData {
  level: number;
  description: string;
}

function extractPainDataFromEncounters(encounters: Array<{
  encounterDate: Date;
  soapNote?: { subjective?: string | null } | null;
}>): Map<string, PainData> {
  const painMap = new Map<string, PainData>();

  const painLevelPatterns = [
    { pattern: /pain.*?(\d+)\/10/i, extractor: (m: RegExpMatchArray) => parseInt(m[1]) },
    { pattern: /(\d+)\/10.*pain/i, extractor: (m: RegExpMatchArray) => parseInt(m[1]) },
    { pattern: /severe|intense|excruciating/i, extractor: () => 8 },
    { pattern: /moderate|significant/i, extractor: () => 6 },
    { pattern: /mild|slight|minor/i, extractor: () => 3 },
    { pattern: /pain|ache|sore|discomfort/i, extractor: () => 5 },
  ];

  encounters.forEach(encounter => {
    const dateStr = encounter.encounterDate.toISOString().split('T')[0];
    const subjective = encounter.soapNote?.subjective || '';

    let level = 0;
    for (const { pattern, extractor } of painLevelPatterns) {
      const match = subjective.match(pattern);
      if (match) {
        level = extractor(match);
        break;
      }
    }

    if (level > 0 || /pain|ache|sore|discomfort/i.test(subjective)) {
      painMap.set(dateStr, {
        level: level || 5,
        description: subjective.substring(0, 200),
      });
    }
  });

  return painMap;
}

function analyzeActivityPainCorrelation(
  activityData: Array<{ date: Date; steps: number | null; activeMinutes: number | null }>,
  painDataByDate: Map<string, PainData>,
  encounters: Array<{ encounterDate: Date }>
) {
  const activityByDate = new Map(
    activityData.map(a => [a.date.toISOString().split('T')[0], a])
  );

  // Look at activity 1-3 days before pain
  const activityBeforePain: number[] = [];
  const activityBeforeNoPain: number[] = [];

  painDataByDate.forEach((painData, dateStr) => {
    if (painData.level >= 5) {
      for (let i = 1; i <= 3; i++) {
        const checkDate = new Date(dateStr);
        checkDate.setDate(checkDate.getDate() - i);
        const activity = activityByDate.get(checkDate.toISOString().split('T')[0]);
        if (activity?.steps) {
          activityBeforePain.push(activity.steps);
        }
      }
    }
  });

  // Get activity before non-pain days
  activityData.forEach(activity => {
    const dateStr = activity.date.toISOString().split('T')[0];
    const nextDay = new Date(activity.date);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = nextDay.toISOString().split('T')[0];

    if (!painDataByDate.has(nextDayStr) && activity.steps) {
      activityBeforeNoPain.push(activity.steps);
    }
  });

  const avgBeforePain = calculateAverage(activityBeforePain);
  const avgBeforeNoPain = calculateAverage(activityBeforeNoPain);
  const baselineSteps = calculateAverage(
    activityData.map(a => a.steps).filter((s): s is number => s !== null)
  );

  // Determine primary pattern
  let primaryPattern: 'overexertion' | 'sedentary' | 'inconsistent' | 'none' = 'none';
  if (avgBeforePain > baselineSteps * 1.3) {
    primaryPattern = 'overexertion';
  } else if (avgBeforePain < baselineSteps * 0.7) {
    primaryPattern = 'sedentary';
  } else if (calculateStdDev(activityBeforePain) > baselineSteps * 0.4) {
    primaryPattern = 'inconsistent';
  }

  const correlationStrength = Math.min(100, Math.abs(avgBeforePain - avgBeforeNoPain) / baselineSteps * 100);

  return {
    avgActivityBeforePain: Math.round(avgBeforePain),
    avgActivityBeforeNoPain: Math.round(avgBeforeNoPain),
    baselineActivity: Math.round(baselineSteps),
    correlationStrength: Math.round(correlationStrength),
    primaryPattern,
    dataPoints: {
      painDays: activityBeforePain.length,
      nonPainDays: activityBeforeNoPain.length,
    },
  };
}

function analyzeSleepPainCorrelation(
  sleepData: Array<{ date: Date; quality: number | null; duration: number | null }>,
  painDataByDate: Map<string, PainData>,
  encounters: Array<{ encounterDate: Date }>
) {
  const sleepByDate = new Map(
    sleepData.map(s => [s.date.toISOString().split('T')[0], s])
  );

  const sleepBeforePain: number[] = [];
  const sleepBeforeNoPain: number[] = [];

  // Check sleep the night before pain days
  painDataByDate.forEach((painData, dateStr) => {
    if (painData.level >= 5) {
      const prevNight = new Date(dateStr);
      prevNight.setDate(prevNight.getDate() - 1);
      const sleep = sleepByDate.get(prevNight.toISOString().split('T')[0]);
      if (sleep?.quality) {
        sleepBeforePain.push(sleep.quality);
      }
    }
  });

  // Check sleep before non-pain days
  sleepData.forEach(sleep => {
    const nextDay = new Date(sleep.date);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = nextDay.toISOString().split('T')[0];

    if (!painDataByDate.has(nextDayStr) && sleep.quality) {
      sleepBeforeNoPain.push(sleep.quality);
    }
  });

  const avgSleepQualityBeforePain = calculateAverage(sleepBeforePain);
  const avgSleepQualityBeforeNoPain = calculateAverage(sleepBeforeNoPain);

  const qualityDiff = avgSleepQualityBeforeNoPain - avgSleepQualityBeforePain;
  const correlationStrength = Math.min(100, Math.abs(qualityDiff) * 2);

  return {
    avgSleepQualityBeforePain: Math.round(avgSleepQualityBeforePain),
    avgSleepQualityBeforeNoPain: Math.round(avgSleepQualityBeforeNoPain),
    correlationStrength: Math.round(correlationStrength),
    dataPoints: {
      painDays: sleepBeforePain.length,
      nonPainDays: sleepBeforeNoPain.length,
    },
  };
}

function analyzeActivityRecoveryCorrelation(
  activityData: Array<{ date: Date; steps: number | null; activeMinutes: number | null }>,
  encounters: Array<{
    encounterDate: Date;
    soapNote?: { assessment?: string | null; subjective?: string | null } | null;
  }>
) {
  // Analyze activity levels between encounters and recovery outcomes
  const recoveryData: Array<{
    avgSteps: number;
    outcome: 'improved' | 'stable' | 'worsened' | 'unknown';
  }> = [];

  for (let i = 1; i < encounters.length; i++) {
    const prevEncounter = encounters[i - 1];
    const currEncounter = encounters[i];

    const periodActivity = activityData.filter(a =>
      a.date >= prevEncounter.encounterDate && a.date <= currEncounter.encounterDate
    );

    const steps = periodActivity.map(a => a.steps).filter((s): s is number => s !== null);
    if (steps.length === 0) continue;

    const outcome = determineRecoveryOutcome(
      prevEncounter.soapNote?.assessment || '',
      currEncounter.soapNote?.assessment || '',
      currEncounter.soapNote?.subjective || ''
    );

    recoveryData.push({
      avgSteps: Math.round(calculateAverage(steps)),
      outcome,
    });
  }

  // Find optimal range from improved periods
  const improvedPeriods = recoveryData.filter(r => r.outcome === 'improved');
  const optimalActivityRange = improvedPeriods.length >= 3 ? {
    minSteps: Math.min(...improvedPeriods.map(p => p.avgSteps)),
    maxSteps: Math.max(...improvedPeriods.map(p => p.avgSteps)),
    avgSteps: Math.round(calculateAverage(improvedPeriods.map(p => p.avgSteps))),
  } : null;

  return {
    totalPeriods: recoveryData.length,
    improvedCount: improvedPeriods.length,
    optimalActivityRange,
    recoveryRate: recoveryData.length > 0
      ? Math.round((improvedPeriods.length / recoveryData.length) * 100)
      : 0,
  };
}

function determineRecoveryOutcome(
  startAssessment: string,
  endAssessment: string,
  endSubjective: string
): 'improved' | 'stable' | 'worsened' | 'unknown' {
  const improvedKeywords = /improv|better|progress|resolv|less pain|decreased|good response/i;
  const worsenedKeywords = /worse|deteriorat|increased pain|not improv|poor response|regress/i;

  const combinedEnd = `${endAssessment} ${endSubjective}`;

  if (improvedKeywords.test(combinedEnd)) return 'improved';
  if (worsenedKeywords.test(combinedEnd)) return 'worsened';
  if (startAssessment && endAssessment) return 'stable';
  return 'unknown';
}

function generatePatientRecommendations(
  activityPain: ReturnType<typeof analyzeActivityPainCorrelation> | undefined,
  sleepPain: ReturnType<typeof analyzeSleepPainCorrelation> | undefined,
  activityRecovery: ReturnType<typeof analyzeActivityRecoveryCorrelation> | undefined
): Array<{
  category: string;
  recommendation: string;
  priority: 'low' | 'medium' | 'high';
  reasoning: string;
}> {
  const recommendations: Array<{
    category: string;
    recommendation: string;
    priority: 'low' | 'medium' | 'high';
    reasoning: string;
  }> = [];

  if (activityPain) {
    if (activityPain.primaryPattern === 'overexertion') {
      recommendations.push({
        category: 'Activity',
        recommendation: 'Practice activity pacing - spread your activities throughout the day and include rest breaks.',
        priority: 'high',
        reasoning: 'Your data shows pain often follows high-activity days. Pacing can help prevent flare-ups.',
      });
    } else if (activityPain.primaryPattern === 'sedentary') {
      recommendations.push({
        category: 'Activity',
        recommendation: 'Try gentle movement on low-activity days - even a short walk can help.',
        priority: 'high',
        reasoning: 'Pain tends to increase after very sedentary days. Light activity may help maintain comfort.',
      });
    }

    if (activityPain.correlationStrength > 50 && activityRecovery?.optimalActivityRange) {
      recommendations.push({
        category: 'Activity Goals',
        recommendation: `Aim for ${activityRecovery.optimalActivityRange.minSteps.toLocaleString()}-${activityRecovery.optimalActivityRange.maxSteps.toLocaleString()} steps per day.`,
        priority: 'medium',
        reasoning: 'This activity range has been associated with your best recovery outcomes.',
      });
    }
  }

  if (sleepPain && sleepPain.correlationStrength > 40) {
    if (sleepPain.avgSleepQualityBeforePain < 60) {
      recommendations.push({
        category: 'Sleep',
        recommendation: 'Focus on sleep quality - maintain a consistent sleep schedule and create a relaxing bedtime routine.',
        priority: 'high',
        reasoning: 'Poor sleep quality appears to be linked to increased pain the next day.',
      });
    } else {
      recommendations.push({
        category: 'Sleep',
        recommendation: 'Continue prioritizing good sleep habits.',
        priority: 'low',
        reasoning: 'Better sleep is associated with fewer pain days for you.',
      });
    }
  }

  if (activityRecovery && activityRecovery.recoveryRate < 50) {
    recommendations.push({
      category: 'Recovery',
      recommendation: 'Consider discussing your activity levels with your provider at your next visit.',
      priority: 'medium',
      reasoning: 'Your recovery rate could potentially be improved with activity adjustments.',
    });
  }

  return recommendations;
}

function buildActivityTrendData(
  activityData: Array<{ date: Date; steps: number | null; activeMinutes: number | null }>,
  painDataByDate: Map<string, PainData>
): Array<{ date: string; steps: number | null; activeMinutes: number | null; painLevel: number | null }> {
  return activityData.map(a => {
    const dateStr = a.date.toISOString().split('T')[0];
    return {
      date: dateStr,
      steps: a.steps,
      activeMinutes: a.activeMinutes,
      painLevel: painDataByDate.get(dateStr)?.level ?? null,
    };
  });
}

function buildSleepTrendData(
  sleepData: Array<{ date: Date; duration: number | null; quality: number | null }>,
  painDataByDate: Map<string, PainData>
): Array<{ date: string; duration: number | null; quality: number | null; painNextDay: number | null }> {
  return sleepData.map(s => {
    const nextDay = new Date(s.date);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = nextDay.toISOString().split('T')[0];
    return {
      date: s.date.toISOString().split('T')[0],
      duration: s.duration,
      quality: s.quality,
      painNextDay: painDataByDate.get(nextDayStr)?.level ?? null,
    };
  });
}

function buildRecoveryTrendData(
  activityData: Array<{ date: Date; steps: number | null }>,
  encounters: Array<{
    encounterDate: Date;
    soapNote?: { assessment?: string | null; subjective?: string | null } | null;
  }>
): Array<{ date: string; encounterDate: string | null; activityChange: number | null; outcome: string | null }> {
  const results: Array<{ date: string; encounterDate: string | null; activityChange: number | null; outcome: string | null }> = [];

  for (let i = 1; i < encounters.length; i++) {
    const prevEncounter = encounters[i - 1];
    const currEncounter = encounters[i];

    const periodActivity = activityData.filter(a =>
      a.date >= prevEncounter.encounterDate && a.date <= currEncounter.encounterDate
    );

    const steps = periodActivity.map(a => a.steps).filter((s): s is number => s !== null);
    const avgSteps = steps.length > 0 ? calculateAverage(steps) : null;

    const outcome = determineRecoveryOutcome(
      prevEncounter.soapNote?.assessment || '',
      currEncounter.soapNote?.assessment || '',
      currEncounter.soapNote?.subjective || ''
    );

    results.push({
      date: currEncounter.encounterDate.toISOString().split('T')[0],
      encounterDate: currEncounter.encounterDate.toISOString().split('T')[0],
      activityChange: avgSteps ? Math.round(avgSteps) : null,
      outcome,
    });
  }

  return results;
}

function calculateAverage(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}

function calculateStdDev(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const avg = calculateAverage(numbers);
  const squaredDiffs = numbers.map(n => Math.pow(n - avg, 2));
  return Math.sqrt(calculateAverage(squaredDiffs));
}

function calculatePercentChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) return newValue > 0 ? 100 : 0;
  return Math.round(((newValue - oldValue) / oldValue) * 100);
}

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

// ============================================
// Posture Sensor Integration
// ============================================

// Configuration for Upright Go API
const UPRIGHT_GO_CONFIG = {
  apiBase: process.env.UPRIGHT_API_BASE || 'https://api.uprightpose.com/v2',
  clientId: process.env.UPRIGHT_CLIENT_ID || 'chiroflow-posture',
  clientSecret: process.env.UPRIGHT_CLIENT_SECRET || '',
};

// Posture sensor types supported
const POSTURE_SENSOR_TYPES = {
  UPRIGHT_GO: {
    name: 'Upright Go',
    manufacturer: 'Upright',
    connectionType: 'api',
    features: ['realTimePosture', 'slouchAlerts', 'dailySummary', 'trainingPrograms'],
  },
  GENERIC_API: {
    name: 'Generic Posture Sensor',
    manufacturer: 'Various',
    connectionType: 'api',
    features: ['realTimePosture', 'slouchAlerts'],
  },
};

// Alert types for posture data
const POSTURE_ALERT_TYPES = {
  SLOUCH: 'slouch',
  HUNCHED: 'hunched',
  HEAD_FORWARD: 'head_forward',
  TILTED: 'tilted',
  PROLONGED_SITTING: 'prolonged_sitting',
};

// Helper function to generate simulated hourly steps
function generateHourlySteps(): Record<string, number> {
  const hourlySteps: Record<string, number> = {};
  for (let i = 0; i < 24; i++) {
    // More steps during waking hours (7am-10pm)
    if (i >= 7 && i <= 22) {
      hourlySteps[i.toString()] = Math.floor(Math.random() * 800) + 100;
    } else {
      hourlySteps[i.toString()] = Math.floor(Math.random() * 50);
    }
  }
  return hourlySteps;
}

// Helper function to generate simulated workout data
function generateWorkouts(): Array<{
  type: string;
  duration: number;
  calories: number;
  startTime: string;
}> {
  const workoutTypes = ['Walking', 'Running', 'Cycling', 'Strength Training', 'Yoga', 'Swimming'];
  const numWorkouts = Math.floor(Math.random() * 2); // 0-1 workouts per day

  const workouts = [];
  for (let i = 0; i < numWorkouts; i++) {
    const type = workoutTypes[Math.floor(Math.random() * workoutTypes.length)];
    const duration = Math.floor(Math.random() * 45) + 15; // 15-60 minutes
    const calories = Math.floor(duration * (Math.random() * 5 + 5)); // ~5-10 cal/min
    const hour = Math.floor(Math.random() * 14) + 6; // 6am - 8pm

    workouts.push({
      type,
      duration,
      calories,
      startTime: `${hour.toString().padStart(2, '0')}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}`,
    });
  }

  return workouts;
}

// Helper function to generate simulated sleep data
function generateSleepData(date: Date): {
  duration: number;
  quality: number;
  efficiency: number;
  sleepStart: Date;
  sleepEnd: Date;
  timeToSleep: number;
  awakeMinutes: number;
  lightMinutes: number;
  deepMinutes: number;
  remMinutes: number;
  awakenings: number;
  restlessness: number;
  stages: Record<string, number>;
} {
  const duration = Math.floor(Math.random() * 180) + 300; // 5-8 hours in minutes
  const quality = Math.floor(Math.random() * 30) + 60; // 60-90 score
  const efficiency = Math.floor(Math.random() * 15) + 80; // 80-95%

  // Sleep start is previous evening (10pm - midnight)
  const sleepStart = new Date(date);
  sleepStart.setDate(sleepStart.getDate() - 1);
  sleepStart.setHours(22 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60), 0, 0);

  const sleepEnd = new Date(sleepStart.getTime() + duration * 60 * 1000);

  const awakeMinutes = Math.floor(Math.random() * 30) + 10;
  const deepMinutes = Math.floor(duration * 0.15) + Math.floor(Math.random() * 20);
  const remMinutes = Math.floor(duration * 0.2) + Math.floor(Math.random() * 15);
  const lightMinutes = duration - awakeMinutes - deepMinutes - remMinutes;

  return {
    duration,
    quality,
    efficiency,
    sleepStart,
    sleepEnd,
    timeToSleep: Math.floor(Math.random() * 20) + 5,
    awakeMinutes,
    lightMinutes,
    deepMinutes,
    remMinutes,
    awakenings: Math.floor(Math.random() * 5) + 1,
    restlessness: Math.floor(Math.random() * 30) + 10,
    stages: {
      awake: awakeMinutes,
      light: lightMinutes,
      deep: deepMinutes,
      rem: remMinutes,
    },
  };
}

// ============================================
// Google Fit Helper Functions
// ============================================

// Helper function to generate simulated workout data from Google Fit
function generateGoogleFitWorkouts(): Array<{
  type: string;
  duration: number;
  calories: number;
  startTime: string;
  activityType: number;
}> {
  // Google Fit activity types
  // https://developers.google.com/fit/rest/v1/reference/activity-types
  const workoutTypes: Array<{ name: string; activityType: number }> = [
    { name: 'Walking', activityType: 7 },
    { name: 'Running', activityType: 8 },
    { name: 'Biking', activityType: 1 },
    { name: 'Strength Training', activityType: 80 },
    { name: 'Yoga', activityType: 100 },
    { name: 'Aerobics', activityType: 25 },
    { name: 'HIIT', activityType: 113 },
    { name: 'Hiking', activityType: 35 },
  ];

  const numWorkouts = Math.floor(Math.random() * 2); // 0-1 workouts per day
  const workouts = [];

  for (let i = 0; i < numWorkouts; i++) {
    const workout = workoutTypes[Math.floor(Math.random() * workoutTypes.length)];
    const duration = Math.floor(Math.random() * 45) + 15; // 15-60 minutes
    const calories = Math.floor(duration * (Math.random() * 5 + 5)); // ~5-10 cal/min
    const hour = Math.floor(Math.random() * 14) + 6; // 6am - 8pm

    workouts.push({
      type: workout.name,
      activityType: workout.activityType,
      duration,
      calories,
      startTime: `${hour.toString().padStart(2, '0')}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}`,
    });
  }

  return workouts;
}

// Helper function to generate simulated sleep data from Google Fit
function generateGoogleFitSleepData(date: Date): {
  duration: number;
  quality: number;
  efficiency: number;
  sleepStart: Date;
  sleepEnd: Date;
  timeToSleep: number;
  awakeMinutes: number;
  lightMinutes: number;
  deepMinutes: number;
  remMinutes: number;
  awakenings: number;
  restlessness: number;
  stages: Record<string, number>;
} {
  // Google Fit sleep stages:
  // 1 = Awake (during sleep), 2 = Sleep, 3 = Out of bed, 4 = Light, 5 = Deep, 6 = REM

  const duration = Math.floor(Math.random() * 180) + 300; // 5-8 hours in minutes
  const quality = Math.floor(Math.random() * 30) + 60; // 60-90 score
  const efficiency = Math.floor(Math.random() * 15) + 80; // 80-95%

  // Sleep start is previous evening (10pm - midnight)
  const sleepStart = new Date(date);
  sleepStart.setDate(sleepStart.getDate() - 1);
  sleepStart.setHours(22 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60), 0, 0);

  const sleepEnd = new Date(sleepStart.getTime() + duration * 60 * 1000);

  // Google Fit typically reports different stage distributions
  const awakeMinutes = Math.floor(Math.random() * 20) + 5; // Less awake time
  const deepMinutes = Math.floor(duration * 0.18) + Math.floor(Math.random() * 15);
  const remMinutes = Math.floor(duration * 0.22) + Math.floor(Math.random() * 20);
  const lightMinutes = duration - awakeMinutes - deepMinutes - remMinutes;

  return {
    duration,
    quality,
    efficiency,
    sleepStart,
    sleepEnd,
    timeToSleep: Math.floor(Math.random() * 15) + 5,
    awakeMinutes,
    lightMinutes,
    deepMinutes,
    remMinutes,
    awakenings: Math.floor(Math.random() * 4) + 1,
    restlessness: Math.floor(Math.random() * 25) + 5,
    stages: {
      awake: awakeMinutes,
      light: lightMinutes,
      deep: deepMinutes,
      rem: remMinutes,
    },
  };
}
