/**
 * MarginDashboardScreen - Cost Control & Margin Analytics
 *
 * Dashboard showing food cost %, average margin, worst-performing items,
 * and alerts for items without recipes or with low margins.
 *
 * @module restaurant/screens/cost-control
 */

import React, { useState, useCallback, useMemo } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  ScrollView,
} from 'react-native';
import {
  Text,
  ActivityIndicator,
  Chip,
  SegmentedButtons,
  Button,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { useI18n } from '@/shared/hooks/useI18n';
import { useRestaurant } from '@/shared/contexts/RestaurantContext';
import { formatCurrency } from '@okinawa/shared/utils/formatters';
import { getLanguage } from '@okinawa/shared/i18n';
import ApiService from '@/shared/services/api';
import { Card } from '@okinawa/shared/components';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface MarginItem {
  menu_item_id: string;
  name: string;
  category: string | null;
  sale_price: number;
  cost_price: number;
  margin_pct: number;
  units_sold: number;
  revenue: number;
  cogs: number;
  profit: number;
}

interface MarginAlert {
  type: 'low_margin' | 'no_recipe';
  menu_item_id: string;
  name: string;
  margin_pct?: number;
  threshold?: number;
}

interface FoodCostResult {
  food_cost_pct: number;
  total_cogs: number;
  total_food_revenue: number;
  status: 'healthy' | 'warning' | 'critical';
  benchmark: string;
}

type TabValue = 'margins' | 'alerts';

export default function MarginDashboardScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const { restaurantId } = useRestaurant();
  const locale = getLanguage();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<TabValue>('margins');
  const [period, setPeriod] = useState(30);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  // ── Queries ──

  const marginsQuery = useQuery({
    queryKey: ['margins', restaurantId, period],
    queryFn: () => ApiService.getMargins(restaurantId, period),
    enabled: !!restaurantId,
  });

  const alertsQuery = useQuery({
    queryKey: ['margin-alerts', restaurantId],
    queryFn: () => ApiService.getMarginAlerts(restaurantId),
    enabled: !!restaurantId,
  });

  const foodCostQuery = useQuery({
    queryKey: ['food-cost', restaurantId, period],
    queryFn: () => ApiService.getFoodCost(restaurantId, period),
    enabled: !!restaurantId,
  });

  // ── Data ──

  const margins: MarginItem[] = marginsQuery.data || [];
  const alerts: MarginAlert[] = alertsQuery.data || [];
  const foodCost: FoodCostResult | null = foodCostQuery.data || null;

  // ── Derived ──

  const categories = useMemo(() => {
    const cats = new Set(margins.map((m) => m.category).filter(Boolean) as string[]);
    return Array.from(cats).sort();
  }, [margins]);

  const filteredMargins = useMemo(() => {
    if (!categoryFilter) return margins;
    return margins.filter((m) => m.category === categoryFilter);
  }, [margins, categoryFilter]);

  const avgMargin = useMemo(() => {
    const withCost = margins.filter((m) => m.cost_price > 0);
    if (withCost.length === 0) return 0;
    return Math.round(
      (withCost.reduce((sum, m) => sum + m.margin_pct, 0) / withCost.length) * 10,
    ) / 10;
  }, [margins]);

  const noRecipeCount = alerts.filter((a) => a.type === 'no_recipe').length;
  const lowMarginCount = alerts.filter((a) => a.type === 'low_margin').length;

  // ── Helpers ──

  const getMarginColor = (margin: number) => {
    if (margin < 25) return colors.destructive;
    if (margin < 35) return colors.warning;
    return colors.success;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return colors.success;
      case 'warning': return colors.warning;
      case 'critical': return colors.destructive;
      default: return colors.muted;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'healthy': return t('financial.cogs.healthy');
      case 'warning': return t('financial.cogs.warning');
      case 'critical': return t('financial.cogs.critical');
      default: return status;
    }
  };

  const onRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['margins', restaurantId] });
    queryClient.invalidateQueries({ queryKey: ['margin-alerts', restaurantId] });
    queryClient.invalidateQueries({ queryKey: ['food-cost', restaurantId] });
  }, [queryClient, restaurantId]);

  // ── Loading / Error ──

  if (marginsQuery.isLoading || foodCostQuery.isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.foregroundSecondary }]}>
          {t('common.loading')}
        </Text>
      </View>
    );
  }

  if (marginsQuery.isError) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Icon name="alert-circle-outline" size={48} color={colors.destructive} />
        <Text style={[styles.errorText, { color: colors.destructive }]}>{t('common.error')}</Text>
        <Button onPress={onRefresh} textColor={colors.primary}>{t('common.retry')}</Button>
      </View>
    );
  }

  return (
    <ScreenContainer>
    <View style={[styles.container, { backgroundColor: colors.background }]} accessibilityLabel="Margin dashboard">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={marginsQuery.isFetching}
            onRefresh={onRefresh}
            colors={[colors.primary]}
          />
        }
      >
        {/* ── Summary Cards ── */}
        <View style={styles.cardsRow}>
          {/* Food Cost % */}
          <Card style={[styles.summaryCard, { backgroundColor: colors.card }]}>
            <View style={styles.cardContent}>
              <Icon
                name="chart-pie"
                size={24}
                color={foodCost ? getStatusColor(foodCost.status) : colors.muted}
              />
              <Text style={[styles.cardValue, {
                color: foodCost ? getStatusColor(foodCost.status) : colors.foreground,
              }]}>
                {foodCost ? `${foodCost.food_cost_pct.toFixed(1)}%` : '--'}
              </Text>
              <Text style={[styles.cardLabel, { color: colors.foregroundSecondary }]}>
                {t('financial.cogs.food_cost')}
              </Text>
              {foodCost && (
                <Chip
                  style={[styles.statusChip, { backgroundColor: getStatusColor(foodCost.status) + '20' }]}
                  textStyle={{ color: getStatusColor(foodCost.status), fontSize: 10 }}
                >
                  {getStatusLabel(foodCost.status)}
                </Chip>
              )}
            </View>
          </Card>

          {/* Average Margin */}
          <Card style={[styles.summaryCard, { backgroundColor: colors.card }]}>
            <View style={styles.cardContent}>
              <Icon name="trending-up" size={24} color={getMarginColor(avgMargin)} />
              <Text style={[styles.cardValue, { color: getMarginColor(avgMargin) }]}>
                {avgMargin.toFixed(1)}%
              </Text>
              <Text style={[styles.cardLabel, { color: colors.foregroundSecondary }]}>
                {t('financial.cogs.avg_margin')}
              </Text>
            </View>
          </Card>

          {/* Alerts Count */}
          <Card style={[styles.summaryCard, { backgroundColor: colors.card }]}>
            <View style={styles.cardContent}>
              <Icon
                name="alert-circle"
                size={24}
                color={alerts.length > 0 ? colors.warning : colors.success}
              />
              <Text style={[styles.cardValue, {
                color: alerts.length > 0 ? colors.warning : colors.success,
              }]}>
                {alerts.length}
              </Text>
              <Text style={[styles.cardLabel, { color: colors.foregroundSecondary }]}>
                {t('financial.cogs.alerts')}
              </Text>
            </View>
          </Card>
        </View>

        {/* Period selector */}
        <SegmentedButtons
          value={String(period)}
          onValueChange={(v) => setPeriod(parseInt(v, 10))}
          buttons={[
            { value: '7', label: `7 ${t('financial.cogs.days')}` },
            { value: '30', label: `30 ${t('financial.cogs.days')}` },
            { value: '90', label: `90 ${t('financial.cogs.days')}` },
          ]}
          style={styles.segmented}
        />

        {/* Tab selector */}
        <SegmentedButtons
          value={tab}
          onValueChange={(v) => setTab(v as TabValue)}
          buttons={[
            { value: 'margins', label: t('financial.cogs.worst_margins') },
            { value: 'alerts', label: `${t('financial.cogs.alerts')} (${alerts.length})` },
          ]}
          style={styles.segmented}
        />

        {/* ── Margins Tab ── */}
        {tab === 'margins' && (
          <>
            {/* Category Filter */}
            {categories.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
                <Chip
                  selected={!categoryFilter}
                  onPress={() => setCategoryFilter(null)}
                  style={styles.filterChip}
                  selectedColor={colors.primary}
                >
                  {t('common.viewAll')}
                </Chip>
                {categories.map((cat) => (
                  <Chip
                    key={cat}
                    selected={categoryFilter === cat}
                    onPress={() => setCategoryFilter(cat)}
                    style={styles.filterChip}
                    selectedColor={colors.primary}
                  >
                    {cat}
                  </Chip>
                ))}
              </ScrollView>
            )}

            {filteredMargins.length === 0 ? (
              <View style={styles.emptyState}>
                <Icon name="chart-line" size={48} color={colors.muted} />
                <Text style={[styles.emptyText, { color: colors.foregroundSecondary }]}>
                  {t('common.noResults')}
                </Text>
              </View>
            ) : (
              filteredMargins.map((item) => (
                <Card
                  key={item.menu_item_id}
                  style={[styles.marginCard, { backgroundColor: colors.card }]}
                >
                  <View style={styles.marginHeader}>
                    <View style={styles.marginNameArea}>
                      <Text style={[styles.marginName, { color: colors.foreground }]}>
                        {item.name}
                      </Text>
                      {item.category && (
                        <Text style={[styles.marginCategory, { color: colors.foregroundSecondary }]}>
                          {item.category}
                        </Text>
                      )}
                    </View>
                    <View style={[
                      styles.marginBadge,
                      { backgroundColor: getMarginColor(item.margin_pct) + '20' },
                    ]}>
                      <Text style={[styles.marginBadgeText, { color: getMarginColor(item.margin_pct) }]}>
                        {item.margin_pct.toFixed(1)}%
                      </Text>
                    </View>
                  </View>

                  <View style={styles.marginDetails}>
                    <View style={styles.marginDetailItem}>
                      <Text style={[styles.detailLabel, { color: colors.foregroundSecondary }]}>
                        {t('financial.cogs.sale_price')}
                      </Text>
                      <Text style={[styles.detailValue, { color: colors.foreground }]}>
                        {formatCurrency(item.sale_price, locale)}
                      </Text>
                    </View>
                    <View style={styles.marginDetailItem}>
                      <Text style={[styles.detailLabel, { color: colors.foregroundSecondary }]}>
                        {t('financial.cogs.cost_price')}
                      </Text>
                      <Text style={[styles.detailValue, { color: colors.foreground }]}>
                        {item.cost_price > 0 ? formatCurrency(item.cost_price, locale) : '--'}
                      </Text>
                    </View>
                    <View style={styles.marginDetailItem}>
                      <Text style={[styles.detailLabel, { color: colors.foregroundSecondary }]}>
                        {t('financial.cogs.units_sold')}
                      </Text>
                      <Text style={[styles.detailValue, { color: colors.foreground }]}>
                        {item.units_sold}
                      </Text>
                    </View>
                    <View style={styles.marginDetailItem}>
                      <Text style={[styles.detailLabel, { color: colors.foregroundSecondary }]}>
                        {t('financial.cogs.profit')}
                      </Text>
                      <Text style={[styles.detailValue, {
                        color: item.profit >= 0 ? colors.success : colors.destructive,
                      }]}>
                        {formatCurrency(item.profit, locale)}
                      </Text>
                    </View>
                  </View>
                </Card>
              ))
            )}
          </>
        )}

        {/* ── Alerts Tab ── */}
        {tab === 'alerts' && (
          <>
            {alerts.length === 0 ? (
              <View style={styles.emptyState}>
                <Icon name="check-circle" size={48} color={colors.success} />
                <Text style={[styles.emptyText, { color: colors.foregroundSecondary }]}>
                  {t('common.noResults')}
                </Text>
              </View>
            ) : (
              <>
                {/* No Recipe Alerts */}
                {noRecipeCount > 0 && (
                  <View style={styles.alertSection}>
                    <Text style={[styles.alertSectionTitle, { color: colors.foreground }]}>
                      <Icon name="book-off-outline" size={16} color={colors.warning} />{' '}
                      {t('financial.cogs.items_without_recipe')} ({noRecipeCount})
                    </Text>
                    {alerts
                      .filter((a) => a.type === 'no_recipe')
                      .map((alert) => (
                        <View
                          key={alert.menu_item_id}
                          style={[styles.alertRow, { borderLeftColor: colors.warning }]}
                        >
                          <Icon name="alert-outline" size={18} color={colors.warning} />
                          <Text style={[styles.alertItemName, { color: colors.foreground }]}>
                            {alert.name}
                          </Text>
                          <Chip
                            style={[styles.alertChip, { backgroundColor: colors.warning + '20' }]}
                            textStyle={{ color: colors.warning, fontSize: 10 }}
                          >
                            {t('financial.cogs.no_recipe')}
                          </Chip>
                        </View>
                      ))}
                  </View>
                )}

                {/* Low Margin Alerts */}
                {lowMarginCount > 0 && (
                  <View style={styles.alertSection}>
                    <Text style={[styles.alertSectionTitle, { color: colors.foreground }]}>
                      <Icon name="trending-down" size={16} color={colors.destructive} />{' '}
                      {t('financial.cogs.low_margin_items')} ({lowMarginCount})
                    </Text>
                    {alerts
                      .filter((a) => a.type === 'low_margin')
                      .map((alert) => (
                        <View
                          key={alert.menu_item_id}
                          style={[styles.alertRow, { borderLeftColor: colors.destructive }]}
                        >
                          <Icon name="arrow-down" size={18} color={colors.destructive} />
                          <Text style={[styles.alertItemName, { color: colors.foreground }]}>
                            {alert.name}
                          </Text>
                          <Chip
                            style={[styles.alertChip, { backgroundColor: colors.destructive + '20' }]}
                            textStyle={{ color: colors.destructive, fontSize: 10 }}
                          >
                            {alert.margin_pct?.toFixed(1)}%
                          </Chip>
                        </View>
                      ))}
                  </View>
                )}
              </>
            )}
          </>
        )}

        {/* Benchmark footer */}
        {foodCost && (
          <View style={[styles.benchmarkFooter, { backgroundColor: colors.card }]}>
            <Icon name="information-outline" size={16} color={colors.info} />
            <Text style={[styles.benchmarkText, { color: colors.foregroundSecondary }]}>
              {t('financial.cogs.benchmark')}: {foodCost.benchmark} ({t('financial.cogs.food_cost')})
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
  },
  errorText: {
    fontSize: 16,
    marginTop: 8,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
  },
  cardContent: {
    alignItems: 'center',
    gap: 4,
  },
  cardValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  cardLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
  statusChip: {
    marginTop: 4,
    height: 22,
  },
  segmented: {
    marginBottom: 12,
  },
  filterRow: {
    marginBottom: 12,
    maxHeight: 40,
  },
  filterChip: {
    marginRight: 8,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
  },
  // Margin item card
  marginCard: {
    marginBottom: 10,
    padding: 14,
    borderRadius: 12,
  },
  marginHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  marginNameArea: {
    flex: 1,
    marginRight: 8,
  },
  marginName: {
    fontSize: 16,
    fontWeight: '600',
  },
  marginCategory: {
    fontSize: 12,
    marginTop: 2,
  },
  marginBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  marginBadgeText: {
    fontSize: 14,
    fontWeight: '700',
  },
  marginDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  marginDetailItem: {
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 10,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Alerts
  alertSection: {
    marginBottom: 20,
  },
  alertSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderLeftWidth: 3,
    marginBottom: 6,
  },
  alertItemName: {
    flex: 1,
    fontSize: 14,
  },
  alertChip: {
    height: 24,
  },
  // Benchmark footer
  benchmarkFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  benchmarkText: {
    fontSize: 12,
    flex: 1,
  },
});
