'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { trpc } from '@/trpc/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, TrendingUp, TrendingDown, User } from 'lucide-react';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { toast } from 'sonner';

export function ProviderProductionReport() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(new Date().setDate(1)), // First of current month
    to: new Date(),
  });
  const [selectedProvider, setSelectedProvider] = useState<string>('all');

  const { data: providers } = trpc.user.list.useQuery({
    role: 'PROVIDER',
  });

  const { data: report, isLoading } = trpc.reporting.getProviderProduction.useQuery({
    startDate: dateRange?.from || new Date(),
    endDate: dateRange?.to || new Date(),
    providerId: selectedProvider !== 'all' ? selectedProvider : undefined,
  });

  const exportReport = trpc.reporting.exportReport.useMutation({
    onSuccess: (data) => {
      toast.success('Export started. You will be notified when ready.');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleExport = (format: 'PDF' | 'CSV' | 'EXCEL') => {
    exportReport.mutate({
      reportType: 'PROVIDER_PRODUCTION',
      format,
      parameters: {
        startDate: dateRange?.from?.toISOString(),
        endDate: dateRange?.to?.toISOString(),
        providerId: selectedProvider !== 'all' ? selectedProvider : undefined,
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Provider Production Report
            </CardTitle>
            <CardDescription>
              Track provider productivity, visits, and revenue
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
          <Select value={selectedProvider} onValueChange={setSelectedProvider}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Providers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Providers</SelectItem>
              {providers?.users?.map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  {provider.firstName} {provider.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : report ? (
          (() => {
            // Handle both single report and array of reports
            const providers = Array.isArray(report) ? report : [report];
            if (providers.length === 0) {
              return (
                <div className="text-center py-8 text-muted-foreground">
                  No production data found for the selected period.
                </div>
              );
            }

            // Calculate summary from providers
            const summary = {
              totalVisits: providers.reduce((sum, p) => sum + p.totalVisits, 0),
              totalCharges: providers.reduce((sum, p) => sum + p.totalCharges, 0),
              totalCollections: providers.reduce((sum, p) => sum + p.totalCollections, 0),
              collectionRate: 0,
            };
            summary.collectionRate = summary.totalCharges > 0
              ? (summary.totalCollections / summary.totalCharges) * 100
              : 0;

            return (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead className="text-right">Total Visits</TableHead>
                      <TableHead className="text-right">New Patients</TableHead>
                      <TableHead className="text-right">Charges</TableHead>
                      <TableHead className="text-right">Collections</TableHead>
                      <TableHead className="text-right">Avg/Visit</TableHead>
                      <TableHead className="text-right">Trend</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {providers.map((provider) => (
                      <TableRow key={provider.providerId}>
                        <TableCell className="font-medium">{provider.providerName}</TableCell>
                        <TableCell className="text-right">{provider.totalVisits}</TableCell>
                        <TableCell className="text-right">{provider.newPatients}</TableCell>
                        <TableCell className="text-right">
                          ${provider.totalCharges.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right">
                          ${provider.totalCollections.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right">
                          ${provider.avgRevenuePerVisit.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          {provider.collectionRate >= 80 ? (
                            <TrendingUp className="h-4 w-4 text-green-500 inline" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-red-500 inline" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Summary */}
                <div className="mt-6 pt-4 border-t">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Visits</p>
                      <p className="text-2xl font-bold">{summary.totalVisits}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Charges</p>
                      <p className="text-2xl font-bold">
                        ${summary.totalCharges.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Collections</p>
                      <p className="text-2xl font-bold">
                        ${summary.totalCollections.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Collection Rate</p>
                      <p className="text-2xl font-bold">{summary.collectionRate.toFixed(1)}%</p>
                    </div>
                  </div>
                </div>
              </>
            );
          })()
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No production data found for the selected period.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
