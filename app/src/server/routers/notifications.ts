/**
 * Notifications Router (US-265)
 *
 * Push notification system with FCM and APNS integration.
 * Handles device registration, notification sending, and preferences management.
 */

import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import {
  sendPushNotification,
  sendBulkPushNotification,
  registerDeviceToken,
  markNotificationRead,
  getNotificationHistory,
  getUnreadNotificationCount,
  type NotificationPayload,
} from '@/lib/push-notifications';
import { createAuditLog } from '@/lib/audit';
import type { NotificationType, Prisma } from '@prisma/client';

// Zod schemas
const notificationTypeSchema = z.enum([
  'APPOINTMENT_REMINDER',
  'APPOINTMENT_CONFIRMATION',
  'APPOINTMENT_CANCELLATION',
  'MESSAGE_RECEIVED',
  'FORM_ASSIGNED',
  'TREATMENT_REMINDER',
  'ALERT',
  'GENERAL',
]);

const devicePlatformSchema = z.enum(['IOS', 'ANDROID', 'WEB']);

// Input schemas
const registerDeviceSchema = z.object({
  deviceId: z.string().min(1),
  fcmToken: z.string().optional(),
  apnsToken: z.string().optional(),
  platform: devicePlatformSchema,
});

const sendNotificationSchema = z.object({
  userId: z.string().min(1),
  type: notificationTypeSchema,
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(500),
  data: z.record(z.string(), z.unknown()).optional(),
  relatedEntityType: z.string().optional(),
  relatedEntityId: z.string().optional(),
  scheduledFor: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
  deviceIds: z.array(z.string()).optional(),
  respectPreferences: z.boolean().default(true),
});

const sendBulkNotificationSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1),
  type: notificationTypeSchema,
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(500),
  data: z.record(z.string(), z.unknown()).optional(),
  relatedEntityType: z.string().optional(),
  relatedEntityId: z.string().optional(),
  respectPreferences: z.boolean().default(true),
});

const preferencesSchema = z.object({
  appointmentReminders: z.boolean().optional(),
  appointmentConfirmations: z.boolean().optional(),
  appointmentCancellations: z.boolean().optional(),
  messageNotifications: z.boolean().optional(),
  formNotifications: z.boolean().optional(),
  treatmentReminders: z.boolean().optional(),
  generalAlerts: z.boolean().optional(),
  marketingMessages: z.boolean().optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  quietHoursTimezone: z.string().optional(),
  appointmentReminderTiming: z.number().min(1).max(168).optional(), // 1-168 hours (1 week)
  dailyDigest: z.boolean().optional(),
  digestTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
});

const historyQuerySchema = z.object({
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
  types: z.array(notificationTypeSchema).optional(),
  unreadOnly: z.boolean().optional(),
});

