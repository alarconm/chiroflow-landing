'use client';

/**
 * Epic 14: Patient Portal - Payment Page
 */

import { Suspense } from 'react';
import { PaymentForm } from '@/components/portal';

export default function PortalPaymentPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PaymentForm />
    </Suspense>
  );
}
