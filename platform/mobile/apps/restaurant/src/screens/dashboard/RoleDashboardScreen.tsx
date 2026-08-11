/**
 * RoleDashboardScreen
 *
 * Role-based dashboard that renders different KPI layouts depending on the
 * logged-in user's role (Owner, Manager, Waiter, Chef, Barman).
 *
 * Endpoints consumed:
 *   GET /analytics/dashboard?restaurant_id
 *   GET /analytics/realtime?restaurant_id
 *
 * @module restaurant/screens/dashboard/RoleDashboardScreen
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Text, Card, IconButton } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useI18n } from '@/shared/hooks/useI18n';
import { useAuth } from '@/shared/hooks/useAuth';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import ApiService from '@/shared/services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KpiCardData {
  key: string;
  icon: string;
  label: string;
  value: string | number;
  color: string;
  navigateTo?: string;
}

interface DashboardMetrics {
  revenue_today: number;
  total_orders: number;
  avg_ticket: number;
  staff_active: number;
  best_selling_item: string;
  reviews_avg: number;
  pending_approvals: number;
  active_orders: number;
  stock_alerts: number;
  occupancy_percent: number;
  staff_on_duty: number;
  my_tables: number;
  my_tips_today: number;
  open_calls: number;
  my_avg_rating: number;
  orders_in_kds: number;
  avg_prep_time: number;
  overdue_items: number;
  station_status: string;
  bar_orders_pending: number;
  recipes_served_today: number;
  stock_alerts_beverages: number;
}

type UserRole = 'owner' | 'manager' | 'waiter' | 'chef' | 'barman';

// ---------------------------------------------------------------------------
// Role icon map
// ---------------------------------------------------------------------------

const ROLE_ICONS: Record<UserRole, string> = {
  owner: 'crown-outline',
  manager: 'shield-account-outline',
  waiter: 'silverware-fork-knife',
  chef: 'chef-hat',
  barman: 'glass-cocktail',
};

// ---------------------------------------------------------------------------
// Pulsing Online Dot
// ---------------------------------------------------------------------------

function PulsingDot({ color }: { color: string }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  return (
    <Animated.View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: color,
        opacity: pulseAnim,
        marginRight: 6,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Skeleton placeholder
// ---------------------------------------------------------------------------

function SkeletonCard({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View
      style={{
        width: '48%',
        margin: '1%',
        backgroundColor: colors.card,
        borderRadius: 20,
        padding: 16,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 10,
      }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.backgroundTertiary }} />
      <View style={{ width: '40%', height: 12, borderRadius: 4, backgroundColor: colors.backgroundTertiary }} />
      <View style={{ width: '70%', height: 16, borderRadius: 4, backgroundColor: colors.backgroundTertiary }} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RoleDashboardScreen() {
  const { t } = useI18n();
  const { user } = useAuth();
  const colors = useColors();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  // Determine the primary role for the current user
  const userRole: UserRole = useMemo(() => {
    const roles = user?.roles ?? [];
    const roleStr = roles[0]?.role?.toLowerCase() ?? 'waiter';
    if (['owner', 'manager', 'waiter', 'chef', 'barman'].includes(roleStr)) {
      return roleStr as UserRole;
    }
    return 'waiter';
  }, [user]);

  // Derive the restaurant id from user roles
  const restaurantId = useMemo(() => {
    return user?.roles?.[0]?.restaurant_id ?? '';
  }, [user]);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const loadData = useCallback(async () => {
    try {
      setError(false);
      const [dashboard, realtime] = await Promise.all([
        ApiService.getAnalytics({ restaurant_id: restaurantId } as any),
        ApiService.getRealtimeMetrics(restaurantId),
      ]);

      setMetrics({
        revenue_today: dashboard?.stats?.today_revenue ?? 0,
        total_orders: dashboard?.stats?.today_orders ?? 0,
        avg_ticket:
          dashboard?.stats?.today_orders > 0
            ? dashboard.stats.today_revenue / dashboard.stats.today_orders
            : 0,
        staff_active: realtime?.staff_active ?? 0,
        best_selling_item: dashboard?.best_selling_item ?? '-',
        reviews_avg: dashboard?.stats?.customer_satisfaction ?? 0,
        pending_approvals: realtime?.pending_approvals ?? 0,
        active_orders: dashboard?.stats?.active_orders ?? 0,
        stock_alerts: realtime?.stock_alerts ?? 0,
        occupancy_percent:
          dashboard?.stats?.tables_total > 0
            ? Math.round(
                (dashboard.stats.tables_occupied / dashboard.stats.tables_total) * 100,
              )
            : 0,
        staff_on_duty: realtime?.staff_on_duty ?? 0,
        my_tables: realtime?.my_tables ?? 0,
        my_tips_today: realtime?.my_tips_today ?? 0,
        open_calls: realtime?.open_calls ?? 0,
        my_avg_rating: realtime?.my_avg_rating ?? 0,
        orders_in_kds: realtime?.orders_in_kds ?? 0,
        avg_prep_time: dashboard?.stats?.avg_preparation_time ?? 0,
        overdue_items: realtime?.overdue_items ?? 0,
        station_status: realtime?.station_status ?? '-',
        bar_orders_pending: realtime?.bar_orders_pending ?? 0,
        recipes_served_today: realtime?.recipes_served_today ?? 0,
        stock_alerts_beverages: realtime?.stock_alerts_beverages ?? 0,
      });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  // Initial load + 15s auto-refresh
  React.useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      loadData();
    }, 15000);
    return () => clearInterval(interval);
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // -----------------------------------------------------------------------
  // KPI cards per role
  // -----------------------------------------------------------------------

  const kpiCards: KpiCardData[] = useMemo(() => {
    if (!metrics) return [];

    switch (userRole) {
      case 'owner':
        return [
          {
            key: 'revenue',
            icon: 'cash',
            label: t('roleDashboard.revenueToday'),
            value: `R$ ${metrics.revenue_today.toFixed(0)}`,
            color: colors.success,
            navigateTo: 'Financial',
          },
          {
            key: 'orders',
            icon: 'receipt-text',
            label: t('roleDashboard.totalOrders'),
            value: metrics.total_orders,
            color: colors.primary,
            navigateTo: 'Orders',
          },
          {
            key: 'avgTicket',
            icon: 'tag',
            label: t('roleDashboard.avgTicket'),
            value: `R$ ${metrics.avg_ticket.toFixed(0)}`,
            color: colors.info,
          },
          {
            key: 'staffActive',
            icon: 'account-group',
            label: t('roleDashboard.staffActive'),
            value: metrics.staff_active,
            color: colors.warning,
            navigateTo: 'Staff',
          },
          {
            key: 'bestSelling',
            icon: 'star-circle',
            label: t('roleDashboard.bestSelling'),
            value: metrics.best_selling_item,
            color: colors.primary,
            navigateTo: 'Menu',
          },
          {
            key: 'reviewsAvg',
            icon: 'star',
            label: t('roleDashboard.reviewsAvg'),
            value: metrics.reviews_avg.toFixed(1),
            color: colors.ratingGold,
            navigateTo: 'RestaurantReviews',
          },
        ];

      case 'manager':
        return [
          {
            key: 'pendingApprovals',
            icon: 'clipboard-check-outline',
            label: t('roleDashboard.pendingApprovals'),
            value: metrics.pending_approvals,
            color: colors.warning,
          },
          {
            key: 'activeOrders',
            icon: 'receipt-text',
            label: t('roleDashboard.activeOrders'),
            value: metrics.active_orders,
            color: colors.primary,
            navigateTo: 'Orders',
          },
          {
            key: 'stockAlerts',
            icon: 'alert-circle-outline',
            label: t('roleDashboard.stockAlerts'),
            value: metrics.stock_alerts,
            color: colors.error,
            navigateTo: 'Stock',
          },
          {
            key: 'occupancy',
            icon: 'table-chair',
            label: t('roleDashboard.occupancy'),
            value: `${metrics.occupancy_percent}%`,
            color: colors.info,
            navigateTo: 'FloorPlan',
          },
          {
            key: 'staffOnDuty',
            icon: 'account-group',
            label: t('roleDashboard.staffOnDuty'),
            value: metrics.staff_on_duty,
            color: colors.success,
            navigateTo: 'Staff',
          },
        ];

      case 'waiter':
        return [
          {
            key: 'myTables',
            icon: 'table-chair',
            label: t('roleDashboard.myTables'),
            value: metrics.my_tables,
            color: colors.primary,
            navigateTo: 'FloorPlan',
          },
          {
            key: 'myTips',
            icon: 'cash-plus',
            label: t('roleDashboard.myTips'),
            value: `R$ ${metrics.my_tips_today.toFixed(0)}`,
            color: colors.success,
            navigateTo: 'Tips',
          },
          {
            key: 'openCalls',
            icon: 'bell-ring',
            label: t('roleDashboard.openCalls'),
            value: metrics.open_calls,
            color: colors.warning,
            navigateTo: 'WaiterCalls',
          },
          {
            key: 'myAvgRating',
            icon: 'star',
            label: t('roleDashboard.myAvgRating'),
            value: metrics.my_avg_rating.toFixed(1),
            color: colors.ratingGold,
          },
        ];

      case 'chef':
        return [
          {
            key: 'ordersInKds',
            icon: 'monitor-dashboard',
            label: t('roleDashboard.ordersInKds'),
            value: metrics.orders_in_kds,
            color: colors.primary,
            navigateTo: 'KDS',
          },
          {
            key: 'avgPrepTime',
            icon: 'timer-sand',
            label: t('roleDashboard.avgPrepTime'),
            value: `${metrics.avg_prep_time} min`,
            color: colors.info,
          },
          {
            key: 'overdueItems',
            icon: 'alert-circle',
            label: t('roleDashboard.overdueItems'),
            value: metrics.overdue_items,
            color: colors.error,
            navigateTo: 'KDS',
          },
          {
            key: 'stationStatus',
            icon: 'stove',
            label: t('roleDashboard.stationStatus'),
            value: metrics.station_status,
            color: colors.success,
            navigateTo: 'CookStation',
          },
        ];

      case 'barman':
        return [
          {
            key: 'barOrdersPending',
            icon: 'glass-cocktail',
            label: t('roleDashboard.barOrdersPending'),
            value: metrics.bar_orders_pending,
            color: colors.primary,
            navigateTo: 'BarmanKDS',
          },
          {
            key: 'recipesServed',
            icon: 'book-open-variant',
            label: t('roleDashboard.recipesServed'),
            value: metrics.recipes_served_today,
            color: colors.success,
            navigateTo: 'DrinkRecipes',
          },
          {
            key: 'stockAlertsBev',
            icon: 'alert-circle-outline',
            label: t('roleDashboard.stockAlertsBeverages'),
            value: metrics.stock_alerts_beverages,
            color: colors.warning,
            navigateTo: 'Stock',
          },
        ];

      default:
        return [];
    }
  }, [metrics, userRole, t, colors]);

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  const roleLabelMap: Record<UserRole, string> = {
    owner: 'Owner',
    manager: 'Manager',
    waiter: 'Waiter',
    chef: 'Chef',
    barman: 'Barman',
  };

  if (loading) {
    return (
      <ScreenContainer>
      <ScrollView style={{ flex: 1, backgroundColor: colors.backgroundSecondary }}>
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
          <Text style={{ color: colors.primaryForeground, fontSize: 24, fontWeight: '700' }}>
            {t('roleDashboard.title')}
          </Text>
        </LinearGradient>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, marginTop: 12 }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <SkeletonCard key={i} colors={colors} />
          ))}
        </View>
      </ScrollView>
      </ScreenContainer>
    );
  }

  if (error) {
    return (
      <ScreenContainer>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: 24 }}>
        <Text variant="bodyLarge" style={{ color: colors.foregroundSecondary, marginBottom: 16, textAlign: 'center' }}>
          {t('common.error')}
        </Text>
        <TouchableOpacity onPress={loadData} accessibilityRole="button" accessibilityLabel={t('common.retry')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text variant="labelLarge" style={{ color: colors.primary, fontWeight: '600' }}>
            {t('common.retry')}
          </Text>
        </TouchableOpacity>
      </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.backgroundSecondary }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      {/* Gradient Header */}
      <LinearGradient
        colors={[colors.primary, colors.accent]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{
          paddingTop: insets.top + 12,
          paddingBottom: 24,
          paddingHorizontal: 20,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <IconButton
            icon={ROLE_ICONS[userRole]}
            size={24}
            iconColor={colors.primaryForeground}
            style={{ margin: 0, padding: 0, width: 24, height: 24, marginRight: 10 }}
          />
          <Text style={{ color: colors.primaryForeground, fontSize: 24, fontWeight: '700', flex: 1 }}>
            {t('roleDashboard.title')}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
          <PulsingDot color={colors.primaryForeground} />
          <Text style={{ color: colors.glassStrong, fontSize: 14 }}>
            Online - {roleLabelMap[userRole]}
          </Text>
        </View>
      </LinearGradient>

      {/* KPI Grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingBottom: 24, marginTop: -8 }}>
        {kpiCards.map((card) => (
          <TouchableOpacity
            key={card.key}
            style={{ width: '48%', margin: '1%' }}
            activeOpacity={card.navigateTo ? 0.7 : 1}
            onPress={() => {
              if (card.navigateTo) {
                navigation.navigate(card.navigateTo);
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={`${card.label}: ${card.value}`}
          >
            <View
              style={{
                backgroundColor: colors.card,
                borderRadius: 20,
                padding: 16,
                borderWidth: 1,
                borderColor: colors.border,
                elevation: 2,
              }}
            >
              {/* Icon container with gradient-like background */}
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  backgroundColor: `${card.color}1A`,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 10,
                }}
              >
                <IconButton
                  icon={card.icon}
                  size={20}
                  iconColor={card.color}
                  style={{ margin: 0, padding: 0, width: 20, height: 20 }}
                />
              </View>
              <Text
                style={{
                  fontSize: 24,
                  fontWeight: '700',
                  color: colors.foreground,
                }}
                numberOfLines={1}
              >
                {card.value}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: colors.foregroundSecondary,
                  marginTop: 4,
                }}
                numberOfLines={2}
              >
                {card.label}
              </Text>
              {/* Navigation arrow indicator */}
              {card.navigateTo && (
                <View style={{ position: 'absolute', top: 14, right: 14 }}>
                  <IconButton
                    icon="chevron-right"
                    size={16}
                    iconColor={colors.foregroundMuted}
                    style={{ margin: 0, padding: 0, width: 16, height: 16 }}
                  />
                </View>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
    </ScreenContainer>
  );
}
