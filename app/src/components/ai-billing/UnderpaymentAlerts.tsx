'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { trpc } from '@/trpc/client';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  Loader2,
  Search,
} from 'lucide-react';
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

// Type for underpayment from router query
interface UnderpaymentFromRouter {
  id: string;
  status: string;
  billedAmount: number | { toNumber(): number } | null;
  expectedAmount: number | { toNumber(): number } | null;
  paidAmount: number | { toNumber(): number } | null;
  underpaidAmount: number | { toNumber(): number } | null;
  calculationBasis: string | null;
  underpaymentReason: string | null;
  recoveryLikelihood: number | null;
  recoveryAmount: number | { toNumber(): number } | null;
  payerName: string | null;
  claim?: {
    id: string;
    claimNumber: string | null;
    patient?: {
      demographics?: {
        firstName: string;
        lastName: string;
      } | null;
    };
  } | null;
  charge?: {
    id: string;
    cptCode: string | null;
    serviceDate: Date | null;
  } | null;
}

interface UnderpaymentDetection {
  id: string;
  status: string;
  billedAmount: number;
  expectedAmount: number;
  paidAmount: number;
  underpaidAmount: number;
  calculationBasis: string | null;
  underpaymentReason: string | null;
  recoveryLikelihood: number | null;
  recoveryAmount: number | null;
  payerName: string | null;
  claim: {
    id: string;
    claimNumber: string | null;
    patient: {
      demographics: {
        firstName: string;
        lastName: string;
      } | null;
    };
  } | null;
  charge: {
    id: string;
    cptCode: string | null;
    serviceDate: Date | null;
  } | null;
}

