'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { trpc } from '@/trpc/client';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Activity,
  DollarSign,
  Users,
  Calendar,
  Target,
} from 'lucide-react';

const metricIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  revenue: DollarSign,
  patient_volume: Users,
  new_patients: Users,
  no_shows: Calendar,
  cancellations: Calendar,
  collections: DollarSign,
  ar_balance: DollarSign,
  payer_mix: Target,
};

function TrendIcon({ direction }: { direction: string }) {
  if (direction === 'up' || direction === 'increasing') {
    return <TrendingUp className="h-5 w-5 text-green-500" />;
  }
  if (direction === 'down' || direction === 'decreasing') {
    return <TrendingDown className="h-5 w-5 text-red-500" />;
  }
  return <Minus className="h-5 w-5 text-gray-500" />;
}

function formatValue(value: number, metricType: string): string {
  if (metricType === 'revenue' || metricType === 'collections' || metricType === 'ar_balance') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }
  if (metricType === 'no_shows' || metricType === 'cancellations') {
    return `${value.toFixed(1)}%`;
  }
  return new Intl.NumberFormat('en-US').format(Math.round(value));
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

interface TrendIndicatorsProps {
  compact?: boolean;
}

export function TrendIndicators({ compact = false }: TrendIndicatorsProps) {
  const [lookbackDays, setLookbackDays] = useState<number>(90);

  const { data: trendSummary, isLoading: summaryLoading } = trpc.aiPredict.getTrendSummary.useQuery(
    undefined,
    { refetchOnWindowFocus: false }
  );

  const { data: revenueTrends, isLoading: revenueLoading } = trpc.aiPredict.getRevenueTrends.useQuery(
    { lookbackDays },
    { refetchOnWindowFocus: false, enabled: !compact }
  );

  const { data: volumeTrends, isLoading: volumeLoading } = trpc.aiPredict.getPatientVolumeTrends.useQuery(
    { lookbackDays },
    { refetchOnWindowFocus: false, enabled: !compact }
  );

  const { data: anomalies, isLoading: anomaliesLoading } = trpc.aiPredict.getAnomalies.useQuery(
    { lookbackDays: 30 },
    { refetchOnWindowFocus: false, enabled: !compact }
  );

  const { data: recommendations } = trpc.aiPredict.getTrendRecommendations.useQuery(
    { limit: 5 },
    { refetchOnWindowFocus: false, enabled: !compact }
  );

  if (summaryLoading) {
    return (
      <div className="space-y-4">
        {[...Array(compact ? 2 : 4)].map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (compact && trendSummary) {
    // Compact view for dashboard overview
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Practice Health</span>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{trendSummary.practiceHealthScore}</span>
            <span className="text-sm text-muted-foreground">/100</span>
            <TrendIcon direction={trendSummary.practiceHealthTrend} />
          </div>
        </div>

        {trendSummary.keyMetrics && trendSummary.keyMetrics.slice(0, 4).map((metric, i) => {
          const Icon = metricIcons[metric.metricType] || Activity;
          return (
            <div key={i} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span>{metric.metricLabel}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  {formatValue(metric.currentValue, metric.metricType)}
                </span>
                <span
                  className={
                    metric.changePercent > 0
                      ? 'text-green-600'
                      : metric.changePercent < 0
                      ? 'text-red-600'
                      : 'text-muted-foreground'
                  }
                >
                  {formatPercent(metric.changePercent)}
                </span>
              </div>
            </div>
          );
        })}

        {trendSummary.totalAlerts > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            <span className="text-orange-600">
              {trendSummary.totalAlerts} active alerts
            </span>
          </div>
        )}
      </div>
    );
  }

  // Full view
  return (
    <div className="space-y-6">
      {/* Health Score and Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-4xl font-bold text-[#053e67]">
              {trendSummary?.practiceHealthScore ?? 0}
            </div>
            <div className="text-sm text-muted-foreground">Practice Health Score</div>
          </div>
          <TrendIcon direction={trendSummary?.practiceHealthTrend ?? 'stable'} />
        </div>
        <Select
          value={lookbackDays.toString()}
          onValueChange={(v) => setLookbackDays(parseInt(v))}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Time period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="60">Last 60 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="180">Last 6 months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Key Metrics Grid */}
      {trendSummary?.keyMetrics && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {trendSummary.keyMetrics.map((metric, i) => {
            const Icon = metricIcons[metric.metricType] || Activity;
            const isPositive = metric.changePercent > 0;
            const isNegative = metric.changePercent < 0;
            // For no_shows and cancellations, negative is good
            const isGood =
              metric.metricType === 'no_shows' || metric.metricType === 'cancellations'
                ? isNegative
                : isPositive;

            return (
              <Card key={i}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                      <span className="font-medium">{metric.metricLabel}</span>
                    </div>
                    <TrendIcon direction={metric.trend} />
                  </div>
                  <div className="mt-4">
                    <div className="text-2xl font-bold">
                      {formatValue(metric.currentValue, metric.metricType)}
                    </div>
                    <div
                      className={`text-sm ${
                        isGood ? 'text-green-600' : isNegative || isPositive ? 'text-red-600' : 'text-muted-foreground'
                      }`}
                    >
                      {formatPercent(metric.changePercent)} vs previous period
                    </div>
                  </div>
                  {metric.alertCount > 0 && (
                    <Badge variant="outline" className="mt-2 text-orange-600">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {metric.alertCount} alerts
                    </Badge>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Trend Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600">Improving</CardTitle>
          </CardHeader>
          <CardContent>
            {trendSummary?.positiveMetrics && trendSummary.positiveMetrics.length > 0 ? (
              <ul className="space-y-1">
                {trendSummary.positiveMetrics.map((metric, i) => (
                  <li key={i} className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-3 w-3 text-green-500" />
                    {metric}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No improving metrics</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600">Declining</CardTitle>
          </CardHeader>
          <CardContent>
            {trendSummary?.negativeMetrics && trendSummary.negativeMetrics.length > 0 ? (
              <ul className="space-y-1">
                {trendSummary.negativeMetrics.map((metric, i) => (
                  <li key={i} className="text-sm flex items-center gap-2">
                    <TrendingDown className="h-3 w-3 text-red-500" />
                    {metric}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No declining metrics</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Stable</CardTitle>
          </CardHeader>
          <CardContent>
            {trendSummary?.stableMetrics && trendSummary.stableMetrics.length > 0 ? (
              <ul className="space-y-1">
                {trendSummary.stableMetrics.map((metric, i) => (
                  <li key={i} className="text-sm flex items-center gap-2">
                    <Minus className="h-3 w-3 text-gray-500" />
                    {metric}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No stable metrics</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Anomalies */}
      {anomalies && anomalies.totalAnomalies > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Detected Anomalies
            </CardTitle>
            <CardDescription>
              Unusual patterns detected in your practice data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {anomalies.byMetric.map((metricAnomalies, i) => (
                <div key={i}>
                  <h4 className="font-medium mb-2 capitalize">
                    {metricAnomalies.metricType.replace('_', ' ')}
                  </h4>
                  <div className="space-y-2">
                    {(metricAnomalies.anomalies as Array<{
                      anomalyType: string;
                      severity: string;
                      description: string;
                      possibleCauses: string[];
                    }>).slice(0, 3).map((anomaly, j) => (
                      <div
                        key={j}
                        className={`p-3 rounded-lg ${
                          anomaly.severity === 'critical'
                            ? 'bg-red-50 border border-red-200'
                            : anomaly.severity === 'high'
                            ? 'bg-orange-50 border border-orange-200'
                            : 'bg-yellow-50 border border-yellow-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Badge
                            variant={
                              anomaly.severity === 'critical'
                                ? 'destructive'
                                : anomaly.severity === 'high'
                                ? 'default'
                                : 'secondary'
                            }
                          >
                            {anomaly.anomalyType.replace('_', ' ')}
                          </Badge>
                          <Badge variant="outline">{anomaly.severity}</Badge>
                        </div>
                        <p className="text-sm">{anomaly.description}</p>
                        {anomaly.possibleCauses.length > 0 && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            Possible causes: {anomaly.possibleCauses.slice(0, 2).join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      {recommendations && recommendations.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recommended Actions</CardTitle>
            <CardDescription>
              AI-powered recommendations based on trend analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recommendations.recommendations.map((rec, i) => (
                <div key={i} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          variant={
                            rec.priority === 'immediate'
                              ? 'destructive'
                              : rec.priority === 'soon'
                              ? 'default'
                              : 'secondary'
                          }
                        >
                          {rec.priority}
                        </Badge>
                        <Badge variant="outline">{rec.category}</Badge>
                      </div>
                      <h4 className="font-medium">{rec.action}</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        {rec.description}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>Impact: {rec.expectedImpact}</span>
                        <span>Effort: {rec.effort}</span>
                        {rec.automatable && (
                          <Badge variant="outline" className="text-xs">
                            Can automate
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
