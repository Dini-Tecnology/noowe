import type { TipMode } from '@okinawa/shared/services/supabase-api';

export const TIP_MODES: { mode: TipMode; label: string }[] = [
  { mode: 'equal', label: 'Igualitário' },
  { mode: 'points', label: 'Por pontos' },
  { mode: 'hours', label: 'Por horas' },
];

/** Funções que costumam entrar no rateio; quem não tem peso vale 1. */
export const TIP_ROLES = ['manager', 'maitre', 'host', 'waiter', 'barman', 'chef', 'cook', 'cashier'];

/** "12,50" vira 1250. Sem ponto flutuante: reais e centavos são lidos separados. Texto que não é valor devolve null. */
export function centsFromText(text: string): number | null {
  const match = text.trim().replace(/^R\$\s*/, '').match(/^(\d+)(?:[.,](\d{1,2}))?$/);
  if (!match) return null;
  return parseInt(match[1], 10) * 100 + parseInt((match[2] ?? '').padEnd(2, '0'), 10);
}

export function textFromCents(cents: number): string {
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`;
}
