/**
 * Inventory Router
 * Epic 17: Inventory & POS
 *
 * Handles inventory management, products, vendors, and POS operations.
 */

import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog, type AuditAction } from '@/lib/audit';
import {
  ProductStatus,
  PurchaseOrderStatus,
  SaleStatus,
  AlertStatus,
  POSPaymentMethod,
} from '@prisma/client';
import {
  // Product & Category
  createProduct,
  updateProduct,
  deleteProduct,
  getProduct,
  listProducts,
  createCategory,
  updateCategory,
  deleteCategory,
  listCategoriesTree,
  listCategories,
  generateSku,
  generateSlug,
  // Inventory
  getProductStockLevels,
  getAllStockLevels,
  adjustStock,
  transferStock,
  getMovementHistory,
  // Barcode
  validateBarcode,
  lookupBarcode,
  // Alerts
  getLowStockAlerts,
  getActiveAlertCount,
  acknowledgeAlert,
  ignoreAlert,
  bulkAcknowledgeAlerts,
  getAlertSummary,
  // POS
  createSale,
  completeSale,
  voidSale,
  getSale,
  listSales,
  buildCart,
  getSalesReportSummary,
  getProductSalesReport,
  getDailySalesReport,
  getTodaysSalesSummary,
  // Vendors
  createVendor,
  updateVendor,
  deleteVendor,
  getVendor,
  listVendors,
  createPurchaseOrder,
  updatePurchaseOrder,
  submitPurchaseOrder,
  receivePurchaseOrderItems,
  cancelPurchaseOrder,
  getPurchaseOrder,
  listPurchaseOrders,
  linkProductToVendor,
  unlinkProductFromVendor,
  // Types
  type ProductUpdateInput,
  type CategoryUpdateInput,
  type VendorUpdateInput,
} from '@/lib/inventory';

// ============================================
// Audit Action Types
// ============================================

const INVENTORY_AUDIT_ACTIONS = {
  PRODUCT_CREATE: 'INVENTORY_CREATE' as AuditAction,
  PRODUCT_UPDATE: 'INVENTORY_UPDATE' as AuditAction,
  PRODUCT_DELETE: 'INVENTORY_DELETE' as AuditAction,
  STOCK_ADJUST: 'INVENTORY_UPDATE' as AuditAction,
  STOCK_TRANSFER: 'INVENTORY_UPDATE' as AuditAction,
  SALE_CREATE: 'BILLING_CREATE' as AuditAction,
  SALE_COMPLETE: 'BILLING_UPDATE' as AuditAction,
  SALE_VOID: 'BILLING_UPDATE' as AuditAction,
  PO_CREATE: 'INVENTORY_CREATE' as AuditAction,
  PO_RECEIVE: 'INVENTORY_UPDATE' as AuditAction,
  VENDOR_CREATE: 'INVENTORY_CREATE' as AuditAction,
  VENDOR_UPDATE: 'INVENTORY_UPDATE' as AuditAction,
};

// ============================================
// Input Schemas
// ============================================

const productCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  sku: z.string().min(1).max(50),
  barcode: z.string().max(50).optional(),
  status: z.nativeEnum(ProductStatus).default('ACTIVE'),
  costPrice: z.number().min(0).default(0),
  retailPrice: z.number().min(0),
  isTaxable: z.boolean().default(true),
  taxRate: z.number().min(0).max(1).optional(),
  weight: z.number().min(0).optional(),
  weightUnit: z.string().default('oz'),
  dimensions: z.string().optional(),
  trackInventory: z.boolean().default(true),
  lowStockThreshold: z.number().int().min(0).default(5),
  reorderPoint: z.number().int().min(0).default(10),
  reorderQuantity: z.number().int().min(1).default(25),
  brand: z.string().optional(),
  manufacturer: z.string().optional(),
  notes: z.string().optional(),
  imageUrl: z.string().url().optional(),
  categoryId: z.string().optional(),
  preferredVendorId: z.string().optional(),
});

const productUpdateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  sku: z.string().min(1).max(50).optional(),
  barcode: z.string().max(50).nullable().optional(),
  status: z.nativeEnum(ProductStatus).optional(),
  costPrice: z.number().min(0).optional(),
  retailPrice: z.number().min(0).optional(),
  isTaxable: z.boolean().optional(),
  taxRate: z.number().min(0).max(1).nullable().optional(),
  weight: z.number().min(0).nullable().optional(),
  weightUnit: z.string().optional(),
  dimensions: z.string().nullable().optional(),
  trackInventory: z.boolean().optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  reorderPoint: z.number().int().min(0).optional(),
  reorderQuantity: z.number().int().min(1).optional(),
  brand: z.string().nullable().optional(),
  manufacturer: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  preferredVendorId: z.string().nullable().optional(),
});

const categoryCreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  slug: z.string().min(1).max(100),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
  parentId: z.string().optional(),
});

const categoryUpdateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().nullable().optional(),
  slug: z.string().min(1).max(100).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  parentId: z.string().nullable().optional(),
});

const vendorCreateSchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().max(20).optional(),
  isActive: z.boolean().default(true),
  contactName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  fax: z.string().optional(),
  website: z.string().url().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  country: z.string().default('US'),
  paymentTerms: z.string().optional(),
  creditLimit: z.number().min(0).optional(),
  accountNumber: z.string().optional(),
  taxId: z.string().optional(),
  notes: z.string().optional(),
});

const vendorUpdateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(255).optional(),
  code: z.string().max(20).nullable().optional(),
  isActive: z.boolean().optional(),
  contactName: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  fax: z.string().nullable().optional(),
  website: z.string().url().nullable().optional(),
  addressLine1: z.string().nullable().optional(),
  addressLine2: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  zipCode: z.string().nullable().optional(),
  country: z.string().optional(),
  paymentTerms: z.string().nullable().optional(),
  creditLimit: z.number().min(0).nullable().optional(),
  accountNumber: z.string().nullable().optional(),
  taxId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const poCreateSchema = z.object({
  vendorId: z.string(),
  expectedDate: z.date().optional(),
  shippingCost: z.number().min(0).default(0),
  shipToAddress: z.string().optional(),
  shippingMethod: z.string().optional(),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),
  items: z.array(z.object({
    productId: z.string(),
    orderedQty: z.number().int().min(1),
    unitCost: z.number().min(0),
    notes: z.string().optional(),
  })).min(1),
});

const saleCreateSchema = z.object({
  patientId: z.string().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  customerEmail: z.string().email().optional(),
  paymentMethod: z.nativeEnum(POSPaymentMethod),
  discountAmount: z.number().min(0).default(0),
  discountPercent: z.number().min(0).max(100).optional(),
  discountReason: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().int().min(1),
    unitPrice: z.number().min(0).optional(),
    discountAmount: z.number().min(0).optional(),
    notes: z.string().optional(),
  })).min(1),
});

const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
});

// ============================================
// Router Definition
// ============================================

