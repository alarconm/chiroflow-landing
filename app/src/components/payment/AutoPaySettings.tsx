'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { trpc } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
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
import { toast } from 'sonner';
import { Loader2, CreditCard, RefreshCw, XCircle, CheckCircle2 } from 'lucide-react';
import { AutoPayFrequency } from '@prisma/client';
import { format } from 'date-fns';
import { getCardBrandDisplayName, formatExpiryDate } from '@/lib/payment';

const autoPayFormSchema = z.object({
  paymentMethodId: z.string().min(1, 'Select a payment method'),
  frequency: z.nativeEnum(AutoPayFrequency),
  maxAmount: z.string().optional().refine(
    (val) => !val || (!isNaN(parseFloat(val)) && parseFloat(val) > 0),
    'Max amount must be a positive number'
  ),
  dayOfMonth: z.number().min(1).max(28).optional(),
});

type AutoPayFormData = z.infer<typeof autoPayFormSchema>;

interface AutoPaySettingsProps {
  patientId: string;
  onEnroll?: () => void;
  onCancel?: () => void;
}

export function AutoPaySettings({ patientId, onEnroll, onCancel }: AutoPaySettingsProps) {
  const utils = trpc.useUtils();
  const [isEnrolling, setIsEnrolling] = useState(false);

  const { data: autoPayStatus, isLoading: loadingStatus } = trpc.paymentProcessing.getAutoPayStatus.useQuery({
    patientId,
  });

  const { data: paymentMethods, isLoading: loadingMethods } = trpc.paymentProcessing.listPaymentMethods.useQuery({
    patientId,
  });

  const enrollMutation = trpc.paymentProcessing.enrollAutoPay.useMutation({
    onSuccess: () => {
      toast.success('Auto-pay enrolled successfully');
      utils.paymentProcessing.getAutoPayStatus.invalidate({ patientId });
      onEnroll?.();
    },
    onError: (error) => {
      toast.error(error.message);
    },
    onSettled: () => {
      setIsEnrolling(false);
    },
  });

  const cancelMutation = trpc.paymentProcessing.cancelAutoPay.useMutation({
    onSuccess: () => {
      toast.success('Auto-pay cancelled');
      utils.paymentProcessing.getAutoPayStatus.invalidate({ patientId });
      onCancel?.();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const {
    setValue,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<AutoPayFormData>({
    resolver: zodResolver(autoPayFormSchema),
    defaultValues: {
      frequency: 'ON_STATEMENT',
      dayOfMonth: 1,
    },
  });

  const frequency = watch('frequency');

  const onSubmit = (data: AutoPayFormData) => {
    setIsEnrolling(true);
    enrollMutation.mutate({
      patientId,
      paymentMethodId: data.paymentMethodId,
      frequency: data.frequency,
      maxAmount: data.maxAmount ? parseFloat(data.maxAmount) : undefined,
      dayOfMonth: data.frequency === 'MONTHLY' ? data.dayOfMonth : undefined,
    });
  };

  const isLoading = loadingStatus || loadingMethods;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Auto-Pay Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show current enrollment status
  if (autoPayStatus?.isActive) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                Auto-Pay Enrolled
              </CardTitle>
              <CardDescription>Automatic payments are active</CardDescription>
            </div>
            <Badge variant="default" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Active
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-muted rounded-lg space-y-3">
            <div className="flex items-center gap-3">
              <CreditCard className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">
                  {autoPayStatus.paymentMethod
                    ? `${getCardBrandDisplayName(autoPayStatus.paymentMethod.cardBrand)} ****${autoPayStatus.paymentMethod.last4}`
                    : 'Payment method'}
                </p>
                {autoPayStatus.paymentMethod && (
                  <p className="text-sm text-muted-foreground">
                    Expires{' '}
                    {formatExpiryDate(
                      autoPayStatus.paymentMethod.expiryMonth,
                      autoPayStatus.paymentMethod.expiryYear
                    )}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm pt-2 border-t">
              <div>
                <span className="text-muted-foreground">Frequency:</span>
                <p className="font-medium">
                  {autoPayStatus.frequency === 'ON_STATEMENT'
                    ? 'When statement is generated'
                    : autoPayStatus.frequency === 'MONTHLY'
                    ? `Monthly (day ${autoPayStatus.dayOfMonth})`
                    : autoPayStatus.frequency === 'WEEKLY'
                    ? 'Weekly'
                    : 'Bi-Weekly'}
                </p>
              </div>
              {autoPayStatus.maxAmount && (
                <div>
                  <span className="text-muted-foreground">Max Amount:</span>
                  <p className="font-medium">${Number(autoPayStatus.maxAmount).toFixed(2)}</p>
                </div>
              )}
              {autoPayStatus.nextChargeDate && (
                <div>
                  <span className="text-muted-foreground">Next Charge:</span>
                  <p className="font-medium">
                    {format(new Date(autoPayStatus.nextChargeDate), 'MMM d, yyyy')}
                  </p>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Enrolled Since:</span>
                <p className="font-medium">
                  {format(new Date(autoPayStatus.consentedAt), 'MMM d, yyyy')}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full">
                <XCircle className="h-4 w-4 mr-2" />
                Cancel Auto-Pay
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel Auto-Pay</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to cancel automatic payments? You will need to manually
                  make payments going forward.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep Auto-Pay</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => cancelMutation.mutate({ patientId })}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={cancelMutation.isPending}
                >
                  {cancelMutation.isPending ? 'Cancelling...' : 'Cancel Auto-Pay'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardFooter>
      </Card>
    );
  }

  // Show enrollment form
  if (!paymentMethods || paymentMethods.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Auto-Pay
          </CardTitle>
          <CardDescription>Automatic payment enrollment</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Please add a payment method before enrolling in auto-pay.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Enroll in Auto-Pay
          </CardTitle>
          <CardDescription>
            Set up automatic payments for outstanding balances
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Payment Method Selection */}
          <div className="space-y-2">
            <Label>Payment Method</Label>
            <Select
              onValueChange={(value) => setValue('paymentMethodId', value)}
              defaultValue={paymentMethods.find((m) => m.isDefault)?.id}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a card" />
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

          {/* Frequency */}
          <div className="space-y-2">
            <Label>Charge Frequency</Label>
            <Select
              onValueChange={(value) => setValue('frequency', value as AutoPayFrequency)}
              defaultValue="ON_STATEMENT"
            >
              <SelectTrigger>
                <SelectValue placeholder="Select frequency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ON_STATEMENT">When statement is generated</SelectItem>
                <SelectItem value="MONTHLY">Monthly on a specific day</SelectItem>
                <SelectItem value="BI_WEEKLY">Bi-weekly</SelectItem>
                <SelectItem value="WEEKLY">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Day of Month (for monthly) */}
          {frequency === 'MONTHLY' && (
            <div className="space-y-2">
              <Label>Day of Month</Label>
              <Select
                onValueChange={(value) => setValue('dayOfMonth', parseInt(value))}
                defaultValue="1"
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select day" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                    <SelectItem key={day} value={day.toString()}>
                      {day}
                      {day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Max Amount (optional) */}
          <div className="space-y-2">
            <Label>Maximum Amount per Charge (optional)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="No limit"
                className="pl-7"
                onChange={(e) => setValue('maxAmount', e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Leave blank for no limit. Charges exceeding this amount will require manual payment.
            </p>
          </div>

          {/* Terms */}
          <div className="p-4 bg-muted rounded-lg text-sm">
            <p className="font-medium mb-2">By enrolling in auto-pay, you authorize:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Automatic charges to the selected payment method</li>
              <li>Recurring charges based on your selected frequency</li>
              <li>
                You may cancel auto-pay at any time from your account settings
              </li>
            </ul>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={isEnrolling}>
            {isEnrolling ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enrolling...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Enroll in Auto-Pay
              </>
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
