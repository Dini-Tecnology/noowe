import React, { useMemo } from 'react';
import { Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import customerBackend from '../../services/customer-backend';
import { StateView } from './shared';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=400&q=80';

export default function FavoritesScreen({ navigation }: any) {
  const colors = useColors();
  const query = useQuery({ queryKey: ['favorites'], queryFn: () => customerBackend.listFavorites() });

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        title: { fontSize: 26, fontWeight: '700', color: colors.foreground, marginBottom: 16 },
        card: {
          flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16,
          backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginBottom: 10,
        },
        image: { width: 56, height: 56, borderRadius: 12, backgroundColor: colors.backgroundTertiary },
        name: { fontSize: 15, fontWeight: '700', color: colors.foreground, marginBottom: 2 },
        meta: { fontSize: 13, color: colors.foregroundSecondary },
      }),
    [colors],
  );

  return (
    <ScreenContainer edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Favoritos</Text>
        <StateView
          loading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          empty={query.data?.length === 0 ? 'Nenhum favorito ainda.' : undefined}
          emptyIcon="heart-outline"
        />
        {(query.data ?? []).map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.card}
            onPress={() => navigation.navigate('Restaurant', { restaurantId: item.id })}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Image source={{ uri: item.bannerUrl || item.logoUrl || FALLBACK_IMAGE }} style={styles.image} resizeMode="cover" />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{item.city}/{item.state}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.foregroundMuted} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}
