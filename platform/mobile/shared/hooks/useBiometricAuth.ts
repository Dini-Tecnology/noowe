import { useState, useEffect } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import logger from '../utils/logger';

export type BiometricType = 'FaceID' | 'TouchID' | 'Fingerprint' | 'Iris' | 'None';

interface BiometricAuthResult {
  success: boolean;
  error?: string;
}

export const useBiometricAuth = () => {
  const [isAvailable, setIsAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<BiometricType>('None');
  const [isEnrolled, setIsEnrolled] = useState(false);

  useEffect(() => {
    checkBiometricAvailability();
  }, []);

  /**
   * Check if biometric authentication is available on device
   */
  const checkBiometricAvailability = async () => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      setIsAvailable(compatible);

      if (compatible) {
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        setIsEnrolled(enrolled);

        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        const type = getBiometricType(types);
        setBiometricType(type);

        logger.debug('Biometric Auth Available:', {
          compatible,
          enrolled,
          type,
          types,
        });
      }
    } catch (error) {
      logger.error('Error checking biometric availability:', error);
      setIsAvailable(false);
    }
  };

  /**
   * Get human-readable biometric type
   */
  const getBiometricType = (
    types: LocalAuthentication.AuthenticationType[]
  ): BiometricType => {
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return Platform.OS === 'ios' ? 'FaceID' : 'Fingerprint';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return Platform.OS === 'ios' ? 'TouchID' : 'Fingerprint';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      return 'Iris';
    }
    return 'None';
  };

  /**
   * Authenticate user with biometrics
   */
  const authenticate = async (
    promptMessage?: string,
    fallbackLabel?: string
  ): Promise<BiometricAuthResult> => {
    try {
      // Check if biometrics are available
      if (!isAvailable) {
        return {
          success: false,
          error: 'A biometria não está disponível neste aparelho',
        };
      }

      if (!isEnrolled) {
        return {
          success: false,
          error: 'Nenhuma biometria cadastrada. Cadastre uma biometria nos ajustes do aparelho.',
        };
      }

      // Authenticate
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: promptMessage || getBiometricPromptMessage(),
        fallbackLabel: fallbackLabel || 'Usar senha do aparelho',
        disableDeviceFallback: false,
        cancelLabel: 'Cancelar',
      });

      if (result.success) {
        logger.info('Biometric authentication successful');
        return { success: true };
      } else {
        logger.warn('Biometric authentication failed:', result.error);
        return {
          success: false,
          error: getBiometricErrorMessage(result.error),
        };
      }
    } catch (error: any) {
      logger.error('Biometric authentication error:', error);
      return {
        success: false,
        error: 'Não foi possível autenticar. Tente novamente.',
      };
    }
  };

  /**
   * Get prompt message based on biometric type
   */
  const getBiometricPromptMessage = (): string => {
    switch (biometricType) {
      case 'FaceID':
        return 'Autentique com o Face ID';
      case 'TouchID':
        return 'Autentique com o Touch ID';
      case 'Fingerprint':
        return 'Autentique com a impressão digital';
      case 'Iris':
        return 'Autentique com a íris';
      default:
        return 'Autentique-se para continuar';
    }
  };

  /**
   * Get user-friendly error message
   */
  const getBiometricErrorMessage = (error?: string): string => {
    if (!error) return 'Não foi possível autenticar';

    switch (error) {
      case 'user_cancel':
        return 'Autenticação cancelada';
      case 'system_cancel':
        return 'Autenticação cancelada pelo sistema';
      case 'lockout':
        return 'Muitas tentativas sem sucesso. Tente novamente mais tarde.';
      case 'not_enrolled':
        return 'Nenhuma biometria cadastrada';
      case 'not_available':
        return 'A biometria não está disponível';
      default:
        return 'Não foi possível autenticar. Tente novamente.';
    }
  };

  /**
   * Get friendly name for biometric type (for UI display)
   */
  const getBiometricDisplayName = (): string => {
    switch (biometricType) {
      case 'FaceID':
        return 'Face ID';
      case 'TouchID':
        return 'Touch ID';
      case 'Fingerprint':
        return 'Impressão digital';
      case 'Iris':
        return 'Leitor de íris';
      default:
        return 'Biometria';
    }
  };

  return {
    // State
    isAvailable,
    isEnrolled,
    biometricType,

    // Methods
    authenticate,
    checkBiometricAvailability,
    getBiometricDisplayName,
  };
};

export default useBiometricAuth;
