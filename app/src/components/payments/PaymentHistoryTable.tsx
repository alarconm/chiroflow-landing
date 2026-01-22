'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DateRange } from 'react-day-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Search,
  Download,
  MoreHorizontal,
  Receipt,
  RotateCcw,
  ArrowRight,
  CreditCard,
  Building2,
  User,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth, startOfYear } from 'date-fns';
import { PaymentTransactionStatus } from '@prisma/client';

interface PaymentHistoryTableProps {
  patientId?: string;
  onRefund?: (transactionId: string) => void;
  dateRange?: DateRange;
}

const statusConfig: Record<
  string,
  { label: string; color: string; icon: typeof CheckCircle }
> = {
  COMPLETED: { label: 'Completed', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  PENDING: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  PROCESSING: { label: 'Processing', color: 'bg-blue-100 text-blue-800', icon: Loader2 },
  FAILED: { label: 'Failed', color: 'bg-red-100 text-red-800', icon: XCircle },
  REFUNDED: { label: 'Refunded', color: 'bg-purple-100 text-purple-800', icon: RotateCcw },
  PARTIALLY_REFUNDED: { label: 'Partial Refund', color: 'bg-purple-100 text-purple-800', icon: RotateCcw },
  VOIDED: { label: 'Voided', color: 'bg-gray-100 text-gray-800', icon: XCircle },
  DISPUTED: { label: 'Disputed', color: 'bg-orange-100 text-orange-800', icon: AlertCircle },
};

const cardBrandLabels: Record<string, string> = {
  VISA: 'Visa',
  MASTERCARD: 'Mastercard',
  AMEX: 'Amex',
  DISCOVER: 'Discover',
  OTHER: 'Card',
};

export function PaymentHistoryTable({
  patientId,
  onRefund,
  dateRange: initialDateRange,
}: PaymentHistoryTableProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(initialDateRange);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Query transactions
  const { data, isLoading } = trpc.paymentProcessing.listTransactions.useQuery({
    patientId,
    status: statusFilter !== 'all' ? (statusFilter as PaymentTransactionStatus) : undefined,
    startDate: dateRange?.from,
    endDate: dateRange?.to,
    page,
    pageSize,
  });

  const transactions = data?.transactions || [];
  const totalCount = data?.total || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  // Filter by search locally
  const filteredTransactions = search
    ? transactions.filter(
        (t) =>
          t.externalTransactionId?.toLowerCase().includes(search.toLowerCase()) ||
          t.patient?.demographics?.lastName?.toLowerCase().includes(search.toLowerCase()) ||
          t.patient?.demographics?.firstName?.toLowerCase().includes(search.toLowerCase())
      )
    : transactions;

  // Quick date filters
  const setQuickDateRange = (preset: string) => {
    const now = new Date();
    switch (preset) {
      case 'today':
        setDateRange({ from: now, to: now });
        break;
      case 'week':
        setDateRange({ from: subDays(now, 7), to: now });
        break;
      case 'month':
        setDateRange({ from: startOfMonth(now), to: endOfMonth(now) });
        break;
      case 'year':
        setDateRange({ from: startOfYear(now), to: now });
        break;
      default:
        setDateRange(undefined);
    }
  };

  // Export to CSV
  const handleExport = () => {
    if (!filteredTransactions.length) return;

    const headers = ['Date', 'Transaction ID', 'Patient', 'Amount', 'Status', 'Card'];
    const rows = filteredTransactions.map((t) => [
      t.processedAt ? format(new Date(t.processedAt), 'MM/dd/yyyy HH:mm') : '-',
      t.externalTransactionId || t.id,
      t.patient?.demographics
        ? `${t.patient.demographics.lastName}, ${t.patient.demographics.firstName}`
        : 'N/A',
      `$${Number(t.amount).toFixed(2)}`,
      statusConfig[t.status]?.label || t.status,
      t.paymentMethod ? `${cardBrandLabels[t.paymentMethod.cardBrand] || 'Card'} ****${t.paymentMethod.last4}` : '-',
    ]);

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payment-history-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment History
            </CardTitle>
            <CardDescription>
              View and manage card payment transactions
            </CardDescription>
          </div>
          <Button variant="outline" onClick={handleExport} disabled={!filteredTransactions.length}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by transaction ID or patient..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
              <SelectItem value="REFUNDED">Refunded</SelectItem>
              <SelectItem value="DISPUTED">Disputed</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setQuickDateRange('today')}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setQuickDateRange('week')}
            >
              Week
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setQuickDateRange('month')}
            >
              Month
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setQuickDateRange('all')}
            >
              All Time
            </Button>
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No transactions found</p>
          </div>
        ) : (
          <>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Transaction ID</TableHead>
                    {!patientId && <TableHead>Patient</TableHead>}
                    <TableHead>Payment Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.map((transaction) => {
                    const status = statusConfig[transaction.status] || statusConfig.PENDING;
                    const StatusIcon = status.icon;

                    return (
                      <TableRow key={transaction.id}>
                        <TableCell className="text-sm">
                          {transaction.processedAt
                            ? format(new Date(transaction.processedAt), 'MMM d, yyyy')
                            : format(new Date(transaction.createdAt), 'MMM d, yyyy')}
                          <span className="block text-xs text-muted-foreground">
                            {transaction.processedAt
                              ? format(new Date(transaction.processedAt), 'h:mm a')
                              : format(new Date(transaction.createdAt), 'h:mm a')}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {transaction.externalTransactionId?.slice(0, 16) || transaction.id.slice(0, 8)}
                        </TableCell>
                        {!patientId && (
                          <TableCell>
                            {transaction.patient?.demographics ? (
                              <span className="font-medium">
                                {transaction.patient.demographics.lastName},{' '}
                                {transaction.patient.demographics.firstName}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">N/A</span>
                            )}
                          </TableCell>
                        )}
                        <TableCell>
                          {transaction.paymentMethod ? (
                            <div className="flex items-center gap-2">
                              <CreditCard className="h-4 w-4 text-muted-foreground" />
                              <span>
                                {cardBrandLabels[transaction.paymentMethod.cardBrand] || 'Card'}{' '}
                                ••••{transaction.paymentMethod.last4}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          ${Number(transaction.amount).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge className={status.color}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>
                                <Receipt className="h-4 w-4 mr-2" />
                                View Receipt
                              </DropdownMenuItem>
                              {transaction.paymentId && (
                                <DropdownMenuItem>
                                  <ArrowRight className="h-4 w-4 mr-2" />
                                  View Payment Details
                                </DropdownMenuItem>
                              )}
                              {transaction.status === 'COMPLETED' && onRefund && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => onRefund(transaction.id)}
                                  >
                                    <RotateCcw className="h-4 w-4 mr-2" />
                                    Process Refund
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Showing {(page - 1) * pageSize + 1} to{' '}
                  {Math.min(page * pageSize, totalCount)} of {totalCount} transactions
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
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
