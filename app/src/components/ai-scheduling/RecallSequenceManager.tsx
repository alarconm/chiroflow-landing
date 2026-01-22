'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { trpc } from '@/trpc/client';
import {
  RotateCcw,
  Plus,
  Settings,
  Users,
  Mail,
  Phone,
  MessageSquare,
  Play,
  Pause,
  Edit,
  Trash2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { RecallStepType } from '@prisma/client';

const stepTypeIcons: Record<RecallStepType, React.ReactNode> = {
  EMAIL: <Mail className="h-4 w-4" />,
  SMS: <MessageSquare className="h-4 w-4" />,
  PHONE_CALL: <Phone className="h-4 w-4" />,
  LETTER: <Mail className="h-4 w-4" />,
};

const stepTypeLabels: Record<RecallStepType, string> = {
  EMAIL: 'Email',
  SMS: 'SMS',
  PHONE_CALL: 'Phone Call',
  LETTER: 'Letter',
};

interface StepConfig {
  stepNumber: number;
  stepType: RecallStepType;
  daysFromStart: number;
  subject?: string;
  body?: string;
}

export function RecallSequenceManager() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingSequenceId, setEditingSequenceId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [daysSinceLastVisit, setDaysSinceLastVisit] = useState(30);
  const [maxAttempts, setMaxAttempts] = useState(5);
  const [stopOnSchedule, setStopOnSchedule] = useState(true);
  const [steps, setSteps] = useState<StepConfig[]>([
    { stepNumber: 1, stepType: 'EMAIL', daysFromStart: 0 },
  ]);

  const { data: sequences, isLoading, refetch } = trpc.aiScheduling.getRecallSequences.useQuery({
    includeInactive: true,
  });

  const createMutation = trpc.aiScheduling.createRecallSequence.useMutation({
    onSuccess: () => {
      refetch();
      resetForm();
      setShowCreateDialog(false);
    },
  });

  const updateMutation = trpc.aiScheduling.updateRecallSequence.useMutation({
    onSuccess: () => {
      refetch();
      resetForm();
      setEditingSequenceId(null);
      setShowCreateDialog(false);
    },
  });

  const resetForm = () => {
    setName('');
    setDescription('');
    setDaysSinceLastVisit(30);
    setMaxAttempts(5);
    setStopOnSchedule(true);
    setSteps([{ stepNumber: 1, stepType: 'EMAIL', daysFromStart: 0 }]);
  };

  const handleAddStep = () => {
    const lastStep = steps[steps.length - 1];
    setSteps([
      ...steps,
      {
        stepNumber: steps.length + 1,
        stepType: 'EMAIL',
        daysFromStart: lastStep.daysFromStart + 7,
      },
    ]);
  };

  const handleRemoveStep = (index: number) => {
    if (steps.length > 1) {
      const newSteps = steps.filter((_, i) => i !== index);
      setSteps(newSteps.map((s, i) => ({ ...s, stepNumber: i + 1 })));
    }
  };

  const handleUpdateStep = (index: number, updates: Partial<StepConfig>) => {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], ...updates };
    setSteps(newSteps);
  };

  const handleSave = () => {
    const payload = {
      name,
      description: description || undefined,
      appointmentTypes: [],
      daysSinceLastVisit,
      maxAttempts,
      stopOnSchedule,
      steps: steps.map((s) => ({
        stepNumber: s.stepNumber,
        stepType: s.stepType,
        daysFromStart: s.daysFromStart,
        subject: s.subject,
        body: s.body,
      })),
    };

    if (editingSequenceId) {
      updateMutation.mutate({ sequenceId: editingSequenceId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleEdit = (sequence: NonNullable<typeof sequences>[number]) => {
    setEditingSequenceId(sequence.id);
    setName(sequence.name);
    setDescription(sequence.description || '');
    setDaysSinceLastVisit(sequence.daysSinceLastVisit);
    setMaxAttempts(sequence.maxAttempts);
    setSteps(
      sequence.steps.map((s) => ({
        stepNumber: s.stepNumber,
        stepType: s.stepType,
        daysFromStart: s.daysFromStart,
      }))
    );
    setShowCreateDialog(true);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-indigo-500" />
            Recall Sequences
          </CardTitle>
          <CardDescription>Loading sequences...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <RotateCcw className="h-5 w-5 text-indigo-500" />
                Recall Sequences
              </CardTitle>
              <CardDescription>
                Automated patient recall campaigns
              </CardDescription>
            </div>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Sequence
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {(!sequences || sequences.length === 0) ? (
            <div className="text-center py-8 text-muted-foreground">
              <RotateCcw className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>No recall sequences created yet.</p>
              <p className="text-sm">Create a sequence to automate patient recall.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sequences.map((sequence) => (
                <div
                  key={sequence.id}
                  className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{sequence.name}</h4>
                        <Badge
                          variant="outline"
                          className={`border-0 ${
                            sequence.isActive
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {sequence.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      {sequence.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {sequence.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-3 text-sm">
                        <span className="text-muted-foreground">
                          Triggers after {sequence.daysSinceLastVisit} days
                        </span>
                        <span className="text-muted-foreground">|</span>
                        <span className="text-muted-foreground">
                          {sequence.steps.length} step{sequence.steps.length !== 1 ? 's' : ''}
                        </span>
                        <span className="text-muted-foreground">|</span>
                        <span className="text-muted-foreground">
                          Max {sequence.maxAttempts} attempts
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        {sequence.steps.map((step, idx) => (
                          <Badge
                            key={idx}
                            variant="outline"
                            className="border-0 bg-indigo-50 text-indigo-700"
                          >
                            {stepTypeIcons[step.stepType]}
                            <span className="ml-1">
                              Day {step.daysFromStart}
                            </span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="border-0 bg-blue-50 text-[#053e67]">
                        <Users className="h-3 w-3 mr-1" />
                        {sequence.enrollmentCount} enrolled
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(sequence)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingSequenceId ? 'Edit Recall Sequence' : 'Create Recall Sequence'}
            </DialogTitle>
            <DialogDescription>
              Configure automated recall communications for patient re-engagement.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Sequence Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., 30-Day Recall"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="days">Days Since Last Visit</Label>
                <Input
                  id="days"
                  type="number"
                  value={daysSinceLastVisit}
                  onChange={(e) => setDaysSinceLastVisit(parseInt(e.target.value) || 30)}
                  min={1}
                  max={365}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe this recall sequence..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="maxAttempts">Max Contact Attempts</Label>
                <Input
                  id="maxAttempts"
                  type="number"
                  value={maxAttempts}
                  onChange={(e) => setMaxAttempts(parseInt(e.target.value) || 5)}
                  min={1}
                  max={10}
                />
              </div>
              <div className="flex items-center gap-2 pt-8">
                <Switch
                  id="stopOnSchedule"
                  checked={stopOnSchedule}
                  onCheckedChange={setStopOnSchedule}
                />
                <Label htmlFor="stopOnSchedule">Stop when patient schedules</Label>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Communication Steps</Label>
                <Button variant="outline" size="sm" onClick={handleAddStep}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Step
                </Button>
              </div>

              {steps.map((step, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 border rounded-lg">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                    <span className="text-sm font-medium text-indigo-700">
                      {step.stepNumber}
                    </span>
                  </div>
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    <Select
                      value={step.stepType}
                      onValueChange={(v) =>
                        handleUpdateStep(idx, { stepType: v as RecallStepType })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EMAIL">
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            Email
                          </div>
                        </SelectItem>
                        <SelectItem value="SMS">
                          <div className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4" />
                            SMS
                          </div>
                        </SelectItem>
                        <SelectItem value="PHONE">
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            Phone Call
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Day</span>
                      <Input
                        type="number"
                        value={step.daysFromStart}
                        onChange={(e) =>
                          handleUpdateStep(idx, {
                            daysFromStart: parseInt(e.target.value) || 0,
                          })
                        }
                        min={0}
                        className="w-20"
                      />
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveStep(idx)}
                    disabled={steps.length === 1}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                resetForm();
                setEditingSequenceId(null);
                setShowCreateDialog(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                !name || steps.length === 0 || createMutation.isPending || updateMutation.isPending
              }
            >
              {editingSequenceId ? 'Update' : 'Create'} Sequence
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
