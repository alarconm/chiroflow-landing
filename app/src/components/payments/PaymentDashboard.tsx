'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CreditCard,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Clock,
  Settings,
  RotateCcw,
  Users,
  Wallet,
  Loader2,
} from 'lucide-react';
import { format, subDays, startOfMonth } from 'date-fns';

import { PaymentTerminal } from './PaymentTerminal';
import { PaymentHistoryTable } from './PaymentHistoryTable';
import { RefundDialog } from './RefundDialog';
import { PaymentProcessorSettings } from './PaymentProcessorSettings';

export function PaymentDashboard() {
  const [refundTransactionId, setRefundTransactionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('terminal');

  // Get dashboard stats
  const { data: stats, isLoading: loadingStats } = trpc.paymentProcessing.getDashboardStats.useQuery({
    startDate: startOfMonth(new Date()),
    endDate: new Date(),
  });

  // Get billing stats for payment plans
  const { data: billingStats } = trpc.paymentProcessing.getBillingStats.useQuery({
    startDate: startOfMonth(new Date()),
    endDate: new Date(),
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Collected</p>
                <p className="text-2xl font-bold">
                  {loadingStats ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    formatCurrency(stats?.totalCollected ?? 0)
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {stats?.transactionCount ?? 0} transactions
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Refunded</p>
                <p className="text-2xl font-bold">
                  {loadingStats ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    formatCurrency(stats?.totalRefunded ?? 0)
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {stats?.refundCount ?? 0} refunds
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                <RotateCcw className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Plans</p>
                <p className="text-2xl font-bold">
                  {loadingStats ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    stats?.activePlans ?? 0
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {billingStats?.upcomingDue ?? 0} due this week
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                <Calendar className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Success Rate</p>
                <p className="text-2xl font-bold">
                  {loadingStats ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    `${stats?.successRate ?? 100}%`
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {stats?.failedTransactions ?? 0} failed
                </p>
              </div>
              <div className={`h-12 w-12 rounded-full flex items-center justify-center ${
                (stats?.successRate ?? 100) >= 95 ? 'bg-green-100' : 'bg-yellow-100'
              }`}>
                {(stats?.successRate ?? 100) >= 95 ? (
                  <CheckCircle className="h-6 w-6 text-green-600" />
                ) : (
                  <AlertTriangle className="h-6 w-6 text-yellow-600" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-lg grid-cols-4">
          <TabsTrigger value="terminal" className="flex items-center gap-1">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">Terminal</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">History</span>
          </TabsTrigger>
          <TabsTrigger value="plans" className="flex items-center gap-1">
            <Wallet className="h-4 w-4" />
            <span className="hidden sm:inline">Plans</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-1">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Settings</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="terminal" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <PaymentTerminal />

            {/* Quick Stats Panel */}
            <Card>
              <CardHeader>
                <CardTitle>Today's Activity</CardTitle>
                <CardDescription>Real-time payment processing summary</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <RecentActivityList />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <PaymentHistoryTable
            onRefund={(transactionId) => setRefundTransactionId(transactionId)}
          />
        </TabsContent>

        <TabsContent value="plans" className="mt-6">
          <PaymentPlansOverview />
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <PaymentProcessorSettings />
        </TabsContent>
      </Tabs>

      {/* Refund Dialog */}
      <RefundDialog
        transactionId={refundTransactionId}
        open={!!refundTransactionId}
        onOpenChange={(open) => !open && setRefundTransactionId(null)}
      />
    </div>
  );
}

// Helper component for recent activity
function RecentActivityList() {
  const { data: recentTransactions, isLoading } = trpc.paymentProcessing.getRecentTransactions.useQuery(
    { limit: 5 }
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!recentTransactions || recentTransactions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No recent transactions</p>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    COMPLETED: 'text-green-600',
    PENDING: 'text-yellow-600',
    FAILED: 'text-red-600',
    REFUNDED: 'text-purple-600',
  };

  return (
    <div className="space-y-3">
      {recentTransactions.map((tx) => (
        <div key={tx.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
          <div className="flex items-center gap-3">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
              tx.status === 'COMPLETED' ? 'bg-green-100' :
              tx.status === 'FAILED' ? 'bg-red-100' : 'bg-gray-100'
            }`}>
              {tx.status === 'COMPLETED' ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : tx.status === 'FAILED' ? (
                <AlertTriangle className="h-4 w-4 text-red-600" />
              ) : (
                <Clock className="h-4 w-4 text-gray-600" />
              )}
            </div>
            <div>
              <p className="font-medium text-sm">
                {tx.patient?.demographics
                  ? `${tx.patient.demographics.lastName}, ${tx.patient.demographics.firstName}`
                  : 'Unknown'}
              </p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(tx.createdAt), 'h:mm a')}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className={`font-medium ${statusColors[tx.status] || ''}`}>
              ${Number(tx.amount).toFixed(2)}
            </p>
            {tx.paymentMethod && (
              <p className="text-xs text-muted-foreground">
                •••• {tx.paymentMethod.last4}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Helper component for payment plans overview
function PaymentPlansOverview() {
  const { data: stats, isLoading } = trpc.paymentProcessing.getBillingStats.useQuery({
    startDate: startOfMonth(new Date()),
    endDate: new Date(),
  });

  const { data: upcomingItems } = trpc.paymentProcessing.getUpcomingBillingItems.useQuery({
    daysAhead: 7,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Plan Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Plans</p>
                <p className="text-2xl font-bold">{stats?.activePlans ?? 0}</p>
              </div>
              <Wallet className="h-8 w-8 text-[#053e67]" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Collected This Month</p>
                <p className="text-2xl font-bold">
                  ${(stats?.amountCollected ?? 0).toFixed(2)}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Failed Installments</p>
                <p className="text-2xl font-bold">{stats?.installmentsFailed ?? 0}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Payments */}
      <Card>
        <CardHeader>
          <CardTitle>Upcoming Payments (Next 7 Days)</CardTitle>
          <CardDescription>
            Scheduled payment plan installments
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!upcomingItems || upcomingItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No upcoming payments scheduled</p>
            </div>
          ) : (
            <div className="space-y-2">
              {upcomingItems.slice(0, 10).map((item) => (
                <div
                  key={item.installmentId}
                  className={`flex items-center justify-between p-3 border rounded-lg ${
                    item.isOverdue ? 'border-red-200 bg-red-50' :
                    item.isRetry ? 'border-orange-200 bg-orange-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="font-medium">{item.patientName}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.planName} • Payment {item.installmentNumber} of {item.totalInstallments}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">${item.amount.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(item.dueDate), 'MMM d')}
                    </p>
                    {item.isOverdue && (
                      <Badge variant="destructive" className="mt-1">Overdue</Badge>
                    )}
                    {item.isRetry && (
                      <Badge variant="outline" className="mt-1 text-orange-600 border-orange-300">
                        Retry #{item.attemptCount}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
