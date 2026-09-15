import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  Platform,
  Animated,
  Dimensions,
  RefreshControl,
} from 'react-native';
import {
  Text,
  Card,
  Button,
  RadioButton,
  TextInput,
  Divider,
  IconButton,
  ActivityIndicator,
  Portal,
  Modal,
  Switch,
  Chip,
  SegmentedButtons,
} from 'react-native-paper';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';

import ApiService from '@/shared/services/api';
import { useI18n } from '@/shared/hooks/useI18n';
import { useScreenTracking, useAnalytics } from '@/shared/hooks/useAnalytics';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { formatCurrency as fmtCurrencyUtil } from '@okinawa/shared/utils/formatters';
import { usePullToRefresh } from '@okinawa/shared/hooks/usePullToRefresh';
import { getLanguage } from '@okinawa/shared/i18n';
import type { RootStackParamList, PaymentSuccessParams } from '../../types';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  validateCardNumber,
  validateExpiry,
  validateCVV,
  getCardBrand,
  formatCardNumber,
  formatExpiry,
} from '@okinawa/shared/utils/card-validation';
import { cardSchema, validateForm } from '@okinawa/shared/validation/schemas';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = 10;
const GRID_COLUMNS = 3;
const GRID_ITEM_WIDTH = (SCREEN_WIDTH - 32 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

type PaymentMethodType = 'pix' | 'credit' | 'apple' | 'google' | 'tap' | 'wallet';
type ActiveTab = 'pay' | 'split' | 'tip';
const TIP_OPTIONS = [0, 10, 15, 20];

interface Order {
  id: string;
  restaurant_id: string;
  subtotal_amount: number;
  tax_amount: number;
  tip_amount: number;
  total_amount: number;
  status: string;
  items: Array<{
    id: string;
    menu_item: {
      name: string;
      price: number;
    };
    quantity: number;
  }>;
}

interface Wallet {
  id: string;
  balance: number;
}

interface SavedPaymentMethod {
  id: string;
  method_type: string;
  card_last4?: string;
  card_holder_name?: string;
  card_exp_month?: string;
  card_exp_year?: string;
  is_default: boolean;
}

interface LoyaltyInfo {
  points_balance: number;
  points_value: number; // monetary value of redeemable points
}

// Skeleton component
const SkeletonBlock = ({ width, height, style }: { width: number | string; height: number; style?: any }) => {
  const colors = useColors();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: 6, backgroundColor: colors.backgroundTertiary, opacity },
        style,
      ]}
    />
  );
};

const PaymentSkeleton = () => {
  const colors = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: colors.backgroundSecondary, padding: 16 }}>
      <SkeletonBlock width={180} height={28} style={{ marginBottom: 8 }} />
      <SkeletonBlock width={240} height={16} style={{ marginBottom: 24 }} />
      {/* Method grid skeleton */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, marginBottom: 24 }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <SkeletonBlock key={i} width={GRID_ITEM_WIDTH} height={80} style={{ borderRadius: 12 }} />
        ))}
      </View>
      {/* Tip skeleton */}
      <SkeletonBlock width={140} height={20} style={{ marginBottom: 12 }} />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
        {[1, 2, 3, 4].map((i) => (
          <SkeletonBlock key={i} width={(SCREEN_WIDTH - 32 - 24) / 4} height={48} style={{ borderRadius: 8 }} />
        ))}
      </View>
      {/* Summary skeleton */}
      <SkeletonBlock width="100%" height={120} style={{ borderRadius: 12, marginBottom: 24 }} />
      <SkeletonBlock width="100%" height={48} style={{ borderRadius: 24 }} />
    </View>
  );
};

// Payment method grid item
const PAYMENT_METHODS: Array<{
  type: PaymentMethodType;
  icon: string;
  platform?: 'ios' | 'android';
  isNew?: boolean;
}> = [
  { type: 'pix', icon: 'qrcode' },
  { type: 'credit', icon: 'credit-card' },
  { type: 'apple', icon: 'apple', platform: 'ios' },
  { type: 'google', icon: 'google', platform: 'android' },
  { type: 'tap', icon: 'contactless-payment', isNew: true },
  { type: 'wallet', icon: 'wallet' },
];

