import { orderIdFromPush } from '../services/push-routing';

describe('push → pedido', () => {
  it('lembrete local de retirada', () => {
    expect(orderIdFromPush({ type: 'quick_pickup_reminder', orderId: 'o1' })).toBe('o1');
  });

  it('notificação do servidor: orderId do metadata achatado ou relatedId', () => {
    expect(orderIdFromPush({ type: 'order_ready', orderId: 'o2', relatedId: 'o2', relatedType: 'order' })).toBe('o2');
    expect(orderIdFromPush({ type: 'order_ready', relatedId: 'o3', relatedType: 'order' })).toBe('o3');
  });

  it('não confunde outros pushes com pedido', () => {
    expect(orderIdFromPush({ type: 'table_invite', relatedId: 'x', relatedType: 'table_session' })).toBeNull();
    expect(orderIdFromPush(null)).toBeNull();
    expect(orderIdFromPush({})).toBeNull();
  });
});
