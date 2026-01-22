/**
 * Point of Sale Service
 * Epic 17: Inventory & POS
 *
 * Handles POS transactions, sales, and related operations.
 */

import { prisma } from '@/lib/prisma';
import type { Prisma, POSPaymentMethod, SaleStatus } from '@prisma/client';
import type {
  SaleCreateInput,
  SaleCompleteInput,
  SaleVoidInput,
  SaleSummary,
  POSCart,
  POSCartItem,
  SalesReportFilters,
  SalesReportSummary,
  ProductSalesReport,
  DailySalesReport,
} from './types';
import { recordSale, reverseSale } from './inventory-tracker';

// ============================================
// Sale Creation and Processing
// ============================================

/**
 * Create a new sale (POS transaction)
 */
export async function createSale(
  input: SaleCreateInput,
  userId: string,
  organizationId: string
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    // Generate sale number
    const saleNumber = await generateSaleNumber(organizationId, tx);

    // Calculate totals and validate items
    let subtotal = 0;
    let totalTax = 0;
    const lineItems: Array<{
      productId: string;
      lineNumber: number;
      productName: string;
      productSku: string;
      quantity: number;
      unitPrice: number;
      unitCost: number;
      discountAmount: number;
      taxAmount: number;
      totalPrice: number;
      notes: string | null;
    }> = [];

    for (let i = 0; i < input.items.length; i++) {
      const item = input.items[i];

      // Get product details
      const product = await tx.product.findFirst({
        where: { id: item.productId, organizationId },
        include: {
          inventoryItems: {
            where: { storageArea: 'main' },
          },
        },
      });

      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }

      if (product.status !== 'ACTIVE') {
        throw new Error(`Product ${product.name} is not available for sale`);
      }

      // Check stock
      const availableQty = product.inventoryItems.reduce((sum, inv) => sum + inv.availableQty, 0);
      if (product.trackInventory && availableQty < item.quantity) {
        throw new Error(`Insufficient stock for ${product.name}. Available: ${availableQty}`);
      }

      const unitPrice = item.unitPrice ?? Number(product.retailPrice);
      const discountAmount = item.discountAmount ?? 0;
      const lineSubtotal = (unitPrice * item.quantity) - discountAmount;

      // Calculate tax
      let taxAmount = 0;
      if (product.isTaxable) {
        const taxRate = product.taxRate ? Number(product.taxRate) : 0.0725; // Default 7.25%
        taxAmount = lineSubtotal * taxRate;
      }

      const totalPrice = lineSubtotal + taxAmount;

      lineItems.push({
        productId: product.id,
        lineNumber: i + 1,
        productName: product.name,
        productSku: product.sku,
        quantity: item.quantity,
        unitPrice,
        unitCost: Number(product.costPrice),
        discountAmount,
        taxAmount,
        totalPrice,
        notes: item.notes || null,
      });

      subtotal += lineSubtotal;
      totalTax += taxAmount;
    }

    // Apply sale-level discount
    const saleDiscount = input.discountAmount ?? 0;
    const discountPercent = input.discountPercent ?? null;

    // Calculate total
    const totalAmount = subtotal - saleDiscount + totalTax;

    // Create sale
    const sale = await tx.sale.create({
      data: {
        saleNumber,
        status: 'PENDING',
        saleDate: new Date(),
        subtotal,
        discountAmount: saleDiscount,
        discountPercent,
        discountReason: input.discountReason,
        taxAmount: totalTax,
        totalAmount,
        paymentMethod: input.paymentMethod,
        patientId: input.patientId,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerEmail: input.customerEmail,
        notes: input.notes,
        salesPersonId: userId,
        organizationId,
        items: {
          create: lineItems,
        },
      },
    });

    return sale.id;
  });
}

/**
 * Complete a sale (finalize transaction)
 */
