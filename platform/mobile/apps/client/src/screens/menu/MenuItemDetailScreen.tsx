import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Image,
  TouchableOpacity,
  Dimensions,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useRoute, useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { useRestaurantMenu } from '@okinawa/shared/hooks/useRestaurants';

const HERO_HEIGHT = Dimensions.get('window').width * 0.72;
const CARD_OVERLAP = 28;
const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80';

function formatPrice(value: number): string {
  return `R$ ${value.toFixed(0)}`;
}

export default function MenuItemDetailScreen() {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { itemId, restaurantId } = (route.params ?? {}) as { itemId: string; restaurantId?: string };
  const { data: menu, isLoading } = useRestaurantMenu(restaurantId ?? '');
  const item = useMemo(
    () => (menu?.items ?? []).find((i: any) => i.id === itemId),
    [menu, itemId],
  );

  const [quantity, setQuantity] = useState(1);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: {
          flex: 1,
          backgroundColor: colors.background,
        },
        heroWrap: {
          height: HERO_HEIGHT,
          backgroundColor: colors.backgroundTertiary,
        },
        heroImage: {
          width: '100%',
          height: '100%',
        },
        backBtn: {
          position: 'absolute',
          left: 16,
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 6,
          elevation: 3,
        },
        card: {
          flex: 1,
          marginTop: -CARD_OVERLAP,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          backgroundColor: colors.card,
          paddingHorizontal: 20,
          paddingTop: 24,
          paddingBottom: 16,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.06,
          shadowRadius: 12,
          elevation: 8,
        },
        titleRow: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 10,
        },
        title: {
          flex: 1,
          fontSize: 24,
          fontWeight: '800',
          color: colors.foreground,
          letterSpacing: -0.3,
        },
        popularTag: {
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: 20,
          backgroundColor: '#FFF0EA',
        },
        popularText: {
          fontSize: 12,
          fontWeight: '600',
          color: colors.primary,
        },
        description: {
          fontSize: 15,
          lineHeight: 22,
          color: colors.foregroundSecondary,
          marginBottom: 14,
        },
        tagsRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 12,
        },
        dietaryTag: {
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 20,
          backgroundColor: colors.backgroundTertiary,
        },
        dietaryText: {
          fontSize: 13,
          fontWeight: '500',
          color: colors.foregroundSecondary,
        },
        prepRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          marginBottom: 24,
        },
        prepText: {
          fontSize: 14,
          color: colors.foregroundMuted,
        },
        priceRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
        },
        price: {
          fontSize: 28,
          fontWeight: '800',
          color: colors.foreground,
          letterSpacing: -0.5,
        },
        qtyControl: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
        },
        qtyBtn: {
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
        },
        qtyBtnMinus: {
          backgroundColor: colors.card,
          borderWidth: 1.5,
          borderColor: colors.border,
        },
        qtyBtnPlus: {
          backgroundColor: colors.primary,
        },
        qtyValue: {
          fontSize: 18,
          fontWeight: '700',
          color: colors.foreground,
          minWidth: 24,
          textAlign: 'center',
        },
        cta: {
          paddingVertical: 16,
          borderRadius: 16,
          backgroundColor: colors.primary,
          alignItems: 'center',
        },
        ctaText: {
          fontSize: 16,
          fontWeight: '700',
          color: colors.primaryForeground,
        },
        fallback: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        },
        fallbackText: {
          fontSize: 16,
          color: colors.foregroundSecondary,
          marginBottom: 16,
        },
      }),
    [colors],
  );

  const totalPrice = useMemo(() => {
    if (!item) return 0;
    return item.price * quantity;
  }, [item, quantity]);

  const decrement = useCallback(() => {
    setQuantity((q) => Math.max(1, q - 1));
  }, []);

  const increment = useCallback(() => {
    setQuantity((q) => q + 1);
  }, []);

  const handleAdd = useCallback(() => {
    if (!item) return;
    Alert.alert(
      'Adicionado à comanda',
      `${quantity}x ${item.name} · ${formatPrice(totalPrice)}`,
      [{ text: 'OK', onPress: () => navigation.goBack() }],
    );
  }, [item, quantity, totalPrice, navigation]);

  if (isLoading) {
    return (
      <ScreenContainer edges={['top', 'bottom']}>
        <View style={styles.fallback}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (!item) {
    return (
      <ScreenContainer edges={['top', 'bottom']}>
        <View style={styles.fallback}>
          <Text style={styles.fallbackText}>Item não encontrado</Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>Voltar</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  const dietaryTags: string[] = Array.isArray(item.dietary_info) ? item.dietary_info : [];

  return (
    <ScreenContainer edges={['bottom']}>
      <View style={styles.screen}>
        <View style={styles.heroWrap}>
          <Image
            source={{ uri: item.image_url || FALLBACK_IMAGE }}
            style={styles.heroImage}
            resizeMode="cover"
            accessibilityLabel={`Foto de ${item.name}`}
          />
          <TouchableOpacity
            style={[styles.backBtn, { top: insets.top + 8 }]}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
          >
            <Ionicons name="arrow-back" size={22} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{item.name}</Text>
          </View>

          {item.description ? <Text style={styles.description}>{item.description}</Text> : null}

          {dietaryTags.length > 0 ? (
            <View style={styles.tagsRow}>
              {dietaryTags.map((tag) => (
                <View key={tag} style={styles.dietaryTag}>
                  <Text style={styles.dietaryText}>{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.prepRow}>
            <Ionicons name="time-outline" size={16} color={colors.foregroundMuted} />
            <Text style={styles.prepText}>Preparo: {item.estimated_prep_minutes} min</Text>
          </View>

          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatPrice(item.price)}</Text>
            <View style={styles.qtyControl}>
              <TouchableOpacity
                style={[styles.qtyBtn, styles.qtyBtnMinus]}
                onPress={decrement}
                disabled={quantity <= 1}
                accessibilityRole="button"
                accessibilityLabel="Diminuir quantidade"
              >
                <Ionicons
                  name="remove"
                  size={20}
                  color={quantity <= 1 ? colors.foregroundMuted : colors.foreground}
                />
              </TouchableOpacity>
              <Text style={styles.qtyValue}>{quantity}</Text>
              <TouchableOpacity
                style={[styles.qtyBtn, styles.qtyBtnPlus]}
                onPress={increment}
                accessibilityRole="button"
                accessibilityLabel="Aumentar quantidade"
              >
                <Ionicons name="add" size={22} color={colors.primaryForeground} />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={styles.cta}
            onPress={handleAdd}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Adicionar ${quantity} ${item.name}, ${formatPrice(totalPrice)}`}
          >
            <Text style={styles.ctaText}>
              Adicionar · {formatPrice(totalPrice)}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScreenContainer>
  );
}
