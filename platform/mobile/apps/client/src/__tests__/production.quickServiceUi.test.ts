import {
  buildReorder, isActiveQuickOrder, quickJourneyKeys,
  canCustomerCancelQuickOrder, describeQuickEvent, formatCountdown, pickupPolicyText, pickupQrPayload, quickStateLabel,
  quickTrackingStep, remainingSeconds, QUICK_TRACKING_STEPS,
} from '../screens/production/quick-service-ui';
import { duplicateOrderId, quickOrderErrorKind } from '../services/quick-service-errors';

describe('quickTrackingStep — etapas do cliente (ADR-013 §2.2)', () => {
  const step = (paymentStatus: string, fulfillmentStatus: string) => quickTrackingStep({ paymentStatus, fulfillmentStatus });

  it('tem as cinco etapas pedidas pelo cliente, na ordem', () => {
    expect(QUICK_TRACKING_STEPS.map((s) => s.label)).toEqual(['Pago', 'Aceito', 'Em preparo', 'Pronto', 'Retirado']);
  });

  it.each([
    ['confirmed', 'received', 0],
    ['confirmed', 'accepted', 1],
    ['confirmed', 'preparing', 2],
    ['confirmed', 'checking', 2], // conferência do KDS aparece como "Em preparo"
    ['confirmed', 'ready', 3],
    ['confirmed', 'picked_up', 4],
  ])('pagamento %s + cumprimento %s → etapa %i', (payment, fulfillment, index) => {
    expect(step(payment, fulfillment)).toEqual({ stepIndex: index, awaitingPayment: false, terminal: null });
  });

  it('antes do pagamento confirmado não há etapa: o pedido aguarda o pagamento', () => {
    expect(step('pending', 'received')).toEqual({ stepIndex: -1, awaitingPayment: true, terminal: null });
  });

  it('estados terminais não são etapas', () => {
    expect(step('confirmed', 'not_picked_up').terminal).toBe('not_picked_up');
    expect(step('refunded', 'cancelled').terminal).toBe('refunded');
    expect(step('failed', 'cancelled').terminal).toBe('cancelled');
  });
});

describe('cancelamento pelo cliente', () => {
  it('só até o início do preparo', () => {
    expect(canCustomerCancelQuickOrder({ fulfillmentStatus: 'received', paymentStatus: 'pending' })).toBe(true);
    expect(canCustomerCancelQuickOrder({ fulfillmentStatus: 'accepted', paymentStatus: 'confirmed' })).toBe(true);
    expect(canCustomerCancelQuickOrder({ fulfillmentStatus: 'preparing', paymentStatus: 'confirmed' })).toBe(false);
    expect(canCustomerCancelQuickOrder({ fulfillmentStatus: 'ready', paymentStatus: 'confirmed' })).toBe(false);
    expect(canCustomerCancelQuickOrder({ fulfillmentStatus: 'cancelled', paymentStatus: 'refunded' })).toBe(false);
  });
});

describe('código de retirada e prazos', () => {
  it('o QR carrega o pedido e o código', () => {
    expect(pickupQrPayload('abc', 'K7M2PQ')).toBe('noowe://pickup/abc/K7M2PQ');
  });

  it('o cronômetro nunca fica negativo', () => {
    const now = Date.parse('2026-10-01T12:00:00Z');
    expect(remainingSeconds('2026-10-01T12:05:30Z', now)).toBe(330);
    expect(remainingSeconds('2026-10-01T11:00:00Z', now)).toBe(0);
    expect(remainingSeconds(null, now)).toBeNull();
    expect(formatCountdown(330)).toBe('05:30');
  });
});

describe('política de retirada mostrada no checkout', () => {
  it('usa a tolerância e a política do restaurante, não literais', () => {
    expect(pickupPolicyText({ pickupExpiryMin: 45, noPickupPolicy: 'none' })).toContain('45 minutos');
    expect(pickupPolicyText({ pickupExpiryMin: 45, noPickupPolicy: 'none' })).toContain('não há reembolso');
    expect(pickupPolicyText({ pickupExpiryMin: 20, noPickupPolicy: 'store_credit' })).toContain('crédito');
  });
});

describe('estado de recebimento de pedidos', () => {
  it('traduz o estado do servidor', () => {
    expect(quickStateLabel('open', '22:00', 180)).toEqual({ label: 'Aceitando pedidos · até 22:00', tone: 'ok' });
    expect(quickStateLabel('open', '22:00', 20).tone).toBe('warn');
    expect(quickStateLabel('paused', null, null).label).toBe('Pedidos pausados');
    expect(quickStateLabel('closed', null, null).tone).toBe('off');
  });
});

