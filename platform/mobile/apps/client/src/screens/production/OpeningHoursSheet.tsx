import React, { useMemo } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import {
  WEEKDAY_KEYS,
  WEEKDAY_LABEL_PT,
  formatDaySchedule,
  parseOpeningHours,
  todayWeekdayKey,
} from '@okinawa/shared/utils/opening-hours';

interface OpeningHoursSheetProps {
  visible: boolean;
  onClose: () => void;
  /** `restaurants.opening_hours`, exatamente como o restaurante cadastrou. */
  openingHours: unknown;
}

/** Pop-up com os dias e turnos que o restaurante cadastrou no painel dele. */
export function OpeningHoursSheet({ visible, onClose, openingHours }: OpeningHoursSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const week = useMemo(() => parseOpeningHours(openingHours), [openingHours]);
  const today = todayWeekdayKey();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
        sheet: {
          backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24,
          paddingHorizontal: 20, paddingTop: 12, maxHeight: '75%',
        },
        handle: {
          alignSelf: 'center', width: 44, height: 4, borderRadius: 2,
          backgroundColor: colors.border, marginBottom: 14,
        },
        title: { fontSize: 18, fontWeight: '800', color: colors.foreground, marginBottom: 14 },
        row: {
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
          paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
        },
        day: { fontSize: 15, color: colors.foregroundSecondary },
        hours: { flexShrink: 1, fontSize: 15, color: colors.foreground, textAlign: 'right' },
        today: { fontWeight: '800', color: colors.foreground },
        closed: { color: colors.foregroundMuted },
        empty: { fontSize: 15, color: colors.foregroundSecondary, paddingVertical: 12 },
        close: {
          marginTop: 16, paddingVertical: 15, borderRadius: 18, alignItems: 'center',
          backgroundColor: colors.primary,
        },
        closeText: { fontSize: 15, fontWeight: '700', color: colors.primaryForeground },
      }),
    [colors],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Fechar"
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Horários de funcionamento</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {week ? (
              WEEKDAY_KEYS.map((key) => {
                const label = formatDaySchedule(week[key]);
                const isToday = key === today;
                return (
                  <View key={key} style={styles.row} accessible accessibilityLabel={`${WEEKDAY_LABEL_PT[key]}: ${label}`}>
                    <Text style={[styles.day, isToday && styles.today]}>
                      {WEEKDAY_LABEL_PT[key]}{isToday ? ' (hoje)' : ''}
                    </Text>
                    <Text style={[styles.hours, isToday && styles.today, week[key].closed && styles.closed]}>
                      {label}
                    </Text>
                  </View>
                );
              })
            ) : (
              <Text style={styles.empty}>Horário não informado pelo restaurante.</Text>
            )}
          </ScrollView>
          <TouchableOpacity style={styles.close} onPress={onClose} activeOpacity={0.9} accessibilityRole="button">
            <Text style={styles.closeText}>Fechar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
