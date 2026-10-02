import type { CartItem } from '@/shared/contexts/CartContext';
import type { PlaceOrderItem } from '../services/customer-backend';

/**
 * Carrinho → itens do pedido. Único ponto de conversão para todas as telas que fecham pedido.
 *
 * - Personalização segue como `{ options, removed }`; o servidor valida e precifica.
 * - Combo vira três linhas com o mesmo `comboGroup` (uma por unidade), cada uma com a
 *   personalização da sua etapa. O desconto é calculado no servidor.
 * - Preço nunca vai: quem determina o valor é o servidor (invariante 2).
 */
export function cartOrderItems(items: CartItem[]): PlaceOrderItem[] {
  const out: PlaceOrderItem[] = [];
  for (const item of items) {
    if (!item.combo) {
      out.push({
        menuItemId: item.menu_item_id,
        quantity: item.quantity,
        specialInstructions: item.special_instructions,
        ...(item.customizations ? { customizations: item.customizations } : {}),
        ...(item.diner_id ? { dinerId: item.diner_id } : {}),
      });
      continue;
    }
    const { lancheItemId, acompanhamentoItemId, bebidaItemId, customizations } = item.combo;
    for (let unit = 0; unit < item.quantity; unit += 1) {
      const comboGroup = `${item.id}:${unit}`;
      const line = (menuItemId: string, step: 'lanche' | 'acompanhamento' | 'bebida'): PlaceOrderItem => ({
        menuItemId,
        quantity: 1,
        comboGroup,
        ...(customizations?.[step] ? { customizations: customizations[step] } : {}),
      });
      out.push(line(lancheItemId, 'lanche'), line(acompanhamentoItemId, 'acompanhamento'), line(bebidaItemId, 'bebida'));
    }
  }
  return out;
}
