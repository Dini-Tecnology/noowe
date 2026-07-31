import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Card, Text, Chip, IconButton, Button } from 'react-native-paper';
import type { Reservation, ReservationStatus } from '../../types';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { t } from '@/shared/i18n';
import { formatDateTime } from '@okinawa/shared/utils/formatters';
import { getLanguage } from '@/shared/i18n';

interface ReservationCardProps {
  reservation: Reservation;
  onPress?: () => void;
  onConfirm?: (id: string) => void;
  onCancel?: (id: string) => void;
  onComplete?: (id: string) => void;
  showActions?: boolean;
}

const STATUS_COLORS: Record<ReservationStatus, string> = {
  pending: '#FFA726',
  confirmed: '#42A5F5',
  seated: '#00C853',
  completed: '#66BB6A',
  cancelled: '#EF5350',
  no_show: '#9E9E9E',
};

const getReservationStatusLabel = (status: ReservationStatus): string =>
  t(`reservations.status.${status}`);

export default function ReservationCard({
  reservation,
  onPress,
  onConfirm,
  onCancel,
  onComplete,
  showActions = true,
}: ReservationCardProps) {
  const colors = useColors();

  const styles = useMemo(() => StyleSheet.create({
    card: {
      marginBottom: 16,
      elevation: 2,
      backgroundColor: colors.card,
    },
    upcomingCard: {
      borderLeftWidth: 4,
      borderLeftColor: '#FF6F00',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    headerLeft: {
      flex: 1,
      marginRight: 8,
    },
    customerName: {
      color: colors.foreground,
    },
    timeInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
    },
    timeText: {
      color: colors.foregroundMuted,
    },
    countdown: {
      color: colors.foregroundMuted,
      marginTop: 4,
      marginLeft: 24,
    },
    countdownUrgent: {
      color: '#FF6F00',
      fontWeight: '600',
    },
    statusChip: {
      height: 28,
    },
    chipText: {
      color: '#fff',
      fontSize: 12,
    },
    details: {
      marginBottom: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 4,
    },
    detailText: {
      color: colors.foreground,
    },
    icon: {
      margin: 0,
      padding: 0,
      marginRight: 8,
    },
    specialRequests: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: colors.primaryLight,
      padding: 12,
      borderRadius: 8,
      marginBottom: 12,
    },
    specialRequestsText: {
      flex: 1,
      color: colors.foregroundMuted,
      fontStyle: 'italic',
    },
    actions: {
      flexDirection: 'row',
      gap: 8,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    actionButton: {
      flex: 1,
    },
    seatButton: {
      backgroundColor: '#0091EA',
    },
    completeButton: {
      backgroundColor: '#00C853',
    },
    cancelButton: {
      borderColor: '#d32f2f',
    },
  }), [colors]);

  const canConfirm = reservation.status === 'pending';
  const canSeat = reservation.status === 'confirmed';
  const canComplete = reservation.status === 'seated';
  const canCancel = ['pending', 'confirmed'].includes(reservation.status);

  const getTimeUntilReservation = () => {
    const now = new Date();
    const reservationTime = new Date(reservation.reservation_time);
    const diffMs = reservationTime.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 0) {
      const absMins = Math.abs(diffMins);
      if (absMins < 60) return `Atrasado ${absMins} min`;
      return `Atrasado ${Math.floor(absMins / 60)}h ${absMins % 60}min`;
    }

    if (diffMins < 60) return `Em ${diffMins} min`;
    return `Em ${Math.floor(diffMins / 60)}h ${diffMins % 60}min`;
  };

  const isUpcoming = () => {
    const now = new Date();
    const reservationTime = new Date(reservation.reservation_time);
    const diffMins = Math.floor((reservationTime.getTime() - now.getTime()) / 60000);
    return diffMins >= 0 && diffMins <= 30;
  };

  const CardContent = () => (
    <Card.Content>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text variant="titleLarge" style={styles.customerName}>
            {reservation.customer?.full_name || reservation.customer?.email || 'Cliente'}
          </Text>
          <View style={styles.timeInfo}>
            <IconButton icon="clock-outline" size={16} style={styles.icon} iconColor={colors.foregroundMuted} />
            <Text variant="bodySmall" style={styles.timeText}>
              {formatDateTime(reservation.reservation_time, getLanguage())}
            </Text>
          </View>
          {['pending', 'confirmed'].includes(reservation.status) && (
            <Text variant="bodySmall" style={[styles.countdown, isUpcoming() && styles.countdownUrgent]}>
              {getTimeUntilReservation()}
            </Text>
          )}
        </View>
        <Chip
          style={[styles.statusChip, { backgroundColor: STATUS_COLORS[reservation.status] }]}
          textStyle={styles.chipText}
        >
          {getReservationStatusLabel(reservation.status)}
        </Chip>
      </View>

      <View style={styles.details}>
        <View style={styles.detailRow}>
          <IconButton icon="account-group" size={20} style={styles.icon} iconColor={colors.foregroundMuted} />
          <Text variant="bodyMedium" style={styles.detailText}>{reservation.party_size} pessoas</Text>
        </View>
        {reservation.table_id && (
          <View style={styles.detailRow}>
            <IconButton icon="table-furniture" size={20} style={styles.icon} iconColor={colors.foregroundMuted} />
            <Text variant="bodyMedium" style={styles.detailText}>Mesa {reservation.table_id.slice(0, 8)}</Text>
          </View>
        )}
        {reservation.customer?.phone && (
          <View style={styles.detailRow}>
            <IconButton icon="phone" size={20} style={styles.icon} iconColor={colors.foregroundMuted} />
            <Text variant="bodyMedium" style={styles.detailText}>{reservation.customer?.phone}</Text>
          </View>
        )}
      </View>

      {reservation.special_requests && (
        <View style={styles.specialRequests}>
          <IconButton icon="information-outline" size={16} style={styles.icon} iconColor={colors.primary} />
          <Text variant="bodySmall" style={styles.specialRequestsText}>
            {reservation.special_requests}
          </Text>
        </View>
      )}

      {showActions && (canConfirm || canSeat || canComplete || canCancel) && (
        <View style={styles.actions}>
          {canConfirm && onConfirm && (
            <Button mode="contained" onPress={() => onConfirm(reservation.id)} style={styles.actionButton} buttonColor={colors.primary}>
              Confirmar
            </Button>
          )}
          {canSeat && onConfirm && (
            <Button
              mode="contained"
              onPress={() => onConfirm(reservation.id)}
              style={[styles.actionButton, styles.seatButton]}
            >
              Sentar Mesa
            </Button>
          )}
          {canComplete && onComplete && (
            <Button
              mode="contained"
              onPress={() => onComplete(reservation.id)}
              style={[styles.actionButton, styles.completeButton]}
            >
              Finalizar
            </Button>
          )}
          {canCancel && onCancel && (
            <Button
              mode="outlined"
              onPress={() => onCancel(reservation.id)}
              style={[styles.actionButton, styles.cancelButton]}
              textColor="#d32f2f"
            >
              Cancelar
            </Button>
          )}
        </View>
      )}
    </Card.Content>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        <Card style={[styles.card, isUpcoming() && styles.upcomingCard]}>{CardContent()}</Card>
      </TouchableOpacity>
    );
  }

  return <Card style={[styles.card, isUpcoming() && styles.upcomingCard]}>{CardContent()}</Card>;
}
