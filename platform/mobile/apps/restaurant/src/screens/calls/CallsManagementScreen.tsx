/**
 * CallsManagementScreen - Service Calls Management Dashboard
 *
 * Displays real-time service calls for the restaurant staff.
 * Features stats header, tabbed navigation (Pending/Acknowledged/Resolved),
 * call cards with actions, and WebSocket real-time updates.
 *
 * @module restaurant/screens/calls
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
  Platform,
  Pressable,
} from 'react-native';
import {
  Text,
  IconButton,
  Button,
  Card,
  Chip,
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '@/shared/hooks/useI18n';
import { useWebSocket } from '@/shared/hooks/useWebSocket';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { useAuth } from '@/shared/hooks/useAuth';
import { useRoute, RouteProp } from '@react-navigation/native';
import ApiService from '@/shared/services/api';
import * as Haptics from 'expo-haptics';

// ============================================
// TYPES
// ============================================

type CallType = 'waiter' | 'manager' | 'help' | 'emergency';
type CallStatus = 'pending' | 'acknowledged' | 'resolved' | 'cancelled';
type Tab = 'pending' | 'acknowledged' | 'resolved';

interface ServiceCall {
  id: string;
  restaurant_id: string;
  table_id: string | null;
  user_id: string;
  call_type: CallType;
  status: CallStatus;
  message: string | null;
  called_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  caller?: {
    id: string;
    full_name: string;
  };
}

interface CallStats {
  pendingCount: number;
  acknowledgedCount: number;
  resolvedTodayCount: number;
  avgResponseTimeMs: number | null;
}

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

function getUrgencyColor(dateStr: string, colors: Record<string, string>): string {
  const diffMin = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 60000,
  );
  if (diffMin >= 10) return colors.error;
  if (diffMin >= 5) return colors.warning;
  return colors.success;
}

function getCallTypeColor(type: CallType, colors: Record<string, string>): string {
  switch (type) {
    case 'waiter':
      return colors.primary;
    case 'manager':
      return colors.secondary;
    case 'help':
      return colors.info;
    case 'emergency':
      return colors.error;
    default:
      return colors.foregroundSecondary;
  }
}

function getCallTypeIcon(type: CallType): string {
  switch (type) {
    case 'waiter':
      return 'account-tie';
    case 'manager':
      return 'shield-account';
    case 'help':
      return 'help-circle';
    case 'emergency':
      return 'alert-circle';
    default:
      return 'bell';
  }
}

function formatResponseTime(ms: number | null): string {
  if (ms === null) return '--';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

// ============================================
// SKELETON
// ============================================

function CallSkeleton({ colors }: { colors: Record<string, string> }) {
  return (
    <View style={{ padding: 16, gap: 12 }}>
      {[1, 2, 3].map((i) => (
        <View
          key={i}
          style={{
            backgroundColor: colors.card,
            borderRadius: 20,
            padding: 16,
            gap: 12,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View
              style={{
                width: 100,
                height: 20,
                borderRadius: 4,
                backgroundColor: colors.backgroundTertiary,
              }}
            />
            <View
              style={{
                width: 60,
                height: 24,
                borderRadius: 20,
                backgroundColor: colors.backgroundTertiary,
              }}
            />
          </View>
          <View
            style={{
              width: 180,
              height: 14,
              borderRadius: 4,
              backgroundColor: colors.backgroundTertiary,
            }}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            <View
              style={{
                width: 100,
                height: 36,
                borderRadius: 16,
                backgroundColor: colors.backgroundTertiary,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

// ============================================
// TAB SELECTOR
// ============================================

function TabSelector({
  tabs,
  activeTab,
  onTabChange,
  colors,
}: {
  tabs: { id: Tab; label: string }[];
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  colors: Record<string, string>;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: `${colors.foreground}0D`,
        borderRadius: 12,
        padding: 4,
        marginHorizontal: 16,
        marginVertical: 12,
      }}
    >
      {tabs.map((tab) => (
        <Pressable
          key={tab.id}
          style={[
            {
              flex: 1,
              paddingVertical: 8,
              borderRadius: 10,
              alignItems: 'center',
            },
            activeTab === tab.id && {
              backgroundColor: colors.card,
              elevation: 2,
              shadowColor: colors.shadowColor,
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.1,
              shadowRadius: 2,
            },
          ]}
          onPress={() => onTabChange(tab.id)}
          accessibilityLabel={tab.label}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: '600',
              color: activeTab === tab.id ? colors.foreground : colors.foregroundMuted,
            }}
          >
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ============================================
// COMPONENT
// ============================================

type CallsManagementRouteParams = {
  CallsManagement: { restaurantId?: string };
};

export default function CallsManagementScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const route = useRoute<RouteProp<CallsManagementRouteParams, 'CallsManagement'>>();
  const { connected, on, off, emit } = useWebSocket('/calls');

  const [activeTab, setActiveTab] = useState<Tab>('pending');
  const [refreshing, setRefreshing] = useState(false);

  // Derive restaurantId from route params first, then from user's assigned restaurant
  const restaurantId = useMemo(() => {
    return route.params?.restaurantId ?? user?.roles?.[0]?.restaurant_id ?? '';
  }, [route.params?.restaurantId, user]);

  // ============================================
  // WEBSOCKET
  // ============================================

  useEffect(() => {
    if (!restaurantId || !connected) return;
    emit('joinRestaurant', { restaurantId });

    const onNewCall = () => {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
      queryClient.invalidateQueries({ queryKey: ['service-calls'] });
      queryClient.invalidateQueries({ queryKey: ['service-calls-stats'] });
    };

    const onCallUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ['service-calls'] });
      queryClient.invalidateQueries({ queryKey: ['service-calls-stats'] });
    };

    on('call:new', onNewCall);
    on('call:updated', onCallUpdated);

    return () => {
      off('call:new', onNewCall);
      off('call:updated', onCallUpdated);
      emit('leaveRestaurant', { restaurantId });
    };
  }, [restaurantId, connected, emit, on, off, queryClient]);

  // ============================================
  // QUERIES
  // ============================================

  const {
    data: stats,
    isLoading: statsLoading,
  } = useQuery<CallStats>({
    queryKey: ['service-calls-stats', restaurantId],
    queryFn: async () => {
      const res = await ApiService.get(`/calls/restaurant/${restaurantId}/stats`);
      return res.data;
    },
    refetchInterval: 15000,
  });

  const {
    data: calls = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<ServiceCall[]>({
    queryKey: ['service-calls', restaurantId, activeTab],
    queryFn: async () => {
      if (activeTab === 'pending') {
        const res = await ApiService.get(`/calls/restaurant/${restaurantId}/active`);
        return res.data;
      }
      const res = await ApiService.get(
        `/calls/restaurant/${restaurantId}?status=${activeTab}`,
      );
      return res.data;
    },
    refetchInterval: activeTab === 'pending' ? 10000 : 30000,
  });

  // ============================================
  // MUTATIONS
  // ============================================

  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) => ApiService.patch(`/calls/${id}/acknowledge`),
    onSuccess: () => {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      queryClient.invalidateQueries({ queryKey: ['service-calls'] });
      queryClient.invalidateQueries({ queryKey: ['service-calls-stats'] });
    },
    onError: () => {
      Alert.alert(t('common.error'), t('calls.errorUpdating'));
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) => ApiService.patch(`/calls/${id}/resolve`),
    onSuccess: () => {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
      queryClient.invalidateQueries({ queryKey: ['service-calls'] });
      queryClient.invalidateQueries({ queryKey: ['service-calls-stats'] });
    },
    onError: () => {
      Alert.alert(t('common.error'), t('calls.errorUpdating'));
    },
  });

  // ============================================
  // HANDLERS
  // ============================================

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // ============================================
  // RENDER CARD
  // ============================================

  const renderCallCard = ({ item: call }: { item: ServiceCall }) => {
    const urgencyColor = getUrgencyColor(call.called_at, colors);
    const typeColor = getCallTypeColor(call.call_type, colors);
    const typeIcon = getCallTypeIcon(call.call_type);
    const isPending = call.status === 'pending';
    const isAcknowledged = call.status === 'acknowledged';
    const isResolved = call.status === 'resolved';
    const timeSince = getTimeSinceCall(call.called_at);

    // Determine card background + border based on status
    let cardBg = colors.card;
    let cardBorderColor = colors.border;
    if (isPending) {
      cardBg = `${colors.warning}1A`;
      cardBorderColor = `${colors.warning}33`;
    } else if (isAcknowledged) {
      cardBg = `${colors.info}1A`;
      cardBorderColor = `${colors.info}33`;
    }

    return (
      <View
        style={{
          backgroundColor: cardBg,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: cardBorderColor,
          padding: 16,
          gap: 8,
          ...(isPending ? { borderLeftWidth: 4, borderLeftColor: urgencyColor } : {}),
        }}
      >
        {/* Header Row: Table + Type Badge */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, flex: 1 }}>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: `${urgencyColor}1A`,
              }}
            >
              <Text
                variant="titleLarge"
                style={{ fontWeight: '700', color: urgencyColor }}
              >
                {call.table_id ? call.table_id.slice(-2) : '--'}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="titleMedium" style={{ color: colors.foreground, fontWeight: '600' }}>
                {t('calls.tableNumber', {
                  number: call.table_id ? call.table_id.slice(-2) : '--',
                })}
              </Text>
              <Text variant="bodySmall" style={{ color: colors.foregroundMuted }}>
                {t('calls.timeAgo', { time: timeSince })}
              </Text>
            </View>
          </View>

          {/* Type Badge (pill) */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: `${typeColor}1A`,
            }}
          >
            <IconButton
              icon={typeIcon}
              size={12}
              iconColor={typeColor}
              style={{ margin: 0, padding: 0, width: 12, height: 12, marginRight: 4 }}
            />
            <Text style={{ fontSize: 10, fontWeight: '600', color: typeColor }}>
              {t(`calls.type.${call.call_type}`)}
            </Text>
          </View>
        </View>

        {/* Caller Name */}
        <Text variant="bodySmall" style={{ color: colors.foregroundSecondary }}>
          {call.caller?.full_name || t('waiterCalls.callerUnknown')}
        </Text>

        {/* Message */}
        {call.message && (
          <Text
            variant="bodySmall"
            style={{
              color: colors.foregroundMuted,
              fontStyle: 'italic',
              backgroundColor: `${colors.foreground}0A`,
              padding: 10,
              borderRadius: 12,
            }}
            numberOfLines={2}
          >
            {call.message}
          </Text>
        )}

        {/* Action Buttons */}
        {!isResolved && (
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            {isPending && (
              <TouchableButton
                label={t('calls.acknowledge')}
                icon="check"
                bgColor={`${colors.info}1A`}
                textColor={colors.info}
                borderColor={`${colors.info}33`}
                loading={acknowledgeMutation.isPending}
                disabled={acknowledgeMutation.isPending}
                onPress={() => acknowledgeMutation.mutate(call.id)}
              />
            )}
            <TouchableButton
              label={t('calls.resolve')}
              icon="check-all"
              bgColor={colors.success}
              textColor={colors.premiumCardForeground}
              loading={resolveMutation.isPending}
              disabled={resolveMutation.isPending}
              onPress={() => resolveMutation.mutate(call.id)}
            />
          </View>
        )}

        {isResolved && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              alignSelf: 'flex-start',
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: colors.successBackground,
            }}
          >
            <Text style={{ color: colors.success, fontSize: 10, fontWeight: '600' }}>
              {t('calls.status.resolved')}
            </Text>
          </View>
        )}
      </View>
    );
  };

  // ============================================
  // RENDER STATES
  // ============================================

  if (isLoading) {
    return (
      <ScreenContainer>
      <View style={{ flex: 1, backgroundColor: colors.backgroundSecondary }}>
        <LinearGradient
          colors={[colors.primary, colors.accent]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{
            paddingTop: insets.top + 12,
            paddingBottom: 20,
            paddingHorizontal: 20,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <IconButton
              icon="bell-ring"
              size={24}
              iconColor={colors.premiumCardForeground}
              style={{ margin: 0 }}
            />
            <Text style={{ color: colors.premiumCardForeground, fontSize: 24, fontWeight: '700' }}>
              {t('calls.title')}
            </Text>
          </View>
        </LinearGradient>
        <CallSkeleton colors={colors} />
      </View>
      </ScreenContainer>
    );
  }

  if (isError) {
    return (
      <ScreenContainer>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, backgroundColor: colors.background }}>
        <IconButton
          icon="alert-circle-outline"
          size={64}
          iconColor={colors.foregroundMuted}
        />
        <Text variant="bodyLarge" style={{ color: colors.foregroundSecondary, marginTop: 12, textAlign: 'center' }}>
          {t('calls.errorLoading')}
        </Text>
        <Button
          mode="contained"
          onPress={() => refetch()}
          style={{ marginTop: 16, borderRadius: 16 }}
          buttonColor={colors.primary}
        >
          {t('common.retry')}
        </Button>
      </View>
      </ScreenContainer>
    );
  }

  const tabItems: { id: Tab; label: string }[] = [
    { id: 'pending', label: `${t('calls.pendingTab')} (${stats?.pendingCount ?? 0})` },
    { id: 'acknowledged', label: t('calls.acknowledgedTab') },
    { id: 'resolved', label: t('calls.resolvedTab') },
  ];

  return (
    <ScreenContainer>
    <View style={{ flex: 1, backgroundColor: colors.backgroundSecondary }}>
      {/* Gradient Header */}
      <LinearGradient
        colors={[colors.primary, colors.accent]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{
          paddingTop: insets.top + 12,
          paddingBottom: 20,
          paddingHorizontal: 20,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <IconButton
            icon="bell-ring"
            size={24}
            iconColor={colors.premiumCardForeground}
            style={{ margin: 0 }}
          />
          <Text style={{ color: colors.premiumCardForeground, fontSize: 24, fontWeight: '700', flex: 1 }}>
            {t('calls.title')}
          </Text>
          {(stats?.pendingCount ?? 0) > 0 && (
            <View
              style={{
                minWidth: 24,
                height: 24,
                borderRadius: 12,
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: 'rgba(255,255,255,0.25)',
                paddingHorizontal: 6,
              }}
            >
              <Text style={{ color: colors.premiumCardForeground, fontWeight: '700', fontSize: 12 }}>
                {stats?.pendingCount}
              </Text>
            </View>
          )}
        </View>

        {/* Stats Row within gradient */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-around',
            alignItems: 'center',
            marginTop: 16,
            paddingTop: 14,
            borderTopWidth: 1,
            borderTopColor: 'rgba(255,255,255,0.2)',
          }}
        >
          <View style={{ alignItems: 'center', flex: 1 }}>
            <Text style={{ color: colors.premiumCardForeground, fontSize: 24, fontWeight: '700' }}>
              {stats?.pendingCount ?? 0}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2, textAlign: 'center' }}>
              {t('calls.pendingTab')}
            </Text>
          </View>
          <View style={{ width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.2)' }} />
          <View style={{ alignItems: 'center', flex: 1 }}>
            <Text style={{ color: colors.premiumCardForeground, fontSize: 24, fontWeight: '700' }}>
              {formatResponseTime(stats?.avgResponseTimeMs ?? null)}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2, textAlign: 'center' }}>
              {t('calls.avgResponseTime')}
            </Text>
          </View>
          <View style={{ width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.2)' }} />
          <View style={{ alignItems: 'center', flex: 1 }}>
            <Text style={{ color: colors.premiumCardForeground, fontSize: 24, fontWeight: '700' }}>
              {stats?.resolvedTodayCount ?? 0}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2, textAlign: 'center' }}>
              {t('calls.resolvedTab')}
            </Text>
          </View>
        </View>
      </LinearGradient>

      {/* Tab Selector */}
      <TabSelector
        tabs={tabItems}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        colors={colors}
      />

      {/* Calls List */}
      <FlatList
        data={calls}
        keyExtractor={(item) => item.id}
        renderItem={renderCallCard}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 10 }}
        showsVerticalScrollIndicator={false}
        getItemLayout={(_, index) => ({
          length: 150,
          offset: 150 * index,
          index,
        })}
        ListEmptyComponent={
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
            <IconButton
              icon={
                activeTab === 'pending'
                  ? 'bell-check-outline'
                  : activeTab === 'acknowledged'
                    ? 'check-circle-outline'
                    : 'check-all'
              }
              size={80}
              iconColor={colors.foregroundMuted}
            />
            <Text variant="headlineSmall" style={{ marginTop: 16, color: colors.foreground, textAlign: 'center' }}>
              {activeTab === 'resolved'
                ? t('calls.empty.resolved')
                : t('calls.empty.pending')}
            </Text>
          </View>
        }
      />
    </View>
    </ScreenContainer>
  );
}

// ============================================
// SMALL BUTTON COMPONENT
// ============================================

function TouchableButton({
  label,
  icon,
  bgColor,
  textColor,
  borderColor,
  loading,
  disabled,
  onPress,
}: {
  label: string;
  icon: string;
  bgColor: string;
  textColor: string;
  borderColor?: string;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 16,
        backgroundColor: bgColor,
        ...(borderColor ? { borderWidth: 1, borderColor } : {}),
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <IconButton
        icon={icon}
        size={14}
        iconColor={textColor}
        style={{ margin: 0, padding: 0, width: 14, height: 14, marginRight: 4 }}
      />
      <Text style={{ fontSize: 14, fontWeight: '600', color: textColor }}>
        {label}
      </Text>
    </Pressable>
  );
}
