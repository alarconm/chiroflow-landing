'use client';

import { useState, useCallback, useEffect } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  FileText,
  Save,
  Lock,
  ClipboardList,
  Stethoscope,
  FileCheck,
  ListChecks,
  Plus,
  Loader2,
} from 'lucide-react';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface SOAPNoteEditorProps {
  encounterId: string;
  soapNote: {
    id: string;
    subjective: string | null;
    objective: string | null;
    assessment: string | null;
    plan: string | null;
    isLocked: boolean;
    lockedAt: Date | null;
    lockedBy: string | null;
    version: number;
  } | null;
  onUpdate?: () => void;
  readOnly?: boolean;
}

const SOAP_SECTIONS = [
  {
    key: 'subjective',
    label: 'Subjective',
    icon: ClipboardList,
    description: "Patient's reported symptoms, history, and chief complaint",
    placeholder:
      'Chief Complaint:\n\nHistory of Present Illness:\n\nReview of Systems:\n\nPast Medical History:\n\nMedications:\n\nAllergies:',
  },
  {
    key: 'objective',
    label: 'Objective',
    icon: Stethoscope,
    description: 'Physical examination findings and clinical observations',
    placeholder:
      'Vital Signs:\n\nGeneral Appearance:\n\nSpinal Examination:\n\nRange of Motion:\n\nNeurological:\n\nOrthopedic Tests:',
  },
  {
    key: 'assessment',
    label: 'Assessment',
    icon: FileCheck,
    description: 'Diagnoses, clinical impression, and problem list',
    placeholder:
      'Primary Diagnosis:\n\nSecondary Diagnoses:\n\nClinical Impression:\n\nPrognosis:',
  },
  {
    key: 'plan',
    label: 'Plan',
    icon: ListChecks,
    description: 'Treatment plan, procedures performed, and follow-up',
    placeholder:
      'Treatment Provided:\n\nHome Instructions:\n\nMedications/Supplements:\n\nFollow-up:\n\nReferrals:',
  },
] as const;

type SOAPSection = (typeof SOAP_SECTIONS)[number]['key'];

export function SOAPNoteEditor({
  encounterId,
  soapNote,
  onUpdate,
  readOnly = false,
}: SOAPNoteEditorProps) {
  const [values, setValues] = useState<Record<SOAPSection, string>>({
    subjective: soapNote?.subjective || '',
    objective: soapNote?.objective || '',
    assessment: soapNote?.assessment || '',
    plan: soapNote?.plan || '',
  });
  const [activeSection, setActiveSection] = useState<SOAPSection>('subjective');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showLockDialog, setShowLockDialog] = useState(false);

  const debouncedValues = useDebounce(values, 1000);

  const { data: templates } = trpc.soapNote.getTemplates.useQuery({});

  const createMutation = trpc.soapNote.create.useMutation({
    onSuccess: () => {
      toast.success('SOAP note created');
      setHasUnsavedChanges(false);
      onUpdate?.();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.soapNote.update.useMutation({
    onSuccess: () => {
      setHasUnsavedChanges(false);
      setIsSaving(false);
    },
    onError: (error) => {
      toast.error(error.message);
      setIsSaving(false);
    },
  });

  const lockMutation = trpc.soapNote.lock.useMutation({
    onSuccess: () => {
      toast.success('SOAP note signed and locked');
      onUpdate?.();
    },
    onError: (error) => toast.error(error.message),
  });

  const applyTemplateMutation = trpc.soapNote.applyTemplate.useMutation({
    onSuccess: (data) => {
      if (data) {
        setValues({
          subjective: data.subjective || '',
          objective: data.objective || '',
          assessment: data.assessment || '',
          plan: data.plan || '',
        });
        setHasUnsavedChanges(true);
        toast.success('Template applied');
      }
    },
    onError: (error) => toast.error(error.message),
  });

  // Auto-save effect
  useEffect(() => {
    if (!soapNote?.id || soapNote.isLocked || readOnly || !hasUnsavedChanges) return;

    setIsSaving(true);
    updateMutation.mutate({
      id: soapNote.id,
      ...debouncedValues,
    });
  }, [debouncedValues, soapNote?.id, soapNote?.isLocked, readOnly, hasUnsavedChanges]);

  const handleChange = useCallback(
    (section: SOAPSection, value: string) => {
      if (soapNote?.isLocked || readOnly) return;
      setValues((prev) => ({ ...prev, [section]: value }));
      setHasUnsavedChanges(true);
    },
    [soapNote?.isLocked, readOnly]
  );

  const handleCreateNote = useCallback(() => {
    createMutation.mutate({
      encounterId,
      ...values,
    });
  }, [encounterId, values, createMutation]);

  const handleApplyTemplate = useCallback(
    (templateId: string) => {
      if (soapNote?.id) {
        applyTemplateMutation.mutate({
          soapNoteId: soapNote.id,
          templateId,
        });
      }
    },
    [soapNote?.id, applyTemplateMutation]
  );

  const handleLock = useCallback(() => {
    if (!soapNote?.id) return;
    lockMutation.mutate({ id: soapNote.id });
    setShowLockDialog(false);
  }, [soapNote?.id, lockMutation]);

  const isLocked = soapNote?.isLocked || false;

  if (!soapNote) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-4">No SOAP note for this encounter</p>
          <Button onClick={handleCreateNote} disabled={createMutation.isPending}>
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Create SOAP Note
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with template select and lock status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {!isLocked && templates && templates.length > 0 && (
            <Select onValueChange={handleApplyTemplate}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Apply template..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {hasUnsavedChanges && !isLocked && (
            <div className="flex items-center gap-2 text-sm text-[#053e67]">
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>Unsaved changes</span>
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isLocked ? (
            <Badge variant="secondary" className="flex items-center gap-1">
              <Lock className="h-3 w-3" />
              Signed
            </Badge>
          ) : (
            <AlertDialog open={showLockDialog} onOpenChange={setShowLockDialog}>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={hasUnsavedChanges}>
                  <Lock className="h-4 w-4 mr-2" />
                  Sign & Lock
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Sign and Lock SOAP Note</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will lock the SOAP note for editing. Once locked, you can only add
                    addendums. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleLock}>Sign & Lock</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex gap-2 border-b">
        {SOAP_SECTIONS.map((section) => {
          const Icon = section.icon;
          const value = values[section.key];
          const hasContent = value && value.trim().length > 0;

          return (
            <button
              key={section.key}
              onClick={() => setActiveSection(section.key)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                activeSection === section.key
                  ? 'border-[#053e67]/50 text-[#053e67]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              )}
            >
              <Icon className="h-4 w-4" />
              {section.label}
              {hasContent && (
                <span className="h-2 w-2 rounded-full bg-green-500" />
              )}
            </button>
          );
        })}
      </div>

      {/* Active section editor */}
      {SOAP_SECTIONS.map((section) => (
        <div
          key={section.key}
          className={cn(activeSection === section.key ? 'block' : 'hidden')}
        >
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">{section.label}</CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={values[section.key]}
                onChange={(e) => handleChange(section.key, e.target.value)}
                placeholder={section.placeholder}
                className="min-h-[300px] font-mono text-sm resize-y"
                disabled={isLocked || readOnly}
              />
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}
