'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  BookOpen,
  Search,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileText,
  Loader2,
  Star,
} from 'lucide-react';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface GuidelineQuickReferenceProps {
  diagnosisCode?: string;
  condition?: string;
  bodyRegion?: string;
  encounterId?: string;
  onGuidelineApplied?: () => void;
  readOnly?: boolean;
}

const evidenceGradeConfig = {
  A: { label: 'Grade A', color: 'bg-green-100 text-green-800', description: 'Strong recommendation' },
  B: { label: 'Grade B', color: 'bg-blue-100 text-blue-800', description: 'Moderate recommendation' },
  C: { label: 'Grade C', color: 'bg-yellow-100 text-yellow-800', description: 'Weak recommendation' },
  D: { label: 'Grade D', color: 'bg-orange-100 text-orange-800', description: 'Against recommendation' },
  I: { label: 'Grade I', color: 'bg-gray-100 text-gray-800', description: 'Insufficient evidence' },
};

const evidenceLevelConfig = {
  HIGH: { label: 'High', color: 'bg-green-100 text-green-800' },
  MODERATE: { label: 'Moderate', color: 'bg-yellow-100 text-yellow-800' },
  LOW: { label: 'Low', color: 'bg-orange-100 text-orange-800' },
  VERY_LOW: { label: 'Very Low', color: 'bg-red-100 text-red-800' },
  EXPERT: { label: 'Expert', color: 'bg-blue-100 text-blue-800' },
};

