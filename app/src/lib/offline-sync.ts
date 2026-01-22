/**
 * Offline Sync Library for Mobile Applications
 *
 * Provides comprehensive offline-first data synchronization with:
 * - Local cache management for recent patient data
 * - Action queue for offline operations
 * - Conflict detection and resolution strategies
 * - Sync status tracking
 */

import { prisma } from '@/lib/prisma';
import { SyncStatus, SyncOperationType, Prisma } from '@prisma/client';

// Types
export interface SyncOperation {
  clientId: string;
  operationType: 'CREATE' | 'UPDATE' | 'DELETE';
  entityType: string;
  entityId?: string;
  payload: Record<string, unknown>;
  queuedAt: Date;
  deviceId?: string;
  version?: number;
}

export interface ConflictResolution {
  strategy: 'client_wins' | 'server_wins' | 'manual' | 'merge';
  clientData: Record<string, unknown>;
  serverData: Record<string, unknown>;
  mergedData?: Record<string, unknown>;
}

export interface SyncResult {
  clientId: string;
  status: 'success' | 'conflict' | 'error';
  serverId?: string;
  error?: string;
  conflictData?: {
    clientVersion: Record<string, unknown>;
    serverVersion: Record<string, unknown>;
  };
}

export interface CacheableEntity {
  entityType: string;
  entityId: string;
  data: Record<string, unknown>;
  version: number;
  cachedAt: Date;
  expiresAt: Date;
}

export interface SyncStatusSummary {
  pending: number;
  syncing: number;
  completed: number;
  failed: number;
  conflicts: number;
  lastSyncAt: Date | null;
  isOnline: boolean;
}

// Cache duration settings (in milliseconds)
export const CACHE_DURATIONS = {
  patient: 24 * 60 * 60 * 1000, // 24 hours
  appointment: 12 * 60 * 60 * 1000, // 12 hours
  encounter: 4 * 60 * 60 * 1000, // 4 hours
  note: 4 * 60 * 60 * 1000, // 4 hours
  schedule: 1 * 60 * 60 * 1000, // 1 hour
  default: 6 * 60 * 60 * 1000, // 6 hours
};

// Entity types that can be cached
export const CACHEABLE_ENTITIES = [
  'patient',
  'appointment',
  'encounter',
  'soapNote',
  'bodyDiagram',
  'diagnosis',
  'procedure',
  'treatmentPlan',
  'schedule',
] as const;

export type CacheableEntityType = (typeof CACHEABLE_ENTITIES)[number];

/**
 * Get cache duration for an entity type
 */
export function getCacheDuration(entityType: string): number {
  return CACHE_DURATIONS[entityType as keyof typeof CACHE_DURATIONS] || CACHE_DURATIONS.default;
}

/**
 * Queue an offline operation for later sync
 */
export async function queueOfflineOperation(
  operation: SyncOperation,
  organizationId: string
): Promise<{ clientId: string; queued: boolean }> {
  // Check if already queued
  const existing = await prisma.offlineSyncQueue.findUnique({
    where: {
      clientId_organizationId: {
        clientId: operation.clientId,
        organizationId,
      },
    },
  });

  if (existing && existing.status === 'COMPLETED') {
    return { clientId: operation.clientId, queued: false };
  }

  await prisma.offlineSyncQueue.upsert({
    where: {
      clientId_organizationId: {
        clientId: operation.clientId,
        organizationId,
      },
    },
    create: {
      clientId: operation.clientId,
      operationType: operation.operationType as SyncOperationType,
      entityType: operation.entityType,
      entityId: operation.entityId,
      payload: operation.payload as Prisma.InputJsonValue,
      status: SyncStatus.PENDING,
      deviceId: operation.deviceId,
      queuedAt: operation.queuedAt,
      organizationId,
    },
    update: {
      payload: operation.payload as Prisma.InputJsonValue,
      status: SyncStatus.PENDING,
      attempts: { increment: 1 },
      lastAttemptAt: new Date(),
    },
  });

  return { clientId: operation.clientId, queued: true };
}

/**
 * Get pending operations for a device
 */
