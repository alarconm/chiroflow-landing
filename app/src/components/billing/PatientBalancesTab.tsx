'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
import { format, addDays } from 'date-fns';
import {
  Search,
  FileText,
  Mail,
  Phone,
  DollarSign,
  AlertTriangle,
  Calendar,
  MoreHorizontal,
  Users,
  CreditCard,
  Printer,
  Send,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Demo patient balance data
const demoPatientBalances = [
  {
    id: '1',
    patientName: '[DEMO] Johnson, Robert',
    accountNumber: 'PT-001',
    email: 'robert.j@example.com',
    phone: '(555) 123-4567',
    totalBalance: 450.00,
    insuranceBalance: 285.00,
    patientBalance: 165.00,
    lastPayment: new Date('2025-01-10'),
    lastPaymentAmount: 75.00,
    lastStatement: new Date('2025-01-01'),
    daysOverdue: 15,
    collectionStatus: 'CURRENT',
    paymentPlan: null,
  },
  {
    id: '2',
    patientName: '[DEMO] Smith, Maria',
    accountNumber: 'PT-002',
    email: 'maria.s@example.com',
    phone: '(555) 234-5678',
    totalBalance: 1250.00,
    insuranceBalance: 800.00,
    patientBalance: 450.00,
    lastPayment: new Date('2024-12-15'),
    lastPaymentAmount: 100.00,
    lastStatement: new Date('2025-01-01'),
    daysOverdue: 45,
    collectionStatus: 'OVERDUE_30',
    paymentPlan: {
      monthlyAmount: 75.00,
      remainingPayments: 6,
      nextPaymentDate: new Date('2025-02-01'),
    },
  },
  {
    id: '3',
    patientName: '[DEMO] Williams, James',
    accountNumber: 'PT-003',
    email: 'james.w@example.com',
    phone: '(555) 345-6789',
    totalBalance: 2100.00,
    insuranceBalance: 1500.00,
    patientBalance: 600.00,
    lastPayment: new Date('2024-11-20'),
    lastPaymentAmount: 200.00,
    lastStatement: new Date('2025-01-01'),
    daysOverdue: 65,
    collectionStatus: 'OVERDUE_60',
    paymentPlan: null,
  },
  {
    id: '4',
    patientName: '[DEMO] Brown, Lisa',
    accountNumber: 'PT-004',
    email: 'lisa.b@example.com',
    phone: '(555) 456-7890',
    totalBalance: 175.00,
    insuranceBalance: 0,
    patientBalance: 175.00,
    lastPayment: new Date('2025-01-18'),
    lastPaymentAmount: 50.00,
    lastStatement: new Date('2025-01-01'),
    daysOverdue: 0,
    collectionStatus: 'CURRENT',
    paymentPlan: null,
  },
  {
    id: '5',
    patientName: '[DEMO] Garcia, Carlos',
    accountNumber: 'PT-005',
    email: 'carlos.g@example.com',
    phone: '(555) 567-8901',
    totalBalance: 3500.00,
    insuranceBalance: 2000.00,
    patientBalance: 1500.00,
    lastPayment: new Date('2024-10-01'),
    lastPaymentAmount: 100.00,
    lastStatement: new Date('2025-01-01'),
    daysOverdue: 110,
    collectionStatus: 'COLLECTIONS',
    paymentPlan: null,
  },
];

const collectionStatusLabels: Record<string, { label: string; color: string }> = {
  CURRENT: { label: 'Current', color: 'bg-green-100 text-green-800' },
  OVERDUE_30: { label: '30+ Days', color: 'bg-yellow-100 text-yellow-800' },
  OVERDUE_60: { label: '60+ Days', color: 'bg-orange-100 text-orange-800' },
  OVERDUE_90: { label: '90+ Days', color: 'bg-red-100 text-red-800' },
  COLLECTIONS: { label: 'Collections', color: 'bg-red-100 text-red-800' },
};

export function PatientBalancesTab() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showPaymentPlanDialog, setShowPaymentPlanDialog] = useState(false);
  const [showStatementDialog, setShowStatementDialog] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<typeof demoPatientBalances[0] | null>(null);

  const filteredPatients = demoPatientBalances.filter((patient) => {
    const matchesSearch = patient.patientName.toLowerCase().includes(search.toLowerCase()) ||
      patient.accountNumber.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || patient.collectionStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalOutstanding = demoPatientBalances.reduce((sum, p) => sum + p.totalBalance, 0);
  const totalPatientBalance = demoPatientBalances.reduce((sum, p) => sum + p.patientBalance, 0);
  const totalInsuranceBalance = demoPatientBalances.reduce((sum, p) => sum + p.insuranceBalance, 0);
  const collectionsCount = demoPatientBalances.filter((p) => p.collectionStatus === 'COLLECTIONS').length;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Outstanding</p>
                <p className="text-2xl font-bold">${totalOutstanding.toLocaleString()}</p>
              </div>
              <DollarSign className="h-8 w-8 text-[#053e67]" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Patient Responsibility</p>
                <p className="text-2xl font-bold">${totalPatientBalance.toLocaleString()}</p>
              </div>
              <Users className="h-8 w-8 text-[#053e67]" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Insurance Pending</p>
                <p className="text-2xl font-bold">${totalInsuranceBalance.toLocaleString()}</p>
              </div>
              <FileText className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card className={collectionsCount > 0 ? 'border-red-200' : ''}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">In Collections</p>
                <p className="text-2xl font-bold">{collectionsCount}</p>
              </div>
              <AlertTriangle className={`h-8 w-8 ${collectionsCount > 0 ? 'text-red-600' : 'text-gray-400'}`} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Patient Balances Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Patient Balances</CardTitle>
              <CardDescription>Manage outstanding balances and payment plans</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline">
                <Printer className="mr-2 h-4 w-4" />
                Batch Statements
              </Button>
              <Button variant="outline">
                <Send className="mr-2 h-4 w-4" />
                Send Reminders
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by patient name or account number..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="CURRENT">Current</SelectItem>
                <SelectItem value="OVERDUE_30">30+ Days Overdue</SelectItem>
                <SelectItem value="OVERDUE_60">60+ Days Overdue</SelectItem>
                <SelectItem value="OVERDUE_90">90+ Days Overdue</SelectItem>
                <SelectItem value="COLLECTIONS">In Collections</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient</TableHead>
                <TableHead>Account #</TableHead>
                <TableHead className="text-right">Total Balance</TableHead>
                <TableHead className="text-right">Patient Owes</TableHead>
                <TableHead className="text-right">Insurance</TableHead>
                <TableHead>Last Payment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment Plan</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPatients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    No patients with outstanding balances
                  </TableCell>
                </TableRow>
              ) : (
                filteredPatients.map((patient) => {
                  const status = collectionStatusLabels[patient.collectionStatus];
                  return (
                    <TableRow key={patient.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{patient.patientName}</p>
                          <p className="text-sm text-muted-foreground">{patient.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>{patient.accountNumber}</TableCell>
                      <TableCell className="text-right font-bold">
                        ${patient.totalBalance.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        ${patient.patientBalance.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        ${patient.insuranceBalance.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p>{format(patient.lastPayment, 'MMM d, yyyy')}</p>
                          <p className="text-muted-foreground">${patient.lastPaymentAmount.toFixed(2)}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={status.color}>{status.label}</Badge>
                      </TableCell>
                      <TableCell>
                        {patient.paymentPlan ? (
                          <div className="text-sm">
                            <p className="font-medium">${patient.paymentPlan.monthlyAmount}/mo</p>
                            <p className="text-muted-foreground">
                              {patient.paymentPlan.remainingPayments} payments left
                            </p>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedPatient(patient);
                              setShowPaymentPlanDialog(true);
                            }}
                          >
                            <Calendar className="mr-1 h-3 w-3" />
                            Set Up
                          </Button>
                        )}
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
                              <DollarSign className="mr-2 h-4 w-4" />
                              Post Payment
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                              setSelectedPatient(patient);
                              setShowStatementDialog(true);
                            }}>
                              <FileText className="mr-2 h-4 w-4" />
                              Generate Statement
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>
                              <Mail className="mr-2 h-4 w-4" />
                              Email Reminder
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Phone className="mr-2 h-4 w-4" />
                              Call Patient
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => {
                              setSelectedPatient(patient);
                              setShowPaymentPlanDialog(true);
                            }}>
                              <Calendar className="mr-2 h-4 w-4" />
                              {patient.paymentPlan ? 'Modify' : 'Create'} Payment Plan
                            </DropdownMenuItem>
                            {patient.collectionStatus !== 'COLLECTIONS' && (
                              <DropdownMenuItem className="text-destructive">
                                <AlertTriangle className="mr-2 h-4 w-4" />
                                Send to Collections
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

      {/* Payment Plan Dialog */}
      <Dialog open={showPaymentPlanDialog} onOpenChange={setShowPaymentPlanDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedPatient?.paymentPlan ? 'Modify' : 'Create'} Payment Plan
            </DialogTitle>
            <DialogDescription>
              Set up a payment plan for {selectedPatient?.patientName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex justify-between text-sm">
                <span>Total Balance:</span>
                <span className="font-bold">${selectedPatient?.totalBalance.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Patient Responsibility:</span>
                <span className="font-bold">${selectedPatient?.patientBalance.toLocaleString()}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Monthly Payment Amount</Label>
              <Input
                type="number"
                placeholder="0.00"
                defaultValue={selectedPatient?.paymentPlan?.monthlyAmount || ''}
              />
            </div>
            <div className="space-y-2">
              <Label>Number of Payments</Label>
              <Input
                type="number"
                placeholder="e.g., 6"
                defaultValue={selectedPatient?.paymentPlan?.remainingPayments || ''}
              />
            </div>
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                defaultValue={format(
                  selectedPatient?.paymentPlan?.nextPaymentDate || addDays(new Date(), 7),
                  'yyyy-MM-dd'
                )}
              />
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select defaultValue="card">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="card">Credit/Debit Card on File</SelectItem>
                  <SelectItem value="ach">Bank Account (ACH)</SelectItem>
                  <SelectItem value="manual">Manual Payments</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea placeholder="Internal notes about this payment plan..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentPlanDialog(false)}>
              Cancel
            </Button>
            <Button className="bg-[#053e67] hover:bg-[#053e67]">
              {selectedPatient?.paymentPlan ? 'Update Plan' : 'Create Plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Statement Dialog */}
      <Dialog open={showStatementDialog} onOpenChange={setShowStatementDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Statement</DialogTitle>
            <DialogDescription>
              Create a statement for {selectedPatient?.patientName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Statement Type</Label>
              <Select defaultValue="detailed">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="summary">Summary Statement</SelectItem>
                  <SelectItem value="detailed">Detailed Statement</SelectItem>
                  <SelectItem value="insurance">Insurance Statement</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date Range</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" />
                <Input type="date" defaultValue={format(new Date(), 'yyyy-MM-dd')} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Delivery Method</Label>
              <Select defaultValue="print">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="print">Print Only</SelectItem>
                  <SelectItem value="email">Email to Patient</SelectItem>
                  <SelectItem value="both">Print and Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Include Message</Label>
              <Textarea placeholder="Optional message to include on the statement..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStatementDialog(false)}>
              Cancel
            </Button>
            <Button className="bg-[#053e67] hover:bg-[#053e67]">
              Generate Statement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
