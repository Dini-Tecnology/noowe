import { useEffect, useRef, useState } from 'react';
import { authService } from '../services/auth';
import { emailSchema } from '../validation/schemas';

export type EmailAvailability =
  | 'idle'
  | 'checking'
  | 'available'
  | 'registered'
  | 'unconfirmed'
  | 'unknown';

export const EMAIL_CHECK_DEBOUNCE_MS = 500;

export function isEmailBlockedForSignup(status: EmailAvailability): boolean {
  return status === 'checking' || status === 'registered' || status === 'unconfirmed';
}

export function useEmailAvailability(email: string): EmailAvailability {
  const [status, setStatus] = useState<EmailAvailability>('idle');
  const latestRequest = useRef(0);

  useEffect(() => {
    const normalized = email.trim().toLowerCase();
    const requestId = ++latestRequest.current;

    if (!emailSchema.safeParse(normalized).success) {
      setStatus('idle');
      return;
    }

    setStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const { exists, confirmed } = await authService.checkEmailAvailability(normalized);
        if (requestId !== latestRequest.current) return;
        setStatus(!exists ? 'available' : confirmed ? 'registered' : 'unconfirmed');
      } catch {
        // A failed check must not lock signup; the server still rejects duplicates on submit.
        if (requestId === latestRequest.current) setStatus('unknown');
      }
    }, EMAIL_CHECK_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [email]);

  return status;
}
