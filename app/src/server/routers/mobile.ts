import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import bcrypt from 'bcryptjs';
import {
  createAccessToken,
  createRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  revokeDeviceTokens,
  MOBILE_API_VERSION,
} from '@/lib/mobile-auth';
import { DevicePlatform, SyncStatus, SyncOperationType, Prisma } from '@prisma/client';
import { createAuditLog } from '@/lib/audit';

// Input schemas
const devicePlatformSchema = z.enum(['IOS', 'ANDROID', 'WEB']);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenantId: z.string().optional(),
  deviceId: z.string().optional(),
  deviceName: z.string().optional(),
  platform: devicePlatformSchema.optional(),
  osVersion: z.string().optional(),
  appVersion: z.string().optional(),
  fcmToken: z.string().optional(),
  apnsToken: z.string().optional(),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

const registerDeviceSchema = z.object({
  deviceId: z.string().min(1),
  deviceName: z.string().optional(),
  platform: devicePlatformSchema,
  osVersion: z.string().optional(),
  appVersion: z.string().optional(),
  fcmToken: z.string().optional(),
  apnsToken: z.string().optional(),
});

const updatePushTokenSchema = z.object({
  deviceId: z.string().min(1),
  fcmToken: z.string().optional(),
  apnsToken: z.string().optional(),
});

const offlineSyncPushSchema = z.object({
  operations: z.array(
    z.object({
      clientId: z.string().min(1),
      operationType: z.enum(['CREATE', 'UPDATE', 'DELETE']),
      entityType: z.string().min(1),
      entityId: z.string().optional(),
      payload: z.any(),
      queuedAt: z.string().datetime().optional(),
    })
  ),
  deviceId: z.string().optional(),
});

const offlineSyncPullSchema = z.object({
  entityTypes: z.array(z.string()).optional(),
  since: z.string().datetime().optional(),
  limit: z.number().min(1).max(500).default(100),
});

