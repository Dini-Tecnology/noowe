/* Hallmark · pre-emit critique: P5 H5 E4 S5 R4 V5 */
/* Hallmark · macrostructure: Photographic · tone: warm utilitarian · anchor hue: orange */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { useVisitSession } from '../../contexts/VisitSessionContext';
import { useTableQrHandler } from '../../hooks/useTableQrHandler';
import { useTableInviteHandler } from '../../hooks/useTableInviteHandler';
import { takePendingTableQr } from '../../utils/pending-table-qr';
import { takePendingTableInvite } from '../../utils/pending-table-invite';
import customerBackend, { type CustomerRestaurant } from '../../services/customer-backend';
import {
  formatDistance,
  formatPriceLevel,
  getServiceTypePresentation,
  QUICK_RESTAURANT_ACTIONS,
} from './home-restaurant-ui';
import {
  cardBadges,
  casualDiningHeadline,
  DISCOVERY_FILTERS,
  openLabel,
  sortByFamilyMode,
  waitLabel,
} from './casual-dining-ui';
import { FINE_DINING_FILTERS } from './fine-dining-ui';
import { QUICK_SERVICE_FILTERS, type QuickServiceFilterKey } from './quick-service-ui';
import { distanceKm, rootNavigate, StateView, useQueryRefreshControl } from './shared';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80';

const SERVICE_TYPES: { id: string; label: string }[] = [
  { id: 'fine_dining', label: 'Fine Dining' },
  { id: 'casual_dining', label: 'Casual Dining' },
  { id: 'quick_service', label: 'Quick Service' },
];

