import React, { useMemo } from 'react';
import { Alert, Platform, ScrollView, StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { gradients } from '@okinawa/shared/theme/colors';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import customerBackend, { type CustomerOrderStatus } from '../../services/customer-backend';
import { money, StateView } from './shared';

type TrackingStep = 'received' | 'preparing' | 'ready' | 'delivered';

const TRACKING_STEPS: { key: TrackingStep; label: string; icon: 'checkmark' | 'restaurant' | 'restaurant-outline' | 'checkmark-done' }[] = [
  { key: 'received', label: 'Recebido', icon: 'checkmark' },
  { key: 'preparing', label: 'Preparando', icon: 'restaurant' },
  { key: 'ready', label: 'Pronto', icon: 'restaurant-outline' },
  { key: 'delivered', label: 'Entregue', icon: 'checkmark-done' },
];

const STEP_INDEX: Record<TrackingStep, number> = { received: 0, preparing: 1, ready: 2, delivered: 3 };

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

const STATUS_BAR_HEIGHT = Platform.OS === 'ios' ? 44 : StatusBar.currentHeight ?? 24;

export default function OrderDetailScreen({ route, navigation }: any) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['orders', route.params.orderId], queryFn: () => customerBackend.getOrder(route.params.orderId) });
  const cancel = useMutation({
    mutationFn: () => customerBackend.cancelOrder(route.params.orderId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
    onError: (error: Error) => Alert.alert('Não foi possível cancelar', error.message),
  });

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: colors.background },
        scrollContent: { paddingBottom: 32 },
        gradientHeader: { paddingTop: STATUS_BAR_HEIGHT + 8, paddingBottom: 36, paddingHorizontal: 16 },
        headerTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 },
        backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
        headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
        headerTitle: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
        headerSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
        stepperWrap: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, paddingVertical: 18, paddingHorizontal: 12 },
        stepperRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
        stepItem: { flex: 1, alignItems: 'center' },
        stepCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
        stepCircleActive: { backgroundColor: '#FFFFFF' },
        stepCircleInactive: { backgroundColor: 'transparent', borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)' },
        stepLabel: { fontSize: 11, textAlign: 'center', color: 'rgba(255,255,255,0.45)' },
        stepLabelActive: { color: '#FFFFFF', fontWeight: '600' },
        connector: { position: 'absolute', top: 20, left: '12.5%', right: '12.5%', height: 2, backgroundColor: 'rgba(255,255,255,0.25)', zIndex: 0 },
        body: { paddingHorizontal: 16, marginTop: -28, gap: 16 },
        timeCard: { backgroundColor: colors.card, borderRadius: 20, padding: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
        progressTrack: { height: 4, borderRadius: 2, backgroundColor: colors.backgroundTertiary, overflow: 'hidden' },
        progressFill: { height: '100%', borderRadius: 2, backgroundColor: colors.primary },
        sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: colors.foregroundSecondary, marginBottom: 10 },
        itemCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
        itemName: { fontSize: 15, fontWeight: '600', color: colors.foreground },
        itemMeta: { fontSize: 13, color: colors.foregroundSecondary, marginTop: 2 },
        itemPrice: { fontSize: 15, fontWeight: '700', color: colors.foreground },
        totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
        totalLabel: { fontSize: 15, color: colors.foregroundSecondary },
        totalValue: { fontSize: 18, fontWeight: '700', color: colors.foreground },
        cancelBtn: { paddingVertical: 14, borderRadius: 16, borderWidth: 1.5, borderColor: '#DC2626', alignItems: 'center' },
        cancelBtnText: { color: '#DC2626', fontSize: 15, fontWeight: '700' },
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
  const currentStepIndex = STEP_INDEX[stepFromStatus(order.status)];
  const progress = progressFromStatus(order.status);
  const canCancel = ['pending', 'confirmed'].includes(order.status);

  return (
    <ScreenContainer edges={[]}>
      <View style={styles.root}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
          <LinearGradient colors={gradients.primary as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.gradientHeader}>
            <View style={styles.headerTop}>
              <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
                <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={styles.headerCenter}>
                <Text style={styles.headerTitle}>Status do Pedido</Text>
                <Text style={styles.headerSubtitle}>{order.restaurantName}</Text>
              </View>
              <View style={{ width: 40 }} />
            </View>

            <View style={styles.stepperWrap}>
              <View style={styles.connector} />
              <View style={styles.stepperRow}>
                {TRACKING_STEPS.map((step, index) => {
                  const isActive = index <= currentStepIndex;
                  return (
                    <View key={step.key} style={styles.stepItem}>
                      <View style={[styles.stepCircle, isActive ? styles.stepCircleActive : styles.stepCircleInactive]}>
                        <Ionicons name={step.icon} size={18} color={isActive ? colors.primary : 'rgba(255,255,255,0.5)'} />
                      </View>
                      <Text style={[styles.stepLabel, isActive && styles.stepLabelActive]}>{step.label}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </LinearGradient>

          <View style={styles.body}>
            <View style={styles.timeCard}>
              <Text style={{ fontSize: 13, color: colors.foregroundSecondary, marginBottom: 6 }}>
                {order.status === 'cancelled' ? 'Pedido cancelado' : `Tempo estimado: ${order.estimatedTime ? `${order.estimatedTime} min` : '—'}`}
              </Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
              </View>
            </View>

            <View>
              <Text style={styles.sectionTitle}>SEUS ITENS</Text>
              <View style={{ gap: 10 }}>
                {order.items.map((item) => (
                  <View key={item.id} style={styles.itemCard}>
                    <View>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemMeta}>{item.quantity}x</Text>
                    </View>
                    <Text style={styles.itemPrice}>{money(item.totalPrice)}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{money(order.total)}</Text>
            </View>

            {canCancel && (
              <TouchableOpacity style={styles.cancelBtn} onPress={() => cancel.mutate()} disabled={cancel.isPending} accessibilityRole="button">
                <Text style={styles.cancelBtnText}>{cancel.isPending ? 'Cancelando...' : 'Cancelar Pedido'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}
