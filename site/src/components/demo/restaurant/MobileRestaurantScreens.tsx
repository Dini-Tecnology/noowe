import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChefHat,
  ChevronLeft,
  Clock,
  DollarSign,
  Edit3,
  Flame,
  LayoutGrid,
  Package,
  Plus,
  Shield,
  ShoppingBag,
  Smartphone,
  Star,
  TrendingUp,
  UserPlus,
  Users,
  Wine,
  X,
  XCircle,
} from 'lucide-react';
import {
  ConfigHub, ConfigProfile, ConfigServiceTypes, ConfigExperience,
  ConfigFloor, ConfigMenu, ConfigTeam, ConfigKitchen, ConfigPayments, ConfigFeatures,
} from './ConfigHubScreens';
import { useDemoContext, type OrderStatus, type TableStatus } from '@/contexts/DemoContext';
import { WaiterAssistScreen } from './RoleScreens';
import {
  FinancialDashboardScreen, CashRegisterScreen, FiscalScreen, CostControlScreen, ForecastScreen,
  ChefApprovalsScreen, ChefTableScreen, KdsAnalyticsScreen, KdsBrainConfigScreen,
  CrmScreen, HrScreen, IntegrationsScreen, LoyaltyMgmtScreen, PromotionsMgmtScreen,
  QrCodesScreen, TapToPayScreen, ReportsScreen, ReviewsMgmtScreen, ReservationsMgmtScreen,
  ClubDoorScreen, ClubQueueMgmtScreen, ClubPromoterScreen, ClubVipMgmtScreen,
  DriveThruMgmtScreen, FoodTruckMgmtScreen, ConfigLanguageScreen, ConfigNotificationsScreen,
  QRScannerStaffScreen, StationSettingsScreen, MaitreDashboardScreen, RestaurantSettingsScreen as RestaurantSettingsExtScreen,
} from './ExtendedScreens';
import { useDemoI18n } from '@/components/demo/DemoI18n';
import {
  DRINK_RECIPES,
  PENDING_APPROVALS,
  ROLE_CONFIG,
  SCREEN_INFO,
  STOCK_ITEMS,
  TEAM_MEMBERS,
  formatTimeAgo,
  getElapsedMinutes,
  type RestaurantScreen,
  type StaffRole,
} from './RestaurantDemoShared';
import {
  type TableGuest,
  KITCHEN_PIPELINE,
  LIVE_FEED,
  TABLE_GUESTS_DATA,
  getTableGuests,
  WAITER_MENU,
} from './ServiceScreens';

const statusBadgeMap: Record<OrderStatus, string> = {
  pending: 'bg-muted text-muted-foreground',
  confirmed: 'bg-info/10 text-info',
  preparing: 'bg-warning/10 text-warning',
  ready: 'bg-success/10 text-success',
  delivered: 'bg-primary/10 text-primary',
  paid: 'bg-muted text-muted-foreground',
};

const orderLabelMap: Record<OrderStatus, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmado',
  preparing: 'Preparando',
  ready: 'Pronto',
  delivered: 'Entregue',
  paid: 'Pago',
};

const tableBadgeMap: Record<TableStatus, string> = {
  available: 'bg-success/10 text-success',
  occupied: 'bg-primary/10 text-primary',
  reserved: 'bg-warning/10 text-warning',
  billing: 'bg-info/10 text-info',
};

const tableLabelMap: Record<TableStatus, string> = {
  available: 'Livre',
  occupied: 'Ocupada',
  reserved: 'Reserva',
  billing: 'Conta',
};

const MobileSection: React.FC<{ title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, subtitle, action, children }) => (
  <section className="space-y-3">
    <div className="flex items-center justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle ? <p className="text-[11px] text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action}
    </div>
    {children}
  </section>
);

const CompactStat: React.FC<{ label: string; value: string; tone?: 'primary' | 'success' | 'warning' | 'info' }> = ({ label, value, tone = 'primary' }) => {
  const toneMap = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    info: 'bg-info/10 text-info',
  } as const;

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className={`inline-flex rounded-xl px-2 py-1 text-xs font-semibold ${toneMap[tone]}`}>{value}</div>
      <p className="mt-2 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
};

const MobileHint: React.FC<{ text: string }> = ({ text }) => (
  <div className="rounded-2xl border border-primary/10 bg-primary/5 px-3 py-2.5 text-[11px] text-primary">
    {text}
  </div>
);

