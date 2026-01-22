'use client';

/**
 * Virtual Waiting Room Component
 * Epic 21: Telehealth & Virtual Care - US-218
 *
 * Patient-facing waiting room with:
 * - Wait time display
 * - Technical pre-checks (camera, mic, connection)
 * - Pre-visit questionnaire
 * - Provider ready notification
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { trpc } from '@/trpc/client';
import {
  Video,
  Mic,
  Wifi,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  User,
  Calendar,
  Loader2,
  Bell,
  RefreshCw,
} from 'lucide-react';

interface VirtualWaitingRoomProps {
  sessionId: string;
  onAdmitted?: () => void;
  onLeft?: () => void;
}

interface TechCheckState {
  camera: 'pending' | 'checking' | 'passed' | 'failed';
  microphone: 'pending' | 'checking' | 'passed' | 'failed';
  connection: 'pending' | 'checking' | 'passed' | 'failed';
}

interface QuestionnaireResponses {
  currentSymptoms?: string;
  medicationChanges?: string;
  additionalConcerns?: string;
}

export function VirtualWaitingRoom({
  sessionId,
  onAdmitted,
  onLeft,
}: VirtualWaitingRoomProps) {
  const [waitingRoomId, setWaitingRoomId] = useState<string | null>(null);
  const [techChecks, setTechChecks] = useState<TechCheckState>({
    camera: 'pending',
    microphone: 'pending',
    connection: 'pending',
  });
  const [questionnaire, setQuestionnaire] = useState<QuestionnaireResponses>({});
  const [questionnaireSubmitted, setQuestionnaireSubmitted] = useState(false);

  const utils = trpc.useUtils();

  // Join waiting room mutation
  const joinMutation = trpc.telehealth.joinWaitingRoom.useMutation({
    onSuccess: (data) => {
      setWaitingRoomId(data.waitingRoomId);
    },
  });

  // Leave waiting room mutation
  const leaveMutation = trpc.telehealth.leaveWaitingRoom.useMutation({
    onSuccess: () => {
      onLeft?.();
    },
  });

  // Update technical check mutation
  const updateTechCheckMutation = trpc.telehealth.updateTechnicalCheck.useMutation();

  // Submit questionnaire mutation
  const submitQuestionnaireMutation = trpc.telehealth.submitPreVisitQuestionnaire.useMutation({
    onSuccess: () => {
      setQuestionnaireSubmitted(true);
    },
  });

  // Query waiting room status (polls every 5 seconds)
  const { data: waitingStatus, refetch: refetchStatus } = trpc.telehealth.getWaitingRoomStatus.useQuery(
    { waitingRoomId: waitingRoomId || '' },
    {
      enabled: !!waitingRoomId,
      refetchInterval: 5000, // Poll every 5 seconds
    }
  );

  // Auto-join waiting room on mount
  useEffect(() => {
    if (!waitingRoomId && !joinMutation.isPending) {
      // Get device info
      const deviceType = /Mobi|Android/i.test(navigator.userAgent)
        ? 'mobile'
        : /Tablet|iPad/i.test(navigator.userAgent)
        ? 'tablet'
        : 'desktop';

      const browserInfo = `${navigator.userAgent.split(' ').pop() || 'Unknown'}`;

      joinMutation.mutate({
        sessionId,
        deviceType,
        browserInfo,
        connectionType: (navigator as { connection?: { type?: string } }).connection?.type === 'cellular'
          ? 'cellular'
          : 'wifi',
      });
    }
  }, [sessionId, waitingRoomId, joinMutation]);

  // Check if provider is ready and trigger callback
  useEffect(() => {
    if (waitingStatus?.isProviderReady) {
      onAdmitted?.();
    }
  }, [waitingStatus?.isProviderReady, onAdmitted]);

  // Technical checks
  const runCameraCheck = useCallback(async () => {
    setTechChecks((prev) => ({ ...prev, camera: 'checking' }));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((track) => track.stop());
      setTechChecks((prev) => ({ ...prev, camera: 'passed' }));
      if (waitingRoomId) {
        updateTechCheckMutation.mutate({ waitingRoomId, cameraChecked: true });
      }
    } catch {
      setTechChecks((prev) => ({ ...prev, camera: 'failed' }));
    }
  }, [waitingRoomId, updateTechCheckMutation]);

  const runMicrophoneCheck = useCallback(async () => {
    setTechChecks((prev) => ({ ...prev, microphone: 'checking' }));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setTechChecks((prev) => ({ ...prev, microphone: 'passed' }));
      if (waitingRoomId) {
        updateTechCheckMutation.mutate({ waitingRoomId, microphoneChecked: true });
      }
    } catch {
      setTechChecks((prev) => ({ ...prev, microphone: 'failed' }));
    }
  }, [waitingRoomId, updateTechCheckMutation]);

  const runConnectionCheck = useCallback(async () => {
    setTechChecks((prev) => ({ ...prev, connection: 'checking' }));
    try {
      // Simple connection check using fetch
      const startTime = Date.now();
      await fetch('/api/health', { method: 'HEAD', cache: 'no-store' }).catch(() => {
        // Fallback: just check if we can reach the window origin
        return fetch(window.location.origin, { method: 'HEAD', cache: 'no-store' });
      });
      const latency = Date.now() - startTime;

      // Consider connection good if latency < 500ms
      if (latency < 500) {
        setTechChecks((prev) => ({ ...prev, connection: 'passed' }));
        if (waitingRoomId) {
          updateTechCheckMutation.mutate({ waitingRoomId, connectionChecked: true });
        }
      } else {
        setTechChecks((prev) => ({ ...prev, connection: 'failed' }));
      }
    } catch {
      setTechChecks((prev) => ({ ...prev, connection: 'failed' }));
    }
  }, [waitingRoomId, updateTechCheckMutation]);

  const runAllChecks = useCallback(() => {
    runCameraCheck();
    runMicrophoneCheck();
    runConnectionCheck();
  }, [runCameraCheck, runMicrophoneCheck, runConnectionCheck]);

  // Auto-run checks when waiting room is joined
  useEffect(() => {
    if (waitingRoomId && techChecks.camera === 'pending') {
      runAllChecks();
    }
  }, [waitingRoomId, techChecks.camera, runAllChecks]);

  const handleQuestionnaireSubmit = () => {
    if (waitingRoomId && Object.keys(questionnaire).length > 0) {
      submitQuestionnaireMutation.mutate({
        waitingRoomId,
        responses: questionnaire as Record<string, string | undefined>,
      });
    }
  };

  const handleLeaveWaitingRoom = () => {
    if (waitingRoomId) {
      leaveMutation.mutate({ waitingRoomId });
    }
  };

  const getTechCheckIcon = (status: TechCheckState['camera']) => {
    switch (status) {
      case 'checking':
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
      case 'passed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <AlertTriangle className="h-5 w-5 text-gray-400" />;
    }
  };

  const allChecksPassed =
    techChecks.camera === 'passed' &&
    techChecks.microphone === 'passed' &&
    techChecks.connection === 'passed';

  if (joinMutation.isPending) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Joining waiting room...</p>
        </div>
      </div>
    );
  }

  if (joinMutation.isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Unable to join waiting room</AlertTitle>
        <AlertDescription>
          {joinMutation.error.message}
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => joinMutation.reset()}
          >
            Try Again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Provider Ready Alert */}
      {waitingStatus?.isProviderReady && (
        <Alert className="bg-green-50 border-green-200">
          <Bell className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-800">Your provider is ready!</AlertTitle>
          <AlertDescription className="text-green-700">
            You will be connected to your telehealth visit momentarily.
          </AlertDescription>
        </Alert>
      )}

      {/* Wait Time Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <CardTitle>Waiting Room</CardTitle>
            </div>
            <Badge variant={waitingStatus?.isProviderReady ? 'default' : 'secondary'}>
              {waitingStatus?.isProviderReady ? 'Provider Ready' : 'Waiting'}
            </Badge>
          </div>
          <CardDescription>
            Your appointment with {waitingStatus?.provider?.firstName}{' '}
            {waitingStatus?.provider?.lastName || 'your provider'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-muted-foreground">Current wait time</p>
              <p className="text-3xl font-bold">{waitingStatus?.waitTimeDisplay || '0:00'}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Scheduled time</p>
              <p className="text-sm font-medium">
                {waitingStatus?.scheduledTime
                  ? new Date(waitingStatus.scheduledTime).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '--:--'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>{waitingStatus?.appointmentType || 'Telehealth Visit'}</span>
          </div>
        </CardContent>
      </Card>

      {/* Technical Pre-Checks */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Technical Check</CardTitle>
            <Button variant="ghost" size="sm" onClick={runAllChecks}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Re-run
            </Button>
          </div>
          <CardDescription>
            Ensure your camera, microphone, and connection are working properly
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Camera Check */}
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              <Video className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Camera</p>
                <p className="text-sm text-muted-foreground">
                  {techChecks.camera === 'passed'
                    ? 'Camera is working'
                    : techChecks.camera === 'failed'
                    ? 'Camera not detected'
                    : techChecks.camera === 'checking'
                    ? 'Checking...'
                    : 'Not checked'}
                </p>
              </div>
            </div>
            {getTechCheckIcon(techChecks.camera)}
          </div>

          {/* Microphone Check */}
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              <Mic className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Microphone</p>
                <p className="text-sm text-muted-foreground">
                  {techChecks.microphone === 'passed'
                    ? 'Microphone is working'
                    : techChecks.microphone === 'failed'
                    ? 'Microphone not detected'
                    : techChecks.microphone === 'checking'
                    ? 'Checking...'
                    : 'Not checked'}
                </p>
              </div>
            </div>
            {getTechCheckIcon(techChecks.microphone)}
          </div>

          {/* Connection Check */}
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              <Wifi className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Connection</p>
                <p className="text-sm text-muted-foreground">
                  {techChecks.connection === 'passed'
                    ? 'Connection is stable'
                    : techChecks.connection === 'failed'
                    ? 'Connection may be slow'
                    : techChecks.connection === 'checking'
                    ? 'Checking...'
                    : 'Not checked'}
                </p>
              </div>
            </div>
            {getTechCheckIcon(techChecks.connection)}
          </div>

          {/* Overall Status */}
          {allChecksPassed ? (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-800">Ready for your visit</AlertTitle>
              <AlertDescription className="text-green-700">
                All technical checks passed. You&apos;re ready for your telehealth visit.
              </AlertDescription>
            </Alert>
          ) : (
            techChecks.camera !== 'pending' && (
              <Alert variant="default">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Some checks need attention</AlertTitle>
                <AlertDescription>
                  Please ensure your camera and microphone are enabled in your browser settings.
                </AlertDescription>
              </Alert>
            )
          )}
        </CardContent>
      </Card>

      {/* Pre-Visit Questionnaire */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pre-Visit Questions</CardTitle>
          <CardDescription>
            Help your provider prepare for your visit by answering a few questions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {questionnaireSubmitted || waitingStatus?.questionnaireCompleted ? (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-800">Submitted</AlertTitle>
              <AlertDescription className="text-green-700">
                Your responses have been saved and shared with your provider.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="symptoms">What symptoms are you experiencing today?</Label>
                <Textarea
                  id="symptoms"
                  placeholder="Describe your current symptoms..."
                  value={questionnaire.currentSymptoms || ''}
                  onChange={(e) =>
                    setQuestionnaire((prev) => ({
                      ...prev,
                      currentSymptoms: e.target.value,
                    }))
                  }
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="medications">
                  Have there been any changes to your medications?
                </Label>
                <Textarea
                  id="medications"
                  placeholder="List any medication changes..."
                  value={questionnaire.medicationChanges || ''}
                  onChange={(e) =>
                    setQuestionnaire((prev) => ({
                      ...prev,
                      medicationChanges: e.target.value,
                    }))
                  }
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="concerns">
                  Any additional concerns you&apos;d like to discuss?
                </Label>
                <Textarea
                  id="concerns"
                  placeholder="Any other topics for today's visit..."
                  value={questionnaire.additionalConcerns || ''}
                  onChange={(e) =>
                    setQuestionnaire((prev) => ({
                      ...prev,
                      additionalConcerns: e.target.value,
                    }))
                  }
                  rows={2}
                />
              </div>

              <Button
                onClick={handleQuestionnaireSubmit}
                disabled={submitQuestionnaireMutation.isPending}
                className="w-full"
              >
                {submitQuestionnaireMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Responses'
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Leave Waiting Room */}
      <div className="flex justify-center">
        <Button
          variant="outline"
          onClick={handleLeaveWaitingRoom}
          disabled={leaveMutation.isPending}
        >
          {leaveMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Leaving...
            </>
          ) : (
            'Leave Waiting Room'
          )}
        </Button>
      </div>
    </div>
  );
}
