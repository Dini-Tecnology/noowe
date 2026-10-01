import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { peekPendingPaymentConfirmation, RESTORE_MIN_AGE_MS } from '../utils/pending-payment-confirmation';

/**
 * Whenever Home is focused, check for a payment whose confirmation the customer
 * never saw (app reloaded, or navigation dropped them on Home) and send them to
 * the confirmation screen. Confirmations still inside the normal flow window are
 * re-checked once that window has passed.
 */
export function useRestorePaymentConfirmation(navigation: { navigate: (name: string, params?: object) => void }) {
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const check = async () => {
        const pending = await peekPendingPaymentConfirmation().catch(() => null);
        if (!pending || cancelled) return;
        if (pending.ageMs < RESTORE_MIN_AGE_MS) {
          timer = setTimeout(() => void check(), RESTORE_MIN_AGE_MS - pending.ageMs + 250);
          return;
        }
        navigation.navigate('PaymentSuccess', {
          result: pending.value.result,
          restaurantName: pending.value.restaurantName,
          tableSessionId: pending.value.tableSessionId,
        });
      };
      void check();

      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
      };
    }, [navigation]),
  );
}
