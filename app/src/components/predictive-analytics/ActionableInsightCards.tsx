'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { trpc } from '@/trpc/client';
import {
  AlertTriangle,
  Phone,
  Calendar,
  DollarSign,
  Users,
  TrendingDown,
  Clock,
  Target,
  Zap,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';

interface InsightCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action: string;
  actionHref?: string;
  priority: 'high' | 'medium' | 'low';
  metric?: string;
  metricLabel?: string;
}

function InsightCard({
  icon,
  title,
  description,
  action,
  actionHref,
  priority,
  metric,
  metricLabel,
}: InsightCardProps) {
  const priorityColors = {
    high: 'border-l-red-500 bg-red-50/50',
    medium: 'border-l-orange-500 bg-orange-50/50',
    low: 'border-l-blue-500 bg-blue-50/50',
  };

  const priorityBadge = {
    high: 'destructive' as const,
    medium: 'default' as const,
    low: 'secondary' as const,
  };

  return (
    <Card className={`border-l-4 ${priorityColors[priority]}`}>
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <div className="p-2 rounded-full bg-background shadow-sm">{icon}</div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium">{title}</h3>
              <Badge variant={priorityBadge[priority]}>{priority}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-3">{description}</p>
            {metric && (
              <div className="text-2xl font-bold text-[#053e67] mb-2">
                {metric}
                {metricLabel && (
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    {metricLabel}
                  </span>
                )}
              </div>
            )}
            {actionHref ? (
              <Link href={actionHref}>
                <Button size="sm" variant="outline">
                  {action}
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            ) : (
              <Button size="sm" variant="outline">
                {action}
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ActionableInsightCards() {
  const { data: churnSummary, isLoading: churnLoading } = trpc.aiPredict.getChurnSummary.useQuery(
    undefined,
    { refetchOnWindowFocus: false }
  );

  const { data: noShowSummary, isLoading: noShowLoading } = trpc.aiPredict.getNoShowSummary.useQuery(
    { forecastDays: 7 },
    { refetchOnWindowFocus: false }
  );

  const { data: revenueSummary, isLoading: revenueLoading } = trpc.aiPredict.getRevenueSummary.useQuery(
    undefined,
    { refetchOnWindowFocus: false }
  );

  const { data: trendSummary, isLoading: trendLoading } = trpc.aiPredict.getTrendSummary.useQuery(
    undefined,
    { refetchOnWindowFocus: false }
  );

  const { data: recommendations, isLoading: recsLoading } = trpc.aiPredict.getTrendRecommendations.useQuery(
    { priority: 'immediate', limit: 3 },
    { refetchOnWindowFocus: false }
  );

  if (churnLoading || noShowLoading || revenueLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  const insights: InsightCardProps[] = [];

  // High-risk churn patients
  if (churnSummary && (churnSummary.byRiskLevel?.critical ?? 0) + (churnSummary.byRiskLevel?.high ?? 0) > 0) {
    insights.push({
      icon: <Users className="h-5 w-5 text-red-500" />,
      title: 'At-Risk Patients Need Attention',
      description: `${churnSummary.byRiskLevel?.critical ?? 0} critical and ${churnSummary.byRiskLevel?.high ?? 0} high-risk patients identified. Contact them to prevent churn.`,
      action: 'View At-Risk Patients',
      actionHref: '?tab=churn',
      priority: (churnSummary.byRiskLevel?.critical ?? 0) > 0 ? 'high' : 'medium',
      metric: `${(churnSummary.byRiskLevel?.critical ?? 0) + (churnSummary.byRiskLevel?.high ?? 0)}`,
      metricLabel: 'patients at risk',
    });
  }

  // High no-show risk appointments
  if (noShowSummary && (noShowSummary.byRiskLevel?.critical ?? 0) + (noShowSummary.byRiskLevel?.high ?? 0) > 0) {
    insights.push({
      icon: <Calendar className="h-5 w-5 text-orange-500" />,
      title: 'Appointments at Risk of No-Show',
      description: `${noShowSummary.aggregateStats?.expectedNoShows?.toFixed(0) ?? 0} expected no-shows in the next 7 days. Consider confirmation calls.`,
      action: 'View Calendar',
      actionHref: '?tab=no-shows',
      priority: (noShowSummary.byRiskLevel?.critical ?? 0) > 5 ? 'high' : 'medium',
      metric: `${noShowSummary.aggregateStats?.expectedNoShows?.toFixed(0) ?? 0}`,
      metricLabel: 'expected no-shows',
    });
  }

  // AR recovery opportunity
  if (revenueSummary?.arInsights && revenueSummary.arInsights.expected30DayRecovery > 5000) {
    insights.push({
      icon: <DollarSign className="h-5 w-5 text-green-500" />,
      title: 'AR Recovery Opportunity',
      description: `$${revenueSummary.arInsights.expected30DayRecovery.toLocaleString()} expected recovery in next 30 days. Focus collections efforts on aging accounts.`,
      action: 'View Revenue Details',
      actionHref: '?tab=revenue',
      priority: revenueSummary.arInsights.badDebtRisk > 20 ? 'high' : 'medium',
      metric: `$${revenueSummary.arInsights.expected30DayRecovery.toLocaleString()}`,
      metricLabel: 'recoverable',
    });
  }

  // Goal at risk
  if (revenueSummary?.goalAttainment && revenueSummary.goalAttainment.probability < 0.7) {
    insights.push({
      icon: <Target className="h-5 w-5 text-red-500" />,
      title: 'Revenue Goal at Risk',
      description: `Only ${(revenueSummary.goalAttainment.probability * 100).toFixed(0)}% probability of hitting goal. ${revenueSummary.goalAttainment.suggestedActionsCount} actions suggested.`,
      action: 'View Recommendations',
      actionHref: '?tab=scenarios',
      priority: revenueSummary.goalAttainment.probability < 0.5 ? 'high' : 'medium',
      metric: `${(revenueSummary.goalAttainment.probability * 100).toFixed(0)}%`,
      metricLabel: 'goal probability',
    });
  }

  // Critical alerts
  if (trendSummary && trendSummary.criticalAlerts > 0) {
    insights.push({
      icon: <AlertTriangle className="h-5 w-5 text-red-600" />,
      title: 'Critical Alerts Detected',
      description: `${trendSummary.criticalAlerts} critical alerts require immediate attention. Review and address these issues.`,
      action: 'View Alerts',
      actionHref: '?tab=trends',
      priority: 'high',
      metric: `${trendSummary.criticalAlerts}`,
      metricLabel: 'critical alerts',
    });
  }

  // Declining metrics
  if (trendSummary && trendSummary.negativeMetrics && trendSummary.negativeMetrics.length > 2) {
    insights.push({
      icon: <TrendingDown className="h-5 w-5 text-red-500" />,
      title: 'Multiple Metrics Declining',
      description: `${trendSummary.negativeMetrics.length} key metrics are showing decline. Review trends and take corrective action.`,
      action: 'View Trends',
      actionHref: '?tab=trends',
      priority: trendSummary.negativeMetrics.length > 4 ? 'high' : 'medium',
      metric: `${trendSummary.negativeMetrics.length}`,
      metricLabel: 'declining metrics',
    });
  }

  // Add immediate recommendations
  if (recommendations?.recommendations) {
    recommendations.recommendations.forEach((rec) => {
      insights.push({
        icon: <Zap className="h-5 w-5 text-yellow-500" />,
        title: rec.action,
        description: rec.description,
        action: 'Take Action',
        priority: rec.priority === 'immediate' ? 'high' : rec.priority === 'soon' ? 'medium' : 'low',
      });
    });
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  insights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  if (insights.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p className="font-medium">All Clear!</p>
        <p className="text-sm">No urgent insights or actions needed at this time.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {insights.slice(0, 6).map((insight, i) => (
        <InsightCard key={i} {...insight} />
      ))}
    </div>
  );
}
