/**
 * Social Authentication Service
 * 
 * Handles OAuth authentication with Apple and Google using native SDKs.
 * Follows the Okinawa authentication specification for passwordless-first auth.
 */

import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import { secureStorage } from './secure-storage';
import logger from '../utils/logger';

// Complete auth session for web-based OAuth
WebBrowser.maybeCompleteAuthSession();

export interface SocialAuthResult {
  success: boolean;
  provider: 'apple' | 'google';
  idToken?: string;
  user?: {
    id: string;
    email?: string;
    fullName?: string;
    avatarUrl?: string;
  };
  error?: string;
}

export interface DeviceInfo {
  deviceId: string;
  platform: 'ios' | 'android' | 'web';
  model?: string;
  osVersion?: string;
  appVersion?: string;
}

class SocialAuthService {
  private deviceId: string | null = null;

  /**
   * Get or generate unique device identifier
   */
  async getDeviceId(): Promise<string> {
    if (this.deviceId) return this.deviceId;

    // Try to load existing device ID
    const stored = await secureStorage.getSecure('device_id');
    if (stored) {
      this.deviceId = stored;
      return stored;
    }

    // Generate new device ID
    const randomBytes = await Crypto.getRandomBytesAsync(16);
    const newId = Array.from(randomBytes)
      .map((b: number) => b.toString(16).padStart(2, '0'))
      .join('');
    
    await secureStorage.setSecure('device_id', newId);
    this.deviceId = newId;
    return newId;
  }

  /**
   * Get device information for authentication requests
   */
  async getDeviceInfo(): Promise<DeviceInfo> {
    const deviceId = await this.getDeviceId();
    
    return {
      deviceId,
      platform: Platform.OS as 'ios' | 'android',
      model: Platform.OS === 'ios' ? 'iPhone' : 'Android Device',
      osVersion: Platform.Version?.toString(),
      appVersion: '1.0.0',
    };
  }

  /**
   * Check if Apple Sign In is available on this device
   */
  async isAppleAuthAvailable(): Promise<boolean> {
    if (Platform.OS !== 'ios') return false;
    return AppleAuthentication.isAvailableAsync();
  }

  /**
   * Authenticate with Apple ID
   */
  async signInWithApple(): Promise<SocialAuthResult> {
    try {
      const isAvailable = await this.isAppleAuthAvailable();
      if (!isAvailable) {
        return {
          success: false,
          provider: 'apple',
          error: 'Apple Sign In is not available on this device',
        };
      }

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      logger.info('Apple Sign In successful', { userId: credential.user });

      // Apple only provides name on first sign-in
      const fullName = credential.fullName
        ? `${credential.fullName.givenName || ''} ${credential.fullName.familyName || ''}`.trim()
        : undefined;

      return {
        success: true,
        provider: 'apple',
        idToken: credential.identityToken || undefined,
        user: {
          id: credential.user,
          email: credential.email || undefined,
          fullName,
        },
      };
    } catch (error: any) {
      logger.error('Apple Sign In failed', error);

      if (error.code === 'ERR_REQUEST_CANCELED') {
        return {
          success: false,
          provider: 'apple',
          error: 'Sign in was cancelled',
        };
      }

      return {
        success: false,
        provider: 'apple',
        error: error.message || 'Apple Sign In failed',
      };
    }
  }

  /**
   * Authenticate with Google
   * Note: Requires GOOGLE_CLIENT_ID environment variables
   */
  async signInWithGoogle(
    request: Google.GoogleAuthRequestConfig | null,
    response: Google.AuthSessionResult | null,
    promptAsync: () => Promise<Google.AuthSessionResult>
  ): Promise<SocialAuthResult> {
    try {
      if (!request) {
        return {
          success: false,
          provider: 'google',
          error: 'Google Sign In is not configured',
        };
      }

      // Prompt for sign in if no response yet
      const result = response || await promptAsync();

      if (result.type === 'cancel') {
        return {
          success: false,
          provider: 'google',
          error: 'Sign in was cancelled',
        };
      }

      if (result.type !== 'success' || !result.authentication) {
        return {
          success: false,
          provider: 'google',
          error: 'Google Sign In failed',
        };
      }

      // Fetch user info from Google
      const userInfoResponse = await fetch(
        'https://www.googleapis.com/userinfo/v2/me',
        {
          headers: { Authorization: `Bearer ${result.authentication.accessToken}` },
        }
      );

      const userInfo = await userInfoResponse.json();

      logger.info('Google Sign In successful', { userId: userInfo.id });

      if (!result.authentication.idToken) {
        return {
          success: false,
          provider: 'google',
          error: 'Google did not return an ID token for Supabase authentication',
        };
      }

      return {
        success: true,
        provider: 'google',
        idToken: result.authentication.idToken,
        user: {
          id: userInfo.id,
          email: userInfo.email,
          fullName: userInfo.name,
          avatarUrl: userInfo.picture,
        },
      };
    } catch (error: any) {
      logger.error('Google Sign In failed', error);
      return {
        success: false,
        provider: 'google',
        error: error.message || 'Google Sign In failed',
      };
    }
  }

  /**
   * Store social auth credentials for biometric-enabled quick login
   */
  async storeSocialCredentials(
    provider: 'apple' | 'google',
    userId: string,
    biometricToken?: string
  ): Promise<void> {
    await secureStorage.setSecure(`social_${provider}_user`, userId);
    if (biometricToken) {
      await secureStorage.setSecure(`biometric_token_${provider}`, biometricToken);
    }
  }

  /**
   * Get stored social credentials
   */
  async getStoredSocialCredentials(provider: 'apple' | 'google'): Promise<{
    userId?: string;
    biometricToken?: string;
  }> {
    const userId = await secureStorage.getSecure(`social_${provider}_user`);
    const biometricToken = await secureStorage.getSecure(`biometric_token_${provider}`);
    
    return {
      userId: userId || undefined,
      biometricToken: biometricToken || undefined,
    };
  }

  /**
   * Clear all social auth credentials
   */
  async clearCredentials(): Promise<void> {
    await Promise.all([
      secureStorage.deleteSecure('social_apple_user'),
      secureStorage.deleteSecure('social_google_user'),
      secureStorage.deleteSecure('biometric_token_apple'),
      secureStorage.deleteSecure('biometric_token_google'),
      secureStorage.deleteSecure('device_id'),
    ]);
  }
}

export const socialAuthService = new SocialAuthService();
export default socialAuthService;
