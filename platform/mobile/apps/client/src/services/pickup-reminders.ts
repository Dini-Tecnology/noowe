import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

/**
 * Lembretes de retirada (ADR-013 §2.3). Sem cron no servidor, eles são notificações
 * locais agendadas quando o app vê o pedido pronto: na metade do prazo e 5 min antes
 * de expirar. O aviso de "pronto" vem do servidor (push).
 */
export const PICKUP_REMINDER_BEFORE_EXPIRY_MIN = 5;

export type PickupReminder = { at: Date; kind: 'half' | 'before_expiry' };

/** Quando lembrar. Só devolve horários futuros e distintos. */
export function pickupReminderTimes(readyAt: Date, expiresAt: Date, now: Date = new Date()): PickupReminder[] {
  const span = expiresAt.getTime() - readyAt.getTime();
  if (!(span > 0)) return [];
  const candidates: PickupReminder[] = [
    { at: new Date(readyAt.getTime() + span / 2), kind: 'half' },
    { at: new Date(expiresAt.getTime() - PICKUP_REMINDER_BEFORE_EXPIRY_MIN * 60_000), kind: 'before_expiry' },
  ];
  const future = candidates.filter((reminder) => reminder.at.getTime() > now.getTime());
  // Prazo curto: os dois lembretes colapsam em um só.
  return future.filter((reminder, index) =>
    index === 0 || reminder.at.getTime() - future[index - 1].at.getTime() >= 60_000);
}

const STORE_KEY = 'noowe:quick:pickup-reminders:v1';

async function readIds(): Promise<Record<string, string[]>> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function cancelPickupReminders(orderId: string): Promise<void> {
  const all = await readIds();
  for (const id of all[orderId] ?? []) {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
  }
  delete all[orderId];
  await AsyncStorage.setItem(STORE_KEY, JSON.stringify(all)).catch(() => undefined);
}

/** Agenda (de novo) os lembretes de um pedido pronto. Idempotente por pedido. */
export async function schedulePickupReminders(input: {
  orderId: string;
  restaurantName: string;
  readyAt: Date;
  expiresAt: Date;
}): Promise<void> {
  try {
    await cancelPickupReminders(input.orderId);
    const reminders = pickupReminderTimes(input.readyAt, input.expiresAt);
    if (reminders.length === 0) return;
    const ids: string[] = [];
    for (const reminder of reminders) {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: reminder.kind === 'half' ? 'Seu pedido está esperando' : 'Últimos minutos para retirar',
          body: `Retire seu pedido em ${input.restaurantName} antes que o prazo termine.`,
          data: { type: 'quick_pickup_reminder', orderId: input.orderId },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminder.at },
      });
      ids.push(id);
    }
    const all = await readIds();
    all[input.orderId] = ids;
    await AsyncStorage.setItem(STORE_KEY, JSON.stringify(all));
  } catch {
    // Lembrete é um auxílio: sem permissão ou sem agendador, o push do servidor continua valendo.
  }
}
