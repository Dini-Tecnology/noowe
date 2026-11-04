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
  const [submitting, setSubmitting] = useState(false);
  // Repetir depois de uma falha usa a mesma chave: nunca lança o pagamento duas vezes.
  const key = useRef('');
  const baseCents = digits ? parseInt(digits, 10) : null;

  useEffect(() => {
    if (!tableSessionId) return;
    key.current = Crypto.randomUUID();
    setDigits('');
    setKeepFee(true);
    setReason('');
    setBill(null);
    setBillFor(undefined);
  }, [tableSessionId]);

  useEffect(() => {
    if (!tableSessionId) return undefined;
    let stale = false;
    supabaseApiAdapter.getSessionBill(tableSessionId, baseCents)
      .then((result) => { if (!stale) { setBill(result); setBillFor(baseCents); } })
      .catch((err) => { if (!stale) Alert.alert('Não foi possível carregar a conta', userErrorMessage(err, 'Tente novamente.')); });
    return () => { stale = true; };
  }, [tableSessionId, baseCents]);

  const hasFee = bill?.feeOrTipMode === 'service_fee' && bill.feeBps > 0;
  const ready = !!bill && billFor === baseCents;
  const total = !ready ? null : hasFee && keepFee ? bill.totalWithFeeCents : bill.chargeBaseCents;

  const charge = async (method: string) => {
    if (!tableSessionId || !ready) return;
    setSubmitting(true);
    try {
      await supabaseApiAdapter.recordBillPayment(tableSessionId, {
        method, baseCents, waiveFee: hasFee && !keepFee, reason: reason.trim() || null, idempotencyKey: key.current,
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
