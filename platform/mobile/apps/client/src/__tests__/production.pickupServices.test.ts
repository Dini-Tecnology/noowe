jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DATE: 'date' },
  scheduleNotificationAsync: jest.fn(async () => `id-${Math.random()}`),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
}));

import * as Notifications from 'expo-notifications';
import { loadPickupFromCache, savePickupForOffline } from '../services/pickup-code-cache';
import { cancelPickupReminders, pickupReminderTimes, schedulePickupReminders } from '../services/pickup-reminders';

const entry = (orderId: string, fulfillmentStatus = 'ready') => ({
  orderId, pickupCode: 'K7M2PQ', restaurantName: 'Burger', callName: 'Ana',
  pickupExpiresAt: '2026-10-01T12:30:00Z', fulfillmentStatus,
});

describe('código de retirada offline', () => {
  it('guarda o pedido ativo e o devolve sem rede', async () => {
    await savePickupForOffline(entry('o1'));
    expect(await loadPickupFromCache('o1')).toMatchObject({ pickupCode: 'K7M2PQ', callName: 'Ana' });
    expect(await loadPickupFromCache('outro')).toBeNull();
  });

  it('descarta o pedido quando ele termina — retirado, não retirado ou cancelado', async () => {
    await savePickupForOffline(entry('o2'));
    await savePickupForOffline(entry('o2', 'picked_up'));
    expect(await loadPickupFromCache('o2')).toBeNull();
  });
});

describe('lembretes de retirada', () => {
  const ready = new Date('2026-10-01T12:00:00Z');
  const expires = new Date('2026-10-01T12:30:00Z');

  it('lembra na metade do prazo e 5 min antes de expirar', () => {
    const times = pickupReminderTimes(ready, expires, ready);
    expect(times.map((t) => [t.kind, t.at.toISOString()])).toEqual([
      ['half', '2026-10-01T12:15:00.000Z'],
      ['before_expiry', '2026-10-01T12:25:00.000Z'],
    ]);
  });

  it('não agenda lembrete que já passou', () => {
    const late = new Date('2026-10-01T12:20:00Z');
    expect(pickupReminderTimes(ready, expires, late).map((t) => t.kind)).toEqual(['before_expiry']);
    expect(pickupReminderTimes(ready, expires, new Date('2026-10-01T12:29:00Z'))).toEqual([]);
  });

  it('agenda notificações locais e cancela ao retirar', async () => {
    const scheduled = Notifications.scheduleNotificationAsync as jest.Mock;
    scheduled.mockClear();
    await schedulePickupReminders({ orderId: 'o9', restaurantName: 'Burger', readyAt: new Date(Date.now() - 1000), expiresAt: new Date(Date.now() + 30 * 60_000) });
    expect(scheduled).toHaveBeenCalledTimes(2);
    await cancelPickupReminders('o9');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(2);
  });
});
