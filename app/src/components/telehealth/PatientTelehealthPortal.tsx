'use client';

/**
 * Patient Telehealth Portal Component
 * Epic 21: Telehealth & Virtual Care - US-223
 *
 * Patient-facing portal for telehealth access:
 * - View upcoming telehealth appointments
 * - Join waiting room
 * - Access video consultation
 * - View telehealth history
 * - Mobile-friendly interface
 */

import { useState } from 'react';
import { format, formatDistanceToNow, isToday, isTomorrow, parseISO, isPast, isFuture, addMinutes } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import {
  Video,
  VideoOff,
  Calendar,
  Clock,
  Play,
  History,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Phone,
  Wifi,
  Monitor,
  Mic,
  Camera,
  ArrowRight,
  Info,
  FileText,
  User,
  ChevronRight,
  ExternalLink,
  Bell,
  Settings,
  HelpCircle,
  Shield,
} from 'lucide-react';

interface PatientTelehealthPortalProps {
  patientId: string;
  onJoinSession?: (sessionId: string) => void;
  onViewSession?: (sessionId: string) => void;
}

// Type definitions
interface TelehealthSession {
  id: string;
  status: string;
  roomUrl: string;
  scheduledStartTime: Date | string;
  scheduledEndTime: Date | string;
  actualStartTime?: Date | string | null;
  actualEndTime?: Date | string | null;
  appointment: {
    id: string;
    chiefComplaint?: string | null;
    provider?: {
      user: {
        firstName: string;
        lastName: string;
      };
    } | null;
    appointmentType?: {
      name: string;
      color: string;
      duration: number;
    } | null;
  };
}

