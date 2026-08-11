import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Modal,
} from 'react-native';
import { Text, Card, ActivityIndicator, FAB } from 'react-native-paper';
import ApiService from '@/shared/services/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useI18n } from '@/shared/hooks/useI18n';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { spacing, borderRadius } from '@okinawa/shared/theme/spacing';
import type {
  InventoryItem,
  InventoryStats,
  InventoryStatus,
  InventoryCategory,
  UpdateItemLevelPayload,
  INVENTORY_CATEGORIES,
} from '../../types/inventory';

type FilterType = 'all' | 'low' | 'critical';

/** Map category enum value to i18n key */
const CATEGORY_LABEL_KEYS: Record<string, string> = {
  meats: 'stock.categoryMeats',
  grains: 'stock.categoryGrains',
  vegetables: 'stock.categoryVegetables',
  dairy: 'stock.categoryDairy',
  beverages: 'stock.categoryBeverages',
  spirits: 'stock.categorySpirits',
  condiments: 'stock.categoryCondiments',
  packaging: 'stock.categoryPackaging',
  cleaning: 'stock.categoryCleaning',
  other: 'stock.categoryOther',
};

const STATUS_ORDER: Record<InventoryStatus, number> = {
  critical: 0,
  low: 1,
  ok: 2,
};

