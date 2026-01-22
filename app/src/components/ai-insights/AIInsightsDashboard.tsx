'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Brain,
  RefreshCw,
  AlertTriangle,
  Users,
  DollarSign,
  Lightbulb,
  BarChart3,
  Zap,
  Clock,
  Target,
  Calendar,
  CheckCircle,
  AlertCircle,
  Activity,
  LineChart,
  ArrowUpRight,
  ArrowDownRight,
  Shield,
  Gauge,
  ChevronRight,
  Play,
  Info,
} from 'lucide-react';
import { AnomalyAlerts } from './AnomalyAlerts';
import { ChurnRiskList } from './ChurnRiskList';
import { RevenueOpportunities } from './RevenueOpportunities';
import { NLQueryInterface } from './NLQueryInterface';
import { Recommendations } from './Recommendations';
import { BenchmarkComparison } from './BenchmarkComparison';

// [DEMO] Demo data for the comprehensive dashboard
const demoHealthScore = {
  overall: 78,
  trend: 'up' as const,
  trendValue: 5,
  lastUpdated: new Date().toISOString(),
  breakdown: [
    { name: 'Patient Retention', score: 82, weight: 0.25, benchmark: 75, trend: 'up' },
    { name: 'Revenue Growth', score: 71, weight: 0.20, benchmark: 70, trend: 'up' },
    { name: 'Claim Success Rate', score: 88, weight: 0.20, benchmark: 85, trend: 'stable' },
    { name: 'Scheduling Efficiency', score: 65, weight: 0.15, benchmark: 70, trend: 'down' },
    { name: 'Patient Satisfaction', score: 85, weight: 0.10, benchmark: 80, trend: 'up' },
    { name: 'Billing Accuracy', score: 74, weight: 0.10, benchmark: 78, trend: 'stable' },
  ],
};

const demoInsightCards = [
  {
    id: 'rev-1',
    type: 'revenue',
    title: '[DEMO] Revenue Opportunity Detected',
    description: '23 patients have unused insurance benefits expiring this month',
    impact: '$4,850',
    priority: 'HIGH',
    actionLabel: 'Send Reminder Campaign',
    icon: DollarSign,
  },
  {
    id: 'ret-1',
    type: 'retention',
    title: '[DEMO] Patient Retention Risk',
    description: '8 high-value patients haven\'t scheduled follow-ups',
    impact: '$2,400/month',
    priority: 'CRITICAL',
    actionLabel: 'View At-Risk Patients',
    icon: Users,
  },
  {
    id: 'sch-1',
    type: 'scheduling',
    title: '[DEMO] Scheduling Gap Identified',
    description: 'Tuesday afternoons have 40% fewer bookings than average',
    impact: '+$1,200/week',
    priority: 'MEDIUM',
    actionLabel: 'Optimize Schedule',
    icon: Calendar,
  },
  {
    id: 'bil-1',
    type: 'billing',
    title: '[DEMO] Billing Optimization',
    description: '12 claims could be upgraded with proper documentation',
    impact: '$3,200',
    priority: 'HIGH',
    actionLabel: 'Review Claims',
    icon: AlertCircle,
  },
  {
    id: 'comp-1',
    type: 'compliance',
    title: '[DEMO] Compliance Alert',
    description: '5 patient records need updated consent forms',
    impact: 'Risk Mitigation',
    priority: 'MEDIUM',
    actionLabel: 'Update Records',
    icon: Shield,
  },
];

