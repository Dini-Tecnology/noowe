import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter, type MyTip } from '@okinawa/shared/services/supabase-api';
import { useRestaurantRole } from '../../../contexts/RestaurantRoleContext';
import { ROLE_LABELS } from './staffRoles';

const formatCents = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
const formatDay = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/** "Minha gorjeta": cada pessoa vê só o próprio extrato. O app calcula e informa; o repasse é da folha do restaurante. */
export function MyTipsPanel() {
  const colors = useColors();
  const { restaurantId } = useRestaurantRole();
  const [tips, setTips] = useState<MyTip[]>([]);

  useFocusEffect(useCallback(() => {
    if (!restaurantId) return;
    supabaseApiAdapter.getMyTips(restaurantId).then(setTips).catch(() => setTips([]));
  }, [restaurantId]));

  if (tips.length === 0) return null;

  return (
    <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>Minha gorjeta</Text>
      {tips.slice(0, 7).map((tip) => (
        <View key={`${tip.businessDate}-${tip.role}`} style={styles.row}>
          <Text style={{ color: colors.foregroundSecondary }}>
            {formatDay(tip.businessDate)}{tip.role ? ` · ${ROLE_LABELS[tip.role] ?? tip.role}` : ''}
          </Text>
          <Text style={{ fontWeight: '700', color: colors.foreground }}>{formatCents(tip.amountCents)}</Text>
        </View>
      ))}
      <Text style={[styles.hint, { color: colors.foregroundSecondary }]}>O pagamento é feito pelo restaurante, na folha.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 16, gap: 8 },
  title: { fontSize: 15, fontWeight: '800' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  hint: { fontSize: 12 },
});
