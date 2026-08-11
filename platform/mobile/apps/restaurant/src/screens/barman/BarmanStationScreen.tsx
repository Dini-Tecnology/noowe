/**
 * BarmanStationScreen - Barman's complete work station
 *
 * Provides a tabbed interface with:
 * - Tab 1 (Pedidos): Active bar orders with urgency indicators
 * - Tab 2 (Receitas): Searchable recipe library with category filters
 * - Tab 3 (Estoque): Bar inventory with low-stock alerts
 *
 * @module restaurant/screens/barman
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  ScrollView,
  FlatList,
  StyleSheet,
  RefreshControl,
  Alert,
  Animated,
  TextInput as RNTextInput,
  Dimensions,
  TouchableOpacity,
  Image,
} from 'react-native';
import {
  Text,
  Card,
  Button,
  Chip,
  Badge,
  IconButton,
  SegmentedButtons,
  Searchbar,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import ApiService from '@/shared/services/api';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { useI18n } from '@/shared/hooks/useI18n';

// ============================================
// TYPES
// ============================================

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
}

interface DrinkRecipeItem {
  id: string;
  name: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  preparation_time_minutes: number;
  glass_type: string;
  garnish: string | null;
  base_spirit: string | null;
  serving_temp: string;
  ingredients: { name: string; amount: string; unit: string }[];
  steps: string[];
  tags: string[];
  price: number;
  image_url: string | null;
  is_active: boolean;
}

interface StockItem {
  id: string;
  name: string;
  category: string;
  current_level: number;
  min_level: number;
  max_level: number;
  unit: string;
  status: 'ok' | 'low' | 'critical';
}

// ============================================
// URGENCY HELPERS
// ============================================

const URGENCY_WARN_MINUTES = 5;
const URGENCY_CRITICAL_MINUTES = 10;

export const getUrgencyLevel = (createdAt: string): 'normal' | 'warn' | 'critical' => {
  const elapsed = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  if (elapsed >= URGENCY_CRITICAL_MINUTES) return 'critical';
  if (elapsed >= URGENCY_WARN_MINUTES) return 'warn';
  return 'normal';
};

const getTimeElapsed = (createdAt: string): string => {
  const minutes = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  return `${minutes} min`;
};

// ============================================
// CATEGORY FILTER CHIPS
// ============================================

const RECIPE_CATEGORIES = [
  'All',
  'Gin',
  'Vodka',
  'Rum',
  'Mocktail',
  'Wine',
  'Beer',
  'Coffee',
  'Signature',
];

// ============================================
// SUB-COMPONENTS
// ============================================

/**
 * Pulsing URGENT badge for critical orders
 */
