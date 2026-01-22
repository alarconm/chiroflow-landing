'use client';

/**
 * Epic 14: Patient Portal - Password Reset Component
 * Handles password reset with token from email link
 */

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { trpc } from '@/trpc/client';
import { Eye, EyeOff, Lock, CheckCircle, XCircle } from 'lucide-react';

type ResetState = 'form' | 'success' | 'error' | 'invalid';

export function PortalResetPassword() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [state, setState] = useState<ResetState>('form');

  useEffect(() => {
    if (!token) {
      setState('invalid');
    }
  }, [token]);

  const resetPasswordMutation = trpc.portal.resetPassword.useMutation({
    onSuccess: () => {
      setState('success');
      setIsLoading(false);
    },
    onError: (error) => {
      if (error.message.includes('expired') || error.message.includes('invalid')) {
        setState('error');
      } else {
        setError(error.message);
      }
      setIsLoading(false);
    },
  });

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setState('invalid');
      return;
    }

    // Validate password
    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Check password strength
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);

    if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
      setError('Password must contain uppercase, lowercase, and numbers');
      return;
    }

    setIsLoading(true);

    resetPasswordMutation.mutate({
      token,
      newPassword: password,
    });
  };

  // Invalid token state
  if (state === 'invalid') {
    return (
      <Card className="w-full max-w-md mx-auto border-stone-200 shadow-lg">
        <CardHeader className="space-y-1 pb-4 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
            <XCircle className="h-8 w-8 text-red-600" />
          </div>
          <CardTitle className="text-xl text-stone-900">Invalid Link</CardTitle>
          <CardDescription className="text-stone-500">
            This password reset link is invalid.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertDescription>
              The reset link is missing required information. Please request a new password reset.
            </AlertDescription>
          </Alert>
          <div className="flex flex-col gap-2">
            <Button
              className="w-full bg-[#053e67] hover:bg-[#042d4a] text-white"
              onClick={() => router.push('/portal')}
            >
              Back to Login
            </Button>
          </div>
        </CardContent>
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
          <CardTitle className="text-xl text-stone-900">Password Reset!</CardTitle>
          <CardDescription className="text-stone-500">
            Your password has been successfully changed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-green-200 bg-green-50">
            <AlertDescription className="text-green-800">
              You can now sign in with your new password. For security, all other sessions have been
              logged out.
            </AlertDescription>
          </Alert>
          <Button
            className="w-full bg-[#053e67] hover:bg-[#042d4a] text-white"
            onClick={() => router.push('/portal')}
          >
            Sign In
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Error state (expired/invalid token)
  if (state === 'error') {
    return (
      <Card className="w-full max-w-md mx-auto border-stone-200 shadow-lg">
        <CardHeader className="space-y-1 pb-4 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center mb-4">
            <XCircle className="h-8 w-8 text-amber-600" />
          </div>
          <CardTitle className="text-xl text-stone-900">Link Expired</CardTitle>
          <CardDescription className="text-stone-500">
            This password reset link has expired or has already been used.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-amber-200 bg-amber-50">
            <AlertDescription className="text-amber-800">
              Password reset links are valid for 24 hours and can only be used once. Please request a
              new password reset.
            </AlertDescription>
          </Alert>
          <div className="flex flex-col gap-2">
            <Button
              className="w-full bg-[#053e67] hover:bg-[#042d4a] text-white"
              onClick={() => router.push('/portal')}
            >
              Back to Login
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Form state
  return (
    <Card className="w-full max-w-md mx-auto border-stone-200 shadow-lg">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-xl text-stone-900">Set New Password</CardTitle>
        <CardDescription className="text-stone-500">
          Enter your new password below. Make sure it&apos;s secure and easy to remember.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleReset} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Password */}
          <div className="space-y-2">
            <Label htmlFor="password" className="text-stone-700">
              New Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter new password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="pl-10 pr-10 border-stone-200 focus:border-blue-500 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-stone-500">
              Minimum 8 characters with uppercase, lowercase, and numbers
            </p>
          </div>

          {/* Confirm Password */}
          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-stone-700">
              Confirm New Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="pl-10 pr-10 border-stone-200 focus:border-blue-500 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full bg-[#053e67] hover:bg-[#042d4a] text-white"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Resetting Password...
              </span>
            ) : (
              'Reset Password'
            )}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <a href="/portal" className="text-sm text-[#053e67] hover:underline">
            Back to Login
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
