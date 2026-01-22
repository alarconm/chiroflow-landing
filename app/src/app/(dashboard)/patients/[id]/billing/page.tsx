'use client';

import { use } from 'react';
import { trpc } from '@/trpc/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { PatientLedger } from '@/components/billing/PatientLedger';
import { PatientInsurance } from '@/components/billing/PatientInsurance';
import { PatientStatements } from '@/components/billing/PatientStatements';
import { RecordPaymentDialog } from '@/components/billing/RecordPaymentDialog';
import { ArrowLeft, DollarSign, FileText, CreditCard, Shield } from 'lucide-react';
import Link from 'next/link';

interface PatientBillingPageProps {
  params: Promise<{ id: string }>;
}

export default function PatientBillingPage({ params }: PatientBillingPageProps) {
  const { id: patientId } = use(params);

  const { data: patient, isLoading } = trpc.patient.get.useQuery({ id: patientId });
  const { data: ledger } = trpc.ledger.getByPatient.useQuery({ patientId });

  if (isLoading) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="flex-1 p-8 text-center">
        <p className="text-muted-foreground">Patient not found</p>
      </div>
    );
  }

  const patientName = patient.demographics
    ? `${patient.demographics.firstName} ${patient.demographics.lastName}`
    : 'Patient';

  const balance = ledger?.totals?.currentBalance || 0;
  const totalCharges = ledger?.totals?.totalCharges || 0;
  const totalPayments = ledger?.totals?.totalPayments || 0;

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/patients/${patientId}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Billing - {patientName}</h2>
            <p className="text-muted-foreground">
              MRN: {patient.mrn}
            </p>
          </div>
        </div>
        <RecordPaymentDialog patientId={patientId} patientName={patientName} />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
              ${Math.abs(balance).toFixed(2)}
              {balance < 0 && ' CR'}
            </div>
            <p className="text-xs text-muted-foreground">
              {balance > 0 ? 'Amount owed' : 'Credit balance'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Charges</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalCharges.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">All-time charges</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Payments</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalPayments.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">All-time payments</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Insurance</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {patient.insurances?.length || 0}
            </div>
            <p className="text-xs text-muted-foreground">Active policies</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="ledger" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ledger">Account Ledger</TabsTrigger>
          <TabsTrigger value="insurance">Insurance</TabsTrigger>
          <TabsTrigger value="statements">Statements</TabsTrigger>
        </TabsList>

        <TabsContent value="ledger">
          <PatientLedger patientId={patientId} />
        </TabsContent>

        <TabsContent value="insurance">
          <PatientInsurance patientId={patientId} />
        </TabsContent>

        <TabsContent value="statements">
          <PatientStatements patientId={patientId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