export async function completeSale(
  input: SaleCompleteInput,
  userId: string,
  organizationId: string
): Promise<{ saleId: string; changeGiven: number }> {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({
      where: { id: input.id, organizationId },
      include: { items: true },
    });

    if (!sale) {
      throw new Error('Sale not found');
    }

    if (sale.status !== 'PENDING') {
      throw new Error('Sale has already been processed');
    }

    // Validate payment amount
    const totalAmount = Number(sale.totalAmount);
    if (input.amountTendered < totalAmount) {
      throw new Error(`Payment of ${input.amountTendered} is less than total ${totalAmount}`);
    }

    const changeGiven = input.amountTendered - totalAmount;

    // Update sale
    await tx.sale.update({
      where: { id: sale.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        paymentMethod: input.paymentMethod,
        amountTendered: input.amountTendered,
        changeGiven,
        paymentTransactionId: input.paymentTransactionId,
        cashierId: userId,
      },
    });

    // Deduct inventory for each item
    for (const item of sale.items) {
      const product = await tx.product.findUnique({
        where: { id: item.productId },
        select: { trackInventory: true },
      });

      if (product?.trackInventory) {
        await recordSale(
          item.productId,
          item.quantity,
          'main', // Default location
          sale.id,
          userId,
          organizationId,
          tx
        );
      }
    }

    return { saleId: sale.id, changeGiven };
  });
}

/**
 * Void a sale
 */
export async function voidSale(
  input: SaleVoidInput,
  userId: string,
  organizationId: string
): Promise<void> {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({
      where: { id: input.id, organizationId },
      include: { items: true },
    });

    if (!sale) {
      throw new Error('Sale not found');
    }

    if (sale.status === 'VOIDED') {
      throw new Error('Sale has already been voided');
    }

    // If sale was completed, reverse the inventory
    if (sale.status === 'COMPLETED') {
      for (const item of sale.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
          select: { trackInventory: true },
        });

        if (product?.trackInventory) {
          await reverseSale(
            item.productId,
            item.quantity,
            'main',
            sale.id,
            userId,
            organizationId,
            tx
          );
        }
      }
    }

    // Update sale status
    await tx.sale.update({
      where: { id: sale.id },
      data: {
        status: 'VOIDED',
        voidedAt: new Date(),
        voidedBy: userId,
        voidReason: input.reason,
      },
    });
  });
}

// ============================================
// Sale Queries
// ============================================

/**
 * Get a single sale
 */
export async function getSale(saleId: string, organizationId: string) {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, organizationId },
    include: {
      items: {
        include: { product: true },
        orderBy: { lineNumber: 'asc' },
      },
    },
  });

  if (!sale) {
    throw new Error('Sale not found');
  }

  return sale;
}

/**
 * List sales with filtering
 */
