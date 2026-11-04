/* Hallmark · pre-emit critique: P5 H5 E4 S5 R4 V5 */
/* Hallmark · macrostructure: Long Document · tone: warm utilitarian · anchor hue: orange */
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { useVisitSession } from '../../contexts/VisitSessionContext';
import { useServiceTypeFor } from '../../hooks/useServiceTypeFeatures';
import { useBillShares } from '../../hooks/useBillShares';
import customerBackend from '../../services/customer-backend';
import { billShares, SPLIT_ERRORS, type SplitMode, type SplitParams } from '../../services/bill-shares';
import { centsFromDigits, money, moneyCents, percentFromBps, StateView } from './shared';

const MODES: { id: SplitMode; label: string; subtitle: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { id: 'by_owner', label: 'Meus Itens', subtitle: 'Cada um paga o que pediu', icon: 'person-outline' },
  { id: 'equal', label: 'Partes Iguais', subtitle: 'Divide igualmente', icon: 'people-outline' },
  { id: 'by_item', label: 'Por Item', subtitle: 'Escolha itens específicos', icon: 'receipt-outline' },
  { id: 'fixed_amount', label: 'Valor Fixo', subtitle: 'Defina quanto pagar', icon: 'cash-outline' },
];

function errorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? '';
  return SPLIT_ERRORS[code] ?? (error instanceof Error ? error.message : 'Não foi possível calcular a divisão.');
}

