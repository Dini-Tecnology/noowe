const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => mockStore.get(key) ?? null,
    setItem: async (key: string, value: string) => { mockStore.set(key, value); },
    removeItem: async (key: string) => { mockStore.delete(key); },
  },
}));

import {
  clearPendingPaymentConfirmation,
  peekPendingPaymentConfirmation,
  RESTORE_MIN_AGE_MS,
  savePendingPaymentConfirmation,
} from '../utils/pending-payment-confirmation';

const result = { charged: 10, simulated: true, sessionReleased: true } as any;

beforeEach(() => { mockStore.clear(); jest.useRealTimers(); });

test('a saved confirmation is readable with its age until it is acknowledged', async () => {
  await savePendingPaymentConfirmation({ result, restaurantName: 'Cantina', tableSessionId: 's1' });
  const pending = await peekPendingPaymentConfirmation();
  expect(pending?.value.restaurantName).toBe('Cantina');
  expect(pending!.ageMs).toBeLessThan(RESTORE_MIN_AGE_MS);
  await clearPendingPaymentConfirmation();
  expect(await peekPendingPaymentConfirmation()).toBeNull();
});

test('a stale confirmation is discarded instead of resurfacing days later', async () => {
  mockStore.set('@noowe/payment-confirmation/pending', JSON.stringify({ result, savedAt: Date.now() - 60 * 60 * 1000 }));
  expect(await peekPendingPaymentConfirmation()).toBeNull();
  expect(mockStore.size).toBe(0);
});
