import React, { useCallback, useMemo } from 'react';
import { Alert, Image, ScrollView, Share, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { useCart } from '@/shared/contexts/CartContext';
import { useVisitSession } from '../../contexts/VisitSessionContext';
import { useServiceTypeFor } from '../../hooks/useServiceTypeFeatures';
import customerBackend from '../../services/customer-backend';
import CasualDiningComandaScreen from './CasualDiningComandaScreen';
import { money } from './shared';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=200&q=80';

export default function CartScreen({ navigation, route }: any) {
  const colors = useColors();
  const cart = useCart();
  const { session } = useVisitSession();
  const queryClient = useQueryClient();
  // The comanda belongs to whichever restaurant the customer is seated at —
  // that's the session, not the (possibly empty) draft cart.
  const { capabilities, policies } = useServiceTypeFor(cart.restaurantId ?? session?.restaurantId);
  // Every journey decision below reads the restaurant's server capabilities,
  // never the service model name (CLAUDE.md, regra estrutural).
  const tableWithGuests = capabilities?.consumptionUnit === 'table_with_guests';
  const perPersonComanda = capabilities?.consumptionUnit === 'per_person';
  const individualCart = capabilities?.consumptionUnit === 'individual_cart';
  const prepaidCheckout = capabilities?.prepaidRequired === true;
  // Until capabilities arrive, keep requiring a table: ordering without one is
  // only allowed once the server says this journey has no table session.
  const needsTableSession = capabilities ? capabilities.tableSession : true;
  // The active table session can belong to a different restaurant than the
  // cart (e.g. items were added, then a QR was scanned elsewhere) — the
  // session alone isn't enough, it has to be *this* cart's restaurant.
  const tableMismatch = !!session?.tableSessionId && session.restaurantId !== cart.restaurantId;
  const hasUsableSession = !!session?.tableSessionId && !tableMismatch;
  const canSubmit = !!cart.items.length && (!needsTableSession || hasUsableSession);

  const restaurant = useQuery({
    queryKey: ['restaurant', cart.restaurantId],
    queryFn: () => customerBackend.getRestaurant(cart.restaurantId!),
    enabled: tableWithGuests && !!cart.restaurantId,
  });
  const bill = useQuery({
    queryKey: ['table-bill', session?.tableSessionId],
    queryFn: () => customerBackend.getTableBill(session!.tableSessionId),
    enabled: tableWithGuests && hasUsableSession,
  });
  const participants = bill.data?.participants ?? [];

  const invite = useMutation({
    mutationFn: () => customerBackend.createTableInvite(session!.tableSessionId),
    onSuccess: (url) => {
      Share.share({ message: `Vem pra minha mesa no ${restaurant.data?.name ?? 'restaurante'}! ${url}` });
    },
    onError: (error: Error) => Alert.alert('Não foi possível convidar', error.message),
  });

  const place = useMutation({
    mutationFn: () =>
      customerBackend.placeOrder({
        restaurantId: cart.restaurantId!,
        tableSessionId: needsTableSession ? session!.tableSessionId : undefined,
        items: cart.items.map((i) => ({ menuItemId: i.menu_item_id, quantity: i.quantity, specialInstructions: i.special_instructions })),
      }),
    onSuccess: (order) => {
      cart.clearCart();
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['table-bill'] });
      navigation.replace('OrderDetail', { orderId: order.id });
    },
    onError: (error: Error) => Alert.alert('Pedido não enviado', error.message),
  });

  const decrement = useCallback((id: string, quantity: number) => cart.updateQuantity(id, quantity - 1), [cart]);
  const increment = useCallback((id: string, quantity: number) => cart.updateQuantity(id, quantity + 1), [cart]);
  const openFecharConta = useCallback(
    () => navigation.navigate('FecharConta', { tableSessionId: session?.tableSessionId }),
    [navigation, session],
  );

  // Display estimate from the configured rate; the server recalculates the fee
  // when the bill is closed.
  const serviceFeeBps = capabilities?.serviceFee ? policies?.serviceFeeBps ?? 0 : 0;
  const serviceFee = tableWithGuests ? (cart.total * serviceFeeBps) / 10_000 : 0;
  const totalWithFee = cart.total + serviceFee;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
        headerBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.backgroundTertiary, alignItems: 'center', justifyContent: 'center' },
        headerTitle: { fontSize: 18, fontWeight: '700', color: colors.foreground },
        content: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
        emptyWrap: { alignItems: 'center', paddingVertical: 48, gap: 12 },
        emptyText: { fontSize: 14, color: colors.foregroundSecondary },
        restaurantBanner: {
          flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16,
          backgroundColor: colors.backgroundTertiary, marginBottom: 4,
        },
        restaurantIconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
        restaurantName: { fontSize: 15, fontWeight: '700', color: colors.foreground },
        restaurantSub: { fontSize: 13, color: colors.foregroundSecondary },
        hintBanner: {
          flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14,
          backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.primaryLight,
        },
        hintText: { flex: 1, fontSize: 12, lineHeight: 16, color: colors.primary },
        item: {
          flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16,
          backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
        },
        itemImage: { width: 56, height: 56, borderRadius: 12, backgroundColor: colors.backgroundTertiary },
        itemInfo: { flex: 1 },
        itemName: { fontSize: 15, fontWeight: '600', color: colors.foreground, marginBottom: 4 },
        itemPrice: { fontSize: 13, color: colors.foregroundSecondary },
        qtyControl: { flexDirection: 'row', alignItems: 'center', gap: 10 },
        qtyBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundTertiary },
        qtyValue: { fontSize: 15, fontWeight: '700', color: colors.foreground, minWidth: 20, textAlign: 'center' },
        tableSection: { marginTop: 4 },
        tableSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
        tableSectionTitle: { fontSize: 13, fontWeight: '700', color: colors.foreground },
        inviteLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
        inviteLinkText: { fontSize: 13, fontWeight: '700', color: colors.primary },
        participantsRow: { flexDirection: 'row', gap: 12 },
        participant: { alignItems: 'center', gap: 4, width: 56 },
        participantAvatar: {
          width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
          backgroundColor: colors.primaryLight, borderWidth: 2, borderColor: colors.primary,
        },
        participantAvatarText: { fontSize: 16, fontWeight: '700', color: colors.primary },
        participantName: { fontSize: 11, color: colors.foregroundSecondary, textAlign: 'center' },
        totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
        totalLabel: { fontSize: 13, color: colors.foregroundSecondary },
        totalValue: { fontSize: 13, fontWeight: '600', color: colors.foreground },
        grandTotalRow: {
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12,
          borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: 4,
        },
        grandTotalLabel: { fontSize: 15, color: colors.foregroundSecondary },
        grandTotalValue: { fontSize: 20, fontWeight: '800', color: colors.foreground },
        totalNote: { fontSize: 12, color: colors.foregroundMuted, marginBottom: 8 },
        sessionBanner: {
          flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14,
          backgroundColor: colors.backgroundSecondary, marginBottom: 16,
        },
        sessionBannerText: { flex: 1, fontSize: 13, fontWeight: '500', color: colors.primary, lineHeight: 18 },
        scanBtn: { paddingVertical: 14, borderRadius: 16, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center', marginBottom: 10 },
        scanBtnText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
        cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 16, backgroundColor: colors.primary },
        ctaDisabled: { opacity: 0.5 },
        ctaText: { color: colors.primaryForeground, fontSize: 16, fontWeight: '700' },
        fecharContaBtn: { paddingVertical: 14, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', marginTop: 10 },
        fecharContaText: { fontSize: 15, fontWeight: '700', color: colors.foreground },
        quickServiceBanner: {
          flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14,
          backgroundColor: colors.successBackground,
        },
        quickServiceBannerText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.success },
        addMoreRow: {
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12,
          borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border,
        },
        addMoreText: { fontSize: 13, fontWeight: '600', color: colors.primary },
        estimatedTimeCard: {
          flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16,
          backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.primaryLight,
        },
        estimatedTimeTitle: { fontSize: 14, fontWeight: '700', color: colors.foreground },
        estimatedTimeSub: { fontSize: 12, color: colors.foregroundSecondary, marginTop: 2 },
      }),
    [colors],
  );

  if (perPersonComanda) {
    return <CasualDiningComandaScreen navigation={navigation} route={route} />;
  }

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
            <Ionicons name="arrow-back" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{tableWithGuests ? 'Minha Comanda' : individualCart ? 'Meu Pedido' : 'Seu Pedido'}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {cart.items.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="cart-outline" size={40} color={colors.foregroundMuted} />
              <Text style={styles.emptyText}>O carrinho está vazio.</Text>
            </View>
          ) : (
            <>
              {tableWithGuests && (
                <View style={styles.restaurantBanner}>
                  <View style={styles.restaurantIconBox}>
                    <Ionicons name="restaurant-outline" size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.restaurantName} numberOfLines={1}>{restaurant.data?.name ?? cart.restaurantName}</Text>
                    <Text style={styles.restaurantSub}>
                      Mesa {session?.tableNumber} · {participants.length || 1} pessoa{(participants.length || 1) > 1 ? 's' : ''}
                    </Text>
                  </View>
                </View>
              )}

              {tableWithGuests && (
                <View style={styles.hintBanner}>
                  <Ionicons name="flash-outline" size={16} color={colors.primary} />
                  <Text style={styles.hintText}>Revise seus itens e feche a conta quando quiser</Text>
                </View>
              )}

              {individualCart && (
                <View style={styles.quickServiceBanner}>
                  <Ionicons name="flash" size={16} color={colors.success} />
                  <Text style={styles.quickServiceBannerText}>Skip the Line — Retire no balcão express</Text>
                </View>
              )}

              {cart.items.map((item) => (
                <View key={item.id} style={styles.item}>
                  <Image source={{ uri: item.image_url || FALLBACK_IMAGE }} style={styles.itemImage} resizeMode="cover" />
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.itemPrice}>{money(item.price)}</Text>
                  </View>
                  <View style={styles.qtyControl}>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => decrement(item.id, item.quantity)} accessibilityRole="button" accessibilityLabel="Diminuir quantidade">
                      <Ionicons name="remove" size={16} color={colors.foreground} />
                    </TouchableOpacity>
                    <Text style={styles.qtyValue}>{item.quantity}</Text>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => increment(item.id, item.quantity)} accessibilityRole="button" accessibilityLabel="Aumentar quantidade">
                      <Ionicons name="add" size={16} color={colors.foreground} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              {individualCart && (
                <TouchableOpacity style={styles.addMoreRow} onPress={() => navigation.navigate('Menu', { restaurantId: cart.restaurantId })} accessibilityRole="button">
                  <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                  <Text style={styles.addMoreText}>Adicionar mais itens</Text>
                </TouchableOpacity>
              )}

              {individualCart && (
                <View style={styles.estimatedTimeCard}>
                  <Ionicons name="timer-outline" size={22} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.estimatedTimeTitle}>Tempo estimado: ~5 min</Text>
                    <Text style={styles.estimatedTimeSub}>Baseado nos itens do pedido</Text>
                  </View>
                </View>
              )}

              {tableWithGuests && hasUsableSession && (
                <View style={styles.tableSection}>
                  <View style={styles.tableSectionHeader}>
                    <Text style={styles.tableSectionTitle}>Na mesa ({participants.length || 1})</Text>
                    {capabilities?.guestLink && (
                      <TouchableOpacity style={styles.inviteLink} onPress={() => invite.mutate()} disabled={invite.isPending} accessibilityRole="button">
                        <Ionicons name="person-add-outline" size={14} color={colors.primary} />
                        <Text style={styles.inviteLinkText}>{invite.isPending ? 'Gerando...' : 'Convidar'}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.participantsRow}>
                    {(participants.length > 0
                      ? participants
                      : [{ dinerId: 'me', userId: null, displayName: 'Você', isHost: true, isKid: false, isMe: true, isCompanion: false }]
                    ).map((p) => (
                      <View key={p.dinerId} style={styles.participant}>
                        <View style={styles.participantAvatar}>
                          <Text style={styles.participantAvatarText}>{(p.isMe ? 'V' : (p.displayName ?? 'C')[0]).toUpperCase()}</Text>
                        </View>
                        <Text style={styles.participantName} numberOfLines={1}>{p.isMe ? 'Você' : (p.displayName ?? 'Convidado')}</Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Subtotal ({cart.itemCount} {cart.itemCount === 1 ? 'item' : 'itens'})</Text>
                <Text style={styles.totalValue}>{money(cart.total)}</Text>
              </View>
              {serviceFee > 0 && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Taxa de serviço ({serviceFeeBps / 100}%)</Text>
                  <Text style={styles.totalValue}>{money(serviceFee)}</Text>
                </View>
              )}
              <View style={styles.grandTotalRow}>
                <Text style={styles.grandTotalLabel}>Total</Text>
                <Text style={styles.grandTotalValue}>{money(totalWithFee)}</Text>
              </View>
              <Text style={styles.totalNote}>O preço final é recalculado e validado no servidor.</Text>

              {needsTableSession && !hasUsableSession && (
                <View style={styles.sessionBanner}>
                  <Ionicons name="qr-code-outline" size={20} color={colors.primary} />
                  <Text style={styles.sessionBannerText}>
                    {tableMismatch
                      ? 'Sua mesa aberta é de outro restaurante. Leia o QR da mesa deste restaurante para enviar o pedido.'
                      : 'Leia o QR da mesa para enviar o pedido à cozinha.'}
                  </Text>
                </View>
              )}

              {needsTableSession && !hasUsableSession && (
                <TouchableOpacity style={styles.scanBtn} onPress={() => navigation.navigate('QrScanner')} accessibilityRole="button">
                  <Text style={styles.scanBtnText}>Escanear QR da mesa</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.cta, !cart.items.length && styles.ctaDisabled]}
                onPress={() =>
                  prepaidCheckout
                    ? navigation.navigate('QuickServiceCheckout', { restaurantId: cart.restaurantId })
                    : place.mutate()
                }
                disabled={prepaidCheckout ? !cart.items.length : !canSubmit || place.isPending}
                accessibilityRole="button"
              >
                {tableWithGuests && !place.isPending && <Ionicons name="time-outline" size={18} color={colors.primaryForeground} />}
                <Text style={styles.ctaText}>
                  {prepaidCheckout
                    ? `Ir para Pagamento · ${money(cart.total)}`
                    : place.isPending
                      ? 'Enviando...'
                      : needsTableSession
                        ? 'Enviar Pedido'
                        : 'Pedir no Balcão'}
                </Text>
              </TouchableOpacity>

              {tableWithGuests && hasUsableSession && (
                <TouchableOpacity style={styles.fecharContaBtn} onPress={openFecharConta} accessibilityRole="button">
                  <Text style={styles.fecharContaText}>Fechar Conta</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}
