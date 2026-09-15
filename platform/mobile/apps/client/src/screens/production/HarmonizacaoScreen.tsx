import React, { useMemo } from 'react';
import { Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import customerBackend from '../../services/customer-backend';
import { suggestPairing } from './home-restaurant-ui';
import { StateView, useQueryRefreshControl } from './shared';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=200&q=80';

/**
 * Rule-based pairing suggestions (see suggestPairing) — labeled honestly in
 * the UI as a starting point, not a claim of a real model behind it.
 */
export default function HarmonizacaoScreen({ route, navigation }: any) {
  const colors = useColors();
  const restaurantId = route?.params?.restaurantId;
  const menu = useQuery({
    queryKey: ['menu', restaurantId],
    queryFn: () => customerBackend.getMenu(restaurantId!),
    enabled: !!restaurantId,
  });
  const refreshControl = useQueryRefreshControl(restaurantId ? [menu] : []);
  const items = menu.data?.items ?? [];

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
        headerBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.backgroundTertiary, alignItems: 'center', justifyContent: 'center' },
        headerTitle: { fontSize: 18, fontWeight: '700', color: colors.foreground },
        subtitle: { paddingHorizontal: 16, marginBottom: 16, fontSize: 13, lineHeight: 18, color: colors.foregroundSecondary },
        listContent: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
        card: {
          flexDirection: 'row', gap: 12, padding: 12, borderRadius: 16,
          backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
        },
        image: { width: 64, height: 64, borderRadius: 12, backgroundColor: colors.backgroundTertiary },
        content: { flex: 1 },
        name: { fontSize: 15, fontWeight: '700', color: colors.foreground, marginBottom: 6 },
        pairingRow: { flexDirection: 'row', gap: 6 },
        pairingText: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.primary },
      }),
    [colors],
  );

  return (
    <ScreenContainer edges={['top']}>
      <ScrollView style={styles.container} refreshControl={refreshControl} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
            <Ionicons name="arrow-back" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Harmonização</Text>
        </View>
        <Text style={styles.subtitle}>Sugestões de harmonização para os pratos do cardápio.</Text>

        <StateView
          loading={menu.isLoading}
          error={menu.error}
          onRetry={() => menu.refetch()}
          empty={!menu.isLoading && items.length === 0 ? 'Cardápio sem itens disponíveis.' : undefined}
          emptyIcon="wine-outline"
        />

        <View style={styles.listContent}>
          {items.map((item) => (
            <View key={item.id} style={styles.card}>
              <Image source={{ uri: item.imageUrl || FALLBACK_IMAGE }} style={styles.image} resizeMode="cover" />
              <View style={styles.content}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <View style={styles.pairingRow}>
                  <Ionicons name="wine-outline" size={15} color={colors.primary} />
                  <Text style={styles.pairingText}>{suggestPairing(item.name, item.description)}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