describe('erros do pedido Quick', () => {
  it('traduz SQLSTATE em categoria', () => {
    expect(quickOrderErrorKind({ code: 'P0005' })).toBe('duplicate');
    expect(quickOrderErrorKind({ code: 'P0006' })).toBe('paused');
    expect(quickOrderErrorKind({ code: 'P0007' })).toBe('closed');
    expect(quickOrderErrorKind({ code: '23505' })).toBeNull();
    expect(quickOrderErrorKind(new Error('x'))).toBeNull();
  });

  it('extrai o pedido existente do erro de duplicado', () => {
    const id = '0b6f4c7e-1111-4222-8333-444455556666';
    expect(duplicateOrderId({ code: 'P0005', details: id })).toBe(id);
    expect(duplicateOrderId({ code: 'P0005', details: 'lixo' })).toBeNull();
    expect(duplicateOrderId({ code: 'P0006', details: id })).toBeNull();
  });
});

describe('ações da página do restaurante Quick Service', () => {
  const base = { orderAhead: true, pickupSlots: true, hasActiveOrder: false, hasPastOrder: false };

  it('sem a capability orderAhead não há ação — a decisão não depende do modelo', () => {
    expect(quickJourneyKeys({ ...base, orderAhead: false })).toEqual([]);
  });

  it('"Fazer pedido" vem primeiro; "Agendar retirada" só com slots', () => {
    expect(quickJourneyKeys(base)).toEqual(['order', 'schedule']);
    expect(quickJourneyKeys({ ...base, pickupSlots: false })).toEqual(['order']);
  });

  it('com pedido em andamento mostra "Meus pedidos"; só com histórico, "Pedir novamente"', () => {
    expect(quickJourneyKeys({ ...base, hasActiveOrder: true, hasPastOrder: true })).toEqual(['order', 'schedule', 'my_orders']);
    expect(quickJourneyKeys({ ...base, hasPastOrder: true })).toEqual(['order', 'schedule', 'reorder']);
  });

  it('pedido em andamento exclui terminais e pagamento falho', () => {
    expect(isActiveQuickOrder({ fulfillmentStatus: 'preparing', paymentStatus: 'confirmed' })).toBe(true);
    expect(isActiveQuickOrder({ fulfillmentStatus: 'received', paymentStatus: 'pending' })).toBe(true);
    expect(isActiveQuickOrder({ fulfillmentStatus: 'picked_up', paymentStatus: 'confirmed' })).toBe(false);
    expect(isActiveQuickOrder({ fulfillmentStatus: 'cancelled', paymentStatus: 'refunded' })).toBe(false);
    expect(isActiveQuickOrder({ fulfillmentStatus: 'received', paymentStatus: 'failed' })).toBe(false);
  });
});

describe('Pedir novamente', () => {
  const menu = [
    { id: 'a', name: 'Burger', price: 32.9, imageUrl: null, preparationTime: 8 },
    { id: 'b', name: 'Batata', price: 14, imageUrl: 'x.png', preparationTime: null },
  ];

  it('usa o preço atual do cardápio e mantém a quantidade', () => {
    const { cartItems, unavailable } = buildReorder(
      [{ menuItemId: 'a', quantity: 2, name: 'Burger', specialInstructions: 'sem cebola' }], menu);
    expect(unavailable).toEqual([]);
    expect(cartItems).toEqual([expect.objectContaining({
      menu_item_id: 'a', price: 32.9, quantity: 2, special_instructions: 'sem cebola', preparation_time: 8,
    })]);
  });

  it('avisa os itens que saíram do cardápio em vez de descartá-los em silêncio', () => {
    const { cartItems, unavailable } = buildReorder([
      { menuItemId: 'a', quantity: 1, name: 'Burger', specialInstructions: null },
      { menuItemId: 'zz', quantity: 1, name: 'Milkshake', specialInstructions: null },
    ], menu);
    expect(cartItems).toHaveLength(1);
    expect(unavailable).toEqual(['Milkshake']);
  });
});

