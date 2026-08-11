import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
  Alert,
} from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BarChart } from 'react-native-chart-kit';
import ApiService from '@/shared/services/api';
import { useI18n } from '@/shared/hooks/useI18n';
import { useColors, useOkinawaTheme } from '@okinawa/shared/contexts/ThemeContext';

const screenWidth = Dimensions.get('window').width;

interface DailyReportData {
  date: string;
  totalRevenue: number;
  totalOrders: number;
  avgTicket: number;
  customerSatisfaction: number;
  weekOverWeekChange: number;
  topItems: Array<{ name: string; quantity: number; revenue: number }>;
  staffPerformance: Array<{
    name: string;
    role: string;
    avatarUrl?: string;
    sales: number;
    tips: number;
  }>;
  hourlyRevenue: Array<{ hour: string; revenue: number }>;
}

const formatCurrency = (value: number): string => {
  if (value >= 1000) {
    return `R$ ${(value / 1000).toFixed(1)}k`;
  }
  return `R$ ${value.toFixed(0)}`;
};

export default function DailyReportScreen() {
  const { t } = useI18n();
  const { isDark } = useOkinawaTheme();
  const colors = useColors();

  const [reportData, setReportData] = useState<DailyReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const today = useMemo(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [dashboardRes, financialRes] = await Promise.allSettled([
        ApiService.get(`/analytics/dashboard?restaurant_id=current`),
        ApiService.get(`/financial/daily-summary?restaurant_id=current&start_date=${today}&end_date=${today}`),
      ]);

      const dashboard = dashboardRes.status === 'fulfilled' ? dashboardRes.value?.data : null;
      const financial = financialRes.status === 'fulfilled' ? financialRes.value?.data : null;

      setReportData({
        date: today,
        totalRevenue: dashboard?.total_revenue || financial?.total_revenue || 0,
        totalOrders: dashboard?.total_orders || financial?.total_orders || 0,
        avgTicket: dashboard?.avg_ticket || 0,
        customerSatisfaction: dashboard?.customer_satisfaction || 0,
        weekOverWeekChange: dashboard?.week_over_week_change || 0,
        topItems: financial?.top_items || [],
        staffPerformance: financial?.staff_performance || [],
        hourlyRevenue: financial?.hourly_revenue || [],
      });
    } catch (error) {
      console.error('Failed to load daily report:', error);
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleExport = useCallback(async () => {
    try {
      setExporting(true);
      await ApiService.get(
        `/financial/export?restaurant_id=current&start_date=${today}&end_date=${today}&format=pdf&report_type=summary`,
      );
      Alert.alert(t('common.success'), t('dailyReport.exportSuccess'));
    } catch (error) {
      Alert.alert(t('common.error'), t('dailyReport.exportError'));
    } finally {
      setExporting(false);
    }
  }, [today, t]);

  const chartConfig = useMemo(
    () => ({
      backgroundColor: colors.primary,
      backgroundGradientFrom: colors.primary,
      backgroundGradientTo: colors.accent,
      decimalPlaces: 0,
      color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
      style: { borderRadius: 16 },
      barPercentage: 0.6,
    }),
    [colors],
  );

  if (loading) {
    return (
      <ScreenContainer>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundSecondary }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
      </ScreenContainer>
    );
  }

  const isPositiveChange = (reportData?.weekOverWeekChange || 0) >= 0;

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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: `${colors.primary}33`, alignItems: 'center', justifyContent: 'center' }}>
              <MaterialCommunityIcons name="file-chart" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.premiumCardForeground, fontSize: 16, fontWeight: '700' }}>
                {t('dailyReport.title')}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 1 }}>
                {reportData?.date || today}
              </Text>
            </View>
          </View>

          {/* Revenue highlight */}
          <Text style={{ color: colors.premiumCardForeground, fontSize: 28, fontWeight: '700', marginBottom: 6 }}>
            {formatCurrency(reportData?.totalRevenue || 0)}
          </Text>

          {/* WoW change badge */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              alignSelf: 'flex-start',
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 12,
              backgroundColor: isPositiveChange ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
              gap: 4,
            }}
          >
            <MaterialCommunityIcons
              name={isPositiveChange ? 'trending-up' : 'trending-down'}
              size={14}
              color={isPositiveChange ? colors.success : colors.error}
            />
            <Text
              style={{
                fontWeight: '600',
                fontSize: 12,
                color: isPositiveChange ? colors.success : colors.error,
              }}
            >
              {isPositiveChange
                ? t('dailyReport.weekComparison', {
                    pct: Math.abs(reportData?.weekOverWeekChange || 0),
                  })
                : t('dailyReport.weekComparisonNeg', {
                    pct: reportData?.weekOverWeekChange || 0,
                  })}
            </Text>
          </View>
        </View>
      </View>

      {/* ── KPI Grid with Gradient Icons ── */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 }}>
        {/* Revenue KPI */}
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
            colors={[colors.primary, colors.accent]}
            style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}
          >
            <MaterialCommunityIcons name="cash-multiple" size={20} color={colors.premiumCardForeground} />
          </LinearGradient>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.primary }}>
            {formatCurrency(reportData?.totalRevenue || 0)}
          </Text>
          <Text style={{ fontSize: 12, color: colors.foregroundSecondary, marginTop: 2 }}>
            {t('dailyReport.kpiRevenue')}
          </Text>
        </View>

        {/* Orders KPI */}
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
            colors={[colors.secondary ?? colors.secondary, colors.secondaryLight ?? colors.secondaryLight]}
            style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}
          >
            <MaterialCommunityIcons name="receipt" size={20} color={colors.premiumCardForeground} />
          </LinearGradient>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.foreground }}>
            {reportData?.totalOrders || 0}
          </Text>
          <Text style={{ fontSize: 12, color: colors.foregroundSecondary, marginTop: 2 }}>
            {t('dailyReport.kpiOrders')}
          </Text>
        </View>

        {/* Avg Ticket KPI */}
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
            colors={[colors.accent, colors.warning]}
            style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}
          >
            <MaterialCommunityIcons name="ticket-percent" size={20} color={colors.premiumCardForeground} />
          </LinearGradient>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.foreground }}>
            {formatCurrency(reportData?.avgTicket || 0)}
          </Text>
          <Text style={{ fontSize: 12, color: colors.foregroundSecondary, marginTop: 2 }}>
            {t('dailyReport.kpiAvgTicket')}
          </Text>
        </View>

        {/* Satisfaction KPI */}
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
            colors={[colors.info, colors.statusDelivering]}
            style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}
          >
            <MaterialCommunityIcons name="emoticon-happy-outline" size={20} color={colors.premiumCardForeground} />
          </LinearGradient>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.foreground }}>
            {(reportData?.customerSatisfaction || 0).toFixed(1)}
          </Text>
          <Text style={{ fontSize: 12, color: colors.foregroundSecondary, marginTop: 2 }}>
            {t('dailyReport.kpiSatisfaction')}
          </Text>
        </View>
      </View>

      {/* ── Top Sellers Section ── */}
      {reportData?.topItems && reportData.topItems.length > 0 && (
        <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colors.foregroundSecondary, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8, marginLeft: 4 }}>
            {t('dailyReport.topSellers')}
          </Text>
          <View style={{ backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
            {/* Section header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: `${colors.success}1A`, alignItems: 'center', justifyContent: 'center' }}>
                <MaterialCommunityIcons name="fire" size={14} color={colors.success} />
              </View>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.foreground }}>{t('dailyReport.topSellers')}</Text>
            </View>

            {reportData.topItems.slice(0, 5).map((item, index) => (
              <View
                key={index}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderBottomWidth: index < Math.min(reportData.topItems.length, 5) - 1 ? StyleSheet.hairlineWidth : 0,
                  borderBottomColor: colors.border,
                }}
              >
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: index === 0 ? `${colors.primary}20` : colors.backgroundTertiary,
                  }}
                >
                  <Text
                    style={{
                      fontWeight: '700',
                      fontSize: 12,
                      color: index === 0 ? colors.primary : colors.foregroundSecondary,
                    }}
                  >
                    {index + 1}
                  </Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ fontSize: 14, color: colors.foreground, fontWeight: '500' }}>{item.name}</Text>
                  <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>{item.quantity}x</Text>
                </View>
                <Text style={{ fontSize: 14, color: colors.foreground, fontWeight: '600' }}>{formatCurrency(item.revenue)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ── Staff Performance Section ── */}
      {reportData?.staffPerformance && reportData.staffPerformance.length > 0 && (
        <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colors.foregroundSecondary, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8, marginLeft: 4 }}>
            {t('dailyReport.staffPerformance')}
          </Text>
          <View style={{ backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
            {/* Section header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: `${colors.info}1A`, alignItems: 'center', justifyContent: 'center' }}>
                <MaterialCommunityIcons name="account-group" size={14} color={colors.info} />
              </View>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.foreground }}>{t('dailyReport.staffPerformance')}</Text>
            </View>

            {reportData.staffPerformance
              .sort((a, b) => b.sales - a.sales)
              .map((member, index) => (
                <View
                  key={index}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderBottomWidth: index < reportData.staffPerformance.length - 1 ? StyleSheet.hairlineWidth : 0,
                    borderBottomColor: colors.border,
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: colors.backgroundTertiary,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: colors.foreground, fontWeight: '600', fontSize: 16 }}>
                      {member.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ fontSize: 14, color: colors.foreground, fontWeight: '500' }}>{member.name}</Text>
                    <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>{member.role}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 14, color: colors.foreground, fontWeight: '600' }}>{formatCurrency(member.sales)}</Text>
                    <Text style={{ fontSize: 12, color: colors.success }}>+{formatCurrency(member.tips)}</Text>
                  </View>
                </View>
              ))}
          </View>
        </View>
      )}

      {/* ── Hourly Revenue Chart ── */}
      {reportData?.hourlyRevenue && reportData.hourlyRevenue.length > 0 && (
        <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colors.foregroundSecondary, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8, marginLeft: 4 }}>
            {t('dailyReport.hourlyRevenue')}
          </Text>
          <View style={{ backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: `${colors.accent}1A`, alignItems: 'center', justifyContent: 'center' }}>
                <MaterialCommunityIcons name="clock-outline" size={14} color={colors.accent} />
              </View>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.foreground }}>{t('dailyReport.hourlyRevenue')}</Text>
            </View>
            <View style={{ padding: 12 }}>
              <BarChart
                data={{
                  labels: reportData.hourlyRevenue.map((h) => h.hour),
                  datasets: [{ data: reportData.hourlyRevenue.map((h) => h.revenue) }],
                }}
                width={screenWidth - 64}
                height={200}
                chartConfig={chartConfig}
                style={{ borderRadius: 16 }}
                yAxisLabel="R$"
                yAxisSuffix=""
              />
            </View>
          </View>
        </View>
      )}

      {/* ── Gradient Export Button ── */}
      <TouchableOpacity
        onPress={handleExport}
        disabled={exporting}
        accessibilityRole="button"
        accessibilityLabel={t('dailyReport.exportButton')}
        style={{
          marginHorizontal: 16,
          marginTop: 8,
          marginBottom: 32,
          borderRadius: 16,
          overflow: 'hidden',
          opacity: exporting ? 0.6 : 1,
        }}
      >
        <LinearGradient
          colors={[colors.primary, colors.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 14,
            borderRadius: 16,
          }}
        >
          {exporting ? (
            <ActivityIndicator size="small" color={colors.premiumCardForeground} />
          ) : (
            <MaterialCommunityIcons name="file-pdf-box" size={18} color={colors.premiumCardForeground} />
          )}
          <Text style={{ color: colors.premiumCardForeground, fontSize: 14, fontWeight: '600' }}>
            {t('dailyReport.exportButton')}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
    </ScreenContainer>
  );
}
