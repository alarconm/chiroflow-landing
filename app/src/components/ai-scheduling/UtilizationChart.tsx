'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/trpc/client';
import { format } from 'date-fns';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  DollarSign,
  Clock,
  Calendar,
  Users,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useState } from 'react';

interface UtilizationChartProps {
  providerId?: string;
}

export function UtilizationChart({ providerId }: UtilizationChartProps) {
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [count, setCount] = useState(7);

  const { data: trend, isLoading: trendLoading } = trpc.aiScheduling.getUtilizationTrend.useQuery(
    providerId
      ? { providerId, period, count }
      : { providerId: '', period, count },
    { enabled: !!providerId }
  );

  const { data: orgUtilization, isLoading: orgLoading } =
    trpc.aiScheduling.getOrganizationUtilization.useQuery({
      dateRange: {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        end: new Date(),
      },
    });

  const isLoading = providerId ? trendLoading : orgLoading;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-green-500" />
            Provider Utilization
          </CardTitle>
          <CardDescription>Loading utilization data...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
            <Skeleton className="h-48" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const trendIcon = {
    improving: <TrendingUp className="h-4 w-4 text-green-500" />,
    stable: <Minus className="h-4 w-4 text-gray-500" />,
    declining: <TrendingDown className="h-4 w-4 text-red-500" />,
  };

  const overall = orgUtilization?.overall;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-green-500" />
              Provider Utilization
            </CardTitle>
            <CardDescription>
              Schedule efficiency and capacity analysis
            </CardDescription>
          </div>
          {providerId && (
            <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Daily</SelectItem>
                <SelectItem value="week">Weekly</SelectItem>
                <SelectItem value="month">Monthly</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {overall && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-[#053e67] mb-2">
                <Calendar className="h-4 w-4" />
                <span className="text-sm font-medium">Booking Rate</span>
              </div>
              <p className="text-2xl font-bold text-[#053e67]">
                {Math.round(overall.bookingRate * 100)}%
              </p>
              <p className="text-xs text-[#053e67]">
                {overall.bookedMinutes} / {overall.availableMinutes} min
              </p>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-600 mb-2">
                <Users className="h-4 w-4" />
                <span className="text-sm font-medium">Show Rate</span>
              </div>
              <p className="text-2xl font-bold text-green-700">
                {Math.round(overall.utilizationRate * 100)}%
              </p>
              <p className="text-xs text-green-600">
                {overall.completedCount} / {overall.scheduledCount} appointments
              </p>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-purple-600 mb-2">
                <Clock className="h-4 w-4" />
                <span className="text-sm font-medium">Overall</span>
              </div>
              <p className="text-2xl font-bold text-purple-700">
                {Math.round(overall.overallRate * 100)}%
              </p>
              <p className="text-xs text-purple-600">
                {overall.utilizedMinutes} min utilized
              </p>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-yellow-600 mb-2">
                <DollarSign className="h-4 w-4" />
                <span className="text-sm font-medium">Revenue Impact</span>
              </div>
              <p className="text-2xl font-bold text-yellow-700">
                ${((overall.lostRevenue || 0) / 1000).toFixed(1)}k
              </p>
              <p className="text-xs text-yellow-600">potential lost</p>
            </div>
          </div>
        )}

        {trend && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-medium">Trend Analysis</h4>
              <Badge
                variant="outline"
                className={`border-0 ${
                  trend.trend === 'improving'
                    ? 'bg-green-100 text-green-700'
                    : trend.trend === 'declining'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                {trendIcon[trend.trend]}
                <span className="ml-1 capitalize">{trend.trend}</span>
              </Badge>
            </div>
            <div className="space-y-2">
              {trend.data.map((d, idx) => (
                <div key={idx} className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground w-24">
                    {format(new Date(d.date), period === 'day' ? 'MMM d' : period === 'week' ? "'Week' w" : 'MMM yyyy')}
                  </span>
                  <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all duration-500"
                      style={{ width: `${d.overallRate * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium w-12 text-right">
                    {Math.round(d.overallRate * 100)}%
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-sm text-muted-foreground">Avg Booking</p>
                  <p className="font-medium">{Math.round(trend.averages.bookingRate * 100)}%</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Avg Show Rate</p>
                  <p className="font-medium">{Math.round(trend.averages.utilizationRate * 100)}%</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Avg Overall</p>
                  <p className="font-medium">{Math.round(trend.averages.overallRate * 100)}%</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {orgUtilization?.byProvider && orgUtilization.byProvider.length > 0 && (
          <div className="mt-6 pt-6 border-t">
            <h4 className="text-sm font-medium mb-4">By Provider</h4>
            <div className="space-y-3">
              {orgUtilization.byProvider.map((provider) => (
                <div key={provider.providerId} className="flex items-center gap-4">
                  <span className="text-sm w-32 truncate">{provider.providerName}</span>
                  <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        provider.overallRate >= 0.8
                          ? 'bg-green-500'
                          : provider.overallRate >= 0.6
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                      }`}
                      style={{ width: `${provider.overallRate * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium w-12 text-right">
                    {Math.round(provider.overallRate * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
