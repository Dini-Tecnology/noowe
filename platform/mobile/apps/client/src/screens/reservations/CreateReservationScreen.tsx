import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Alert, Platform, RefreshControl } from 'react-native';
import { Text, Card, Button, TextInput, IconButton, ActivityIndicator, Divider } from 'react-native-paper';
import { useRoute, useNavigation } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import ApiService from '@/shared/services/api';
import { useScreenTracking, useAnalytics } from '@/shared/hooks/useAnalytics';
import { useI18n } from '@/shared/hooks/useI18n';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import logger from '@okinawa/shared/utils/logger';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { createReservationSchema, validateForm } from '@okinawa/shared/validation/schemas';
import { usePullToRefresh } from '@okinawa/shared/hooks/usePullToRefresh';

interface Restaurant {
  id: string;
  name: string;
  description?: string;
  address?: string;
  phone?: string;
  image_url?: string;
  cuisine_type?: string;
  price_range?: string;
}

export default function CreateReservationScreen() {
  useScreenTracking('Create Reservation');
  const { t } = useI18n();
  const colors = useColors();

  const route = useRoute();
  const navigation = useNavigation();
  const { restaurantId } = route.params as { restaurantId: string };

  const analytics = useAnalytics();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Reservation form
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [partySize, setPartySize] = useState(2);
  const [specialRequests, setSpecialRequests] = useState('');

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.backgroundSecondary,
      padding: 16,
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
    title: {
      marginBottom: 20,
      color: colors.foreground,
    },
    card: {
      marginBottom: 15,
      backgroundColor: colors.card,
    },
    restaurantInfo: {
      paddingTop: 15,
    },
    restaurantName: {
      marginBottom: 5,
      color: colors.foreground,
    },
    restaurantCuisine: {
      color: colors.foregroundMuted,
      marginBottom: 10,
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
    restaurantAddress: {
      color: colors.foregroundMuted,
      flex: 1,
    },
    restaurantPhone: {
      color: colors.foregroundMuted,
    },
    sectionTitle: {
      marginBottom: 20,
      color: colors.foreground,
    },
    formGroup: {
      marginBottom: 20,
    },
    label: {
      marginBottom: 10,
      fontWeight: '600',
      color: colors.foreground,
    },
    dateButton: {
      borderColor: colors.border,
    },
    partySizeControl: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
    },
    partySizeNumber: {
      marginHorizontal: 30,
      fontWeight: 'bold',
      minWidth: 50,
      textAlign: 'center',
      color: colors.foreground,
    },
    textArea: {
      minHeight: 100,
      backgroundColor: colors.card,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    summaryLabel: {
      color: colors.foregroundMuted,
      flex: 1,
    },
    summaryValue: {
      fontWeight: '600',
      flex: 1,
      textAlign: 'right',
      color: colors.foreground,
    },
    divider: {
      marginVertical: 15,
      backgroundColor: colors.border,
    },
    specialRequestsNote: {
      color: colors.foregroundMuted,
      fontStyle: 'italic',
    },
    noteCard: {
      marginBottom: 15,
      backgroundColor: colors.primaryLight,
    },
    noteContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    noteText: {
      flex: 1,
      color: colors.foreground,
    },
    confirmButton: {
      marginBottom: 30,
      backgroundColor: colors.primary,
    },
  }), [colors]);

  useEffect(() => {
    loadRestaurant();
  }, []);

  const loadRestaurant = async () => {
    try {
      setLoading(true);
      const data = await ApiService.getRestaurant(restaurantId);
      setRestaurant(data);
    } catch (error) {
      logger.error('Failed to load restaurant:', error);
      Alert.alert(t('common.error'), t('errors.generic'));
      await analytics.logError('Failed to load restaurant', 'RESTAURANT_LOAD_ERROR', false);
    } finally {
      setLoading(false);
    }
  };

  const pullToRefresh = usePullToRefresh(loadRestaurant);

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setDate(selectedDate);
    }
  };

  const handleTimeChange = (event: any, selectedTime?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (selectedTime) {
      setTime(selectedTime);
    }
  };

  const incrementPartySize = () => {
    if (partySize < 20) {
      setPartySize(partySize + 1);
    }
  };

  const decrementPartySize = () => {
    if (partySize > 1) {
      setPartySize(partySize - 1);
    }
  };

  const validateReservation = () => {
    // Combine date and time
    const reservationDateTime = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      time.getHours(),
      time.getMinutes()
    );

    // Validate with Zod schema
    const result = validateForm(createReservationSchema, {
      restaurantId,
      date: format(date, 'yyyy-MM-dd'),
      time: format(time, 'HH:mm'),
      partySize,
      specialRequests: specialRequests || undefined,
    });

    if (!result.success) {
      Alert.alert(t('common.error'), Object.values(result.errors)[0]);
      return false;
    }

    // Check if reservation is in the past
    if (reservationDateTime < new Date()) {
      Alert.alert(t('common.error'), t('reservations.timeMustBeFuture'));
      return false;
    }

    return true;
  };

  const handleConfirmReservation = async () => {
    if (!validateReservation()) return;

    // Combine date and time
    const reservationDateTime = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      time.getHours(),
      time.getMinutes()
    );

    setSubmitting(true);
    try {
      const reservationData = {
        restaurant_id: restaurantId,
        reservation_time: reservationDateTime.toISOString(),
        party_size: partySize,
        special_requests: specialRequests || undefined,
      };

      const reservation = await ApiService.createReservation(reservationData);

      // Track reservation
      await analytics.logReservation(
        reservation.id || 'unknown',
        restaurantId,
        partySize
      );

      Alert.alert(
        t('common.success'),
        t('reservations.reservationConfirmed'),
        [
          {
            text: t('common.ok'),
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error: any) {
      Alert.alert(
        t('common.error'),
        error.response?.data?.message || t('errors.generic')
      );
      await analytics.logError('Reservation failed', 'RESERVATION_ERROR', false);
    } finally {
      setSubmitting(false);
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

  if (!restaurant) {
    return (
      <ScreenContainer>
      <View style={styles.loadingContainer}>
        <Text style={{ color: colors.foreground }}>{t('errors.notFound')}</Text>
      </View>
    
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer hasKeyboard>
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={pullToRefresh.refreshing} onRefresh={() => { void pullToRefresh.onRefresh(); }} tintColor={colors.primary} colors={[colors.primary]} />}
    >
      <Text variant="headlineSmall" style={styles.title}>
        {t('restaurant.makeReservation')}
      </Text>

      {/* Restaurant Info */}
      <Card style={styles.card}>
        <Card.Cover source={restaurant.image_url ? { uri: restaurant.image_url } : undefined} />
        <Card.Content style={styles.restaurantInfo}>
          <Text variant="titleLarge" style={styles.restaurantName}>
            {restaurant.name}
          </Text>
          {restaurant.cuisine_type && (
            <Text variant="bodyMedium" style={styles.restaurantCuisine}>
              {restaurant.cuisine_type} {restaurant.price_range && `• ${restaurant.price_range}`}
            </Text>
          )}
          {restaurant.address && (
            <View style={styles.infoRow}>
              <IconButton icon="map-marker" size={16} style={styles.infoIcon} iconColor={colors.foregroundMuted} />
              <Text variant="bodySmall" style={styles.restaurantAddress}>
                {restaurant.address}
              </Text>
            </View>
          )}
          {restaurant.phone && (
            <View style={styles.infoRow}>
              <IconButton icon="phone" size={16} style={styles.infoIcon} iconColor={colors.foregroundMuted} />
              <Text variant="bodySmall" style={styles.restaurantPhone}>
                {restaurant.phone}
              </Text>
            </View>
          )}
        </Card.Content>
      </Card>

      {/* Reservation Form */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            {t('reservations.reservationDetails')}
          </Text>

          {/* Date Picker */}
          <View style={styles.formGroup}>
            <Text variant="bodyMedium" style={styles.label}>
              {t('reservations.date')}
            </Text>
            <Button
              mode="outlined"
              onPress={() => setShowDatePicker(true)}
              icon="calendar"
              style={styles.dateButton}
              textColor={colors.foreground}
            >
              {format(date, 'EEEE, MMMM d, yyyy')}
            </Button>
            {showDatePicker && (
              <DateTimePicker
                value={date}
                mode="date"
                display="default"
                onChange={handleDateChange}
                minimumDate={new Date()}
              />
            )}
          </View>

          {/* Time Picker */}
          <View style={styles.formGroup}>
            <Text variant="bodyMedium" style={styles.label}>
              {t('reservations.time')}
            </Text>
            <Button
              mode="outlined"
              onPress={() => setShowTimePicker(true)}
              icon="clock"
              style={styles.dateButton}
              textColor={colors.foreground}
            >
              {format(time, 'h:mm a')}
            </Button>
            {showTimePicker && (
              <DateTimePicker
                value={time}
                mode="time"
                display="default"
                onChange={handleTimeChange}
              />
            )}
          </View>

          {/* Party Size */}
          <View style={styles.formGroup}>
            <Text variant="bodyMedium" style={styles.label}>
              {t('reservations.partySize')}
            </Text>
            <View style={styles.partySizeControl}>
              <IconButton
                icon="minus-circle"
                size={32}
                onPress={decrementPartySize}
                disabled={partySize <= 1}
                iconColor={partySize <= 1 ? colors.foregroundMuted : colors.primary}
                accessibilityLabel="Decrease party size"
                accessibilityRole="button"
              />
              <Text variant="headlineMedium" style={styles.partySizeNumber}>
                {partySize}
              </Text>
              <IconButton
                icon="plus-circle"
                size={32}
                onPress={incrementPartySize}
                disabled={partySize >= 20}
                iconColor={partySize >= 20 ? colors.foregroundMuted : colors.primary}
                accessibilityLabel="Increase party size"
                accessibilityRole="button"
              />
            </View>
          </View>

          {/* Special Requests */}
          <View style={styles.formGroup}>
            <Text variant="bodyMedium" style={styles.label}>
              {t('reservations.specialRequests')} ({t('common.optional')})
            </Text>
            <TextInput
              value={specialRequests}
              onChangeText={setSpecialRequests}
              mode="outlined"
              multiline
              numberOfLines={4}
              placeholder={t('reservations.specialRequestsPlaceholder')}
              style={styles.textArea}
              textColor={colors.foreground}
              placeholderTextColor={colors.foregroundMuted}
              accessibilityLabel="Special requests for the reservation"
            />
          </View>
        </Card.Content>
      </Card>

      {/* Reservation Summary */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            {t('reservations.reservationSummary')}
          </Text>

          <View style={styles.summaryRow}>
            <Text variant="bodyMedium" style={styles.summaryLabel}>
              {t('restaurant.title')}:
            </Text>
            <Text variant="bodyMedium" style={styles.summaryValue}>
              {restaurant.name}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text variant="bodyMedium" style={styles.summaryLabel}>
              {t('reservations.date')}:
            </Text>
            <Text variant="bodyMedium" style={styles.summaryValue}>
              {format(date, 'MMMM d, yyyy')}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text variant="bodyMedium" style={styles.summaryLabel}>
              {t('reservations.time')}:
            </Text>
            <Text variant="bodyMedium" style={styles.summaryValue}>
              {format(time, 'h:mm a')}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text variant="bodyMedium" style={styles.summaryLabel}>
              {t('reservations.partySize')}:
            </Text>
            <Text variant="bodyMedium" style={styles.summaryValue}>
              {partySize} {t('reservations.guests')}
            </Text>
          </View>

          {specialRequests && (
            <>
              <Divider style={styles.divider} />
              <Text variant="bodySmall" style={styles.specialRequestsNote}>
                {t('reservations.specialRequests')}: {specialRequests}
              </Text>
            </>
          )}
        </Card.Content>
      </Card>

      {/* Confirmation Note */}
      <Card style={styles.noteCard}>
        <Card.Content>
          <View style={styles.noteContainer}>
            <IconButton icon="information" size={24} iconColor={colors.primary} />
            <Text variant="bodySmall" style={styles.noteText}>
              {t('reservations.confirmationNote')}
            </Text>
          </View>
        </Card.Content>
      </Card>

      <Button
        mode="contained"
        onPress={handleConfirmReservation}
        loading={submitting}
        disabled={submitting}
        style={styles.confirmButton}
        icon="check"
      >
        {t('reservations.confirmReservation')}
      </Button>
    </ScrollView>
  
    </ScreenContainer>
  );
}
