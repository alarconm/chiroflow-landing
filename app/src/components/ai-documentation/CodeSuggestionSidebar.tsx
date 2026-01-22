'use client';

import { useState, useEffect } from 'react';
import { trpc } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  FileCode,
  Sparkles,
  Loader2,
  Check,
  X,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  Zap,
  CheckCheck,
  Flag,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Type for the component's internal representation
interface CodeSuggestionItem {
  id: string;
  code: string;
  codeType: 'ICD10' | 'CPT' | 'MODIFIER';
  description: string;
  confidence: number;
  reasoning: string | null;
  alternatives?: { code: string; description: string }[];
  upcodingRisk: boolean;
  downcodingRisk: boolean;
  auditRisk: boolean;
  status: string;
}

// Type for DB response from tRPC
type DBCodeSuggestion = {
  id: string;
  suggestedCode: string;
  codeType: string;
  codeDescription: string | null;
  confidence: number;
  reasoning: string;
  alternatives: unknown;
  upcodingRisk: boolean;
  downcodingRisk: boolean;
  auditRisk: string | null;
  status: string;
};

// Helper to transform DB response to component interface
function transformSuggestion(s: DBCodeSuggestion): CodeSuggestionItem {
  const alternatives = s.alternatives as { code: string; description: string }[] | null;
  return {
    id: s.id,
    code: s.suggestedCode,
    codeType: s.codeType as 'ICD10' | 'CPT' | 'MODIFIER',
    description: s.codeDescription || '',
    confidence: s.confidence,
    reasoning: s.reasoning,
    alternatives: alternatives || undefined,
    upcodingRisk: s.upcodingRisk,
    downcodingRisk: s.downcodingRisk,
    auditRisk: !!s.auditRisk && s.auditRisk !== 'low',
    status: s.status,
  };
}

