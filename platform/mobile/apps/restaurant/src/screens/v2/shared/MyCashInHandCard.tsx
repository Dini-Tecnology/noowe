import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { useRestaurantRole } from '../../../contexts/RestaurantRoleContext';
import { useRegisterRemoteRefresh } from './remoteRefreshRegistry';

const formatCents = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

/** "Dinheiro em mãos": o que a própria pessoa recebeu em dinheiro no caixa aberto. Nada do caixa geral. */
export function MyCashInHandCard() {
  const colors = useColors();
  const { restaurantId, serverRoles } = useRestaurantRole();
  const [cash, setCash] = useState<{ open: boolean; cents: number } | null>(null);
  const handles = serverRoles.some((role) => role === 'waiter' || role === 'maitre' || role === 'barman');

  const load = useCallback(() => {
    if (!restaurantId || !handles) return;
    supabaseApiAdapter.getMyCashInHand(restaurantId).then(setCash).catch(() => setCash(null));
  }, [restaurantId, handles]);
  useFocusEffect(load);
  // Cobrar em dinheiro muda este valor sem trocar de tela.
  useRegisterRemoteRefresh(load);

  if (!handles || !cash?.open) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={{ color: colors.foregroundSecondary }}>Dinheiro em mãos</Text>
      <Text style={[styles.value, { color: colors.foreground }]}>{formatCents(cash.cents)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12, gap: 4 },
  value: { fontSize: 22, fontWeight: '800' },
});
