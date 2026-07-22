import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ApiService from '@okinawa/shared/services/api';
import { getSupabaseClient } from '@okinawa/shared/services/supabase';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import type { CustomerAssistanceHub, RestaurantApproval } from '@okinawa/shared/services/supabase-api';
import { useRestaurantRole } from '../../../contexts/RestaurantRoleContext';
import type { KdsOrder, KdsStatus, OrderStatus, TabOrder } from './v2Types';
import { useRegisterRemoteRefresh } from './remoteRefreshRegistry';

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
  shape?: string | null;
  qr_code?: string | null;
  active_session?: {
    id?: string | null;
    guest_name?: string | null;
    guest_count?: number | string | null;
    started_at?: string | null;
    total_spent?: number | string | null;
  } | null;
};

export type V2Table = {
  id: string;
  label: string;
  seats: number;
  status: 'available' | 'occupied' | 'reserved' | 'cleaning' | 'payment' | 'blocked';
  guests: number;
  guestName: string | null;
  totalSpent: number;
  sessionId: string | null;
  time: string;
  section: string;
  shape: string;
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

export function elapsedLabel(value?: string | null): string {
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
    rawStatus: raw.status || 'pending',
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
    seats: toNumber(raw.seats, 1),
    status,
    guests: toNumber(raw.active_session?.guest_count, 0),
    guestName: raw.active_session?.guest_name?.trim() || null,
    totalSpent: toNumber(raw.active_session?.total_spent, 0),
    sessionId: raw.active_session?.id || null,
    time: elapsedLabel(raw.active_session?.started_at),
    section: raw.section || 'Salao',
    shape: raw.shape || 'rectangle',
    hasQR: Boolean(raw.qr_code),
  };
}

function useRealtimeRefresh(table: string, restaurantId: string | null, refresh: () => void) {
  useRegisterRemoteRefresh(refresh);
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
      if (!restaurantId) {
        setData([]);
        return;
      }
      const raw = await supabaseApiAdapter.getRestaurantTables(restaurantId);
      setData((Array.isArray(raw) ? raw : []).map(mapTable));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar mesas');
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useRealtimeRefresh('tables', restaurantId, refresh);
  useRealtimeRefresh('table_sessions', restaurantId, refresh);
  useRealtimeRefresh('orders', restaurantId, refresh);

  return { data, loading, error, refresh };
}

const EMPTY_CUSTOMER_ASSISTANCE_HUB: CustomerAssistanceHub = {
  generated_at: '',
  onboarding: [],
  allergens: [],
  feedback: [],
  feedback_stats: {
    positive: 0,
    neutral: 0,
    negative: 0,
    collected: 0,
    pending: 0,
  },
  special_requests: [],
};

