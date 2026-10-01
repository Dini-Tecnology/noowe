import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
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
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import customerBackend, { type CustomerRestaurant } from '../../services/customer-backend';
import { distanceKm, rootNavigate, StateView, useQueryRefreshControl } from './shared';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80';

const DEFAULT_MAP_REGION = { latitude: -23.5505, longitude: -46.6333 };
const GEOCODE_TIMEOUT_MS = 6000;

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

export default function ReservationRestaurantScreen({ navigation }: any) {
  const colors = useColors();
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [cityLabel, setCityLabel] = useState<string | null>(null);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [mapDraft, setMapDraft] = useState<{ latitude: number; longitude: number } | null>(null);
  const [addressQuery, setAddressQuery] = useState('');
  const [addressSearching, setAddressSearching] = useState(false);
  const [confirmingPin, setConfirmingPin] = useState(false);

  const query = useQuery({
    queryKey: ['reservation-restaurants', search],
    queryFn: async () => {
      const page = await customerBackend.listRestaurants({ search: search || undefined, limit: 50 });
      return page.data.filter((restaurant) => ['fine_dining', 'casual_dining'].includes(restaurant.serviceType));
    },
  });
  const refreshControl = useQueryRefreshControl([query]);

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

  // A busca de restaurante para reserva sempre parte de onde o cliente está
  // agora — a cidade só muda se ele trocar manualmente pelo ícone de local.
  useEffect(() => {
    (async () => {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') return;
      const current = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        GEOCODE_TIMEOUT_MS,
      );
      if (current) await applyCoords(current.coords);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const addressText = addressQuery.trim();
    if (!addressText) return;
    setAddressSearching(true);
    try {
      const results = await withTimeout(Location.geocodeAsync(addressText), GEOCODE_TIMEOUT_MS);
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

  const rows = useMemo(() => {
    const list = query.data ?? [];
    let filtered = cityLabel
      ? list.filter((r) => r.city?.trim().toLowerCase() === cityLabel.trim().toLowerCase())
      : list;
    if (location) {
      filtered = [...filtered].sort((a, b) => {
        if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return 0;
        return distanceKm(location, { lat: a.lat, lng: a.lng }) - distanceKm(location, { lat: b.lat, lng: b.lng });
      });
    }
    return filtered;
  }, [query.data, cityLabel, location]);

  const styles = useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: { height: 56, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center' },
    back: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.backgroundTertiary, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { flex: 1, marginRight: 32, textAlign: 'center', fontSize: 17, fontWeight: '800', color: colors.foreground },
    intro: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 16 },
    title: { color: colors.foreground, fontSize: 22, fontWeight: '800', marginBottom: 7 },
    subtitle: { color: colors.foregroundSecondary, fontSize: 14, lineHeight: 20 },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 18,
      marginBottom: 10,
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
      marginLeft: 18,
      marginBottom: 14,
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
    modalScrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    modalTitle: { fontSize: 17, fontWeight: '700', color: colors.foreground },
    useGpsRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 12,
      borderRadius: 12, backgroundColor: colors.backgroundTertiary, marginBottom: 12,
    },
    useGpsText: { fontSize: 14, fontWeight: '600', color: colors.foreground },
    mapView: { width: '100%', height: 220, borderRadius: 14, overflow: 'hidden', marginBottom: 12 },
    confirmMapBtn: {
      alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12,
      backgroundColor: colors.primary, marginBottom: 16,
    },
    confirmMapText: { fontSize: 14, fontWeight: '700', color: colors.primaryForeground },
    addressSearchBar: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: colors.backgroundTertiary,
      borderRadius: 12, paddingHorizontal: 14, height: 46, gap: 10,
    },
    addressSearchInput: { flex: 1, fontSize: 14, color: colors.foreground },
    content: { paddingHorizontal: 18, paddingBottom: 36 },
    card: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 13, borderRadius: 17, padding: 13, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
    photo: { width: 54, height: 54, borderRadius: 15, backgroundColor: colors.backgroundTertiary },
    body: { flex: 1 },
    name: { color: colors.foreground, fontSize: 15, fontWeight: '800', marginBottom: 4 },
    address: { color: colors.foregroundSecondary, fontSize: 12 },
  }), [colors]);

  const select = (restaurant: CustomerRestaurant) => rootNavigate(navigation, 'CreateReservation', {
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    restaurantPhoto: restaurant.bannerUrl || restaurant.logoUrl || null,
    restaurantAddress: [restaurant.city, restaurant.state].filter(Boolean).join(', '),
  });

  return (
    <ScreenContainer edges={['top']}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityRole="button"><Ionicons name="arrow-back" size={18} color={colors.foregroundSecondary} /></TouchableOpacity>
          <Text style={styles.headerTitle}>Escolher restaurante</Text>
        </View>
        <View style={styles.intro}>
          <Text style={styles.title}>Onde você quer reservar?</Text>
          <Text style={styles.subtitle}>Selecione primeiro o restaurante. Na próxima etapa você escolhe os detalhes da mesa.</Text>
        </View>

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

        {query.isLoading || query.isError ? <StateView loading={query.isLoading} error={query.error} onRetry={() => query.refetch()} /> : null}
        <FlatList
          style={{ flex: 1 }}
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          refreshControl={refreshControl}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => select(item)} activeOpacity={0.82} accessibilityRole="button">
              <Image source={{ uri: item.bannerUrl || item.logoUrl || FALLBACK_IMAGE }} style={styles.photo} resizeMode="cover" />
              <View style={styles.body}><Text style={styles.name}>{item.name}</Text><Text style={styles.address}>{[item.city, item.state].filter(Boolean).join(', ')}</Text></View>
              <Ionicons name="chevron-forward" size={18} color={colors.foregroundMuted} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={!query.isLoading && !query.isError ? (
            <StateView
              empty={cityLabel
                ? `Nenhum restaurante com reservas em ${cityLabel}. Toque no filtro acima para ver todas as cidades.`
                : 'Nenhum restaurante disponível para reservas agora.'}
              emptyIcon="restaurant-outline"
            />
          ) : null}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </ScreenContainer>
  );
}
