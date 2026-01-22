'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Loader2,
  Download,
  RefreshCw,
  DollarSign,
  FileText,
  ChevronLeft,
  ChevronRight,
  Eye,
} from 'lucide-react';
import { format } from 'date-fns';

export function RemittanceList() {
  const [page, setPage] = useState(1);
  const [selectedRemittance, setSelectedRemittance] = useState<string | null>(null);
  const limit = 20;

  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.clearinghouse.listRemittances.useQuery({
    page,
    limit,
  });

  const { data: remittanceDetail } = trpc.clearinghouse.getRemittance.useQuery(
    { id: selectedRemittance! },
    { enabled: !!selectedRemittance }
  );

  const fetchMutation = trpc.clearinghouse.fetchRemittances.useMutation({
    onSuccess: () => {
      utils.clearinghouse.listRemittances.invalidate();
    },
  });

  const getStatusBadge = (isProcessed: boolean) => {
    if (isProcessed) {
      return <Badge className="bg-green-500">Processed</Badge>;
    }
    return <Badge variant="secondary">Pending</Badge>;
  };

  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(Number(amount));
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Remittances (ERAs)
              </CardTitle>
              <CardDescription>
                Electronic Remittance Advice from insurance payers
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => fetchMutation.mutate({})}
                disabled={fetchMutation.isPending}
              >
                {fetchMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Fetch New ERAs
              </Button>
              <Button variant="outline" size="icon" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : data?.remittances.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No Remittances Found</h3>
              <p className="text-sm text-muted-foreground max-w-md mt-2">
                No electronic remittance advice (ERA) documents have been received yet.
                Click "Fetch New ERAs" to check for new remittances.
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Check #</TableHead>
                    <TableHead>Check Date</TableHead>
                    <TableHead>Payer</TableHead>
                    <TableHead className="text-right">Total Charged</TableHead>
                    <TableHead className="text-right">Total Paid</TableHead>
                    <TableHead className="text-right">Adjusted</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Claims</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.remittances.map((remittance) => (
                    <TableRow key={remittance.id}>
                      <TableCell className="font-mono">{remittance.checkNumber}</TableCell>
                      <TableCell>
                        {remittance.checkDate
                          ? format(new Date(remittance.checkDate), 'MM/dd/yyyy')
                          : '-'}
                      </TableCell>
                      <TableCell>{remittance.payerName}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(Number(remittance.totalCharges))}
                      </TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        {formatCurrency(Number(remittance.totalPaid))}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatCurrency(Number(remittance.totalAdjusted))}
                      </TableCell>
                      <TableCell>{getStatusBadge(remittance.isProcessed)}</TableCell>
                      <TableCell>{remittance._count?.lineItems || 0}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedRemittance(remittance.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {data?.pagination && data.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {(page - 1) * limit + 1} to{' '}
                    {Math.min(page * limit, data.pagination.total)} of {data.pagination.total}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page - 1)}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">
                      Page {page} of {data.pagination.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page + 1)}
                      disabled={page >= data.pagination.totalPages}
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

      {/* Remittance Detail Dialog */}
      <Dialog open={!!selectedRemittance} onOpenChange={() => setSelectedRemittance(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Remittance Detail</DialogTitle>
            <DialogDescription>
              Check #{remittanceDetail?.checkNumber} from {remittanceDetail?.payerName}
            </DialogDescription>
          </DialogHeader>

          {remittanceDetail && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="grid gap-4 md:grid-cols-4">
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">Total Charged</div>
                  <div className="text-xl font-bold">
                    {formatCurrency(Number(remittanceDetail.totalCharges))}
                  </div>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">Total Paid</div>
                  <div className="text-xl font-bold text-green-600">
                    {formatCurrency(Number(remittanceDetail.totalPaid))}
                  </div>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">Total Adjusted</div>
                  <div className="text-xl font-bold">
                    {formatCurrency(Number(remittanceDetail.totalAdjusted))}
                  </div>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">Check Date</div>
                  <div className="text-xl font-bold">
                    {remittanceDetail.checkDate
                      ? format(new Date(remittanceDetail.checkDate), 'MM/dd/yyyy')
                      : '-'}
                  </div>
                </div>
              </div>

              {/* Line Items */}
              {remittanceDetail.lineItems && remittanceDetail.lineItems.length > 0 && (
                <div>
                  <h4 className="font-medium mb-3">Line Items</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Claim #</TableHead>
                        <TableHead>CPT</TableHead>
                        <TableHead className="text-right">Charged</TableHead>
                        <TableHead className="text-right">Allowed</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead className="text-right">Patient</TableHead>
                        <TableHead>Adj. Codes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {remittanceDetail.lineItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono">
                            {item.claim?.claimNumber || '-'}
                          </TableCell>
                          <TableCell>{item.charge?.cptCode || '-'}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(Number(item.chargedAmount))}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(Number(item.allowedAmount))}
                          </TableCell>
                          <TableCell className="text-right text-green-600">
                            {formatCurrency(Number(item.paidAmount))}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(Number(item.patientAmount))}
                          </TableCell>
                          <TableCell>
                            {item.adjustmentReasonCodes?.join(', ') || '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
