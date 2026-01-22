'use client';

import { useState, useEffect } from 'react';
import { trpc } from '@/trpc/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  CreditCard,
  DollarSign,
  CheckCircle,
  AlertCircle,
  Loader2,
  Search,
  Plus,
} from 'lucide-react';
import { format } from 'date-fns';
import { CardBrand, CardType, ChargeStatus } from '@prisma/client';

interface PaymentTerminalProps {
  patientId?: string;
  onPaymentSuccess?: (transactionId: string) => void;
}

const cardBrandIcons: Record<string, string> = {
  VISA: '💳',
  MASTERCARD: '💳',
  AMEX: '💳',
  DISCOVER: '💳',
  OTHER: '💳',
};

export function PaymentTerminal({ patientId, onPaymentSuccess }: PaymentTerminalProps) {
  const [selectedPatientId, setSelectedPatientId] = useState(patientId || '');
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCharges, setSelectedCharges] = useState<string[]>([]);
  const [autoAllocate, setAutoAllocate] = useState(true);
  const [patientSearch, setPatientSearch] = useState('');
  const { toast } = useToast();
  const utils = trpc.useUtils();

  // Search patients
  const { data: patientsResult } = trpc.patient.list.useQuery(
    { search: patientSearch, limit: 5 },
    { enabled: patientSearch.length >= 2 }
  );
  const patients = patientsResult?.patients;

  // Get patient details
  const { data: patient } = trpc.patient.get.useQuery(
    { id: selectedPatientId },
    { enabled: !!selectedPatientId }
  );

  // Get patient's payment methods
  const { data: paymentMethods, isLoading: loadingPaymentMethods } =
    trpc.paymentProcessing.listPaymentMethods.useQuery(
      { patientId: selectedPatientId },
      { enabled: !!selectedPatientId }
    );

  // Get patient's open charges
  const { data: charges, isLoading: loadingCharges } = trpc.charge.list.useQuery(
    {
      patientId: selectedPatientId,
    },
    { enabled: !!selectedPatientId }
  );

  // Process payment mutation
  const processPayment = trpc.paymentProcessing.processPayment.useMutation({
    onSuccess: (result) => {
      toast({
        title: 'Payment Successful',
        description: `Payment of $${amount} processed successfully.`,
      });
      // Reset form
      setAmount('');
      setDescription('');
      setSelectedCharges([]);
      // Invalidate queries
      utils.paymentProcessing.listPaymentMethods.invalidate();
      utils.charge.list.invalidate();
      utils.ledger.getByPatient.invalidate();
      // Callback
      onPaymentSuccess?.(result.transactionId);
    },
    onError: (error) => {
      toast({
        title: 'Payment Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Calculate totals
  const openCharges = charges?.charges || [];
  const selectedChargesTotal = openCharges
    .filter((c) => selectedCharges.includes(c.id))
    .reduce((sum, c) => sum + Number(c.balance), 0);
  const totalBalance = openCharges.reduce((sum, c) => sum + Number(c.balance), 0);

  // Auto-select default payment method
  useEffect(() => {
    if (paymentMethods && paymentMethods.length > 0 && !selectedPaymentMethodId) {
      const defaultMethod = paymentMethods.find((m) => m.isDefault);
      setSelectedPaymentMethodId(defaultMethod?.id || paymentMethods[0].id);
    }
  }, [paymentMethods, selectedPaymentMethodId]);

  const handleChargeToggle = (chargeId: string, checked: boolean) => {
    if (checked) {
      setSelectedCharges((prev) => [...prev, chargeId]);
    } else {
      setSelectedCharges((prev) => prev.filter((id) => id !== chargeId));
    }
  };

  const handleSelectAllCharges = () => {
    setSelectedCharges(openCharges.map((c) => c.id));
    setAmount(totalBalance.toFixed(2));
  };

  const handleApplySelectedAmount = () => {
    setAmount(selectedChargesTotal.toFixed(2));
  };

  const handleProcessPayment = () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast({
        title: 'Invalid Amount',
        description: 'Please enter a valid payment amount.',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedPaymentMethodId) {
      toast({
        title: 'No Payment Method',
        description: 'Please select a payment method.',
        variant: 'destructive',
      });
      return;
    }

    const applyTo = selectedCharges.length > 0 && !autoAllocate
      ? selectedCharges.map((chargeId) => {
          const charge = openCharges.find((c) => c.id === chargeId);
          return {
            chargeId,
            amount: Math.min(numAmount, Number(charge?.balance || 0)),
          };
        })
      : undefined;

    processPayment.mutate({
      patientId: selectedPatientId,
      paymentMethodId: selectedPaymentMethodId,
      amount: numAmount,
      description: description || undefined,
      applyTo,
      autoAllocate,
    });
  };

  const formatCardExpiry = (month: number, year: number) => {
    return `${month.toString().padStart(2, '0')}/${year.toString().slice(-2)}`;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Payment Terminal
        </CardTitle>
        <CardDescription>
          Process credit card payments for patient balances
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Patient Selection */}
        {!patientId && (
          <div className="space-y-2">
            <Label>Patient</Label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search patient by name..."
                className="pl-9"
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
              />
            </div>
            {patients && patients.length > 0 && !selectedPatientId && (
              <div className="border rounded-md mt-2 divide-y">
                {patients.slice(0, 5).map((p) => (
                  <button
                    key={p.id}
                    className="w-full p-2 text-left hover:bg-muted transition-colors"
                    onClick={() => {
                      setSelectedPatientId(p.id);
                      setPatientSearch(`${p.lastName}, ${p.firstName}`);
                    }}
                  >
                    <p className="font-medium">
                      {p.lastName}, {p.firstName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      DOB: {p.dateOfBirth
                        ? format(new Date(p.dateOfBirth), 'MM/dd/yyyy')
                        : 'N/A'}
                    </p>
                  </button>
                ))}
              </div>
            )}
            {selectedPatientId && patient && (
              <div className="p-3 bg-muted rounded-md">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">
                      {patient.demographics?.lastName}, {patient.demographics?.firstName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Balance: ${totalBalance.toFixed(2)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedPatientId('');
                      setPatientSearch('');
                      setSelectedPaymentMethodId('');
                      setSelectedCharges([]);
                    }}
                  >
                    Change
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Payment Method Selection */}
        {selectedPatientId && (
          <div className="space-y-2">
            <Label>Payment Method</Label>
            {loadingPaymentMethods ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading payment methods...
              </div>
            ) : paymentMethods && paymentMethods.length > 0 ? (
              <Select
                value={selectedPaymentMethodId}
                onValueChange={setSelectedPaymentMethodId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((method) => (
                    <SelectItem key={method.id} value={method.id}>
                      <div className="flex items-center gap-2">
                        <span>{cardBrandIcons[method.cardBrand]}</span>
                        <span>
                          {method.cardBrand} •••• {method.last4}
                        </span>
                        <span className="text-muted-foreground">
                          {formatCardExpiry(method.expiryMonth, method.expiryYear)}
                        </span>
                        {method.isDefault && (
                          <Badge variant="secondary" className="ml-1">
                            Default
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="p-4 border rounded-md text-center text-muted-foreground">
                <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No saved payment methods</p>
                <Button variant="outline" size="sm" className="mt-2">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Card
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Open Charges */}
        {selectedPatientId && openCharges.length > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label>Apply to Charges</Label>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleSelectAllCharges}>
                  Select All (${totalBalance.toFixed(2)})
                </Button>
                {selectedCharges.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={handleApplySelectedAmount}>
                    Apply ${selectedChargesTotal.toFixed(2)}
                  </Button>
                )}
              </div>
            </div>
            <ScrollArea className="h-48 border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openCharges.map((charge) => (
                    <TableRow key={charge.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedCharges.includes(charge.id)}
                          onCheckedChange={(checked) =>
                            handleChargeToggle(charge.id, checked as boolean)
                          }
                        />
                      </TableCell>
                      <TableCell className="text-sm">
                        {format(new Date(charge.serviceDate), 'MM/dd/yyyy')}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{charge.cptCode}</p>
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {charge.description}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ${Number(charge.balance).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
            <div className="flex items-center gap-2">
              <Checkbox
                id="autoAllocate"
                checked={autoAllocate}
                onCheckedChange={(checked) => setAutoAllocate(checked as boolean)}
              />
              <Label htmlFor="autoAllocate" className="text-sm text-muted-foreground">
                Auto-allocate to oldest charges first
              </Label>
            </div>
          </div>
        )}

        {/* Amount and Description */}
        {selectedPatientId && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Payment Amount</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className="pl-8 text-lg font-semibold"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input
                placeholder="Payment note..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Summary and Process Button */}
        {selectedPatientId && selectedPaymentMethodId && parseFloat(amount) > 0 && (
          <div className="border rounded-lg p-4 bg-muted/50">
            <div className="flex justify-between items-center mb-4">
              <span className="text-muted-foreground">Total to Charge:</span>
              <span className="text-2xl font-bold">${parseFloat(amount).toFixed(2)}</span>
            </div>
            {selectedCharges.length > 0 && !autoAllocate && (
              <p className="text-sm text-muted-foreground mb-4">
                Applying to {selectedCharges.length} selected charge(s)
              </p>
            )}
            {autoAllocate && (
              <p className="text-sm text-muted-foreground mb-4">
                Will be auto-allocated to oldest charges
              </p>
            )}
            <Button
              className="w-full bg-[#053e67] hover:bg-[#042d4d]"
              size="lg"
              onClick={handleProcessPayment}
              disabled={processPayment.isPending}
            >
              {processPayment.isPending ? (
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
          </div>
        )}

        {/* Empty state */}
        {!selectedPatientId && (
          <div className="text-center py-8 text-muted-foreground">
            <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Search for a patient to process a payment</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
