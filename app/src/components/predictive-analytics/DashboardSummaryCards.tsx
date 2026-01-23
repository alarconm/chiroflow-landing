'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { trpc } from '@/trpc/client';
import {
  Users,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  DollarSign,
  Calendar,
  Target,
} from 'lucide-react';

function TrendIcon({ trend }: { trend: string | undefined }) {
  if (trend === 'INCREASING' || trend === 'up' || trend === 'increasing') {
    return <TrendingUp className="h-4 w-4 text-green-500" />;
  }
  if (trend === 'DECREASING' || trend === 'down' || trend === 'decreasing') {
    return <TrendingDown className="h-4 w-4 text-red-500" />;
  }
  return <Minus className="h-4 w-4 text-gray-500" />;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

export function DashboardSummaryCards() {
  const { data: churnSummary, isLoading: churnLoading } = trpc.aiPredict.getChurnSummary.useQuery(
    undefined,
    { refetchOnWindowFocus: false }
  );

  const { data: demandSummary, isLoading: demandLoading } = trpc.aiPredict.getDemandSummary.useQuery(
    undefined,
    { refetchOnWindowFocus: false }
  );

  const { data: revenueSummary, isLoading: revenueLoading } = trpc.aiPredict.getRevenueSummary.useQuery(
    undefined,
    { refetchOnWindowFocus: false }
  );

  const { data: trendSummary, isLoading: trendLoading } = trpc.aiPredict.getTrendSummary.useQuery(
    undefined,
    { refetchOnWindowFocus: false }
  );

  if (churnLoading || demandLoading || revenueLoading || trendLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20 mb-1" />
              <Skeleton className="h-4 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* At-Risk Patients */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">At-Risk Patients</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {churnSummary?.atRiskPatients ?? 0}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              {churnSummary?.byRiskLevel?.critical ?? 0} critical,{' '}
              {churnSummary?.byRiskLevel?.high ?? 0} high
            </span>
            {churnSummary && churnSummary.atRiskPatients > 0 && (
              <Badge variant="destructive" className="text-xs">
                Action needed
              </Badge>
            )}
          </div>
          {churnSummary?.accuracy && (
            <div className="mt-2 text-xs text-muted-foreground">
              <Target className="h-3 w-3 inline mr-1" />
              {(churnSummary.accuracy.accuracy * 100).toFixed(0)}% accuracy
            </div>
          )}
        </CardContent>
      </Card>

      {/* Demand Forecast */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">7-Day Forecast</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {demandSummary?.next7DaysTotal ?? 0} visits
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {demandSummary?.peakDay && (
              <span>
                Peak: {demandSummary.peakDay.dayName} ({demandSummary.peakDay.predictedVolume})
              </span>
            )}
          </div>
          {demandSummary?.capacityAlerts && demandSummary.capacityAlerts > 0 && (
            <div className="mt-2">
              <Badge variant="outline" className="text-xs text-orange-600">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {demandSummary.capacityAlerts} capacity alerts
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Revenue Projection */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">3-Month Revenue</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatCurrency(revenueSummary?.next3MonthsRevenue ?? 0)}
          </div>
          <div className="flex items-center gap-2 text-xs">
            {revenueSummary?.byMonth?.[0] && (
              <>
                <TrendIcon trend={revenueSummary.byMonth[0].trend} />
                <span className={
                  revenueSummary.byMonth[0].trend === 'INCREASING'
                    ? 'text-green-600'
                    : revenueSummary.byMonth[0].trend === 'DECREASING'
                    ? 'text-red-600'
                    : 'text-muted-foreground'
                }>
                  {revenueSummary.byMonth[0].month} outlook
                </span>
              </>
            )}
          </div>
          {revenueSummary?.confidence && (
            <div className="mt-2 text-xs text-muted-foreground">
              <Target className="h-3 w-3 inline mr-1" />
              {(revenueSummary.confidence * 100).toFixed(0)}% confidence
            </div>
          )}
        </CardContent>
      </Card>

      {/* Practice Health Score */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Practice Health</CardTitle>
          <TrendIcon trend={trendSummary?.practiceHealthTrend} />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {trendSummary?.practiceHealthScore ?? 0}
            <span className="text-sm font-normal text-muted-foreground">/100</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              {trendSummary?.positiveMetrics?.length ?? 0} improving,{' '}
              {trendSummary?.negativeMetrics?.length ?? 0} declining
            </span>
          </div>
          {trendSummary?.totalAlerts && trendSummary.totalAlerts > 0 && (
            <div className="mt-2">
              <Badge
                variant={trendSummary.criticalAlerts > 0 ? 'destructive' : 'outline'}
                className="text-xs"
              >
                <AlertTriangle className="h-3 w-3 mr-1" />
                {trendSummary.totalAlerts} alerts
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
