import type { QuickPanelOrder } from '@okinawa/shared/services/supabase-api';
import {
  buildPolicyPatch, draftFromSettings,
  QUICK_PANEL_TABS, formatClock, groupQuickOrders, normalizePickupCode, orderActions, parsePickupScan, secondsUntil,
} from '../screens/v2/quick-service/quick-panel';

const order = (overrides: Partial<QuickPanelOrder>): QuickPanelOrder => ({
  id: 'o', shortRef: 'ABCD', callName: 'Ana', consumptionMode: 'takeaway', paymentStatus: 'confirmed',
  fulfillmentStatus: 'accepted', totalCents: 4000, refundedCents: 0, createdAt: '', paidAt: null, acceptedAt: '2026-10-01T12:00:00Z',
  pickupSlotStart: null, pickupExpiresAt: null, pickedUpAt: null, recallCount: 0, acceptDeadline: null, tab: 'new', items: [],
  ...overrides,
});

describe('painel Quick Service', () => {
  it('tem as seis abas pedidas pelo cliente', () => {
    expect(QUICK_PANEL_TABS.map((tab) => tab.label)).toEqual([
      'Novos', 'Em preparo', 'Aguardando retirada', 'Retirados', 'Não retirados', 'Agendados',
    ]);
  });

  it('agrupa pelos nomes de aba que o servidor devolve', () => {
    const groups = groupQuickOrders([
      order({ id: '1', tab: 'new' }), order({ id: '2', tab: 'awaiting_pickup' }),
      order({ id: '3', tab: 'awaiting_pickup' }), order({ id: '4', tab: null }),
    ]);
    expect(groups.new.map((o) => o.id)).toEqual(['1']);
    expect(groups.awaiting_pickup).toHaveLength(2);
    expect(Object.values(groups).flat().map((o) => o.id)).not.toContain('4');
  });
});

describe('retirada por QR ou código', () => {
  const id = '0b6f4c7e-1111-4222-8333-444455556666';

  it('lê o QR do cliente (pedido + código)', () => {
    expect(parsePickupScan(`noowe://pickup/${id}/k7m2pq`)).toEqual({ orderId: id, code: 'K7M2PQ' });
  });

  it('recusa qualquer outro QR — mesa, balcão ou lixo nunca confirmam retirada', () => {
    expect(parsePickupScan('noowe://counter/abc123')).toBeNull();
    expect(parsePickupScan(`noowe://table/${id}`)).toBeNull();
    expect(parsePickupScan(`noowe://pickup/${id}`)).toBeNull();
    expect(parsePickupScan('https://exemplo.com')).toBeNull();
  });

  it('normaliza o código digitado', () => {
    expect(normalizePickupCode(' k7m-2pq ')).toBe('K7M2PQ');
  });
});

describe('ações por pedido', () => {
  it('pedido aguardando aceite pode ser aceito ou recusado', () => {
    const actions = orderActions(order({ fulfillmentStatus: 'received', acceptedAt: null, tab: 'new' }));
    expect(actions).toMatchObject({ accept: true, cancel: true, confirmPickup: false });
  });

  it('conferência pode ser aprovada ou reprovada', () => {
    expect(orderActions(order({ fulfillmentStatus: 'checking', tab: 'preparing' }))).toMatchObject({
      approveCheck: true, reproveCheck: true, accept: false,
    });
  });

  it('pronto: chamar de novo e confirmar retirada', () => {
    expect(orderActions(order({ fulfillmentStatus: 'ready', tab: 'awaiting_pickup' }))).toMatchObject({
      recall: true, confirmPickup: true, cancel: false,
    });
  });

  it('retirado não tem ação', () => {
    const actions = orderActions(order({ fulfillmentStatus: 'picked_up', tab: 'picked_up' }));
    expect(Object.values(actions).some(Boolean)).toBe(false);
  });
});

describe('cronômetro', () => {
  it('conta até o prazo e nunca fica negativo', () => {
    const now = Date.parse('2026-10-01T12:00:00Z');
    expect(secondsUntil('2026-10-01T12:05:30Z', now)).toBe(330);
    expect(secondsUntil('2026-10-01T11:00:00Z', now)).toBe(0);
    expect(secondsUntil(null, now)).toBeNull();
    expect(formatClock(330)).toBe('05:30');
  });
});

describe('configuração do Quick Service', () => {
  const settings = {
    ordersPaused: false, acceptMode: 'auto' as const, acceptTimeoutMin: 5, pickupExpiryMin: 30, noPickupPolicy: 'none' as const,
    defaultPrepMin: 10, closeOrdersBeforeMin: 15, pixExpiryMin: 15, distanceWarningKm: 2, pickupCapacityPerSlot: null,
    pickupLocation: null,
  };

  it('sem mudança não há patch', () => {
    expect(buildPolicyPatch(settings, draftFromSettings(settings))).toEqual({ patch: {}, error: null });
  });

  it('envia só o que mudou, já como número', () => {
    const draft = { ...draftFromSettings(settings), pickupExpiryMin: '45', acceptMode: 'manual' as const, pickupLocation: ' Balcão 3 ', distanceWarningKm: '3,5', pickupCapacityPerSlot: '8' };
    expect(buildPolicyPatch(settings, draft)).toEqual({
      patch: { pickupExpiryMin: 45, acceptMode: 'manual', pickupLocation: 'Balcão 3', distanceWarningKm: 3.5, pickupCapacityPerSlot: 8 },
      error: null,
    });
  });

  it('limpar o local ou a capacidade manda null', () => {
    const base = { ...settings, pickupLocation: 'Balcão 1', pickupCapacityPerSlot: 5 };
    const draft = { ...draftFromSettings(base), pickupLocation: '', pickupCapacityPerSlot: '' };
    expect(buildPolicyPatch(base, draft).patch).toEqual({ pickupLocation: null, pickupCapacityPerSlot: null });
  });

  it('número inválido vira erro de formulário e não vai ao servidor', () => {
    const draft = { ...draftFromSettings(settings), pickupExpiryMin: 'trinta' };
    expect(buildPolicyPatch(settings, draft).error).toContain('Tolerância de retirada');
  });

  it('não repete a faixa 15–60: o servidor valida', () => {
    const draft = { ...draftFromSettings(settings), pickupExpiryMin: '5' };
    expect(buildPolicyPatch(settings, draft)).toEqual({ patch: { pickupExpiryMin: 5 }, error: null });
  });
});
