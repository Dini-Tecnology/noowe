import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text as RNText, TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import type { QuickPanelSettings } from '@okinawa/shared/services/supabase-api';
import {
  buildPolicyPatch,
  draftFromSettings,
  type QuickPolicyDraft,
} from './quick-panel';

interface QuickPolicyCardProps {
  settings: QuickPanelSettings;
  saving: boolean;
  error: string | null;
  onSave: (patch: ReturnType<typeof buildPolicyPatch>['patch']) => void;
}

const NUMERIC_FIELDS: { key: keyof QuickPolicyDraft; label: string; hint?: string; keyboard: 'number-pad' | 'decimal-pad' }[] = [
  { key: 'defaultPrepMin', label: 'Tempo de preparo (min)', hint: 'Base da estimativa mostrada ao cliente', keyboard: 'number-pad' },
  { key: 'pickupExpiryMin', label: 'Tolerância de retirada (min)', hint: 'Conta a partir de "pronto". Padrão 30, de 15 a 60', keyboard: 'number-pad' },
  { key: 'closeOrdersBeforeMin', label: 'Encerrar pedidos antes do fechamento (min)', keyboard: 'number-pad' },
  { key: 'pixExpiryMin', label: 'Expiração do Pix (min)', keyboard: 'number-pad' },
  { key: 'distanceWarningKm', label: 'Aviso de distância (km)', hint: 'O app avisa, não bloqueia', keyboard: 'decimal-pad' },
  { key: 'pickupCapacityPerSlot', label: 'Pedidos por janela agendada', hint: 'Vazio = sem limite', keyboard: 'number-pad' },
];

/** Configuração do Quick Service (ADR-013): aceite, tolerância, não retirada, Pix e agendamento. */
export function QuickPolicyCard({ settings, saving, error, onSave }: QuickPolicyCardProps) {
  const colors = useColors();
  const [draft, setDraft] = useState<QuickPolicyDraft>(() => draftFromSettings(settings));
  const [formError, setFormError] = useState<string | null>(null);

  const styles = useMemo(() => StyleSheet.create({
    wrap: { padding: 14, gap: 12 },
    label: { fontSize: 12, fontWeight: '700', color: colors.foreground, marginBottom: 4 },
    hint: { fontSize: 11, color: colors.foregroundSecondary, marginTop: 3 },
    input: {
      borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
      fontSize: 14, color: colors.foreground, backgroundColor: colors.background,
    },
    segment: { flexDirection: 'row', gap: 8 },
    segBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, alignItems: 'center' },
    segText: { fontSize: 13, fontWeight: '700' },
    save: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: colors.primary },
    error: { fontSize: 12, color: '#DC2626', textAlign: 'center' },
  }), [colors]);

  const set = <K extends keyof QuickPolicyDraft>(key: K, value: QuickPolicyDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setFormError(null);
  };

  const submit = () => {
    const { patch, error: validation } = buildPolicyPatch(settings, draft);
    if (validation) { setFormError(validation); return; }
    if (Object.keys(patch).length === 0) { setFormError('Nenhuma alteração para salvar.'); return; }
    onSave(patch);
  };

  const segment = (selected: boolean) => ({
    borderColor: selected ? colors.primary : colors.border,
    backgroundColor: selected ? `${colors.primary}15` : colors.card,
  });

  return (
    <View style={styles.wrap}>
      <View>
        <Text style={styles.label}>Local de retirada</Text>
        <TextInput
          style={styles.input}
          value={draft.pickupLocation}
          onChangeText={(value) => set('pickupLocation', value)}
          placeholder="Ex.: Balcão 3, praça de alimentação piso L2"
          placeholderTextColor={colors.foregroundMuted}
          maxLength={160}
          accessibilityLabel="Local de retirada"
        />
      </View>

      <View>
        <Text style={styles.label}>Aceite dos pedidos</Text>
        <View style={styles.segment}>
          {([['auto', 'Automático'], ['manual', 'Manual']] as const).map(([key, label]) => (
            <TouchableOpacity key={key} style={[styles.segBtn, segment(draft.acceptMode === key)]}
              onPress={() => set('acceptMode', key)} accessibilityRole="button" accessibilityState={{ selected: draft.acceptMode === key }}>
              <RNText style={[styles.segText, { color: draft.acceptMode === key ? colors.primary : colors.foreground }]}>{label}</RNText>
            </TouchableOpacity>
          ))}
        </View>
        {draft.acceptMode === 'manual' && (
          <View style={{ marginTop: 8 }}>
            <Text style={styles.label}>Tempo para aceitar (min)</Text>
            <TextInput
              style={styles.input}
              value={draft.acceptTimeoutMin}
              onChangeText={(value) => set('acceptTimeoutMin', value)}
              keyboardType="number-pad"
              accessibilityLabel="Tempo para aceitar"
            />
            <Text style={styles.hint}>Sem resposta nesse prazo, o pedido é cancelado e estornado automaticamente.</Text>
          </View>
        )}
      </View>

      <View>
        <Text style={styles.label}>Pedido não retirado</Text>
        <View style={styles.segment}>
          {([['none', 'Sem reembolso'], ['store_credit', 'Crédito na carteira']] as const).map(([key, label]) => (
            <TouchableOpacity key={key} style={[styles.segBtn, segment(draft.noPickupPolicy === key)]}
              onPress={() => set('noPickupPolicy', key)} accessibilityRole="button" accessibilityState={{ selected: draft.noPickupPolicy === key }}>
              <RNText style={[styles.segText, { color: draft.noPickupPolicy === key ? colors.primary : colors.foreground }]}>{label}</RNText>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.hint}>A política é mostrada ao cliente e aceita no checkout.</Text>
      </View>

      {NUMERIC_FIELDS.map((field) => (
        <View key={field.key}>
          <Text style={styles.label}>{field.label}</Text>
          <TextInput
            style={styles.input}
            value={String(draft[field.key])}
            onChangeText={(value) => set(field.key, value as never)}
            keyboardType={field.keyboard}
            accessibilityLabel={field.label}
          />
          {field.hint ? <Text style={styles.hint}>{field.hint}</Text> : null}
        </View>
      ))}

      {formError || error ? <Text style={styles.error}>{formError ?? error}</Text> : null}
      <TouchableOpacity style={[styles.save, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving} accessibilityRole="button">
        {saving ? <ActivityIndicator color="#FFFFFF" /> : <RNText style={{ color: '#FFFFFF', fontWeight: '800' }}>Salvar configurações</RNText>}
      </TouchableOpacity>
    </View>
  );
}
