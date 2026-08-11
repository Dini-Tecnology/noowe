/**
 * RecipeDetailScreen - Full recipe technical sheet
 *
 * Displays complete drink recipe with:
 * - Large image, name, description
 * - Glass type and garnish as pills/chips
 * - Numbered ingredient list with amounts
 * - Sequential preparation steps
 * - Tags, serving temperature, base spirit
 *
 * Works as both a standalone screen and from BarmanStation tab 2.
 *
 * @module restaurant/screens/barman
 */

import React, { useMemo, useState } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  ScrollView,
  StyleSheet,
  Image,
  Dimensions,
} from 'react-native';
import { Text, Chip, Divider } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
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

interface DrinkRecipeDetail {
  id: string;
  name: string;
  category: string;
  description: string | null;
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
}

// ============================================
// GLASS TYPE ICONS (MaterialCommunityIcons)
// ============================================

const GLASS_ICONS: Record<string, string> = {
  Highball: 'glass-pint-outline',
  Rocks: 'glass-tulip',
  Coupe: 'glass-cocktail',
  Martini: 'glass-cocktail',
  Collins: 'glass-pint-outline',
  'Copper Mug': 'glass-mug-variant',
  'Taca Balloon': 'glass-wine',
  'Copo Old Fashioned': 'glass-tulip',
  'Taca Martini': 'glass-cocktail',
  'Caneca de Cobre': 'glass-mug-variant',
};

const getGlassIcon = (glassType: string): string => {
  return GLASS_ICONS[glassType] || 'glass-cocktail';
};

// ============================================
// MAIN COMPONENT
// ============================================

