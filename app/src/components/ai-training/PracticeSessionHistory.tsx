'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Video,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  Eye,
  Star,
  MessageSquare,
  Target,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface PracticeSession {
  id: string;
  date: string;
  scenarioType: string;
  scenarioName: string;
  difficulty: string;
  duration: number;
  status: 'completed' | 'in_progress' | 'abandoned';
  scores: {
    overall: number;
    tone: number;
    empathy: number;
    scriptAdherence: number;
    timing: number;
  };
  outcomeAchieved: boolean;
  feedback?: string;
}

// Demo data for practice session history
const demoPracticeSessions: PracticeSession[] = [
  {
    id: '1',
    date: '2024-01-22T14:30:00Z',
    scenarioType: 'SCHEDULING_CALL',
    scenarioName: 'New Patient Appointment Request',
    difficulty: 'INTERMEDIATE',
    duration: 285,
    status: 'completed',
    scores: {
      overall: 88,
      tone: 92,
      empathy: 85,
      scriptAdherence: 90,
      timing: 84,
    },
    outcomeAchieved: true,
    feedback: 'Great job handling the scheduling request. Consider asking about preferred times earlier in the conversation.',
  },
  {
    id: '2',
    date: '2024-01-21T10:15:00Z',
    scenarioType: 'COMPLAINT_HANDLING',
    scenarioName: 'Long Wait Time Complaint',
    difficulty: 'ADVANCED',
    duration: 420,
    status: 'completed',
    scores: {
      overall: 76,
      tone: 80,
      empathy: 72,
      scriptAdherence: 78,
      timing: 75,
    },
    outcomeAchieved: false,
    feedback: 'Work on expressing empathy more quickly. The customer escalated before you acknowledged their frustration.',
  },
  {
    id: '3',
    date: '2024-01-20T16:00:00Z',
    scenarioType: 'BILLING_INQUIRY',
    scenarioName: 'Insurance Coverage Question',
    difficulty: 'BEGINNER',
    duration: 180,
    status: 'completed',
    scores: {
      overall: 95,
      tone: 98,
      empathy: 92,
      scriptAdherence: 96,
      timing: 94,
    },
    outcomeAchieved: true,
    feedback: 'Excellent explanation of insurance coverage. Very professional and patient.',
  },
  {
    id: '4',
    date: '2024-01-19T11:45:00Z',
    scenarioType: 'NEW_PATIENT_INTAKE',
    scenarioName: 'First-Time Caller',
    difficulty: 'INTERMEDIATE',
    duration: 350,
    status: 'abandoned',
    scores: {
      overall: 0,
      tone: 0,
      empathy: 0,
      scriptAdherence: 0,
      timing: 0,
    },
    outcomeAchieved: false,
    feedback: 'Session abandoned before completion.',
  },
  {
    id: '5',
    date: '2024-01-18T09:30:00Z',
    scenarioType: 'CANCELLATION',
    scenarioName: 'Last-Minute Cancellation',
    difficulty: 'INTERMEDIATE',
    duration: 240,
    status: 'completed',
    scores: {
      overall: 82,
      tone: 88,
      empathy: 80,
      scriptAdherence: 82,
      timing: 78,
    },
    outcomeAchieved: true,
    feedback: 'Good job offering rescheduling options. Could improve on mentioning cancellation policy earlier.',
  },
];

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getScoreBadge(score: number) {
  if (score >= 90) return <Badge className="bg-green-600">{score}%</Badge>;
  if (score >= 70) return <Badge className="bg-yellow-500 text-white">{score}%</Badge>;
  if (score > 0) return <Badge variant="destructive">{score}%</Badge>;
  return <Badge variant="outline">N/A</Badge>;
}

function getDifficultyBadge(difficulty: string) {
  switch (difficulty) {
    case 'BEGINNER':
      return <Badge variant="outline" className="border-green-500 text-green-600">Beginner</Badge>;
    case 'INTERMEDIATE':
      return <Badge variant="outline" className="border-yellow-500 text-yellow-600">Intermediate</Badge>;
    case 'ADVANCED':
      return <Badge variant="outline" className="border-orange-500 text-orange-600">Advanced</Badge>;
    case 'EXPERT':
      return <Badge variant="outline" className="border-red-500 text-red-600">Expert</Badge>;
    default:
      return <Badge variant="outline">{difficulty}</Badge>;
  }
}

function getStatusIcon(status: PracticeSession['status']) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-600" />;
    case 'in_progress':
      return <Clock className="h-4 w-4 text-blue-600" />;
    case 'abandoned':
      return <XCircle className="h-4 w-4 text-red-600" />;
  }
}

function getScenarioTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    SCHEDULING_CALL: 'Scheduling',
    BILLING_INQUIRY: 'Billing',
    COMPLAINT_HANDLING: 'Complaint',
    NEW_PATIENT_INTAKE: 'New Patient',
    CANCELLATION: 'Cancellation',
    INSURANCE_QUESTIONS: 'Insurance',
    FOLLOW_UP_CALL: 'Follow-up',
    EMERGENCY_TRIAGE: 'Emergency',
  };
  return labels[type] || type;
}

interface SessionDetailsDialogProps {
  session: PracticeSession;
}

