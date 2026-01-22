'use client';

/**
 * Epic 14: Patient Portal - Registration Component
 * Allows new patients to create a portal account with email verification
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { trpc } from '@/trpc/client';
import { Eye, EyeOff, Lock, Mail, User, ArrowLeft, CheckCircle } from 'lucide-react';

interface PortalRegisterProps {
  organizationId?: string;
  organizationName?: string;
  patientId?: string;
  activationToken?: string;
  onRegisterSuccess?: () => void;
}

export function PortalRegister({
  organizationId,
  organizationName,
  patientId: initialPatientId,
  activationToken,
  onRegisterSuccess,
}: PortalRegisterProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [patientId, setPatientId] = useState(initialPatientId || '');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [registrationComplete, setRegistrationComplete] = useState(false);

  const registerMutation = trpc.portal.register.useMutation({
    onSuccess: () => {
      setRegistrationComplete(true);
      setIsLoading(false);
      if (onRegisterSuccess) {
        onRegisterSuccess();
      }
    },
    onError: (error) => {
      setError(error.message);
      setIsLoading(false);
    },
  });

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate required fields
    if (!organizationId) {
      setError('Organization ID is required');
      return;
    }

    if (!patientId) {
      setError('Patient ID is required. Please use the registration link from your clinic.');
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

    registerMutation.mutate({
      patientId,
      email,
      password,
      organizationId,
    });
  };

  // Registration complete - show success message
  if (registrationComplete) {
    return (
      <Card className="w-full max-w-md mx-auto border-stone-200 shadow-lg">
        <CardHeader className="space-y-1 pb-4 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <CardTitle className="text-xl text-stone-900">Registration Complete!</CardTitle>
          <CardDescription className="text-stone-500">
            Please check your email to verify your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-blue-200 bg-blue-50">
            <AlertDescription className="text-blue-800">
              We&apos;ve sent a verification email to <strong>{email}</strong>. Click the link in the
              email to activate your account.
            </AlertDescription>
          </Alert>
          <div className="space-y-2 text-sm text-stone-500">
            <p>Didn&apos;t receive the email?</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Check your spam or junk folder</li>
              <li>Make sure you entered the correct email address</li>
              <li>Wait a few minutes and try again</li>
            </ul>
          </div>
          <Button
            variant="outline"
            className="w-full border-stone-200 hover:bg-stone-50"
            onClick={() => router.push('/portal')}
          >
            Back to Login
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto border-stone-200 shadow-lg">
      <CardHeader className="space-y-1 pb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/portal')}
            className="p-1 rounded-md hover:bg-stone-100 text-stone-500 hover:text-stone-700"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <CardTitle className="text-xl text-stone-900">Create Your Account</CardTitle>
        </div>
        <CardDescription className="text-stone-500">
          {organizationName
            ? `Register for portal access at ${organizationName}`
            : 'Register for portal access'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleRegister} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Patient ID - pre-filled if from activation link */}
          {!initialPatientId && (
            <div className="space-y-2">
              <Label htmlFor="patientId" className="text-stone-700">
                Patient ID or MRN
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
                <Input
                  id="patientId"
                  type="text"
                  placeholder="Enter your Patient ID"
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  required
                  className="pl-10 border-stone-200 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <p className="text-xs text-stone-500">
                Your Patient ID can be found on your appointment confirmation or billing statement.
              </p>
            </div>
          )}

          {/* Date of Birth for verification */}
          <div className="space-y-2">
            <Label htmlFor="dateOfBirth" className="text-stone-700">
              Date of Birth
            </Label>
            <Input
              id="dateOfBirth"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              required
              className="border-stone-200 focus:border-blue-500 focus:ring-blue-500"
            />
            <p className="text-xs text-stone-500">Used to verify your identity</p>
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email" className="text-stone-700">
              Email Address
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="pl-10 border-stone-200 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-2">
            <Label htmlFor="password" className="text-stone-700">
              Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Create a password"
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
              Confirm Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirm your password"
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

          {/* Terms and conditions */}
          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              id="terms"
              required
              className="mt-1 rounded border-stone-300 text-[#053e67] focus:ring-[#053e67]"
            />
            <label htmlFor="terms" className="text-sm text-stone-600">
              I agree to the{' '}
              <a href="/portal/terms" className="text-[#053e67] hover:underline">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="/portal/privacy" className="text-[#053e67] hover:underline">
                Privacy Policy
              </a>
            </label>
          </div>

          <Button
            type="submit"
            className="w-full bg-[#053e67] hover:bg-[#042d4a] text-white"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating Account...
              </span>
            ) : (
              'Create Account'
            )}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-stone-500">
            Already have an account?{' '}
            <a href="/portal" className="text-[#053e67] hover:underline font-medium">
              Sign in
            </a>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
