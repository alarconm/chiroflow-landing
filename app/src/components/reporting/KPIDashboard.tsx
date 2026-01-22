'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/trpc/client';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Users,
  DollarSign,
  XCircle,
  Target,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

const KPI_TARGETS = {
  collectionRate: 95,
  noShowRate: 5,
  patientRetention: 80,
  avgVisitValue: 100,
};

export function KPIDashboard() {
  const [period, setPeriod] = useState<'week' | 'month' | 'quarter' | 'year'>('month');

  // Calculate date ranges based on period
  const getDateRange = () => {
    const end = new Date();
    const start = new Date();
    switch (period) {
      case 'week':
        start.setDate(start.getDate() - 7);
        break;
      case 'month':
        start.setMonth(start.getMonth() - 1);
        break;
      case 'quarter':
        start.setMonth(start.getMonth() - 3);
        break;
      case 'year':
        start.setFullYear(start.getFullYear() - 1);
        break;
    }
    return { start, end };
  };

  const { start, end } = getDateRange();

  // Previous period for comparison
  const previousEnd = new Date(start);
  const previousStart = new Date(start);
  previousStart.setTime(previousStart.getTime() - (end.getTime() - start.getTime()));

  const { data: kpis, isLoading: kpisLoading } = trpc.reporting.getKPIs.useQuery({
    start,
    end,
  });

  const { data: history, isLoading: historyLoading } = trpc.reporting.getKPIHistory.useQuery({
    periodType: period === 'week' ? 'daily' : period === 'year' ? 'monthly' : 'weekly',
    count: 12,
  });

  const { data: trends, isLoading: trendsLoading } = trpc.reporting.getKPITrends.useQuery({
    currentStart: start,
    currentEnd: end,
    previousStart,
    previousEnd,
    targets: KPI_TARGETS,
  });

  const isLoading = kpisLoading || historyLoading || trendsLoading;

  // Helper to find trend by KPI name
  const getTrend = (kpiName: string) => trends?.find(t => t.kpiName === kpiName)?.change;

  const kpiCards = [
    {
      title: 'Collection Rate',
      value: kpis?.collectionRate,
      target: KPI_TARGETS.collectionRate,
      format: (v: number) => `${v.toFixed(1)}%`,
      icon: DollarSign,
      trend: getTrend('collectionRate'),
      description: 'Target: 95%',
    },
    {
      title: 'No-Show Rate',
      value: kpis?.noShowRate,
      target: KPI_TARGETS.noShowRate,
      format: (v: number) => `${v.toFixed(1)}%`,
      icon: XCircle,
      trend: getTrend('noShowRate'),
      description: 'Target: <5%',
      inverse: true, // Lower is better
    },
    {
      title: 'Patient Retention',
      value: kpis?.patientRetention,
      target: KPI_TARGETS.patientRetention,
      format: (v: number) => `${v.toFixed(1)}%`,
      icon: Users,
      trend: getTrend('patientRetention'),
      description: 'Target: 80%',
    },
    {
      title: 'Avg Visit Value',
      value: kpis?.avgVisitValue,
      target: KPI_TARGETS.avgVisitValue,
      format: (v: number) => `$${v.toFixed(2)}`,
      icon: Activity,
      trend: getTrend('avgVisitValue'),
      description: 'Target: $100',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex gap-2">
        {(['week', 'month', 'quarter', 'year'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1 rounded text-sm ${
              period === p
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80'
            }`}
          >
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20 mb-2" />
                <Skeleton className="h-2 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {kpiCards.map((kpi) => {
            const value = kpi.value || 0;
            const progressValue = kpi.inverse
              ? Math.max(0, 100 - (value / kpi.target) * 100)
              : Math.min(100, (value / kpi.target) * 100);
            const isOnTarget = kpi.inverse ? value <= kpi.target : value >= kpi.target;

            return (
              <Card key={kpi.title}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{kpi.title}</CardTitle>
                  <kpi.icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="text-2xl font-bold">{kpi.format(value)}</div>
                    {kpi.trend !== undefined && (
                      <div className={`flex items-center text-xs ${
                        (kpi.inverse ? kpi.trend < 0 : kpi.trend > 0)
                          ? 'text-green-600'
                          : 'text-red-600'
                      }`}>
                        {(kpi.inverse ? kpi.trend < 0 : kpi.trend > 0) ? (
                          <TrendingUp className="h-3 w-3 mr-1" />
                        ) : (
                          <TrendingDown className="h-3 w-3 mr-1" />
                        )}
                        {Math.abs(kpi.trend).toFixed(1)}%
                      </div>
                    )}
                  </div>
                  <Progress
                    value={progressValue}
                    className={`mt-2 ${isOnTarget ? '' : '[&>div]:bg-yellow-500'}`}
                  />
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    {isOnTarget ? (
                      <Target className="h-3 w-3 text-green-500" />
                    ) : (
                      <Target className="h-3 w-3 text-yellow-500" />
                    )}
                    {kpi.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Trends Chart */}
      {history && history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>KPI Trends</CardTitle>
            <CardDescription>Performance over the last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short' })}
                  />
                  <YAxis />
                  <Tooltip
                    labelFormatter={(value) => new Date(value as string | number).toLocaleDateString()}
                    formatter={(value) => [`${(value as number)?.toFixed(1) ?? 0}%`, '']}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="collectionRate"
                    name="Collection Rate"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="noShowRate"
                    name="No-Show Rate"
                    stroke="#dc2626"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="patientRetention"
                    name="Patient Retention"
                    stroke="#16a34a"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
