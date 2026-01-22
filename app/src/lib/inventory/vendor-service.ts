/**
 * Vendor Management Service
 * Epic 17: Inventory & POS
 *
 * Handles vendor/supplier and purchase order operations.
 */

import { prisma } from '@/lib/prisma';
import type { Prisma, PurchaseOrderStatus } from '@prisma/client';
import type {
  VendorCreateInput,
  VendorUpdateInput,
  VendorWithProducts,
  PurchaseOrderCreateInput,
  PurchaseOrderUpdateInput,
  ReceiveItemInput,
  PurchaseOrderSummary,
} from './types';
import { recordPurchase } from './inventory-tracker';

// ============================================
// Vendor CRUD
// ============================================

/**
 * Create a new vendor
 */
export async function createVendor(
  data: VendorCreateInput,
  organizationId: string,
  tx?: Prisma.TransactionClient
): Promise<string> {
  const client = tx || prisma;

  // Check for duplicate code if provided
  if (data.code) {
    const existing = await client.vendor.findFirst({
      where: { code: data.code, organizationId },
    });
    if (existing) {
      throw new Error(`Vendor with code "${data.code}" already exists`);
    }
  }

  const vendor = await client.vendor.create({
    data: {
      name: data.name,
      code: data.code,
      isActive: data.isActive ?? true,
      contactName: data.contactName,
      email: data.email,
      phone: data.phone,
      fax: data.fax,
      website: data.website,
      addressLine1: data.addressLine1,
      addressLine2: data.addressLine2,
      city: data.city,
      state: data.state,
      zipCode: data.zipCode,
      country: data.country ?? 'US',
      paymentTerms: data.paymentTerms,
      creditLimit: data.creditLimit,
      accountNumber: data.accountNumber,
      taxId: data.taxId,
      notes: data.notes,
      organizationId,
    },
  });

  return vendor.id;
}

/**
 * Update a vendor
 */
export async function updateVendor(
  data: VendorUpdateInput,
  organizationId: string,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const client = tx || prisma;

  const existing = await client.vendor.findFirst({
    where: { id: data.id, organizationId },
  });
  if (!existing) {
    throw new Error('Vendor not found');
  }

  // Check for duplicate code if changing
  if (data.code && data.code !== existing.code) {
    const duplicate = await client.vendor.findFirst({
      where: { code: data.code, organizationId, id: { not: data.id } },
    });
    if (duplicate) {
      throw new Error(`Vendor with code "${data.code}" already exists`);
    }
  }

  const { id, ...updateData } = data;

  await client.vendor.update({
    where: { id },
    data: updateData,
  });
}

/**
 * Delete a vendor (soft delete by deactivating)
 */
export async function deleteVendor(
  vendorId: string,
  organizationId: string,
  hardDelete = false,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const client = tx || prisma;

  const vendor = await client.vendor.findFirst({
    where: { id: vendorId, organizationId },
    include: {
      purchaseOrders: { take: 1 },
      vendorProducts: { take: 1 },
    },
  });

  if (!vendor) {
    throw new Error('Vendor not found');
  }

  if (vendor.purchaseOrders.length > 0 || vendor.vendorProducts.length > 0) {
    if (hardDelete) {
      throw new Error('Cannot delete vendor with purchase orders or product associations');
    }
    // Soft delete
    await client.vendor.update({
      where: { id: vendorId },
      data: { isActive: false },
    });
  } else if (hardDelete) {
    await client.vendor.delete({
      where: { id: vendorId },
    });
  } else {
    await client.vendor.update({
      where: { id: vendorId },
      data: { isActive: false },
    });
  }
}

/**
 * Get a single vendor
 */
export async function getVendor(vendorId: string, organizationId: string) {
  const vendor = await prisma.vendor.findFirst({
    where: { id: vendorId, organizationId },
    include: {
      vendorProducts: {
        include: { product: true },
        where: { isActive: true },
      },
      _count: {
        select: {
          purchaseOrders: true,
          vendorProducts: true,
        },
      },
    },
  });

  if (!vendor) {
    throw new Error('Vendor not found');
  }

  return vendor;
}

/**
 * List vendors
 */
