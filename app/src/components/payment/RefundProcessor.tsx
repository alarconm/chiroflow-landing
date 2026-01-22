'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { trpc } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, RotateCcw, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { PaymentTransactionStatus } from '@prisma/client';
import { formatCurrency, toCents, getCardBrandDisplayName } from '@/lib/payment';

const refundFormSchema = z.object({
  refundType: z.enum(['full', 'partial']),
  amount: z.string().optional(),
  reason: z.string().min(1, 'Refund reason is required'),
  reasonCategory: z.string().optional(),
});

type RefundFormData = z.infer<typeof refundFormSchema>;

const REFUND_CATEGORIES = [
  { value: 'duplicate', label: 'Duplicate charge' },
  { value: 'patient_request', label: 'Patient request' },
  { value: 'service_not_rendered', label: 'Service not rendered' },
  { value: 'billing_error', label: 'Billing error' },
  { value: 'insurance_adjustment', label: 'Insurance adjustment' },
  { value: 'other', label: 'Other' },
];

interface RefundProcessorProps {
  transactionId: string;
  onSuccess?: (refundId: string) => void;
  onCancel?: () => void;
}

export function RefundProcessor({ transactionId, onSuccess, onCancel }: RefundProcessorProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  // Get transaction details
  const { data: transactions } = trpc.paymentProcessing.getRecentTransactions.useQuery({ limit: 50 });
  const transaction = transactions?.find((t) => t.id === transactionId);

  const refundMutation = trpc.paymentProcessing.processRefund.useMutation({
    onSuccess: (result) => {
      toast.success(
        `Refund of ${formatCurrency(toCents(result.amount))} processed successfully`
      );
      onSuccess?.(result.refundId);
    },
    onError: (error) => {
      toast.error(`Refund failed: ${error.message}`);
    },
    onSettled: () => {
      setIsProcessing(false);
    },
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RefundFormData>({
    resolver: zodResolver(refundFormSchema),
    defaultValues: {
      refundType: 'full',
    },
  });

  const refundType = watch('refundType');

  const onSubmit = (data: RefundFormData) => {
    if (!transaction) return;

    setIsProcessing(true);
    refundMutation.mutate({
      transactionId,
      amount:
        data.refundType === 'partial' && data.amount
          ? parseFloat(data.amount)
          : undefined,
      reason: data.reason,
      reasonCategory: data.reasonCategory,
    });
  };

  if (!transaction) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading transaction...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const canRefund =
    transaction.status === PaymentTransactionStatus.COMPLETED && !transaction.isRefund;

  if (!canRefund) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Cannot Process Refund
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            {transaction.isRefund
              ? 'This transaction is already a refund.'
              : transaction.status === PaymentTransactionStatus.REFUNDED
              ? 'This transaction has already been fully refunded.'
              : transaction.status === PaymentTransactionStatus.FAILED
              ? 'Cannot refund a failed transaction.'
              : 'This transaction cannot be refunded in its current state.'}
          </p>
        </CardContent>
        <CardFooter>
          {onCancel && (
            <Button variant="outline" onClick={onCancel}>
              Close
            </Button>
          )}
        </CardFooter>
      </Card>
    );
  }

  const maxRefundAmount = Number(transaction.amount);

  return (
    <Card>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Process Refund
          </CardTitle>
          <CardDescription>
            Refund all or part of this transaction
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Transaction Info */}
          <div className="p-4 bg-muted rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Transaction</span>
              <Badge variant="outline">{transaction.processorId ?? transaction.id}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Date</span>
              <span className="font-medium">
                {format(new Date(transaction.createdAt), 'MMM d, yyyy h:mm a')}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Amount</span>
              <span className="font-medium text-lg">
                {formatCurrency(toCents(Number(transaction.amount)))}
              </span>
            </div>
            {transaction.paymentMethod && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Card</span>
                <span className="font-medium">
                  {getCardBrandDisplayName(transaction.paymentMethod.cardBrand)} ****
                  {transaction.paymentMethod.last4}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Patient</span>
              <span className="font-medium">
                {transaction.patient.demographics?.firstName}{' '}
                {transaction.patient.demographics?.lastName}
              </span>
            </div>
          </div>

          {/* Refund Type */}
          <div className="space-y-3">
            <Label>Refund Amount</Label>
            <RadioGroup
              defaultValue="full"
              onValueChange={(value) => setValue('refundType', value as 'full' | 'partial')}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="full" id="full" />
                <Label htmlFor="full" className="font-normal">
                  Full refund ({formatCurrency(toCents(maxRefundAmount))})
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="partial" id="partial" />
                <Label htmlFor="partial" className="font-normal">
                  Partial refund
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Partial Amount */}
          {refundType === 'partial' && (
            <div className="space-y-2">
              <Label htmlFor="amount">Refund Amount</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  id="amount"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  className="pl-7"
                  {...register('amount')}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Maximum: {formatCurrency(toCents(maxRefundAmount))}
              </p>
              {errors.amount && (
                <p className="text-sm text-destructive">{errors.amount.message}</p>
              )}
            </div>
          )}

          {/* Reason Category */}
          <div className="space-y-2">
            <Label>Reason Category</Label>
            <Select onValueChange={(value) => setValue('reasonCategory', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {REFUND_CATEGORIES.map((category) => (
                  <SelectItem key={category.value} value={category.value}>
                    {category.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">Reason for Refund</Label>
            <Textarea
              id="reason"
              placeholder="Provide details about why this refund is being processed..."
              {...register('reason')}
            />
            {errors.reason && (
              <p className="text-sm text-destructive">{errors.reason.message}</p>
            )}
          </div>

          {/* Warning */}
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-yellow-800">This action cannot be undone</p>
                <p className="text-yellow-700 mt-1">
                  Refunds are processed immediately and the funds will be returned to the
                  original payment method within 5-10 business days.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isProcessing}>
              Cancel
            </Button>
          )}
          <Button type="submit" variant="destructive" disabled={isProcessing}>
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <RotateCcw className="h-4 w-4 mr-2" />
                Process Refund
              </>
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
