'use client';

/**
 * PurchaseOrderForm Component
 * Epic 17: Inventory & POS
 *
 * Form for creating and editing purchase orders.
 */

import { useState, useEffect } from 'react';
import { trpc } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

interface POItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitCost: number;
}

interface PurchaseOrderFormProps {
  purchaseOrderId?: string;
  vendorId?: string;
  productIds?: string[];
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function PurchaseOrderForm({
  purchaseOrderId,
  vendorId: initialVendorId,
  productIds: initialProductIds,
  onSuccess,
  onCancel,
}: PurchaseOrderFormProps) {
  const utils = trpc.useUtils();
  const isEdit = !!purchaseOrderId;

  const [vendorId, setVendorId] = useState(initialVendorId || '');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<POItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');

  const { data: vendors } = trpc.inventory.listVendors.useQuery({
    isActive: true,
  });

  const { data: products } = trpc.inventory.listProducts.useQuery({
    status: 'ACTIVE',
    pageSize: 200,
  });

  const { data: existingPO } = trpc.inventory.getPurchaseOrder.useQuery(
    { id: purchaseOrderId! },
    { enabled: isEdit }
  );

  const createMutation = trpc.inventory.createPurchaseOrder.useMutation({
    onSuccess: () => {
      toast.success('Purchase order created');
      utils.inventory.listPurchaseOrders.invalidate();
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = trpc.inventory.updatePurchaseOrder.useMutation({
    onSuccess: () => {
      toast.success('Purchase order updated');
      utils.inventory.listPurchaseOrders.invalidate();
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Initialize with existing PO data
  useEffect(() => {
    if (existingPO) {
      setVendorId(existingPO.vendorId);
      setExpectedDeliveryDate(
        existingPO.expectedDate
          ? new Date(existingPO.expectedDate).toISOString().split('T')[0]
          : ''
      );
      setNotes(existingPO.notes || '');
      setItems(
        existingPO.items.map((item) => ({
          productId: item.productId,
          productName: item.product.name,
          sku: item.product.sku,
          quantity: item.orderedQty,
          unitCost: Number(item.unitCost),
        }))
      );
    }
  }, [existingPO]);

  // Initialize with pre-selected products
  useEffect(() => {
    if (initialProductIds && products && !isEdit) {
      const newItems: POItem[] = [];
      for (const productId of initialProductIds) {
        const product = products.products.find((p) => p.id === productId);
        if (product && !items.some((i) => i.productId === productId)) {
          newItems.push({
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            quantity: 10, // Default reorder quantity
            unitCost: Number(product.costPrice),
          });
        }
      }
      if (newItems.length > 0) {
        setItems((prev) => [...prev, ...newItems]);
      }
    }
  }, [initialProductIds, products, isEdit]);

  const handleAddProduct = () => {
    if (!selectedProductId) {
      toast.error('Please select a product');
      return;
    }

    if (items.some((i) => i.productId === selectedProductId)) {
      toast.error('Product already added');
      return;
    }

    const product = products?.products.find((p) => p.id === selectedProductId);
    if (!product) return;

    setItems((prev) => [
      ...prev,
      {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        quantity: 10, // Default reorder quantity
        unitCost: Number(product.costPrice),
      },
    ]);
    setSelectedProductId('');
  };

  const handleRemoveItem = (productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  };

  const handleUpdateItem = (
    productId: string,
    field: 'quantity' | 'unitCost',
    value: number
  ) => {
    setItems((prev) =>
      prev.map((item) =>
        item.productId === productId ? { ...item, [field]: value } : item
      )
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!vendorId) {
      toast.error('Please select a vendor');
      return;
    }

    if (items.length === 0) {
      toast.error('Please add at least one item');
      return;
    }

    if (isEdit) {
      updateMutation.mutate({
        id: purchaseOrderId!,
        expectedDate: expectedDeliveryDate
          ? new Date(expectedDeliveryDate)
          : undefined,
        notes: notes || undefined,
      });
    } else {
      createMutation.mutate({
        vendorId,
        expectedDate: expectedDeliveryDate
          ? new Date(expectedDeliveryDate)
          : undefined,
        notes: notes || undefined,
        items: items.map((item) => ({
          productId: item.productId,
          orderedQty: item.quantity,
          unitCost: item.unitCost,
        })),
      });
    }
  };

  const totalAmount = items.reduce(
    (sum, item) => sum + item.quantity * item.unitCost,
    0
  );

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{isEdit ? 'Edit Purchase Order' : 'New Purchase Order'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vendor">Vendor *</Label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  {vendors?.vendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="expectedDeliveryDate">Expected Delivery</Label>
              <Input
                id="expectedDeliveryDate"
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes for this order"
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Order Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add Product */}
          <div className="flex gap-2">
            <Select value={selectedProductId} onValueChange={setSelectedProductId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select product to add" />
              </SelectTrigger>
              <SelectContent>
                {products?.products
                  .filter((p) => !items.some((i) => i.productId === p.id))
                  .map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name} ({product.sku})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button type="button" onClick={handleAddProduct}>
              Add
            </Button>
          </div>

          {/* Items Table */}
          {items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="w-32">Quantity</TableHead>
                  <TableHead className="w-32">Unit Cost</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.productId}>
                    <TableCell className="font-medium">{item.productName}</TableCell>
                    <TableCell className="text-muted-foreground">{item.sku}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) =>
                          handleUpdateItem(
                            item.productId,
                            'quantity',
                            parseInt(e.target.value, 10) || 1
                          )
                        }
                        className="w-20"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitCost}
                        onChange={(e) =>
                          handleUpdateItem(
                            item.productId,
                            'unitCost',
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-24"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.quantity * item.unitCost)}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveItem(item.productId)}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              No items added. Select products above to add to this order.
            </div>
          )}

          {/* Total */}
          {items.length > 0 && (
            <div className="flex justify-end">
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Total Amount</div>
                <div className="text-2xl font-bold">{formatCurrency(totalAmount)}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? 'Saving...'
            : isEdit
            ? 'Update Order'
            : 'Create Order'}
        </Button>
      </div>
    </form>
  );
}
