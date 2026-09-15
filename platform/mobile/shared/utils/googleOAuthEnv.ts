import { Platform } from 'react-native';

/**
 * expo-auth-session's Google provider throws on native builds if the
 * platform-specific client id env var is missing. Use this to skip
 * `useAuthRequest` until credentials are configured.
 */
export function isGoogleNativeOAuthConfigured(): boolean {
  const ios = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const android = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const expoWeb = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;

  if (Platform.OS === 'ios') {
    return Boolean(ios?.trim() || expoWeb?.trim());
  }
  if (Platform.OS === 'android') {
    return Boolean(android?.trim() || expoWeb?.trim());
  }
  return Boolean(
    expoWeb?.trim() || ios?.trim() || android?.trim()
  );
}
