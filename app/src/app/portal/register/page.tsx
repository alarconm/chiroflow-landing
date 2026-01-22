'use client';

/**
 * Epic 14: Patient Portal - Registration Page
 */

import { PortalRegister } from '@/components/portal/PortalRegister';

export default function PortalRegisterPage() {
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
        <div className="max-w-md mx-auto">
          <PortalRegister
            organizationId="demo-org"
            organizationName="ChiroFlow Demo Practice"
          />
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
              <a href="/portal/privacy" className="hover:text-[#053e67]">
                Privacy Policy
              </a>
              <a href="/portal/terms" className="hover:text-[#053e67]">
                Terms of Use
              </a>
              <a href="/portal/help" className="hover:text-[#053e67]">
                Help
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
