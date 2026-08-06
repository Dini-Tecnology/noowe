import React, { useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useRoute, useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useScreenTracking } from '@/shared/hooks/useAnalytics';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { useRestaurant } from '@okinawa/shared/hooks/useRestaurants';

const HERO_HEIGHT = Dimensions.get('window').width * 0.55;

const WEEKDAY_LABELS: Record<string, string> = {
  monday: 'Seg',
  tuesday: 'Ter',
  wednesday: 'Qua',
  thursday: 'Qui',
  friday: 'Sex',
  saturday: 'Sáb',
  sunday: 'Dom',
};

function formatOpeningHours(openingHours: unknown): string | null {
  if (!openingHours || typeof openingHours !== 'object') return null;
  const entries = Object.entries(openingHours as Record<string, { open?: string; close?: string; closed?: boolean }>);
  const openDays = entries.filter(([, v]) => v && !v.closed && v.open && v.close);
  if (openDays.length === 0) return null;
  const [, sample] = openDays[0];
  const allSame = openDays.every(([, v]) => v.open === sample.open && v.close === sample.close);
  if (allSame) {
    const days = openDays.map(([day]) => WEEKDAY_LABELS[day] ?? day).join(', ');
    return `${days} · ${sample.open}–${sample.close}`;
  }
  return openDays
    .map(([day, v]) => `${WEEKDAY_LABELS[day] ?? day} ${v.open}–${v.close}`)
    .join(' · ');
}

