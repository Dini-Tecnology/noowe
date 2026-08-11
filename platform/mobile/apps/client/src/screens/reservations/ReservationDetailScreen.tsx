import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Alert, RefreshControl } from 'react-native';
import { Text, Card, Button, IconButton, ActivityIndicator, Chip, Avatar, Divider, ProgressBar } from 'react-native-paper';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { format, differenceInMinutes, isPast, addMinutes } from 'date-fns';
import { ptBR as dateFnsPtBR } from 'date-fns/locale';
import ApiService from '@/shared/services/api';
import { useScreenTracking, useAnalytics } from '@/shared/hooks/useAnalytics';
import { useI18n } from '@/shared/hooks/useI18n';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';

interface Guest {
  id: string;
  guest_user_id?: string;
  guest_name?: string;
  guest_phone?: string;
  guest_email?: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  is_host: boolean;
  has_arrived: boolean;
  arrived_at?: string;
  guest_user?: {
    id: string;
    full_name: string;
    avatar_url?: string;
  };
}

interface Reservation {
  id: string;
  restaurant_id: string;
  status: 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show';
  reservation_date: string;
  reservation_time: string;
  party_size: number;
  seating_preference?: string;
  occasion?: string;
  special_requests?: string;
  dietary_restrictions?: string[];
  contact_phone?: string;
  contact_email?: string;
  confirmed_at?: string;
  seated_at?: string;
  completed_at?: string;
  cancelled_at?: string;
  cancellation_reason?: string;
  restaurant?: {
    id: string;
    name: string;
    address?: string;
    phone?: string;
    image_url?: string;
  };
  guests: Guest[];
}

const getSTATUS_CONFIG = (colors: any) => ({
  pending: { color: colors.statusPending, label: 'Aguardando confirmação', icon: 'clock-outline' },
  confirmed: { color: colors.success, label: 'Confirmada', icon: 'check-circle' },
  seated: { color: colors.statusConfirmed, label: 'Sentado', icon: 'chair-rolling' },
  completed: { color: colors.success, label: 'Concluída', icon: 'check-all' },
  cancelled: { color: colors.error, label: 'Cancelada', icon: 'close-circle' },
  no_show: { color: colors.foregroundMuted, label: 'Não compareceu', icon: 'account-off' },
});

const getGUEST_STATUS_COLORS = (colors: any) => ({
  pending: colors.statusPending,
  accepted: colors.success,
  declined: colors.error,
  cancelled: colors.foregroundMuted,
});

