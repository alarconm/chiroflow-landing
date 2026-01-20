'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to console (can be extended to send to monitoring service)
    console.error('Application error:', {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-md text-center p-8">
        <div className="text-8xl font-bold text-red-500 mb-4">500</div>
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Something went wrong</h1>
        <p className="text-gray-600 mb-8">
          We&apos;re sorry, but something unexpected happened. Our team has been notified and is
          working on it.
        </p>
        {process.env.NODE_ENV === 'development' && (
          <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-lg text-left">
            <p className="text-sm font-medium text-red-800 mb-2">Error Details (Dev Only)</p>
            <p className="text-sm text-red-600 font-mono">{error.message}</p>
            {error.digest && (
              <p className="text-xs text-red-500 mt-2">Digest: {error.digest}</p>
            )}
          </div>
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-medium rounded-lg hover:from-cyan-600 hover:to-teal-600 transition-all"
          >
            Try Again
          </button>
          <button
            onClick={() => window.location.href = '/'}
            className="px-6 py-3 bg-white text-gray-700 font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-all"
          >
            Go Home
          </button>
        </div>
      </div>
    </div>
  );
}
