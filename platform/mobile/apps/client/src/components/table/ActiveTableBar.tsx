import React, { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { useVisitSession } from '../../contexts/VisitSessionContext';
import { goToComanda, isExperienceRoute } from '../../navigation/comanda';
import { tableLabel } from '../../screens/production/shared';

/** Deve aparecer nesta rota? Nas telas da comanda não (já está nela); na aba Home, o card da própria Home basta. */
export function shouldShowActiveTableBar(route: any, hasActiveTable: boolean): boolean {
  if (!hasActiveTable || isExperienceRoute(route?.name)) return false;
  if (route?.name === 'Main') return (getFocusedRouteNameFromRoute(route) ?? 'Home') !== 'Home';
  return true;
}

/**
 * ADR-021: barra fixa "Mesa Salão 1 · Voltar à comanda" em todo o app enquanto a comanda estiver ativa.
 * Um toque leva de volta à comanda.
 */
export function ActiveTableBar({ route, navigation }: { route: any; navigation: any }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useVisitSession();
  const visible = shouldShowActiveTableBar(route, !!session?.tableSessionId);

  const styles = useMemo(() => StyleSheet.create({
    bar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: colors.primary, paddingHorizontal: 16, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 10),
    },
    left: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
    label: { color: '#fff', fontSize: 14, fontWeight: '700', flexShrink: 1 },
    action: { color: '#fff', fontSize: 14, fontWeight: '800', textDecorationLine: 'underline' },
  }), [colors, insets.bottom]);

  if (!visible) return null;
  return (
    <TouchableOpacity
      style={styles.bar}
      onPress={() => goToComanda(navigation)}
      accessibilityRole="button"
      accessibilityLabel={`${tableLabel(session?.tableNumber)}. Voltar à comanda`}
      testID="active-table-bar"
    >
      <View style={styles.left}>
        <Ionicons name="restaurant" size={16} color="#fff" />
        <Text style={styles.label} numberOfLines={1}>{tableLabel(session?.tableNumber)}</Text>
      </View>
      <Text style={styles.action}>Voltar à comanda</Text>
    </TouchableOpacity>
  );
}
