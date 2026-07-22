import React, { ComponentType, useCallback, useEffect, useState } from 'react';
import {
  Alert,
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Share,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Text } from 'react-native-paper';
import QRCode from 'react-native-qrcode-svg';
import {
  AlertCircle,
  ArrowDown,
  Clock,
  CheckCircle,
  CreditCard as CreditCardIcon,
  Phone,
  Package,
  QrCode,
  Zap,
  UtensilsCrossed,
  Users,
  BarChart,
  ChefHat,
  LogOut,
  Camera,
  MapPin,
  Wine,
  Contact,
  CalendarClock,
  Plug,
  Timer,
  ShieldAlert,
  Wheat,
  Droplets,
  MessageSquare,
  Star,
  Gift,
  Accessibility,
  Eye,
} from 'lucide-react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { authService } from '@/shared/services/auth';
import { V2_TONE, V2Tone } from './shared/v2Theme';
import { V2StatusBadge } from './shared/V2StatusBadge';
import { CurrencyInput } from './shared/CurrencyInput';
import { orderStatusLabel, orderStatusTone } from './shared/v2Types';
import { ConfigHubContent } from './config/ConfigHubContent';
import { PersonalSettingsContent } from './config/PersonalSettingsContent';
import { refreshMountedRemoteData } from './shared/remoteRefreshRegistry';
import type { TableBill, ServiceCall } from './shared/useRestaurantOperations';
import {
  elapsedLabel,
  shortOrderId,
  useCashMovements,
  useCashRegister,
  useApprovals,
  useDashboardSnapshot,
  useKdsOrders,
  useMenuItems,
  usePromotions,
  useReservations,
  useRestaurantOrders,
  useRestaurantTables,
  useCustomerAssistanceHub,
  useServiceCalls,
  useStaff,
  useStock,
  useTableBills,
} from './shared/useRestaurantOperations';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import type {
  AssistanceAllergenGroup,
  AssistanceFeedbackCandidate,
  AssistanceSentiment,
  AssistanceSpecialRequest,
} from '@okinawa/shared/services/supabase-api';
import ApiService from '@okinawa/shared/services/api';
import type { TabOrder, KdsOrder } from './shared/v2Types';
import { filterManagerOrders, MANAGER_CASH_MOVEMENT_TYPES, type ManagerOrderFilter } from './shared/managerOperations';
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
  { id: 'cook', label: 'Cozinheiro', title: 'Minha Estação', hint: 'Fila da sua praça' },
  { id: 'waiter', label: 'Garçom', title: 'Minhas Mesas', hint: 'Mesas e chamados' },
] as const;

type RoleId = (typeof OWNER_ROLES)[number]['id'];

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
    serverRole,
    restaurantId,
    restaurants,
    managerView,
    setManagerView,
    maitreView,
    setMaitreView,
    chefView,
    barmanView,
    cookView,
    waiterView,
    setWaiterView,
  } = useRestaurantRole();
  const [restaurantProfile, setRestaurantProfile] = useState<{
    name?: string;
    city?: string;
    state?: string;
    logo_url?: string | null;
  } | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const selectedRole = React.useMemo(
    () => OWNER_ROLES.find((r) => r.id === role) ?? OWNER_ROLES[0],
    [role],
  );
  const isOwner = role === 'owner';
  const canEditRestaurantLogo = serverRole === 'owner' || serverRole === 'manager';
  const restaurantFromList = restaurants.find((restaurant) => restaurant.id === restaurantId);
  const restaurantName = restaurantProfile?.name ?? restaurantFromList?.name ?? 'Seu restaurante';
  const restaurantCity = restaurantProfile?.city ?? restaurantFromList?.city;
  const restaurantState = restaurantProfile?.state ?? restaurantFromList?.state;
  const restaurantLocation = [restaurantCity, restaurantState].filter(Boolean).join(' · ');
  const restaurantLogo = restaurantProfile?.logo_url ?? restaurantFromList?.logoUrl ?? null;

  const loadRestaurantProfile = React.useCallback(async () => {
    if (!restaurantId) return;
    try {
      const profile = await supabaseApiAdapter.getRestaurantProfile(restaurantId);
      setRestaurantProfile(profile ?? null);
    } catch {
      // The operational cards still refresh independently if profile loading fails.
    }
  }, [restaurantId]);

  useEffect(() => { void loadRestaurantProfile(); }, [loadRestaurantProfile]);

  const handleRefresh = React.useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([loadRestaurantProfile(), refreshMountedRemoteData()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadRestaurantProfile, refreshing]);

  const handlePickRestaurantLogo = async () => {
    if (!restaurantId || logoUploading || !canEditRestaurantLogo) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permissão necessária', 'Autorize o acesso às fotos para escolher a imagem do restaurante.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.82,
    });
    if (result.canceled || !result.assets[0]) return;

    setLogoUploading(true);
    try {
      const asset = result.assets[0];
      const logoUrl = await supabaseApiAdapter.uploadRestaurantLogo(
        restaurantId,
        asset.uri,
        asset.mimeType ?? 'image/jpeg',
      );
      setRestaurantProfile((current) => ({ ...current, logo_url: logoUrl }));
    } catch (error) {
      Alert.alert('Não foi possível atualizar a foto', error instanceof Error ? error.message : 'Tente novamente.');
    } finally {
      setLogoUploading(false);
    }
  };

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
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { void handleRefresh(); }}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        )}
      >
        <View style={[styles.headerCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View pointerEvents="none" style={[styles.headerGlow, { backgroundColor: `${colors.secondary}12` }]} />
          <View style={styles.headerTop}>
            <View style={styles.headerIdentity}>
              <TouchableOpacity
                onPress={() => void handlePickRestaurantLogo()}
                disabled={logoUploading || !canEditRestaurantLogo}
                style={[styles.restaurantPhotoButton, { backgroundColor: `${colors.secondary}16`, borderColor: `${colors.secondary}45` }]}
                accessibilityRole={canEditRestaurantLogo ? 'button' : 'image'}
                accessibilityLabel={canEditRestaurantLogo
                  ? restaurantLogo ? 'Alterar foto do restaurante' : 'Adicionar foto do restaurante'
                  : 'Foto do restaurante'}
              >
                {restaurantLogo ? (
                  <Image source={{ uri: restaurantLogo }} style={styles.restaurantPhoto} />
                ) : (
                  <Text style={[styles.restaurantInitial, { color: colors.secondary }]}>{restaurantName.trim().charAt(0).toUpperCase() || 'N'}</Text>
                )}
                {canEditRestaurantLogo ? (
                  <View style={[styles.cameraBadge, { backgroundColor: colors.secondary, borderColor: colors.card }]}>
                    {logoUploading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Camera size={12} color="#FFFFFF" strokeWidth={2.7} />}
                  </View>
                ) : null}
              </TouchableOpacity>
              <View style={styles.headerText}>
                <Text style={[styles.eyebrow, { color: colors.secondary }]}>PAINEL DO RESTAURANTE</Text>
                <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.foreground }]}>{restaurantName}</Text>
                <View style={styles.restaurantMetaRow}>
                  {restaurantLocation ? <><MapPin size={12} color={colors.foregroundSecondary} /><Text numberOfLines={1} style={[styles.headerHint, { color: colors.foregroundSecondary }]}>{restaurantLocation}</Text></> : null}
                  <View style={[styles.roleBadge, { backgroundColor: `${colors.secondary}16` }]}>
                    <Text style={[styles.roleBadgeText, { color: colors.secondary }]}>{selectedRole.label}</Text>
                  </View>
                </View>
              </View>
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
            setView={setWaiterView}
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
    'maitre-reservations': 'Reservas',
    'maitre-flow': 'Fluxo do Salão',
    'maitre-tables': 'Mapa de Mesas',
    'maitre-management': 'Gestão de Reservas',
    'maitre-settings': 'Configurações',
  };
  return titles[view];
}

function chefViewTitle(view: ChefRoleView) {
  const titles: Record<ChefRoleView, string> = {
    'chef-kds': 'KDS Cozinha',
    'chef-approvals': 'Aprovações do Chef',
    'chef-analytics': 'KDS Analytics',
    'chef-cost': 'Custo & Margem',
    'chef-menu': 'Editor de Cardápio',
    'chef-stock': 'Controle de Estoque',
    'chef-settings': 'Configurações',
  };
  return titles[view];
}

function barmanViewTitle(view: BarmanRoleView) {
  const titles: Record<BarmanRoleView, string> = {
    'barman-station': 'Estação do Barman',
    'bar-kds': 'KDS Bar',
    'bar-recipes': 'Receitas de Drinks',
    'bar-stock': 'Controle de Estoque',
    'barman-settings': 'Configurações',
  };
  return titles[view];
}

function cookViewTitle(view: CookRoleView) {
  const titles: Record<CookRoleView, string> = {
    'cook-station': 'Minha Estação',
    'cook-kds': 'KDS Cozinha',
    'cook-settings': 'Configurações',
  };
  return titles[view];
}

function waiterViewTitle(view: WaiterRoleView) {
  const titles: Record<WaiterRoleView, string> = {
    waiter: 'Minhas Mesas',
    'waiter-calls': 'Chamados',
    'waiter-table-actions': 'Mesas',
    'waiter-kitchen': 'Cozinha',
    'waiter-assistance': 'Assistência ao Cliente',
    'waiter-table-charge': 'Cobrar na Mesa',
    'waiter-tap-to-pay': 'Tap to Pay',
    'waiter-order-management': 'Gestão de Pedidos',
    'waiter-tips': 'Gorjetas',
    'waiter-settings': 'Configurações',
  };
  return titles[view];
}





