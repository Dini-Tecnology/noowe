import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import logger from '../utils/logger';
import { ApiService } from './api';

/**
 * Push Notifications Service
 *
 * Handles:
 * - Requesting permissions
 * - Registering device token with backend
 * - Handling incoming notifications
 * - Scheduling local notifications
 */

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

interface NotificationData {
  type: 'order' | 'reservation' | 'promotion' | 'general';
  id?: string;
  title: string;
  body: string;
  data?: Record<string, any>;
}

class PushNotificationService {
  private expoPushToken: string | null = null;
  private notificationListener: Notifications.Subscription | null = null;
  private responseListener: Notifications.Subscription | null = null;

  /**
   * Initialize push notifications
   */
  async initialize(): Promise<void> {
    try {
      // Register for push notifications
      const token = await this.registerForPushNotifications();
      if (token) {
        this.expoPushToken = token;
        logger.info('Push token obtained:', token);

        // Send token to backend
        await this.registerTokenWithBackend(token);
      }

      // Set up notification listeners
      this.setupNotificationListeners();
    } catch (error) {
      logger.error('Error initializing push notifications:', error);
    }
  }

  /**
   * Register for push notifications and get token
   */
  private async registerForPushNotifications(): Promise<string | null> {
    try {
      // Check if running on physical device
      if (!Device.isDevice) {
        logger.warn('Push notifications only work on physical devices');
        return null;
      }

      // Check existing permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      // Request permissions if not granted
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        logger.warn('Push notification permission not granted');
        return null;
      }

      // Get Expo push token — projectId from app config (eas.json / app.json extra.eas.projectId)
      let projectId: string | undefined;
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Constants = require('expo-constants').default;
        projectId = Constants.expoConfig?.extra?.eas?.projectId;
      } catch {
        // expo-constants not available
      }
      if (!projectId || projectId === 'your-project-id') {
        logger.error('Push notifications: EAS projectId not configured. Set extra.eas.projectId in app.json.');
        return null;
      }
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId,
      });

      logger.debug('Expo push token:', tokenData.data);

      // Configure Android notification channel
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF6B35',
        });

        await Notifications.setNotificationChannelAsync('orders', {
          name: 'Order Updates',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#4CAF50',
        });

        await Notifications.setNotificationChannelAsync('reservations', {
          name: 'Reservation Updates',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#2196F3',
        });
      }

      return tokenData.data;
    } catch (error) {
      logger.error('Error registering for push notifications:', error);
      return null;
    }
  }

  /**
   * Register push token with backend
   */
  private async registerTokenWithBackend(token: string): Promise<void> {
    try {
      await ApiService.registerPushToken({
        token,
        platform: Platform.OS,
        device_info: {
          brand: Device.brand ?? 'unknown',
          model: Device.modelName ?? 'unknown',
          os_version: Device.osVersion ?? 'unknown',
        },
      });
      logger.info('Push token registered with backend');
    } catch (error) {
      logger.error('Error registering token with backend:', error);
    }
  }

  /**
   * Set up notification listeners
   */
  private setupNotificationListeners(): void {
    // Listener for notifications received while app is foregrounded
    this.notificationListener = Notifications.addNotificationReceivedListener(
      (notification) => {
        logger.debug('Notification received:', notification);
        this.handleNotificationReceived(notification);
      }
    );

    // Listener for user interaction with notification
    this.responseListener = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        logger.debug('Notification response:', response);
        this.handleNotificationResponse(response);
      }
    );
  }

  /**
   * Handle notification received
   */
  private handleNotificationReceived(
    notification: Notifications.Notification
  ): void {
    const { title, body, data } = notification.request.content;
    logger.info('Notification:', { title, body, data });

    // You can show a custom in-app notification here if needed
  }

  /**
   * Handle notification response (user tapped notification)
   */
  private handleNotificationResponse(
    response: Notifications.NotificationResponse
  ): void {
    const { data } = response.notification.request.content;
    logger.info('User tapped notification:', data);

    // Navigate based on notification type
    if (data?.type === 'order' && data?.id) {
      // Navigate to order details
      // router.push(`/orders/${data.id}`);
    } else if (data?.type === 'reservation' && data?.id) {
      // Navigate to reservation details
      // router.push(`/reservations/${data.id}`);
    }
  }

  /**
   * Schedule local notification
   */
  async scheduleLocalNotification(
    notification: NotificationData,
    trigger?: Notifications.NotificationTriggerInput
  ): Promise<string> {
    try {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.body,
          data: notification.data || {},
          sound: true,
        },
        trigger: trigger || null, // null = immediate
      });

      logger.info('Local notification scheduled:', notificationId);
      return notificationId;
    } catch (error) {
      logger.error('Error scheduling local notification:', error);
      throw error;
    }
  }

  /**
   * Cancel scheduled notification
   */
  async cancelNotification(notificationId: string): Promise<void> {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      logger.info('Notification cancelled:', notificationId);
    } catch (error) {
      logger.error('Error cancelling notification:', error);
    }
  }

  /**
   * Cancel all scheduled notifications
   */
  async cancelAllNotifications(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      logger.info('All notifications cancelled');
    } catch (error) {
      logger.error('Error cancelling all notifications:', error);
    }
  }

  /**
   * Get badge count
   */
  async getBadgeCount(): Promise<number> {
    try {
      return await Notifications.getBadgeCountAsync();
    } catch (error) {
      logger.error('Error getting badge count:', error);
      return 0;
    }
  }

  /**
   * Set badge count
   */
  async setBadgeCount(count: number): Promise<void> {
    try {
      await Notifications.setBadgeCountAsync(count);
    } catch (error) {
      logger.error('Error setting badge count:', error);
    }
  }

  /**
   * Clear badge count
   */
  async clearBadgeCount(): Promise<void> {
    await this.setBadgeCount(0);
  }

  /**
   * Get Expo push token
   */
  getExpoPushToken(): string | null {
    return this.expoPushToken;
  }

  /**
   * Cleanup listeners
   */
  cleanup(): void {
    if (this.notificationListener) {
      this.notificationListener.remove();
    }
    if (this.responseListener) {
      this.responseListener.remove();
    }
  }
}

export const pushNotificationService = new PushNotificationService();

export default pushNotificationService;
