import React, { useMemo } from 'react';
import { Alert, FlatList, RefreshControl, Share, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import customerBackend, { type CustomerReservation } from '../../services/customer-backend';
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
    onError: (error: Error) => Alert.alert('Não foi possível cancelar', error.message),
  });
  const invite = useMutation({
    mutationFn: (id: string) => customerBackend.createReservationInvite(id),
    onSuccess: (url) => Share.share({ message: `Participe da minha reserva na Noowe: ${url}`, url }),
  });

  const styles = useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: { height: 56, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    back: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.backgroundTertiary, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 17, fontWeight: '800', color: colors.foreground },
    add: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFF0EA', alignItems: 'center', justifyContent: 'center' },
    content: { paddingHorizontal: 18, paddingBottom: 36, flexGrow: 1 },
    card: { padding: 15, borderRadius: 17, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    icon: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#FFF0EA', alignItems: 'center', justifyContent: 'center' },
    body: { flex: 1 },
    name: { fontSize: 14, fontWeight: '800', color: colors.foreground, marginBottom: 3 },
    meta: { fontSize: 11, color: colors.foregroundSecondary },
    status: { fontSize: 11, fontWeight: '700', color: colors.primary, marginTop: 3 },
    actions: { flexDirection: 'row', gap: 18, marginTop: 13, marginLeft: 52 },
    action: { color: colors.primary, fontSize: 12, fontWeight: '800' },
    danger: { color: colors.error, fontSize: 12, fontWeight: '800' },
    empty: { flex: 1, minHeight: 430, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
    emptyIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#FFF0EA', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
    emptyTitle: { color: colors.foreground, fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
    emptyText: { color: colors.foregroundSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 24 },
    cta: { height: 48, paddingHorizontal: 28, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    ctaText: { color: colors.primaryForeground, fontSize: 14, fontWeight: '800' },
  }), [colors]);

  const startReservation = () => rootNavigate(navigation, 'ReservationRestaurant');
  const renderReservation = ({ item }: { item: CustomerReservation }) => {
    const date = new Date(item.reservationTime);
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => rootNavigate(navigation, 'ReservationConfirmation', { reservation: item })}
        activeOpacity={0.84}
        accessibilityRole="button"
      >
        <View style={styles.cardTop}>
          <View style={styles.icon}><Ionicons name="calendar-outline" size={20} color={colors.primary} /></View>
          <View style={styles.body}>
            <Text style={styles.name}>{item.restaurantName}</Text>
            <Text style={styles.meta}>{date.toLocaleDateString('pt-BR')} · {date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · {item.partySize} pessoas</Text>
            <Text style={styles.status}>{STATUS_LABELS[item.status] ?? item.status}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.foregroundMuted} />
        </View>
        {['pending', 'confirmed'].includes(item.status) ? (
          <View style={styles.actions}>
            <TouchableOpacity onPress={() => invite.mutate(item.id)} accessibilityRole="button"><Text style={styles.action}>Convidar</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => cancel.mutate(item.id)} accessibilityRole="button"><Text style={styles.danger}>Cancelar</Text></TouchableOpacity>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <ScreenContainer edges={['top']}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityRole="button"><Ionicons name="arrow-back" size={18} color={colors.foregroundSecondary} /></TouchableOpacity>
          <Text style={styles.title}>Minhas Reservas</Text>
          <TouchableOpacity style={styles.add} onPress={startReservation} accessibilityRole="button"><Ionicons name="add" size={20} color={colors.primary} /></TouchableOpacity>
        </View>
        {query.isLoading || query.isError ? <StateView loading={query.isLoading} error={query.error} onRetry={() => query.refetch()} /> : null}
        <FlatList
          style={{ flex: 1 }}
          data={query.data ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderReservation}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} tintColor={colors.primary} />}
          ListEmptyComponent={!query.isLoading && !query.isError ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}><Ionicons name="calendar-outline" size={34} color={colors.primary} /></View>
              <Text style={styles.emptyTitle}>Sua próxima mesa começa aqui</Text>
              <Text style={styles.emptyText}>Escolha o restaurante antes de definir data, horário e convidados.</Text>
              <TouchableOpacity style={styles.cta} onPress={startReservation} accessibilityRole="button"><Text style={styles.ctaText}>Escolher restaurante</Text></TouchableOpacity>
            </View>
          ) : null}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </ScreenContainer>
  );
}
