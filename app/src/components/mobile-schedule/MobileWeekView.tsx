'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  format,
  parseISO,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  addDays,
  isSameDay,
  isToday,
} from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Calendar as CalendarIcon,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';

interface MobileWeekViewProps {
  onDayClick?: (date: Date) => void;
  onAppointmentClick?: (appointmentId: string) => void;
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

const statusColors: Record<AppointmentStatus, string> = {
  SCHEDULED: 'bg-blue-500',
  CONFIRMED: 'bg-green-500',
  CHECKED_IN: 'bg-amber-500',
  IN_PROGRESS: 'bg-purple-500',
  COMPLETED: 'bg-stone-400',
  CANCELLED: 'bg-red-500',
  NO_SHOW: 'bg-red-500',
  RESCHEDULED: 'bg-orange-500',
};

export function MobileWeekView({ onDayClick, onAppointmentClick }: MobileWeekViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });

  const { data, isLoading, refetch } = trpc.mobileSchedule.getScheduleRange.useQuery(
    {
      startDate: weekStart.toISOString(),
      endDate: addDays(weekEnd, 1).toISOString(), // Include full end day
    },
    {
      refetchOnWindowFocus: true,
      staleTime: 30000,
    }
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      toast.success('Schedule refreshed');
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);

  const goToPreviousWeek = () => setCurrentDate(subWeeks(currentDate, 1));
  const goToNextWeek = () => setCurrentDate(addWeeks(currentDate, 1));
  const goToToday = () => setCurrentDate(new Date());

  // Generate week days
  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      days.push(addDays(weekStart, i));
    }
    return days;
  }, [weekStart]);

  // Group appointments by day
  const appointmentsByDay = useMemo(() => {
    if (!data?.appointments) return {};

    const grouped: Record<string, typeof data.appointments> = {};
    data.appointments.forEach((apt) => {
      const dayKey = format(parseISO(apt.startTime), 'yyyy-MM-dd');
      if (!grouped[dayKey]) {
        grouped[dayKey] = [];
      }
      grouped[dayKey].push(apt);
    });

    // Sort appointments within each day
    Object.keys(grouped).forEach((key) => {
      grouped[key].sort(
        (a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime()
      );
    });

    return grouped;
  }, [data?.appointments]);

  // Get blocks by day
  const blocksByDay = useMemo(() => {
    if (!data?.blocks) return {};

    const grouped: Record<string, typeof data.blocks> = {};
    data.blocks.forEach((block) => {
      const dayKey = format(parseISO(block.startTime), 'yyyy-MM-dd');
      if (!grouped[dayKey]) {
        grouped[dayKey] = [];
      }
      grouped[dayKey].push(block);
    });

    return grouped;
  }, [data?.blocks]);

  if (isLoading) {
    return <MobileWeekViewSkeleton />;
  }

  return (
    <div className="flex flex-col h-full bg-stone-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#053e67] text-white px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-lg font-semibold">Week View</h1>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={goToToday}
              className="text-white hover:bg-white/10 text-xs"
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="text-white hover:bg-white/10"
            >
              <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
            </Button>
          </div>
        </div>

        {/* Week Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={goToPreviousWeek}
            className="text-white hover:bg-white/10"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="text-white hover:bg-white/10">
                <CalendarIcon className="h-4 w-4 mr-2" />
                {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <Calendar
                mode="single"
                selected={currentDate}
                onSelect={(date) => date && setCurrentDate(date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="icon"
            onClick={goToNextWeek}
            className="text-white hover:bg-white/10"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Week Days */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          {weekDays.map((day) => {
            const dayKey = format(day, 'yyyy-MM-dd');
            const dayAppointments = appointmentsByDay[dayKey] || [];
            const dayBlocks = blocksByDay[dayKey] || [];
            const isCurrentDay = isToday(day);
            const activeCount = dayAppointments.filter(
              (a) => !['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(a.status)
            ).length;

            return (
              <Card
                key={dayKey}
                className={cn(
                  'overflow-hidden cursor-pointer transition-all',
                  isCurrentDay && 'ring-2 ring-[#053e67]'
                )}
                onClick={() => onDayClick?.(day)}
              >
                <CardContent className="p-0">
                  {/* Day Header */}
                  <div
                    className={cn(
                      'px-3 py-2 flex items-center justify-between',
                      isCurrentDay ? 'bg-[#053e67] text-white' : 'bg-stone-100'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{format(day, 'EEE')}</span>
                      <span
                        className={cn(
                          'text-lg font-bold',
                          isCurrentDay
                            ? 'bg-white text-[#053e67] rounded-full w-8 h-8 flex items-center justify-center'
                            : ''
                        )}
                      >
                        {format(day, 'd')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {dayBlocks.length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {dayBlocks.length} block{dayBlocks.length > 1 ? 's' : ''}
                        </Badge>
                      )}
                      <Badge
                        className={cn(
                          'text-xs',
                          activeCount > 0
                            ? isCurrentDay
                              ? 'bg-white text-[#053e67]'
                              : 'bg-[#053e67] text-white'
                            : 'bg-stone-300 text-stone-600'
                        )}
                      >
                        {dayAppointments.length} appt{dayAppointments.length !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                  </div>

                  {/* Appointments Preview */}
                  {dayAppointments.length > 0 && (
                    <div className="px-3 py-2 space-y-1">
                      {dayAppointments.slice(0, 3).map((apt) => (
                        <div
                          key={apt.id}
                          className="flex items-center gap-2 text-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAppointmentClick?.(apt.id);
                          }}
                        >
                          <div
                            className={cn(
                              'w-2 h-2 rounded-full',
                              statusColors[apt.status as AppointmentStatus] || 'bg-stone-400'
                            )}
                          />
                          <span className="text-stone-600">
                            {format(parseISO(apt.startTime), 'h:mm a')}
                          </span>
                          <span className="truncate flex-1">{apt.patient.name}</span>
                        </div>
                      ))}
                      {dayAppointments.length > 3 && (
                        <p className="text-xs text-stone-500 pl-4">
                          +{dayAppointments.length - 3} more
                        </p>
                      )}
                    </div>
                  )}

                  {dayAppointments.length === 0 && (
                    <div className="px-3 py-2 text-sm text-stone-400">
                      No appointments
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

function MobileWeekViewSkeleton() {
  return (
    <div className="flex flex-col h-full bg-stone-50">
      <div className="bg-[#053e67] px-4 py-3">
        <Skeleton className="h-6 w-32 bg-white/20" />
        <Skeleton className="h-5 w-48 mt-2 bg-white/20" />
      </div>
      <div className="p-4 space-y-2">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Card key={i}>
            <CardContent className="p-0">
              <Skeleton className="h-10 w-full" />
              <div className="px-3 py-2 space-y-1">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default MobileWeekView;
