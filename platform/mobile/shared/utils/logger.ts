/**
 * Safe logger that only logs in development mode
 * Prevents sensitive information from leaking in production
 * Integrates with Sentry for production error tracking
 */

import { captureException, captureMessage, addBreadcrumb } from '../config/sentry';

declare const __DEV__: boolean;
const isDevelopment = __DEV__;

// Sensitive fields that should never be logged
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'credit_card',
  'card_number',
  'cvv',
  'ssn',
  'secret',
  'api_key',
  'apiKey',
];

/**
 * Sanitize objects to remove sensitive data before logging
 */
const sanitizeForLogging = (data: any): any => {
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    // Check if it looks like a token/password
    if (data.length > 20 && /^[A-Za-z0-9+/=_-]+$/.test(data)) {
      return '[REDACTED]';
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeForLogging);
  }

  if (typeof data === 'object') {
    const sanitized: Record<string, any> = {};
    for (const key of Object.keys(data)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field.toLowerCase()))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeForLogging(data[key]);
      }
    }
    return sanitized;
  }

  return data;
};

export const logger = {
  /**
   * Log general information (only in development)
   */
  log: (...args: any[]) => {
    if (isDevelopment) {
      console.log('[LOG]', ...args);
    }
  },

  /**
   * Log debug information (only in development)
   */
  debug: (...args: any[]) => {
    if (isDevelopment) {
      console.debug('[DEBUG]', ...args);
    }
  },

  /**
   * Log information messages (only in development)
   */
  info: (...args: any[]) => {
    if (isDevelopment) {
      console.info('[INFO]', ...args);
    }
  },

  /**
   * Log warnings (in both development and production)
   */
  warn: (...args: any[]) => {
    console.warn('[WARN]', ...args);
    
    // Send warning to Sentry in production
    if (!isDevelopment) {
      const message = args.map(arg => 
        typeof arg === 'string' ? arg : JSON.stringify(sanitizeForLogging(arg))
      ).join(' ');
      captureMessage(message, 'warning');
    }
  },

  /**
   * Log errors (in both development and production)
   * In production, sanitizes data before logging and sends to Sentry
   */
  error: (...args: any[]) => {
    if (isDevelopment) {
      console.error('[ERROR]', ...args);
    } else {
      // Sanitize all arguments to prevent sensitive data leakage
      const sanitizedArgs = args.map(arg => {
        if (arg instanceof Error) {
          return { name: arg.name, message: arg.message };
        }
        return sanitizeForLogging(arg);
      });
      console.error('[ERROR]', ...sanitizedArgs);
    }

    // Send error to Sentry in production
    if (!isDevelopment) {
      const error = args.find(arg => arg instanceof Error);
      if (error) {
        captureException(error, { extra: sanitizeForLogging(args) });
      } else {
        const message = args.map(arg => 
          typeof arg === 'string' ? arg : JSON.stringify(sanitizeForLogging(arg))
        ).join(' ');
        captureMessage(message, 'error');
      }
    }
  },

  /**
   * Log API calls (only in development)
   */
  api: (method: string, url: string, data?: any) => {
    if (isDevelopment) {
      console.log(`[API ${method}]`, url, data || '');
    }
    
    // Add breadcrumb for API calls
    addBreadcrumb(`${method} ${url}`, 'http', 'info', data ? sanitizeForLogging(data) : undefined);
  },

  /**
   * Log API responses (only in development)
   */
  apiResponse: (method: string, url: string, status: number, data?: any) => {
    if (isDevelopment) {
      console.log(`[API ${method}] ${status}`, url, data || '');
    }
    
    // Add breadcrumb for API responses
    addBreadcrumb(`${method} ${url} - ${status}`, 'http', status >= 400 ? 'error' : 'info');
  },

  /**
   * Log API errors (in both development and production)
   * Sanitizes sensitive data and sends to Sentry
   */
  apiError: (method: string, url: string, error: any) => {
    // Remove query params from URL to prevent token leakage
    const safeUrl = url.split('?')[0];
    
    if (isDevelopment) {
      console.error(`[API ERROR ${method}]`, url, error);
    } else {
      // In production: only log safe information
      const safeError = {
        message: error.message || 'Unknown error',
        status: error.response?.status,
        code: error.code,
      };
      console.error('[API ERROR]', method, safeUrl, safeError);
    }

    // Send API error to Sentry
    if (!isDevelopment) {
      const errorObj = error instanceof Error ? error : new Error(error.message || 'API Error');
      captureException(errorObj, {
        method,
        url: safeUrl,
        status: error.response?.status,
        code: error.code,
      });
    }
  },

  /**
   * Log navigation events (only in development)
   */
  navigation: (screen: string, params?: any) => {
    if (isDevelopment) {
      console.log('[NAVIGATION]', screen, params || '');
    }
    
    // Add breadcrumb for navigation
    addBreadcrumb(`Navigate to ${screen}`, 'navigation', 'info', params ? sanitizeForLogging(params) : undefined);
  },

  /**
   * Log state changes (only in development)
   */
  state: (component: string, state: any) => {
    if (isDevelopment) {
      console.log(`[STATE ${component}]`, state);
    }
  },

  /**
   * Log performance metrics (only in development)
   */
  performance: (label: string, duration: number) => {
    if (isDevelopment) {
      console.log(`[PERFORMANCE] ${label}:`, `${duration.toFixed(2)}ms`);
    }
  },

  /**
   * Create a performance timer
   */
  startTimer: (label: string) => {
    if (!isDevelopment) return () => {};

    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      logger.performance(label, duration);
    };
  },

  /**
   * Log WebSocket events (only in development)
   */
  websocket: (event: string, data?: any) => {
    if (isDevelopment) {
      console.log(`[WS ${event}]`, data || '');
    }
    
    // Add breadcrumb for WebSocket events
    addBreadcrumb(`WS: ${event}`, 'websocket', 'info', data ? sanitizeForLogging(data) : undefined);
  },

  /**
   * Log cache hits/misses (only in development)
   */
  cache: (action: 'hit' | 'miss' | 'set' | 'invalidate', key: string) => {
    if (isDevelopment) {
      console.log(`[CACHE ${action.toUpperCase()}]`, key);
    }
  },
};

/**
 * Disable all console logs in production
 * Call this in App.tsx before rendering
 */
export const disableConsoleLogs = () => {
  if (!isDevelopment) {
    console.log = () => {};
    console.debug = () => {};
    console.info = () => {};
    // Keep console.warn and console.error for production debugging
  }
};

export default logger;
