'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  TrendingUp,
  User,
  Edit3,
  PenTool,
  Loader2,
  ChevronRight,
  RefreshCw,
  BarChart3,
} from 'lucide-react';
import { trpc } from '@/trpc/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { AuthUser } from '@/lib/auth';

const chartingStatusColors: Record<string, { bg: string; text: string; label: string }> = {
  not_started: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Not Started' },
  started: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Started' },
  in_progress: { bg: 'bg-blue-100', text: 'text-[#053e67]', label: 'In Progress' },
  signed: { bg: 'bg-green-100', text: 'text-green-700', label: 'Signed' },
};

const encounterTypeLabels: Record<string, string> = {
  INITIAL_EVAL: 'Initial Eval',
  FOLLOW_UP: 'Follow-up',
  RE_EVALUATION: 'Re-eval',
  DISCHARGE: 'Discharge',
  MAINTENANCE: 'Maintenance',
  ACUTE: 'Acute',
  WORKERS_COMP: 'Workers Comp',
  PERSONAL_INJURY: 'PI',
};

export default function ClinicalDashboardPage() {
  const { data: session } = useSession();
  const user = session?.user as AuthUser | undefined;
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedNotes, setSelectedNotes] = useState<string[]>([]);
  const [showBatchSign, setShowBatchSign] = useState(false);

  // Fetch provider workqueue
  const {
    data: workqueue,
    isLoading: loadingWorkqueue,
    refetch: refetchWorkqueue,
  } = trpc.encounter.getProviderWorkqueue.useQuery({
    date: new Date(selectedDate),
  });

  // Fetch unsigned notes
  const {
    data: unsignedData,
    isLoading: loadingUnsigned,
    refetch: refetchUnsigned,
  } = trpc.encounter.getUnsignedNotes.useQuery({
    limit: 30,
  });

  // Fetch provider stats
  const { data: stats, isLoading: loadingStats } = trpc.encounter.getProviderStats.useQuery();

  // Batch sign mutation
  const batchSignMutation = trpc.encounter.batchSign.useMutation({
    onSuccess: (data) => {
      if (data.signedCount > 0) {
        toast.success(`Successfully signed ${data.signedCount} note(s)`);
        refetchWorkqueue();
        refetchUnsigned();
        setSelectedNotes([]);
        setShowBatchSign(false);
      }
      if (data.errors.length > 0) {
        toast.error(`${data.errors.length} note(s) could not be signed`);
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const handleSelectNote = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedNotes((prev) => [...prev, id]);
    } else {
      setSelectedNotes((prev) => prev.filter((n) => n !== id));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked && unsignedData?.notes) {
      setSelectedNotes(unsignedData.notes.map((n) => n.id));
    } else {
      setSelectedNotes([]);
    }
  };

  const handleBatchSign = () => {
    if (selectedNotes.length === 0) return;
    batchSignMutation.mutate({
      encounterIds: selectedNotes,
      attestation: `Electronically signed by ${user?.firstName} ${user?.lastName} on ${format(new Date(), 'MMM d, yyyy h:mm a')}`,
    });
  };

  const handleRefresh = () => {
    refetchWorkqueue();
    refetchUnsigned();
  };

  const isLoading = loadingWorkqueue || loadingUnsigned || loadingStats;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-[#053e67]/50" />
            Clinical Dashboard
          </h1>
          <p className="text-gray-500 mt-1">
            Manage your charts, track pending notes, and sign documentation
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
          <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Total Charts (30d)
            </CardTitle>
            <FileText className="h-4 w-4 text-[#053e67]/50" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalEncounters || 0}</div>
            <p className="text-xs text-gray-500 mt-1">
              {stats?.signedNotes || 0} signed, {stats?.pendingNotes || 0} pending
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Pending Notes</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{unsignedData?.total || 0}</div>
            <p className="text-xs text-gray-500 mt-1">
              {unsignedData?.overdue || 0} overdue (&gt;3 days)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Avg Days to Sign</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.avgDaysToSign || 0}</div>
            <p className="text-xs text-gray-500 mt-1">days from visit to signature</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Today&apos;s Visits</CardTitle>
            <Calendar className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{workqueue?.appointments?.length || 0}</div>
            <p className="text-xs text-gray-500 mt-1">
              {workqueue?.appointments?.filter((a) => a.chartingStatus === 'signed').length || 0}{' '}
              charted
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Today's Schedule */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Today&apos;s Schedule</CardTitle>
                <CardDescription>Appointments and charting status</CardDescription>
              </div>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-[150px]"
              />
            </div>
          </CardHeader>
          <CardContent>
            {loadingWorkqueue ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : workqueue?.appointments && workqueue.appointments.length > 0 ? (
              <div className="space-y-3">
                {workqueue.appointments.map((apt) => {
                  const status = chartingStatusColors[apt.chartingStatus] || chartingStatusColors.not_started;
                  return (
                    <div
                      key={apt.id}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-sm text-gray-500 w-16">
                          {format(new Date(apt.startTime), 'h:mm a')}
                        </div>
                        <div>
                          <p className="font-medium">
                            {apt.patient?.demographics?.firstName}{' '}
                            {apt.patient?.demographics?.lastName}
                          </p>
                          <p className="text-sm text-gray-500">
                            {apt.appointmentType?.name || 'Appointment'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={cn(status.bg, status.text)}>{status.label}</Badge>
                        {apt.encounter ? (
                          <Link href={`/patients/${apt.patientId}/encounters/${apt.encounter.id}`}>
                            <Button size="sm" variant="ghost">
                              <Edit3 className="h-4 w-4" />
                            </Button>
                          </Link>
                        ) : (
                          <Link href={`/patients/${apt.patientId}?tab=encounters&appointmentId=${apt.id}`}>
                            <Button size="sm" variant="outline">
                              Start Chart
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-10 text-center">
                <Calendar className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No appointments for this day</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Unsigned Notes Workqueue */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  Unsigned Notes
                  {unsignedData && (unsignedData.overdue ?? 0) > 0 && (
                    <Badge variant="destructive" className="ml-2">
                      {unsignedData.overdue} overdue
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>Charts awaiting signature</CardDescription>
              </div>
              {selectedNotes.length > 0 && (
                <AlertDialog open={showBatchSign} onOpenChange={setShowBatchSign}>
                  <AlertDialogTrigger asChild>
                    <Button>
                      <PenTool className="h-4 w-4 mr-2" />
                      Sign {selectedNotes.length} Notes
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Batch Sign Notes</AlertDialogTitle>
                      <AlertDialogDescription>
                        You are about to sign {selectedNotes.length} note(s). This action cannot be
                        undone. The notes will be locked and marked as electronically signed by you.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleBatchSign}
                        disabled={batchSignMutation.isPending}
                      >
                        {batchSignMutation.isPending && (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        )}
                        Sign Notes
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loadingUnsigned ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : unsignedData?.notes && unsignedData.notes.length > 0 ? (
              <div className="space-y-1">
                {/* Select all */}
                <div className="flex items-center gap-2 pb-2 border-b mb-2">
                  <Checkbox
                    id="select-all"
                    checked={selectedNotes.length === unsignedData.notes.length}
                    onCheckedChange={handleSelectAll}
                  />
                  <label htmlFor="select-all" className="text-sm text-gray-500">
                    Select all
                  </label>
                </div>
                {unsignedData.notes.map((note) => (
                  <div
                    key={note.id}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border transition-colors',
                      note.isOverdue && 'border-red-200 bg-red-50',
                      selectedNotes.includes(note.id) && 'bg-[#053e67]/5 border-[#053e67]/20'
                    )}
                  >
                    <Checkbox
                      checked={selectedNotes.includes(note.id)}
                      onCheckedChange={(checked) => handleSelectNote(note.id, !!checked)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">
                          {note.patient?.demographics?.firstName}{' '}
                          {note.patient?.demographics?.lastName}
                        </p>
                        <Badge variant="outline" className="text-xs">
                          {encounterTypeLabels[note.encounterType] || note.encounterType}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-gray-500">
                        <span>{format(new Date(note.encounterDate), 'MMM d, yyyy')}</span>
                        <span
                          className={cn(
                            'flex items-center gap-1',
                            note.isOverdue && 'text-red-600 font-medium'
                          )}
                        >
                          {note.isOverdue && <AlertTriangle className="h-3 w-3" />}
                          {note.daysSinceVisit} day{note.daysSinceVisit !== 1 && 's'} ago
                        </span>
                        <Badge
                          variant="outline"
                          className={
                            note.completeness === 'partial'
                              ? 'text-yellow-600 border-yellow-200'
                              : 'text-gray-400'
                          }
                        >
                          {note.completeness === 'partial' ? 'Partial' : 'Empty'}
                        </Badge>
                      </div>
                    </div>
                    <Link href={`/patients/${note.patientId}/encounters/${note.id}`}>
                      <Button size="sm" variant="ghost">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-10 text-center">
                <CheckCircle2 className="h-10 w-10 text-green-400 mx-auto mb-3" />
                <p className="text-gray-500">All notes are signed!</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Encounter type breakdown */}
      {stats?.byType && stats.byType.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Charts by Type (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {stats.byType.map((item) => (
                <div
                  key={item.type}
                  className="text-center p-4 rounded-lg bg-gray-50"
                >
                  <p className="text-2xl font-bold text-gray-900">{item.count}</p>
                  <p className="text-sm text-gray-500">
                    {encounterTypeLabels[item.type] || item.type}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
