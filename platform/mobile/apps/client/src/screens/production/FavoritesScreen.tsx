/* Hallmark · macrostructure: Collection-Led · genre: modern-minimal · theme: Noowe tokens · enrichment: none · designed-as-app · pre-emit critique: P5 H5 E4 S5 R5 V5 */
import React, { useMemo } from 'react';
import { Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import customerBackend, { type CustomerRestaurant } from '../../services/customer-backend';
import { StateView, useQueryRefreshControl } from './shared';
import { formatAverageMenuPrice, formatRating, hasRating } from './home-restaurant-ui';

const ORANGE = '#FF4B22';
const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=85';

export default function FavoritesScreen({ navigation }: any) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['favorites'], queryFn: () => customerBackend.listFavorites() });
  const refreshControl = useQueryRefreshControl([query]);
  const favorites = query.data ?? [];

  const remove = useMutation({
    mutationFn: (restaurantId: string) => customerBackend.setFavorite(restaurantId, false),
    onMutate: async (restaurantId) => {
      await queryClient.cancelQueries({ queryKey: ['favorites'] });
      const previous = queryClient.getQueryData<CustomerRestaurant[]>(['favorites']);
      queryClient.setQueryData<CustomerRestaurant[]>(['favorites'], (current) => (current ?? []).filter((item) => item.id !== restaurantId));
      return { previous };
    },
    onError: (_error, _restaurantId, context) => queryClient.setQueryData(['favorites'], context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['favorites'] }),
  });

  const styles = useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 18, paddingBottom: 44 },
    header: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    back: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.backgroundTertiary, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 17, fontWeight: '800', color: colors.foreground },
    headerSpacer: { width: 34 },
    intro: { marginTop: 5, marginBottom: 17, color: colors.foregroundSecondary, fontSize: 13, lineHeight: 19 },
    card: { height: 180, marginBottom: 13, borderRadius: 19, overflow: 'hidden', backgroundColor: colors.backgroundTertiary },
    image: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
    shade: { ...StyleSheet.absoluteFillObject },
    heart: { position: 'absolute', top: 11, right: 11, width: 42, height: 42, borderRadius: 21, backgroundColor: colors.overlayLight, alignItems: 'center', justifyContent: 'center' },
    cardBody: { position: 'absolute', left: 15, right: 15, bottom: 14 },
    name: { color: '#FFFFFF', fontSize: 19, fontWeight: '800', letterSpacing: -0.2 },
    metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 6 },
    meta: { color: '#FFFFFF', fontSize: 12, opacity: 0.92 },
    dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.72)' },
    rating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    ratingText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
    empty: { alignItems: 'center', paddingHorizontal: 26, paddingTop: 68 },
    emptyIcon: { width: 68, height: 68, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF0EA' },
    emptyTitle: { marginTop: 19, color: colors.foreground, fontSize: 17, fontWeight: '800' },
    emptyText: { marginTop: 7, color: colors.foregroundSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center' },
    exploreButton: { minHeight: 46, marginTop: 20, paddingHorizontal: 22, borderRadius: 14, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
    exploreText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  }), [colors]);

  return (
    <ScreenContainer edges={['top']}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={refreshControl} alwaysBounceVertical showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
            <Ionicons name="arrow-back" size={18} color={colors.foregroundSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Restaurantes Favoritos</Text>
          <View style={styles.headerSpacer} />
        </View>

        {!query.isLoading && !query.error && favorites.length ? <Text style={styles.intro}>Seus lugares preferidos, prontos para a próxima visita.</Text> : null}
        <StateView loading={query.isLoading} error={query.error} onRetry={() => query.refetch()} />

        {!query.isLoading && !query.error && favorites.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}><Ionicons name="heart-outline" size={31} color={ORANGE} /></View>
            <Text style={styles.emptyTitle}>Sua lista está vazia</Text>
            <Text style={styles.emptyText}>Favorite os restaurantes que você ama para encontrá-los rapidamente aqui.</Text>
            <TouchableOpacity style={styles.exploreButton} onPress={() => navigation.navigate('Main', { screen: 'Home' })} accessibilityRole="button">
              <Text style={styles.exploreText}>Explorar restaurantes</Text>
            </TouchableOpacity>
          </View>
        ) : favorites.map((item) => {
          const cuisine = item.cuisineTypes[0] ?? 'Restaurante';
          const price = formatAverageMenuPrice(item.avgMenuPriceCents);
          return (
            <TouchableOpacity key={item.id} style={styles.card} onPress={() => navigation.navigate('Restaurant', { restaurantId: item.id })} activeOpacity={0.9} accessibilityRole="button" accessibilityLabel={`${item.name}, ${formatRating(item.rating, item.totalReviews)}`}>
              <Image source={{ uri: item.bannerUrl || item.logoUrl || FALLBACK_IMAGE }} style={styles.image} resizeMode="cover" />
              <LinearGradient colors={['transparent', 'rgba(0,0,0,0.78)']} locations={[0.28, 1]} style={styles.shade} />
              <TouchableOpacity
                style={styles.heart}
                onPress={() => remove.mutate(item.id)}
                disabled={remove.isPending && remove.variables === item.id}
                accessibilityRole="button"
                accessibilityLabel={`Remover ${item.name} dos favoritos`}
              >
                <Ionicons name="heart" size={21} color={ORANGE} />
              </TouchableOpacity>
              <View style={styles.cardBody}>
                <Text numberOfLines={1} style={styles.name}>{item.name}</Text>
                <View style={styles.metaRow}>
                  <Text style={styles.meta}>{cuisine}</Text>
                  <View style={styles.dot} />
                  <View style={styles.rating}><Ionicons name={hasRating(item.rating, item.totalReviews) ? 'star' : 'star-outline'} size={12} color="#FBBF24" /><Text style={styles.ratingText} numberOfLines={1}>{formatRating(item.rating, item.totalReviews)}</Text></View>
                  {price ? <><View style={styles.dot} /><Text style={styles.meta}>{price}</Text></> : null}
                  {item.city ? <><View style={styles.dot} /><Text numberOfLines={1} style={styles.meta}>{item.city}</Text></> : null}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </ScreenContainer>
  );
}
