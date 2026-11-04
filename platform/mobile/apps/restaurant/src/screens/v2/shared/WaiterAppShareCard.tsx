import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { useRestaurantRole } from '../../../contexts/RestaurantRoleContext';

/** Incentivo do garçom: quanto das mesas dele foi pago pelo app no dia. Só o percentual, sem valores. */
export function WaiterAppShareCard() {
  const colors = useColors();
  const { restaurantId, serverRoles } = useRestaurantRole();
  const [percent, setPercent] = useState<number | null>(null);
  const isWaiter = serverRoles.includes('waiter');

  useFocusEffect(useCallback(() => {
    if (!restaurantId || !isWaiter) return;
    supabaseApiAdapter.getMyAppShare(restaurantId).then((share) => setPercent(share.percent)).catch(() => setPercent(null));
  }, [restaurantId, isWaiter]));

  if (!isWaiter || percent == null) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.value, { color: colors.primary }]}>{percent}%</Text>
      <Text style={{ flex: 1, color: colors.foregroundSecondary }}>das suas mesas pagas pelo app hoje</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 16 },
  value: { fontSize: 20, fontWeight: '800' },
});
