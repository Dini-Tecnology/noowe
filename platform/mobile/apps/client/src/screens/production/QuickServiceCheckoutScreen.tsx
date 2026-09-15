/* Hallmark · pre-emit critique: P5 H4 E4 S5 R4 V5 */
/* Hallmark · macrostructure: Long Document · tone: warm utilitarian · anchor hue: orange */
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { useCart } from '@/shared/contexts/CartContext';
import customerBackend from '../../services/customer-backend';
import { money } from './shared';

const HEADER_GRADIENT = ['#FF5724', '#F97316', '#F59E0B'] as const;

type PaymentMethodType = 'pix' | 'credit' | 'apple' | 'google' | 'tap' | 'wallet';

const PAYMENT_METHODS: { type: PaymentMethodType; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { type: 'pix', icon: 'qr-code-outline', label: 'PIX' },
  { type: 'credit', icon: 'card-outline', label: 'Crédito' },
  { type: 'apple', icon: 'logo-apple', label: 'Apple Pay' },
  { type: 'google', icon: 'logo-google', label: 'Google Pay' },
  { type: 'tap', icon: 'flash-outline', label: 'TAP to Pay' },
  { type: 'wallet', icon: 'wallet-outline', label: 'Carteira' },
];

/**
 * Skip the Line checkout: no gateway integration — payment stays simulated,
 * same as `payTableBill` does for fine/casual dining. Selecting a method and
 * confirming places the order (which already counts as "paid") and drops the
 * customer straight into live tracking.
 */
export default function QuickServiceCheckoutScreen({ navigation }: any) {
  const colors = useColors();
  const cart = useCart();
  const queryClient = useQueryClient();
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodType>('pix');
  const [usePoints, setUsePoints] = useState(false);

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
    mutationFn: () =>
      customerBackend.placeOrder({
        restaurantId: cart.restaurantId!,
        items: cart.items.map((i) => ({ menuItemId: i.menu_item_id, quantity: i.quantity, specialInstructions: i.special_instructions })),
      }),
    onSuccess: (order) => {
      cart.clearCart();
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      navigation.replace('OrderDetail', { orderId: order.id });
    },
    onError: (error: Error) => Alert.alert('Pagamento não confirmado', error.message),
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
        body: { paddingHorizontal: 16, marginTop: -8, gap: 16 },
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
          <LinearGradient colors={HEADER_GRADIENT as unknown as [string, string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradientHeader}>
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

          <View style={styles.body}>
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

            <TouchableOpacity
              style={[styles.cta, (place.isPending || !cart.items.length) && styles.ctaDisabled]}
              onPress={() => place.mutate()}
              disabled={place.isPending || !cart.items.length}
              activeOpacity={0.9}
              accessibilityRole="button"
            >
              <LinearGradient colors={HEADER_GRADIENT as unknown as [string, string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ctaGradient}>
                <Ionicons name="card" size={18} color="#FFFFFF" />
                <Text style={styles.ctaText}>{place.isPending ? 'Confirmando...' : 'Confirmar Pagamento'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}