export const inventoryRouter = router({
  // ============================================
  // Product Procedures
  // ============================================

  listProducts: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      categoryId: z.string().optional(),
      status: z.nativeEnum(ProductStatus).optional(),
      vendorId: z.string().optional(),
      lowStock: z.boolean().optional(),
      ...paginationSchema.shape,
    }))
    .query(async ({ ctx, input }) => {
      const { page, pageSize, ...filters } = input;
      return listProducts(
        ctx.user.organizationId,
        filters,
        { page, pageSize }
      );
    }),

  getProduct: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return getProduct(input.id, ctx.user.organizationId);
    }),

  createProduct: adminProcedure
    .input(productCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const id = await createProduct(input, ctx.user.organizationId);

      await auditLog(INVENTORY_AUDIT_ACTIONS.PRODUCT_CREATE, 'Product', {
        entityId: id,
        changes: { name: input.name, sku: input.sku },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { id };
    }),

  updateProduct: adminProcedure
    .input(productUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      await updateProduct(input as ProductUpdateInput, ctx.user.organizationId);

      await auditLog(INVENTORY_AUDIT_ACTIONS.PRODUCT_UPDATE, 'Product', {
        entityId: input.id,
        changes: input,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  deleteProduct: adminProcedure
    .input(z.object({
      id: z.string(),
      hardDelete: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      await deleteProduct(input.id, ctx.user.organizationId, input.hardDelete);

      await auditLog(INVENTORY_AUDIT_ACTIONS.PRODUCT_DELETE, 'Product', {
        entityId: input.id,
        changes: { hardDelete: input.hardDelete },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  generateSku: protectedProcedure
    .input(z.object({ prefix: z.string().min(1).max(10) }))
    .query(async ({ ctx, input }) => {
      return generateSku(input.prefix, ctx.user.organizationId);
    }),

  // ============================================
  // Category Procedures
  // ============================================

  listCategories: protectedProcedure
    .input(z.object({
      includeInactive: z.boolean().default(false),
      asTree: z.boolean().default(false),
    }))
    .query(async ({ ctx, input }) => {
      if (input.asTree) {
        return listCategoriesTree(ctx.user.organizationId, input.includeInactive);
      }
      return listCategories(ctx.user.organizationId, input.includeInactive);
    }),

  createCategory: adminProcedure
    .input(categoryCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const id = await createCategory(input, ctx.user.organizationId);
      return { id };
    }),

  updateCategory: adminProcedure
    .input(categoryUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      await updateCategory(input as CategoryUpdateInput, ctx.user.organizationId);
      return { success: true };
    }),

  deleteCategory: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await deleteCategory(input.id, ctx.user.organizationId);
      return { success: true };
    }),

  generateSlug: protectedProcedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => {
      return generateSlug(input.name);
    }),

  // ============================================
  // Stock Procedures
  // ============================================

  getStock: protectedProcedure
    .input(z.object({
      productId: z.string().optional(),
      location: z.string().optional(),
      search: z.string().optional(),
      lowStockOnly: z.boolean().optional(),
      ...paginationSchema.shape,
    }))
    .query(async ({ ctx, input }) => {
      if (input.productId) {
        return getProductStockLevels(input.productId, ctx.user.organizationId);
      }
      const { page, pageSize, ...filters } = input;
      return getAllStockLevels(ctx.user.organizationId, filters, { page, pageSize });
    }),

  adjustStock: adminProcedure
    .input(z.object({
      productId: z.string(),
      location: z.string().default('main'),
      quantity: z.number().int(),
      reason: z.string().min(1),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const movementId = await adjustStock(
        input,
        ctx.user.id,
        ctx.user.organizationId
      );

      await auditLog(INVENTORY_AUDIT_ACTIONS.STOCK_ADJUST, 'InventoryMovement', {
        entityId: movementId,
        changes: {
          productId: input.productId,
          quantity: input.quantity,
          reason: input.reason,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { movementId };
    }),

  transferStock: adminProcedure
    .input(z.object({
      productId: z.string(),
      fromLocation: z.string(),
      toLocation: z.string(),
      quantity: z.number().int().min(1),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const movementId = await transferStock(
        input,
        ctx.user.id,
        ctx.user.organizationId
      );

      await auditLog(INVENTORY_AUDIT_ACTIONS.STOCK_TRANSFER, 'InventoryMovement', {
        entityId: movementId,
        changes: input,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { movementId };
    }),

  getMovementHistory: protectedProcedure
    .input(z.object({
      productId: z.string(),
      ...paginationSchema.shape,
    }))
    .query(async ({ ctx, input }) => {
      const { page, pageSize, productId } = input;
      return getMovementHistory(productId, ctx.user.organizationId, { page, pageSize });
    }),

  // ============================================
  // Barcode Procedures
  // ============================================

  validateBarcode: protectedProcedure
    .input(z.object({ barcode: z.string() }))
    .mutation(({ input }) => {
      return validateBarcode(input.barcode);
    }),

  lookupBarcode: protectedProcedure
    .input(z.object({ barcode: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return lookupBarcode(input.barcode, ctx.user.organizationId);
    }),

  // ============================================
  // Alert Procedures
  // ============================================

  listLowStock: protectedProcedure
    .input(z.object({
      status: z.union([
        z.nativeEnum(AlertStatus),
        z.array(z.nativeEnum(AlertStatus)),
      ]).optional(),
      categoryId: z.string().optional(),
      vendorId: z.string().optional(),
      ...paginationSchema.shape,
    }))
    .query(async ({ ctx, input }) => {
      const { page, pageSize, ...filters } = input;
      return getLowStockAlerts(ctx.user.organizationId, filters, { page, pageSize });
    }),

  getAlertCount: protectedProcedure
    .query(async ({ ctx }) => {
      return getActiveAlertCount(ctx.user.organizationId);
    }),

  getAlertSummary: protectedProcedure
    .query(async ({ ctx }) => {
      return getAlertSummary(ctx.user.organizationId);
    }),

  acknowledgeAlert: protectedProcedure
    .input(z.object({ alertId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await acknowledgeAlert(input.alertId, ctx.user.id, ctx.user.organizationId);
      return { success: true };
    }),

  ignoreAlert: protectedProcedure
    .input(z.object({ alertId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ignoreAlert(input.alertId, ctx.user.id, ctx.user.organizationId);
      return { success: true };
    }),

  bulkAcknowledgeAlerts: protectedProcedure
    .input(z.object({ alertIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const count = await bulkAcknowledgeAlerts(
        input.alertIds,
        ctx.user.id,
        ctx.user.organizationId
      );
      return { acknowledged: count };
    }),

  // ============================================
  // Vendor Procedures
  // ============================================

  listVendors: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      isActive: z.boolean().optional(),
      ...paginationSchema.shape,
    }))
    .query(async ({ ctx, input }) => {
      const { page, pageSize, ...filters } = input;
      return listVendors(ctx.user.organizationId, filters, { page, pageSize });
    }),

  getVendor: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return getVendor(input.id, ctx.user.organizationId);
    }),

  createVendor: adminProcedure
    .input(vendorCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const id = await createVendor(input, ctx.user.organizationId);

      await auditLog(INVENTORY_AUDIT_ACTIONS.VENDOR_CREATE, 'Vendor', {
        entityId: id,
        changes: { name: input.name },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { id };
    }),

  updateVendor: adminProcedure
    .input(vendorUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      await updateVendor(input as VendorUpdateInput, ctx.user.organizationId);

      await auditLog(INVENTORY_AUDIT_ACTIONS.VENDOR_UPDATE, 'Vendor', {
        entityId: input.id,
        changes: input,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  deleteVendor: adminProcedure
    .input(z.object({
      id: z.string(),
      hardDelete: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      await deleteVendor(input.id, ctx.user.organizationId, input.hardDelete);
      return { success: true };
    }),

  linkProductToVendor: adminProcedure
    .input(z.object({
      productId: z.string(),
      vendorId: z.string(),
      vendorSku: z.string().optional(),
      vendorPrice: z.number().min(0),
      minOrderQty: z.number().int().min(1).default(1),
      leadTimeDays: z.number().int().min(0).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { productId, vendorId, ...data } = input;
      await linkProductToVendor(productId, vendorId, data, ctx.user.organizationId);
      return { success: true };
    }),

  unlinkProductFromVendor: adminProcedure
    .input(z.object({
      productId: z.string(),
      vendorId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      await unlinkProductFromVendor(input.productId, input.vendorId, ctx.user.organizationId);
      return { success: true };
    }),

  // ============================================
  // Purchase Order Procedures
  // ============================================

  listPurchaseOrders: protectedProcedure
    .input(z.object({
      status: z.union([
        z.nativeEnum(PurchaseOrderStatus),
        z.array(z.nativeEnum(PurchaseOrderStatus)),
      ]).optional(),
      vendorId: z.string().optional(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
      search: z.string().optional(),
      ...paginationSchema.shape,
    }))
    .query(async ({ ctx, input }) => {
      const { page, pageSize, ...filters } = input;
      return listPurchaseOrders(ctx.user.organizationId, filters, { page, pageSize });
    }),

  getPurchaseOrder: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return getPurchaseOrder(input.id, ctx.user.organizationId);
    }),

  createPurchaseOrder: adminProcedure
    .input(poCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const id = await createPurchaseOrder(input, ctx.user.id, ctx.user.organizationId);

      await auditLog(INVENTORY_AUDIT_ACTIONS.PO_CREATE, 'PurchaseOrder', {
        entityId: id,
        changes: { vendorId: input.vendorId, itemCount: input.items.length },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { id };
    }),

  updatePurchaseOrder: adminProcedure
    .input(z.object({
      id: z.string(),
      expectedDate: z.date().optional(),
      shippingCost: z.number().min(0).optional(),
      shipToAddress: z.string().optional(),
      shippingMethod: z.string().optional(),
      trackingNumber: z.string().optional(),
      notes: z.string().optional(),
      internalNotes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await updatePurchaseOrder(input, ctx.user.organizationId);
      return { success: true };
    }),

  submitPurchaseOrder: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await submitPurchaseOrder(input.id, ctx.user.organizationId);
      return { success: true };
    }),

  receivePurchaseOrder: adminProcedure
    .input(z.object({
      id: z.string(),
      items: z.array(z.object({
        purchaseOrderItemId: z.string(),
        receivedQty: z.number().int().min(1),
        unitCost: z.number().min(0).optional(),
        location: z.string().optional(),
        notes: z.string().optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      await receivePurchaseOrderItems(
        input.id,
        input.items,
        ctx.user.id,
        ctx.user.organizationId
      );

      await auditLog(INVENTORY_AUDIT_ACTIONS.PO_RECEIVE, 'PurchaseOrder', {
        entityId: input.id,
        changes: { itemsReceived: input.items.length },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  cancelPurchaseOrder: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await cancelPurchaseOrder(input.id, ctx.user.organizationId);
      return { success: true };
    }),

  // ============================================
  // POS Procedures
  // ============================================

  createSale: protectedProcedure
    .input(saleCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const id = await createSale(input, ctx.user.id, ctx.user.organizationId);

      await auditLog(INVENTORY_AUDIT_ACTIONS.SALE_CREATE, 'Sale', {
        entityId: id,
        changes: { itemCount: input.items.length, paymentMethod: input.paymentMethod },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { id };
    }),

  completeSale: protectedProcedure
    .input(z.object({
      id: z.string(),
      amountTendered: z.number().min(0),
      paymentMethod: z.nativeEnum(POSPaymentMethod),
      paymentTransactionId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await completeSale(input, ctx.user.id, ctx.user.organizationId);

      await auditLog(INVENTORY_AUDIT_ACTIONS.SALE_COMPLETE, 'Sale', {
        entityId: input.id,
        changes: {
          amountTendered: input.amountTendered,
          changeGiven: result.changeGiven,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return result;
    }),

  voidSale: adminProcedure
    .input(z.object({
      id: z.string(),
      reason: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      await voidSale(input, ctx.user.id, ctx.user.organizationId);

      await auditLog(INVENTORY_AUDIT_ACTIONS.SALE_VOID, 'Sale', {
        entityId: input.id,
        changes: { reason: input.reason },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  getSale: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return getSale(input.id, ctx.user.organizationId);
    }),

  listSales: protectedProcedure
    .input(z.object({
      status: z.nativeEnum(SaleStatus).optional(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
      paymentMethod: z.nativeEnum(POSPaymentMethod).optional(),
      salesPersonId: z.string().optional(),
      search: z.string().optional(),
      ...paginationSchema.shape,
    }))
    .query(async ({ ctx, input }) => {
      const { page, pageSize, ...filters } = input;
      return listSales(ctx.user.organizationId, filters, { page, pageSize });
    }),

  buildCart: protectedProcedure
    .input(z.object({
      items: z.array(z.object({
        productId: z.string(),
        quantity: z.number().int().min(1),
      })),
    }))
    .query(async ({ ctx, input }) => {
      return buildCart(input.items, ctx.user.organizationId);
    }),

  getTodaysSales: protectedProcedure
    .query(async ({ ctx }) => {
      return getTodaysSalesSummary(ctx.user.organizationId);
    }),

  // ============================================
  // Sales Report Procedures
  // ============================================

  getSalesReport: protectedProcedure
    .input(z.object({
      startDate: z.date(),
      endDate: z.date(),
      categoryId: z.string().optional(),
      productId: z.string().optional(),
      salesPersonId: z.string().optional(),
      paymentMethod: z.nativeEnum(POSPaymentMethod).optional(),
    }))
    .query(async ({ ctx, input }) => {
      return getSalesReportSummary(input, ctx.user.organizationId);
    }),

  getProductSalesReport: protectedProcedure
    .input(z.object({
      startDate: z.date(),
      endDate: z.date(),
      categoryId: z.string().optional(),
      productId: z.string().optional(),
      ...paginationSchema.shape,
    }))
    .query(async ({ ctx, input }) => {
      const { page, pageSize, ...filters } = input;
      return getProductSalesReport(
        { ...filters, salesPersonId: undefined, paymentMethod: undefined },
        ctx.user.organizationId,
        { page, pageSize }
      );
    }),

  getDailySalesReport: protectedProcedure
    .input(z.object({
      startDate: z.date(),
      endDate: z.date(),
    }))
    .query(async ({ ctx, input }) => {
      return getDailySalesReport(
        { ...input, categoryId: undefined, productId: undefined, salesPersonId: undefined, paymentMethod: undefined },
        ctx.user.organizationId
      );
    }),
});
