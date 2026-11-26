import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { X } from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { userErrorMessage } from '@okinawa/shared/utils/user-error-message';
import { useRestaurantRole } from '../../../contexts/RestaurantRoleContext';
import { V2ConfirmDialog } from './V2ConfirmDialog';

/** Decisão 11: Garçom ou Gerente pede cortesia; Gerente ou Dono aprova. */
export function canRequestCourtesy(roles: readonly string[]): boolean {
  return roles.includes('waiter') || roles.includes('manager');
}

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
  paidCents?: number;
}

/** Estado do item na cozinha/bar, em português; valores desconhecidos aparecem como vieram. */
export function itemStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Recebido', received: 'Recebido', confirmed: 'Recebido', preparing: 'Preparando',
    ready: 'Pronto', delivered: 'Entregue', served: 'Entregue', cancelled: 'Cancelado',
  };
  return labels[status] ?? status;
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
  const { restaurantId, serverRoles } = useRestaurantRole();
  const canCourtesy = canRequestCourtesy(serverRoles ?? []);
  const [courtesyItem, setCourtesyItem] = useState<ComandaItem | null>(null);
  const [courtesyReason, setCourtesyReason] = useState('');
  // shortcut: pendência só desta abertura do diálogo (a conta não traz aprovações); ao reabrir, o servidor recusa a duplicata.
  const [pendingCourtesy, setPendingCourtesy] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diners, setDiners] = useState<ComandaDiner[]>([]);
  const [items, setItems] = useState<ComandaItem[]>([]);
  const [subtotal, setSubtotal] = useState(0);
  // Nulo: o servidor não entrega o total pago a este perfil.
  const [paidCents, setPaidCents] = useState<number | null>(null);

  useEffect(() => {
    if (!visible || !tableId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- shows the spinner while the async request below runs
    setLoading(true);
    setError(null);
    supabaseApiAdapter.getTableComanda(tableId)
      .then((data: any) => {
        if (cancelled) return;
        setDiners(Array.isArray(data?.diners) ? data.diners : []);
        setItems(Array.isArray(data?.items) ? data.items : []);
        setSubtotal(Number(data?.subtotal ?? 0));
        setPaidCents(data?.paidCents == null ? null : Number(data.paidCents));
      })
      .catch((err) => {
        if (!cancelled) setError(userErrorMessage(err, 'Erro ao carregar comanda'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    // Sem realtime no diálogo: atualiza a cada 15 s enquanto aberto, sem piscar o carregando.
    const timer = setInterval(() => {
      supabaseApiAdapter.getTableComanda(tableId).then((data: any) => {
        if (cancelled) return;
        setDiners(Array.isArray(data?.diners) ? data.diners : []);
        setItems(Array.isArray(data?.items) ? data.items : []);
        setSubtotal(Number(data?.subtotal ?? 0));
        setPaidCents(data?.paidCents == null ? null : Number(data.paidCents));
      }).catch(() => undefined);
    }, 15000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [visible, tableId]);

  const submitCourtesy = async () => {
    const item = courtesyItem;
    if (!item || !restaurantId) return;
    setCourtesyItem(null);
    try {
      // O valor é calculado no servidor a partir do item.
      const approval = await supabaseApiAdapter.requestApproval({
        restaurantId,
        type: 'courtesy',
        itemName: item.name,
        reason: courtesyReason.trim(),
        tableId: tableId ?? undefined,
        orderItemId: item.orderItemId,
      });
      if (approval?.status !== 'approved') setPendingCourtesy((prev) => new Set(prev).add(item.orderItemId));
      Alert.alert(approval?.status === 'approved' ? 'Cortesia aplicada' : 'Cortesia solicitada',
        approval?.status === 'approved' ? 'O item foi zerado na conta.' : 'Aguardando aprovação do Gerente ou do Dono.');
    } catch (err) {
      Alert.alert('Falha ao pedir cortesia', userErrorMessage(err, 'Tente novamente.'));
    } finally {
      setCourtesyReason('');
    }
  };

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
                {diners.length} pessoa{diners.length === 1 ? '' : 's'} · {formatCurrency(subtotal)}{paidCents === null ? '' : ` · pago ${formatCurrency(paidCents / 100)}`}
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
                      <Text style={[styles.itemStatus, { color: colors.foregroundSecondary }]} testID={`comanda-item-status-${item.orderItemId}`}>
                        {itemStatusLabel(item.status)}
                      </Text>
                      <Text style={[styles.itemPrice, { color: colors.foregroundSecondary }]}>
                        {formatCurrency(item.totalPrice)}
                      </Text>
                      {pendingCourtesy.has(item.orderItemId) ? (
                        <Text style={[styles.courtesyTag, { color: colors.foregroundSecondary }]} testID={`comanda-courtesy-pending-${item.orderItemId}`}>
                          Cortesia pendente
                        </Text>
                      ) : canCourtesy && item.totalPrice > 0 && item.status !== 'cancelled' ? (
                        <TouchableOpacity
                          onPress={() => setCourtesyItem(item)}
                          accessibilityLabel={`Pedir cortesia de ${item.name}`}
                          hitSlop={6}
                        >
                          <Text style={[styles.courtesyTag, { color: colors.primary }]}>Pedir cortesia</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ))}
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
      <V2ConfirmDialog
        visible={courtesyItem !== null}
        title="Pedir cortesia?"
        message={`${courtesyItem?.quantity ?? 1}x ${courtesyItem?.name ?? ''} · ${formatCurrency(courtesyItem?.totalPrice ?? 0)}. Vai para aprovação do Gerente ou do Dono.`}
        confirmLabel="Pedir cortesia"
        reasonLabel="Motivo da cortesia"
        reason={courtesyReason}
        onReasonChange={setCourtesyReason}
        onCancel={() => { setCourtesyItem(null); setCourtesyReason(''); }}
        onConfirm={() => void submitCourtesy()}
      />
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
  courtesyTag: { fontSize: 11, fontWeight: '700', marginLeft: 8, alignSelf: 'center' },
  itemStatus: { fontSize: 11, fontWeight: '700', marginRight: 8, alignSelf: 'center' },
});
