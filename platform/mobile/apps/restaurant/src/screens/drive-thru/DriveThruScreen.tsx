import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Vibration,
} from 'react-native';
import { Text, Card, Button, Badge, IconButton } from 'react-native-paper';
import { useI18n } from '@/shared/hooks/useI18n';
import { useColors, useOkinawaTheme } from '@okinawa/shared/contexts/ThemeContext';
import { spacing, borderRadius } from '@okinawa/shared/theme/spacing';
import { typography } from '@okinawa/shared/theme/typography';
import ApiService from '@/shared/services/api';
import socketService from '../../services/socket';

interface DriveThruOrder {
  id: string;
  orderNumber: number;
  lanePosition: number;
  status: 'queued' | 'preparing' | 'ready' | 'picked_up';
  items: Array<{ name: string; quantity: number }>;
  total: number;
  createdAt: string;
  vehicleDescription?: string;
  customer_lat?: number;
  customer_lng?: number;
  distance_km?: number;
}

/**
 * Haversine formula for distance between two geo points
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * DriveThruScreen
 *
 * Restaurant-side screen for managing drive-thru lane orders.
 * Shows cars in queue, current order being prepared, and ready orders
 * for pickup. Uses real-time socket updates and TanStack Query.
 */
export default function DriveThruScreen() {
  const { t } = useI18n();
  const { isDark } = useOkinawaTheme();
  const colors = useColors();

  const [orders, setOrders] = useState<DriveThruOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [restaurantLocation, setRestaurantLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Fetch restaurant location for proximity sorting
  useEffect(() => {
    ApiService.get('/restaurants/me')
      .then((res: any) => {
        if (res.data?.latitude && res.data?.longitude) {
          setRestaurantLocation({ lat: res.data.latitude, lng: res.data.longitude });
        }
      })
      .catch(() => {});
  }, []);

  // Sort orders by proximity when restaurant location is available
  const sortedOrders = useMemo(() => {
    if (!restaurantLocation) return orders;
    return [...orders].map((order) => {
      if (order.customer_lat && order.customer_lng) {
        return {
          ...order,
          distance_km: haversineDistance(
            restaurantLocation.lat, restaurantLocation.lng,
            order.customer_lat, order.customer_lng,
          ),
        };
      }
      return order;
    }).sort((a, b) => {
      // Prioritize by status first (ready > preparing > queued), then by distance
      const statusOrder = { ready: 0, preparing: 1, queued: 2, picked_up: 3 };
      const statusDiff = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
      if (statusDiff !== 0) return statusDiff;
      return (a.distance_km ?? 999) - (b.distance_km ?? 999);
    });
  }, [orders, restaurantLocation]);

  const statusColors: Record<string, string> = useMemo(
    () => ({
      queued: colors.warning,
      preparing: colors.info,
      ready: colors.success,
      picked_up: colors.foregroundMuted,
    }),
    [colors],
  );

  const loadOrders = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await ApiService.get('/orders?serviceType=drive-thru&status=queued,preparing,ready');
      setOrders(res.data);
    } catch (error) {
      console.error('Failed to load drive-thru orders:', error);
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();

    socketService.connect();
    socketService.on('order:new', ((order: unknown) => {
      setOrders((prev) => [...prev, order as DriveThruOrder]);
    }) as (data: unknown) => void);
    socketService.on('order:updated', ((order: unknown) => {
      setOrders((prev) => prev.map((o) => (o.id === (order as DriveThruOrder).id ? order as DriveThruOrder : o)));
    }) as (data: unknown) => void);

    return () => {
      socketService.off('order:new');
      socketService.off('order:updated');
    };
  }, [loadOrders]);

  const handleConfirmPickup = useCallback(
    async (orderId: string) => {
      try {
        await ApiService.patch(`/orders/${orderId}/status`, { status: 'picked_up' });
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status: 'picked_up' as const } : o)),
        );
      } catch (error) {
        Alert.alert(t('common.error'), t('errors.generic'));
      }
    },
    [t],
  );

  const queuedOrders = useMemo(
    () => orders.filter((o) => o.status === 'queued'),
    [orders],
  );
  const preparingOrders = useMemo(
    () => orders.filter((o) => o.status === 'preparing'),
    [orders],
  );
  const readyOrders = useMemo(
    () => orders.filter((o) => o.status === 'ready'),
    [orders],
  );

  const renderLaneItem = useCallback(
    ({ item }: { item: DriveThruOrder }) => (
      <Card
        style={[
          styles.orderCard,
          {
            backgroundColor: colors.card,
            borderLeftColor: statusColors[item.status],
            borderLeftWidth: 4,
          },
        ]}
      >
        <Card.Content>
          <View style={styles.orderHeader}>
            <View style={styles.orderNumberContainer}>
              <Text
                style={[
                  typography.h2,
                  { color: statusColors[item.status] },
                ]}
              >
                #{item.orderNumber}
              </Text>
              {item.vehicleDescription ? (
                <Text
                  style={[
                    typography.bodySmall,
                    { color: colors.foregroundSecondary },
                  ]}
                >
                  {item.vehicleDescription}
                </Text>
              ) : null}
            </View>
            <Badge
              style={[
                styles.statusBadge,
                { backgroundColor: statusColors[item.status] },
              ]}
            >
              {item.status === 'queued'
                ? t('driveThru.lane')
                : item.status === 'preparing'
                  ? t('common.loading')
                  : t('driveThru.orderReady')}
            </Badge>
          </View>

          <View style={styles.itemsList}>
            {item.items.map((orderItem, idx) => (
              <Text
                key={`${item.id}-item-${idx}`}
                style={[typography.bodyMedium, { color: colors.foreground }]}
              >
                {orderItem.quantity}x {orderItem.name}
              </Text>
            ))}
          </View>

          {item.status === 'ready' && (
            <Button
              mode="contained"
              onPress={() => handleConfirmPickup(item.id)}
              style={[styles.pickupButton, { backgroundColor: colors.success }]}
              labelStyle={{ color: colors.foregroundInverse }}
              accessibilityRole="button"
              accessibilityLabel={`Confirm pickup for order ${item.orderNumber}`}
            >
              {t('driveThru.confirmPickup')}
            </Button>
          )}
        </Card.Content>
      </Card>
    ),
    [colors, statusColors, t, handleConfirmPickup],
  );

  const renderReadyBanner = useCallback(
    ({ item }: { item: DriveThruOrder }) => (
      <View
        style={[
          styles.readyBanner,
          { backgroundColor: colors.success },
        ]}
      >
        <Text style={[typography.displayMedium, { color: colors.foregroundInverse }]}>
          {t('driveThru.orderReady')}
        </Text>
        <Text style={[typography.displayLarge, { color: colors.foregroundInverse }]}>
          #{item.orderNumber}
        </Text>
        <TouchableOpacity
          style={[styles.confirmBannerButton, { backgroundColor: colors.foregroundInverse }]}
          onPress={() => handleConfirmPickup(item.id)}
          accessibilityRole="button"
          accessibilityLabel={`Confirm pickup for order ${item.orderNumber}`}
        >
          <Text style={[typography.buttonLarge, { color: colors.success }]}>
            {t('driveThru.confirmPickup')}
          </Text>
        </TouchableOpacity>
      </View>
    ),
    [colors, t, handleConfirmPickup],
  );

  return (
    <ScreenContainer>
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[typography.h1, { color: colors.foreground }]}>
          {t('driveThru.title')}
        </Text>
        <View style={styles.statsRow}>
          <View style={[styles.statChip, { backgroundColor: colors.warningBackground }]}>
            <Text style={[typography.labelMedium, { color: colors.warning }]}>
              {t('driveThru.lane')}: {queuedOrders.length}
            </Text>
          </View>
          <View style={[styles.statChip, { backgroundColor: colors.successBackground }]}>
            <Text style={[typography.labelMedium, { color: colors.success }]}>
              {t('driveThru.orderReady')}: {readyOrders.length}
            </Text>
          </View>
        </View>
      </View>

      {/* Ready orders big display */}
      {readyOrders.length > 0 && (
        <FlatList
          data={readyOrders}
          horizontal
          keyExtractor={(item) => `ready-${item.id}`}
          renderItem={renderReadyBanner}
          showsHorizontalScrollIndicator={false}
          style={styles.readyList}
          contentContainerStyle={styles.readyListContent}
        />
      )}

      {/* Lane queue */}
      <FlatList
        data={[...preparingOrders, ...queuedOrders]}
        keyExtractor={(item) => item.id}
        renderItem={renderLaneItem}
        contentContainerStyle={styles.listContent}
        refreshing={isLoading}
        onRefresh={loadOrders}
        getItemLayout={(_, index) => ({
          length: 148,
          offset: 148 * index,
          index,
        })}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text
              style={[typography.bodyLarge, { color: colors.foregroundMuted }]}
            >
              {t('empty.orders')}
            </Text>
          </View>
        }
      />
    </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: spacing[6],
    paddingBottom: spacing[4],
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[2],
  },
  statChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.pill,
  },
  readyList: {
    maxHeight: 200,
  },
  readyListContent: {
    paddingHorizontal: spacing.screenHorizontal,
    gap: spacing[3],
  },
  readyBanner: {
    width: 260,
    borderRadius: borderRadius.cardLarge,
    padding: spacing[6],
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[3],
  },
  confirmBannerButton: {
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.button,
    marginTop: spacing[2],
  },
  listContent: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingVertical: spacing[4],
    gap: spacing[3],
  },
  orderCard: {
    borderRadius: borderRadius.card,
    marginBottom: spacing[2],
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[2],
  },
  orderNumberContainer: {
    gap: spacing[0.5],
  },
  statusBadge: {
    alignSelf: 'flex-start',
  },
  itemsList: {
    gap: spacing[1],
    marginBottom: spacing[3],
  },
  pickupButton: {
    borderRadius: borderRadius.button,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[20],
  },
});