export function useCustomerAssistanceHub(): AsyncState<CustomerAssistanceHub> {
  const [data, setData] = useState<CustomerAssistanceHub>(EMPTY_CUSTOMER_ASSISTANCE_HUB);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { restaurantId } = useRestaurantRole();

  const refresh = useCallback(async () => {
    setError(null);
    try {
      if (!restaurantId) {
        setData(EMPTY_CUSTOMER_ASSISTANCE_HUB);
        return;
      }
      const result = await supabaseApiAdapter.getCustomerAssistanceHub(restaurantId);
      setData({
        ...EMPTY_CUSTOMER_ASSISTANCE_HUB,
        ...result,
        onboarding: Array.isArray(result?.onboarding) ? result.onboarding : [],
        allergens: Array.isArray(result?.allergens) ? result.allergens : [],
        feedback: Array.isArray(result?.feedback) ? result.feedback : [],
        special_requests: Array.isArray(result?.special_requests) ? result.special_requests : [],
        feedback_stats: {
          ...EMPTY_CUSTOMER_ASSISTANCE_HUB.feedback_stats,
          ...(result?.feedback_stats || {}),
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar assistência ao cliente');
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useRealtimeRefresh('customer_feedback', restaurantId, refresh);
  useRealtimeRefresh('restaurant_special_requests', restaurantId, refresh);
  useRealtimeRefresh('tables', restaurantId, refresh);
  useRealtimeRefresh('table_sessions', restaurantId, refresh);

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

  useRegisterRemoteRefresh(refresh);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}

export type StaffMember = {
  id: string;
  userId: string;
  fullName: string;
  email?: string;
  avatarUrl?: string;
  role: string;
  isActive: boolean;
  shift: {
    id: string;
    startTime: string;
    endTime: string;
    status: string;
  } | null;
  salesValue: number;
  tipsValue: number;
  operationalStatus: 'inactive' | 'on_shift' | 'scheduled' | 'active';
};

function mapStaffMember(raw: {
  id?: string;
  role_id?: string;
  user_id: string;
  full_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  role: string;
  is_active: boolean;
  shift?: { id: string; start_time: string; end_time: string; status: string } | null;
  sales_value?: number | string | null;
  tips_value?: number | string | null;
  operational_status?: StaffMember['operationalStatus'];
}): StaffMember {
  return {
    id: raw.id || raw.role_id || raw.user_id,
    userId: raw.user_id,
    fullName: raw.full_name || raw.email || 'Sem nome',
    email: raw.email ?? undefined,
    avatarUrl: raw.avatar_url ?? undefined,
    role: raw.role,
    isActive: Boolean(raw.is_active),
    shift: raw.shift ? {
      id: raw.shift.id,
      startTime: raw.shift.start_time,
      endTime: raw.shift.end_time,
      status: raw.shift.status,
    } : null,
    salesValue: toNumber(raw.sales_value),
    tipsValue: toNumber(raw.tips_value),
    operationalStatus: raw.operational_status || (raw.is_active ? 'active' : 'inactive'),
  };
}

export function useStaff(): AsyncState<StaffMember[]> {
  const [data, setData] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const raw = await supabaseApiAdapter.getStaff();
      setData((Array.isArray(raw) ? raw : []).map(mapStaffMember));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar equipe');
    } finally {
      setLoading(false);
    }
  }, []);

  useRegisterRemoteRefresh(refresh);
  useEffect(() => { void refresh(); }, [refresh]);

  return { data, loading, error, refresh };
}

export function useApprovals(): AsyncState<RestaurantApproval[]> {
  const [data, setData] = useState<RestaurantApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { restaurantId } = useRestaurantRole();

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const raw = await supabaseApiAdapter.getApprovals(restaurantId ?? undefined, 'pending');
      setData(raw.map((approval) => ({ ...approval, amount: toNumber(approval.amount) })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar aprovações');
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useRegisterRemoteRefresh(refresh);
  useEffect(() => { void refresh(); }, [refresh]);
  useRealtimeRefresh('approvals', restaurantId, refresh);

  return { data, loading, error, refresh };
}

export type CashRegisterSession = {
  sessionId: string | null;
  isOpen: boolean;
  openingBalance: number;
  cashSales: number;
  cardSales: number;
  pixSales: number;
  expectedBalance: number;
};

function mapCashRegister(raw: any): CashRegisterSession {
  const session = raw?.session ?? raw;
  const movements = Array.isArray(session?.movements) ? session.movements : [];
  const inflows = movements.reduce((total: number, movement: any) => {
    return /^(sale|reforco|reinforcement)$/i.test(String(movement?.type || ''))
      ? total + toNumber(movement?.amount)
      : total;
  }, 0);
  return {
    sessionId: session?.session_id ?? session?.id ?? null,
    isOpen: Boolean(session?.is_open ?? session?.status === 'open'),
    openingBalance: toNumber(session?.opening_balance),
    cashSales: toNumber(session?.cash_sales, inflows),
    cardSales: toNumber(session?.card_sales),
    pixSales: toNumber(session?.pix_sales),
    expectedBalance: toNumber(session?.expected_balance, toNumber(session?.opening_balance)),
  };
}

export function useCashRegister(): AsyncState<CashRegisterSession | null> {
  const [data, setData] = useState<CashRegisterSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const raw = await supabaseApiAdapter.getCashRegister();
      setData(raw?.session ? mapCashRegister(raw) : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar caixa');
    } finally {
      setLoading(false);
    }
  }, []);

  useRegisterRemoteRefresh(refresh);
  useEffect(() => { void refresh(); }, [refresh]);

  return { data, loading, error, refresh };
}

export type CashMovement = {
  id: string;
  label: string;
  amount: number;
  isCredit: boolean;
  time: string;
};

function mapCashMovement(raw: any, index: number): CashMovement {
  const type: string = raw?.type || raw?.movement_type || '';
  const amount = toNumber(raw?.amount);
  // Withdrawals ("sangria") are the one movement type that reduces the
  // drawer; everything else (sales, reinforcements) increases it.
  const isCredit = !/sangria|withdraw/i.test(type) && amount >= 0;
  const label =
    raw?.description ||
    { sangria: 'Sangria', withdrawal: 'Sangria', reinforcement: 'Reforço', reforco: 'Reforço' }[type] ||
    (raw?.is_cash === false ? 'Venda' : type || 'Movimentação');
  return {
    id: raw?.id || `${index}`,
    label,
    amount: Math.abs(amount),
    isCredit,
    time: clockLabel(raw?.created_at),
  };
}

export function useCashMovements(): AsyncState<CashMovement[]> {
  const [data, setData] = useState<CashMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const raw = await supabaseApiAdapter.getCashRegister();
      const movements = raw?.session?.movements;
      setData((Array.isArray(movements) ? movements : []).map(mapCashMovement));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar movimentações');
    } finally {
      setLoading(false);
    }
  }, []);

  useRegisterRemoteRefresh(refresh);
  useEffect(() => { void refresh(); }, [refresh]);

  return { data, loading, error, refresh };
}

