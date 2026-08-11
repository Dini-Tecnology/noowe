/**
 * Okinawa Environment Configuration
 * 
 * Centralized environment configuration for both Client and Restaurant apps.
 * This file serves as the single source of truth for all environment-dependent values.
 * 
 * PRODUCTION DEPLOYMENT INSTRUCTIONS:
 * 1. Copy this file and rename to env.production.ts
 * 2. Update all URLs and keys with production values
 * 3. Update the build configuration to use the production file
 * 
 * @module shared/config/env
 */

// React Native global __DEV__ type declaration
declare const __DEV__: boolean;

/**
 * Environment type definition
 */
export type Environment = 'development' | 'staging' | 'production';

/**
 * Current environment based on React Native's __DEV__ flag
 * Override this for staging builds
 */
export const CURRENT_ENV = (__DEV__ ? 'development' : 'production') as Environment;

/**
 * Environment-specific configuration interface
 */
interface EnvironmentConfig {
  // API Configuration
  API_BASE_URL: string;
  API_TIMEOUT_MS: number;
  
  // WebSocket Configuration
  WS_URL: string;
  WS_RECONNECT_INTERVAL_MS: number;

  // Supabase public client configuration
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_ANON_KEY: string;
  
  // Authentication
  AUTH_TOKEN_EXPIRY_DAYS: number;
  AUTH_REFRESH_TOKEN_EXPIRY_DAYS: number;
  
  // External Services
  SENTRY_DSN: string;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_APP_ID: string;
  FIREBASE_API_KEY: string;
  FIREBASE_MESSAGING_SENDER_ID: string;
  
  // Analytics
  ANALYTICS_ENABLED: boolean;
  ANALYTICS_DEBUG: boolean;
  
  // Feature Flags
  FEATURES: {
    BIOMETRIC_AUTH: boolean;
    PUSH_NOTIFICATIONS: boolean;
    OFFLINE_MODE: boolean;
    AI_FEATURES: boolean;
    GEOLOCATION: boolean;
  };
  
  // App Store
  APP_STORE_URL: string;
  PLAY_STORE_URL: string;
  
  // Support
  SUPPORT_EMAIL: string;
  SUPPORT_PHONE: string;
  PRIVACY_POLICY_URL: string;
  TERMS_OF_SERVICE_URL: string;
}

/**
 * Development environment configuration
 */
const developmentConfig: EnvironmentConfig = {
  // API Configuration
  API_BASE_URL: 'http://localhost:3000',
  API_TIMEOUT_MS: 30000,
  
  // WebSocket Configuration
  WS_URL: 'ws://localhost:3000',
  WS_RECONNECT_INTERVAL_MS: 5000,

  // Supabase public client configuration
  SUPABASE_URL: requireEnv('EXPO_PUBLIC_SUPABASE_URL', ''),
  SUPABASE_PUBLISHABLE_KEY: requireEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', ''),
  SUPABASE_ANON_KEY: requireEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY', ''),
  
  // Authentication
  AUTH_TOKEN_EXPIRY_DAYS: 7,
  AUTH_REFRESH_TOKEN_EXPIRY_DAYS: 30,
  
  // External Services (use test/sandbox keys in development)
  SENTRY_DSN: '', // Leave empty to disable in development
  FIREBASE_PROJECT_ID: 'okinawa-dev',
  FIREBASE_APP_ID: '1:123456789:ios:dev_app_id',
  FIREBASE_API_KEY: 'AIzaSy_DEVELOPMENT_KEY_REPLACE_ME',
  FIREBASE_MESSAGING_SENDER_ID: '123456789',
  
  // Analytics
  ANALYTICS_ENABLED: false,
  ANALYTICS_DEBUG: true,
  
  // Feature Flags
  FEATURES: {
    BIOMETRIC_AUTH: true,
    PUSH_NOTIFICATIONS: false, // Disable in dev to avoid noise
    OFFLINE_MODE: true,
    AI_FEATURES: true,
    GEOLOCATION: true,
  },
  
  // App Store (placeholder URLs)
  APP_STORE_URL: 'https://apps.apple.com/app/okinawa-client/id0000000000',
  PLAY_STORE_URL: 'https://play.google.com/store/apps/details?id=com.okinawa.client',
  
  // Support
  SUPPORT_EMAIL: 'support@okinawa.dev',
  SUPPORT_PHONE: '+55 11 99999-9999',
  PRIVACY_POLICY_URL: 'https://okinawa.dev/privacy',
  TERMS_OF_SERVICE_URL: 'https://okinawa.dev/terms',
};

