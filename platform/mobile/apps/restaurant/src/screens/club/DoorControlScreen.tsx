/**
 * DoorControlScreen - Door Staff QR Check-in/Check-out
 *
 * Provides QR scanning for entry validation at the venue door.
 * Displays validation results (valid/invalid/already used),
 * guest info, admission counter, and manual search fallback.
 *
 * @module restaurant/screens/club
 */

import React, { useState, useCallback } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  TextInput as RNTextInput,
} from 'react-native';
import {
  Text,
  Button,
  Card,
  Chip,
  IconButton,
  TextInput,
  ActivityIndicator,
} from 'react-native-paper';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { t } from '@okinawa/shared/i18n';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import ApiService from '@/shared/services/api';

// ============================================
// TYPES
// ============================================

type ScanResultStatus = 'valid' | 'invalid' | 'already_used' | null;

interface ScanResult {
  status: ScanResultStatus;
  data?: {
    entryId: string;
    userId: string;
    entryType: string;
    quantity: number;
    customerName?: string;
    isBirthday?: boolean;
  };
  error?: string;
}

interface OccupancyData {
  current: number;
  capacity: number;
}

interface DoorControlScreenProps {
  route?: {
    params?: {
      restaurantId: string;
    };
  };
}

// ============================================
// HAPTIC HELPER
// ============================================

function triggerHaptic(type: 'success' | 'error' | 'warning') {
  try {
    if (Platform.OS === 'ios') {
      const ReactNativeHapticFeedback = require('react-native-haptic-feedback');
      const hapticType =
        type === 'success'
          ? 'notificationSuccess'
          : type === 'error'
          ? 'notificationError'
          : 'notificationWarning';
      ReactNativeHapticFeedback.trigger(hapticType);
    }
  } catch {
    // Haptic not available
  }
}

// ============================================
// SCAN RESULT DISPLAY
// ============================================

