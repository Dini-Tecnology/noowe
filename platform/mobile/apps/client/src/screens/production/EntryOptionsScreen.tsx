/* Hallmark · pre-emit critique: P5 H5 E4 S5 R4 V5 */
/* Hallmark · macrostructure: Form · tone: warm utilitarian · anchor hue: orange */
import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import customerBackend from '../../services/customer-backend';
import { rootNavigate } from './shared';

const RESERVATION_QUICK_SLOTS = [
  { label: 'Hoje 20:00', date: 'today', time: '20:00' },
  { label: 'Hoje 21:00', date: 'today', time: '21:00' },
  { label: 'Amanhã', date: 'tomorrow', time: '20:00' },
] as const;

/**
 * "Como entrar?" — the fork every casual dining walk-in hits after tapping
 * "Entrar no Restaurante": queue now, reserve ahead, request a celebration
 * package, or skip straight to a table already scanned.
 */
export default function EntryOptionsScreen({ route, navigation }: any) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const restaurantId: string | undefined = route?.params?.restaurantId;
  const restaurantName: string | undefined = route?.params?.restaurantName;

  const stats = useQuery({
    queryKey: ['waitlist-stats', restaurantId],
    queryFn: () => customerBackend.getWaitlistStats(restaurantId!),
    enabled: !!restaurantId,
  });

  const openWaitlist = useCallback(
    () => navigation.navigate('Waitlist', { restaurantId }),
    [navigation, restaurantId],
  );
  const openReservation = useCallback(
    (initialDate?: string, initialTime?: string) =>
      navigation.navigate('CreateReservation', {
        restaurantId,
        restaurantName,
        initialDate,
        initialTime,
      }),
    [navigation, restaurantId, restaurantName],
  );
  const openBirthday = useCallback(
    () => navigation.navigate('Birthday', { restaurantId, restaurantName }),
    [navigation, restaurantId, restaurantName],
  );
  const openScanner = useCallback(() => rootNavigate(navigation, 'QrScanner'), [navigation]);

  const waitLabel = stats.data
    ? stats.data.estimatedWaitMinutes > 0
      ? `~${stats.data.estimatedWaitMinutes} min`
      : 'Sem espera'
    : '—';
  const groupsLabel = stats.data
    ? `${stats.data.groupsWaiting} ${stats.data.groupsWaiting === 1 ? 'grupo' : 'grupos'} na fila`
    : 'Fila disponível';

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: { flex: 1, backgroundColor: colors.background },
        content: { paddingHorizontal: 16, paddingBottom: 40 },
        header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 12, gap: 12 },
        headerBtn: {
          width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
          backgroundColor: colors.backgroundTertiary,
        },
        headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.foreground, marginRight: 36 },
        hint: {
          flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: 16,
          backgroundColor: colors.backgroundSecondary, marginBottom: 16,
        },
        hintText: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.primary },
        card: {
          borderRadius: 20, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card,
          padding: 16, marginBottom: 14,
        },
        cardHighlighted: { borderColor: colors.primary, backgroundColor: colors.backgroundSecondary },
        cardRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
        cardIcon: {
          width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
          backgroundColor: colors.backgroundTertiary,
        },
        cardIconHighlighted: { backgroundColor: colors.primaryLight },
        cardTextWrap: { flex: 1 },
        cardTitle: { fontSize: 16, fontWeight: '700', color: colors.foreground },
        cardTitleHighlighted: { color: colors.primary },
        cardSubtitle: { fontSize: 13, color: colors.foregroundSecondary, marginTop: 3 },
        chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
        chip: {
          flexDirection: 'row', alignItems: 'center', gap: 5,
          paddingHorizontal: 11, paddingVertical: 7, borderRadius: 12, backgroundColor: colors.card,
        },
        chipText: { fontSize: 12, fontWeight: '600', color: colors.foregroundSecondary },
        chipInteractive: { backgroundColor: colors.backgroundTertiary },
        chipTextInteractive: { color: colors.foreground },
        birthdayCard: { borderColor: '#F5C453', backgroundColor: '#FFFBEB' },
        birthdayIcon: { backgroundColor: '#FEF3C7' },
        birthdayTitle: { color: '#B45309' },
      }),
    [colors],
  );

  return (
    <ScreenContainer edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
            <Ionicons name="arrow-back" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Como entrar?</Text>
        </View>

        <View style={styles.hint}>
          <Ionicons name="flash-outline" size={16} color={colors.primary} />
          <Text style={styles.hintText}>Escolha como deseja entrar — walk-in permite pedir enquanto espera</Text>
        </View>

        <TouchableOpacity
          style={[styles.card, styles.cardHighlighted]}
          onPress={openWaitlist}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Walk-in Inteligente"
        >
          <View style={styles.cardRow}>
            <View style={[styles.cardIcon, styles.cardIconHighlighted]}>
              <Ionicons name="timer-outline" size={22} color={colors.primary} />
            </View>
            <View style={styles.cardTextWrap}>
              <Text style={[styles.cardTitle, styles.cardTitleHighlighted]}>Walk-in Inteligente</Text>
              <Text style={styles.cardSubtitle}>{waitLabel} · {groupsLabel}</Text>
            </View>
          </View>
          <View style={styles.chipsRow}>
            <View style={styles.chip}>
              <Ionicons name="beer-outline" size={13} color={colors.foregroundSecondary} />
              <Text style={styles.chipText}>Pedir drinks</Text>
            </View>
            <View style={styles.chip}>
              <Ionicons name="notifications-outline" size={13} color={colors.foregroundSecondary} />
              <Text style={styles.chipText}>Notificação</Text>
            </View>
            <View style={styles.chip}>
              <Ionicons name="reader-outline" size={13} color={colors.foregroundSecondary} />
              <Text style={styles.chipText}>Ver cardápio</Text>
            </View>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => openReservation()}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Reserva Antecipada"
        >
          <View style={styles.cardRow}>
            <View style={styles.cardIcon}>
              <Ionicons name="calendar-outline" size={22} color={colors.foreground} />
            </View>
            <View style={styles.cardTextWrap}>
              <Text style={styles.cardTitle}>Reserva Antecipada</Text>
              <Text style={styles.cardSubtitle}>Garanta sua mesa · Ideal para grupos 5+</Text>
            </View>
          </View>
          <View style={styles.chipsRow}>
            {RESERVATION_QUICK_SLOTS.map((slot) => (
              <TouchableOpacity
                key={slot.label}
                style={[styles.chip, styles.chipInteractive]}
                onPress={() => openReservation(slot.date, slot.time)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Reservar ${slot.label}`}
              >
                <Text style={[styles.chipText, styles.chipTextInteractive]}>{slot.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, styles.birthdayCard]}
          onPress={openBirthday}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Aniversário ou festa"
        >
          <View style={styles.cardRow}>
            <View style={[styles.cardIcon, styles.birthdayIcon]}>
              <Ionicons name="gift-outline" size={22} color="#B45309" />
            </View>
            <View style={styles.cardTextWrap}>
              <Text style={[styles.cardTitle, styles.birthdayTitle]}>Aniversário / Festa</Text>
              <Text style={styles.cardSubtitle}>Decoração, bolo e mesas unificadas</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#B45309" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={openScanner}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Já estou na mesa"
        >
          <View style={styles.cardRow}>
            <View style={styles.cardIcon}>
              <Ionicons name="qr-code-outline" size={22} color={colors.foreground} />
            </View>
            <View style={styles.cardTextWrap}>
              <Text style={styles.cardTitle}>Já estou na mesa</Text>
              <Text style={styles.cardSubtitle}>Escaneie o QR Code da mesa</Text>
            </View>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}
