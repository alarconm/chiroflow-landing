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
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, addDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { Loader2, CalendarIcon, FileText, Mail, Eye, Send } from 'lucide-react';
import { StatementStatus } from '@prisma/client';
import { formatCurrency, toCents } from '@/lib/payment';

const statementFormSchema = z.object({
  periodStart: z.date(),
  periodEnd: z.date(),
  dueDate: z.date(),
  messageToPatient: z.string().optional(),
});

type StatementFormData = z.infer<typeof statementFormSchema>;

interface StatementGeneratorProps {
  patientId?: string;
  showList?: boolean;
}

export function StatementGenerator({ patientId, showList = true }: StatementGeneratorProps) {
  const utils = trpc.useUtils();
  const [isGenerating, setIsGenerating] = useState(false);
  const [periodStart, setPeriodStart] = useState<Date>(startOfMonth(new Date()));
  const [periodEnd, setPeriodEnd] = useState<Date>(endOfMonth(new Date()));
  const [dueDate, setDueDate] = useState<Date>(addDays(endOfMonth(new Date()), 30));
  const [viewingStatementId, setViewingStatementId] = useState<string | null>(null);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');
  const [sendingStatementId, setSendingStatementId] = useState<string | null>(null);

  const { data: statementsData, isLoading: loadingStatements } = trpc.paymentProcessing.listStatements.useQuery(
    { patientId },
    { enabled: showList }
  );

  const { data: statementDetails, isLoading: loadingDetails } = trpc.paymentProcessing.getStatement.useQuery(
    { id: viewingStatementId! },
    { enabled: !!viewingStatementId }
  );

  const generateMutation = trpc.paymentProcessing.generateStatement.useMutation({
    onSuccess: (statement) => {
      toast.success(`Statement ${statement.statementNumber} generated successfully`);
      utils.paymentProcessing.listStatements.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
    onSettled: () => {
      setIsGenerating(false);
    },
  });

  const emailMutation = trpc.paymentProcessing.emailStatement.useMutation({
    onSuccess: (result) => {
      toast.success(`Statement emailed to ${result.sentTo}`);
      utils.paymentProcessing.listStatements.invalidate();
      setEmailDialogOpen(false);
      setEmailAddress('');
      setSendingStatementId(null);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const {
    setValue,
    handleSubmit,
    formState: { errors },
  } = useForm<StatementFormData>({
    resolver: zodResolver(statementFormSchema),
    defaultValues: {
      periodStart: startOfMonth(new Date()),
      periodEnd: endOfMonth(new Date()),
      dueDate: addDays(endOfMonth(new Date()), 30),
    },
  });

  const onSubmit = (data: StatementFormData) => {
    if (!patientId) {
      toast.error('Patient ID is required');
      return;
    }
    setIsGenerating(true);
    generateMutation.mutate({
      patientId,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      dueDate: data.dueDate,
      messageToPatient: data.messageToPatient,
    });
  };

  const handleEmailStatement = () => {
    if (!sendingStatementId || !emailAddress) return;
    emailMutation.mutate({
      id: sendingStatementId,
      email: emailAddress,
    });
  };

  const getStatusBadge = (status: StatementStatus) => {
    const variants: Record<StatementStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      DRAFT: 'outline',
      SENT: 'secondary',
      VIEWED: 'secondary',
      PAID: 'default',
      OVERDUE: 'destructive',
    };

    return <Badge variant={variants[status]}>{status}</Badge>;
  };

  const statements = statementsData?.statements ?? [];

  return (
    <div className="space-y-6">
      {/* Generator Form */}
      {patientId && (
        <Card>
          <form onSubmit={handleSubmit(onSubmit)}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Generate Statement
              </CardTitle>
              <CardDescription>
                Create a patient statement for a billing period
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Period Start */}
                <div className="space-y-2">
                  <Label>Period Start</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !periodStart && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {periodStart ? format(periodStart, 'PPP') : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={periodStart}
                        onSelect={(date) => {
                          setPeriodStart(date ?? startOfMonth(new Date()));
                          setValue('periodStart', date ?? startOfMonth(new Date()));
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Period End */}
                <div className="space-y-2">
                  <Label>Period End</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !periodEnd && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {periodEnd ? format(periodEnd, 'PPP') : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={periodEnd}
                        onSelect={(date) => {
                          setPeriodEnd(date ?? endOfMonth(new Date()));
                          setValue('periodEnd', date ?? endOfMonth(new Date()));
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Due Date */}
                <div className="space-y-2">
                  <Label>Due Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !dueDate && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dueDate ? format(dueDate, 'PPP') : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={dueDate}
                        onSelect={(date) => {
                          setDueDate(date ?? addDays(endOfMonth(new Date()), 30));
                          setValue('dueDate', date ?? addDays(endOfMonth(new Date()), 30));
                        }}
                        disabled={(date) => date < new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Message to Patient */}
              <div className="space-y-2">
                <Label htmlFor="message">Message to Patient (optional)</Label>
                <Textarea
                  id="message"
                  placeholder="Add a personal message to include on the statement..."
                  onChange={(e) => setValue('messageToPatient', e.target.value)}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isGenerating}>
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Generate Statement
                  </>
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}

      {/* Statements List */}
      {showList && (
        <Card>
          <CardHeader>
            <CardTitle>Statements</CardTitle>
            <CardDescription>
              {statements.length} statement{statements.length !== 1 ? 's' : ''} found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingStatements ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : statements.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Statement #</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Total Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statements.map((statement) => (
                    <TableRow key={statement.id}>
                      <TableCell className="font-medium">
                        {statement.statementNumber}
                      </TableCell>
                      <TableCell>
                        {statement.patient.demographics?.firstName}{' '}
                        {statement.patient.demographics?.lastName}
                      </TableCell>
                      <TableCell>
                        {format(new Date(statement.periodStart), 'MMM d')} -{' '}
                        {format(new Date(statement.periodEnd), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(toCents(Number(statement.totalDue)))}
                      </TableCell>
                      <TableCell>{getStatusBadge(statement.status)}</TableCell>
                      <TableCell>
                        {format(new Date(statement.dueDate), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewingStatementId(statement.id)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSendingStatementId(statement.id);
                              // Email address should be entered by user since contact is separate
                              setEmailAddress('');
                              setEmailDialogOpen(true);
                            }}
                          >
                            <Mail className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No statements found</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Statement Details Dialog */}
      <Dialog open={!!viewingStatementId} onOpenChange={() => setViewingStatementId(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Statement Details</DialogTitle>
            <DialogDescription>
              {statementDetails?.statementNumber}
            </DialogDescription>
          </DialogHeader>
          {loadingDetails ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : statementDetails ? (
            <div className="space-y-6">
              {/* Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <div className="text-sm text-muted-foreground">Previous Balance</div>
                  <div className="font-medium">
                    {formatCurrency(toCents(Number(statementDetails.previousBalance)))}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">New Charges</div>
                  <div className="font-medium">
                    {formatCurrency(toCents(Number(statementDetails.newCharges)))}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Payments</div>
                  <div className="font-medium text-green-600">
                    -{formatCurrency(toCents(Number(statementDetails.payments)))}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Total Due</div>
                  <div className="font-bold text-lg">
                    {formatCurrency(toCents(Number(statementDetails.totalDue)))}
                  </div>
                </div>
              </div>

              {/* Charge Details */}
              {statementDetails.chargeDetails && (
                <div>
                  <h4 className="font-medium mb-3">Charges</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(statementDetails.chargeDetails as Array<{
                        id: string;
                        date: string;
                        description: string;
                        amount: number;
                      }>).map((charge) => (
                        <TableRow key={charge.id}>
                          <TableCell>
                            {format(new Date(charge.date), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell>{charge.description}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(toCents(charge.amount))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Message */}
              {statementDetails.messageToPatient && (
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm">{statementDetails.messageToPatient}</p>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Email Dialog */}
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email Statement</DialogTitle>
            <DialogDescription>
              Send this statement to the patient via email
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="patient@example.com"
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleEmailStatement}
              disabled={!emailAddress || emailMutation.isPending}
            >
              {emailMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Statement
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
