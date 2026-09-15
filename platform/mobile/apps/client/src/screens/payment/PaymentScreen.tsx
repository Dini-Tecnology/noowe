import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Alert, RefreshControl } from 'react-native';
import { Text, Card, Button, RadioButton, TextInput, Divider, IconButton, ActivityIndicator, Portal, Modal } from 'react-native-paper';
import { useRoute, useNavigation } from '@react-navigation/native';
import ApiService from '@/shared/services/api';
import { useScreenTracking, useAnalytics } from '@/shared/hooks/useAnalytics';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { t } from '@okinawa/shared/i18n';
import logger from '@okinawa/shared/utils/logger';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { usePullToRefresh } from '@okinawa/shared/hooks/usePullToRefresh';
import {
  validateCardNumber,
  validateExpiry,
  validateCVV,
  getCardBrand,
  formatCardNumber,
  formatExpiry,
} from '@okinawa/shared/utils/card-validation';
import { cardSchema, validateForm } from '@okinawa/shared/validation/schemas';

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

interface PaymentMethod {
  id: string;
  method_type: string;
  card_last4?: string;
  card_holder_name?: string;
  card_exp_month?: string;
  card_exp_year?: string;
  is_default: boolean;
}

export default function PaymentScreen() {
  useScreenTracking('Payment');

  const route = useRoute();
  const navigation = useNavigation();
  const colors = useColors();
  const { orderId } = route.params as { orderId: string };

  const analytics = useAnalytics();

  const [order, setOrder] = useState<Order | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<string>('');
  const [paymentType, setPaymentType] = useState<'saved_card' | 'new_card' | 'cash' | 'pix' | 'wallet'>('saved_card');

  // New card form
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCVV, setCardCVV] = useState('');
  const [saveCard, setSaveCard] = useState(false);

  // PIX
  const [pixKey, setPixKey] = useState('');

  // Loading states
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showAddCardModal, setShowAddCardModal] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setInitialLoading(true);
      const [orderResponse, walletResponse, methodsResponse] = await Promise.all([
        ApiService.getOrder(orderId),
        ApiService.getWallet(),
        ApiService.getPaymentMethods(),
      ]);

      setOrder(orderResponse);
      setWallet(walletResponse);
      setPaymentMethods(methodsResponse);

      // Set default payment method
      const defaultMethod = methodsResponse.find((m: PaymentMethod) => m.is_default);
      if (defaultMethod) {
        setSelectedMethod(defaultMethod.id);
        setPaymentType('saved_card');
      } else if (methodsResponse.length > 0) {
        setSelectedMethod(methodsResponse[0].id);
        setPaymentType('saved_card');
      } else {
        setPaymentType('new_card');
      }
    } catch (error) {
      logger.error('Failed to load data:', error);
      Alert.alert(t('common.error'), t('payment.errorGeneric'));
      await analytics.logError('Failed to load payment data', 'PAYMENT_DATA_LOAD_ERROR', false);
    } finally {
      setInitialLoading(false);
    }
  };

  const pullToRefresh = usePullToRefresh(loadData);

  const validateNewCard = () => {
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
      Alert.alert(t('common.error'), t('payment.errorInvalidCard'));
      return false;
    }

    return true;
  };

  const validatePixPayment = () => {
    if (!pixKey || pixKey.length < 5) {
      Alert.alert(t('common.error'), t('payment.errorInvalidCard'));
      return false;
    }
    return true;
  };

  const handleAddNewCard = async () => {
    if (!validateNewCard()) return;

    try {
      setLoading(true);
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

      Alert.alert(t('common.success'), t('payment.paymentSuccess'));
      setShowAddCardModal(false);

      // Clear form
      setCardNumber('');
      setCardName('');
      setCardExpiry('');
      setCardCVV('');

      // Reload payment methods
      await loadData();
    } catch (error: any) {
      Alert.alert(t('common.error'), error.response?.data?.message || t('payment.errorGeneric'));
      await analytics.logError('Failed to add payment method', 'ADD_PAYMENT_METHOD_ERROR', false);
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async () => {
    if (!order) return;

    // Validate based on payment type
    if (paymentType === 'new_card') {
      if (!validateNewCard()) return;
    } else if (paymentType === 'pix') {
      if (!validatePixPayment()) return;
    } else if (paymentType === 'wallet') {
      if (!wallet || wallet.balance < order.total_amount) {
        Alert.alert(t('common.error'), t('payment.errorInsufficientWallet'));
        return;
      }
    } else if (paymentType === 'saved_card') {
      if (!selectedMethod) {
        Alert.alert(t('common.error'), t('payment.errorGeneric'));
        return;
      }
    }

    setLoading(true);
    try {
      const paymentData: any = {
        order_id: orderId,
        amount: order.total_amount,
      };

      if (paymentType === 'saved_card') {
        paymentData.payment_method = 'saved_card';
        paymentData.payment_method_id = selectedMethod;
      } else if (paymentType === 'new_card') {
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
      } else if (paymentType === 'pix') {
        paymentData.payment_method = 'pix';
        paymentData.pix_key = pixKey;
      } else if (paymentType === 'wallet') {
        paymentData.payment_method = 'wallet';
      } else if (paymentType === 'cash') {
        paymentData.payment_method = 'cash';
      }

      await ApiService.processPayment(paymentData);

      await analytics.logPurchase(orderId, order.total_amount, 'BRL');

      setPaymentSuccess(true);

      setTimeout(() => {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Home' as never }],
        });
      }, 2000);
    } catch (error: any) {
      Alert.alert(t('common.error'), error.response?.data?.message || t('payment.errorGeneric'));
      await analytics.logError('Payment failed', 'PAYMENT_ERROR', false);
    } finally {
      setLoading(false);
    }
  };

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.backgroundSecondary,
      padding: 16,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.backgroundSecondary,
    },
    loadingText: {
      marginTop: 15,
      color: colors.foregroundSecondary,
    },
    successContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.backgroundSecondary,
      padding: 20,
    },
    successTitle: {
      marginTop: 20,
      color: colors.success,
    },
    successText: {
      marginTop: 10,
      color: colors.foregroundSecondary,
      textAlign: 'center',
    },
    title: {
      marginBottom: 20,
      color: colors.foreground,
    },
    card: {
      marginBottom: 15,
      backgroundColor: colors.card,
    },
    sectionTitle: {
      marginBottom: 15,
      color: colors.foreground,
    },
    orderItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    divider: {
      marginVertical: 15,
      backgroundColor: colors.border,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    totalAmount: {
      fontWeight: 'bold',
      color: colors.primary,
    },
    input: {
      marginBottom: 15,
      backgroundColor: colors.card,
    },
    row: {
      flexDirection: 'row',
      gap: 10,
    },
    halfInput: {
      flex: 1,
    },
    pixNote: {
      color: colors.foregroundSecondary,
      fontStyle: 'italic',
    },
    cashNoticeContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    cashNote: {
      flex: 1,
      color: colors.foregroundSecondary,
    },
    walletInfo: {
      alignItems: 'center',
      paddingVertical: 10,
    },
    walletBalance: {
      color: colors.primary,
      fontWeight: 'bold',
      marginTop: 5,
    },
    insufficientFunds: {
      color: colors.error,
      textAlign: 'center',
      marginTop: 10,
    },
    addCardButton: {
      marginTop: 10,
    },
    payButton: {
      marginBottom: 30,
      backgroundColor: colors.primary,
    },
    modalContainer: {
      backgroundColor: colors.card,
      margin: 20,
      borderRadius: 8,
    },
    orderText: {
      color: colors.foreground,
    },
    summaryText: {
      color: colors.foreground,
    },
    bodyText: {
      color: colors.foreground,
    },
  }), [colors]);

  if (initialLoading) {
    return (
      <ScreenContainer>
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    
      </ScreenContainer>
    );
  }

  if (paymentSuccess) {
    return (
      <ScreenContainer>
      <View style={styles.successContainer}>
        <IconButton icon="check-circle" size={80} iconColor={colors.success} />
        <Text variant="headlineMedium" style={styles.successTitle}>{t('payment.paymentConfirmed')}</Text>
        <Text variant="bodyLarge" style={styles.successText}>
          {t('payment.paymentSuccess')}
        </Text>
      </View>
    
      </ScreenContainer>
    );
  }

  if (!order) {
    return (
      <ScreenContainer>
      <View style={styles.loadingContainer}>
        <Text style={styles.bodyText}>{t('payment.orderNotFound')}</Text>
      </View>
    
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer hasKeyboard>
    <>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={pullToRefresh.refreshing} onRefresh={() => { void pullToRefresh.onRefresh(); }} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <Text variant="headlineSmall" style={styles.title}>
          {t('payment.title')}
        </Text>

        {/* Order Summary */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              {t('payment.orderSummary')}
            </Text>

            {order.items.map((item) => (
              <View key={item.id} style={styles.orderItem}>
                <Text variant="bodyMedium" style={styles.orderText}>
                  {item.quantity}x {item.menu_item.name}
                </Text>
                <Text variant="bodyMedium" style={styles.orderText}>
                  ${(item.menu_item.price * item.quantity).toFixed(2)}
                </Text>
              </View>
            ))}

            <Divider style={styles.divider} />

            <View style={styles.summaryRow}>
              <Text variant="bodyMedium" style={styles.summaryText}>{t('payment.summarySubtotal')}</Text>
              <Text variant="bodyMedium" style={styles.summaryText}>${order.subtotal_amount.toFixed(2)}</Text>
            </View>

            <View style={styles.summaryRow}>
              <Text variant="bodyMedium" style={styles.summaryText}>{t('orders.tax')}</Text>
              <Text variant="bodyMedium" style={styles.summaryText}>${order.tax_amount.toFixed(2)}</Text>
            </View>

            <View style={styles.summaryRow}>
              <Text variant="bodyMedium" style={styles.summaryText}>{t('payment.tipTitle')}</Text>
              <Text variant="bodyMedium" style={styles.summaryText}>${order.tip_amount.toFixed(2)}</Text>
            </View>

            <Divider style={styles.divider} />

            <View style={styles.totalRow}>
              <Text variant="titleLarge" style={styles.bodyText}>{t('payment.summaryTotal')}</Text>
              <Text variant="titleLarge" style={styles.totalAmount}>
                ${order.total_amount.toFixed(2)}
              </Text>
            </View>
          </Card.Content>
        </Card>

        {/* Payment Method Selection */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              {t('payment.methodsTitle')}
            </Text>

            <RadioButton.Group
              onValueChange={(value) => setPaymentType(value as any)}
              value={paymentType}
            >
              {paymentMethods.length > 0 && (
                <RadioButton.Item label={t('payment.savedCard')} value="saved_card" labelStyle={{ color: colors.foreground }} accessibilityLabel={t('payment.savedCard')} />
              )}
              <RadioButton.Item label={t('payment.newCard')} value="new_card" labelStyle={{ color: colors.foreground }} accessibilityLabel={t('payment.newCard')} />
              <RadioButton.Item label={t('payment.pix')} value="pix" labelStyle={{ color: colors.foreground }} accessibilityLabel={t('payment.pix')} />
              <RadioButton.Item
                label={`${t('payment.wallet')} (${wallet?.balance.toFixed(2) || '0.00'})`}
                value="wallet"
                disabled={!wallet || wallet.balance < order.total_amount}
                labelStyle={{ color: colors.foreground }}
                accessibilityLabel={`${t('payment.wallet')} ${wallet?.balance.toFixed(2) || '0.00'}`}
              />
              <RadioButton.Item label={t('payment.cash')} value="cash" labelStyle={{ color: colors.foreground }} accessibilityLabel={t('payment.cash')} />
            </RadioButton.Group>
          </Card.Content>
        </Card>

        {/* Saved Cards */}
        {paymentType === 'saved_card' && paymentMethods.length > 0 && (
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                {t('payment.selectCard')}
              </Text>

              <RadioButton.Group
                onValueChange={setSelectedMethod}
                value={selectedMethod}
              >
                {paymentMethods.map((method) => (
                  <RadioButton.Item
                    key={method.id}
                    label={`${method.card_holder_name} •••• ${method.card_last4} (${method.card_exp_month}/${method.card_exp_year})`}
                    value={method.id}
                    labelStyle={{ color: colors.foreground }}
                  />
                ))}
              </RadioButton.Group>

              <Button
                mode="outlined"
                onPress={() => setShowAddCardModal(true)}
                style={styles.addCardButton}
                icon="plus"
                accessibilityLabel="Add a new payment card"
                accessibilityRole="button"
              >
                {t('payment.cardAdd')}
              </Button>
            </Card.Content>
          </Card>
        )}

        {/* New Card Form */}
        {paymentType === 'new_card' && (
          <Card style={styles.card}>
            <Card.Content>
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
                accessibilityLabel="Card number"
              />

              <TextInput
                label={t('payment.cardName')}
                value={cardName}
                onChangeText={setCardName}
                mode="outlined"
                style={styles.input}
                autoCapitalize="words"
                accessibilityLabel="Cardholder name"
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
                  accessibilityLabel="Card expiry date"
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
                  accessibilityLabel="Card CVV security code"
                />
              </View>
            </Card.Content>
          </Card>
        )}

        {/* PIX Form */}
        {paymentType === 'pix' && (
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                {t('payment.methodsPix')}
              </Text>

              <TextInput
                label={t('payment.pixLabel')}
                value={pixKey}
                onChangeText={setPixKey}
                mode="outlined"
                style={styles.input}
                autoCapitalize="none"
                accessibilityLabel="PIX key"
                accessibilityHint="Enter your email, phone, or CPF as PIX key"
              />

              <Text variant="bodySmall" style={styles.pixNote}>
                {t('payment.pixHint')}
              </Text>
            </Card.Content>
          </Card>
        )}

        {/* Cash Notice */}
        {paymentType === 'cash' && (
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.cashNoticeContainer}>
                <IconButton icon="information" size={24} iconColor={colors.primary} />
                <Text variant="bodyMedium" style={styles.cashNote}>
                  {t('payment.cashNotice')}
                </Text>
              </View>
            </Card.Content>
          </Card>
        )}

        {/* Wallet Info */}
        {paymentType === 'wallet' && wallet && (
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.walletInfo}>
                <Text variant="bodyLarge" style={styles.bodyText}>{t('payment.currentBalance')}</Text>
                <Text variant="headlineSmall" style={styles.walletBalance}>
                  ${wallet.balance.toFixed(2)}
                </Text>
              </View>
              {wallet.balance < order.total_amount && (
                <Text variant="bodySmall" style={styles.insufficientFunds}>
                  {t('payment.insufficientBalanceMsg')}
                </Text>
              )}
            </Card.Content>
          </Card>
        )}

        <Button
          mode="contained"
          onPress={handlePayment}
          loading={loading}
          disabled={loading}
          style={styles.payButton}
          accessibilityLabel={paymentType === 'cash' ? 'Confirm order for cash payment' : `Pay ${order.total_amount.toFixed(2)} dollars`}
          accessibilityRole="button"
        >
          {paymentType === 'cash' ? t('payment.confirmOrder') : t('payment.processPayment')}
        </Button>
      </ScrollView>

      {/* Add Card Modal */}
      <Portal>
        <Modal
          visible={showAddCardModal}
          onDismiss={() => setShowAddCardModal(false)}
          contentContainerStyle={styles.modalContainer}
        >
          <Card>
            <Card.Title title={t('payment.cardAdd')} titleStyle={{ color: colors.foreground }} />
            <Card.Content>
              <TextInput
                label={t('payment.cardNumber_label')}
                value={cardNumber}
                onChangeText={(text) => setCardNumber(formatCardNumber(text))}
                keyboardType="number-pad"
                maxLength={19}
                mode="outlined"
                style={styles.input}
                accessibilityLabel="Card number"
              />

              <TextInput
                label={t('payment.cardName')}
                value={cardName}
                onChangeText={setCardName}
                mode="outlined"
                style={styles.input}
                autoCapitalize="words"
                accessibilityLabel="Cardholder name"
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
                  accessibilityLabel="Card expiry date"
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
                  accessibilityLabel="Card CVV security code"
                />
              </View>
            </Card.Content>
            <Card.Actions>
              <Button
                onPress={() => setShowAddCardModal(false)}
                accessibilityLabel="Cancel adding card"
                accessibilityRole="button"
              >
                {t('common.cancel')}
              </Button>
              <Button
                mode="contained"
                onPress={handleAddNewCard}
                loading={loading}
                accessibilityLabel={t('payment.cardAdd')}
                accessibilityRole="button"
              >
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
