import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { Text, Card, IconButton, ActivityIndicator } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ApiService from '@/shared/services/api';
import { useI18n } from '@/shared/hooks/useI18n';
import { useColors, useOkinawaTheme } from '@okinawa/shared/contexts/ThemeContext';

type ApprovalType = 'cancel' | 'courtesy' | 'refund' | 'discount';
type ApprovalStatus = 'pending' | 'approved' | 'rejected';

interface Approval {
  id: string;
  type: ApprovalType;
  item_name: string;
  table_id: string | null;
  requester_id: string;
  requester?: { full_name: string };
  reason: string;
  amount: number;
  status: ApprovalStatus;
  created_at: string;
  resolved_at: string | null;
}

interface ApprovalStats {
  pending: number;
  approvedToday: number;
  rejectedToday: number;
  totalImpact: number;
}

const TYPE_ICONS: Record<ApprovalType, string> = {
  cancel: 'close-circle-outline',
  courtesy: 'star-outline',
  refund: 'arrow-down-circle-outline',
  discount: 'tag-outline',
};

const getTimeAgo = (dateStr: string): string => {
  const created = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return '< 1min';
  if (diffMin < 60) return `${diffMin}min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h`;
  return `${Math.floor(diffHours / 24)}d`;
};

export default function ApprovalsScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [stats, setStats] = useState<ApprovalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rejectDialogId, setRejectDialogId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  // Dynamic type colors from theme
  const TYPE_COLORS: Record<ApprovalType, string> = useMemo(
    () => ({
      cancel: colors.error,
      courtesy: colors.warning,
      refund: colors.info,
      discount: colors.foregroundSecondary,
    }),
    [colors],
  );

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [approvalsRes, statsRes] = await Promise.allSettled([
        ApiService.get('/approvals?restaurantId=current&status=pending'),
        ApiService.get('/approvals/stats?restaurantId=current'),
      ]);

      if (approvalsRes.status === 'fulfilled') {
        setApprovals(approvalsRes.value?.data || []);
      }
      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value?.data || null);
      }
    } catch (error) {
      console.error('Failed to load approvals:', error);
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

  const handleResolve = useCallback(
    async (approvalId: string, decision: 'approved' | 'rejected', note?: string) => {
      // Optimistic update
      setApprovals((prev) =>
        prev.map((a) => (a.id === approvalId ? { ...a, status: decision } : a)),
      );

      if (stats) {
        setStats({
          ...stats,
          pending: Math.max(0, stats.pending - 1),
          approvedToday: decision === 'approved' ? stats.approvedToday + 1 : stats.approvedToday,
          rejectedToday: decision === 'rejected' ? stats.rejectedToday + 1 : stats.rejectedToday,
        });
      }

      try {
        await ApiService.patch(`/approvals/${approvalId}/resolve`, { decision, note });

        if (Platform.OS === 'ios') {
          // Haptic feedback would go here if expo-haptics is installed
        }

        Alert.alert(t('common.success'), t('approvals.resolveSuccess'));
      } catch (error) {
        // Revert optimistic update
        setApprovals((prev) =>
          prev.map((a) => (a.id === approvalId ? { ...a, status: 'pending' as ApprovalStatus } : a)),
        );

        if (stats) {
          setStats({
            ...stats,
            pending: stats.pending,
            approvedToday:
              decision === 'approved' ? stats.approvedToday - 1 : stats.approvedToday,
            rejectedToday:
              decision === 'rejected' ? stats.rejectedToday - 1 : stats.rejectedToday,
          });
        }

        Alert.alert(t('common.error'), t('approvals.resolveError'));
      }
    },
    [stats, t],
  );

  const handleRejectConfirm = useCallback(() => {
    if (rejectDialogId) {
      handleResolve(rejectDialogId, 'rejected', rejectNote || undefined);
      setRejectDialogId(null);
      setRejectNote('');
    }
  }, [rejectDialogId, rejectNote, handleResolve]);

  const handleRejectCancel = useCallback(() => {
    setRejectDialogId(null);
    setRejectNote('');
  }, []);

  const showRejectDialog = useCallback(
    (approvalId: string) => {
      Alert.alert(
        t('approvals.rejectTitle'),
        t('approvals.rejectMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('approvals.rejectConfirm'),
            style: 'destructive',
            onPress: () => handleResolve(approvalId, 'rejected'),
          },
        ],
      );
    },
    [t, handleResolve],
  );

  const getTypeLabel = useCallback(
    (type: ApprovalType): string => {
      const labels: Record<ApprovalType, string> = {
        cancel: t('approvals.typeCancel'),
        courtesy: t('approvals.typeCourtesy'),
        refund: t('approvals.typeRefund'),
        discount: t('approvals.typeDiscount'),
      };
      return labels[type] || type;
    },
    [t],
  );

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
        // Gradient header
        headerGradient: {
          paddingTop: insets.top + 12,
          paddingBottom: 20,
          paddingHorizontal: 20,
        },
        headerTitle: {
          color: colors.primaryForeground,
          fontSize: 24,
          fontWeight: '700',
        },
        headerSubtitle: {
          color: colors.primaryForeground + 'CC',
          fontSize: 14,
          marginTop: 4,
        },
        // Stats row
        statsRow: {
          flexDirection: 'row',
          paddingHorizontal: 12,
          marginTop: -12,
          marginBottom: 16,
        },
        statCard: {
          flex: 1,
          margin: 4,
          backgroundColor: colors.card,
          borderRadius: 20,
          padding: 14,
          alignItems: 'center',
          borderWidth: 1,
          borderColor: colors.border,
          elevation: 2,
        },
        statIconBox: {
          width: 36,
          height: 36,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 8,
        },
        statValue: {
          color: colors.foreground,
          fontWeight: '700',
          fontSize: 20,
        },
        statLabel: {
          color: colors.foregroundSecondary,
          fontSize: 12,
          marginTop: 4,
          textAlign: 'center',
        },
        // Approval cards
        approvalCard: {
          marginHorizontal: 16,
          marginBottom: 10,
          backgroundColor: colors.card,
          borderRadius: 20,
          borderWidth: 2,
          borderColor: colors.border,
          elevation: 2,
          overflow: 'hidden',
        },
        approvalCardProcessed: {
          opacity: 0.5,
        },
        cardHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          padding: 16,
          paddingBottom: 8,
        },
        iconBox: {
          width: 40,
          height: 40,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        },
        typeBadge: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 999,
        },
        typeBadgeText: {
          fontSize: 10,
          fontWeight: '600',
          marginLeft: 4,
        },
        timeText: {
          color: colors.foregroundSecondary,
          fontSize: 12,
          marginLeft: 'auto',
        },
        cardBody: {
          paddingHorizontal: 16,
          paddingBottom: 12,
        },
        itemName: {
          color: colors.foreground,
          fontWeight: '600',
          fontSize: 16,
        },
        reasonText: {
          color: colors.foregroundSecondary,
          fontSize: 14,
          marginTop: 4,
        },
        requesterRow: {
          flexDirection: 'row',
          alignItems: 'center',
          marginTop: 6,
        },
        requesterText: {
          color: colors.foregroundSecondary,
          fontSize: 12,
          marginLeft: 4,
        },
        amountText: {
          color: colors.foreground,
          fontWeight: '700',
          fontSize: 18,
          marginTop: 8,
        },
        // Action buttons
        actionsRow: {
          flexDirection: 'row',
          padding: 12,
          paddingTop: 0,
          gap: 10,
        },
        approveButton: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 12,
          borderRadius: 16,
          backgroundColor: colors.success,
        },
        approveText: {
          color: colors.primaryForeground,
          fontWeight: '700',
          fontSize: 14,
          marginLeft: 6,
        },
        rejectButton: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 12,
          borderRadius: 16,
          backgroundColor: colors.errorBackground,
        },
        rejectText: {
          color: colors.error,
          fontWeight: '700',
          fontSize: 14,
          marginLeft: 6,
        },
        processedBadge: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 10,
          marginHorizontal: 16,
          marginBottom: 12,
          borderRadius: 12,
          backgroundColor: colors.successBackground,
        },
        processedText: {
          color: colors.success,
          fontWeight: '600',
          marginLeft: 4,
        },
        emptyContainer: {
          alignItems: 'center',
          paddingVertical: 48,
          paddingHorizontal: 32,
        },
        emptyTitle: {
          color: colors.foreground,
          fontWeight: '600',
          marginTop: 16,
          textAlign: 'center',
        },
        emptySubtitle: {
          color: colors.foregroundSecondary,
          marginTop: 8,
          textAlign: 'center',
        },
        skeletonCard: {
          height: 140,
          marginHorizontal: 16,
          marginBottom: 10,
          backgroundColor: colors.backgroundTertiary,
          borderRadius: 20,
        },
      }),
    [colors, insets],
  );

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
      {/* Gradient Header */}
      <LinearGradient
        colors={[colors.primary, colors.accent]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.headerGradient}
      >
        <Text style={styles.headerTitle}>
          {t('approvals.title')}
        </Text>
        {stats && (
          <Text style={styles.headerSubtitle}>
            {stats.pending} {t('approvals.statsPending')}
          </Text>
        )}
      </LinearGradient>

      {/* Stats Row */}
      {stats && (
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={[styles.statIconBox, { backgroundColor: `${colors.warning}1A` }]}>
              <IconButton icon="clock-outline" size={18} iconColor={colors.warning} style={{ margin: 0, padding: 0, width: 18, height: 18 }} />
            </View>
            <Text style={styles.statValue}>{stats.pending}</Text>
            <Text style={styles.statLabel}>{t('approvals.statsPending')}</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIconBox, { backgroundColor: `${colors.success}1A` }]}>
              <IconButton icon="check-circle-outline" size={18} iconColor={colors.success} style={{ margin: 0, padding: 0, width: 18, height: 18 }} />
            </View>
            <Text style={[styles.statValue, { color: colors.success }]}>
              {stats.approvedToday}
            </Text>
            <Text style={styles.statLabel}>{t('approvals.statsApproved')}</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIconBox, { backgroundColor: `${colors.error}1A` }]}>
              <IconButton icon="close-circle-outline" size={18} iconColor={colors.error} style={{ margin: 0, padding: 0, width: 18, height: 18 }} />
            </View>
            <Text style={[styles.statValue, { color: colors.error }]}>
              {stats.rejectedToday}
            </Text>
            <Text style={styles.statLabel}>{t('approvals.statsRejected')}</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIconBox, { backgroundColor: `${colors.primary}1A` }]}>
              <IconButton icon="cash" size={18} iconColor={colors.primary} style={{ margin: 0, padding: 0, width: 18, height: 18 }} />
            </View>
            <Text style={styles.statValue}>
              R$ {Number(stats.totalImpact).toFixed(0)}
            </Text>
            <Text style={styles.statLabel}>{t('approvals.statsTotalImpact')}</Text>
          </View>
        </View>
      )}

      {/* Approvals List */}
      {approvals.length === 0 ? (
        <View style={styles.emptyContainer}>
          <IconButton icon="check-circle-outline" size={48} iconColor={colors.success} />
          <Text variant="titleMedium" style={styles.emptyTitle}>
            {t('approvals.emptyTitle')}
          </Text>
          <Text variant="bodyMedium" style={styles.emptySubtitle}>
            {t('approvals.emptySubtitle')}
          </Text>
        </View>
      ) : (
        approvals.map((approval) => {
          const isProcessed = approval.status !== 'pending';
          const typeColor = TYPE_COLORS[approval.type];

          return (
            <View
              key={approval.id}
              style={[styles.approvalCard, isProcessed && styles.approvalCardProcessed]}
            >
              {/* Header */}
              <View style={styles.cardHeader}>
                {/* Icon Box */}
                <View
                  style={[
                    styles.iconBox,
                    { backgroundColor: `${typeColor}1A` },
                  ]}
                >
                  <IconButton
                    icon={TYPE_ICONS[approval.type]}
                    size={20}
                    iconColor={typeColor}
                    style={{ margin: 0, padding: 0, width: 20, height: 20 }}
                  />
                </View>
                {/* Type Badge (pill) */}
                <View
                  style={[
                    styles.typeBadge,
                    { backgroundColor: `${typeColor}1A` },
                  ]}
                >
                  <Text style={[styles.typeBadgeText, { color: typeColor }]}>
                    {getTypeLabel(approval.type)}
                  </Text>
                </View>
                <Text style={styles.timeText}>{getTimeAgo(approval.created_at)}</Text>
              </View>

              {/* Body */}
              <View style={styles.cardBody}>
                <Text style={styles.itemName}>{approval.item_name}</Text>
                <Text style={styles.reasonText} numberOfLines={2}>
                  {approval.reason}
                </Text>
                <View style={styles.requesterRow}>
                  <IconButton
                    icon="account-outline"
                    size={14}
                    iconColor={colors.foregroundSecondary}
                    style={{ margin: 0, padding: 0, width: 14, height: 14 }}
                  />
                  <Text style={styles.requesterText}>
                    {t('approvals.requestedBy')} {approval.requester?.full_name || '---'}
                  </Text>
                </View>
                <Text style={styles.amountText}>
                  R$ {Number(approval.amount).toFixed(2)}
                </Text>
              </View>

              {/* Actions */}
              {!isProcessed ? (
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={styles.approveButton}
                    onPress={() => handleResolve(approval.id, 'approved')}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('approvals.approveButton')} ${approval.item_name}`}
                    accessibilityHint={t('approvals.approveButton')}
                  >
                    <IconButton
                      icon="check-circle"
                      size={18}
                      iconColor={colors.primaryForeground}
                      style={{ margin: 0, padding: 0, width: 18, height: 18 }}
                    />
                    <Text style={styles.approveText}>{t('approvals.approveButton')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rejectButton}
                    onPress={() => showRejectDialog(approval.id)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('approvals.rejectButton')} ${approval.item_name}`}
                    accessibilityHint={t('approvals.rejectButton')}
                  >
                    <IconButton
                      icon="close-circle"
                      size={18}
                      iconColor={colors.error}
                      style={{ margin: 0, padding: 0, width: 18, height: 18 }}
                    />
                    <Text style={styles.rejectText}>{t('approvals.rejectButton')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.processedBadge}>
                  <IconButton
                    icon="check"
                    size={16}
                    iconColor={colors.success}
                    style={{ margin: 0, padding: 0, width: 16, height: 16 }}
                  />
                  <Text style={styles.processedText}>{t('approvals.processedLabel')}</Text>
                </View>
              )}
            </View>
          );
        })
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
    </ScreenContainer>
  );
}
