'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Calculator,
  Target,
  DollarSign,
  ArrowRight,
  Lightbulb,
  Scale,
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

export function ScenarioComparisonTool() {
  const [goalType, setGoalType] = useState<'monthly' | 'quarterly' | 'annual'>('quarterly');
  const [goalAmount, setGoalAmount] = useState<number>(100000);
  const [comparisonPeriod, setComparisonPeriod] = useState<'vs_last_month' | 'vs_last_quarter' | 'vs_last_year'>('vs_last_quarter');

  const { data: scenarios, isLoading: scenariosLoading } = trpc.aiPredict.getRevenueScenarios.useQuery(
    { forecastMonths: goalType === 'monthly' ? 1 : goalType === 'quarterly' ? 3 : 12 },
    { refetchOnWindowFocus: false }
  );

  const { data: goalAttainment, isLoading: goalLoading } = trpc.aiPredict.getGoalAttainment.useQuery(
    {
      goals: [{ type: goalType, amount: goalAmount, period: 'current' }],
      forecastMonths: goalType === 'monthly' ? 1 : goalType === 'quarterly' ? 3 : 12,
    },
    { refetchOnWindowFocus: false }
  );

  const { data: trendComparison, isLoading: comparisonLoading } = trpc.aiPredict.compareTrends.useQuery(
    {
      metricType: 'revenue',
      period1: {
        start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        end: new Date(),
        label: 'Current Period',
      },
      period2: {
        start: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
        end: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        label: 'Previous Period',
      },
    },
    { refetchOnWindowFocus: false }
  );

  if (scenariosLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-[200px] w-full" />
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-[250px] w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Goal Setting */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Goal Analysis
          </CardTitle>
          <CardDescription>
            Set a revenue goal and see the probability of achieving it
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-3 mb-6">
            <div>
              <Label htmlFor="goalType">Goal Period</Label>
              <Select value={goalType} onValueChange={(v) => setGoalType(v as typeof goalType)}>
                <SelectTrigger id="goalType" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="goalAmount">Goal Amount</Label>
              <div className="relative mt-1">
                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="goalAmount"
                  type="number"
                  value={goalAmount}
                  onChange={(e) => setGoalAmount(parseInt(e.target.value) || 0)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex items-end">
              <Button className="w-full">
                <Calculator className="h-4 w-4 mr-2" />
                Calculate
              </Button>
            </div>
          </div>

          {goalAttainment?.goalAttainment && goalAttainment.goalAttainment.length > 0 && (
            <div className="border rounded-lg p-6 bg-muted/50">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="text-center">
                  <div className="text-5xl font-bold text-[#053e67]">
                    {(goalAttainment.goalAttainment[0].probability * 100).toFixed(0)}%
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Probability of hitting {formatCurrency(goalAmount)}
                  </div>
                </div>
                <div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Predicted Revenue</span>
                      <span className="font-medium">
                        {formatCurrency(goalAttainment.goalAttainment[0].predictedAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Gap to Goal</span>
                      <span
                        className={`font-medium ${
                          goalAttainment.goalAttainment[0].gap > 0
                            ? 'text-red-600'
                            : 'text-green-600'
                        }`}
                      >
                        {formatCurrency(Math.abs(goalAttainment.goalAttainment[0].gap))}
                        {goalAttainment.goalAttainment[0].gap > 0 ? ' below' : ' above'}
                      </span>
                    </div>
                  </div>

                  {goalAttainment.goalAttainment[0].suggestedActions.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <div className="flex items-center gap-2 mb-2">
                        <Lightbulb className="h-4 w-4 text-yellow-500" />
                        <span className="text-sm font-medium">Suggested Actions</span>
                      </div>
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        {goalAttainment.goalAttainment[0].suggestedActions.slice(0, 3).map((action, i) => (
                          <li key={i} className="flex items-center gap-2">
                            <ArrowRight className="h-3 w-3" />
                            <span>{action.action}</span>
                            <Badge variant="outline" className="text-xs">
                              +{formatCurrency(action.estimatedImpact)}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scenario Comparison */}
      {scenarios?.scenarios && scenarios.scenarios.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5" />
              Revenue Scenarios
            </CardTitle>
            <CardDescription>
              Compare different outcome scenarios based on market conditions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {scenarios.scenarios.map((scenario, i) => {
                const isOptimistic = scenario.scenario === 'optimistic';
                const isPessimistic = scenario.scenario === 'pessimistic';
                const isExpected = scenario.scenario === 'expected';

                return (
                  <div
                    key={i}
                    className={`border rounded-lg p-6 ${
                      isOptimistic
                        ? 'border-green-200 bg-green-50'
                        : isPessimistic
                        ? 'border-red-200 bg-red-50'
                        : 'border-blue-200 bg-blue-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold capitalize">{scenario.scenario}</h3>
                      <Badge
                        variant={isOptimistic ? 'default' : isPessimistic ? 'destructive' : 'secondary'}
                      >
                        {(scenario.probability * 100).toFixed(0)}% likely
                      </Badge>
                    </div>

                    <div className="text-3xl font-bold mb-2">
                      {formatCurrency(scenario.totalRevenue)}
                    </div>

                    <div
                      className={`text-sm mb-4 ${
                        scenario.varianceFromExpected > 0
                          ? 'text-green-600'
                          : scenario.varianceFromExpected < 0
                          ? 'text-red-600'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {formatPercent(scenario.variancePercent)} vs expected
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Charges</span>
                        <span>{formatCurrency(scenario.chargesRevenue)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Collections</span>
                        <span>{formatCurrency(scenario.collectionsRevenue)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">AR Recovery</span>
                        <span>{formatCurrency(scenario.arRecovery)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">New Patients</span>
                        <span>{formatCurrency(scenario.newPatientRevenue)}</span>
                      </div>
                    </div>

                    {scenario.assumptions && scenario.assumptions.length > 0 && (
                      <div className="mt-4 pt-4 border-t">
                        <div className="text-xs font-medium mb-2">Key Assumptions:</div>
                        <ul className="space-y-1 text-xs text-muted-foreground">
                          {scenario.assumptions.slice(0, 3).map((assumption, j) => (
                            <li key={j}>• {assumption.assumption}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Period Comparison */}
      {trendComparison && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Period Comparison
            </CardTitle>
            <CardDescription>
              Compare revenue performance between time periods
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              {/* Period 1 */}
              <div className="border rounded-lg p-4">
                <div className="text-sm text-muted-foreground mb-1">
                  {trendComparison.period1.label}
                </div>
                <div className="text-2xl font-bold">
                  {formatCurrency(trendComparison.period1Value)}
                </div>
              </div>

              {/* Period 2 */}
              <div className="border rounded-lg p-4">
                <div className="text-sm text-muted-foreground mb-1">
                  {trendComparison.period2.label}
                </div>
                <div className="text-2xl font-bold">
                  {formatCurrency(trendComparison.period2Value)}
                </div>
              </div>
            </div>

            {/* Comparison Results */}
            <div className="mt-6 p-4 bg-muted rounded-lg">
              <div className="flex items-center justify-between mb-4">
                <span className="font-medium">Change</span>
                <div className="flex items-center gap-2">
                  {trendComparison.percentChange > 0 ? (
                    <TrendingUp className="h-5 w-5 text-green-500" />
                  ) : trendComparison.percentChange < 0 ? (
                    <TrendingDown className="h-5 w-5 text-red-500" />
                  ) : null}
                  <span
                    className={`text-xl font-bold ${
                      trendComparison.percentChange > 0
                        ? 'text-green-600'
                        : trendComparison.percentChange < 0
                        ? 'text-red-600'
                        : ''
                    }`}
                  >
                    {formatPercent(trendComparison.percentChange)}
                  </span>
                  <span className="text-muted-foreground">
                    ({formatCurrency(Math.abs(trendComparison.absoluteChange))})
                  </span>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">{trendComparison.interpretation}</p>

              {trendComparison.isSignificant && (
                <Badge variant="default" className="mt-2">
                  Statistically Significant
                </Badge>
              )}

              <div className="mt-4 pt-4 border-t">
                <div className="text-sm">
                  <span className="text-muted-foreground">vs Historical Average: </span>
                  <span
                    className={
                      trendComparison.vsHistoricalPercent > 0 ? 'text-green-600' : 'text-red-600'
                    }
                  >
                    {formatPercent(trendComparison.vsHistoricalPercent)}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* What-If Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            What-If Analysis
          </CardTitle>
          <CardDescription>
            Explore how changes in key metrics could impact revenue
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* New Patient Impact */}
            <div className="border rounded-lg p-4">
              <h4 className="font-medium mb-3">New Patient Impact</h4>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>+5 new patients/month</span>
                  <span className="text-green-600">
                    +{formatCurrency(5 * 500 * 3)} / quarter
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>+10 new patients/month</span>
                  <span className="text-green-600">
                    +{formatCurrency(10 * 500 * 3)} / quarter
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>+20 new patients/month</span>
                  <span className="text-green-600">
                    +{formatCurrency(20 * 500 * 3)} / quarter
                  </span>
                </div>
              </div>
            </div>

            {/* Retention Impact */}
            <div className="border rounded-lg p-4">
              <h4 className="font-medium mb-3">Retention Impact</h4>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>+5% retention rate</span>
                  <span className="text-green-600">
                    +{formatCurrency(scenarios?.expectedScenario?.totalRevenue ? scenarios.expectedScenario.totalRevenue * 0.05 : 5000)} / quarter
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>+10% retention rate</span>
                  <span className="text-green-600">
                    +{formatCurrency(scenarios?.expectedScenario?.totalRevenue ? scenarios.expectedScenario.totalRevenue * 0.10 : 10000)} / quarter
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>-10% churn rate</span>
                  <span className="text-green-600">
                    +{formatCurrency(scenarios?.expectedScenario?.totalRevenue ? scenarios.expectedScenario.totalRevenue * 0.08 : 8000)} / quarter
                  </span>
                </div>
              </div>
            </div>

            {/* Visit Frequency Impact */}
            <div className="border rounded-lg p-4">
              <h4 className="font-medium mb-3">Visit Frequency Impact</h4>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>+0.5 visits/patient</span>
                  <span className="text-green-600">
                    +{formatCurrency(0.5 * 100 * 100)} / quarter
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>+1 visit/patient</span>
                  <span className="text-green-600">
                    +{formatCurrency(1 * 100 * 100)} / quarter
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>-25% no-show rate</span>
                  <span className="text-green-600">
                    +{formatCurrency(scenarios?.expectedScenario?.totalRevenue ? scenarios.expectedScenario.totalRevenue * 0.03 : 3000)} / quarter
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg text-sm text-blue-800">
            <Lightbulb className="h-4 w-4 inline mr-2" />
            These estimates are based on your practice's historical data and industry benchmarks.
            Actual results may vary based on market conditions and implementation.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
