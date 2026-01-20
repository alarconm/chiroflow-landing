'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, type ComponentType } from 'react';
import type { Role } from '@prisma/client';
import type { AuthUser } from '@/lib/auth';
import { hasMinimumRole, hasPermission, type Action } from '@/lib/permissions';

type WithRoleOptions = {
  // Require one of these roles
  roles?: Role[];
  // Require at least this role level
  minimumRole?: Role;
  // Require these permissions
  permissions?: Action[];
  // Require all permissions (true) or any permission (false)
  requireAllPermissions?: boolean;
  // Redirect to this page if unauthorized
  unauthorizedRedirect?: string;
  // Redirect to this page if not authenticated
  loginRedirect?: string;
};

// Unauthorized component
function Unauthorized() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-4">🚫</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
        <p className="text-gray-600 mb-6">
          You don&apos;t have permission to access this page. Please contact your administrator if
          you believe this is an error.
        </p>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
        >
          Go Back
        </button>
      </div>
    </div>
  );
}

// Loading component
function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto"></div>
        <p className="mt-4 text-gray-500">Checking permissions...</p>
      </div>
    </div>
  );
}

// Check if user has required access
function checkAccess(user: AuthUser, options: WithRoleOptions): boolean {
  const { roles, minimumRole, permissions, requireAllPermissions = false } = options;

  // Check specific roles
  if (roles && roles.length > 0) {
    if (!roles.includes(user.role)) {
      return false;
    }
  }

  // Check minimum role level
  if (minimumRole) {
    if (!hasMinimumRole(user.role, minimumRole)) {
      return false;
    }
  }

  // Check permissions
  if (permissions && permissions.length > 0) {
    if (requireAllPermissions) {
      // User must have ALL permissions
      const hasAll = permissions.every((p) => hasPermission(user.role, p));
      if (!hasAll) {
        return false;
      }
    } else {
      // User must have ANY permission
      const hasAny = permissions.some((p) => hasPermission(user.role, p));
      if (!hasAny) {
        return false;
      }
    }
  }

  return true;
}

// Higher-order component to require specific roles
export function withRole<P extends object>(
  WrappedComponent: ComponentType<P>,
  options: WithRoleOptions
) {
  const { unauthorizedRedirect, loginRedirect = '/login' } = options;

  function RoleProtectedComponent(props: P) {
    const { data: session, status } = useSession();
    const router = useRouter();

    useEffect(() => {
      if (status === 'unauthenticated') {
        const callbackUrl = encodeURIComponent(window.location.pathname);
        router.push(`${loginRedirect}?callbackUrl=${callbackUrl}`);
      }
    }, [status, router]);

    // Still loading
    if (status === 'loading') {
      return <Loading />;
    }

    // Not authenticated
    if (status === 'unauthenticated' || !session?.user) {
      return <Loading />;
    }

    // Check access
    const user = session.user as AuthUser;
    const hasAccess = checkAccess(user, options);

    if (!hasAccess) {
      if (unauthorizedRedirect) {
        router.push(unauthorizedRedirect);
        return <Loading />;
      }
      return <Unauthorized />;
    }

    return <WrappedComponent {...props} />;
  }

  // Set display name for debugging
  const wrappedName = WrappedComponent.displayName || WrappedComponent.name || 'Component';
  RoleProtectedComponent.displayName = `withRole(${wrappedName})`;

  return RoleProtectedComponent;
}

// Convenience HOCs for common role requirements
export function withAdminRole<P extends object>(WrappedComponent: ComponentType<P>) {
  return withRole(WrappedComponent, { minimumRole: 'ADMIN' });
}

export function withOwnerRole<P extends object>(WrappedComponent: ComponentType<P>) {
  return withRole(WrappedComponent, { roles: ['OWNER'] });
}

export function withProviderRole<P extends object>(WrappedComponent: ComponentType<P>) {
  return withRole(WrappedComponent, { minimumRole: 'PROVIDER' });
}

export function withBillingAccess<P extends object>(WrappedComponent: ComponentType<P>) {
  return withRole(WrappedComponent, {
    permissions: ['billing:read', 'billing:create'],
  });
}
