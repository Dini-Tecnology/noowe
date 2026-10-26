import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { Minus, Plus } from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter, type RoomPolicy } from '@okinawa/shared/services/supabase-api';
import { userErrorMessage } from '@okinawa/shared/utils/user-error-message';
import { useRestaurantRole } from '../../../contexts/RestaurantRoleContext';

type EditableKey = 'reservationNoShowMin' | 'queueCallToleranceMin' | 'sessionIdleAlertMin';

/** Faixas aceitas pelo servidor (`restaurant_update_room_policy`); a UI só impede passar delas. */
export const ROOM_POLICY_FIELDS: { key: EditableKey; label: string; hint: string; min: number; max: number; step: number }[] = [
  { key: 'reservationNoShowMin', label: 'Tolerância de atraso da reserva', hint: 'Depois disso a reserva expira e a mesa pode ser liberada', min: 5, max: 120, step: 5 },
  { key: 'queueCallToleranceMin', label: 'Tempo para se apresentar na fila', hint: 'Cliente chamado perde a vez se não chegar a tempo', min: 1, max: 60, step: 1 },
  { key: 'sessionIdleAlertMin', label: 'Alerta de comanda parada', hint: 'Avisa a equipe; a comanda nunca encerra sozinha', min: 15, max: 1440, step: 15 },
];

/** Diferença entre o rascunho e o que está salvo: só o que mudou vai ao servidor. */
export function roomPolicyPatch(saved: RoomPolicy, draft: RoomPolicy): Partial<Record<EditableKey, number>> {
  const patch: Partial<Record<EditableKey, number>> = {};
  for (const { key } of ROOM_POLICY_FIELDS) if (draft[key] !== saved[key]) patch[key] = draft[key];
  return patch;
}

/** Política do salão (ADR-021): tolerâncias de reserva e fila e alerta de comanda parada. */
export function RoomPolicyCard() {
  const colors = useColors();
  const { restaurantId } = useRestaurantRole();
  const [saved, setSaved] = useState<RoomPolicy | null>(null);
  const [draft, setDraft] = useState<RoomPolicy | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurantId) return;
    let active = true;
    supabaseApiAdapter.getRoomPolicy(restaurantId)
      .then((policy) => { if (active) { setSaved(policy); setDraft(policy); } })
      .catch((err) => { if (active) setError(userErrorMessage(err, 'Não foi possível carregar a política do salão.')); });
    return () => { active = false; };
  }, [restaurantId]);

  const save = useCallback(async () => {
    if (!restaurantId || !saved || !draft) return;
    const patch = roomPolicyPatch(saved, draft);
    if (Object.keys(patch).length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const next = await supabaseApiAdapter.updateRoomPolicy(restaurantId, patch);
      setSaved(next);
      setDraft(next);
    } catch (err) {
      setError(userErrorMessage(err, 'Não foi possível salvar.'));
    } finally {
      setSaving(false);
    }
  }, [restaurantId, saved, draft]);

  if (!draft || !saved) {
    return error
      ? <Text style={[styles.error]}>{error}</Text>
      : <ActivityIndicator color={colors.primary} style={{ margin: 12 }} />;
  }
  const dirty = Object.keys(roomPolicyPatch(saved, draft)).length > 0;

  return (
    <View style={styles.wrap} testID="room-policy-card">
      <Text style={[styles.title, { color: colors.foreground }]}>Política do salão</Text>
      {ROOM_POLICY_FIELDS.map((field) => (
        <View key={field.key} style={[styles.row, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.foreground }]}>{field.label}</Text>
            <Text style={[styles.hint, { color: colors.foregroundSecondary }]}>{field.hint}</Text>
          </View>
          <TouchableOpacity
            style={[styles.stepBtn, { borderColor: colors.border }]}
            onPress={() => setDraft({ ...draft, [field.key]: Math.max(field.min, draft[field.key] - field.step) })}
            accessibilityLabel={`Diminuir ${field.label}`}
          >
            <Minus size={14} color={colors.foregroundSecondary} />
          </TouchableOpacity>
          <Text style={[styles.value, { color: colors.foreground }]} testID={`room-policy-${field.key}`}>{draft[field.key]} min</Text>
          <TouchableOpacity
            style={[styles.stepBtn, { borderColor: colors.border }]}
            onPress={() => setDraft({ ...draft, [field.key]: Math.min(field.max, draft[field.key] + field.step) })}
            accessibilityLabel={`Aumentar ${field.label}`}
          >
            <Plus size={14} color={colors.foregroundSecondary} />
          </TouchableOpacity>
        </View>
      ))}
      <Text style={[styles.hint, { color: colors.foregroundSecondary, marginTop: 8 }]}>
        O check-in da reserva abre {draft.reservationCheckInLeadMin} min antes do horário (fixo).
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity
        style={[styles.save, { backgroundColor: colors.primary }, (!dirty || saving) && { opacity: 0.45 }]}
        onPress={() => void save()}
        disabled={!dirty || saving}
        accessibilityRole="button"
        testID="room-policy-save"
      >
        <Text style={styles.saveText}>{saving ? 'Salvando…' : 'Salvar política'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 14, gap: 4 },
  title: { fontSize: 14, fontWeight: '800', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  label: { fontSize: 13, fontWeight: '700' },
  hint: { fontSize: 11, marginTop: 2 },
  stepBtn: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  value: { minWidth: 58, textAlign: 'center', fontSize: 13, fontWeight: '700' },
  save: { marginTop: 12, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  saveText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  error: { fontSize: 12, color: '#DC2626', textAlign: 'center', marginTop: 8 },
});
