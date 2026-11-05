import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter, type CounterOrder } from '@okinawa/shared/services/supabase-api';
import { userErrorMessage } from '@okinawa/shared/utils/user-error-message';
import { useRestaurantRole } from '../../../contexts/RestaurantRoleContext';

const formatCents = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
const METHODS = [
  { key: 'cash', label: 'Dinheiro' },
  { key: 'credit_card', label: 'Maquininha – crédito' },
  { key: 'debit_card', label: 'Maquininha – débito' },
  { key: 'pix', label: 'Maquininha – Pix' },
];

/** Cobrança de balcão: pedido sem mesa, cobrado inteiro (pendência 77). Sem pedido no balcão, o painel não aparece. */
export function CounterChargePanel() {
  const colors = useColors();
  const { restaurantId } = useRestaurantRole();
  const [orders, setOrders] = useState<CounterOrder[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!restaurantId) return;
    supabaseApiAdapter.getCounterOrders(restaurantId).then((value) => setOrders(Array.isArray(value) ? value : [])).catch(() => setOrders([]));
  }, [restaurantId]);
  useFocusEffect(load);

  const charge = async (order: CounterOrder, method: string) => {
    setBusyId(order.orderId);
    try {
      await supabaseApiAdapter.recordPayment(order.orderId, method, order.totalCents / 100);
    } catch (err) {
      Alert.alert('Não foi possível cobrar', userErrorMessage(err, 'Tente novamente.'));
    } finally {
      setBusyId(null);
      load();
    }
  };

  const ask = (order: CounterOrder) => {
    Alert.alert(`Cobrar ${formatCents(order.totalCents)}`, 'Como o cliente pagou?', [
      ...METHODS.map((method) => ({ text: method.label, onPress: () => void charge(order, method.key) })),
      { text: 'Cancelar', style: 'cancel' as const },
    ]);
  };

  if (orders.length === 0) return null;

  return (
    <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>Cobrar no balcão</Text>
      {orders.map((order) => (
        <View key={order.orderId} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: colors.foreground }}>{order.callName || order.orderNumber || 'Pedido'}</Text>
            <Text numberOfLines={2} style={{ fontSize: 12, color: colors.foregroundSecondary }}>{order.items.join(', ')}</Text>
          </View>
          <Text style={{ fontWeight: '700', color: colors.foreground }}>{formatCents(order.totalCents)}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Cobrar ${order.callName || order.orderNumber || 'pedido'}`} disabled={busyId !== null} onPress={() => ask(order)} style={[styles.button, { backgroundColor: colors.primary, opacity: busyId === order.orderId ? 0.6 : 1 }]}>
            <Text style={styles.buttonText}>Cobrar</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12, gap: 10 },
  title: { fontSize: 15, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  button: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  buttonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
});
