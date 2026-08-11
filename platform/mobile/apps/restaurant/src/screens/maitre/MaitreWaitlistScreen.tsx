import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
  LayoutAnimation,
  TextInput as RNTextInput,
  Modal,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import {
  Text,
  Card,
  Button,
  IconButton,
  Chip,
  SegmentedButtons,
  TextInput,
  Divider,
  Badge,
} from 'react-native-paper';
import { useI18n } from '@/shared/hooks/useI18n';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import ApiService from '@/shared/services/api';

interface WaitlistEntry {
  id: string;
  position: number;
  customer_name: string;
  party_size: number;
  preference: string;
  has_kids: boolean;
  kids_ages: number[] | null;
  kids_allergies: string[] | null;
  waitlist_bar_orders: Array<{ itemName: string; itemPrice: number; quantity: number }>;
  status: 'waiting' | 'called' | 'seated' | 'no_show' | 'cancelled';
  estimated_wait_minutes: number | null;
  table_number: string | null;
  created_at: string;
  called_at: string | null;
}

interface WaitlistStats {
  totalWaiting: number;
  tablesAvailable: number;
  avgWaitMinutes: number;
  groupsWithKids: number;
}

interface MaitreWaitlistScreenProps {
  route?: {
    params?: {
      restaurantId: string;
    };
  };
}

const ITEM_HEIGHT = 140;

