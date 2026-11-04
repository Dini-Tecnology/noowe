import React, { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Text } from 'react-native-paper';
import * as Crypto from 'expo-crypto';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter, type SessionBill } from '@okinawa/shared/services/supabase-api';
import { userErrorMessage } from '@okinawa/shared/utils/user-error-message';

const METHODS = [
  { id: 'cash', label: 'Dinheiro' },
  { id: 'credit_card', label: 'Crédito' },
  { id: 'debit_card', label: 'Débito' },
  { id: 'pix', label: 'Pix' },
] as const;
const VOUCHER_LABEL: Record<string, string> = { refeicao: 'Vale-refeição', alimentacao: 'Vale-alimentação' };

const formatCents = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

/**
 * Cobrança presencial de comanda aberta (G5): dinheiro, maquininha e Pix abatem do mesmo saldo. Os valores vêm prontos do
 * servidor; esta tela não faz conta. A taxa de serviço é opcional, e desmarcar fica registrado.
 */
export function BillChargeModal({ tableSessionId, tableLabel, onClose, onCharged }: {
  tableSessionId: string | null;
  tableLabel: string;
  onClose: () => void;
  onCharged: () => Promise<void>;
}) {
  const colors = useColors();
  const [bill, setBill] = useState<SessionBill | null>(null);
  // Para qual valor esta conta foi calculada: enquanto não bater com o digitado, não se cobra.
  const [billFor, setBillFor] = useState<number | null | undefined>(undefined);
  const [digits, setDigits] = useState('');
  const [keepFee, setKeepFee] = useState(true);
  const [reason, setReason] = useState('');
  const [couponInput, setCouponInput] = useState('');
  // Confirmado no "Aplicar": o servidor recalcula o que cobrar.
  const [coupon, setCoupon] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Repetir depois de uma falha usa a mesma chave: nunca lança o pagamento duas vezes.
  const key = useRef('');
  const tipKey = useRef('');
  const baseCents = digits ? parseInt(digits, 10) : null;
  const [tipDigits, setTipDigits] = useState('');
  const tipCents = tipDigits ? parseInt(tipDigits, 10) : 0;

  useEffect(() => {
    if (!tableSessionId) return;
    key.current = Crypto.randomUUID();
    tipKey.current = Crypto.randomUUID();
    setTipDigits('');
    setDigits('');
    setKeepFee(true);
    setReason('');
    setCoupon('');
    setCouponInput('');
    setBill(null);
    setBillFor(undefined);
  }, [tableSessionId]);

  useEffect(() => {
    if (!tableSessionId) return undefined;
    let stale = false;
    supabaseApiAdapter.getSessionBill(tableSessionId, baseCents, coupon || null)
      .then((result) => { if (!stale) { setBill(result); setBillFor(baseCents); } })
      .catch((err) => { if (!stale) Alert.alert('Não foi possível carregar a conta', userErrorMessage(err, 'Tente novamente.')); });
    return () => { stale = true; };
  }, [tableSessionId, baseCents, coupon]);

  const hasFee = bill?.feeOrTipMode === 'service_fee' && bill.feeBps > 0;
  const ready = !!bill && billFor === baseCents;
  const total = !ready ? null : hasFee && keepFee ? bill.totalWithFeeCents : bill.totalWithoutFeeCents;
  const couponRefused = !!bill?.couponRefusal;

  // Aproximação: inicia e espera o fornecedor confirmar. Fechar a tela não confirma nada, e recusado não abate.
  const chargeByTap = async () => {
    if (!tableSessionId || !ready) return;
    setSubmitting(true);
    try {
      await supabaseApiAdapter.startTapCharge(tableSessionId, { baseCents, waiveFee: hasFee && !keepFee, reason: reason.trim() || null, couponCode: couponRefused ? null : coupon || null, idempotencyKey: key.current });
      Alert.alert('Aproxime o cartão', 'A conta só abate quando a cobrança for aprovada.');
      onClose();
    } catch (err) {
      // Recusada ou não iniciada: agora sim é uma cobrança nova. Queda de rede mantém a chave, porque pode ter passado.
      if ((err as { code?: string }).code === 'charge_failed') {
        key.current = Crypto.randomUUID();
        Alert.alert('Cobrança não concluída', 'A tentativa anterior não foi aprovada. Toque de novo para cobrar.');
        return;
      }
      Alert.alert('Falha ao cobrar', userErrorMessage(err, 'Tente novamente.'));
    } finally {
      setSubmitting(false);
    }
  };

  // Vale não paga gorjeta: ela vai antes, no cartão, para a conta ainda estar aberta quando o vale quitar o saldo.
  const askTipMethod = (voucherKind: string) => {
    Alert.alert('Gorjeta no cartão', 'O vale paga só o consumo. Em qual cartão vai a gorjeta?', [
      { text: 'Crédito', onPress: () => void charge('voucher', voucherKind, 'credit_card') },
      { text: 'Débito', onPress: () => void charge('voucher', voucherKind, 'debit_card') },
      { text: 'Voltar', style: 'cancel' },
    ]);
  };

  const charge = async (method: string, voucherKind?: string, tipMethod?: string) => {
    if (!tableSessionId || !ready) return;
    if (method === 'voucher' && tipCents > 0 && !tipMethod) {
      askTipMethod(voucherKind ?? '');
      return;
    }
    setSubmitting(true);
    try {
      if (tipMethod) {
        await supabaseApiAdapter.recordBillPayment(tableSessionId, { method: tipMethod, baseCents: 0, tipCents, idempotencyKey: tipKey.current });
      }
      await supabaseApiAdapter.recordBillPayment(tableSessionId, {
        method, baseCents, waiveFee: hasFee && !keepFee, reason: reason.trim() || null, idempotencyKey: key.current, voucherKind: voucherKind ?? null, couponCode: couponRefused ? null : coupon || null,
        tipCents: method === 'voucher' ? 0 : tipCents,
      });
      await onCharged();
      onClose();
    } catch (err) {
      Alert.alert('Falha ao cobrar', userErrorMessage(err, 'Tente novamente.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={tableSessionId !== null} transparent animationType="fade" onRequestClose={() => !submitting && onClose()}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>Cobrar {tableLabel}</Text>
          <View style={styles.row}>
            <Text style={{ color: colors.foregroundSecondary }}>Saldo da conta</Text>
            <Text style={{ color: colors.foreground, fontWeight: '700' }}>{bill ? formatCents(bill.balanceCents) : '—'}</Text>
          </View>

          {bill?.payers?.length ? (
            <View>
              <Text style={[styles.label, { color: colors.foregroundSecondary }]}>Quem já pagou</Text>
              {bill.payers.map((payer, index) => (
                <View key={`${payer.name}-${index}`} style={styles.row}>
                  <Text style={{ color: colors.foreground }}>{payer.name}</Text>
                  <Text style={{ color: colors.foregroundSecondary }}>{payer.baseCents != null ? formatCents(payer.baseCents) : 'Pago'}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <Text style={[styles.label, { color: colors.foregroundSecondary }]}>Consumo a receber (vazio é o saldo todo)</Text>
          <TextInput
            value={baseCents ? formatCents(baseCents) : ''}
            onChangeText={(text) => setDigits(text.replace(/\D/g, '').replace(/^0+/, '').slice(0, 9))}
            keyboardType="number-pad"
            placeholder="R$ 0,00"
            placeholderTextColor={colors.foregroundMuted}
            accessibilityLabel="Consumo a receber"
            style={[styles.input, { color: colors.foreground, backgroundColor: colors.backgroundTertiary }]}
          />
          {bill?.adjusted && (
            <Text style={[styles.adjusted, { color: colors.warning ?? colors.primary }]} accessibilityRole="alert">
              Restam só {formatCents(bill.balanceCents)} nesta conta.
            </Text>
          )}

          {hasFee && (
            <>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.foreground, fontWeight: '600' }}>Taxa de serviço (opcional)</Text>
                  <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>{!keepFee ? 'Retirada' : ready ? formatCents(bill.feeCents) : '—'}</Text>
                </View>
                <Switch value={keepFee} onValueChange={setKeepFee} accessibilityLabel="Cobrar taxa de serviço" testID="charge-fee-switch" />
              </View>
              {!keepFee && (
                <TextInput
                  value={reason}
                  onChangeText={setReason}
                  placeholder="Motivo (opcional)"
                  placeholderTextColor={colors.foregroundMuted}
                  accessibilityLabel="Motivo da retirada da taxa"
                  style={[styles.input, { color: colors.foreground, backgroundColor: colors.backgroundTertiary }]}
                />
              )}
            </>
          )}

          {bill?.feeOrTipMode === 'tip' && (
            <TextInput
              value={tipCents ? formatCents(tipCents) : ''}
              onChangeText={(text) => setTipDigits(text.replace(/\D/g, '').replace(/^0+/, '').slice(0, 7))}
              keyboardType="number-pad"
              placeholder="Gorjeta (opcional)"
              placeholderTextColor={colors.foregroundMuted}
              accessibilityLabel="Gorjeta"
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.backgroundTertiary }]}
            />
          )}

          <View style={styles.row}>
            <TextInput
              value={couponInput}
              onChangeText={setCouponInput}
              autoCapitalize="characters"
              placeholder="Cupom do cliente (opcional)"
              placeholderTextColor={colors.foregroundMuted}
              accessibilityLabel="Cupom do cliente"
              style={[styles.input, { flex: 1, color: colors.foreground, backgroundColor: colors.backgroundTertiary }]}
            />
            <Pressable accessibilityRole="button" onPress={() => { setCoupon(couponInput.trim()); key.current = Crypto.randomUUID(); }}>
              <Text style={{ color: colors.primary, fontWeight: '700' }}>Aplicar</Text>
            </Pressable>
          </View>
          {bill?.couponRefusal ? <Text style={[styles.adjusted, { color: colors.warning ?? colors.primary }]} accessibilityRole="alert">{bill.couponRefusal}</Text> : null}
          {bill && bill.couponDiscountCents > 0 ? (
            <View style={styles.row}>
              <Text style={{ color: colors.foregroundSecondary }}>Cupom</Text>
              <Text style={{ color: colors.foreground, fontWeight: '700' }}>− {formatCents(bill.couponDiscountCents)}</Text>
            </View>
          ) : null}

          <View style={styles.row}>
            <Text style={[styles.totalLabel, { color: colors.foreground }]}>Receber</Text>
            <Text style={[styles.totalValue, { color: colors.primary }]}>{total != null ? formatCents(total) : '—'}</Text>
          </View>

          <View style={styles.methods}>
            {METHODS.map((method) => (
              <Pressable
                key={method.id}
                accessibilityRole="button"
                disabled={submitting || !ready || bill.balanceCents === 0}
                onPress={() => void charge(method.id)}
                style={[styles.method, { borderColor: colors.border, opacity: submitting || !ready ? 0.6 : 1 }]}
              >
                <Text style={{ color: colors.foreground, fontWeight: '700' }}>{method.label}</Text>
              </Pressable>
            ))}
            {(bill?.acceptedVouchers ?? []).map((kind) => (
              <Pressable
                key={kind}
                accessibilityRole="button"
                disabled={submitting || !ready || bill?.balanceCents === 0}
                onPress={() => void charge('voucher', kind)}
                style={[styles.method, { borderColor: colors.border, opacity: submitting || !ready ? 0.6 : 1 }]}
              >
                <Text style={{ color: colors.foreground, fontWeight: '700' }}>{VOUCHER_LABEL[kind] ?? kind}</Text>
              </Pressable>
            ))}
            {bill?.tapActive ? (
              <Pressable
                accessibilityRole="button"
                disabled={submitting || !ready || bill?.balanceCents === 0}
                onPress={() => void chargeByTap()}
                style={[styles.method, { borderColor: colors.primary, opacity: submitting || !ready ? 0.6 : 1 }]}
              >
                <Text style={{ color: colors.primary, fontWeight: '700' }}>Aproximação</Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable accessibilityRole="button" disabled={submitting} onPress={onClose} style={styles.cancel}>
            <Text style={{ color: colors.foregroundSecondary, fontWeight: '700' }}>Cancelar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.5)' },
  card: { borderRadius: 20, padding: 20, gap: 10 },
  title: { fontSize: 17, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { fontSize: 12, fontWeight: '700' },
  input: { height: 44, borderRadius: 12, paddingHorizontal: 12, fontSize: 15 },
  adjusted: { fontSize: 13, fontWeight: '700' },
  totalLabel: { fontSize: 15, fontWeight: '700' },
  totalValue: { fontSize: 20, fontWeight: '800' },
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  method: { flexGrow: 1, minWidth: '45%', alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5 },
  cancel: { alignSelf: 'center', paddingVertical: 8 },
});
