/**
 * VipTableManagementScreen - Staff VIP Table Management
 *
 * Grid view of VIP tables with status indicators, reservation details,
 * tab management (open/close), minimum consumption tracker, and actions
 * for no-show and transfer operations.
 *
 * @module restaurant/screens/club
 */

import React, { useState, useCallback, useMemo } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  Button,
  Card,
  Chip,
  ProgressBar,
  ActivityIndicator,
  Modal,
  Portal,
} from 'react-native-paper';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { t } from '@okinawa/shared/i18n';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import ApiService from '@/shared/services/api';

// ============================================
// TYPES
// ============================================

type TableStatus = 'available' | 'reserved' | 'occupied' | 'closed';

interface VipTableData {
  id: string;
  tableNumber: number;
  capacity: number;
  minimumConsumption: number;
  currentConsumption: number;
  status: TableStatus;
  reservationId?: string;
  reservationName?: string;
  partySize?: number;
  tabId?: string;
  occupiedSince?: string;
}

interface TabSummary {
  tabId: string;
  totalAmount: number;
  minimumConsumption: number;
  remainingMinimum: number;
  itemCount: number;
  isMinimumMet: boolean;
}

interface VipTableManagementScreenProps {
  route?: {
    params?: {
      restaurantId: string;
    };
  };
}

// ============================================
// HELPERS
// ============================================

function getElapsedTime(since?: string): string {
  if (!since) return '-';
  const diffMs = Date.now() - new Date(since).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  if (hours > 0) return `${hours}h${mins}min`;
  return `${diffMin}min`;
}

// ============================================
// TABLE CARD COMPONENT
// ============================================

