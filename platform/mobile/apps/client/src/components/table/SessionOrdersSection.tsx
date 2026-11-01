import React, { useEffect, useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import customerBackend from '../../services/customer-backend';
import { openInComanda } from '../../navigation/comanda';
import { STATUS_COLORS, STATUS_LABELS } from '../../screens/production/order-status-ui';

type Props = { tableSessionId: string | null | undefined; navigation: any };

/**
 * Pedidos já enviados da comanda, com o status ao vivo. É o caminho de volta ao acompanhamento
 * (`OrderDetail`) depois de sair da tela: o `orderId` não fica em lugar nenhum além do servidor.
 */
export default function SessionOrdersSection({ tableSessionId, navigation }: Props) {
  const colors = useColors();
  const queryClient = useQueryClient();

  const orders = useQuery({
    queryKey: ['session-orders', tableSessionId],
    queryFn: () => customerBackend.listSessionOrders(tableSessionId!),
    enabled: !!tableSessionId,
  });

  useEffect(() => {
    if (!tableSessionId) return undefined;
    let channel: Awaited<ReturnType<typeof customerBackend.subscribeToTableSessionOrders>> | undefined;
    let cancelled = false;
    customerBackend.subscribeToTableSessionOrders(tableSessionId, () => {
      void queryClient.invalidateQueries({ queryKey: ['session-orders', tableSessionId] });
    }).then((value) => {
      if (cancelled) void value.unsubscribe();
      else channel = value;
    }).catch(() => {
      // Sem Realtime a lista segue válida; ela é relida ao abrir a comanda.
    });
    return () => {
      cancelled = true;
      if (channel) void channel.unsubscribe();
    };
  }, [tableSessionId, queryClient]);

  const styles = useMemo(() => StyleSheet.create({
    wrap: { marginBottom: 16 },
    title: { fontSize: 14, fontWeight: '700', color: colors.foreground, marginBottom: 8 },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12,
      borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, marginBottom: 8,
    },
    info: { flex: 1 },
    name: { fontSize: 14, fontWeight: '600', color: colors.foreground },
    sub: { fontSize: 12, color: colors.foregroundSecondary, marginTop: 2 },
    badge: { fontSize: 12, fontWeight: '700' },
  }), [colors]);

  const list = orders.data ?? [];
  if (list.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Pedidos da mesa</Text>
      {list.map((order) => {
        const count = order.items.reduce((sum, item) => sum + item.quantity, 0);
        const time = new Date(order.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        return (
          <TouchableOpacity
            key={order.id}
            style={styles.row}
            onPress={() => openInComanda(navigation, 'OrderDetail', { orderId: order.id })}
            accessibilityRole="button"
            accessibilityLabel={`Acompanhar pedido ${order.orderNumber}`}
          >
            <View style={styles.info}>
              <Text style={styles.name}>Pedido {order.orderNumber}</Text>
              <Text style={styles.sub}>{time} · {count} {count === 1 ? 'item' : 'itens'}</Text>
            </View>
            <Text style={[styles.badge, { color: STATUS_COLORS[order.status] ?? colors.primary }]}>
              {STATUS_LABELS[order.status] ?? order.status}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.foregroundMuted} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
