'use client';

/**
 * Epic 14: Patient Portal - Request Appointment Component
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { trpc } from '@/trpc/client';
import { format, addDays } from 'date-fns';
import { Calendar, Clock, AlertTriangle, CheckCircle } from 'lucide-react';

export function RequestAppointment() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [requestedDate, setRequestedDate] = useState('');
  const [preferredTime, setPreferredTime] = useState<'morning' | 'afternoon' | 'evening' | 'any'>('any');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setToken(localStorage.getItem('portalToken'));
  }, []);

  const requestMutation = trpc.portal.requestAppointment.useMutation({
    onSuccess: () => {
      setSuccess(true);
      setError(null);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    requestMutation.mutate({
      sessionToken: token,
      requestedDate: requestedDate ? new Date(requestedDate) : undefined,
      preferredDates: requestedDate
        ? [{ date: new Date(requestedDate), timePreference: preferredTime }]
        : undefined,
      reason,
      patientNotes: notes,
      isUrgent,
    });
  };

  if (!token) return null;

  if (success) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="py-12 text-center">
          <CheckCircle className="h-16 w-16 mx-auto text-green-500 mb-4" />
          <h2 className="text-2xl font-semibold mb-2">Request Submitted!</h2>
          <p className="text-gray-600 mb-6">
            Your appointment request has been submitted. Our staff will contact you shortly to
            confirm your appointment.
          </p>
          <div className="flex justify-center gap-4">
            <Button variant="outline" onClick={() => router.push('/portal/appointments')}>
              View Appointments
            </Button>
            <Button onClick={() => router.push('/portal')}>Back to Dashboard</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const minDate = format(addDays(new Date(), 1), 'yyyy-MM-dd');

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Request an Appointment</h1>
        <p className="text-gray-600">
          Fill out the form below to request an appointment. Our staff will contact you to confirm.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appointment Details</CardTitle>
          <CardDescription>
            Please provide your preferred date and time, and the reason for your visit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="date">Preferred Date</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    id="date"
                    type="date"
                    value={requestedDate}
                    onChange={(e) => setRequestedDate(e.target.value)}
                    min={minDate}
                    className="pl-10"
                  />
                </div>
                <p className="text-sm text-gray-500">Leave blank for any available date</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="time">Preferred Time</Label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <select
                    id="time"
                    value={preferredTime}
                    onChange={(e) => setPreferredTime(e.target.value as typeof preferredTime)}
                    className="w-full h-9 pl-10 pr-3 rounded-md border border-input bg-background text-sm"
                  >
                    <option value="any">Any Time</option>
                    <option value="morning">Morning (8am - 12pm)</option>
                    <option value="afternoon">Afternoon (12pm - 4pm)</option>
                    <option value="evening">Evening (4pm - 7pm)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason for Visit</Label>
              <Input
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g., Back pain, Follow-up visit, New patient exam"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Additional Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional information you'd like us to know..."
                rows={4}
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-[#053e67]" />
                <div>
                  <p className="font-medium text-blue-900">Is this urgent?</p>
                  <p className="text-sm text-[#053e67]">
                    Mark as urgent if you need to be seen as soon as possible
                  </p>
                </div>
              </div>
              <Switch checked={isUrgent} onCheckedChange={setIsUrgent} />
            </div>

            <div className="flex justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/portal/appointments')}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={requestMutation.isPending}>
                {requestMutation.isPending ? 'Submitting...' : 'Submit Request'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-6">
          <h3 className="font-medium mb-2">What happens next?</h3>
          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
            <li>Your request will be reviewed by our scheduling team</li>
            <li>We will contact you within 1-2 business days to confirm your appointment</li>
            <li>You will receive a confirmation via email and/or text message</li>
            <li>
              If you need immediate assistance, please call our office directly
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
