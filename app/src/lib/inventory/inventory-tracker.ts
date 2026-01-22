/**
 * Inventory Tracker Service
 * Epic 17: Inventory & POS
 *
 * Handles stock levels, movements, and inventory operations.
 */

import { prisma } from '@/lib/prisma';
import type { Prisma, InventoryMovementType } from '@prisma/client';
import type {
  InventoryStockLevel,
  StockAdjustmentInput,
  StockTransferInput,
  InventoryMovementRecord,
} from './types';

// ============================================
// Stock Level Queries
// ============================================

/**
 * Get stock level for a product at all locations
 */
export async function getProductStockLevels(
  productId: string,
  organizationId: string
): Promise<InventoryStockLevel[]> {
  const items = await prisma.inventoryItem.findMany({
    where: { productId, organizationId },
    include: {
      product: {
        select: { name: true, sku: true, retailPrice: true },
      },
    },
  });

  return items.map((item) => ({
    productId: item.productId,
    productName: item.product.name,
    productSku: item.product.sku,
    location: item.storageArea,
    quantity: item.quantity,
    reservedQty: item.reservedQty,
    availableQty: item.availableQty,
    averageCost: item.averageCost,
    lastCost: item.lastCost,
    retailPrice: item.product.retailPrice,
    totalValue: item.quantity * Number(item.averageCost),
  }));
}

/**
 * Get stock level for a product at a specific location
 */
export async function getStockAtLocation(
  productId: string,
  location: string,
  organizationId: string
): Promise<InventoryStockLevel | null> {
  const item = await prisma.inventoryItem.findFirst({
    where: { productId, storageArea: location, organizationId },
    include: {
      product: {
        select: { name: true, sku: true, retailPrice: true },
      },
    },
  });

  if (!item) return null;

  return {
    productId: item.productId,
    productName: item.product.name,
    productSku: item.product.sku,
    location: item.storageArea,
    quantity: item.quantity,
    reservedQty: item.reservedQty,
    availableQty: item.availableQty,
    averageCost: item.averageCost,
    lastCost: item.lastCost,
    retailPrice: item.product.retailPrice,
    totalValue: item.quantity * Number(item.averageCost),
  };
}

/**
 * Get all stock levels for organization
 */
export async function getAllStockLevels(
  organizationId: string,
  filters: {
    location?: string;
    lowStockOnly?: boolean;
    search?: string;
  } = {},
  pagination: { page: number; pageSize: number } = { page: 1, pageSize: 50 }
): Promise<{ items: InventoryStockLevel[]; total: number }> {
  const where: Prisma.InventoryItemWhereInput = { organizationId };

  if (filters.location) {
    where.storageArea = filters.location;
  }

  if (filters.search) {
    where.product = {
      OR: [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { sku: { contains: filters.search, mode: 'insensitive' } },
      ],
    };
  }

  const total = await prisma.inventoryItem.count({ where });

  const items = await prisma.inventoryItem.findMany({
    where,
    include: {
      product: {
        select: { name: true, sku: true, retailPrice: true, lowStockThreshold: true },
      },
    },
    orderBy: { product: { name: 'asc' } },
    skip: (pagination.page - 1) * pagination.pageSize,
    take: pagination.pageSize,
  });

  let stockLevels = items.map((item) => ({
    productId: item.productId,
    productName: item.product.name,
    productSku: item.product.sku,
    location: item.storageArea,
    quantity: item.quantity,
    reservedQty: item.reservedQty,
    availableQty: item.availableQty,
    averageCost: item.averageCost,
    lastCost: item.lastCost,
    retailPrice: item.product.retailPrice,
    totalValue: item.quantity * Number(item.averageCost),
  }));

  // Filter low stock if requested
  if (filters.lowStockOnly) {
    const thresholds = new Map(items.map((item) => [item.productId, item.product.lowStockThreshold]));
    stockLevels = stockLevels.filter((level) => {
      const threshold = thresholds.get(level.productId) || 0;
      return level.availableQty <= threshold;
    });
  }

  return { items: stockLevels, total };
}

