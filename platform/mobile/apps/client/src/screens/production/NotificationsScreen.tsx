import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import customerBackend, { type CustomerNotification, type TableUserInvite } from '../../services/customer-backend';
import { useRespondToTableInvite } from '../../hooks/useRespondToTableInvite';
import { describeClosedInvite, tableInviteKeys, useTableInvitesRealtime } from '../../hooks/useTableUserInvites';
import { rootNavigate, StateView, useQueryRefreshControl } from './shared';

const ORANGE = '#FF4B22';

const PRESENTATION: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; background: string }> = {
  reservation_confirmed: { icon: 'calendar-outline', color: '#10B981', background: '#EAF9F1' },
  reservation_reminder: { icon: 'calendar-outline', color: '#10B981', background: '#EAF9F1' },
  order_ready: { icon: 'restaurant-outline', color: ORANGE, background: '#FFF0EA' },
  order_confirmed: { icon: 'receipt-outline', color: ORANGE, background: '#FFF0EA' },
  promotion: { icon: 'sparkles-outline', color: '#0F766E', background: '#E8F7F4' },
  payment_received: { icon: 'gift-outline', color: '#F59E0B', background: '#FFF7E6' },
  system: { icon: 'notifications-outline', color: ORANGE, background: '#FFF0EA' },
  table_invite: { icon: 'people-outline', color: ORANGE, background: '#FFF0EA' },
  table_invite_update: { icon: 'people-outline', color: '#2563EB', background: '#EEF4FF' },
};

/** The @username invite a notification points to, if any (ADR-011). */
function tableUserInviteId(item: CustomerNotification): string | null {
  return item.metadata.kind === 'table_user_invite' && typeof item.metadata.invite_id === 'string'
    ? item.metadata.invite_id
    : null;
}

