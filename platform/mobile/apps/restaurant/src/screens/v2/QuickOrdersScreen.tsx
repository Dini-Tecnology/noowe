import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { ScanLine, Zap } from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import {
  supabaseApiAdapter,
  type QuickPanel,
  type QuickPanelOrder,
  type QuickPanelTab,
} from '@okinawa/shared/services/supabase-api';
import { getSupabaseClient } from '@okinawa/shared/services/supabase';
import { userErrorMessage } from '@okinawa/shared/utils/user-error-message';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';
import { V2Shell } from './shared/V2Shell';
import { ReasonSheet } from './quick-service/ReasonSheet';
import { PickupSheet } from './quick-service/PickupSheet';
import {
  QUICK_PANEL_TABS,
  formatClock,
  formatCents,
  groupQuickOrders,
  orderActions,
  quickPanelErrorMessage,
  secondsUntil,
} from './quick-service/quick-panel';

type ReasonAction =
  | { kind: 'cancel'; order: QuickPanelOrder }
  | { kind: 'reprove'; order: QuickPanelOrder; itemId: string; itemName: string }
  | { kind: 'refund'; order: QuickPanelOrder; itemId: string; itemName: string };

const REFRESH_INTERVAL_MS = 20_000;

/**
 * Painel de pedidos do Quick Service (ADR-013): Novos, Em preparo, Aguardando retirada,
 * Retirados, Não retirados e Agendados. Cada leitura roda as expirações no servidor
 * (Pix, aceite e tolerância de retirada), então os cronômetros refletem o estado real.
 */
