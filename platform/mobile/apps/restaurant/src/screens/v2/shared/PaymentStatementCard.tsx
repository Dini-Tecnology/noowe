import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter, type PaymentStatement } from '@okinawa/shared/services/supabase-api';
import { useRestaurantRole } from '../../../contexts/RestaurantRoleContext';

const formatCents = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
const METHOD_LABEL: Record<string, string> = { cash: 'Dinheiro', pix: 'Pix', credit_card: 'Crédito', debit_card: 'Débito', voucher: 'Vale' };

/** Extrato do Dono: valor pago, taxa NOOWE Pay e líquido por pagamento. Só o Dono vê; o servidor recusa os demais. */
export function PaymentStatementCard() {
  const colors = useColors();
  const { restaurantId, serverRoles } = useRestaurantRole();
  const [statement, setStatement] = useState<PaymentStatement | null>(null);
  const isOwner = serverRoles.includes('owner');

  useFocusEffect(useCallback(() => {
    if (!restaurantId || !isOwner) return;
    supabaseApiAdapter.getPaymentStatement(restaurantId).then(setStatement).catch(() => setStatement(null));
  }, [isOwner, restaurantId]));

  if (!isOwner || !statement) return null;

  return (
    <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>Extrato NOOWE Pay · 30 dias</Text>
      <View style={styles.row}><Text style={{ color: colors.foregroundSecondary }}>Valor pago</Text><Text style={{ color: colors.foreground, fontWeight: '700' }}>{formatCents(statement.paidCents)}</Text></View>
      <View style={styles.row}><Text style={{ color: colors.foregroundSecondary }}>Taxa NOOWE Pay</Text><Text style={{ color: colors.foreground, fontWeight: '700' }}>{formatCents(statement.feeCents)}</Text></View>
      {statement.refundedCents > 0 ? (
        <View style={styles.row}><Text style={{ color: colors.foregroundSecondary }}>Estornado</Text><Text style={{ color: colors.foreground, fontWeight: '700' }}>{formatCents(statement.refundedCents)}</Text></View>
      ) : null}
      <View style={styles.row}><Text style={{ color: colors.foreground, fontWeight: '800' }}>Líquido</Text><Text style={{ color: colors.primary, fontWeight: '800' }}>{formatCents(statement.netCents)}</Text></View>
      {statement.payments.slice(0, 20).map((payment) => (
        <View key={payment.paymentId} style={[styles.line, { borderTopColor: colors.border }]}>
          <View style={styles.row}>
            <Text style={{ color: colors.foreground }}>{METHOD_LABEL[payment.method] ?? payment.method}{payment.external ? ' · externo' : ''}</Text>
            <Text style={{ color: colors.foreground, fontWeight: '600' }}>{formatCents(payment.paidCents)}</Text>
          </View>
          <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>
            Taxa {formatCents(payment.feeCents)} · líquido {formatCents(payment.netCents)}
            {payment.feeDestination === 'returned' ? ' · estorno: taxa devolvida' : payment.feeDestination === 'kept' ? ' · estorno: taxa não devolvida' : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 16, padding: 14, marginVertical: 12, gap: 8 },
  title: { fontSize: 15, fontWeight: '800' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  line: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, gap: 2 },
});
