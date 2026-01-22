'use client';

/**
 * Epic 14: Patient Portal - Billing Statements List Component
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { trpc } from '@/trpc/client';
import { format } from 'date-fns';
import { FileText, Download, CreditCard, DollarSign, Calendar } from 'lucide-react';

export function StatementsList() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(localStorage.getItem('portalToken'));
  }, []);

  const { data: statementsData, isLoading } = trpc.portal.listStatements.useQuery(
    { sessionToken: token!, limit: 20 },
    { enabled: !!token }
  );

  const { data: balanceData } = trpc.portal.getCurrentBalance.useQuery(
    { sessionToken: token! },
    { enabled: !!token }
  );

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      SENT: { label: 'Due', variant: 'default' },
      VIEWED: { label: 'Viewed', variant: 'secondary' },
      PAID: { label: 'Paid', variant: 'outline' },
      OVERDUE: { label: 'Overdue', variant: 'destructive' },
    };
    const config = variants[status] || { label: status, variant: 'outline' as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (!token) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Billing & Statements</h1>
        <p className="text-gray-600">View your statements and make payments</p>
      </div>

      {/* Balance Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Current Balance</p>
                <p className="text-3xl font-bold">
                  ${balanceData?.balance?.toFixed(2) || '0.00'}
                </p>
              </div>
              <div className="p-4 bg-primary/10 rounded-full">
                <DollarSign className="h-8 w-8 text-primary" />
              </div>
            </div>
            {balanceData && balanceData.balance > 0 && (
              <Link href="/portal/billing/pay" className="block mt-4">
                <Button className="w-full">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Make a Payment
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Statements</p>
                <p className="text-3xl font-bold">{statementsData?.total || 0}</p>
              </div>
              <div className="p-4 bg-secondary/50 rounded-full">
                <FileText className="h-8 w-8 text-secondary-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Statements List */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Statements</CardTitle>
          <CardDescription>Your billing statements from the past year</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : !statementsData || statementsData.statements.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">No statements available</p>
            </div>
          ) : (
            <div className="divide-y">
              {statementsData.statements.map((statement) => (
                <div
                  key={statement.id}
                  className="py-4 flex flex-col md:flex-row md:items-center md:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{statement.statementNumber}</span>
                      {getStatusBadge(statement.status)}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {format(new Date(statement.statementDate), 'MMM d, yyyy')}
                      </span>
                      <span>
                        Period: {format(new Date(statement.periodStart), 'MMM d')} -{' '}
                        {format(new Date(statement.periodEnd), 'MMM d, yyyy')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-4 md:mt-0">
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Amount Due</p>
                      <p className="text-lg font-semibold">${statement.totalDue.toFixed(2)}</p>
                    </div>
                    {statement.pdfUrl && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={statement.pdfUrl} target="_blank" rel="noopener noreferrer">
                          <Download className="h-4 w-4 mr-1" />
                          PDF
                        </a>
                      </Button>
                    )}
                    {statement.totalDue > 0 && statement.status !== 'PAID' && (
                      <Link href={`/portal/billing/pay?statement=${statement.id}`}>
                        <Button size="sm">Pay Now</Button>
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Info */}
      <Card>
        <CardContent className="py-6">
          <h3 className="font-medium mb-2">Payment Options</h3>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Pay online securely with credit or debit card
            </li>
            <li className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Set up a payment plan for larger balances
            </li>
          </ul>
          <p className="mt-4 text-sm text-gray-500">
            Questions about your bill? Please{' '}
            <Link href="/portal/messages" className="text-primary hover:underline">
              send us a message
            </Link>{' '}
            or call our billing department.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
