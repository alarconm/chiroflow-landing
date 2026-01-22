'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/trpc/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Lightbulb,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  Clock,
  XCircle,
  TrendingUp,
  Users,
  DollarSign,
  Calendar,
  RefreshCw,
} from 'lucide-react';

const categoryIcons: Record<string, React.ReactNode> = {
  scheduling: <Calendar className="h-4 w-4" />,
  billing: <DollarSign className="h-4 w-4" />,
  marketing: <TrendingUp className="h-4 w-4" />,
  retention: <Users className="h-4 w-4" />,
  operations: <Clock className="h-4 w-4" />,
};

const priorityColors = {
  CRITICAL: 'bg-red-500 text-white',
  HIGH: 'bg-orange-500 text-white',
  MEDIUM: 'bg-yellow-500 text-black',
  LOW: 'bg-blue-500 text-white',
  INFO: 'bg-gray-500 text-white',
};

const statusIcons = {
  pending: <Clock className="h-4 w-4 text-gray-500" />,
  in_progress: <RefreshCw className="h-4 w-4 text-blue-500" />,
  completed: <CheckCircle className="h-4 w-4 text-green-500" />,
  dismissed: <XCircle className="h-4 w-4 text-gray-400" />,
};

export function Recommendations() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);

  const { data: summary, isLoading: summaryLoading } = trpc.aiInsights.getRecommendationSummary.useQuery();

  const { data: allRecommendations, isLoading, refetch, isFetching } = trpc.aiInsights.getRecommendations.useQuery(
    undefined,
    { refetchOnWindowFocus: false }
  );

  // Client-side filter
  const recommendations = filter
    ? allRecommendations?.filter(r => r.type === filter)
    : allRecommendations;

  const updateStatus = trpc.aiInsights.updateInsightStatus.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const handleStatusChange = async (id: string, status: 'ACTIONED' | 'RESOLVED' | 'DISMISSED') => {
    await updateStatus.mutateAsync({ id, status });
  };

  if (isLoading || summaryLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
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
              <Lightbulb className="h-5 w-5" />
              AI Recommendations
            </CardTitle>
            <CardDescription>
              Personalized suggestions to improve your practice
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Summary stats */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
            <div className="text-center p-3 bg-muted rounded-lg">
              <p className="text-2xl font-bold">{summary.totalRecommendations}</p>
              <p className="text-sm text-muted-foreground">Total</p>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <p className="text-2xl font-bold text-orange-600">{summary.highPriority}</p>
              <p className="text-sm text-muted-foreground">High Priority</p>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <p className="text-2xl font-bold text-green-600">${summary.estimatedTotalImpact.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">Estimated Impact</p>
            </div>
          </div>
        )}

        {/* Category filters */}
        {recommendations && recommendations.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            <Button
              size="sm"
              variant={filter === null ? 'default' : 'outline'}
              onClick={() => setFilter(null)}
            >
              All ({allRecommendations?.length || 0})
            </Button>
            {Array.from(new Set(allRecommendations?.map(r => r.type) || []))
              .map((type) => {
                const count = allRecommendations?.filter(r => r.type === type).length || 0;
                return (
                  <Button
                    key={type}
                    size="sm"
                    variant={filter === type ? 'default' : 'outline'}
                    onClick={() => setFilter(type)}
                  >
                    <span className="capitalize">{type.replace(/_/g, ' ')}</span>
                    <Badge variant="secondary" className="ml-1">
                      {count}
                    </Badge>
                  </Button>
                );
              })}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {!recommendations || recommendations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Lightbulb className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No recommendations available</p>
            <p className="text-sm">Check back later for new suggestions</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recommendations.map((rec, index) => (
              <div
                key={index}
                className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
              >
                <div
                  className="flex items-start justify-between cursor-pointer"
                  onClick={() => setExpanded(expanded === `${index}` ? null : `${index}`)}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-1 p-2 bg-muted rounded">
                      <Lightbulb className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{rec.title}</h4>
                        <Badge className={priorityColors[rec.priority]}>
                          {rec.priority}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {rec.description}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-sm">
                        <span className="text-muted-foreground">
                          Confidence: {rec.confidence.toFixed(0)}%
                        </span>
                        {rec.estimatedImpact && (
                          <span className="text-green-600 font-medium">
                            Est. Impact: ${rec.estimatedImpact.toLocaleString()}
                          </span>
                        )}
                        <span className="text-muted-foreground">
                          Effort: {rec.estimatedEffort}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm">
                    {expanded === `${index}` ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {expanded === `${index}` && (
                  <div className="mt-4 pt-4 border-t">
                    {/* Implementation steps */}
                    {rec.actionSteps && rec.actionSteps.length > 0 && (
                      <div className="mb-4">
                        <p className="text-sm font-medium mb-2">Implementation Steps:</p>
                        <ul className="space-y-1">
                          {rec.actionSteps.map((step, i) => (
                            <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                              <span className="text-primary">{i + 1}.</span>
                              {step}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Confidence meter */}
                    <div className="mb-4">
                      <p className="text-sm font-medium mb-2">Confidence Level</p>
                      <div className="flex items-center gap-2">
                        <Progress value={rec.confidence} className="flex-1 h-2" />
                        <span className="text-sm text-muted-foreground">
                          {rec.confidence.toFixed(0)}%
                        </span>
                      </div>
                    </div>

                    {/* Supporting metrics */}
                    {rec.supportingMetrics && rec.supportingMetrics.length > 0 && (
                      <div className="mb-4 p-3 bg-muted rounded-lg">
                        <p className="text-sm font-medium mb-2">Supporting Metrics</p>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          {rec.supportingMetrics.map((metric, i) => (
                            <div key={i}>
                              <span className="text-muted-foreground">
                                {metric.metricName}:
                              </span>{' '}
                              <span className="font-medium">{metric.currentValue}</span>
                              {metric.targetValue && (
                                <span className="text-green-600 ml-1">
                                  (target: {metric.targetValue})
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Impact description */}
                    <div className="text-sm text-muted-foreground p-3 bg-green-50 rounded-lg">
                      <span className="font-medium text-green-700">Impact: </span>
                      {rec.impact}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
