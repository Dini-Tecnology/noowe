import React, { useMemo } from 'react';
import { FlatList, RefreshControl, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import customerBackend, { type CustomerRestaurant } from '../../services/customer-backend';
import { rootNavigate, StateView } from './shared';

export default function ReservationRestaurantScreen({ navigation }: any) {
  const colors = useColors();
  const query = useQuery({
    queryKey: ['reservation-restaurants'],
    queryFn: async () => {
      const page = await customerBackend.listRestaurants({ limit: 50 });
      return page.data.filter((restaurant) => ['fine_dining', 'casual_dining'].includes(restaurant.serviceType));
    },
  });
  const styles = useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: { height: 56, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center' },
    back: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.backgroundTertiary, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { flex: 1, marginRight: 32, textAlign: 'center', fontSize: 17, fontWeight: '800', color: colors.foreground },
    intro: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 20 },
    title: { color: colors.foreground, fontSize: 22, fontWeight: '800', marginBottom: 7 },
    subtitle: { color: colors.foregroundSecondary, fontSize: 14, lineHeight: 20 },
    content: { paddingHorizontal: 18, paddingBottom: 36 },
    card: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 13, borderRadius: 17, padding: 13, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
    icon: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#FFF0EA', alignItems: 'center', justifyContent: 'center' },
    body: { flex: 1 },
    name: { color: colors.foreground, fontSize: 15, fontWeight: '800', marginBottom: 4 },
    address: { color: colors.foregroundSecondary, fontSize: 12 },
  }), [colors]);

  const select = (restaurant: CustomerRestaurant) => rootNavigate(navigation, 'CreateReservation', {
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
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
        {query.isLoading || query.isError ? <StateView loading={query.isLoading} error={query.error} onRetry={() => query.refetch()} /> : null}
        <FlatList
          style={{ flex: 1 }}
          data={query.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} tintColor={colors.primary} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => select(item)} activeOpacity={0.82} accessibilityRole="button">
              <View style={styles.icon}><Ionicons name="restaurant-outline" size={22} color={colors.primary} /></View>
              <View style={styles.body}><Text style={styles.name}>{item.name}</Text><Text style={styles.address}>{[item.city, item.state].filter(Boolean).join(', ')}</Text></View>
              <Ionicons name="chevron-forward" size={18} color={colors.foregroundMuted} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={!query.isLoading && !query.isError ? <StateView empty="Nenhum restaurante disponível para reservas agora." emptyIcon="restaurant-outline" /> : null}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </ScreenContainer>
  );
}