export type Reservation = {
  id: string;
  customerName: string;
  time: string;
  clock: string;
  partySize: number;
  status: string;
  tableNumber: string | number | null;
  specialRequests?: string;
};

function mapReservation(raw: {
  id: string;
  customer_name?: string | null;
  reservation_time: string;
  party_size: number;
  status: string;
  table_number?: string | number | null;
  special_requests?: string | null;
}): Reservation {
  return {
    id: raw.id,
    customerName: raw.customer_name || 'Cliente',
    time: raw.reservation_time,
    clock: clockLabel(raw.reservation_time),
    partySize: toNumber(raw.party_size, 1),
    status: raw.status,
    tableNumber: raw.table_number ?? null,
    specialRequests: raw.special_requests ?? undefined,
  };
}

export function useReservations(dateISO?: string): AsyncState<Reservation[]> {
  const [data, setData] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { restaurantId } = useRestaurantRole();
  const date = dateISO || new Date().toISOString().split('T')[0];

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const raw = await supabaseApiAdapter.getReservations({ date });
      setData((Array.isArray(raw) ? raw : []).map(mapReservation));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar reservas');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { void refresh(); }, [refresh]);
  useRealtimeRefresh('reservations', restaurantId, refresh);

  return { data, loading, error, refresh };
}

export type StockItem = {
  id: string;
  name: string;
  category: string;
  unit: string;
  currentLevel: number;
  minLevel: number;
  isLow: boolean;
};

function mapStockItem(raw: {
  id: string;
  name: string;
  category?: string | null;
  unit?: string | null;
  current_level?: number | string | null;
  min_level?: number | string | null;
}): StockItem {
  const currentLevel = toNumber(raw.current_level);
  const minLevel = toNumber(raw.min_level);
  return {
    id: raw.id,
    name: raw.name,
    category: raw.category || 'Geral',
    unit: raw.unit || 'un',
    currentLevel,
    minLevel,
    isLow: minLevel > 0 && currentLevel <= minLevel,
  };
}