function SessionDetailsDialog({ session }: SessionDetailsDialogProps) {
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {getStatusIcon(session.status)}
          {session.scenarioName}
        </DialogTitle>
        <DialogDescription>
          {formatDate(session.date)} • {formatDuration(session.duration)}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6 py-4">
        {/* Scenario Info */}
        <div className="flex items-center gap-4">
          <Badge variant="secondary">{getScenarioTypeLabel(session.scenarioType)}</Badge>
          {getDifficultyBadge(session.difficulty)}
          {session.outcomeAchieved ? (
            <Badge className="bg-green-600"><Target className="h-3 w-3 mr-1" />Outcome Achieved</Badge>
          ) : session.status === 'completed' ? (
            <Badge variant="destructive"><Target className="h-3 w-3 mr-1" />Outcome Not Achieved</Badge>
          ) : null}
        </div>

        {/* Score Breakdown */}
        {session.status === 'completed' && (
          <div className="space-y-4">
            <h4 className="font-semibold flex items-center gap-2">
              <Star className="h-4 w-4" />
              Score Breakdown
            </h4>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Overall Score</span>
                  <span className="font-medium">{session.scores.overall}%</span>
                </div>
                <Progress value={session.scores.overall} className="h-2" />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Tone</span>
                  <span className="font-medium">{session.scores.tone}%</span>
                </div>
                <Progress value={session.scores.tone} className="h-2" />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Empathy</span>
                  <span className="font-medium">{session.scores.empathy}%</span>
                </div>
                <Progress value={session.scores.empathy} className="h-2" />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Script Adherence</span>
                  <span className="font-medium">{session.scores.scriptAdherence}%</span>
                </div>
                <Progress value={session.scores.scriptAdherence} className="h-2" />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Timing</span>
                  <span className="font-medium">{session.scores.timing}%</span>
                </div>
                <Progress value={session.scores.timing} className="h-2" />
              </div>
            </div>
          </div>
        )}

        {/* Feedback */}
        {session.feedback && (
          <div className="space-y-2">
            <h4 className="font-semibold flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Feedback
            </h4>
            <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
              {session.feedback}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t">
          <Button variant="outline" className="flex-1">
            <Play className="h-4 w-4 mr-2" />
            Replay Session
          </Button>
          <Button className="flex-1">
            <TrendingUp className="h-4 w-4 mr-2" />
            Practice Again
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

interface PracticeSessionHistoryProps {
  userId?: string;
  showDemoData?: boolean;
}

export function PracticeSessionHistory({ userId, showDemoData = true }: PracticeSessionHistoryProps) {
  const [scenarioFilter, setScenarioFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Use demo data for now
  const sessions = showDemoData ? demoPracticeSessions : [];
  const isLoading = false;

  // Apply filters
  const filteredSessions = sessions.filter((session) => {
    if (scenarioFilter !== 'all' && session.scenarioType !== scenarioFilter) return false;
    if (statusFilter !== 'all' && session.status !== statusFilter) return false;
    return true;
  });

  // Calculate summary stats
  const completedSessions = sessions.filter((s) => s.status === 'completed');
  const avgScore = completedSessions.length > 0
    ? Math.round(
        completedSessions.reduce((acc, s) => acc + s.scores.overall, 0) / completedSessions.length
      )
    : 0;
  const outcomeRate = completedSessions.length > 0
    ? Math.round(
        (completedSessions.filter((s) => s.outcomeAchieved).length / completedSessions.length) * 100
      )
    : 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              Practice Session History
            </CardTitle>
            <CardDescription>
              {completedSessions.length} sessions completed • {avgScore}% avg score • {outcomeRate}% success rate
            </CardDescription>
          </div>

          <div className="flex gap-2">
            <Select value={scenarioFilter} onValueChange={setScenarioFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Scenario Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Scenarios</SelectItem>
                <SelectItem value="SCHEDULING_CALL">Scheduling</SelectItem>
                <SelectItem value="BILLING_INQUIRY">Billing</SelectItem>
                <SelectItem value="COMPLAINT_HANDLING">Complaint</SelectItem>
                <SelectItem value="NEW_PATIENT_INTAKE">New Patient</SelectItem>
                <SelectItem value="CANCELLATION">Cancellation</SelectItem>
                <SelectItem value="INSURANCE_QUESTIONS">Insurance</SelectItem>
                <SelectItem value="FOLLOW_UP_CALL">Follow-up</SelectItem>
                <SelectItem value="EMERGENCY_TRIAGE">Emergency</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="abandoned">Abandoned</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Scenario</TableHead>
              <TableHead>Difficulty</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSessions.map((session) => (
              <TableRow key={session.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(session.status)}
                    <span className="text-sm">{formatDate(session.date)}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium text-sm">{session.scenarioName}</p>
                    <Badge variant="secondary" className="text-xs mt-1">
                      {getScenarioTypeLabel(session.scenarioType)}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell>{getDifficultyBadge(session.difficulty)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    {formatDuration(session.duration)}
                  </div>
                </TableCell>
                <TableCell>{getScoreBadge(session.scores.overall)}</TableCell>
                <TableCell>
                  {session.status === 'completed' ? (
                    session.outcomeAchieved ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <SessionDetailsDialog session={session} />
                  </Dialog>
                </TableCell>
              </TableRow>
            ))}

            {filteredSessions.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  <Video className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No practice sessions found</p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