export function GuidelineQuickReference({
  diagnosisCode,
  condition,
  bodyRegion,
  encounterId,
  onGuidelineApplied,
  readOnly = false,
}: GuidelineQuickReferenceProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGuideline, setSelectedGuideline] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Search guidelines
  const { data: guidelines, isLoading } = trpc.aiClinical.getGuidelines.useQuery({
    diagnosisCode,
    condition: condition || searchQuery || undefined,
    bodyRegion,
  });

  // Get guideline details
  const { data: guidelineDetail } = trpc.aiClinical.getGuidelineById.useQuery(
    { guidelineId: selectedGuideline! },
    { enabled: !!selectedGuideline }
  );

  // Track adherence mutation
  const trackAdherenceMutation = trpc.aiClinical.trackGuidelineAdherence.useMutation({
    onSuccess: () => {
      toast.success('Guideline adherence tracked');
      onGuidelineApplied?.();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleViewGuideline = useCallback((guidelineId: string) => {
    setSelectedGuideline(guidelineId);
    setSheetOpen(true);
  }, []);

  const handleTrackAdherence = useCallback((guidelineId: string, recommendationTexts: string[], followed: boolean) => {
    if (!encounterId) {
      toast.error('Encounter ID required for tracking');
      return;
    }
    trackAdherenceMutation.mutate({
      guidelineId,
      encounterId,
      recommendations: recommendationTexts.map(text => ({
        recommendationText: text,
        followed,
      })),
    });
  }, [encounterId, trackAdherenceMutation]);

  return (
    <>
      <Card className="h-full flex flex-col">
        <CardHeader className="py-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-[#053e67]/50" />
              Clinical Guidelines
            </CardTitle>
          </div>
          <CardDescription className="text-xs">
            Evidence-based practice guidelines for current condition
          </CardDescription>
        </CardHeader>

        <CardContent className="flex-1 overflow-hidden p-0">
          {/* Search */}
          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search guidelines..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </div>

          {/* Guidelines List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : !guidelines?.guidelines || guidelines.guidelines.length === 0 ? (
            <div className="text-center py-10 px-4">
              <BookOpen className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">
                {diagnosisCode || condition
                  ? 'No guidelines found for this condition'
                  : 'Enter a diagnosis or search to find guidelines'}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="space-y-2 px-4 pb-4">
                {guidelines.guidelines.map((guideline) => {
                  const evidenceConfig = evidenceLevelConfig[guideline.evidenceLevel as keyof typeof evidenceLevelConfig];

                  return (
                    <div
                      key={guideline.id}
                      className="rounded-lg border p-3 hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => handleViewGuideline(guideline.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm text-gray-900 line-clamp-2">
                            {guideline.name}
                          </h4>
                          <p className="text-xs text-gray-500 mt-1">
                            {guideline.source} • {guideline.publicationDate ? new Date(guideline.publicationDate).getFullYear() : 'N/A'}
                          </p>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            {evidenceConfig && (
                              <Badge className={cn('text-xs', evidenceConfig.color)}>
                                {evidenceConfig.label} Evidence
                              </Badge>
                            )}
                            {guideline.condition && (
                              <Badge variant="outline" className="text-xs">
                                {guideline.condition}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Guideline Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-[#053e67]" />
              {guidelineDetail?.name || 'Loading...'}
            </SheetTitle>
            <SheetDescription>
              {guidelineDetail?.source} • {guidelineDetail?.publicationDate ? new Date(guidelineDetail.publicationDate).getFullYear() : 'N/A'}
            </SheetDescription>
          </SheetHeader>

          {guidelineDetail && (
            <div className="mt-6 space-y-6">
              {/* Evidence Level */}
              <div className="flex items-center gap-2">
                {evidenceLevelConfig[guidelineDetail.evidenceLevel as keyof typeof evidenceLevelConfig] && (
                  <Badge className={cn(
                    evidenceLevelConfig[guidelineDetail.evidenceLevel as keyof typeof evidenceLevelConfig].color
                  )}>
                    {evidenceLevelConfig[guidelineDetail.evidenceLevel as keyof typeof evidenceLevelConfig].label} Quality Evidence
                  </Badge>
                )}
                {guidelineDetail.externalUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                  >
                    <a href={guidelineDetail.externalUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3 w-3 mr-1" />
                      View Source
                    </a>
                  </Button>
                )}
              </div>

              {/* Summary */}
              {guidelineDetail.summary && (
                <div>
                  <h4 className="font-medium text-sm mb-2">Summary</h4>
                  <p className="text-sm text-gray-700">{guidelineDetail.summary}</p>
                </div>
              )}

              <Separator />

              {/* Recommendations */}
              {guidelineDetail.recommendations && (guidelineDetail.recommendations as any[]).length > 0 && (
                <div>
                  <h4 className="font-medium text-sm mb-3">Key Recommendations</h4>
                  <Accordion type="single" collapsible className="w-full">
                    {(guidelineDetail.recommendations as any[]).map((rec, index) => {
                      const gradeConfig = evidenceGradeConfig[rec.grade as keyof typeof evidenceGradeConfig];

                      return (
                        <AccordionItem key={index} value={`rec-${index}`}>
                          <AccordionTrigger className="text-sm">
                            <div className="flex items-center gap-2 text-left">
                              {gradeConfig && (
                                <Badge className={cn('text-xs shrink-0', gradeConfig.color)}>
                                  {gradeConfig.label}
                                </Badge>
                              )}
                              <span className="line-clamp-1">{rec.text}</span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-2 text-sm text-gray-600 pl-2">
                              <p>{rec.text}</p>
                              {rec.evidence && (
                                <p className="text-xs">
                                  <span className="font-medium">Evidence:</span> {rec.evidence}
                                </p>
                              )}
                              {!readOnly && encounterId && (
                                <div className="flex items-center gap-2 pt-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleTrackAdherence(guidelineDetail.id, [rec.text], true);
                                    }}
                                    disabled={trackAdherenceMutation.isPending}
                                  >
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Followed
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleTrackAdherence(guidelineDetail.id, [rec.text], false);
                                    }}
                                    disabled={trackAdherenceMutation.isPending}
                                  >
                                    Not Applicable
                                  </Button>
                                </div>
                              )}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </div>
              )}

              {/* Red Flags */}
              {guidelineDetail.redFlags && (guidelineDetail.redFlags as string[]).length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="font-medium text-sm mb-2 flex items-center gap-2 text-red-600">
                      <AlertTriangle className="h-4 w-4" />
                      Red Flags to Watch For
                    </h4>
                    <ul className="space-y-1">
                      {(guidelineDetail.redFlags as string[]).map((flag, i) => (
                        <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                          <span className="text-red-500 mt-1">•</span>
                          {flag}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              {/* Referral Criteria */}
              {guidelineDetail.referralCriteria && (guidelineDetail.referralCriteria as string[]).length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="font-medium text-sm mb-2">Referral Criteria</h4>
                    <ul className="space-y-1">
                      {(guidelineDetail.referralCriteria as string[]).map((criteria, i) => (
                        <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                          <ChevronRight className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                          {criteria}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              {/* Contraindications */}
              {guidelineDetail.contraindications && (guidelineDetail.contraindications as string[]).length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="font-medium text-sm mb-2 text-orange-600">Contraindications</h4>
                    <ul className="space-y-1">
                      {(guidelineDetail.contraindications as string[]).map((contra, i) => (
                        <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                          <span className="text-orange-500 mt-1">•</span>
                          {contra}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              {/* Citation */}
              {guidelineDetail.citation && (
                <>
                  <Separator />
                  <div>
                    <h4 className="font-medium text-sm mb-2">Citation</h4>
                    <p className="text-xs text-gray-600 italic">{guidelineDetail.citation}</p>
                  </div>
                </>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
