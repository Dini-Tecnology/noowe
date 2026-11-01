import { formatTableLabel } from './tableLabel';

/** Linha de `restaurant_get_bar_queue`; as telas liam campos que a RPC nunca devolveu. */
export type RawBarQueueRow = {
  id: string;
  order_id?: string;
  table_number?: string | number | null;
  customer_name?: string | null;
  name?: string | null;
  quantity?: number | null;
  status: string;
  order_created_at?: string | null;
  created_at?: string | null;
};

export type BarQueueItem = {
  id: string;
  orderId: string | null;
  tableLabel: string;
  name: string;
  quantity: number;
  status: string;
  elapsedMinutes: number | null;
};

export function mapBarQueueRow(raw: RawBarQueueRow, now: number = Date.now()): BarQueueItem {
  const since = raw.order_created_at || raw.created_at;
  const parsed = since ? new Date(since).getTime() : NaN;
  const tableLabel = raw.table_number
    ? formatTableLabel(raw.table_number)
    : raw.customer_name
      ? `Sem mesa · ${raw.customer_name}`
      : 'Sem mesa';
  return {
    id: raw.id,
    orderId: raw.order_id ?? null,
    tableLabel,
    name: raw.name?.trim() || 'Bebida',
    quantity: raw.quantity ?? 1,
    status: raw.status,
    elapsedMinutes: Number.isNaN(parsed) ? null : Math.max(0, Math.round((now - parsed) / 60000)),
  };
}

type ItemStatusApi = { updateOrderItemStatus(itemId: string, status: string): Promise<unknown> };

/**
 * Avança todos os itens de um card de pedido. O servidor só aceita `ready` no pedido quando todos os itens
 * estão prontos, então chamar o status do pedido falhava em silêncio; o status do item é o caminho certo.
 */
export async function advanceItems(api: ItemStatusApi, itemIds: string[], status: string): Promise<void> {
  const results = await Promise.allSettled(itemIds.map((id) => api.updateOrderItemStatus(id, status)));
  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failed) throw failed.reason;
}
