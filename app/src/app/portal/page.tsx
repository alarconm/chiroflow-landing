'use client';

/**
 * Epic 14: Patient Portal - Main Landing Page
 * Redirects to dashboard if authenticated, otherwise shows login
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PortalLogin } from '@/components/portal';

export default function PortalLandingPage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Check for existing portal token
    const token = localStorage.getItem('portalToken');
    if (token) {
      router.push('/portal/dashboard');
    } else {
      setIsChecking(false);
    }
  }, [router]);

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#053e67]" />
      </div>
    );
  }

  // Show login page
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-stone-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#053e67] flex items-center justify-center">
              <svg
                className="h-6 w-6 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-stone-900">ChiroFlow</h1>
              <p className="text-xs text-stone-500">Patient Portal</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Side - Welcome Message */}
          <div className="space-y-6">
            <h2 className="text-3xl font-bold text-stone-900 sm:text-4xl">
              Welcome to Your
              <span className="block text-[#053e67]">Patient Portal</span>
            </h2>
            <p className="text-lg text-stone-600">
              Access your health information, schedule appointments, communicate with your care team,
              and manage your account all in one convenient place.
            </p>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <svg className="h-4 w-4 text-[#053e67]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium text-stone-900">Book Appointments</h3>
                  <p className="text-sm text-stone-500">Schedule and manage your visits online</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <svg className="h-4 w-4 text-[#053e67]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium text-stone-900">Secure Messaging</h3>
                  <p className="text-sm text-stone-500">Communicate directly with your care team</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <svg className="h-4 w-4 text-[#053e67]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium text-stone-900">Digital Forms</h3>
                  <p className="text-sm text-stone-500">Complete intake forms before your visit</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <svg className="h-4 w-4 text-[#053e67]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium text-stone-900">Online Payments</h3>
                  <p className="text-sm text-stone-500">View statements and pay bills securely</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side - Login Form */}
          <div>
            <PortalLogin
              organizationId="demo-org"
              organizationName="ChiroFlow Demo Practice"
            />
            <p className="text-center text-sm text-stone-500 mt-6">
              First time here?{' '}
              <a href="/portal/register" className="text-[#053e67] hover:text-[#053e67] font-medium">
                Register for an account
              </a>
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-stone-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-sm text-stone-500">
              Your health information is protected and secure.
            </p>
            <div className="flex gap-6 text-sm text-stone-500">
              <a href="/portal/privacy" className="hover:text-[#053e67]">Privacy Policy</a>
              <a href="/portal/terms" className="hover:text-[#053e67]">Terms of Use</a>
              <a href="/portal/help" className="hover:text-[#053e67]">Help</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
