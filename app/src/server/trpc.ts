import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import type { Context } from './context';
import type { Role } from '@prisma/client';
import { hasPermission, hasMinimumRole, type Action } from '@/lib/permissions';

// Initialize tRPC with context
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape;
  },
});

// Export reusable router and procedure helpers
export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

// Middleware to check authentication
const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in to access this resource',
    });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user!,
      session: ctx.session,
    },
  });
});

// Protected procedure - requires authentication
export const protectedProcedure = t.procedure.use(isAuthed);

// Middleware to check for specific roles
const hasRoles = (roles: Role[]) =>
  t.middleware(({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'You must be logged in to access this resource',
      });
    }

    const userRole = ctx.user?.role;
    if (!userRole || !roles.includes(userRole)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You do not have permission to access this resource',
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user!,
        session: ctx.session,
      },
    });
  });

// Middleware to check for minimum role level
const hasMinRole = (minimumRole: Role) =>
  t.middleware(({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'You must be logged in to access this resource',
      });
    }

    const userRole = ctx.user?.role;
    if (!userRole || !hasMinimumRole(userRole, minimumRole)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You do not have permission to access this resource',
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user!,
        session: ctx.session,
      },
    });
  });

// Middleware to check for specific permissions
const hasPermissions = (permissions: Action[], requireAll = false) =>
  t.middleware(({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'You must be logged in to access this resource',
      });
    }

    const userRole = ctx.user?.role;
    if (!userRole) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You do not have permission to access this resource',
      });
    }

    const hasAccess = requireAll
      ? permissions.every((p) => hasPermission(userRole, p))
      : permissions.some((p) => hasPermission(userRole, p));

    if (!hasAccess) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You do not have permission to access this resource',
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user!,
        session: ctx.session,
      },
    });
  });

// Role-based procedures
export const adminProcedure = t.procedure.use(hasMinRole('ADMIN'));
export const ownerProcedure = t.procedure.use(hasRoles(['OWNER']));
export const providerProcedure = t.procedure.use(hasMinRole('PROVIDER'));

// Permission-based procedure factory
export const permissionProcedure = (permissions: Action[], requireAll = false) =>
  t.procedure.use(hasPermissions(permissions, requireAll));
