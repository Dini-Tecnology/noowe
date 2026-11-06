import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter, type CounterOrder } from '@okinawa/shared/services/supabase-api';
import { userErrorMessage } from '@okinawa/shared/utils/user-error-message';
import { useRestaurantRole } from '../../../contexts/RestaurantRoleContext';
import { refreshMountedRemoteData } from './remoteRefreshRegistry';
import { CASH_LABEL, HOUSE_TERMINAL_FORMS, HOUSE_TERMINAL_LABEL } from './HouseMethodPicker';

const formatCents = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

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
      void refreshMountedRemoteData();
    } catch (err) {
      Alert.alert('Não foi possível cobrar', userErrorMessage(err, 'Tente novamente.'));
    } finally {
      setBusyId(null);
      load();
    }
  };

  // Dinheiro não é maquininha (resposta 36): primeiro a forma, depois o que passou na maquininha da casa.
  const askTerminal = (order: CounterOrder) => {
    Alert.alert(HOUSE_TERMINAL_LABEL, 'Qual forma passou na maquininha?', [
      ...HOUSE_TERMINAL_FORMS.map((form) => ({ text: form.label, onPress: () => void charge(order, form.id) })),
      { text: 'Vale', onPress: () => void charge(order, 'voucher') },
      { text: 'Cancelar', style: 'cancel' as const },
    ]);
  };

  const ask = (order: CounterOrder) => {
    Alert.alert(`Cobrar ${formatCents(order.totalCents)}`, 'Como o cliente pagou?', [
      { text: CASH_LABEL, onPress: () => void charge(order, 'cash') },
      { text: HOUSE_TERMINAL_LABEL, onPress: () => askTerminal(order) },
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
