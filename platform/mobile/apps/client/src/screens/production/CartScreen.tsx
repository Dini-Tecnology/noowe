import React, { useCallback, useMemo } from 'react';
import { Alert, Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { useCart } from '@/shared/contexts/CartContext';
import { useVisitSession } from '../../contexts/VisitSessionContext';
import customerBackend from '../../services/customer-backend';
import { money } from './shared';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=200&q=80';

export default function CartScreen({ navigation }: any) {
  const colors = useColors();
  const cart = useCart();
  const { session } = useVisitSession();
  const queryClient = useQueryClient();

  const place = useMutation({
    mutationFn: () =>
      customerBackend.placeOrder({
        restaurantId: cart.restaurantId!,
        tableSessionId: session!.tableSessionId,
        items: cart.items.map((i) => ({ menuItemId: i.menu_item_id, quantity: i.quantity, specialInstructions: i.special_instructions })),
      }),
    onSuccess: (order) => {
      cart.clearCart();
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      navigation.replace('OrderDetail', { orderId: order.id });
    },
    onError: (error: Error) => Alert.alert('Pedido não enviado', error.message),
  });

  const decrement = useCallback((id: string, quantity: number) => cart.updateQuantity(id, quantity - 1), [cart]);
  const increment = useCallback((id: string, quantity: number) => cart.updateQuantity(id, quantity + 1), [cart]);

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
        totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: 8 },
        totalLabel: { fontSize: 15, color: colors.foregroundSecondary },
        totalValue: { fontSize: 20, fontWeight: '800', color: colors.foreground },
        totalNote: { fontSize: 12, color: colors.foregroundMuted, marginBottom: 16 },
        sessionBanner: {
          flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14,
          backgroundColor: '#FFF3EE', marginBottom: 16,
        },
        sessionBannerText: { flex: 1, fontSize: 13, fontWeight: '500', color: colors.primary, lineHeight: 18 },
        scanBtn: { paddingVertical: 14, borderRadius: 16, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center', marginBottom: 10 },
        scanBtnText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
        cta: { paddingVertical: 16, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center' },
        ctaDisabled: { opacity: 0.5 },
        ctaText: { color: colors.primaryForeground, fontSize: 16, fontWeight: '700' },
      }),
    [colors],
  );

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
            <Ionicons name="arrow-back" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Seu Pedido</Text>
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

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total estimado</Text>
                <Text style={styles.totalValue}>{money(cart.total)}</Text>
              </View>
              <Text style={styles.totalNote}>O preço final é recalculado e validado no servidor.</Text>

              {!session?.tableSessionId && (
                <View style={styles.sessionBanner}>
                  <Ionicons name="qr-code-outline" size={20} color={colors.primary} />
                  <Text style={styles.sessionBannerText}>Leia o QR da mesa para enviar o pedido à cozinha.</Text>
                </View>
              )}

              {!session?.tableSessionId && (
                <TouchableOpacity style={styles.scanBtn} onPress={() => navigation.navigate('QrScanner')} accessibilityRole="button">
                  <Text style={styles.scanBtnText}>Escanear QR da mesa</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.cta, (!cart.items.length || !session?.tableSessionId || place.isPending) && styles.ctaDisabled]}
                onPress={() => place.mutate()}
                disabled={!cart.items.length || !session?.tableSessionId || place.isPending}
                accessibilityRole="button"
              >
                <Text style={styles.ctaText}>{place.isPending ? 'Enviando...' : 'Enviar Pedido'}</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}
