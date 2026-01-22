'use client';

/**
 * StockLevels Component
 * Epic 17: Inventory & POS
 *
 * Displays inventory stock levels across locations.
 */

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Skeleton } from '@/components/ui/skeleton';

interface StockLevelsProps {
  onAdjustStock?: (productId: string, productName: string) => void;
}

export function StockLevels({ onAdjustStock }: StockLevelsProps) {
  const [search, setSearch] = useState('');
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const { data, isLoading } = trpc.inventory.listProducts.useQuery({
    search: search || undefined,
    lowStock: showLowStockOnly || undefined,
    page,
    pageSize,
  });

  const formatCurrency = (value: number | string) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(num);
  };

  // Default low stock threshold since ProductWithInventory doesn't include it
  const DEFAULT_LOW_STOCK_THRESHOLD = 5;

  const getStockStatus = (quantity: number, lowThreshold: number = DEFAULT_LOW_STOCK_THRESHOLD) => {
    if (quantity <= 0) return { label: 'Out of Stock', variant: 'destructive' as const };
    if (quantity <= lowThreshold) return { label: 'Low Stock', variant: 'outline' as const };
    return { label: 'In Stock', variant: 'default' as const };
  };

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stock Levels</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1">
            <Input
              placeholder="Search by product name or SKU..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Button
            variant={showLowStockOnly ? 'default' : 'outline'}
            onClick={() => {
              setShowLowStockOnly(!showLowStockOnly);
              setPage(1);
            }}
          >
            Low Stock Only
          </Button>
        </div>

        {/* Stock Table */}
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">On Hand</TableHead>
                  <TableHead className="text-right">Reserved</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-right">Unit Cost</TableHead>
                  <TableHead className="text-right">Total Value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.products.map((product) => {
                  const stockStatus = getStockStatus(
                    product.availableQuantity,
                    DEFAULT_LOW_STOCK_THRESHOLD
                  );
                  const totalValue =
                    product.availableQuantity * Number(product.costPrice);

                  return (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {product.sku}
                      </TableCell>
                      <TableCell className="text-right">
                        {product.totalQuantity}
                      </TableCell>
                      <TableCell className="text-right">
                        {product.reservedQuantity}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        <span
                          className={
                            product.availableQuantity <= 0
                              ? 'text-destructive'
                              : product.availableQuantity <= DEFAULT_LOW_STOCK_THRESHOLD
                              ? 'text-yellow-600'
                              : ''
                          }
                        >
                          {product.availableQuantity}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(product.costPrice.toString())}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(totalValue)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={stockStatus.variant}>
                          {stockStatus.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {onAdjustStock && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onAdjustStock(product.id, product.name)}
                          >
                            Adjust
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {data?.products.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-center text-muted-foreground"
                    >
                      No products found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {/* Summary */}
            {data && data.products.length > 0 && (
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Total Products</div>
                    <div className="text-lg font-semibold">{data.total}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Total Units</div>
                    <div className="text-lg font-semibold">
                      {data.products.reduce((sum, p) => sum + p.totalQuantity, 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Total Value</div>
                    <div className="text-lg font-semibold">
                      {formatCurrency(
                        data.products.reduce(
                          (sum, p) =>
                            sum + p.availableQuantity * Number(p.costPrice),
                          0
                        )
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Low Stock Items</div>
                    <div className="text-lg font-semibold text-yellow-600">
                      {
                        data.products.filter(
                          (p) => p.availableQuantity <= DEFAULT_LOW_STOCK_THRESHOLD
                        ).length
                      }
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Showing {(page - 1) * pageSize + 1} -{' '}
                  {Math.min(page * pageSize, data?.total || 0)} of {data?.total || 0}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
