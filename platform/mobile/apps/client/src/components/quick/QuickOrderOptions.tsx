import React, { useMemo } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import type { ConsumptionMode } from '../../services/customer-backend';
import type { PickupIntent } from '@/shared/contexts/CartContext';

interface QuickOrderOptionsProps {
  callName: string;
  onCallName: (value: string) => void;
  mode: ConsumptionMode;
  onMode: (mode: ConsumptionMode) => void;
  /** Só quando o restaurante oferece janelas de retirada (capability `pickupSlots`). */
  showSchedule: boolean;
  pickupIntent: PickupIntent;
  onPickupIntent: (intent: PickupIntent) => void;
  slots: string[];
  selectedSlot: string | null;
  onSlot: (slot: string) => void;
}

const MODES: { key: ConsumptionMode; label: string }[] = [
  { key: 'dine_here', label: 'Comer aqui' },
  { key: 'takeaway', label: 'Para levar' },
];

/** Opções do pedido Quick (ADR-013): nome para chamada, comer aqui/levar, retirar agora/agendar. */
export function QuickOrderOptions(props: QuickOrderOptionsProps) {
  const colors = useColors();
  const styles = useMemo(() => StyleSheet.create({
    card: { backgroundColor: colors.card, borderRadius: 16, padding: 14, gap: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    label: { fontSize: 13, fontWeight: '700', color: colors.foreground },
    input: {
      borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
      fontSize: 15, color: colors.foreground, backgroundColor: colors.background,
    },
    hint: { fontSize: 12, color: colors.foregroundSecondary },
    segment: { flexDirection: 'row', gap: 8 },
    segBtn: { flex: 1, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, alignItems: 'center' },
    segText: { fontSize: 13, fontWeight: '700' },
    slotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    slot: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  }), [colors]);

  const segment = (selected: boolean) => ({
    borderColor: selected ? colors.primary : colors.border,
    backgroundColor: selected ? `${colors.primary}12` : colors.card,
  });

  return (
    <View style={styles.card}>
      <View style={{ gap: 6 }}>
        <Text style={styles.label}>Nome para chamada</Text>
        <TextInput
          style={styles.input}
          value={props.callName}
          onChangeText={props.onCallName}
          placeholder="Como devemos te chamar?"
          placeholderTextColor={colors.foregroundMuted}
          maxLength={40}
          autoCapitalize="words"
          accessibilityLabel="Nome para chamada"
        />
        <Text style={styles.hint}>É o nome que o restaurante fala quando o pedido fica pronto.</Text>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={styles.label}>Como vai consumir?</Text>
        <View style={styles.segment}>
          {MODES.map((mode) => {
            const selected = props.mode === mode.key;
            return (
              <TouchableOpacity
                key={mode.key}
                style={[styles.segBtn, segment(selected)]}
                onPress={() => props.onMode(mode.key)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.segText, { color: selected ? colors.primary : colors.foreground }]}>{mode.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {props.showSchedule && (
        <View style={{ gap: 8 }}>
          <Text style={styles.label}>Retirada</Text>
          <View style={styles.segment}>
            {([['now', 'Retirar agora'], ['scheduled', 'Agendar']] as const).map(([key, label]) => {
              const selected = props.pickupIntent === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.segBtn, segment(selected)]}
                  onPress={() => props.onPickupIntent(key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.segText, { color: selected ? colors.primary : colors.foreground }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {props.pickupIntent === 'scheduled' && (
            <View style={styles.slotRow}>
              {props.slots.map((slot) => {
                const selected = props.selectedSlot === slot;
                return (
                  <TouchableOpacity
                    key={slot}
                    style={[styles.slot, segment(selected)]}
                    onPress={() => props.onSlot(slot)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.segText, { color: selected ? colors.primary : colors.foreground }]}>
                      {new Date(slot).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      )}
    </View>
  );
}
