'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { trpc } from '@/trpc/client';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FileCheck,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle,
  PlayCircle,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface ScrubResult {
  id: string;
  status: string;
  overallScore: number;
  passedChecks: number;
  failedChecks: number;
  warningChecks: number;
  summary: string | null;
  recommendation: string | null;
  issues: Array<{
    id: string;
    severity: string;
    code: string;
    category: string;
    field: string | null;
    message: string;
    suggestion: string | null;
    isResolved: boolean;
  }>;
}

// Type for claim from router query
type ClaimForScrubbing = {
  id: string;
  status: string;
  totalCharges: number | { toNumber(): number } | null;
  patient?: {
    demographics?: {
      firstName: string;
      lastName: string;
    } | null;
  } | null;
  insurancePolicy?: {
    payer?: {
      name: string;
    } | null;
  } | null;
  scrubResults?: Array<{
    overallScore: number;
    recommendation: string | null;
  }>;
};

export function ClaimScrubQueue() {
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [scrubResult, setScrubResult] = useState<ScrubResult | null>(null);

  const { data: claims, isLoading, refetch } = trpc.aiBilling.getClaimsForScrubbing.useQuery({
    limit: 20,
  });

  const scrubMutation = trpc.aiBilling.scrubClaim.useMutation({
    onSuccess: (data) => {
      setScrubResult(data as ScrubResult);
      refetch();
    },
  });

  const handleScrub = async (claimId: string) => {
    setSelectedClaimId(claimId);
    setScrubResult(null);
    await scrubMutation.mutateAsync({
      claimId,
      includeWarnings: true,
      checkHistorical: true,
    });
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'ERROR':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'WARNING':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'INFO':
        return <Info className="h-4 w-4 text-blue-500" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getRecommendationBadge = (recommendation: string | null) => {
    switch (recommendation) {
      case 'SUBMIT':
        return <Badge variant="default" className="bg-green-500">Ready to Submit</Badge>;
      case 'REVIEW':
        return <Badge variant="secondary" className="bg-yellow-500 text-white">Review Needed</Badge>;
      case 'FIX_REQUIRED':
        return <Badge variant="destructive">Fix Required</Badge>;
      default:
        return null;
    }
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
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            Claim Scrubbing Queue
          </CardTitle>
          <CardDescription>
            Pre-submission validation to catch errors before sending to payers
          </CardDescription>
        </CardHeader>
        <CardContent>
          {claims && claims.length > 0 ? (
            <ScrollArea className="h-[500px]">
              <div className="space-y-3">
                {(claims as ClaimForScrubbing[]).map((claim) => {
                  const lastScrub = claim.scrubResults?.[0];
                  return (
                    <div
                      key={claim.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {claim.patient?.demographics?.lastName}, {claim.patient?.demographics?.firstName}
                          </span>
                          <Badge variant="outline">{claim.status}</Badge>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {claim.insurancePolicy?.payer?.name || 'No payer'} |{' '}
                          ${Number(claim.totalCharges || 0).toFixed(2)}
                        </div>
                        {lastScrub && (
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-sm font-medium ${getScoreColor(lastScrub.overallScore)}`}>
                              Score: {lastScrub.overallScore}%
                            </span>
                            {getRecommendationBadge(lastScrub.recommendation)}
                          </div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleScrub(claim.id)}
                        disabled={scrubMutation.isPending && selectedClaimId === claim.id}
                      >
                        {scrubMutation.isPending && selectedClaimId === claim.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <PlayCircle className="h-4 w-4 mr-1" />
                            Scrub
                          </>
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>All claims have been scrubbed recently.</p>
              <p className="text-sm">Claims will appear here when they need validation.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scrub Result Dialog */}
      <Dialog open={!!scrubResult} onOpenChange={() => setScrubResult(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5" />
              Scrub Results
            </DialogTitle>
            <DialogDescription>
              Pre-submission validation complete
            </DialogDescription>
          </DialogHeader>

          {scrubResult && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <div className={`text-3xl font-bold ${getScoreColor(scrubResult.overallScore)}`}>
                    {scrubResult.overallScore}%
                  </div>
                  <p className="text-sm text-muted-foreground">Overall Score</p>
                </div>
                <div className="text-right">
                  {getRecommendationBadge(scrubResult.recommendation)}
                  <div className="flex gap-2 mt-2 text-sm">
                    <span className="text-green-600">{scrubResult.passedChecks} passed</span>
                    <span className="text-red-600">{scrubResult.failedChecks} failed</span>
                    <span className="text-yellow-600">{scrubResult.warningChecks} warnings</span>
                  </div>
                </div>
              </div>

              {/* Summary Text */}
              {scrubResult.summary && (
                <p className="text-sm text-muted-foreground">{scrubResult.summary}</p>
              )}

              {/* Issues */}
              {scrubResult.issues.length > 0 && (
                <Accordion type="single" collapsible className="w-full">
                  {/* Group issues by category */}
                  {Object.entries(
                    scrubResult.issues.reduce((acc, issue) => {
                      const cat = issue.category;
                      if (!acc[cat]) acc[cat] = [];
                      acc[cat].push(issue);
                      return acc;
                    }, {} as Record<string, typeof scrubResult.issues>)
                  ).map(([category, issues]) => (
                    <AccordionItem key={category} value={category}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{category}</span>
                          <Badge variant="outline">{issues.length}</Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2">
                          {issues.map((issue) => (
                            <div
                              key={issue.id}
                              className="flex items-start gap-3 p-3 border rounded-lg bg-muted/30"
                            >
                              {getSeverityIcon(issue.severity)}
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">{issue.code}</span>
                                  <Badge
                                    variant={
                                      issue.severity === 'ERROR'
                                        ? 'destructive'
                                        : issue.severity === 'WARNING'
                                          ? 'secondary'
                                          : 'outline'
                                    }
                                  >
                                    {issue.severity}
                                  </Badge>
                                </div>
                                <p className="text-sm mt-1">{issue.message}</p>
                                {issue.suggestion && (
                                  <p className="text-sm text-muted-foreground mt-1">
                                    <span className="font-medium">Suggestion:</span> {issue.suggestion}
                                  </p>
                                )}
                                {issue.field && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Field: {issue.field}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}

              {/* No Issues */}
              {scrubResult.issues.length === 0 && (
                <div className="text-center py-4">
                  <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-2" />
                  <p className="font-medium text-green-600">No issues found!</p>
                  <p className="text-sm text-muted-foreground">
                    This claim passed all validation checks.
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
