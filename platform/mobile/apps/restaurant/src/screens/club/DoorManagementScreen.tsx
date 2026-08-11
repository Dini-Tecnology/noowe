/**
 * DoorManagementScreen - Door Staff Ticket Verification
 *
 * Allows door staff to view the live queue of customers waiting to enter,
 * admit or deny entry, and simulate QR code scanning.
 * Uses Socket.IO for real-time queue updates.
 *
 * @module restaurant/screens/club
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
  TouchableOpacity,
  Vibration,
} from 'react-native';
import {
  Text,
  Card,
  Button,
  Badge,
  IconButton,
  Chip,
  ActivityIndicator,
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '@/shared/hooks/useI18n';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import ApiService from '@/shared/services/api';
import socketService from '../../services/socket';

// ============================================
// TYPES
// ============================================

interface QueueEntry {
  id: string;
  customerName: string;
  ticketType: 'standard' | 'vip' | 'birthday' | 'guestlist';
  position: number;
  status: 'waiting' | 'called' | 'admitted' | 'denied';
  joinedAt: string;
  partySize: number;
  qrCode?: string;
}

interface DoorManagementScreenProps {
  route?: {
    params?: {
      restaurantId: string;
    };
  };
}

// ============================================
// SKELETON
// ============================================

function DoorSkeleton({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{ padding: 16, gap: 12 }}>
      {[1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={{
            backgroundColor: colors.card,
            borderRadius: 20,
            padding: 16,
            gap: 10,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ width: '50%', height: 18, borderRadius: 4, backgroundColor: colors.backgroundTertiary }} />
            <View style={{ width: 60, height: 24, borderRadius: 20, backgroundColor: colors.backgroundTertiary }} />
          </View>
          <View style={{ width: '30%', height: 14, borderRadius: 4, backgroundColor: colors.backgroundTertiary }} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, height: 36, borderRadius: 16, backgroundColor: colors.backgroundTertiary }} />
            <View style={{ flex: 1, height: 36, borderRadius: 16, backgroundColor: colors.backgroundTertiary }} />
          </View>
        </View>
      ))}
    </View>
  );
}

// ============================================
// QUEUE ENTRY CARD
// ============================================

function QueueEntryCard({
  entry,
  colors,
  t,
  onAdmit,
  onDeny,
}: {
  entry: QueueEntry;
  colors: ReturnType<typeof useColors>;
  t: (key: string) => string;
  onAdmit: (id: string) => void;
  onDeny: (id: string) => void;
}) {
  const ticketColor: Record<string, string> = useMemo(
    () => ({
      standard: colors.info,
      vip: colors.accent,
      birthday: colors.primary,
      guestlist: colors.secondary,
    }),
    [colors],
  );

  const joinedTime = new Date(entry.joinedAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const tColor = ticketColor[entry.ticketType] || colors.primary;

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 16,
        elevation: 2,
        gap: 12,
      }}
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text
            variant="titleMedium"
            style={{ color: colors.foreground, fontWeight: '700' }}
            numberOfLines={1}
          >
            {entry.customerName}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            {/* Ticket type badge (pill) */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: `${tColor}1A`,
              }}
            >
              <Text style={{ color: tColor, fontSize: 10, fontWeight: '600' }}>
                {entry.ticketType.toUpperCase()}
              </Text>
            </View>
            <Text variant="bodySmall" style={{ color: colors.foregroundMuted }}>
              #{entry.position} - {joinedTime}
            </Text>
            {entry.partySize > 1 && (
              <Text variant="bodySmall" style={{ color: colors.foregroundSecondary }}>
                {entry.partySize} pax
              </Text>
            )}
          </View>
        </View>
      </View>

      {/* Action buttons */}
      {entry.status === 'waiting' && (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
          <TouchableOpacity
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 12,
              borderRadius: 16,
              backgroundColor: colors.success,
            }}
            onPress={() => onAdmit(entry.id)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Admit ${entry.customerName}`}
          >
            <IconButton
              icon="check-circle"
              size={18}
              iconColor={colors.primaryForeground}
              style={{ margin: 0, padding: 0, width: 18, height: 18 }}
              accessibilityLabel="Admit"
            />
            <Text style={{ color: colors.primaryForeground, fontWeight: '700', fontSize: 14, marginLeft: 4 }}>
              {t('club.door.admit')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 12,
              borderRadius: 16,
              backgroundColor: colors.errorBackground,
            }}
            onPress={() => onDeny(entry.id)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Deny entry for ${entry.customerName}`}
          >
            <IconButton
              icon="close-circle"
              size={18}
              iconColor={colors.error}
              style={{ margin: 0, padding: 0, width: 18, height: 18 }}
              accessibilityLabel="Deny"
            />
            <Text style={{ color: colors.error, fontWeight: '700', fontSize: 14, marginLeft: 4 }}>
              {t('club.door.deny')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Status badges */}
      {entry.status === 'admitted' && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'flex-start',
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: colors.successBackground,
          }}
        >
          <Text style={{ color: colors.success, fontSize: 10, fontWeight: '600' }}>
            {t('club.door.admitted')}
          </Text>
        </View>
      )}

      {entry.status === 'denied' && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'flex-start',
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: colors.errorBackground,
          }}
        >
          <Text style={{ color: colors.error, fontSize: 10, fontWeight: '600' }}>
            {t('club.door.deniedStatus')}
          </Text>
        </View>
      )}
    </View>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function DoorManagementScreen({ route }: DoorManagementScreenProps) {
  const { t } = useI18n();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const restaurantId = route?.params?.restaurantId || '';

  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch active queue
  const fetchQueue = useCallback(async () => {
    try {
      const response = await ApiService.get(`/clubs/queue/${restaurantId}/active`);
      setQueue(response.data || []);
    } catch (error) {
      console.error('Failed to fetch queue:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    if (restaurantId) {
      fetchQueue();
    }
  }, [restaurantId, fetchQueue]);

  // Socket.IO real-time updates
  useEffect(() => {
    if (!restaurantId) return;

    const handleQueueUpdate = (data: any) => {
      if (data?.entries) {
        setQueue(data.entries);
      } else {
        fetchQueue();
      }
      Vibration.vibrate(100);
    };

    const handleNewEntry = (data: any) => {
      if (data?.entry) {
        setQueue((prev) => [...prev, data.entry]);
        Vibration.vibrate(200);
      }
    };

    socketService.on('club:queue:update', handleQueueUpdate);
    socketService.on('club:queue:new', handleNewEntry);
    socketService.send('joinRoom', { room: `club-door:${restaurantId}` });

    return () => {
      socketService.off('club:queue:update', handleQueueUpdate);
      socketService.off('club:queue:new', handleNewEntry);
      socketService.send('leaveRoom', { room: `club-door:${restaurantId}` });
    };
  }, [restaurantId, fetchQueue]);

  const handleAdmit = useCallback(async (entryId: string) => {
    try {
      await ApiService.post(`/clubs/queue/${entryId}/admit`);
      Vibration.vibrate(50);
      setQueue((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, status: 'admitted' as const } : e)),
      );
    } catch (error: any) {
      Alert.alert(t('common.error'), error?.message || t('common.error'));
    }
  }, [t]);

  const handleDeny = useCallback(async (entryId: string) => {
    Alert.alert(
      t('club.door.deny'),
      t('club.door.denyConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              await ApiService.post(`/clubs/queue/${entryId}/deny`);
              setQueue((prev) =>
                prev.map((e) => (e.id === entryId ? { ...e, status: 'denied' as const } : e)),
              );
            } catch (error: any) {
              Alert.alert(t('common.error'), error?.message || t('common.error'));
            }
          },
        },
      ],
    );
  }, [t]);

  const handleScanQr = useCallback(() => {
    Vibration.vibrate(100);
    Alert.alert(
      t('club.door.scan'),
      t('club.door.scanSimulation'),
      [{ text: t('common.ok') }],
    );
  }, [t]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchQueue();
  }, [fetchQueue]);

  const waitingCount = queue.filter((e) => e.status === 'waiting').length;

  const renderEntry = useCallback(
    ({ item }: { item: QueueEntry }) => (
      <QueueEntryCard
        entry={item}
        colors={colors}
        t={t}
        onAdmit={handleAdmit}
        onDeny={handleDeny}
      />
    ),
    [colors, t, handleAdmit, handleDeny],
  );

  const renderEmpty = useCallback(
    () => (
      <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
        <IconButton icon="door-open" size={48} iconColor={colors.foregroundMuted} accessibilityLabel="No queue entries" />
        <Text
          variant="titleMedium"
          style={{ color: colors.foregroundMuted, textAlign: 'center', marginTop: 8 }}
        >
          {t('club.door.noQueue')}
        </Text>
      </View>
    ),
    [colors, t],
  );

  if (isLoading) {
    return (
      <ScreenContainer>
      <View style={{ flex: 1, backgroundColor: colors.backgroundSecondary }}>
        <LinearGradient
          colors={[colors.primary, colors.accent]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{
            paddingTop: insets.top + 12,
            paddingBottom: 20,
            paddingHorizontal: 20,
          }}
        >
          <Text style={{ color: colors.primaryForeground, fontSize: 24, fontWeight: '700' }}>
            {t('club.door.title')}
          </Text>
        </LinearGradient>
        <DoorSkeleton colors={colors} />
      </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
    <View style={{ flex: 1, backgroundColor: colors.backgroundSecondary }}>
      {/* Gradient Header */}
      <LinearGradient
        colors={[colors.primary, colors.accent]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{
          paddingTop: insets.top + 12,
          paddingBottom: 20,
          paddingHorizontal: 20,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.primaryForeground, fontSize: 24, fontWeight: '700' }}>
              {t('club.door.title')}
            </Text>
            <Text style={{ color: colors.glassStrong, fontSize: 14, marginTop: 4 }}>
              {t('club.door.waiting')}: {waitingCount}
            </Text>
          </View>
          {/* Waiting count badge */}
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: colors.glassBorder,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: colors.primaryForeground, fontWeight: '700', fontSize: 18 }}>
              {waitingCount}
            </Text>
          </View>
        </View>

        {/* QR Scan Button */}
        <TouchableOpacity
          onPress={handleScanQr}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Scan QR code"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 14,
            paddingVertical: 10,
            borderRadius: 16,
            backgroundColor: colors.glassBorder,
          }}
        >
          <IconButton
            icon="qrcode-scan"
            size={18}
            iconColor={colors.primaryForeground}
            style={{ margin: 0, padding: 0, width: 18, height: 18 }}
            accessibilityLabel="Scan QR code"
          />
          <Text style={{ color: colors.primaryForeground, fontWeight: '600', fontSize: 14, marginLeft: 6 }}>
            {t('club.door.scan')}
          </Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* Queue List */}
      <FlatList
        data={queue.filter((e) => e.status === 'waiting')}
        keyExtractor={(item) => item.id}
        renderItem={renderEntry}
        contentContainerStyle={{ padding: 16, paddingTop: 12, gap: 12 }}
        getItemLayout={(_, index) => ({
          length: 152,
          offset: 152 * index,
          index,
        })}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
    </ScreenContainer>
  );
}
