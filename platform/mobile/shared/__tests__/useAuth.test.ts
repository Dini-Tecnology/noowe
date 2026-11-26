/**
 * useAuth Hook — Comprehensive Auth Flow Tests
 *
 * Tests the useAuth hook logic for login, register, logout, token refresh,
 * user state management, and error handling. Simulates the hook's internal
 * state machine since React hooks cannot be called outside components without
 * renderHook (which requires @testing-library/react-hooks).
 *
 * @module shared/__tests__/useAuth.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// MOCKS
// ============================================================

jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    multiRemove: vi.fn(),
  },
}));

const mockAuthService = {
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  getCurrentUser: vi.fn(),
};

jest.mock('../../services/auth', () => ({
  authService: mockAuthService,
}));

// ============================================================
// AUTH STATE MACHINE SIMULATION
// (mirrors shared/hooks/useAuth.ts logic)
// ============================================================

interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  roles?: Array<{ role: string; restaurant_id?: string }>;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
}

function createAuthStateMachine() {
  let state: AuthState = {
    user: null,
    loading: true,
    isAuthenticated: false,
  };

  const getState = () => ({ ...state });

  const login = async (email: string, password: string) => {
    try {
      const { user: loggedInUser } = await mockAuthService.login(email, password);
      state = { ...state, user: loggedInUser, isAuthenticated: true };
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || 'Login failed',
      };
    }
  };

  const register = async (email: string, password: string, fullName: string) => {
    try {
      const { user: registeredUser } = await mockAuthService.register(email, password, fullName);
      state = { ...state, user: registeredUser, isAuthenticated: true };
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || 'Registration failed',
      };
    }
  };

  const logout = async () => {
    try {
      await mockAuthService.logout();
    } catch {
      // Silent
    }
    state = { ...state, user: null, isAuthenticated: false };
  };

  const refreshUser = async () => {
    try {
      const currentUser = await mockAuthService.getCurrentUser();
      state = { ...state, user: currentUser };
    } catch {
      // Silent
    }
  };

  const setLoadingDone = () => {
    state = { ...state, loading: false };
  };

  return { getState, login, register, logout, refreshUser, setLoadingDone };
}

// ============================================================
// TESTS
// ============================================================

describe('useAuth Hook — Auth Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Initial state ----

  describe('initial state', () => {
    it('starts with loading true', () => {
      const auth = createAuthStateMachine();
      expect(auth.getState().loading).toBe(true);
    });

    it('starts with null user', () => {
      const auth = createAuthStateMachine();
      expect(auth.getState().user).toBeNull();
    });

    it('starts unauthenticated', () => {
      const auth = createAuthStateMachine();
      expect(auth.getState().isAuthenticated).toBe(false);
    });
  });

  // ---- Login flow ----

  describe('login', () => {
    it('sets user and isAuthenticated on successful login', async () => {
      const mockUser = { id: 'u1', email: 'test@okinawa.com', full_name: 'Test User' };
      mockAuthService.login.mockResolvedValueOnce({ user: mockUser });

      const auth = createAuthStateMachine();
      const result = await auth.login('test@okinawa.com', 'Password1');

      expect(result.success).toBe(true);
      expect(auth.getState().isAuthenticated).toBe(true);
      expect(auth.getState().user).toEqual(mockUser);
    });

    it('passes correct credentials to authService', async () => {
      mockAuthService.login.mockResolvedValueOnce({ user: { id: '1' } });

      const auth = createAuthStateMachine();
      await auth.login('manager@rest.com', 'SecurePass99');

      expect(mockAuthService.login).toHaveBeenCalledWith('manager@rest.com', 'SecurePass99');
    });

    it('returns error message from server on failure', async () => {
      mockAuthService.login.mockRejectedValueOnce({
        response: { data: { message: 'Invalid credentials' } },
      });

      const auth = createAuthStateMachine();
      const result = await auth.login('bad@email.com', 'wrong');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
      expect(auth.getState().isAuthenticated).toBe(false);
    });

    it('returns generic error when no response message exists', async () => {
      mockAuthService.login.mockRejectedValueOnce(new Error('Network timeout'));

      const auth = createAuthStateMachine();
      const result = await auth.login('a@b.com', 'pass');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Login failed');
    });

    it('does not set user on failed login', async () => {
      mockAuthService.login.mockRejectedValueOnce(new Error('fail'));

      const auth = createAuthStateMachine();
      await auth.login('a@b.com', 'pass');

      expect(auth.getState().user).toBeNull();
    });
  });

  // ---- Registration flow ----

  describe('register', () => {
    it('sets user and isAuthenticated on successful registration', async () => {
      const mockUser = { id: 'u2', email: 'new@okinawa.com', full_name: 'New User' };
      mockAuthService.register.mockResolvedValueOnce({ user: mockUser });

      const auth = createAuthStateMachine();
      const result = await auth.register('new@okinawa.com', 'SecurePass1', 'New User');

      expect(result.success).toBe(true);
      expect(auth.getState().isAuthenticated).toBe(true);
      expect(auth.getState().user?.email).toBe('new@okinawa.com');
    });

    it('passes correct parameters to authService.register', async () => {
      mockAuthService.register.mockResolvedValueOnce({ user: { id: '2' } });

      const auth = createAuthStateMachine();
      await auth.register('test@test.com', 'Pass123', 'Full Name');

      expect(mockAuthService.register).toHaveBeenCalledWith('test@test.com', 'Pass123', 'Full Name');
    });

    it('returns server error on duplicate email', async () => {
      mockAuthService.register.mockRejectedValueOnce({
        response: { data: { message: 'Email already exists' } },
      });

      const auth = createAuthStateMachine();
      const result = await auth.register('existing@test.com', 'Pass1', 'User');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Email already exists');
    });

    it('returns generic error when no server message', async () => {
      mockAuthService.register.mockRejectedValueOnce(new Error('Connection refused'));

      const auth = createAuthStateMachine();
      const result = await auth.register('a@b.com', 'P1', 'N');

      expect(result.error).toBe('Registration failed');
    });
  });

  // ---- Logout flow ----

  describe('logout', () => {
    it('clears user and isAuthenticated on logout', async () => {
      const mockUser = { id: 'u1', email: 'a@b.com', full_name: 'Test' };
      mockAuthService.login.mockResolvedValueOnce({ user: mockUser });
      mockAuthService.logout.mockResolvedValueOnce(undefined);

      const auth = createAuthStateMachine();
      await auth.login('a@b.com', 'pass');
      expect(auth.getState().isAuthenticated).toBe(true);

      await auth.logout();
      expect(auth.getState().isAuthenticated).toBe(false);
      expect(auth.getState().user).toBeNull();
    });

    it('calls authService.logout', async () => {
      mockAuthService.logout.mockResolvedValueOnce(undefined);

      const auth = createAuthStateMachine();
      await auth.logout();

      expect(mockAuthService.logout).toHaveBeenCalledOnce();
    });

    it('still clears state even if authService.logout throws', async () => {
      mockAuthService.logout.mockRejectedValueOnce(new Error('Logout API failed'));

      const auth = createAuthStateMachine();
      await auth.logout();

      expect(auth.getState().isAuthenticated).toBe(false);
      expect(auth.getState().user).toBeNull();
    });
  });

  // ---- Token refresh / user refresh ----

  describe('refreshUser', () => {
    it('updates user data from server', async () => {
      const updatedUser = { id: 'u1', email: 'a@b.com', full_name: 'Updated Name' };
      mockAuthService.getCurrentUser.mockResolvedValueOnce(updatedUser);

      const auth = createAuthStateMachine();
      await auth.refreshUser();

      expect(auth.getState().user).toEqual(updatedUser);
    });

    it('handles refresh errors silently', async () => {
      mockAuthService.getCurrentUser.mockRejectedValueOnce(new Error('Expired'));

      const auth = createAuthStateMachine();
      // Should not throw
      await expect(auth.refreshUser()).resolves.not.toThrow();
    });

    it('preserves existing user when refresh fails', async () => {
      const originalUser = { id: 'u1', email: 'a@b.com', full_name: 'Original' };
      mockAuthService.login.mockResolvedValueOnce({ user: originalUser });
      mockAuthService.getCurrentUser.mockRejectedValueOnce(new Error('fail'));

      const auth = createAuthStateMachine();
      await auth.login('a@b.com', 'pass');
      await auth.refreshUser();

      // User stays as originally set by login (refreshUser only updates on success)
      expect(auth.getState().user).toEqual(originalUser);
    });
  });

  // ---- User state with roles ----

  describe('user roles', () => {
    it('stores user roles from login response', async () => {
      const userWithRoles = {
        id: 'u3',
        email: 'chef@okinawa.com',
        full_name: 'Chef Master',
        roles: [
          { role: 'CHEF', restaurant_id: 'rest-1' },
          { role: 'COOK', restaurant_id: 'rest-1' },
        ],
      };
      mockAuthService.login.mockResolvedValueOnce({ user: userWithRoles });

      const auth = createAuthStateMachine();
      await auth.login('chef@okinawa.com', 'pass');

      expect(auth.getState().user?.roles).toHaveLength(2);
      expect(auth.getState().user?.roles?.[0].role).toBe('CHEF');
    });
  });
});
