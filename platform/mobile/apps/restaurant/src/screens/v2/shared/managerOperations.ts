import type { TabOrder } from './v2Types';

export type ManagerOrderFilter = 'all' | 'pending' | 'confirmed' | 'preparing';

export function filterManagerOrders(orders: TabOrder[], filter: ManagerOrderFilter): TabOrder[] {
  if (filter === 'all') return orders;
  if (filter === 'confirmed') {
    return orders.filter((order) => order.rawStatus === 'confirmed' || order.rawStatus === 'open_for_additions');
  }
  return orders.filter((order) => order.rawStatus === filter);
}

export const MANAGER_CASH_MOVEMENT_TYPES = {
  withdrawal: 'sangria',
  reinforcement: 'reforco',
} as const;
