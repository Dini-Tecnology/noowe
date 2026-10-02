import Ionicons from '@expo/vector-icons/Ionicons';
import type { CartItem } from '@/shared/contexts/CartContext';
import {
  EMPTY_SELECTION,
  noteFromSpecialInstructions,
  reconcileSelection,
  selectionDeltaCents,
  selectionFromSnapshot,
  selectionSummary,
  unitPriceWithExtras,
  type MenuCustomizations,
} from '../../utils/item-customization';

type IoniconName = keyof typeof Ionicons.glyphMap;

export type QuickServiceFilterKey = 'skip_the_line' | 'burgers' | 'pizza' | 'acai' | 'saudavel';

/**
 * Sub-tag filters on the quick_service home tab. `skip_the_line` filters on
 * the restaurant's `skip_the_line_enabled` flag; the rest filter on
 * `cuisine_types`. Unlike casual/fine dining's multi-select amenity chips,
 * these behave like a single-select radio row — the mockup only ever shows
 * one chip highlighted at a time.
 */
export const QUICK_SERVICE_FILTERS: { key: QuickServiceFilterKey; label: string; icon: IoniconName; cuisine?: string }[] = [
  { key: 'skip_the_line', label: 'Skip the Line', icon: 'flash' },
  { key: 'burgers', label: 'Burgers', icon: 'fast-food-outline', cuisine: 'Burgers' },
  { key: 'pizza', label: 'Pizza', icon: 'pizza-outline', cuisine: 'Pizza' },
  { key: 'acai', label: 'Açaí', icon: 'ice-cream-outline', cuisine: 'Açaí' },
  { key: 'saudavel', label: 'Saudável', icon: 'leaf-outline', cuisine: 'Saudável' },
];

/** The 3 steps shown on the restaurant page's "Como funciona o Skip the Line" card. */
export const SKIP_THE_LINE_STEPS: { title: string; icon: IoniconName }[] = [
  { title: 'Monte seu pedido pelo app', icon: 'restaurant-outline' },
  { title: 'Pague na hora — sem fila no caixa', icon: 'card-outline' },
  { title: 'Receba o código e retire no balcão express', icon: 'qr-code-outline' },
];

// ---------------------------------------------------------------------------
// Acompanhamento do pedido (ADR-013 §2.2)
// ---------------------------------------------------------------------------

export type QuickTrackingStepKey = 'paid' | 'accepted' | 'preparing' | 'ready' | 'picked_up';

/** O que o cliente vê. A Conferência do KDS aparece para ele dentro de "Em preparo". */
export const QUICK_TRACKING_STEPS: { key: QuickTrackingStepKey; label: string; icon: IoniconName }[] = [
  { key: 'paid', label: 'Pago', icon: 'card-outline' },
  { key: 'accepted', label: 'Aceito', icon: 'checkmark-circle-outline' },
  { key: 'preparing', label: 'Em preparo', icon: 'flame-outline' },
  { key: 'ready', label: 'Pronto', icon: 'notifications-outline' },
  { key: 'picked_up', label: 'Retirado', icon: 'bag-check-outline' },
];

export type QuickTerminal = 'not_picked_up' | 'cancelled' | 'refunded';

export type QuickTrackingState = {
  /** Índice em QUICK_TRACKING_STEPS; -1 enquanto o pagamento não foi confirmado ou em estado terminal. */
  stepIndex: number;
  awaitingPayment: boolean;
  terminal: QuickTerminal | null;
};

/**
 * Única fonte do mapeamento banco → etapa do cliente. Trocar a regra de etapas
 * é mudar esta função (ADR-013 §2.2).
 */
export function quickTrackingStep(order: {
  paymentStatus: string;
  fulfillmentStatus: string;
}): QuickTrackingState {
  const { paymentStatus, fulfillmentStatus } = order;
  if (fulfillmentStatus === 'not_picked_up') return { stepIndex: -1, awaitingPayment: false, terminal: 'not_picked_up' };
  if (fulfillmentStatus === 'cancelled') {
    return { stepIndex: -1, awaitingPayment: false, terminal: paymentStatus === 'refunded' ? 'refunded' : 'cancelled' };
  }
  if (paymentStatus !== 'confirmed') return { stepIndex: -1, awaitingPayment: true, terminal: null };
  const stepIndex = (() => {
    switch (fulfillmentStatus) {
      case 'accepted': return 1;
      case 'preparing':
      case 'checking': return 2;
      case 'ready': return 3;
      case 'picked_up':
      case 'delivered': return 4;
      default: return 0; // received + pago
    }
  })();
  return { stepIndex, awaitingPayment: false, terminal: null };
}

