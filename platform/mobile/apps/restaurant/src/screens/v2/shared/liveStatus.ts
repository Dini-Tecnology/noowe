/**
 * Estados lidos pelas telas ao vivo, em um lugar só. Antes cada tela comparava à sua maneira:
 * a Caixa tratava "sem sessão" como fechado e o Relatório como aberto; o servidor cria chamado
 * como `pending` e a tela filtrava `open`.
 */

/** Chamado que ainda espera alguém. O servidor grava `pending`; `open` é legado. */
export const OPEN_CALL_STATUSES = ['pending', 'open'] as const;
/** Chamados que a equipe ainda precisa ver (esperando ou já assumidos). */
export const ACTIVE_CALL_STATUSES = ['pending', 'open', 'acknowledged'] as string[];

export function isOpenCall(status?: string | null): boolean {
  return (OPEN_CALL_STATUSES as readonly string[]).includes(status ?? '');
}

export type CashRegisterStatus = 'open' | 'closed';

/** Sem sessão de caixa (nunca aberto, ou fechado) é fechado, em toda tela. */
export function cashRegisterStatus(session?: { isOpen?: boolean } | null): CashRegisterStatus {
  return session?.isOpen ? 'open' : 'closed';
}

/** Mesa que conta como "em atendimento" para o garçom: ocupada, em cobrança, com gente ou com pedido. */
export function isTableInService(table: {
  status?: string | null;
  guestCount?: number | null;
  pendingOrders?: number | null;
}): boolean {
  return (
    table.status === 'occupied' ||
    table.status === 'payment' ||
    table.status === 'partial_payment' ||
    (table.guestCount ?? 0) > 0 ||
    (table.pendingOrders ?? 0) > 0
  );
}