function relativeTime(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'Agora';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 172800) return 'Ontem';
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export default function NotificationsScreen({ navigation }: any) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: ['notifications'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => customerBackend.listNotifications(20, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const notifications = useMemo(() => query.data?.pages.flatMap((page) => page.data) ?? [], [query.data]);
  const refreshControl = useQueryRefreshControl([query]);

  const read = useMutation({
    mutationFn: (id: string) => customerBackend.markNotificationRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['notification-count'] });
    },
  });
  const clear = useMutation({
    mutationFn: () => customerBackend.clearNotifications(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['notification-count'] });
    },
  });
  const markAllRead = useMutation({
    mutationFn: () => customerBackend.markAllNotificationsRead(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['notification-count'] });
    },
  });

  useEffect(() => {
    if (notifications.some((item) => !item.isRead)) markAllRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications.length]);

  const acceptInvite = useMutation({
    mutationFn: (token: string) => customerBackend.acceptReservationInvite(token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['reservations'] });
    },
    onError: (error: Error) => Alert.alert('Não foi possível aceitar', error.message),
  });

  // Current state of every @username invite on screen: the notification is a
  // snapshot, the invite may since have been accepted, cancelled or expired.
  const tableInviteIds = useMemo(
    () => [...new Set(notifications.map(tableUserInviteId).filter((id): id is string => !!id))].sort(),
    [notifications],
  );
  const tableInvites = useQuery({
    queryKey: tableInviteKeys.byIds(tableInviteIds),
    queryFn: () => customerBackend.getTableUserInvites(tableInviteIds),
    enabled: tableInviteIds.length > 0,
  });
  useTableInvitesRealtime(null, tableInviteIds.length > 0);
  const invitesById = useMemo(
    () => new Map((tableInvites.data ?? []).map((invite) => [invite.id, invite] as const)),
    [tableInvites.data],
  );
  const { accept: acceptTableInvite, decline: declineTableInvite } = useRespondToTableInvite();
  const [respondingInvite, setRespondingInvite] = useState<string | null>(null);
  const respondToTableInvite = async (invite: TableUserInvite, action: 'accept' | 'decline') => {
    setRespondingInvite(invite.id);
    try {
      const outcome = action === 'accept' ? await acceptTableInvite(invite) : await declineTableInvite(invite);
      if (outcome.kind === 'joined') rootNavigate(navigation, 'Menu', { restaurantId: outcome.visit.restaurantId });
    } finally {
      setRespondingInvite(null);
    }
  };

  const confirmClear = () => {
    if (!notifications.length || clear.isPending) return;
    Alert.alert('Limpar notificações?', 'Esta ação remove definitivamente todas as suas notificações.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Limpar', style: 'destructive', onPress: () => clear.mutate() },
    ]);
  };

  const styles = useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: { height: 56, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    back: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.backgroundTertiary, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 17, fontWeight: '800', color: colors.foreground },
    clear: { minWidth: 48, alignItems: 'flex-end', paddingVertical: 8 },
    clearText: { color: ORANGE, fontSize: 13, fontWeight: '600' },
    content: { paddingHorizontal: 18, paddingBottom: 36 },
    card: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 17, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, marginBottom: 9 },
    unread: { borderColor: '#FFD2C6', backgroundColor: '#FFF9F7' },
    icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    body: { flex: 1, minWidth: 0 },
    topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    cardTitle: { flex: 1, color: colors.foreground, fontSize: 14, fontWeight: '800' },
    time: { color: colors.foregroundMuted, fontSize: 10 },
    message: { color: colors.foregroundSecondary, fontSize: 12, lineHeight: 17, marginTop: 3 },
    actions: { flexDirection: 'row', gap: 8, marginTop: 11 },
    accept: { minWidth: 76, height: 34, paddingHorizontal: 16, borderRadius: 11, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
    acceptText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
    decline: { minWidth: 76, height: 34, paddingHorizontal: 16, borderRadius: 11, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    declineText: { color: colors.foregroundSecondary, fontSize: 12, fontWeight: '700' },
    footer: { paddingVertical: 18 },
    inviteState: { marginTop: 9, color: colors.foregroundMuted, fontSize: 12, fontStyle: 'italic' },
  }), [colors]);

  const renderItem = ({ item }: { item: CustomerNotification }) => {
    const presentation = PRESENTATION[item.type] ?? PRESENTATION.system;
    const inviteToken = typeof item.metadata.invite_token === 'string' ? item.metadata.invite_token : null;
    const tableInviteId = tableUserInviteId(item);
    const tableInvite = tableInviteId ? invitesById.get(tableInviteId) : undefined;
    return (
      <TouchableOpacity
        style={[styles.card, !item.isRead && styles.unread]}
        onPress={() => !item.isRead && read.mutate(item.id)}
        activeOpacity={0.86}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${item.message}`}
      >
        <View style={[styles.icon, { backgroundColor: presentation.background }]}>
          <Ionicons name={presentation.icon} size={20} color={presentation.color} />
        </View>
        <View style={styles.body}>
          <View style={styles.topRow}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.time}>{relativeTime(item.createdAt)}</Text>
          </View>
          <Text style={styles.message}>{item.message}</Text>
          {inviteToken ? (
            <View style={styles.actions}>
              <TouchableOpacity style={styles.accept} onPress={() => acceptInvite.mutate(inviteToken)} accessibilityRole="button">
                <Text style={styles.acceptText}>Aceitar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.decline} onPress={() => read.mutate(item.id)} accessibilityRole="button">
                <Text style={styles.declineText}>Recusar</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {tableInvite?.canRespond ? (
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.accept}
                onPress={() => void respondToTableInvite(tableInvite, 'accept')}
                disabled={respondingInvite === tableInvite.id}
                accessibilityRole="button"
                testID={`notification-accept-${tableInvite.id}`}
              >
                {respondingInvite === tableInvite.id
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <Text style={styles.acceptText}>Aceitar</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.decline}
                onPress={() => void respondToTableInvite(tableInvite, 'decline')}
                disabled={respondingInvite === tableInvite.id}
                accessibilityRole="button"
                testID={`notification-decline-${tableInvite.id}`}
              >
                <Text style={styles.declineText}>Recusar</Text>
              </TouchableOpacity>
            </View>
          ) : tableInvite ? (
            <Text style={styles.inviteState} testID={`notification-invite-state-${tableInvite.id}`}>
              {tableInvite.status === 'awaiting_capacity'
                ? 'Mesa cheia: aguardando a recepção liberar um lugar.'
                : describeClosedInvite(tableInvite)}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ScreenContainer edges={['top']}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
            <Ionicons name="arrow-back" size={18} color={colors.foregroundSecondary} />
          </TouchableOpacity>
          <Text style={styles.title}>Notificações</Text>
          <TouchableOpacity style={styles.clear} onPress={confirmClear} disabled={!notifications.length || clear.isPending} accessibilityRole="button">
            <Text style={[styles.clearText, !notifications.length && { opacity: 0.45 }]}>{clear.isPending ? 'Limpando' : 'Limpar'}</Text>
          </TouchableOpacity>
        </View>
        {query.isLoading || query.isError || (!notifications.length && !query.isFetching) ? (
          <StateView
            loading={query.isLoading}
            error={query.error}
            onRetry={() => query.refetch()}
            empty={!query.isLoading && !query.isError ? 'Nenhuma notificação por enquanto.' : undefined}
            emptyIcon="notifications-outline"
          />
        ) : null}
        <FlatList
          style={{ flex: 1 }}
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
          onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
          onEndReachedThreshold={0.35}
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator style={styles.footer} color={ORANGE} /> : null}
        />
      </View>
    </ScreenContainer>
  );
}
