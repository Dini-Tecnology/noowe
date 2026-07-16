/**
 * PartialOrderScreen -- Add items to an existing open order (comanda aberta)
 *
 * Shows:
 *   - Current confirmed items (read-only)
 *   - New items to add (interactive)
 *   - Running total with breakdown
 *   - CTA "Adicionar ao pedido" -> POST /orders/:id/items
 *   - "Ver pedido completo" button
 *
 * @module orders/PartialOrderScreen
 * @epic EPIC 17 — Extended Features
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import {
  Text,
  Button,
  Card,
  IconButton,
  Divider,
  ActivityIndicator,
  Badge,
  Chip,
} from 'react-native-paper';
import { useRoute, useNavigation } from '@react-navigation/native';
import ApiService from '@/shared/services/api';
import { usePullToRefresh } from '@okinawa/shared/hooks/usePullToRefresh';
import { useI18n } from '@/shared/hooks/useI18n';
import { formatCurrency } from '@okinawa/shared/utils/formatters';
import { getLanguage } from '@okinawa/shared/i18n';
import { useColors } from '@/shared/contexts/ThemeContext';
import { spacing, borderRadius } from '@/shared/theme/spacing';
import { typography } from '@/shared/theme/typography';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';

// ============================================
// TYPES
// ============================================

interface OrderItem {
  id: string;
  menu_item_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  status: string;
  menu_item?: {
    id: string;
    name: string;
    description?: string;
    price: number;
    image_url?: string;
    category?: string;
  };
  special_instructions?: string;
}

interface Order {
  id: string;
  status: string;
  subtotal: number;
  tax_amount: number;
  tip_amount: number;
  total_amount: number;
  items: OrderItem[];
}

interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  image_url?: string;
  category?: string;
  is_available: boolean;
}

interface NewItem {
  menu_item_id: string;
  menuItem: MenuItem;
  quantity: number;
  special_instructions?: string;
}

// ============================================
// COMPONENT
// ============================================

export default function PartialOrderScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const route = useRoute();
  const navigation = useNavigation<any>();
  const { orderId, restaurantId } = route.params as {
    orderId: string;
    restaurantId: string;
  };

  const [order, setOrder] = useState<Order | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [newItems, setNewItems] = useState<NewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  // ---- Load order and menu ----
  useEffect(() => {
    loadData();
  }, [orderId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [orderRes, menuRes] = await Promise.all([
        ApiService.get(`/orders/${orderId}`),
        ApiService.get(`/menu-items?restaurant_id=${restaurantId}&is_available=true`),
      ]);
      setOrder(orderRes.data);
      setMenuItems(menuRes.data?.items || menuRes.data || []);
    } catch (error) {
      const err = error as Error;
      Alert.alert(t('common.error'), err.message);
    } finally {
      setLoading(false);
    }
  };

  const pullToRefresh = usePullToRefresh(loadData);

  // ---- New items management ----
  const addNewItem = useCallback((menuItem: MenuItem) => {
    setNewItems((prev) => {
      const existing = prev.find((ni) => ni.menu_item_id === menuItem.id);
      if (existing) {
        return prev.map((ni) =>
          ni.menu_item_id === menuItem.id
            ? { ...ni, quantity: ni.quantity + 1 }
            : ni,
        );
      }
      return [
        ...prev,
        {
          menu_item_id: menuItem.id,
          menuItem,
          quantity: 1,
        },
      ];
    });
    setShowMenu(false);
  }, []);

  const updateNewItemQuantity = useCallback(
    (menuItemId: string, delta: number) => {
      setNewItems((prev) => {
        return prev
          .map((ni) =>
            ni.menu_item_id === menuItemId
              ? { ...ni, quantity: Math.max(0, ni.quantity + delta) }
              : ni,
          )
          .filter((ni) => ni.quantity > 0);
      });
    },
    [],
  );

  const removeNewItem = useCallback((menuItemId: string) => {
    setNewItems((prev) => prev.filter((ni) => ni.menu_item_id !== menuItemId));
  }, []);

  // ---- Totals ----
  const confirmedSubtotal = useMemo(() => {
    if (!order) return 0;
    return order.items.reduce((sum, item) => sum + Number(item.total_price), 0);
  }, [order]);

  const newItemsSubtotal = useMemo(() => {
    return newItems.reduce(
      (sum, ni) => sum + ni.menuItem.price * ni.quantity,
      0,
    );
  }, [newItems]);

  const grandTotal = confirmedSubtotal + newItemsSubtotal;

  // ---- Submit new items ----
  const handleSubmit = useCallback(async () => {
    if (newItems.length === 0) return;

    setSubmitting(true);
    try {
      const payload = {
        items: newItems.map((ni) => ({
          menu_item_id: ni.menu_item_id,
          quantity: ni.quantity,
          special_instructions: ni.special_instructions,
        })),
      };

      await ApiService.post(`/orders/${orderId}/items`, payload);

      Alert.alert(t('common.success'), t('partialOrder.sendItems'));
      setNewItems([]);
      await loadData(); // Reload order with updated items
    } catch (error) {
      const err = error as Error;
      Alert.alert(t('common.error'), err.message || t('common.error'));
    } finally {
      setSubmitting(false);
    }
  }, [newItems, orderId, t]);

  // ---- Styles ----
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.backgroundSecondary,
        },
        scrollContent: {
          padding: spacing.screenHorizontal,
          paddingBottom: spacing[10],
        },
        header: {
          paddingTop: spacing[4],
          paddingBottom: spacing[2],
        },
        title: {
          ...typography.h2,
          color: colors.foreground,
          marginBottom: spacing[1],
        },
        statusBadge: {
          alignSelf: 'flex-start',
          marginBottom: spacing[3],
        },
        section: {
          backgroundColor: colors.card,
          borderRadius: borderRadius.card,
          borderWidth: 1,
          borderColor: colors.cardBorder,
          padding: spacing[4],
          marginBottom: spacing[4],
        },
        sectionTitle: {
          ...typography.h3,
          color: colors.foreground,
          marginBottom: spacing[3],
        },
        sectionSubtitle: {
          ...typography.bodySmall,
          color: colors.foregroundSecondary,
          marginBottom: spacing[3],
        },
        itemRow: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: spacing[2],
          borderBottomWidth: 1,
          borderBottomColor: colors.borderLight,
        },
        itemInfo: {
          flex: 1,
        },
        itemName: {
          ...typography.bodyLarge,
          color: colors.foreground,
        },
        itemPrice: {
          ...typography.bodyMedium,
          color: colors.foregroundSecondary,
        },
        itemQuantity: {
          ...typography.labelLarge,
          color: colors.foreground,
          minWidth: 30,
          textAlign: 'center',
        },
        quantityControls: {
          flexDirection: 'row',
          alignItems: 'center',
        },
        totalSection: {
          backgroundColor: colors.card,
          borderRadius: borderRadius.card,
          borderWidth: 1,
          borderColor: colors.cardBorder,
          padding: spacing[4],
          marginBottom: spacing[4],
        },
        totalRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingVertical: spacing[1],
        },
        totalLabel: {
          ...typography.bodyLarge,
          color: colors.foregroundSecondary,
        },
        totalValue: {
          ...typography.bodyLarge,
          color: colors.foreground,
        },
        grandTotalLabel: {
          ...typography.h3,
          color: colors.foreground,
        },
        grandTotalValue: {
          ...typography.h3,
          color: colors.primary,
        },
        addMoreButton: {
          marginBottom: spacing[3],
        },
        submitButton: {
          marginBottom: spacing[2],
        },
        viewFullButton: {
          marginBottom: spacing[4],
        },
        emptyNew: {
          ...typography.bodyMedium,
          color: colors.foregroundMuted,
          textAlign: 'center',
          paddingVertical: spacing[4],
        },
        menuOverlay: {
          backgroundColor: colors.card,
          borderRadius: borderRadius.card,
          borderWidth: 1,
          borderColor: colors.cardBorder,
          padding: spacing[4],
          marginBottom: spacing[4],
          maxHeight: 400,
        },
        menuItem: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: spacing[3],
          borderBottomWidth: 1,
          borderBottomColor: colors.borderLight,
        },
        menuItemName: {
          ...typography.bodyLarge,
          color: colors.foreground,
          flex: 1,
        },
        menuItemPrice: {
          ...typography.labelLarge,
          color: colors.primary,
          marginRight: spacing[2],
        },
        loadingContainer: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        },
      }),
    [colors],
  );

  // ---- Loading ----
  if (loading) {
    return (
      <ScreenContainer>
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    
      </ScreenContainer>
    );
  }

  if (!order) {
    return (
      <ScreenContainer>
      <View style={styles.loadingContainer}>
        <Text style={{ color: colors.foregroundSecondary }}>
          {t('common.error')}
        </Text>
      </View>
    
      </ScreenContainer>
    );
  }

  // ---- Render ----
  return (
    <ScreenContainer>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={pullToRefresh.refreshing} onRefresh={() => { void pullToRefresh.onRefresh(); }} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('partialOrder.title')}</Text>
        <Chip
          style={styles.statusBadge}
          icon="receipt"
        >
          {t('partialOrder.openForAdditions')}
        </Chip>
      </View>

      {/* Confirmed Items */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('partialOrder.confirmedItems')}</Text>
        <Text style={styles.sectionSubtitle}>{t('partialOrder.confirmed')}</Text>
        {order.items.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>
                {item.menu_item?.name || item.menu_item_id.slice(0, 8)}
              </Text>
              <Text style={styles.itemPrice}>
                {item.quantity}x {formatCurrency(Number(item.unit_price), getLanguage())}
              </Text>
            </View>
            <Text style={styles.itemQuantity}>
              {formatCurrency(Number(item.total_price), getLanguage())}
            </Text>
          </View>
        ))}
      </View>

      {/* New Items (not yet sent) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('partialOrder.newItems')}</Text>
        <Text style={styles.sectionSubtitle}>{t('partialOrder.newItemsNotSent')}</Text>

        {newItems.length === 0 ? (
          <Text style={styles.emptyNew}>{t('partialOrder.addMore')}</Text>
        ) : (
          newItems.map((ni) => (
            <View key={ni.menu_item_id} style={styles.itemRow}>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{ni.menuItem.name}</Text>
                <Text style={styles.itemPrice}>
                  {formatCurrency(ni.menuItem.price, getLanguage())}
                </Text>
              </View>
              <View style={styles.quantityControls}>
                <IconButton
                  icon="minus-circle-outline"
                  size={24}
                  iconColor={colors.error}
                  onPress={() => updateNewItemQuantity(ni.menu_item_id, -1)}
                  accessibilityLabel={`Decrease ${ni.menuItem.name}`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                />
                <Text style={styles.itemQuantity}>{ni.quantity}</Text>
                <IconButton
                  icon="plus-circle-outline"
                  size={24}
                  iconColor={colors.primary}
                  onPress={() => updateNewItemQuantity(ni.menu_item_id, 1)}
                  accessibilityLabel={`Increase ${ni.menuItem.name}`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                />
                <IconButton
                  icon="trash-can-outline"
                  size={20}
                  iconColor={colors.error}
                  onPress={() => removeNewItem(ni.menu_item_id)}
                  accessibilityLabel={`Remove ${ni.menuItem.name}`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                />
              </View>
            </View>
          ))
        )}

        <Button
          mode="outlined"
          icon="plus"
          onPress={() => setShowMenu(!showMenu)}
          style={styles.addMoreButton}
          textColor={colors.primary}
        >
          {t('partialOrder.addMore')}
        </Button>
      </View>

      {/* Menu picker */}
      {showMenu && (
        <View style={styles.menuOverlay}>
          <Text style={styles.sectionTitle}>{t('navigation.menu')}</Text>
          <FlatList
            data={menuItems.filter((mi) => mi.is_available)}
            keyExtractor={(item) => item.id}
            scrollEnabled={true}
            nestedScrollEnabled={true}
            getItemLayout={(_, index) => ({
              length: 60,
              offset: 60 * index,
              index,
            })}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => addNewItem(item)}
                accessibilityLabel={`Add ${item.name}`}
              >
                <Text style={styles.menuItemName}>{item.name}</Text>
                <Text style={styles.menuItemPrice}>
                  {formatCurrency(Number(item.price), getLanguage())}
                </Text>
                <IconButton icon="plus" size={20} iconColor={colors.primary} />
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* Totals */}
      <View style={styles.totalSection}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{t('partialOrder.confirmed')}</Text>
          <Text style={styles.totalValue}>
            {formatCurrency(confirmedSubtotal, getLanguage())}
          </Text>
        </View>
        {newItemsSubtotal > 0 && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t('partialOrder.newItems')}</Text>
            <Text style={styles.totalValue}>
              + {formatCurrency(newItemsSubtotal, getLanguage())}
            </Text>
          </View>
        )}
        <Divider style={{ marginVertical: spacing[2] }} />
        <View style={styles.totalRow}>
          <Text style={styles.grandTotalLabel}>{t('partialOrder.runningTotal')}</Text>
          <Text style={styles.grandTotalValue}>
            {formatCurrency(grandTotal, getLanguage())}
          </Text>
        </View>
      </View>

      {/* Actions */}
      {newItems.length > 0 && (
        <Button
          mode="contained"
          onPress={handleSubmit}
          loading={submitting}
          disabled={submitting}
          style={styles.submitButton}
          buttonColor={colors.primary}
          textColor={colors.primaryForeground}
          icon="send"
        >
          {t('partialOrder.addToOrder')}
        </Button>
      )}

      <Button
        mode="outlined"
        onPress={() => navigation.navigate('OrderStatus', { orderId })}
        style={styles.viewFullButton}
        textColor={colors.foreground}
        icon="receipt"
      >
        {t('partialOrder.viewFullOrder')}
      </Button>
    </ScrollView>
  
    </ScreenContainer>
  );
}