function UrgentBadge({ colors }: { colors: any }) {
  const { t } = useI18n();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.6,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  return (
    <Animated.View style={{ opacity: pulseAnim }}>
      <Badge style={{ backgroundColor: colors.error }}>{t('barman.urgent')}</Badge>
    </Animated.View>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function BarmanStationScreen({ navigation }: { navigation: any }) {
  const colors = useColors();
  const { t } = useI18n();

  // Tab state
  const [activeTab, setActiveTab] = useState<'orders' | 'recipes' | 'stock'>('orders');

  // Timer for urgency refresh
  const [, setNow] = useState(Date.now());

  // Orders state
  const [orders, setOrders] = useState<DrinkOrder[]>([]);
  const [ordersRefreshing, setOrdersRefreshing] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [orderFilter, setOrderFilter] = useState<'all' | 'pending' | 'preparing' | 'ready'>('all');

  // Recipes state
  const [recipes, setRecipes] = useState<DrinkRecipeItem[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [recipesRefreshing, setRecipesRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Stock state
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockRefreshing, setStockRefreshing] = useState(false);

  // Memoized styles
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.backgroundSecondary,
        },
        tabBar: {
          flexDirection: 'row',
          backgroundColor: colors.card,
          paddingHorizontal: 8,
          paddingVertical: 8,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        tabButton: {
          flex: 1,
          alignItems: 'center',
          paddingVertical: 10,
          borderRadius: 8,
          marginHorizontal: 4,
        },
        tabButtonActive: {
          backgroundColor: colors.primary,
        },
        tabButtonInactive: {
          backgroundColor: colors.backgroundSecondary,
        },
        tabLabel: {
          fontWeight: '600',
          marginTop: 4,
        },
        tabLabelActive: {
          color: colors.primaryForeground,
        },
        tabLabelInactive: {
          color: colors.foregroundSecondary,
        },
        // Stats
        statsRow: {
          flexDirection: 'row',
          padding: 12,
          gap: 8,
        },
        statCard: {
          flex: 1,
          backgroundColor: colors.card,
          borderRadius: 12,
          padding: 12,
          alignItems: 'center',
          elevation: 2,
        },
        statNumber: {
          fontWeight: 'bold',
          marginTop: 6,
          color: colors.foreground,
        },
        statLabel: {
          color: colors.mutedForeground,
          marginTop: 2,
        },
        // Orders
        segmentedButtons: {
          marginHorizontal: 12,
          marginBottom: 10,
        },
        scrollContent: {
          padding: 12,
        },
        emptyContainer: {
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 80,
        },
        emptyTitle: {
          marginTop: 16,
          marginBottom: 8,
          color: colors.foreground,
        },
        emptyText: {
          color: colors.mutedForeground,
          textAlign: 'center',
        },
        orderCard: {
          marginBottom: 12,
          elevation: 3,
          backgroundColor: colors.card,
        },
        warnCard: {
          borderLeftWidth: 4,
          borderLeftColor: colors.warning,
        },
        criticalCard: {
          borderLeftWidth: 4,
          borderLeftColor: colors.error,
        },
        readyCard: {
          backgroundColor: colors.successBackground,
        },
        orderHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 8,
        },
        orderHeaderLeft: {
          flex: 1,
        },
        orderNumber: {
          fontWeight: 'bold',
          marginBottom: 4,
          color: colors.foreground,
        },
        tableInfo: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
        },
        tableNumber: {
          fontWeight: '600',
          color: colors.foreground,
        },
        orderHeaderRight: {
          alignItems: 'flex-end',
          gap: 4,
        },
        waiterInfo: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          marginBottom: 10,
          paddingBottom: 8,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        waiterName: {
          color: colors.mutedForeground,
        },
        itemsContainer: {
          marginBottom: 10,
        },
        itemRow: {
          marginBottom: 8,
          paddingBottom: 8,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
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
          gap: 4,
          marginTop: 6,
        },
        modifierChip: {
          height: 24,
          backgroundColor: colors.backgroundSecondary,
        },
        instructions: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          marginTop: 6,
          padding: 6,
          backgroundColor: colors.warningBackground,
          borderRadius: 6,
        },
        instructionsText: {
          color: colors.warning,
          flex: 1,
          fontStyle: 'italic',
        },
        actions: {
          marginTop: 8,
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
          padding: 8,
          gap: 8,
        },
        readyText: {
          color: colors.success,
          fontWeight: 'bold',
        },
        // Quick Access
        quickAccessContainer: {
          flexDirection: 'row',
          padding: 12,
          gap: 12,
        },
        quickAccessCard: {
          flex: 1,
          backgroundColor: colors.card,
          borderRadius: 12,
          padding: 16,
          elevation: 2,
        },
        quickAccessTitle: {
          fontWeight: 'bold',
          marginTop: 8,
          color: colors.foreground,
        },
        quickAccessSubtitle: {
          color: colors.mutedForeground,
          marginTop: 4,
        },
        // Recipes Tab
        searchContainer: {
          padding: 12,
        },
        categoryChips: {
          paddingHorizontal: 12,
          marginBottom: 8,
        },
        categoryChip: {
          marginRight: 8,
        },
        recipeCard: {
          marginHorizontal: 12,
          marginBottom: 10,
          backgroundColor: colors.card,
          borderRadius: 12,
          elevation: 2,
          overflow: 'hidden',
        },
        recipeCardContent: {
          flexDirection: 'row',
          padding: 12,
        },
        recipeImage: {
          width: 64,
          height: 64,
          borderRadius: 8,
          backgroundColor: colors.backgroundTertiary,
        },
        recipeImagePlaceholder: {
          width: 64,
          height: 64,
          borderRadius: 8,
          backgroundColor: colors.backgroundTertiary,
          alignItems: 'center',
          justifyContent: 'center',
        },
        recipeInfo: {
          flex: 1,
          marginLeft: 12,
        },
        recipeName: {
          fontWeight: 'bold',
          color: colors.foreground,
          marginBottom: 4,
        },
        recipeMetaRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginTop: 4,
        },
        recipeMeta: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 3,
        },
        recipeMetaText: {
          color: colors.mutedForeground,
        },
        difficultyBadge: {
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 10,
        },
        difficultyText: {
          fontWeight: '600',
        },
        // Stock Tab
        stockCard: {
          marginHorizontal: 12,
          marginBottom: 10,
          backgroundColor: colors.card,
          borderRadius: 12,
          padding: 14,
          elevation: 2,
        },
        stockCardCritical: {
          borderLeftWidth: 4,
          borderLeftColor: colors.error,
        },
        stockCardLow: {
          borderLeftWidth: 4,
          borderLeftColor: colors.warning,
        },
        stockHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        stockName: {
          fontWeight: 'bold',
          color: colors.foreground,
          flex: 1,
        },
        stockLevel: {
          color: colors.mutedForeground,
          marginTop: 4,
        },
        stockStatusBadge: {
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 10,
        },
        alertBanner: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginHorizontal: 12,
          marginTop: 8,
          padding: 12,
          backgroundColor: colors.warningBackground,
          borderRadius: 8,
          borderLeftWidth: 4,
          borderLeftColor: colors.warning,
        },
        alertBannerText: {
          flex: 1,
          color: colors.warning,
          fontWeight: '600',
        },
      }),
    [colors],
  );

  // ============================================
  // DATA LOADING
  // ============================================

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 30000);
    return () => clearInterval(interval);
  }, [orderFilter]);

  // Timer refresh for urgency
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeTab === 'recipes' && recipes.length === 0) {
      loadRecipes();
    }
    if (activeTab === 'stock' && stockItems.length === 0) {
      loadStock();
    }
  }, [activeTab]);

  const loadOrders = async () => {
    try {
      const data = await ApiService.getBarOrders({
        status: orderFilter !== 'all' ? orderFilter : undefined,
      });
      setOrders(data);
    } catch (error) {
      console.error('Failed to load bar orders:', error);
    } finally {
      setOrdersLoading(false);
    }
  };

  const loadRecipes = async () => {
    setRecipesLoading(true);
    try {
      const res = await ApiService.get('/recipes');
      const data = res.data;
      setRecipes(data?.items || data || []);
    } catch (error) {
      console.error('Failed to load recipes:', error);
    } finally {
      setRecipesLoading(false);
    }
  };

  const loadStock = async () => {
    setStockLoading(true);
    try {
      const res = await ApiService.get('/inventory/bar-stock');
      setStockItems(res.data || []);
    } catch (error) {
      console.error('Failed to load bar stock:', error);
    } finally {
      setStockLoading(false);
    }
  };

  // ============================================
  // ORDER ACTIONS
  // ============================================

  const handleStartOrder = async (orderId: string) => {
    try {
      await ApiService.updateOrderStatus(orderId, 'preparing');
      await loadOrders();
    } catch (error) {
      Alert.alert(t('common.error'), t('common.error'));
    }
  };

  const handleCompleteOrder = async (orderId: string) => {
    try {
      await ApiService.updateOrderStatus(orderId, 'ready');
      await loadOrders();
    } catch (error) {
      Alert.alert(t('common.error'), t('common.error'));
    }
  };

  const handleCancelItem = (orderId: string, itemId: string) => {
    Alert.alert(t('barman.action.cancelItem'), t('barman.confirm.cancelItem'), [
      { text: t('common.no'), style: 'cancel' },
      {
        text: t('common.yes'),
        style: 'destructive',
        onPress: async () => {
          try {
            await ApiService.cancelBarItem(orderId, itemId, 'Cancelled by bar staff');
            setOrders(
              orders.map((order) =>
                order.id === orderId
                  ? { ...order, items: order.items.filter((item) => item.id !== itemId) }
                  : order,
              ),
            );
          } catch (error) {
            Alert.alert(t('common.error'), t('common.error'));
          }
        },
      },
    ]);
  };

  // ============================================
  // RECIPE FILTERING
  // ============================================

  const filteredRecipes = useMemo(() => {
    let filtered = recipes;
    if (selectedCategory !== 'All') {
      filtered = filtered.filter((r) => r.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((r) => r.name.toLowerCase().includes(query));
    }
    return filtered;
  }, [recipes, selectedCategory, searchQuery]);

  // ============================================
  // DERIVED STATE
  // ============================================

  const pendingCount = orders.filter((o) => o.status === 'pending').length;
  const preparingCount = orders.filter((o) => o.status === 'preparing').length;
  const readyCount = orders.filter((o) => o.status === 'ready').length;

  const filteredOrders = orders.filter((order) => {
    if (orderFilter === 'all') return true;
    return order.status === orderFilter;
  });

  const stockAlertCount = stockItems.filter(
    (i) => i.status === 'low' || i.status === 'critical',
  ).length;

  const getPriorityColor = useCallback(
    (priority: string) => {
      switch (priority) {
        case 'urgent':
          return colors.error;
        case 'high':
          return colors.warning;
        default:
          return colors.success;
      }
    },
    [colors],
  );

  const getDifficultyColor = useCallback(
    (difficulty: string) => {
      switch (difficulty) {
        case 'easy':
          return { bg: colors.successBackground, text: colors.success };
        case 'medium':
          return { bg: colors.warningBackground, text: colors.warning };
        case 'hard':
          return { bg: colors.errorBackground, text: colors.error };
        default:
          return { bg: colors.backgroundTertiary, text: colors.foreground };
      }
    },
    [colors],
  );

  const getDifficultyLabel = (difficulty: string): string => {
    switch (difficulty) {
      case 'easy':
        return t('recipes.difficulty.easy');
      case 'medium':
        return t('recipes.difficulty.medium');
      case 'hard':
        return t('recipes.difficulty.hard');
      default:
        return difficulty;
    }
  };

  // ============================================
  // RENDER: TABS
  // ============================================

  const renderTabBar = () => (
    <View style={styles.tabBar}>
      {[
        { key: 'orders' as const, icon: 'glass-cocktail', label: t('barman.orders') },
        { key: 'recipes' as const, icon: 'book-open-variant', label: t('barman.recipes') },
        { key: 'stock' as const, icon: 'package-variant', label: t('barman.stock') },
      ].map((tab) => (
        <TouchableOpacity
          key={tab.key}
          style={[
            styles.tabButton,
            activeTab === tab.key ? styles.tabButtonActive : styles.tabButtonInactive,
          ]}
          onPress={() => setActiveTab(tab.key)}
          accessibilityRole="tab"
          accessibilityLabel={`${tab.label} tab`}
          accessibilityState={{ selected: activeTab === tab.key }}
        >
          <Icon
            name={tab.icon}
            size={22}
            color={activeTab === tab.key ? colors.primaryForeground : colors.foregroundSecondary}
          />
          <Text
            variant="labelMedium"
            style={[
              styles.tabLabel,
              activeTab === tab.key ? styles.tabLabelActive : styles.tabLabelInactive,
            ]}
          >
            {tab.label}
            {tab.key === 'stock' && stockAlertCount > 0 ? ` (${stockAlertCount})` : ''}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  // ============================================
  // RENDER: ORDERS TAB
  // ============================================

  const renderOrdersTab = () => (
    <>
      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Icon name="clock-outline" size={22} color={colors.warning} />
          <Text variant="headlineSmall" style={styles.statNumber}>
            {pendingCount}
          </Text>
          <Text variant="labelSmall" style={styles.statLabel}>
            {t('barman.stats.inQueue')}
          </Text>
        </View>
        <View style={styles.statCard}>
          <Icon name="check-circle" size={22} color={colors.success} />
          <Text variant="headlineSmall" style={styles.statNumber}>
            {readyCount}
          </Text>
          <Text variant="labelSmall" style={styles.statLabel}>
            {t('barman.stats.ready')}
          </Text>
        </View>
        <View style={styles.statCard}>
          <Icon name="glass-cocktail" size={22} color={colors.info} />
          <Text variant="headlineSmall" style={styles.statNumber}>
            {orders.length}
          </Text>
          <Text variant="labelSmall" style={styles.statLabel}>
            {t('barman.stats.today')}
          </Text>
        </View>
      </View>

      {/* Filter */}
      <SegmentedButtons
        value={orderFilter}
        onValueChange={(value) => setOrderFilter(value as any)}
        buttons={[
          { value: 'all', label: t('common.all'), icon: 'view-grid' },
          { value: 'pending', label: t('barman.filter.pending'), icon: 'clock-outline' },
          { value: 'preparing', label: t('barman.filter.preparing'), icon: 'beaker' },
          { value: 'ready', label: t('barman.stats.ready'), icon: 'check' },
        ]}
        style={styles.segmentedButtons}
      />

      {/* Orders List */}
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={ordersRefreshing}
            onRefresh={async () => {
              setOrdersRefreshing(true);
              await loadOrders();
              setOrdersRefreshing(false);
            }}
          />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {filteredOrders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Icon name="glass-cocktail" size={64} color={colors.foregroundMuted} />
            <Text variant="headlineSmall" style={styles.emptyTitle}>
              {t('barman.noQueue')}
            </Text>
            <Text variant="bodyMedium" style={styles.emptyText}>
              {t('barman.queueEmptySub')}
            </Text>
          </View>
        ) : (
          filteredOrders.map((order) => {
            const urgency = getUrgencyLevel(order.created_at);
            return (
              <Card
                key={order.id}
                style={[
                  styles.orderCard,
                  urgency === 'warn' && styles.warnCard,
                  urgency === 'critical' && styles.criticalCard,
                  order.status === 'ready' && styles.readyCard,
                ]}
              >
                <Card.Content>
                  <View style={styles.orderHeader}>
                    <View style={styles.orderHeaderLeft}>
                      <Text variant="titleLarge" style={styles.orderNumber}>
                        {order.order_number}
                      </Text>
                      <View style={styles.tableInfo}>
                        <Icon
                          name="table-furniture"
                          size={18}
                          color={colors.mutedForeground}
                        />
                        <Text variant="titleMedium" style={styles.tableNumber}>
                          Mesa {order.table_number}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.orderHeaderRight}>
                      <Chip
                        icon="clock"
                        textStyle={{ color: getPriorityColor(order.priority) }}
                        style={{ borderWidth: 1, borderColor: getPriorityColor(order.priority) }}
                        mode="outlined"
                        compact
                      >
                        {getTimeElapsed(order.created_at)}
                      </Chip>
                      {urgency === 'critical' && <UrgentBadge colors={colors} />}
                    </View>
                  </View>

                  {order.waiter_name && (
                    <View style={styles.waiterInfo}>
                      <Icon name="account" size={14} color={colors.mutedForeground} />
                      <Text variant="bodySmall" style={styles.waiterName}>
                        {order.waiter_name}
                      </Text>
                    </View>
                  )}

                  <View style={styles.itemsContainer}>
                    {order.items.map((item) => (
                      <View key={item.id} style={styles.itemRow}>
                        <View style={styles.itemHeader}>
                          <Text variant="titleMedium" style={styles.itemName}>
                            {item.quantity}x {item.name}
                          </Text>
                          {order.status === 'preparing' && (
                            <IconButton
                              icon="close-circle"
                              size={18}
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
                            <Icon name="note-text" size={12} color={colors.warning} />
                            <Text variant="bodySmall" style={styles.instructionsText}>
                              {item.instructions}
                            </Text>
                          </View>
                        )}
                      </View>
                    ))}
                  </View>

                  <View style={styles.actions}>
                    {order.status === 'pending' && (
                      <Button
                        mode="contained"
                        onPress={() => handleStartOrder(order.id)}
                        style={styles.startButton}
                        icon="play"
                        accessibilityLabel={`Start preparing order ${order.order_number}`}
                      >
                        {t('barman.action.start')}
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
                        <Icon name="check-circle" size={22} color={colors.success} />
                        <Text variant="titleMedium" style={styles.readyText}>
                          {t('barman.action.readyStatus')}
                        </Text>
                      </View>
                    )}
                  </View>
                </Card.Content>
              </Card>
            );
          })
        )}

        {/* Quick Access Cards */}
        <View style={styles.quickAccessContainer}>
          <TouchableOpacity
            style={styles.quickAccessCard}
            onPress={() => setActiveTab('recipes')}
            accessibilityRole="button"
            accessibilityLabel="View drink recipes"
          >
            <Icon name="book-open-variant" size={28} color={colors.primary} />
            <Text variant="titleSmall" style={styles.quickAccessTitle}>
              {t('barman.quickAccess.recipes')}
            </Text>
            <Text variant="bodySmall" style={styles.quickAccessSubtitle}>
              {t('barman.quickAccess.recipesSub')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickAccessCard}
            onPress={() => setActiveTab('stock')}
            accessibilityRole="button"
            accessibilityLabel="View bar stock"
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="package-variant" size={28} color={colors.warning} />
              {stockAlertCount > 0 && (
                <Badge style={{ backgroundColor: colors.warning }}>{stockAlertCount}</Badge>
              )}
            </View>
            <Text variant="titleSmall" style={styles.quickAccessTitle}>
              {t('barman.quickAccess.stock')}
            </Text>
            <Text variant="bodySmall" style={styles.quickAccessSubtitle}>
              {t('barman.quickAccess.stockSub', { count: String(stockAlertCount) })}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </>
  );

  // ============================================
  // RENDER: RECIPES TAB
  // ============================================

  const renderRecipeCard = ({ item }: { item: DrinkRecipeItem }) => {
    const diffColors = getDifficultyColor(item.difficulty);
    return (
      <TouchableOpacity
        style={styles.recipeCard}
        onPress={() =>
          navigation.navigate('RecipeDetail', { recipe: item })
        }
        accessibilityRole="button"
        accessibilityLabel={`View recipe for ${item.name}`}
      >
        <View style={styles.recipeCardContent}>
          {item.image_url ? (
            <Image
              source={{ uri: item.image_url }}
              style={styles.recipeImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.recipeImagePlaceholder}>
              <Icon name="glass-cocktail" size={28} color={colors.foregroundMuted} />
            </View>
          )}
          <View style={styles.recipeInfo}>
            <Text variant="titleMedium" style={styles.recipeName}>
              {item.name}
            </Text>
            <View style={styles.recipeMetaRow}>
              <View
                style={[styles.difficultyBadge, { backgroundColor: diffColors.bg }]}
              >
                <Text
                  variant="labelSmall"
                  style={[styles.difficultyText, { color: diffColors.text }]}
                >
                  {getDifficultyLabel(item.difficulty)}
                </Text>
              </View>
              <View style={styles.recipeMeta}>
                <Icon name="clock-outline" size={14} color={colors.mutedForeground} />
                <Text variant="bodySmall" style={styles.recipeMetaText}>
                  {t('recipes.prepTime', { min: String(item.preparation_time_minutes) })}
                </Text>
              </View>
            </View>
            <View style={[styles.recipeMetaRow, { marginTop: 2 }]}>
              <View style={styles.recipeMeta}>
                <Icon name="glass-wine" size={14} color={colors.mutedForeground} />
                <Text variant="bodySmall" style={styles.recipeMetaText}>
                  {item.glass_type}
                </Text>
              </View>
              <Chip compact mode="outlined" style={{ height: 24 }}>
                {item.category}
              </Chip>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderRecipesTab = () => (
    <>
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder={t('recipes.search')}
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={{ backgroundColor: colors.card }}
          accessibilityLabel="Search recipes"
        />
      </View>

      {/* Category Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryChips}
      >
        {RECIPE_CATEGORIES.map((cat) => (
          <Chip
            key={cat}
            selected={selectedCategory === cat}
            onPress={() => setSelectedCategory(cat)}
            style={styles.categoryChip}
            mode={selectedCategory === cat ? 'flat' : 'outlined'}
            accessibilityRole="button"
            accessibilityLabel={`Filter by ${cat === 'All' ? 'all categories' : cat}`}
            accessibilityState={{ selected: selectedCategory === cat }}
          >
            {cat === 'All' ? t('common.all') : cat}
          </Chip>
        ))}
      </ScrollView>

      {/* Recipe List */}
      <FlatList
        data={filteredRecipes}
        renderItem={renderRecipeCard}
        keyExtractor={(item) => item.id}
        getItemLayout={(_, index) => ({
          length: 100,
          offset: 100 * index,
          index,
        })}
        refreshControl={
          <RefreshControl
            refreshing={recipesRefreshing}
            onRefresh={async () => {
              setRecipesRefreshing(true);
              await loadRecipes();
              setRecipesRefreshing(false);
            }}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="book-open-variant" size={64} color={colors.foregroundMuted} />
            <Text variant="headlineSmall" style={styles.emptyTitle}>
              {t('recipes.empty')}
            </Text>
            <Text variant="bodyMedium" style={styles.emptyText}>
              {t('recipes.emptySub')}
            </Text>
          </View>
        }
      />
    </>
  );

  // ============================================
  // RENDER: STOCK TAB
  // ============================================

  const renderStockCard = ({ item }: { item: StockItem }) => (
    <View
      style={[
        styles.stockCard,
        item.status === 'critical' && styles.stockCardCritical,
        item.status === 'low' && styles.stockCardLow,
      ]}
    >
      <View style={styles.stockHeader}>
        <Text variant="titleMedium" style={styles.stockName}>
          {item.name}
        </Text>
        <View
          style={[
            styles.stockStatusBadge,
            {
              backgroundColor:
                item.status === 'critical'
                  ? colors.errorBackground
                  : item.status === 'low'
                    ? colors.warningBackground
                    : colors.successBackground,
            },
          ]}
        >
          <Text
            variant="labelSmall"
            style={{
              color:
                item.status === 'critical'
                  ? colors.error
                  : item.status === 'low'
                    ? colors.warning
                    : colors.success,
              fontWeight: '600',
            }}
          >
            {item.status === 'critical'
              ? t('stock.statusCritical')
              : item.status === 'low'
                ? t('stock.statusLow')
                : t('stock.statusOk')}
          </Text>
        </View>
      </View>
      <Text variant="bodySmall" style={styles.stockLevel}>
        {item.current_level} / {item.max_level} {item.unit}
      </Text>
    </View>
  );

  const renderStockTab = () => (
    <>
      {/* Alert Banner */}
      {stockAlertCount > 0 && (
        <View style={styles.alertBanner}>
          <Icon name="alert-circle" size={22} color={colors.warning} />
          <Text style={styles.alertBannerText}>
            {t('stock.alertBannerTitle')} - {stockAlertCount}{' '}
            {stockAlertCount === 1 ? 'item' : 'itens'}
          </Text>
        </View>
      )}

      <FlatList
        data={stockItems}
        renderItem={renderStockCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 20 }}
        getItemLayout={(_, index) => ({
          length: 80,
          offset: 80 * index,
          index,
        })}
        refreshControl={
          <RefreshControl
            refreshing={stockRefreshing}
            onRefresh={async () => {
              setStockRefreshing(true);
              await loadStock();
              setStockRefreshing(false);
            }}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="package-variant" size={64} color={colors.foregroundMuted} />
            <Text variant="headlineSmall" style={styles.emptyTitle}>
              {t('stock.emptyTitle')}
            </Text>
            <Text variant="bodyMedium" style={styles.emptyText}>
              {t('stock.emptySubtitle')}
            </Text>
          </View>
        }
      />
    </>
  );

  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <ScreenContainer hasKeyboard>
    <View style={styles.container}>
      {renderTabBar()}
      {activeTab === 'orders' && renderOrdersTab()}
      {activeTab === 'recipes' && renderRecipesTab()}
      {activeTab === 'stock' && renderStockTab()}
    </View>
    </ScreenContainer>
  );
}
