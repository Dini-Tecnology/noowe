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

export type KdsItemState = { id: string; status: string };

type ItemStatusApi = { updateOrderItemStatus(itemId: string, status: string): Promise<unknown> };

/** O servidor aceita Pronto vindo de Recebido ou Em preparo: o item entra em preparo sozinho. */
function stepsTo(current: string, target: 'preparing' | 'ready'): string[] {
  if (current === 'pending' || current === 'received' || current === 'confirmed') return [target];
  if (current === 'preparing' && target === 'ready') return ['ready'];
  return [];
}

/**
 * Avança os itens de um card de pedido. O servidor só aceita `ready` no pedido quando todos os itens estão
 * prontos, então chamar o status do pedido falhava em silêncio; o status do item é o caminho certo. Num mesmo
 * card pode haver item em estados diferentes: cada um anda só os passos que faltam.
 */
export async function advanceItems(api: ItemStatusApi, items: KdsItemState[], target: 'preparing' | 'ready'): Promise<void> {
  const results = await Promise.allSettled(
    items.map(async (item) => {
      for (const step of stepsTo(item.status, target)) {
        await api.updateOrderItemStatus(item.id, step);
      }
    }),
  );
  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failed) throw failed.reason;
}

/** Estado do card: pronto só com todos os itens prontos; em preparo se algum já começou. */
export function kdsCardStatus(items: KdsItemState[]): 'queue' | 'preparing' | 'ready' {
  if (items.length > 0 && items.every((item) => item.status === 'ready')) return 'ready';
  if (items.some((item) => item.status === 'preparing' || item.status === 'ready')) return 'preparing';
  return 'queue';
}