export function PatientTelehealthPortal({
  patientId,
  onJoinSession,
  onViewSession,
}: PatientTelehealthPortalProps) {
  const [activeTab, setActiveTab] = useState('upcoming');
  const [techCheckOpen, setTechCheckOpen] = useState(false);
  const [cameraWorking, setCameraWorking] = useState<boolean | null>(null);
  const [micWorking, setMicWorking] = useState<boolean | null>(null);
  const [connectionWorking, setConnectionWorking] = useState<boolean | null>(null);
  const [techCheckComplete, setTechCheckComplete] = useState(false);

  // Queries
  const { data: upcomingSessions, isLoading: loadingUpcoming, refetch: refetchUpcoming } =
    trpc.telehealth.listSessions.useQuery({
      patientId,
      status: 'SCHEDULED',
      limit: 10,
    });

  const { data: historyData, isLoading: loadingHistory } =
    trpc.telehealth.listSessions.useQuery({
      patientId,
      status: 'COMPLETED',
      limit: 20,
    });

  // Mutations
  const joinWaitingRoomMutation = trpc.telehealth.joinWaitingRoom.useMutation({
    onSuccess: (data) => {
      toast.success('Joined waiting room');
      onJoinSession?.(data.waitingRoomId);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Helper functions
  const formatSessionDate = (date: Date | string): string => {
    const d = typeof date === 'string' ? parseISO(date) : date;
    if (isToday(d)) {
      return `Today at ${format(d, 'h:mm a')}`;
    }
    if (isTomorrow(d)) {
      return `Tomorrow at ${format(d, 'h:mm a')}`;
    }
    return format(d, 'EEEE, MMMM d, yyyy \'at\' h:mm a');
  };

  const canJoinSession = (session: TelehealthSession): boolean => {
    const startTime = typeof session.scheduledStartTime === 'string'
      ? parseISO(session.scheduledStartTime)
      : session.scheduledStartTime;
    const endTime = typeof session.scheduledEndTime === 'string'
      ? parseISO(session.scheduledEndTime)
      : session.scheduledEndTime;

    // Can join 15 minutes before start time until end time
    const joinableFrom = addMinutes(startTime, -15);
    const now = new Date();

    return now >= joinableFrom && now <= endTime;
  };

  const getTimeUntilSession = (session: TelehealthSession): string => {
    const startTime = typeof session.scheduledStartTime === 'string'
      ? parseISO(session.scheduledStartTime)
      : session.scheduledStartTime;

    if (isPast(startTime)) {
      return 'Starting now';
    }

    return formatDistanceToNow(startTime, { addSuffix: true });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SCHEDULED':
        return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Scheduled</Badge>;
      case 'WAITING':
        return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">In Waiting Room</Badge>;
      case 'IN_PROGRESS':
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">In Progress</Badge>;
      case 'COMPLETED':
        return <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100">Completed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleTechCheck = async () => {
    setTechCheckOpen(true);
    setCameraWorking(null);
    setMicWorking(null);
    setConnectionWorking(null);
    setTechCheckComplete(false);

    // Check camera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      setCameraWorking(true);
    } catch {
      setCameraWorking(false);
    }

    // Check microphone
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setMicWorking(true);
    } catch {
      setMicWorking(false);
    }

    // Check connection (simple online check)
    setConnectionWorking(navigator.onLine);
    setTechCheckComplete(true);
  };

  const handleJoinWaitingRoom = (sessionId: string) => {
    if (!techCheckComplete) {
      toast.info('Please complete the tech check first');
      handleTechCheck();
      return;
    }

    joinWaitingRoomMutation.mutate({
      sessionId,
      deviceType: /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
      browserInfo: navigator.userAgent,
      connectionType: navigator.onLine ? 'wifi' : undefined,
    });
  };

  const upcomingList = upcomingSessions?.sessions || [];
  const historyList = historyData?.sessions || [];

  // Find next upcoming session
  const nextSession = upcomingList.length > 0 ? upcomingList[0] as TelehealthSession : null;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-full mb-2">
          <Video className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold">Telehealth Portal</h1>
        <p className="text-muted-foreground">
          Join virtual visits from anywhere
        </p>
      </div>

      {/* Next Appointment Card */}
      {nextSession && (
        <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div>
                <CardDescription>Your Next Telehealth Visit</CardDescription>
                <CardTitle className="text-xl mt-1">
                  {nextSession.appointment.appointmentType?.name || 'Video Visit'}
                </CardTitle>
              </div>
              {getStatusBadge(nextSession.status)}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <span>{formatSessionDate(nextSession.scheduledStartTime)}</span>
              </div>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                <span>
                  Dr. {nextSession.appointment.provider?.user.firstName}{' '}
                  {nextSession.appointment.provider?.user.lastName}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <span>{nextSession.appointment.appointmentType?.duration || 30} minutes</span>
              </div>
            </div>

            {nextSession.appointment.chiefComplaint && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Reason for visit</p>
                <p className="text-sm">{nextSession.appointment.chiefComplaint}</p>
              </div>
            )}

            <Separator />

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                onClick={handleTechCheck}
                className="flex-1"
              >
                <Settings className="h-4 w-4 mr-2" />
                Test Equipment
              </Button>
              <Button
                onClick={() => handleJoinWaitingRoom(nextSession.id)}
                disabled={!canJoinSession(nextSession) || joinWaitingRoomMutation.isPending}
                className="flex-1 bg-gradient-to-r from-[#053e67]/50 to-[#053e67] hover:from-[#053e67] hover:to-[#053e67]/90"
              >
                {joinWaitingRoomMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                {canJoinSession(nextSession)
                  ? 'Join Waiting Room'
                  : `Opens ${getTimeUntilSession(nextSession)}`}
              </Button>
            </div>

            {!canJoinSession(nextSession) && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  You can join the waiting room 15 minutes before your scheduled appointment time.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Shield className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-sm">Secure & Private</p>
              <p className="text-xs text-muted-foreground">HIPAA compliant video</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Monitor className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="font-medium text-sm">Easy to Use</p>
              <p className="text-xs text-muted-foreground">Works on any device</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-purple-50 border-purple-200">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <HelpCircle className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="font-medium text-sm">Support Available</p>
              <p className="text-xs text-muted-foreground">Help if you need it</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upcoming" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Upcoming
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Past Visits
          </TabsTrigger>
        </TabsList>

        {/* Upcoming Tab */}
        <TabsContent value="upcoming" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Calendar className="h-5 w-5" />
                Upcoming Telehealth Visits
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingUpcoming ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : upcomingList.length === 0 ? (
                <div className="text-center py-8">
                  <VideoOff className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">No upcoming telehealth visits</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Contact your provider to schedule a virtual visit
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(upcomingList as TelehealthSession[]).map((session) => (
                    <div
                      key={session.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {session.appointment.appointmentType?.name || 'Video Visit'}
                          </span>
                          {getStatusBadge(session.status)}
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatSessionDate(session.scheduledStartTime)}
                          </span>
                          <span>
                            Dr. {session.appointment.provider?.user.firstName}{' '}
                            {session.appointment.provider?.user.lastName}
                          </span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleJoinWaitingRoom(session.id)}
                        disabled={!canJoinSession(session)}
                        variant={canJoinSession(session) ? 'default' : 'outline'}
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <History className="h-5 w-5" />
                Past Telehealth Visits
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingHistory ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : historyList.length === 0 ? (
                <div className="text-center py-8">
                  <History className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">No past telehealth visits</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {(historyList as TelehealthSession[]).map((session) => (
                      <div
                        key={session.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => onViewSession?.(session.id)}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {session.appointment.appointmentType?.name || 'Video Visit'}
                            </span>
                            {getStatusBadge(session.status)}
                          </div>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(session.scheduledStartTime), 'MMM d, yyyy')}
                            </span>
                            <span>
                              Dr. {session.appointment.provider?.user.firstName}{' '}
                              {session.appointment.provider?.user.lastName}
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Tech Check Dialog */}
      <Dialog open={techCheckOpen} onOpenChange={setTechCheckOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Equipment Check
            </DialogTitle>
            <DialogDescription>
              Make sure your camera, microphone, and internet connection are working
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Camera Check */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${cameraWorking === null ? 'bg-gray-100' : cameraWorking ? 'bg-green-100' : 'bg-red-100'}`}>
                  <Camera className={`h-5 w-5 ${cameraWorking === null ? 'text-gray-600' : cameraWorking ? 'text-green-600' : 'text-red-600'}`} />
                </div>
                <div>
                  <p className="font-medium">Camera</p>
                  <p className="text-sm text-muted-foreground">
                    {cameraWorking === null ? 'Checking...' : cameraWorking ? 'Working' : 'Not detected'}
                  </p>
                </div>
              </div>
              {cameraWorking === null ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : cameraWorking ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600" />
              )}
            </div>

            {/* Microphone Check */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${micWorking === null ? 'bg-gray-100' : micWorking ? 'bg-green-100' : 'bg-red-100'}`}>
                  <Mic className={`h-5 w-5 ${micWorking === null ? 'text-gray-600' : micWorking ? 'text-green-600' : 'text-red-600'}`} />
                </div>
                <div>
                  <p className="font-medium">Microphone</p>
                  <p className="text-sm text-muted-foreground">
                    {micWorking === null ? 'Checking...' : micWorking ? 'Working' : 'Not detected'}
                  </p>
                </div>
              </div>
              {micWorking === null ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : micWorking ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600" />
              )}
            </div>

            {/* Connection Check */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${connectionWorking === null ? 'bg-gray-100' : connectionWorking ? 'bg-green-100' : 'bg-red-100'}`}>
                  <Wifi className={`h-5 w-5 ${connectionWorking === null ? 'text-gray-600' : connectionWorking ? 'text-green-600' : 'text-red-600'}`} />
                </div>
                <div>
                  <p className="font-medium">Internet Connection</p>
                  <p className="text-sm text-muted-foreground">
                    {connectionWorking === null ? 'Checking...' : connectionWorking ? 'Connected' : 'No connection'}
                  </p>
                </div>
              </div>
              {connectionWorking === null ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : connectionWorking ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600" />
              )}
            </div>

            {techCheckComplete && (
              <Alert className={cameraWorking && micWorking && connectionWorking ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'}>
                {cameraWorking && micWorking && connectionWorking ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertTitle className="text-green-800">All systems ready!</AlertTitle>
                    <AlertDescription className="text-green-700">
                      Your equipment is working properly. You&apos;re ready to join your telehealth visit.
                    </AlertDescription>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                    <AlertTitle className="text-yellow-800">Some issues detected</AlertTitle>
                    <AlertDescription className="text-yellow-700">
                      Please check your device settings or try a different browser. You may still be able to join with limited functionality.
                    </AlertDescription>
                  </>
                )}
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTechCheckOpen(false)}>
              Close
            </Button>
            <Button onClick={handleTechCheck} disabled={!techCheckComplete}>
              <Settings className="h-4 w-4 mr-2" />
              Test Again
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
