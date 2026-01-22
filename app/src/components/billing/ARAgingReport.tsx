'use client';

import { trpc } from '@/trpc/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

export function ARAgingReport() {
  const { data, isLoading } = trpc.ledger.getAgingReport.useQuery({});

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Accounts Receivable Aging</CardTitle>
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

  const totals = data?.totals;
  const patients = data?.patients || [];

  const agingBuckets = [
    { label: 'Current (0-30)', value: totals?.current || 0, color: 'bg-green-500' },
    { label: '31-60 Days', value: totals?.thirtyDays || 0, color: 'bg-blue-500' },
    { label: '61-90 Days', value: totals?.sixtyDays || 0, color: 'bg-yellow-500' },
    { label: '91-120 Days', value: totals?.ninetyDays || 0, color: 'bg-orange-500' },
    { label: '120+ Days', value: totals?.over90 || 0, color: 'bg-red-500' },
  ];

  const totalAR = totals?.total || 1;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Aging Summary</CardTitle>
          <CardDescription>
            Total A/R: ${totalAR.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {agingBuckets.map((bucket) => (
              <div key={bucket.label} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{bucket.label}</span>
                  <span>${bucket.value.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
                <Progress
                  value={(bucket.value / totalAR) * 100}
                  className={`h-2 ${bucket.color}`}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Patient Aging Details</CardTitle>
          <CardDescription>
            Breakdown by patient with outstanding balances
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient</TableHead>
                <TableHead className="text-right">Current</TableHead>
                <TableHead className="text-right">31-60</TableHead>
                <TableHead className="text-right">61-90</TableHead>
                <TableHead className="text-right">91-120</TableHead>
                <TableHead className="text-right">120+</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No outstanding balances
                  </TableCell>
                </TableRow>
              ) : (
                patients.map((row) => (
                  <TableRow key={row.patient.id}>
                    <TableCell className="font-medium">{row.patient.name}</TableCell>
                    <TableCell className="text-right">
                      ${row.current.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      ${row.thirtyDays.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      ${row.sixtyDays.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      ${row.ninetyDays.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.over90 > 0 ? (
                        <Badge variant="destructive">
                          ${row.over90.toFixed(2)}
                        </Badge>
                      ) : (
                        '$0.00'
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      ${row.total.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
