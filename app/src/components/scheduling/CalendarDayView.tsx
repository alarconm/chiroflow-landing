'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { format, addMinutes, startOfDay, differenceInMinutes, isSameDay } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Clock,
  MapPin,
  User,
  MoreHorizontal,
  Check,
  X,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { AppointmentStatus } from '@prisma/client';

// Types
export type CalendarAppointment = {
  id: string;
  startTime: Date;
  endTime: Date;
  status: AppointmentStatus;
  chiefComplaint?: string | null;
  notes?: string | null;
  patient: {
    id: string;
    mrn: string;
    demographics?: {
      firstName: string;
      lastName: string;
      preferredName?: string | null;
      dateOfBirth?: Date | null;
    } | null;
  };
  provider: {
    id: string;
    color: string;
    user: {
      firstName: string;
      lastName: string;
    };
  };
  appointmentType: {
    id: string;
    name: string;
    color: string;
    duration: number;
  };
  room?: {
    id: string;
    name: string;
  } | null;
};

export type CalendarBlock = {
  id: string;
  title: string;
  blockType: string;
  startTime: Date;
  endTime: Date;
  providerId?: string | null;
};

export type CalendarProvider = {
  id: string;
  color: string;
  isActive: boolean;
  user: {
    id: string;
    firstName: string;
    lastName: string;
  };
};

interface CalendarDayViewProps {
  date: Date;
  providers: CalendarProvider[];
  selectedProviderIds: string[];
  appointments: CalendarAppointment[];
  blocks: CalendarBlock[];
  startHour?: number;
  endHour?: number;
  slotInterval?: number;
  onSlotClick?: (time: Date, providerId: string) => void;
  onAppointmentClick?: (appointment: CalendarAppointment) => void;
  onStatusChange?: (appointmentId: string, status: AppointmentStatus) => void;
}

