'use client';

import { trpc } from '@/trpc/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldCheck, ShieldAlert, AlertCircle, AlertTriangle, Info, Loader2, RefreshCw } from 'lucide-react';

interface ComplianceIssue {
  severity: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  section: 'subjective' | 'objective' | 'assessment' | 'plan' | 'general';
  suggestion?: string;
}

interface ComplianceCheckerProps {
  encounterId: string;
  soapContent?: {
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
  };
  onIssueClick?: (section: string) => void;
}

export function ComplianceChecker({
  encounterId,
  soapContent,
  onIssueClick,
}: ComplianceCheckerProps) {
  const {
    data: compliance,
    isLoading,
    refetch,
    isFetching,
  } = trpc.aiDocumentation.checkCompliance.useQuery(
    { encounterId, soapContent },
    { enabled: false }
  );

  const handleCheck = () => {
    refetch();
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getSeverityIcon = (severity: 'error' | 'warning' | 'info') => {
    switch (severity) {
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'info':
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getSeverityColor = (severity: 'error' | 'warning' | 'info') => {
    switch (severity) {
      case 'error':
        return 'border-red-200 bg-red-50';
      case 'warning':
        return 'border-yellow-200 bg-yellow-50';
      case 'info':
        return 'border-blue-200 bg-blue-50';
    }
  };

  const groupIssuesBySection = (issues: ComplianceIssue[]) => {
    const grouped: Record<string, ComplianceIssue[]> = {};
    for (const issue of issues) {
      if (!grouped[issue.section]) {
        grouped[issue.section] = [];
      }
      grouped[issue.section].push(issue);
    }
    return grouped;
  };

  const sectionLabels: Record<string, string> = {
    subjective: 'Subjective (S)',
    objective: 'Objective (O)',
    assessment: 'Assessment (A)',
    plan: 'Plan (P)',
    general: 'General',
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          {compliance?.isCompliant ? (
            <ShieldCheck className="h-5 w-5 text-green-500" />
          ) : compliance ? (
            <ShieldAlert className="h-5 w-5 text-yellow-500" />
          ) : (
            <ShieldCheck className="h-5 w-5" />
          )}
          Documentation Compliance
        </CardTitle>
        <CardDescription>
          Check your SOAP note for completeness and compliance issues
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          onClick={handleCheck}
          disabled={isLoading || isFetching}
          className="w-full"
          variant={compliance ? 'outline' : 'default'}
        >
          {isLoading || isFetching ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Checking...
            </>
          ) : compliance ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Re-check Compliance
            </>
          ) : (
            <>
              <ShieldCheck className="mr-2 h-4 w-4" />
              Check Compliance
            </>
          )}
        </Button>

        {(isLoading || isFetching) && (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {compliance && !isFetching && (
          <>
            {/* Score Display */}
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Compliance Score</p>
                <p className={`text-3xl font-bold ${getScoreColor(compliance.score)}`}>
                  {compliance.score}%
                </p>
              </div>
              <div className="w-24 h-24 relative">
                <svg className="transform -rotate-90 w-24 h-24">
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="none"
                    className="text-muted"
                  />
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="none"
                    strokeDasharray={251.2}
                    strokeDashoffset={251.2 - (251.2 * compliance.score) / 100}
                    className={getScoreColor(compliance.score)}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  {compliance.isCompliant ? (
                    <ShieldCheck className="h-8 w-8 text-green-500" />
                  ) : (
                    <ShieldAlert className="h-8 w-8 text-yellow-500" />
                  )}
                </div>
              </div>
            </div>

            {/* Status Badge */}
            <div className="flex justify-center">
              {compliance.isCompliant ? (
                <Badge className="bg-green-500 text-white">
                  <ShieldCheck className="mr-1 h-3 w-3" />
                  Documentation Compliant
                </Badge>
              ) : (
                <Badge className="bg-yellow-500 text-white">
                  <ShieldAlert className="mr-1 h-3 w-3" />
                  Issues Found
                </Badge>
              )}
            </div>

            {/* Issues List */}
            {compliance.issues.length > 0 && (
              <div className="space-y-4">
                <h4 className="font-medium">Issues Found ({compliance.issues.length})</h4>

                {Object.entries(groupIssuesBySection(compliance.issues)).map(
                  ([section, issues]) => (
                    <div key={section} className="space-y-2">
                      <button
                        className="text-sm font-medium text-primary hover:underline"
                        onClick={() => onIssueClick?.(section)}
                      >
                        {sectionLabels[section] || section}
                      </button>

                      {issues.map((issue, index) => (
                        <Alert
                          key={index}
                          className={`${getSeverityColor(issue.severity)} cursor-pointer`}
                          onClick={() => onIssueClick?.(section)}
                        >
                          <div className="flex items-start gap-2">
                            {getSeverityIcon(issue.severity)}
                            <div className="flex-1">
                              <AlertTitle className="text-sm font-medium">
                                {issue.category}
                              </AlertTitle>
                              <AlertDescription className="text-sm">
                                {issue.message}
                                {issue.suggestion && (
                                  <p className="mt-1 text-xs opacity-75">
                                    Suggestion: {issue.suggestion}
                                  </p>
                                )}
                              </AlertDescription>
                            </div>
                          </div>
                        </Alert>
                      ))}
                    </div>
                  )
                )}
              </div>
            )}

            {compliance.issues.length === 0 && (
              <Alert className="bg-green-50 border-green-200">
                <ShieldCheck className="h-4 w-4 text-green-500" />
                <AlertTitle className="text-green-700">All Clear!</AlertTitle>
                <AlertDescription className="text-green-600">
                  No compliance issues found in your documentation.
                </AlertDescription>
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
