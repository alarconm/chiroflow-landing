'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import {
  CreditCard,
  Plus,
  MoreHorizontal,
  Star,
  StarOff,
  Trash2,
  Edit,
  AlertCircle,
  Loader2,
  CheckCircle,
  Shield,
} from 'lucide-react';
import { CardBrand, CardType } from '@prisma/client';

interface SavedPaymentMethodsManagerProps {
  patientId: string;
}

const cardBrandLogos: Record<string, { icon: string; color: string }> = {
  VISA: { icon: '💳', color: 'text-blue-600' },
  MASTERCARD: { icon: '💳', color: 'text-orange-500' },
  AMEX: { icon: '💳', color: 'text-blue-800' },
  DISCOVER: { icon: '💳', color: 'text-orange-400' },
  OTHER: { icon: '💳', color: 'text-gray-500' },
};

const cardTypeLabels: Record<string, string> = {
  CREDIT: 'Credit',
  DEBIT: 'Debit',
  HSA: 'HSA',
  FSA: 'FSA',
};

export function SavedPaymentMethodsManager({ patientId }: SavedPaymentMethodsManagerProps) {
  const [showAddCard, setShowAddCard] = useState(false);
  const [editingMethod, setEditingMethod] = useState<string | null>(null);
  const [nickname, setNickname] = useState('');
  const { toast } = useToast();
  const utils = trpc.useUtils();

  // Get payment methods
  const { data: paymentMethods, isLoading } = trpc.paymentProcessing.listPaymentMethods.useQuery(
    { patientId, includeInactive: false }
  );

  // Mutations
  const updatePaymentMethod = trpc.paymentProcessing.updatePaymentMethod.useMutation({
    onSuccess: () => {
      toast({ title: 'Payment method updated' });
      utils.paymentProcessing.listPaymentMethods.invalidate();
      setEditingMethod(null);
      setNickname('');
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deletePaymentMethod = trpc.paymentProcessing.deletePaymentMethod.useMutation({
    onSuccess: () => {
      toast({ title: 'Payment method removed' });
      utils.paymentProcessing.listPaymentMethods.invalidate();
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSetDefault = (id: string) => {
    updatePaymentMethod.mutate({ id, isDefault: true });
  };

  const handleUpdateNickname = (id: string) => {
    updatePaymentMethod.mutate({ id, nickname: nickname || null });
  };

  const handleDelete = (id: string) => {
    deletePaymentMethod.mutate({ id });
  };

  const formatExpiry = (month: number, year: number) => {
    return `${month.toString().padStart(2, '0')}/${year.toString().slice(-2)}`;
  };

  const isExpiringSoon = (month: number, year: number) => {
    const now = new Date();
    const expiry = new Date(year, month - 1);
    const threeMonths = new Date(now.getFullYear(), now.getMonth() + 3);
    return expiry <= threeMonths;
  };

  const isExpired = (month: number, year: number) => {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    return year < currentYear || (year === currentYear && month < currentMonth);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Saved Payment Methods</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Saved Payment Methods
            </CardTitle>
            <CardDescription>
              Manage stored cards for this patient
            </CardDescription>
          </div>
          <Dialog open={showAddCard} onOpenChange={setShowAddCard}>
            <DialogTrigger asChild>
              <Button className="bg-[#053e67] hover:bg-[#042d4d]">
                <Plus className="h-4 w-4 mr-2" />
                Add Card
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Payment Method</DialogTitle>
                <DialogDescription>
                  Card details are securely tokenized via Stripe
                </DialogDescription>
              </DialogHeader>
              <div className="py-6 text-center text-muted-foreground">
                <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="mb-4">
                  In production, this would display a Stripe Elements form
                  for secure card entry.
                </p>
                <p className="text-sm">
                  Card numbers never touch our servers - they're tokenized directly with Stripe.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddCard(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setShowAddCard(false)}>
                  Save Card
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {!paymentMethods || paymentMethods.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No saved payment methods</p>
            <p className="text-sm">Add a card to enable quick payments</p>
          </div>
        ) : (
          <div className="space-y-3">
            {paymentMethods.map((method) => {
              const brandInfo = cardBrandLogos[method.cardBrand] || cardBrandLogos.OTHER;
              const expired = isExpired(method.expiryMonth, method.expiryYear);
              const expiringSoon = isExpiringSoon(method.expiryMonth, method.expiryYear);

              return (
                <div
                  key={method.id}
                  className={`flex items-center justify-between p-4 border rounded-lg ${
                    expired ? 'bg-red-50 border-red-200' : method.isDefault ? 'bg-blue-50 border-blue-200' : ''
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`text-2xl ${brandInfo.color}`}>
                      {brandInfo.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {method.cardBrand} •••• {method.last4}
                        </span>
                        {method.isDefault && (
                          <Badge variant="secondary" className="flex items-center gap-1">
                            <Star className="h-3 w-3" />
                            Default
                          </Badge>
                        )}
                        {method.cardType !== 'CREDIT' && (
                          <Badge variant="outline">
                            {cardTypeLabels[method.cardType]}
                          </Badge>
                        )}
                        {expired && (
                          <Badge variant="destructive">Expired</Badge>
                        )}
                        {!expired && expiringSoon && (
                          <Badge variant="outline" className="text-orange-600 border-orange-300">
                            Expires Soon
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {method.nickname && (
                          <span className="mr-2">"{method.nickname}"</span>
                        )}
                        <span>Exp: {formatExpiry(method.expiryMonth, method.expiryYear)}</span>
                        {method.cardholderName && (
                          <span className="ml-2">• {method.cardholderName}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {!method.isDefault && !expired && (
                        <DropdownMenuItem onClick={() => handleSetDefault(method.id)}>
                          <Star className="h-4 w-4 mr-2" />
                          Set as Default
                        </DropdownMenuItem>
                      )}
                      <Dialog>
                        <DialogTrigger asChild>
                          <DropdownMenuItem
                            onSelect={(e) => {
                              e.preventDefault();
                              setEditingMethod(method.id);
                              setNickname(method.nickname || '');
                            }}
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Edit Nickname
                          </DropdownMenuItem>
                        </DialogTrigger>
                      </Dialog>
                      <DropdownMenuSeparator />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <DropdownMenuItem
                            className="text-destructive"
                            onSelect={(e) => e.preventDefault()}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remove Card
                          </DropdownMenuItem>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove Payment Method?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will remove the card ending in {method.last4}.
                              This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => handleDelete(method.id)}
                            >
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        )}

        {/* Edit Nickname Dialog */}
        <Dialog open={!!editingMethod} onOpenChange={(open) => !open && setEditingMethod(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Card Nickname</DialogTitle>
              <DialogDescription>
                Give this card a friendly name for easy identification
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Label htmlFor="nickname">Nickname</Label>
              <Input
                id="nickname"
                placeholder="e.g., Personal Visa, Work Card"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingMethod(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => editingMethod && handleUpdateNickname(editingMethod)}
                disabled={updatePaymentMethod.isPending}
              >
                {updatePaymentMethod.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
