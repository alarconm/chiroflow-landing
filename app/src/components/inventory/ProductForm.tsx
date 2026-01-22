'use client';

/**
 * ProductForm Component
 * Epic 17: Inventory & POS
 *
 * Form for creating and editing products.
 */

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { trpc } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import type { ProductStatus } from '@prisma/client';

const productSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().optional(),
  sku: z.string().min(1, 'SKU is required').max(50),
  barcode: z.string().max(50).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'DISCONTINUED', 'OUT_OF_STOCK']),
  costPrice: z.number().min(0),
  retailPrice: z.number().min(0, 'Price is required'),
  isTaxable: z.boolean(),
  taxRate: z.number().min(0).max(1).optional(),
  weight: z.number().min(0).optional(),
  weightUnit: z.string().default('oz'),
  trackInventory: z.boolean(),
  lowStockThreshold: z.number().int().min(0),
  reorderPoint: z.number().int().min(0),
  reorderQuantity: z.number().int().min(1),
  brand: z.string().optional(),
  manufacturer: z.string().optional(),
  notes: z.string().optional(),
  categoryId: z.string().optional(),
  preferredVendorId: z.string().optional(),
});

interface ProductFormData {
  name: string;
  description?: string;
  sku: string;
  barcode?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'DISCONTINUED' | 'OUT_OF_STOCK';
  costPrice: number;
  retailPrice: number;
  isTaxable: boolean;
  taxRate?: number;
  weight?: number;
  weightUnit?: string;
  trackInventory: boolean;
  lowStockThreshold: number;
  reorderPoint: number;
  reorderQuantity: number;
  brand?: string;
  manufacturer?: string;
  notes?: string;
  categoryId?: string;
  preferredVendorId?: string;
}