export default function QuickOrdersScreen() {
  const colors = useColors();
  const { restaurantId } = useRestaurantRole();
  const [panel, setPanel] = useState<QuickPanel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<QuickPanelTab>('new');
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null);
  const [pickupTarget, setPickupTarget] = useState<{ open: boolean; order: QuickPanelOrder | null }>({ open: false, order: null });

  const load = useCallback(async () => {
    if (!restaurantId) return;
    try {
      setPanel(await supabaseApiAdapter.getQuickPanel(restaurantId));
      setError(null);
    } catch (err) {
      setError(userErrorMessage(err, 'Erro ao carregar os pedidos'));
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial remote load
    void load();
    const poll = setInterval(() => { void load(); }, REFRESH_INTERVAL_MS);
    return () => clearInterval(poll);
  }, [load]);

  // Pedido novo, pago ou aceito aparece sem esperar o intervalo.
  useEffect(() => {
    if (!restaurantId) return undefined;
    const client = getSupabaseClient() as any;
    const channel = client.channel(`quick-orders:${restaurantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` }, () => { void load(); })
      .subscribe();
    return () => { void channel.unsubscribe?.(); };
  }, [restaurantId, load]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const groups = useMemo(() => groupQuickOrders(panel?.orders ?? []), [panel]);

  const run = useCallback(async (work: () => Promise<unknown>, failureTitle: string) => {
    setBusy(true);
    try {
      await work();
      await load();
      return true;
    } catch (err) {
      Alert.alert(failureTitle, quickPanelErrorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }, [load]);

  const togglePaused = useCallback((paused: boolean) => {
    if (!restaurantId) return;
    void run(() => supabaseApiAdapter.setQuickOrdersPaused(restaurantId, paused), 'Não foi possível alterar os pedidos');
  }, [restaurantId, run]);

  const confirmReason = useCallback(async (reason: string) => {
    if (!reasonAction) return;
    const action = reasonAction;
    const ok = await run(() => {
      if (action.kind === 'cancel') return supabaseApiAdapter.cancelQuickOrder(action.order.id, reason);
      if (action.kind === 'refund') return supabaseApiAdapter.refundQuickItem(action.itemId, reason);
      return supabaseApiAdapter.completeQuickQualityCheck(action.order.id, false, { items: false }, reason, [action.itemId]);
    }, 'Não foi possível concluir');
    if (ok) setReasonAction(null);
  }, [reasonAction, run]);

  const confirmPickup = useCallback(async (perform: () => Promise<unknown>) => {
    const ok = await run(perform, 'Retirada não confirmada');
    if (ok) setPickupTarget({ open: false, order: null });
  }, [run]);

  const styles = useMemo(() => StyleSheet.create({
    tools: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    pause: {
      flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14,
      backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    },
    pauseText: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.foreground },
    pauseSub: { fontSize: 11, color: colors.foregroundSecondary, marginTop: 2 },
    scan: { width: 54, height: 54, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    tabs: { gap: 8, paddingBottom: 12 },
    tabChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderWidth: 1 },
    tabText: { fontSize: 13, fontWeight: '700' },
    card: {
      backgroundColor: colors.card, borderRadius: 16, padding: 14, gap: 8, marginBottom: 10,
      borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    },
    head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    name: { fontSize: 15, fontWeight: '800', color: colors.foreground },
    meta: { fontSize: 12, color: colors.foregroundSecondary },
    item: { fontSize: 13, color: colors.foreground },
    itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    link: { fontSize: 12, fontWeight: '700', color: '#DC2626' },
    timer: { fontSize: 18, fontWeight: '800', color: colors.primary },
    actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
    btn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
    btnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
    empty: { textAlign: 'center', color: colors.foregroundSecondary, paddingVertical: 36, fontSize: 13 },
    error: { textAlign: 'center', color: '#EF4444', marginBottom: 8 },
  }), [colors]);

  const renderOrder = (order: QuickPanelOrder) => {
    const actions = orderActions(order);
    const accept = secondsUntil(order.acceptDeadline, now);
    const pickup = secondsUntil(order.pickupExpiresAt, now);
    const slot = order.pickupSlotStart
      ? new Date(order.pickupSlotStart).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : null;
    return (
      <View key={order.id} style={styles.card} testID={`quick-order-${order.id}`}>
        <View style={styles.head}>
          <Text style={styles.name}>{`${order.callName ?? 'Cliente'} · #${order.shortRef}`}</Text>
          <Text style={styles.meta}>{formatCents(order.totalCents)}</Text>
        </View>
        <Text style={styles.meta}>
          {[
            order.consumptionMode === 'dine_here' ? 'Comer aqui' : order.consumptionMode === 'takeaway' ? 'Para levar' : null,
            slot ? `Retirada ${slot}` : null,
            order.refundedCents > 0 ? `Estornado ${formatCents(order.refundedCents)}` : null,
          ].filter(Boolean).join(' · ')}
        </Text>

        {order.items.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <Text style={styles.item}>{`${item.quantity}x ${item.name ?? 'Item'}${item.status === 'cancelled' ? ' (cancelado)' : ''}`}</Text>
            {actions.reproveCheck && item.status === 'ready' && (
              <TouchableOpacity
                onPress={() => setReasonAction({ kind: 'reprove', order, itemId: item.id, itemName: item.name ?? 'Item' })}
                accessibilityRole="button"
                accessibilityLabel={`Devolver à estação: ${item.name ?? 'Item'}`}
              >
                <Text style={styles.link}>Devolver à estação</Text>
              </TouchableOpacity>
            )}
            {actions.refundItems && item.status !== 'cancelled' && item.status !== 'ready' && (
              <TouchableOpacity
                onPress={() => setReasonAction({ kind: 'refund', order, itemId: item.id, itemName: item.name ?? 'Item' })}
                accessibilityRole="button"
                accessibilityLabel={`Item esgotado: ${item.name ?? 'Item'}`}
              >
                <Text style={styles.link}>Esgotado</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}

        {accept != null && actions.accept && (
          <Text style={styles.meta}>{`Responder em ${formatClock(accept)} ou o pedido é cancelado com estorno`}</Text>
        )}
        {pickup != null && order.fulfillmentStatus === 'ready' && (
          <Text style={styles.timer} accessibilityLabel={`Prazo de retirada ${formatClock(pickup)}`}>{formatClock(pickup)}</Text>
        )}
        {order.recallCount > 0 && <Text style={styles.meta}>{`Cliente chamado ${order.recallCount}x`}</Text>}

        <View style={styles.actions}>
          {actions.accept && (
            <TouchableOpacity style={[styles.btn, { backgroundColor: '#16A34A' }]} disabled={busy}
              onPress={() => { void run(() => supabaseApiAdapter.acceptQuickOrder(order.id), 'Não foi possível aceitar'); }}
              accessibilityRole="button">
              <Text style={styles.btnText}>Aceitar</Text>
            </TouchableOpacity>
          )}
          {actions.approveCheck && (
            <TouchableOpacity style={[styles.btn, { backgroundColor: '#16A34A' }]} disabled={busy}
              onPress={() => { void run(() => supabaseApiAdapter.completeQuickQualityCheck(order.id, true, { items: true, packaging: true }), 'Conferência não concluída'); }}
              accessibilityRole="button">
              <Text style={styles.btnText}>Aprovar conferência</Text>
            </TouchableOpacity>
          )}
          {actions.recall && (
            <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} disabled={busy}
              onPress={() => { void run(() => supabaseApiAdapter.recallQuickPickup(order.id), 'Não foi possível chamar'); }}
              accessibilityRole="button">
              <Text style={styles.btnText}>Chamar novamente</Text>
            </TouchableOpacity>
          )}
          {actions.confirmPickup && (
            <TouchableOpacity style={[styles.btn, { backgroundColor: '#16A34A' }]} disabled={busy}
              onPress={() => setPickupTarget({ open: true, order })} accessibilityRole="button">
              <Text style={styles.btnText}>Confirmar retirada</Text>
            </TouchableOpacity>
          )}
          {actions.cancel && (
            <TouchableOpacity style={[styles.btn, { backgroundColor: '#DC2626' }]} disabled={busy}
              onPress={() => setReasonAction({ kind: 'cancel', order })} accessibilityRole="button">
              <Text style={styles.btnText}>{actions.accept ? 'Recusar' : 'Cancelar'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const reasonCopy = reasonAction?.kind === 'cancel'
    ? { title: 'Cancelar pedido', description: 'O cliente é estornado integralmente e o motivo fica registrado.', confirm: 'Cancelar e estornar' }
    : reasonAction?.kind === 'refund'
      ? { title: `Item esgotado: ${reasonAction.itemName}`, description: 'O valor do item é estornado ao cliente e o motivo fica registrado.', confirm: 'Estornar item' }
      : { title: `Devolver à estação: ${reasonAction?.itemName ?? ''}`, description: 'Só este item volta ao preparo; os demais continuam prontos. Diga o que precisa ser corrigido.', confirm: 'Devolver item' };

  return (
    <V2Shell
      title="Pedidos Quick"
      subtitle={panel ? `Preparo estimado ~${panel.estimatedPrepMinutes} min` : 'Skip the Line'}
      showBack
      onRefresh={load}
      headerRight={<Zap size={18} color="#B45309" />}
    >
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          <View style={styles.tools}>
            <View style={styles.pause}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pauseText}>{panel?.settings.ordersPaused ? 'Pedidos pausados' : 'Recebendo pedidos'}</Text>
                <Text style={styles.pauseSub}>
                  {panel?.settings.ordersPaused ? 'Clientes não conseguem pedir agora' : 'Pause em caso de pico ou falta de insumo'}
                </Text>
              </View>
              <Switch
                value={!panel?.settings.ordersPaused}
                onValueChange={(receiving) => togglePaused(!receiving)}
                disabled={busy}
                accessibilityLabel="Receber pedidos"
              />
            </View>
            <TouchableOpacity
              style={styles.scan}
              onPress={() => setPickupTarget({ open: true, order: null })}
              accessibilityRole="button"
              accessibilityLabel="Ler QR de retirada"
            >
              <ScanLine size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
            {QUICK_PANEL_TABS.map((item) => {
              const selected = tab === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  onPress={() => setTab(item.key)}
                  style={[styles.tabChip, {
                    backgroundColor: selected ? colors.primary : colors.backgroundSecondary,
                    borderColor: selected ? colors.primary : colors.border,
                  }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.tabText, { color: selected ? '#FFFFFF' : colors.foreground }]}>
                    {`${item.label} (${groups[item.key].length})`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {groups[tab].length === 0
            ? <Text style={styles.empty}>Nenhum pedido nesta aba.</Text>
            : groups[tab].map(renderOrder)}
        </>
      )}

      <ReasonSheet
        visible={!!reasonAction}
        title={reasonCopy.title}
        description={reasonCopy.description}
        confirmLabel={reasonCopy.confirm}
        busy={busy}
        onCancel={() => setReasonAction(null)}
        onConfirm={(reason) => { void confirmReason(reason); }}
      />

      <PickupSheet
        visible={pickupTarget.open}
        orderRef={pickupTarget.order ? { id: pickupTarget.order.id, label: `${pickupTarget.order.callName ?? 'Cliente'} #${pickupTarget.order.shortRef}` } : null}
        busy={busy}
        onClose={() => setPickupTarget({ open: false, order: null })}
        onScanned={(orderId, code) => { void confirmPickup(() => supabaseApiAdapter.confirmQuickPickup(orderId, code)); }}
        onTyped={(code) => {
          void confirmPickup(() => (pickupTarget.order
            ? supabaseApiAdapter.confirmQuickPickup(pickupTarget.order.id, code)
            : supabaseApiAdapter.confirmQuickPickupByCode(restaurantId!, code)));
        }}
      />
    </V2Shell>
  );
}
