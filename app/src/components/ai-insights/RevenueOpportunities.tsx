'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/trpc/client';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DollarSign,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  Users,
  Calendar,
  FileText,
  CreditCard,
} from 'lucide-react';

const opportunityIcons: Record<string, React.ReactNode> = {
  recall_due: <Calendar className="h-4 w-4" />,
  treatment_plan_incomplete: <FileText className="h-4 w-4" />,
  reactivation_candidate: <Users className="h-4 w-4" />,
  upsell_opportunity: <TrendingUp className="h-4 w-4" />,
  insurance_benefit_unused: <CreditCard className="h-4 w-4" />,
};

const opportunityLabels: Record<string, string> = {
  recall_due: 'Recall Due',
  treatment_plan_incomplete: 'Incomplete Treatment',
  reactivation_candidate: 'Reactivation',
  upsell_opportunity: 'Upsell',
  insurance_benefit_unused: 'Unused Benefits',
};

export function RevenueOpportunities() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);

  const { data: summary, isLoading: summaryLoading } = trpc.aiInsights.getOpportunitySummary.useQuery();

  const { data: opportunities, isLoading } = trpc.aiInsights.getOpportunities.useQuery(
    { types: filter ? [filter] : undefined, limit: 20 },
    { refetchOnWindowFocus: false }
  );

  const updateStatus = trpc.aiInsights.updateOpportunityStatus.useMutation();

  const handleCapture = async (id: string, value: number) => {
    // In a real app, you would show a modal to capture the actual value
    await updateStatus.mutateAsync({
      id,
      status: 'captured',
      capturedValue: value,
    });
  };

  const handleDecline = async (id: string) => {
    await updateStatus.mutateAsync({
      id,
      status: 'declined',
      notes: 'Not pursuing at this time',
    });
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
              <DollarSign className="h-5 w-5" />
              Revenue Opportunities
            </CardTitle>
            <CardDescription>
              Identified opportunities to increase practice revenue
            </CardDescription>
          </div>
          {summary && (
            <div className="text-right">
              <p className="text-2xl font-bold text-green-600">
                ${summary.totalEstimatedValue.toLocaleString()}
              </p>
              <p className="text-sm text-muted-foreground">
                {summary.totalOpportunities} opportunities
              </p>
            </div>
          )}
        </div>

        {/* Filter buttons */}
        {summary && (
          <div className="flex flex-wrap gap-2 mt-4">
            <Button
              size="sm"
              variant={filter === null ? 'default' : 'outline'}
              onClick={() => setFilter(null)}
            >
              All
            </Button>
            {Object.entries(summary.byType)
              .filter(([, data]) => data.count > 0)
              .map(([type, data]) => (
                <Button
                  key={type}
                  size="sm"
                  variant={filter === type ? 'default' : 'outline'}
                  onClick={() => setFilter(type)}
                >
                  {opportunityLabels[type] || type} ({data.count})
                </Button>
              ))}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {!opportunities || opportunities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No opportunities found</p>
            <p className="text-sm">Check back later for new opportunities</p>
          </div>
        ) : (
          <div className="space-y-3">
            {opportunities.map((opp, index) => (
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
                      {opportunityIcons[opp.opportunityType] || <DollarSign className="h-4 w-4" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{opp.title}</h4>
                        <Badge variant="outline">
                          {opportunityLabels[opp.opportunityType] || opp.opportunityType}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {opp.description}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-sm">
                        <span className="text-green-600 font-medium">
                          Est. ${opp.estimatedValue.toFixed(0)}
                        </span>
                        <span className="text-muted-foreground">
                          {opp.confidence.toFixed(0)}% confidence
                        </span>
                        {opp.payerName && (
                          <span className="text-muted-foreground">
                            {opp.payerName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-green-600">
                      ${opp.estimatedValue.toFixed(0)}
                    </span>
                    <Button variant="ghost" size="sm">
                      {expanded === `${index}` ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {expanded === `${index}` && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm font-medium mb-2">Recommended Actions:</p>
                    <ul className="space-y-1">
                      {opp.actionSteps?.map((step, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                          <span className="text-primary">{i + 1}.</span>
                          {step}
                        </li>
                      ))}
                    </ul>

                    <div className="flex justify-end gap-2 mt-4">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDecline(`opp_${index}`);
                        }}
                        disabled={updateStatus.isPending}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Decline
                      </Button>
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCapture(`opp_${index}`, opp.estimatedValue);
                        }}
                        disabled={updateStatus.isPending}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Mark Captured
                      </Button>
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
