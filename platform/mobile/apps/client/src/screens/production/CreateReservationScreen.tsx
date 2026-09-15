import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { SelectChip, SelectionSection, HintBanner, ObservationsField } from '../../components/restaurant/SelectionControls';
import { useVisitSession } from '../../contexts/VisitSessionContext';
import { useServiceTypeFor } from '../../hooks/useServiceTypeFeatures';
import customerBackend from '../../services/customer-backend';

const DATES = [
  { id: 'today', label: 'Hoje' },
  { id: 'tomorrow', label: 'Amanhã' },
  { id: 'in2', label: 'Em 2 dias' },
  { id: 'in3', label: 'Em 3 dias' },
] as const;

const TIMES = ['19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00', '22:30'] as const;
const GUESTS = ['1', '2', '3', '4', '5', '6+'] as const;

function dateForOption(id: string): Date {
  const date = new Date();
  const daysMap: Record<string, number> = { today: 0, tomorrow: 1, in2: 2, in3: 3 };
  date.setDate(date.getDate() + (daysMap[id] ?? 0));
  return date;
}

export default function CreateReservationScreen({ route, navigation }: any) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const visit = useVisitSession();
  const restaurantId = route.params?.restaurantId ?? visit.session?.restaurantId;
  const restaurantName = route.params?.restaurantName ?? 'Restaurante selecionado';
  const restaurantAddress = route.params?.restaurantAddress ?? '';
  const { status: serviceTypeStatus, features } = useServiceTypeFor(restaurantId);
  const reservationsUnavailable = !!restaurantId && serviceTypeStatus !== 'loading' && !features.reservations;

  const [selectedDate, setSelectedDate] = useState(route.params?.initialDate ?? 'today');
  const [selectedTime, setSelectedTime] = useState(route.params?.initialTime ?? '20:00');
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
    onSuccess: async (reservation) => {
      void queryClient.invalidateQueries({ queryKey: ['reservations'] });
      let inviteUrl: string | undefined;
      try {
        inviteUrl = await customerBackend.createReservationInvite(reservation.id);
      } catch {
        // The confirmation remains valid even if link generation is retried later.
      }
      navigation.replace('ReservationConfirmation', {
        reservation: { ...reservation, restaurantName },
        inviteUrl,
      });
    },
    onError: (error: Error) => Alert.alert('Não foi possível reservar', error.message),
  });

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: { flex: 1, backgroundColor: colors.background },
        content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
        header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
        back: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.backgroundTertiary, alignItems: 'center', justifyContent: 'center' },
        title: { flex: 1, marginRight: 32, textAlign: 'center', fontSize: 17, fontWeight: '800', color: colors.foreground },
        restaurantCard: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 17, backgroundColor: colors.card, marginBottom: 18 },
        restaurantIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#FFF0EA', alignItems: 'center', justifyContent: 'center' },
        restaurantName: { color: colors.foreground, fontSize: 14, fontWeight: '800', marginBottom: 3 },
        restaurantAddress: { color: colors.foregroundSecondary, fontSize: 11 },
        chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
        timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
        timeChip: { width: '22%' },
        cta: { marginTop: 8, paddingVertical: 16, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center' },
        ctaDisabled: { opacity: 0.6 },
        ctaText: { color: colors.primaryForeground, fontSize: 16, fontWeight: '700' },
      }),
    [colors],
  );

  return (
    <ScreenContainer edges={['top', 'bottom']} hasKeyboard>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityRole="button"><Ionicons name="arrow-back" size={18} color={colors.foregroundSecondary} /></TouchableOpacity>
          <Text style={styles.title}>Reservar Mesa</Text>
        </View>

        <View style={styles.restaurantCard}>
          <View style={styles.restaurantIcon}><Ionicons name="restaurant-outline" size={21} color={colors.primary} /></View>
          <View style={{ flex: 1 }}><Text style={styles.restaurantName}>{restaurantName}</Text>{restaurantAddress ? <Text style={styles.restaurantAddress}>{restaurantAddress}</Text> : null}</View>
        </View>

        {!restaurantId && <HintBanner message="Selecione um restaurante antes de reservar." />}
        {reservationsUnavailable && <HintBanner message="Este restaurante não aceita reservas pelo app." />}

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

        <ObservationsField value={notes} onChangeText={setNotes} compact />

        <TouchableOpacity
          style={[styles.cta, (!restaurantId || reservationsUnavailable || mutation.isPending) && styles.ctaDisabled]}
          onPress={() => mutation.mutate()}
          disabled={!restaurantId || reservationsUnavailable || mutation.isPending}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>{mutation.isPending ? 'Confirmando...' : 'Confirmar Reserva'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}