export default function SplitBillScreen({ route, navigation }: any) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { session } = useVisitSession();
  const tableSessionId: string | undefined = route?.params?.tableSessionId ?? session?.tableSessionId;
  const restaurantName: string | undefined = route?.params?.restaurantName;
  const [mode, setMode] = useState<SplitMode>('by_owner');
  // O campo de valor é uma máscara de centavos: só dígitos, sem ponto flutuante.
  const [fixedDigits, setFixedDigits] = useState('');
  const fixedCents = fixedDigits ? parseInt(fixedDigits, 10) : 0;
  // Valor fixo em modo gorjeta: percentual sai de dentro do valor; valor livre entra por cima.
  const [fixedTipBps, setFixedTipBps] = useState<number | null>(null);
  const [fixedTipDigits, setFixedTipDigits] = useState('');
  const fixedTipCents = fixedTipDigits ? parseInt(fixedTipDigits, 10) : 0;
  // Partes iguais: null é "todo mundo na mesa"; ajustar faz só quem confirma pagar a própria parte.
  const [people, setPeople] = useState<number | null>(null);
  const { capabilities } = useServiceTypeFor(session?.restaurantId, session?.serviceModel);
  const enabledModes = useMemo(() => new Set((capabilities?.splitModes ?? []) as string[]), [capabilities?.splitModes]);
  const activeMode = enabledModes.has(mode) ? mode : ((MODES.find((m) => enabledModes.has(m.id))?.id) ?? mode);

  const bill = useQuery({
    queryKey: ['table-bill', tableSessionId],
    queryFn: () => customerBackend.getTableBill(tableSessionId!),
    enabled: !!tableSessionId,
  });
  const { claims } = useBillShares(tableSessionId);
  const summary = useQuery({
    queryKey: ['bill-summary', tableSessionId, bill.dataUpdatedAt],
    queryFn: () => billShares.summary(tableSessionId!),
    enabled: !!tableSessionId,
    placeholderData: (previous) => previous,
  });
  const tipMode = summary.data?.feeOrTipMode === 'tip';
  const remainingOf = (orderItemId: string) => summary.data?.itemsRemaining.find((item) => item.orderItemId === orderItemId)?.remainingCents;

  const me = bill.data?.participants.find((p) => p.isMe);
  const nameOf = useCallback((participantId: string) => {
    const diner = bill.data?.participants.find((p) => p.dinerId === participantId);
    return diner?.isMe ? 'Você' : (diner?.displayName ?? 'Convidado');
  }, [bill.data]);

  const participantCount = bill.data?.participants.length ?? 1;
  const previewParams: SplitParams = activeMode === 'fixed_amount'
    ? {
      amountCents: fixedCents,
      ...(tipMode && fixedTipBps ? { tipBps: fixedTipBps } : {}),
      ...(tipMode && fixedTipCents > 0 ? { tipCents: fixedTipCents } : {}),
    }
    : activeMode === 'equal' && people !== null && people !== participantCount ? { people } : {};
  const previewEnabled = !!tableSessionId && (activeMode !== 'fixed_amount' || fixedCents > 0);
  const preview = useQuery({
    queryKey: ['bill-split-preview', tableSessionId, activeMode, previewParams, claims.dataUpdatedAt],
    queryFn: () => billShares.preview(tableSessionId!, activeMode, previewParams),
    enabled: previewEnabled,
    retry: false,
  });

  const toggleClaim = useMutation({
    mutationFn: ({ itemId, claimed }: { itemId: string; claimed: boolean }) => billShares.claimItem(itemId, claimed),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['bill-claims', tableSessionId] }),
    onError: (error) => Alert.alert('Não foi possível marcar o item', errorMessage(error)),
  });

  const commit = useMutation({
    mutationFn: () => billShares.commit({
      tableSessionId: tableSessionId!, mode: activeMode, params: previewParams, version: preview.data!.version,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bill-shares', tableSessionId] });
      navigation.navigate('SharePayment', { tableSessionId, restaurantName });
    },
    onError: (error) => {
      Alert.alert('Divisão não confirmada', errorMessage(error));
      void preview.refetch();
    },
  });

  const proceed = useCallback(() => {
    if (!preview.data || commit.isPending) return;
    commit.mutate();
  }, [preview.data, commit]);

  const plan = preview.data;
  const myPlanShare = plan?.shares.find((share) => share.participantId === me?.dinerId);
  const needsItems = activeMode === 'by_item' && !(claims.data ?? []).length;

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
        modeIconSelected: { backgroundColor: colors.primary },
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
        planRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
        planName: { fontSize: 13, color: colors.foreground },
        planValue: { fontSize: 13, fontWeight: '700', color: colors.foreground },
        hint: { fontSize: 12, color: colors.foregroundSecondary },
        errorText: { fontSize: 12, color: colors.error ?? '#DC2626' },
        itemClaimedBy: { fontSize: 11, color: colors.foregroundSecondary },
        stepper: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 6 },
        stepperBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundTertiary },
        stepperValue: { fontSize: 18, fontWeight: '800', color: colors.foreground, minWidth: 24, textAlign: 'center' },
        tipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
        tipChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
        tipChipSelected: { borderColor: colors.primary, backgroundColor: colors.backgroundSecondary },
        tipChipText: { fontSize: 13, fontWeight: '700', color: colors.foreground },
        adjusted: { fontSize: 13, fontWeight: '700', color: colors.warning ?? colors.primary, marginVertical: 6 },
        breakdown: { gap: 4, marginVertical: 8 },
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
            <Text style={styles.headerTotalLabel}>Falta pagar</Text>
            <Text style={styles.headerTotalValue}>
              {plan ? moneyCents(plan.balanceCents) : summary.data ? moneyCents(summary.data.balanceCents) : '—'}
            </Text>
          </View>
        </View>
        <Text style={styles.headerTitle}>Dividir Conta</Text>
        <Text style={styles.headerSub}>
          {restaurantName ?? 'Restaurante'} · {bill.data?.participants.length ?? 1} pessoa{(bill.data?.participants.length ?? 1) > 1 ? 's' : ''}
        </Text>
      </LinearGradient>

      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <StateView loading={bill.isLoading} error={bill.error} onRetry={() => bill.refetch()} />

        {bill.data && (
          <>
            <View>
              <Text style={styles.sectionTitle}>Como dividir?</Text>
              <View style={styles.modeGrid}>
                {MODES.filter((option) => enabledModes.has(option.id)).map((option) => {
                  const selected = activeMode === option.id;
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
                        <Ionicons name={option.icon} size={17} color={selected ? '#FFFFFF' : colors.foregroundSecondary} />
                      </View>
                      <Text style={[styles.modeLabel, selected && styles.modeLabelSelected]}>{option.label}</Text>
                      <Text style={styles.modeSub}>{option.subtitle}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {activeMode === 'by_item' && (
              <View>
                <Text style={styles.sectionTitle}>Marque o que você vai pagar</Text>
                {bill.data.items.map((item) => {
                  const itemClaims = (claims.data ?? []).filter((claim) => claim.orderItemId === item.orderItemId);
                  const checked = !!me && itemClaims.some((claim) => claim.participantId === me.dinerId);
                  const others = itemClaims.filter((claim) => claim.participantId !== me?.dinerId).map((claim) => nameOf(claim.participantId));
                  // Item já pago fica travado; parcela só aberta de outra pessoa não trava.
                  const remaining = remainingOf(item.orderItemId);
                  const paidOff = remaining === 0;
                  return (
                    <TouchableOpacity
                      key={item.orderItemId}
                      style={styles.itemRow}
                      onPress={() => toggleClaim.mutate({ itemId: item.orderItemId, claimed: !checked })}
                      disabled={paidOff}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked, disabled: paidOff }}
                    >
                      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                        {checked && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemName} numberOfLines={1}>{item.quantity}x {item.name} · {item.dinerName}</Text>
                        {others.length > 0 && <Text style={styles.itemClaimedBy}>Também: {others.join(', ')}</Text>}
                      </View>
                      <Text style={styles.itemPrice}>{paidOff ? 'Pago' : remaining != null ? moneyCents(remaining) : money(item.totalPrice)}</Text>
                    </TouchableOpacity>
                  );
                })}
                {needsItems && <Text style={styles.hint}>Marque ao menos um item. Itens marcados por mais de uma pessoa são divididos entre elas.</Text>}
              </View>
            )}

            {activeMode === 'equal' && (
              <View>
                <Text style={styles.sectionTitle}>Entre quantas pessoas?</Text>
                <View style={styles.stepper}>
                  <TouchableOpacity
                    style={styles.stepperBtn}
                    onPress={() => setPeople(Math.max(1, (people ?? participantCount) - 1))}
                    accessibilityRole="button"
                    accessibilityLabel="Menos uma pessoa"
                  >
                    <Ionicons name="remove" size={18} color={colors.foreground} />
                  </TouchableOpacity>
                  <Text style={styles.stepperValue}>{people ?? participantCount}</Text>
                  <TouchableOpacity
                    style={styles.stepperBtn}
                    onPress={() => setPeople((people ?? participantCount) + 1)}
                    accessibilityRole="button"
                    accessibilityLabel="Mais uma pessoa"
                  >
                    <Ionicons name="add" size={18} color={colors.foreground} />
                  </TouchableOpacity>
                </View>
                {people !== null && people !== participantCount && (
                  <Text style={styles.hint}>Você paga a sua parte, e o restante segue na conta da mesa.</Text>
                )}
              </View>
            )}

            {activeMode === 'fixed_amount' && (
              <View>
                <Text style={styles.sectionTitle}>Quanto você quer pagar?</Text>
                <View style={styles.fixedInputWrap}>
                  <Text style={styles.fixedPrefix}>R$</Text>
                  <TextInput
                    style={styles.fixedInput}
                    placeholder="0,00"
                    placeholderTextColor={colors.foregroundMuted}
                    keyboardType="number-pad"
                    value={fixedCents > 0 ? moneyCents(fixedCents).replace(/^R\$\s?/, '') : ''}
                    onChangeText={(text) => setFixedDigits(centsFromDigits(text))}
                    accessibilityLabel="Valor a pagar"
                  />
                </View>
                {tipMode && (
                  <>
                    <Text style={[styles.sectionTitle, { marginTop: 14, marginBottom: 6 }]}>Gorjeta (opcional)</Text>
                    <View style={styles.tipRow}>
                      {[null, ...(summary.data?.tipPresetsBps ?? [])].map((bps) => {
                        const selected = fixedTipBps === bps && fixedTipCents === 0;
                        return (
                          <TouchableOpacity
                            key={bps ?? 'sem'}
                            style={[styles.tipChip, selected && styles.tipChipSelected]}
                            onPress={() => { setFixedTipBps(bps); setFixedTipDigits(''); }}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                          >
                            <Text style={[styles.tipChipText, selected && styles.modeLabelSelected]}>{bps ? `${percentFromBps(bps)}%` : 'Sem'}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Text style={styles.hint}>O percentual sai de dentro do valor acima. Em valor, a gorjeta entra por cima:</Text>
                    <View style={[styles.fixedInputWrap, { marginTop: 6 }]}>
                      <Text style={styles.fixedPrefix}>R$</Text>
                      <TextInput
                        style={styles.fixedInput}
                        placeholder="0,00"
                        placeholderTextColor={colors.foregroundMuted}
                        keyboardType="number-pad"
                        value={fixedTipCents > 0 ? moneyCents(fixedTipCents).replace(/^R\$\s?/, '') : ''}
                        onChangeText={(text) => { setFixedTipBps(null); setFixedTipDigits(centsFromDigits(text)); }}
                        accessibilityLabel="Gorjeta em valor"
                      />
                    </View>
                  </>
                )}
              </View>
            )}

            {preview.isError && previewEnabled && !needsItems && (
              <Text style={styles.errorText}>{errorMessage(preview.error)}</Text>
            )}

            {plan && (
              <View>
                <Text style={styles.sectionTitle}>Como fica</Text>
                {plan.shares.map((share) => (
                  <View key={share.participantId} style={styles.planRow}>
                    <Text style={styles.planName}>{nameOf(share.participantId)}</Text>
                    <Text style={styles.planValue}>{moneyCents(share.chargeCents)}</Text>
                  </View>
                ))}
                {plan.unassignedCents > 0 && (
                  <View style={styles.planRow}>
                    <Text style={styles.hint}>Continua em aberto na mesa</Text>
                    <Text style={styles.hint}>{moneyCents(plan.unassignedCents)}</Text>
                  </View>
                )}
                {plan.adjusted && (
                  <Text style={styles.adjusted} accessibilityRole="alert">Restam só {moneyCents(plan.balanceCents)} nesta conta.</Text>
                )}
                {activeMode === 'fixed_amount' && myPlanShare && (
                  <View style={styles.breakdown}>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Consumo</Text>
                      <Text style={styles.summaryValue}>{moneyCents(myPlanShare.baseCents)}</Text>
                    </View>
                    {myPlanShare.feeCents > 0 && (
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Taxa de serviço (opcional)</Text>
                        <Text style={styles.summaryValue}>{moneyCents(myPlanShare.feeCents)}</Text>
                      </View>
                    )}
                    {myPlanShare.tipCents > 0 && (
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Gorjeta</Text>
                        <Text style={styles.summaryValue}>{moneyCents(myPlanShare.tipCents)}</Text>
                      </View>
                    )}
                  </View>
                )}
                <Text style={styles.hint}>
                  {plan.feeOrTipMode === 'tip'
                    ? 'A gorjeta é opcional e sai por cima do consumo.'
                    : plan.feeBps > 0
                      ? 'Valores com a taxa de serviço, que é opcional: dá para retirar na próxima tela.'
                      : 'Sem taxa de serviço nesta conta.'}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.cta, (!plan || commit.isPending) && styles.ctaDisabled]}
              onPress={proceed}
              disabled={!plan || commit.isPending}
              accessibilityRole="button"
            >
              <Text style={styles.ctaText}>{commit.isPending ? 'Confirmando…' : 'Confirmar e ir para o pagamento'}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
