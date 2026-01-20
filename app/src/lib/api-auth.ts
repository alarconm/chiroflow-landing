import { NextRequest, NextResponse } from 'next/server';
import { auth } from './auth';
import type { Role } from '@prisma/client';
import type { AuthUser } from './auth';
import { hasPermission, hasMinimumRole, type Action } from './permissions';

// Response helpers
export function unauthorizedResponse(message = 'Unauthorized') {
  return NextResponse.json({ error: message, code: 'UNAUTHORIZED' }, { status: 401 });
}

export function forbiddenResponse(message = 'Forbidden') {
  return NextResponse.json({ error: message, code: 'FORBIDDEN' }, { status: 403 });
}

// Get the current authenticated user from request
export async function getAuthUser(req: NextRequest): Promise<AuthUser | null> {
  const session = await auth();
  if (!session?.user) {
    return null;
  }
  return session.user as AuthUser;
}

// Type for route handler with auth context
type AuthenticatedHandler<T = unknown> = (
  req: NextRequest,
  context: { user: AuthUser; params?: T }
) => Promise<NextResponse> | NextResponse;

// Wrapper to require authentication
export function withApiAuth<T = unknown>(handler: AuthenticatedHandler<T>) {
  return async (req: NextRequest, context?: { params?: T }): Promise<NextResponse> => {
    const user = await getAuthUser(req);

    if (!user) {
      return unauthorizedResponse('Authentication required');
    }

    return handler(req, { user, params: context?.params });
  };
}

// Options for role-based authorization
type ApiRoleOptions = {
  roles?: Role[];
  minimumRole?: Role;
  permissions?: Action[];
  requireAllPermissions?: boolean;
};

// Check if user passes role/permission requirements
function checkApiAccess(user: AuthUser, options: ApiRoleOptions): boolean {
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
      const hasAll = permissions.every((p) => hasPermission(user.role, p));
      if (!hasAll) return false;
    } else {
      const hasAny = permissions.some((p) => hasPermission(user.role, p));
      if (!hasAny) return false;
    }
  }

  return true;
}

// Wrapper to require specific roles/permissions
export function withApiRole<T = unknown>(handler: AuthenticatedHandler<T>, options: ApiRoleOptions) {
  return async (req: NextRequest, context?: { params?: T }): Promise<NextResponse> => {
    const user = await getAuthUser(req);

    if (!user) {
      return unauthorizedResponse('Authentication required');
    }

    if (!checkApiAccess(user, options)) {
      return forbiddenResponse('Insufficient permissions');
    }

    return handler(req, { user, params: context?.params });
  };
}

// Convenience wrappers for common requirements
export function withAdminApi<T = unknown>(handler: AuthenticatedHandler<T>) {
  return withApiRole(handler, { minimumRole: 'ADMIN' });
}

export function withOwnerApi<T = unknown>(handler: AuthenticatedHandler<T>) {
  return withApiRole(handler, { roles: ['OWNER'] });
}

export function withProviderApi<T = unknown>(handler: AuthenticatedHandler<T>) {
  return withApiRole(handler, { minimumRole: 'PROVIDER' });
}

export function withPermissionApi<T = unknown>(handler: AuthenticatedHandler<T>, permission: Action) {
  return withApiRole(handler, { permissions: [permission] });
}

// Wrapper to require tenant context
export function withTenantApi<T = unknown>(handler: AuthenticatedHandler<T>) {
  return async (req: NextRequest, context?: { params?: T }): Promise<NextResponse> => {
    const user = await getAuthUser(req);

    if (!user) {
      return unauthorizedResponse('Authentication required');
    }

    if (!user.organizationId) {
      return forbiddenResponse('Tenant context required');
    }

    return handler(req, { user, params: context?.params });
  };
}
