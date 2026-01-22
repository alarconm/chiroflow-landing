import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { auditLog, getRequestMetadata } from '@/lib/audit';
import type { PrismaClient, SecurityEventType, Role, Prisma, PermissionType, AccessRequestStatus } from '@prisma/client';

// ============================================
// Helper Functions
// ============================================

// Log security events for access control
async function logAccessControlEvent(
  prisma: PrismaClient,
  eventType: SecurityEventType,
  userId: string | null,
  organizationId: string,
  success: boolean,
  metadata?: Record<string, unknown>
) {
  const { ipAddress, userAgent } = await getRequestMetadata();

  await prisma.securityEvent.create({
    data: {
      eventType,
      userId,
      organizationId,
      ipAddress,
      userAgent,
      success,
      metadata: (metadata ?? {}) as Prisma.InputJsonValue,
      severity: success ? 'INFO' : 'WARNING',
    },
  });
}

// Check if IP is within allowed range (supports CIDR notation)
function isIpInRange(ip: string, ranges: string[]): boolean {
  if (!ip || ranges.length === 0) return false;

  for (const range of ranges) {
    // Exact match
    if (range === ip) return true;

    // CIDR notation (simple check for /24, /16, /8)
    if (range.includes('/')) {
      const [rangeIp, cidr] = range.split('/');
      const cidrNum = parseInt(cidr, 10);
      const ipParts = ip.split('.').map(Number);
      const rangeParts = rangeIp.split('.').map(Number);

      if (cidrNum === 24) {
        // /24 = first 3 octets match
        if (ipParts[0] === rangeParts[0] && ipParts[1] === rangeParts[1] && ipParts[2] === rangeParts[2]) {
          return true;
        }
      } else if (cidrNum === 16) {
        // /16 = first 2 octets match
        if (ipParts[0] === rangeParts[0] && ipParts[1] === rangeParts[1]) {
          return true;
        }
      } else if (cidrNum === 8) {
        // /8 = first octet matches
        if (ipParts[0] === rangeParts[0]) {
          return true;
        }
      }
    }

    // Wildcard notation (192.168.1.*)
    if (range.includes('*')) {
      const pattern = range.replace(/\./g, '\\.').replace(/\*/g, '\\d+');
      const regex = new RegExp(`^${pattern}$`);
      if (regex.test(ip)) return true;
    }
  }

  return false;
}

// Check if current time is within access hours
function isWithinAccessHours(
  settings: {
    accessHoursEnabled: boolean;
    accessHoursStart: string | null;
    accessHoursEnd: string | null;
    accessHoursTimezone: string | null;
    accessHoursDays: number[];
  }
): { allowed: boolean; reason?: string } {
  if (!settings.accessHoursEnabled) {
    return { allowed: true };
  }

  if (!settings.accessHoursStart || !settings.accessHoursEnd) {
    return { allowed: true };
  }

  const now = new Date();
  const timezone = settings.accessHoursTimezone || 'UTC';

  // Get current time in the specified timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });

  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  const currentTime = hour * 60 + minute;

  // Parse start and end times
  const [startHour, startMin] = settings.accessHoursStart.split(':').map(Number);
  const [endHour, endMin] = settings.accessHoursEnd.split(':').map(Number);
  const startTime = startHour * 60 + startMin;
  const endTime = endHour * 60 + endMin;

  // Check day of week
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  if (settings.accessHoursDays.length > 0 && !settings.accessHoursDays.includes(dayOfWeek)) {
    return {
      allowed: false,
      reason: `Access is not allowed on this day of the week. Allowed days: ${settings.accessHoursDays.join(', ')}`,
    };
  }

  // Check time range
  if (currentTime < startTime || currentTime > endTime) {
    return {
      allowed: false,
      reason: `Access is only allowed between ${settings.accessHoursStart} and ${settings.accessHoursEnd} (${timezone})`,
    };
  }

  return { allowed: true };
}

// Default role hierarchy (OWNER > ADMIN > PROVIDER > STAFF, BILLER)
const DEFAULT_ROLE_HIERARCHY: Record<Role, Role[]> = {
  OWNER: ['ADMIN', 'PROVIDER', 'STAFF', 'BILLER'],
  ADMIN: ['PROVIDER', 'STAFF', 'BILLER'],
  PROVIDER: ['STAFF'],
  STAFF: [],
  BILLER: [],
};

