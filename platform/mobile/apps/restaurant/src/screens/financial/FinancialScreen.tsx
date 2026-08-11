/**
 * FinancialScreen - Restaurant Financial Dashboard
 *
 * Enhanced with margin card, forecast alerts, revenue by channel,
 * and quick navigation to Forecast and Bills screens.
 *
 * Sprint 4 evolution: added margin metric, forecast alerts preview,
 * and action buttons for forecast/bills navigation.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Text, Card, SegmentedButtons, DataTable, Button, IconButton, Chip } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import ApiService from '@/shared/services/api';
import { useI18n } from '@/shared/hooks/useI18n';
import { useWebSocket } from '@/shared/hooks/useWebSocket';
import { formatCurrency } from '@okinawa/shared/utils/formatters';
import { getLanguage } from '@okinawa/shared/i18n';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { useRestaurant } from '@/shared/contexts/RestaurantContext';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';

interface FinancialSummary {
  total_revenue: number;
  total_orders: number;
  average_order_value: number;
  total_tips: number;
  total_expenses?: number;
  margin_percentage?: number;
  payment_methods: {
    credit_card: number;
    debit_card: number;
    cash: number;
    pix: number;
    wallet: number;
  };
  revenue_by_channel?: Array<{
    channel: string;
    amount: number;
  }>;
  top_selling_items: Array<{
    name: string;
    quantity: number;
    revenue: number;
  }>;
}

interface Transaction {
  id: string;
  type: 'order' | 'tip' | 'refund';
  amount: number;
  payment_method: string;
  created_at: string;
  description: string;
}

interface ForecastAlert {
  type: 'low_balance' | 'high_food_cost';
  date: string;
  message_key: string;
  projected_value: number;
  threshold: number;
}

export default function FinancialScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const { connected, on, off, emit } = useWebSocket('/');
  const navigation = useNavigation<any>();
  const { restaurantId } = useRestaurant();
  const [period, setPeriod] = useState('today');
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [forecastAlerts, setForecastAlerts] = useState<ForecastAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    segmentedButtons: {
      margin: 16,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      padding: 16,
      gap: 15,
    },
    summaryCard: {
      flex: 1,
      minWidth: '45%',
      backgroundColor: colors.card,
    },
    cardLabel: {
      color: colors.mutedForeground,
      marginBottom: 5,
    },
    revenue: {
      color: colors.success,
      fontWeight: 'bold',
    },
    tips: {
      color: colors.primary,
      fontWeight: 'bold',
    },
    card: {
      margin: 16,
      marginTop: 0,
      backgroundColor: colors.card,
    },
    paymentMethod: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    paymentMethodText: {
      color: colors.foreground,
    },
    amount: {
      fontWeight: '600',
      color: colors.foreground,
    },
    channelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      gap: 8,
    },
    channelBar: {
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
    },
    channelName: {
      color: colors.foreground,
      width: 70,
    },
    channelAmount: {
      color: colors.foreground,
      fontWeight: '600',
      marginLeft: 'auto',
    },
    alertItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      gap: 8,
    },
    alertText: {
      color: colors.foreground,
      flex: 1,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 8,
      padding: 16,
      paddingTop: 0,
    },
    actionButton: {
      flex: 1,
    },
  }), [colors]);

  useEffect(() => {
    loadFinancialData();
  }, [period]);

  const getDateRange = () => {
    const now = new Date();
    switch (period) {
      case 'today':
        return { start: startOfDay(now), end: endOfDay(now) };
      case 'week':
        return { start: startOfWeek(now), end: endOfWeek(now) };
      case 'month':
        return { start: startOfMonth(now), end: endOfMonth(now) };
      default:
        return { start: startOfDay(now), end: endOfDay(now) };
    }
  };

  const loadFinancialData = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();
      const promises: Promise<any>[] = [
        ApiService.getFinancialSummary({
          start_date: start.toISOString(),
          end_date: end.toISOString(),
        }),
        ApiService.getFinancialReport({
          start_date: start.toISOString(),
          end_date: end.toISOString(),
        }),
      ];

      // Also load forecast alerts (non-blocking)
      if (restaurantId) {
        promises.push(
          ApiService.getForecast(restaurantId, 30).catch(() => null),
        );
      }

      const [summaryResponse, transactionsResponse, forecastResponse] = await Promise.all(promises);

      setSummary(summaryResponse);
      setTransactions(transactionsResponse);
      if (forecastResponse?.alerts) {
        setForecastAlerts(forecastResponse.alerts);
      }
    } catch (error) {
      console.error('Failed to load financial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadFinancialData();
    setRefreshing(false);
  };

  // Real-time: refresh financial data when a payment is completed
  useEffect(() => {
    if (!restaurantId || !connected) return;
    emit('restaurant:join', { restaurant_id: restaurantId });

    const onNotification = (data: any) => {
      if (data?.type === 'payment:completed' || data?.type === 'tip:created' || data?.type === 'tips:distributed') {
        loadFinancialData();
      }
    };

    on('notification', onNotification);

    return () => {
      off('notification', onNotification);
      emit('restaurant:leave', { restaurant_id: restaurantId });
    };
  }, [restaurantId, connected, emit, on, off]);

  // Compute margin from summary
  const marginPercentage = summary
    ? summary.margin_percentage ??
      (summary.total_revenue > 0 && summary.total_expenses
        ? Math.round(((summary.total_revenue - summary.total_expenses) / summary.total_revenue) * 100)
        : null)
    : null;

  return (
    <ScreenContainer>
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <SegmentedButtons
        value={period}
        onValueChange={setPeriod}
        buttons={[
          { value: 'today', label: t('financial.today') },
          { value: 'week', label: t('financial.thisWeek') },
          { value: 'month', label: t('financial.thisMonth') },
        ]}
        style={styles.segmentedButtons}
      />

      {summary && (
        <>
          {/* Row 1: Revenue, Cost, Margin */}
          <View style={styles.grid}>
            <Card style={styles.summaryCard}>
              <Card.Content>
                <Text variant="titleSmall" style={styles.cardLabel}>
                  {t('financial.revenue')}
                </Text>
                <Text variant="displaySmall" style={styles.revenue}>
                  {formatCurrency(summary.total_revenue, getLanguage())}
                </Text>
              </Card.Content>
            </Card>

            <Card style={styles.summaryCard}>
              <Card.Content>
                <Text variant="titleSmall" style={styles.cardLabel}>
                  {t('financial.expenses')}
                </Text>
                <Text variant="displaySmall" style={{ color: colors.error, fontWeight: 'bold' }}>
                  {formatCurrency(summary.total_expenses || 0, getLanguage())}
                </Text>
              </Card.Content>
            </Card>

            {marginPercentage !== null && (
              <Card style={styles.summaryCard}>
                <Card.Content>
                  <Text variant="titleSmall" style={styles.cardLabel}>
                    {t('financial.cogs.margin')}
                  </Text>
                  <Text
                    variant="displaySmall"
                    style={{
                      color: marginPercentage >= 50 ? colors.success : marginPercentage >= 30 ? colors.warning : colors.error,
                      fontWeight: 'bold',
                    }}
                  >
                    {marginPercentage}%
                  </Text>
                </Card.Content>
              </Card>
            )}
          </View>

          {/* Row 2: Ticket, Orders, Tips */}
          <View style={styles.grid}>
            <Card style={styles.summaryCard}>
              <Card.Content>
                <Text variant="titleSmall" style={styles.cardLabel}>
                  {t('financial.averageTicket')}
                </Text>
                <Text variant="displaySmall" style={{ color: colors.foreground }}>
                  {formatCurrency(summary.average_order_value, getLanguage())}
                </Text>
              </Card.Content>
            </Card>

            <Card style={styles.summaryCard}>
              <Card.Content>
                <Text variant="titleSmall" style={styles.cardLabel}>
                  {t('financial.totalOrders')}
                </Text>
                <Text variant="displaySmall" style={{ color: colors.foreground }}>
                  {summary.total_orders}
                </Text>
              </Card.Content>
            </Card>

            <Card style={styles.summaryCard}>
              <Card.Content>
                <Text variant="titleSmall" style={styles.cardLabel}>
                  {t('tips.title')}
                </Text>
                <Text variant="displaySmall" style={styles.tips}>
                  {formatCurrency(summary.total_tips, getLanguage())}
                </Text>
              </Card.Content>
            </Card>
          </View>

          {/* Revenue by Channel (NEW) */}
          {summary.revenue_by_channel && summary.revenue_by_channel.length > 0 && (
            <Card style={styles.card}>
              <Card.Title
                title={t('financial.reports.by_source')}
                titleStyle={{ color: colors.foreground }}
              />
              <Card.Content>
                {summary.revenue_by_channel.map((channel, index) => {
                  const maxAmount = Math.max(
                    ...summary.revenue_by_channel!.map((c) => c.amount),
                  );
                  const barWidth = maxAmount > 0 ? (channel.amount / maxAmount) * 100 : 0;
                  return (
                    <View key={index} style={styles.channelRow}>
                      <Text variant="bodySmall" style={styles.channelName}>
                        {channel.channel}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <View
                          style={[
                            styles.channelBar,
                            { width: `${barWidth}%` },
                          ]}
                        />
                      </View>
                      <Text variant="bodyMedium" style={styles.channelAmount}>
                        {formatCurrency(channel.amount, getLanguage())}
                      </Text>
                    </View>
                  );
                })}
              </Card.Content>
            </Card>
          )}

          {/* Forecast Alerts (NEW) */}
          {forecastAlerts.length > 0 && (
            <Card style={styles.card}>
              <Card.Title
                title={t('financial.cogs.alerts')}
                titleStyle={{ color: colors.foreground }}
                right={() => (
                  <IconButton
                    icon="chevron-right"
                    onPress={() => navigation.navigate('Forecast')}
                    iconColor={colors.primary}
                    accessibilityLabel="View forecast details"
                  />
                )}
              />
              <Card.Content>
                {forecastAlerts.map((alert, index) => (
                  <View key={index} style={styles.alertItem}>
                    <IconButton
                      icon={alert.type === 'low_balance' ? 'alert-circle' : 'food'}
                      iconColor={alert.type === 'low_balance' ? colors.error : colors.warning}
                      size={16}
                      accessibilityLabel={alert.type === 'low_balance' ? 'Low balance alert' : 'High food cost alert'}
                    />
                    <Text variant="bodySmall" style={styles.alertText}>
                      {alert.type === 'low_balance'
                        ? t('financial.forecast.alert_low_balance')
                            .replace('{{threshold}}', formatCurrency(alert.threshold, getLanguage()))
                            .replace('{{days}}', alert.date)
                        : t('financial.forecast.alert_high_food_cost')
                            .replace('{{threshold}}', String(alert.projected_value))}
                    </Text>
                  </View>
                ))}
              </Card.Content>
            </Card>
          )}

          {/* Action Buttons: Forecast + Bills (NEW) */}
          <View style={styles.actionsRow}>
            <Button
              mode="outlined"
              icon="chart-line"
              onPress={() => navigation.navigate('Forecast')}
              style={styles.actionButton}
              accessibilityLabel="View financial forecast"
            >
              {t('financial.forecast.view_forecast')}
            </Button>
            <Button
              mode="outlined"
              icon="file-document-outline"
              onPress={() => navigation.navigate('Bills')}
              style={styles.actionButton}
              accessibilityLabel="View bills"
            >
              {t('financial.bills.title')}
            </Button>
          </View>

          {/* Payment Methods */}
          <Card style={styles.card}>
            <Card.Title title={t('payment.paymentMethod')} titleStyle={{ color: colors.foreground }} />
            <Card.Content>
              <View style={styles.paymentMethod}>
                <Text variant="bodyMedium" style={styles.paymentMethodText}>{t('payment.creditCard')}</Text>
                <Text variant="bodyMedium" style={styles.amount}>
                  {formatCurrency(summary.payment_methods.credit_card, getLanguage())}
                </Text>
              </View>
              <View style={styles.paymentMethod}>
                <Text variant="bodyMedium" style={styles.paymentMethodText}>{t('payment.debitCard')}</Text>
                <Text variant="bodyMedium" style={styles.amount}>
                  {formatCurrency(summary.payment_methods.debit_card, getLanguage())}
                </Text>
              </View>
              <View style={styles.paymentMethod}>
                <Text variant="bodyMedium" style={styles.paymentMethodText}>{t('payment.cash')}</Text>
                <Text variant="bodyMedium" style={styles.amount}>
                  {formatCurrency(summary.payment_methods.cash, getLanguage())}
                </Text>
              </View>
              <View style={styles.paymentMethod}>
                <Text variant="bodyMedium" style={styles.paymentMethodText}>{t('payment.pix')}</Text>
                <Text variant="bodyMedium" style={styles.amount}>
                  {formatCurrency(summary.payment_methods.pix, getLanguage())}
                </Text>
              </View>
              <View style={styles.paymentMethod}>
                <Text variant="bodyMedium" style={styles.paymentMethodText}>{t('payment.wallet')}</Text>
                <Text variant="bodyMedium" style={styles.amount}>
                  {formatCurrency(summary.payment_methods.wallet, getLanguage())}
                </Text>
              </View>
            </Card.Content>
          </Card>

          <Card style={styles.card}>
            <Card.Title title={t('financial.topSellingItems')} titleStyle={{ color: colors.foreground }} />
            <Card.Content>
              <DataTable>
                <DataTable.Header>
                  <DataTable.Title textStyle={{ color: colors.foreground }}>{t('menu.items')}</DataTable.Title>
                  <DataTable.Title numeric textStyle={{ color: colors.foreground }}>{t('menu.quantity')}</DataTable.Title>
                  <DataTable.Title numeric textStyle={{ color: colors.foreground }}>{t('financial.revenue')}</DataTable.Title>
                </DataTable.Header>

                {summary.top_selling_items.slice(0, 5).map((item, index) => (
                  <DataTable.Row key={index}>
                    <DataTable.Cell textStyle={{ color: colors.foreground }}>{item.name}</DataTable.Cell>
                    <DataTable.Cell numeric textStyle={{ color: colors.foreground }}>{item.quantity}</DataTable.Cell>
                    <DataTable.Cell numeric textStyle={{ color: colors.foreground }}>
                      {formatCurrency(item.revenue, getLanguage())}
                    </DataTable.Cell>
                  </DataTable.Row>
                ))}
              </DataTable>
            </Card.Content>
          </Card>
        </>
      )}

      <Card style={styles.card}>
        <Card.Title title={t('wallet.transactions')} titleStyle={{ color: colors.foreground }} />
        <Card.Content>
          <DataTable>
            <DataTable.Header>
              <DataTable.Title textStyle={{ color: colors.foreground }}>{t('common.view')}</DataTable.Title>
              <DataTable.Title textStyle={{ color: colors.foreground }}>{t('payment.paymentMethod')}</DataTable.Title>
              <DataTable.Title numeric textStyle={{ color: colors.foreground }}>{t('orders.total')}</DataTable.Title>
            </DataTable.Header>

            {transactions.map((transaction) => (
              <DataTable.Row key={transaction.id}>
                <DataTable.Cell textStyle={{ color: colors.foreground }}>
                  {transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)}
                </DataTable.Cell>
                <DataTable.Cell textStyle={{ color: colors.foreground }}>{transaction.payment_method}</DataTable.Cell>
                <DataTable.Cell numeric textStyle={{ color: colors.foreground }}>
                  {formatCurrency(transaction.amount, getLanguage())}
                </DataTable.Cell>
              </DataTable.Row>
            ))}
          </DataTable>
        </Card.Content>
      </Card>
    </ScrollView>
    </ScreenContainer>
  );
}
