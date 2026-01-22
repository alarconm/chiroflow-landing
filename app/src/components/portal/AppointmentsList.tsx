'use client';

/**
 * Epic 14: Patient Portal - Appointments List Component
 * Displays upcoming and past appointments with warm amber/stone theme
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { trpc } from '@/trpc/client';
import { format, isPast, isToday, isTomorrow, addDays } from 'date-fns';
import { Calendar, Clock, User, X, CalendarPlus, MapPin, Phone } from 'lucide-react';

// Demo appointments data
const DEMO_APPOINTMENTS = [
  {
    id: 'demo-1',
    startTime: addDays(new Date(), 3).toISOString(),
    endTime: addDays(new Date(), 3).toISOString(),
    status: 'CONFIRMED',
    appointmentType: { name: 'Chiropractic Adjustment' },
    provider: { title: 'Dr.', firstName: '[DEMO] Sarah', lastName: 'Mitchell' },
    chiefComplaint: 'Lower back pain follow-up',
    canCancel: true,
  },
  {
    id: 'demo-2',
    startTime: addDays(new Date(), 10).toISOString(),
    endTime: addDays(new Date(), 10).toISOString(),
    status: 'SCHEDULED',
    appointmentType: { name: 'New Patient Evaluation' },
    provider: { title: 'Dr.', firstName: '[DEMO] James', lastName: 'Wilson' },
    chiefComplaint: 'Initial consultation',
    canCancel: true,
  },
  {
    id: 'demo-3',
    startTime: addDays(new Date(), -7).toISOString(),
    endTime: addDays(new Date(), -7).toISOString(),
    status: 'COMPLETED',
    appointmentType: { name: 'Chiropractic Adjustment' },
    provider: { title: 'Dr.', firstName: '[DEMO] Sarah', lastName: 'Mitchell' },
    chiefComplaint: 'Initial lower back assessment',
    canCancel: false,
  },
  {
    id: 'demo-4',
    startTime: addDays(new Date(), -21).toISOString(),
    endTime: addDays(new Date(), -21).toISOString(),
    status: 'COMPLETED',
    appointmentType: { name: 'New Patient Evaluation' },
    provider: { title: 'Dr.', firstName: '[DEMO] Sarah', lastName: 'Mitchell' },
    chiefComplaint: 'New patient intake',
    canCancel: false,
  },
];

export function AppointmentsList() {
  const [token, setToken] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    setToken(localStorage.getItem('portalToken'));
  }, []);

  const utils = trpc.useUtils();

  const { data: upcomingData, isLoading: isLoadingUpcoming } =
    trpc.portal.listAppointments.useQuery(
      { sessionToken: token!, includeHistory: false, limit: 50 },
      { enabled: !!token }
    );

  const { data: historyData, isLoading: isLoadingHistory } =
    trpc.portal.listAppointments.useQuery(
      { sessionToken: token!, includeHistory: true, limit: 50 },
      { enabled: !!token }
    );

  const cancelMutation = trpc.portal.cancelAppointment.useMutation({
    onSuccess: () => {
      setCancellingId(null);
      utils.portal.listAppointments.invalidate();
      utils.portal.getDashboardSummary.invalidate();
    },
  });

  const handleCancel = (appointmentId: string) => {
    if (!token) return;
    cancelMutation.mutate({
      sessionToken: token,
      appointmentId,
    });
  };

  // Use demo data if API returns nothing
  const upcomingAppointments = upcomingData?.appointments?.length
    ? upcomingData.appointments
    : DEMO_APPOINTMENTS.filter((a) => !isPast(new Date(a.startTime)));

  const pastAppointments = historyData?.appointments?.length
    ? historyData.appointments.filter((a) => isPast(new Date(a.startTime)))
    : DEMO_APPOINTMENTS.filter((a) => isPast(new Date(a.startTime)));

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      SCHEDULED: { label: 'Scheduled', className: 'bg-blue-50 text-[#053e67] border-blue-200' },
      CONFIRMED: { label: 'Confirmed', className: 'bg-green-50 text-green-700 border-green-200' },
      CHECKED_IN: { label: 'Checked In', className: 'bg-blue-50 text-[#053e67] border-blue-200' },
      IN_PROGRESS: { label: 'In Progress', className: 'bg-blue-50 text-[#053e67] border-blue-200' },
      COMPLETED: { label: 'Completed', className: 'bg-stone-100 text-stone-600 border-stone-200' },
      CANCELLED: { label: 'Cancelled', className: 'bg-red-50 text-red-700 border-red-200' },
      NO_SHOW: { label: 'No Show', className: 'bg-red-50 text-red-700 border-red-200' },
      RESCHEDULED: { label: 'Rescheduled', className: 'bg-stone-100 text-stone-600 border-stone-200' },
    };
    const config = variants[status] || { label: status, className: 'bg-stone-100 text-stone-600 border-stone-200' };
    return <Badge variant="outline" className={config.className}>{config.label}</Badge>;
  };

  const getDateLabel = (date: Date) => {
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEEE, MMMM d, yyyy');
  };

  if (!token) return null;

  // Define a flexible appointment type that handles both API and demo data
  interface AppointmentType {
    id: string;
    startTime: string | Date;
    endTime: string | Date;
    status: string;
    appointmentType?: { id?: string; name: string; duration?: number };
    provider?: { id?: string; title: string | null; firstName: string; lastName: string };
    notes?: string | null;
    chiefComplaint: string | null;
    canCancel: boolean;
  }

  const renderAppointmentCard = (appointment: AppointmentType, showCancel = true) => (
    <Card key={appointment.id} className="border-stone-200 hover:border-blue-200 transition-colors">
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="space-y-3 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-[#053e67]" />
                <span className="font-semibold text-stone-900">
                  {getDateLabel(new Date(appointment.startTime))}
                </span>
              </div>
              {getStatusBadge(appointment.status)}
            </div>

            <div className="flex items-center gap-2 text-stone-600">
              <Clock className="h-4 w-4 text-stone-400" />
              <span>
                {format(new Date(appointment.startTime), 'h:mm a')}
              </span>
            </div>

            {appointment.appointmentType && (
              <Badge variant="outline" className="bg-blue-50 text-[#053e67] border-blue-200">
                {appointment.appointmentType.name}
              </Badge>
            )}

            {appointment.provider && (
              <div className="flex items-center gap-2 text-sm text-stone-600">
                <User className="h-4 w-4 text-stone-400" />
                <span>
                  {appointment.provider.title} {appointment.provider.firstName}{' '}
                  {appointment.provider.lastName}
                </span>
              </div>
            )}

            {appointment.chiefComplaint && (
              <p className="text-sm text-stone-500 bg-stone-50 px-3 py-2 rounded-md">
                <span className="font-medium">Reason:</span> {appointment.chiefComplaint}
              </p>
            )}
          </div>

          {showCancel && appointment.canCancel && (
            <div className="flex-shrink-0">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel Appointment?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to cancel your appointment on{' '}
                      <strong>{format(new Date(appointment.startTime), 'MMMM d, yyyy')}</strong> at{' '}
                      <strong>{format(new Date(appointment.startTime), 'h:mm a')}</strong>?
                      <br /><br />
                      This action cannot be undone. You will need to request a new appointment.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="border-stone-200">Keep Appointment</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleCancel(appointment.id)}
                      className="bg-red-600 hover:bg-red-700 text-white"
                    >
                      Cancel Appointment
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Appointments</h1>
          <p className="text-stone-600">View and manage your appointments</p>
        </div>
        <Link href="/portal/appointments/request">
          <Button className="bg-[#053e67] hover:bg-[#053e67] text-white">
            <CalendarPlus className="h-4 w-4 mr-2" />
            Request Appointment
          </Button>
        </Link>
      </div>

      {/* Location Info Card */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-[#053e67] mt-0.5" />
              <div>
                <p className="font-medium text-blue-900">ChiroFlow Demo Practice</p>
                <p className="text-sm text-[#053e67]">123 Wellness Way, Health City, HC 12345</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-[#053e67]">
              <Phone className="h-4 w-4" />
              <span>(555) 123-4567</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="upcoming" className="space-y-6">
        <TabsList className="bg-stone-100">
          <TabsTrigger
            value="upcoming"
            className="data-[state=active]:bg-white data-[state=active]:text-[#053e67]"
          >
            Upcoming
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="data-[state=active]:bg-white data-[state=active]:text-[#053e67]"
          >
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="space-y-4">
          {isLoadingUpcoming ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-40" />
              ))}
            </div>
          ) : upcomingAppointments.length === 0 ? (
            <Card className="border-stone-200">
              <CardContent className="py-12 text-center">
                <Calendar className="h-12 w-12 mx-auto text-stone-300 mb-4" />
                <p className="text-stone-500 mb-4">No upcoming appointments</p>
                <Link href="/portal/appointments/request">
                  <Button className="bg-[#053e67] hover:bg-[#053e67] text-white">
                    Request an Appointment
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {upcomingAppointments.map((appointment) => renderAppointmentCard(appointment, true))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          {isLoadingHistory ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-40" />
              ))}
            </div>
          ) : pastAppointments.length === 0 ? (
            <Card className="border-stone-200">
              <CardContent className="py-12 text-center">
                <Calendar className="h-12 w-12 mx-auto text-stone-300 mb-4" />
                <p className="text-stone-500">No appointment history</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {pastAppointments.map((appointment) => renderAppointmentCard(appointment, false))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Cancellation Policy */}
      <Card className="border-stone-200">
        <CardContent className="p-4">
          <h3 className="font-medium text-stone-900 mb-2">Cancellation Policy</h3>
          <ul className="text-sm text-stone-500 space-y-1">
            <li>Please cancel appointments at least 24 hours in advance</li>
            <li>Late cancellations may be subject to a cancellation fee</li>
            <li>For same-day cancellations, please call us directly</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
