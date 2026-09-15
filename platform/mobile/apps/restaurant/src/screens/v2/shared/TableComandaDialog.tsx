import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { X } from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';

interface ComandaItem {
  orderItemId: string;
  name: string;
  quantity: number;
  totalPrice: number;
  status: string;
  specialInstructions: string | null;
  dinerId: string | null;
  dinerName: string;
  dinerIsKid: boolean;
}

interface ComandaDiner {
  dinerId: string;
  displayName: string;
  isHost: boolean;
  isKid: boolean;
  isCompanion: boolean;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

/**
 * The waiter/manager view of a casual dining table's running comanda,
 * grouped by diner — mirrors what the customer sees in the app's own
 * "Comanda" screen, so staff can answer "quem pediu o quê" at a glance.
 */
export function TableComandaDialog({
  visible,
  tableId,
  tableLabel,
  onClose,
}: {
  visible: boolean;
  tableId: string | null;
  tableLabel: string;
  onClose: () => void;
}) {
  const colors = useColors();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diners, setDiners] = useState<ComandaDiner[]>([]);
  const [items, setItems] = useState<ComandaItem[]>([]);
  const [subtotal, setSubtotal] = useState(0);

  useEffect(() => {
    if (!visible || !tableId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    supabaseApiAdapter.getTableComanda(tableId)
      .then((data: any) => {
        if (cancelled) return;
        setDiners(Array.isArray(data?.diners) ? data.diners : []);
        setItems(Array.isArray(data?.items) ? data.items : []);
        setSubtotal(Number(data?.subtotal ?? 0));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao carregar comanda');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [visible, tableId]);

  const groups = useMemo(() => {
    const byDiner = new Map<string, { name: string; isKid: boolean; items: ComandaItem[]; subtotal: number }>();
    for (const item of items) {
      const key = item.dinerId ?? 'unassigned';
      const existing = byDiner.get(key);
      if (existing) {
        existing.items.push(item);
        existing.subtotal += item.totalPrice;
      } else {
        byDiner.set(key, { name: item.dinerName, isKid: item.dinerIsKid, items: [item], subtotal: item.totalPrice });
      }
    }
    return [...byDiner.values()];
  }, [items]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.foreground }]}>Comanda · {tableLabel}</Text>
              <Text style={[styles.subtitle, { color: colors.foregroundSecondary }]}>
                {diners.length} pessoa{diners.length === 1 ? '' : 's'} · {formatCurrency(subtotal)}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Fechar" hitSlop={8}>
              <X size={22} color={colors.foregroundSecondary} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
          ) : error ? (
            <Text style={{ color: '#EF4444', textAlign: 'center', marginVertical: 24 }}>{error}</Text>
          ) : groups.length === 0 ? (
            <Text style={{ color: colors.foregroundSecondary, textAlign: 'center', marginVertical: 24 }}>
              Nenhum item enviado ainda.
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {groups.map((group) => (
                <View key={group.name} style={styles.group}>
                  <View style={styles.groupHeader}>
                    <View style={styles.groupIdentity}>
                      <Text style={[styles.groupName, { color: colors.foreground }]}>{group.name}</Text>
                      {group.isKid ? (
                        <View style={[styles.kidTag, { backgroundColor: `${colors.primary}18` }]}>
                          <Text style={[styles.kidTagText, { color: colors.primary }]}>Kids</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[styles.groupTotal, { color: colors.foreground }]}>{formatCurrency(group.subtotal)}</Text>
                  </View>
                  {group.items.map((item) => (
                    <View
                      key={item.orderItemId}
                      style={[styles.itemRow, { borderBottomColor: colors.border }]}
                    >
                      <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={1}>
                        {item.quantity}x {item.name}
                      </Text>
                      <Text style={[styles.itemPrice, { color: colors.foregroundSecondary }]}>
                        {formatCurrency(item.totalPrice)}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 20, maxHeight: '80%' },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16, gap: 12 },
  title: { fontSize: 17, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: 2 },
  group: { marginBottom: 16 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  groupIdentity: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  groupName: { fontSize: 14, fontWeight: '700' },
  kidTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  kidTagText: { fontSize: 10, fontWeight: '700' },
  groupTotal: { fontSize: 14, fontWeight: '700' },
  itemRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemName: { flex: 1, fontSize: 13, marginRight: 8 },
  itemPrice: { fontSize: 13, fontWeight: '600' },
});
