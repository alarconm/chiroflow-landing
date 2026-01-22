/**
 * Low Stock Alert Service
 * Epic 17: Inventory & POS
 *
 * Handles low stock alerts and notifications.
 */

import { prisma } from '@/lib/prisma';
import type { Prisma, AlertStatus } from '@prisma/client';
import type { LowStockAlertInfo } from './types';

// ============================================
// Alert Queries
// ============================================

/**
 * Get all low stock alerts for organization
 */
export async function getLowStockAlerts(
  organizationId: string,
  filters: {
    status?: AlertStatus | AlertStatus[];
    categoryId?: string;
    vendorId?: string;
  } = {},
  pagination: { page: number; pageSize: number } = { page: 1, pageSize: 50 }
): Promise<{ alerts: LowStockAlertInfo[]; total: number }> {
  const where: Prisma.LowStockAlertWhereInput = { organizationId };

  if (filters.status) {
    if (Array.isArray(filters.status)) {
      where.status = { in: filters.status };
    } else {
      where.status = filters.status;
    }
  }

  if (filters.categoryId) {
    where.product = { categoryId: filters.categoryId };
  }

  if (filters.vendorId) {
    where.product = {
      ...where.product as Prisma.ProductWhereInput,
      preferredVendorId: filters.vendorId,
    };
  }

  const total = await prisma.lowStockAlert.count({ where });

  const alerts = await prisma.lowStockAlert.findMany({
    where,
    include: {
      product: {
        select: {
          name: true,
          sku: true,
          preferredVendorId: true,
          preferredVendor: { select: { name: true } },
        },
      },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    skip: (pagination.page - 1) * pagination.pageSize,
    take: pagination.pageSize,
  });

  return {
    alerts: alerts.map((alert) => ({
      id: alert.id,
      productId: alert.productId,
      productName: alert.product.name,
      productSku: alert.product.sku,
      currentQty: alert.currentQty,
      threshold: alert.threshold,
      reorderPoint: alert.reorderPoint,
      suggestedQty: alert.suggestedQty,
      status: alert.status,
      preferredVendorId: alert.product.preferredVendorId,
      preferredVendorName: alert.product.preferredVendor?.name || null,
      createdAt: alert.createdAt,
    })),
    total,
  };
}

/**
 * Get count of active alerts
 */
export async function getActiveAlertCount(organizationId: string): Promise<number> {
  return prisma.lowStockAlert.count({
    where: {
      organizationId,
      status: { in: ['ACTIVE', 'ACKNOWLEDGED'] },
    },
  });
}

/**
 * Get alerts by product
 */
export async function getAlertsByProduct(
  productId: string,
  organizationId: string
): Promise<LowStockAlertInfo[]> {
  const alerts = await prisma.lowStockAlert.findMany({
    where: { productId, organizationId },
    include: {
      product: {
        select: {
          name: true,
          sku: true,
          preferredVendorId: true,
          preferredVendor: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return alerts.map((alert) => ({
    id: alert.id,
    productId: alert.productId,
    productName: alert.product.name,
    productSku: alert.product.sku,
    currentQty: alert.currentQty,
    threshold: alert.threshold,
    reorderPoint: alert.reorderPoint,
    suggestedQty: alert.suggestedQty,
    status: alert.status,
    preferredVendorId: alert.product.preferredVendorId,
    preferredVendorName: alert.product.preferredVendor?.name || null,
    createdAt: alert.createdAt,
  }));
}

// ============================================
// Alert Actions
// ============================================

/**
 * Acknowledge an alert
 */
export async function acknowledgeAlert(
  alertId: string,
  userId: string,
  organizationId: string
): Promise<void> {
  const alert = await prisma.lowStockAlert.findFirst({
    where: { id: alertId, organizationId },
  });

  if (!alert) {
    throw new Error('Alert not found');
  }

  if (alert.status !== 'ACTIVE') {
    throw new Error('Can only acknowledge active alerts');
  }

  await prisma.lowStockAlert.update({
    where: { id: alertId },
    data: {
      status: 'ACKNOWLEDGED',
      acknowledgedAt: new Date(),
      acknowledgedBy: userId,
    },
  });
}

/**
 * Ignore an alert
 */
export async function ignoreAlert(
  alertId: string,
  userId: string,
  organizationId: string
): Promise<void> {
  const alert = await prisma.lowStockAlert.findFirst({
    where: { id: alertId, organizationId },
  });

  if (!alert) {
    throw new Error('Alert not found');
  }

  if (alert.status === 'RESOLVED' || alert.status === 'IGNORED') {
    throw new Error('Alert is already resolved or ignored');
  }

  await prisma.lowStockAlert.update({
    where: { id: alertId },
    data: {
      status: 'IGNORED',
      resolvedAt: new Date(),
      resolvedBy: userId,
    },
  });
}

/**
 * Resolve an alert (typically called when stock is replenished)
 */
export async function resolveAlert(
  alertId: string,
  userId: string,
  organizationId: string
): Promise<void> {
  const alert = await prisma.lowStockAlert.findFirst({
    where: { id: alertId, organizationId },
  });

  if (!alert) {
    throw new Error('Alert not found');
  }

  await prisma.lowStockAlert.update({
    where: { id: alertId },
    data: {
      status: 'RESOLVED',
      resolvedAt: new Date(),
      resolvedBy: userId,
    },
  });
}

/**
 * Bulk acknowledge alerts
 */
export async function bulkAcknowledgeAlerts(
  alertIds: string[],
  userId: string,
  organizationId: string
): Promise<number> {
  const result = await prisma.lowStockAlert.updateMany({
    where: {
      id: { in: alertIds },
      organizationId,
      status: 'ACTIVE',
    },
    data: {
      status: 'ACKNOWLEDGED',
      acknowledgedAt: new Date(),
      acknowledgedBy: userId,
    },
  });

  return result.count;
}

// ============================================
// Alert Generation
// ============================================

/**
 * Scan all products and generate alerts for low stock items
 * Should be run periodically (e.g., daily) or after inventory changes
 */
export async function generateLowStockAlerts(organizationId: string): Promise<number> {
  // Get all products that track inventory and are below threshold
  const lowStockProducts = await prisma.product.findMany({
    where: {
      organizationId,
      trackInventory: true,
      status: { in: ['ACTIVE', 'OUT_OF_STOCK'] },
    },
    include: {
      inventoryItems: true,
      lowStockAlerts: {
        where: { status: { in: ['ACTIVE', 'ACKNOWLEDGED'] } },
      },
    },
  });

  let alertsCreated = 0;

  for (const product of lowStockProducts) {
    // Calculate total quantity across all locations
    const totalQty = product.inventoryItems.reduce((sum, item) => sum + item.quantity, 0);

    // Check if below threshold
    if (totalQty <= product.lowStockThreshold) {
      // Check if alert already exists
      if (product.lowStockAlerts.length === 0) {
        await prisma.lowStockAlert.create({
          data: {
            productId: product.id,
            organizationId,
            currentQty: totalQty,
            threshold: product.lowStockThreshold,
            reorderPoint: product.reorderPoint,
            suggestedQty: product.reorderQuantity,
            status: 'ACTIVE',
          },
        });
        alertsCreated++;
      } else {
        // Update existing alert with current quantity
        await prisma.lowStockAlert.updateMany({
          where: {
            productId: product.id,
            organizationId,
            status: { in: ['ACTIVE', 'ACKNOWLEDGED'] },
          },
          data: { currentQty: totalQty },
        });
      }
    } else if (totalQty > product.reorderPoint) {
      // Resolve any existing alerts if stock is back above reorder point
      await prisma.lowStockAlert.updateMany({
        where: {
          productId: product.id,
          organizationId,
          status: { in: ['ACTIVE', 'ACKNOWLEDGED'] },
        },
        data: {
          status: 'RESOLVED',
          resolvedAt: new Date(),
        },
      });
    }
  }

  return alertsCreated;
}

// ============================================
// Alert Summary
// ============================================

/**
 * Get alert summary for dashboard
 */
export async function getAlertSummary(organizationId: string) {
  const [active, acknowledged, resolvedToday, ignoredToday] = await Promise.all([
    prisma.lowStockAlert.count({
      where: { organizationId, status: 'ACTIVE' },
    }),
    prisma.lowStockAlert.count({
      where: { organizationId, status: 'ACKNOWLEDGED' },
    }),
    prisma.lowStockAlert.count({
      where: {
        organizationId,
        status: 'RESOLVED',
        resolvedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
    prisma.lowStockAlert.count({
      where: {
        organizationId,
        status: 'IGNORED',
        resolvedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
  ]);

  return {
    active,
    acknowledged,
    resolvedToday,
    ignoredToday,
    totalPending: active + acknowledged,
  };
}