export function useStock(): AsyncState<StockItem[]> {
  const [data, setData] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const raw = await supabaseApiAdapter.getStock();
      setData((Array.isArray(raw) ? raw : []).map(mapStockItem));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar estoque');
    } finally {
      setLoading(false);
    }
  }, []);

  useRegisterRemoteRefresh(refresh);
  useEffect(() => { void refresh(); }, [refresh]);

  return { data, loading, error, refresh };
}

export type Promotion = {
  id: string;
  title: string;
  type: string;
  discountValue: number | null;
  validFrom: string;
  validUntil: string;
};

function mapPromotion(raw: {
  id: string;
  title: string;
  type?: string | null;
  discount_value?: number | string | null;
  valid_from: string;
  valid_until: string;
}): Promotion {
  return {
    id: raw.id,
    title: raw.title,
    type: raw.type || 'discount',
    discountValue: raw.discount_value != null ? toNumber(raw.discount_value) : null,
    validFrom: raw.valid_from,
    validUntil: raw.valid_until,
  };
}

export function usePromotions(): AsyncState<Promotion[]> {
  const [data, setData] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { restaurantId } = useRestaurantRole();

  const refresh = useCallback(async () => {
    if (!restaurantId) return;
    setError(null);
    try {
      const raw = await supabaseApiAdapter.getPromotions(restaurantId, 'active');
      setData((Array.isArray(raw) ? raw : []).map(mapPromotion));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar promoções');
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useRegisterRemoteRefresh(refresh);
  useEffect(() => { void refresh(); }, [refresh]);

  return { data, loading, error, refresh };
}

export type MenuItemSummary = {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl?: string;
  isAvailable: boolean;
};

function mapMenuItemSummary(raw: {
  id: string;
  name: string;
  description?: string | null;
  price?: number | string | null;
  image_url?: string | null;
  is_available?: boolean;
}): MenuItemSummary {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description || '',
    price: toNumber(raw.price),
    imageUrl: raw.image_url ?? undefined,
    isAvailable: raw.is_available !== false,
  };
}

export function useMenuItems(): AsyncState<MenuItemSummary[]> {
  const [data, setData] = useState<MenuItemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const raw = await supabaseApiAdapter.getMenu();
      setData((Array.isArray(raw) ? raw : []).map(mapMenuItemSummary));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar cardápio');
    } finally {
      setLoading(false);
    }
  }, []);

  useRegisterRemoteRefresh(refresh);
  useEffect(() => { void refresh(); }, [refresh]);

  return { data, loading, error, refresh };
}

export type ServiceCall = {
  id: string;
  tableNumber: string | number | null;
  callType: string;
  status: string;
  createdAt?: string;
};

function mapServiceCall(raw: {
  id: string;
  table_number?: string | number | null;
  call_type: string;
  status: string;
  created_at?: string;
}): ServiceCall {
  return {
    id: raw.id,
    tableNumber: raw.table_number ?? null,
    callType: raw.call_type,
    status: raw.status,
    createdAt: raw.created_at,
  };
}

export function useServiceCalls(): AsyncState<ServiceCall[]> {
  const [data, setData] = useState<ServiceCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { restaurantId } = useRestaurantRole();

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const raw = await supabaseApiAdapter.getServiceCalls(undefined, ['open', 'acknowledged']);
      setData((Array.isArray(raw) ? raw : []).map(mapServiceCall));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar chamados');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useRealtimeRefresh('service_calls', restaurantId, refresh);

  return { data, loading, error, refresh };
}

export function useFilteredOrders(orders: TabOrder[], activeTab: 'all' | OrderStatus) {
  return useMemo(() => {
    if (activeTab === 'all') return orders;
    return orders.filter((order) => order.status === activeTab);
  }, [orders, activeTab]);
}
