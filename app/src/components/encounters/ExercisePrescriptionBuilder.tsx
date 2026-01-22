'use client';

import { useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Dumbbell,
  Search,
  GripVertical,
  Trash2,
  Loader2,
  Eye,
  FileText,
  Play,
  Clock,
  Target,
  TrendingUp,
  Copy,
  Printer,
  CheckCircle2,
  XCircle,
  LayoutTemplate,
  Send,
} from 'lucide-react';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface ExercisePrescriptionBuilderProps {
  patientId: string;
  encounterId?: string;
  treatmentPlanId?: string;
  diagnosisId?: string;
  readOnly?: boolean;
  onPrescriptionCreated?: () => void;
}

interface SelectedExercise {
  id: string;
  exerciseId: string;
  exercise: {
    id: string;
    name: string;
    description: string;
    instructions: string;
    videoUrl: string | null;
    imageUrl: string | null;
    difficulty: string;
    bodyRegion: string;
    defaultSets: number | null;
    defaultReps: number | null;
    defaultHoldTime: number | null;
    defaultFrequency: string | null;
    category: { name: string };
  };
  sets: number | null;
  reps: number | null;
  holdTime: number | null;
  frequency: string | null;
  specialInstructions: string | null;
}

// Common exercise protocols/templates
const EXERCISE_PROTOCOLS = [
  {
    id: 'cervical-rehab',
    name: 'Cervical Rehabilitation',
    description: 'Basic cervical spine rehabilitation protocol',
    exercises: ['chin-tucks', 'upper-trapezius-stretch', 'levator-scapulae-stretch', 'isometric-neck-flexion'],
    bodyRegion: 'CERVICAL',
    duration: '4 weeks',
  },
  {
    id: 'lumbar-core',
    name: 'Lumbar & Core Stability',
    description: 'Core strengthening for low back pain',
    exercises: ['knee-to-chest', 'cat-cow', 'dead-bug', 'bird-dog', 'plank'],
    bodyRegion: 'LUMBAR',
    duration: '6 weeks',
  },
  {
    id: 'posture-correction',
    name: 'Posture Correction',
    description: 'Exercises for improved posture',
    exercises: ['wall-angels', 'brueggers-relief', 'chin-tucks', 'thoracic-extension'],
    bodyRegion: 'FULL_BODY',
    duration: '4 weeks',
  },
  {
    id: 'sciatica-relief',
    name: 'Sciatica Relief',
    description: 'Exercises for sciatic nerve pain',
    exercises: ['piriformis-stretch', 'knee-to-chest', 'cat-cow', 'hip-flexor-stretch'],
    bodyRegion: 'LUMBAR',
    duration: '4 weeks',
  },
  {
    id: 'balance-proprioception',
    name: 'Balance & Proprioception',
    description: 'Balance training for stability',
    exercises: ['single-leg-balance', 'bird-dog'],
    bodyRegion: 'LOWER_EXTREMITY',
    duration: '4 weeks',
  },
];

const BODY_REGION_LABELS: Record<string, string> = {
  CERVICAL: 'Cervical (Neck)',
  THORACIC: 'Thoracic (Mid-Back)',
  LUMBAR: 'Lumbar (Low-Back)',
  SACRAL: 'Sacral (Pelvis)',
  UPPER_EXTREMITY: 'Upper Extremity',
  LOWER_EXTREMITY: 'Lower Extremity',
  CORE: 'Core',
  FULL_BODY: 'Full Body',
};

const DIFFICULTY_COLORS: Record<string, string> = {
  BEGINNER: 'bg-green-100 text-green-800',
  INTERMEDIATE: 'bg-yellow-100 text-yellow-800',
  ADVANCED: 'bg-red-100 text-red-800',
};

