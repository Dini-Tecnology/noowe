import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, Chip } from 'react-native-paper';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { Searchbar } from 'react-native-paper';
import ApiService from '@/shared/services/api';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useCart } from '@/shared/contexts/CartContext';
import { useI18n } from '@/shared/hooks/useI18n';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import logger from '@okinawa/shared/utils/logger';
import MenuItemCard from './MenuItemCard';
import { useScreenTracking, useAnalytics } from '@/shared/hooks/useAnalytics';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { usePullToRefresh } from '@okinawa/shared/hooks/usePullToRefresh';

/**
 * MenuItem interface defines the structure of menu items
 */
interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image_url?: string;
  is_available: boolean;
  preparation_time: number;
  allergens?: string[];
  dietary_info?: string[];
}

/**
 * MenuScreen - Restaurant menu display with cart functionality
 * Shows menu items filtered by category with search capability
 * Uses semantic design tokens via useColors() for theme-aware styling
 */
export default function MenuScreen() {
  useScreenTracking('Menu');

  const navigation = useNavigation();
  const route = useRoute();
  const { restaurantId, restaurantName } = route.params as { restaurantId: string; restaurantName?: string };
  const cart = useCart();
  const { t } = useI18n();
  const colors = useColors();
  const analytics = useAnalytics();

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [categories, setCategories] = useState<string[]>([]);

  /**
   * Loads menu items from API and extracts unique categories
   */
  const loadMenuItems = useCallback(async () => {
    setLoading(true);
    try {
      const items = await ApiService.getRestaurantMenu(restaurantId);
      setMenuItems(items);

      // Extract unique categories from menu items
      const uniqueCategories = Array.from(
        new Set(items.map((item: MenuItem) => item.category))
      );
      setCategories([t('common.all'), ...uniqueCategories] as string[]);
    } catch (error) {
      logger.error('Failed to load menu items:', error);
      await analytics.logError('Failed to load menu', 'MENU_LOAD_ERROR', false);
    } finally {
      setLoading(false);
    }
  }, [analytics, restaurantId, t]);

  const pullToRefresh = usePullToRefresh(loadMenuItems);

  useEffect(() => {
    void loadMenuItems();
  }, [loadMenuItems]);

  // Set restaurant context when component mounts
  useEffect(() => {
    if (restaurantId && restaurantName) {
      cart.setRestaurant(restaurantId, restaurantName);
    }
  }, [restaurantId, restaurantName]);

  /**
   * Adds item to cart with analytics tracking
   * @param item - Menu item to add
   */
  const addToCart = useCallback(async (item: MenuItem) => {
    await analytics.logAddToCart(item.id, item.name, item.price, 1);

    cart.addItem({
      menu_item_id: item.id,
      name: item.name,
      price: item.price,
      quantity: 1,
      image_url: item.image_url,
      category: item.category,
    });
  }, [cart, analytics]);

  /**
   * Removes item from cart or decrements quantity
   * @param itemId - Menu item ID to remove
   */
  const removeFromCart = useCallback((itemId: string) => {
    const existingItem = cart.items.find((item) => item.menu_item_id === itemId);
    if (existingItem) {
      if (existingItem.quantity > 1) {
        cart.updateQuantity(existingItem.id, existingItem.quantity - 1);
      } else {
        cart.removeItem(existingItem.id);
      }
    }
  }, [cart]);

  /**
   * Gets current quantity of item in cart
   * @param itemId - Menu item ID to check
   */
  const getItemQuantityInCart = useCallback((itemId: string) => {
    const cartItem = cart.items.find((item) => item.menu_item_id === itemId);
    return cartItem ? cartItem.quantity : 0;
  }, [cart.items]);

  // Filter items based on search query and selected category
  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory =
        selectedCategory === t('common.all') || item.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [menuItems, searchQuery, selectedCategory, t]);

  const renderMenuItem = useCallback(({ item }: { item: MenuItem }) => (
    <MenuItemCard
      item={item}
      quantityInCart={getItemQuantityInCart(item.id)}
      onAddToCart={addToCart}
      onRemoveFromCart={removeFromCart}
    />
  ), [getItemQuantityInCart, addToCart, removeFromCart]);

  /**
   * Handles search input with analytics tracking
   * @param query - Search query string
   */
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (query.length > 2) {
      await analytics.logSearch(query, 'menu_item');
    }
  }, [analytics]);

  const getTotalItems = () => cart.items.reduce((sum, item) => sum + item.quantity, 0);
  const getTotalPrice = () => cart.total;

  // Dynamic styles using semantic tokens for full theme support
  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    searchbar: {
      margin: 16,
      elevation: 2,
      backgroundColor: colors.card,
    },
    categories: {
      marginBottom: 10,
    },
    categoryFilterChip: {
      marginRight: 8,
      marginLeft: 15,
    },
    empty: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 50,
    },
    emptyText: {
      color: colors.foregroundSecondary,
    },
    cartBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 16,
      elevation: 8,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    cartInfo: {
      flex: 1,
    },
    cartText: {
      color: colors.foregroundSecondary,
    },
    cartTotal: {
      fontWeight: 'bold',
      color: colors.primary,
    },
    cartButton: {
      backgroundColor: colors.primary,
    },
  }), [colors]);

  return (
    <ScreenContainer>
    <View style={styles.container}>
      <Searchbar
        placeholder={t('menu.searchMenu')}
        onChangeText={handleSearch}
        value={searchQuery}
        style={styles.searchbar}
        accessibilityLabel="Search menu items"
        accessibilityHint="Type to filter menu items by name or description"
      />

      <View style={styles.categories}>
        <FlashList
          horizontal
          data={categories as string[]}
          renderItem={({ item }: ListRenderItemInfo<string>) => (
            <Chip
              selected={selectedCategory === item}
              onPress={() => setSelectedCategory(item)}
              style={styles.categoryFilterChip}
              accessibilityLabel={`Filter by ${item}`}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedCategory === item }}
            >
              {item.charAt(0).toUpperCase() + item.slice(1)}
            </Chip>
          )}
          keyExtractor={(item) => item}
          showsHorizontalScrollIndicator={false}
          estimatedItemSize={80}
        />
      </View>

      <FlashList
        data={filteredItems as MenuItem[]}
        renderItem={renderMenuItem}
        keyExtractor={(item) => item.id}
        estimatedItemSize={120}
        refreshing={pullToRefresh.refreshing}
        onRefresh={() => { void pullToRefresh.onRefresh(); }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="bodyLarge" style={styles.emptyText}>{t('empty.menuItems')}</Text>
          </View>
        }
      />

      {cart.items.length > 0 && (
        <View style={styles.cartBar}>
          <View style={styles.cartInfo}>
            <Text variant="titleMedium" style={styles.cartText}>
              {getTotalItems()} {t('cart.items')}
            </Text>
            <Text variant="titleLarge" style={styles.cartTotal}>
              R$ {getTotalPrice().toFixed(2)}
            </Text>
          </View>
          <Button
            mode="contained"
            onPress={() => (navigation as any).navigate('Cart', { cart, restaurantId })}
            style={styles.cartButton}
            accessibilityLabel={`View cart, ${getTotalItems()} items, total ${getTotalPrice().toFixed(2)}`}
            accessibilityRole="button"
          >
            {t('cart.viewCart')}
          </Button>
        </View>
      )}
    </View>
  
    </ScreenContainer>
  );
}
