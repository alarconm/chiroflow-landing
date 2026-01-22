'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { VoiceTranscription } from './VoiceTranscription';
import { CodeSuggestions } from './CodeSuggestions';
import { ComplianceChecker } from './ComplianceChecker';
import {
  Sparkles,
  Mic,
  FileText,
  ShieldCheck,
  Wand2,
  FileEdit,
  Loader2,
  ClipboardList,
  Brain,
} from 'lucide-react';

interface SOAPContent {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
}

interface AIAssistantPanelProps {
  encounterId: string;
  soapContent?: SOAPContent;
  onApplySOAP?: (suggestion: SOAPContent) => void;
  onSelectCodes?: (icd10: string[], cpt: string[]) => void;
  onSectionFocus?: (section: string) => void;
  disabled?: boolean;
}

export function AIAssistantPanel({
  encounterId,
  soapContent,
  onApplySOAP,
  onSelectCodes,
  onSectionFocus,
  disabled = false,
}: AIAssistantPanelProps) {
  const [activeTab, setActiveTab] = useState('generate');
  const [lastTranscription, setLastTranscription] = useState<string | null>(null);

  const { toast } = useToast();

  // Get AI status
  const { data: aiStatus, isLoading: statusLoading } = trpc.aiDocumentation.getStatus.useQuery();

  // Generate SOAP suggestion mutation
  const generateSoapMutation = trpc.aiDocumentation.generateSOAPSuggestion.useMutation({
    onSuccess: (data) => {
      toast({
        title: 'SOAP suggestion generated',
        description: `Confidence: ${Math.round(data.confidence * 100)}%`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to generate suggestion',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Auto-fill from intake mutation
  const autoFillMutation = trpc.aiDocumentation.autoFillFromIntake.useMutation({
    onSuccess: (data) => {
      onApplySOAP?.(data.suggestion);
      toast({
        title: 'SOAP note auto-filled',
        description: 'Content generated from intake form data',
      });
    },
    onError: (error) => {
      toast({
        title: 'Auto-fill failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Medical necessity mutation
  const medicalNecessityMutation = trpc.aiDocumentation.generateMedicalNecessity.useMutation({
    onSuccess: (data) => {
      // Copy to clipboard
      navigator.clipboard.writeText(data.documentation);
      toast({
        title: 'Medical necessity generated',
        description: 'Documentation copied to clipboard',
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to generate',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleTranscriptionComplete = (text: string) => {
    setLastTranscription(text);
    // Automatically generate SOAP suggestion with transcription
    generateSoapMutation.mutate({
      encounterId,
      transcription: text,
      useIntakeForm: true,
      usePreviousVisit: true,
    });
  };

  const handleGenerateSOAP = () => {
    generateSoapMutation.mutate({
      encounterId,
      transcription: lastTranscription || undefined,
      useIntakeForm: true,
      usePreviousVisit: true,
    });
  };

  const handleAutoFill = () => {
    autoFillMutation.mutate({ encounterId });
  };

  const handleMedicalNecessity = () => {
    medicalNecessityMutation.mutate({ encounterId });
  };

  const handleApplySuggestion = () => {
    if (generateSoapMutation.data) {
      onApplySOAP?.(generateSoapMutation.data);
      toast({
        title: 'Suggestion applied',
        description: 'SOAP note content has been updated',
      });
    }
  };

  if (statusLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-500" />
            AI Assistant
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {aiStatus?.provider === 'openai' ? 'OpenAI' : 'Demo Mode'}
          </Badge>
        </div>
        <CardDescription>
          AI-powered documentation assistance for faster, compliant charting
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="mx-4 mt-2 grid grid-cols-4">
            <TabsTrigger value="generate" className="text-xs">
              <Wand2 className="h-3 w-3 mr-1" />
              Generate
            </TabsTrigger>
            <TabsTrigger value="voice" className="text-xs">
              <Mic className="h-3 w-3 mr-1" />
              Voice
            </TabsTrigger>
            <TabsTrigger value="codes" className="text-xs">
              <FileText className="h-3 w-3 mr-1" />
              Codes
            </TabsTrigger>
            <TabsTrigger value="compliance" className="text-xs">
              <ShieldCheck className="h-3 w-3 mr-1" />
              Check
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1">
            <div className="p-4">
              <TabsContent value="generate" className="mt-0 space-y-4">
                <Card className="border-dashed">
                  <CardContent className="pt-4 space-y-4">
                    <div className="text-center">
                      <Sparkles className="h-10 w-10 mx-auto mb-3 text-purple-500" />
                      <h3 className="font-semibold">AI SOAP Generation</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Generate SOAP note content using patient data, intake forms, and previous visits
                      </p>
                    </div>

                    <div className="grid gap-2">
                      <Button
                        onClick={handleGenerateSOAP}
                        disabled={disabled || generateSoapMutation.isPending}
                        className="w-full"
                      >
                        {generateSoapMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Wand2 className="mr-2 h-4 w-4" />
                            Generate SOAP Suggestion
                          </>
                        )}
                      </Button>

                      <Button
                        onClick={handleAutoFill}
                        disabled={disabled || autoFillMutation.isPending}
                        variant="outline"
                        className="w-full"
                      >
                        {autoFillMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Loading Intake...
                          </>
                        ) : (
                          <>
                            <ClipboardList className="mr-2 h-4 w-4" />
                            Auto-Fill from Intake Form
                          </>
                        )}
                      </Button>

                      <Button
                        onClick={handleMedicalNecessity}
                        disabled={disabled || medicalNecessityMutation.isPending}
                        variant="outline"
                        className="w-full"
                      >
                        {medicalNecessityMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <FileEdit className="mr-2 h-4 w-4" />
                            Generate Medical Necessity
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Generated Suggestion Preview */}
                {generateSoapMutation.data && (
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">Generated Suggestion</CardTitle>
                        <Badge variant="outline">
                          {Math.round(generateSoapMutation.data.confidence * 100)}% confidence
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {generateSoapMutation.data.subjective && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">
                            SUBJECTIVE
                          </p>
                          <p className="text-sm bg-muted p-2 rounded">
                            {generateSoapMutation.data.subjective.slice(0, 200)}
                            {generateSoapMutation.data.subjective.length > 200 && '...'}
                          </p>
                        </div>
                      )}
                      {generateSoapMutation.data.objective && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">
                            OBJECTIVE
                          </p>
                          <p className="text-sm bg-muted p-2 rounded">
                            {generateSoapMutation.data.objective.slice(0, 200)}
                            {generateSoapMutation.data.objective.length > 200 && '...'}
                          </p>
                        </div>
                      )}
                      <Button onClick={handleApplySuggestion} className="w-full" size="sm">
                        Apply to SOAP Note
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="voice" className="mt-0">
                <VoiceTranscription
                  encounterId={encounterId}
                  onTranscriptionComplete={handleTranscriptionComplete}
                  disabled={disabled}
                />
              </TabsContent>

              <TabsContent value="codes" className="mt-0">
                <CodeSuggestions
                  encounterId={encounterId}
                  onSelectCodes={onSelectCodes}
                  disabled={disabled}
                />
              </TabsContent>

              <TabsContent value="compliance" className="mt-0">
                <ComplianceChecker
                  encounterId={encounterId}
                  soapContent={soapContent}
                  onIssueClick={onSectionFocus}
                />
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      </CardContent>
    </Card>
  );
}
