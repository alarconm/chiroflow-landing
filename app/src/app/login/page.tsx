'use client';

import { useState, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

// Demo accounts for Central Oregon Chiropractic
const TEST_ACCOUNTS = [
  { label: 'Admin', description: 'Full system access', email: 'admin@centraloregonchiro.app', password: 'admin123' },
  { label: 'Dr. Rookstool', description: 'Primary chiropractor', email: 'dr.rookstool@centraloregonchiro.app', password: 'provider123' },
  { label: 'Front Desk', description: 'Reception & scheduling', email: 'frontdesk@centraloregonchiro.app', password: 'staff123' },
];

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
  const error = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingAccount, setLoadingAccount] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    error ? 'Invalid credentials' : null
  );

  const handleQuickLogin = async (account: typeof TEST_ACCOUNTS[0]) => {
    setLoadingAccount(account.email);
    setErrorMessage(null);

    try {
      const result = await signIn('credentials', {
        email: account.email,
        password: account.password,
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        setErrorMessage(result.error);
      } else if (result?.ok) {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      setErrorMessage('An unexpected error occurred');
    } finally {
      setLoadingAccount(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        setErrorMessage(result.error);
      } else if (result?.ok) {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      setErrorMessage('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Central Oregon Chiropractic Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#053e67] items-center justify-center p-12">
        <div className="max-w-md">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-14 h-14 rounded-xl bg-white flex items-center justify-center">
              <span className="text-[#053e67] font-bold text-xl">COC</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">
                Central Oregon Chiropractic
              </h1>
              <p className="text-blue-200 text-sm">Gets You Back to Living</p>
            </div>
          </div>
          <p className="text-blue-100 text-lg leading-relaxed">
            Welcome to your practice management portal. Streamline scheduling,
            documentation, and billing with AI-powered automation.
          </p>
          <div className="mt-12 space-y-4">
            <div className="flex items-center gap-3 text-stone-300">
              <div className="w-8 h-8 rounded-full bg-stone-800 flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span>HIPAA-compliant patient records</span>
            </div>
            <div className="flex items-center gap-3 text-stone-300">
              <div className="w-8 h-8 rounded-full bg-stone-800 flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span>Integrated scheduling & billing</span>
            </div>
            <div className="flex items-center gap-3 text-stone-300">
              <div className="w-8 h-8 rounded-full bg-stone-800 flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span>AI-powered documentation</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-stone-50">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="w-10 h-10 rounded-lg bg-[#053e67] flex items-center justify-center">
                <span className="text-white font-bold text-sm">COC</span>
              </div>
              <h1 className="text-xl font-bold text-stone-900">
                Central Oregon Chiropractic
              </h1>
            </div>
            <p className="text-sm text-stone-500">Gets You Back to Living</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-8">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-stone-900">Welcome back</h2>
              <p className="text-sm text-stone-500 mt-1">Sign in to your practice</p>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{errorMessage}</p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-stone-700 mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2.5 border border-stone-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                  placeholder="you@practice.com"
                  required
                  autoComplete="email"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-stone-700 mb-1">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2.5 border border-stone-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 bg-[#053e67] text-white font-medium rounded-lg hover:bg-[#053e67] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Signing in...
                  </span>
                ) : (
                  'Sign in'
                )}
              </button>
            </form>

            {/* Quick Access */}
            <div className="mt-8 pt-6 border-t border-stone-200">
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">
                Demo Access
              </p>
              <div className="space-y-2">
                {TEST_ACCOUNTS.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    onClick={() => handleQuickLogin(account)}
                    disabled={loadingAccount !== null || isLoading}
                    className="w-full flex items-center justify-between px-4 py-3 text-left border border-stone-200 rounded-lg hover:bg-stone-50 hover:border-stone-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div>
                      <div className="text-sm font-medium text-stone-900">{account.label}</div>
                      <div className="text-xs text-stone-500">{account.description}</div>
                    </div>
                    {loadingAccount === account.email ? (
                      <svg className="animate-spin h-4 w-4 text-[#053e67]" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-stone-400 mt-6">
            Central Oregon Chiropractic · Redmond, OR · (541) 923-6024
          </p>
        </div>
      </div>
    </div>
  );
}

function LoginLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50">
      <div className="animate-pulse text-center">
        <div className="h-6 w-32 bg-stone-200 rounded mx-auto mb-2"></div>
        <div className="h-4 w-24 bg-stone-100 rounded mx-auto"></div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginForm />
    </Suspense>
  );
}
