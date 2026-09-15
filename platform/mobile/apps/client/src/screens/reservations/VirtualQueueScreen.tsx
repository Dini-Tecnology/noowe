/**
 * VirtualQueueScreen
 * 
 * Manages virtual queue functionality for restaurants.
 * Allows users to join, monitor position, and receive notifications.
 * 
 * @module screens/reservations
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  RefreshControl,
} from 'react-native';
import {
  Text,
  Card,
  Button,
  IconButton,
  ActivityIndicator,
  Divider,
  Avatar,
  Chip,
  ProgressBar,
  Portal,
  Modal,
  RadioButton,
} from 'react-native-paper';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import ApiService from '@/shared/services/api';
import { useI18n } from '@/shared/hooks/useI18n';
import { useWebSocket } from '@/shared/hooks/useWebSocket';
import { useScreenTracking } from '@/shared/hooks/useAnalytics';
import { useColors } from '@/shared/contexts/ThemeContext';
import logger from '@okinawa/shared/utils/logger';
import type { RootStackParamList } from '../../types';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface QueueEntry {
  id: string;
  restaurant_id: string;
  user_id: string;
  party_size: number;
  position: number;
  estimated_wait_time: number;
  status: 'waiting' | 'called' | 'seated' | 'cancelled' | 'no_show';
  table_preference?: 'indoor' | 'outdoor' | 'bar' | 'any';
  special_requests?: string;
  priority?: 'normal' | 'priority' | 'vip';
  joined_at: string;
  called_at?: string;
  seated_at?: string;
  restaurant?: {
    id: string;
    name: string;
    logo_url?: string;
    address?: string;
  };
}

interface Restaurant {
  id: string;
  name: string;
  logo_url?: string;
  address?: string;
  current_wait_time?: number;
  queue_length?: number;
}

export default function VirtualQueueScreen() {
  useScreenTracking('Virtual Queue');
  const colors = useColors();
  
  const route = useRoute();
  const navigation = useNavigation<NavigationProp>();
  const { t } = useI18n();
  const { restaurantId } = route.params as { restaurantId?: string };

  const { connected, on, off, joinRoom, leaveRoom } = useWebSocket('/queue');

  const [queueEntries, setQueueEntries] = useState<QueueEntry[]>([]);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joining, setJoining] = useState(false);

  // Join queue form state
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [partySize, setPartySize] = useState(2);
  const [tablePreference, setTablePreference] = useState<string>('any');
  const [specialRequests, setSpecialRequests] = useState('');

  // Dynamic styles with semantic tokens
  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 32,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    loadingText: {
      marginTop: 16,
      color: colors.foregroundMuted,
    },
    restaurantCard: {
      marginBottom: 16,
      backgroundColor: colors.card,
    },
    restaurantHeader: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    restaurantInfo: {
      marginLeft: 16,
      flex: 1,
    },
    address: {
      color: colors.foregroundMuted,
      marginTop: 2,
    },
    waitInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
    },
    waitIcon: {
      margin: 0,
      marginLeft: -8,
    },
    waitText: {
      color: colors.foregroundMuted,
    },
    waitTime: {
      color: colors.primary,
      fontWeight: 'bold',
    },
    queueCard: {
      marginBottom: 16,
      borderWidth: 2,
      borderColor: colors.primary,
      backgroundColor: colors.card,
    },
    calledCard: {
      borderColor: colors.success,
      backgroundColor: colors.successLight,
    },
    calledBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.success,
      marginHorizontal: -16,
      marginTop: -16,
      marginBottom: 16,
      padding: 12,
      borderTopLeftRadius: 12,
      borderTopRightRadius: 12,
    },
    calledText: {
      color: colors.foregroundInverse,
      fontWeight: 'bold',
    },
    positionContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    positionCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    positionNumber: {
      color: colors.primaryForeground,
      fontWeight: 'bold',
    },
    positionLabel: {
      color: 'rgba(255,255,255,0.8)',
      marginTop: -4,
    },
    queueDetails: {
      marginLeft: 16,
      flex: 1,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    progressBar: {
      height: 8,
      borderRadius: 4,
      marginBottom: 16,
    },
    queueActions: {
      alignItems: 'center',
    },
    confirmButton: {
      backgroundColor: colors.success,
      width: '100%',
    },
    leaveButton: {
      borderColor: colors.error,
      width: '100%',
    },
    joinCard: {
      marginBottom: 16,
      backgroundColor: colors.card,
    },
    joinContent: {
      alignItems: 'center',
      paddingVertical: 24,
    },
    joinTitle: {
      marginTop: 8,
      color: colors.foreground,
    },
    joinDescription: {
      textAlign: 'center',
      color: colors.foregroundMuted,
      marginTop: 8,
      marginBottom: 16,
      paddingHorizontal: 24,
    },
    joinButton: {
      backgroundColor: colors.primary,
    },
    historySection: {
      marginTop: 16,
    },
    historyTitle: {
      marginBottom: 12,
      color: colors.foreground,
    },
    historyCard: {
      marginBottom: 8,
      backgroundColor: colors.card,
    },
    historyContent: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    historyInfo: {
      flex: 1,
    },
    historyDate: {
      color: colors.foregroundMuted,
      marginTop: 2,
    },
    statusChip: {
      height: 28,
    },
    modalContent: {
      backgroundColor: colors.card,
      padding: 20,
      margin: 20,
      borderRadius: 8,
    },
    modalTitle: {
      marginBottom: 20,
      color: colors.foreground,
    },
    formGroup: {
      marginBottom: 20,
    },
    label: {
      marginBottom: 8,
      fontWeight: '600',
      color: colors.foreground,
    },
    partySizeControl: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    partySizeNumber: {
      marginHorizontal: 24,
      fontWeight: 'bold',
      minWidth: 50,
      textAlign: 'center',
      color: colors.foreground,
    },
    radioRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
    },
  }), [colors]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [restaurantId])
  );

  useEffect(() => {
    if (connected && restaurantId) {
      joinRoom(`queue:${restaurantId}`);

      const handleQueueUpdate = (data: any) => {
        if (data.entries) {
          setQueueEntries(data.entries);
        }
      };

      on('queue_update', handleQueueUpdate);

      return () => {
        off('queue_update', handleQueueUpdate);
        leaveRoom(`queue:${restaurantId}`);
      };
    }
  }, [connected, restaurantId]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      if (restaurantId) {
        const [restaurantData, queueRes] = await Promise.all([
          ApiService.getRestaurant(restaurantId),
          ApiService.get(`/restaurant-waitlist/${restaurantId}/queue`).then(r => r.data),
        ]);
        setRestaurant(restaurantData);
        setQueueEntries(queueRes as QueueEntry[]);
      } else {
        const userQueueRes = await ApiService.get('/restaurant-waitlist/my-entries').then(r => r.data);
        setQueueEntries(userQueueRes as QueueEntry[]);
      }
    } catch (error) {
      logger.error('Failed to load queue data:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleJoinQueue = async () => {
    if (!restaurantId) return;

    try {
      setJoining(true);
      await ApiService.post('/restaurant-waitlist/join', {
        restaurant_id: restaurantId,
        party_size: partySize,
        table_preference: tablePreference,
        special_requests: specialRequests || undefined,
      });
      setShowJoinModal(false);
      await loadData();
      Alert.alert(t('queue.joined'), t('queue.joinedMessage'));
    } catch (error) {
      Alert.alert(t('common.error'), t('queue.joinError'));
    } finally {
      setJoining(false);
    }
  };

  const handleLeaveQueue = async (entryId: string) => {
    Alert.alert(
      t('queue.leaveTitle'),
      t('queue.leaveMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('queue.leave'),
          style: 'destructive',
          onPress: async () => {
            try {
              await ApiService.patch(`/restaurant-waitlist/${entryId}/cancel`);
              await loadData();
            } catch (error) {
              Alert.alert(t('common.error'), t('queue.leaveError'));
            }
          },
        },
      ]
    );
  };

  const handleConfirmArrival = async (entryId: string) => {
    try {
      await ApiService.patch(`/restaurant-waitlist/${entryId}/confirm-arrival`);
      await loadData();
      Alert.alert(t('queue.confirmed'), t('queue.confirmedMessage'));
    } catch (error) {
      Alert.alert(t('common.error'), t('queue.confirmError'));
    }
  };

  const getStatusChipProps = (status: string) => {
    switch (status) {
      case 'waiting':
        return { backgroundColor: colors.warning, label: t('queue.waiting') };
      case 'called':
        return { backgroundColor: colors.success, label: t('queue.called') };
      case 'seated':
        return { backgroundColor: colors.info, label: t('queue.seated') };
      case 'cancelled':
        return { backgroundColor: colors.error, label: t('queue.cancelled') };
      default:
        return { backgroundColor: colors.muted, label: status };
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

  const activeEntry = queueEntries.find(e => ['waiting', 'called'].includes(e.status));
  const historyEntries = queueEntries.filter(e => !['waiting', 'called'].includes(e.status));

  return (
    <ScreenContainer>
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Restaurant Info */}
        {restaurant && (
          <Card style={styles.restaurantCard}>
            <Card.Content>
              <View style={styles.restaurantHeader}>
                {restaurant.logo_url ? (
                  <Avatar.Image size={56} source={{ uri: restaurant.logo_url }} />
                ) : (
                  <Avatar.Icon size={56} icon="store" style={{ backgroundColor: colors.primary }} />
                )}
                <View style={styles.restaurantInfo}>
                  <Text variant="titleLarge">{restaurant.name}</Text>
                  {restaurant.address && (
                    <Text variant="bodyMedium" style={styles.address}>
                      {restaurant.address}
                    </Text>
                  )}
                  <View style={styles.waitInfo}>
                    <IconButton icon="clock-outline" size={16} style={styles.waitIcon} />
                    <Text variant="bodySmall" style={styles.waitText}>
                      {t('queue.estimatedWait')}: <Text style={styles.waitTime}>{restaurant.current_wait_time || 15} min</Text>
                    </Text>
                  </View>
                </View>
              </View>
            </Card.Content>
          </Card>
        )}

        {/* Active Queue Entry */}
        {activeEntry && (
          <Card style={[styles.queueCard, activeEntry.status === 'called' && styles.calledCard]}>
            <Card.Content>
              {activeEntry.status === 'called' && (
                <View style={styles.calledBanner}>
                  <IconButton icon="bell-ring" size={20} iconColor={colors.foregroundInverse} />
                  <Text style={styles.calledText}>{t('queue.yourTurn')}</Text>
                </View>
              )}

              <View style={styles.positionContainer}>
                <View style={styles.positionCircle}>
                  <Text variant="displaySmall" style={styles.positionNumber}>
                    {activeEntry.position}
                  </Text>
                  <Text variant="labelSmall" style={styles.positionLabel}>
                    {t('queue.position')}
                  </Text>
                </View>
                <View style={styles.queueDetails}>
                  <Text variant="titleMedium">{t('queue.partyOf')} {activeEntry.party_size}</Text>
                  <View style={styles.detailRow}>
                    <IconButton icon="clock-outline" size={16} />
                    <Text variant="bodyMedium">~{activeEntry.estimated_wait_time} min</Text>
                  </View>
                </View>
              </View>

              <ProgressBar
                progress={1 - (activeEntry.position / 10)}
                color={colors.primary}
                style={styles.progressBar}
              />

              <View style={styles.queueActions}>
                {activeEntry.status === 'called' ? (
                  <Button
                    mode="contained"
                    onPress={() => handleConfirmArrival(activeEntry.id)}
                    style={styles.confirmButton}
                    icon="check-circle"
                  >
                    {t('queue.confirmArrival')}
                  </Button>
                ) : (
                  <Button
                    mode="outlined"
                    onPress={() => handleLeaveQueue(activeEntry.id)}
                    style={styles.leaveButton}
                    textColor={colors.error}
                    icon="exit-run"
                  >
                    {t('queue.leaveQueue')}
                  </Button>
                )}
              </View>
            </Card.Content>
          </Card>
        )}

        {/* Join Queue Card */}
        {!activeEntry && restaurant && (
          <Card style={styles.joinCard}>
            <Card.Content style={styles.joinContent}>
              <IconButton icon="account-multiple-plus" size={48} iconColor={colors.primary} />
              <Text variant="titleLarge" style={styles.joinTitle}>{t('queue.joinQueue')}</Text>
              <Text variant="bodyMedium" style={styles.joinDescription}>
                {t('queue.joinDescription')}
              </Text>
              <Button
                mode="contained"
                onPress={() => setShowJoinModal(true)}
                style={styles.joinButton}
                icon="plus"
              >
                {t('queue.enterQueue')}
              </Button>
            </Card.Content>
          </Card>
        )}

        {/* Queue History */}
        {historyEntries.length > 0 && (
          <View style={styles.historySection}>
            <Text variant="titleMedium" style={styles.historyTitle}>{t('queue.history')}</Text>
            {historyEntries.map((entry) => {
              const chipProps = getStatusChipProps(entry.status);
              return (
                <Card key={entry.id} style={styles.historyCard}>
                  <Card.Content style={styles.historyContent}>
                    <View style={styles.historyInfo}>
                      <Text variant="titleSmall">
                        {entry.restaurant?.name || t('queue.queue')}
                      </Text>
                      <Text variant="bodySmall" style={styles.historyDate}>
                        {new Date(entry.joined_at).toLocaleDateString()}
                      </Text>
                    </View>
                    <Chip
                      style={[styles.statusChip, { backgroundColor: chipProps.backgroundColor }]}
                      textStyle={{ color: colors.primaryForeground, fontSize: 12 }}
                    >
                      {chipProps.label}
                    </Chip>
                  </Card.Content>
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Join Queue Modal */}
      <Portal>
        <Modal
          visible={showJoinModal}
          onDismiss={() => setShowJoinModal(false)}
          contentContainerStyle={styles.modalContent}
        >
          <Text variant="titleLarge" style={styles.modalTitle}>{t('queue.joinQueue')}</Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('queue.partySize')}</Text>
            <View style={styles.partySizeControl}>
              <IconButton
                icon="minus"
                mode="contained"
                onPress={() => setPartySize(Math.max(1, partySize - 1))}
                disabled={partySize <= 1}
                accessibilityLabel="Decrease party size"
                accessibilityRole="button"
              />
              <Text variant="headlineSmall" style={styles.partySizeNumber}>
                {partySize}
              </Text>
              <IconButton
                icon="plus"
                mode="contained"
                onPress={() => setPartySize(Math.min(20, partySize + 1))}
                disabled={partySize >= 20}
                accessibilityLabel="Increase party size"
                accessibilityRole="button"
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('queue.tablePreference')}</Text>
            <RadioButton.Group
              value={tablePreference}
              onValueChange={setTablePreference}
            >
              <View style={styles.radioRow}>
                <RadioButton.Item label={t('queue.anyTable')} value="any" />
                <RadioButton.Item label={t('queue.indoor')} value="indoor" />
                <RadioButton.Item label={t('queue.outdoor')} value="outdoor" />
                <RadioButton.Item label={t('queue.bar')} value="bar" />
              </View>
            </RadioButton.Group>
          </View>

          <View style={styles.modalActions}>
            <Button mode="text" onPress={() => setShowJoinModal(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              mode="contained"
              onPress={handleJoinQueue}
              loading={joining}
              disabled={joining}
            >
              {t('queue.join')}
            </Button>
          </View>
        </Modal>
      </Portal>
    </View>
  
    </ScreenContainer>
  );
}
