/**
 * Inter-Location Inventory Router
 * Epic 25: Multi-Location Enterprise - US-254
 *
 * Handles inventory transfers between locations, per-location stock tracking,
 * low stock alerts by location, and consolidated inventory reporting.
 */

import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog, type AuditAction } from '@/lib/audit';
import { TransferStatus, InventoryMovementType } from '@prisma/client';

// ============================================
// Audit Action Types
// ============================================

const AUDIT_ACTIONS = {
  TRANSFER_CREATE: 'INVENTORY_TRANSFER_CREATE' as AuditAction,
  TRANSFER_APPROVE: 'INVENTORY_TRANSFER_APPROVE' as AuditAction,
  TRANSFER_REJECT: 'INVENTORY_TRANSFER_REJECT' as AuditAction,
  TRANSFER_SHIP: 'INVENTORY_TRANSFER_SHIP' as AuditAction,
  TRANSFER_RECEIVE: 'INVENTORY_TRANSFER_RECEIVE' as AuditAction,
  TRANSFER_CANCEL: 'INVENTORY_TRANSFER_CANCEL' as AuditAction,
  TRANSFER_UPDATE: 'INVENTORY_TRANSFER_UPDATE' as AuditAction,
  LOW_STOCK_ALERT_CREATE: 'INVENTORY_LOW_STOCK_ALERT_CREATE' as AuditAction,
  LOW_STOCK_ALERT_RESOLVE: 'INVENTORY_LOW_STOCK_ALERT_RESOLVE' as AuditAction,
  VALUE_REPORT_VIEW: 'INVENTORY_VALUE_REPORT_VIEW' as AuditAction,
};

// ============================================
// Input Schemas
// ============================================

const transferItemSchema = z.object({
  productId: z.string(),
  requestedQty: z.number().int().min(1),
  unitCost: z.number().min(0),
  notes: z.string().optional(),
});

const createTransferSchema = z.object({
  fromLocationId: z.string(),
  toLocationId: z.string(),
  items: z.array(transferItemSchema).min(1),
  requestNotes: z.string().optional(),
  priority: z.number().int().min(0).max(2).default(0),
  expectedShipDate: z.date().optional(),
  expectedArrivalDate: z.date().optional(),
});

const approveItemSchema = z.object({
  transferItemId: z.string(),
  approvedQty: z.number().int().min(0),
});

const approveTransferSchema = z.object({
  transferId: z.string(),
  items: z.array(approveItemSchema).optional(),
  approvalNotes: z.string().optional(),
});

const rejectTransferSchema = z.object({
  transferId: z.string(),
  rejectionReason: z.string().min(1),
});

const shipTransferSchema = z.object({
  transferId: z.string(),
  items: z.array(z.object({
    transferItemId: z.string(),
    shippedQty: z.number().int().min(0),
  })).optional(),
  trackingNumber: z.string().optional(),
  shippingMethod: z.string().optional(),
  shippingCost: z.number().min(0).optional(),
});

const receiveItemSchema = z.object({
  transferItemId: z.string(),
  receivedQty: z.number().int().min(0),
  conditionNotes: z.string().optional(),
});

const receiveTransferSchema = z.object({
  transferId: z.string(),
  items: z.array(receiveItemSchema),
  receivingNotes: z.string().optional(),
});

const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
});

// ============================================
// Helper Functions
// ============================================

async function generateTransferNumber(
  prisma: typeof import('@/lib/prisma').prisma,
  organizationId: string
): Promise<string> {
  const count = await prisma.inventoryTransfer.count({
    where: { organizationId },
  });
  const paddedNumber = String(count + 1).padStart(5, '0');
  return `TRN-${paddedNumber}`;
}

// ============================================
// Router Definition
// ============================================

