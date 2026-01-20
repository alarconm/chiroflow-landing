'use client';

import { useState, useMemo } from 'react';
import { format, addDays, subDays, startOfWeek, endOfWeek, addWeeks, subWeeks, startOfMonth, endOfMonth } from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Plus,
  Settings,
  Users,
  LayoutGrid,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import {
  CalendarDayView,
  CalendarWeekView,
  CalendarMonthView,
  AppointmentDialog,
  type CalendarAppointment,
  type CalendarBlock,
  type CalendarProvider,
} from '@/components/scheduling';
import type { AppointmentStatus } from '@prisma/client';

type ViewMode = 'day' | 'week' | 'month';

export default function SchedulePage() {
  const [date, setDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [selectedProviderIds, setSelectedProviderIds] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSlotTime, setSelectedSlotTime] = useState<Date | undefined>();
  const [selectedSlotProvider, setSelectedSlotProvider] = useState<string | undefined>();
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | undefined>();

  // Get date range based on view mode
  const dateRange = useMemo(() => {
    if (viewMode === 'day') {
      return { start: date, end: date };
    } else if (viewMode === 'week') {
      return {
        start: startOfWeek(date, { weekStartsOn: 0 }),
        end: endOfWeek(date, { weekStartsOn: 0 }),
      };
    } else {
      // Month view - get the full calendar view range (including overflow days)
      const monthStart = startOfMonth(date);
      const monthEnd = endOfMonth(date);
      return {
        start: startOfWeek(monthStart, { weekStartsOn: 0 }),
        end: endOfWeek(monthEnd, { weekStartsOn: 0 }),
      };
    }
  }, [date, viewMode]);

  // Queries
  const { data: providers, isLoading: providersLoading } = trpc.scheduling.listProviders.useQuery({});

  const { data: appointments, isLoading: appointmentsLoading, refetch: refetchAppointments } = trpc.scheduling.listAppointments.useQuery({
    startDate: dateRange.start,
    endDate: addDays(dateRange.end, 1), // Include full end day
    providerIds: selectedProviderIds.length > 0 ? selectedProviderIds : undefined,
  });

  const { data: blocks } = trpc.scheduling.listScheduleBlocks.useQuery({
    startDate: dateRange.start,
    endDate: addDays(dateRange.end, 1),
    providerIds: selectedProviderIds.length > 0 ? selectedProviderIds : undefined,
  });

  // Initialize selected providers when data loads
  useMemo(() => {
    if (providers && selectedProviderIds.length === 0) {
      setSelectedProviderIds(providers.map((p) => p.id));
    }
  }, [providers, selectedProviderIds.length]);

  const utils = trpc.useUtils();

  const statusMutation = trpc.scheduling.updateAppointmentStatus.useMutation({
    onSuccess: () => {
      toast.success('Status updated');
      utils.scheduling.listAppointments.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Transform data for CalendarDayView
  const calendarProviders: CalendarProvider[] = useMemo(() => {
    if (!providers) return [];
    return providers.map((p) => ({
      id: p.id,
      color: p.color,
      isActive: p.isActive,
      user: {
        id: p.user.id,
        firstName: p.user.firstName,
        lastName: p.user.lastName,
      },
    }));
  }, [providers]);

  const calendarAppointments: CalendarAppointment[] = useMemo(() => {
    if (!appointments) return [];
    return appointments.map((a) => ({
      id: a.id,
      startTime: new Date(a.startTime),
      endTime: new Date(a.endTime),
      status: a.status as AppointmentStatus,
      chiefComplaint: a.chiefComplaint,
      notes: a.notes,
      patient: {
        id: a.patient.id,
        mrn: a.patient.mrn,
        demographics: a.patient.demographics ? {
          firstName: a.patient.demographics.firstName,
          lastName: a.patient.demographics.lastName,
          preferredName: a.patient.demographics.preferredName,
          dateOfBirth: a.patient.demographics.dateOfBirth ? new Date(a.patient.demographics.dateOfBirth) : null,
        } : null,
      },
      provider: {
        id: a.provider.id,
        color: a.provider.color,
        user: {
          firstName: a.provider.user.firstName,
          lastName: a.provider.user.lastName,
        },
      },
      appointmentType: {
        id: a.appointmentType.id,
        name: a.appointmentType.name,
        color: a.appointmentType.color,
        duration: a.appointmentType.duration,
      },
      room: a.room ? {
        id: a.room.id,
        name: a.room.name,
      } : null,
    }));
  }, [appointments]);

  const calendarBlocks: CalendarBlock[] = useMemo(() => {
    if (!blocks) return [];
    return blocks.map((b) => ({
      id: b.id,
      title: b.title,
      blockType: b.blockType,
      startTime: new Date(b.startTime),
      endTime: new Date(b.endTime),
      providerId: b.providerId,
    }));
  }, [blocks]);

  // Navigation handlers
  const goToToday = () => setDate(new Date());

  const goToPrevious = () => {
    if (viewMode === 'day') {
      setDate(subDays(date, 1));
    } else if (viewMode === 'week') {
      setDate(subWeeks(date, 1));
    } else {
      setDate(new Date(date.getFullYear(), date.getMonth() - 1, 1));
    }
  };

  const goToNext = () => {
    if (viewMode === 'day') {
      setDate(addDays(date, 1));
    } else if (viewMode === 'week') {
      setDate(addWeeks(date, 1));
    } else {
      setDate(new Date(date.getFullYear(), date.getMonth() + 1, 1));
    }
  };

  const handleSlotClick = (time: Date, providerId: string) => {
    setSelectedSlotTime(time);
    setSelectedSlotProvider(providerId);
    setEditingAppointmentId(undefined);
    setDialogOpen(true);
  };

  const handleAppointmentClick = (appointment: CalendarAppointment) => {
    setEditingAppointmentId(appointment.id);
    setSelectedSlotTime(undefined);
    setSelectedSlotProvider(undefined);
    setDialogOpen(true);
  };

  const handleStatusChange = (appointmentId: string, status: AppointmentStatus) => {
    statusMutation.mutate({ id: appointmentId, status });
  };

  const toggleProvider = (providerId: string) => {
    setSelectedProviderIds((current) =>
      current.includes(providerId)
        ? current.filter((id) => id !== providerId)
        : [...current, providerId]
    );
  };

  const selectAllProviders = () => {
    if (providers) {
      setSelectedProviderIds(providers.map((p) => p.id));
    }
  };

  const deselectAllProviders = () => {
    setSelectedProviderIds([]);
  };

  const formatDateHeader = () => {
    if (viewMode === 'day') {
      return format(date, 'EEEE, MMMM d, yyyy');
    } else if (viewMode === 'week') {
      const start = startOfWeek(date, { weekStartsOn: 0 });
      const end = endOfWeek(date, { weekStartsOn: 0 });
      return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`;
    } else {
      return format(date, 'MMMM yyyy');
    }
  };

  const isLoading = providersLoading || appointmentsLoading;

  return (
    <div className="flex flex-col h-full">
      {/* Appointment Dialog */}
      <AppointmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        selectedDate={selectedSlotTime || date}
        selectedTime={selectedSlotTime}
        selectedProviderId={selectedSlotProvider}
        appointmentId={editingAppointmentId}
        onSuccess={() => refetchAppointments()}
      />

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
          <p className="text-gray-500 mt-1">
            Manage appointments and provider calendars
          </p>
        </div>
        <Button
          onClick={() => {
            setSelectedSlotTime(undefined);
            setSelectedSlotProvider(undefined);
            setEditingAppointmentId(undefined);
            setDialogOpen(true);
          }}
          className="bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-600 hover:to-teal-600"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Appointment
        </Button>
      </div>

      {/* Toolbar */}
      <Card className="mb-4">
        <CardContent className="py-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Date Navigation */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={goToToday}>
                Today
              </Button>
              <div className="flex items-center">
                <Button variant="ghost" size="icon" onClick={goToPrevious}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={goToNext}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="min-w-[200px]">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {formatDateHeader()}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => d && setDate(d)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* View Toggles */}
            <div className="flex items-center gap-4">
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                <TabsList>
                  <TabsTrigger value="day">Day</TabsTrigger>
                  <TabsTrigger value="week">Week</TabsTrigger>
                  <TabsTrigger value="month">Month</TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Provider Filter */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Users className="h-4 w-4 mr-2" />
                    Providers ({selectedProviderIds.length}/{providers?.length || 0})
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5">
                    <div className="flex justify-between mb-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 text-xs"
                        onClick={selectAllProviders}
                      >
                        Select All
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 text-xs"
                        onClick={deselectAllProviders}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  {providers?.map((provider) => (
                    <DropdownMenuItem
                      key={provider.id}
                      onClick={(e) => {
                        e.preventDefault();
                        toggleProvider(provider.id);
                      }}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedProviderIds.includes(provider.id)}
                        onCheckedChange={() => toggleProvider(provider.id)}
                      />
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: provider.color }}
                      />
                      <span>
                        {provider.user.firstName} {provider.user.lastName}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Settings */}
              <Button variant="ghost" size="icon">
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calendar View */}
      <Card className="flex-1 overflow-hidden">
        <CardContent className="p-0 h-full">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
            </div>
          ) : viewMode === 'day' ? (
            <CalendarDayView
              date={date}
              providers={calendarProviders}
              selectedProviderIds={selectedProviderIds}
              appointments={calendarAppointments}
              blocks={calendarBlocks}
              onSlotClick={handleSlotClick}
              onAppointmentClick={handleAppointmentClick}
              onStatusChange={handleStatusChange}
            />
          ) : viewMode === 'week' ? (
            <CalendarWeekView
              date={date}
              providers={calendarProviders}
              selectedProviderIds={selectedProviderIds}
              appointments={calendarAppointments}
              blocks={calendarBlocks}
              onDayClick={(day) => {
                setDate(day);
                setViewMode('day');
              }}
              onAppointmentClick={handleAppointmentClick}
            />
          ) : (
            <CalendarMonthView
              date={date}
              providers={calendarProviders}
              selectedProviderIds={selectedProviderIds}
              appointments={calendarAppointments}
              blocks={calendarBlocks}
              onDayClick={(day) => {
                setDate(day);
                setViewMode('day');
              }}
              onAppointmentClick={handleAppointmentClick}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
