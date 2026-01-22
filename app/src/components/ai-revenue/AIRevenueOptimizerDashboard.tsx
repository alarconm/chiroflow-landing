'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
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
  TrendingUp,
  TrendingDown,
  DollarSign,
  AlertTriangle,
  Zap,
  BarChart3,
  RefreshCw,
  FileText,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  PieChart,
  Percent,
  Wallet,
  Activity,
  CheckCircle,
  Clock,
  Lightbulb,
  Code2,
  FileSpreadsheet,
  Handshake,
  Calendar,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { format } from 'date-fns';

// ============================================
// Type Definitions
// ============================================

interface LeakageSummary {
  totalOpen: number;
  totalAmount: number;
  totalAnnualImpact: number;
  byType: Record<string, { count: number; amount: number }>;
  byPriority: Record<string, { count: number; amount: number }>;
  byStatus: Record<string, { count: number; amount: number }>;
  recentResolutions: { count: number; amount: number };
}

interface FeeOptimizationSummary {
  pending: { count: number; totalProjectedImpact: number };
  implemented: { count: number; totalProjectedImpact: number };
  actions: { total: number; completed: number; totalActualImpact: number };
  topOpportunities: Array<{
    cptCode: string;
    cptName: string | null;
    currentFee: number;
    recommendedFee: number;
    projectedImpact: number;
  }>;
}

interface ServiceMixSummary {
  activeOpportunities: number;
  totalEstimatedValue: number;
  capturedThisYear: number;
  topOpportunities: Array<{
    id: string;
    type: string;
    title: string;
    estimatedValue: number;
    status: string;
  }>;
}

interface CodingSummary {
  activeOpportunities: number;
  totalEstimatedValue: number;
  capturedThisYear: number;
  opportunities: Array<{
    id: string;
    type: string;
    title: string;
    estimatedValue: number;
    status: string;
  }>;
}

interface ContractSummary {
  payersWithActivity: number;
  activeOpportunities: number;
  totalEstimatedValue: number;
  capturedThisYear: number;
  topOpportunities: Array<{
    id: string;
    payerName: string | null;
    estimatedValue: number;
    status: string;
  }>;
}

interface ForecastSummary {
  recentPerformance: {
    monthlyAvgRevenue: number;
    monthlyAvgCollections: number;
    collectionRate: number;
  };
  currentMonth: {
    period: string;
    actual: number;
    projected: number;
    target: number | null;
    variance: number | null;
    daysRemaining: number;
    onTrack: boolean | null;
  };
  nextActions: string[];
}

interface RevenueGoal {
  id: string;
  period: string;
  periodType: string;
  goalType: string;
  target: number;
  actual: number;
  variance: number;
  percentAchieved: number;
  onTrack: boolean;
  projectedFinal: number;
  daysRemaining: number;
  startDate: Date;
  endDate: Date;
}

interface GoalsResponse {
  goals: RevenueGoal[];
  summary: {
    total: number;
    onTrack: number;
    behind: number;
    totalTarget: number;
    totalActual: number;
  };
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

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-red-100 text-red-800',
    high: 'bg-orange-100 text-orange-800',
    medium: 'bg-yellow-100 text-yellow-800',
    low: 'bg-gray-100 text-gray-800',
  };

  return (
    <Badge className={colors[priority] || 'bg-gray-100 text-gray-800'}>
      {priority}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    identified: 'bg-blue-100 text-blue-800',
    investigating: 'bg-purple-100 text-purple-800',
    fixing: 'bg-yellow-100 text-yellow-800',
    in_progress: 'bg-yellow-100 text-yellow-800',
    resolved: 'bg-green-100 text-green-800',
    captured: 'bg-green-100 text-green-800',
    ignored: 'bg-gray-100 text-gray-800',
    declined: 'bg-gray-100 text-gray-800',
  };

  return (
    <Badge className={colors[status] || 'bg-gray-100 text-gray-800'}>
      {status.replace('_', ' ')}
    </Badge>
  );
}

