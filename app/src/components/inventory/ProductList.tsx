'use client';

/**
 * ProductList Component
 * Epic 17: Inventory & POS
 *
 * Displays a list/grid of products with filtering and search.
 */

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ProductStatus } from '@prisma/client';

interface ProductListProps {
  onSelectProduct?: (productId: string) => void;
  onEditProduct?: (productId: string) => void;
  selectable?: boolean;
}

export function ProductList({
  onSelectProduct,
  onEditProduct,
  selectable = false,
}: ProductListProps) {
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [status, setStatus] = useState<ProductStatus | undefined>();
  const [lowStock, setLowStock] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading } = trpc.inventory.listProducts.useQuery({
    search: search || undefined,
    categoryId,
    status,
    lowStock: lowStock || undefined,
    page,
    pageSize,
  });

  const { data: categories } = trpc.inventory.listCategories.useQuery({
    includeInactive: false,
    asTree: false,
  });

  const formatCurrency = (value: number | string) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(num);
  };

  const getStatusColor = (status: ProductStatus) => {
    switch (status) {
      case 'ACTIVE':
        return 'default';
      case 'INACTIVE':
        return 'secondary';
      case 'DISCONTINUED':
        return 'destructive';
      case 'OUT_OF_STOCK':
        return 'outline';
      default:
        return 'default';
    }
  };

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Products</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Search products..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select
            value={categoryId || 'all'}
            onValueChange={(v) => {
              setCategoryId(v === 'all' ? undefined : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {Array.isArray(categories) && categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={status || 'all'}
            onValueChange={(v) => {
              setStatus(v === 'all' ? undefined : (v as ProductStatus));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
              <SelectItem value="OUT_OF_STOCK">Out of Stock</SelectItem>
              <SelectItem value="DISCONTINUED">Discontinued</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={lowStock ? 'default' : 'outline'}
            onClick={() => {
              setLowStock(!lowStock);
              setPage(1);
            }}
          >
            Low Stock Only
          </Button>
        </div>

        {/* Products Table */}
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
                  <TableHead>Price</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.products.map((product) => (
                  <TableRow
                    key={product.id}
                    className={selectable ? 'cursor-pointer hover:bg-muted' : ''}
                    onClick={selectable ? () => onSelectProduct?.(product.id) : undefined}
                  >
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell className="text-muted-foreground">{product.sku}</TableCell>
                    <TableCell>{formatCurrency(product.retailPrice.toString())}</TableCell>
                    <TableCell>
                      <span
                        className={
                          product.availableQuantity <= 0
                            ? 'text-destructive font-medium'
                            : product.availableQuantity <= 5
                            ? 'text-yellow-600 font-medium'
                            : ''
                        }
                      >
                        {product.availableQuantity}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusColor(product.status)}>
                        {product.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {onEditProduct && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditProduct(product.id);
                          }}
                        >
                          Edit
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {data?.products.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No products found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Showing {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, data?.total || 0)} of{' '}
                  {data?.total || 0}
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
