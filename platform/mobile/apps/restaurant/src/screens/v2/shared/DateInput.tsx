import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { buildMonthWeeks, saoPauloDateToIso } from './calendarDate';

export { buildMonthWeeks, saoPauloDateToIso } from './calendarDate';

const WEEKDAY_SHORT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function parseValue(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

interface DateInputProps {
  /** ISO datetime string (America/Sao_Paulo-anchored) or empty string when unset. */
  value: string;
  onChangeValue: (isoValue: string) => void;
  placeholder?: string;
}

/**
 * Lightweight in-house calendar date picker (no native module, works in any
 * Expo runtime without a rebuild). Selected dates are always emitted as an
 * ISO instant anchored to America/Sao_Paulo noon, so downstream storage in a
 * `timestamptz` column never drifts to the wrong calendar day.
 */
export function DateInput({ value, onChangeValue, placeholder = 'Selecionar data' }: DateInputProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const selected = parseValue(value);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => selected ?? new Date());

  const monthWeeks = useMemo(() => {
    return buildMonthWeeks(cursor.getFullYear(), cursor.getMonth());
  }, [cursor]);

  const isSameDay = (day: number) =>
    selected != null &&
    selected.getFullYear() === cursor.getFullYear() &&
    selected.getMonth() === cursor.getMonth() &&
    selected.getDate() === day;

  const pickDay = (day: number) => {
    onChangeValue(saoPauloDateToIso(cursor.getFullYear(), cursor.getMonth(), day));
    setOpen(false);
  };

  return (
    <>
      <Pressable
        onPress={() => { setCursor(selected ?? new Date()); setOpen(true); }}
        style={[styles.field, { borderColor: colors.border, backgroundColor: colors.card }]}
      >
        <CalendarDays size={17} color={colors.foregroundSecondary} />
        <Text style={{ flex: 1, fontSize: 15, color: selected ? colors.foreground : colors.foregroundMuted }}>
          {selected ? selected.toLocaleDateString('pt-BR') : placeholder}
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View
          style={[
            styles.overlay,
            {
              paddingTop: Math.max(24, insets.top + 12),
              paddingBottom: Math.max(24, insets.bottom + 12),
              paddingLeft: Math.max(24, insets.left + 12),
              paddingRight: Math.max(24, insets.right + 12),
            },
          ]}
        >
          <View style={[styles.calendarCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.calendarHeader}>
              <Pressable onPress={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))} style={styles.navButton}>
                <ChevronLeft size={18} color={colors.foreground} />
              </Pressable>
              <Text style={{ fontWeight: '800', color: colors.foreground, fontSize: 14 }}>
                {MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}
              </Text>
              <Pressable onPress={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))} style={styles.navButton}>
                <ChevronRight size={18} color={colors.foreground} />
              </Pressable>
              <Pressable onPress={() => setOpen(false)} style={styles.closeButton} hitSlop={8}>
                <X size={18} color={colors.foregroundSecondary} />
              </Pressable>
            </View>

            <View style={styles.weekdayRow}>
              {WEEKDAY_SHORT.map((label, i) => (
                <Text key={`${label}-${i}`} style={[styles.weekdayLabel, { color: colors.foregroundSecondary }]}>{label}</Text>
              ))}
            </View>

            <View style={styles.grid}>
              {monthWeeks.map((week, weekIndex) => (
                <View key={`week-${weekIndex}`} style={styles.weekRow}>
                  {week.map((day, dayIndex) => (
                    <Pressable
                      key={`${weekIndex}-${dayIndex}`}
                      disabled={day === null}
                      accessibilityRole={day === null ? undefined : 'button'}
                      accessibilityLabel={day === null ? undefined : `${day} de ${MONTH_NAMES[cursor.getMonth()]} de ${cursor.getFullYear()}`}
                      onPress={() => day !== null && pickDay(day)}
                      style={styles.dayColumn}
                    >
                      <View
                        style={[
                          styles.dayCell,
                          day !== null && isSameDay(day) && { backgroundColor: colors.primary },
                        ]}
                      >
                        {day !== null ? (
                          <Text style={{ color: isSameDay(day) ? '#FFF' : colors.foreground, fontWeight: isSameDay(day) ? '800' : '500' }}>
                            {day}
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>
                  ))}
                </View>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: { minHeight: 50, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  calendarCard: { width: '100%', maxWidth: 340, borderRadius: 20, borderWidth: 1, padding: 16 },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  navButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  closeButton: { marginLeft: 'auto', width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  weekdayRow: { flexDirection: 'row' },
  weekdayLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700' },
  grid: { marginTop: 6 },
  weekRow: { flexDirection: 'row' },
  dayColumn: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayCell: { width: '100%', height: '100%', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
