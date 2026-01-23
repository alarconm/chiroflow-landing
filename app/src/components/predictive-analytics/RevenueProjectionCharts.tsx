'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { trpc } from '@/trpc/client';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
} from 'lucide-react';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

interface RevenueProjectionChartsProps {
  compact?: boolean;
}

export function RevenueProjectionCharts({ compact = false }: RevenueProjectionChartsProps) {
  const { data: revenueSummary, isLoading } = trpc.aiPredict.getRevenueSummary.useQuery(
    undefined,
    { refetchOnWindowFocus: false }
  );

  const { data: scenarios, isLoading: scenariosLoading } = trpc.aiPredict.getRevenueScenarios.useQuery(
    { forecastMonths: 3 },
    { refetchOnWindowFocus: false, enabled: !compact }
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(compact ? 2 : 4)].map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (!revenueSummary) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No revenue data available</p>
      </div>
    );
  }

  if (compact) {
    // Compact view for dashboard overview
    return (
      <div className="space-y-4">
        <div className="text-center">
          <div className="text-3xl font-bold text-[#053e67]">
            {formatCurrency(revenueSummary.next3MonthsRevenue)}
          </div>
          <div className="text-sm text-muted-foreground">3-Month Projection</div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div>
            <div className="font-medium">{formatCurrency(revenueSummary.totalCharges)}</div>
            <div className="text-xs text-muted-foreground">Charges</div>
          </div>
          <div>
            <div className="font-medium">{formatCurrency(revenueSummary.totalCollections)}</div>
            <div className="text-xs text-muted-foreground">Collections</div>
          </div>
          <div>
            <div className="font-medium">{formatCurrency(revenueSummary.totalARRecovery)}</div>
            <div className="text-xs text-muted-foreground">AR Recovery</div>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Confidence</span>
          <div className="flex items-center gap-2">
            <Progress value={revenueSummary.confidence * 100} className="w-24 h-2" />
            <span className="font-medium">{(revenueSummary.confidence * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>
    );
  }

  // Full view
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-[#053e67]">
                {formatCurrency(revenueSummary.next3MonthsRevenue)}
              </div>
              <div className="text-sm text-muted-foreground">3-Month Revenue</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold">
                {formatCurrency(revenueSummary.averageMonthlyRevenue)}
              </div>
              <div className="text-sm text-muted-foreground">Monthly Average</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">
                {formatCurrency(revenueSummary.optimisticRevenue)}
              </div>
              <div className="text-sm text-muted-foreground">Best Case</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-orange-500">
                {formatCurrency(revenueSummary.pessimisticRevenue)}
              </div>
              <div className="text-sm text-muted-foreground">Worst Case</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Monthly Revenue Forecast
          </CardTitle>
          <CardDescription>
            Projected revenue by month with confidence intervals
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {revenueSummary.byMonth.map((month, i) => {
              const maxRevenue = Math.max(...revenueSummary.byMonth.map((m) => m.predictedRevenue));
              const barWidth = (month.predictedRevenue / maxRevenue) * 100;

              return (
                <div key={i} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{month.month} {month.year}</span>
                      {month.trend === 'INCREASING' && (
                        <Badge variant="outline" className="text-green-600">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          Growing
                        </Badge>
                      )}
                      {month.trend === 'DECREASING' && (
                        <Badge variant="outline" className="text-red-600">
                          <TrendingDown className="h-3 w-3 mr-1" />
                          Declining
                        </Badge>
                      )}
                    </div>
                    <span className="font-bold text-lg">
                      {formatCurrency(month.predictedRevenue)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-4 rounded bg-[#053e67]"
                      style={{ width: `${barWidth}%` }}
                    />
                    <span className="text-xs text-muted-foreground">
                      {(month.confidence * 100).toFixed(0)}% confidence
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm text-muted-foreground">
                    <div>
                      <span>Charges: </span>
                      <span className="font-medium text-foreground">
                        {formatCurrency(month.predictedCharges)}
                      </span>
                    </div>
                    <div>
                      <span>Collections: </span>
                      <span className="font-medium text-foreground">
                        {formatCurrency(month.predictedCollections)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Revenue Components */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* AR Insights */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              AR Recovery Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total AR Balance</span>
                <span className="font-bold">
                  {formatCurrency(revenueSummary.arInsights.totalARBalance)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">30-Day Expected Recovery</span>
                <span className="font-bold text-green-600">
                  {formatCurrency(revenueSummary.arInsights.expected30DayRecovery)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Bad Debt Risk</span>
                <div className="flex items-center gap-2">
                  <Progress
                    value={revenueSummary.arInsights.badDebtRisk}
                    className="w-24 h-2"
                  />
                  <span className={revenueSummary.arInsights.badDebtRisk > 20 ? 'text-red-600' : ''}>
                    {revenueSummary.arInsights.badDebtRisk.toFixed(1)}%
                  </span>
                </div>
              </div>
              {revenueSummary.arInsights.badDebtRisk > 20 && (
                <div className="p-3 bg-red-50 rounded-lg text-sm text-red-800">
                  <AlertTriangle className="h-4 w-4 inline mr-2" />
                  Bad debt risk is above target. Review aging accounts.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Goal Attainment */}
        {revenueSummary.goalAttainment && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Goal Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-5xl font-bold text-[#053e67]">
                    {(revenueSummary.goalAttainment.probability * 100).toFixed(0)}%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Probability of hitting goal
                  </div>
                </div>
                {revenueSummary.goalAttainment.gap !== 0 && (
                  <div className="flex items-center justify-center gap-2">
                    {revenueSummary.goalAttainment.gap > 0 ? (
                      <>
                        <ArrowDownRight className="h-4 w-4 text-red-500" />
                        <span className="text-red-600">
                          {formatCurrency(Math.abs(revenueSummary.goalAttainment.gap))} below goal
                        </span>
                      </>
                    ) : (
                      <>
                        <ArrowUpRight className="h-4 w-4 text-green-500" />
                        <span className="text-green-600">
                          {formatCurrency(Math.abs(revenueSummary.goalAttainment.gap))} above goal
                        </span>
                      </>
                    )}
                  </div>
                )}
                {revenueSummary.goalAttainment.suggestedActionsCount > 0 && (
                  <div className="text-sm text-center text-muted-foreground">
                    {revenueSummary.goalAttainment.suggestedActionsCount} suggested actions available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Confidence Interval */}
      {revenueSummary.confidenceInterval && (
        <Card>
          <CardHeader>
            <CardTitle>Revenue Confidence Interval</CardTitle>
            <CardDescription>
              Range of expected revenue with 95% confidence
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-center">
                <div className="text-xl font-bold text-orange-500">
                  {formatCurrency(revenueSummary.confidenceInterval.min)}
                </div>
                <div className="text-xs text-muted-foreground">Minimum</div>
              </div>
              <div className="flex-1 mx-8">
                <div className="relative h-4 bg-gradient-to-r from-orange-200 via-green-200 to-orange-200 rounded">
                  <div
                    className="absolute h-full w-1 bg-[#053e67] rounded"
                    style={{
                      left: `${((revenueSummary.next3MonthsRevenue - revenueSummary.confidenceInterval.min) /
                        (revenueSummary.confidenceInterval.max - revenueSummary.confidenceInterval.min)) * 100}%`,
                    }}
                  />
                </div>
                <div className="text-center mt-2">
                  <span className="text-sm font-medium">
                    Expected: {formatCurrency(revenueSummary.next3MonthsRevenue)}
                  </span>
                </div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-green-600">
                  {formatCurrency(revenueSummary.confidenceInterval.max)}
                </div>
                <div className="text-xs text-muted-foreground">Maximum</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scenarios */}
      {scenarios?.scenarios && scenarios.scenarios.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Revenue Scenarios</CardTitle>
            <CardDescription>
              Different outcomes based on market conditions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {scenarios.scenarios.map((scenario, i) => (
                <div
                  key={i}
                  className={`border rounded-lg p-4 ${
                    scenario.scenario === 'optimistic'
                      ? 'border-green-200 bg-green-50'
                      : scenario.scenario === 'pessimistic'
                      ? 'border-red-200 bg-red-50'
                      : 'border-blue-200 bg-blue-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium capitalize">{scenario.scenario}</span>
                    <Badge
                      variant={
                        scenario.scenario === 'optimistic'
                          ? 'default'
                          : scenario.scenario === 'pessimistic'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {(scenario.probability * 100).toFixed(0)}% likely
                    </Badge>
                  </div>
                  <div className="text-2xl font-bold mb-2">
                    {formatCurrency(scenario.totalRevenue)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {scenario.varianceFromExpected > 0 ? '+' : ''}
                    {formatPercent(scenario.variancePercent)} vs expected
                  </div>
                  {scenario.assumptions && scenario.assumptions.length > 0 && (
                    <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
                      <div className="font-medium mb-1">Key assumptions:</div>
                      {scenario.assumptions.slice(0, 2).map((a, j) => (
                        <div key={j}>• {a.assumption}</div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
