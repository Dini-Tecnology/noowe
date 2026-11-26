/**
 * useNotifications Hook Tests — Shared
 *
 * Tests for notification fetching, unread count tracking,
 * mark-as-read mutations, and delete operations.
 *
 * @module shared/__tests__/useNotifications.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// MOCKS
// ============================================================

const mockGetNotifications = vi.fn();
const mockGetUnreadNotificationsCount = vi.fn();
const mockMarkNotificationRead = vi.fn();
const mockMarkMultipleNotificationsRead = vi.fn();
const mockDeleteNotification = vi.fn();
const mockDeleteAllReadNotifications = vi.fn();

jest.mock('../services/api', () => ({
  default: {
    getNotifications: (...args: any[]) => mockGetNotifications(...args),
    getUnreadNotificationsCount: (...args: any[]) => mockGetUnreadNotificationsCount(...args),
    markNotificationRead: (...args: any[]) => mockMarkNotificationRead(...args),
    markMultipleNotificationsRead: (...args: any[]) => mockMarkMultipleNotificationsRead(...args),
    deleteNotification: (...args: any[]) => mockDeleteNotification(...args),
    deleteAllReadNotifications: (...args: any[]) => mockDeleteAllReadNotifications(...args),
  },
}));

const mockInvalidate = vi.fn();

jest.mock('../config/react-query', () => ({
  queryKeys: {
    notifications: {
      list: (filters?: any) => ['notifications', 'list', filters],
      unreadCount: ['notifications', 'unreadCount'],
    },
  },
  invalidateQueries: {
    afterNotificationMutation: () => mockInvalidate(),
  },
}));

// Mock TanStack Query to test hook configuration
let lastQueryConfig: any = null;
let lastMutationConfig: any = null;

jest.mock('@tanstack/react-query', () => ({
  useQuery: (config: any) => {
    lastQueryConfig = config;
    return {
      data: undefined,
      isLoading: false,
      isError: false,
    };
  },
  useMutation: (config: any) => {
    lastMutationConfig = config;
    return {
      mutate: vi.fn((arg?: any) => {
        const result = config.mutationFn(arg);
        if (config.onSuccess) config.onSuccess();
        return result;
      }),
      isPending: false,
    };
  },
}));

import {
  useNotifications,
  useUnreadNotificationsCount,
  useMarkNotificationRead,
  useMarkMultipleNotificationsRead,
  useDeleteNotification,
  useDeleteAllReadNotifications,
} from '../hooks/useNotifications';

// ============================================================
// TESTS
// ============================================================

describe('useNotifications hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastQueryConfig = null;
    lastMutationConfig = null;
  });

  describe('useNotifications', () => {
    it('creates query with correct queryKey for notifications list', () => {
      useNotifications();

      expect(lastQueryConfig).toBeTruthy();
      expect(lastQueryConfig.queryKey).toEqual(['notifications', 'list', undefined]);
    });

    it('passes filter parameters to queryKey', () => {
      const filters = { unread_only: true, limit: 20 };
      useNotifications(filters);

      expect(lastQueryConfig.queryKey).toEqual([
        'notifications',
        'list',
        filters,
      ]);
    });

    it('sets staleTime to 1 minute for fresh data', () => {
      useNotifications();

      expect(lastQueryConfig.staleTime).toBe(60000); // 1 minute
    });

    it('enables auto-refetch every 60 seconds', () => {
      useNotifications();

      expect(lastQueryConfig.refetchInterval).toBe(60000);
    });

    it('calls ApiService.getNotifications as queryFn', () => {
      useNotifications({ type: 'order' });

      lastQueryConfig.queryFn();

      expect(mockGetNotifications).toHaveBeenCalledWith({ type: 'order' });
    });
  });

  describe('useUnreadNotificationsCount', () => {
    it('creates query with unreadCount queryKey', () => {
      useUnreadNotificationsCount();

      expect(lastQueryConfig.queryKey).toEqual([
        'notifications',
        'unreadCount',
      ]);
    });

    it('sets staleTime to 30 seconds', () => {
      useUnreadNotificationsCount();

      expect(lastQueryConfig.staleTime).toBe(30000);
    });

    it('enables auto-refetch every 30 seconds', () => {
      useUnreadNotificationsCount();

      expect(lastQueryConfig.refetchInterval).toBe(30000);
    });
  });

  describe('useMarkNotificationRead', () => {
    it('calls markNotificationRead with notification ID', () => {
      mockMarkNotificationRead.mockResolvedValue({});

      const { mutate } = useMarkNotificationRead();
      mutate('notif-123');

      expect(mockMarkNotificationRead).toHaveBeenCalledWith('notif-123');
    });

    it('invalidates notification queries on success', () => {
      mockMarkNotificationRead.mockResolvedValue({});

      const { mutate } = useMarkNotificationRead();
      mutate('notif-123');

      expect(mockInvalidate).toHaveBeenCalled();
    });
  });

  describe('useMarkMultipleNotificationsRead', () => {
    it('calls markMultipleNotificationsRead with array of IDs', () => {
      mockMarkMultipleNotificationsRead.mockResolvedValue({});

      const { mutate } = useMarkMultipleNotificationsRead();
      mutate(['notif-1', 'notif-2', 'notif-3']);

      expect(mockMarkMultipleNotificationsRead).toHaveBeenCalledWith([
        'notif-1',
        'notif-2',
        'notif-3',
      ]);
    });

    it('invalidates notification queries on success', () => {
      mockMarkMultipleNotificationsRead.mockResolvedValue({});

      const { mutate } = useMarkMultipleNotificationsRead();
      mutate(['notif-1']);

      expect(mockInvalidate).toHaveBeenCalled();
    });
  });

  describe('useDeleteNotification', () => {
    it('calls deleteNotification with notification ID', () => {
      mockDeleteNotification.mockResolvedValue({});

      const { mutate } = useDeleteNotification();
      mutate('notif-456');

      expect(mockDeleteNotification).toHaveBeenCalledWith('notif-456');
    });

    it('invalidates notification queries on success', () => {
      mockDeleteNotification.mockResolvedValue({});

      const { mutate } = useDeleteNotification();
      mutate('notif-456');

      expect(mockInvalidate).toHaveBeenCalled();
    });
  });

  describe('useDeleteAllReadNotifications', () => {
    it('calls deleteAllReadNotifications', () => {
      mockDeleteAllReadNotifications.mockResolvedValue({});

      const { mutate } = useDeleteAllReadNotifications();
      mutate(undefined);

      expect(mockDeleteAllReadNotifications).toHaveBeenCalled();
    });

    it('invalidates notification queries on success', () => {
      mockDeleteAllReadNotifications.mockResolvedValue({});

      const { mutate } = useDeleteAllReadNotifications();
      mutate(undefined);

      expect(mockInvalidate).toHaveBeenCalled();
    });
  });
});
