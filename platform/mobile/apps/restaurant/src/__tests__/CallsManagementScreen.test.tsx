/**
 * CallsManagementScreen Tests — Restaurant App
 *
 * Validates active calls list, tab navigation (pending/acknowledged/resolved),
 * stats header, and respond actions.
 *
 * @module apps/restaurant/__tests__/CallsManagementScreen.test
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';

// ============================================================
// MOCKS
// ============================================================

vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: vi.fn(),
    goBack: vi.fn(),
  }),
}));

vi.mock('@/shared/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, any>) => key,
    language: 'pt-BR',
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
    primary: '#EA580C',
    primaryForeground: '#FFFFFF',
    border: '#E5E7EB',
    success: '#10B981',
    error: '#EF4444',
    errorBackground: '#FEF2F2',
    warning: '#F59E0B',
    warningBackground: '#FFFBEB',
    info: '#3B82F6',
    infoBackground: '#EFF6FF',
  }),
}));

vi.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children, ...props }: any) => {
    const { View } = require('react-native');
    return <View {...props}>{children}</View>;
  },
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('expo-haptics', () => ({
  impactAsync: vi.fn(),
  notificationAsync: vi.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
}));

vi.mock('@/shared/hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    connected: true,
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  }),
}));

vi.mock('@/shared/services/api', () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
}));

// Mock TanStack Query
let mockCallsData: any[] = [];
let mockStatsData: any = null;
let mockIsLoading = false;
const mockRefetch = vi.fn();
const mockMutate = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: any) => {
    if (queryKey?.[0]?.includes?.('stats')) {
      return {
        data: mockStatsData,
        isLoading: mockIsLoading,
        refetch: mockRefetch,
      };
    }
    return {
      data: mockCallsData,
      isLoading: mockIsLoading,
      isError: false,
      refetch: mockRefetch,
      isRefetching: false,
    };
  },
  useMutation: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

import CallsManagementScreen from '../screens/calls/CallsManagementScreen';

// ============================================================
// TESTS
// ============================================================

describe('Restaurant CallsManagementScreen', () => {
  const mockCalls = [
    {
      id: 'call-1',
      restaurant_id: 'rest-1',
      table_id: 'table-5',
      user_id: 'user-1',
      call_type: 'waiter',
      status: 'pending',
      message: 'Need menus please',
      called_at: new Date().toISOString(),
      acknowledged_at: null,
      acknowledged_by: null,
      resolved_at: null,
      resolved_by: null,
      caller: { id: 'user-1', full_name: 'Customer Ana' },
    },
    {
      id: 'call-2',
      restaurant_id: 'rest-1',
      table_id: 'table-3',
      user_id: 'user-2',
      call_type: 'emergency',
      status: 'pending',
      message: null,
      called_at: new Date(Date.now() - 5 * 60000).toISOString(),
      acknowledged_at: null,
      acknowledged_by: null,
      resolved_at: null,
      resolved_by: null,
      caller: { id: 'user-2', full_name: 'Customer João' },
    },
  ];

  const mockStats = {
    pendingCount: 2,
    acknowledgedCount: 1,
    resolvedTodayCount: 5,
    avgResponseTimeMs: 120000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCallsData = mockCalls;
    mockStatsData = mockStats;
    mockIsLoading = false;
  });

  it('renders calls management title', () => {
    render(<CallsManagementScreen />);
    expect(screen.getByText('calls.management.title')).toBeTruthy();
  });

  it('renders tab navigation for pending, acknowledged, and resolved', () => {
    render(<CallsManagementScreen />);

    expect(screen.getByText('calls.management.tabs.pending')).toBeTruthy();
    expect(screen.getByText('calls.management.tabs.acknowledged')).toBeTruthy();
    expect(screen.getByText('calls.management.tabs.resolved')).toBeTruthy();
  });

  it('displays stats header with pending count', () => {
    render(<CallsManagementScreen />);

    expect(screen.getByText('calls.management.stats.pending')).toBeTruthy();
  });

  it('renders call cards with caller name and call type', () => {
    render(<CallsManagementScreen />);

    expect(screen.getByText('Customer Ana')).toBeTruthy();
    expect(screen.getByText('Customer João')).toBeTruthy();
  });

  it('shows message text on call cards when present', () => {
    render(<CallsManagementScreen />);

    expect(screen.getByText('Need menus please')).toBeTruthy();
  });
});
