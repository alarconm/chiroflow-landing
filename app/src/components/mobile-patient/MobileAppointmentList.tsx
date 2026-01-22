'use client';

/**
 * Mobile Appointment List Component (US-268)
 *
 * Displays patient's upcoming appointments with quick actions
 * for mobile patient app.
 */

import React, { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Calendar,
  Clock,
  MapPin,
  Phone,
  User,
  ChevronRight,
  CheckCircle2,
  XCircle,
  CalendarPlus,
  Navigation,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';

interface Appointment {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  chiefComplaint?: string;
  patientNotes?: string;
  isTelehealth: boolean;
  hoursUntil: number;
  canCancel: boolean;
  canReschedule: boolean;
  canCheckIn: boolean;
  appointmentType: {
    id: string;
    name: string;
    duration: number;
    color?: string;
    description?: string;
  };
  provider: {
    id: string;
    name: string;
    title?: string;
  };
  location?: {
    id: string;
    name: string;
    address: {
      line1: string;
      line2?: string;
      city: string;
      state: string;
      zipCode: string;
    };
    phone: string;
    directionsUrl: string;
  };
}

interface MobileAppointmentListProps {
  appointments: Appointment[];
  onCancel: (appointmentId: string, reason?: string) => Promise<void>;
  onCheckIn: (appointmentId: string) => Promise<void>;
  onReschedule: (appointmentId: string) => void;
  onAddToCalendar: (appointmentId: string) => void;
  onGetDirections: (appointmentId: string) => void;
  onViewDetails: (appointmentId: string) => void;
  onRefresh: () => Promise<void>;
  isRefreshing?: boolean;
}

export function MobileAppointmentList({
  appointments,
  onCancel,
  onCheckIn,
  onReschedule,
  onAddToCalendar,
  onGetDirections,
  onViewDetails,
  onRefresh,
  isRefreshing = false,
}: MobileAppointmentListProps) {
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleCancelClick = (appointmentId: string) => {
    setSelectedAppointment(appointmentId);
    setCancelDialogOpen(true);
  };

  const handleConfirmCancel = async () => {
    if (!selectedAppointment) return;
    setIsLoading(true);
    try {
      await onCancel(selectedAppointment, cancelReason);
      setCancelDialogOpen(false);
      setCancelReason('');
      setSelectedAppointment(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckIn = async (appointmentId: string) => {
    setIsLoading(true);
    try {
      await onCheckIn(appointmentId);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SCHEDULED':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Scheduled</Badge>;
      case 'CONFIRMED':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Confirmed</Badge>;
      case 'CHECKED_IN':
        return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Checked In</Badge>;
      case 'IN_PROGRESS':
        return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">In Progress</Badge>;
      case 'COMPLETED':
        return <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">Completed</Badge>;
      case 'CANCELLED':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTimeUntilDisplay = (hoursUntil: number) => {
    if (hoursUntil < 1) {
      const minutes = Math.round(hoursUntil * 60);
      return minutes <= 0 ? 'Now' : `${minutes} min`;
    }
    if (hoursUntil < 24) {
      return `${Math.round(hoursUntil)} hr`;
    }
    const days = Math.round(hoursUntil / 24);
    return `${days} day${days > 1 ? 's' : ''}`;
  };

  if (appointments.length === 0) {
    return (
      <Card className="mx-4 my-2">
        <CardContent className="pt-6 text-center">
          <Calendar className="w-12 h-12 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Upcoming Appointments</h3>
          <p className="text-gray-500 text-sm">
            You don&apos;t have any upcoming appointments scheduled.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3 px-4 pb-4">
      {/* Pull to refresh indicator */}
      <div className="flex justify-center py-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="text-gray-500"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Pull to refresh'}
        </Button>
      </div>

      {appointments.map((apt) => (
        <Card
          key={apt.id}
          className="overflow-hidden border-l-4"
          style={{ borderLeftColor: apt.appointmentType.color || '#053e67' }}
        >
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-base font-semibold text-gray-900">
                  {apt.appointmentType.name}
                </CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <User className="w-3 h-3 text-gray-400" />
                  <span className="text-sm text-gray-600">{apt.provider.name}</span>
                </div>
              </div>
              <div className="text-right">
                {getStatusBadge(apt.status)}
                <div className="text-xs text-gray-500 mt-1">
                  {getTimeUntilDisplay(apt.hoursUntil)}
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-0 px-4 pb-4">
            {/* Date & Time */}
            <div className="flex items-center gap-2 text-sm text-gray-700 mb-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="font-medium">
                {format(new Date(apt.startTime), 'EEEE, MMMM d, yyyy')}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-700 mb-3">
              <Clock className="w-4 h-4 text-gray-400" />
              <span>
                {format(new Date(apt.startTime), 'h:mm a')} -{' '}
                {format(new Date(apt.endTime), 'h:mm a')}
              </span>
            </div>

            {/* Location */}
            {apt.location && (
              <div className="flex items-start gap-2 text-sm text-gray-600 mb-3">
                <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                <div>
                  <div className="font-medium">{apt.location.name}</div>
                  <div className="text-xs text-gray-500">
                    {apt.location.address.line1}, {apt.location.address.city},{' '}
                    {apt.location.address.state}
                  </div>
                </div>
              </div>
            )}

            {/* Chief Complaint */}
            {apt.chiefComplaint && (
              <div className="bg-gray-50 rounded-md p-2 text-sm text-gray-600 mb-3">
                <span className="font-medium">Reason:</span> {apt.chiefComplaint}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
              {/* Check-in Button */}
              {apt.canCheckIn && (
                <Button
                  size="sm"
                  className="flex-1 bg-[#053e67] hover:bg-[#042e4e]"
                  onClick={() => handleCheckIn(apt.id)}
                  disabled={isLoading}
                >
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Check In
                </Button>
              )}

              {/* Already checked in */}
              {apt.status === 'CHECKED_IN' && (
                <div className="flex-1 flex items-center justify-center text-sm text-green-600 font-medium">
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Checked In
                </div>
              )}

              {/* Add to Calendar */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAddToCalendar(apt.id)}
                className="flex-1"
              >
                <CalendarPlus className="w-4 h-4 mr-1" />
                Calendar
              </Button>

              {/* Get Directions */}
              {apt.location && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onGetDirections(apt.id)}
                  className="flex-1"
                >
                  <Navigation className="w-4 h-4 mr-1" />
                  Directions
                </Button>
              )}

              {/* Reschedule */}
              {apt.canReschedule && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onReschedule(apt.id)}
                  className="text-gray-600"
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Reschedule
                </Button>
              )}

              {/* Cancel */}
              {apt.canCancel && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleCancelClick(apt.id)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <XCircle className="w-4 h-4 mr-1" />
                  Cancel
                </Button>
              )}

              {/* View Details */}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onViewDetails(apt.id)}
                className="text-gray-500"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Appointment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this appointment? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Reason for cancellation (optional)"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="min-h-[80px]"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Keep Appointment</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmCancel}
              disabled={isLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {isLoading ? 'Cancelling...' : 'Cancel Appointment'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
