import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { Text, Card, IconButton, ActivityIndicator } from 'react-native-paper';
import ApiService from '@/shared/services/api';
import { useI18n } from '@/shared/hooks/useI18n';
import { useColors, useOkinawaTheme } from '@okinawa/shared/contexts/ThemeContext';

interface RealTimeMetrics {
  active_orders: number;
  ready_orders: number;
  today_revenue: number;
  revenue_change_pct: number;
  active_staff: number;
  off_duty_staff: number;
  tables_occupied: number;
  tables_total: number;
}

interface StaffMember {
  id: string;
  name: string;
  role: string;
  avatar_url?: string;
  status: 'active' | 'off';
}

interface PendingApproval {
  id: string;
  type: 'cancel' | 'courtesy' | 'refund' | 'discount';
  item_name: string;
  amount: number;
  reason: string;
  requester: { full_name: string };
  created_at: string;
}

interface ActiveOrder {
  id: string;
  table_number?: string;
  status: string;
  created_at: string;
  items_count: number;
}

const getElapsedMinutes = (dateStr: string): number => {
  const created = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - created.getTime()) / 60000);
};

const getTYPE_COLORS = (colors: any): Record<string, string> => ({
  cancel: colors.error,
  courtesy: colors.info,
  refund: colors.warning,
  discount: colors.foregroundSecondary,
});

