/**
 * WaiterCallsScreen - Active Waiter Call Management
 *
 * Lists active and resolved waiter calls for the restaurant.
 * Each call shows table number, time since call, caller name, and action CTA.
 * Supports WebSocket real-time updates and tab navigation (Active/Resolved).
 *
 * @module restaurant/screens/waiter-calls
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
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
  IconButton,
  Button,
  ActivityIndicator,
  Card,
  Chip,
  SegmentedButtons,
} from 'react-native-paper';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '@/shared/hooks/useI18n';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import ApiService from '@/shared/services/api';

// ============================================
// TYPES
// ============================================

type CallStatus = 'pending' | 'acknowledged' | 'resolved';

interface WaiterCall {
  id: string;
  table_number: number;
  status: CallStatus;
  caller_name?: string;
  reason?: string;
  created_at: string;
  acknowledged_at?: string;
  resolved_at?: string;
}

type Tab = 'active' | 'resolved';

// ============================================
// HELPERS
// ============================================

function getTimeSinceCall(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);

  if (diffMin < 1) return '<1min';
  if (diffMin < 60) return `${diffMin}min`;
  return `${diffHr}h${diffMin % 60}min`;
}

function getUrgencyColor(dateStr: string, colors: any): string {
  const diffMin = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diffMin >= 10) return colors.error;
  if (diffMin >= 5) return colors.warning;
  return colors.success;
}

// ============================================
// SKELETON
// ============================================

function CallSkeleton({ colors }: { colors: any }) {
  return (
    <View style={{ padding: 16, gap: 12 }}>
      {[1, 2, 3].map((i) => (
        <View
          key={i}
          style={{
            backgroundColor: colors.card,
            borderRadius: 16,
            padding: 16,
            flexDirection: 'row',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ gap: 8 }}>
            <View style={{ width: 80, height: 18, borderRadius: 4, backgroundColor: colors.backgroundTertiary }} />
            <View style={{ width: 120, height: 12, borderRadius: 4, backgroundColor: colors.backgroundTertiary }} />
          </View>
          <View style={{ width: 80, height: 36, borderRadius: 8, backgroundColor: colors.backgroundTertiary }} />
        </View>
      ))}
    </View>
  );
}

// ============================================
// COMPONENT
// ============================================

export default function WaiterCallsScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<Tab>('active');
  const [refreshing, setRefreshing] = useState(false);

  // Fetch waiter calls
  const {
    data: calls = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<WaiterCall[]>({
    queryKey: ['waiter-calls'],
    queryFn: async () => {
      const res = await ApiService.get('/waiter-calls/restaurant/current/pending');
      return res.data;
    },
    refetchInterval: 10000,
  });

  // Fetch resolved calls for today
  const {
    data: resolvedCalls = [],
  } = useQuery<WaiterCall[]>({
    queryKey: ['waiter-calls', 'resolved'],
    queryFn: async () => {
      const res = await ApiService.get('/waiter-calls/restaurant/current/resolved');
      return res.data;
    },
    enabled: activeTab === 'resolved',
    refetchInterval: 30000,
  });

  // Acknowledge a call
  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) => ApiService.put(`/waiter-calls/${id}/acknowledge`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waiter-calls'] });
    },
    onError: () => {
      Alert.alert(t('common.error'), t('waiterCalls.errorUpdating'));
    },
  });

  // Resolve a call
  const resolveMutation = useMutation({
    mutationFn: (id: string) => ApiService.put(`/waiter-calls/${id}/resolve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waiter-calls'] });
    },
    onError: () => {
      Alert.alert(t('common.error'), t('waiterCalls.errorUpdating'));
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const activeCalls = useMemo(
    () => calls.filter((c) => c.status === 'pending' || c.status === 'acknowledged'),
    [calls],
  );

  const displayCalls = activeTab === 'active' ? activeCalls : resolvedCalls;

  const styles = useMemo(() => createStyles(colors), [colors]);

  const renderCallCard = ({ item: call }: { item: WaiterCall }) => {
    const urgencyColor = getUrgencyColor(call.created_at, colors);
    const isAcknowledged = call.status === 'acknowledged';
    const isResolved = call.status === 'resolved';
    const timeSince = getTimeSinceCall(call.created_at);

    return (
      <Card style={[styles.callCard, !isResolved && { borderLeftWidth: 4, borderLeftColor: urgencyColor }]}>
        <Card.Content style={styles.callContent}>
          <View style={styles.callInfo}>
            {/* Table Number */}
            <View style={styles.tableRow}>
              <View style={[styles.tableIcon, { backgroundColor: `${urgencyColor}20` }]}>
                <Text variant="titleLarge" style={[styles.tableNumber, { color: urgencyColor }]}>
                  {call.table_number}
                </Text>
              </View>
              <View style={styles.callDetails}>
                <Text variant="titleMedium" style={styles.callTitle}>
                  {t('waiterCalls.table', { number: call.table_number })}
                </Text>
                <Text variant="bodySmall" style={styles.callTime}>
                  {t('waiterCalls.calledAgo', { time: timeSince })}
                </Text>
                <Text variant="bodySmall" style={styles.callerName}>
                  {call.caller_name
                    ? t('waiterCalls.caller', { name: call.caller_name })
                    : t('waiterCalls.callerUnknown')}
                </Text>
                {call.reason && (
                  <Text variant="bodySmall" style={styles.callReason} numberOfLines={1}>
                    {call.reason}
                  </Text>
                )}
              </View>
            </View>
          </View>

          {/* Action Buttons */}
          {!isResolved && (
            <View style={styles.callActions}>
              {!isAcknowledged && (
                <Button
                  mode="outlined"
                  compact
                  onPress={() => acknowledgeMutation.mutate(call.id)}
                  loading={acknowledgeMutation.isPending}
                  disabled={acknowledgeMutation.isPending}
                  style={styles.acknowledgeBtn}
                  textColor={colors.info}
                  accessibilityRole="button"
                  accessibilityLabel={t('waiterCalls.acknowledge') + ` ${t('waiterCalls.table', { number: call.table_number })}`}
                >
                  {t('waiterCalls.acknowledge')}
                </Button>
              )}
              <Button
                mode="contained"
                compact
                onPress={() => resolveMutation.mutate(call.id)}
                loading={resolveMutation.isPending}
                disabled={resolveMutation.isPending}
                style={styles.resolveBtn}
                buttonColor={colors.success}
                accessibilityRole="button"
                accessibilityLabel={t('waiterCalls.attended') + ` ${t('waiterCalls.table', { number: call.table_number })}`}
              >
                {t('waiterCalls.attended')}
              </Button>
            </View>
          )}

          {isResolved && (
            <Chip compact style={styles.resolvedChip} textStyle={styles.resolvedChipText}>
              {t('waiterCalls.attended')}
            </Chip>
          )}
        </Card.Content>
      </Card>
    );
  };

  // ============================================
  // RENDER STATES
  // ============================================

  if (isLoading) {
    return (
      <ScreenContainer>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text variant="headlineSmall" style={styles.headerTitle}>
            {t('waiterCalls.title')}
          </Text>
        </View>
        <CallSkeleton colors={colors} />
      </View>
      </ScreenContainer>
    );
  }

  if (isError) {
    return (
      <ScreenContainer>
      <View style={styles.errorContainer}>
        <IconButton icon="alert-circle-outline" size={64} iconColor={colors.foregroundMuted} />
        <Text variant="bodyLarge" style={styles.errorText}>
          {t('waiterCalls.errorLoading')}
        </Text>
        <Button
          mode="contained"
          onPress={() => refetch()}
          style={styles.retryButton}
          accessibilityRole="button"
          accessibilityLabel={t('common.retry')}
        >
          {t('common.retry')}
        </Button>
      </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <IconButton icon="bell-ring" size={24} iconColor={colors.primary} style={{ margin: 0 }} />
          <Text variant="headlineSmall" style={styles.headerTitle}>
            {t('waiterCalls.title')}
          </Text>
          {activeCalls.length > 0 && (
            <View style={[styles.badge, { backgroundColor: colors.error }]}>
              <Text variant="labelSmall" style={styles.badgeText}>
                {activeCalls.length}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <SegmentedButtons
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as Tab)}
          buttons={[
            { value: 'active', label: `${t('waiterCalls.active')} (${activeCalls.length})` },
            { value: 'resolved', label: t('waiterCalls.resolved') },
          ]}
        />
      </View>

      {/* Calls List */}
      {displayCalls.length === 0 ? (
        <View style={styles.emptyContainer}>
          <IconButton
            icon={activeTab === 'active' ? 'bell-check-outline' : 'check-circle-outline'}
            size={80}
            iconColor={colors.foregroundMuted}
          />
          <Text variant="headlineSmall" style={styles.emptyTitle}>
            {activeTab === 'active' ? t('waiterCalls.emptyActive') : t('waiterCalls.emptyResolved')}
          </Text>
          <Text variant="bodyMedium" style={styles.emptyMessage}>
            {activeTab === 'active' ? t('waiterCalls.emptyActiveMessage') : ''}
          </Text>
        </View>
      ) : (
        <FlatList
          data={displayCalls}
          keyExtractor={(item) => item.id}
          renderItem={renderCallCard}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          contentContainerStyle={styles.listContent}
          getItemLayout={(_, index) => ({
            length: 110,
            offset: 110 * index,
            index,
          })}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}
    </View>
    </ScreenContainer>
  );
}

// ============================================
// STYLES
// ============================================

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    headerTitle: {
      color: colors.foreground,
      fontWeight: 'bold',
    },
    badge: {
      width: 24,
      height: 24,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
    },
    badgeText: {
      color: colors.premiumCardForeground,
      fontWeight: 'bold',
      fontSize: 12,
    },
    tabContainer: {
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingBottom: 24,
    },
    callCard: {
      backgroundColor: colors.card,
      borderRadius: 14,
    },
    callContent: {
      gap: 12,
    },
    callInfo: {},
    tableRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    tableIcon: {
      width: 48,
      height: 48,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
    },
    tableNumber: {
      fontWeight: 'bold',
    },
    callDetails: {
      flex: 1,
      gap: 2,
    },
    callTitle: {
      color: colors.foreground,
      fontWeight: '600',
    },
    callTime: {
      color: colors.foregroundMuted,
    },
    callerName: {
      color: colors.foregroundSecondary,
    },
    callReason: {
      color: colors.foregroundMuted,
      fontStyle: 'italic',
    },
    callActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
    },
    acknowledgeBtn: {
      borderRadius: 8,
      borderColor: colors.info,
    },
    resolveBtn: {
      borderRadius: 8,
    },
    resolvedChip: {
      backgroundColor: colors.successBackground,
      alignSelf: 'flex-start',
    },
    resolvedChipText: {
      color: colors.success,
      fontSize: 12,
    },
    // States
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 40,
      backgroundColor: colors.background,
    },
    errorText: {
      color: colors.foregroundSecondary,
      marginTop: 12,
      textAlign: 'center',
    },
    retryButton: {
      marginTop: 16,
      borderRadius: 12,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 40,
    },
    emptyTitle: {
      marginTop: 16,
      color: colors.foreground,
      textAlign: 'center',
    },
    emptyMessage: {
      marginTop: 8,
      color: colors.foregroundMuted,
      textAlign: 'center',
      lineHeight: 22,
    },
  });
