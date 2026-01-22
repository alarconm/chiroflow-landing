'use client';

/**
 * Mobile Check-In Component (US-268)
 *
 * Patient self check-in on arrival at the clinic.
 */

import React, { useState, useEffect } from 'react';
import { format, differenceInMinutes } from 'date-fns';
import {
  CheckCircle2,
  Clock,
  User,
  MapPin,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Appointment {
  id: string;
  startTime: string;
  provider: string;
  appointmentType: string;
  location?: {
    name: string;
    address: string;
  };
  status: string;
}

interface CheckInStatus {
  canCheckIn: boolean;
  isCheckedIn: boolean;
  checkedInAt?: string;
  status: string;
  message: string;
}

interface CheckInResult {
  success: boolean;
  message: string;
  appointment?: {
    id: string;
    startTime: string;
    provider: string;
    status: string;
  };
}

interface MobileCheckInProps {
  appointment: Appointment;
  onCheckIn: (appointmentId: string, latitude?: number, longitude?: number) => Promise<CheckInResult>;
  onGetStatus: (appointmentId: string) => Promise<CheckInStatus>;
  onClose: () => void;
}

export function MobileCheckIn({
  appointment,
  onCheckIn,
  onGetStatus,
  onClose,
}: MobileCheckInProps) {
  const [status, setStatus] = useState<CheckInStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkInResult, setCheckInResult] = useState<CheckInResult | null>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Load check-in status
  useEffect(() => {
    const loadStatus = async () => {
      try {
        const result = await onGetStatus(appointment.id);
        setStatus(result);
      } catch (err) {
        setError('Failed to load check-in status');
      } finally {
        setIsLoading(false);
      }
    };

    loadStatus();
  }, [appointment.id, onGetStatus]);

  // Request location permission
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (err) => {
          console.log('Geolocation not available or denied:', err.message);
          // Location is optional, so we don't set an error
        },
        { timeout: 5000 }
      );
    }
  }, []);

  const handleCheckIn = async () => {
    setIsCheckingIn(true);
    setError(null);

    try {
      const result = await onCheckIn(
        appointment.id,
        location?.latitude,
        location?.longitude
      );
      setCheckInResult(result);

      if (result.success) {
        setStatus({
          canCheckIn: false,
          isCheckedIn: true,
          checkedInAt: new Date().toISOString(),
          status: 'CHECKED_IN',
          message: 'You are checked in!',
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check-in failed. Please try again.');
    } finally {
      setIsCheckingIn(false);
    }
  };

  const minutesUntilAppointment = differenceInMinutes(
    new Date(appointment.startTime),
    new Date()
  );

  // Success state
  if (checkInResult?.success || status?.isCheckedIn) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-12 h-12 text-green-600" />
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              You&apos;re Checked In!
            </h2>

            <p className="text-gray-600 mb-6">
              {checkInResult?.message || status?.message || 'Please have a seat and we will call you shortly.'}
            </p>

            <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className="text-sm">
                  {format(new Date(appointment.startTime), 'h:mm a')}
                </span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <User className="w-4 h-4 text-gray-400" />
                <span className="text-sm">{appointment.provider}</span>
              </div>
              <div className="text-sm text-gray-500">
                {appointment.appointmentType}
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800">
                <strong>Tip:</strong> Please have your insurance card and ID ready if this is your first visit.
              </p>
            </div>

            <Button onClick={onClose} className="w-full bg-[#053e67] hover:bg-[#042e4e]">
              Done
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#053e67] mx-auto mb-4" />
          <p className="text-gray-600">Loading check-in status...</p>
        </div>
      </div>
    );
  }

  // Can't check in yet state
  if (status && !status.canCheckIn && !status.isCheckedIn) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 text-center">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-yellow-600" />
            </div>

            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Check-In Not Available
            </h2>

            <p className="text-gray-600 mb-6">
              {status.message}
            </p>

            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="text-3xl font-bold text-gray-900 mb-1">
                {minutesUntilAppointment > 0
                  ? `${minutesUntilAppointment} min`
                  : 'Now'
                }
              </div>
              <div className="text-sm text-gray-500">until your appointment</div>
            </div>

            <div className="space-y-3 mb-6 text-left">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-gray-400" />
                <span>{format(new Date(appointment.startTime), 'EEEE, MMMM d • h:mm a')}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <User className="w-4 h-4 text-gray-400" />
                <span>{appointment.provider}</span>
              </div>
              {appointment.location && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  <span>{appointment.location.name}</span>
                </div>
              )}
            </div>

            <Button onClick={onClose} variant="outline" className="w-full">
              Close
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check-in available state
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <Card className="max-w-md mx-auto">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-xl">Check In for Your Appointment</CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Appointment Details */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Today&apos;s appointment</span>
                <span className="text-sm font-medium">
                  {format(new Date(appointment.startTime), 'h:mm a')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Provider</span>
                <span className="text-sm font-medium">{appointment.provider}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Type</span>
                <span className="text-sm font-medium">{appointment.appointmentType}</span>
              </div>
              {appointment.location && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Location</span>
                  <span className="text-sm font-medium">{appointment.location.name}</span>
                </div>
              )}
            </div>
          </div>

          {/* Time until appointment */}
          <div className="text-center">
            <div className="text-4xl font-bold text-[#053e67] mb-1">
              {minutesUntilAppointment > 0
                ? `${minutesUntilAppointment} min`
                : minutesUntilAppointment === 0
                  ? 'Now'
                  : `${Math.abs(minutesUntilAppointment)} min past`
              }
            </div>
            <div className="text-sm text-gray-500">
              {minutesUntilAppointment > 0
                ? 'until your appointment'
                : minutesUntilAppointment === 0
                  ? 'Your appointment time!'
                  : 'since appointment start'
              }
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Location status */}
          {location && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <MapPin className="w-4 h-4" />
              <span>Location verified</span>
            </div>
          )}

          {/* Check-in button */}
          <Button
            onClick={handleCheckIn}
            disabled={isCheckingIn}
            className="w-full h-14 text-lg bg-[#053e67] hover:bg-[#042e4e]"
          >
            {isCheckingIn ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Checking In...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5 mr-2" />
                Check In Now
              </>
            )}
          </Button>

          {/* Instructions */}
          <div className="text-center text-sm text-gray-500">
            <p>Once checked in, please have a seat in the waiting area.</p>
            <p className="mt-1">We&apos;ll call you when it&apos;s time.</p>
          </div>

          <Button onClick={onClose} variant="ghost" className="w-full text-gray-500">
            Cancel
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
