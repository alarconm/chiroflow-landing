'use client';

import { trpc } from '@/trpc/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';

interface PatientLedgerProps {
  patientId: string;
}

type LedgerEntry = {
  date: Date;
  type: string;
  description: string;
  cptCode: string | null;
  provider: string | null;
  charges: number;
  payments: number;
  adjustments: number;
  balance: number;
  referenceId: string;
};

export function PatientLedger({ patientId }: PatientLedgerProps) {
  const { data, isLoading } = trpc.ledger.getByPatient.useQuery({ patientId });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Account Ledger</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const entries = (data?.entries || []) as unknown as LedgerEntry[];
  const currentBalance = data?.totals?.currentBalance || 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Account Ledger</CardTitle>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Current Balance</p>
            <p className={`text-2xl font-bold ${currentBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
              ${Math.abs(currentBalance).toFixed(2)}
              {currentBalance < 0 && ' CR'}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>CPT</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead className="text-right">Charges</TableHead>
              <TableHead className="text-right">Payments</TableHead>
              <TableHead className="text-right">Adj</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  No transactions found
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry, index) => (
                <TableRow key={`${entry.referenceId}-${index}`}>
                  <TableCell>
                    {format(new Date(entry.date), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        entry.type === 'charge'
                          ? 'default'
                          : entry.type === 'payment'
                            ? 'secondary'
                            : 'outline'
                      }
                    >
                      {entry.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate">{entry.description}</TableCell>
                  <TableCell>{entry.cptCode || '-'}</TableCell>
                  <TableCell>{entry.provider || '-'}</TableCell>
                  <TableCell className="text-right">
                    {entry.charges > 0 ? `$${entry.charges.toFixed(2)}` : '-'}
                  </TableCell>
                  <TableCell className="text-right text-green-600">
                    {entry.payments > 0 ? `-$${entry.payments.toFixed(2)}` : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    {entry.adjustments !== 0
                      ? `${entry.adjustments > 0 ? '' : '-'}$${Math.abs(entry.adjustments).toFixed(2)}`
                      : '-'}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    ${entry.balance.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
