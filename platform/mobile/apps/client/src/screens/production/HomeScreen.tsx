import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { useVisitSession } from '../../contexts/VisitSessionContext';
import customerBackend, { type CustomerRestaurant } from '../../services/customer-backend';
import { distanceKm, rootNavigate, StateView } from './shared';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80';

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

export default function HomeScreen({ navigation }: any) {
  const colors = useColors();
  const { selectRestaurant } = useVisitSession();
  const [search, setSearch] = useState('');
  const [selectedCuisine, setSelectedCuisine] = useState<string | null>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const restaurants = useQuery({
    queryKey: ['restaurants', search],
    queryFn: () => customerBackend.listRestaurants({ search, limit: 30 }),
  });
  const unread = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => customerBackend.getUnreadNotificationCount(),
  });

  const cuisines = useMemo(
    () => Array.from(new Set(restaurants.data?.data.flatMap((r) => r.cuisineTypes) ?? [])).slice(0, 10),
    [restaurants.data],
  );

  const rows = useMemo(() => {
    const list = restaurants.data?.data ?? [];
    const filtered = selectedCuisine ? list.filter((r) => r.cuisineTypes.includes(selectedCuisine)) : list;
    if (!location) return filtered;
    return [...filtered].sort((a, b) => {
      if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return 0;
      return distanceKm(location, { lat: a.lat, lng: a.lng }) - distanceKm(location, { lat: b.lat, lng: b.lng });
    });
  }, [restaurants.data, selectedCuisine, location]);

  const featured = rows[0];
  const nearby = rows.slice(1);

  const locate = useCallback(async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Localização', 'Permissão não concedida.');
      return;
    }
    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setLocation(current.coords);
  }, []);

  const open = useCallback(
    async (restaurant: CustomerRestaurant) => {
      await selectRestaurant(restaurant.id);
      rootNavigate(navigation, 'Restaurant', { restaurantId: restaurant.id });
    },
    [navigation, selectRestaurant],
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
        bellButton: { padding: 8, marginTop: 4 },
        badge: {
          position: 'absolute',
          top: 4,
          right: 4,
          minWidth: 18,
          height: 18,
          borderRadius: 9,
          backgroundColor: '#EF4444',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 4,
        },
        badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
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
        locateBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          alignSelf: 'flex-start',
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 12,
          backgroundColor: location ? colors.primary : colors.backgroundTertiary,
          marginBottom: 12,
        },
        locateText: {
          fontSize: 13,
          fontWeight: '600',
          color: location ? colors.primaryForeground : colors.foregroundSecondary,
        },
        chipsRow: { gap: 8, paddingBottom: 4 },
        chip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, backgroundColor: colors.backgroundTertiary },
        chipSelected: { backgroundColor: colors.primary },
        chipText: { fontSize: 13, fontWeight: '600', color: colors.foregroundSecondary },
        chipTextSelected: { color: colors.primaryForeground },
        chipScroll: { marginBottom: 16 },
        featuredCard: {
          marginBottom: 20,
          borderRadius: 20,
          overflow: 'hidden',
          height: 220,
          backgroundColor: colors.backgroundTertiary,
        },
        featuredImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
        featuredGradient: { ...StyleSheet.absoluteFillObject },
        featuredBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16 },
        ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
        ratingText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
        featuredName: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', marginBottom: 4 },
        featuredMeta: { color: 'rgba(255,255,255,0.9)', fontSize: 14 },
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
          backgroundColor: '#FFF3EE',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 14,
        },
        nearbyInfo: { flex: 1 },
        nearbyName: { color: colors.foreground, fontWeight: '700', fontSize: 16, marginBottom: 4 },
        nearbySub: { color: colors.foregroundSecondary, fontSize: 14 },
        nearbyRating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
        nearbyRatingText: { color: colors.foreground, fontWeight: '600', fontSize: 14 },
      }),
    [colors, location],
  );

  return (
    <ScreenContainer edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{getTimeGreeting()}</Text>
            <Text style={styles.headerTitle}>Descubra experiências</Text>
          </View>
          <TouchableOpacity
            style={styles.bellButton}
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

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={20} color={colors.foregroundMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar restaurantes..."
            placeholderTextColor={colors.foregroundMuted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            accessibilityLabel="Buscar restaurantes"
          />
        </View>

        <TouchableOpacity style={styles.locateBtn} onPress={locate} accessibilityRole="button">
          <Ionicons name="locate" size={16} color={location ? colors.primaryForeground : colors.foregroundSecondary} />
          <Text style={styles.locateText}>{location ? 'Ordenado por proximidade' : 'Restaurantes perto de mim'}</Text>
        </TouchableOpacity>

        {cuisines.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow} style={styles.chipScroll}>
            {cuisines.map((cuisine) => {
              const selected = selectedCuisine === cuisine;
              return (
                <TouchableOpacity
                  key={cuisine}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => setSelectedCuisine(selected ? null : cuisine)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{cuisine}</Text>
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

        {featured && (
          <TouchableOpacity style={styles.featuredCard} activeOpacity={0.92} onPress={() => open(featured)} accessibilityRole="button">
            <Image source={{ uri: featured.bannerUrl || featured.logoUrl || FALLBACK_IMAGE }} style={styles.featuredImage} resizeMode="cover" />
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={styles.featuredGradient} />
            <View style={styles.featuredBottom}>
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={16} color="#FBBF24" />
                <Text style={styles.ratingText}>
                  {featured.rating.toFixed(1)} ({featured.totalReviews})
                </Text>
              </View>
              <Text style={styles.featuredName}>{featured.name}</Text>
              <Text style={styles.featuredMeta}>{featured.cuisineTypes[0] ?? 'Casual dining'}</Text>
            </View>
          </TouchableOpacity>
        )}

        {nearby.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Perto de você</Text>
            {nearby.map((item) => (
              <TouchableOpacity key={item.id} style={styles.nearbyItem} onPress={() => open(item)} activeOpacity={0.85} accessibilityRole="button">
                <View style={styles.nearbyIcon}>
                  <Ionicons name="restaurant" size={26} color={colors.primary} />
                </View>
                <View style={styles.nearbyInfo}>
                  <Text style={styles.nearbyName}>{item.name}</Text>
                  <Text style={styles.nearbySub}>{item.cuisineTypes[0] ?? 'Casual dining'}</Text>
                </View>
                <View style={styles.nearbyRating}>
                  <Ionicons name="star" size={14} color="#FBBF24" />
                  <Text style={styles.nearbyRatingText}>{item.rating.toFixed(1)}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
