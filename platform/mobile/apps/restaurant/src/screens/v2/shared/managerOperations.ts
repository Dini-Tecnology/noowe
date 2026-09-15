import type { TabOrder } from './v2Types';

export type ManagerOrderFilter = 'all' | 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered';

export function filterManagerOrders(orders: TabOrder[], filter: ManagerOrderFilter): TabOrder[] {
  if (filter === 'all') return orders;
  if (filter === 'preparing') {
    return orders.filter((order) => order.rawStatus === 'preparing' || order.rawStatus === 'open_for_additions');
  }
  return orders.filter((order) => order.rawStatus === filter);
}

export const MANAGER_CASH_MOVEMENT_TYPES = {
  withdrawal: 'sangria',
  reinforcement: 'reforco',
} as const;
