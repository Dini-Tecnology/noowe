/**
 * AUDIT-005: Biometric Authentication Service
 * Integrates biometric auth with the app's authentication flow.
 * 
 * Enhanced for passwordless-first authentication following
 * the Okinawa authentication specification.
 */

import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { secureStorage } from './secure-storage';
import { getOptionalSupabaseSessionUser } from './supabase-auth';
import { isBiometricAuthConfigured } from '../config/auth-providers';
import logger from '../utils/logger';

// Storage keys for biometric settings (enhanced with token support)
const BIOMETRIC_STORAGE_KEYS = {
  ENABLED: '@okinawa_biometric_enabled',
  USER_ID: '@okinawa_biometric_user_id',
  CREDENTIALS_HASH: '@okinawa_biometric_cred_hash',
  // New keys for backend-synced biometric tokens
  AUTH_TOKEN: '@okinawa_biometric_auth_token',
  TOKEN_EXPIRES_AT: '@okinawa_biometric_expires_at',
  BIOMETRIC_TYPE: '@okinawa_biometric_type',
} as const;

// Types
export type BiometricType = 'FaceID' | 'TouchID' | 'Fingerprint' | 'Iris' | 'None';
export type BiometricTypeApi = 'face_id' | 'touch_id' | 'fingerprint';

export interface BiometricStatus {
  isHardwareAvailable: boolean;
  isEnrolled: boolean;
  biometricType: BiometricType;
  isEnabledForApp: boolean;
  supportedTypes: LocalAuthentication.AuthenticationType[];
  hasValidToken: boolean;
}

export interface BiometricAuthResult {
  success: boolean;
  error?: string;
  errorCode?: string;
}

class BiometricAuthService {
  private cachedStatus: BiometricStatus | null = null;

  /**
   * Get current biometric status
   */
  async getStatus(): Promise<BiometricStatus> {
    try {
      const isHardwareAvailable = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = isHardwareAvailable
        ? await LocalAuthentication.isEnrolledAsync()
        : false;
      const supportedTypes = isHardwareAvailable
        ? await LocalAuthentication.supportedAuthenticationTypesAsync()
        : [];
      const isEnabledForApp = await this.isEnabled();
      
      // Check if we have a valid biometric token stored
      const hasValidToken = await this.hasValidBiometricToken();

      const status: BiometricStatus = {
        isHardwareAvailable,
        isEnrolled,
        biometricType: this.determineBiometricType(supportedTypes),
        isEnabledForApp,
        supportedTypes,
        hasValidToken,
      };

      this.cachedStatus = status;
      return status;
    } catch (error) {
      logger.error('[BiometricAuth] Failed to get status:', error);
      return {
        isHardwareAvailable: false,
        isEnrolled: false,
        biometricType: 'None',
        isEnabledForApp: false,
        supportedTypes: [],
        hasValidToken: false,
      };
    }
  }

