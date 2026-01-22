/**
 * Product Service
 * Epic 17: Inventory & POS
 *
 * Handles product CRUD operations and catalog management.
 */

import { prisma } from '@/lib/prisma';
import type { PrismaClient, Prisma, ProductStatus } from '@prisma/client';
import type {
  ProductCreateInput,
  ProductUpdateInput,
  ProductWithInventory,
  ProductSearchFilters,
  CategoryCreateInput,
  CategoryUpdateInput,
  CategoryTreeNode,
} from './types';

// ============================================
// Product Service
// ============================================

/**
 * Create a new product
 */
export async function createProduct(
  data: ProductCreateInput,
  organizationId: string,
  tx?: Prisma.TransactionClient
): Promise<string> {
  const client = tx || prisma;

  // Check for duplicate SKU
  const existingSku = await client.product.findFirst({
    where: { sku: data.sku, organizationId },
  });
  if (existingSku) {
    throw new Error(`Product with SKU "${data.sku}" already exists`);
  }

  // Check for duplicate barcode if provided
  if (data.barcode) {
    const existingBarcode = await client.product.findFirst({
      where: { barcode: data.barcode, organizationId },
    });
    if (existingBarcode) {
      throw new Error(`Product with barcode "${data.barcode}" already exists`);
    }
  }

  const product = await client.product.create({
    data: {
      name: data.name,
      description: data.description,
      sku: data.sku,
      barcode: data.barcode,
      status: data.status || 'ACTIVE',
      costPrice: data.costPrice || 0,
      retailPrice: data.retailPrice,
      isTaxable: data.isTaxable ?? true,
      taxRate: data.taxRate,
      weight: data.weight,
      weightUnit: data.weightUnit || 'oz',
      dimensions: data.dimensions,
      trackInventory: data.trackInventory ?? true,
      lowStockThreshold: data.lowStockThreshold ?? 5,
      reorderPoint: data.reorderPoint ?? 10,
      reorderQuantity: data.reorderQuantity ?? 25,
      brand: data.brand,
      manufacturer: data.manufacturer,
      notes: data.notes,
      imageUrl: data.imageUrl,
      categoryId: data.categoryId,
      preferredVendorId: data.preferredVendorId,
      organizationId,
    },
  });

  // Create default inventory item at main location
  if (data.trackInventory !== false) {
    await client.inventoryItem.create({
      data: {
        productId: product.id,
        location: 'main',
        quantity: 0,
        reservedQty: 0,
        availableQty: 0,
        organizationId,
      },
    });
  }

  return product.id;
}

/**
 * Update a product
 */
export async function updateProduct(
  data: ProductUpdateInput,
  organizationId: string,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const client = tx || prisma;

  const existing = await client.product.findFirst({
    where: { id: data.id, organizationId },
  });
  if (!existing) {
    throw new Error('Product not found');
  }

  // Check for duplicate SKU if changing
  if (data.sku && data.sku !== existing.sku) {
    const existingSku = await client.product.findFirst({
      where: { sku: data.sku, organizationId, id: { not: data.id } },
    });
    if (existingSku) {
      throw new Error(`Product with SKU "${data.sku}" already exists`);
    }
  }

  // Check for duplicate barcode if changing
  if (data.barcode && data.barcode !== existing.barcode) {
    const existingBarcode = await client.product.findFirst({
      where: { barcode: data.barcode, organizationId, id: { not: data.id } },
    });
    if (existingBarcode) {
      throw new Error(`Product with barcode "${data.barcode}" already exists`);
    }
  }

  const { id, ...updateData } = data;

  await client.product.update({
    where: { id },
    data: updateData,
  });
}

/**
 * Delete a product (soft delete by setting status to DISCONTINUED)
 */
export async function deleteProduct(
  productId: string,
  organizationId: string,
  hardDelete = false,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const client = tx || prisma;

  const product = await client.product.findFirst({
    where: { id: productId, organizationId },
    include: {
      saleItems: { take: 1 },
      purchaseOrderItems: { take: 1 },
    },
  });

  if (!product) {
    throw new Error('Product not found');
  }

  // Check if product has been used in sales or purchase orders
  if (product.saleItems.length > 0 || product.purchaseOrderItems.length > 0) {
    if (hardDelete) {
      throw new Error('Cannot delete product that has been used in sales or purchase orders');
    }
    // Soft delete
    await client.product.update({
      where: { id: productId },
      data: { status: 'DISCONTINUED' },
    });
  } else if (hardDelete) {
    // Hard delete if no history
    await client.product.delete({
      where: { id: productId },
    });
  } else {
    // Soft delete
    await client.product.update({
      where: { id: productId },
      data: { status: 'DISCONTINUED' },
    });
  }
}

