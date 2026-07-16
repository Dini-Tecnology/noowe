/**
 * BirthdayBookingScreen - Birthday Package Booking
 *
 * Allows customers to book a birthday celebration package at a club.
 * Includes date picker, party size, package selection (basic/premium/vip),
 * celebrant name, and optional message. Shows confirmation with reference.
 *
 * @module client/screens/club
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import {
  Text,
  Button,
  Card,
  TextInput,
  IconButton,
  Chip,
  ActivityIndicator,
  SegmentedButtons,
} from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation } from '@tanstack/react-query';
import { t, getLanguage } from '@okinawa/shared/i18n';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { formatCurrency } from '@okinawa/shared/utils/formatters';
import { ApiService } from '@okinawa/shared/services/api';
import * as Haptics from 'expo-haptics';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';

// ============================================
// TYPES
// ============================================

interface BirthdayPackage {
  id: string;
  name: string;
  tier: 'basic' | 'premium' | 'vip';
  price: number;
  includes: string[];
  description: string;
  maxPartySize: number;
}

interface BookingConfirmation {
  id: string;
  referenceCode: string;
  packageName: string;
  date: string;
  partySize: number;
  totalPrice: number;
}

interface BirthdayBookingScreenProps {
  route?: {
    params?: {
      restaurantId: string;
    };
  };
}

// ============================================
// SKELETON
// ============================================

function BookingSkeleton({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{ padding: 16, gap: 16 }}>
      {[1, 2, 3].map((i) => (
        <View
          key={i}
          style={{
            backgroundColor: colors.card,
            borderRadius: 16,
            padding: 20,
            gap: 12,
          }}
        >
          <View style={{ width: '60%', height: 20, borderRadius: 4, backgroundColor: colors.backgroundTertiary }} />
          <View style={{ width: '80%', height: 14, borderRadius: 4, backgroundColor: colors.backgroundTertiary }} />
          <View style={{ width: '40%', height: 14, borderRadius: 4, backgroundColor: colors.backgroundTertiary }} />
          <View style={{ width: '30%', height: 20, borderRadius: 4, backgroundColor: colors.backgroundTertiary }} />
        </View>
      ))}
    </View>
  );
}

// ============================================
// CONFIRMATION VIEW
// ============================================

function ConfirmationView({
  booking,
  colors,
  onDone,
}: {
  booking: BookingConfirmation;
  colors: ReturnType<typeof useColors>;
  onDone: () => void;
}) {
  const formattedDate = new Date(booking.date).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return (
    <View style={[confirmStyles.container, { backgroundColor: colors.background }]}>
      <View style={confirmStyles.content}>
        <Text style={{ fontSize: 64, textAlign: 'center', marginBottom: 16 }}>
          🎂
        </Text>
        <Text
          variant="headlineMedium"
          style={{ color: colors.foreground, textAlign: 'center', fontWeight: '700' }}
        >
          {t('club.birthday.confirmed')}
        </Text>

        <Card style={[confirmStyles.card, { backgroundColor: colors.card }]} mode="elevated">
          <Card.Content style={confirmStyles.cardContent}>
            <View style={confirmStyles.row}>
              <Text variant="bodyMedium" style={{ color: colors.foregroundSecondary }}>
                {t('club.birthday.reference')}
              </Text>
              <Text variant="titleMedium" style={{ color: colors.primary, fontWeight: '700' }}>
                {booking.referenceCode}
              </Text>
            </View>
            <View style={confirmStyles.row}>
              <Text variant="bodyMedium" style={{ color: colors.foregroundSecondary }}>
                {t('club.birthday.package')}
              </Text>
              <Text variant="bodyMedium" style={{ color: colors.foreground, fontWeight: '600' }}>
                {booking.packageName}
              </Text>
            </View>
            <View style={confirmStyles.row}>
              <Text variant="bodyMedium" style={{ color: colors.foregroundSecondary }}>
                {t('club.birthday.date')}
              </Text>
              <Text variant="bodyMedium" style={{ color: colors.foreground, fontWeight: '600' }}>
                {formattedDate}
              </Text>
            </View>
            <View style={confirmStyles.row}>
              <Text variant="bodyMedium" style={{ color: colors.foregroundSecondary }}>
                {t('club.birthday.partySize')}
              </Text>
              <Text variant="bodyMedium" style={{ color: colors.foreground, fontWeight: '600' }}>
                {booking.partySize}
              </Text>
            </View>
            <View style={[confirmStyles.row, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, marginTop: 4 }]}>
              <Text variant="titleMedium" style={{ color: colors.foreground, fontWeight: '700' }}>
                {t('club.birthday.total')}
              </Text>
              <Text variant="titleLarge" style={{ color: colors.primary, fontWeight: '700' }}>
                {formatCurrency(booking.totalPrice, getLanguage())}
              </Text>
            </View>
          </Card.Content>
        </Card>

        <Button mode="contained" onPress={onDone} style={confirmStyles.doneBtn}>
          {t('common.done')}
        </Button>
      </View>
    </View>
  );
}

const confirmStyles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  content: { gap: 16 },
  card: { borderRadius: 16, marginVertical: 8 },
  cardContent: { gap: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  doneBtn: { marginTop: 12, borderRadius: 8 },
});

// ============================================
// PACKAGE CARD
// ============================================

function PackageCard({
  pkg,
  isSelected,
  colors,
  onSelect,
}: {
  pkg: BirthdayPackage;
  isSelected: boolean;
  colors: ReturnType<typeof useColors>;
  onSelect: (pkg: BirthdayPackage) => void;
}) {
  const tierColors: Record<string, string> = {
    basic: colors.foregroundSecondary,
    premium: colors.warning,
    vip: colors.statusDelivering,
  };

  return (
    <TouchableOpacity
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onSelect(pkg);
      }}
      activeOpacity={0.7}
      accessibilityLabel={`${pkg.name} ${pkg.tier} package`}
    >
      <Card
        style={[
          styles.packageCard,
          {
            backgroundColor: colors.card,
            borderColor: isSelected ? colors.primary : 'transparent',
            borderWidth: isSelected ? 2 : 0,
          },
        ]}
        mode="elevated"
      >
        <Card.Content style={styles.packageContent}>
          <View style={styles.packageHeader}>
            <View style={{ flex: 1 }}>
              <Chip
                mode="flat"
                compact
                textStyle={{ color: colors.premiumCardForeground, fontSize: 10, fontWeight: '700' }}
                style={{ backgroundColor: tierColors[pkg.tier] || colors.primary, alignSelf: 'flex-start', marginBottom: 8 }}
              >
                {pkg.tier.toUpperCase()}
              </Chip>
              <Text
                variant="titleMedium"
                style={{ color: colors.foreground, fontWeight: '700' }}
              >
                {pkg.name}
              </Text>
              <Text
                variant="bodySmall"
                style={{ color: colors.foregroundSecondary, marginTop: 4 }}
              >
                {pkg.description}
              </Text>
            </View>
            <View style={styles.priceContainer}>
              <Text variant="titleLarge" style={{ color: colors.primary, fontWeight: '700' }}>
                {formatCurrency(pkg.price, getLanguage())}
              </Text>
              <Text variant="bodySmall" style={{ color: colors.foregroundMuted }}>
                {t('club.birthday.perPerson')}
              </Text>
            </View>
          </View>

          {/* Includes */}
          <View style={styles.includesContainer}>
            {pkg.includes.map((item, idx) => (
              <View key={idx} style={styles.includeRow}>
                <Text style={{ color: colors.success, fontSize: 14, marginRight: 6 }}>✓</Text>
                <Text variant="bodySmall" style={{ color: colors.foregroundSecondary }}>
                  {item}
                </Text>
              </View>
            ))}
          </View>

          {isSelected && (
            <View style={[styles.selectedBadge, { backgroundColor: colors.primary }]}>
              <Text style={{ color: colors.premiumCardForeground, fontSize: 12, fontWeight: '600' }}>
                {t('club.birthday.selected')}
              </Text>
            </View>
          )}
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function BirthdayBookingScreen({ route }: BirthdayBookingScreenProps) {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const restaurantId = route?.params?.restaurantId || '';

  const [selectedPackage, setSelectedPackage] = useState<BirthdayPackage | null>(null);
  const [partySize, setPartySize] = useState(10);
  const [celebrantName, setCelebrantName] = useState('');
  const [message, setMessage] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [bookingResult, setBookingResult] = useState<BookingConfirmation | null>(null);

  // Fetch packages with dynamic pricing based on party size and date
  const {
    data: packages,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<BirthdayPackage[]>({
    queryKey: ['birthday-packages', restaurantId, partySize, selectedDate],
    queryFn: async () => {
      const params = new URLSearchParams({ partySize: String(partySize) });
      if (selectedDate) params.append('date', selectedDate);
      const response = await ApiService.get(
        `/clubs/birthday-packages/${restaurantId}?${params.toString()}`,
      );
      return response.data || [];
    },
    enabled: !!restaurantId,
  });

  // Submit booking mutation
  const bookingMutation = useMutation({
    mutationFn: async () => {
      const response = await ApiService.post('/clubs/birthday-bookings', {
        restaurantId,
        packageId: selectedPackage?.id,
        partySize,
        celebrantName: celebrantName.trim(),
        message: message.trim(),
        date: selectedDate,
      });
      return response.data as BookingConfirmation;
    },
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setBookingResult(data);
    },
    onError: (error: Error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(t('common.error'), error.message || t('club.birthday.bookingError') || t('common.error'));
    },
  });

  const handlePartySizeChange = useCallback((delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPartySize((prev) => Math.max(1, Math.min(50, prev + delta)));
  }, []);

  const handleSubmit = useCallback(() => {
    if (!selectedPackage) {
      Alert.alert(t('common.error'), t('club.birthday.selectPackage'));
      return;
    }
    if (!celebrantName.trim()) {
      Alert.alert(t('common.error'), t('common.required'));
      return;
    }
    if (!selectedDate) {
      Alert.alert(t('common.error'), t('club.birthday.selectDate'));
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    bookingMutation.mutate();
  }, [selectedPackage, celebrantName, selectedDate, bookingMutation]);

  const handleDone = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const totalPrice = useMemo(() => {
    if (!selectedPackage) return 0;
    return selectedPackage.price * partySize;
  }, [selectedPackage, partySize]);

  // Date options (next 30 days)
  const dateOptions = useMemo(() => {
    const dates: { label: string; value: string }[] = [];
    const today = new Date();
    for (let i = 1; i <= 30; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const isoDate = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('pt-BR', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
      });
      dates.push({ label, value: isoDate });
    }
    return dates;
  }, []);

  // Show confirmation
  if (bookingResult) {
    return (
      <ScreenContainer>
      <ConfirmationView
        booking={bookingResult}
        colors={colors}
        onDone={handleDone}
      />
    
      </ScreenContainer>
    );
  }

  if (isLoading) {
    return (
      <ScreenContainer>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Text
            variant="headlineMedium"
            style={{ color: colors.foreground, fontWeight: '700' }}
          >
            {t('club.birthday.title')}
          </Text>
          <Text
            variant="bodyMedium"
            style={{ color: colors.foregroundSecondary }}
          >
            {t('club.birthday.subtitle')}
          </Text>
        </View>
        <BookingSkeleton colors={colors} />
      </View>
    
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer hasKeyboard>
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} tintColor={colors.primary} colors={[colors.primary]} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text
          variant="headlineMedium"
          style={{ color: colors.foreground, fontWeight: '700' }}
        >
          {t('club.birthday.title')}
        </Text>
        <Text
          variant="bodyMedium"
          style={{ color: colors.foregroundSecondary }}
        >
          {t('club.birthday.subtitle')}
        </Text>
      </View>

      {/* Date Selection */}
      <View style={styles.section}>
        <Text
          variant="titleMedium"
          style={{ color: colors.foreground, fontWeight: '600', marginBottom: 12 }}
        >
          {t('club.birthday.date')}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateScroll}>
          {dateOptions.map((d) => (
            <TouchableOpacity
              key={d.value}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedDate(d.value);
              }}
              accessibilityLabel={`Select date ${d.label}`}
              style={[
                styles.dateChip,
                {
                  backgroundColor: selectedDate === d.value ? colors.primary : colors.card,
                  borderColor: selectedDate === d.value ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                variant="bodySmall"
                style={{
                  color: selectedDate === d.value ? colors.premiumCardForeground : colors.foreground,
                  fontWeight: selectedDate === d.value ? '700' : '400',
                }}
              >
                {d.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Party Size */}
      <View style={styles.section}>
        <Text
          variant="titleMedium"
          style={{ color: colors.foreground, fontWeight: '600', marginBottom: 12 }}
        >
          {t('club.birthday.partySize')}
        </Text>
        <View style={styles.quantityRow}>
          <IconButton
            icon="minus"
            mode="contained-tonal"
            onPress={() => handlePartySizeChange(-1)}
            disabled={partySize <= 1}
            size={24}
            accessibilityLabel="Decrease party size"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          />
          <Text
            variant="headlineMedium"
            style={{ color: colors.foreground, fontWeight: '700', minWidth: 48, textAlign: 'center' }}
          >
            {partySize}
          </Text>
          <IconButton
            icon="plus"
            mode="contained-tonal"
            onPress={() => handlePartySizeChange(1)}
            disabled={partySize >= 50}
            size={24}
            accessibilityLabel="Increase party size"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          />
        </View>
      </View>

      {/* Package Selection */}
      <View style={styles.section}>
        <Text
          variant="titleMedium"
          style={{ color: colors.foreground, fontWeight: '600', marginBottom: 12 }}
        >
          {t('club.birthday.package')}
        </Text>
        {(!packages || packages.length === 0) ? (
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>🎂</Text>
            <Text
              variant="bodyLarge"
              style={{ color: colors.foregroundMuted, textAlign: 'center' }}
            >
              {t('club.birthday.noPackages')}
            </Text>
          </View>
        ) : (
          packages.map((pkg) => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              isSelected={selectedPackage?.id === pkg.id}
              colors={colors}
              onSelect={setSelectedPackage}
            />
          ))
        )}
      </View>

      {/* Celebrant Name */}
      <View style={styles.section}>
        <TextInput
          label={t('club.birthday.name')}
          value={celebrantName}
          onChangeText={setCelebrantName}
          mode="outlined"
          style={styles.input}
        />
      </View>

      {/* Message */}
      <View style={styles.section}>
        <TextInput
          label={t('club.birthday.message')}
          value={message}
          onChangeText={setMessage}
          mode="outlined"
          multiline
          numberOfLines={3}
          style={styles.input}
        />
      </View>

      {/* Price Summary */}
      {selectedPackage && (
        <Card style={[styles.summaryCard, { backgroundColor: colors.card }]} mode="elevated">
          <Card.Content style={styles.summaryContent}>
            <Text
              variant="titleMedium"
              style={{ color: colors.foreground, fontWeight: '600' }}
            >
              {t('club.birthday.summary')}
            </Text>
            <View style={styles.summaryRow}>
              <Text variant="bodyMedium" style={{ color: colors.foregroundSecondary }}>
                {t('club.birthday.package')}
              </Text>
              <Text variant="bodyMedium" style={{ color: colors.foreground }}>
                {selectedPackage.name}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text variant="bodyMedium" style={{ color: colors.foregroundSecondary }}>
                {t('club.birthday.partySize')}
              </Text>
              <Text variant="bodyMedium" style={{ color: colors.foreground }}>
                {partySize}x {formatCurrency(selectedPackage.price, getLanguage())}
              </Text>
            </View>
            <View style={[styles.summaryRow, styles.totalRow, { borderTopColor: colors.border }]}>
              <Text variant="titleMedium" style={{ color: colors.foreground, fontWeight: '700' }}>
                {t('club.birthday.total')}
              </Text>
              <Text variant="titleLarge" style={{ color: colors.primary, fontWeight: '700' }}>
                {formatCurrency(totalPrice, getLanguage())}
              </Text>
            </View>
          </Card.Content>
        </Card>
      )}

      {/* Submit Button */}
      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={bookingMutation.isPending}
        disabled={bookingMutation.isPending || !selectedPackage}
        style={styles.submitBtn}
        labelStyle={styles.submitBtnLabel}
        contentStyle={styles.submitBtnContent}
      >
        {t('club.birthday.submit')}
      </Button>
    </ScrollView>
  
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
  content: {
    paddingBottom: 40,
    gap: 8,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  dateScroll: {
    flexGrow: 0,
  },
  dateChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginRight: 8,
    borderWidth: 1,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  packageCard: {
    borderRadius: 16,
    marginBottom: 12,
  },
  packageContent: {
    gap: 12,
  },
  packageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  priceContainer: {
    alignItems: 'flex-end',
  },
  includesContainer: {
    gap: 6,
  },
  includeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedBadge: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: 4,
  },
  input: {
    marginBottom: 4,
  },
  summaryCard: {
    marginHorizontal: 16,
    borderRadius: 16,
  },
  summaryContent: {
    gap: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalRow: {
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 4,
  },
  submitBtn: {
    marginHorizontal: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  submitBtnLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  submitBtnContent: {
    height: 52,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
  },
});