function TableCard({
  table,
  colors,
  onPress,
}: {
  table: VipTableData;
  colors: ReturnType<typeof useColors>;
  onPress: (table: VipTableData) => void;
}) {
  const statusColor =
    table.status === 'available'
      ? colors.success
      : table.status === 'reserved'
      ? colors.warning
      : table.status === 'occupied'
      ? colors.primary
      : colors.foregroundMuted;

  const statusLabel =
    table.status === 'available'
      ? t('club.vip.status.available')
      : table.status === 'reserved'
      ? t('club.vip.status.reserved')
      : table.status === 'occupied'
      ? t('club.vip.status.occupied')
      : t('club.vip.status.closed');

  const consumptionProgress =
    table.minimumConsumption > 0
      ? Math.min(table.currentConsumption / table.minimumConsumption, 1)
      : 0;

  return (
    <TouchableOpacity
      onPress={() => onPress(table)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${t('club.vip.table')} ${table.tableNumber}, status ${table.status}`}
      accessibilityHint="Opens table detail and management options"
    >
      <Card
        style={[
          styles.tableCard,
          { backgroundColor: colors.card, borderLeftColor: statusColor, borderLeftWidth: 4 },
        ]}
        mode="elevated"
      >
        <Card.Content style={styles.tableContent}>
          <View style={styles.tableHeader}>
            <View>
              <Text
                variant="titleMedium"
                style={{ color: colors.foreground, fontWeight: '700' }}
              >
                {t('club.vip.table')} {table.tableNumber}
              </Text>
              {table.reservationName && (
                <Text variant="bodySmall" style={{ color: colors.foregroundSecondary }}>
                  {table.reservationName}
                </Text>
              )}
            </View>
            <Chip
              mode="flat"
              textStyle={{ color: colors.primaryForeground, fontSize: 10, fontWeight: '600' }}
              style={{ backgroundColor: statusColor }}
              compact
            >
              {statusLabel}
            </Chip>
          </View>

          {/* Meta */}
          <View style={styles.tableMeta}>
            {table.partySize !== undefined && (
              <Text variant="bodySmall" style={{ color: colors.foregroundMuted }}>
                {table.partySize}/{table.capacity} {t('club.vip.capacity')}
              </Text>
            )}
            {table.occupiedSince && (
              <Text variant="bodySmall" style={{ color: colors.foregroundMuted }}>
                {t('club.vip.elapsed')}: {getElapsedTime(table.occupiedSince)}
              </Text>
            )}
          </View>

          {/* Minimum Consumption Progress */}
          {table.status === 'occupied' && table.minimumConsumption > 0 && (
            <View style={styles.consumptionSection}>
              <View style={styles.consumptionHeader}>
                <Text variant="bodySmall" style={{ color: colors.foregroundMuted }}>
                  {t('club.vip.minConsumption')}
                </Text>
                <Text variant="bodySmall" style={{ color: colors.foreground, fontWeight: '600' }}>
                  R$ {table.currentConsumption.toFixed(0)} / R$ {table.minimumConsumption.toFixed(0)}
                </Text>
              </View>
              <ProgressBar
                progress={consumptionProgress}
                color={consumptionProgress >= 1 ? colors.success : colors.primary}
                style={styles.progressBar}
              />
            </View>
          )}
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );
}

// ============================================
// TABLE DETAIL MODAL
// ============================================

function TableDetailModal({
  visible,
  table,
  colors,
  onDismiss,
  onOpenTab,
  onCloseTab,
  onNoShow,
  isActioning,
}: {
  visible: boolean;
  table: VipTableData | null;
  colors: ReturnType<typeof useColors>;
  onDismiss: () => void;
  onOpenTab: (reservationId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNoShow: (reservationId: string) => void;
  isActioning: boolean;
}) {
  if (!table) return null;

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[styles.modalContainer, { backgroundColor: colors.background }]}
      >
        <Text
          variant="titleLarge"
          style={{ color: colors.foreground, fontWeight: '700', marginBottom: 16 }}
        >
          {t('club.vip.table')} {table.tableNumber}
        </Text>

        <View style={styles.detailRow}>
          <Text variant="bodyMedium" style={{ color: colors.foregroundSecondary }}>
            {t('club.vip.capacity')}
          </Text>
          <Text variant="bodyMedium" style={{ color: colors.foreground, fontWeight: '600' }}>
            {table.capacity}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text variant="bodyMedium" style={{ color: colors.foregroundSecondary }}>
            {t('club.vip.minConsumption')}
          </Text>
          <Text variant="bodyMedium" style={{ color: colors.primary, fontWeight: '600' }}>
            R$ {table.minimumConsumption.toFixed(2)}
          </Text>
        </View>

        {table.reservationName && (
          <View style={styles.detailRow}>
            <Text variant="bodyMedium" style={{ color: colors.foregroundSecondary }}>
              {t('reservations.title')}
            </Text>
            <Text variant="bodyMedium" style={{ color: colors.foreground, fontWeight: '600' }}>
              {table.reservationName}
            </Text>
          </View>
        )}

        {table.occupiedSince && (
          <View style={styles.detailRow}>
            <Text variant="bodyMedium" style={{ color: colors.foregroundSecondary }}>
              {t('club.vip.elapsed')}
            </Text>
            <Text variant="bodyMedium" style={{ color: colors.foreground, fontWeight: '600' }}>
              {getElapsedTime(table.occupiedSince)}
            </Text>
          </View>
        )}

        {/* Consumption tracker */}
        {table.status === 'occupied' && (
          <View style={styles.detailRow}>
            <Text variant="bodyMedium" style={{ color: colors.foregroundSecondary }}>
              {t('club.vip.tabSummary')}
            </Text>
            <Text variant="bodyMedium" style={{ color: colors.foreground, fontWeight: '600' }}>
              R$ {table.currentConsumption.toFixed(2)}
            </Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.modalActions}>
          {table.status === 'reserved' && table.reservationId && (
            <>
              <Button
                mode="contained"
                onPress={() => onOpenTab(table.reservationId!)}
                disabled={isActioning}
                style={[styles.modalBtn, { backgroundColor: colors.success }]}
                labelStyle={{ color: colors.primaryForeground }}
                accessibilityRole="button"
                accessibilityLabel={`Open tab for table ${table.tableNumber}`}
              >
                {t('club.vip.openTab')}
              </Button>
              <Button
                mode="outlined"
                onPress={() => onNoShow(table.reservationId!)}
                disabled={isActioning}
                style={styles.modalBtn}
                textColor={colors.error}
                accessibilityRole="button"
                accessibilityLabel={`Mark table ${table.tableNumber} reservation as no-show`}
              >
                {t('club.queueSection.noShow')}
              </Button>
            </>
          )}

          {table.status === 'occupied' && table.tabId && (
            <Button
              mode="contained"
              onPress={() => onCloseTab(table.tabId!)}
              disabled={isActioning}
              style={styles.modalBtn}
              accessibilityRole="button"
              accessibilityLabel={`Close tab for table ${table.tableNumber}`}
            >
              {t('club.vip.closeTab')}
            </Button>
          )}

          <Button mode="text" onPress={onDismiss} style={styles.modalBtn} accessibilityRole="button" accessibilityLabel="Close table details">
            {t('common.close')}
          </Button>
        </View>
      </Modal>
    </Portal>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function VipTableManagementScreen({ route }: VipTableManagementScreenProps) {
  const colors = useColors();
  const queryClient = useQueryClient();

  const restaurantId = route?.params?.restaurantId || '';

  const [selectedTable, setSelectedTable] = useState<VipTableData | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  // Fetch tables
  const {
    data: tables,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<VipTableData[]>({
    queryKey: ['vip-table-management', restaurantId],
    queryFn: async () => {
      const dateStr = new Date().toISOString().split('T')[0];
      const response = await ApiService.get(
        `/table-reservations/restaurant/${restaurantId}/event/${dateStr}`,
      );
      return response.data || [];
    },
    enabled: !!restaurantId,
    refetchInterval: 30000,
  });

  // Open tab mutation
  const openTabMutation = useMutation({
    mutationFn: async (reservationId: string) => {
      const response = await ApiService.post(
        `/table-tabs/reservation/${reservationId}/open`,
      );
      return response.data;
    },
    onSuccess: () => {
      setShowDetail(false);
      setSelectedTable(null);
      queryClient.invalidateQueries({ queryKey: ['vip-table-management'] });
      Alert.alert(t('common.success'), t('club.vip.openTab'));
    },
    onError: (error: Error) => {
      Alert.alert(t('common.error'), error.message);
    },
  });

  // Close tab mutation
  const closeTabMutation = useMutation({
    mutationFn: async (tabId: string) => {
      const response = await ApiService.put(`/table-tabs/${tabId}/close`);
      return response.data;
    },
    onSuccess: () => {
      setShowDetail(false);
      setSelectedTable(null);
      queryClient.invalidateQueries({ queryKey: ['vip-table-management'] });
      Alert.alert(t('common.success'), t('club.vip.closeTab'));
    },
    onError: (error: Error) => {
      Alert.alert(t('common.error'), error.message);
    },
  });

  // No-show mutation
  const noShowMutation = useMutation({
    mutationFn: async (reservationId: string) => {
      const response = await ApiService.delete(`/table-reservations/${reservationId}`, {
        data: { reason: 'no_show' },
      });
      return response.data;
    },
    onSuccess: () => {
      setShowDetail(false);
      setSelectedTable(null);
      queryClient.invalidateQueries({ queryKey: ['vip-table-management'] });
    },
    onError: (error: Error) => {
      Alert.alert(t('common.error'), error.message);
    },
  });

  const handleTablePress = useCallback((table: VipTableData) => {
    setSelectedTable(table);
    setShowDetail(true);
  }, []);

  const handleOpenTab = useCallback(
    (reservationId: string) => {
      openTabMutation.mutate(reservationId);
    },
    [openTabMutation],
  );

  const handleCloseTab = useCallback(
    (tabId: string) => {
      Alert.alert(
        t('club.vip.closeTab'),
        t('common.confirm'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.confirm'),
            onPress: () => closeTabMutation.mutate(tabId),
          },
        ],
      );
    },
    [closeTabMutation],
  );

  const handleNoShow = useCallback(
    (reservationId: string) => {
      Alert.alert(
        t('club.queueSection.noShow'),
        t('common.confirm'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.confirm'),
            style: 'destructive',
            onPress: () => noShowMutation.mutate(reservationId),
          },
        ],
      );
    },
    [noShowMutation],
  );

  const isActioning =
    openTabMutation.isPending || closeTabMutation.isPending || noShowMutation.isPending;

  const renderTable = useCallback(
    ({ item }: { item: VipTableData }) => (
      <TableCard
        table={item}
        colors={colors}
        onPress={handleTablePress}
      />
    ),
    [colors, handleTablePress],
  );

  if (isLoading) {
    return (
      <ScreenContainer>
      <View style={[styles.container, styles.centerContent, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text
          variant="headlineMedium"
          style={{ color: colors.foreground, fontWeight: '700' }}
        >
          {t('club.vipTable')}
        </Text>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
          <Text variant="bodySmall" style={{ color: colors.foregroundMuted }}>
            {t('club.vip.status.available')}
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
          <Text variant="bodySmall" style={{ color: colors.foregroundMuted }}>
            {t('club.vip.status.reserved')}
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
          <Text variant="bodySmall" style={{ color: colors.foregroundMuted }}>
            {t('club.vip.status.occupied')}
          </Text>
        </View>
      </View>

      <FlatList
        data={tables || []}
        keyExtractor={(item) => item.id}
        renderItem={renderTable}
        numColumns={2}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.gridRow}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>🍾</Text>
            <Text
              variant="bodyLarge"
              style={{ color: colors.foregroundMuted, textAlign: 'center' }}
            >
              {t('club.vip.noTables')}
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
        getItemLayout={(_, index) => ({
          length: 164,
          offset: 164 * index,
          index,
        })}
      />

      {/* Table Detail Modal */}
      <TableDetailModal
        visible={showDetail}
        table={selectedTable}
        colors={colors}
        onDismiss={() => {
          setShowDetail(false);
          setSelectedTable(null);
        }}
        onOpenTab={handleOpenTab}
        onCloseTab={handleCloseTab}
        onNoShow={handleNoShow}
        isActioning={isActioning}
      />
    </View>
    </ScreenContainer>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  grid: {
    padding: 12,
    gap: 8,
    paddingBottom: 40,
  },
  gridRow: {
    gap: 8,
  },
  tableCard: {
    flex: 1,
    borderRadius: 12,
    marginBottom: 4,
  },
  tableContent: {
    gap: 8,
  },
  tableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  tableMeta: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  consumptionSection: {
    gap: 4,
    marginTop: 4,
  },
  consumptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  modalContainer: {
    margin: 24,
    borderRadius: 20,
    padding: 24,
    maxHeight: '70%',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalActions: {
    gap: 8,
    marginTop: 20,
  },
  modalBtn: {
    borderRadius: 8,
  },
});
