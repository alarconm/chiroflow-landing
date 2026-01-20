'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PatientDemographicsForm, PatientContactForm } from '@/components/patients';
import type { DemographicsFormData, ContactFormData } from '@/components/patients';
import { trpc } from '@/trpc/client';
import { toast } from 'sonner';

type Step = 'demographics' | 'contact';

export default function NewPatientPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('demographics');
  const [demographicsData, setDemographicsData] = useState<DemographicsFormData | null>(null);

  const createPatient = trpc.patient.create.useMutation({
    onSuccess: (data) => {
      toast.success('Patient created successfully');
      router.push(`/patients/${data.id}`);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create patient');
    },
  });

  const handleDemographicsSubmit = (data: DemographicsFormData) => {
    setDemographicsData(data);
    setStep('contact');
  };

  const handleContactSubmit = (contact: ContactFormData) => {
    if (!demographicsData) return;

    createPatient.mutate({
      demographics: demographicsData,
      contact: {
        ...contact,
        email: contact.email || undefined,
      },
    });
  };

  const handleSkipContact = () => {
    if (!demographicsData) return;

    createPatient.mutate({
      demographics: demographicsData,
    });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/patients">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Add New Patient</h1>
          <p className="text-gray-500 mt-1">
            {step === 'demographics'
              ? 'Step 1 of 2: Enter patient demographics'
              : 'Step 2 of 2: Add contact information'}
          </p>
        </div>
      </div>

      {/* Progress indicator */}
      <div className="flex items-center gap-2">
        <div
          className={`flex-1 h-2 rounded-full ${
            step === 'demographics' ? 'bg-cyan-500' : 'bg-cyan-500'
          }`}
        />
        <div
          className={`flex-1 h-2 rounded-full ${
            step === 'contact' ? 'bg-cyan-500' : 'bg-gray-200'
          }`}
        />
      </div>

      {/* Form */}
      {step === 'demographics' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-cyan-500" />
              Patient Demographics
            </CardTitle>
            <CardDescription>
              Enter the patient&apos;s personal information. Required fields are marked
              with an asterisk (*).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PatientDemographicsForm
              onSubmit={handleDemographicsSubmit}
              mode="create"
            />
          </CardContent>
        </Card>
      )}

      {step === 'contact' && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
              <CardDescription>
                Add the patient&apos;s contact details. You can also skip this step
                and add contact information later.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PatientContactForm
                onSubmit={handleContactSubmit}
                isLoading={createPatient.isPending}
              />
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => setStep('demographics')}
              disabled={createPatient.isPending}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Demographics
            </Button>
            <Button
              variant="ghost"
              onClick={handleSkipContact}
              disabled={createPatient.isPending}
            >
              Skip &amp; Create Patient
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
