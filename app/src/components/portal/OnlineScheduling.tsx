'use client';

/**
 * Epic 14: Patient Portal - Online Appointment Scheduling Component
 * US-095: Online appointment scheduling
 *
 * Features:
 * - Available appointment slots calendar view
 * - Filter by provider and appointment type
 * - Book appointment with confirmation
 * - Reschedule to new available slot
 */

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { trpc } from '@/trpc/client';
import {
  format,
  addDays,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  isSameDay,
  isToday,
  parseISO,
} from 'date-fns';
import {
  Calendar,
  Clock,
  User,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Filter,
  RefreshCw,
} from 'lucide-react';

interface TimeSlot {
  date: string;
  providerId: string;
  providerName: string;
  startTime: Date;
  endTime: Date;
}

interface OnlineSchedulingProps {
  rescheduleAppointmentId?: string;
  onScheduleComplete?: () => void;
}

export function OnlineScheduling({
  rescheduleAppointmentId,
  onScheduleComplete,
}: OnlineSchedulingProps = {}) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [selectedWeekStart, setSelectedWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [patientNotes, setPatientNotes] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [bookedAppointment, setBookedAppointment] = useState<{
    id: string;
    startTime: Date;
    endTime: Date;
    provider: { name: string };
    appointmentType?: { name: string };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setToken(localStorage.getItem('portalToken'));
  }, []);

  const utils = trpc.useUtils();

  // Get providers
  const { data: providers, isLoading: loadingProviders } = trpc.portal.getProviders.useQuery(
    { sessionToken: token! },
    { enabled: !!token }
  );

  // Get appointment types
  const { data: appointmentTypes, isLoading: loadingTypes } = trpc.portal.getAppointmentTypes.useQuery(
    { sessionToken: token! },
    { enabled: !!token }
  );

  // Get available slots
  const weekEnd = endOfWeek(selectedWeekStart, { weekStartsOn: 0 });
  const { data: slots, isLoading: loadingSlots, refetch: refetchSlots } = trpc.portal.getAvailableSlots.useQuery(
    {
      sessionToken: token!,
      startDate: selectedWeekStart,
      endDate: weekEnd,
      providerId: selectedProviderId || undefined,
      appointmentTypeId: selectedTypeId || undefined,
    },
    { enabled: !!token }
  );

  // Book appointment mutation
  const bookMutation = trpc.portal.bookAppointment.useMutation({
    onSuccess: (data) => {
      setBookedAppointment(data.appointment);
      setShowConfirmDialog(false);
      setShowSuccessDialog(true);
      utils.portal.listAppointments.invalidate();
      utils.portal.getDashboardSummary.invalidate();
    },
    onError: (err) => {
      setError(err.message);
      setShowConfirmDialog(false);
    },
  });

  // Reschedule mutation
  const rescheduleMutation = trpc.portal.rescheduleAppointment.useMutation({
    onSuccess: (data) => {
      setBookedAppointment(data.appointment);
      setShowConfirmDialog(false);
      setShowSuccessDialog(true);
      utils.portal.listAppointments.invalidate();
      utils.portal.getDashboardSummary.invalidate();
    },
    onError: (err) => {
      setError(err.message);
      setShowConfirmDialog(false);
    },
  });

  // Group slots by date and time
  const slotsByDate = useMemo(() => {
    if (!slots) return {};

    const grouped: Record<string, TimeSlot[]> = {};
    for (const slot of slots) {
      const dateKey = slot.date;
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(slot);
    }

    // Sort slots within each day by time
    for (const dateKey of Object.keys(grouped)) {
      grouped[dateKey].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    }

    return grouped;
  }, [slots]);

  // Generate days of the week
  const weekDays = useMemo(() => {
    const days = [];
    let currentDay = new Date(selectedWeekStart);
    for (let i = 0; i < 7; i++) {
      days.push(new Date(currentDay));
      currentDay = addDays(currentDay, 1);
    }
    return days;
  }, [selectedWeekStart]);

  const handlePreviousWeek = () => {
    setSelectedWeekStart(subWeeks(selectedWeekStart, 1));
  };

  const handleNextWeek = () => {
    setSelectedWeekStart(addWeeks(selectedWeekStart, 1));
  };

  const handleSlotClick = (slot: TimeSlot) => {
    setSelectedSlot(slot);
    setShowConfirmDialog(true);
  };

  const handleConfirmBooking = () => {
    if (!token || !selectedSlot || !selectedTypeId) return;

    const appointmentType = appointmentTypes?.find((t) => t.id === selectedTypeId);
    if (!appointmentType) return;

    if (rescheduleAppointmentId) {
      // Reschedule existing appointment
      rescheduleMutation.mutate({
        sessionToken: token,
        appointmentId: rescheduleAppointmentId,
        newStartTime: new Date(selectedSlot.startTime),
        newEndTime: new Date(selectedSlot.endTime),
        newProviderId: selectedSlot.providerId,
      });
    } else {
      // Book new appointment
      bookMutation.mutate({
        sessionToken: token,
        providerId: selectedSlot.providerId,
        appointmentTypeId: selectedTypeId,
        startTime: new Date(selectedSlot.startTime),
        endTime: new Date(selectedSlot.endTime),
        chiefComplaint: chiefComplaint || undefined,
        patientNotes: patientNotes || undefined,
      });
    }
  };

  const handleSuccessClose = () => {
    setShowSuccessDialog(false);
    setSelectedSlot(null);
    setChiefComplaint('');
    setPatientNotes('');

    if (onScheduleComplete) {
      onScheduleComplete();
    } else {
      router.push('/portal/appointments');
    }
  };

  if (!token) return null;

  const isLoading = loadingProviders || loadingTypes;
  const selectedTypeDuration = appointmentTypes?.find((t) => t.id === selectedTypeId)?.duration;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">
            {rescheduleAppointmentId ? 'Reschedule Appointment' : 'Schedule an Appointment'}
          </h1>
          <p className="text-stone-600">
            {rescheduleAppointmentId
              ? 'Select a new date and time for your appointment'
              : 'Select a date and time that works for you'}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => refetchSlots()}
          className="border-stone-200"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh Availability
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <Card className="border-stone-200">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-[#053e67]" />
            <CardTitle className="text-lg">Filter Options</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Appointment Type */}
            <div className="space-y-2">
              <Label htmlFor="appointmentType">Appointment Type *</Label>
              <Select value={selectedTypeId} onValueChange={setSelectedTypeId}>
                <SelectTrigger id="appointmentType" className="border-stone-200">
                  <SelectValue placeholder="Select appointment type" />
                </SelectTrigger>
                <SelectContent>
                  {appointmentTypes?.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      <div className="flex items-center gap-2">
                        <span>{type.name}</span>
                        <span className="text-sm text-stone-500">({type.duration} min)</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!selectedTypeId && (
                <p className="text-sm text-amber-600">Please select an appointment type to see available times</p>
              )}
            </div>

            {/* Provider */}
            <div className="space-y-2">
              <Label htmlFor="provider">Provider (optional)</Label>
              <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
                <SelectTrigger id="provider" className="border-stone-200">
                  <SelectValue placeholder="Any provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any provider</SelectItem>
                  {providers?.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.title ? `${provider.title} ` : ''}
                      {provider.firstName} {provider.lastName}
                      {provider.specialty && (
                        <span className="text-stone-500"> - {provider.specialty}</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calendar View */}
      <Card className="border-stone-200">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-[#053e67]" />
              <CardTitle className="text-lg">Available Times</CardTitle>
              {selectedTypeDuration && (
                <Badge variant="outline" className="bg-blue-50 text-[#053e67] border-blue-200">
                  {selectedTypeDuration} min appointments
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handlePreviousWeek} className="border-stone-200">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[200px] text-center">
                {format(selectedWeekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
              </span>
              <Button variant="outline" size="sm" onClick={handleNextWeek} className="border-stone-200">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!selectedTypeId ? (
            <div className="py-12 text-center">
              <Calendar className="h-12 w-12 mx-auto text-stone-300 mb-4" />
              <p className="text-stone-500">Select an appointment type to view available times</p>
            </div>
          ) : loadingSlots ? (
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-32 w-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
              {weekDays.map((day) => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const daySlots = slotsByDate[dateKey] || [];
                const isPast = day < new Date() && !isToday(day);

                return (
                  <div key={dateKey} className="border border-stone-200 rounded-lg overflow-hidden">
                    {/* Day Header */}
                    <div
                      className={`p-2 text-center border-b ${
                        isToday(day)
                          ? 'bg-[#053e67] text-white'
                          : isPast
                          ? 'bg-stone-100 text-stone-400'
                          : 'bg-stone-50 text-stone-700'
                      }`}
                    >
                      <div className="text-xs font-medium uppercase">
                        {format(day, 'EEE')}
                      </div>
                      <div className="text-lg font-bold">{format(day, 'd')}</div>
                    </div>

                    {/* Time Slots */}
                    <div className="p-1 max-h-[300px] overflow-y-auto">
                      {isPast ? (
                        <p className="text-xs text-stone-400 text-center py-4">Past</p>
                      ) : daySlots.length === 0 ? (
                        <p className="text-xs text-stone-400 text-center py-4">No times</p>
                      ) : (
                        <div className="space-y-1">
                          {daySlots.map((slot, index) => (
                            <button
                              key={`${slot.providerId}-${index}`}
                              onClick={() => handleSlotClick(slot)}
                              className={`w-full text-xs p-2 rounded text-left transition-colors ${
                                selectedSlot === slot
                                  ? 'bg-[#053e67] text-white'
                                  : 'bg-green-50 text-green-700 hover:bg-green-100'
                              }`}
                            >
                              <div className="font-medium">
                                {format(new Date(slot.startTime), 'h:mm a')}
                              </div>
                              {!selectedProviderId && (
                                <div className="truncate opacity-75 text-[10px]">
                                  {slot.providerName.split(' ').slice(-1)[0]}
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {selectedTypeId && !loadingSlots && slots?.length === 0 && (
            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-center">
              <p className="text-amber-700">
                No available appointments this week. Try selecting a different week or adjusting your filters.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Booking Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {rescheduleAppointmentId ? 'Confirm Reschedule' : 'Confirm Appointment'}
            </DialogTitle>
            <DialogDescription>
              Please review and confirm your appointment details.
            </DialogDescription>
          </DialogHeader>

          {selectedSlot && (
            <div className="space-y-4">
              <div className="p-4 bg-stone-50 rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-[#053e67]" />
                  <span className="font-medium">
                    {format(new Date(selectedSlot.startTime), 'EEEE, MMMM d, yyyy')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[#053e67]" />
                  <span>
                    {format(new Date(selectedSlot.startTime), 'h:mm a')} -{' '}
                    {format(new Date(selectedSlot.endTime), 'h:mm a')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-[#053e67]" />
                  <span>{selectedSlot.providerName}</span>
                </div>
                {selectedTypeId && appointmentTypes && (
                  <Badge className="bg-blue-50 text-[#053e67] border-blue-200">
                    {appointmentTypes.find((t) => t.id === selectedTypeId)?.name}
                  </Badge>
                )}
              </div>

              {!rescheduleAppointmentId && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="reason">Reason for Visit</Label>
                    <Input
                      id="reason"
                      value={chiefComplaint}
                      onChange={(e) => setChiefComplaint(e.target.value)}
                      placeholder="e.g., Back pain, Follow-up"
                      className="border-stone-200"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">Additional Notes (optional)</Label>
                    <Textarea
                      id="notes"
                      value={patientNotes}
                      onChange={(e) => setPatientNotes(e.target.value)}
                      placeholder="Any additional information..."
                      rows={3}
                      className="border-stone-200"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
              className="border-stone-200"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmBooking}
              disabled={bookMutation.isPending || rescheduleMutation.isPending}
              className="bg-[#053e67] hover:bg-[#042d4d] text-white"
            >
              {(bookMutation.isPending || rescheduleMutation.isPending)
                ? 'Confirming...'
                : rescheduleAppointmentId
                ? 'Confirm Reschedule'
                : 'Confirm Appointment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-4">
              <CheckCircle className="h-16 w-16 text-green-500" />
            </div>
            <DialogTitle className="text-center">
              {rescheduleAppointmentId ? 'Appointment Rescheduled!' : 'Appointment Booked!'}
            </DialogTitle>
            <DialogDescription className="text-center">
              {rescheduleAppointmentId
                ? 'Your appointment has been successfully rescheduled.'
                : 'Your appointment has been successfully scheduled.'}
            </DialogDescription>
          </DialogHeader>

          {bookedAppointment && (
            <div className="p-4 bg-green-50 rounded-lg space-y-2 border border-green-200">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-green-700" />
                <span className="font-medium text-green-800">
                  {format(new Date(bookedAppointment.startTime), 'EEEE, MMMM d, yyyy')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-green-700" />
                <span className="text-green-800">
                  {format(new Date(bookedAppointment.startTime), 'h:mm a')} -{' '}
                  {format(new Date(bookedAppointment.endTime), 'h:mm a')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-green-700" />
                <span className="text-green-800">{bookedAppointment.provider.name}</span>
              </div>
            </div>
          )}

          <p className="text-sm text-stone-500 text-center">
            A confirmation email will be sent to you shortly.
          </p>

          <DialogFooter>
            <Button onClick={handleSuccessClose} className="w-full bg-[#053e67] hover:bg-[#042d4d] text-white">
              View My Appointments
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