/** O cliente só cancela até o início do preparo (ADR-013 §2.5). */
export function canCustomerCancelQuickOrder(order: { fulfillmentStatus: string; paymentStatus: string }): boolean {
  return (order.fulfillmentStatus === 'received' || order.fulfillmentStatus === 'accepted')
    && (order.paymentStatus === 'pending' || order.paymentStatus === 'confirmed');
}

/** Conteúdo do QR de retirada: pedido + código, conferidos no balcão. */
export function pickupQrPayload(orderId: string, pickupCode: string): string {
  return `noowe://pickup/${orderId}/${pickupCode}`;
}

/** Minutos e segundos restantes até `deadline`; nunca negativo. */
export function remainingSeconds(deadline: string | null | undefined, now: number = Date.now()): number | null {
  if (!deadline) return null;
  const target = Date.parse(deadline);
  if (Number.isNaN(target)) return null;
  return Math.max(0, Math.floor((target - now) / 1000));
}

export function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/** Política de retirada mostrada e aceita no checkout (ADR-013 §2.3). */
export function pickupPolicyText(policies: {
  pickupExpiryMin: number | null;
  noPickupPolicy: 'none' | 'store_credit' | null;
}): string {
  const minutes = policies.pickupExpiryMin;
  const window = minutes ? `Você tem ${minutes} minutos para retirar depois que o pedido ficar pronto.` : 'Retire o pedido assim que ele ficar pronto.';
  const consequence = policies.noPickupPolicy === 'store_credit'
    ? 'Se não retirar, o valor vira crédito na sua carteira.'
    : 'Se não retirar, o pedido é marcado como não retirado e não há reembolso.';
  return `${window} ${consequence}`;
}

/** Textos do estado de recebimento de pedidos mostrados na lista e na página do restaurante. */
export function quickStateLabel(state: string, closesAt: string | null, acceptsUntilMinutes: number | null): { label: string; tone: 'ok' | 'warn' | 'off' } {
  switch (state) {
    case 'open':
      if (acceptsUntilMinutes != null && acceptsUntilMinutes <= 60) return { label: `Aceita pedidos por mais ${acceptsUntilMinutes} min`, tone: 'warn' };
      return { label: closesAt ? `Aceitando pedidos · até ${closesAt}` : 'Aceitando pedidos', tone: 'ok' };
    case 'paused': return { label: 'Pedidos pausados', tone: 'warn' };
    case 'closing': return { label: 'Encerrando pedidos', tone: 'warn' };
    case 'closed': return { label: 'Fechado', tone: 'off' };
    default: return { label: 'Indisponível', tone: 'off' };
  }
}

// ---------------------------------------------------------------------------
// Ações da página do restaurante (ADR-013 §2.1) — por capability, nunca por modelo
// ---------------------------------------------------------------------------

export type QuickJourneyKey = 'order' | 'schedule' | 'my_orders' | 'reorder';

/**
 * Quais ações do Quick Service aparecem na página do restaurante, na ordem.
 * `orderAhead` e `pickupSlots` vêm das capabilities; o histórico decide entre
 * "Meus pedidos" (há pedido em andamento aqui) e "Pedir novamente".
 */
export function quickJourneyKeys(input: {
  orderAhead: boolean;
  pickupSlots: boolean;
  hasActiveOrder: boolean;
  hasPastOrder: boolean;
}): QuickJourneyKey[] {
  if (!input.orderAhead) return [];
  const keys: QuickJourneyKey[] = ['order'];
  if (input.pickupSlots) keys.push('schedule');
  if (input.hasActiveOrder) keys.push('my_orders');
  else if (input.hasPastOrder) keys.push('reorder');
  return keys;
}

const ACTIVE_FULFILLMENT = ['received', 'accepted', 'preparing', 'checking', 'ready'];

/** Pedido ainda em andamento (não terminal e não aguardando pagamento que falhou). */
export function isActiveQuickOrder(order: { fulfillmentStatus: string; paymentStatus: string }): boolean {
  return ACTIVE_FULFILLMENT.includes(order.fulfillmentStatus)
    && (order.paymentStatus === 'pending' || order.paymentStatus === 'confirmed');
}

