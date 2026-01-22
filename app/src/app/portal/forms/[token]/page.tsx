'use client';

/**
 * Epic 14: Patient Portal - Form Completion Page
 * US-096: Patient form completion portal
 *
 * Dynamic route for completing/viewing individual forms
 */

import { use } from 'react';
import { FormCompletion } from '@/components/portal/FormCompletion';

interface FormPageProps {
  params: Promise<{ token: string }>;
}

export default function PortalFormPage({ params }: FormPageProps) {
  const { token } = use(params);
  return <FormCompletion token={token} />;
}
