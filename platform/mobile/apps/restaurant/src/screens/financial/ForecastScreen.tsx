/**
 * ForecastScreen - Cash Flow Forecast Dashboard
 *
 * Displays projected balance over next 7/30/90 days using a line chart,
 * alert cards for low balance and high food cost, and upcoming bills.
 * All strings via t() for i18n compliance.
 *
 * @module restaurant/screens/financial
 */

import React, { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  Text,
  Card,
  Chip,
  Button,
  ActivityIndicator,
  IconButton,
} from 'react-native-paper';
import { LineChart } from 'react-native-chart-kit';
import { Dimensions } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import ApiService from '@/shared/services/api';
import { useI18n } from '@/shared/hooks/useI18n';
import { formatCurrency } from '@okinawa/shared/utils/formatters';
import { getLanguage } from '@okinawa/shared/i18n';
import { useColors } from '@/shared/theme';
import { useRestaurant } from '@/shared/contexts/RestaurantContext';

const screenWidth = Dimensions.get('window').width;

type ForecastPeriod = 7 | 30 | 90;

interface ForecastProjection {
  date: string;
  projected_revenue: number;
  projected_expenses: number;
  projected_balance: number;
}

interface ForecastAlert {
  type: 'low_balance' | 'high_food_cost';
  date: string;
  message_key: string;
  projected_value: number;
  threshold: number;
}

interface ForecastData {
  current_balance: number;
  projections: ForecastProjection[];
  alerts: ForecastAlert[];
}