// ---------------------------------------------------------------------------
// Pedir novamente (T-Q1-16)
// ---------------------------------------------------------------------------

type ReorderOrderItem = {
  menuItemId: string; quantity: number; name: string; specialInstructions: string | null;
  /** Snapshot da personalização (ADR-013 §2.9). */
  customizations?: unknown;
};
type ReorderMenuItem = {
  id: string; name: string; price: number; imageUrl: string | null; preparationTime: number | null;
};

/**
 * Monta o carrinho de um pedido anterior com o cardápio de hoje: preço atual, só
 * itens ainda disponíveis (o cardápio já vem filtrado) e a lista do que ficou de fora.
 * O servidor recalcula tudo na criação do pedido; o preço aqui é só exibição.
 */
export function buildReorder(
  items: ReorderOrderItem[],
  menu: ReorderMenuItem[],
  customizations: MenuCustomizations = {},
): { cartItems: Omit<CartItem, 'id'>[]; unavailable: string[]; needsChoice: string[] } {
  const byId = new Map(menu.map((item) => [item.id, item]));
  const cartItems: Omit<CartItem, 'id'>[] = [];
  const unavailable: string[] = [];
  const needsChoice: string[] = [];
  for (const line of items) {
    const current = byId.get(line.menuItemId);
    if (!current) {
      unavailable.push(line.name);
      continue;
    }
    // A personalização antiga só volta se ainda couber na configuração de hoje.
    const config = customizations[current.id];
    const selection = reconcileSelection(config, selectionFromSnapshot(line.customizations));
    if (selection === null) {
      needsChoice.push(current.name);
      continue;
    }
    cartItems.push({
      menu_item_id: current.id,
      name: current.name,
      price: unitPriceWithExtras(current.price, selectionDeltaCents(config, selection ?? EMPTY_SELECTION)),
      quantity: line.quantity,
      special_instructions: noteFromSpecialInstructions(line.specialInstructions, line.customizations),
      customizations: selection,
      customization_summary: (selection && selectionSummary(config, selection)) || undefined,
      image_url: current.imageUrl ?? undefined,
      preparation_time: current.preparationTime,
    });
  }
  return { cartItems, unavailable, needsChoice };
}

// ---------------------------------------------------------------------------
// Distância (ADR-013 §2.6): só avisa, nunca bloqueia
// ---------------------------------------------------------------------------

/** O limite vem de `restaurant_model_policies.distance_warning_km`; sem limite ou sem posição, não avisa. */
export function isFarFromRestaurant(distanceKm: number | null, thresholdKm: number | null): boolean {
  if (distanceKm == null || thresholdKm == null) return false;
  return distanceKm > thresholdKm;
}

