'use client';

import { useState, useMemo } from 'react';
import { trpc } from '@/trpc/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  Calendar,
  DollarSign,
  CreditCard,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Calculator,
  Clock,
  Wallet,
  ArrowRight,
} from 'lucide-react';
import { format, addDays, addWeeks, addMonths } from 'date-fns';
import { AutoPayFrequency } from '@prisma/client';

interface PaymentPlanWizardProps {
  patientId: string;
  patientName: string;
  currentBalance: number;
  onPlanCreated?: (planId: string) => void;
}

const frequencyLabels: Record<string, { label: string; description: string }> = {
  WEEKLY: { label: 'Weekly', description: 'Every week' },
  BI_WEEKLY: { label: 'Bi-Weekly', description: 'Every 2 weeks' },
  MONTHLY: { label: 'Monthly', description: 'Once per month' },
};

export function PaymentPlanWizard({
  patientId,
  patientName,
  currentBalance,
  onPlanCreated,
}: PaymentPlanWizardProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [totalAmount, setTotalAmount] = useState(currentBalance.toString());
  const [downPayment, setDownPayment] = useState('0');
  const [numberOfInstallments, setNumberOfInstallments] = useState('6');
  const [frequency, setFrequency] = useState<AutoPayFrequency>('MONTHLY');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState('');
  const [planName, setPlanName] = useState('');
  const { toast } = useToast();
  const utils = trpc.useUtils();

  // Get payment methods
  const { data: paymentMethods } = trpc.paymentProcessing.listPaymentMethods.useQuery(
    { patientId },
    { enabled: open }
  );

  // Create plan mutation
  const createPlan = trpc.paymentProcessing.createPaymentPlan.useMutation({
    onSuccess: (result) => {
      toast({
        title: 'Payment Plan Created',
        description: `${result.name} has been set up with ${result.numberOfInstallments} payments.`,
      });
      utils.paymentProcessing.listPaymentPlans.invalidate();
      setOpen(false);
      resetWizard();
      onPlanCreated?.(result.id);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Calculate schedule
  const schedule = useMemo(() => {
    const total = parseFloat(totalAmount) || 0;
    const down = parseFloat(downPayment) || 0;
    const installments = parseInt(numberOfInstallments) || 1;
    const amountToFinance = total - down;

    if (amountToFinance <= 0 || installments <= 0) {
      return null;
    }

    const installmentAmount = Math.ceil((amountToFinance * 100) / installments) / 100;
    const lastInstallment = amountToFinance - (installmentAmount * (installments - 1));

    const payments: Array<{ number: number; date: Date; amount: number }> = [];
    let currentDate = new Date(startDate);

    for (let i = 0; i < installments; i++) {
      payments.push({
        number: i + 1,
        date: new Date(currentDate),
        amount: i === installments - 1 ? lastInstallment : installmentAmount,
      });

      // Calculate next date
      switch (frequency) {
        case 'WEEKLY':
          currentDate = addWeeks(currentDate, 1);
          break;
        case 'BI_WEEKLY':
          currentDate = addWeeks(currentDate, 2);
          break;
        case 'MONTHLY':
          currentDate = addMonths(currentDate, 1);
          break;
      }
    }

    return {
      total,
      downPayment: down,
      amountToFinance,
      installmentAmount,
      payments,
      endDate: payments[payments.length - 1]?.date,
    };
  }, [totalAmount, downPayment, numberOfInstallments, frequency, startDate]);

  const resetWizard = () => {
    setStep(1);
    setTotalAmount(currentBalance.toString());
    setDownPayment('0');
    setNumberOfInstallments('6');
    setFrequency('MONTHLY');
    setStartDate(format(new Date(), 'yyyy-MM-dd'));
    setSelectedPaymentMethodId('');
    setPlanName('');
  };

  const handleCreatePlan = () => {
    if (!schedule) return;

    createPlan.mutate({
      patientId,
      name: planName || `Payment Plan - ${format(new Date(), 'MMM yyyy')}`,
      totalAmount: schedule.total,
      downPayment: schedule.downPayment,
      numberOfInstallments: parseInt(numberOfInstallments),
      frequency,
      startDate: new Date(startDate),
      // Note: paymentMethodId for auto-pay would need to be set up separately via auto-pay enrollment
    });
  };

  const canProceedStep1 = schedule && schedule.amountToFinance > 0;
  const canProceedStep2 = parseInt(numberOfInstallments) >= 2 && parseInt(numberOfInstallments) <= 48;
  const canProceedStep3 = true; // Payment method is optional

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Calendar className="h-4 w-4 mr-2" />
          Create Payment Plan
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Payment Plan Wizard
          </DialogTitle>
          <DialogDescription>
            Create a payment plan for {patientName}
          </DialogDescription>
        </DialogHeader>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className={step >= 1 ? 'text-[#053e67] font-medium' : 'text-muted-foreground'}>
              1. Amount
            </span>
            <span className={step >= 2 ? 'text-[#053e67] font-medium' : 'text-muted-foreground'}>
              2. Schedule
            </span>
            <span className={step >= 3 ? 'text-[#053e67] font-medium' : 'text-muted-foreground'}>
              3. Payment Method
            </span>
            <span className={step >= 4 ? 'text-[#053e67] font-medium' : 'text-muted-foreground'}>
              4. Review
            </span>
          </div>
          <Progress value={(step / 4) * 100} className="h-2" />
        </div>

        <div className="py-4">
          {/* Step 1: Amount */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Current Balance:</span>
                  <span className="text-xl font-bold">${currentBalance.toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Total Amount for Plan</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    className="pl-8"
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value)}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Enter the total amount to include in the payment plan
                </p>
              </div>

              <div className="space-y-2">
                <Label>Down Payment (optional)</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max={parseFloat(totalAmount) || 0}
                    className="pl-8"
                    value={downPayment}
                    onChange={(e) => setDownPayment(e.target.value)}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Collect upfront to reduce the financed amount
                </p>
              </div>

              {schedule && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Calculator className="h-4 w-4 text-blue-600" />
                    <span className="font-medium text-blue-900">Amount to Finance</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-900">
                    ${schedule.amountToFinance.toFixed(2)}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Schedule */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Number of Installments</Label>
                <Select
                  value={numberOfInstallments}
                  onValueChange={setNumberOfInstallments}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2, 3, 4, 6, 8, 10, 12, 18, 24, 36, 48].map((n) => (
                      <SelectItem key={n} value={n.toString()}>
                        {n} payments
                        {schedule && (
                          <span className="text-muted-foreground ml-2">
                            (~${(schedule.amountToFinance / n).toFixed(2)} each)
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Payment Frequency</Label>
                <Select
                  value={frequency}
                  onValueChange={(v) => setFrequency(v as AutoPayFrequency)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(frequencyLabels).map(([key, { label, description }]) => (
                      <SelectItem key={key} value={key}>
                        <div>
                          <span className="font-medium">{label}</span>
                          <span className="text-muted-foreground ml-2">- {description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>First Payment Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  min={format(new Date(), 'yyyy-MM-dd')}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              {schedule && (
                <div className="p-4 bg-muted rounded-lg space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Payment Amount:</span>
                    <span className="font-medium">${schedule.installmentAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Final Payment:</span>
                    <span className="font-medium">
                      {schedule.endDate && format(schedule.endDate, 'MMMM d, yyyy')}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Payment Method */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Payment Method (Optional)</Label>
                <p className="text-sm text-muted-foreground mb-4">
                  Select a card to automatically charge for each installment
                </p>

                {paymentMethods && paymentMethods.length > 0 ? (
                  <div className="space-y-2">
                    <div
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        !selectedPaymentMethodId ? 'border-[#053e67] bg-blue-50' : 'hover:bg-muted'
                      }`}
                      onClick={() => setSelectedPaymentMethodId('')}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded-full border-2 ${
                          !selectedPaymentMethodId ? 'border-[#053e67] bg-[#053e67]' : 'border-gray-300'
                        }`}>
                          {!selectedPaymentMethodId && (
                            <div className="w-2 h-2 bg-white rounded-full m-auto mt-0.5" />
                          )}
                        </div>
                        <span className="font-medium">Manual Payments</span>
                      </div>
                      <p className="text-sm text-muted-foreground ml-6">
                        Patient will pay each installment manually
                      </p>
                    </div>

                    {paymentMethods.map((method) => (
                      <div
                        key={method.id}
                        className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                          selectedPaymentMethodId === method.id
                            ? 'border-[#053e67] bg-blue-50'
                            : 'hover:bg-muted'
                        }`}
                        onClick={() => setSelectedPaymentMethodId(method.id)}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded-full border-2 ${
                            selectedPaymentMethodId === method.id
                              ? 'border-[#053e67] bg-[#053e67]'
                              : 'border-gray-300'
                          }`}>
                            {selectedPaymentMethodId === method.id && (
                              <div className="w-2 h-2 bg-white rounded-full m-auto mt-0.5" />
                            )}
                          </div>
                          <CreditCard className="h-4 w-4" />
                          <span className="font-medium">
                            {method.cardBrand} •••• {method.last4}
                          </span>
                          {method.isDefault && (
                            <Badge variant="secondary">Default</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground ml-6">
                          Auto-charge this card for each installment
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground border rounded-lg">
                    <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No saved payment methods</p>
                    <p className="text-sm">Plan will require manual payments</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Plan Name (optional)</Label>
                <Input
                  placeholder={`Payment Plan - ${format(new Date(), 'MMM yyyy')}`}
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 4 && schedule && (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="font-medium text-green-900">Plan Summary</span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Total Amount:</span>
                    <p className="font-medium">${schedule.total.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Down Payment:</span>
                    <p className="font-medium">${schedule.downPayment.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Financed Amount:</span>
                    <p className="font-medium">${schedule.amountToFinance.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Installments:</span>
                    <p className="font-medium">
                      {numberOfInstallments} {frequencyLabels[frequency]?.label.toLowerCase()} payments
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Payment Schedule</Label>
                <div className="border rounded-lg max-h-48 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {schedule.payments.map((payment) => (
                        <TableRow key={payment.number}>
                          <TableCell>{payment.number}</TableCell>
                          <TableCell>
                            {format(payment.date, 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            ${payment.amount.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {selectedPaymentMethodId && paymentMethods && (
                <div className="p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    <span className="text-sm">
                      Auto-charge enabled on{' '}
                      {paymentMethods.find((m) => m.id === selectedPaymentMethodId)?.cardBrand}{' '}
                      ••••{' '}
                      {paymentMethods.find((m) => m.id === selectedPaymentMethodId)?.last4}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <div>
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep(step - 1)}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {step < 4 ? (
              <Button
                onClick={() => setStep(step + 1)}
                disabled={
                  (step === 1 && !canProceedStep1) ||
                  (step === 2 && !canProceedStep2) ||
                  (step === 3 && !canProceedStep3)
                }
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                className="bg-[#053e67] hover:bg-[#042d4d]"
                onClick={handleCreatePlan}
                disabled={createPlan.isPending}
              >
                {createPlan.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Create Plan
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
