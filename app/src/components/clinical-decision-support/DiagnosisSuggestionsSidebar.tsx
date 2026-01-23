'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Brain,
  Check,
  X,
  ChevronRight,
  Sparkles,
  RefreshCw,
  Loader2,
  Info,
  AlertTriangle,
} from 'lucide-react';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface DiagnosisSuggestionsSidebarProps {
  encounterId: string;
  patientId: string;
  chiefComplaint?: string;
  subjective?: string;
  objective?: string;
  onDiagnosisAdded?: () => void;
  readOnly?: boolean;
}

export function DiagnosisSuggestionsSidebar({
  encounterId,
  patientId,
  chiefComplaint,
  subjective,
  objective,
  onDiagnosisAdded,
  readOnly = false,
}: DiagnosisSuggestionsSidebarProps) {
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Get pending suggestions
  const { data: suggestions, refetch } = trpc.aiClinical.getPendingSuggestions.useQuery({
    encounterId,
  });

  // Generate suggestions mutation
  const generateMutation = trpc.aiClinical.suggestDiagnosis.useMutation({
    onMutate: () => setIsGenerating(true),
    onSuccess: () => {
      toast.success('Diagnosis suggestions generated');
      refetch();
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => setIsGenerating(false),
  });

  // Accept suggestion mutation
  const acceptMutation = trpc.aiClinical.acceptSuggestion.useMutation({
    onSuccess: () => {
      toast.success('Diagnosis added to encounter');
      refetch();
      onDiagnosisAdded?.();
    },
    onError: (error) => toast.error(error.message),
  });

  // Reject suggestion mutation
  const rejectMutation = trpc.aiClinical.rejectSuggestion.useMutation({
    onSuccess: () => {
      toast.success('Suggestion rejected');
      refetch();
      setRejectDialogOpen(false);
      setSelectedSuggestionId(null);
      setRejectReason('');
    },
    onError: (error) => toast.error(error.message),
  });

  const handleGenerate = useCallback(() => {
    if (!chiefComplaint && !subjective && !objective) {
      toast.error('Please enter clinical information before generating suggestions');
      return;
    }
    generateMutation.mutate({
      encounterId,
      chiefComplaint: chiefComplaint || undefined,
      subjective: subjective || undefined,
      objective: objective || undefined,
    });
  }, [encounterId, chiefComplaint, subjective, objective, generateMutation]);

  const handleAccept = useCallback((suggestionId: string, isPrimary: boolean = false) => {
    acceptMutation.mutate({
      suggestionId,
      isPrimary,
    });
  }, [acceptMutation]);

  const handleReject = useCallback((suggestionId: string) => {
    setSelectedSuggestionId(suggestionId);
    setRejectDialogOpen(true);
  }, []);

  const confirmReject = useCallback(() => {
    if (selectedSuggestionId) {
      rejectMutation.mutate({
        suggestionId: selectedSuggestionId,
        reason: rejectReason || undefined,
      });
    }
  }, [selectedSuggestionId, rejectReason, rejectMutation]);

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-600';
    if (confidence >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 80) return 'High';
    if (confidence >= 60) return 'Moderate';
    return 'Low';
  };

  return (
    <>
      <Card className="h-full flex flex-col">
        <CardHeader className="py-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Brain className="h-5 w-5 text-[#053e67]/50" />
              AI Diagnosis Suggestions
            </CardTitle>
            {!readOnly && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleGenerate}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
          <CardDescription className="text-xs">
            AI-suggested diagnoses based on clinical findings
          </CardDescription>
        </CardHeader>

        <CardContent className="flex-1 overflow-hidden p-0">
          {!suggestions || suggestions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
              <Sparkles className="h-10 w-10 text-gray-300 mb-3" />
              <p className="text-sm text-gray-500 mb-3">
                No suggestions yet. Enter clinical findings and generate AI suggestions.
              </p>
              {!readOnly && (
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || (!chiefComplaint && !subjective && !objective)}
                >
                  {isGenerating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Generate Suggestions
                </Button>
              )}
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="space-y-3 p-4">
                {suggestions.map((suggestion, index) => (
                  <div
                    key={suggestion.id}
                    className={cn(
                      'rounded-lg border p-3 transition-colors',
                      index === 0 ? 'border-[#053e67]/30 bg-[#053e67]/5' : 'border-gray-200'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-medium text-sm">
                            {suggestion.code}
                          </span>
                          {index === 0 && (
                            <Badge className="bg-[#053e67] text-white text-xs">
                              Top Match
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-700 mt-0.5">
                          {suggestion.description}
                        </p>
                      </div>
                    </div>

                    {/* Confidence Score */}
                    <div className="mb-2">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-500">Confidence</span>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className={cn('font-medium', getConfidenceColor(suggestion.confidence))}>
                                {suggestion.confidence}% ({getConfidenceLabel(suggestion.confidence)})
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Based on symptom matching and clinical findings</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <Progress value={suggestion.confidence} className="h-1.5" />
                    </div>

                    {/* Reasoning */}
                    {suggestion.reasoning && (
                      <div className="text-xs text-gray-500 mb-2 flex items-start gap-1">
                        <Info className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>{suggestion.reasoning}</span>
                      </div>
                    )}

                    {/* Supporting Evidence */}
                    {suggestion.supportingFindings && suggestion.supportingFindings.length > 0 && (
                      <div className="text-xs text-gray-600 mb-2">
                        <span className="font-medium">Supporting:</span>{' '}
                        {suggestion.supportingFindings.slice(0, 2).join(', ')}
                        {suggestion.supportingFindings.length > 2 && (
                          <span className="text-gray-400">
                            {' '}+{suggestion.supportingFindings.length - 2} more
                          </span>
                        )}
                      </div>
                    )}

                    {/* Red Flags */}
                    {suggestion.hasRedFlags && suggestion.redFlagDetails && (
                      <div className="flex items-start gap-1 text-xs text-orange-600 mb-2">
                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>
                          Red flags: {suggestion.redFlagDetails}
                        </span>
                      </div>
                    )}

                    {/* Action Buttons */}
                    {!readOnly && (
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t">
                        <Button
                          size="sm"
                          onClick={() => handleAccept(suggestion.id, index === 0)}
                          disabled={acceptMutation.isPending}
                          className="flex-1"
                        >
                          {acceptMutation.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              <Check className="h-3 w-3 mr-1" />
                              Accept
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReject(suggestion.id)}
                          disabled={rejectMutation.isPending}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Suggestion</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Rejecting this suggestion helps improve future AI recommendations.
              Please provide a reason if possible.
            </p>
            <Textarea
              placeholder="Optional: Why is this suggestion incorrect?"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmReject}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Reject Suggestion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
