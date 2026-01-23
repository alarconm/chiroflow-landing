'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
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
  Activity,
  Check,
  X,
  Target,
  Sparkles,
  RefreshCw,
  Loader2,
  Calendar,
  TrendingUp,
} from 'lucide-react';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface TreatmentRecommendationsDisplayProps {
  encounterId: string;
  patientId: string;
  diagnosisCode?: string;
  chiefComplaint?: string;
  onRecommendationAccepted?: () => void;
  readOnly?: boolean;
}

const evidenceLevelConfig = {
  HIGH: { label: 'High', color: 'bg-green-100 text-green-800' },
  MODERATE: { label: 'Moderate', color: 'bg-yellow-100 text-yellow-800' },
  LOW: { label: 'Low', color: 'bg-orange-100 text-orange-800' },
  VERY_LOW: { label: 'Very Low', color: 'bg-red-100 text-red-800' },
  EXPERT: { label: 'Expert Opinion', color: 'bg-blue-100 text-blue-800' },
};

export function TreatmentRecommendationsDisplay({
  encounterId,
  patientId,
  diagnosisCode,
  chiefComplaint,
  onRecommendationAccepted,
  readOnly = false,
}: TreatmentRecommendationsDisplayProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedRecommendationId, setSelectedRecommendationId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [modificationNote, setModificationNote] = useState('');

  // Get pending recommendations
  const { data: recommendations, refetch } = trpc.aiClinical.getPendingTreatmentRecommendations.useQuery({
    patientId,
    encounterId,
  });

  // Generate recommendations mutation
  const generateMutation = trpc.aiClinical.recommendTreatment.useMutation({
    onMutate: () => setIsGenerating(true),
    onSuccess: () => {
      toast.success('Treatment recommendations generated');
      refetch();
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => setIsGenerating(false),
  });

  // Accept recommendation mutation
  const acceptMutation = trpc.aiClinical.acceptTreatmentRecommendation.useMutation({
    onSuccess: () => {
      toast.success('Recommendation accepted');
      refetch();
      onRecommendationAccepted?.();
    },
    onError: (error) => toast.error(error.message),
  });

  // Reject recommendation mutation
  const rejectMutation = trpc.aiClinical.rejectTreatmentRecommendation.useMutation({
    onSuccess: () => {
      toast.success('Recommendation rejected');
      refetch();
      setRejectDialogOpen(false);
      setSelectedRecommendationId(null);
      setRejectReason('');
    },
    onError: (error) => toast.error(error.message),
  });

  const handleGenerate = useCallback(() => {
    if (!diagnosisCode) {
      toast.error('Please add a diagnosis code first');
      return;
    }
    generateMutation.mutate({
      encounterId,
      patientId,
      diagnosisCode,
      chiefComplaint: chiefComplaint || undefined,
    });
  }, [encounterId, patientId, diagnosisCode, chiefComplaint, generateMutation]);

  const handleAccept = useCallback((recommendationId: string) => {
    acceptMutation.mutate({
      recommendationId,
      modifications: modificationNote || undefined,
    });
    setModificationNote('');
  }, [acceptMutation, modificationNote]);

  const handleReject = useCallback((recommendationId: string) => {
    setSelectedRecommendationId(recommendationId);
    setRejectDialogOpen(true);
  }, []);

  const confirmReject = useCallback(() => {
    if (selectedRecommendationId && rejectReason) {
      rejectMutation.mutate({
        recommendationId: selectedRecommendationId,
        reason: rejectReason,
      });
    } else if (selectedRecommendationId) {
      toast.error('Please provide a reason for rejection');
    }
  }, [selectedRecommendationId, rejectReason, rejectMutation]);

  return (
    <>
      <Card className="h-full flex flex-col">
        <CardHeader className="py-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5 text-[#053e67]/50" />
              Treatment Recommendations
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
            Evidence-based treatment options based on diagnosis
          </CardDescription>
        </CardHeader>

        <CardContent className="flex-1 overflow-hidden p-0">
          {!recommendations || recommendations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
              <Target className="h-10 w-10 text-gray-300 mb-3" />
              <p className="text-sm text-gray-500 mb-3">
                No recommendations yet. Add a diagnosis to generate treatment suggestions.
              </p>
              {!readOnly && (
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || !diagnosisCode}
                >
                  {isGenerating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Generate Recommendations
                </Button>
              )}
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="space-y-4 p-4">
                {recommendations.map((rec) => {
                  const evidenceConfig = rec.evidenceLevel ? evidenceLevelConfig[rec.evidenceLevel as keyof typeof evidenceLevelConfig] : null;
                  const techniques = rec.techniques;

                  return (
                    <Card key={rec.id} className="border-[#053e67]/20">
                      <CardContent className="p-4">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div>
                            <h4 className="font-medium text-gray-900">{rec.condition.description}</h4>
                            <div className="flex items-center gap-2 mt-1">
                              {rec.condition.code && (
                                <Badge variant="outline" className="text-xs font-mono">
                                  {rec.condition.code}
                                </Badge>
                              )}
                              {evidenceConfig && (
                                <Badge className={cn('text-xs', evidenceConfig.color)}>
                                  Evidence: {evidenceConfig.label}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Recommendation Summary */}
                        <p className="text-sm text-gray-700 mb-3">{rec.recommendation}</p>

                        <Accordion type="single" collapsible className="w-full">
                          {/* Techniques */}
                          {techniques && techniques.length > 0 && (
                            <AccordionItem value="techniques">
                              <AccordionTrigger className="text-sm py-2">
                                <span className="flex items-center gap-2">
                                  <Activity className="h-4 w-4" />
                                  Recommended Techniques ({techniques.length})
                                </span>
                              </AccordionTrigger>
                              <AccordionContent>
                                <div className="flex flex-wrap gap-2">
                                  {techniques.map((tech, i) => (
                                    <Badge key={i} variant="secondary" className="text-xs">
                                      {tech}
                                    </Badge>
                                  ))}
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          )}

                          {/* Frequency Guidelines */}
                          {(rec.frequency || rec.duration) && (
                            <AccordionItem value="frequency">
                              <AccordionTrigger className="text-sm py-2">
                                <span className="flex items-center gap-2">
                                  <Calendar className="h-4 w-4" />
                                  Treatment Frequency & Duration
                                </span>
                              </AccordionTrigger>
                              <AccordionContent>
                                <div className="space-y-2 text-sm">
                                  {rec.frequency && (
                                    <div>
                                      <span className="font-medium">Frequency:</span>{' '}
                                      {rec.frequency}
                                    </div>
                                  )}
                                  {rec.duration && (
                                    <div>
                                      <span className="font-medium">Duration:</span>{' '}
                                      {rec.duration}
                                    </div>
                                  )}
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          )}

                          {/* Expected Outcomes */}
                          {rec.expectedOutcome && (
                            <AccordionItem value="outcomes">
                              <AccordionTrigger className="text-sm py-2">
                                <span className="flex items-center gap-2">
                                  <TrendingUp className="h-4 w-4" />
                                  Expected Outcomes
                                </span>
                              </AccordionTrigger>
                              <AccordionContent>
                                <p className="text-sm text-gray-700">{rec.expectedOutcome}</p>
                                {rec.prognosis && (
                                  <p className="text-sm text-gray-600 mt-2">
                                    <span className="font-medium">Prognosis:</span> {rec.prognosis}
                                  </p>
                                )}
                              </AccordionContent>
                            </AccordionItem>
                          )}

                        </Accordion>

                        {/* Action Buttons */}
                        {!readOnly && (
                          <>
                            <Separator className="my-3" />
                            <div className="space-y-2">
                              <Textarea
                                placeholder="Optional: Add modification notes..."
                                value={modificationNote}
                                onChange={(e) => setModificationNote(e.target.value)}
                                className="text-sm"
                                rows={2}
                              />
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleAccept(rec.id)}
                                  disabled={acceptMutation.isPending}
                                  className="flex-1"
                                >
                                  {acceptMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <>
                                      <Check className="h-4 w-4 mr-1" />
                                      Accept
                                    </>
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleReject(rec.id)}
                                  disabled={rejectMutation.isPending}
                                >
                                  <X className="h-4 w-4 mr-1" />
                                  Reject
                                </Button>
                              </div>
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Recommendation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Rejecting helps improve future recommendations.
              Please provide a reason if possible.
            </p>
            <Textarea
              placeholder="Optional: Why is this recommendation not appropriate?"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
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
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
