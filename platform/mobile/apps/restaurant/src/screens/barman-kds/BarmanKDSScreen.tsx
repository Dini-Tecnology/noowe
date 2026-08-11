/**
 * BarmanKDSScreen - Bar Kitchen Display System
 * 
 * Displays drink orders for bartenders with status management.
 * Migrated to semantic tokens using useColors() + useMemo pattern.
 * 
 * @module restaurant/screens/barman-kds
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl, Alert } from 'react-native';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  Text,
  Card,
  Button,
  Chip,
  Badge,
  IconButton,
  SegmentedButtons,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import ApiService from '@/shared/services/api';
import { useColors } from '@/shared/theme';
import { t } from '@/shared/i18n';

interface DrinkItem {
  id: string;
  name: string;
  quantity: number;
  instructions?: string;
  modifiers?: string[];
}

interface DrinkOrder {
  id: string;
  order_number: string;
  table_number: string;
  items: DrinkItem[];
  status: 'pending' | 'preparing' | 'ready';
  created_at: string;
  priority: 'normal' | 'high' | 'urgent';
  waiter_name?: string;
  source?: string;
  delivery_rider_eta?: number;
}

/** Platform brand colors for delivery source badges */
const getPLATFORM_COLORS = (colors: any): Record<string, string> => ({
  ifood: colors.error,
  rappi: colors.primary,
  ubereats: colors.success,
});