const statusColors: Record<AppointmentStatus, { bg: string; text: string; border: string }> = {
  SCHEDULED: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  CONFIRMED: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  CHECKED_IN: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  IN_PROGRESS: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  COMPLETED: { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200' },
  CANCELLED: { bg: 'bg-red-50', text: 'text-red-400', border: 'border-red-200' },
  NO_SHOW: { bg: 'bg-red-50', text: 'text-red-400', border: 'border-red-200' },
  RESCHEDULED: { bg: 'bg-orange-50', text: 'text-orange-500', border: 'border-orange-200' },
};

const statusLabels: Record<AppointmentStatus, string> = {
  SCHEDULED: 'Scheduled',
  CONFIRMED: 'Confirmed',
  CHECKED_IN: 'Checked In',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No Show',
  RESCHEDULED: 'Rescheduled',
};

export function CalendarDayView({
  date,
  providers,
  selectedProviderIds,
  appointments,
  blocks,
  startHour = 7,
  endHour = 19,
  slotInterval = 15,
  onSlotClick,
  onAppointmentClick,
  onStatusChange,
}: CalendarDayViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Filter to selected providers
  const visibleProviders = useMemo(
    () => providers.filter((p) => selectedProviderIds.includes(p.id)),
    [providers, selectedProviderIds]
  );

  // Generate time slots
  const timeSlots = useMemo(() => {
    const slots: Date[] = [];
    const start = startOfDay(date);
    start.setHours(startHour, 0, 0, 0);
    const end = startOfDay(date);
    end.setHours(endHour, 0, 0, 0);

    let current = start;
    while (current < end) {
      slots.push(new Date(current));
      current = addMinutes(current, slotInterval);
    }
    return slots;
  }, [date, startHour, endHour, slotInterval]);

  // Calculate slot height in pixels
  const slotHeight = 48; // px per slot
  const pixelsPerMinute = slotHeight / slotInterval;

  // Get appointments for a provider
  const getProviderAppointments = (providerId: string) =>
    appointments.filter((a) => a.provider.id === providerId);

  // Get blocks for a provider (or org-wide)
  const getProviderBlocks = (providerId: string) =>
    blocks.filter((b) => b.providerId === providerId || b.providerId === null);

  // Calculate position and height for an appointment
  const getAppointmentStyle = (appointment: CalendarAppointment) => {
    const dayStart = startOfDay(date);
    dayStart.setHours(startHour, 0, 0, 0);

    const startOffset = differenceInMinutes(appointment.startTime, dayStart);
    const duration = differenceInMinutes(appointment.endTime, appointment.startTime);

    return {
      top: startOffset * pixelsPerMinute,
      height: Math.max(duration * pixelsPerMinute - 2, 20), // Min height, -2 for gap
    };
  };

  // Calculate position for blocks
  const getBlockStyle = (block: CalendarBlock) => {
    const dayStart = startOfDay(date);
    dayStart.setHours(startHour, 0, 0, 0);

    const startOffset = differenceInMinutes(block.startTime, dayStart);
    const duration = differenceInMinutes(block.endTime, block.startTime);

    return {
      top: startOffset * pixelsPerMinute,
      height: Math.max(duration * pixelsPerMinute - 2, 20),
    };
  };

  // Current time indicator position
  const currentTimePosition = useMemo(() => {
    if (!isSameDay(date, currentTime)) return null;

    const dayStart = startOfDay(date);
    dayStart.setHours(startHour, 0, 0, 0);
    const dayEnd = startOfDay(date);
    dayEnd.setHours(endHour, 0, 0, 0);

    if (currentTime < dayStart || currentTime > dayEnd) return null;

    const offset = differenceInMinutes(currentTime, dayStart);
    return offset * pixelsPerMinute;
  }, [date, currentTime, startHour, endHour, pixelsPerMinute]);

  const handleSlotClick = (time: Date, providerId: string) => {
    if (onSlotClick) {
      onSlotClick(time, providerId);
    }
  };

  const getPatientName = (patient: CalendarAppointment['patient']) => {
    const demo = patient.demographics;
    if (!demo) return patient.mrn;
    const name = demo.preferredName || demo.firstName;
    return `${demo.lastName}, ${name}`;
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full">
        {/* Provider headers */}
        <div className="flex border-b bg-muted/30 sticky top-0 z-10">
          {/* Time column header */}
          <div className="w-16 flex-shrink-0 border-r px-2 py-3">
            <Clock className="h-4 w-4 text-muted-foreground mx-auto" />
          </div>

          {/* Provider columns */}
          {visibleProviders.map((provider) => (
            <div
              key={provider.id}
              className="flex-1 min-w-[180px] border-r last:border-r-0 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: provider.color }}
                />
                <span className="font-medium text-sm truncate">
                  {provider.user.firstName} {provider.user.lastName}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Scrollable calendar grid */}
        <div ref={containerRef} className="flex-1 overflow-auto">
          <div className="flex relative">
            {/* Time column */}
            <div className="w-16 flex-shrink-0 border-r bg-muted/10">
              {timeSlots.map((time, idx) => (
                <div
                  key={idx}
                  className="border-b text-xs text-muted-foreground text-right pr-2 flex items-start justify-end"
                  style={{ height: slotHeight }}
                >
                  {time.getMinutes() === 0 && (
                    <span className="mt-[-6px]">{format(time, 'h:mm a')}</span>
                  )}
                </div>
              ))}
            </div>

            {/* Provider columns with appointments */}
            {visibleProviders.map((provider) => (
              <div key={provider.id} className="flex-1 min-w-[180px] border-r last:border-r-0 relative">
                {/* Time slot backgrounds */}
                {timeSlots.map((time, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'border-b hover:bg-accent/30 cursor-pointer transition-colors',
                      time.getMinutes() === 0 && 'border-t border-t-muted-foreground/20'
                    )}
                    style={{ height: slotHeight }}
                    onClick={() => handleSlotClick(time, provider.id)}
                  />
                ))}

                {/* Blocks overlay */}
                {getProviderBlocks(provider.id).map((block) => {
                  const style = getBlockStyle(block);
                  return (
                    <div
                      key={block.id}
                      className="absolute left-1 right-1 bg-gray-100 border border-gray-300 border-dashed rounded opacity-75 pointer-events-none flex items-center justify-center"
                      style={{ top: style.top, height: style.height }}
                    >
                      <span className="text-xs text-gray-500 font-medium truncate px-1">
                        {block.title}
                      </span>
                    </div>
                  );
                })}

                {/* Appointments overlay */}
                {getProviderAppointments(provider.id).map((appointment) => {
                  const style = getAppointmentStyle(appointment);
                  const colors = statusColors[appointment.status];
                  const isCancelled = ['CANCELLED', 'NO_SHOW', 'RESCHEDULED'].includes(
                    appointment.status
                  );

                  return (
                    <Tooltip key={appointment.id}>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            'absolute left-1 right-1 rounded border cursor-pointer transition-shadow hover:shadow-md overflow-hidden',
                            colors.bg,
                            colors.border,
                            isCancelled && 'opacity-50'
                          )}
                          style={{
                            top: style.top,
                            height: style.height,
                            borderLeftWidth: 3,
                            borderLeftColor: appointment.appointmentType.color,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onAppointmentClick?.(appointment);
                          }}
                        >
                          <div className="p-1 h-full flex flex-col">
                            <div className="flex items-start justify-between gap-1">
                              <span
                                className={cn(
                                  'font-medium text-xs truncate',
                                  colors.text,
                                  isCancelled && 'line-through'
                                )}
                              >
                                {getPatientName(appointment.patient)}
                              </span>
                              <DropdownMenu>
                                <DropdownMenuTrigger
                                  asChild
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-4 w-4 flex-shrink-0"
                                  >
                                    <MoreHorizontal className="h-3 w-3" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40">
                                  {appointment.status === 'SCHEDULED' && (
                                    <DropdownMenuItem
                                      onClick={() =>
                                        onStatusChange?.(appointment.id, 'CONFIRMED')
                                      }
                                    >
                                      <Check className="h-4 w-4 mr-2" />
                                      Confirm
                                    </DropdownMenuItem>
                                  )}
                                  {appointment.status === 'CONFIRMED' && (
                                    <DropdownMenuItem
                                      onClick={() =>
                                        onStatusChange?.(appointment.id, 'CHECKED_IN')
                                      }
                                    >
                                      <User className="h-4 w-4 mr-2" />
                                      Check In
                                    </DropdownMenuItem>
                                  )}
                                  {appointment.status === 'CHECKED_IN' && (
                                    <DropdownMenuItem
                                      onClick={() =>
                                        onStatusChange?.(appointment.id, 'IN_PROGRESS')
                                      }
                                    >
                                      <AlertCircle className="h-4 w-4 mr-2" />
                                      Start Visit
                                    </DropdownMenuItem>
                                  )}
                                  {appointment.status === 'IN_PROGRESS' && (
                                    <DropdownMenuItem
                                      onClick={() =>
                                        onStatusChange?.(appointment.id, 'COMPLETED')
                                      }
                                    >
                                      <Check className="h-4 w-4 mr-2" />
                                      Complete
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                  {!isCancelled && (
                                    <DropdownMenuItem
                                      className="text-red-600"
                                      onClick={() =>
                                        onStatusChange?.(appointment.id, 'CANCELLED')
                                      }
                                    >
                                      <X className="h-4 w-4 mr-2" />
                                      Cancel
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                            {style.height > 40 && (
                              <span className="text-[10px] text-muted-foreground truncate">
                                {appointment.appointmentType.name}
                              </span>
                            )}
                            {style.height > 60 && appointment.room && (
                              <span className="text-[10px] text-muted-foreground truncate flex items-center gap-0.5">
                                <MapPin className="h-2.5 w-2.5" />
                                {appointment.room.name}
                              </span>
                            )}
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <div className="space-y-1">
                          <div className="font-medium">
                            {getPatientName(appointment.patient)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(appointment.startTime, 'h:mm a')} -{' '}
                            {format(appointment.endTime, 'h:mm a')}
                          </div>
                          <div className="text-xs">{appointment.appointmentType.name}</div>
                          <Badge variant="outline" className={cn('text-xs', colors.text)}>
                            {statusLabels[appointment.status]}
                          </Badge>
                          {appointment.chiefComplaint && (
                            <div className="text-xs text-muted-foreground pt-1">
                              CC: {appointment.chiefComplaint}
                            </div>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}

                {/* Current time indicator */}
                {currentTimePosition !== null && (
                  <div
                    className="absolute left-0 right-0 border-t-2 border-red-500 pointer-events-none z-20"
                    style={{ top: currentTimePosition }}
                  >
                    <div className="absolute -left-1 -top-1.5 w-3 h-3 rounded-full bg-red-500" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
