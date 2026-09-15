import type { CustomerWalletTransaction } from '../../services/customer-backend';

const CREDIT_TYPES = new Set(['cashback', 'credit', 'bonus', 'promotion', 'refund', 'transfer_in']);

export function formatWalletDate(value: string, now = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const differenceDays = Math.round((startToday.getTime() - startDate.getTime()) / 86_400_000);
  const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date);
  if (differenceDays === 0) return `Hoje, ${time}`;
  if (differenceDays === 1) return `Ontem, ${time}`;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(date);
}

export function isWalletCredit(transaction: CustomerWalletTransaction): boolean {
  if (transaction.kind === 'payment' || transaction.kind === 'transfer_out') return false;
  return CREDIT_TYPES.has(transaction.kind) || transaction.amount > 0;
}

export function parseWalletAmount(value: string): number {
  const normalized = value.replace(/\s/g, '').replace('R$', '').replace(/\./g, '').replace(',', '.');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

