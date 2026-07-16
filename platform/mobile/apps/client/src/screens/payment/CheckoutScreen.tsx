import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Animated,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
} from 'react-native';
import {
  Text,
  Card,
  Button,
  Divider,
  Chip,
  ActivityIndicator,
} from 'react-native-paper';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';

import ApiService from '@/shared/services/api';
import { useI18n } from '@/shared/hooks/useI18n';
import { formatCurrency } from '@okinawa/shared/utils/formatters';
import { getLanguage } from '@okinawa/shared/i18n';
import { useScreenTracking, useAnalytics } from '@/shared/hooks/useAnalytics';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import type { RootStackParamList } from '../../types';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { usePullToRefresh } from '@okinawa/shared/hooks/usePullToRefresh';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SERVICE_FEE_PERCENT = 0.10;
const TIP_OPTIONS = [0, 10, 15, 20];

interface OrderItem {
  id: string;
  menu_item: {
    name: string;
    price: number;
  };
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface Order {
  id: string;
  restaurant_id: string;
  order_type?: string;
  table_id?: string;
  subtotal_amount: number;
  tax_amount: number;
  tip_amount: number;
  total_amount: number;
  status: string;
  items: OrderItem[];
  restaurant?: {
    name: string;
  };
}

// Skeleton placeholder component
const SkeletonBlock = ({ width, height, style }: { width: number | string; height: number; style?: any }) => {
  const colors = useColors();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: 6,
          backgroundColor: colors.backgroundTertiary,
          opacity,
        },
        style,
      ]}
    />
  );
};

const CheckoutSkeleton = () => {
  const colors = useColors();
  const skeletonStyles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.backgroundSecondary,
          padding: 16,
        },
        card: {
          marginBottom: 16,
          backgroundColor: colors.card,
          padding: 16,
          borderRadius: 12,
        },
        row: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginBottom: 12,
        },
      }),
    [colors],
  );

  return (
    <View style={skeletonStyles.container}>
      <SkeletonBlock width={200} height={28} style={{ marginBottom: 8 }} />
      <SkeletonBlock width={260} height={16} style={{ marginBottom: 20 }} />
      <View style={skeletonStyles.card}>
        <SkeletonBlock width={120} height={20} style={{ marginBottom: 16 }} />
        {[1, 2, 3].map((i) => (
          <View key={i} style={skeletonStyles.row}>
            <SkeletonBlock width={180} height={16} />
            <SkeletonBlock width={60} height={16} />
          </View>
        ))}
      </View>
      <View style={skeletonStyles.card}>
        <SkeletonBlock width={160} height={20} style={{ marginBottom: 16 }} />
        <View style={skeletonStyles.row}>
          <SkeletonBlock width={100} height={16} />
          <SkeletonBlock width={80} height={16} />
        </View>
        <View style={skeletonStyles.row}>
          <SkeletonBlock width={140} height={16} />
          <SkeletonBlock width={80} height={16} />
        </View>
        <View style={skeletonStyles.row}>
          <SkeletonBlock width={80} height={24} />
          <SkeletonBlock width={100} height={24} />
        </View>
      </View>
      <SkeletonBlock width="100%" height={48} style={{ borderRadius: 24, marginTop: 16 }} />
    </View>
  );
};

