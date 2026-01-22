'use client';

import { useState, useCallback } from 'react';
import { format, parseISO, differenceInMinutes } from 'date-fns';
import {
  ChevronRight,
  Clock,
  User,
  Phone,
  MapPin,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Video,
  Calendar,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';

interface MobileTodayScheduleProps {
  onAppointmentClick?: (appointmentId: string) => void;
  onPatientClick?: (patientId: string, appointmentId: string) => void;
}

type AppointmentStatus =
  | 'SCHEDULED'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW'
  | 'RESCHEDULED';

const statusConfig: Record<
  AppointmentStatus,
  { label: string; color: string; bgColor: string }
> = {
  SCHEDULED: { label: 'Scheduled', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  CONFIRMED: { label: 'Confirmed', color: 'text-green-700', bgColor: 'bg-green-100' },
  CHECKED_IN: { label: 'Checked In', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  IN_PROGRESS: { label: 'In Progress', color: 'text-purple-700', bgColor: 'bg-purple-100' },
  COMPLETED: { label: 'Completed', color: 'text-stone-600', bgColor: 'bg-stone-100' },
  CANCELLED: { label: 'Cancelled', color: 'text-red-700', bgColor: 'bg-red-100' },
  NO_SHOW: { label: 'No Show', color: 'text-red-700', bgColor: 'bg-red-100' },
  RESCHEDULED: { label: 'Rescheduled', color: 'text-orange-700', bgColor: 'bg-orange-100' },
};

export function MobileTodaySchedule({
  onAppointmentClick,
  onPatientClick,
}: MobileTodayScheduleProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const utils = trpc.useUtils();

  const { data, isLoading, error, refetch } = trpc.mobileSchedule.getTodaySchedule.useQuery(
    undefined,
    {
      refetchOnWindowFocus: true,
      staleTime: 30000, // 30 seconds
    }
  );

  const checkInMutation = trpc.mobileSchedule.quickCheckIn.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.patientName} checked in`);
      utils.mobileSchedule.getTodaySchedule.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const statusMutation = trpc.mobileSchedule.updateStatus.useMutation({
    onSuccess: (result) => {
      toast.success(`Status updated to ${result.status}`);
      utils.mobileSchedule.getTodaySchedule.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      toast.success('Schedule refreshed');
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);

  const handleQuickCheckIn = (appointmentId: string) => {
    checkInMutation.mutate({ appointmentId });
  };

  const handleStatusChange = (appointmentId: string, status: AppointmentStatus) => {
    statusMutation.mutate({ appointmentId, status });
  };

  if (isLoading) {
    return <MobileTodayScheduleSkeleton />;
  }

  if (error) {
    return (
      <Card className="m-4">
        <CardContent className="py-8 text-center">
          <XCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
          <p className="text-stone-600 mb-4">Failed to load schedule</p>
          <Button onClick={() => refetch()} variant="outline">
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  const { stats, appointments, nextAppointment, currentAppointment, date, providerName } = data;

  return (
    <div className="flex flex-col h-full bg-stone-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#053e67] text-white px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Today's Schedule</h1>
            <p className="text-sm text-white/80">
              {format(parseISO(date + 'T00:00:00'), 'EEEE, MMMM d')}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="text-white hover:bg-white/10"
          >
            <RefreshCw className={cn('h-5 w-5', isRefreshing && 'animate-spin')} />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        {/* Stats Summary */}
        <div className="px-4 py-3">
          <div className="grid grid-cols-4 gap-2">
            <StatBadge label="Total" value={stats.total} color="bg-stone-100" />
            <StatBadge label="Done" value={stats.completed} color="bg-green-100" />
            <StatBadge label="Waiting" value={stats.checkedIn} color="bg-amber-100" />
            <StatBadge label="Next" value={stats.scheduled + stats.confirmed} color="bg-blue-100" />
          </div>
        </div>

        {/* Current/Next Appointment Highlight */}
        {(currentAppointment || nextAppointment) && (
          <div className="px-4 pb-3">
            {currentAppointment && (
              <Card className="border-l-4 border-l-purple-500 bg-purple-50">
                <CardContent className="py-3">
                  <div className="flex items-center gap-2 text-sm text-purple-700 mb-1">
                    <Clock className="h-4 w-4" />
                    <span className="font-medium">Current Patient</span>
                  </div>
                  <p className="font-semibold">{currentAppointment.patientName}</p>
                  <p className="text-sm text-purple-600">
                    {format(parseISO(currentAppointment.startTime), 'h:mm a')}
                  </p>
                </CardContent>
              </Card>
            )}
            {!currentAppointment && nextAppointment && (
              <Card className="border-l-4 border-l-blue-500 bg-blue-50">
                <CardContent className="py-3">
                  <div className="flex items-center gap-2 text-sm text-blue-700 mb-1">
                    <Calendar className="h-4 w-4" />
                    <span className="font-medium">Next Up</span>
                  </div>
                  <p className="font-semibold">{nextAppointment.patientName}</p>
                  <p className="text-sm text-blue-600">
                    {format(parseISO(nextAppointment.startTime), 'h:mm a')}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Appointment List */}
        <div className="px-4 pb-4">
          {appointments.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Calendar className="h-12 w-12 mx-auto text-stone-400 mb-4" />
                <p className="text-stone-600">No appointments today</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {appointments.map((apt) => (
                <AppointmentCard
                  key={apt.id}
                  appointment={apt}
                  onCheckIn={() => handleQuickCheckIn(apt.id)}
                  onStatusChange={(status) => handleStatusChange(apt.id, status)}
                  onClick={() => onAppointmentClick?.(apt.id)}
                  onPatientClick={() => onPatientClick?.(apt.patient.id, apt.id)}
                  isCheckingIn={checkInMutation.isPending}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

interface StatBadgeProps {
  label: string;
  value: number;
  color: string;
}

function StatBadge({ label, value, color }: StatBadgeProps) {
  return (
    <div className={cn('rounded-lg px-2 py-2 text-center', color)}>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs text-stone-600">{label}</p>
    </div>
  );
}

interface AppointmentCardProps {
  appointment: {
    id: string;
    startTime: string;
    endTime: string;
    status: string;
    chiefComplaint: string | null;
    notes: string | null;
    isTelehealth: boolean;
    patient: {
      id: string;
      mrn: string;
      name: string;
      firstName: string;
      lastName: string;
      preferredName: string | null | undefined;
      dateOfBirth: string | undefined;
      phone: string | null | undefined;
      email: string | null | undefined;
    };
    appointmentType: {
      id: string;
      name: string;
      color: string;
      duration: number;
    };
    room: {
      id: string;
      name: string;
    } | null;
  };
  onCheckIn: () => void;
  onStatusChange: (status: AppointmentStatus) => void;
  onClick?: () => void;
  onPatientClick?: () => void;
  isCheckingIn: boolean;
}

function AppointmentCard({
  appointment,
  onCheckIn,
  onStatusChange,
  onClick,
  onPatientClick,
  isCheckingIn,
}: AppointmentCardProps) {
  const status = appointment.status as AppointmentStatus;
  const config = statusConfig[status] || statusConfig.SCHEDULED;
  const startTime = parseISO(appointment.startTime);
  const endTime = parseISO(appointment.endTime);
  const duration = differenceInMinutes(endTime, startTime);

  const initials = `${appointment.patient.firstName?.[0] || ''}${
    appointment.patient.lastName?.[0] || ''
  }`.toUpperCase();

  const isPast = endTime < new Date();
  const canCheckIn = ['SCHEDULED', 'CONFIRMED'].includes(status);

  return (
    <Card
      className={cn(
        'overflow-hidden transition-colors',
        isPast && status !== 'COMPLETED' && 'opacity-60',
        status === 'IN_PROGRESS' && 'ring-2 ring-purple-500'
      )}
    >
      <CardContent className="p-0">
        {/* Time bar */}
        <div
          className="h-1"
          style={{ backgroundColor: appointment.appointmentType.color }}
        />

        <div className="p-3">
          {/* Header: Time + Status */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">
                {format(startTime, 'h:mm a')}
              </span>
              <span className="text-sm text-stone-500">({duration} min)</span>
              {appointment.isTelehealth && (
                <Badge variant="outline" className="text-xs">
                  <Video className="h-3 w-3 mr-1" />
                  Telehealth
                </Badge>
              )}
            </div>
            <Badge className={cn('text-xs', config.bgColor, config.color)}>
              {config.label}
            </Badge>
          </div>

          {/* Patient Info */}
          <div
            className="flex items-center gap-3 mb-3 cursor-pointer"
            onClick={onPatientClick}
          >
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-[#053e67] text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{appointment.patient.name}</p>
              <p className="text-sm text-stone-500 truncate">
                {appointment.appointmentType.name}
                {appointment.room && ` • ${appointment.room.name}`}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-stone-400" />
          </div>

          {/* Chief Complaint */}
          {appointment.chiefComplaint && (
            <p className="text-sm text-stone-600 mb-3 line-clamp-2">
              {appointment.chiefComplaint}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {canCheckIn && (
              <Button
                size="sm"
                className="flex-1 bg-[#053e67] hover:bg-[#053e67]/90"
                onClick={(e) => {
                  e.stopPropagation();
                  onCheckIn();
                }}
                disabled={isCheckingIn}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Check In
              </Button>
            )}
            {status === 'CHECKED_IN' && (
              <Button
                size="sm"
                className="flex-1 bg-purple-600 hover:bg-purple-700"
                onClick={(e) => {
                  e.stopPropagation();
                  onStatusChange('IN_PROGRESS');
                }}
              >
                Start Visit
              </Button>
            )}
            {status === 'IN_PROGRESS' && (
              <Button
                size="sm"
                className="flex-1 bg-green-600 hover:bg-green-700"
                onClick={(e) => {
                  e.stopPropagation();
                  onStatusChange('COMPLETED');
                }}
              >
                Complete
              </Button>
            )}
            {appointment.patient.phone && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  window.location.href = `tel:${appointment.patient.phone}`;
                }}
              >
                <Phone className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MobileTodayScheduleSkeleton() {
  return (
    <div className="flex flex-col h-full bg-stone-50">
      <div className="bg-[#053e67] px-4 py-3">
        <Skeleton className="h-6 w-40 bg-white/20" />
        <Skeleton className="h-4 w-32 mt-1 bg-white/20" />
      </div>
      <div className="px-4 py-3">
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </div>
      <div className="px-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-3">
              <Skeleton className="h-6 w-24 mb-2" />
              <div className="flex items-center gap-3 mb-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-5 w-32 mb-1" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
              <Skeleton className="h-9 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default MobileTodaySchedule;
