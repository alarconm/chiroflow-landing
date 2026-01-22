'use client';

/**
 * POSTerminal Component
 * Epic 17: Inventory & POS
 *
 * Point of Sale interface for processing sales.
 */

import { useState, useRef, useEffect } from 'react';
import { trpc } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import type { POSPaymentMethod } from '@prisma/client';

interface CartItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  discount: number;
}

interface POSTerminalProps {
  patientId?: string;
  onSaleComplete?: (saleId: string) => void;
}

export function POSTerminal({ patientId, onSaleComplete }: POSTerminalProps) {
  const utils = trpc.useUtils();
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<POSPaymentMethod>('CASH');
  const [amountTendered, setAmountTendered] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState(patientId || '');
  const [isProcessing, setIsProcessing] = useState(false);

  const { data: products } = trpc.inventory.listProducts.useQuery({
    status: 'ACTIVE',
    pageSize: 200,
  });

  const lookupMutation = trpc.inventory.lookupBarcode.useMutation();

  const createSaleMutation = trpc.inventory.createSale.useMutation({
    onSuccess: (sale) => {
      toast.success(`Sale created: ${sale.id}`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const completeSaleMutation = trpc.inventory.completeSale.useMutation({
    onSuccess: (result) => {
      toast.success(`Sale completed! Change: $${result.changeGiven.toFixed(2)}`);
      setCart([]);
      setAmountTendered('');
      utils.inventory.listProducts.invalidate();
      onSaleComplete?.(result.saleId);
    },
    onError: (error) => {
      toast.error(error.message);
      setIsProcessing(false);
    },
  });

  // Focus barcode input on mount
  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, []);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  const addToCart = (product: {
    id: string;
    name: string;
    sku: string;
    retailPrice: number | string;
  }) => {
    const existingItem = cart.find((item) => item.productId === product.id);

    if (existingItem) {
      setCart((prev) =>
        prev.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      setCart((prev) => [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          quantity: 1,
          unitPrice:
            typeof product.retailPrice === 'string'
              ? parseFloat(product.retailPrice)
              : product.retailPrice,
          discount: 0,
        },
      ]);
    }
  };

  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!barcodeInput.trim()) return;

    try {
      const result = await lookupMutation.mutateAsync({
        barcode: barcodeInput.trim(),
      });

      if (result.found && result.product) {
        addToCart({
          id: result.product.id,
          name: result.product.name,
          sku: result.product.sku,
          retailPrice: Number(result.product.retailPrice),
        });
        toast.success(`Added: ${result.product.name}`);
      } else {
        toast.error('Product not found');
      }
    } catch (error) {
      toast.error('Failed to lookup barcode');
    }

    setBarcodeInput('');
    barcodeInputRef.current?.focus();
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart((prev) =>
      prev.map((item) =>
        item.productId === productId ? { ...item, quantity } : item
      )
    );
  };

  const updateDiscount = (productId: string, discount: number) => {
    setCart((prev) =>
      prev.map((item) =>
        item.productId === productId
          ? { ...item, discount: Math.max(0, Math.min(discount, item.unitPrice)) }
          : item
      )
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  const clearCart = () => {
    if (cart.length > 0 && confirm('Clear all items from cart?')) {
      setCart([]);
    }
  };

  // Calculate totals
  const subtotal = cart.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );
  const totalDiscount = cart.reduce(
    (sum, item) => sum + item.discount * item.quantity,
    0
  );
  // In a real implementation, tax rate would come from organization settings
  const taxRate = 0.0725; // 7.25%
  const taxableAmount = subtotal - totalDiscount;
  const taxAmount = taxableAmount * taxRate;
  const grandTotal = taxableAmount + taxAmount;

  const changeDue =
    selectedPaymentMethod === 'CASH' && amountTendered
      ? parseFloat(amountTendered) - grandTotal
      : 0;

  const handleCompleteSale = async () => {
    if (cart.length === 0) {
      toast.error('Cart is empty');
      return;
    }

    if (
      selectedPaymentMethod === 'CASH' &&
      parseFloat(amountTendered || '0') < grandTotal
    ) {
      toast.error('Insufficient payment amount');
      return;
    }

    setIsProcessing(true);

    try {
      // First create the sale
      const sale = await createSaleMutation.mutateAsync({
        patientId: selectedPatientId || undefined,
        paymentMethod: selectedPaymentMethod,
        items: cart.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: item.discount,
        })),
        notes: undefined,
      });

      // Then complete the sale with payment
      await completeSaleMutation.mutateAsync({
        id: sale.id,
        paymentMethod: selectedPaymentMethod,
        amountTendered:
          selectedPaymentMethod === 'CASH'
            ? parseFloat(amountTendered)
            : grandTotal,
      });
    } catch (error) {
      setIsProcessing(false);
    }
  };

  return (
    <div className="grid grid-cols-3 gap-6 h-full">
      {/* Product Selection */}
      <Card className="col-span-2">
        <CardHeader className="pb-3">
          <CardTitle>Products</CardTitle>
          {/* Barcode Input */}
          <form onSubmit={handleBarcodeSubmit} className="flex gap-2 mt-2">
            <Input
              ref={barcodeInputRef}
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              placeholder="Scan or enter barcode..."
              className="font-mono flex-1"
            />
            <Button type="submit" disabled={lookupMutation.isPending}>
              {lookupMutation.isPending ? 'Looking up...' : 'Add'}
            </Button>
          </form>
        </CardHeader>
        <CardContent>
          {/* Quick Select Products */}
          <div className="grid grid-cols-4 gap-2 max-h-[400px] overflow-y-auto">
            {products?.products.slice(0, 24).map((product) => (
              <Button
                key={product.id}
                variant="outline"
                className="h-auto py-3 flex flex-col items-start"
                onClick={() => addToCart({
                  id: product.id,
                  name: product.name,
                  sku: product.sku,
                  retailPrice: Number(product.retailPrice),
                })}
              >
                <span className="font-medium text-xs truncate w-full text-left">
                  {product.name}
                </span>
                <span className="text-muted-foreground text-xs">
                  {formatCurrency(Number(product.retailPrice))}
                </span>
                {product.availableQuantity <= 5 && (
                  <Badge variant="outline" className="mt-1 text-xs">
                    {product.availableQuantity} left
                  </Badge>
                )}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Cart & Checkout */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Cart</CardTitle>
            {cart.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearCart}>
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col h-[calc(100%-60px)]">
          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                Cart is empty
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="w-16">Qty</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cart.map((item) => (
                    <TableRow key={item.productId}>
                      <TableCell>
                        <div className="text-sm font-medium">{item.productName}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatCurrency(item.unitPrice)} each
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) =>
                            updateQuantity(
                              item.productId,
                              parseInt(e.target.value, 10) || 1
                            )
                          }
                          className="w-16 h-8 text-center"
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(
                          (item.unitPrice - item.discount) * item.quantity
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => removeFromCart(item.productId)}
                        >
                          x
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <Separator className="my-4" />

          {/* Totals */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {totalDiscount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Discount</span>
                <span>-{formatCurrency(totalDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax (7.25%)</span>
              <span>{formatCurrency(taxAmount)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold pt-2 border-t">
              <span>Total</span>
              <span>{formatCurrency(grandTotal)}</span>
            </div>
          </div>

          <Separator className="my-4" />

          {/* Payment */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select
                value={selectedPaymentMethod}
                onValueChange={(v) => setSelectedPaymentMethod(v as POSPaymentMethod)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="CREDIT_CARD">Credit Card</SelectItem>
                  <SelectItem value="DEBIT_CARD">Debit Card</SelectItem>
                  <SelectItem value="CHECK">Check</SelectItem>
                  <SelectItem value="STORE_CREDIT">Store Credit</SelectItem>
                  <SelectItem value="INSURANCE">Insurance</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedPaymentMethod === 'CASH' && (
              <div className="space-y-2">
                <Label>Amount Tendered</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amountTendered}
                  onChange={(e) => setAmountTendered(e.target.value)}
                  placeholder="0.00"
                />
                {changeDue > 0 && (
                  <div className="text-lg font-bold text-green-600">
                    Change Due: {formatCurrency(changeDue)}
                  </div>
                )}
              </div>
            )}

            <Button
              className="w-full"
              size="lg"
              onClick={handleCompleteSale}
              disabled={cart.length === 0 || isProcessing}
            >
              {isProcessing ? 'Processing...' : `Complete Sale - ${formatCurrency(grandTotal)}`}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