export default function UnifiedPaymentScreen() {
  useScreenTracking('UnifiedPayment');

  const route = useRoute();
  const navigation = useNavigation<NavigationProp>();
  const colors = useColors();
  const { t } = useI18n();
  const analytics = useAnalytics();

  const { orderId } = route.params as { orderId: string };

  // Data state
  const [order, setOrder] = useState<Order | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [savedMethods, setSavedMethods] = useState<SavedPaymentMethod[]>([]);
  const [loyaltyInfo, setLoyaltyInfo] = useState<LoyaltyInfo | null>(null);

  // UI state
  const [activeTab, setActiveTab] = useState<ActiveTab>('pay');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodType>('pix');
  const [tipPercent, setTipPercent] = useState(10);
  const [usePoints, setUsePoints] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Card form state
  const [selectedSavedCard, setSelectedSavedCard] = useState<string>('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCVV, setCardCVV] = useState('');
  const [showAddCardModal, setShowAddCardModal] = useState(false);

  // PIX state
  const [pixKey, setPixKey] = useState('');

  useEffect(() => {
    loadData();
  }, [orderId]);

  const loadData = useCallback(async () => {
    try {
      setInitialLoading(true);
      setError(null);

      const [orderResponse, walletResponse, methodsResponse] = await Promise.all([
        ApiService.getOrder(orderId),
        ApiService.getWallet().catch(() => null),
        ApiService.getPaymentMethods().catch(() => []),
      ]);

      setOrder(orderResponse);
      setWallet(walletResponse);
      setSavedMethods(methodsResponse);

      // Try to load loyalty info
      try {
        const loyaltyData = await ApiService.getMyLoyaltyPoints?.();
        if (loyaltyData && loyaltyData.points_balance > 0) {
          setLoyaltyInfo(loyaltyData);
        }
      } catch {
        // Loyalty is optional
      }

      // Set default saved card if available
      const defaultMethod = methodsResponse.find((m: SavedPaymentMethod) => m.is_default);
      if (defaultMethod) {
        setSelectedSavedCard(defaultMethod.id);
      } else if (methodsResponse.length > 0) {
        setSelectedSavedCard(methodsResponse[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load payment data:', err);
      setError(t('payment.errorGeneric'));
      await analytics.logError('Failed to load payment data', 'PAYMENT_DATA_LOAD_ERROR', false);
    } finally {
      setInitialLoading(false);
    }
  }, [orderId, t, analytics]);

  const pullToRefresh = usePullToRefresh(loadData);

  // Calculations
  const subtotal = useMemo(() => order?.subtotal_amount ?? 0, [order]);
  const tipAmount = useMemo(() => subtotal * (tipPercent / 100), [subtotal, tipPercent]);
  const pointsDiscount = useMemo(() => {
    if (!usePoints || !loyaltyInfo) return 0;
    return loyaltyInfo.points_value;
  }, [usePoints, loyaltyInfo]);
  const finalTotal = useMemo(
    () => Math.max(0, subtotal + (order?.tax_amount ?? 0) + tipAmount - pointsDiscount),
    [subtotal, order, tipAmount, pointsDiscount],
  );

  const formatCurrency = useCallback((value: number) => fmtCurrencyUtil(value, getLanguage()), []);

  const validateNewCard = useCallback((): boolean => {
    const cleanedNumber = cardNumber.replace(/\s/g, '');
    const [expMonth, expYear] = (cardExpiry || '/').split('/');

    const result = validateForm(cardSchema, {
      number: cleanedNumber,
      holderName: cardName,
      expiryMonth: expMonth || '',
      expiryYear: expYear || '',
      cvv: cardCVV,
    });

    if (!result.success) {
      Alert.alert(t('common.error'), Object.values(result.errors)[0]);
      return false;
    }

    // Additional Luhn check
    if (!validateCardNumber(cleanedNumber)) {
      Alert.alert(t('common.error'), t('payment.errorInvalidCard'));
      return false;
    }

    // Additional expiry date check
    if (!validateExpiry(expMonth, expYear)) {
      Alert.alert(t('common.error'), t('payment.cardExpiry'));
      return false;
    }

    return true;
  }, [cardNumber, cardName, cardExpiry, cardCVV, t]);

  const handleSelectMethod = useCallback(async (method: PaymentMethodType) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedMethod(method);
  }, []);

  const handlePayment = useCallback(async () => {
    if (!order) return;

    // Validate based on selected method
    if (selectedMethod === 'credit' && savedMethods.length === 0) {
      if (!validateNewCard()) return;
    }
    if (selectedMethod === 'wallet') {
      if (!wallet || wallet.balance < finalTotal) {
        Alert.alert(t('common.error'), t('payment.errorInsufficientWallet'));
        return;
      }
    }

    setProcessing(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Generate idempotency key
      const idempotencyKey = `${order.id}-${Date.now()}`;

      const paymentData: Record<string, any> = {
        order_id: orderId,
        amount: finalTotal,
        tip_amount: tipAmount,
        use_loyalty_points: usePoints,
      };

      // Set payment method details
      switch (selectedMethod) {
        case 'pix':
          paymentData.payment_method = 'pix';
          paymentData.pix_key = pixKey || undefined;
          break;
        case 'credit':
          if (savedMethods.length > 0 && selectedSavedCard) {
            paymentData.payment_method = 'saved_card';
            paymentData.payment_method_id = selectedSavedCard;
          } else {
            paymentData.payment_method = 'credit_card';
            const cleanedNumber = cardNumber.replace(/\s/g, '');
            const [expMonth, expYear] = cardExpiry.split('/');
            paymentData.tokenized_card = {
              card_number: cleanedNumber,
              card_holder_name: cardName,
              card_exp_month: expMonth,
              card_exp_year: '20' + expYear,
              card_cvv: cardCVV,
            };
          }
          break;
        case 'apple':
          paymentData.payment_method = 'apple_pay';
          break;
        case 'google':
          paymentData.payment_method = 'google_pay';
          break;
        case 'tap':
          paymentData.payment_method = 'tap_to_pay';
          break;
        case 'wallet':
          paymentData.payment_method = 'wallet';
          break;
      }

      await ApiService.processPayment(paymentData as Parameters<typeof ApiService.processPayment>[0]);

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await analytics.logPurchase(orderId, finalTotal, 'BRL');

      // Calculate loyalty points earned
      const pointsEarned = Math.floor(finalTotal);

      // Navigate to success screen
      const successParams: PaymentSuccessParams = {
        orderId,
        amountPaid: finalTotal,
        paymentMethod: selectedMethod,
        pointsEarned,
      };

      navigation.navigate('PaymentSuccess', successParams);
    } catch (err: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const errorMessage = err.response?.data?.message || t('payment.errorGeneric');
      Alert.alert(t('common.error'), errorMessage);
      await analytics.logError('Payment failed', 'PAYMENT_ERROR', false);
    } finally {
      setProcessing(false);
    }
  }, [
    order,
    selectedMethod,
    savedMethods,
    wallet,
    finalTotal,
    tipAmount,
    usePoints,
    orderId,
    pixKey,
    selectedSavedCard,
    cardNumber,
    cardName,
    cardExpiry,
    cardCVV,
    validateNewCard,
    navigation,
    analytics,
    t,
  ]);

  const handleNavigateToSplit = useCallback(() => {
    navigation.navigate('SplitPayment', { orderId });
  }, [navigation, orderId]);

  const handleAddNewCard = useCallback(async () => {
    if (!validateNewCard()) return;
    try {
      setProcessing(true);
      const cleanedNumber = cardNumber.replace(/\s/g, '');
      const [expMonth, expYear] = cardExpiry.split('/');
      await ApiService.addPaymentMethod({
        method_type: 'credit_card',
        card_number: cleanedNumber,
        card_holder_name: cardName,
        card_exp_month: expMonth,
        card_exp_year: '20' + expYear,
        card_cvv: cardCVV,
      });
      await analytics.logAddPaymentMethod('credit_card');
      Alert.alert(t('common.success'), t('payment.cardSave'));
      setShowAddCardModal(false);
      setCardNumber('');
      setCardName('');
      setCardExpiry('');
      setCardCVV('');
      await loadData();
    } catch (err: any) {
      Alert.alert(t('common.error'), err.response?.data?.message || t('payment.errorGeneric'));
    } finally {
      setProcessing(false);
    }
  }, [validateNewCard, cardNumber, cardName, cardExpiry, cardCVV, analytics, t, loadData]);

  const getMethodLabel = useCallback(
    (type: PaymentMethodType): string => {
      const labels: Record<PaymentMethodType, string> = {
        pix: t('payment.methodsPix'),
        credit: t('payment.methodsCredit'),
        apple: t('payment.methodsApple'),
        google: t('payment.methodsGoogle'),
        tap: t('payment.methodsTap'),
        wallet: t('payment.methodsWallet'),
      };
      return labels[type];
    },
    [t],
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.backgroundSecondary,
        },
        scrollContent: {
          padding: 16,
          paddingBottom: 40,
        },
        title: {
          color: colors.foreground,
          marginBottom: 4,
        },
        subtitle: {
          color: colors.foregroundSecondary,
          marginBottom: 16,
        },
        // Tabs
        tabContainer: {
          marginBottom: 20,
        },
        // Payment method grid
        card: {
          marginBottom: 16,
          backgroundColor: colors.card,
          borderRadius: 12,
        },
        sectionTitle: {
          marginBottom: 12,
          color: colors.foreground,
        },
        methodGrid: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: GRID_GAP,
        },
        methodItem: {
          width: GRID_ITEM_WIDTH,
          height: 80,
          borderRadius: 12,
          borderWidth: 1.5,
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        },
        methodSelected: {
          borderColor: colors.primary,
          backgroundColor: colors.primary + '10',
        },
        methodUnselected: {
          borderColor: colors.border,
          backgroundColor: colors.card,
        },
        methodDisabled: {
          opacity: 0.4,
        },
        methodLabel: {
          marginTop: 4,
          fontSize: 12,
          fontWeight: '600',
        },
        methodBadge: {
          position: 'absolute',
          top: 4,
          right: 4,
          backgroundColor: colors.accent,
          borderRadius: 4,
          paddingHorizontal: 4,
          paddingVertical: 1,
        },
        methodBadgeText: {
          color: colors.premiumCardForeground,
          fontSize: 8,
          fontWeight: 'bold',
        },
        walletBalance: {
          fontSize: 10,
          marginTop: 2,
        },
        // Tip section
        tipRow: {
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
        tipSelected: {
          backgroundColor: colors.primary + '15',
          borderColor: colors.primary,
        },
        tipUnselected: {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
        tipText: {
          fontWeight: '600',
          fontSize: 14,
        },
        tipAmount: {
          fontSize: 10,
          marginTop: 2,
        },
        tipInfo: {
          marginTop: 8,
          color: colors.foregroundSecondary,
          fontStyle: 'italic',
        },
        // Loyalty
        loyaltyCard: {
          marginBottom: 16,
          backgroundColor: colors.card,
          borderRadius: 12,
        },
        loyaltyContent: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        loyaltyLeft: {
          flex: 1,
        },
        loyaltyTitle: {
          color: colors.foreground,
        },
        loyaltySubtitle: {
          color: colors.foregroundSecondary,
          marginTop: 2,
        },
        loyaltyButton: {
          borderColor: usePoints ? colors.success : colors.primary,
          backgroundColor: usePoints ? colors.success + '15' : 'transparent',
        },
        loyaltyButtonLabel: {
          color: usePoints ? colors.success : colors.primary,
        },
        // Summary
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
        discountValue: {
          color: colors.success,
        },
        divider: {
          marginVertical: 10,
          backgroundColor: colors.border,
        },
        totalRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        totalLabel: {
          color: colors.foreground,
          fontWeight: 'bold',
        },
        totalValue: {
          color: colors.primary,
          fontWeight: 'bold',
        },
        // Credit card form
        input: {
          marginBottom: 12,
          backgroundColor: colors.card,
        },
        row: {
          flexDirection: 'row',
          gap: 10,
        },
        halfInput: {
          flex: 1,
        },
        // Saved cards
        savedCardItem: {
          paddingVertical: 4,
        },
        addCardButton: {
          marginTop: 8,
        },
        // PIX
        pixNote: {
          color: colors.foregroundSecondary,
          fontStyle: 'italic',
          marginTop: 4,
        },
        // CTA
        payButton: {
          marginTop: 12,
          backgroundColor: colors.primary,
          borderRadius: 24,
        },
        payButtonLabel: {
          paddingVertical: 4,
          fontSize: 16,
          fontWeight: '600',
        },
        secureText: {
          textAlign: 'center',
          color: colors.foregroundMuted,
          marginTop: 12,
          fontSize: 12,
        },
        // Error
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
        // Modal
        modalContainer: {
          backgroundColor: colors.card,
          margin: 20,
          borderRadius: 12,
        },
        modalTitle: {
          color: colors.foreground,
        },
        // Order not found
        notFoundContainer: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.backgroundSecondary,
        },
        notFoundText: {
          color: colors.foreground,
        },
      }),
    [colors, usePoints],
  );

  // Loading
  if (initialLoading) {
    return (<ScreenContainer><PaymentSkeleton /></ScreenContainer>);
  }

  // Error
  if (error && !order) {
    return (
      <ScreenContainer>
      <View style={styles.errorContainer}>
        <Text variant="bodyLarge" style={styles.errorText}>
          {error}
        </Text>
        <Button mode="contained" onPress={loadData} buttonColor={colors.primary} accessibilityLabel={t('common.retry')}>
          {t('common.retry')}
        </Button>
      </View>
    
      </ScreenContainer>
    );
  }

  // No order
  if (!order) {
    return (
      <ScreenContainer>
      <View style={styles.notFoundContainer}>
        <Text variant="bodyLarge" style={styles.notFoundText}>
          {t('payment.orderNotFound')}
        </Text>
      </View>
    
      </ScreenContainer>
    );
  }

  // Filter methods by platform
  const availableMethods = PAYMENT_METHODS.filter((m) => {
    if (m.platform === 'ios' && Platform.OS !== 'ios') return false;
    if (m.platform === 'android' && Platform.OS !== 'android') return false;
    return true;
  });

  const isWalletInsufficient = !wallet || wallet.balance < finalTotal;

  return (
    <ScreenContainer hasKeyboard>
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={pullToRefresh.refreshing} onRefresh={() => { void pullToRefresh.onRefresh(); }} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        {/* Header */}
        <Text variant="headlineSmall" style={styles.title}>
          {t('payment.title')}
        </Text>

        {/* Tabs: Pay / Split / Tip */}
        <View style={styles.tabContainer}>
          <SegmentedButtons
            value={activeTab}
            onValueChange={(val) => {
              if (val === 'split') {
                handleNavigateToSplit();
                return;
              }
              setActiveTab(val as ActiveTab);
            }}
            buttons={[
              { value: 'pay', label: t('payment.tabPay') },
              { value: 'split', label: t('payment.tabSplit') },
              { value: 'tip', label: t('payment.tabTip') },
            ]}
          />
        </View>

        {/* Payment Method Grid */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              {t('payment.methodsTitle')}
            </Text>

            <View style={styles.methodGrid}>
              {availableMethods.map((method) => {
                const isSelected = selectedMethod === method.type;
                const isDisabled = method.type === 'wallet' && isWalletInsufficient;

                return (
                  <TouchableOpacity
                    key={method.type}
                    style={[
                      styles.methodItem,
                      isSelected ? styles.methodSelected : styles.methodUnselected,
                      isDisabled && styles.methodDisabled,
                    ]}
                    onPress={() => !isDisabled && handleSelectMethod(method.type)}
                    activeOpacity={0.7}
                    disabled={isDisabled}
                    accessibilityLabel={getMethodLabel(method.type)}
                  >
                    <IconButton
                      icon={method.icon}
                      size={24}
                      iconColor={isSelected ? colors.primary : colors.foregroundSecondary}
                      style={{ margin: 0 }}
                      accessibilityLabel={getMethodLabel(method.type)}
                    />
                    <Text
                      style={[
                        styles.methodLabel,
                        { color: isSelected ? colors.primary : colors.foreground },
                      ]}
                    >
                      {getMethodLabel(method.type)}
                    </Text>

                    {/* Wallet balance */}
                    {method.type === 'wallet' && wallet && (
                      <Text
                        style={[
                          styles.walletBalance,
                          {
                            color: isWalletInsufficient
                              ? colors.error
                              : colors.foregroundSecondary,
                          },
                        ]}
                      >
                        {formatCurrency(wallet.balance)}
                      </Text>
                    )}

                    {/* New badge for TAP */}
                    {method.isNew && (
                      <View style={styles.methodBadge}>
                        <Text style={styles.methodBadgeText}>
                          {t('payment.methodsTapBadge')}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </Card.Content>
        </Card>

        {/* Credit Card Details */}
        {selectedMethod === 'credit' && (
          <Card style={styles.card}>
            <Card.Content>
              {savedMethods.length > 0 ? (
                <>
                  <Text variant="titleMedium" style={styles.sectionTitle}>
                    {t('payment.cardSaved')}
                  </Text>
                  <RadioButton.Group
                    onValueChange={setSelectedSavedCard}
                    value={selectedSavedCard}
                  >
                    {savedMethods.map((method) => (
                      <RadioButton.Item
                        key={method.id}
                        label={`${method.card_holder_name || ''} **** ${method.card_last4 || ''} (${method.card_exp_month}/${method.card_exp_year})`}
                        value={method.id}
                        style={styles.savedCardItem}
                        labelStyle={{ color: colors.foreground }}
                      />
                    ))}
                  </RadioButton.Group>
                  <Button
                    mode="outlined"
                    onPress={() => setShowAddCardModal(true)}
                    style={styles.addCardButton}
                    icon="plus"
                    accessibilityLabel={t('payment.cardAdd')}
                  >
                    {t('payment.cardAdd')}
                  </Button>
                </>
              ) : (
                <>
                  <Text variant="titleMedium" style={styles.sectionTitle}>
                    {t('payment.cardDetails')}
                  </Text>
                  <TextInput
                    label={t('payment.cardNumber_label')}
                    value={cardNumber}
                    onChangeText={(text) => setCardNumber(formatCardNumber(text))}
                    keyboardType="number-pad"
                    maxLength={19}
                    mode="outlined"
                    style={styles.input}
                    left={<TextInput.Icon icon="credit-card" />}
                    accessibilityLabel={t('payment.cardNumber_label')}
                  />
                  <TextInput
                    label={t('payment.cardName')}
                    value={cardName}
                    onChangeText={setCardName}
                    mode="outlined"
                    style={styles.input}
                    autoCapitalize="words"
                    accessibilityLabel={t('payment.cardName')}
                  />
                  <View style={styles.row}>
                    <TextInput
                      label={t('payment.cardExpiry')}
                      value={cardExpiry}
                      onChangeText={(text) => setCardExpiry(formatExpiry(text))}
                      keyboardType="number-pad"
                      maxLength={5}
                      mode="outlined"
                      style={[styles.input, styles.halfInput]}
                      placeholder={t('placeholders.cardExpiry')}
                      accessibilityLabel={t('payment.cardExpiry')}
                    />
                    <TextInput
                      label={t('payment.cardCvv')}
                      value={cardCVV}
                      onChangeText={setCardCVV}
                      keyboardType="number-pad"
                      maxLength={4}
                      secureTextEntry
                      mode="outlined"
                      style={[styles.input, styles.halfInput]}
                      accessibilityLabel={t('payment.cardCvv')}
                    />
                  </View>
                </>
              )}
            </Card.Content>
          </Card>
        )}

        {/* PIX Details */}
        {selectedMethod === 'pix' && (
          <Card style={styles.card}>
            <Card.Content>
              <TextInput
                label={t('payment.pixLabel')}
                value={pixKey}
                onChangeText={setPixKey}
                mode="outlined"
                style={styles.input}
                autoCapitalize="none"
              />
              <Text variant="bodySmall" style={styles.pixNote}>
                {t('payment.pixHint')}
              </Text>
            </Card.Content>
          </Card>
        )}

        {/* Wallet Info */}
        {selectedMethod === 'wallet' && wallet && (
          <Card style={styles.card}>
            <Card.Content style={{ alignItems: 'center', paddingVertical: 12 }}>
              <Text variant="bodyLarge" style={{ color: colors.foreground }}>
                {t('payment.currentBalance')}
              </Text>
              <Text
                variant="headlineSmall"
                style={{ color: colors.primary, fontWeight: 'bold', marginTop: 4 }}
              >
                {formatCurrency(wallet.balance)}
              </Text>
              {isWalletInsufficient && (
                <Text
                  variant="bodySmall"
                  style={{ color: colors.error, textAlign: 'center', marginTop: 8 }}
                >
                  {t('payment.insufficientBalanceMsg')}
                </Text>
              )}
            </Card.Content>
          </Card>
        )}

        {/* Tip Selector */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              {t('payment.tipTitle')}
            </Text>
            <View style={styles.tipRow}>
              {TIP_OPTIONS.map((tip) => {
                const isSelected = tipPercent === tip;
                return (
                  <TouchableOpacity
                    key={tip}
                    style={[
                      styles.tipOption,
                      isSelected ? styles.tipSelected : styles.tipUnselected,
                    ]}
                    onPress={() => setTipPercent(tip)}
                    activeOpacity={0.7}
                    accessibilityLabel={tip === 0 ? t('payment.tipNone') : `${tip}% tip`}
                  >
                    <Text
                      style={[
                        styles.tipText,
                        { color: isSelected ? colors.primary : colors.foreground },
                      ]}
                    >
                      {tip === 0 ? t('payment.tipNone') : `${tip}%`}
                    </Text>
                    {tip > 0 && (
                      <Text
                        style={[
                          styles.tipAmount,
                          { color: isSelected ? colors.primary : colors.foregroundMuted },
                        ]}
                      >
                        {formatCurrency(subtotal * (tip / 100))}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
            {tipPercent > 0 && (
              <Text variant="bodySmall" style={styles.tipInfo}>
                {t('payment.tipAdding', { amount: formatCurrency(tipAmount) })}
              </Text>
            )}
          </Card.Content>
        </Card>

        {/* Loyalty Points Card */}
        {loyaltyInfo && loyaltyInfo.points_balance > 0 && (
          <Card style={styles.loyaltyCard}>
            <Card.Content style={styles.loyaltyContent}>
              <View style={styles.loyaltyLeft}>
                <Text variant="titleSmall" style={styles.loyaltyTitle}>
                  {t('payment.loyaltyTitle', { points: String(loyaltyInfo.points_balance) })}
                </Text>
                <Text variant="bodySmall" style={styles.loyaltySubtitle}>
                  {t('payment.loyaltySubtitle', {
                    pts: String(Math.min(loyaltyInfo.points_balance, Math.floor(finalTotal))),
                    discount: loyaltyInfo.points_value.toFixed(2),
                  })}
                </Text>
              </View>
              <Button
                mode="outlined"
                onPress={() => setUsePoints(!usePoints)}
                style={styles.loyaltyButton}
                labelStyle={styles.loyaltyButtonLabel}
                compact
                icon={usePoints ? 'check' : undefined}
                accessibilityLabel={usePoints ? t('payment.loyaltyUsed') : t('payment.loyaltyUse')}
              >
                {usePoints ? t('payment.loyaltyUsed') : t('payment.loyaltyUse')}
              </Button>
            </Card.Content>
          </Card>
        )}

        {/* Order Summary */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              {t('payment.summaryTitle')}
            </Text>

            <View style={styles.summaryRow}>
              <Text variant="bodyMedium" style={styles.summaryLabel}>
                {t('payment.summarySubtotal')}
              </Text>
              <Text variant="bodyMedium" style={styles.summaryValue}>
                {formatCurrency(subtotal)}
              </Text>
            </View>

            {tipPercent > 0 && (
              <View style={styles.summaryRow}>
                <Text variant="bodyMedium" style={styles.summaryLabel}>
                  {t('payment.summaryTip', { percent: String(tipPercent) })}
                </Text>
                <Text variant="bodyMedium" style={styles.summaryValue}>
                  {formatCurrency(tipAmount)}
                </Text>
              </View>
            )}

            {pointsDiscount > 0 && (
              <View style={styles.summaryRow}>
                <Text variant="bodyMedium" style={styles.summaryLabel}>
                  {t('payment.summaryDiscountPoints')}
                </Text>
                <Text variant="bodyMedium" style={styles.discountValue}>
                  -{formatCurrency(pointsDiscount)}
                </Text>
              </View>
            )}

            <Divider style={styles.divider} />

            <View style={styles.totalRow}>
              <Text variant="titleLarge" style={styles.totalLabel}>
                {t('payment.summaryTotal')}
              </Text>
              <Text variant="titleLarge" style={styles.totalValue}>
                {formatCurrency(finalTotal)}
              </Text>
            </View>
          </Card.Content>
        </Card>

        {/* Pay Button */}
        <Button
          mode="contained"
          onPress={handlePayment}
          loading={processing}
          disabled={processing}
          style={styles.payButton}
          labelStyle={styles.payButtonLabel}
          icon="lock"
          accessibilityLabel={processing ? t('payment.processing') : t('payment.ctaPay', { amount: finalTotal.toFixed(2) })}
        >
          {processing
            ? t('payment.processing')
            : t('payment.ctaPay', { amount: finalTotal.toFixed(2) })}
        </Button>

        <Text style={styles.secureText}>{t('payment.secure')}</Text>
      </ScrollView>

      {/* Add Card Modal */}
      <Portal>
        <Modal
          visible={showAddCardModal}
          onDismiss={() => setShowAddCardModal(false)}
          contentContainerStyle={styles.modalContainer}
        >
          <Card>
            <Card.Title title={t('payment.cardAdd')} titleStyle={styles.modalTitle} />
            <Card.Content>
              <TextInput
                label={t('payment.cardNumber_label')}
                value={cardNumber}
                onChangeText={(text) => setCardNumber(formatCardNumber(text))}
                keyboardType="number-pad"
                maxLength={19}
                mode="outlined"
                style={styles.input}
              />
              <TextInput
                label={t('payment.cardName')}
                value={cardName}
                onChangeText={setCardName}
                mode="outlined"
                style={styles.input}
                autoCapitalize="words"
              />
              <View style={styles.row}>
                <TextInput
                  label={t('payment.cardExpiry')}
                  value={cardExpiry}
                  onChangeText={(text) => setCardExpiry(formatExpiry(text))}
                  keyboardType="number-pad"
                  maxLength={5}
                  mode="outlined"
                  style={[styles.input, styles.halfInput]}
                />
                <TextInput
                  label={t('payment.cardCvv')}
                  value={cardCVV}
                  onChangeText={setCardCVV}
                  keyboardType="number-pad"
                  maxLength={4}
                  secureTextEntry
                  mode="outlined"
                  style={[styles.input, styles.halfInput]}
                />
              </View>
            </Card.Content>
            <Card.Actions>
              <Button onPress={() => setShowAddCardModal(false)}>{t('common.cancel')}</Button>
              <Button mode="contained" onPress={handleAddNewCard} loading={processing}>
                {t('payment.cardAdd')}
              </Button>
            </Card.Actions>
          </Card>
        </Modal>
      </Portal>
    </>
  
    </ScreenContainer>
  );
}
