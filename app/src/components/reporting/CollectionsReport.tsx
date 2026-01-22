'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { trpc } from '@/trpc/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, DollarSign, CreditCard, Building, Banknote } from 'lucide-react';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';

export function CollectionsReport() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(new Date().setDate(1)), // First of current month
    to: new Date(),
  });

  const { data: report, isLoading } = trpc.reporting.getCollections.useQuery({
    start: dateRange?.from || new Date(),
    end: dateRange?.to || new Date(),
  });

  const exportReport = trpc.reporting.exportReport.useMutation({
    onSuccess: () => {
      toast.success('Export started. You will be notified when ready.');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleExport = (format: 'PDF' | 'CSV' | 'EXCEL') => {
    exportReport.mutate({
      reportType: 'COLLECTIONS',
      format,
      parameters: {
        startDate: dateRange?.from?.toISOString(),
        endDate: dateRange?.to?.toISOString(),
      },
    });
  };

  const getPaymentMethodIcon = (method: string) => {
    switch (method.toLowerCase()) {
      case 'credit_card':
      case 'card':
        return <CreditCard className="h-4 w-4" />;
      case 'insurance':
        return <Building className="h-4 w-4" />;
      case 'cash':
        return <Banknote className="h-4 w-4" />;
      default:
        return <DollarSign className="h-4 w-4" />;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Collections Report
            </CardTitle>
            <CardDescription>
              Track collections by payment method and payer type
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('CSV')}
              disabled={exportReport.isPending}
            >
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <DatePickerWithRange date={dateRange} onDateChange={setDateRange} />
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : report ? (
          <div className="space-y-8">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Total Collections</div>
                  <div className="text-2xl font-bold">
                    ${report.totalCollections.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Total Charges</div>
                  <div className="text-2xl font-bold">
                    ${report.totalCharges.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Collection Rate</div>
                  <div className="text-2xl font-bold">{report.collectionRate.toFixed(1)}%</div>
                  <Progress value={report.collectionRate} className="mt-2" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Adjustments</div>
                  <div className="text-2xl font-bold">
                    ${report.totalAdjustments.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* By Payment Method */}
            {report.byPaymentMethod && report.byPaymentMethod.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-4">By Payment Method</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Payment Method</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">% of Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.byPaymentMethod.map((method) => (
                      <TableRow key={method.method}>
                        <TableCell className="font-medium flex items-center gap-2">
                          {getPaymentMethodIcon(method.method)}
                          {method.method.replace(/_/g, ' ')}
                        </TableCell>
                        <TableCell className="text-right">
                          ${method.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right">{method.count}</TableCell>
                        <TableCell className="text-right">
                          {((method.amount / report.totalCollections) * 100).toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* By Payer Type */}
            {report.byPayerType && report.byPayerType.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-4">By Payer Type</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Payer Type</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">% of Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.byPayerType.map((payer) => (
                      <TableRow key={payer.payerType}>
                        <TableCell className="font-medium">{payer.payerType}</TableCell>
                        <TableCell className="text-right">
                          ${payer.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right">{payer.count}</TableCell>
                        <TableCell className="text-right">
                          {((payer.amount / report.totalCollections) * 100).toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No collections data found for the selected period.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
