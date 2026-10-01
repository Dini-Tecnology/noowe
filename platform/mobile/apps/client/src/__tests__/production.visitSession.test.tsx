import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { VisitSessionProvider, useVisitSession } from '../contexts/VisitSessionContext';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const mockActive = jest.fn();
const mockOpen = jest.fn();
const mockResolveQr = jest.fn();
const mockAcceptUserInvite = jest.fn();
const mockCheckIn = jest.fn();
const mockDevCheckIn = jest.fn();
jest.mock('../services/customer-backend', () => ({ __esModule: true, default: {
  getActiveVisit: () => mockActive(), openTableSession: () => mockOpen(),
  resolveServiceQr: () => mockResolveQr(),
  checkIn: (qr: string, model: string) => { mockCheckIn(qr, model); return mockOpen(); },
  devCheckIn: (qr: string, model: string) => { mockDevCheckIn(qr, model); return mockOpen(); },
  acceptTableUserInvite: (id: string) => mockAcceptUserInvite(id),
} }));
const oldVisit = { restaurantId: 'r1', tableId: 't1', tableSessionId: 's1', tableNumber: '1' };
const newVisit = { ...oldVisit, tableId: 't2', tableSessionId: 's2' };
const key = '@noowe/client/visit-session/v1';
const setup = () => renderHook(useVisitSession, { wrapper: VisitSessionProvider });
beforeEach(async () => {
  await AsyncStorage.clear();
  mockActive.mockReset().mockResolvedValue(null);
  mockOpen.mockReset();
  mockResolveQr.mockReset().mockResolvedValue({ kind: 'table', restaurantId: 'r1', serviceModel: 'casual_dining' });
  mockAcceptUserInvite.mockReset();
  mockCheckIn.mockReset();
  mockDevCheckIn.mockReset();
});

test('does not restore a closed table from local storage', async () => {
  await AsyncStorage.setItem(key, JSON.stringify(oldVisit));
  const { result } = setup();
  await waitFor(() => expect(result.current.restoring).toBe(false));
  expect(result.current.session).toBeNull();
  expect(await AsyncStorage.getItem(key)).toBeNull();
});

test('restores the current server visit instead of a stale cached table', async () => {
  await AsyncStorage.setItem(key, JSON.stringify(oldVisit));
  mockActive.mockResolvedValue(newVisit);
  const { result } = setup();
  await waitFor(() => expect(result.current.restoring).toBe(false));
  expect(result.current.session).toEqual(newVisit);
});

test('an older payment completion cannot clear a newer visit', async () => {
  mockActive.mockResolvedValue(oldVisit);
  const { result } = setup();
  await waitFor(() => expect(result.current.restoring).toBe(false));
  const finishOldPayment = result.current.completeCheckout;
  mockOpen.mockResolvedValue(newVisit);
  await act(async () => { await result.current.openFromQr('qr2'); });
  await act(async () => { await finishOldPayment('s1'); });
  expect(result.current.session).toEqual(newVisit);
});

test('browsing another restaurant keeps the active table available for settlement', async () => {
  mockActive.mockResolvedValue(oldVisit);
  const { result } = setup();
  await waitFor(() => expect(result.current.restoring).toBe(false));
  await act(async () => { await result.current.selectRestaurant('r2'); });
  expect(result.current.session).toEqual(oldVisit);
});

test('accepting an @username invite moves the visit to the invited table', async () => {
  mockActive.mockResolvedValue(oldVisit);
  mockAcceptUserInvite.mockResolvedValue({ status: 'accepted', visit: newVisit, capacityRequestId: null, invite: null, idempotentReplay: false });
  const { result } = setup();
  await waitFor(() => expect(result.current.restoring).toBe(false));
  await act(async () => { await result.current.joinFromUserInvite('inv1'); });
  expect(mockAcceptUserInvite).toHaveBeenCalledWith('inv1');
  expect(result.current.session).toEqual(newVisit);
  expect(JSON.parse((await AsyncStorage.getItem(key))!)).toEqual(newVisit);
});

test.each(['awaiting_capacity', 'expired', 'cancelled'] as const)(
  'an @username invite that is %s keeps the current table',
  async (status) => {
    mockActive.mockResolvedValue(oldVisit);
    mockAcceptUserInvite.mockResolvedValue({ status, visit: null, capacityRequestId: null, invite: null, idempotentReplay: false });
    const { result } = setup();
    await waitFor(() => expect(result.current.restoring).toBe(false));
    let returned: unknown;
    await act(async () => { returned = await result.current.joinFromUserInvite('inv1'); });
    expect(returned).toMatchObject({ status });
    expect(result.current.session).toEqual(oldVisit);
  },
);

test('a failed @username accept (unpaid balance elsewhere) keeps the current table', async () => {
  mockActive.mockResolvedValue(oldVisit);
  mockAcceptUserInvite.mockRejectedValue(Object.assign(new Error('Quite sua conta'), { code: 'P0004' }));
  const { result } = setup();
  await waitFor(() => expect(result.current.restoring).toBe(false));
  await act(async () => { await expect(result.current.joinFromUserInvite('inv1')).rejects.toMatchObject({ code: 'P0004' }); });
  expect(result.current.session).toEqual(oldVisit);
});

test('the test-table shortcut checks in without a booking; a real scan still requires one', async () => {
  const { result } = setup();
  await waitFor(() => expect(result.current.restoring).toBe(false));
  mockOpen.mockResolvedValue(newVisit);

  await act(async () => { await result.current.openFromQr('qr-dev', { dev: true }); });
  expect(mockDevCheckIn).toHaveBeenCalledWith('qr-dev', 'casual_dining');
  expect(mockCheckIn).not.toHaveBeenCalled();

  await act(async () => { await result.current.openFromQr('qr-real'); });
  expect(mockCheckIn).toHaveBeenCalledWith('qr-real', 'casual_dining');
  expect(mockDevCheckIn).toHaveBeenCalledTimes(1);
});