/**
 * Get a single product by ID
 */
export async function getProduct(
  productId: string,
  organizationId: string
) {
  const product = await prisma.product.findFirst({
    where: { id: productId, organizationId },
    include: {
      category: true,
      preferredVendor: true,
      inventoryItems: true,
      vendorProducts: {
        include: { vendor: true },
        where: { isActive: true },
      },
    },
  });

  if (!product) {
    throw new Error('Product not found');
  }

  // Calculate total inventory
  const totalQuantity = product.inventoryItems.reduce((sum, item) => sum + item.quantity, 0);
  const availableQuantity = product.inventoryItems.reduce((sum, item) => sum + item.availableQty, 0);
  const reservedQuantity = product.inventoryItems.reduce((sum, item) => sum + item.reservedQty, 0);

  return {
    ...product,
    totalQuantity,
    availableQuantity,
    reservedQuantity,
  };
}

/**
 * Get a product by barcode
 */
export async function getProductByBarcode(
  barcode: string,
  organizationId: string
) {
  const product = await prisma.product.findFirst({
    where: { barcode, organizationId },
    include: {
      inventoryItems: true,
    },
  });

  if (!product) {
    return null;
  }

  const availableQty = product.inventoryItems.reduce((sum, item) => sum + item.availableQty, 0);

  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode!, // barcode exists since we searched by it
    retailPrice: product.retailPrice,
    availableQty,
  };
}

/**
 * List products with filtering and pagination
 */
export async function listProducts(
  organizationId: string,
  filters: ProductSearchFilters = {},
  pagination: { page: number; pageSize: number } = { page: 1, pageSize: 50 }
): Promise<{ products: ProductWithInventory[]; total: number }> {
  const where: Prisma.ProductWhereInput = {
    organizationId,
  };

  // Apply search filter
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { sku: { contains: filters.search, mode: 'insensitive' } },
      { barcode: { contains: filters.search, mode: 'insensitive' } },
      { brand: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  // Apply category filter
  if (filters.categoryId) {
    where.categoryId = filters.categoryId;
  }

  // Apply status filter
  if (filters.status) {
    where.status = filters.status;
  }

  // Apply vendor filter
  if (filters.vendorId) {
    where.vendorProducts = {
      some: { vendorId: filters.vendorId, isActive: true },
    };
  }

  // Get total count
  const total = await prisma.product.count({ where });

  // Get products with inventory
  const products = await prisma.product.findMany({
    where,
    include: {
      inventoryItems: true,
    },
    orderBy: { name: 'asc' },
    skip: (pagination.page - 1) * pagination.pageSize,
    take: pagination.pageSize,
  });

  // Transform to include inventory totals
  const productsWithInventory: ProductWithInventory[] = products.map((product) => {
    const totalQuantity = product.inventoryItems.reduce((sum, item) => sum + item.quantity, 0);
    const availableQuantity = product.inventoryItems.reduce((sum, item) => sum + item.availableQty, 0);
    const reservedQuantity = product.inventoryItems.reduce((sum, item) => sum + item.reservedQty, 0);

    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      status: product.status,
      retailPrice: product.retailPrice,
      costPrice: product.costPrice,
      categoryId: product.categoryId,
      totalQuantity,
      availableQuantity,
      reservedQuantity,
    };
  });

  // Apply low stock filter after aggregation
  let filteredProducts = productsWithInventory;
  if (filters.lowStock) {
    const productIds = products.map(p => p.id);
    const lowStockProducts = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        trackInventory: true,
      },
      select: { id: true, lowStockThreshold: true },
    });

    const lowStockThresholds = new Map(lowStockProducts.map(p => [p.id, p.lowStockThreshold]));
    filteredProducts = productsWithInventory.filter((p) => {
      const threshold = lowStockThresholds.get(p.id);
      return threshold !== undefined && p.availableQuantity <= threshold;
    });
  }

  return { products: filteredProducts, total };
}

