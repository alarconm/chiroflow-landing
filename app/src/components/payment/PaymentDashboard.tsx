'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CreditCard,
  DollarSign,
  TrendingUp,
  Users,
  Calendar,
  RefreshCw,
  FileText,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  RotateCcw,
} from 'lucide-react';
import { format } from 'date-fns';
import { PaymentTransactionStatus } from '@prisma/client';
import { formatCurrency, toCents, getCardBrandDisplayName } from '@/lib/payment';
import { PaymentForm } from './PaymentForm';
import { RefundProcessor } from './RefundProcessor';

interface PaymentDashboardProps {
  patientId?: string; // Optional - if provided, shows patient-specific view
}

export function PaymentDashboard({ patientId }: PaymentDashboardProps) {
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [transactionLimit, setTransactionLimit] = useState(20);

  const { data: dashboardStats, isLoading: loadingStats } =
    trpc.paymentProcessing.getDashboardStats.useQuery({});

  const { data: recentTransactions, isLoading: loadingTransactions } =
    trpc.paymentProcessing.getRecentTransactions.useQuery({
      limit: transactionLimit,
    });

  const isLoading = loadingStats || loadingTransactions;

  const getStatusBadge = (status: PaymentTransactionStatus) => {
    const variants: Record<
      PaymentTransactionStatus,
      'default' | 'secondary' | 'destructive' | 'outline'
    > = {
      COMPLETED: 'default',
      PENDING: 'secondary',
      PROCESSING: 'secondary',
      FAILED: 'destructive',
      REFUNDED: 'outline',
      PARTIALLY_REFUNDED: 'outline',
      VOIDED: 'destructive',
    };

    const labels: Record<PaymentTransactionStatus, string> = {
      COMPLETED: 'Completed',
      PENDING: 'Pending',
      PROCESSING: 'Processing',
      FAILED: 'Failed',
      REFUNDED: 'Refunded',
      PARTIALLY_REFUNDED: 'Partial Refund',
      VOIDED: 'Voided',
    };

    return <Badge variant={variants[status]}>{labels[status]}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Collected</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(toCents(dashboardStats?.totalCollected ?? 0))}
            </div>
            <p className="text-xs text-muted-foreground">
              {dashboardStats?.transactionCount ?? 0} transactions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Refunded</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(toCents(dashboardStats?.totalRefunded ?? 0))}
            </div>
            <p className="text-xs text-muted-foreground">{dashboardStats?.refundCount ?? 0} refunds</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Payment Plans</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardStats?.activePlans ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              {dashboardStats?.pendingStatements ?? 0} pending statements
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Auto-Pay Enrolled</CardTitle>
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardStats?.autoPayEnrollments ?? 0}</div>
            <p className="text-xs text-muted-foreground">Active enrollments</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setShowPaymentDialog(true)}>
          <CreditCard className="h-4 w-4 mr-2" />
          Process Payment
        </Button>
        <Button variant="outline">
          <FileText className="h-4 w-4 mr-2" />
          Generate Statement
        </Button>
        <Button variant="outline">
          <Users className="h-4 w-4 mr-2" />
          Payment Plans
        </Button>
      </div>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Transactions</CardTitle>
              <CardDescription>Payment activity and history</CardDescription>
            </div>
            <Select
              value={transactionLimit.toString()}
              onValueChange={(v) => setTransactionLimit(parseInt(v))}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">Last 10</SelectItem>
                <SelectItem value="20">Last 20</SelectItem>
                <SelectItem value="50">Last 50</SelectItem>
                <SelectItem value="100">Last 100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {recentTransactions && recentTransactions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentTransactions.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell>
                      {format(new Date(transaction.createdAt), 'MMM d, yyyy')}
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(transaction.createdAt), 'h:mm a')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {transaction.patient.demographics?.firstName}{' '}
                        {transaction.patient.demographics?.lastName}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {transaction.isRefund ? (
                          <>
                            <ArrowDownRight className="h-4 w-4 text-red-500" />
                            <span className="text-red-600">Refund</span>
                          </>
                        ) : (
                          <>
                            <ArrowUpRight className="h-4 w-4 text-green-500" />
                            <span className="text-green-600">Payment</span>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {transaction.paymentMethod ? (
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4 text-muted-foreground" />
                          <span>
                            {getCardBrandDisplayName(transaction.paymentMethod.cardBrand)} ****
                            {transaction.paymentMethod.last4}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={transaction.isRefund ? 'text-red-600' : 'text-green-600'}
                      >
                        {transaction.isRefund ? '-' : '+'}
                        {formatCurrency(toCents(Number(transaction.amount)))}
                      </span>
                    </TableCell>
                    <TableCell>{getStatusBadge(transaction.status)}</TableCell>
                    <TableCell className="text-right">
                      {transaction.status === PaymentTransactionStatus.COMPLETED &&
                        !transaction.isRefund && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedTransactionId(transaction.id);
                              setShowRefundDialog(true);
                            }}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No transactions found</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Process Payment</DialogTitle>
            <DialogDescription>
              Select a patient and process a payment
            </DialogDescription>
          </DialogHeader>
          {patientId ? (
            <PaymentForm
              patientId={patientId}
              onSuccess={() => setShowPaymentDialog(false)}
              onCancel={() => setShowPaymentDialog(false)}
            />
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>Select a patient first to process a payment</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Refund Dialog */}
      <Dialog open={showRefundDialog} onOpenChange={setShowRefundDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Process Refund</DialogTitle>
            <DialogDescription>
              Refund all or part of this transaction
            </DialogDescription>
          </DialogHeader>
          {selectedTransactionId && (
            <RefundProcessor
              transactionId={selectedTransactionId}
              onSuccess={() => {
                setShowRefundDialog(false);
                setSelectedTransactionId(null);
              }}
              onCancel={() => {
                setShowRefundDialog(false);
                setSelectedTransactionId(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
