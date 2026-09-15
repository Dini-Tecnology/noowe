import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Card, Text, IconButton, Chip } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';

type TableStatus = 'available' | 'occupied' | 'reserved' | 'cleaning';

interface Table {
  id: string;
  table_number: string;
  capacity: number;
  status: TableStatus;
  location?: string;
  current_order_id?: string;
  current_reservation_id?: string;
  notes?: string;
}

interface TableCardProps {
  table: Table;
  onPress?: () => void;
  compact?: boolean;
}

const STATUS_COLORS: Record<TableStatus, string> = {
  available: '#00C853',
  occupied: '#d32f2f',
  reserved: '#FF6F00',
  cleaning: '#0091EA',
};

const STATUS_LABELS: Record<TableStatus, string> = {
  available: 'Disponível',
  occupied: 'Ocupada',
  reserved: 'Reservada',
  cleaning: 'Limpeza',
};

export default function TableCard({ table, onPress, compact = false }: TableCardProps) {
  const colors = useColors();

  const styles = useMemo(() => StyleSheet.create({
    card: {
      marginBottom: 16,
      elevation: 2,
      backgroundColor: colors.card,
    },
    content: {
      paddingVertical: 12,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    tableInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    icon: {
      margin: 0,
      padding: 0,
      marginRight: 8,
    },
    tableNumber: {
      color: colors.foreground,
    },
    capacity: {
      color: colors.foregroundMuted,
      marginTop: 2,
    },
    statusChip: {
      height: 28,
    },
    chipText: {
      color: '#fff',
      fontSize: 12,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
      marginLeft: 4,
    },
    detailText: {
      color: colors.foregroundMuted,
    },
    notes: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: colors.primaryLight,
      padding: 8,
      borderRadius: 8,
      marginTop: 12,
    },
    notesText: {
      flex: 1,
      color: colors.foregroundMuted,
      fontStyle: 'italic',
    },
  }), [colors]);

  const CardContent = () => (
    <Card.Content style={styles.content}>
      <View style={styles.header}>
        <View style={styles.tableInfo}>
          <IconButton icon="table-furniture" size={compact ? 24 : 32} iconColor={colors.primary} style={styles.icon} />
          <View>
            <Text variant={compact ? 'titleMedium' : 'titleLarge'} style={styles.tableNumber}>Mesa {table.table_number}</Text>
            <Text variant="bodySmall" style={styles.capacity}>
              Até {table.capacity} pessoas
            </Text>
          </View>
        </View>
        <Chip
          style={[styles.statusChip, { backgroundColor: STATUS_COLORS[table.status] }]}
          textStyle={styles.chipText}
        >
          {STATUS_LABELS[table.status]}
        </Chip>
      </View>

      {!compact && (
        <>
          {table.location && (
            <View style={styles.detailRow}>
              <IconButton icon="map-marker" size={16} style={styles.icon} iconColor={colors.foregroundMuted} />
              <Text variant="bodySmall" style={styles.detailText}>
                {table.location}
              </Text>
            </View>
          )}

          {table.current_order_id && table.status === 'occupied' && (
            <View style={styles.detailRow}>
              <IconButton icon="receipt" size={16} style={styles.icon} iconColor={colors.foregroundMuted} />
              <Text variant="bodySmall" style={styles.detailText}>
                Pedido #{table.current_order_id.slice(0, 8)}
              </Text>
            </View>
          )}

          {table.current_reservation_id && table.status === 'reserved' && (
            <View style={styles.detailRow}>
              <IconButton icon="calendar-check" size={16} style={styles.icon} iconColor={colors.foregroundMuted} />
              <Text variant="bodySmall" style={styles.detailText}>
                Reserva #{table.current_reservation_id.slice(0, 8)}
              </Text>
            </View>
          )}

          {table.notes && (
            <View style={styles.notes}>
              <IconButton icon="information-outline" size={16} style={styles.icon} iconColor={colors.primary} />
              <Text variant="bodySmall" style={styles.notesText}>
                {table.notes}
              </Text>
            </View>
          )}
        </>
      )}
    </Card.Content>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        <Card style={styles.card}>{CardContent()}</Card>
      </TouchableOpacity>
    );
  }

  return <Card style={styles.card}>{CardContent()}</Card>;
}
