/* Hallmark · pre-emit critique: P5 H4 E4 S5 R3 V5 */
/* Hallmark · macrostructure: Photographic · tone: warm utilitarian · anchor hue: orange */
import React, { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import customerBackend from '../../services/customer-backend';

type RouteParams = { orderId: string };

function formatElapsed(startIso?: string | null, endIso?: string | null): string {
  if (!startIso || !endIso) return '—';
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} min ${seconds}s`;
}

export default function OrderReadyScreen() {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const colors = useColors();
  const { orderId } = (route.params ?? {}) as RouteParams;
  const { data: order } = useQuery({
    queryKey: ['orders', orderId],
    queryFn: () => customerBackend.getOrder(orderId),
    enabled: !!orderId,
  });

  const loyalty = useQuery({
    queryKey: ['loyalty'],
    queryFn: () => customerBackend.listLoyalty(),
    enabled: !!order?.restaurantId,
  });
  const restaurantLoyalty = loyalty.data?.find((entry) => entry.restaurantId === order?.restaurantId);

  const pickupCode = order?.orderNumber ?? '';
  // updatedAt is the closest proxy to "marked ready at" the mapped order
  // exposes — there's no dedicated actual_ready_at field on CustomerOrder.
  const elapsed = formatElapsed(order?.createdAt, order?.updatedAt);
  const pointsEarned = order ? Math.floor(order.total) : 0;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24 },
        checkCircle: {
          width: 96, height: 96, borderRadius: 48, backgroundColor: colors.successBackground,
          alignItems: 'center', justifyContent: 'center', marginBottom: 20,
        },
        title: { fontSize: 24, fontWeight: '800', color: colors.foreground, marginBottom: 4 },
        subtitle: { fontSize: 14, color: colors.foregroundSecondary, marginBottom: 24 },
        card: {
          width: '100%', backgroundColor: colors.card, borderRadius: 18, padding: 18, gap: 10, marginBottom: 16,
          borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
        },
        row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
        rowLabel: { fontSize: 13, color: colors.foregroundSecondary },
        rowValue: { fontSize: 15, fontWeight: '700', color: colors.foreground },
        pointsCard: {
          width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16,
          backgroundColor: colors.backgroundSecondary, marginBottom: 24,
        },
        pointsTitle: { fontSize: 14, fontWeight: '700', color: colors.foreground },
        pointsSub: { fontSize: 12, color: colors.foregroundSecondary, marginTop: 2 },
        cta: {
          width: '100%', paddingVertical: 17, borderRadius: 18, alignItems: 'center',
          backgroundColor: colors.primary,
        },
        ctaText: { fontSize: 16, fontWeight: '700', color: colors.primaryForeground },
      }),
    [colors],
  );

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <View style={styles.root}>
        <View style={styles.checkCircle}>
          <Ionicons name="checkmark" size={52} color={colors.success} />
        </View>
        <Text style={styles.title}>Pedido Pronto!</Text>
        <Text style={styles.subtitle}>Retire no balcão express</Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Código</Text>
            <Text style={styles.rowValue}>{pickupCode}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Tempo total</Text>
            <Text style={styles.rowValue}>{elapsed}</Text>
          </View>
        </View>

        {pointsEarned > 0 && (
          <View style={styles.pointsCard}>
            <Ionicons name="gift-outline" size={24} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.pointsTitle}>+{pointsEarned} pontos ganhos!</Text>
              {restaurantLoyalty && (
                <Text style={styles.pointsSub}>Total acumulado: {restaurantLoyalty.points} pts</Text>
              )}
            </View>
          </View>
        )}

        <TouchableOpacity
          style={styles.cta}
          onPress={() => navigation.replace('QuickServiceRating', { orderId, restaurantId: order?.restaurantId })}
          activeOpacity={0.9}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>★ Avaliar Experiência</Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}
