'use client';

/**
 * Epic 14: Patient Portal - Account Activation Component
 * Handles email verification and account activation
 */

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { trpc } from '@/trpc/client';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

type ActivationState = 'verifying' | 'success' | 'error' | 'expired';

export function PortalActivate() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [state, setState] = useState<ActivationState>('verifying');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const verifyEmailMutation = trpc.portal.verifyEmail.useMutation({
    onSuccess: () => {
      setState('success');
    },
    onError: (error) => {
      if (error.message.includes('expired')) {
        setState('expired');
      } else {
        setState('error');
      }
      setErrorMessage(error.message);
    },
  });

  useEffect(() => {
    if (token) {
      verifyEmailMutation.mutate({ token });
    } else {
      setState('error');
      setErrorMessage('No verification token provided');
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Verifying state
  if (state === 'verifying') {
    return (
      <Card className="w-full max-w-md mx-auto border-stone-200 shadow-lg">
        <CardHeader className="space-y-1 pb-4 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center mb-4">
            <Loader2 className="h-8 w-8 text-[#053e67] animate-spin" />
          </div>
          <CardTitle className="text-xl text-stone-900">Verifying Your Account</CardTitle>
          <CardDescription className="text-stone-500">
            Please wait while we verify your email address...
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Success state
  if (state === 'success') {
    return (
      <Card className="w-full max-w-md mx-auto border-stone-200 shadow-lg">
        <CardHeader className="space-y-1 pb-4 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <CardTitle className="text-xl text-stone-900">Account Activated!</CardTitle>
          <CardDescription className="text-stone-500">
            Your email has been verified and your account is now active.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-green-200 bg-green-50">
            <AlertDescription className="text-green-800">
              You can now sign in to access your patient portal and manage your health information.
            </AlertDescription>
          </Alert>
          <Button
            className="w-full bg-[#053e67] hover:bg-[#042d4a] text-white"
            onClick={() => router.push('/portal')}
          >
            Sign In to Portal
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Expired state
  if (state === 'expired') {
    return (
      <Card className="w-full max-w-md mx-auto border-stone-200 shadow-lg">
        <CardHeader className="space-y-1 pb-4 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center mb-4">
            <XCircle className="h-8 w-8 text-amber-600" />
          </div>
          <CardTitle className="text-xl text-stone-900">Link Expired</CardTitle>
          <CardDescription className="text-stone-500">
            This verification link has expired.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-amber-200 bg-amber-50">
            <AlertDescription className="text-amber-800">
              Verification links are valid for 48 hours. Please register again to receive a new
              verification email.
            </AlertDescription>
          </Alert>
          <div className="flex flex-col gap-2">
            <Button
              className="w-full bg-[#053e67] hover:bg-[#042d4a] text-white"
              onClick={() => router.push('/portal/register')}
            >
              Register Again
            </Button>
            <Button
              variant="outline"
              className="w-full border-stone-200 hover:bg-stone-50"
              onClick={() => router.push('/portal')}
            >
              Back to Login
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  return (
    <Card className="w-full max-w-md mx-auto border-stone-200 shadow-lg">
      <CardHeader className="space-y-1 pb-4 text-center">
        <div className="mx-auto h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <XCircle className="h-8 w-8 text-red-600" />
        </div>
        <CardTitle className="text-xl text-stone-900">Verification Failed</CardTitle>
        <CardDescription className="text-stone-500">
          We couldn&apos;t verify your email address.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant="destructive">
          <AlertDescription>{errorMessage || 'Invalid verification token'}</AlertDescription>
        </Alert>
        <div className="space-y-2 text-sm text-stone-500">
          <p>This could happen if:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>The verification link was already used</li>
            <li>The link was copied incorrectly</li>
            <li>The link has expired</li>
          </ul>
        </div>
        <div className="flex flex-col gap-2">
          <Button
            className="w-full bg-[#053e67] hover:bg-[#042d4a] text-white"
            onClick={() => router.push('/portal/register')}
          >
            Try Registering Again
          </Button>
          <Button
            variant="outline"
            className="w-full border-stone-200 hover:bg-stone-50"
            onClick={() => router.push('/portal')}
          >
            Back to Login
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
