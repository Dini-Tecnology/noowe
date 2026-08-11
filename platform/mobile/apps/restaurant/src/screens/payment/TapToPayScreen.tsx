/**
 * TapToPayScreen - NFC Tap to Pay for restaurant orders
 *
 * Allows staff to accept contactless payments via NFC.
 * States: ready → reading → success | failed
 *
 * @module restaurant/screens/payment
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { Text, Button, ActivityIndicator } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { useI18n } from '@/shared/hooks/useI18n';
import { formatCurrency } from '@okinawa/shared/utils/formatters';
import { getLanguage } from '@okinawa/shared/i18n';
import ApiService from '@/shared/services/api';
import * as Haptics from 'expo-haptics';

type TapToPayState = 'ready' | 'reading' | 'success' | 'failed';

interface RouteParams {
  orderId: string;
  amount: number;
  orderNumber?: string;
}

export default function TapToPayScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ params: RouteParams }, 'params'>>();
  const { orderId, amount, orderNumber } = route.params;

  const [state, setState] = useState<TapToPayState>('ready');
  const [cardInfo, setCardInfo] = useState<{ last4: string; brand: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pulse animation for reading state
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const readingTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (state === 'reading') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
  }, [state, pulseAnim]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (readingTimeout.current) {
        clearTimeout(readingTimeout.current);
      }
    };
  }, []);

  const handleStartReading = useCallback(async () => {
    setState('reading');
    setError(null);

    try {
      // Create payment intent on the backend
      await ApiService.createTapToPayIntent(orderId, amount);

      // Simulate NFC reading (real NFC integration would replace this)
      readingTimeout.current = setTimeout(() => {
        setCardInfo({ last4: '4242', brand: 'Visa' });
        setState('success');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }, 3000);
    } catch (err: any) {
      setState('failed');
      setError(err?.message || t('financial.payment.failed'));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [orderId, amount, t]);

  const handleRetry = useCallback(() => {
    setState('ready');
    setCardInfo(null);
    setError(null);
  }, []);

  const handleEmitReceipt = useCallback(() => {
    // Navigate to receipt screen or trigger receipt emission
    navigation.goBack();
  }, [navigation]);

  const handleNewOrder = useCallback(() => {
    navigation.navigate('Orders');
  }, [navigation]);

  const handleCancel = useCallback(() => {
    if (readingTimeout.current) {
      clearTimeout(readingTimeout.current);
    }
    navigation.goBack();
  }, [navigation]);

  const locale = getLanguage();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        },
        amountText: {
          fontSize: 48,
          fontWeight: 'bold',
          color: colors.foreground,
          marginBottom: 8,
        },
        orderInfo: {
          fontSize: 16,
          color: colors.mutedForeground,
          marginBottom: 40,
        },
        iconContainer: {
          width: 120,
          height: 120,
          borderRadius: 60,
          justifyContent: 'center',
          alignItems: 'center',
          marginBottom: 24,
        },
        readyIcon: {
          backgroundColor: colors.primary + '20',
        },
        readingIcon: {
          backgroundColor: colors.info + '20',
        },
        successIcon: {
          backgroundColor: colors.success + '20',
        },
        failedIcon: {
          backgroundColor: colors.destructive + '20',
        },
        statusText: {
          fontSize: 18,
          fontWeight: '600',
          color: colors.foreground,
          textAlign: 'center',
          marginBottom: 8,
        },
        cardInfoText: {
          fontSize: 14,
          color: colors.mutedForeground,
          marginBottom: 32,
        },
        errorText: {
          fontSize: 14,
          color: colors.destructive,
          textAlign: 'center',
          marginBottom: 24,
        },
        buttonRow: {
          flexDirection: 'row',
          gap: 12,
          marginTop: 16,
        },
        button: {
          minWidth: 140,
        },
        cancelButton: {
          marginTop: 24,
        },
      }),
    [colors],
  );

  const renderReadyState = () => (
    <>
      <Text style={styles.amountText}>{formatCurrency(amount, locale)}</Text>
      {orderNumber && (
        <Text style={styles.orderInfo}>
          #{orderNumber}
        </Text>
      )}
      <Animated.View
        style={[
          styles.iconContainer,
          styles.readyIcon,
          { transform: [{ scale: pulseAnim }] },
        ]}
      >
        <Icon name="contactless-payment" size={56} color={colors.primary} />
      </Animated.View>
      <Text style={styles.statusText}>
        {t('financial.payment.tap_to_pay.ready')}
      </Text>
      <Button
        mode="contained"
        onPress={handleStartReading}
        style={styles.button}
        buttonColor={colors.primary}
      >
        {t('financial.payment.tap_to_pay.title')}
      </Button>
      <Button
        mode="text"
        onPress={handleCancel}
        style={styles.cancelButton}
        textColor={colors.mutedForeground}
      >
        {t('common.cancel')}
      </Button>
    </>
  );

  const renderReadingState = () => (
    <>
      <Text style={styles.amountText}>{formatCurrency(amount, locale)}</Text>
      <Animated.View
        style={[
          styles.iconContainer,
          styles.readingIcon,
          { transform: [{ scale: pulseAnim }] },
        ]}
      >
        <Icon name="nfc" size={56} color={colors.info} />
      </Animated.View>
      <ActivityIndicator animating size="small" color={colors.info} style={{ marginBottom: 12 }} />
      <Text style={styles.statusText}>
        {t('financial.payment.tap_to_pay.reading')}
      </Text>
      <Button
        mode="text"
        onPress={handleCancel}
        style={styles.cancelButton}
        textColor={colors.mutedForeground}
      >
        {t('common.cancel')}
      </Button>
    </>
  );

  const renderSuccessState = () => (
    <>
      <View style={[styles.iconContainer, styles.successIcon]}>
        <Icon name="check-circle" size={56} color={colors.success} />
      </View>
      <Text style={[styles.statusText, { color: colors.success }]}>
        {t('financial.payment.tap_to_pay.success')}
      </Text>
      <Text style={styles.amountText}>{formatCurrency(amount, locale)}</Text>
      {cardInfo && (
        <Text style={styles.cardInfoText}>
          {t('financial.payment.tap_to_pay.card_info')
            .replace('{last4}', cardInfo.last4)
            .replace('{brand}', cardInfo.brand)}
        </Text>
      )}
      <View style={styles.buttonRow}>
        <Button
          mode="contained"
          onPress={handleEmitReceipt}
          style={styles.button}
          buttonColor={colors.primary}
          icon="receipt"
        >
          {t('financial.payment.tap_to_pay.emit_receipt')}
        </Button>
        <Button
          mode="outlined"
          onPress={handleNewOrder}
          style={styles.button}
          textColor={colors.primary}
          icon="plus"
        >
          {t('financial.payment.tap_to_pay.new_order')}
        </Button>
      </View>
    </>
  );

  const renderFailedState = () => (
    <>
      <View style={[styles.iconContainer, styles.failedIcon]}>
        <Icon name="alert-circle" size={56} color={colors.destructive} />
      </View>
      <Text style={[styles.statusText, { color: colors.destructive }]}>
        {t('financial.payment.tap_to_pay.failed')}
      </Text>
      {error && <Text style={styles.errorText}>{error}</Text>}
      <Button
        mode="contained"
        onPress={handleRetry}
        style={styles.button}
        buttonColor={colors.primary}
        icon="refresh"
      >
        {t('common.retry')}
      </Button>
      <Button
        mode="text"
        onPress={handleCancel}
        style={styles.cancelButton}
        textColor={colors.mutedForeground}
      >
        {t('common.cancel')}
      </Button>
    </>
  );

  return (
    <ScreenContainer>
    <View style={styles.container} accessibilityLabel="Tap to pay">
      {state === 'ready' && renderReadyState()}
      {state === 'reading' && renderReadingState()}
      {state === 'success' && renderSuccessState()}
      {state === 'failed' && renderFailedState()}
    </View>
    </ScreenContainer>
  );
}
