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
});

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
