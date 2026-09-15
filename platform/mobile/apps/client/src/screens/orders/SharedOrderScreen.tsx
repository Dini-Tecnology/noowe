/**
 * SharedOrderScreen - Client App Shared Order Management
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
  FAB,
  Portal,
  Modal,
  TextInput,
} from 'react-native-paper';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import ApiService from '@/shared/services/api';
import { useI18n } from '@/shared/hooks/useI18n';
import { formatCurrency } from '@okinawa/shared/utils/formatters';
import { getLanguage } from '@okinawa/shared/i18n';
import { useWebSocket } from '@/shared/hooks/useWebSocket';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
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
  status: string;
  ordered_by: string;
  ordered_by_name?: string;
  special_instructions?: string;
}

interface OrderGuest {
  id: string;
  guest_user_id?: string;
  guest_name: string;
  status: string;
  payment_status: string;
  amount_due: number;
  amount_paid: number;
  is_primary: boolean;
}

interface Order {
  id: string;
  restaurant_id: string;
  status: string;
  subtotal_amount: number;
  tax_amount: number;
  tip_amount: number;
  total_amount: number;
  created_at: string;
  items: OrderItem[];
  restaurant?: {
    id: string;
    name: string;
    logo_url?: string;
  };
}

export default function SharedOrderScreen() {
  const route = useRoute();
  const navigation = useNavigation<NavigationProp>();
  const { t } = useI18n();
  const colors = useColors();
  const { orderId } = route.params as { orderId: string };

  const { connected, on, off, joinRoom, leaveRoom } = useWebSocket('/orders');

  const [order, setOrder] = useState<Order | null>(null);
  const [guests, setGuests] = useState<OrderGuest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddGuestModal, setShowAddGuestModal] = useState(false);
  const [newGuestName, setNewGuestName] = useState('');
  const [addingGuest, setAddingGuest] = useState(false);

  /**
   * Dynamic status color mapping based on theme
   */
  const getStatusColor = useCallback((status: string): string => {
    const statusColors: Record<string, string> = {
      pending: colors.warning,
      preparing: colors.info,
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
      paddingBottom: 100,
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
      alignItems: 'center',
    },
    restaurantInfo: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    restaurantDetails: {
      marginLeft: 12,
    },
    restaurantName: {
      color: colors.foreground,
    },
    statusChip: {
      marginTop: 4,
      height: 24,
    },
    card: {
      marginBottom: 16,
      backgroundColor: colors.card,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    sectionTitle: {
      marginBottom: 16,
      color: colors.foreground,
    },
    guestsContainer: {
      gap: 12,
    },
    guestItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 8,
      backgroundColor: colors.muted,
      borderRadius: 8,
    },
    guestInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    guestAvatar: {
      backgroundColor: colors.muted,
    },
    primaryGuestAvatar: {
      backgroundColor: colors.primary,
    },
    guestDetails: {
      marginLeft: 12,
      flex: 1,
    },
    guestName: {
      color: colors.foreground,
    },
    primaryBadge: {
      color: colors.primary,
      fontWeight: 'bold',
    },
    guestPayment: {
      marginTop: 2,
    },
    paidText: {
      color: colors.success,
    },
    pendingText: {
      color: colors.warning,
    },
    guestItemsTitle: {
      marginBottom: 12,
      fontWeight: 'bold',
      color: colors.foreground,
    },
    orderItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    itemInfo: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    itemName: {
      color: colors.foreground,
    },
    itemStatusChip: {
      height: 20,
    },
    itemPrice: {
      fontWeight: '600',
      color: colors.foreground,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    summaryLabel: {
      color: colors.foreground,
    },
    summaryValue: {
      color: colors.foreground,
    },
    divider: {
      marginVertical: 12,
      backgroundColor: colors.border,
    },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    totalLabel: {
      color: colors.foreground,
    },
    totalAmount: {
      color: colors.primary,
      fontWeight: 'bold',
    },
    actionButtons: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 8,
    },
    actionButton: {
      flex: 1,
    },
    modalContent: {
      backgroundColor: colors.card,
      padding: 20,
      margin: 20,
      borderRadius: 8,
    },
    modalTitle: {
      marginBottom: 16,
      color: colors.foreground,
    },
    guestInput: {
      marginBottom: 16,
      backgroundColor: colors.card,
    },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
    },
    fab: {
      position: 'absolute',
      right: 16,
      bottom: 16,
      backgroundColor: colors.primary,
    },
  }), [colors]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [orderId])
  );

  useEffect(() => {
    if (connected && orderId) {
      joinRoom(`order:${orderId}`);

      const handleOrderUpdate = (data: any) => {
        if (data.order) {
          setOrder(data.order);
        }
      };

      const handleGuestUpdate = (data: any) => {
        if (data.guests) {
          setGuests(data.guests);
        }
      };

      on('order:updated', handleOrderUpdate);
      on('order:guest_joined', handleGuestUpdate);
      on('order:guest_left', handleGuestUpdate);
      on('order:item_added', handleOrderUpdate);
      on('order:item_status_changed', handleOrderUpdate);

      return () => {
        off('order:updated', handleOrderUpdate);
        off('order:guest_joined', handleGuestUpdate);
        off('order:guest_left', handleGuestUpdate);
        off('order:item_added', handleOrderUpdate);
        off('order:item_status_changed', handleOrderUpdate);
        leaveRoom(`order:${orderId}`);
      };
    }
  }, [connected, orderId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [orderData, guestsData] = await Promise.all([
        ApiService.getOrder(orderId),
        ApiService.getOrderGuests(orderId),
      ]);
      setOrder(orderData);
      setGuests(guestsData);
    } catch (error: any) {
      console.error('Error loading order:', error);
      Alert.alert(t('common.error'), t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);

  const handleAddGuest = async () => {
    if (!newGuestName.trim()) {
      Alert.alert(t('common.error'), t('orders.guestNameRequired'));
      return;
    }

    setAddingGuest(true);
    try {
      await ApiService.addOrderGuest(orderId, {
        guest_name: newGuestName.trim(),
      });
      setNewGuestName('');
      setShowAddGuestModal(false);
      await loadData();
    } catch (error: any) {
      Alert.alert(
        t('common.error'),
        error.response?.data?.message || t('errors.generic')
      );
    } finally {
      setAddingGuest(false);
    }
  };

  const handleRemoveGuest = async (guestId: string) => {
    Alert.alert(
      t('orders.removeGuest'),
      t('orders.removeGuestConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.remove'),
          style: 'destructive',
          onPress: async () => {
            try {
              await ApiService.removeOrderGuest(orderId, guestId);
              await loadData();
            } catch (error: any) {
              Alert.alert(t('common.error'), t('errors.generic'));
            }
          },
        },
      ]
    );
  };

  const handleGoToSplitPayment = () => {
    navigation.navigate('SplitPayment', { orderId });
  };

  const handleAddItems = () => {
    if (order?.restaurant_id) {
      navigation.navigate('RestaurantMenu', { 
        restaurantId: order.restaurant_id,
        orderId 
      });
    }
  };

  const getItemsByGuest = () => {
    const itemsByGuest: Record<string, OrderItem[]> = {};
    
    order?.items.forEach((item) => {
      const guestName = item.ordered_by_name || t('orders.unassigned');
      if (!itemsByGuest[guestName]) {
        itemsByGuest[guestName] = [];
      }
      itemsByGuest[guestName].push(item);
    });

    return itemsByGuest;
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

  const itemsByGuest = getItemsByGuest();

  return (
    <ScreenContainer hasKeyboard>
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
              <View style={styles.restaurantInfo}>
                {order.restaurant?.logo_url ? (
                  <Avatar.Image
                    size={48}
                    source={{ uri: order.restaurant.logo_url }}
                  />
                ) : (
                  <Avatar.Icon size={48} icon="store" />
                )}
                <View style={styles.restaurantDetails}>
                  <Text variant="titleMedium" style={styles.restaurantName}>{order.restaurant?.name}</Text>
                  <Chip
                    mode="flat"
                    style={[
                      styles.statusChip,
                      { backgroundColor: getStatusColor(order.status) + '20' },
                    ]}
                    textStyle={{ color: getStatusColor(order.status) }}
                    accessibilityLabel={t(`orders.status.${order.status}`)}
                  >
                    {t(`orders.status.${order.status}`)}
                  </Chip>
                </View>
              </View>
              <IconButton
                icon="qrcode-scan"
                size={28}
                onPress={() => navigation.navigate('QRScanner', { orderId })}
                iconColor={colors.foreground}
                accessibilityLabel="Scan QR code"
              />
            </View>
          </Card.Content>
        </Card>

        {/* Guests Section */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <Text variant="titleMedium" style={{ color: colors.foreground }}>{t('orders.guests')}</Text>
              <Button
                mode="text"
                onPress={() => setShowAddGuestModal(true)}
                icon="account-plus"
                accessibilityLabel={t('orders.addGuest')}
              >
                {t('orders.addGuest')}
              </Button>
            </View>

            <View style={styles.guestsContainer}>
              {guests.map((guest) => (
                <View key={guest.id} style={styles.guestItem}>
                  <View style={styles.guestInfo}>
                    <Avatar.Text
                      size={40}
                      label={guest.guest_name.substring(0, 2).toUpperCase()}
                      style={[
                        styles.guestAvatar,
                        guest.is_primary && styles.primaryGuestAvatar,
                      ]}
                    />
                    <View style={styles.guestDetails}>
                      <Text variant="bodyLarge" style={styles.guestName}>
                        {guest.guest_name}
                        {guest.is_primary && (
                          <Text style={styles.primaryBadge}> (Host)</Text>
                        )}
                      </Text>
                      <Text variant="bodySmall" style={styles.guestPayment}>
                        {guest.payment_status === 'paid' ? (
                          <Text style={styles.paidText}>
                            {t('payment.paid')}: {formatCurrency(guest.amount_paid, getLanguage())}
                          </Text>
                        ) : (
                          <Text style={styles.pendingText}>
                            {t('payment.pending')}: {formatCurrency(guest.amount_due, getLanguage())}
                          </Text>
                        )}
                      </Text>
                    </View>
                  </View>
                  {!guest.is_primary && (
                    <IconButton
                      icon="close"
                      size={20}
                      onPress={() => handleRemoveGuest(guest.id)}
                      iconColor={colors.foregroundMuted}
                      accessibilityLabel={`${t('orders.removeGuest')}: ${guest.guest_name}`}
                    />
                  )}
                </View>
              ))}
            </View>
          </Card.Content>
        </Card>

        {/* Items by Guest */}
        {Object.entries(itemsByGuest).map(([guestName, items]) => (
          <Card key={guestName} style={styles.card}>
            <Card.Content>
              <Text variant="titleSmall" style={styles.guestItemsTitle}>
                {guestName}
              </Text>
              {items.map((item) => (
                <View key={item.id} style={styles.orderItem}>
                  <View style={styles.itemInfo}>
                    <Text variant="bodyMedium" style={styles.itemName}>
                      {item.quantity}x {item.menu_item.name}
                    </Text>
                    <Chip
                      mode="flat"
                      style={[
                        styles.itemStatusChip,
                        { backgroundColor: getStatusColor(item.status) + '20' },
                      ]}
                      textStyle={{
                        color: getStatusColor(item.status),
                        fontSize: 10,
                      }}
                      accessibilityLabel={`${item.menu_item.name}: ${t(`orders.itemStatus.${item.status}`)}`}
                    >
                      {t(`orders.itemStatus.${item.status}`)}
                    </Chip>
                  </View>
                  <Text variant="bodyMedium" style={styles.itemPrice}>
                    {formatCurrency(item.total_price, getLanguage())}
                  </Text>
                </View>
              ))}
            </Card.Content>
          </Card>
        ))}

        {/* Order Summary */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              {t('orders.summary')}
            </Text>
            
            <View style={styles.summaryRow}>
              <Text variant="bodyMedium" style={styles.summaryLabel}>{t('orders.subtotal')}</Text>
              <Text variant="bodyMedium" style={styles.summaryValue}>
                {formatCurrency(order.subtotal_amount, getLanguage())}
              </Text>
            </View>
            
            <View style={styles.summaryRow}>
              <Text variant="bodyMedium" style={styles.summaryLabel}>{t('orders.tax')}</Text>
              <Text variant="bodyMedium" style={styles.summaryValue}>
                {formatCurrency(order.tax_amount, getLanguage())}
              </Text>
            </View>
            
            {order.tip_amount > 0 && (
              <View style={styles.summaryRow}>
                <Text variant="bodyMedium" style={styles.summaryLabel}>{t('orders.tip')}</Text>
                <Text variant="bodyMedium" style={styles.summaryValue}>
                  {formatCurrency(order.tip_amount, getLanguage())}
                </Text>
              </View>
            )}
            
            <Divider style={styles.divider} />
            
            <View style={styles.totalRow}>
              <Text variant="titleLarge" style={styles.totalLabel}>{t('orders.total')}</Text>
              <Text variant="titleLarge" style={styles.totalAmount}>
                {formatCurrency(order.total_amount, getLanguage())}
              </Text>
            </View>
          </Card.Content>
        </Card>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <Button
            mode="outlined"
            onPress={handleAddItems}
            icon="plus"
            style={styles.actionButton}
            accessibilityLabel={t('orders.addItems')}
          >
            {t('orders.addItems')}
          </Button>
          <Button
            mode="contained"
            onPress={handleGoToSplitPayment}
            icon="credit-card-split"
            style={styles.actionButton}
            accessibilityLabel={t('payment.splitPayment')}
          >
            {t('payment.splitPayment')}
          </Button>
        </View>
      </ScrollView>

      {/* Add Guest Modal */}
      <Portal>
        <Modal
          visible={showAddGuestModal}
          onDismiss={() => setShowAddGuestModal(false)}
          contentContainerStyle={styles.modalContent}
        >
          <Text variant="titleLarge" style={styles.modalTitle}>
            {t('orders.addGuest')}
          </Text>
          <TextInput
            label={t('orders.guestName')}
            value={newGuestName}
            onChangeText={setNewGuestName}
            mode="outlined"
            style={styles.guestInput}
            accessibilityLabel={t('orders.guestName')}
          />
          <View style={styles.modalActions}>
            <Button
              mode="text"
              onPress={() => setShowAddGuestModal(false)}
              accessibilityLabel={t('common.cancel')}
            >
              {t('common.cancel')}
            </Button>
            <Button
              mode="contained"
              onPress={handleAddGuest}
              loading={addingGuest}
              disabled={addingGuest || !newGuestName.trim()}
              accessibilityLabel={t('common.add')}
            >
              {t('common.add')}
            </Button>
          </View>
        </Modal>
      </Portal>

      {/* FAB for Quick Actions */}
      <FAB
        icon="silverware-fork-knife"
        style={styles.fab}
        onPress={handleAddItems}
        label={t('orders.addItems')}
        accessibilityLabel={t('orders.addItems')}
      />
    </View>
  
    </ScreenContainer>
  );
}
