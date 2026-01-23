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
  Users,
  Target,
  Star,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  RefreshCw,
  Megaphone,
  UserPlus,
  Heart,
  MessageSquare,
  Loader2,
  Activity,
  PieChart,
  Zap,
  ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';

// ============================================
// Type Definitions
// ============================================

type DateRange = '7d' | '30d' | '90d' | '1y';

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
  loading = false,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  loading?: boolean;
}) {
  const variantStyles = {
    default: 'text-muted-foreground',
    success: 'text-green-600',
    warning: 'text-yellow-600',
    danger: 'text-red-600',
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-4" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-16 mb-1" />
          <Skeleton className="h-3 w-32" />
        </CardContent>
      </Card>
    );
  }

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
              <span
                className={`flex items-center mr-2 ${
                  trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : ''
                }`}
              >
                {trend === 'up' ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" />
                )}
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

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-800',
    COMPLETED: 'bg-blue-100 text-blue-800',
    PAUSED: 'bg-yellow-100 text-yellow-800',
    DRAFT: 'bg-gray-100 text-gray-800',
    SCHEDULED: 'bg-purple-100 text-purple-800',
    CANCELLED: 'bg-red-100 text-red-800',
  };

  return (
    <Badge className={colors[status] || 'bg-gray-100 text-gray-800'}>
      {status.toLowerCase().replace('_', ' ')}
    </Badge>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${Math.round(value * 10) / 10}%`;
}

// ============================================
// Dashboard Summary Component
// ============================================

function DashboardSummary() {
  const { data, isLoading } = trpc.aiGrowth.getDashboardSummary.useQuery();

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      <MetricCard
        title="New Leads"
        value={data?.leads.new ?? 0}
        subtitle={`${data?.leads.hot ?? 0} hot leads`}
        icon={UserPlus}
        trend={data?.leads.trend && data.leads.trend > 0 ? 'up' : data?.leads.trend && data.leads.trend < 0 ? 'down' : 'neutral'}
        trendValue={data?.leads.trend ? formatPercent(data.leads.trend) : undefined}
        variant="default"
        loading={isLoading}
      />
      <MetricCard
        title="Conversions"
        value={data?.conversions.current ?? 0}
        subtitle={`${Math.round((data?.conversions.rate ?? 0) * 10) / 10}% rate`}
        icon={Target}
        trend={data?.conversions.trend && data.conversions.trend > 0 ? 'up' : data?.conversions.trend && data.conversions.trend < 0 ? 'down' : 'neutral'}
        trendValue={data?.conversions.trend ? formatPercent(data.conversions.trend) : undefined}
        variant="success"
        loading={isLoading}
      />
      <MetricCard
        title="Avg Rating"
        value={data?.reputation.averageRating ?? 0}
        subtitle={`${data?.reputation.totalReviews ?? 0} total reviews`}
        icon={Star}
        variant="default"
        loading={isLoading}
      />
      <MetricCard
        title="Referrals"
        value={data?.referrals.current ?? 0}
        icon={Heart}
        trend={data?.referrals.trend && data.referrals.trend > 0 ? 'up' : data?.referrals.trend && data.referrals.trend < 0 ? 'down' : 'neutral'}
        trendValue={data?.referrals.trend ? formatPercent(data.referrals.trend) : undefined}
        variant="default"
        loading={isLoading}
      />
      <MetricCard
        title="Campaign ROI"
        value={`${data?.campaigns.roi ?? 0}%`}
        subtitle={`${data?.campaigns.active ?? 0} active campaigns`}
        icon={Megaphone}
        variant={data?.campaigns.roi && data.campaigns.roi > 100 ? 'success' : 'default'}
        loading={isLoading}
      />
    </div>
  );
}

// ============================================
// Lead Pipeline Component
// ============================================

function LeadPipeline() {
  const { data, isLoading } = trpc.aiGrowth.getLeadPipeline.useQuery();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const maxCount = Math.max(...(data?.pipeline.map((p) => p.count) ?? [1]));

  // Color mapping for stages
  const stageColors: Record<string, string> = {
    NEW: 'bg-blue-500',
    SCORING: 'bg-indigo-500',
    HOT: 'bg-red-500',
    WARM: 'bg-orange-500',
    COLD: 'bg-cyan-500',
    NURTURING: 'bg-purple-500',
    READY: 'bg-green-500',
    CONVERTED: 'bg-emerald-600',
    LOST: 'bg-gray-400',
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Lead Pipeline
        </CardTitle>
        <CardDescription>
          Current lead distribution by status
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data?.pipeline
            .filter((stage) => stage.count > 0 || ['NEW', 'HOT', 'CONVERTED'].includes(stage.stage))
            .map((stage) => (
              <div key={stage.stage} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{stage.label}</span>
                  <span className="text-muted-foreground">
                    {stage.count} {stage.value > 0 && `(${formatCurrency(stage.value)})`}
                  </span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${stageColors[stage.stage] || 'bg-gray-500'} transition-all`}
                    style={{ width: `${maxCount > 0 ? (stage.count / maxCount) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
        </div>

        <div className="mt-6 pt-4 border-t grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold">{data?.metrics.totalLeads ?? 0}</div>
            <div className="text-xs text-muted-foreground">Total Leads</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600">
              {Math.round((data?.metrics.conversionRate ?? 0) * 10) / 10}%
            </div>
            <div className="text-xs text-muted-foreground">Conversion Rate</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-500">
              {Math.round((data?.metrics.hotLeadRate ?? 0) * 10) / 10}%
            </div>
            <div className="text-xs text-muted-foreground">Hot Lead Rate</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// Conversion Funnel Component
// ============================================

function ConversionFunnel({ dateRange }: { dateRange: DateRange }) {
  const { data, isLoading } = trpc.aiGrowth.getConversionFunnel.useQuery({ dateRange });

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
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Conversion Funnel
        </CardTitle>
        <CardDescription>Lead progression through conversion stages</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {data?.funnel.map((stage, index) => {
            const widthPercent = stage.percentage;
            const bgColor =
              index === 0
                ? 'bg-blue-500'
                : index === data.funnel.length - 1
                  ? 'bg-green-500'
                  : 'bg-blue-400';

            return (
              <div key={stage.stage} className="relative">
                <div
                  className={`${bgColor} text-white px-4 py-3 rounded transition-all`}
                  style={{
                    width: `${Math.max(widthPercent, 20)}%`,
                    marginLeft: `${(100 - Math.max(widthPercent, 20)) / 2}%`,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{stage.stage}</span>
                    <span>
                      {stage.count} ({Math.round(stage.percentage)}%)
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 pt-4 border-t grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-xl font-bold text-green-600">
              {Math.round((data?.metrics.overallConversionRate ?? 0) * 10) / 10}%
            </div>
            <div className="text-xs text-muted-foreground">Overall Rate</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold">
              {Math.round((data?.metrics.qualifiedConversionRate ?? 0) * 10) / 10}%
            </div>
            <div className="text-xs text-muted-foreground">Qualified Rate</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold">{data?.metrics.avgTimeToConvert ?? 0} days</div>
            <div className="text-xs text-muted-foreground">Avg Time to Convert</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold">{formatCurrency(data?.metrics.avgDealValue ?? 0)}</div>
            <div className="text-xs text-muted-foreground">Avg Deal Value</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// Growth KPIs Component
// ============================================

function GrowthKPIs({ dateRange }: { dateRange: DateRange }) {
  const { data, isLoading } = trpc.aiGrowth.getGrowthKPIs.useQuery({ dateRange });

  if (isLoading) {
    return (
      <Card className="col-span-2">
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    new_patients: UserPlus,
    leads_generated: Users,
    conversion_rate: Target,
    referrals: Heart,
    reactivations: RefreshCw,
    reviews: Star,
    campaign_revenue: DollarSign,
    roi: TrendingUp,
  };

  return (
    <Card className="col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Growth KPIs
        </CardTitle>
        <CardDescription>Key performance indicators for practice growth</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {data?.kpis.map((kpi) => {
            const Icon = iconMap[kpi.id] || Activity;
            const isPositiveTrend = kpi.trend !== null && kpi.trend > 0;
            const isNegativeTrend = kpi.trend !== null && kpi.trend < 0;

            return (
              <div key={kpi.id} className="p-4 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  {kpi.trend !== null && (
                    <span
                      className={`text-xs flex items-center ${
                        isPositiveTrend ? 'text-green-600' : isNegativeTrend ? 'text-red-600' : ''
                      }`}
                    >
                      {isPositiveTrend ? (
                        <ArrowUpRight className="h-3 w-3" />
                      ) : isNegativeTrend ? (
                        <ArrowDownRight className="h-3 w-3" />
                      ) : null}
                      {formatPercent(kpi.trend)}
                    </span>
                  )}
                </div>
                <div className="text-2xl font-bold">
                  {kpi.unit === '$'
                    ? formatCurrency(kpi.value as number)
                    : kpi.unit === '%'
                      ? `${kpi.value}%`
                      : kpi.value}
                </div>
                <div className="text-xs text-muted-foreground">{kpi.label}</div>
                {kpi.target && (
                  <div className="mt-2">
                    <Progress value={((kpi.value as number) / kpi.target) * 100} className="h-1" />
                    <div className="text-xs text-muted-foreground mt-1">
                      Target: {kpi.unit === '%' ? `${kpi.target}%` : kpi.target}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// Referral Source Analysis Component
// ============================================

function ReferralSourceAnalysis() {
  const { data, isLoading } = trpc.aiGrowth.getReferralSources.useQuery({});

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

  const sources = data?.sources ?? [];
  const maxReferrals = Math.max(...sources.map((s) => s.totalReferrals), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Heart className="h-5 w-5" />
          Referral Sources
        </CardTitle>
        <CardDescription>Where your referrals come from</CardDescription>
      </CardHeader>
      <CardContent>
        {sources.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Heart className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No referral data yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sources.slice(0, 5).map((source) => (
              <div key={source.source} className="flex items-center gap-4">
                <div className="w-32 text-sm font-medium truncate">{source.source}</div>
                <div className="flex-1">
                  <div className="h-4 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${(source.totalReferrals / maxReferrals) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="w-20 text-right">
                  <div className="font-semibold">{source.totalReferrals}</div>
                  <div className="text-xs text-muted-foreground">
                    {Math.round(source.conversionRate * 10) / 10}% conv
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 pt-4 border-t flex justify-between text-sm">
          <span className="text-muted-foreground">Total Referrals</span>
          <span className="font-semibold">{data?.summary.totalReferrals ?? 0}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// Reputation Trending Component
// ============================================

function ReputationTrending() {
  const { data, isLoading } = trpc.aiGrowth.getReputationTrends.useQuery({ days: 90 });

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

  // Transform data into array of trends
  const trendData = data?.data ?? {};
  const sortedDates = Object.keys(trendData).sort();
  const trends = sortedDates.map((date) => {
    const platforms = trendData[date];
    const ratings = Object.values(platforms).map((p) => p.rating);
    const reviews = Object.values(platforms).reduce((sum, p) => sum + p.reviews, 0);
    const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
    return { period: date, averageRating: avgRating, totalReviews: reviews };
  });

  const latestScore = trends.length > 0 ? trends[trends.length - 1] : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star className="h-5 w-5" />
          Reputation Score
        </CardTitle>
        <CardDescription>Online reputation tracking</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center mb-6">
          <div className="text-4xl font-bold text-yellow-500">
            {latestScore ? Math.round((latestScore.averageRating ?? 0) * 10) / 10 : '-'}
          </div>
          <div className="flex items-center justify-center gap-1 mt-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`h-4 w-4 ${
                  star <= Math.round(latestScore?.averageRating ?? 0)
                    ? 'text-yellow-500 fill-yellow-500'
                    : 'text-gray-300'
                }`}
              />
            ))}
          </div>
          <div className="text-sm text-muted-foreground mt-2">
            Based on {latestScore?.totalReviews ?? 0} reviews
          </div>
        </div>

        {trends.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium">Recent Trend</div>
            <div className="flex items-end gap-1 h-24">
              {trends.slice(-6).map((trend, i) => {
                const height = trend.averageRating ? (trend.averageRating / 5) * 100 : 0;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center">
                    <div
                      className="w-full bg-yellow-500 rounded-t transition-all"
                      style={{ height: `${height}%` }}
                    />
                    <div className="text-xs text-muted-foreground mt-1">{trend.period?.slice(5)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-4 pt-4 border-t">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Trend</span>
            <Badge
              variant="secondary"
              className={
                data?.overallTrend === 'improving'
                  ? 'bg-green-100 text-green-800'
                  : data?.overallTrend === 'declining'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-gray-100 text-gray-800'
              }
            >
              {data?.overallTrend ?? 'Stable'}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// Campaign Performance Component
// ============================================

function CampaignPerformance() {
  const { data, isLoading } = trpc.aiGrowth.getCampaignPerformanceSummary.useQuery({ limit: 5 });

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
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" />
            Campaign Performance
          </CardTitle>
          <CardDescription>Recent marketing campaigns</CardDescription>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href="/marketing/campaigns">
            View All <ChevronRight className="h-4 w-4 ml-1" />
          </a>
        </Button>
      </CardHeader>
      <CardContent>
        {data?.campaigns.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Megaphone className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No campaigns yet</p>
            <Button variant="link" className="mt-2" asChild>
              <a href="/marketing/campaigns/new">Create your first campaign</a>
            </Button>
          </div>
        ) : (
          <ScrollArea className="h-[280px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Conversions</TableHead>
                  <TableHead className="text-right">ROI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.campaigns.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell>
                      <div className="font-medium">{campaign.name}</div>
                      <div className="text-xs text-muted-foreground">{campaign.type}</div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={campaign.status} />
                    </TableCell>
                    <TableCell className="text-right">{campaign.conversions}</TableCell>
                    <TableCell className="text-right">
                      <span
                        className={campaign.roi > 0 ? 'text-green-600' : campaign.roi < 0 ? 'text-red-600' : ''}
                      >
                        {Math.round(campaign.roi)}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// ROI by Channel Component
// ============================================

function ROIByChannel({ dateRange }: { dateRange: '30d' | '90d' | '1y' }) {
  const { data, isLoading } = trpc.aiGrowth.getROIByChannel.useQuery({ dateRange });

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

  const channels = data?.channels ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PieChart className="h-5 w-5" />
          ROI by Channel
        </CardTitle>
        <CardDescription>Marketing channel performance</CardDescription>
      </CardHeader>
      <CardContent>
        {channels.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <PieChart className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No channel data yet</p>
          </div>
        ) : (
          <ScrollArea className="h-[280px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">ROI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {channels.map((channel) => (
                  <TableRow key={channel.channel}>
                    <TableCell className="font-medium capitalize">{channel.channel}</TableCell>
                    <TableCell className="text-right">{formatCurrency(channel.spend)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(channel.revenue)}</TableCell>
                    <TableCell className="text-right">
                      <span
                        className={channel.roi > 0 ? 'text-green-600' : channel.roi < 0 ? 'text-red-600' : ''}
                      >
                        {Math.round(channel.roi)}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// Patient Acquisition Cost Component
// ============================================

function PatientAcquisitionCost({ dateRange }: { dateRange: '30d' | '90d' | '1y' }) {
  const { data, isLoading } = trpc.aiGrowth.getPatientAcquisitionCost.useQuery({ dateRange });

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
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Patient Acquisition Cost
        </CardTitle>
        <CardDescription>Cost to acquire new patients by source</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 mb-6 text-center">
          <div className="p-4 bg-muted rounded-lg">
            <div className="text-2xl font-bold">{formatCurrency(data?.overall.avgCAC ?? 0)}</div>
            <div className="text-xs text-muted-foreground">Avg CAC</div>
          </div>
          <div className="p-4 bg-muted rounded-lg">
            <div className="text-2xl font-bold">{formatCurrency(data?.overall.avgLTV ?? 0)}</div>
            <div className="text-xs text-muted-foreground">Avg LTV</div>
          </div>
          <div className="p-4 bg-muted rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {Math.round((data?.overall.ltvCacRatio ?? 0) * 10) / 10}x
            </div>
            <div className="text-xs text-muted-foreground">LTV:CAC Ratio</div>
          </div>
        </div>

        {data?.bySource && data.bySource.length > 0 ? (
          <ScrollArea className="h-[200px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Conversions</TableHead>
                  <TableHead className="text-right">CAC</TableHead>
                  <TableHead className="text-right">LTV:CAC</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.bySource.map((source) => (
                  <TableRow key={source.source}>
                    <TableCell className="font-medium capitalize">{source.source}</TableCell>
                    <TableCell className="text-right">{source.conversions}</TableCell>
                    <TableCell className="text-right">{formatCurrency(source.cac)}</TableCell>
                    <TableCell className="text-right">
                      <span className={source.ltvCacRatio >= 3 ? 'text-green-600' : source.ltvCacRatio < 1 ? 'text-red-600' : ''}>
                        {Math.round(source.ltvCacRatio * 10) / 10}x
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <DollarSign className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No acquisition data yet</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// Main Dashboard Component
// ============================================

export function PracticeGrowthDashboard() {
  const [dateRange, setDateRange] = useState<DateRange>('30d');

  const dateRangeForCost = dateRange === '7d' ? '30d' : dateRange;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            AI Practice Growth
          </h1>
          <p className="text-muted-foreground">
            AI-powered insights to grow your practice
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="1y">Last year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <DashboardSummary />

      {/* Main Content */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="acquisition">Acquisition</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <LeadPipeline />
            <ReputationTrending />
          </div>
          <GrowthKPIs dateRange={dateRange} />
        </TabsContent>

        <TabsContent value="leads" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <LeadPipeline />
            <ConversionFunnel dateRange={dateRange} />
          </div>
          <ReferralSourceAnalysis />
        </TabsContent>

        <TabsContent value="campaigns" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <CampaignPerformance />
            <ROIByChannel dateRange={dateRangeForCost} />
          </div>
        </TabsContent>

        <TabsContent value="acquisition" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <PatientAcquisitionCost dateRange={dateRangeForCost} />
            <ReferralSourceAnalysis />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
