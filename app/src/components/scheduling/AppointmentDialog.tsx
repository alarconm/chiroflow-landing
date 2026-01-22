'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Clock, User, MapPin, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';
import type { AppointmentStatus } from '@prisma/client';

interface AppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate?: Date;
  selectedTime?: Date;
  selectedProviderId?: string;
  appointmentId?: string;
  onSuccess?: () => void;
}

export function AppointmentDialog({
  open,
  onOpenChange,
  selectedDate,
  selectedTime,
  selectedProviderId,
  appointmentId,
  onSuccess,
}: AppointmentDialogProps) {
  const [date, setDate] = useState<Date | undefined>(selectedDate);
  const [time, setTime] = useState(selectedTime ? format(selectedTime, 'HH:mm') : '09:00');
  const [patientId, setPatientId] = useState('');
  const [patientName, setPatientName] = useState('');
  const [patientSearch, setPatientSearch] = useState('');
  const [providerId, setProviderId] = useState(selectedProviderId || '');
  const [appointmentTypeId, setAppointmentTypeId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [notes, setNotes] = useState('');
  const [duration, setDuration] = useState(30);

  // Queries
  const { data: providers } = trpc.scheduling.listProviders.useQuery({});
  const { data: appointmentTypes } = trpc.scheduling.listAppointmentTypes.useQuery({});
  const { data: rooms } = trpc.scheduling.listRooms.useQuery({});
  const { data: patientsData } = trpc.patient.list.useQuery(
    { search: patientSearch, limit: 10 },
    { enabled: patientSearch.length >= 2 }
  );
  const patients = patientsData?.patients;

  // Fetch existing appointment if editing
  const { data: existingAppointment } = trpc.scheduling.getAppointment.useQuery(
    { id: appointmentId! },
    { enabled: !!appointmentId }
  );

  // Update state when editing
  useEffect(() => {
    if (existingAppointment) {
      setDate(new Date(existingAppointment.startTime));
      setTime(format(new Date(existingAppointment.startTime), 'HH:mm'));
      setPatientId(existingAppointment.patientId);
      // Set patient name from demographics
      const demo = existingAppointment.patient.demographics;
      if (demo) {
        setPatientName(`${demo.lastName}, ${demo.firstName}`);
      } else {
        setPatientName(existingAppointment.patient.mrn);
      }
      setProviderId(existingAppointment.providerId);
      setAppointmentTypeId(existingAppointment.appointmentTypeId);
      setRoomId(existingAppointment.roomId || '');
      setChiefComplaint(existingAppointment.chiefComplaint || '');
      setNotes(existingAppointment.notes || '');
      const durationMinutes = Math.round(
        (new Date(existingAppointment.endTime).getTime() -
          new Date(existingAppointment.startTime).getTime()) /
          60000
      );
      setDuration(durationMinutes);
    }
  }, [existingAppointment]);

  // Update duration when appointment type changes
  useEffect(() => {
    if (appointmentTypeId && appointmentTypes) {
      const type = appointmentTypes.find((t) => t.id === appointmentTypeId);
      if (type) {
        setDuration(type.duration);
      }
    }
  }, [appointmentTypeId, appointmentTypes]);

  // Update when props change
  useEffect(() => {
    if (selectedDate) setDate(selectedDate);
    if (selectedTime) setTime(format(selectedTime, 'HH:mm'));
    if (selectedProviderId) setProviderId(selectedProviderId);
  }, [selectedDate, selectedTime, selectedProviderId]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open && !appointmentId) {
      setPatientId('');
      setPatientName('');
      setPatientSearch('');
      setChiefComplaint('');
      setNotes('');
    }
  }, [open, appointmentId]);

  const utils = trpc.useUtils();

  const createMutation = trpc.scheduling.createAppointment.useMutation({
    onSuccess: () => {
      toast.success('Appointment created');
      utils.scheduling.listAppointments.invalidate();
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = trpc.scheduling.updateAppointment.useMutation({
    onSuccess: () => {
      toast.success('Appointment updated');
      utils.scheduling.listAppointments.invalidate();
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!date || !time || !patientId || !providerId || !appointmentTypeId) {
      toast.error('Please fill in all required fields');
      return;
    }

    const [hours, minutes] = time.split(':').map(Number);
    const startTime = new Date(date);
    startTime.setHours(hours, minutes, 0, 0);

    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + duration);

    const data = {
      patientId,
      providerId,
      appointmentTypeId,
      startTime,
      endTime,
      roomId: roomId || undefined,
      chiefComplaint: chiefComplaint || undefined,
      notes: notes || undefined,
    };

    if (appointmentId) {
      updateMutation.mutate({ id: appointmentId, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  // Generate time slots
  const timeSlots = [];
  for (let hour = 7; hour < 19; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const h = hour.toString().padStart(2, '0');
      const m = minute.toString().padStart(2, '0');
      timeSlots.push(`${h}:${m}`);
    }
  }

  const formatTimeSlot = (slot: string) => {
    const [h, m] = slot.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {appointmentId ? 'Edit Appointment' : 'New Appointment'}
          </DialogTitle>
          <DialogDescription>
            {appointmentId
              ? 'Update appointment details below.'
              : 'Schedule a new appointment for a patient.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Patient Search */}
          <div className="space-y-2">
            <Label htmlFor="patient">Patient *</Label>
            {patientId ? (
              <div className="flex items-center justify-between p-2 border rounded-md bg-muted/30">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{patientName}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPatientId('');
                    setPatientName('');
                    setPatientSearch('');
                  }}
                >
                  Change
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  id="patient"
                  placeholder="Search by name or MRN..."
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                />
                {patients && patients.length > 0 && (
                  <div className="border rounded-md max-h-32 overflow-auto">
                    {patients.map((patient: { id: string; firstName: string; lastName: string; mrn: string }) => (
                      <button
                        key={patient.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 border-b last:border-0"
                        onClick={() => {
                          setPatientId(patient.id);
                          setPatientName(`${patient.lastName}, ${patient.firstName}`);
                          setPatientSearch('');
                        }}
                      >
                        <span className="font-medium">
                          {patient.lastName}, {patient.firstName}
                        </span>
                        <span className="text-muted-foreground ml-2">
                          ({patient.mrn})
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !date && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Time *</Label>
              <Select value={time} onValueChange={setTime}>
                <SelectTrigger>
                  <SelectValue>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      {formatTimeSlot(time)}
                    </div>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {timeSlots.map((slot) => (
                    <SelectItem key={slot} value={slot}>
                      {formatTimeSlot(slot)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Provider and Appointment Type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Provider *</Label>
              <Select value={providerId} onValueChange={setProviderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {providers?.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: provider.color }}
                        />
                        {provider.user.firstName} {provider.user.lastName}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Appointment Type *</Label>
              <Select value={appointmentTypeId} onValueChange={setAppointmentTypeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {appointmentTypes?.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: type.color }}
                        />
                        {type.name} ({type.duration} min)
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Room */}
          <div className="space-y-2">
            <Label>Room</Label>
            <Select value={roomId} onValueChange={setRoomId}>
              <SelectTrigger>
                <SelectValue placeholder="Select room (optional)">
                  {roomId ? (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {rooms?.find((r) => r.id === roomId)?.name}
                    </div>
                  ) : (
                    'Select room (optional)'
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No room</SelectItem>
                {rooms?.map((room) => (
                  <SelectItem key={room.id} value={room.id}>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      {room.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Chief Complaint */}
          <div className="space-y-2">
            <Label htmlFor="chiefComplaint">Chief Complaint</Label>
            <Input
              id="chiefComplaint"
              placeholder="Reason for visit..."
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Additional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-gradient-to-r from-[#053e67]/50 to-[#053e67] hover:from-[#053e67] hover:to-[#053e67]/90"
            >
              {isLoading
                ? 'Saving...'
                : appointmentId
                ? 'Update Appointment'
                : 'Create Appointment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
