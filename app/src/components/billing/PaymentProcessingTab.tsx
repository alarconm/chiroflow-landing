'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import {
  Search,
  Plus,
  CreditCard,
  DollarSign,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  MoreHorizontal,
  Receipt,
  Building2,
  User,
  Banknote,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface PaymentProcessingTabProps {
  dateRange: DateRange | undefined;
}

// Demo payment history
const demoPaymentHistory = [
  {
    id: '1',
    transactionId: 'TXN-2025-0001',
    patientName: '[DEMO] Johnson, Robert',
    amount: 75.00,
    paymentMethod: 'CREDIT_CARD',
    payerType: 'patient',
    referenceNumber: '****1234',
    date: new Date('2025-01-18'),
    status: 'COMPLETED',
    appliedTo: 'Charges #1234, #1235',
  },
  {
    id: '2',
    transactionId: 'TXN-2025-0002',
    patientName: '[DEMO] Smith, Maria',
    amount: 285.00,
    paymentMethod: 'INSURANCE',
    payerType: 'insurance',
    referenceNumber: 'ERA-4567',
    date: new Date('2025-01-17'),
    status: 'COMPLETED',
    appliedTo: 'Claim #CLM-001',
  },
  {
    id: '3',
    transactionId: 'TXN-2025-0003',
    patientName: '[DEMO] Williams, James',
    amount: 150.00,
    paymentMethod: 'CHECK',
    payerType: 'patient',
    referenceNumber: 'Check #1001',
    date: new Date('2025-01-16'),
    status: 'COMPLETED',
    appliedTo: 'Charges #1236',
  },
  {
    id: '4',
    transactionId: 'TXN-2025-0004',
    patientName: '[DEMO] Brown, Lisa',
    amount: 50.00,
    paymentMethod: 'CREDIT_CARD',
    payerType: 'patient',
    referenceNumber: '****5678',
    date: new Date('2025-01-15'),
    status: 'REFUNDED',
    appliedTo: 'N/A',
  },
  {
    id: '5',
    transactionId: 'TXN-2025-0005',
    patientName: '[DEMO] Garcia, Carlos',
    amount: 500.00,
    paymentMethod: 'INSURANCE',
    payerType: 'insurance',
    referenceNumber: 'ERA-4568',
    date: new Date('2025-01-14'),
    status: 'PARTIAL',
    appliedTo: 'Claim #CLM-002',
  },
];

// Demo open charges for payment application
const demoOpenCharges = [
  { id: 'c1', date: new Date('2025-01-10'), cptCode: '98941', description: 'Chiropractic Adjustment 3-4 regions', amount: 85.00, balance: 85.00 },
  { id: 'c2', date: new Date('2025-01-10'), cptCode: '97140', description: 'Manual Therapy', amount: 50.00, balance: 50.00 },
  { id: 'c3', date: new Date('2025-01-05'), cptCode: '98940', description: 'Chiropractic Adjustment 1-2 regions', amount: 65.00, balance: 25.00 },
  { id: 'c4', date: new Date('2025-01-03'), cptCode: '97110', description: 'Therapeutic Exercise', amount: 45.00, balance: 45.00 },
];

const paymentMethodLabels: Record<string, { label: string; icon: typeof CreditCard }> = {
  CASH: { label: 'Cash', icon: Banknote },
  CHECK: { label: 'Check', icon: Receipt },
  CREDIT_CARD: { label: 'Credit Card', icon: CreditCard },
  DEBIT_CARD: { label: 'Debit Card', icon: CreditCard },
  ACH: { label: 'ACH/Bank', icon: Building2 },
  INSURANCE: { label: 'Insurance', icon: Building2 },
  OTHER: { label: 'Other', icon: DollarSign },
};

const statusStyles: Record<string, { color: string; icon: typeof CheckCircle }> = {
  COMPLETED: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
  PARTIAL: { color: 'bg-yellow-100 text-yellow-800', icon: AlertCircle },
  REFUNDED: { color: 'bg-red-100 text-red-800', icon: RotateCcw },
  PENDING: { color: 'bg-gray-100 text-gray-800', icon: AlertCircle },
};

