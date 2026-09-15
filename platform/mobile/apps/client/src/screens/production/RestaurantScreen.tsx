/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V5 */
/* Hallmark · macrostructure: Long Document · tone: luxury utilitarian · anchor hue: orange */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Dimensions, Image, Linking, Modal, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import customerBackend from '../../services/customer-backend';
import { useServiceTypeFor } from '../../hooks/useServiceTypeFeatures';
import { useVisitSession } from '../../contexts/VisitSessionContext';
import { distanceKm, StateView, useQueryRefreshControl } from './shared';
import { formatDistance, formatPriceLevel } from './home-restaurant-ui';
import CasualDiningRestaurantView from './CasualDiningRestaurantView';
import QuickServiceRestaurantView from './QuickServiceRestaurantView';

const HERO_HEIGHT = Dimensions.get('window').width * 0.55;
const FINE_DINING_HERO_HEIGHT = Dimensions.get('window').width * 0.76;
const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80';

const WEEKDAY_LABELS: Record<string, string> = {
  monday: 'Seg', tuesday: 'Ter', wednesday: 'Qua', thursday: 'Qui',
  friday: 'Sex', saturday: 'Sáb', sunday: 'Dom',
};

const WEEKDAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/**
 * Agrupa dias consecutivos com o mesmo horário (ex.: "Ter–Sex 12:00–23:00")
 * em vez de listar cada dia individualmente — evita um rótulo longo demais
 * para caber em uma linha em telas estreitas.
 */
function formatOpeningHours(openingHours: Record<string, unknown>): string | null {
  const entries = Object.entries(openingHours ?? {}) as [string, { open?: string; close?: string; closed?: boolean }][];
  const openDays = entries
    .filter(([, v]) => v && !v.closed && v.open && v.close)
    .sort(([a], [b]) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b));
  if (openDays.length === 0) return null;

  const groups: { days: string[]; open: string; close: string }[] = [];
  for (const [day, v] of openDays) {
    const last = groups[groups.length - 1];
    const lastDayIndex = last ? WEEKDAY_ORDER.indexOf(last.days[last.days.length - 1]) : -1;
    const isConsecutive = last && WEEKDAY_ORDER.indexOf(day) === lastDayIndex + 1;
    if (last && isConsecutive && last.open === v.open && last.close === v.close) {
      last.days.push(day);
    } else {
      groups.push({ days: [day], open: v.open!, close: v.close! });
    }
  }

  return groups
    .map(({ days, open, close }) => {
      const label =
        days.length > 1
          ? `${WEEKDAY_LABELS[days[0]] ?? days[0]}–${WEEKDAY_LABELS[days[days.length - 1]] ?? days[days.length - 1]}`
          : WEEKDAY_LABELS[days[0]] ?? days[0];
      return `${label} ${open}–${close}`;
    })
    .join(' · ');
}

function serviceAmenities(serviceConfig: Record<string, unknown>): string[] {
  const amenities = serviceConfig.amenities;
  return Array.isArray(amenities) ? amenities.filter((item): item is string => typeof item === 'string') : [];
}