// ============================================
// Stock Adjustments
// ============================================

/**
 * Adjust stock quantity (manual adjustment)
 */
export async function adjustStock(
  input: StockAdjustmentInput,
  userId: string,
  organizationId: string,
  tx?: Prisma.TransactionClient
): Promise<string> {
  const client = tx || prisma;

  // Find or create inventory item
  let inventoryItem = await client.inventoryItem.findFirst({
    where: {
      productId: input.productId,
      storageArea: input.location,
      organizationId,
    },
  });

  if (!inventoryItem) {
    inventoryItem = await client.inventoryItem.create({
      data: {
        productId: input.productId,
        storageArea: input.location,
        quantity: 0,
        reservedQty: 0,
        availableQty: 0,
        organizationId,
      },
    });
  }

  // Calculate new quantity
  const newQuantity = inventoryItem.quantity + input.quantity;
  if (newQuantity < 0) {
    throw new Error('Cannot adjust stock below zero');
  }

  const newAvailable = newQuantity - inventoryItem.reservedQty;

  // Update inventory item
  await client.inventoryItem.update({
    where: { id: inventoryItem.id },
    data: {
      quantity: newQuantity,
      availableQty: newAvailable,
    },
  });

  // Determine movement type
  const movementType: InventoryMovementType = input.quantity >= 0 ? 'ADJUSTMENT_UP' : 'ADJUSTMENT_DOWN';

  // Create movement record
  const movement = await client.inventoryMovement.create({
    data: {
      productId: input.productId,
      movementType,
      quantity: input.quantity,
      referenceType: 'adjustment',
      notes: `${input.reason}${input.notes ? ': ' + input.notes : ''}`,
      createdBy: userId,
      organizationId,
      toStorageArea: input.location,
    },
  });

  // Check if this resolves a low stock alert
  await checkAndResolveAlert(input.productId, newQuantity, userId, organizationId, client);

  return movement.id;
}

/**
 * Transfer stock between locations
 */
export async function transferStock(
  input: StockTransferInput,
  userId: string,
  organizationId: string,
  tx?: Prisma.TransactionClient
): Promise<string> {
  const client = tx || prisma;

  if (input.quantity <= 0) {
    throw new Error('Transfer quantity must be positive');
  }

  if (input.fromLocation === input.toLocation) {
    throw new Error('Cannot transfer to the same location');
  }

  // Get source inventory
  const sourceItem = await client.inventoryItem.findFirst({
    where: {
      productId: input.productId,
      storageArea: input.fromLocation,
      organizationId,
    },
  });

  if (!sourceItem) {
    throw new Error('No inventory found at source location');
  }

  if (sourceItem.availableQty < input.quantity) {
    throw new Error(`Insufficient available stock. Available: ${sourceItem.availableQty}`);
  }

  // Get or create destination inventory
  let destItem = await client.inventoryItem.findFirst({
    where: {
      productId: input.productId,
      storageArea: input.toLocation,
      organizationId,
    },
  });

  if (!destItem) {
    destItem = await client.inventoryItem.create({
      data: {
        productId: input.productId,
        storageArea: input.toLocation,
        quantity: 0,
        reservedQty: 0,
        availableQty: 0,
        averageCost: sourceItem.averageCost,
        lastCost: sourceItem.lastCost,
        organizationId,
      },
    });
  }

  // Update source (decrease)
  await client.inventoryItem.update({
    where: { id: sourceItem.id },
    data: {
      quantity: sourceItem.quantity - input.quantity,
      availableQty: sourceItem.availableQty - input.quantity,
    },
  });

  // Update destination (increase)
  await client.inventoryItem.update({
    where: { id: destItem.id },
    data: {
      quantity: destItem.quantity + input.quantity,
      availableQty: destItem.availableQty + input.quantity,
    },
  });

  // Create movement records
  await client.inventoryMovement.create({
    data: {
      productId: input.productId,
      movementType: 'TRANSFER_OUT',
      quantity: -input.quantity,
      fromStorageArea: input.fromLocation,
      toStorageArea: input.toLocation,
      referenceType: 'transfer',
      notes: input.notes,
      createdBy: userId,
      organizationId,
    },
  });

  const transferIn = await client.inventoryMovement.create({
    data: {
      productId: input.productId,
      movementType: 'TRANSFER_IN',
      quantity: input.quantity,
      fromStorageArea: input.fromLocation,
      toStorageArea: input.toLocation,
      referenceType: 'transfer',
      notes: input.notes,
      createdBy: userId,
      organizationId,
    },
  });

  return transferIn.id;
}

