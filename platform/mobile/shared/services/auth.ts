/**
 * Auth Service
 *
 * Handles authentication operations including login, register, social auth,
 * and session management. Enhanced for passwordless-first flow.
 * Auth, session refresh, and profile sync use Supabase only.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { secureStorage } from './secure-storage';
import { isMissingAuthSessionError, supabaseAuthAdapter } from './supabase-auth';
import { biometricAuthService } from './biometric-auth';
import logger from '../utils/logger';

// Auth state change listeners
type AuthStateListener = (authenticated: boolean) => void;
const authStateListeners: AuthStateListener[] = [];
let supabaseAuthUnsubscribe: (() => void) | null = null;

function ensureSupabaseAuthSubscription() {
  if (supabaseAuthUnsubscribe) return;

  try {
    supabaseAuthUnsubscribe = supabaseAuthAdapter.onAuthStateChange(async (authenticated, user) => {
      if (authenticated && user) {
        await authService.storeAuthData({ user });
      }
      if (!authenticated) {
        await authService.clearAuthData();
      }
      authService.notifyAuthStateChange(authenticated);
    });
  } catch (error) {
    logger.warn('[Auth] Supabase auth listener not started:', error);
  }
}

export const authService = {
  /**
   * Traditional email/password login
   */
  async login(email: string, password: string) {
    const data = await supabaseAuthAdapter.login(email, password);
    if (!data.access_token || !data.user) {
      throw new Error('Supabase did not return an authenticated session');
    }
    await this.storeAuthData(data);
    this.notifyAuthStateChange(true);
    return data;
  },

  /**
   * User registration with email/password
   */
  async register(email: string, password: string, full_name: string) {
    // Email/password registration always requires email confirmation; Supabase
    // never returns an active session here (see supabaseAuthAdapter.register).
    const data = await supabaseAuthAdapter.register(email, password, full_name);
    return data;
  },

  /**
   * Social login (Apple/Google)
   */
  async socialLogin(provider: 'apple' | 'google', idToken: string, deviceInfo?: Record<string, string>) {
    try {
      void deviceInfo;
      const data = await supabaseAuthAdapter.socialLogin(provider, idToken);

      if (data.authenticated) {
        await this.storeAuthData(data);
        this.notifyAuthStateChange(true);
        return { success: true, authenticated: true, user: data.user };
      }

      return { success: false, error: 'Supabase did not return an authenticated session' };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Social login failed:', error);
      return { success: false, error: errorMessage };
    }
  },

  /**
   * Phone-based login/registration (after OTP verification)
   */
  async phoneLogin(phoneNumber: string, otpCode: string, deviceInfo?: Record<string, string>) {
    try {
      void deviceInfo;
      const data = await supabaseAuthAdapter.verifyPhoneOtp(phoneNumber, otpCode);

      if (data.access_token && data.profileComplete) {
        await this.storeAuthData(data);
        this.notifyAuthStateChange(true);
        return { success: true, authenticated: true, user: data.user };
      }

      if (data.access_token) {
        await this.storeAuthData(data);
        return {
          success: true,
          authenticated: false,
          status: 'registration_required',
          tempToken: data.user?.id,
        };
      }

      return { success: false, error: 'Verification failed' };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Phone login failed:', error);
      return { success: false, error: errorMessage };
    }
  },

  /**
   * Complete phone registration with profile data
   */
  async completePhoneRegistration(tempToken: string, profileData: {
    fullName: string;
    email?: string;
    birthDate?: string;
  }) {
    void tempToken;

    try {
      const data = await supabaseAuthAdapter.updateProfile({
        full_name: profileData.fullName,
        email: profileData.email,
        birth_date: profileData.birthDate,
      });

      await this.storeAuthData({ user: data });
      this.notifyAuthStateChange(true);

      return {
        success: true,
        user: data,
        biometricEnrollmentToken: data.id,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Complete registration failed:', error);
      return { success: false, error: errorMessage };
    }
  },

  /**
   * Biometric quick login (still backed by API when enabled server-side)
   */
  async biometricLogin(biometricToken: string, deviceInfo?: Record<string, string>) {
    try {
      void biometricToken;
      void deviceInfo;

      const biometricResult = await biometricAuthService.authenticateAndGetUserId();
      if (!biometricResult.success) {
        return { success: false, error: biometricResult.error };
      }

      const data = await supabaseAuthAdapter.getSession();
      if (!data.access_token || data.user?.id !== biometricResult.userId) {
        return { success: false, error: 'No valid Supabase session for this biometric profile' };
      }

      await this.storeAuthData(data);

      this.notifyAuthStateChange(true);

      return {
        success: true,
        user: data.user,
        trustLevel: 'device_biometric',
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Biometric login failed:', error);
      return { success: false, error: errorMessage };
    }
  },

  /**
   * Logout and clear all auth data
   */
  async logout() {
    try {
      await supabaseAuthAdapter.logout();
    } catch (error) {
      logger.warn('Logout API call failed:', error);
    } finally {
      await biometricAuthService.disable().catch((error) => logger.warn('[Auth] Failed to disable biometric login:', error));
      await this.clearAuthData();
      this.notifyAuthStateChange(false);
    }
  },

  /**
   * Get current user from Supabase
   */
  async getCurrentUser() {
    try {
      return await supabaseAuthAdapter.getCurrentUser();
    } catch (error) {
      if (isMissingAuthSessionError(error)) {
        await this.clearAuthData();
        this.notifyAuthStateChange(false);
        return null;
      }

      await this.logout();
      return null;
    }
  },

  /**
   * Restore persisted Supabase session on app startup.
   */
  async restoreSession() {
    try {
      const data = await supabaseAuthAdapter.getSession();
      if (!data.access_token || !data.user) {
        await this.clearAuthData();
        this.notifyAuthStateChange(false);
        return null;
      }

      await this.storeAuthData(data);
      this.notifyAuthStateChange(true);
      return data.user;
    } catch (error) {
      logger.warn('[Auth] Session restore failed:', error);
      await this.clearAuthData();
      this.notifyAuthStateChange(false);
      return null;
    }
  },

  async sendPasswordReset(email: string) {
    return supabaseAuthAdapter.sendPasswordReset(email);
  },

  async exchangeCodeForSession(code: string) {
    const data = await supabaseAuthAdapter.exchangeCodeForSession(code);
    if (!data.access_token || !data.user) {
      throw new Error('Supabase did not return an authenticated session');
    }
    await this.storeAuthData(data);
    this.notifyAuthStateChange(true);
    return data;
  },

  async recoverSessionFromUrl(url: string) {
    const data = await supabaseAuthAdapter.recoverSessionFromUrl(url);
    if (!data.access_token || !data.user) {
      throw new Error('Supabase did not return an authenticated session');
    }
    await this.storeAuthData(data);
    this.notifyAuthStateChange(true);
    return data;
  },

  async updatePassword(password: string) {
    return supabaseAuthAdapter.updatePassword(password);
  },

  /**
   * Store authentication data
   */
  async storeAuthData(data: {
    access_token?: string;
    refresh_token?: string;
    user?: object;
    biometric_enrollment_token?: string;
  }) {
    const promises: Promise<void>[] = [];

    if (data.access_token) {
      promises.push(secureStorage.setAccessToken(data.access_token));
    }

    if (data.refresh_token) {
      promises.push(secureStorage.setRefreshToken(data.refresh_token));
    }

    if (data.user) {
      promises.push(AsyncStorage.setItem('user', JSON.stringify(data.user)));
      promises.push(secureStorage.setUser(data.user));
    }

    await Promise.all(promises);
  },

  /**
   * Clear all authentication data
   */
  async clearAuthData() {
    await Promise.all([
      AsyncStorage.multiRemove(['access_token', 'refresh_token', 'user']),
      secureStorage.clearAuth(),
    ]);
  },

  /**
   * Subscribe to auth state changes
   */
  onAuthStateChange(listener: AuthStateListener): () => void {
    ensureSupabaseAuthSubscription();
    authStateListeners.push(listener);
    return () => {
      const index = authStateListeners.indexOf(listener);
      if (index > -1) {
        authStateListeners.splice(index, 1);
      }
    };
  },

  /**
   * Notify all listeners of auth state change
   */
  notifyAuthStateChange(authenticated: boolean) {
    authStateListeners.forEach(listener => listener(authenticated));
  },

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    return supabaseAuthAdapter.isAuthenticated();
  },

  /**
   * Refresh access token using Supabase session
   */
  async refreshToken(): Promise<boolean> {
    try {
      return await supabaseAuthAdapter.refreshToken();
    } catch (error) {
      logger.error('Token refresh failed:', error);
      await this.clearAuthData();
      this.notifyAuthStateChange(false);
      return false;
    }
  },
};

export default authService;
