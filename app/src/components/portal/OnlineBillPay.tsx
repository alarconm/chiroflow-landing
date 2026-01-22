'use client';

/**
 * Epic 14: Patient Portal - Online Bill Pay Component
 * US-097: Allow patients to view and pay bills through portal
 *
 * Features:
 * - View current balance and itemized charges
 * - View payment history
 * - Pay full balance or custom amount
 * - Save payment method for future use
 * - Set up payment plan (if enabled)
 * - Download receipts and statements
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { trpc } from '@/trpc/client';
import { format } from 'date-fns';
import {
  CreditCard,
  DollarSign,
  Download,
  FileText,
  Lock,
  CheckCircle,
  AlertCircle,
  Calendar,
  Receipt,
  Wallet,
  Plus,
  Trash2,
  Clock,
  ArrowRight,
} from 'lucide-react';

// Types
interface Charge {
  id: string;
  serviceDate: Date;
  cptCode: string;
  description: string;
  fee: number;
  adjustments: number;
  payments: number;
  balance: number;
  status: string;
  providerName?: string;
}

interface PaymentHistoryItem {
  id: string;
  paymentDate: Date;
  amount: number;
  paymentMethod: string;
  referenceNumber?: string;
  status: string;
  receiptUrl?: string;
}

interface SavedPaymentMethod {
  id: string;
  last4: string;
  cardBrand: string;
  cardType: string;
  expiryMonth: number;
  expiryYear: number;
  cardholderName: string;
  isDefault: boolean;
  nickname?: string;
}

interface PaymentPlan {
  id: string;
  name?: string;
  totalAmount: number;
  amountPaid: number;
  amountRemaining: number;
  numberOfInstallments: number;
  installmentsPaid: number;
  installmentAmount: number;
  frequency: string;
  nextDueDate?: Date;
  status: string;
}

export function OnlineBillPay() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Payment form state
  const [paymentAmount, setPaymentAmount] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('');
  const [useNewCard, setUseNewCard] = useState(false);
  const [saveCard, setSaveCard] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  const [expiryYear, setExpiryYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [billingZip, setBillingZip] = useState('');

  // Dialog state
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showPaymentPlanDialog, setShowPaymentPlanDialog] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [showDeleteMethodDialog, setShowDeleteMethodDialog] = useState(false);
  const [methodToDelete, setMethodToDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string>('');

  // Payment plan form state
  const [planInstallments, setPlanInstallments] = useState('6');
  const [planStartDate, setPlanStartDate] = useState('');

  useEffect(() => {
    setToken(localStorage.getItem('portalToken'));
  }, []);

  // Queries
  const { data: balanceData, isLoading: loadingBalance } = trpc.portal.getCurrentBalance.useQuery(
    { sessionToken: token! },
    { enabled: !!token }
  );

  const { data: chargesData, isLoading: loadingCharges } = trpc.portal.getItemizedCharges.useQuery(
    { sessionToken: token!, status: 'outstanding' },
    { enabled: !!token }
  );

  const { data: paymentHistory, isLoading: loadingHistory } = trpc.portal.getPaymentHistory.useQuery(
    { sessionToken: token!, limit: 20 },
    { enabled: !!token }
  );

  const { data: savedMethods, isLoading: loadingMethods, refetch: refetchMethods } =
    trpc.portal.getSavedPaymentMethods.useQuery(
      { sessionToken: token! },
      { enabled: !!token }
    );

  const { data: paymentPlans, isLoading: loadingPlans } = trpc.portal.getPaymentPlans.useQuery(
    { sessionToken: token! },
    { enabled: !!token }
  );

  const { data: statementsData } = trpc.portal.listStatements.useQuery(
    { sessionToken: token!, limit: 10 },
    { enabled: !!token }
  );

  // Mutations
  const makePaymentMutation = trpc.portal.makePaymentWithMethod.useMutation({
    onSuccess: (result) => {
      setShowPaymentDialog(false);
      setSuccessMessage(`Payment of $${paymentAmount} processed successfully.`);
      setShowSuccessDialog(true);
      resetPaymentForm();
      // Refetch data
      refetchMethods();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const createPaymentPlanMutation = trpc.portal.createPaymentPlan.useMutation({
    onSuccess: () => {
      setShowPaymentPlanDialog(false);
      setSuccessMessage('Payment plan created successfully.');
      setShowSuccessDialog(true);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const deletePaymentMethodMutation = trpc.portal.deletePaymentMethod.useMutation({
    onSuccess: () => {
      setShowDeleteMethodDialog(false);
      setMethodToDelete(null);
      refetchMethods();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const setDefaultMethodMutation = trpc.portal.setDefaultPaymentMethod.useMutation({
    onSuccess: () => {
      refetchMethods();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  // Helper functions
  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    return parts.length ? parts.join(' ') : value;
  };

  const resetPaymentForm = () => {
    setPaymentAmount('');
    setSelectedPaymentMethod('');
    setUseNewCard(false);
    setSaveCard(false);
    setCardNumber('');
    setExpiryMonth('');
    setExpiryYear('');
    setCvv('');
    setCardholderName('');
    setBillingZip('');
    setError(null);
  };

  const getCardBrandIcon = (brand: string) => {
    // Could add card brand icons here
    return <CreditCard className="h-5 w-5" />;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      PENDING: { label: 'Pending', variant: 'default' },
      BILLED: { label: 'Billed', variant: 'default' },
      PAID: { label: 'Paid', variant: 'outline' },
      COMPLETED: { label: 'Completed', variant: 'outline' },
      FAILED: { label: 'Failed', variant: 'destructive' },
      REFUNDED: { label: 'Refunded', variant: 'secondary' },
    };
    const config = variants[status] || { label: status, variant: 'outline' as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const handleMakePayment = () => {
    if (!token) return;

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid payment amount');
      return;
    }

    if (balanceData && amount > balanceData.balance) {
      setError(`Payment amount cannot exceed balance of $${balanceData.balance.toFixed(2)}`);
      return;
    }

    if (!useNewCard && !selectedPaymentMethod) {
      setError('Please select a payment method');
      return;
    }

    if (useNewCard) {
      if (!cardNumber || !expiryMonth || !expiryYear || !cvv || !cardholderName) {
        setError('Please fill in all card details');
        return;
      }
    }

    setError(null);

    makePaymentMutation.mutate({
      sessionToken: token,
      amount,
      paymentMethodId: useNewCard ? undefined : selectedPaymentMethod,
      newCard: useNewCard
        ? {
            cardNumber: cardNumber.replace(/\s/g, ''),
            expiryMonth,
            expiryYear,
            cvv,
            cardholderName,
            billingZip,
            saveForFuture: saveCard,
          }
        : undefined,
    });
  };

  const handleCreatePaymentPlan = () => {
    if (!token || !balanceData) return;

    const installments = parseInt(planInstallments);
    if (isNaN(installments) || installments < 2) {
      setError('Please select a valid number of installments');
      return;
    }

    if (!selectedPaymentMethod && !useNewCard) {
      setError('Please select a payment method for automatic payments');
      return;
    }

    setError(null);

    createPaymentPlanMutation.mutate({
      sessionToken: token,
      totalAmount: balanceData.balance,
      numberOfInstallments: installments,
      paymentMethodId: selectedPaymentMethod || undefined,
      startDate: planStartDate ? new Date(planStartDate) : undefined,
    });
  };

  const handleDeleteMethod = () => {
    if (!token || !methodToDelete) return;
    deletePaymentMethodMutation.mutate({
      sessionToken: token,
      paymentMethodId: methodToDelete,
    });
  };

  const handleSetDefaultMethod = (methodId: string) => {
    if (!token) return;
    setDefaultMethodMutation.mutate({
      sessionToken: token,
      paymentMethodId: methodId,
    });
  };

  if (!token) return null;

  const balance = balanceData?.balance || 0;
  const charges = (chargesData?.charges || []) as Charge[];
  const payments = (paymentHistory?.payments || []) as PaymentHistoryItem[];
  const methods = (savedMethods?.methods || []) as SavedPaymentMethod[];
  const plans = (paymentPlans?.plans || []) as PaymentPlan[];
  const statements = statementsData?.statements || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Billing & Payments</h1>
        <p className="text-gray-600">View your balance, make payments, and manage billing</p>
      </div>

      {/* Balance Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Current Balance */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Current Balance</p>
                {loadingBalance ? (
                  <Skeleton className="h-9 w-24 mt-1" />
                ) : (
                  <p className="text-3xl font-bold text-primary">${balance.toFixed(2)}</p>
                )}
              </div>
              <div className="p-4 bg-primary/10 rounded-full">
                <DollarSign className="h-8 w-8 text-primary" />
              </div>
            </div>
            {balance > 0 && (
              <Button className="w-full mt-4" onClick={() => {
                setPaymentAmount(balance.toFixed(2));
                setShowPaymentDialog(true);
              }}>
                <CreditCard className="h-4 w-4 mr-2" />
                Pay Now
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Active Payment Plan */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Payment Plans</p>
                {loadingPlans ? (
                  <Skeleton className="h-9 w-24 mt-1" />
                ) : (
                  <p className="text-3xl font-bold">
                    {plans.filter(p => p.status === 'ACTIVE').length}
                  </p>
                )}
              </div>
              <div className="p-4 bg-secondary/50 rounded-full">
                <Calendar className="h-8 w-8 text-secondary-foreground" />
              </div>
            </div>
            {balance > 100 && plans.filter(p => p.status === 'ACTIVE').length === 0 && (
              <Button variant="outline" className="w-full mt-4" onClick={() => setShowPaymentPlanDialog(true)}>
                <Clock className="h-4 w-4 mr-2" />
                Set Up Payment Plan
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Saved Payment Methods */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Saved Cards</p>
                {loadingMethods ? (
                  <Skeleton className="h-9 w-16 mt-1" />
                ) : (
                  <p className="text-3xl font-bold">{methods.length}</p>
                )}
              </div>
              <div className="p-4 bg-secondary/50 rounded-full">
                <Wallet className="h-8 w-8 text-secondary-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="history">Payment History</TabsTrigger>
          <TabsTrigger value="methods">Payment Methods</TabsTrigger>
          <TabsTrigger value="statements">Statements</TabsTrigger>
        </TabsList>

        {/* Overview Tab - Itemized Charges */}
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Outstanding Charges</CardTitle>
              <CardDescription>Itemized list of your current charges</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingCharges ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16" />
                  ))}
                </div>
              ) : charges.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
                  <p className="text-gray-500">No outstanding charges</p>
                  <p className="text-sm text-gray-400 mt-1">Your account is current</p>
                </div>
              ) : (
                <div className="divide-y">
                  {charges.map((charge) => (
                    <div key={charge.id} className="py-4">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{charge.description}</span>
                            <Badge variant="outline">{charge.cptCode}</Badge>
                          </div>
                          <div className="text-sm text-gray-500">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(charge.serviceDate), 'MMM d, yyyy')}
                              {charge.providerName && ` • ${charge.providerName}`}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-sm text-gray-500">Balance</p>
                            <p className="text-lg font-semibold">${charge.balance.toFixed(2)}</p>
                          </div>
                          {getStatusBadge(charge.status)}
                        </div>
                      </div>
                      {(charge.adjustments > 0 || charge.payments > 0) && (
                        <div className="mt-2 text-sm text-gray-500">
                          <span>Original: ${charge.fee.toFixed(2)}</span>
                          {charge.adjustments > 0 && (
                            <span className="ml-3">Adj: -${charge.adjustments.toFixed(2)}</span>
                          )}
                          {charge.payments > 0 && (
                            <span className="ml-3">Paid: -${charge.payments.toFixed(2)}</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {charges.length > 0 && (
                <div className="mt-6 pt-4 border-t flex justify-between items-center">
                  <div>
                    <p className="text-sm text-gray-500">Total Outstanding</p>
                    <p className="text-2xl font-bold">${balance.toFixed(2)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => {
                      setPaymentAmount('');
                      setShowPaymentDialog(true);
                    }}>
                      Pay Custom Amount
                    </Button>
                    <Button onClick={() => {
                      setPaymentAmount(balance.toFixed(2));
                      setShowPaymentDialog(true);
                    }}>
                      Pay Full Balance
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Active Payment Plans */}
          {plans.filter(p => p.status === 'ACTIVE').length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Active Payment Plans</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {plans.filter(p => p.status === 'ACTIVE').map((plan) => (
                    <div key={plan.id} className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">{plan.name || 'Payment Plan'}</p>
                          <p className="text-sm text-gray-500 mt-1">
                            ${plan.installmentAmount.toFixed(2)}/month • {plan.installmentsPaid}/{plan.numberOfInstallments} payments made
                          </p>
                        </div>
                        <Badge>{plan.status}</Badge>
                      </div>
                      <div className="mt-3">
                        <div className="flex justify-between text-sm mb-1">
                          <span>Progress</span>
                          <span>${plan.amountPaid.toFixed(2)} of ${plan.totalAmount.toFixed(2)}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-primary rounded-full h-2"
                            style={{ width: `${(plan.amountPaid / plan.totalAmount) * 100}%` }}
                          />
                        </div>
                      </div>
                      {plan.nextDueDate && (
                        <p className="text-sm text-gray-500 mt-2">
                          Next payment: {format(new Date(plan.nextDueDate), 'MMM d, yyyy')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Payment History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Payment History</CardTitle>
              <CardDescription>Your recent payment transactions</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingHistory ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16" />
                  ))}
                </div>
              ) : payments.length === 0 ? (
                <div className="text-center py-12">
                  <Receipt className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500">No payment history</p>
                </div>
              ) : (
                <div className="divide-y">
                  {payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">${payment.amount.toFixed(2)}</span>
                          {getStatusBadge(payment.status)}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(payment.paymentDate), 'MMM d, yyyy')}
                          <span className="mx-1">•</span>
                          <CreditCard className="h-3 w-3" />
                          {payment.paymentMethod.replace('_', ' ')}
                          {payment.referenceNumber && (
                            <>
                              <span className="mx-1">•</span>
                              <span>Ref: {payment.referenceNumber}</span>
                            </>
                          )}
                        </div>
                      </div>
                      {payment.receiptUrl && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={payment.receiptUrl} target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4 mr-1" />
                            Receipt
                          </a>
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payment Methods Tab */}
        <TabsContent value="methods">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Saved Payment Methods</CardTitle>
                  <CardDescription>Manage your saved cards for faster checkout</CardDescription>
                </div>
                <Button onClick={() => {
                  setUseNewCard(true);
                  setSaveCard(true);
                  setShowPaymentDialog(true);
                  setPaymentAmount('0.00');
                }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Card
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingMethods ? (
                <div className="space-y-4">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-20" />
                  ))}
                </div>
              ) : methods.length === 0 ? (
                <div className="text-center py-12">
                  <CreditCard className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500">No saved payment methods</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Add a card to enable faster payments and auto-pay
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {methods.map((method) => (
                    <div
                      key={method.id}
                      className={`p-4 rounded-lg border ${method.isDefault ? 'border-primary bg-primary/5' : 'border-gray-200'}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          {getCardBrandIcon(method.cardBrand)}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {method.cardBrand} •••• {method.last4}
                              </span>
                              {method.isDefault && (
                                <Badge variant="secondary">Default</Badge>
                              )}
                            </div>
                            <p className="text-sm text-gray-500">
                              {method.cardholderName} • Expires {method.expiryMonth}/{method.expiryYear}
                              {method.nickname && ` • ${method.nickname}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {!method.isDefault && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSetDefaultMethod(method.id)}
                            >
                              Set Default
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              setMethodToDelete(method.id);
                              setShowDeleteMethodDialog(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Statements Tab */}
        <TabsContent value="statements">
          <Card>
            <CardHeader>
              <CardTitle>Billing Statements</CardTitle>
              <CardDescription>Download your billing statements</CardDescription>
            </CardHeader>
            <CardContent>
              {statements.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500">No statements available</p>
                </div>
              ) : (
                <div className="divide-y">
                  {statements.map((statement) => (
                    <div
                      key={statement.id}
                      className="py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{statement.statementNumber}</span>
                          {getStatusBadge(statement.status)}
                        </div>
                        <div className="text-sm text-gray-500">
                          <span>Statement Date: {format(new Date(statement.statementDate), 'MMM d, yyyy')}</span>
                          <span className="mx-2">•</span>
                          <span>
                            Period: {format(new Date(statement.periodStart), 'MMM d')} -
                            {format(new Date(statement.periodEnd), 'MMM d, yyyy')}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm text-gray-500">Amount Due</p>
                          <p className="font-semibold">${statement.totalDue.toFixed(2)}</p>
                        </div>
                        {statement.pdfUrl && (
                          <Button variant="outline" size="sm" asChild>
                            <a href={statement.pdfUrl} target="_blank" rel="noopener noreferrer">
                              <Download className="h-4 w-4 mr-1" />
                              PDF
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={(open) => {
        if (!open) resetPaymentForm();
        setShowPaymentDialog(open);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Make a Payment</DialogTitle>
            <DialogDescription>
              Pay your balance securely with a credit or debit card
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="amount">Payment Amount</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={balance}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="0.00"
                  className="pl-8"
                />
              </div>
              {balance > 0 && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPaymentAmount(balance.toFixed(2))}
                  >
                    Pay Full Balance (${balance.toFixed(2)})
                  </Button>
                </div>
              )}
            </div>

            {/* Payment Method Selection */}
            {methods.length > 0 && !useNewCard && (
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select value={selectedPaymentMethod} onValueChange={setSelectedPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a saved card" />
                  </SelectTrigger>
                  <SelectContent>
                    {methods.map((method) => (
                      <SelectItem key={method.id} value={method.id}>
                        {method.cardBrand} •••• {method.last4}
                        {method.isDefault && ' (Default)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="link"
                  className="px-0 h-auto"
                  onClick={() => setUseNewCard(true)}
                >
                  Use a different card
                </Button>
              </div>
            )}

            {/* New Card Form */}
            {(useNewCard || methods.length === 0) && (
              <div className="space-y-4 pt-2">
                {methods.length > 0 && (
                  <Button
                    type="button"
                    variant="link"
                    className="px-0 h-auto"
                    onClick={() => {
                      setUseNewCard(false);
                      setSelectedPaymentMethod(methods.find(m => m.isDefault)?.id || methods[0]?.id || '');
                    }}
                  >
                    <ArrowRight className="h-4 w-4 mr-1 rotate-180" />
                    Use saved card
                  </Button>
                )}

                <div className="space-y-2">
                  <Label htmlFor="cardNumber">Card Number</Label>
                  <Input
                    id="cardNumber"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                    placeholder="1234 5678 9012 3456"
                    maxLength={19}
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Month</Label>
                    <Select value={expiryMonth} onValueChange={setExpiryMonth}>
                      <SelectTrigger>
                        <SelectValue placeholder="MM" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) => (
                          <SelectItem key={i + 1} value={String(i + 1).padStart(2, '0')}>
                            {String(i + 1).padStart(2, '0')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Year</Label>
                    <Select value={expiryYear} onValueChange={setExpiryYear}>
                      <SelectTrigger>
                        <SelectValue placeholder="YY" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 10 }, (_, i) => {
                          const year = new Date().getFullYear() + i;
                          return (
                            <SelectItem key={year} value={String(year).slice(-2)}>
                              {year}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cvv">CVV</Label>
                    <Input
                      id="cvv"
                      value={cvv}
                      onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="123"
                      maxLength={4}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cardholderName">Cardholder Name</Label>
                  <Input
                    id="cardholderName"
                    value={cardholderName}
                    onChange={(e) => setCardholderName(e.target.value)}
                    placeholder="Name on card"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="billingZip">Billing ZIP Code</Label>
                  <Input
                    id="billingZip"
                    value={billingZip}
                    onChange={(e) => setBillingZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                    placeholder="12345"
                    maxLength={5}
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="saveCard"
                    checked={saveCard}
                    onCheckedChange={(checked) => setSaveCard(checked === true)}
                  />
                  <label htmlFor="saveCard" className="text-sm cursor-pointer">
                    Save this card for future payments
                  </label>
                </div>
              </div>
            )}

            {/* Security Notice */}
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
              <Lock className="h-4 w-4" />
              <span>Your payment is encrypted and secure</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleMakePayment}
              disabled={makePaymentMutation.isPending}
            >
              {makePaymentMutation.isPending ? 'Processing...' : `Pay $${paymentAmount || '0.00'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Plan Dialog */}
      <Dialog open={showPaymentPlanDialog} onOpenChange={setShowPaymentPlanDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set Up Payment Plan</DialogTitle>
            <DialogDescription>
              Split your balance into manageable monthly payments
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">Total Balance</p>
              <p className="text-2xl font-bold">${balance.toFixed(2)}</p>
            </div>

            <div className="space-y-2">
              <Label>Number of Payments</Label>
              <Select value={planInstallments} onValueChange={setPlanInstallments}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[3, 6, 9, 12].map((num) => (
                    <SelectItem key={num} value={String(num)}>
                      {num} payments (${(balance / num).toFixed(2)}/month)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="p-4 bg-primary/5 rounded-lg">
              <div className="flex justify-between text-sm">
                <span>Monthly Payment</span>
                <span className="font-semibold">
                  ${(balance / parseInt(planInstallments || '6')).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Payment Method for Auto-Pay</Label>
              {methods.length > 0 ? (
                <Select value={selectedPaymentMethod} onValueChange={setSelectedPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a saved card" />
                  </SelectTrigger>
                  <SelectContent>
                    {methods.map((method) => (
                      <SelectItem key={method.id} value={method.id}>
                        {method.cardBrand} •••• {method.last4}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-gray-500">
                  Please add a payment method first to set up a payment plan.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="startDate">First Payment Date</Label>
              <Input
                id="startDate"
                type="date"
                value={planStartDate}
                onChange={(e) => setPlanStartDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentPlanDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreatePaymentPlan}
              disabled={createPaymentPlanMutation.isPending || methods.length === 0}
            >
              {createPaymentPlanMutation.isPending ? 'Creating...' : 'Create Payment Plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="max-w-sm text-center">
          <div className="py-6">
            <CheckCircle className="h-16 w-16 mx-auto text-green-500 mb-4" />
            <DialogTitle className="text-xl mb-2">Success!</DialogTitle>
            <DialogDescription>{successMessage}</DialogDescription>
          </div>
          <DialogFooter className="justify-center">
            <Button onClick={() => setShowSuccessDialog(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Payment Method Confirmation */}
      <Dialog open={showDeleteMethodDialog} onOpenChange={setShowDeleteMethodDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Payment Method?</DialogTitle>
            <DialogDescription>
              This card will be removed from your account. Any active auto-pay arrangements using this card will be cancelled.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteMethodDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteMethod}
              disabled={deletePaymentMethodMutation.isPending}
            >
              {deletePaymentMethodMutation.isPending ? 'Removing...' : 'Remove Card'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