export const interLocationInventoryRouter = router({
  // ============================================
  // Transfer Request Procedures
  // ============================================

  /**
   * Create a new inventory transfer request
   */
  transfer: adminProcedure
    .input(createTransferSchema)
    .mutation(async ({ ctx, input }) => {
      const { fromLocationId, toLocationId, items, requestNotes, priority, expectedShipDate, expectedArrivalDate } = input;

      // Validate locations
      const [fromLocation, toLocation] = await Promise.all([
        ctx.prisma.location.findFirst({
          where: { id: fromLocationId, organizationId: ctx.user.organizationId, isActive: true, deletedAt: null },
        }),
        ctx.prisma.location.findFirst({
          where: { id: toLocationId, organizationId: ctx.user.organizationId, isActive: true, deletedAt: null },
        }),
      ]);

      if (!fromLocation) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Source location not found' });
      }
      if (!toLocation) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Destination location not found' });
      }
      if (fromLocationId === toLocationId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Source and destination locations must be different' });
      }

      // Validate products and check availability
      const productIds = items.map(item => item.productId);
      const products = await ctx.prisma.product.findMany({
        where: {
          id: { in: productIds },
          organizationId: ctx.user.organizationId,
          status: 'ACTIVE',
        },
        include: {
          inventoryItems: {
            where: { locationId: fromLocationId },
          },
        },
      });

      if (products.length !== productIds.length) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'One or more products not found or inactive' });
      }

      // Check stock availability at source location
      for (const item of items) {
        const product = products.find(p => p.id === item.productId);
        const inventoryItem = product?.inventoryItems[0];
        const availableQty = inventoryItem?.availableQty ?? 0;

        if (availableQty < item.requestedQty) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Insufficient stock for ${product?.name}. Available: ${availableQty}, Requested: ${item.requestedQty}`,
          });
        }
      }

      // Generate transfer number
      const transferNumber = await generateTransferNumber(ctx.prisma, ctx.user.organizationId);

      // Create transfer with items
      const transfer = await ctx.prisma.$transaction(async (tx) => {
        const newTransfer = await tx.inventoryTransfer.create({
          data: {
            transferNumber,
            status: 'PENDING',
            requestNotes,
            priority,
            expectedShipDate,
            expectedArrivalDate,
            fromLocationId,
            toLocationId,
            requestedById: ctx.user.id,
            organizationId: ctx.user.organizationId,
            items: {
              create: items.map(item => ({
                productId: item.productId,
                requestedQty: item.requestedQty,
                unitCost: item.unitCost,
                totalCost: item.requestedQty * item.unitCost,
                notes: item.notes,
              })),
            },
          },
          include: {
            items: { include: { product: true } },
            fromLocation: true,
            toLocation: true,
          },
        });

        // Reserve stock at source location
        for (const item of items) {
          const inventoryItem = await tx.inventoryItem.findFirst({
            where: {
              productId: item.productId,
              locationId: fromLocationId,
              organizationId: ctx.user.organizationId,
            },
          });

          if (inventoryItem) {
            await tx.inventoryItem.update({
              where: { id: inventoryItem.id },
              data: {
                reservedQty: { increment: item.requestedQty },
                availableQty: { decrement: item.requestedQty },
              },
            });
          }
        }

        return newTransfer;
      });

      await auditLog(AUDIT_ACTIONS.TRANSFER_CREATE, 'InventoryTransfer', {
        entityId: transfer.id,
        changes: {
          transferNumber,
          fromLocation: fromLocation.name,
          toLocation: toLocation.name,
          itemCount: items.length,
          priority,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return transfer;
    }),

  /**
   * Approve a pending transfer request
   */
  approveTransfer: adminProcedure
    .input(approveTransferSchema)
    .mutation(async ({ ctx, input }) => {
      const { transferId, items, approvalNotes } = input;

      const transfer = await ctx.prisma.inventoryTransfer.findFirst({
        where: {
          id: transferId,
          organizationId: ctx.user.organizationId,
        },
        include: { items: true },
      });

      if (!transfer) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Transfer not found' });
      }

      if (transfer.status !== 'PENDING') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot approve transfer with status ${transfer.status}`,
        });
      }

      const result = await ctx.prisma.$transaction(async (tx) => {
        // Update item quantities if provided, otherwise approve all requested quantities
        if (items && items.length > 0) {
          for (const itemUpdate of items) {
            const transferItem = transfer.items.find(i => i.id === itemUpdate.transferItemId);
            if (!transferItem) continue;

            await tx.inventoryTransferItem.update({
              where: { id: itemUpdate.transferItemId },
              data: {
                approvedQty: itemUpdate.approvedQty,
                totalCost: itemUpdate.approvedQty * Number(transferItem.unitCost),
              },
            });

            // Adjust reservation if approved qty differs from requested
            if (itemUpdate.approvedQty !== transferItem.requestedQty) {
              const diff = transferItem.requestedQty - itemUpdate.approvedQty;
              if (diff > 0) {
                const inventoryItem = await tx.inventoryItem.findFirst({
                  where: {
                    productId: transferItem.productId,
                    locationId: transfer.fromLocationId,
                    organizationId: ctx.user.organizationId,
                  },
                });

                if (inventoryItem) {
                  await tx.inventoryItem.update({
                    where: { id: inventoryItem.id },
                    data: {
                      reservedQty: { decrement: diff },
                      availableQty: { increment: diff },
                    },
                  });
                }
              }
            }
          }
        } else {
          // Approve all items with their requested quantities
          await tx.inventoryTransferItem.updateMany({
            where: { transferId },
            data: { approvedQty: undefined }, // Will be set individually
          });

          for (const item of transfer.items) {
            await tx.inventoryTransferItem.update({
              where: { id: item.id },
              data: { approvedQty: item.requestedQty },
            });
          }
        }

        return tx.inventoryTransfer.update({
          where: { id: transferId },
          data: {
            status: 'APPROVED',
            approvedAt: new Date(),
            approvedById: ctx.user.id,
            approvalNotes,
          },
          include: {
            items: { include: { product: true } },
            fromLocation: true,
            toLocation: true,
          },
        });
      });

      await auditLog(AUDIT_ACTIONS.TRANSFER_APPROVE, 'InventoryTransfer', {
        entityId: transferId,
        changes: { approvalNotes },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return result;
    }),

  /**
   * Reject a pending transfer request
   */
  rejectTransfer: adminProcedure
    .input(rejectTransferSchema)
    .mutation(async ({ ctx, input }) => {
      const { transferId, rejectionReason } = input;

      const transfer = await ctx.prisma.inventoryTransfer.findFirst({
        where: {
          id: transferId,
          organizationId: ctx.user.organizationId,
        },
        include: { items: true },
      });

      if (!transfer) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Transfer not found' });
      }

      if (transfer.status !== 'PENDING') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot reject transfer with status ${transfer.status}`,
        });
      }

      const result = await ctx.prisma.$transaction(async (tx) => {
        // Release reserved stock
        for (const item of transfer.items) {
          const inventoryItem = await tx.inventoryItem.findFirst({
            where: {
              productId: item.productId,
              locationId: transfer.fromLocationId,
              organizationId: ctx.user.organizationId,
            },
          });

          if (inventoryItem) {
            await tx.inventoryItem.update({
              where: { id: inventoryItem.id },
              data: {
                reservedQty: { decrement: item.requestedQty },
                availableQty: { increment: item.requestedQty },
              },
            });
          }
        }

        return tx.inventoryTransfer.update({
          where: { id: transferId },
          data: {
            status: 'REJECTED',
            rejectionReason,
            approvedById: ctx.user.id, // Using approvedBy to record who processed it
            approvedAt: new Date(),
          },
          include: {
            items: { include: { product: true } },
            fromLocation: true,
            toLocation: true,
          },
        });
      });

      await auditLog(AUDIT_ACTIONS.TRANSFER_REJECT, 'InventoryTransfer', {
        entityId: transferId,
        changes: { rejectionReason },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return result;
    }),

  /**
   * Ship items for an approved transfer
   */
  shipTransfer: adminProcedure
    .input(shipTransferSchema)
    .mutation(async ({ ctx, input }) => {
      const { transferId, items, trackingNumber, shippingMethod, shippingCost } = input;

      const transfer = await ctx.prisma.inventoryTransfer.findFirst({
        where: {
          id: transferId,
          organizationId: ctx.user.organizationId,
        },
        include: { items: true },
      });

      if (!transfer) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Transfer not found' });
      }

      if (transfer.status !== 'APPROVED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot ship transfer with status ${transfer.status}`,
        });
      }

      const result = await ctx.prisma.$transaction(async (tx) => {
        // Update shipped quantities and create inventory movements
        for (const item of transfer.items) {
          const itemUpdate = items?.find(i => i.transferItemId === item.id);
          const shippedQty = itemUpdate?.shippedQty ?? (item.approvedQty ?? item.requestedQty);

          await tx.inventoryTransferItem.update({
            where: { id: item.id },
            data: { shippedQty },
          });

          // Deduct from source location inventory
          const inventoryItem = await tx.inventoryItem.findFirst({
            where: {
              productId: item.productId,
              locationId: transfer.fromLocationId,
              organizationId: ctx.user.organizationId,
            },
          });

          if (inventoryItem) {
            await tx.inventoryItem.update({
              where: { id: inventoryItem.id },
              data: {
                quantity: { decrement: shippedQty },
                reservedQty: { decrement: item.requestedQty }, // Release full reservation
              },
            });
          }

          // Create outbound movement record
          await tx.inventoryMovement.create({
            data: {
              productId: item.productId,
              movementType: 'TRANSFER_OUT',
              quantity: -shippedQty,
              unitCost: Number(item.unitCost),
              totalCost: shippedQty * Number(item.unitCost),
              referenceType: 'inventory_transfer',
              referenceId: transferId,
              fromLocationId: transfer.fromLocationId,
              toLocationId: transfer.toLocationId,
              locationId: transfer.fromLocationId,
              notes: `Transfer ${transfer.transferNumber} to ${transfer.toLocationId}`,
              createdBy: ctx.user.id,
              organizationId: ctx.user.organizationId,
            },
          });
        }

        return tx.inventoryTransfer.update({
          where: { id: transferId },
          data: {
            status: 'IN_TRANSIT',
            shippedAt: new Date(),
            trackingNumber,
            shippingMethod,
            shippingCost,
          },
          include: {
            items: { include: { product: true } },
            fromLocation: true,
            toLocation: true,
          },
        });
      });

      await auditLog(AUDIT_ACTIONS.TRANSFER_SHIP, 'InventoryTransfer', {
        entityId: transferId,
        changes: { trackingNumber, shippingMethod },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return result;
    }),

  /**
   * Receive items from a transfer
   */
  receiveTransfer: adminProcedure
    .input(receiveTransferSchema)
    .mutation(async ({ ctx, input }) => {
      const { transferId, items, receivingNotes } = input;

      const transfer = await ctx.prisma.inventoryTransfer.findFirst({
        where: {
          id: transferId,
          organizationId: ctx.user.organizationId,
        },
        include: { items: { include: { product: true } } },
      });

      if (!transfer) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Transfer not found' });
      }

      if (transfer.status !== 'IN_TRANSIT') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot receive transfer with status ${transfer.status}`,
        });
      }

      const result = await ctx.prisma.$transaction(async (tx) => {
        let allFullyReceived = true;
        let anyReceived = false;

        for (const itemInput of items) {
          const transferItem = transfer.items.find(i => i.id === itemInput.transferItemId);
          if (!transferItem) continue;

          const shippedQty = transferItem.shippedQty ?? 0;
          if (itemInput.receivedQty !== shippedQty) {
            allFullyReceived = false;
          }
          if (itemInput.receivedQty > 0) {
            anyReceived = true;
          }

          await tx.inventoryTransferItem.update({
            where: { id: itemInput.transferItemId },
            data: {
              receivedQty: itemInput.receivedQty,
              conditionNotes: itemInput.conditionNotes,
            },
          });

          if (itemInput.receivedQty > 0) {
            // Get or create inventory item at destination
            let inventoryItem = await tx.inventoryItem.findFirst({
              where: {
                productId: transferItem.productId,
                locationId: transfer.toLocationId,
                organizationId: ctx.user.organizationId,
              },
            });

            if (!inventoryItem) {
              inventoryItem = await tx.inventoryItem.create({
                data: {
                  productId: transferItem.productId,
                  locationId: transfer.toLocationId,
                  quantity: 0,
                  reservedQty: 0,
                  availableQty: 0,
                  averageCost: Number(transferItem.unitCost),
                  lastCost: Number(transferItem.unitCost),
                  organizationId: ctx.user.organizationId,
                },
              });
            }

            // Update destination inventory with weighted average cost
            const totalOldValue = inventoryItem.quantity * Number(inventoryItem.averageCost);
            const totalNewValue = itemInput.receivedQty * Number(transferItem.unitCost);
            const newQuantity = inventoryItem.quantity + itemInput.receivedQty;
            const newAverageCost = newQuantity > 0 ? (totalOldValue + totalNewValue) / newQuantity : Number(transferItem.unitCost);

            await tx.inventoryItem.update({
              where: { id: inventoryItem.id },
              data: {
                quantity: newQuantity,
                availableQty: newQuantity - inventoryItem.reservedQty,
                averageCost: newAverageCost,
                lastCost: Number(transferItem.unitCost),
              },
            });

            // Create inbound movement record
            await tx.inventoryMovement.create({
              data: {
                productId: transferItem.productId,
                movementType: 'TRANSFER_IN',
                quantity: itemInput.receivedQty,
                unitCost: Number(transferItem.unitCost),
                totalCost: itemInput.receivedQty * Number(transferItem.unitCost),
                referenceType: 'inventory_transfer',
                referenceId: transferId,
                fromLocationId: transfer.fromLocationId,
                toLocationId: transfer.toLocationId,
                locationId: transfer.toLocationId,
                notes: `Transfer ${transfer.transferNumber} from ${transfer.fromLocationId}`,
                createdBy: ctx.user.id,
                organizationId: ctx.user.organizationId,
              },
            });
          }
        }

        const newStatus: TransferStatus = allFullyReceived ? 'RECEIVED' : anyReceived ? 'PARTIAL' : 'IN_TRANSIT';

        return tx.inventoryTransfer.update({
          where: { id: transferId },
          data: {
            status: newStatus,
            receivedAt: newStatus !== 'IN_TRANSIT' ? new Date() : undefined,
            completedAt: newStatus === 'RECEIVED' ? new Date() : undefined,
            receivedById: ctx.user.id,
            receivingNotes,
          },
          include: {
            items: { include: { product: true } },
            fromLocation: true,
            toLocation: true,
          },
        });
      });

      await auditLog(AUDIT_ACTIONS.TRANSFER_RECEIVE, 'InventoryTransfer', {
        entityId: transferId,
        changes: { status: result.status, receivingNotes },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return result;
    }),

  /**
   * Cancel a pending or approved transfer
   */
  cancelTransfer: adminProcedure
    .input(z.object({ transferId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const transfer = await ctx.prisma.inventoryTransfer.findFirst({
        where: {
          id: input.transferId,
          organizationId: ctx.user.organizationId,
        },
        include: { items: true },
      });

      if (!transfer) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Transfer not found' });
      }

      if (!['PENDING', 'APPROVED'].includes(transfer.status)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot cancel transfer with status ${transfer.status}`,
        });
      }

      const result = await ctx.prisma.$transaction(async (tx) => {
        // Release reserved stock
        for (const item of transfer.items) {
          const inventoryItem = await tx.inventoryItem.findFirst({
            where: {
              productId: item.productId,
              locationId: transfer.fromLocationId,
              organizationId: ctx.user.organizationId,
            },
          });

          if (inventoryItem) {
            await tx.inventoryItem.update({
              where: { id: inventoryItem.id },
              data: {
                reservedQty: { decrement: item.requestedQty },
                availableQty: { increment: item.requestedQty },
              },
            });
          }
        }

        return tx.inventoryTransfer.update({
          where: { id: input.transferId },
          data: { status: 'CANCELLED' },
          include: {
            items: { include: { product: true } },
            fromLocation: true,
            toLocation: true,
          },
        });
      });

      await auditLog(AUDIT_ACTIONS.TRANSFER_CANCEL, 'InventoryTransfer', {
        entityId: input.transferId,
        changes: { previousStatus: transfer.status },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return result;
    }),

  // ============================================
  // Transfer Query Procedures
  // ============================================

  /**
   * Get a single transfer by ID
   */
  getTransfer: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const transfer = await ctx.prisma.inventoryTransfer.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.user.organizationId,
        },
        include: {
          items: { include: { product: true } },
          fromLocation: true,
          toLocation: true,
          requestedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          approvedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          receivedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      if (!transfer) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Transfer not found' });
      }

      return transfer;
    }),

  /**
   * List transfers with filtering
   */
  listTransfers: protectedProcedure
    .input(z.object({
      status: z.union([z.nativeEnum(TransferStatus), z.array(z.nativeEnum(TransferStatus))]).optional(),
      fromLocationId: z.string().optional(),
      toLocationId: z.string().optional(),
      locationId: z.string().optional(), // Either from or to
      startDate: z.date().optional(),
      endDate: z.date().optional(),
      search: z.string().optional(),
      ...paginationSchema.shape,
    }))
    .query(async ({ ctx, input }) => {
      const { page, pageSize, status, fromLocationId, toLocationId, locationId, startDate, endDate, search } = input;

      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
      };

      if (status) {
        where.status = Array.isArray(status) ? { in: status } : status;
      }

      if (fromLocationId) {
        where.fromLocationId = fromLocationId;
      }

      if (toLocationId) {
        where.toLocationId = toLocationId;
      }

      if (locationId) {
        where.OR = [
          { fromLocationId: locationId },
          { toLocationId: locationId },
        ];
      }

      if (startDate || endDate) {
        where.requestedAt = {
          ...(startDate && { gte: startDate }),
          ...(endDate && { lte: endDate }),
        };
      }

      if (search) {
        where.transferNumber = { contains: search, mode: 'insensitive' };
      }

      const [transfers, total] = await Promise.all([
        ctx.prisma.inventoryTransfer.findMany({
          where,
          include: {
            items: { include: { product: { select: { name: true, sku: true } } } },
            fromLocation: { select: { id: true, name: true, code: true } },
            toLocation: { select: { id: true, name: true, code: true } },
            requestedBy: { select: { firstName: true, lastName: true } },
          },
          orderBy: { requestedAt: 'desc' },
          take: pageSize,
          skip: (page - 1) * pageSize,
        }),
        ctx.prisma.inventoryTransfer.count({ where }),
      ]);

      return {
        transfers,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    }),

  /**
   * Get transfer history for a product
   */
  getProductTransferHistory: protectedProcedure
    .input(z.object({
      productId: z.string(),
      ...paginationSchema.shape,
    }))
    .query(async ({ ctx, input }) => {
      const { productId, page, pageSize } = input;

      const [items, total] = await Promise.all([
        ctx.prisma.inventoryTransferItem.findMany({
          where: {
            productId,
            transfer: { organizationId: ctx.user.organizationId },
          },
          include: {
            transfer: {
              include: {
                fromLocation: { select: { name: true, code: true } },
                toLocation: { select: { name: true, code: true } },
              },
            },
          },
          orderBy: { transfer: { requestedAt: 'desc' } },
          take: pageSize,
          skip: (page - 1) * pageSize,
        }),
        ctx.prisma.inventoryTransferItem.count({
          where: {
            productId,
            transfer: { organizationId: ctx.user.organizationId },
          },
        }),
      ]);

      return { items, total, page, pageSize };
    }),

  // ============================================
  // Inventory by Location Procedures
  // ============================================

  /**
   * Get inventory levels at a specific location
   */
  getInventoryByLocation: protectedProcedure
    .input(z.object({
      locationId: z.string(),
      search: z.string().optional(),
      categoryId: z.string().optional(),
      lowStockOnly: z.boolean().optional(),
      ...paginationSchema.shape,
    }))
    .query(async ({ ctx, input }) => {
      const { locationId, search, categoryId, lowStockOnly, page, pageSize } = input;

      // Verify location access
      const location = await ctx.prisma.location.findFirst({
        where: {
          id: locationId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!location) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Location not found' });
      }

      const where: Record<string, unknown> = {
        locationId,
        organizationId: ctx.user.organizationId,
      };

      if (search) {
        where.product = {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { sku: { contains: search, mode: 'insensitive' } },
            { barcode: { contains: search, mode: 'insensitive' } },
          ],
        };
      }

      if (categoryId) {
        where.product = { ...((where.product as Record<string, unknown>) || {}), categoryId };
      }

      if (lowStockOnly) {
        where.quantity = { lte: ctx.prisma.inventoryItem.fields.quantity }; // Will use threshold in having
      }

      const [items, total] = await Promise.all([
        ctx.prisma.inventoryItem.findMany({
          where,
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                barcode: true,
                retailPrice: true,
                costPrice: true,
                lowStockThreshold: true,
                reorderPoint: true,
                category: { select: { name: true } },
              },
            },
          },
          orderBy: { product: { name: 'asc' } },
          take: pageSize,
          skip: (page - 1) * pageSize,
        }),
        ctx.prisma.inventoryItem.count({ where }),
      ]);

      // Filter low stock if needed
      const filteredItems = lowStockOnly
        ? items.filter(item => item.quantity <= item.product.lowStockThreshold)
        : items;

      return {
        items: filteredItems,
        total: lowStockOnly ? filteredItems.length : total,
        location,
        page,
        pageSize,
      };
    }),

  /**
   * Get inventory summary across all locations
   */
  getInventorySummaryByLocation: protectedProcedure
    .input(z.object({ productId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const locations = await ctx.prisma.location.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          isActive: true,
          deletedAt: null,
        },
        include: {
          inventoryItems: {
            where: input.productId ? { productId: input.productId } : {},
            include: {
              product: { select: { name: true, sku: true, retailPrice: true } },
            },
          },
        },
      });

      return locations.map(location => {
        const totalQty = location.inventoryItems.reduce((sum, item) => sum + item.quantity, 0);
        const totalValue = location.inventoryItems.reduce(
          (sum, item) => sum + item.quantity * Number(item.averageCost),
          0
        );
        const retailValue = location.inventoryItems.reduce(
          (sum, item) => sum + item.quantity * Number(item.product.retailPrice),
          0
        );

        return {
          location: { id: location.id, name: location.name, code: location.code },
          totalQuantity: totalQty,
          totalCostValue: totalValue,
          totalRetailValue: retailValue,
          itemCount: location.inventoryItems.length,
          items: input.productId ? location.inventoryItems : undefined,
        };
      });
    }),

  // ============================================
  // Low Stock Alert Procedures
  // ============================================

  /**
   * Get low stock alerts by location
   */
  getLowStockAlertsByLocation: protectedProcedure
    .input(z.object({
      locationId: z.string().optional(),
      includeResolved: z.boolean().default(false),
      ...paginationSchema.shape,
    }))
    .query(async ({ ctx, input }) => {
      const { locationId, includeResolved, page, pageSize } = input;

      const where: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
      };

      if (locationId) {
        where.locationId = locationId;
      }

      if (!includeResolved) {
        where.status = { in: ['ACTIVE', 'ACKNOWLEDGED'] };
      }

      const [alerts, total] = await Promise.all([
        ctx.prisma.lowStockAlert.findMany({
          where,
          include: {
            product: { select: { name: true, sku: true } },
            location: { select: { name: true, code: true } },
          },
          orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
          take: pageSize,
          skip: (page - 1) * pageSize,
        }),
        ctx.prisma.lowStockAlert.count({ where }),
      ]);

      return { alerts, total, page, pageSize };
    }),

  /**
   * Create low stock alert for a location
   */
  createLowStockAlert: adminProcedure
    .input(z.object({
      productId: z.string(),
      locationId: z.string(),
      currentQty: z.number().int(),
      threshold: z.number().int(),
      reorderPoint: z.number().int(),
      suggestedQty: z.number().int(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check for existing active alert
      const existing = await ctx.prisma.lowStockAlert.findFirst({
        where: {
          productId: input.productId,
          locationId: input.locationId,
          organizationId: ctx.user.organizationId,
          status: { in: ['ACTIVE', 'ACKNOWLEDGED'] },
        },
      });

      if (existing) {
        // Update existing alert
        return ctx.prisma.lowStockAlert.update({
          where: { id: existing.id },
          data: { currentQty: input.currentQty },
        });
      }

      const alert = await ctx.prisma.lowStockAlert.create({
        data: {
          ...input,
          organizationId: ctx.user.organizationId,
        },
        include: {
          product: { select: { name: true, sku: true } },
          location: { select: { name: true } },
        },
      });

      await auditLog(AUDIT_ACTIONS.LOW_STOCK_ALERT_CREATE, 'LowStockAlert', {
        entityId: alert.id,
        changes: { productId: input.productId, locationId: input.locationId },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return alert;
    }),

  /**
   * Check and create low stock alerts for all products at a location
   */
  checkLowStockByLocation: adminProcedure
    .input(z.object({ locationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const inventoryItems = await ctx.prisma.inventoryItem.findMany({
        where: {
          locationId: input.locationId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              lowStockThreshold: true,
              reorderPoint: true,
              reorderQuantity: true,
            },
          },
        },
      });

      const alertsCreated: string[] = [];

      for (const item of inventoryItems) {
        if (item.quantity <= item.product.lowStockThreshold) {
          // Check for existing active alert
          const existing = await ctx.prisma.lowStockAlert.findFirst({
            where: {
              productId: item.productId,
              locationId: input.locationId,
              organizationId: ctx.user.organizationId,
              status: { in: ['ACTIVE', 'ACKNOWLEDGED'] },
            },
          });

          if (!existing) {
            const alert = await ctx.prisma.lowStockAlert.create({
              data: {
                productId: item.productId,
                locationId: input.locationId,
                currentQty: item.quantity,
                threshold: item.product.lowStockThreshold,
                reorderPoint: item.product.reorderPoint,
                suggestedQty: item.product.reorderQuantity,
                organizationId: ctx.user.organizationId,
              },
            });
            alertsCreated.push(alert.id);
          }
        }
      }

      return { alertsCreated: alertsCreated.length };
    }),

  // ============================================
  // Consolidated Reporting Procedures
  // ============================================

  /**
   * Get consolidated inventory value report across all locations
   */
  getConsolidatedInventoryValue: protectedProcedure
    .input(z.object({
      locationIds: z.array(z.string()).optional(),
      categoryId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { locationIds, categoryId } = input;

      const locations = await ctx.prisma.location.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          isActive: true,
          deletedAt: null,
          ...(locationIds && { id: { in: locationIds } }),
        },
      });

      const productWhere: Record<string, unknown> = {
        organizationId: ctx.user.organizationId,
        status: 'ACTIVE',
      };
      if (categoryId) {
        productWhere.categoryId = categoryId;
      }

      const locationReports = await Promise.all(
        locations.map(async (location) => {
          const inventoryItems = await ctx.prisma.inventoryItem.findMany({
            where: {
              locationId: location.id,
              organizationId: ctx.user.organizationId,
              product: productWhere,
            },
            include: {
              product: { select: { name: true, sku: true, retailPrice: true, categoryId: true } },
            },
          });

          const totalCostValue = inventoryItems.reduce(
            (sum, item) => sum + item.quantity * Number(item.averageCost),
            0
          );
          const totalRetailValue = inventoryItems.reduce(
            (sum, item) => sum + item.quantity * Number(item.product.retailPrice),
            0
          );
          const totalUnits = inventoryItems.reduce((sum, item) => sum + item.quantity, 0);

          return {
            location: { id: location.id, name: location.name, code: location.code },
            totalCostValue,
            totalRetailValue,
            totalUnits,
            potentialProfit: totalRetailValue - totalCostValue,
            productCount: inventoryItems.length,
            topProducts: inventoryItems
              .sort((a, b) => b.quantity * Number(b.averageCost) - a.quantity * Number(a.averageCost))
              .slice(0, 5)
              .map(item => ({
                name: item.product.name,
                sku: item.product.sku,
                quantity: item.quantity,
                value: item.quantity * Number(item.averageCost),
              })),
          };
        })
      );

      const totals = locationReports.reduce(
        (acc, loc) => ({
          totalCostValue: acc.totalCostValue + loc.totalCostValue,
          totalRetailValue: acc.totalRetailValue + loc.totalRetailValue,
          totalUnits: acc.totalUnits + loc.totalUnits,
        }),
        { totalCostValue: 0, totalRetailValue: 0, totalUnits: 0 }
      );

      await auditLog(AUDIT_ACTIONS.VALUE_REPORT_VIEW, 'InventoryValueReport', {
        changes: { locationCount: locations.length },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return {
        locations: locationReports,
        totals: {
          ...totals,
          potentialProfit: totals.totalRetailValue - totals.totalCostValue,
          locationCount: locations.length,
        },
        generatedAt: new Date(),
      };
    }),

  /**
   * Compare inventory levels between locations
   */
  compareLocationInventory: protectedProcedure
    .input(z.object({
      locationIds: z.array(z.string()).min(2).max(10),
      productIds: z.array(z.string()).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { locationIds, productIds } = input;

      // Get locations
      const locations = await ctx.prisma.location.findMany({
        where: {
          id: { in: locationIds },
          organizationId: ctx.user.organizationId,
        },
      });

      if (locations.length !== locationIds.length) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'One or more locations not found' });
      }

      // Get inventory data
      const inventoryItems = await ctx.prisma.inventoryItem.findMany({
        where: {
          locationId: { in: locationIds },
          organizationId: ctx.user.organizationId,
          ...(productIds && { productId: { in: productIds } }),
        },
        include: {
          product: { select: { id: true, name: true, sku: true } },
          location: { select: { id: true, name: true } },
        },
      });

      // Group by product
      const productMap = new Map<string, { product: { id: string; name: string; sku: string }; locations: Record<string, { quantity: number; value: number }> }>();

      for (const item of inventoryItems) {
        if (!item.locationId) continue; // Skip items without location

        if (!productMap.has(item.productId)) {
          productMap.set(item.productId, {
            product: item.product,
            locations: {},
          });
        }

        const entry = productMap.get(item.productId)!;
        entry.locations[item.locationId] = {
          quantity: item.quantity,
          value: item.quantity * Number(item.averageCost),
        };
      }

      return {
        locations: locations.map(l => ({ id: l.id, name: l.name })),
        products: Array.from(productMap.values()).map(entry => ({
          ...entry.product,
          byLocation: entry.locations,
          totalQuantity: Object.values(entry.locations).reduce((sum, loc) => sum + loc.quantity, 0),
          totalValue: Object.values(entry.locations).reduce((sum, loc) => sum + loc.value, 0),
        })),
      };
    }),

  /**
   * Get transfer statistics by location
   */
  getTransferStatsByLocation: protectedProcedure
    .input(z.object({
      startDate: z.date(),
      endDate: z.date(),
      locationId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { startDate, endDate, locationId } = input;

      const baseWhere = {
        organizationId: ctx.user.organizationId,
        requestedAt: { gte: startDate, lte: endDate },
      };

      // Get all locations
      const locations = await ctx.prisma.location.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          isActive: true,
          ...(locationId && { id: locationId }),
        },
      });

      const stats = await Promise.all(
        locations.map(async (location) => {
          const [outgoing, incoming] = await Promise.all([
            ctx.prisma.inventoryTransfer.aggregate({
              where: { ...baseWhere, fromLocationId: location.id },
              _count: true,
            }),
            ctx.prisma.inventoryTransfer.aggregate({
              where: { ...baseWhere, toLocationId: location.id },
              _count: true,
            }),
          ]);

          const [completedOutgoing, completedIncoming] = await Promise.all([
            ctx.prisma.inventoryTransfer.aggregate({
              where: { ...baseWhere, fromLocationId: location.id, status: 'RECEIVED' },
              _count: true,
            }),
            ctx.prisma.inventoryTransfer.aggregate({
              where: { ...baseWhere, toLocationId: location.id, status: 'RECEIVED' },
              _count: true,
            }),
          ]);

          // Get total value transferred
          const [outgoingValue, incomingValue] = await Promise.all([
            ctx.prisma.inventoryTransferItem.aggregate({
              where: {
                transfer: { ...baseWhere, fromLocationId: location.id, status: 'RECEIVED' },
              },
              _sum: { totalCost: true },
            }),
            ctx.prisma.inventoryTransferItem.aggregate({
              where: {
                transfer: { ...baseWhere, toLocationId: location.id, status: 'RECEIVED' },
              },
              _sum: { totalCost: true },
            }),
          ]);

          return {
            location: { id: location.id, name: location.name, code: location.code },
            outgoing: {
              total: outgoing._count,
              completed: completedOutgoing._count,
              totalValue: Number(outgoingValue._sum.totalCost) || 0,
            },
            incoming: {
              total: incoming._count,
              completed: completedIncoming._count,
              totalValue: Number(incomingValue._sum.totalCost) || 0,
            },
          };
        })
      );

      return {
        stats,
        period: { startDate, endDate },
        totals: stats.reduce(
          (acc, s) => ({
            outgoingTotal: acc.outgoingTotal + s.outgoing.total,
            outgoingCompleted: acc.outgoingCompleted + s.outgoing.completed,
            outgoingValue: acc.outgoingValue + s.outgoing.totalValue,
            incomingTotal: acc.incomingTotal + s.incoming.total,
            incomingCompleted: acc.incomingCompleted + s.incoming.completed,
            incomingValue: acc.incomingValue + s.incoming.totalValue,
          }),
          {
            outgoingTotal: 0,
            outgoingCompleted: 0,
            outgoingValue: 0,
            incomingTotal: 0,
            incomingCompleted: 0,
            incomingValue: 0,
          }
        ),
      };
    }),
});
