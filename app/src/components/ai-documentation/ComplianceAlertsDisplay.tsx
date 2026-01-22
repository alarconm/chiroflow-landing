'use client';

import { useState, useMemo } from 'react';
import { trpc } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  AlertCircle,
  AlertTriangle,
  Info,
  Loader2,
  RefreshCw,
  Check,
  X,
  Lightbulb,
  ChevronDown,
  ChevronRight,
  Wand2,
  Ban,
  CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Local interface matching the DB schema
interface ComplianceIssue {
  id: string;
  issueType: string;
  title: string;
  description: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  section: string | null;
  suggestion: string | null;
  autoFixable: boolean;
  requirementSource: string | null;
  resolved: boolean;
  resolvedAt: Date | null;
}

interface ComplianceAlertsDisplayProps {
  encounterId: string;
  draftNoteId?: string;
  onSectionFocus?: (section: string) => void;
  onAutoFix?: (issueId: string, fixContent: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

const PAYER_OPTIONS = [
  { value: 'MEDICARE', label: 'Medicare' },
  { value: 'BLUE_CROSS', label: 'Blue Cross' },
  { value: 'UNITED', label: 'United Healthcare' },
  { value: 'AETNA', label: 'Aetna' },
  { value: 'WORKERS_COMP', label: "Workers' Comp" },
  { value: 'AUTO_PIP', label: 'Auto/PIP' },
];

const SECTION_LABELS: Record<string, string> = {
  subjective: 'Subjective (S)',
  objective: 'Objective (O)',
  assessment: 'Assessment (A)',
  plan: 'Plan (P)',
  general: 'General',
  coding: 'Coding',
};

export function ComplianceAlertsDisplay({
  encounterId,
  draftNoteId,
  onSectionFocus,
  onAutoFix,
  disabled = false,
  compact = false,
}: ComplianceAlertsDisplayProps) {
  const [selectedPayer, setSelectedPayer] = useState<string>('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showResolved, setShowResolved] = useState(false);
  const [lastCheckResult, setLastCheckResult] = useState<{
    complianceScore: number;
    auditRiskScore: number;
    issues: ComplianceIssue[];
  } | null>(null);

  // tRPC queries - getComplianceIssues returns array of issues
  const {
    data: issuesData,
    isLoading,
    refetch,
    isFetching,
  } = trpc.aiDoc.getComplianceIssues.useQuery(
    { encounterId, resolved: showResolved ? undefined : false },
    { enabled: !!encounterId }
  );

  const { data: tipsData } = trpc.aiDoc.getComplianceTips.useQuery(
    { encounterType: undefined },
    { enabled: !!encounterId && !compact }
  );

  const { data: billingGate } = trpc.aiDoc.checkPreBillingGate.useQuery(
    { encounterId },
    { enabled: !!encounterId }
  );

  // Transform issues array to our local type
  const issues: ComplianceIssue[] = useMemo(() => {
    if (!issuesData) return [];
    return issuesData.map((i) => ({
      id: i.id,
      issueType: i.issueType || 'GENERAL',
      title: i.title,
      description: i.description,
      severity: i.severity as 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL',
      section: i.soapSection || null,
      suggestion: i.suggestion,
      autoFixable: i.autoFixable || false,
      requirementSource: i.requirementSource,
      resolved: i.resolved,
      resolvedAt: i.resolvedAt,
    }));
  }, [issuesData]);

  // Calculate score from issues
  const complianceScore = useMemo(() => {
    if (lastCheckResult) return lastCheckResult.complianceScore;
    if (!issues.length) return 100;
    const criticalCount = issues.filter(i => i.severity === 'CRITICAL' && !i.resolved).length;
    const errorCount = issues.filter(i => i.severity === 'ERROR' && !i.resolved).length;
    const warningCount = issues.filter(i => i.severity === 'WARNING' && !i.resolved).length;
    return Math.max(0, 100 - (criticalCount * 25) - (errorCount * 15) - (warningCount * 5));
  }, [issues, lastCheckResult]);

  // tRPC mutations
  const checkMutation = trpc.aiDoc.checkCompliance.useMutation({
    onSuccess: (data) => {
      setLastCheckResult({
        complianceScore: data.complianceScore,
        auditRiskScore: data.auditRiskScore,
        issues: data.issues as ComplianceIssue[],
      });
      refetch();
      toast.success(`Compliance check complete: ${data.complianceScore}% score`);
    },
    onError: (error) => toast.error(error.message),
  });

  const resolveMutation = trpc.aiDoc.resolveComplianceIssue.useMutation({
    onSuccess: () => {
      refetch();
      toast.success('Issue resolved');
    },
    onError: (error) => toast.error(error.message),
  });

  const autoFixMutation = trpc.aiDoc.applyComplianceFix.useMutation({
    onSuccess: (data) => {
      refetch();
      if (data.success && data.section) {
        onAutoFix?.(data.section, '');
      }
      toast.success('Auto-fix applied');
    },
    onError: (error) => toast.error(error.message),
  });

  // Handlers
  const handleCheck = () => {
    checkMutation.mutate({
      encounterId,
      draftNoteId,
      payerType: selectedPayer || undefined,
      preBillingGate: true,
    });
  };

  const handleResolve = (issueId: string, dismiss: boolean) => {
    resolveMutation.mutate({
      issueId,
      resolution: dismiss ? 'Dismissed' : 'Manually resolved',
      dismiss,
    });
  };

  const handleAutoFix = (issueId: string, section: string) => {
    autoFixMutation.mutate({
      issueId,
      applyToSection: section as 'subjective' | 'objective' | 'assessment' | 'plan',
    });
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  // Group issues by section
  const groupedIssues = useMemo(() => {
    return issues.reduce((acc: Record<string, ComplianceIssue[]>, issue) => {
      const key = issue.section || 'general';
      if (!acc[key]) acc[key] = [];
      acc[key].push(issue);
      return acc;
    }, {});
  }, [issues]);

  // Count by severity
  const severityCounts = useMemo(() => {
    return issues.reduce((acc: Record<string, number>, issue) => {
      if (!issue.resolved) {
        acc[issue.severity] = (acc[issue.severity] || 0) + 1;
      }
      return acc;
    }, {});
  }, [issues]);

  // Severity helpers
  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return <ShieldX className="h-4 w-4 text-red-600" />;
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

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'border-red-300 bg-red-50';
      case 'ERROR':
        return 'border-red-200 bg-red-50';
      case 'WARNING':
        return 'border-yellow-200 bg-yellow-50';
      case 'INFO':
        return 'border-blue-200 bg-blue-50';
      default:
        return 'border-gray-200 bg-gray-50';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const hasIssues = issues.length > 0 || lastCheckResult !== null;
  const isCompliant = complianceScore >= 80 && !severityCounts.CRITICAL && !severityCounts.ERROR;

  // Render issue item
  const renderIssue = (issue: ComplianceIssue) => (
    <Alert
      key={issue.id}
      className={cn(
        'cursor-pointer transition-colors',
        getSeverityColor(issue.severity),
        issue.resolved && 'opacity-60'
      )}
      onClick={() => issue.section && onSectionFocus?.(issue.section)}
    >
      <div className="flex items-start gap-3">
        {getSeverityIcon(issue.severity)}
        <div className="flex-1 min-w-0">
          <AlertTitle className="text-sm font-medium flex items-center gap-2">
            {issue.title}
            {issue.resolved && (
              <Badge variant="outline" className="text-xs bg-green-50 text-green-700">
                Resolved
              </Badge>
            )}
          </AlertTitle>
          <AlertDescription className="text-sm mt-1">
            {issue.description}
          </AlertDescription>
          {issue.suggestion && !compact && (
            <div className="flex items-start gap-1 mt-2 text-xs text-muted-foreground">
              <Lightbulb className="h-3 w-3 mt-0.5 flex-shrink-0 text-yellow-500" />
              <span>{issue.suggestion}</span>
            </div>
          )}
          {issue.requirementSource && !compact && (
            <div className="text-xs text-muted-foreground mt-1">
              Source: {issue.requirementSource}
            </div>
          )}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {issue.autoFixable && !issue.resolved && issue.section && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAutoFix(issue.id, issue.section!);
                    }}
                    disabled={autoFixMutation.isPending}
                  >
                    <Wand2 className="h-4 w-4 text-purple-500" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Auto-fix</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {!issue.resolved ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleResolve(issue.id, false);
                    }}
                    disabled={resolveMutation.isPending}
                  >
                    <Check className="h-4 w-4 text-green-600" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Mark resolved</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleResolve(issue.id, true);
                    }}
                    disabled={resolveMutation.isPending}
                  >
                    <X className="h-4 w-4 text-red-600" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Dismiss</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
    </Alert>
  );