  /**
   * Check if we have a valid biometric token stored
   */
  private async hasValidBiometricToken(): Promise<boolean> {
    try {
      if (!isBiometricAuthConfigured()) return false;

      const isEnabled = await this.isEnabled();
      if (!isEnabled) return false;

      const storedUserId = await secureStorage.getItem(BIOMETRIC_STORAGE_KEYS.USER_ID);
      if (!storedUserId) return false;

      const { user } = await getOptionalSupabaseSessionUser();
      if (!user || user.id !== storedUserId) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear stored biometric token
   */
  private async clearBiometricToken(): Promise<void> {
    await Promise.all([
      secureStorage.removeItem(BIOMETRIC_STORAGE_KEYS.AUTH_TOKEN),
      secureStorage.removeItem(BIOMETRIC_STORAGE_KEYS.TOKEN_EXPIRES_AT),
    ]);
  }

  /**
   * Determine biometric type from supported types
   */
  private determineBiometricType(
    types: LocalAuthentication.AuthenticationType[]
  ): BiometricType {
    const { FACIAL_RECOGNITION, FINGERPRINT, IRIS } = LocalAuthentication.AuthenticationType;
    const isIOS = require('react-native').Platform.OS === 'ios';

    if (types.includes(FACIAL_RECOGNITION)) {
      return isIOS ? 'FaceID' : 'Fingerprint';
    }
    if (types.includes(FINGERPRINT)) {
      return isIOS ? 'TouchID' : 'Fingerprint';
    }
    if (types.includes(IRIS)) {
      return 'Iris';
    }
    return 'None';
  }

  /**
   * Check if biometric auth is enabled for this app
   */
  async isEnabled(): Promise<boolean> {
    try {
      const enabled = await secureStorage.getItem(BIOMETRIC_STORAGE_KEYS.ENABLED);
      if (enabled === 'true') return true;
      return secureStorage.getBiometricEnabled();
    } catch (error) {
      return false;
    }
  }

  /**
   * Enable biometric authentication for a user
   * Should be called after successful password login
   */
  async enable(userId: string): Promise<BiometricAuthResult> {
    try {
      if (!isBiometricAuthConfigured()) {
        return {
          success: false,
          error: 'Biometric login is not configured for this app',
          errorCode: 'not_configured',
        };
      }

      const { user } = await getOptionalSupabaseSessionUser();
      if (!user || user.id !== userId) {
        return {
          success: false,
          error: 'A valid Supabase session is required to enable biometric login',
          errorCode: 'session_required',
        };
      }

      const authResult = await this.authenticate(
        'Confirm your identity to enable biometric login'
      );

      if (!authResult.success) {
        return authResult;
      }

      // Store biometric settings
      await secureStorage.setItem(BIOMETRIC_STORAGE_KEYS.ENABLED, 'true');
      await secureStorage.setItem(BIOMETRIC_STORAGE_KEYS.USER_ID, userId);
      await secureStorage.setBiometricEnabled(true);

      logger.info('[BiometricAuth] Biometric login enabled for user:', userId);
      return { success: true };
    } catch (error: any) {
      logger.error('[BiometricAuth] Failed to enable:', error);
      return {
        success: false,
        error: error.message || 'Failed to enable biometric login',
      };
    }
  }

  /**
   * Disable biometric authentication
   */
  async disable(): Promise<void> {
    try {
      await secureStorage.removeItem(BIOMETRIC_STORAGE_KEYS.ENABLED);
      await secureStorage.removeItem(BIOMETRIC_STORAGE_KEYS.USER_ID);
      await secureStorage.removeItem(BIOMETRIC_STORAGE_KEYS.CREDENTIALS_HASH);
      await this.clearBiometricToken();
      await secureStorage.setBiometricEnabled(false);
      logger.info('[BiometricAuth] Biometric login disabled');
    } catch (error) {
      logger.error('[BiometricAuth] Failed to disable:', error);
      throw error;
    }
  }

  /**
   * Perform biometric authentication
   */
  async authenticate(promptMessage?: string): Promise<BiometricAuthResult> {
    try {
      const status = this.cachedStatus || (await this.getStatus());

      if (!status.isHardwareAvailable) {
        return {
          success: false,
          error: 'Biometric authentication is not available on this device',
          errorCode: 'not_available',
        };
      }

      if (!status.isEnrolled) {
        return {
          success: false,
          error: 'No biometric data enrolled. Please set up biometric authentication in device settings.',
          errorCode: 'not_enrolled',
        };
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: promptMessage || this.getDefaultPromptMessage(status.biometricType),
        fallbackLabel: 'Use Passcode',
        disableDeviceFallback: false,
        cancelLabel: 'Cancel',
      });

      if (result.success) {
        logger.info('[BiometricAuth] Authentication successful');
        return { success: true };
      }

      const errorCode = 'error' in result ? result.error : undefined;
      logger.warn('[BiometricAuth] Authentication failed:', errorCode);
      return {
        success: false,
        error: this.getErrorMessage(errorCode),
        errorCode,
      };
    } catch (error: any) {
      logger.error('[BiometricAuth] Authentication error:', error);
      return {
        success: false,
        error: error.message || 'Authentication failed',
        errorCode: 'unknown',
      };
    }
  }

  /**
   * Authenticate and get stored user ID
   * Use this for quick login after app restart
   */
  async authenticateAndGetUserId(): Promise<{ success: boolean; userId?: string; error?: string }> {
    try {
      if (!isBiometricAuthConfigured()) {
        return {
          success: false,
          error: 'Biometric login is not configured',
        };
      }

      const isEnabled = await this.isEnabled();
      if (!isEnabled) {
        return {
          success: false,
          error: 'Biometric login is not enabled',
        };
      }

      const userId = await secureStorage.getItem(BIOMETRIC_STORAGE_KEYS.USER_ID);
      if (!userId) {
        return {
          success: false,
          error: 'No user associated with biometric login',
        };
      }

      const { user } = await getOptionalSupabaseSessionUser();
      if (!user || user.id !== userId) {
        return {
          success: false,
          error: 'No valid Supabase session associated with biometric login',
        };
      }

      const authResult = await this.authenticate('Login with biometrics');
      if (!authResult.success) {
        return {
          success: false,
          error: authResult.error,
        };
      }

      return {
        success: true,
        userId,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Biometric login failed',
      };
    }
  }

  /**
   * Get the stored user ID without authentication
   */
  async getStoredUserId(): Promise<string | null> {
    try {
      return await secureStorage.getItem(BIOMETRIC_STORAGE_KEYS.USER_ID);
    } catch {
      return null;
    }
  }

  /**
   * Get default prompt message based on biometric type
   */
  private getDefaultPromptMessage(type: BiometricType): string {
    const messages: Record<BiometricType, string> = {
      FaceID: 'Authenticate with Face ID',
      TouchID: 'Authenticate with Touch ID',
      Fingerprint: 'Authenticate with Fingerprint',
      Iris: 'Authenticate with Iris',
      None: 'Authenticate',
    };
    return messages[type];
  }

  /**
   * Get user-friendly error message
   */
  private getErrorMessage(errorCode?: string): string {
    const messages: Record<string, string> = {
      user_cancel: 'Authentication cancelled',
      system_cancel: 'Authentication was cancelled by the system',
      lockout: 'Too many failed attempts. Please try again later.',
      lockout_permanent: 'Biometric authentication is locked. Please use your passcode.',
      not_enrolled: 'No biometric data found. Please set up biometrics in settings.',
      not_available: 'Biometric authentication is not available',
      passcode_not_set: 'Please set up a passcode on your device first',
      authentication_failed: 'Authentication failed. Please try again.',
    };
    return messages[errorCode || ''] || 'Authentication failed. Please try again.';
  }

  /**
   * Get display name for the biometric type
   */
  getDisplayName(type?: BiometricType): string {
    const currentType = type || this.cachedStatus?.biometricType || 'None';
    const names: Record<BiometricType, string> = {
      FaceID: 'Face ID',
      TouchID: 'Touch ID',
      Fingerprint: 'Fingerprint',
      Iris: 'Iris Scanner',
      None: 'Biometric',
    };
    return names[currentType];
  }

  /**
   * Check if quick biometric login is available
   */
  async canQuickLogin(): Promise<boolean> {
    const status = await this.getStatus();
    return (
      isBiometricAuthConfigured() &&
      status.isHardwareAvailable &&
      status.isEnrolled &&
      status.isEnabledForApp &&
      status.hasValidToken
    );
  }
}

// Export singleton instance
export const biometricAuthService = new BiometricAuthService();

export default biometricAuthService;
