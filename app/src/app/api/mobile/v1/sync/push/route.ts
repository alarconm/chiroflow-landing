import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  mobileErrorResponse,
  mobileSuccessResponse,
  withMobileAuth,
} from '@/lib/mobile-auth';
import { withMobileRateLimit } from '@/lib/mobile-rate-limit';
import { SyncOperationType, SyncStatus, Prisma } from '@prisma/client';

interface SyncOperation {
  clientId: string;
  operationType: 'CREATE' | 'UPDATE' | 'DELETE';
  entityType: string;
  entityId?: string;
  payload: Record<string, unknown>;
  queuedAt?: string;
}

async function syncPushHandler(
  req: NextRequest,
  context: { user: { id: string; organizationId: string } }
) {
  try {
    const { user } = context;
    const body = await req.json();
    const { operations, deviceId } = body as { operations: SyncOperation[]; deviceId?: string };

    if (!operations || !Array.isArray(operations)) {
      return mobileErrorResponse('Operations array is required', 400);
    }

    const results: Array<{
      clientId: string;
      status: 'success' | 'conflict' | 'error';
      serverId?: string;
      error?: string;
    }> = [];

    for (const op of operations) {
      if (!op.clientId || !op.operationType || !op.entityType) {
        results.push({
          clientId: op.clientId || 'unknown',
          status: 'error',
          error: 'Missing required fields: clientId, operationType, entityType',
        });
        continue;
      }

      try {
        // Check if already processed (idempotency)
        const existing = await prisma.offlineSyncQueue.findUnique({
          where: {
            clientId_organizationId: {
              clientId: op.clientId,
              organizationId: user.organizationId,
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
        const syncItem = await prisma.offlineSyncQueue.upsert({
          where: {
            clientId_organizationId: {
              clientId: op.clientId,
              organizationId: user.organizationId,
            },
          },
          create: {
            clientId: op.clientId,
            operationType: op.operationType as SyncOperationType,
            entityType: op.entityType,
            entityId: op.entityId,
            payload: (op.payload || {}) as Prisma.InputJsonValue,
            status: 'PENDING' as SyncStatus,
            deviceId,
            queuedAt: op.queuedAt ? new Date(op.queuedAt) : new Date(),
            organizationId: user.organizationId,
          },
          update: {
            operationType: op.operationType as SyncOperationType,
            payload: (op.payload || {}) as Prisma.InputJsonValue,
            status: 'PENDING' as SyncStatus,
            attempts: { increment: 1 },
            lastAttemptAt: new Date(),
          },
        });

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

    return mobileSuccessResponse({
      processed: results.filter((r) => r.status === 'success').length,
      conflicts: results.filter((r) => r.status === 'conflict').length,
      errors: results.filter((r) => r.status === 'error').length,
      results,
    });
  } catch (error) {
    console.error('Sync push error:', error);
    return mobileErrorResponse('Sync push failed', 500);
  }
}

export const POST = withMobileRateLimit('sync/push')(withMobileAuth(syncPushHandler));
