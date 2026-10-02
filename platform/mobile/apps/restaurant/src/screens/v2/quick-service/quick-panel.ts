import type { QuickPanelOrder, QuickPanelSettings, QuickPanelTab, QuickPolicyPatch } from '@okinawa/shared/services/supabase-api';

/** Abas do painel Quick Service, na ordem em que o balcão trabalha (ADR-013). */
export const QUICK_PANEL_TABS: { key: QuickPanelTab; label: string }[] = [
  { key: 'new', label: 'Novos' },
  { key: 'preparing', label: 'Em preparo' },
  { key: 'awaiting_pickup', label: 'Aguardando retirada' },
  { key: 'picked_up', label: 'Retirados' },
  { key: 'not_picked_up', label: 'Não retirados' },
  { key: 'scheduled', label: 'Agendados' },
];

export function groupQuickOrders(orders: QuickPanelOrder[]): Record<QuickPanelTab, QuickPanelOrder[]> {
  const groups: Record<QuickPanelTab, QuickPanelOrder[]> = {
    new: [], preparing: [], awaiting_pickup: [], picked_up: [], not_picked_up: [], scheduled: [],
  };
  for (const order of orders) {
    if (order.tab && order.tab in groups) groups[order.tab].push(order);
  }
  return groups;
}

/**
 * Conteúdo do QR de retirada do cliente: `noowe://pickup/<orderId>/<code>`.
 * Devolve null para qualquer outro QR (ex.: QR de mesa), que nunca deve confirmar retirada.
 */
export function parsePickupScan(data: string): { orderId: string; code: string } | null {
  const match = /^noowe:\/\/pickup\/([0-9a-f-]{36})\/([A-Za-z0-9]{4,12})$/i.exec(data.trim());
  return match ? { orderId: match[1].toLowerCase(), code: match[2].toUpperCase() } : null;
}

/** Código digitado: sem espaços ou hífens, em maiúsculas. */
export function normalizePickupCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export function secondsUntil(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const target = Date.parse(iso);
  return Number.isNaN(target) ? null : Math.max(0, Math.floor((target - now) / 1000));
}