// ============================================
// Category Service
// ============================================

/**
 * Create a category
 */
export async function createCategory(
  data: CategoryCreateInput,
  organizationId: string,
  tx?: Prisma.TransactionClient
): Promise<string> {
  const client = tx || prisma;

  // Check for duplicate slug
  const existing = await client.productCategory.findFirst({
    where: { slug: data.slug, organizationId },
  });
  if (existing) {
    throw new Error(`Category with slug "${data.slug}" already exists`);
  }

  // Validate parent if provided
  if (data.parentId) {
    const parent = await client.productCategory.findFirst({
      where: { id: data.parentId, organizationId },
    });
    if (!parent) {
      throw new Error('Parent category not found');
    }
  }

  const category = await client.productCategory.create({
    data: {
      name: data.name,
      description: data.description,
      slug: data.slug,
      sortOrder: data.sortOrder ?? 0,
      isActive: data.isActive ?? true,
      parentId: data.parentId,
      organizationId,
    },
  });

  return category.id;
}

/**
 * Update a category
 */
export async function updateCategory(
  data: CategoryUpdateInput,
  organizationId: string,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const client = tx || prisma;

  const existing = await client.productCategory.findFirst({
    where: { id: data.id, organizationId },
  });
  if (!existing) {
    throw new Error('Category not found');
  }

  // Check for duplicate slug if changing
  if (data.slug && data.slug !== existing.slug) {
    const duplicateSlug = await client.productCategory.findFirst({
      where: { slug: data.slug, organizationId, id: { not: data.id } },
    });
    if (duplicateSlug) {
      throw new Error(`Category with slug "${data.slug}" already exists`);
    }
  }

  // Prevent circular parent reference
  if (data.parentId === data.id) {
    throw new Error('Category cannot be its own parent');
  }

  const { id, ...updateData } = data;

  await client.productCategory.update({
    where: { id },
    data: updateData,
  });
}

/**
 * Delete a category
 */
export async function deleteCategory(
  categoryId: string,
  organizationId: string,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const client = tx || prisma;

  const category = await client.productCategory.findFirst({
    where: { id: categoryId, organizationId },
    include: {
      products: { take: 1 },
      children: { take: 1 },
    },
  });

  if (!category) {
    throw new Error('Category not found');
  }

  if (category.products.length > 0) {
    throw new Error('Cannot delete category with products. Reassign products first.');
  }

  if (category.children.length > 0) {
    throw new Error('Cannot delete category with subcategories. Delete subcategories first.');
  }

  await client.productCategory.delete({
    where: { id: categoryId },
  });
}

/**
 * List categories as a tree structure
 */
export async function listCategoriesTree(
  organizationId: string,
  includeInactive = false
): Promise<CategoryTreeNode[]> {
  const where: Prisma.ProductCategoryWhereInput = { organizationId };
  if (!includeInactive) {
    where.isActive = true;
  }

  const categories = await prisma.productCategory.findMany({
    where,
    include: {
      _count: { select: { products: true } },
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  // Build tree structure
  const categoryMap = new Map<string, CategoryTreeNode>();
  const roots: CategoryTreeNode[] = [];

  // First pass: create all nodes
  for (const cat of categories) {
    categoryMap.set(cat.id, {
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      parentId: cat.parentId,
      sortOrder: cat.sortOrder,
      isActive: cat.isActive,
      productCount: cat._count.products,
      children: [],
    });
  }

  // Second pass: build tree
  for (const cat of categories) {
    const node = categoryMap.get(cat.id)!;
    if (cat.parentId) {
      const parent = categoryMap.get(cat.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * List categories flat
 */
export async function listCategories(
  organizationId: string,
  includeInactive = false
) {
  const where: Prisma.ProductCategoryWhereInput = { organizationId };
  if (!includeInactive) {
    where.isActive = true;
  }

  return prisma.productCategory.findMany({
    where,
    include: {
      parent: true,
      _count: { select: { products: true } },
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

/**
 * Generate a unique SKU
 */
export async function generateSku(
  prefix: string,
  organizationId: string
): Promise<string> {
  const count = await prisma.product.count({
    where: { organizationId, sku: { startsWith: prefix } },
  });

  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}

/**
 * Generate a slug from name
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}
