import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Text } from 'react-native-paper';
import { useRoute, useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { RestaurantSubscreenHeader } from '../../components/restaurant/RestaurantSubscreenHeader';
import {
  SelectChip,
  SelectionSection,
  HintBanner,
  ObservationsField,
} from '../../components/restaurant/SelectionControls';
import { useRestaurant } from '@okinawa/shared/hooks/useRestaurants';
import ApiService from '@/shared/services/api';

const RESERVE_DATES = [
  { id: 'today', label: 'Hoje' },
  { id: 'tomorrow', label: 'Amanhã' },
  { id: 'in2', label: 'Em 2 dias' },
  { id: 'in3', label: 'Em 3 dias' },
] as const;

const RESERVE_TIMES = ['19:00', '19:30', '20:00', '20:30', '21:00', '21:30'] as const;
const RESERVE_GUESTS = ['1', '2', '3', '4', '5', '6+'] as const;

function dateForOption(id: string): Date {
  const date = new Date();
  const daysMap: Record<string, number> = { today: 0, tomorrow: 1, in2: 2, in3: 3 };
  date.setDate(date.getDate() + (daysMap[id] ?? 0));
  return date;
}

export default function RestaurantReserveScreen() {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const colors = useColors();
  const { restaurantId } = (route.params ?? {}) as { restaurantId?: string };
  const { data: restaurant, isLoading: restaurantLoading } = useRestaurant(restaurantId ?? '');

  const [selectedDate, setSelectedDate] = useState('today');
  const [selectedTime, setSelectedTime] = useState('20:00');
  const [guests, setGuests] = useState('2');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: { flex: 1 },
        content: { paddingHorizontal: 16, paddingBottom: 28 },
        restaurantCard: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 14,
          borderRadius: 16,
          backgroundColor: colors.backgroundTertiary,
          marginBottom: 16,
        },
        restaurantIcon: {
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: colors.card,
          alignItems: 'center',
          justifyContent: 'center',
        },
        restaurantName: {
          fontSize: 16,
          fontWeight: '700',
          color: colors.foreground,
        },
        restaurantLocation: {
          fontSize: 14,
          color: colors.foregroundSecondary,
          marginTop: 2,
        },
        chipRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 10,
        },
        timeGrid: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 10,
        },
        timeChip: {
          width: '22%',
          minWidth: 72,
        },
        cta: {
          marginTop: 8,
          paddingVertical: 16,
          borderRadius: 16,
          backgroundColor: colors.primary,
          alignItems: 'center',
        },
        ctaText: {
          color: colors.primaryForeground,
          fontSize: 16,
          fontWeight: '700',
        },
        loadingWrap: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        },
      }),
    [colors],
  );

  const handleConfirm = async () => {
    if (!restaurantId) return;
    const [hours, minutes] = selectedTime.split(':').map(Number);
    const reservationDate = dateForOption(selectedDate);
    reservationDate.setHours(hours, minutes, 0, 0);
    const partySize = guests === '6+' ? 6 : Number(guests);

    setSubmitting(true);
    try {
      await ApiService.createCustomerReservation(
        restaurantId,
        reservationDate.toISOString(),
        partySize,
        notes || undefined,
      );
      Alert.alert(
        'Reserva confirmada',
        `${restaurant?.name ?? 'Restaurante'}\n${reservationDate.toLocaleDateString('pt-BR')} às ${selectedTime} · ${guests} pessoa(s)`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (err: any) {
      Alert.alert('Não foi possível reservar', err?.message ?? 'Tente novamente em instantes.');
    } finally {
      setSubmitting(false);
    }
  };

  if (restaurantLoading) {
    return (
      <ScreenContainer edges={['top', 'bottom']}>
        <RestaurantSubscreenHeader title="Reservar Mesa" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <RestaurantSubscreenHeader title="Reservar Mesa" />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.restaurantCard}>
          <View style={styles.restaurantIcon}>
            <Ionicons name="restaurant-outline" size={22} color={colors.foregroundMuted} />
          </View>
          <View>
            <Text style={styles.restaurantName}>{restaurant?.name ?? 'Restaurante'}</Text>
            {restaurant?.city ? (
              <Text style={styles.restaurantLocation}>{restaurant.city}</Text>
            ) : null}
          </View>
        </View>

        <HintBanner message="Selecione data, horário e convidados para reservar" />

        <SelectionSection title="Data">
          <View style={styles.chipRow}>
            {RESERVE_DATES.map((d) => (
              <SelectChip
                key={d.id}
                label={d.label}
                selected={selectedDate === d.id}
                onPress={() => setSelectedDate(d.id)}
              />
            ))}
          </View>
        </SelectionSection>

        <SelectionSection title="Horário">
          <View style={styles.timeGrid}>
            {RESERVE_TIMES.map((time) => (
              <View key={time} style={styles.timeChip}>
                <SelectChip
                  label={time}
                  selected={selectedTime === time}
                  onPress={() => setSelectedTime(time)}
                />
              </View>
            ))}
          </View>
        </SelectionSection>

        <SelectionSection title="Convidados">
          <View style={styles.chipRow}>
            {RESERVE_GUESTS.map((g) => (
              <SelectChip
                key={g}
                label={g}
                variant="circle"
                selected={guests === g}
                onPress={() => setGuests(g)}
              />
            ))}
          </View>
        </SelectionSection>

        <ObservationsField value={notes} onChangeText={setNotes} />

        <TouchableOpacity
          style={[styles.cta, submitting && { opacity: 0.7 }]}
          onPress={handleConfirm}
          activeOpacity={0.85}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="Confirmar reserva"
        >
          {submitting ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.ctaText}>Confirmar Reserva</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}
