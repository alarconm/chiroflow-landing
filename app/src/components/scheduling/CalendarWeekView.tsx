'use client';

import { useMemo } from 'react';
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isToday,
  differenceInMinutes,
  startOfDay,
} from 'date-fns';
import { cn } from '@/lib/utils';
import type { CalendarAppointment, CalendarBlock, CalendarProvider } from './CalendarDayView';

interface CalendarWeekViewProps {
  date: Date;
  providers: CalendarProvider[];
  selectedProviderIds: string[];
  appointments: CalendarAppointment[];
  blocks: CalendarBlock[];
  startHour?: number;
  endHour?: number;
  onDayClick?: (date: Date) => void;
  onAppointmentClick?: (appointment: CalendarAppointment) => void;
}

const statusColors: Record<string, string> = {
  SCHEDULED: 'bg-blue-500',
  CONFIRMED: 'bg-green-500',
  CHECKED_IN: 'bg-blue-500',
  IN_PROGRESS: 'bg-purple-500',
  COMPLETED: 'bg-gray-400',
  CANCELLED: 'bg-red-300',
  NO_SHOW: 'bg-red-300',
  RESCHEDULED: 'bg-orange-400',
};

export function CalendarWeekView({
  date,
  providers,
  selectedProviderIds,
  appointments,
  blocks,
  startHour = 7,
  endHour = 19,
  onDayClick,
  onAppointmentClick,
}: CalendarWeekViewProps) {
  // Get week days
  const weekDays = useMemo(() => {
    const start = startOfWeek(date, { weekStartsOn: 0 });
    const end = endOfWeek(date, { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [date]);

  // Filter to selected providers
  const visibleProviders = useMemo(
    () => providers.filter((p) => selectedProviderIds.includes(p.id)),
    [providers, selectedProviderIds]
  );

  // Generate time slots (hourly for week view)
  const timeSlots = useMemo(() => {
    const slots: number[] = [];
    for (let hour = startHour; hour < endHour; hour++) {
      slots.push(hour);
    }
    return slots;
  }, [startHour, endHour]);

  // Get appointments for a specific day
  const getDayAppointments = (day: Date) =>
    appointments.filter((a) => isSameDay(new Date(a.startTime), day));

  // Get blocks for a specific day
  const getDayBlocks = (day: Date) =>
    blocks.filter((b) => isSameDay(new Date(b.startTime), day));

  // Calculate position for an appointment in the week view
  const getAppointmentStyle = (appointment: CalendarAppointment, day: Date) => {
    const dayStart = startOfDay(day);
    dayStart.setHours(startHour, 0, 0, 0);

    const startTime = new Date(appointment.startTime);
    const endTime = new Date(appointment.endTime);

    const startOffset = differenceInMinutes(startTime, dayStart);
    const duration = differenceInMinutes(endTime, startTime);

    const totalMinutes = (endHour - startHour) * 60;
    const topPercent = (startOffset / totalMinutes) * 100;
    const heightPercent = (duration / totalMinutes) * 100;

    return {
      top: `${Math.max(0, topPercent)}%`,
      height: `${Math.min(heightPercent, 100 - topPercent)}%`,
    };
  };

  const getPatientName = (patient: CalendarAppointment['patient']) => {
    const demo = patient.demographics;
    if (!demo) return patient.mrn;
    const name = demo.preferredName || demo.firstName;
    return `${demo.lastName}, ${name}`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Day headers */}
      <div className="flex border-b bg-muted/30 sticky top-0 z-10">
        {/* Time column header */}
        <div className="w-16 flex-shrink-0 border-r" />

        {/* Day columns */}
        {weekDays.map((day) => (
          <div
            key={day.toISOString()}
            className={cn(
              'flex-1 min-w-[100px] border-r last:border-r-0 px-2 py-2 text-center cursor-pointer hover:bg-muted/50 transition-colors',
              isToday(day) && 'bg-[#053e67]/5'
            )}
            onClick={() => onDayClick?.(day)}
          >
            <div className="text-xs text-muted-foreground">
              {format(day, 'EEE')}
            </div>
            <div
              className={cn(
                'text-lg font-medium',
                isToday(day) && 'text-[#053e67]'
              )}
            >
              {format(day, 'd')}
            </div>
          </div>
        ))}
      </div>

      {/* Scrollable grid */}
      <div className="flex-1 overflow-auto">
        <div className="flex relative">
          {/* Time column */}
          <div className="w-16 flex-shrink-0 border-r bg-muted/10">
            {timeSlots.map((hour) => (
              <div
                key={hour}
                className="h-16 border-b text-xs text-muted-foreground text-right pr-2 pt-1"
              >
                {format(new Date().setHours(hour, 0), 'h a')}
              </div>
            ))}
          </div>

          {/* Day columns with appointments */}
          {weekDays.map((day) => {
            const dayAppointments = getDayAppointments(day);
            const dayBlocks = getDayBlocks(day);

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  'flex-1 min-w-[100px] border-r last:border-r-0 relative',
                  isToday(day) && 'bg-[#053e67]/5/30'
                )}
                onClick={() => onDayClick?.(day)}
              >
                {/* Hour grid lines */}
                {timeSlots.map((hour) => (
                  <div
                    key={hour}
                    className="h-16 border-b hover:bg-accent/20 cursor-pointer transition-colors"
                  />
                ))}

                {/* Blocks */}
                {dayBlocks.map((block) => {
                  const style = getAppointmentStyle(
                    {
                      ...block,
                      status: 'SCHEDULED',
                      patient: { id: '', mrn: '', demographics: null },
                      provider: { id: '', color: '#ccc', user: { firstName: '', lastName: '' } },
                      appointmentType: { id: '', name: block.title, color: '#ccc', duration: 0 },
                      room: null,
                    } as CalendarAppointment,
                    day
                  );
                  return (
                    <div
                      key={block.id}
                      className="absolute left-0.5 right-0.5 bg-gray-200 border border-dashed border-gray-400 rounded text-[9px] text-gray-500 overflow-hidden opacity-60 pointer-events-none"
                      style={style}
                    >
                      <div className="p-0.5 truncate">{block.title}</div>
                    </div>
                  );
                })}

                {/* Appointments */}
                {dayAppointments.map((appointment) => {
                  const style = getAppointmentStyle(appointment, day);
                  const isCancelled = ['CANCELLED', 'NO_SHOW', 'RESCHEDULED'].includes(
                    appointment.status
                  );

                  return (
                    <div
                      key={appointment.id}
                      className={cn(
                        'absolute left-0.5 right-0.5 rounded text-[9px] text-white overflow-hidden cursor-pointer hover:opacity-90 transition-opacity',
                        statusColors[appointment.status],
                        isCancelled && 'opacity-50'
                      )}
                      style={{
                        ...style,
                        borderLeftWidth: 2,
                        borderLeftColor: appointment.appointmentType.color,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onAppointmentClick?.(appointment);
                      }}
                    >
                      <div className="p-0.5">
                        <div className="font-medium truncate">
                          {getPatientName(appointment.patient)}
                        </div>
                        <div className="truncate opacity-80">
                          {format(new Date(appointment.startTime), 'h:mm a')}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
