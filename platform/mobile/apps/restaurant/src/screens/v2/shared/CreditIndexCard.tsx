import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { useRestaurantRole } from '../../../contexts/RestaurantRoleContext';

/** Gerente puxa o uso do NOOWE Pay com a equipe: índice do mês e faixa, sem valores em R$. O Dono vê tudo em Módulos e plano. */
export function CreditIndexCard() {
  const colors = useColors();
  const { restaurantId, serverRoles } = useRestaurantRole();
  const [index, setIndex] = useState<{ indexBps: number; tierName: string | null } | null>(null);
  const isManager = serverRoles.includes('manager') && !serverRoles.includes('owner');

  useFocusEffect(useCallback(() => {
    if (!restaurantId || !isManager) return;
    supabaseApiAdapter.getCreditIndex(restaurantId).then(setIndex).catch(() => setIndex(null));
  }, [restaurantId, isManager]));

  if (!isManager || !index) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.value, { color: colors.primary }]}>{Math.round(index.indexBps / 100)}%</Text>
      <Text style={{ flex: 1, color: colors.foregroundSecondary }}>
        Índice NOOWE Pay do mês{index.tierName ? ` · faixa ${index.tierName}` : ' · sem faixa'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 16 },
  value: { fontSize: 20, fontWeight: '800' },
});