export default function StockScreen({ navigation }: { navigation: any }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const colors = useColors();

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Update Level Modal
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [newLevel, setNewLevel] = useState('');
  const [levelNotes, setLevelNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const restaurantId = useMemo(() => {
    return user?.roles?.[0]?.restaurant_id ?? '';
  }, [user]);

  const loadData = useCallback(async () => {
    try {
      const [itemsRes, statsRes] = await Promise.all([
        ApiService.get(`/inventory?restaurantId=${restaurantId}`),
        ApiService.get(`/inventory/stats?restaurantId=${restaurantId}`),
      ]);
      setItems(itemsRes?.data || itemsRes || []);
      setStats(statsRes?.data || statsRes || null);
    } catch (error) {
      console.error('Failed to load inventory:', error);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const filteredItems = useMemo(() => {
    let result = [...items];

    // Filter by status tab
    if (filter === 'critical') {
      result = result.filter((i) => i.status === 'critical');
    } else if (filter === 'low') {
      result = result.filter((i) => i.status !== 'ok');
    }

    // Filter by category chip
    if (selectedCategory) {
      result = result.filter((i) => i.category === selectedCategory);
    }

    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((i) => i.name.toLowerCase().includes(q));
    }

    // Sort by status priority
    result.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

    return result;
  }, [items, filter, selectedCategory, searchQuery]);

  const getStatusColor = (status: InventoryStatus) => {
    switch (status) {
      case 'critical':
        return colors.error;
      case 'low':
        return colors.warning;
      case 'ok':
        return colors.success;
    }
  };

  const getStatusBgColor = (status: InventoryStatus) => {
    switch (status) {
      case 'critical':
        return colors.errorBackground;
      case 'low':
        return colors.warningBackground;
      case 'ok':
        return 'transparent';
    }
  };

  const handleItemPress = (item: InventoryItem) => {
    navigation.navigate('StockItemDetail', { itemId: item.id });
  };

  const handleUpdateLevel = (item: InventoryItem) => {
    setSelectedItem(item);
    setNewLevel(String(item.current_level));
    setLevelNotes('');
  };

  const handleSaveLevel = async () => {
    if (!selectedItem) return;
    const level = parseFloat(newLevel);
    if (isNaN(level) || level < 0) return;
    if (level === selectedItem.current_level) return;

    setSaving(true);
    try {
      const payload: UpdateItemLevelPayload = {
        current_level: level,
        notes: levelNotes || undefined,
      };
      const updated = await ApiService.patch(
        `/inventory/${selectedItem.id}/level`,
        payload,
      );
      const updatedData = updated?.data || updated;

      setItems((prev) =>
        prev.map((i) => (i.id === selectedItem.id ? { ...i, ...updatedData } : i)),
      );
      // Refresh stats
      loadData();
      setSelectedItem(null);
    } catch (error) {
      console.error('Failed to update level:', error);
    } finally {
      setSaving(false);
    }
  };

  // Skeleton loading
  if (loading) {
    return (
      <ScreenContainer hasKeyboard>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.foregroundSecondary }]}>
            {t('common.loading')}
          </Text>
        </View>
      </View>
      </ScreenContainer>
    );
  }

  const renderStatsHeader = () => (
    <View style={styles.statsRow}>
      <View style={[styles.statCard, { backgroundColor: colors.successBackground }]}>
        <Text style={[styles.statCount, { color: colors.success }]}>
          {stats?.ok ?? 0}
        </Text>
        <Text style={[styles.statLabel, { color: colors.success }]}>
          {t('stock.statsOk')}
        </Text>
      </View>
      <View style={[styles.statCard, { backgroundColor: colors.warningBackground }]}>
        <Text style={[styles.statCount, { color: colors.warning }]}>
          {stats?.low ?? 0}
        </Text>
        <Text style={[styles.statLabel, { color: colors.warning }]}>
          {t('stock.statsLow')}
        </Text>
      </View>
      <View style={[styles.statCard, { backgroundColor: colors.errorBackground }]}>
        <Text style={[styles.statCount, { color: colors.error }]}>
          {stats?.critical ?? 0}
        </Text>
        <Text style={[styles.statLabel, { color: colors.error }]}>
          {t('stock.statsCritical')}
        </Text>
      </View>
    </View>
  );

  const renderFilterTabs = () => {
    const tabs: { key: FilterType; label: string }[] = [
      { key: 'all', label: t('stock.filterAll') },
      { key: 'critical', label: t('stock.filterCritical') },
      { key: 'low', label: t('stock.filterLow') },
    ];

    return (
      <View style={styles.filterRow}>
        {tabs.map((tab) => {
          const isActive = filter === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.filterTab,
                {
                  backgroundColor: isActive ? colors.primary : colors.backgroundSecondary,
                  borderColor: isActive ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setFilter(tab.key)}
              accessibilityRole="button"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: isActive }}
            >
              <Text
                style={[
                  styles.filterTabText,
                  {
                    color: isActive ? colors.primaryForeground : colors.foregroundSecondary,
                  },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderSearch = () => (
    <View style={[styles.searchContainer, { backgroundColor: colors.input, borderColor: colors.inputBorder }]}>
      <TextInput
        style={[styles.searchInput, { color: colors.foreground }]}
        placeholder={t('stock.searchPlaceholder')}
        placeholderTextColor={colors.inputPlaceholder}
        value={searchQuery}
        onChangeText={setSearchQuery}
        accessibilityLabel={t('stock.searchPlaceholder')}
      />
    </View>
  );

  const renderCategoryChips = () => {
    const categories = Object.keys(CATEGORY_LABEL_KEYS);
    return (
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={[null, ...categories]}
        keyExtractor={(item) => item || 'all'}
        style={styles.categoryChipsContainer}
        renderItem={({ item: cat }) => {
          const isActive = cat === selectedCategory || (cat === null && !selectedCategory);
          return (
            <TouchableOpacity
              style={[
                styles.categoryChip,
                {
                  backgroundColor: isActive ? colors.primary : colors.backgroundTertiary,
                },
              ]}
              onPress={() => setSelectedCategory(cat)}
              accessibilityRole="button"
              accessibilityLabel={cat ? t(CATEGORY_LABEL_KEYS[cat]) : t('stock.categoryAll')}
              accessibilityState={{ selected: isActive }}
            >
              <Text
                style={[
                  styles.categoryChipText,
                  {
                    color: isActive
                      ? colors.primaryForeground
                      : colors.foregroundSecondary,
                  },
                ]}
              >
                {cat ? t(CATEGORY_LABEL_KEYS[cat]) : t('stock.categoryAll')}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
    );
  };

  const renderItem = ({ item }: { item: InventoryItem }) => {
    const statusColor = getStatusColor(item.status);
    const statusBg = getStatusBgColor(item.status);
    const progressWidth = Math.min(item.level_pct, 100);

    return (
      <TouchableOpacity
        onPress={() => handleItemPress(item)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${item.current_level} ${item.unit}, status ${item.status}`}
      >
        <Card
          style={[
            styles.itemCard,
            {
              backgroundColor: statusBg === 'transparent' ? colors.card : statusBg,
              borderColor: colors.cardBorder,
            },
          ]}
        >
          <View style={styles.itemContent}>
            <View style={styles.itemHeader}>
              {/* Status dot */}
              <View
                style={[styles.statusDot, { backgroundColor: statusColor }]}
              />
              <View style={styles.itemInfo}>
                <Text
                  style={[styles.itemName, { color: colors.foreground }]}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                <Text style={[styles.itemCategory, { color: colors.foregroundSecondary }]}>
                  {t(CATEGORY_LABEL_KEYS[item.category] || 'stock.categoryOther')}
                </Text>
              </View>
              <View style={styles.itemQuantity}>
                <Text style={[styles.quantityText, { color: statusColor }]}>
                  {item.current_level} {item.unit}
                </Text>
                <Text style={[styles.minText, { color: colors.foregroundMuted }]}>
                  {t('stock.minLevel', {
                    value: String(item.min_level),
                    unit: item.unit,
                  })}
                </Text>
              </View>
            </View>

            {/* Progress bar */}
            <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressBar,
                  {
                    width: `${progressWidth}%`,
                    backgroundColor: statusColor,
                  },
                ]}
              />
            </View>

            {/* Last restocked */}
            {item.last_restocked_at && (
              <Text style={[styles.restockedText, { color: colors.foregroundMuted }]}>
                {t('stock.lastRestocked', {
                  date: new Date(item.last_restocked_at).toLocaleDateString(),
                })}
              </Text>
            )}

            {/* Quick restock button */}
            <TouchableOpacity
              style={[styles.restockButton, { borderColor: colors.primary }]}
              onPress={() => handleUpdateLevel(item)}
              accessibilityRole="button"
              accessibilityLabel={`${t('stock.restockButton')} ${item.name}`}
            >
              <Text style={[styles.restockButtonText, { color: colors.primary }]}>
                {t('stock.restockButton')}
              </Text>
            </TouchableOpacity>
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => {
    let title = t('stock.emptyTitle');
    let subtitle = t('stock.emptySubtitle');

    if (filter === 'critical') {
      title = t('stock.emptyCritical');
      subtitle = '';
    } else if (filter === 'low') {
      title = t('stock.emptyLow');
      subtitle = '';
    } else if (searchQuery || selectedCategory) {
      title = t('stock.emptyFilterTitle');
      subtitle = t('stock.emptyFilterSubtitle');
    }

    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.emptySubtitle, { color: colors.foregroundSecondary }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    );
  };

  const renderUpdateModal = () => {
    if (!selectedItem) return null;

    const levelNum = parseFloat(newLevel);
    const isValid = !isNaN(levelNum) && levelNum >= 0 && levelNum !== selectedItem.current_level;
    const isBelowMin = !isNaN(levelNum) && levelNum < selectedItem.min_level && levelNum >= 0;

    return (
      <Modal
        visible={!!selectedItem}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedItem(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {t('stock.updateLevelTitle')}
            </Text>
            <Text style={[styles.modalItemName, { color: colors.foregroundSecondary }]}>
              {selectedItem.name}
            </Text>

            <Text style={[styles.modalLabel, { color: colors.foreground }]}>
              {t('stock.currentLevelLabel')}: {selectedItem.current_level} {selectedItem.unit}
            </Text>

            <Text style={[styles.modalLabel, { color: colors.foreground }]}>
              {t('stock.newLevelLabel')}
            </Text>
            <TextInput
              style={[
                styles.modalInput,
                {
                  backgroundColor: colors.input,
                  borderColor: colors.inputBorder,
                  color: colors.foreground,
                },
              ]}
              keyboardType="numeric"
              value={newLevel}
              onChangeText={setNewLevel}
              placeholder={t('placeholders.zero')}
              placeholderTextColor={colors.inputPlaceholder}
              accessibilityLabel={t('stock.newLevelLabel')}
            />

            <Text style={[styles.modalRef, { color: colors.foregroundMuted }]}>
              {t('stock.minLevelRef', {
                value: String(selectedItem.min_level),
                unit: selectedItem.unit,
              })}
            </Text>

            {isBelowMin && (
              <View style={[styles.warningBanner, { backgroundColor: colors.warningBackground }]}>
                <Text style={{ color: colors.warning }}>
                  {t('stock.belowMinWarning', {
                    min: String(selectedItem.min_level),
                    unit: selectedItem.unit,
                  })}
                </Text>
              </View>
            )}

            <Text style={[styles.modalLabel, { color: colors.foreground }]}>
              {t('stock.notesLabel')}
            </Text>
            <TextInput
              style={[
                styles.modalInput,
                styles.modalInputMultiline,
                {
                  backgroundColor: colors.input,
                  borderColor: colors.inputBorder,
                  color: colors.foreground,
                },
              ]}
              multiline
              numberOfLines={3}
              value={levelNotes}
              onChangeText={setLevelNotes}
              placeholder={t('stock.notesPlaceholder')}
              placeholderTextColor={colors.inputPlaceholder}
              accessibilityLabel={t('stock.notesLabel')}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { borderColor: colors.border }]}
                onPress={() => setSelectedItem(null)}
                accessibilityRole="button"
                accessibilityLabel={t('stock.cancelButton')}
              >
                <Text style={{ color: colors.foreground }}>{t('stock.cancelButton')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.modalPrimaryButton,
                  {
                    backgroundColor: isValid ? colors.primary : colors.foregroundMuted,
                  },
                ]}
                onPress={handleSaveLevel}
                disabled={!isValid || saving}
                accessibilityRole="button"
                accessibilityLabel={t('stock.saveButton')}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Text style={{ color: colors.primaryForeground }}>
                    {t('stock.saveButton')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <ScreenContainer hasKeyboard>
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {renderStatsHeader()}
      {renderFilterTabs()}
      {renderSearch()}
      {renderCategoryChips()}

      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={styles.listContent}
        getItemLayout={(_, index) => ({
          length: 88,
          offset: 88 * index,
          index,
        })}
        windowSize={10}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        removeClippedSubviews={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      />

      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: colors.primary }]}
        color={colors.primaryForeground}
        onPress={() => navigation.navigate('StockItemDetail', { itemId: null })}
        label={t('stock.addItem')}
        accessibilityRole="button"
        accessibilityLabel={t('stock.addItem')}
      />

      {renderUpdateModal()}
    </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing[3],
    fontSize: 14,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: spacing[3],
    gap: spacing[2],
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing[3],
    borderRadius: borderRadius.card,
  },
  statCount: {
    fontSize: 24,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: spacing[0.5],
  },

  // Filter tabs
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: spacing[3],
    gap: spacing[2],
  },
  filterTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing[2],
    borderRadius: borderRadius.button,
    borderWidth: 1,
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Search
  searchContainer: {
    marginHorizontal: spacing.screenHorizontal,
    marginTop: spacing[3],
    borderRadius: borderRadius.input,
    borderWidth: 1,
    paddingHorizontal: spacing[3],
  },
  searchInput: {
    height: 42,
    fontSize: 14,
  },

  // Category chips
  categoryChipsContainer: {
    paddingLeft: spacing.screenHorizontal,
    paddingVertical: spacing[2],
  },
  categoryChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1.5],
    borderRadius: borderRadius.pill,
    marginRight: spacing[2],
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '500',
  },

  // Item card
  listContent: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingBottom: 100,
  },
  itemCard: {
    marginBottom: spacing[2],
    borderRadius: borderRadius.card,
    borderWidth: 1,
  },
  itemContent: {
    padding: spacing[3],
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing[2],
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
  },
  itemCategory: {
    fontSize: 12,
    marginTop: 2,
  },
  itemQuantity: {
    alignItems: 'flex-end',
  },
  quantityText: {
    fontSize: 16,
    fontWeight: '700',
  },
  minText: {
    fontSize: 12,
    marginTop: 2,
  },

  // Progress bar
  progressTrack: {
    height: 4,
    borderRadius: 2,
    marginTop: spacing[2],
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
  },

  restockedText: {
    fontSize: 12,
    marginTop: spacing[1],
  },

  restockButton: {
    marginTop: spacing[2],
    alignSelf: 'flex-start',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1.5],
    borderRadius: borderRadius.button,
    borderWidth: 1,
  },
  restockButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[16],
    paddingHorizontal: spacing[8],
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing[2],
  },

  // FAB
  fab: {
    position: 'absolute',
    right: spacing.screenHorizontal,
    bottom: spacing[6],
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: borderRadius.bottomSheet,
    borderTopRightRadius: borderRadius.bottomSheet,
    padding: spacing[6],
    paddingBottom: spacing[10],
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing[1],
  },
  modalItemName: {
    fontSize: 14,
    marginBottom: spacing[4],
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing[1],
    marginTop: spacing[3],
  },
  modalInput: {
    borderRadius: borderRadius.input,
    borderWidth: 1,
    paddingHorizontal: spacing[3],
    height: 44,
    fontSize: 16,
  },
  modalInputMultiline: {
    height: 80,
    textAlignVertical: 'top',
    paddingTop: spacing[2],
  },
  modalRef: {
    fontSize: 12,
    marginTop: spacing[1],
  },
  warningBanner: {
    padding: spacing[3],
    borderRadius: borderRadius.sm,
    marginTop: spacing[2],
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[6],
  },
  modalButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
    borderRadius: borderRadius.button,
    borderWidth: 1,
  },
  modalPrimaryButton: {
    borderWidth: 0,
  },
});
