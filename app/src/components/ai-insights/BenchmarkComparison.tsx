'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/trpc/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  Trophy,
  AlertTriangle,
  Target,
} from 'lucide-react';

const metricLabels: Record<string, string> = {
  collectionRate: 'Collection Rate',
  noShowRate: 'No-Show Rate',
  patientRetention: 'Patient Retention',
  avgVisitValue: 'Avg Visit Value',
  denialRate: 'Denial Rate',
  newPatientRate: 'New Patient Rate',
  reactivationRate: 'Reactivation Rate',
};

const metricDescriptions: Record<string, string> = {
  collectionRate: 'Percentage of billed charges collected',
  noShowRate: 'Percentage of appointments missed',
  patientRetention: 'Percentage of patients who return within 90 days',
  avgVisitValue: 'Average revenue per patient visit',
  denialRate: 'Percentage of claims denied by payers',
  newPatientRate: 'Monthly new patient acquisition rate',
  reactivationRate: 'Success rate of reactivating dormant patients',
};

const formatValue = (metric: string, value: number): string => {
  if (metric === 'avgVisitValue') {
    return `$${value.toFixed(0)}`;
  }
  return `${value.toFixed(1)}%`;
};

const getComparisonIcon = (performance: string) => {
  switch (performance) {
    case 'above':
      return <TrendingUp className="h-4 w-4 text-green-500" />;
    case 'below':
      return <TrendingDown className="h-4 w-4 text-red-500" />;
    default:
      return <Minus className="h-4 w-4 text-gray-500" />;
  }
};

const getPerformanceBadge = (performance: string) => {
  switch (performance) {
    case 'above':
      return <Badge className="bg-green-500 text-white">Above Benchmark</Badge>;
    case 'below':
      return <Badge className="bg-red-500 text-white">Below Benchmark</Badge>;
    default:
      return <Badge variant="secondary">At Benchmark</Badge>;
  }
};

export function BenchmarkComparison() {
  const { data: benchmarks, isLoading } = trpc.aiInsights.getBenchmarks.useQuery(
    undefined,
    { refetchOnWindowFocus: false }
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!benchmarks || benchmarks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Industry Benchmarks
          </CardTitle>
          <CardDescription>
            Compare your practice to industry standards
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No benchmark data available</p>
            <p className="text-sm">Benchmarks require at least 30 days of data</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate overall performance
  const aboveCount = benchmarks.filter(b => b.performance === 'above').length;
  const belowCount = benchmarks.filter(b => b.performance === 'below').length;
  const overallScore = ((aboveCount / benchmarks.length) * 100).toFixed(0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Industry Benchmarks
            </CardTitle>
            <CardDescription>
              Compare your practice to chiropractic industry standards
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2">
              {Number(overallScore) >= 70 ? (
                <Trophy className="h-5 w-5 text-yellow-500" />
              ) : Number(overallScore) < 40 ? (
                <AlertTriangle className="h-5 w-5 text-red-500" />
              ) : (
                <Target className="h-5 w-5 text-blue-500" />
              )}
              <span className="text-2xl font-bold">{overallScore}%</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Above benchmark on {aboveCount}/{benchmarks.length} metrics
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {benchmarks.map((benchmark) => {
            // Calculate position on the scale (0-100%)
            const range = benchmark.industryMedian * 2; // Assume benchmark is middle
            const position = Math.min(100, Math.max(0, (benchmark.practiceValue / range) * 100));
            const benchmarkPosition = 50; // Benchmark is always at 50%

            // For metrics where lower is better (like noShowRate, denialRate)
            const lowerIsBetter = ['No-Show Rate', 'Denial Rate', 'Avg Days to Collect'].includes(benchmark.metricName);
            const isGood = lowerIsBetter
              ? benchmark.practiceValue <= benchmark.industryMedian
              : benchmark.practiceValue >= benchmark.industryMedian;

            return (
              <div key={benchmark.metricName} className="border rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">
                        {benchmark.metricName}
                      </h4>
                      {getComparisonIcon(benchmark.performance)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Your value: {benchmark.practiceValue.toFixed(1)} | Industry median: {benchmark.industryMedian.toFixed(1)}
                    </p>
                  </div>
                  {getPerformanceBadge(benchmark.performance)}
                </div>

                {/* Visual comparison bar */}
                <div className="relative mt-4 mb-2">
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    {/* Your value indicator */}
                    <div
                      className={`absolute h-3 w-3 rounded-full top-0 transform -translate-x-1/2 z-10 ${
                        isGood ? 'bg-green-500' : 'bg-red-500'
                      }`}
                      style={{ left: `${position}%` }}
                    />
                    {/* Benchmark indicator */}
                    <div
                      className="absolute h-5 w-0.5 bg-gray-400 top-1/2 transform -translate-y-1/2 -translate-x-1/2"
                      style={{ left: `${benchmarkPosition}%` }}
                    />
                    {/* Fill up to your value */}
                    <div
                      className={`h-full ${isGood ? 'bg-green-200' : 'bg-red-200'}`}
                      style={{ width: `${position}%` }}
                    />
                  </div>
                </div>

                {/* Values */}
                <div className="flex justify-between text-sm">
                  <div>
                    <span className="text-muted-foreground">Your Value: </span>
                    <span className={`font-medium ${isGood ? 'text-green-600' : 'text-red-600'}`}>
                      {benchmark.practiceValue.toFixed(1)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Benchmark: </span>
                    <span className="font-medium">
                      {benchmark.industryMedian.toFixed(1)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Gap: </span>
                    <span className={`font-medium ${
                      (lowerIsBetter ? benchmark.gap < 0 : benchmark.gap > 0)
                        ? 'text-green-600'
                        : benchmark.gap === 0
                          ? 'text-gray-600'
                          : 'text-red-600'
                    }`}>
                      {benchmark.gap > 0 ? '+' : ''}{benchmark.gap.toFixed(1)} ({benchmark.gapPercent.toFixed(0)}%)
                    </span>
                  </div>
                </div>

                {/* Percentile rank */}
                <div className="mt-3 p-2 bg-muted rounded text-sm">
                  <span className="font-medium">Percentile Rank: </span>
                  {benchmark.percentileRank.toFixed(0)}th percentile | Trend: {benchmark.trendDirection}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-6 p-3 bg-muted/50 rounded-lg">
          <p className="text-sm font-medium mb-2">Understanding Benchmarks</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              Your performance
            </div>
            <div className="flex items-center gap-1">
              <div className="h-4 w-0.5 bg-gray-400" />
              Industry benchmark
            </div>
            <div className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-green-500" />
              Above benchmark
            </div>
            <div className="flex items-center gap-1">
              <TrendingDown className="h-3 w-3 text-red-500" />
              Below benchmark
            </div>
            <div className="flex items-center gap-1">
              <Minus className="h-3 w-3 text-gray-500" />
              At benchmark
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
