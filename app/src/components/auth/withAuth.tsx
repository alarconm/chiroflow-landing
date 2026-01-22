'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, type ComponentType } from 'react';

type WithAuthOptions = {
  redirectTo?: string;
};

// Loading component for authentication check
function AuthLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#053e67]/50 mx-auto"></div>
        <p className="mt-4 text-gray-500">Loading...</p>
      </div>
    </div>
  );
}

// Higher-order component to require authentication
export function withAuth<P extends object>(
  WrappedComponent: ComponentType<P>,
  options: WithAuthOptions = {}
) {
  const { redirectTo = '/login' } = options;

  function AuthenticatedComponent(props: P) {
    const { data: session, status } = useSession();
    const router = useRouter();

    useEffect(() => {
      if (status === 'unauthenticated') {
        const callbackUrl = encodeURIComponent(window.location.pathname);
        router.push(`${redirectTo}?callbackUrl=${callbackUrl}`);
      }
    }, [status, router]);

    if (status === 'loading') {
      return <AuthLoading />;
    }

    if (status === 'unauthenticated') {
      return <AuthLoading />;
    }

    if (!session?.user) {
      return <AuthLoading />;
    }

    return <WrappedComponent {...props} />;
  }

  // Set display name for debugging
  const wrappedName = WrappedComponent.displayName || WrappedComponent.name || 'Component';
  AuthenticatedComponent.displayName = `withAuth(${wrappedName})`;

  return AuthenticatedComponent;
}
