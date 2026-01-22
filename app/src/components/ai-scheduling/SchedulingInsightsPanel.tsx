'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { trpc } from '@/trpc/client';
import {
  Lightbulb,
  AlertTriangle,
  TrendingUp,
  Info,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DateRange } from 'react-day-picker';

interface SchedulingInsightsPanelProps {
  dateRange?: DateRange;
}

const insightTypeConfig = {
  warning: {
    icon: AlertTriangle,
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    iconColor: 'text-orange-500',
    badgeColor: 'bg-orange-100 text-orange-700',
  },
  opportunity: {
    icon: TrendingUp,
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    iconColor: 'text-green-500',
    badgeColor: 'bg-green-100 text-green-700',
  },
  info: {
    icon: Info,
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    iconColor: 'text-blue-500',
    badgeColor: 'bg-blue-100 text-[#053e67]',
  },
};

const categoryLabels: Record<string, string> = {
  utilization: 'Utilization',
  no_show: 'No-Show Risk',
  gap: 'Schedule Gaps',
  recall: 'Patient Recall',
  overbooking: 'Overbooking',
};

export function SchedulingInsightsPanel({ dateRange }: SchedulingInsightsPanelProps) {
  const { data, isLoading, refetch } = trpc.aiScheduling.getAllInsights.useQuery({
    dateRange: dateRange?.from && dateRange?.to
      ? { start: dateRange.from, end: dateRange.to }
      : undefined,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-yellow-500" />
            Scheduling Insights
          </CardTitle>
          <CardDescription>Loading insights...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="p-4 border rounded-lg space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const { insights = [], counts = { total: 0, warnings: 0, opportunities: 0, info: 0 } } = data || {};

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-yellow-500" />
              Scheduling Insights
            </CardTitle>
            <CardDescription>
              AI-powered recommendations to optimize your schedule
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-orange-50 text-orange-700 border-0">
              {counts.warnings} warning{counts.warnings !== 1 ? 's' : ''}
            </Badge>
            <Badge variant="outline" className="bg-green-50 text-green-700 border-0">
              {counts.opportunities} opportunit{counts.opportunities !== 1 ? 'ies' : 'y'}
            </Badge>
            <Button variant="ghost" size="icon" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {insights.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Lightbulb className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>No insights available at this time.</p>
            <p className="text-sm">Check back later as we analyze your scheduling patterns.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {insights.map((insight) => {
              const config = insightTypeConfig[insight.type as keyof typeof insightTypeConfig];
              const Icon = config?.icon || Info;

              return (
                <div
                  key={insight.id}
                  className={cn(
                    'p-4 rounded-lg border transition-colors',
                    config?.bgColor,
                    config?.borderColor
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn('mt-0.5', config?.iconColor)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium">{insight.title}</h4>
                        <Badge
                          variant="outline"
                          className={cn('border-0 text-xs', config?.badgeColor)}
                        >
                          {categoryLabels[insight.category] || insight.category}
                        </Badge>
                        {insight.priority >= 8 && (
                          <Badge variant="outline" className="border-0 bg-red-100 text-red-700 text-xs">
                            High Priority
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        {insight.description}
                      </p>
                      {insight.actionable && insight.suggestedAction && (
                        <div className="flex items-center gap-2 mt-3">
                          <Button size="sm" variant="outline" className="text-xs">
                            {insight.suggestedAction}
                            <ChevronRight className="h-3 w-3 ml-1" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
