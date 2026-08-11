/**
 * MaitreDashboardScreen
 * 
 * Dashboard for maître d' staff role providing overview of
 * reservations, table status, and guest management features.
 * Supports both reservation list and floor plan view modes.
 * 
 * Migrated to semantic tokens using useColors() + useMemo pattern.
 * 
 * @module screens/maitre-dashboard
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  Text,
  Card,
  Button,
  Chip,
  FAB,
  Avatar,
  Menu,
  Divider,
  SegmentedButtons,
} from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useColors } from '@/shared/theme';
import { useRestaurant } from '@/shared/contexts/RestaurantContext';
import { t } from '@/shared/i18n';
import ApiService from '@/shared/services/api';

interface Reservation {
  id: string;
  customer_name: string;
  customer_phone: string;
  guests: number;
  time: string;
  date: string;
  table_number?: string;
  status: 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled';
  special_requests?: string;
}

interface FloorPlanTable {
  id: string;
  number: string;
  capacity: number;
  status: 'available' | 'occupied' | 'reserved' | 'needs_cleaning';
  guests?: number;
  waiter?: string;
  reservation_id?: string;
}

export default function MaitreDashboardScreen() {
  const navigation = useNavigation();
  const colors = useColors();
  
  // Get restaurant ID from context instead of hardcoded value
  const { restaurantId, isLoading: contextLoading } = useRestaurant();
  
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<FloorPlanTable[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedReservation, setSelectedReservation] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState<{ [key: string]: boolean }>({});
  const [viewMode, setViewMode] = useState<'reservations' | 'floor'>('reservations');

  // Memoized styles based on theme colors
  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.backgroundSecondary,
    },
    statsContainer: {
      flexDirection: 'row',
      padding: 16,
      gap: 10,
    },
    statCard: {
      flex: 1,
      elevation: 2,
      backgroundColor: colors.card,
    },
    statContent: {
      alignItems: 'center',
      paddingVertical: 10,
    },
    statValue: {
      fontWeight: 'bold',
      marginTop: 8,
      color: colors.foreground,
    },
    statLabel: {
      color: colors.mutedForeground,
      marginTop: 4,
      textAlign: 'center',
    },
    segmentedButtons: {
      marginHorizontal: 15,
      marginBottom: 15,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 80,
    },
    sectionTitle: {
      fontWeight: 'bold',
      marginBottom: 15,
      marginTop: 10,
      color: colors.foreground,
    },
    reservationCard: {
      marginBottom: 15,
      elevation: 3,
      backgroundColor: colors.card,
    },
    reservationHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 15,
    },
    reservationHeaderLeft: {
      flex: 1,
    },
    customerName: {
      fontWeight: 'bold',
      marginBottom: 5,
      color: colors.foreground,
    },
    reservationMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginBottom: 4,
    },
    metaText: {
      color: colors.mutedForeground,
    },
    separator: {
      color: colors.border,
      marginHorizontal: 4,
    },
    phoneRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 4,
    },
    phoneText: {
      color: colors.mutedForeground,
    },
    statusChip: {
      height: 32,
    },
    specialRequests: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      padding: 10,
      backgroundColor: colors.warningBackground,
      borderRadius: 8,
      marginBottom: 15,
    },
    specialRequestsText: {
      flex: 1,
      color: colors.warning,
      fontStyle: 'italic',
    },
    reservationActions: {
      flexDirection: 'row',
      gap: 10,
    },
    confirmButton: {
      flex: 1,
      backgroundColor: colors.success,
    },
    seatButton: {
      backgroundColor: colors.info,
    },
    floorGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 15,
      marginBottom: 20,
    },
    tableButton: {
      width: '30%',
      aspectRatio: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 3,
      padding: 10,
      elevation: 2,
    },
    tableCircle: {
      width: 50,
      height: 50,
      borderRadius: 25,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 8,
    },
    tableNumberText: {
      color: colors.cardForeground,
      fontWeight: 'bold',
    },
    tableCapacity: {
      color: colors.mutedForeground,
      textAlign: 'center',
    },
    tableWaiter: {
      color: colors.mutedForeground,
      fontSize: 10,
      marginTop: 2,
    },
    legendCard: {
      marginTop: 10,
      backgroundColor: colors.card,
    },
    legendTitle: {
      fontWeight: 'bold',
      marginBottom: 10,
      color: colors.foreground,
    },
    legendGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 15,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    legendDot: {
      width: 16,
      height: 16,
      borderRadius: 8,
    },
    legendText: {
      color: colors.foreground,
    },
    fab: {
      position: 'absolute',
      right: 16,
      bottom: 16,
      backgroundColor: colors.primary,
    },
  }), [colors]);

  // Load dashboard data when restaurant ID is available
  useEffect(() => {
    if (restaurantId) {
      loadDashboardData();
      const interval = setInterval(loadDashboardData, 30000);
      return () => clearInterval(interval);
    }
  }, [restaurantId]);

  const loadDashboardData = async () => {
    try {
      const overview = await ApiService.getMaitreOverview(restaurantId!);
      setReservations(overview.reservations);
      setTables(overview.tables);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const handleConfirmReservation = (reservationId: string) => {
    setReservations(
      reservations.map((r) =>
        r.id === reservationId ? { ...r, status: 'confirmed' } : r
      )
    );
    Alert.alert(t('maitreDashboard.confirmed'), t('maitreDashboard.reservationConfirmedMsg'));
  };

  const handleCancelReservation = (reservationId: string) => {
    Alert.alert(
      'Cancelar Reserva',
      'Deseja cancelar esta reserva?',
      [
        { text: 'Não', style: 'cancel' },
        {
          text: 'Sim',
          style: 'destructive',
          onPress: () => {
            setReservations(
              reservations.map((r) =>
                r.id === reservationId ? { ...r, status: 'cancelled' } : r
              )
            );
          },
        },
      ]
    );
  };

  const handleSeatGuests = (reservation: Reservation, tableNumber: string) => {
    setReservations(
      reservations.map((r) =>
        r.id === reservation.id
          ? { ...r, status: 'seated', table_number: tableNumber }
          : r
      )
    );

    setTables(
      tables.map((t) =>
        t.number === tableNumber
          ? {
              ...t,
              status: 'occupied',
              guests: reservation.guests,
              reservation_id: reservation.id,
            }
          : t
      )
    );

    Alert.alert('Sucesso', `Clientes acomodados na mesa ${tableNumber}`);
  };

  const handleAssignTable = (reservationId: string) => {
    const reservation = reservations.find((r) => r.id === reservationId);
    if (!reservation) return;

    const availableTables = tables.filter(
      (t) => t.status === 'available' && t.capacity >= reservation.guests
    );

    if (availableTables.length === 0) {
      Alert.alert(
        'Sem Mesas Disponíveis',
        'Não há mesas disponíveis com capacidade suficiente no momento'
      );
      return;
    }

    const table = availableTables[0];
    handleSeatGuests(reservation, table.number);
  };

  /**
   * Gets reservation status color using semantic tokens
   */
  const getReservationStatusColor = useCallback((status: string) => {
    switch (status) {
      case 'confirmed':
        return colors.success;
      case 'pending':
        return colors.warning;
      case 'seated':
        return colors.info;
      case 'cancelled':
        return colors.error;
      default:
        return colors.mutedForeground;
    }
  }, [colors]);

  const getReservationStatusLabel = (status: string) =>
    t(`maitreDashboard.status.${status}`) || status;

  /**
   * Gets table status color using semantic tokens
   */
  const getTableStatusColor = useCallback((status: string) => {
    switch (status) {
      case 'available':
        return colors.success;
      case 'occupied':
        return colors.error;
      case 'reserved':
        return colors.info;
      case 'needs_cleaning':
        return colors.warning;
      default:
        return colors.muted;
    }
  }, [colors]);

  const todayReservations = reservations.filter(
    (r) => new Date(r.date).toDateString() === new Date().toDateString()
  );

  const pendingReservations = todayReservations.filter((r) => r.status === 'pending');
  const confirmedReservations = todayReservations.filter((r) => r.status === 'confirmed');
  const availableTables = tables.filter((t) => t.status === 'available');

  return (
    <ScreenContainer>
    <View style={styles.container}>
      {/* Stats Header */}
      <View style={styles.statsContainer}>
        <Card style={styles.statCard}>
          <Card.Content style={styles.statContent}>
            <Icon name="calendar-check" size={24} color={colors.info} />
            <Text variant="headlineSmall" style={styles.statValue}>
              {todayReservations.length}
            </Text>
            <Text variant="bodySmall" style={styles.statLabel}>
              {t('maitreDashboard.reservationsToday')}
            </Text>
          </Card.Content>
        </Card>

        <Card style={styles.statCard}>
          <Card.Content style={styles.statContent}>
            <Icon name="clock-alert" size={24} color={colors.warning} />
            <Text variant="headlineSmall" style={styles.statValue}>
              {pendingReservations.length}
            </Text>
            <Text variant="bodySmall" style={styles.statLabel}>
              {t('maitreDashboard.pending')}
            </Text>
          </Card.Content>
        </Card>

        <Card style={styles.statCard}>
          <Card.Content style={styles.statContent}>
            <Icon name="table-furniture" size={24} color={colors.success} />
            <Text variant="headlineSmall" style={styles.statValue}>
              {availableTables.length}
            </Text>
            <Text variant="bodySmall" style={styles.statLabel}>
              Mesas Livres
            </Text>
          </Card.Content>
        </Card>
      </View>

      {/* View Toggle */}
      <SegmentedButtons
        value={viewMode}
        onValueChange={(value) => setViewMode(value as any)}
        buttons={[
          { value: 'reservations', label: 'Reservas', icon: 'calendar' },
          { value: 'floor', label: 'Salão', icon: 'floor-plan' },
        ]}
        style={styles.segmentedButtons}
      />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.scrollContent}
      >
        {viewMode === 'reservations' ? (
          <>
            {/* Pending Reservations */}
            {pendingReservations.length > 0 && (
              <>
                <Text variant="titleLarge" style={styles.sectionTitle}>
                  Aguardando Confirmação ({pendingReservations.length})
                </Text>
                {pendingReservations.map((reservation) => (
                  <Card key={reservation.id} style={styles.reservationCard}>
                    <Card.Content>
                      <View style={styles.reservationHeader}>
                        <View style={styles.reservationHeaderLeft}>
                          <Text variant="titleLarge" style={styles.customerName}>
                            {reservation.customer_name}
                          </Text>
                          <View style={styles.reservationMeta}>
                            <Icon name="clock-outline" size={16} color={colors.mutedForeground} />
                            <Text variant="bodyMedium" style={styles.metaText}>
                              {reservation.time}
                            </Text>
                            <Text style={styles.separator}>•</Text>
                            <Icon name="account-group" size={16} color={colors.mutedForeground} />
                            <Text variant="bodyMedium" style={styles.metaText}>
                              {reservation.guests} pessoas
                            </Text>
                          </View>
                        </View>

                        <Chip
                          style={[
                            styles.statusChip,
                            {
                              backgroundColor: `${getReservationStatusColor(reservation.status)}20`,
                            },
                          ]}
                          textStyle={{
                            color: getReservationStatusColor(reservation.status),
                          }}
                        >
                          {getReservationStatusLabel(reservation.status)}
                        </Chip>
                      </View>

                      <View style={styles.reservationActions}>
                        <Button
                          mode="contained"
                          onPress={() => handleConfirmReservation(reservation.id)}
                          style={styles.confirmButton}
                          icon="check"
                          accessibilityLabel={`Confirm reservation for ${reservation.customer_name}`}
                        >
                          Confirmar
                        </Button>
                        <Button
                          mode="outlined"
                          onPress={() => handleCancelReservation(reservation.id)}
                          textColor={colors.error}
                          icon="close"
                          accessibilityLabel={`Cancel reservation for ${reservation.customer_name}`}
                        >
                          Cancelar
                        </Button>
                      </View>
                    </Card.Content>
                  </Card>
                ))}
              </>
            )}

            {/* Confirmed Reservations */}
            {confirmedReservations.length > 0 && (
              <>
                <Text variant="titleLarge" style={styles.sectionTitle}>
                  Confirmadas ({confirmedReservations.length})
                </Text>
                {confirmedReservations.map((reservation) => (
                  <Card key={reservation.id} style={styles.reservationCard}>
                    <Card.Content>
                      <View style={styles.reservationHeader}>
                        <View style={styles.reservationHeaderLeft}>
                          <Text variant="titleLarge" style={styles.customerName}>
                            {reservation.customer_name}
                          </Text>
                          <View style={styles.reservationMeta}>
                            <Icon name="clock-outline" size={16} color={colors.mutedForeground} />
                            <Text variant="bodyMedium" style={styles.metaText}>
                              {reservation.time}
                            </Text>
                            <Text style={styles.separator}>•</Text>
                            <Icon name="account-group" size={16} color={colors.mutedForeground} />
                            <Text variant="bodyMedium" style={styles.metaText}>
                              {reservation.guests} pessoas
                            </Text>
                          </View>
                          <View style={styles.phoneRow}>
                            <Icon name="phone" size={14} color={colors.mutedForeground} />
                            <Text variant="bodySmall" style={styles.phoneText}>
                              {reservation.customer_phone}
                            </Text>
                          </View>
                        </View>

                        <Chip
                          style={[
                            styles.statusChip,
                            {
                              backgroundColor: `${getReservationStatusColor(reservation.status)}20`,
                            },
                          ]}
                          textStyle={{
                            color: getReservationStatusColor(reservation.status),
                          }}
                        >
                          {getReservationStatusLabel(reservation.status)}
                        </Chip>
                      </View>

                      {reservation.special_requests && (
                        <View style={styles.specialRequests}>
                          <Icon name="note-text" size={16} color={colors.warning} />
                          <Text variant="bodySmall" style={styles.specialRequestsText}>
                            {reservation.special_requests}
                          </Text>
                        </View>
                      )}

                      <Button
                        mode="contained"
                        onPress={() => handleAssignTable(reservation.id)}
                        style={styles.seatButton}
                        icon="table-furniture"
                        accessibilityLabel={`Seat guests for ${reservation.customer_name}`}
                      >
                        Acomodar Clientes
                      </Button>
                    </Card.Content>
                  </Card>
                ))}
              </>
            )}
          </>
        ) : (
          <>
            {/* Floor Plan View */}
            <Text variant="titleLarge" style={styles.sectionTitle}>
              Status do Salão
            </Text>

            <View style={styles.floorGrid}>
              {tables.map((table) => (
                <TouchableOpacity
                  key={table.id}
                  style={[
                    styles.tableButton,
                    { borderColor: getTableStatusColor(table.status) },
                  ]}
                  onPress={() => {
                    if (table.status === 'available') {
                      navigation.navigate('FloorPlan' as never);
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Table ${table.number}, ${table.status}, capacity ${table.capacity}`}
                >
                  <View
                    style={[
                      styles.tableCircle,
                      { backgroundColor: getTableStatusColor(table.status) },
                    ]}
                  >
                    <Text variant="titleLarge" style={styles.tableNumberText}>
                      {table.number}
                    </Text>
                  </View>
                  <Text variant="bodySmall" style={styles.tableCapacity}>
                    {table.capacity} pessoas
                  </Text>
                  {table.waiter && (
                    <Text variant="bodySmall" style={styles.tableWaiter}>
                      {table.waiter}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {/* Legend */}
            <Card style={styles.legendCard}>
              <Card.Content>
                <Text variant="titleMedium" style={styles.legendTitle}>
                  Legenda
                </Text>
                <View style={styles.legendGrid}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
                    <Text variant="bodySmall" style={styles.legendText}>Disponível</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: colors.error }]} />
                    <Text variant="bodySmall" style={styles.legendText}>Ocupada</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: colors.info }]} />
                    <Text variant="bodySmall" style={styles.legendText}>Reservada</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
                    <Text variant="bodySmall" style={styles.legendText}>Limpeza</Text>
                  </View>
                </View>
              </Card.Content>
            </Card>
          </>
        )}
      </ScrollView>

      {/* FAB */}
      <FAB
        icon="plus"
        label={t('formLabels.newReservation')}
        style={styles.fab}
        onPress={() => navigation.navigate('Reservations' as never)}
        accessibilityLabel="Create new reservation"
      />
    </View>
    </ScreenContainer>
  );
}
