/**
 * RecipeScreen - Recipe Sheet (Ficha Tecnica) Management
 *
 * Allows owners/managers to create and manage recipe sheets for menu items.
 * Each recipe maps ingredients with quantities to calculate costs and margins.
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
  Alert,
  ScrollView,
} from 'react-native';
import {
  Text,
  Button,
  TextInput,
  FAB,
  Portal,
  Modal,
  ActivityIndicator,
  Divider,
  Chip,
  IconButton,
  Searchbar,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { useI18n } from '@/shared/hooks/useI18n';
import { useRestaurant } from '@/shared/contexts/RestaurantContext';
import { formatCurrency } from '@okinawa/shared/utils/formatters';
import { getLanguage } from '@okinawa/shared/i18n';
import ApiService from '@/shared/services/api';
import { Card } from '@okinawa/shared/components';
import * as Haptics from 'expo-haptics';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { recipeIngredientSchema, validateForm } from '@okinawa/shared/validation/schemas';

interface IngredientItem {
  id: string;
  name: string;
  unit: string;
  category?: string;
}

interface RecipeIngredientItem {
  id: string;
  ingredient_id: string;
  ingredient_name: string;
  quantity: number;
  unit: string;
}

interface RecipeItem {
  id: string;
  menu_item_id: string;
  menu_item_name: string;
  sale_price: number;
  calculated_cost: number | null;
  calculated_margin_pct: number | null;
  last_calculated_at: string | null;
  ingredient_count: number;
  ingredients: RecipeIngredientItem[];
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  category?: { name: string };
}

export default function RecipeScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const { restaurantId } = useRestaurant();
  const locale = getLanguage();
  const queryClient = useQueryClient();

  const [selectedRecipe, setSelectedRecipe] = useState<RecipeItem | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddIngredientModal, setShowAddIngredientModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Form state
  const [selectedMenuItemId, setSelectedMenuItemId] = useState('');
  const [selectedIngredientId, setSelectedIngredientId] = useState('');
  const [ingredientQuantity, setIngredientQuantity] = useState('');

  // ── Queries ──

  const recipesQuery = useQuery({
    queryKey: ['recipes', restaurantId],
    queryFn: () => ApiService.getRecipes(restaurantId),
    enabled: !!restaurantId,
  });

  const ingredientsQuery = useQuery({
    queryKey: ['ingredients', restaurantId],
    queryFn: () => ApiService.getIngredients(restaurantId),
    enabled: !!restaurantId,
  });

  const menuItemsQuery = useQuery({
    queryKey: ['menu-items', restaurantId],
    queryFn: async () => {
      const response = await ApiService.get(`/menu-items?restaurant_id=${restaurantId}`);
      return response.data;
    },
    enabled: !!restaurantId,
  });

  // ── Mutations ──

  const createRecipeMutation = useMutation({
    mutationFn: (data: { menu_item_id: string; restaurant_id: string }) =>
      ApiService.createRecipe(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes', restaurantId] });
      setShowCreateModal(false);
      setSelectedMenuItemId('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: any) => {
      Alert.alert(t('common.error'), error?.response?.data?.message || t('common.error'));
    },
  });

  const addIngredientMutation = useMutation({
    mutationFn: (data: { recipeId: string; ingredient_id: string; quantity: number }) =>
      ApiService.addRecipeIngredient(data.recipeId, {
        ingredient_id: data.ingredient_id,
        quantity: data.quantity,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes', restaurantId] });
      setShowAddIngredientModal(false);
      setSelectedIngredientId('');
      setIngredientQuantity('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: any) => {
      Alert.alert(t('common.error'), error?.response?.data?.message || t('common.error'));
    },
  });

  const removeIngredientMutation = useMutation({
    mutationFn: (data: { recipeId: string; ingredientId: string }) =>
      ApiService.removeRecipeIngredient(data.recipeId, data.ingredientId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes', restaurantId] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const calculateCostMutation = useMutation({
    mutationFn: (recipeId: string) => ApiService.calculateRecipeCost(recipeId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['recipes', restaurantId] });
      if (selectedRecipe) {
        setSelectedRecipe({
          ...selectedRecipe,
          calculated_cost: data.cost,
          calculated_margin_pct: data.margin_pct,
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  // ── Helpers ──

  const recipes: RecipeItem[] = recipesQuery.data || [];
  const ingredients: IngredientItem[] = ingredientsQuery.data || [];
  const menuItems: MenuItem[] = menuItemsQuery.data || [];

  // Menu items that don't have a recipe yet
  const availableMenuItems = useMemo(() => {
    const recipeMenuIds = new Set(recipes.map((r) => r.menu_item_id));
    return menuItems.filter((mi) => !recipeMenuIds.has(mi.id));
  }, [recipes, menuItems]);

  // Ingredients not yet in the selected recipe
  const availableIngredients = useMemo(() => {
    if (!selectedRecipe) return ingredients;
    const usedIds = new Set(selectedRecipe.ingredients?.map((ri) => ri.ingredient_id) || []);
    return ingredients.filter((i) => !usedIds.has(i.id));
  }, [selectedRecipe, ingredients]);

  const filteredRecipes = useMemo(() => {
    if (!searchQuery) return recipes;
    const q = searchQuery.toLowerCase();
    return recipes.filter((r) => r.menu_item_name.toLowerCase().includes(q));
  }, [recipes, searchQuery]);

  const getMarginColor = (margin: number | null) => {
    if (margin === null) return colors.muted;
    if (margin < 25) return colors.destructive;
    if (margin < 35) return colors.warning;
    return colors.success;
  };

  const handleRemoveIngredient = (recipeId: string, ingredientId: string, name: string) => {
    Alert.alert(
      t('financial.cogs.remove_ingredient'),
      `${name}?`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          style: 'destructive',
          onPress: () => removeIngredientMutation.mutate({ recipeId, ingredientId }),
        },
      ],
    );
  };

  const onRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['recipes', restaurantId] });
    queryClient.invalidateQueries({ queryKey: ['ingredients', restaurantId] });
  }, [queryClient, restaurantId]);

  // ── Recipe Detail View ──

  if (selectedRecipe) {
    const margin = selectedRecipe.calculated_margin_pct;
    const marginColor = getMarginColor(margin);

    return (
      <View
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Header */}
          <View style={styles.detailHeader}>
            <IconButton
              icon="arrow-left"
              onPress={() => setSelectedRecipe(null)}
              iconColor={colors.foreground}
              accessibilityLabel="Back to recipes"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            />
            <Text style={[styles.detailTitle, { color: colors.foreground }]}>
              {selectedRecipe.menu_item_name}
            </Text>
          </View>

          {/* Cost & Margin Cards */}
          <View style={styles.statsRow}>
            <Card style={[styles.statCard, { backgroundColor: colors.card }]}>
              <Text style={[styles.statLabel, { color: colors.foregroundSecondary }]}>
                {t('financial.cogs.sale_price')}
              </Text>
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {formatCurrency(selectedRecipe.sale_price, locale)}
              </Text>
            </Card>
            <Card style={[styles.statCard, { backgroundColor: colors.card }]}>
              <Text style={[styles.statLabel, { color: colors.foregroundSecondary }]}>
                {t('financial.cogs.total_cost')}
              </Text>
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {selectedRecipe.calculated_cost !== null
                  ? formatCurrency(selectedRecipe.calculated_cost, locale)
                  : '--'}
              </Text>
            </Card>
            <Card style={[styles.statCard, { backgroundColor: colors.card }]}>
              <Text style={[styles.statLabel, { color: colors.foregroundSecondary }]}>
                {t('financial.cogs.margin')}
              </Text>
              <Text style={[styles.statValue, { color: marginColor }]}>
                {margin !== null ? `${margin.toFixed(1)}%` : '--'}
              </Text>
            </Card>
          </View>

          {/* Margin Alert */}
          {margin !== null && margin < 25 && (
            <View style={[styles.alertBanner, { backgroundColor: colors.destructive + '20' }]}>
              <Icon name="alert" size={20} color={colors.destructive} />
              <Text style={[styles.alertText, { color: colors.destructive }]}>
                {t('financial.cogs.margin_alert', { threshold: '25' })}
              </Text>
            </View>
          )}

          {/* Ingredients List */}
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            {t('financial.cogs.ingredients')} ({selectedRecipe.ingredients?.length || 0})
          </Text>

          {(selectedRecipe.ingredients || []).map((ri) => (
            <View key={ri.id} style={[styles.ingredientRow, { borderBottomColor: colors.border }]}>
              <View style={styles.ingredientInfo}>
                <Text style={[styles.ingredientName, { color: colors.foreground }]}>
                  {ri.ingredient_name}
                </Text>
                <Text style={[styles.ingredientQty, { color: colors.foregroundSecondary }]}>
                  {ri.quantity} {ri.unit}
                </Text>
              </View>
              <IconButton
                icon="delete-outline"
                size={20}
                iconColor={colors.destructive}
                onPress={() =>
                  handleRemoveIngredient(selectedRecipe.id, ri.ingredient_id, ri.ingredient_name)
                }
                accessibilityLabel={`Remove ${ri.ingredient_name}`}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              />
            </View>
          ))}

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <Button
              mode="outlined"
              icon="plus"
              onPress={() => setShowAddIngredientModal(true)}
              style={styles.actionButton}
              textColor={colors.primary}
            >
              {t('financial.cogs.add_ingredient')}
            </Button>
            <Button
              mode="contained"
              icon="calculator"
              onPress={() => calculateCostMutation.mutate(selectedRecipe.id)}
              loading={calculateCostMutation.isPending}
              style={styles.actionButton}
              buttonColor={colors.primary}
            >
              {t('financial.cogs.calculate_cost')}
            </Button>
          </View>
        </ScrollView>

        {/* Add Ingredient Modal */}
        <Portal>
          <Modal
            visible={showAddIngredientModal}
            onDismiss={() => setShowAddIngredientModal(false)}
            contentContainerStyle={[styles.modal, { backgroundColor: colors.card }]}
          >
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {t('financial.cogs.add_ingredient')}
            </Text>

            <Text style={[styles.fieldLabel, { color: colors.foregroundSecondary }]}>
              {t('financial.cogs.ingredients')}
            </Text>
            <ScrollView style={styles.chipContainer} horizontal showsHorizontalScrollIndicator={false}>
              {availableIngredients.map((ing) => (
                <Chip
                  key={ing.id}
                  selected={selectedIngredientId === ing.id}
                  onPress={() => setSelectedIngredientId(ing.id)}
                  style={styles.chip}
                  selectedColor={colors.primary}
                >
                  {ing.name} ({ing.unit})
                </Chip>
              ))}
            </ScrollView>

            <TextInput
              label={t('financial.cogs.quantity')}
              value={ingredientQuantity}
              onChangeText={setIngredientQuantity}
              keyboardType="decimal-pad"
              mode="outlined"
              style={styles.input}
            />

            <View style={styles.modalActions}>
              <Button onPress={() => setShowAddIngredientModal(false)} textColor={colors.foregroundSecondary}>
                {t('common.cancel')}
              </Button>
              <Button
                mode="contained"
                disabled={!selectedIngredientId || !ingredientQuantity}
                loading={addIngredientMutation.isPending}
                onPress={() => {
                  const qty = parseFloat(ingredientQuantity);
                  const selectedIng = availableIngredients.find((i) => i.id === selectedIngredientId);
                  const result = validateForm(recipeIngredientSchema, {
                    ingredientId: selectedIngredientId,
                    quantity: isNaN(qty) ? 0 : qty,
                    unit: selectedIng?.unit || '',
                  });
                  if (!result.success) {
                    Alert.alert(t('common.error'), Object.values(result.errors)[0]);
                    return;
                  }
                  addIngredientMutation.mutate({
                    recipeId: selectedRecipe.id,
                    ingredient_id: selectedIngredientId,
                    quantity: qty,
                  });
                }}
                buttonColor={colors.primary}
              >
                {t('common.add')}
              </Button>
            </View>
          </Modal>
        </Portal>
      </View>
    );
  }

  // ── Recipe List View ──

  if (recipesQuery.isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.foregroundSecondary }]}>
          {t('common.loading')}
        </Text>
      </View>
    );
  }

  if (recipesQuery.isError) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Icon name="alert-circle-outline" size={48} color={colors.destructive} />
        <Text style={[styles.errorText, { color: colors.destructive }]}>{t('common.error')}</Text>
        <Button onPress={onRefresh} textColor={colors.primary}>{t('common.retry')}</Button>
      </View>
    );
  }

  return (
    <ScreenContainer hasKeyboard>
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Searchbar
        placeholder={t('common.search')}
        value={searchQuery}
        onChangeText={setSearchQuery}
        style={[styles.searchBar, { backgroundColor: colors.card }]}
      />

      <FlatList
        data={filteredRecipes}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={recipesQuery.isFetching}
            onRefresh={onRefresh}
            colors={[colors.primary]}
          />
        }
        contentContainerStyle={styles.listContent}
        getItemLayout={(_, index) => ({
          length: 132,
          offset: 132 * index,
          index,
        })}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Icon name="book-open-variant" size={48} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.foregroundSecondary }]}>
              {t('financial.cogs.no_recipe')}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const margin = item.calculated_margin_pct;
          const marginColor = getMarginColor(margin);

          return (
            <Card
              style={[styles.recipeCard, { backgroundColor: colors.card }]}
              onPress={() => setSelectedRecipe(item)}
            >
              <View style={styles.recipeHeader}>
                <Text style={[styles.recipeName, { color: colors.foreground }]}>
                  {item.menu_item_name}
                </Text>
                <Chip
                  style={{ backgroundColor: marginColor + '20' }}
                  textStyle={{ color: marginColor, fontSize: 12 }}
                >
                  {margin !== null ? `${margin.toFixed(1)}%` : t('financial.cogs.no_cost')}
                </Chip>
              </View>
              <Divider style={{ marginVertical: 8 }} />
              <View style={styles.recipeStats}>
                <View style={styles.recipeStat}>
                  <Text style={[styles.recipeStatLabel, { color: colors.foregroundSecondary }]}>
                    {t('financial.cogs.sale_price')}
                  </Text>
                  <Text style={[styles.recipeStatValue, { color: colors.foreground }]}>
                    {formatCurrency(item.sale_price, locale)}
                  </Text>
                </View>
                <View style={styles.recipeStat}>
                  <Text style={[styles.recipeStatLabel, { color: colors.foregroundSecondary }]}>
                    {t('financial.cogs.cost_price')}
                  </Text>
                  <Text style={[styles.recipeStatValue, { color: colors.foreground }]}>
                    {item.calculated_cost !== null
                      ? formatCurrency(item.calculated_cost, locale)
                      : '--'}
                  </Text>
                </View>
                <View style={styles.recipeStat}>
                  <Text style={[styles.recipeStatLabel, { color: colors.foregroundSecondary }]}>
                    {t('financial.cogs.ingredients')}
                  </Text>
                  <Text style={[styles.recipeStatValue, { color: colors.foreground }]}>
                    {item.ingredient_count}
                  </Text>
                </View>
              </View>
            </Card>
          );
        }}
      />

      {/* Create Recipe FAB */}
      <FAB
        icon="plus"
        onPress={() => setShowCreateModal(true)}
        style={[styles.fab, { backgroundColor: colors.primary }]}
        color={colors.background}
      />

      {/* Create Recipe Modal */}
      <Portal>
        <Modal
          visible={showCreateModal}
          onDismiss={() => setShowCreateModal(false)}
          contentContainerStyle={[styles.modal, { backgroundColor: colors.card }]}
        >
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>
            {t('financial.cogs.create_recipe')}
          </Text>

          <Text style={[styles.fieldLabel, { color: colors.foregroundSecondary }]}>
            {t('financial.cogs.select_menu_item')}
          </Text>
          <ScrollView style={styles.menuItemList} nestedScrollEnabled>
            {availableMenuItems.map((mi) => (
              <Chip
                key={mi.id}
                selected={selectedMenuItemId === mi.id}
                onPress={() => setSelectedMenuItemId(mi.id)}
                style={styles.menuItemChip}
                selectedColor={colors.primary}
              >
                {mi.name} - {formatCurrency(Number(mi.price), locale)}
              </Chip>
            ))}
            {availableMenuItems.length === 0 && (
              <Text style={[styles.noItems, { color: colors.foregroundSecondary }]}>
                {t('common.noResults')}
              </Text>
            )}
          </ScrollView>

          <View style={styles.modalActions}>
            <Button onPress={() => setShowCreateModal(false)} textColor={colors.foregroundSecondary}>
              {t('common.cancel')}
            </Button>
            <Button
              mode="contained"
              disabled={!selectedMenuItemId}
              loading={createRecipeMutation.isPending}
              onPress={() => {
                createRecipeMutation.mutate({
                  menu_item_id: selectedMenuItemId,
                  restaurant_id: restaurantId,
                });
              }}
              buttonColor={colors.primary}
            >
              {t('common.confirm')}
            </Button>
          </View>
        </Modal>
      </Portal>
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
  listContent: {
    padding: 16,
    paddingBottom: 80,
  },
  searchBar: {
    margin: 16,
    marginBottom: 0,
    elevation: 0,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
  },
  errorText: {
    fontSize: 16,
    marginTop: 8,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
  },
  recipeCard: {
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
  },
  recipeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recipeName: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  recipeStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  recipeStat: {
    alignItems: 'center',
  },
  recipeStatLabel: {
    fontSize: 12,
    marginBottom: 2,
  },
  recipeStatValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    borderRadius: 28,
  },
  modal: {
    margin: 20,
    padding: 20,
    borderRadius: 16,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 16,
  },
  fieldLabel: {
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    marginBottom: 12,
  },
  chipContainer: {
    maxHeight: 48,
    marginBottom: 12,
  },
  chip: {
    marginRight: 8,
  },
  menuItemList: {
    maxHeight: 200,
    marginBottom: 8,
  },
  menuItemChip: {
    marginBottom: 6,
  },
  noItems: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
  },
  // Detail view
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: '700',
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  alertText: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  ingredientInfo: {
    flex: 1,
  },
  ingredientName: {
    fontSize: 14,
    fontWeight: '500',
  },
  ingredientQty: {
    fontSize: 12,
    marginTop: 2,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 24,
  },
  actionButton: {
    flex: 1,
  },
});