interface ProductFormProps {
  productId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function ProductForm({ productId, onSuccess, onCancel }: ProductFormProps) {
  const utils = trpc.useUtils();
  const isEdit = !!productId;

  const { data: product, isLoading: loadingProduct } = trpc.inventory.getProduct.useQuery(
    { id: productId! },
    { enabled: isEdit }
  );

  const { data: categories } = trpc.inventory.listCategories.useQuery({
    includeInactive: false,
    asTree: false,
  });

  const { data: vendors } = trpc.inventory.listVendors.useQuery({
    isActive: true,
  });

  const createMutation = trpc.inventory.createProduct.useMutation({
    onSuccess: () => {
      toast.success('Product created successfully');
      utils.inventory.listProducts.invalidate();
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = trpc.inventory.updateProduct.useMutation({
    onSuccess: () => {
      toast.success('Product updated successfully');
      utils.inventory.listProducts.invalidate();
      utils.inventory.getProduct.invalidate({ id: productId });
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '',
      description: '',
      sku: '',
      barcode: '',
      status: 'ACTIVE',
      costPrice: 0,
      retailPrice: 0,
      isTaxable: true,
      taxRate: undefined,
      weight: undefined,
      weightUnit: 'oz',
      trackInventory: true,
      lowStockThreshold: 5,
      reorderPoint: 10,
      reorderQuantity: 25,
      brand: '',
      manufacturer: '',
      notes: '',
      categoryId: undefined,
      preferredVendorId: undefined,
    },
  });

  // Populate form when editing
  useEffect(() => {
    if (product) {
      form.reset({
        name: product.name,
        description: product.description || '',
        sku: product.sku,
        barcode: product.barcode || '',
        status: product.status as ProductStatus,
        costPrice: Number(product.costPrice),
        retailPrice: Number(product.retailPrice),
        isTaxable: product.isTaxable,
        taxRate: product.taxRate ? Number(product.taxRate) : undefined,
        weight: product.weight ? Number(product.weight) : undefined,
        weightUnit: product.weightUnit || 'oz',
        trackInventory: product.trackInventory,
        lowStockThreshold: product.lowStockThreshold,
        reorderPoint: product.reorderPoint,
        reorderQuantity: product.reorderQuantity,
        brand: product.brand || '',
        manufacturer: product.manufacturer || '',
        notes: product.notes || '',
        categoryId: product.categoryId || undefined,
        preferredVendorId: product.preferredVendorId || undefined,
      });
    }
  }, [product, form]);

  const onSubmit = (data: ProductFormData) => {
    if (isEdit) {
      updateMutation.mutate({
        id: productId!,
        ...data,
      });
    } else {
      createMutation.mutate(data);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  if (isEdit && loadingProduct) {
    return <div>Loading...</div>;
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Product Name *</Label>
              <Input
                id="name"
                {...form.register('name')}
                placeholder="Enter product name"
              />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sku">SKU *</Label>
              <Input
                id="sku"
                {...form.register('sku')}
                placeholder="e.g., SUP-001"
              />
              {form.formState.errors.sku && (
                <p className="text-sm text-destructive">{form.formState.errors.sku.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="barcode">Barcode (UPC/EAN)</Label>
              <Input
                id="barcode"
                {...form.register('barcode')}
                placeholder="Enter barcode"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={form.watch('status')}
                onValueChange={(v) => form.setValue('status', v as ProductStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                  <SelectItem value="OUT_OF_STOCK">Out of Stock</SelectItem>
                  <SelectItem value="DISCONTINUED">Discontinued</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              {...form.register('description')}
              placeholder="Enter product description"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="categoryId">Category</Label>
              <Select
                value={form.watch('categoryId') || 'none'}
                onValueChange={(v) => form.setValue('categoryId', v === 'none' ? undefined : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Category</SelectItem>
                  {Array.isArray(categories) && categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand">Brand</Label>
              <Input
                id="brand"
                {...form.register('brand')}
                placeholder="Enter brand name"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="costPrice">Cost Price ($)</Label>
              <Input
                id="costPrice"
                type="number"
                step="0.01"
                min="0"
                {...form.register('costPrice')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="retailPrice">Retail Price ($) *</Label>
              <Input
                id="retailPrice"
                type="number"
                step="0.01"
                min="0"
                {...form.register('retailPrice')}
              />
              {form.formState.errors.retailPrice && (
                <p className="text-sm text-destructive">{form.formState.errors.retailPrice.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="taxRate">Tax Rate (override)</Label>
              <Input
                id="taxRate"
                type="number"
                step="0.0001"
                min="0"
                max="1"
                placeholder="e.g., 0.0725"
                {...form.register('taxRate')}
              />
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="isTaxable"
              checked={form.watch('isTaxable')}
              onCheckedChange={(checked) => form.setValue('isTaxable', checked)}
            />
            <Label htmlFor="isTaxable">This product is taxable</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inventory Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="trackInventory"
              checked={form.watch('trackInventory')}
              onCheckedChange={(checked) => form.setValue('trackInventory', checked)}
            />
            <Label htmlFor="trackInventory">Track inventory for this product</Label>
          </div>

          {form.watch('trackInventory') && (
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lowStockThreshold">Low Stock Threshold</Label>
                <Input
                  id="lowStockThreshold"
                  type="number"
                  min="0"
                  {...form.register('lowStockThreshold')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reorderPoint">Reorder Point</Label>
                <Input
                  id="reorderPoint"
                  type="number"
                  min="0"
                  {...form.register('reorderPoint')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reorderQuantity">Reorder Quantity</Label>
                <Input
                  id="reorderQuantity"
                  type="number"
                  min="1"
                  {...form.register('reorderQuantity')}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="preferredVendorId">Preferred Vendor</Label>
            <Select
              value={form.watch('preferredVendorId') || 'none'}
              onValueChange={(v) => form.setValue('preferredVendorId', v === 'none' ? undefined : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select vendor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Preferred Vendor</SelectItem>
                {vendors?.vendors.map((vendor) => (
                  <SelectItem key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Additional Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="manufacturer">Manufacturer</Label>
              <Input
                id="manufacturer"
                {...form.register('manufacturer')}
                placeholder="Enter manufacturer"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="weight">Weight</Label>
                <Input
                  id="weight"
                  type="number"
                  step="0.01"
                  min="0"
                  {...form.register('weight')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weightUnit">Unit</Label>
                <Select
                  value={form.watch('weightUnit')}
                  onValueChange={(v) => form.setValue('weightUnit', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="oz">oz</SelectItem>
                    <SelectItem value="lb">lb</SelectItem>
                    <SelectItem value="g">g</SelectItem>
                    <SelectItem value="kg">kg</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Internal Notes</Label>
            <Textarea
              id="notes"
              {...form.register('notes')}
              placeholder="Enter internal notes"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : isEdit ? 'Update Product' : 'Create Product'}
        </Button>
      </div>
    </form>
  );
}
