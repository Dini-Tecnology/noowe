/**
 * Único lugar que traduz estado em rótulo (ADR-024): todos os perfis e os dois apps leem daqui.
 * As chaves são as do banco. `pending` é "Recebido" e `payment`, em mesa, é "Conta pedida".
 */

const ITEM_LABELS: Record<string, string> = {
  awaiting_payment: 'Aguardando pagamento',
  pending: 'Recebido',
  on_hold: 'Em espera',
  fired: 'Disparado',
  preparing: 'Em preparo',
  ready: 'Pronto',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

const ORDER_LABELS: Record<string, string> = {
  pending: 'Recebido',
  confirmed: 'Confirmado',
  preparing: 'Em preparo',
  open_for_additions: 'Em preparo',
  ready: 'Pronto',
  delivering: 'Saiu para entrega',
  delivered: 'Entregue',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};

const TABLE_LABELS: Record<string, string> = {
  available: 'Livre',
  reserved: 'Reservada',
  occupied: 'Ocupada',
  payment: 'Conta pedida',
  partial_payment: 'Pagamento parcial',
  cleaning: 'Limpeza',
  blocked: 'Bloqueada',
};

const SESSION_LABELS = {
  open: 'Aberta',
  billing: 'Conta pedida',
  partial: 'Pagamento parcial',
  paid: 'Paga',
  ended: 'Encerrada',
} as const;

export function itemStatusLabel(status: string): string {
  return ITEM_LABELS[status] ?? status;
}

export function orderStatusLabel(status: string): string {
  return ORDER_LABELS[status] ?? status;
}

export function tableStatusLabel(status: string): string {
  return TABLE_LABELS[status] ?? status;
}

export function sessionStatusLabel(session: {
  status: string;
  billingStatus?: string | null;
  paidCents?: number;
  totalCents?: number;
}): string {
  if (session.status !== 'active') return SESSION_LABELS.ended;
  const paid = session.paidCents ?? 0;
  const total = session.totalCents ?? 0;
  if (total > 0 && paid >= total) return SESSION_LABELS.paid;
  if (paid > 0) return SESSION_LABELS.partial;
  return session.billingStatus === 'billing' ? SESSION_LABELS.billing : SESSION_LABELS.open;
}