export async function listSales(
  organizationId: string,
  filters: {
    status?: SaleStatus;
    startDate?: Date;
    endDate?: Date;
    paymentMethod?: POSPaymentMethod;
    salesPersonId?: string;
    search?: string;
  } = {},
  pagination: { page: number; pageSize: number } = { page: 1, pageSize: 50 }
): Promise<{ sales: SaleSummary[]; total: number }> {
  const where: Prisma.SaleWhereInput = { organizationId };

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.startDate || filters.endDate) {
    where.saleDate = {};
    if (filters.startDate) {
      where.saleDate.gte = filters.startDate;
    }
    if (filters.endDate) {
      where.saleDate.lte = filters.endDate;
    }
  }

  if (filters.paymentMethod) {
    where.paymentMethod = filters.paymentMethod;
  }

  if (filters.salesPersonId) {
    where.salesPersonId = filters.salesPersonId;
  }

  if (filters.search) {
    where.OR = [
      { saleNumber: { contains: filters.search, mode: 'insensitive' } },
      { customerName: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const total = await prisma.sale.count({ where });

  const sales = await prisma.sale.findMany({
    where,
    include: {
      _count: { select: { items: true } },
    },
    orderBy: { saleDate: 'desc' },
    skip: (pagination.page - 1) * pagination.pageSize,
    take: pagination.pageSize,
  });

  return {
    sales: sales.map((sale) => ({
      id: sale.id,
      saleNumber: sale.saleNumber,
      status: sale.status,
      saleDate: sale.saleDate,
      customerName: sale.customerName,
      patientId: sale.patientId,
      subtotal: sale.subtotal,
      discountAmount: sale.discountAmount,
      taxAmount: sale.taxAmount,
      totalAmount: sale.totalAmount,
      paymentMethod: sale.paymentMethod,
      itemCount: sale._count.items,
    })),
    total,
  };
}

// ============================================
// POS Cart Helpers
// ============================================

/**
 * Build a POS cart from product selections
 */
export async function buildCart(
  items: Array<{ productId: string; quantity: number }>,
  organizationId: string
): Promise<POSCart> {
  const cartItems: POSCartItem[] = [];
  let subtotal = 0;
  let totalTax = 0;

  for (const item of items) {
    const product = await prisma.product.findFirst({
      where: { id: item.productId, organizationId },
      include: {
        inventoryItems: {
          where: { storageArea: 'main' },
        },
      },
    });

    if (!product) {
      throw new Error(`Product not found: ${item.productId}`);
    }

    const unitPrice = Number(product.retailPrice);
    const lineSubtotal = unitPrice * item.quantity;

    // Calculate tax
    let taxAmount = 0;
    if (product.isTaxable) {
      const taxRate = product.taxRate ? Number(product.taxRate) : 0.0725;
      taxAmount = lineSubtotal * taxRate;
    }

    const totalPrice = lineSubtotal + taxAmount;
    const availableQty = product.inventoryItems.reduce((sum, inv) => sum + inv.availableQty, 0);

    cartItems.push({
      productId: product.id,
      productName: product.name,
      productSku: product.sku,
      barcode: product.barcode,
      quantity: item.quantity,
      unitPrice,
      discountAmount: 0,
      taxAmount,
      totalPrice,
      availableQty,
    });

    subtotal += lineSubtotal;
    totalTax += taxAmount;
  }

  return {
    items: cartItems,
    subtotal,
    discountAmount: 0,
    taxAmount: totalTax,
    totalAmount: subtotal + totalTax,
  };
}

// ============================================
// Sales Reports
// ============================================

/**
 * Get sales report summary
 */
export async function getSalesReportSummary(
  filters: SalesReportFilters,
  organizationId: string
): Promise<SalesReportSummary> {
  const where: Prisma.SaleWhereInput = {
    organizationId,
    status: 'COMPLETED',
    saleDate: {
      gte: filters.startDate,
      lte: filters.endDate,
    },
  };

  if (filters.salesPersonId) {
    where.salesPersonId = filters.salesPersonId;
  }

  if (filters.paymentMethod) {
    where.paymentMethod = filters.paymentMethod;
  }

  // Get sales
  const sales = await prisma.sale.findMany({
    where,
    include: {
      items: true,
    },
  });

  // Calculate metrics
  let totalRevenue = 0;
  let totalCost = 0;
  let itemsSold = 0;
  const customerSet = new Set<string>();
  const paymentMethodStats: Record<POSPaymentMethod, { count: number; amount: number }> = {
    CASH: { count: 0, amount: 0 },
    CREDIT_CARD: { count: 0, amount: 0 },
    DEBIT_CARD: { count: 0, amount: 0 },
    CHECK: { count: 0, amount: 0 },
    STORE_CREDIT: { count: 0, amount: 0 },
    INSURANCE: { count: 0, amount: 0 },
    OTHER: { count: 0, amount: 0 },
  };

  for (const sale of sales) {
    totalRevenue += Number(sale.totalAmount);

    for (const item of sale.items) {
      totalCost += Number(item.unitCost) * item.quantity;
      itemsSold += item.quantity;
    }

    if (sale.patientId) {
      customerSet.add(sale.patientId);
    } else if (sale.customerEmail) {
      customerSet.add(sale.customerEmail);
    } else if (sale.customerPhone) {
      customerSet.add(sale.customerPhone);
    }

    paymentMethodStats[sale.paymentMethod].count++;
    paymentMethodStats[sale.paymentMethod].amount += Number(sale.totalAmount);
  }

  const totalProfit = totalRevenue - totalCost;
  const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const averageSaleAmount = sales.length > 0 ? totalRevenue / sales.length : 0;

  return {
    totalSales: sales.length,
    totalRevenue,
    totalCost,
    totalProfit,
    profitMargin,
    averageSaleAmount,
    itemsSold,
    uniqueCustomers: customerSet.size,
    salesByPaymentMethod: paymentMethodStats,
  };
}

/**
 * Get product sales report
 */
export async function getProductSalesReport(
  filters: SalesReportFilters,
  organizationId: string,
  pagination: { page: number; pageSize: number } = { page: 1, pageSize: 50 }
): Promise<{ products: ProductSalesReport[]; total: number }> {
  const where: Prisma.SaleItemWhereInput = {
    sale: {
      organizationId,
      status: 'COMPLETED',
      saleDate: {
        gte: filters.startDate,
        lte: filters.endDate,
      },
    },
  };

  if (filters.productId) {
    where.productId = filters.productId;
  }

  if (filters.categoryId) {
    where.product = { categoryId: filters.categoryId };
  }

  // Group by product
  const items = await prisma.saleItem.groupBy({
    by: ['productId'],
    where,
    _sum: {
      quantity: true,
      totalPrice: true,
    },
    orderBy: {
      _sum: { quantity: 'desc' },
    },
    skip: (pagination.page - 1) * pagination.pageSize,
    take: pagination.pageSize,
  });

  const total = await prisma.saleItem.groupBy({
    by: ['productId'],
    where,
  }).then((results) => results.length);

  // Get product details and calculate costs
  const products: ProductSalesReport[] = [];

  for (const item of items) {
    const product = await prisma.product.findUnique({
      where: { id: item.productId },
      select: { name: true, sku: true, costPrice: true },
    });

    if (!product) continue;

    const quantitySold = item._sum.quantity || 0;
    const revenue = Number(item._sum.totalPrice) || 0;
    const cost = Number(product.costPrice) * quantitySold;
    const profit = revenue - cost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

    products.push({
      productId: item.productId,
      productName: product.name,
      productSku: product.sku,
      quantitySold,
      revenue,
      cost,
      profit,
      margin,
    });
  }

  return { products, total };
}

/**
 * Get daily sales report
 */
export async function getDailySalesReport(
  filters: SalesReportFilters,
  organizationId: string
): Promise<DailySalesReport[]> {
  const sales = await prisma.sale.findMany({
    where: {
      organizationId,
      status: 'COMPLETED',
      saleDate: {
        gte: filters.startDate,
        lte: filters.endDate,
      },
    },
    include: {
      items: true,
    },
    orderBy: { saleDate: 'asc' },
  });

  // Group by date
  const dailyMap = new Map<string, DailySalesReport>();

  for (const sale of sales) {
    const dateKey = sale.saleDate.toISOString().split('T')[0];

    let daily = dailyMap.get(dateKey);
    if (!daily) {
      daily = {
        date: new Date(dateKey),
        salesCount: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
        itemsSold: 0,
      };
      dailyMap.set(dateKey, daily);
    }

    daily.salesCount++;
    daily.revenue += Number(sale.totalAmount);

    for (const item of sale.items) {
      daily.cost += Number(item.unitCost) * item.quantity;
      daily.itemsSold += item.quantity;
    }
  }

  // Calculate profit for each day
  const results: DailySalesReport[] = [];
  for (const daily of dailyMap.values()) {
    daily.profit = daily.revenue - daily.cost;
    results.push(daily);
  }

  return results;
}

// ============================================
// Helpers
// ============================================

/**
 * Generate a unique sale number
 */
async function generateSaleNumber(
  organizationId: string,
  tx: Prisma.TransactionClient
): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');

  // Count sales for today
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);

  const count = await tx.sale.count({
    where: {
      organizationId,
      saleDate: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
  });

  const sequence = String(count + 1).padStart(4, '0');
  return `SALE-${dateStr}-${sequence}`;
}

/**
 * Get today's sales summary
 */
export async function getTodaysSalesSummary(organizationId: string) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const sales = await prisma.sale.findMany({
    where: {
      organizationId,
      status: 'COMPLETED',
      saleDate: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    include: {
      _count: { select: { items: true } },
    },
  });

  const totalSales = sales.length;
  const totalRevenue = sales.reduce((sum, sale) => sum + Number(sale.totalAmount), 0);
  const totalItems = sales.reduce((sum, sale) => sum + sale._count.items, 0);

  return {
    totalSales,
    totalRevenue,
    totalItems,
    averageSale: totalSales > 0 ? totalRevenue / totalSales : 0,
  };
}