export const mobileRouter = router({
  // Get API version and status
  status: publicProcedure.query(() => {
    return {
      apiVersion: MOBILE_API_VERSION,
      status: 'operational',
      timestamp: new Date().toISOString(),
    };
  }),

  // Mobile login - returns JWT tokens
  login: publicProcedure.input(loginSchema).mutation(async ({ ctx, input }) => {
    const { email, password, tenantId, deviceId, deviceName, platform, osVersion, appVersion, fcmToken, apnsToken } =
      input;

    // Find user
    const whereClause = tenantId ? { email, organizationId: tenantId } : { email };
    const user = await ctx.prisma.user.findFirst({
      where: whereClause,
      include: { organization: true },
    });

    if (!user || !user.isActive) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Invalid email or password',
      });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Invalid email or password',
      });
    }

    // Build auth user object
    const authUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      organizationId: user.organizationId,
      organizationName: user.organization.name,
    };

    // Register or update device if device info provided
    if (deviceId && platform) {
      await ctx.prisma.mobileDevice.upsert({
        where: {
          deviceId_userId_organizationId: {
            deviceId,
            userId: user.id,
            organizationId: user.organizationId,
          },
        },
        create: {
          deviceId,
          deviceName,
          platform: platform as DevicePlatform,
          osVersion,
          appVersion,
          fcmToken,
          apnsToken,
          userId: user.id,
          organizationId: user.organizationId,
          lastActiveAt: new Date(),
        },
        update: {
          deviceName,
          osVersion,
          appVersion,
          fcmToken,
          apnsToken,
          lastActiveAt: new Date(),
          isActive: true,
        },
      });
    }

    // Create tokens
    const accessToken = createAccessToken(authUser, deviceId);
    const refreshTokenResult = await createRefreshToken(authUser, deviceId);

    // Update last login
    await ctx.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Audit log
    await createAuditLog({
      action: 'AUTH_LOGIN',
      entityType: 'MobileAuth',
      entityId: user.id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: {
        deviceId,
        platform,
        method: 'mobile_jwt',
      },
    });

    return {
      accessToken,
      refreshToken: refreshTokenResult.token,
      expiresAt: refreshTokenResult.expiresAt.toISOString(),
      user: authUser,
      apiVersion: MOBILE_API_VERSION,
    };
  }),

  // Refresh access token
  refreshToken: publicProcedure.input(refreshTokenSchema).mutation(async ({ input }) => {
    const result = await rotateRefreshToken(input.refreshToken);

    if (!result) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired refresh token',
      });
    }

    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt.toISOString(),
      apiVersion: MOBILE_API_VERSION,
    };
  }),

  // Logout - revoke refresh token
  logout: publicProcedure.input(refreshTokenSchema).mutation(async ({ input }) => {
    await revokeRefreshToken(input.refreshToken, 'User logout');
    return { success: true };
  }),

  // Logout from all devices
  logoutAll: protectedProcedure.mutation(async ({ ctx }) => {
    const count = await revokeAllUserTokens(ctx.user.id, ctx.user.organizationId, 'Logout all devices');

    await createAuditLog({
      action: 'AUTH_LOGOUT',
      entityType: 'MobileAuth',
      entityId: ctx.user.id,
      userId: ctx.user.id,
      organizationId: ctx.user.organizationId,
      metadata: { revokedTokenCount: count, scope: 'all_devices' },
    });

    return { success: true, revokedCount: count };
  }),

  // Register a new device
  registerDevice: protectedProcedure.input(registerDeviceSchema).mutation(async ({ ctx, input }) => {
    const device = await ctx.prisma.mobileDevice.upsert({
      where: {
        deviceId_userId_organizationId: {
          deviceId: input.deviceId,
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      },
      create: {
        deviceId: input.deviceId,
        deviceName: input.deviceName,
        platform: input.platform as DevicePlatform,
        osVersion: input.osVersion,
        appVersion: input.appVersion,
        fcmToken: input.fcmToken,
        apnsToken: input.apnsToken,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      },
      update: {
        deviceName: input.deviceName,
        osVersion: input.osVersion,
        appVersion: input.appVersion,
        fcmToken: input.fcmToken,
        apnsToken: input.apnsToken,
        lastActiveAt: new Date(),
        isActive: true,
      },
    });

    return {
      id: device.id,
      deviceId: device.deviceId,
      registered: true,
    };
  }),

  // Update push notification token
  updatePushToken: protectedProcedure.input(updatePushTokenSchema).mutation(async ({ ctx, input }) => {
    const device = await ctx.prisma.mobileDevice.findFirst({
      where: {
        deviceId: input.deviceId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      },
    });

    if (!device) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Device not found',
      });
    }

    await ctx.prisma.mobileDevice.update({
      where: { id: device.id },
      data: {
        fcmToken: input.fcmToken,
        apnsToken: input.apnsToken,
        lastActiveAt: new Date(),
      },
    });

    return { success: true };
  }),

  // Unregister a device
  unregisterDevice: protectedProcedure
    .input(z.object({ deviceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Revoke all tokens for this device
      await revokeDeviceTokens(input.deviceId, ctx.user.organizationId, 'Device unregistered');

      // Deactivate device
      await ctx.prisma.mobileDevice.updateMany({
        where: {
          deviceId: input.deviceId,
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
        data: {
          isActive: false,
          fcmToken: null,
          apnsToken: null,
        },
      });

      return { success: true };
    }),

  // List registered devices
  listDevices: protectedProcedure.query(async ({ ctx }) => {
    const devices = await ctx.prisma.mobileDevice.findMany({
      where: {
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        isActive: true,
      },
      select: {
        id: true,
        deviceId: true,
        deviceName: true,
        platform: true,
        osVersion: true,
        appVersion: true,
        lastActiveAt: true,
        createdAt: true,
        isTrusted: true,
      },
      orderBy: { lastActiveAt: 'desc' },
    });

    return devices;
  }),

  // Push offline changes to server (offline-first sync)
  syncPush: protectedProcedure.input(offlineSyncPushSchema).mutation(async ({ ctx, input }) => {
    const results: Array<{
      clientId: string;
      status: 'success' | 'conflict' | 'error';
      serverId?: string;
      error?: string;
    }> = [];

    for (const op of input.operations) {
      try {
        // Check if already processed (idempotency)
        const existing = await ctx.prisma.offlineSyncQueue.findUnique({
          where: {
            clientId_organizationId: {
              clientId: op.clientId,
              organizationId: ctx.user.organizationId,
            },
          },
        });

        if (existing && existing.status === 'COMPLETED') {
          results.push({
            clientId: op.clientId,
            status: 'success',
            serverId: existing.entityId || undefined,
          });
          continue;
        }

        // Queue the operation
        const syncItem = await ctx.prisma.offlineSyncQueue.upsert({
          where: {
            clientId_organizationId: {
              clientId: op.clientId,
              organizationId: ctx.user.organizationId,
            },
          },
          create: {
            clientId: op.clientId,
            operationType: op.operationType as SyncOperationType,
            entityType: op.entityType,
            entityId: op.entityId,
            payload: op.payload as Prisma.InputJsonValue,
            status: 'PENDING' as SyncStatus,
            deviceId: input.deviceId,
            queuedAt: op.queuedAt ? new Date(op.queuedAt) : new Date(),
            organizationId: ctx.user.organizationId,
          },
          update: {
            operationType: op.operationType as SyncOperationType,
            payload: op.payload as Prisma.InputJsonValue,
            status: 'PENDING' as SyncStatus,
            attempts: { increment: 1 },
            lastAttemptAt: new Date(),
          },
        });

        // TODO: Process the operation based on entityType
        // This would dispatch to the appropriate service
        // For now, mark as success (actual processing would be async)

        results.push({
          clientId: op.clientId,
          status: 'success',
          serverId: syncItem.entityId || undefined,
        });
      } catch (error) {
        results.push({
          clientId: op.clientId,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      processed: results.filter((r) => r.status === 'success').length,
      conflicts: results.filter((r) => r.status === 'conflict').length,
      errors: results.filter((r) => r.status === 'error').length,
      results,
    };
  }),

  // Pull changes from server (for offline sync)
  syncPull: protectedProcedure.input(offlineSyncPullSchema).query(async ({ ctx, input }) => {
    // This would be customized per entity type
    // For now, return a structure that can be extended

    const changes: Array<{
      entityType: string;
      entityId: string;
      operation: 'create' | 'update' | 'delete';
      data: unknown;
      timestamp: string;
    }> = [];

    // Get pending sync items that have been processed
    const syncedItems = await ctx.prisma.offlineSyncQueue.findMany({
      where: {
        organizationId: ctx.user.organizationId,
        status: 'COMPLETED',
        ...(input.since && { syncedAt: { gt: new Date(input.since) } }),
        ...(input.entityTypes &&
          input.entityTypes.length > 0 && { entityType: { in: input.entityTypes } }),
      },
      take: input.limit,
      orderBy: { syncedAt: 'asc' },
    });

    for (const item of syncedItems) {
      changes.push({
        entityType: item.entityType,
        entityId: item.entityId || item.clientId,
        operation: item.operationType.toLowerCase() as 'create' | 'update' | 'delete',
        data: item.payload,
        timestamp: (item.syncedAt || item.updatedAt).toISOString(),
      });
    }

    return {
      changes,
      hasMore: syncedItems.length === input.limit,
      serverTimestamp: new Date().toISOString(),
    };
  }),

  // Get sync status for pending operations
  syncStatus: protectedProcedure
    .input(z.object({ clientIds: z.array(z.string()).optional() }))
    .query(async ({ ctx, input }) => {
      const items = await ctx.prisma.offlineSyncQueue.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          ...(input.clientIds && input.clientIds.length > 0 && { clientId: { in: input.clientIds } }),
        },
        select: {
          clientId: true,
          entityId: true,
          status: true,
          errorMessage: true,
          syncedAt: true,
        },
      });

      return items.map((item) => ({
        clientId: item.clientId,
        serverId: item.entityId,
        status: item.status.toLowerCase(),
        error: item.errorMessage,
        syncedAt: item.syncedAt?.toISOString(),
      }));
    }),

  // Register for push notifications
  registerPushNotification: protectedProcedure
    .input(
      z.object({
        deviceId: z.string(),
        fcmToken: z.string().optional(),
        apnsToken: z.string().optional(),
        preferences: z
          .object({
            appointmentReminders: z.boolean().default(true),
            messageNotifications: z.boolean().default(true),
            generalAlerts: z.boolean().default(true),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const device = await ctx.prisma.mobileDevice.findFirst({
        where: {
          deviceId: input.deviceId,
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!device) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Device not found. Please register the device first.',
        });
      }

      await ctx.prisma.mobileDevice.update({
        where: { id: device.id },
        data: {
          fcmToken: input.fcmToken,
          apnsToken: input.apnsToken,
        },
      });

      return {
        registered: true,
        deviceId: input.deviceId,
      };
    }),
});
