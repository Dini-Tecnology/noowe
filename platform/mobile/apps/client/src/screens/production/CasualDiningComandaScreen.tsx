/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V5 */
/* Hallmark · macrostructure: Long Document · tone: warm utilitarian · anchor hue: orange */
import React, { useCallback, useMemo } from 'react';
import { Alert, Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { useCart } from '@/shared/contexts/CartContext';
import { useVisitSession } from '../../contexts/VisitSessionContext';
import customerBackend, { type TableBillItem } from '../../services/customer-backend';
import { money, StateView, useQueryRefreshControl } from './shared';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=200&q=80';

const AVATAR_TONES = ['#EA580C', '#DB2777', '#2563EB', '#9333EA', '#0D9488', '#CA8A04'];

type PersonGroup = {
  dinerId: string;
  name: string;
  isMe: boolean;
  isKid: boolean;
  items: TableBillItem[];
  subtotal: number;
};

/**
 * "Comanda" — the running tab of a casual dining table, grouped by person
 * ("Você R$176", "Maria R$58" …). Unlike fine dining's Fechar Conta, this is
 * the everyday view a family checks mid-meal, not the payment step: it shows
 * what has already been sent to the kitchen, plus a way to add more from the
 * still-unsent cart.
 */
export default function CasualDiningComandaScreen({ navigation }: any) {
  const colors = useColors();
  const cart = useCart();
  const { session } = useVisitSession();
  const queryClient = useQueryClient();

  const restaurant = useQuery({
    queryKey: ['restaurant', session?.restaurantId],
    queryFn: () => customerBackend.getRestaurant(session!.restaurantId),
    enabled: !!session?.restaurantId,
  });
  const bill = useQuery({
    queryKey: ['table-bill', session?.tableSessionId],
    queryFn: () => customerBackend.getTableBill(session!.tableSessionId),
    enabled: !!session?.tableSessionId,
  });
  const refreshControl = useQueryRefreshControl(bill.data ? [bill] : []);

  const groups = useMemo<PersonGroup[]>(() => {
    const items = bill.data?.items ?? [];
    const byDiner = new Map<string, PersonGroup>();
    for (const item of items) {
      const key = item.dinerId ?? item.placedBy;
      const existing = byDiner.get(key);
      if (existing) {
        existing.items.push(item);
        existing.subtotal += item.totalPrice;
        continue;
      }
      byDiner.set(key, {
        dinerId: key,
        name: item.placedByIsMe && !item.dinerId ? 'Você' : item.dinerName,
        isMe: item.placedByIsMe && (!item.dinerId || item.dinerName === item.placedByName),
        isKid: item.dinerIsKid,
        items: [item],
        subtotal: item.totalPrice,
      });
    }
    // Host first, then whoever ordered first — stable and predictable across
    // refreshes instead of re-sorting by amount.
    return [...byDiner.values()].sort((a, b) => (a.isMe === b.isMe ? 0 : a.isMe ? -1 : 1));
  }, [bill.data]);

  const callWaiter = useMutation({
    mutationFn: () =>
      customerBackend.callWaiter({
        restaurantId: session!.restaurantId,
        tableId: session!.tableId,
        type: 'waiter',
      }),
    onSuccess: () => Alert.alert('Chamado enviado', 'Um garçom foi avisado.'),
    onError: (error: Error) => Alert.alert('Não foi possível chamar', error.message),
  });

  const send = useMutation({
    mutationFn: () =>
      customerBackend.placeOrder({
        restaurantId: session!.restaurantId,
        tableSessionId: session!.tableSessionId,
        items: cart.items.map((i) => ({
          menuItemId: i.menu_item_id,
          quantity: i.quantity,
          specialInstructions: i.special_instructions,
          dinerId: i.diner_id,
        })),
      }),
    onSuccess: () => {
      cart.clearCart();
      void queryClient.invalidateQueries({ queryKey: ['table-bill'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error: Error) => Alert.alert('Pedido não enviado', error.message),
  });

  const goToMenu = useCallback(
    () => navigation.navigate('Menu', { restaurantId: session?.restaurantId }),
    [navigation, session],
  );

  const openSplitBill = useCallback(
    () => navigation.navigate('SplitBill', { tableSessionId: session?.tableSessionId, restaurantName: restaurant.data?.name }),
    [navigation, session, restaurant.data],
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        header: {
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 16, paddingVertical: 12,
        },
        headerBtn: {
          width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
          backgroundColor: colors.backgroundTertiary,
        },
        headerTitle: { fontSize: 18, fontWeight: '700', color: colors.foreground },
        content: { paddingHorizontal: 16, paddingBottom: 32, gap: 16 },
        restaurantBanner: {
          flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16,
          backgroundColor: colors.backgroundTertiary,
        },
        restaurantIconBox: {
          width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
          backgroundColor: colors.card,
        },
        restaurantName: { fontSize: 15, fontWeight: '700', color: colors.foreground },
        restaurantSub: { fontSize: 13, color: colors.foregroundSecondary },
        bellBtn: {
          width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
          backgroundColor: colors.card,
        },
        personGroup: { gap: 10 },
        personHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        personIdentity: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        personAvatar: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
        personAvatarText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
        personName: { fontSize: 14, fontWeight: '700', color: colors.foreground },
        kidTag: {
          marginLeft: 2, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8,
          backgroundColor: colors.primaryLight,
        },
        kidTagText: { fontSize: 10, fontWeight: '700', color: colors.primary },
        personTotal: { fontSize: 14, fontWeight: '700', color: colors.foreground },
        item: {
          flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6,
        },
        itemImage: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.backgroundTertiary },
        itemInfo: { flex: 1 },
        itemName: { fontSize: 14, fontWeight: '600', color: colors.foreground },
        itemDescription: { fontSize: 12, color: colors.foregroundSecondary, marginTop: 2 },
        itemPrice: { fontSize: 14, fontWeight: '700', color: colors.foreground },
        divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginTop: 6 },
        pendingCard: {
          borderRadius: 16, borderWidth: 1.5, borderColor: colors.primaryLight, borderStyle: 'dashed',
          padding: 14, gap: 10, backgroundColor: colors.backgroundSecondary,
        },
        pendingTitle: { fontSize: 13, fontWeight: '700', color: colors.primary },
        pendingRow: { flexDirection: 'row', justifyContent: 'space-between' },
        pendingItemName: { fontSize: 13, color: colors.foreground },
        pendingItemPrice: { fontSize: 13, fontWeight: '600', color: colors.foreground },
        sendBtn: {
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          paddingVertical: 14, borderRadius: 14, backgroundColor: colors.primary,
        },
        sendBtnText: { fontSize: 14, fontWeight: '700', color: colors.primaryForeground },
        addMoreBtn: {
          paddingVertical: 14, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center',
        },
        addMoreText: { fontSize: 15, fontWeight: '700', color: colors.foreground },
        splitBtn: {
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          paddingVertical: 14, borderRadius: 16, backgroundColor: colors.primary, marginTop: 10,
        },
        splitBtnText: { fontSize: 15, fontWeight: '700', color: colors.primaryForeground },
        emptyWrap: { alignItems: 'center', paddingVertical: 48, gap: 12 },
        emptyText: { fontSize: 14, color: colors.foregroundSecondary },
      }),
    [colors],
  );

  if (!session?.tableSessionId) {
    return (
      <ScreenContainer edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
            <Ionicons name="arrow-back" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Comanda</Text>
          <View style={{ width: 40 }} />
        </View>
        <StateView empty="Leia o QR da mesa para abrir a comanda." emptyIcon="receipt-outline" />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
            <Ionicons name="arrow-back" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Comanda</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} refreshControl={refreshControl} showsVerticalScrollIndicator={false}>
          <View style={styles.restaurantBanner}>
            <View style={styles.restaurantIconBox}>
              <Ionicons name="pizza-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.restaurantName} numberOfLines={1}>{restaurant.data?.name ?? 'Restaurante'}</Text>
              <Text style={styles.restaurantSub}>
                Mesa {session.tableNumber} · {Math.max(bill.data?.participants.length ?? 1, 1)} pessoa{Math.max(bill.data?.participants.length ?? 1, 1) > 1 ? 's' : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.bellBtn}
              onPress={() => callWaiter.mutate()}
              disabled={callWaiter.isPending}
              accessibilityRole="button"
              accessibilityLabel="Chamar garçom"
            >
              <Ionicons name="notifications-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>

          <StateView loading={bill.isLoading} error={bill.error} onRetry={() => bill.refetch()} />

          {bill.data && groups.length === 0 && cart.items.length === 0 && (
            <View style={styles.emptyWrap}>
              <Ionicons name="receipt-outline" size={40} color={colors.foregroundMuted} />
              <Text style={styles.emptyText}>Nenhum pedido enviado ainda.</Text>
            </View>
          )}

          {groups.map((group, index) => (
            <View key={group.dinerId} style={styles.personGroup}>
              <View style={styles.personHeader}>
                <View style={styles.personIdentity}>
                  <View style={[styles.personAvatar, { backgroundColor: AVATAR_TONES[index % AVATAR_TONES.length] }]}>
                    <Text style={styles.personAvatarText}>{group.name.charAt(0).toLocaleUpperCase('pt-BR')}</Text>
                  </View>
                  <Text style={styles.personName}>{group.name}</Text>
                  {group.isKid && (
                    <View style={styles.kidTag}>
                      <Text style={styles.kidTagText}>Kids</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.personTotal}>{money(group.subtotal)}</Text>
              </View>
              {group.items.map((item) => (
                <View key={item.orderItemId} style={styles.item}>
                  <Image source={{ uri: item.imageUrl || FALLBACK_IMAGE }} style={styles.itemImage} resizeMode="cover" />
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {item.name}{item.quantity > 1 ? ` (${item.quantity}x)` : ''}
                    </Text>
                    {item.description ? (
                      <Text style={styles.itemDescription} numberOfLines={1}>{item.description}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.itemPrice}>{money(item.totalPrice)}</Text>
                </View>
              ))}
              <View style={styles.divider} />
            </View>
          ))}

          {cart.items.length > 0 && (
            <View style={styles.pendingCard}>
              <Text style={styles.pendingTitle}>Ainda não enviado</Text>
              {cart.items.map((item) => (
                <View key={item.id} style={styles.pendingRow}>
                  <Text style={styles.pendingItemName} numberOfLines={1}>
                    {item.quantity}x {item.name}{item.diner_name ? ` · ${item.diner_name}` : ''}
                  </Text>
                  <Text style={styles.pendingItemPrice}>{money(item.price * item.quantity)}</Text>
                </View>
              ))}
              <TouchableOpacity
                style={styles.sendBtn}
                onPress={() => send.mutate()}
                disabled={send.isPending}
                accessibilityRole="button"
              >
                <Ionicons name="paper-plane-outline" size={16} color={colors.primaryForeground} />
                <Text style={styles.sendBtnText}>{send.isPending ? 'Enviando…' : 'Enviar para a cozinha'}</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity style={styles.addMoreBtn} onPress={goToMenu} activeOpacity={0.85} accessibilityRole="button">
            <Text style={styles.addMoreText}>Adicionar mais itens</Text>
          </TouchableOpacity>

          {groups.length > 0 && (
            <TouchableOpacity style={styles.splitBtn} onPress={openSplitBill} activeOpacity={0.9} accessibilityRole="button">
              <Ionicons name="git-branch-outline" size={18} color={colors.primaryForeground} />
              <Text style={styles.splitBtnText}>Dividir Conta</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}
