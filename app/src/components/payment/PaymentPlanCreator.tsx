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
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { Loader2, CalendarIcon, Calculator } from 'lucide-react';
import { format, addMonths } from 'date-fns';
import { cn } from '@/lib/utils';
import { calculatePaymentPlanSchedule, toCents, toDollars, formatCurrency } from '@/lib/payment';
import { AutoPayFrequency } from '@prisma/client';

const planFormSchema = z.object({
  name: z.string().optional(),
  totalAmount: z.string().min(1, 'Enter the total amount').refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0,
    'Amount must be a positive number'
  ),
  downPayment: z.string().optional().refine(
    (val) => !val || (!isNaN(parseFloat(val)) && parseFloat(val) >= 0),
    'Down payment must be a positive number'
  ),
  numberOfInstallments: z.string().refine(
    (val) => !isNaN(parseInt(val)) && parseInt(val) >= 2 && parseInt(val) <= 48,
    'Must be between 2 and 48 installments'
  ),
  frequency: z.nativeEnum(AutoPayFrequency),
  startDate: z.date(),
  notes: z.string().optional(),
});

type PlanFormData = z.infer<typeof planFormSchema>;

interface PaymentPlanCreatorProps {
  patientId: string;
  defaultAmount?: number;
  onSuccess?: (planId: string) => void;
  onCancel?: () => void;
}

export function PaymentPlanCreator({
  patientId,
  defaultAmount,
  onSuccess,
  onCancel,
}: PaymentPlanCreatorProps) {
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [isCreating, setIsCreating] = useState(false);

  const createPlanMutation = trpc.paymentProcessing.createPaymentPlan.useMutation({
    onSuccess: (plan) => {
      toast.success('Payment plan created successfully');
      onSuccess?.(plan.id);
    },
    onError: (error) => {
      toast.error(`Failed to create plan: ${error.message}`);
    },
    onSettled: () => {
      setIsCreating(false);
    },
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<PlanFormData>({
    resolver: zodResolver(planFormSchema),
    defaultValues: {
      totalAmount: defaultAmount ? defaultAmount.toFixed(2) : '',
      downPayment: '',
      numberOfInstallments: '6',
      frequency: 'MONTHLY',
      startDate: new Date(),
    },
  });

  const watchedValues = watch();

  // Calculate preview of payment schedule
  const getSchedulePreview = () => {
    const total = parseFloat(watchedValues.totalAmount || '0');
    const down = parseFloat(watchedValues.downPayment || '0');
    const installments = parseInt(watchedValues.numberOfInstallments || '6');

    if (total <= 0 || installments < 2) return null;

    try {
      const schedule = calculatePaymentPlanSchedule({
        totalAmount: toCents(total),
        downPayment: toCents(down),
        numberOfInstallments: installments,
        frequency:
          watchedValues.frequency === 'WEEKLY'
            ? 'weekly'
            : watchedValues.frequency === 'BI_WEEKLY'
            ? 'bi_weekly'
            : 'monthly',
        startDate: startDate,
      });

      return schedule;
    } catch {
      return null;
    }
  };

  const schedule = getSchedulePreview();

  const onSubmit = (data: PlanFormData) => {
    setIsCreating(true);
    createPlanMutation.mutate({
      patientId,
      name: data.name,
      totalAmount: parseFloat(data.totalAmount),
      downPayment: data.downPayment ? parseFloat(data.downPayment) : 0,
      numberOfInstallments: parseInt(data.numberOfInstallments),
      frequency: data.frequency,
      startDate: startDate,
      notes: data.notes,
    });
  };

  return (
    <Card>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Create Payment Plan
          </CardTitle>
          <CardDescription>
            Set up an installment payment plan for the patient
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Plan Name (optional) */}
          <div className="space-y-2">
            <Label htmlFor="name">Plan Name (optional)</Label>
            <Input
              id="name"
              placeholder="e.g., Treatment Payment Plan"
              {...register('name')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Total Amount */}
            <div className="space-y-2">
              <Label htmlFor="totalAmount">Total Amount</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  id="totalAmount"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  className="pl-7"
                  {...register('totalAmount')}
                />
              </div>
              {errors.totalAmount && (
                <p className="text-sm text-destructive">{errors.totalAmount.message}</p>
              )}
            </div>

            {/* Down Payment */}
            <div className="space-y-2">
              <Label htmlFor="downPayment">Down Payment (optional)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  id="downPayment"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  className="pl-7"
                  {...register('downPayment')}
                />
              </div>
              {errors.downPayment && (
                <p className="text-sm text-destructive">{errors.downPayment.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Number of Installments */}
            <div className="space-y-2">
              <Label htmlFor="numberOfInstallments">Number of Installments</Label>
              <Select
                onValueChange={(value) => setValue('numberOfInstallments', value)}
                defaultValue="6"
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select installments" />
                </SelectTrigger>
                <SelectContent>
                  {[2, 3, 4, 6, 9, 12, 18, 24, 36, 48].map((num) => (
                    <SelectItem key={num} value={num.toString()}>
                      {num} payments
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.numberOfInstallments && (
                <p className="text-sm text-destructive">{errors.numberOfInstallments.message}</p>
              )}
            </div>

            {/* Frequency */}
            <div className="space-y-2">
              <Label htmlFor="frequency">Payment Frequency</Label>
              <Select
                onValueChange={(value) => setValue('frequency', value as AutoPayFrequency)}
                defaultValue="MONTHLY"
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WEEKLY">Weekly</SelectItem>
                  <SelectItem value="BI_WEEKLY">Bi-Weekly</SelectItem>
                  <SelectItem value="MONTHLY">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Start Date */}
          <div className="space-y-2">
            <Label>First Payment Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !startDate && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, 'PPP') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(date) => {
                    setStartDate(date ?? new Date());
                    setValue('startDate', date ?? new Date());
                  }}
                  disabled={(date) => date < new Date()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Schedule Preview */}
          {schedule && (
            <div className="p-4 bg-muted rounded-lg space-y-3">
              <h4 className="font-medium">Payment Schedule Preview</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Monthly Payment:</span>
                </div>
                <div className="font-medium">
                  {formatCurrency(schedule.installments[0]?.amount ?? 0)}
                </div>
                <div>
                  <span className="text-muted-foreground">Total Amount:</span>
                </div>
                <div className="font-medium">
                  {formatCurrency(schedule.totalWithInterest)}
                </div>
                <div>
                  <span className="text-muted-foreground">First Payment:</span>
                </div>
                <div className="font-medium">
                  {schedule.installments[0]
                    ? format(schedule.installments[0].dueDate, 'MMM d, yyyy')
                    : '-'}
                </div>
                <div>
                  <span className="text-muted-foreground">Final Payment:</span>
                </div>
                <div className="font-medium">
                  {schedule.installments[schedule.installments.length - 1]
                    ? format(
                        schedule.installments[schedule.installments.length - 1].dueDate,
                        'MMM d, yyyy'
                      )
                    : '-'}
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Any additional notes about this payment plan..."
              {...register('notes')}
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isCreating}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isCreating}>
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Payment Plan'
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
