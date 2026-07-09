import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ApiService from '@okinawa/shared/services/api';
import { getSupabaseClient } from '@okinawa/shared/services/supabase';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { useRestaurantRole } from '../../../contexts/RestaurantRoleContext';
import type { KdsOrder, KdsStatus, OrderStatus, TabOrder } from './v2Types';

type AsyncState<T> = {
  data: T;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

type RawOrderItem = {
  id?: string;
  name?: string;
  quantity?: number;
  total_price?: number | string | null;
  unit_price?: number | string | null;
  status?: string;
  expected_ready_at?: string | null;
  special_instructions?: string | null;
};

type RawOrder = {
  id: string;
  table_number?: string | number | null;
  table_id?: string | null;
  status?: string;
  total_amount?: number | string | null;
  subtotal?: number | string | null;
  tip_amount?: number | string | null;
  created_at?: string;
  updated_at?: string;
  customer?: {
    full_name?: string | null;
    email?: string | null;
  } | null;
  customer_name?: string | null;
  special_instructions?: string | null;
  order_items?: RawOrderItem[];
};

type RawKdsItem = {
  id: string;
  order_id: string;
  table_number?: string | number | null;
  customer_name?: string | null;
  name?: string | null;
  quantity?: number;
  status?: string;
  order_status?: string;
  expected_ready_at?: string | null;
  created_at?: string;
  order_created_at?: string;
  special_instructions?: string | null;
};

type RawTable = {
  id: string;
  table_number?: string | number | null;
  seats?: number | string | null;
  status?: string | null;
  section?: string | null;
  qr_code?: string | null;
  active_session?: {
    guest_count?: number | string | null;
    started_at?: string | null;
  } | null;
};

export type V2Table = {
  id: string;
  label: string;
  status: 'available' | 'occupied' | 'reserved' | 'cleaning' | 'payment' | 'blocked';
  guests: number;
  time: string;
  section: string;
  hasQR: boolean;
};

export type DashboardSnapshot = {
  restaurant_id?: string;
  generated_at?: string;
  orders_today: number;
  active_orders: number;
  revenue_today: number;
  tables: {
    total: number;
    occupied: number;
    available: number;
    reserved: number;
    cleaning: number;
  };
  open_calls: number;
  kds_queue: number;
};

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function elapsedLabel(value?: string | null): string {
  if (!value) return '';
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return '';

  const diffMinutes = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (diffMinutes < 1) return 'agora';
  if (diffMinutes < 60) return `${diffMinutes}min`;
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  return minutes ? `${hours}h ${minutes}min` : `${hours}h`;
}

function clockLabel(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function mapOrderStatus(status?: string): OrderStatus {
  if (status === 'ready') return 'ready';
  if (status === 'preparing' || status === 'open_for_additions') return 'preparing';
  return 'new';
}

function mapKdsStatus(status?: string, orderStatus?: string): KdsStatus {
  if (status === 'ready' || orderStatus === 'ready') return 'ready';
  if (status === 'preparing' || orderStatus === 'preparing') return 'preparing';
  return 'queue';
}

function itemLabel(item: RawOrderItem | RawKdsItem): string {
  const quantity = toNumber(item.quantity, 1);
  return `${quantity}x ${item.name || 'Item'}`;
}

export function shortOrderId(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

export function mapOrderToTabOrder(raw: RawOrder): TabOrder {
  const items = Array.isArray(raw.order_items) ? raw.order_items : [];
  const itemTotal = items.reduce((sum, item) => sum + toNumber(item.total_price), 0);
  const total = toNumber(raw.total_amount, toNumber(raw.subtotal, itemTotal));

  return {
    id: raw.id,
    table: raw.table_number ? `Mesa ${raw.table_number}` : raw.table_id ? 'Mesa vinculada' : 'Sem mesa',
    items: items.length ? items.map(itemLabel) : ['Pedido sem itens vinculados'],
    total,
    time: clockLabel(raw.created_at) || elapsedLabel(raw.created_at),
    status: mapOrderStatus(raw.status),
    customerName: raw.customer?.full_name || raw.customer_name || raw.customer?.email || undefined,
    notes: raw.special_instructions || undefined,
    createdAt: raw.created_at,
  };
}

export function mapKdsRowsToOrders(rows: RawKdsItem[]): KdsOrder[] {
  const grouped = new Map<string, KdsOrder>();

  for (const row of rows) {
    const existing = grouped.get(row.order_id);
    const item: [string, string] = [
      itemLabel(row),
      row.expected_ready_at ? clockLabel(row.expected_ready_at) : elapsedLabel(row.created_at),
    ];

    if (existing) {
      existing.items.push(item);
      if (existing.status === 'queue') existing.status = mapKdsStatus(row.status, row.order_status);
      continue;
    }

    grouped.set(row.order_id, {
      id: row.order_id,
      table: row.table_number ? `Mesa ${row.table_number}` : 'Sem mesa',
      meta: `${elapsedLabel(row.order_created_at || row.created_at)} na fila`,
      status: mapKdsStatus(row.status, row.order_status),
      items: [item],
      time: clockLabel(row.order_created_at || row.created_at),
      customerName: row.customer_name || undefined,
    });
  }

  return Array.from(grouped.values());
}

export function mapTable(raw: RawTable): V2Table {
  const status = (raw.status || 'available') as V2Table['status'];
  return {
    id: raw.id,
    label: String(raw.table_number || raw.id.slice(0, 4)),
    status,
    guests: toNumber(raw.active_session?.guest_count, 0),
    time: elapsedLabel(raw.active_session?.started_at),
    section: raw.section || 'Salao',
    hasQR: Boolean(raw.qr_code),
  };
}

function useRealtimeRefresh(table: string, restaurantId: string | null, refresh: () => void) {
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  useEffect(() => {
    if (!restaurantId) return;
    const supabase = getSupabaseClient();
    // React Native fast refresh / remounts can leave a subscribed channel with
    // the same topic briefly alive. Supabase forbids adding postgres_changes
    // callbacks to an already subscribed topic, so each effect owns a unique one.
    const channelName = `rt_${table}_${restaurantId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes' as any, {
        event: '*',
        schema: 'public',
        table,
        filter: `restaurant_id=eq.${restaurantId}`,
      }, () => { void refreshRef.current(); })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [table, restaurantId]);
}

export function useRestaurantOrders(): AsyncState<TabOrder[]> {
  const [data, setData] = useState<TabOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { restaurantId } = useRestaurantRole();

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const raw = await ApiService.getRestaurantOrders({
        status: 'pending,confirmed,preparing,open_for_additions,ready',
      });
      setData((Array.isArray(raw) ? raw : []).map(mapOrderToTabOrder));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar pedidos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useRealtimeRefresh('orders', restaurantId, refresh);

  return { data, loading, error, refresh };
}

export function useKdsOrders(): AsyncState<KdsOrder[]> {
  const [data, setData] = useState<KdsOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { restaurantId } = useRestaurantRole();

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const raw = await ApiService.getKitchenOrders();
      setData(mapKdsRowsToOrders(Array.isArray(raw) ? raw : []));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar KDS');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  // order_items don't carry restaurant_id directly; subscribe to orders channel
  // and re-fetch when any order changes (covers item status updates too)
  useRealtimeRefresh('orders', restaurantId, refresh);

  return { data, loading, error, refresh };
}

export function useRestaurantTables(): AsyncState<V2Table[]> {
  const [data, setData] = useState<V2Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { restaurantId } = useRestaurantRole();

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const raw = await ApiService.getTables();
      setData((Array.isArray(raw) ? raw : []).map(mapTable));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar mesas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useRealtimeRefresh('tables', restaurantId, refresh);

  return { data, loading, error, refresh };
}

export type WaitlistEntry = {
  id: string;
  customerName: string;
  partySize: number;
  status: string;
  estimatedWaitMinutes: number | null;
};

function mapWaitlistEntry(raw: any): WaitlistEntry {
  return {
    id: raw.id,
    customerName: raw.customer_name || raw.customer?.full_name || 'Cliente',
    partySize: toNumber(raw.party_size, 1),
    status: raw.status || 'waiting',
    estimatedWaitMinutes: raw.estimated_wait_minutes ?? null,
  };
}

export function useWaitlist(): AsyncState<WaitlistEntry[]> {
  const [data, setData] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { restaurantId } = useRestaurantRole();

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const raw = await supabaseApiAdapter.getWaitlist();
      setData((Array.isArray(raw) ? raw : []).map(mapWaitlistEntry));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar fila de espera');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useRealtimeRefresh('waitlist_entries', restaurantId, refresh);

  return { data, loading, error, refresh };
}

export type TableBill = {
  orderId: string;
  tableNumber: string;
  totalAmount: number;
  paymentMethod: string | null;
  isPaid: boolean;
  status: string;
};

function mapTableBill(raw: any): TableBill {
  return {
    orderId: raw.order_id,
    tableNumber: String(raw.table_number ?? '?'),
    totalAmount: toNumber(raw.total_amount, 0),
    paymentMethod: raw.payment_method ?? null,
    isPaid: Boolean(raw.is_paid),
    status: raw.status || 'pending',
  };
}

export function useTableBills(): AsyncState<TableBill[]> {
  const [data, setData] = useState<TableBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { restaurantId } = useRestaurantRole();

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const raw = await supabaseApiAdapter.getTableBills();
      setData((Array.isArray(raw) ? raw : []).map(mapTableBill));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar pagamentos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useRealtimeRefresh('orders', restaurantId, refresh);

  return { data, loading, error, refresh };
}

export function useDashboardSnapshot(): AsyncState<DashboardSnapshot | null> {
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const raw = await ApiService.getDashboardSnapshot();
      setData({
        restaurant_id: raw?.restaurant_id,
        generated_at: raw?.generated_at,
        orders_today: toNumber(raw?.orders_today),
        active_orders: toNumber(raw?.active_orders),
        revenue_today: toNumber(raw?.revenue_today),
        tables: {
          total: toNumber(raw?.tables?.total),
          occupied: toNumber(raw?.tables?.occupied),
          available: toNumber(raw?.tables?.available),
          reserved: toNumber(raw?.tables?.reserved),
          cleaning: toNumber(raw?.tables?.cleaning),
        },
        open_calls: toNumber(raw?.open_calls),
        kds_queue: toNumber(raw?.kds_queue),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}

export function useFilteredOrders(orders: TabOrder[], activeTab: 'all' | OrderStatus) {
  return useMemo(() => {
    if (activeTab === 'all') return orders;
    return orders.filter((order) => order.status === activeTab);
  }, [orders, activeTab]);
}
