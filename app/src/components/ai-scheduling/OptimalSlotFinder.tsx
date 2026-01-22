'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { trpc } from '@/trpc/client';
import { format, addDays } from 'date-fns';
import {
  Sparkles,
  Calendar,
  User,
  Clock,
  Search,
  Star,
  Loader2,
} from 'lucide-react';
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
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import type { DateRange } from 'react-day-picker';

interface OptimalSlotFinderProps {
  patientId?: string;
  onSlotSelect?: (slot: {
    date: Date;
    time: string;
    providerId: string;
    providerName: string;
  }) => void;
}

export function OptimalSlotFinder({ patientId, onSlotSelect }: OptimalSlotFinderProps) {
  const [selectedPatientId, setSelectedPatientId] = useState(patientId || '');
  const [appointmentTypeId, setAppointmentTypeId] = useState('');
  const [duration, setDuration] = useState(30);
  const [urgency, setUrgency] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [dateRange, setDateRange] = useState<DateRange>({
    from: new Date(),
    to: addDays(new Date(), 14),
  });
  const [isSearching, setIsSearching] = useState(false);

  // Fetch patients for selection
  const { data: patients } = trpc.patient.list.useQuery({
    offset: 0,
    limit: 100,
  });

  // Fetch appointment types
  const { data: appointmentTypes } = trpc.scheduling.listAppointmentTypes.useQuery();

  // Find optimal slots
  const {
    data: slots,
    refetch,
    isFetching,
  } = trpc.aiScheduling.findOptimalSlots.useQuery(
    {
      patientId: selectedPatientId,
      appointmentTypeId,
      duration,
      dateRange: {
        start: dateRange.from || new Date(),
        end: dateRange.to || addDays(new Date(), 14),
      },
      urgency,
    },
    {
      enabled: false, // Manual trigger only
    }
  );

  const handleSearch = async () => {
    if (!selectedPatientId || !appointmentTypeId) return;
    setIsSearching(true);
    await refetch();
    setIsSearching(false);
  };

  const handleSlotSelect = (slot: typeof slots extends (infer T)[] | undefined ? T : never) => {
    if (slot && onSlotSelect) {
      onSlotSelect({
        date: new Date(slot.date),
        time: slot.time,
        providerId: slot.providerId,
        providerName: slot.providerName,
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-yellow-500" />
          Optimal Slot Finder
        </CardTitle>
        <CardDescription>
          AI-powered appointment scheduling recommendations
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Search Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="patient">Patient</Label>
              <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
                <SelectTrigger id="patient">
                  <SelectValue placeholder="Select patient" />
                </SelectTrigger>
                <SelectContent>
                  {patients?.patients.map((patient) => (
                    <SelectItem key={patient.id} value={patient.id}>
                      {patient.firstName} {patient.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="appointment-type">Appointment Type</Label>
              <Select value={appointmentTypeId} onValueChange={setAppointmentTypeId}>
                <SelectTrigger id="appointment-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {appointmentTypes?.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name} ({type.duration} min)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="urgency">Urgency</Label>
              <Select value={urgency} onValueChange={(v) => setUrgency(v as typeof urgency)}>
                <SelectTrigger id="urgency">
                  <SelectValue placeholder="Select urgency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Date Range</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !dateRange && 'text-muted-foreground'
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, 'MMM d')} -{' '}
                          {format(dateRange.to, 'MMM d')}
                        </>
                      ) : (
                        format(dateRange.from, 'MMM d, yyyy')
                      )
                    ) : (
                      <span>Pick dates</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={(range) => range && setDateRange(range)}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <Button
            onClick={handleSearch}
            disabled={!selectedPatientId || !appointmentTypeId || isSearching || isFetching}
            className="w-full md:w-auto"
          >
            {isSearching || isFetching ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Search className="h-4 w-4 mr-2" />
            )}
            Find Optimal Slots
          </Button>

          {/* Results */}
          {(isSearching || isFetching) && (
            <div className="space-y-3 mt-6">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
                  <Skeleton className="h-12 w-12 rounded" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
              ))}
            </div>
          )}

          {slots && slots.length > 0 && !isFetching && (
            <div className="space-y-3 mt-6">
              <h4 className="text-sm font-medium text-muted-foreground">
                Top {slots.length} recommended slots
              </h4>
              {slots.map((slot, idx) => (
                <div
                  key={`${slot.providerId}-${slot.date}-${slot.time}`}
                  className={cn(
                    'flex items-center gap-4 p-4 border rounded-lg cursor-pointer transition-colors',
                    idx === 0 ? 'border-yellow-300 bg-yellow-50' : 'hover:bg-muted/50'
                  )}
                  onClick={() => handleSlotSelect(slot)}
                >
                  <div
                    className={cn(
                      'h-12 w-12 rounded flex items-center justify-center',
                      idx === 0 ? 'bg-yellow-200' : 'bg-muted'
                    )}
                  >
                    {idx === 0 ? (
                      <Star className="h-6 w-6 text-yellow-600" />
                    ) : (
                      <span className="text-lg font-bold text-muted-foreground">
                        {idx + 1}
                      </span>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">
                        {format(new Date(slot.date), 'EEEE, MMM d, yyyy')}
                      </span>
                      <Clock className="h-4 w-4 text-muted-foreground ml-2" />
                      <span className="font-medium">{slot.time}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span>{slot.providerName}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="outline"
                      className={cn(
                        'border-0',
                        slot.score >= 80
                          ? 'bg-green-100 text-green-700'
                          : slot.score >= 60
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-gray-100 text-gray-700'
                      )}
                    >
                      Score: {slot.score}
                    </Badge>
                    {onSlotSelect && (
                      <Button
                        size="sm"
                        variant={idx === 0 ? 'default' : 'outline'}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSlotSelect(slot);
                        }}
                      >
                        Select
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {slots && slots.length === 0 && !isFetching && (
            <div className="text-center py-8 text-muted-foreground mt-6">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>No available slots found for the selected criteria.</p>
              <p className="text-sm">Try adjusting the date range or urgency level.</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