describe('aviso de distância', () => {
  const { isFarFromRestaurant, formatDistance } = jest.requireActual('../screens/production/quick-service-ui');
  it('só avisa acima do limite configurado e nunca sem dados', () => {
    expect(isFarFromRestaurant(3.2, 2)).toBe(true);
    expect(isFarFromRestaurant(1.2, 2)).toBe(false);
    expect(isFarFromRestaurant(null, 2)).toBe(false);
    expect(isFarFromRestaurant(5, null)).toBe(false);
  });
  it('formata metros e quilômetros', () => {
    expect(formatDistance(0.45)).toBe('450 m');
    expect(formatDistance(3.24)).toBe('3,2 km');
  });
});

describe('desconto de combo vem da política', () => {
  const { comboDiscountAmount, cartComboDiscount } = jest.requireActual('../screens/production/quick-service-ui');
  it('calcula em centavos a partir dos basis points', () => {
    expect(comboDiscountAmount(50, 2000)).toBe(10);
    expect(comboDiscountAmount(33.33, 1500)).toBe(5);
    expect(comboDiscountAmount(40, 0)).toBe(0);
    expect(comboDiscountAmount(40, null)).toBe(0); // sem política não há desconto
  });
  it('o carrinho soma o desconto explícito de cada combo', () => {
    expect(cartComboDiscount([
      { price: 40, quantity: 2, combo: { listPrice: 50 } },
      { price: 12, quantity: 1 },
    ])).toBe(20);
  });
});

describe('horários de retirada agendada', () => {
  const { pickupSlotOptions } = jest.requireActual('../screens/production/quick-service-ui');
  it('alinha à grade e dá quatro janelas consecutivas', () => {
    const slots: string[] = pickupSlotOptions(new Date('2026-10-01T12:07:30Z'));
    expect(slots).toHaveLength(4);
    const minutes = slots.map((slot) => new Date(slot).getUTCMinutes());
    expect(minutes.every((minute) => minute % 15 === 0)).toBe(true);
    expect(Date.parse(slots[0])).toBeGreaterThan(Date.parse('2026-10-01T12:07:30Z'));
    expect(Date.parse(slots[1]) - Date.parse(slots[0])).toBe(15 * 60_000);
  });
});

describe('histórico de pedidos Quick', () => {
  const { quickOrdersFilter, quickOrderStatusLabel, canReorderQuickOrder } = jest.requireActual('../screens/production/quick-service-ui');

  it('pedido retirado vai para "Concluídos" — o status legado "entregue" não o prende em andamento', () => {
    expect(quickOrdersFilter({ fulfillmentStatus: 'picked_up' })).toBe('completed');
    expect(quickOrdersFilter({ fulfillmentStatus: 'not_picked_up' })).toBe('completed');
    expect(quickOrdersFilter({ fulfillmentStatus: 'cancelled' })).toBe('cancelled');
    expect(quickOrdersFilter({ fulfillmentStatus: 'ready' })).toBe('active');
  });

  it('o rótulo segue as etapas do cliente', () => {
    expect(quickOrderStatusLabel({ paymentStatus: 'confirmed', fulfillmentStatus: 'accepted' }).label).toBe('Aceito');
    expect(quickOrderStatusLabel({ paymentStatus: 'confirmed', fulfillmentStatus: 'checking' }).label).toBe('Em preparo');
    expect(quickOrderStatusLabel({ paymentStatus: 'pending', fulfillmentStatus: 'received' }).label).toBe('Aguardando pagamento');
    expect(quickOrderStatusLabel({ paymentStatus: 'refunded', fulfillmentStatus: 'cancelled' }).label).toBe('Estornado');
    expect(quickOrderStatusLabel({ paymentStatus: 'confirmed', fulfillmentStatus: 'not_picked_up' }).label).toBe('Não retirado');
  });

  it('só reordena pedido que já terminou', () => {
    expect(canReorderQuickOrder({ fulfillmentStatus: 'picked_up' })).toBe(true);
    expect(canReorderQuickOrder({ fulfillmentStatus: 'preparing' })).toBe(false);
  });
});

describe('histórico de status do pedido', () => {
  it('mostra o motivo só no evento de cumprimento, para não repetir a frase', () => {
    const reason = 'Pix expirado sem pagamento';
    expect(describeQuickEvent({ field: 'payment_status', toValue: 'failed', reason })).not.toContain(reason);
    expect(describeQuickEvent({ field: 'fulfillment_status', toValue: 'cancelled', reason })).toContain(reason);
  });

  it('sem motivo devolve só o rótulo', () => {
    expect(describeQuickEvent({ field: 'fulfillment_status', toValue: 'accepted', reason: null })).toBe('Pedido aceito');
  });
});
