import React, { useCallback, useMemo, useState } from 'react';
import { Dimensions, Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import customerBackend from '../../services/customer-backend';
import { StateView } from './shared';

const HERO_HEIGHT = Dimensions.get('window').width * 0.55;
const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80';

const WEEKDAY_LABELS: Record<string, string> = {
  monday: 'Seg', tuesday: 'Ter', wednesday: 'Qua', thursday: 'Qui',
  friday: 'Sex', saturday: 'Sáb', sunday: 'Dom',
};

function formatOpeningHours(openingHours: Record<string, unknown>): string | null {
  const entries = Object.entries(openingHours ?? {}) as [string, { open?: string; close?: string; closed?: boolean }][];
  const openDays = entries.filter(([, v]) => v && !v.closed && v.open && v.close);
  if (openDays.length === 0) return null;
  const [, sample] = openDays[0];
  const allSame = openDays.every(([, v]) => v.open === sample.open && v.close === sample.close);
  if (allSame) {
    const days = openDays.map(([day]) => WEEKDAY_LABELS[day] ?? day).join(', ');
    return `${days} · ${sample.open}–${sample.close}`;
  }
  return openDays.map(([day, v]) => `${WEEKDAY_LABELS[day] ?? day} ${v.open}–${v.close}`).join(' · ');
}

export default function RestaurantScreen({ route, navigation }: any) {
  const { restaurantId } = route.params;
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [isFavorite, setIsFavorite] = useState(false);

  const query = useQuery({ queryKey: ['restaurant', restaurantId], queryFn: () => customerBackend.getRestaurant(restaurantId) });
  const favorite = useMutation({
    mutationFn: () => customerBackend.setFavorite(restaurantId, !isFavorite),
    onSuccess: () => setIsFavorite((v) => !v),
  });

  const hoursLabel = useMemo(
    () => (query.data ? formatOpeningHours(query.data.openingHours) : null),
    [query.data],
  );

  const openMenu = useCallback(() => navigation.navigate('Menu', { restaurantId }), [navigation, restaurantId]);
  const openReserve = useCallback(() => navigation.navigate('CreateReservation', { restaurantId }), [navigation, restaurantId]);
  const openWaitlist = useCallback(() => navigation.navigate('Waitlist', { restaurantId }), [navigation, restaurantId]);
  const openScanner = useCallback(() => navigation.navigate('QrScanner'), [navigation]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: { flex: 1, backgroundColor: colors.background },
        scrollContent: { paddingBottom: 32 },
        hero: { width: '100%', height: HERO_HEIGHT, backgroundColor: colors.backgroundTertiary },
        backBtn: {
          position: 'absolute', left: 16, width: 40, height: 40, borderRadius: 20,
          backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
          shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3,
        },
        favBtn: {
          position: 'absolute', right: 16, width: 40, height: 40, borderRadius: 20,
          backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
          shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3,
        },
        body: { paddingHorizontal: 16, paddingTop: 20 },
        title: { fontSize: 26, fontWeight: '800', color: colors.foreground, letterSpacing: -0.5, marginBottom: 8 },
        tagline: { fontSize: 15, lineHeight: 22, color: colors.foregroundSecondary, marginBottom: 14 },
        metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14, marginBottom: 10 },
        metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
        metaText: { fontSize: 14, fontWeight: '600', color: colors.foreground },
        hoursRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
        hoursText: { fontSize: 14, color: colors.foregroundSecondary },
        tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
        tag: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.backgroundTertiary },
        tagText: { fontSize: 13, fontWeight: '500', color: colors.foregroundSecondary },
        primaryRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
        primaryBtn: {
          flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          gap: 8, paddingVertical: 14, borderRadius: 16,
        },
        primaryBtnFilled: { backgroundColor: colors.primary },
        primaryBtnOutline: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border },
        primaryBtnTextFilled: { color: colors.primaryForeground, fontSize: 15, fontWeight: '700' },
        primaryBtnTextOutline: { color: colors.foreground, fontSize: 15, fontWeight: '700' },
        secondaryRow: { flexDirection: 'row', gap: 10 },
        secondaryBtn: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 16, backgroundColor: colors.backgroundTertiary },
        secondaryLabel: { marginTop: 8, fontSize: 12, fontWeight: '600', color: colors.foreground, textAlign: 'center' },
      }),
    [colors],
  );

  if (query.isLoading || query.isError || !query.data) {
    return (
      <ScreenContainer edges={['top', 'bottom']}>
        <StateView loading={query.isLoading} error={query.error} onRetry={() => query.refetch()} />
      </ScreenContainer>
    );
  }

  const restaurant = query.data;

  return (
    <ScreenContainer edges={['bottom']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View>
          <Image source={{ uri: restaurant.bannerUrl || restaurant.logoUrl || FALLBACK_IMAGE }} style={styles.hero} resizeMode="cover" />
          <TouchableOpacity
            style={[styles.backBtn, { top: insets.top + 8 }]}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
          >
            <Ionicons name="arrow-back" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.favBtn, { top: insets.top + 8 }]}
            onPress={() => favorite.mutate()}
            disabled={favorite.isPending}
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
          >
            <Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          <Text style={styles.title}>{restaurant.name}</Text>
          {restaurant.description ? <Text style={styles.tagline}>{restaurant.description}</Text> : null}

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="star" size={16} color="#FBBF24" />
              <Text style={styles.metaText}>{restaurant.rating.toFixed(1)} ({restaurant.totalReviews})</Text>
            </View>
            {restaurant.address ? (
              <View style={styles.metaItem}>
                <Ionicons name="location-outline" size={16} color={colors.foregroundMuted} />
                <Text style={styles.metaText}>{restaurant.city ? `${restaurant.address}, ${restaurant.city}` : restaurant.address}</Text>
              </View>
            ) : null}
          </View>

          {hoursLabel ? (
            <View style={styles.hoursRow}>
              <Ionicons name="time-outline" size={16} color={colors.foregroundMuted} />
              <Text style={styles.hoursText}>{hoursLabel}</Text>
            </View>
          ) : null}

          {restaurant.cuisineTypes.length > 0 ? (
            <View style={styles.tagsWrap}>
              {restaurant.cuisineTypes.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.primaryRow}>
            <TouchableOpacity style={[styles.primaryBtn, styles.primaryBtnFilled]} onPress={openMenu} activeOpacity={0.85} accessibilityRole="button">
              <Ionicons name="restaurant" size={20} color={colors.primaryForeground} />
              <Text style={styles.primaryBtnTextFilled}>Ver Cardápio</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.primaryBtn, styles.primaryBtnOutline]} onPress={openReserve} activeOpacity={0.85} accessibilityRole="button">
              <Ionicons name="calendar-outline" size={20} color={colors.foreground} />
              <Text style={styles.primaryBtnTextOutline}>Reservar</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.secondaryRow}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={openScanner} activeOpacity={0.85} accessibilityRole="button">
              <Ionicons name="qr-code-outline" size={26} color={colors.primary} />
              <Text style={styles.secondaryLabel}>Escanear QR</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={openWaitlist} activeOpacity={0.85} accessibilityRole="button">
              <Ionicons name="timer-outline" size={26} color={colors.primary} />
              <Text style={styles.secondaryLabel}>Fila Virtual</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => navigation.navigate('CallWaiter')}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Ionicons name="hand-left-outline" size={26} color={colors.primary} />
              <Text style={styles.secondaryLabel}>Chamar Garçom</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
