import React, { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { useCart } from '@/shared/contexts/CartContext';

const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

interface FloatingCartBarProps {
  /** Distance from the screen's bottom edge. Defaults to the safe-area inset
   * plus a small gap — pass the tab bar's height on screens rendered behind it. */
  bottomOffset?: number;
}

/**
 * Reminds the customer a comanda is still open wherever they wander after
 * adding items — leaving the restaurant profile or the menu must never let
 * the cart go silently forgotten.
 */
export function FloatingCartBar({ bottomOffset }: FloatingCartBarProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const cart = useCart();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: bottomOffset ?? insets.bottom + 12,
        },
        bar: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: 18,
          backgroundColor: colors.primary,
          shadowColor: colors.shadowColor,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 10,
          elevation: 6,
        },
        iconWrap: {
          width: 34, height: 34, borderRadius: 17,
          backgroundColor: 'rgba(255,255,255,0.22)',
          alignItems: 'center', justifyContent: 'center',
        },
        textWrap: { flex: 1, minWidth: 0 },
        title: { fontSize: 14, fontWeight: '700', color: colors.primaryForeground },
        subtitle: { fontSize: 12, color: colors.primaryForeground, opacity: 0.85, marginTop: 1 },
      }),
    [colors, insets.bottom, bottomOffset],
  );

  if (cart.itemCount === 0) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <TouchableOpacity
        style={styles.bar}
        activeOpacity={0.9}
        onPress={() => navigation.navigate('Cart')}
        accessibilityRole="button"
        accessibilityLabel="Ver comanda"
      >
        <View style={styles.iconWrap}>
          <Ionicons name="receipt-outline" size={18} color={colors.primaryForeground} />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.title} numberOfLines={1}>
            {cart.itemCount} {cart.itemCount === 1 ? 'item' : 'itens'} · {money(cart.total)}
          </Text>
          {cart.restaurantName ? (
            <Text style={styles.subtitle} numberOfLines={1}>{cart.restaurantName}</Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.primaryForeground} />
      </TouchableOpacity>
    </View>
  );
}
