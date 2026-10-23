/* Hallmark · macrostructure: Form · tone: warm utilitarian · anchor hue: orange */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
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
import { moneyCents, StateView } from './shared';

// Sugestões de gorjeta em % da parcela; os centavos vêm do servidor (customer_share_tip_options).
const TIP_PERCENTS = [0, 10, 15, 20];
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
  const [tipPercent, setTipPercent] = useState(10);
  const [method, setMethod] = useState<Method>('pix');
  const [payment, setPayment] = useState<SharePayment | null>(null);
  const [needsDocument, setNeedsDocument] = useState(false);
  const [document, setDocument] = useState('');
  // Uma chave por (parcela, forma, gorjeta): repetir o toque retoma a mesma cobrança, nunca cria outra.
  const keys = useRef(new Map<string, string>());

  const bill = useQuery({
    queryKey: ['table-bill', tableSessionId],
    queryFn: () => customerBackend.getTableBill(tableSessionId!),
    enabled: !!tableSessionId,
  });
  const { shares } = useBillShares(tableSessionId, payment ? 4000 : false);
  const me = bill.data?.participants.find((p) => p.isMe);
  const list = shares.data ?? [];
  const mine = list.filter((s) => s.participantId === me?.dinerId);
  const myOpen = mine.find((s) => s.status === 'open' || s.status === 'pending_payment');
  const myPaid = !myOpen && mine.some((s) => s.status === 'paid');
  const nameOf = (participantId: string) => {
    const diner = bill.data?.participants.find((p) => p.dinerId === participantId);
    return diner?.isMe ? 'Você' : (diner?.displayName ?? 'Convidado');
  };

  const tips = useQuery({
    queryKey: ['share-tip-options', myOpen?.id, myOpen?.amountCents],
    queryFn: () => billShares.tipOptions(myOpen!.id, TIP_PERCENTS),
    enabled: !!myOpen,
  });
  const selectedTip = tips.data?.find((option) => option.percent === tipPercent);

  const pay = useMutation({
    mutationFn: async () => {
      if (!myOpen || !selectedTip) throw new Error('Parcela indisponível.');
      const slot = `${myOpen.id}:${method}:${selectedTip.cents}`;
      if (!keys.current.has(slot)) keys.current.set(slot, Crypto.randomUUID());
      return billShares.pay({
        shareId: myOpen.id, method, tipCents: selectedTip.cents, idempotencyKey: keys.current.get(slot)!,
        payerCpfCnpj: document.replace(/\D/g, '') || undefined,
      });
    },
    onSuccess: async (result) => {
      setPayment(result);
      setNeedsDocument(false);
      void queryClient.invalidateQueries({ queryKey: ['bill-shares', tableSessionId] });
      if (method === 'credit_card' && result.checkoutUrl) await WebBrowser.openBrowserAsync(result.checkoutUrl).catch(() => undefined);
    },
    onError: (error) => {
      if ((error as { code?: string }).code === 'payer_document_required') { setNeedsDocument(true); return; }
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
    'Sua parte será redistribuída entre quem ainda não pagou. Deseja continuar?',
    [{ text: 'Voltar', style: 'cancel' }, { text: 'Não vou pagar', style: 'destructive', onPress: () => abandon.mutate() }],
  ), [abandon]);

  const finish = useCallback(async () => {
    if (tableSessionId) await completeCheckout(tableSessionId).catch(() => undefined);
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  }, [completeCheckout, navigation, tableSessionId]);

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
    cta: { paddingVertical: 16, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center' },
    ctaDisabled: { opacity: 0.6 },
    ctaText: { color: colors.primaryForeground, fontSize: 16, fontWeight: '700' },
    link: { alignSelf: 'center', minHeight: 40, justifyContent: 'center' },
    linkText: { fontSize: 13, fontWeight: '600', color: colors.foregroundSecondary },
    pixBox: { alignItems: 'center', gap: 12 },
    pixCode: { fontSize: 11, color: colors.foregroundSecondary, textAlign: 'center' },
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
        <Text style={styles.headerTitle}>Gorjeta & Pagamento</Text>
        <Text style={styles.headerSub}>{restaurantName ?? 'Restaurante'}</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <StateView loading={bill.isLoading || shares.isLoading} error={bill.error ?? shares.error} onRetry={() => { void bill.refetch(); void shares.refetch(); }} />

        {myPaid && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Pagamento confirmado</Text>
            <Text style={styles.hint}>Obrigado! Sua parte está paga. A mesa fecha quando todos pagarem.</Text>
            <TouchableOpacity style={styles.cta} onPress={finish} accessibilityRole="button">
              <Text style={styles.ctaText}>Concluir</Text>
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
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Gorjeta</Text>
              <View style={styles.row}>
                {(tips.data ?? []).map((option) => (
                  <TouchableOpacity
                    key={option.percent}
                    style={[styles.chip, tipPercent === option.percent && styles.chipActive]}
                    onPress={() => setTipPercent(option.percent)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: tipPercent === option.percent }}
                  >
                    <Text style={[styles.chipLabel, tipPercent === option.percent && styles.chipLabelActive]}>
                      {option.percent === 0 ? 'Sem' : `${option.percent}%`}
                    </Text>
                    <Text style={styles.chipValue}>{moneyCents(option.cents)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

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
                <Text style={styles.summaryLabel}>Sua parte (com taxa de serviço)</Text>
                <Text style={styles.summaryValue}>{moneyCents(myOpen.amountCents)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Gorjeta</Text>
                <Text style={styles.summaryValue}>{selectedTip ? moneyCents(selectedTip.cents) : '—'}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total a pagar</Text>
                <Text style={styles.totalValue}>{selectedTip ? moneyCents(selectedTip.totalCents) : '—'}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.cta, (!selectedTip || pay.isPending) && styles.ctaDisabled]}
              onPress={() => pay.mutate()}
              disabled={!selectedTip || pay.isPending}
              accessibilityRole="button"
            >
              <Text style={styles.ctaText}>{pay.isPending ? 'Gerando cobrança…' : method === 'pix' ? 'Gerar PIX' : 'Pagar com cartão'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.link} onPress={confirmAbandon} accessibilityRole="button">
              <Text style={styles.linkText}>Não vou pagar</Text>
            </TouchableOpacity>
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