// Get effective permissions for a role (including inherited)
async function getEffectiveRoles(
  prisma: PrismaClient,
  role: Role,
  organizationId: string
): Promise<Role[]> {
  const roles = new Set<Role>([role]);

  // Get custom inheritance rules
  const inheritances = await prisma.roleInheritance.findMany({
    where: {
      organizationId,
      parentRole: role,
      isActive: true,
    },
  });

  // Add inherited roles from custom rules
  for (const inheritance of inheritances) {
    roles.add(inheritance.childRole);
    // Recursively get inherited roles
    const childRoles = await getEffectiveRoles(prisma, inheritance.childRole, organizationId);
    childRoles.forEach(r => roles.add(r));
  }

  // Also add default hierarchy
  const defaultInherited = DEFAULT_ROLE_HIERARCHY[role] || [];
  defaultInherited.forEach(r => roles.add(r));

  return Array.from(roles);
}

export const accessControlRouter = router({
  // ============================================
  // IP Whitelist/Blacklist Management
  // ============================================

  // Get current IP settings
  getIpSettings: adminProcedure.query(async ({ ctx }) => {
    const settings = await ctx.prisma.securitySetting.findUnique({
      where: { organizationId: ctx.user.organizationId },
    });

    return {
      ipWhitelistEnabled: settings?.ipWhitelistEnabled ?? false,
      ipWhitelist: settings?.ipWhitelist ?? [],
      ipBlacklist: settings?.ipBlacklist ?? [],
    };
  }),

  // Update IP whitelist/blacklist settings
  updateIpSettings: adminProcedure
    .input(
      z.object({
        ipWhitelistEnabled: z.boolean().optional(),
        ipWhitelist: z.array(z.string()).optional(),
        ipBlacklist: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const settings = await ctx.prisma.securitySetting.upsert({
        where: { organizationId: ctx.user.organizationId },
        update: {
          ...(input.ipWhitelistEnabled !== undefined && { ipWhitelistEnabled: input.ipWhitelistEnabled }),
          ...(input.ipWhitelist !== undefined && { ipWhitelist: input.ipWhitelist }),
          ...(input.ipBlacklist !== undefined && { ipBlacklist: input.ipBlacklist }),
        },
        create: {
          organizationId: ctx.user.organizationId,
          ...(input.ipWhitelistEnabled !== undefined && { ipWhitelistEnabled: input.ipWhitelistEnabled }),
          ipWhitelist: input.ipWhitelist ?? [],
          ipBlacklist: input.ipBlacklist ?? [],
        },
      });

      await auditLog('UPDATE', 'SecuritySetting', {
        entityId: settings.id,
        changes: input,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      await logAccessControlEvent(ctx.prisma, 'CONFIG_CHANGED', ctx.user.id, ctx.user.organizationId, true, {
        action: 'update_ip_settings',
        changes: input,
      });

      return settings;
    }),

  // Check if an IP is allowed
  checkIpAccess: protectedProcedure
    .input(z.object({ ip: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const { ipAddress } = await getRequestMetadata();
      const ip = input.ip || ipAddress || '';

      const settings = await ctx.prisma.securitySetting.findUnique({
        where: { organizationId: ctx.user.organizationId },
      });

      if (!settings) {
        return { allowed: true, reason: 'No IP restrictions configured' };
      }

      // Check blacklist first
      if (settings.ipBlacklist.length > 0 && isIpInRange(ip, settings.ipBlacklist)) {
        return { allowed: false, reason: 'IP address is blacklisted' };
      }

      // Check whitelist if enabled
      if (settings.ipWhitelistEnabled && settings.ipWhitelist.length > 0) {
        if (!isIpInRange(ip, settings.ipWhitelist)) {
          return { allowed: false, reason: 'IP address is not in whitelist' };
        }
      }

      return { allowed: true };
    }),

  // ============================================
  // Time-Based Access Restrictions
  // ============================================

  // Get current time-based access settings
  getTimeAccessSettings: adminProcedure.query(async ({ ctx }) => {
    const settings = await ctx.prisma.securitySetting.findUnique({
      where: { organizationId: ctx.user.organizationId },
    });

    return {
      accessHoursEnabled: settings?.accessHoursEnabled ?? false,
      accessHoursStart: settings?.accessHoursStart ?? null,
      accessHoursEnd: settings?.accessHoursEnd ?? null,
      accessHoursTimezone: settings?.accessHoursTimezone ?? 'America/Los_Angeles',
      accessHoursDays: settings?.accessHoursDays ?? [1, 2, 3, 4, 5], // Mon-Fri default
    };
  }),

  // Update time-based access settings
  updateTimeAccessSettings: adminProcedure
    .input(
      z.object({
        accessHoursEnabled: z.boolean().optional(),
        accessHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
        accessHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
        accessHoursTimezone: z.string().optional(),
        accessHoursDays: z.array(z.number().min(0).max(6)).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const settings = await ctx.prisma.securitySetting.upsert({
        where: { organizationId: ctx.user.organizationId },
        update: {
          ...(input.accessHoursEnabled !== undefined && { accessHoursEnabled: input.accessHoursEnabled }),
          ...(input.accessHoursStart !== undefined && { accessHoursStart: input.accessHoursStart }),
          ...(input.accessHoursEnd !== undefined && { accessHoursEnd: input.accessHoursEnd }),
          ...(input.accessHoursTimezone !== undefined && { accessHoursTimezone: input.accessHoursTimezone }),
          ...(input.accessHoursDays !== undefined && { accessHoursDays: input.accessHoursDays }),
        },
        create: {
          organizationId: ctx.user.organizationId,
          accessHoursEnabled: input.accessHoursEnabled ?? false,
          accessHoursStart: input.accessHoursStart ?? '08:00',
          accessHoursEnd: input.accessHoursEnd ?? '18:00',
          accessHoursTimezone: input.accessHoursTimezone ?? 'America/Los_Angeles',
          accessHoursDays: input.accessHoursDays ?? [1, 2, 3, 4, 5],
        },
      });

      await auditLog('UPDATE', 'SecuritySetting', {
        entityId: settings.id,
        changes: input,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      await logAccessControlEvent(ctx.prisma, 'CONFIG_CHANGED', ctx.user.id, ctx.user.organizationId, true, {
        action: 'update_time_access_settings',
        changes: input,
      });

      return settings;
    }),

  // Check if current time allows access
  checkTimeAccess: protectedProcedure.query(async ({ ctx }) => {
    const settings = await ctx.prisma.securitySetting.findUnique({
      where: { organizationId: ctx.user.organizationId },
    });

    if (!settings) {
      return { allowed: true, reason: 'No time restrictions configured' };
    }

    return isWithinAccessHours(settings);
  }),

  // ============================================
  // Emergency Access (Break Glass)
  // ============================================

  // Get emergency access settings
  getEmergencyAccessSettings: adminProcedure.query(async ({ ctx }) => {
    const settings = await ctx.prisma.securitySetting.findUnique({
      where: { organizationId: ctx.user.organizationId },
    });

    return {
      emergencyAccessEnabled: settings?.emergencyAccessEnabled ?? true,
      emergencyAccessCodeSet: !!settings?.emergencyAccessCode,
      emergencyAccessNotifyEmails: settings?.emergencyAccessNotifyEmails ?? [],
    };
  }),

  // Configure emergency access
  configureEmergencyAccess: adminProcedure
    .input(
      z.object({
        emergencyAccessEnabled: z.boolean().optional(),
        emergencyAccessCode: z.string().min(8).optional(),
        emergencyAccessNotifyEmails: z.array(z.string().email()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Hash the emergency access code if provided
      let hashedCode: string | undefined;
      if (input.emergencyAccessCode) {
        const crypto = await import('crypto');
        hashedCode = crypto.createHash('sha256').update(input.emergencyAccessCode).digest('hex');
      }

      const settings = await ctx.prisma.securitySetting.upsert({
        where: { organizationId: ctx.user.organizationId },
        update: {
          ...(input.emergencyAccessEnabled !== undefined && { emergencyAccessEnabled: input.emergencyAccessEnabled }),
          ...(hashedCode && { emergencyAccessCode: hashedCode }),
          ...(input.emergencyAccessNotifyEmails !== undefined && { emergencyAccessNotifyEmails: input.emergencyAccessNotifyEmails }),
        },
        create: {
          organizationId: ctx.user.organizationId,
          emergencyAccessEnabled: input.emergencyAccessEnabled ?? true,
          emergencyAccessCode: hashedCode ?? null,
          emergencyAccessNotifyEmails: input.emergencyAccessNotifyEmails ?? [],
        },
      });

      await auditLog('UPDATE', 'SecuritySetting', {
        entityId: settings.id,
        changes: { emergencyAccessEnabled: input.emergencyAccessEnabled, notifyEmails: input.emergencyAccessNotifyEmails },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      await logAccessControlEvent(ctx.prisma, 'CONFIG_CHANGED', ctx.user.id, ctx.user.organizationId, true, {
        action: 'configure_emergency_access',
      });

      return {
        emergencyAccessEnabled: settings.emergencyAccessEnabled,
        emergencyAccessCodeSet: !!settings.emergencyAccessCode,
        emergencyAccessNotifyEmails: settings.emergencyAccessNotifyEmails,
      };
    }),

  // Use emergency access (break glass)
  useEmergencyAccess: protectedProcedure
    .input(
      z.object({
        emergencyCode: z.string(),
        reason: z.string().min(10, 'Reason must be at least 10 characters'),
        resourceAccessed: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const settings = await ctx.prisma.securitySetting.findUnique({
        where: { organizationId: ctx.user.organizationId },
      });

      if (!settings?.emergencyAccessEnabled) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Emergency access is not enabled for this organization',
        });
      }

      if (!settings.emergencyAccessCode) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No emergency access code has been configured',
        });
      }

      // Verify the emergency code
      const crypto = await import('crypto');
      const hashedInput = crypto.createHash('sha256').update(input.emergencyCode).digest('hex');

      if (hashedInput !== settings.emergencyAccessCode) {
        await logAccessControlEvent(ctx.prisma, 'EMERGENCY_ACCESS_USED', ctx.user.id, ctx.user.organizationId, false, {
          reason: input.reason,
          error: 'Invalid emergency code',
        });

        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid emergency access code',
        });
      }

      const { ipAddress, userAgent } = await getRequestMetadata();

      // Create emergency access log
      const emergencyLog = await ctx.prisma.emergencyAccessLog.create({
        data: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
          reason: input.reason,
          resourceAccessed: input.resourceAccessed,
          ipAddress,
          userAgent,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
          notificationsSent: false,
          notifiedEmails: settings.emergencyAccessNotifyEmails,
        },
      });

      await logAccessControlEvent(ctx.prisma, 'EMERGENCY_ACCESS_USED', ctx.user.id, ctx.user.organizationId, true, {
        emergencyAccessLogId: emergencyLog.id,
        reason: input.reason,
        resourceAccessed: input.resourceAccessed,
      });

      // In production, send notification emails here
      // For now, mark as sent
      await ctx.prisma.emergencyAccessLog.update({
        where: { id: emergencyLog.id },
        data: { notificationsSent: true },
      });

      return {
        granted: true,
        expiresAt: emergencyLog.expiresAt,
        emergencyAccessLogId: emergencyLog.id,
      };
    }),

  // List emergency access logs
  listEmergencyAccessLogs: adminProcedure
    .input(
      z.object({
        userId: z.string().optional(),
        from: z.date().optional(),
        to: z.date().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.EmergencyAccessLogWhereInput = {
        organizationId: ctx.user.organizationId,
        ...(input.userId && { userId: input.userId }),
        ...(input.from || input.to
          ? {
              accessedAt: {
                ...(input.from && { gte: input.from }),
                ...(input.to && { lte: input.to }),
              },
            }
          : {}),
      };

      const [logs, total] = await Promise.all([
        ctx.prisma.emergencyAccessLog.findMany({
          where,
          include: {
            user: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
          },
          orderBy: { accessedAt: 'desc' },
          take: input.limit,
          skip: input.offset,
        }),
        ctx.prisma.emergencyAccessLog.count({ where }),
      ]);

      return { logs, total };
    }),

  // Revoke emergency access
  revokeEmergencyAccess: adminProcedure
    .input(z.object({ emergencyAccessLogId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const log = await ctx.prisma.emergencyAccessLog.findFirst({
        where: {
          id: input.emergencyAccessLogId,
          organizationId: ctx.user.organizationId,
          revokedAt: null,
        },
      });

      if (!log) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Emergency access log not found or already revoked',
        });
      }

      const updated = await ctx.prisma.emergencyAccessLog.update({
        where: { id: input.emergencyAccessLogId },
        data: {
          revokedAt: new Date(),
          revokedBy: ctx.user.id,
        },
      });

      await logAccessControlEvent(ctx.prisma, 'EMERGENCY_ACCESS_USED', ctx.user.id, ctx.user.organizationId, true, {
        action: 'revoke',
        emergencyAccessLogId: input.emergencyAccessLogId,
        targetUserId: log.userId,
      });

      return updated;
    }),

  // ============================================
  // Granular Permission Management
  // ============================================

  // Grant a specific permission to a user
  grantPermission: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        permissionType: z.enum(['PATIENT_ACCESS', 'PHI_ACCESS', 'BILLING_ACCESS', 'ADMIN_ACCESS', 'LOCATION_ACCESS', 'REPORT_ACCESS', 'ROLE_ELEVATION', 'EMERGENCY_ACCESS']),
        resourceType: z.string().optional(),
        resourceId: z.string().optional(),
        validFrom: z.date().optional(),
        validUntil: z.date().optional(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify user exists in organization
      const targetUser = await ctx.prisma.user.findFirst({
        where: {
          id: input.userId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!targetUser) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found in organization',
        });
      }

      // Check for existing active permission
      const existing = await ctx.prisma.permissionGrant.findFirst({
        where: {
          userId: input.userId,
          organizationId: ctx.user.organizationId,
          permissionType: input.permissionType as PermissionType,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          revokedAt: null,
          OR: [
            { validUntil: null },
            { validUntil: { gt: new Date() } },
          ],
        },
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'An active permission grant already exists for this user and permission type',
        });
      }

      const permission = await ctx.prisma.permissionGrant.create({
        data: {
          userId: input.userId,
          organizationId: ctx.user.organizationId,
          permissionType: input.permissionType as PermissionType,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          validFrom: input.validFrom ?? new Date(),
          validUntil: input.validUntil,
          grantedBy: ctx.user.id,
          reason: input.reason,
        },
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      });

      await auditLog('CREATE', 'PermissionGrant', {
        entityId: permission.id,
        changes: input,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      await logAccessControlEvent(ctx.prisma, 'PERMISSION_GRANTED', ctx.user.id, ctx.user.organizationId, true, {
        targetUserId: input.userId,
        permissionType: input.permissionType,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
      });

      return permission;
    }),

  // Revoke a permission
  revokePermission: adminProcedure
    .input(
      z.object({
        permissionId: z.string(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const permission = await ctx.prisma.permissionGrant.findFirst({
        where: {
          id: input.permissionId,
          organizationId: ctx.user.organizationId,
          revokedAt: null,
        },
      });

      if (!permission) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Permission grant not found or already revoked',
        });
      }

      const updated = await ctx.prisma.permissionGrant.update({
        where: { id: input.permissionId },
        data: {
          revokedAt: new Date(),
          revokedBy: ctx.user.id,
          revokeReason: input.reason,
        },
      });

      await auditLog('UPDATE', 'PermissionGrant', {
        entityId: permission.id,
        changes: { revokedAt: new Date(), revokedBy: ctx.user.id },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      await logAccessControlEvent(ctx.prisma, 'PERMISSION_REVOKED', ctx.user.id, ctx.user.organizationId, true, {
        targetUserId: permission.userId,
        permissionType: permission.permissionType,
        reason: input.reason,
      });

      return updated;
    }),

  // List permissions for a user
  listUserPermissions: protectedProcedure
    .input(
      z.object({
        userId: z.string().optional(), // If not provided, returns own permissions
        includeExpired: z.boolean().default(false),
        includeRevoked: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const targetUserId = input.userId || ctx.user.id;

      // Non-admins can only view their own permissions
      if (input.userId && input.userId !== ctx.user.id && ctx.user.role !== 'ADMIN' && ctx.user.role !== 'OWNER') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only view your own permissions',
        });
      }

      const where: Prisma.PermissionGrantWhereInput = {
        userId: targetUserId,
        organizationId: ctx.user.organizationId,
        ...(!input.includeRevoked && { revokedAt: null }),
        ...(!input.includeExpired && {
          OR: [
            { validUntil: null },
            { validUntil: { gt: new Date() } },
          ],
        }),
      };

      const permissions = await ctx.prisma.permissionGrant.findMany({
        where,
        include: {
          grantedByUser: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          revokedByUser: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
        orderBy: { grantedAt: 'desc' },
      });

      return permissions;
    }),

  // Check if user has a specific permission
  checkPermission: protectedProcedure
    .input(
      z.object({
        permissionType: z.enum(['PATIENT_ACCESS', 'PHI_ACCESS', 'BILLING_ACCESS', 'ADMIN_ACCESS', 'LOCATION_ACCESS', 'REPORT_ACCESS', 'ROLE_ELEVATION', 'EMERGENCY_ACCESS']),
        resourceType: z.string().optional(),
        resourceId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Check role-based permissions first
      const roleAllows =
        (ctx.user.role === 'OWNER' || ctx.user.role === 'ADMIN') ||
        (input.permissionType === 'PATIENT_ACCESS' && ctx.user.role === 'PROVIDER') ||
        (input.permissionType === 'BILLING_ACCESS' && ctx.user.role === 'BILLER');

      if (roleAllows) {
        return { allowed: true, source: 'role' };
      }

      // Check explicit permission grants
      const permission = await ctx.prisma.permissionGrant.findFirst({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
          permissionType: input.permissionType as PermissionType,
          revokedAt: null,
          validFrom: { lte: new Date() },
          OR: [
            { validUntil: null },
            { validUntil: { gt: new Date() } },
          ],
          // Resource type/id match (if specified)
          ...(input.resourceType && { resourceType: input.resourceType }),
          ...(input.resourceId && { resourceId: input.resourceId }),
        },
      });

      if (permission) {
        return { allowed: true, source: 'explicit_grant', permissionId: permission.id };
      }

      // Check for wildcard permission (no specific resource)
      const wildcardPermission = await ctx.prisma.permissionGrant.findFirst({
        where: {
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
          permissionType: input.permissionType as PermissionType,
          revokedAt: null,
          validFrom: { lte: new Date() },
          OR: [
            { validUntil: null },
            { validUntil: { gt: new Date() } },
          ],
          resourceType: null,
          resourceId: null,
        },
      });

      if (wildcardPermission) {
        return { allowed: true, source: 'wildcard_grant', permissionId: wildcardPermission.id };
      }

      return { allowed: false };
    }),

  // ============================================
  // Role Inheritance
  // ============================================

  // Get role inheritance configuration
  getRoleInheritance: adminProcedure.query(async ({ ctx }) => {
    const inheritances = await ctx.prisma.roleInheritance.findMany({
      where: { organizationId: ctx.user.organizationId },
      include: {
        createdByUser: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      customInheritances: inheritances,
      defaultHierarchy: DEFAULT_ROLE_HIERARCHY,
    };
  }),

  // Create role inheritance rule
  createRoleInheritance: adminProcedure
    .input(
      z.object({
        parentRole: z.enum(['OWNER', 'ADMIN', 'PROVIDER', 'STAFF', 'BILLER']),
        childRole: z.enum(['OWNER', 'ADMIN', 'PROVIDER', 'STAFF', 'BILLER']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Prevent self-inheritance
      if (input.parentRole === input.childRole) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'A role cannot inherit from itself',
        });
      }

      // Check for circular inheritance
      const existingChild = await ctx.prisma.roleInheritance.findFirst({
        where: {
          organizationId: ctx.user.organizationId,
          parentRole: input.childRole,
          childRole: input.parentRole,
          isActive: true,
        },
      });

      if (existingChild) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This would create circular inheritance',
        });
      }

      const inheritance = await ctx.prisma.roleInheritance.create({
        data: {
          parentRole: input.parentRole as Role,
          childRole: input.childRole as Role,
          organizationId: ctx.user.organizationId,
          createdBy: ctx.user.id,
        },
      });

      await auditLog('CREATE', 'RoleInheritance', {
        entityId: inheritance.id,
        changes: input,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      await logAccessControlEvent(ctx.prisma, 'CONFIG_CHANGED', ctx.user.id, ctx.user.organizationId, true, {
        action: 'create_role_inheritance',
        parentRole: input.parentRole,
        childRole: input.childRole,
      });

      return inheritance;
    }),

  // Delete role inheritance rule
  deleteRoleInheritance: adminProcedure
    .input(z.object({ inheritanceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const inheritance = await ctx.prisma.roleInheritance.findFirst({
        where: {
          id: input.inheritanceId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!inheritance) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Role inheritance rule not found',
        });
      }

      await ctx.prisma.roleInheritance.delete({
        where: { id: input.inheritanceId },
      });

      await auditLog('DELETE', 'RoleInheritance', {
        entityId: input.inheritanceId,
        changes: { parentRole: inheritance.parentRole, childRole: inheritance.childRole },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      await logAccessControlEvent(ctx.prisma, 'CONFIG_CHANGED', ctx.user.id, ctx.user.organizationId, true, {
        action: 'delete_role_inheritance',
        parentRole: inheritance.parentRole,
        childRole: inheritance.childRole,
      });

      return { success: true };
    }),

  // Toggle role inheritance active status
  toggleRoleInheritance: adminProcedure
    .input(
      z.object({
        inheritanceId: z.string(),
        isActive: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const inheritance = await ctx.prisma.roleInheritance.findFirst({
        where: {
          id: input.inheritanceId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!inheritance) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Role inheritance rule not found',
        });
      }

      const updated = await ctx.prisma.roleInheritance.update({
        where: { id: input.inheritanceId },
        data: { isActive: input.isActive },
      });

      await logAccessControlEvent(ctx.prisma, 'CONFIG_CHANGED', ctx.user.id, ctx.user.organizationId, true, {
        action: 'toggle_role_inheritance',
        inheritanceId: input.inheritanceId,
        isActive: input.isActive,
      });

      return updated;
    }),

  // Get effective roles for a user
  getEffectiveRolesForUser: protectedProcedure
    .input(z.object({ userId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const targetUserId = input.userId || ctx.user.id;

      // Non-admins can only view their own effective roles
      if (input.userId && input.userId !== ctx.user.id && ctx.user.role !== 'ADMIN' && ctx.user.role !== 'OWNER') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only view your own effective roles',
        });
      }

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

      const effectiveRoles = await getEffectiveRoles(ctx.prisma, user.role, ctx.user.organizationId);

      return {
        baseRole: user.role,
        effectiveRoles,
      };
    }),

  // ============================================
  // Permission Audit Report
  // ============================================

  // Generate permission audit report
  getPermissionAuditReport: adminProcedure
    .input(
      z.object({
        from: z.date().optional(),
        to: z.date().optional(),
        userId: z.string().optional(),
        permissionType: z.enum(['PATIENT_ACCESS', 'PHI_ACCESS', 'BILLING_ACCESS', 'ADMIN_ACCESS', 'LOCATION_ACCESS', 'REPORT_ACCESS', 'ROLE_ELEVATION', 'EMERGENCY_ACCESS']).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const dateFilter = {
        ...(input.from && { gte: input.from }),
        ...(input.to && { lte: input.to }),
      };

      // Get permission grants
      const grants = await ctx.prisma.permissionGrant.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          ...(input.userId && { userId: input.userId }),
          ...(input.permissionType && { permissionType: input.permissionType as PermissionType }),
          ...(Object.keys(dateFilter).length > 0 && { grantedAt: dateFilter }),
        },
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true, role: true },
          },
          grantedByUser: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          revokedByUser: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
        orderBy: { grantedAt: 'desc' },
      });

      // Get related security events
      const securityEvents = await ctx.prisma.securityEvent.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          eventType: {
            in: ['PERMISSION_GRANTED', 'PERMISSION_REVOKED', 'ROLE_CHANGED', 'CONFIG_CHANGED'],
          },
          ...(input.userId && { userId: input.userId }),
          ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
        },
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      // Get role changes
      const roleChanges = await ctx.prisma.auditLog.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          entityType: 'User',
          action: 'UPDATE',
          ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      // Filter role changes to only those with role field changes
      const roleChangeRecords = roleChanges.filter(log => {
        const changes = log.changes as Record<string, unknown>;
        return changes && 'role' in changes;
      });

      // Summary statistics
      const stats = {
        totalGrants: grants.length,
        activeGrants: grants.filter(g => !g.revokedAt && (!g.validUntil || g.validUntil > new Date())).length,
        revokedGrants: grants.filter(g => g.revokedAt).length,
        expiredGrants: grants.filter(g => g.validUntil && g.validUntil <= new Date() && !g.revokedAt).length,
        byPermissionType: {} as Record<string, number>,
        byUser: {} as Record<string, number>,
      };

      grants.forEach(grant => {
        stats.byPermissionType[grant.permissionType] = (stats.byPermissionType[grant.permissionType] || 0) + 1;
        const userName = `${grant.user.firstName} ${grant.user.lastName}`;
        stats.byUser[userName] = (stats.byUser[userName] || 0) + 1;
      });

      return {
        grants,
        securityEvents,
        roleChanges: roleChangeRecords,
        stats,
        generatedAt: new Date(),
      };
    }),

  // ============================================
  // Access Request Workflow
  // ============================================

  // Create an access request
  createAccessRequest: protectedProcedure
    .input(
      z.object({
        permissionType: z.enum(['PATIENT_ACCESS', 'PHI_ACCESS', 'BILLING_ACCESS', 'ADMIN_ACCESS', 'LOCATION_ACCESS', 'REPORT_ACCESS', 'ROLE_ELEVATION', 'EMERGENCY_ACCESS']),
        justification: z.string().min(10, 'Justification must be at least 10 characters'),
        targetResource: z.string().optional(),
        targetRole: z.enum(['OWNER', 'ADMIN', 'PROVIDER', 'STAFF', 'BILLER']).optional(),
        requestedDuration: z.number().min(5).max(525600).optional(), // 5 min to 1 year in minutes
        validFrom: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check for existing pending request
      const existingRequest = await ctx.prisma.accessRequest.findFirst({
        where: {
          requestedBy: ctx.user.id,
          organizationId: ctx.user.organizationId,
          permissionType: input.permissionType as PermissionType,
          status: 'PENDING',
        },
      });

      if (existingRequest) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'You already have a pending request for this permission type',
        });
      }

      // Calculate validUntil if duration is specified
      const validFrom = input.validFrom ?? new Date();
      const validUntil = input.requestedDuration
        ? new Date(validFrom.getTime() + input.requestedDuration * 60 * 1000)
        : undefined;

      const request = await ctx.prisma.accessRequest.create({
        data: {
          requestedBy: ctx.user.id,
          organizationId: ctx.user.organizationId,
          permissionType: input.permissionType as PermissionType,
          justification: input.justification,
          targetResource: input.targetResource,
          targetRole: input.targetRole as Role | undefined,
          requestedDuration: input.requestedDuration,
          validFrom,
          validUntil,
        },
      });

      await auditLog('CREATE', 'AccessRequest', {
        entityId: request.id,
        changes: input,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      await logAccessControlEvent(ctx.prisma, 'CONFIG_CHANGED', ctx.user.id, ctx.user.organizationId, true, {
        action: 'access_request_created',
        permissionType: input.permissionType,
        targetResource: input.targetResource,
      });

      return request;
    }),

  // List access requests (admin sees all, users see their own)
  listAccessRequests: protectedProcedure
    .input(
      z.object({
        status: z.enum(['PENDING', 'APPROVED', 'DENIED', 'EXPIRED', 'CANCELLED']).optional(),
        permissionType: z.enum(['PATIENT_ACCESS', 'PHI_ACCESS', 'BILLING_ACCESS', 'ADMIN_ACCESS', 'LOCATION_ACCESS', 'REPORT_ACCESS', 'ROLE_ELEVATION', 'EMERGENCY_ACCESS']).optional(),
        userId: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const isAdmin = ctx.user.role === 'ADMIN' || ctx.user.role === 'OWNER';

      const where: Prisma.AccessRequestWhereInput = {
        organizationId: ctx.user.organizationId,
        // Non-admins can only see their own requests
        ...(isAdmin && input.userId ? { requestedBy: input.userId } : !isAdmin ? { requestedBy: ctx.user.id } : {}),
        ...(input.status && { status: input.status }),
        ...(input.permissionType && { permissionType: input.permissionType as PermissionType }),
      };

      const [requests, total] = await Promise.all([
        ctx.prisma.accessRequest.findMany({
          where,
          include: {
            requestedByUser: {
              select: { id: true, email: true, firstName: true, lastName: true, role: true },
            },
            reviewedByUser: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: input.limit,
          skip: input.offset,
        }),
        ctx.prisma.accessRequest.count({ where }),
      ]);

      return { requests, total };
    }),

  // Review (approve/deny) an access request
  reviewAccessRequest: adminProcedure
    .input(
      z.object({
        requestId: z.string(),
        decision: z.enum(['APPROVED', 'DENIED']),
        reviewNotes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const request = await ctx.prisma.accessRequest.findFirst({
        where: {
          id: input.requestId,
          organizationId: ctx.user.organizationId,
          status: 'PENDING',
        },
      });

      if (!request) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Access request not found or already processed',
        });
      }

      const updated = await ctx.prisma.accessRequest.update({
        where: { id: input.requestId },
        data: {
          status: input.decision as AccessRequestStatus,
          reviewedBy: ctx.user.id,
          reviewedAt: new Date(),
          reviewNotes: input.reviewNotes,
        },
      });

      // If approved, create the permission grant
      if (input.decision === 'APPROVED') {
        await ctx.prisma.permissionGrant.create({
          data: {
            userId: request.requestedBy,
            organizationId: ctx.user.organizationId,
            permissionType: request.permissionType,
            resourceType: request.targetResource ? 'custom' : undefined,
            resourceId: request.targetResource,
            validFrom: request.validFrom ?? new Date(),
            validUntil: request.validUntil,
            grantedBy: ctx.user.id,
            reason: `Approved access request: ${request.justification}`,
          },
        });

        await logAccessControlEvent(ctx.prisma, 'PERMISSION_GRANTED', ctx.user.id, ctx.user.organizationId, true, {
          action: 'access_request_approved',
          requestId: input.requestId,
          targetUserId: request.requestedBy,
          permissionType: request.permissionType,
        });
      } else {
        await logAccessControlEvent(ctx.prisma, 'CONFIG_CHANGED', ctx.user.id, ctx.user.organizationId, true, {
          action: 'access_request_denied',
          requestId: input.requestId,
          targetUserId: request.requestedBy,
          permissionType: request.permissionType,
        });
      }

      await auditLog('UPDATE', 'AccessRequest', {
        entityId: input.requestId,
        changes: { status: input.decision, reviewedBy: ctx.user.id },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  // Cancel own access request
  cancelAccessRequest: protectedProcedure
    .input(z.object({ requestId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const request = await ctx.prisma.accessRequest.findFirst({
        where: {
          id: input.requestId,
          organizationId: ctx.user.organizationId,
          requestedBy: ctx.user.id,
          status: 'PENDING',
        },
      });

      if (!request) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Access request not found or cannot be cancelled',
        });
      }

      const updated = await ctx.prisma.accessRequest.update({
        where: { id: input.requestId },
        data: { status: 'CANCELLED' },
      });

      await auditLog('UPDATE', 'AccessRequest', {
        entityId: input.requestId,
        changes: { status: 'CANCELLED' },
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return updated;
    }),

  // Get pending request count (for admin dashboard)
  getPendingRequestCount: adminProcedure.query(async ({ ctx }) => {
    const count = await ctx.prisma.accessRequest.count({
      where: {
        organizationId: ctx.user.organizationId,
        status: 'PENDING',
      },
    });

    return { count };
  }),
});
