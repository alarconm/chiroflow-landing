'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Save,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';

interface MobileSOAPEntryProps {
  encounterId: string;
  onSaved?: () => void;
}

interface SOAPSections {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

type SOAPSection = keyof SOAPSections;

const sectionLabels: Record<SOAPSection, { label: string; placeholder: string }> = {
  subjective: {
    label: 'Subjective',
    placeholder: "Patient's complaints, history, symptoms...",
  },
  objective: {
    label: 'Objective',
    placeholder: 'Examination findings, measurements, observations...',
  },
  assessment: {
    label: 'Assessment',
    placeholder: 'Diagnosis, clinical impression, evaluation...',
  },
  plan: {
    label: 'Plan',
    placeholder: 'Treatment plan, recommendations, follow-up...',
  },
};

export function MobileSOAPEntry({ encounterId, onSaved }: MobileSOAPEntryProps) {
  const [sections, setSections] = useState<SOAPSections>({
    subjective: '',
    objective: '',
    assessment: '',
    plan: '',
  });
  const [expandedSection, setExpandedSection] = useState<SOAPSection | null>('subjective');
  const [isRecording, setIsRecording] = useState(false);
  const [activeRecordingSection, setActiveRecordingSection] = useState<SOAPSection | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const utils = trpc.useUtils();

  // Fetch existing SOAP note
  const { data: soapData, isLoading } = trpc.mobileCharting.getSOAPNote.useQuery(
    { encounterId }
  );

  // Populate sections when data loads
  useEffect(() => {
    if (soapData?.soapNote) {
      setSections({
        subjective: soapData.soapNote.subjective || '',
        objective: soapData.soapNote.objective || '',
        assessment: soapData.soapNote.assessment || '',
        plan: soapData.soapNote.plan || '',
      });
    }
  }, [soapData]);

  // Save mutation
  const saveMutation = trpc.mobileCharting.saveQuickSOAP.useMutation({
    onSuccess: () => {
      toast.success('SOAP note saved');
      setHasChanges(false);
      utils.mobileCharting.getSOAPNote.invalidate({ encounterId });
      onSaved?.();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to save');
    },
  });

  // Voice processing mutation
  const processVoiceMutation = trpc.mobileCharting.processVoiceTranscript.useMutation({
    onSuccess: (data) => {
      // Apply parsed sections
      setSections((prev) => ({
        subjective: data.sections.subjective || prev.subjective,
        objective: data.sections.objective || prev.objective,
        assessment: data.sections.assessment || prev.assessment,
        plan: data.sections.plan || prev.plan,
      }));
      setHasChanges(true);
      toast.success('Voice transcribed and parsed');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to process voice');
    },
  });

  const handleSectionChange = useCallback((section: SOAPSection, value: string) => {
    setSections((prev) => ({ ...prev, [section]: value }));
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(() => {
    saveMutation.mutate({
      encounterId,
      ...sections,
    });
  }, [encounterId, sections, saveMutation]);

  const toggleSection = useCallback((section: SOAPSection) => {
    setExpandedSection((prev) => (prev === section ? null : section));
  }, []);

  // Simulated voice recording (in production, use Web Speech API or native)
  const handleVoiceToggle = useCallback((section: SOAPSection) => {
    if (isRecording && activeRecordingSection === section) {
      setIsRecording(false);
      setActiveRecordingSection(null);
      // In production, stop recording and process transcript
      // For demo, we'll simulate with a placeholder
      toast.info('Voice recording would be processed here');
    } else {
      setIsRecording(true);
      setActiveRecordingSection(section);
      toast.info('Recording... (tap mic again to stop)');
    }
  }, [isRecording, activeRecordingSection]);

  if (isLoading) {
    return (
      <Card className="m-4">
        <CardContent className="py-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-[#053e67]" />
          <p className="mt-2 text-stone-500">Loading note...</p>
        </CardContent>
      </Card>
    );
  }

  const isLocked = soapData?.soapNote?.isLocked;

  return (
    <div className="flex flex-col h-full bg-stone-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#053e67] text-white px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">SOAP Note</h1>
            <p className="text-sm text-white/80">{soapData?.patientName || 'Patient'}</p>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && !isLocked && (
              <Badge variant="secondary" className="bg-amber-500 text-white">
                Unsaved
              </Badge>
            )}
            {isLocked && (
              <Badge variant="secondary" className="bg-red-500 text-white">
                Locked
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* SOAP Sections */}
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {(Object.keys(sectionLabels) as SOAPSection[]).map((section) => (
          <Collapsible
            key={section}
            open={expandedSection === section}
            onOpenChange={() => toggleSection(section)}
          >
            <Card
              className={cn(
                'overflow-hidden transition-all',
                expandedSection === section && 'ring-2 ring-[#053e67]'
              )}
            >
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm',
                          section === 'subjective' && 'bg-blue-500',
                          section === 'objective' && 'bg-green-500',
                          section === 'assessment' && 'bg-amber-500',
                          section === 'plan' && 'bg-purple-500'
                        )}
                      >
                        {section[0].toUpperCase()}
                      </div>
                      <CardTitle className="text-base">
                        {sectionLabels[section].label}
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      {sections[section] && (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                      {expandedSection === section ? (
                        <ChevronUp className="h-5 w-5 text-stone-400" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-stone-400" />
                      )}
                    </div>
                  </div>
                  {expandedSection !== section && sections[section] && (
                    <p className="text-sm text-stone-500 truncate mt-1 ml-10">
                      {sections[section].substring(0, 80)}
                      {sections[section].length > 80 ? '...' : ''}
                    </p>
                  )}
                </CardHeader>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <CardContent className="pt-0 px-4 pb-4">
                  <div className="relative">
                    <Textarea
                      value={sections[section]}
                      onChange={(e) => handleSectionChange(section, e.target.value)}
                      placeholder={sectionLabels[section].placeholder}
                      className="min-h-[150px] resize-none pr-12"
                      disabled={isLocked}
                    />
                    {!isLocked && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          'absolute right-2 top-2',
                          isRecording && activeRecordingSection === section && 'text-red-500'
                        )}
                        onClick={() => handleVoiceToggle(section)}
                      >
                        {isRecording && activeRecordingSection === section ? (
                          <MicOff className="h-5 w-5" />
                        ) : (
                          <Mic className="h-5 w-5" />
                        )}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ))}
      </div>

      {/* Save Button */}
      {!isLocked && (
        <div className="sticky bottom-0 bg-white border-t p-4">
          <Button
            className="w-full bg-[#053e67] hover:bg-[#053e67]/90"
            onClick={handleSave}
            disabled={saveMutation.isPending || !hasChanges}
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Note
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

export default MobileSOAPEntry;
