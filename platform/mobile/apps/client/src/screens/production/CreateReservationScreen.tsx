import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation } from '@tanstack/react-query';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { SelectChip, SelectionSection, HintBanner, ObservationsField } from '../../components/restaurant/SelectionControls';
import { useVisitSession } from '../../contexts/VisitSessionContext';
import customerBackend from '../../services/customer-backend';

const DATES = [
  { id: 'today', label: 'Hoje' },
  { id: 'tomorrow', label: 'Amanhã' },
  { id: 'in2', label: 'Em 2 dias' },
  { id: 'in3', label: 'Em 3 dias' },
] as const;

const TIMES = ['19:00', '19:30', '20:00', '20:30', '21:00', '21:30'] as const;
const GUESTS = ['1', '2', '3', '4', '5', '6+'] as const;

function dateForOption(id: string): Date {
  const date = new Date();
  const daysMap: Record<string, number> = { today: 0, tomorrow: 1, in2: 2, in3: 3 };
  date.setDate(date.getDate() + (daysMap[id] ?? 0));
  return date;
}

export default function CreateReservationScreen({ route, navigation }: any) {
  const colors = useColors();
  const visit = useVisitSession();
  const restaurantId = route.params?.restaurantId ?? visit.session?.restaurantId;

  const [selectedDate, setSelectedDate] = useState('today');
  const [selectedTime, setSelectedTime] = useState('20:00');
  const [guests, setGuests] = useState('2');
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () => {
      const [hours, minutes] = selectedTime.split(':').map(Number);
      const reservationDate = dateForOption(selectedDate);
      reservationDate.setHours(hours, minutes, 0, 0);
      return customerBackend.createReservation({
        restaurantId,
        reservationTime: reservationDate.toISOString(),
        partySize: guests === '6+' ? 6 : Number(guests),
        specialRequests: notes || undefined,
      });
    },
    onSuccess: () => {
      Alert.alert('Reserva solicitada', 'Você receberá uma confirmação em breve.');
      navigation.goBack();
    },
    onError: (error: Error) => Alert.alert('Não foi possível reservar', error.message),
  });

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: { flex: 1, backgroundColor: colors.background },
        content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
        title: { fontSize: 22, fontWeight: '700', color: colors.foreground, marginBottom: 16 },
        chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
        timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
        timeChip: { width: '22%', minWidth: 72 },
        cta: { marginTop: 8, paddingVertical: 16, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center' },
        ctaDisabled: { opacity: 0.6 },
        ctaText: { color: colors.primaryForeground, fontSize: 16, fontWeight: '700' },
      }),
    [colors],
  );

  return (
    <ScreenContainer edges={['top', 'bottom']} hasKeyboard>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Nova Reserva</Text>

        {!restaurantId && <HintBanner message="Selecione um restaurante antes de reservar." />}

        <SelectionSection title="Data">
          <View style={styles.chipRow}>
            {DATES.map((d) => (
              <SelectChip key={d.id} label={d.label} selected={selectedDate === d.id} onPress={() => setSelectedDate(d.id)} />
            ))}
          </View>
        </SelectionSection>

        <SelectionSection title="Horário">
          <View style={styles.timeGrid}>
            {TIMES.map((time) => (
              <View key={time} style={styles.timeChip}>
                <SelectChip label={time} selected={selectedTime === time} onPress={() => setSelectedTime(time)} />
              </View>
            ))}
          </View>
        </SelectionSection>

        <SelectionSection title="Convidados">
          <View style={styles.chipRow}>
            {GUESTS.map((g) => (
              <SelectChip key={g} label={g} variant="circle" selected={guests === g} onPress={() => setGuests(g)} />
            ))}
          </View>
        </SelectionSection>

        <ObservationsField value={notes} onChangeText={setNotes} />

        <TouchableOpacity
          style={[styles.cta, (!restaurantId || mutation.isPending) && styles.ctaDisabled]}
          onPress={() => mutation.mutate()}
          disabled={!restaurantId || mutation.isPending}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>{mutation.isPending ? 'Enviando...' : 'Solicitar Reserva'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}
