import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { V2FormSheet } from './V2FormSheet';
import { groupCapacity, type LayoutCandidate } from './tableLayout';

type Props = {
  visible: boolean;
  title: string;
  subtitle?: string;
  /** `single`: escolhe um destino (troca) · `multi`: escolhe as mesas a unir. */
  mode: 'single' | 'multi';
  candidates: LayoutCandidate[];
  /** Lugares que o grupo já tem (modo multi). */
  baseSeats?: number;
  /** Pessoas a acomodar. */
  needed: number;
  /** Bloqueia salvar quando a capacidade resultante não cobre `needed`. */
  requireFit: boolean;
  saving?: boolean;
  error?: string | null;
  confirmLabel: string;
  onConfirm: (tableIds: string[], chosen: LayoutCandidate[]) => void;
  onClose: () => void;
};

/**
 * Escolha de mesas para trocar ou juntar (ADR-018). Mostra a capacidade resultante antes de salvar;
 * o servidor repete a checagem, então a UI só evita o erro óbvio.
 */
export function TablePickerSheet({
  visible, title, subtitle, mode, candidates, baseSeats = 0, needed, requireFit, saving = false, error, confirmLabel, onConfirm, onClose,
}: Props) {
  const colors = useColors();
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => { if (!visible) setPicked([]); }, [visible]);

  const chosen = useMemo(() => candidates.filter((candidate) => picked.includes(candidate.id)), [candidates, picked]);
  const resulting = mode === 'single' ? (chosen[0]?.seats ?? 0) : groupCapacity({ effectiveSeats: baseSeats }, chosen);
  const fits = resulting >= needed;
  const canSave = chosen.length > 0 && (!requireFit || fits);

  const toggle = (id: string) => {
    setPicked((current) => mode === 'single'
      ? [id]
      : current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  return (
    <V2FormSheet
      visible={visible}
      title={title}
      subtitle={subtitle}
      saveLabel={confirmLabel}
      saving={saving}
      saveDisabled={!canSave}
      onClose={onClose}
      onSave={() => onConfirm(picked, chosen)}
    >
      {candidates.length === 0 ? (
        <Text style={{ color: colors.foregroundSecondary }} testID="table-picker-empty">Nenhuma mesa livre disponível agora.</Text>
      ) : candidates.map((candidate) => {
        const selected = picked.includes(candidate.id);
        return (
          <Pressable
            key={candidate.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            testID={`table-pick-${candidate.id}`}
            onPress={() => toggle(candidate.id)}
            style={[styles.row, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? `${colors.primary}0D` : colors.card }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.foreground }]}>Mesa {candidate.label}</Text>
              <Text style={{ color: colors.foregroundSecondary, fontSize: 12 }}>{candidate.section}</Text>
            </View>
            <Text style={[styles.rowSeats, { color: candidate.fits ? colors.foreground : colors.foregroundMuted }]}>
              {candidate.seats} lugares{!candidate.fits ? ' · não comporta' : ''}
            </Text>
          </Pressable>
        );
      })}
      <View style={styles.summary} testID="table-picker-summary">
        <Text style={{ color: colors.foreground, fontWeight: '700' }}>
          Capacidade resultante: {resulting} · grupo: {needed}
        </Text>
        {requireFit && chosen.length > 0 && !fits ? (
          <Text style={{ color: '#DC2626', fontSize: 12 }}>Ainda não comporta o grupo.</Text>
        ) : null}
      </View>
      {error ? <Text style={{ color: '#DC2626' }} testID="table-picker-error">{error}</Text> : null}
    </V2FormSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 8 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowSeats: { fontSize: 13, fontWeight: '600' },
  summary: { marginTop: 8, gap: 4 },
});
