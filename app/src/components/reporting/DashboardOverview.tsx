'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/trpc/client';
import {
  DollarSign,
  Users,
  Calendar,
  TrendingUp,
  TrendingDown,
  Activity,
  Clock,
  Percent
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface DashboardOverviewProps {
  startDate?: Date;
  endDate?: Date;
}

export function DashboardOverview({ startDate }: DashboardOverviewProps) {
  const { data: metrics, isLoading } = trpc.reporting.getDashboard.useQuery({
    date: startDate || new Date(),
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(8)].map((_, i) => (
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
    );
  }

  const stats = [
    {
      title: 'Today Visits',
      value: metrics?.todayVisits?.toString() || '0',
      change: metrics?.visitsTrend,
      icon: Calendar,
    },
    {
      title: 'New Patients',
      value: metrics?.todayNewPatients?.toString() || '0',
      change: metrics?.newPatientsTrend,
      icon: Users,
    },
    {
      title: 'Today Revenue',
      value: `$${(metrics?.todayRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      change: metrics?.revenueTrend,
      icon: DollarSign,
    },
    {
      title: 'No Shows',
      value: metrics?.todayNoShows?.toString() || '0',
      change: metrics?.noShowsTrend,
      icon: Activity,
    },
    {
      title: 'Collection Rate',
      value: `${(metrics?.collectionRate || 0).toFixed(1)}%`,
      icon: Percent,
    },
    {
      title: 'Avg Days to Collect',
      value: `${(metrics?.avgDaysToCollect || 0).toFixed(0)}`,
      icon: TrendingUp,
    },
    {
      title: 'Outstanding A/R',
      value: `$${(metrics?.totalAR || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      icon: Clock,
    },
    {
      title: 'Pending Claims',
      value: metrics?.pendingClaims?.toString() || '0',
      icon: TrendingDown,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            {stat.change !== undefined && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {stat.change >= 0 ? (
                  <TrendingUp className="h-3 w-3 text-green-500" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-500" />
                )}
                {stat.change >= 0 ? '+' : ''}{stat.change.toFixed(1)}% from previous period
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
