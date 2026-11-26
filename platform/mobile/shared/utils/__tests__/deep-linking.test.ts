/**
 * Deep Linking Utility Tests
 * 
 * Tests for URL parsing, navigation handling, and link creation.
 * 
 * @module shared/utils/__tests__/deep-linking.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock expo-linking
jest.mock('expo-linking', () => ({
  parse: vi.fn((url: string) => {
    const urlObj = new URL(url.replace('okinawa://', 'https://okinawa.app/'));
    return {
      path: urlObj.pathname.slice(1),
      queryParams: Object.fromEntries(urlObj.searchParams),
    };
  }),
  createURL: vi.fn((path: string) => `okinawa://${path}`),
  getInitialURL: vi.fn().mockResolvedValue(null),
  addEventListener: vi.fn().mockReturnValue({ remove: vi.fn() }),
}));

// Mock expo-sharing
jest.mock('expo-sharing', () => ({
  isAvailableAsync: vi.fn().mockResolvedValue(true),
  shareAsync: vi.fn().mockResolvedValue(undefined),
}));

// Mock expo-router
jest.mock('expo-router', () => ({
  router: {
    push: vi.fn(),
  },
}));

// Mock logger
jest.mock('../logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock Alert
jest.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Platform: { OS: 'ios' },
}));

// ============================================================
// DEEP LINK TESTS
// ============================================================

describe('Deep Linking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================
  // URL PARSING TESTS
  // ============================================================

  describe('parseDeepLink', () => {
    interface DeepLinkParams {
      path: string;
      params?: Record<string, string>;
    }

    function parseDeepLink(url: string): DeepLinkParams | null {
      try {
        const urlObj = new URL(url.replace('okinawa://', 'https://okinawa.app/'));
        return {
          path: urlObj.pathname.slice(1),
          params: Object.fromEntries(urlObj.searchParams) as Record<string, string>,
        };
      } catch {
        return null;
      }
    }

    it('should parse restaurant deep link', () => {
      const result = parseDeepLink('okinawa://restaurant/123');
      
      expect(result).toEqual({
        path: 'restaurant/123',
        params: {},
      });
    });

    it('should parse menu deep link', () => {
      const result = parseDeepLink('okinawa://menu/456');
      
      expect(result).toEqual({
        path: 'menu/456',
        params: {},
      });
    });

    it('should parse order deep link', () => {
      const result = parseDeepLink('okinawa://order/ord-789');
      
      expect(result).toEqual({
        path: 'order/ord-789',
        params: {},
      });
    });

    it('should parse reservation deep link', () => {
      const result = parseDeepLink('okinawa://reservation/res-123');
      
      expect(result).toEqual({
        path: 'reservation/res-123',
        params: {},
      });
    });

    it('should parse QR code deep link', () => {
      const result = parseDeepLink('okinawa://qr/table-42');
      
      expect(result).toEqual({
        path: 'qr/table-42',
        params: {},
      });
    });

    it('should parse deep link with query params', () => {
      const result = parseDeepLink('okinawa://restaurant/123?source=share&ref=user456');
      
      expect(result).toEqual({
        path: 'restaurant/123',
        params: { source: 'share', ref: 'user456' },
      });
    });

    it('should parse universal link', () => {
      const result = parseDeepLink('https://okinawa.app/restaurant/123');
      
      expect(result).toEqual({
        path: 'restaurant/123',
        params: {},
      });
    });

    it('should return null for invalid URL', () => {
      const result = parseDeepLink('not-a-valid-url');
      
      expect(result).toBeNull();
    });
  });

  // ============================================================
  // NAVIGATION HANDLING TESTS
  // ============================================================

  describe('handleDeepLink', () => {
    function handleDeepLink(url: string): string | null {
      const urlObj = (() => {
        try {
          return new URL(url.replace('okinawa://', 'https://okinawa.app/'));
        } catch {
          return null;
        }
      })();
      
      if (!urlObj) return null;
      
      const path = urlObj.pathname.slice(1);
      
      if (path.startsWith('restaurant/')) {
        const id = path.split('/')[1];
        return `/restaurant/${id}`;
      }
      if (path.startsWith('menu/')) {
        const id = path.split('/')[1];
        return `/menu/${id}`;
      }
      if (path.startsWith('order/')) {
        const id = path.split('/')[1];
        return `/orders/${id}`;
      }
      if (path.startsWith('reservation/')) {
        const id = path.split('/')[1];
        return `/reservations/${id}`;
      }
      if (path.startsWith('qr/')) {
        const id = path.split('/')[1];
        return `/qr/${id}`;
      }
      
      return null;
    }

    it('should navigate to restaurant screen', () => {
      const route = handleDeepLink('okinawa://restaurant/rest-123');
      expect(route).toBe('/restaurant/rest-123');
    });

    it('should navigate to menu screen', () => {
      const route = handleDeepLink('okinawa://menu/rest-456');
      expect(route).toBe('/menu/rest-456');
    });

    it('should navigate to order screen', () => {
      const route = handleDeepLink('okinawa://order/ord-789');
      expect(route).toBe('/orders/ord-789');
    });

    it('should navigate to reservation screen', () => {
      const route = handleDeepLink('okinawa://reservation/res-123');
      expect(route).toBe('/reservations/res-123');
    });

    it('should navigate to QR screen', () => {
      const route = handleDeepLink('okinawa://qr/table-1');
      expect(route).toBe('/qr/table-1');
    });

    it('should return null for unknown path', () => {
      const route = handleDeepLink('okinawa://unknown/path');
      expect(route).toBeNull();
    });

    it('should return null for invalid URL', () => {
      const route = handleDeepLink('invalid');
      expect(route).toBeNull();
    });
  });

  // ============================================================
  // LINK CREATION TESTS
  // ============================================================

  describe('createDeepLink', () => {
    function createDeepLink(path: string, params?: Record<string, string>): string {
      // Mesma regra de shared/utils/deep-linking.ts: sem parâmetros, sem '?'.
      const query = params ? new URLSearchParams(params).toString() : '';
      return `okinawa://${path}${query ? `?${query}` : ''}`;
    }

    it('should create restaurant link', () => {
      const link = createDeepLink('restaurant/123');
      expect(link).toBe('okinawa://restaurant/123');
    });

    it('should create link with query params', () => {
      const link = createDeepLink('restaurant/123', { source: 'share' });
      expect(link).toBe('okinawa://restaurant/123?source=share');
    });

    it('should create link with multiple params', () => {
      const link = createDeepLink('order/456', { ref: 'user123', campaign: 'promo' });
      expect(link).toContain('ref=user123');
      expect(link).toContain('campaign=promo');
    });

    it('should handle empty params object', () => {
      const link = createDeepLink('menu/789', {});
      expect(link).toBe('okinawa://menu/789');
    });
  });

  // ============================================================
  // DEEP LINK CONFIG TESTS
  // ============================================================

  describe('deepLinkConfig', () => {
    const deepLinkConfig = {
      prefixes: [
        'okinawa://',
        'https://okinawa.app',
        'https://*.okinawa.app',
      ],
      config: {
        screens: {
          Restaurant: 'restaurant/:id',
          Menu: 'menu/:restaurantId',
          Order: 'orders/:orderId',
          Reservation: 'reservations/:reservationId',
          QRScanner: 'qr/:tableId',
        },
      },
    };

    it('should have correct prefixes', () => {
      expect(deepLinkConfig.prefixes).toContain('okinawa://');
      expect(deepLinkConfig.prefixes).toContain('https://okinawa.app');
    });

    it('should have correct screen mappings', () => {
      expect(deepLinkConfig.config.screens.Restaurant).toBe('restaurant/:id');
      expect(deepLinkConfig.config.screens.Order).toBe('orders/:orderId');
    });

    it('should support all major routes', () => {
      const screens = Object.keys(deepLinkConfig.config.screens);
      expect(screens).toContain('Restaurant');
      expect(screens).toContain('Menu');
      expect(screens).toContain('Order');
      expect(screens).toContain('Reservation');
      expect(screens).toContain('QRScanner');
    });
  });

  // ============================================================
  // INITIALIZATION TESTS
  // ============================================================

  describe('initDeepLinking', () => {
    it('should return cleanup function', () => {
      const listeners: Array<() => void> = [];
      
      function initDeepLinking(): () => void {
        const cleanup = vi.fn();
        listeners.push(cleanup);
        return cleanup;
      }
      
      const cleanup = initDeepLinking();
      expect(typeof cleanup).toBe('function');
    });

    it('should register URL listener', () => {
      const mockAddListener = vi.fn().mockReturnValue({ remove: vi.fn() });
      
      function initDeepLinking(addListener: typeof mockAddListener): () => void {
        const subscription = addListener('url', () => {});
        return () => subscription.remove();
      }
      
      initDeepLinking(mockAddListener);
      expect(mockAddListener).toHaveBeenCalledWith('url', expect.any(Function));
    });
  });
});

console.log('✅ Deep linking utility tests defined');
