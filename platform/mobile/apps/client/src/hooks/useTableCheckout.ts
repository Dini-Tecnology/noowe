import { useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import customerBackend, { type PaymentMethodType, type TableCheckoutResult } from '../services/customer-backend';
import { useVisitSession } from '../contexts/VisitSessionContext';
import { savePendingPaymentConfirmation } from '../utils/pending-payment-confirmation';

type CheckoutOptions = {
  tableSessionId?: string;
  tipPercent: number;
  paymentMethod: PaymentMethodType;
  splitMode: 'mine' | 'equal' | 'byItem' | 'fixed';
  baseAmount: number;
  itemIds?: string[];
  restaurantName?: string;
  onSuccess: (result: TableCheckoutResult) => void;
  onError: (error: Error) => void;
};

export function useTableCheckout(options: CheckoutOptions) {
  const queryClient = useQueryClient();
  const { completeCheckout } = useVisitSession();
  const inFlight = useRef(false);
  const payment = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!options.tableSessionId) throw new Error('Leia o QR Code da mesa antes de pagar.');
      const { tableSessionId, tipPercent, paymentMethod, splitMode, baseAmount, itemIds } = options;
      const input = { tableSessionId, tipPercent, paymentMethod, splitMode, baseAmount, itemIds };
      const storageKey = `@noowe/table-checkout/${tableSessionId}`;
      const stored = await AsyncStorage.getItem(storageKey);
      // An uncertain response must replay the original intent, even after reopening
      // the screen or changing payment options. Never start a second charge first.
      const pending = stored ? JSON.parse(stored) : { ...input, idempotencyKey: Crypto.randomUUID() };
      await AsyncStorage.setItem(storageKey, JSON.stringify(pending));
      let result: TableCheckoutResult;
      try {
        result = await customerBackend.payTableBill(pending);
      } catch (error) {
        // These PostgreSQL errors rolled the transaction back. A corrected
        // amount/selection can safely receive a new key; transport errors cannot.
        if (['22023', 'P0001', 'P0004', '28000'].includes((error as { code?: string }).code ?? '')) {
          await AsyncStorage.removeItem(storageKey).catch(() => undefined);
          void queryClient.invalidateQueries({ queryKey: ['table-bill', tableSessionId] }).catch(() => undefined);
        }
        throw error;
      }
      // Payment is committed. A cache/storage failure must not turn it into a
      // payment error or offer another charge. Startup reconciles with the server.
      // Persist first: if the app reloads before the confirmation screen shows, Home restores it.
      await savePendingPaymentConfirmation({ result, restaurantName: options.restaurantName, tableSessionId }).catch(() => undefined);
      if (result.sessionReleased) await completeCheckout(tableSessionId).catch(() => undefined);
      await AsyncStorage.removeItem(storageKey).catch(() => undefined);
      for (const queryKey of [['orders'], ['order'], ['table-bill'], ['restaurant'], ['wallet'], ['loyalty']]) {
        void queryClient.invalidateQueries({ queryKey }).catch(() => undefined);
      }
      return result;
    },
    onSuccess: options.onSuccess,
    onError: options.onError,
    onSettled: () => { inFlight.current = false; },
  });
  return {
    ...payment,
    mutate: () => {
      if (inFlight.current) return;
      inFlight.current = true;
      payment.mutate();
    },
  };
}
