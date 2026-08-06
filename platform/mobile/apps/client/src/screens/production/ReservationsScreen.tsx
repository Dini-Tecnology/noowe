import React, { useMemo } from 'react';
import { ScrollView, Share, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import customerBackend from '../../services/customer-backend';
import { rootNavigate, StateView } from './shared';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Aguardando confirmação', confirmed: 'Confirmada', seated: 'Na mesa',
  completed: 'Concluída', cancelled: 'Cancelada', no_show: 'Não compareceu',
};

export default function ReservationsScreen({ navigation }: any) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['reservations'], queryFn: () => customerBackend.listReservations() });
  const cancel = useMutation({
    mutationFn: (id: string) => customerBackend.cancelReservation(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reservations'] }),
  });
  const invite = useMutation({
    mutationFn: (id: string) => customerBackend.createReservationInvite(id),
    onSuccess: (url) => Share.share({ message: `Participe da minha reserva na NOOWE: ${url}`, url }),
  });

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
        title: { fontSize: 26, fontWeight: '700', color: colors.foreground },
        newBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
        newBtnText: { color: colors.primaryForeground, fontSize: 13, fontWeight: '700' },
        card: { padding: 16, borderRadius: 18, backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginBottom: 12, gap: 6 },
        name: { fontSize: 16, fontWeight: '700', color: colors.foreground },
        meta: { fontSize: 13, color: colors.foregroundSecondary },
        actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
        actionBtn: { fontSize: 13, fontWeight: '700', color: colors.primary },
        cancelBtn: { fontSize: 13, fontWeight: '700', color: '#DC2626' },
      }),
    [colors],
  );

  return (
    <ScreenContainer edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Reservas</Text>
          <TouchableOpacity style={styles.newBtn} onPress={() => rootNavigate(navigation, 'CreateReservation', {})} accessibilityRole="button">
            <Ionicons name="add" size={16} color={colors.primaryForeground} />
            <Text style={styles.newBtnText}>Nova</Text>
          </TouchableOpacity>
        </View>

        <StateView
          loading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          empty={query.data?.length === 0 ? 'Nenhuma reserva.' : undefined}
          emptyIcon="calendar-outline"
        />

        {(query.data ?? []).map((item) => (
          <View key={item.id} style={styles.card}>
            <Text style={styles.name}>{item.restaurantName}</Text>
            <Text style={styles.meta}>{new Date(item.reservationTime).toLocaleString('pt-BR')} · {item.partySize} pessoas</Text>
            <Text style={styles.meta}>{STATUS_LABELS[item.status] ?? item.status}</Text>
            {['pending', 'confirmed'].includes(item.status) && (
              <View style={styles.actions}>
                <TouchableOpacity onPress={() => invite.mutate(item.id)} accessibilityRole="button">
                  <Text style={styles.actionBtn}>Convidar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => cancel.mutate(item.id)} accessibilityRole="button">
                  <Text style={styles.cancelBtn}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}
