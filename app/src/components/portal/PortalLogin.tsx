'use client';

/**
 * Epic 14: Patient Portal - Login Component
 * ChiroFlow branded login with warm amber/stone theme
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { trpc } from '@/trpc/client';
import { Eye, EyeOff, Lock, Mail, ArrowLeft } from 'lucide-react';

interface PortalLoginProps {
  organizationId?: string;
  organizationName?: string;
  onLoginSuccess?: (token: string) => void;
}

export function PortalLogin({ organizationId, organizationName, onLoginSuccess }: PortalLoginProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  const loginMutation = trpc.portal.login.useMutation({
    onSuccess: (data) => {
      // Store token in localStorage
      localStorage.setItem('portalToken', data.token);
      localStorage.setItem('portalUser', JSON.stringify(data.user));

      if (onLoginSuccess) {
        onLoginSuccess(data.token);
      } else {
        router.push('/portal/dashboard');
      }
    },
    onError: (error) => {
      setError(error.message);
      setIsLoading(false);
    },
  });

  const resetPasswordMutation = trpc.portal.requestPasswordReset.useMutation({
    onSuccess: () => {
      setResetEmailSent(true);
      setIsLoading(false);
    },
    onError: (error) => {
      setError(error.message);
      setIsLoading(false);
    },
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!organizationId) {
      setError('Organization ID is required');
      return;
    }

    setIsLoading(true);

    loginMutation.mutate({
      email,
      password,
      organizationId,
    });
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!organizationId) {
      setError('Organization ID is required');
      return;
    }

    setIsLoading(true);

    resetPasswordMutation.mutate({
      email,
      organizationId,
    });
  };

  if (showForgotPassword) {
    return (
      <Card className="w-full max-w-md mx-auto border-stone-200 shadow-lg">
        <CardHeader className="space-y-1 pb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setShowForgotPassword(false);
                setResetEmailSent(false);
                setError(null);
              }}
              className="p-1 rounded-md hover:bg-stone-100 text-stone-500 hover:text-stone-700"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <CardTitle className="text-xl text-stone-900">Reset Password</CardTitle>
          </div>
          <CardDescription className="text-stone-500">
            Enter your email address and we will send you a link to reset your password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {resetEmailSent ? (
            <div className="space-y-4">
              <Alert className="border-green-200 bg-green-50">
                <AlertDescription className="text-green-800">
                  If an account exists with that email, you will receive a password reset link shortly.
                  Please check your inbox and spam folder.
                </AlertDescription>
              </Alert>
              <Button
                variant="outline"
                className="w-full border-stone-200 hover:bg-stone-50"
                onClick={() => {
                  setShowForgotPassword(false);
                  setResetEmailSent(false);
                }}
              >
                Back to Login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="reset-email" className="text-stone-700">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="pl-10 border-stone-200 focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="w-full bg-[#053e67] hover:bg-[#053e67] text-white"
                disabled={isLoading}
              >
                {isLoading ? 'Sending...' : 'Send Reset Link'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto border-stone-200 shadow-lg">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-2xl text-stone-900">Sign In</CardTitle>
        <CardDescription className="text-stone-500">
          {organizationName
            ? `Access your health information at ${organizationName}`
            : 'Access your health information'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="email" className="text-stone-700">Email Address</Label>
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
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-stone-700">Password</Label>
              <button
                type="button"
                className="text-sm text-[#053e67] hover:text-[#053e67] font-medium"
                onClick={() => setShowForgotPassword(true)}
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="pl-10 pr-10 border-stone-200 focus:border-blue-500 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
          <Button
            type="submit"
            className="w-full bg-[#053e67] hover:bg-[#053e67] text-white"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Signing in...
              </span>
            ) : (
              'Sign In'
            )}
          </Button>
        </form>

        {/* Demo credentials hint */}
        <div className="mt-6 p-4 bg-stone-50 rounded-lg border border-stone-200">
          <p className="text-xs text-stone-500 mb-2">Demo Credentials:</p>
          <p className="text-xs text-stone-600 font-mono">Email: demo@chiroflow.com</p>
          <p className="text-xs text-stone-600 font-mono">Password: demo123</p>
        </div>
      </CardContent>
    </Card>
  );
}
