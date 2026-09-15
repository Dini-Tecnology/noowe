/* Hallmark · pre-emit critique: P5 H5 E4 S5 R4 V5 */
/* Hallmark · macrostructure: Long Document · tone: warm utilitarian · anchor hue: orange */
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { useVisitSession } from '../../contexts/VisitSessionContext';
import customerBackend from '../../services/customer-backend';
import { money, StateView } from './shared';

type SplitMode = 'mine' | 'equal' | 'byItem' | 'fixed';

const MODES: { id: SplitMode; label: string; subtitle: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { id: 'mine', label: 'Meus Itens', subtitle: 'Cada um paga o que pediu', icon: 'person-outline' },
  { id: 'equal', label: 'Partes Iguais', subtitle: 'Divide igualmente', icon: 'people-outline' },
  { id: 'byItem', label: 'Por Item', subtitle: 'Escolha itens específicos', icon: 'receipt-outline' },
  { id: 'fixed', label: 'Valor Fixo', subtitle: 'Defina quanto pagar', icon: 'cash-outline' },
];

const AVATAR_TONES = ['#EA580C', '#DB2777', '#2563EB', '#9333EA', '#0D9488', '#CA8A04'];

export default function SplitBillScreen({ route, navigation }: any) {
  const colors = useColors();
  const { session } = useVisitSession();
  const tableSessionId: string | undefined = route?.params?.tableSessionId ?? session?.tableSessionId;
  const restaurantName: string | undefined = route?.params?.restaurantName;
  const [mode, setMode] = useState<SplitMode>('mine');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [fixedAmount, setFixedAmount] = useState('');

  const bill = useQuery({
    queryKey: ['table-bill', tableSessionId],
    queryFn: () => customerBackend.getTableBill(tableSessionId!),
    enabled: !!tableSessionId,
  });

  const perPerson = useMemo(() => {
    const items = bill.data?.items ?? [];
    const byDiner = new Map<string, { name: string; isMe: boolean; subtotal: number }>();
    for (const item of items) {
      const key = item.dinerId ?? item.placedBy;
      const existing = byDiner.get(key);
      const name = item.placedByIsMe && !item.dinerId ? 'Você' : item.dinerName;
      const isMe = item.placedByIsMe && (!item.dinerId || item.dinerName === item.placedByName);
      if (existing) existing.subtotal += item.totalPrice;
      else byDiner.set(key, { name, isMe, subtotal: item.totalPrice });
    }
    return [...byDiner.entries()].map(([id, value]) => ({ dinerId: id, ...value }))
      .sort((a, b) => (a.isMe === b.isMe ? 0 : a.isMe ? -1 : 1));
  }, [bill.data]);

  const feePct = bill.data?.serviceFeePercent ?? 10;
  const subtotal = bill.data?.subtotal ?? 0;
  const totalWithFee = subtotal * (1 + feePct / 100);
  const participantCount = Math.max(perPerson.length, 1);

  // The raw item-level subtotal for whichever mode is selected — no service
  // fee or tip yet, both of which get decided on the next screen (Gorjeta &
  // Pagamento) and applied there against this same base amount.
  const baseAmount = useMemo(() => {
    if (!bill.data) return 0;
    if (mode === 'mine') return perPerson.find((p) => p.isMe)?.subtotal ?? 0;
    if (mode === 'equal') return subtotal / participantCount;
    if (mode === 'byItem') {
      return bill.data.items
        .filter((item) => selectedItemIds.includes(item.orderItemId))
        .reduce((sum, item) => sum + item.totalPrice, 0);
    }
    return Number(fixedAmount.replace(',', '.')) || 0;
  }, [mode, bill.data, perPerson, subtotal, participantCount, selectedItemIds, fixedAmount]);

  const myShare = baseAmount * (1 + feePct / 100);

  const toggleItem = useCallback((id: string) => {
    setSelectedItemIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }, []);

  const proceedToPayment = useCallback(() => {
    if (baseAmount <= 0) {
      Alert.alert('Selecione um valor', 'Escolha itens ou informe um valor maior que zero para continuar.');
      return;
    }
    navigation.navigate('TipPayment', {
      tableSessionId,
      restaurantName,
      baseAmount,
      serviceFeePercent: feePct,
      splitMode: mode,
    });
  }, [navigation, tableSessionId, restaurantName, baseAmount, feePct, mode]);

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
        content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, gap: 16 },
        sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.foreground, marginBottom: 10 },
        peopleRow: { flexDirection: 'row', gap: 14 },
        person: { alignItems: 'center', gap: 4, width: 62 },
        personAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
        personAvatarText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
        personName: { fontSize: 11, color: colors.foregroundSecondary, textAlign: 'center' },
        personValue: { fontSize: 12, fontWeight: '700', color: colors.foreground },
        modeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
        modeCard: {
          width: '47%', borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card,
          padding: 14, gap: 8,
        },
        modeCardSelected: { borderColor: colors.primary, backgroundColor: colors.backgroundSecondary },
        modeIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundTertiary },
        modeIconSelected: { backgroundColor: colors.primaryLight },
        modeLabel: { fontSize: 14, fontWeight: '700', color: colors.foreground },
        modeLabelSelected: { color: colors.primary },
        modeSub: { fontSize: 11, color: colors.foregroundSecondary },
        itemRow: {
          flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10,
          borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
        },
        checkbox: {
          width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.border,
          alignItems: 'center', justifyContent: 'center',
        },
        checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
        itemName: { flex: 1, fontSize: 13, color: colors.foreground },
        itemPrice: { fontSize: 13, fontWeight: '600', color: colors.foreground },
        fixedInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.backgroundTertiary, borderRadius: 14, paddingHorizontal: 14, height: 52 },
        fixedPrefix: { fontSize: 16, fontWeight: '700', color: colors.foregroundSecondary },
        fixedInput: { flex: 1, fontSize: 18, fontWeight: '700', color: colors.foreground },
        summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
        summaryLabel: { fontSize: 13, color: colors.foregroundSecondary },
        summaryValue: { fontSize: 13, fontWeight: '600', color: colors.foreground },
        payCard: { borderRadius: 16, padding: 16, backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.primaryLight, gap: 4 },
        payLabel: { fontSize: 13, color: colors.foregroundSecondary },
        payValue: { fontSize: 26, fontWeight: '800', color: colors.primary },
        cta: { paddingVertical: 16, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center' },
        ctaDisabled: { opacity: 0.6 },
        ctaText: { color: colors.primaryForeground, fontSize: 16, fontWeight: '700' },
      }),
    [colors],
  );

  if (!tableSessionId) {
    return (
      <ScreenContainer edges={['top', 'bottom']}>
        <StateView empty="Nenhuma mesa aberta no momento." emptyIcon="receipt-outline" />
        <TouchableOpacity style={{ alignSelf: 'center' }} onPress={() => navigation.goBack()} accessibilityRole="button">
          <Text style={{ color: colors.primary, fontWeight: '700' }}>Voltar</Text>
        </TouchableOpacity>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <LinearGradient colors={[colors.primary, colors.primaryDark ?? colors.primary]} style={styles.gradientHeader}>
        <View style={styles.headerTop}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTotalLabel}>Total da mesa</Text>
            <Text style={styles.headerTotalValue}>{money(totalWithFee)}</Text>
          </View>
        </View>
        <Text style={styles.headerTitle}>Dividir Conta</Text>
        <Text style={styles.headerSub}>
          {restaurantName ?? 'Restaurante'} · {participantCount} pessoa{participantCount > 1 ? 's' : ''}
        </Text>
      </LinearGradient>

      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <StateView loading={bill.isLoading} error={bill.error} onRetry={() => bill.refetch()} />

        {bill.data && (
          <>
            <View>
              <Text style={styles.sectionTitle}>Na mesa</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.peopleRow}>
                {perPerson.map((person, index) => (
                  <View key={person.dinerId} style={styles.person}>
                    <View style={[styles.personAvatar, { backgroundColor: AVATAR_TONES[index % AVATAR_TONES.length] }]}>
                      <Text style={styles.personAvatarText}>{person.name.charAt(0).toLocaleUpperCase('pt-BR')}</Text>
                    </View>
                    <Text style={styles.personName} numberOfLines={1}>{person.isMe ? 'Você' : person.name}</Text>
                    <Text style={styles.personValue}>{money(person.subtotal)}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>

            <View>
              <Text style={styles.sectionTitle}>Como dividir?</Text>
              <View style={styles.modeGrid}>
                {MODES.map((option) => {
                  const selected = mode === option.id;
                  return (
                    <TouchableOpacity
                      key={option.id}
                      style={[styles.modeCard, selected && styles.modeCardSelected]}
                      onPress={() => setMode(option.id)}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <View style={[styles.modeIcon, selected && styles.modeIconSelected]}>
                        <Ionicons name={option.icon} size={17} color={selected ? colors.primary : colors.foregroundSecondary} />
                      </View>
                      <Text style={[styles.modeLabel, selected && styles.modeLabelSelected]}>{option.label}</Text>
                      <Text style={styles.modeSub}>{option.subtitle}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {mode === 'byItem' && (
              <View>
                <Text style={styles.sectionTitle}>Selecione os itens</Text>
                {bill.data.items.map((item) => {
                  const checked = selectedItemIds.includes(item.orderItemId);
                  return (
                    <TouchableOpacity
                      key={item.orderItemId}
                      style={styles.itemRow}
                      onPress={() => toggleItem(item.orderItemId)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                    >
                      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                        {checked && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                      </View>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {item.quantity}x {item.name} · {item.dinerName}
                      </Text>
                      <Text style={styles.itemPrice}>{money(item.totalPrice)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {mode === 'fixed' && (
              <View>
                <Text style={styles.sectionTitle}>Quanto você quer pagar?</Text>
                <View style={styles.fixedInputWrap}>
                  <Text style={styles.fixedPrefix}>R$</Text>
                  <TextInput
                    style={styles.fixedInput}
                    placeholder="0,00"
                    placeholderTextColor={colors.foregroundMuted}
                    keyboardType="decimal-pad"
                    value={fixedAmount}
                    onChangeText={setFixedAmount}
                    accessibilityLabel="Valor a pagar"
                  />
                </View>
              </View>
            )}

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>{money(subtotal)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Serviço ({feePct}%)</Text>
              <Text style={styles.summaryValue}>{money(subtotal * (feePct / 100))}</Text>
            </View>

            <View style={styles.payCard}>
              <Text style={styles.payLabel}>Você paga:</Text>
              <Text style={styles.payValue}>{money(myShare)}</Text>
            </View>

            <TouchableOpacity
              style={[styles.cta, baseAmount <= 0 && styles.ctaDisabled]}
              onPress={proceedToPayment}
              disabled={baseAmount <= 0}
              accessibilityRole="button"
            >
              <Text style={styles.ctaText}>Ir para Gorjeta & Pagamento</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
