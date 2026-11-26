/* Hallmark · macrostructure: Form · tone: warm utilitarian · anchor hue: orange */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import * as Crypto from 'expo-crypto';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { useVisitSession } from '../../contexts/VisitSessionContext';
import { useBillShares } from '../../hooks/useBillShares';
import { PixPendingPanel } from '../../components/quick/PixPendingPanel';
import customerBackend from '../../services/customer-backend';
import { billShares, type SharePayment } from '../../services/bill-shares';
import { centsFromDigits, moneyCents, percentFromBps, StateView } from './shared';
import { INVALID_RECEIPT_DOCUMENT, RECEIPT_DOCUMENT_OFF, receiptDocumentForPayment, taxDocumentConsentForPayment } from '../../components/payment/ReceiptDocumentField';
import { PaymentPending, PaymentSheet, type PaymentSelection } from '../../components/payment/PaymentSheet';
import { savedCards as savedCardsApi } from '../../services/saved-cards';


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
  const [payment, setPayment] = useState<SharePayment | null>(null);
  const [needsDocument, setNeedsDocument] = useState(false);
  const [pixExpired, setPixExpired] = useState(false);
  const [declined, setDeclined] = useState<{ reason: string | null } | null>(null);
  // CPF exigido com o campo fora da tela: a folha rola até ele (QA PAG-06).
  const scrollRef = useRef<ScrollView>(null);
  const [document, setDocument] = useState('');
  const [receiptDoc, setReceiptDoc] = useState(RECEIPT_DOCUMENT_OFF);
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

  const savedCards = useQuery({ queryKey: ['saved-cards', session?.restaurantId], queryFn: () => savedCardsApi.list(session!.restaurantId!), enabled: !!session?.restaurantId, staleTime: 30 * 1000 });

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
    mutationFn: async (selection: PaymentSelection | null) => {
      if (!myOpen || !canPay) throw new Error('Parcela indisponível.');
      const receiptDocument = receiptDocumentForPayment(receiptDoc);
      if (receiptDocument === undefined) throw new Error(INVALID_RECEIPT_DOCUMENT);
      const slot = `${myOpen.id}:${chosenTipCents}:${selection?.kind === 'card' ? selection.cardId : 'pix'}`;
      if (!keys.current.has(slot)) keys.current.set(slot, Crypto.randomUUID());
      const result = await billShares.pay({
        shareId: myOpen.id, method: selection?.kind === 'card' ? 'credit_card' : 'pix', tipCents: chosenTipCents, idempotencyKey: keys.current.get(slot)!,
        payerCpfCnpj: document.replace(/\D/g, '') || undefined,
        receiptDocument,
        ...taxDocumentConsentForPayment(receiptDoc),
        ...(selection?.kind === 'card' ? { paymentMethodId: selection.cardId } : {}),
      });
      // A cobrança recusada não volta: a próxima tentativa com este cartão precisa de outra chave.
      if (result.cardResult === 'declined') keys.current.delete(slot);
      return result;
    },
    onSuccess: (result) => {
      if (result.cardResult === 'declined') { setDeclined({ reason: result.declineReason }); return; }
      setDeclined(null);
      setPayment(result);
      setPixExpired(false);
      setNeedsDocument(false);
      void queryClient.invalidateQueries({ queryKey: ['bill-shares', tableSessionId] });
    },
    onError: (error) => {
      if ((error as { code?: string }).code === 'payer_document_required') { setNeedsDocument(true); return; }
      if ((error as { code?: string }).code === 'card_required_saved') { navigation.navigate('AddCard', { restaurantId: session?.restaurantId }); return; }
      // A conta mudou desde a divisão: nunca cobra um valor que a pessoa não viu.
      if (['bill_changed', 'P0011', 'P0012'].includes((error as { code?: string }).code ?? '')) {
        void queryClient.invalidateQueries({ queryKey: ['bill-shares', tableSessionId] });
        Alert.alert('A conta mudou', 'Confira os valores atualizados e escolha de novo como pagar.', [{ text: 'Voltar', onPress: () => navigation.goBack() }]);
        return;
      }
      if ((error as { code?: string }).code === 'card_not_found') void queryClient.invalidateQueries({ queryKey: ['saved-cards'] });
      Alert.alert('Pagamento não iniciado', error.message);
    },
  });

  // Gorjeta alta pede confirmação, contra erro de digitação (resposta 55).
  const confirmAndPay = useCallback((selection: PaymentSelection | null) => {
    if (!quote.data?.confirmTip) { pay.mutate(selection); return; }
    Alert.alert('Confirma a gorjeta?', `Confirma gorjeta de ${moneyCents(quote.data.tipCents)}?`, [
      { text: 'Corrigir', style: 'cancel' },
      { text: 'Confirmar', onPress: () => pay.mutate(selection) },
    ]);
  }, [pay, quote.data]);

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

  const onPixExpired = useCallback(() => setPixExpired(true), []);

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
    cta: { paddingVertical: 16, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center' },
    ctaText: { color: colors.primaryForeground, fontSize: 16, fontWeight: '700' },
    link: { alignSelf: 'center', minHeight: 40, justifyContent: 'center' },
    linkText: { fontSize: 13, fontWeight: '600', color: colors.foregroundSecondary },
    hint: { fontSize: 12, color: colors.foregroundSecondary, textAlign: 'center' },
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
        <Text style={styles.headerTitle}>Pagamento</Text>
        <Text style={styles.headerSub}>{restaurantName ?? 'Restaurante'}</Text>
      </LinearGradient>

      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
          <PaymentSheet
            pixAvailable={quote.data?.pixAvailable}
            cardAvailable={quote.data?.cardAvailable}
            offlineNotice={quote.data?.pixAvailable === false && quote.data?.cardAvailable === false ? 'O valor está abaixo do mínimo para pagar pelo app. Chame o garçom e pague no salão.' : null}
            savedCards={savedCards.data ?? []}
            onAddCard={() => navigation.navigate('AddCard', { restaurantId: session?.restaurantId })}
            tip={choosesTip ? {
              options: [
                { key: 'none', label: 'Sem', detail: moneyCents(0), selected: activeTipPercent === 0 && freeTipCents === 0, onPress: () => { setTipPercent(0); setFreeTipDigits(''); } },
                ...(tips.data ?? []).map((option) => ({
                  key: String(option.percent), label: `${option.percent}%`, detail: moneyCents(option.cents),
                  selected: activeTipPercent === option.percent && freeTipCents === 0,
                  onPress: () => { setTipPercent(option.percent); setFreeTipDigits(''); },
                })),
              ],
              customCents: freeTipCents,
              onCustomChange: (text) => setFreeTipDigits(centsFromDigits(text)),
            } : undefined}
            serviceFee={!tipMode && (summary.data?.feeBps ?? 0) > 0 ? {
              amountCents: myOpen.feeCents, waived: myOpen.feeWaived, disabled: myOpen.status !== 'open' || waiveFee.isPending,
              onToggle: (keep) => waiveFee.mutate(!keep),
            } : undefined}
            coupon={myOpen.status === 'open' ? {
              value: couponCode, onChangeText: setCouponCode,
              action: couponCode.trim() ? 'apply' : myOpen.couponDiscountCents > 0 ? 'remove' : null,
              onAction: () => coupon.mutate(), busy: coupon.isPending,
            } : undefined}
            receiptDocument={{ value: receiptDoc, onChange: setReceiptDoc }}
            payerDocument={{ required: needsDocument, value: document, onChange: setDocument }}
            scrollRef={scrollRef}
            summary={[
              { label: 'Sua parte do consumo', value: moneyCents(myOpen.baseCents) },
              ...(myOpen.couponDiscountCents > 0 ? [{ label: 'Cupom', value: `− ${moneyCents(myOpen.couponDiscountCents)}` }] : []),
              ...(!tipMode && (summary.data?.feeBps ?? 0) > 0 ? [{ label: 'Taxa de serviço', value: myOpen.feeWaived ? 'Retirada' : moneyCents(myOpen.feeCents) }] : []),
              ...(tipMode ? [{ label: 'Gorjeta', value: moneyCents(chosenTipCents) }] : []),
            ]}
            totalCents={quote.data ? quote.data.totalCents : null}
            paying={pay.isPending}
            disabled={!canPay || couponPending}
            onPay={confirmAndPay}
            declined={declined}
            onDismissDecline={() => setDeclined(null)}
            style={{ paddingHorizontal: 0 }}
            footer={!me?.isHost ? (
              <TouchableOpacity style={styles.link} onPress={confirmAbandon} accessibilityRole="button">
                <Text style={styles.linkText}>Não vou pagar</Text>
              </TouchableOpacity>
            ) : undefined}
          />
        )}

        {myOpen && payment && (payment.pix ? (
          <PixPendingPanel
            code={payment.pix.payload}
            expiresAt={payment.pix.expiresAt ?? payment.expiresAt}
            checking={shares.isFetching}
            onCheck={() => { void shares.refetch(); }}
            onExpired={onPixExpired}
            hint="Escaneie o QR ou use o copia-e-cola. Esta tela atualiza sozinha quando o pagamento for confirmado."
            expired={pixExpired}
            expiredHint="O tempo para pagar acabou. Gere um novo Pix para pagar sua parte."
            onRegenerate={() => {
              // A cobrança expirada não volta: a próxima tentativa precisa de outra chave.
              keys.current.clear();
              setPixExpired(false);
              setPayment(null);
            }}
          />
        ) : <PaymentPending style={{ marginHorizontal: 0 }} hint={payment.cardResult === 'approved' ? 'Cartão aprovado. Esta tela atualiza sozinha quando o pagamento for confirmado.' : undefined} />)}

        {progress}
      </ScrollView>
    </ScreenContainer>
  );
}
