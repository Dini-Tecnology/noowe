/* Hallmark · pre-emit critique: P5 H4 E4 S5 R4 V5 */
/* Hallmark · macrostructure: Long Document · tone: warm utilitarian · anchor hue: orange */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { useCart } from '@/shared/contexts/CartContext';
import { cartOrderItems } from '../../utils/cart-order-items';
import customerBackend, { type ConsumptionMode, type CustomerOrder, type PlaceOrderItem } from '../../services/customer-backend';
import { useServiceTypeFor } from '../../hooks/useServiceTypeFeatures';
import { useDistanceToRestaurant } from '../../hooks/useDistanceToRestaurant';
import { PixPendingPanel } from '../../components/quick/PixPendingPanel';
import { QUICK_ORDER_ERROR_COPY, duplicateOrderId, quickOrderErrorKind } from '../../services/quick-service-errors';
import { billShares } from '../../services/bill-shares';
import { centsFromDigits, money, moneyCents, percentFromBps, translateOrderError } from './shared';
import { formatDistance, isFarFromRestaurant, pickupPolicyText } from './quick-service-ui';
import { INVALID_RECEIPT_DOCUMENT, RECEIPT_DOCUMENT_OFF, ReceiptDocumentField, receiptDocumentForPayment } from '../../components/payment/ReceiptDocumentField';

const HEADER_GRADIENT = ['#FF5724', '#F97316', '#F59E0B'] as const;

// Só o que o provedor cobra de verdade (ADR-020). Apple Pay, Google Pay e TAP ficam fora até existir cobrança real.
type PaymentMethodType = 'pix' | 'credit_card';

const PAYMENT_METHODS: { type: PaymentMethodType; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { type: 'pix', icon: 'qr-code-outline', label: 'PIX' },
  { type: 'credit_card', icon: 'card-outline', label: 'Crédito' },
];

/** Dados que o carrinho coleta e o checkout envia ao servidor (ADR-013). */
export type QuickCheckoutParams = {
  callName?: string;
  consumptionMode?: ConsumptionMode;
  pickupSlotStart?: string | null;
};

/** Cobrança criada e ainda não confirmada: Pix com `code`, cartão com `checkoutUrl`. */
type PendingCharge = { orderId: string; code: string | null; checkoutUrl: string | null; expiresAt: string | null; simulated: boolean };

/**
 * Checkout do Skip the Line: cria o pedido e a cobrança no provedor que o servidor indicar.
 * Só a confirmação do servidor (webhook) libera o pedido para o KDS; esta tela nunca confirma nada.
 */