const demoPredictiveAnalytics = {
  revenueForecast: {
    days30: { predicted: 48500, confidence: 85, trend: 'up', change: 8.5 },
    days60: { predicted: 97200, confidence: 78, trend: 'up', change: 6.2 },
    days90: { predicted: 142800, confidence: 72, trend: 'stable', change: 3.1 },
  },
  patientVolume: {
    thisWeek: { predicted: 145, actual: null, trend: 'up', change: 5 },
    nextWeek: { predicted: 152, actual: null, trend: 'up', change: 8 },
    nextMonth: { predicted: 612, actual: null, trend: 'stable', change: 2 },
  },
  cashFlow: {
    projected: 38500,
    incoming: 52000,
    outgoing: 13500,
    trend: 'up',
  },
  seasonalTrends: [
    { month: 'Jan', value: 42000, average: 40000 },
    { month: 'Feb', value: 44000, average: 41500 },
    { month: 'Mar', value: 48000, average: 45000 },
    { month: 'Apr', value: 46000, average: 44000 },
    { month: 'May', value: 45000, average: 43000 },
    { month: 'Jun', value: 43000, average: 42000 },
  ],
};

const demoActionItems = [
  {
    id: 'action-1',
    title: '[DEMO] Send reactivation emails to dormant patients',
    description: 'Target 45 patients who haven\'t visited in 90+ days',
    impact: '$6,750 potential revenue',
    effort: 'Low',
    status: 'pending',
    progress: 0,
  },
  {
    id: 'action-2',
    title: '[DEMO] Submit pending insurance claims',
    description: '18 claims ready for submission totaling $12,400',
    impact: 'Faster collections',
    effort: 'Medium',
    status: 'in_progress',
    progress: 35,
  },
  {
    id: 'action-3',
    title: '[DEMO] Schedule follow-up appointments',
    description: 'Contact patients with completed treatment plans',
    impact: '$3,200 recurring revenue',
    effort: 'Low',
    status: 'pending',
    progress: 0,
  },
  {
    id: 'action-4',
    title: '[DEMO] Review denied claims for resubmission',
    description: '7 claims denied that may be recoverable',
    impact: '$2,100 recovery',
    effort: 'Medium',
    status: 'completed',
    progress: 100,
  },
];

const demoComparativeData = {
  weekOverWeek: {
    revenue: { current: 12450, previous: 11200, change: 11.2, trend: 'up' },
    patients: { current: 38, previous: 35, change: 8.6, trend: 'up' },
    newPatients: { current: 5, previous: 4, change: 25, trend: 'up' },
    noShows: { current: 2, previous: 4, change: -50, trend: 'up' },
  },
  monthOverMonth: {
    revenue: { current: 48500, previous: 45200, change: 7.3, trend: 'up' },
    patients: { current: 156, previous: 148, change: 5.4, trend: 'up' },
    newPatients: { current: 18, previous: 22, change: -18.2, trend: 'down' },
    collections: { current: 42500, previous: 38900, change: 9.3, trend: 'up' },
  },
  yearOverYear: {
    revenue: { current: 485000, previous: 420000, change: 15.5, trend: 'up' },
    patients: { current: 1850, previous: 1620, change: 14.2, trend: 'up' },
    avgVisitValue: { current: 165, previous: 152, change: 8.6, trend: 'up' },
    retention: { current: 78, previous: 72, change: 8.3, trend: 'up' },
  },
  goals: [
    { name: 'Monthly Revenue', current: 48500, target: 55000, progress: 88 },
    { name: 'New Patients', current: 18, target: 25, progress: 72 },
    { name: 'Collection Rate', current: 87, target: 92, progress: 95 },
    { name: 'Patient Retention', current: 78, target: 85, progress: 92 },
  ],
};

