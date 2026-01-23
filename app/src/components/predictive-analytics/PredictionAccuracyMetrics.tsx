'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { trpc } from '@/trpc/client';
import {
  Target,
  CheckCircle,
  XCircle,
  TrendingUp,
  Users,
  Calendar,
  DollarSign,
  Activity,
} from 'lucide-react';

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function AccuracyGauge({ value, label }: { value: number; label: string }) {
  const percent = value * 100;
  const color =
    percent >= 80 ? 'text-green-600' : percent >= 60 ? 'text-yellow-600' : 'text-red-600';
  const bgColor =
    percent >= 80 ? 'bg-green-500' : percent >= 60 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="text-center">
      <div className={`text-3xl font-bold ${color}`}>{percent.toFixed(0)}%</div>
      <Progress value={percent} className={`h-2 mt-2 ${bgColor}`} />
      <div className="text-sm text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

export function PredictionAccuracyMetrics() {
  const { data: churnAccuracy, isLoading: churnLoading } = trpc.aiPredict.getPredictionAccuracy.useQuery(
    undefined,
    { refetchOnWindowFocus: false }
  );

  const { data: noShowAccuracy, isLoading: noShowLoading } = trpc.aiPredict.getNoShowPredictionAccuracy.useQuery(
    undefined,
    { refetchOnWindowFocus: false }
  );

  const { data: forecastAccuracy, isLoading: forecastLoading } = trpc.aiPredict.getForecastAccuracySummary.useQuery(
    { lookbackDays: 30 },
    { refetchOnWindowFocus: false }
  );

  const { data: revenueAccuracy, isLoading: revenueLoading } = trpc.aiPredict.getRevenueForecastAccuracySummary.useQuery(
    { lookbackMonths: 6 },
    { refetchOnWindowFocus: false }
  );

  const { data: outcomeAccuracy, isLoading: outcomeLoading } = trpc.aiPredict.getOutcomePredictionAccuracy.useQuery(
    undefined,
    { refetchOnWindowFocus: false }
  );

  const { data: trendAccuracy, isLoading: trendLoading } = trpc.aiPredict.getTrendAccuracySummary.useQuery(
    { lookbackDays: 90 },
    { refetchOnWindowFocus: false }
  );

  if (churnLoading || noShowLoading || forecastLoading || revenueLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Accuracy Summary */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Users className="h-8 w-8 text-[#053e67]" />
              <div>
                <div className="text-2xl font-bold">
                  {churnAccuracy ? formatPercent(churnAccuracy.accuracy) : 'N/A'}
                </div>
                <div className="text-sm text-muted-foreground">Churn Prediction</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Calendar className="h-8 w-8 text-[#053e67]" />
              <div>
                <div className="text-2xl font-bold">
                  {noShowAccuracy ? formatPercent(noShowAccuracy.accuracy) : 'N/A'}
                </div>
                <div className="text-sm text-muted-foreground">No-Show Prediction</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <TrendingUp className="h-8 w-8 text-[#053e67]" />
              <div>
                <div className="text-2xl font-bold">
                  {forecastAccuracy?.withinConfidenceRate
                    ? formatPercent(forecastAccuracy.withinConfidenceRate)
                    : 'N/A'}
                </div>
                <div className="text-sm text-muted-foreground">Demand Forecast</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <DollarSign className="h-8 w-8 text-[#053e67]" />
              <div>
                <div className="text-2xl font-bold">
                  {revenueAccuracy?.withinConfidenceRate
                    ? formatPercent(revenueAccuracy.withinConfidenceRate)
                    : 'N/A'}
                </div>
                <div className="text-sm text-muted-foreground">Revenue Forecast</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Churn Prediction Accuracy */}
      {churnAccuracy && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Churn Prediction Accuracy
            </CardTitle>
            <CardDescription>
              How well we predict patient churn risk
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-3">
              <AccuracyGauge value={churnAccuracy.accuracy} label="Overall Accuracy" />
              <div className="text-center">
                <div className="text-3xl font-bold text-[#053e67]">{churnAccuracy.totalPredictions}</div>
                <div className="text-sm text-muted-foreground mt-1">Total Predictions</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-[#053e67]">{churnAccuracy.validatedPredictions}</div>
                <div className="text-sm text-muted-foreground mt-1">Validated</div>
              </div>
            </div>

            <div className="mt-6">
              <h4 className="font-medium mb-3">By Risk Level</h4>
              <div className="space-y-2">
                {churnAccuracy.byRiskLevel.map((level, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm capitalize">{level.level}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {level.predictions} predictions
                      </span>
                      <Badge
                        variant={level.accuracy >= 0.7 ? 'default' : 'secondary'}
                      >
                        {formatPercent(level.accuracy)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Target className="h-4 w-4" />
              <span>
                Based on {churnAccuracy.totalPredictions} total predictions, {churnAccuracy.validatedPredictions} validated
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No-Show Prediction Accuracy */}
      {noShowAccuracy && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              No-Show Prediction Accuracy
            </CardTitle>
            <CardDescription>
              How well we predict appointment no-shows
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-4">
              <AccuracyGauge value={noShowAccuracy.accuracy} label="Accuracy" />
              <AccuracyGauge value={noShowAccuracy.precision} label="Precision" />
              <AccuracyGauge value={noShowAccuracy.recall} label="Recall" />
              <AccuracyGauge value={noShowAccuracy.f1Score} label="F1 Score" />
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div>
                <h4 className="font-medium mb-3">Confusion Matrix</h4>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-3 bg-green-50 rounded">
                    <div className="flex items-center justify-center gap-1">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="font-medium">{noShowAccuracy.truePositives}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">True Positives</div>
                  </div>
                  <div className="p-3 bg-red-50 rounded">
                    <div className="flex items-center justify-center gap-1">
                      <XCircle className="h-4 w-4 text-red-600" />
                      <span className="font-medium">{noShowAccuracy.falsePositives}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">False Positives</div>
                  </div>
                  <div className="p-3 bg-red-50 rounded">
                    <div className="flex items-center justify-center gap-1">
                      <XCircle className="h-4 w-4 text-red-600" />
                      <span className="font-medium">{noShowAccuracy.falseNegatives}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">False Negatives</div>
                  </div>
                  <div className="p-3 bg-green-50 rounded">
                    <div className="flex items-center justify-center gap-1">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="font-medium">{noShowAccuracy.trueNegatives}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">True Negatives</div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-3">By Day of Week</h4>
                <div className="space-y-2">
                  {noShowAccuracy.byDayOfWeek.map((day, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span>{day.day}</span>
                      <Badge variant="outline">
                        {formatPercent(day.accuracy)}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Forecast Accuracy */}
      {forecastAccuracy && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Demand Forecast Accuracy
            </CardTitle>
            <CardDescription>
              How well we predict appointment volume
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold">
                  {forecastAccuracy.averageMape?.toFixed(1)}%
                </div>
                <div className="text-sm text-muted-foreground">Mean Absolute % Error</div>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {formatPercent(forecastAccuracy.withinConfidenceRate ?? 0)}
                </div>
                <div className="text-sm text-muted-foreground">Within Confidence</div>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold">
                  {forecastAccuracy.totalForecasts ?? 0}
                </div>
                <div className="text-sm text-muted-foreground">Forecasts Validated</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Outcome Prediction Accuracy */}
      {outcomeAccuracy && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Treatment Outcome Prediction Accuracy
            </CardTitle>
            <CardDescription>
              How well we predict treatment outcomes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold">
                  {outcomeAccuracy.mape?.toFixed(1)}%
                </div>
                <div className="text-sm text-muted-foreground">MAPE</div>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {formatPercent(outcomeAccuracy.overall?.accuracy ?? 0)}
                </div>
                <div className="text-sm text-muted-foreground">Overall Accuracy</div>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold">
                  {outcomeAccuracy.correlationCoefficient?.toFixed(2) ?? 'N/A'}
                </div>
                <div className="text-sm text-muted-foreground">Correlation</div>
              </div>
            </div>

            {outcomeAccuracy.byResponseLevel && (
              <div className="mt-4">
                <h4 className="font-medium mb-3">By Response Level</h4>
                <div className="space-y-2">
                  {outcomeAccuracy.byResponseLevel.map((level, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-sm capitalize">{level.level}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {level.accurate}/{level.predictions}
                        </span>
                        <Badge variant={level.accuracy >= 0.7 ? 'default' : 'secondary'}>
                          {formatPercent(level.accuracy)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Model Information */}
      <Card>
        <CardHeader>
          <CardTitle>Model Information</CardTitle>
          <CardDescription>
            AI model versions and learning progress
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium mb-2">Prediction Models</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Churn Prediction</span>
                  <Badge variant="outline">v1.0</Badge>
                </div>
                <div className="flex justify-between">
                  <span>No-Show Prediction</span>
                  <Badge variant="outline">v1.0</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Demand Forecasting</span>
                  <Badge variant="outline">v1.0</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Revenue Forecasting</span>
                  <Badge variant="outline">v1.0</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Outcome Prediction</span>
                  <Badge variant="outline">v1.0</Badge>
                </div>
              </div>
            </div>

            <div className="p-4 border rounded-lg">
              <h4 className="font-medium mb-2">Learning Progress</h4>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Training Data</span>
                    <span className="text-muted-foreground">Growing</span>
                  </div>
                  <Progress value={65} className="h-2" />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Model Confidence</span>
                    <span className="text-muted-foreground">Improving</span>
                  </div>
                  <Progress value={78} className="h-2" />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Models improve automatically as more data becomes available
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
