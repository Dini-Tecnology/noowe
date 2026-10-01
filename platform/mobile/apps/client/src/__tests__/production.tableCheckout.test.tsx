import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTableCheckout } from '../hooks/useTableCheckout';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
let mockSequence = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `request-${++mockSequence}` }));
const mockPay = jest.fn();
const mockComplete = jest.fn();
jest.mock('../services/customer-backend', () => ({ __esModule: true, default: { payTableBill: (...args: unknown[]) => mockPay(...args) } }));
jest.mock('../contexts/VisitSessionContext', () => ({ useVisitSession: () => ({ completeCheckout: mockComplete }) }));

function setup(overrides = {}) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: 0 }, queries: { retry: false, gcTime: 0 } } });
  const options = { tableSessionId: 's1', tipPercent: 10, paymentMethod: 'pix' as const, splitMode: 'mine' as const,
    baseAmount: 20, onSuccess: jest.fn(), onError: jest.fn(), ...overrides };
  const hook = renderHook(() => useTableCheckout(options), { wrapper: ({ children }: React.PropsWithChildren) =>
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider> });
  return { ...hook, options };
}
const paid = { receiptId: 'receipt', charged: 24, simulated: true, sessionReleased: true, tableClosed: true };

beforeEach(async () => {
  await AsyncStorage.clear();
  mockPay.mockReset();
  mockComplete.mockReset().mockResolvedValue(undefined);
});

test('commits payment, clears the visit and confirms the server result only once on a double tap', async () => {
  mockPay.mockResolvedValue(paid);
  const { result, options } = setup();
  act(() => { result.current.mutate(); result.current.mutate(); });
  await waitFor(() => expect(options.onSuccess.mock.calls[0]?.[0]).toEqual(paid));
  expect(mockPay).toHaveBeenCalledTimes(1);
  expect(mockComplete).toHaveBeenCalledWith('s1');
  expect(await AsyncStorage.getItem('@noowe/table-checkout/s1')).toBeNull();
});

test('replays the same persisted intent after a network failure and screen remount', async () => {
  mockPay.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(paid);
  const first = setup();
  act(() => first.result.current.mutate());
  await waitFor(() => expect(first.options.onError).toHaveBeenCalled());
  const original = mockPay.mock.calls[0][0];
  first.unmount();
  const second = setup({ tipPercent: 20 });
  act(() => second.result.current.mutate());
  await waitFor(() => expect(second.options.onSuccess).toHaveBeenCalled());
  expect(mockPay.mock.calls[1][0]).toEqual(original);
});

test('keeps the visit for a partially paid account', async () => {
  mockPay.mockResolvedValue({ ...paid, sessionReleased: false, tableClosed: false });
  const { result, options } = setup({ splitMode: 'fixed', baseAmount: 5 });
  act(() => result.current.mutate());
  await waitFor(() => expect(options.onSuccess).toHaveBeenCalled());
  expect(mockComplete).not.toHaveBeenCalled();
});

test('does not report a committed payment as failed if local cleanup fails', async () => {
  mockPay.mockResolvedValue(paid);
  mockComplete.mockRejectedValue(new Error('storage unavailable'));
  const { result, options } = setup();
  act(() => result.current.mutate());
  await waitFor(() => expect(options.onSuccess).toHaveBeenCalled());
  expect(options.onError).not.toHaveBeenCalled();
});

test('allows a corrected request after server validation rolls the transaction back', async () => {
  mockPay.mockRejectedValueOnce({ code: '22023', message: 'changed bill' }).mockResolvedValueOnce(paid);
  const first = setup();
  act(() => first.result.current.mutate());
  await waitFor(() => expect(first.options.onError).toHaveBeenCalled());
  const key = mockPay.mock.calls[0][0].idempotencyKey;
  first.unmount();
  const second = setup({ baseAmount: 30 });
  act(() => second.result.current.mutate());
  await waitFor(() => expect(second.options.onSuccess).toHaveBeenCalled());
  expect(mockPay.mock.calls[1][0].idempotencyKey).not.toEqual(key);
  expect(mockPay.mock.calls[1][0].baseAmount).toBe(30);
});