const DEFAULT_MAP_REGION = { latitude: -23.5505, longitude: -46.6333 };
const GEOCODE_TIMEOUT_MS = 6000;

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export default function HomeScreen({ navigation }: any) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { session, selectRestaurant, leaveTable: leaveCurrentTable } = useVisitSession();
  const { handleQrScanned } = useTableQrHandler();
  const { handleInviteToken } = useTableInviteHandler();
  const [search, setSearch] = useState('');
  const [selectedServiceType, setSelectedServiceType] = useState<string | null>(null);
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [selectedQuickFilter, setSelectedQuickFilter] = useState<QuickServiceFilterKey | null>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [cityLabel, setCityLabel] = useState<string | null>(null);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [mapDraft, setMapDraft] = useState<{ latitude: number; longitude: number } | null>(null);
  const [addressQuery, setAddressQuery] = useState('');
  const [addressSearching, setAddressSearching] = useState(false);
  const [confirmingPin, setConfirmingPin] = useState(false);
  const [favoriteOverrides, setFavoriteOverrides] = useState<Record<string, boolean>>({});

  // A table QR opened outside the in-app scanner (OS camera, cold launch)
  // lands here once the app — and its providers — are mounted. See
  // app/t/[code].tsx, which stashes it and redirects into the app.
  useEffect(() => {
    (async () => {
      const pending = await takePendingTableQr();
      if (!pending) return;
      const outcome = await handleQrScanned(pending);
      if (outcome.ok) {
        rootNavigate(navigation, 'Menu', { restaurantId: outcome.restaurantId });
      } else if (outcome.reason === 'invalid') {
        Alert.alert('QR inválido', 'Este QR Code não é válido ou expirou.');
      } else if (outcome.reason === 'table_unavailable') {
        Alert.alert('Mesa indisponível', 'Esta mesa está reservada para outro cliente ou ainda não foi liberada.');
      } else if (outcome.reason === 'active_account') {
        Alert.alert('Conta aberta', 'Feche a conta da mesa atual antes de entrar em outra mesa.');
      } else {
        Alert.alert('Sem conexão', 'Não foi possível validar o QR agora. Tente escanear novamente.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A table-invite link ("Convidar" from Minha Comanda) opened outside the
  // app follows the same stash-and-consume hand-off. See
  // app/t/invite/[token].tsx.
  useEffect(() => {
    (async () => {
      const token = await takePendingTableInvite();
      if (!token) return;
      const outcome = await handleInviteToken(token);
      if (outcome.ok) {
        rootNavigate(navigation, 'Menu', { restaurantId: outcome.restaurantId });
      } else if (outcome.reason === 'invalid') {
        Alert.alert('Convite inválido', 'Este link de convite não é válido ou expirou.');
      } else {
        Alert.alert('Sem conexão', 'Não foi possível entrar na mesa agora. Tente novamente.');
      }
    })();
    // Runs once per HomeScreen mount — a pending QR is one-shot by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const isCasualDining = selectedServiceType === 'casual_dining';
  const isFineDiningTab = selectedServiceType === 'fine_dining';
  const isQuickServiceTab = selectedServiceType === 'quick_service';
  // Amenity filters only exist for casual dining and fine dining; they're
  // dropped (server-side too) as soon as the customer leaves those tabs.
  const amenityFilters = isCasualDining || isFineDiningTab ? selectedAmenities : [];
  const activeDiscoveryFilters = isCasualDining
    ? DISCOVERY_FILTERS
    : isFineDiningTab
      ? FINE_DINING_FILTERS
      : isQuickServiceTab
        ? QUICK_SERVICE_FILTERS
        : [];
  const activeQuickFilter = isQuickServiceTab
    ? QUICK_SERVICE_FILTERS.find((filter) => filter.key === selectedQuickFilter)
    : undefined;

  const restaurants = useQuery({
    queryKey: ['restaurants', search, selectedServiceType, amenityFilters, selectedQuickFilter],
    queryFn: () => customerBackend.listRestaurants({
      search,
      serviceType: selectedServiceType ?? undefined,
      amenities: amenityFilters.length ? amenityFilters : undefined,
      cuisine: activeQuickFilter?.cuisine,
      skipTheLine: activeQuickFilter?.key === 'skip_the_line' ? true : undefined,
      limit: 30,
    }),
  });
  // The chip row must keep showing every service type present in the catalog,
  // not just the one currently filtered on, so it's driven by an unfiltered
  // query of its own.
  const serviceTypeCatalog = useQuery({
    queryKey: ['restaurants', 'service-types', search],
    queryFn: () => customerBackend.listRestaurants({ search, limit: 50 }),
  });
  const unread = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => customerBackend.getUnreadNotificationCount(),
  });
  const favorites = useQuery({
    queryKey: ['favorites'],
    queryFn: () => customerBackend.listFavorites(),
  });
  const refreshControl = useQueryRefreshControl([restaurants, unread, favorites]);

  const availableServiceTypes = useMemo(() => {
    const present = new Set(serviceTypeCatalog.data?.data.map((r) => r.serviceType) ?? []);
    return SERVICE_TYPES.filter((type) => present.has(type.id));
  }, [serviceTypeCatalog.data]);

  const rows = useMemo(() => {
    const list = restaurants.data?.data ?? [];
    let filtered = cityLabel
      ? list.filter((r) => r.city?.trim().toLowerCase() === cityLabel.trim().toLowerCase())
      : list;
    if (location) {
      filtered = [...filtered].sort((a, b) => {
        if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return 0;
        return distanceKm(location, { lat: a.lat, lng: a.lng }) - distanceKm(location, { lat: b.lat, lng: b.lng });
      });
    }
    // "Restaurantes com Modo Família ficam em destaque" — a promise the list
    // has to keep, so family mode outranks distance on the casual tab.
    return isCasualDining ? sortByFamilyMode(filtered) : filtered;
  }, [restaurants.data, cityLabel, location, isCasualDining]);

  const liveStatus = useQuery({
    queryKey: ['restaurants-live-status', rows.map((r) => r.id)],
    queryFn: () => customerBackend.listRestaurantsLiveStatus(rows.map((r) => r.id)),
    enabled: isCasualDining && rows.length > 0,
    staleTime: 60 * 1000,
  });

  const featured = rows[0];
  const nearby = rows.slice(1);
  const featuredIsFavorite = featured
    ? favoriteOverrides[featured.id] ?? favorites.data?.some((item) => item.id === featured.id) ?? false
    : false;

  const favorite = useMutation({
    mutationFn: ({ restaurantId, nextFavorite }: {
      restaurantId: string;
      nextFavorite: boolean;
      previousFavorite: boolean;
    }) => customerBackend.setFavorite(restaurantId, nextFavorite),
    onMutate: ({ restaurantId, nextFavorite }) => {
      setFavoriteOverrides((current) => ({ ...current, [restaurantId]: nextFavorite }));
    },
    onError: (_error, { restaurantId, previousFavorite }) => {
      setFavoriteOverrides((current) => ({ ...current, [restaurantId]: previousFavorite }));
      Alert.alert('Favoritos', 'Não foi possível atualizar este favorito. Tente novamente.');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['favorites'] });
    },
  });

  const applyCoords = useCallback(async (coords: { latitude: number; longitude: number }) => {
    setLocation(coords);
    const geo = await withTimeout(Location.reverseGeocodeAsync(coords), GEOCODE_TIMEOUT_MS);
    const city = geo?.[0]?.city?.trim() || null;
    setCityLabel(city);
    return city;
  }, []);

  const useMyLocation = useCallback(async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Localização', 'Permissão não concedida.');
      return;
    }
    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    await applyCoords(current.coords);
    setLocationModalOpen(false);
  }, [applyCoords]);

  const openLocationModal = useCallback(() => {
    setMapDraft(location ?? DEFAULT_MAP_REGION);
    setAddressQuery('');
    setLocationModalOpen(true);
  }, [location]);

  const confirmMapPin = useCallback(async () => {
    if (!mapDraft) return;
    setConfirmingPin(true);
    try {
      await applyCoords(mapDraft);
      setLocationModalOpen(false);
    } finally {
      setConfirmingPin(false);
    }
  }, [mapDraft, applyCoords]);

  const searchAddress = useCallback(async () => {
    const query = addressQuery.trim();
    if (!query) return;
    setAddressSearching(true);
    try {
      const results = await withTimeout(Location.geocodeAsync(query), GEOCODE_TIMEOUT_MS);
      const first = results?.[0];
      if (!first) {
        Alert.alert('Localização', 'Endereço não encontrado.');
        return;
      }
      setMapDraft({ latitude: first.latitude, longitude: first.longitude });
    } finally {
      setAddressSearching(false);
    }
  }, [addressQuery]);

  const clearCityFilter = useCallback(() => {
    setCityLabel(null);
    setLocation(null);
  }, []);

  const open = useCallback(
    (restaurant: CustomerRestaurant) => {
      const proceed = async () => {
        await selectRestaurant(restaurant.id);
        rootNavigate(navigation, 'Restaurant', { restaurantId: restaurant.id });
      };
      const hasOtherActiveTable = !!session?.tableSessionId && session.restaurantId !== restaurant.id;
      if (hasOtherActiveTable) {
        Alert.alert(
          'Trocar de restaurante',
          'Você está com uma mesa aberta em outro restaurante. Ao continuar, essa sessão de mesa será encerrada.',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Trocar', style: 'destructive', onPress: () => { void proceed(); } },
          ],
        );
        return;
      }
      void proceed();
    },
    [navigation, selectRestaurant, session],
  );

  const selectServiceType = useCallback((typeId: string) => {
    setSelectedServiceType((current) => {
      const next = current === typeId ? null : typeId;
      if (next !== 'casual_dining' && next !== 'fine_dining') setSelectedAmenities([]);
      if (next !== 'quick_service') setSelectedQuickFilter(null);
      return next;
    });
  }, []);

  const toggleAmenity = useCallback((key: string) => {
    setSelectedAmenities((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }, []);

  // Quick-service sub-tags are single-select (radio-like) — the mockup only
  // ever highlights one chip at a time, unlike casual/fine dining's amenities.
  const selectQuickFilter = useCallback((key: QuickServiceFilterKey) => {
    setSelectedQuickFilter((current) => (current === key ? null : key));
  }, []);

  const distanceLabelFor = useCallback(
    (restaurant: CustomerRestaurant) => {
      if (!location || restaurant.lat == null || restaurant.lng == null) return null;
      return formatDistance(distanceKm(location, { lat: restaurant.lat, lng: restaurant.lng }));
    },
    [location],
  );

  const toggleFeaturedFavorite = useCallback(() => {
    if (!featured || favorite.isPending) return;
    favorite.mutate({
      restaurantId: featured.id,
      nextFavorite: !featuredIsFavorite,
      previousFavorite: featuredIsFavorite,
    });
  }, [favorite, featured, featuredIsFavorite]);

  const openQuickAction = useCallback(
    (route: typeof QUICK_RESTAURANT_ACTIONS[number]['route']) => {
      if (!featured) return;
      if (route === 'QrScanner') {
        rootNavigate(navigation, route);
        return;
      }
      rootNavigate(navigation, route, { restaurantId: featured.id });
    },
    [featured, navigation],
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        scrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
        header: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 12,
        },
        greeting: { color: colors.foregroundSecondary, fontSize: 14, marginBottom: 4 },
        headerTitle: { color: colors.foreground, fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
        headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
        headerActionBtn: { padding: 8 },
        tableBanner: {
          flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14,
          backgroundColor: colors.backgroundSecondary, marginBottom: 12,
        },
        tableBannerMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
        tableBannerText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.primary },
        tableBannerLeave: { fontSize: 13, fontWeight: '700', color: colors.primary, textDecorationLine: 'underline' },
        badge: {
          position: 'absolute',
          top: 4,
          right: 4,
          minWidth: 18,
          height: 18,
          borderRadius: 9,
          backgroundColor: colors.error,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 4,
        },
        badgeText: { color: colors.primaryForeground, fontSize: 10, fontWeight: '700' },
        searchWrap: {
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: 12,
          paddingHorizontal: 14,
          height: 48,
          borderRadius: 14,
          backgroundColor: colors.backgroundTertiary,
          gap: 10,
        },
        searchInput: { flex: 1, fontSize: 15, color: colors.foreground, padding: 0 },
        locateIconBtn: { padding: 2 },
        cityBanner: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          alignSelf: 'flex-start',
          marginBottom: 12,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 10,
          backgroundColor: colors.backgroundTertiary,
        },
        cityBannerText: { fontSize: 12, fontWeight: '600', color: colors.foregroundSecondary },
        modalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
        modalKeyboardAvoider: { flexShrink: 1 },
        modalSheet: {
          backgroundColor: colors.background,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          maxHeight: '90%',
        },
        modalScrollContent: {
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 24,
        },
        modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
        modalTitle: { fontSize: 17, fontWeight: '700', color: colors.foreground },
        useGpsRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingVertical: 12,
          paddingHorizontal: 12,
          borderRadius: 12,
          backgroundColor: colors.backgroundTertiary,
          marginBottom: 12,
        },
        useGpsText: { fontSize: 14, fontWeight: '600', color: colors.foreground },
        mapView: { width: '100%', height: 220, borderRadius: 14, overflow: 'hidden', marginBottom: 12 },
        confirmMapBtn: {
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 12,
          borderRadius: 12,
          backgroundColor: colors.primary,
          marginBottom: 16,
        },
        confirmMapText: { fontSize: 14, fontWeight: '700', color: colors.primaryForeground },
        addressSearchBar: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.backgroundTertiary,
          borderRadius: 12,
          paddingHorizontal: 14,
          height: 46,
          gap: 10,
        },
        addressSearchInput: { flex: 1, fontSize: 14, color: colors.foreground },
        chipsRow: { gap: 8, paddingBottom: 4 },
        chip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, backgroundColor: colors.backgroundTertiary },
        chipSelected: { backgroundColor: colors.primary },
        chipText: { fontSize: 13, fontWeight: '600', color: colors.foregroundSecondary },
        chipTextSelected: { color: colors.primaryForeground },
        chipScroll: { marginBottom: 16 },
        featuredCard: {
          marginBottom: 12,
          borderRadius: 20,
          overflow: 'hidden',
          height: 220,
          backgroundColor: colors.backgroundTertiary,
        },
        featuredImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
        featuredGradient: { ...StyleSheet.absoluteFillObject },
        featuredTopRow: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 12,
        },
        tapBadge: {
          minHeight: 32,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          paddingHorizontal: 10,
          borderRadius: 18,
          backgroundColor: colors.primary,
        },
        tapBadgeText: { color: colors.primaryForeground, fontSize: 12, fontWeight: '700' },
        favoriteButton: {
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.overlayLight,
        },
        featuredBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16 },
        ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
        ratingText: { color: colors.primaryForeground, fontSize: 14, fontWeight: '600' },
        featuredName: { color: colors.primaryForeground, fontSize: 22, fontWeight: '700', marginBottom: 4 },
        featuredMeta: { color: colors.primaryForeground, fontSize: 14, opacity: 0.9 },
        quickActions: { flexDirection: 'row', gap: 8, marginBottom: 24 },
        quickAction: {
          flex: 1,
          minWidth: 0,
          minHeight: 84,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 3,
          paddingVertical: 12,
          borderRadius: 16,
          backgroundColor: colors.backgroundSecondary,
        },
        quickActionLabel: {
          width: '100%',
          marginTop: 8,
          color: colors.foregroundSecondary,
          fontSize: 11,
          fontWeight: '500',
          textAlign: 'center',
        },
        sectionTitle: { marginBottom: 12, color: colors.foreground, fontSize: 18, fontWeight: '700' },
        nearbyItem: {
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: 10,
          padding: 14,
          borderRadius: 16,
          backgroundColor: colors.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        nearbyIcon: {
          width: 52,
          height: 52,
          borderRadius: 14,
          backgroundColor: colors.backgroundSecondary,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 14,
        },
        nearbyInfo: { flex: 1 },
        nearbyName: { color: colors.foreground, fontWeight: '700', fontSize: 16, marginBottom: 4 },
        nearbySub: { color: colors.foregroundSecondary, fontSize: 14 },
        nearbyRating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
        nearbyRatingText: { color: colors.foreground, fontWeight: '600', fontSize: 14 },
        nearbyTrailing: { alignItems: 'flex-end', gap: 2 },
        nearbyWait: { color: colors.foregroundMuted, fontSize: 12 },
        filterChip: {
          flexDirection: 'row', alignItems: 'center', gap: 6,
          paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
          backgroundColor: colors.backgroundTertiary,
        },
        familyBanner: {
          flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16,
          paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14,
          backgroundColor: colors.backgroundSecondary,
          borderWidth: 1, borderColor: colors.primaryLight,
        },
        familyBannerText: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.primary },
        casualCard: {
          marginBottom: 14, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.card,
          borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
        },
        casualPhotoWrap: { height: 150, backgroundColor: colors.backgroundTertiary },
        casualPhoto: { width: '100%', height: '100%' },
        casualBadges: {
          position: 'absolute', top: 12, right: 12, flexDirection: 'row', gap: 6,
        },
        casualBadge: {
          flexDirection: 'row', alignItems: 'center', gap: 4,
          paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12,
        },
        casualBadgeText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
        casualWaitPill: {
          position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 5,
          paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: colors.card,
        },
        casualWaitText: { fontSize: 12, fontWeight: '600', color: colors.foreground },
        casualBody: { padding: 16, gap: 6 },
        casualTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
        casualName: { flex: 1, fontSize: 18, fontWeight: '700', color: colors.foreground },
        casualMeta: { fontSize: 14, color: colors.foregroundSecondary },
        casualFooterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        casualReviews: { fontSize: 13, color: colors.foregroundMuted },
        casualOpen: { fontSize: 13, fontWeight: '600', color: colors.success },
        casualClosed: { fontSize: 13, fontWeight: '600', color: colors.foregroundMuted },
      }),
    [colors],
  );

  return (
    <ScreenContainer edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={refreshControl}
        alwaysBounceVertical
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{getTimeGreeting()}</Text>
            <Text style={styles.headerTitle}>
              {isCasualDining ? casualDiningHeadline() : 'Descubra experiências'}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={() => rootNavigate(navigation, 'QrScanner')}
              accessibilityRole="button"
              accessibilityLabel="Escanear QR da mesa"
            >
              <Ionicons name="qr-code-outline" size={24} color={colors.foreground} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={() => rootNavigate(navigation, 'Notifications')}
              accessibilityRole="button"
              accessibilityLabel="Notificações"
            >
              <Ionicons name="notifications-outline" size={26} color={colors.foreground} />
              {(unread.data ?? 0) > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unread.data}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {session?.tableSessionId && (
          <View style={styles.tableBanner}>
            <TouchableOpacity
              style={styles.tableBannerMain}
              onPress={() => rootNavigate(navigation, 'Restaurant', { restaurantId: session.restaurantId })}
              accessibilityRole="button"
            >
              <Ionicons name="restaurant-outline" size={18} color={colors.primary} />
              <Text style={styles.tableBannerText}>Mesa {session.tableNumber} aberta</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={leaveTable} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.tableBannerLeave}>Sair</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={20} color={colors.foregroundMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar restaurantes…"
            placeholderTextColor={colors.foregroundMuted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            accessibilityLabel="Buscar restaurantes"
          />
          <TouchableOpacity
            style={styles.locateIconBtn}
            onPress={openLocationModal}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Escolher localização"
          >
            <Ionicons name="location" size={20} color={cityLabel ? colors.primary : colors.foregroundMuted} />
          </TouchableOpacity>
        </View>

        {cityLabel && (
          <TouchableOpacity style={styles.cityBanner} onPress={clearCityFilter} accessibilityRole="button">
            <Ionicons name="location" size={12} color={colors.foregroundSecondary} />
            <Text style={styles.cityBannerText}>Restaurantes em {cityLabel}</Text>
            <Ionicons name="close" size={12} color={colors.foregroundSecondary} />
          </TouchableOpacity>
        )}

        <Modal visible={locationModalOpen} animationType="slide" transparent onRequestClose={() => setLocationModalOpen(false)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setLocationModalOpen(false)}>
            <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.modalKeyboardAvoider}
              >
                <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalScrollContent}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Escolher localização</Text>
                    <TouchableOpacity onPress={() => setLocationModalOpen(false)} hitSlop={12} accessibilityRole="button">
                      <Ionicons name="close" size={22} color={colors.foreground} />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity style={styles.useGpsRow} onPress={useMyLocation} activeOpacity={0.85} accessibilityRole="button">
                    <Ionicons name="locate" size={18} color={colors.primary} />
                    <Text style={styles.useGpsText}>Usar minha localização atual</Text>
                  </TouchableOpacity>

                  {mapDraft && (
                    <MapView
                      style={styles.mapView}
                      initialRegion={{ ...mapDraft, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
                      onPress={(e) => setMapDraft(e.nativeEvent.coordinate)}
                    >
                      <Marker
                        draggable
                        coordinate={mapDraft}
                        onDragEnd={(e) => setMapDraft(e.nativeEvent.coordinate)}
                      />
                    </MapView>
                  )}

                  <TouchableOpacity
                    style={[styles.confirmMapBtn, confirmingPin && { opacity: 0.7 }]}
                    onPress={confirmMapPin}
                    disabled={confirmingPin}
                    activeOpacity={0.9}
                    accessibilityRole="button"
                  >
                    <Text style={styles.confirmMapText}>
                      {confirmingPin ? 'Confirmando…' : 'Confirmar esta localização'}
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.addressSearchBar}>
                    <Ionicons name="search" size={18} color={colors.foregroundMuted} />
                    <TextInput
                      style={styles.addressSearchInput}
                      placeholder="Buscar endereço ou cidade…"
                      placeholderTextColor={colors.foregroundMuted}
                      value={addressQuery}
                      onChangeText={setAddressQuery}
                      onSubmitEditing={searchAddress}
                      returnKeyType="search"
                    />
                    {addressSearching && <Ionicons name="hourglass-outline" size={16} color={colors.foregroundMuted} />}
                  </View>
                </ScrollView>
              </KeyboardAvoidingView>
            </Pressable>
          </Pressable>
        </Modal>

        {availableServiceTypes.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow} style={styles.chipScroll}>
            {availableServiceTypes.map((type) => {
              const selected = selectedServiceType === type.id;
              return (
                <TouchableOpacity
                  key={type.id}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => selectServiceType(type.id)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{type.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {activeDiscoveryFilters.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
            style={styles.chipScroll}
            accessibilityLabel={
              isCasualDining
                ? 'Filtros de restaurantes casual dining'
                : isQuickServiceTab
                  ? 'Filtros de restaurantes quick service'
                  : 'Filtros de restaurantes fine dining'
            }
          >
            {activeDiscoveryFilters.map((filter) => {
              const selected = isQuickServiceTab
                ? selectedQuickFilter === filter.key
                : selectedAmenities.includes(filter.key);
              return (
                <TouchableOpacity
                  key={filter.key}
                  style={[styles.filterChip, selected && styles.chipSelected]}
                  onPress={() =>
                    isQuickServiceTab
                      ? selectQuickFilter(filter.key as QuickServiceFilterKey)
                      : toggleAmenity(filter.key)
                  }
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Ionicons
                    name={filter.icon}
                    size={14}
                    color={selected ? colors.primaryForeground : colors.foregroundSecondary}
                  />
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{filter.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {isCasualDining && (
          <View style={styles.familyBanner}>
            <Ionicons name="flash-outline" size={16} color={colors.primary} />
            <Text style={styles.familyBannerText}>Restaurantes com Modo Família ficam em destaque</Text>
          </View>
        )}

        <StateView
          loading={restaurants.isLoading}
          error={restaurants.error}
          onRetry={() => restaurants.refetch()}
          empty={rows.length === 0 && !restaurants.isLoading ? 'Nenhum restaurante disponível no momento.' : undefined}
          emptyIcon="restaurant-outline"
        />

        {featured && isCasualDining && (
          <TouchableOpacity
            style={styles.casualCard}
            activeOpacity={0.92}
            onPress={() => open(featured)}
            accessibilityRole="button"
            accessibilityLabel={`${featured.name}, ${featured.rating.toFixed(1)} estrelas`}
          >
            <View style={styles.casualPhotoWrap}>
              <Image
                source={{ uri: featured.bannerUrl || featured.logoUrl || FALLBACK_IMAGE }}
                style={styles.casualPhoto}
                resizeMode="cover"
              />
              <View style={styles.casualBadges}>
                {cardBadges(featured).map((badge) => (
                  <View
                    key={badge.key}
                    style={[
                      styles.casualBadge,
                      { backgroundColor: badge.tone === 'kids' ? colors.success : colors.primary },
                    ]}
                  >
                    <Ionicons
                      name={badge.tone === 'kids' ? 'happy-outline' : 'paw-outline'}
                      size={11}
                      color="#FFFFFF"
                    />
                    <Text style={styles.casualBadgeText}>{badge.label}</Text>
                  </View>
                ))}
              </View>
              {waitLabel(liveStatus.data?.[featured.id]) && (
                <View style={styles.casualWaitPill}>
                  <Ionicons name="time-outline" size={13} color={colors.foregroundSecondary} />
                  <Text style={styles.casualWaitText}>{waitLabel(liveStatus.data?.[featured.id])}</Text>
                </View>
              )}
            </View>
            <View style={styles.casualBody}>
              <View style={styles.casualTitleRow}>
                <Text style={styles.casualName} numberOfLines={1}>{featured.name}</Text>
                <View style={styles.nearbyRating}>
                  <Ionicons name="star" size={15} color={colors.ratingGold} />
                  <Text style={styles.nearbyRatingText}>{featured.rating.toFixed(1)}</Text>
                </View>
              </View>
              <Text style={styles.casualMeta} numberOfLines={1}>
                {[
                  'Casual Dining',
                  featured.cuisineTypes[0],
                  formatPriceLevel(featured.averageTicket),
                  distanceLabelFor(featured),
                ].filter(Boolean).join(' · ')}
              </Text>
              <View style={styles.casualFooterRow}>
                <Text style={styles.casualReviews}>{featured.totalReviews} avaliações</Text>
                {openLabel(liveStatus.data?.[featured.id]) && (
                  <>
                    <Text style={styles.casualReviews}>·</Text>
                    <Text
                      style={
                        liveStatus.data?.[featured.id]?.isOpen ? styles.casualOpen : styles.casualClosed
                      }
                    >
                      {openLabel(liveStatus.data?.[featured.id])}
                    </Text>
                  </>
                )}
              </View>
            </View>
          </TouchableOpacity>
        )}

        {featured && !isCasualDining && (
          <TouchableOpacity
            style={styles.featuredCard}
            activeOpacity={0.92}
            onPress={() => open(featured)}
            accessibilityRole="button"
            accessibilityLabel={`${featured.name}, ${featured.rating.toFixed(1)} estrelas`}
          >
            <Image source={{ uri: featured.bannerUrl || featured.logoUrl || FALLBACK_IMAGE }} style={styles.featuredImage} resizeMode="cover" />
            <LinearGradient colors={['transparent', colors.overlay]} style={styles.featuredGradient} />
            <View style={styles.featuredTopRow} pointerEvents="box-none">
              <View style={styles.tapBadge}>
                <Ionicons name="flash-outline" size={14} color={colors.primaryForeground} />
                <Text style={styles.tapBadgeText}>Toque aqui</Text>
              </View>
              <TouchableOpacity
                style={styles.favoriteButton}
                onPress={toggleFeaturedFavorite}
                disabled={favorite.isPending}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={featuredIsFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                accessibilityState={{ selected: featuredIsFavorite, busy: favorite.isPending }}
              >
                <Ionicons
                  name={featuredIsFavorite ? 'heart' : 'heart-outline'}
                  size={24}
                  color={colors.primaryForeground}
                />
              </TouchableOpacity>
            </View>
            <View style={styles.featuredBottom}>
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={16} color={colors.ratingGold} />
                <Text style={styles.ratingText}>
                  {featured.rating.toFixed(1)} ({featured.totalReviews})
                </Text>
              </View>
              <Text style={styles.featuredName}>{featured.name}</Text>
              <Text style={styles.featuredMeta}>
                {[
                  featured.cuisineTypes[0] ?? getServiceTypePresentation(featured.serviceType).label,
                  formatPriceLevel(featured.averageTicket),
                ].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {featured && !isCasualDining && (
          <View style={styles.quickActions} accessibilityLabel="Atalhos do restaurante em destaque">
            {QUICK_RESTAURANT_ACTIONS.map((action) => (
              <TouchableOpacity
                key={action.key}
                style={styles.quickAction}
                onPress={() => openQuickAction(action.route)}
                activeOpacity={0.76}
                accessibilityRole="button"
                accessibilityLabel={action.label}
              >
                <Ionicons name={action.icon} size={25} color={colors.primary} />
                <Text
                  style={styles.quickActionLabel}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {nearby.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Perto de você</Text>
            {nearby.map((item) => {
              const serviceType = getServiceTypePresentation(item.serviceType);
              const status = liveStatus.data?.[item.id];
              const subtitle = isCasualDining
                ? [
                    item.cuisineTypes[0] ?? serviceType.label,
                    formatPriceLevel(item.averageTicket),
                    distanceLabelFor(item),
                  ].filter(Boolean).join(' · ')
                : item.cuisineTypes[0] ?? serviceType.label;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.nearbyItem}
                  onPress={() => open(item)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name}, ${serviceType.label}, ${item.rating.toFixed(1)} estrelas`}
                >
                  <View style={styles.nearbyIcon}>
                    <Ionicons name={serviceType.icon} size={26} color={colors.primary} />
                  </View>
                  <View style={styles.nearbyInfo}>
                    <Text style={styles.nearbyName}>{item.name}</Text>
                    <Text style={styles.nearbySub}>{subtitle}</Text>
                  </View>
                  <View style={styles.nearbyTrailing}>
                    <View style={styles.nearbyRating}>
                      <Ionicons name="star" size={14} color={colors.ratingGold} />
                      <Text style={styles.nearbyRatingText}>{item.rating.toFixed(1)}</Text>
                    </View>
                    {isCasualDining && status?.isOpen && status.estimatedWaitMinutes > 0 && (
                      <Text style={styles.nearbyWait}>{status.estimatedWaitMinutes} min</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
