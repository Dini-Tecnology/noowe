/**
 * FloorFlowScreen - Visual Floor Plan with Table Status
 *
 * Displays a grid-based floor plan showing real-time table status.
 * Table squares show number, color-coded status, and tap for detail.
 * Includes legend at bottom and pull-to-refresh.
 *
 * @module restaurant/screens/maitre
 */

import React, { useState, useMemo, useCallback } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
  Modal,
  Pressable,
} from 'react-native';
import {
  Text,
  IconButton,
  Button,
  ActivityIndicator,
  Card,
  Divider,
} from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useI18n } from '@/shared/hooks/useI18n';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import ApiService from '@/shared/services/api';

// ============================================
// TYPES
// ============================================

type TableStatus = 'free' | 'occupied' | 'billing' | 'reserved' | 'dirty';

interface FloorTable {
  id: string;
  number: number;
  status: TableStatus;
  capacity: number;
  section?: string;
  current_occupants?: number;
  seated_at?: string;
  order_total?: number;
  guest_name?: string;
}

// ============================================
// CONSTANTS
// ============================================

const SCREEN_WIDTH = Dimensions.get('window').width;
const TABLE_MARGIN = 6;
const COLUMNS = 4;
const TABLE_SIZE = (SCREEN_WIDTH - 32 - TABLE_MARGIN * 2 * COLUMNS) / COLUMNS;

function getStatusColors(colors: any): Record<TableStatus, string> {
  return {
    free: colors.tableAvailable,
    occupied: colors.warning,
    billing: colors.primary,
    reserved: colors.tableReserved,
    dirty: colors.foregroundMuted,
  };
}

const STATUS_ICONS: Record<TableStatus, string> = {
  free: 'check-circle',
  occupied: 'account-group',
  billing: 'receipt',
  reserved: 'calendar-clock',
  dirty: 'broom',
};

// ============================================
// HELPERS
// ============================================

