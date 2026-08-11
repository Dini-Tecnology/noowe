/**
 * ClubQueueScreen - Virtual Queue Position Tracker
 *
 * Displays the user's position in the club virtual queue with
 * real-time WebSocket updates, animated position number,
 * estimated wait time, and anti-fraud QR for door scan.
 *
 * @module client/screens/club
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  Animated,
  Platform,
} from 'react-native';
import {
  Text,
  Button,
  Card,
  ActivityIndicator,
  SegmentedButtons,
} from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { t } from '@okinawa/shared/i18n';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { useWebSocket } from '@okinawa/shared/hooks/useWebSocket';
import { useAuth } from '@okinawa/shared/hooks/useAuth';
import { ApiService } from '@okinawa/shared/services/api';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';

// ============================================
// TYPES
// ============================================

interface QueueEntry {
  id: string;
  position: number;
  estimatedWaitMinutes: number | null;
  status: 'waiting' | 'called' | 'admitted' | 'no_show' | 'left';
  partySize: number;
  qrCode?: string;
  qrPayload?: string;
}

interface ClubQueueScreenProps {
  route?: {
    params?: {
      restaurantId: string;
      eventId: string;
      eventName: string;
    };
  };
}

// ============================================
// HAPTIC HELPER
// ============================================

function triggerHaptic() {
  try {
    if (Platform.OS === 'ios') {
      const ReactNativeHapticFeedback = require('react-native-haptic-feedback');
      ReactNativeHapticFeedback.trigger('notificationSuccess');
    }
  } catch {
    // Haptic not available
  }
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function ClubQueueScreen({ route }: ClubQueueScreenProps) {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const restaurantId = route?.params?.restaurantId || '';
  const eventName = route?.params?.eventName || '';

  const [queueEntry, setQueueEntry] = useState<QueueEntry | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [selectedArea, setSelectedArea] = useState('pista');

  const areaButtons = [
    { value: 'pista', label: t('club.areas.pista') },
    { value: 'vip', label: t('club.areas.vip') },
    { value: 'rooftop', label: t('club.areas.rooftop') },
  ];
  const { connected, on, off, emit } = useWebSocket('/queue');
  const positionAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const prevPositionRef = useRef<number | null>(null);

  // Pulse animation for called state
  useEffect(() => {
    if (queueEntry?.status === 'called') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [queueEntry?.status, pulseAnim]);

  // Fetch current position
  const { isLoading } = useQuery({
    queryKey: ['club-queue-position', restaurantId],
    queryFn: async () => {
      const response = await ApiService.get(
        `/queue/my?restaurantId=${restaurantId}`,
      );
      if (response.data) {
        setQueueEntry(response.data);
      }
      return response.data;
    },
    enabled: !!restaurantId,
  });

  // WebSocket connection
  useEffect(() => {
    if (!restaurantId || !user?.id || !connected) return;

    emit('joinQueueRoom', restaurantId);
    emit('subscribeToMyPosition', {
      restaurantId,
      userId: user.id,
    });

    const onPositionUpdate = (data: { data: Partial<QueueEntry> }) => {
      setQueueEntry((prev) => {
        if (!prev) return prev;
        const newPosition = data.data.position ?? prev.position;

        // Haptic on position change
        if (prevPositionRef.current !== null && prevPositionRef.current !== newPosition) {
          triggerHaptic();
          Animated.sequence([
            Animated.timing(positionAnim, {
              toValue: 0.8,
              duration: 100,
              useNativeDriver: true,
            }),
            Animated.spring(positionAnim, {
              toValue: 1,
              friction: 3,
              useNativeDriver: true,
            }),
          ]).start();
        }
        prevPositionRef.current = newPosition;

        return { ...prev, ...data.data };
      });
    };

    const onCalled = () => {
      triggerHaptic();
      setQueueEntry((prev) =>
        prev ? { ...prev, status: 'called' } : prev,
      );
    };

    on('positionUpdate', onPositionUpdate);
    on('called', onCalled);

    return () => {
      off('positionUpdate', onPositionUpdate);
      off('called', onCalled);
      emit('leaveQueueRoom', restaurantId);
    };
  }, [restaurantId, user?.id, positionAnim, connected, emit, on, off]);

  // Join queue mutation
  const joinQueueMutation = useMutation({
    mutationFn: async () => {
      const response = await ApiService.post('/queue', {
        restaurantId,
        partySize: 1,
        area: selectedArea,
      });
      return response.data as QueueEntry;
    },
    onSuccess: (data) => {
      setQueueEntry(data);
      prevPositionRef.current = data.position;
      queryClient.invalidateQueries({ queryKey: ['club-queue-position'] });
    },
    onError: (error: Error) => {
      Alert.alert(t('common.error'), error.message);
    },
  });

  // Leave queue mutation
  const leaveQueueMutation = useMutation({
    mutationFn: async () => {
      await ApiService.delete(`/queue/my?restaurantId=${restaurantId}`);
    },
    onSuccess: () => {
      setQueueEntry(null);
      prevPositionRef.current = null;
      queryClient.invalidateQueries({ queryKey: ['club-queue-position'] });
    },
    onError: (error: Error) => {
      Alert.alert(t('common.error'), error.message);
    },
  });

  const handleJoinQueue = useCallback(() => {
    joinQueueMutation.mutate();
  }, [joinQueueMutation]);

  const handleLeaveQueue = useCallback(() => {
    Alert.alert(
      t('club.queueSection.leave'),
      t('club.queueSection.leaveConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          style: 'destructive',
          onPress: () => leaveQueueMutation.mutate(),
        },
      ],
    );
  }, [leaveQueueMutation]);

  const handleAtDoor = useCallback(() => {
    Alert.alert(
      t('club.queueSection.yourTurn'),
      t('club.queueSection.atDoor'),
      [{ text: t('common.ok') }],
    );
  }, []);

  // Not in queue yet - show join screen
  if (!queueEntry && !isLoading) {
    return (
      <ScreenContainer>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.joinContainer}>
          <Text style={{ fontSize: 64, textAlign: 'center', marginBottom: 16 }}>
            🎶
          </Text>
          <Text
            variant="headlineSmall"
            style={{ color: colors.foreground, textAlign: 'center', fontWeight: '700' }}
          >
            {eventName}
          </Text>
          <Text
            variant="bodyLarge"
            style={{ color: colors.foregroundSecondary, textAlign: 'center', marginTop: 8 }}
          >
            {t('club.queueSection.joining')}
          </Text>

          {/* Area Selector */}
          <Text
            variant="titleSmall"
            style={{ color: colors.foreground, textAlign: 'center', marginTop: 20, marginBottom: 8, fontWeight: '600' }}
          >
            {t('club.areas.selectArea')}
          </Text>
          <SegmentedButtons
            value={selectedArea}
            onValueChange={setSelectedArea}
            buttons={areaButtons}
            style={{ marginBottom: 8 }}
          />

          <Button
            mode="contained"
            onPress={handleJoinQueue}
            loading={joinQueueMutation.isPending}
            disabled={joinQueueMutation.isPending}
            style={styles.joinBtn}
            contentStyle={styles.joinBtnContent}
            labelStyle={styles.joinBtnLabel}
            accessibilityLabel={t('club.joinQueue')}
          >
            {t('club.joinQueue')}
          </Button>
        </View>
      </View>
    
      </ScreenContainer>
    );
  }

  if (isLoading) {
    return (
      <ScreenContainer>
      <View style={[styles.container, styles.centerContent, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    
      </ScreenContainer>
    );
  }

  const isCalled = queueEntry?.status === 'called';
  const isFirstInLine = (queueEntry?.position ?? 99) <= 1;

  return (
    <ScreenContainer>
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Event Name */}
      <Text
        variant="titleMedium"
        style={{ color: colors.foregroundSecondary, textAlign: 'center' }}
      >
        {eventName}
      </Text>

      {/* Position Display */}
      <Animated.View
        style={[
          styles.positionContainer,
          {
            backgroundColor: isCalled ? colors.primary : colors.card,
            transform: [{ scale: isCalled ? pulseAnim : positionAnim }],
          },
        ]}
      >
        <Text
          variant="bodyMedium"
          style={{
            color: isCalled ? colors.primaryForeground : colors.foregroundSecondary,
            textAlign: 'center',
          }}
        >
          {isCalled ? t('club.queueSection.yourTurn') : t('club.queueSection.position')}
        </Text>
        <Text
          style={{
            fontSize: 72,
            fontWeight: '800',
            color: isCalled ? colors.primaryForeground : colors.foreground,
            textAlign: 'center',
            lineHeight: 80,
          }}
        >
          {isCalled ? '!' : queueEntry?.position ?? '-'}
        </Text>
      </Animated.View>

      {/* Estimated Wait */}
      {queueEntry?.estimatedWaitMinutes !== null && !isCalled && (
        <Card style={[styles.infoCard, { backgroundColor: colors.card }]} mode="elevated">
          <Card.Content style={styles.infoRow}>
            <Text variant="bodyMedium" style={{ color: colors.foregroundSecondary }}>
              {t('club.queueSection.waitTime')}
            </Text>
            <Text
              variant="titleMedium"
              style={{ color: colors.foreground, fontWeight: '700' }}
            >
              ~{queueEntry?.estimatedWaitMinutes} min
            </Text>
          </Card.Content>
        </Card>
      )}

      {/* QR Code for Door Scan */}
      {queueEntry?.qrPayload && (
        <Card style={[styles.qrCard, { backgroundColor: colors.card }]} mode="elevated">
          <Card.Content style={styles.qrContent}>
            <Text
              variant="titleSmall"
              style={{ color: colors.foreground, fontWeight: '600', marginBottom: 12 }}
            >
              {t('club.queueSection.myQr')}
            </Text>
            <View
              style={[
                styles.qrPlaceholder,
                { borderColor: colors.border },
              ]}
            >
              <Text style={{ fontSize: 48 }}>📱</Text>
              <Text
                variant="bodySmall"
                style={{ color: colors.foreground, textAlign: 'center', marginTop: 4 }}
              >
                {queueEntry.qrCode || queueEntry.qrPayload.slice(0, 20)}
              </Text>
            </View>
          </Card.Content>
        </Card>
      )}

      {/* At Door Button */}
      {(isFirstInLine || isCalled) && (
        <Button
          mode="contained"
          onPress={handleAtDoor}
          style={[styles.atDoorBtn, { backgroundColor: colors.success }]}
          contentStyle={styles.atDoorBtnContent}
          labelStyle={styles.atDoorBtnLabel}
          accessibilityLabel={t('club.queueSection.atDoor')}
        >
          {t('club.queueSection.atDoor')}
        </Button>
      )}

      {/* Leave Queue */}
      {!isCalled && (
        <Button
          mode="outlined"
          onPress={handleLeaveQueue}
          loading={leaveQueueMutation.isPending}
          style={styles.leaveBtn}
          textColor={colors.error}
          accessibilityLabel={t('club.queueSection.leave')}
        >
          {t('club.queueSection.leave')}
        </Button>
      )}
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
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 24,
    gap: 20,
    alignItems: 'center',
    paddingBottom: 40,
  },
  joinContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  joinBtn: {
    borderRadius: 12,
    marginTop: 24,
    minWidth: 200,
  },
  joinBtnContent: {
    height: 52,
  },
  joinBtnLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  positionContainer: {
    width: 180,
    height: 180,
    borderRadius: 90,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: 'rgba(0, 0, 0, 0.15)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  infoCard: {
    borderRadius: 12,
    width: '100%',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  qrCard: {
    borderRadius: 16,
    width: '100%',
  },
  qrContent: {
    alignItems: 'center',
    padding: 20,
  },
  qrPlaceholder: {
    width: 160,
    height: 160,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  atDoorBtn: {
    borderRadius: 12,
    width: '100%',
  },
  atDoorBtnContent: {
    height: 52,
  },
  atDoorBtnLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.premiumCardForeground,
  },
  leaveBtn: {
    borderRadius: 12,
    width: '100%',
  },
});
