import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import bcrypt from 'bcryptjs';
import { auditLog } from '@/lib/audit';
import type { Role } from '@prisma/client';

const roleSchema = z.enum(['OWNER', 'ADMIN', 'PROVIDER', 'STAFF', 'BILLER']);

export const userRouter = router({
  // List all users in the organization
  list: protectedProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          role: roleSchema.optional(),
          isActive: z.boolean().optional(),
          limit: z.number().min(1).max(100).default(50),
          offset: z.number().min(0).default(0),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const { search, role, isActive, limit = 50, offset = 0 } = input ?? {};

      const where = {
        organizationId: ctx.user.organizationId,
        ...(search && {
          OR: [
            { email: { contains: search, mode: 'insensitive' as const } },
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName: { contains: search, mode: 'insensitive' as const } },
          ],
        }),
        ...(role && { role }),
        ...(isActive !== undefined && { isActive }),
      };

      const [users, total] = await Promise.all([
        ctx.prisma.user.findMany({
          where,
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
            lastLoginAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        ctx.prisma.user.count({ where }),
      ]);

      return {
        users,
        total,
        limit,
        offset,
        hasMore: offset + users.length < total,
      };
    }),

  // Get a single user by ID
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const user = await ctx.prisma.user.findFirst({
      where: {
        id: input.id,
        organizationId: ctx.user.organizationId,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    return user;
  }),

  // Create a new user (admin only)
  create: adminProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(8, 'Password must be at least 8 characters'),
        firstName: z.string().min(1, 'First name is required'),
        lastName: z.string().min(1, 'Last name is required'),
        role: roleSchema.default('STAFF'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check if email already exists in organization
      const existingUser = await ctx.prisma.user.findFirst({
        where: {
          email: input.email,
          organizationId: ctx.user.organizationId,
        },
      });

      if (existingUser) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'A user with this email already exists',
        });
      }

      // Prevent creating OWNER users (only one per org)
      if (input.role === 'OWNER') {
        const existingOwner = await ctx.prisma.user.findFirst({
          where: {
            organizationId: ctx.user.organizationId,
            role: 'OWNER',
          },
        });

        if (existingOwner) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Organization already has an owner',
          });
        }
      }

      // Hash password
      const passwordHash = await bcrypt.hash(input.password, 12);

      // Create user
      const user = await ctx.prisma.user.create({
        data: {
          email: input.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          role: input.role as Role,
          organizationId: ctx.user.organizationId,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      });

      // Log user creation
      await auditLog('USER_CREATE', 'User', {
        entityId: user.id,
        changes: { email: input.email, role: input.role },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return user;
    }),

  // Update a user (admin only)
  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        firstName: z.string().min(1).optional(),
        lastName: z.string().min(1).optional(),
        role: roleSchema.optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      // Get existing user
      const existingUser = await ctx.prisma.user.findFirst({
        where: {
          id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existingUser) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Prevent demoting the last owner
      if (existingUser.role === 'OWNER' && data.role && data.role !== 'OWNER') {
        const ownerCount = await ctx.prisma.user.count({
          where: {
            organizationId: ctx.user.organizationId,
            role: 'OWNER',
          },
        });

        if (ownerCount <= 1) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cannot demote the only owner',
          });
        }
      }

      // Update user
      const user = await ctx.prisma.user.update({
        where: { id },
        data: data as { firstName?: string; lastName?: string; role?: Role; isActive?: boolean },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          updatedAt: true,
        },
      });

      // Log user update
      await auditLog('USER_UPDATE', 'User', {
        entityId: user.id,
        changes: data,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      // Log role change specifically if role was changed
      if (data.role && data.role !== existingUser.role) {
        await auditLog('USER_ROLE_CHANGE', 'User', {
          entityId: user.id,
          changes: { from: existingUser.role, to: data.role },
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        });
      }

      return user;
    }),
});
