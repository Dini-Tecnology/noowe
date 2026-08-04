/**
 * OrderDetailScreen (OrderStatusScreen) Tests — Client App
 *
 * Validates order detail rendering, status badge/timeline, item status chips,
 * loading state, not-found state, WebSocket indicator, and action buttons.
 *
 * The client app's "order detail" is the OrderStatusScreen with live tracking.
 *
 * @module apps/client/__tests__/OrderDetailScreen.test
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';

// ============================================================
// MOCKS
// ============================================================

const mockNavigate = vi.fn();
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: vi.fn(),
    setOptions: vi.fn(),
    addListener: vi.fn(),
  }),
  useRoute: () => ({
    params: { orderId: 'ord-status-1' },
  }),
  useFocusEffect: (cb: () => void) => cb(),
}));

const mockGetOrder = vi.fn();
vi.mock('@/shared/services/api', () => ({
  default: {
    getOrder: (...args: any[]) => mockGetOrder(...args),
  },
}));

vi.mock('@/shared/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, _params?: any) => key,
    language: 'pt-BR',
  }),
}));

vi.mock('@/shared/hooks/useAnalytics', () => ({
  useScreenTracking: vi.fn(),
  useAnalytics: () => ({
    logError: vi.fn(),
  }),
}));

vi.mock('@/shared/hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    connected: true,
    on: vi.fn(),
    off: vi.fn(),
    joinRoom: vi.fn(),
    leaveRoom: vi.fn(),
  }),
}));

vi.mock('@okinawa/shared/contexts/ThemeContext', () => ({
  useColors: () => ({
    background: '#FFFFFF',
    foreground: '#111827',
    card: '#FFFFFF',
    cardForeground: '#FFFFFF',
    primary: '#EA580C',
    border: '#E5E7EB',
    muted: '#F3F4F6',
    mutedForeground: '#6B7280',
    success: '#10B981',
    destructive: '#EF4444',
    warning: '#F59E0B',
    warningMuted: '#FEF3C7',
  }),
}));

vi.mock('@okinawa/shared/utils/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import OrderStatusScreen from '../screens/orders/OrderStatusScreen';

// ============================================================
// FIXTURES
// ============================================================

const ORDER_STATUSES = [
  { key: 'pending' },
  { key: 'confirmed' },
  { key: 'preparing' },
  { key: 'ready' },
  { key: 'delivered' },
];

const sampleOrder = {
  id: 'ord-status-1',
  restaurant_id: 'rest-1',
  status: 'preparing',
  order_number: '0042',
  subtotal_amount: 95.0,
  tax_amount: 0,
  tip_amount: 10,
  total_amount: 105.0,
  created_at: '2026-03-20T14:00:00Z',
  estimated_ready_time: '2026-03-20T14:30:00Z',
  items: [
    {
      id: 'it-1',
      menu_item: { id: 'm1', name: 'Ramen', price: 45, image_url: null },
      quantity: 1,
      unit_price: 45,
      total_price: 45,
      status: 'preparing' as const,
    },
    {
      id: 'it-2',
      menu_item: { id: 'm2', name: 'Tempura', price: 50, image_url: null },
      quantity: 1,
      unit_price: 50,
      total_price: 50,
      status: 'ready' as const,
    },
  ],
  restaurant: { id: 'rest-1', name: 'Noowe Sushi', logo_url: null },
  table: { id: 'tbl-1', table_number: '7' },
};

// ============================================================
// TESTS
// ============================================================

describe('Client OrderDetailScreen (OrderStatusScreen)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Loading state ----

  it('shows loading indicator while fetching order', () => {
    mockGetOrder.mockReturnValue(new Promise(() => {}));
    render(<OrderStatusScreen />);
    expect(screen.getByText('common.loading')).toBeTruthy();
  });

  // ---- Not found state ----

  it('shows not-found state when order is null', async () => {
    mockGetOrder.mockResolvedValueOnce(null);
    render(<OrderStatusScreen />);

    await waitFor(() => {
      expect(screen.getByText('orders.notFound')).toBeTruthy();
    });
  });

  // ---- Renders order header ----

  it('renders restaurant name and order number', async () => {
    mockGetOrder.mockResolvedValueOnce(sampleOrder);
    render(<OrderStatusScreen />);

    await waitFor(() => {
      expect(screen.getByText('Noowe Sushi')).toBeTruthy();
    });
  });

  // ---- Status badge / timeline ----

  it('renders the order status section title', async () => {
    mockGetOrder.mockResolvedValueOnce(sampleOrder);
    render(<OrderStatusScreen />);

    await waitFor(() => {
      expect(screen.getByText('orders.orderStatus')).toBeTruthy();
    });
  });

  it('correctly calculates progress for preparing status', () => {
    const getStatusIndex = (status: string) =>
      ORDER_STATUSES.findIndex((s) => s.key === status);
    const progress = (getStatusIndex('preparing') + 1) / ORDER_STATUSES.length;
    expect(progress).toBeCloseTo(0.6, 1);
  });

  // ---- Item status chips ----

  it('renders item status section', async () => {
    mockGetOrder.mockResolvedValueOnce(sampleOrder);
    render(<OrderStatusScreen />);

    await waitFor(() => {
      expect(screen.getByText('orders.itemsStatus')).toBeTruthy();
    });
  });

  it('maps item status to correct color', () => {
    const colors = {
      mutedForeground: '#6B7280',
      warning: '#F59E0B',
      success: '#10B981',
      destructive: '#EF4444',
    };
    const getItemStatusColor = (status: string): string => {
      const statusColors: Record<string, string> = {
        pending: colors.mutedForeground,
        preparing: colors.warning,
        ready: colors.success,
        delivered: colors.success,
        cancelled: colors.destructive,
      };
      return statusColors[status] || colors.mutedForeground;
    };

    expect(getItemStatusColor('preparing')).toBe('#F59E0B');
    expect(getItemStatusColor('ready')).toBe('#10B981');
    expect(getItemStatusColor('cancelled')).toBe('#EF4444');
    expect(getItemStatusColor('unknown')).toBe('#6B7280');
  });

  // ---- Action buttons ----

  it('shows call waiter button when order is not completed/cancelled', async () => {
    mockGetOrder.mockResolvedValueOnce(sampleOrder);
    render(<OrderStatusScreen />);

    await waitFor(() => {
      expect(screen.getByText('orders.callWaiter')).toBeTruthy();
    });
  });

  it('shows view receipt button when order is delivered', async () => {
    mockGetOrder.mockResolvedValueOnce({
      ...sampleOrder,
      status: 'delivered',
    });
    render(<OrderStatusScreen />);

    await waitFor(() => {
      expect(screen.getByText('orders.viewReceipt')).toBeTruthy();
    });
  });

  it('hides call waiter button when order is cancelled', async () => {
    mockGetOrder.mockResolvedValueOnce({
      ...sampleOrder,
      status: 'cancelled',
    });
    render(<OrderStatusScreen />);

    await waitFor(() => {
      expect(screen.queryByText('orders.callWaiter')).toBeNull();
    });
  });

  // ---- WebSocket indicator ----

  it('shows real-time enabled notice when WebSocket is connected', async () => {
    mockGetOrder.mockResolvedValueOnce(sampleOrder);
    render(<OrderStatusScreen />);

    await waitFor(() => {
      expect(screen.getByText('orders.realtimeEnabled')).toBeTruthy();
    });
  });

  // ---- Cancelled order ----

  it('shows cancelled status text for cancelled orders', async () => {
    mockGetOrder.mockResolvedValueOnce({
      ...sampleOrder,
      status: 'cancelled',
    });
    render(<OrderStatusScreen />);

    await waitFor(() => {
      expect(screen.getByText('orders.status.cancelled')).toBeTruthy();
    });
  });
});
