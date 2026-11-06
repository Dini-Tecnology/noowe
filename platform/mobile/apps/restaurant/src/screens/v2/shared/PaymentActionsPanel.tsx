import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter, type RefundablePayment } from '@okinawa/shared/services/supabase-api';
import { userErrorMessage } from '@okinawa/shared/utils/user-error-message';
import { useRestaurantRole } from '../../../contexts/RestaurantRoleContext';
import { useRegisterRemoteRefresh } from './remoteRefreshRegistry';

const formatCents = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
const METHOD_LABEL: Record<string, string> = { cash: 'Dinheiro', pix: 'Pix', credit_card: 'Crédito', debit_card: 'Débito', voucher: 'Vale', tap_card: 'Aproximação' };

type Action = { kind: 'refund' | 'reopen'; payment: RefundablePayment };

/** "Estornar valor" e "Reabrir comanda": ações separadas, com motivo e aprovação. Nunca automáticas. */
export function PaymentActionsPanel() {
  const colors = useColors();
  const { restaurantId } = useRestaurantRole();
  const [payments, setPayments] = useState<RefundablePayment[]>([]);
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [digits, setDigits] = useState('');
  const [busy, setBusy] = useState(false);
  const amountCents = digits ? parseInt(digits, 10) : null;

  const load = useCallback(async () => {
    if (!restaurantId) return;
    try {
      setPayments(await supabaseApiAdapter.getRefundablePayments(restaurantId));
    } catch {
      setPayments([]);
    }
  }, [restaurantId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  // Cobrar na mesma tela cria um pagamento novo: a lista acompanha sem trocar de tela.
  useRegisterRemoteRefresh(load);

  const open = (next: Action) => {
    setAction(next);
    setReason('');
    setDigits('');
  };

  const submit = async () => {
    if (!action) return;
    const motive = reason.trim();
    if (!motive) {
      Alert.alert('Motivo obrigatório', 'Diga o motivo.');
      return;
    }
    setBusy(true);
    try {
      const result = action.kind === 'refund'
        ? await supabaseApiAdapter.requestRefund(action.payment.paymentId, motive, amountCents)
        : await supabaseApiAdapter.requestBillReopen(action.payment.tableSessionId!, motive);
      setAction(null);
      Alert.alert('Pedido registrado', result?.status === 'approved' ? 'Aplicado.' : 'Gerente e Dono foram avisados para aprovar.');
      await load();
    } catch (err) {
      Alert.alert('Não foi possível registrar', userErrorMessage(err, 'Tente novamente.'));
    } finally {
      setBusy(false);
    }
  };

  if (payments.length === 0) return null;

  return (
    <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>Pagamentos recentes</Text>
      {payments.slice(0, 10).map((payment) => (
        <View key={payment.paymentId} style={[styles.row, { borderTopColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600', color: colors.foreground }}>
              {payment.tableNumber ? `Mesa ${payment.tableNumber} · ` : ''}{formatCents(payment.availableCents)}
            </Text>
            <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>
              {METHOD_LABEL[payment.method] ?? payment.method}{payment.pendingApproval ? ' · aguardando aprovação' : ''}
            </Text>
          </View>
          {payment.tableSessionId ? (
            <Pressable accessibilityRole="button" onPress={() => open({ kind: 'reopen', payment })}>
              <Text style={{ fontWeight: '700', color: colors.foregroundSecondary }}>Reabrir</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" disabled={payment.pendingApproval} onPress={() => open({ kind: 'refund', payment })}>
            <Text style={{ fontWeight: '700', color: payment.pendingApproval ? colors.foregroundSecondary : colors.primary }}>Estornar valor</Text>
          </Pressable>
        </View>
      ))}

      <Modal visible={action !== null} transparent animationType="fade" onRequestClose={() => !busy && setAction(null)}>
        <View style={styles.overlay}>
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.title, { color: colors.foreground }]}>{action?.kind === 'refund' ? 'Estornar valor' : 'Reabrir comanda'}</Text>
            <Text style={{ fontSize: 13, color: colors.foregroundSecondary }}>
              {action?.kind === 'refund'
                ? `Até ${formatCents(action.payment.availableCents)}. Precisa de aprovação.`
                : 'Os pagamentos feitos continuam valendo: só a diferença fica em aberto. Nada é estornado sozinho.'}
            </Text>
            {action?.kind === 'refund' ? (
              <TextInput
                value={amountCents ? formatCents(amountCents) : ''}
                onChangeText={(text) => setDigits(text.replace(/\D/g, '').replace(/^0+/, '').slice(0, 9))}
                keyboardType="number-pad"
                placeholder="Valor (vazio é o total)"
                placeholderTextColor={colors.foregroundSecondary}
                accessibilityLabel="Valor do estorno"
                style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
              />
            ) : null}
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Motivo"
              placeholderTextColor={colors.foregroundSecondary}
              accessibilityLabel="Motivo"
              style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
            />
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => void submit()} style={[styles.action, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}>
              <Text style={styles.actionText}>Pedir</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => setAction(null)} style={styles.cancel}>
              <Text style={{ fontWeight: '700', color: colors.foregroundSecondary }}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 16, padding: 14, marginVertical: 12, gap: 8 },
  title: { fontSize: 15, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  overlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.5)' },
  card: { borderRadius: 20, padding: 20, gap: 10 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 44 },
  action: { paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  actionText: { color: '#FFFFFF', fontWeight: '800' },
  cancel: { alignSelf: 'center', paddingVertical: 6 },
});