function HealthScoreGauge({ score, size = 'large' }: { score: number; size?: 'large' | 'small' }) {
  const getScoreColor = (s: number) => {
    if (s >= 80) return 'text-green-600';
    if (s >= 60) return 'text-blue-500';
    return 'text-red-500';
  };

  const getScoreLabel = (s: number) => {
    if (s >= 80) return 'Excellent';
    if (s >= 60) return 'Good';
    if (s >= 40) return 'Fair';
    return 'Needs Attention';
  };

  const circumference = 2 * Math.PI * 45;
  const dashOffset = circumference - (score / 100) * circumference;

  if (size === 'small') {
    return (
      <div className="flex items-center gap-2">
        <div className={`text-2xl font-bold ${getScoreColor(score)}`}>{score}</div>
        <div className="text-sm text-stone-500">/100</div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col items-center">
      <svg className="w-32 h-32 transform -rotate-90">
        <circle
          cx="64"
          cy="64"
          r="45"
          stroke="currentColor"
          strokeWidth="8"
          fill="transparent"
          className="text-stone-200"
        />
        <circle
          cx="64"
          cy="64"
          r="45"
          stroke="currentColor"
          strokeWidth="8"
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          className={getScoreColor(score)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-bold ${getScoreColor(score)}`}>{score}</span>
        <span className="text-xs text-stone-500">out of 100</span>
      </div>
      <Badge className={`mt-2 ${score >= 80 ? 'bg-green-100 text-green-700' : score >= 60 ? 'bg-blue-100 text-[#053e67]' : 'bg-red-100 text-red-700'}`}>
        {getScoreLabel(score)}
      </Badge>
    </div>
  );
}

function TrendIndicator({ trend, value }: { trend: 'up' | 'down' | 'stable'; value?: number }) {
  if (trend === 'up') {
    return (
      <span className="flex items-center gap-1 text-green-600 text-sm">
        <ArrowUpRight className="h-4 w-4" />
        {value !== undefined && `+${value}%`}
      </span>
    );
  }
  if (trend === 'down') {
    return (
      <span className="flex items-center gap-1 text-red-600 text-sm">
        <ArrowDownRight className="h-4 w-4" />
        {value !== undefined && `${value}%`}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-stone-500 text-sm">
      <Activity className="h-4 w-4" />
      {value !== undefined && `${value}%`}
    </span>
  );
}

function InsightCard({ insight, onAction }: { insight: typeof demoInsightCards[0]; onAction: (id: string) => void }) {
  const Icon = insight.icon;
  const priorityColors = {
    CRITICAL: 'border-red-200 bg-red-50',
    HIGH: 'border-blue-200 bg-blue-50',
    MEDIUM: 'border-blue-200 bg-blue-50',
    LOW: 'border-stone-200 bg-stone-50',
  };
  const priorityBadgeColors = {
    CRITICAL: 'bg-red-500 text-white',
    HIGH: 'bg-blue-500 text-white',
    MEDIUM: 'bg-blue-500 text-white',
    LOW: 'bg-stone-500 text-white',
  };

  return (
    <Card className={`${priorityColors[insight.priority as keyof typeof priorityColors]} border-2`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-white shadow-sm">
            <Icon className="h-5 w-5 text-[#053e67]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-medium text-stone-900 truncate">{insight.title}</h4>
              <Badge className={priorityBadgeColors[insight.priority as keyof typeof priorityBadgeColors]}>
                {insight.priority}
              </Badge>
            </div>
            <p className="text-sm text-stone-600 mb-2">{insight.description}</p>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-green-600">Impact: {insight.impact}</span>
              <Button size="sm" className="bg-[#053e67] hover:bg-[#053e67]" onClick={() => onAction(insight.id)}>
                {insight.actionLabel}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PredictiveCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <Card className="border-stone-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-stone-600 flex items-center gap-2">
          <Icon className="h-4 w-4 text-[#053e67]" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function AIInsightsDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [isRunningAnalysis, setIsRunningAnalysis] = useState(false);
  const [actionProgress, setActionProgress] = useState<Record<string, number>>({});

  // For demo purposes, we'll use demo data
  // In production, this would use tRPC queries like:
  // const { data: summary, isLoading: summaryLoading } = trpc.aiInsights.getSummary.useQuery();
  // const { data: churnCounts } = trpc.aiInsights.getChurnCounts.useQuery();
  // const { data: opportunitySummary } = trpc.aiInsights.getOpportunitySummary.useQuery();
  // const { data: recommendationSummary } = trpc.aiInsights.getRecommendationSummary.useQuery();
  const summaryLoading = false;

  const handleRunFullAnalysis = async () => {
    setIsRunningAnalysis(true);
    // Simulate analysis
    setTimeout(() => setIsRunningAnalysis(false), 3000);
  };

  const handleInsightAction = (id: string) => {
    console.log('Action triggered for:', id);
    // In production, this would trigger the appropriate action
  };

  const handleActionItemStart = (id: string) => {
    setActionProgress(prev => ({ ...prev, [id]: 10 }));
    // Simulate progress
    const interval = setInterval(() => {
      setActionProgress(prev => {
        const current = prev[id] || 0;
        if (current >= 100) {
          clearInterval(interval);
          return prev;
        }
        return { ...prev, [id]: Math.min(100, current + 15) };
      });
    }, 500);
  };

  if (summaryLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-stone-900 flex items-center gap-2">
            <Brain className="h-8 w-8 text-[#053e67]" />
            AI Insights Dashboard
          </h1>
          <p className="text-stone-500 mt-1">
            [DEMO] AI-powered analytics and recommendations for your practice
          </p>
        </div>
        <Button
          onClick={handleRunFullAnalysis}
          disabled={isRunningAnalysis}
          className="bg-[#053e67] hover:bg-[#053e67]"
        >
          {isRunningAnalysis ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Zap className="h-4 w-4 mr-2" />
              Run Full Analysis
            </>
          )}
        </Button>
      </div>

      {/* Practice Health Score Section */}
      <Card className="border-stone-200 bg-gradient-to-br from-white to-stone-50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl text-stone-900 flex items-center gap-2">
                <Gauge className="h-5 w-5 text-[#053e67]" />
                [DEMO] Practice Health Score
              </CardTitle>
              <CardDescription>
                Overall health of your practice based on key performance indicators
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-sm text-stone-500">
              <Clock className="h-4 w-4" />
              Updated {new Date(demoHealthScore.lastUpdated).toLocaleDateString()}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Score */}
            <div className="flex flex-col items-center justify-center">
              <HealthScoreGauge score={demoHealthScore.overall} />
              <div className="flex items-center gap-2 mt-2">
                <TrendIndicator trend={demoHealthScore.trend} value={demoHealthScore.trendValue} />
                <span className="text-sm text-stone-500">vs last month</span>
              </div>
            </div>

            {/* Metrics Breakdown */}
            <div className="lg:col-span-2 space-y-3">
              {demoHealthScore.breakdown.map((metric) => (
                <div key={metric.name} className="flex items-center gap-4">
                  <div className="w-36 text-sm font-medium text-stone-700">{metric.name}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Progress value={metric.score} className="flex-1 h-2" />
                      <span className="text-sm font-medium w-12 text-right">{metric.score}</span>
                      <TrendIndicator trend={metric.trend as 'up' | 'down' | 'stable'} />
                    </div>
                  </div>
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge variant={metric.score >= metric.benchmark ? 'default' : 'secondary'} className={metric.score >= metric.benchmark ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-[#053e67]'}>
                        {metric.score >= metric.benchmark ? 'Above' : 'Below'} Benchmark
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      Industry benchmark: {metric.benchmark}
                    </TooltipContent>
                  </Tooltip>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI-Generated Insights Cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-stone-900 flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-[#053e67]" />
            [DEMO] AI-Generated Insights
          </h2>
          <Badge variant="outline" className="text-[#053e67] border-blue-300">
            {demoInsightCards.length} Active Insights
          </Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {demoInsightCards.slice(0, 6).map((insight) => (
            <InsightCard key={insight.id} insight={insight} onAction={handleInsightAction} />
          ))}
        </div>
      </div>

      {/* Predictive Analytics */}
      <Card className="border-stone-200">
        <CardHeader>
          <CardTitle className="text-xl text-stone-900 flex items-center gap-2">
            <LineChart className="h-5 w-5 text-[#053e67]" />
            [DEMO] Predictive Analytics
          </CardTitle>
          <CardDescription>
            AI-powered forecasts based on historical patterns and current trends
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Revenue Forecast */}
            <PredictiveCard title="Revenue Forecast" icon={DollarSign}>
              <div className="space-y-3">
                {Object.entries(demoPredictiveAnalytics.revenueForecast).map(([period, data]) => (
                  <div key={period} className="flex items-center justify-between">
                    <span className="text-sm text-stone-600">
                      {period === 'days30' ? '30 Days' : period === 'days60' ? '60 Days' : '90 Days'}
                    </span>
                    <div className="text-right">
                      <div className="font-semibold text-stone-900">${data.predicted.toLocaleString()}</div>
                      <div className="flex items-center gap-1 text-xs">
                        <TrendIndicator trend={data.trend as 'up' | 'down' | 'stable'} value={data.change} />
                        <span className="text-stone-400">{data.confidence}% conf.</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </PredictiveCard>

            {/* Patient Volume */}
            <PredictiveCard title="Patient Volume" icon={Users}>
              <div className="space-y-3">
                {Object.entries(demoPredictiveAnalytics.patientVolume).map(([period, data]) => (
                  <div key={period} className="flex items-center justify-between">
                    <span className="text-sm text-stone-600">
                      {period === 'thisWeek' ? 'This Week' : period === 'nextWeek' ? 'Next Week' : 'Next Month'}
                    </span>
                    <div className="text-right">
                      <div className="font-semibold text-stone-900">{data.predicted} patients</div>
                      <TrendIndicator trend={data.trend as 'up' | 'down' | 'stable'} value={data.change} />
                    </div>
                  </div>
                ))}
              </div>
            </PredictiveCard>

            {/* Cash Flow */}
            <PredictiveCard title="Cash Flow Projection" icon={Activity}>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">
                  ${demoPredictiveAnalytics.cashFlow.projected.toLocaleString()}
                </div>
                <div className="text-sm text-stone-500 mt-1">Net 30-Day Projection</div>
                <div className="flex justify-between mt-4 text-sm">
                  <div>
                    <div className="text-green-600 font-medium">+${demoPredictiveAnalytics.cashFlow.incoming.toLocaleString()}</div>
                    <div className="text-stone-400">Incoming</div>
                  </div>
                  <div>
                    <div className="text-red-600 font-medium">-${demoPredictiveAnalytics.cashFlow.outgoing.toLocaleString()}</div>
                    <div className="text-stone-400">Outgoing</div>
                  </div>
                </div>
              </div>
            </PredictiveCard>

            {/* Seasonal Trends Chart */}
            <PredictiveCard title="Seasonal Trends" icon={BarChart3}>
              <div className="flex items-end justify-between h-24 gap-1">
                {demoPredictiveAnalytics.seasonalTrends.map((month) => {
                  const maxValue = Math.max(...demoPredictiveAnalytics.seasonalTrends.map(m => m.value));
                  const height = (month.value / maxValue) * 100;
                  const avgHeight = (month.average / maxValue) * 100;
                  return (
                    <Tooltip key={month.month}>
                      <TooltipTrigger className="flex-1 flex flex-col items-center gap-1">
                        <div className="relative w-full h-20 flex items-end">
                          <div
                            className="w-full bg-blue-200 rounded-t"
                            style={{ height: `${height}%` }}
                          />
                          <div
                            className="absolute w-full border-t-2 border-dashed border-stone-400"
                            style={{ bottom: `${avgHeight}%` }}
                          />
                        </div>
                        <span className="text-xs text-stone-500">{month.month}</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div>Actual: ${month.value.toLocaleString()}</div>
                        <div>Average: ${month.average.toLocaleString()}</div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </PredictiveCard>
          </div>
        </CardContent>
      </Card>

      {/* Action Recommendations */}
      <Card className="border-stone-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl text-stone-900 flex items-center gap-2">
                <Target className="h-5 w-5 text-[#053e67]" />
                [DEMO] Prioritized Action Items
              </CardTitle>
              <CardDescription>
                One-click implementation for recommended actions
              </CardDescription>
            </div>
            <Badge className="bg-blue-100 text-[#053e67]">
              {demoActionItems.filter(a => a.status === 'pending').length} Pending Actions
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {demoActionItems.map((action) => {
              const progress = actionProgress[action.id] ?? action.progress;
              const isComplete = progress >= 100;
              return (
                <div
                  key={action.id}
                  className={`p-4 rounded-lg border-2 ${isComplete ? 'border-green-200 bg-green-50' : action.status === 'in_progress' ? 'border-blue-200 bg-blue-50' : 'border-stone-200 bg-white'}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {isComplete ? (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : action.status === 'in_progress' || actionProgress[action.id] ? (
                          <RefreshCw className="h-5 w-5 text-[#053e67] animate-spin" />
                        ) : (
                          <AlertCircle className="h-5 w-5 text-[#053e67]" />
                        )}
                        <h4 className="font-medium text-stone-900">{action.title}</h4>
                      </div>
                      <p className="text-sm text-stone-600 mb-2">{action.description}</p>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-green-600 font-medium">{action.impact}</span>
                        <Badge variant="outline" className="text-stone-600">
                          Effort: {action.effort}
                        </Badge>
                      </div>
                      {progress > 0 && progress < 100 && (
                        <div className="mt-2">
                          <Progress value={progress} className="h-2" />
                          <span className="text-xs text-stone-500 mt-1">{progress}% complete</span>
                        </div>
                      )}
                    </div>
                    <div>
                      {isComplete ? (
                        <Badge className="bg-green-600 text-white">Completed</Badge>
                      ) : actionProgress[action.id] ? (
                        <Badge className="bg-[#053e67] text-white">In Progress</Badge>
                      ) : (
                        <Button
                          size="sm"
                          className="bg-[#053e67] hover:bg-[#053e67]"
                          onClick={() => handleActionItemStart(action.id)}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          Start
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Comparative Analytics */}
      <Card className="border-stone-200">
        <CardHeader>
          <CardTitle className="text-xl text-stone-900 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-[#053e67]" />
            [DEMO] Comparative Analytics
          </CardTitle>
          <CardDescription>
            Track performance across different time periods
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="week" className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-4">
              <TabsTrigger value="week">Week over Week</TabsTrigger>
              <TabsTrigger value="month">Month over Month</TabsTrigger>
              <TabsTrigger value="year">Year over Year</TabsTrigger>
              <TabsTrigger value="goals">Goal Tracking</TabsTrigger>
            </TabsList>

            <TabsContent value="week">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(demoComparativeData.weekOverWeek).map(([key, data]) => (
                  <Card key={key} className="border-stone-200">
                    <CardContent className="p-4">
                      <div className="text-sm text-stone-500 capitalize mb-1">{key.replace(/([A-Z])/g, ' $1')}</div>
                      <div className="text-2xl font-bold text-stone-900">
                        {key.includes('revenue') ? `$${data.current.toLocaleString()}` : data.current}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <TrendIndicator trend={data.trend as 'up' | 'down' | 'stable'} value={Math.abs(data.change)} />
                        <span className="text-xs text-stone-400">
                          vs {key.includes('revenue') ? `$${data.previous.toLocaleString()}` : data.previous}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="month">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(demoComparativeData.monthOverMonth).map(([key, data]) => (
                  <Card key={key} className="border-stone-200">
                    <CardContent className="p-4">
                      <div className="text-sm text-stone-500 capitalize mb-1">{key.replace(/([A-Z])/g, ' $1')}</div>
                      <div className="text-2xl font-bold text-stone-900">
                        {key.includes('revenue') || key.includes('collections') ? `$${data.current.toLocaleString()}` : data.current}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <TrendIndicator trend={data.trend as 'up' | 'down' | 'stable'} value={Math.abs(data.change)} />
                        <span className="text-xs text-stone-400">
                          vs {key.includes('revenue') || key.includes('collections') ? `$${data.previous.toLocaleString()}` : data.previous}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="year">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(demoComparativeData.yearOverYear).map(([key, data]) => (
                  <Card key={key} className="border-stone-200">
                    <CardContent className="p-4">
                      <div className="text-sm text-stone-500 capitalize mb-1">{key.replace(/([A-Z])/g, ' $1')}</div>
                      <div className="text-2xl font-bold text-stone-900">
                        {key.includes('revenue') || key.includes('Value') ? `$${data.current.toLocaleString()}` : key.includes('retention') ? `${data.current}%` : data.current.toLocaleString()}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <TrendIndicator trend={data.trend as 'up' | 'down' | 'stable'} value={Math.abs(data.change)} />
                        <span className="text-xs text-stone-400">
                          vs {key.includes('revenue') || key.includes('Value') ? `$${data.previous.toLocaleString()}` : key.includes('retention') ? `${data.previous}%` : data.previous.toLocaleString()}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="goals">
              <div className="space-y-4">
                {demoComparativeData.goals.map((goal) => (
                  <div key={goal.name} className="p-4 rounded-lg border border-stone-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-stone-900">{goal.name}</span>
                      <span className="text-sm text-stone-500">
                        {goal.name.includes('Revenue') ? `$${goal.current.toLocaleString()}` : goal.name.includes('Rate') || goal.name.includes('Retention') ? `${goal.current}%` : goal.current}
                        {' / '}
                        {goal.name.includes('Revenue') ? `$${goal.target.toLocaleString()}` : goal.name.includes('Rate') || goal.name.includes('Retention') ? `${goal.target}%` : goal.target}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={goal.progress} className="flex-1 h-3" />
                      <span className={`text-sm font-medium ${goal.progress >= 90 ? 'text-green-600' : goal.progress >= 70 ? 'text-[#053e67]' : 'text-red-600'}`}>
                        {goal.progress}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Natural Language Query */}
      <NLQueryInterface />

      {/* Main Content Tabs - Detailed Views */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="overview" className="flex items-center gap-1">
            <AlertTriangle className="h-4 w-4" />
            <span className="hidden sm:inline">Anomalies</span>
          </TabsTrigger>
          <TabsTrigger value="churn" className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Churn Risk</span>
          </TabsTrigger>
          <TabsTrigger value="opportunities" className="flex items-center gap-1">
            <DollarSign className="h-4 w-4" />
            <span className="hidden sm:inline">Opportunities</span>
          </TabsTrigger>
          <TabsTrigger value="recommendations" className="flex items-center gap-1">
            <Lightbulb className="h-4 w-4" />
            <span className="hidden sm:inline">Recommendations</span>
          </TabsTrigger>
          <TabsTrigger value="benchmarks" className="flex items-center gap-1">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Benchmarks</span>
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="overview">
            <AnomalyAlerts />
          </TabsContent>

          <TabsContent value="churn">
            <ChurnRiskList />
          </TabsContent>

          <TabsContent value="opportunities">
            <RevenueOpportunities />
          </TabsContent>

          <TabsContent value="recommendations">
            <Recommendations />
          </TabsContent>

          <TabsContent value="benchmarks">
            <BenchmarkComparison />
          </TabsContent>
        </div>
      </Tabs>

      {/* Analysis timestamp */}
      <Card className="border-stone-200">
        <CardContent className="py-4">
          <div className="flex items-center justify-between text-sm text-stone-500">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Last analysis: {new Date().toLocaleString()}
            </div>
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4" />
              <span>[DEMO] All data shown is for demonstration purposes</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