export default function ForecastScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const { restaurantId } = useRestaurant();
  const [period, setPeriod] = useState<ForecastPeriod>(30);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const {
    data: forecast,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<ForecastData>({
    queryKey: ['forecast', restaurantId, period],
    queryFn: () => ApiService.getForecast(restaurantId!, period),
    enabled: !!restaurantId,
  });

  const handleNavigateToBills = useCallback(() => {
    // Navigation handled by parent stack
  }, []);

  // Build chart data from projections
  const chartData = useMemo(() => {
    if (!forecast?.projections?.length) {
      return {
        labels: [],
        datasets: [{ data: [0] }],
      };
    }

    // Sample labels for readability (show every Nth label)
    const step = Math.max(1, Math.floor(forecast.projections.length / 7));
    const labels = forecast.projections.map((p, i) => {
      if (i % step === 0) {
        const d = new Date(p.date);
        return `${d.getDate()}/${d.getMonth() + 1}`;
      }
      return '';
    });

    return {
      labels,
      datasets: [
        {
          data: forecast.projections.map((p) => p.projected_balance),
          color: (opacity = 1) => `rgba(34, 197, 94, ${opacity})`,
          strokeWidth: 2,
        },
      ],
    };
  }, [forecast]);

  // ────────── Loading State ──────────

  if (isLoading) {
    return (
      <ScreenContainer>
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text variant="bodyMedium" style={styles.loadingText}>
          {t('common.loading')}
        </Text>
      </View>
      </ScreenContainer>
    );
  }

  // ────────── Render ──────────

  return (
    <ScreenContainer>
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
      }
    >
      {/* Period Selection */}
      <View style={styles.periodRow} accessibilityLabel="Forecast period selection">
        <Chip
          selected={period === 7}
          onPress={() => setPeriod(7)}
          style={styles.periodChip}
        >
          {t('financial.forecast.next_7_days')}
        </Chip>
        <Chip
          selected={period === 30}
          onPress={() => setPeriod(30)}
          style={styles.periodChip}
        >
          {t('financial.forecast.next_30_days')}
        </Chip>
        <Chip
          selected={period === 90}
          onPress={() => setPeriod(90)}
          style={styles.periodChip}
        >
          {t('financial.forecast.next_90_days')}
        </Chip>
      </View>

      {/* Current Balance */}
      {forecast && (
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="labelMedium" style={styles.label}>
              {t('financial.forecast.current_balance')}
            </Text>
            <Text
              variant="displaySmall"
              style={[
                styles.balanceValue,
                {
                  color:
                    forecast.current_balance >= 0
                      ? colors.success
                      : colors.error,
                },
              ]}
            >
              {formatCurrency(forecast.current_balance, getLanguage())}
            </Text>
          </Card.Content>
        </Card>
      )}

      {/* Projected Balance Chart */}
      {forecast?.projections?.length > 0 && (
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge" style={styles.title}>
              {t('financial.forecast.projected_balance')}
            </Text>
            <LineChart
              data={chartData}
              width={screenWidth - 64}
              height={220}
              chartConfig={{
                backgroundColor: colors.card,
                backgroundGradientFrom: colors.card,
                backgroundGradientTo: colors.card,
                decimalPlaces: 0,
                color: (opacity = 1) => `rgba(34, 197, 94, ${opacity})`,
                labelColor: () => colors.foreground,
                style: { borderRadius: 16 },
                propsForDots: {
                  r: '3',
                  strokeWidth: '1',
                  stroke: colors.primary,
                },
              }}
              bezier
              style={styles.chart}
              withInnerLines={false}
              withOuterLines
            />

            {/* Revenue vs Expenses Summary */}
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text variant="labelMedium" style={styles.label}>
                  {t('financial.forecast.projected_revenue')}
                </Text>
                <Text variant="titleMedium" style={{ color: colors.success }}>
                  {formatCurrency(
                    forecast.projections.reduce(
                      (s, p) => s + p.projected_revenue,
                      0,
                    ),
                    getLanguage(),
                  )}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text variant="labelMedium" style={styles.label}>
                  {t('financial.forecast.projected_expenses')}
                </Text>
                <Text variant="titleMedium" style={{ color: colors.error }}>
                  {formatCurrency(
                    forecast.projections.reduce(
                      (s, p) => s + p.projected_expenses,
                      0,
                    ),
                    getLanguage(),
                  )}
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>
      )}

      {/* Alerts */}
      {forecast?.alerts && forecast.alerts.length > 0 ? (
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge" style={styles.title}>
              {t('financial.cogs.alerts')}
            </Text>
            {forecast.alerts.map((alert, index) => (
              <View
                key={`${alert.type}-${index}`}
                style={[
                  styles.alertCard,
                  {
                    backgroundColor:
                      alert.type === 'low_balance'
                        ? colors.errorLight || colors.error + '20'
                        : colors.warningLight || colors.warning + '20',
                    borderLeftColor:
                      alert.type === 'low_balance'
                        ? colors.error
                        : colors.warning,
                  },
                ]}
              >
                <IconButton
                  icon={
                    alert.type === 'low_balance'
                      ? 'alert-circle'
                      : 'food'
                  }
                  iconColor={
                    alert.type === 'low_balance'
                      ? colors.error
                      : colors.warning
                  }
                  size={20}
                />
                <View style={styles.alertTextContainer}>
                  <Text
                    variant="bodyMedium"
                    style={{ color: colors.foreground }}
                  >
                    {alert.type === 'low_balance'
                      ? t('financial.forecast.alert_low_balance')
                          .replace('{{threshold}}', formatCurrency(alert.threshold, getLanguage()))
                          .replace('{{days}}', alert.date)
                      : t('financial.forecast.alert_high_food_cost')
                          .replace('{{threshold}}', String(alert.projected_value))}
                  </Text>
                  <Text variant="bodySmall" style={styles.alertDate}>
                    {alert.date}
                  </Text>
                </View>
              </View>
            ))}
          </Card.Content>
        </Card>
      ) : forecast ? (
        <Card style={styles.card}>
          <Card.Content style={styles.noAlertsContainer}>
            <IconButton
              icon="check-circle"
              iconColor={colors.success}
              size={32}
            />
            <Text variant="bodyLarge" style={styles.noAlertsText}>
              {t('financial.forecast.no_alerts')}
            </Text>
          </Card.Content>
        </Card>
      ) : null}

      {/* Empty state */}
      {!forecast && !isLoading && (
        <View style={styles.emptyState}>
          <IconButton icon="chart-line" size={48} iconColor={colors.mutedForeground} />
          <Text variant="bodyLarge" style={styles.emptyText}>
            {t('common.noResults')}
          </Text>
          <Button mode="outlined" onPress={() => refetch()}>
            {t('common.retry')}
          </Button>
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
    </ScreenContainer>
  );
}

// ────────── Styles ──────────

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.backgroundSecondary,
    },
    center: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      marginTop: 12,
      color: colors.mutedForeground,
    },
    periodRow: {
      flexDirection: 'row',
      gap: 8,
      padding: 16,
    },
    periodChip: {
      flex: 1,
    },
    card: {
      margin: 16,
      marginTop: 0,
      elevation: 2,
      backgroundColor: colors.card,
    },
    title: {
      marginBottom: 16,
      color: colors.foreground,
    },
    label: {
      color: colors.mutedForeground,
      marginBottom: 4,
    },
    balanceValue: {
      fontWeight: 'bold',
    },
    chart: {
      borderRadius: 16,
      marginVertical: 8,
    },
    summaryRow: {
      flexDirection: 'row',
      gap: 24,
      marginTop: 16,
    },
    summaryItem: {
      flex: 1,
    },
    alertCard: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 8,
      borderLeftWidth: 4,
      marginBottom: 8,
      padding: 4,
    },
    alertTextContainer: {
      flex: 1,
      paddingRight: 8,
    },
    alertDate: {
      color: colors.mutedForeground,
      marginTop: 2,
    },
    noAlertsContainer: {
      alignItems: 'center',
      paddingVertical: 16,
    },
    noAlertsText: {
      color: colors.success,
      marginTop: 4,
    },
    emptyState: {
      alignItems: 'center',
      padding: 32,
      gap: 12,
    },
    emptyText: {
      color: colors.mutedForeground,
    },
  });
