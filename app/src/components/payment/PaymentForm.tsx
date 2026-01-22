'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { trpc } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Loader2, CreditCard, DollarSign } from 'lucide-react';
import { formatCurrency, getCardBrandDisplayName } from '@/lib/payment';

const paymentFormSchema = z.object({
  paymentMethodId: z.string().min(1, 'Select a payment method'),
  amount: z.string().min(1, 'Enter an amount').refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0,
    'Amount must be a positive number'
  ),
  description: z.string().optional(),
  autoAllocate: z.boolean(),
});

type PaymentFormData = z.infer<typeof paymentFormSchema>;

interface PaymentFormProps {
  patientId: string;
  defaultAmount?: number;
  onSuccess?: (result: { paymentId: string; amount: number }) => void;
  onCancel?: () => void;
}

export function PaymentForm({ patientId, defaultAmount, onSuccess, onCancel }: PaymentFormProps) {
  const utils = trpc.useUtils();
  const [isProcessing, setIsProcessing] = useState(false);

  const { data: paymentMethods, isLoading: loadingMethods } = trpc.paymentProcessing.listPaymentMethods.useQuery({
    patientId,
  });

  const processPaymentMutation = trpc.paymentProcessing.processPayment.useMutation({
    onSuccess: (result) => {
      toast.success(
        `Payment of ${formatCurrency(result.amount * 100)} processed successfully`
      );
      utils.paymentProcessing.listPaymentMethods.invalidate({ patientId });
      onSuccess?.({ paymentId: result.paymentId, amount: result.amount });
    },
    onError: (error) => {
      toast.error(`Payment failed: ${error.message}`);
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
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      amount: defaultAmount ? defaultAmount.toFixed(2) : '',
      autoAllocate: true,
    },
  });

  const selectedMethodId = watch('paymentMethodId');
  const selectedMethod = paymentMethods?.find((m) => m.id === selectedMethodId);

  const onSubmit = (data: PaymentFormData) => {
    setIsProcessing(true);
    processPaymentMutation.mutate({
      patientId,
      paymentMethodId: data.paymentMethodId,
      amount: parseFloat(data.amount),
      description: data.description,
      autoAllocate: data.autoAllocate,
    });
  };

  if (loadingMethods) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading payment methods...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!paymentMethods || paymentMethods.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Process Payment</CardTitle>
          <CardDescription>No payment methods on file</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Please add a payment method before processing a payment.</p>
          </div>
        </CardContent>
        <CardFooter>
          {onCancel && (
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Process Payment
          </CardTitle>
          <CardDescription>
            Charge a saved payment method
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Payment Method Selection */}
          <div className="space-y-2">
            <Label htmlFor="paymentMethod">Payment Method</Label>
            <Select
              onValueChange={(value) => setValue('paymentMethodId', value)}
              defaultValue={paymentMethods.find((m) => m.isDefault)?.id}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a payment method" />
              </SelectTrigger>
              <SelectContent>
                {paymentMethods.map((method) => (
                  <SelectItem key={method.id} value={method.id}>
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      <span>
                        {getCardBrandDisplayName(method.cardBrand)} ****{method.last4}
                      </span>
                      {method.isDefault && (
                        <span className="text-xs text-muted-foreground">(Default)</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.paymentMethodId && (
              <p className="text-sm text-destructive">{errors.paymentMethodId.message}</p>
            )}
          </div>

          {/* Selected Card Info */}
          {selectedMethod && (
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                <CreditCard className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="font-medium">
                    {getCardBrandDisplayName(selectedMethod.cardBrand)} ending in {selectedMethod.last4}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {selectedMethod.cardholderName}
                    {selectedMethod.cardType !== 'CREDIT' && (
                      <span className="ml-2 text-xs">({selectedMethod.cardType})</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Amount</Label>
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
            {errors.amount && (
              <p className="text-sm text-destructive">{errors.amount.message}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              placeholder="Payment for services"
              {...register('description')}
            />
          </div>

          {/* Auto-allocate */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="autoAllocate"
              defaultChecked={true}
              onCheckedChange={(checked) => setValue('autoAllocate', checked === true)}
            />
            <Label htmlFor="autoAllocate" className="text-sm font-normal">
              Automatically apply to outstanding charges (oldest first)
            </Label>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isProcessing}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isProcessing || !selectedMethodId}>
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CreditCard className="h-4 w-4 mr-2" />
                Process Payment
              </>
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