export async function listVendors(
  organizationId: string,
  filters: {
    search?: string;
    isActive?: boolean;
  } = {},
  pagination: { page: number; pageSize: number } = { page: 1, pageSize: 50 }
): Promise<{ vendors: VendorWithProducts[]; total: number }> {
  const where: Prisma.VendorWhereInput = { organizationId };

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { code: { contains: filters.search, mode: 'insensitive' } },
      { contactName: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  if (filters.isActive !== undefined) {
    where.isActive = filters.isActive;
  }

  const total = await prisma.vendor.count({ where });

  const vendors = await prisma.vendor.findMany({
    where,
    include: {
      _count: {
        select: {
          vendorProducts: { where: { isActive: true } },
          purchaseOrders: { where: { status: { in: ['DRAFT', 'SUBMITTED', 'CONFIRMED', 'PARTIAL'] } } },
        },
      },
    },
    orderBy: { name: 'asc' },
    skip: (pagination.page - 1) * pagination.pageSize,
    take: pagination.pageSize,
  });

  return {
    vendors: vendors.map((v) => ({
      id: v.id,
      name: v.name,
      code: v.code,
      isActive: v.isActive,
      contactName: v.contactName,
      email: v.email,
      phone: v.phone,
      website: v.website,
      notes: v.notes,
      paymentTerms: v.paymentTerms,
      taxId: v.taxId,
      addressLine1: v.addressLine1,
      addressLine2: v.addressLine2,
      city: v.city,
      state: v.state,
      zipCode: v.zipCode,
      country: v.country,
      productCount: v._count.vendorProducts,
      openPOCount: v._count.purchaseOrders,
    })),
    total,
  };
}

// ============================================
// Purchase Order Management
// ============================================

/**
 * Create a purchase order
 */
export async function createPurchaseOrder(
  data: PurchaseOrderCreateInput,
  userId: string,
  organizationId: string
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    // Verify vendor exists
    const vendor = await tx.vendor.findFirst({
      where: { id: data.vendorId, organizationId },
    });
    if (!vendor) {
      throw new Error('Vendor not found');
    }

    // Generate PO number
    const poNumber = await generatePONumber(organizationId, tx);

    // Calculate totals
    let subtotal = 0;
    const lineItems: Array<{
      productId: string;
      lineNumber: number;
      orderedQty: number;
      unitCost: number;
      totalCost: number;
      notes: string | null;
    }> = [];

    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];

      // Verify product exists
      const product = await tx.product.findFirst({
        where: { id: item.productId, organizationId },
      });
      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }

      const totalCost = item.unitCost * item.orderedQty;
      subtotal += totalCost;

      lineItems.push({
        productId: item.productId,
        lineNumber: i + 1,
        orderedQty: item.orderedQty,
        unitCost: item.unitCost,
        totalCost,
        notes: item.notes || null,
      });
    }

    const shippingCost = data.shippingCost ?? 0;
    const totalAmount = subtotal + shippingCost;

    // Create purchase order
    const po = await tx.purchaseOrder.create({
      data: {
        poNumber,
        status: 'DRAFT',
        vendorId: data.vendorId,
        orderDate: new Date(),
        expectedDate: data.expectedDate,
        subtotal,
        shippingCost,
        totalAmount,
        shipToAddress: data.shipToAddress,
        shippingMethod: data.shippingMethod,
        notes: data.notes,
        internalNotes: data.internalNotes,
        createdBy: userId,
        organizationId,
        items: {
          create: lineItems,
        },
      },
    });

    return po.id;
  });
}

/**
 * Update a purchase order (only draft orders)
 */
export async function updatePurchaseOrder(
  data: PurchaseOrderUpdateInput,
  organizationId: string,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const client = tx || prisma;

  const po = await client.purchaseOrder.findFirst({
    where: { id: data.id, organizationId },
  });

  if (!po) {
    throw new Error('Purchase order not found');
  }

  if (po.status !== 'DRAFT') {
    throw new Error('Can only update draft purchase orders');
  }

  const { id, ...updateData } = data;

  // Recalculate total if shipping cost changed
  if (updateData.shippingCost !== undefined) {
    updateData.shippingCost = updateData.shippingCost;
    // totalAmount will be recalculated based on items + shipping
  }

  await client.purchaseOrder.update({
    where: { id },
    data: updateData,
  });
}

/**
 * Submit a purchase order (change from DRAFT to SUBMITTED)
 */
