'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { CreditCard, Trash2, Star, Plus } from 'lucide-react';
import type { CardBrand, CardType } from '@prisma/client';
import { formatExpiryDate, isCardExpired, getCardBrandDisplayName } from '@/lib/payment';

interface PaymentMethodManagerProps {
  patientId: string;
  onAddCard?: () => void;
}

export function PaymentMethodManager({ patientId, onAddCard }: PaymentMethodManagerProps) {
  const utils = trpc.useUtils();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: paymentMethods, isLoading } = trpc.paymentProcessing.listPaymentMethods.useQuery({
    patientId,
  });

  const updateMutation = trpc.paymentProcessing.updatePaymentMethod.useMutation({
    onSuccess: () => {
      utils.paymentProcessing.listPaymentMethods.invalidate({ patientId });
      toast.success('Payment method updated');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = trpc.paymentProcessing.deletePaymentMethod.useMutation({
    onSuccess: () => {
      utils.paymentProcessing.listPaymentMethods.invalidate({ patientId });
      toast.success('Payment method removed');
      setDeletingId(null);
    },
    onError: (error) => {
      toast.error(error.message);
      setDeletingId(null);
    },
  });

  const handleSetDefault = (id: string) => {
    updateMutation.mutate({ id, isDefault: true });
  };

  const handleDelete = (id: string) => {
    setDeletingId(id);
    deleteMutation.mutate({ id });
  };

  const getCardIcon = (brand: CardBrand) => {
    // In a real app, you'd use actual card brand icons
    return <CreditCard className="h-6 w-6" />;
  };

  const getCardTypeLabel = (type: CardType) => {
    switch (type) {
      case 'HSA':
        return <Badge variant="secondary">HSA</Badge>;
      case 'FSA':
        return <Badge variant="secondary">FSA</Badge>;
      case 'DEBIT':
        return <Badge variant="outline">Debit</Badge>;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Payment Methods</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-16 bg-muted rounded" />
            <div className="h-16 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Payment Methods</CardTitle>
            <CardDescription>Manage saved payment methods</CardDescription>
          </div>
          {onAddCard && (
            <Button onClick={onAddCard} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Card
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {paymentMethods && paymentMethods.length > 0 ? (
          <div className="space-y-3">
            {paymentMethods.map((method) => {
              const expired = isCardExpired(method.expiryMonth, method.expiryYear);
              return (
                <div
                  key={method.id}
                  className={`flex items-center justify-between p-4 border rounded-lg ${
                    expired ? 'border-destructive/50 bg-destructive/5' : ''
                  }`}
                >
                  <div className="flex items-center space-x-4">
                    <div className="text-muted-foreground">
                      {getCardIcon(method.cardBrand)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {getCardBrandDisplayName(method.cardBrand)} ****{method.last4}
                        </span>
                        {method.isDefault && (
                          <Badge variant="default" className="text-xs">
                            <Star className="h-3 w-3 mr-1" />
                            Default
                          </Badge>
                        )}
                        {getCardTypeLabel(method.cardType)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {method.cardholderName} - Expires{' '}
                        {formatExpiryDate(method.expiryMonth, method.expiryYear)}
                        {expired && (
                          <span className="text-destructive ml-2">(Expired)</span>
                        )}
                      </div>
                      {method.nickname && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {method.nickname}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {!method.isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSetDefault(method.id)}
                        disabled={updateMutation.isPending}
                      >
                        Set Default
                      </Button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove Payment Method</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to remove this payment method? This action
                            cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(method.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {deletingId === method.id ? 'Removing...' : 'Remove'}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No payment methods on file</p>
            {onAddCard && (
              <Button onClick={onAddCard} variant="outline" className="mt-4">
                <Plus className="h-4 w-4 mr-2" />
                Add Payment Method
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