const MobileDashboard: React.FC<{ onNavigate: (screen: string) => void }> = ({ onNavigate }) => {
  const { analytics, orders, notifications, tables } = useDemoContext();
  const activeOrders = orders.filter(o => !['paid', 'delivered'].includes(o.status)).length;
  const readyOrders = orders.filter(o => o.status === 'ready').length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <CompactStat label="Receita Hoje" value={`R$ ${analytics.todayRevenue.toLocaleString()}`} tone="success" />
        <CompactStat label="Pedidos Ativos" value={String(activeOrders)} tone="primary" />
        <CompactStat label="Ocupação" value={`${analytics.occupancyRate}%`} tone="warning" />
        <CompactStat label="Ticket Médio" value={`R$ ${analytics.avgTicket}`} tone="info" />
      </div>

      <MobileSection title="Ações rápidas" subtitle="Atalhos para o que importa agora">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => onNavigate('orders')} className="rounded-2xl border border-border bg-card p-3 text-left">
            <ShoppingBag className="mb-2 h-4 w-4 text-primary" />
            <p className="text-xs font-semibold">Pedidos</p>
            <p className="text-[11px] text-muted-foreground">{activeOrders} em andamento</p>
          </button>
          <button onClick={() => onNavigate('table-map')} className="rounded-2xl border border-border bg-card p-3 text-left">
            <LayoutGrid className="mb-2 h-4 w-4 text-info" />
            <p className="text-xs font-semibold">Mesas</p>
            <p className="text-[11px] text-muted-foreground">{tables.filter(t => t.status === 'occupied').length} ocupadas</p>
          </button>
          <button onClick={() => onNavigate('kds-kitchen')} className="rounded-2xl border border-border bg-card p-3 text-left">
            <ChefHat className="mb-2 h-4 w-4 text-warning" />
            <p className="text-xs font-semibold">KDS Cozinha</p>
            <p className="text-[11px] text-muted-foreground">{readyOrders} prontos</p>
          </button>
          <button onClick={() => onNavigate('analytics')} className="rounded-2xl border border-border bg-card p-3 text-left">
            <TrendingUp className="mb-2 h-4 w-4 text-success" />
            <p className="text-xs font-semibold">Analytics</p>
            <p className="text-[11px] text-muted-foreground">Top itens e pico</p>
          </button>
        </div>
      </MobileSection>

      <MobileSection title="Pedidos recentes">
        <div className="space-y-2">
          {orders.slice(0, 4).map(order => (
            <button key={order.id} onClick={() => onNavigate('orders')} className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 font-display text-sm font-bold text-primary">
                {order.tableNumber}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{order.customerName}</p>
                <p className="text-[11px] text-muted-foreground">{order.items.length} itens · {formatTimeAgo(order.createdAt)}</p>
              </div>
              <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${statusBadgeMap[order.status]}`}>{orderLabelMap[order.status]}</span>
            </button>
          ))}
        </div>
      </MobileSection>

      <MobileSection title="Alertas">
        <div className="space-y-2">
          {notifications.slice(0, 3).map(item => (
            <div key={item.id} className="rounded-2xl border border-border bg-card p-3">
              <p className="text-xs font-medium text-foreground">{item.message}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{formatTimeAgo(item.timestamp)}</p>
            </div>
          ))}
        </div>
      </MobileSection>
    </div>
  );
};

const MobileTableMap: React.FC = () => {
  const { tables, updateTableStatus } = useDemoContext();
  const [selectedTable, setSelectedTable] = useState<string | null>(tables[0]?.id ?? null);
  const selected = tables.find(t => t.id === selectedTable) ?? tables[0];

  return (
    <div className="space-y-4">
      <MobileHint text="No mobile, o mapa vira uma grade operacional rápida para seleção e ação." />
      <div className="grid grid-cols-3 gap-2">
        {tables.map(table => (
          <button
            key={table.id}
            onClick={() => setSelectedTable(table.id)}
            className={`rounded-2xl border p-3 text-left ${selected?.id === table.id ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-lg font-bold text-foreground">{table.number}</span>
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${tableBadgeMap[table.status]}`}>{tableLabelMap[table.status]}</span>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">{table.seats} lugares</p>
            {table.customerName ? <p className="truncate text-[11px] font-medium text-foreground">{table.customerName}</p> : null}
          </button>
        ))}
      </div>

      {selected ? (
        <div className="rounded-3xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-display text-lg font-bold">Mesa {selected.number}</p>
              <p className="text-[11px] text-muted-foreground">{selected.customerName || 'Sem cliente no momento'}</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${tableBadgeMap[selected.status]}`}>{tableLabelMap[selected.status]}</span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <CompactStat label="Lugares" value={String(selected.seats)} tone="info" />
            <CompactStat label="Conta" value={selected.orderTotal ? `R$ ${selected.orderTotal}` : '—'} tone="primary" />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {selected.status === 'available' ? <button onClick={() => updateTableStatus(selected.id, 'occupied')} className="rounded-2xl bg-primary px-3 py-3 text-xs font-semibold text-primary-foreground">Sentar cliente</button> : null}
            {selected.status === 'occupied' ? <button onClick={() => updateTableStatus(selected.id, 'billing')} className="rounded-2xl bg-info px-3 py-3 text-xs font-semibold text-info-foreground">Fechar conta</button> : null}
            {selected.status === 'billing' ? <button onClick={() => updateTableStatus(selected.id, 'available')} className="rounded-2xl bg-success px-3 py-3 text-xs font-semibold text-success-foreground">Liberar mesa</button> : null}
            {selected.status === 'reserved' ? <button onClick={() => updateTableStatus(selected.id, 'occupied')} className="rounded-2xl bg-warning px-3 py-3 text-xs font-semibold text-warning-foreground">Check-in</button> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const MobileOrders: React.FC = () => {
  const { orders, updateOrderStatus } = useDemoContext();
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
  const filtered = filter === 'all' ? orders : orders.filter(order => order.status === filter);

  const nextAction = (status: OrderStatus): { label: string; next: OrderStatus; tone: string } | null => {
    if (status === 'pending') return { label: 'Confirmar', next: 'confirmed', tone: 'bg-primary text-primary-foreground' };
    if (status === 'confirmed') return { label: 'Preparar', next: 'preparing', tone: 'bg-warning text-warning-foreground' };
    if (status === 'preparing') return { label: 'Marcar pronto', next: 'ready', tone: 'bg-success text-success-foreground' };
    if (status === 'ready') return { label: 'Entregar', next: 'delivered', tone: 'bg-info text-info-foreground' };
    return null;
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {(['all', 'pending', 'confirmed', 'preparing', 'ready'] as const).map(key => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-semibold ${filter === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
          >
            {key === 'all' ? 'Todos' : orderLabelMap[key]}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map(order => {
          const action = nextAction(order.status);
          return (
            <div key={order.id} className="rounded-2xl border border-border bg-card p-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 font-display text-sm font-bold text-primary">
                  {order.tableNumber}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{order.customerName}</p>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${statusBadgeMap[order.status]}`}>{orderLabelMap[order.status]}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{order.items.length} itens · R$ {order.total} · {formatTimeAgo(order.createdAt)}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {order.items.slice(0, 2).map((item, index) => (
                      <span key={index} className="rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground">{item.quantity}x {item.menuItem.name}</span>
                    ))}
                  </div>
                </div>
              </div>
              {action ? (
                <button onClick={() => updateOrderStatus(order.id, action.next)} className={`mt-3 w-full rounded-2xl px-3 py-2.5 text-xs font-semibold ${action.tone}`}>
                  {action.label}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const MobileKDS: React.FC<{ view: 'kitchen' | 'bar' }> = ({ view }) => {
  const { orders, updateOrderStatus } = useDemoContext();
  const items = orders.filter(o => ['confirmed', 'preparing'].includes(o.status) && (view === 'kitchen' ? o.isKitchen : o.isBar));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <CompactStat label="Fila" value={String(items.filter(i => i.status === 'confirmed').length)} tone="warning" />
        <CompactStat label="Preparando" value={String(items.filter(i => i.status === 'preparing').length)} tone="primary" />
        <CompactStat label="Prontos" value={String(orders.filter(i => i.status === 'ready').length)} tone="success" />
      </div>
      <div className="space-y-2">
        {items.map(order => (
          <div key={order.id} className="rounded-2xl border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Mesa {order.tableNumber}</p>
                <p className="text-[11px] text-muted-foreground">{order.items.length} itens · {getElapsedMinutes(order.createdAt)}min</p>
              </div>
              <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${statusBadgeMap[order.status]}`}>{orderLabelMap[order.status]}</span>
            </div>
            <div className="mt-2 space-y-1">
              {order.items.slice(0, 3).map((item, index) => (
                <div key={index} className="flex items-center justify-between text-[11px]">
                  <span className="text-foreground">{item.quantity}x {item.menuItem.name}</span>
                  <span className="text-muted-foreground">{item.menuItem.prepTime}min</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => updateOrderStatus(order.id, order.status === 'confirmed' ? 'preparing' : 'ready')}
              className={`mt-3 w-full rounded-2xl px-3 py-2.5 text-xs font-semibold ${order.status === 'confirmed' ? 'bg-warning text-warning-foreground' : 'bg-success text-success-foreground'}`}
            >
              {order.status === 'confirmed' ? 'Iniciar preparo' : 'Marcar pronto'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

const reservationStatusLabel: Record<string, string> = {
  confirmed: 'Confirmada',
  waiting: 'Aguardando',
  cancelled: 'Cancelada',
  seated: 'Acomodado',
};

const reservationNoteLabel: Record<string, string> = {
  'Aniversário de casamento': 'Aniversário de casamento',
  'Jantar de negócios': 'Jantar de negócios',
  'Mesa no terraço': 'Mesa no terraço',
};

const MobileMaitre: React.FC = () => {
  const { reservations, tables } = useDemoContext();
  const available = tables.filter(t => t.status === 'available').length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <CompactStat label="Reservas Hoje" value={String(reservations.length)} tone="primary" />
        <CompactStat label="Mesas Livres" value={String(available)} tone="success" />
      </div>
      <MobileSection title="Reservas confirmadas">
        <div className="space-y-2">
          {reservations.map(reservation => (
            <div key={reservation.id} className="rounded-2xl border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{reservation.customerName}</p>
                  <p className="text-[11px] text-muted-foreground">{reservation.time} · {reservation.partySize} pessoas</p>
                </div>
                <span className="rounded-full bg-warning/10 px-2 py-1 text-[10px] font-semibold text-warning">{reservationStatusLabel[reservation.status] || reservation.status}</span>
              </div>
              {reservation.notes ? <p className="mt-2 text-[11px] text-muted-foreground">{reservationNoteLabel[reservation.notes] || reservation.notes}</p> : null}
            </div>
          ))}
        </div>
      </MobileSection>
    </div>
  );
};

const MobileWaiter: React.FC<{ initialTab?: 'live' | 'tables' | 'kitchen' | 'charge' }> = ({ initialTab = 'live' }) => {
  const { orders, tables, notifications, menu } = useDemoContext();
  const [waiterTab, setWaiterTab] = useState<'live' | 'tables' | 'kitchen' | 'charge'>(initialTab);
  const myTables = tables.filter(t => ['occupied', 'billing'].includes(t.status));
  const waiterCalls = notifications.filter(n => n.type === 'waiter_call' && !n.read);
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [handledItems, setHandledItems] = useState<string[]>([]);
  const [pickedUp, setPickedUp] = useState<string[]>([]);
  const [paymentStep, setPaymentStep] = useState<'guests' | 'method' | 'processing' | 'done'>('guests');
  const [selectedGuest, setSelectedGuest] = useState<string | null>(null);

  // Table detail
  const [tableDetailTab, setTableDetailTab] = useState<'guests' | 'orders' | 'menu' | 'charge'>('guests');
  const [addingGuest, setAddingGuest] = useState(false);
  const [newGuestName, setNewGuestName] = useState('');
  const [addedGuests, setAddedGuests] = useState<TableGuest[]>([]);
  const [menuCategory, setMenuCategory] = useState(WAITER_MENU[0].cat);
  const [orderingForGuest, setOrderingForGuest] = useState<string | null>(null);
  const [pendingOrder, setPendingOrder] = useState<Array<{ item: string; qty: number; price: number }>>([]);
  const [sentOrders, setSentOrders] = useState<Array<{ id: string; guest: string; item: string; qty: number; price: number; status: string; sentAt: string }>>([]);
  const [cancelledOrders, setCancelledOrders] = useState<string[]>([]);
  const [editingOrder, setEditingOrder] = useState<string | null>(null);
  const [orderSentToast, setOrderSentToast] = useState(false);

  const readyDishes = KITCHEN_PIPELINE.filter(d => d.status === 'ready' && !pickedUp.includes(d.id));
  const activeFeed = LIVE_FEED.filter(f => !handledItems.includes(f.id));

  const getAllGuests = (tableNum: number): TableGuest[] => {
    const base = getTableGuests(tableNum);
    const added = addedGuests.filter(g => g.id.startsWith(`added-${tableNum}-`));
    return [...base, ...added];
  };

  const handleAddGuest = (tableNum: number) => {
    if (!newGuestName.trim()) return;
    const newGuest: TableGuest = {
      id: `added-${tableNum}-${Date.now()}`,
      name: newGuestName.trim(),
      hasApp: false,
      paid: false,
      orders: [],
    };
    setAddedGuests(prev => [...prev, newGuest]);
    setNewGuestName('');
    setAddingGuest(false);
  };

  const handleSendOrder = (guestId: string) => {
    if (pendingOrder.length === 0) return;
    const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const newSent = pendingOrder.map((item, i) => ({
      id: `sent-${Date.now()}-${i}`,
      guest: guestId,
      item: item.item,
      qty: item.qty,
      price: item.price,
      status: 'pending',
      sentAt: now,
    }));
    setSentOrders(prev => [...prev, ...newSent]);
    setPendingOrder([]);
    setOrderingForGuest(null);
    setTableDetailTab('orders');
    setOrderSentToast(true);
    setTimeout(() => setOrderSentToast(false), 3000);
  };

  return (
    <div className="space-y-3 relative">
      {/* Toast */}
      {orderSentToast && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-success text-success-foreground rounded-xl px-3 py-2.5 flex items-center gap-2 shadow-lg animate-in slide-in-from-top-2">
          <Check className="w-4 h-4" />
          <div>
            <p className="text-[10px] font-bold">Pedido enviado para a cozinha!</p>
            <p className="text-[8px] opacity-80">O chef recebeu e vai começar a preparar</p>
          </div>
        </div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-1.5">
        {[
          { label: 'Mesas', value: myTables.length.toString(), urgent: false },
          { label: 'Retirar', value: readyDishes.length.toString(), urgent: readyDishes.length > 0 },
          { label: 'Chamados', value: (waiterCalls.length || activeFeed.filter(f => f.type === 'call').length).toString(), urgent: waiterCalls.length > 0 },
          { label: 'Gorjetas', value: 'R$410', urgent: false },
        ].map((s, i) => (
          <div key={i} className={`rounded-xl p-2 text-center ${s.urgent ? 'bg-destructive/10 border border-destructive/20' : 'bg-card border border-border'}`}>
            <p className={`font-display font-bold text-sm ${s.urgent ? 'text-destructive' : 'text-primary'}`}>{s.value}</p>
            <p className="text-[8px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tab nav */}
      <div className="flex bg-muted/30 rounded-xl p-0.5">
        {[
          { id: 'live' as const, label: 'Ao Vivo', badge: activeFeed.filter(f => f.urgency !== 'info').length },
          { id: 'tables' as const, label: 'Mesas', badge: 0 },
          { id: 'kitchen' as const, label: 'Cozinha', badge: readyDishes.length },
          { id: 'charge' as const, label: 'Cobrar', badge: 0 },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => { setWaiterTab(tab.id); setSelectedTable(null); setPaymentStep('guests'); setSelectedGuest(null); setTableDetailTab('guests'); }}
            className={`flex-1 py-2 rounded-lg text-[10px] font-semibold transition-all relative ${
              waiterTab === tab.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {tab.label}
            {tab.badge > 0 && (
              <span className={`absolute -top-1 right-1 w-4 h-4 rounded-full text-[7px] font-bold flex items-center justify-center ${
                tab.id === 'kitchen' ? 'bg-destructive text-destructive-foreground animate-pulse' : 'bg-primary text-primary-foreground'
              }`}>{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ AO VIVO ═══ */}
      {waiterTab === 'live' && (
        <div className="space-y-2">
          {readyDishes.length > 0 && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-destructive/10 border border-destructive/20">
              <div className="w-7 h-7 rounded-lg bg-destructive/20 flex items-center justify-center animate-pulse">
                <ChefHat className="w-3.5 h-3.5 text-destructive" />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-bold text-destructive">{readyDishes.length} prato(s) esperando retirada!</p>
                <p className="text-[8px] text-destructive/70">A cozinha está aguardando</p>
              </div>
              <button onClick={() => setWaiterTab('kitchen')} className="px-2 py-1 rounded-lg bg-destructive text-destructive-foreground text-[8px] font-bold">Ver</button>
            </div>
          )}
          {activeFeed.map(item => {
            const config = {
              kitchen_ready: { icon: ChefHat, color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20', action: 'Retirar' },
              call: { icon: Bell, color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20', action: 'Atender' },
              payment: { icon: Check, color: 'text-success', bg: 'bg-success/10', border: 'border-success/20', action: null },
              payment_needed: { icon: Smartphone, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20', action: 'Cobrar' },
              approval: { icon: Shield, color: 'text-info', bg: 'bg-info/10', border: 'border-info/20', action: 'Solicitar' },
              order: { icon: BookOpen, color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border', action: null },
            }[item.type];
            const Icon = config.icon;
            return (
              <div key={item.id} className={`rounded-xl border ${config.border} overflow-hidden ${item.urgency === 'critical' ? 'ring-1 ring-destructive/20' : ''}`}>
                <div className="flex items-start gap-2 p-2.5">
                  <div className={`w-8 h-8 rounded-lg ${config.bg} flex items-center justify-center shrink-0 ${item.urgency === 'critical' ? 'animate-pulse' : ''}`}>
                    <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[8px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">M{item.table}</span>
                      <span className="text-[8px] text-muted-foreground">{item.time}</span>
                      {item.urgency === 'critical' && <span className="px-1 py-0.5 rounded bg-destructive/10 text-destructive text-[7px] font-bold animate-pulse">AGORA</span>}
                    </div>
                    <p className="text-[10px] font-semibold mt-0.5">{item.event}</p>
                    <p className="text-[8px] text-muted-foreground">{item.detail}</p>
                  </div>
                </div>
                {config.action && (
                  <button
                    onClick={() => {
                      setHandledItems(prev => [...prev, item.id]);
                      if (item.type === 'payment_needed') { setWaiterTab('charge'); setSelectedTable(item.table); }
                      if (item.type === 'kitchen_ready') { setWaiterTab('kitchen'); }
                      if (item.type === 'call') { setWaiterTab('tables'); setSelectedTable(item.table); }
                    }}
                    className={`w-full py-1.5 text-[9px] font-bold border-t ${config.border} ${
                      item.urgency === 'critical' ? 'bg-destructive text-destructive-foreground' :
                      item.urgency === 'high' ? `${config.bg} ${config.color}` : `bg-muted/30 ${config.color}`
                    }`}
                  >
                    {config.action} →
                  </button>
                )}
              </div>
            );
          })}
          {activeFeed.length === 0 && (
            <div className="text-center py-8">
              <Check className="w-8 h-8 text-success/30 mx-auto mb-2" />
              <p className="font-display font-bold text-success text-sm">Tudo tranquilo!</p>
              <p className="text-[9px] text-muted-foreground">Nenhuma ação pendente</p>
            </div>
          )}
        </div>
      )}

      {/* ═══ MESAS — overview ═══ */}
      {waiterTab === 'tables' && !selectedTable && (
        <div className="space-y-2">
          {myTables.map(table => {
            const guests = getAllGuests(table.number);
            const paidCount = guests.filter(g => g.paid).length;
            const paidPct = guests.length > 0 ? Math.round((paidCount / guests.length) * 100) : 0;
            const noAppCount = guests.filter(g => !g.hasApp && !g.paid).length;
            const totalOrders = guests.reduce((a, g) => a + g.orders.length, 0) + sentOrders.filter(s => guests.some(g => g.id === s.guest)).length;
            const hasReady = KITCHEN_PIPELINE.some(d => d.table === table.number && d.status === 'ready' && !pickedUp.includes(d.id));
            return (
              <button key={table.id} onClick={() => { setSelectedTable(table.number); setTableDetailTab('guests'); }} className={`w-full text-left rounded-xl border-2 overflow-hidden transition-all ${
                hasReady ? 'border-destructive/30 bg-destructive/5' :
                noAppCount > 0 ? 'border-warning/20 bg-warning/5' :
                table.status === 'billing' ? 'border-info/30 bg-info/5' : 'border-border bg-card'
              }`}>
                <div className="p-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-display font-bold text-sm ${
                        hasReady ? 'bg-destructive/10 text-destructive animate-pulse' : 'bg-primary/10 text-primary'
                      }`}>{table.number}</div>
                      <div>
                        <p className="font-semibold text-xs">{table.customerName}</p>
                        <p className="text-[8px] text-muted-foreground">{guests.length} pessoas · {totalOrders} pedidos</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-display font-bold text-xs text-primary">R$ {table.orderTotal || 0}</span>
                      <div className="flex items-center gap-1 mt-0.5">
                        {hasReady && <span className="text-[7px] font-bold text-destructive bg-destructive/10 px-1 rounded">PRATO</span>}
                        {noAppCount > 0 && <span className="text-[7px] font-bold text-warning bg-warning/10 px-1 rounded">{noAppCount} S/APP</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {guests.slice(0, 5).map((g, i) => (
                      <div key={i} className={`w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold ${
                        g.paid ? 'bg-success/20 text-success' : g.hasApp ? 'bg-info/20 text-info' : 'bg-warning/20 text-warning'
                      }`}>{g.paid ? '✓' : g.hasApp ? '📱' : '!'}</div>
                    ))}
                    <div className="flex-1 h-1.5 bg-muted rounded-full ml-1 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-success to-success/60 rounded-full" style={{ width: `${paidPct}%` }} />
                    </div>
                    <span className="text-[8px] font-bold text-muted-foreground ml-1">{paidPct}%</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ═══ TABLE DETAIL — Full Command Center ═══ */}
      {waiterTab === 'tables' && selectedTable && (() => {
        const table = myTables.find(t => t.number === selectedTable);
        if (!table) return null;
        const guests = getAllGuests(selectedTable);
        const paidCount = guests.filter(g => g.paid).length;
        const paidPct = guests.length > 0 ? Math.round((paidCount / guests.length) * 100) : 0;
        const allOrders = [
          ...guests.flatMap(g => g.orders.map(o => ({ ...o, guestName: g.name, guestId: g.id, hasApp: g.hasApp }))),
          ...sentOrders.filter(s => guests.some(g => g.id === s.guest)).map(s => ({
            id: s.id, item: s.item, qty: s.qty, price: s.price, status: s.status,
            sentAt: s.sentAt, guestName: guests.find(g => g.id === s.guest)?.name || 'Convidado', guestId: s.guest, hasApp: false,
          })),
        ].filter(o => !cancelledOrders.includes(o.id));
        const tableTotal = allOrders.reduce((a, o) => a + o.price * o.qty, 0);

        return (
          <div className="space-y-2">
            <button onClick={() => { setSelectedTable(null); setTableDetailTab('guests'); }} className="flex items-center gap-1 text-[10px] text-primary font-semibold">
              <ChevronLeft className="w-3 h-3" /> Todas as mesas
            </button>

            <div className="bg-gradient-to-br from-primary/10 via-secondary/5 to-accent/10 rounded-xl p-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-display text-base font-bold">Mesa {table.number}</p>
                  <p className="text-[8px] text-muted-foreground">{table.customerName} · {guests.length} pessoas</p>
                </div>
                <div className="text-right">
                  <span className="font-display font-bold text-primary">R$ {tableTotal}</span>
                  <div className="flex items-center gap-1 mt-0.5">
                    <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-success rounded-full" style={{ width: `${paidPct}%` }} />
                    </div>
                    <span className="text-[7px] font-bold">{paidPct}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Sub-tabs */}
            <div className="flex bg-muted/30 rounded-lg p-0.5">
              {[
                { id: 'guests' as const, label: 'Pessoas', count: guests.length },
                { id: 'orders' as const, label: 'Pedidos', count: allOrders.length },
                { id: 'menu' as const, label: 'Cardápio', count: 0 },
                { id: 'charge' as const, label: 'Cobrar', count: guests.filter(g => !g.paid).length },
              ].map(t => (
                <button key={t.id} onClick={() => setTableDetailTab(t.id)}
                  className={`flex-1 py-1.5 rounded-md text-[9px] font-semibold transition-all ${
                    tableDetailTab === t.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
                  }`}>
                  {t.label}{t.count > 0 && <span className="ml-0.5 text-[7px] opacity-60">({t.count})</span>}
                </button>
              ))}
            </div>

            {/* ── PESSOAS ── */}
            {tableDetailTab === 'guests' && (
              <div className="space-y-1.5">
                {guests.map(guest => {
                  const guestOrders = allOrders.filter(o => o.guestId === guest.id);
                  const guestTotal = guestOrders.reduce((a, o) => a + o.price * o.qty, 0);
                  return (
                    <div key={guest.id} className={`rounded-xl border p-2.5 ${
                      guest.paid ? 'border-success/20 bg-success/5 opacity-70' :
                      !guest.hasApp ? 'border-warning/20 bg-warning/5' : 'border-border bg-card'
                    }`}>
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[8px] font-bold ${
                          guest.paid ? 'bg-success/20 text-success' : guest.hasApp ? 'bg-info/20 text-info' : 'bg-warning/20 text-warning'
                        }`}>{guest.paid ? '✓' : guest.hasApp ? '📱' : '!'}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <p className="text-[10px] font-semibold truncate">{guest.name}</p>
                            <span className={`px-1 py-0.5 rounded text-[7px] font-bold ${guest.hasApp ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                              {guest.hasApp ? 'APP' : 'SEM APP'}
                            </span>
                          </div>
                          <p className="text-[8px] text-muted-foreground">{guestOrders.length} itens{guest.paid ? ` · Pago via ${guest.method}` : ''}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] font-bold">R$ {guestTotal}</p>
                          <div className="flex gap-1 mt-0.5">
                            {!guest.paid && (
                              <button onClick={() => { setOrderingForGuest(guest.id); setTableDetailTab('menu'); setPendingOrder([]); }}
                                className="px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[7px] font-bold">+ Pedir</button>
                            )}
                            {!guest.paid && !guest.hasApp && (
                              <button onClick={() => { setSelectedGuest(guest.name); setTableDetailTab('charge'); }}
                                className="px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground text-[7px] font-bold">Cobrar</button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {addingGuest ? (
                  <div className="rounded-xl border-2 border-dashed border-primary/30 p-2.5 space-y-2">
                    <p className="text-[9px] font-semibold">Adicionar convidado sem app</p>
                    <input type="text" value={newGuestName} onChange={e => setNewGuestName(e.target.value)}
                      placeholder="Nome do convidado" className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-[11px]" autoFocus />
                    <div className="flex gap-2">
                      <button onClick={() => handleAddGuest(selectedTable)} className="flex-1 py-1.5 rounded-lg bg-primary text-primary-foreground text-[9px] font-bold">Adicionar</button>
                      <button onClick={() => { setAddingGuest(false); setNewGuestName(''); }} className="py-1.5 px-2 rounded-lg border border-border text-[9px]">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setAddingGuest(true)} className="w-full flex items-center justify-center gap-1 py-2 rounded-xl border-2 border-dashed border-muted-foreground/20 text-muted-foreground hover:border-primary/30 hover:text-primary transition-colors">
                    <UserPlus className="w-3.5 h-3.5" />
                    <span className="text-[9px] font-semibold">Adicionar convidado sem app</span>
                  </button>
                )}
              </div>
            )}

            {/* ── PEDIDOS ── */}
            {tableDetailTab === 'orders' && (
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-1">
                  {[
                    { label: 'Pendente', count: allOrders.filter(o => ['pending', 'confirmed'].includes(o.status)).length, color: 'text-warning', bg: 'bg-warning/10' },
                    { label: 'Preparando', count: allOrders.filter(o => o.status === 'preparing').length, color: 'text-info', bg: 'bg-info/10' },
                    { label: 'Pronto', count: allOrders.filter(o => o.status === 'ready').length, color: 'text-destructive', bg: 'bg-destructive/10' },
                    { label: 'Servido', count: allOrders.filter(o => o.status === 'served').length, color: 'text-success', bg: 'bg-success/10' },
                  ].map((s, i) => (
                    <div key={i} className={`rounded-lg p-1.5 text-center ${s.bg}`}>
                      <p className={`font-bold text-sm ${s.color}`}>{s.count}</p>
                      <p className="text-[7px] text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>

                {['ready', 'preparing', 'confirmed', 'pending', 'served'].map(status => {
                  const items = allOrders.filter(o => o.status === status);
                  if (items.length === 0) return null;
                  const cfg: Record<string, { label: string; color: string; dotColor: string }> = {
                    pending: { label: 'ENVIADO', color: 'text-warning', dotColor: 'bg-warning' },
                    confirmed: { label: 'CONFIRMADO', color: 'text-info', dotColor: 'bg-info' },
                    preparing: { label: 'PREPARANDO', color: 'text-info', dotColor: 'bg-info animate-pulse' },
                    ready: { label: '🔔 PRONTO', color: 'text-destructive', dotColor: 'bg-destructive animate-pulse' },
                    served: { label: '✓ SERVIDO', color: 'text-success', dotColor: 'bg-success' },
                  };
                  const c = cfg[status];
                  return (
                    <div key={status} className="space-y-1">
                      <p className={`text-[8px] uppercase tracking-wider font-bold px-1 flex items-center gap-1 ${c.color}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${c.dotColor}`} /> {c.label}
                      </p>
                      {items.map(order => (
                        <div key={order.id} className={`rounded-xl border p-2 ${
                          status === 'ready' ? 'border-destructive/30 bg-destructive/5' :
                          status === 'served' ? 'border-success/20 bg-success/5 opacity-60' : 'border-border bg-card'
                        }`}>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-semibold">{order.qty}x {order.item}</p>
                              <span className={`text-[8px] ${order.hasApp ? 'text-info' : 'text-warning'}`}>
                                {order.hasApp ? '📱' : '👤'} {order.guestName}
                              </span>
                            </div>
                            <span className="text-[9px] font-bold">R$ {order.price * order.qty}</span>
                            {status !== 'served' && (
                              <div className="flex gap-1">
                                {status === 'ready' && (
                                  <button onClick={() => setPickedUp(prev => [...prev, order.id])}
                                    className="px-1.5 py-1 rounded-lg bg-destructive text-destructive-foreground text-[7px] font-bold">Servir</button>
                                )}
                                {['pending', 'confirmed'].includes(status) && (
                                  <>
                                    <button onClick={() => setEditingOrder(editingOrder === order.id ? null : order.id)}
                                      className="p-1 rounded-lg bg-muted"><Edit3 className="w-2.5 h-2.5 text-muted-foreground" /></button>
                                    <button onClick={() => setCancelledOrders(prev => [...prev, order.id])}
                                      className="p-1 rounded-lg bg-destructive/10"><X className="w-2.5 h-2.5 text-destructive" /></button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                          {editingOrder === order.id && (
                            <div className="mt-2 pt-2 border-t border-border flex gap-1">
                              <button className="flex-1 py-1 rounded-lg bg-warning/10 text-warning text-[8px] font-bold">Alterar qtd</button>
                              <button className="flex-1 py-1 rounded-lg bg-info/10 text-info text-[8px] font-bold">Trocar item</button>
                              <button onClick={() => setCancelledOrders(prev => [...prev, order.id])}
                                className="flex-1 py-1 rounded-lg bg-destructive/10 text-destructive text-[8px] font-bold">Cancelar</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}

                {allOrders.length === 0 && (
                  <div className="text-center py-6">
                    <BookOpen className="w-7 h-7 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-[10px] text-muted-foreground">Nenhum pedido ainda</p>
                    <button onClick={() => setTableDetailTab('menu')} className="mt-2 px-3 py-1 rounded-lg bg-primary text-primary-foreground text-[9px] font-bold">Abrir Cardápio</button>
                  </div>
                )}

                <button onClick={() => { setTableDetailTab('menu'); setOrderingForGuest(null); }} className="w-full py-2 rounded-xl border-2 border-dashed border-primary/20 text-primary text-[9px] font-semibold">
                  + Adicionar mais itens
                </button>
              </div>
            )}

            {/* ── CARDÁPIO (ordering) ── */}
            {tableDetailTab === 'menu' && (
              <div className="space-y-2">
                <div className="rounded-xl bg-info/5 border border-info/20 p-2">
                  <p className="text-[8px] text-info font-semibold uppercase tracking-wider">Fazendo pedido para</p>
                  {orderingForGuest ? (
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[10px] font-bold">{guests.find(g => g.id === orderingForGuest)?.name || 'Convidado'}</p>
                      <button onClick={() => setOrderingForGuest(null)} className="text-[8px] text-primary underline">trocar</button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {guests.filter(g => !g.paid).map(g => (
                        <button key={g.id} onClick={() => setOrderingForGuest(g.id)}
                          className={`px-2 py-1 rounded-lg border text-[8px] font-semibold ${
                            !g.hasApp ? 'border-warning/30 bg-warning/5 text-warning' : 'border-border bg-card text-foreground'
                          }`}>
                          {!g.hasApp ? '👤' : '📱'} {g.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {orderingForGuest && (
                  <>
                    <div className="flex gap-1 overflow-x-auto pb-1">
                      {WAITER_MENU.map(c => (
                        <button key={c.cat} onClick={() => setMenuCategory(c.cat)}
                          className={`whitespace-nowrap px-2.5 py-1 rounded-full text-[9px] font-semibold ${
                            menuCategory === c.cat ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                          }`}>{c.cat}</button>
                      ))}
                    </div>

                    <div className="space-y-1">
                      {WAITER_MENU.find(c => c.cat === menuCategory)?.items.map(item => {
                        const inCart = pendingOrder.find(p => p.item === item.name);
                        return (
                          <div key={item.id} className={`flex items-center gap-2 p-2 rounded-xl border ${inCart ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}>
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-semibold">{item.name}</p>
                              <p className="text-[8px] text-muted-foreground">R$ {item.price} · {item.time}</p>
                            </div>
                            {inCart ? (
                              <div className="flex items-center gap-1.5">
                                <button onClick={() => setPendingOrder(prev => {
                                  const idx = prev.findIndex(p => p.item === item.name);
                                  if (idx === -1) return prev;
                                  if (prev[idx].qty <= 1) return prev.filter((_, i) => i !== idx);
                                  return prev.map((p, i) => i === idx ? { ...p, qty: p.qty - 1 } : p);
                                })} className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold">-</button>
                                <span className="text-[10px] font-bold w-3 text-center">{inCart.qty}</span>
                                <button onClick={() => setPendingOrder(prev => prev.map(p => p.item === item.name ? { ...p, qty: p.qty + 1 } : p))}
                                  className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">+</button>
                              </div>
                            ) : (
                              <button onClick={() => setPendingOrder(prev => [...prev, { item: item.name, qty: 1, price: item.price }])}
                                className="px-2 py-1 rounded-lg bg-primary/10 text-primary text-[8px] font-bold">+ Add</button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {pendingOrder.length > 0 && (
                      <div className="rounded-xl border-2 border-primary bg-primary/5 p-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[9px] font-bold">{pendingOrder.reduce((a, p) => a + p.qty, 0)} itens</p>
                          <p className="text-[11px] font-bold text-primary">R$ {pendingOrder.reduce((a, p) => a + p.price * p.qty, 0)}</p>
                        </div>
                        <button onClick={() => handleSendOrder(orderingForGuest)}
                          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-[10px] font-bold shadow-lg">
                          🔥 Enviar para Cozinha
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── COBRAR (table-level) ── */}
            {tableDetailTab === 'charge' && (
              <>
                {paymentStep === 'guests' && (
                  <div className="space-y-1.5">
                    {guests.map(guest => {
                      const guestOrders = allOrders.filter(o => o.guestId === guest.id);
                      const guestTotal = guestOrders.reduce((a, o) => a + o.price * o.qty, 0);
                      return (
                        <div key={guest.id} className={`flex items-center gap-2 p-2.5 rounded-xl border ${
                          guest.paid ? 'border-success/20 bg-success/5 opacity-50' : !guest.hasApp ? 'border-warning/20 bg-warning/5' : 'border-border bg-card'
                        }`}>
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[7px] font-bold ${
                            guest.paid ? 'bg-success/20 text-success' : guest.hasApp ? 'bg-info/20 text-info' : 'bg-warning/20 text-warning'
                          }`}>{guest.paid ? '✓' : guest.hasApp ? '📱' : '!'}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-medium truncate">{guest.name}</p>
                            <p className="text-[8px] text-muted-foreground">{guest.paid ? `Pago via ${guest.method}` : guest.hasApp ? 'Pagando pelo app' : 'Precisa do garçom'}</p>
                          </div>
                          <span className="text-[10px] font-bold">R$ {guestTotal}</span>
                          {!guest.paid && !guest.hasApp && (
                            <button onClick={() => { setSelectedGuest(guest.name); setPaymentStep('method'); }}
                              className="px-2 py-1 rounded-lg bg-primary text-primary-foreground text-[8px] font-bold">Cobrar</button>
                          )}
                        </div>
                      );
                    })}
                    <div className="rounded-xl border border-border p-2 flex items-center justify-between bg-muted/20">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-success rounded-full" style={{ width: `${paidPct}%` }} />
                        </div>
                        <span className="text-[8px] text-muted-foreground">{paidCount}/{guests.length} pagos</span>
                      </div>
                      <span className="font-display font-bold text-xs text-primary">Total: R$ {tableTotal}</span>
                    </div>
                  </div>
                )}

                {paymentStep === 'method' && (
                  <div className="space-y-2">
                    <button onClick={() => { setPaymentStep('guests'); setSelectedGuest(null); }} className="flex items-center gap-1 text-[9px] text-primary font-semibold">
                      <ChevronLeft className="w-3 h-3" /> Voltar
                    </button>
                    <div className="rounded-xl bg-gradient-to-br from-primary/10 to-accent/10 p-3 text-center">
                      <p className="text-[8px] uppercase text-muted-foreground">Mesa {selectedTable} · {selectedGuest}</p>
                      <p className="font-display text-2xl font-bold text-primary mt-1">
                        R$ {allOrders.filter(o => o.guestName === selectedGuest).reduce((a, o) => a + o.price * o.qty, 0) || Math.round(tableTotal * 0.25)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      {[
                        { id: 'tap', label: 'TAP to Pay (NFC)', desc: 'Encoste o cartão', highlight: true, icon: '📱' },
                        { id: 'pix', label: 'PIX QR Code', desc: 'Gere o QR', highlight: false, icon: '⚡' },
                        { id: 'card', label: 'Cartão (Chip)', desc: 'Maquininha', highlight: false, icon: '💳' },
                        { id: 'cash', label: 'Dinheiro', desc: 'Valor recebido', highlight: false, icon: '💵' },
                      ].map(m => (
                        <button key={m.id} onClick={() => setPaymentStep('processing')}
                          className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl border-2 transition-all ${
                            m.highlight ? 'border-primary bg-primary/5' : 'border-border bg-card'
                          }`}>
                          <span className="text-base">{m.icon}</span>
                          <div className="text-left flex-1">
                            <p className="text-[10px] font-semibold">{m.label}</p>
                            <p className="text-[8px] text-muted-foreground">{m.desc}</p>
                          </div>
                          {m.highlight && <span className="px-1 py-0.5 rounded bg-success/10 text-success text-[7px] font-bold">REC</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {paymentStep === 'processing' && (
                  <div className="text-center py-6 space-y-3">
                    <div className="relative w-20 h-20 mx-auto">
                      <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-ping" />
                      <div className="absolute inset-2 rounded-full border-4 border-primary/30 animate-pulse" />
                      <div className="absolute inset-4 rounded-full bg-primary/10 flex items-center justify-center">
                        <Smartphone className="w-6 h-6 text-primary" />
                      </div>
                    </div>
                    <div>
                      <p className="font-display font-bold text-sm">Aproxime o cartão</p>
                      <p className="text-[8px] text-muted-foreground mt-1">Peça ao cliente encostar o cartão no celular</p>
                    </div>
                    <div className="flex items-center gap-2 justify-center text-[8px] text-primary">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" /> Aguardando...
                    </div>
                    <div className="space-y-2 pt-2">
                      <button onClick={() => setPaymentStep('done')} className="w-full py-2.5 rounded-xl bg-success text-success-foreground font-semibold text-xs">Confirmar Pagamento</button>
                      <button onClick={() => setPaymentStep('method')} className="w-full py-2 rounded-xl border border-border text-[10px] text-muted-foreground">Trocar método</button>
                    </div>
                  </div>
                )}

                {paymentStep === 'done' && (
                  <div className="text-center py-6 space-y-2">
                    <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mx-auto">
                      <Check className="w-6 h-6 text-success" />
                    </div>
                    <p className="font-display font-bold text-success">Pagamento confirmado!</p>
                    <p className="text-[8px] text-muted-foreground">Mesa {selectedTable} · {selectedGuest}</p>
                    <div className="flex gap-2 justify-center pt-2">
                      <button className="px-3 py-1 rounded-lg border border-border text-[9px] font-semibold">Imprimir</button>
                      <button onClick={() => { setPaymentStep('guests'); setSelectedGuest(null); }}
                        className="px-3 py-1 rounded-lg bg-primary text-primary-foreground text-[9px] font-semibold">Próximo →</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* ═══ COZINHA ═══ */}
      {waiterTab === 'kitchen' && (
        <div className="space-y-2">
          {readyDishes.length > 0 && (
            <div className="flex items-center gap-2 p-2 rounded-xl bg-destructive/10 border border-destructive/20 animate-pulse">
              <ChefHat className="w-4 h-4 text-destructive" />
              <p className="text-[10px] font-bold text-destructive">{readyDishes.length} prato(s) para retirar!</p>
            </div>
          )}
          {readyDishes.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[8px] uppercase tracking-wider text-destructive font-bold px-1 flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" /> PRONTO
              </p>
              {readyDishes.map(dish => (
                <div key={dish.id} className="rounded-xl border-2 border-destructive/30 bg-destructive/5 p-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center font-display font-bold text-sm text-destructive">{dish.table}</div>
                    <div className="flex-1">
                      <p className="text-[10px] font-bold">{dish.qty}x {dish.dish}</p>
                      <p className="text-[8px] text-muted-foreground">{dish.chef} · {dish.readyAgo}min</p>
                    </div>
                    <button onClick={() => setPickedUp(prev => [...prev, dish.id])}
                      className="px-2.5 py-1.5 rounded-xl bg-destructive text-destructive-foreground text-[9px] font-bold shadow-lg">
                      Retirar ✓
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <p className="text-[8px] uppercase tracking-wider text-warning font-bold px-1 flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" /> PREPARANDO
            </p>
            {KITCHEN_PIPELINE.filter(d => d.status === 'preparing').map(dish => (
              <div key={dish.id} className="rounded-xl border border-border bg-card p-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-warning/10 flex items-center justify-center font-display font-bold text-sm text-warning">{dish.table}</div>
                  <div className="flex-1">
                    <p className="text-[10px] font-semibold">{dish.qty}x {dish.dish}</p>
                    <p className="text-[8px] text-muted-foreground">{dish.chef}</p>
                  </div>
                  <div className="w-12 text-right">
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-warning rounded-full" style={{ width: `${Math.min((dish.elapsed / dish.sla) * 100, 100)}%` }} />
                    </div>
                    <p className={`text-[7px] font-bold mt-0.5 ${dish.elapsed > dish.sla ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {dish.elapsed > dish.sla ? `+${dish.elapsed - dish.sla}min` : `${dish.sla - dish.elapsed}min`}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {pickedUp.length > 0 && (
            <div className="space-y-1">
              <p className="text-[8px] uppercase tracking-wider text-success font-bold px-1">✓ SERVIDO</p>
              {KITCHEN_PIPELINE.filter(d => pickedUp.includes(d.id)).map(dish => (
                <div key={dish.id} className="rounded-xl border border-success/20 bg-success/5 p-2 opacity-60">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-success/10 flex items-center justify-center text-success text-[10px] font-bold">{dish.table}</div>
                    <p className="text-[10px] text-muted-foreground">{dish.qty}x {dish.dish}</p>
                    <Check className="w-3.5 h-3.5 text-success ml-auto" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ COBRAR (global) ═══ */}
      {waiterTab === 'charge' && (
        <div className="space-y-2">
          {paymentStep === 'guests' && (
            <>
              <div className="rounded-xl bg-gradient-to-r from-primary/5 to-accent/5 border border-primary/10 p-2.5">
                <p className="text-[10px] font-semibold">Cobrança inteligente</p>
                <p className="text-[8px] text-muted-foreground mt-0.5">Quem pagou pelo app aparece automaticamente. Cobre apenas quem precisa.</p>
              </div>
              {myTables.map(table => {
                const guests = getAllGuests(table.number);
                const paidCount = guests.filter(g => g.paid).length;
                const needsWaiter = guests.filter(g => !g.paid && !g.hasApp);
                const waitingApp = guests.filter(g => !g.paid && g.hasApp);
                return (
                  <div key={table.id} className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="flex items-center gap-2 p-2.5 bg-muted/20 border-b border-border">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center font-display font-bold text-primary text-sm">{table.number}</div>
                      <div className="flex-1">
                        <p className="text-[10px] font-semibold">{table.customerName}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[8px] text-success font-medium">{paidCount} pago</span>
                          {waitingApp.length > 0 && <span className="text-[8px] text-info">· {waitingApp.length} no app</span>}
                          {needsWaiter.length > 0 && <span className="text-[8px] text-warning font-bold">· {needsWaiter.length} sem app</span>}
                        </div>
                      </div>
                      <div className="relative w-9 h-9">
                        <svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
                          <circle cx="18" cy="18" r="15" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
                          <circle cx="18" cy="18" r="15" fill="none" stroke="hsl(var(--success))" strokeWidth="3" strokeDasharray={`${(paidCount / guests.length) * 94} 94`} strokeLinecap="round" />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-[7px] font-bold">{paidCount}/{guests.length}</span>
                      </div>
                    </div>
                    <div className="p-1.5 space-y-0.5">
                      {guests.map((guest, i) => (
                        <div key={i} className={`flex items-center gap-2 p-1.5 rounded-lg ${
                          guest.paid ? 'opacity-40' : !guest.hasApp ? 'bg-warning/5 border border-warning/15' : ''
                        }`}>
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold ${
                            guest.paid ? 'bg-success/10 text-success' : guest.hasApp ? 'bg-info/10 text-info' : 'bg-warning/10 text-warning'
                          }`}>{guest.paid ? '✓' : guest.hasApp ? '📱' : '!'}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[9px] font-medium truncate">{guest.name}</p>
                            <p className="text-[7px] text-muted-foreground">{guest.paid ? `Pago via ${guest.method}` : guest.hasApp ? 'No app' : 'Sem app'}</p>
                          </div>
                          <span className="text-[9px] font-semibold">R$ {guest.orders.reduce((a: number, o: { price: number; qty: number }) => a + o.price * o.qty, 0)}</span>
                          {!guest.paid && !guest.hasApp && (
                            <button onClick={() => { setSelectedTable(table.number); setSelectedGuest(guest.name); setPaymentStep('method'); }}
                              className="px-1.5 py-0.5 rounded-lg bg-primary text-primary-foreground text-[7px] font-bold">Cobrar</button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {paymentStep === 'method' && (
            <div className="space-y-2">
              <button onClick={() => { setPaymentStep('guests'); setSelectedGuest(null); }} className="flex items-center gap-1 text-[9px] text-primary font-semibold">
                <ChevronLeft className="w-3 h-3" /> Voltar
              </button>
              <div className="rounded-xl bg-gradient-to-br from-primary/10 to-accent/10 p-3 text-center">
                <p className="text-[8px] uppercase text-muted-foreground">Mesa {selectedTable} · {selectedGuest}</p>
                <p className="font-display text-2xl font-bold text-primary mt-1">R$ {Math.round(Math.random() * 80 + 40)}</p>
              </div>
              <div className="space-y-1">
                {[
                  { id: 'tap', label: 'TAP to Pay (NFC)', desc: 'Encoste o cartão', highlight: true, icon: '📱' },
                  { id: 'pix', label: 'PIX QR Code', desc: 'Gere o QR', highlight: false, icon: '⚡' },
                  { id: 'card', label: 'Cartão (Chip)', desc: 'Maquininha', highlight: false, icon: '💳' },
                  { id: 'cash', label: 'Dinheiro', desc: 'Valor recebido', highlight: false, icon: '💵' },
                ].map(m => (
                  <button key={m.id} onClick={() => setPaymentStep('processing')}
                    className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl border-2 ${
                      m.highlight ? 'border-primary bg-primary/5' : 'border-border bg-card'
                    }`}>
                    <span className="text-base">{m.icon}</span>
                    <div className="text-left flex-1">
                      <p className="text-[10px] font-semibold">{m.label}</p>
                      <p className="text-[8px] text-muted-foreground">{m.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {paymentStep === 'processing' && (
            <div className="text-center py-6 space-y-3">
              <div className="relative w-20 h-20 mx-auto">
                <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-ping" />
                <div className="absolute inset-2 rounded-full border-4 border-primary/30 animate-pulse" />
                <div className="absolute inset-4 rounded-full bg-primary/10 flex items-center justify-center">
                  <Smartphone className="w-6 h-6 text-primary" />
                </div>
              </div>
              <p className="font-display font-bold text-sm">Aproxime o cartão</p>
              <div className="flex items-center gap-2 justify-center text-[8px] text-primary">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" /> Aguardando...
              </div>
              <div className="space-y-2 pt-2">
                <button onClick={() => setPaymentStep('done')} className="w-full py-2.5 rounded-xl bg-success text-success-foreground font-semibold text-xs">Confirmar Pagamento</button>
                <button onClick={() => setPaymentStep('method')} className="w-full py-2 rounded-xl border border-border text-[10px] text-muted-foreground">Trocar método</button>
              </div>
            </div>
          )}

          {paymentStep === 'done' && (
            <div className="text-center py-6 space-y-2">
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mx-auto">
                <Check className="w-6 h-6 text-success" />
              </div>
              <p className="font-display font-bold text-success">Pagamento confirmado!</p>
              <p className="text-[8px] text-muted-foreground">Mesa {selectedTable} · {selectedGuest}</p>
              <div className="flex gap-2 justify-center pt-2">
                <button className="px-3 py-1 rounded-lg border border-border text-[9px] font-semibold">Imprimir</button>
                <button onClick={() => { setPaymentStep('guests'); setSelectedGuest(null); setSelectedTable(null); }}
                  className="px-3 py-1 rounded-lg bg-primary text-primary-foreground text-[9px] font-semibold">Próximo →</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const MobileMenu: React.FC = () => {
  const { menu } = useDemoContext();
  const categories = useMemo(() => [...new Set(menu.map(item => item.category))], [menu]);
  const [category, setCategory] = useState(categories[0] ?? '');
  const items = menu.filter(item => item.category === category);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {categories.map(item => (
          <button key={item} onClick={() => setCategory(item)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-semibold ${category === item ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            {item}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
            <img src={item.image} alt={item.name} className="h-14 w-14 rounded-xl object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{item.name}</p>
              <p className="line-clamp-2 text-[11px] text-muted-foreground">{item.description}</p>
            </div>
            <span className="text-xs font-semibold text-primary">R$ {item.price}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const MobileTeam: React.FC = () => (
  <div className="space-y-2">
    {TEAM_MEMBERS.map(member => (
      <div key={member.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
        <img src={member.avatar} alt={member.name} className="h-10 w-10 rounded-full object-cover" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{member.name}</p>
          <p className="text-[11px] text-muted-foreground">{member.role} · {member.shift}</p>
        </div>
        <span className={`text-[10px] font-semibold ${member.status === 'online' ? 'text-success' : 'text-muted-foreground'}`}>{member.status === 'online' ? 'Ativo' : 'Folga'}</span>
      </div>
    ))}
  </div>
);

const MobileAnalytics: React.FC = () => {
  const { analytics } = useDemoContext();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <CompactStat label="Receita" value="R$ 77.5k" tone="success" />
        <CompactStat label="Pedidos" value="312" tone="primary" />
        <CompactStat label="Satisfação" value={String(analytics.customerSatisfaction)} tone="warning" />
        <CompactStat label="Recorrência" value={`${analytics.returningCustomers}%`} tone="info" />
      </div>
      <MobileSection title="Top vendidos">
        <div className="space-y-2">
          {analytics.topItems.map((item, index) => (
            <div key={item.name} className="flex items-center justify-between rounded-2xl border border-border bg-card p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-xs font-bold text-primary">#{index + 1}</div>
                <div>
                  <p className="text-sm font-semibold">{item.name}</p>
                  <p className="text-[11px] text-muted-foreground">{item.quantity} vendidos</p>
                </div>
              </div>
              <TrendingUp className="h-4 w-4 text-success" />
            </div>
          ))}
        </div>
      </MobileSection>
    </div>
  );
};

const MobileManager: React.FC<{ onNavigate: (screen: string) => void }> = ({ onNavigate }) => {
  const { analytics, orders } = useDemoContext();
  const lateOrders = orders.filter(order => !['delivered', 'paid'].includes(order.status) && getElapsedMinutes(order.createdAt) > 15);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <CompactStat label="Pedidos ativos" value={String(orders.filter(o => !['delivered', 'paid'].includes(o.status)).length)} tone="primary" />
        <CompactStat label="Aprovações" value={String(PENDING_APPROVALS.length)} tone="warning" />
        <CompactStat label="Equipe ativa" value={String(TEAM_MEMBERS.filter(t => t.status === 'online').length)} tone="info" />
        <CompactStat label="Receita" value={`R$ ${analytics.todayRevenue.toLocaleString()}`} tone="success" />
      </div>
      {lateOrders.length ? (
        <button onClick={() => onNavigate('orders')} className="flex w-full items-center gap-2 rounded-2xl border border-destructive/20 bg-destructive/5 px-3 py-3 text-left text-xs font-semibold text-destructive">
          <AlertCircle className="h-4 w-4" />
          {lateOrders.length} pedidos com atraso
        </button>
      ) : null}
      <button onClick={() => onNavigate('approvals')} className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-3 py-3 text-left">
        <div>
          <p className="text-xs font-semibold">Central de aprovações</p>
          <p className="text-[11px] text-muted-foreground">Cancelamentos, cortesias e estornos</p>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </button>
      <MobileTeam />
    </div>
  );
};

const MobileApprovals: React.FC = () => {
  const [handled, setHandled] = useState<string[]>([]);
  return (
    <div className="space-y-2">
      {PENDING_APPROVALS.map(item => {
        const done = handled.includes(item.id);
        return (
          <div key={item.id} className={`rounded-2xl border p-3 ${done ? 'border-success/20 bg-success/5' : 'border-border bg-card'}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{item.item}</p>
                <p className="text-[11px] text-muted-foreground">Mesa {item.table} · {item.requestedBy}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{item.reason}</p>
              </div>
              <span className="text-xs font-semibold text-destructive">R$ {item.amount}</span>
            </div>
            {!done ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={() => setHandled(prev => [...prev, item.id])} className="rounded-2xl bg-success px-3 py-2.5 text-xs font-semibold text-success-foreground">Aprovar</button>
                <button onClick={() => setHandled(prev => [...prev, item.id])} className="rounded-2xl bg-destructive/10 px-3 py-2.5 text-xs font-semibold text-destructive">Recusar</button>
              </div>
            ) : <div className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-success"><CheckCircle2 className="h-4 w-4" /> Processado</div>}
          </div>
        );
      })}
    </div>
  );
};

const MobileBarman: React.FC = () => <MobileKDS view="bar" />;
const MobileCook: React.FC = () => <MobileKDS view="kitchen" />;

const MobileRecipes: React.FC = () => (
  <div className="space-y-2">
    {DRINK_RECIPES.map(recipe => (
      <div key={recipe.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
        <img src={recipe.image} alt={recipe.name} className="h-14 w-14 rounded-xl object-cover" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{recipe.name}</p>
          <p className="text-[11px] text-muted-foreground">{recipe.glass} · {recipe.prepTime}min</p>
        </div>
        <span className="text-xs font-semibold text-primary">R$ {recipe.price}</span>
      </div>
    ))}
  </div>
);

const MobileStock: React.FC = () => (
  <div className="space-y-2">
    {STOCK_ITEMS.map(item => (
      <div key={item.id} className="rounded-2xl border border-border bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">{item.name}</p>
            <p className="text-[11px] text-muted-foreground">{item.category}</p>
          </div>
          <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${item.status === 'critical' ? 'bg-destructive/10 text-destructive' : item.status === 'low' ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}>{item.current} {item.unit}</span>
        </div>
      </div>
    ))}
  </div>
);

const MobileCalls: React.FC = () => <MobileWaiter initialTab="live" />;
const MobilePayment: React.FC = () => <MobileWaiter initialTab="charge" />;
const MobileActions: React.FC = () => <MobileWaiter initialTab="live" />;

const MobileWaiterAssist: React.FC<{ onNavigate: (screen: string) => void }> = ({ onNavigate }) => {
  return <WaiterAssistScreen onNavigate={onNavigate} />;
};

const MobileTips: React.FC = () => (
  <div className="space-y-4">
    <CompactStat label="Gorjetas do dia" value="R$ 410" tone="success" />
    <div className="space-y-2">
      {[
        { table: 8, customer: 'Grupo Aniversário', amount: 120, pct: '15%' },
        { table: 5, customer: 'Grupo Pedro', amount: 85, pct: '12%' },
        { table: 10, customer: 'Carlos M.', amount: 98, pct: '10%' },
        { table: 3, customer: 'João & Ana', amount: 62, pct: '10%' },
        { table: 1, customer: 'Maria S.', amount: 45, pct: '15%' },
      ].map((tip, index) => (
        <div key={index} className="flex items-center justify-between rounded-2xl border border-border bg-card p-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-success/10 flex items-center justify-center text-[10px] font-bold text-success">{tip.table}</div>
            <div>
              <p className="text-sm font-semibold">{tip.customer}</p>
              <p className="text-[10px] text-muted-foreground">{tip.pct} da conta</p>
            </div>
          </div>
          <span className="text-xs font-semibold text-success">+R$ {tip.amount}</span>
        </div>
      ))}
    </div>
  </div>
);

const MobileFloorFlow: React.FC = () => {
  const { reservations, tables } = useDemoContext();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <CompactStat label="Fila estimada" value="25min" tone="warning" />
        <CompactStat label="Mesas livres" value={String(tables.filter(t => t.status === 'available').length)} tone="success" />
      </div>
      <MobileSection title="Fluxo atual">
        <div className="space-y-2">
          {reservations.slice(0, 4).map(item => (
            <div key={item.id} className="rounded-2xl border border-border bg-card p-3">
              <p className="text-sm font-semibold">{item.customerName}</p>
              <p className="text-[11px] text-muted-foreground">{item.time} · {item.partySize} pessoas · {reservationStatusLabel[item.status] || item.status}</p>
            </div>
          ))}
        </div>
      </MobileSection>
    </div>
  );
};

const MobileDailyReport: React.FC = () => {
  const { analytics } = useDemoContext();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <CompactStat label="Receita dia" value={`R$ ${analytics.todayRevenue.toLocaleString()}`} tone="success" />
        <CompactStat label="Pedidos" value={String(analytics.todayOrders)} tone="primary" />
      </div>
      <div className="rounded-3xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">Fechamento operacional</p>
        <div className="mt-3 space-y-2">
          {['Caixa conciliado', 'Equipe encerrada', 'Estoque revisado', 'Pendências zeradas'].map(item => (
            <div key={item} className="flex items-center gap-2 text-[11px] text-foreground">
              <Check className="h-4 w-4 text-success" /> {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const MobileWelcome: React.FC<{ onSelectRole?: (role: StaffRole) => void }> = ({ onSelectRole }) => (
  <div className="space-y-4">
    <div className="rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-secondary/5 to-accent/10 p-4">
      <p className="text-xs font-semibold text-primary">DEMO INTERATIVA</p>
      <h2 className="mt-2 font-display text-xl font-bold text-foreground">Bistrô Noowe</h2>
      <p className="mt-1 text-[11px] text-muted-foreground">Escolha o papel e veja a operação sob a ótica de cada equipe.</p>
    </div>
    <div className="grid grid-cols-2 gap-2">
      {ROLE_CONFIG.map(role => (
        <button key={role.id} onClick={() => onSelectRole?.(role.id)} className={`rounded-2xl border border-border bg-gradient-to-br ${role.gradient} p-3 text-left`}>
          <span className="text-lg">{role.emoji}</span>
          <p className="mt-2 text-xs font-semibold">{role.label}</p>
          <p className="text-[10px] text-muted-foreground">{role.desc}</p>
        </button>
      ))}
    </div>
  </div>
);

const MobileSetup: React.FC<{ onNavigate: (screen: string) => void }> = ({ onNavigate }) => {
  const STEPS = [
    { id: '1', title: 'Informações Básicas', desc: 'Nome, endereço, horário', icon: '🏪', required: true, done: true },
    { id: '2', title: 'Configurar Cardápio', desc: 'Categorias e pratos', icon: '🍽️', required: true, done: true },
    { id: '3', title: 'Configurar Mesas', desc: 'Layout do salão', icon: '🪑', required: true, done: false },
    { id: '4', title: 'Sistema de Reservas', desc: 'Capacidade e horários', icon: '📅', required: true, done: false },
    { id: '5', title: 'Pagamentos', desc: 'Métodos e taxas', icon: '💳', required: true, done: false },
    { id: '6', title: 'Equipe e Funções', desc: '7 roles disponíveis', icon: '👥', required: false, done: false },
    { id: '7', title: 'Gorjetas', desc: 'Distribuição', icon: '⭐', required: false, done: false },
    { id: '8', title: 'Integrações', desc: 'Delivery e externos', icon: '🔗', required: false, done: false },
  ];
  const req = STEPS.filter(s => s.required);
  const opt = STEPS.filter(s => !s.required);
  const doneReq = req.filter(s => s.done).length;
  const pct = Math.round((doneReq / req.length) * 100);

  return (
    <div className="space-y-4">
      {/* Progress header */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-lg">🚀</div>
          <div className="flex-1">
            <p className="text-sm font-bold text-foreground">Configuração do Restaurante</p>
            <p className="text-[10px] text-muted-foreground">{doneReq}/{req.length} passos obrigatórios</p>
          </div>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Required */}
      <p className="text-[10px] font-bold text-destructive uppercase tracking-wider flex items-center gap-1">⚠️ Obrigatórios</p>
      {req.map(s => (
        <div key={s.id} className={`flex items-center gap-3 p-3 rounded-2xl border ${s.done ? 'bg-green-500/5 border-green-500/20' : 'bg-card border-border'}`}>
          <span className="text-xl">{s.icon}</span>
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-semibold ${s.done ? 'line-through text-green-600' : ''}`}>{s.title}</p>
            <p className="text-[10px] text-muted-foreground">{s.desc}</p>
          </div>
          {s.done ? <span className="text-green-500 text-sm">✓</span> : <span className="text-muted-foreground/40 text-sm">○</span>}
        </div>
      ))}

      {/* Optional */}
      <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider flex items-center gap-1">⭐ Opcionais</p>
      {opt.map(s => (
        <div key={s.id} className="flex items-center gap-3 p-3 rounded-2xl border border-border bg-card">
          <span className="text-xl">{s.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold">{s.title}</p>
            <p className="text-[10px] text-muted-foreground">{s.desc}</p>
          </div>
          <span className="text-muted-foreground/40 text-sm">○</span>
        </div>
      ))}

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => onNavigate('config-hub')} className="rounded-2xl border border-border bg-muted/30 px-3 py-3 text-[10px] font-semibold">⚙️ Config Hub</button>
        <button onClick={() => onNavigate('dashboard')} className="rounded-2xl bg-primary px-3 py-3 text-[10px] font-semibold text-primary-foreground">📊 Dashboard</button>
      </div>
    </div>
  );
};

export const MobileRestaurantScreen: React.FC<{
  screen: RestaurantScreen;
  activeRole: StaffRole;
  onNavigate: (screen: string) => void;
  onSelectRole: (role: StaffRole) => void;
}> = ({ screen, activeRole, onNavigate, onSelectRole }) => {
  const { t, translateText } = useDemoI18n();
  const title = translateText(SCREEN_INFO[screen]?.title || '');

  return (
    <div className="space-y-4 px-4 pb-4 pt-1">
      <div className="rounded-2xl border border-border bg-card px-3 py-2">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{translateText('Modo mobile')}</p>
        <p className="mt-1 text-sm font-semibold text-foreground">{title}</p>
      </div>

      {screen === 'welcome' && <MobileWelcome onSelectRole={onSelectRole} />}
      {screen === 'setup' && <MobileSetup onNavigate={onNavigate} />}
      {screen === 'dashboard' && <MobileDashboard onNavigate={onNavigate} />}
      {screen === 'table-map' && <MobileTableMap />}
      {screen === 'orders' && <MobileOrders />}
      {screen === 'kds-kitchen' && <MobileKDS view="kitchen" />}
      {screen === 'kds-bar' && <MobileKDS view="bar" />}
      {screen === 'maitre' && <MobileMaitre />}
      {screen === 'waiter' && <MobileWaiter />}
      {screen === 'menu-editor' && <MobileMenu />}
      {screen === 'team' && <MobileTeam />}
      {screen === 'analytics' && <MobileAnalytics />}
      {screen === 'manager-ops' && <MobileManager onNavigate={onNavigate} />}
      {screen === 'approvals' && <MobileApprovals />}
      {screen === 'barman-station' && <MobileBarman />}
      {screen === 'drink-recipes' && <MobileRecipes />}
      {screen === 'cook-station' && <MobileCook />}
      {screen === 'stock' && <MobileStock />}
      {screen === 'waiter-calls' && <MobileCalls />}
      {screen === 'waiter-tips' && <MobileTips />}
      {screen === 'waiter-payment' && <MobilePayment />}
      {screen === 'waiter-actions' && <MobileActions />}
      {screen === 'waiter-assist' && <MobileWaiterAssist onNavigate={onNavigate} />}
      {screen === 'waiter-table-detail' && <MobileWaiter />}
      {screen === 'floor-flow' && <MobileFloorFlow />}
      {screen === 'daily-report' && <MobileDailyReport />}
      {screen === 'config-hub' && <ConfigHub onNavigate={onNavigate} />}
      {screen === 'config-profile' && <ConfigProfile onNavigate={onNavigate} />}
      {screen === 'config-service-types' && <ConfigServiceTypes onNavigate={onNavigate} />}
      {screen === 'config-experience' && <ConfigExperience onNavigate={onNavigate} />}
      {screen === 'config-floor' && <ConfigFloor onNavigate={onNavigate} />}
      {screen === 'config-menu' && <ConfigMenu onNavigate={onNavigate} />}
      {screen === 'config-team' && <ConfigTeam onNavigate={onNavigate} activeRole={activeRole} />}
      {screen === 'config-kitchen' && <ConfigKitchen onNavigate={onNavigate} />}
      {screen === 'config-payments' && <ConfigPayments onNavigate={onNavigate} />}
      {screen === 'config-features' && <ConfigFeatures onNavigate={onNavigate} />}
      {screen === 'config-language' && <ConfigLanguageScreen />}
      {screen === 'config-notifications' && <ConfigNotificationsScreen />}
      {screen === 'financial-dashboard' && <FinancialDashboardScreen />}
      {screen === 'cash-register' && <CashRegisterScreen />}
      {screen === 'fiscal' && <FiscalScreen />}
      {screen === 'cost-control' && <CostControlScreen />}
      {screen === 'forecast' && <ForecastScreen />}
      {screen === 'chef-approvals' && <ChefApprovalsScreen />}
      {screen === 'chef-table' && <ChefTableScreen />}
      {screen === 'kds-analytics' && <KdsAnalyticsScreen />}
      {screen === 'kds-brain-config' && <KdsBrainConfigScreen />}
      {screen === 'crm' && <CrmScreen />}
      {screen === 'hr' && <HrScreen />}
      {screen === 'integrations' && <IntegrationsScreen />}
      {screen === 'loyalty-mgmt' && <LoyaltyMgmtScreen />}
      {screen === 'promotions-mgmt' && <PromotionsMgmtScreen />}
      {screen === 'qr-codes' && <QrCodesScreen />}
      {screen === 'tap-to-pay' && <TapToPayScreen />}
      {screen === 'reports' && <ReportsScreen />}
      {screen === 'reviews-mgmt' && <ReviewsMgmtScreen />}
      {screen === 'reservations-mgmt' && <ReservationsMgmtScreen />}
      {screen === 'club-door' && <ClubDoorScreen />}
      {screen === 'club-queue-mgmt' && <ClubQueueMgmtScreen />}
      {screen === 'club-promoter' && <ClubPromoterScreen />}
      {screen === 'club-vip-mgmt' && <ClubVipMgmtScreen />}
      {screen === 'drive-thru-mgmt' && <DriveThruMgmtScreen />}
      {screen === 'food-truck-mgmt' && <FoodTruckMgmtScreen />}
      {screen === 'scanner' && <QRScannerStaffScreen />}
      {screen === 'station-settings' && <StationSettingsScreen />}
      {screen === 'maitre-dashboard' && <MaitreDashboardScreen />}
      {screen === 'restaurant-settings' && <RestaurantSettingsExtScreen />}

      <div className="rounded-2xl border border-border bg-card p-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{translateText('Perfil ativo')}</p>
        <p className="mt-1 text-xs font-semibold text-foreground">{t('roles', activeRole)}</p>
      </div>
    </div>
  );
};
