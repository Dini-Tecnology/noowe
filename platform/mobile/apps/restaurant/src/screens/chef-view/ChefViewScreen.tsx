/**
 * ChefViewScreen — Bird's-eye kitchen overview for the Chef role
 *
 * Shows a summary of all cook stations, kitchen-wide metrics (active tables,
 * delivery queue, avg prep time) and real-time alerts (late items, capacity
 * warnings, rider arrivals). Tapping a station card navigates to the
 * CookStationScreen filtered for that station.
 *
 * Data source: GET /kds/brain/chef/overview  (10s polling + WebSocket push)
 *
 * @module chef-view/ChefViewScreen
 */

import React, { useMemo, useCallback, useEffect } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { Text, Card, Badge } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import ApiService from '@/shared/services/api';
import { useI18n } from '@/shared/hooks/useI18n';
import { useAuth } from '@/shared/hooks/useAuth';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { SkeletonBlock } from '@okinawa/shared/components/ui/SkeletonBlock';
import socketService from '../../services/socket';

// ============================================
// TYPES
// ============================================

interface StationSummary {
  station_id: string;
  name: string;
  emoji: string;
  active_count: number;
  late_count: number;
  avg_remaining_minutes: number;
}

interface ChefMetrics {
  active_tables: number;
  delivery_queue: number;
  avg_prep_minutes: number;
}

interface ChefAlert {
  type: 'item_late' | 'rider_arriving' | 'capacity_warning';
  message: string;
  order_id: string;
  station_name: string;
  minutes_late?: number;
}

interface ChefOverview {
  stations: StationSummary[];
  metrics: ChefMetrics;
  alerts: ChefAlert[];
}

// ============================================
// ALERT ICON MAPPING
// ============================================

const ALERT_ICONS: Record<ChefAlert['type'], { icon: string; color: 'error' | 'warning' | 'info' }> = {
  item_late: { icon: 'clock-alert-outline', color: 'error' },
  rider_arriving: { icon: 'bike-fast', color: 'info' },
  capacity_warning: { icon: 'alert-octagon-outline', color: 'warning' },
};

// ============================================
// COMPONENT
// ============================================

