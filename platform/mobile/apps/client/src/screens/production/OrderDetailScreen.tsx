import React, { useEffect, useMemo } from 'react';
import { Alert, AppState, Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import OrderStatusStepper, { type OrderStatusStep } from '@okinawa/shared/components/orders/OrderStatusStepper';
import { useVisitSession } from '../../contexts/VisitSessionContext';
import { useServiceTypeFor } from '../../hooks/useServiceTypeFeatures';
import { DevSkipPrepButton } from '../../components/dev/DevSkipPrepButton';
import customerBackend, { type CustomerOrderStatus } from '../../services/customer-backend';
import { PixPendingPanel } from '../../components/quick/PixPendingPanel';
import { loadPickupFromCache } from '../../services/pickup-code-cache';
import { money, rootNavigate, StateView, useQueryRefreshControl, tableLabel, translateOrderError } from './shared';
import { QUICK_TRACKING_STEPS, canCustomerCancelQuickOrder, describeQuickEvent, pickupPolicyText, quickTrackingStep } from './quick-service-ui';

type TrackingStep = 'received' | 'preparing' | 'ready' | 'delivered';

/** Gradiente do header — espelha os tokens `primary → accent` do design de referência. */
const HEADER_GRADIENT = ['#FF5724', '#F97316', '#F59E0B'] as const;

const TRACKING_STEPS: (OrderStatusStep & { key: TrackingStep })[] = [
  { key: 'received', label: 'Recebido', icon: 'checkmark-circle' },
  { key: 'preparing', label: 'Preparando', icon: 'chef-hat', iconSet: 'material-community' },
  { key: 'ready', label: 'Pronto', icon: 'silverware-fork-knife', iconSet: 'material-community' },
  { key: 'delivered', label: 'Entregue', icon: 'checkmark' },
];

const STEP_INDEX: Record<TrackingStep, number> = { received: 0, preparing: 1, ready: 2, delivered: 3 };

const ITEM_STATUS_LABELS: Record<string, string> = {
  pending: 'Na fila', preparing: 'Preparando', ready: 'Pronto', delivered: 'Entregue', cancelled: 'Cancelado',
};

const ITEM_STATUS_COLORS: Record<string, string> = {
  pending: '#94A3B8', preparing: '#EA580C', ready: '#16A34A', delivered: '#16A34A', cancelled: '#DC2626',
};

function stepFromStatus(status: CustomerOrderStatus): TrackingStep {
  if (status === 'preparing') return 'preparing';
  if (status === 'ready') return 'ready';
  if (status === 'delivered' || status === 'completed') return 'delivered';
  return 'received';
}

function progressFromStatus(status: CustomerOrderStatus): number {
  switch (status) {
    case 'preparing': return 0.5;
    case 'ready': return 0.85;
    case 'delivered':
    case 'completed': return 1;
    default: return 0.1;
  }
}

function minutesUntil(iso: string | null): number | null {
  if (!iso) return null;
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return null;
  return Math.max(1, Math.round(diffMs / 60_000));
}

function estimatedRangeLabel(estimatedTime: number | null, status: CustomerOrderStatus): string {
  if (['ready', 'delivered', 'completed'].includes(status)) return 'Pronto';
  if (!estimatedTime) {
    // Orders placed before the restaurant filled in prep times have no estimate;
    // say so instead of showing a bare dash.
    return 'Calculando…';
  }
  const low = Math.max(1, estimatedTime - 2);
  return `${low}-${estimatedTime} min`;
}

const PREP_SKIPPABLE = new Set(['pending', 'confirmed', 'preparing', 'open_for_additions']);

export default function OrderDetailScreen({ route, navigation }: any) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { session } = useVisitSession();
  const orderId = route.params.orderId as string;
  const query = useQuery({ queryKey: ['orders', orderId], queryFn: () => customerBackend.getOrder(orderId) });
  const refreshControl = useQueryRefreshControl([query]);
  const { capabilities, policies } = useServiceTypeFor(query.data?.restaurantId, query.data?.serviceModel);
  // Pickup journeys follow the four counter steps and close on a pickup screen;
  // table journeys follow the kitchen status of the order.
  const pickupSteps = capabilities?.orderTracking === 'pickup_steps';
  const showPickupCode = capabilities?.pickupCode === true;
  const [resumedPix, setResumedPix] = React.useState<{ code: string; expiresAt: string | null } | null>(null);
  const statusEvents = useQuery({
    queryKey: ['orders', orderId, 'status-events'],
    queryFn: () => customerBackend.listOrderStatusEvents(orderId),
    enabled: pickupSteps && !!query.data,
  });
  const resumePix = useMutation({
    mutationFn: () => customerBackend.startPayment({ orderId, paymentMethod: 'pix' }),
    onSuccess: (payment) => {
      if (payment.paymentStatus === 'pending' && payment.pixCode) {
        setResumedPix({ code: payment.pixCode, expiresAt: payment.paymentExpiresAt });
      }
      void queryClient.invalidateQueries({ queryKey: ['orders', orderId] });
    },
    onError: (error: unknown) => Alert.alert('Pagamento', translateOrderError(error)),
  });

  // Skip the Line has no "Entregue" step of its own — once the kitchen marks
  // it ready, the customer moves on to the "Pedido Pronto" close-out screen.
  // `keepDetail` vem da própria tela de retirada ("Ver detalhes do pedido"): sem ele o redirect voltaria.
  const keepDetail = route.params?.keepDetail === true;
  useEffect(() => {
    if (keepDetail) return;
    if (pickupSteps && query.data && ['ready', 'picked_up'].includes(query.data.fulfillmentStatus)) {
      navigation.replace('OrderReady', { orderId });
    }
  }, [pickupSteps, query.data, orderId, navigation, keepDetail]);

  // Sem rede no balcão: se o código deste pedido está guardado no aparelho, abre a tela de retirada.
  useEffect(() => {
    if (!query.isError || keepDetail) return;
    let cancelled = false;
    void loadPickupFromCache(orderId).then((cached) => {
      if (!cancelled && cached) navigation.replace('OrderReady', { orderId });
    });
    return () => { cancelled = true; };
  }, [query.isError, orderId, navigation, keepDetail]);
  const cancel = useMutation({
    mutationFn: () => customerBackend.cancelOrder(route.params.orderId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
    onError: (error: Error) => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      Alert.alert('Não foi possível cancelar', error.message);
    },
  });

  const confirmCancel = () => {
    Alert.alert(
      'Cancelar pedido?',
      pickupSteps
        ? 'O pedido será cancelado e o valor estornado integralmente. Só é possível cancelar antes de a cozinha iniciar o preparo.'
        : 'Esta ação não pode ser desfeita. O pedido só pode ser cancelado enquanto a cozinha ainda não iniciou o preparo.',
      [
        { text: 'Manter pedido', style: 'cancel' },
        { text: 'Cancelar pedido', style: 'destructive', onPress: () => cancel.mutate() },
      ],
    );
  };

  useEffect(() => {
    let channel: Awaited<ReturnType<typeof customerBackend.subscribeToOrderChanges>> | undefined;
    let cancelled = false;

    customerBackend.subscribeToOrderChanges(orderId, () => {
      void queryClient.invalidateQueries({ queryKey: ['orders', orderId] });
      void queryClient.invalidateQueries({ queryKey: ['orders'], exact: true });
    }).then((value) => {
      if (cancelled) {
        void value.unsubscribe();
      } else {
        channel = value;
      }
    }).catch(() => {
      // Pull-to-refresh remains available when Realtime is temporarily offline.
    });

    // O pedido muda enquanto o cliente está fora do app (pronto, cancelado, estornado) e o
    // Realtime cai com o app em segundo plano: ao voltar, relê o pedido.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void queryClient.invalidateQueries({ queryKey: ['orders', orderId] });
        void queryClient.invalidateQueries({ queryKey: ['orders'], exact: true });
      }
    });

    return () => {
      cancelled = true;
      appStateSub.remove();
      if (channel) void channel.unsubscribe();
    };
  }, [orderId, queryClient]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: colors.background },
        scrollContent: { paddingBottom: 32 },
        gradientHeader: { paddingBottom: 36, paddingHorizontal: 16 },
        headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12 },
        backBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.20)', alignItems: 'center', justifyContent: 'center' },
        headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
        headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
        headerSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 3 },
        orderChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.20)', alignItems: 'center', justifyContent: 'center' },
        orderChipText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, color: '#FFFFFF' },
        body: { paddingHorizontal: 16, marginTop: -28, gap: 16 },
        timeCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 20, padding: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
        timeCardLeft: { flex: 1 },
        timeCardLabel: { fontSize: 13, color: colors.foregroundSecondary, marginBottom: 6 },
        timeCardValue: { fontSize: 28, fontWeight: '800', color: colors.foreground, marginBottom: 12 },
        timeCardIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: `${colors.primary}1A`, alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
        progressTrack: { height: 4, borderRadius: 2, backgroundColor: colors.backgroundTertiary, overflow: 'hidden' },
        progressFill: { height: '100%', borderRadius: 2, backgroundColor: colors.primary },
        sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: colors.foregroundSecondary, marginBottom: 10 },
        itemCard: { backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border },
        itemTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
        itemPhoto: { width: 48, height: 48, borderRadius: 12, backgroundColor: colors.backgroundTertiary },
        itemName: { fontSize: 15, fontWeight: '600', color: colors.foreground },
        itemMeta: { fontSize: 13, color: colors.foregroundSecondary, marginTop: 2 },
        itemChefRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
        itemChefName: { fontSize: 12, color: colors.foregroundSecondary },
        itemPrice: { fontSize: 15, fontWeight: '700', color: colors.foreground },
        itemBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
        itemStatusPill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
        itemStatusPillText: { fontSize: 11, fontWeight: '700' },
        itemEta: { fontSize: 12, fontWeight: '700', color: colors.primary },
        totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
        totalLabel: { fontSize: 15, color: colors.foregroundSecondary },
        totalValue: { fontSize: 18, fontWeight: '700', color: colors.foreground },
        tableCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 16, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: 12 },
        tableIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: `${colors.primary}1A`, alignItems: 'center', justifyContent: 'center' },
        tableTitle: { fontSize: 14, fontWeight: '700', color: colors.foreground },
        tableSubtitle: { fontSize: 12, color: colors.foregroundSecondary, marginTop: 2 },
        tableAction: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: `${colors.primary}1A` },
        tableActionText: { fontSize: 12, fontWeight: '700', color: colors.primary },
        helpBar: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.foreground, borderRadius: 16, padding: 14 },
        helpIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
        helpTitle: { fontSize: 14, fontWeight: '700', color: colors.background },
        helpSubtitle: { fontSize: 12, color: colors.background, opacity: 0.65, marginTop: 1 },
        cancelBtn: { paddingVertical: 14, borderRadius: 16, borderWidth: 1.5, borderColor: '#DC2626', alignItems: 'center' },
        cancelBtnText: { color: '#DC2626', fontSize: 15, fontWeight: '700' },
        payCta: {
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          paddingVertical: 16, borderRadius: 18, backgroundColor: colors.primary,
          shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 4,
        },
        payCtaText: { color: colors.primaryForeground, fontSize: 16, fontWeight: '800' },
        payCtaHint: { fontSize: 12, color: colors.foregroundSecondary, textAlign: 'center', marginTop: -6 },
        pickupCard: {
          alignItems: 'center', backgroundColor: colors.card, borderRadius: 20, paddingVertical: 20,
          shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
        },
        pickupLabel: { fontSize: 12, fontWeight: '600', color: colors.foregroundSecondary, marginBottom: 6 },
        pickupCode: { fontSize: 32, fontWeight: '800', letterSpacing: 1, color: colors.primary },
      }),
    [colors],
  );

  if (query.isLoading || query.isError || !query.data) {
    return (
      <ScreenContainer edges={['top']}>
        <StateView loading={query.isLoading} error={query.error} onRetry={() => query.refetch()} />
      </ScreenContainer>
    );
  }

  const order = query.data;
  // Quick Service (ADR-013 §2.2): Pago → Aceito → Em preparo → Pronto → Retirado, mais os terminais.
  const quick = pickupSteps ? quickTrackingStep(order) : null;
  // Aguardando pagamento ou terminal (cancelado/não retirado): nenhuma etapa fica "atual".
  const currentStepIndex = quick
    ? quick.stepIndex
    : STEP_INDEX[stepFromStatus(order.status)];
  const progress = quick
    ? (quick.terminal ? 0 : Math.max(0.1, (quick.stepIndex + 1) / QUICK_TRACKING_STEPS.length))
    : progressFromStatus(order.status);
  // Aceite manual: pago e ainda sem resposta do restaurante (o prazo corre no servidor).
  const awaitingAccept = !!quick && !quick.awaitingPayment && !quick.terminal && order.fulfillmentStatus === 'received';
  // Cancel is only possible before the kitchen starts: the order is still pending
  // AND no item has moved past the queue (the server enforces the same rule).
  const canCancel = quick
    ? canCustomerCancelQuickOrder(order)
    : ['pending', 'confirmed'].includes(order.status)
      && !order.items.some((item) => ['preparing', 'ready', 'delivered'].includes(item.status));
  const isActiveVisit = !!session && session.tableSessionId === order.tableSessionId;
  // "Chamar equipe" é a capability staffCalls: o Quick não tem garçom.
  const staffCallsEnabled = capabilities?.staffCalls !== false;
  const showHelpBar = staffCallsEnabled && (isActiveVisit || pickupSteps)
    && !['delivered', 'completed', 'cancelled', 'ready'].includes(order.status)
    && !(quick && (quick.terminal || quick.awaitingPayment));
  // RLS on `tables` is staff-only, so the embedded table name comes back null
  // for customers; the active visit already carries it.
  const tableNumber = order.tableNumber ?? (isActiveVisit ? session.tableNumber : null);
  const tableName = tableNumber ? tableLabel(tableNumber) : null;
  // Depois que a cozinha marca o pedido como pronto/entregue, a próxima ação
  // esperada é pagar — quick service já cai em OrderReady (useEffect acima), aqui
  // tratamos as jornadas de mesa (fine/casual dining) para que o cliente não
  // fique procurando o caminho até o checkout.
  const showPayCta = !pickupSteps && isActiveVisit && !!order.tableSessionId
    && ['ready', 'delivered', 'completed'].includes(order.status);
  const openCheckout = () => rootNavigate(navigation, 'FecharConta', { tableSessionId: order.tableSessionId });

  return (
    <ScreenContainer edges={[]}>
      <View style={styles.root}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          refreshControl={refreshControl}
          alwaysBounceVertical
        >
          <LinearGradient
            colors={HEADER_GRADIENT as unknown as [string, string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.gradientHeader, { paddingTop: insets.top + 8 }]}
          >
            <View style={styles.headerTop}>
              <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
                <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={styles.headerCenter}>
                <Text style={styles.headerTitle}>Status do Pedido</Text>
                <Text style={styles.headerSubtitle}>{tableName ? `${tableName} · ${order.restaurantName}` : order.restaurantName}</Text>
              </View>
              <View style={styles.orderChip}>
                <Text style={styles.orderChipText}>{order.orderNumber}</Text>
              </View>
            </View>

            <OrderStatusStepper steps={quick ? QUICK_TRACKING_STEPS : TRACKING_STEPS} currentStep={currentStepIndex} />
          </LinearGradient>

          <View style={styles.body}>
            <View style={styles.timeCard}>
              <View style={styles.timeCardLeft}>
                <Text style={styles.timeCardLabel}>
                  {quick?.terminal === 'not_picked_up' ? 'Pedido não retirado'
                    : quick?.terminal === 'refunded' ? 'Pedido cancelado e estornado'
                    : order.status === 'cancelled' ? 'Pedido cancelado'
                    : quick?.awaitingPayment ? 'Aguardando pagamento'
                    : awaitingAccept ? 'Aguardando o restaurante aceitar'
                    : 'Tempo estimado'}
                </Text>
                {order.status !== 'cancelled' && !quick?.terminal && !quick?.awaitingPayment && !awaitingAccept && (
                  <Text style={styles.timeCardValue}>{estimatedRangeLabel(order.estimatedTime, order.status)}</Text>
                )}
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                </View>
              </View>
              <View style={styles.timeCardIcon}>
                <Ionicons name="time-outline" size={22} color={colors.primary} />
              </View>
            </View>

            {quick && (
              <View style={styles.pickupCard}>
                {order.callName && (
                  <Text style={styles.pickupLabel}>
                    {`Chamaremos: ${order.callName}${order.consumptionMode === 'dine_here' ? ' · Comer aqui' : order.consumptionMode === 'takeaway' ? ' · Para levar' : ''}`}
                  </Text>
                )}
                {quick.terminal === 'refunded' && (
                  <Text style={styles.pickupLabel}>O valor do pedido foi estornado integralmente.</Text>
                )}
                {quick.terminal === 'not_picked_up' && (
                  <Text style={styles.pickupLabel}>
                    {pickupPolicyText({
                      pickupExpiryMin: policies?.pickupExpiryMin ?? null,
                      noPickupPolicy: policies?.noPickupPolicy ?? null,
                    })}
                  </Text>
                )}
                {!quick.terminal && !quick.awaitingPayment && (
                  <Text style={styles.pickupLabel}>Você será avisado por notificação em cada etapa.</Text>
                )}
              </View>
            )}

            {quick?.awaitingPayment && (resumedPix ? (
              <PixPendingPanel
                code={resumedPix.code}
                expiresAt={resumedPix.expiresAt}
                checking={query.isFetching}
                onCheck={() => { void query.refetch(); }}
                onExpired={() => { void query.refetch(); }}
              />
            ) : (
              <TouchableOpacity
                style={styles.payCta}
                onPress={() => resumePix.mutate()}
                disabled={resumePix.isPending}
                accessibilityRole="button"
                accessibilityLabel="Retomar pagamento"
              >
                <Ionicons name="qr-code-outline" size={20} color={colors.primaryForeground} />
                <Text style={styles.payCtaText}>{resumePix.isPending ? 'Gerando Pix...' : 'Retomar pagamento com Pix'}</Text>
              </TouchableOpacity>
            ))}

            {/* Quick passa por aceite, preparo e conferência no KDS: o atalho de teste não vale. */}
            {!quick && PREP_SKIPPABLE.has(order.status) && (
              <DevSkipPrepButton
                orderId={order.id}
                onSkipped={() => {
                  void queryClient.invalidateQueries({ queryKey: ['orders', orderId] });
                  void queryClient.invalidateQueries({ queryKey: ['orders'], exact: true });
                }}
              />
            )}

            {showPickupCode && !quick?.terminal && !quick?.awaitingPayment && (
              <View style={styles.pickupCard}>
                <Text style={styles.pickupLabel}>Código de retirada</Text>
                <Text style={styles.pickupCode}>{order.pickupCode ?? order.orderNumber}</Text>
              </View>
            )}

            <View>
              <Text style={styles.sectionTitle}>SEUS ITENS</Text>
              <View style={{ gap: 10 }}>
                {order.items.map((item) => {
                  const eta = ['pending', 'preparing'].includes(item.status) ? minutesUntil(item.expectedReadyAt) : null;
                  return (
                    <View key={item.id} style={styles.itemCard}>
                      <View style={styles.itemTopRow}>
                        {item.imageUrl && <Image source={{ uri: item.imageUrl }} style={styles.itemPhoto} resizeMode="cover" />}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemName}>{item.name}</Text>
                          <Text style={styles.itemMeta}>{item.quantity}x</Text>
                          {item.preparedByName && (
                            <View style={styles.itemChefRow}>
                              <Ionicons name="restaurant-outline" size={12} color={colors.foregroundSecondary} />
                              <Text style={styles.itemChefName}>{item.preparedByName}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.itemPrice}>{money(item.totalPrice)}</Text>
                      </View>
                      <View style={styles.itemBottomRow}>
                        <View style={[styles.itemStatusPill, { backgroundColor: `${ITEM_STATUS_COLORS[item.status] ?? '#94A3B8'}1A` }]}>
                          <Text style={[styles.itemStatusPillText, { color: ITEM_STATUS_COLORS[item.status] ?? '#94A3B8' }]}>
                            {ITEM_STATUS_LABELS[item.status] ?? item.status}
                          </Text>
                        </View>
                        {eta && <Text style={styles.itemEta}>~{eta} min</Text>}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{money(order.total)}</Text>
            </View>

            {tableName && (
              <View style={styles.tableCard}>
                <View style={styles.tableIcon}>
                  <Ionicons name="location-outline" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tableTitle}>{tableName} · {order.partySize} {order.partySize === 1 ? 'pessoa' : 'pessoas'}</Text>
                  <Text style={styles.tableSubtitle}>Você</Text>
                </View>
                {isActiveVisit && (
                  <TouchableOpacity
                    style={styles.tableAction}
                    onPress={() => rootNavigate(navigation, 'FecharConta', { tableSessionId: order.tableSessionId })}
                    accessibilityRole="button"
                  >
                    <Text style={styles.tableActionText}>Fechar Conta</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {showHelpBar && (
              <TouchableOpacity
                style={styles.helpBar}
                onPress={() => rootNavigate(navigation, 'CallWaiter')}
                accessibilityRole="button"
              >
                <View style={styles.helpIcon}>
                  <Ionicons name="notifications-outline" size={18} color={colors.background} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.helpTitle}>Precisa de ajuda?</Text>
                  <Text style={styles.helpSubtitle}>Chamar equipe discretamente</Text>
                </View>
                <Ionicons name="chatbubble-outline" size={18} color={colors.background} style={{ opacity: 0.65 }} />
              </TouchableOpacity>
            )}

            {showPayCta && (
              <>
                <TouchableOpacity style={styles.payCta} onPress={openCheckout} accessibilityRole="button" accessibilityLabel="Ir para pagamento">
                  <Ionicons name="card-outline" size={20} color={colors.primaryForeground} />
                  <Text style={styles.payCtaText}>Pagar & Fechar Conta · {money(order.total)}</Text>
                </TouchableOpacity>
                <Text style={styles.payCtaHint}>Pagamento simulado — nenhum valor é cobrado</Text>
              </>
            )}

            {quick && (statusEvents.data?.length ?? 0) > 0 && (
              <View>
                <Text style={styles.sectionTitle}>HISTÓRICO DO PEDIDO</Text>
                <View style={{ gap: 6 }}>
                  {statusEvents.data!.filter((event) => event.fromValue !== null || event.field === 'fulfillment_status').map((event) => (
                    <View key={event.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                      <Text style={[styles.itemMeta, { flex: 1 }]}>{describeQuickEvent(event)}</Text>
                      <Text style={styles.itemMeta}>
                        {new Date(event.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {canCancel && (
              <TouchableOpacity style={styles.cancelBtn} onPress={confirmCancel} disabled={cancel.isPending} accessibilityRole="button">
                <Text style={styles.cancelBtnText}>{cancel.isPending ? 'Cancelando...' : 'Cancelar Pedido'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}
