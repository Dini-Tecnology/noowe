/**
 * VipTableScreen - VIP Table Reservation
 *
 * Displays a simplified floor grid of VIP tables with status indicators.
 * Allows customers to view table details and submit reservation requests.
 *
 * @module client/screens/club
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  FlatList,
  Alert,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  Button,
  Card,
  TextInput,
  IconButton,
  Chip,
  ActivityIndicator,
  Modal,
  Portal,
} from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { t } from '@okinawa/shared/i18n';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ApiService } from '@okinawa/shared/services/api';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';

// ============================================
// TYPES
// ============================================

type TableStatus = 'available' | 'reserved' | 'occupied';

interface VipTable {
  id: string;
  tableNumber: number;
  capacity: number;
  minimumConsumption: number;
  status: TableStatus;
  reservationName?: string;
}

interface VipTableScreenProps {
  route?: {
    params?: {
      restaurantId: string;
      eventDate: string;
    };
  };
}

// ============================================
// TABLE CELL COMPONENT
// ============================================

function TableCell({
  table,
  colors,
  onPress,
}: {
  table: VipTable;
  colors: ReturnType<typeof useColors>;
  onPress: (table: VipTable) => void;
}) {
  const statusColor =
    table.status === 'available'
      ? colors.success
      : table.status === 'reserved'
      ? colors.warning
      : colors.error;

  const statusLabel =
    table.status === 'available'
      ? t('club.vip.status.available')
      : table.status === 'reserved'
      ? t('club.vip.status.reserved')
      : t('club.vip.status.occupied');

  return (
    <TouchableOpacity
      style={[
        styles.tableCell,
        {
          backgroundColor: colors.card,
          borderColor: statusColor,
          borderWidth: 2,
        },
      ]}
      onPress={() => onPress(table)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${t('club.vip.table')} ${table.tableNumber} - ${statusLabel}`}
    >
      <Text
        variant="titleLarge"
        style={{ color: colors.foreground, fontWeight: '700', textAlign: 'center' }}
      >
        {table.tableNumber}
      </Text>
      <Text
        variant="bodySmall"
        style={{ color: colors.foregroundMuted, textAlign: 'center' }}
      >
        {table.capacity} {t('club.vip.capacity')}
      </Text>
      <View
        style={[styles.statusDot, { backgroundColor: statusColor }]}
      />
    </TouchableOpacity>
  );
}

// ============================================
// RESERVATION FORM MODAL
// ============================================

function ReservationForm({
  visible,
  table,
  colors,
  onDismiss,
  onSubmit,
  isSubmitting,
}: {
  visible: boolean;
  table: VipTable | null;
  colors: ReturnType<typeof useColors>;
  onDismiss: () => void;
  onSubmit: (data: { partySize: number; contact: string; specialRequests: string }) => void;
  isSubmitting: boolean;
}) {
  const [partySize, setPartySize] = useState('2');
  const [contact, setContact] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');

  const handleSubmit = useCallback(() => {
    const size = parseInt(partySize, 10);
    if (!size || size < 1) {
      Alert.alert(t('common.error'), t('reservations.invalidPartySize'));
      return;
    }
    if (!contact.trim()) {
      Alert.alert(t('common.error'), t('common.required'));
      return;
    }
    onSubmit({ partySize: size, contact: contact.trim(), specialRequests: specialRequests.trim() });
  }, [partySize, contact, specialRequests, onSubmit]);

  if (!table) return null;

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[styles.modalContainer, { backgroundColor: colors.background }]}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text
            variant="titleLarge"
            style={{ color: colors.foreground, fontWeight: '700', marginBottom: 16 }}
          >
            {t('club.vip.reserve')} - {t('club.vip.table')} {table.tableNumber}
          </Text>

          {/* Table Info */}
          <Card style={[styles.infoCard, { backgroundColor: colors.card }]} mode="elevated">
            <Card.Content style={styles.infoCardContent}>
              <View style={styles.infoRow}>
                <Text variant="bodyMedium" style={{ color: colors.foregroundSecondary }}>
                  {t('club.vip.capacity')}
                </Text>
                <Text variant="bodyMedium" style={{ color: colors.foreground, fontWeight: '600' }}>
                  {table.capacity}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text variant="bodyMedium" style={{ color: colors.foregroundSecondary }}>
                  {t('club.vip.minConsumption')}
                </Text>
                <Text variant="bodyMedium" style={{ color: colors.primary, fontWeight: '600' }}>
                  R$ {table.minimumConsumption.toFixed(2)}
                </Text>
              </View>
            </Card.Content>
          </Card>

          {/* Form Fields */}
          <TextInput
            label={t('club.vip.reservationForm.partySize')}
            value={partySize}
            onChangeText={setPartySize}
            keyboardType="number-pad"
            mode="outlined"
            style={styles.input}
            accessibilityLabel="Party size"
          />

          <TextInput
            label={t('club.vip.reservationForm.contact')}
            value={contact}
            onChangeText={setContact}
            keyboardType="phone-pad"
            mode="outlined"
            style={styles.input}
            accessibilityLabel="Contact phone number"
          />

          <TextInput
            label={t('club.vip.reservationForm.specialRequests')}
            value={specialRequests}
            onChangeText={setSpecialRequests}
            multiline
            numberOfLines={3}
            mode="outlined"
            style={styles.input}
            accessibilityLabel="Special requests"
          />

          {/* Actions */}
          <View style={styles.formActions}>
            <Button
              mode="outlined"
              onPress={onDismiss}
              style={styles.formBtn}
            >
              {t('common.cancel')}
            </Button>
            <Button
              mode="contained"
              onPress={handleSubmit}
              loading={isSubmitting}
              disabled={isSubmitting}
              style={styles.formBtn}
            >
              {t('club.vip.reserve')}
            </Button>
          </View>
        </ScrollView>
      </Modal>
    </Portal>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function VipTableScreen({ route }: VipTableScreenProps) {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();

  const restaurantId = route?.params?.restaurantId || '';
  const eventDate = route?.params?.eventDate || new Date().toISOString();

  const [selectedTable, setSelectedTable] = useState<VipTable | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Fetch tables
  const {
    data: tables,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<VipTable[]>({
    queryKey: ['vip-tables', restaurantId, eventDate],
    queryFn: async () => {
      const dateStr = new Date(eventDate).toISOString().split('T')[0];
      const response = await ApiService.get(
        `/table-reservations/restaurant/${restaurantId}/event/${dateStr}`,
      );
      return response.data || [];
    },
    enabled: !!restaurantId,
  });

  // Reserve mutation
  const reserveMutation = useMutation({
    mutationFn: async (data: {
      tableId: string;
      partySize: number;
      contact: string;
      specialRequests: string;
    }) => {
      const response = await ApiService.post('/table-reservations', {
        restaurantId,
        tableId: data.tableId,
        eventDate,
        partySize: data.partySize,
        contactPhone: data.contact,
        specialRequests: data.specialRequests,
      });
      return response.data;
    },
    onSuccess: () => {
      setShowForm(false);
      setSelectedTable(null);
      queryClient.invalidateQueries({ queryKey: ['vip-tables'] });
      Alert.alert(t('common.success'), t('club.vip.reservationForm.success'));
    },
    onError: (error: Error) => {
      Alert.alert(t('common.error'), error.message);
    },
  });

  const handleTablePress = useCallback((table: VipTable) => {
    setSelectedTable(table);
    if (table.status === 'available') {
      setShowForm(true);
    }
  }, []);

  const handleReservationSubmit = useCallback(
    (data: { partySize: number; contact: string; specialRequests: string }) => {
      if (!selectedTable) return;
      reserveMutation.mutate({
        tableId: selectedTable.id,
        ...data,
      });
    },
    [selectedTable, reserveMutation],
  );

  const renderTable = useCallback(
    ({ item }: { item: VipTable }) => (
      <TableCell
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
    <ScreenContainer hasKeyboard>
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text
          variant="headlineMedium"
          style={{ color: colors.foreground, fontWeight: '700' }}
        >
          {t('club.vipTable')}
        </Text>
        <Text
          variant="bodyMedium"
          style={{ color: colors.foregroundSecondary }}
        >
          {t('club.vip.selectTable')}
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
          <View style={[styles.legendDot, { backgroundColor: colors.error }]} />
          <Text variant="bodySmall" style={{ color: colors.foregroundMuted }}>
            {t('club.vip.status.occupied')}
          </Text>
        </View>
      </View>

      {/* Table Grid */}
      <FlatList
        data={tables || []}
        refreshing={isRefetching}
        onRefresh={() => { void refetch(); }}
        keyExtractor={(item) => item.id}
        renderItem={renderTable}
        numColumns={3}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.gridRow}
        getItemLayout={(_, index) => ({
          length: 140,
          offset: 140 * index,
          index,
        })}
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
      />

      {/* Selected Table Info (non-available) */}
      {selectedTable && selectedTable.status !== 'available' && (
        <Card
          style={[styles.selectedCard, { backgroundColor: colors.card }]}
          mode="elevated"
        >
          <Card.Content>
            <Text variant="titleMedium" style={{ color: colors.foreground, fontWeight: '600' }}>
              {t('club.vip.table')} {selectedTable.tableNumber}
            </Text>
            <Text variant="bodyMedium" style={{ color: colors.foregroundSecondary, marginTop: 4 }}>
              {selectedTable.status === 'reserved'
                ? `${t('club.vip.status.reserved')} - ${selectedTable.reservationName || ''}`
                : t('club.vip.status.occupied')}
            </Text>
          </Card.Content>
        </Card>
      )}

      {/* Reservation Form Modal */}
      <ReservationForm
        visible={showForm}
        table={selectedTable}
        colors={colors}
        onDismiss={() => {
          setShowForm(false);
          setSelectedTable(null);
        }}
        onSubmit={handleReservationSubmit}
        isSubmitting={reserveMutation.isPending}
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
    paddingBottom: 8,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 12,
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
    padding: 16,
    gap: 12,
  },
  gridRow: {
    gap: 12,
    justifyContent: 'flex-start',
  },
  tableCell: {
    flex: 1,
    maxWidth: '31%',
    aspectRatio: 1,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    padding: 8,
    position: 'relative',
  },
  statusDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  selectedCard: {
    margin: 16,
    borderRadius: 16,
  },
  modalContainer: {
    margin: 24,
    borderRadius: 20,
    padding: 24,
    maxHeight: '80%',
  },
  infoCard: {
    borderRadius: 12,
    marginBottom: 16,
  },
  infoCardContent: {
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  input: {
    marginBottom: 12,
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  formBtn: {
    flex: 1,
    borderRadius: 8,
  },
});