function getTimeSeated(dateStr?: string): string {
  if (!dateStr) return '';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}min`;
  const hr = Math.floor(diffMin / 60);
  const min = diffMin % 60;
  return `${hr}h${min > 0 ? `${min}min` : ''}`;
}

// ============================================
// SKELETON
// ============================================

function FloorSkeleton({ colors }: { colors: any }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: TABLE_MARGIN * 2 }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <View
            key={i}
            style={{
              width: TABLE_SIZE,
              height: TABLE_SIZE,
              borderRadius: 12,
              backgroundColor: colors.backgroundTertiary,
            }}
          />
        ))}
      </View>
    </View>
  );
}

// ============================================
// TABLE DETAIL MODAL
// ============================================

function TableDetailModal({
  table,
  visible,
  onClose,
  colors,
  t,
}: {
  table: FloorTable | null;
  visible: boolean;
  onClose: () => void;
  colors: any;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  if (!table) return null;

  const statusColorMap = getStatusColors(colors);
  const statusColor = statusColorMap[table.status];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={[modalStyles.overlay, { backgroundColor: colors.overlay }]} onPress={onClose} accessibilityLabel="Close table details overlay">
        <Pressable style={[modalStyles.content, { backgroundColor: colors.card }]} onPress={onClose} accessibilityLabel="Table detail panel">
          {/* Header */}
          <View style={modalStyles.header}>
            <View style={[modalStyles.statusDot, { backgroundColor: statusColor }]} />
            <Text variant="headlineSmall" style={[modalStyles.title, { color: colors.foreground }]}>
              {t('floorFlow.tableNumber', { number: table.number })}
            </Text>
            <IconButton icon="close" size={20} onPress={onClose} iconColor={colors.foregroundMuted} accessibilityRole="button" accessibilityLabel="Close table details" />
          </View>

          <Divider style={{ backgroundColor: colors.border }} />

          {/* Details */}
          <View style={modalStyles.details}>
            <DetailRow
              label={t(`floorFlow.${table.status}`)}
              value=""
              icon={STATUS_ICONS[table.status]}
              iconColor={statusColor}
              colors={colors}
            />

            {table.current_occupants != null && table.current_occupants > 0 && (
              <DetailRow
                label={t('floorFlow.occupants', { count: table.current_occupants })}
                value={`/ ${table.capacity}`}
                icon="account-group"
                iconColor={colors.foregroundSecondary}
                colors={colors}
              />
            )}

            {table.seated_at && (
              <DetailRow
                label={t('floorFlow.timeSeated', { time: getTimeSeated(table.seated_at) })}
                value=""
                icon="clock-outline"
                iconColor={colors.foregroundSecondary}
                colors={colors}
              />
            )}

            {table.order_total != null && table.order_total > 0 && (
              <DetailRow
                label={t('floorFlow.orderTotal', { value: `R$${table.order_total.toFixed(2)}` })}
                value=""
                icon="receipt"
                iconColor={colors.foregroundSecondary}
                colors={colors}
              />
            )}

            {table.guest_name && (
              <DetailRow
                label={table.guest_name}
                value=""
                icon="account"
                iconColor={colors.foregroundSecondary}
                colors={colors}
              />
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DetailRow({
  label,
  value,
  icon,
  iconColor,
  colors,
}: {
  label: string;
  value: string;
  icon: string;
  iconColor: string;
  colors: any;
}) {
  return (
    <View style={modalStyles.detailRow}>
      <IconButton icon={icon} size={18} iconColor={iconColor} style={{ margin: 0 }} accessibilityLabel={label} />
      <Text variant="bodyMedium" style={[modalStyles.detailLabel, { color: colors.foreground }]}>
        {label}
      </Text>
      {value ? (
        <Text variant="bodySmall" style={[modalStyles.detailValue, { color: colors.foregroundMuted }]}>
          {value}
        </Text>
      ) : null}
    </View>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  title: {
    flex: 1,
    fontWeight: 'bold',
  },
  details: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  detailLabel: {},
  detailValue: {},
});

// ============================================
// COMPONENT
// ============================================

export default function FloorFlowScreen() {
  const { t } = useI18n();
  const colors = useColors();

  const [refreshing, setRefreshing] = useState(false);
  const [selectedTable, setSelectedTable] = useState<FloorTable | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Fetch tables
  const {
    data: tables = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<FloorTable[]>({
    queryKey: ['floor-tables'],
    queryFn: async () => {
      const res = await ApiService.get('/tables?include=session');
      return res.data;
    },
    refetchInterval: 15000,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleTablePress = useCallback((table: FloorTable) => {
    setSelectedTable(table);
    setModalVisible(true);
  }, []);

  // Group counts by status
  const statusCounts = useMemo(() => {
    const counts: Record<TableStatus, number> = {
      free: 0,
      occupied: 0,
      billing: 0,
      reserved: 0,
      dirty: 0,
    };
    tables.forEach((t) => {
      if (counts[t.status] !== undefined) {
        counts[t.status]++;
      }
    });
    return counts;
  }, [tables]);

  const statusColorMap = useMemo(() => getStatusColors(colors), [colors]);
  const statusKeys = useMemo(() => Object.keys(statusColorMap) as TableStatus[], [statusColorMap]);
  const styles = useMemo(() => createStyles(colors), [colors]);

  // ============================================
  // RENDER STATES
  // ============================================

  if (isLoading) {
    return (
      <ScreenContainer>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text variant="headlineSmall" style={styles.headerTitle}>
            {t('floorFlow.title')}
          </Text>
        </View>
        <FloorSkeleton colors={colors} />
      </View>
      </ScreenContainer>
    );
  }

  if (isError) {
    return (
      <ScreenContainer>
      <View style={styles.errorContainer}>
        <IconButton icon="alert-circle-outline" size={64} iconColor={colors.foregroundMuted} accessibilityLabel="Error loading floor plan" />
        <Text variant="bodyLarge" style={styles.errorText}>
          {t('floorFlow.errorLoading')}
        </Text>
        <Button
          mode="contained"
          onPress={() => refetch()}
          style={styles.retryButton}
          accessibilityRole="button"
          accessibilityLabel="Retry loading floor plan"
        >
          {t('common.retry')}
        </Button>
      </View>
      </ScreenContainer>
    );
  }

  if (tables.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <IconButton icon="table-furniture" size={80} iconColor={colors.foregroundMuted} accessibilityLabel="No tables configured" />
        <Text variant="headlineSmall" style={styles.emptyTitle}>
          {t('floorFlow.noTables')}
        </Text>
        <Text variant="bodyMedium" style={styles.emptyMessage}>
          {t('floorFlow.noTablesMessage')}
        </Text>
      </View>
    );
  }

  return (
    <ScreenContainer>
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text variant="headlineSmall" style={styles.headerTitle}>
          {t('floorFlow.title')}
        </Text>
        <Text variant="bodySmall" style={styles.headerSubtitle}>
          {tables.length} {t('floorFlow.legend').toLowerCase()}
        </Text>
      </View>

      {/* Status Summary */}
      <View style={styles.summaryRow}>
        {statusKeys.map((status) => (
          <View key={status} style={styles.summaryItem}>
            <View style={[styles.summaryDot, { backgroundColor: statusColorMap[status] }]} />
            <Text variant="bodySmall" style={styles.summaryCount}>
              {statusCounts[status]}
            </Text>
            <Text variant="bodySmall" style={styles.summaryLabel}>
              {t(`floorFlow.${status}`)}
            </Text>
          </View>
        ))}
      </View>

      {/* Floor Grid */}
      <ScrollView
        style={styles.gridContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        contentContainerStyle={styles.gridContent}
      >
        <View style={styles.grid}>
          {tables.map((table) => {
            const statusColor = statusColorMap[table.status];
            return (
              <TouchableOpacity
                key={table.id}
                style={[
                  styles.tableSquare,
                  {
                    backgroundColor: `${statusColor}20`,
                    borderColor: statusColor,
                  },
                ]}
                onPress={() => handleTablePress(table)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Table ${table.number}, ${table.status}, capacity ${table.capacity}`}
              >
                <Text variant="titleLarge" style={[styles.tableNum, { color: statusColor }]}>
                  {table.number}
                </Text>
                <IconButton
                  icon={STATUS_ICONS[table.status]}
                  size={14}
                  iconColor={statusColor}
                  style={styles.tableStatusIcon}
                  accessibilityLabel={`Status: ${table.status}`}
                />
                {table.current_occupants != null && table.current_occupants > 0 && (
                  <Text variant="labelSmall" style={[styles.tableOccupants, { color: statusColor }]}>
                    {table.current_occupants}/{table.capacity}
                  </Text>
                )}
                {table.seated_at && (
                  <Text variant="labelSmall" style={[styles.tableTime, { color: `${statusColor}CC` }]}>
                    {getTimeSeated(table.seated_at)}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Legend */}
      <View style={styles.legend}>
        <Text variant="labelMedium" style={styles.legendTitle}>
          {t('floorFlow.legend')}
        </Text>
        <View style={styles.legendItems}>
          {statusKeys.map((status) => (
            <View key={status} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: statusColorMap[status] }]} />
              <Text variant="bodySmall" style={styles.legendText}>
                {t(`floorFlow.${status}`)}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Table Detail Modal */}
      <TableDetailModal
        table={selectedTable}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        colors={colors}
        t={t}
      />
    </View>
    </ScreenContainer>
  );
}

