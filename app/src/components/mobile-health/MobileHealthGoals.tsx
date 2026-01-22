'use client';

/**
 * Mobile Health Goals Component (US-269)
 *
 * Allows patients to view, track, and manage their health goals
 * with progress indicators and milestone tracking.
 */

import React, { useState } from 'react';
import { format } from 'date-fns';
import {
  Target,
  Plus,
  ChevronRight,
  Check,
  TrendingUp,
  Calendar,
  Pause,
  Play,
  Trophy,
  X,
  Flag,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';

interface PatientGoal {
  id: string;
  title: string;
  description?: string;
  goalType: string;
  status: string;
  targetValue?: number;
  targetUnit?: string;
  currentValue?: number;
  startValue?: number;
  startDate: string;
  targetDate?: string;
  completedAt?: string;
  isProviderAssigned: boolean;
  progressPercentage?: number | null;
}

interface GoalType {
  value: string;
  label: string;
}

interface MobileHealthGoalsProps {
  goals: PatientGoal[];
  goalTypes: GoalType[];
  onCreateGoal: (data: {
    title: string;
    description?: string;
    goalType: string;
    targetValue?: number;
    targetUnit?: string;
    startValue?: number;
    targetDate?: Date;
  }) => Promise<void>;
  onUpdateProgress: (id: string, currentValue: number, note?: string) => Promise<void>;
  onUpdateStatus: (id: string, status: string) => Promise<void>;
  onViewGoal: (id: string) => void;
  isLoading?: boolean;
}

export function MobileHealthGoals({
  goals,
  goalTypes,
  onCreateGoal,
  onUpdateProgress,
  onUpdateStatus,
  onViewGoal,
  isLoading = false,
}: MobileHealthGoalsProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showProgressDialog, setShowProgressDialog] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<PatientGoal | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [goalType, setGoalType] = useState('');
  const [targetValue, setTargetValue] = useState<number | undefined>();
  const [targetUnit, setTargetUnit] = useState('');
  const [startValue, setStartValue] = useState<number | undefined>();
  const [targetDate, setTargetDate] = useState('');

  // Progress update state
  const [progressValue, setProgressValue] = useState(0);
  const [progressNote, setProgressNote] = useState('');

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setGoalType('');
    setTargetValue(undefined);
    setTargetUnit('');
    setStartValue(undefined);
    setTargetDate('');
  };

  const handleSubmit = async () => {
    if (!title || !goalType) return;

    setIsSubmitting(true);
    try {
      await onCreateGoal({
        title,
        description: description || undefined,
        goalType,
        targetValue,
        targetUnit: targetUnit || undefined,
        startValue,
        targetDate: targetDate ? new Date(targetDate) : undefined,
      });
      setShowAddDialog(false);
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProgressUpdate = async () => {
    if (!selectedGoal) return;

    setIsSubmitting(true);
    try {
      await onUpdateProgress(selectedGoal.id, progressValue, progressNote || undefined);
      setShowProgressDialog(false);
      setSelectedGoal(null);
      setProgressValue(0);
      setProgressNote('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openProgressDialog = (goal: PatientGoal) => {
    setSelectedGoal(goal);
    setProgressValue(goal.currentValue || goal.startValue || 0);
    setShowProgressDialog(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Active</Badge>;
      case 'COMPLETED':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Completed</Badge>;
      case 'PAUSED':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Paused</Badge>;
      case 'CANCELLED':
        return <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getGoalTypeLabel = (value: string) => {
    const type = goalTypes.find((t) => t.value === value);
    return type?.label || value;
  };

  const getGoalTypeIcon = (goalType: string) => {
    switch (goalType) {
      case 'PAIN_REDUCTION':
        return <TrendingUp className="w-5 h-5 text-red-500" />;
      case 'MOBILITY':
        return <TrendingUp className="w-5 h-5 text-blue-500" />;
      case 'EXERCISE':
        return <Target className="w-5 h-5 text-green-500" />;
      case 'ACTIVITY':
        return <TrendingUp className="w-5 h-5 text-orange-500" />;
      case 'WELLNESS':
        return <Trophy className="w-5 h-5 text-purple-500" />;
      default:
        return <Flag className="w-5 h-5 text-gray-500" />;
    }
  };

  const activeGoals = goals.filter((g) => g.status === 'ACTIVE');
  const completedGoals = goals.filter((g) => g.status === 'COMPLETED');
  const pausedGoals = goals.filter((g) => g.status === 'PAUSED');

  return (
    <div className="space-y-4 px-4 pb-4">
      {/* Stats Overview */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-2xl font-bold text-green-700">{activeGoals.length}</div>
            <div className="text-xs text-green-600">Active</div>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-2xl font-bold text-blue-700">{completedGoals.length}</div>
            <div className="text-xs text-blue-600">Completed</div>
          </CardContent>
        </Card>
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-2xl font-bold text-yellow-700">{pausedGoals.length}</div>
            <div className="text-xs text-yellow-600">Paused</div>
          </CardContent>
        </Card>
      </div>

      {/* Add Goal Button */}
      <Button
        onClick={() => setShowAddDialog(true)}
        className="w-full bg-[#053e67] hover:bg-[#042e4e] text-white"
        size="lg"
      >
        <Plus className="w-5 h-5 mr-2" />
        Create New Goal
      </Button>

      {/* Active Goals */}
      {activeGoals.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Active Goals</h3>
          {activeGoals.map((goal) => (
            <Card key={goal.id} className="border-l-4 border-l-green-500">
              <CardContent className="py-4 px-4">
                <div className="flex items-start gap-3">
                  {getGoalTypeIcon(goal.goalType)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-900">{goal.title}</span>
                      {goal.isProviderAssigned && (
                        <Badge variant="outline" className="text-xs">Provider</Badge>
                      )}
                    </div>
                    {goal.description && (
                      <p className="text-sm text-gray-500 mb-2 line-clamp-2">
                        {goal.description}
                      </p>
                    )}

                    {/* Progress Bar */}
                    {goal.progressPercentage !== null && goal.progressPercentage !== undefined && (
                      <div className="mb-2">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>Progress</span>
                          <span>{goal.progressPercentage}%</span>
                        </div>
                        <Progress value={goal.progressPercentage} className="h-2" />
                      </div>
                    )}

                    {/* Target Info */}
                    {goal.targetValue !== null && goal.targetValue !== undefined && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                        <Target className="w-4 h-4" />
                        <span>
                          Current: {goal.currentValue || goal.startValue || 0} {goal.targetUnit} /
                          Target: {goal.targetValue} {goal.targetUnit}
                        </span>
                      </div>
                    )}

                    {/* Target Date */}
                    {goal.targetDate && (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Calendar className="w-4 h-4" />
                        <span>Due: {format(new Date(goal.targetDate), 'MMM d, yyyy')}</span>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        onClick={() => openProgressDialog(goal)}
                        className="bg-[#053e67] hover:bg-[#042e4e]"
                      >
                        <TrendingUp className="w-4 h-4 mr-1" />
                        Update Progress
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onUpdateStatus(goal.id, 'PAUSED')}
                      >
                        <Pause className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onUpdateStatus(goal.id, 'COMPLETED')}
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Paused Goals */}
      {pausedGoals.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Paused Goals</h3>
          {pausedGoals.map((goal) => (
            <Card key={goal.id} className="border-l-4 border-l-yellow-500 opacity-75">
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getGoalTypeIcon(goal.goalType)}
                    <span className="font-medium text-gray-700">{goal.title}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onUpdateStatus(goal.id, 'ACTIVE')}
                  >
                    <Play className="w-4 h-4 mr-1" />
                    Resume
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Completed Goals */}
      {completedGoals.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Completed Goals</h3>
          {completedGoals.map((goal) => (
            <Card key={goal.id} className="border-l-4 border-l-blue-500 bg-blue-50/50">
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <Trophy className="w-5 h-5 text-blue-500" />
                  <div className="flex-1">
                    <span className="font-medium text-gray-700">{goal.title}</span>
                    {goal.completedAt && (
                      <p className="text-xs text-gray-500">
                        Completed {format(new Date(goal.completedAt), 'MMM d, yyyy')}
                      </p>
                    )}
                  </div>
                  <Check className="w-5 h-5 text-blue-500" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty State */}
      {goals.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center">
            <Target className="w-12 h-12 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Goals Set</h3>
            <p className="text-gray-500 text-sm">
              Create health goals to track your progress and stay motivated.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Add Goal Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Goal</DialogTitle>
            <DialogDescription>
              Set a health goal to track your progress.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Title */}
            <div className="space-y-2">
              <Label>Goal Title</Label>
              <Input
                placeholder="e.g., Reduce lower back pain to 3/10"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Goal Type */}
            <div className="space-y-2">
              <Label>Goal Type</Label>
              <Select value={goalType} onValueChange={setGoalType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {goalTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                placeholder="Describe your goal in more detail..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[80px]"
              />
            </div>

            {/* Target Value */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Target Value</Label>
                <Input
                  type="number"
                  placeholder="e.g., 3"
                  value={targetValue || ''}
                  onChange={(e) => setTargetValue(e.target.value ? Number(e.target.value) : undefined)}
                />
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Input
                  placeholder="e.g., pain level"
                  value={targetUnit}
                  onChange={(e) => setTargetUnit(e.target.value)}
                />
              </div>
            </div>

            {/* Starting Value */}
            <div className="space-y-2">
              <Label>Starting Value</Label>
              <Input
                type="number"
                placeholder="e.g., 7"
                value={startValue || ''}
                onChange={(e) => setStartValue(e.target.value ? Number(e.target.value) : undefined)}
              />
            </div>

            {/* Target Date */}
            <div className="space-y-2">
              <Label>Target Date (optional)</Label>
              <Input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!title || !goalType || isSubmitting}
              className="bg-[#053e67] hover:bg-[#042e4e]"
            >
              {isSubmitting ? 'Creating...' : 'Create Goal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Progress Update Dialog */}
      <Dialog open={showProgressDialog} onOpenChange={setShowProgressDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Progress</DialogTitle>
            {selectedGoal && (
              <DialogDescription>{selectedGoal.title}</DialogDescription>
            )}
          </DialogHeader>

          {selectedGoal && (
            <div className="space-y-4 py-4">
              {/* Current Value Slider */}
              <div className="space-y-3">
                <div className="flex justify-between">
                  <Label>Current Value</Label>
                  <span className="text-lg font-bold text-[#053e67]">
                    {progressValue} {selectedGoal.targetUnit}
                  </span>
                </div>
                <Slider
                  value={[progressValue]}
                  onValueChange={(v: number[]) => setProgressValue(v[0])}
                  max={selectedGoal.targetValue ? selectedGoal.targetValue * 1.5 : 10}
                  min={0}
                  step={selectedGoal.targetUnit?.includes('level') ? 1 : 0.5}
                />
                {selectedGoal.targetValue && (
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Start: {selectedGoal.startValue || 0}</span>
                    <span>Target: {selectedGoal.targetValue}</span>
                  </div>
                )}
              </div>

              {/* Note */}
              <div className="space-y-2">
                <Label>Note (optional)</Label>
                <Textarea
                  placeholder="How are you feeling? Any observations?"
                  value={progressNote}
                  onChange={(e) => setProgressNote(e.target.value)}
                  className="min-h-[80px]"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProgressDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleProgressUpdate}
              disabled={isSubmitting}
              className="bg-[#053e67] hover:bg-[#042e4e]"
            >
              {isSubmitting ? 'Saving...' : 'Save Progress'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
