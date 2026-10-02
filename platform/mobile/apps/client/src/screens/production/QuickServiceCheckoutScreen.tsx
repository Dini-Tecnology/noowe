/* Hallmark · pre-emit critique: P5 H4 E4 S5 R4 V5 */
/* Hallmark · macrostructure: Long Document · tone: warm utilitarian · anchor hue: orange */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Crypto from 'expo-crypto';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { useCart } from '@/shared/contexts/CartContext';
import { cartOrderItems } from '../../utils/cart-order-items';
import customerBackend, { type ConsumptionMode, type CustomerOrder, type PlaceOrderItem } from '../../services/customer-backend';
import { useServiceTypeFor } from '../../hooks/useServiceTypeFeatures';
import { useDistanceToRestaurant } from '../../hooks/useDistanceToRestaurant';
import { PixPendingPanel } from '../../components/quick/PixPendingPanel';
import { QUICK_ORDER_ERROR_COPY, duplicateOrderId, quickOrderErrorKind } from '../../services/quick-service-errors';
import { money, translateOrderError } from './shared';
import { formatDistance, isFarFromRestaurant, pickupPolicyText } from './quick-service-ui';

const HEADER_GRADIENT = ['#FF5724', '#F97316', '#F59E0B'] as const;

type PaymentMethodType = 'pix' | 'credit_card' | 'apple_pay' | 'google_pay' | 'tap_to_pay' | 'wallet';

const PAYMENT_METHODS: { type: PaymentMethodType; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { type: 'pix', icon: 'qr-code-outline', label: 'PIX' },
  { type: 'credit_card', icon: 'card-outline', label: 'Crédito' },
  { type: 'apple_pay', icon: 'logo-apple', label: 'Apple Pay' },
  { type: 'google_pay', icon: 'logo-google', label: 'Google Pay' },
  { type: 'tap_to_pay', icon: 'flash-outline', label: 'TAP to Pay' },
  { type: 'wallet', icon: 'wallet-outline', label: 'Carteira' },
];

/** Dados que o carrinho coleta e o checkout envia ao servidor (ADR-013). */
export type QuickCheckoutParams = {
  callName?: string;
  consumptionMode?: ConsumptionMode;
  pickupSlotStart?: string | null;
};

type PendingPix = { orderId: string; code: string; expiresAt: string | null };

/**
 * Skip the Line checkout uses the same intent/event boundary as a real
 * provider. The provider is simulated, but only the server confirmation can
 * release this order to the KDS.
 */