  // Extract tips from tipsData
  const allTips = useMemo(() => {
    if (!tipsData) return [];
    const tips: Array<{ title: string; description: string }> = [];
    if (tipsData.organizationTips) {
      tipsData.organizationTips.forEach((t) => {
        tips.push({ title: t.issueType, description: t.tip });
      });
    }
    if (tipsData.generalTips) {
      tipsData.generalTips.forEach((tip) => {
        tips.push({ title: 'Tip', description: tip });
      });
    }
    return tips;
  }, [tipsData]);

  return (
    <Card className={cn('flex flex-col', compact ? 'h-auto' : 'h-full')}>
      <CardHeader className={cn('pb-3 flex-shrink-0', compact && 'p-3')}>
        <div className="flex items-center justify-between">
          <CardTitle className={cn('flex items-center gap-2', compact && 'text-base')}>
            {isCompliant ? (
              <ShieldCheck className="h-5 w-5 text-green-500" />
            ) : hasIssues ? (
              <ShieldAlert className="h-5 w-5 text-yellow-500" />
            ) : (
              <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            )}
            Compliance
          </CardTitle>
          {hasIssues && (
            <div className="flex items-center gap-2">
              <span className={cn('text-lg font-bold', getScoreColor(complianceScore))}>
                {complianceScore}%
              </span>
            </div>
          )}
        </div>
        {!compact && (
          <CardDescription>
            Documentation compliance checking
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className={cn('flex-1 flex flex-col overflow-hidden', compact && 'p-3 pt-0')}>
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {!compact && (
            <Select value={selectedPayer} onValueChange={setSelectedPayer}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Payer type..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All payers</SelectItem>
                {PAYER_OPTIONS.map((payer) => (
                  <SelectItem key={payer.value} value={payer.value}>
                    {payer.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button
            onClick={handleCheck}
            disabled={disabled || checkMutation.isPending || isFetching}
            variant={hasIssues ? 'outline' : 'default'}
            size={compact ? 'sm' : 'default'}
            className={compact ? 'flex-1' : ''}
          >
            {checkMutation.isPending || isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : hasIssues ? (
              <RefreshCw className="mr-2 h-4 w-4" />
            ) : (
              <ShieldCheck className="mr-2 h-4 w-4" />
            )}
            {hasIssues ? 'Re-check' : 'Check Compliance'}
          </Button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : hasIssues ? (
          <ScrollArea className="flex-1">
            <div className="space-y-4 pr-2">
              {/* Score & Status */}
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium">Compliance Score</span>
                  <span className={cn('text-2xl font-bold', getScoreColor(complianceScore))}>
                    {complianceScore}%
                  </span>
                </div>
                <Progress
                  value={complianceScore}
                  className={cn('h-2', getScoreBg(complianceScore))}
                />

                {/* Severity Summary */}
                <div className="flex items-center gap-3 mt-3 text-xs">
                  {(severityCounts.CRITICAL || 0) > 0 && (
                    <span className="flex items-center gap-1 text-red-600">
                      <ShieldX className="h-3 w-3" />
                      {severityCounts.CRITICAL} critical
                    </span>
                  )}
                  {(severityCounts.ERROR || 0) > 0 && (
                    <span className="flex items-center gap-1 text-red-500">
                      <AlertCircle className="h-3 w-3" />
                      {severityCounts.ERROR} errors
                    </span>
                  )}
                  {(severityCounts.WARNING || 0) > 0 && (
                    <span className="flex items-center gap-1 text-yellow-600">
                      <AlertTriangle className="h-3 w-3" />
                      {severityCounts.WARNING} warnings
                    </span>
                  )}
                  {(severityCounts.INFO || 0) > 0 && (
                    <span className="flex items-center gap-1 text-blue-600">
                      <Info className="h-3 w-3" />
                      {severityCounts.INFO} info
                    </span>
                  )}
                </div>
              </div>

              {/* Billing Gate Status */}
              {billingGate && (
                <div
                  className={cn(
                    'p-3 rounded-lg border flex items-center gap-3',
                    billingGate.canProceed
                      ? 'bg-green-50 border-green-200'
                      : 'bg-red-50 border-red-200'
                  )}
                >
                  {billingGate.canProceed ? (
                    <>
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="text-sm font-medium text-green-800">
                          Ready for Billing
                        </p>
                        <p className="text-xs text-green-600">
                          No blocking compliance issues
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <Ban className="h-5 w-5 text-red-600" />
                      <div>
                        <p className="text-sm font-medium text-red-800">
                          Billing Blocked
                        </p>
                        <p className="text-xs text-red-600">
                          {billingGate.criticalCount} critical, {billingGate.errorCount} errors must be resolved
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Issues by Section */}
              {Object.entries(groupedIssues).map(([section, sectionIssues]) => (
                <Collapsible
                  key={section}
                  open={expandedCategories.has(section)}
                  onOpenChange={() => toggleCategory(section)}
                  defaultOpen={sectionIssues.some((i) => !i.resolved)}
                >
                  <CollapsibleTrigger className="flex items-center justify-between w-full py-2 hover:bg-muted/50 rounded-md px-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {SECTION_LABELS[section] || section}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs',
                          sectionIssues.some((i) => i.severity === 'CRITICAL' || i.severity === 'ERROR')
                            ? 'bg-red-50 text-red-700'
                            : sectionIssues.some((i) => i.severity === 'WARNING')
                            ? 'bg-yellow-50 text-yellow-700'
                            : 'bg-blue-50 text-blue-700'
                        )}
                      >
                        {sectionIssues.length}
                      </Badge>
                    </div>
                    {expandedCategories.has(section) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-2 pt-2">
                    {sectionIssues.map(renderIssue)}
                  </CollapsibleContent>
                </Collapsible>
              ))}

              {/* No issues message */}
              {issues.length === 0 && (
                <Alert className="bg-green-50 border-green-200">
                  <ShieldCheck className="h-4 w-4 text-green-600" />
                  <AlertTitle className="text-green-800">All Clear!</AlertTitle>
                  <AlertDescription className="text-green-600">
                    No compliance issues found in your documentation.
                  </AlertDescription>
                </Alert>
              )}

              {/* Tips */}
              {!compact && allTips.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-yellow-500" />
                    Compliance Tips
                  </h4>
                  {allTips.slice(0, 3).map((tip, idx) => (
                    <Alert key={idx} className="bg-blue-50 border-blue-100">
                      <Info className="h-4 w-4 text-blue-500" />
                      <AlertTitle className="text-sm">{tip.title}</AlertTitle>
                      <AlertDescription className="text-xs">
                        {tip.description}
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              )}

              {/* Toggle resolved */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowResolved(!showResolved)}
                className="w-full text-muted-foreground"
              >
                {showResolved ? 'Hide' : 'Show'} resolved issues
              </Button>
            </div>
          </ScrollArea>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground">
            <ShieldCheck className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">Run compliance check to validate documentation</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
