import { useCallback, useEffect, useState } from 'react';

/** Minimum wait between two "call to close the bill" requests for the same table. */
export const BILL_CALL_COOLDOWN_SECONDS = 60;

// Survives leaving and re-entering the screen (a remount must not reset the wait).
const lastTriggeredAt = new Map<string, number>();

function remainingSeconds(key: string | undefined, seconds: number): number {
  if (!key) return 0;
  const last = lastTriggeredAt.get(key);
  if (last == null) return 0;
  return Math.max(0, Math.ceil((last + seconds * 1000 - Date.now()) / 1000));
}

export function useCooldown(key: string | undefined, seconds: number) {
  const [remaining, setRemaining] = useState(() => remainingSeconds(key, seconds));

  useEffect(() => {
    setRemaining(remainingSeconds(key, seconds));
  }, [key, seconds]);

  useEffect(() => {
    if (remaining <= 0) return undefined;
    const timer = setInterval(() => setRemaining(remainingSeconds(key, seconds)), 1000);
    return () => clearInterval(timer);
  }, [key, remaining, seconds]);

  const start = useCallback(() => {
    if (!key) return;
    lastTriggeredAt.set(key, Date.now());
    setRemaining(remainingSeconds(key, seconds));
  }, [key, seconds]);

  return { remaining, active: remaining > 0, start };
}
