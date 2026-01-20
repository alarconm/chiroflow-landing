'use client';

import { useSession } from 'next-auth/react';
import { useMemo } from 'react';
import type { Role } from '@prisma/client';
import type { AuthUser } from '@/lib/auth';
import {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  getPermissions,
  hasMinimumRole,
  type Action,
} from '@/lib/permissions';

type UsePermissionsReturn = {
  // Current user's role
  role: Role | null;
  // Current user's permissions
  permissions: Action[];
  // Check if user has a specific permission
  can: (action: Action) => boolean;
  // Check if user has any of the specified permissions
  canAny: (actions: Action[]) => boolean;
  // Check if user has all of the specified permissions
  canAll: (actions: Action[]) => boolean;
  // Check if user has at least a certain role level
  isAtLeast: (role: Role) => boolean;
  // Check if user has a specific role
  isRole: (role: Role) => boolean;
  // Loading state
  isLoading: boolean;
  // Whether user is authenticated
  isAuthenticated: boolean;
};

export function usePermissions(): UsePermissionsReturn {
  const { data: session, status } = useSession();

  const result = useMemo(() => {
    const isLoading = status === 'loading';
    const isAuthenticated = status === 'authenticated' && !!session?.user;
    const user = session?.user as AuthUser | undefined;
    const role = user?.role ?? null;
    const permissions = role ? getPermissions(role) : [];

    return {
      role,
      permissions,
      can: (action: Action) => (role ? hasPermission(role, action) : false),
      canAny: (actions: Action[]) => (role ? hasAnyPermission(role, actions) : false),
      canAll: (actions: Action[]) => (role ? hasAllPermissions(role, actions) : false),
      isAtLeast: (requiredRole: Role) => (role ? hasMinimumRole(role, requiredRole) : false),
      isRole: (checkRole: Role) => role === checkRole,
      isLoading,
      isAuthenticated,
    };
  }, [session, status]);

  return result;
}

// Hook to check a single permission
export function useCanDo(action: Action): boolean {
  const { can, isAuthenticated } = usePermissions();
  return isAuthenticated && can(action);
}

// Hook to check role level
export function useIsAtLeast(role: Role): boolean {
  const { isAtLeast, isAuthenticated } = usePermissions();
  return isAuthenticated && isAtLeast(role);
}

// Component to conditionally render based on permissions
type CanProps = {
  permission: Action | Action[];
  requireAll?: boolean;
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

export function Can({ permission, requireAll = false, children, fallback = null }: CanProps) {
  const { can, canAny, canAll, isLoading } = usePermissions();

  if (isLoading) {
    return null;
  }

  const permissions = Array.isArray(permission) ? permission : [permission];
  const hasAccess = requireAll ? canAll(permissions) : canAny(permissions);

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}

// Component to conditionally render based on role
type RequireRoleProps = {
  role: Role | Role[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

export function RequireRole({ role, children, fallback = null }: RequireRoleProps) {
  const { isRole, isLoading } = usePermissions();

  if (isLoading) {
    return null;
  }

  const roles = Array.isArray(role) ? role : [role];
  const hasAccess = roles.some((r) => isRole(r));

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}

// Component to conditionally render based on minimum role level
type RequireMinimumRoleProps = {
  role: Role;
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

export function RequireMinimumRole({ role, children, fallback = null }: RequireMinimumRoleProps) {
  const { isAtLeast, isLoading } = usePermissions();

  if (isLoading) {
    return null;
  }

  return isAtLeast(role) ? <>{children}</> : <>{fallback}</>;
}
