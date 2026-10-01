import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TableCheckoutResult } from '../services/customer-backend';

const KEY = '@noowe/payment-confirmation/pending';
const MAX_AGE_MS = 15 * 60 * 1000;
// A confirmation younger than this is still being shown by the normal flow;
// only an older one means the app restarted before the customer saw it.
export const RESTORE_MIN_AGE_MS = 4000;

export type PendingPaymentConfirmation = {
  result: TableCheckoutResult;
  restaurantName?: string;
  tableSessionId?: string;
  savedAt: number;
};

export async function savePendingPaymentConfirmation(
  value: Omit<PendingPaymentConfirmation, 'savedAt'>,
): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify({ ...value, savedAt: Date.now() }));
}

export async function clearPendingPaymentConfirmation(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

/**
 * Reads the confirmation that has not been acknowledged by PaymentSuccess yet.
 * `ageMs` lets the caller wait out the normal flow before restoring.
 */
export async function peekPendingPaymentConfirmation(): Promise<{ value: PendingPaymentConfirmation; ageMs: number } | null> {
  const stored = await AsyncStorage.getItem(KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as PendingPaymentConfirmation;
    const ageMs = Date.now() - parsed.savedAt;
    if (!parsed.result || ageMs > MAX_AGE_MS) {
      await AsyncStorage.removeItem(KEY);
      return null;
    }
    return { value: parsed, ageMs };
  } catch {
    await AsyncStorage.removeItem(KEY);
    return null;
  }
}
