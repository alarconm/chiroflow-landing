'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;

    if (session) {
      // User is logged in, redirect to dashboard
      router.replace('/dashboard');
    } else {
      // User is not logged in, redirect to login
      router.replace('/login');
    }
  }, [session, status, router]);

  // Show loading state while checking session
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50">
      <div className="text-center">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-[#053e67] flex items-center justify-center">
            <span className="text-white font-bold text-xl">CF</span>
          </div>
          <h1 className="text-3xl font-light text-stone-900">
            Chiro<span className="font-semibold">Flow</span>
          </h1>
        </div>
        <div className="flex items-center justify-center gap-2">
          <svg className="animate-spin h-5 w-5 text-[#053e67]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-stone-600">Loading...</span>
        </div>
      </div>
    </div>
  );
}
