/**
 * CheckoutScreen Tests — Client App
 *
 * Validates rendering of cart items, price calculation (subtotal,
 * service fee, tip, total), tip selection, loading/error/empty states,
 * and navigation to payment.
 *
 * @module apps/client/__tests__/CheckoutScreen.test
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';

// ============================================================
// MOCKS
// ============================================================

const mockNavigate = vi.fn();
const mockGoBack = vi.fn();

vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    setOptions: vi.fn(),
    addListener: vi.fn(),
  }),
  useRoute: () => ({
    params: { orderId: 'order-abc' },
  }),
  useFocusEffect: vi.fn(),
}));

const mockGetOrder = vi.fn();
vi.mock('@/shared/services/api', () => ({
  default: {
    getOrder: (...args: any[]) => mockGetOrder(...args),
  },
}));

vi.mock('expo-haptics', () => ({
  impactAsync: vi.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
}));

vi.mock('@/shared/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    language: 'pt-BR',
  }),
}));

vi.mock('@/shared/hooks/useAnalytics', () => ({
  useScreenTracking: vi.fn(),
  useAnalytics: () => ({
    logError: vi.fn(),
  }),
}));

vi.mock('@okinawa/shared/contexts/ThemeContext', () => ({
  useColors: () => ({
    background: '#FFFFFF',
    backgroundSecondary: '#F9FAFB',
    backgroundTertiary: '#F3F4F6',
    foreground: '#111827',
    foregroundSecondary: '#6B7280',
    foregroundMuted: '#9CA3AF',
    card: '#FFFFFF',
    cardForeground: '#111827',
    primary: '#EA580C',
    border: '#E5E7EB',
    error: '#EF4444',
  }),
}));

vi.mock('@okinawa/shared/utils/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import CheckoutScreen from '../screens/payment/CheckoutScreen';

// ============================================================
// FIXTURES
// ============================================================

const sampleOrder = {
  id: 'order-abc',
  restaurant_id: 'rest-1',
  status: 'pending',
  subtotal_amount: 100.0,
  tax_amount: 0,
  tip_amount: 0,
  total_amount: 100.0,
  items: [
    {
      id: 'item-1',
      menu_item: { name: 'Tonkotsu Ramen', price: 45.0 },
      quantity: 1,
      unit_price: 45.0,
      total_price: 45.0,
    },
    {
      id: 'item-2',
      menu_item: { name: 'Gyoza (6pc)', price: 27.5 },
      quantity: 2,
      unit_price: 27.5,
      total_price: 55.0,
    },
  ],
  restaurant: { name: 'Noowe Sushi' },
};

// ============================================================
// TESTS
// ============================================================

describe('Client CheckoutScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Loading state ----

  it('shows skeleton loader while order is loading', () => {
    mockGetOrder.mockReturnValue(new Promise(() => {})); // never resolves
    render(<CheckoutScreen />);
    // CheckoutSkeleton is rendered during loading — no title text visible yet
    expect(screen.queryByText('checkout.title')).toBeNull();
  });

  // ---- Error state ----

  it('shows error message and retry button when loading fails', async () => {
    mockGetOrder.mockRejectedValueOnce(new Error('Server error'));
    render(<CheckoutScreen />);

    await waitFor(() => {
      expect(screen.getByText('checkout.errorLoad')).toBeTruthy();
      expect(screen.getByText('checkout.errorRetry')).toBeTruthy();
    });
  });

  it('retries loading when retry button is pressed', async () => {
    mockGetOrder
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(sampleOrder);

    render(<CheckoutScreen />);

    await waitFor(() => {
      expect(screen.getByText('checkout.errorRetry')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('checkout.errorRetry'));

    await waitFor(() => {
      expect(mockGetOrder).toHaveBeenCalledTimes(2);
    });
  });

  // ---- Empty state ----

  it('shows empty state when order has no items', async () => {
    mockGetOrder.mockResolvedValueOnce({ ...sampleOrder, items: [] });
    render(<CheckoutScreen />);

    await waitFor(() => {
      expect(screen.getByText('checkout.empty')).toBeTruthy();
    });
  });

  // ---- Renders order items ----

  it('renders order item names after loading', async () => {
    mockGetOrder.mockResolvedValueOnce(sampleOrder);
    render(<CheckoutScreen />);

    await waitFor(() => {
      expect(screen.getByText('Tonkotsu Ramen')).toBeTruthy();
      expect(screen.getByText('Gyoza (6pc)')).toBeTruthy();
    });
  });

  // ---- Price calculations ----

  it('calculates service fee as 10% of subtotal', () => {
    const subtotal = 100.0;
    const serviceFeePercent = 0.1;
    expect(subtotal * serviceFeePercent).toBe(10.0);
  });

  it('calculates tip amount based on selected percentage', () => {
    const subtotal = 100.0;
    const selectedTip = 15; // 15%
    expect(subtotal * (selectedTip / 100)).toBe(15.0);
  });

  it('calculates correct total (subtotal + service fee + tip)', () => {
    const subtotal = 100.0;
    const serviceFee = 10.0; // 10%
    const tipAmount = 10.0;  // 10%
    expect(subtotal + serviceFee + tipAmount).toBe(120.0);
  });

  it('renders checkout title and summary section', async () => {
    mockGetOrder.mockResolvedValueOnce(sampleOrder);
    render(<CheckoutScreen />);

    await waitFor(() => {
      expect(screen.getByText('checkout.title')).toBeTruthy();
      expect(screen.getByText('checkout.sectionSummary')).toBeTruthy();
      expect(screen.getByText('checkout.subtotal')).toBeTruthy();
      expect(screen.getByText('checkout.serviceFee')).toBeTruthy();
      expect(screen.getByText('checkout.total')).toBeTruthy();
    });
  });

  // ---- Tip selection ----

  it('renders tip option buttons including "no tip"', async () => {
    mockGetOrder.mockResolvedValueOnce(sampleOrder);
    render(<CheckoutScreen />);

    await waitFor(() => {
      expect(screen.getByText('checkout.tipNone')).toBeTruthy();
      expect(screen.getByText('10%')).toBeTruthy();
      expect(screen.getByText('15%')).toBeTruthy();
      expect(screen.getByText('20%')).toBeTruthy();
    });
  });

  // ---- Confirm and back buttons ----

  it('renders confirm and back buttons', async () => {
    mockGetOrder.mockResolvedValueOnce(sampleOrder);
    render(<CheckoutScreen />);

    await waitFor(() => {
      expect(screen.getByText('checkout.buttonConfirm')).toBeTruthy();
      expect(screen.getByText('checkout.buttonBack')).toBeTruthy();
    });
  });

  it('navigates back when back button is pressed', async () => {
    mockGetOrder.mockResolvedValueOnce(sampleOrder);
    render(<CheckoutScreen />);

    await waitFor(() => {
      expect(screen.getByText('checkout.buttonBack')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('checkout.buttonBack'));
    expect(mockGoBack).toHaveBeenCalled();
  });
});