export default function ChefViewScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { width: screenWidth } = useWindowDimensions();

  const restaurantId = useMemo(() => {
    return user?.roles?.[0]?.restaurant_id ?? '';
  }, [user]);

  // ── Data fetching (10s polling) ──────────────────────────────────

  const {
    data: overview,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<ChefOverview>({
    queryKey: ['chef-overview', restaurantId],
    queryFn: () => ApiService.getChefOverview(restaurantId),
    enabled: !!restaurantId,
    refetchInterval: 10000,
  });

  // ── WebSocket real-time updates ──────────────────────────────────

  useEffect(() => {
    socketService.connect();

    const handleKdsUpdate = () => {
      refetch();
    };

    socketService.on('order:updated', handleKdsUpdate as (data: unknown) => void);
    socketService.on('order:new', handleKdsUpdate as (data: unknown) => void);

    return () => {
      socketService.off('order:updated');
      socketService.off('order:new');
    };
  }, [refetch]);

  // ── Navigation ───────────────────────────────────────────────────

  const handleStationPress = useCallback(
    (stationId: string) => {
      navigation.navigate('CookStation', { stationId });
    },
    [navigation],
  );

  // ── Grid layout ──────────────────────────────────────────────────

  const isTablet = screenWidth >= 768;
  const numColumns = isTablet ? 3 : 2;

  // ── Styles ───────────────────────────────────────────────────────

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.backgroundSecondary,
        },
        header: {
          backgroundColor: colors.card,
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        headerTitle: {
          fontSize: 24,
          fontWeight: 'bold',
          color: colors.foreground,
        },
        headerSubtitle: {
          fontSize: 14,
          color: colors.foregroundMuted,
          marginTop: 2,
        },
        // Summary metrics row
        metricsRow: {
          flexDirection: 'row',
          padding: 12,
          gap: 8,
        },
        metricCard: {
          flex: 1,
          backgroundColor: colors.card,
          borderRadius: 12,
          padding: 12,
          alignItems: 'center',
          elevation: 1,
        },
        metricNumber: {
          fontWeight: 'bold',
          fontSize: 24,
          color: colors.foreground,
          marginTop: 6,
        },
        metricLabel: {
          color: colors.foregroundMuted,
          fontSize: 12,
          marginTop: 4,
          textAlign: 'center',
        },
        // Section title
        sectionTitle: {
          fontSize: 16,
          fontWeight: '700',
          color: colors.foreground,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 8,
        },
        // Station grid
        stationGrid: {
          paddingHorizontal: 8,
          paddingBottom: 12,
        },
        stationCardWrapper: {
          flex: 1,
          margin: 4,
        },
        stationCard: {
          backgroundColor: colors.card,
          borderRadius: 16,
          padding: 16,
          elevation: 2,
        },
        stationEmoji: {
          fontSize: 28,
          marginBottom: 8,
        },
        stationName: {
          fontSize: 16,
          fontWeight: '600',
          color: colors.foreground,
        },
        stationActiveRow: {
          flexDirection: 'row',
          alignItems: 'center',
          marginTop: 8,
          gap: 6,
        },
        stationActiveText: {
          fontSize: 14,
          color: colors.foregroundSecondary,
        },
        lateBadge: {
          backgroundColor: colors.error,
        },
        stationAvgRow: {
          flexDirection: 'row',
          alignItems: 'center',
          marginTop: 4,
          gap: 4,
        },
        stationAvgText: {
          fontSize: 12,
          color: colors.foregroundMuted,
        },
        // Alerts section
        alertsList: {
          paddingHorizontal: 12,
          paddingBottom: 24,
        },
        alertCard: {
          backgroundColor: colors.card,
          borderRadius: 12,
          padding: 12,
          marginBottom: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          elevation: 1,
        },
        alertIconContainer: {
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
        },
        alertContent: {
          flex: 1,
        },
        alertMessage: {
          fontSize: 14,
          color: colors.foreground,
          fontWeight: '500',
        },
        alertStation: {
          fontSize: 12,
          color: colors.foregroundMuted,
          marginTop: 2,
        },
        // Empty states
        emptyContainer: {
          alignItems: 'center',
          paddingVertical: 32,
        },
        emptyText: {
          color: colors.foregroundMuted,
          marginTop: 8,
          fontSize: 14,
        },
        // Skeleton
        skeletonContainer: {
          padding: 16,
          gap: 16,
        },
      }),
    [colors],
  );

  // ── Skeleton loading state ───────────────────────────────────────

  if (isLoading) {
    return (
      <ScreenContainer>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('kds.chef_title')}</Text>
        </View>
        <View style={styles.skeletonContainer}>
          {/* Metrics skeleton */}
          <View style={styles.metricsRow}>
            {[1, 2, 3].map((i) => (
              <View key={i} style={styles.metricCard}>
                <SkeletonBlock width={40} height={40} borderRadius={20} />
                <SkeletonBlock width={50} height={22} borderRadius={4} style={{ marginTop: 6 }} />
                <SkeletonBlock width={70} height={12} borderRadius={4} style={{ marginTop: 4 }} />
              </View>
            ))}
          </View>
          {/* Station cards skeleton */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[1, 2].map((i) => (
              <View key={i} style={[styles.stationCard, { flex: 1 }]}>
                <SkeletonBlock width={28} height={28} borderRadius={4} />
                <SkeletonBlock width={100} height={16} borderRadius={4} style={{ marginTop: 8 }} />
                <SkeletonBlock width={80} height={12} borderRadius={4} style={{ marginTop: 8 }} />
              </View>
            ))}
          </View>
        </View>
      </View>
      </ScreenContainer>
    );
  }

  const stations = overview?.stations ?? [];
  const metrics = overview?.metrics ?? { active_tables: 0, delivery_queue: 0, avg_prep_minutes: 0 };
  const alerts = overview?.alerts ?? [];

  // ── Render helpers ───────────────────────────────────────────────

  const renderStationCard = ({ item }: { item: StationSummary }) => (
    <TouchableOpacity
      style={styles.stationCardWrapper}
      onPress={() => handleStationPress(item.station_id)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${item.name} station, ${item.active_count} active`}
    >
      <Card style={styles.stationCard}>
        <Text style={styles.stationEmoji}>{item.emoji}</Text>
        <Text style={styles.stationName}>{item.name}</Text>

        <View style={styles.stationActiveRow}>
          <Icon name="chef-hat" size={16} color={colors.foregroundSecondary} />
          <Text style={styles.stationActiveText}>
            {t('kds.chef_view.station_load', { count: String(item.active_count) })}
          </Text>
          {item.late_count > 0 && (
            <Badge size={20} style={styles.lateBadge}>
              {item.late_count}
            </Badge>
          )}
        </View>

        <View style={styles.stationAvgRow}>
          <Icon name="timer-outline" size={14} color={colors.foregroundMuted} />
          <Text style={styles.stationAvgText}>
            ~{item.avg_remaining_minutes} min
          </Text>
        </View>
      </Card>
    </TouchableOpacity>
  );

  const renderAlert = (alert: ChefAlert, index: number) => {
    const alertConfig = ALERT_ICONS[alert.type];
    const iconColor = colors[alertConfig.color];

    return (
      <View key={`alert-${index}`} style={styles.alertCard}>
        <View style={[styles.alertIconContainer, { backgroundColor: `${iconColor}20` }]}>
          <Icon name={alertConfig.icon} size={22} color={iconColor} />
        </View>
        <View style={styles.alertContent}>
          <Text style={styles.alertMessage}>{alert.message}</Text>
          <Text style={styles.alertStation}>{alert.station_name}</Text>
        </View>
        {alert.minutes_late != null && (
          <Text style={{ color: colors.error, fontWeight: 'bold', fontSize: 14 }}>
            {alert.minutes_late} min
          </Text>
        )}
      </View>
    );
  };

  // ── Main render ──────────────────────────────────────────────────

  return (
    <ScreenContainer>
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('kds.chef_title')}</Text>
        <Text style={styles.headerSubtitle}>{t('cook.myStation')}</Text>
      </View>

      <FlatList
        data={stations}
        keyExtractor={(item) => item.station_id}
        numColumns={numColumns}
        key={numColumns}
        renderItem={renderStationCard}
        contentContainerStyle={styles.stationGrid}
        getItemLayout={(_, index) => ({
          length: 120,
          offset: 120 * index,
          index,
        })}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <>
            {/* Summary Metrics */}
            <View style={styles.metricsRow}>
              <View style={styles.metricCard}>
                <Icon name="table-furniture" size={24} color={colors.primary} />
                <Text style={styles.metricNumber}>{metrics.active_tables}</Text>
                <Text style={styles.metricLabel}>
                  {t('kds.chef_view.active_tables')}
                </Text>
              </View>
              <View style={styles.metricCard}>
                <Icon name="moped-outline" size={24} color={colors.info} />
                <Text style={styles.metricNumber}>{metrics.delivery_queue}</Text>
                <Text style={styles.metricLabel}>
                  {t('kds.chef_view.delivery_queue')}
                </Text>
              </View>
              <View style={styles.metricCard}>
                <Icon name="timer-sand" size={24} color={colors.warning} />
                <Text style={styles.metricNumber}>{metrics.avg_prep_minutes}</Text>
                <Text style={styles.metricLabel}>
                  {t('kds.chef_view.avg_time')}
                </Text>
              </View>
            </View>

            {/* Section title: Stations */}
            <Text style={styles.sectionTitle}>
              {t('kds.settings.title')}
            </Text>
          </>
        }
        ListFooterComponent={
          <>
            {/* Alerts section */}
            {alerts.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>
                  {t('kds.chef_view.alerts')}
                </Text>
                <View style={styles.alertsList}>
                  {alerts.map(renderAlert)}
                </View>
              </>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="chef-hat" size={48} color={colors.foregroundMuted} />
            <Text style={styles.emptyText}>
              {t('kds.empty_state.kitchen')}
            </Text>
          </View>
        }
      />
    </View>
    </ScreenContainer>
  );
}