// ============================================
// Stock Updates (Internal)
// ============================================

/**
 * Record stock purchase (from receiving PO)
 */
export async function recordPurchase(
  productId: string,
  quantity: number,
  unitCost: number,
  location: string,
  referenceId: string,
  userId: string,
  organizationId: string,
  tx: Prisma.TransactionClient
): Promise<void> {
  // Get or create inventory item
  let inventoryItem = await tx.inventoryItem.findFirst({
    where: { productId, storageArea: location, organizationId },
  });

  if (!inventoryItem) {
    inventoryItem = await tx.inventoryItem.create({
      data: {
        productId,
        storageArea: location,
        quantity: 0,
        reservedQty: 0,
        availableQty: 0,
        averageCost: unitCost,
        lastCost: unitCost,
        organizationId,
      },
    });
  }

  // Calculate weighted average cost
  const totalOldValue = inventoryItem.quantity * Number(inventoryItem.averageCost);
  const totalNewValue = quantity * unitCost;
  const newQuantity = inventoryItem.quantity + quantity;
  const newAverageCost = newQuantity > 0 ? (totalOldValue + totalNewValue) / newQuantity : unitCost;

  // Update inventory
  await tx.inventoryItem.update({
    where: { id: inventoryItem.id },
    data: {
      quantity: newQuantity,
      availableQty: newQuantity - inventoryItem.reservedQty,
      averageCost: newAverageCost,
      lastCost: unitCost,
    },
  });

  // Create movement record
  await tx.inventoryMovement.create({
    data: {
      productId,
      movementType: 'PURCHASE',
      quantity,
      unitCost,
      totalCost: quantity * unitCost,
      toStorageArea: location,
      referenceType: 'purchase_order',
      referenceId,
      createdBy: userId,
      organizationId,
    },
  });

  // Check if this resolves a low stock alert
  await checkAndResolveAlert(productId, newQuantity, userId, organizationId, tx);
}

/**
 * Record stock sale (from POS)
 */
export async function recordSale(
  productId: string,
  quantity: number,
  location: string,
  referenceId: string,
  userId: string,
  organizationId: string,
  tx: Prisma.TransactionClient
): Promise<number> {
  const inventoryItem = await tx.inventoryItem.findFirst({
    where: { productId, storageArea: location, organizationId },
  });

  if (!inventoryItem) {
    throw new Error('Product not found in inventory');
  }

  if (inventoryItem.availableQty < quantity) {
    throw new Error(`Insufficient stock. Available: ${inventoryItem.availableQty}`);
  }

  const unitCost = Number(inventoryItem.averageCost);
  const newQuantity = inventoryItem.quantity - quantity;
  const newAvailable = inventoryItem.availableQty - quantity;

  // Update inventory
  await tx.inventoryItem.update({
    where: { id: inventoryItem.id },
    data: {
      quantity: newQuantity,
      availableQty: newAvailable,
    },
  });

  // Create movement record
  await tx.inventoryMovement.create({
    data: {
      productId,
      movementType: 'SALE',
      quantity: -quantity,
      unitCost,
      totalCost: quantity * unitCost,
      fromStorageArea: location,
      referenceType: 'sale',
      referenceId,
      createdBy: userId,
      organizationId,
    },
  });

  // Check for low stock alert
  await checkAndCreateAlert(productId, newQuantity, organizationId, tx);

  return unitCost;
}

/**
 * Reverse a sale (for void/refund)
 */
