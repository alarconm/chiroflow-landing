import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog } from '@/lib/audit';
import { Role, Prisma } from '@prisma/client';

// Schema for assigning staff to a location
const assignStaffSchema = z.object({
  userId: z.string(),
  locationId: z.string(),
  isPrimary: z.boolean().default(false),
  roleOverride: z.nativeEnum(Role).optional().nullable(),
  canViewSchedule: z.boolean().default(true),
  canManageSchedule: z.boolean().default(false),
});

// Schema for updating staff assignment
const updateAssignmentSchema = z.object({
  id: z.string(),
  isPrimary: z.boolean().optional(),
  roleOverride: z.nativeEnum(Role).optional().nullable(),
  canViewSchedule: z.boolean().optional(),
  canManageSchedule: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

// Schema for bulk assignment (floating staff)
const bulkAssignSchema = z.object({
  userId: z.string(),
  locationIds: z.array(z.string()).min(1),
  primaryLocationId: z.string().optional(),
  roleOverride: z.nativeEnum(Role).optional().nullable(),
  canViewSchedule: z.boolean().default(true),
  canManageSchedule: z.boolean().default(false),
});

export const locationStaffRouter = router({
  // Assign a staff member to a location
  assign: adminProcedure
    .input(assignStaffSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify user exists and belongs to organization
      const user = await ctx.prisma.user.findFirst({
        where: {
          id: input.userId,
          organizationId: ctx.user.organizationId,
          isActive: true,
        },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found or not active',
        });
      }

      // Verify location exists and belongs to organization
      const location = await ctx.prisma.location.findFirst({
        where: {
          id: input.locationId,
          organizationId: ctx.user.organizationId,
          isActive: true,
          deletedAt: null,
        },
      });

      if (!location) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Location not found or not active',
        });
      }

      // Check for existing assignment
      const existingAssignment = await ctx.prisma.locationStaff.findUnique({
        where: {
          userId_locationId: {
            userId: input.userId,
            locationId: input.locationId,
          },
        },
      });

      if (existingAssignment) {
        // If it was inactive, reactivate it
        if (!existingAssignment.isActive) {
          const reactivated = await ctx.prisma.locationStaff.update({
            where: { id: existingAssignment.id },
            data: {
              isActive: true,
              isPrimary: input.isPrimary,
              roleOverride: input.roleOverride,
              canViewSchedule: input.canViewSchedule,
              canManageSchedule: input.canManageSchedule,
            },
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  role: true,
                },
              },
              location: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                },
              },
            },
          });

          await auditLog('LOCATION_STAFF_ASSIGN', 'LocationStaff', {
            entityId: reactivated.id,
            changes: { reactivated: true, ...input },
            userId: ctx.user.id,
            organizationId: ctx.user.organizationId,
          });

          return reactivated;
        }

        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Staff member is already assigned to this location',
        });
      }

      // If setting as primary, unset any existing primary for this user
      if (input.isPrimary) {
        await ctx.prisma.locationStaff.updateMany({
          where: {
            userId: input.userId,
            isPrimary: true,
          },
          data: { isPrimary: false },
        });
      }

      // Create the assignment
      const assignment = await ctx.prisma.locationStaff.create({
        data: {
          userId: input.userId,
          locationId: input.locationId,
          isPrimary: input.isPrimary,
          roleOverride: input.roleOverride,
          canViewSchedule: input.canViewSchedule,
          canManageSchedule: input.canManageSchedule,
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            },
          },
          location: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      });

      await auditLog('LOCATION_STAFF_ASSIGN', 'LocationStaff', {
        entityId: assignment.id,
        changes: { assigned: input },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return assignment;
    }),

  // Remove a staff member from a location (soft delete)
  remove: adminProcedure
    .input(z.object({
      id: z.string().optional(),
      userId: z.string().optional(),
      locationId: z.string().optional(),
    }).refine(
      (data) => data.id || (data.userId && data.locationId),
      { message: 'Provide either id or both userId and locationId' }
    ))
    .mutation(async ({ ctx, input }) => {
      let assignment;

      if (input.id) {
        assignment = await ctx.prisma.locationStaff.findFirst({
          where: {
            id: input.id,
            location: { organizationId: ctx.user.organizationId },
          },
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
            location: { select: { id: true, name: true, code: true } },
          },
        });
      } else {
        assignment = await ctx.prisma.locationStaff.findFirst({
          where: {
            userId: input.userId!,
            locationId: input.locationId!,
            location: { organizationId: ctx.user.organizationId },
          },
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
            location: { select: { id: true, name: true, code: true } },
          },
        });
      }

      if (!assignment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Staff assignment not found',
        });
      }

      // Soft delete by setting isActive to false
      const removed = await ctx.prisma.locationStaff.update({
        where: { id: assignment.id },
        data: { isActive: false },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          location: { select: { id: true, name: true, code: true } },
        },
      });

      await auditLog('LOCATION_STAFF_REMOVE', 'LocationStaff', {
        entityId: assignment.id,
        changes: {
          removed: true,
          userId: assignment.user.id,
          locationId: assignment.location.id,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return removed;
    }),

  // List staff at a location
  list: protectedProcedure
    .input(z.object({
      locationId: z.string(),
      includeInactive: z.boolean().default(false),
    }))
    .query(async ({ ctx, input }) => {
      // Verify location belongs to organization
      const location = await ctx.prisma.location.findFirst({
        where: {
          id: input.locationId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!location) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Location not found',
        });
      }

      const where: Prisma.LocationStaffWhereInput = {
        locationId: input.locationId,
      };

      if (!input.includeInactive) {
        where.isActive = true;
      }

      const staff = await ctx.prisma.locationStaff.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
              isActive: true,
              provider: {
                select: {
                  id: true,
                  npi: true,
                  specialty: true,
                },
              },
            },
          },
        },
        orderBy: [
          { isPrimary: 'desc' },
          { user: { lastName: 'asc' } },
        ],
      });

      return staff;
    }),

  // List locations for a staff member
  listByUser: protectedProcedure
    .input(z.object({
      userId: z.string().optional(),
      includeInactive: z.boolean().default(false),
    }))
    .query(async ({ ctx, input }) => {
      // If no userId provided, use current user
      const targetUserId = input.userId || ctx.user.id;

      // If looking up another user, verify they belong to same organization
      if (input.userId && input.userId !== ctx.user.id) {
        const user = await ctx.prisma.user.findFirst({
          where: {
            id: input.userId,
            organizationId: ctx.user.organizationId,
          },
        });

        if (!user) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'User not found',
          });
        }
      }

      const where: Prisma.LocationStaffWhereInput = {
        userId: targetUserId,
        location: {
          organizationId: ctx.user.organizationId,
          deletedAt: null,
        },
      };

      if (!input.includeInactive) {
        where.isActive = true;
        where.location = {
          ...where.location as Prisma.LocationWhereInput,
          isActive: true,
        };
      }

      const assignments = await ctx.prisma.locationStaff.findMany({
        where,
        include: {
          location: {
            select: {
              id: true,
              name: true,
              code: true,
              addressLine1: true,
              city: true,
              state: true,
              phone: true,
              timezone: true,
              isPrimary: true,
              isActive: true,
            },
          },
        },
        orderBy: [
          { isPrimary: 'desc' },
          { location: { name: 'asc' } },
        ],
      });

      return assignments;
    }),

  // Update a staff assignment
  update: adminProcedure
    .input(updateAssignmentSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      // Verify assignment exists and belongs to organization
      const existing = await ctx.prisma.locationStaff.findFirst({
        where: {
          id,
          location: { organizationId: ctx.user.organizationId },
        },
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Staff assignment not found',
        });
      }

      // If setting as primary, unset any existing primary for this user
      if (updateData.isPrimary && !existing.isPrimary) {
        await ctx.prisma.locationStaff.updateMany({
          where: {
            userId: existing.userId,
            isPrimary: true,
            id: { not: id },
          },
          data: { isPrimary: false },
        });
      }

      const updated = await ctx.prisma.locationStaff.update({
        where: { id },
        data: updateData,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            },
          },
          location: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      });

      await auditLog('LOCATION_STAFF_ASSIGN', 'LocationStaff', {
        entityId: id,
        changes: { before: existing, after: updateData },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  // Bulk assign a staff member to multiple locations (for floating staff)
  bulkAssign: adminProcedure
    .input(bulkAssignSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify user exists and belongs to organization
      const user = await ctx.prisma.user.findFirst({
        where: {
          id: input.userId,
          organizationId: ctx.user.organizationId,
          isActive: true,
        },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found or not active',
        });
      }

      // Verify all locations exist and belong to organization
      const locations = await ctx.prisma.location.findMany({
        where: {
          id: { in: input.locationIds },
          organizationId: ctx.user.organizationId,
          isActive: true,
          deletedAt: null,
        },
      });

      if (locations.length !== input.locationIds.length) {
        const foundIds = locations.map(l => l.id);
        const missingIds = input.locationIds.filter(id => !foundIds.includes(id));
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Locations not found: ${missingIds.join(', ')}`,
        });
      }

      // Validate primary location is in the list
      if (input.primaryLocationId && !input.locationIds.includes(input.primaryLocationId)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Primary location must be in the location list',
        });
      }

      // Use transaction for atomicity
      const assignments = await ctx.prisma.$transaction(async (tx) => {
        // First, deactivate any existing assignments not in the new list
        await tx.locationStaff.updateMany({
          where: {
            userId: input.userId,
            locationId: { notIn: input.locationIds },
            location: { organizationId: ctx.user.organizationId },
          },
          data: { isActive: false },
        });

        // Unset all primary flags for this user
        await tx.locationStaff.updateMany({
          where: {
            userId: input.userId,
            isPrimary: true,
          },
          data: { isPrimary: false },
        });

        // Create or update assignments for each location
        const results = [];
        for (const locationId of input.locationIds) {
          const isPrimary = locationId === input.primaryLocationId;

          const assignment = await tx.locationStaff.upsert({
            where: {
              userId_locationId: {
                userId: input.userId,
                locationId,
              },
            },
            update: {
              isActive: true,
              isPrimary,
              roleOverride: input.roleOverride,
              canViewSchedule: input.canViewSchedule,
              canManageSchedule: input.canManageSchedule,
            },
            create: {
              userId: input.userId,
              locationId,
              isPrimary,
              roleOverride: input.roleOverride,
              canViewSchedule: input.canViewSchedule,
              canManageSchedule: input.canManageSchedule,
            },
            include: {
              location: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                },
              },
            },
          });
          results.push(assignment);
        }

        return results;
      });

      await auditLog('LOCATION_STAFF_ASSIGN', 'LocationStaff', {
        entityId: input.userId,
        changes: {
          bulkAssign: true,
          locationIds: input.locationIds,
          primaryLocationId: input.primaryLocationId,
        },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return assignments;
    }),

  // Set primary location for a staff member
  setPrimary: adminProcedure
    .input(z.object({
      userId: z.string(),
      locationId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify assignment exists
      const assignment = await ctx.prisma.locationStaff.findFirst({
        where: {
          userId: input.userId,
          locationId: input.locationId,
          isActive: true,
          location: { organizationId: ctx.user.organizationId },
        },
      });

      if (!assignment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Staff assignment not found. Assign the staff member to this location first.',
        });
      }

      // Use transaction to ensure consistency
      const result = await ctx.prisma.$transaction(async (tx) => {
        // Unset any existing primary for this user
        await tx.locationStaff.updateMany({
          where: {
            userId: input.userId,
            isPrimary: true,
            id: { not: assignment.id },
          },
          data: { isPrimary: false },
        });

        // Set the new primary
        return tx.locationStaff.update({
          where: { id: assignment.id },
          data: { isPrimary: true },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            location: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        });
      });

      await auditLog('LOCATION_STAFF_ASSIGN', 'LocationStaff', {
        entityId: result.id,
        changes: { setPrimary: true, locationId: input.locationId },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return result;
    }),

  // Get staff member's primary location
  getPrimary: protectedProcedure
    .input(z.object({
      userId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const targetUserId = input.userId || ctx.user.id;

      // Verify user belongs to organization if looking up another user
      if (input.userId && input.userId !== ctx.user.id) {
        const user = await ctx.prisma.user.findFirst({
          where: {
            id: input.userId,
            organizationId: ctx.user.organizationId,
          },
        });

        if (!user) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'User not found',
          });
        }
      }

      const primary = await ctx.prisma.locationStaff.findFirst({
        where: {
          userId: targetUserId,
          isPrimary: true,
          isActive: true,
          location: {
            organizationId: ctx.user.organizationId,
            isActive: true,
            deletedAt: null,
          },
        },
        include: {
          location: true,
        },
      });

      // If no primary set, return the first active assignment
      if (!primary) {
        return ctx.prisma.locationStaff.findFirst({
          where: {
            userId: targetUserId,
            isActive: true,
            location: {
              organizationId: ctx.user.organizationId,
              isActive: true,
              deletedAt: null,
            },
          },
          include: {
            location: true,
          },
          orderBy: { createdAt: 'asc' },
        });
      }

      return primary;
    }),

  // Get locations a user can view schedules for
  getScheduleViewableLocations: protectedProcedure
    .input(z.object({
      userId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const targetUserId = input.userId || ctx.user.id;

      // Admins and owners can see all locations
      if (ctx.user.role === 'ADMIN' || ctx.user.role === 'OWNER') {
        return ctx.prisma.location.findMany({
          where: {
            organizationId: ctx.user.organizationId,
            isActive: true,
            deletedAt: null,
          },
          orderBy: [
            { isPrimary: 'desc' },
            { name: 'asc' },
          ],
        });
      }

      // For other users, return only assigned locations with canViewSchedule
      const assignments = await ctx.prisma.locationStaff.findMany({
        where: {
          userId: targetUserId,
          isActive: true,
          canViewSchedule: true,
          location: {
            organizationId: ctx.user.organizationId,
            isActive: true,
            deletedAt: null,
          },
        },
        include: {
          location: true,
        },
        orderBy: [
          { isPrimary: 'desc' },
          { location: { name: 'asc' } },
        ],
      });

      return assignments.map(a => a.location);
    }),

  // Get locations a user can manage schedules for
  getScheduleManageableLocations: protectedProcedure
    .input(z.object({
      userId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const targetUserId = input.userId || ctx.user.id;

      // Admins and owners can manage all locations
      if (ctx.user.role === 'ADMIN' || ctx.user.role === 'OWNER') {
        return ctx.prisma.location.findMany({
          where: {
            organizationId: ctx.user.organizationId,
            isActive: true,
            deletedAt: null,
          },
          orderBy: [
            { isPrimary: 'desc' },
            { name: 'asc' },
          ],
        });
      }

      // For other users, return only assigned locations with canManageSchedule
      const assignments = await ctx.prisma.locationStaff.findMany({
        where: {
          userId: targetUserId,
          isActive: true,
          canManageSchedule: true,
          location: {
            organizationId: ctx.user.organizationId,
            isActive: true,
            deletedAt: null,
          },
        },
        include: {
          location: true,
        },
        orderBy: [
          { isPrimary: 'desc' },
          { location: { name: 'asc' } },
        ],
      });

      return assignments.map(a => a.location);
    }),

  // Get effective role for a user at a specific location
  getEffectiveRole: protectedProcedure
    .input(z.object({
      userId: z.string().optional(),
      locationId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const targetUserId = input.userId || ctx.user.id;

      // Get user's base role
      const user = await ctx.prisma.user.findFirst({
        where: {
          id: targetUserId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Check for location-specific role override
      const assignment = await ctx.prisma.locationStaff.findFirst({
        where: {
          userId: targetUserId,
          locationId: input.locationId,
          isActive: true,
        },
      });

      // Return role override if exists, otherwise base role
      return {
        baseRole: user.role,
        effectiveRole: assignment?.roleOverride || user.role,
        hasOverride: !!assignment?.roleOverride,
        assignmentId: assignment?.id,
      };
    }),

  // Get all staff with their location counts
  listAllStaff: protectedProcedure
    .input(z.object({
      includeInactive: z.boolean().default(false),
    }).optional())
    .query(async ({ ctx, input }) => {
      const users = await ctx.prisma.user.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          isActive: input?.includeInactive ? undefined : true,
        },
        include: {
          locationAssignments: {
            where: input?.includeInactive ? {} : { isActive: true },
            include: {
              location: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                },
              },
            },
          },
          provider: {
            select: {
              id: true,
              npiNumber: true,
              specialty: true,
            },
          },
        },
        orderBy: [
          { lastName: 'asc' },
          { firstName: 'asc' },
        ],
      });

      return users.map(user => ({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        provider: user.provider,
        locationCount: user.locationAssignments.length,
        locations: user.locationAssignments.map(a => ({
          ...a.location,
          isPrimary: a.isPrimary,
          roleOverride: a.roleOverride,
        })),
        primaryLocation: user.locationAssignments.find(a => a.isPrimary)?.location || null,
      }));
    }),
});