function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatApprovalCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function DashboardTab({ onNavigate, colors }: { onNavigate: (s: string) => void; colors: ReturnType<typeof useColors> }) {
  const { data: snapshot, loading: snapshotLoading, error: snapshotError, refresh: refreshSnapshot } = useDashboardSnapshot();
  const { data: recentOrders, loading: ordersLoading, error: ordersError, refresh: refreshOrders } = useRestaurantOrders();
  const primaryActions: { title: string; detail: string; screen: string; icon: IconComponent }[] = [
    { title: 'Cardápio', detail: 'Itens e preços', screen: 'Menu', icon: UtensilsCrossed },
    { title: 'Equipe', detail: 'Staff e turnos', screen: 'Staff', icon: Users },
    { title: 'Financeiro', detail: 'Receita e custos', screen: 'Financial', icon: CreditCardIcon },
    { title: 'Integrações', detail: 'Delivery', screen: 'Integrations', icon: Plug },
  ];
  const secondaryActions: { title: string; screen: string; icon: IconComponent }[] = [
    { title: 'Relatórios', screen: 'Reports', icon: BarChart },
    { title: 'Bar KDS', screen: 'BarKDS', icon: Wine },
    { title: 'Clientes', screen: 'Customers', icon: Contact },
    { title: 'Escalas', screen: 'Shifts', icon: CalendarClock },
  ];
  const occupancy = snapshot?.tables.total
    ? Math.round((snapshot.tables.occupied / snapshot.tables.total) * 100)
    : 0;
  const averageTicket = snapshot?.orders_today
    ? snapshot.revenue_today / snapshot.orders_today
    : 0;

  return (
    <View style={styles.section}>
      <View style={styles.metricGrid}>
        <Metric value={snapshotLoading ? '...' : formatCurrency(snapshot?.revenue_today ?? 0)} label="Receita Hoje" tone="success" />
        <Metric value={snapshotLoading ? '...' : String(snapshot?.active_orders ?? 0)} label="Pedidos Ativos" tone="danger" />
        <Metric value={snapshotLoading ? '...' : `${occupancy}%`} label="Ocupação" tone="warning" />
        <Metric value={snapshotLoading ? '...' : formatCurrency(averageTicket)} label="Ticket Médio" tone="info" />
      </View>
      {snapshotError ? (
        <InlineNotice message={snapshotError} actionLabel="Recarregar" onPress={() => void refreshSnapshot()} colors={colors} />
      ) : null}
      <SectionTitle title="Ações rápidas" subtitle="Os 4 atalhos principais do dia" colors={colors} />
      <View style={styles.metricGrid}>
        {primaryActions.map((action) => (
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
      <Text style={[styles.moreShortcutsLabel, { color: colors.foregroundSecondary }]}>Mais atalhos</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.moreShortcutsRow}
      >
        {secondaryActions.map((action) => {
          const Icon = action.icon;
          return (
            <TouchableOpacity
              key={action.title}
              onPress={() => onNavigate(action.screen)}
              style={[styles.moreShortcutChip, { borderColor: colors.border, backgroundColor: colors.card }]}
              accessibilityRole="button"
              accessibilityLabel={action.title}
            >
              <View style={[styles.moreShortcutIcon, { backgroundColor: `${colors.primary}14` }]}>
                <Icon size={15} color={colors.primary} />
              </View>
              <Text style={[styles.moreShortcutText, { color: colors.foreground }]}>{action.title}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
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
  if (view === 'manager-tables') return <ManagerTablesView />;
  if (view === 'manager-staff') return <ManagerStaffView colors={colors} />;
  if (view === 'manager-report') return <ManagerReportView colors={colors} />;
  if (view === 'manager-stock') return <ManagerStockView colors={colors} />;
  if (view === 'manager-promotions') return <ManagerPromotionsView colors={colors} />;
  if (view === 'manager-qr') return <ManagerQrView colors={colors} onNavigate={onNavigate} />;
  if (view === 'manager-settings') return <ManagerSettingsView />;
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
  if (view === 'maitre-tables') return <MaitreTablesView />;
  if (view === 'maitre-settings') return <PersonalSettingsView />;
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
  if (view === 'chef-settings') return <PersonalSettingsView />;
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
  if (view === 'barman-settings') return <PersonalSettingsView />;
  return <BarmanQueueView colors={colors} mode={view === 'bar-kds' ? 'kds' : 'station'} />;
}

function CookContent({
  view,
  colors,
}: {
  view: CookRoleView;
  colors: ReturnType<typeof useColors>;
}) {
  if (view === 'cook-settings') return <PersonalSettingsView />;
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
    </View>
  );
}

// O mapa de mesas de maître/gerente reutiliza a MESMA tela interativa do dono
// (aba "Mesas" → TablesScreen): seleção de mesa, mudança de status e geração de
// QR. Redireciona para essa tela em vez de exibir a grade estática somente
// leitura, garantindo paridade com a visão do dono.
function useOwnerTablesRedirect() {
  const navigation = useNavigation<any>();
  useFocusEffect(
    useCallback(() => {
      navigation.navigate('Tables');
    }, [navigation]),
  );
}

function MaitreTablesView() {
  useOwnerTablesRedirect();
  return null;
}

// Página de configuração pessoal para papéis sem o hub de configuração do
// restaurante (maître, chef, barman, cozinheiro, garçom): editar perfil,
// exportar dados (LGPD), excluir conta e sair.
function PersonalSettingsView() {
  return (
    <View style={styles.section}>
      <PersonalSettingsContent />
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

      <TouchableOpacity
        activeOpacity={0.84}
        accessibilityRole="button"
        accessibilityLabel="Abrir Central de Aprovações"
        onPress={() => setView('manager-approvals')}
        style={[styles.managerShortcut, { borderColor: '#A7F3D0', backgroundColor: '#F0FDF4' }]}
      >
        <View style={[styles.moreShortcutIcon, { backgroundColor: '#DCFCE7' }]}>
          <ShieldAlert size={17} color="#16A66A" />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.managerShortcutTitle, { color: colors.foreground }]}>Central de Aprovações</Text>
          <Text style={[styles.managerShortcutSubtitle, { color: colors.foregroundSecondary }]}>Avalie descontos, cancelamentos e cortesias</Text>
        </View>
        <Text style={{ color: '#16A66A', fontSize: 18, fontWeight: '800' }}>›</Text>
      </TouchableOpacity>

      <View style={styles.managerStaffList}>
        {staffLoading ? (
          <InlineNotice message="Carregando equipe..." colors={colors} />
        ) : staffError ? (
          <InlineNotice message={staffError} actionLabel="Recarregar" onPress={() => void refreshStaff()} colors={colors} />
        ) : (
          staff.slice(0, 6).map((member) => (
            <View key={member.id} style={[styles.staffCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <View style={[styles.avatar, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundSecondary, overflow: 'hidden' }]}>
                {member.avatarUrl ? (
                  <Image source={{ uri: member.avatarUrl }} style={styles.staffAvatarImage} accessibilityLabel={`Foto de ${member.fullName}`} />
                ) : (
                  <Text style={{ fontWeight: '700', color: colors.foreground }}>{member.fullName[0]?.toUpperCase() ?? '?'}</Text>
                )}
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
  const [activeFilter, setActiveFilter] = useState<ManagerOrderFilter>('all');
  const filters: { id: ManagerOrderFilter; label: string }[] = [
    { id: 'all', label: 'Todos' },
    { id: 'pending', label: 'Pendente' },
    { id: 'confirmed', label: 'Confirmado' },
    { id: 'preparing', label: 'Preparando' },
  ];
  const visibleOrders = filterManagerOrders(orders, activeFilter);

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
        {filters.map((filter) => (
          <TouchableOpacity
            key={filter.id}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityState={{ selected: activeFilter === filter.id }}
            onPress={() => setActiveFilter(filter.id)}
            style={[styles.filterChip, { backgroundColor: activeFilter === filter.id ? colors.primary : colors.backgroundSecondary }]}
          >
            <Text style={[styles.filterText, { color: activeFilter === filter.id ? '#FFF' : colors.foregroundSecondary }]}>{filter.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? (
        <InlineNotice message="Carregando pedidos..." colors={colors} />
      ) : error ? (
        <InlineNotice message={error} actionLabel="Recarregar" onPress={() => void refresh()} colors={colors} />
      ) : visibleOrders.length === 0 ? (
        <InlineNotice message="Nenhum pedido neste status." colors={colors} />
      ) : visibleOrders.map((order) => (
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
  const { data: approvals, loading, error, refresh } = useApprovals();
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const resolve = async (approvalId: string, status: 'approved' | 'rejected') => {
    setResolvingId(approvalId);
    try {
      await supabaseApiAdapter.resolveApproval(approvalId, status);
      await refreshMountedRemoteData();
    } catch (err) {
      Alert.alert(
        status === 'approved' ? 'Não foi possível aprovar' : 'Não foi possível recusar',
        err instanceof Error ? err.message : 'Tente novamente.',
      );
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <View style={styles.managerApprovalList}>
      <View style={[styles.approvalsSummary, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
        <ShieldAlert size={17} color="#16A66A" />
        <Text style={[styles.approvalsSummaryText, { color: colors.foreground }]}>
          {loading ? 'Carregando solicitações…' : `${approvals.length} ${approvals.length === 1 ? 'solicitação pendente' : 'solicitações pendentes'}`}
        </Text>
      </View>
      {error ? (
        <InlineNotice message={error} actionLabel="Recarregar" onPress={() => void refresh()} colors={colors} />
      ) : !loading && approvals.length === 0 ? (
        <InlineNotice message="Nenhuma solicitação aguardando aprovação." colors={colors} />
      ) : (
        approvals.map((approval) => {
          const busy = resolvingId === approval.id;
          const tableLabel = approval.table_number ? `Mesa ${approval.table_number}` : 'Sem mesa';
          return (
            <View key={approval.id} style={[styles.approvalCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <View style={styles.approvalTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.approvalTitle, { color: colors.foreground }]}>{approval.item_name}</Text>
                  <Text style={[styles.approvalMeta, { color: colors.foregroundSecondary }]}>
                    {tableLabel} · {approval.requester_name}
                  </Text>
                </View>
                <Text style={styles.approvalAmount}>{formatApprovalCurrency(approval.amount)}</Text>
              </View>
              <Text style={[styles.approvalReason, { color: colors.foregroundSecondary }]}>{approval.reason}</Text>
              <View style={styles.approvalActions}>
                <TouchableOpacity
                  disabled={busy}
                  activeOpacity={0.78}
                  accessibilityRole="button"
                  accessibilityLabel={`Aprovar ${approval.item_name}`}
                  onPress={() => void resolve(approval.id, 'approved')}
                  style={[styles.approvalButton, { backgroundColor: '#27B36A', opacity: busy ? 0.6 : 1 }]}
                >
                  <CheckCircle size={16} color="#FFF" />
                  <Text style={styles.approvalButtonText}>{busy ? 'Processando…' : 'Aprovar'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={busy}
                  activeOpacity={0.78}
                  accessibilityRole="button"
                  accessibilityLabel={`Recusar ${approval.item_name}`}
                  onPress={() => void resolve(approval.id, 'rejected')}
                  style={[styles.approvalButton, { backgroundColor: '#FDE8E8', opacity: busy ? 0.6 : 1 }]}
                >
                  <AlertCircle size={16} color="#EF4444" />
                  <Text style={[styles.approvalButtonText, { color: '#EF4444' }]}>Recusar</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

function ManagerCashView({ colors }: { colors: ReturnType<typeof useColors> }) {
  const { restaurantId } = useRestaurantRole();
  const { data: session, loading: sessionLoading, error: sessionError, refresh: refreshSession } = useCashRegister();
  const { data: movements, loading: movementsLoading, refresh: refreshMovements } = useCashMovements();
  const [amount, setAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const parseAmount = (): number | null => {
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Valor inválido', 'Informe um valor maior que zero.');
      return null;
    }
    return amount;
  };

  const runAction = async (label: string, action: () => Promise<unknown>) => {
    setSubmitting(true);
    try {
      await action();
      setAmount(0);
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
    void runAction('sangria', () => supabaseApiAdapter.addCashMovement(session.sessionId!, MANAGER_CASH_MOVEMENT_TYPES.withdrawal, amount, 'Sangria'));
  };

  const handleReforco = () => {
    if (!session?.sessionId) return;
    const amount = parseAmount();
    if (amount === null) return;
    void runAction('reforço', () => supabaseApiAdapter.addCashMovement(session.sessionId!, MANAGER_CASH_MOVEMENT_TYPES.reinforcement, amount, 'Reforço'));
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
      <View style={styles.cashAmountInput}>
        <CurrencyInput value={amount} onChangeValue={setAmount} />
      </View>
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
    </View>
  );
}

function ManagerTablesView() {
  useOwnerTablesRedirect();
  return null;
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
        <View key={member.id} style={[styles.staffOverviewCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View style={styles.staffIdentityRow}>
            <View style={[styles.avatar, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundSecondary, overflow: 'hidden' }]}>
              {member.avatarUrl ? (
                <Image source={{ uri: member.avatarUrl }} style={styles.staffAvatarImage} accessibilityLabel={`Foto de ${member.fullName}`} />
              ) : (
                <Text style={{ fontWeight: '700', color: colors.foreground }}>{member.fullName[0]?.toUpperCase() ?? '?'}</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.staffName, { color: colors.foreground }]}>{member.fullName}</Text>
              <Text style={[styles.staffRole, { color: colors.foregroundSecondary }]}>{member.email || 'Membro da equipe'}</Text>
            </View>
            <StatusChip
              label={member.operationalStatus === 'on_shift' ? 'Em turno' : member.isActive ? 'Ativo' : 'Inativo'}
              tone={member.operationalStatus === 'on_shift' ? 'success' : member.isActive ? 'info' : 'danger'}
            />
          </View>
          <View style={styles.staffMetricsGrid}>
            <StaffOperationalField label="Função" value={STAFF_ROLE_LABEL[member.role] || member.role} colors={colors} />
            <StaffOperationalField label="Turno" value={member.shift ? `${member.shift.startTime}–${member.shift.endTime}` : 'Sem turno'} colors={colors} />
            <StaffOperationalField label="Vendas" value={formatCurrency(member.salesValue)} colors={colors} />
            <StaffOperationalField label="Gorjetas" value={formatCurrency(member.tipsValue)} colors={colors} />
          </View>
        </View>
      ))}
    </View>
  );
}

function StaffOperationalField({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.staffOperationalField, { backgroundColor: colors.backgroundSecondary }]}>
      <Text style={[styles.staffOperationalLabel, { color: colors.foregroundSecondary }]}>{label}</Text>
      <Text numberOfLines={1} style={[styles.staffOperationalValue, { color: colors.foreground }]}>{value}</Text>
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
    </View>
  );
}

function ManagerSettingsView() {
  return (
    <View style={styles.section}>
      <ConfigHubContent compact />
    </View>
  );
}

function WaiterContent({
  view,
  setView,
  colors,
}: {
  view: WaiterRoleView;
  setView: (view: WaiterRoleView) => void;
  colors: ReturnType<typeof useColors>;
}) {
  // Deep utility views kept reachable programmatically (not part of the 4-tab nav).
  if (view === 'waiter-assistance') return <WaiterAssistanceView colors={colors} />;
  if (view === 'waiter-tap-to-pay') return <WaiterTapToPayView colors={colors} />;
  if (view === 'waiter-order-management') return <WaiterOrdersView colors={colors} />;
  if (view === 'waiter-tips') return <WaiterTipsView colors={colors} />;
  if (view === 'waiter-settings') return <PersonalSettingsView />;
  // Core waiter experience: Ao Vivo · Mesas · Cozinha · Cobrar
  return <WaiterCommandCenter view={view} setView={setView} colors={colors} />;
}

const WAITER_SEGMENTS: { label: string; view: WaiterRoleView }[] = [
  { label: 'Ao Vivo', view: 'waiter' },
  { label: 'Mesas', view: 'waiter-table-actions' },
  { label: 'Cozinha', view: 'waiter-kitchen' },
  { label: 'Cobrar', view: 'waiter-table-charge' },
];

function segmentLabelForView(view: WaiterRoleView): string {
  return WAITER_SEGMENTS.find((s) => s.view === view)?.label ?? 'Ao Vivo';
}

type MyTable = {
  id: string;
  tableNumber: string;
  seats: number;
  section: string | null;
  status: string;
  guestName: string | null;
  guestCount: number;
  totalSpent: number;
  pendingOrders: number;
};

function WaiterCommandCenter({
  view,
  setView,
  colors,
}: {
  view: WaiterRoleView;
  setView: (view: WaiterRoleView) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const navigation = useNavigation<any>();
  const { data: kdsOrders, loading: kdsLoading, refresh: refreshKds } = useKdsOrders();
  const { data: calls, refresh: refreshCalls } = useServiceCalls();
  const { data: bills, loading: billsLoading, refresh: refreshBills } = useTableBills();
  const { data: restaurantTables, loading: tablesLoading } = useRestaurantTables();

  const tables: MyTable[] = restaurantTables.map((table) => {
    const tableLabel = `Mesa ${table.label}`;
    return {
      id: table.id,
      tableNumber: table.label,
      seats: table.seats,
      section: table.section || null,
      status: table.status,
      guestName: table.guestName,
      guestCount: table.guests,
      totalSpent: table.totalSpent,
      pendingOrders: kdsOrders.filter(
        (order) => order.table === tableLabel && order.status !== 'ready',
      ).length,
    };
  });

  const readyOrders = kdsOrders.filter((o) => o.status === 'ready');
  const openCalls = calls.filter((c) => c.status === 'open');
  const activeTables = tables.filter((t) => t.status === 'occupied' || t.guestCount > 0 || t.pendingOrders > 0);
  const unpaidBills = bills.filter((b) => !b.isPaid);

  return (
    <View style={styles.section}>
      <WaiterStats
        mesas={activeTables.length}
        retirar={readyOrders.length}
        chamados={openCalls.length}
        cobrar={unpaidBills.length}
      />
      <WaiterSegments
        active={segmentLabelForView(view)}
        counts={{
          'Ao Vivo': readyOrders.length + openCalls.length,
          Cozinha: readyOrders.length,
          Cobrar: unpaidBills.length,
        }}
        onSelect={(label) => {
          const target = WAITER_SEGMENTS.find((s) => s.label === label);
          if (!target) return;
          setView(target.view);
          if (target.view === 'waiter-table-actions') navigation.navigate('Tables');
        }}
      />
      {view === 'waiter-table-actions' ? (
        <WaiterTablesBody
          tables={tables}
          loading={tablesLoading}
          kdsOrders={kdsOrders}
          calls={calls}
          bills={bills}
          colors={colors}
        />
      ) : view === 'waiter-kitchen' ? (
        <WaiterKitchenBody
          orders={kdsOrders}
          loading={kdsLoading}
          colors={colors}
          onChanged={() => { void refreshKds(); }}
        />
      ) : view === 'waiter-table-charge' ? (
        <WaiterChargeBody
          bills={bills}
          loading={billsLoading}
          colors={colors}
          onRefresh={refreshBills}
        />
      ) : (
        <WaiterLiveBody
          readyOrders={readyOrders}
          calls={calls}
          colors={colors}
          onRefresh={() => { void refreshKds(); void refreshCalls(); }}
        />
      )}
    </View>
  );
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

function WaiterLiveBody({
  readyOrders,
  calls,
  colors,
  onRefresh,
}: {
  readyOrders: KdsOrder[];
  calls: ServiceCall[];
  colors: ReturnType<typeof useColors>;
  onRefresh: () => void;
}) {
  const [acting, setActing] = useState<string | null>(null);

  const runAction = async (key: string, action: () => Promise<unknown>) => {
    setActing(key);
    try {
      await action();
      onRefresh();
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
    <>
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
    </>
  );
}

function WaiterTablesBody({
  tables,
  loading,
  kdsOrders,
  calls,
  bills,
  colors,
}: {
  tables: MyTable[];
  loading: boolean;
  kdsOrders: KdsOrder[];
  calls: ServiceCall[];
  bills: TableBill[];
  colors: ReturnType<typeof useColors>;
}) {
  if (loading && tables.length === 0) {
    return <InlineNotice message="Carregando mesas..." colors={colors} />;
  }
  if (tables.length === 0) {
    return <InlineNotice message="Nenhuma mesa cadastrada neste restaurante." colors={colors} />;
  }

  return (
    <>
      {tables.map((table) => {
        const tableLabel = `Mesa ${table.tableNumber}`;
        const hasReadyPlate = kdsOrders.some((o) => o.status === 'ready' && o.table === tableLabel);
        const openCallCount = calls.filter(
          (c) => c.status === 'open' && String(c.tableNumber ?? '') === table.tableNumber,
        ).length;
        const tableBills = bills.filter((b) => b.tableNumber === table.tableNumber);
        const paidCount = tableBills.filter((b) => b.isPaid).length;
        const paidRatio = tableBills.length > 0 ? paidCount / tableBills.length : 0;
        const isOccupied = table.status === 'occupied' || table.guestCount > 0 || table.pendingOrders > 0;
        const accent = openCallCount > 0 || hasReadyPlate ? '#EF4444' : isOccupied ? colors.primary : '#CBD5E1';

        return (
          <View
            key={table.id}
            style={[styles.waiterTableCard, { borderColor: `${accent}55`, backgroundColor: colors.card }]}
          >
            <View style={styles.waiterTableTop}>
              <View style={[styles.waiterTableNumber, { backgroundColor: `${accent}18` }]}>
                <Text style={[styles.waiterTableNumberText, { color: accent }]}>{table.tableNumber}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.staffName, { color: colors.foreground, fontSize: 15 }]}>
                  {table.guestName || (isOccupied ? 'Mesa ocupada' : 'Mesa livre')}
                </Text>
                <Text style={[styles.staffRole, { color: colors.foregroundSecondary }]}>
                  {table.guestCount > 0 ? `${table.guestCount} ${table.guestCount === 1 ? 'pessoa' : 'pessoas'}` : `${table.seats} lugares`}
                  {' · '}
                  {table.pendingOrders} {table.pendingOrders === 1 ? 'pedido' : 'pedidos'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={[styles.waiterTableTotal, { color: colors.foreground }]}>
                  {formatCurrency(table.totalSpent)}
                </Text>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {hasReadyPlate ? <StatusChip label="PRATO" tone="danger" /> : null}
                  {openCallCount > 0 ? <StatusChip label={`${openCallCount} CHAMADO`} tone="warning" /> : null}
                </View>
              </View>
            </View>
            {tableBills.length > 0 ? (
              <View style={styles.waiterTableProgressRow}>
                <View style={styles.waiterProgressTrack}>
                  <View style={[styles.waiterProgressFill, { width: `${Math.round(paidRatio * 100)}%`, backgroundColor: paidRatio >= 1 ? '#22C55E' : colors.primary }]} />
                </View>
                <Text style={[styles.waiterProgressPct, { color: colors.foregroundSecondary }]}>
                  {Math.round(paidRatio * 100)}%
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </>
  );
}

function WaiterKitchenBody({
  orders,
  loading,
  colors,
  onChanged,
}: {
  orders: KdsOrder[];
  loading: boolean;
  colors: ReturnType<typeof useColors>;
  onChanged: () => void;
}) {
  const [acting, setActing] = useState<string | null>(null);
  const ready = orders.filter((o) => o.status === 'ready');
  const preparing = orders.filter((o) => o.status !== 'ready');

  const pickup = async (orderId: string) => {
    setActing(orderId);
    try {
      await ApiService.updateOrderStatus(orderId, 'delivered');
      onChanged();
    } catch (err) {
      Alert.alert('Falha ao retirar', err instanceof Error ? err.message : 'Tente novamente.');
    } finally {
      setActing(null);
    }
  };

  if (loading && orders.length === 0) {
    return <InlineNotice message="Carregando cozinha..." colors={colors} />;
  }

  return (
    <>
      {ready.length > 0 ? (
        <View style={[styles.tipBanner, { backgroundColor: V2_TONE.danger.bg, borderColor: '#FECACA' }]}>
          <ChefHat size={16} color="#FF5A3D" />
          <Text style={styles.tipBannerText}>{ready.length} prato(s) para retirar!</Text>
        </View>
      ) : null}

      {ready.length > 0 ? (
        <Text style={[styles.waiterSectionLabel, { color: '#EF4444' }]}>● PRONTO</Text>
      ) : null}
      {ready.map((order) => (
        <View key={order.id} style={[styles.managerOrderCard, { borderColor: '#FECACA', backgroundColor: '#FEF2F2' }]}>
          <View style={styles.managerOrderHeader}>
            <View style={styles.waiterKitchenNumber}>
              <Text style={styles.waiterKitchenNumberText}>{order.table.replace('Mesa ', '')}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.staffName, { color: colors.foreground }]}>
                {order.items.map(([label]) => label).join(', ')}
              </Text>
              <Text style={[styles.staffRole, { color: colors.foregroundSecondary }]}>{order.meta}</Text>
            </View>
            <TouchableOpacity
              disabled={acting === order.id}
              onPress={() => void pickup(order.id)}
              style={[styles.waiterPickupBtn, { opacity: acting === order.id ? 0.6 : 1 }]}
            >
              <Text style={styles.waiterPickupBtnText}>Retirar ✓</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {preparing.length > 0 ? (
        <Text style={[styles.waiterSectionLabel, { color: '#F59E0B' }]}>● PREPARANDO</Text>
      ) : null}
      {preparing.map((order) => {
        const lastTime = order.items[order.items.length - 1]?.[1] ?? order.time;
        return (
          <View key={order.id} style={[styles.managerOrderCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <View style={styles.managerOrderHeader}>
              <View style={[styles.waiterKitchenNumber, { backgroundColor: '#FEF3C7' }]}>
                <Text style={[styles.waiterKitchenNumberText, { color: '#B45309' }]}>{order.table.replace('Mesa ', '')}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.staffName, { color: colors.foreground }]}>
                  {order.items.map(([label]) => label).join(', ')}
                </Text>
                <Text style={[styles.staffRole, { color: colors.foregroundSecondary }]}>{order.meta}</Text>
              </View>
              <View style={styles.waiterTimerPill}>
                <Timer size={12} color="#F59E0B" />
                <Text style={styles.waiterTimerText}>{lastTime || '—'}</Text>
              </View>
            </View>
          </View>
        );
      })}

      {ready.length === 0 && preparing.length === 0 ? (
        <InlineNotice message="Nenhum pedido na cozinha no momento." colors={colors} />
      ) : null}
    </>
  );
}

type AssistanceTab = 'qr' | 'allergens' | 'feedback' | 'special';

function allergenIcon(allergen: AssistanceAllergenGroup): IconComponent {
  if (allergen.key.includes('gluten')) return Wheat;
  if (allergen.key.includes('lact')) return Droplets;
  if (allergen.key.includes('mar') || allergen.key.includes('crust')) return UtensilsCrossed;
  return ShieldAlert;
}

function serviceStageLabel(stage: AssistanceFeedbackCandidate['service_stage']): string {
  if (stage === 'finishing') return 'Finalizando';
  if (stage === 'dessert') return 'Sobremesa';
  if (stage === 'main') return 'Prato principal';
  return 'Atendimento';
}

function specialRequestVisual(request: AssistanceSpecialRequest) {
  const visual = {
    birthday: { icon: Gift, color: '#38BDF8', bg: '#F0F9FF' },
    accessibility: { icon: Accessibility, color: '#F59E0B', bg: '#FFF7ED' },
    vip: { icon: Star, color: '#FF5A3D', bg: '#FFF1ED' },
    dietary: { icon: ShieldAlert, color: '#EF4444', bg: '#FEF2F2' },
    courtesy: { icon: Gift, color: '#16A66A', bg: '#F0FDF7' },
    photo: { icon: Eye, color: '#8B5CF6', bg: '#F5F3FF' },
    other: { icon: Star, color: '#FF5A3D', bg: '#FFF1ED' },
  }[request.request_type];
  return { ...visual, backgroundColor: visual.bg };
}

function WaiterAssistanceView({ colors }: { colors: ReturnType<typeof useColors> }) {
  const { data: assistance, loading, error, refresh } = useCustomerAssistanceHub();
  const occupied = assistance.onboarding.map((table) => ({
    id: table.table_id,
    label: table.table_number,
    section: table.section,
    guests: Number(table.guest_count || 0),
    seats: Number(table.seats || 0),
    qrCodeData: table.qr_code_data,
    qrCodeImage: table.qr_code_image,
  }));
  const allergenItems = assistance.allergens.map((allergen) => ({
    id: allergen.key,
    name: allergen.name,
    icon: allergenIcon(allergen),
    items: allergen.items,
    affected: allergen.affected_customers.length > 0
      ? allergen.affected_customers.map((customer) => `Mesa ${customer.table_number} — ${customer.customer_name}`).join(', ')
      : 'Nenhum reportado',
  }));
  const feedbackItems = assistance.feedback.map((feedback) => ({
    id: feedback.feedback_id || feedback.table_session_id,
    tableSessionId: feedback.table_session_id,
    table: feedback.table_number,
    customer: feedback.customer_name,
    status: serviceStageLabel(feedback.service_stage),
    serviceStage: feedback.service_stage,
    sentiment: feedback.sentiment,
    rating: feedback.rating,
    note: feedback.note || '',
    isCollected: Boolean(feedback.feedback_id),
  }));
  const specialItems = assistance.special_requests.map((request) => ({
    ...specialRequestVisual(request),
    id: request.id,
    table: request.table_number || '—',
    title: request.title,
    description: request.description,
    action: request.status === 'acknowledged' ? 'Concluir' : request.action_label || 'Assumir',
    status: request.status,
  }));
  const [activeTab, setActiveTab] = useState<AssistanceTab>('qr');
  const [qrShown, setQrShown] = useState<string | null>(null);
  const [feedbackDraft, setFeedbackDraft] = useState<{
    candidate: AssistanceFeedbackCandidate;
    sentiment: AssistanceSentiment;
    rating: number;
    note: string;
  } | null>(null);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [updatingRequestId, setUpdatingRequestId] = useState<string | null>(null);

  const tabs: { id: AssistanceTab; label: string; count: number; icon: IconComponent }[] = [
    { id: 'qr', label: 'QR / Onboarding', count: occupied.length, icon: QrCode },
    { id: 'allergens', label: 'Alérgenos', count: allergenItems.length, icon: ShieldAlert },
    { id: 'feedback', label: 'Feedback', count: assistance.feedback_stats.pending, icon: MessageSquare },
    { id: 'special', label: 'Especiais', count: assistance.special_requests.filter((item) => item.status === 'pending' || item.status === 'acknowledged').length, icon: Star },
  ];

  const submitFeedback = async () => {
    if (!feedbackDraft) return;
    setSavingFeedback(true);
    try {
      await supabaseApiAdapter.collectCustomerFeedback(
        feedbackDraft.candidate.table_session_id,
        feedbackDraft.sentiment,
        feedbackDraft.rating,
        feedbackDraft.note,
        feedbackDraft.candidate.service_stage,
      );
      setFeedbackDraft(null);
      await refresh();
    } catch (err) {
      Alert.alert('Não foi possível salvar o feedback', err instanceof Error ? err.message : 'Tente novamente.');
    } finally {
      setSavingFeedback(false);
    }
  };

  const advanceSpecialRequest = async (request: AssistanceSpecialRequest) => {
    if (request.status === 'resolved' || request.status === 'dismissed') return;
    setUpdatingRequestId(request.id);
    try {
      await supabaseApiAdapter.updateAssistanceSpecialRequestStatus(
        request.id,
        request.status === 'pending' ? 'acknowledged' : 'resolved',
      );
      await refresh();
    } catch (err) {
      Alert.alert('Não foi possível atualizar o pedido', err instanceof Error ? err.message : 'Tente novamente.');
    } finally {
      setUpdatingRequestId(null);
    }
  };

  return (
    <View style={styles.section}>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.assistanceTabs}
        accessibilityRole="tablist"
      >
        {tabs.map((tab) => {
          const selected = activeTab === tab.id;
          const TabIcon = tab.icon;
          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.8}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={`${tab.label}, ${tab.count} itens`}
              style={[
                styles.assistanceTab,
                { backgroundColor: selected ? '#FF4B2B' : colors.backgroundSecondary },
              ]}
            >
              <TabIcon size={12} color={selected ? '#FFFFFF' : colors.foregroundSecondary} strokeWidth={2.4} />
              <Text style={[styles.assistanceTabText, { color: selected ? '#FFFFFF' : colors.foregroundSecondary }]}>{tab.label}</Text>
              <Text style={[styles.assistanceTabCount, { color: selected ? '#FFFFFF' : colors.foregroundSecondary }]}>({tab.count})</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {activeTab === 'qr' ? (
        <>
          <AssistanceBanner
            icon={QrCode}
            title="Onboarding de Clientes"
            description="Ajude clientes sem app a se conectarem — mostre o QR code da mesa"
            color="#0284C7"
            backgroundColor="#F0F9FF"
            borderColor="#BAE6FD"
          />
          {loading ? (
            <InlineNotice message="Carregando mesas..." colors={colors} />
          ) : error ? (
            <InlineNotice message={error} actionLabel="Recarregar" onPress={() => void refresh()} colors={colors} />
          ) : occupied.length === 0 ? (
            <InlineNotice message="Nenhuma mesa ocupada com QR code disponível." colors={colors} />
          ) : (
            occupied.map((table) => {
              const isShown = qrShown === table.id;
              return (
                <View
                  key={table.id}
                  style={[
                    styles.assistanceCustomerCard,
                    { borderColor: isShown ? '#A7E3C8' : colors.border, backgroundColor: colors.card },
                  ]}
                >
                  <View style={styles.assistanceCustomerRow}>
                    <View style={styles.tableNumberBubble}><Text style={styles.tableNumberText}>{table.label}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.reservationTitle, { color: colors.foreground }]}>Mesa {table.label}</Text>
                      <Text style={[styles.staffRole, { color: colors.foregroundSecondary }]}>
                        {table.guests || table.seats} {(table.guests || table.seats) === 1 ? 'pessoa' : 'pessoas'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setQrShown(isShown ? null : table.id)}
                      activeOpacity={0.82}
                      accessibilityRole="button"
                      accessibilityLabel={isShown ? `Ocultar QR da mesa ${table.label}` : `Mostrar QR da mesa ${table.label}`}
                      style={[styles.assistancePrimaryButton, { backgroundColor: isShown ? '#22B66F' : '#FF4B2B' }]}
                    >
                      <Text style={styles.assistancePrimaryButtonText}>{isShown ? '✓ QR Exibido' : 'Mostrar QR'}</Text>
                    </TouchableOpacity>
                  </View>
                  {isShown ? (
                    <View style={[styles.assistanceQrPanel, { backgroundColor: colors.backgroundSecondary }]}>
                      <View style={styles.assistanceQrCode}>
                        <QRCode
                          value={table.qrCodeData}
                          size={94}
                          color="#111827"
                          backgroundColor="#FFFFFF"
                          quietZone={4}
                        />
                      </View>
                      <Text style={[styles.assistanceQrLabel, { color: colors.foregroundSecondary }]}>QR Code da Mesa {table.label}</Text>
                      <Text style={[styles.assistanceQrHelp, { color: colors.foregroundSecondary }]}>O cliente escaneia para acessar o cardápio, fazer pedidos e pagar</Text>
                      <View style={styles.assistanceQrActions}>
                        <TouchableOpacity
                          onPress={() => void Share.share({
                            title: `Mesa ${table.label}`,
                            message: table.qrCodeData,
                          })}
                          style={[styles.assistanceSmallButton, { backgroundColor: '#FF4B2B', borderColor: '#FF4B2B' }]}
                        >
                          <Text style={[styles.assistanceSmallButtonText, { color: '#FFFFFF' }]}>Compartilhar Link</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => Alert.alert('Imprimir QR', `QR da mesa ${table.label} enviado para impressão.`)}
                          style={[styles.assistanceSmallButton, { borderColor: colors.border, backgroundColor: colors.card }]}
                        >
                          <Text style={[styles.assistanceSmallButtonText, { color: colors.foreground }]}>Imprimir QR</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </>
      ) : null}

      {activeTab === 'allergens' ? (
        <>
          <AssistanceBanner
            icon={ShieldAlert}
            title="Alerta de Alérgenos"
            description="Consulte alérgenos por categoria e veja quais clientes reportaram restrições"
            color="#F59E0B"
            backgroundColor="#FFFBEB"
            borderColor="#FED7AA"
          />
          {loading ? <InlineNotice message="Carregando alérgenos..." colors={colors} /> : null}
          {error ? <InlineNotice message={error} actionLabel="Recarregar" onPress={() => void refresh()} colors={colors} /> : null}
          {!loading && !error && allergenItems.length === 0 ? <InlineNotice message="Nenhum alérgeno cadastrado nos itens ativos do cardápio." colors={colors} /> : null}
          {allergenItems.map((allergen) => {
            const AllergenIcon = allergen.icon;
            return (
              <View key={allergen.id} style={[styles.assistanceInfoCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <View style={styles.assistanceInfoHeader}>
                  <View style={[styles.assistanceIconBox, { backgroundColor: '#FFF7ED' }]}><AllergenIcon size={22} color="#F59E0B" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.assistanceCardTitle, { color: colors.foreground }]}>{allergen.name}</Text>
                    <Text style={[styles.assistanceCardSubtitle, { color: colors.foregroundSecondary }]}>{allergen.items.length} itens no cardápio contêm</Text>
                  </View>
                </View>
                <View style={styles.assistanceTags}>
                  {allergen.items.map((item) => (
                    <Text key={item} style={styles.assistanceAllergenTag}>{item}</Text>
                  ))}
                </View>
                <View style={[styles.assistanceRestriction, { backgroundColor: colors.backgroundSecondary }]}>
                  <Text style={[styles.assistanceRestrictionText, { color: colors.foregroundSecondary }]}>
                    <Text style={{ color: colors.foreground, fontWeight: '800' }}>Clientes com restrição: </Text>{allergen.affected}
                  </Text>
                </View>
              </View>
            );
          })}
        </>
      ) : null}

      {activeTab === 'feedback' ? (
        <>
          <AssistanceBanner
            icon={MessageSquare}
            title="Captura de Feedback"
            description="Pergunte ao cliente como está a experiência — registre observações antes que saiam"
            color="#16A66A"
            backgroundColor="#F0FDF7"
            borderColor="#B7E4CF"
          />
          {loading ? <InlineNotice message="Carregando oportunidades de feedback..." colors={colors} /> : null}
          {error ? <InlineNotice message={error} actionLabel="Recarregar" onPress={() => void refresh()} colors={colors} /> : null}
          <View style={styles.assistanceStatsRow}>
            {[
              { label: 'Positivos', value: assistance.feedback_stats.positive, color: '#16A66A' },
              { label: 'Neutros', value: assistance.feedback_stats.neutral, color: '#F59E0B' },
              { label: 'Coletados', value: assistance.feedback_stats.collected, color: '#0EA5E9' },
              { label: 'Pendentes', value: assistance.feedback_stats.pending, color: '#FF4B2B' },
            ].map((stat) => (
              <View key={stat.label} style={[styles.assistanceStatCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Text style={[styles.assistanceStatValue, { color: stat.color }]}>{stat.value}</Text>
                <Text style={[styles.assistanceStatLabel, { color: colors.foregroundSecondary }]}>{stat.label}</Text>
              </View>
            ))}
          </View>
          {!loading && !error && feedbackItems.length === 0 ? <InlineNotice message="Nenhuma mesa ativa aguardando feedback." colors={colors} /> : null}
          {feedbackItems.map((feedback) => {
            const toneColor = feedback.sentiment === 'positive' ? '#16A66A' : feedback.sentiment === 'negative' ? '#EF4444' : '#F59E0B';
            const sentimentLabel = feedback.sentiment === 'positive'
              ? '☺ Positivo'
              : feedback.sentiment === 'negative'
                ? '● Negativo'
                : feedback.sentiment === 'neutral'
                  ? '◉ Neutro'
                  : 'Pendente';
            return (
              <View
                key={feedback.id}
                style={[
                  styles.assistanceFeedbackCard,
                  { borderColor: feedback.isCollected ? '#B7E4CF' : `${toneColor}45`, backgroundColor: colors.card, opacity: feedback.isCollected ? 0.72 : 1 },
                ]}
              >
                <View style={styles.tableNumberBubble}><Text style={styles.tableNumberText}>{feedback.table}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.assistanceCardTitle, { color: colors.foreground }]}>{feedback.customer}</Text>
                  <View style={styles.assistanceFeedbackMeta}>
                    <Text style={[styles.assistanceSentiment, { color: toneColor, backgroundColor: `${toneColor}12` }]}>{sentimentLabel}</Text>
                    <Text style={[styles.assistanceFeedbackStatus, { color: colors.foregroundSecondary }]}>{feedback.status}</Text>
                  </View>
                  {feedback.note ? <Text style={[styles.assistanceFeedbackNote, { color: colors.foregroundSecondary }]}>“{feedback.note}”</Text> : null}
                </View>
                {feedback.isCollected ? (
                  <View style={styles.assistanceCollected}><CheckCircle size={16} color="#16A66A" /><Text style={styles.assistanceCollectedText}>Coletado</Text></View>
                ) : (
                  <TouchableOpacity
                    onPress={() => {
                      const candidate = assistance.feedback.find((item) => item.table_session_id === feedback.tableSessionId);
                      if (candidate) {
                        setFeedbackDraft({ candidate, sentiment: 'positive', rating: 5, note: '' });
                      }
                    }}
                    style={styles.assistancePrimaryButton}
                  >
                    <Text style={styles.assistancePrimaryButtonText}>Coletar</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </>
      ) : null}

      {activeTab === 'special' ? (
        <>
          <AssistanceBanner
            icon={Star}
            title="Pedidos Especiais & Cortesias"
            description="Aniversários, VIPs, acessibilidade, restrições e pedidos especiais"
            color="#FF4B2B"
            backgroundColor="#FFF7F5"
            borderColor="#FFC7BA"
          />
          {loading ? <InlineNotice message="Carregando pedidos especiais..." colors={colors} /> : null}
          {error ? <InlineNotice message={error} actionLabel="Recarregar" onPress={() => void refresh()} colors={colors} /> : null}
          {!loading && !error && specialItems.length === 0 ? <InlineNotice message="Nenhum pedido especial pendente." colors={colors} /> : null}
          {specialItems.map((request) => {
            const RequestIcon = request.icon;
            const isSent = request.status === 'resolved' || request.status === 'dismissed';
            return (
              <View key={request.id} style={[styles.assistanceSpecialCard, { borderColor: isSent ? '#B7E4CF' : colors.border, backgroundColor: colors.card, opacity: isSent ? 0.62 : 1 }]}>
                <View style={styles.assistanceSpecialContent}>
                  <View style={[styles.assistanceSpecialIcon, { backgroundColor: request.backgroundColor }]}><RequestIcon size={24} color={request.color} /></View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.assistanceSpecialTags}>
                      <Text style={styles.assistanceTableTag}>Mesa {request.table}</Text>
                      <Text style={[styles.assistanceTypeTag, { color: request.color, backgroundColor: request.backgroundColor }]}>{request.title}</Text>
                    </View>
                    <Text style={[styles.assistanceSpecialDescription, { color: colors.foregroundSecondary }]}>{request.description}</Text>
                  </View>
                </View>
                {isSent ? (
                  <View style={styles.assistanceProcessed}><CheckCircle size={16} color="#16A66A" /><Text style={styles.assistanceProcessedText}>Processado</Text></View>
                ) : (
                  <TouchableOpacity
                    disabled={updatingRequestId === request.id}
                    onPress={() => {
                      const source = assistance.special_requests.find((item) => item.id === request.id);
                      if (source) void advanceSpecialRequest(source);
                    }}
                    style={[
                      styles.assistanceSpecialAction,
                      { backgroundColor: request.backgroundColor, borderTopColor: colors.border, opacity: updatingRequestId === request.id ? 0.55 : 1 },
                    ]}
                  >
                    <Text style={[styles.assistanceSpecialActionText, { color: request.color }]}>
                      {updatingRequestId === request.id ? 'Atualizando…' : `${request.action} →`}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </>
      ) : null}

      <Modal
        visible={feedbackDraft !== null}
        transparent
        animationType="fade"
        onRequestClose={() => !savingFeedback && setFeedbackDraft(null)}
      >
        <View style={styles.waiterModalOverlay}>
          <View style={[styles.waiterModalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.panelTitle, { color: colors.foreground, marginBottom: 4 }]}>Coletar feedback</Text>
            <Text style={[styles.staffRole, { color: colors.foregroundSecondary, marginBottom: 16 }]}>
              {feedbackDraft ? `${feedbackDraft.candidate.customer_name} · Mesa ${feedbackDraft.candidate.table_number}` : ''}
            </Text>

            <Text style={[styles.assistanceFormLabel, { color: colors.foreground }]}>Sentimento</Text>
            <View style={styles.assistanceFormOptions}>
              {([
                { id: 'positive' as const, label: 'Positivo', color: '#16A66A' },
                { id: 'neutral' as const, label: 'Neutro', color: '#F59E0B' },
                { id: 'negative' as const, label: 'Negativo', color: '#EF4444' },
              ]).map((option) => {
                const selected = feedbackDraft?.sentiment === option.id;
                return (
                  <TouchableOpacity
                    key={option.id}
                    disabled={savingFeedback}
                    onPress={() => setFeedbackDraft((current) => current ? { ...current, sentiment: option.id } : current)}
                    style={[
                      styles.assistanceFormOption,
                      {
                        borderColor: selected ? option.color : colors.border,
                        backgroundColor: selected ? `${option.color}12` : colors.backgroundSecondary,
                      },
                    ]}
                  >
                    <Text style={{ color: selected ? option.color : colors.foregroundSecondary, fontSize: 11, fontWeight: '800' }}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.assistanceFormLabel, { color: colors.foreground }]}>Nota</Text>
            <View style={styles.assistanceRatingRow}>
              {[1, 2, 3, 4, 5].map((rating) => (
                <TouchableOpacity
                  key={rating}
                  disabled={savingFeedback}
                  onPress={() => setFeedbackDraft((current) => current ? { ...current, rating } : current)}
                  style={[
                    styles.assistanceRatingButton,
                    {
                      borderColor: feedbackDraft?.rating === rating ? '#FF4B2B' : colors.border,
                      backgroundColor: feedbackDraft?.rating === rating ? '#FFF1ED' : colors.backgroundSecondary,
                    },
                  ]}
                >
                  <Text style={{ color: feedbackDraft?.rating === rating ? '#FF4B2B' : colors.foregroundSecondary, fontWeight: '900' }}>{rating}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.assistanceFormLabel, { color: colors.foreground }]}>Observação</Text>
            <TextInput
              editable={!savingFeedback}
              multiline
              maxLength={2000}
              value={feedbackDraft?.note || ''}
              onChangeText={(note) => setFeedbackDraft((current) => current ? { ...current, note } : current)}
              placeholder="O que o cliente comentou?"
              placeholderTextColor={colors.foregroundSecondary}
              style={[
                styles.assistanceFeedbackInput,
                { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.backgroundSecondary },
              ]}
            />

            <View style={styles.assistanceFormActions}>
              <TouchableOpacity
                disabled={savingFeedback}
                onPress={() => setFeedbackDraft(null)}
                style={[styles.assistanceFormButton, { borderColor: colors.border }]}
              >
                <Text style={{ color: colors.foregroundSecondary, fontWeight: '800' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={savingFeedback}
                onPress={() => void submitFeedback()}
                style={[styles.assistanceFormButton, { backgroundColor: '#FF4B2B', borderColor: '#FF4B2B', opacity: savingFeedback ? 0.6 : 1 }]}
              >
                {savingFeedback
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Salvar feedback</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function AssistanceBanner({
  icon: Icon,
  title,
  description,
  color,
  backgroundColor,
  borderColor,
}: {
  icon: IconComponent;
  title: string;
  description: string;
  color: string;
  backgroundColor: string;
  borderColor: string;
}) {
  return (
    <View style={[styles.assistanceBanner, { backgroundColor, borderColor }]}>
      <Icon size={19} color={color} strokeWidth={2.2} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.assistanceBannerTitle, { color }]}>{title}</Text>
        <Text style={styles.assistanceBannerDescription}>{description}</Text>
      </View>
    </View>
  );
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: 'Dinheiro',
  credit_card: 'Crédito',
  debit_card: 'Débito',
  pix: 'Pix',
  wallet: 'Carteira',
  voucher: 'Voucher',
  apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
  other: 'Outro',
};

const CHARGE_METHODS: { id: string; label: string }[] = [
  { id: 'cash', label: 'Dinheiro' },
  { id: 'pix', label: 'Pix' },
  { id: 'credit_card', label: 'Crédito' },
  { id: 'debit_card', label: 'Débito' },
];

function WaiterChargeBody({
  bills,
  loading,
  colors,
  onRefresh,
}: {
  bills: TableBill[];
  loading: boolean;
  colors: ReturnType<typeof useColors>;
  onRefresh: () => Promise<void>;
}) {
  const navigation = useNavigation<any>();
  const [charging, setCharging] = useState<TableBill | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const groups = React.useMemo(() => {
    const map = new Map<string, TableBill[]>();
    for (const bill of bills) {
      const key = bill.tableNumber;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(bill);
    }
    return Array.from(map.entries()).sort((a, b) => Number(a[0]) - Number(b[0]));
  }, [bills]);

  const doCharge = async (method: string) => {
    if (!charging) return;
    setSubmitting(true);
    try {
      await supabaseApiAdapter.recordPayment(charging.orderId, method, charging.totalAmount);
      setCharging(null);
      await onRefresh();
    } catch (err) {
      Alert.alert('Falha ao cobrar', err instanceof Error ? err.message : 'Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => navigation.navigate('WaiterTapToPay')}
        activeOpacity={0.85}
        style={[styles.waiterTapToPayCta, { backgroundColor: colors.primary }]}
      >
        <View style={styles.waiterTapToPayIcon}>
          <CreditCardIcon size={20} color="#FFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.waiterTapToPayTitle}>Tap to Pay</Text>
          <Text style={styles.waiterTapToPaySub}>Digite um valor e cobre por aproximação</Text>
        </View>
        <Text style={styles.waiterTapToPayArrow}>→</Text>
      </TouchableOpacity>

      <View style={[styles.tipBanner, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }]}>
        <Text style={[styles.tipBannerText, { color: '#EA580C', fontWeight: '800' }]}>Cobrança inteligente</Text>
        <Text style={[styles.tipBannerText, { color: '#C2410C', fontWeight: '500' }]}>
          Quem pagou pelo app aparece automaticamente. Cobre apenas quem precisa.
        </Text>
      </View>

      {loading && bills.length === 0 ? (
        <InlineNotice message="Carregando contas..." colors={colors} />
      ) : groups.length === 0 ? (
        <InlineNotice message="Nenhuma conta nas últimas 24h." colors={colors} />
      ) : (
        groups.map(([tableNumber, tableBills]) => {
          const paid = tableBills.filter((b) => b.isPaid).length;
          const total = tableBills.length;
          const unpaid = total - paid;
          return (
            <View key={tableNumber} style={[styles.waiterChargeGroup, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <View style={styles.waiterChargeGroupHeader}>
                <View style={[styles.waiterKitchenNumber, { backgroundColor: `${colors.primary}18` }]}>
                  <Text style={[styles.waiterKitchenNumberText, { color: colors.primary }]}>{tableNumber}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.staffName, { color: colors.foreground, fontSize: 14 }]}>Mesa {tableNumber}</Text>
                  <Text style={[styles.staffRole, { color: colors.foregroundSecondary }]}>
                    {paid} pago · {unpaid} a cobrar
                  </Text>
                </View>
                <StatusChip label={`${paid}/${total}`} tone={unpaid === 0 ? 'success' : 'warning'} />
              </View>
              {tableBills.map((bill, index) => (
                <View
                  key={bill.orderId}
                  style={[
                    styles.waiterChargeRow,
                    index < tableBills.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.staffName, { color: bill.isPaid ? colors.foregroundSecondary : colors.foreground }]}>
                      {formatCurrency(bill.totalAmount)}
                    </Text>
                    <Text style={[styles.staffRole, { color: bill.isPaid ? '#22C55E' : '#F97316' }]}>
                      {bill.isPaid
                        ? `Pago${bill.paymentMethod ? ` · ${PAYMENT_METHOD_LABEL[bill.paymentMethod] ?? bill.paymentMethod}` : ''}`
                        : 'Sem app · aguardando'}
                    </Text>
                  </View>
                  {bill.isPaid ? (
                    <CheckCircle size={20} color="#22C55E" />
                  ) : (
                    <TouchableOpacity
                      onPress={() => setCharging(bill)}
                      style={styles.waiterChargeBtn}
                    >
                      <Text style={styles.waiterChargeBtnText}>Cobrar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          );
        })
      )}

      <Modal visible={charging !== null} transparent animationType="fade" onRequestClose={() => !submitting && setCharging(null)}>
        <View style={styles.waiterModalOverlay}>
          <View style={[styles.waiterModalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.panelTitle, { color: colors.foreground, marginBottom: 4 }]}>Cobrar mesa {charging?.tableNumber}</Text>
            <Text style={[styles.staffRole, { color: colors.foregroundSecondary, marginBottom: 16 }]}>
              {charging ? formatCurrency(charging.totalAmount) : ''} · escolha a forma de pagamento
            </Text>
            <View style={styles.waiterMethodGrid}>
              {CHARGE_METHODS.map((method) => (
                <TouchableOpacity
                  key={method.id}
                  disabled={submitting}
                  onPress={() => void doCharge(method.id)}
                  style={[styles.waiterMethodBtn, { borderColor: colors.border, opacity: submitting ? 0.6 : 1 }]}
                >
                  <Text style={[styles.waiterMethodBtnText, { color: colors.foreground }]}>{method.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              disabled={submitting}
              onPress={() => setCharging(null)}
              style={styles.waiterModalCancel}
            >
              <Text style={{ color: colors.foregroundSecondary, fontWeight: '700' }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

function WaiterTapToPayView({ colors }: { colors: ReturnType<typeof useColors> }) {
  const navigation = useNavigation<any>();
  return (
    <View style={styles.section}>
      <View style={[styles.listPanel, { borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center' }]}>
        <Phone size={54} color={colors.primary} />
        <Text style={[styles.panelTitle, { color: colors.foreground, marginTop: 14 }]}>Tap to Pay</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('WaiterTapToPay')}
          style={[styles.actionBtn, { backgroundColor: colors.primary, alignSelf: 'stretch' }]}
        >
          <Text style={{ color: '#FFF', fontWeight: '800', textAlign: 'center' }}>Abrir cobrança por aproximação</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const WAITER_ORDER_FILTERS: { label: string; value: string }[] = [
  { label: 'Todos', value: 'all' },
  { label: 'Pendente', value: 'pending' },
  { label: 'Confirmado', value: 'confirmed' },
  { label: 'Preparando', value: 'preparing' },
  { label: 'Prontos', value: 'ready' },
];

const RAW_ORDER_LABEL: Record<string, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmado',
  preparing: 'Preparando',
  open_for_additions: 'Aberto',
  ready: 'Pronto',
  delivered: 'Entregue',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};

const RAW_ORDER_TONE: Record<string, V2Tone> = {
  pending: 'warning',
  confirmed: 'info',
  preparing: 'warning',
  open_for_additions: 'info',
  ready: 'success',
  delivered: 'info',
  completed: 'success',
  cancelled: 'danger',
};

function WaiterOrdersView({ colors }: { colors: ReturnType<typeof useColors> }) {
  const { restaurantId } = useRestaurantRole();
  const { data: orders, loading, error, refresh } = useRestaurantOrders();
  const [filter, setFilter] = useState<string>('all');
  const [acting, setActing] = useState<string | null>(null);

  const filtered = filter === 'all' ? orders : orders.filter((o) => o.rawStatus === filter);

  // Mirrors the preview flow: pending → confirmed → preparing → ready → delivered.
  const nextAction = (rawStatus: string): { label: string; next: string; bg: string; fg: string } | null => {
    switch (rawStatus) {
      case 'pending': return { label: 'Confirmar', next: 'confirmed', bg: colors.primary, fg: '#FFFFFF' };
      case 'confirmed': return { label: 'Preparar', next: 'preparing', bg: '#F59E0B', fg: '#FFFFFF' };
      case 'open_for_additions':
      case 'preparing': return { label: 'Marcar pronto', next: 'ready', bg: '#22C55E', fg: '#FFFFFF' };
      case 'ready': return { label: 'Entregar', next: 'delivered', bg: '#3B82F6', fg: '#FFFFFF' };
      default: return null;
    }
  };

  const advance = async (orderId: string, next: string) => {
    setActing(orderId);
    try {
      await ApiService.updateOrderStatus(orderId, next);
      await refresh();
    } catch (err) {
      Alert.alert('Falha ao atualizar pedido', err instanceof Error ? err.message : 'Tente novamente.');
    } finally {
      setActing(null);
    }
  };

  const confirmCancel = (order: TabOrder) => {
    Alert.alert(
      'Solicitar cancelamento?',
      `${order.table} · ${formatCurrency(order.total)}. A solicitação será enviada para a Central de Aprovações.`,
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Enviar solicitação',
          style: 'destructive',
          onPress: async () => {
            if (!restaurantId) return;
            setActing(order.id);
            try {
              await supabaseApiAdapter.requestApproval({
                restaurantId,
                type: 'order_cancellation',
                itemName: `Conta ${order.table}`,
                reason: order.notes?.trim() || 'Cancelamento solicitado durante o atendimento',
                amount: order.total,
                orderId: order.id,
              });
              Alert.alert('Solicitação enviada', 'O pedido permanecerá ativo até a aprovação do gerente.');
            } catch (err) {
              Alert.alert('Falha ao solicitar cancelamento', err instanceof Error ? err.message : 'Tente novamente.');
            } finally {
              setActing(null);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.section}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {WAITER_ORDER_FILTERS.map((f) => {
          const isActive = filter === f.value;
          return (
            <TouchableOpacity
              key={f.value}
              onPress={() => setFilter(f.value)}
              style={[styles.filterChip, { backgroundColor: isActive ? colors.primary : colors.backgroundSecondary }]}
            >
              <Text style={[styles.filterText, { color: isActive ? '#FFF' : colors.foregroundSecondary }]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <InlineNotice message="Carregando pedidos..." colors={colors} />
      ) : error ? (
        <InlineNotice message={error} actionLabel="Recarregar" onPress={() => void refresh()} colors={colors} />
      ) : filtered.length === 0 ? (
        <InlineNotice message="Nenhum pedido neste filtro." colors={colors} />
      ) : (
        filtered.map((order) => {
          const action = nextAction(order.rawStatus);
          const ago = elapsedLabel(order.createdAt);
          const timeText = ago === 'agora' ? 'agora' : ago ? `${ago} atrás` : order.time;
          return (
            <View key={order.id} style={[styles.managerOrderCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <View style={styles.orderRow}>
                <View style={styles.tableNumberBubble}><Text style={styles.tableNumberText}>{order.table.replace('Mesa ', '')}</Text></View>
                <View style={{ flex: 1 }}>
                  <View style={styles.managerOrderHeader}>
                    <Text style={[styles.staffName, { color: colors.foreground }]}>{order.customerName || shortOrderId(order.id)}</Text>
                    <StatusChip label={RAW_ORDER_LABEL[order.rawStatus] ?? order.rawStatus} tone={RAW_ORDER_TONE[order.rawStatus] ?? 'info'} />
                  </View>
                  <Text style={[styles.staffRole, { color: colors.foregroundSecondary }]}>
                    {order.items.length} {order.items.length === 1 ? 'item' : 'itens'} · {formatCurrency(order.total)} · {timeText}
                  </Text>
                  <View style={styles.orderItemChips}>
                    {order.items.map((item, index) => (
                      <Text key={`${order.id}-${index}`} style={styles.orderItemChip}>{item}</Text>
                    ))}
                  </View>
                  {order.notes ? (
                    <Text style={[styles.staffRole, { color: colors.foregroundSecondary, marginTop: 6, fontStyle: 'italic' }]}>
                      Obs.: {order.notes}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.waiterOrderActions}>
                {action ? (
                  <TouchableOpacity
                    disabled={acting === order.id}
                    onPress={() => void advance(order.id, action.next)}
                    style={[styles.waiterOrderPrimary, { backgroundColor: action.bg, opacity: acting === order.id ? 0.6 : 1 }]}
                  >
                    <Text style={[styles.waiterOrderPrimaryText, { color: action.fg }]}>{action.label}</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  disabled={acting === order.id}
                  onPress={() => confirmCancel(order)}
                  style={[styles.waiterOrderCancel, { borderColor: '#FCA5A5', opacity: acting === order.id ? 0.6 : 1 }]}
                >
                  <Text style={styles.waiterOrderCancelText}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}
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
    </View>
  );
}

function WaiterStats({
  mesas,
  retirar,
  chamados,
  cobrar,
}: {
  mesas: number;
  retirar: number;
  chamados: number;
  cobrar: number;
}) {
  return (
    <View style={styles.configStats}>
      <CompactMetric value={String(mesas)} label="Mesas" tone="info" />
      <CompactMetric value={String(retirar)} label="Retirar" tone="danger" />
      <CompactMetric value={String(chamados)} label="Chamados" tone="warning" />
      <CompactMetric value={String(cobrar)} label="A cobrar" tone="success" />
    </View>
  );
}

function WaiterSegments({
  active,
  counts,
  onSelect,
}: {
  active: string;
  counts?: Record<string, number>;
  onSelect: (label: string) => void;
}) {
  return (
    <View style={styles.filterRow}>
      {['Ao Vivo', 'Mesas', 'Cozinha', 'Cobrar'].map((label) => {
        const isActive = active === label;
        const count = counts?.[label] ?? 0;
        return (
          <TouchableOpacity
            key={label}
            onPress={() => onSelect(label)}
            activeOpacity={0.8}
            style={[
              styles.waiterSegment,
              {
                backgroundColor: isActive ? '#FFF' : '#F8FAFC',
                borderColor: isActive ? '#E5E7EB' : 'transparent',
              },
            ]}
          >
            <Text style={[styles.waiterSegmentText, { color: isActive ? '#111827' : '#6B7280' }]}>{label}</Text>
            {count > 0 ? (
              <View style={[styles.waiterSegmentBadge, { backgroundColor: isActive ? '#FF5A3D' : '#E5E7EB' }]}>
                <Text style={[styles.waiterSegmentBadgeText, { color: isActive ? '#FFF' : '#6B7280' }]}>{count}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
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

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 88 },
  headerCard: { borderRadius: 22, borderWidth: 1, padding: 16, marginBottom: 16, overflow: 'hidden' },
  headerGlow: { position: 'absolute', width: 140, height: 140, borderRadius: 70, right: -52, top: -72 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  headerIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  restaurantPhotoButton: { width: 58, height: 58, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  restaurantPhoto: { width: '100%', height: '100%', borderRadius: 16.5 },
  restaurantInitial: { fontSize: 23, fontWeight: '900' },
  cameraBadge: { position: 'absolute', right: -5, bottom: -5, width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  restaurantMetaRow: { minHeight: 20, flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
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
  eyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1.45 },
  roleBadge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, marginLeft: 4 },
  roleBadgeText: { fontSize: 10, fontWeight: '800' },
  headerTitle: { fontSize: 17, fontWeight: '800', marginTop: 4, letterSpacing: -0.2 },
  headerHint: { flexShrink: 1, fontSize: 11, lineHeight: 16 },
  section: { gap: 12 },
  banner: { borderRadius: 16, padding: 12 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricCard: { width: '47%', borderRadius: 16, borderWidth: 1, padding: 12, backgroundColor: '#FFF' },
  metricValue: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, fontSize: 12, fontWeight: '700', overflow: 'hidden' },
  metricLabel: { marginTop: 12, fontSize: 12, color: '#64748B' },
  compactMetricCard: { flex: 1, minHeight: 70, borderRadius: 16, borderWidth: 1, padding: 12, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  compactMetricValue: { fontSize: 18, fontWeight: '800' },
  quickAction: { width: '47%', minHeight: 82, borderRadius: 16, borderWidth: 1, padding: 12 },
  moreShortcutsLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 14,
    marginBottom: 8,
  },
  moreShortcutsRow: { gap: 8, paddingRight: 4, paddingBottom: 4 },
  moreShortcutChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  moreShortcutIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreShortcutText: { fontSize: 12, fontWeight: '700' },
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
  approvalsSummary: { minHeight: 46, borderWidth: 1, borderRadius: 16, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9 },
  approvalsSummaryText: { flex: 1, fontSize: 12, fontWeight: '700' },
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
  staffAvatarImage: { width: '100%', height: '100%' },
  staffOverviewCard: { borderRadius: 18, borderWidth: 1, padding: 13, gap: 12 },
  staffIdentityRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  staffMetricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  staffOperationalField: { width: '48.5%', minHeight: 52, borderRadius: 12, paddingHorizontal: 10, justifyContent: 'center' },
  staffOperationalLabel: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.45 },
  staffOperationalValue: { fontSize: 12, fontWeight: '800', marginTop: 3 },
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
  cashAmountInput: { marginBottom: 10 },
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
  // ── Waiter command center ──────────────────────────────────────────────────
  // Customer assistance hub
  assistanceTabs: { gap: 8, paddingRight: 12, paddingBottom: 2 },
  assistanceTab: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  assistanceTabText: { fontSize: 11, fontWeight: '800' },
  assistanceTabCount: { fontSize: 11, fontWeight: '700', opacity: 0.72 },
  assistanceBanner: {
    minHeight: 78,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  assistanceBannerTitle: { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  assistanceBannerDescription: { color: '#64748B', fontSize: 11, lineHeight: 16 },
  assistanceCustomerCard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 14 },
  assistanceCustomerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  assistancePrimaryButton: {
    minHeight: 38,
    borderRadius: 14,
    backgroundColor: '#FF4B2B',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assistancePrimaryButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  assistanceQrPanel: { borderRadius: 14, padding: 14, alignItems: 'center' },
  assistanceQrCode: {
    width: 116,
    height: 116,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#BDBDBD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assistanceQrLabel: { fontSize: 11, marginTop: 10 },
  assistanceQrHelp: { maxWidth: 230, fontSize: 9, lineHeight: 13, textAlign: 'center', marginTop: 3 },
  assistanceQrActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  assistanceSmallButton: { minHeight: 34, borderRadius: 11, borderWidth: 1, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  assistanceSmallButtonText: { fontSize: 10, fontWeight: '800' },
  assistanceInfoCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  assistanceInfoHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  assistanceIconBox: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  assistanceCardTitle: { fontSize: 15, fontWeight: '800' },
  assistanceCardSubtitle: { fontSize: 11, marginTop: 2 },
  assistanceTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  assistanceAllergenTag: {
    color: '#F59E0B',
    backgroundColor: '#FFF7ED',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 9,
    fontWeight: '700',
    overflow: 'hidden',
  },
  assistanceRestriction: { borderRadius: 11, paddingHorizontal: 10, paddingVertical: 9 },
  assistanceRestrictionText: { fontSize: 9, lineHeight: 14 },
  assistanceStatsRow: { flexDirection: 'row', gap: 8 },
  assistanceStatCard: { flex: 1, minHeight: 76, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  assistanceStatValue: { fontSize: 20, fontWeight: '900' },
  assistanceStatLabel: { fontSize: 9, marginTop: 4 },
  assistanceFeedbackCard: { borderRadius: 16, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  assistanceFeedbackMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 },
  assistanceSentiment: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, fontSize: 9, fontWeight: '800', overflow: 'hidden' },
  assistanceFeedbackStatus: { fontSize: 9 },
  assistanceFeedbackNote: { fontSize: 10, lineHeight: 14, fontStyle: 'italic', marginTop: 4 },
  assistanceCollected: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  assistanceCollectedText: { color: '#16A66A', fontSize: 12, fontWeight: '800' },
  assistanceSpecialCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  assistanceSpecialContent: { padding: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  assistanceSpecialIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  assistanceSpecialTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  assistanceTableTag: { color: '#FF4B2B', backgroundColor: '#FFF1ED', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, fontSize: 9, fontWeight: '900', overflow: 'hidden' },
  assistanceTypeTag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, fontSize: 8, fontWeight: '900', overflow: 'hidden' },
  assistanceSpecialDescription: { fontSize: 12, lineHeight: 18, marginTop: 6 },
  assistanceSpecialAction: { minHeight: 42, borderTopWidth: 1, alignItems: 'center', justifyContent: 'center' },
  assistanceSpecialActionText: { fontSize: 12, fontWeight: '800' },
  assistanceProcessed: { minHeight: 42, borderTopWidth: 1, borderTopColor: '#D1FAE5', backgroundColor: '#F0FDF7', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  assistanceProcessedText: { color: '#16A66A', fontSize: 12, fontWeight: '800' },
  assistanceFormLabel: { fontSize: 11, fontWeight: '800', marginBottom: 7, marginTop: 10 },
  assistanceFormOptions: { flexDirection: 'row', gap: 8 },
  assistanceFormOption: { flex: 1, minHeight: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  assistanceRatingRow: { flexDirection: 'row', gap: 8 },
  assistanceRatingButton: { flex: 1, height: 38, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  assistanceFeedbackInput: { minHeight: 92, maxHeight: 150, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 10, fontSize: 12, textAlignVertical: 'top' },
  assistanceFormActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  assistanceFormButton: { flex: 1, minHeight: 42, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  waiterSegment: {
    flex: 1,
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  waiterSegmentText: { fontSize: 12, fontWeight: '800' },
  waiterSegmentBadge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  waiterSegmentBadgeText: { fontSize: 10, fontWeight: '800' },
  waiterTableCard: { borderRadius: 16, borderWidth: 1, padding: 12, gap: 10 },
  waiterTableTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  waiterTableNumber: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  waiterTableNumberText: { fontSize: 17, fontWeight: '800' },
  waiterTableTotal: { fontSize: 15, fontWeight: '800' },
  waiterTableProgressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  waiterProgressTrack: { flex: 1, height: 7, borderRadius: 999, backgroundColor: '#EEF2F6', overflow: 'hidden' },
  waiterProgressFill: { height: '100%', borderRadius: 999 },
  waiterProgressPct: { fontSize: 11, fontWeight: '700', minWidth: 32, textAlign: 'right' },
  waiterSectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginTop: 4 },
  waiterKitchenNumber: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
  waiterKitchenNumberText: { fontSize: 15, fontWeight: '800', color: '#EF4444' },
  waiterPickupBtn: { backgroundColor: '#EF4444', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 9 },
  waiterPickupBtnText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  waiterTimerPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF3C7', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  waiterTimerText: { fontSize: 11, fontWeight: '800', color: '#B45309' },
  waiterChargeGroup: { borderRadius: 16, borderWidth: 1, padding: 12, gap: 4 },
  waiterChargeGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 8 },
  waiterChargeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  waiterChargeBtn: { backgroundColor: '#FF5A3D', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8 },
  waiterChargeBtnText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  waiterModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  waiterModalCard: { width: '100%', maxWidth: 380, borderRadius: 20, padding: 20 },
  waiterMethodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  waiterMethodBtn: { width: '47%', minHeight: 48, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  waiterMethodBtnText: { fontSize: 14, fontWeight: '800' },
  waiterModalCancel: { marginTop: 16, alignItems: 'center', paddingVertical: 10 },
  waiterTapToPayCta: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 14 },
  waiterTapToPayIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  waiterTapToPayTitle: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  waiterTapToPaySub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 1 },
  waiterTapToPayArrow: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  waiterOrderActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  waiterOrderPrimary: { flex: 1, minHeight: 40, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  waiterOrderPrimaryText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  waiterOrderCancel: { minWidth: 96, minHeight: 40, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  waiterOrderCancelText: { color: '#EF4444', fontSize: 13, fontWeight: '800' },
});