// ============================================
// Revenue Opportunity Summary Component
// ============================================

function RevenueOpportunitySummary() {
  const { data: leakage, isLoading: leakageLoading } = trpc.aiRevenue.getLeakageSummary.useQuery();
  const { data: fees, isLoading: feesLoading } = trpc.aiRevenue.getFeeOptimizationSummary.useQuery();
  const { data: services, isLoading: servicesLoading } = trpc.aiRevenue.getServiceMixSummary.useQuery();
  const { data: coding, isLoading: codingLoading } = trpc.aiRevenue.getCodingOptimizationSummary.useQuery();
  const { data: contracts, isLoading: contractsLoading } = trpc.aiRevenue.getContractAnalysisSummary.useQuery();

  const isLoading = leakageLoading || feesLoading || servicesLoading || codingLoading || contractsLoading;

  if (isLoading) {
    return (
      <Card className="col-span-2">
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

  const totalOpportunities =
    (leakage?.totalOpen || 0) +
    (fees?.pending.count || 0) +
    (services?.activeOpportunities || 0) +
    (coding?.activeOpportunities || 0) +
    (contracts?.activeOpportunities || 0);

  const totalValue =
    (leakage?.totalAnnualImpact || 0) +
    (fees?.pending.totalProjectedImpact || 0) +
    (services?.totalEstimatedValue || 0) +
    (coding?.totalEstimatedValue || 0) +
    (contracts?.totalEstimatedValue || 0);

  const categories = [
    {
      name: 'Revenue Leakage',
      icon: AlertTriangle,
      count: leakage?.totalOpen || 0,
      value: leakage?.totalAnnualImpact || 0,
      color: 'text-red-500',
      bgColor: 'bg-red-50',
    },
    {
      name: 'Fee Schedule',
      icon: FileSpreadsheet,
      count: fees?.pending.count || 0,
      value: fees?.pending.totalProjectedImpact || 0,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50',
    },
    {
      name: 'Service Mix',
      icon: PieChart,
      count: services?.activeOpportunities || 0,
      value: services?.totalEstimatedValue || 0,
      color: 'text-purple-500',
      bgColor: 'bg-purple-50',
    },
    {
      name: 'Coding Optimization',
      icon: Code2,
      count: coding?.activeOpportunities || 0,
      value: coding?.totalEstimatedValue || 0,
      color: 'text-orange-500',
      bgColor: 'bg-orange-50',
    },
    {
      name: 'Contract Analysis',
      icon: Handshake,
      count: contracts?.activeOpportunities || 0,
      value: contracts?.totalEstimatedValue || 0,
      color: 'text-green-500',
      bgColor: 'bg-green-50',
    },
  ];

  return (
    <Card className="col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-yellow-500" />
          Revenue Opportunity Summary
        </CardTitle>
        <CardDescription>
          {totalOpportunities} opportunities with ${totalValue.toLocaleString()} annual potential
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center p-4 bg-gradient-to-br from-green-50 to-emerald-100 rounded-lg mb-6">
          <div className="text-sm text-green-800 mb-1">Total Annual Revenue Potential</div>
          <div className="text-4xl font-bold text-green-600">
            ${totalValue.toLocaleString()}
          </div>
          <div className="text-sm text-green-700 mt-1">
            across {totalOpportunities} opportunities
          </div>
        </div>

        <div className="space-y-3">
          {categories.map((cat) => (
            <div
              key={cat.name}
              className={`flex items-center justify-between p-3 rounded-lg ${cat.bgColor}`}
            >
              <div className="flex items-center gap-3">
                <cat.icon className={`h-5 w-5 ${cat.color}`} />
                <div>
                  <div className="font-medium">{cat.name}</div>
                  <div className="text-sm text-muted-foreground">{cat.count} opportunities</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold">${cat.value.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">annual impact</div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// Leakage Identification List Component
// ============================================

function LeakageIdentificationList() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { data, isLoading, refetch } = trpc.aiRevenue.getLeakages.useQuery({
    status: statusFilter === 'all' ? undefined : statusFilter as any,
    limit: 20,
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
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Revenue Leakage
            </CardTitle>
            <CardDescription>
              {data?.total || 0} identified leakages
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="identified">Identified</SelectItem>
                <SelectItem value="investigating">Investigating</SelectItem>
                <SelectItem value="fixing">Fixing</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
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
          <div className="space-y-3">
            {data?.leakages.map((leakage: any) => (
              <div
                key={leakage.id}
                className="p-4 border rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="capitalize">
                        {leakage.leakageType.replace('_', ' ')}
                      </Badge>
                      <PriorityBadge priority={leakage.priority} />
                      <StatusBadge status={leakage.status} />
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {leakage.description}
                    </p>
                    {leakage.recommendation && (
                      <p className="text-xs text-blue-600 mt-1">
                        <Lightbulb className="h-3 w-3 inline mr-1" />
                        {leakage.recommendation}
                      </p>
                    )}
                  </div>
                  <div className="text-right ml-4">
                    <div className="text-lg font-bold text-red-600">
                      ${Number(leakage.amount).toLocaleString()}
                    </div>
                    {leakage.annualImpact && (
                      <div className="text-xs text-muted-foreground">
                        ${Number(leakage.annualImpact).toLocaleString()}/yr
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {(!data?.leakages || data.leakages.length === 0) && (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                <p>No leakages detected!</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ============================================
// Fee Schedule Recommendations Component
// ============================================

function FeeScheduleRecommendations() {
  const { data, isLoading } = trpc.aiRevenue.getFeeOptimizationSummary.useQuery();

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
          <FileSpreadsheet className="h-5 w-5 text-blue-500" />
          Fee Schedule Recommendations
        </CardTitle>
        <CardDescription>
          {data?.pending.count || 0} pending optimizations
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center p-3 bg-yellow-50 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">{data?.pending.count || 0}</div>
            <div className="text-xs text-yellow-800">Pending</div>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{data?.implemented.count || 0}</div>
            <div className="text-xs text-green-800">Implemented</div>
          </div>
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">
              ${(data?.actions.totalActualImpact || 0).toLocaleString()}
            </div>
            <div className="text-xs text-blue-800">Actual Impact</div>
          </div>
        </div>

        <div className="text-center p-4 bg-green-50 rounded-lg mb-4">
          <div className="text-sm text-green-800">Projected Annual Impact</div>
          <div className="text-2xl font-bold text-green-600">
            ${(data?.pending.totalProjectedImpact || 0).toLocaleString()}
          </div>
        </div>

        {data?.topOpportunities && data.topOpportunities.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-3">Top Opportunities</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CPT Code</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">Recommended</TableHead>
                  <TableHead className="text-right">Impact</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topOpportunities.map((opp) => (
                  <TableRow key={opp.cptCode}>
                    <TableCell>
                      <div className="font-medium">{opp.cptCode}</div>
                      {opp.cptName && (
                        <div className="text-xs text-muted-foreground truncate max-w-[150px]">
                          {opp.cptName}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">${opp.currentFee.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-green-600 font-medium">
                      ${opp.recommendedFee.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-green-600">+${opp.projectedImpact.toLocaleString()}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// Coding Improvement Suggestions Component
// ============================================

function CodingImprovementSuggestions() {
  const { data, isLoading } = trpc.aiRevenue.getCodingOptimizationSummary.useQuery();

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
          <Code2 className="h-5 w-5 text-orange-500" />
          Coding Improvement Suggestions
        </CardTitle>
        <CardDescription>
          Optimize coding for compliant revenue increase
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-4 bg-orange-50 rounded-lg">
            <div className="text-3xl font-bold text-orange-600">{data?.activeOpportunities || 0}</div>
            <div className="text-sm text-orange-800">Active Opportunities</div>
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <div className="text-3xl font-bold text-green-600">
              ${(data?.totalEstimatedValue || 0).toLocaleString()}
            </div>
            <div className="text-sm text-green-800">Estimated Value</div>
          </div>
        </div>

        <div className="p-3 bg-blue-50 rounded-lg mb-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-800">Captured This Year</span>
            <span className="text-lg font-bold text-blue-600">
              ${(data?.capturedThisYear || 0).toLocaleString()}
            </span>
          </div>
        </div>

        <ScrollArea className="h-[200px]">
          <div className="space-y-2">
            {data?.opportunities.map((opp) => (
              <div
                key={opp.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs capitalize">
                      {opp.type.replace('coding_', '').replace('_', ' ')}
                    </Badge>
                    <StatusBadge status={opp.status} />
                  </div>
                  <p className="text-sm mt-1 line-clamp-1">{opp.title}</p>
                </div>
                <div className="text-right ml-4">
                  <div className="font-bold text-green-600">
                    ${opp.estimatedValue.toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
            {(!data?.opportunities || data.opportunities.length === 0) && (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                <p>No coding improvements identified</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ============================================
// Contract Performance Overview Component
// ============================================

function ContractPerformanceOverview() {
  const { data, isLoading } = trpc.aiRevenue.getContractAnalysisSummary.useQuery();

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
          <Handshake className="h-5 w-5 text-green-500" />
          Contract Performance Overview
        </CardTitle>
        <CardDescription>
          Payer contract analysis and renegotiation opportunities
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">{data?.payersWithActivity || 0}</div>
            <div className="text-xs text-blue-800">Active Payers</div>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              ${(data?.capturedThisYear || 0).toLocaleString()}
            </div>
            <div className="text-xs text-green-800">Captured Value</div>
          </div>
        </div>

        <div className="p-4 bg-yellow-50 rounded-lg mb-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-yellow-800">Renegotiation Opportunities</div>
              <div className="text-sm text-yellow-700">{data?.activeOpportunities || 0} contracts identified</div>
            </div>
            <div className="text-2xl font-bold text-yellow-600">
              ${(data?.totalEstimatedValue || 0).toLocaleString()}
            </div>
          </div>
        </div>

        {data?.topOpportunities && data.topOpportunities.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-3">Top Opportunities</h4>
            <div className="space-y-2">
              {data.topOpportunities.map((opp) => (
                <div
                  key={opp.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50"
                >
                  <div className="flex items-center gap-2">
                    <Handshake className="h-4 w-4 text-green-500" />
                    <span className="font-medium">{opp.payerName || 'Unknown Payer'}</span>
                    <StatusBadge status={opp.status} />
                  </div>
                  <div className="font-bold text-green-600">
                    ${opp.estimatedValue.toLocaleString()}
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
// Revenue Forecast vs Actual Component
// ============================================

function RevenueForecastActual() {
  const { data: forecast, isLoading: forecastLoading } = trpc.aiRevenue.getForecastSummary.useQuery();
  const { data: goals, isLoading: goalsLoading } = trpc.aiRevenue.getRevenueGoals.useQuery({
    periodType: 'monthly',
  });

  const isLoading = forecastLoading || goalsLoading;

  if (isLoading) {
    return (
      <Card className="col-span-2">
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
    <Card className="col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-blue-500" />
          Revenue Forecast vs Actual
        </CardTitle>
        <CardDescription>Track progress against revenue goals</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="text-sm text-blue-800 mb-1">Monthly Avg Revenue</div>
            <div className="text-2xl font-bold text-blue-600">
              ${(forecast?.recentPerformance.monthlyAvgRevenue || 0).toLocaleString()}
            </div>
            <div className="text-xs text-blue-700 mt-1">
              {forecast?.recentPerformance.collectionRate.toFixed(1)}% collection rate
            </div>
          </div>

          <div className={`p-4 rounded-lg ${forecast?.currentMonth.onTrack ? 'bg-green-50' : 'bg-yellow-50'}`}>
            <div className={`text-sm mb-1 ${forecast?.currentMonth.onTrack ? 'text-green-800' : 'text-yellow-800'}`}>
              Current Month ({forecast?.currentMonth.period})
            </div>
            <div className={`text-2xl font-bold ${forecast?.currentMonth.onTrack ? 'text-green-600' : 'text-yellow-600'}`}>
              ${(forecast?.currentMonth.actual || 0).toLocaleString()}
            </div>
            <div className={`text-xs mt-1 ${forecast?.currentMonth.onTrack ? 'text-green-700' : 'text-yellow-700'}`}>
              {forecast?.currentMonth.daysRemaining} days remaining
            </div>
          </div>

          <div className="p-4 bg-purple-50 rounded-lg">
            <div className="text-sm text-purple-800 mb-1">Month-End Projection</div>
            <div className="text-2xl font-bold text-purple-600">
              ${(forecast?.currentMonth.projected || 0).toLocaleString()}
            </div>
            {forecast?.currentMonth.variance !== null && (
              <div className={`text-xs mt-1 ${(forecast?.currentMonth.variance || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {(forecast?.currentMonth.variance || 0) >= 0 ? '+' : ''}
                ${(forecast?.currentMonth.variance || 0).toLocaleString()} vs target
              </div>
            )}
          </div>
        </div>

        {goals?.summary && (
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Goals On Track</span>
                <Badge variant="default" className="bg-green-600">
                  {goals.summary.onTrack} / {goals.summary.total}
                </Badge>
              </div>
              <Progress
                value={goals.summary.total > 0 ? (goals.summary.onTrack / goals.summary.total) * 100 : 0}
                className="h-2"
              />
            </div>
            <div className="p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Total Progress</span>
                <span className="text-sm font-bold">
                  {goals.summary.totalTarget > 0
                    ? ((goals.summary.totalActual / goals.summary.totalTarget) * 100).toFixed(1)
                    : 0}%
                </span>
              </div>
              <Progress
                value={goals.summary.totalTarget > 0 ? (goals.summary.totalActual / goals.summary.totalTarget) * 100 : 0}
                className="h-2"
              />
            </div>
          </div>
        )}

        {forecast?.nextActions && forecast.nextActions.length > 0 && (
          <div className="p-4 bg-gray-50 rounded-lg">
            <h4 className="text-sm font-medium mb-2">Recommended Actions</h4>
            <div className="space-y-1">
              {forecast.nextActions.map((action, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm">
                  <ChevronRight className="h-4 w-4 text-blue-500" />
                  {action}
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
// Action Item Tracking Component
// ============================================

function ActionItemTracking() {
  const { data: services } = trpc.aiRevenue.getServiceMixSummary.useQuery();
  const { data: coding } = trpc.aiRevenue.getCodingOptimizationSummary.useQuery();
  const { data: contracts } = trpc.aiRevenue.getContractAnalysisSummary.useQuery();

  const allOpportunities = [
    ...(services?.topOpportunities || []).map((o) => ({ ...o, category: 'Service Mix' })),
    ...(coding?.opportunities.slice(0, 5) || []).map((o) => ({ ...o, category: 'Coding' })),
    ...(contracts?.topOpportunities.map((o) => ({
      id: o.id,
      type: 'contract_renegotiation',
      title: o.payerName || 'Contract Renegotiation',
      estimatedValue: o.estimatedValue,
      status: o.status,
      category: 'Contract',
    })) || []),
  ].sort((a, b) => b.estimatedValue - a.estimatedValue).slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5 text-purple-500" />
          Action Item Tracking
        </CardTitle>
        <CardDescription>
          Top revenue optimization actions
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[350px]">
          <div className="space-y-3">
            {allOpportunities.map((opp, idx) => (
              <div
                key={`${opp.id}-${idx}`}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs">
                      {opp.category}
                    </Badge>
                    <StatusBadge status={opp.status} />
                  </div>
                  <p className="text-sm font-medium line-clamp-1">{opp.title}</p>
                </div>
                <div className="text-right ml-4">
                  <div className="font-bold text-green-600">
                    ${opp.estimatedValue.toLocaleString()}
                  </div>
                  <Button variant="ghost" size="sm" className="mt-1">
                    Take Action
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            ))}
            {allOpportunities.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                <p>No action items pending</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ============================================
// ROI from Optimizations Component
// ============================================

function ROIFromOptimizations() {
  const { data: leakage } = trpc.aiRevenue.getLeakageSummary.useQuery();
  const { data: fees } = trpc.aiRevenue.getFeeOptimizationSummary.useQuery();
  const { data: services } = trpc.aiRevenue.getServiceMixSummary.useQuery();
  const { data: coding } = trpc.aiRevenue.getCodingOptimizationSummary.useQuery();
  const { data: contracts } = trpc.aiRevenue.getContractAnalysisSummary.useQuery();

  const totalCaptured =
    (leakage?.recentResolutions.amount || 0) +
    (fees?.actions.totalActualImpact || 0) +
    (services?.capturedThisYear || 0) +
    (coding?.capturedThisYear || 0) +
    (contracts?.capturedThisYear || 0);

  const totalPending =
    (leakage?.totalAnnualImpact || 0) +
    (fees?.pending.totalProjectedImpact || 0) +
    (services?.totalEstimatedValue || 0) +
    (coding?.totalEstimatedValue || 0) +
    (contracts?.totalEstimatedValue || 0);

  const capturedBreakdown = [
    { name: 'Leakage Resolved', value: leakage?.recentResolutions.amount || 0, color: 'bg-red-500' },
    { name: 'Fee Updates', value: fees?.actions.totalActualImpact || 0, color: 'bg-blue-500' },
    { name: 'Service Mix', value: services?.capturedThisYear || 0, color: 'bg-purple-500' },
    { name: 'Coding', value: coding?.capturedThisYear || 0, color: 'bg-orange-500' },
    { name: 'Contracts', value: contracts?.capturedThisYear || 0, color: 'bg-green-500' },
  ].filter(item => item.value > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-green-500" />
          ROI from Optimizations
        </CardTitle>
        <CardDescription>
          Value captured through AI-powered optimization
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center p-6 bg-gradient-to-br from-green-50 to-emerald-100 rounded-lg mb-6">
          <div className="text-sm text-green-800 mb-1">Total Value Captured</div>
          <div className="text-4xl font-bold text-green-600">
            ${totalCaptured.toLocaleString()}
          </div>
          <div className="text-sm text-green-700 mt-2">
            ${totalPending.toLocaleString()} potential remaining
          </div>
        </div>

        {capturedBreakdown.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Breakdown by Category</h4>
            {capturedBreakdown.map((item) => (
              <div key={item.name} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{item.name}</span>
                  <span className="font-medium">${item.value.toLocaleString()}</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${item.color}`}
                    style={{ width: `${totalCaptured > 0 ? (item.value / totalCaptured) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {capturedBreakdown.length === 0 && (
          <div className="text-center py-4 text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2" />
            <p>No value captured yet this year</p>
            <p className="text-sm">Run analyses to identify opportunities</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// Main Dashboard Component
// ============================================

export function AIRevenueOptimizerDashboard() {
  const [activeTab, setActiveTab] = useState('overview');

  // Get summary data for header metrics
  const { data: leakage, isLoading: leakageLoading } = trpc.aiRevenue.getLeakageSummary.useQuery();
  const { data: fees } = trpc.aiRevenue.getFeeOptimizationSummary.useQuery();
  const { data: forecast } = trpc.aiRevenue.getForecastSummary.useQuery();
  const { data: services } = trpc.aiRevenue.getServiceMixSummary.useQuery();
  const { data: coding } = trpc.aiRevenue.getCodingOptimizationSummary.useQuery();
  const { data: contracts } = trpc.aiRevenue.getContractAnalysisSummary.useQuery();

  const totalCaptured =
    (leakage?.recentResolutions.amount || 0) +
    (fees?.actions.totalActualImpact || 0) +
    (services?.capturedThisYear || 0) +
    (coding?.capturedThisYear || 0) +
    (contracts?.capturedThisYear || 0);

  const totalOpportunities =
    (leakage?.totalOpen || 0) +
    (fees?.pending.count || 0) +
    (services?.activeOpportunities || 0) +
    (coding?.activeOpportunities || 0) +
    (contracts?.activeOpportunities || 0);

  const totalPotential =
    (leakage?.totalAnnualImpact || 0) +
    (fees?.pending.totalProjectedImpact || 0) +
    (services?.totalEstimatedValue || 0) +
    (coding?.totalEstimatedValue || 0) +
    (contracts?.totalEstimatedValue || 0);

  if (leakageLoading) {
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
            AI Revenue Optimizer
          </h1>
          <p className="text-muted-foreground mt-1">
            Maximize profitability with AI-powered revenue optimization
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
            <Activity className="h-3 w-3 mr-1" />
            Analysis Active
          </Badge>
          <Badge variant="outline">
            <Target className="h-3 w-3 mr-1" />
            {totalOpportunities} opportunities
          </Badge>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Revenue Leakage"
          value={`$${(leakage?.totalAnnualImpact || 0).toLocaleString()}`}
          subtitle={`${leakage?.totalOpen || 0} issues detected`}
          icon={AlertTriangle}
          variant="danger"
        />
        <MetricCard
          title="Fee Optimization"
          value={`$${(fees?.pending.totalProjectedImpact || 0).toLocaleString()}`}
          subtitle={`${fees?.pending.count || 0} recommendations`}
          icon={FileSpreadsheet}
          variant="warning"
        />
        <MetricCard
          title="Value Captured"
          value={`$${totalCaptured.toLocaleString()}`}
          subtitle="This year"
          icon={Wallet}
          variant="success"
        />
        <MetricCard
          title="Revenue Potential"
          value={`$${totalPotential.toLocaleString()}`}
          subtitle="Annual opportunity"
          icon={TrendingUp}
          variant="success"
        />
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="overview" className="flex items-center gap-1">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="leakage" className="flex items-center gap-1">
            <AlertTriangle className="h-4 w-4" />
            <span className="hidden sm:inline">Leakage</span>
          </TabsTrigger>
          <TabsTrigger value="fees" className="flex items-center gap-1">
            <FileSpreadsheet className="h-4 w-4" />
            <span className="hidden sm:inline">Fees</span>
          </TabsTrigger>
          <TabsTrigger value="coding" className="flex items-center gap-1">
            <Code2 className="h-4 w-4" />
            <span className="hidden sm:inline">Coding</span>
          </TabsTrigger>
          <TabsTrigger value="contracts" className="flex items-center gap-1">
            <Handshake className="h-4 w-4" />
            <span className="hidden sm:inline">Contracts</span>
          </TabsTrigger>
          <TabsTrigger value="forecast" className="flex items-center gap-1">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Forecast</span>
          </TabsTrigger>
          <TabsTrigger value="actions" className="flex items-center gap-1">
            <Target className="h-4 w-4" />
            <span className="hidden sm:inline">Actions</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <RevenueOpportunitySummary />
            <ROIFromOptimizations />
          </div>
          <RevenueForecastActual />
        </TabsContent>

        <TabsContent value="leakage" className="space-y-6">
          <LeakageIdentificationList />
        </TabsContent>

        <TabsContent value="fees" className="space-y-6">
          <FeeScheduleRecommendations />
        </TabsContent>

        <TabsContent value="coding" className="space-y-6">
          <CodingImprovementSuggestions />
        </TabsContent>

        <TabsContent value="contracts" className="space-y-6">
          <ContractPerformanceOverview />
        </TabsContent>

        <TabsContent value="forecast" className="space-y-6">
          <RevenueForecastActual />
        </TabsContent>

        <TabsContent value="actions" className="space-y-6">
          <ActionItemTracking />
        </TabsContent>
      </Tabs>
    </div>
  );
}
