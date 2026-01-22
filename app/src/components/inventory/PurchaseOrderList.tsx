'use client';

/**
 * PurchaseOrderList Component
 * Epic 17: Inventory & POS
 *
 * Displays and manages purchase orders.
 */

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { Button } from '@/components/ui/button';
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
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import type { PurchaseOrderStatus } from '@prisma/client';

interface PurchaseOrderListProps {
  onEditOrder?: (orderId: string) => void;
  onViewOrder?: (orderId: string) => void;
  onCreateOrder?: () => void;
}

export function PurchaseOrderList({
  onEditOrder,
  onViewOrder,
  onCreateOrder,
}: PurchaseOrderListProps) {
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatus | 'all'>('all');
  const [vendorFilter, setVendorFilter] = useState<string | 'all'>('all');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading } = trpc.inventory.listPurchaseOrders.useQuery({
    status: statusFilter === 'all' ? undefined : statusFilter,
    vendorId: vendorFilter === 'all' ? undefined : vendorFilter,
    page,
    pageSize,
  });

  const { data: vendors } = trpc.inventory.listVendors.useQuery({
    isActive: true,
  });

  const submitMutation = trpc.inventory.submitPurchaseOrder.useMutation({
    onSuccess: () => {
      toast.success('Purchase order submitted');
      utils.inventory.listPurchaseOrders.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const cancelMutation = trpc.inventory.cancelPurchaseOrder.useMutation({
    onSuccess: () => {
      toast.success('Purchase order cancelled');
      utils.inventory.listPurchaseOrders.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const getStatusColor = (status: PurchaseOrderStatus) => {
    switch (status) {
      case 'DRAFT':
        return 'secondary';
      case 'SUBMITTED':
        return 'outline';
      case 'CONFIRMED':
        return 'default';
      case 'PARTIAL':
        return 'outline';
      case 'RECEIVED':
        return 'default';
      case 'CANCELLED':
        return 'destructive';
      default:
        return 'default';
    }
  };

  const formatCurrency = (value: number | string) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(num);
  };

  const formatDate = (date: Date | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleSubmit = (orderId: string) => {
    if (confirm('Submit this purchase order to the vendor?')) {
      submitMutation.mutate({ id: orderId });
    }
  };

  const handleCancel = (orderId: string) => {
    if (confirm('Cancel this purchase order?')) {
      cancelMutation.mutate({ id: orderId });
    }
  };

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Purchase Orders</CardTitle>
        <div className="flex items-center gap-4">
          <Select
            value={vendorFilter}
            onValueChange={(v) => {
              setVendorFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Vendor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vendors</SelectItem>
              {vendors?.vendors.map((vendor) => (
                <SelectItem key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v as PurchaseOrderStatus | 'all');
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="SUBMITTED">Submitted</SelectItem>
              <SelectItem value="CONFIRMED">Confirmed</SelectItem>
              <SelectItem value="PARTIAL">Partial</SelectItem>
              <SelectItem value="RECEIVED">Received</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          {onCreateOrder && (
            <Button onClick={onCreateOrder}>New Order</Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !data?.orders.length ? (
          <div className="text-center text-muted-foreground py-8">
            No purchase orders found
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expected</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">
                      {order.poNumber}
                    </TableCell>
                    <TableCell>{order.vendorName}</TableCell>
                    <TableCell className="text-right">
                      {order.itemCount}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(order.totalAmount.toString())}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusColor(order.status)}>
                        {order.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {formatDate(order.expectedDate)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(order.orderDate)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {onViewOrder && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onViewOrder(order.id)}
                          >
                            View
                          </Button>
                        )}
                        {order.status === 'DRAFT' && (
                          <>
                            {onEditOrder && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onEditOrder(order.id)}
                              >
                                Edit
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSubmit(order.id)}
                              disabled={submitMutation.isPending}
                            >
                              Submit
                            </Button>
                          </>
                        )}
                        {['DRAFT', 'SUBMITTED'].includes(order.status) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCancel(order.id)}
                            disabled={cancelMutation.isPending}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Showing {(page - 1) * pageSize + 1} -{' '}
                  {Math.min(page * pageSize, data.total)} of {data.total}
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