export default function BarmanKDSScreen() {
  const colors = useColors();
  const PLATFORM_COLORS = getPLATFORM_COLORS(colors);
  const [orders, setOrders] = useState<DrinkOrder[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'preparing' | 'ready'>('all');
  const [loading, setLoading] = useState(true);

  // Memoized styles based on theme colors
  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.backgroundSecondary,
    },
    header: {
      flexDirection: 'row',
      padding: 16,
      gap: 10,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      elevation: 2,
    },
    statNumber: {
      fontWeight: 'bold',
      marginTop: 8,
      color: colors.foreground,
    },
    statLabel: {
      color: colors.mutedForeground,
      marginTop: 4,
    },
    segmentedButtons: {
      marginHorizontal: 15,
      marginBottom: 15,
    },
    scrollContent: {
      padding: 16,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 100,
    },
    emptyTitle: {
      marginTop: 20,
      marginBottom: 10,
      color: colors.foreground,
    },
    emptyText: {
      color: colors.mutedForeground,
      textAlign: 'center',
    },
    orderCard: {
      marginBottom: 15,
      elevation: 3,
      backgroundColor: colors.card,
    },
    urgentCard: {
      borderLeftWidth: 5,
      borderLeftColor: colors.error,
    },
    readyCard: {
      backgroundColor: colors.successBackground,
    },
    orderHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 10,
    },
    orderHeaderLeft: {
      flex: 1,
    },
    orderNumber: {
      fontWeight: 'bold',
      marginBottom: 5,
      color: colors.foreground,
    },
    tableInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    tableNumber: {
      fontWeight: '600',
      color: colors.foreground,
    },
    orderHeaderRight: {
      alignItems: 'flex-end',
    },
    priorityChip: {
      borderWidth: 1.5,
    },
    urgentBadge: {
      backgroundColor: colors.error,
    },
    waiterInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginBottom: 15,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    waiterName: {
      color: colors.mutedForeground,
    },
    itemsContainer: {
      marginBottom: 15,
    },
    itemRow: {
      marginBottom: 12,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    itemInfo: {
      flex: 1,
    },
    itemHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    itemName: {
      fontWeight: '600',
      flex: 1,
      color: colors.foreground,
    },
    modifiers: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 5,
      marginTop: 8,
    },
    modifierChip: {
      height: 24,
      backgroundColor: colors.backgroundSecondary,
    },
    instructions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginTop: 8,
      padding: 8,
      backgroundColor: colors.warningBackground,
      borderRadius: 6,
    },
    instructionsText: {
      color: colors.warning,
      flex: 1,
      fontStyle: 'italic',
    },
    actions: {
      marginTop: 10,
    },
    startButton: {
      backgroundColor: colors.info,
    },
    completeButton: {
      backgroundColor: colors.success,
    },
    readyStatus: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 10,
      gap: 10,
    },
    readyText: {
      color: colors.success,
      fontWeight: 'bold',
    },
    sourceBadge: {
      height: 22,
      borderRadius: 4,
      paddingHorizontal: 6,
      alignSelf: 'flex-start' as const,
      marginTop: 4,
    },
    sourceBadgeText: {
      fontSize: 10,
      fontWeight: '700' as const,
      color: colors.premiumCardForeground,
    },
    riderEta: {
      fontSize: 12,
      color: colors.info,
      marginTop: 4,
    },
  }), [colors]);

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [filter]);

  const loadOrders = async () => {
    try {
      const data = await ApiService.getBarOrders({
        status: filter !== 'all' ? filter : undefined,
      });
      setOrders(data);
    } catch (error) {
      console.error('Failed to load bar orders:', error);
      Alert.alert('Erro', 'Não foi possível carregar os pedidos');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  };

  const handleStartOrder = async (orderId: string) => {
    try {
      await ApiService.updateOrderStatus(orderId, 'preparing');
      await loadOrders();
    } catch (error) {
      console.error('Failed to start order:', error);
      Alert.alert(t('common.error'), t('barman.alerts.startError'));
    }
  };

  const handleCompleteOrder = async (orderId: string) => {
    try {
      await ApiService.updateOrderStatus(orderId, 'ready');
      Alert.alert(t('barman.alerts.orderReady'), t('barman.alerts.waiterNotified'));
      await loadOrders();
    } catch (error) {
      console.error('Failed to complete order:', error);
      Alert.alert(t('common.error'), t('barman.alerts.completeError'));
    }
  };

  /**
   * Handles cancellation of a bar item.
   * Shows confirmation dialog and calls API to cancel the item.
   */
  const handleCancelItem = (orderId: string, itemId: string) => {
    Alert.alert(
      t('barman.alerts.cancelItemTitle'),
      t('barman.alerts.cancelItemMsg'),
      [
        { text: t('common.no'), style: 'cancel' },
        {
          text: t('common.yes'),
          style: 'destructive',
          onPress: async () => {
            try {
              await ApiService.cancelBarItem(orderId, itemId, 'Item cancelled by bar staff');
              setOrders(
                orders.map((order) =>
                  order.id === orderId
                    ? {
                        ...order,
                        items: order.items.filter((item) => item.id !== itemId),
                      }
                    : order
                )
              );
              Alert.alert(t('common.success'), t('barman.alerts.cancelSuccess'));
            } catch (error) {
              console.error('Failed to cancel item:', error);
              Alert.alert(t('common.error'), t('barman.alerts.cancelError'));
            }
          },
        },
      ]
    );
  };

  const getTimeElapsed = (createdAt: string) => {
    const minutes = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
    return `${minutes} min`;
  };

  /**
   * Gets priority color using semantic tokens
   */
  const getPriorityColor = useCallback((priority: string) => {
    switch (priority) {
      case 'urgent':
        return colors.error;
      case 'high':
        return colors.warning;
      default:
        return colors.success;
    }
  }, [colors]);

  const filteredOrders = orders.filter((order) => {
    if (filter === 'all') return true;
    return order.status === filter;
  });

  const pendingCount = orders.filter((o) => o.status === 'pending').length;
  const preparingCount = orders.filter((o) => o.status === 'preparing').length;
  const readyCount = orders.filter((o) => o.status === 'ready').length;

  return (
    <ScreenContainer>
    <View style={styles.container}>
      {/* Header Stats */}
      <View style={styles.header}>
        <View style={styles.statCard}>
          <Icon name="clock-outline" size={24} color={colors.warning} />
          <Text variant="headlineSmall" style={styles.statNumber}>
            {pendingCount}
          </Text>
          <Text variant="bodySmall" style={styles.statLabel}>
            {t('barman.stats.pending')}
          </Text>
        </View>

        <View style={styles.statCard}>
          <Icon name="beaker" size={24} color={colors.info} />
          <Text variant="headlineSmall" style={styles.statNumber}>
            {preparingCount}
          </Text>
          <Text variant="bodySmall" style={styles.statLabel}>
            {t('barman.stats.preparing')}
          </Text>
        </View>

        <View style={styles.statCard}>
          <Icon name="check-circle" size={24} color={colors.success} />
          <Text variant="headlineSmall" style={styles.statNumber}>
            {readyCount}
          </Text>
          <Text variant="bodySmall" style={styles.statLabel}>
            {t('barman.stats.ready')}
          </Text>
        </View>
      </View>

      {/* Filter Buttons */}
      <SegmentedButtons
        value={filter}
        onValueChange={(value) => setFilter(value as any)}
        buttons={[
          { value: 'all', label: t('barman.filter.all'), icon: 'view-grid' },
          { value: 'pending', label: t('barman.filter.pending'), icon: 'clock-outline' },
          { value: 'preparing', label: t('barman.filter.preparing'), icon: 'beaker' },
          { value: 'ready', label: t('barman.filter.ready'), icon: 'check' },
        ]}
        style={styles.segmentedButtons}
      />

      {/* Orders List */}
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.scrollContent}
      >
        {filteredOrders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Icon name="glass-cocktail" size={80} color={colors.muted} />
            <Text variant="headlineSmall" style={styles.emptyTitle}>
              Nenhum Pedido
            </Text>
            <Text variant="bodyMedium" style={styles.emptyText}>
              {filter === 'all'
                ? 'Aguardando novos pedidos de bebidas'
                : `Nenhum pedido no status "${filter}"`}
            </Text>
          </View>
        ) : (
          filteredOrders.map((order) => (
            <Card
              key={order.id}
              style={[
                styles.orderCard,
                order.priority === 'urgent' && styles.urgentCard,
                order.status === 'ready' && styles.readyCard,
              ]}
            >
              <Card.Content>
                {/* Order Header */}
                <View style={styles.orderHeader}>
                  <View style={styles.orderHeaderLeft}>
                    <Text variant="titleLarge" style={styles.orderNumber}>
                      {order.order_number}
                    </Text>
                    <View style={styles.tableInfo}>
                      <Icon name="table-furniture" size={20} color={colors.mutedForeground} />
                      <Text variant="titleMedium" style={styles.tableNumber}>
                        Mesa {order.table_number}
                      </Text>
                    </View>
                    {order.source && order.source !== 'noowe' && (
                      <View style={[styles.sourceBadge, { backgroundColor: PLATFORM_COLORS[order.source] || colors.mutedForeground }]}>
                        <Text style={styles.sourceBadgeText}>
                          {t(`kds.order_source.${order.source}`)}
                        </Text>
                      </View>
                    )}
                    {order.delivery_rider_eta != null && (
                      <Text style={styles.riderEta}>
                        {t('kds.delivery.rider_eta', { minutes: String(order.delivery_rider_eta) })}
                      </Text>
                    )}
                  </View>

                  <View style={styles.orderHeaderRight}>
                    <Chip
                      icon="clock"
                      textStyle={{ color: getPriorityColor(order.priority) }}
                      style={[
                        styles.priorityChip,
                        { borderColor: getPriorityColor(order.priority) },
                      ]}
                      mode="outlined"
                      accessibilityLabel={`Time elapsed ${getTimeElapsed(order.created_at)}, priority ${order.priority}`}
                    >
                      {getTimeElapsed(order.created_at)}
                    </Chip>
                    {order.priority === 'urgent' && (
                      <Badge style={styles.urgentBadge}>URGENTE</Badge>
                    )}
                  </View>
                </View>

                {/* Waiter Info */}
                {order.waiter_name && (
                  <View style={styles.waiterInfo}>
                    <Icon name="account" size={16} color={colors.mutedForeground} />
                    <Text variant="bodySmall" style={styles.waiterName}>
                      {order.waiter_name}
                    </Text>
                  </View>
                )}

                {/* Order Items */}
                <View style={styles.itemsContainer}>
                  {order.items.map((item) => (
                    <View key={item.id} style={styles.itemRow}>
                      <View style={styles.itemInfo}>
                        <View style={styles.itemHeader}>
                          <Text variant="titleMedium" style={styles.itemName}>
                            {item.quantity}x {item.name}
                          </Text>
                          {order.status === 'preparing' && (
                            <IconButton
                              icon="close-circle"
                              size={20}
                              iconColor={colors.error}
                              onPress={() => handleCancelItem(order.id, item.id)}
                              accessibilityLabel={`Cancel item ${item.name}`}
                            />
                          )}
                        </View>

                        {item.modifiers && (
                          <View style={styles.modifiers}>
                            {item.modifiers.map((mod, i) => (
                              <Chip key={i} style={styles.modifierChip} compact>
                                {mod}
                              </Chip>
                            ))}
                          </View>
                        )}

                        {item.instructions && (
                          <View style={styles.instructions}>
                            <Icon name="note-text" size={14} color={colors.warning} />
                            <Text variant="bodySmall" style={styles.instructionsText}>
                              {item.instructions}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  ))}
                </View>

                {/* Action Buttons */}
                <View style={styles.actions}>
                  {order.status === 'pending' && (
                    <Button
                      mode="contained"
                      onPress={() => handleStartOrder(order.id)}
                      style={styles.startButton}
                      icon="play"
                      accessibilityLabel={`Start preparing order ${order.order_number}`}
                    >
                      Iniciar Preparo
                    </Button>
                  )}

                  {order.status === 'preparing' && (
                    <Button
                      mode="contained"
                      onPress={() => handleCompleteOrder(order.id)}
                      style={styles.completeButton}
                      icon="check"
                      accessibilityLabel={`Mark order ${order.order_number} as complete`}
                    >
                      {t('barman.action.complete')}
                    </Button>
                  )}

                  {order.status === 'ready' && (
                    <View style={styles.readyStatus}>
                      <Icon name="check-circle" size={24} color={colors.success} />
                      <Text variant="titleMedium" style={styles.readyText}>
                        {t('barman.action.readyStatus')}
                      </Text>
                    </View>
                  )}
                </View>
              </Card.Content>
            </Card>
          ))
        )}
      </ScrollView>
    </View>
    </ScreenContainer>
  );
}