interface CodeSuggestionSidebarProps {
  encounterId: string;
  draftNoteId?: string;
  onSelectCodes?: (icd10: string[], cpt: string[]) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function CodeSuggestionSidebar({
  encounterId,
  draftNoteId,
  onSelectCodes,
  disabled = false,
  compact = false,
}: CodeSuggestionSidebarProps) {
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['icd10', 'cpt'])
  );
  const [showUpcodeWarning, setShowUpcodeWarning] = useState<CodeSuggestionItem | null>(null);

  // tRPC queries
  const {
    data: suggestions,
    isLoading,
    refetch,
  } = trpc.aiDoc.getCodeSuggestions.useQuery(
    { encounterId, status: 'PENDING' },
    { enabled: !!encounterId }
  );

  // tRPC mutations
  const suggestMutation = trpc.aiDoc.suggestCodes.useMutation({
    onSuccess: () => {
      refetch();
      toast.success('Code suggestions generated');
    },
    onError: (error) => toast.error(error.message),
  });

  const acceptMutation = trpc.aiDoc.acceptCodeSuggestion.useMutation({
    onSuccess: () => {
      refetch();
      toast.success('Code accepted');
    },
    onError: (error) => toast.error(error.message),
  });

  const rejectMutation = trpc.aiDoc.rejectCodeSuggestion.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const acceptAllMutation = trpc.aiDoc.acceptAllCodeSuggestions.useMutation({
    onSuccess: (data) => {
      refetch();
      toast.success(`${data.acceptedCount} codes accepted`);
    },
    onError: (error) => toast.error(error.message),
  });

  const flagMutation = trpc.aiDoc.flagCodeSuggestion.useMutation({
    onSuccess: () => {
      refetch();
      toast.info('Code flagged for review');
    },
    onError: (error) => toast.error(error.message),
  });

  // Auto-select high-confidence codes
  useEffect(() => {
    if (suggestions) {
      const highConfidence = new Set(
        suggestions
          .filter((s) => s.confidence >= 0.85 && !s.auditRisk)
          .map((s) => s.id)
      );
      setSelectedCodes(highConfidence);
    }
  }, [suggestions]);

  // Handlers
  const handleSuggest = () => {
    suggestMutation.mutate({
      encounterId,
      draftNoteId,
    });
  };

  const handleToggleCode = (id: string) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleAccept = (suggestion: CodeSuggestionItem) => {
    if (suggestion.upcodingRisk || suggestion.auditRisk) {
      setShowUpcodeWarning(suggestion);
      return;
    }
    acceptMutation.mutate({ suggestionId: suggestion.id });
  };

  const handleConfirmAccept = () => {
    if (showUpcodeWarning) {
      acceptMutation.mutate({ suggestionId: showUpcodeWarning.id });
      setShowUpcodeWarning(null);
    }
  };

  const handleReject = (id: string, reason?: string) => {
    rejectMutation.mutate({ suggestionId: id, reason });
  };

  const handleAcceptAll = () => {
    acceptAllMutation.mutate({
      encounterId,
    });
  };

  const handleFlag = (id: string, flagType: 'upcoding' | 'downcoding' | 'audit') => {
    flagMutation.mutate({ suggestionId: id, flagType });
  };

  const handleApply = () => {
    if (!suggestions) return;
    const selected = suggestions.filter((s) => selectedCodes.has(s.id));
    const icd10 = selected
      .filter((s) => s.codeType === 'ICD10')
      .map((s) => s.suggestedCode);
    const cpt = selected
      .filter((s) => s.codeType === 'CPT')
      .map((s) => s.suggestedCode);
    onSelectCodes?.(icd10, cpt);
    toast.success(`Applied ${icd10.length} ICD-10 and ${cpt.length} CPT codes`);
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  // Transform and group suggestions by type
  const transformedSuggestions = suggestions?.map((s) => transformSuggestion(s as unknown as DBCodeSuggestion)) || [];
  const icd10Suggestions = transformedSuggestions.filter((s) => s.codeType === 'ICD10');
  const cptSuggestions = transformedSuggestions.filter((s) => s.codeType === 'CPT');
  const modifierSuggestions = transformedSuggestions.filter((s) => s.codeType === 'MODIFIER');

  // Confidence badge
  const ConfidenceBadge = ({ confidence }: { confidence: number }) => {
    const percent = Math.round(confidence * 100);
    return (
      <Badge
        variant="outline"
        className={cn(
          'text-xs',
          percent >= 90
            ? 'bg-green-50 text-green-700 border-green-200'
            : percent >= 70
            ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
            : 'bg-red-50 text-red-700 border-red-200'
        )}
      >
        {percent}%
      </Badge>
    );
  };

  // Risk indicators
  const RiskIndicators = ({ suggestion }: { suggestion: CodeSuggestionItem }) => (
    <div className="flex items-center gap-1">
      {suggestion.upcodingRisk && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <TrendingUp className="h-4 w-4 text-red-500" />
            </TooltipTrigger>
            <TooltipContent>Potential upcoding risk</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {suggestion.downcodingRisk && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <TrendingDown className="h-4 w-4 text-orange-500" />
            </TooltipTrigger>
            <TooltipContent>Potential downcoding - more specific code available</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {suggestion.auditRisk && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </TooltipTrigger>
            <TooltipContent>Audit risk - requires strong documentation</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );

  // Render code item
  const renderCodeItem = (suggestion: CodeSuggestionItem) => (
    <div
      key={suggestion.id}
      className={cn(
        'p-3 rounded-lg border transition-colors',
        selectedCodes.has(suggestion.id)
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50'
      )}
    >
      <div className="flex items-start gap-2">
        <Checkbox
          checked={selectedCodes.has(suggestion.id)}
          onCheckedChange={() => handleToggleCode(suggestion.id)}
          className="mt-1"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-medium text-sm">{suggestion.code}</span>
            <ConfidenceBadge confidence={suggestion.confidence} />
            <RiskIndicators suggestion={suggestion} />
          </div>
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
            {suggestion.description}
          </p>

          {/* Reasoning */}
          {!compact && suggestion.reasoning && (
            <div className="flex items-start gap-1 mt-2 text-xs text-muted-foreground">
              <HelpCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span className="line-clamp-2">{suggestion.reasoning}</span>
            </div>
          )}

          {/* Alternatives */}
          {!compact && suggestion.alternatives && suggestion.alternatives.length > 0 && (
            <div className="mt-2 text-xs">
              <span className="text-muted-foreground">Also consider: </span>
              {suggestion.alternatives.map((alt, idx) => (
                <span key={alt.code}>
                  <code className="bg-muted px-1 rounded">{alt.code}</code>
                  {idx < suggestion.alternatives!.length - 1 && ', '}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-1 flex-shrink-0">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleAccept(suggestion)}
                  disabled={acceptMutation.isPending}
                >
                  <Check className="h-4 w-4 text-green-600" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Accept</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleReject(suggestion.id)}
                  disabled={rejectMutation.isPending}
                >
                  <X className="h-4 w-4 text-red-600" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reject</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {(suggestion.upcodingRisk || suggestion.downcodingRisk || suggestion.auditRisk) && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() =>
                      handleFlag(
                        suggestion.id,
                        suggestion.upcodingRisk
                          ? 'upcoding'
                          : suggestion.downcodingRisk
                          ? 'downcoding'
                          : 'audit'
                      )
                    }
                  >
                    <Flag className="h-4 w-4 text-amber-600" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Flag for review</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
    </div>
  );

  // Render section
  const renderSection = (
    title: string,
    sectionKey: string,
    items: CodeSuggestionItem[],
    icon: React.ReactNode
  ) => (
    <Collapsible
      open={expandedSections.has(sectionKey)}
      onOpenChange={() => toggleSection(sectionKey)}
    >
      <CollapsibleTrigger className="flex items-center justify-between w-full py-2 hover:bg-muted/50 rounded-md px-2">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium text-sm">{title}</span>
          <Badge variant="secondary" className="ml-1">
            {items.length}
          </Badge>
        </div>
        {expandedSections.has(sectionKey) ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pt-2">
        {items.length > 0 ? (
          items.map(renderCodeItem)
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No {title.toLowerCase()} suggestions
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );

  return (
    <Card className={cn('flex flex-col', compact ? 'h-auto' : 'h-full')}>
      <CardHeader className={cn('pb-3 flex-shrink-0', compact && 'p-3')}>
        <div className="flex items-center justify-between">
          <CardTitle className={cn('flex items-center gap-2', compact && 'text-base')}>
            <FileCode className="h-5 w-5 text-blue-500" />
            Code Suggestions
          </CardTitle>
          {suggestions && suggestions.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {selectedCodes.size} selected
            </Badge>
          )}
        </div>
        {!compact && (
          <CardDescription>
            AI-suggested ICD-10 and CPT codes
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className={cn('flex-1 flex flex-col overflow-hidden', compact && 'p-3 pt-0')}>
        {/* Generate Button */}
        {(!suggestions || suggestions.length === 0) && !isLoading && (
          <Button
            onClick={handleSuggest}
            disabled={disabled || suggestMutation.isPending}
            className="w-full mb-4"
          >
            {suggestMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Suggest Codes
          </Button>
        )}

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : suggestions && suggestions.length > 0 ? (
          <>
            <ScrollArea className="flex-1">
              <div className="space-y-4 pr-2">
                {renderSection(
                  'ICD-10 Diagnoses',
                  'icd10',
                  icd10Suggestions,
                  <Badge variant="outline" className="text-xs">Dx</Badge>
                )}

                {renderSection(
                  'CPT Procedures',
                  'cpt',
                  cptSuggestions,
                  <Badge variant="outline" className="text-xs">Px</Badge>
                )}

                {modifierSuggestions.length > 0 &&
                  renderSection(
                    'Modifiers',
                    'modifiers',
                    modifierSuggestions,
                    <Badge variant="outline" className="text-xs">Mod</Badge>
                  )}
              </div>
            </ScrollArea>

            <Separator className="my-3" />

            {/* Quick Actions */}
            <div className="flex flex-col gap-2 flex-shrink-0">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAcceptAll}
                  disabled={acceptAllMutation.isPending}
                  className="flex-1"
                >
                  {acceptAllMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCheck className="mr-2 h-4 w-4" />
                  )}
                  Accept All High
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSuggest}
                  disabled={suggestMutation.isPending}
                >
                  <Zap className="h-4 w-4" />
                </Button>
              </div>

              {selectedCodes.size > 0 && (
                <Button onClick={handleApply} className="w-full">
                  <Check className="mr-2 h-4 w-4" />
                  Apply {selectedCodes.size} Codes
                </Button>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground">
            <FileCode className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">No code suggestions yet</p>
            <p className="text-xs mt-1">Generate SOAP note first for better suggestions</p>
          </div>
        )}
      </CardContent>

      {/* Upcoding Warning Dialog */}
      <AlertDialog open={!!showUpcodeWarning} onOpenChange={() => setShowUpcodeWarning(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Coding Risk Warning
            </AlertDialogTitle>
            <AlertDialogDescription>
              {showUpcodeWarning?.upcodingRisk && (
                <p className="mb-2">
                  <strong>Upcoding Risk:</strong> This code may represent a higher level of service
                  than documented. Ensure documentation supports this code selection.
                </p>
              )}
              {showUpcodeWarning?.auditRisk && (
                <p>
                  <strong>Audit Risk:</strong> This code has a higher audit risk. Make sure your
                  documentation clearly supports the medical necessity.
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Review Documentation</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAccept}>
              Accept Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
