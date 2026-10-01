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
          error: 'Login por biometria não está habilitado neste app.',
          errorCode: 'not_configured',
        };
      }

      const { user } = await getOptionalSupabaseSessionUser();
      if (!user || user.id !== userId) {
        return {
          success: false,
          error: 'É preciso estar autenticado para ativar a biometria.',
          errorCode: 'session_required',
        };
      }

      const authResult = await this.authenticate(
        'Confirme sua identidade para ativar a biometria',
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
        error: error.message || 'Não foi possível ativar a biometria.',
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
          error: 'Este dispositivo não oferece autenticação biométrica.',
          errorCode: 'not_available',
        };
      }

      if (!status.isEnrolled) {
        return {
          success: false,
          error: 'Nenhuma biometria cadastrada. Cadastre uma em Ajustes do sistema.',
          errorCode: 'not_enrolled',
        };
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: promptMessage || this.getDefaultPromptMessage(status.biometricType),
        fallbackLabel: 'Usar senha do aparelho',
        disableDeviceFallback: false,
        cancelLabel: 'Cancelar',
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
        error: error.message || 'Falha na autenticação biométrica.',
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
          error: 'Login por biometria não está habilitado neste app.',
        };
      }

      const isEnabled = await this.isEnabled();
      if (!isEnabled) {
        return {
          success: false,
          error: 'Login por biometria não está ativado.',
        };
      }

      const userId = await secureStorage.getItem(BIOMETRIC_STORAGE_KEYS.USER_ID);
      if (!userId) {
        return {
          success: false,
          error: 'Nenhum usuário vinculado à biometria neste aparelho.',
        };
      }

      const { user } = await getOptionalSupabaseSessionUser();
      if (!user || user.id !== userId) {
        return {
          success: false,
          error: 'Não há sessão válida vinculada à biometria. Entre com sua conta e ative a biometria novamente.',
        };
      }

      const authResult = await this.authenticate('Entrar com biometria');
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
        error: error.message || 'Falha ao entrar com biometria.',
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
      FaceID: 'Entrar com Face ID',
      TouchID: 'Entrar com Touch ID',
      Fingerprint: 'Entrar com impressão digital',
      Iris: 'Entrar com leitura de íris',
      None: 'Autenticar',
    };
    return messages[type];
  }

  /**
   * Get user-friendly error message
   */
  private getErrorMessage(errorCode?: string): string {
    const messages: Record<string, string> = {
      user_cancel: 'Autenticação cancelada.',
      system_cancel: 'Autenticação cancelada pelo sistema.',
      lockout: 'Muitas tentativas. Tente novamente em instantes.',
      lockout_permanent: 'Biometria bloqueada. Use a senha do aparelho.',
      not_enrolled: 'Nenhuma biometria cadastrada. Cadastre uma em Ajustes.',
      not_available: 'Biometria indisponível neste dispositivo.',
      passcode_not_set: 'Cadastre uma senha no aparelho antes de usar biometria.',
      authentication_failed: 'Não reconhecemos sua biometria. Tente novamente.',
    };
    return messages[errorCode || ''] || 'Falha na autenticação biométrica.';
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
