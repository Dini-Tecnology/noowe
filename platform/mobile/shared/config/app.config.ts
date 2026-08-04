/**
 * Okinawa App Configuration
 * 
 * Expo/React Native app configuration for both Client and Restaurant apps.
 * This file contains app metadata, build configuration, and platform-specific settings.
 * 
 * @module shared/config/app.config
 */

import { ENV, CURRENT_ENV } from './env';

/**
 * App version configuration
 */
export const APP_VERSION = {
  version: '1.0.0',
  buildNumber: '1',
  versionCode: 1, // Android versionCode
};

/**
 * Client App Configuration
 */
export const CLIENT_APP_CONFIG = {
  name: 'Noowe',
  slug: 'noowe',
  scheme: 'noowe',
  
  // App IDs
  ios: {
    bundleIdentifier: 'com.noowe.client',
    buildNumber: APP_VERSION.buildNumber,
    supportsTablet: true,
    associatedDomains: ['applinks:noowebr.com', 'applinks:*.noowebr.com'],
    infoPlist: {
      NSCameraUsageDescription: 'Noowe needs camera access to scan QR codes at restaurants.',
      NSLocationWhenInUseUsageDescription: 'Noowe needs your location to show nearby restaurants.',
      NSLocationAlwaysUsageDescription: 'Noowe tracks your location for drive-thru order coordination.',
      NSFaceIDUsageDescription: 'Use Face ID for quick and secure login.',
      UIBackgroundModes: ['location', 'fetch', 'remote-notification'],
    },
  },
  android: {
    package: 'com.noowe.client',
    versionCode: APP_VERSION.versionCode,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#EA580C',
    },
    permissions: [
      'CAMERA',
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'VIBRATE',
      'RECEIVE_BOOT_COMPLETED',
      'USE_BIOMETRIC',
      'USE_FINGERPRINT',
    ],
    googleServicesFile: './google-services.json',
  },
  
  // Common settings
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  
  // Assets
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#EA580C',
  },
  
  // Updates
  updates: {
    fallbackToCacheTimeout: 0,
    url: 'https://u.expo.dev/YOUR_PROJECT_ID',
  },
  
  // Expo
  owner: 'okinawa-team',
  extra: {
    environment: CURRENT_ENV,
    apiUrl: ENV.API_BASE_URL,
    eas: {
      projectId: 'YOUR_EAS_PROJECT_ID',
    },
  },
};

/**
 * Restaurant App Configuration
 */
export const RESTAURANT_APP_CONFIG = {
  name: 'Noowe Restaurant',
  slug: 'okinawa-restaurant',
  scheme: 'okinawa-restaurant',
  
  // App IDs
  ios: {
    bundleIdentifier: 'com.noowe.restaurant',
    buildNumber: APP_VERSION.buildNumber,
    supportsTablet: true,
    associatedDomains: ['applinks:noowebr.com', 'applinks:*.noowebr.com'],
    infoPlist: {
      NSCameraUsageDescription: 'Camera access for scanning order QR codes.',
      NSFaceIDUsageDescription: 'Use Face ID for quick staff login.',
      UIBackgroundModes: ['fetch', 'remote-notification'],
    },
  },
  android: {
    package: 'com.noowe.restaurant',
    versionCode: APP_VERSION.versionCode,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon-restaurant.png',
      backgroundColor: '#0D9488',
    },
    permissions: [
      'CAMERA',
      'VIBRATE',
      'RECEIVE_BOOT_COMPLETED',
      'USE_BIOMETRIC',
      'USE_FINGERPRINT',
    ],
    googleServicesFile: './google-services.json',
  },
  
  // Common settings
  orientation: 'default', // Allow landscape for KDS screens
  userInterfaceStyle: 'automatic',
  
  // Assets
  icon: './assets/icon-restaurant.png',
  splash: {
    image: './assets/splash-restaurant.png',
    resizeMode: 'contain',
    backgroundColor: '#0D9488',
  },
  
  // Updates
  updates: {
    fallbackToCacheTimeout: 0,
    url: 'https://u.expo.dev/YOUR_PROJECT_ID',
  },
  
  // Expo
  owner: 'okinawa-team',
  extra: {
    environment: CURRENT_ENV,
    apiUrl: ENV.API_BASE_URL,
    eas: {
      projectId: 'YOUR_EAS_PROJECT_ID',
    },
  },
};

/**
 * Deep linking configuration
 */
export const DEEP_LINKING_CONFIG = {
  prefixes: [
    'okinawa://',
    'https://okinawa.com',
    'https://*.okinawa.com',
  ],
  config: {
    screens: {
      // Client App Screens
      Restaurant: 'restaurant/:id',
      Menu: 'restaurant/:id/menu',
      Reservation: 'reservation/:id',
      Order: 'order/:id',
      Payment: 'payment/:orderId',
      Loyalty: 'loyalty',
      Profile: 'profile',
      
      // Restaurant App Screens (different prefix)
      Dashboard: 'staff/dashboard',
      KDS: 'staff/kds',
      Orders: 'staff/orders',
      OrderDetail: 'staff/order/:id',
    },
  },
};

/**
 * Notification configuration
 */
export const NOTIFICATION_CONFIG = {
  // iOS notification categories
  categories: [
    {
      identifier: 'ORDER_UPDATE',
      actions: [
        { identifier: 'VIEW_ORDER', title: 'View Order', options: { opensAppToForeground: true } },
      ],
    },
    {
      identifier: 'RESERVATION_REMINDER',
      actions: [
        { identifier: 'CONFIRM', title: 'Confirm', options: { opensAppToForeground: true } },
        { identifier: 'CANCEL', title: 'Cancel', options: { isDestructive: true } },
      ],
    },
    {
      identifier: 'CALL_WAITER',
      actions: [
        { identifier: 'ACKNOWLEDGE', title: 'On my way', options: { opensAppToForeground: true } },
      ],
    },
  ],
  
  // Android notification channels
  channels: [
    {
      id: 'orders',
      name: 'Order Updates',
      description: 'Notifications about your order status',
      importance: 4, // HIGH
      sound: 'order_notification.wav',
      vibration: true,
    },
    {
      id: 'reservations',
      name: 'Reservation Reminders',
      description: 'Reminders about upcoming reservations',
      importance: 3, // DEFAULT
      sound: 'reservation_notification.wav',
    },
    {
      id: 'promotions',
      name: 'Promotions & Offers',
      description: 'Special offers and promotions',
      importance: 2, // LOW
    },
    {
      id: 'kds',
      name: 'Kitchen Alerts',
      description: 'New order and kitchen alerts',
      importance: 5, // MAX
      sound: 'kds_alert.wav',
      vibration: true,
    },
    {
      id: 'call_waiter',
      name: 'Waiter Calls',
      description: 'Customer requesting assistance',
      importance: 5, // MAX
      sound: 'call_waiter.wav',
      vibration: true,
    },
  ],
};

export default {
  CLIENT_APP_CONFIG,
  RESTAURANT_APP_CONFIG,
  APP_VERSION,
  DEEP_LINKING_CONFIG,
  NOTIFICATION_CONFIG,
};
