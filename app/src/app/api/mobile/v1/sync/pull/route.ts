import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  mobileErrorResponse,
  mobileSuccessResponse,
  withMobileAuth,
} from '@/lib/mobile-auth';
import { withMobileRateLimit } from '@/lib/mobile-rate-limit';

async function syncPullHandler(
  req: NextRequest,
  context: { user: { id: string; organizationId: string } }
) {
  try {
    const { user } = context;
    const { searchParams } = new URL(req.url);

    const since = searchParams.get('since');
    const entityTypesParam = searchParams.get('entityTypes');
    const limitParam = searchParams.get('limit');

    const entityTypes = entityTypesParam ? entityTypesParam.split(',') : undefined;
    const limit = Math.min(Math.max(parseInt(limitParam || '100', 10), 1), 500);

    const changes: Array<{
      entityType: string;
      entityId: string;
      operation: 'create' | 'update' | 'delete';
      data: unknown;
      timestamp: string;
    }> = [];

    // Get synced items
    const syncedItems = await prisma.offlineSyncQueue.findMany({
      where: {
        organizationId: user.organizationId,
        status: 'COMPLETED',
        ...(since && { syncedAt: { gt: new Date(since) } }),
        ...(entityTypes && entityTypes.length > 0 && { entityType: { in: entityTypes } }),
      },
      take: limit,
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

    return mobileSuccessResponse({
      changes,
      hasMore: syncedItems.length === limit,
      serverTimestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Sync pull error:', error);
    return mobileErrorResponse('Sync pull failed', 500);
  }
}

export const GET = withMobileRateLimit('sync/pull')(withMobileAuth(syncPullHandler));
