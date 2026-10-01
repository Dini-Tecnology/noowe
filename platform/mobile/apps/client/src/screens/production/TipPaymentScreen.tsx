/* Hallmark · pre-emit critique: P5 H5 E4 S5 R4 V5 */
/* Hallmark · macrostructure: Form · tone: warm utilitarian · anchor hue: orange */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useTableCheckout } from '../../hooks/useTableCheckout';
import { useWallet } from '../../hooks/useWallet';
import { CardBrandIcon, cardBrandFromLabel } from '../../components/payment/CardBrandIcon';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { type CustomerPaymentMethod, type PaymentMethodType } from '../../services/customer-backend';
import { money } from './shared';

const TIP_OPTIONS = [
  { pct: 0, label: 'Sem' },
  { pct: 10, label: '10%' },
  { pct: 15, label: '15%' },
  { pct: 20, label: '20%' },
] as const;

const PAYMENT_METHODS: { id: PaymentMethodType; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { id: 'pix', label: 'PIX', icon: 'qr-code-outline' },
  { id: 'credit_card', label: 'Crédito', icon: 'card-outline' },
  { id: 'apple_pay', label: 'Apple Pay', icon: 'logo-apple' },
  { id: 'google_pay', label: 'Google Pay', icon: 'logo-google' },
  { id: 'tap_to_pay', label: 'TAP to Pay', icon: 'flash-outline' },
  { id: 'wallet', label: 'Carteira', icon: 'wallet-outline' },
];

const SAVED_TYPES: PaymentMethodType[] = ['pix', 'credit_card', 'debit_card'];

