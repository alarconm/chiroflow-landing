'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ClipboardCheck, Plus, TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';

interface AssessmentListProps {
  encounterId: string;
  patientId: string;
  readOnly?: boolean;
}

// Assessment type options
const ASSESSMENT_TYPES = [
  { value: 'VAS_PAIN', label: 'VAS Pain Scale', maxScore: 10 },
  { value: 'ODI', label: 'Oswestry Disability Index', maxScore: 100 },
  { value: 'NDI', label: 'Neck Disability Index', maxScore: 100 },
  { value: 'NPRS', label: 'Numeric Pain Rating Scale', maxScore: 10 },
] as const;

type AssessmentTypeValue = typeof ASSESSMENT_TYPES[number]['value'];

export function AssessmentList({
  encounterId,
  patientId,
  readOnly = false,
}: AssessmentListProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('');
  const [vasScore, setVasScore] = useState<number>(5);

  const { data: assessments, refetch } = trpc.assessment.listByEncounter.useQuery({
    encounterId,
  });

  const { data: availableTypes } = trpc.assessment.getAvailable.useQuery();

  const { data: history } = trpc.assessment.getHistory.useQuery({
    patientId,
    limit: 5,
  });

  // Two-step process: administer creates the assessment, then submit adds the score
  const administerMutation = trpc.assessment.administer.useMutation({
    onSuccess: (data) => {
      // Now submit the score
      const typeInfo = ASSESSMENT_TYPES.find(t => t.value === selectedType);
      const maxScore = typeInfo?.maxScore || 10;
      const percentScore = (vasScore / maxScore) * 100;

      submitMutation.mutate({
        id: data.assessment.id,
        answers: [],
        rawScore: vasScore,
        percentScore,
        maxPossible: maxScore,
      });
    },
    onError: (error) => toast.error(error.message),
  });

  const submitMutation = trpc.assessment.submit.useMutation({
    onSuccess: () => {
      toast.success('Assessment recorded');
      refetch();
      setShowAddDialog(false);
      setSelectedType('');
      setVasScore(5);
    },
    onError: (error) => toast.error(error.message),
  });

  const handleAdminister = useCallback(() => {
    if (!selectedType) return;

    administerMutation.mutate({
      encounterId,
      patientId,
      assessmentType: selectedType as AssessmentTypeValue,
    });
  }, [selectedType, encounterId, patientId, administerMutation]);

  const getScoreTrend = (current: number, previous?: number | null) => {
    if (!previous) return null;
    const diff = current - previous;
    if (Math.abs(diff) < 0.5) return { icon: Minus, color: 'text-gray-400', label: 'No change' };
    if (diff < 0) return { icon: TrendingDown, color: 'text-green-500', label: `${Math.abs(diff).toFixed(1)} better` };
    return { icon: TrendingUp, color: 'text-red-500', label: `${diff.toFixed(1)} worse` };
  };

  const isPending = administerMutation.isPending || submitMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-[#053e67]/50" />
              Outcome Assessments
            </CardTitle>
            <CardDescription>
              Patient-reported outcome measures (PROMs)
            </CardDescription>
          </div>
          {!readOnly && (
            <Dialog
              open={showAddDialog}
              onOpenChange={(open) => {
                setShowAddDialog(open);
                if (!open) {
                  setSelectedType('');
                  setVasScore(5);
                }
              }}
            >
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Assessment
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Administer Assessment</DialogTitle>
                </DialogHeader>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label>Assessment Type</Label>
                    <Select value={selectedType} onValueChange={setSelectedType}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select assessment type..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableTypes?.availableTypes ? (
                          availableTypes.availableTypes.map((type) => (
                            <SelectItem key={type.type} value={type.type}>
                              {type.name}
                            </SelectItem>
                          ))
                        ) : (
                          ASSESSMENT_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedType && (
                    <div className="space-y-4">
                      <p className="text-sm text-gray-500">
                        Rate your current level from 0 (best) to 10 (worst)
                      </p>
                      <div className="space-y-4">
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-4xl font-bold text-[#053e67]">{vasScore}</span>
                          <span className="text-lg text-gray-400">/ 10</span>
                        </div>
                        <Slider
                          value={[vasScore]}
                          onValueChange={(value: number[]) => setVasScore(value[0])}
                          min={0}
                          max={10}
                          step={1}
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>Best</span>
                          <span>Worst</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAdminister}
                    disabled={!selectedType || isPending}
                  >
                    {isPending && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Record Score
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current encounter assessments */}
        {assessments && assessments.length > 0 ? (
          <div className="space-y-3">
            {assessments.map((assessment) => {
              const trend = getScoreTrend(
                Number(assessment.rawScore),
                assessment.previousScore ? Number(assessment.previousScore) : null
              );

              return (
                <div
                  key={assessment.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <span className="text-2xl font-bold text-gray-900">
                        {assessment.rawScore ? Number(assessment.rawScore).toFixed(0) : '-'}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">{assessment.assessmentType}</p>
                      <p className="text-sm text-gray-500">
                        {format(new Date(assessment.administeredAt), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {trend && (
                      <div className={cn('flex items-center gap-1 text-sm', trend.color)}>
                        <trend.icon className="h-4 w-4" />
                        <span>{trend.label}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-center">
            <ClipboardCheck className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No assessments for this encounter</p>
          </div>
        )}

        {/* Assessment history */}
        {history && history.assessments && history.assessments.length > 0 && (
          <div className="space-y-2 pt-4 border-t">
            <p className="text-sm font-medium text-gray-500">Recent History</p>
            <div className="space-y-2">
              {history.assessments.slice(0, 3).map((assessment) => (
                <div
                  key={assessment.id}
                  className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{assessment.assessmentType}</span>
                    <span className="text-gray-500">
                      Score: {assessment.rawScore ? Number(assessment.rawScore).toFixed(0) : '-'}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {format(new Date(assessment.createdAt), 'MMM d, yyyy')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
