import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter, type SessionBill } from '@okinawa/shared/services/supabase-api';

const formatCents = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
const METHOD_LABEL: Record<string, string> = {
  cash: 'Dinheiro', pix: 'Pix', credit_card: 'Crédito', debit_card: 'Débito', tap_card: 'Aproximação', voucher: 'Vale', wallet: 'Carteira',
};

/** Pagamentos parciais da mesa: quem pagou, quanto, como, e o saldo que falta. O valor vem do servidor. */
export function TableSettlementLines({ tableSessionId, refreshKey }: { tableSessionId: string; refreshKey: number }) {
  const colors = useColors();
  const [bill, setBill] = useState<SessionBill | null>(null);

  useEffect(() => {
    let alive = true;
    supabaseApiAdapter.getSessionBill(tableSessionId).then((b) => { if (alive) setBill(b); }).catch(() => { if (alive) setBill(null); });
    return () => { alive = false; };
  }, [tableSessionId, refreshKey]);

  if (!bill || (bill.payers.length === 0 && bill.balanceCents <= 0)) return null;

  return (
    <View style={styles.box}>
      {bill.payers.map((payer, index) => (
        <View key={`${payer.name}-${index}`} style={styles.row}>
          <Text style={{ color: colors.foregroundSecondary }}>
            {payer.name}{payer.method ? ` · ${METHOD_LABEL[payer.method] ?? payer.method}` : ''}
          </Text>
          {payer.baseCents != null ? <Text style={{ color: colors.foreground, fontWeight: '700' }}>{formatCents(payer.baseCents)}</Text> : null}
        </View>
      ))}
      <View style={styles.row}>
        <Text style={{ color: colors.foreground, fontWeight: '800' }}>Saldo</Text>
        <Text style={{ color: colors.foreground, fontWeight: '800' }}>{formatCents(bill.balanceCents)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { paddingHorizontal: 14, paddingBottom: 10, gap: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
});
