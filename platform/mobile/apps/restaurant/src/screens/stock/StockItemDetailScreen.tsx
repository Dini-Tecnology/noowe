import React, { useState, useEffect, useCallback } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { Text, Card, ActivityIndicator, IconButton } from 'react-native-paper';
import ApiService from '@/shared/services/api';
import { useI18n } from '@/shared/hooks/useI18n';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { spacing, borderRadius } from '@okinawa/shared/theme/spacing';
import type {
  InventoryItem,
  InventoryStatus,
  UpdateItemLevelPayload,
} from '../../types/inventory';
import { stockItemSchema, validateForm } from '@okinawa/shared/validation/schemas';

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

interface Props {
  navigation: any;
  route: {
    params: {
      itemId: string | null;
    };
  };
}

export default function StockItemDetailScreen({ navigation, route }: Props) {
  const { t } = useI18n();
  const colors = useColors();
  const { itemId } = route.params;

  const [item, setItem] = useState<InventoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  // Restock modal
  const [restockModalVisible, setRestockModalVisible] = useState(false);
  const [restockLevel, setRestockLevel] = useState('');
  const [restockNotes, setRestockNotes] = useState('');
  const [restocking, setRestocking] = useState(false);

  const loadItem = useCallback(async () => {
    if (!itemId) {
      setLoading(false);
      return;
    }
    try {
      const res = await ApiService.get(`/inventory/${itemId}`);
      setItem(res?.data || res);
    } catch (error) {
      console.error('Failed to load item:', error);
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    loadItem();
  }, [loadItem]);

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

  const getStatusLabel = (status: InventoryStatus) => {
    switch (status) {
      case 'critical':
        return t('stock.statusCritical');
      case 'low':
        return t('stock.statusLow');
      case 'ok':
        return t('stock.statusOk');
    }
  };

  const handleRestock = async () => {
    if (!item) return;
    const level = parseFloat(restockLevel);

    // Validate with Zod schema
    const result = validateForm(stockItemSchema, {
      name: item.name,
      currentQuantity: isNaN(level) ? -1 : level,
      unit: item.unit,
      minQuantity: item.min_level ?? undefined,
      maxQuantity: item.max_level ?? undefined,
      unitCost: item.unit_cost ?? undefined,
    });

    if (!result.success) {
      Alert.alert(t('common.error'), Object.values(result.errors)[0]);
      return;
    }

    setRestocking(true);
    try {
      const payload: UpdateItemLevelPayload = {
        current_level: level,
        notes: restockNotes || undefined,
      };
      const updated = await ApiService.patch(`/inventory/${item.id}/level`, payload);
      const updatedData = updated?.data || updated;
      setItem((prev) => (prev ? { ...prev, ...updatedData } : prev));
      setRestockModalVisible(false);
    } catch (error) {
      console.error('Failed to restock:', error);
    } finally {
      setRestocking(false);
    }
  };

  const handleDelete = () => {
    if (!item) return;
    Alert.alert(
      t('stock.deleteItem'),
      t('stock.deleteConfirm'),
      [
        { text: t('stock.cancelButton'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await ApiService.delete(`/inventory/${item.id}`);
              navigation.goBack();
            } catch (error) {
              console.error('Failed to delete:', error);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <ScreenContainer hasKeyboard>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
      </ScreenContainer>
    );
  }

  if (!item) {
    return (
      <ScreenContainer hasKeyboard>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.emptyText, { color: colors.foregroundSecondary }]}>
          {t('stock.emptyTitle')}
        </Text>
      </View>
      </ScreenContainer>
    );
  }

  const statusColor = getStatusColor(item.status);
  const progressWidth = Math.min(item.level_pct, 100);

  return (
    <ScreenContainer hasKeyboard>
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header with status */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.itemName, { color: colors.foreground }]}>{item.name}</Text>
            <Text style={[styles.itemCategory, { color: colors.foregroundSecondary }]}>
              {t(CATEGORY_LABEL_KEYS[item.category] || 'stock.categoryOther')}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <IconButton
              icon="pencil"
              iconColor={colors.foregroundSecondary}
              size={20}
              onPress={() => setEditing(!editing)}
              accessibilityRole="button"
              accessibilityLabel={editing ? t('common.cancel') : t('common.edit')}
            />
            <IconButton
              icon="delete-outline"
              iconColor={colors.error}
              size={20}
              onPress={handleDelete}
              accessibilityRole="button"
              accessibilityLabel={t('stock.deleteItem')}
            />
          </View>
        </View>

        {/* Status badge */}
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {getStatusLabel(item.status)}
          </Text>
          <Text style={[styles.statusPct, { color: statusColor }]}>
            {item.level_pct}%
          </Text>
        </View>

        {/* Quantity card */}
        <Card style={[styles.detailCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.detailCardContent}>
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.foregroundSecondary }]}>
                {t('stock.currentLevelLabel')}
              </Text>
              <Text style={[styles.detailValue, { color: statusColor }]}>
                {item.current_level} {item.unit}
              </Text>
            </View>

            {/* Progress bar */}
            <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
              <View
                style={[styles.progressBar, { width: `${progressWidth}%`, backgroundColor: statusColor }]}
              />
            </View>

            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.foregroundSecondary }]}>
                {t('stock.minLevelRef', { value: String(item.min_level), unit: item.unit })}
              </Text>
              {item.max_level && (
                <Text style={[styles.detailLabel, { color: colors.foregroundSecondary }]}>
                  {t('stock.maxLevel', { value: String(item.max_level), unit: item.unit })}
                </Text>
              )}
            </View>
          </View>
        </Card>

        {/* Details card */}
        <Card style={[styles.detailCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.detailCardContent}>
            {item.supplier && (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.foregroundSecondary }]}>
                  {t('stock.supplier')}
                </Text>
                <Text style={[styles.detailValue, { color: colors.foreground }]}>
                  {item.supplier}
                </Text>
              </View>
            )}

            {item.unit_cost != null && (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.foregroundSecondary }]}>
                  R$ / {item.unit}
                </Text>
                <Text style={[styles.detailValue, { color: colors.foreground }]}>
                  R$ {item.unit_cost.toFixed(2)}
                </Text>
              </View>
            )}

            {item.notes && (
              <View style={styles.detailRowColumn}>
                <Text style={[styles.detailLabel, { color: colors.foregroundSecondary }]}>
                  {t('stock.notesLabel')}
                </Text>
                <Text style={[styles.notesText, { color: colors.foreground }]}>
                  {item.notes}
                </Text>
              </View>
            )}

            {item.last_restocked_at && (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.foregroundSecondary }]}>
                  {t('stock.lastRestocked', {
                    date: new Date(item.last_restocked_at).toLocaleDateString(),
                  })}
                </Text>
              </View>
            )}
          </View>
        </Card>

        {/* Restock button */}
        <TouchableOpacity
          style={[styles.restockButton, { backgroundColor: colors.primary }]}
          onPress={() => {
            setRestockLevel(String(item.current_level));
            setRestockNotes('');
            setRestockModalVisible(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={t('stock.restockButton')}
        >
          <Text style={[styles.restockButtonText, { color: colors.primaryForeground }]}>
            {t('stock.restockButton')}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Restock Modal */}
      <Modal
        visible={restockModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRestockModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {t('stock.restockTitle')}
            </Text>
            <Text style={[styles.modalSubtitle, { color: colors.foregroundSecondary }]}>
              {item.name}
            </Text>

            <Text style={[styles.modalLabel, { color: colors.foreground }]}>
              {t('stock.newQuantity')}
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
              value={restockLevel}
              onChangeText={setRestockLevel}
              placeholder={t('placeholders.zero')}
              placeholderTextColor={colors.inputPlaceholder}
              accessibilityLabel={t('stock.newQuantity')}
            />

            <Text style={[styles.modalRef, { color: colors.foregroundMuted }]}>
              {t('stock.minLevelRef', { value: String(item.min_level), unit: item.unit })}
            </Text>

            {parseFloat(restockLevel) < item.min_level && parseFloat(restockLevel) >= 0 && (
              <View style={[styles.warningBanner, { backgroundColor: colors.warningBackground }]}>
                <Text style={{ color: colors.warning }}>
                  {t('stock.belowMinWarning', {
                    min: String(item.min_level),
                    unit: item.unit,
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
              value={restockNotes}
              onChangeText={setRestockNotes}
              placeholder={t('stock.notesPlaceholder')}
              placeholderTextColor={colors.inputPlaceholder}
              accessibilityLabel={t('stock.notesLabel')}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButtonSecondary, { borderColor: colors.border }]}
                onPress={() => setRestockModalVisible(false)}
                accessibilityRole="button"
                accessibilityLabel={t('stock.cancelButton')}
              >
                <Text style={{ color: colors.foreground }}>{t('stock.cancelButton')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButtonPrimary,
                  { backgroundColor: colors.primary },
                ]}
                onPress={handleRestock}
                disabled={restocking}
                accessibilityRole="button"
                accessibilityLabel={t('stock.saveButton')}
              >
                {restocking ? (
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
  emptyText: {
    textAlign: 'center',
    marginTop: spacing[20],
    fontSize: 16,
  },
  scrollContent: {
    padding: spacing.screenHorizontal,
    paddingBottom: spacing[10],
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing[3],
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
  },
  itemName: {
    fontSize: 24,
    fontWeight: '700',
  },
  itemCategory: {
    fontSize: 14,
    marginTop: spacing[0.5],
  },

  // Status badge
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1.5],
    borderRadius: borderRadius.pill,
    marginBottom: spacing[4],
    gap: spacing[2],
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusPct: {
    fontSize: 14,
    fontWeight: '700',
  },

  // Detail cards
  detailCard: {
    marginBottom: spacing[3],
    borderRadius: borderRadius.card,
    borderWidth: 1,
  },
  detailCardContent: {
    padding: spacing[4],
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[2],
  },
  detailRowColumn: {
    marginBottom: spacing[2],
  },
  detailLabel: {
    fontSize: 14,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  notesText: {
    fontSize: 14,
    marginTop: spacing[1],
    lineHeight: 20,
  },

  // Progress bar
  progressTrack: {
    height: 6,
    borderRadius: 3,
    marginVertical: spacing[2],
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
  },

  // Restock button
  restockButton: {
    paddingVertical: spacing[4],
    borderRadius: borderRadius.button,
    alignItems: 'center',
    marginTop: spacing[3],
  },
  restockButtonText: {
    fontSize: 16,
    fontWeight: '700',
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
  },
  modalSubtitle: {
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
  modalButtonSecondary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
    borderRadius: borderRadius.button,
    borderWidth: 1,
  },
  modalButtonPrimary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
    borderRadius: borderRadius.button,
  },
});
