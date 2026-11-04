/* Hallmark · macrostructure: Form · tone: warm utilitarian · anchor hue: orange */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Switch, TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import QRCode from 'react-native-qrcode-svg';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { useVisitSession } from '../../contexts/VisitSessionContext';
import { useBillShares } from '../../hooks/useBillShares';
import customerBackend from '../../services/customer-backend';
import { billShares, type SharePayment } from '../../services/bill-shares';
import { centsFromDigits, moneyCents, percentFromBps, StateView } from './shared';

const METHODS = [
  { id: 'pix', label: 'PIX', icon: 'qr-code-outline' },
  { id: 'credit_card', label: 'Cartão de crédito', icon: 'card-outline' },
] as const;
type Method = (typeof METHODS)[number]['id'];

const STATUS_LABEL: Record<string, string> = { open: 'Aguardando', pending_payment: 'Pagando…', paid: 'Pago' };

export default function SharePaymentScreen({ route, navigation }: any) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { session, completeCheckout } = useVisitSession();
  const tableSessionId: string | undefined = route?.params?.tableSessionId ?? session?.tableSessionId;
  const restaurantName: string | undefined = route?.params?.restaurantName;
  // null até a pessoa escolher: vale a sugestão do restaurante. 0 é "Sem".
  const [tipPercent, setTipPercent] = useState<number | null>(null);
  const [freeTipDigits, setFreeTipDigits] = useState('');
  const freeTipCents = freeTipDigits ? parseInt(freeTipDigits, 10) : 0;
  const [method, setMethod] = useState<Method>('pix');
  const [payment, setPayment] = useState<SharePayment | null>(null);
  const [needsDocument, setNeedsDocument] = useState(false);
  const [document, setDocument] = useState('');
  // Cartão (F6): usar um cartão salvo, ou digitar um novo na página do Asaas e, se quiser, salvá-lo.
  const [savedCardId, setSavedCardId] = useState<string | null>(null);
  const [saveCard, setSaveCard] = useState(false);
  // Uma chave por (parcela, forma, gorjeta): repetir o toque retoma a mesma cobrança, nunca cria outra.
  const keys = useRef(new Map<string, string>());

  const bill = useQuery({
    queryKey: ['table-bill', tableSessionId],
    queryFn: () => customerBackend.getTableBill(tableSessionId!),
    enabled: !!tableSessionId,
  });
  const { shares } = useBillShares(tableSessionId, payment ? 4000 : false);
  const summary = useQuery({
    queryKey: ['bill-summary', tableSessionId, shares.dataUpdatedAt],
    queryFn: () => billShares.summary(tableSessionId!),
    enabled: !!tableSessionId,
    placeholderData: (previous) => previous,
  });
  const tipMode = summary.data?.feeOrTipMode === 'tip';
  const me = bill.data?.participants.find((p) => p.isMe);
  const list = shares.data ?? [];
  const mine = list.filter((s) => s.participantId === me?.dinerId);
  const myOpen = mine.find((s) => s.status === 'open' || s.status === 'pending_payment');
  const myPaid = !myOpen && mine.some((s) => s.status === 'paid');
  const nameOf = (participantId: string | null) => {
    if (!participantId) return 'Pago no salão';
    const diner = bill.data?.participants.find((p) => p.dinerId === participantId);
    return diner?.isMe ? 'Você' : (diner?.displayName ?? 'Convidado');
  };

  const savedCards = useQuery({
    queryKey: ['saved-cards'],
    queryFn: () => billShares.listSavedCards(),
    enabled: method === 'credit_card',
    staleTime: 30 * 1000,
  });
  const cards = savedCards.data ?? [];
  // Com cartão salvo, o padrão já vem escolhido: é o pagamento em um toque.
  if (method === 'credit_card' && savedCardId === null && cards.length) {
    setSavedCardId((cards.find((c) => c.isDefault) ?? cards[0]).id);
  }
  const activeSavedCard = method === 'credit_card' ? cards.find((c) => c.id === savedCardId) ?? null : null;

  // Valor fixo já decidiu a gorjeta na tela anterior. Em modo taxa, não há gorjeta.
  const choosesTip = tipMode && !!myOpen && myOpen.mode !== 'fixed_amount';
  const tips = useQuery({
    // O cupom muda a base da gorjeta.
    queryKey: ['share-tip-options', myOpen?.id, myOpen?.baseCents, myOpen?.couponDiscountCents],
    queryFn: () => billShares.tipOptions(myOpen!.id),
    enabled: choosesTip,
  });
  const defaultTipPercent = summary.data?.tipDefaultBps ? percentFromBps(summary.data.tipDefaultBps) : 0;
  const activeTipPercent = tipPercent ?? defaultTipPercent;
  const chosenTipCents = !choosesTip
    ? myOpen?.tipCents ?? 0
    : freeTipCents > 0
      ? freeTipCents
      : tips.data?.find((option) => option.percent === activeTipPercent)?.cents ?? 0;
  // O total vem do servidor, com a gorjeta escolhida.
  const quote = useQuery({
    queryKey: ['share-tip-quote', myOpen?.amountCents, chosenTipCents],
    queryFn: () => billShares.tipQuote(myOpen!.amountCents, { tipCents: chosenTipCents }),
    enabled: !!myOpen && !!summary.data && (!choosesTip || !!tips.data),
  });
  const canPay = !!quote.data && quote.data.tipCents === chosenTipCents;

  const [couponCode, setCouponCode] = useState('');
  // Cupom digitado e não aplicado não pode sumir em silêncio: pagar espera o "Aplicar".
  const couponPending = couponCode.trim().length > 0;
  const coupon = useMutation({
    mutationFn: () => (myOpen!.couponDiscountCents > 0 && !couponCode.trim() ? billShares.removeCoupon(myOpen!.id) : billShares.applyCoupon(myOpen!.id, couponCode.trim())),
    onSuccess: () => setCouponCode(''),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['bill-shares', tableSessionId] }),
    onError: (error: Error) => Alert.alert('Cupom não aplicado', error.message),
  });

  const waiveFee = useMutation({
    mutationFn: (waived: boolean) => billShares.setFeeWaived(myOpen!.id, waived),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['bill-shares', tableSessionId] }),
    onError: (error: Error) => Alert.alert('Não foi possível alterar a taxa', error.message),
  });

  const pay = useMutation({
    mutationFn: async () => {
      if (!myOpen || !canPay) throw new Error('Parcela indisponível.');
      const slot = `${myOpen.id}:${method}:${chosenTipCents}:${activeSavedCard?.id ?? (saveCard ? 'save' : 'new')}`;
      if (!keys.current.has(slot)) keys.current.set(slot, Crypto.randomUUID());
      return billShares.pay({
        shareId: myOpen.id, method, tipCents: chosenTipCents, idempotencyKey: keys.current.get(slot)!,
        payerCpfCnpj: document.replace(/\D/g, '') || undefined,
        ...(activeSavedCard ? { paymentMethodId: activeSavedCard.id } : method === 'credit_card' && saveCard ? { saveCard: true } : {}),
      });
    },
    onSuccess: async (result) => {
      setPayment(result);
      setNeedsDocument(false);
      void queryClient.invalidateQueries({ queryKey: ['bill-shares', tableSessionId] });
      if (method === 'credit_card' && !result.savedCard && result.checkoutUrl) await WebBrowser.openBrowserAsync(result.checkoutUrl).catch(() => undefined);
    },
    onError: (error) => {
      if ((error as { code?: string }).code === 'payer_document_required') { setNeedsDocument(true); return; }
      // A conta mudou desde a divisão: nunca cobra um valor que a pessoa não viu.
      if (['bill_changed', 'P0011', 'P0012'].includes((error as { code?: string }).code ?? '')) {
        void queryClient.invalidateQueries({ queryKey: ['bill-shares', tableSessionId] });
        Alert.alert('A conta mudou', 'Confira os valores atualizados e escolha de novo como pagar.', [{ text: 'Voltar', onPress: () => navigation.goBack() }]);
        return;
      }
      if ((error as { code?: string }).code === 'card_not_found') { setSavedCardId(null); void queryClient.invalidateQueries({ queryKey: ['saved-cards'] }); }
      Alert.alert('Pagamento não iniciado', error.message);
    },
  });

  const abandon = useMutation({
    mutationFn: () => billShares.abandon(myOpen!.id),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['bill-shares', tableSessionId] }); navigation.goBack(); },
    onError: (error) => Alert.alert('Não foi possível sair da divisão', error.message),
  });

  const confirmAbandon = useCallback(() => Alert.alert(
    'Não vou pagar',
    'Sua parte fica com quem abriu a comanda, e essa pessoa será avisada. Deseja continuar?',
    [{ text: 'Voltar', style: 'cancel' }, { text: 'Não vou pagar', style: 'destructive', onPress: () => abandon.mutate() }],
  ), [abandon]);

  const finish = useCallback(async () => {
    if (tableSessionId) await completeCheckout(tableSessionId).catch(() => undefined);
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  }, [completeCheckout, navigation, tableSessionId]);

  // O recibo nasce no webhook: pode levar um instante depois de a parcela aparecer paga.
  const receipt = useQuery({
    queryKey: ['share-receipt', tableSessionId],
    queryFn: () => billShares.latestReceiptId(tableSessionId!),
    enabled: !!tableSessionId && myPaid,
    refetchInterval: (query) => (query.state.data ? false : 3000),
  });

  const paidCount = list.filter((s) => s.status === 'paid').length;

  const styles = useMemo(() => StyleSheet.create({
    gradientHeader: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 },
    headerTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
    headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.9)' },
    content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, gap: 16 },
    card: { borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 16, gap: 12 },
    cardTitle: { fontSize: 15, fontWeight: '700', color: colors.foreground },
    row: { flexDirection: 'row', gap: 10 },
    chip: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.backgroundTertiary, gap: 2 },
    chipActive: { borderColor: colors.primary, backgroundColor: colors.backgroundSecondary },
    chipLabel: { fontSize: 14, fontWeight: '700', color: colors.foreground },
    chipLabelActive: { color: colors.primary },
    chipValue: { fontSize: 11, color: colors.foregroundSecondary },
    method: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.backgroundTertiary },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
    summaryLabel: { fontSize: 13, color: colors.foregroundSecondary },
    summaryValue: { fontSize: 13, fontWeight: '600', color: colors.foreground },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    totalLabel: { fontSize: 15, fontWeight: '700', color: colors.foreground },
    totalValue: { fontSize: 20, fontWeight: '800', color: colors.primary },
    input: { height: 48, borderRadius: 12, paddingHorizontal: 14, fontSize: 16, backgroundColor: colors.backgroundTertiary, color: colors.foreground },
    cardChoices: { gap: 10 },
    saveCardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
    cta: { paddingVertical: 16, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center' },
    ctaDisabled: { opacity: 0.6 },
    ctaText: { color: colors.primaryForeground, fontSize: 16, fontWeight: '700' },
    link: { alignSelf: 'center', minHeight: 40, justifyContent: 'center' },
    linkText: { fontSize: 13, fontWeight: '600', color: colors.foregroundSecondary },
    pixBox: { alignItems: 'center', gap: 12 },
    pixCode: { fontSize: 11, color: colors.foregroundSecondary, textAlign: 'center' },
    hint: { fontSize: 12, color: colors.foregroundSecondary, textAlign: 'center' },
    feeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    tipInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 14, height: 48, backgroundColor: colors.backgroundTertiary },
    tipInput: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.foreground },
    shareRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
    shareName: { fontSize: 13, color: colors.foreground },
    shareStatus: { fontSize: 12, fontWeight: '700' },
  }), [colors]);

  if (!tableSessionId) {
    return (
      <ScreenContainer edges={['top', 'bottom']}>
        <StateView empty="Nenhuma mesa aberta no momento." emptyIcon="receipt-outline" />
      </ScreenContainer>
    );
  }

  const progress = list.length > 0 && (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Quem já pagou · {paidCount} de {list.length}</Text>
      {list.map((share) => (
        <View key={share.id} style={styles.shareRow}>
          <Text style={styles.shareName}>{nameOf(share.participantId)} · {moneyCents(share.amountCents)}</Text>
          <Text style={[styles.shareStatus, { color: share.status === 'paid' ? '#16A34A' : colors.foregroundSecondary }]}>
            {STATUS_LABEL[share.status] ?? share.status}
          </Text>
        </View>
      ))}
    </View>
  );

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <LinearGradient colors={[colors.primary, colors.primaryDark ?? colors.primary]} style={styles.gradientHeader}>
        <View style={styles.headerTop}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <Text style={styles.headerTitle}>Gorjeta & Pagamento</Text>
        <Text style={styles.headerSub}>{restaurantName ?? 'Restaurante'}</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <StateView loading={bill.isLoading || shares.isLoading} error={bill.error ?? shares.error} onRetry={() => { void bill.refetch(); void shares.refetch(); }} />

        {myPaid && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Pagamento confirmado</Text>
            <Text style={styles.hint}>
              {summary.data && summary.data.balanceCents > 0
                ? `Obrigado! Sua parte está paga. Ainda faltam ${moneyCents(summary.data.balanceCents)} nesta comanda; a nota fiscal sai no fechamento.`
                : 'Obrigado! Sua parte está paga. A nota fiscal sai no fechamento.'}
            </Text>
            {receipt.data && (
              <TouchableOpacity style={styles.cta} onPress={() => navigation.navigate('DigitalReceipt', { receiptId: receipt.data })} accessibilityRole="button">
                <Text style={styles.ctaText}>Ver recibo</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={receipt.data ? styles.link : styles.cta} onPress={finish} accessibilityRole="button">
              <Text style={receipt.data ? styles.linkText : styles.ctaText}>Concluir</Text>
            </TouchableOpacity>
          </View>
        )}

        {!myPaid && !myOpen && !shares.isLoading && bill.data && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Você não tem parcela a pagar</Text>
            <Text style={styles.hint}>Volte e escolha como dividir a conta.</Text>
          </View>
        )}

        {myOpen && !payment && (
          <>
            {choosesTip && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Gorjeta (opcional)</Text>
                <View style={styles.row}>
                  <TouchableOpacity
                    style={[styles.chip, activeTipPercent === 0 && freeTipCents === 0 && styles.chipActive]}
                    onPress={() => { setTipPercent(0); setFreeTipDigits(''); }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: activeTipPercent === 0 && freeTipCents === 0 }}
                  >
                    <Text style={[styles.chipLabel, activeTipPercent === 0 && freeTipCents === 0 && styles.chipLabelActive]}>Sem</Text>
                    <Text style={styles.chipValue}>{moneyCents(0)}</Text>
                  </TouchableOpacity>
                  {(tips.data ?? []).map((option) => {
                    const selected = activeTipPercent === option.percent && freeTipCents === 0;
                    return (
                      <TouchableOpacity
                        key={option.percent}
                        style={[styles.chip, selected && styles.chipActive]}
                        onPress={() => { setTipPercent(option.percent); setFreeTipDigits(''); }}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                      >
                        <Text style={[styles.chipLabel, selected && styles.chipLabelActive]}>{option.percent}%</Text>
                        <Text style={styles.chipValue}>{moneyCents(option.cents)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={styles.tipInputRow}>
                  <Text style={styles.chipValue}>Outro valor R$</Text>
                  <TextInput
                    style={styles.tipInput}
                    placeholder="0,00"
                    placeholderTextColor={colors.foregroundMuted}
                    keyboardType="number-pad"
                    value={freeTipCents > 0 ? moneyCents(freeTipCents).replace(/^R\$\s?/, '') : ''}
                    onChangeText={(text) => setFreeTipDigits(centsFromDigits(text))}
                    accessibilityLabel="Gorjeta em valor"
                  />
                </View>
              </View>
            )}

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Forma de pagamento</Text>
              {METHODS.map((option) => (
                <TouchableOpacity
                  key={option.id}
                  style={[styles.method, method === option.id && styles.chipActive]}
                  onPress={() => setMethod(option.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: method === option.id }}
                >
                  <Ionicons name={option.icon} size={20} color={method === option.id ? colors.primary : colors.foregroundSecondary} />
                  <Text style={[styles.chipLabel, method === option.id && styles.chipLabelActive]}>{option.label}</Text>
                </TouchableOpacity>
              ))}
              {method === 'credit_card' && (
                <View style={styles.cardChoices} testID="saved-card-choices">
                  {cards.map((card) => (
                    <TouchableOpacity
                      key={card.id}
                      style={[styles.method, activeSavedCard?.id === card.id && styles.chipActive]}
                      onPress={() => setSavedCardId(card.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: activeSavedCard?.id === card.id }}
                      testID={`saved-card-${card.id}`}
                    >
                      <Ionicons name="card" size={20} color={activeSavedCard?.id === card.id ? colors.primary : colors.foregroundSecondary} />
                      <Text style={[styles.chipLabel, activeSavedCard?.id === card.id && styles.chipLabelActive]}>
                        {(card.brand ?? 'Cartão').toUpperCase()} •••• {card.lastFour}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {cards.length > 0 && (
                    <TouchableOpacity
                      style={[styles.method, !activeSavedCard && styles.chipActive]}
                      onPress={() => setSavedCardId('')}
                      accessibilityRole="button"
                      accessibilityState={{ selected: !activeSavedCard }}
                      testID="new-card-choice"
                    >
                      <Ionicons name="add-circle-outline" size={20} color={!activeSavedCard ? colors.primary : colors.foregroundSecondary} />
                      <Text style={[styles.chipLabel, !activeSavedCard && styles.chipLabelActive]}>Usar outro cartão</Text>
                    </TouchableOpacity>
                  )}
                  {!activeSavedCard && (
                    <View style={styles.saveCardRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.chipLabel}>Salvar este cartão</Text>
                        <Text style={styles.hint}>Você digita os dados na página segura do Asaas; guardamos só um código para os próximos pagamentos.</Text>
                      </View>
                      <Switch value={saveCard} onValueChange={setSaveCard} accessibilityLabel="Salvar este cartão" testID="save-card-switch" />
                    </View>
                  )}
                </View>
              )}
              {needsDocument && (
                <>
                  <Text style={styles.hint}>Informe seu CPF para gerar a cobrança (só na primeira vez).</Text>
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
                </>
              )}
            </View>

            <View style={styles.card}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Sua parte do consumo</Text>
                <Text style={styles.summaryValue}>{moneyCents(myOpen.baseCents)}</Text>
              </View>
              {myOpen.couponDiscountCents > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Cupom</Text>
                  <Text style={styles.summaryValue}>− {moneyCents(myOpen.couponDiscountCents)}</Text>
                </View>
              )}
              {myOpen.status === 'open' && (
                <View style={styles.tipInputRow}>
                  <TextInput
                    style={styles.tipInput}
                    placeholder="Tem um cupom?"
                    placeholderTextColor={colors.foregroundMuted}
                    autoCapitalize="characters"
                    value={couponCode}
                    onChangeText={setCouponCode}
                    accessibilityLabel="Cupom"
                  />
                  {couponCode.trim() ? (
                    <TouchableOpacity onPress={() => coupon.mutate()} disabled={coupon.isPending} accessibilityRole="button" accessibilityLabel="Aplicar cupom">
                      <Text style={styles.chipLabelActive}>Aplicar</Text>
                    </TouchableOpacity>
                  ) : myOpen.couponDiscountCents > 0 ? (
                    <TouchableOpacity onPress={() => coupon.mutate()} disabled={coupon.isPending} accessibilityRole="button">
                      <Text style={styles.chipValue}>Remover</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              )}
              {!tipMode && (summary.data?.feeBps ?? 0) > 0 && (
                <View style={styles.feeRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.summaryLabel}>Taxa de serviço (opcional)</Text>
                    <Text style={styles.summaryValue}>{myOpen.feeWaived ? 'Retirada' : moneyCents(myOpen.feeCents)}</Text>
                  </View>
                  <Switch
                    value={!myOpen.feeWaived}
                    disabled={myOpen.status !== 'open' || waiveFee.isPending}
                    onValueChange={(keep) => waiveFee.mutate(!keep)}
                    accessibilityLabel="Taxa de serviço opcional"
                    testID="service-fee-switch"
                  />
                </View>
              )}
              {tipMode && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Gorjeta</Text>
                  <Text style={styles.summaryValue}>{moneyCents(chosenTipCents)}</Text>
                </View>
              )}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total a pagar</Text>
                <Text style={styles.totalValue}>{quote.data ? moneyCents(quote.data.totalCents) : '—'}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.cta, (!canPay || pay.isPending || couponPending) && styles.ctaDisabled]}
              onPress={() => pay.mutate()}
              disabled={!canPay || pay.isPending || couponPending}
              accessibilityRole="button"
            >
              <Text style={styles.ctaText}>{pay.isPending ? 'Gerando cobrança…' : method === 'pix' ? 'Gerar PIX' : 'Pagar com cartão'}</Text>
            </TouchableOpacity>
            {!me?.isHost && (
              <TouchableOpacity style={styles.link} onPress={confirmAbandon} accessibilityRole="button">
                <Text style={styles.linkText}>Não vou pagar</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {myOpen && payment && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Aguardando confirmação</Text>
            {payment.pix ? (
              <View style={styles.pixBox}>
                <QRCode value={payment.pix.payload} size={200} />
                <Text style={styles.pixCode} selectable numberOfLines={3}>{payment.pix.payload}</Text>
                <TouchableOpacity
                  style={styles.cta}
                  onPress={() => void Share.share({ message: payment.pix!.payload })}
                  accessibilityRole="button"
                >
                  <Text style={styles.ctaText}>Compartilhar código PIX</Text>
                </TouchableOpacity>
              </View>
            ) : payment.checkoutUrl ? (
              <TouchableOpacity style={styles.cta} onPress={() => void WebBrowser.openBrowserAsync(payment.checkoutUrl!)} accessibilityRole="button">
                <Text style={styles.ctaText}>Abrir pagamento</Text>
              </TouchableOpacity>
            ) : null}
            <Text style={styles.hint}>Esta tela atualiza sozinha quando o pagamento for confirmado.</Text>
          </View>
        )}

        {progress}
      </ScrollView>
    </ScreenContainer>
  );
}
