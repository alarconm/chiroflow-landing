import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { notificationsApi } from './api';

// Notification categories
export const NOTIFICATION_CATEGORIES = {
  APPOINTMENT: 'appointment',
  MESSAGE: 'message',
  ALERT: 'alert',
  FORM: 'form',
  TREATMENT: 'treatment',
} as const;

// Configure notification channel (Android)
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#053e67',
  });

  Notifications.setNotificationChannelAsync('appointments', {
    name: 'Appointments',
    description: 'Appointment reminders and updates',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#053e67',
  });

  Notifications.setNotificationChannelAsync('messages', {
    name: 'Messages',
    description: 'Messages from your care team',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#053e67',
  });

  Notifications.setNotificationChannelAsync('alerts', {
    name: 'Alerts',
    description: 'Important alerts and notifications',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 250, 500],
    lightColor: '#c90000',
  });
}

// Get push notification token
export async function getPushToken(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  try {
    // Get existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permissions if not granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permission not granted');
      return null;
    }

    // Get Expo push token
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    return tokenData.data;
  } catch (error) {
    console.error('Failed to get push token:', error);
    return null;
  }
}

// Register device for push notifications
export async function registerForPushNotifications(): Promise<boolean> {
  try {
    const token = await getPushToken();
    if (!token) {
      return false;
    }

    const platform = Platform.OS as 'ios' | 'android';
    const response = await notificationsApi.registerDevice(token, platform);

    return response.success;
  } catch (error) {
    console.error('Failed to register for push notifications:', error);
    return false;
  }
}

// Unregister device from push notifications
export async function unregisterFromPushNotifications(): Promise<boolean> {
  try {
    const response = await notificationsApi.unregisterDevice();
    return response.success;
  } catch (error) {
    console.error('Failed to unregister from push notifications:', error);
    return false;
  }
}

// Schedule a local notification
export async function scheduleLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
  trigger?: Notifications.NotificationTriggerInput
): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: 'default',
    },
    trigger: trigger || null, // null = immediate
  });
}

// Cancel a scheduled notification
export async function cancelNotification(notificationId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}

// Cancel all scheduled notifications
export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// Get badge count
export async function getBadgeCount(): Promise<number> {
  return Notifications.getBadgeCountAsync();
}

// Set badge count
export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count);
}

// Clear badge
export async function clearBadge(): Promise<void> {
  await Notifications.setBadgeCountAsync(0);
}

// Handle notification received while app is foregrounded
export function addNotificationReceivedListener(
  listener: (notification: Notifications.Notification) => void
): Notifications.EventSubscription {
  return Notifications.addNotificationReceivedListener(listener);
}

// Handle notification response (user tapped notification)
export function addNotificationResponseReceivedListener(
  listener: (response: Notifications.NotificationResponse) => void
): Notifications.EventSubscription {
  return Notifications.addNotificationResponseReceivedListener(listener);
}

// Get last notification response (for app opened via notification)
export async function getLastNotificationResponse(): Promise<Notifications.NotificationResponse | null> {
  return Notifications.getLastNotificationResponseAsync();
}

// Parse notification data for navigation
export interface NotificationNavigationData {
  screen?: string;
  params?: Record<string, unknown>;
}

export function parseNotificationData(
  notification: Notifications.Notification
): NotificationNavigationData {
  const data = notification.request.content.data;

  if (!data) {
    return {};
  }

  // Handle appointment notifications
  if (data.type === 'appointment') {
    return {
      screen: 'Appointment',
      params: {
        appointmentId: data.appointmentId,
      },
    };
  }

  // Handle message notifications
  if (data.type === 'message') {
    return {
      screen: 'Messages',
      params: {
        conversationId: data.conversationId,
      },
    };
  }

  // Handle form notifications
  if (data.type === 'form') {
    return {
      screen: 'Form',
      params: {
        formId: data.formId,
      },
    };
  }

  // Default: just return the data as params
  return {
    screen: data.screen as string | undefined,
    params: data.params as Record<string, unknown> | undefined,
  };
}