export async function reverseSale(
  productId: string,
  quantity: number,
  location: string,
  referenceId: string,
  userId: string,
  organizationId: string,
  tx: Prisma.TransactionClient
): Promise<void> {
  const inventoryItem = await tx.inventoryItem.findFirst({
    where: { productId, storageArea: location, organizationId },
  });

  if (!inventoryItem) {
    throw new Error('Product not found in inventory');
  }

  const newQuantity = inventoryItem.quantity + quantity;
  const newAvailable = inventoryItem.availableQty + quantity;

  // Update inventory
  await tx.inventoryItem.update({
    where: { id: inventoryItem.id },
    data: {
      quantity: newQuantity,
      availableQty: newAvailable,
    },
  });

  // Create movement record
  await tx.inventoryMovement.create({
    data: {
      productId,
      movementType: 'VOID_SALE',
      quantity,
      unitCost: Number(inventoryItem.averageCost),
      totalCost: quantity * Number(inventoryItem.averageCost),
      toStorageArea: location,
      referenceType: 'sale_void',
      referenceId,
      createdBy: userId,
      organizationId,
    },
  });

  // Check if this resolves a low stock alert
  await checkAndResolveAlert(productId, newQuantity, userId, organizationId, tx);
}

// ============================================
// Movement History
// ============================================

/**
 * Get movement history for a product
 */
export async function getMovementHistory(
  productId: string,
  organizationId: string,
  pagination: { page: number; pageSize: number } = { page: 1, pageSize: 50 }
): Promise<{ movements: InventoryMovementRecord[]; total: number }> {
  const where = { productId, organizationId };

  const total = await prisma.inventoryMovement.count({ where });

  const movements = await prisma.inventoryMovement.findMany({
    where,
    include: {
      product: { select: { name: true, sku: true } },
    },
    orderBy: { createdAt: 'desc' },
    skip: (pagination.page - 1) * pagination.pageSize,
    take: pagination.pageSize,
  });

  return {
    movements: movements.map((m) => ({
      id: m.id,
      productId: m.productId,
      productName: m.product.name,
      productSku: m.product.sku,
      movementType: m.movementType,
      quantity: m.quantity,
      unitCost: m.unitCost,
      totalCost: m.totalCost,
      fromLocation: m.fromStorageArea,
      toLocation: m.toStorageArea,
      referenceType: m.referenceType,
      referenceId: m.referenceId,
      notes: m.notes,
      createdBy: m.createdBy,
      createdAt: m.createdAt,
    })),
    total,
  };
}

// ============================================
// Alert Helpers
// ============================================

async function checkAndCreateAlert(
  productId: string,
  currentQty: number,
  organizationId: string,
  tx: Prisma.TransactionClient
): Promise<void> {
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { lowStockThreshold: true, reorderPoint: true, reorderQuantity: true, trackInventory: true },
  });

  if (!product || !product.trackInventory) return;

  if (currentQty <= product.lowStockThreshold) {
    // Check if active alert already exists
    const existingAlert = await tx.lowStockAlert.findFirst({
      where: {
        productId,
        organizationId,
        status: { in: ['ACTIVE', 'ACKNOWLEDGED'] },
      },
    });

    if (!existingAlert) {
      await tx.lowStockAlert.create({
        data: {
          productId,
          organizationId,
          currentQty,
          threshold: product.lowStockThreshold,
          reorderPoint: product.reorderPoint,
          suggestedQty: product.reorderQuantity,
          status: 'ACTIVE',
        },
      });
    }
  }
}

async function checkAndResolveAlert(
  productId: string,
  currentQty: number,
  userId: string,
  organizationId: string,
  tx: Prisma.TransactionClient
): Promise<void> {
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { reorderPoint: true },
  });

  if (!product) return;

  // If stock is above reorder point, resolve any active alerts
  if (currentQty > product.reorderPoint) {
    await tx.lowStockAlert.updateMany({
      where: {
        productId,
        organizationId,
        status: { in: ['ACTIVE', 'ACKNOWLEDGED'] },
      },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolvedBy: userId,
      },
    });
  }
}
