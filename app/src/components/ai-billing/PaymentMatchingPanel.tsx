'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { trpc } from '@/trpc/client';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CreditCard,
  CheckCircle,
  XCircle,
  Check,
  X,
  ArrowRight,
  Loader2,
} from 'lucide-react';

// Type for suggestion from router query
interface SuggestionFromRouter {
  id: string;
  status: string;
  confidenceScore: number;
  matchMethod: string | null;
  paymentAmount: number | { toNumber(): number };
  chargeAmount: number | { toNumber(): number } | null;
  serviceDate: Date | null;
  cptCode: string | null;
  payerName: string | null;
  charge?: {
    id: string;
    patient?: {
      demographics?: {
        firstName: string;
        lastName: string;
      } | null;
    } | null;
  } | null;
  patient?: {
    demographics?: {
      firstName: string;
      lastName: string;
    } | null;
  } | null;
}

interface MatchSuggestion {
  id: string;
  status: string;
  confidenceScore: number;
  matchMethod: string | null;
  paymentAmount: number;
  chargeAmount: number;
  serviceDate: Date | null;
  cptCode: string | null;
  payerName: string | null;
  charge: {
    id: string;
    patient: {
      demographics: {
        firstName: string;
        lastName: string;
      } | null;
    } | null;
  } | null;
  patient: {
    demographics: {
      firstName: string;
      lastName: string;
    } | null;
  } | null;
}

export function PaymentMatchingPanel() {
  const [processingId, setProcessingId] = useState<string | null>(null);

  const { data: suggestions, isLoading, refetch } = trpc.aiBilling.getMatchSuggestions.useQuery({
    status: 'SUGGESTED',
    limit: 50,
  });

  const actionMutation = trpc.aiBilling.actionMatchSuggestion.useMutation({
    onSuccess: () => {
      refetch();
      setProcessingId(null);
    },
    onError: () => {
      setProcessingId(null);
    },
  });

  const handleAction = async (suggestionId: string, action: 'CONFIRM' | 'REJECT' | 'POST') => {
    setProcessingId(suggestionId);
    await actionMutation.mutateAsync({
      suggestionId,
      action,
    });
  };

  const getConfidenceBadge = (score: number) => {
    if (score >= 0.85) {
      return <Badge className="bg-green-500">High ({Math.round(score * 100)}%)</Badge>;
    }
    if (score >= 0.65) {
      return <Badge className="bg-yellow-500 text-white">Medium ({Math.round(score * 100)}%)</Badge>;
    }
    return <Badge variant="outline">Low ({Math.round(score * 100)}%)</Badge>;
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 0.85) return 'bg-green-500';
    if (score >= 0.65) return 'bg-yellow-500';
    return 'bg-gray-400';
  };

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
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Payment Matching
        </CardTitle>
        <CardDescription>
          AI-suggested matches between ERA payments and charges
        </CardDescription>
      </CardHeader>
      <CardContent>
        {suggestions && suggestions.length > 0 ? (
          <ScrollArea className="h-[500px]">
            <div className="space-y-4">
              {(suggestions as SuggestionFromRouter[]).map((suggestion) => {
                const patientName = suggestion.charge?.patient?.demographics
                  ? `${suggestion.charge.patient.demographics.lastName}, ${suggestion.charge.patient.demographics.firstName}`
                  : suggestion.patient?.demographics
                    ? `${suggestion.patient.demographics.lastName}, ${suggestion.patient.demographics.firstName}`
                    : 'Unknown Patient';

                return (
                  <div
                    key={suggestion.id}
                    className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{patientName}</span>
                        {getConfidenceBadge(suggestion.confidenceScore)}
                      </div>
                      <Badge variant="outline">{suggestion.matchMethod?.replace(/_/g, ' ') || 'Auto'}</Badge>
                    </div>

                    {/* Match Details */}
                    <div className="grid grid-cols-3 gap-4 mb-3">
                      {/* Payment */}
                      <div className="p-3 border rounded-lg bg-blue-50 dark:bg-blue-950/20">
                        <p className="text-xs text-muted-foreground">Payment Amount</p>
                        <p className="text-lg font-bold text-[#053e67]">
                          ${Number(suggestion.paymentAmount || 0).toFixed(2)}
                        </p>
                        {suggestion.payerName && (
                          <p className="text-xs text-muted-foreground truncate">
                            {suggestion.payerName}
                          </p>
                        )}
                      </div>

                      {/* Arrow */}
                      <div className="flex items-center justify-center">
                        <ArrowRight className="h-6 w-6 text-muted-foreground" />
                      </div>

                      {/* Charge */}
                      <div className="p-3 border rounded-lg bg-green-50 dark:bg-green-950/20">
                        <p className="text-xs text-muted-foreground">Charge Amount</p>
                        <p className="text-lg font-bold text-green-600">
                          ${Number(suggestion.chargeAmount || 0).toFixed(2)}
                        </p>
                        {suggestion.cptCode && (
                          <p className="text-xs text-muted-foreground">CPT: {suggestion.cptCode}</p>
                        )}
                      </div>
                    </div>

                    {/* Confidence Bar */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span>Match Confidence</span>
                        <span>{Math.round(suggestion.confidenceScore * 100)}%</span>
                      </div>
                      <Progress
                        value={suggestion.confidenceScore * 100}
                        className={`h-2 ${getConfidenceColor(suggestion.confidenceScore)}`}
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAction(suggestion.id, 'REJECT')}
                        disabled={processingId === suggestion.id}
                      >
                        {processingId === suggestion.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <X className="h-4 w-4 mr-1" />
                            Reject
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAction(suggestion.id, 'CONFIRM')}
                        disabled={processingId === suggestion.id}
                      >
                        {processingId === suggestion.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Check className="h-4 w-4 mr-1" />
                            Confirm
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleAction(suggestion.id, 'POST')}
                        disabled={processingId === suggestion.id}
                      >
                        {processingId === suggestion.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Post Payment
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-500" />
            <p className="font-medium">All payments matched</p>
            <p className="text-sm">No unmatched payments awaiting review.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
