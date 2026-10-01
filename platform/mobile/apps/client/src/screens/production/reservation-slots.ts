import { parseDaySchedule, type Shift } from '@okinawa/shared/utils/opening-hours';

/** Restaurante precisa de ao menos essa janela para o pedido acontecer. */
export const MIN_STAY_MINUTES = 60;
/** RPC exige `p_reservation_time >= now() + 30min` — casa a folga do backend. */
export const MIN_LEAD_MINUTES = 30;
export const SLOT_INTERVAL_MINUTES = 30;
export interface DayHours {
  shifts: Shift[];
  closed: boolean;
}

/** Dia sem dados no banco = null; dia fechado ou sem turno = closed. */
export function parseDayHours(entry: unknown): DayHours | null {
  if (!entry || typeof entry !== 'object') return null;
  return parseDaySchedule(entry);
}

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Gera slots de 30 em 30 minutos entre `open` e `close - MIN_STAY_MINUTES`,
 * filtrando o passado quando a data selecionada é hoje. Também respeita a
 * folga mínima que o RPC exige (`MIN_LEAD_MINUTES`), então uma reserva enviada
 * daqui sempre atende a validação `p_reservation_time >= now() + 30min`.
 */
export function buildTimeSlots(hours: DayHours, date: Date, now = new Date()): string[] {
  const isToday = toDateKey(date) === toDateKey(now);
  const minMinutesToday = isToday ? now.getHours() * 60 + now.getMinutes() + MIN_LEAD_MINUTES : -Infinity;
  const slots = new Set<string>();
  // Cada turno gera os próprios horários — o intervalo entre turnos fica sem slots.
  for (const shift of [...hours.shifts].sort((a, b) => a.open.localeCompare(b.open))) {
    const [openH, openM] = shift.open.split(':').map(Number);
    const [closeH, closeM] = shift.close.split(':').map(Number);
    const openMin = openH * 60 + openM;
    // Fechamento pós-meia-noite (ex.: 00:30) rola para o dia seguinte.
    const rawCloseMin = closeH * 60 + closeM;
    const closeMin = rawCloseMin <= openMin ? rawCloseMin + 24 * 60 : rawCloseMin;
    const lastSlot = closeMin - MIN_STAY_MINUTES;
    for (let minutes = openMin; minutes <= lastSlot; minutes += SLOT_INTERVAL_MINUTES) {
      if (minutes < minMinutesToday) continue;
      const displayMinutes = minutes % (24 * 60);
      const h = Math.floor(displayMinutes / 60);
      const m = displayMinutes % 60;
      slots.add(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return [...slots];
}

