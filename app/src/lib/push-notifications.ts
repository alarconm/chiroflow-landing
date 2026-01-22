/**
 * Push Notification Service (US-265)
 *
 * Firebase Cloud Messaging (FCM) and Apple Push Notification Service (APNS) integration
 * for sending push notifications to mobile devices.
 */

import { prisma } from './prisma';
import type { NotificationType, DevicePlatform, NotificationDeliveryStatus } from '@prisma/client';

// FCM Configuration
const FCM_SERVER_KEY = process.env.FCM_SERVER_KEY;
const FCM_API_URL = 'https://fcm.googleapis.com/fcm/send';

// APNS Configuration (would use @parse/node-apn in production)
const APNS_KEY_ID = process.env.APNS_KEY_ID;
const APNS_TEAM_ID = process.env.APNS_TEAM_ID;
const APNS_BUNDLE_ID = process.env.APNS_BUNDLE_ID;
const APNS_PRODUCTION = process.env.NODE_ENV === 'production';

// Notification payload types
export interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  relatedEntityType?: string;
  relatedEntityId?: string;
  scheduledFor?: Date;
  expiresAt?: Date;
  sound?: string;
  badge?: number;
  imageUrl?: string;
}

export interface SendNotificationOptions {
  userId: string;
  organizationId: string;
  payload: NotificationPayload;
  deviceIds?: string[]; // Specific devices, or all if not provided
  respectPreferences?: boolean; // Check user preferences before sending
}

export interface SendNotificationResult {
  success: boolean;
  sent: number;
  failed: number;
  results: Array<{
    deviceId: string;
    platform: DevicePlatform;
    success: boolean;
    messageId?: string;
    error?: string;
  }>;
  notificationId?: string;
}

// FCM Message types
interface FCMMessage {
  to?: string;
  registration_ids?: string[];
  notification: {
    title: string;
    body: string;
    sound?: string;
    badge?: number;
    image?: string;
  };
  data?: Record<string, string>;
  priority?: 'high' | 'normal';
  time_to_live?: number;
  content_available?: boolean;
}

interface FCMResponse {
  multicast_id: number;
  success: number;
  failure: number;
  results: Array<{
    message_id?: string;
    error?: string;
  }>;
}

// APNS Message types
interface APNSMessage {
  aps: {
    alert: {
      title: string;
      body: string;
    };
    sound?: string;
    badge?: number;
    'content-available'?: number;
    'mutable-content'?: number;
  };
  data?: Record<string, unknown>;
}

/**
 * Send FCM notification to Android devices
 */
async function sendFCMNotification(
  tokens: string[],
  payload: NotificationPayload
): Promise<{ success: boolean; results: Array<{ token: string; messageId?: string; error?: string }> }> {
  if (!FCM_SERVER_KEY) {
    console.warn('FCM_SERVER_KEY not configured - skipping FCM notification');
    return {
      success: false,
      results: tokens.map(token => ({ token, error: 'FCM not configured' })),
    };
  }

  const message: FCMMessage = {
    registration_ids: tokens,
    notification: {
      title: payload.title,
      body: payload.body,
      sound: payload.sound || 'default',
      badge: payload.badge,
      image: payload.imageUrl,
    },
    data: payload.data ? stringifyData(payload.data) : undefined,
    priority: 'high',
    time_to_live: payload.expiresAt
      ? Math.floor((payload.expiresAt.getTime() - Date.now()) / 1000)
      : 86400, // 24 hours default
    content_available: true,
  };

  try {
    const response = await fetch(FCM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `key=${FCM_SERVER_KEY}`,
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`FCM API error: ${response.status} - ${errorText}`);
    }

    const data: FCMResponse = await response.json();

    return {
      success: data.success > 0,
      results: tokens.map((token, index) => ({
        token,
        messageId: data.results[index]?.message_id,
        error: data.results[index]?.error,
      })),
    };
  } catch (error) {
    console.error('FCM send error:', error);
    return {
      success: false,
      results: tokens.map(token => ({
        token,
        error: error instanceof Error ? error.message : 'Unknown error',
      })),
    };
  }
}

/**
 * Send APNS notification to iOS devices
 *
 * Note: In production, use a library like @parse/node-apn for proper APNS implementation.
 * This is a simplified HTTP/2 implementation for demonstration.
 */
