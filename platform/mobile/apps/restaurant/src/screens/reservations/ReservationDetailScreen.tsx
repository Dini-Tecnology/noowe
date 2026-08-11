import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Text, Card, Chip, Button, IconButton, ActivityIndicator } from 'react-native-paper';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import ApiService from '@/shared/services/api';
import type { Reservation, ReservationStatus } from '../../types';
import { useI18n } from '@/shared/hooks/useI18n';
import { useColors } from '@/shared/theme';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';

type RouteParams = {
  ReservationDetail: {
    reservationId: string;
  };
};

const getSTATUS_COLORS = (colors: any): Record<ReservationStatus, string> => ({
  pending: colors.statusPending,
  confirmed: colors.statusConfirmed,
  seated: colors.success,
  completed: colors.success,
  cancelled: colors.error,
  no_show: colors.foregroundMuted,
});

export default function ReservationDetailScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const STATUS_COLORS = getSTATUS_COLORS(colors);
  const route = useRoute<RouteProp<RouteParams, 'ReservationDetail'>>();
  const navigation = useNavigation();
  const { reservationId } = route.params;

  const getStatusLabel = (status: ReservationStatus): string => {
    return t(`reservations.status.${status}` as any);
  };

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReservation();
  }, [reservationId]);

  const loadReservation = async () => {
    try {
      setLoading(true);
      // Mock - replace with real API
      const data = await ApiService.getReservation(reservationId);
      setReservation(data);
    } catch (error) {
      console.error(error);
      Alert.alert(t('common.error'), t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: ReservationStatus) => {
    try {
      await ApiService.updateReservationStatus(reservationId, newStatus);
      if (reservation) {
        setReservation({ ...reservation, status: newStatus });
      }
      Alert.alert(t('common.success'), t('success.updated'));
    } catch (error) {
      Alert.alert(t('common.error'), t('common.error'));
    }
  };

  const styles = useMemo(() => StyleSheet.create({
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
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    card: {
      margin: 16,
      marginBottom: 8,
      elevation: 2,
      backgroundColor: colors.card,
    },
    header: {
      marginBottom: 16,
    },
    statusChip: {
      marginTop: 8,
      alignSelf: 'flex-start',
    },
    chipText: {
      color: colors.premiumCardForeground,
      fontSize: 12,
    },
    info: {
      gap: 12,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    icon: {
      margin: 0,
      padding: 0,
      marginRight: 8,
    },
    sectionTitle: {
      marginBottom: 12,
      color: colors.foreground,
    },
    specialRequests: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: colors.warningLight,
      padding: 12,
      borderRadius: 8,
    },
    specialRequestsText: {
      flex: 1,
      color: colors.foregroundMuted,
    },
    actions: {
      padding: 16,
      gap: 8,
    },
    actionButton: {
      marginBottom: 8,
    },
    seatedButton: {
      backgroundColor: colors.info,
    },
    completedButton: {
      backgroundColor: colors.success,
    },
    cancelButton: {
      borderColor: colors.error,
    },
  }), [colors]);

  if (loading) {
    return (
      <ScreenContainer>
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
      </ScreenContainer>
    );
  }

  if (!reservation) {
    return (
      <ScreenContainer>
      <View style={styles.emptyContainer}>
        <IconButton icon="alert-circle" size={48} iconColor={colors.foregroundMuted} />
        <Text variant="headlineSmall" style={{ color: colors.foreground }}>{t('reservations.reservationNotFound')}</Text>
      </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
    <ScrollView style={styles.container}>
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.header}>
            <Text variant="headlineMedium">{reservation.customer?.full_name ?? 'Guest'}</Text>
            <Chip
              style={[styles.statusChip, { backgroundColor: STATUS_COLORS[reservation.status] }]}
              textStyle={styles.chipText}
            >
              {getStatusLabel(reservation.status)}
            </Chip>
          </View>

          <View style={styles.info}>
            <View style={styles.infoRow}>
              <IconButton icon="calendar-clock" size={20} style={styles.icon} />
              <Text variant="bodyLarge">
                {format(new Date(reservation.reservation_time), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <IconButton icon="account-group" size={20} style={styles.icon} />
              <Text variant="bodyLarge">{reservation.party_size} pessoas</Text>
            </View>
            {reservation.customer?.phone && (
              <View style={styles.infoRow}>
                <IconButton icon="phone" size={20} style={styles.icon} />
                <Text variant="bodyLarge">{reservation.customer.phone}</Text>
              </View>
            )}
            {reservation.table_id && (
              <View style={styles.infoRow}>
                <IconButton icon="table-furniture" size={20} style={styles.icon} />
                <Text variant="bodyLarge">Mesa {reservation.table_id.slice(0, 8)}</Text>
              </View>
            )}
          </View>
        </Card.Content>
      </Card>

      {reservation.special_requests && (
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              {t('reservations.specialRequests')}
            </Text>
            <View style={styles.specialRequests}>
              <IconButton icon="information-outline" size={20} style={styles.icon} />
              <Text variant="bodyMedium" style={styles.specialRequestsText}>
                {reservation.special_requests}
              </Text>
            </View>
          </Card.Content>
        </Card>
      )}

      <View style={styles.actions}>
        {reservation.status === 'pending' && (
          <Button
            mode="contained"
            onPress={() => handleStatusChange('confirmed')}
            style={styles.actionButton}
            icon="check"
            accessibilityRole="button"
            accessibilityLabel={t('reservations.confirmReserve')}
          >
            {t('reservations.confirmReserve')}
          </Button>
        )}
        {reservation.status === 'confirmed' && (
          <Button
            mode="contained"
            onPress={() => handleStatusChange('seated')}
            style={[styles.actionButton, styles.seatedButton]}
            icon="chair-rolling"
            accessibilityRole="button"
            accessibilityLabel={t('reservations.markSeated')}
          >
            {t('reservations.markSeated')}
          </Button>
        )}
        {reservation.status === 'seated' && (
          <Button
            mode="contained"
            onPress={() => handleStatusChange('completed')}
            style={[styles.actionButton, styles.completedButton]}
            icon="check-circle"
            accessibilityRole="button"
            accessibilityLabel={t('reservations.finishReservation')}
          >
            {t('reservations.finishReservation')}
          </Button>
        )}
        {['pending', 'confirmed'].includes(reservation.status) && (
          <>
            <Button
              mode="outlined"
              onPress={() => handleStatusChange('no_show')}
              style={styles.actionButton}
              textColor={colors.foregroundMuted}
              icon="account-off"
              accessibilityRole="button"
              accessibilityLabel={t('reservations.markNoShow')}
            >
              {t('reservations.markNoShow')}
            </Button>
            <Button
              mode="outlined"
              onPress={() => handleStatusChange('cancelled')}
              style={styles.cancelButton}
              textColor={colors.error}
              icon="close-circle"
              accessibilityRole="button"
              accessibilityLabel={t('reservations.cancelReservation')}
            >
              {t('reservations.cancelReservation')}
            </Button>
          </>
        )}
      </View>
    </ScrollView>
    </ScreenContainer>
  );
}
