/**
 * TabPaymentScreen — Payment screen for closing a Pub & Bar tab (comanda)
 *
 * Features:
 * - Tab summary with all items grouped, subtotal, service fee, total
 * - Payment method selector (PIX, credit card, Apple Pay, Google Pay, wallet)
 * - Split option: "Dividir com a mesa" button
 * - "Pagar agora" CTA that closes the tab and processes payment
 * - Success state with receipt link
 *
 * Reuses payment method patterns from UnifiedPaymentScreen.
 *
 * @module client/screens/pub-bar/TabPaymentScreen
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
  TouchableOpacity,
  Animated,
} from 'react-native';
import {
  Text,
  Card,
  Button,
  Divider,
  RadioButton,
  ActivityIndicator,
  IconButton,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';

import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { t, getLanguage } from '@/shared/i18n';
import { formatCurrency, getCurrencySymbol } from '@okinawa/shared/utils/formatters';
import { useTab, useTabSplitOptions } from '../../hooks/useTab';
import type { TabItem } from '../../hooks/useTab';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';

// ============================================
// TYPES
// ============================================

type TabPaymentRouteProp = RouteProp<{ TabPayment: { tabId: string } }, 'TabPayment'>;
type PaymentMethodType = 'pix' | 'credit' | 'apple' | 'google' | 'wallet';

interface GroupedItem {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

const PAYMENT_METHODS: Array<{
  type: PaymentMethodType;
  icon: string;
  label: string;
  platform?: 'ios' | 'android';
}> = [
  { type: 'pix', icon: 'qrcode', label: 'PIX' },
  { type: 'credit', icon: 'credit-card', label: 'Credit Card' },
  { type: 'apple', icon: 'apple', label: 'Apple Pay', platform: 'ios' },
  { type: 'google', icon: 'google', label: 'Google Pay', platform: 'android' },
  { type: 'wallet', icon: 'wallet', label: 'Wallet' },
];

const SERVICE_FEE_RATE = 0.10; // 10% service fee

// ============================================
// SKELETON LOADER
// ============================================

function PaymentSkeleton({ colors }: { colors: any }) {
  const skeletonStyle = {
    backgroundColor: colors.backgroundTertiary || colors.border,
    borderRadius: 8,
  };

  return (
    <View style={{ padding: 16 }}>
      <View style={[skeletonStyle, { width: 200, height: 24, marginBottom: 16 }]} />
      {[1, 2, 3].map((i) => (
        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
          <View style={[skeletonStyle, { width: 180, height: 16 }]} />
          <View style={[skeletonStyle, { width: 80, height: 16 }]} />
        </View>
      ))}
      <View style={[skeletonStyle, { width: '100%', height: 1, marginVertical: 16 }]} />
      <View style={[skeletonStyle, { width: '100%', height: 48, marginBottom: 16 }]} />
      <View style={[skeletonStyle, { width: '100%', height: 48, marginBottom: 16 }]} />
      <View style={[skeletonStyle, { width: '100%', height: 48, marginBottom: 16 }]} />
    </View>
  );
}

// ============================================
// SUCCESS STATE
// ============================================

function PaymentSuccess({
  colors,
  onViewReceipt,
  onDone,
}: {
  colors: any;
  onViewReceipt: () => void;
  onDone: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 50,
      friction: 7,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        backgroundColor: colors.background,
      }}
    >
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <Icon name="check-circle" size={80} color={colors.success} />
      </Animated.View>
      <Text
        variant="headlineMedium"
        style={{ color: colors.foreground, fontWeight: 'bold', marginTop: 24, textAlign: 'center' }}
      >
        {t('tab.payment.success')}
      </Text>
      <Button
        mode="outlined"
        onPress={onViewReceipt}
        style={{ marginTop: 24, width: '100%' }}
        icon="receipt"
      >
        {t('tab.payment.receipt')}
      </Button>
      <Button
        mode="contained"
        onPress={onDone}
        style={{ marginTop: 12, width: '100%' }}
      >
        {t('common.done')}
      </Button>
    </View>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function TabPaymentScreen() {
  const colors = useColors();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const route = useRoute<TabPaymentRouteProp>();
  const { tabId } = route.params;

  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodType>('pix');
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  const {
    tab,
    isLoading,
    isError,
    tabTotal,
    closeTab,
    processPayment,
    isClosingTab,
    isProcessingPayment,
    refetch,
  } = useTab(tabId);

  // Filter payment methods by platform
  const availableMethods = useMemo(
    () =>
      PAYMENT_METHODS.filter((method) => {
        if (!method.platform) return true;
        return method.platform === Platform.OS;
      }),
    [],
  );

  // Group items by menu_item_id for summary
  const groupedItems = useMemo((): GroupedItem[] => {
    if (!tab?.items) return [];

    const groups = new Map<string, GroupedItem>();

    tab.items.forEach((item: TabItem) => {
      const key = item.menu_item_id;
      const existing = groups.get(key);
      const name = item.menu_item?.name || `Item #${item.menu_item_id.slice(0, 8)}`;

      if (existing) {
        existing.quantity += item.quantity;
        existing.totalPrice += Number(item.total_price) || Number(item.unit_price) * item.quantity;
      } else {
        groups.set(key, {
          menuItemId: key,
          name,
          quantity: item.quantity,
          unitPrice: Number(item.unit_price),
          totalPrice: Number(item.total_price) || Number(item.unit_price) * item.quantity,
        });
      }
    });

    return Array.from(groups.values());
  }, [tab]);

  // Calculate totals
  const subtotal = useMemo(() => {
    return groupedItems.reduce((sum, item) => sum + item.totalPrice, 0);
  }, [groupedItems]);

  const serviceFee = useMemo(() => {
    return subtotal * SERVICE_FEE_RATE;
  }, [subtotal]);

  const total = useMemo(() => {
    return subtotal + serviceFee;
  }, [subtotal, serviceFee]);

  // Handle payment
  const handlePayment = useCallback(async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // First, request tab closure
      await closeTab();

      // Then process payment
      await processPayment({
        amount: total,
        payment_method: selectedMethod,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPaymentSuccess(true);
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(t('common.error'), t('common.retry'));
    }
  }, [closeTab, processPayment, total, selectedMethod]);

  // Handle split navigation
  const handleSplit = useCallback(() => {
    navigation.navigate('SplitPayment', { tabId, source: 'tab' });
  }, [navigation, tabId]);

  // Memoized styles
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        scrollContent: {
          paddingBottom: 120,
        },
        section: {
          backgroundColor: colors.card,
          marginHorizontal: 16,
          marginTop: 16,
          borderRadius: 12,
          padding: 16,
          elevation: 2,
        },
        sectionTitle: {
          color: colors.foreground,
          fontWeight: 'bold',
          marginBottom: 12,
        },
        summaryRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingVertical: 6,
        },
        itemName: {
          color: colors.foreground,
          flex: 1,
        },
        itemPrice: {
          color: colors.foreground,
          fontWeight: '600',
        },
        itemQty: {
          color: colors.foregroundMuted,
          marginRight: 8,
          minWidth: 30,
        },
        divider: {
          marginVertical: 12,
        },
        totalRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingVertical: 4,
        },
        totalLabel: {
          color: colors.foregroundMuted,
        },
        totalValue: {
          color: colors.foreground,
        },
        grandTotalLabel: {
          color: colors.foreground,
          fontWeight: 'bold',
        },
        grandTotalValue: {
          color: colors.primary,
          fontWeight: 'bold',
        },
        methodCard: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 12,
          paddingHorizontal: 12,
          borderRadius: 12,
          borderWidth: 2,
          marginBottom: 8,
        },
        methodCardSelected: {
          borderColor: colors.primary,
          backgroundColor: colors.background,
        },
        methodCardUnselected: {
          borderColor: colors.border,
          backgroundColor: 'transparent',
        },
        methodIcon: {
          marginRight: 12,
        },
        methodLabel: {
          flex: 1,
          color: colors.foreground,
          fontWeight: '600',
        },
        splitButton: {
          marginHorizontal: 16,
          marginTop: 16,
        },
        bottomBar: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingHorizontal: 16,
          paddingVertical: 12,
          paddingBottom: 28,
        },
        bottomTotalRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        },
        errorContainer: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 80,
          paddingHorizontal: 32,
        },
        errorText: {
          textAlign: 'center',
          color: colors.error,
          marginTop: 16,
          marginBottom: 16,
        },
      }),
    [colors],
  );

  // --- Success state ---
  if (paymentSuccess) {
    return (
      <ScreenContainer>
      <PaymentSuccess
        colors={colors}
        onViewReceipt={() => {
          // Navigate to receipt screen or open link
          navigation.goBack();
        }}
        onDone={() => {
          // Navigate back to home
          navigation.popToTop();
        }}
      />
    
      </ScreenContainer>
    );
  }

  // --- Loading state ---
  if (isLoading) {
    return (
      <ScreenContainer>
      <View style={styles.container}>
        <PaymentSkeleton colors={colors} />
      </View>
    
      </ScreenContainer>
    );
  }

  // --- Error state ---
  if (isError || !tab) {
    return (
      <ScreenContainer>
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Icon name="alert-circle-outline" size={64} color={colors.error} />
          <Text variant="bodyLarge" style={styles.errorText}>
            {t('common.error')}
          </Text>
          <Button mode="contained" onPress={() => refetch()}>
            {t('common.retry')}
          </Button>
        </View>
      </View>
    
      </ScreenContainer>
    );
  }

  const isProcessing = isClosingTab || isProcessingPayment;

  return (
    <ScreenContainer>
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Tab Summary */}
        <View style={styles.section}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            {t('tab.payment.summary')}
          </Text>

          {groupedItems.map((item) => (
            <View key={item.menuItemId} style={styles.summaryRow}>
              <Text variant="bodySmall" style={styles.itemQty}>
                {item.quantity}x
              </Text>
              <Text variant="bodyMedium" style={styles.itemName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text variant="bodyMedium" style={styles.itemPrice}>
                {formatCurrency(item.totalPrice, getLanguage())}
              </Text>
            </View>
          ))}

          <Divider style={styles.divider} />

          {/* Subtotal */}
          <View style={styles.totalRow}>
            <Text variant="bodyMedium" style={styles.totalLabel}>
              {t('tab.payment.subtotal')}
            </Text>
            <Text variant="bodyMedium" style={styles.totalValue}>
              {formatCurrency(subtotal, getLanguage())}
            </Text>
          </View>

          {/* Service Fee */}
          <View style={styles.totalRow}>
            <Text variant="bodyMedium" style={styles.totalLabel}>
              {t('tab.payment.serviceFee')} (10%)
            </Text>
            <Text variant="bodyMedium" style={styles.totalValue}>
              {formatCurrency(serviceFee, getLanguage())}
            </Text>
          </View>

          {/* Cover Charge */}
          {Number(tab.cover_charge_amount) > 0 && (
            <View style={styles.totalRow}>
              <Text variant="bodyMedium" style={styles.totalLabel}>
                {t('tab.payment.coverCharge')}
              </Text>
              <Text variant="bodyMedium" style={styles.totalValue}>
                {formatCurrency(Number(tab.cover_charge_amount), getLanguage())}
              </Text>
            </View>
          )}

          {/* Credits */}
          {(Number(tab.cover_charge_credit) > 0 || Number(tab.deposit_credit) > 0) && (
            <View style={styles.totalRow}>
              <Text variant="bodyMedium" style={[styles.totalLabel, { color: colors.success }]}>
                {t('tab.payment.credits')}
              </Text>
              <Text variant="bodyMedium" style={{ color: colors.success }}>
                -{formatCurrency(Number(tab.cover_charge_credit) + Number(tab.deposit_credit), getLanguage())}
              </Text>
            </View>
          )}

          <Divider style={styles.divider} />

          {/* Grand Total */}
          <View style={styles.totalRow}>
            <Text variant="titleMedium" style={styles.grandTotalLabel}>
              {t('tab.total')}
            </Text>
            <Text variant="titleLarge" style={styles.grandTotalValue}>
              {formatCurrency(total, getLanguage())}
            </Text>
          </View>
        </View>

        {/* Payment Method Selector */}
        <View style={styles.section}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            {t('tab.payment.method')}
          </Text>

          {availableMethods.map((method) => (
            <TouchableOpacity
              key={method.type}
              style={[
                styles.methodCard,
                selectedMethod === method.type
                  ? styles.methodCardSelected
                  : styles.methodCardUnselected,
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setSelectedMethod(method.type);
              }}
              accessibilityLabel={method.label}
            >
              <Icon
                name={method.icon}
                size={24}
                color={selectedMethod === method.type ? colors.primary : colors.foregroundMuted}
                style={styles.methodIcon}
              />
              <Text
                variant="bodyLarge"
                style={[
                  styles.methodLabel,
                  {
                    color:
                      selectedMethod === method.type ? colors.primary : colors.foreground,
                  },
                ]}
              >
                {method.label}
              </Text>
              <RadioButton
                value={method.type}
                status={selectedMethod === method.type ? 'checked' : 'unchecked'}
                onPress={() => setSelectedMethod(method.type)}
                color={colors.primary}
              />
            </TouchableOpacity>
          ))}
        </View>

        {/* Split with Table Button */}
        <Button
          mode="outlined"
          onPress={handleSplit}
          style={styles.splitButton}
          icon="account-group"
          accessibilityLabel={t('tab.payment.split')}
        >
          {t('tab.payment.split')}
        </Button>
      </ScrollView>

      {/* Bottom Pay Bar */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomTotalRow}>
          <Text variant="bodyLarge" style={{ color: colors.foregroundMuted }}>
            {t('tab.total')}
          </Text>
          <Text variant="titleLarge" style={{ color: colors.primary, fontWeight: 'bold' }}>
            {formatCurrency(total, getLanguage())}
          </Text>
        </View>
        <Button
          mode="contained"
          onPress={handlePayment}
          loading={isProcessing}
          disabled={isProcessing}
          icon="cash-register"
          accessibilityLabel={t('tab.payment.pay')}
        >
          {t('tab.payment.pay')}
        </Button>
      </View>
    </View>
  
    </ScreenContainer>
  );
}
