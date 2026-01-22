'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Calendar, XCircle, Eye, Loader2 } from 'lucide-react';
import { PaymentPlanStatus, InstallmentStatus } from '@prisma/client';
import { formatCurrency, toCents } from '@/lib/payment';

interface PaymentPlanListProps {
  patientId?: string;
  showPatientInfo?: boolean;
}

export function PaymentPlanList({ patientId, showPatientInfo = true }: PaymentPlanListProps) {
  const utils = trpc.useUtils();
  const [cancelReason, setCancelReason] = useState('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [viewingPlanId, setViewingPlanId] = useState<string | null>(null);

  const { data, isLoading } = trpc.paymentProcessing.listPaymentPlans.useQuery({
    patientId,
  });

  const { data: planDetails } = trpc.paymentProcessing.getPaymentPlan.useQuery(
    { id: viewingPlanId! },
    { enabled: !!viewingPlanId }
  );

  const cancelMutation = trpc.paymentProcessing.cancelPaymentPlan.useMutation({
    onSuccess: () => {
      toast.success('Payment plan cancelled');
      utils.paymentProcessing.listPaymentPlans.invalidate();
      setCancellingId(null);
      setCancelReason('');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const getStatusBadge = (status: PaymentPlanStatus) => {
    const variants: Record<PaymentPlanStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      ACTIVE: 'default',
      COMPLETED: 'secondary',
      CANCELLED: 'destructive',
      DEFAULTED: 'destructive',
      PAUSED: 'outline',
    };

    return <Badge variant={variants[status]}>{status}</Badge>;
  };

  const getInstallmentStatusBadge = (status: InstallmentStatus) => {
    const variants: Record<InstallmentStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      SCHEDULED: 'outline',
      PENDING: 'secondary',
      PAID: 'default',
      FAILED: 'destructive',
      SKIPPED: 'outline',
    };

    return <Badge variant={variants[status]}>{status}</Badge>;
  };

  const handleCancel = (id: string) => {
    if (!cancelReason.trim()) {
      toast.error('Please provide a cancellation reason');
      return;
    }
    setCancellingId(id);
    cancelMutation.mutate({ id, reason: cancelReason });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Payment Plans</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const plans = data?.plans ?? [];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Payment Plans</CardTitle>
          <CardDescription>
            {plans.length} plan{plans.length !== 1 ? 's' : ''} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {plans.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  {showPatientInfo && <TableHead>Patient</TableHead>}
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Next Due</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => {
                  const progress =
                    (Number(plan.amountPaid) / Number(plan.totalAmount)) * 100;

                  return (
                    <TableRow key={plan.id}>
                      {showPatientInfo && (
                        <TableCell>
                          <div className="font-medium">
                            {plan.patient.demographics?.firstName}{' '}
                            {plan.patient.demographics?.lastName}
                          </div>
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="font-medium">
                          {plan.name ?? `${plan.numberOfInstallments}-Payment Plan`}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {plan.installmentsPaid}/{plan.numberOfInstallments} payments
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(plan.status)}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(toCents(Number(plan.totalAmount)))}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(toCents(Number(plan.amountRemaining)))}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={progress} className="w-20" />
                          <span className="text-sm text-muted-foreground">
                            {Math.round(progress)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {plan.nextDueDate ? (
                          <div className="flex items-center gap-1 text-sm">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(plan.nextDueDate), 'MMM d, yyyy')}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewingPlanId(plan.id)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {plan.status === 'ACTIVE' && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive"
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Cancel Payment Plan</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to cancel this payment plan? This will
                                    skip all remaining installments.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <div className="py-4">
                                  <Label htmlFor="cancelReason">Cancellation Reason</Label>
                                  <Input
                                    id="cancelReason"
                                    placeholder="Enter reason for cancellation"
                                    value={cancelReason}
                                    onChange={(e) => setCancelReason(e.target.value)}
                                    className="mt-2"
                                  />
                                </div>
                                <AlertDialogFooter>
                                  <AlertDialogCancel onClick={() => setCancelReason('')}>
                                    Keep Plan
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleCancel(plan.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    disabled={cancelMutation.isPending}
                                  >
                                    {cancellingId === plan.id ? 'Cancelling...' : 'Cancel Plan'}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No payment plans found</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plan Details Dialog */}
      <Dialog open={!!viewingPlanId} onOpenChange={() => setViewingPlanId(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payment Plan Details</DialogTitle>
            <DialogDescription>
              {planDetails?.name ?? 'Payment plan installment schedule'}
            </DialogDescription>
          </DialogHeader>
          {planDetails && (
            <div className="space-y-6">
              {/* Plan Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <div className="text-sm text-muted-foreground">Total Amount</div>
                  <div className="font-medium">
                    {formatCurrency(toCents(Number(planDetails.totalAmount)))}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Amount Paid</div>
                  <div className="font-medium text-green-600">
                    {formatCurrency(toCents(Number(planDetails.amountPaid)))}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Remaining</div>
                  <div className="font-medium">
                    {formatCurrency(toCents(Number(planDetails.amountRemaining)))}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Status</div>
                  <div>{getStatusBadge(planDetails.status)}</div>
                </div>
              </div>

              {/* Installment Schedule */}
              <div>
                <h4 className="font-medium mb-3">Installment Schedule</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Paid</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {planDetails.installments.map((installment) => (
                      <TableRow key={installment.id}>
                        <TableCell>{installment.installmentNumber}</TableCell>
                        <TableCell>
                          {format(new Date(installment.dueDate), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(toCents(Number(installment.amount)))}
                        </TableCell>
                        <TableCell>
                          {getInstallmentStatusBadge(installment.status)}
                        </TableCell>
                        <TableCell>
                          {installment.paidAt
                            ? format(new Date(installment.paidAt), 'MMM d, yyyy')
                            : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Notes */}
              {planDetails.notes && (
                <div>
                  <h4 className="font-medium mb-2">Notes</h4>
                  <p className="text-sm text-muted-foreground">{planDetails.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