export default function MaitreWaitlistScreen({ route }: MaitreWaitlistScreenProps) {
  const { t } = useI18n();
  const colors = useColors();
  const restaurantId = route?.params?.restaurantId || '';

  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [stats, setStats] = useState<WaitlistStats | null>(null);
  const [filter, setFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Call modal state
  const [callModalVisible, setCallModalVisible] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<WaitlistEntry | null>(null);
  const [tableNumberInput, setTableNumberInput] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Expanded entries (for kids info)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const fetchWaitlist = useCallback(async () => {
    try {
      const [waitlistRes, statsRes] = await Promise.all([
        ApiService.get(`/restaurant/waitlist/${restaurantId}`),
        ApiService.get(`/restaurant/waitlist/${restaurantId}/stats`),
      ]);
      setEntries(waitlistRes.data);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Error fetching waitlist:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    fetchWaitlist();
  }, [fetchWaitlist]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchWaitlist();
  }, [fetchWaitlist]);

  const filteredEntries = useMemo(() => {
    if (filter === 'waiting') {
      return entries.filter((e) => e.status === 'waiting');
    }
    if (filter === 'called') {
      return entries.filter((e) => e.status === 'called');
    }
    return entries;
  }, [entries, filter]);

  const handleOpenCallModal = useCallback((entry: WaitlistEntry) => {
    setSelectedEntry(entry);
    setTableNumberInput('');
    setCallModalVisible(true);
  }, []);

  const handleCallGuest = useCallback(async () => {
    if (!selectedEntry) return;

    setActionLoading(true);
    try {
      await ApiService.patch(`/restaurant/waitlist/${selectedEntry.id}/call`, {
        table_number: tableNumberInput.trim() || undefined,
      });

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setCallModalVisible(false);
      fetchWaitlist();

      Alert.alert(
        t('common.success'),
        t('waitlistMgmt.callSuccess', {
          name: selectedEntry.customer_name,
          table: tableNumberInput || '',
        }),
      );
    } catch (error: any) {
      Alert.alert(t('common.error'), error?.message || t('common.error'));
    } finally {
      setActionLoading(false);
    }
  }, [selectedEntry, tableNumberInput, fetchWaitlist, t]);

  const handleSeatGuest = useCallback(
    async (entry: WaitlistEntry) => {
      setActionLoading(true);
      try {
        await ApiService.patch(`/restaurant/waitlist/${entry.id}/seat`);

        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        fetchWaitlist();

        Alert.alert(
          t('common.success'),
          t('waitlistMgmt.seatedSuccess', {
            name: entry.customer_name,
            table: entry.table_number || '',
          }),
        );
      } catch (error: any) {
        Alert.alert(t('common.error'), error?.message || t('common.error'));
      } finally {
        setActionLoading(false);
      }
    },
    [fetchWaitlist, t],
  );

  const handleNoShow = useCallback(
    async (entry: WaitlistEntry) => {
      Alert.alert(
        t('waitlistMgmt.noShow'),
        `${entry.customer_name}?`,
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.confirm'),
            style: 'destructive',
            onPress: async () => {
              try {
                await ApiService.patch(
                  `/restaurant/waitlist/${entry.id}/no-show`,
                );

                LayoutAnimation.configureNext(
                  LayoutAnimation.Presets.easeInEaseOut,
                );
                fetchWaitlist();

                Alert.alert(
                  t('common.success'),
                  t('waitlistMgmt.noShowSuccess', {
                    name: entry.customer_name,
                  }),
                );
              } catch (error: any) {
                Alert.alert(
                  t('common.error'),
                  error?.message || t('common.error'),
                );
              }
            },
          },
        ],
      );
    },
    [fetchWaitlist, t],
  );

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const getWaitTime = useCallback((createdAt: string): number => {
    const created = new Date(createdAt);
    const now = new Date();
    return Math.round((now.getTime() - created.getTime()) / 60000);
  }, []);

  const getPositionColor = useCallback(
    (position: number, status: string): string => {
      if (status === 'called') return colors.warning;
      if (position === 1) return colors.success;
      if (position <= 3) return colors.primary;
      return colors.foregroundSecondary;
    },
    [colors],
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        // Stats header
        statsHeader: {
          flexDirection: 'row',
          justifyContent: 'space-around',
          paddingVertical: 16,
          paddingHorizontal: 8,
          backgroundColor: colors.card,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        statItem: {
          alignItems: 'center',
        },
        statValue: {
          fontSize: 20,
          fontWeight: '700',
          color: colors.foreground,
        },
        statLabel: {
          fontSize: 12,
          color: colors.foregroundSecondary,
          marginTop: 2,
        },
        // Filters
        filterContainer: {
          paddingHorizontal: 16,
          paddingVertical: 12,
        },
        // Entry card
        entryCard: {
          marginHorizontal: 16,
          marginBottom: 12,
          borderRadius: 12,
        },
        entryContent: {
          padding: 16,
        },
        entryHeader: {
          flexDirection: 'row',
          alignItems: 'center',
        },
        positionBadge: {
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
        },
        positionNumber: {
          fontSize: 18,
          fontWeight: '700',
          color: colors.primaryForeground,
        },
        entryInfo: {
          flex: 1,
          marginLeft: 12,
        },
        entryName: {
          fontSize: 16,
          fontWeight: '600',
          color: colors.foreground,
        },
        entryMeta: {
          fontSize: 14,
          color: colors.foregroundSecondary,
          marginTop: 2,
        },
        entryBadges: {
          flexDirection: 'row',
          gap: 6,
          marginTop: 6,
        },
        kidsBadge: {
          backgroundColor: `${colors.secondary}20`,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 8,
        },
        kidsBadgeText: {
          fontSize: 12,
          fontWeight: '600',
          color: colors.secondary,
          marginLeft: 2,
        },
        barOrdersBadge: {
          backgroundColor: `${colors.primary}20`,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 8,
        },
        barOrdersBadgeText: {
          fontSize: 12,
          fontWeight: '600',
          color: colors.primary,
          marginLeft: 2,
        },
        waitTimeText: {
          fontSize: 14,
          color: colors.foregroundMuted,
        },
        // Actions
        actionsRow: {
          flexDirection: 'row',
          justifyContent: 'flex-end',
          gap: 8,
          marginTop: 12,
        },
        callButton: {
          borderRadius: 8,
          backgroundColor: colors.primary,
        },
        seatButton: {
          borderRadius: 8,
          backgroundColor: colors.success,
        },
        noShowButton: {
          borderRadius: 8,
          borderColor: colors.error,
        },
        noShowLabel: {
          color: colors.error,
        },
        // Expanded kids info
        expandedSection: {
          marginTop: 12,
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        },
        kidsInfoTitle: {
          fontSize: 14,
          fontWeight: '600',
          color: colors.secondary,
          marginBottom: 4,
        },
        kidsInfoText: {
          fontSize: 14,
          color: colors.foregroundSecondary,
        },
        // Called status
        calledBadge: {
          backgroundColor: `${colors.warning}20`,
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 8,
        },
        calledBadgeText: {
          fontSize: 12,
          fontWeight: '600',
          color: colors.warning,
        },
        // Empty state
        emptyContainer: {
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 64,
        },
        emptyText: {
          fontSize: 16,
          color: colors.foregroundMuted,
          marginTop: 8,
        },
        // Loading
        loadingContainer: {
          flex: 1,
          backgroundColor: colors.background,
          padding: 16,
        },
        skeletonCard: {
          marginBottom: 12,
          height: 100,
          borderRadius: 12,
          backgroundColor: colors.card,
        },
        // Modal
        modalOverlay: {
          flex: 1,
          backgroundColor: colors.overlay,
          justifyContent: 'flex-end',
        },
        modalContent: {
          backgroundColor: colors.card,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          padding: 24,
          paddingBottom: 40,
        },
        modalTitle: {
          fontSize: 20,
          fontWeight: '700',
          color: colors.foreground,
          marginBottom: 16,
        },
        modalInput: {
          marginBottom: 16,
          backgroundColor: colors.background,
        },
        modalActions: {
          flexDirection: 'row',
          gap: 12,
        },
        modalButton: {
          flex: 1,
          borderRadius: 12,
        },
        modalConfirmButton: {
          flex: 1,
          borderRadius: 12,
          backgroundColor: colors.primary,
        },
      }),
    [colors],
  );

  // Skeleton loading
  if (loading) {
    return (
      <ScreenContainer hasKeyboard>
      <View style={styles.loadingContainer}>
        <View style={styles.skeletonCard} />
        <View style={styles.skeletonCard} />
        <View style={styles.skeletonCard} />
        <View style={styles.skeletonCard} />
      </View>
      </ScreenContainer>
    );
  }

  const renderEntry = ({ item }: { item: WaitlistEntry }) => {
    const isCalled = item.status === 'called';
    const waitMin = getWaitTime(item.created_at);
    const isExpanded = expandedIds.has(item.id);
    const posColor = getPositionColor(item.position, item.status);
    const barOrderCount = (item.waitlist_bar_orders || []).reduce(
      (sum, o) => sum + o.quantity,
      0,
    );

    return (
      <Card style={styles.entryCard} accessibilityLabel={item.customer_name}>
        <View style={styles.entryContent}>
          <View style={styles.entryHeader}>
            {/* Position badge */}
            <View style={[styles.positionBadge, { backgroundColor: posColor }]}>
              <Text style={styles.positionNumber}>{item.position}</Text>
            </View>

            {/* Info */}
            <View style={styles.entryInfo}>
              <Text style={styles.entryName}>{item.customer_name}</Text>
              <Text style={styles.entryMeta}>
                {t('waitlistMgmt.partyOf', { count: item.party_size })} {' \u00B7 '}
                {t('waitlistMgmt.waitTime', { min: waitMin })}
              </Text>

              {/* Badges */}
              <View style={styles.entryBadges}>
                {item.has_kids && (
                  <TouchableOpacity
                    style={styles.kidsBadge}
                    onPress={() => toggleExpand(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={t('waitlistMgmt.kidsLabel')}
                  >
                    <IconButton
                      icon="baby-face-outline"
                      size={12}
                      iconColor={colors.secondary}
                      accessibilityLabel={t('waitlistMgmt.kidsLabel')}
                    />
                    <Text style={styles.kidsBadgeText}>
                      {t('waitlistMgmt.kidsLabel')}
                    </Text>
                  </TouchableOpacity>
                )}

                {barOrderCount > 0 && (
                  <View
                    style={styles.barOrdersBadge}
                    accessibilityLabel={t('waitlistMgmt.barOrdersLabel', {
                      count: barOrderCount,
                    })}
                  >
                    <IconButton
                      icon="glass-cocktail"
                      size={12}
                      iconColor={colors.primary}
                      accessibilityLabel={t('waitlistMgmt.barOrdersLabel', {
                        count: barOrderCount,
                      })}
                    />
                    <Text style={styles.barOrdersBadgeText}>
                      {barOrderCount}
                    </Text>
                  </View>
                )}

                {isCalled && (
                  <View style={styles.calledBadge}>
                    <Text style={styles.calledBadgeText}>
                      {t('waitlistMgmt.calledStatus')}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Wait time */}
            <Text style={styles.waitTimeText}>
              {t('waitlistMgmt.waitTime', { min: waitMin })}
            </Text>
          </View>

          {/* Expanded kids info */}
          {isExpanded && item.has_kids && (
            <View style={styles.expandedSection}>
              <Text style={styles.kidsInfoTitle}>
                {t('waitlistMgmt.kidsLabel')}
              </Text>
              {item.kids_ages && (
                <Text style={styles.kidsInfoText}>
                  {t('familyMode.childAge')}: {item.kids_ages.join(', ')}
                </Text>
              )}
              {item.kids_allergies && item.kids_allergies.length > 0 && (
                <Text style={styles.kidsInfoText}>
                  {t('familyMode.childAllergies')}: {item.kids_allergies.join(', ')}
                </Text>
              )}
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.actionsRow}>
            {!isCalled && (
              <Button
                mode="contained"
                onPress={() => handleOpenCallModal(item)}
                style={styles.callButton}
                compact
                accessibilityRole="button"
                accessibilityLabel={`${t('waitlistMgmt.call')} ${item.customer_name}`}
              >
                {t('waitlistMgmt.call')}
              </Button>
            )}

            {isCalled && (
              <Button
                mode="contained"
                onPress={() => handleSeatGuest(item)}
                style={styles.seatButton}
                compact
                accessibilityRole="button"
                accessibilityLabel={`${t('waitlistMgmt.seated')} ${item.customer_name}`}
              >
                {t('waitlistMgmt.seated')}
              </Button>
            )}

            <Button
              mode="outlined"
              onPress={() => handleNoShow(item)}
              style={styles.noShowButton}
              labelStyle={styles.noShowLabel}
              compact
              accessibilityRole="button"
              accessibilityLabel={`${t('waitlistMgmt.noShow')} ${item.customer_name}`}
            >
              {t('waitlistMgmt.noShow')}
            </Button>
          </View>
        </View>
      </Card>
    );
  };

  return (
    <ScreenContainer hasKeyboard>
    <View style={styles.container}>
      {/* Stats header */}
      <View style={styles.statsHeader}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats?.totalWaiting || 0}</Text>
          <Text style={styles.statLabel}>{t('waitlistMgmt.totalWaiting')}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats?.tablesAvailable || 0}</Text>
          <Text style={styles.statLabel}>
            {t('waitlistMgmt.tablesAvailable')}
          </Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {stats?.avgWaitMinutes || 0}{t('waitlistMgmt.waitTime', { min: '' }).trim().replace('min', '')}
          </Text>
          <Text style={styles.statLabel}>{t('waitlistMgmt.avgWait')}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats?.groupsWithKids || 0}</Text>
          <Text style={styles.statLabel}>
            {t('waitlistMgmt.familyGroups')}
          </Text>
        </View>
      </View>

      {/* Filter */}
      <View style={styles.filterContainer}>
        <SegmentedButtons
          value={filter}
          onValueChange={setFilter}
          buttons={[
            { value: 'all', label: t('waitlistMgmt.filterAll') },
            { value: 'waiting', label: t('waitlistMgmt.filterWaiting') },
            { value: 'called', label: t('waitlistMgmt.filterCalled') },
          ]}
        />
      </View>

      {/* Entry list */}
      <FlatList
        data={filteredEntries}
        renderItem={renderEntry}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        getItemLayout={(_, index) => ({
          length: ITEM_HEIGHT,
          offset: ITEM_HEIGHT * index,
          index,
        })}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <IconButton
                icon="account-group-outline"
                size={64}
                iconColor={colors.foregroundMuted}
                accessibilityLabel={t('waitlistMgmt.emptyQueue')}
              />
              <Text style={styles.emptyText}>{t('waitlistMgmt.emptyQueue')}</Text>
            </View>
          ) : null
        }
      />

      {/* Call Guest Modal (Bottom Sheet) */}
      <Modal
        visible={callModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCallModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setCallModalVisible(false)}
        >
          {/* Prevent backdrop touch from dismissing when tapping modal content */}
          <Pressable style={styles.modalContent} onPress={() => {/* intentional: stops event propagation */}}>
            <Text style={styles.modalTitle}>
              {t('waitlistMgmt.callGuest')}
            </Text>

            {selectedEntry && (
              <Text style={{ color: colors.foregroundSecondary, marginBottom: 16 }}>
                {selectedEntry.customer_name} -{' '}
                {t('waitlistMgmt.partyOf', {
                  count: selectedEntry.party_size,
                })}
              </Text>
            )}

            <TextInput
              label={t('waitlistMgmt.tableNumber')}
              placeholder={t('waitlistMgmt.tableNumberPlaceholder')}
              value={tableNumberInput}
              onChangeText={setTableNumberInput}
              style={styles.modalInput}
              mode="outlined"
              accessibilityLabel={t('waitlistMgmt.tableNumber')}
            />

            <View style={styles.modalActions}>
              <Button
                mode="outlined"
                onPress={() => setCallModalVisible(false)}
                style={styles.modalButton}
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
              >
                {t('common.cancel')}
              </Button>
              <Button
                mode="contained"
                onPress={handleCallGuest}
                loading={actionLoading}
                disabled={actionLoading}
                style={styles.modalConfirmButton}
                accessibilityRole="button"
                accessibilityLabel={t('waitlistMgmt.confirmCall')}
              >
                {t('waitlistMgmt.confirmCall')}
              </Button>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
    </ScreenContainer>
  );
}
