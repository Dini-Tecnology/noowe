import React, { useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useRoute, useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { gradients } from '@okinawa/shared/theme/colors';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { useOrder } from '@okinawa/shared/hooks/useOrdersQuery';

type RouteParams = { orderId: string };
type TrackingStep = 'received' | 'preparing' | 'ready' | 'delivered';

const TRACKING_STEPS: { key: TrackingStep; label: string; icon: 'checkmark' | 'restaurant' | 'restaurant-outline' | 'checkmark-done' }[] = [
  { key: 'received', label: 'Recebido', icon: 'checkmark' },
  { key: 'preparing', label: 'Preparando', icon: 'restaurant' },
  { key: 'ready', label: 'Pronto', icon: 'restaurant-outline' },
  { key: 'delivered', label: 'Entregue', icon: 'checkmark-done' },
];

const STEP_INDEX: Record<TrackingStep, number> = {
  received: 0,
  preparing: 1,
  ready: 2,
  delivered: 3,
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in: 'Pedido local',
  pickup: 'Retirada',
  delivery: 'Entrega',
};

function stepFromStatus(status: string): TrackingStep {
  if (status === 'preparing') return 'preparing';
  if (status === 'ready') return 'ready';
  if (status === 'delivered' || status === 'completed') return 'delivered';
  return 'received';
}

function progressFromStatus(status: string): number {
  switch (status) {
    case 'preparing':
      return 0.5;
    case 'ready':
      return 0.85;
    case 'delivered':
    case 'completed':
      return 1;
    default:
      return 0.1;
  }
}

const STATUS_BAR_HEIGHT =
  Platform.OS === 'ios' ? 44 : StatusBar.currentHeight ?? 24;

export default function OrderTrackingScreen() {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const colors = useColors();
  const { orderId } = (route.params ?? {}) as RouteParams;
  const { data: order, isLoading, isError, refetch } = useOrder(orderId);
  const currentStepIndex = order ? STEP_INDEX[stepFromStatus(order.status)] : 0;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: colors.background },
        scroll: { flex: 1 },
        scrollContent: { paddingBottom: 32 },
        body: {
          paddingHorizontal: 16,
          marginTop: -28,
          gap: 16,
        },
        timeCard: {
          backgroundColor: colors.card,
          borderRadius: 20,
          padding: 18,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          elevation: 4,
        },
        timeRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        timeLabel: {
          fontSize: 13,
          color: colors.foregroundSecondary,
          marginBottom: 6,
        },
        timeValue: {
          fontSize: 28,
          fontWeight: '800',
          color: colors.foreground,
          letterSpacing: -0.5,
        },
        timeIconBox: {
          width: 52,
          height: 52,
          borderRadius: 14,
          backgroundColor: 'rgba(234, 88, 12, 0.12)',
          alignItems: 'center',
          justifyContent: 'center',
        },
        progressTrack: {
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.backgroundTertiary,
          marginTop: 16,
          overflow: 'hidden',
        },
        progressFill: {
          height: '100%',
          borderRadius: 2,
          backgroundColor: colors.primary,
        },
        sectionTitle: {
          fontSize: 12,
          fontWeight: '700',
          letterSpacing: 1,
          color: colors.foregroundSecondary,
          marginBottom: 10,
        },
        tableCard: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          backgroundColor: colors.card,
          borderRadius: 18,
          padding: 16,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        tableIcon: {
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: 'rgba(234, 88, 12, 0.12)',
          alignItems: 'center',
          justifyContent: 'center',
        },
        tableTitle: {
          fontSize: 16,
          fontWeight: '700',
          color: colors.foreground,
        },
        tableSub: {
          fontSize: 13,
          color: colors.foregroundSecondary,
          marginTop: 2,
        },
        closeBillBtn: {
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 12,
          backgroundColor: 'rgba(234, 88, 12, 0.12)',
        },
        closeBillText: {
          fontSize: 13,
          fontWeight: '700',
          color: colors.primary,
        },
        itemCard: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: colors.card,
          borderRadius: 14,
          padding: 14,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        itemName: {
          fontSize: 15,
          fontWeight: '600',
          color: colors.foreground,
        },
        itemMeta: {
          fontSize: 13,
          color: colors.foregroundSecondary,
          marginTop: 2,
        },
        itemPrice: {
          fontSize: 15,
          fontWeight: '700',
          color: colors.foreground,
        },
        helpCard: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          backgroundColor: '#1C1917',
          borderRadius: 18,
          padding: 18,
        },
        helpIcon: {
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: 'rgba(255,255,255,0.08)',
          alignItems: 'center',
          justifyContent: 'center',
        },
        helpTitle: {
          fontSize: 16,
          fontWeight: '700',
          color: '#FFFFFF',
        },
        helpSub: {
          fontSize: 13,
          color: 'rgba(255,255,255,0.55)',
          marginTop: 2,
        },
        notFound: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
        },
        gradientHeader: {
          paddingTop: STATUS_BAR_HEIGHT + 8,
          paddingBottom: 36,
          paddingHorizontal: 16,
        },
        headerTop: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 20,
        },
        backBtn: {
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: 'rgba(255,255,255,0.22)',
          alignItems: 'center',
          justifyContent: 'center',
        },
        headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
        headerTitle: {
          fontSize: 20,
          fontWeight: '700',
          color: '#FFFFFF',
        },
        headerSubtitle: {
          fontSize: 14,
          color: 'rgba(255,255,255,0.85)',
          marginTop: 4,
        },
        orderBadge: {
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 12,
          backgroundColor: 'rgba(255,255,255,0.22)',
        },
        orderBadgeText: {
          fontSize: 14,
          fontWeight: '700',
          color: '#FFFFFF',
        },
        stepperWrap: {
          backgroundColor: 'rgba(255,255,255,0.15)',
          borderRadius: 20,
          paddingVertical: 18,
          paddingHorizontal: 12,
        },
        stepperRow: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        },
        stepItem: {
          flex: 1,
          alignItems: 'center',
        },
        stepCircle: {
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 8,
        },
        stepCircleActive: {
          backgroundColor: '#FFFFFF',
        },
        stepCircleInactive: {
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderColor: 'rgba(255,255,255,0.35)',
        },
        stepLabel: {
          fontSize: 11,
          textAlign: 'center',
          color: 'rgba(255,255,255,0.45)',
        },
        stepLabelActive: {
          color: '#FFFFFF',
          fontWeight: '600',
        },
        connector: {
          position: 'absolute',
          top: 20,
          left: '12.5%',
          right: '12.5%',
          height: 2,
          backgroundColor: 'rgba(255,255,255,0.25)',
          zIndex: 0,
        },
      }),
    [colors],
  );

  const goBack = useCallback(() => navigation.goBack(), [navigation]);

  const handleCloseBill = useCallback(() => {
    Alert.alert('Fechar conta', 'Em breve você poderá solicitar o fechamento da conta pelo app.');
  }, []);

  const handleHelp = useCallback(() => {
    if (order) {
      navigation.navigate('RestaurantCallTeam', { restaurantId: order.restaurant_id });
    }
  }, [navigation, order]);

  if (isLoading) {
    return (
      <ScreenContainer edges={['top']}>
        <View style={styles.notFound}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (isError || !order) {
    return (
      <ScreenContainer edges={['top']}>
        <View style={styles.notFound}>
          <Ionicons name="clipboard-outline" size={48} color={colors.foregroundMuted} />
          <Text style={{ marginTop: 12, color: colors.foregroundSecondary }}>
            {isError ? 'Não foi possível carregar o pedido' : 'Pedido não encontrado'}
          </Text>
          {isError ? (
            <TouchableOpacity onPress={() => refetch()} style={{ marginTop: 16 }}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>Tentar novamente</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={goBack} style={{ marginTop: 16 }}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>Voltar</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScreenContainer>
    );
  }

  const restaurantName = order.restaurants?.name ?? 'Restaurante';
  const orderTypeLabel = ORDER_TYPE_LABELS[order.order_type] ?? order.order_type;
  const estimatedLabel = order.estimated_time ? `${order.estimated_time} min` : '—';
  const progress = progressFromStatus(order.status);
  const orderShortCode = String(order.id).slice(0, 8).toUpperCase();
  const items = order.order_items ?? [];

  const formatPrice = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

  return (
    <ScreenContainer edges={[]}>
      <View style={styles.root}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <LinearGradient
            colors={gradients.primary as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.gradientHeader}
          >
            <View style={styles.headerTop}>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={goBack}
                accessibilityRole="button"
                accessibilityLabel="Voltar"
              >
                <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={styles.headerCenter}>
                <Text style={styles.headerTitle}>Status do Pedido</Text>
                <Text style={styles.headerSubtitle}>
                  {orderTypeLabel} · {restaurantName}
                </Text>
              </View>
              <View style={styles.orderBadge}>
                <Text style={styles.orderBadgeText}>#{orderShortCode}</Text>
              </View>
            </View>

            <View style={styles.stepperWrap}>
              <View style={styles.connector} />
              <View style={styles.stepperRow}>
                {TRACKING_STEPS.map((step, index) => {
                  const isActive = index <= currentStepIndex;
                  const isCurrent = index === currentStepIndex;
                  return (
                    <View key={step.key} style={styles.stepItem}>
                      <View
                        style={[
                          styles.stepCircle,
                          isActive ? styles.stepCircleActive : styles.stepCircleInactive,
                        ]}
                      >
                        <Ionicons
                          name={step.icon}
                          size={isCurrent && step.key === 'received' ? 18 : 20}
                          color={isActive ? colors.primary : 'rgba(255,255,255,0.5)'}
                        />
                      </View>
                      <Text style={[styles.stepLabel, isActive && styles.stepLabelActive]}>
                        {step.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </LinearGradient>

          <View style={styles.body}>
            <View style={styles.timeCard}>
              <View style={styles.timeRow}>
                <View>
                  <Text style={styles.timeLabel}>Tempo estimado</Text>
                  <Text style={styles.timeValue}>{estimatedLabel}</Text>
                </View>
                <View style={styles.timeIconBox}>
                  <Ionicons name="time-outline" size={28} color={colors.primary} />
                </View>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
              </View>
            </View>

            <View>
              <Text style={styles.sectionTitle}>SEUS ITENS</Text>
              <View style={styles.tableCard}>
                <View style={styles.tableIcon}>
                  <Ionicons name="location" size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tableTitle}>{orderTypeLabel}</Text>
                  <Text style={styles.tableSub}>{restaurantName}</Text>
                </View>
                <TouchableOpacity
                  style={styles.closeBillBtn}
                  onPress={handleCloseBill}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Fechar conta"
                >
                  <Text style={styles.closeBillText}>Fechar Conta</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ gap: 10 }}>
              {items.map((item: any) => (
                <View key={item.id} style={styles.itemCard}>
                  <View>
                    <Text style={styles.itemName}>{item.menu_items?.name ?? 'Item'}</Text>
                    <Text style={styles.itemMeta}>{item.quantity}x</Text>
                  </View>
                  <Text style={styles.itemPrice}>{formatPrice(Number(item.total_price ?? 0))}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={styles.helpCard}
              onPress={handleHelp}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel="Precisa de ajuda"
            >
              <View style={styles.helpIcon}>
                <Ionicons name="notifications-outline" size={22} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.helpTitle}>Precisa de ajuda?</Text>
                <Text style={styles.helpSub}>Chamar equipe discretamente</Text>
              </View>
              <Ionicons name="chatbubble-outline" size={22} color="rgba(255,255,255,0.35)" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}