export async function submitPurchaseOrder(
  poId: string,
  organizationId: string
): Promise<void> {
  const po = await prisma.purchaseOrder.findFirst({
    where: { id: poId, organizationId },
  });

  if (!po) {
    throw new Error('Purchase order not found');
  }

  if (po.status !== 'DRAFT') {
    throw new Error('Can only submit draft purchase orders');
  }

  await prisma.purchaseOrder.update({
    where: { id: poId },
    data: { status: 'SUBMITTED' },
  });
}

/**
 * Receive items from a purchase order
 */
export async function receivePurchaseOrderItems(
  poId: string,
  items: ReceiveItemInput[],
  userId: string,
  organizationId: string
): Promise<void> {
  return prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findFirst({
      where: { id: poId, organizationId },
      include: { items: true },
    });

    if (!po) {
      throw new Error('Purchase order not found');
    }

    if (!['SUBMITTED', 'CONFIRMED', 'PARTIAL'].includes(po.status)) {
      throw new Error('Purchase order is not in a receivable status');
    }

    // Process each received item
    for (const receiveItem of items) {
      const poItem = po.items.find((i) => i.id === receiveItem.purchaseOrderItemId);
      if (!poItem) {
        throw new Error(`Purchase order item not found: ${receiveItem.purchaseOrderItemId}`);
      }

      const remainingQty = poItem.orderedQty - poItem.receivedQty;
      if (receiveItem.receivedQty > remainingQty) {
        throw new Error(`Cannot receive more than ordered. Remaining: ${remainingQty}`);
      }

      // Update PO item
      const newReceivedQty = poItem.receivedQty + receiveItem.receivedQty;
      await tx.purchaseOrderItem.update({
        where: { id: poItem.id },
        data: { receivedQty: newReceivedQty },
      });

      // Record inventory purchase
      const unitCost = receiveItem.unitCost ?? Number(poItem.unitCost);
      const location = receiveItem.location ?? 'main';

      await recordPurchase(
        poItem.productId,
        receiveItem.receivedQty,
        unitCost,
        location,
        poId,
        userId,
        organizationId,
        tx
      );
    }

    // Update PO status
    const updatedPO = await tx.purchaseOrder.findUnique({
      where: { id: poId },
      include: { items: true },
    });

    if (!updatedPO) return;

    const allReceived = updatedPO.items.every((i) => i.receivedQty >= i.orderedQty);
    const someReceived = updatedPO.items.some((i) => i.receivedQty > 0);

    let newStatus: PurchaseOrderStatus = po.status;
    if (allReceived) {
      newStatus = 'RECEIVED';
    } else if (someReceived) {
      newStatus = 'PARTIAL';
    }

    await tx.purchaseOrder.update({
      where: { id: poId },
      data: {
        status: newStatus,
        receivedDate: allReceived ? new Date() : undefined,
      },
    });
  });
}

/**
 * Cancel a purchase order
 */
export async function cancelPurchaseOrder(
  poId: string,
  organizationId: string
): Promise<void> {
  const po = await prisma.purchaseOrder.findFirst({
    where: { id: poId, organizationId },
  });

  if (!po) {
    throw new Error('Purchase order not found');
  }

  if (['RECEIVED', 'CANCELLED'].includes(po.status)) {
    throw new Error('Cannot cancel a received or already cancelled purchase order');
  }

  await prisma.purchaseOrder.update({
    where: { id: poId },
    data: { status: 'CANCELLED' },
  });
}

/**
 * Get a single purchase order
 */
export async function getPurchaseOrder(poId: string, organizationId: string) {
  const po = await prisma.purchaseOrder.findFirst({
    where: { id: poId, organizationId },
    include: {
      vendor: true,
      items: {
        include: { product: true },
        orderBy: { lineNumber: 'asc' },
      },
    },
  });

  if (!po) {
    throw new Error('Purchase order not found');
  }

  return po;
}

/**
 * List purchase orders
 */