export function formatDistance(distanceKm: number): string {
  return distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1).replace('.', ',')} km`;
}

// ---------------------------------------------------------------------------
// Combo: desconto vem da configuração (basis points), nunca de literal
// ---------------------------------------------------------------------------

/**
 * Desconto do combo em reais, calculado em centavos inteiros. `bps` é
 * `policies.comboDiscountBps`; sem política, não há desconto (falha fechada).
 * É só exibição: o servidor recalcula o valor cobrado.
 */
export function comboDiscountAmount(listPrice: number, bps: number | null | undefined): number {
  if (!bps || bps <= 0 || listPrice <= 0) return 0;
  const cents = Math.round(listPrice * 100);
  return Math.round((cents * bps) / 10000) / 100;
}

/** Desconto total do carrinho: soma de (preço de lista − preço do combo) × quantidade. */
export function cartComboDiscount(items: { price: number; quantity: number; combo?: { listPrice?: number } }[]): number {
  const cents = items.reduce((sum, item) => {
    const list = item.combo?.listPrice;
    if (list == null || list <= item.price) return sum;
    return sum + Math.round((list - item.price) * 100) * Math.max(1, item.quantity);
  }, 0);
  return cents / 100;
}

// ---------------------------------------------------------------------------
// Horários de retirada agendada (a capacidade por janela é do servidor)
// ---------------------------------------------------------------------------

const PICKUP_SLOT_STEP_MIN = 15;
const PICKUP_SLOT_LEAD_MIN = 5;
const PICKUP_SLOT_COUNT = 4;

/** Próximas janelas de retirada, alinhadas ao passo da grade. O servidor recusa janela cheia. */
export function pickupSlotOptions(now: Date = new Date()): string[] {
  const first = new Date(now);
  first.setSeconds(0, 0);
  first.setMinutes(Math.ceil((first.getMinutes() + PICKUP_SLOT_LEAD_MIN) / PICKUP_SLOT_STEP_MIN) * PICKUP_SLOT_STEP_MIN);
  return Array.from({ length: PICKUP_SLOT_COUNT }, (_, index) =>
    new Date(first.getTime() + index * PICKUP_SLOT_STEP_MIN * 60_000).toISOString());
}

// ---------------------------------------------------------------------------
// Histórico do pedido (log de status com horário — contestações)
// ---------------------------------------------------------------------------

const EVENT_LABELS: Record<string, string> = {
  'payment_status:pending': 'Aguardando pagamento',
  'payment_status:confirmed': 'Pagamento confirmado',
  'payment_status:failed': 'Pagamento não concluído',
  'payment_status:refunded': 'Valor estornado',
  'fulfillment_status:received': 'Pedido recebido',
  'fulfillment_status:accepted': 'Pedido aceito',
  'fulfillment_status:preparing': 'Em preparo',
  'fulfillment_status:checking': 'Conferência do pedido',
  'fulfillment_status:ready': 'Pedido pronto',
  'fulfillment_status:picked_up': 'Pedido retirado',
  'fulfillment_status:not_picked_up': 'Pedido não retirado',
  'fulfillment_status:cancelled': 'Pedido cancelado',
};

export function describeQuickEvent(event: { field: string; toValue: string; reason: string | null }): string {
  const label = EVENT_LABELS[`${event.field}:${event.toValue}`] ?? event.toValue;
  // O motivo de uma troca de status vale para o pedido, não para o pagamento: um cancelamento muda
  // os dois campos com o mesmo motivo, e o cliente leria a mesma frase duas vezes.
  return event.reason && event.field === 'fulfillment_status' ? `${label} · ${event.reason}` : label;
}

// ---------------------------------------------------------------------------
// Histórico de pedidos (lista)
// ---------------------------------------------------------------------------

export type OrdersListFilter = 'active' | 'completed' | 'cancelled';

/**
 * Em qual aba da lista o pedido Quick aparece. O status legado do pedido marca
 * "entregue" na retirada, o que prenderia o pedido em "Em andamento" para sempre:
 * no Quick vale o cumprimento (ADR-013 §2.2).
 */
export function quickOrdersFilter(order: { fulfillmentStatus: string }): OrdersListFilter {
  if (order.fulfillmentStatus === 'picked_up' || order.fulfillmentStatus === 'not_picked_up') return 'completed';
  if (order.fulfillmentStatus === 'cancelled') return 'cancelled';
  return 'active';
}

export function quickOrderStatusLabel(order: { paymentStatus: string; fulfillmentStatus: string }): { label: string; tone: 'ok' | 'warn' | 'off' | 'bad' } {
  const step = quickTrackingStep(order);
  if (step.terminal === 'not_picked_up') return { label: 'Não retirado', tone: 'off' };
  if (step.terminal === 'refunded') return { label: 'Estornado', tone: 'bad' };
  if (step.terminal === 'cancelled') return { label: 'Cancelado', tone: 'bad' };
  if (step.awaitingPayment) return { label: 'Aguardando pagamento', tone: 'warn' };
  const label = QUICK_TRACKING_STEPS[step.stepIndex]?.label ?? 'Recebido';
  return { label, tone: step.stepIndex >= 3 ? 'ok' : 'warn' };
}

/** "Pedir novamente" só em pedido que já terminou. */
export function canReorderQuickOrder(order: { fulfillmentStatus: string }): boolean {
  return quickOrdersFilter(order) !== 'active';
}

/** Linha de status do restaurante na lista: "Aceitando pedidos · ~12 min". */
export function quickListLine(status: {
  state: string; closesAt: string | null; acceptsUntilMinutes: number | null; estimatedPrepMinutes: number;
} | undefined): { text: string; tone: 'ok' | 'warn' | 'off' } | null {
  if (!status) return null;
  const state = quickStateLabel(status.state, null, status.acceptsUntilMinutes);
  const prep = status.state === 'open' && status.estimatedPrepMinutes > 0 ? ` · ~${status.estimatedPrepMinutes} min` : '';
  return { text: `${state.label}${prep}`, tone: state.tone };
}