export function PaymentProcessingTab({ dateRange }: PaymentProcessingTabProps) {
  const [search, setSearch] = useState('');
  const [payerTypeFilter, setPayerTypeFilter] = useState<string>('all');
  const [showPostPaymentDialog, setShowPostPaymentDialog] = useState(false);
  const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<typeof demoPaymentHistory[0] | null>(null);
  const [selectedCharges, setSelectedCharges] = useState<string[]>([]);
  const [paymentAmount, setPaymentAmount] = useState('');

  const filteredPayments = demoPaymentHistory.filter((payment) => {
    const matchesSearch = payment.patientName.toLowerCase().includes(search.toLowerCase()) ||
      payment.transactionId.toLowerCase().includes(search.toLowerCase()) ||
      payment.referenceNumber?.toLowerCase().includes(search.toLowerCase());
    const matchesType = payerTypeFilter === 'all' || payment.payerType === payerTypeFilter;
    return matchesSearch && matchesType;
  });

  const totalPayments = demoPaymentHistory.reduce((sum, p) =>
    p.status !== 'REFUNDED' ? sum + p.amount : sum, 0
  );
  const patientPayments = demoPaymentHistory.filter(p => p.payerType === 'patient' && p.status !== 'REFUNDED')
    .reduce((sum, p) => sum + p.amount, 0);
  const insurancePayments = demoPaymentHistory.filter(p => p.payerType === 'insurance' && p.status !== 'REFUNDED')
    .reduce((sum, p) => sum + p.amount, 0);
  const refundedAmount = demoPaymentHistory.filter(p => p.status === 'REFUNDED')
    .reduce((sum, p) => sum + p.amount, 0);

  const handleChargeSelection = (chargeId: string, checked: boolean) => {
    if (checked) {
      setSelectedCharges((prev) => [...prev, chargeId]);
    } else {
      setSelectedCharges((prev) => prev.filter((id) => id !== chargeId));
    }
  };

  const selectedChargesTotal = demoOpenCharges
    .filter((c) => selectedCharges.includes(c.id))
    .reduce((sum, c) => sum + c.balance, 0);

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Received</p>
                <p className="text-2xl font-bold">${totalPayments.toLocaleString()}</p>
              </div>
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Patient Payments</p>
                <p className="text-2xl font-bold">${patientPayments.toLocaleString()}</p>
              </div>
              <User className="h-8 w-8 text-[#053e67]" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Insurance Payments</p>
                <p className="text-2xl font-bold">${insurancePayments.toLocaleString()}</p>
              </div>
              <Building2 className="h-8 w-8 text-[#053e67]" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Refunds</p>
                <p className="text-2xl font-bold">${refundedAmount.toLocaleString()}</p>
              </div>
              <RotateCcw className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payment Processing */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Payment Processing</CardTitle>
              <CardDescription>Post payments, apply to charges, and manage refunds</CardDescription>
            </div>
            <Dialog open={showPostPaymentDialog} onOpenChange={setShowPostPaymentDialog}>
              <DialogTrigger asChild>
                <Button className="bg-[#053e67] hover:bg-[#053e67]">
                  <Plus className="mr-2 h-4 w-4" />
                  Post Payment
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Post Payment</DialogTitle>
                  <DialogDescription>
                    Record a payment and apply to outstanding charges
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Left Column - Payment Details */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Patient</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Select patient..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="p1">[DEMO] Johnson, Robert</SelectItem>
                          <SelectItem value="p2">[DEMO] Smith, Maria</SelectItem>
                          <SelectItem value="p3">[DEMO] Williams, James</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Payment Type</Label>
                      <RadioGroup defaultValue="patient" className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="patient" id="patient" />
                          <Label htmlFor="patient">Patient</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="insurance" id="insurance" />
                          <Label htmlFor="insurance">Insurance</Label>
                        </div>
                      </RadioGroup>
                    </div>
                    <div className="space-y-2">
                      <Label>Payment Method</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Select method..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CASH">Cash</SelectItem>
                          <SelectItem value="CHECK">Check</SelectItem>
                          <SelectItem value="CREDIT_CARD">Credit Card</SelectItem>
                          <SelectItem value="DEBIT_CARD">Debit Card</SelectItem>
                          <SelectItem value="ACH">ACH/Bank Transfer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Amount</Label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="number"
                          className="pl-8"
                          placeholder="0.00"
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Reference Number</Label>
                      <Input placeholder="Check #, last 4 digits, etc." />
                    </div>
                    <div className="space-y-2">
                      <Label>Payment Date</Label>
                      <Input type="date" defaultValue={format(new Date(), 'yyyy-MM-dd')} />
                    </div>
                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Textarea placeholder="Optional notes..." />
                    </div>
                  </div>

                  {/* Right Column - Apply to Charges */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label>Apply to Charges</Label>
                      <span className="text-sm text-muted-foreground">
                        Selected: ${selectedChargesTotal.toFixed(2)}
                      </span>
                    </div>
                    <div className="border rounded-lg max-h-80 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-8"></TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Service</TableHead>
                            <TableHead className="text-right">Balance</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {demoOpenCharges.map((charge) => (
                            <TableRow key={charge.id}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedCharges.includes(charge.id)}
                                  onCheckedChange={(checked) =>
                                    handleChargeSelection(charge.id, checked as boolean)
                                  }
                                />
                              </TableCell>
                              <TableCell className="text-sm">
                                {format(charge.date, 'MM/dd')}
                              </TableCell>
                              <TableCell>
                                <div>
                                  <p className="text-sm font-medium">{charge.cptCode}</p>
                                  <p className="text-xs text-muted-foreground truncate max-w-32">
                                    {charge.description}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                ${charge.balance.toFixed(2)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {Number(paymentAmount) > selectedChargesTotal && selectedCharges.length > 0 && (
                      <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
                        <p className="font-medium text-yellow-800">Overpayment</p>
                        <p className="text-yellow-700">
                          ${(Number(paymentAmount) - selectedChargesTotal).toFixed(2)} will remain as credit
                        </p>
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedCharges(demoOpenCharges.map((c) => c.id))}
                    >
                      Select All Open Charges
                    </Button>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowPostPaymentDialog(false)}>
                    Cancel
                  </Button>
                  <Button className="bg-[#053e67] hover:bg-[#053e67]">
                    Post Payment
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by patient, transaction ID, or reference..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={payerTypeFilter} onValueChange={setPayerTypeFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="patient">Patient</SelectItem>
                <SelectItem value="insurance">Insurance</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Payment History Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Transaction ID</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Applied To</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPayments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    No payments found
                  </TableCell>
                </TableRow>
              ) : (
                filteredPayments.map((payment) => {
                  const methodInfo = paymentMethodLabels[payment.paymentMethod] || paymentMethodLabels.OTHER;
                  const statusInfo = statusStyles[payment.status] || statusStyles.PENDING;
                  const StatusIcon = statusInfo.icon;
                  const MethodIcon = methodInfo.icon;

                  return (
                    <TableRow key={payment.id}>
                      <TableCell className="font-mono text-sm">{payment.transactionId}</TableCell>
                      <TableCell>{format(payment.date, 'MMM d, yyyy')}</TableCell>
                      <TableCell className="font-medium">{payment.patientName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {payment.payerType === 'patient' ? (
                            <>
                              <User className="mr-1 h-3 w-3" />
                              Patient
                            </>
                          ) : (
                            <>
                              <Building2 className="mr-1 h-3 w-3" />
                              Insurance
                            </>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <MethodIcon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{methodInfo.label}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {payment.referenceNumber || '-'}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ${payment.amount.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusInfo.color}>
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {payment.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-32 truncate">
                        {payment.appliedTo}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Receipt className="mr-2 h-4 w-4" />
                              View Receipt
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <ArrowRight className="mr-2 h-4 w-4" />
                              Apply to Charges
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {payment.status !== 'REFUNDED' && (
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => {
                                  setSelectedPayment(payment);
                                  setShowRefundDialog(true);
                                }}
                              >
                                <RotateCcw className="mr-2 h-4 w-4" />
                                Process Refund
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Refund Dialog */}
      <Dialog open={showRefundDialog} onOpenChange={setShowRefundDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Refund</DialogTitle>
            <DialogDescription>
              Refund payment {selectedPayment?.transactionId} for {selectedPayment?.patientName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex justify-between text-sm">
                <span>Original Payment:</span>
                <span className="font-bold">${selectedPayment?.amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Payment Method:</span>
                <span>{paymentMethodLabels[selectedPayment?.paymentMethod || 'OTHER']?.label}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Refund Type</Label>
              <RadioGroup defaultValue="full" className="flex gap-4">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="full" id="full" />
                  <Label htmlFor="full">Full Refund</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="partial" id="partial" />
                  <Label htmlFor="partial">Partial Refund</Label>
                </div>
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label>Refund Amount</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  className="pl-8"
                  defaultValue={selectedPayment?.amount}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reason for Refund</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select reason..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="duplicate">Duplicate Payment</SelectItem>
                  <SelectItem value="overpayment">Overpayment</SelectItem>
                  <SelectItem value="service_cancel">Service Cancelled</SelectItem>
                  <SelectItem value="insurance">Insurance Paid in Full</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea placeholder="Additional details about the refund..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRefundDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive">
              Process Refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
