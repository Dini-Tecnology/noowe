import Constants from 'expo-constants';

type AuthRedirectPath = 'auth/callback' | 'auth/reset-password';

function readAppScheme(): string {
  const scheme = Constants.expoConfig?.scheme;
  if (typeof scheme === 'string' && scheme.length > 0) {
    return scheme;
  }
  if (Array.isArray(scheme) && typeof scheme[0] === 'string' && scheme[0].length > 0) {
    return scheme[0];
  }
  return 'okinawa-restaurant';
}

/**
 * URL usada em emailRedirectTo / redirectTo do Supabase Auth.
 * Por padrão usa deep link do app (ex.: okinawa-restaurant://auth/callback),
 * sem depender de site hospedado. Override via EXPO_PUBLIC_AUTH_REDIRECT_URL.
 */
export function getAuthRedirectUrl(path: AuthRedirectPath = 'auth/callback'): string {
  if (path === 'auth/callback') {
    const override = process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL?.trim();
    if (override) return override;
    return `${readAppScheme()}://${path}`;
  }

  const resetOverride = process.env.EXPO_PUBLIC_AUTH_RESET_REDIRECT_URL?.trim();
  if (resetOverride) return resetOverride;

  return `${readAppScheme()}://${path}`;
}

export default getAuthRedirectUrl;
