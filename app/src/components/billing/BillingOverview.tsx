'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { trpc } from '@/trpc/client';
import { DateRange } from 'react-day-picker';
import {
  DollarSign,
  FileText,
  CreditCard,
  AlertCircle,
  TrendingUp,
  Clock,
  Send,
  Receipt,
  Users,
  Plus,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface BillingOverviewProps {
  dateRange: DateRange | undefined;
  onQuickAction?: (action: string) => void;
}

export function BillingOverview({ dateRange, onQuickAction }: BillingOverviewProps) {
  const { data: claimStats, isLoading: claimsLoading } = trpc.claim.list.useQuery({
    startDate: dateRange?.from || new Date(),
    endDate: dateRange?.to || new Date(),
    page: 1,
    limit: 1,
  });

  const { data: ledgerStats, isLoading: ledgerLoading } = trpc.ledger.getAgingReport.useQuery({});

  const isLoading = claimsLoading || ledgerLoading;

  // Calculate summary statistics
  const totalClaims = claimStats?.pagination?.total || 0;
  const totalAR = ledgerStats?.totals?.total || 0;
  const over90Days = ledgerStats?.totals?.over90 || 0;

  // Demo values for charges and payments
  const totalCharges = 12450.00;
  const totalPayments = 9875.00;
  const claimsPending = 8;

  const stats = [
    {
      title: 'Total Charges',
      value: `$${totalCharges.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      description: 'This month',
      icon: Receipt,
      trend: '+8%',
      color: 'text-[#053e67]',
    },
    {
      title: 'Payments Received',
      value: `$${totalPayments.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      description: 'This month',
      icon: DollarSign,
      trend: '+15%',
      color: 'text-green-600',
    },
    {
      title: 'Outstanding Balance',
      value: `$${totalAR.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      description: 'Total A/R',
      icon: AlertCircle,
      alert: totalAR > 10000,
      color: 'text-[#053e67]',
    },
    {
      title: 'Claims Pending',
      value: claimsPending.toString(),
      description: 'Awaiting response',
      icon: Clock,
      color: 'text-yellow-600',
    },
  ];

  const quickActions = [
    { label: 'Post Payment', icon: Plus, action: 'post-payment' },
    { label: 'Submit Claims', icon: Send, action: 'submit-claims' },
    { label: 'Generate Superbill', icon: Receipt, action: 'generate-superbill' },
    { label: 'Patient Statements', icon: Users, action: 'patient-statements' },
  ];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32 mb-2" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-32" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className={stat.alert ? 'border-blue-200 bg-blue-50/50' : ''}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color || 'text-muted-foreground'}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {stat.trend && (
                  <TrendingUp className="h-3 w-3 text-green-500" />
                )}
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-2">
            {quickActions.map((action) => (
              <Button
                key={action.action}
                variant="outline"
                size="sm"
                onClick={() => onQuickAction?.(action.action)}
                className="hover:bg-blue-50 hover:border-blue-300"
              >
                <action.icon className="mr-2 h-4 w-4" />
                {action.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
