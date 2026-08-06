import React, { useCallback, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { useCart } from '@/shared/contexts/CartContext';
import { useVisitSession } from '../../contexts/VisitSessionContext';
import customerBackend, { type CustomerMenuItem } from '../../services/customer-backend';
import { money, rootNavigate, StateView } from './shared';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=200&q=80';

export default function MenuScreen({ route, navigation }: any) {
  const colors = useColors();
  const visit = useVisitSession();
  const cart = useCart();
  const restaurantId = route?.params?.restaurantId ?? visit.session?.restaurantId;
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const restaurant = useQuery({
    queryKey: ['restaurant', restaurantId],
    queryFn: () => customerBackend.getRestaurant(restaurantId!),
    enabled: !!restaurantId,
  });
  const menu = useQuery({
    queryKey: ['menu', restaurantId],
    queryFn: () => customerBackend.getMenu(restaurantId!),
    enabled: !!restaurantId,
  });

  const categoryTabs = useMemo(
    () => [{ id: 'all', name: 'Todos' }, ...(menu.data?.categories ?? []).map((c) => ({ id: c.id, name: c.name }))],
    [menu.data],
  );
  const items = menu.data?.items ?? [];
  const filteredItems = useMemo(
    () => (selectedCategory === 'all' ? items : items.filter((item) => item.categoryId === selectedCategory)),
    [items, selectedCategory],
  );

  const add = useCallback(
    (item: CustomerMenuItem) => {
      cart.setRestaurant(restaurantId, restaurant.data?.name ?? 'Restaurante');
      cart.addItem({ menu_item_id: item.id, name: item.name, price: item.price, quantity: 1, image_url: item.imageUrl ?? undefined });
    },
    [cart, restaurant.data, restaurantId],
  );

  const callWaiter = useCallback(() => navigation.navigate('CallWaiter'), [navigation]);
  const openCart = useCallback(() => rootNavigate(navigation, 'Cart'), [navigation]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
        headerBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.backgroundTertiary, alignItems: 'center', justifyContent: 'center' },
        headerTitle: { fontSize: 18, fontWeight: '700', color: colors.foreground, flex: 1, textAlign: 'center' },
        cartBadge: {
          minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.primary,
          alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, position: 'absolute', top: -2, right: -2,
        },
        cartBadgeText: { color: colors.primaryForeground, fontSize: 10, fontWeight: '700' },
        quickActions: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 16 },
        quickBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 14, backgroundColor: colors.backgroundTertiary },
        quickBtnText: { fontSize: 13, fontWeight: '600', color: colors.foreground },
        categoryScroll: { marginBottom: 12 },
        categoryRow: { paddingHorizontal: 16, gap: 8 },
        categoryChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24, backgroundColor: colors.backgroundTertiary },
        categoryChipActive: { backgroundColor: colors.primary },
        categoryText: { fontSize: 14, fontWeight: '600', color: colors.foregroundSecondary },
        categoryTextActive: { color: colors.primaryForeground },
        listContent: { paddingHorizontal: 16, paddingBottom: 32, gap: 14 },
        menuItem: { flexDirection: 'row', gap: 14 },
        menuImage: { width: 88, height: 88, borderRadius: 14, backgroundColor: colors.backgroundTertiary },
        menuContent: { flex: 1, justifyContent: 'center' },
        menuName: { fontSize: 16, fontWeight: '700', color: colors.foreground, marginBottom: 4 },
        menuDescription: { fontSize: 13, color: colors.foregroundSecondary, lineHeight: 18, marginBottom: 8 },
        menuFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        menuPrice: { fontSize: 16, fontWeight: '700', color: colors.foreground },
        addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
        addBtnText: { color: colors.primaryForeground, fontSize: 13, fontWeight: '700' },
      }),
    [colors],
  );

  if (!restaurantId) {
    return (
      <ScreenContainer edges={['top']}>
        <StateView empty="Escolha um restaurante na tela inicial." emptyIcon="restaurant-outline" />
        <TouchableOpacity style={{ alignSelf: 'center' }} onPress={() => navigation.navigate('Home')} accessibilityRole="button">
          <Text style={{ color: colors.primary, fontWeight: '700' }}>Ir para início</Text>
        </TouchableOpacity>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={['top']}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
            <Ionicons name="arrow-back" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{restaurant.data?.name ?? 'Cardápio'}</Text>
          <TouchableOpacity style={styles.headerBtn} onPress={openCart} accessibilityRole="button" accessibilityLabel="Ver comanda">
            <Ionicons name="receipt-outline" size={22} color={colors.foreground} />
            {cart.itemCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cart.itemCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.quickBtn} onPress={callWaiter} activeOpacity={0.85} accessibilityRole="button">
            <Ionicons name="hand-left-outline" size={18} color={colors.primary} />
            <Text style={styles.quickBtnText}>Chamar Garçom</Text>
          </TouchableOpacity>
        </View>

        {categoryTabs.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={styles.categoryRow}>
            {categoryTabs.map((cat) => {
              const active = selectedCategory === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.categoryChip, active && styles.categoryChipActive]}
                  onPress={() => setSelectedCategory(cat.id)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.categoryText, active && styles.categoryTextActive]}>{cat.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        <StateView
          loading={menu.isLoading}
          error={menu.error}
          onRetry={() => menu.refetch()}
          empty={!menu.isLoading && filteredItems.length === 0 ? 'Cardápio sem itens disponíveis.' : undefined}
          emptyIcon="fast-food-outline"
        />

        <View style={styles.listContent}>
          {filteredItems.map((item) => (
            <View key={item.id} style={styles.menuItem}>
              <Image source={{ uri: item.imageUrl || FALLBACK_IMAGE }} style={styles.menuImage} resizeMode="cover" />
              <View style={styles.menuContent}>
                <Text style={styles.menuName} numberOfLines={1}>{item.name}</Text>
                {item.description ? <Text style={styles.menuDescription} numberOfLines={2}>{item.description}</Text> : null}
                <View style={styles.menuFooter}>
                  <Text style={styles.menuPrice}>{money(item.price)}</Text>
                  <TouchableOpacity style={styles.addBtn} onPress={() => add(item)} accessibilityRole="button" accessibilityLabel={`Adicionar ${item.name}`}>
                    <Ionicons name="add" size={16} color={colors.primaryForeground} />
                    <Text style={styles.addBtnText}>Adicionar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
