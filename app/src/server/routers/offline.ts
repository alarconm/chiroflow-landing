import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { SyncStatus, Prisma } from '@prisma/client';
import {
  queueOfflineOperation,
  getPendingOperations,
  processSyncOperations,
  resolveConflictManually,
  getSyncStatusSummary,
  getConflicts,
  cacheEntityData,
  getCachedEntity,
  getDeviceCache,
  clearExpiredCache,
  clearDeviceCache,
  getCacheablePatientData,
  getCacheableScheduleData,
  retryFailedOperations,
  cleanupCompletedOperations,
  CACHEABLE_ENTITIES,
  getCacheDuration,
} from '@/lib/offline-sync';
import { createAuditLog } from '@/lib/audit';

// Input schemas
const syncOperationSchema = z.object({
  clientId: z.string().min(1),
  operationType: z.enum(['CREATE', 'UPDATE', 'DELETE']),
  entityType: z.string().min(1),
  entityId: z.string().optional(),
  payload: z.record(z.string(), z.unknown()),
  queuedAt: z.string().datetime().optional(),
  version: z.number().optional(),
});

const syncPushSchema = z.object({
  operations: z.array(syncOperationSchema),
  deviceId: z.string().min(1),
  conflictStrategy: z.enum(['client_wins', 'server_wins', 'manual']).optional().default('manual'),
});

const syncPullSchema = z.object({
  deviceId: z.string().min(1),
  since: z.string().datetime().optional(),
  entityTypes: z.array(z.string()).optional(),
  limit: z.number().min(1).max(500).default(100),
});

const cacheDataSchema = z.object({
  deviceId: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
  version: z.number(),
});

const resolveConflictSchema = z.object({
  clientId: z.string().min(1),
  resolution: z.enum(['use_client', 'use_server', 'merge']),
  mergedData: z.record(z.string(), z.unknown()).optional(),
});

const cachePatientSchema = z.object({
  deviceId: z.string().min(1),
  patientId: z.string().min(1),
  includeHistory: z.boolean().optional().default(false),
});

const cacheScheduleSchema = z.object({
  deviceId: z.string().min(1),
  providerId: z.string().optional(),
  date: z.string().datetime().optional(),
});