export function formatClock(totalSeconds: number): string {
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

/** O que o balcão pode fazer com o pedido em cada aba. */
export function orderActions(order: Pick<QuickPanelOrder, 'tab' | 'fulfillmentStatus' | 'acceptedAt'>): {
  accept: boolean; cancel: boolean; approveCheck: boolean; reproveCheck: boolean; recall: boolean; confirmPickup: boolean; refundItems: boolean;
} {
  const awaitingAccept = order.fulfillmentStatus === 'received' && !order.acceptedAt;
  const checking = order.fulfillmentStatus === 'checking';
  return {
    accept: awaitingAccept,
    cancel: order.tab === 'new' || order.tab === 'scheduled' || order.tab === 'preparing',
    approveCheck: checking,
    reproveCheck: checking,
    recall: order.fulfillmentStatus === 'ready',
    confirmPickup: order.fulfillmentStatus === 'ready',
    refundItems: order.fulfillmentStatus === 'accepted' || order.fulfillmentStatus === 'preparing',
  };
}

/** Mensagens do servidor (SQLSTATE) em linguagem de balcão. */
export function quickPanelErrorMessage(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  const message = (error as { message?: unknown })?.message;
  if (code === '22023') return typeof message === 'string' && message ? message : 'Confira os dados informados.';
  if (code === '23514') {
    // As RPCs do Quick respondem em português ("Código inválido, expirado ou pedido não está pronto").
    if (typeof message === 'string' && /[áâãçéêíóôõú]/i.test(message)) return message;
    return 'Ação não permitida para este pedido agora. Atualize a lista e confira o código.';
  }
  if (code === '42501') return 'Você não tem permissão para esta ação.';
  return typeof message === 'string' && message ? message : 'Tente novamente.';
}

/** Rascunho do formulário de configuração: tudo texto, como o campo digitado. */
export type QuickPolicyDraft = {
  pickupLocation: string;
  defaultPrepMin: string;
  acceptMode: 'auto' | 'manual';
  acceptTimeoutMin: string;
  pickupExpiryMin: string;
  noPickupPolicy: 'none' | 'store_credit';
  closeOrdersBeforeMin: string;
  pixExpiryMin: string;
  distanceWarningKm: string;
  pickupCapacityPerSlot: string;
};

export function draftFromSettings(settings: QuickPanelSettings): QuickPolicyDraft {
  return {
    pickupLocation: settings.pickupLocation ?? '',
    defaultPrepMin: String(settings.defaultPrepMin),
    acceptMode: settings.acceptMode,
    acceptTimeoutMin: String(settings.acceptTimeoutMin),
    pickupExpiryMin: String(settings.pickupExpiryMin),
    noPickupPolicy: settings.noPickupPolicy,
    closeOrdersBeforeMin: String(settings.closeOrdersBeforeMin),
    pixExpiryMin: String(settings.pixExpiryMin),
    distanceWarningKm: String(settings.distanceWarningKm),
    pickupCapacityPerSlot: settings.pickupCapacityPerSlot == null ? '' : String(settings.pickupCapacityPerSlot),
  };
}

/**
 * Só o que mudou. Número inválido vira erro de formulário; as faixas (ex.: tolerância de 15 a 60 min)
 * são validadas pelo servidor, que devolve a mensagem — o app não repete a regra.
 */
export function buildPolicyPatch(
  settings: QuickPanelSettings,
  draft: QuickPolicyDraft,
): { patch: QuickPolicyPatch; error: string | null } {
  const patch: QuickPolicyPatch = {};
  const integer = (label: string, raw: string, current: number, key: 'defaultPrepMin' | 'acceptTimeoutMin' | 'pickupExpiryMin' | 'closeOrdersBeforeMin' | 'pixExpiryMin'): string | null => {
    const text = raw.trim();
    if (!/^\d+$/.test(text)) return `${label}: informe um número inteiro.`;
    if (Number(text) !== current) patch[key] = Number(text);
    return null;
  };
  const errors = [
    integer('Tempo de preparo', draft.defaultPrepMin, settings.defaultPrepMin, 'defaultPrepMin'),
    integer('Tempo para aceitar', draft.acceptTimeoutMin, settings.acceptTimeoutMin, 'acceptTimeoutMin'),
    integer('Tolerância de retirada', draft.pickupExpiryMin, settings.pickupExpiryMin, 'pickupExpiryMin'),
    integer('Encerrar pedidos antes do fechamento', draft.closeOrdersBeforeMin, settings.closeOrdersBeforeMin, 'closeOrdersBeforeMin'),
    integer('Expiração do Pix', draft.pixExpiryMin, settings.pixExpiryMin, 'pixExpiryMin'),
  ].filter(Boolean);

  const km = draft.distanceWarningKm.trim().replace(',', '.');
  if (!/^\d+(\.\d)?$/.test(km)) errors.push('Aviso de distância: informe km com no máximo uma casa decimal.');
  else if (Number(km) !== Number(settings.distanceWarningKm)) patch.distanceWarningKm = Number(km);

  const capacity = draft.pickupCapacityPerSlot.trim();
  if (capacity && !/^\d+$/.test(capacity)) errors.push('Capacidade por janela: informe um número inteiro ou deixe vazio.');
  else if ((capacity ? Number(capacity) : null) !== settings.pickupCapacityPerSlot) {
    patch.pickupCapacityPerSlot = capacity ? Number(capacity) : null;
  }

  if (draft.acceptMode !== settings.acceptMode) patch.acceptMode = draft.acceptMode;
  if (draft.noPickupPolicy !== settings.noPickupPolicy) patch.noPickupPolicy = draft.noPickupPolicy;
  const location = draft.pickupLocation.trim();
  if (location !== (settings.pickupLocation ?? '')) patch.pickupLocation = location || null;

  return { patch, error: errors[0] ?? null };
}