export default function ManagerOpsScreen({ navigation }: any) {
  const { t } = useI18n();
  const { isDark } = useOkinawaTheme();
  const colors = useColors();
  const TYPE_COLORS = getTYPE_COLORS(colors);

  const [metrics, setMetrics] = useState<RealTimeMetrics | null>(null);
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [staffOnDuty, setStaffOnDuty] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const lateOrders = useMemo(
    () => activeOrders.filter((o) => getElapsedMinutes(o.created_at) > 15),
    [activeOrders],
  );

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [metricsRes, approvalsRes] = await Promise.allSettled([
        ApiService.get('/analytics/realtime'),
        ApiService.get('/approvals/pending?restaurantId=current'),
      ]);

      if (metricsRes.status === 'fulfilled') {
        setMetrics(metricsRes.value?.data || null);
      }
      if (approvalsRes.status === 'fulfilled') {
        setPendingApprovals(approvalsRes.value?.data || []);
      }
    } catch (error) {
      console.error('Failed to load manager ops data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.backgroundSecondary,
        },
        loadingContainer: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        },
        title: {
          marginHorizontal: 20,
          marginVertical: 16,
          color: colors.foreground,
        },
        alertBanner: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
          marginHorizontal: 16,
          marginBottom: 8,
          borderRadius: 12,
        },
        alertBannerRed: {
          backgroundColor: `${colors.destructive}15`,
          borderWidth: 1,
          borderColor: `${colors.destructive}30`,
        },
        alertBannerOrange: {
          backgroundColor: `${colors.warning}15`,
          borderWidth: 1,
          borderColor: `${colors.warning}30`,
        },
        alertText: {
          flex: 1,
          marginLeft: 8,
          fontWeight: '600',
        },
        kpiGrid: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          paddingHorizontal: 12,
        },
        kpiCard: {
          width: '48%',
          margin: 4,
          elevation: 2,
          backgroundColor: colors.card,
          borderRadius: 12,
        },
        kpiContent: {
          padding: 12,
        },
        kpiValue: {
          color: colors.foreground,
          fontWeight: '700',
        },
        kpiLabel: {
          color: colors.foregroundSecondary,
          marginTop: 2,
        },
        kpiSub: {
          color: colors.foregroundSecondary,
          marginTop: 4,
        },
        sectionHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 20,
          marginTop: 20,
          marginBottom: 8,
        },
        sectionTitle: {
          color: colors.foreground,
          fontWeight: '600',
        },
        viewAllText: {
          color: colors.primary,
          fontWeight: '500',
        },
        approvalCard: {
          marginHorizontal: 16,
          marginBottom: 8,
          backgroundColor: colors.card,
          borderRadius: 12,
          elevation: 1,
        },
        approvalRow: {
          flexDirection: 'row',
          alignItems: 'center',
          padding: 12,
        },
        typeBadge: {
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 6,
        },
        typeBadgeText: {
          color: colors.premiumCardForeground,
          fontSize: 12,
          fontWeight: '600',
        },
        approvalInfo: {
          flex: 1,
          marginLeft: 10,
        },
        approvalItemName: {
          color: colors.foreground,
          fontWeight: '500',
        },
        approvalReason: {
          color: colors.foregroundSecondary,
          fontSize: 12,
          marginTop: 2,
        },
        approvalAmount: {
          color: colors.foreground,
          fontWeight: '600',
        },
        staffRow: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingVertical: 8,
        },
        staffAvatar: {
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: colors.backgroundTertiary,
          alignItems: 'center',
          justifyContent: 'center',
        },
        staffAvatarText: {
          color: colors.foreground,
          fontWeight: '600',
        },
        staffInfo: {
          flex: 1,
          marginLeft: 10,
        },
        staffName: {
          color: colors.foreground,
        },
        staffRole: {
          color: colors.foregroundSecondary,
          fontSize: 12,
        },
        statusBadge: {
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 4,
        },
        statusText: {
          fontSize: 12,
          fontWeight: '500',
        },
        emptyText: {
          textAlign: 'center',
          color: colors.foregroundSecondary,
          paddingVertical: 24,
          paddingHorizontal: 20,
        },
        skeletonCard: {
          height: 80,
          marginHorizontal: 16,
          marginBottom: 8,
          backgroundColor: colors.backgroundTertiary,
          borderRadius: 12,
        },
        pendingBadge: {
          backgroundColor: colors.destructive,
          borderRadius: 12,
          paddingHorizontal: 8,
          paddingVertical: 2,
          marginLeft: 8,
        },
        pendingBadgeText: {
          color: colors.premiumCardForeground,
          fontSize: 12,
          fontWeight: '700',
        },
      }),
    [colors],
  );

  const getTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      cancel: t('approvals.typeCancel'),
      courtesy: t('approvals.typeCourtesy'),
      refund: t('approvals.typeRefund'),
      discount: t('approvals.typeDiscount'),
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <ScreenContainer>
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      <Text variant="headlineLarge" style={styles.title}>
        {t('manager.ops.title')}
      </Text>

      {/* Alert Banners */}
      {lateOrders.length > 0 && (
        <View style={[styles.alertBanner, styles.alertBannerRed]}>
          <IconButton icon="alert-circle" size={20} iconColor={colors.destructive} />
          <Text style={[styles.alertText, { color: colors.destructive }]}>
            {t('manager.ops.alertLateOrders', { count: lateOrders.length })}
          </Text>
        </View>
      )}

      {pendingApprovals.length > 0 && (
        <TouchableOpacity
          onPress={() => navigation.navigate('Approvals')}
          style={[styles.alertBanner, styles.alertBannerOrange]}
          accessibilityRole="button"
          accessibilityLabel={t('manager.ops.alertPendingApprovals', { count: pendingApprovals.length })}
        >
          <IconButton icon="clock-alert-outline" size={20} iconColor={colors.warning} />
          <Text style={[styles.alertText, { color: colors.warning }]}>
            {t('manager.ops.alertPendingApprovals', { count: pendingApprovals.length })}
          </Text>
        </TouchableOpacity>
      )}

      {/* KPI Grid */}
      <View style={styles.kpiGrid}>
        <Card style={styles.kpiCard}>
          <View style={styles.kpiContent}>
            <IconButton icon="receipt-text" size={24} iconColor={colors.primary} />
            <Text variant="headlineSmall" style={styles.kpiValue}>
              {metrics?.active_orders || 0}
            </Text>
            <Text variant="bodySmall" style={styles.kpiLabel}>
              {t('manager.ops.kpiActiveOrders')}
            </Text>
            <Text variant="labelSmall" style={styles.kpiSub}>
              {t('manager.ops.kpiActiveOrdersSub', { count: metrics?.ready_orders || 0 })}
            </Text>
          </View>
        </Card>

        <Card style={styles.kpiCard}>
          <View style={styles.kpiContent}>
            <IconButton icon="cash" size={24} iconColor={colors.success} />
            <Text variant="headlineSmall" style={styles.kpiValue}>
              R$ {(metrics?.today_revenue || 0).toFixed(0)}
            </Text>
            <Text variant="bodySmall" style={styles.kpiLabel}>
              {t('manager.ops.kpiRevenueToday')}
            </Text>
            <Text variant="labelSmall" style={styles.kpiSub}>
              {t('manager.ops.kpiRevenueSub', { pct: metrics?.revenue_change_pct || 0 })}
            </Text>
          </View>
        </Card>

        <Card style={styles.kpiCard}>
          <View style={styles.kpiContent}>
            <IconButton icon="account-group" size={24} iconColor={colors.info} />
            <Text variant="headlineSmall" style={styles.kpiValue}>
              {metrics?.active_staff || 0}
            </Text>
            <Text variant="bodySmall" style={styles.kpiLabel}>
              {t('manager.ops.kpiActiveStaff')}
            </Text>
            <Text variant="labelSmall" style={styles.kpiSub}>
              {t('manager.ops.kpiActiveStaffSub', { count: metrics?.off_duty_staff || 0 })}
            </Text>
          </View>
        </Card>

        <Card style={styles.kpiCard}>
          <View style={styles.kpiContent}>
            <IconButton icon="table-chair" size={24} iconColor={colors.warning} />
            <Text variant="headlineSmall" style={styles.kpiValue}>
              {metrics?.tables_occupied || 0}/{metrics?.tables_total || 0}
            </Text>
            <Text variant="bodySmall" style={styles.kpiLabel}>
              {t('manager.ops.kpiOccupancy')}
            </Text>
            <Text variant="labelSmall" style={styles.kpiSub}>
              {t('manager.ops.kpiOccupancySub', {
                count: (metrics?.tables_total || 0) - (metrics?.tables_occupied || 0),
              })}
            </Text>
          </View>
        </Card>
      </View>

      {/* Pending Approvals Preview */}
      <View style={styles.sectionHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            {t('manager.ops.pendingApprovals')}
          </Text>
          {pendingApprovals.length > 0 && (
            <View
              style={[
                styles.pendingBadge,
                {
                  backgroundColor:
                    pendingApprovals.length > 3 ? colors.destructive : colors.warning,
                },
              ]}
            >
              <Text style={styles.pendingBadgeText}>{pendingApprovals.length}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('Approvals')}
          accessibilityRole="button"
          accessibilityLabel="View all pending approvals"
        >
          <Text style={styles.viewAllText}>{t('manager.ops.viewAll')}</Text>
        </TouchableOpacity>
      </View>

      {pendingApprovals.slice(0, 3).map((approval) => (
        <Card key={approval.id} style={styles.approvalCard}>
          <View style={styles.approvalRow}>
            <View
              style={[
                styles.typeBadge,
                { backgroundColor: TYPE_COLORS[approval.type] || colors.foregroundSecondary },
              ]}
            >
              <Text style={styles.typeBadgeText}>{getTypeLabel(approval.type)}</Text>
            </View>
            <View style={styles.approvalInfo}>
              <Text style={styles.approvalItemName}>{approval.item_name}</Text>
              <Text style={styles.approvalReason} numberOfLines={1}>
                {approval.reason}
              </Text>
            </View>
            <Text style={styles.approvalAmount}>
              R$ {Number(approval.amount).toFixed(2)}
            </Text>
          </View>
        </Card>
      ))}

      {pendingApprovals.length === 0 && (
        <Text style={styles.emptyText}>{t('approvals.emptyTitle')}</Text>
      )}

      {/* Live Orders Feed */}
      <View style={styles.sectionHeader}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          {t('manager.ops.liveOrders')}
        </Text>
      </View>

      {activeOrders.length === 0 && (
        <Text style={styles.emptyText}>{t('manager.ops.emptyOrders')}</Text>
      )}

      {/* Staff on Duty */}
      <View style={styles.sectionHeader}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          {t('manager.ops.staffOnDuty')}
        </Text>
      </View>

      {staffOnDuty.map((member) => (
        <View key={member.id} style={styles.staffRow}>
          <View style={styles.staffAvatar}>
            <Text style={styles.staffAvatarText}>
              {member.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.staffInfo}>
            <Text style={styles.staffName}>{member.name}</Text>
            <Text style={styles.staffRole}>{member.role}</Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor:
                  member.status === 'active'
                    ? `${colors.success}20`
                    : `${colors.foregroundSecondary}20`,
              },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                {
                  color:
                    member.status === 'active' ? colors.success : colors.foregroundSecondary,
                },
              ]}
            >
              {member.status === 'active'
                ? t('manager.ops.staffActive')
                : t('manager.ops.staffOff')}
            </Text>
          </View>
        </View>
      ))}

      <View style={{ height: 32 }} />
    </ScrollView>
    </ScreenContainer>
  );
}
