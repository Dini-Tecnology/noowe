import { t } from '../i18n';

type AuthErrorMatcher = {
  key: string;
  test: (message: string) => boolean;
};

const AUTH_ERROR_MATCHERS: AuthErrorMatcher[] = [
  {
    key: 'auth.emailAlreadyExists',
    test: (message) =>
      /already been registered|already registered|user already exists|email already exists/i.test(message),
  },
  {
    key: 'auth.invalidCredentials',
    test: (message) =>
      /invalid login credentials|invalid_credentials|invalid email or password/i.test(message),
  },
  {
    key: 'auth.emailNotConfirmed',
    test: (message) =>
      /email not confirmed|email_not_confirmed|confirm your email/i.test(message),
  },
  {
    key: 'auth.rateLimitExceeded',
    test: (message) =>
      /only request this once|too many requests|rate limit|after \d+ seconds/i.test(message),
  },
  {
    key: 'auth.weakPassword',
    test: (message) =>
      /password should be at least|password is too weak|weak password/i.test(message),
  },
  {
    key: 'auth.invalidToken',
    test: (message) =>
      /token has expired|invalid token|otp expired|invalid otp/i.test(message),
  },
  {
    key: 'auth.sessionExpired',
    test: (message) =>
      /session expired|auth session missing|refresh token/i.test(message),
  },
  {
    key: 'auth.registerFailed',
    test: (message) => /registration failed|signup failed|sign up failed/i.test(message),
  },
  {
    key: 'auth.loginFailed',
    test: (message) => /login failed|sign in failed/i.test(message),
  },
  {
    key: 'auth.otpSendFailed',
    test: (message) => /failed to send otp|otp send failed/i.test(message),
  },
  {
    key: 'auth.otpVerifyFailed',
    test: (message) => /verification failed|otp verify failed/i.test(message),
  },
];

function extractErrorMessage(error: unknown): string | undefined {
  if (!error) return undefined;

  if (typeof error === 'string') return error;

  if (error instanceof Error) return error.message;

  const record = error as {
    message?: string;
    error?: string;
    response?: { data?: { message?: string; error?: string } };
  };

  return (
    record.response?.data?.message ??
    record.response?.data?.error ??
    record.message ??
    record.error
  );
}

function matchesAuthError(error: unknown, pattern: RegExp): boolean {
  const message = extractErrorMessage(error) ?? '';
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';

  return pattern.test(`${code} ${message}`);
}

export function isEmailNotConfirmedError(error: unknown): boolean {
  return matchesAuthError(
    error,
    /email not confirmed|email_not_confirmed|confirm your email/i,
  );
}

export function isEmailAlreadyRegisteredError(error: unknown): boolean {
  return matchesAuthError(
    error,
    /already been registered|already registered|user already exists|email already exists/i,
  );
}

export function localizeAuthError(message?: string | null): string {
  if (!message?.trim()) return '';

  const normalized = message.trim();

  for (const matcher of AUTH_ERROR_MATCHERS) {
    if (matcher.test(normalized)) {
      const translated = t(matcher.key);
      return translated !== matcher.key ? translated : normalized;
    }
  }

  return normalized;
}

export function getLocalizedAuthErrorMessage(
  error: unknown,
  fallbackKey = 'common.genericError',
): string {
  const rawMessage = extractErrorMessage(error);
  if (rawMessage) {
    const localized = localizeAuthError(rawMessage);
    if (localized) return localized;
  }

  const fallback = t(fallbackKey);
  return fallback !== fallbackKey ? fallback : rawMessage || '';
}
