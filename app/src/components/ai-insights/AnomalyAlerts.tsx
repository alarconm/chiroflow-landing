'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/trpc/client';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  DollarSign,
  Users,
  Calendar,
  XCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const priorityColors = {
  CRITICAL: 'bg-red-500',
  HIGH: 'bg-orange-500',
  MEDIUM: 'bg-yellow-500',
  LOW: 'bg-blue-500',
  INFO: 'bg-gray-500',
};

const anomalyIcons: Record<string, React.ReactNode> = {
  REVENUE_SPIKE: <TrendingUp className="h-4 w-4 text-green-500" />,
  REVENUE_DROP: <TrendingDown className="h-4 w-4 text-red-500" />,
  VISIT_SPIKE: <Users className="h-4 w-4 text-green-500" />,
  VISIT_DROP: <Users className="h-4 w-4 text-red-500" />,
  NO_SHOW_SPIKE: <XCircle className="h-4 w-4 text-red-500" />,
  CLAIM_DENIAL_SPIKE: <AlertTriangle className="h-4 w-4 text-orange-500" />,
  NEW_PATIENT_SPIKE: <Users className="h-4 w-4 text-green-500" />,
  NEW_PATIENT_DROP: <Users className="h-4 w-4 text-red-500" />,
  COLLECTION_DROP: <DollarSign className="h-4 w-4 text-red-500" />,
  PAYMENT_DELAY: <Calendar className="h-4 w-4 text-orange-500" />,
};

export function AnomalyAlerts() {
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: anomalies, isLoading, refetch, isFetching } = trpc.aiInsights.detectAnomalies.useQuery(
    {},
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
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Anomaly Alerts
          </CardTitle>
          <CardDescription>
            Unusual patterns detected in your practice metrics
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {!anomalies || anomalies.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No anomalies detected</p>
            <p className="text-sm">Your practice metrics are within normal ranges</p>
          </div>
        ) : (
          <div className="space-y-3">
            {anomalies.map((anomaly, index) => (
              <div
                key={index}
                className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
              >
                <div
                  className="flex items-start justify-between cursor-pointer"
                  onClick={() => setExpanded(expanded === `${index}` ? null : `${index}`)}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-1">
                      {anomalyIcons[anomaly.type] || <AlertTriangle className="h-4 w-4" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{anomaly.title}</h4>
                        <Badge className={priorityColors[anomaly.priority]}>
                          {anomaly.priority}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {anomaly.description}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>
                          Confidence: {anomaly.confidence.toFixed(0)}%
                        </span>
                        <span>
                          Z-Score: {Math.abs(anomaly.zScore).toFixed(2)}
                        </span>
                        <span>
                          {formatDistanceToNow(anomaly.periodStart, { addSuffix: true })}
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
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Expected Value</p>
                        <p className="font-medium">
                          {anomaly.metric.includes('Rate')
                            ? `${anomaly.expectedValue.toFixed(1)}%`
                            : anomaly.metric.includes('revenue') || anomaly.metric.includes('Revenue')
                              ? `$${anomaly.expectedValue.toFixed(2)}`
                              : anomaly.expectedValue.toFixed(1)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Actual Value</p>
                        <p className="font-medium">
                          {anomaly.metric.includes('Rate')
                            ? `${anomaly.actualValue.toFixed(1)}%`
                            : anomaly.metric.includes('revenue') || anomaly.metric.includes('Revenue')
                              ? `$${anomaly.actualValue.toFixed(2)}`
                              : anomaly.actualValue.toFixed(1)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Deviation</p>
                        <p
                          className={`font-medium ${
                            anomaly.deviationPercent > 0 ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {anomaly.deviationPercent > 0 ? '+' : ''}
                          {anomaly.deviationPercent.toFixed(1)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Period</p>
                        <p className="font-medium">
                          {new Date(anomaly.periodStart).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    {anomaly.recommendation && (
                      <div className="mt-4 p-3 bg-muted rounded-lg">
                        <p className="text-sm font-medium">Recommendation</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {anomaly.recommendation}
                        </p>
                      </div>
                    )}
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
