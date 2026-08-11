/**
 * ReportsScreen
 *
 * Analytics reports screen with date range picker, revenue charts,
 * order breakdown, top menu items, and staff performance table.
 *
 * Endpoints consumed:
 *   GET /analytics/dashboard?restaurant_id
 *   GET /analytics/sales?restaurant_id&start_date&end_date
 *   GET /analytics/performance?restaurant_id
 *
 * @module restaurant/screens/reports/ReportsScreen
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Text, Chip } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BarChart } from 'react-native-chart-kit';
import { useI18n } from '@/shared/hooks/useI18n';
import { formatCurrency, getCurrencySymbol } from '@okinawa/shared/utils/formatters';
import { getLanguage } from '@okinawa/shared/i18n';
import { useAuth } from '@/shared/hooks/useAuth';
import { useColors, useOkinawaTheme } from '@okinawa/shared/contexts/ThemeContext';
import ApiService from '@/shared/services/api';

const screenWidth = Dimensions.get('window').width;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DateRange = 'today' | 'week' | 'month' | 'custom';

interface SalesData {
  labels: string[];
  values: number[];
  total_revenue: number;
  wow_comparison: number;
}

interface OrderStats {
  total: number;
  by_status: Array<{ status: string; count: number }>;
  by_service_type: Array<{ type: string; count: number }>;
}

interface MenuItem {
  id: string;
  name: string;
  quantity_sold: number;
  revenue: number;
}

interface StaffPerformance {
  id: string;
  name: string;
  orders_handled: number;
  tips: number;
  rating: number;
}

interface PaymentMethod {
  method: string;
  label: string;
  percentage: number;
  total: number;
}

interface ReportData {
  sales: SalesData;
  orders: OrderStats;
  menu_items: MenuItem[];
  staff: StaffPerformance[];
  payment_methods: PaymentMethod[];
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function getDateRange(range: DateRange): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().split('T')[0];

  switch (range) {
    case 'today':
      return { start: end, end };
    case 'week': {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return { start: weekAgo.toISOString().split('T')[0], end };
    }
    case 'month': {
      const monthAgo = new Date(now);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      return { start: monthAgo.toISOString().split('T')[0], end };
    }
    case 'custom':
    default:
      return { start: end, end };
  }
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function SectionSkeleton({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{ marginHorizontal: 16, marginTop: 8, backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 16 }}>
      <View style={{ height: 20, width: '40%', backgroundColor: colors.backgroundTertiary, borderRadius: 6, marginBottom: 12 }} />
      <View style={{ height: 160, backgroundColor: colors.backgroundTertiary, borderRadius: 12 }} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------

function KpiCard({
  icon,
  iconName,
  label,
  value,
  gradientColors,
  colors,
}: {
  icon?: React.ReactNode;
  iconName: string;
  label: string;
  value: string | number;
  gradientColors: [string, string];
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={{
        width: '48%',
        backgroundColor: colors.card,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 14,
        marginBottom: 8,
      }}
    >
      <LinearGradient
        colors={gradientColors}
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 10,
        }}
      >
        <MaterialCommunityIcons name={iconName as any} size={20} color={colors.premiumCardForeground} />
      </LinearGradient>
      <Text style={{ fontSize: 20, fontWeight: '700', color: colors.foreground }}>
        {value}
      </Text>
      <Text style={{ fontSize: 12, color: colors.foregroundSecondary, marginTop: 2 }}>
        {label}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ReportsScreen() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { isDark } = useOkinawaTheme();
  const colors = useColors();

  const [dateRange, setDateRange] = useState<DateRange>('week');
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [exportToast, setExportToast] = useState(false);

  const restaurantId = useMemo(() => {
    return user?.roles?.[0]?.restaurant_id ?? '';
  }, [user]);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const loadData = useCallback(async () => {
    try {
      setError(false);
      const { start, end } = getDateRange(dateRange);

      const [dashboardRes, salesRes, perfRes] = await Promise.all([
        ApiService.getAnalytics({ start_date: start, end_date: end }),
        ApiService.getSalesReport({ start_date: start, end_date: end }),
        ApiService.getPerformanceMetrics({ restaurant_id: restaurantId }),
      ]);

      const salesLabels = salesRes?.daily_revenue?.map((d: any) => d.date?.slice(5) ?? '') ?? [];
      const salesValues = salesRes?.daily_revenue?.map((d: any) => d.amount ?? 0) ?? [];

      setData({
        sales: {
          labels: salesLabels.length > 0 ? salesLabels : ['--'],
          values: salesValues.length > 0 ? salesValues : [0],
          total_revenue: salesRes?.total_revenue ?? dashboardRes?.stats?.today_revenue ?? 0,
          wow_comparison: salesRes?.wow_comparison ?? 0,
        },
        orders: {
          total: dashboardRes?.stats?.today_orders ?? 0,
          by_status: salesRes?.orders_by_status ?? [],
          by_service_type: salesRes?.orders_by_service_type ?? [],
        },
        menu_items: salesRes?.top_items ?? dashboardRes?.popular_items ?? [],
        staff: perfRes?.staff_performance ?? [],
        payment_methods: salesRes?.payment_methods ?? [
          { method: 'credit', label: t('reports.paymentCredit'), percentage: 0, total: 0 },
          { method: 'debit', label: t('reports.paymentDebit'), percentage: 0, total: 0 },
          { method: 'pix', label: 'Pix', percentage: 0, total: 0 },
          { method: 'cash', label: t('reports.paymentCash'), percentage: 0, total: 0 },
        ],
      });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [dateRange, restaurantId]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleExport = useCallback(() => {
    setExportToast(true);
    setTimeout(() => setExportToast(false), 2500);
  }, []);

  // -----------------------------------------------------------------------
  // Chart config
  // -----------------------------------------------------------------------

  const chartConfig = useMemo(
    () => ({
      backgroundColor: colors.primary,
      backgroundGradientFrom: colors.primary,
      backgroundGradientTo: colors.accent,
      decimalPlaces: 0,
      color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
      style: { borderRadius: 16 },
    }),
    [colors],
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <ScreenContainer>
      <ScrollView style={{ flex: 1, backgroundColor: colors.backgroundSecondary }}>
        {/* Skeleton header */}
        <View style={{ marginHorizontal: 16, marginTop: 16, marginBottom: 8 }}>
          <View style={{ backgroundColor: colors.premiumCard, borderRadius: 20, padding: 16, overflow: 'hidden', position: 'relative' }}>
            <View style={{ position: 'absolute', right: -32, top: -32, width: 128, height: 128, borderRadius: 64, backgroundColor: `${colors.primary}1A` }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)' }} />
              <View style={{ flex: 1, gap: 6 }}>
                <View style={{ width: '50%', height: 16, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)' }} />
                <View style={{ width: '30%', height: 10, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)' }} />
              </View>
            </View>
          </View>
        </View>
        {/* Date range skeleton */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 }}>
          {(['today', 'week', 'month'] as DateRange[]).map((r) => (
            <Chip key={r} selected={dateRange === r} onPress={() => setDateRange(r)}>
              {t(`reports.dateRange.${r}`)}
            </Chip>
          ))}
        </View>
        <SectionSkeleton colors={colors} />
        <SectionSkeleton colors={colors} />
        <SectionSkeleton colors={colors} />
      </ScrollView>
      </ScreenContainer>
    );
  }

  if (error) {
    return (
      <ScreenContainer>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: 24 }}>
        <Text variant="bodyLarge" style={{ color: colors.foregroundSecondary, marginBottom: 16, textAlign: 'center' }}>{t('common.error')}</Text>
        <TouchableOpacity onPress={loadData} accessibilityLabel={t('common.retry')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text variant="labelLarge" style={{ color: colors.primary, fontWeight: '600' }}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
      </ScreenContainer>
    );
  }

  const salesData = data?.sales;
  const ordersData = data?.orders;
  const menuItems = data?.menu_items?.slice(0, 10) ?? [];
  const staffList = data?.staff ?? [];

  // Compute avg ticket
  const avgTicket = ordersData && ordersData.total > 0
    ? (salesData?.total_revenue ?? 0) / ordersData.total
    : 0;

  // Find peak hour (approximate from labels)
  const peakHourLabel = salesData && salesData.values.length > 1
    ? salesData.labels[salesData.values.indexOf(Math.max(...salesData.values))] ?? '--'
    : '--';

  return (
    <ScreenContainer>
    <View style={{ flex: 1 }}>
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
        {/* ── Dark Premium Header ── */}
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 16,
            marginBottom: 12,
            backgroundColor: colors.premiumCard,
            borderRadius: 20,
            padding: 16,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <View style={{ position: 'absolute', right: -32, top: -32, width: 128, height: 128, borderRadius: 64, backgroundColor: `${colors.primary}1A` }} />
          <View style={{ position: 'relative' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: `${colors.primary}33`, alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialCommunityIcons name="chart-bar" size={22} color={colors.primary} />
                </View>
                <View>
                  <Text style={{ color: colors.premiumCardForeground, fontSize: 16, fontWeight: '700' }}>
                    {t('reports.title')}
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 1 }}>
                    {t(`reports.dateRange.${dateRange}`)}
                  </Text>
                </View>
              </View>
              {/* Export button */}
              <TouchableOpacity
                onPress={handleExport}
                accessibilityLabel={t('reports.export')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 12,
                  backgroundColor: 'rgba(255,255,255,0.15)',
                }}
              >
                <MaterialCommunityIcons name="export-variant" size={14} color={colors.premiumCardForeground} />
                <Text style={{ color: colors.premiumCardForeground, fontSize: 12, fontWeight: '600' }}>
                  {t('reports.export')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── Date Range Selector ── */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginBottom: 12, backgroundColor: `${colors.backgroundTertiary}80`, marginHorizontal: 16, borderRadius: 14, padding: 4, gap: 4 }}>
          {(['today', 'week', 'month'] as DateRange[]).map((r) => (
            <TouchableOpacity
              key={r}
              onPress={() => setDateRange(r)}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingVertical: 8,
                borderRadius: 10,
                backgroundColor: dateRange === r ? colors.card : 'transparent',
                ...(dateRange === r ? {
                  shadowColor: colors.shadowColor,
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.08,
                  shadowRadius: 4,
                  elevation: 2,
                } : {}),
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: dateRange === r ? '600' : '500', color: dateRange === r ? colors.foreground : colors.foregroundSecondary }}>
                {t(`reports.dateRange.${r}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── KPI Stats Grid ── */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 }}>
          <KpiCard
            iconName="cash-multiple"
            label={t('reports.totalRevenue')}
            value={formatCurrency(salesData?.total_revenue ?? 0, getLanguage())}
            gradientColors={[colors.primary, colors.accent]}
            colors={colors}
          />
          <KpiCard
            iconName="receipt"
            label={t('reports.orders')}
            value={ordersData?.total ?? 0}
            gradientColors={[colors.secondary ?? colors.secondary, colors.secondaryLight ?? colors.secondaryLight]}
            colors={colors}
          />
          <KpiCard
            iconName="ticket-percent"
            label={t('reports.avgTicket') ?? 'Ticket Medio'}
            value={formatCurrency(avgTicket, getLanguage(), { showCents: false })}
            gradientColors={[colors.accent, colors.warning]}
            colors={colors}
          />
          <KpiCard
            iconName="clock-outline"
            label={t('reports.peakHour') ?? 'Pico'}
            value={peakHourLabel}
            gradientColors={[colors.info, colors.statusDelivering]}
            colors={colors}
          />
        </View>

        {/* ── Revenue Chart Section ── */}
        <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
          {/* Section title */}
          <Text style={{ fontSize: 10, fontWeight: '700', color: colors.foregroundSecondary, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8, marginLeft: 4 }}>
            {t('reports.revenue')}
          </Text>
          <View style={{ backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
            {/* Section header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: `${colors.primary}1A`, alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialCommunityIcons name="trending-up" size={14} color={colors.primary} />
                </View>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.foreground }}>
                  {formatCurrency(salesData?.total_revenue ?? 0, getLanguage())}
                </Text>
              </View>
              {salesData?.wow_comparison !== undefined && salesData.wow_comparison !== 0 && (
                <View style={{
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 9999,
                  backgroundColor: salesData.wow_comparison >= 0 ? colors.successBackground : colors.errorBackground,
                }}>
                  <Text style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: salesData.wow_comparison >= 0 ? colors.success : colors.error,
                  }}>
                    {salesData.wow_comparison >= 0 ? '+' : ''}
                    {salesData.wow_comparison.toFixed(1)}%
                  </Text>
                </View>
              )}
            </View>
            {/* Chart */}
            {salesData && salesData.labels.length > 0 && salesData.values.length > 0 && (
              <View style={{ padding: 12 }}>
                <BarChart
                  data={{
                    labels: salesData.labels,
                    datasets: [{ data: salesData.values }],
                  }}
                  width={screenWidth - 80}
                  height={200}
                  chartConfig={chartConfig}
                  style={{ borderRadius: 16 }}
                  yAxisLabel={getCurrencySymbol(getLanguage())}
                  yAxisSuffix=""
                />
              </View>
            )}
          </View>
        </View>

        {/* ── Orders Section ── */}
        <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colors.foregroundSecondary, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8, marginLeft: 4 }}>
            {t('reports.orders')}
          </Text>
          <View style={{ backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: `${colors.info}1A`, alignItems: 'center', justifyContent: 'center' }}>
                <MaterialCommunityIcons name="clipboard-list-outline" size={14} color={colors.info} />
              </View>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.foreground }}>
                {ordersData?.total ?? 0} {t('roleDashboard.totalOrders')}
              </Text>
            </View>

            {/* By Status */}
            {ordersData?.by_status && ordersData.by_status.length > 0 && (
              <View style={{ padding: 12 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: colors.foregroundSecondary, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8 }}>
                  {t('reports.byStatus')}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {ordersData.by_status.map((s) => (
                    <View key={s.status} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9999, backgroundColor: colors.backgroundTertiary }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.foreground }}>
                        {s.status}: {s.count}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* By Service Type */}
            {ordersData?.by_service_type && ordersData.by_service_type.length > 0 && (
              <View style={{ padding: 12, paddingTop: 0 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: colors.foregroundSecondary, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8 }}>
                  {t('reports.byServiceType')}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {ordersData.by_service_type.map((s) => (
                    <View key={s.type} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9999, backgroundColor: colors.backgroundTertiary }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.foreground }}>
                        {s.type}: {s.count}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        </View>

        {/* ── Top Menu Items Section ── */}
        <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colors.foregroundSecondary, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8, marginLeft: 4 }}>
            {t('reports.topItems')}
          </Text>
          <View style={{ backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
            {/* Section header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: `${colors.success}1A`, alignItems: 'center', justifyContent: 'center' }}>
                <MaterialCommunityIcons name="fire" size={14} color={colors.success} />
              </View>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.foreground }}>{t('reports.menu')}</Text>
            </View>

            {/* Table header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ width: 24, fontSize: 10, fontWeight: '700', color: colors.foregroundSecondary }}>#</Text>
              <Text style={{ flex: 1, fontSize: 10, fontWeight: '700', color: colors.foregroundSecondary }}>{t('menu.name')}</Text>
              <Text style={{ width: 50, fontSize: 10, fontWeight: '700', color: colors.foregroundSecondary, textAlign: 'right' }}>{t('reports.byQuantity')}</Text>
              <Text style={{ width: 80, fontSize: 10, fontWeight: '700', color: colors.foregroundSecondary, textAlign: 'right' }}>{t('reports.byRevenue')}</Text>
            </View>

            {menuItems.map((item, idx) => (
              <View
                key={item.id ?? idx}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderBottomWidth: idx < menuItems.length - 1 ? StyleSheet.hairlineWidth : 0,
                  borderBottomColor: colors.border,
                }}
              >
                <View style={{
                  width: 22,
                  height: 22,
                  borderRadius: 7,
                  backgroundColor: idx < 3 ? `${colors.primary}1A` : colors.backgroundTertiary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 2,
                }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: idx < 3 ? colors.primary : colors.foregroundSecondary }}>
                    {idx + 1}
                  </Text>
                </View>
                <Text style={{ flex: 1, fontSize: 14, color: colors.foreground, fontWeight: '500' }} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={{ width: 50, fontSize: 12, color: colors.foregroundSecondary, textAlign: 'right' }}>
                  {item.quantity_sold}
                </Text>
                <Text style={{ width: 80, fontSize: 12, color: colors.success, fontWeight: '600', textAlign: 'right' }}>
                  {formatCurrency(item.revenue ?? 0, getLanguage(), { showCents: false })}
                </Text>
              </View>
            ))}
            {menuItems.length === 0 && (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: colors.foregroundSecondary }}>{t('common.noResults')}</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Staff Performance Section ── */}
        <View style={{ marginHorizontal: 16, marginBottom: 32 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colors.foregroundSecondary, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8, marginLeft: 4 }}>
            {t('reports.staff')}
          </Text>
          <View style={{ backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
            {/* Section header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: `${colors.warning}1A`, alignItems: 'center', justifyContent: 'center' }}>
                <MaterialCommunityIcons name="account-group" size={14} color={colors.warning} />
              </View>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.foreground }}>{t('reports.staff')}</Text>
            </View>

            {/* Table header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ flex: 1, fontSize: 10, fontWeight: '700', color: colors.foregroundSecondary }}>{t('auth.fullName')}</Text>
              <Text style={{ width: 60, fontSize: 10, fontWeight: '700', color: colors.foregroundSecondary, textAlign: 'right' }}>{t('reports.ordersHandled')}</Text>
              <Text style={{ width: 60, fontSize: 10, fontWeight: '700', color: colors.foregroundSecondary, textAlign: 'right' }}>{t('reports.tips')}</Text>
              <Text style={{ width: 60, fontSize: 10, fontWeight: '700', color: colors.foregroundSecondary, textAlign: 'right' }}>{t('reports.rating')}</Text>
            </View>

            {staffList.map((s) => (
              <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                <Text style={{ flex: 1, fontSize: 14, color: colors.foreground, fontWeight: '500' }} numberOfLines={1}>{s.name}</Text>
                <Text style={{ width: 60, fontSize: 12, color: colors.foregroundSecondary, textAlign: 'right' }}>{s.orders_handled}</Text>
                <Text style={{ width: 60, fontSize: 12, color: colors.foregroundSecondary, textAlign: 'right' }}>{formatCurrency(s.tips, getLanguage(), { showCents: false })}</Text>
                <Text style={{ width: 60, fontSize: 12, color: colors.accent, fontWeight: '600', textAlign: 'right' }}>{s.rating.toFixed(1)}</Text>
              </View>
            ))}
            {staffList.length === 0 && (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: colors.foregroundSecondary }}>{t('common.noResults')}</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Export Toast */}
      {exportToast && (
        <View style={{
          position: 'absolute',
          bottom: 32,
          left: 24,
          right: 24,
          backgroundColor: colors.foreground,
          padding: 16,
          borderRadius: 20,
          alignItems: 'center',
          zIndex: 10,
          shadowColor: colors.shadowColor,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.15,
          shadowRadius: 12,
          elevation: 8,
        }}>
          <Text style={{ color: colors.background, fontWeight: '600', fontSize: 14 }}>
            {t('reports.exporting')}
          </Text>
        </View>
      )}
    </View>
    </ScreenContainer>
  );
}
