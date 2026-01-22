'use client';

import { useState } from 'react';
import { format, subDays, startOfWeek } from 'date-fns';
import {
  Activity,
  Moon,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Calendar,
  Footprints,
  Flame,
  Clock,
  Target,
  AlertCircle,
  CheckCircle,
  BarChart3,
  Smartphone,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { DeviceConnectionManager } from './DeviceConnectionManager';

interface WearableDataDashboardProps {
  patientId: string;
  compact?: boolean;
}

// Helper function for trend indicators
function TrendIndicator({ value, suffix = '' }: { value: number; suffix?: string }) {
  if (value > 0) {
    return (
      <span className="flex items-center gap-1 text-green-600 text-sm">
        <TrendingUp className="h-3 w-3" />
        +{value}{suffix}
      </span>
    );
  }
  if (value < 0) {
    return (
      <span className="flex items-center gap-1 text-red-600 text-sm">
        <TrendingDown className="h-3 w-3" />
        {value}{suffix}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-stone-500 text-sm">
      <Minus className="h-3 w-3" />
      {value}{suffix}
    </span>
  );
}

// Activity bar chart component
function ActivityBarChart({ data }: { data: Array<{ date: Date; steps: number; goal: number }> }) {
  const maxSteps = Math.max(...data.map(d => Math.max(d.steps, d.goal)), 10000);

  return (
    <TooltipProvider>
      <div className="flex items-end justify-between gap-1 h-32">
        {data.map((day, idx) => {
          const height = (day.steps / maxSteps) * 100;
          const goalHeight = (day.goal / maxSteps) * 100;
          const isMetGoal = day.steps >= day.goal;
          const dayLabel = format(day.date, 'EEE');

          return (
            <Tooltip key={idx}>
              <TooltipTrigger className="flex-1 flex flex-col items-center gap-1">
                <div className="relative w-full h-24 flex items-end">
                  <div
                    className={cn(
                      'w-full rounded-t transition-all',
                      isMetGoal ? 'bg-green-500' : 'bg-[#053e67]'
                    )}
                    style={{ height: `${height}%` }}
                  />
                  <div
                    className="absolute w-full border-t-2 border-dashed border-amber-400"
                    style={{ bottom: `${goalHeight}%` }}
                  />
                </div>
                <span className="text-xs text-stone-500">{dayLabel}</span>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-sm">
                  <p className="font-medium">{format(day.date, 'MMM d')}</p>
                  <p>{day.steps.toLocaleString()} steps</p>
                  <p className="text-stone-400">Goal: {day.goal.toLocaleString()}</p>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

// Sleep quality visualization
function SleepQualityChart({ data }: { data: Array<{ date: Date; quality: number; duration: number }> }) {
  return (
    <TooltipProvider>
      <div className="space-y-2">
        {data.slice(0, 7).map((night, idx) => (
          <Tooltip key={idx}>
            <TooltipTrigger className="w-full">
              <div className="flex items-center gap-3">
                <span className="text-xs text-stone-500 w-16">
                  {format(night.date, 'EEE MMM d')}
                </span>
                <div className="flex-1 h-4 bg-stone-100 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      night.quality >= 80 ? 'bg-green-500' :
                      night.quality >= 60 ? 'bg-[#053e67]' :
                      night.quality >= 40 ? 'bg-amber-500' : 'bg-red-500'
                    )}
                    style={{ width: `${night.quality}%` }}
                  />
                </div>
                <span className="text-xs font-medium w-12 text-right">
                  {Math.floor(night.duration / 60)}h {night.duration % 60}m
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-sm">
                <p className="font-medium">Sleep Quality: {night.quality}%</p>
                <p>Duration: {Math.floor(night.duration / 60)}h {night.duration % 60}m</p>
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}

// Posture score history
function PostureScoreHistory({ data }: { data: Array<{ date: Date; avgScore: number; alertCount: number }> }) {
  return (
    <TooltipProvider>
      <div className="grid grid-cols-7 gap-1">
        {data.map((day, idx) => {
          const scoreColor = day.avgScore >= 70 ? 'bg-green-500' :
                            day.avgScore >= 50 ? 'bg-amber-500' : 'bg-red-500';
          return (
            <Tooltip key={idx}>
              <TooltipTrigger>
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={cn('w-8 h-8 rounded flex items-center justify-center text-white text-xs font-medium', scoreColor)}
                  >
                    {day.avgScore}
                  </div>
                  <span className="text-[10px] text-stone-400">
                    {format(day.date, 'EEE')}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-sm">
                  <p className="font-medium">{format(day.date, 'MMM d')}</p>
                  <p>Avg Score: {day.avgScore}</p>
                  <p className="text-amber-400">{day.alertCount} alerts</p>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

export function WearableDataDashboard({ patientId, compact = false }: WearableDataDashboardProps) {
  const [dateRange, setDateRange] = useState('7d');
  const [activeTab, setActiveTab] = useState('overview');

  // Calculate date range
  const endDate = new Date();
  const startDate = dateRange === '7d' ? subDays(endDate, 7) :
                    dateRange === '14d' ? subDays(endDate, 14) :
                    dateRange === '30d' ? subDays(endDate, 30) : subDays(endDate, 7);

  // Fetch device connections
  const { data: connections, isLoading: connectionsLoading } = trpc.devices.getConnections.useQuery(
    { patientId },
    { enabled: !!patientId }
  );

  // Fetch activity data
  const { data: activityData, isLoading: activityLoading, refetch: refetchActivity } = trpc.devices.getActivityData.useQuery(
    { patientId, startDate, endDate },
    { enabled: !!patientId }
  );

  // Fetch sleep data
  const { data: sleepData, isLoading: sleepLoading, refetch: refetchSleep } = trpc.devices.getSleepData.useQuery(
    { patientId, startDate, endDate },
    { enabled: !!patientId }
  );

  // Fetch posture data
  const { data: postureData, isLoading: postureLoading, refetch: refetchPosture } = trpc.devices.getPostureData.useQuery(
    { patientId, startDate, endDate },
    { enabled: !!patientId }
  );

  // Fetch weekly progress report
  const { data: weeklyReport } = trpc.devices.getWeeklyProgressReport.useQuery(
    { patientId, weekStartDate: startOfWeek(new Date()) },
    { enabled: !!patientId }
  );

  // Fetch goals
  const { data: goals } = trpc.devices.getGoals.useQuery(
    { patientId },
    { enabled: !!patientId }
  );

  const handleRefreshAll = () => {
    refetchActivity();
    refetchSleep();
    refetchPosture();
    toast.success('Data refreshed');
  };

  const hasConnectedDevices = connections && connections.length > 0;
  const activeConnections = connections?.filter(c => c.status === 'CONNECTED') || [];

  // Loading state
  if (connectionsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // No devices connected state
  if (!hasConnectedDevices) {
    return (
      <Card className="border-stone-200">
        <CardContent className="py-10 text-center">
          <Smartphone className="h-12 w-12 text-stone-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-stone-900 mb-2">
            No Devices Connected
          </h3>
          <p className="text-stone-500 mb-6 max-w-md mx-auto">
            Connect wearable devices to track activity, sleep, and posture data for this patient.
          </p>
          <DeviceConnectionManager patientId={patientId} />
        </CardContent>
      </Card>
    );
  }

  // Prepare chart data
  const stepsGoal = goals?.find(g => g.goalType === 'STEPS')?.targetValue || 10000;
  const activityChartData = activityData?.data?.map(d => ({
    date: d.date,
    steps: d.steps || 0,
    goal: stepsGoal,
  })) || [];

  const sleepChartData = sleepData?.data?.map(d => ({
    date: d.date,
    quality: d.quality || 0,
    duration: d.duration || 0,
  })) || [];

  // Group posture data by day for chart
  const postureByDay = new Map<string, { scores: number[]; alerts: number }>();
  postureData?.data?.forEach(p => {
    const dayKey = format(p.timestamp, 'yyyy-MM-dd');
    if (!postureByDay.has(dayKey)) {
      postureByDay.set(dayKey, { scores: [], alerts: 0 });
    }
    const dayData = postureByDay.get(dayKey)!;
    if (p.score !== null) {
      dayData.scores.push(p.score);
    }
    if (p.isAlert) {
      dayData.alerts++;
    }
  });

  const postureChartData = Array.from(postureByDay.entries())
    .map(([dateStr, data]) => ({
      date: new Date(dateStr),
      avgScore: data.scores.length > 0 ? Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length) : 0,
      alertCount: data.alerts,
    }))
    .slice(0, 7);

  // Summary metrics
  const avgSteps = activityData?.summary?.averageSteps || 0;
  const avgSleepQuality = sleepData?.summary?.averageQuality || 0;
  const avgPostureScore = postureData?.summary?.averageScore || 0;
  const weeklyProgress = weeklyReport?.summary?.overallTrend || 'stable';

  return (
    <div className="space-y-6">
      {/* Header with controls */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-stone-900 flex items-center gap-2">
            <Activity className="h-5 w-5 text-[#053e67]" />
            Wearable Data
          </h2>
          <p className="text-sm text-stone-500">
            {activeConnections.length} device{activeConnections.length !== 1 ? 's' : ''} connected
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="14d">Last 14 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={handleRefreshAll}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Steps summary */}
        <Card className="border-stone-200">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-lg bg-[#053e67]/10">
                <Footprints className="h-5 w-5 text-[#053e67]" />
              </div>
              <TrendIndicator value={0} suffix="%" />
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold text-stone-900">
                {avgSteps.toLocaleString()}
              </p>
              <p className="text-sm text-stone-500">Avg daily steps</p>
            </div>
          </CardContent>
        </Card>

        {/* Sleep summary */}
        <Card className="border-stone-200">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-lg bg-indigo-100">
                <Moon className="h-5 w-5 text-indigo-600" />
              </div>
              <Badge className={cn(
                avgSleepQuality >= 70 ? 'bg-green-100 text-green-700' :
                avgSleepQuality >= 50 ? 'bg-amber-100 text-amber-700' :
                'bg-red-100 text-red-700'
              )}>
                {avgSleepQuality >= 70 ? 'Good' : avgSleepQuality >= 50 ? 'Fair' : 'Poor'}
              </Badge>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold text-stone-900">
                {avgSleepQuality}%
              </p>
              <p className="text-sm text-stone-500">Avg sleep quality</p>
            </div>
          </CardContent>
        </Card>

        {/* Posture summary */}
        <Card className="border-stone-200">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-lg bg-emerald-100">
                <BarChart3 className="h-5 w-5 text-emerald-600" />
              </div>
              <Badge className={cn(
                avgPostureScore >= 70 ? 'bg-green-100 text-green-700' :
                avgPostureScore >= 50 ? 'bg-amber-100 text-amber-700' :
                'bg-red-100 text-red-700'
              )}>
                {avgPostureScore >= 70 ? 'Good' : avgPostureScore >= 50 ? 'Fair' : 'Needs Work'}
              </Badge>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold text-stone-900">
                {avgPostureScore}
              </p>
              <p className="text-sm text-stone-500">Avg posture score</p>
            </div>
          </CardContent>
        </Card>

        {/* Weekly progress */}
        <Card className="border-stone-200">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-lg bg-amber-100">
                <Zap className="h-5 w-5 text-amber-600" />
              </div>
              {weeklyProgress === 'improving' ? (
                <TrendingUp className="h-5 w-5 text-green-600" />
              ) : weeklyProgress === 'declining' ? (
                <TrendingDown className="h-5 w-5 text-red-600" />
              ) : (
                <Minus className="h-5 w-5 text-stone-400" />
              )}
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold text-stone-900 capitalize">
                {weeklyProgress}
              </p>
              <p className="text-sm text-stone-500">Weekly trend</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main content tabs */}
      {!compact && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="sleep">Sleep</TabsTrigger>
            <TabsTrigger value="posture">Posture</TabsTrigger>
            <TabsTrigger value="devices">Devices</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Activity chart */}
              <Card className="border-stone-200">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Footprints className="h-5 w-5 text-[#053e67]" />
                    Daily Steps
                  </CardTitle>
                  <CardDescription>
                    Steps vs goal over the past {dateRange === '7d' ? '7' : dateRange === '14d' ? '14' : '30'} days
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {activityLoading ? (
                    <Skeleton className="h-32 w-full" />
                  ) : activityChartData.length > 0 ? (
                    <ActivityBarChart data={activityChartData.slice(-7)} />
                  ) : (
                    <div className="h-32 flex items-center justify-center text-stone-400">
                      No activity data available
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Sleep chart */}
              <Card className="border-stone-200">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Moon className="h-5 w-5 text-indigo-600" />
                    Sleep Quality
                  </CardTitle>
                  <CardDescription>
                    Nightly sleep quality and duration
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {sleepLoading ? (
                    <Skeleton className="h-32 w-full" />
                  ) : sleepChartData.length > 0 ? (
                    <SleepQualityChart data={sleepChartData} />
                  ) : (
                    <div className="h-32 flex items-center justify-center text-stone-400">
                      No sleep data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Posture history */}
            <Card className="border-stone-200">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-emerald-600" />
                  Posture Score History
                </CardTitle>
                <CardDescription>
                  Daily average posture scores
                </CardDescription>
              </CardHeader>
              <CardContent>
                {postureLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : postureChartData.length > 0 ? (
                  <PostureScoreHistory data={postureChartData} />
                ) : (
                  <div className="h-16 flex items-center justify-center text-stone-400">
                    No posture data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Goals progress */}
            {goals && goals.length > 0 && (
              <Card className="border-stone-200">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Target className="h-5 w-5 text-[#053e67]" />
                    Activity Goals
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {goals.filter(g => g.isActive).map((goal) => {
                      const currentValue = goal.goalType === 'STEPS' ? avgSteps :
                                          goal.goalType === 'ACTIVE_MINUTES' ? (activityData?.summary?.averageActiveMinutes || 0) :
                                          goal.goalType === 'SLEEP_DURATION' ? (sleepData?.summary?.averageDuration || 0) : 0;
                      const progress = Math.min(100, (currentValue / goal.targetValue) * 100);
                      const isAchieved = currentValue >= goal.targetValue;

                      return (
                        <div key={goal.id} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {isAchieved ? (
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              ) : (
                                <AlertCircle className="h-4 w-4 text-amber-500" />
                              )}
                              <span className="font-medium capitalize">
                                {goal.goalType.toLowerCase().replace('_', ' ')}
                              </span>
                            </div>
                            <span className="text-sm text-stone-500">
                              {currentValue.toLocaleString()} / {goal.targetValue.toLocaleString()}
                              {goal.goalType === 'SLEEP_DURATION' ? ' min' : ''}
                            </span>
                          </div>
                          <Progress value={progress} className="h-2" />
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity">
            <Card className="border-stone-200">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5 text-[#053e67]" />
                  Activity Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                {activityLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : activityData?.data && activityData.data.length > 0 ? (
                  <div className="space-y-4">
                    {activityData.data.slice(0, 14).map((day, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-stone-50">
                        <div className="flex items-center gap-4">
                          <Calendar className="h-4 w-4 text-stone-400" />
                          <span className="font-medium">
                            {format(day.date, 'EEEE, MMM d')}
                          </span>
                        </div>
                        <div className="flex items-center gap-6 text-sm">
                          <div className="flex items-center gap-2">
                            <Footprints className="h-4 w-4 text-[#053e67]" />
                            <span>{(day.steps || 0).toLocaleString()} steps</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Flame className="h-4 w-4 text-orange-500" />
                            <span>{day.calories || 0} cal</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-green-600" />
                            <span>{day.activeMinutes || 0} min</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-10 text-center text-stone-400">
                    No activity data for this period
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Sleep Tab */}
          <TabsContent value="sleep">
            <Card className="border-stone-200">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Moon className="h-5 w-5 text-indigo-600" />
                  Sleep Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                {sleepLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : sleepData?.data && sleepData.data.length > 0 ? (
                  <div className="space-y-4">
                    {sleepData.data.slice(0, 14).map((night, idx) => (
                      <div key={idx} className="p-4 rounded-lg bg-stone-50">
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-medium">
                            {format(night.date, 'EEEE, MMM d')}
                          </span>
                          <Badge className={cn(
                            (night.quality ?? 0) >= 70 ? 'bg-green-100 text-green-700' :
                            (night.quality ?? 0) >= 50 ? 'bg-amber-100 text-amber-700' :
                            'bg-red-100 text-red-700'
                          )}>
                            {night.quality ?? 0}% quality
                          </Badge>
                        </div>
                        <div className="grid grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-stone-500">Duration</p>
                            <p className="font-medium">
                              {Math.floor((night.duration || 0) / 60)}h {(night.duration || 0) % 60}m
                            </p>
                          </div>
                          <div>
                            <p className="text-stone-500">Deep Sleep</p>
                            <p className="font-medium">{night.deepMinutes || 0} min</p>
                          </div>
                          <div>
                            <p className="text-stone-500">REM</p>
                            <p className="font-medium">{night.remMinutes || 0} min</p>
                          </div>
                          <div>
                            <p className="text-stone-500">Awakenings</p>
                            <p className="font-medium">{night.awakenings || 0}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-10 text-center text-stone-400">
                    No sleep data for this period
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Posture Tab */}
          <TabsContent value="posture">
            <Card className="border-stone-200">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-emerald-600" />
                  Posture Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                {postureLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : postureChartData.length > 0 ? (
                  <div className="space-y-4">
                    {postureChartData.map((day, idx) => (
                      <div key={idx} className="p-4 rounded-lg bg-stone-50">
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-medium">
                            {format(day.date, 'EEEE, MMM d')}
                          </span>
                          <div className={cn(
                            'px-3 py-1 rounded-full text-sm font-medium',
                            day.avgScore >= 70 ? 'bg-green-100 text-green-700' :
                            day.avgScore >= 50 ? 'bg-amber-100 text-amber-700' :
                            'bg-red-100 text-red-700'
                          )}>
                            Score: {day.avgScore}
                          </div>
                        </div>
                        <div className="text-sm">
                          <span className="text-amber-600">{day.alertCount} posture alerts</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-10 text-center text-stone-400">
                    No posture data for this period
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Devices Tab */}
          <TabsContent value="devices">
            <DeviceConnectionManager patientId={patientId} showFullList />
          </TabsContent>
        </Tabs>
      )}

      {/* Compact mode - just show device manager button */}
      {compact && (
        <div className="flex justify-end">
          <DeviceConnectionManager patientId={patientId} />
        </div>
      )}
    </div>
  );
}
