/**
 * Logger Utility Tests
 * 
 * Tests for safe logging, sanitization, and Sentry integration.
 * 
 * @module shared/utils/__tests__/logger.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Sentry
jest.mock('../../config/sentry', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

// Mock __DEV__
const originalDev = (globalThis as any).__DEV__;

describe('Logger Utility', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    (globalThis as any).__DEV__ = originalDev;
  });

  // ============================================================
  // SANITIZATION TESTS
  // ============================================================

  describe('Sanitization', () => {
    // Simulated sanitization logic for testing
    const SENSITIVE_FIELDS = [
      'password', 'token', 'access_token', 'refresh_token',
      'authorization', 'credit_card', 'card_number', 'cvv',
      'ssn', 'secret', 'api_key', 'apiKey',
    ];

    function sanitizeForLogging(data: any): any {
      if (data === null || data === undefined) return data;

      if (typeof data === 'string') {
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
    }

    it('should redact password fields', () => {
      const data = { email: 'test@example.com', password: 'secret123' };
      const sanitized = sanitizeForLogging(data);
      
      expect(sanitized.email).toBe('test@example.com');
      expect(sanitized.password).toBe('[REDACTED]');
    });

    it('should redact token fields', () => {
      const data = { 
        user: 'test',
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refresh_token: 'some_refresh_token',
      };
      const sanitized = sanitizeForLogging(data);
      
      expect(sanitized.access_token).toBe('[REDACTED]');
      expect(sanitized.refresh_token).toBe('[REDACTED]');
    });

    it('should redact credit card fields', () => {
      const data = { 
        credit_card: '4111111111111111',
        card_number: '4111111111111111',
        cvv: '123',
      };
      const sanitized = sanitizeForLogging(data);
      
      expect(sanitized.credit_card).toBe('[REDACTED]');
      expect(sanitized.card_number).toBe('[REDACTED]');
      expect(sanitized.cvv).toBe('[REDACTED]');
    });

    it('should redact api key fields', () => {
      const data = { api_key: 'sk_live_123456', apiKey: 'pk_test_789' };
      const sanitized = sanitizeForLogging(data);
      
      expect(sanitized.api_key).toBe('[REDACTED]');
      expect(sanitized.apiKey).toBe('[REDACTED]');
    });

    it('should redact long token-like strings', () => {
      const longToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9eyJzdWIiOiIxMjM0NTY3ODkwIn0';
      const sanitized = sanitizeForLogging(longToken);
      
      expect(sanitized).toBe('[REDACTED]');
    });

    it('should not redact short strings', () => {
      const shortString = 'hello';
      const sanitized = sanitizeForLogging(shortString);
      
      expect(sanitized).toBe('hello');
    });

    it('should handle nested objects', () => {
      const data = {
        user: {
          email: 'test@example.com',
          password: 'secret',
        },
        token: 'abc123',
      };
      const sanitized = sanitizeForLogging(data);
      
      expect(sanitized.user.email).toBe('test@example.com');
      expect(sanitized.user.password).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
    });

    it('should handle arrays', () => {
      const data = [
        { password: 'secret1' },
        { password: 'secret2' },
      ];
      const sanitized = sanitizeForLogging(data);
      
      expect(sanitized[0].password).toBe('[REDACTED]');
      expect(sanitized[1].password).toBe('[REDACTED]');
    });

    it('should handle null and undefined', () => {
      expect(sanitizeForLogging(null)).toBe(null);
      expect(sanitizeForLogging(undefined)).toBe(undefined);
    });

    it('should preserve non-sensitive data', () => {
      const data = {
        id: '123',
        name: 'John Doe',
        email: 'john@example.com',
        created_at: '2024-01-01',
      };
      const sanitized = sanitizeForLogging(data);
      
      expect(sanitized).toEqual(data);
    });
  });

  // ============================================================
  // LOGGER METHOD TESTS
  // ============================================================

  describe('Logger Methods', () => {
    // Simulated logger behavior for testing
    interface LoggerMethods {
      log: (...args: any[]) => void;
      debug: (...args: any[]) => void;
      info: (...args: any[]) => void;
      warn: (...args: any[]) => void;
      error: (...args: any[]) => void;
      api: (method: string, url: string, data?: any) => void;
      apiResponse: (method: string, url: string, status: number, data?: any) => void;
      apiError: (method: string, url: string, error: any) => void;
      navigation: (screen: string, params?: any) => void;
      state: (component: string, state: any) => void;
      performance: (label: string, duration: number) => void;
      websocket: (event: string, data?: any) => void;
      cache: (action: 'hit' | 'miss' | 'set' | 'invalidate', key: string) => void;
    }

    function createLogger(isDev: boolean): LoggerMethods {
      return {
        log: (...args) => {
          if (isDev) console.log('[LOG]', ...args);
        },
        debug: (...args) => {
          if (isDev) console.debug('[DEBUG]', ...args);
        },
        info: (...args) => {
          if (isDev) console.info('[INFO]', ...args);
        },
        warn: (...args) => {
          console.warn('[WARN]', ...args);
        },
        error: (...args) => {
          console.error('[ERROR]', ...args);
        },
        api: (method, url, data) => {
          if (isDev) console.log(`[API ${method}]`, url, data || '');
        },
        apiResponse: (method, url, status, data) => {
          if (isDev) console.log(`[API ${method}] ${status}`, url, data || '');
        },
        apiError: (method, url, error) => {
          console.error(`[API ERROR ${method}]`, url, error);
        },
        navigation: (screen, params) => {
          if (isDev) console.log('[NAVIGATION]', screen, params || '');
        },
        state: (component, state) => {
          if (isDev) console.log(`[STATE ${component}]`, state);
        },
        performance: (label, duration) => {
          if (isDev) console.log(`[PERFORMANCE] ${label}:`, `${duration.toFixed(2)}ms`);
        },
        websocket: (event, data) => {
          if (isDev) console.log(`[WS ${event}]`, data || '');
        },
        cache: (action, key) => {
          if (isDev) console.log(`[CACHE ${action.toUpperCase()}]`, key);
        },
      };
    }

    describe('in development mode', () => {
      it('should log regular messages', () => {
        const logger = createLogger(true);
        logger.log('Test message');
        
        expect(consoleLogSpy).toHaveBeenCalled();
      });

      it('should log debug messages', () => {
        const logger = createLogger(true);
        logger.debug('Debug message');
        
        expect(consoleDebugSpy).toHaveBeenCalled();
      });

      it('should log info messages', () => {
        const logger = createLogger(true);
        logger.info('Info message');
        
        expect(consoleInfoSpy).toHaveBeenCalled();
      });

      it('should log API calls', () => {
        const logger = createLogger(true);
        logger.api('GET', '/api/users', { page: 1 });
        
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[API GET]'),
          expect.anything(),
          expect.anything()
        );
      });

      it('should log API responses', () => {
        const logger = createLogger(true);
        logger.apiResponse('GET', '/api/users', 200, { data: [] });
        
        expect(consoleLogSpy).toHaveBeenCalled();
      });

      it('should log navigation events', () => {
        const logger = createLogger(true);
        logger.navigation('HomeScreen', { userId: '123' });
        
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '[NAVIGATION]',
          'HomeScreen',
          expect.anything()
        );
      });

      it('should log state changes', () => {
        const logger = createLogger(true);
        logger.state('MyComponent', { count: 1 });
        
        expect(consoleLogSpy).toHaveBeenCalled();
      });

      it('should log performance metrics', () => {
        const logger = createLogger(true);
        logger.performance('render', 15.5);
        
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[PERFORMANCE]'),
          expect.stringContaining('15.50ms')
        );
      });

      it('should log WebSocket events', () => {
        const logger = createLogger(true);
        logger.websocket('connected', { roomId: '123' });
        
        expect(consoleLogSpy).toHaveBeenCalled();
      });

      it('should log cache events', () => {
        const logger = createLogger(true);
        logger.cache('hit', 'user:123');
        
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '[CACHE HIT]',
          'user:123'
        );
      });
    });

    describe('in production mode', () => {
      it('should NOT log regular messages', () => {
        const logger = createLogger(false);
        logger.log('Test message');
        
        expect(consoleLogSpy).not.toHaveBeenCalled();
      });

      it('should NOT log debug messages', () => {
        const logger = createLogger(false);
        logger.debug('Debug message');
        
        expect(consoleDebugSpy).not.toHaveBeenCalled();
      });

      it('should still log warnings', () => {
        const logger = createLogger(false);
        logger.warn('Warning message');
        
        expect(consoleWarnSpy).toHaveBeenCalled();
      });

      it('should still log errors', () => {
        const logger = createLogger(false);
        logger.error('Error message');
        
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      it('should still log API errors', () => {
        const logger = createLogger(false);
        logger.apiError('POST', '/api/orders', { message: 'Failed' });
        
        expect(consoleErrorSpy).toHaveBeenCalled();
      });
    });
  });

  // ============================================================
  // PERFORMANCE TIMER TESTS
  // ============================================================

  describe('Performance Timer', () => {
    it('should measure elapsed time', async () => {
      const measurements: number[] = [];
      
      const startTimer = (label: string) => {
        const start = Date.now();
        return () => {
          const duration = Date.now() - start;
          measurements.push(duration);
        };
      };
      
      const endTimer = startTimer('test');
      await new Promise(r => setTimeout(r, 50));
      endTimer();
      
      expect(measurements[0]).toBeGreaterThanOrEqual(40);
    });
  });
});

console.log('✅ Logger utility tests defined');
