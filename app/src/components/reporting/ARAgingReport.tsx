'use client';

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
import { Download, Clock, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

export function ARAgingReport() {
  const { data: report, isLoading } = trpc.reporting.getARaging.useQuery({});

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
      reportType: 'AR_AGING',
      format,
      parameters: {},
    });
  };

  const getAgingBadge = (days: string) => {
    if (days === 'current') return <Badge variant="outline">Current</Badge>;
    if (days === '30') return <Badge variant="secondary">30 Days</Badge>;
    if (days === '60') return <Badge className="bg-yellow-100 text-yellow-800">60 Days</Badge>;
    if (days === '90') return <Badge className="bg-orange-100 text-orange-800">90 Days</Badge>;
    return <Badge variant="destructive">120+ Days</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              A/R Aging Report
            </CardTitle>
            <CardDescription>
              Outstanding accounts receivable by aging bucket
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
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : report ? (
          <div className="space-y-8">
            {/* Aging Summary */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              <Card className="col-span-2">
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Total A/R</div>
                  <div className="text-3xl font-bold">
                    ${report.totalAR.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Current</div>
                  <div className="text-xl font-bold text-green-600">
                    ${report.current.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">31-60 Days</div>
                  <div className="text-xl font-bold text-yellow-600">
                    ${report.days30.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">61-90 Days</div>
                  <div className="text-xl font-bold text-orange-600">
                    ${report.days60.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </CardContent>
              </Card>
              <Card className={(report.days90 + report.days120Plus) > 0 ? 'border-destructive' : ''}>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    {(report.days90 + report.days120Plus) > 0 && <AlertTriangle className="h-3 w-3 text-destructive" />}
                    90+ Days
                  </div>
                  <div className="text-xl font-bold text-red-600">
                    ${(report.days90 + report.days120Plus).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Aging Distribution Progress */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Aging Distribution</span>
                <span className="text-muted-foreground">
                  {(((report.days90 + report.days120Plus) / report.totalAR) * 100).toFixed(1)}% over 90 days
                </span>
              </div>
              <div className="flex h-4 rounded-full overflow-hidden bg-muted">
                <div
                  className="bg-green-500"
                  style={{ width: `${(report.current / report.totalAR) * 100}%` }}
                  title={`Current: $${report.current.toFixed(2)}`}
                />
                <div
                  className="bg-yellow-500"
                  style={{ width: `${(report.days30 / report.totalAR) * 100}%` }}
                  title={`31-60: $${report.days30.toFixed(2)}`}
                />
                <div
                  className="bg-orange-500"
                  style={{ width: `${(report.days60 / report.totalAR) * 100}%` }}
                  title={`61-90: $${report.days60.toFixed(2)}`}
                />
                <div
                  className="bg-red-500"
                  style={{ width: `${((report.days90 + report.days120Plus) / report.totalAR) * 100}%` }}
                  title={`90+: $${(report.days90 + report.days120Plus).toFixed(2)}`}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-green-500" /> Current
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-yellow-500" /> 31-60
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-orange-500" /> 61-90
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-red-500" /> 90+
                </span>
              </div>
            </div>

            {/* By Payer */}
            {report.byPayer && report.byPayer.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-4">A/R by Payer</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Payer</TableHead>
                      <TableHead className="text-right">Current</TableHead>
                      <TableHead className="text-right">31-60</TableHead>
                      <TableHead className="text-right">61-90</TableHead>
                      <TableHead className="text-right">90+</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.byPayer.map((payer) => (
                      <TableRow key={payer.payerId || payer.payerName}>
                        <TableCell className="font-medium">{payer.payerName}</TableCell>
                        <TableCell className="text-right">
                          ${payer.current.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right">
                          ${payer.days30.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right">
                          ${payer.days60.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right text-red-600">
                          ${(payer.days90 + payer.days120Plus).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          ${payer.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
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
            No A/R data found.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