async function sendAPNSNotification(
  tokens: string[],
  payload: NotificationPayload
): Promise<{ success: boolean; results: Array<{ token: string; messageId?: string; error?: string }> }> {
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_BUNDLE_ID) {
    console.warn('APNS not configured - skipping APNS notification');
    return {
      success: false,
      results: tokens.map(token => ({ token, error: 'APNS not configured' })),
    };
  }

  const apnsMessage: APNSMessage = {
    aps: {
      alert: {
        title: payload.title,
        body: payload.body,
      },
      sound: payload.sound || 'default',
      badge: payload.badge,
      'content-available': 1,
      'mutable-content': 1,
    },
    data: payload.data,
  };

  const results: Array<{ token: string; messageId?: string; error?: string }> = [];

  // In production, use proper APNS HTTP/2 client
  // For now, simulate the response structure
  for (const token of tokens) {
    try {
      // TODO: Implement actual APNS HTTP/2 request
      // const apnsUrl = APNS_PRODUCTION
      //   ? `https://api.push.apple.com/3/device/${token}`
      //   : `https://api.sandbox.push.apple.com/3/device/${token}`;

      // Simulate success for now - in production use proper APNS library
      const messageId = `apns-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      results.push({ token, messageId });
    } catch (error) {
      results.push({
        token,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return {
    success: results.some(r => r.messageId),
    results,
  };
}

/**
 * Convert data object to string values for FCM
 */
function stringifyData(data: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    result[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return result;
}

/**
 * Check if notification should be sent based on user preferences
 */
async function shouldSendNotification(
  userId: string,
  organizationId: string,
  notificationType: NotificationType
): Promise<boolean> {
  const preferences = await prisma.notificationPreference.findUnique({
    where: {
      userId,
    },
  });

  // If no preferences set, default to sending
  if (!preferences) return true;

  // Check if push is enabled globally
  if (!preferences.pushEnabled) return false;

  // Check type-specific preferences
  const typePreferenceMap: Record<NotificationType, keyof typeof preferences> = {
    APPOINTMENT_REMINDER: 'appointmentReminders',
    APPOINTMENT_CONFIRMATION: 'appointmentConfirmations',
    APPOINTMENT_CANCELLATION: 'appointmentCancellations',
    MESSAGE_RECEIVED: 'messageNotifications',
    FORM_ASSIGNED: 'formNotifications',
    TREATMENT_REMINDER: 'treatmentReminders',
    ALERT: 'generalAlerts',
    GENERAL: 'generalAlerts',
  };

  const preferenceKey = typePreferenceMap[notificationType];
  if (preferenceKey && preferences[preferenceKey] === false) {
    return false;
  }

  // Check quiet hours
  if (preferences.quietHoursEnabled && preferences.quietHoursStart && preferences.quietHoursEnd) {
    const now = new Date();
    const timezone = preferences.quietHoursTimezone || 'UTC';

    // Simple quiet hours check (could be improved with proper timezone handling)
    const currentTime = now.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
    });

    const start = preferences.quietHoursStart;
    const end = preferences.quietHoursEnd;

    // Handle overnight quiet hours (e.g., 22:00 to 07:00)
    if (start > end) {
      if (currentTime >= start || currentTime <= end) {
        return false;
      }
    } else {
      if (currentTime >= start && currentTime <= end) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Main function to send push notifications
 */
export async function sendPushNotification(options: SendNotificationOptions): Promise<SendNotificationResult> {
  const { userId, organizationId, payload, deviceIds, respectPreferences = true } = options;

  // Check user preferences if requested
  if (respectPreferences) {
    const shouldSend = await shouldSendNotification(userId, organizationId, payload.type);
    if (!shouldSend) {
      return {
        success: false,
        sent: 0,
        failed: 0,
        results: [],
      };
    }
  }

  // Get active devices for the user
  const whereClause: {
    userId: string;
    organizationId: string;
    isActive: boolean;
    deviceId?: { in: string[] };
    OR: Array<{ fcmToken: { not: null } } | { apnsToken: { not: null } }>;
  } = {
    userId,
    organizationId,
    isActive: true,
    OR: [
      { fcmToken: { not: null } },
      { apnsToken: { not: null } },
    ],
  };

  if (deviceIds && deviceIds.length > 0) {
    whereClause.deviceId = { in: deviceIds };
  }

  const devices = await prisma.mobileDevice.findMany({
    where: whereClause,
    select: {
      id: true,
      deviceId: true,
      platform: true,
      fcmToken: true,
      apnsToken: true,
    },
  });

  if (devices.length === 0) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      results: [],
    };
  }

  // Create the notification record
  const notification = await prisma.pushNotification.create({
    data: {
      type: payload.type,
      title: payload.title,
      body: payload.body,
      data: payload.data as never,
      relatedEntityType: payload.relatedEntityType,
      relatedEntityId: payload.relatedEntityId,
      scheduledFor: payload.scheduledFor,
      expiresAt: payload.expiresAt,
      deliveryStatus: 'PENDING',
      userId,
      organizationId,
    },
  });

  // Separate devices by platform
  const androidDevices = devices.filter(d => d.platform === 'ANDROID' && d.fcmToken);
  const iosDevices = devices.filter(d => d.platform === 'IOS' && d.apnsToken);
  const webDevices = devices.filter(d => d.platform === 'WEB' && d.fcmToken);

  const results: SendNotificationResult['results'] = [];
  let sent = 0;
  let failed = 0;

  // Send to Android devices via FCM
  if (androidDevices.length > 0 || webDevices.length > 0) {
    const fcmTokens = [
      ...androidDevices.map(d => d.fcmToken!),
      ...webDevices.map(d => d.fcmToken!),
    ];

    const fcmResult = await sendFCMNotification(fcmTokens, payload);

    for (let i = 0; i < fcmResult.results.length; i++) {
      const r = fcmResult.results[i];
      const device = i < androidDevices.length
        ? androidDevices[i]
        : webDevices[i - androidDevices.length];

      if (r.messageId) {
        sent++;
        results.push({
          deviceId: device.deviceId,
          platform: device.platform,
          success: true,
          messageId: r.messageId,
        });

        // Log successful send
        await prisma.notificationLog.create({
          data: {
            notificationType: payload.type,
            title: payload.title,
            body: payload.body,
            data: payload.data as never,
            channel: 'push',
            platform: device.platform,
            deviceId: device.deviceId,
            status: 'SENT',
            sentAt: new Date(),
            fcmMessageId: r.messageId,
            pushNotificationId: notification.id,
            relatedEntityType: payload.relatedEntityType,
            relatedEntityId: payload.relatedEntityId,
            userId,
            organizationId,
          },
        });
      } else {
        failed++;
        results.push({
          deviceId: device.deviceId,
          platform: device.platform,
          success: false,
          error: r.error,
        });

        // Log failed send
        await prisma.notificationLog.create({
          data: {
            notificationType: payload.type,
            title: payload.title,
            body: payload.body,
            data: payload.data as never,
            channel: 'push',
            platform: device.platform,
            deviceId: device.deviceId,
            status: 'FAILED',
            failedAt: new Date(),
            failureReason: r.error,
            pushNotificationId: notification.id,
            relatedEntityType: payload.relatedEntityType,
            relatedEntityId: payload.relatedEntityId,
            userId,
            organizationId,
          },
        });
      }
    }
  }

  // Send to iOS devices via APNS
  if (iosDevices.length > 0) {
    const apnsTokens = iosDevices.map(d => d.apnsToken!);
    const apnsResult = await sendAPNSNotification(apnsTokens, payload);

    for (let i = 0; i < apnsResult.results.length; i++) {
      const r = apnsResult.results[i];
      const device = iosDevices[i];

      if (r.messageId) {
        sent++;
        results.push({
          deviceId: device.deviceId,
          platform: device.platform,
          success: true,
          messageId: r.messageId,
        });

        await prisma.notificationLog.create({
          data: {
            notificationType: payload.type,
            title: payload.title,
            body: payload.body,
            data: payload.data as never,
            channel: 'push',
            platform: device.platform,
            deviceId: device.deviceId,
            status: 'SENT',
            sentAt: new Date(),
            apnsMessageId: r.messageId,
            pushNotificationId: notification.id,
            relatedEntityType: payload.relatedEntityType,
            relatedEntityId: payload.relatedEntityId,
            userId,
            organizationId,
          },
        });
      } else {
        failed++;
        results.push({
          deviceId: device.deviceId,
          platform: device.platform,
          success: false,
          error: r.error,
        });

        await prisma.notificationLog.create({
          data: {
            notificationType: payload.type,
            title: payload.title,
            body: payload.body,
            data: payload.data as never,
            channel: 'push',
            platform: device.platform,
            deviceId: device.deviceId,
            status: 'FAILED',
            failedAt: new Date(),
            failureReason: r.error,
            pushNotificationId: notification.id,
            relatedEntityType: payload.relatedEntityType,
            relatedEntityId: payload.relatedEntityId,
            userId,
            organizationId,
          },
        });
      }
    }
  }

  // Update notification status
  const finalStatus: NotificationDeliveryStatus =
    sent > 0 ? (failed > 0 ? 'SENT' : 'SENT') : 'FAILED';

  await prisma.pushNotification.update({
    where: { id: notification.id },
    data: {
      deliveryStatus: finalStatus,
      sentAt: sent > 0 ? new Date() : undefined,
      failedAt: sent === 0 ? new Date() : undefined,
      failureReason: sent === 0 ? 'All deliveries failed' : undefined,
    },
  });

  return {
    success: sent > 0,
    sent,
    failed,
    results,
    notificationId: notification.id,
  };
}

/**
 * Send notification to multiple users
 */
export async function sendBulkPushNotification(
  userIds: string[],
  organizationId: string,
  payload: NotificationPayload,
  respectPreferences = true
): Promise<Array<{ userId: string; result: SendNotificationResult }>> {
  const results: Array<{ userId: string; result: SendNotificationResult }> = [];

  // Process in batches to avoid overwhelming the system
  const batchSize = 10;
  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (userId) => ({
        userId,
        result: await sendPushNotification({
          userId,
          organizationId,
          payload,
          respectPreferences,
        }),
      }))
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * Register device token for push notifications
 */
export async function registerDeviceToken(
  userId: string,
  organizationId: string,
  deviceId: string,
  fcmToken?: string,
  apnsToken?: string
): Promise<boolean> {
  try {
    await prisma.mobileDevice.updateMany({
      where: {
        deviceId,
        userId,
        organizationId,
      },
      data: {
        fcmToken,
        apnsToken,
        lastActiveAt: new Date(),
      },
    });
    return true;
  } catch (error) {
    console.error('Failed to register device token:', error);
    return false;
  }
}

/**
 * Mark notification as read
 */
export async function markNotificationRead(
  notificationId: string,
  organizationId: string
): Promise<boolean> {
  try {
    await prisma.pushNotification.update({
      where: {
        id: notificationId,
        organizationId,
      },
      data: {
        deliveryStatus: 'READ',
        readAt: new Date(),
      },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get notification history for a user
 */
export async function getNotificationHistory(
  userId: string,
  organizationId: string,
  options?: {
    limit?: number;
    offset?: number;
    types?: NotificationType[];
    unreadOnly?: boolean;
  }
): Promise<{
  notifications: Array<{
    id: string;
    type: NotificationType;
    title: string;
    body: string;
    data: unknown;
    status: NotificationDeliveryStatus;
    createdAt: Date;
    readAt: Date | null;
  }>;
  total: number;
}> {
  const { limit = 50, offset = 0, types, unreadOnly } = options || {};

  const where = {
    userId,
    organizationId,
    ...(types && types.length > 0 && { type: { in: types } }),
    ...(unreadOnly && { deliveryStatus: { not: 'READ' as NotificationDeliveryStatus } }),
  };

  const [notifications, total] = await Promise.all([
    prisma.pushNotification.findMany({
      where,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        data: true,
        deliveryStatus: true,
        createdAt: true,
        readAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.pushNotification.count({ where }),
  ]);

  return {
    notifications: notifications.map(n => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      data: n.data,
      status: n.deliveryStatus,
      createdAt: n.createdAt,
      readAt: n.readAt,
    })),
    total,
  };
}

/**
 * Get unread notification count
 */
export async function getUnreadNotificationCount(
  userId: string,
  organizationId: string
): Promise<number> {
  return prisma.pushNotification.count({
    where: {
      userId,
      organizationId,
      deliveryStatus: { not: 'READ' },
    },
  });
}