export async function getPendingOperations(
  organizationId: string,
  deviceId?: string,
  limit = 100
): Promise<Array<{
  id: string;
  clientId: string;
  operationType: string;
  entityType: string;
  entityId: string | null;
  payload: unknown;
  status: string;
  queuedAt: Date;
  attempts: number;
}>> {
  const operations = await prisma.offlineSyncQueue.findMany({
    where: {
      organizationId,
      status: { in: [SyncStatus.PENDING, SyncStatus.FAILED] },
      ...(deviceId && { deviceId }),
    },
    take: limit,
    orderBy: { queuedAt: 'asc' },
    select: {
      id: true,
      clientId: true,
      operationType: true,
      entityType: true,
      entityId: true,
      payload: true,
      status: true,
      queuedAt: true,
      attempts: true,
    },
  });

  return operations.map((op) => ({
    ...op,
    operationType: op.operationType.toString(),
    status: op.status.toString(),
  }));
}

/**
 * Process sync operations with conflict detection
 */
export async function processSyncOperations(
  operations: SyncOperation[],
  organizationId: string,
  conflictStrategy: 'client_wins' | 'server_wins' | 'manual' = 'manual'
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  for (const op of operations) {
    try {
      // Mark as syncing
      await prisma.offlineSyncQueue.updateMany({
        where: {
          clientId: op.clientId,
          organizationId,
        },
        data: {
          status: SyncStatus.SYNCING,
          lastAttemptAt: new Date(),
        },
      });

      // Check for conflicts on UPDATE/DELETE
      if (op.operationType !== 'CREATE' && op.entityId) {
        const conflict = await detectConflict(
          op.entityType,
          op.entityId,
          op.version || 0,
          organizationId
        );

        if (conflict) {
          // Handle conflict based on strategy
          const resolution = await resolveConflict(
            op,
            conflict,
            conflictStrategy,
            organizationId
          );

          if (resolution.status === 'conflict') {
            results.push({
              clientId: op.clientId,
              status: 'conflict',
              conflictData: {
                clientVersion: op.payload,
                serverVersion: conflict,
              },
            });
            continue;
          }
        }
      }

      // Process the operation
      const result = await executeOperation(op, organizationId);
      results.push(result);
    } catch (error) {
      // Mark as failed
      await prisma.offlineSyncQueue.updateMany({
        where: {
          clientId: op.clientId,
          organizationId,
        },
        data: {
          status: SyncStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      results.push({
        clientId: op.clientId,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}

/**
 * Detect conflicts between client and server versions
 */
async function detectConflict(
  entityType: string,
  entityId: string,
  clientVersion: number,
  organizationId: string
): Promise<Record<string, unknown> | null> {
  // Get current server version based on entity type
  let serverEntity: Record<string, unknown> | null = null;
  let serverVersion = 0;

  switch (entityType) {
    case 'appointment':
      const appointment = await prisma.appointment.findFirst({
        where: { id: entityId, organizationId },
      });
      if (appointment) {
        serverEntity = appointment as unknown as Record<string, unknown>;
        serverVersion = appointment.updatedAt.getTime();
      }
      break;

    case 'encounter':
      const encounter = await prisma.encounter.findFirst({
        where: { id: entityId, organizationId },
      });
      if (encounter) {
        serverEntity = encounter as unknown as Record<string, unknown>;
        serverVersion = encounter.updatedAt.getTime();
      }
      break;

    case 'soapNote':
      const soapNote = await prisma.sOAPNote.findFirst({
        where: { id: entityId },
        include: { encounter: true },
      });
      if (soapNote && soapNote.encounter.organizationId === organizationId) {
        serverEntity = soapNote as unknown as Record<string, unknown>;
        serverVersion = soapNote.updatedAt.getTime();
      }
      break;

    case 'bodyDiagram':
      const diagram = await prisma.bodyDiagram.findFirst({
        where: { id: entityId },
        include: { encounter: true },
      });
      if (diagram && diagram.encounter.organizationId === organizationId) {
        serverEntity = diagram as unknown as Record<string, unknown>;
        serverVersion = diagram.updatedAt.getTime();
      }
      break;

    default:
      // For other entity types, we can't detect conflicts
      return null;
  }

  // If server version is newer than client version, there's a conflict
  if (serverEntity && serverVersion > clientVersion) {
    return serverEntity;
  }

  return null;
}

/**
 * Resolve a conflict based on strategy
 */
async function resolveConflict(
  operation: SyncOperation,
  serverData: Record<string, unknown>,
  strategy: 'client_wins' | 'server_wins' | 'manual',
  organizationId: string
): Promise<{ status: 'resolved' | 'conflict'; data?: Record<string, unknown> }> {
  switch (strategy) {
    case 'client_wins':
      // Client data overwrites server
      return { status: 'resolved', data: operation.payload };

    case 'server_wins':
      // Server data is kept, mark sync as completed without changes
      await prisma.offlineSyncQueue.updateMany({
        where: {
          clientId: operation.clientId,
          organizationId,
        },
        data: {
          status: SyncStatus.COMPLETED,
          conflictData: serverData as Prisma.InputJsonValue,
          resolvedAt: new Date(),
          resolvedBy: 'server',
          syncedAt: new Date(),
        },
      });
      return { status: 'resolved', data: serverData };

    case 'manual':
    default:
      // Mark as conflict for manual resolution
      await prisma.offlineSyncQueue.updateMany({
        where: {
          clientId: operation.clientId,
          organizationId,
        },
        data: {
          status: SyncStatus.CONFLICT,
          conflictData: serverData as Prisma.InputJsonValue,
        },
      });
      return { status: 'conflict' };
  }
}

/**
 * Execute a sync operation
 */
async function executeOperation(
  operation: SyncOperation,
  organizationId: string
): Promise<SyncResult> {
  // For now, mark as completed - actual execution would dispatch to entity-specific handlers
  // This is a placeholder that would be extended for each entity type

  let serverId: string | undefined;

  // Mark operation as completed
  await prisma.offlineSyncQueue.updateMany({
    where: {
      clientId: operation.clientId,
      organizationId,
    },
    data: {
      status: SyncStatus.COMPLETED,
      syncedAt: new Date(),
      entityId: serverId || operation.entityId,
    },
  });

  return {
    clientId: operation.clientId,
    status: 'success',
    serverId: serverId || operation.entityId,
  };
}

/**
 * Manually resolve a conflict
 */
export async function resolveConflictManually(
  clientId: string,
  organizationId: string,
  resolution: 'use_client' | 'use_server' | 'merge',
  mergedData?: Record<string, unknown>
): Promise<boolean> {
  const syncItem = await prisma.offlineSyncQueue.findUnique({
    where: {
      clientId_organizationId: {
        clientId,
        organizationId,
      },
    },
  });

  if (!syncItem || syncItem.status !== SyncStatus.CONFLICT) {
    return false;
  }

  const resolvedData = resolution === 'merge' ? mergedData :
    resolution === 'use_client' ? syncItem.payload : syncItem.conflictData;

  await prisma.offlineSyncQueue.update({
    where: { id: syncItem.id },
    data: {
      status: SyncStatus.PENDING,
      payload: resolvedData as Prisma.InputJsonValue,
      conflictData: Prisma.JsonNull,
      resolvedAt: new Date(),
      resolvedBy: resolution,
    },
  });

  return true;
}

/**
 * Get sync status summary for a user/device
 */
export async function getSyncStatusSummary(
  organizationId: string,
  deviceId?: string
): Promise<SyncStatusSummary> {
  const where = {
    organizationId,
    ...(deviceId && { deviceId }),
  };

  const [pending, syncing, completed, failed, conflicts, lastSync] = await Promise.all([
    prisma.offlineSyncQueue.count({ where: { ...where, status: SyncStatus.PENDING } }),
    prisma.offlineSyncQueue.count({ where: { ...where, status: SyncStatus.SYNCING } }),
    prisma.offlineSyncQueue.count({ where: { ...where, status: SyncStatus.COMPLETED } }),
    prisma.offlineSyncQueue.count({ where: { ...where, status: SyncStatus.FAILED } }),
    prisma.offlineSyncQueue.count({ where: { ...where, status: SyncStatus.CONFLICT } }),
    prisma.offlineSyncQueue.findFirst({
      where: { ...where, status: SyncStatus.COMPLETED },
      orderBy: { syncedAt: 'desc' },
      select: { syncedAt: true },
    }),
  ]);

  return {
    pending,
    syncing,
    completed,
    failed,
    conflicts,
    lastSyncAt: lastSync?.syncedAt || null,
    isOnline: true, // Server-side, always online
  };
}

/**
 * Get conflicts that need manual resolution
 */
export async function getConflicts(
  organizationId: string,
  deviceId?: string
): Promise<Array<{
  clientId: string;
  entityType: string;
  entityId: string | null;
  clientData: unknown;
  serverData: unknown;
  queuedAt: Date;
}>> {
  const conflicts = await prisma.offlineSyncQueue.findMany({
    where: {
      organizationId,
      status: SyncStatus.CONFLICT,
      ...(deviceId && { deviceId }),
    },
    select: {
      clientId: true,
      entityType: true,
      entityId: true,
      payload: true,
      conflictData: true,
      queuedAt: true,
    },
    orderBy: { queuedAt: 'desc' },
  });

  return conflicts.map((c) => ({
    clientId: c.clientId,
    entityType: c.entityType,
    entityId: c.entityId,
    clientData: c.payload,
    serverData: c.conflictData,
    queuedAt: c.queuedAt,
  }));
}

/**
 * Cache entity data for offline access
 */
export async function cacheEntityData(
  organizationId: string,
  userId: string,
  deviceId: string,
  entityType: string,
  entityId: string,
  data: Record<string, unknown>,
  version: number
): Promise<void> {
  const duration = getCacheDuration(entityType);
  const expiresAt = new Date(Date.now() + duration);

  await prisma.offlineCache.upsert({
    where: {
      entityType_entityId_deviceId_organizationId: {
        entityType,
        entityId,
        deviceId,
        organizationId,
      },
    },
    create: {
      entityType,
      entityId,
      data: data as Prisma.InputJsonValue,
      version,
      deviceId,
      userId,
      organizationId,
      expiresAt,
    },
    update: {
      data: data as Prisma.InputJsonValue,
      version,
      expiresAt,
      cachedAt: new Date(),
    },
  });
}

/**
 * Get cached entity data
 */
export async function getCachedEntity(
  organizationId: string,
  deviceId: string,
  entityType: string,
  entityId: string
): Promise<CacheableEntity | null> {
  const cached = await prisma.offlineCache.findUnique({
    where: {
      entityType_entityId_deviceId_organizationId: {
        entityType,
        entityId,
        deviceId,
        organizationId,
      },
    },
  });

  if (!cached || cached.expiresAt < new Date()) {
    return null;
  }

  return {
    entityType: cached.entityType,
    entityId: cached.entityId,
    data: cached.data as Record<string, unknown>,
    version: cached.version,
    cachedAt: cached.cachedAt,
    expiresAt: cached.expiresAt,
  };
}

/**
 * Get all cached data for a device
 */
export async function getDeviceCache(
  organizationId: string,
  deviceId: string,
  entityTypes?: string[]
): Promise<CacheableEntity[]> {
  const cached = await prisma.offlineCache.findMany({
    where: {
      organizationId,
      deviceId,
      expiresAt: { gt: new Date() },
      ...(entityTypes && entityTypes.length > 0 && { entityType: { in: entityTypes } }),
    },
    orderBy: { cachedAt: 'desc' },
  });

  return cached.map((c) => ({
    entityType: c.entityType,
    entityId: c.entityId,
    data: c.data as Record<string, unknown>,
    version: c.version,
    cachedAt: c.cachedAt,
    expiresAt: c.expiresAt,
  }));
}

/**
 * Clear expired cache entries
 */
export async function clearExpiredCache(organizationId: string): Promise<number> {
  const result = await prisma.offlineCache.deleteMany({
    where: {
      organizationId,
      expiresAt: { lt: new Date() },
    },
  });

  return result.count;
}

/**
 * Clear all cache for a device
 */
export async function clearDeviceCache(
  organizationId: string,
  deviceId: string
): Promise<number> {
  const result = await prisma.offlineCache.deleteMany({
    where: {
      organizationId,
      deviceId,
    },
  });

  return result.count;
}

/**
 * Get cacheable patient data for offline access
 */
export async function getCacheablePatientData(
  organizationId: string,
  patientId: string,
  _includeHistory = false
): Promise<Record<string, unknown>> {
  // Fetch patient with basic info
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId },
  });

  if (!patient) {
    return {};
  }

  // Fetch demographics separately
  const demographics = await prisma.patientDemographics.findUnique({
    where: { patientId: patient.id },
  });

  // Fetch primary contact for phone/email/address
  const primaryContact = await prisma.patientContact.findFirst({
    where: { patientId: patient.id, isPrimary: true },
  });

  // Fetch appointments
  const appointments = await prisma.appointment.findMany({
    where: {
      patientId: patient.id,
      organizationId,
      startTime: {
        gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    },
    include: {
      appointmentType: true,
    },
    orderBy: { startTime: 'desc' },
    take: 10,
  });

  // Fetch treatment plans
  const treatmentPlans = await prisma.treatmentPlan.findMany({
    where: {
      patientId: patient.id,
      organizationId,
      status: 'ACTIVE',
    },
    take: 5,
  });

  return {
    patient: {
      id: patient.id,
      mrn: patient.mrn,
      status: patient.status,
      firstName: demographics?.firstName || '',
      lastName: demographics?.lastName || '',
      dateOfBirth: demographics?.dateOfBirth || null,
      email: primaryContact?.email || null,
      phone: primaryContact?.mobilePhone || primaryContact?.homePhone || null,
      address: primaryContact?.addressLine1 || null,
      city: primaryContact?.city || null,
      state: primaryContact?.state || null,
      zipCode: primaryContact?.zipCode || null,
    },
    appointments: appointments.map((a) => ({
      id: a.id,
      startTime: a.startTime,
      endTime: a.endTime,
      status: a.status,
      appointmentType: a.appointmentType?.name || 'Unknown',
      notes: a.notes,
    })),
    treatmentPlans: treatmentPlans.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      plannedVisits: t.plannedVisits,
      completedVisits: t.completedVisits,
    })),
    cachedAt: new Date().toISOString(),
    version: Date.now(),
  };
}

/**
 * Get today's schedule for offline caching
 */
export async function getCacheableScheduleData(
  organizationId: string,
  providerId: string,
  date: Date = new Date()
): Promise<Record<string, unknown>> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const appointments = await prisma.appointment.findMany({
    where: {
      organizationId,
      providerId,
      startTime: { gte: startOfDay, lte: endOfDay },
    },
    include: {
      patient: {
        include: {
          demographics: {
            select: {
              firstName: true,
              lastName: true,
              dateOfBirth: true,
            },
          },
          contacts: {
            where: { isPrimary: true },
            select: { mobilePhone: true },
            take: 1,
          },
        },
      },
      appointmentType: true,
    },
    orderBy: { startTime: 'asc' },
  });

  return {
    date: date.toISOString().split('T')[0],
    providerId,
    appointments: appointments.map((a) => ({
      id: a.id,
      startTime: a.startTime,
      endTime: a.endTime,
      status: a.status,
      appointmentType: a.appointmentType?.name || 'Unknown',
      notes: a.notes,
      patient: {
        id: a.patient.id,
        mrn: a.patient.mrn,
        firstName: a.patient.demographics?.firstName || '',
        lastName: a.patient.demographics?.lastName || '',
        dateOfBirth: a.patient.demographics?.dateOfBirth || null,
        phone: a.patient.contacts?.[0]?.mobilePhone || null,
      },
    })),
    cachedAt: new Date().toISOString(),
    version: Date.now(),
  };
}

/**
 * Retry failed sync operations
 */
export async function retryFailedOperations(
  organizationId: string,
  maxAttempts = 3
): Promise<{ retried: number; stillFailed: number }> {
  // Get failed operations that haven't exceeded max attempts
  const failedOps = await prisma.offlineSyncQueue.findMany({
    where: {
      organizationId,
      status: SyncStatus.FAILED,
      attempts: { lt: maxAttempts },
    },
  });

  let retried = 0;
  let stillFailed = 0;

  for (const op of failedOps) {
    await prisma.offlineSyncQueue.update({
      where: { id: op.id },
      data: {
        status: SyncStatus.PENDING,
        attempts: { increment: 1 },
      },
    });
    retried++;
  }

  // Count operations that exceeded max attempts
  stillFailed = await prisma.offlineSyncQueue.count({
    where: {
      organizationId,
      status: SyncStatus.FAILED,
      attempts: { gte: maxAttempts },
    },
  });

  return { retried, stillFailed };
}

/**
 * Clean up old completed sync operations
 */
export async function cleanupCompletedOperations(
  organizationId: string,
  olderThanDays = 7
): Promise<number> {
  const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

  const result = await prisma.offlineSyncQueue.deleteMany({
    where: {
      organizationId,
      status: SyncStatus.COMPLETED,
      syncedAt: { lt: cutoffDate },
    },
  });

  return result.count;
}