export const offlineRouter = router({
  // ============================================
  // SYNC OPERATIONS
  // ============================================

  /**
   * Push offline operations to server for sync
   */
  pushOperations: protectedProcedure
    .input(syncPushSchema)
    .mutation(async ({ ctx, input }) => {
      const operations = input.operations.map((op) => ({
        ...op,
        queuedAt: op.queuedAt ? new Date(op.queuedAt) : new Date(),
        deviceId: input.deviceId,
      }));

      // Process all operations
      const results = await processSyncOperations(
        operations,
        ctx.user.organizationId,
        input.conflictStrategy
      );

      // Update device sync state
      await ctx.prisma.deviceSyncState.upsert({
        where: {
          deviceId_userId_organizationId: {
            deviceId: input.deviceId,
            userId: ctx.user.id,
            organizationId: ctx.user.organizationId,
          },
        },
        create: {
          deviceId: input.deviceId,
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
          lastIncrementalSyncAt: new Date(),
          pendingOperations: results.filter((r) => r.status !== 'success').length,
          conflictCount: results.filter((r) => r.status === 'conflict').length,
        },
        update: {
          lastIncrementalSyncAt: new Date(),
          pendingOperations: results.filter((r) => r.status !== 'success').length,
          conflictCount: results.filter((r) => r.status === 'conflict').length,
        },
      });

      // Audit log
      await createAuditLog({
        action: 'OFFLINE_SYNC_PUSH',
        entityType: 'OfflineSync',
        entityId: input.deviceId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        metadata: {
          operationCount: operations.length,
          successCount: results.filter((r) => r.status === 'success').length,
          conflictCount: results.filter((r) => r.status === 'conflict').length,
          errorCount: results.filter((r) => r.status === 'error').length,
        },
      });

      return {
        processed: results.filter((r) => r.status === 'success').length,
        conflicts: results.filter((r) => r.status === 'conflict').length,
        errors: results.filter((r) => r.status === 'error').length,
        results,
        serverTimestamp: new Date().toISOString(),
      };
    }),

  /**
   * Pull changes from server
   */
  pullChanges: protectedProcedure.input(syncPullSchema).query(async ({ ctx, input }) => {
    const changes: Array<{
      entityType: string;
      entityId: string;
      operation: 'create' | 'update' | 'delete';
      data: unknown;
      timestamp: string;
      version: number;
    }> = [];

    // Get completed sync items since last pull
    const syncedItems = await ctx.prisma.offlineSyncQueue.findMany({
      where: {
        organizationId: ctx.user.organizationId,
        status: SyncStatus.COMPLETED,
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
        version: item.syncedAt?.getTime() || Date.now(),
      });
    }

    // Update device sync state
    await ctx.prisma.deviceSyncState.upsert({
      where: {
        deviceId_userId_organizationId: {
          deviceId: input.deviceId,
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      },
      create: {
        deviceId: input.deviceId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        lastIncrementalSyncAt: new Date(),
        isOnline: true,
        lastOnlineAt: new Date(),
      },
      update: {
        lastIncrementalSyncAt: new Date(),
        isOnline: true,
        lastOnlineAt: new Date(),
      },
    });

    return {
      changes,
      hasMore: syncedItems.length === input.limit,
      serverTimestamp: new Date().toISOString(),
    };
  }),

  /**
   * Get sync status summary
   */
  getSyncStatus: protectedProcedure
    .input(z.object({ deviceId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const summary = await getSyncStatusSummary(ctx.user.organizationId, input.deviceId);

      // Get device-specific state if device specified
      let deviceState = null;
      if (input.deviceId) {
        deviceState = await ctx.prisma.deviceSyncState.findUnique({
          where: {
            deviceId_userId_organizationId: {
              deviceId: input.deviceId,
              userId: ctx.user.id,
              organizationId: ctx.user.organizationId,
            },
          },
        });
      }

      return {
        ...summary,
        deviceState: deviceState
          ? {
              lastFullSyncAt: deviceState.lastFullSyncAt?.toISOString(),
              lastIncrementalSyncAt: deviceState.lastIncrementalSyncAt?.toISOString(),
              pendingOperations: deviceState.pendingOperations,
              failedOperations: deviceState.failedOperations,
              conflictCount: deviceState.conflictCount,
              cacheSize: deviceState.cacheSize,
              cachedEntities: deviceState.cachedEntities,
            }
          : null,
      };
    }),

  /**
   * Get pending operations for a device
   */
  getPendingOperations: protectedProcedure
    .input(
      z.object({
        deviceId: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const operations = await getPendingOperations(
        ctx.user.organizationId,
        input.deviceId,
        input.limit
      );
      return operations;
    }),

  /**
   * Manually trigger sync (process pending operations)
   */
  triggerSync: protectedProcedure
    .input(z.object({ deviceId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      // Get pending operations
      const pendingOps = await ctx.prisma.offlineSyncQueue.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          deviceId: input.deviceId,
          status: { in: [SyncStatus.PENDING, SyncStatus.FAILED] },
        },
        take: 100,
        orderBy: { queuedAt: 'asc' },
      });

      if (pendingOps.length === 0) {
        return {
          processed: 0,
          message: 'No pending operations to sync',
          serverTimestamp: new Date().toISOString(),
        };
      }

      // Convert to sync operations
      const operations = pendingOps.map((op) => ({
        clientId: op.clientId,
        operationType: op.operationType as 'CREATE' | 'UPDATE' | 'DELETE',
        entityType: op.entityType,
        entityId: op.entityId || undefined,
        payload: op.payload as Record<string, unknown>,
        queuedAt: op.queuedAt,
        deviceId: op.deviceId || undefined,
      }));

      // Process
      const results = await processSyncOperations(operations, ctx.user.organizationId, 'manual');

      // Update device state
      await ctx.prisma.deviceSyncState.update({
        where: {
          deviceId_userId_organizationId: {
            deviceId: input.deviceId,
            userId: ctx.user.id,
            organizationId: ctx.user.organizationId,
          },
        },
        data: {
          lastIncrementalSyncAt: new Date(),
          pendingOperations: results.filter((r) => r.status !== 'success').length,
          conflictCount: results.filter((r) => r.status === 'conflict').length,
        },
      });

      // Audit log
      await createAuditLog({
        action: 'OFFLINE_SYNC_MANUAL',
        entityType: 'OfflineSync',
        entityId: input.deviceId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        metadata: {
          operationCount: operations.length,
          successCount: results.filter((r) => r.status === 'success').length,
        },
      });

      return {
        processed: results.filter((r) => r.status === 'success').length,
        conflicts: results.filter((r) => r.status === 'conflict').length,
        errors: results.filter((r) => r.status === 'error').length,
        results,
        serverTimestamp: new Date().toISOString(),
      };
    }),

  /**
   * Retry failed operations
   */
  retryFailed: protectedProcedure
    .input(z.object({ maxAttempts: z.number().min(1).max(10).default(3) }))
    .mutation(async ({ ctx, input }) => {
      const result = await retryFailedOperations(ctx.user.organizationId, input.maxAttempts);

      await createAuditLog({
        action: 'OFFLINE_SYNC_RETRY',
        entityType: 'OfflineSync',
        entityId: ctx.user.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        metadata: result,
      });

      return result;
    }),

  // ============================================
  // CONFLICT RESOLUTION
  // ============================================

  /**
   * Get conflicts requiring manual resolution
   */
  getConflicts: protectedProcedure
    .input(z.object({ deviceId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const conflicts = await getConflicts(ctx.user.organizationId, input.deviceId);
      return conflicts;
    }),

  /**
   * Resolve a conflict manually
   */
  resolveConflict: protectedProcedure.input(resolveConflictSchema).mutation(async ({ ctx, input }) => {
    const success = await resolveConflictManually(
      input.clientId,
      ctx.user.organizationId,
      input.resolution,
      input.mergedData
    );

    if (!success) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Conflict not found or already resolved',
      });
    }

    // Also record in SyncConflict model for history
    const syncItem = await ctx.prisma.offlineSyncQueue.findUnique({
      where: {
        clientId_organizationId: {
          clientId: input.clientId,
          organizationId: ctx.user.organizationId,
        },
      },
    });

    if (syncItem) {
      await ctx.prisma.syncConflict.create({
        data: {
          syncQueueId: syncItem.id,
          entityType: syncItem.entityType,
          entityId: syncItem.entityId || syncItem.clientId,
          clientData: syncItem.payload as Prisma.InputJsonValue,
          serverData: (syncItem.conflictData || {}) as Prisma.InputJsonValue,
          conflictType: 'version_mismatch',
          status: `resolved_${input.resolution}`,
          resolvedData: input.mergedData
            ? (input.mergedData as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          resolvedAt: new Date(),
          resolvedBy: ctx.user.id,
          deviceId: syncItem.deviceId || 'unknown',
          organizationId: ctx.user.organizationId,
        },
      });
    }

    await createAuditLog({
      action: 'OFFLINE_CONFLICT_RESOLVED',
      entityType: 'SyncConflict',
      entityId: input.clientId,
      userId: ctx.user.id,
      organizationId: ctx.user.organizationId,
      metadata: { resolution: input.resolution },
    });

    return { success: true, resolution: input.resolution };
  }),

  // ============================================
  // CACHE MANAGEMENT
  // ============================================

  /**
   * Cache entity data for offline access
   */
  cacheEntity: protectedProcedure.input(cacheDataSchema).mutation(async ({ ctx, input }) => {
    await cacheEntityData(
      ctx.user.organizationId,
      ctx.user.id,
      input.deviceId,
      input.entityType,
      input.entityId,
      input.data,
      input.version
    );

    // Update device cache stats
    const cacheCount = await ctx.prisma.offlineCache.count({
      where: {
        organizationId: ctx.user.organizationId,
        deviceId: input.deviceId,
      },
    });

    await ctx.prisma.deviceSyncState.upsert({
      where: {
        deviceId_userId_organizationId: {
          deviceId: input.deviceId,
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      },
      create: {
        deviceId: input.deviceId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        cachedEntities: cacheCount,
      },
      update: {
        cachedEntities: cacheCount,
      },
    });

    return { cached: true, expiresIn: getCacheDuration(input.entityType) };
  }),

  /**
   * Get cached entity
   */
  getCachedEntity: protectedProcedure
    .input(
      z.object({
        deviceId: z.string().min(1),
        entityType: z.string().min(1),
        entityId: z.string().min(1),
      })
    )
    .query(async ({ ctx, input }) => {
      const cached = await getCachedEntity(
        ctx.user.organizationId,
        input.deviceId,
        input.entityType,
        input.entityId
      );
      return cached;
    }),

  /**
   * Get all cached data for a device
   */
  getDeviceCache: protectedProcedure
    .input(
      z.object({
        deviceId: z.string().min(1),
        entityTypes: z.array(z.string()).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const cached = await getDeviceCache(
        ctx.user.organizationId,
        input.deviceId,
        input.entityTypes
      );
      return cached;
    }),

  /**
   * Cache patient data for offline access
   */
  cachePatient: protectedProcedure.input(cachePatientSchema).mutation(async ({ ctx, input }) => {
    const patientData = await getCacheablePatientData(
      ctx.user.organizationId,
      input.patientId,
      input.includeHistory
    );

    if (!patientData.patient) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Patient not found',
      });
    }

    await cacheEntityData(
      ctx.user.organizationId,
      ctx.user.id,
      input.deviceId,
      'patient',
      input.patientId,
      patientData,
      patientData.version as number
    );

    return {
      cached: true,
      patientId: input.patientId,
      dataKeys: Object.keys(patientData),
      expiresIn: getCacheDuration('patient'),
    };
  }),

  /**
   * Cache today's schedule for offline access
   */
  cacheSchedule: protectedProcedure.input(cacheScheduleSchema).mutation(async ({ ctx, input }) => {
    // Get provider ID - use current user if provider, otherwise use specified
    let providerId = input.providerId;
    if (!providerId) {
      const provider = await ctx.prisma.provider.findUnique({
        where: { userId: ctx.user.id },
      });
      if (provider) {
        providerId = provider.id;
      }
    }

    if (!providerId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Provider ID required or user must be a provider',
      });
    }

    const date = input.date ? new Date(input.date) : new Date();
    const scheduleData = await getCacheableScheduleData(
      ctx.user.organizationId,
      providerId,
      date
    );

    await cacheEntityData(
      ctx.user.organizationId,
      ctx.user.id,
      input.deviceId,
      'schedule',
      `${providerId}_${scheduleData.date}`,
      scheduleData,
      scheduleData.version as number
    );

    return {
      cached: true,
      date: scheduleData.date,
      appointmentCount: (scheduleData.appointments as unknown[]).length,
      expiresIn: getCacheDuration('schedule'),
    };
  }),

  /**
   * Clear device cache
   */
  clearCache: protectedProcedure
    .input(z.object({ deviceId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const cleared = await clearDeviceCache(ctx.user.organizationId, input.deviceId);

      // Update device state
      await ctx.prisma.deviceSyncState.update({
        where: {
          deviceId_userId_organizationId: {
            deviceId: input.deviceId,
            userId: ctx.user.id,
            organizationId: ctx.user.organizationId,
          },
        },
        data: {
          cachedEntities: 0,
          cacheSize: 0,
        },
      });

      await createAuditLog({
        action: 'OFFLINE_CACHE_CLEARED',
        entityType: 'OfflineCache',
        entityId: input.deviceId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        metadata: { clearedCount: cleared },
      });

      return { cleared, deviceId: input.deviceId };
    }),

  /**
   * Clear expired cache entries (admin cleanup)
   */
  cleanupExpired: protectedProcedure.mutation(async ({ ctx }) => {
    const cleared = await clearExpiredCache(ctx.user.organizationId);
    return { cleared };
  }),

  // ============================================
  // DEVICE STATE MANAGEMENT
  // ============================================

  /**
   * Register/update device sync state
   */
  updateDeviceState: protectedProcedure
    .input(
      z.object({
        deviceId: z.string().min(1),
        isOnline: z.boolean().optional(),
        pendingOperations: z.number().optional(),
        cacheSize: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const state = await ctx.prisma.deviceSyncState.upsert({
        where: {
          deviceId_userId_organizationId: {
            deviceId: input.deviceId,
            userId: ctx.user.id,
            organizationId: ctx.user.organizationId,
          },
        },
        create: {
          deviceId: input.deviceId,
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
          isOnline: input.isOnline ?? true,
          pendingOperations: input.pendingOperations ?? 0,
          cacheSize: input.cacheSize ?? 0,
          lastOnlineAt: input.isOnline ? new Date() : undefined,
        },
        update: {
          isOnline: input.isOnline,
          pendingOperations: input.pendingOperations,
          cacheSize: input.cacheSize,
          lastOnlineAt: input.isOnline ? new Date() : undefined,
        },
      });

      return {
        deviceId: state.deviceId,
        isOnline: state.isOnline,
        lastOnlineAt: state.lastOnlineAt?.toISOString(),
      };
    }),

  /**
   * Get device sync state
   */
  getDeviceState: protectedProcedure
    .input(z.object({ deviceId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const state = await ctx.prisma.deviceSyncState.findUnique({
        where: {
          deviceId_userId_organizationId: {
            deviceId: input.deviceId,
            userId: ctx.user.id,
            organizationId: ctx.user.organizationId,
          },
        },
      });

      if (!state) {
        return null;
      }

      return {
        deviceId: state.deviceId,
        isOnline: state.isOnline,
        lastOnlineAt: state.lastOnlineAt?.toISOString(),
        lastFullSyncAt: state.lastFullSyncAt?.toISOString(),
        lastIncrementalSyncAt: state.lastIncrementalSyncAt?.toISOString(),
        pendingOperations: state.pendingOperations,
        failedOperations: state.failedOperations,
        conflictCount: state.conflictCount,
        cacheSize: state.cacheSize,
        cachedEntities: state.cachedEntities,
      };
    }),

  // ============================================
  // FULL SYNC (Initial data load)
  // ============================================

  /**
   * Perform full sync - cache all recent data for offline use
   */
  performFullSync: protectedProcedure
    .input(
      z.object({
        deviceId: z.string().min(1),
        entityTypes: z.array(z.enum(CACHEABLE_ENTITIES)).optional(),
        daysToCache: z.number().min(1).max(90).default(30),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const entityTypes = input.entityTypes || ['patient', 'appointment', 'schedule'];
      const cutoffDate = new Date(Date.now() - input.daysToCache * 24 * 60 * 60 * 1000);
      let cachedCount = 0;

      // Cache recent appointments
      if (entityTypes.includes('appointment')) {
        const appointments = await ctx.prisma.appointment.findMany({
          where: {
            organizationId: ctx.user.organizationId,
            startTime: { gte: cutoffDate },
          },
          take: 500,
        });

        for (const appt of appointments) {
          await cacheEntityData(
            ctx.user.organizationId,
            ctx.user.id,
            input.deviceId,
            'appointment',
            appt.id,
            appt as unknown as Record<string, unknown>,
            appt.updatedAt.getTime()
          );
          cachedCount++;
        }
      }

      // Cache recent patients (those with appointments)
      if (entityTypes.includes('patient')) {
        const recentPatients = await ctx.prisma.patient.findMany({
          where: {
            organizationId: ctx.user.organizationId,
            appointments: {
              some: {
                startTime: { gte: cutoffDate },
              },
            },
          },
          take: 200,
        });

        for (const patient of recentPatients) {
          const patientData = await getCacheablePatientData(
            ctx.user.organizationId,
            patient.id,
            false
          );
          await cacheEntityData(
            ctx.user.organizationId,
            ctx.user.id,
            input.deviceId,
            'patient',
            patient.id,
            patientData,
            patientData.version as number
          );
          cachedCount++;
        }
      }

      // Cache schedule for next 7 days
      if (entityTypes.includes('schedule')) {
        const provider = await ctx.prisma.provider.findUnique({
          where: { userId: ctx.user.id },
        });

        if (provider) {
          for (let i = 0; i < 7; i++) {
            const date = new Date();
            date.setDate(date.getDate() + i);
            const scheduleData = await getCacheableScheduleData(
              ctx.user.organizationId,
              provider.id,
              date
            );
            await cacheEntityData(
              ctx.user.organizationId,
              ctx.user.id,
              input.deviceId,
              'schedule',
              `${provider.id}_${scheduleData.date}`,
              scheduleData,
              scheduleData.version as number
            );
            cachedCount++;
          }
        }
      }

      // Update device state
      const cacheCount = await ctx.prisma.offlineCache.count({
        where: {
          organizationId: ctx.user.organizationId,
          deviceId: input.deviceId,
        },
      });

      await ctx.prisma.deviceSyncState.upsert({
        where: {
          deviceId_userId_organizationId: {
            deviceId: input.deviceId,
            userId: ctx.user.id,
            organizationId: ctx.user.organizationId,
          },
        },
        create: {
          deviceId: input.deviceId,
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
          lastFullSyncAt: new Date(),
          cachedEntities: cacheCount,
        },
        update: {
          lastFullSyncAt: new Date(),
          cachedEntities: cacheCount,
        },
      });

      await createAuditLog({
        action: 'OFFLINE_FULL_SYNC',
        entityType: 'OfflineSync',
        entityId: input.deviceId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        metadata: {
          entityTypes,
          daysToCache: input.daysToCache,
          cachedCount,
        },
      });

      return {
        success: true,
        cachedEntities: cachedCount,
        entityTypes,
        serverTimestamp: new Date().toISOString(),
      };
    }),

  // ============================================
  // ADMIN OPERATIONS
  // ============================================

  /**
   * Clean up old completed operations
   */
  cleanupOldOperations: protectedProcedure
    .input(z.object({ olderThanDays: z.number().min(1).max(90).default(7) }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await cleanupCompletedOperations(
        ctx.user.organizationId,
        input.olderThanDays
      );

      await createAuditLog({
        action: 'OFFLINE_CLEANUP',
        entityType: 'OfflineSync',
        entityId: ctx.user.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        metadata: { deletedCount: deleted, olderThanDays: input.olderThanDays },
      });

      return { deleted };
    }),

  /**
   * Get all device states for the organization (admin)
   */
  getAllDeviceStates: protectedProcedure.query(async ({ ctx }) => {
    const states = await ctx.prisma.deviceSyncState.findMany({
      where: { organizationId: ctx.user.organizationId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { lastOnlineAt: 'desc' },
    });

    return states.map((s) => ({
      deviceId: s.deviceId,
      user: s.user,
      isOnline: s.isOnline,
      lastOnlineAt: s.lastOnlineAt?.toISOString(),
      lastFullSyncAt: s.lastFullSyncAt?.toISOString(),
      pendingOperations: s.pendingOperations,
      conflictCount: s.conflictCount,
      cachedEntities: s.cachedEntities,
    }));
  }),

  /**
   * Get cacheable entity types
   */
  getCacheableEntityTypes: protectedProcedure.query(() => {
    return CACHEABLE_ENTITIES.map((type) => ({
      type,
      cacheDuration: getCacheDuration(type),
    }));
  }),
});
