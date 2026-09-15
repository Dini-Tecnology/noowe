import { Platform } from 'react-native';

function readPublicFlag(key: string): boolean {
  const value = process.env[key]?.trim().toLowerCase();
  return value === 'true' || value === '1' || value === 'yes';
}

export function isGoogleAuthProviderConfigured(): boolean {
  return readPublicFlag('EXPO_PUBLIC_SUPABASE_AUTH_GOOGLE_ENABLED');
}

export function isAppleAuthProviderConfigured(): boolean {
  return readPublicFlag('EXPO_PUBLIC_SUPABASE_AUTH_APPLE_ENABLED') && Platform.OS === 'ios';
}

export function isBiometricAuthConfigured(): boolean {
  return readPublicFlag('EXPO_PUBLIC_ENABLE_BIOMETRIC_LOGIN');
}

export function getAuthProviderAvailability() {
  return {
    google: isGoogleAuthProviderConfigured(),
    apple: isAppleAuthProviderConfigured(),
    biometric: isBiometricAuthConfigured(),
  };
}
