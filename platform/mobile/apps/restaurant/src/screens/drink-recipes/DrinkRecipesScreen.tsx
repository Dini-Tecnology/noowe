/**
 * DrinkRecipesScreen - Standalone drink recipes library
 *
 * Provides searchable, filterable recipe list with detail view.
 * Referenced from BarmanKDSScreen quick access cards and navigation drawer.
 *
 * Features:
 * - Search with 300ms debounce
 * - Category filter chips
 * - Pull-to-refresh
 * - 5-minute local cache
 * - Recipe cards: thumbnail, name, prep time, price
 * - Tap to navigate to RecipeDetailScreen
 *
 * @module restaurant/screens/drink-recipes
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Image,
  ScrollView as HScrollView,
} from 'react-native';
import { Text, Searchbar, Chip } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import ApiService from '@/shared/services/api';
import { useColors } from '@/shared/theme';
import { t } from '@/shared/i18n';

// ============================================
// TYPES
// ============================================

interface Ingredient {
  name: string;
  amount: string;
  unit: string;
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
  ingredients: Ingredient[];
  steps: string[];
  tags: string[];
  price: number;
  image_url: string | null;
  is_active: boolean;
}

// ============================================
// CONSTANTS
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

const DEBOUNCE_MS = 300;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================
// HOOKS
// ============================================

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function DrinkRecipesScreen({ navigation }: { navigation: any }) {
  const colors = useColors();

  const [recipes, setRecipes] = useState<DrinkRecipeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [lastFetch, setLastFetch] = useState(0);

  const debouncedQuery = useDebounce(searchQuery, DEBOUNCE_MS);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.backgroundSecondary,
        },
        searchContainer: {
          padding: 12,
          backgroundColor: colors.background,
        },
        categoryChips: {
          paddingHorizontal: 12,
          paddingBottom: 10,
          backgroundColor: colors.background,
        },
        categoryChip: {
          marginRight: 8,
        },
        listContent: {
          padding: 12,
        },
        recipeCard: {
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
          width: 48,
          height: 48,
          borderRadius: 8,
          backgroundColor: colors.backgroundTertiary,
        },
        recipeImagePlaceholder: {
          width: 48,
          height: 48,
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
          marginBottom: 2,
        },
        recipeMetaRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
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
        recipePrice: {
          color: colors.success,
          fontWeight: '600',
        },
        selectedCard: {
          borderWidth: 2,
          borderColor: colors.primary,
          backgroundColor: colors.backgroundSecondary,
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
      }),
    [colors],
  );

  // ============================================
  // DATA LOADING
  // ============================================

  const loadRecipes = useCallback(
    async (force = false) => {
      const now = Date.now();
      if (!force && now - lastFetch < CACHE_TTL_MS && recipes.length > 0) {
        return;
      }
      try {
        const data = await ApiService.get('/recipes').then(r => r.data);
        setRecipes(data?.items || data || []);
        setLastFetch(Date.now());
      } catch (error) {
        console.error('Failed to load recipes:', error);
      } finally {
        setLoading(false);
      }
    },
    [lastFetch, recipes.length],
  );

  useEffect(() => {
    loadRecipes();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRecipes(true);
    setRefreshing(false);
  };

  // ============================================
  // FILTERING
  // ============================================

  const filteredRecipes = useMemo(() => {
    let filtered = recipes;
    if (selectedCategory !== 'All') {
      filtered = filtered.filter((r) => r.category === selectedCategory);
    }
    if (debouncedQuery.trim()) {
      const query = debouncedQuery.toLowerCase();
      filtered = filtered.filter((r) => r.name.toLowerCase().includes(query));
    }
    return filtered;
  }, [recipes, selectedCategory, debouncedQuery]);

  // ============================================
  // RENDER
  // ============================================

  const renderRecipeCard = ({ item }: { item: DrinkRecipeItem }) => (
    <TouchableOpacity
      style={styles.recipeCard}
      onPress={() => navigation.navigate('RecipeDetail', { recipe: item })}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${item.preparation_time_minutes} min`}
    >
      <View style={styles.recipeCardContent}>
        {item.image_url ? (
          <Image
            source={{ uri: item.image_url }}
            style={styles.recipeImage}
            resizeMode="cover"
            accessibilityLabel={item.name}
          />
        ) : (
          <View style={styles.recipeImagePlaceholder}>
            <Icon name="glass-cocktail" size={22} color={colors.foregroundMuted} />
          </View>
        )}
        <View style={styles.recipeInfo}>
          <Text variant="titleMedium" style={styles.recipeName}>
            {item.name}
          </Text>
          <View style={styles.recipeMetaRow}>
            <View style={styles.recipeMeta}>
              <Icon name="clock-outline" size={14} color={colors.mutedForeground} />
              <Text variant="bodySmall" style={styles.recipeMetaText}>
                {t('recipes.prepTime', { min: String(item.preparation_time_minutes) })}
              </Text>
            </View>
            {item.price > 0 && (
              <Text variant="bodySmall" style={styles.recipePrice}>
                {t('recipes.price', { price: item.price.toFixed(2) })}
              </Text>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <ScreenContainer>
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder={t('recipes.search')}
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={{ backgroundColor: colors.card }}
          accessibilityLabel={t('recipes.search')}
        />
      </View>

      {/* Category Filter Chips */}
      <HScrollView
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
            accessibilityLabel={cat === 'All' ? t('common.all') : cat}
            accessibilityState={{ selected: selectedCategory === cat }}
          >
            {cat === 'All' ? t('common.all') : cat}
          </Chip>
        ))}
      </HScrollView>

      {/* Recipe List */}
      <FlatList
        data={filteredRecipes}
        renderItem={renderRecipeCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        getItemLayout={(_, index) => ({
          length: 100,
          offset: 100 * index,
          index,
        })}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
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
    </View>
    </ScreenContainer>
  );
}
