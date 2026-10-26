/**
 * Estado do cartão de uma reserva (ADR-021, porta 2). O servidor calcula a janela de check-in
 * (`checkInOpensAt`/`checkInClosesAt`); aqui só se decide o que mostrar. Sem a janela (leitura antiga),
 * cai nos padrões 5 min antes / 15 min depois só para não quebrar o cartão.
 */
import type { CustomerReservation } from '../../services/customer-backend';

const FALLBACK_LEAD_MS = 5 * 60 * 1000;
const FALLBACK_TOLERANCE_MS = 15 * 60 * 1000;

export type ReservationCardState =
  | { kind: 'inactive' }
  | { kind: 'pending' }
  | { kind: 'seated' }
  | { kind: 'expired' }
  | { kind: 'upcoming'; opensAt: Date; msUntilOpen: number }
  | { kind: 'check_in'; closesAt: Date }
  | { kind: 'waiting_table' };

export function reservationCardState(reservation: CustomerReservation, now: Date = new Date()): ReservationCardState {
  switch (reservation.status) {
    case 'seated': return { kind: 'seated' };
    case 'no_show': return { kind: 'expired' };
    case 'cancelled':
    case 'completed': return { kind: 'inactive' };
    case 'pending': return { kind: 'pending' };
    default: break;
  }
  const time = new Date(reservation.reservationTime).getTime();
  const opensAt = new Date(reservation.checkInOpensAt ?? time - FALLBACK_LEAD_MS);
  const closesAt = new Date(reservation.checkInClosesAt ?? time + FALLBACK_TOLERANCE_MS);
  if (now > closesAt) return { kind: 'expired' };
  if (reservation.checkedInAt) return { kind: 'waiting_table' };
  if (now < opensAt) return { kind: 'upcoming', opensAt, msUntilOpen: opensAt.getTime() - now.getTime() };
  return { kind: 'check_in', closesAt };
}

export function formatCountdown(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / 60000));
  if (minutes < 1) return 'agora';
  const days = Math.floor(minutes / 1440);
  if (days >= 1) return `${days} ${days === 1 ? 'dia' : 'dias'}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export const formatClock = (date: Date) =>
  date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
