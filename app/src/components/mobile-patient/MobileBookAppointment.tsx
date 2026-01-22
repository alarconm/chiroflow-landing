'use client';

/**
 * Mobile Book Appointment Component (US-268)
 *
 * Multi-step appointment booking flow optimized for mobile.
 */

import React, { useState } from 'react';
import { format, addDays, startOfDay } from 'date-fns';
import {
  Calendar,
  Clock,
  User,
  ChevronLeft,
  ChevronRight,
  Check,
  CalendarPlus,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface AppointmentType {
  id: string;
  name: string;
  duration: number;
  description?: string;
  color?: string;
}

interface Provider {
  id: string;
  name: string;
  title?: string;
  specialty?: string;
  color?: string;
}

interface TimeSlot {
  providerId: string;
  providerName: string;
  startTime: string;
  endTime: string;
}

interface DaySlots {
  date: string;
  dayName: string;
  slotCount: number;
  slots: TimeSlot[];
}

interface BookingResult {
  success: boolean;
  appointment?: {
    id: string;
    startTime: string;
    endTime: string;
    appointmentType: string;
    provider: string;
  };
  calendarEvent?: {
    googleCalendarUrl: string;
    icsUrl: string;
  };
  message?: string;
}

interface MobileBookAppointmentProps {
  appointmentTypes: AppointmentType[];
  providers: Provider[];
  onLoadSlots: (
    startDate: Date,
    endDate: Date,
    providerId?: string,
    appointmentTypeId?: string
  ) => Promise<{ slots: DaySlots[]; totalAvailable: number }>;
  onBook: (data: {
    providerId: string;
    appointmentTypeId: string;
    startTime: Date;
    chiefComplaint?: string;
    patientNotes?: string;
  }) => Promise<BookingResult>;
  onCancel: () => void;
}

type BookingStep = 'type' | 'provider' | 'datetime' | 'details' | 'confirm';

export function MobileBookAppointment({
  appointmentTypes,
  providers,
  onLoadSlots,
  onBook,
  onCancel,
}: MobileBookAppointmentProps) {
  const [step, setStep] = useState<BookingStep>('type');
  const [selectedType, setSelectedType] = useState<AppointmentType | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ date: string; slot: TimeSlot } | null>(null);
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [patientNotes, setPatientNotes] = useState('');
  const [slots, setSlots] = useState<DaySlots[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  // Date range state for slot loading
  const [dateRange, setDateRange] = useState({
    start: startOfDay(new Date()),
    end: addDays(startOfDay(new Date()), 14),
  });

  const loadSlots = async () => {
    setIsLoadingSlots(true);
    setError(null);
    try {
      const result = await onLoadSlots(
        dateRange.start,
        dateRange.end,
        selectedProvider?.id,
        selectedType?.id
      );
      setSlots(result.slots);
      if (result.slots.length > 0 && !expandedDate) {
        setExpandedDate(result.slots[0].date);
      }
    } catch (err) {
      setError('Failed to load available times. Please try again.');
    } finally {
      setIsLoadingSlots(false);
    }
  };

  const handleTypeSelect = (type: AppointmentType) => {
    setSelectedType(type);
    setStep('provider');
  };

  const handleProviderSelect = async (provider: Provider | null) => {
    setSelectedProvider(provider);
    setStep('datetime');
    // Load slots when reaching datetime step
    setIsLoadingSlots(true);
    try {
      const result = await onLoadSlots(
        dateRange.start,
        dateRange.end,
        provider?.id,
        selectedType?.id
      );
      setSlots(result.slots);
      if (result.slots.length > 0) {
        setExpandedDate(result.slots[0].date);
      }
    } catch (err) {
      setError('Failed to load available times. Please try again.');
    } finally {
      setIsLoadingSlots(false);
    }
  };

  const handleSlotSelect = (date: string, slot: TimeSlot) => {
    setSelectedSlot({ date, slot });
    // If no specific provider was selected, set it now
    if (!selectedProvider) {
      const provider = providers.find((p) => p.id === slot.providerId);
      if (provider) {
        setSelectedProvider(provider);
      }
    }
    setStep('details');
  };

  const handleDetailsSubmit = () => {
    setStep('confirm');
  };

  const handleConfirmBooking = async () => {
    if (!selectedType || !selectedSlot) return;

    setIsBooking(true);
    setError(null);

    try {
      const result = await onBook({
        providerId: selectedSlot.slot.providerId,
        appointmentTypeId: selectedType.id,
        startTime: new Date(selectedSlot.slot.startTime),
        chiefComplaint: chiefComplaint || undefined,
        patientNotes: patientNotes || undefined,
      });

      setBookingResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to book appointment. Please try again.');
    } finally {
      setIsBooking(false);
    }
  };

  const handleBack = () => {
    switch (step) {
      case 'provider':
        setStep('type');
        break;
      case 'datetime':
        setStep('provider');
        break;
      case 'details':
        setStep('datetime');
        break;
      case 'confirm':
        setStep('details');
        break;
    }
  };

  const loadMoreDates = async () => {
    const newEnd = addDays(dateRange.end, 14);
    setDateRange({ ...dateRange, end: newEnd });

    setIsLoadingSlots(true);
    try {
      const result = await onLoadSlots(
        dateRange.start,
        newEnd,
        selectedProvider?.id,
        selectedType?.id
      );
      setSlots(result.slots);
    } catch (err) {
      setError('Failed to load more dates.');
    } finally {
      setIsLoadingSlots(false);
    }
  };

  // Success state
  if (bookingResult?.success) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-6 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Appointment Booked!</h2>
            <p className="text-gray-600 mb-4">
              Your {bookingResult.appointment?.appointmentType} appointment has been scheduled.
            </p>
            <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span className="font-medium">
                  {bookingResult.appointment?.startTime &&
                    format(new Date(bookingResult.appointment.startTime), 'EEEE, MMMM d, yyyy')}
                </span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <span>
                  {bookingResult.appointment?.startTime &&
                    format(new Date(bookingResult.appointment.startTime), 'h:mm a')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-400" />
                <span>{bookingResult.appointment?.provider}</span>
              </div>
            </div>

            {/* Add to Calendar buttons */}
            {bookingResult.calendarEvent && (
              <div className="space-y-2 mb-6">
                <a
                  href={bookingResult.calendarEvent.googleCalendarUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center w-full py-2 px-4 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  <CalendarPlus className="w-4 h-4 mr-2" />
                  Add to Google Calendar
                </a>
                <a
                  href={bookingResult.calendarEvent.icsUrl}
                  className="flex items-center justify-center w-full py-2 px-4 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  <CalendarPlus className="w-4 h-4 mr-2" />
                  Download Calendar Event
                </a>
              </div>
            )}

            <Button onClick={onCancel} className="w-full bg-[#053e67] hover:bg-[#042e4e]">
              Done
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          {step !== 'type' && (
            <Button variant="ghost" size="sm" onClick={handleBack} className="p-1">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          )}
          <h1 className="text-lg font-semibold text-gray-900 flex-1">
            {step === 'type' && 'Select Appointment Type'}
            {step === 'provider' && 'Select Provider'}
            {step === 'datetime' && 'Select Date & Time'}
            {step === 'details' && 'Appointment Details'}
            {step === 'confirm' && 'Confirm Booking'}
          </h1>
          <Button variant="ghost" size="sm" onClick={onCancel} className="text-gray-500">
            Cancel
          </Button>
        </div>

        {/* Progress indicator */}
        <div className="flex gap-1 mt-3">
          {['type', 'provider', 'datetime', 'details', 'confirm'].map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full ${
                ['type', 'provider', 'datetime', 'details', 'confirm'].indexOf(step) >= i
                  ? 'bg-[#053e67]'
                  : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive" className="mx-4 mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Step 1: Select Appointment Type */}
      {step === 'type' && (
        <div className="p-4 space-y-3">
          {appointmentTypes.map((type) => (
            <Card
              key={type.id}
              className={`cursor-pointer transition-all ${
                selectedType?.id === type.id
                  ? 'ring-2 ring-[#053e67] bg-blue-50'
                  : 'hover:bg-gray-50'
              }`}
              onClick={() => handleTypeSelect(type)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">{type.name}</h3>
                    {type.description && (
                      <p className="text-sm text-gray-500 mt-1">{type.description}</p>
                    )}
                    <div className="flex items-center gap-1 mt-2 text-sm text-gray-500">
                      <Clock className="w-3 h-3" />
                      <span>{type.duration} minutes</span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Step 2: Select Provider */}
      {step === 'provider' && (
        <div className="p-4 space-y-3">
          {/* No preference option */}
          <Card
            className={`cursor-pointer transition-all ${
              selectedProvider === null ? 'ring-2 ring-[#053e67] bg-blue-50' : 'hover:bg-gray-50'
            }`}
            onClick={() => handleProviderSelect(null)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">No Preference</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Show available times for all providers
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
            </CardContent>
          </Card>

          {providers.map((provider) => (
            <Card
              key={provider.id}
              className={`cursor-pointer transition-all ${
                selectedProvider?.id === provider.id
                  ? 'ring-2 ring-[#053e67] bg-blue-50'
                  : 'hover:bg-gray-50'
              }`}
              onClick={() => handleProviderSelect(provider)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium"
                      style={{ backgroundColor: provider.color || '#053e67' }}
                    >
                      {provider.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">{provider.name}</h3>
                      {provider.specialty && (
                        <p className="text-sm text-gray-500">{provider.specialty}</p>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Step 3: Select Date & Time */}
      {step === 'datetime' && (
        <div className="p-4">
          {isLoadingSlots ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#053e67]" />
            </div>
          ) : slots.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center">
                <Calendar className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Available Times</h3>
                <p className="text-gray-500 text-sm mb-4">
                  There are no available appointments in this date range.
                </p>
                <Button onClick={loadMoreDates} variant="outline">
                  Check More Dates
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {slots.map((day) => (
                <Card key={day.date}>
                  <CardHeader
                    className="py-3 px-4 cursor-pointer"
                    onClick={() => setExpandedDate(expandedDate === day.date ? null : day.date)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">{day.dayName}</CardTitle>
                        <p className="text-sm text-gray-500">
                          {format(new Date(day.date), 'MMMM d, yyyy')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{day.slotCount} available</Badge>
                        <ChevronRight
                          className={`w-5 h-5 text-gray-400 transition-transform ${
                            expandedDate === day.date ? 'rotate-90' : ''
                          }`}
                        />
                      </div>
                    </div>
                  </CardHeader>

                  {expandedDate === day.date && (
                    <CardContent className="pt-0 px-4 pb-4">
                      <ScrollArea className="max-h-[300px]">
                        <div className="grid grid-cols-3 gap-2">
                          {day.slots.map((slot, idx) => (
                            <Button
                              key={idx}
                              variant="outline"
                              size="sm"
                              className={`${
                                selectedSlot?.slot.startTime === slot.startTime
                                  ? 'bg-[#053e67] text-white hover:bg-[#042e4e]'
                                  : ''
                              }`}
                              onClick={() => handleSlotSelect(day.date, slot)}
                            >
                              {format(new Date(slot.startTime), 'h:mm a')}
                            </Button>
                          ))}
                        </div>
                        {!selectedProvider && day.slots.length > 0 && (
                          <p className="text-xs text-gray-500 mt-3">
                            * Different providers may be available at each time
                          </p>
                        )}
                      </ScrollArea>
                    </CardContent>
                  )}
                </Card>
              ))}

              <Button onClick={loadMoreDates} variant="outline" className="w-full">
                Load More Dates
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Step 4: Appointment Details */}
      {step === 'details' && (
        <div className="p-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Selected Appointment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span>
                  {selectedSlot &&
                    format(new Date(selectedSlot.slot.startTime), 'EEEE, MMMM d, yyyy')}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-gray-400" />
                <span>
                  {selectedSlot && format(new Date(selectedSlot.slot.startTime), 'h:mm a')}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <User className="w-4 h-4 text-gray-400" />
                <span>{selectedSlot?.slot.providerName}</span>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason for visit
              </label>
              <Textarea
                placeholder="Briefly describe why you're coming in..."
                value={chiefComplaint}
                onChange={(e) => setChiefComplaint(e.target.value)}
                className="min-h-[80px]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Additional notes (optional)
              </label>
              <Textarea
                placeholder="Any other information you'd like us to know..."
                value={patientNotes}
                onChange={(e) => setPatientNotes(e.target.value)}
                className="min-h-[60px]"
              />
            </div>
          </div>

          <Button
            className="w-full bg-[#053e67] hover:bg-[#042e4e]"
            onClick={handleDetailsSubmit}
          >
            Continue
          </Button>
        </div>
      )}

      {/* Step 5: Confirm Booking */}
      {step === 'confirm' && (
        <div className="p-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Confirm Your Appointment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Appointment Type</span>
                  <span className="font-medium">{selectedType?.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Provider</span>
                  <span className="font-medium">{selectedSlot?.slot.providerName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Date</span>
                  <span className="font-medium">
                    {selectedSlot &&
                      format(new Date(selectedSlot.slot.startTime), 'EEEE, MMMM d, yyyy')}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Time</span>
                  <span className="font-medium">
                    {selectedSlot && format(new Date(selectedSlot.slot.startTime), 'h:mm a')}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Duration</span>
                  <span className="font-medium">{selectedType?.duration} minutes</span>
                </div>
                {chiefComplaint && (
                  <div className="pt-2 border-t">
                    <span className="text-sm text-gray-500 block mb-1">Reason for visit</span>
                    <p className="text-sm">{chiefComplaint}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
            <p>
              By booking this appointment, you agree to our cancellation policy. Please cancel at
              least 24 hours in advance if you cannot make it.
            </p>
          </div>

          <Button
            className="w-full bg-[#053e67] hover:bg-[#042e4e]"
            onClick={handleConfirmBooking}
            disabled={isBooking}
          >
            {isBooking ? 'Booking...' : 'Confirm Booking'}
          </Button>
        </div>
      )}
    </div>
  );
}