export default function RecipeDetailScreen({ route }: { route: any }) {
  const colors = useColors();
  const recipe: DrinkRecipeDetail = route.params?.recipe;
  const [imageError, setImageError] = useState(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        scrollContent: {
          paddingBottom: 40,
        },
        // Image section
        imageContainer: {
          width: '100%',
          height: 220,
          backgroundColor: colors.backgroundTertiary,
          alignItems: 'center',
          justifyContent: 'center',
        },
        image: {
          width: '100%',
          height: 220,
        },
        imagePlaceholder: {
          alignItems: 'center',
          justifyContent: 'center',
        },
        // Header section
        headerSection: {
          padding: 20,
        },
        recipeName: {
          fontWeight: 'bold',
          color: colors.foreground,
          marginBottom: 8,
        },
        description: {
          color: colors.foregroundSecondary,
          lineHeight: 22,
          marginBottom: 12,
        },
        // Chips row
        chipsRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 16,
        },
        infoChip: {
          backgroundColor: colors.backgroundTertiary,
        },
        // Info grid
        infoGrid: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16,
        },
        infoItem: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: colors.backgroundSecondary,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 8,
        },
        infoLabel: {
          color: colors.mutedForeground,
        },
        infoValue: {
          fontWeight: '600',
          color: colors.foreground,
        },
        // Section
        sectionContainer: {
          paddingHorizontal: 20,
          paddingVertical: 12,
        },
        sectionTitle: {
          fontWeight: 'bold',
          color: colors.foreground,
          marginBottom: 12,
        },
        divider: {
          marginHorizontal: 20,
          backgroundColor: colors.border,
        },
        // Ingredients
        ingredientRow: {
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: 10,
          gap: 12,
        },
        ingredientIndex: {
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
        },
        ingredientIndexText: {
          color: colors.primaryForeground,
          fontWeight: 'bold',
        },
        ingredientContent: {
          flex: 1,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        ingredientName: {
          color: colors.foreground,
          flex: 1,
        },
        ingredientAmount: {
          color: colors.primary,
          fontWeight: '600',
        },
        // Steps
        stepRow: {
          flexDirection: 'row',
          marginBottom: 14,
          gap: 12,
        },
        stepIndex: {
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: colors.backgroundTertiary,
          borderWidth: 2,
          borderColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
        },
        stepIndexText: {
          color: colors.primary,
          fontWeight: 'bold',
        },
        stepText: {
          flex: 1,
          color: colors.foreground,
          lineHeight: 22,
          paddingTop: 3,
        },
        // Tags
        tagsContainer: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
        },
        tagChip: {
          backgroundColor: colors.backgroundSecondary,
        },
        // Difficulty
        difficultyBadge: {
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 12,
        },
        difficultyText: {
          fontWeight: '600',
        },
      }),
    [colors],
  );

  if (!recipe) {
    return (
      <ScreenContainer>
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <Icon name="alert-circle-outline" size={48} color={colors.foregroundMuted} />
        <Text variant="bodyLarge" style={{ color: colors.mutedForeground, marginTop: 12 }}>
          {t('recipes.empty')}
        </Text>
      </View>
      </ScreenContainer>
    );
  }

  const getDifficultyColor = (difficulty: string) => {
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
  };

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

  const diffColors = getDifficultyColor(recipe.difficulty);

  return (
    <ScreenContainer>
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Image */}
        <View style={styles.imageContainer}>
          {recipe.image_url && !imageError ? (
            <Image
              source={{ uri: recipe.image_url }}
              style={styles.image}
              resizeMode="cover"
              onError={() => setImageError(true)}
              accessibilityLabel={`Photo of ${recipe.name}`}
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Icon name="glass-cocktail" size={64} color={colors.foregroundMuted} />
            </View>
          )}
        </View>

        {/* Header */}
        <View style={styles.headerSection}>
          <Text variant="headlineMedium" style={styles.recipeName}>
            {recipe.name}
          </Text>

          {recipe.description && (
            <Text variant="bodyMedium" style={styles.description}>
              {recipe.description}
            </Text>
          )}

          {/* Info Chips */}
          <View style={styles.chipsRow}>
            {/* Glass Type */}
            <Chip
              icon={() => (
                <Icon name={getGlassIcon(recipe.glass_type)} size={16} color={colors.primary} />
              )}
              style={styles.infoChip}
              compact
              accessibilityLabel={`Glass type: ${recipe.glass_type}`}
            >
              {recipe.glass_type}
            </Chip>

            {/* Garnish */}
            {recipe.garnish && (
              <Chip
                icon={() => <Icon name="leaf" size={16} color={colors.success} />}
                style={styles.infoChip}
                compact
                accessibilityLabel={`Garnish: ${recipe.garnish}`}
              >
                {recipe.garnish}
              </Chip>
            )}

            {/* Difficulty */}
            <View style={[styles.difficultyBadge, { backgroundColor: diffColors.bg }]}>
              <Text
                variant="labelMedium"
                style={[styles.difficultyText, { color: diffColors.text }]}
              >
                {getDifficultyLabel(recipe.difficulty)}
              </Text>
            </View>

            {/* Category */}
            <Chip mode="outlined" compact accessibilityLabel={`Category: ${recipe.category}`}>
              {recipe.category}
            </Chip>
          </View>

          {/* Info Grid */}
          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Icon name="clock-outline" size={18} color={colors.info} />
              <View>
                <Text variant="labelSmall" style={styles.infoLabel}>
                  {t('recipes.detail.prepTime')}
                </Text>
                <Text variant="bodyMedium" style={styles.infoValue}>
                  {recipe.preparation_time_minutes} min
                </Text>
              </View>
            </View>

            <View style={styles.infoItem}>
              <Icon name="thermometer" size={18} color={colors.info} />
              <View>
                <Text variant="labelSmall" style={styles.infoLabel}>
                  {t('recipes.detail.servingTemp')}
                </Text>
                <Text variant="bodyMedium" style={styles.infoValue}>
                  {recipe.serving_temp}
                </Text>
              </View>
            </View>

            {recipe.base_spirit && (
              <View style={styles.infoItem}>
                <Icon name="bottle-wine" size={18} color={colors.primary} />
                <View>
                  <Text variant="labelSmall" style={styles.infoLabel}>
                    {t('recipes.baseSpirit')}
                  </Text>
                  <Text variant="bodyMedium" style={styles.infoValue}>
                    {recipe.base_spirit}
                  </Text>
                </View>
              </View>
            )}

            {recipe.price > 0 && (
              <View style={styles.infoItem}>
                <Icon name="currency-brl" size={18} color={colors.success} />
                <View>
                  <Text variant="labelSmall" style={styles.infoLabel}>
                    {t('recipes.detail.price')}
                  </Text>
                  <Text variant="bodyMedium" style={styles.infoValue}>
                    R$ {recipe.price.toFixed(2)}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>

        <Divider style={styles.divider} />

        {/* Ingredients */}
        <View style={styles.sectionContainer}>
          <Text variant="titleLarge" style={styles.sectionTitle}>
            {t('recipes.detail.ingredients')}
          </Text>
          {recipe.ingredients.map((ingredient, index) => (
            <View key={index} style={styles.ingredientRow}>
              <View style={styles.ingredientIndex}>
                <Text variant="labelSmall" style={styles.ingredientIndexText}>
                  {index + 1}
                </Text>
              </View>
              <View style={styles.ingredientContent}>
                <Text variant="bodyMedium" style={styles.ingredientName}>
                  {ingredient.name}
                </Text>
                <Text variant="bodyMedium" style={styles.ingredientAmount}>
                  {ingredient.amount} {ingredient.unit}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <Divider style={styles.divider} />

        {/* Steps */}
        <View style={styles.sectionContainer}>
          <Text variant="titleLarge" style={styles.sectionTitle}>
            {t('recipes.detail.steps')}
          </Text>
          {recipe.steps.map((step, index) => (
            <View key={index} style={styles.stepRow}>
              <View style={styles.stepIndex}>
                <Text variant="labelSmall" style={styles.stepIndexText}>
                  {index + 1}
                </Text>
              </View>
              <Text variant="bodyMedium" style={styles.stepText}>
                {step}
              </Text>
            </View>
          ))}
        </View>

        {/* Tags */}
        {recipe.tags && recipe.tags.length > 0 && (
          <>
            <Divider style={styles.divider} />
            <View style={styles.sectionContainer}>
              <Text variant="titleLarge" style={styles.sectionTitle}>
                {t('recipes.tags')}
              </Text>
              <View style={styles.tagsContainer}>
                {recipe.tags.map((tag, index) => (
                  <Chip key={index} style={styles.tagChip} compact mode="outlined">
                    {tag}
                  </Chip>
                ))}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
    </ScreenContainer>
  );
}
