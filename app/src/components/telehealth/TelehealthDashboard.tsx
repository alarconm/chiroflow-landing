'use client';

/**
 * Telehealth Dashboard Component
 * Epic 21: Telehealth & Virtual Care - US-223
 *
 * Main dashboard for managing telehealth appointments and sessions:
 * - Virtual waiting room overview
 * - Quick-start telehealth visits
 * - Telehealth visit history
 * - Session quality metrics
 * - Upcoming telehealth appointments
 */

import { useState } from 'react';
import { format, formatDistanceToNow, isToday, isTomorrow, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import {
  Video,
  VideoOff,
  Calendar,
  Clock,
  Users,
  Play,
  History,
  BarChart3,
  Plus,
  Search,
  RefreshCw,
  Loader2,
  Phone,
  PhoneOff,
  Monitor,
  Wifi,
  WifiOff,
  CheckCircle2,
  XCircle,
  AlertCircle,
  MoreVertical,
  ExternalLink,
  FileText,
  User,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Activity,
  Zap,
} from 'lucide-react';
import { ProviderWaitingRoomDashboard } from './ProviderWaitingRoomDashboard';

interface TelehealthDashboardProps {
  onStartSession?: (sessionId: string) => void;
  onViewSession?: (sessionId: string) => void;
}

// Type definitions
interface TelehealthSession {
  id: string;
  status: string;
  provider: string;
  roomUrl: string;
  scheduledStartTime: Date | string;
  scheduledEndTime: Date | string;
  actualStartTime?: Date | string | null;
  actualEndTime?: Date | string | null;
  connectionQuality?: string | null;
  audioQuality?: string | null;
  videoQuality?: string | null;
  technicalNotes?: string | null;
  appointment: {
    id: string;
    chiefComplaint?: string | null;
    patient: {
      id: string;
      demographics?: {
        firstName: string;
        lastName: string;
      } | null;
    };
    provider?: {
      user: {
        firstName: string;
        lastName: string;
      };
    } | null;
    appointmentType?: {
      name: string;
      color: string;
    } | null;
  };
}

export function TelehealthDashboard({
  onStartSession,
  onViewSession,
}: TelehealthDashboardProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [quickStartOpen, setQuickStartOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [patientSearch, setPatientSearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'completed' | 'cancelled'>('all');

  // Queries
  const { data: upcomingSessions, isLoading: loadingUpcoming, refetch: refetchUpcoming } =
    trpc.telehealth.getUpcoming.useQuery({ limit: 10 });

  const { data: sessionHistory, isLoading: loadingHistory, refetch: refetchHistory } =
    trpc.telehealth.listSessions.useQuery({
      status: historyFilter === 'all' ? undefined : historyFilter === 'completed' ? 'COMPLETED' : 'CANCELLED',
      limit: 20,
    });

  const { data: patientsData } = trpc.patient.list.useQuery(
    { search: patientSearch, limit: 10 },
    { enabled: patientSearch.length >= 2 }
  );
  const patients = patientsData?.patients;

  // Mutations
  const createRoomMutation = trpc.telehealth.createRoom.useMutation({
    onSuccess: (data) => {
      toast.success('Telehealth room created');
      setQuickStartOpen(false);
      refetchUpcoming();
      if (data.sessionId) {
        onStartSession?.(data.sessionId);
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const startSessionMutation = trpc.telehealth.startSession.useMutation({
    onSuccess: (data) => {
      toast.success('Session started');
      refetchUpcoming();
      onStartSession?.(data.id);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Helper functions
  const getInitials = (firstName?: string | null, lastName?: string | null): string => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '??';
  };

  const formatSessionDate = (date: Date | string): string => {
    const d = typeof date === 'string' ? parseISO(date) : date;
    if (isToday(d)) {
      return `Today at ${format(d, 'h:mm a')}`;
    }
    if (isTomorrow(d)) {
      return `Tomorrow at ${format(d, 'h:mm a')}`;
    }
    return format(d, 'MMM d, yyyy h:mm a');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SCHEDULED':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Scheduled</Badge>;
      case 'WAITING':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Waiting</Badge>;
      case 'IN_PROGRESS':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">In Progress</Badge>;
      case 'COMPLETED':
        return <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">Completed</Badge>;
      case 'NO_SHOW':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">No Show</Badge>;
      case 'CANCELLED':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Cancelled</Badge>;
      case 'TECHNICAL_ISSUES':
        return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">Tech Issues</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getQualityIcon = (quality?: string | null) => {
    switch (quality) {
      case 'good':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'fair':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'poor':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Activity className="h-4 w-4 text-gray-400" />;
    }
  };

  const handleQuickStart = (appointmentId: string) => {
    createRoomMutation.mutate({ appointmentId });
  };

  const handleStartSession = (sessionId: string) => {
    startSessionMutation.mutate({
      sessionId,
      patientLocation: 'Unknown',
      providerLocation: 'Unknown',
    });
  };

  // Calculate metrics from session history
  const sessions = sessionHistory?.sessions || [];
  const completedSessions = sessions.filter((s: TelehealthSession) => s.status === 'COMPLETED');
  const totalSessions = sessions.length;
  const avgDuration = completedSessions.length > 0
    ? completedSessions.reduce((acc: number, s: TelehealthSession) => {
        const start = s.actualStartTime ? new Date(s.actualStartTime).getTime() : 0;
        const end = s.actualEndTime ? new Date(s.actualEndTime).getTime() : 0;
        return acc + (end - start);
      }, 0) / completedSessions.length / 60000
    : 0;

  const goodQualitySessions = completedSessions.filter(
    (s: TelehealthSession) => s.connectionQuality === 'good'
  ).length;
  const qualityRate = completedSessions.length > 0
    ? Math.round((goodQualitySessions / completedSessions.length) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Telehealth Dashboard</h1>
          <p className="text-muted-foreground">
            Manage virtual visits, waiting rooms, and telehealth sessions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchUpcoming();
              refetchHistory();
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            onClick={() => setQuickStartOpen(true)}
            className="bg-gradient-to-r from-[#053e67]/50 to-[#053e67] hover:from-[#053e67] hover:to-[#053e67]/90"
          >
            <Zap className="h-4 w-4 mr-2" />
            Quick Start Visit
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:grid-cols-none lg:inline-flex">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="waiting-room" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Waiting Room</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">History</span>
          </TabsTrigger>
          <TabsTrigger value="metrics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Metrics</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Calendar className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{upcomingSessions?.length || 0}</p>
                    <p className="text-sm text-muted-foreground">Upcoming</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Video className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{completedSessions.length}</p>
                    <p className="text-sm text-muted-foreground">Completed</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Clock className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{Math.round(avgDuration)}m</p>
                    <p className="text-sm text-muted-foreground">Avg Duration</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <Wifi className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{qualityRate}%</p>
                    <p className="text-sm text-muted-foreground">Quality Rate</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Upcoming Sessions */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  <CardTitle>Upcoming Telehealth Sessions</CardTitle>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setActiveTab('history')}>
                  View All
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
              <CardDescription>
                Your scheduled telehealth appointments
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingUpcoming ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : !upcomingSessions || upcomingSessions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <VideoOff className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No upcoming telehealth sessions</p>
                  <p className="text-sm mt-1">
                    Schedule a telehealth visit or use Quick Start
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(upcomingSessions as TelehealthSession[]).slice(0, 5).map((session) => (
                    <div
                      key={session.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback>
                            {getInitials(
                              session.appointment.patient.demographics?.firstName,
                              session.appointment.patient.demographics?.lastName
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">
                            {session.appointment.patient.demographics?.firstName}{' '}
                            {session.appointment.patient.demographics?.lastName}
                          </p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatSessionDate(session.scheduledStartTime)}
                            <span className="mx-1">•</span>
                            {session.appointment.appointmentType?.name || 'Telehealth'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(session.status)}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleStartSession(session.id)}>
                              <Play className="h-4 w-4 mr-2" />
                              Start Session
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onViewSession?.(session.id)}>
                              <FileText className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>
                              <ExternalLink className="h-4 w-4 mr-2" />
                              Open Room Link
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                          size="sm"
                          onClick={() => handleStartSession(session.id)}
                          disabled={startSessionMutation.isPending}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          {startSessionMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Video className="h-4 w-4 mr-2" />
                              Join
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Waiting Room Tab */}
        <TabsContent value="waiting-room">
          <ProviderWaitingRoomDashboard
            onAdmitPatient={(sessionId) => {
              onStartSession?.(sessionId);
            }}
          />
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="h-5 w-5 text-primary" />
                  <CardTitle>Telehealth Visit History</CardTitle>
                </div>
                <Select value={historyFilter} onValueChange={(v) => setHistoryFilter(v as typeof historyFilter)}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Filter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sessions</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {loadingHistory ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : sessions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No telehealth history</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-3">
                    {sessions.map((session: TelehealthSession) => (
                      <div
                        key={session.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => onViewSession?.(session.id)}
                      >
                        <div className="flex items-center gap-4">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback>
                              {getInitials(
                                session.appointment.patient.demographics?.firstName,
                                session.appointment.patient.demographics?.lastName
                              )}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">
                              {session.appointment.patient.demographics?.firstName}{' '}
                              {session.appointment.patient.demographics?.lastName}
                            </p>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(session.scheduledStartTime), 'MMM d, yyyy h:mm a')}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {/* Quality indicators */}
                          <div className="hidden md:flex items-center gap-2">
                            <div className="flex items-center gap-1" title="Connection">
                              <Wifi className="h-4 w-4 text-muted-foreground" />
                              {getQualityIcon(session.connectionQuality)}
                            </div>
                            <div className="flex items-center gap-1" title="Audio">
                              <Phone className="h-4 w-4 text-muted-foreground" />
                              {getQualityIcon(session.audioQuality)}
                            </div>
                            <div className="flex items-center gap-1" title="Video">
                              <Video className="h-4 w-4 text-muted-foreground" />
                              {getQualityIcon(session.videoQuality)}
                            </div>
                          </div>
                          {getStatusBadge(session.status)}
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Metrics Tab */}
        <TabsContent value="metrics" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Session Quality */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Session Quality
                </CardTitle>
                <CardDescription>
                  Connection quality metrics from recent sessions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Good Quality</span>
                    <span className="font-medium">{goodQualitySessions} sessions</span>
                  </div>
                  <Progress value={qualityRate} className="h-2" />
                </div>
                <Separator />
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="flex items-center justify-center gap-1 text-green-600">
                      <CheckCircle2 className="h-5 w-5" />
                      <span className="text-xl font-bold">{goodQualitySessions}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Good</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-center gap-1 text-yellow-600">
                      <AlertCircle className="h-5 w-5" />
                      <span className="text-xl font-bold">
                        {completedSessions.filter((s: TelehealthSession) => s.connectionQuality === 'fair').length}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">Fair</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-center gap-1 text-red-600">
                      <XCircle className="h-5 w-5" />
                      <span className="text-xl font-bold">
                        {completedSessions.filter((s: TelehealthSession) => s.connectionQuality === 'poor').length}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">Poor</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Session Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Session Statistics
                </CardTitle>
                <CardDescription>
                  Overview of telehealth session outcomes
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                      <span className="text-sm">Completed</span>
                    </div>
                    <span className="font-medium">{completedSessions.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <span className="text-sm">No Shows</span>
                    </div>
                    <span className="font-medium">
                      {sessions.filter((s: TelehealthSession) => s.status === 'NO_SHOW').length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-orange-500" />
                      <span className="text-sm">Technical Issues</span>
                    </div>
                    <span className="font-medium">
                      {sessions.filter((s: TelehealthSession) => s.status === 'TECHNICAL_ISSUES').length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-gray-500" />
                      <span className="text-sm">Cancelled</span>
                    </div>
                    <span className="font-medium">
                      {sessions.filter((s: TelehealthSession) => s.status === 'CANCELLED').length}
                    </span>
                  </div>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Completion Rate</span>
                  <span className="text-lg font-bold text-green-600">
                    {totalSessions > 0
                      ? Math.round((completedSessions.length / totalSessions) * 100)
                      : 0}%
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Duration Trend */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Average Session Duration
              </CardTitle>
              <CardDescription>
                Typical length of telehealth visits
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="text-4xl font-bold">{Math.round(avgDuration)}</div>
                  <p className="text-sm text-muted-foreground">minutes average</p>
                </div>
                <div className="text-right">
                  {avgDuration > 20 ? (
                    <div className="flex items-center gap-1 text-amber-600">
                      <TrendingUp className="h-5 w-5" />
                      <span className="text-sm">Longer than typical</span>
                    </div>
                  ) : avgDuration > 0 ? (
                    <div className="flex items-center gap-1 text-green-600">
                      <TrendingDown className="h-5 w-5" />
                      <span className="text-sm">Efficient sessions</span>
                    </div>
                  ) : null}
                  <p className="text-xs text-muted-foreground mt-1">
                    Based on {completedSessions.length} completed sessions
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Quick Start Dialog */}
      <Dialog open={quickStartOpen} onOpenChange={setQuickStartOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Quick Start Telehealth Visit
            </DialogTitle>
            <DialogDescription>
              Start an instant telehealth session with a patient
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Search Patient</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or MRN..."
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              {patients && patients.length > 0 && (
                <div className="border rounded-md max-h-48 overflow-auto">
                  {patients.map((patient: { id: string; firstName: string; lastName: string; mrn: string }) => (
                    <button
                      key={patient.id}
                      type="button"
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 border-b last:border-0 flex items-center gap-2 ${
                        selectedPatientId === patient.id ? 'bg-muted' : ''
                      }`}
                      onClick={() => setSelectedPatientId(patient.id)}
                    >
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">
                        {patient.lastName}, {patient.firstName}
                      </span>
                      <span className="text-muted-foreground">({patient.mrn})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickStartOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedPatientId) {
                  // Note: Quick start would need an appointment first
                  // For now, show a toast indicating this limitation
                  toast.info('Please schedule a telehealth appointment first');
                  setQuickStartOpen(false);
                }
              }}
              disabled={!selectedPatientId || createRoomMutation.isPending}
              className="bg-gradient-to-r from-[#053e67]/50 to-[#053e67] hover:from-[#053e67] hover:to-[#053e67]/90"
            >
              {createRoomMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Video className="h-4 w-4 mr-2" />
              )}
              Start Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
