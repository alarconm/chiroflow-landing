'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/trpc/client';
import {
  Calendar,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Users,
  Clock,
  Sun,
  CloudRain,
} from 'lucide-react';
import { format, addDays } from 'date-fns';

function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(num));
}

interface DailyForecastItemProps {
  forecast: {
    date: Date;
    dayName: string;
    predictedVolume: number;
    confidenceInterval: { min: number; max: number };
    isWeekend: boolean;
    isHoliday: boolean;
    holidayName: string | null;
    sameWeekdayAverage: number;
    varianceFromAverage: number;
  };
  maxVolume: number;
}

function DailyForecastItem({ forecast, maxVolume }: DailyForecastItemProps) {
  const barWidth = (forecast.predictedVolume / maxVolume) * 100;
  const isAboveAverage = forecast.varianceFromAverage > 10;
  const isBelowAverage = forecast.varianceFromAverage < -10;

  return (
    <div className="flex items-center gap-4 py-2">
      <div className="w-24 text-sm">
        <div className="font-medium">{forecast.dayName}</div>
        <div className="text-xs text-muted-foreground">
          {format(new Date(forecast.date), 'MMM d')}
        </div>
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <div
            className={`h-6 rounded ${
              forecast.isWeekend
                ? 'bg-slate-300'
                : forecast.isHoliday
                ? 'bg-amber-300'
                : 'bg-[#053e67]'
            }`}
            style={{ width: `${barWidth}%` }}
          />
          <span className="text-sm font-medium">{formatNumber(forecast.predictedVolume)}</span>
          {isAboveAverage && (
            <TrendingUp className="h-4 w-4 text-green-500" />
          )}
          {isBelowAverage && (
            <TrendingDown className="h-4 w-4 text-red-500" />
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Range: {formatNumber(forecast.confidenceInterval.min)} - {formatNumber(forecast.confidenceInterval.max)}
          {forecast.isHoliday && (
            <Badge variant="outline" className="ml-2 text-xs">
              {forecast.holidayName}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

export function DemandForecastVisualization() {
  const [forecastView, setForecastView] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  const { data: dailyForecasts, isLoading: dailyLoading } = trpc.aiPredict.getDailyForecasts.useQuery(
    { startDate: new Date(), endDate: addDays(new Date(), 14) },
    { refetchOnWindowFocus: false }
  );

  const { data: weeklyForecasts, isLoading: weeklyLoading } = trpc.aiPredict.getWeeklyForecasts.useQuery(
    { weeks: 4 },
    { refetchOnWindowFocus: false }
  );

  const { data: capacityInsights, isLoading: capacityLoading } = trpc.aiPredict.getCapacityInsights.useQuery(
    undefined,
    { refetchOnWindowFocus: false }
  );

  const { data: staffingRecs, isLoading: staffingLoading } = trpc.aiPredict.getStaffingRecommendations.useQuery(
    { forecastDays: 14 },
    { refetchOnWindowFocus: false }
  );

  const { data: seasonalPatterns, isLoading: seasonalLoading } = trpc.aiPredict.getSeasonalPatterns.useQuery(
    undefined,
    { refetchOnWindowFocus: false }
  );

  if (dailyLoading || weeklyLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[400px] w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const maxDailyVolume = dailyForecasts?.forecasts
    ? Math.max(...dailyForecasts.forecasts.map((f) => f.predictedVolume))
    : 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-[#053e67]">
                {formatNumber(dailyForecasts?.totalPredictedVolume ?? 0)}
              </div>
              <div className="text-sm text-muted-foreground">14-Day Forecast</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold">
                {formatNumber(dailyForecasts?.averageDailyVolume ?? 0)}
              </div>
              <div className="text-sm text-muted-foreground">Daily Average</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">
                {((dailyForecasts?.confidence ?? 0) * 100).toFixed(0)}%
              </div>
              <div className="text-sm text-muted-foreground">Confidence</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-orange-500">
                {capacityInsights?.insights?.filter((i) => i.actionRequired).length ?? 0}
              </div>
              <div className="text-sm text-muted-foreground">Capacity Alerts</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Forecast Visualization */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Demand Forecast
              </CardTitle>
              <CardDescription>
                Predicted appointment volume based on historical patterns
              </CardDescription>
            </div>
            <Tabs value={forecastView} onValueChange={(v) => setForecastView(v as typeof forecastView)}>
              <TabsList>
                <TabsTrigger value="daily">Daily</TabsTrigger>
                <TabsTrigger value="weekly">Weekly</TabsTrigger>
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {forecastView === 'daily' && dailyForecasts?.forecasts && (
            <div className="space-y-2">
              {dailyForecasts.forecasts.map((forecast, i) => (
                <DailyForecastItem
                  key={i}
                  forecast={forecast}
                  maxVolume={maxDailyVolume}
                />
              ))}
            </div>
          )}

          {forecastView === 'weekly' && weeklyForecasts?.forecasts && (
            <div className="space-y-4">
              {weeklyForecasts.forecasts.map((week, i) => (
                <div key={i} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium">
                      Week {week.weekNumber} ({format(new Date(week.weekStartDate), 'MMM d')} - {format(new Date(week.weekEndDate), 'MMM d')})
                    </div>
                    <Badge variant="outline">
                      {formatNumber(week.predictedVolume)} visits
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Peak: {week.peakDay} | Low: {week.lowestDay}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Range: {formatNumber(week.confidenceInterval.min)} - {formatNumber(week.confidenceInterval.max)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Staffing Recommendations */}
      {staffingRecs && staffingRecs.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Staffing Recommendations
            </CardTitle>
            <CardDescription>
              Optimal staffing levels based on demand forecast
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {staffingRecs.recommendations.slice(0, 6).map((rec, i) => (
                <div key={i} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">
                      {format(new Date(rec.date), 'EEE, MMM d')}
                    </span>
                    {rec.isOverCapacity && (
                      <Badge variant="destructive" className="text-xs">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Over capacity
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <span>{rec.recommendedProviders} providers</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      <span>Peak at {rec.peakHour}:00 ({rec.peakHourVolume} visits)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span>{rec.predictedVolume} total visits</span>
                    </div>
                  </div>
                  {rec.capacityWarning && (
                    <div className="mt-2 text-xs text-orange-600">
                      {rec.capacityWarning}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Capacity Insights */}
      {capacityInsights?.insights && capacityInsights.insights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Capacity Insights
            </CardTitle>
            <CardDescription>
              Potential bottlenecks and opportunities
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {capacityInsights.insights.map((insight, i) => (
                <div
                  key={i}
                  className={`border rounded-lg p-4 ${
                    insight.severity === 'high'
                      ? 'border-red-200 bg-red-50'
                      : insight.severity === 'medium'
                      ? 'border-yellow-200 bg-yellow-50'
                      : 'border-blue-200 bg-blue-50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Badge
                      variant={
                        insight.type === 'understaffed'
                          ? 'destructive'
                          : insight.type === 'overstaffed'
                          ? 'secondary'
                          : insight.type === 'bottleneck'
                          ? 'destructive'
                          : 'default'
                      }
                    >
                      {insight.type.replace('_', ' ')}
                    </Badge>
                    <span className="text-sm font-medium">{insight.description}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{insight.recommendation}</p>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Impact: {insight.potentialImpact}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Seasonal Patterns */}
      {seasonalPatterns && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sun className="h-5 w-5" />
              Seasonal Patterns
            </CardTitle>
            <CardDescription>
              Detected patterns in appointment demand
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {/* Day of Week Patterns */}
              {seasonalPatterns.dayOfWeekFactors && seasonalPatterns.dayOfWeekFactors.length > 0 && (
                <div className="border rounded-lg p-4">
                  <h4 className="font-medium mb-3">Day of Week Patterns</h4>
                  <div className="space-y-2">
                    {seasonalPatterns.dayOfWeekFactors.map((day, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span>{day.dayName}</span>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2 bg-[#053e67] rounded"
                            style={{ width: `${day.factor * 50}px` }}
                          />
                          <span className="text-muted-foreground">
                            {(day.factor * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Holiday Impacts */}
              {seasonalPatterns.holidayImpacts && seasonalPatterns.holidayImpacts.length > 0 && (
                <div className="border rounded-lg p-4">
                  <h4 className="font-medium mb-3">Upcoming Holiday Impacts</h4>
                  <div className="space-y-2">
                    {seasonalPatterns.holidayImpacts.slice(0, 5).map((holiday, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span>{holiday.holiday}</span>
                        <Badge variant={holiday.impactFactor < 1 ? 'destructive' : 'default'}>
                          {holiday.impactFactor < 1 ? '-' : '+'}
                          {Math.abs((1 - holiday.impactFactor) * 100).toFixed(0)}%
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