export function UnderpaymentAlerts() {
  const [selectedUnderpayment, setSelectedUnderpayment] = useState<UnderpaymentDetection | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const { data: underpayments, isLoading, refetch } = trpc.aiBilling.getUnderpayments.useQuery({
    status: 'DETECTED',
    minAmount: 5,
    limit: 50,
  });

  const { data: payerSummary } = trpc.aiBilling.getUnderpaymentSummaryByPayer.useQuery();

  const scanMutation = trpc.aiBilling.scanUnderpayments.useMutation({
    onSuccess: () => {
      refetch();
      setIsScanning(false);
    },
    onError: () => {
      setIsScanning(false);
    },
  });

  const updateStatusMutation = trpc.aiBilling.updateUnderpaymentStatus.useMutation({
    onSuccess: () => {
      refetch();
      setSelectedUnderpayment(null);
    },
  });

  const handleScan = async () => {
    setIsScanning(true);
    await scanMutation.mutateAsync({
      threshold: 5,
    });
  };

  const handleUpdateStatus = async (status: string, resolutionType?: string) => {
    if (selectedUnderpayment) {
      await updateStatusMutation.mutateAsync({
        detectionId: selectedUnderpayment.id,
        status: status as any,
        resolutionType,
      });
    }
  };

  const getRecoveryBadge = (likelihood: number | null) => {
    if (likelihood === null) return null;
    if (likelihood >= 0.7) {
      return <Badge className="bg-green-500">High Recovery</Badge>;
    }
    if (likelihood >= 0.4) {
      return <Badge className="bg-yellow-500 text-white">Medium Recovery</Badge>;
    }
    return <Badge variant="outline">Low Recovery</Badge>;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const typedUnderpayments = underpayments as UnderpaymentFromRouter[] | undefined;
  const totalUnderpaid = typedUnderpayments?.reduce((sum: number, u: UnderpaymentFromRouter) => sum + Number(u.underpaidAmount || 0), 0) || 0;
  const totalRecoverable = typedUnderpayments?.reduce((sum: number, u: UnderpaymentFromRouter) => sum + Number(u.recoveryAmount || 0), 0) || 0;

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Underpayments List */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Underpayment Recovery
                  </CardTitle>
                  <CardDescription>
                    Claims paid below expected amounts
                  </CardDescription>
                </div>
                <Button onClick={handleScan} disabled={isScanning}>
                  {isScanning ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Search className="h-4 w-4 mr-1" />
                  )}
                  Scan for Underpayments
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="p-3 border rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">Total Underpaid</p>
                  <p className="text-xl font-bold text-red-600">${totalUnderpaid.toFixed(2)}</p>
                </div>
                <div className="p-3 border rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">Potential Recovery</p>
                  <p className="text-xl font-bold text-green-600">${totalRecoverable.toFixed(2)}</p>
                </div>
                <div className="p-3 border rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">Claims</p>
                  <p className="text-xl font-bold">{underpayments?.length || 0}</p>
                </div>
              </div>

              {typedUnderpayments && typedUnderpayments.length > 0 ? (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {typedUnderpayments.map((underpayment) => (
                      <div
                        key={underpayment.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => setSelectedUnderpayment(underpayment as unknown as UnderpaymentDetection)}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {underpayment.claim?.patient?.demographics?.lastName},{' '}
                              {underpayment.claim?.patient?.demographics?.firstName}
                            </span>
                            {getRecoveryBadge(underpayment.recoveryLikelihood)}
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {underpayment.payerName || 'Unknown Payer'} |{' '}
                            {underpayment.charge?.cptCode || 'N/A'}
                          </div>
                          {underpayment.underpaymentReason && (
                            <p className="text-sm text-orange-600 mt-1 truncate max-w-md">
                              {underpayment.underpaymentReason}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-red-600">
                            -${Number(underpayment.underpaidAmount || 0).toFixed(2)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Recovery: ${Number(underpayment.recoveryAmount || 0).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-500" />
                  <p className="font-medium">No underpayments detected</p>
                  <p className="text-sm">All payments match expected amounts.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Payer Summary */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Underpayment by Payer
              </CardTitle>
            </CardHeader>
            <CardContent>
              {payerSummary && payerSummary.length > 0 ? (
                <div className="space-y-4">
                  {payerSummary.slice(0, 5).map((payer) => (
                    <div key={payer.payerId} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="truncate max-w-[150px]">{payer.payerName}</span>
                        <span className="font-medium text-red-600">
                          ${payer.totalUnderpaid.toFixed(0)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={Math.min(100, payer.avgUnderpaymentPercent * 2)}
                          className="h-2"
                        />
                        <span className="text-xs text-muted-foreground">
                          {payer.avgUnderpaymentPercent}%
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {payer.claimCount} claims
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No payer data available
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Underpayment Details Dialog */}
      <Dialog open={!!selectedUnderpayment} onOpenChange={() => setSelectedUnderpayment(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Underpayment Details
            </DialogTitle>
            <DialogDescription>
              Review and take action on this underpayment
            </DialogDescription>
          </DialogHeader>

          {selectedUnderpayment && (
            <div className="space-y-4">
              {/* Patient Info */}
              <div className="p-3 border rounded-lg">
                <p className="text-sm text-muted-foreground">Patient</p>
                <p className="font-medium">
                  {selectedUnderpayment.claim?.patient?.demographics?.lastName},{' '}
                  {selectedUnderpayment.claim?.patient?.demographics?.firstName}
                </p>
                <p className="text-sm text-muted-foreground">
                  {selectedUnderpayment.payerName || 'Unknown Payer'}
                </p>
              </div>

              {/* Amounts */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 border rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">Billed</p>
                  <p className="font-bold">${Number(selectedUnderpayment.billedAmount || 0).toFixed(2)}</p>
                </div>
                <div className="p-3 border rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">Expected</p>
                  <p className="font-bold">${Number(selectedUnderpayment.expectedAmount || 0).toFixed(2)}</p>
                </div>
                <div className="p-3 border rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">Paid</p>
                  <p className="font-bold text-[#053e67]">${Number(selectedUnderpayment.paidAmount || 0).toFixed(2)}</p>
                </div>
              </div>

              {/* Underpaid Amount */}
              <div className="p-4 border rounded-lg bg-red-50 dark:bg-red-950/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-red-600">Underpaid Amount</p>
                    <p className="text-2xl font-bold text-red-600">
                      ${Number(selectedUnderpayment.underpaidAmount || 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Potential Recovery</p>
                    <p className="text-lg font-bold text-green-600">
                      ${Number(selectedUnderpayment.recoveryAmount || 0).toFixed(2)}
                    </p>
                    {getRecoveryBadge(selectedUnderpayment.recoveryLikelihood)}
                  </div>
                </div>
              </div>

              {/* Reason */}
              {selectedUnderpayment.underpaymentReason && (
                <div>
                  <p className="text-sm font-medium mb-1">Reason</p>
                  <p className="text-sm p-3 border rounded-lg bg-muted/30">
                    {selectedUnderpayment.underpaymentReason}
                  </p>
                </div>
              )}

              {/* Calculation Basis */}
              {selectedUnderpayment.calculationBasis && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{selectedUnderpayment.calculationBasis.replace(/_/g, ' ')}</Badge>
                  <span className="text-xs text-muted-foreground">basis for expected amount</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => handleUpdateStatus('IGNORED', 'IGNORED')}
                  disabled={updateStatusMutation.isPending}
                >
                  Ignore
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleUpdateStatus('UNDER_REVIEW')}
                  disabled={updateStatusMutation.isPending}
                >
                  <Clock className="h-4 w-4 mr-1" />
                  Mark for Review
                </Button>
                <Button
                  onClick={() => handleUpdateStatus('APPEALED', 'APPEALED')}
                  disabled={updateStatusMutation.isPending}
                >
                  {updateStatusMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <FileText className="h-4 w-4 mr-1" />
                      Create Appeal
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