export default function TipPaymentScreen({ route, navigation }: any) {
  const colors = useColors();
  const tableSessionId: string | undefined = route?.params?.tableSessionId;
  const restaurantName: string | undefined = route?.params?.restaurantName;
  const baseAmount: number = route?.params?.baseAmount ?? 0;
  const serviceFeePercent: number = route?.params?.serviceFeePercent ?? 10;
  const splitMode: 'mine' | 'equal' | 'byItem' | 'fixed' = route?.params?.splitMode ?? 'mine';

  const [tipPct, setTipPct] = useState<number>(route?.params?.tipPercent ?? 10);
  const [method, setMethod] = useState<PaymentMethodType>('pix');
  const [savedId, setSavedId] = useState<string | null>(null);
  const { query: walletQuery } = useWallet();
  const savedMethods = useMemo(
    () => (walletQuery.data?.paymentMethods ?? []).filter((m) => SAVED_TYPES.includes(m.methodType as PaymentMethodType)),
    [walletQuery.data],
  );
  const userPicked = useRef(false);

  // Pre-select the customer's default saved method until they choose one themselves.
  useEffect(() => {
    if (userPicked.current || savedMethods.length === 0) return;
    const preferred = savedMethods.find((m) => m.isDefault) ?? savedMethods[0];
    setSavedId(preferred.id);
    setMethod(preferred.methodType as PaymentMethodType);
  }, [savedMethods]);

  const selectSaved = useCallback((saved: CustomerPaymentMethod) => {
    userPicked.current = true;
    setSavedId(saved.id);
    setMethod(saved.methodType as PaymentMethodType);
  }, []);
  const selectGeneric = useCallback((id: PaymentMethodType) => {
    userPicked.current = true;
    setSavedId(null);
    setMethod(id);
  }, []);

  const serviceFee = baseAmount * (serviceFeePercent / 100);
  const tip = baseAmount * (tipPct / 100);
  const total = baseAmount + serviceFee + tip;

  const pay = useTableCheckout({
    tableSessionId,
    tipPercent: tipPct,
    paymentMethod: method,
    splitMode,
    baseAmount,
    itemIds: route?.params?.itemIds,
    restaurantName,
    onSuccess: (result) => navigation.reset({
      index: 1,
      routes: [{ name: 'Main' }, { name: 'PaymentSuccess', params: { result, restaurantName, tableSessionId } }],
    }),
    onError: (error) => Alert.alert('Pagamento não concluído', error.message),
  });

  const confirm = useCallback(() => pay.mutate(), [pay]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        gradientHeader: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 },
        headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
        backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
        headerTotalLabel: { fontSize: 11, color: 'rgba(255,255,255,0.85)', textAlign: 'right' },
        headerTotalValue: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', textAlign: 'right' },
        headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
        headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.9)' },
        content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, gap: 18 },
        card: { borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 16, gap: 12 },
        cardTitle: { fontSize: 15, fontWeight: '700', color: colors.foreground },
        tipRow: { flexDirection: 'row', gap: 10 },
        tipChip: {
          flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 14,
          borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.backgroundTertiary, gap: 2,
        },
        tipChipActive: { borderColor: colors.primary, backgroundColor: colors.backgroundSecondary },
        tipChipLabel: { fontSize: 14, fontWeight: '700', color: colors.foreground },
        tipChipLabelActive: { color: colors.primary },
        tipChipValue: { fontSize: 11, color: colors.foregroundSecondary },
        methodsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
        methodCard: {
          width: '31%', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 16,
          borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.backgroundTertiary,
        },
        methodCardActive: { borderColor: colors.primary, backgroundColor: colors.backgroundSecondary },
        methodLabel: { fontSize: 12, fontWeight: '600', color: colors.foreground, textAlign: 'center' },
        methodLabelActive: { color: colors.primary },
        savedList: { gap: 8 },
        savedTitle: { fontSize: 12, fontWeight: '700', color: colors.foregroundSecondary },
        savedRow: {
          flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16,
          borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.backgroundTertiary,
        },
        savedBody: { flex: 1 },
        savedLabel: { textAlign: 'left', fontSize: 14 },
        savedDetail: { fontSize: 11, color: colors.foregroundSecondary, marginTop: 2 },
        addMethod: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
        addMethodText: { fontSize: 13, fontWeight: '700', color: colors.primary },
        summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
        summaryLabel: { fontSize: 13, color: colors.foregroundSecondary },
        summaryValue: { fontSize: 13, fontWeight: '600', color: colors.foreground },
        totalRow: {
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10,
          borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: 4,
        },
        totalLabel: { fontSize: 15, fontWeight: '700', color: colors.foreground },
        totalValue: { fontSize: 20, fontWeight: '800', color: colors.primary },
        cta: { paddingVertical: 16, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center' },
        ctaDisabled: { opacity: 0.6 },
        ctaText: { color: colors.primaryForeground, fontSize: 16, fontWeight: '700' },
      }),
    [colors],
  );

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <LinearGradient colors={[colors.primary, colors.primaryDark ?? colors.primary]} style={styles.gradientHeader}>
        <View style={styles.headerTop}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} disabled={pay.isPending} accessibilityRole="button" accessibilityLabel="Voltar">
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTotalLabel}>Total</Text>
            <Text style={styles.headerTotalValue}>{money(total)}</Text>
          </View>
        </View>
        <Text style={styles.headerTitle}>Gorjeta & Pagamento</Text>
        <Text style={styles.headerSub}>{restaurantName ?? 'Restaurante'}</Text>
      </LinearGradient>

      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Gorjeta</Text>
          <View style={styles.tipRow}>
            {TIP_OPTIONS.map((option) => {
              const active = tipPct === option.pct;
              const value = baseAmount * (option.pct / 100);
              return (
                <TouchableOpacity
                  key={option.pct}
                  style={[styles.tipChip, active && styles.tipChipActive]}
                  onPress={() => setTipPct(option.pct)}
                  disabled={pay.isPending}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.tipChipLabel, active && styles.tipChipLabelActive]}>{option.label}</Text>
                  {option.pct > 0 && <Text style={styles.tipChipValue}>{money(value)}</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Forma de pagamento</Text>
          <Text style={styles.summaryLabel}>Pagamento simulado. Nenhum valor será cobrado.</Text>
          {savedMethods.length > 0 ? (
            <View style={styles.savedList}>
              <Text style={styles.savedTitle}>Seus métodos</Text>
              {savedMethods.map((saved) => {
                const active = savedId === saved.id;
                return (
                  <TouchableOpacity
                    key={saved.id}
                    style={[styles.savedRow, active && styles.methodCardActive]}
                    onPress={() => selectSaved(saved)}
                    disabled={pay.isPending}
                    activeOpacity={0.85}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${saved.displayName}, ${saved.detail}`}
                  >
                    {saved.methodType === 'pix'
                      ? <Ionicons name="qr-code-outline" size={20} color={active ? colors.primary : colors.foregroundSecondary} />
                      : <CardBrandIcon brand={cardBrandFromLabel(saved.displayName)} width={36} />}
                    <View style={styles.savedBody}>
                      <Text style={[styles.methodLabel, active && styles.methodLabelActive, styles.savedLabel]}>{saved.displayName}</Text>
                      <Text style={styles.savedDetail}>{saved.detail}{saved.isDefault ? ' · padrão' : ''}</Text>
                    </View>
                    <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={20} color={active ? colors.primary : colors.foregroundMuted} />
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
          <TouchableOpacity onPress={() => navigation.navigate('PaymentMethods')} accessibilityRole="button" style={styles.addMethod}>
            <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
            <Text style={styles.addMethodText}>Cadastrar cartão ou PIX</Text>
          </TouchableOpacity>
          {savedMethods.length > 0 ? <Text style={styles.savedTitle}>Outras formas</Text> : null}
          <View style={styles.methodsGrid}>
            {PAYMENT_METHODS.map((option) => {
              const active = savedId === null && method === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[styles.methodCard, active && styles.methodCardActive]}
                  onPress={() => selectGeneric(option.id)}
                  disabled={pay.isPending}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Ionicons name={option.icon} size={22} color={active ? colors.primary : colors.foregroundSecondary} />
                  <Text style={[styles.methodLabel, active && styles.methodLabelActive]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Resumo</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Seus itens</Text>
            <Text style={styles.summaryValue}>{money(baseAmount)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Serviço ({serviceFeePercent}%)</Text>
            <Text style={styles.summaryValue}>{money(serviceFee)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Gorjeta ({tipPct}%)</Text>
            <Text style={styles.summaryValue}>{money(tip)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{money(total)}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.cta, (!tableSessionId || pay.isPending) && styles.ctaDisabled]}
          onPress={confirm}
          disabled={!tableSessionId || pay.isPending}
          activeOpacity={0.9}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>{pay.isPending ? 'Processando…' : `Confirmar pagamento simulado · ${money(total)}`}</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}