/** Full-bleed viewer for the photos a restaurant actually published. */
function PhotoGalleryModal({
  visible,
  photos,
  onClose,
}: {
  visible: boolean;
  photos: string[];
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = Dimensions.get('window');

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 8 }}>
        <TouchableOpacity
          style={{
            marginLeft: 16, width: 40, height: 40, borderRadius: 20, alignItems: 'center',
            justifyContent: 'center', backgroundColor: colors.backgroundTertiary,
          }}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Fechar fotos"
        >
          <Ionicons name="close" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {photos.map((uri) => (
            <Image
              key={uri}
              source={{ uri }}
              style={{ width: width - 32, height: (width - 32) * 0.62, borderRadius: 16, backgroundColor: colors.backgroundTertiary }}
              resizeMode="cover"
            />
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function RestaurantScreen({ route, navigation }: any) {
  const { restaurantId } = route.params;
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [isFavorite, setIsFavorite] = useState(false);

  const [galleryOpen, setGalleryOpen] = useState(false);

  const query = useQuery({ queryKey: ['restaurant', restaurantId], queryFn: () => customerBackend.getRestaurant(restaurantId) });
  const serviceTypeFor = useServiceTypeFor(restaurantId);
  // Which journey this restaurant runs comes from its server capabilities
  // (spec §6 "unidade de consumo"), never from the model name.
  const consumptionUnit = serviceTypeFor.capabilities?.consumptionUnit ?? null;
  const perPersonComanda = consumptionUnit === 'per_person';
  const individualCart = consumptionUnit === 'individual_cart';
  const tableWithGuests = consumptionUnit === 'table_with_guests';
  const liveStatus = useQuery({
    queryKey: ['restaurant-live-status', restaurantId],
    queryFn: () => customerBackend.getRestaurantLiveStatus(restaurantId),
    enabled: perPersonComanda || individualCart,
    staleTime: 60 * 1000,
  });
  const refreshControl = useQueryRefreshControl(perPersonComanda || individualCart ? [query, liveStatus] : [query]);
  const favorite = useMutation({
    mutationFn: () => customerBackend.setFavorite(restaurantId, !isFavorite),
    onSuccess: () => setIsFavorite((v) => !v),
  });
  const { session, leaveTable: leaveCurrentTable } = useVisitSession();
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') return;
      const last = await Location.getLastKnownPositionAsync();
      if (!cancelled && last) setUserLocation(last.coords);
    })();
    return () => { cancelled = true; };
  }, []);

  const distanceLabel = useMemo(() => {
    if (!userLocation || query.data?.lat == null || query.data?.lng == null) return null;
    return formatDistance(distanceKm(userLocation, { lat: query.data.lat, lng: query.data.lng }));
  }, [userLocation, query.data]);

  const hoursLabel = useMemo(
    () => (query.data ? formatOpeningHours(query.data.openingHours) : null),
    [query.data],
  );

  const openMenu = useCallback(() => navigation.navigate('Menu', { restaurantId }), [navigation, restaurantId]);
  const openReserve = useCallback(() => navigation.navigate('CreateReservation', { restaurantId }), [navigation, restaurantId]);
  const openWaitlist = useCallback(() => navigation.navigate('Waitlist', { restaurantId }), [navigation, restaurantId]);
  const openScanner = useCallback(() => navigation.navigate('QrScanner'), [navigation]);
  const openCallWaiter = useCallback(() => navigation.navigate('CallWaiter'), [navigation]);
  const leaveTable = useCallback(() => {
    Alert.alert(
      'Sair da mesa',
      `Encerrar sua sessão na Mesa ${session?.tableNumber ?? ''}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: () => {
            void leaveCurrentTable().catch(() => {
              Alert.alert('Não foi possível sair', 'Verifique sua conexão e tente novamente.');
            });
          },
        },
      ],
    );
  }, [session, leaveCurrentTable]);

  const secondaryActions = useMemo(() => {
    const actions: { key: string; icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }[] = [];
    if (serviceTypeFor.features.qrOrdering) {
      actions.push({ key: 'scan', icon: 'qr-code-outline', label: 'Escanear QR', onPress: openScanner });
    }
    if (serviceTypeFor.features.virtualQueue) {
      actions.push({ key: 'waitlist', icon: 'timer-outline', label: 'Fila Virtual', onPress: openWaitlist });
    }
    if (serviceTypeFor.features.callWaiter) {
      actions.push({ key: 'call', icon: 'hand-left-outline', label: 'Chamar Garçom', onPress: openCallWaiter });
    }
    return actions;
  }, [serviceTypeFor.features, openScanner, openWaitlist, openCallWaiter]);

  const activeSessionHere = session?.restaurantId === restaurantId && !!session?.tableSessionId;

  const openDirections = useCallback(() => {
    const restaurant = query.data;
    if (!restaurant) return;
    const destination = restaurant.lat != null && restaurant.lng != null
      ? `${restaurant.lat},${restaurant.lng}`
      : [restaurant.address, restaurant.city, restaurant.state].filter(Boolean).join(', ');
    if (!destination) {
      Alert.alert('Como ir', 'Este restaurante ainda não informou o endereço.');
      return;
    }
    const url = Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${encodeURIComponent(destination)}`
      : `geo:0,0?q=${encodeURIComponent(destination)}`;
    Linking.openURL(url).catch(() => {
      void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`);
    });
  }, [query.data]);

  const openReviews = useCallback(
    () => navigation.navigate('Reviews', { restaurantId }),
    [navigation, restaurantId],
  );

  const handleCasualAction = useCallback(
    (key: string) => {
      if (key === 'menu') return openMenu();
      if (key === 'reviews') return openReviews();
      if (key === 'directions') return openDirections();
      if (key === 'photos') {
        if (!query.data?.photos.length) {
          Alert.alert('Fotos', 'Este restaurante ainda não publicou fotos.');
          return;
        }
        setGalleryOpen(true);
      }
    },
    [openMenu, openReviews, openDirections, query.data],
  );

  // Casual dining is walk-in first: someone already seated just goes to the
  // menu; everyone else picks how they're entering (walk-in, reservation,
  // birthday package, or "already scanned") on the dedicated hub screen.
  const enterRestaurant = useCallback(() => {
    if (activeSessionHere) {
      openMenu();
      return;
    }
    navigation.navigate('EntryOptions', { restaurantId, restaurantName: query.data?.name });
  }, [activeSessionHere, openMenu, navigation, restaurantId, query.data]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: { flex: 1, backgroundColor: colors.background },
        scrollContent: { paddingBottom: 32 },
        hero: { width: '100%', height: HERO_HEIGHT, backgroundColor: colors.backgroundTertiary },
        fineHeroWrap: { height: FINE_DINING_HERO_HEIGHT, backgroundColor: colors.backgroundTertiary },
        fineHero: { width: '100%', height: '100%' },
        fineHeroGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 132 },
        backBtn: {
          position: 'absolute', left: 16, width: 44, height: 44, borderRadius: 22,
          backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center',
          shadowColor: colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3,
        },
        favBtn: {
          position: 'absolute', right: 16, width: 44, height: 44, borderRadius: 22,
          backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center',
          shadowColor: colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3,
        },
        body: { paddingHorizontal: 16, paddingTop: 20 },
        fineBody: { paddingHorizontal: 20, marginTop: 0, paddingTop: 12, paddingBottom: 20 },
        fineTitle: { fontSize: 28, lineHeight: 34, fontWeight: '800', color: colors.foreground, letterSpacing: -0.6, marginBottom: 6 },
        fineDescription: { fontSize: 15, lineHeight: 21, color: colors.foregroundSecondary, marginBottom: 14 },
        fineMetaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 18, marginBottom: 11 },
        fineMetaText: { fontSize: 14, fontWeight: '500', color: colors.foregroundSecondary },
        fineAddressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 11 },
        fineAddressText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.foregroundSecondary },
        fineAmenities: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
        fineAmenity: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.backgroundTertiary },
        fineAmenityText: { fontSize: 12, color: colors.foregroundSecondary },
        fineHint: {
          flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36,
          paddingHorizontal: 12, paddingVertical: 9, marginBottom: 16,
          borderWidth: 1, borderColor: colors.primaryLight, borderRadius: 18,
          backgroundColor: colors.backgroundSecondary,
        },
        fineHintText: { flex: 1, fontSize: 12, lineHeight: 16, color: colors.primary },
        titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
        title: { fontSize: 26, fontWeight: '800', color: colors.foreground, letterSpacing: -0.5 },
        serviceBadge: { backgroundColor: colors.backgroundTertiary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
        serviceBadgeText: { fontSize: 12, fontWeight: '700', color: colors.foregroundSecondary },
        leaveTableRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
        leaveTableText: { fontSize: 13, fontWeight: '600', color: colors.foregroundSecondary, textDecorationLine: 'underline' },
        tagline: { fontSize: 15, lineHeight: 22, color: colors.foregroundSecondary, marginBottom: 14 },
        metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14, marginBottom: 10 },
        metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
        metaText: { fontSize: 14, fontWeight: '600', color: colors.foreground },
        hoursRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 16 },
        hoursIcon: { marginTop: 2 },
        hoursText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.foregroundSecondary },
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

  const resolvingJourney = serviceTypeFor.status === 'loading';
  if (query.isLoading || query.isError || !query.data || resolvingJourney) {
    return (
      <ScreenContainer edges={['top', 'bottom']}>
        <StateView loading={query.isLoading || (!query.isError && resolvingJourney)} error={query.error} onRetry={() => query.refetch()} />
      </ScreenContainer>
    );
  }

  const restaurant = query.data;
  const priceLevel = formatPriceLevel(restaurant.averageTicket);
  const amenities = serviceAmenities(restaurant.serviceConfig);

  if (perPersonComanda) {
    return (
      <ScreenContainer edges={['bottom']}>
        <CasualDiningRestaurantView
          restaurant={restaurant}
          status={liveStatus.data}
          isFavorite={isFavorite}
          favoritePending={favorite.isPending}
          hasWaitlist={serviceTypeFor.features.virtualQueue}
          hasReservations={serviceTypeFor.features.reservations}
          activeSessionHere={activeSessionHere}
          tableNumber={session?.tableNumber}
          refreshControl={refreshControl}
          onBack={() => navigation.goBack()}
          onToggleFavorite={() => favorite.mutate()}
          onAction={handleCasualAction}
          onEnter={enterRestaurant}
          onReserve={openReserve}
          onLeaveTable={leaveTable}
        />
        <PhotoGalleryModal
          visible={galleryOpen}
          photos={restaurant.photos}
          onClose={() => setGalleryOpen(false)}
        />
      </ScreenContainer>
    );
  }

  if (individualCart) {
    return (
      <ScreenContainer edges={['bottom']}>
        <QuickServiceRestaurantView
          restaurant={restaurant}
          status={liveStatus.data}
          distanceLabel={distanceLabel}
          hoursLabel={hoursLabel}
          refreshControl={refreshControl}
          onBack={() => navigation.goBack()}
          onSkipTheLine={openMenu}
          onOrderOnSite={openMenu}
        />
      </ScreenContainer>
    );
  }

  if (tableWithGuests) {
    return (
      <ScreenContainer edges={['bottom']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={refreshControl}
          alwaysBounceVertical
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.fineHeroWrap}>
            <Image source={{ uri: restaurant.bannerUrl || restaurant.logoUrl || FALLBACK_IMAGE }} style={styles.fineHero} resizeMode="cover" />
            <LinearGradient
              pointerEvents="none"
              colors={['transparent', colors.background]}
              locations={[0, 1]}
              style={styles.fineHeroGradient}
            />
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

          <View style={styles.fineBody}>
            <Text style={styles.fineTitle}>{restaurant.name}</Text>
            {restaurant.description ? <Text style={styles.fineDescription}>{restaurant.description}</Text> : null}

            {activeSessionHere && (
              <TouchableOpacity onPress={leaveTable} accessibilityRole="button" style={styles.leaveTableRow}>
                <Ionicons name="exit-outline" size={14} color={colors.foregroundSecondary} />
                <Text style={styles.leaveTableText}>Mesa {session?.tableNumber} · Sair da mesa</Text>
              </TouchableOpacity>
            )}

            <View style={styles.fineMetaRow}>
              <View style={styles.metaItem}>
                <Ionicons name="star" size={16} color={colors.ratingGold} />
                <Text style={styles.fineMetaText}>{restaurant.rating.toFixed(1)} ({restaurant.totalReviews})</Text>
              </View>
              {distanceLabel ? (
                <View style={styles.metaItem}>
                  <Ionicons name="location-outline" size={16} color={colors.foregroundMuted} />
                  <Text style={styles.fineMetaText}>{distanceLabel}</Text>
                </View>
              ) : null}
              {priceLevel ? <Text style={styles.fineMetaText}>{priceLevel}</Text> : null}
            </View>

            {restaurant.address ? (
              <View style={styles.fineAddressRow}>
                <Ionicons name="location-outline" size={16} color={colors.foregroundMuted} />
                <Text style={styles.fineAddressText}>
                  {restaurant.city ? `${restaurant.address}, ${restaurant.city}` : restaurant.address}
                </Text>
              </View>
            ) : null}

            {hoursLabel ? (
              <View style={styles.hoursRow}>
                <Ionicons name="time-outline" size={16} color={colors.foregroundMuted} style={styles.hoursIcon} />
                <Text style={styles.hoursText}>{hoursLabel}</Text>
              </View>
            ) : null}

            {(amenities.length > 0 || restaurant.cuisineTypes.length > 0) ? (
              <View style={styles.fineAmenities}>
                {(amenities.length > 0 ? amenities : restaurant.cuisineTypes).map((item) => (
                  <View key={item} style={styles.fineAmenity}>
                    <Text style={styles.fineAmenityText}>{item}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {(serviceTypeFor.features.menu || serviceTypeFor.features.reservations) ? (
              <View style={styles.fineHint}>
                <Ionicons name="flash-outline" size={16} color={colors.primary} />
                <Text style={styles.fineHintText}>Escolha uma das experiências disponíveis</Text>
              </View>
            ) : null}

            <View style={styles.primaryRow}>
              {serviceTypeFor.features.menu && (
                <TouchableOpacity style={[styles.primaryBtn, styles.primaryBtnFilled]} onPress={openMenu} activeOpacity={0.85} accessibilityRole="button">
                  <Ionicons name="restaurant-outline" size={20} color={colors.primaryForeground} />
                  <Text style={styles.primaryBtnTextFilled}>Ver Cardápio</Text>
                </TouchableOpacity>
              )}
              {serviceTypeFor.features.reservations && (
                <TouchableOpacity style={[styles.primaryBtn, styles.primaryBtnOutline]} onPress={openReserve} activeOpacity={0.85} accessibilityRole="button">
                  <Ionicons name="calendar-outline" size={20} color={colors.foreground} />
                  <Text style={styles.primaryBtnTextOutline}>Reservar Mesa</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.secondaryRow}>
              {secondaryActions.map((action) => (
                <TouchableOpacity key={action.key} style={styles.secondaryBtn} onPress={action.onPress} activeOpacity={0.85} accessibilityRole="button">
                  <Ionicons name={action.icon} size={25} color={colors.primary} />
                  <Text style={styles.secondaryLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{action.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={refreshControl}
        alwaysBounceVertical
        showsVerticalScrollIndicator={false}
      >
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
          <View style={styles.titleRow}>
            <Text style={styles.title}>{restaurant.name}</Text>
            {serviceTypeFor.status === 'ready' && (
              <View style={styles.serviceBadge}>
                <Text style={styles.serviceBadgeText}>{serviceTypeFor.serviceName}</Text>
              </View>
            )}
          </View>
          {restaurant.description ? <Text style={styles.tagline}>{restaurant.description}</Text> : null}

          {activeSessionHere && (
            <TouchableOpacity onPress={leaveTable} accessibilityRole="button" style={styles.leaveTableRow}>
              <Ionicons name="exit-outline" size={14} color={colors.foregroundSecondary} />
              <Text style={styles.leaveTableText}>Mesa {session?.tableNumber} · Sair da mesa</Text>
            </TouchableOpacity>
          )}

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="star" size={16} color={colors.ratingGold} />
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
              <Ionicons name="time-outline" size={16} color={colors.foregroundMuted} style={styles.hoursIcon} />
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
            {serviceTypeFor.features.menu && (
              <TouchableOpacity style={[styles.primaryBtn, styles.primaryBtnFilled]} onPress={openMenu} activeOpacity={0.85} accessibilityRole="button">
                <Ionicons name="restaurant" size={20} color={colors.primaryForeground} />
                <Text style={styles.primaryBtnTextFilled}>Ver Cardápio</Text>
              </TouchableOpacity>
            )}
            {serviceTypeFor.features.reservations && (
              <TouchableOpacity style={[styles.primaryBtn, styles.primaryBtnOutline]} onPress={openReserve} activeOpacity={0.85} accessibilityRole="button">
                <Ionicons name="calendar-outline" size={20} color={colors.foreground} />
                <Text style={styles.primaryBtnTextOutline}>Reservar</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.secondaryRow}>
            {secondaryActions.map((action) => (
              <TouchableOpacity key={action.key} style={styles.secondaryBtn} onPress={action.onPress} activeOpacity={0.85} accessibilityRole="button">
                <Ionicons name={action.icon} size={26} color={colors.primary} />
                <Text style={styles.secondaryLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
