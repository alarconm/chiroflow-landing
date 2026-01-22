'use client';

/**
 * Epic 14: Patient Portal - Reschedule Appointment Page
 * US-095: Online appointment scheduling - Reschedule to new available slot
 */

import { useParams } from 'next/navigation';
import { OnlineScheduling } from '@/components/portal';

export default function PortalReschedulePage() {
  const params = useParams();
  const appointmentId = params?.appointmentId as string;

  return <OnlineScheduling rescheduleAppointmentId={appointmentId} />;
}
