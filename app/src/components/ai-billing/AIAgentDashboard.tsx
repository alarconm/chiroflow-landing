'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Bot,
  Activity,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Zap,
  BarChart3,
  Settings,
  Calculator,
  RefreshCw,
  FileText,
  Send,
  Search,
  Filter,
  ChevronRight,
  Loader2,
  Target,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Timer,
  Percent,
  Wallet,
  Users,
  Calendar,
  PlayCircle,
  PauseCircle,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

// ============================================
// Type Definitions
// ============================================

interface ActivityTask {
  id: string;
  taskType: string;
  status: string;
  priority: number;
  attempts: number;
  maxAttempts: number;
  resultSummary: string | null;
  amountRecovered: number | null;
  processingTimeMs: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  claim: { id: string; patientName: string; totalCharges: any; status: string } | null;
  patient: { id: string; name: string } | null;
  payer: { id: string; name: string } | null;
  latestDecision: { decision: string; confidence: number; riskLevel: string | null } | null;
}

interface DenialCategory {
  category: string;
  count: number;
  won: number;
  lost: number;
  pending: number;
  amountAtRisk: number;
  amountRecovered: number;
  successRate: number;
}

// ============================================
// Utility Components
// ============================================

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendValue,
  variant = 'default',
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: any;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const variantStyles = {
    default: 'text-muted-foreground',
    success: 'text-green-600',
    warning: 'text-yellow-600',
    danger: 'text-red-600',
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${variantStyles[variant]}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${variantStyles[variant]}`}>{value}</div>
        {(subtitle || trendValue) && (
          <div className="flex items-center text-xs text-muted-foreground mt-1">
            {trend && trendValue && (
              <span className={`flex items-center mr-2 ${trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : ''}`}>
                {trend === 'up' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {trendValue}
              </span>
            )}
            {subtitle && <span>{subtitle}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TaskStatusBadge({ status }: { status: string }) {
  const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: any }> = {
    QUEUED: { variant: 'outline', icon: Clock },
    IN_PROGRESS: { variant: 'secondary', icon: Loader2 },
    COMPLETED: { variant: 'default', icon: CheckCircle },
    FAILED: { variant: 'destructive', icon: XCircle },
    SKIPPED: { variant: 'outline', icon: AlertTriangle },
    NEEDS_REVIEW: { variant: 'secondary', icon: Search },
  };

  const config = variants[status] || { variant: 'outline' as const, icon: Clock };
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="flex items-center gap-1">
      <Icon className={`h-3 w-3 ${status === 'IN_PROGRESS' ? 'animate-spin' : ''}`} />
      {status.replace('_', ' ')}
    </Badge>
  );
}

function TaskTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    SUBMIT: 'bg-blue-100 text-blue-800',
    FOLLOW_UP: 'bg-purple-100 text-purple-800',
    APPEAL: 'bg-yellow-100 text-yellow-800',
    CORRECT: 'bg-orange-100 text-orange-800',
    POST: 'bg-green-100 text-green-800',
    SCRUB: 'bg-cyan-100 text-cyan-800',
    ELIGIBILITY: 'bg-pink-100 text-pink-800',
    STATUS: 'bg-gray-100 text-gray-800',
  };

  return (
    <Badge className={colors[type] || 'bg-gray-100 text-gray-800'}>
      {type.replace('_', ' ')}
    </Badge>
  );
}

// ============================================
// Activity Feed Component
// ============================================

function ActivityFeed() {
  const [filter, setFilter] = useState<string>('all');

  const { data, isLoading, refetch } = trpc.aiBilling.getAgentActivityFeed.useQuery({
    limit: 20,
    taskTypes: filter !== 'all' ? [filter as any] : undefined,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Agent Activity Feed
            </CardTitle>
            <CardDescription>Real-time view of AI billing agent tasks</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Filter tasks" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tasks</SelectItem>
                <SelectItem value="SUBMIT">Submissions</SelectItem>
                <SelectItem value="FOLLOW_UP">Follow-ups</SelectItem>
                <SelectItem value="APPEAL">Appeals</SelectItem>
                <SelectItem value="POST">Posting</SelectItem>
                <SelectItem value="SCRUB">Scrubbing</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          <div className="space-y-4">
            {data?.tasks.map((task: ActivityTask) => (
              <div
                key={task.id}
                className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <TaskTypeBadge type={task.taskType} />
                    <TaskStatusBadge status={task.status} />
                    {task.priority > 5 && (
                      <Badge variant="destructive" className="text-xs">High Priority</Badge>
                    )}
                  </div>
                  <p className="text-sm font-medium">
                    {task.claim?.patientName || task.patient?.name || 'Unknown Patient'}
                    {task.payer && <span className="text-muted-foreground"> • {task.payer.name}</span>}
                  </p>
                  {task.resultSummary && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{task.resultSummary}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
                    </span>
                    {task.processingTimeMs && (
                      <span className="flex items-center gap-1">
                        <Timer className="h-3 w-3" />
                        {(task.processingTimeMs / 1000).toFixed(1)}s
                      </span>
                    )}
                    {task.amountRecovered && (
                      <span className="flex items-center gap-1 text-green-600">
                        <DollarSign className="h-3 w-3" />
                        ${task.amountRecovered.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
                {task.latestDecision && (
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-xs">
                      <Target className="h-3 w-3" />
                      {Math.round(task.latestDecision.confidence * 100)}%
                    </div>
                    {task.latestDecision.riskLevel && (
                      <Badge
                        variant={
                          task.latestDecision.riskLevel === 'high'
                            ? 'destructive'
                            : task.latestDecision.riskLevel === 'medium'
                            ? 'secondary'
                            : 'outline'
                        }
                        className="text-xs mt-1"
                      >
                        {task.latestDecision.riskLevel} risk
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            ))}
            {(!data?.tasks || data.tasks.length === 0) && (
              <div className="text-center py-8 text-muted-foreground">
                <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No recent activity</p>
              </div>
            )}
          </div>
        </ScrollArea>
        {data?.hasMore && (
          <div className="mt-4 text-center">
            <Button variant="outline" size="sm">
              Load More
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// Claims Processed Metrics Component
// ============================================

function ClaimsProcessedMetrics() {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  const { data, isLoading } = trpc.aiBilling.getClaimsProcessedMetrics.useQuery({
    periodType: period,
  });

  if (isLoading) {
    return (
      <Card className="col-span-2">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Claims Processed
            </CardTitle>
            <CardDescription>Overview of claim submission and processing metrics</CardDescription>
          </div>
          <Select value={period} onValueChange={(v) => setPeriod(v as any)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-3xl font-bold text-blue-600">{data?.totals.claimsSubmitted || 0}</div>
            <div className="text-sm text-blue-800">Claims Submitted</div>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-3xl font-bold text-green-600">{data?.totals.claimsAccepted || 0}</div>
            <div className="text-sm text-green-800">Accepted</div>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <div className="text-3xl font-bold text-red-600">{data?.totals.claimsRejected || 0}</div>
            <div className="text-sm text-red-800">Rejected</div>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <div className="text-3xl font-bold text-purple-600">{data?.submissionRate.toFixed(1)}%</div>
            <div className="text-sm text-purple-800">Acceptance Rate</div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Task Success Rate</span>
            <span className="font-medium">{data?.successRate.toFixed(1)}%</span>
          </div>
          <Progress value={data?.successRate || 0} className="h-2" />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="p-4 border rounded-lg">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Wallet className="h-4 w-4" />
              Amount Posted
            </div>
            <div className="text-2xl font-bold text-green-600">
              ${(data?.totals.amountPosted || 0).toLocaleString()}
            </div>
          </div>
          <div className="p-4 border rounded-lg">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" />
              Revenue Recovered
            </div>
            <div className="text-2xl font-bold text-green-600">
              ${(data?.totals.revenueRecovered || 0).toLocaleString()}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// Denial & Appeal Tracking Component
// ============================================

function DenialAppealTracking() {
  const { data, isLoading } = trpc.aiBilling.getDenialAppealTracking.useQuery({});

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Denial & Appeal Tracking
        </CardTitle>
        <CardDescription>Monitor appeal performance and denial patterns</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center p-3 bg-yellow-50 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">{data?.summary.pendingAppeals || 0}</div>
            <div className="text-xs text-yellow-800">Pending</div>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{data?.summary.wonAppeals || 0}</div>
            <div className="text-xs text-green-800">Won</div>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-600">{data?.summary.lostAppeals || 0}</div>
            <div className="text-xs text-red-800">Lost</div>
          </div>
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">{data?.summary.successRate.toFixed(0)}%</div>
            <div className="text-xs text-blue-800">Success Rate</div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              <span className="font-medium">Total Recovered</span>
            </div>
            <span className="text-xl font-bold text-green-600">
              ${(data?.summary.totalRecovered || 0).toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between items-center p-3 bg-yellow-50 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <span className="font-medium">At Risk</span>
            </div>
            <span className="text-xl font-bold text-yellow-600">
              ${(data?.summary.totalAtRisk || 0).toLocaleString()}
            </span>
          </div>
        </div>

        {data?.categoryBreakdown && data.categoryBreakdown.length > 0 && (
          <div className="mt-6">
            <h4 className="text-sm font-medium mb-3">By Denial Category</h4>
            <div className="space-y-2">
              {data.categoryBreakdown.slice(0, 5).map((cat: DenialCategory) => (
                <div key={cat.category} className="flex items-center justify-between text-sm">
                  <span className="truncate flex-1">{cat.category}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-muted-foreground">{cat.count} appeals</span>
                    <span className="font-medium w-12 text-right">
                      {cat.successRate.toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// Revenue Impact Component
// ============================================

function RevenueImpact() {
  const { data, isLoading } = trpc.aiBilling.getRevenueImpactData.useQuery({
    periodType: 'daily',
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Revenue Impact
        </CardTitle>
        <CardDescription>Financial impact of AI billing agent</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center p-6 bg-gradient-to-br from-green-50 to-emerald-100 rounded-lg mb-6">
          <div className="text-sm text-green-800 mb-1">Total Revenue Impact</div>
          <div className="text-4xl font-bold text-green-600">
            ${(data?.totals.totalImpact || 0).toLocaleString()}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 border rounded-lg">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Zap className="h-4 w-4 text-blue-500" />
              Revenue Recovered
            </div>
            <div className="text-xl font-bold">
              ${(data?.totals.revenueRecovered || 0).toLocaleString()}
            </div>
          </div>
          <div className="p-4 border rounded-lg">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Denials Prevented
            </div>
            <div className="text-xl font-bold">
              ${(data?.totals.denialsSaved || 0).toLocaleString()}
            </div>
          </div>
          <div className="p-4 border rounded-lg">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Search className="h-4 w-4 text-purple-500" />
              Underpayments Caught
            </div>
            <div className="text-xl font-bold">
              ${(data?.totals.underpaymentsCaught || 0).toLocaleString()}
            </div>
          </div>
          <div className="p-4 border rounded-lg">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Wallet className="h-4 w-4 text-green-500" />
              Cost Savings
            </div>
            <div className="text-xl font-bold">
              ${(data?.totals.costSavings || 0).toLocaleString()}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// Pending Tasks Queue Component
// ============================================

function PendingTasksQueue() {
  const { data, isLoading, refetch } = trpc.aiBilling.getPendingTasksQueue.useQuery({
    limit: 10,
    sortBy: 'priority',
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Pending Tasks Queue
            </CardTitle>
            <CardDescription>{data?.totalPending || 0} tasks waiting to be processed</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {data?.stats && Object.keys(data.stats).length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            {Object.entries(data.stats).map(([type, counts]) => (
              <div key={type} className="text-center p-2 bg-muted/50 rounded">
                <div className="text-lg font-bold">{(counts as any).queued + (counts as any).inProgress}</div>
                <div className="text-xs text-muted-foreground">{type}</div>
              </div>
            ))}
          </div>
        )}

        <ScrollArea className="h-[200px]">
          <div className="space-y-2">
            {data?.tasks.map((task: any) => (
              <div
                key={task.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50"
              >
                <div className="flex items-center gap-3">
                  <TaskTypeBadge type={task.taskType} />
                  <div>
                    <p className="text-sm font-medium">
                      {task.claim?.patientName || 'Unknown'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {task.payer?.name || 'No payer'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {task.priority > 5 && (
                    <Badge variant="destructive" className="text-xs">P{task.priority}</Badge>
                  )}
                  <TaskStatusBadge status={task.status} />
                </div>
              </div>
            ))}
            {(!data?.tasks || data.tasks.length === 0) && (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                <p>All caught up!</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ============================================
// Agent Configuration Component
// ============================================

function AgentConfiguration() {
  const { data, isLoading } = trpc.aiBilling.getAgentConfiguration.useQuery();
  const updateRule = trpc.aiBilling.updateAgentRule.useMutation();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  const handleToggleRule = async (ruleId: string, isActive: boolean) => {
    await updateRule.mutateAsync({ id: ruleId, isActive });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Agent Configuration
        </CardTitle>
        <CardDescription>Manage automation rules and settings</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg mb-4">
          <div className="flex items-center gap-2">
            <PlayCircle className="h-5 w-5 text-green-600" />
            <span className="font-medium">Automation Status</span>
          </div>
          <Badge variant="default" className="bg-green-600">Active</Badge>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Total Rules</span>
            <span className="text-2xl font-bold">{data?.totalRules || 0}</span>
          </div>

          {data?.rulesByType && Object.entries(data.rulesByType).length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Rules by Type</h4>
              {Object.entries(data.rulesByType).map(([type, rules]) => (
                <div key={type} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{type}</span>
                    <Badge variant="outline">{(rules as any[]).length} rules</Badge>
                  </div>
                  <div className="space-y-2">
                    {(rules as any[]).slice(0, 3).map((rule) => (
                      <div key={rule.id} className="flex items-center justify-between text-sm">
                        <span className="truncate flex-1 mr-2">{rule.name}</span>
                        <Switch
                          checked={rule.isActive}
                          onCheckedChange={(checked) => handleToggleRule(rule.id, checked)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// Performance Comparison Component
// ============================================

function PerformanceComparison() {
  const { data, isLoading } = trpc.aiBilling.getPerformanceComparison.useQuery({});

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Performance: AI vs Manual
        </CardTitle>
        <CardDescription>Compare AI agent performance to manual processing</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead className="text-right">AI Agent</TableHead>
              <TableHead className="text-right">Manual (Est.)</TableHead>
              <TableHead className="text-right">Difference</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Processing Time</TableCell>
              <TableCell className="text-right">
                {((data?.ai.avgProcessingTimeMs || 0) / 1000).toFixed(1)}s
              </TableCell>
              <TableCell className="text-right">
                {((data?.manual.avgProcessingTimeMs || 0) / 1000 / 60).toFixed(1)}min
              </TableCell>
              <TableCell className="text-right text-green-600">
                {data?.savings.efficiencyGain.toFixed(0)}% faster
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Appeal Success Rate</TableCell>
              <TableCell className="text-right">{data?.ai.appealSuccessRate.toFixed(1)}%</TableCell>
              <TableCell className="text-right">{data?.manual.appealSuccessRate}%</TableCell>
              <TableCell className="text-right text-green-600">
                +{((data?.ai.appealSuccessRate || 0) - (data?.manual.appealSuccessRate || 0)).toFixed(1)}%
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Collection Rate</TableCell>
              <TableCell className="text-right">{data?.ai.collectionRate.toFixed(1)}%</TableCell>
              <TableCell className="text-right">{data?.manual.collectionRate}%</TableCell>
              <TableCell className="text-right text-green-600">
                +{((data?.ai.collectionRate || 0) - (data?.manual.collectionRate || 0)).toFixed(1)}%
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Avg Days in AR</TableCell>
              <TableCell className="text-right">{data?.ai.avgDaysInAR.toFixed(1)}</TableCell>
              <TableCell className="text-right">{data?.manual.avgDaysInAR}</TableCell>
              <TableCell className="text-right text-green-600">
                {((data?.manual.avgDaysInAR || 0) - (data?.ai.avgDaysInAR || 0)).toFixed(1)} days faster
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <div className="mt-4 p-4 bg-blue-50 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-blue-800">Total Hours Saved</div>
              <div className="text-2xl font-bold text-blue-600">
                {data?.savings.hoursSaved.toFixed(1)} hours
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium text-blue-800">Net Cost Savings</div>
              <div className="text-2xl font-bold text-blue-600">
                ${(data?.savings.netSavingsUsd || 0).toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {(data?.userOverrides || 0) > 0 && (
          <div className="mt-4 text-sm text-muted-foreground">
            <span className="font-medium">User Overrides:</span> {data?.userOverrides} ({data?.overrideRate.toFixed(1)}% of decisions)
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// ROI Calculator Component
// ============================================

function ROICalculator() {
  const { data, isLoading } = trpc.aiBilling.getROICalculator.useQuery({});

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          ROI Calculator
        </CardTitle>
        <CardDescription>
          Return on investment for the past {data?.period.daysCovered} days
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center p-6 bg-gradient-to-br from-green-50 to-emerald-100 rounded-lg mb-6">
          <div className="text-sm text-green-800 mb-1">Return on Investment</div>
          <div className="text-5xl font-bold text-green-600">
            {data?.roi.percentage.toFixed(0)}%
          </div>
          <div className="text-sm text-green-700 mt-2">
            Net Benefit: ${(data?.roi.netBenefit || 0).toLocaleString()}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium mb-2">Benefits Breakdown</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Revenue Recovered</span>
                <span className="font-medium">${(data?.benefits.revenueRecovered || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Denials Prevented</span>
                <span className="font-medium">${(data?.benefits.denialsSaved || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Underpayments Caught</span>
                <span className="font-medium">${(data?.benefits.underpaymentsCaught || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Labor Savings</span>
                <span className="font-medium">${(data?.benefits.laborSavings || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm font-medium border-t pt-2">
                <span>Total Benefits</span>
                <span className="text-green-600">${(data?.benefits.totalBenefits || 0).toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-2">Costs</h4>
            <div className="flex justify-between text-sm">
              <span>AI Processing Cost</span>
              <span className="font-medium">${(data?.costs.aiCost || 0).toLocaleString()}</span>
            </div>
          </div>

          <div className="p-4 bg-blue-50 rounded-lg">
            <h4 className="text-sm font-medium text-blue-800 mb-2">Projections</h4>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-lg font-bold text-blue-600">
                  ${(data?.projections.daily || 0).toLocaleString()}
                </div>
                <div className="text-xs text-blue-700">Daily</div>
              </div>
              <div>
                <div className="text-lg font-bold text-blue-600">
                  ${(data?.projections.monthly || 0).toLocaleString()}
                </div>
                <div className="text-xs text-blue-700">Monthly</div>
              </div>
              <div>
                <div className="text-lg font-bold text-blue-600">
                  ${(data?.projections.annual || 0).toLocaleString()}
                </div>
                <div className="text-xs text-blue-700">Annual</div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// Main Dashboard Component
// ============================================

export function AIAgentDashboard() {
  const [activeTab, setActiveTab] = useState('overview');

  // Get summary data for the header
  const { data: summary, isLoading: summaryLoading } = trpc.aiBilling.getDashboardSummary.useQuery();
  const { data: pendingTasks } = trpc.aiBilling.getPendingTasksQueue.useQuery({ limit: 5 });
  const { data: roi } = trpc.aiBilling.getROICalculator.useQuery({});

  if (summaryLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Bot className="h-8 w-8 text-[#053e67]" />
            AI Billing Agent Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor autonomous billing operations and performance metrics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
            <Activity className="h-3 w-3 mr-1" />
            Agent Active
          </Badge>
          <Badge variant="outline">
            <Clock className="h-3 w-3 mr-1" />
            {pendingTasks?.totalPending || 0} tasks pending
          </Badge>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Claims Processed"
          value={(summary?.scrubQueue.count || 0) + (summary?.pendingAppeals.count || 0)}
          subtitle="Last 30 days"
          icon={FileText}
        />
        <MetricCard
          title="Active Appeals"
          value={summary?.pendingAppeals.count || 0}
          subtitle="Pending resolution"
          icon={AlertTriangle}
          variant="warning"
        />
        <MetricCard
          title="Recovery Potential"
          value={`$${(summary?.underpayments.potentialRecovery || 0).toLocaleString()}`}
          subtitle={`${summary?.underpayments.count || 0} opportunities`}
          icon={DollarSign}
          variant="success"
        />
        <MetricCard
          title="ROI"
          value={`${roi?.roi.percentage.toFixed(0) || 0}%`}
          subtitle={`$${(roi?.roi.netBenefit || 0).toLocaleString()} net benefit`}
          icon={TrendingUp}
          variant="success"
        />
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview" className="flex items-center gap-1">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex items-center gap-1">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Activity</span>
          </TabsTrigger>
          <TabsTrigger value="appeals" className="flex items-center gap-1">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Appeals</span>
          </TabsTrigger>
          <TabsTrigger value="queue" className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">Queue</span>
          </TabsTrigger>
          <TabsTrigger value="performance" className="flex items-center gap-1">
            <Percent className="h-4 w-4" />
            <span className="hidden sm:inline">Performance</span>
          </TabsTrigger>
          <TabsTrigger value="config" className="flex items-center gap-1">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Settings</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <ClaimsProcessedMetrics />
            <RevenueImpact />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DenialAppealTracking />
            <ROICalculator />
          </div>
        </TabsContent>

        <TabsContent value="activity" className="space-y-6">
          <ActivityFeed />
        </TabsContent>

        <TabsContent value="appeals" className="space-y-6">
          <DenialAppealTracking />
        </TabsContent>

        <TabsContent value="queue" className="space-y-6">
          <PendingTasksQueue />
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          <PerformanceComparison />
        </TabsContent>

        <TabsContent value="config" className="space-y-6">
          <AgentConfiguration />
        </TabsContent>
      </Tabs>
    </div>
  );
}
