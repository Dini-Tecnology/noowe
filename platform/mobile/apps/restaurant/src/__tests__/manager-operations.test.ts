import { filterManagerOrders, MANAGER_CASH_MOVEMENT_TYPES } from '../screens/v2/shared/managerOperations';
import type { TabOrder } from '../screens/v2/shared/v2Types';

function order(id: string, rawStatus: string): TabOrder {
  return {
    id,
    table: 'Mesa 1',
    items: [],
    total: 0,
    time: '10:00',
    status: rawStatus === 'preparing' ? 'preparing' : 'new',
    rawStatus,
  };
}

describe('operações do gerente', () => {
  const orders = [
    order('pending', 'pending'),
    order('confirmed', 'confirmed'),
    order('open', 'open_for_additions'),
    order('preparing', 'preparing'),
    order('ready', 'ready'),
    order('delivered', 'delivered'),
  ];

  it('filtra os status reais usados pelos tabs de pedidos', () => {
    expect(filterManagerOrders(orders, 'pending').map(({ id }) => id)).toEqual(['pending']);
    expect(filterManagerOrders(orders, 'confirmed').map(({ id }) => id)).toEqual(['confirmed']);
    expect(filterManagerOrders(orders, 'preparing').map(({ id }) => id)).toEqual(['open', 'preparing']);
    expect(filterManagerOrders(orders, 'ready').map(({ id }) => id)).toEqual(['ready']);
    expect(filterManagerOrders(orders, 'delivered').map(({ id }) => id)).toEqual(['delivered']);
  });

  it('envia os tipos de movimentação aceitos pelo RPC de caixa', () => {
    expect(MANAGER_CASH_MOVEMENT_TYPES.withdrawal).toBe('sangria');
    expect(MANAGER_CASH_MOVEMENT_TYPES.reinforcement).toBe('reforco');
  });
});