export default function QuickServiceCheckoutScreen({ navigation, route }: any) {
  const params: QuickCheckoutParams = route?.params ?? {};
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const cart = useCart();
  const queryClient = useQueryClient();
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodType>('pix');
  const [usePoints, setUsePoints] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [pix, setPix] = useState<PendingPix | null>(null);
  const checkoutKey = useRef(Crypto.randomUUID());
  const { policies } = useServiceTypeFor(cart.restaurantId, 'quick_service');
  const restaurant = useQuery({
    queryKey: ['restaurant', cart.restaurantId],
    queryFn: () => customerBackend.getRestaurant(cart.restaurantId!),
    enabled: !!cart.restaurantId,
    staleTime: 5 * 60 * 1000,
  });
  const distance = useDistanceToRestaurant(restaurant.data);
  const farAway = isFarFromRestaurant(distance, policies?.distanceWarningKm ?? null);
  const policyText = pickupPolicyText({
    pickupExpiryMin: policies?.pickupExpiryMin ?? null,
    noPickupPolicy: policies?.noPickupPolicy ?? null,
  });

  const loyalty = useQuery({
    queryKey: ['loyalty'],
    queryFn: () => customerBackend.listLoyalty(),
  });
  const restaurantLoyalty = loyalty.data?.find((entry) => entry.restaurantId === cart.restaurantId);
  const pointsBalance = restaurantLoyalty?.points ?? 0;

  const pointsDiscount = useMemo(() => {
    if (!usePoints || pointsBalance <= 0) return 0;
    // 200 pontos = R$10 de desconto, como no mockup — 1 ponto = R$0,05.
    return Math.min(cart.total, pointsBalance * 0.05);
  }, [usePoints, pointsBalance, cart.total]);

  const total = Math.max(0, cart.total - pointsDiscount);

  const place = useMutation({
    mutationFn: async () => {
      const orderItems: PlaceOrderItem[] = cartOrderItems(cart.items);
      if (!orderItems.length) throw new Error('A comanda está vazia.');
      const order = await customerBackend.placeOrder({
        restaurantId: cart.restaurantId!,
        serviceModel: 'quick_service',
        idempotencyKey: checkoutKey.current,
        pickupSlotStart: params.pickupSlotStart ?? null,
        callName: params.callName ?? null,
        consumptionMode: params.consumptionMode ?? 'takeaway',
        pickupPolicyAccepted: policyAccepted,
        items: orderItems,
      });
      const payment = await customerBackend.startPayment({
        orderId: order.id,
        paymentMethod: selectedMethod,
        idempotencyKey: checkoutKey.current,
      });
      return { order, payment };
    },
    onSuccess: ({ order, payment }) => {
      if (payment.paymentStatus === 'confirmed') return finish(order.id);
      if (payment.paymentStatus === 'pending' && payment.pixCode) {
        setPix({ orderId: order.id, code: payment.pixCode, expiresAt: payment.paymentExpiresAt });
        return undefined;
      }
      Alert.alert('Pagamento não confirmado', 'O pagamento ainda não foi confirmado. Tente novamente.');
      return undefined;
    },
    onError: (error: unknown) => {
      const kind = quickOrderErrorKind(error);
      const existingOrderId = duplicateOrderId(error);
      if (kind === 'duplicate' && existingOrderId) {
        Alert.alert(QUICK_ORDER_ERROR_COPY.duplicate.title, QUICK_ORDER_ERROR_COPY.duplicate.message, [
          { text: 'Ver pedido', onPress: () => navigation.replace('OrderDetail', { orderId: existingOrderId }) },
          { text: 'Agora não', style: 'cancel' },
        ]);
        return;
      }
      if (kind) {
        Alert.alert(QUICK_ORDER_ERROR_COPY[kind].title, QUICK_ORDER_ERROR_COPY[kind].message);
        return;
      }
      Alert.alert('Pagamento não confirmado', translateOrderError(error));
    },
  });

  const finish = useCallback((orderId: string) => {
    cart.clearCart();
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    navigation.replace('OrderDetail', { orderId });
  }, [cart, navigation, queryClient]);

  // Pix pendente: o servidor é quem confirma. Consulta o pedido até o pagamento entrar
  // (ou o pedido ser cancelado por expiração).
  const pixOrder = useQuery<CustomerOrder>({
    queryKey: ['quick-pix-order', pix?.orderId],
    queryFn: async () => {
      await customerBackend.refreshQuickService(cart.restaurantId!);
      return customerBackend.getOrder(pix!.orderId);
    },
    enabled: !!pix,
    refetchInterval: 4000,
  });
  const resetPix = useCallback(() => {
    // A chave de idempotência acompanha o pedido: um novo pedido precisa de uma nova chave.
    checkoutKey.current = Crypto.randomUUID();
    setPix(null);
  }, []);
  const pixExpired = !!pix && pixOrder.data?.fulfillmentStatus === 'cancelled';
  React.useEffect(() => {
    if (pix && pixOrder.data?.paymentStatus === 'confirmed') finish(pixOrder.data.id);
  }, [pixOrder.data, pix, finish]);

  const simulatePixPaid = useMutation({
    mutationFn: () => customerBackend.confirmSimulatedPix(pix!.orderId),
    onSuccess: () => { void pixOrder.refetch(); },
    onError: (error: unknown) => Alert.alert('Pix simulado', translateOrderError(error)),
  });

  const selectMethod = useCallback((method: PaymentMethodType) => setSelectedMethod(method), []);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: colors.background },
        scroll: { flex: 1 },
        scrollContent: { paddingBottom: 32 },
        gradientHeader: { paddingTop: 8, paddingBottom: 24, paddingHorizontal: 16 },
        headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
        backBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.20)', alignItems: 'center', justifyContent: 'center' },
        headerTitleWrap: { flex: 1 },
        headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
        headerSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
        headerTotal: { alignItems: 'flex-end' },
        headerTotalLabel: { fontSize: 11, color: 'rgba(255,255,255,0.8)' },
        headerTotalValue: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
        body: { paddingHorizontal: 16, gap: 16 },
        loyaltyCard: {
          flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16,
          backgroundColor: colors.card, shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
        },
        loyaltyBadge: {
          width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(234, 88, 12, 0.12)',
          alignItems: 'center', justifyContent: 'center',
        },
        loyaltyTitle: { fontSize: 14, fontWeight: '700', color: colors.foreground },
        loyaltySub: { fontSize: 12, color: colors.foregroundSecondary, marginTop: 2 },
        loyaltyToggle: {
          paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
          borderWidth: 1.5, borderColor: colors.primary,
        },
        loyaltyToggleActive: { backgroundColor: colors.primary },
        loyaltyToggleText: { fontSize: 12, fontWeight: '700', color: colors.primary },
        loyaltyToggleTextActive: { color: colors.primaryForeground },
        sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.foreground },
        methodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
        methodItem: {
          width: '31%', minHeight: 80, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 6,
        },
        methodSelected: { borderColor: colors.primary, backgroundColor: 'rgba(234, 88, 12, 0.08)' },
        methodUnselected: { borderColor: colors.border, backgroundColor: colors.card },
        methodLabel: { fontSize: 12, fontWeight: '700' },
        warnCard: {
          flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14,
          backgroundColor: colors.backgroundTertiary, borderWidth: 1, borderColor: colors.border,
        },
        warnText: { flex: 1, fontSize: 13, color: colors.foreground },
        policyCard: { backgroundColor: colors.card, borderRadius: 16, padding: 16, gap: 10 },
        policyText: { fontSize: 13, color: colors.foregroundSecondary, lineHeight: 19 },
        policyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
        policyAccept: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.foreground },
        summaryCard: { backgroundColor: colors.card, borderRadius: 16, padding: 16, gap: 8 },
        summaryTitle: { fontSize: 14, fontWeight: '700', color: colors.foreground, marginBottom: 4 },
        summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
        summaryLabel: { fontSize: 13, color: colors.foregroundSecondary },
        summaryValue: { fontSize: 13, fontWeight: '600', color: colors.foreground },
        discountValue: { fontSize: 13, fontWeight: '600', color: colors.success },
        divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 4 },
        totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
        totalLabel: { fontSize: 16, fontWeight: '700', color: colors.foreground },
        totalValue: { fontSize: 20, fontWeight: '800', color: colors.primary },
        cta: {
          borderRadius: 18, overflow: 'hidden',
        },
        ctaGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 17 },
        ctaText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
        ctaDisabled: { opacity: 0.5 },
      }),
    [colors],
  );

  return (
    <ScreenContainer edges={[]}>
      <View style={styles.root}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <LinearGradient colors={HEADER_GRADIENT as unknown as [string, string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.gradientHeader, { paddingTop: insets.top + 8 }]}>
            <View style={styles.headerTop}>
              <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
                <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={styles.headerTitleWrap}>
                <Text style={styles.headerTitle}>Pagamento</Text>
                <Text style={styles.headerSubtitle} numberOfLines={1}>{cart.restaurantName ?? 'Quick Service'}</Text>
              </View>
              <View style={styles.headerTotal}>
                <Text style={styles.headerTotalLabel}>Total</Text>
                <Text style={styles.headerTotalValue}>{money(total)}</Text>
              </View>
            </View>
          </LinearGradient>

          {/* The loyalty card tucks into the header; without it the section
              title needs room below the gradient instead. */}
          <View style={[styles.body, { marginTop: pointsBalance > 0 ? -8 : 16 }]}>
            {pointsBalance > 0 && (
              <View style={styles.loyaltyCard}>
                <View style={styles.loyaltyBadge}>
                  <Ionicons name="ribbon-outline" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.loyaltyTitle}>Você tem {pointsBalance} pontos</Text>
                  <Text style={styles.loyaltySub}>Use pontos para descontar no total</Text>
                </View>
                <TouchableOpacity
                  style={[styles.loyaltyToggle, usePoints && styles.loyaltyToggleActive]}
                  onPress={() => setUsePoints((v) => !v)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: usePoints }}
                >
                  <Text style={[styles.loyaltyToggleText, usePoints && styles.loyaltyToggleTextActive]}>
                    {usePoints ? 'Usando' : 'Usar'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={{ gap: 12 }}>
              <Text style={styles.sectionTitle}>Forma de pagamento</Text>
              <View style={styles.methodGrid}>
                {PAYMENT_METHODS.map((method) => {
                  const selected = selectedMethod === method.type;
                  return (
                    <TouchableOpacity
                      key={method.type}
                      style={[styles.methodItem, selected ? styles.methodSelected : styles.methodUnselected]}
                      onPress={() => selectMethod(method.type)}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Ionicons name={method.icon} size={22} color={selected ? colors.primary : colors.foregroundSecondary} />
                      <Text style={[styles.methodLabel, { color: selected ? colors.primary : colors.foreground }]}>{method.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Resumo</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal ({cart.itemCount} {cart.itemCount === 1 ? 'item' : 'itens'})</Text>
                <Text style={styles.summaryValue}>{money(cart.total)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Desconto pontos</Text>
                <Text style={pointsDiscount > 0 ? styles.discountValue : styles.summaryValue}>
                  {pointsDiscount > 0 ? `- ${money(pointsDiscount)}` : money(0)}
                </Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>{money(total)}</Text>
              </View>
            </View>

            {farAway && distance != null && (
              <View style={styles.warnCard} accessibilityRole="alert">
                <Ionicons name="location-outline" size={18} color={colors.warning ?? colors.primary} />
                <Text style={styles.warnText}>
                  {`Você está a ${formatDistance(distance)} do restaurante. Confira se dá tempo de retirar antes do prazo.`}
                </Text>
              </View>
            )}

            <View style={styles.policyCard}>
              <Text style={styles.sectionTitle}>Política de retirada</Text>
              <Text style={styles.policyText}>{policyText}</Text>
              <TouchableOpacity
                style={styles.policyRow}
                onPress={() => setPolicyAccepted((value) => !value)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: policyAccepted }}
                accessibilityLabel="Li e aceito a política de retirada"
              >
                <Ionicons
                  name={policyAccepted ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={policyAccepted ? colors.primary : colors.foregroundSecondary}
                />
                <Text style={styles.policyAccept}>Li e aceito a política de retirada</Text>
              </TouchableOpacity>
            </View>

            {pix && pixExpired ? (
              <View style={styles.policyCard}>
                <Text style={styles.sectionTitle}>Pix expirado</Text>
                <Text style={styles.policyText}>O tempo para pagar acabou e o pedido foi cancelado. Você pode fazer o pedido novamente.</Text>
                <TouchableOpacity style={styles.cta} onPress={resetPix} accessibilityRole="button" accessibilityLabel="Fazer o pedido novamente">
                  <LinearGradient colors={HEADER_GRADIENT as unknown as [string, string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ctaGradient}>
                    <Text style={styles.ctaText}>Fazer o pedido novamente</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            ) : pix ? (
              <PixPendingPanel
                code={pix.code}
                expiresAt={pix.expiresAt}
                checking={pixOrder.isFetching}
                onCheck={() => {
                  void pixOrder.refetch().then((result) => {
                    if (result.data && result.data.paymentStatus !== 'confirmed' && result.data.fulfillmentStatus !== 'cancelled') {
                      Alert.alert('Pagamento pendente', 'Ainda não recebemos a confirmação do Pix. Assim que o banco confirmar, o pedido segue sozinho.');
                    }
                  });
                }}
                onSimulatePaid={__DEV__ ? () => simulatePixPaid.mutate() : undefined}
                onExpired={() => { void pixOrder.refetch(); }}
              />
            ) : (
            <TouchableOpacity
              style={[styles.cta, (place.isPending || !cart.items.length || !policyAccepted) && styles.ctaDisabled]}
              onPress={() => place.mutate()}
              disabled={place.isPending || !cart.items.length || !policyAccepted}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel="Confirmar pagamento"
            >
              <LinearGradient colors={HEADER_GRADIENT as unknown as [string, string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ctaGradient}>
                <Ionicons name="card" size={18} color="#FFFFFF" />
                <Text style={styles.ctaText}>
                  {place.isPending ? 'Confirmando...' : selectedMethod === 'pix' ? 'Gerar Pix' : 'Confirmar Pagamento'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}
