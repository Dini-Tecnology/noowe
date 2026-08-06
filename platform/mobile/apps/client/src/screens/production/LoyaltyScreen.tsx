import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import customerBackend from '../../services/customer-backend';
import { StateView } from './shared';

export default function LoyaltyScreen() {
  const colors = useColors();
  const query = useQuery({ queryKey: ['loyalty'], queryFn: () => customerBackend.listLoyalty() });

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        title: { fontSize: 26, fontWeight: '700', color: colors.foreground, marginBottom: 16 },
        card: { padding: 18, borderRadius: 18, backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginBottom: 12 },
        row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
        name: { fontSize: 16, fontWeight: '700', color: colors.foreground },
        tier: { fontSize: 12, fontWeight: '700', color: colors.primary, backgroundColor: '#FFF3EE', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, textTransform: 'capitalize' },
        points: { fontSize: 28, fontWeight: '800', color: colors.foreground, marginBottom: 4 },
        pointsLabel: { fontSize: 13, color: colors.foregroundSecondary },
        visits: { fontSize: 13, color: colors.foregroundSecondary, marginTop: 8 },
      }),
    [colors],
  );

  return (
    <ScreenContainer edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Fidelidade</Text>
        <StateView
          loading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          empty={query.data?.length === 0 ? 'Você ainda não acumulou pontos.' : undefined}
          emptyIcon="ribbon-outline"
        />
        {(query.data ?? []).map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.name}>{item.restaurantName}</Text>
              <Text style={styles.tier}>{item.tier}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="star" size={22} color="#FBBF24" />
              <Text style={styles.points}>{item.points}</Text>
              <Text style={styles.pointsLabel}>pontos</Text>
            </View>
            <Text style={styles.visits}>{item.totalVisits} visitas</Text>
          </View>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}