export default function QuickServiceCheckoutScreen({ navigation, route }: any) {
  const params: QuickCheckoutParams = route?.params ?? {};
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const cart = useCart();
  const queryClient = useQueryClient();
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodType>('pix');
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [pix, setPix] = useState<PendingCharge | null>(null);
  const [needsDocument, setNeedsDocument] = useState(false);
  const [document, setDocument] = useState('');
  const [receiptDoc, setReceiptDoc] = useState(RECEIPT_DOCUMENT_OFF);
  // Gorjeta opcional, sem nada marcado: é a pessoa que escolhe (ADR-032).
  const [couponInput, setCouponInput] = useState('');
  // O que vale é o código confirmado no "Aplicar": digitar não consulta nem cobra.
  const [couponCode, setCouponCode] = useState('');
  const lastAppliedCoupon = useRef('');
  // Cupom digitado e não aplicado não pode sumir em silêncio: pagar espera o "Aplicar".
  const couponPending = couponInput.trim() !== couponCode;
  const [tipBps, setTipBps] = useState(0);
  const [tipDigits, setTipDigits] = useState('');
  const tipCents = tipDigits ? parseInt(tipDigits, 10) : 0;
  const checkoutKey = useRef(Crypto.randomUUID());
  // Uma cobrança por forma de pagamento: repetir a mesma retoma, trocar a forma não reaproveita a errada.
  const chargeKeys = useRef(new Map<PaymentMethodType, string>());
  const { policies } = useServiceTypeFor(cart.restaurantId, 'quick_service');
  const tipOptions = policies?.feeOrTipMode === 'tip' ? policies.tipPresetsBps : [];
  const tipOffered = tipOptions.length > 0;
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

  const paymentMode = useQuery({
    queryKey: ['order-payment-mode', cart.restaurantId],
    queryFn: () => customerBackend.getOrderPaymentMode(cart.restaurantId!),
    enabled: !!cart.restaurantId,
  });
  const paymentUnavailable = paymentMode.data === 'unavailable';

  // O total cobrado é o que o servidor calcular no pedido; o carrinho é só a prévia.
  const total = cart.total;
  const hasTip = tipBps > 0 || tipCents > 0;
  const previewItems = useMemo(() => cartOrderItems(cart.items).map((item) => ({ menuItemId: item.menuItemId, quantity: item.quantity })), [cart.items]);
  // O desconto antes de pagar, inclusive o automático. Quem calcula é o servidor.
  const coupon = useQuery({
    queryKey: ['quick-coupon-preview', cart.restaurantId, couponCode, total, previewItems],
    queryFn: () => billShares.couponPreview(cart.restaurantId!, couponCode || null, Math.round(total * 100), previewItems, 'quick_service'),
    enabled: !!cart.restaurantId,
    placeholderData: (previous) => previous,
  });
  const couponDiscountCents = coupon.data?.discountCents ?? 0;
  // Prévia do total: quem calcula é o servidor. Gorjeta sobre o pedido; conveniência, quando o parâmetro estiver ligado.
  const quote = useQuery({
    queryKey: ['quick-checkout-quote', cart.restaurantId, total, coupon.data?.amountCents, tipBps, tipCents, !!params.pickupSlotStart],
    queryFn: () => billShares.checkoutQuote(cart.restaurantId!, coupon.data?.amountCents ?? Math.round(total * 100), { scheduled: !!params.pickupSlotStart, tipBps, tipCents }),
    enabled: !!cart.restaurantId,
    placeholderData: (previous) => previous,
  });

  const place = useMutation({
    mutationFn: async () => {
      const orderItems: PlaceOrderItem[] = cartOrderItems(cart.items);
      if (!orderItems.length) throw new Error('A comanda está vazia.');
      // Antes de criar o pedido: CPF da nota inválido não vira pedido sem pagamento.
      const receiptDocument = receiptDocumentForPayment(receiptDoc);
      if (receiptDocument === undefined) throw Object.assign(new Error(INVALID_RECEIPT_DOCUMENT), { code: 'invalid_receipt_document' });
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
      // Mudar a gorjeta muda o valor: a cobrança antiga não serve mais.
      // O servidor valida e diz por que não vale. O total cobrado já sai com o desconto.
      let paidWithCoupon = false;
      if (couponCode && !coupon.data?.refusal) {
        paidWithCoupon = (await billShares.applyCouponToOrder(order.id, couponCode))?.paidWithCoupon === true;
        lastAppliedCoupon.current = couponCode;
      } else if (lastAppliedCoupon.current) {
        await billShares.removeCouponFromOrder(order.id);
        lastAppliedCoupon.current = '';
      }
      // Cupom que zera o pedido (inclusive o automático): já está pago, sem cobrança.
      if (paidWithCoupon || quote.data?.totalCents === 0) {
        const fresh = paidWithCoupon ? null : await customerBackend.getOrder(order.id);
        if (paidWithCoupon || fresh?.paymentStatus === 'confirmed') return { order, payment: { paymentStatus: 'confirmed' } as any };
      }
      if (!chargeKeys.current.has(selectedMethod)) chargeKeys.current.set(selectedMethod, Crypto.randomUUID());
      const payment = await customerBackend.startPayment({
        orderId: order.id,
        restaurantId: cart.restaurantId!,
        paymentMethod: selectedMethod,
        idempotencyKey: chargeKeys.current.get(selectedMethod)!,
        tipBps,
        tipCents,
        payerCpfCnpj: document.replace(/\D/g, '') || undefined,
        receiptDocument,
      });
      return { order, payment };
    },
    onSuccess: ({ order, payment }) => {
      setNeedsDocument(false);
      if (payment.paymentStatus === 'confirmed') return finish(order.id);
      if (payment.paymentStatus === 'pending' && (payment.pixCode || payment.checkoutUrl)) {
        setPix({ orderId: order.id, code: payment.pixCode, checkoutUrl: payment.checkoutUrl, expiresAt: payment.paymentExpiresAt, simulated: payment.simulated });
        if (!payment.pixCode && payment.checkoutUrl) void WebBrowser.openBrowserAsync(payment.checkoutUrl).catch(() => undefined);
        return undefined;
      }
      Alert.alert('Pagamento não confirmado', 'O pagamento ainda não foi confirmado. Tente novamente.');
      return undefined;
    },
    onError: (error: unknown) => {
      if ((error as { code?: string }).code === 'payer_document_required') { setNeedsDocument(true); return; }
      if ((error as { code?: string }).code === 'invalid_receipt_document') { Alert.alert('CPF na nota', INVALID_RECEIPT_DOCUMENT); return; }
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
      // Cupom recusado vem com o motivo: o pedido segue sem ele, se a pessoa quiser.
      if ((error as { code?: string }).code === 'P0017') {
        Alert.alert('Cupom não aplicado', (error as Error).message);
        return;
      }
      Alert.alert('Pagamento não confirmado', translateOrderError(error));
    },
  });

  // Gorjeta alta pede confirmação, contra erro de digitação (resposta 55).
  const confirmAndPlace = useCallback(() => {
    if (!quote.data?.confirmTip) { place.mutate(); return; }
    Alert.alert('Confirma a gorjeta?', `Confirma gorjeta de ${moneyCents(quote.data.tipCents)}?`, [
      { text: 'Corrigir', style: 'cancel' },
      { text: 'Confirmar', onPress: () => place.mutate() },
    ]);
  }, [place, quote.data]);

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
    chargeKeys.current.clear();
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
  // Abaixo do mínimo de um meio, ele some (resposta 79). Pedido zerado pelo cupom não precisa de meio.
  const availableMethods = PAYMENT_METHODS.filter((method) => (method.type === 'pix' ? quote.data?.pixAvailable : quote.data?.cardAvailable) !== false);
  const zeroTotal = quote.data?.totalCents === 0;
  if (quote.data && !zeroTotal && availableMethods.length > 0 && !availableMethods.some((method) => method.type === selectedMethod)) {
    setSelectedMethod(availableMethods[0].type);
  }
  const noMethod = !!quote.data && !zeroTotal && availableMethods.length === 0;
  // Outro cupom é outro valor: a cobrança antiga não serve mais.
  const applyCoupon = useCallback(() => {
    setCouponCode(couponInput.trim());
    chargeKeys.current.clear();
  }, [couponInput]);
  const chooseTip = useCallback((bps: number, digits: string) => {
    setTipBps(bps);
    setTipDigits(digits);
    chargeKeys.current.clear();
  }, []);

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
        sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.foreground },
        methodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
        methodItem: {
          width: '31%', minHeight: 80, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 6,
        },
        tipChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 },
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
        input: { height: 48, borderRadius: 12, paddingHorizontal: 14, fontSize: 16, backgroundColor: colors.backgroundTertiary, color: colors.foreground },
        summaryCard: { backgroundColor: colors.card, borderRadius: 16, padding: 16, gap: 8 },
        summaryTitle: { fontSize: 14, fontWeight: '700', color: colors.foreground, marginBottom: 4 },
        summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
        summaryLabel: { fontSize: 13, color: colors.foregroundSecondary },
        summaryValue: { fontSize: 13, fontWeight: '600', color: colors.foreground },
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

          <View style={[styles.body, { marginTop: 16 }]}>
            <View style={{ gap: 12 }}>
              <Text style={styles.sectionTitle}>Forma de pagamento</Text>
              <View style={styles.methodGrid}>
                {quote.data && quote.data.totalCents > 0 && !availableMethods.length ? (
                  <Text style={styles.methodLabel} testID="pay-at-counter">O valor está abaixo do mínimo para pagar pelo app. Pague no balcão.</Text>
                ) : null}
                {availableMethods.map((method) => {
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

            {needsDocument && (
              <View style={styles.policyCard}>
                <Text style={styles.policyText}>Informe seu CPF para gerar a cobrança (só na primeira vez).</Text>
                <TextInput
                  style={styles.input}
                  placeholder="CPF"
                  placeholderTextColor={colors.foregroundMuted}
                  keyboardType="number-pad"
                  maxLength={14}
                  value={document}
                  onChangeText={setDocument}
                  accessibilityLabel="CPF do pagador"
                />
              </View>
            )}

            {/* Só quando há cobrança online: sem ela, o pagamento é no balcão e o CPF é pedido lá. */}
            {!zeroTotal && !paymentUnavailable && !noMethod && (
              <View style={styles.policyCard}>
                <ReceiptDocumentField value={receiptDoc} onChange={setReceiptDoc} fallback={document} />
              </View>
            )}

            {paymentUnavailable && (
              <View style={styles.warnCard} accessibilityRole="alert">
                <Ionicons name="alert-circle-outline" size={18} color={colors.warning ?? colors.primary} />
                <Text style={styles.warnText}>Este restaurante ainda não aceita pagamento online.</Text>
              </View>
            )}

            {tipOffered && !pix && (
              <View style={styles.policyCard}>
                <Text style={styles.sectionTitle}>Gorjeta (opcional)</Text>
                <View style={styles.methodGrid}>
                  {[0, ...tipOptions].map((bps) => {
                    const selected = tipBps === bps && tipCents === 0;
                    return (
                      <TouchableOpacity
                        key={bps}
                        style={[styles.tipChip, selected ? styles.methodSelected : styles.methodUnselected]}
                        onPress={() => chooseTip(bps, '')}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                      >
                        <Text style={[styles.methodLabel, { color: selected ? colors.primary : colors.foreground }]}>{bps ? `${percentFromBps(bps)}%` : 'Sem'}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Outro valor (R$)"
                  placeholderTextColor={colors.foregroundMuted}
                  keyboardType="number-pad"
                  value={tipCents > 0 ? moneyCents(tipCents).replace(/^R\$\s?/, '') : ''}
                  onChangeText={(text) => chooseTip(0, centsFromDigits(text))}
                  accessibilityLabel="Gorjeta em valor"
                />
              </View>
            )}

            {!pix && (
              <View style={styles.policyCard}>
                <Text style={styles.sectionTitle}>Cupom</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Tem um cupom?"
                  placeholderTextColor={colors.foregroundMuted}
                  autoCapitalize="characters"
                  value={couponInput}
                  onChangeText={setCouponInput}
                  accessibilityLabel="Cupom"
                />
                <TouchableOpacity onPress={applyCoupon} accessibilityRole="button">
                  <Text style={styles.summaryValue}>{couponInput.trim() || !couponCode ? 'Aplicar' : 'Remover'}</Text>
                </TouchableOpacity>
                {coupon.data?.refusal ? <Text style={styles.policyText} accessibilityRole="alert">{coupon.data.refusal}</Text> : null}
              </View>
            )}

            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Resumo</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal ({cart.itemCount} {cart.itemCount === 1 ? 'item' : 'itens'})</Text>
                <Text style={styles.summaryValue}>{money(cart.total)}</Text>
              </View>
              {hasTip && quote.data && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Gorjeta</Text>
                  <Text style={styles.summaryValue}>{moneyCents(quote.data.tipCents)}</Text>
                </View>
              )}
              {couponDiscountCents > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Cupom</Text>
                  <Text style={styles.summaryValue}>− {moneyCents(couponDiscountCents)}</Text>
                </View>
              )}
              {!!quote.data?.convenienceCents && (
                <>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Taxa de conveniência NOOWE</Text>
                    <Text style={styles.summaryValue}>{moneyCents(quote.data.convenienceCents)}</Text>
                  </View>
                  <Text style={styles.policyText}>Cobre o pedido pelo app, sem fila. Vai para a NOOWE, não para o restaurante.</Text>
                </>
              )}
              <View style={styles.divider} />
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>{quote.data ? moneyCents(quote.data.totalCents) : money(total)}</Text>
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
            ) : pix && !pix.code ? (
              <View style={styles.policyCard}>
                <Text style={styles.sectionTitle}>Aguardando confirmação</Text>
                <Text style={styles.policyText}>O pedido vai para a cozinha assim que o pagamento do cartão for confirmado. Esta tela atualiza sozinha.</Text>
                {pix.checkoutUrl && (
                  <TouchableOpacity style={styles.cta} onPress={() => void WebBrowser.openBrowserAsync(pix.checkoutUrl!)} accessibilityRole="button" accessibilityLabel="Abrir pagamento">
                    <LinearGradient colors={HEADER_GRADIENT as unknown as [string, string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ctaGradient}>
                      <Text style={styles.ctaText}>Abrir pagamento</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                )}
              </View>
            ) : pix ? (
              <PixPendingPanel
                code={pix.code!}
                expiresAt={pix.expiresAt}
                checking={pixOrder.isFetching}
                onCheck={() => {
                  void pixOrder.refetch().then((result) => {
                    if (result.data && result.data.paymentStatus !== 'confirmed' && result.data.fulfillmentStatus !== 'cancelled') {
                      Alert.alert('Pagamento pendente', 'Ainda não recebemos a confirmação do Pix. Assim que o banco confirmar, o pedido segue sozinho.');
                    }
                  });
                }}
                onSimulatePaid={__DEV__ && pix.simulated ? () => simulatePixPaid.mutate() : undefined}
                onExpired={() => { void pixOrder.refetch(); }}
              />
            ) : (
            <TouchableOpacity
              style={[styles.cta, (place.isPending || !cart.items.length || !policyAccepted || paymentUnavailable || couponPending || noMethod) && styles.ctaDisabled]}
              onPress={confirmAndPlace}
              disabled={place.isPending || !cart.items.length || !policyAccepted || paymentUnavailable || couponPending || noMethod}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel="Confirmar pagamento"
            >
              <LinearGradient colors={HEADER_GRADIENT as unknown as [string, string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ctaGradient}>
                <Ionicons name="card" size={18} color="#FFFFFF" />
                <Text style={styles.ctaText}>
                  {place.isPending ? 'Gerando cobrança...' : zeroTotal ? 'Confirmar pedido' : selectedMethod === 'pix' ? 'Gerar Pix' : 'Pagar com cartão'}
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
