'use client';

/**
 * LowStockAlerts Component
 * Epic 17: Inventory & POS
 *
 * Displays and manages low stock alerts.
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
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import type { AlertStatus } from '@prisma/client';

interface LowStockAlertsProps {
  onViewProduct?: (productId: string) => void;
  onCreatePurchaseOrder?: (productIds: string[]) => void;
}

export function LowStockAlerts({
  onViewProduct,
  onCreatePurchaseOrder,
}: LowStockAlertsProps) {
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState<AlertStatus | 'all'>('ACTIVE');
  const [selectedAlerts, setSelectedAlerts] = useState<Set<string>>(new Set());

  const { data: alerts, isLoading } = trpc.inventory.listLowStock.useQuery({
    status: statusFilter === 'all' ? undefined : statusFilter,
    pageSize: 100,
  });

  const { data: alertSummary } = trpc.inventory.getAlertSummary.useQuery();

  const acknowledgeMutation = trpc.inventory.acknowledgeAlert.useMutation({
    onSuccess: () => {
      toast.success('Alert acknowledged');
      utils.inventory.listLowStock.invalidate();
      utils.inventory.getAlertSummary.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const ignoreMutation = trpc.inventory.ignoreAlert.useMutation({
    onSuccess: () => {
      toast.success('Alert ignored');
      utils.inventory.listLowStock.invalidate();
      utils.inventory.getAlertSummary.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const bulkAcknowledgeMutation = trpc.inventory.bulkAcknowledgeAlerts.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.acknowledged} alerts acknowledged`);
      utils.inventory.listLowStock.invalidate();
      utils.inventory.getAlertSummary.invalidate();
      setSelectedAlerts(new Set());
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked && alerts?.alerts) {
      setSelectedAlerts(new Set(alerts.alerts.map((a) => a.id)));
    } else {
      setSelectedAlerts(new Set());
    }
  };

  const handleSelectAlert = (alertId: string, checked: boolean) => {
    const newSelected = new Set(selectedAlerts);
    if (checked) {
      newSelected.add(alertId);
    } else {
      newSelected.delete(alertId);
    }
    setSelectedAlerts(newSelected);
  };

  const handleBulkAcknowledge = () => {
    if (selectedAlerts.size === 0) {
      toast.error('No alerts selected');
      return;
    }
    bulkAcknowledgeMutation.mutate({ alertIds: Array.from(selectedAlerts) });
  };

  const handleCreatePO = () => {
    if (!alerts?.alerts || selectedAlerts.size === 0) {
      toast.error('No alerts selected');
      return;
    }
    const productIds = alerts.alerts
      .filter((a) => selectedAlerts.has(a.id))
      .map((a) => a.productId);
    onCreatePurchaseOrder?.(productIds);
  };

  const getStatusColor = (status: AlertStatus) => {
    switch (status) {
      case 'ACTIVE':
        return 'destructive';
      case 'ACKNOWLEDGED':
        return 'outline';
      case 'RESOLVED':
        return 'default';
      case 'IGNORED':
        return 'secondary';
      default:
        return 'default';
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            Low Stock Alerts
            {alertSummary && alertSummary.active > 0 && (
              <Badge variant="destructive">{alertSummary.active} active</Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as AlertStatus | 'all')}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Alerts</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="ACKNOWLEDGED">Acknowledged</SelectItem>
                <SelectItem value="RESOLVED">Resolved</SelectItem>
                <SelectItem value="IGNORED">Ignored</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Alert Summary */}
        {alertSummary && (
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="p-3 rounded-lg bg-red-50 border border-red-200">
              <div className="text-sm text-red-600">Active</div>
              <div className="text-2xl font-bold text-red-700">
                {alertSummary.active}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200">
              <div className="text-sm text-yellow-600">Acknowledged</div>
              <div className="text-2xl font-bold text-yellow-700">
                {alertSummary.acknowledged}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-green-50 border border-green-200">
              <div className="text-sm text-green-600">Resolved Today</div>
              <div className="text-2xl font-bold text-green-700">
                {alertSummary.resolvedToday}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
              <div className="text-sm text-gray-600">Ignored Today</div>
              <div className="text-2xl font-bold text-gray-700">
                {alertSummary.ignoredToday}
              </div>
            </div>
          </div>
        )}

        {/* Bulk Actions */}
        {selectedAlerts.size > 0 && (
          <div className="flex items-center gap-2 mb-4 p-2 bg-muted rounded">
            <span className="text-sm">{selectedAlerts.size} selected</span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkAcknowledge}
              disabled={bulkAcknowledgeMutation.isPending}
            >
              Acknowledge Selected
            </Button>
            {onCreatePurchaseOrder && (
              <Button variant="outline" size="sm" onClick={handleCreatePO}>
                Create Purchase Order
              </Button>
            )}
          </div>
        )}

        {/* Alerts Table */}
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !alerts?.alerts?.length ? (
          <div className="text-center text-muted-foreground py-8">
            No alerts found
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      alerts.alerts.length > 0 && selectedAlerts.size === alerts.alerts.length
                    }
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Current Stock</TableHead>
                <TableHead className="text-right">Threshold</TableHead>
                <TableHead className="text-right">Reorder Qty</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alerts.alerts.map((alert) => (
                <TableRow key={alert.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedAlerts.has(alert.id)}
                      onCheckedChange={(checked) =>
                        handleSelectAlert(alert.id, !!checked)
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{alert.productName}</div>
                      <div className="text-sm text-muted-foreground">
                        {alert.productSku}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={
                        alert.currentQty <= 0
                          ? 'text-destructive font-bold'
                          : 'text-yellow-600 font-medium'
                      }
                    >
                      {alert.currentQty}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {alert.threshold}
                  </TableCell>
                  <TableCell className="text-right">
                    {alert.suggestedQty}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusColor(alert.status)}>
                      {alert.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(alert.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {onViewProduct && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onViewProduct(alert.productId)}
                        >
                          View
                        </Button>
                      )}
                      {alert.status === 'ACTIVE' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              acknowledgeMutation.mutate({ alertId: alert.id })
                            }
                            disabled={acknowledgeMutation.isPending}
                          >
                            Ack
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              ignoreMutation.mutate({ alertId: alert.id })
                            }
                            disabled={ignoreMutation.isPending}
                          >
                            Ignore
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
