'use client';

/**
 * Epic 14: Patient Portal - Payment Form Component
 */

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { trpc } from '@/trpc/client';
import { CreditCard, Lock, CheckCircle, AlertCircle } from 'lucide-react';

export function PaymentForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState<string | null>(null);

  // Form state
  const [amount, setAmount] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  const [expiryYear, setExpiryYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [billingAddress, setBillingAddress] = useState({
    line1: '',
    city: '',
    state: '',
    zipCode: '',
  });
  const [saveCard, setSaveCard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setToken(localStorage.getItem('portalToken'));
  }, []);

  const { data: balanceData } = trpc.portal.getCurrentBalance.useQuery(
    { sessionToken: token! },
    { enabled: !!token }
  );

  const paymentMutation = trpc.portal.makePayment.useMutation({
    onSuccess: () => {
      setSuccess(true);
      setError(null);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const paymentAmount = parseFloat(amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      setError('Please enter a valid payment amount');
      return;
    }

    paymentMutation.mutate({
      sessionToken: token,
      amount: paymentAmount,
      cardNumber,
      expiryMonth,
      expiryYear,
      cvv,
      cardholderName,
      billingAddress,
      savePaymentMethod: saveCard,
    });
  };

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

  if (!token) return null;

  if (success) {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="py-12 text-center">
          <CheckCircle className="h-16 w-16 mx-auto text-green-500 mb-4" />
          <h2 className="text-2xl font-semibold mb-2">Payment Successful!</h2>
          <p className="text-gray-600 mb-6">
            Your payment of ${parseFloat(amount).toFixed(2)} has been processed successfully.
          </p>
          <div className="flex justify-center gap-4">
            <Button variant="outline" onClick={() => router.push('/portal/billing')}>
              View Statements
            </Button>
            <Button onClick={() => router.push('/portal')}>Back to Dashboard</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Make a Payment</h1>
        <p className="text-gray-600">Pay your balance securely online</p>
      </div>

      {/* Balance Info */}
      {balanceData && balanceData.balance > 0 && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Current Balance</p>
                <p className="text-2xl font-bold text-primary">
                  ${balanceData.balance.toFixed(2)}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAmount(balanceData.balance.toFixed(2))}
              >
                Pay Full Balance
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Payment Information
          </CardTitle>
          <CardDescription>Enter your card details to make a payment</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
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
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="pl-8"
                  required
                />
              </div>
            </div>

            {/* Card Number */}
            <div className="space-y-2">
              <Label htmlFor="cardNumber">Card Number</Label>
              <Input
                id="cardNumber"
                value={cardNumber}
                onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                placeholder="1234 5678 9012 3456"
                maxLength={19}
                required
              />
            </div>

            {/* Expiry and CVV */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="expiryMonth">Month</Label>
                <select
                  id="expiryMonth"
                  value={expiryMonth}
                  onChange={(e) => setExpiryMonth(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                  required
                >
                  <option value="">MM</option>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={String(i + 1).padStart(2, '0')}>
                      {String(i + 1).padStart(2, '0')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiryYear">Year</Label>
                <select
                  id="expiryYear"
                  value={expiryYear}
                  onChange={(e) => setExpiryYear(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                  required
                >
                  <option value="">YY</option>
                  {Array.from({ length: 10 }, (_, i) => {
                    const year = new Date().getFullYear() + i;
                    return (
                      <option key={year} value={String(year).slice(-2)}>
                        {year}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cvv">CVV</Label>
                <Input
                  id="cvv"
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="123"
                  maxLength={4}
                  required
                />
              </div>
            </div>

            {/* Cardholder Name */}
            <div className="space-y-2">
              <Label htmlFor="cardholderName">Cardholder Name</Label>
              <Input
                id="cardholderName"
                value={cardholderName}
                onChange={(e) => setCardholderName(e.target.value)}
                placeholder="Name as it appears on card"
                required
              />
            </div>

            {/* Billing Address */}
            <div className="space-y-4">
              <Label>Billing Address</Label>
              <Input
                placeholder="Street Address"
                value={billingAddress.line1}
                onChange={(e) =>
                  setBillingAddress({ ...billingAddress, line1: e.target.value })
                }
                required
              />
              <div className="grid grid-cols-3 gap-4">
                <Input
                  placeholder="City"
                  value={billingAddress.city}
                  onChange={(e) =>
                    setBillingAddress({ ...billingAddress, city: e.target.value })
                  }
                  required
                />
                <Input
                  placeholder="State"
                  value={billingAddress.state}
                  onChange={(e) =>
                    setBillingAddress({ ...billingAddress, state: e.target.value })
                  }
                  maxLength={2}
                  required
                />
                <Input
                  placeholder="ZIP"
                  value={billingAddress.zipCode}
                  onChange={(e) =>
                    setBillingAddress({ ...billingAddress, zipCode: e.target.value })
                  }
                  maxLength={10}
                  required
                />
              </div>
            </div>

            {/* Save Card */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="saveCard"
                checked={saveCard}
                onCheckedChange={(checked) => setSaveCard(checked === true)}
              />
              <label
                htmlFor="saveCard"
                className="text-sm text-gray-600 cursor-pointer"
              >
                Save this card for future payments
              </label>
            </div>

            {/* Security Notice */}
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
              <Lock className="h-4 w-4" />
              <span>Your payment information is encrypted and secure</span>
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/portal/billing')}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={paymentMutation.isPending}>
                {paymentMutation.isPending ? 'Processing...' : `Pay $${amount || '0.00'}`}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
