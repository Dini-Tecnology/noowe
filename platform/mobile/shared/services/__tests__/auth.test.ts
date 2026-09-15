import { authService } from '../auth';
import { secureStorage } from '../secure-storage';
import { supabaseAuthAdapter } from '../supabase-auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('../secure-storage', () => ({
  secureStorage: {
    setAccessToken: jest.fn(),
    setRefreshToken: jest.fn(),
    setUser: jest.fn(),
    clearAuth: jest.fn(),
  },
}));

jest.mock('../supabase-auth', () => ({
  supabaseAuthAdapter: {
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
    getSession: jest.fn(),
    isAuthenticated: jest.fn(),
	    refreshToken: jest.fn(),
	    sendPasswordReset: jest.fn(),
	    exchangeCodeForSession: jest.fn(),
	    recoverSessionFromUrl: jest.fn(),
	    updatePassword: jest.fn(),
	    onAuthStateChange: jest.fn(() => jest.fn()),
	  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  multiRemove: jest.fn(),
}));

jest.mock('../biometric-auth', () => ({
	  biometricAuthService: {
	    authenticateAndGetUserId: jest.fn(),
	    disable: jest.fn(() => Promise.resolve()),
	  },
	}));

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

const mockedSupabaseAuth = supabaseAuthAdapter as jest.Mocked<typeof supabaseAuthAdapter>;
const mockedSecureStorage = secureStorage as jest.Mocked<typeof secureStorage>;
const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('uses Supabase Auth and persists the returned session', async () => {
      const mockResponse = {
        user: {
          id: '1',
          email: 'test@example.com',
          full_name: 'Test User',
          role: 'customer',
          roles: [{ role: 'customer' }],
          restaurant_ids: [],
        },
        access_token: 'token123',
        refresh_token: 'refresh123',
      };
      mockedSupabaseAuth.login.mockResolvedValueOnce(mockResponse);

      const result = await authService.login('test@example.com', 'password123');

      expect(result).toEqual(mockResponse);
      expect(mockedSupabaseAuth.login).toHaveBeenCalledWith('test@example.com', 'password123');
      expect(mockedSecureStorage.setAccessToken).toHaveBeenCalledWith('token123');
      expect(mockedSecureStorage.setRefreshToken).toHaveBeenCalledWith('refresh123');
      expect(mockedSecureStorage.setUser).toHaveBeenCalledWith(mockResponse.user);
      expect(mockedAsyncStorage.setItem).not.toHaveBeenCalledWith('access_token', 'token123');
      expect(mockedAsyncStorage.setItem).not.toHaveBeenCalledWith('refresh_token', 'refresh123');
    });

    it('propagates Supabase login errors', async () => {
      mockedSupabaseAuth.login.mockRejectedValueOnce(new Error('Invalid credentials'));

      await expect(authService.login('test@example.com', 'wrong')).rejects.toThrow('Invalid credentials');
    });
  });

  describe('register', () => {
    it('supports email confirmation without storing a session prematurely', async () => {
      mockedSupabaseAuth.register.mockResolvedValueOnce({
        user: {
          id: '1',
          email: 'new@example.com',
          full_name: 'John Doe',
          role: 'customer',
          roles: [{ role: 'customer' }],
          restaurant_ids: [],
        },
        needsEmailConfirmation: true,
      } as any);

      const result = await authService.register('new@example.com', 'password123', 'John Doe');

      expect(result).toEqual({
        user: {
          id: '1',
          email: 'new@example.com',
          full_name: 'John Doe',
          role: 'customer',
          roles: [{ role: 'customer' }],
          restaurant_ids: [],
        },
        needsEmailConfirmation: true,
      });
      expect(mockedSupabaseAuth.register).toHaveBeenCalledWith('new@example.com', 'password123', 'John Doe');
      expect(mockedSecureStorage.setAccessToken).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('signs out from Supabase and clears local auth data', async () => {
      await authService.logout();

      expect(mockedSupabaseAuth.logout).toHaveBeenCalled();
      expect(mockedSecureStorage.clearAuth).toHaveBeenCalled();
    });
  });
});
