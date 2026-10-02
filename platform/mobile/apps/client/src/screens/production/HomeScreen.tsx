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
import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { LIQUID_GLASS_BOTTOM_NAV_OFFSET } from '@okinawa/shared/components/LiquidGlassBottomNav';
import { FloatingCartBar } from '../../components/cart/FloatingCartBar';
import { DevTableScanButton } from '../../components/dev/DevTableScanButton';
import IncomingTableInviteBanner from '../../components/table/IncomingTableInviteBanner';
import { useVisitSession } from '../../contexts/VisitSessionContext';
import { showTableQrOutcome } from '../../hooks/qr-scan-outcome';
import { useTableQrHandler } from '../../hooks/useTableQrHandler';
import { useTableInviteHandler } from '../../hooks/useTableInviteHandler';
import { takePendingTableQr } from '../../utils/pending-table-qr';
import { takePendingTableInvite } from '../../utils/pending-table-invite';
import customerBackend, { type CustomerRestaurant } from '../../services/customer-backend';
import {
  featuredScore,
  formatAveragePrice,
  formatDistance,
  formatRating,
  getServiceTypePresentation,
  hasRating,
} from './home-restaurant-ui';
import { DISCOVERY_FILTERS } from './casual-dining-ui';
import { FINE_DINING_FILTERS } from './fine-dining-ui';
import { QUICK_SERVICE_FILTERS, type QuickServiceFilterKey } from './quick-service-ui';
import { useRestorePaymentConfirmation } from '../../hooks/useRestorePaymentConfirmation';
import { distanceKm, restaurantRowStyles, rootNavigate, StateView, useQueryRefreshControl, tableLabel } from './shared';

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
  useRestorePaymentConfirmation(navigation);
  const colors = useColors();
  const { session, selectRestaurant, refreshSession, leaveTable: leaveCurrentTable } = useVisitSession();
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

  // A table QR opened outside the in-app scanner (OS camera, cold launch)
  // lands here once the app — and its providers — are mounted. See
  // app/t/[code].tsx, which stashes it and redirects into the app.
  useEffect(() => {
    (async () => {
      const pending = await takePendingTableQr();
      if (!pending) return;
      const outcome = await handleQrScanned(pending);
      showTableQrOutcome(outcome, {
        onOpened: (restaurantId) => rootNavigate(navigation, 'Menu', { restaurantId }),
        onRetry: () => {},
        onOpenAccount: () => {
          void (async () => {
            try {
              const active = await refreshSession();
              if (active) rootNavigate(navigation, 'FecharConta', { tableSessionId: active.tableSessionId });
            } catch {
              Alert.alert('Não foi possível abrir a conta', 'Verifique a conexão e tente novamente.');
            }
          })();
        },
      });
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
      `Encerrar sua sessão na ${tableLabel(session?.tableNumber)}?`,
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
  // The service-type chip still narrows the list, but the layout below is the
  // Fine Dining one for every tab now — no more branch-by-service-model here.
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
  const refreshControl = useQueryRefreshControl([restaurants, unread]);

  const availableServiceTypes = useMemo(() => {
    const present = new Set(serviceTypeCatalog.data?.data.map((r) => r.serviceType) ?? []);
    return SERVICE_TYPES.filter((type) => present.has(type.id));
  }, [serviceTypeCatalog.data]);

  // "Ordem por avaliação e proximidade" combinadas numa nota única, em vez de
  // desempate: a mesma fórmula que antes escolhia o destaque, agora ordena a
  // lista inteira. Sem localização, sobra só a avaliação.
  const rows = useMemo(() => {
    const list = restaurants.data?.data ?? [];
    const filteredByCity = cityLabel
      ? list.filter((r) => r.city?.trim().toLowerCase() === cityLabel.trim().toLowerCase())
      : list;
    // cuisine_types is legacy JSONB in the remote schema. Filtering it through
    // PostgREST's containment operator fails on some deployed shapes, so the
    // bounded quick-service result set is filtered safely on the client.
    const cuisine = activeQuickFilter?.cuisine?.trim().toLocaleLowerCase('pt-BR');
    const filtered = cuisine
      ? filteredByCity.filter((restaurant) =>
          restaurant.cuisineTypes.some((value) => value.trim().toLocaleLowerCase('pt-BR') === cuisine),
        )
      : filteredByCity;
    const scored = filtered.map((restaurant) => {
      const distance = location && restaurant.lat != null && restaurant.lng != null
        ? distanceKm(location, { lat: restaurant.lat, lng: restaurant.lng })
        : null;
      return { restaurant, score: featuredScore(restaurant, distance), reviews: restaurant.totalReviews };
    });
    scored.sort((a, b) => (b.score - a.score) || (b.reviews - a.reviews));
    return scored.map((entry) => entry.restaurant);
  }, [restaurants.data, cityLabel, location, activeQuickFilter?.cuisine]);

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
      current.includes(key) ? [] : [key],
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

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        scrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: LIQUID_GLASS_BOTTOM_NAV_OFFSET + 16 },
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
        sectionTitle: { marginBottom: 12, color: colors.foreground, fontSize: 18, fontWeight: '700' },
        ...restaurantRowStyles(colors),
        nearbyRating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
        nearbyRatingText: { color: colors.foreground, fontWeight: '600', fontSize: 14 },
        filterChip: {
          flexDirection: 'row', alignItems: 'center', gap: 6,
          paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
          backgroundColor: colors.backgroundTertiary,
        },
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
            <Text style={styles.headerTitle}>Descubra experiências</Text>
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

        <DevTableScanButton
          onOpened={(restaurantId) => rootNavigate(navigation, 'Menu', { restaurantId })}
          onOpenAccount={(tableSessionId) => rootNavigate(navigation, 'FecharConta', { tableSessionId })}
        />

        <IncomingTableInviteBanner
          onJoined={(visit) => rootNavigate(navigation, 'Menu', { restaurantId: visit.restaurantId })}
        />

        {session?.tableSessionId && (
          <View style={styles.tableBanner}>
            <TouchableOpacity
              style={styles.tableBannerMain}
              onPress={() => rootNavigate(navigation, 'Restaurant', { restaurantId: session.restaurantId })}
              accessibilityRole="button"
            >
              <Ionicons name="restaurant-outline" size={18} color={colors.primary} />
              <Text style={styles.tableBannerText}>{tableLabel(session.tableNumber)} aberta</Text>
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

        <StateView
          loading={restaurants.isLoading}
          error={restaurants.error}
          onRetry={() => restaurants.refetch()}
          empty={rows.length === 0 && !restaurants.isLoading ? 'Nenhum restaurante disponível no momento.' : undefined}
          emptyIcon="restaurant-outline"
        />

        {rows.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Perto de você</Text>
            {rows.map((item) => {
              const serviceType = getServiceTypePresentation(item.serviceType);
              // Preço médio cadastrado pelo restaurante; sem cadastro, a linha não mostra preço.
              const subtitle = [
                item.cuisineTypes[0] ?? serviceType.label,
                formatAveragePrice(item.averagePriceCents),
                distanceLabelFor(item),
              ].filter(Boolean).join(' · ');
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.nearbyItem}
                  onPress={() => open(item)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name}, ${serviceType.label}, ${formatRating(item.rating, item.totalReviews)}`}
                >
                  {item.bannerUrl || item.logoUrl ? (
                    <Image source={{ uri: item.bannerUrl || item.logoUrl || undefined }} style={styles.nearbyPhoto} resizeMode="cover" />
                  ) : (
                    <View style={styles.nearbyIcon}>
                      <Ionicons name={serviceType.icon} size={26} color={colors.primary} />
                    </View>
                  )}
                  <View style={styles.nearbyInfo}>
                    <Text style={styles.nearbyName}>{item.name}</Text>
                    <Text style={styles.nearbySub}>{subtitle}</Text>
                  </View>
                  <View style={styles.nearbyTrailing}>
                    <View style={styles.nearbyRating}>
                      <Ionicons
                        name={hasRating(item.rating, item.totalReviews) ? 'star' : 'star-outline'}
                        size={14}
                        color={hasRating(item.rating, item.totalReviews) ? colors.ratingGold : colors.foregroundMuted}
                      />
                      {hasRating(item.rating, item.totalReviews) ? (
                        <Text style={styles.nearbyRatingText} numberOfLines={1}>
                          {formatRating(item.rating, item.totalReviews)}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>
      <FloatingCartBar bottomOffset={LIQUID_GLASS_BOTTOM_NAV_OFFSET + 24} />
    </ScreenContainer>
  );
}
