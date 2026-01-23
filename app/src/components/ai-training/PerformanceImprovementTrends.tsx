'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  LineChart,
  Target,
  Award,
  Calendar,
  ArrowUp,
  ArrowDown,
  Activity,
  Zap,
  Clock,
  CheckCircle,
  Star,
} from 'lucide-react';

interface CategoryTrend {
  category: string;
  current: number;
  previous: number;
  change: number;
  trend: 'improving' | 'stable' | 'declining';
}

interface TimelineDataPoint {
  date: string;
  overall: number;
  tone: number;
  empathy: number;
  scriptAdherence: number;
  timing: number;
}

interface PerformanceData {
  currentPeriod: {
    overall: number;
    tone: number;
    empathy: number;
    scriptAdherence: number;
    timing: number;
    problemSolving: number;
    professionalism: number;
  };
  previousPeriod: {
    overall: number;
    tone: number;
    empathy: number;
    scriptAdherence: number;
    timing: number;
    problemSolving: number;
    professionalism: number;
  };
  trends: CategoryTrend[];
  timeline: TimelineDataPoint[];
  insights: string[];
  topStrength: string;
  primaryWeakness: string;
}

// Demo data for performance trends
const demoPerformanceData: PerformanceData = {
  currentPeriod: {
    overall: 82,
    tone: 88,
    empathy: 79,
    scriptAdherence: 85,
    timing: 76,
    problemSolving: 81,
    professionalism: 86,
  },
  previousPeriod: {
    overall: 75,
    tone: 82,
    empathy: 72,
    scriptAdherence: 78,
    timing: 71,
    problemSolving: 74,
    professionalism: 80,
  },
  trends: [
    { category: 'Overall', current: 82, previous: 75, change: 9.3, trend: 'improving' },
    { category: 'Tone', current: 88, previous: 82, change: 7.3, trend: 'improving' },
    { category: 'Empathy', current: 79, previous: 72, change: 9.7, trend: 'improving' },
    { category: 'Script Adherence', current: 85, previous: 78, change: 9.0, trend: 'improving' },
    { category: 'Timing', current: 76, previous: 71, change: 7.0, trend: 'improving' },
    { category: 'Problem Solving', current: 81, previous: 74, change: 9.5, trend: 'improving' },
    { category: 'Professionalism', current: 86, previous: 80, change: 7.5, trend: 'improving' },
  ],
  timeline: [
    { date: '2024-01-01', overall: 70, tone: 75, empathy: 68, scriptAdherence: 72, timing: 65 },
    { date: '2024-01-08', overall: 73, tone: 78, empathy: 70, scriptAdherence: 75, timing: 68 },
    { date: '2024-01-15', overall: 76, tone: 82, empathy: 73, scriptAdherence: 78, timing: 71 },
    { date: '2024-01-22', overall: 79, tone: 85, empathy: 76, scriptAdherence: 82, timing: 73 },
    { date: '2024-01-29', overall: 82, tone: 88, empathy: 79, scriptAdherence: 85, timing: 76 },
  ],
  insights: [
    'Significant improvement in empathy scores (+9.7%) over the past 30 days',
    'Script adherence has improved consistently week over week',
    'Timing remains an area for improvement - consider micro-learning modules',
    'Strongest performance on complaint handling scenarios',
  ],
  topStrength: 'Tone',
  primaryWeakness: 'Timing',
};

function getTrendIcon(trend: CategoryTrend['trend']) {
  switch (trend) {
    case 'improving':
      return <TrendingUp className="h-4 w-4 text-green-600" />;
    case 'declining':
      return <TrendingDown className="h-4 w-4 text-red-600" />;
    case 'stable':
      return <Minus className="h-4 w-4 text-gray-500" />;
  }
}

function getTrendBadge(trend: CategoryTrend['trend'], change: number) {
  const absChange = Math.abs(change).toFixed(1);
  switch (trend) {
    case 'improving':
      return (
        <Badge className="bg-green-100 text-green-700">
          <ArrowUp className="h-3 w-3 mr-1" />
          +{absChange}%
        </Badge>
      );
    case 'declining':
      return (
        <Badge className="bg-red-100 text-red-700">
          <ArrowDown className="h-3 w-3 mr-1" />
          -{absChange}%
        </Badge>
      );
    case 'stable':
      return (
        <Badge variant="secondary">
          <Minus className="h-3 w-3 mr-1" />
          {absChange}%
        </Badge>
      );
  }
}

