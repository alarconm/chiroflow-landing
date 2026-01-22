'use client';

import { useState, useEffect } from 'react';
import { trpc } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import {
  DollarSign,
  RotateCcw,
  AlertTriangle,
  CreditCard,
  Loader2,
  CheckCircle,
  Info,
} from 'lucide-react';
import { format } from 'date-fns';

interface RefundDialogProps {
  transactionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefundComplete?: () => void;
}

const refundReasons = [
  { value: 'DUPLICATE', label: 'Duplicate Payment' },
  { value: 'OVERPAYMENT', label: 'Overpayment' },
  { value: 'SERVICE_CANCELLED', label: 'Service Cancelled' },
  { value: 'INSURANCE_PAID', label: 'Insurance Paid in Full' },
  { value: 'BILLING_ERROR', label: 'Billing Error' },
  { value: 'PATIENT_REQUEST', label: 'Patient Request' },
  { value: 'OTHER', label: 'Other' },
];

const cardBrandLabels: Record<string, string> = {
  VISA: 'Visa',
  MASTERCARD: 'Mastercard',
  AMEX: 'Amex',
  DISCOVER: 'Discover',
  OTHER: 'Card',
};

export function RefundDialog({
  transactionId,
  open,
  onOpenChange,
  onRefundComplete,
}: RefundDialogProps) {
  const [refundType, setRefundType] = useState<'full' | 'partial'>('full');
  const [refundAmount, setRefundAmount] = useState('');
  const [reason, setReason] = useState('');
  const [reasonCategory, setReasonCategory] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const { toast } = useToast();
  const utils = trpc.useUtils();

  // Get transaction details
  const { data: transaction, isLoading } = trpc.paymentProcessing.getTransaction.useQuery(
    { id: transactionId! },
    { enabled: !!transactionId && open }
  );

  // Process refund mutation
  const processRefund = trpc.paymentProcessing.processRefund.useMutation({
    onSuccess: (result) => {
      toast({
        title: 'Refund Processed',
        description: `Refund of $${result.amount.toFixed(2)} has been processed successfully.`,
      });
      utils.paymentProcessing.listTransactions.invalidate();
      utils.paymentProcessing.getTransaction.invalidate();
      onOpenChange(false);
      resetForm();
      onRefundComplete?.();
    },
    onError: (error) => {
      toast({
        title: 'Refund Failed',
        description: error.message,
        variant: 'destructive',
      });
      setShowConfirmation(false);
    },
  });

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open && transaction) {
      setRefundAmount(Number(transaction.amount).toFixed(2));
    } else {
      resetForm();
    }
  }, [open, transaction]);

  const resetForm = () => {
    setRefundType('full');
    setRefundAmount('');
    setReason('');
    setReasonCategory('');
    setShowConfirmation(false);
  };

  const handleRefundTypeChange = (type: 'full' | 'partial') => {
    setRefundType(type);
    if (type === 'full' && transaction) {
      setRefundAmount(Number(transaction.amount).toFixed(2));
    }
  };

  const handleSubmit = () => {
    if (!transactionId || !reason) return;

    const numAmount = parseFloat(refundAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast({
        title: 'Invalid Amount',
        description: 'Please enter a valid refund amount.',
        variant: 'destructive',
      });
      return;
    }

    if (transaction && numAmount > Number(transaction.amount)) {
      toast({
        title: 'Invalid Amount',
        description: 'Refund amount cannot exceed original payment.',
        variant: 'destructive',
      });
      return;
    }

    setShowConfirmation(true);
  };

  const handleConfirmRefund = () => {
    if (!transactionId) return;

    processRefund.mutate({
      transactionId,
      amount: parseFloat(refundAmount),
      reason,
      reasonCategory: reasonCategory || undefined,
    });
  };

  const isValid = reason && parseFloat(refundAmount) > 0;

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Process Refund
          </DialogTitle>
          <DialogDescription>
            Refund a payment back to the customer's card
          </DialogDescription>
        </DialogHeader>

        {!showConfirmation ? (
          <>
            {/* Transaction Details */}
            {transaction && (
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Transaction ID:</span>
                  <span className="font-mono">
                    {transaction.externalTransactionId?.slice(0, 16) || transaction.id.slice(0, 8)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Original Amount:</span>
                  <span className="font-bold">${Number(transaction.amount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Date:</span>
                  <span>
                    {transaction.processedAt
                      ? format(new Date(transaction.processedAt), 'MMM d, yyyy h:mm a')
                      : '-'}
                  </span>
                </div>
                {transaction.paymentMethod && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Payment Method:</span>
                    <span className="flex items-center gap-1">
                      <CreditCard className="h-3 w-3" />
                      {cardBrandLabels[transaction.paymentMethod.cardBrand]} ••••
                      {transaction.paymentMethod.last4}
                    </span>
                  </div>
                )}
                {transaction.patient?.demographics && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Patient:</span>
                    <span>
                      {transaction.patient.demographics.lastName},{' '}
                      {transaction.patient.demographics.firstName}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Refund Type */}
            <div className="space-y-3">
              <Label>Refund Type</Label>
              <RadioGroup
                value={refundType}
                onValueChange={(v) => handleRefundTypeChange(v as 'full' | 'partial')}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="full" id="full" />
                  <Label htmlFor="full" className="cursor-pointer">
                    Full Refund
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="partial" id="partial" />
                  <Label htmlFor="partial" className="cursor-pointer">
                    Partial Refund
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Refund Amount */}
            <div className="space-y-2">
              <Label>Refund Amount</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={transaction ? Number(transaction.amount) : undefined}
                  className="pl-8"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  disabled={refundType === 'full'}
                />
              </div>
              {refundType === 'partial' && transaction && (
                <p className="text-xs text-muted-foreground">
                  Maximum refund: ${Number(transaction.amount).toFixed(2)}
                </p>
              )}
            </div>

            {/* Reason Category */}
            <div className="space-y-2">
              <Label>Refund Reason</Label>
              <Select value={reasonCategory} onValueChange={setReasonCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a reason..." />
                </SelectTrigger>
                <SelectContent>
                  {refundReasons.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Reason Notes */}
            <div className="space-y-2">
              <Label>
                Additional Notes <span className="text-destructive">*</span>
              </Label>
              <Textarea
                placeholder="Provide details about this refund..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                This will be recorded in the audit log
              </p>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Refunds typically appear on the customer's statement within 5-10 business days.
              </AlertDescription>
            </Alert>
          </>
        ) : (
          <>
            {/* Confirmation View */}
            <Alert variant="destructive" className="border-orange-200 bg-orange-50">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <AlertTitle className="text-orange-800">Confirm Refund</AlertTitle>
              <AlertDescription className="text-orange-700">
                This action cannot be undone. Please verify the details below.
              </AlertDescription>
            </Alert>

            <div className="p-4 border rounded-lg space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Refund Amount:</span>
                <span className="text-xl font-bold text-destructive">
                  ${parseFloat(refundAmount).toFixed(2)}
                </span>
              </div>
              {reasonCategory && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Category:</span>
                  <span>{refundReasons.find((r) => r.value === reasonCategory)?.label}</span>
                </div>
              )}
              <div className="text-sm">
                <span className="text-muted-foreground block mb-1">Reason:</span>
                <p className="text-sm bg-muted p-2 rounded">{reason}</p>
              </div>
            </div>
          </>
        )}

        <DialogFooter>
          {!showConfirmation ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleSubmit}
                disabled={!isValid}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Process Refund
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setShowConfirmation(false)}>
                Go Back
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmRefund}
                disabled={processRefund.isPending}
              >
                {processRefund.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Confirm Refund
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
