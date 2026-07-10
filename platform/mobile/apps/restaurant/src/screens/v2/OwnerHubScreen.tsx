import React, { ComponentType, useState } from 'react';
import {
  Alert,
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  TextInput,
} from 'react-native';
import { Text } from 'react-native-paper';
import {
  AlertCircle,
  ArrowRight,
  ArrowDown,
  Clock,
  CheckCircle,
  CreditCard as CreditCardIcon,
  Phone,
  Package,
  QrCode,
  Settings,
  Zap,
  UtensilsCrossed,
  Users,
  BarChart,
  ChefHat,
  LogOut,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { authService } from '@/shared/services/auth';
import { V2_TONE, V2Tone } from './shared/v2Theme';
import { V2StatusBadge } from './shared/V2StatusBadge';
import { orderStatusLabel, orderStatusTone } from './shared/v2Types';
import {
  elapsedLabel,
  shortOrderId,
  useCashMovements,
  useCashRegister,
  useDashboardSnapshot,
  useKdsOrders,
  useMenuItems,
  usePromotions,
  useReservations,
  useRestaurantOrders,
  useRestaurantTables,
  useServiceCalls,
  useStaff,
  useStock,
  useTableBills,
  type V2Table,
} from './shared/useRestaurantOperations';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import ApiService from '@okinawa/shared/services/api';
import type { TabOrder } from './shared/v2Types';
import {
  ChefRoleView,
  BarmanRoleView,
  CookRoleView,
  MaitreRoleView,
  ManagerRoleView,
  WaiterRoleView,
  useRestaurantRole,
} from '../../contexts/RestaurantRoleContext';

const OWNER_ROLES = [
  { id: 'owner', label: 'Dono', title: 'Dashboard Executivo', hint: 'Visão completa do restaurante' },
  { id: 'manager', label: 'Gerente', title: 'Operação do Turno', hint: 'Pedidos, equipe e sala' },
  { id: 'maitre', label: 'Maître', title: 'Sala e Reservas', hint: 'Fila, reservas e mesas' },
  { id: 'chef', label: 'Chef', title: 'Chef Executivo', hint: 'KDS, tempos e qualidade' },
  { id: 'barman', label: 'Barman', title: 'Bar KDS', hint: 'Drinks e bebidas' },
  { id: 'cook', label: 'Cozinheiro', title: 'Estação de Preparo', hint: 'Fila da sua praça' },
  { id: 'waiter', label: 'Garçom', title: 'Atendimento', hint: 'Mesas e chamados' },
] as const;

type RoleId = (typeof OWNER_ROLES)[number]['id'];

const TABLE_STATUS_LABEL: Record<V2Table['status'], string> = {
  available: 'Livre',
  occupied: 'Ocupada',
  reserved: 'Reserva',
  cleaning: 'Limpeza',
  payment: 'Conta',
  blocked: 'Bloqueada',
};

const TABLE_STATUS_TONE: Record<V2Table['status'], V2Tone> = {
  available: 'success',
  occupied: 'danger',
  reserved: 'warning',
  cleaning: 'warning',
  payment: 'info',
  blocked: 'danger',
};

const RESERVATION_STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmada',
  seated: 'Sentada',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

const RESERVATION_STATUS_TONE: Record<string, V2Tone> = {
  pending: 'warning',
  confirmed: 'info',
  seated: 'success',
  completed: 'success',
  cancelled: 'danger',
};

export default function OwnerHubScreen() {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const {
    role,
    setRole,
    managerView,
    setManagerView,
    maitreView,
    setMaitreView,
    chefView,
    barmanView,
    cookView,
    waiterView,
  } = useRestaurantRole();

  const selectedRole = React.useMemo(
    () => OWNER_ROLES.find((r) => r.id === role) ?? OWNER_ROLES[0],
    [role],
  );
  const headerTitle =
    role === 'manager'
      ? managerViewTitle(managerView)
      : role === 'maitre'
        ? maitreViewTitle(maitreView)
        : role === 'chef'
          ? chefViewTitle(chefView)
          : role === 'barman'
            ? barmanViewTitle(barmanView)
            : role === 'cook'
              ? cookViewTitle(cookView)
              : role === 'waiter'
                ? waiterViewTitle(waiterView)
          : selectedRole.title;

  const isOwner = role === 'owner';

  const openScreen = (screen: string) => {
    navigation.navigate(screen);
  };

  const handleSignOut = () => {
    Alert.alert('Sair da conta', 'Deseja encerrar sua sessão neste dispositivo?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: () => {
          void authService.logout();
        },
      },
    ]);
  };

  return (
    <ScreenContainer edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.headerCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View style={styles.headerTop}>
            <View style={styles.headerText}>
              <Text style={[styles.eyebrow, { color: colors.foregroundSecondary }]}>MODO MOBILE</Text>
              <Text style={[styles.headerTitle, { color: colors.foreground }]}>{headerTitle}</Text>
              <Text style={[styles.headerHint, { color: colors.foregroundSecondary }]}>{selectedRole.hint}</Text>
            </View>
            <TouchableOpacity
              onPress={handleSignOut}
              style={[styles.signOutButton, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}
              accessibilityRole="button"
              accessibilityLabel="Sair da conta"
            >
              <LogOut size={16} color={colors.error} strokeWidth={2.4} />
              <Text style={[styles.signOutText, { color: colors.error }]}>Sair</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.rolePicker, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.roleScrollContent}>
              {OWNER_ROLES.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => setRole(item.id)}
                  style={[
                    styles.roleChip,
                    role === item.id && { backgroundColor: colors.primary },
                  ]}
                >
                  <Text
                    style={[
                      styles.roleChipText,
                      { color: role === item.id ? '#FFF' : colors.foreground },
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View pointerEvents="none" style={styles.roleScrollHint}>
              <View style={[styles.roleScrollHintIcon, { backgroundColor: `${colors.primary}22` }]}>
                <ArrowRight size={13} color={colors.primary} strokeWidth={2.6} />
              </View>
            </View>
          </View>
        </View>

        {isOwner ? (
          <DashboardTab onNavigate={openScreen} colors={colors} />
        ) : role === 'manager' ? (
          <ManagerContent
            view={managerView}
            setView={setManagerView}
            onNavigate={openScreen}
            colors={colors}
          />
        ) : role === 'maitre' ? (
          <MaitreContent
            view={maitreView}
            setView={setMaitreView}
            colors={colors}
          />
        ) : role === 'chef' ? (
          <ChefContent
            view={chefView}
            colors={colors}
          />
        ) : role === 'barman' ? (
          <BarmanContent
            view={barmanView}
            colors={colors}
          />
        ) : role === 'cook' ? (
          <CookContent
            view={cookView}
            colors={colors}
          />
        ) : role === 'waiter' ? (
          <WaiterContent
            view={waiterView}
            colors={colors}
          />
        ) : (
          <>
            <RolePlaceholder role={selectedRole} colors={colors} onNavigate={openScreen} />
            <View style={[styles.roleHint, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={{ color: colors.foregroundSecondary, fontSize: 12, fontWeight: '600' }}>
                Nav de {selectedRole.label} — acesse telas pelo menu inferior
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

type IconComponent = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

function managerViewTitle(view: ManagerRoleView) {
  const titles: Record<ManagerRoleView, string> = {
    'manager-ops': 'Painel Operacional',
    'manager-orders': 'Gestão de Pedidos',
    'manager-approvals': 'Central de Aprovações',
    'manager-cash': 'Controle de Caixa',
    'manager-tables': 'Mapa de Mesas',
    'manager-staff': 'Gestão de Equipe',
    'manager-report': 'Relatório do Dia',
    'manager-stock': 'Controle de Estoque',
    'manager-promotions': 'Promoções & Campanhas',
    'manager-qr': 'QR Codes',
    'manager-settings': 'Central de Configuração',
  };
  return titles[view];
}

function maitreViewTitle(view: MaitreRoleView) {
  const titles: Record<MaitreRoleView, string> = {
    'maitre-reservations': 'Painel do Maître',
    'maitre-flow': 'Fluxo do Salão',
    'maitre-tables': 'Mapa de Mesas',
    'maitre-management': 'Gestão de Reservas',
  };
  return titles[view];
}

function chefViewTitle(view: ChefRoleView) {
  const titles: Record<ChefRoleView, string> = {
    'chef-kds': 'KDS — Cozinha',
    'chef-approvals': 'Aprovações do Chef',
    'chef-analytics': 'KDS Analytics',
    'chef-cost': 'Custo & Margem',
    'chef-menu': 'Editor de Cardápio',
    'chef-stock': 'Controle de Estoque',
  };
  return titles[view];
}

function barmanViewTitle(view: BarmanRoleView) {
  const titles: Record<BarmanRoleView, string> = {
    'barman-station': 'Estação do Barman',
    'bar-kds': 'KDS — Bar',
    'bar-recipes': 'Receitas de Drinks',
    'bar-stock': 'Controle de Estoque',
  };
  return titles[view];
}

function cookViewTitle(view: CookRoleView) {
  const titles: Record<CookRoleView, string> = {
    'cook-station': 'Estação de Preparo',
    'cook-kds': 'KDS Cozinha',
  };
  return titles[view];
}

function waiterViewTitle(view: WaiterRoleView) {
  const titles: Record<WaiterRoleView, string> = {
    waiter: 'Visão do Garçom',
    'waiter-calls': 'Chamados de Clientes',
    'waiter-table-actions': 'Ações na Mesa',
    'waiter-assistance': 'Assistência ao Cliente',
    'waiter-table-charge': 'Cobrar na Mesa',
    'waiter-tap-to-pay': 'TAP to Pay',
    'waiter-order-management': 'Gestão de Pedidos',
    'waiter-table-map': 'Mapa de Mesas',
    'waiter-tips': 'Minhas Gorjetas',
  };
  return titles[view];
}



const MANAGER_CONFIG = [
  ['Perfil do Restaurante', 'Nome, logo, fotos, contato', UtensilsCrossed, 'danger'],
  ['Tipos de Serviço', '11 modelos de operação', UtensilsCrossed, 'success'],
  ['Experiência do Cliente', 'Reservas, fila, QR, pedidos', Zap, 'danger'],
  ['Mapa do Salão', 'Mesas, zonas, áreas VIP', Users, 'warning'],
  ['Cardápio', 'Categorias, itens, preços', Package, 'danger'],
  ['Equipe & Permissões', 'Cargos, escalas, acesso', Users, 'danger'],
  ['Cozinha & Bar', 'Estações, KDS, receitas', UtensilsCrossed, 'warning'],
  ['Pagamentos', 'Taxa, gorjeta, split, métodos', CreditCardIcon, 'danger'],
] as const;


function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value);
}

function DashboardTab({ onNavigate, colors }: { onNavigate: (s: string) => void; colors: ReturnType<typeof useColors> }) {
  const { data: snapshot, loading: snapshotLoading, error: snapshotError, refresh: refreshSnapshot } = useDashboardSnapshot();
  const { data: recentOrders, loading: ordersLoading, error: ordersError, refresh: refreshOrders } = useRestaurantOrders();
  const quickActions: { title: string; detail: string; screen: string; icon: IconComponent }[] = [
    { title: 'Cardápio', detail: 'Gerenciar itens', screen: 'Menu', icon: UtensilsCrossed },
    { title: 'Equipe', detail: 'Staff e turnos', screen: 'Staff', icon: Users },
    { title: 'Financeiro', detail: 'Receita e custos', screen: 'Financial', icon: CreditCardIcon },
    { title: 'Relatórios', detail: 'Métricas', screen: 'Reports', icon: BarChart },
  ];
  const occupancy = snapshot?.tables.total
    ? Math.round((snapshot.tables.occupied / snapshot.tables.total) * 100)
    : 0;
  const averageTicket = snapshot?.orders_today
    ? snapshot.revenue_today / snapshot.orders_today
    : 0;

  return (
    <View style={styles.section}>
      <View style={[styles.banner, { backgroundColor: V2_TONE.danger.bg }]}>
        <Text style={{ color: V2_TONE.danger.text, fontSize: 11 }}>
          Resumo executivo otimizado para leitura rápida no celular.
        </Text>
      </View>
      <View style={styles.metricGrid}>
        <Metric value={snapshotLoading ? '...' : formatCurrency(snapshot?.revenue_today ?? 0)} label="Receita Hoje" tone="success" />
        <Metric value={snapshotLoading ? '...' : String(snapshot?.active_orders ?? 0)} label="Pedidos Ativos" tone="danger" />
        <Metric value={snapshotLoading ? '...' : `${occupancy}%`} label="Ocupação" tone="warning" />
        <Metric value={snapshotLoading ? '...' : formatCurrency(averageTicket)} label="Ticket Médio" tone="info" />
      </View>
      {snapshotError ? (
        <InlineNotice message={snapshotError} actionLabel="Recarregar" onPress={() => void refreshSnapshot()} colors={colors} />
      ) : null}
      <SectionTitle title="Ações rápidas" subtitle="Atalhos para o que importa agora" colors={colors} />
      <View style={styles.metricGrid}>
        {quickActions.map((action) => (
          <QuickAction
            key={action.title}
            title={action.title}
            detail={action.detail}
            icon={action.icon}
            onPress={() => onNavigate(action.screen)}
            colors={colors}
          />
        ))}
      </View>
      <SectionTitle title="Pedidos recentes" colors={colors} />
      {ordersLoading ? (
        <InlineNotice message="Carregando pedidos recentes..." colors={colors} />
      ) : ordersError ? (
        <InlineNotice message={ordersError} actionLabel="Recarregar" onPress={() => void refreshOrders()} colors={colors} />
      ) : recentOrders.length === 0 ? (
        <InlineNotice message="Nenhum pedido recente." colors={colors} />
      ) : (
        recentOrders.slice(0, 3).map((order) => (
          <CompactOrder key={order.id} order={order} colors={colors} />
        ))
      )}
    </View>
  );
}

function ManagerContent({
  view,
  setView,
  onNavigate,
  colors,
}: {
  view: ManagerRoleView;
  setView: (view: ManagerRoleView) => void;
  onNavigate: (s: string) => void;
  colors: ReturnType<typeof useColors>;
}) {
  if (view === 'manager-orders') return <ManagerOrdersView colors={colors} />;
  if (view === 'manager-approvals') return <ManagerApprovalsView colors={colors} />;
  if (view === 'manager-cash') return <ManagerCashView colors={colors} />;
  if (view === 'manager-tables') return <ManagerTablesView colors={colors} />;
  if (view === 'manager-staff') return <ManagerStaffView colors={colors} />;
  if (view === 'manager-report') return <ManagerReportView colors={colors} />;
  if (view === 'manager-stock') return <ManagerStockView colors={colors} />;
  if (view === 'manager-promotions') return <ManagerPromotionsView colors={colors} />;
  if (view === 'manager-qr') return <ManagerQrView colors={colors} onNavigate={onNavigate} />;
  if (view === 'manager-settings') return <ManagerSettingsView colors={colors} setView={setView} />;
  return <ManagerDashboardTab setView={setView} onNavigate={onNavigate} colors={colors} />;
}

function MaitreContent({
  view,
  colors,
}: {
  view: MaitreRoleView;
  setView: (view: MaitreRoleView) => void;
  colors: ReturnType<typeof useColors>;
}) {
  if (view === 'maitre-flow') return <MaitreFlowView colors={colors} />;
  if (view === 'maitre-tables') return <MaitreTablesView colors={colors} />;
  if (view === 'maitre-management') return <MaitreManagementView colors={colors} />;
  return <MaitreReservationsView colors={colors} />;
}

function ChefContent({
  view,
  colors,
}: {
  view: ChefRoleView;
  colors: ReturnType<typeof useColors>;
}) {
  if (view === 'chef-approvals') return <ChefApprovalsView colors={colors} />;
  if (view === 'chef-analytics') return <ChefAnalyticsView colors={colors} />;
  if (view === 'chef-cost') return <ChefCostView colors={colors} />;
  if (view === 'chef-menu') return <ChefMenuView colors={colors} />;
  if (view === 'chef-stock') return <ChefStockView colors={colors} />;
  return <ChefKdsView colors={colors} />;
}

function BarmanContent({
  view,
  colors,
}: {
  view: BarmanRoleView;
  colors: ReturnType<typeof useColors>;
}) {
  if (view === 'bar-recipes') return <BarmanRecipesView colors={colors} />;
  if (view === 'bar-stock') return <BarmanStockView colors={colors} />;
  return <BarmanQueueView colors={colors} mode={view === 'bar-kds' ? 'kds' : 'station'} />;
}

function CookContent({
  view,
  colors,
}: {
  view: CookRoleView;
  colors: ReturnType<typeof useColors>;
}) {
  return <CookQueueView colors={colors} mode={view === 'cook-kds' ? 'kds' : 'station'} />;
}

function CookQueueView({
  colors,
  mode,
}: {
  colors: ReturnType<typeof useColors>;
  mode: 'station' | 'kds';
}) {
  const { data: orders, loading } = useKdsOrders();
  const queueCount = orders.filter((o) => o.status === 'queue').length;
  const preparingCount = orders.filter((o) => o.status === 'preparing').length;
  const readyCount = orders.filter((o) => o.status === 'ready').length;

  return (
    <View style={styles.section}>
      <View style={styles.threeMetricGrid}>
        <CompactMetric value={String(queueCount)} label="Fila" tone="warning" />
        <CompactMetric value={String(preparingCount)} label="Preparando" tone="danger" />
        <CompactMetric value={String(readyCount)} label="Prontos" tone="success" />
      </View>
      {loading && <Text style={[styles.staffRole, { color: colors.foregroundSecondary, textAlign: 'center', marginTop: 12 }]}>Carregando fila…</Text>}
      {orders.map((order) => {
        const isReady = order.status === 'ready';
        const isPreparing = order.status === 'preparing';
        const tone = isReady ? 'success' : isPreparing ? 'warning' : 'info';
        const actionLabel = isReady ? 'Pronto ✓' : isPreparing ? 'Marcar pronto' : 'Iniciar preparo';
        const actionColor = isPreparing ? '#22C55E' : '#F59E0B';
        return (
          <View key={`${mode}-${order.id}`} style={[styles.managerOrderCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <View style={styles.managerOrderHeader}>
              <View>
                <Text style={[styles.reservationTitle, { color: colors.foreground }]}>{order.table}</Text>
                <Text style={[styles.staffRole, { color: colors.foregroundSecondary }]}>{order.meta}</Text>
              </View>
              <StatusChip label={tone === 'success' ? 'Pronto' : tone === 'warning' ? 'Preparando' : 'Fila'} tone={tone} />
            </View>
            <View style={{ marginTop: 10, gap: 6 }}>
              {order.items.map(([name, time]) => (
                <View key={name} style={styles.chefItemRow}>
                  <Text style={[styles.staffRole, { color: colors.foreground }]}>{name}</Text>
                  <Text style={[styles.staffRole, { color: colors.foregroundSecondary }]}>{time}</Text>
                </View>
              ))}
            </View>
            {!isReady && (
              <TouchableOpacity
                style={[styles.wideAction, { backgroundColor: actionColor }]}
                onPress={() => void supabaseApiAdapter.updateOrderStatus(order.id, isPreparing ? 'ready' : 'preparing')}
              >
                <Text style={[styles.wideActionText, { color: '#FFF' }]}>{actionLabel}</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
      <ProfileActive colors={colors} roleName="Cozinheiro" />
    </View>
  );
}

function BarmanQueueView({
  colors,
  mode,
}: {
  colors: ReturnType<typeof useColors>;
  mode: 'station' | 'kds';
}) {
  const [barOrders, setBarOrders] = React.useState<any[]>([]);
  const [loadingBar, setLoadingBar] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    supabaseApiAdapter.getBarQueue().then((data) => {
      if (!cancelled) setBarOrders(Array.isArray(data) ? data : []);
    }).catch(() => {}).finally(() => { if (!cancelled) setLoadingBar(false); });
    return () => { cancelled = true; };
  }, []);

  const queueCount = barOrders.filter((o) => o.status === 'confirmed' || o.status === 'pending').length;
  const preparingCount = barOrders.filter((o) => o.status === 'preparing').length;
  const readyCount = barOrders.filter((o) => o.status === 'ready').length;

  return (
    <View style={styles.section}>
      {mode === 'kds' ? (
        <View style={[styles.tipBanner, { backgroundColor: V2_TONE.info.bg, borderColor: '#BFDBFE' }]}>
          <Text style={[styles.tipBannerText, { color: V2_TONE.info.text }]}>
            KDS Bar — priorize drinks com menor tempo e mesas aguardando garçom.
          </Text>
        </View>
      ) : (
        <View style={[styles.tipBanner, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
          <Text style={[styles.tipBannerText, { color: '#C2410C' }]}>
            Estação — confirme novos pedidos de bar antes de enviar ao KDS.
          </Text>
        </View>
      )}
      <View style={styles.threeMetricGrid}>
        <CompactMetric value={String(queueCount)} label="Fila" tone="warning" />
        <CompactMetric value={String(preparingCount)} label="Preparando" tone="danger" />
        <CompactMetric value={String(readyCount)} label="Prontos" tone="success" />
      </View>
      {loadingBar && <Text style={[styles.staffRole, { color: colors.foregroundSecondary, textAlign: 'center', marginTop: 12 }]}>Carregando bar…</Text>}
      {barOrders.map((item) => {
        const isPreparing = item.status === 'preparing';
        const isReady = item.status === 'ready';
        const tone = isReady ? 'success' : isPreparing ? 'warning' : 'info';
        const actionLabel = isReady ? 'Pronto ✓' : isPreparing ? 'Marcar pronto' : 'Iniciar preparo';
        const actionColor = isPreparing ? '#22C55E' : '#F59E0B';
        const tableLabel = item.table_label ?? `Item ${item.id?.slice(0, 6) ?? '?'}`;
        const meta = `${item.quantity ?? 1}x ${item.item_name ?? 'Bebida'}${item.elapsed_minutes != null ? ` · ${item.elapsed_minutes}min` : ''}`;
        return (
          <View
            key={item.id}
            style={[styles.managerOrderCard, { borderColor: colors.border, backgroundColor: colors.card }]}
          >
            <View style={styles.managerOrderHeader}>
              <View>
                <Text style={[styles.reservationTitle, { color: colors.foreground }]}>{tableLabel}</Text>
                <Text style={[styles.staffRole, { color: colors.foregroundSecondary }]}>{meta}</Text>
              </View>
              <StatusChip label={isReady ? 'Pronto' : isPreparing ? 'Preparando' : 'Fila'} tone={tone} />
            </View>
            {!isReady && (
              <TouchableOpacity
                style={[styles.wideAction, { backgroundColor: actionColor }]}
                onPress={() => void supabaseApiAdapter.updateOrderItemStatus(item.id, isPreparing ? 'ready' : 'preparing')}
              >
                <Text style={[styles.wideActionText, { color: '#FFF' }]}>{actionLabel}</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
      <ProfileActive colors={colors} roleName="Barman" />
    </View>
  );
}

function BarmanRecipesView({ colors }: { colors: ReturnType<typeof useColors> }) {
  // No recipe/preparation-steps table exists in the schema — showing the
  // full menu here would be misleading (not filtered to drinks, no prep
  // instructions). Honest placeholder until that data model exists.
  return (
    <View style={styles.section}>
      <InlineNotice message="Fichas técnicas de drinks ainda não disponíveis nesta versão do app." colors={colors} />
      <ProfileActive colors={colors} roleName="Barman" />
    </View>
  );
}

function BarmanStockView({ colors }: { colors: ReturnType<typeof useColors> }) {
  return <ManagerStockView colors={colors} roleName="Barman" />;
}

function ChefKdsView({ colors }: { colors: ReturnType<typeof useColors> }) {
  const { data: orders, loading } = useKdsOrders();
  const queueCount = orders.filter((o) => o.status === 'queue').length;
  const preparingCount = orders.filter((o) => o.status === 'preparing').length;
  const readyCount = orders.filter((o) => o.status === 'ready').length;

  return (
    <View style={styles.section}>
      <View style={styles.threeMetricGrid}>
        <CompactMetric value={String(queueCount)} label="Fila" tone="warning" />
        <CompactMetric value={String(preparingCount)} label="Preparando" tone="danger" />
        <CompactMetric value={String(readyCount)} label="Prontos" tone="success" />
      </View>
      {loading && <Text style={[styles.staffRole, { color: colors.foregroundSecondary, textAlign: 'center', marginTop: 12 }]}>Carregando KDS…</Text>}
      {orders.map((order) => {
        const isReady = order.status === 'ready';
        const isPreparing = order.status === 'preparing';
        const tone = isReady ? 'success' : isPreparing ? 'warning' : 'info';
        const actionLabel = isReady ? 'Pronto ✓' : isPreparing ? 'Marcar pronto' : 'Iniciar preparo';
        const actionColor = isReady ? '#22C55E' : isPreparing ? '#22C55E' : '#F59E0B';
        const actionTextColor = '#FFF';
        return (
          <View key={order.id} style={[styles.managerOrderCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <View style={styles.managerOrderHeader}>
              <View>
                <Text style={[styles.reservationTitle, { color: colors.foreground }]}>{order.table}</Text>
                <Text style={[styles.staffRole, { color: colors.foregroundSecondary }]}>{order.meta}</Text>
              </View>
              <StatusChip label={tone === 'success' ? 'Pronto' : tone === 'warning' ? 'Preparando' : 'Fila'} tone={tone} />
            </View>
            <View style={{ marginTop: 10, gap: 6 }}>
              {order.items.map(([name, time]) => (
                <View key={name} style={styles.chefItemRow}>
                  <Text style={[styles.staffRole, { color: colors.foreground }]}>{name}</Text>
                  <Text style={[styles.staffRole, { color: colors.foregroundSecondary }]}>{time}</Text>
                </View>
              ))}
            </View>
            {!isReady && (
              <TouchableOpacity
                style={[styles.wideAction, { backgroundColor: actionColor }]}
                onPress={() => void supabaseApiAdapter.updateOrderStatus(order.id, isPreparing ? 'ready' : 'preparing')}
              >
                <Text style={[styles.wideActionText, { color: actionTextColor }]}>{actionLabel}</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </View>
  );
}

function ChefApprovalsView({ colors }: { colors: ReturnType<typeof useColors> }) {
  // No backend concept of "Chef's Table booking approvals" exists yet.
  return (
    <View style={styles.section}>
      <InlineNotice message="Aprovações de Chef's Table ainda não disponíveis nesta versão do app." colors={colors} />
      <ProfileActive colors={colors} roleName="Chef" />
    </View>
  );
}

function ChefAnalyticsView({ colors }: { colors: ReturnType<typeof useColors> }) {
  const { data: snapshot, loading } = useDashboardSnapshot();

  return (
    <View style={styles.section}>
      <View style={[styles.tipBanner, { backgroundColor: V2_TONE.danger.bg, borderColor: '#FECACA' }]}>
        <Zap size={16} color="#FF8A7A" />
        <Text style={[styles.tipBannerText, { color: '#FF8A7A' }]}>Métricas de performance da cozinha</Text>
      </View>
      <View style={styles.metricGrid}>
        <Metric value={loading ? '—' : String(snapshot?.kds_queue ?? 0)} label="Na fila do KDS" tone="danger" />
      </View>
      <InlineNotice message="Tempo médio, SLA e detalhamento por estação ainda não estão disponíveis — dependem de um relatório de cozinha que este app ainda não consome." colors={colors} />
      <ProfileActive colors={colors} roleName="Chef" />
    </View>
  );
}

function ChefCostView({ colors }: { colors: ReturnType<typeof useColors> }) {
  // menu_items has no cost/CMV column in the current schema — nothing real to show yet.
  return (
    <View style={styles.section}>
      <View style={[styles.tipBanner, { backgroundColor: V2_TONE.danger.bg, borderColor: '#FECACA' }]}>
        <Zap size={16} color="#FF8A7A" />
        <Text style={[styles.tipBannerText, { color: '#FF8A7A' }]}>CMV por prato, fichas técnicas e margem de contribuição</Text>
      </View>
      <InlineNotice message="Cálculo de CMV/margem ainda não disponível — o cardápio hoje não registra o custo de cada prato." colors={colors} />
      <ProfileActive colors={colors} roleName="Chef" />
    </View>
  );
}

function ChefMenuView({ colors }: { colors: ReturnType<typeof useColors> }) {
  const { data: items, loading, error, refresh } = useMenuItems();

  return (
    <View style={styles.section}>
      {loading ? (
        <InlineNotice message="Carregando cardápio..." colors={colors} />
      ) : error ? (
        <InlineNotice message={error} actionLabel="Recarregar" onPress={() => void refresh()} colors={colors} />
      ) : items.length === 0 ? (
        <InlineNotice message="Nenhum item cadastrado no cardápio." colors={colors} />
      ) : (
        items.map((item) => (
          <View key={item.id} style={[styles.menuEditorCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            {item.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} style={styles.menuEditorImage} />
            ) : (
              <View style={[styles.menuEditorImage, { backgroundColor: colors.backgroundSecondary }]} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.approvalTitle, { color: colors.foreground }]}>{item.name}</Text>
              <Text numberOfLines={2} style={[styles.staffRole, { color: colors.foregroundSecondary }]}>{item.description}</Text>
            </View>
            <Text style={styles.menuEditorPrice}>{formatCurrency(item.price)}</Text>
          </View>
        ))
      )}
      <ProfileActive colors={colors} roleName="Chef" />
    </View>
  );
}

function ChefStockView({ colors }: { colors: ReturnType<typeof useColors> }) {
  return <ManagerStockView colors={colors} roleName="Chef" />;
}

function useFreeTableCount(): number {
  const { data: tables } = useRestaurantTables();
  return tables.filter((t) => t.status === 'available').length;
}

function MaitreReservationsView({ colors }: { colors: ReturnType<typeof useColors> }) {
  const { data: reservations, loading, error, refresh } = useReservations();
  const freeTables = useFreeTableCount();
  const [acting, setActing] = useState<string | null>(null);

  const updateStatus = async (id: string, status: string) => {
    setActing(id);
    try {
      await supabaseApiAdapter.updateReservationStatus(id, status);
      await refresh();
    } catch (err) {
      Alert.alert('Falha ao atualizar reserva', err instanceof Error ? err.message : 'Tente novamente.');
    } finally {
      setActing(null);
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.metricGrid}>
        <Metric value={loading ? '—' : String(reservations.length)} label="Reservas Hoje" tone="danger" />
        <Metric value={String(freeTables)} label="Mesas Livres" tone="success" />
      </View>
      <SectionTitle title="Reservas de hoje" colors={colors} />
      {loading ? (
        <InlineNotice message="Carregando reservas..." colors={colors} />
      ) : error ? (
        <InlineNotice message={error} actionLabel="Recarregar" onPress={() => void refresh()} colors={colors} />
      ) : reservations.length === 0 ? (
        <InlineNotice message="Nenhuma reserva para hoje." colors={colors} />
      ) : (
        reservations.map((reservation) => (
          <View key={reservation.id} style={[styles.reservationCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <View style={styles.managerOrderHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.reservationTitle, { color: colors.foreground }]}>{reservation.customerName}</Text>
                <Text style={[styles.staffRole, { color: colors.foregroundSecondary }]}>
                  {reservation.clock} · {reservation.partySize} {reservation.partySize === 1 ? 'pessoa' : 'pessoas'}
                </Text>
              </View>
              <StatusChip label={RESERVATION_STATUS_LABEL[reservation.status] || reservation.status} tone={RESERVATION_STATUS_TONE[reservation.status] || 'info'} />
            </View>
            {!!reservation.specialRequests && <Text style={[styles.reservationNote, { color: colors.foregroundSecondary }]}>{reservation.specialRequests}</Text>}
            {reservation.status === 'pending' && (
              <View style={styles.approvalActions}>
                <TouchableOpacity
                  disabled={acting === reservation.id}
                  onPress={() => void updateStatus(reservation.id, 'confirmed')}
                  style={[styles.approvalButton, { backgroundColor: '#35B36F' }]}
                >
                  <CheckCircle size={16} color="#FFF" />
                  <Text style={styles.approvalButtonText}>Confirmar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={acting === reservation.id}
                  onPress={() => void updateStatus(reservation.id, 'cancelled')}
                  style={[styles.approvalButton, { backgroundColor: '#FDEAEA' }]}
                >
                  <Text style={[styles.approvalButtonText, { color: '#EF4444' }]}>Recusar</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))
      )}
      <ProfileActive colors={colors} roleName="Maître" />
    </View>
  );
}

function MaitreFlowView({ colors }: { colors: ReturnType<typeof useColors> }) {
  const { data: reservations, loading, error, refresh } = useReservations();
  const freeTables = useFreeTableCount();
  const upcoming = reservations.filter((r) => r.status === 'pending' || r.status === 'confirmed').slice(0, 4);

  return (
    <View style={styles.section}>
      <View style={styles.metricGrid}>
        <Metric value={String(freeTables)} label="Mesas livres" tone="success" />
        <Metric value={loading ? '—' : String(upcoming.length)} label="Próximas reservas" tone="warning" />
      </View>
      <SectionTitle title="Fluxo atual" colors={colors} />
      {loading ? (
        <InlineNotice message="Carregando..." colors={colors} />
      ) : error ? (
        <InlineNotice message={error} actionLabel="Recarregar" onPress={() => void refresh()} colors={colors} />
      ) : upcoming.length === 0 ? (
        <InlineNotice message="Nenhuma reserva pendente ou confirmada." colors={colors} />
      ) : (
        upcoming.map((reservation) => (
          <View key={reservation.id} style={[styles.flowCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.reservationTitle, { color: colors.foreground }]}>{reservation.customerName}</Text>
            <Text style={[styles.staffRole, { color: colors.foregroundSecondary }]}>
              {reservation.clock} · {RESERVATION_STATUS_LABEL[reservation.status] || reservation.status}
            </Text>
          </View>
        ))
      )}
      <ProfileActive colors={colors} roleName="Maître" />
    </View>
  );
}

function MaitreTablesView({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.section}>
      <View style={[styles.tipBanner, { backgroundColor: V2_TONE.danger.bg, borderColor: '#FECACA' }]}>
        <Text style={styles.tipBannerText}>No mobile, o mapa vira uma grade operacional rápida para seleção e ação.</Text>
      </View>
      <TablesGrid colors={colors} />
    </View>
  );
}

function MaitreManagementView({ colors }: { colors: ReturnType<typeof useColors> }) {
  const { data: reservations, loading, error, refresh } = useReservations();
  const confirmed = reservations.filter((r) => r.status === 'confirmed' || r.status === 'seated').length;
  const pending = reservations.filter((r) => r.status === 'pending').length;

  return (
    <View style={styles.section}>
      <View style={[styles.tipBanner, { backgroundColor: V2_TONE.danger.bg, borderColor: '#FECACA' }]}>
        <Zap size={16} color="#FF5A3D" />
        <Text style={styles.tipBannerText}>Gestão completa de reservas — confirmação, grupos e no-show</Text>
      </View>
      <View style={styles.threeMetricGrid}>
        <CompactMetric value={loading ? '—' : String(reservations.length)} label="Hoje" tone="info" />
        <CompactMetric value={loading ? '—' : String(confirmed)} label="Confirmadas" tone="success" />
        <CompactMetric value={loading ? '—' : String(pending)} label="Pendentes" tone="warning" />
      </View>
      {loading ? (
        <InlineNotice message="Carregando reservas..." colors={colors} />
      ) : error ? (
        <InlineNotice message={error} actionLabel="Recarregar" onPress={() => void refresh()} colors={colors} />
      ) : reservations.length === 0 ? (
        <InlineNotice message="Nenhuma reserva para hoje." colors={colors} />
      ) : (
        reservations.map((reservation) => (
          <View key={reservation.id} style={[styles.managementCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <View style={styles.managerOrderHeader}>
              <Text style={[styles.reservationTitle, { color: colors.foreground }]}>{reservation.customerName}</Text>
              <StatusChip label={RESERVATION_STATUS_LABEL[reservation.status] || reservation.status} tone={RESERVATION_STATUS_TONE[reservation.status] || 'info'} />
            </View>
            <View style={styles.managementMetaGrid}>
              <MetaLine icon={Clock} label={reservation.clock} color={colors.foregroundSecondary} />
              <MetaLine icon={Users} label={`${reservation.partySize} pessoas`} color={colors.foregroundSecondary} />
              {reservation.tableNumber != null && (
                <MetaLine icon={UtensilsCrossed} label={`Mesa ${reservation.tableNumber}`} color={colors.foregroundSecondary} />
              )}
            </View>
          </View>
        ))
      )}
      <ProfileActive colors={colors} roleName="Maître" />
    </View>
  );
}

function ManagerDashboardTab({
  setView,
  colors,
}: {
  setView: (view: ManagerRoleView) => void;
  onNavigate: (s: string) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const { data: snapshot, loading: snapshotLoading } = useDashboardSnapshot();
  const { data: staff, loading: staffLoading, error: staffError, refresh: refreshStaff } = useStaff();
  const { data: orders, loading: ordersLoading } = useRestaurantOrders();

  const activeStaffCount = staff.filter((member) => member.isActive).length;
  // "Delayed" is a judgment call with no dedicated backend flag yet: an order
  // still in new/preparing status after 20 minutes is treated as running late.
  const delayedOrders = orders.filter((order) => {
    if (order.status === 'ready') return false;
    if (!order.createdAt) return false;
    const ageMinutes = (Date.now() - new Date(order.createdAt).getTime()) / 60000;
    return ageMinutes > 20;
  });

  return (
    <View style={styles.section}>
      <View style={styles.metricGrid}>
        <Metric value={snapshotLoading ? '—' : String(snapshot?.active_orders ?? 0)} label="Pedidos ativos" tone="danger" />
        <Metric value={snapshotLoading ? '—' : String(snapshot?.open_calls ?? 0)} label="Chamados abertos" tone="warning" />
        <Metric value={staffLoading ? '—' : String(activeStaffCount)} label="Equipe ativa" tone="info" />
        <Metric value={snapshotLoading ? '—' : formatCurrency(snapshot?.revenue_today ?? 0)} label="Receita" tone="success" />
      </View>

      {delayedOrders.length > 0 && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setView('manager-orders')}
          style={[styles.delayAlert, { backgroundColor: V2_TONE.danger.bg, borderColor: '#FECACA' }]}
        >
          <AlertCircle size={16} color={V2_TONE.danger.text} />
          <Text style={[styles.delayAlertText, { color: V2_TONE.danger.text }]}>
            {delayedOrders.length} {delayedOrders.length === 1 ? 'pedido com atraso' : 'pedidos com atraso'}
          </Text>
        </TouchableOpacity>
      )}

      <View style={styles.managerStaffList}>
        {staffLoading ? (
          <InlineNotice message="Carregando equipe..." colors={colors} />
        ) : staffError ? (
          <InlineNotice message={staffError} actionLabel="Recarregar" onPress={() => void refreshStaff()} colors={colors} />
        ) : (
          staff.slice(0, 6).map((member) => (
            <View key={member.id} style={[styles.staffCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <View style={[styles.avatar, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundSecondary }]}>
                <Text style={{ fontWeight: '700', color: colors.foreground }}>{member.fullName[0]?.toUpperCase() ?? '?'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.staffName, { color: colors.foreground }]}>{member.fullName}</Text>
                <Text style={[styles.staffRole, { color: colors.foregroundSecondary }]}>{STAFF_ROLE_LABEL[member.role] || member.role}</Text>
              </View>
              <Text style={[styles.staffStatus, !member.isActive && { color: colors.foregroundSecondary }]}>{member.isActive ? 'Ativo' : 'Inativo'}</Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function ManagerOrdersView({ colors }: { colors: ReturnType<typeof useColors> }) {
  const { data: orders, loading, error, refresh } = useRestaurantOrders();
  const [advancing, setAdvancing] = useState<string | null>(null);

  const advanceOrder = async (orderId: string, nextStatus: string) => {
    setAdvancing(orderId);
    try {
      await ApiService.updateOrderStatus(orderId, nextStatus);
      await refresh();
    } catch (err) {
      Alert.alert('Falha ao atualizar pedido', err instanceof Error ? err.message : 'Tente novamente.');
    } finally {
      setAdvancing(null);
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.filterRow}>
        {['Todos', 'Pendente', 'Confirmado', 'Preparando'].map((filter, index) => (
          <View key={filter} style={[styles.filterChip, { backgroundColor: index === 0 ? colors.primary : colors.backgroundSecondary }]}>
            <Text style={[styles.filterText, { color: index === 0 ? '#FFF' : colors.foregroundSecondary }]}>{filter}</Text>
          </View>
        ))}
      </View>
      {loading ? (
        <InlineNotice message="Carregando pedidos..." colors={colors} />
      ) : error ? (
        <InlineNotice message={error} actionLabel="Recarregar" onPress={() => void refresh()} colors={colors} />
      ) : orders.length === 0 ? (
        <InlineNotice message="Nenhum pedido ativo." colors={colors} />
      ) : orders.map((order) => (
        <View key={order.id} style={[styles.managerOrderCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View style={styles.orderRow}>
            <View style={styles.tableNumberBubble}>
              <Text style={styles.tableNumberText}>{order.table.replace('Mesa ', '')}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.managerOrderHeader}>
                <Text style={[styles.approvalTitle, { color: colors.foreground }]}>{order.customerName || shortOrderId(order.id)}</Text>
                <StatusChip label={orderStatusLabel(order.status)} tone={orderStatusTone(order.status)} />
              </View>
              <Text style={[styles.staffRole, { color: colors.foregroundSecondary }]}>{order.items.length} itens · {formatCurrency(order.total)} · {order.time}</Text>
              <View style={styles.orderItemChips}>
                {order.items.slice(0, 2).map((item) => (
                  <Text key={item} style={styles.orderItemChip}>{item}</Text>
                ))}
              </View>
            </View>
          </View>
          <TouchableOpacity
            disabled={advancing === order.id}
            onPress={() => void advanceOrder(order.id, order.status === 'preparing' ? 'ready' : 'preparing')}
            style={[styles.wideAction, { backgroundColor: order.status === 'preparing' ? '#35B36F' : '#F6A21A' }]}
          >
            <Text style={[styles.wideActionText, { color: order.status === 'preparing' ? '#FFF' : '#111827' }]}>{order.status === 'preparing' ? 'Marcar pronto' : 'Preparar'}</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

function ManagerApprovalsView({ colors }: { colors: ReturnType<typeof useColors> }) {
  // No backend concept of "pending cancellation/discount approvals" exists yet
  // (confirmed: no RPC returns this). Showing an honest empty state instead of
  // fabricated approve/reject cards until that workflow is actually built.
  return (
    <View style={styles.section}>
      <InlineNotice message="Central de aprovações ainda não disponível nesta versão do app." colors={colors} />
      <ProfileActive colors={colors} />
    </View>
  );
}

function ManagerCashView({ colors }: { colors: ReturnType<typeof useColors> }) {
  const { restaurantId } = useRestaurantRole();
  const { data: session, loading: sessionLoading, error: sessionError, refresh: refreshSession } = useCashRegister();
  const { data: movements, loading: movementsLoading, refresh: refreshMovements } = useCashMovements();
  const [amountDraft, setAmountDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const parseAmount = (): number | null => {
    const value = Number(amountDraft.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert('Valor inválido', 'Informe um valor maior que zero.');
      return null;
    }
    return value;
  };

  const runAction = async (label: string, action: () => Promise<unknown>) => {
    setSubmitting(true);
    try {
      await action();
      setAmountDraft('');
      await Promise.all([refreshSession(), refreshMovements()]);
    } catch (err) {
      Alert.alert(`Falha em ${label}`, err instanceof Error ? err.message : 'Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenCashRegister = () => {
    if (!restaurantId) return;
    const amount = parseAmount();
    if (amount === null) return;
    void runAction('abrir caixa', () => supabaseApiAdapter.openCashRegister(restaurantId, amount));
  };

  const handleSangria = () => {
    if (!session?.sessionId) return;
    const amount = parseAmount();
    if (amount === null) return;
    void runAction('sangria', () => supabaseApiAdapter.addCashMovement(session.sessionId!, 'withdrawal', amount, 'Sangria'));
  };

  const handleReforco = () => {
    if (!session?.sessionId) return;
    const amount = parseAmount();
    if (amount === null) return;
    void runAction('reforço', () => supabaseApiAdapter.addCashMovement(session.sessionId!, 'reinforcement', amount, 'Reforço', false));
  };

  const handleCloseCashRegister = () => {
    if (!session?.sessionId) return;
    const amount = parseAmount();
    if (amount === null) return;
    Alert.alert('Fechar caixa', `Confirmar fechamento com saldo contado de R$ ${amount.toFixed(2)}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Fechar',
        style: 'destructive',
        onPress: () => void runAction('fechar caixa', () => supabaseApiAdapter.closeCashRegister(session.sessionId!, amount)),
      },
    ]);
  };

  if (sessionLoading) return <InlineNotice message="Carregando caixa..." colors={colors} />;
  if (sessionError) return <InlineNotice message={sessionError} actionLabel="Recarregar" onPress={() => void refreshSession()} colors={colors} />;

  return (
    <View style={styles.section}>
      <View style={[styles.tipBanner, { backgroundColor: '#FFF1ED', borderColor: '#FED7CC' }]}>
        <Zap size={16} color="#FF5A3D" />
        <Text style={styles.tipBannerText}>Controle completo do caixa — abertura, sangria, reforço e fechamento</Text>
      </View>
      <View style={[styles.cashSummary, { borderColor: session?.isOpen ? '#A7F3D0' : colors.border, backgroundColor: session?.isOpen ? '#F0FDF4' : colors.card }]}>
        <View style={styles.cashStatusRow}>
          <View style={styles.statusDot} />
          <Text style={[styles.approvalTitle, { color: colors.foreground }]}>{session?.isOpen ? 'Caixa Aberto' : 'Caixa Fechado'}</Text>
        </View>
        {session?.isOpen && (
          <View style={styles.cashMetricRow}>
            <CashMetric label="Abertura" value={formatCurrency(session.openingBalance)} />
            <CashMetric label="Entradas" value={formatCurrency(session.cashSales + session.cardSales + session.pixSales)} success />
            <CashMetric label="Saldo" value={formatCurrency(session.expectedBalance)} />
          </View>
        )}
      </View>
      <View style={[styles.listPanel, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Text style={[styles.panelTitle, { color: colors.foreground }]}>Movimentações</Text>
        {movementsLoading ? (
          <InlineNotice message="Carregando movimentações..." colors={colors} />
        ) : movements.length === 0 ? (
          <InlineNotice message="Nenhuma movimentação registrada." colors={colors} />
        ) : (
          movements.map((move) => (
            <View key={move.id} style={[styles.cashMoveRow, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.staffName, { color: colors.foreground }]}>{move.label}</Text>
                <Text style={[styles.approvalMeta, { color: colors.foregroundSecondary }]}>{move.time}</Text>
              </View>
              <Text style={[styles.cashValue, { color: move.isCredit ? '#22C55E' : '#EF4444' }]}>
                {move.isCredit ? '+' : '-'}{formatCurrency(move.amount)}
              </Text>
            </View>
          ))
        )}
      </View>
      <TextInput
        value={amountDraft}
        onChangeText={setAmountDraft}
        placeholder="Valor (R$)"
        keyboardType="decimal-pad"
        editable={!submitting}
        style={[styles.cashAmountInput, { borderColor: colors.border, color: colors.foreground }]}
      />
      {session?.isOpen ? (
        <View style={styles.cashActions}>
          <TouchableOpacity disabled={submitting} onPress={handleSangria} style={[styles.cashAction, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
            <Text style={[styles.cashActionText, { color: '#F59E0B' }]}>Sangria</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={submitting} onPress={handleReforco} style={[styles.cashAction, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
            <Text style={[styles.cashActionText, { color: '#3B82F6' }]}>Reforço</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={submitting} onPress={handleCloseCashRegister} style={[styles.cashAction, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
            <Text style={[styles.cashActionText, { color: '#EF4444' }]}>Fechar Caixa</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity disabled={submitting} onPress={handleOpenCashRegister} style={[styles.wideAction, { backgroundColor: '#35B36F' }]}>
          <Text style={[styles.wideActionText, { color: '#FFF' }]}>Abrir Caixa</Text>
        </TouchableOpacity>
      )}
      <ProfileActive colors={colors} />
    </View>
  );
}

function TablesGrid({ colors }: { colors: ReturnType<typeof useColors> }) {
  const { data: tables, loading, error, refresh } = useRestaurantTables();

  if (loading) return <InlineNotice message="Carregando mesas..." colors={colors} />;
  if (error) return <InlineNotice message={error} actionLabel="Recarregar" onPress={() => void refresh()} colors={colors} />;
  if (tables.length === 0) return <InlineNotice message="Nenhuma mesa cadastrada." colors={colors} />;

  return (
    <View style={styles.tableGrid}>
      {tables.map((table) => (
        <View key={table.id} style={styles.tableCard}>
          <View style={styles.managerOrderHeader}>
            <Text style={[styles.tableTitle, { color: colors.foreground }]}>{table.label}</Text>
            <StatusChip label={TABLE_STATUS_LABEL[table.status]} tone={TABLE_STATUS_TONE[table.status]} />
          </View>
          <Text style={[styles.staffRole, { color: colors.foregroundSecondary }]}>
            {table.guests > 0 ? `${table.guests} pessoas` : table.section}
          </Text>
          {!!table.time && <Text style={[styles.staffName, { color: colors.foreground }]}>{table.time}</Text>}
        </View>
      ))}
    </View>
  );
}

function ManagerTablesView({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.section}>
      <View style={[styles.tipBanner, { backgroundColor: V2_TONE.danger.bg, borderColor: '#FECACA' }]}>
        <Text style={styles.tipBannerText}>No mobile, o mapa vira uma grade operacional rápida para seleção e ação.</Text>
      </View>
      <TablesGrid colors={colors} />
    </View>
  );
}

const STAFF_ROLE_LABEL: Record<string, string> = {
  owner: 'Dono',
  manager: 'Gerente',
  maitre: 'Maître',
  chef: 'Chef',
  barman: 'Barman',
  cook: 'Cozinheiro',
  waiter: 'Garçom',
};

function ManagerStaffView({ colors }: { colors: ReturnType<typeof useColors> }) {
  const { data: staff, loading, error, refresh } = useStaff();

  if (loading) return <InlineNotice message="Carregando equipe..." colors={colors} />;
  if (error) return <InlineNotice message={error} actionLabel="Recarregar" onPress={() => void refresh()} colors={colors} />;
  if (staff.length === 0) return <InlineNotice message="Nenhum membro de equipe cadastrado." colors={colors} />;

  return (
    <View style={styles.managerStaffList}>
      {staff.map((member) => (
        <View key={member.id} style={[styles.staffCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View style={[styles.avatar, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundSecondary }]}>
            <Text style={{ fontWeight: '700', color: colors.foreground }}>{member.fullName[0]?.toUpperCase() ?? '?'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.staffName, { color: colors.foreground }]}>{member.fullName}</Text>
            <Text style={[styles.staffRole, { color: colors.foregroundSecondary }]}>{STAFF_ROLE_LABEL[member.role] || member.role}</Text>
          </View>
          <Text style={[styles.staffStatus, !member.isActive && { color: colors.foregroundSecondary }]}>{member.isActive ? 'Ativo' : 'Inativo'}</Text>
        </View>
      ))}
    </View>
  );
}

function ManagerReportView({ colors }: { colors: ReturnType<typeof useColors> }) {
  const { data: snapshot, loading } = useDashboardSnapshot();
  const { data: session } = useCashRegister();

  return (
    <View style={styles.section}>
      <View style={styles.metricGrid}>
        <Metric value={loading ? '—' : formatCurrency(snapshot?.revenue_today ?? 0)} label="Receita dia" tone="success" />
        <Metric value={loading ? '—' : String(snapshot?.orders_today ?? 0)} label="Pedidos" tone="danger" />
      </View>
      <View style={[styles.listPanel, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Text style={[styles.panelTitle, { color: colors.foreground }]}>Fechamento operacional</Text>
        <View style={styles.checkRow}>
          {session && !session.isOpen ? <CheckCircle size={15} color="#22C55E" /> : <AlertCircle size={15} color="#F59E0B" />}
          <Text style={[styles.staffName, { color: colors.foreground }]}>
            {session && !session.isOpen ? 'Caixa fechado' : 'Caixa ainda aberto'}
          </Text>
        </View>
      </View>
      <ProfileActive colors={colors} />
    </View>
  );
}

function ManagerStockView({ colors, roleName = 'Gerente' }: { colors: ReturnType<typeof useColors>; roleName?: string }) {
  const { data: stock, loading, error, refresh } = useStock();

  return (
    <View style={styles.managerStaffList}>
      {loading ? (
        <InlineNotice message="Carregando estoque..." colors={colors} />
      ) : error ? (
        <InlineNotice message={error} actionLabel="Recarregar" onPress={() => void refresh()} colors={colors} />
      ) : stock.length === 0 ? (
        <InlineNotice message="Nenhum item de estoque cadastrado." colors={colors} />
      ) : (
        stock.map((item) => (
          <View key={item.id} style={[styles.stockRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <View>
              <Text style={[styles.approvalTitle, { color: colors.foreground }]}>{item.name}</Text>
              <Text style={[styles.staffRole, { color: colors.foregroundSecondary }]}>{item.category}</Text>
            </View>
            <StatusChip label={`${item.currentLevel} ${item.unit}`} tone={item.isLow ? 'danger' : 'success'} />
          </View>
        ))
      )}
      <ProfileActive colors={colors} roleName={roleName} />
    </View>
  );
}

function formatPromotionWindow(from: string, until: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit' };
  return `${new Date(from).toLocaleDateString('pt-BR', opts)} a ${new Date(until).toLocaleDateString('pt-BR', opts)}`;
}

function ManagerPromotionsView({ colors }: { colors: ReturnType<typeof useColors> }) {
  const { data: promotions, loading, error, refresh } = usePromotions();

  return (
    <View style={styles.section}>
      <View style={[styles.tipBanner, { backgroundColor: V2_TONE.danger.bg, borderColor: '#FECACA' }]}>
        <Zap size={16} color="#FF5A3D" />
        <Text style={styles.tipBannerText}>Campanhas ativas, cupons e happy hour</Text>
      </View>
      {loading ? (
        <InlineNotice message="Carregando promoções..." colors={colors} />
      ) : error ? (
        <InlineNotice message={error} actionLabel="Recarregar" onPress={() => void refresh()} colors={colors} />
      ) : promotions.length === 0 ? (
        <InlineNotice message="Nenhuma campanha ativa." colors={colors} />
      ) : (
        promotions.map((promo) => (
          <View key={promo.id} style={[styles.campaignCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <View style={styles.managerOrderHeader}>
              <Text style={[styles.approvalTitle, { color: colors.foreground }]}>{promo.title}</Text>
              <StatusChip label="Ativa" tone="success" />
            </View>
            <Text style={[styles.staffRole, { color: colors.foregroundSecondary }]}>
              {promo.discountValue ? `${promo.discountValue}% off` : promo.type}
            </Text>
            <Text style={[styles.approvalMeta, { color: colors.foregroundSecondary }]}>
              {formatPromotionWindow(promo.validFrom, promo.validUntil)}
            </Text>
          </View>
        ))
      )}
      <ProfileActive colors={colors} />
    </View>
  );
}

function ManagerQrView({ colors, onNavigate }: { colors: ReturnType<typeof useColors>; onNavigate: (s: string) => void }) {
  const { data: tables, loading, error, refresh } = useRestaurantTables();
  const withQR = tables.filter((t) => t.hasQR);

  return (
    <View style={styles.section}>
      <View style={[styles.tipBanner, { backgroundColor: V2_TONE.danger.bg, borderColor: '#FECACA' }]}>
        <Zap size={16} color="#FF5A3D" />
        <Text style={styles.tipBannerText}>Gere QR codes para mesas — individual ou em lote</Text>
      </View>
      <View style={styles.metricGrid}>
        <QuickAction title="QR Individual" detail="Gerar por mesa" icon={QrCode} onPress={() => onNavigate('QRGenerator')} colors={colors} />
        <QuickAction title="QR em Lote" detail="Todas as mesas" icon={ArrowDown} onPress={() => onNavigate('QRBatch')} colors={colors} />
      </View>
      <View style={[styles.listPanel, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Text style={[styles.panelTitle, { color: colors.foreground }]}>Mesas com QR code</Text>
        {loading ? (
          <InlineNotice message="Carregando mesas..." colors={colors} />
        ) : error ? (
          <InlineNotice message={error} actionLabel="Recarregar" onPress={() => void refresh()} colors={colors} />
        ) : withQR.length === 0 ? (
          <InlineNotice message="Nenhuma mesa com QR code gerado ainda." colors={colors} />
        ) : (
          <View style={styles.qrGrid}>
            {withQR.map((table) => (
              <View key={table.id} style={styles.qrItem}>
                <View style={styles.qrBox}><QrCode size={30} color="#9CA3AF" /></View>
                <Text style={styles.qrLabel}>{table.label}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <ProfileActive colors={colors} />
    </View>
  );
}

function ManagerSettingsView({
  colors,
  setView,
}: {
  colors: ReturnType<typeof useColors>;
  setView: (view: ManagerRoleView) => void;
}) {
  const { restaurantId, restaurants } = useRestaurantRole();
  const currentRestaurant = restaurants.find((r) => r.id === restaurantId);
  const routeByTitle: Record<string, ManagerRoleView> = {
    'Mapa do Salão': 'manager-tables',
    'Equipe & Permissões': 'manager-staff',
    Cardápio: 'manager-stock',
    Pagamentos: 'manager-cash',
  };
  return (
    <View style={styles.section}>
      <View style={styles.configHero}>
        <View style={styles.configIcon}><Settings size={24} color="#FF5A3D" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.configTitle}>Central de Configuração</Text>
          <Text style={styles.configSub}>
            {currentRestaurant ? `${currentRestaurant.name} · ${currentRestaurant.serviceType}` : 'Carregando...'}
          </Text>
        </View>
      </View>
      {MANAGER_CONFIG.map(([title, subtitle, Icon, tone]) => (
        <TouchableOpacity
          key={title}
          onPress={() => {
            const view = routeByTitle[title];
            if (view) setView(view);
          }}
          style={[styles.configRow, { borderColor: colors.border, backgroundColor: colors.card }]}
        >
          <View style={styles.configRowIcon}><Icon size={20} color={V2_TONE[tone as V2Tone].text} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.staffName, { color: colors.foreground }]}>{title}</Text>
            <Text style={[styles.staffRole, { color: colors.foregroundSecondary }]}>{subtitle}</Text>
          </View>
          <ArrowRight size={18} color={colors.foregroundSecondary} />
        </TouchableOpacity>
      ))}
      <ProfileActive colors={colors} />
    </View>
  );
}

function WaiterContent({
  view,
  colors,
}: {
  view: WaiterRoleView;
  colors: ReturnType<typeof useColors>;
}) {
  if (view === 'waiter-assistance') return <WaiterAssistanceView colors={colors} />;
  if (view === 'waiter-table-charge') return <WaiterChargeView colors={colors} />;
  if (view === 'waiter-tap-to-pay') return <WaiterTapToPayView colors={colors} />;
  if (view === 'waiter-order-management') return <WaiterOrdersView colors={colors} />;
  if (view === 'waiter-table-map') return <WaiterTableMapView colors={colors} />;
  if (view === 'waiter-tips') return <WaiterTipsView colors={colors} />;
  return <WaiterCommandView activeSegment={view === 'waiter-table-actions' ? 'Mesas' : 'Ao Vivo'} colors={colors} />;
}

const CALL_TYPE_LABEL: Record<string, string> = {
  waiter: 'Chamar garçom',
  payment: 'Solicitar conta',
  assistance: 'Precisa de ajuda',
  water: 'Água',
  napkin: 'Guardanapo',
};

type CommandEvent = {
  key: string;
  tone: V2Tone;
  table: string;
  time: string;
  title: string;
  detail: string;
  action: string;
  onPress: () => Promise<void>;
};

function WaiterCommandView({
  activeSegment,
  colors,
}: {
  activeSegment: string;
  colors: ReturnType<typeof useColors>;
}) {
  const { data: kdsOrders, refresh: refreshKds } = useKdsOrders();
  const { data: calls, refresh: refreshCalls } = useServiceCalls();
  const [acting, setActing] = useState<string | null>(null);

  const readyOrders = kdsOrders.filter((o) => o.status === 'ready');

  const runAction = async (key: string, action: () => Promise<unknown>) => {
    setActing(key);
    try {
      await action();
      await Promise.all([refreshKds(), refreshCalls()]);
    } catch (err) {
      Alert.alert('Falha na ação', err instanceof Error ? err.message : 'Tente novamente.');
    } finally {
      setActing(null);
    }
  };

  const events: CommandEvent[] = [
    ...readyOrders.map((order) => ({
      key: `order-${order.id}`,
      tone: 'danger' as V2Tone,
      table: order.table,
      time: order.time || '',
      title: 'Prato pronto para retirar',
      detail: order.items.map(([label]) => label).join(', '),
      action: 'Retirar',
      onPress: () => runAction(`order-${order.id}`, () => ApiService.updateOrderStatus(order.id, 'delivered')),
    })),
    ...calls
      .filter((c) => c.status === 'open')
      .map((call) => ({
        key: `call-${call.id}`,
        tone: 'warning' as V2Tone,
        table: call.tableNumber ? `Mesa ${call.tableNumber}` : 'Mesa',
        time: elapsedLabel(call.createdAt),
        title: CALL_TYPE_LABEL[call.callType] || call.callType,
        detail: '',
        action: 'Atender',
        onPress: () => runAction(`call-${call.id}`, () => supabaseApiAdapter.acknowledgeServiceCall(call.id)),
      })),
  ];

  return (
    <View style={styles.section}>
      <WaiterStats />
      <WaiterSegments active={activeSegment} />
      {readyOrders.length > 0 && (
        <View style={[styles.tipBanner, { backgroundColor: V2_TONE.danger.bg, borderColor: '#FECACA' }]}>
          <ChefHat size={16} color="#FF5A3D" />
          <Text style={styles.tipBannerText}>
            {readyOrders.length} prato(s) esperando retirada! A cozinha está aguardando
          </Text>
        </View>
      )}
      {events.length === 0 ? (
        <InlineNotice message="Nenhum pedido pronto ou chamado aberto no momento." colors={colors} />
      ) : (
        events.map((event) => (
          <View
            key={event.key}
            style={[
              styles.managerOrderCard,
              { borderColor: V2_TONE[event.tone].bg, backgroundColor: colors.card },
            ]}
          >
            <View style={styles.managerOrderHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <View style={[styles.configRowIcon, { width: 36, height: 36, borderRadius: 18, backgroundColor: V2_TONE[event.tone].bg }]}>
                  {event.tone === 'warning' ? <AlertCircle size={17} color={V2_TONE[event.tone].text} /> : <ChefHat size={17} color={V2_TONE[event.tone].text} />}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <StatusChip label={event.table} tone="danger" />
                    <Text style={[styles.staffRole, { color: colors.foregroundSecondary }]}>{event.time}</Text>
                  </View>
                  <Text style={[styles.staffName, { color: colors.foreground, marginTop: 4 }]}>{event.title}</Text>
                  {!!event.detail && <Text style={[styles.staffRole, { color: colors.foregroundSecondary }]}>{event.detail}</Text>}
                </View>
              </View>
            </View>
            <TouchableOpacity
              disabled={acting === event.key}
              onPress={() => void event.onPress()}
              style={[styles.wideAction, { backgroundColor: V2_TONE[event.tone].bg }]}
            >
              <Text style={[styles.wideActionText, { color: V2_TONE[event.tone].text }]}>{event.action} →</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
      <ProfileActive colors={colors} roleName="Garçom" />
    </View>
  );
}

function WaiterAssistanceView({ colors }: { colors: ReturnType<typeof useColors> }) {
  const { data: tables, loading, error, refresh } = useRestaurantTables();
  const occupied = tables.filter((t) => t.status === 'occupied' && t.hasQR);

  return (
    <View style={styles.section}>
      <View style={[styles.tipBanner, { backgroundColor: '#EFF6FF', borderColor: '#BAE6FD' }]}>
        <QrCode size={18} color="#0EA5E9" />
        <Text style={[styles.tipBannerText, { color: '#0284C7' }]}>Onboarding de Clientes — mostre o QR code da mesa</Text>
      </View>
      {loading ? (
        <InlineNotice message="Carregando mesas..." colors={colors} />
      ) : error ? (
        <InlineNotice message={error} actionLabel="Recarregar" onPress={() => void refresh()} colors={colors} />
      ) : occupied.length === 0 ? (
        <InlineNotice message="Nenhuma mesa ocupada com QR code disponível." colors={colors} />
      ) : (
        occupied.map((table) => (
          <View key={table.id} style={[styles.staffCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <View style={styles.tableNumberBubble}><Text style={styles.tableNumberText}>{table.label}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.reservationTitle, { color: colors.foreground }]}>{table.section}</Text>
              <Text style={[styles.staffRole, { color: colors.foregroundSecondary }]}>{table.guests} pessoas</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

function WaiterChargeView({ colors }: { colors: ReturnType<typeof useColors> }) {
  const { data: bills, loading, error, refresh } = useTableBills();
  const open = bills.filter((b) => !b.isPaid);

  return (
    <View style={styles.section}>
      <WaiterStats />
      <WaiterSegments active="Cobrar" />
      <View style={[styles.tipBanner, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
        <CreditCardIcon size={16} color="#F97316" />
        <Text style={[styles.tipBannerText, { color: '#EA580C' }]}>Contas em aberto</Text>
      </View>
      {loading ? (
        <InlineNotice message="Carregando contas..." colors={colors} />
      ) : error ? (
        <InlineNotice message={error} actionLabel="Recarregar" onPress={() => void refresh()} colors={colors} />
      ) : open.length === 0 ? (
        <InlineNotice message="Nenhuma conta em aberto." colors={colors} />
      ) : (
        open.map((bill) => (
          <View key={bill.orderId} style={[styles.managerOrderCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <View style={styles.managerOrderHeader}>
              <View style={styles.tableNumberBubble}><Text style={styles.tableNumberText}>{bill.tableNumber}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.staffName, { color: colors.foreground }]}>{formatCurrency(bill.totalAmount)}</Text>
                <Text style={[styles.approvalMeta, { color: '#F97316' }]}>{bill.paymentMethod || 'Aguardando pagamento'}</Text>
              </View>
              <StatusChip label="Cobrar" tone="danger" />
            </View>
          </View>
        ))
      )}
    </View>
  );
}

function WaiterTapToPayView({ colors }: { colors: ReturnType<typeof useColors> }) {
  // No card-reader SDK (e.g. Stripe Terminal) is integrated in this app yet —
  // showing a fake "ready to charge" screen would be actively misleading.
  return (
    <View style={styles.section}>
      <View style={[styles.listPanel, { borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center' }]}>
        <Phone size={54} color={colors.foregroundSecondary} />
        <Text style={[styles.panelTitle, { color: colors.foreground, marginTop: 14 }]}>Tap to Pay</Text>
        <InlineNotice message="Pagamento por aproximação (NFC) ainda não está disponível nesta versão do app." colors={colors} />
      </View>
      <ProfileActive colors={colors} roleName="Garçom" />
    </View>
  );
}

function WaiterOrdersView({ colors }: { colors: ReturnType<typeof useColors> }) {
  const { data: orders, loading, error, refresh } = useRestaurantOrders();

  return (
    <View style={styles.section}>
      {loading ? (
        <InlineNotice message="Carregando pedidos..." colors={colors} />
      ) : error ? (
        <InlineNotice message={error} actionLabel="Recarregar" onPress={() => void refresh()} colors={colors} />
      ) : orders.length === 0 ? (
        <InlineNotice message="Nenhum pedido ativo." colors={colors} />
      ) : (
        orders.map((order) => (
          <View key={order.id} style={[styles.managerOrderCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <View style={styles.managerOrderHeader}>
              <View style={styles.tableNumberBubble}><Text style={styles.tableNumberText}>{order.table.replace('Mesa ', '')}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.staffName, { color: colors.foreground }]}>{order.customerName || shortOrderId(order.id)}</Text>
                <Text style={[styles.staffRole, { color: colors.foregroundSecondary }]}>{order.items.length} itens · {formatCurrency(order.total)} · {order.time}</Text>
                <View style={styles.orderItemChips}>
                  {order.items.slice(0, 2).map((item) => (
                    <Text key={item} style={styles.orderItemChip}>{item}</Text>
                  ))}
                </View>
              </View>
              <StatusChip label={orderStatusLabel(order.status)} tone={orderStatusTone(order.status)} />
            </View>
          </View>
        ))
      )}
    </View>
  );
}

function WaiterTableMapView({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.section}>
      <View style={[styles.tipBanner, { backgroundColor: V2_TONE.danger.bg, borderColor: '#FECACA' }]}>
        <Text style={styles.tipBannerText}>No mobile, o mapa vira uma grade operacional rápida para seleção e ação.</Text>
      </View>
      <TablesGrid colors={colors} />
    </View>
  );
}

function WaiterTipsView({ colors }: { colors: ReturnType<typeof useColors> }) {
  const { restaurantId } = useRestaurantRole();
  const [totalTips, setTotalTips] = useState<number | null>(null);
  const [tipsError, setTipsError] = useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (!restaurantId) return;
    supabaseApiAdapter
      .getTipsSummary(restaurantId)
      .then((summary: any) => { if (!cancelled) setTotalTips(Number(summary?.total_tips ?? 0)); })
      .catch((err: unknown) => { if (!cancelled) setTipsError(err instanceof Error ? err.message : 'Erro ao carregar gorjetas'); });
    return () => { cancelled = true; };
  }, [restaurantId]);

  return (
    <View style={styles.section}>
      <View style={[styles.listPanel, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <StatusChip label={totalTips != null ? formatCurrency(totalTips) : '—'} tone="success" />
        <Text style={[styles.staffRole, { color: colors.foregroundSecondary, marginTop: 12 }]}>Gorjetas do turno (pool)</Text>
      </View>
      {tipsError && <InlineNotice message={tipsError} colors={colors} />}
      <InlineNotice message="Distribuição por mesa/garçom ainda não é rastreada individualmente — apenas o total do pool do turno." colors={colors} />
      <ProfileActive colors={colors} roleName="Garçom" />
    </View>
  );
}

function WaiterStats() {
  return (
    <View style={styles.configStats}>
      <CompactMetric value="6" label="Mesas" tone="danger" />
      <CompactMetric value="2" label="Retirar" tone="danger" />
      <CompactMetric value="5" label="Chamados" tone="danger" />
      <CompactMetric value="R$410" label="Gorjetas" tone="warning" />
    </View>
  );
}

function WaiterSegments({ active }: { active: string }) {
  return (
    <View style={styles.filterRow}>
      {['Ao Vivo', 'Mesas', 'Cozinha', 'Cobrar'].map((label) => (
        <View key={label} style={[styles.filterChip, { backgroundColor: active === label ? '#FFF' : '#F8FAFC', borderWidth: active === label ? 1 : 0, borderColor: '#E5E7EB' }]}>
          <Text style={[styles.filterText, { color: active === label ? '#111827' : '#6B7280' }]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

function RolePlaceholder({
  role,
  colors,
  onNavigate,
}: {
  role: (typeof OWNER_ROLES)[number];
  colors: ReturnType<typeof useColors>;
  onNavigate: (s: string) => void;
}) {
  const links: Record<RoleId, string> = {
    owner: 'Hub',
    manager: 'Orders',
    maitre: 'Maitre',
    chef: 'Kitchen',
    barman: 'BarKDS',
    cook: 'Kitchen',
    waiter: 'Waiter',
  };

  return (
    <View style={styles.section}>
      <View style={[styles.banner, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, borderWidth: 1 }]}>
        <Text style={{ color: colors.foregroundSecondary, fontSize: 10, fontWeight: '700' }}>VISÃO POR CARGO</Text>
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.foreground, marginTop: 8 }}>{role.label}</Text>
        <Text style={{ color: colors.foregroundSecondary, marginTop: 4 }}>{role.hint}</Text>
      </View>
      <TouchableOpacity
        style={[styles.actionBtn, { backgroundColor: colors.primary }]}
        onPress={() => onNavigate(links[role.id] ?? 'Hub')}
      >
        <Text style={{ color: '#FFF', fontWeight: '700', textAlign: 'center' }}>Abrir painel {role.label}</Text>
      </TouchableOpacity>
    </View>
  );
}

function SectionTitle({ title, subtitle, colors }: { title: string; subtitle?: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{ marginBottom: 12, marginTop: 8 }}>
      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.foreground }}>{title}</Text>
      {subtitle ? <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>{subtitle}</Text> : null}
    </View>
  );
}

function Metric({ value, label, tone }: { value: string; label: string; tone: V2Tone }) {
  return (
    <View style={[styles.metricCard, { borderColor: '#E2E8F0' }]}>
      <Text style={[styles.metricValue, { color: V2_TONE[tone].text, backgroundColor: V2_TONE[tone].bg }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function CompactMetric({ value, label, tone }: { value: string; label: string; tone: V2Tone }) {
  return (
    <View style={[styles.compactMetricCard, { borderColor: '#E2E8F0' }]}>
      <Text style={[styles.compactMetricValue, { color: V2_TONE[tone].text }]}>{value}</Text>
      <Text numberOfLines={1} style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function QuickAction({
  title,
  detail,
  icon: Icon,
  onPress,
  colors,
}: {
  title: string;
  detail: string;
  icon: IconComponent;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.quickAction, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Icon size={16} color={colors.primary} />
      <Text style={{ fontWeight: '700', color: colors.foreground, marginTop: 8 }}>{title}</Text>
      <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>{detail}</Text>
    </TouchableOpacity>
  );
}

function InlineNotice({
  message,
  actionLabel,
  onPress,
  colors,
}: {
  message: string;
  actionLabel?: string;
  onPress?: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.inlineNotice, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Text style={{ color: colors.foregroundSecondary, flex: 1 }}>{message}</Text>
      {actionLabel && onPress ? (
        <TouchableOpacity onPress={onPress} style={[styles.inlineNoticeBtn, { backgroundColor: colors.primary }]}>
          <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 12 }}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function CompactOrder({ order, colors }: { order: TabOrder; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.orderCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View style={styles.orderRow}>
        <View style={[styles.orderInitials, { backgroundColor: `${colors.primary}18` }]}>
          <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>
            {shortOrderId(order.id).replace('#', '')}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', color: colors.foreground }}>{order.customerName || shortOrderId(order.id)}</Text>
          <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>{order.table} · {order.items.length} itens · {formatCurrency(order.total)}</Text>
        </View>
        <V2StatusBadge label={orderStatusLabel(order.status)} tone={orderStatusTone(order.status)} />
      </View>
    </View>
  );
}

function StatusChip({
  label,
  tone,
}: {
  label: string;
  tone: V2Tone;
}) {
  return (
    <Text style={[styles.statusChip, { color: V2_TONE[tone].text, backgroundColor: V2_TONE[tone].bg }]}>
      {label}
    </Text>
  );
}

function CashMetric({ label, value, success }: { label: string; value: string; success?: boolean }) {
  return (
    <View style={styles.cashMetric}>
      <Text style={styles.cashMetricLabel}>{label}</Text>
      <Text style={[styles.cashMetricValue, success && { color: '#22C55E' }]}>{value}</Text>
    </View>
  );
}

function MetaLine({
  icon: Icon,
  label,
  color,
}: {
  icon: IconComponent;
  label: string;
  color: string;
}) {
  return (
    <View style={styles.metaLine}>
      <Icon size={13} color="#7C2D8D" strokeWidth={2.2} />
      <Text numberOfLines={1} style={[styles.metaLineText, { color }]}>{label}</Text>
    </View>
  );
}

function ProfileActive({ colors, roleName = 'Gerente' }: { colors: ReturnType<typeof useColors>; roleName?: string }) {
  return (
    <View style={[styles.profileActive, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Text style={[styles.eyebrow, { color: colors.foregroundSecondary }]}>PERFIL ATIVO</Text>
      <Text style={[styles.staffName, { color: colors.foreground, marginTop: 6 }]}>{roleName}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 88 },
  headerCard: { borderRadius: 16, borderWidth: 1, padding: 12, marginBottom: 16 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  headerText: { flex: 1 },
  signOutButton: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  signOutText: { fontSize: 12, fontWeight: '700' },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  headerTitle: { fontSize: 15, fontWeight: '700', marginTop: 4 },
  headerHint: { fontSize: 11, marginTop: 4 },
  rolePicker: { marginTop: 12, borderRadius: 12, borderWidth: 1, padding: 8, position: 'relative' },
  roleScrollContent: { paddingRight: 34 },
  roleScrollHint: {
    position: 'absolute',
    right: 6,
    top: 0,
    bottom: 0,
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleScrollHintIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, marginRight: 8 },
  roleChipText: { fontSize: 12, fontWeight: '600' },
  section: { gap: 12 },
  banner: { borderRadius: 16, padding: 12 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricCard: { width: '47%', borderRadius: 16, borderWidth: 1, padding: 12, backgroundColor: '#FFF' },
  metricValue: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, fontSize: 12, fontWeight: '700', overflow: 'hidden' },
  metricLabel: { marginTop: 12, fontSize: 12, color: '#64748B' },
  compactMetricCard: { flex: 1, minHeight: 70, borderRadius: 16, borderWidth: 1, padding: 12, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  compactMetricValue: { fontSize: 18, fontWeight: '800' },
  quickAction: { width: '47%', minHeight: 82, borderRadius: 16, borderWidth: 1, padding: 12 },
  inlineNotice: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  inlineNoticeBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  orderCard: { borderRadius: 16, borderWidth: 1, padding: 12, marginBottom: 8 },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  orderInitials: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  actionBtn: { marginTop: 12, borderRadius: 16, paddingVertical: 12, alignItems: 'center' },
  delayAlert: {
    minHeight: 42,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  delayAlertText: { fontSize: 13, fontWeight: '700' },
  managerShortcut: {
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  managerShortcutTitle: { fontSize: 13, fontWeight: '700' },
  managerShortcutSubtitle: { fontSize: 12, marginTop: 2 },
  managerApprovalList: { gap: 10 },
  approvalCard: { borderRadius: 16, borderWidth: 1, padding: 12 },
  approvalTop: { flexDirection: 'row', gap: 8 },
  approvalTitle: { fontSize: 13, fontWeight: '700' },
  approvalMeta: { fontSize: 11, marginTop: 2 },
  approvalReason: { fontSize: 11, marginTop: 6 },
  approvalAmount: { color: '#EF4444', fontSize: 12, fontWeight: '700' },
  approvalActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  approvalButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  approvalButtonText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  managerStaffList: { gap: 10 },
  staffCard: { borderRadius: 16, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  staffName: { fontSize: 13, fontWeight: '700' },
  staffRole: { fontSize: 12, marginTop: 2 },
  staffStatus: { color: '#22C55E', fontSize: 11, fontWeight: '700' },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  filterText: { fontSize: 11, fontWeight: '700' },
  managerOrderCard: { borderRadius: 16, borderWidth: 1, padding: 12 },
  managerOrderHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  reservationCard: { minHeight: 78, borderRadius: 16, borderWidth: 1, padding: 12, justifyContent: 'center' },
  reservationTitle: { fontSize: 15, fontWeight: '800' },
  reservationNote: { fontSize: 11, marginTop: 10 },
  flowCard: { minHeight: 60, borderRadius: 16, borderWidth: 1, padding: 12, justifyContent: 'center' },
  threeMetricGrid: { flexDirection: 'row', gap: 12 },
  managementCard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  managementMetaGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 },
  metaLine: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaLineText: { flex: 1, fontSize: 12, fontWeight: '600' },
  tableNumberBubble: { width: 46, height: 46, borderRadius: 16, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  tableNumberText: { color: '#FF5A3D', fontWeight: '800', fontSize: 16 },
  statusChip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, fontSize: 9, fontWeight: '800', overflow: 'hidden' },
  orderItemChips: { flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  orderItemChip: { backgroundColor: '#F3F4F6', color: '#6B7280', fontSize: 10, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, overflow: 'hidden' },
  wideAction: { minHeight: 38, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  wideActionText: { fontSize: 13, fontWeight: '800' },
  tipBanner: { minHeight: 48, borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  tipBannerText: { flex: 1, color: '#FF5A3D', fontSize: 12, fontWeight: '600', lineHeight: 17 },
  cashSummary: { borderRadius: 16, borderWidth: 1, padding: 14 },
  cashStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#22C55E' },
  cashBy: { marginLeft: 'auto', fontSize: 10 },
  cashMetricRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  cashMetric: { alignItems: 'center', flex: 1 },
  cashMetricLabel: { color: '#6B7280', fontSize: 12 },
  cashMetricValue: { color: '#111827', fontSize: 15, fontWeight: '800', marginTop: 4 },
  listPanel: { borderRadius: 16, borderWidth: 1, padding: 16 },
  panelTitle: { fontSize: 16, fontWeight: '800', marginBottom: 12 },
  cashMoveRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  cashValue: { fontSize: 14, fontWeight: '800' },
  cashActions: { flexDirection: 'row', gap: 8 },
  cashAction: { flex: 1, minHeight: 38, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cashActionText: { fontSize: 12, fontWeight: '800' },
  cashAmountInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10, fontSize: 15 },
  tableGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tableCard: { width: '31.5%', minHeight: 94, borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', padding: 10, backgroundColor: '#FFF' },
  tableTitle: { fontSize: 20, fontWeight: '800' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  stockRow: { borderRadius: 16, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  campaignCard: { borderRadius: 16, borderWidth: 1, minHeight: 98, padding: 14, justifyContent: 'center', gap: 8 },
  qrGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  qrItem: { width: '22%', alignItems: 'center', gap: 6 },
  qrBox: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  qrLabel: { fontSize: 10, color: '#111827', fontWeight: '600' },
  configHero: { borderRadius: 18, backgroundColor: '#41383B', padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  configIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#5A3431', alignItems: 'center', justifyContent: 'center' },
  configTitle: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  configSub: { color: '#E5E7EB', fontSize: 11, marginTop: 2 },
  progressTrack: { height: 7, borderRadius: 999, backgroundColor: '#6B7280', overflow: 'hidden', marginTop: 12 },
  progressFill: { width: '72%', height: '100%', backgroundColor: '#FF5A3D' },
  configPercent: { color: '#FFF', fontWeight: '800', alignSelf: 'flex-end' },
  configStats: { flexDirection: 'row', gap: 8 },
  configRow: { borderRadius: 16, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  configRowIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  configMiniTrack: { height: 4, borderRadius: 999, backgroundColor: '#E5E7EB', marginTop: 8, overflow: 'hidden' },
  configMiniFill: { width: '72%', height: '100%' },
  profileActive: { borderRadius: 16, borderWidth: 1, padding: 14 },
  roleHint: {
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  chefItemRow: {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  chefApprovalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 8,
    marginTop: 12,
  },
  chefStationRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  marginRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  menuEditorCard: {
    minHeight: 78,
    borderRadius: 16,
    borderWidth: 1,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuEditorImage: {
    width: 58,
    height: 58,
    borderRadius: 14,
  },
  menuEditorPrice: {
    color: '#FF5A3D',
    fontSize: 12,
    fontWeight: '800',
  },
});
