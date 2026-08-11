/**
 * ClubQueueManagementScreen - Staff Queue Management
 *
 * Live queue management for staff with position-ordered list,
 * call-next functionality, admission/no-show actions, and
 * real-time WebSocket updates via ClubQueueGateway.
 *
 * @module restaurant/screens/club
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
} from 'react-native';
import {
  Text,
  Button,
  Card,
  Chip,
  IconButton,
  ActivityIndicator,
} from 'react-native-paper';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { t } from '@okinawa/shared/i18n';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { useWebSocket } from '@/shared/hooks/useWebSocket';
import ApiService from '@/shared/services/api';

// ============================================
// TYPES
// ============================================

interface QueueEntry {
  id: string;
  position: number;
  customerName: string;
  partySize: number;
  ticketType: string;
  status: 'waiting' | 'called' | 'admitted' | 'no_show';
  joinedAt: string;
  calledAt?: string;
}

interface QueueStats {
  totalInQueue: number;
  avgWaitMinutes: number;
  calledCount: number;
  admittedCount: number;
}

interface ClubQueueManagementScreenProps {
  route?: {
    params?: {
      restaurantId: string;
    };
  };
}

// ============================================
// HELPERS
// ============================================

function getWaitTime(joinedAt: string): string {
  const diffMs = Date.now() - new Date(joinedAt).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '<1min';
  if (diffMin < 60) return `${diffMin}min`;
  const hours = Math.floor(diffMin / 60);
  return `${hours}h${diffMin % 60}min`;
}

// ============================================
// SKELETON
// ============================================

function QueueSkeleton({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{ padding: 16, gap: 12 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View
          key={i}
          style={{
            backgroundColor: colors.card,
            borderRadius: 12,
            padding: 16,
            flexDirection: 'row',
            gap: 12,
          }}
        >
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.backgroundTertiary }} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={{ width: '60%', height: 14, borderRadius: 4, backgroundColor: colors.backgroundTertiary }} />
            <View style={{ width: '40%', height: 10, borderRadius: 4, backgroundColor: colors.backgroundTertiary }} />
          </View>
          <View style={{ width: 60, height: 32, borderRadius: 8, backgroundColor: colors.backgroundTertiary }} />
        </View>
      ))}
    </View>
  );
}

// ============================================
// QUEUE ENTRY CARD
// ============================================

function QueueEntryCard({
  entry,
  colors,
  onAdmit,
  onNoShow,
  isActioning,
}: {
  entry: QueueEntry;
  colors: ReturnType<typeof useColors>;
  onAdmit: (id: string) => void;
  onNoShow: (id: string) => void;
  isActioning: boolean;
}) {
  const isCalled = entry.status === 'called';

  return (
    <Card
      style={[
        styles.entryCard,
        {
          backgroundColor: isCalled ? colors.primary + '10' : colors.card,
          borderColor: isCalled ? colors.primary : 'transparent',
          borderWidth: isCalled ? 1 : 0,
        },
      ]}
      mode="elevated"
    >
      <Card.Content style={styles.entryContent}>
        {/* Position Badge */}
        <View
          style={[
            styles.positionBadge,
            { backgroundColor: isCalled ? colors.primary : colors.backgroundTertiary },
          ]}
        >
          <Text
            variant="titleMedium"
            style={{
              color: isCalled ? colors.primaryForeground : colors.foreground,
              fontWeight: '800',
            }}
          >
            {entry.position}
          </Text>
        </View>

        {/* Entry Info */}
        <View style={styles.entryInfo}>
          <Text
            variant="titleSmall"
            style={{ color: colors.foreground, fontWeight: '600' }}
            numberOfLines={1}
          >
            {entry.customerName}
          </Text>
          <View style={styles.entryMeta}>
            <Text variant="bodySmall" style={{ color: colors.foregroundMuted }}>
              {entry.partySize} {t('club.queueSection.partySize')}
            </Text>
            <Text variant="bodySmall" style={{ color: colors.foregroundMuted }}>
              {getWaitTime(entry.joinedAt)}
            </Text>
            <Chip mode="outlined" compact textStyle={{ fontSize: 10 }} style={styles.typeChip}>
              {entry.ticketType.toUpperCase()}
            </Chip>
          </View>
        </View>

        {/* Actions */}
        {isCalled && (
          <View style={styles.entryActions}>
            <Button
              mode="contained"
              compact
              onPress={() => onAdmit(entry.id)}
              disabled={isActioning}
              style={[styles.actionBtn, { backgroundColor: colors.success }]}
              labelStyle={{ color: colors.primaryForeground, fontSize: 12 }}
              accessibilityRole="button"
              accessibilityLabel={`Admit ${entry.customerName}`}
            >
              {t('club.queueSection.admitted')}
            </Button>
            <Button
              mode="outlined"
              compact
              onPress={() => onNoShow(entry.id)}
              disabled={isActioning}
              style={styles.actionBtn}
              labelStyle={{ fontSize: 12 }}
              textColor={colors.error}
              accessibilityRole="button"
              accessibilityLabel={`Mark ${entry.customerName} as no-show`}
            >
              {t('club.queueSection.noShow')}
            </Button>
          </View>
        )}
      </Card.Content>
    </Card>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function ClubQueueManagementScreen({ route }: ClubQueueManagementScreenProps) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { connected, on, off, emit } = useWebSocket('/queue');

  const restaurantId = route?.params?.restaurantId || '';

  // Fetch queue
  const {
    data: queue,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<QueueEntry[]>({
    queryKey: ['club-queue', restaurantId],
    queryFn: async () => {
      const response = await ApiService.get(`/queue/restaurant/${restaurantId}`);
      return response.data || [];
    },
    enabled: !!restaurantId,
  });

  // Fetch stats
  const { data: stats } = useQuery<QueueStats>({
    queryKey: ['club-queue-stats', restaurantId],
    queryFn: async () => {
      const response = await ApiService.get(`/queue/restaurant/${restaurantId}/stats`);
      return response.data;
    },
    enabled: !!restaurantId,
  });

  // WebSocket for real-time updates
  useEffect(() => {
    if (!restaurantId || !connected) return;
    emit('joinQueueRoom', restaurantId);

    const onQueueUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ['club-queue', restaurantId] });
      queryClient.invalidateQueries({ queryKey: ['club-queue-stats', restaurantId] });
    };

    const onStatsUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ['club-queue-stats', restaurantId] });
    };
    on('queueUpdate', onQueueUpdate);
    on('statsUpdate', onStatsUpdate);

    return () => {
      off('queueUpdate', onQueueUpdate);
      off('statsUpdate', onStatsUpdate);
      emit('leaveQueueRoom', restaurantId);
    };
  }, [restaurantId, connected, emit, on, off, queryClient]);

  // Call next mutation
  const callNextMutation = useMutation({
    mutationFn: async () => {
      const response = await ApiService.post(
        `/queue/restaurant/${restaurantId}/call-next`,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club-queue'] });
      queryClient.invalidateQueries({ queryKey: ['club-queue-stats'] });
    },
    onError: (error: Error) => {
      Alert.alert(t('common.error'), error.message);
    },
  });

  // Admit (confirm entry) mutation
  const admitMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await ApiService.put(`/queue/${id}/confirm-entry`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club-queue'] });
      queryClient.invalidateQueries({ queryKey: ['club-queue-stats'] });
    },
    onError: (error: Error) => {
      Alert.alert(t('common.error'), error.message);
    },
  });

  // No-show mutation
  const noShowMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await ApiService.put(`/queue/${id}/no-show`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club-queue'] });
      queryClient.invalidateQueries({ queryKey: ['club-queue-stats'] });
    },
    onError: (error: Error) => {
      Alert.alert(t('common.error'), error.message);
    },
  });

  const handleCallNext = useCallback(() => {
    callNextMutation.mutate();
  }, [callNextMutation]);

  const handleAdmit = useCallback(
    (id: string) => {
      admitMutation.mutate(id);
    },
    [admitMutation],
  );

  const handleNoShow = useCallback(
    (id: string) => {
      Alert.alert(
        t('club.queueSection.noShow'),
        t('common.confirm'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.confirm'),
            style: 'destructive',
            onPress: () => noShowMutation.mutate(id),
          },
        ],
      );
    },
    [noShowMutation],
  );

  const isActioning =
    admitMutation.isPending || noShowMutation.isPending;

  const renderEntry = useCallback(
    ({ item }: { item: QueueEntry }) => (
      <QueueEntryCard
        entry={item}
        colors={colors}
        onAdmit={handleAdmit}
        onNoShow={handleNoShow}
        isActioning={isActioning}
      />
    ),
    [colors, handleAdmit, handleNoShow, isActioning],
  );

  if (isLoading) {
    return (
      <ScreenContainer>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Text
            variant="headlineMedium"
            style={{ color: colors.foreground, fontWeight: '700' }}
          >
            {t('club.queue')}
          </Text>
        </View>
        <QueueSkeleton colors={colors} />
      </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text
          variant="headlineMedium"
          style={{ color: colors.foreground, fontWeight: '700' }}
        >
          {t('club.queue')}
        </Text>
      </View>

      {/* Stats */}
      {stats && (
        <View style={styles.statsRow}>
          <Card style={[styles.statCard, { backgroundColor: colors.card }]} mode="elevated">
            <Card.Content style={styles.statContent}>
              <Text
                variant="headlineSmall"
                style={{ color: colors.primary, fontWeight: '800' }}
              >
                {stats.totalInQueue}
              </Text>
              <Text variant="bodySmall" style={{ color: colors.foregroundMuted }}>
                {t('club.queueSection.total')}
              </Text>
            </Card.Content>
          </Card>
          <Card style={[styles.statCard, { backgroundColor: colors.card }]} mode="elevated">
            <Card.Content style={styles.statContent}>
              <Text
                variant="headlineSmall"
                style={{ color: colors.foreground, fontWeight: '800' }}
              >
                {stats.avgWaitMinutes}min
              </Text>
              <Text variant="bodySmall" style={{ color: colors.foregroundMuted }}>
                {t('club.queueSection.avgWait')}
              </Text>
            </Card.Content>
          </Card>
          <Card style={[styles.statCard, { backgroundColor: colors.card }]} mode="elevated">
            <Card.Content style={styles.statContent}>
              <Text
                variant="headlineSmall"
                style={{ color: colors.success, fontWeight: '800' }}
              >
                {stats.calledCount}
              </Text>
              <Text variant="bodySmall" style={{ color: colors.foregroundMuted }}>
                {t('club.queueSection.called')}
              </Text>
            </Card.Content>
          </Card>
        </View>
      )}

      {/* Call Next Button */}
      <Button
        mode="contained"
        onPress={handleCallNext}
        loading={callNextMutation.isPending}
        disabled={callNextMutation.isPending || !queue?.length}
        style={styles.callNextBtn}
        contentStyle={styles.callNextBtnContent}
        labelStyle={styles.callNextBtnLabel}
        icon="bullhorn"
        accessibilityRole="button"
        accessibilityLabel="Call next guest in queue"
      >
        {t('club.queueSection.callNext')}
      </Button>

      {/* Queue List */}
      <FlatList
        data={queue || []}
        keyExtractor={(item) => item.id}
        renderItem={renderEntry}
        contentContainerStyle={styles.list}
        getItemLayout={(_, index) => ({
          length: 88,
          offset: 88 * index,
          index,
        })}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>📋</Text>
            <Text
              variant="bodyLarge"
              style={{ color: colors.foregroundMuted, textAlign: 'center' }}
            >
              {t('common.noResults')}
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
    </ScreenContainer>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
  },
  statContent: {
    alignItems: 'center',
    padding: 8,
  },
  callNextBtn: {
    marginHorizontal: 16,
    borderRadius: 12,
  },
  callNextBtnContent: {
    height: 52,
  },
  callNextBtnLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  list: {
    padding: 16,
    gap: 8,
    paddingBottom: 40,
  },
  entryCard: {
    borderRadius: 12,
  },
  entryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  positionBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  entryInfo: {
    flex: 1,
    gap: 4,
  },
  entryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  typeChip: {
    height: 20,
  },
  entryActions: {
    gap: 4,
  },
  actionBtn: {
    borderRadius: 6,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
});
