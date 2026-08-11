/**
 * ChefApprovalsScreen - Chef's Table Reservation Approvals
 *
 * Shows pending reservations for chef-table service type
 * that require chef approval before confirmation.
 *
 * @module restaurant/screens/chef
 */

import React, { useMemo, useCallback } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  StyleSheet,
  FlatList,
  Alert,
  RefreshControl,
} from 'react-native';
import {
  Text,
  Card,
  Button,
  Chip,
  IconButton,
  ActivityIndicator,
} from 'react-native-paper';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '@/shared/hooks/useI18n';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import ApiService from '@/shared/services/api';
import * as Haptics from 'expo-haptics';

interface PendingReservation {
  id: string;
  user_name: string;
  party_size: number;
  reservation_date: string;
  reservation_time: string;
  special_requests?: string;
  chef_approved_at: string | null;
}

export default function ChefApprovalsScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const queryClient = useQueryClient();

  const {
    data: reservations = [],
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<PendingReservation[]>({
    queryKey: ['chef-approvals'],
    queryFn: async () => {
      const res = await ApiService.get('/reservations?serviceType=chefs-table&status=pending&needsChefApproval=true');
      return res.data || [];
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (reservationId: string) => {
      await ApiService.patch(`/reservations/${reservationId}/chef-approve`, {});
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['chef-approvals'] });
    },
    onError: (error: Error) => {
      Alert.alert(t('common.error'), error.message);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (reservationId: string) => {
      await ApiService.patch(`/reservations/${reservationId}/status`, { status: 'cancelled' });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      queryClient.invalidateQueries({ queryKey: ['chef-approvals'] });
    },
    onError: (error: Error) => {
      Alert.alert(t('common.error'), error.message);
    },
  });

  const handleApprove = useCallback((id: string) => {
    Alert.alert(
      t('chefApprovals.approveTitle'),
      t('chefApprovals.approveConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.confirm'), onPress: () => approveMutation.mutate(id) },
      ],
    );
  }, [approveMutation, t]);

  const handleReject = useCallback((id: string) => {
    Alert.alert(
      t('chefApprovals.rejectTitle'),
      t('chefApprovals.rejectConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.confirm'), style: 'destructive', onPress: () => rejectMutation.mutate(id) },
      ],
    );
  }, [rejectMutation, t]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const renderItem = useCallback(({ item }: { item: PendingReservation }) => {
    const date = new Date(item.reservation_date);
    const formattedDate = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

    return (
      <Card style={styles.card} mode="elevated">
        <Card.Content style={styles.cardContent}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text variant="titleMedium" style={styles.guestName}>
                {item.user_name}
              </Text>
              <Text variant="bodySmall" style={styles.dateText}>
                {formattedDate} · {item.reservation_time} · {item.party_size} {t('reservations.guests')}
              </Text>
            </View>
            <Chip mode="flat" compact style={{ backgroundColor: colors.warning + '20' }} textStyle={{ color: colors.warning }}>
              {t('chefApprovals.pending')}
            </Chip>
          </View>

          {item.special_requests && (
            <View style={styles.requestsBox}>
              <Text variant="bodySmall" style={styles.requestsLabel}>
                {t('reservations.specialRequests')}:
              </Text>
              <Text variant="bodyMedium" style={styles.requestsText}>
                {item.special_requests}
              </Text>
            </View>
          )}

          <View style={styles.actions}>
            <Button
              mode="outlined"
              onPress={() => handleReject(item.id)}
              textColor={colors.error}
              style={styles.rejectBtn}
              icon="close"
              accessibilityLabel={t('chefApprovals.reject')}
            >
              {t('chefApprovals.reject')}
            </Button>
            <Button
              mode="contained"
              onPress={() => handleApprove(item.id)}
              style={styles.approveBtn}
              icon="check"
              accessibilityLabel={t('chefApprovals.approve')}
            >
              {t('chefApprovals.approve')}
            </Button>
          </View>
        </Card.Content>
      </Card>
    );
  }, [colors, styles, handleApprove, handleReject, t]);

  if (isLoading) {
    return (
      <ScreenContainer>
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
    <View style={styles.container}>
      <FlatList
        data={reservations}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        getItemLayout={(_, index) => ({
          length: 152,
          offset: 152 * index,
          index,
        })}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <IconButton icon="check-decagram" size={64} iconColor={colors.foregroundMuted} accessibilityLabel={t('chefApprovals.noReservations')} />
            <Text variant="titleMedium" style={styles.emptyTitle}>
              {t('chefApprovals.noReservations')}
            </Text>
            <Text variant="bodyMedium" style={styles.emptyDesc}>
              {t('chefApprovals.noReservationsDesc')}
            </Text>
          </View>
        }
      />
    </View>
    </ScreenContainer>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
    list: { padding: 16, gap: 12 },
    card: { backgroundColor: colors.card, borderRadius: 12 },
    cardContent: { gap: 12 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    guestName: { color: colors.foreground, fontWeight: '600' },
    dateText: { color: colors.foregroundMuted, marginTop: 2 },
    requestsBox: { backgroundColor: colors.backgroundSecondary, borderRadius: 8, padding: 10 },
    requestsLabel: { color: colors.foregroundMuted, fontWeight: '600', marginBottom: 2 },
    requestsText: { color: colors.foreground },
    actions: { flexDirection: 'row', gap: 8 },
    rejectBtn: { flex: 1, borderColor: colors.error },
    approveBtn: { flex: 1 },
    emptyContainer: { alignItems: 'center', paddingTop: 80 },
    emptyTitle: { color: colors.foreground, marginTop: 8 },
    emptyDesc: { color: colors.foregroundMuted, marginTop: 4, textAlign: 'center' },
  });
