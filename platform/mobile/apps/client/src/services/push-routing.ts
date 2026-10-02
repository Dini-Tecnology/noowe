/**
 * Pedido de destino de um push. O servidor manda `metadata` achatado no topo do `data`
 * (`orderId`, `fulfillmentStatus`...) mais `relatedId`/`relatedType`; os lembretes locais
 * de retirada mandam só `orderId`. Qualquer push sobre um pedido abre o pedido.
 */
export function orderIdFromPush(data: Record<string, unknown> | null | undefined): string | null {
  if (!data) return null;
  const candidate = typeof data.orderId === 'string' && data.orderId
    ? data.orderId
    : data.relatedType === 'order' ? data.relatedId : null;
  return typeof candidate === 'string' && candidate ? candidate : null;
}
