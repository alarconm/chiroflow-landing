'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
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
import { toast } from 'sonner';
import {
  Wand2,
  Sparkles,
  FileText,
  ClipboardList,
  Stethoscope,
  FileCheck,
  ListChecks,
  Loader2,
  Check,
  X,
  Edit,
  RefreshCw,
  ChevronRight,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  Copy,
  History,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SOAPContent {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
}

interface SOAPGenerationPanelProps {
  encounterId: string;
  transcript?: string;
  onApplySOAP?: (content: SOAPContent) => void;
  onApplySection?: (section: keyof SOAPContent, content: string) => void;
  disabled?: boolean;
}

interface DraftNote {
  id: string;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  overallConfidence: number | null;
  subjectiveConfidence: number | null;
  objectiveConfidence: number | null;
  assessmentConfidence: number | null;
  planConfidence: number | null;
  status: string;
  styleMatchScore: number | null;
  createdAt: Date;
}

const SECTIONS = [
  { key: 'subjective', label: 'Subjective', icon: ClipboardList, shortLabel: 'S' },
  { key: 'objective', label: 'Objective', icon: Stethoscope, shortLabel: 'O' },
  { key: 'assessment', label: 'Assessment', icon: FileCheck, shortLabel: 'A' },
  { key: 'plan', label: 'Plan', icon: ListChecks, shortLabel: 'P' },
] as const;

export function SOAPGenerationPanel({
  encounterId,
  transcript,
  onApplySOAP,
  onApplySection,
  disabled = false,
}: SOAPGenerationPanelProps) {
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [editingSection, setEditingSection] = useState<keyof SOAPContent | null>(null);
  const [editText, setEditText] = useState('');
  const [activeTab, setActiveTab] = useState('generate');

  // tRPC queries
  const { data: draftNotes, refetch: refetchDrafts } = trpc.aiDoc.listDraftNotes.useQuery({
    encounterId,
    status: undefined,
  });

  const { data: selectedDraft } = trpc.aiDoc.getDraftNote.useQuery(
    { draftNoteId: selectedDraftId! },
    { enabled: !!selectedDraftId }
  );

  // tRPC mutations
  const generateMutation = trpc.aiDoc.generateSOAP.useMutation({
    onSuccess: (data) => {
      setSelectedDraftId(data.draftNoteId);
      refetchDrafts();
      toast.success('SOAP note generated');
    },
    onError: (error) => toast.error(error.message),
  });

  const regenerateMutation = trpc.aiDoc.regenerateSOAP.useMutation({
    onSuccess: (data) => {
      setSelectedDraftId(data.draftNoteId);
      refetchDrafts();
      toast.success('SOAP note regenerated');
    },
    onError: (error) => toast.error(error.message),
  });

  const updateDraftMutation = trpc.aiDoc.updateDraftNote.useMutation({
    onSuccess: () => {
      refetchDrafts();
      setEditingSection(null);
      toast.success('Draft updated');
    },
    onError: (error) => toast.error(error.message),
  });

  const approveMutation = trpc.aiDoc.approveDraftNote.useMutation({
    onSuccess: () => {
      refetchDrafts();
      toast.success('Draft approved');
    },
    onError: (error) => toast.error(error.message),
  });

  const rejectMutation = trpc.aiDoc.rejectDraftNote.useMutation({
    onSuccess: () => {
      setSelectedDraftId(null);
      refetchDrafts();
      toast.info('Draft rejected');
    },
    onError: (error) => toast.error(error.message),
  });

  const applyMutation = trpc.aiDoc.applyDraftNote.useMutation({
    onSuccess: () => {
      refetchDrafts();
      toast.success('SOAP note applied to encounter');
    },
    onError: (error) => toast.error(error.message),
  });

  // Handlers
  const handleGenerate = () => {
    generateMutation.mutate({
      encounterId,
      transcriptionId: undefined, // Uses latest completed transcription
      includeStyleMatching: true,
      previousNoteId: undefined,
    });
  };

  const handleRegenerate = (section?: keyof SOAPContent) => {
    if (!selectedDraftId) return;
    regenerateMutation.mutate({
      draftNoteId: selectedDraftId,
      additionalContext: transcript,
      focusAreas: section ? [section] : undefined,
    });
  };

  const handleEdit = (section: keyof SOAPContent, content: string | null) => {
    setEditingSection(section);
    setEditText(content || '');
  };

  const handleSaveEdit = () => {
    if (!selectedDraftId || !editingSection) return;
    updateDraftMutation.mutate({
      draftNoteId: selectedDraftId,
      [editingSection]: editText,
      editReason: 'Manual edit by provider',
    });
  };

  const handleApprove = () => {
    if (!selectedDraftId) return;
    approveMutation.mutate({ draftNoteId: selectedDraftId });
  };

  const handleReject = () => {
    if (!selectedDraftId) return;
    rejectMutation.mutate({
      draftNoteId: selectedDraftId,
      rejectionReason: 'Provider rejected draft',
    });
  };

  const handleApplyToEncounter = () => {
    if (!selectedDraftId) return;
    applyMutation.mutate({ draftNoteId: selectedDraftId });
    if (selectedDraft && onApplySOAP) {
      onApplySOAP({
        subjective: selectedDraft.subjective || undefined,
        objective: selectedDraft.objective || undefined,
        assessment: selectedDraft.assessment || undefined,
        plan: selectedDraft.plan || undefined,
      });
    }
  };

  const handleCopySection = (content: string | null) => {
    if (content) {
      navigator.clipboard.writeText(content);
      toast.success('Copied to clipboard');
    }
  };

  const handleApplySection = (section: keyof SOAPContent) => {
    if (!selectedDraft) return;
    const content = selectedDraft[section];
    if (content && onApplySection) {
      onApplySection(section, content);
      toast.success(`${section.charAt(0).toUpperCase() + section.slice(1)} applied`);
    }
  };

  // Confidence badge
  const ConfidenceBadge = ({ confidence }: { confidence: number | null }) => {
    if (confidence === null) return null;
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

  // Render section content
  const renderSection = (
    section: typeof SECTIONS[number],
    content: string | null,
    confidence: number | null
  ) => {
    const Icon = section.icon;
    const isEditing = editingSection === section.key;

    return (
      <AccordionItem key={section.key} value={section.key}>
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center gap-2 flex-1">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <span className="font-medium">{section.label}</span>
            <ConfidenceBadge confidence={confidence} />
            {content && (
              <Badge variant="secondary" className="ml-auto mr-2 text-xs">
                {content.length} chars
              </Badge>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent>
          {isEditing ? (
            <div className="space-y-2 pt-2">
              <Textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="min-h-[150px] font-mono text-sm"
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingSection(null)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveEdit}
                  disabled={updateDraftMutation.isPending}
                >
                  {updateDraftMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-2 h-4 w-4" />
                  )}
                  Save
                </Button>
              </div>
            </div>
          ) : content ? (
            <div className="space-y-2 pt-2">
              <div className="bg-muted rounded-md p-3">
                <p className="text-sm whitespace-pre-wrap">{content}</p>
              </div>
              <div className="flex justify-end gap-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleCopySection(content)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copy</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEdit(section.key, content)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Edit</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleRegenerate(section.key)}
                        disabled={regenerateMutation.isPending}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Regenerate</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleApplySection(section.key)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Apply to Note</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic pt-2">
              No content generated for this section
            </p>
          )}
        </AccordionContent>
      </AccordionItem>
    );
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-purple-500" />
            SOAP Generation
          </CardTitle>
          {selectedDraft && (
            <Badge
              variant="outline"
              className={cn(
                selectedDraft.status === 'APPROVED'
                  ? 'bg-green-50 text-green-700'
                  : selectedDraft.status === 'REJECTED'
                  ? 'bg-red-50 text-red-700'
                  : selectedDraft.status === 'APPLIED'
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-yellow-50 text-yellow-700'
              )}
            >
              {selectedDraft.status}
            </Badge>
          )}
        </div>
        <CardDescription>
          AI-generated SOAP notes from transcription
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="generate" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Generate
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              History {draftNotes && draftNotes.length > 0 && `(${draftNotes.length})`}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="generate" className="flex-1 flex flex-col overflow-hidden mt-4">
            {!selectedDraft ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mb-4">
                  <Wand2 className="h-8 w-8 text-purple-500" />
                </div>
                <h3 className="font-semibold mb-2">Generate SOAP Note</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-xs">
                  {transcript
                    ? 'AI will analyze your transcription and generate a complete SOAP note'
                    : 'Start by recording a transcription, or generate based on patient history'}
                </p>
                <Button
                  onClick={handleGenerate}
                  disabled={disabled || generateMutation.isPending}
                  size="lg"
                >
                  {generateMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-5 w-5" />
                      One-Click Generate
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <ScrollArea className="flex-1">
                <div className="space-y-4 pr-4">
                  {/* Overall confidence */}
                  {selectedDraft.overallConfidence != null && (
                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary" />
                        <span className="font-medium">Overall Confidence</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={selectedDraft.overallConfidence * 100}
                          className="w-24 h-2"
                        />
                        <span className="text-sm font-medium">
                          {Math.round(selectedDraft.overallConfidence * 100)}%
                        </span>
                      </div>
                    </div>
                  )}

                  {selectedDraft.styleMatchScore != null && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <AlertCircle className="h-4 w-4" />
                      <span>
                        Matched to your documentation style (
                        {Math.round(selectedDraft.styleMatchScore * 100)}% match)
                      </span>
                    </div>
                  )}

                  <Separator />

                  {/* Sections */}
                  <Accordion
                    type="multiple"
                    defaultValue={['subjective', 'objective', 'assessment', 'plan']}
                  >
                    {SECTIONS.map((section) => {
                      const content = selectedDraft[section.key as keyof typeof selectedDraft] as string | null;
                      const confidenceKey = `${section.key}Confidence` as keyof typeof selectedDraft;
                      const confidence = selectedDraft[confidenceKey] as number | null;
                      return renderSection(section, content, confidence);
                    })}
                  </Accordion>

                  <Separator />

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleReject}
                            disabled={rejectMutation.isPending}
                          >
                            <ThumbsDown className="mr-2 h-4 w-4" />
                            Reject
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Discard this draft</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleApprove}
                            disabled={
                              approveMutation.isPending ||
                              selectedDraft.status === 'APPROVED'
                            }
                          >
                            <ThumbsUp className="mr-2 h-4 w-4" />
                            Approve
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Mark as reviewed</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <Button
                      size="sm"
                      onClick={handleApplyToEncounter}
                      disabled={applyMutation.isPending}
                      className="ml-auto"
                    >
                      {applyMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      Apply to Encounter
                    </Button>
                  </div>

                  {/* Regenerate all */}
                  <Button
                    variant="outline"
                    onClick={() => handleRegenerate()}
                    disabled={regenerateMutation.isPending}
                    className="w-full"
                  >
                    {regenerateMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Regenerate All Sections
                  </Button>
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="history" className="flex-1 overflow-hidden mt-4">
            <ScrollArea className="h-full">
              {draftNotes && draftNotes.length > 0 ? (
                <div className="space-y-2 pr-4">
                  {draftNotes.map((draft) => (
                    <button
                      key={draft.id}
                      onClick={() => {
                        setSelectedDraftId(draft.id);
                        setActiveTab('generate');
                      }}
                      className={cn(
                        'w-full p-3 rounded-lg border text-left transition-colors hover:bg-muted',
                        selectedDraftId === draft.id && 'border-primary bg-primary/5'
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs',
                            draft.status === 'APPROVED'
                              ? 'bg-green-50 text-green-700'
                              : draft.status === 'REJECTED'
                              ? 'bg-red-50 text-red-700'
                              : draft.status === 'APPLIED'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-yellow-50 text-yellow-700'
                          )}
                        >
                          {draft.status}
                        </Badge>
                        <ConfidenceBadge confidence={draft.overallConfidence} />
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {draft.subjective || draft.assessment || 'No content'}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                  <History className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm">No draft notes yet</p>
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