export default function ReservationDetailScreen() {
  useScreenTracking('Reservation Detail');
  const { t } = useI18n();
  const colors = useColors();
  const STATUS_CONFIG = getSTATUS_CONFIG(colors);
  const GUEST_STATUS_COLORS = getGUEST_STATUS_COLORS(colors);
  const route = useRoute();
  const navigation = useNavigation<any>();
  const analytics = useAnalytics();
  
  const { reservationId } = route.params as { reservationId: string };

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.backgroundSecondary,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.backgroundSecondary,
    },
    loadingText: {
      marginTop: 15,
      color: colors.foregroundMuted,
    },
    statusCard: {
      margin: 16,
      marginBottom: 10,
    },
    statusHeader: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    statusInfo: {
      flex: 1,
    },
    statusLabel: {
      color: colors.premiumCardForeground,
      fontSize: 18,
      fontWeight: 'bold',
    },
    statusTime: {
      color: 'rgba(255,255,255,0.9)',
      fontSize: 14,
      marginTop: 4,
    },
    progressContainer: {
      marginTop: 15,
    },
    card: {
      marginHorizontal: 15,
      marginBottom: 15,
      backgroundColor: colors.card,
    },
    restaurantImage: {
      height: 150,
    },
    restaurantContent: {
      paddingTop: 15,
    },
    restaurantName: {
      color: colors.foreground,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 5,
    },
    infoIcon: {
      margin: 0,
      marginRight: -5,
    },
    infoText: {
      color: colors.foregroundMuted,
      flex: 1,
    },
    sectionTitle: {
      marginBottom: 15,
      color: colors.foreground,
    },
    detailsGrid: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginBottom: 15,
    },
    detailItem: {
      alignItems: 'center',
    },
    detailLabel: {
      color: colors.foregroundMuted,
      marginTop: 4,
    },
    detailValue: {
      fontWeight: '600',
      color: colors.foreground,
    },
    additionalInfo: {
      flexDirection: 'row',
      marginTop: 10,
    },
    additionalLabel: {
      fontWeight: '600',
      marginRight: 8,
      color: colors.foreground,
    },
    specialRequests: {
      marginTop: 15,
      padding: 12,
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 8,
    },
    requestsText: {
      color: colors.foregroundMuted,
      marginTop: 5,
    },
    restrictions: {
      marginTop: 15,
    },
    restrictionChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 8,
    },
    restrictionChip: {
      backgroundColor: colors.primaryLight,
    },
    guestHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    guestItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
    },
    guestAvatar: {
      marginRight: 12,
    },
    guestInfo: {
      flex: 1,
    },
    guestNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    guestName: {
      color: colors.foreground,
    },
    hostChip: {
      backgroundColor: colors.primary,
      height: 22,
    },
    hostChipText: {
      color: colors.premiumCardForeground,
      fontSize: 10,
    },
    arrivedChip: {
      backgroundColor: colors.successBackground,
      height: 22,
      marginTop: 4,
    },
    arrivedText: {
      color: colors.success,
      fontSize: 10,
    },
    guestDivider: {
      marginVertical: 10,
      backgroundColor: colors.border,
    },
    pendingLabel: {
      color: colors.foregroundMuted,
      marginBottom: 10,
    },
    guestContact: {
      color: colors.foregroundMuted,
    },
    pendingChip: {
      backgroundColor: colors.warningBackground,
      height: 22,
    },
    emptyGuests: {
      textAlign: 'center',
      color: colors.foregroundMuted,
      paddingVertical: 15,
    },
    actions: {
      padding: 16,
      gap: 10,
    },
    actionButton: {
      borderRadius: 8,
    },
    primaryButton: {
      backgroundColor: colors.primary,
    },
    cancelButton: {
      borderColor: colors.error,
    },
    cancelledCard: {
      marginHorizontal: 15,
      marginBottom: 15,
      backgroundColor: colors.errorBackground,
    },
    cancelledLabel: {
      fontWeight: '600',
      color: colors.error,
      marginBottom: 5,
    },
  }), [colors]);

  useFocusEffect(
    useCallback(() => {
      loadReservation();
    }, [reservationId])
  );

  const loadReservation = async () => {
    try {
      setLoading(true);
      const data = await ApiService.getReservation(reservationId);
      setReservation(data);
    } catch (error) {
      console.error('Failed to load reservation:', error);
      Alert.alert(t('common.error'), t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReservation();
    setRefreshing(false);
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancelar Reserva',
      'Tem certeza que deseja cancelar esta reserva?',
      [
        { text: 'Não', style: 'cancel' },
        {
          text: 'Sim, cancelar',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              await ApiService.cancelReservation(reservationId);
              await analytics.logEvent('reservation_cancelled', {
                reservation_id: reservationId,
              });
              Alert.alert(t('common.success'), 'Reserva cancelada');
              navigation.goBack();
            } catch (error: any) {
              Alert.alert(t('common.error'), error.response?.data?.message || t('errors.generic'));
            } finally {
              setCancelling(false);
            }
          },
        },
      ]
    );
  };

  const handleInviteGuests = () => {
    navigation.navigate('GuestInvitation', {
      reservationId,
      partySize: reservation?.party_size || 2,
    });
  };

  const handleStartService = async () => {
    try {
      await ApiService.updateReservationStatus(reservationId, 'seated');
      await analytics.logEvent('service_started', {
        reservation_id: reservationId,
      });
      Alert.alert(t('common.success'), 'Serviço iniciado! Você foi marcado como sentado.');
      loadReservation();
    } catch (error: any) {
      Alert.alert(t('common.error'), error.response?.data?.message || t('errors.generic'));
    }
  };

  const handleViewMenu = () => {
    if (reservation?.restaurant_id) {
      navigation.navigate('Menu', { restaurantId: reservation.restaurant_id });
    }
  };

  const handleCallWaiter = () => {
    if (reservation?.restaurant_id) {
      navigation.navigate('CallWaiter', { 
        restaurantId: reservation.restaurant_id,
        reservationId,
      });
    }
  };

  if (loading) {
    return (
      <ScreenContainer>
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    
      </ScreenContainer>
    );
  }

  if (!reservation) {
    return (
      <ScreenContainer>
      <View style={styles.loadingContainer}>
        <Text style={{ color: colors.foreground }}>{t('errors.notFound')}</Text>
      </View>
    
      </ScreenContainer>
    );
  }

  const reservationDateTime = new Date(`${reservation.reservation_date}T${reservation.reservation_time}`);
  const isUpcoming = !isPast(reservationDateTime);
  const minutesUntil = differenceInMinutes(reservationDateTime, new Date());
  const canStartService = reservation.status === 'confirmed' && minutesUntil <= 15;
  const statusConfig = STATUS_CONFIG[reservation.status];
  
  const confirmedGuests = reservation.guests?.filter(g => g.status === 'accepted' || g.is_host) || [];
  const pendingGuests = reservation.guests?.filter(g => g.status === 'pending') || [];

  return (
    <ScreenContainer>
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Status Header */}
      <Card style={[styles.statusCard, { backgroundColor: statusConfig.color }]}>
        <Card.Content>
          <View style={styles.statusHeader}>
            <IconButton icon={statusConfig.icon} size={32} iconColor={colors.premiumCardForeground} accessibilityLabel={`Status: ${statusConfig.label}`} />
            <View style={styles.statusInfo}>
              <Text style={styles.statusLabel}>{statusConfig.label}</Text>
              {isUpcoming && minutesUntil > 0 && (
                <Text style={styles.statusTime}>
                  {minutesUntil < 60 
                    ? `Em ${minutesUntil} minutos`
                    : `Em ${Math.floor(minutesUntil / 60)}h ${minutesUntil % 60}min`
                  }
                </Text>
              )}
            </View>
          </View>
          {reservation.status === 'confirmed' && (
            <View style={styles.progressContainer}>
              <ProgressBar progress={minutesUntil <= 0 ? 1 : Math.max(0, 1 - minutesUntil / 60)} color={colors.premiumCardForeground} />
            </View>
          )}
        </Card.Content>
      </Card>

      {/* Restaurant Info */}
      <Card style={styles.card}>
        <Card.Cover 
          source={reservation.restaurant?.image_url ? { uri: reservation.restaurant.image_url } : undefined} 
          style={styles.restaurantImage}
        />
        <Card.Content style={styles.restaurantContent}>
          <Text variant="titleLarge" style={styles.restaurantName}>
            {reservation.restaurant?.name || 'Restaurante'}
          </Text>
          {reservation.restaurant?.address && (
            <View style={styles.infoRow}>
              <IconButton icon="map-marker" size={16} style={styles.infoIcon} iconColor={colors.foregroundMuted} />
              <Text variant="bodySmall" style={styles.infoText}>
                {reservation.restaurant.address}
              </Text>
            </View>
          )}
          {reservation.restaurant?.phone && (
            <View style={styles.infoRow}>
              <IconButton icon="phone" size={16} style={styles.infoIcon} iconColor={colors.foregroundMuted} />
              <Text variant="bodySmall" style={styles.infoText}>
                {reservation.restaurant.phone}
              </Text>
            </View>
          )}
        </Card.Content>
      </Card>

      {/* Reservation Details */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Detalhes da Reserva
          </Text>
          
          <View style={styles.detailsGrid}>
            <View style={styles.detailItem}>
              <IconButton icon="calendar" size={24} iconColor={colors.primary} />
              <Text variant="bodyMedium" style={styles.detailLabel}>Data</Text>
              <Text variant="bodyLarge" style={styles.detailValue}>
                {format(new Date(reservation.reservation_date), "d 'de' MMMM", { locale: dateFnsPtBR })}
              </Text>
            </View>
            
            <View style={styles.detailItem}>
              <IconButton icon="clock" size={24} iconColor={colors.primary} />
              <Text variant="bodyMedium" style={styles.detailLabel}>Horário</Text>
              <Text variant="bodyLarge" style={styles.detailValue}>
                {reservation.reservation_time.substring(0, 5)}
              </Text>
            </View>
            
            <View style={styles.detailItem}>
              <IconButton icon="account-group" size={24} iconColor={colors.primary} />
              <Text variant="bodyMedium" style={styles.detailLabel}>Pessoas</Text>
              <Text variant="bodyLarge" style={styles.detailValue}>
                {reservation.party_size}
              </Text>
            </View>
          </View>

          {reservation.seating_preference && (
            <View style={styles.additionalInfo}>
              <Text variant="bodyMedium" style={styles.additionalLabel}>Preferência:</Text>
              <Text variant="bodyMedium" style={{ color: colors.foreground }}>{reservation.seating_preference}</Text>
            </View>
          )}

          {reservation.occasion && (
            <View style={styles.additionalInfo}>
              <Text variant="bodyMedium" style={styles.additionalLabel}>Ocasião:</Text>
              <Text variant="bodyMedium" style={{ color: colors.foreground }}>{reservation.occasion}</Text>
            </View>
          )}

          {reservation.special_requests && (
            <View style={styles.specialRequests}>
              <Text variant="bodyMedium" style={styles.additionalLabel}>Pedidos especiais:</Text>
              <Text variant="bodySmall" style={styles.requestsText}>
                {reservation.special_requests}
              </Text>
            </View>
          )}

          {reservation.dietary_restrictions && reservation.dietary_restrictions.length > 0 && (
            <View style={styles.restrictions}>
              <Text variant="bodyMedium" style={styles.additionalLabel}>Restrições alimentares:</Text>
              <View style={styles.restrictionChips}>
                {reservation.dietary_restrictions.map((r, i) => (
                  <Chip key={i} compact style={styles.restrictionChip}>{r}</Chip>
                ))}
              </View>
            </View>
          )}
        </Card.Content>
      </Card>

      {/* Guests Section */}
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.guestHeader}>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Convidados ({confirmedGuests.length + pendingGuests.length})
            </Text>
            {['pending', 'confirmed'].includes(reservation.status) && (
              <Button mode="text" onPress={handleInviteGuests} icon="account-plus" textColor={colors.primary}>
                Convidar
              </Button>
            )}
          </View>

          {/* Confirmed Guests */}
          {confirmedGuests.map((guest) => (
            <View key={guest.id} style={styles.guestItem}>
              <Avatar.Text
                size={40}
                label={(guest.guest_user?.full_name || guest.guest_name || '?').substring(0, 2).toUpperCase()}
                style={[styles.guestAvatar, { backgroundColor: GUEST_STATUS_COLORS[guest.status] }]}
              />
              <View style={styles.guestInfo}>
                <View style={styles.guestNameRow}>
                  <Text variant="bodyLarge" style={styles.guestName}>
                    {guest.guest_user?.full_name || guest.guest_name}
                  </Text>
                  {guest.is_host && (
                    <Chip compact style={styles.hostChip} textStyle={styles.hostChipText}>Host</Chip>
                  )}
                </View>
                {guest.has_arrived && (
                  <Chip compact style={styles.arrivedChip} textStyle={styles.arrivedText}>
                    ✓ Chegou {guest.arrived_at && format(new Date(guest.arrived_at), 'HH:mm')}
                  </Chip>
                )}
              </View>
            </View>
          ))}

          {/* Pending Guests */}
          {pendingGuests.length > 0 && (
            <>
              <Divider style={styles.guestDivider} />
              <Text variant="bodySmall" style={styles.pendingLabel}>Aguardando resposta:</Text>
              {pendingGuests.map((guest) => (
                <View key={guest.id} style={styles.guestItem}>
                  <Avatar.Text
                    size={36}
                    label={(guest.guest_name || '?').substring(0, 2).toUpperCase()}
                    style={[styles.guestAvatar, { backgroundColor: colors.statusPending }]}
                  />
                  <View style={styles.guestInfo}>
                    <Text variant="bodyMedium" style={{ color: colors.foreground }}>{guest.guest_name}</Text>
                    <Text variant="bodySmall" style={styles.guestContact}>
                      {guest.guest_phone || guest.guest_email}
                    </Text>
                  </View>
                  <Chip compact style={styles.pendingChip} textStyle={{ color: colors.warning, fontSize: 10 }}>{t('reservations.status.pending')}</Chip>
                </View>
              ))}
            </>
          )}

          {confirmedGuests.length === 0 && pendingGuests.length === 0 && (
            <Text style={styles.emptyGuests}>{t('reservations.noGuestsAdded')}</Text>
          )}
        </Card.Content>
      </Card>

      {/* Action Buttons */}
      <View style={styles.actions}>
        {canStartService && (
          <Button
            mode="contained"
            onPress={handleStartService}
            style={[styles.actionButton, styles.primaryButton]}
            icon="play"
          >
            Iniciar Serviço
          </Button>
        )}

        {reservation.status === 'seated' && (
          <>
            <Button
              mode="contained"
              onPress={handleViewMenu}
              style={[styles.actionButton, styles.primaryButton]}
              icon="food"
            >
              Ver Cardápio
            </Button>
            <Button
              mode="outlined"
              onPress={handleCallWaiter}
              style={styles.actionButton}
              icon="bell"
              textColor={colors.primary}
            >
              Chamar Garçom
            </Button>
          </>
        )}

        {['pending', 'confirmed'].includes(reservation.status) && (
          <Button
            mode="outlined"
            onPress={handleCancel}
            loading={cancelling}
            disabled={cancelling}
            style={styles.cancelButton}
            textColor={colors.error}
            icon="close"
          >
            Cancelar Reserva
          </Button>
        )}
      </View>

      {/* Cancellation Info */}
      {reservation.status === 'cancelled' && reservation.cancellation_reason && (
        <Card style={styles.cancelledCard}>
          <Card.Content>
            <Text variant="bodyMedium" style={styles.cancelledLabel}>
              Motivo do cancelamento:
            </Text>
            <Text variant="bodySmall" style={{ color: colors.error }}>{reservation.cancellation_reason}</Text>
          </Card.Content>
        </Card>
      )}
    </ScrollView>
  
    </ScreenContainer>
  );
}
