'use client';

/**
 * StockAdjustment Component
 * Epic 17: Inventory & POS
 *
 * Form for adjusting stock quantities with reason tracking.
 */

import { useState } from 'react';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

interface StockAdjustmentProps {
  productId?: string;
  productName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type AdjustmentType = 'ADJUSTMENT' | 'DAMAGE' | 'RETURN' | 'CORRECTION' | 'SHRINKAGE';

const adjustmentTypes: { value: AdjustmentType; label: string; description: string }[] = [
  { value: 'ADJUSTMENT', label: 'General Adjustment', description: 'Standard inventory adjustment' },
  { value: 'DAMAGE', label: 'Damage', description: 'Items damaged and removed from inventory' },
  { value: 'RETURN', label: 'Return', description: 'Customer return added back to inventory' },
  { value: 'CORRECTION', label: 'Correction', description: 'Fix inventory count error' },
  { value: 'SHRINKAGE', label: 'Shrinkage', description: 'Theft, loss, or unexplained shortage' },
];

export function StockAdjustment({
  productId,
  productName,
  open,
  onOpenChange,
  onSuccess,
}: StockAdjustmentProps) {
  const utils = trpc.useUtils();
  const [selectedProductId, setSelectedProductId] = useState(productId || '');
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>('ADJUSTMENT');
  const [quantity, setQuantity] = useState('');
  const [isPositive, setIsPositive] = useState(true);
  const [reason, setReason] = useState('');
  const [locationId, setLocationId] = useState('default');

  const { data: products } = trpc.inventory.listProducts.useQuery(
    { pageSize: 100 },
    { enabled: !productId }
  );

  const { data: stockData } = trpc.inventory.getStock.useQuery(
    { productId: selectedProductId || productId || '' },
    { enabled: !!(selectedProductId || productId) }
  );

  const adjustMutation = trpc.inventory.adjustStock.useMutation({
    onSuccess: () => {
      toast.success('Stock adjusted successfully');
      utils.inventory.listProducts.invalidate();
      utils.inventory.getStock.invalidate();
      resetForm();
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    if (!productId) setSelectedProductId('');
    setAdjustmentType('ADJUSTMENT');
    setQuantity('');
    setIsPositive(true);
    setReason('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const productToAdjust = productId || selectedProductId;
    if (!productToAdjust) {
      toast.error('Please select a product');
      return;
    }

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }

    if (!reason.trim()) {
      toast.error('Please provide a reason for the adjustment');
      return;
    }

    const adjustedQuantity = isPositive ? qty : -qty;

    adjustMutation.mutate({
      productId: productToAdjust,
      location: locationId,
      quantity: adjustedQuantity,
      reason: `${adjustmentType}: ${reason}`,
    });
  };

  const currentStock = Array.isArray(stockData) && stockData.length > 0 ? stockData[0].availableQty : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust Stock</DialogTitle>
          <DialogDescription>
            {productName
              ? `Adjust inventory for ${productName}`
              : 'Select a product and adjust its inventory'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!productId && (
            <div className="space-y-2">
              <Label htmlFor="product">Product *</Label>
              <Select
                value={selectedProductId}
                onValueChange={setSelectedProductId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a product" />
                </SelectTrigger>
                <SelectContent>
                  {products?.products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name} ({product.sku})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {(productId || selectedProductId) && stockData && Array.isArray(stockData) && stockData.length > 0 && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Current Stock</CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <div className="text-muted-foreground">On Hand</div>
                    <div className="font-semibold">{stockData[0].quantity}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Reserved</div>
                    <div className="font-semibold">{stockData[0].reservedQty}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Available</div>
                    <div className="font-semibold">{stockData[0].availableQty}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-2">
            <Label htmlFor="type">Adjustment Type *</Label>
            <Select
              value={adjustmentType}
              onValueChange={(v) => setAdjustmentType(v as AdjustmentType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {adjustmentTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {adjustmentTypes.find((t) => t.value === adjustmentType)?.description}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity *</Label>
            <div className="flex gap-2">
              <Select
                value={isPositive ? 'add' : 'remove'}
                onValueChange={(v) => setIsPositive(v === 'add')}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">+ Add</SelectItem>
                  <SelectItem value="remove">- Remove</SelectItem>
                </SelectContent>
              </Select>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Enter quantity"
                className="flex-1"
              />
            </div>
            {quantity && (
              <p className="text-sm text-muted-foreground">
                New available stock will be:{' '}
                <span className="font-medium">
                  {currentStock + (isPositive ? parseInt(quantity, 10) || 0 : -(parseInt(quantity, 10) || 0))}
                </span>
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason *</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe the reason for this adjustment"
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={adjustMutation.isPending}>
              {adjustMutation.isPending ? 'Adjusting...' : 'Adjust Stock'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