export default function RestaurantScreen() {
  useScreenTracking('Restaurant Details');

  const route = useRoute();
  const navigation = useNavigation<any>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { restaurantId } = (route.params ?? {}) as { restaurantId?: string };
  const { data: restaurant, isLoading, isError, refetch } = useRestaurant(restaurantId ?? '');
  const hoursLabel = useMemo(() => formatOpeningHours(restaurant?.opening_hours), [restaurant]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: { flex: 1, backgroundColor: colors.background },
        scrollContent: { paddingBottom: 32 },
        hero: {
          width: '100%',
          height: HERO_HEIGHT,
          backgroundColor: colors.backgroundTertiary,
        },
        backBtn: {
          position: 'absolute',
          left: 16,
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.12,
          shadowRadius: 6,
          elevation: 3,
        },
        body: {
          paddingHorizontal: 16,
          paddingTop: 20,
        },
        title: {
          fontSize: 26,
          fontWeight: '800',
          color: colors.foreground,
          letterSpacing: -0.5,
          marginBottom: 8,
        },
        tagline: {
          fontSize: 15,
          lineHeight: 22,
          color: colors.foregroundSecondary,
          marginBottom: 14,
        },
        metaRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 14,
          marginBottom: 10,
        },
        metaItem: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
        },
        metaText: {
          fontSize: 14,
          fontWeight: '600',
          color: colors.foreground,
        },
        hoursRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          marginBottom: 16,
        },
        hoursText: {
          fontSize: 14,
          color: colors.foregroundSecondary,
        },
        tagsWrap: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 16,
        },
        tag: {
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 20,
          backgroundColor: colors.backgroundTertiary,
        },
        tagText: {
          fontSize: 13,
          fontWeight: '500',
          color: colors.foregroundSecondary,
        },
        hintBanner: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderRadius: 14,
          backgroundColor: '#FFF3EE',
          marginBottom: 20,
        },
        hintText: {
          flex: 1,
          fontSize: 14,
          fontWeight: '500',
          color: colors.primary,
          lineHeight: 20,
        },
        primaryRow: {
          flexDirection: 'row',
          gap: 10,
          marginBottom: 16,
        },
        primaryBtn: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingVertical: 14,
          borderRadius: 16,
        },
        primaryBtnFilled: {
          backgroundColor: colors.primary,
        },
        primaryBtnOutline: {
          backgroundColor: colors.card,
          borderWidth: 1.5,
          borderColor: colors.border,
        },
        primaryBtnTextFilled: {
          color: colors.primaryForeground,
          fontSize: 15,
          fontWeight: '700',
        },
        primaryBtnTextOutline: {
          color: colors.foreground,
          fontSize: 15,
          fontWeight: '700',
        },
        secondaryRow: {
          flexDirection: 'row',
          gap: 10,
        },
        secondaryBtn: {
          flex: 1,
          alignItems: 'center',
          paddingVertical: 14,
          borderRadius: 16,
          backgroundColor: colors.backgroundTertiary,
        },
        secondaryLabel: {
          marginTop: 8,
          fontSize: 12,
          fontWeight: '600',
          color: colors.foreground,
          textAlign: 'center',
        },
        stateWrap: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          gap: 10,
        },
        stateText: {
          fontSize: 14,
          color: colors.foregroundSecondary,
          textAlign: 'center',
        },
        stateRetry: {
          fontSize: 14,
          fontWeight: '700',
          color: colors.primary,
        },
      }),
    [colors],
  );

  const navParams = useMemo(
    () =>
      restaurant
        ? {
            restaurantId: restaurant.id,
            restaurantName: restaurant.name,
          }
        : undefined,
    [restaurant],
  );

  const openMenu = useCallback(() => {
    navigation.navigate('MenuTab', navParams);
  }, [navigation, navParams]);

  const openReserve = useCallback(() => {
    navigation.navigate('RestaurantReserve', navParams);
  }, [navigation, navParams]);

  const openQR = useCallback(() => {
    navigation.navigate('QRScanner');
  }, [navigation]);

  const openQueue = useCallback(() => {
    navigation.navigate('RestaurantVirtualQueue', navParams);
  }, [navigation, navParams]);

  const openCallTeam = useCallback(() => {
    navigation.navigate('RestaurantCallTeam', navParams);
  }, [navigation, navParams]);

  if (isLoading) {
    return (
      <ScreenContainer edges={['top', 'bottom']}>
        <View style={styles.stateWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (isError || !restaurant) {
    return (
      <ScreenContainer edges={['top', 'bottom']}>
        <View style={styles.stateWrap}>
          <Ionicons name="cloud-offline-outline" size={32} color={colors.foregroundMuted} />
          <Text style={styles.stateText}>Não foi possível carregar o restaurante</Text>
          <TouchableOpacity onPress={() => refetch()} accessibilityRole="button">
            <Text style={styles.stateRetry}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Image
            source={{
              uri:
                restaurant.banner_url ||
                restaurant.logo_url ||
                'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
            }}
            style={styles.hero}
            resizeMode="cover"
            accessibilityLabel={`Interior do ${restaurant.name}`}
          />
          <TouchableOpacity
            style={[styles.backBtn, { top: insets.top + 8 }]}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
          >
            <Ionicons name="arrow-back" size={22} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          <Text style={styles.title}>{restaurant.name}</Text>
          {restaurant.description ? (
            <Text style={styles.tagline}>{restaurant.description}</Text>
          ) : null}

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="star" size={16} color="#FBBF24" />
              <Text style={styles.metaText}>
                {restaurant.rating} ({restaurant.total_reviews})
              </Text>
            </View>
            {restaurant.address ? (
              <View style={styles.metaItem}>
                <Ionicons name="location-outline" size={16} color={colors.foregroundMuted} />
                <Text style={styles.metaText}>
                  {restaurant.city ? `${restaurant.address}, ${restaurant.city}` : restaurant.address}
                </Text>
              </View>
            ) : null}
          </View>

          {hoursLabel ? (
            <View style={styles.hoursRow}>
              <Ionicons name="time-outline" size={16} color={colors.foregroundMuted} />
              <Text style={styles.hoursText}>{hoursLabel}</Text>
            </View>
          ) : null}

          {Array.isArray(restaurant.cuisine_types) && restaurant.cuisine_types.length > 0 ? (
            <View style={styles.tagsWrap}>
              {restaurant.cuisine_types.map((tag: string) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.hintBanner}>
            <Ionicons name="flash" size={20} color={colors.primary} />
            <Text style={styles.hintText}>Explore o cardápio ou faça uma reserva</Text>
          </View>

          <View style={styles.primaryRow}>
            <TouchableOpacity
              style={[styles.primaryBtn, styles.primaryBtnFilled]}
              onPress={openMenu}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Ver cardápio"
            >
              <Ionicons name="restaurant" size={20} color={colors.primaryForeground} />
              <Text style={styles.primaryBtnTextFilled}>Ver Cardápio</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, styles.primaryBtnOutline]}
              onPress={openReserve}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Reservar mesa"
            >
              <Ionicons name="calendar-outline" size={20} color={colors.foreground} />
              <Text style={styles.primaryBtnTextOutline}>Reservar Mesa</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.secondaryRow}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={openQR}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Escanear QR"
            >
              <Ionicons name="qr-code-outline" size={26} color={colors.primary} />
              <Text style={styles.secondaryLabel}>Escanear QR</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={openQueue}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Fila virtual"
            >
              <Ionicons name="timer-outline" size={26} color={colors.primary} />
              <Text style={styles.secondaryLabel}>Fila Virtual</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={openCallTeam}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Chamar garçom"
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
