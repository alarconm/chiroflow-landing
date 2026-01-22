/**
 * Inventory & POS Types
 * Epic 17: Inventory & POS
 */

import type {
  ProductStatus,
  InventoryMovementType,
  PurchaseOrderStatus,
  SaleStatus,
  AlertStatus,
  POSPaymentMethod,
} from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

// ============================================
// Product Types
// ============================================

export interface ProductCreateInput {
  name: string;
  description?: string;
  sku: string;
  barcode?: string;
  status?: ProductStatus;
  costPrice?: number;
  retailPrice: number;
  isTaxable?: boolean;
  taxRate?: number;
  weight?: number;
  weightUnit?: string;
  dimensions?: string;
  trackInventory?: boolean;
  lowStockThreshold?: number;
  reorderPoint?: number;
  reorderQuantity?: number;
  brand?: string;
  manufacturer?: string;
  notes?: string;
  imageUrl?: string;
  categoryId?: string;
  preferredVendorId?: string;
}

export interface ProductUpdateInput extends Partial<ProductCreateInput> {
  id: string;
}

export interface ProductWithInventory {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  status: ProductStatus;
  retailPrice: Decimal;
  costPrice: Decimal;
  categoryId: string | null;
  totalQuantity: number;
  availableQuantity: number;
  reservedQuantity: number;
}

export interface ProductSearchFilters {
  search?: string;
  categoryId?: string;
  status?: ProductStatus;
  lowStock?: boolean;
  vendorId?: string;
}

// ============================================
// Category Types
// ============================================

export interface CategoryCreateInput {
  name: string;
  description?: string;
  slug: string;
  sortOrder?: number;
  isActive?: boolean;
  parentId?: string;
}

export interface CategoryUpdateInput extends Partial<CategoryCreateInput> {
  id: string;
}

export interface CategoryTreeNode {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
  parentId: string | null;
  children: CategoryTreeNode[];
}

// ============================================
// Inventory Types
// ============================================

export interface InventoryStockLevel {
  productId: string;
  productName: string;
  productSku: string;
  location: string;
  quantity: number;
  reservedQty: number;
  availableQty: number;
  averageCost: Decimal;
  lastCost: Decimal;
  retailPrice: Decimal;
  totalValue: number;
}

export interface StockAdjustmentInput {
  productId: string;
  location: string;
  quantity: number; // Positive for increase, negative for decrease
  reason: string;
  notes?: string;
}

export interface StockTransferInput {
  productId: string;
  fromLocation: string;
  toLocation: string;
  quantity: number;
  notes?: string;
}

export interface InventoryMovementRecord {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  movementType: InventoryMovementType;
  quantity: number;
  unitCost: Decimal;
  totalCost: Decimal;
  fromLocation: string | null;
  toLocation: string | null;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: Date;
}

// ============================================
// Vendor Types
// ============================================

export interface VendorCreateInput {
  name: string;
  code?: string;
  isActive?: boolean;
  contactName?: string;
  email?: string;
  phone?: string;
  fax?: string;
  website?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  paymentTerms?: string;
  creditLimit?: number;
  accountNumber?: string;
  taxId?: string;
  notes?: string;
}

export interface VendorUpdateInput extends Partial<VendorCreateInput> {
  id: string;
}

export interface VendorWithProducts {
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  paymentTerms: string | null;
  taxId: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  country: string;
  productCount: number;
  openPOCount: number;
}

// ============================================
// Purchase Order Types
// ============================================

export interface PurchaseOrderCreateInput {
  vendorId: string;
  expectedDate?: Date;
  shippingCost?: number;
  shipToAddress?: string;
  shippingMethod?: string;
  notes?: string;
  internalNotes?: string;
  items: PurchaseOrderItemInput[];
}

export interface PurchaseOrderItemInput {
  productId: string;
  orderedQty: number;
  unitCost: number;
  notes?: string;
}

export interface PurchaseOrderUpdateInput {
  id: string;
  expectedDate?: Date;
  shippingCost?: number;
  shipToAddress?: string;
  shippingMethod?: string;
  trackingNumber?: string;
  notes?: string;
  internalNotes?: string;
}

export interface ReceiveItemInput {
  purchaseOrderItemId: string;
  receivedQty: number;
  unitCost?: number; // Can override if actual cost differs
  location?: string;
  notes?: string;
}

export interface PurchaseOrderSummary {
  id: string;
  poNumber: string;
  status: PurchaseOrderStatus;
  vendorName: string;
  orderDate: Date;
  expectedDate: Date | null;
  totalAmount: Decimal;
  itemCount: number;
  receivedCount: number;
}

// ============================================
// Sale/POS Types
// ============================================

export interface SaleCreateInput {
  patientId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  paymentMethod: POSPaymentMethod;
  discountAmount?: number;
  discountPercent?: number;
  discountReason?: string;
  notes?: string;
  items: SaleItemInput[];
}

export interface SaleItemInput {
  productId: string;
  quantity: number;
  unitPrice?: number; // Override price if needed
  discountAmount?: number;
  notes?: string;
}

export interface SaleCompleteInput {
  id: string;
  amountTendered: number;
  paymentMethod: POSPaymentMethod;
  paymentTransactionId?: string; // If card payment
}

export interface SaleVoidInput {
  id: string;
  reason: string;
}

export interface SaleSummary {
  id: string;
  saleNumber: string;
  status: SaleStatus;
  saleDate: Date;
  customerName: string | null;
  patientId: string | null;
  subtotal: Decimal;
  discountAmount: Decimal;
  taxAmount: Decimal;
  totalAmount: Decimal;
  paymentMethod: POSPaymentMethod;
  itemCount: number;
}

export interface POSCartItem {
  productId: string;
  productName: string;
  productSku: string;
  barcode: string | null;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxAmount: number;
  totalPrice: number;
  availableQty: number;
}

export interface POSCart {
  items: POSCartItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
}

// ============================================
// Low Stock Alert Types
// ============================================

export interface LowStockAlertInfo {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  currentQty: number;
  threshold: number;
  reorderPoint: number;
  suggestedQty: number;
  status: AlertStatus;
  preferredVendorId: string | null;
  preferredVendorName: string | null;
  createdAt: Date;
}

// ============================================
// Sales Report Types
// ============================================

export interface SalesReportFilters {
  startDate: Date;
  endDate: Date;
  categoryId?: string;
  productId?: string;
  salesPersonId?: string;
  paymentMethod?: POSPaymentMethod;
}

export interface SalesReportSummary {
  totalSales: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  profitMargin: number;
  averageSaleAmount: number;
  itemsSold: number;
  uniqueCustomers: number;
  salesByPaymentMethod: Record<POSPaymentMethod, { count: number; amount: number }>;
}

export interface ProductSalesReport {
  productId: string;
  productName: string;
  productSku: string;
  quantitySold: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
}

export interface DailySalesReport {
  date: Date;
  salesCount: number;
  revenue: number;
  cost: number;
  profit: number;
  itemsSold: number;
}

// ============================================
// Barcode Types
// ============================================

export interface BarcodeResult {
  found: boolean;
  product?: {
    id: string;
    name: string;
    sku: string;
    barcode: string;
    retailPrice: Decimal;
    availableQty: number;
  };
  message?: string;
}

export interface BarcodeValidation {
  valid: boolean;
  type?: 'UPC-A' | 'UPC-E' | 'EAN-13' | 'EAN-8' | 'CODE-128' | 'UNKNOWN';
  formatted?: string;
  error?: string;
}
