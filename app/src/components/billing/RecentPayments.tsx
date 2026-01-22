'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { DateRange } from 'react-day-picker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface RecentPaymentsProps {
  dateRange: DateRange | undefined;
}

const paymentMethodLabels: Record<string, string> = {
  CASH: 'Cash',
  CHECK: 'Check',
  CREDIT_CARD: 'Credit Card',
  DEBIT_CARD: 'Debit Card',
  ACH: 'ACH/Bank Transfer',
  INSURANCE: 'Insurance',
  OTHER: 'Other',
};

const payerTypeLabels: Record<string, string> = {
  patient: 'Patient',
  insurance: 'Insurance',
  other: 'Other',
};

type PaymentItem = {
  id: string;
  paymentDate: Date;
  amount: number | string;
  unappliedAmount: number | string;
  paymentMethod: string;
  payerType: string;
  referenceNumber: string | null;
  patient: {
    demographics: {
      firstName: string;
      lastName: string;
    } | null;
  };
  allocations: Array<{ amount: number | string }>;
};

export function RecentPayments({ dateRange }: RecentPaymentsProps) {
  const [page, setPage] = useState(1);
  const [payerType, setPayerType] = useState<string>('all');

  const { data, isLoading } = trpc.payment.list.useQuery({
    startDate: dateRange?.from || new Date(),
    endDate: dateRange?.to || new Date(),
    payerType: payerType !== 'all' ? (payerType as 'patient' | 'insurance' | 'other') : undefined,
    page,
    limit: 10,
  });

  const payments = (data?.payments || []) as unknown as PaymentItem[];
  const pagination = data?.pagination;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Payments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Recent Payments</CardTitle>
          <Select value={payerType} onValueChange={setPayerType}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="patient">Patient</SelectItem>
              <SelectItem value="insurance">Insurance</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Patient</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Applied</TableHead>
              <TableHead className="text-right">Unapplied</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  No payments found for the selected period
                </TableCell>
              </TableRow>
            ) : (
              payments.map((payment) => {
                const patientName = payment.patient.demographics
                  ? `${payment.patient.demographics.lastName}, ${payment.patient.demographics.firstName}`
                  : 'Patient';
                const amount = Number(payment.amount);
                const unapplied = Number(payment.unappliedAmount);
                const applied = amount - unapplied;

                return (
                  <TableRow key={payment.id}>
                    <TableCell>
                      {format(new Date(payment.paymentDate), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="font-medium">{patientName}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {payerTypeLabels[payment.payerType] || payment.payerType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {paymentMethodLabels[payment.paymentMethod] || payment.paymentMethod}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {payment.referenceNumber || '-'}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      ${amount.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      ${applied.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      {unapplied > 0 ? (
                        <Badge variant="outline">
                          ${unapplied.toFixed(2)}
                        </Badge>
                      ) : (
                        '$0.00'
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground">
              Showing {(page - 1) * 10 + 1} to {Math.min(page * 10, pagination.total)} of{' '}
              {pagination.total} payments
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
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= pagination.totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
