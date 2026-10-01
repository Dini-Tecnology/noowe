import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { Check, Users } from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import {
  supabaseApiAdapter,
  type CapacityApprovalReason,
  type CapacityRequest,
} from '@okinawa/shared/services/supabase-api';
import { useCapacityRequests } from './shared/useCapacityRequests';
import { V2ConfirmDialog } from './shared/V2ConfirmDialog';
import { V2Shell } from './shared/V2Shell';
import { userErrorMessage } from '@okinawa/shared/utils/user-error-message';

/** Re-render cadence for the "há X min" labels (UX only). */
const ELAPSED_TICK_MS = 30_000;

type Decision = { request: CapacityRequest } & (
  | { approve: true; reason: CapacityApprovalReason }
  | { approve: false }
);

const APPROVAL_LABELS: Record<CapacityApprovalReason, string> = {
  cadeira_extra: 'Aprovar · cadeira extra',
  crianca_colo: 'Aprovar · criança de colo',
};

function elapsedLabel(iso: string, now: number): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'Agora';
  return `há ${minutes} min`;
}

function describeError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'P0004') return 'O cliente tem conta em aberto em outra mesa. Peça para ele quitar antes de entrar.';
  if (code === '42501') return 'Seu papel não pode decidir sobre lotação neste restaurante.';
  if (code === '23514') return 'Outra pessoa da equipe já decidiu esta solicitação.';
  return userErrorMessage(error, 'Não foi possível registrar a decisão.');
}

/**
 * "Lotação" — entries above `tables.seats` (ADR-007, invariante 7). Every
 * staff member sees them; only roles in capacity_override_roles decide, and
 * the server records author, reason and time in audit_logs.
 */
export default function CapacityRequestsScreen() {
  const colors = useColors();
  const { data, loading, error, refresh } = useCapacityRequests();
  const [refreshing, setRefreshing] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Decision | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ELAPSED_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    void refresh().finally(() => setRefreshing(false));
  };

  const confirm = async () => {
    if (!pending) return;
    const { request } = pending;
    setPending(null);
    setActing(request.id);
    setActionError(null);
    try {
      const note = notes[request.id];
      await supabaseApiAdapter.resolveCapacityRequest(
        request.id,
        pending.approve ? { approve: true, reason: pending.reason, note } : { approve: false, note },
      );
      setNotes((current) => ({ ...current, [request.id]: '' }));
    } catch (err) {
      setActionError(describeError(err));
    } finally {
      setActing(null);
      void refresh();
    }
  };

  return (
    <V2Shell title="Lotação" subtitle="Entradas acima dos lugares da mesa" showBack>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <Text style={[styles.info, { color: colors.foregroundSecondary }]}>Carregando solicitações…</Text>
        ) : null}
        {error ? <Text style={[styles.info, styles.error]}>{error}</Text> : null}
        {actionError ? <Text style={[styles.info, styles.error]} testID="capacity-action-error">{actionError}</Text> : null}

        {!loading && !error && data.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Check size={32} color="#22C55E" />
            <Text style={{ color: colors.foreground, fontWeight: '700', marginTop: 10, fontSize: 16 }}>Nenhuma solicitação</Text>
            <Text style={{ color: colors.foregroundSecondary, marginTop: 4, textAlign: 'center' }}>
              Quando alguém tentar entrar numa mesa cheia, aparece aqui.
            </Text>
          </View>
        ) : null}

        {data.map((request) => (
          <View key={request.id} style={[styles.card, { backgroundColor: colors.card }]} testID={`capacity-request-${request.id}`}>
            <View style={styles.cardHeader}>
              <Users size={18} color="#F59E0B" />
              <Text style={[styles.title, { color: colors.foreground }]}>
                Mesa {request.tableNumber} · {request.occupiedSeats}/{request.seats} lugares
              </Text>
              <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>{elapsedLabel(request.createdAt, now)}</Text>
            </View>
            <Text style={[styles.detail, { color: colors.foregroundSecondary }]}>
              @{request.requestedUser.username} ({request.requestedUser.displayName})
              {request.invitedBy ? ` · convidado por @${request.invitedBy.username}` : ''}
            </Text>

            {request.canDecide ? (
              <>
                <TextInput
                  value={notes[request.id] ?? ''}
                  onChangeText={(value) => setNotes((current) => ({ ...current, [request.id]: value }))}
                  placeholder="Observação (opcional)"
                  placeholderTextColor={colors.foregroundMuted}
                  maxLength={300}
                  style={[styles.note, { borderColor: colors.border, color: colors.foreground }]}
                  accessibilityLabel={`Observação da mesa ${request.tableNumber}`}
                />
                <View style={styles.actions}>
                  {(Object.keys(APPROVAL_LABELS) as CapacityApprovalReason[]).map((reason) => (
                    <TouchableOpacity
                      key={reason}
                      style={[styles.btn, { backgroundColor: '#22C55E', opacity: acting === request.id ? 0.6 : 1 }]}
                      onPress={() => setPending({ request, approve: true, reason })}
                      disabled={acting === request.id}
                      accessibilityRole="button"
                    >
                      <Text style={styles.btnText}>{APPROVAL_LABELS[reason]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  style={[styles.btn, styles.reject, { opacity: acting === request.id ? 0.6 : 1 }]}
                  onPress={() => setPending({ request, approve: false })}
                  disabled={acting === request.id}
                  accessibilityRole="button"
                >
                  <Text style={styles.btnText}>Recusar</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={[styles.readOnly, { color: colors.foregroundMuted }]}>
                Aguardando o maître ou o gerente decidir.
              </Text>
            )}
          </View>
        ))}
      </ScrollView>

      <V2ConfirmDialog
        visible={!!pending}
        title={pending?.approve ? 'Liberar entrada?' : 'Recusar entrada?'}
        message={pending
          ? pending.approve
            ? `@${pending.request.requestedUser.username} entra na mesa ${pending.request.tableNumber} acima da lotação (${APPROVAL_LABELS[pending.reason].replace('Aprovar · ', '')}). A decisão fica registrada.`
            : `@${pending.request.requestedUser.username} não entra na mesa ${pending.request.tableNumber}. A decisão fica registrada.`
          : ''}
        confirmLabel={pending?.approve ? 'Liberar' : 'Recusar'}
        destructive={!pending?.approve}
        onConfirm={() => void confirm()}
        onCancel={() => setPending(null)}
      />
    </V2Shell>
  );
}

const styles = StyleSheet.create({
  info: { textAlign: 'center', marginTop: 24 },
  error: { color: '#EF4444' },
  card: { borderWidth: 1.5, borderColor: '#F59E0B', borderRadius: 14, padding: 14, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontWeight: '700' },
  detail: { marginTop: 6, fontSize: 13 },
  note: { marginTop: 10, minHeight: 40, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  reject: { marginTop: 8, backgroundColor: '#EF4444' },
  btnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  readOnly: { marginTop: 10, fontSize: 12, fontStyle: 'italic' },
  emptyBox: { borderRadius: 16, borderWidth: 1, padding: 32, alignItems: 'center', marginTop: 24 },
});
