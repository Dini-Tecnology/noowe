import React, { useCallback, useMemo, useState } from 'react';
import { Image, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import Toast from 'react-native-toast-message';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { useCart } from '@/shared/contexts/CartContext';
import { useVisitSession } from '../../contexts/VisitSessionContext';
import { useServiceTypeFor } from '../../hooks/useServiceTypeFeatures';
import customerBackend, { type CustomerMenuItem, type TableDiner } from '../../services/customer-backend';
import { dietaryTags, formatPrepTime } from './home-restaurant-ui';
import { casualDiningConfigOf } from './casual-dining-ui';
import { money, rootNavigate, StateView, useQueryRefreshControl } from './shared';
import { FeatureUnavailableMessage } from '../../components/ServiceTypeAdapter';
import CasualDiningItemDetail from './CasualDiningItemDetail';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=200&q=80';

export default function MenuScreen({ route, navigation }: any) {
  const colors = useColors();
  const visit = useVisitSession();
  const cart = useCart();
  const restaurantId = route?.params?.restaurantId ?? visit.session?.restaurantId;
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [detailItem, setDetailItem] = useState<CustomerMenuItem | null>(null);
  const { features, capabilities, policies, status: serviceTypeStatus } = useServiceTypeFor(restaurantId);
  // Journey decisions read server capabilities, never the model name.
  const tableService = capabilities?.tableSession === true;
  const perPersonComanda = capabilities?.consumptionUnit === 'per_person';
  const tableWithGuests = capabilities?.consumptionUnit === 'table_with_guests';
  // Group ordering only applies at a table of this restaurant — a session open
  // somewhere else must not put another table's diners on this menu.
  const tableSessionId =
    visit.session?.restaurantId === restaurantId ? visit.session?.tableSessionId ?? null : null;

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
  const diners = useQuery({
    queryKey: ['table-diners', tableSessionId],
    queryFn: () => customerBackend.listTableDiners(tableSessionId!),
    enabled: perPersonComanda && !!tableSessionId,
  });
  const refreshControl = useQueryRefreshControl(restaurantId ? [restaurant, menu] : []);
  const casualConfig = useMemo(() => casualDiningConfigOf(restaurant.data), [restaurant.data]);
  const sharedOrdering = perPersonComanda && casualConfig.sharedOrdering;
  const dinerList = useMemo<TableDiner[]>(() => {
    if (diners.data && diners.data.length > 0) return diners.data;
    // Before the roster loads (or with no companions yet) the picker still
    // needs a "Você" entry so a solo diner isn't blocked from ordering.
    return [{ dinerId: 'me', userId: null, displayName: 'Você', isHost: true, isKid: false, isMe: true, isCompanion: false, kidAge: null, kidAllergies: null }];
  }, [diners.data]);

  const categoryTabs = useMemo(
    () => [{ id: 'all', name: 'Todos' }, ...(menu.data?.categories ?? []).map((c) => ({ id: c.id, name: c.name }))],
    [menu.data],
  );
  const filteredItems = useMemo(() => {
    const items = menu.data?.items ?? [];
    return selectedCategory === 'all' ? items : items.filter((item) => item.categoryId === selectedCategory);
  }, [menu.data?.items, selectedCategory]);
  // "Monte seu Combo" only makes sense while browsing the Combos tab — showing
  // it on every tab would suggest you can build a combo out of desserts.
  const combosCategoryId = useMemo(
    () => menu.data?.categories.find((c) => c.name.trim().toLowerCase() === 'combos')?.id ?? null,
    [menu.data?.categories],
  );
  const showComboBuilder = capabilities?.comboBuilder === true && !!combosCategoryId && selectedCategory === combosCategoryId;
  const comboDiscountLabel = policies?.comboDiscountBps ? ` com ${policies.comboDiscountBps / 100}% off` : '';

  const add = useCallback(
    (item: CustomerMenuItem, quantity = 1) => {
      if (!features.ordering) return;
      cart.setRestaurant(restaurantId, restaurant.data?.name ?? 'Restaurante');
      cart.addItem({ menu_item_id: item.id, name: item.name, price: item.price, quantity, image_url: item.imageUrl ?? undefined, preparation_time: item.preparationTime });
      Toast.show({ type: 'success', text1: 'Adicionado à comanda', text2: `${quantity}x ${item.name}`, visibilityTime: 1800 });
    },
    [cart, features.ordering, restaurant.data, restaurantId],
  );

  const addCasualItem = useCallback(
    ({ item, quantity, diner, notes }: {
      item: CustomerMenuItem;
      quantity: number;
      diner: TableDiner | null;
      notes: string;
    }) => {
      if (!features.ordering) return;
      cart.setRestaurant(restaurantId, restaurant.data?.name ?? 'Restaurante');
      cart.addItem({
        menu_item_id: item.id,
        name: item.name,
        price: item.price,
        quantity,
        image_url: item.imageUrl ?? undefined,
        special_instructions: notes || undefined,
        diner_id: diner && diner.dinerId !== 'me' ? diner.dinerId : undefined,
        diner_name: diner && !diner.isMe ? diner.displayName : undefined,
        preparation_time: item.preparationTime,
      });
      Toast.show({ type: 'success', text1: 'Adicionado à comanda', text2: `${quantity}x ${item.name}`, visibilityTime: 1800 });
    },
    [cart, features.ordering, restaurant.data, restaurantId],
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
        quickBtnFine: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
        quickBtnText: { fontSize: 13, fontWeight: '600', color: colors.foreground },
        categoryScroll: { marginBottom: 12 },
        categoryRow: { paddingHorizontal: 16, gap: 8 },
        categoryChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24, backgroundColor: colors.backgroundTertiary },
        categoryChipFine: { backgroundColor: 'transparent', paddingHorizontal: 14 },
        categoryChipActive: { backgroundColor: colors.primary },
        categoryText: { fontSize: 14, fontWeight: '600', color: colors.foregroundSecondary },
        categoryTextActive: { color: colors.primaryForeground },
        hintBanner: {
          flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 16,
          paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14,
          backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.primaryLight,
        },
        hintText: { flex: 1, fontSize: 12, lineHeight: 16, color: colors.primary },
        listContent: { paddingHorizontal: 16, paddingBottom: 32, gap: 14 },
        menuItem: { flexDirection: 'row', gap: 14 },
        menuImage: { width: 88, height: 88, borderRadius: 14, backgroundColor: colors.backgroundTertiary },
        menuContent: { flex: 1, minWidth: 0, justifyContent: 'center' },
        menuNameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
        menuName: { flexShrink: 1, fontSize: 16, fontWeight: '700', color: colors.foreground },
        popularBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: colors.primary },
        popularBadgeText: { fontSize: 10, fontWeight: '700', color: '#FFFFFF' },
        kidsBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: colors.successBackground },
        kidsBadgeText: { fontSize: 10, fontWeight: '700', color: colors.success },
        menuDescription: { fontSize: 13, color: colors.foregroundSecondary, lineHeight: 18, marginBottom: 8 },
        menuFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
        priceRow: { flexDirection: 'row', alignItems: 'baseline', flexShrink: 1, flexWrap: 'wrap', gap: 6 },
        menuPrice: { fontSize: 16, fontWeight: '700', color: colors.foreground },
        menuOriginalPrice: { fontSize: 13, color: colors.foregroundMuted, textDecorationLine: 'line-through' },
        discountBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: colors.warningBackground },
        discountBadgeText: { fontSize: 10, fontWeight: '700', color: colors.warning },
        addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
        addBtnText: { color: colors.primaryForeground, fontSize: 13, fontWeight: '700' },
        prepTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
        prepTimeText: { fontSize: 12, color: colors.foregroundMuted },
        comboBuilderCard: {
          flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16,
          borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary, backgroundColor: colors.backgroundSecondary,
        },
        comboBuilderTitle: { fontSize: 14, fontWeight: '700', color: colors.foreground },
        comboBuilderSubtitle: { fontSize: 12, color: colors.foregroundSecondary, marginTop: 2 },
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

  if (serviceTypeStatus !== 'loading' && !features.menu) {
    return (
      <ScreenContainer edges={['top', 'bottom']}>
        <FeatureUnavailableMessage feature="Cardápio digital" />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={['top']}>
      <ScrollView
        style={styles.container}
        refreshControl={refreshControl}
        alwaysBounceVertical
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
            <Ionicons name="arrow-back" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {tableService ? 'Cardápio' : (restaurant.data?.name ?? 'Cardápio')}
          </Text>
          {features.ordering ? (
            <TouchableOpacity style={styles.headerBtn} onPress={openCart} accessibilityRole="button" accessibilityLabel="Ver comanda">
              <Ionicons name={tableWithGuests ? 'pricetag-outline' : 'receipt-outline'} size={22} color={colors.foreground} />
              {cart.itemCount > 0 && (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>{cart.itemCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          ) : <View style={{ width: 40, height: 40 }} />}
        </View>

        {(features.callWaiter || (capabilities?.familyMode && casualConfig.familyMode && tableSessionId)) && (
          <View style={styles.quickActions}>
            {features.callWaiter && (
              <TouchableOpacity
                style={[styles.quickBtn, tableWithGuests && styles.quickBtnFine]}
                onPress={callWaiter}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <Ionicons name="hand-left-outline" size={18} color={colors.primary} />
                <Text style={styles.quickBtnText}>Chamar Garçom</Text>
              </TouchableOpacity>
            )}
            {capabilities?.familyMode && casualConfig.familyMode && tableSessionId && (
              <TouchableOpacity
                style={styles.quickBtn}
                onPress={() => navigation.navigate('ModoFamilia', { restaurantId })}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <Ionicons name="happy-outline" size={18} color={colors.primary} />
                <Text style={styles.quickBtnText}>Modo Família</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {categoryTabs.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={styles.categoryRow}>
            {categoryTabs.map((cat) => {
              const active = selectedCategory === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.categoryChip, tableWithGuests && styles.categoryChipFine, active && styles.categoryChipActive]}
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

        {tableService && (
          <View style={styles.hintBanner}>
            <Ionicons name="flash-outline" size={16} color={colors.primary} />
            <Text style={styles.hintText}>Toque em um prato para ver detalhes e adicionar à comanda</Text>
          </View>
        )}

        {capabilities?.pickupCode && (
          <View style={styles.hintBanner}>
            <Ionicons name="flash-outline" size={16} color={colors.primary} />
            <Text style={styles.hintText}>Monte seu pedido e retire no balcão express</Text>
          </View>
        )}

        <StateView
          loading={menu.isLoading}
          error={menu.error}
          onRetry={() => menu.refetch()}
          empty={!menu.isLoading && filteredItems.length === 0 ? 'Cardápio sem itens disponíveis.' : undefined}
          emptyIcon="fast-food-outline"
        />

        <View style={styles.listContent}>
          {filteredItems.map((item) => {
            const prepTime = formatPrepTime(item.preparationTime);
            const discountPercent =
              item.originalPrice && item.originalPrice > item.price
                ? Math.round((1 - item.price / item.originalPrice) * 100)
                : 0;
            const content = (
              <>
                <Image source={{ uri: item.imageUrl || FALLBACK_IMAGE }} style={styles.menuImage} resizeMode="cover" />
                <View style={styles.menuContent}>
                  <View style={styles.menuNameRow}>
                    <Text style={styles.menuName} numberOfLines={1}>{item.name}</Text>
                    {discountPercent > 0 && (
                      <View style={styles.discountBadge}>
                        <Text style={styles.discountBadgeText}>-{discountPercent}%</Text>
                      </View>
                    )}
                    {item.isPopular && (
                      <View style={styles.popularBadge}>
                        <Text style={styles.popularBadgeText}>Popular</Text>
                      </View>
                    )}
                    {item.isKidsFriendly && (
                      <View style={styles.kidsBadge}>
                        <Text style={styles.kidsBadgeText}>Kids</Text>
                      </View>
                    )}
                  </View>
                  {item.description ? <Text style={styles.menuDescription} numberOfLines={2}>{item.description}</Text> : null}
                  <View style={styles.menuFooter}>
                    <View style={styles.priceRow}>
                      {discountPercent > 0 && (
                        <Text style={styles.menuOriginalPrice}>{money(item.originalPrice!)}</Text>
                      )}
                      <Text style={styles.menuPrice}>{money(item.price)}</Text>
                    </View>
                    {tableService ? (
                      prepTime ? (
                        <View style={styles.prepTimeRow}>
                          <Ionicons name="time-outline" size={13} color={colors.foregroundMuted} />
                          <Text style={styles.prepTimeText}>{prepTime}</Text>
                        </View>
                      ) : null
                    ) : features.ordering ? (
                      <TouchableOpacity style={styles.addBtn} onPress={() => add(item)} accessibilityRole="button" accessibilityLabel={`Adicionar ${item.name}`}>
                        <Ionicons name="add" size={16} color={colors.primaryForeground} />
                        <Text style={styles.addBtnText}>Adicionar</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </>
            );
            if (!tableService) {
              return <View key={item.id} style={styles.menuItem}>{content}</View>;
            }
            return (
              <TouchableOpacity
                key={item.id}
                style={styles.menuItem}
                onPress={() => setDetailItem(item)}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                {content}
              </TouchableOpacity>
            );
          })}

          {showComboBuilder && (
            <TouchableOpacity
              style={styles.comboBuilderCard}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Monte seu Combo"
              onPress={() => navigation.navigate('ComboBuilder', { restaurantId })}
            >
              <Ionicons name="sparkles-outline" size={22} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.comboBuilderTitle}>Monte seu Combo</Text>
                <Text style={styles.comboBuilderSubtitle}>Escolha lanche + acompanhamento + bebida{comboDiscountLabel}</Text>
              </View>
              <Ionicons name="arrow-forward" size={18} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {perPersonComanda ? (
        <CasualDiningItemDetail
          key={detailItem?.id ?? 'none'}
          item={detailItem}
          diners={dinerList}
          tableSessionId={tableSessionId}
          sharedOrdering={sharedOrdering}
          onClose={() => setDetailItem(null)}
          onAdd={addCasualItem}
        />
      ) : (
        <MenuItemDetailModal
          key={detailItem?.id ?? 'none'}
          item={detailItem}
          orderingEnabled={features.ordering}
          onClose={() => setDetailItem(null)}
          onAdd={add}
        />
      )}
    </ScreenContainer>
  );
}

function MenuItemDetailModal({
  item,
  orderingEnabled,
  onClose,
  onAdd,
}: {
  item: CustomerMenuItem | null;
  orderingEnabled: boolean;
  onClose: () => void;
  onAdd: (item: CustomerMenuItem, quantity: number) => void;
}) {
  const colors = useColors();
  const [quantity, setQuantity] = useState(1);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
        sheet: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
        image: { width: '100%', height: 220, backgroundColor: colors.backgroundTertiary },
        backBtn: {
          position: 'absolute', top: 16, left: 16, width: 40, height: 40, borderRadius: 20,
          backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center',
        },
        body: { padding: 20 },
        nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
        name: { flex: 1, fontSize: 20, fontWeight: '800', color: colors.foreground },
        popularBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: colors.primary },
        popularBadgeText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
        description: { fontSize: 14, lineHeight: 20, color: colors.foregroundSecondary, marginBottom: 12 },
        tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
        tag: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.backgroundTertiary },
        tagText: { fontSize: 12, color: colors.foregroundSecondary },
        prepRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 18 },
        prepText: { fontSize: 13, color: colors.foregroundMuted },
        footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
        price: { fontSize: 24, fontWeight: '800', color: colors.foreground },
        stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
        stepperBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
        stepperBtnFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
        stepperValue: { fontSize: 16, fontWeight: '700', color: colors.foreground, minWidth: 18, textAlign: 'center' },
        addBtn: { paddingVertical: 16, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center' },
        addBtnText: { color: colors.primaryForeground, fontSize: 16, fontWeight: '700' },
      }),
    [colors],
  );

  if (!item) return null;
  const tags = dietaryTags(item.dietaryInfo);
  const prepTime = formatPrepTime(item.preparationTime);

  return (
    <Modal visible={!!item} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View>
            <Image source={{ uri: item.imageUrl || FALLBACK_IMAGE }} style={styles.image} resizeMode="cover" />
            <TouchableOpacity style={styles.backBtn} onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar">
              <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <View style={styles.body}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{item.name}</Text>
              {item.isPopular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularBadgeText}>Popular</Text>
                </View>
              )}
            </View>
            {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
            {tags.length > 0 && (
              <View style={styles.tagsRow}>
                {tags.map((tag) => (
                  <View key={tag} style={styles.tag}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            )}
            {prepTime && (
              <View style={styles.prepRow}>
                <Ionicons name="time-outline" size={15} color={colors.foregroundMuted} />
                <Text style={styles.prepText}>Preparo: {prepTime}</Text>
              </View>
            )}
            <View style={styles.footerRow}>
              <Text style={styles.price}>{money(item.price)}</Text>
              <View style={styles.stepper}>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                  accessibilityRole="button"
                  accessibilityLabel="Diminuir quantidade"
                >
                  <Ionicons name="remove" size={16} color={colors.foreground} />
                </TouchableOpacity>
                <Text style={styles.stepperValue}>{quantity}</Text>
                <TouchableOpacity
                  style={[styles.stepperBtn, styles.stepperBtnFilled]}
                  onPress={() => setQuantity((q) => q + 1)}
                  accessibilityRole="button"
                  accessibilityLabel="Aumentar quantidade"
                >
                  <Ionicons name="add" size={16} color={colors.primaryForeground} />
                </TouchableOpacity>
              </View>
            </View>
            {orderingEnabled ? (
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => {
                  onAdd(item, quantity);
                  setQuantity(1);
                  onClose();
                }}
                activeOpacity={0.9}
                accessibilityRole="button"
              >
                <Text style={styles.addBtnText}>Adicionar · {money(item.price * quantity)}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
