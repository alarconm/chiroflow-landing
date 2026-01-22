/**
 * Remote Monitoring Component
 * US-222: Remote monitoring integration
 *
 * Patient submission interface for photos, videos, pain diaries, and exercise tracking.
 * Supports asynchronous review workflow for providers.
 */

'use client';

import React, { useState, useRef, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import {
  Camera,
  Video,
  FileText,
  Activity,
  Upload,
  Send,
  AlertCircle,
  CheckCircle,
  Clock,
  Image as ImageIcon,
  X,
  Plus,
  Trash2,
} from 'lucide-react';
import { PAIN_LOCATIONS, EXERCISE_CATEGORIES } from '@/lib/telehealth';
import type {
  RemoteSubmissionType,
  RemoteSubmissionStatus,
} from '@/lib/telehealth';

// ===========================================
// TYPES
// ===========================================

interface RemoteMonitoringProps {
  patientId: string;
  patientName?: string;
  telehealthSessionId?: string;
  encounterId?: string;
  onSubmissionComplete?: (submissionId: string) => void;
  className?: string;
}

interface MediaFile {
  file: File;
  preview: string;
  type: 'image' | 'video';
}

interface PainEntry {
  level: number;
  location: string;
  notes: string;
}

interface ExerciseEntry {
  name: string;
  duration: number;
  reps?: number;
  sets?: number;
  difficulty: 'easy' | 'moderate' | 'hard' | 'too_hard';
  feedback: string;
}

// ===========================================
// SUBMISSION TYPE TABS
// ===========================================

const SUBMISSION_TYPES: Array<{
  id: RemoteSubmissionType;
  label: string;
  icon: React.ReactNode;
  description: string;
}> = [
  {
    id: 'PHOTO',
    label: 'Photo',
    icon: <Camera className="h-4 w-4" />,
    description: 'Submit photos of affected area or progress',
  },
  {
    id: 'VIDEO',
    label: 'Video',
    icon: <Video className="h-4 w-4" />,
    description: 'Record movement or demonstrate exercises',
  },
  {
    id: 'PAIN_DIARY',
    label: 'Pain Diary',
    icon: <FileText className="h-4 w-4" />,
    description: 'Log daily pain levels and symptoms',
  },
  {
    id: 'EXERCISE',
    label: 'Exercise',
    icon: <Activity className="h-4 w-4" />,
    description: 'Track exercise completion and feedback',
  },
];

// ===========================================
// MAIN COMPONENT
// ===========================================

export function RemoteMonitoring({
  patientId,
  patientName,
  telehealthSessionId,
  encounterId,
  onSubmissionComplete,
  className,
}: RemoteMonitoringProps) {
  const [activeTab, setActiveTab] = useState<RemoteSubmissionType>('PAIN_DIARY');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Media upload state
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [mediaDescription, setMediaDescription] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pain diary state
  const [painEntry, setPainEntry] = useState<PainEntry>({
    level: 5,
    location: '',
    notes: '',
  });

  // Exercise state
  const [exerciseEntry, setExerciseEntry] = useState<ExerciseEntry>({
    name: '',
    duration: 0,
    reps: undefined,
    sets: undefined,
    difficulty: 'moderate',
    feedback: '',
  });

  // ===========================================
  // MEDIA HANDLING
  // ===========================================

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newMediaFiles: MediaFile[] = [];
    Array.from(files).forEach((file) => {
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');

      if (isImage || isVideo) {
        newMediaFiles.push({
          file,
          preview: URL.createObjectURL(file),
          type: isImage ? 'image' : 'video',
        });
      }
    });

    setMediaFiles((prev) => [...prev, ...newMediaFiles]);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const removeMediaFile = useCallback((index: number) => {
    setMediaFiles((prev) => {
      const newFiles = [...prev];
      URL.revokeObjectURL(newFiles[index].preview);
      newFiles.splice(index, 1);
      return newFiles;
    });
  }, []);

  // ===========================================
  // SUBMISSION HANDLER
  // ===========================================

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      // Build submission data based on type
      const baseData = {
        patientId,
        submissionType: activeTab,
        telehealthSessionId,
        encounterId,
      };

      let submissionData: Record<string, unknown> = { ...baseData };

      switch (activeTab) {
        case 'PHOTO':
        case 'VIDEO':
          if (mediaFiles.length === 0) {
            throw new Error('Please select at least one file to upload');
          }
          // Convert first file to base64
          const file = mediaFiles[0].file;
          const base64 = await fileToBase64(file);
          submissionData = {
            ...submissionData,
            description: mediaDescription,
            media: {
              content: base64,
              mimeType: file.type,
              fileName: file.name,
            },
          };
          break;

        case 'PAIN_DIARY':
          if (!painEntry.location) {
            throw new Error('Please select a pain location');
          }
          submissionData = {
            ...submissionData,
            title: `Pain Report - ${new Date().toLocaleDateString()}`,
            painLevel: painEntry.level,
            painLocation: painEntry.location,
            painNotes: painEntry.notes,
          };
          break;

        case 'EXERCISE':
          if (!exerciseEntry.name) {
            throw new Error('Please enter an exercise name');
          }
          submissionData = {
            ...submissionData,
            title: `Exercise: ${exerciseEntry.name}`,
            exerciseName: exerciseEntry.name,
            exerciseDuration: exerciseEntry.duration,
            exerciseReps: exerciseEntry.reps,
            exerciseSets: exerciseEntry.sets,
            exerciseFeedback: `Difficulty: ${exerciseEntry.difficulty}. ${exerciseEntry.feedback}`,
          };
          break;
      }

      // In production, this would call the tRPC procedure
      // const result = await trpc.telehealth.createRemoteSubmission.mutate(submissionData);
      console.log('Submitting:', submissionData);

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000));

      setSubmitSuccess(true);
      resetForm();

      // Notify parent
      if (onSubmissionComplete) {
        onSubmissionComplete('mock-submission-id');
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Submission failed');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    activeTab,
    patientId,
    telehealthSessionId,
    encounterId,
    mediaFiles,
    mediaDescription,
    painEntry,
    exerciseEntry,
    onSubmissionComplete,
  ]);

  const resetForm = useCallback(() => {
    setMediaFiles([]);
    setMediaDescription('');
    setPainEntry({ level: 5, location: '', notes: '' });
    setExerciseEntry({
      name: '',
      duration: 0,
      reps: undefined,
      sets: undefined,
      difficulty: 'moderate',
      feedback: '',
    });
  }, []);

  // ===========================================
  // RENDER
  // ===========================================

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Remote Monitoring
        </CardTitle>
        <CardDescription>
          {patientName
            ? `Submit health updates for ${patientName}`
            : 'Submit photos, videos, or health updates for provider review'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Success/Error Messages */}
        {submitSuccess && (
          <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
            <CheckCircle className="h-5 w-5" />
            <span>Submission received! Your provider will review it soon.</span>
          </div>
        )}

        {submitError && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            <AlertCircle className="h-5 w-5" />
            <span>{submitError}</span>
          </div>
        )}

        {/* Submission Type Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as RemoteSubmissionType)}
        >
          <TabsList className="grid w-full grid-cols-4">
            {SUBMISSION_TYPES.map((type) => (
              <TabsTrigger
                key={type.id}
                value={type.id}
                className="flex items-center gap-2"
              >
                {type.icon}
                <span className="hidden sm:inline">{type.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Photo Upload */}
          <TabsContent value="PHOTO" className="space-y-4">
            <MediaUploadSection
              type="image"
              files={mediaFiles}
              description={mediaDescription}
              onFileSelect={handleFileSelect}
              onFileRemove={removeMediaFile}
              onDescriptionChange={setMediaDescription}
              fileInputRef={fileInputRef}
            />
          </TabsContent>

          {/* Video Upload */}
          <TabsContent value="VIDEO" className="space-y-4">
            <MediaUploadSection
              type="video"
              files={mediaFiles}
              description={mediaDescription}
              onFileSelect={handleFileSelect}
              onFileRemove={removeMediaFile}
              onDescriptionChange={setMediaDescription}
              fileInputRef={fileInputRef}
            />
          </TabsContent>

          {/* Pain Diary */}
          <TabsContent value="PAIN_DIARY" className="space-y-4">
            <PainDiarySection
              entry={painEntry}
              onChange={setPainEntry}
            />
          </TabsContent>

          {/* Exercise Tracking */}
          <TabsContent value="EXERCISE" className="space-y-4">
            <ExerciseSection
              entry={exerciseEntry}
              onChange={setExerciseEntry}
            />
          </TabsContent>
        </Tabs>

        {/* Submit Button */}
        <div className="flex justify-end pt-4 border-t">
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-[#053e67] hover:bg-[#053e67]/90"
          >
            {isSubmitting ? (
              <>
                <Clock className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Submit for Review
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ===========================================
// SUB-COMPONENTS
// ===========================================

interface MediaUploadSectionProps {
  type: 'image' | 'video';
  files: MediaFile[];
  description: string;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onFileRemove: (index: number) => void;
  onDescriptionChange: (value: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

function MediaUploadSection({
  type,
  files,
  description,
  onFileSelect,
  onFileRemove,
  onDescriptionChange,
  fileInputRef,
}: MediaUploadSectionProps) {
  const accept = type === 'image' ? 'image/*' : 'video/*';
  const icon = type === 'image' ? <ImageIcon className="h-8 w-8" /> : <Video className="h-8 w-8" />;
  const label = type === 'image' ? 'photos' : 'videos';

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div
        className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center hover:border-[#053e67] transition-colors cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple
          onChange={onFileSelect}
          className="hidden"
        />
        <div className="flex flex-col items-center gap-2 text-gray-500">
          {icon}
          <p>Click or drag to upload {label}</p>
          <p className="text-sm">Maximum 10MB per file</p>
        </div>
      </div>

      {/* Preview Grid */}
      {files.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {files.map((file, index) => (
            <div key={index} className="relative group">
              {file.type === 'image' ? (
                <img
                  src={file.preview}
                  alt={`Upload ${index + 1}`}
                  className="w-full h-32 object-cover rounded-lg"
                />
              ) : (
                <video
                  src={file.preview}
                  className="w-full h-32 object-cover rounded-lg"
                />
              )}
              <button
                onClick={() => onFileRemove(index)}
                className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="media-description">Description (optional)</Label>
        <Textarea
          id="media-description"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Describe what you're showing in this media..."
          rows={3}
        />
      </div>
    </div>
  );
}

interface PainDiarySectionProps {
  entry: PainEntry;
  onChange: (entry: PainEntry) => void;
}

function PainDiarySection({ entry, onChange }: PainDiarySectionProps) {
  return (
    <div className="space-y-6">
      {/* Pain Level Slider */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Label>Pain Level</Label>
          <Badge
            variant={
              entry.level <= 3
                ? 'default'
                : entry.level <= 6
                ? 'secondary'
                : 'destructive'
            }
            className="text-lg px-3 py-1"
          >
            {entry.level}/10
          </Badge>
        </div>
        <Slider
          value={[entry.level]}
          onValueChange={(values: number[]) => onChange({ ...entry, level: values[0] })}
          max={10}
          min={0}
          step={1}
          className="w-full"
        />
        <div className="flex justify-between text-sm text-gray-500">
          <span>No Pain</span>
          <span>Moderate</span>
          <span>Severe</span>
        </div>
      </div>

      {/* Pain Location */}
      <div className="space-y-2">
        <Label htmlFor="pain-location">Pain Location</Label>
        <Select
          value={entry.location}
          onValueChange={(value) => onChange({ ...entry, location: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select area of pain" />
          </SelectTrigger>
          <SelectContent>
            {PAIN_LOCATIONS.map((location) => (
              <SelectItem key={location} value={location}>
                {location}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="pain-notes">Additional Notes</Label>
        <Textarea
          id="pain-notes"
          value={entry.notes}
          onChange={(e) => onChange({ ...entry, notes: e.target.value })}
          placeholder="Describe any triggers, activities that worsen/relieve pain, or other symptoms..."
          rows={4}
        />
      </div>
    </div>
  );
}

interface ExerciseSectionProps {
  entry: ExerciseEntry;
  onChange: (entry: ExerciseEntry) => void;
}

function ExerciseSection({ entry, onChange }: ExerciseSectionProps) {
  return (
    <div className="space-y-6">
      {/* Exercise Name */}
      <div className="space-y-2">
        <Label htmlFor="exercise-name">Exercise Name</Label>
        <Input
          id="exercise-name"
          value={entry.name}
          onChange={(e) => onChange({ ...entry, name: e.target.value })}
          placeholder="e.g., Neck stretches, Lower back extensions"
        />
      </div>

      {/* Exercise Details */}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="exercise-duration">Duration (min)</Label>
          <Input
            id="exercise-duration"
            type="number"
            min="0"
            value={entry.duration || ''}
            onChange={(e) =>
              onChange({ ...entry, duration: parseInt(e.target.value) || 0 })
            }
            placeholder="0"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="exercise-reps">Reps</Label>
          <Input
            id="exercise-reps"
            type="number"
            min="0"
            value={entry.reps || ''}
            onChange={(e) =>
              onChange({
                ...entry,
                reps: e.target.value ? parseInt(e.target.value) : undefined,
              })
            }
            placeholder="0"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="exercise-sets">Sets</Label>
          <Input
            id="exercise-sets"
            type="number"
            min="0"
            value={entry.sets || ''}
            onChange={(e) =>
              onChange({
                ...entry,
                sets: e.target.value ? parseInt(e.target.value) : undefined,
              })
            }
            placeholder="0"
          />
        </div>
      </div>

      {/* Difficulty */}
      <div className="space-y-2">
        <Label>How did it feel?</Label>
        <div className="flex gap-2">
          {[
            { value: 'easy', label: 'Easy', color: 'bg-green-100 border-green-500 text-green-700' },
            { value: 'moderate', label: 'Moderate', color: 'bg-blue-100 border-blue-500 text-blue-700' },
            { value: 'hard', label: 'Hard', color: 'bg-yellow-100 border-yellow-500 text-yellow-700' },
            { value: 'too_hard', label: 'Too Hard', color: 'bg-red-100 border-red-500 text-red-700' },
          ].map((difficulty) => (
            <button
              key={difficulty.value}
              onClick={() =>
                onChange({
                  ...entry,
                  difficulty: difficulty.value as ExerciseEntry['difficulty'],
                })
              }
              className={cn(
                'flex-1 py-2 px-3 rounded-lg border-2 text-sm font-medium transition-all',
                entry.difficulty === difficulty.value
                  ? difficulty.color
                  : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
              )}
            >
              {difficulty.label}
            </button>
          ))}
        </div>
      </div>

      {/* Feedback */}
      <div className="space-y-2">
        <Label htmlFor="exercise-feedback">Additional Feedback</Label>
        <Textarea
          id="exercise-feedback"
          value={entry.feedback}
          onChange={(e) => onChange({ ...entry, feedback: e.target.value })}
          placeholder="Any pain during exercise? Modifications you made? Questions for your provider?"
          rows={3}
        />
      </div>
    </div>
  );
}

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data:*/*;base64, prefix
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default RemoteMonitoring;
