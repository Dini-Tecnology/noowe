/**
 * KdsAnalyticsScreen -- Kitchen analytics dashboard
 *
 * Displays prep-time metrics per station, bottleneck ranking, throughput by
 * shift, platform performance comparison, and AI-generated prep-time
 * suggestions that the chef / manager can accept or reject.
 *
 * Data source: KDS Brain analytics endpoints (30s polling + pull-to-refresh)
 *
 * @module restaurant/screens/analytics/KdsAnalyticsScreen
 */

import React, { useState, useMemo, useCallback } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native';
import {
  Text,
  Card,
  SegmentedButtons,
  Button,
  Chip,
  IconButton,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ApiService from '@/shared/services/api';
import { useI18n } from '@/shared/hooks/useI18n';
import { useAuth } from '@/shared/hooks/useAuth';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { SkeletonBlock } from '@okinawa/shared/components/ui/SkeletonBlock';

// ============================================
// TYPES
// ============================================

interface StationPrepTime {
  station_id: string;
  station_name: string;
  station_emoji: string;
  avg_prep_minutes: number;
  late_percentage: number;
  total_prepared: number;
}

interface Bottleneck {
  station_id: string;
  station_name: string;
  station_emoji: string;
  late_percentage: number;
  avg_delay_minutes: number;
}

interface ShiftThroughput {
  shift: 'lunch' | 'dinner' | 'late_night';
  items_per_hour: number;
}

interface PlatformPerf {
  platform: string;
  avg_prep_minutes: number;
  late_percentage: number;
}

interface PrepTimeSuggestion {
  id: string;
  menu_item_name: string;
  current_prep_minutes: number;
  suggested_prep_minutes: number;
  confidence_score: number;
}

// ============================================
// PERIOD OPTIONS
// ============================================

const PERIOD_OPTIONS = [
  { value: '7', label: '' },
  { value: '30', label: '' },
  { value: '90', label: '' },
];

// ============================================
// COMPONENT
// ============================================

export default function KdsAnalyticsScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const restaurantId = useMemo(() => {
    return user?.roles?.[0]?.restaurant_id ?? '';
  }, [user]);

  const [period, setPeriod] = useState('7');
  const periodNum = Number(period);

  // Build period labels from i18n
  const periodButtons = useMemo(
    () => [
      { value: '7', label: t('kds.analytics.period_7d') },
      { value: '30', label: t('kds.analytics.period_30d') },
      { value: '90', label: t('kds.analytics.period_90d') },
    ],
    [t],
  );

  // ── Data queries (30s polling) ───────────────────────────────────

  const {
    data: prepTimes,
    isLoading: loadingPrep,
    refetch: refetchPrep,
    isRefetching: refetchingPrep,
  } = useQuery<StationPrepTime[]>({
    queryKey: ['kds-prep-times', restaurantId, periodNum],
    queryFn: () => ApiService.getKdsPrepTimes(restaurantId, periodNum),
    enabled: !!restaurantId,
    refetchInterval: 30000,
  });

  const {
    data: bottlenecks,
    isLoading: loadingBottlenecks,
    refetch: refetchBottlenecks,
  } = useQuery<Bottleneck[]>({
    queryKey: ['kds-bottlenecks', restaurantId, periodNum],
    queryFn: () => ApiService.getKdsBottlenecks(restaurantId, periodNum),
    enabled: !!restaurantId,
    refetchInterval: 30000,
  });

  const {
    data: throughput,
    isLoading: loadingThroughput,
    refetch: refetchThroughput,
  } = useQuery<ShiftThroughput[]>({
    queryKey: ['kds-throughput', restaurantId, periodNum],
    queryFn: () => ApiService.getKdsThroughput(restaurantId, periodNum),
    enabled: !!restaurantId,
    refetchInterval: 30000,
  });

  const {
    data: platformPerf,
    isLoading: loadingPlatform,
    refetch: refetchPlatform,
  } = useQuery<PlatformPerf[]>({
    queryKey: ['kds-platform-perf', restaurantId, periodNum],
    queryFn: () => ApiService.getKdsPlatformPerformance(restaurantId, periodNum),
    enabled: !!restaurantId,
    refetchInterval: 30000,
  });

  const {
    data: suggestions,
    isLoading: loadingSuggestions,
    refetch: refetchSuggestions,
  } = useQuery<PrepTimeSuggestion[]>({
    queryKey: ['kds-suggestions', restaurantId],
    queryFn: () => ApiService.getKdsSuggestions(restaurantId),
    enabled: !!restaurantId,
    refetchInterval: 30000,
  });

  // ── Mutations ───────────────────────────────────────────────────

  const acceptMutation = useMutation({
    mutationFn: (id: string) => ApiService.acceptSuggestion(id),
    onSuccess: () => {
      Alert.alert(t('kds.analytics.accepted'));
      queryClient.invalidateQueries({ queryKey: ['kds-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['kds-prep-times'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => ApiService.rejectSuggestion(id),
    onSuccess: () => {
      Alert.alert(t('kds.analytics.rejected'));
      queryClient.invalidateQueries({ queryKey: ['kds-suggestions'] });
    },
  });

  // ── Pull-to-refresh ─────────────────────────────────────────────

  const isRefreshing = refetchingPrep;

  const handleRefresh = useCallback(() => {
    refetchPrep();
    refetchBottlenecks();
    refetchThroughput();
    refetchPlatform();
    refetchSuggestions();
  }, [refetchPrep, refetchBottlenecks, refetchThroughput, refetchPlatform, refetchSuggestions]);

  // ── Helpers ─────────────────────────────────────────────────────

  const getLateColor = (latePct: number) => {
    if (latePct < 15) return colors.success;
    if (latePct <= 30) return colors.warning;
    return colors.error;
  };

  const shiftLabel = (shift: string) => {
    switch (shift) {
      case 'lunch':
        return t('kds.analytics.shift_lunch');
      case 'dinner':
        return t('kds.analytics.shift_dinner');
      case 'late_night':
        return t('kds.analytics.shift_late');
      default:
        return shift;
    }
  };

  const platformLabel = (platform: string) => {
    const map: Record<string, string> = {
      noowe: 'NOOWE',
      ifood: 'iFood',
      rappi: 'Rappi',
      ubereats: 'Uber Eats',
    };
    return map[platform] ?? platform;
  };

  // ── Loading state ────────────────────────────────────────────

  const isLoading = loadingPrep && loadingBottlenecks && loadingThroughput && loadingPlatform && loadingSuggestions;

  // ── Styles ──────────────────────────────────────────────────────

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.backgroundSecondary,
        },
        scrollContent: {
          padding: 16,
          paddingBottom: 32,
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
        periodSelector: {
          marginTop: 12,
        },
        sectionTitle: {
          fontSize: 18,
          fontWeight: '700',
          color: colors.foreground,
          marginTop: 20,
          marginBottom: 12,
        },
        // Prep time cards
        stationCard: {
          backgroundColor: colors.card,
          borderRadius: 12,
          padding: 14,
          marginBottom: 10,
          elevation: 1,
          borderLeftWidth: 4,
        },
        stationHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
        },
        stationEmoji: {
          fontSize: 24,
        },
        stationName: {
          fontSize: 16,
          fontWeight: '600',
          color: colors.foreground,
          flex: 1,
        },
        metricsRow: {
          flexDirection: 'row',
          gap: 12,
        },
        metricItem: {
          flex: 1,
        },
        metricLabel: {
          fontSize: 12,
          color: colors.foregroundMuted,
          marginBottom: 2,
        },
        metricValue: {
          fontSize: 16,
          fontWeight: '700',
          color: colors.foreground,
        },
        // Bottleneck list
        bottleneckRow: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.card,
          borderRadius: 10,
          padding: 12,
          marginBottom: 8,
          gap: 10,
          elevation: 1,
        },
        bottleneckRank: {
          fontSize: 16,
          fontWeight: '800',
          color: colors.foregroundMuted,
          width: 24,
          textAlign: 'center',
        },
        bottleneckEmoji: {
          fontSize: 20,
        },
        bottleneckName: {
          flex: 1,
          fontSize: 16,
          fontWeight: '600',
          color: colors.foreground,
        },
        bottleneckLate: {
          fontSize: 14,
          fontWeight: '700',
        },
        bottleneckDelay: {
          fontSize: 12,
          color: colors.foregroundMuted,
          marginLeft: 4,
          width: 70,
          textAlign: 'right',
        },
        // Throughput bars
        throughputRow: {
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: 12,
          gap: 8,
        },
        throughputLabel: {
          width: 70,
          fontSize: 14,
          fontWeight: '600',
          color: colors.foreground,
        },
        throughputBarBg: {
          flex: 1,
          height: 24,
          borderRadius: 12,
          backgroundColor: colors.border,
          overflow: 'hidden',
        },
        throughputBar: {
          height: 24,
          borderRadius: 12,
          justifyContent: 'center',
          paddingHorizontal: 8,
        },
        throughputValue: {
          fontSize: 12,
          fontWeight: '700',
          color: colors.premiumCardForeground,
        },
        // Platform cards
        platformCard: {
          backgroundColor: colors.card,
          borderRadius: 12,
          padding: 14,
          marginBottom: 10,
          flexDirection: 'row',
          alignItems: 'center',
          elevation: 1,
          gap: 12,
        },
        platformName: {
          flex: 1,
          fontSize: 16,
          fontWeight: '600',
          color: colors.foreground,
        },
        platformMetric: {
          alignItems: 'flex-end',
        },
        platformMetricText: {
          fontSize: 14,
          color: colors.foregroundSecondary,
        },
        platformLatePct: {
          fontSize: 14,
          fontWeight: '700',
        },
        // Suggestion cards
        suggestionCard: {
          backgroundColor: colors.card,
          borderRadius: 12,
          padding: 14,
          marginBottom: 10,
          elevation: 1,
        },
        suggestionHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        },
        suggestionItemName: {
          fontSize: 16,
          fontWeight: '600',
          color: colors.foreground,
          flex: 1,
        },
        confidenceBadge: {
          borderRadius: 12,
          paddingHorizontal: 8,
          paddingVertical: 2,
        },
        confidenceText: {
          fontSize: 12,
          fontWeight: '700',
          color: colors.premiumCardForeground,
        },
        suggestionTimes: {
          flexDirection: 'row',
          gap: 16,
          marginBottom: 12,
        },
        suggestionTimeText: {
          fontSize: 14,
          color: colors.foregroundSecondary,
        },
        suggestionActions: {
          flexDirection: 'row',
          justifyContent: 'flex-end',
          gap: 8,
        },
        emptyContainer: {
          alignItems: 'center',
          paddingVertical: 24,
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

  // ── Skeleton ────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <ScreenContainer>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('kds.analytics.title')}</Text>
        </View>
        <View style={styles.skeletonContainer}>
          <SkeletonBlock width="100%" height={40} borderRadius={8} />
          {[1, 2, 3].map((i) => (
            <SkeletonBlock key={i} width="100%" height={80} borderRadius={12} />
          ))}
          <SkeletonBlock width="100%" height={120} borderRadius={12} />
        </View>
      </View>
      </ScreenContainer>
    );
  }

  // ── Compute max throughput for bar scaling ─────────────────────

  const throughputData = throughput ?? [];
  const maxThroughput = Math.max(...throughputData.map((s) => s.items_per_hour), 1);

  // ── Render ──────────────────────────────────────────────────────

  return (
    <ScreenContainer>
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('kds.analytics.title')}</Text>
        <View style={styles.periodSelector} accessibilityLabel="Analytics period selection">
          <SegmentedButtons
            value={period}
            onValueChange={setPeriod}
            buttons={periodButtons}
          />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* ── Prep Times Section ─────────────────────────────────── */}
        <Text style={styles.sectionTitle}>{t('kds.analytics.prep_times')}</Text>
        {(prepTimes ?? []).map((station) => (
          <View
            key={station.station_id}
            style={[styles.stationCard, { borderLeftColor: getLateColor(station.late_percentage) }]}
          >
            <View style={styles.stationHeader}>
              <Text style={styles.stationEmoji}>{station.station_emoji}</Text>
              <Text style={styles.stationName}>{station.station_name}</Text>
            </View>
            <View style={styles.metricsRow}>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>{t('kds.analytics.avg_time')}</Text>
                <Text style={styles.metricValue}>{station.avg_prep_minutes} min</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>{t('kds.analytics.late_pct')}</Text>
                <Text style={[styles.metricValue, { color: getLateColor(station.late_percentage) }]}>
                  {station.late_percentage.toFixed(1)}%
                </Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>{t('kds.analytics.total_prepared')}</Text>
                <Text style={styles.metricValue}>{station.total_prepared}</Text>
              </View>
            </View>
          </View>
        ))}

        {/* ── Bottlenecks Section ────────────────────────────────── */}
        <Text style={styles.sectionTitle}>{t('kds.analytics.bottlenecks')}</Text>
        {(bottlenecks ?? []).map((b, idx) => (
          <View key={b.station_id} style={styles.bottleneckRow}>
            <Text style={styles.bottleneckRank}>{idx + 1}</Text>
            <Text style={styles.bottleneckEmoji}>{b.station_emoji}</Text>
            <Text style={styles.bottleneckName}>{b.station_name}</Text>
            <Text style={[styles.bottleneckLate, { color: getLateColor(b.late_percentage) }]}>
              {b.late_percentage.toFixed(1)}%
            </Text>
            <Text style={styles.bottleneckDelay}>+{b.avg_delay_minutes} min</Text>
          </View>
        ))}

        {/* ── Throughput Section ──────────────────────────────────── */}
        <Text style={styles.sectionTitle}>{t('kds.analytics.throughput')}</Text>
        {throughputData.map((shift) => {
          const pct = (shift.items_per_hour / maxThroughput) * 100;
          return (
            <View key={shift.shift} style={styles.throughputRow}>
              <Text style={styles.throughputLabel}>{shiftLabel(shift.shift)}</Text>
              <View style={styles.throughputBarBg}>
                <View
                  style={[
                    styles.throughputBar,
                    {
                      width: `${Math.max(pct, 15)}%`,
                      backgroundColor: colors.primary,
                    },
                  ]}
                >
                  <Text style={styles.throughputValue}>
                    {shift.items_per_hour} {t('kds.analytics.items_per_hour')}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}

        {/* ── Platform Performance Section ───────────────────────── */}
        <Text style={styles.sectionTitle}>{t('kds.analytics.platform_perf')}</Text>
        {(platformPerf ?? []).map((p) => (
          <View key={p.platform} style={styles.platformCard}>
            <Text style={styles.platformName}>{platformLabel(p.platform)}</Text>
            <View style={styles.platformMetric}>
              <Text style={styles.platformMetricText}>
                {t('kds.analytics.avg_time')}: {p.avg_prep_minutes} min
              </Text>
              <Text style={[styles.platformLatePct, { color: getLateColor(p.late_percentage) }]}>
                {p.late_percentage.toFixed(1)}% {t('kds.analytics.late_pct')}
              </Text>
            </View>
          </View>
        ))}

        {/* ── Suggestions Section ────────────────────────────────── */}
        <Text style={styles.sectionTitle}>{t('kds.analytics.suggestions')}</Text>
        {(suggestions ?? []).length === 0 ? (
          <View style={styles.emptyContainer}>
            <Icon name="lightbulb-on-outline" size={40} color={colors.foregroundMuted} />
            <Text style={styles.emptyText}>{t('kds.analytics.no_suggestions')}</Text>
          </View>
        ) : (
          (suggestions ?? []).map((s) => {
            const confidenceColor =
              s.confidence_score >= 80 ? colors.success : s.confidence_score >= 60 ? colors.warning : colors.error;
            return (
              <View key={s.id} style={styles.suggestionCard}>
                <View style={styles.suggestionHeader}>
                  <Text style={styles.suggestionItemName}>{s.menu_item_name}</Text>
                  <View style={[styles.confidenceBadge, { backgroundColor: confidenceColor }]}>
                    <Text style={styles.confidenceText}>
                      {t('kds.analytics.confidence', { score: String(s.confidence_score) })}
                    </Text>
                  </View>
                </View>
                <View style={styles.suggestionTimes}>
                  <Text style={styles.suggestionTimeText}>
                    {t('kds.analytics.current_time', { minutes: String(s.current_prep_minutes) })}
                  </Text>
                  <Icon name="arrow-right" size={16} color={colors.foregroundMuted} />
                  <Text style={[styles.suggestionTimeText, { fontWeight: '700', color: colors.primary }]}>
                    {t('kds.analytics.suggested_time', { minutes: String(s.suggested_prep_minutes) })}
                  </Text>
                </View>
                <View style={styles.suggestionActions}>
                  <Button
                    mode="outlined"
                    onPress={() => rejectMutation.mutate(s.id)}
                    loading={rejectMutation.isPending}
                    compact
                    textColor={colors.error}
                    style={{ borderColor: colors.error }}
                  >
                    {t('kds.analytics.reject')}
                  </Button>
                  <Button
                    mode="contained"
                    onPress={() => acceptMutation.mutate(s.id)}
                    loading={acceptMutation.isPending}
                    compact
                    buttonColor={colors.success}
                    textColor={colors.premiumCardForeground}
                  >
                    {t('kds.analytics.accept')}
                  </Button>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
    </ScreenContainer>
  );
}