export const notificationsRouter = router({
  // ==================== Device Registration ====================

  /**
   * Register device for push notifications
   * Updates FCM/APNS tokens for the device
   */
  register: protectedProcedure
    .input(registerDeviceSchema)
    .mutation(async ({ ctx, input }) => {
      // First check if device exists
      const existingDevice = await ctx.prisma.mobileDevice.findFirst({
        where: {
          deviceId: input.deviceId,
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!existingDevice) {
        // Create the device if it doesn't exist
        await ctx.prisma.mobileDevice.create({
          data: {
            deviceId: input.deviceId,
            platform: input.platform,
            fcmToken: input.fcmToken,
            apnsToken: input.apnsToken,
            userId: ctx.user.id,
            organizationId: ctx.user.organizationId,
          },
        });
      } else {
        // Update existing device tokens
        await registerDeviceToken(
          ctx.user.id,
          ctx.user.organizationId,
          input.deviceId,
          input.fcmToken,
          input.apnsToken
        );
      }

      await createAuditLog({
        action: 'NOTIFICATION_DEVICE_REGISTERED',
        entityType: 'MobileDevice',
        entityId: input.deviceId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        metadata: {
          platform: input.platform,
          hasToken: !!(input.fcmToken || input.apnsToken),
        },
      });

      return {
        success: true,
        deviceId: input.deviceId,
        registered: true,
      };
    }),

  /**
   * Unregister device from push notifications
   */
  unregister: protectedProcedure
    .input(z.object({ deviceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.mobileDevice.updateMany({
        where: {
          deviceId: input.deviceId,
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
        data: {
          fcmToken: null,
          apnsToken: null,
          isActive: false,
        },
      });

      await createAuditLog({
        action: 'NOTIFICATION_DEVICE_UNREGISTERED',
        entityType: 'MobileDevice',
        entityId: input.deviceId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
      });

      return { success: true };
    }),

  // ==================== Send Notifications ====================

  /**
   * Send push notification to a specific user
   */
  send: adminProcedure
    .input(sendNotificationSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify user belongs to organization
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

      const payload: NotificationPayload = {
        type: input.type as NotificationType,
        title: input.title,
        body: input.body,
        data: input.data,
        relatedEntityType: input.relatedEntityType,
        relatedEntityId: input.relatedEntityId,
        scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : undefined,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      };

      const result = await sendPushNotification({
        userId: input.userId,
        organizationId: ctx.user.organizationId,
        payload,
        deviceIds: input.deviceIds,
        respectPreferences: input.respectPreferences,
      });

      await createAuditLog({
        action: 'NOTIFICATION_SENT',
        entityType: 'PushNotification',
        entityId: result.notificationId,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        metadata: {
          targetUserId: input.userId,
          type: input.type,
          sent: result.sent,
          failed: result.failed,
        },
      });

      return result;
    }),

  /**
   * Send push notification to multiple users
   */
  sendBulk: adminProcedure
    .input(sendBulkNotificationSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify all users belong to organization
      const validUsers = await ctx.prisma.user.findMany({
        where: {
          id: { in: input.userIds },
          organizationId: ctx.user.organizationId,
        },
        select: { id: true },
      });

      const validUserIds = validUsers.map(u => u.id);
      const invalidUserIds = input.userIds.filter(id => !validUserIds.includes(id));

      if (validUserIds.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No valid users found in organization',
        });
      }

      const payload: NotificationPayload = {
        type: input.type as NotificationType,
        title: input.title,
        body: input.body,
        data: input.data,
        relatedEntityType: input.relatedEntityType,
        relatedEntityId: input.relatedEntityId,
      };

      const results = await sendBulkPushNotification(
        validUserIds,
        ctx.user.organizationId,
        payload,
        input.respectPreferences
      );

      const totalSent = results.reduce((sum, r) => sum + r.result.sent, 0);
      const totalFailed = results.reduce((sum, r) => sum + r.result.failed, 0);

      await createAuditLog({
        action: 'NOTIFICATION_BULK_SENT',
        entityType: 'PushNotification',
        entityId: 'bulk',
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        metadata: {
          targetUserCount: validUserIds.length,
          type: input.type,
          totalSent,
          totalFailed,
          invalidUserIds,
        },
      });

      return {
        success: totalSent > 0,
        totalUsers: validUserIds.length,
        totalSent,
        totalFailed,
        invalidUserIds,
        results: results.map(r => ({
          userId: r.userId,
          sent: r.result.sent,
          failed: r.result.failed,
        })),
      };
    }),

  // ==================== Notification Preferences ====================

  /**
   * Get current user's notification preferences
   */
  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    const preferences = await ctx.prisma.notificationPreference.findUnique({
      where: {
        userId: ctx.user.id,
      },
    });

    // Return defaults if no preferences exist
    if (!preferences) {
      return {
        appointmentReminders: true,
        appointmentConfirmations: true,
        appointmentCancellations: true,
        messageNotifications: true,
        formNotifications: true,
        treatmentReminders: true,
        generalAlerts: true,
        marketingMessages: false,
        quietHoursEnabled: false,
        quietHoursStart: null,
        quietHoursEnd: null,
        quietHoursTimezone: null,
        appointmentReminderTiming: 24,
        dailyDigest: false,
        digestTime: null,
        pushEnabled: true,
        emailEnabled: true,
        smsEnabled: true,
      };
    }

    return {
      appointmentReminders: preferences.appointmentReminders,
      appointmentConfirmations: preferences.appointmentConfirmations,
      appointmentCancellations: preferences.appointmentCancellations,
      messageNotifications: preferences.messageNotifications,
      formNotifications: preferences.formNotifications,
      treatmentReminders: preferences.treatmentReminders,
      generalAlerts: preferences.generalAlerts,
      marketingMessages: preferences.marketingMessages,
      quietHoursEnabled: preferences.quietHoursEnabled,
      quietHoursStart: preferences.quietHoursStart,
      quietHoursEnd: preferences.quietHoursEnd,
      quietHoursTimezone: preferences.quietHoursTimezone,
      appointmentReminderTiming: preferences.appointmentReminderTiming,
      dailyDigest: preferences.dailyDigest,
      digestTime: preferences.digestTime,
      pushEnabled: preferences.pushEnabled,
      emailEnabled: preferences.emailEnabled,
      smsEnabled: preferences.smsEnabled,
    };
  }),

  /**
   * Update current user's notification preferences
   */
  updatePreferences: protectedProcedure
    .input(preferencesSchema)
    .mutation(async ({ ctx, input }) => {
      const preferences = await ctx.prisma.notificationPreference.upsert({
        where: {
          userId: ctx.user.id,
        },
        create: {
          ...input,
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
        update: input,
      });

      await createAuditLog({
        action: 'NOTIFICATION_PREFERENCES_UPDATED',
        entityType: 'NotificationPreference',
        entityId: preferences.id,
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        metadata: { changedFields: Object.keys(input) },
      });

      return {
        success: true,
        preferences: {
          appointmentReminders: preferences.appointmentReminders,
          appointmentConfirmations: preferences.appointmentConfirmations,
          appointmentCancellations: preferences.appointmentCancellations,
          messageNotifications: preferences.messageNotifications,
          formNotifications: preferences.formNotifications,
          treatmentReminders: preferences.treatmentReminders,
          generalAlerts: preferences.generalAlerts,
          marketingMessages: preferences.marketingMessages,
          quietHoursEnabled: preferences.quietHoursEnabled,
          quietHoursStart: preferences.quietHoursStart,
          quietHoursEnd: preferences.quietHoursEnd,
          quietHoursTimezone: preferences.quietHoursTimezone,
          appointmentReminderTiming: preferences.appointmentReminderTiming,
          dailyDigest: preferences.dailyDigest,
          digestTime: preferences.digestTime,
          pushEnabled: preferences.pushEnabled,
          emailEnabled: preferences.emailEnabled,
          smsEnabled: preferences.smsEnabled,
        },
      };
    }),

  // ==================== Notification History ====================

  /**
   * Get notification history for current user
   */
  getHistory: protectedProcedure
    .input(historyQuerySchema.optional())
    .query(async ({ ctx, input }) => {
      const { limit = 50, offset = 0, types, unreadOnly } = input || {};

      return getNotificationHistory(
        ctx.user.id,
        ctx.user.organizationId,
        { limit, offset, types: types as NotificationType[], unreadOnly }
      );
    }),

  /**
   * Get unread notification count
   */
  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    const count = await getUnreadNotificationCount(ctx.user.id, ctx.user.organizationId);
    return { count };
  }),

  /**
   * Mark notification as read
   */
  markRead: protectedProcedure
    .input(z.object({ notificationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify notification belongs to user
      const notification = await ctx.prisma.pushNotification.findFirst({
        where: {
          id: input.notificationId,
          userId: ctx.user.id,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!notification) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Notification not found',
        });
      }

      await markNotificationRead(input.notificationId, ctx.user.organizationId);

      return { success: true };
    }),

  /**
   * Mark all notifications as read
   */
  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const result = await ctx.prisma.pushNotification.updateMany({
      where: {
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        deliveryStatus: { not: 'READ' },
      },
      data: {
        deliveryStatus: 'READ',
        readAt: new Date(),
      },
    });

    return { success: true, count: result.count };
  }),

  /**
   * Delete old notifications (admin only)
   */
  cleanupOld: adminProcedure
    .input(z.object({ daysOld: z.number().min(7).max(365).default(90) }))
    .mutation(async ({ ctx, input }) => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - input.daysOld);

      const [notificationsDeleted, logsDeleted] = await Promise.all([
        ctx.prisma.pushNotification.deleteMany({
          where: {
            organizationId: ctx.user.organizationId,
            createdAt: { lt: cutoffDate },
          },
        }),
        ctx.prisma.notificationLog.deleteMany({
          where: {
            organizationId: ctx.user.organizationId,
            createdAt: { lt: cutoffDate },
          },
        }),
      ]);

      await createAuditLog({
        action: 'NOTIFICATION_CLEANUP',
        entityType: 'PushNotification',
        entityId: 'cleanup',
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        metadata: {
          daysOld: input.daysOld,
          notificationsDeleted: notificationsDeleted.count,
          logsDeleted: logsDeleted.count,
        },
      });

      return {
        success: true,
        notificationsDeleted: notificationsDeleted.count,
        logsDeleted: logsDeleted.count,
      };
    }),

  // ==================== Admin: User Preferences Management ====================

  /**
   * Get notification preferences for a specific user (admin only)
   */
  getUserPreferences: adminProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const preferences = await ctx.prisma.notificationPreference.findFirst({
        where: {
          userId: input.userId,
          organizationId: ctx.user.organizationId,
        },
      });

      if (!preferences) {
        return null;
      }

      return {
        userId: input.userId,
        appointmentReminders: preferences.appointmentReminders,
        appointmentConfirmations: preferences.appointmentConfirmations,
        appointmentCancellations: preferences.appointmentCancellations,
        messageNotifications: preferences.messageNotifications,
        formNotifications: preferences.formNotifications,
        treatmentReminders: preferences.treatmentReminders,
        generalAlerts: preferences.generalAlerts,
        marketingMessages: preferences.marketingMessages,
        pushEnabled: preferences.pushEnabled,
        emailEnabled: preferences.emailEnabled,
        smsEnabled: preferences.smsEnabled,
      };
    }),

  /**
   * Get notification statistics (admin only)
   */
  getStats: adminProcedure
    .input(z.object({
      days: z.number().min(1).max(90).default(30),
    }).optional())
    .query(async ({ ctx, input }) => {
      const { days = 30 } = input || {};
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const [
        totalSent,
        totalDelivered,
        totalFailed,
        totalRead,
        byType,
        byPlatform,
      ] = await Promise.all([
        ctx.prisma.notificationLog.count({
          where: {
            organizationId: ctx.user.organizationId,
            createdAt: { gte: startDate },
            status: 'SENT',
          },
        }),
        ctx.prisma.notificationLog.count({
          where: {
            organizationId: ctx.user.organizationId,
            createdAt: { gte: startDate },
            status: 'DELIVERED',
          },
        }),
        ctx.prisma.notificationLog.count({
          where: {
            organizationId: ctx.user.organizationId,
            createdAt: { gte: startDate },
            status: 'FAILED',
          },
        }),
        ctx.prisma.pushNotification.count({
          where: {
            organizationId: ctx.user.organizationId,
            createdAt: { gte: startDate },
            deliveryStatus: 'READ',
          },
        }),
        ctx.prisma.notificationLog.groupBy({
          by: ['notificationType'],
          where: {
            organizationId: ctx.user.organizationId,
            createdAt: { gte: startDate },
          },
          _count: true,
        }),
        ctx.prisma.notificationLog.groupBy({
          by: ['platform'],
          where: {
            organizationId: ctx.user.organizationId,
            createdAt: { gte: startDate },
            platform: { not: null },
          },
          _count: true,
        }),
      ]);

      return {
        period: { days, startDate: startDate.toISOString() },
        totals: {
          sent: totalSent,
          delivered: totalDelivered,
          failed: totalFailed,
          read: totalRead,
        },
        byType: byType.map(t => ({
          type: t.notificationType,
          count: t._count,
        })),
        byPlatform: byPlatform.map(p => ({
          platform: p.platform,
          count: p._count,
        })),
      };
    }),
});