/**
 * Staging environment configuration
 */
const stagingConfig: EnvironmentConfig = {
  // API Configuration
  API_BASE_URL: 'https://api-staging.okinawa.com',
  API_TIMEOUT_MS: 30000,
  
  // WebSocket Configuration
  WS_URL: 'wss://api-staging.okinawa.com',
  WS_RECONNECT_INTERVAL_MS: 5000,

  // Supabase public client configuration
  SUPABASE_URL: requireEnv('EXPO_PUBLIC_SUPABASE_URL', ''),
  SUPABASE_PUBLISHABLE_KEY: requireEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', ''),
  SUPABASE_ANON_KEY: requireEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY', ''),
  
  // Authentication
  AUTH_TOKEN_EXPIRY_DAYS: 7,
  AUTH_REFRESH_TOKEN_EXPIRY_DAYS: 30,
  
  // External Services — read from EAS build env
  SENTRY_DSN: requireEnv('SENTRY_DSN', ''),
  FIREBASE_PROJECT_ID: requireEnv('FIREBASE_PROJECT_ID', 'okinawa-staging'),
  FIREBASE_APP_ID: requireEnv('FIREBASE_APP_ID', ''),
  FIREBASE_API_KEY: requireEnv('FIREBASE_API_KEY', ''),
  FIREBASE_MESSAGING_SENDER_ID: requireEnv('FIREBASE_MESSAGING_SENDER_ID', ''),
  
  // Analytics
  ANALYTICS_ENABLED: true,
  ANALYTICS_DEBUG: true,
  
  // Feature Flags
  FEATURES: {
    BIOMETRIC_AUTH: true,
    PUSH_NOTIFICATIONS: true,
    OFFLINE_MODE: true,
    AI_FEATURES: true,
    GEOLOCATION: true,
  },
  
  // App Store (placeholder URLs)
  APP_STORE_URL: 'https://apps.apple.com/app/okinawa-client/id0000000000',
  PLAY_STORE_URL: 'https://play.google.com/store/apps/details?id=com.okinawa.client',
  
  // Support
  SUPPORT_EMAIL: 'support@okinawa.com',
  SUPPORT_PHONE: '+55 11 99999-9999',
  PRIVACY_POLICY_URL: 'https://staging.okinawa.com/privacy',
  TERMS_OF_SERVICE_URL: 'https://staging.okinawa.com/terms',
};

/**
 * Reads EAS build-time environment variable from Expo Constants.
 * In EAS Build, set these via `eas.json` env or `--build-env` flags.
 * Falls back to defaultValue if not set (non-production) or throws in production.
 */
function requireEnv(key: string, defaultValue?: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require('expo-constants').default;
    const value = Constants.expoConfig?.extra?.[key] ?? process.env[key];
    if (value) return value;
  } catch {
    // expo-constants not available (e.g., in tests)
  }
  if (defaultValue !== undefined) return defaultValue;
  console.warn(`[ENV] Missing required env var: ${key}. Set it in eas.json or app.config.`);
  return '';
}

/**
 * Production environment configuration
 *
 * Values are read from EAS build environment variables.
 * Configure in eas.json under build.production.env or via `eas secret:create`.
 */
