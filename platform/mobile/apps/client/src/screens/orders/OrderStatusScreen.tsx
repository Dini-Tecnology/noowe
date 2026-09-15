/**
 * OrderStatusScreen - Client App Order Status Tracking
 * 
 * Migrated to semantic tokens using useColors() + useMemo pattern
 * for dynamic theme support (light/dark modes).
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  RefreshControl,
  Animated,
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
} from 'react-native-paper';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import ApiService from '@/shared/services/api';
import { useI18n } from '@/shared/hooks/useI18n';
import { useWebSocket } from '@/shared/hooks/useWebSocket';
import { useScreenTracking } from '@/shared/hooks/useAnalytics';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { Portal, Modal, TouchableRipple } from 'react-native-paper';
import * as Haptics from 'expo-haptics';
import type { RootStackParamList } from '../../types';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface OrderItem {
  id: string;
  menu_item: {
    id: string;
    name: string;
    price: number;
    image_url?: string;
  };
  quantity: number;
  unit_price: number;
  total_price: number;
  status: 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
  ordered_by_name?: string;
  prepared_at?: string;
}

interface Order {
  id: string;
  restaurant_id: string;
  status: string;
  order_number?: string;
  subtotal_amount: number;
  tax_amount: number;
  tip_amount: number;
  total_amount: number;
  created_at: string;
  estimated_ready_time?: string;
  items: OrderItem[];
  restaurant?: {
    id: string;
    name: string;
    logo_url?: string;
  };
  table?: {
    id: string;
    table_number: string;
  };
}

const ORDER_STATUS_KEYS = [
  { key: 'pending', icon: 'clock-outline', labelKey: 'orders.status.received' },
  { key: 'confirmed', icon: 'check-circle-outline', labelKey: 'orders.status.confirmed' },
  { key: 'preparing', icon: 'pot-steam', labelKey: 'orders.status.preparing' },
  { key: 'ready', icon: 'bell-ring', labelKey: 'orders.status.ready' },
  { key: 'delivered', icon: 'check-all', labelKey: 'orders.status.delivered' },
];

export default function OrderStatusScreen() {
  useScreenTracking('Order Status');
  
  const route = useRoute();
  const navigation = useNavigation<NavigationProp>();
  const { t } = useI18n();
  const colors = useColors();
  const { orderId } = route.params as { orderId: string };

  const { connected, on, off, joinRoom, leaveRoom } = useWebSocket('/orders');

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pulseAnim] = useState(new Animated.Value(1));
  const [showReviewPrompt, setShowReviewPrompt] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const reviewPromptShownRef = useRef(false);

  // Show review prompt when order is completed
  useEffect(() => {
    if (order && (order.status === 'delivered' || order.status === 'completed') && !reviewPromptShownRef.current) {
      reviewPromptShownRef.current = true;
      setTimeout(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowReviewPrompt(true);
      }, 1500);
    }
  }, [order?.status]);

  const handleSubmitReview = async () => {
    if (reviewRating === 0 || !order) return;
    try {
      await ApiService.post('/reviews', {
        restaurant_id: order.restaurant_id,
        order_id: order.id,
        rating: reviewRating,
      });
      setShowReviewPrompt(false);
      Alert.alert(t('common.success'), t('reviews.thankYou'));
    } catch {
      setShowReviewPrompt(false);
    }
  };

  /**
   * Dynamic status color mapping based on theme
   */
  const getItemStatusColor = useCallback((status: string): string => {
    const statusColors: Record<string, string> = {
      pending: colors.foregroundMuted,
      preparing: colors.warning,
      ready: colors.success,
      delivered: colors.success,
      cancelled: colors.error,
    };
    return statusColors[status] || colors.foregroundMuted;
  }, [colors]);

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
    headerCard: {
      marginBottom: 16,
      backgroundColor: colors.card,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    orderInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    orderDetails: {
      marginLeft: 12,
      flex: 1,
    },
    restaurantName: {
      color: colors.foreground,
    },
    orderNumber: {
      color: colors.foregroundMuted,
      marginTop: 2,
    },
    tableInfo: {
      color: colors.primary,
      marginTop: 2,
    },
    timeInfo: {
      alignItems: 'flex-end',
    },
    timeLabel: {
      color: colors.foregroundMuted,
    },
    estimatedTime: {
      color: colors.primary,
      fontWeight: 'bold',
    },
    statusCard: {
      marginBottom: 16,
      backgroundColor: colors.card,
    },
    sectionTitle: {
      marginBottom: 16,
      color: colors.foreground,
    },
    progressBar: {
      height: 8,
      borderRadius: 4,
      marginBottom: 20,
    },
    statusTimeline: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      position: 'relative',
    },
    statusStep: {
      alignItems: 'center',
      flex: 1,
    },
    statusIconContainer: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.backgroundTertiary,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 8,
    },
    activeStatus: {
      backgroundColor: colors.primary,
    },
    statusIcon: {
      margin: 0,
    },
    statusLabel: {
      fontSize: 10,
      textAlign: 'center',
      color: colors.foregroundMuted,
    },
    activeStatusLabel: {
      color: colors.foreground,
      fontWeight: '600',
    },
    statusLine: {
      position: 'absolute',
      top: 22,
      left: '60%',
      right: '-40%',
      height: 2,
      backgroundColor: colors.backgroundTertiary,
      zIndex: -1,
    },
    activeStatusLine: {
      backgroundColor: colors.primary,
    },
    cancelledContainer: {
      alignItems: 'center',
      paddingVertical: 24,
    },
    cancelledText: {
      color: colors.error,
      marginTop: 8,
    },
    card: {
      marginBottom: 16,
      backgroundColor: colors.card,
    },
    itemRow: {
      paddingVertical: 12,
    },
    itemInfo: {
      flex: 1,
    },
    itemHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    itemName: {
      color: colors.foreground,
    },
    orderedBy: {
      color: colors.foregroundMuted,
      fontStyle: 'italic',
    },
    itemStatusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    itemStatusChip: {
      height: 24,
    },
    preparedTime: {
      color: colors.foregroundMuted,
    },
    itemDivider: {
      marginVertical: 0,
      backgroundColor: colors.border,
    },
    actionButtons: {
      marginBottom: 16,
    },
    actionButton: {
      marginBottom: 8,
    },
    noticeCard: {
      backgroundColor: colors.warningBackground,
    },
    noticeContent: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    noticeText: {
      flex: 1,
      color: colors.foregroundMuted,
    },
    liveDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.success,
      marginLeft: 8,
    },
  }), [colors]);

  useFocusEffect(
    useCallback(() => {
      loadOrder();
    }, [orderId])
  );

  useEffect(() => {
    if (connected && orderId) {
      joinRoom(`order:${orderId}`);

      const handleOrderUpdate = (data: any) => {
        if (data.order) {
          setOrder(data.order);
          triggerPulse();
        }
      };

      const handleItemUpdate = (data: any) => {
        setOrder((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((item) =>
              item.id === data.item_id
                ? { ...item, status: data.status, prepared_at: data.prepared_at }
                : item
            ),
          };
        });
        triggerPulse();
      };

      on('order:updated', handleOrderUpdate);
      on('order:status_changed', handleOrderUpdate);
      on('order:item_status_changed', handleItemUpdate);

      return () => {
        off('order:updated', handleOrderUpdate);
        off('order:status_changed', handleOrderUpdate);
        off('order:item_status_changed', handleItemUpdate);
        leaveRoom(`order:${orderId}`);
      };
    }
  }, [connected, orderId]);

  const triggerPulse = () => {
    Animated.sequence([
      Animated.timing(pulseAnim, {
        toValue: 1.1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const loadOrder = async () => {
    try {
      setLoading(true);
      const orderData = await ApiService.getOrder(orderId);
      setOrder(orderData);
    } catch (error: any) {
      console.error('Error loading order:', error);
      Alert.alert(t('common.error'), t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadOrder();
    setRefreshing(false);
  }, []);

  const handleCallWaiter = () => {
    navigation.navigate('CallWaiter', { 
      orderId,
      restaurantId: order?.restaurant_id 
    });
  };

  const handleViewReceipt = () => {
    navigation.navigate('DigitalReceipt', { orderId });
  };

  const getStatusIndex = (status: string) => {
    return ORDER_STATUS_KEYS.findIndex((s) => s.key === status);
  };

  const getItemStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return 'clock-outline';
      case 'preparing':
        return 'pot-steam';
      case 'ready':
        return 'check-circle';
      case 'delivered':
        return 'check-all';
      case 'cancelled':
        return 'close-circle';
      default:
        return 'help-circle';
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getEstimatedTime = () => {
    if (order?.estimated_ready_time) {
      return formatTime(order.estimated_ready_time);
    }
    return '--:--';
  };

  const getProgress = () => {
    if (!order) return 0;
    const currentIndex = getStatusIndex(order.status);
    if (currentIndex === -1) return 0;
    return (currentIndex + 1) / ORDER_STATUS_KEYS.length;
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

  if (!order) {
    return (
      <ScreenContainer>
      <View style={styles.loadingContainer}>
        <IconButton icon="clipboard-off-outline" size={64} iconColor={colors.foregroundMuted} accessibilityLabel={t('orders.notFound')} />
        <Text variant="titleLarge" style={{ color: colors.foreground }}>{t('orders.notFound')}</Text>
      </View>
    
      </ScreenContainer>
    );
  }

  const currentStatusIndex = getStatusIndex(order.status);
  const isCompleted = order.status === 'delivered' || order.status === 'completed';
  const isCancelled = order.status === 'cancelled';

  return (
    <ScreenContainer>
    <View style={styles.container}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {/* Order Header */}
        <Card style={styles.headerCard}>
          <Card.Content>
            <View style={styles.headerRow}>
              <View style={styles.orderInfo}>
                {order.restaurant?.logo_url ? (
                  <Avatar.Image
                    size={48}
                    source={{ uri: order.restaurant.logo_url }}
                  />
                ) : (
                  <Avatar.Icon size={48} icon="store" />
                )}
                <View style={styles.orderDetails}>
                  <Text variant="titleMedium" style={styles.restaurantName}>{order.restaurant?.name}</Text>
                  <Text variant="bodySmall" style={styles.orderNumber}>
                    {t('orders.orderNumber')}: #{order.order_number || order.id.slice(0, 8)}
                  </Text>
                  {order.table && (
                    <Text variant="bodySmall" style={styles.tableInfo}>
                      {t('orders.table')}: {order.table.table_number}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.timeInfo}>
                <Text variant="bodySmall" style={styles.timeLabel}>
                  {t('orders.estimatedReady')}
                </Text>
                <Text variant="headlineSmall" style={styles.estimatedTime}>
                  {getEstimatedTime()}
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Status Progress */}
        <Card style={styles.statusCard}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              {t('orders.orderStatus')}
            </Text>

            {isCancelled ? (
              <View style={styles.cancelledContainer}>
                <IconButton
                  icon="close-circle"
                  size={64}
                  iconColor={colors.error}
                  accessibilityLabel={t('orders.status.cancelled')}
                />
                <Text variant="titleLarge" style={styles.cancelledText}>
                  {t('orders.status.cancelled')}
                </Text>
              </View>
            ) : (
              <>
                <ProgressBar
                  progress={getProgress()}
                  color={colors.primary}
                  style={styles.progressBar}
                />

                <View style={styles.statusTimeline}>
                  {ORDER_STATUS_KEYS.map((status, index) => {
                    const isActive = index <= currentStatusIndex;
                    const isCurrent = index === currentStatusIndex;

                    return (
                      <View key={status.key} style={styles.statusStep}>
                        <Animated.View
                          style={[
                            styles.statusIconContainer,
                            isActive && styles.activeStatus,
                            isCurrent && {
                              transform: [{ scale: pulseAnim }],
                            },
                          ]}
                        >
                          <IconButton
                            icon={status.icon}
                            size={24}
                            iconColor={isActive ? colors.primaryForeground : colors.foregroundMuted}
                            style={styles.statusIcon}
                            accessibilityLabel={t(status.labelKey)}
                          />
                        </Animated.View>
                        <Text
                          variant="bodySmall"
                          style={[
                            styles.statusLabel,
                            isActive && styles.activeStatusLabel,
                          ]}
                        >
                          {t(status.labelKey)}
                        </Text>
                        {index < ORDER_STATUS_KEYS.length - 1 && (
                          <View
                            style={[
                              styles.statusLine,
                              isActive && styles.activeStatusLine,
                            ]}
                          />
                        )}
                      </View>
                    );
                  })}
                </View>
              </>
            )}
          </Card.Content>
        </Card>

        {/* Items Status */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              {t('orders.itemsStatus')}
            </Text>

            {order.items.map((item, index) => (
              <View key={item.id}>
                <View style={styles.itemRow}>
                  <View style={styles.itemInfo}>
                    <View style={styles.itemHeader}>
                      <Text variant="bodyLarge" style={styles.itemName}>
                        {item.quantity}x {item.menu_item.name}
                      </Text>
                      {item.ordered_by_name && (
                        <Text variant="bodySmall" style={styles.orderedBy}>
                          {item.ordered_by_name}
                        </Text>
                      )}
                    </View>
                    <View style={styles.itemStatusRow}>
                      <Chip
                        mode="flat"
                        icon={getItemStatusIcon(item.status)}
                        style={[
                          styles.itemStatusChip,
                          { backgroundColor: getItemStatusColor(item.status) + '20' },
                        ]}
                        textStyle={{ color: getItemStatusColor(item.status) }}
                        accessibilityLabel={`${item.menu_item.name}: ${t(`orders.itemStatus.${item.status}`)}`}
                      >
                        {t(`orders.itemStatus.${item.status}`)}
                      </Chip>
                      {item.prepared_at && (
                        <Text variant="bodySmall" style={styles.preparedTime}>
                          {formatTime(item.prepared_at)}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
                {index < order.items.length - 1 && (
                  <Divider style={styles.itemDivider} />
                )}
              </View>
            ))}
          </Card.Content>
        </Card>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          {!isCompleted && !isCancelled && (
            <Button
              mode="outlined"
              onPress={handleCallWaiter}
              icon="hand-wave"
              style={styles.actionButton}
              accessibilityLabel={t('orders.callWaiter')}
            >
              {t('orders.callWaiter')}
            </Button>
          )}
          {isCompleted && (
            <Button
              mode="contained"
              onPress={handleViewReceipt}
              icon="receipt"
              style={styles.actionButton}
              accessibilityLabel={t('orders.viewReceipt')}
            >
              {t('orders.viewReceipt')}
            </Button>
          )}
        </View>

        {/* Real-time Updates Notice */}
        <Card style={styles.noticeCard}>
          <Card.Content style={styles.noticeContent}>
            <IconButton icon="wifi" size={20} iconColor={colors.primary} accessibilityLabel={connected ? t('orders.realtimeEnabled') : t('orders.realtimeDisabled')} />
            <Text variant="bodySmall" style={styles.noticeText}>
              {connected
                ? t('orders.realtimeEnabled')
                : t('orders.realtimeDisabled')}
            </Text>
            {connected && (
              <View style={styles.liveDot} />
            )}
          </Card.Content>
        </Card>
      </ScrollView>

      {/* Review Prompt Modal */}
      <Portal>
        <Modal
          visible={showReviewPrompt}
          onDismiss={() => setShowReviewPrompt(false)}
          contentContainerStyle={{
            backgroundColor: colors.card,
            margin: 24,
            borderRadius: 16,
            padding: 24,
            alignItems: 'center',
          }}
        >
          <Text variant="titleLarge" style={{ color: colors.foreground, fontWeight: '700', marginBottom: 8 }}>
            {t('reviews.rateYourMeal')}
          </Text>
          <Text variant="bodyMedium" style={{ color: colors.foregroundMuted, textAlign: 'center', marginBottom: 20 }}>
            {t('reviews.howWasExperience')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
            {[1, 2, 3, 4, 5].map((star) => (
              <IconButton
                key={star}
                icon={star <= reviewRating ? 'star' : 'star-outline'}
                size={36}
                iconColor={star <= reviewRating ? colors.tierGold : colors.foregroundMuted}
                onPress={() => {
                  setReviewRating(star);
                  Haptics.selectionAsync();
                }}
                accessibilityLabel={`${star} ${t('reviews.stars')}`}
              />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
            <Button
              mode="outlined"
              onPress={() => setShowReviewPrompt(false)}
              style={{ flex: 1 }}
              accessibilityLabel={t('common.cancel')}
            >
              {t('common.cancel')}
            </Button>
            <Button
              mode="contained"
              onPress={handleSubmitReview}
              disabled={reviewRating === 0}
              style={{ flex: 1 }}
              accessibilityLabel={t('reviews.submit')}
            >
              {t('reviews.submit')}
            </Button>
          </View>
        </Modal>
      </Portal>
    </View>
  
    </ScreenContainer>
  );
}
