/**
 * Erros de negócio do pedido Quick Service (ADR-013), devolvidos pelo servidor
 * como SQLSTATE próprio. O app traduz o código em uma mensagem e uma ação; nunca
 * interpreta o texto da mensagem.
 */
export type QuickOrderErrorKind =
  | 'duplicate'      // P0005 — mesmo carrinho já em andamento
  | 'paused'         // P0006 — restaurante pausou os pedidos
  | 'closed'         // P0007 — fechado ou dentro da janela de encerramento
  | 'slot_full'      // P0004 — horário de retirada esgotado
  | 'policy'         // 22023 — política de retirada / nome para chamada
  | 'order_closed';  // P0001 — pedido cancelado, não aceita mais pagamento

type PostgrestLikeError = { code?: unknown; details?: unknown; message?: unknown } | null | undefined;

const KIND_BY_CODE: Record<string, QuickOrderErrorKind> = {
  P0005: 'duplicate',
  P0006: 'paused',
  P0007: 'closed',
  P0004: 'slot_full',
  '22023': 'policy',
  P0001: 'order_closed',
};

export function quickOrderErrorKind(error: unknown): QuickOrderErrorKind | null {
  const code = (error as PostgrestLikeError)?.code;
  return typeof code === 'string' ? (KIND_BY_CODE[code] ?? null) : null;
}

/** Id do pedido já existente, enviado pelo servidor em `details` no erro de duplicado. */
export function duplicateOrderId(error: unknown): string | null {
  if (quickOrderErrorKind(error) !== 'duplicate') return null;
  const details = (error as PostgrestLikeError)?.details;
  return typeof details === 'string' && /^[0-9a-f-]{36}$/i.test(details) ? details : null;
}

export const QUICK_ORDER_ERROR_COPY: Record<QuickOrderErrorKind, { title: string; message: string }> = {
  duplicate: { title: 'Pedido já em andamento', message: 'Você já tem um pedido igual em andamento neste restaurante.' },
  paused: { title: 'Pedidos pausados', message: 'O restaurante pausou os pedidos por enquanto. Tente novamente em instantes.' },
  closed: { title: 'Fora do horário de pedidos', message: 'O restaurante não está aceitando pedidos agora.' },
  slot_full: { title: 'Horário esgotado', message: 'Esse horário de retirada está cheio. Escolha outro horário.' },
  policy: { title: 'Confira seu pedido', message: 'Aceite a política de retirada e informe o nome para chamada.' },
  order_closed: { title: 'Pedido encerrado', message: 'Este pedido foi cancelado e não aceita mais pagamento.' },
};