// ============================================
// STYLES
// ============================================

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      color: colors.foreground,
      fontWeight: 'bold',
    },
    headerSubtitle: {
      color: colors.foregroundMuted,
      marginTop: 2,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    summaryItem: {
      alignItems: 'center',
      gap: 2,
    },
    summaryDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    summaryCount: {
      color: colors.foreground,
      fontWeight: 'bold',
    },
    summaryLabel: {
      color: colors.foregroundMuted,
      fontSize: 10,
    },
    gridContainer: {
      flex: 1,
    },
    gridContent: {
      padding: 16,
      paddingBottom: 24,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: TABLE_MARGIN * 2,
    },
    tableSquare: {
      width: TABLE_SIZE,
      height: TABLE_SIZE,
      borderRadius: 12,
      borderWidth: 2,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 4,
    },
    tableNum: {
      fontWeight: 'bold',
      fontSize: 20,
    },
    tableStatusIcon: {
      margin: 0,
      padding: 0,
      width: 18,
      height: 18,
    },
    tableOccupants: {
      fontWeight: '600',
      fontSize: 10,
    },
    tableTime: {
      fontSize: 10,
    },
    legend: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colors.card,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    legendTitle: {
      color: colors.foregroundSecondary,
      marginBottom: 8,
      fontWeight: '600',
    },
    legendItems: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    legendDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    legendText: {
      color: colors.foregroundSecondary,
    },
    // States
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 40,
      backgroundColor: colors.background,
    },
    errorText: {
      color: colors.foregroundSecondary,
      marginTop: 12,
      textAlign: 'center',
    },
    retryButton: {
      marginTop: 16,
      borderRadius: 12,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 40,
      backgroundColor: colors.background,
    },
    emptyTitle: {
      marginTop: 16,
      color: colors.foreground,
      textAlign: 'center',
    },
    emptyMessage: {
      marginTop: 8,
      color: colors.foregroundMuted,
      textAlign: 'center',
      lineHeight: 22,
    },
  });