export function ExercisePrescriptionBuilder({
  patientId,
  encounterId,
  treatmentPlanId,
  diagnosisId,
  readOnly = false,
  onPrescriptionCreated,
}: ExercisePrescriptionBuilderProps) {
  const [activeTab, setActiveTab] = useState<'library' | 'selected' | 'templates'>('library');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBodyRegion, setSelectedBodyRegion] = useState<string | undefined>();
  const [selectedDifficulty, setSelectedDifficulty] = useState<string | undefined>();
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [selectedExercises, setSelectedExercises] = useState<SelectedExercise[]>([]);
  const [editingExercise, setEditingExercise] = useState<SelectedExercise | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showHandout, setShowHandout] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Fetch exercises from library
  const { data: exerciseData, isLoading: isLoadingExercises } = trpc.exercise.list.useQuery({
    categoryId: selectedCategory || undefined,
    bodyRegion: selectedBodyRegion as 'CERVICAL' | 'THORACIC' | 'LUMBAR' | 'SACRAL' | 'UPPER_EXTREMITY' | 'LOWER_EXTREMITY' | 'CORE' | 'FULL_BODY' | undefined,
    difficulty: selectedDifficulty as 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | undefined,
    search: searchQuery || undefined,
    limit: 50,
  });

  // Fetch categories
  const { data: categories } = trpc.exercise.getCategories.useQuery();

  // Fetch body regions
  const { data: bodyRegions } = trpc.exercise.getBodyRegions.useQuery();

  // Fetch existing prescriptions for this patient
  const { data: existingPrescriptions, refetch: refetchPrescriptions } = trpc.prescription.list.useQuery({
    patientId,
    status: 'ACTIVE',
  });

  // Fetch prescription summary for effectiveness tracking
  const { data: prescriptionSummary } = trpc.prescription.getSummary.useQuery({ patientId });

  // Bulk create mutation
  const bulkCreateMutation = trpc.prescription.bulkCreate.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} exercise(s) prescribed successfully`);
      setSelectedExercises([]);
      refetchPrescriptions();
      onPrescriptionCreated?.();
    },
    onError: (error) => toast.error(error.message),
  });

  const exercises = exerciseData?.exercises || [];

  // Add exercise to selection
  const handleAddExercise = useCallback((exercise: typeof exercises[0]) => {
    const existingIds = selectedExercises.map((e) => e.exerciseId);
    if (existingIds.includes(exercise.id)) {
      toast.error('Exercise already added');
      return;
    }

    const newSelection: SelectedExercise = {
      id: `temp-${Date.now()}`,
      exerciseId: exercise.id,
      exercise: {
        id: exercise.id,
        name: exercise.name,
        description: exercise.description,
        instructions: exercise.instructions,
        videoUrl: exercise.videoUrl,
        imageUrl: exercise.imageUrl,
        difficulty: exercise.difficulty,
        bodyRegion: exercise.bodyRegion,
        defaultSets: exercise.defaultSets,
        defaultReps: exercise.defaultReps,
        defaultHoldTime: exercise.defaultHoldTime,
        defaultFrequency: exercise.defaultFrequency,
        category: exercise.category,
      },
      sets: exercise.defaultSets,
      reps: exercise.defaultReps,
      holdTime: exercise.defaultHoldTime,
      frequency: exercise.defaultFrequency,
      specialInstructions: null,
    };

    setSelectedExercises((prev) => [...prev, newSelection]);
    toast.success(`Added: ${exercise.name}`);
  }, [selectedExercises]);

  // Remove exercise from selection
  const handleRemoveExercise = useCallback((id: string) => {
    setSelectedExercises((prev) => prev.filter((e) => e.id !== id));
    setDeleteConfirm(null);
  }, []);

  // Update exercise parameters
  const handleUpdateExercise = useCallback((updated: SelectedExercise) => {
    setSelectedExercises((prev) =>
      prev.map((e) => (e.id === updated.id ? updated : e))
    );
    setEditingExercise(null);
  }, []);

  // Apply protocol/template
  const handleApplyProtocol = useCallback((protocol: typeof EXERCISE_PROTOCOLS[0]) => {
    const protocolExercises = exercises.filter((e) =>
      protocol.exercises.some((name) =>
        e.name.toLowerCase().includes(name.replace(/-/g, ' ').toLowerCase()) ||
        e.name.toLowerCase().replace(/['\s]/g, '-').includes(name)
      )
    );

    if (protocolExercises.length === 0) {
      toast.error('No matching exercises found for this protocol. Please seed the exercise library first.');
      return;
    }

    const newSelections: SelectedExercise[] = protocolExercises.map((exercise) => ({
      id: `temp-${Date.now()}-${exercise.id}`,
      exerciseId: exercise.id,
      exercise: {
        id: exercise.id,
        name: exercise.name,
        description: exercise.description,
        instructions: exercise.instructions,
        videoUrl: exercise.videoUrl,
        imageUrl: exercise.imageUrl,
        difficulty: exercise.difficulty,
        bodyRegion: exercise.bodyRegion,
        defaultSets: exercise.defaultSets,
        defaultReps: exercise.defaultReps,
        defaultHoldTime: exercise.defaultHoldTime,
        defaultFrequency: exercise.defaultFrequency,
        category: exercise.category,
      },
      sets: exercise.defaultSets,
      reps: exercise.defaultReps,
      holdTime: exercise.defaultHoldTime,
      frequency: exercise.defaultFrequency,
      specialInstructions: null,
    }));

    setSelectedExercises((prev) => {
      const existingIds = new Set(prev.map((e) => e.exerciseId));
      const uniqueNew = newSelections.filter((e) => !existingIds.has(e.exerciseId));
      return [...prev, ...uniqueNew];
    });

    toast.success(`Applied ${protocol.name} protocol (${protocolExercises.length} exercises)`);
    setActiveTab('selected');
  }, [exercises]);

  // Drag and drop handlers
  const handleDragStart = useCallback((index: number) => {
    setDraggedIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    setSelectedExercises((prev) => {
      const newList = [...prev];
      const [draggedItem] = newList.splice(draggedIndex, 1);
      newList.splice(index, 0, draggedItem);
      return newList;
    });
    setDraggedIndex(index);
  }, [draggedIndex]);

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
  }, []);

  // Prescribe selected exercises
  const handlePrescribe = useCallback(() => {
    if (selectedExercises.length === 0) {
      toast.error('Please select at least one exercise');
      return;
    }

    bulkCreateMutation.mutate({
      patientId,
      prescriptions: selectedExercises.map((e) => ({
        exerciseId: e.exerciseId,
        sets: e.sets,
        reps: e.reps,
        holdTime: e.holdTime,
        frequency: e.frequency,
        specialInstructions: e.specialInstructions,
      })),
      encounterId: encounterId || undefined,
      treatmentPlanId: treatmentPlanId || undefined,
      diagnosisId: diagnosisId || undefined,
    });
  }, [selectedExercises, patientId, encounterId, treatmentPlanId, diagnosisId, bulkCreateMutation]);

  // Generate printable handout HTML
  const generateHandoutHtml = useMemo(() => {
    if (selectedExercises.length === 0) return '';

    const escapeHtml = (str: string) => {
      const div = typeof document !== 'undefined' ? document.createElement('div') : null;
      if (div) {
        div.textContent = str;
        return div.innerHTML;
      }
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };

    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    @media print {
      body { margin: 0; padding: 20px; }
      .no-print { display: none; }
      .page-break { page-break-before: always; }
    }
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 40px; }
    .header { text-align: center; border-bottom: 2px solid #053e67; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { color: #053e67; margin: 0; font-size: 24px; }
    .exercise { margin-bottom: 30px; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
    .exercise h2 { color: #053e67; margin: 0 0 10px 0; font-size: 18px; }
    .params { display: flex; gap: 20px; margin: 15px 0; flex-wrap: wrap; }
    .param { background: #f5f5f5; padding: 8px 12px; border-radius: 4px; }
    .param strong { color: #053e67; }
    .instructions { margin-top: 15px; white-space: pre-line; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; text-align: center; }
    @page { margin: 0.5in; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Your Exercise Program</h1>
    <p>Date: ${format(new Date(), 'MMMM d, yyyy')}</p>
  </div>

  ${selectedExercises.map((e, i) => `
  <div class="exercise ${i > 0 && i % 3 === 0 ? 'page-break' : ''}">
    <h2>${i + 1}. ${escapeHtml(e.exercise.name)}</h2>
    <p>${escapeHtml(e.exercise.description)}</p>
    <div class="params">
      ${e.sets ? `<div class="param"><strong>Sets:</strong> ${e.sets}</div>` : ''}
      ${e.reps ? `<div class="param"><strong>Reps:</strong> ${e.reps}</div>` : ''}
      ${e.holdTime ? `<div class="param"><strong>Hold:</strong> ${e.holdTime} sec</div>` : ''}
      ${e.frequency ? `<div class="param"><strong>Frequency:</strong> ${escapeHtml(e.frequency)}</div>` : ''}
    </div>
    <div class="instructions">
      <strong>Instructions:</strong><br>
      ${escapeHtml(e.exercise.instructions)}
    </div>
    ${e.specialInstructions ? `<p style="margin-top: 10px; color: #c90000;"><strong>Special Instructions:</strong> ${escapeHtml(e.specialInstructions)}</p>` : ''}
  </div>
  `).join('')}

  <div class="footer">
    <p>If you experience increased pain or new symptoms, stop exercising and contact your provider.</p>
    <p>Generated on ${format(new Date(), 'MMMM d, yyyy')}</p>
  </div>
</body>
</html>
`;
  }, [selectedExercises]);

  // Open handout in new window safely
  const handleOpenHandout = useCallback(() => {
    const blob = new Blob([generateHandoutHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const newWindow = window.open(url, '_blank');
    if (newWindow) {
      newWindow.onload = () => URL.revokeObjectURL(url);
    }
  }, [generateHandoutHtml]);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedBodyRegion(undefined);
    setSelectedDifficulty(undefined);
    setSelectedCategory(undefined);
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Dumbbell className="h-5 w-5 text-[#053e67]/50" />
              Exercise Prescription
            </CardTitle>
            <CardDescription>
              Prescribe therapeutic exercises from the library
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {/* Prescription effectiveness summary */}
            {prescriptionSummary && prescriptionSummary.compliance.rate !== null && (
              <div className="flex items-center gap-2 text-sm mr-4">
                <TrendingUp className="h-4 w-4 text-green-500" />
                <span className="text-gray-500">Compliance:</span>
                <span className={cn(
                  'font-medium',
                  prescriptionSummary.compliance.rate >= 80 ? 'text-green-600' :
                  prescriptionSummary.compliance.rate >= 50 ? 'text-yellow-600' : 'text-red-600'
                )}>
                  {prescriptionSummary.compliance.rate}%
                </span>
              </div>
            )}
            {selectedExercises.length > 0 && !readOnly && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPreview(true)}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Preview
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowHandout(true)}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Handout
                </Button>
                <Button
                  size="sm"
                  onClick={handlePrescribe}
                  disabled={bulkCreateMutation.isPending}
                >
                  {bulkCreateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Prescribe ({selectedExercises.length})
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="mb-4">
            <TabsTrigger value="library" className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Exercise Library
            </TabsTrigger>
            <TabsTrigger value="selected" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Selected ({selectedExercises.length})
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex items-center gap-2">
              <LayoutTemplate className="h-4 w-4" />
              Templates
            </TabsTrigger>
          </TabsList>

          {/* Exercise Library Tab */}
          <TabsContent value="library" className="space-y-4">
            {/* Search and filters */}
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search exercises..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={selectedBodyRegion || ''} onValueChange={(v) => setSelectedBodyRegion(v || undefined)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Body Region" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Regions</SelectItem>
                  {bodyRegions?.map((r) => (
                    <SelectItem key={r.region} value={r.region}>
                      {r.label} ({r.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedDifficulty || ''} onValueChange={(v) => setSelectedDifficulty(v || undefined)}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Difficulty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Levels</SelectItem>
                  <SelectItem value="BEGINNER">Beginner</SelectItem>
                  <SelectItem value="INTERMEDIATE">Intermediate</SelectItem>
                  <SelectItem value="ADVANCED">Advanced</SelectItem>
                </SelectContent>
              </Select>
              <Select value={selectedCategory || ''} onValueChange={(v) => setSelectedCategory(v || undefined)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Categories</SelectItem>
                  {categories?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.exerciseCount})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(searchQuery || selectedBodyRegion || selectedDifficulty || selectedCategory) && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <XCircle className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              )}
            </div>

            {/* Exercise grid */}
            <ScrollArea className="h-[400px]">
              {isLoadingExercises ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : exercises.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {exercises.map((exercise) => {
                    const isSelected = selectedExercises.some((e) => e.exerciseId === exercise.id);
                    return (
                      <div
                        key={exercise.id}
                        className={cn(
                          'p-4 rounded-lg border transition-all cursor-pointer',
                          isSelected
                            ? 'border-[#053e67] bg-[#053e67]/5'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        )}
                        onClick={() => !readOnly && handleAddExercise(exercise)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <h4 className="font-medium text-sm">{exercise.name}</h4>
                            <p className="text-xs text-gray-500">{exercise.category.name}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={cn('text-xs', DIFFICULTY_COLORS[exercise.difficulty])}>
                              {exercise.difficulty.toLowerCase()}
                            </Badge>
                            {isSelected && (
                              <CheckCircle2 className="h-4 w-4 text-[#053e67]" />
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-gray-600 line-clamp-2">{exercise.description}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                          {exercise.defaultSets && <span>{exercise.defaultSets} sets</span>}
                          {exercise.defaultReps && <span>{exercise.defaultReps} reps</span>}
                          {exercise.defaultHoldTime && <span>{exercise.defaultHoldTime}s hold</span>}
                          {exercise.videoUrl && (
                            <Play className="h-3 w-3" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-12 text-center">
                  <Dumbbell className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No exercises found</p>
                  <p className="text-sm text-gray-400 mt-1">Try adjusting your filters or search query</p>
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Selected Exercises Tab */}
          <TabsContent value="selected" className="space-y-4">
            {selectedExercises.length > 0 ? (
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {selectedExercises.map((exercise, index) => (
                    <div
                      key={exercise.id}
                      draggable={!readOnly}
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragEnd={handleDragEnd}
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-lg border bg-white',
                        draggedIndex === index ? 'opacity-50' : ''
                      )}
                    >
                      {!readOnly && (
                        <div className="cursor-grab active:cursor-grabbing text-gray-400">
                          <GripVertical className="h-5 w-5" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-500">#{index + 1}</span>
                          <h4 className="font-medium truncate">{exercise.exercise.name}</h4>
                          <Badge variant="outline" className="text-xs">
                            {exercise.exercise.category.name}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                          {exercise.sets && <span>{exercise.sets} sets</span>}
                          {exercise.reps && <span>{exercise.reps} reps</span>}
                          {exercise.holdTime && <span>{exercise.holdTime}s hold</span>}
                          {exercise.frequency && <span>{exercise.frequency}</span>}
                        </div>
                      </div>
                      {!readOnly && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingExercise(exercise)}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteConfirm(exercise.id)}
                            className="text-gray-400 hover:text-red-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="py-12 text-center">
                <Target className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No exercises selected</p>
                <p className="text-sm text-gray-400 mt-1">
                  Browse the library or apply a template to get started
                </p>
              </div>
            )}
          </TabsContent>

          {/* Templates Tab */}
          <TabsContent value="templates" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {EXERCISE_PROTOCOLS.map((protocol) => (
                <div
                  key={protocol.id}
                  className="p-4 rounded-lg border border-gray-200 hover:border-[#053e67]/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-medium">{protocol.name}</h4>
                      <p className="text-sm text-gray-500">{protocol.description}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {BODY_REGION_LABELS[protocol.bodyRegion] || protocol.bodyRegion}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <Clock className="h-3 w-3" />
                      {protocol.duration}
                      <span className="mx-1">•</span>
                      {protocol.exercises.length} exercises
                    </div>
                    {!readOnly && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleApplyProtocol(protocol)}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Apply
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Existing prescriptions section */}
        {existingPrescriptions && existingPrescriptions.prescriptions.length > 0 && (
          <div className="mt-6 pt-6 border-t">
            <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Active Prescriptions ({existingPrescriptions.prescriptions.length})
            </h4>
            <div className="space-y-2">
              {existingPrescriptions.prescriptions.slice(0, 5).map((prescription) => (
                <div
                  key={prescription.id}
                  className="flex items-center justify-between p-2 rounded bg-gray-50"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {prescription.exercise?.name || 'Unknown Exercise'}
                    </span>
                    <span className="text-xs text-gray-400">
                      {prescription.sets && `${prescription.sets} sets`}
                      {prescription.reps && ` × ${prescription.reps} reps`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">
                      {format(new Date(prescription.prescribedAt), 'MMM d')}
                    </span>
                  </div>
                </div>
              ))}
              {existingPrescriptions.prescriptions.length > 5 && (
                <p className="text-xs text-gray-400 text-center">
                  + {existingPrescriptions.prescriptions.length - 5} more
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>

      {/* Edit Exercise Dialog */}
      <Dialog open={!!editingExercise} onOpenChange={() => setEditingExercise(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Exercise Parameters</DialogTitle>
            <DialogDescription>
              Customize the prescription parameters for this exercise
            </DialogDescription>
          </DialogHeader>
          {editingExercise && (
            <div className="space-y-4">
              <div>
                <h4 className="font-medium">{editingExercise.exercise.name}</h4>
                <p className="text-sm text-gray-500">{editingExercise.exercise.category.name}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Sets</Label>
                  <Input
                    type="number"
                    min={1}
                    value={editingExercise.sets || ''}
                    onChange={(e) => setEditingExercise({
                      ...editingExercise,
                      sets: e.target.value ? parseInt(e.target.value) : null,
                    })}
                    placeholder="e.g., 3"
                  />
                </div>
                <div>
                  <Label>Reps</Label>
                  <Input
                    type="number"
                    min={1}
                    value={editingExercise.reps || ''}
                    onChange={(e) => setEditingExercise({
                      ...editingExercise,
                      reps: e.target.value ? parseInt(e.target.value) : null,
                    })}
                    placeholder="e.g., 10"
                  />
                </div>
                <div>
                  <Label>Hold Time (seconds)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={editingExercise.holdTime || ''}
                    onChange={(e) => setEditingExercise({
                      ...editingExercise,
                      holdTime: e.target.value ? parseInt(e.target.value) : null,
                    })}
                    placeholder="e.g., 30"
                  />
                </div>
                <div>
                  <Label>Frequency</Label>
                  <Input
                    value={editingExercise.frequency || ''}
                    onChange={(e) => setEditingExercise({
                      ...editingExercise,
                      frequency: e.target.value || null,
                    })}
                    placeholder="e.g., 2x daily"
                  />
                </div>
              </div>
              <div>
                <Label>Special Instructions</Label>
                <Textarea
                  value={editingExercise.specialInstructions || ''}
                  onChange={(e) => setEditingExercise({
                    ...editingExercise,
                    specialInstructions: e.target.value || null,
                  })}
                  placeholder="Any modifications or precautions specific to this patient..."
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingExercise(null)}>
              Cancel
            </Button>
            <Button onClick={() => editingExercise && handleUpdateExercise(editingExercise)}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Exercise</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this exercise from the selection?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && handleRemoveExercise(deleteConfirm)}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Preview Sheet */}
      <Sheet open={showPreview} onOpenChange={setShowPreview}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Patient Preview</SheetTitle>
            <SheetDescription>
              How the exercises will appear in the patient portal
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-150px)] mt-4">
            <div className="space-y-4 pr-4">
              {selectedExercises.map((exercise, index) => (
                <div key={exercise.id} className="p-4 rounded-lg border bg-white">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#053e67]/10 flex items-center justify-center text-[#053e67] font-medium">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium">{exercise.exercise.name}</h4>
                      <p className="text-sm text-gray-500 mt-1">{exercise.exercise.description}</p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {exercise.sets && (
                          <Badge variant="outline">{exercise.sets} sets</Badge>
                        )}
                        {exercise.reps && (
                          <Badge variant="outline">{exercise.reps} reps</Badge>
                        )}
                        {exercise.holdTime && (
                          <Badge variant="outline">{exercise.holdTime}s hold</Badge>
                        )}
                        {exercise.frequency && (
                          <Badge variant="outline">{exercise.frequency}</Badge>
                        )}
                      </div>
                      {exercise.exercise.videoUrl && (
                        <div className="mt-3 p-3 bg-gray-50 rounded flex items-center gap-2 text-sm text-gray-600">
                          <Play className="h-4 w-4" />
                          Video demonstration available
                        </div>
                      )}
                      {exercise.specialInstructions && (
                        <div className="mt-3 p-3 bg-amber-50 rounded text-sm text-amber-800">
                          <strong>Note:</strong> {exercise.specialInstructions}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Handout Dialog */}
      <Dialog open={showHandout} onOpenChange={setShowHandout}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Take-Home Handout</DialogTitle>
            <DialogDescription>
              Printable exercise program for the patient
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-hidden border rounded">
            <iframe
              srcDoc={generateHandoutHtml}
              className="w-full h-[60vh]"
              title="Exercise Handout Preview"
              sandbox="allow-same-origin"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHandout(false)}>
              Close
            </Button>
            <Button onClick={handleOpenHandout}>
              <Printer className="h-4 w-4 mr-2" />
              Open & Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