function ScanResultDisplay({
  result,
  colors,
  onCheckIn,
  isCheckingIn,
}: {
  result: ScanResult;
  colors: ReturnType<typeof useColors>;
  onCheckIn: () => void;
  isCheckingIn: boolean;
}) {
  if (!result.status) return null;

  const statusConfig = {
    valid: {
      color: colors.success,
      label: t('club.door.valid'),
      icon: '✓',
      bgColor: colors.success + '15',
    },
    invalid: {
      color: colors.error,
      label: t('club.door.invalid'),
      icon: '✕',
      bgColor: colors.error + '15',
    },
    already_used: {
      color: colors.warning,
      label: t('club.door.alreadyUsed'),
      icon: '!',
      bgColor: colors.statusPendingBackground,
    },
  };

  const config = statusConfig[result.status];

  return (
    <Card
      style={[styles.resultCard, { backgroundColor: config.bgColor, borderColor: config.color, borderWidth: 2 }]}
      mode="elevated"
    >
      <Card.Content style={styles.resultContent}>
        {/* Status Badge */}
        <View style={[styles.statusBadge, { backgroundColor: config.color }]}>
          <Text style={styles.statusIcon}>{config.icon}</Text>
        </View>
        <Text
          variant="titleLarge"
          style={{ color: config.color, fontWeight: '800', textAlign: 'center' }}
        >
          {config.label}
        </Text>

        {/* Guest Info */}
        {result.status === 'valid' && result.data && (
          <View style={styles.guestInfo}>
            <Text
              variant="titleSmall"
              style={{ color: colors.foreground, fontWeight: '600', marginBottom: 8 }}
            >
              {t('club.door.guestInfo')}
            </Text>

            <View style={styles.guestRow}>
              <Text variant="bodyMedium" style={{ color: colors.foregroundSecondary }}>
                {t('club.ticket.type')}
              </Text>
              <Chip mode="flat" compact>
                {result.data.entryType.toUpperCase()}
              </Chip>
            </View>

            <View style={styles.guestRow}>
              <Text variant="bodyMedium" style={{ color: colors.foregroundSecondary }}>
                {t('club.ticket.quantity')}
              </Text>
              <Text variant="bodyMedium" style={{ color: colors.foreground, fontWeight: '600' }}>
                {result.data.quantity}
              </Text>
            </View>

            {result.data.customerName && (
              <View style={styles.guestRow}>
                <Text variant="bodyMedium" style={{ color: colors.foregroundSecondary }}>
                  {t('auth.fullName')}
                </Text>
                <Text variant="bodyMedium" style={{ color: colors.foreground, fontWeight: '600' }}>
                  {result.data.customerName}
                </Text>
              </View>
            )}

            {result.data.isBirthday && (
              <Chip
                mode="flat"
                style={{ backgroundColor: colors.statusPendingBackground, alignSelf: 'flex-start', marginTop: 4 }}
                textStyle={{ color: colors.warning }}
                compact
              >
                🎂 {t('club.birthday.title')}
              </Chip>
            )}

            {/* Check-in Button */}
            <Button
              mode="contained"
              onPress={onCheckIn}
              loading={isCheckingIn}
              disabled={isCheckingIn}
              style={[styles.checkInBtn, { backgroundColor: colors.success }]}
              labelStyle={{ color: colors.premiumCardForeground, fontWeight: '700' }}
              accessibilityRole="button"
              accessibilityLabel="Confirm guest check-in"
            >
              {t('club.door.admitted')}
            </Button>
          </View>
        )}

        {result.error && (
          <Text
            variant="bodyMedium"
            style={{ color: config.color, textAlign: 'center', marginTop: 8 }}
          >
            {result.error}
          </Text>
        )}
      </Card.Content>
    </Card>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function DoorControlScreen({ route }: DoorControlScreenProps) {
  const colors = useColors();
  const queryClient = useQueryClient();

  const restaurantId = route?.params?.restaurantId || '';

  const [scanResult, setScanResult] = useState<ScanResult>({ status: null });
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Occupancy data
  const { data: occupancy } = useQuery<OccupancyData>({
    queryKey: ['club-occupancy', restaurantId],
    queryFn: async () => {
      const response = await ApiService.get(
        `/occupancy/restaurant/${restaurantId}/current`,
      );
      return response.data;
    },
    enabled: !!restaurantId,
    refetchInterval: 30000, // Refresh every 30s
  });

  // Validate QR mutation
  const validateMutation = useMutation({
    mutationFn: async (qrPayload: string) => {
      const response = await ApiService.post('/qr-codes/validate', {
        qrPayload,
      });
      return response.data;
    },
    onSuccess: (data) => {
      if (data.valid) {
        triggerHaptic('success');
        setScanResult({
          status: 'valid',
          data: data.data,
        });
      } else if (data.error?.includes('already')) {
        triggerHaptic('warning');
        setScanResult({
          status: 'already_used',
          error: data.error,
        });
      } else {
        triggerHaptic('error');
        setScanResult({
          status: 'invalid',
          error: data.error || t('club.door.invalid'),
        });
      }
    },
    onError: (error: Error) => {
      triggerHaptic('error');
      setScanResult({
        status: 'invalid',
        error: error.message,
      });
    },
  });

  // Mark as used (check-in) mutation
  const checkInMutation = useMutation({
    mutationFn: async (entryId: string) => {
      const response = await ApiService.post(`/qr-codes/use/${entryId}`, {
        type: scanResult.data?.entryType || 'ticket',
      });
      return response.data;
    },
    onSuccess: () => {
      triggerHaptic('success');
      Alert.alert(t('common.success'), t('club.door.admitted'));
      setScanResult({ status: null });
      queryClient.invalidateQueries({ queryKey: ['club-occupancy'] });
    },
    onError: (error: Error) => {
      Alert.alert(t('common.error'), error.message);
    },
  });

  const handleScanQR = useCallback(() => {
    // In a real implementation, this would open the camera scanner.
    // For now, we simulate with a prompt.
    Alert.prompt?.(
      t('club.door.scan'),
      t('club.door.scanResult'),
      (qrPayload: string) => {
        if (qrPayload) {
          validateMutation.mutate(qrPayload);
        }
      },
    );
  }, [validateMutation]);

  const handleCheckIn = useCallback(() => {
    if (scanResult.data?.entryId) {
      checkInMutation.mutate(scanResult.data.entryId);
    }
  }, [scanResult, checkInMutation]);

  const handleManualSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const dateStr = new Date().toISOString().split('T')[0];
      const response = await ApiService.get(
        `/club-entries/restaurant/${restaurantId}/event/${dateStr}?search=${searchQuery.trim()}`,
      );
      if (response.data) {
        setScanResult({
          status: 'valid',
          data: response.data,
        });
        triggerHaptic('success');
      } else {
        setScanResult({
          status: 'invalid',
          error: t('common.noResults'),
        });
        triggerHaptic('error');
      }
    } catch (error) {
      Alert.alert(t('common.error'), (error as Error).message);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, restaurantId]);

  const handleClearResult = useCallback(() => {
    setScanResult({ status: null });
  }, []);

  return (
    <ScreenContainer hasKeyboard>
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text
          variant="headlineMedium"
          style={{ color: colors.foreground, fontWeight: '700' }}
        >
          {t('club.door.title')}
        </Text>
      </View>

      {/* Occupancy Counter */}
      <Card style={[styles.occupancyCard, { backgroundColor: colors.card }]} mode="elevated">
        <Card.Content style={styles.occupancyContent}>
          <View style={styles.occupancyItem}>
            <Text
              variant="headlineLarge"
              style={{ color: colors.primary, fontWeight: '800' }}
            >
              {occupancy?.current ?? 0}
            </Text>
            <Text variant="bodySmall" style={{ color: colors.foregroundSecondary }}>
              {t('club.door.admitted')}
            </Text>
          </View>
          <View style={styles.occupancyDivider} />
          <View style={styles.occupancyItem}>
            <Text
              variant="headlineLarge"
              style={{ color: colors.foregroundMuted, fontWeight: '800' }}
            >
              {occupancy?.capacity ?? '-'}
            </Text>
            <Text variant="bodySmall" style={{ color: colors.foregroundSecondary }}>
              {t('club.door.capacity')}
            </Text>
          </View>
        </Card.Content>
      </Card>

      {/* QR Scanner Button */}
      <Button
        mode="contained"
        onPress={handleScanQR}
        loading={validateMutation.isPending}
        style={styles.scanBtn}
        contentStyle={styles.scanBtnContent}
        labelStyle={styles.scanBtnLabel}
        icon="qrcode-scan"
        accessibilityRole="button"
        accessibilityLabel="Scan QR code for entry validation"
      >
        {t('club.door.scan')}
      </Button>

      {/* Scan Result */}
      {scanResult.status && (
        <>
          <ScanResultDisplay
            result={scanResult}
            colors={colors}
            onCheckIn={handleCheckIn}
            isCheckingIn={checkInMutation.isPending}
          />
          <Button
            mode="text"
            onPress={handleClearResult}
            style={styles.clearBtn}
            accessibilityRole="button"
            accessibilityLabel="Clear scan result"
          >
            {t('common.clear')}
          </Button>
        </>
      )}

      {/* Manual Search */}
      <Card style={[styles.searchCard, { backgroundColor: colors.card }]} mode="elevated">
        <Card.Content>
          <Text
            variant="titleSmall"
            style={{ color: colors.foreground, fontWeight: '600', marginBottom: 12 }}
          >
            {t('club.door.manualSearch')}
          </Text>
          <View style={styles.searchRow}>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t('common.search')}
              mode="outlined"
              style={styles.searchInput}
              dense
              accessibilityLabel="Search guest by name or ticket"
            />
            <Button
              mode="contained-tonal"
              onPress={handleManualSearch}
              loading={isSearching}
              disabled={isSearching || !searchQuery.trim()}
              compact
              accessibilityRole="button"
              accessibilityLabel="Search for guest manually"
            >
              {t('common.search')}
            </Button>
          </View>
        </Card.Content>
      </Card>
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
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  header: {
    paddingVertical: 4,
  },
  occupancyCard: {
    borderRadius: 16,
  },
  occupancyContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  occupancyItem: {
    flex: 1,
    alignItems: 'center',
  },
  occupancyDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.muted,
    marginHorizontal: 16,
  },
  scanBtn: {
    borderRadius: 16,
  },
  scanBtnContent: {
    height: 64,
  },
  scanBtnLabel: {
    fontSize: 18,
    fontWeight: '700',
  },
  resultCard: {
    borderRadius: 16,
  },
  resultContent: {
    alignItems: 'center',
    gap: 12,
    padding: 24,
  },
  statusBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusIcon: {
    color: colors.premiumCardForeground,
    fontSize: 32,
    fontWeight: '800',
  },
  guestInfo: {
    width: '100%',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  guestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  checkInBtn: {
    borderRadius: 12,
    marginTop: 12,
  },
  clearBtn: {
    alignSelf: 'center',
  },
  searchCard: {
    borderRadius: 16,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
  },
});