const productionConfig: EnvironmentConfig = {
  API_BASE_URL: requireEnv('API_BASE_URL', 'https://api.noowebr.com'),
  API_TIMEOUT_MS: 30000,

  WS_URL: requireEnv('WS_URL', 'wss://api.noowebr.com'),
  WS_RECONNECT_INTERVAL_MS: 5000,

  SUPABASE_URL: requireEnv('EXPO_PUBLIC_SUPABASE_URL', ''),
  SUPABASE_PUBLISHABLE_KEY: requireEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', ''),
  SUPABASE_ANON_KEY: requireEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY', ''),

  AUTH_TOKEN_EXPIRY_DAYS: 7,
  AUTH_REFRESH_TOKEN_EXPIRY_DAYS: 30,

  // Valores opcionais via EAS secrets / extra; defaults evitam spam em builds locais sem .env
  SENTRY_DSN: requireEnv('SENTRY_DSN', ''),
  FIREBASE_PROJECT_ID: requireEnv('FIREBASE_PROJECT_ID', ''),
  FIREBASE_APP_ID: requireEnv('FIREBASE_APP_ID', ''),
  FIREBASE_API_KEY: requireEnv('FIREBASE_API_KEY', ''),
  FIREBASE_MESSAGING_SENDER_ID: requireEnv('FIREBASE_MESSAGING_SENDER_ID', ''),

  ANALYTICS_ENABLED: true,
  ANALYTICS_DEBUG: false,

  FEATURES: {
    BIOMETRIC_AUTH: true,
    PUSH_NOTIFICATIONS: true,
    OFFLINE_MODE: true,
    AI_FEATURES: true,
    GEOLOCATION: true,
  },

  APP_STORE_URL: requireEnv('APP_STORE_URL', 'https://apps.apple.com/app/noowe/id0000000000'),
  PLAY_STORE_URL: requireEnv('PLAY_STORE_URL', 'https://play.google.com/store/apps/details?id=com.noowe.client'),

  SUPPORT_EMAIL: 'help@noowebr.com',
  SUPPORT_PHONE: '+55 11 0000-0000',
  PRIVACY_POLICY_URL: requireEnv('PRIVACY_POLICY_URL', 'https://noowebr.com/privacy'),
  TERMS_OF_SERVICE_URL: requireEnv('TERMS_OF_SERVICE_URL', 'https://noowebr.com/terms'),
};

/**
 * Environment configuration map
 */
const configs: Record<Environment, EnvironmentConfig> = {
  development: developmentConfig,
  staging: stagingConfig,
  production: productionConfig,
};

/**
 * Get the current environment configuration
 */
export const getEnvConfig = (): EnvironmentConfig => {
  return configs[CURRENT_ENV];
};

/**
 * Current environment configuration (singleton)
 */
export const ENV = getEnvConfig();

/**
 * Helper to check if running in development
 */
export const isDevelopment = CURRENT_ENV === 'development';

/**
 * Helper to check if running in production
 */
export const isProduction = CURRENT_ENV === 'production';

/**
 * Helper to check if running in staging
 */
export const isStaging = CURRENT_ENV === 'staging';

/**
 * Security validation for production builds
 */
if (isProduction) {
  // Ensure HTTPS is used in production
  if (!ENV.API_BASE_URL.startsWith('https://')) {
    throw new Error('SECURITY ERROR: Production API must use HTTPS');
  }
  
  // Ensure WebSocket Secure is used in production
  if (!ENV.WS_URL.startsWith('wss://')) {
    throw new Error('SECURITY ERROR: Production WebSocket must use WSS');
  }
  
  // Warn if Sentry is not configured
  if (!ENV.SENTRY_DSN || ENV.SENTRY_DSN.includes('YOUR_')) {
    console.warn('WARNING: Sentry DSN is not configured for production');
  }
  
  // Warn if Firebase is not configured
  if (ENV.FIREBASE_API_KEY.includes('REPLACE_ME')) {
    console.warn('WARNING: Firebase is not properly configured for production');
  }
}

export default ENV;
