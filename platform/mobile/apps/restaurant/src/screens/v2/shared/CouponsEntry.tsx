import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TicketPercent } from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { useRestaurantRole } from '../../../contexts/RestaurantRoleContext';

/** Dono e Gerente gerenciam. Garçom e Maître veem os ativos. A cozinha não acessa. */
export const COUPON_ROLES = ['owner', 'manager', 'maitre', 'waiter'] as const;

export function CouponsEntry({ onOpen }: { onOpen: (screen: string) => void }) {
  const colors = useColors();
  const { serverRoles } = useRestaurantRole();
  if (!serverRoles.some((role) => (COUPON_ROLES as readonly string[]).includes(role))) return null;
  const manages = serverRoles.includes('owner') || serverRoles.includes('manager');
  return (
    <Pressable accessibilityRole="button" onPress={() => onOpen('Promotions')} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <TicketPercent size={18} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: colors.foreground }]}>{manages ? 'Promoções' : 'Cupons ativos'}</Text>
        <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>{manages ? 'Crie e acompanhe os cupons da casa' : 'Aplique na comanda, a pedido do cliente'}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 16 },
  title: { fontSize: 15, fontWeight: '800' },
});