function getScoreColor(score: number): string {
  if (score >= 85) return 'text-green-600';
  if (score >= 70) return 'text-yellow-600';
  return 'text-red-600';
}

function getProgressColor(score: number): string {
  if (score >= 85) return '[&>div]:bg-green-500';
  if (score >= 70) return '[&>div]:bg-yellow-500';
  return '[&>div]:bg-red-500';
}

interface PerformanceImprovementTrendsProps {
  userId?: string;
  showDemoData?: boolean;
}

export function PerformanceImprovementTrends({
  userId,
  showDemoData = true,
}: PerformanceImprovementTrendsProps) {
  const [timePeriod, setTimePeriod] = useState('30');

  // Use demo data
  const data = showDemoData ? demoPerformanceData : null;
  const isLoading = false;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No performance data available</p>
          <p className="text-sm">Complete practice sessions to see trends</p>
        </CardContent>
      </Card>
    );
  }

  const overallChange = data.currentPeriod.overall - data.previousPeriod.overall;
  const overallTrend = overallChange > 2 ? 'improving' : overallChange < -2 ? 'declining' : 'stable';

  return (
    <div className="space-y-4">
      {/* Overall Performance Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Performance Improvement Trends
              </CardTitle>
              <CardDescription>Track progress and identify areas for improvement</CardDescription>
            </div>

            <Select value={timePeriod} onValueChange={setTimePeriod}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Time Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {/* Overall Score with Trend */}
          <div className="grid gap-4 md:grid-cols-3 mb-6">
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Overall Score</p>
                    <p className={`text-3xl font-bold ${getScoreColor(data.currentPeriod.overall)}`}>
                      {data.currentPeriod.overall}%
                    </p>
                  </div>
                  <div className="text-right">
                    {getTrendBadge(overallTrend as CategoryTrend['trend'], overallChange)}
                    <p className="text-xs text-muted-foreground mt-1">vs previous period</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-50 to-green-100">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Top Strength</p>
                    <p className="text-xl font-bold text-green-700">{data.topStrength}</p>
                    <p className="text-xs text-muted-foreground">
                      {data.currentPeriod[data.topStrength.toLowerCase() as keyof typeof data.currentPeriod]}% avg
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-orange-50 to-orange-100">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-orange-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Focus Area</p>
                    <p className="text-xl font-bold text-orange-700">{data.primaryWeakness}</p>
                    <p className="text-xs text-muted-foreground">
                      {data.currentPeriod[data.primaryWeakness.toLowerCase() as keyof typeof data.currentPeriod]}% avg
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Category Breakdown */}
          <div className="space-y-4">
            <h4 className="font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Category Breakdown
            </h4>

            <div className="space-y-3">
              {data.trends.map((trend) => (
                <div key={trend.category} className="p-3 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getTrendIcon(trend.trend)}
                      <span className="font-medium">{trend.category}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`font-bold ${getScoreColor(trend.current)}`}>
                        {trend.current}%
                      </span>
                      {getTrendBadge(trend.trend, trend.change)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Progress
                      value={trend.current}
                      className={`h-2 flex-1 ${getProgressColor(trend.current)}`}
                    />
                    <span className="text-xs text-muted-foreground w-16 text-right">
                      was {trend.previous}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline Chart Placeholder */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LineChart className="h-5 w-5" />
            Performance Over Time
          </CardTitle>
          <CardDescription>Weekly score progression</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Simple visual timeline */}
          <div className="space-y-4">
            <div className="flex items-end justify-between h-32 border-b border-l pl-8 pb-2">
              {data.timeline.map((point, index) => {
                const height = (point.overall / 100) * 100;
                return (
                  <div key={index} className="flex flex-col items-center gap-1">
                    <div
                      className="w-8 bg-primary rounded-t transition-all duration-300"
                      style={{ height: `${height}%` }}
                    />
                    <span className="text-xs font-medium">{point.overall}%</span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between px-8 text-xs text-muted-foreground">
              {data.timeline.map((point, index) => (
                <span key={index}>
                  {new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            AI-Generated Insights
          </CardTitle>
          <CardDescription>Personalized recommendations based on your performance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {data.insights.map((insight, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-3 bg-muted rounded-lg"
              >
                <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <p className="text-sm">{insight}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="flex-1">
              <Clock className="h-4 w-4 mr-2" />
              View Micro-Learning
            </Button>
            <Button className="flex-1">
              <Target className="h-4 w-4 mr-2" />
              Set Improvement Goal
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
