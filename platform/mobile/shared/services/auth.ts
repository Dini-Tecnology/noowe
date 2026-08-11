/**
 * Auth Service
 *
 * Handles authentication operations including login, register, social auth,
 * and session management. Enhanced for passwordless-first flow.
 * Auth, session refresh, and profile sync use Supabase only.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import ApiService from './api';
import { secureStorage } from './secure-storage';
import { supabaseAuthAdapter } from './supabase-auth';
import { getSupabaseClient } from './supabase';
import logger from '../utils/logger';

// Auth state change listeners
type AuthStateListener = (authenticated: boolean) => void;
const authStateListeners: AuthStateListener[] = [];
let authSubscriptionInitialized = false;

export const authService = {
  initialize() {
    if (authSubscriptionInitialized) return;
    authSubscriptionInitialized = true;

    getSupabaseClient().auth.onAuthStateChange((event, session) => {
      void (async () => {
        try {
          if (event === 'SIGNED_OUT') {
            await this.clearAuthData();
            this.notifyAuthStateChange(false);
            return;
          }

          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
            await this.storeAuthData({
              access_token: session?.access_token,
              refresh_token: session?.refresh_token,
              user: session?.user as unknown as Record<string, unknown> | undefined,
            });
            this.notifyAuthStateChange(Boolean(session?.access_token));
          }
        } catch (error) {
          logger.error('Failed to sync Supabase auth state:', error);
        }
      })();
    });
  },

  /**
   * Traditional email/password login
   */
  async login(email: string, password: string) {
    this.initialize();
    const data = await supabaseAuthAdapter.login(email, password);
    await this.storeAuthData(data);
    this.notifyAuthStateChange(true);
    return data;
  },

  /**
   * User registration with email/password
   */
  async register(email: string, password: string, full_name: string) {
    this.initialize();
    const data = await supabaseAuthAdapter.register(email, password, full_name);
    await this.storeAuthData(data);
    this.notifyAuthStateChange(true);
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
      const response = await ApiService.post('/auth/biometric/authenticate', {
        biometric_token: biometricToken,
        device_info: deviceInfo,
      });

      const data = response.data;

      await this.storeAuthData({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        user: data.user,
      });

      this.notifyAuthStateChange(true);

      return {
        success: true,
        user: data.user,
        trustLevel: data.trust_level,
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
      await this.clearAuthData();
      this.notifyAuthStateChange(false);
    }
  },

  /**
   * Get current user from Supabase
   */
  async getCurrentUser() {
    this.initialize();
    try {
      return await supabaseAuthAdapter.getCurrentUser();
    } catch (error) {
      await this.logout();
      return null;
    }
  },

  /**
   * Get stored user from local storage
   */
  async getStoredUser() {
    const userStr = await AsyncStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },

  /**
   * Store authentication data
   */
  async storeAuthData(data: {
    access_token?: string;
    refresh_token?: string;
    user?: Record<string, unknown>;
    biometric_enrollment_token?: string;
  }) {
    const promises: Promise<void>[] = [];

    if (data.access_token) {
      promises.push(secureStorage.setAccessToken(data.access_token));
      promises.push(AsyncStorage.setItem('access_token', data.access_token));
    }

    if (data.refresh_token) {
      promises.push(secureStorage.setRefreshToken(data.refresh_token));
      promises.push(AsyncStorage.setItem('refresh_token', data.refresh_token));
    }

    if (data.user) {
      let userForStorage = data.user;

      try {
        const userId = typeof data.user.id === 'string' ? data.user.id : undefined;
        const context = await supabaseAuthAdapter.fetchUserContext(userId);
        userForStorage = {
          ...data.user,
          account_type: context.account_type,
          roles: context.roles,
          restaurant_ids: context.restaurant_ids,
        };
        promises.push(AsyncStorage.setItem('user_context', JSON.stringify(context)));
      } catch (error) {
        logger.warn('Failed to fetch Supabase user context:', error);
      }

      promises.push(AsyncStorage.setItem('user', JSON.stringify(userForStorage)));
      promises.push(secureStorage.setUser(userForStorage));
    }

    await Promise.all(promises);
  },

  /**
   * Clear all authentication data
   */
  async clearAuthData() {
    await Promise.all([
      AsyncStorage.multiRemove(['access_token', 'refresh_token', 'user', 'user_context']),
      secureStorage.clearAuth(),
    ]);
  },

  /**
   * Subscribe to auth state changes
   */
  onAuthStateChange(listener: AuthStateListener): () => void {
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
    this.initialize();
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
