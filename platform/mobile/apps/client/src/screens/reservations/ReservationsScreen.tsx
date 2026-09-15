import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { Text, Card, Chip, IconButton, ActivityIndicator, FAB } from 'react-native-paper';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import { ptBR as dateFnsPtBR } from 'date-fns/locale';
import ApiService from '@/shared/services/api';
import { useI18n } from '@/shared/hooks/useI18n';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import logger from '@okinawa/shared/utils/logger';
import type { Reservation, ReservationStatus, RootStackParamList } from '../../types';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/**
 * ReservationsScreen - Displays user's restaurant reservations
 * Shows list of reservations with status, date, and party size
 * Uses semantic design tokens via useColors() for theme-aware styling
 */
export default function ReservationsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { t } = useI18n();
  const colors = useColors();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Returns status color based on reservation status using semantic tokens
   * @param status - Current reservation status
   * @returns Color string from theme tokens
   */
  const getStatusColor = useCallback((status: ReservationStatus): string => {
    const statusColors: Record<ReservationStatus, string> = {
      pending: colors.warning,
      confirmed: colors.success,
      seated: colors.info,
      completed: colors.success,
      cancelled: colors.error,
      no_show: colors.foregroundMuted,
    };
    return statusColors[status] || colors.foregroundMuted;
  }, [colors]);

  /**
   * Returns localized status label
   * @param status - Current reservation status
   */
  const getStatusLabel = (status: ReservationStatus): string => {
    return t(`reservations.status.${status}`);
  };

  useFocusEffect(
    useCallback(() => {
      loadReservations();
    }, [])
  );

  /**
   * Loads reservations from API
   */
  const loadReservations = async () => {
    try {
      setLoading(true);
      const data = await ApiService.getMyReservations();
      setReservations(data);
    } catch (error) {
      logger.error(error);
      Alert.alert(t('common.error'), t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReservations();
    setRefreshing(false);
  };

  /**
   * Handles reservation cancellation with confirmation dialog
   * @param reservation - Reservation to cancel
   */
  const handleCancel = async (reservation: Reservation) => {
    Alert.alert(t('reservations.cancelReservation'), t('common.confirm') + '?', [
      { text: t('common.no'), style: 'cancel' },
      {
        text: t('common.yes'),
        style: 'destructive',
        onPress: async () => {
          try {
            await ApiService.cancelReservation(reservation.id);
            Alert.alert(t('common.success'), t('reservations.status.cancelled'));
            loadReservations();
          } catch (error: any) {
            Alert.alert(t('common.error'), error.response?.data?.message || t('errors.generic'));
          }
        },
      },
    ]);
  };

  // Dynamic styles using semantic tokens for full theme support
  const styles = useMemo(() => StyleSheet.create({
    container: { 
      flex: 1, 
      backgroundColor: colors.background,
    },
    loadingContainer: { 
      flex: 1, 
      alignItems: 'center', 
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    listContent: { 
      padding: 16,
    },
    card: { 
      marginBottom: 16, 
      elevation: 2, 
      backgroundColor: colors.card,
    },
    header: { 
      flexDirection: 'row', 
      justifyContent: 'space-between', 
      marginBottom: 8,
    },
    headerLeft: { 
      flex: 1,
    },
    restaurantName: {
      color: colors.foreground,
    },
    infoRow: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      marginTop: 4,
    },
    icon: { 
      margin: 0, 
      padding: 0, 
      marginRight: 4,
    },
    infoText: {
      color: colors.foregroundSecondary,
    },
    statusChip: { 
      height: 28,
    },
    chipText: { 
      color: colors.primaryForeground, 
      fontSize: 12,
    },
    specialRequests: { 
      marginTop: 8, 
      fontStyle: 'italic', 
      color: colors.foregroundSecondary,
    },
    cancelButton: { 
      marginTop: 12, 
      paddingVertical: 8,
    },
    cancelText: { 
      color: colors.error, 
      textAlign: 'center',
    },
    emptyContainer: { 
      flex: 1, 
      alignItems: 'center', 
      justifyContent: 'center', 
      paddingVertical: 64,
    },
    emptyTitle: {
      color: colors.foreground,
    },
    emptyText: { 
      marginTop: 16, 
      textAlign: 'center', 
      color: colors.foregroundSecondary,
    },
    fab: { 
      position: 'absolute', 
      right: 16, 
      bottom: 16, 
      backgroundColor: colors.primary,
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

  return (
    <ScreenContainer>
    <View style={styles.container}>
      <FlatList
        data={reservations}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.listContent}
        getItemLayout={(_, index) => ({
          length: 120,
          offset: 120 * index,
          index,
        })}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <IconButton icon="calendar-blank" size={48} iconColor={colors.foregroundMuted} />
            <Text variant="headlineSmall" style={styles.emptyTitle}>{t('empty.reservations')}</Text>
            <Text variant="bodyMedium" style={styles.emptyText}>
              {t('reservations.noReservations')}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => navigation.navigate('ReservationDetail', { reservationId: item.id })}
            accessibilityRole="button"
            accessibilityLabel={`View reservation at ${item.restaurant?.name || 'restaurant'}`}
          >
            <Card style={styles.card}>
              <Card.Content>
                <View style={styles.header}>
                  <View style={styles.headerLeft}>
                    <Text variant="titleMedium" style={styles.restaurantName}>
                      {item.restaurant?.name || t('restaurant.title')}
                    </Text>
                    <View style={styles.infoRow}>
                      <IconButton icon="calendar" size={16} style={styles.icon} iconColor={colors.foregroundSecondary} />
                      <Text variant="bodySmall" style={styles.infoText}>
                        {format(new Date(item.reservation_time), 'dd/MM/yyyy HH:mm', { locale: dateFnsPtBR })}
                      </Text>
                    </View>
                    <View style={styles.infoRow}>
                      <IconButton icon="account-group" size={16} style={styles.icon} iconColor={colors.foregroundSecondary} />
                      <Text variant="bodySmall" style={styles.infoText}>
                        {item.party_size} {t('reservations.guests')}
                      </Text>
                    </View>
                  </View>
                  <Chip 
                    style={[styles.statusChip, { backgroundColor: getStatusColor(item.status) }]} 
                    textStyle={styles.chipText}
                  >
                    {getStatusLabel(item.status)}
                  </Chip>
                </View>
                {item.special_requests && (
                  <Text variant="bodySmall" style={styles.specialRequests}>
                    {t('reservations.specialRequests')}: {item.special_requests}
                  </Text>
                )}
                {['pending', 'confirmed'].includes(item.status) && (
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => handleCancel(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Cancel reservation at ${item.restaurant?.name || 'restaurant'}`}
                  >
                    <Text variant="bodySmall" style={styles.cancelText}>
                      {t('reservations.cancelReservation')}
                    </Text>
                  </TouchableOpacity>
                )}
              </Card.Content>
            </Card>
          </TouchableOpacity>
        )}
      />
      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => navigation.navigate('Explore')}
        label={t('reservations.newReservation')}
        color={colors.primaryForeground}
      />
    </View>
  
    </ScreenContainer>
  );
}