export default function CheckoutScreen() {
  useScreenTracking('Checkout');

  const route = useRoute();
  const navigation = useNavigation<NavigationProp>();
  const colors = useColors();
  const { t } = useI18n();
  const analytics = useAnalytics();

  const { orderId } = route.params as { orderId: string };

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTip, setSelectedTip] = useState<number>(10);

  useEffect(() => {
    loadOrder();
  }, [orderId]);

  const loadOrder = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const orderData = await ApiService.getOrder(orderId);
      setOrder(orderData);
    } catch (err: any) {
      console.error('Failed to load order:', err);
      setError(t('checkout.errorLoad'));
      await analytics.logError('Failed to load checkout order', 'CHECKOUT_LOAD_ERROR', false);
    } finally {
      setLoading(false);
    }
  }, [orderId, t, analytics]);

  const pullToRefresh = usePullToRefresh(loadOrder);

  const subtotal = useMemo(() => {
    if (!order) return 0;
    return order.subtotal_amount;
  }, [order]);

  const serviceFee = useMemo(() => subtotal * SERVICE_FEE_PERCENT, [subtotal]);

  const tipAmount = useMemo(() => subtotal * (selectedTip / 100), [subtotal, selectedTip]);

  const total = useMemo(() => subtotal + serviceFee + tipAmount, [subtotal, serviceFee, tipAmount]);

  const fmtCurrency = useCallback((value: number) =>
    formatCurrency(value, getLanguage()),
  []);

  const handleConfirmAndPay = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate('UnifiedPayment', { orderId });
  }, [navigation, orderId]);

  const handleBackToCart = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleRetry = useCallback(() => {
    loadOrder();
  }, [loadOrder]);

  const getServiceTypeBadge = useCallback(() => {
    if (!order) return null;
    if (order.order_type === 'delivery') {
      return t('checkout.badgeDelivery');
    }
    if (order.order_type === 'pickup') {
      return t('checkout.badgePickup');
    }
    if (order.table_id) {
      return t('checkout.badgeTable', { number: order.table_id });
    }
    return null;
  }, [order, t]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.backgroundSecondary,
        },
        scrollContent: {
          padding: 16,
          paddingBottom: 32,
        },
        headerTitle: {
          color: colors.foreground,
          marginBottom: 4,
        },
        headerSubtitle: {
          color: colors.foregroundSecondary,
          marginBottom: 16,
        },
        badge: {
          alignSelf: 'flex-start',
          marginBottom: 16,
          backgroundColor: colors.primary + '15',
        },
        badgeText: {
          color: colors.primary,
        },
        card: {
          marginBottom: 16,
          backgroundColor: colors.card,
          borderRadius: 12,
        },
        sectionTitle: {
          marginBottom: 12,
          color: colors.foreground,
        },
        orderItem: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        },
        itemLeft: {
          flex: 1,
          marginRight: 12,
        },
        itemName: {
          color: colors.foreground,
        },
        itemQty: {
          color: colors.foregroundSecondary,
        },
        itemPrice: {
          color: colors.foreground,
          fontWeight: '600',
        },
        divider: {
          marginVertical: 12,
          backgroundColor: colors.border,
        },
        summaryRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginBottom: 8,
        },
        summaryLabel: {
          color: colors.foregroundSecondary,
        },
        summaryValue: {
          color: colors.foreground,
        },
        totalRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 4,
        },
        totalLabel: {
          color: colors.foreground,
          fontWeight: 'bold',
        },
        totalValue: {
          color: colors.primary,
          fontWeight: 'bold',
        },
        tipSection: {
          marginBottom: 16,
        },
        tipLabel: {
          color: colors.foreground,
          marginBottom: 8,
        },
        tipOptionsRow: {
          flexDirection: 'row',
          gap: 8,
        },
        tipOption: {
          flex: 1,
          paddingVertical: 10,
          borderRadius: 8,
          borderWidth: 1.5,
          alignItems: 'center',
        },
        tipOptionSelected: {
          backgroundColor: colors.primary + '15',
          borderColor: colors.primary,
        },
        tipOptionUnselected: {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
        tipOptionText: {
          fontWeight: '600',
          fontSize: 14,
        },
        tipOptionAmount: {
          fontSize: 12,
          marginTop: 2,
        },
        confirmButton: {
          marginTop: 8,
          marginBottom: 8,
          backgroundColor: colors.primary,
          borderRadius: 24,
        },
        confirmButtonLabel: {
          paddingVertical: 4,
          fontSize: 16,
          fontWeight: '600',
        },
        backButton: {
          marginBottom: 16,
        },
        errorContainer: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.backgroundSecondary,
          padding: 32,
        },
        errorText: {
          color: colors.error,
          textAlign: 'center',
          marginBottom: 16,
        },
        emptyContainer: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.backgroundSecondary,
          padding: 32,
        },
        emptyText: {
          color: colors.foregroundSecondary,
          textAlign: 'center',
        },
      }),
    [colors],
  );

  // Loading state
  if (loading) {
    return (<ScreenContainer><CheckoutSkeleton /></ScreenContainer>);
  }

  // Error state
  if (error) {
    return (
      <ScreenContainer>
      <View style={styles.errorContainer}>
        <Text variant="bodyLarge" style={styles.errorText}>
          {error}
        </Text>
        <Button mode="contained" onPress={handleRetry} buttonColor={colors.primary}>
          {t('checkout.errorRetry')}
        </Button>
      </View>
    
      </ScreenContainer>
    );
  }

  // Empty state
  if (!order || !order.items || order.items.length === 0) {
    return (
      <ScreenContainer>
      <View style={styles.emptyContainer}>
        <Text variant="bodyLarge" style={styles.emptyText}>
          {t('checkout.empty')}
        </Text>
        <Button mode="text" onPress={handleBackToCart} style={{ marginTop: 12 }}>
          {t('checkout.buttonBack')}
        </Button>
      </View>
    
      </ScreenContainer>
    );
  }

  const serviceTypeBadge = getServiceTypeBadge();

  return (
    <ScreenContainer>
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={pullToRefresh.refreshing} onRefresh={() => { void pullToRefresh.onRefresh(); }} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        {/* Header */}
        <Text variant="headlineSmall" style={styles.headerTitle}>
          {t('checkout.title')}
        </Text>
        <Text variant="bodyMedium" style={styles.headerSubtitle}>
          {t('checkout.subtitle')}
        </Text>

        {/* Service Type Badge */}
        {serviceTypeBadge && (
          <Chip
            mode="flat"
            style={styles.badge}
            textStyle={styles.badgeText}
            icon="map-marker"
          >
            {serviceTypeBadge}
          </Chip>
        )}

        {/* Order Items Card */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              {t('checkout.sectionItems')}
            </Text>

            {order.items.map((item) => (
              <View key={item.id} style={styles.orderItem}>
                <View style={styles.itemLeft}>
                  <Text variant="bodyMedium" style={styles.itemName}>
                    {item.menu_item.name}
                  </Text>
                  <Text variant="bodySmall" style={styles.itemQty}>
                    {item.quantity}x {fmtCurrency(item.menu_item.price)}
                  </Text>
                </View>
                <Text variant="bodyMedium" style={styles.itemPrice}>
                  {fmtCurrency(item.menu_item.price * item.quantity)}
                </Text>
              </View>
            ))}
          </Card.Content>
        </Card>

        {/* Tip Selection */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.tipLabel}>
              {t('checkout.tipLabel')}
            </Text>
            <View style={styles.tipOptionsRow}>
              {TIP_OPTIONS.map((tip) => {
                const isSelected = selectedTip === tip;
                return (
                  <TouchableOpacity
                    key={tip}
                    style={[
                      styles.tipOption,
                      isSelected ? styles.tipOptionSelected : styles.tipOptionUnselected,
                    ]}
                    onPress={() => setSelectedTip(tip)}
                    activeOpacity={0.7}
                    accessibilityLabel={tip === 0 ? 'No tip' : `${tip}% tip`}
                  >
                    <Text
                      style={[
                        styles.tipOptionText,
                        { color: isSelected ? colors.primary : colors.foreground },
                      ]}
                    >
                      {tip === 0 ? t('checkout.tipNone') : `${tip}%`}
                    </Text>
                    {tip > 0 && (
                      <Text
                        style={[
                          styles.tipOptionAmount,
                          { color: isSelected ? colors.primary : colors.foregroundMuted },
                        ]}
                      >
                        {fmtCurrency(subtotal * (tip / 100))}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </Card.Content>
        </Card>

        {/* Order Summary Card */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              {t('checkout.sectionSummary')}
            </Text>

            <View style={styles.summaryRow}>
              <Text variant="bodyMedium" style={styles.summaryLabel}>
                {t('checkout.subtotal')}
              </Text>
              <Text variant="bodyMedium" style={styles.summaryValue}>
                {fmtCurrency(subtotal)}
              </Text>
            </View>

            <View style={styles.summaryRow}>
              <Text variant="bodyMedium" style={styles.summaryLabel}>
                {t('checkout.serviceFee')}
              </Text>
              <Text variant="bodyMedium" style={styles.summaryValue}>
                {fmtCurrency(serviceFee)}
              </Text>
            </View>

            {selectedTip > 0 && (
              <View style={styles.summaryRow}>
                <Text variant="bodyMedium" style={styles.summaryLabel}>
                  {t('checkout.tipLabel')} ({selectedTip}%)
                </Text>
                <Text variant="bodyMedium" style={styles.summaryValue}>
                  {fmtCurrency(tipAmount)}
                </Text>
              </View>
            )}

            <Divider style={styles.divider} />

            <View style={styles.totalRow}>
              <Text variant="titleLarge" style={styles.totalLabel}>
                {t('checkout.total')}
              </Text>
              <Text variant="titleLarge" style={styles.totalValue}>
                {fmtCurrency(total)}
              </Text>
            </View>
          </Card.Content>
        </Card>

        {/* CTA Buttons */}
        <Button
          mode="contained"
          onPress={handleConfirmAndPay}
          style={styles.confirmButton}
          labelStyle={styles.confirmButtonLabel}
          icon="lock"
        >
          {t('checkout.buttonConfirm')}
        </Button>

        <Button
          mode="text"
          onPress={handleBackToCart}
          style={styles.backButton}
          textColor={colors.foregroundSecondary}
        >
          {t('checkout.buttonBack')}
        </Button>
      </ScrollView>
    </View>
  
    </ScreenContainer>
  );
}