export async function listPurchaseOrders(
  organizationId: string,
  filters: {
    status?: PurchaseOrderStatus | PurchaseOrderStatus[];
    vendorId?: string;
    startDate?: Date;
    endDate?: Date;
    search?: string;
  } = {},
  pagination: { page: number; pageSize: number } = { page: 1, pageSize: 50 }
): Promise<{ orders: PurchaseOrderSummary[]; total: number }> {
  const where: Prisma.PurchaseOrderWhereInput = { organizationId };

  if (filters.status) {
    if (Array.isArray(filters.status)) {
      where.status = { in: filters.status };
    } else {
      where.status = filters.status;
    }
  }

  if (filters.vendorId) {
    where.vendorId = filters.vendorId;
  }

  if (filters.startDate || filters.endDate) {
    where.orderDate = {};
    if (filters.startDate) {
      where.orderDate.gte = filters.startDate;
    }
    if (filters.endDate) {
      where.orderDate.lte = filters.endDate;
    }
  }

  if (filters.search) {
    where.OR = [
      { poNumber: { contains: filters.search, mode: 'insensitive' } },
      { vendor: { name: { contains: filters.search, mode: 'insensitive' } } },
    ];
  }

  const total = await prisma.purchaseOrder.count({ where });

  const orders = await prisma.purchaseOrder.findMany({
    where,
    include: {
      vendor: { select: { name: true } },
      items: { select: { orderedQty: true, receivedQty: true } },
    },
    orderBy: { orderDate: 'desc' },
    skip: (pagination.page - 1) * pagination.pageSize,
    take: pagination.pageSize,
  });

  return {
    orders: orders.map((po) => ({
      id: po.id,
      poNumber: po.poNumber,
      status: po.status,
      vendorName: po.vendor.name,
      orderDate: po.orderDate,
      expectedDate: po.expectedDate,
      totalAmount: po.totalAmount,
      itemCount: po.items.reduce((sum, i) => sum + i.orderedQty, 0),
      receivedCount: po.items.reduce((sum, i) => sum + i.receivedQty, 0),
    })),
    total,
  };
}

// ============================================
// Helpers
// ============================================

/**
 * Generate a unique PO number
 */
async function generatePONumber(
  organizationId: string,
  tx: Prisma.TransactionClient
): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');

  // Count POs for today
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);

  const count = await tx.purchaseOrder.count({
    where: {
      organizationId,
      orderDate: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
  });

  const sequence = String(count + 1).padStart(3, '0');
  return `PO-${dateStr}-${sequence}`;
}

/**
 * Get vendor product info (for ordering)
 */
export async function getVendorProductInfo(
  vendorId: string,
  productId: string,
  organizationId: string
) {
  const vendorProduct = await prisma.vendorProduct.findFirst({
    where: {
      vendorId,
      productId,
      vendor: { organizationId },
      isActive: true,
    },
    include: {
      product: { select: { name: true, sku: true } },
    },
  });

  return vendorProduct;
}

/**
 * Link a product to a vendor
 */
export async function linkProductToVendor(
  productId: string,
  vendorId: string,
  data: {
    vendorSku?: string;
    vendorPrice: number;
    minOrderQty?: number;
    leadTimeDays?: number;
  },
  organizationId: string
): Promise<void> {
  // Verify product and vendor belong to org
  const [product, vendor] = await Promise.all([
    prisma.product.findFirst({ where: { id: productId, organizationId } }),
    prisma.vendor.findFirst({ where: { id: vendorId, organizationId } }),
  ]);

  if (!product) throw new Error('Product not found');
  if (!vendor) throw new Error('Vendor not found');

  await prisma.vendorProduct.upsert({
    where: {
      productId_vendorId: { productId, vendorId },
    },
    create: {
      productId,
      vendorId,
      vendorSku: data.vendorSku,
      vendorPrice: data.vendorPrice,
      minOrderQty: data.minOrderQty ?? 1,
      leadTimeDays: data.leadTimeDays,
      isActive: true,
    },
    update: {
      vendorSku: data.vendorSku,
      vendorPrice: data.vendorPrice,
      minOrderQty: data.minOrderQty,
      leadTimeDays: data.leadTimeDays,
      isActive: true,
    },
  });
}

/**
 * Unlink a product from a vendor
 */
export async function unlinkProductFromVendor(
  productId: string,
  vendorId: string,
  organizationId: string
): Promise<void> {
  const vendorProduct = await prisma.vendorProduct.findFirst({
    where: {
      productId,
      vendorId,
      vendor: { organizationId },
    },
  });

  if (!vendorProduct) {
    throw new Error('Product-vendor link not found');
  }

  await prisma.vendorProduct.update({
    where: { id: vendorProduct.id },
    data: { isActive: false },
  });
}
