'use client';

import { useMemo } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  isToday,
} from 'date-fns';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { CalendarAppointment, CalendarBlock, CalendarProvider } from './CalendarDayView';

interface CalendarMonthViewProps {
  date: Date;
  providers: CalendarProvider[];
  selectedProviderIds: string[];
  appointments: CalendarAppointment[];
  blocks: CalendarBlock[];
  onDayClick?: (date: Date) => void;
  onAppointmentClick?: (appointment: CalendarAppointment) => void;
}

const statusColors: Record<string, string> = {
  SCHEDULED: 'bg-blue-100 text-[#053e67]',
  CONFIRMED: 'bg-green-100 text-green-700',
  CHECKED_IN: 'bg-blue-100 text-[#053e67]',
  IN_PROGRESS: 'bg-purple-100 text-purple-700',
  COMPLETED: 'bg-gray-100 text-gray-500',
  CANCELLED: 'bg-red-100 text-red-400',
  NO_SHOW: 'bg-red-100 text-red-400',
  RESCHEDULED: 'bg-orange-100 text-orange-500',
};

export function CalendarMonthView({
  date,
  providers,
  selectedProviderIds,
  appointments,
  blocks,
  onDayClick,
  onAppointmentClick,
}: CalendarMonthViewProps) {
  // Get all days to display (including overflow from adjacent months)
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(date);
    const monthEnd = endOfMonth(date);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [date]);

  // Group days into weeks
  const weeks = useMemo(() => {
    const result: Date[][] = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      result.push(calendarDays.slice(i, i + 7));
    }
    return result;
  }, [calendarDays]);

  // Get appointments for a specific day
  const getDayAppointments = (day: Date) =>
    appointments.filter((a) => isSameDay(new Date(a.startTime), day));

  // Get appointment counts by status
  const getDayStats = (day: Date) => {
    const dayAppointments = getDayAppointments(day);
    const total = dayAppointments.length;
    const completed = dayAppointments.filter((a) => a.status === 'COMPLETED').length;
    const cancelled = dayAppointments.filter((a) =>
      ['CANCELLED', 'NO_SHOW', 'RESCHEDULED'].includes(a.status)
    ).length;
    const active = total - completed - cancelled;

    return { total, completed, cancelled, active };
  };

  const getPatientName = (patient: CalendarAppointment['patient']) => {
    const demo = patient.demographics;
    if (!demo) return patient.mrn;
    const name = demo.preferredName || demo.firstName;
    return `${demo.lastName}, ${name}`;
  };

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="flex flex-col h-full">
      {/* Day name headers */}
      <div className="grid grid-cols-7 border-b bg-muted/30">
        {dayNames.map((name) => (
          <div
            key={name}
            className="px-2 py-2 text-center text-sm font-medium text-muted-foreground border-r last:border-r-0"
          >
            {name}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto">
        <div className="grid grid-rows-[repeat(auto-fill,minmax(120px,1fr))]">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="grid grid-cols-7 border-b last:border-b-0">
              {week.map((day) => {
                const dayAppointments = getDayAppointments(day);
                const stats = getDayStats(day);
                const isCurrentMonth = isSameMonth(day, date);
                const isTodayDate = isToday(day);

                // Show max 3 appointments, then a "+N more" indicator
                const visibleAppointments = dayAppointments.slice(0, 3);
                const remainingCount = dayAppointments.length - 3;

                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'min-h-[120px] border-r last:border-r-0 p-1 cursor-pointer hover:bg-muted/30 transition-colors',
                      !isCurrentMonth && 'bg-muted/20',
                      isTodayDate && 'bg-[#053e67]/5'
                    )}
                    onClick={() => onDayClick?.(day)}
                  >
                    {/* Day header */}
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={cn(
                          'text-sm font-medium',
                          !isCurrentMonth && 'text-muted-foreground',
                          isTodayDate &&
                            'bg-[#053e67]/50 text-white rounded-full w-6 h-6 flex items-center justify-center'
                        )}
                      >
                        {format(day, 'd')}
                      </span>
                      {stats.total > 0 && (
                        <Badge
                          variant="secondary"
                          className={cn(
                            'text-[10px] px-1 py-0',
                            stats.active > 5 && 'bg-blue-100 text-[#053e67]',
                            stats.active > 10 && 'bg-red-100 text-red-700'
                          )}
                        >
                          {stats.total}
                        </Badge>
                      )}
                    </div>

                    {/* Appointments preview */}
                    <div className="space-y-0.5">
                      {visibleAppointments.map((appointment) => {
                        const isCancelled = ['CANCELLED', 'NO_SHOW', 'RESCHEDULED'].includes(
                          appointment.status
                        );

                        return (
                          <div
                            key={appointment.id}
                            className={cn(
                              'text-[10px] px-1 py-0.5 rounded truncate cursor-pointer hover:opacity-80',
                              statusColors[appointment.status],
                              isCancelled && 'opacity-50 line-through'
                            )}
                            style={{
                              borderLeftWidth: 2,
                              borderLeftColor: appointment.appointmentType.color,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onAppointmentClick?.(appointment);
                            }}
                            title={`${format(new Date(appointment.startTime), 'h:mm a')} - ${getPatientName(appointment.patient)}`}
                          >
                            <span className="font-medium">
                              {format(new Date(appointment.startTime), 'h:mm')}
                            </span>{' '}
                            {getPatientName(appointment.patient)}
                          </div>
                        );
                      })}
                      {remainingCount > 0 && (
                        <div
                          className="text-[10px] px-1 text-muted-foreground hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDayClick?.(day);
                          }}
                        >
                          +{remainingCount} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
