'use client';

/**
 * Provider Waiting Room Dashboard Component
 * Epic 21: Telehealth & Virtual Care - US-218
 *
 * Provider-facing dashboard showing:
 * - Patients currently waiting
 * - Wait times and pre-check status
 * - Admit patient functionality
 * - Questionnaire responses preview
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { trpc } from '@/trpc/client';
import {
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  Video,
  Mic,
  Wifi,
  FileText,
  Play,
  RefreshCw,
  Loader2,
  UserCheck,
} from 'lucide-react';

interface ProviderWaitingRoomDashboardProps {
  onAdmitPatient?: (sessionId: string) => void;
}

// Define types for the waiting room data
interface WaitingPatient {
  id: string;
  currentWaitSeconds: number;
  cameraChecked: boolean;
  microphoneChecked: boolean;
  connectionChecked: boolean;
  preVisitQuestionnaireCompleted: boolean;
  preVisitResponses: Record<string, string> | null;
  patient: {
    id: string;
    demographics: {
      firstName: string;
      lastName: string;
      dateOfBirth: Date;
    } | null;
  };
  session: {
    id: string;
    appointment: {
      appointmentType: {
        name: string;
        color: string;
      } | null;
    };
  };
}

export function ProviderWaitingRoomDashboard({
  onAdmitPatient,
}: ProviderWaitingRoomDashboardProps) {
  const [admittingId, setAdmittingId] = useState<string | null>(null);

  // Query waiting patients (polls every 10 seconds)
  const { data: waitingPatients, isLoading, refetch } = trpc.telehealth.getWaitingRoom.useQuery(
    {},
    {
      refetchInterval: 10000, // Poll every 10 seconds
    }
  );

  // Admit patient mutation
  const admitMutation = trpc.telehealth.admitPatient.useMutation({
    onSuccess: (data) => {
      refetch();
      setAdmittingId(null);
      onAdmitPatient?.(data.sessionId);
    },
    onError: () => {
      setAdmittingId(null);
    },
  });

  const formatWaitTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const getInitials = (firstName?: string | null, lastName?: string | null): string => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '??';
  };

  const getTechCheckBadge = (passed: boolean) => {
    return passed ? (
      <CheckCircle2 className="h-4 w-4 text-green-500" />
    ) : (
      <XCircle className="h-4 w-4 text-red-500" />
    );
  };

  const handleAdmit = (waitingRoomId: string) => {
    setAdmittingId(waitingRoomId);
    admitMutation.mutate({ waitingRoomId });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // Cast the data to our expected type
  const patients = (Array.isArray(waitingPatients) ? waitingPatients : []) as unknown as WaitingPatient[];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle>Virtual Waiting Room</CardTitle>
            {patients.length > 0 && (
              <Badge variant="secondary">{patients.length} waiting</Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <CardDescription>
          Patients waiting for their telehealth appointments
        </CardDescription>
      </CardHeader>
      <CardContent>
        {patients.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <UserCheck className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No patients currently waiting</p>
            <p className="text-sm mt-1">
              Patients will appear here when they join the waiting room
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {patients.map((waitingEntry) => (
              <div
                key={waitingEntry.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  {/* Patient Avatar */}
                  <Avatar className="h-12 w-12">
                    <AvatarFallback>
                      {getInitials(
                        waitingEntry.patient?.demographics?.firstName,
                        waitingEntry.patient?.demographics?.lastName
                      )}
                    </AvatarFallback>
                  </Avatar>

                  {/* Patient Info */}
                  <div>
                    <p className="font-medium">
                      {waitingEntry.patient?.demographics?.firstName}{' '}
                      {waitingEntry.patient?.demographics?.lastName}
                    </p>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Waiting {formatWaitTime(waitingEntry.currentWaitSeconds)}
                      </span>
                      <span>
                        {waitingEntry.session?.appointment?.appointmentType?.name || 'Telehealth Visit'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {/* Tech Check Status */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1" title="Camera">
                      <Video className="h-4 w-4 text-muted-foreground" />
                      {getTechCheckBadge(waitingEntry.cameraChecked)}
                    </div>
                    <div className="flex items-center gap-1" title="Microphone">
                      <Mic className="h-4 w-4 text-muted-foreground" />
                      {getTechCheckBadge(waitingEntry.microphoneChecked)}
                    </div>
                    <div className="flex items-center gap-1" title="Connection">
                      <Wifi className="h-4 w-4 text-muted-foreground" />
                      {getTechCheckBadge(waitingEntry.connectionChecked)}
                    </div>
                  </div>

                  <Separator orientation="vertical" className="h-8" />

                  {/* Pre-Visit Questionnaire */}
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!waitingEntry.preVisitQuestionnaireCompleted}
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        {waitingEntry.preVisitQuestionnaireCompleted ? 'View' : 'Pending'}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Pre-Visit Questionnaire</DialogTitle>
                        <DialogDescription>
                          Responses from {waitingEntry.patient?.demographics?.firstName}{' '}
                          {waitingEntry.patient?.demographics?.lastName}
                        </DialogDescription>
                      </DialogHeader>
                      <ScrollArea className="max-h-[400px]">
                        {waitingEntry.preVisitResponses ? (
                          <div className="space-y-4">
                            {Object.entries(waitingEntry.preVisitResponses).map(([key, value]) => (
                              <div key={key}>
                                <p className="font-medium text-sm capitalize">
                                  {key.replace(/([A-Z])/g, ' $1').trim()}
                                </p>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {value || 'No response'}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-muted-foreground">
                            No questionnaire responses available.
                          </p>
                        )}
                      </ScrollArea>
                    </DialogContent>
                  </Dialog>

                  {/* Admit Button */}
                  <Button
                    onClick={() => handleAdmit(waitingEntry.id)}
                    disabled={admitMutation.isPending}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {admitMutation.isPending && admittingId === waitingEntry.id ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    Admit
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Waiting Room Stats */}
        {patients.length > 0 && (
          <div className="mt-6 pt-4 border-t">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold">{patients.length}</p>
                <p className="text-sm text-muted-foreground">Total Waiting</p>
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {patients.length > 0
                    ? formatWaitTime(
                        Math.round(
                          patients.reduce((sum, p) => sum + p.currentWaitSeconds, 0) /
                            patients.length
                        )
                      )
                    : '0:00'}
                </p>
                <p className="text-sm text-muted-foreground">Avg Wait Time</p>
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {patients.filter(
                    (p) => p.cameraChecked && p.microphoneChecked && p.connectionChecked
                  ).length}
                </p>
                <p className="text-sm text-muted-foreground">Ready for Visit</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
