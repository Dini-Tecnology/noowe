import React, { useMemo } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { useVisitSession } from '../../contexts/VisitSessionContext';
import customerBackend from '../../services/customer-backend';
import { StateView } from './shared';

export default function PromotionsScreen() {
  const colors = useColors();
  const visit = useVisitSession();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['promotions', visit.session?.restaurantId], queryFn: () => customerBackend.listPromotions(visit.session?.restaurantId) });
  const redeem = useMutation({
    mutationFn: (id: string) => customerBackend.redeemPromotion(id),
    onSuccess: () => {
      Alert.alert('Cupom reservado', 'O restaurante validará o benefício no atendimento.');
      queryClient.invalidateQueries({ queryKey: ['promotions'] });
    },
    onError: (error: Error) => Alert.alert('Cupom indisponível', error.message),
  });

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        title: { fontSize: 26, fontWeight: '700', color: colors.foreground, marginBottom: 16 },
        card: { padding: 16, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1.5, borderColor: '#FFD4C2', marginBottom: 12, gap: 6 },
        row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
        name: { fontSize: 16, fontWeight: '700', color: colors.foreground },
        desc: { fontSize: 13, color: colors.foregroundSecondary },
        code: { fontSize: 13, fontWeight: '700', color: colors.primary, marginTop: 4 },
        btn: { alignSelf: 'flex-start', marginTop: 8, backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 12 },
        btnText: { color: colors.primaryForeground, fontSize: 13, fontWeight: '700' },
      }),
    [colors],
  );

  return (
    <ScreenContainer edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Cupons</Text>
        <StateView
          loading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          empty={query.data?.length === 0 ? 'Nenhum cupom disponível.' : undefined}
          emptyIcon="pricetag-outline"
        />
        {(query.data ?? []).map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.row}>
              <Ionicons name="pricetag" size={20} color={colors.primary} />
              <Text style={styles.name}>{item.title}</Text>
            </View>
            {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}
            <Text style={styles.code}>Código: {item.code}</Text>
            <TouchableOpacity style={styles.btn} onPress={() => redeem.mutate(item.id)} disabled={redeem.isPending} accessibilityRole="button">
              <Text style={styles.btnText}>{redeem.isPending ? 'Resgatando...' : 'Resgatar'}</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}
