/* Hallmark · pre-emit critique: P5 H4 E4 S5 R3 V5 */
/* Hallmark · macrostructure: Photographic · tone: warm utilitarian · anchor hue: orange */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import QRCode from 'react-native-qrcode-svg';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import customerBackend from '../../services/customer-backend';
import { useServiceTypeFor } from '../../hooks/useServiceTypeFeatures';
import { loadPickupFromCache, savePickupForOffline, type CachedPickup } from '../../services/pickup-code-cache';
import { cancelPickupReminders, schedulePickupReminders } from '../../services/pickup-reminders';
import { formatCountdown, pickupPolicyText, pickupQrPayload, remainingSeconds } from './quick-service-ui';

type RouteParams = { orderId: string };

function formatElapsed(startIso?: string | null, endIso?: string | null): string {
  if (!startIso || !endIso) return '—';
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} min ${seconds}s`;
}

/**
 * Tela de retirada do Quick Service (ADR-013): mostra o código em QR e texto, o prazo
 * restante e, depois da retirada, o comprovante e a avaliação. O código fica guardado
 * no aparelho para funcionar sem sinal no balcão.
 */
export default function OrderReadyScreen() {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const colors = useColors();
  const queryClient = useQueryClient();
  const { orderId } = (route.params ?? {}) as RouteParams;
  const query = useQuery({
    queryKey: ['orders', orderId],
    queryFn: () => customerBackend.getOrder(orderId),
    enabled: !!orderId,
  });
  const order = query.data;
  const { policies } = useServiceTypeFor(order?.restaurantId, order?.serviceModel);

  // Offline: sem pedido carregado, usa o que ficou guardado no aparelho.
  const [cached, setCached] = useState<CachedPickup | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadPickupFromCache(orderId).then((value) => { if (!cancelled) setCached(value); });
    return () => { cancelled = true; };
  }, [orderId]);

  // Realtime: o pedido pode ser retirado (ou expirar) enquanto esta tela está aberta.
  useEffect(() => {
    let channel: Awaited<ReturnType<typeof customerBackend.subscribeToOrderChanges>> | undefined;
    let cancelled = false;
    customerBackend.subscribeToOrderChanges(orderId, () => {
      void queryClient.invalidateQueries({ queryKey: ['orders', orderId] });
    }).then((value) => {
      if (cancelled) void value.unsubscribe(); else channel = value;
    }).catch(() => undefined);
    return () => { cancelled = true; if (channel) void channel.unsubscribe(); };
  }, [orderId, queryClient]);

  const fulfillmentStatus = order?.fulfillmentStatus ?? cached?.fulfillmentStatus ?? 'ready';
  const pickupCode = order?.pickupCode ?? cached?.pickupCode ?? order?.orderNumber ?? '';
  const pickupExpiresAt = order?.pickupExpiresAt ?? cached?.pickupExpiresAt ?? null;
  const callName = order?.callName ?? cached?.callName ?? null;
  const restaurantName = order?.restaurantName ?? cached?.restaurantName ?? '';
  const offline = !order && !!cached;

  // Guarda o código enquanto o pedido está ativo e agenda os lembretes locais (ADR-013 §2.3).
  useEffect(() => {
    if (!order || !order.pickupCode) return;
    void savePickupForOffline({
      orderId: order.id, pickupCode: order.pickupCode, restaurantName: order.restaurantName,
      callName: order.callName, pickupExpiresAt: order.pickupExpiresAt, fulfillmentStatus: order.fulfillmentStatus,
    });
    if (order.fulfillmentStatus === 'ready' && order.pickupExpiresAt) {
      void schedulePickupReminders({
        orderId: order.id, restaurantName: order.restaurantName,
        readyAt: new Date(order.updatedAt), expiresAt: new Date(order.pickupExpiresAt),
      });
    } else {
      void cancelPickupReminders(order.id);
    }
  }, [order]);

  // Relógio de 1 s: só o callback do intervalo atualiza o estado, derivando o prazo restante a cada tique.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = remainingSeconds(pickupExpiresAt, now);

  const ready = fulfillmentStatus === 'ready';
  const pickedUp = fulfillmentStatus === 'picked_up' || fulfillmentStatus === 'delivered';
  const notPickedUp = fulfillmentStatus === 'not_picked_up';
  const cancelled = fulfillmentStatus === 'cancelled';
  const elapsed = formatElapsed(order?.createdAt, order?.pickedUpAt ?? order?.updatedAt);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
        statusCircle: {
          width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginBottom: 16,
        },
        title: { fontSize: 24, fontWeight: '800', color: colors.foreground, marginBottom: 4, textAlign: 'center' },
        subtitle: { fontSize: 14, color: colors.foregroundSecondary, marginBottom: 20, textAlign: 'center' },
        offlineBadge: {
          flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6,
          borderRadius: 999, backgroundColor: colors.backgroundTertiary, marginBottom: 16,
        },
        offlineText: { fontSize: 12, fontWeight: '600', color: colors.foregroundSecondary },
        qrCard: {
          width: '100%', alignItems: 'center', backgroundColor: colors.card, borderRadius: 20, padding: 20, gap: 12,
          marginBottom: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
        },
        qrFrame: { padding: 12, borderRadius: 16, backgroundColor: '#FFFFFF' },
        codeLabel: { fontSize: 12, fontWeight: '600', color: colors.foregroundSecondary },
        code: { fontSize: 36, fontWeight: '800', letterSpacing: 4, color: colors.primary },
        countdown: { fontSize: 15, fontWeight: '700', color: colors.foreground },
        card: {
          width: '100%', backgroundColor: colors.card, borderRadius: 18, padding: 18, gap: 10, marginBottom: 16,
          borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
        },
        row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
        rowLabel: { fontSize: 13, color: colors.foregroundSecondary },
        rowValue: { fontSize: 15, fontWeight: '700', color: colors.foreground },
        policy: { fontSize: 12, color: colors.foregroundSecondary, textAlign: 'center', marginBottom: 20, lineHeight: 17 },
        stampCard: {
          width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16,
          backgroundColor: colors.backgroundSecondary, marginBottom: 20,
        },
        stampTitle: { fontSize: 14, fontWeight: '700', color: colors.foreground },
        stampSub: { fontSize: 12, color: colors.foregroundSecondary, marginTop: 2 },
        cta: {
          width: '100%', paddingVertical: 17, borderRadius: 18, alignItems: 'center',
          backgroundColor: colors.primary, marginBottom: 10,
        },
        ctaSecondary: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.primary },
        ctaText: { fontSize: 16, fontWeight: '700', color: colors.primaryForeground },
        ctaSecondaryText: { color: colors.primary },
        reviewed: { fontSize: 14, fontWeight: '600', color: colors.foregroundSecondary, marginBottom: 16 },
      }),
    [colors],
  );

  const headline = pickedUp ? 'Pedido retirado'
    : notPickedUp ? 'Pedido não retirado'
    : cancelled ? 'Pedido cancelado'
    : callName ? `${callName}, seu pedido está pronto!` : 'Pedido Pronto!';
  const subline = ready ? `Retire ${policies?.pickupLocation ? `em ${policies.pickupLocation}` : 'no balcão'} apresentando o código`
    : pickedUp ? `Obrigado por pedir em ${restaurantName}`
    : notPickedUp ? 'O prazo de retirada terminou.'
    : 'Este pedido foi cancelado.';
  const circleColor = ready || pickedUp ? colors.success : colors.foregroundMuted;

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.statusCircle, { backgroundColor: ready || pickedUp ? colors.successBackground : colors.backgroundTertiary }]}>
          <Ionicons
            name={pickedUp || ready ? 'checkmark' : notPickedUp ? 'time-outline' : 'close'}
            size={46}
            color={circleColor}
          />
        </View>
        <Text style={styles.title}>{headline}</Text>
        <Text style={styles.subtitle}>{subline}</Text>

        {offline && (
          <View style={styles.offlineBadge} accessibilityLabel="Modo offline">
            <Ionicons name="cloud-offline-outline" size={14} color={colors.foregroundSecondary} />
            <Text style={styles.offlineText}>Sem conexão · código guardado no aparelho</Text>
          </View>
        )}

        {ready && !!pickupCode && (
          <View style={styles.qrCard} accessibilityLabel={`Código de retirada ${pickupCode}`}>
            <View style={styles.qrFrame}>
              <QRCode value={pickupQrPayload(orderId, pickupCode)} size={176} backgroundColor="#FFFFFF" color="#111111" />
            </View>
            <Text style={styles.codeLabel}>Código de retirada</Text>
            <Text style={styles.code}>{pickupCode}</Text>
            {seconds != null && (
              <Text style={styles.countdown}>
                {seconds > 0 ? `Retire em ${formatCountdown(seconds)}` : 'Prazo de retirada encerrado'}
              </Text>
            )}
          </View>
        )}

        {ready && (
          <Text style={styles.policy}>
            {pickupPolicyText({
              pickupExpiryMin: policies?.pickupExpiryMin ?? null,
              noPickupPolicy: policies?.noPickupPolicy ?? null,
            })}
          </Text>
        )}

        {(pickedUp || notPickedUp) && order && (
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Pedido</Text>
              <Text style={styles.rowValue}>{pickupCode}</Text>
            </View>
            {pickedUp && (
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Tempo total</Text>
                <Text style={styles.rowValue}>{elapsed}</Text>
              </View>
            )}
          </View>
        )}

        {/* Quick Service premia com selo na retirada (ADR-005), não com pontos por pedido. */}
        {(ready || pickedUp) && (
          <View style={styles.stampCard}>
            <Ionicons name="ribbon-outline" size={24} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.stampTitle}>{pickedUp ? 'Selo creditado!' : 'Seu selo vem na retirada'}</Text>
              <Text style={styles.stampSub}>
                {pickedUp ? 'Acompanhe seus cartões de selos no perfil.' : 'Retire o pedido para completar o cartão de selos.'}
              </Text>
            </View>
          </View>
        )}

        {pickedUp && order && (
          <TouchableOpacity
            style={[styles.cta, styles.ctaSecondary]}
            onPress={() => navigation.navigate('DigitalReceipt', { orderId })}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Ver comprovante"
          >
            <Text style={[styles.ctaText, styles.ctaSecondaryText]}>Ver comprovante</Text>
          </TouchableOpacity>
        )}

        {order && order.rating != null && (
          <Text style={styles.reviewed} accessibilityLabel={`Você avaliou com ${order.rating} de 5 estrelas`}>
            Você avaliou: {'★'.repeat(Math.round(order.rating))}{'☆'.repeat(5 - Math.round(order.rating))}
          </Text>
        )}
        {/* Avaliação só depois da retirada: antes disso o cliente ainda não recebeu o pedido. */}
        {pickedUp && order && order.rating == null && (
          <TouchableOpacity
            style={styles.cta}
            // Same review flow as Fine/Casual after payment: per-category
            // ratings, comment and tags, submitted explicitly, one per order.
            onPress={() => navigation.navigate('Review', {
              orderId,
              restaurantId: order.restaurantId,
              restaurantName: order.restaurantName,
            })}
            activeOpacity={0.9}
            accessibilityRole="button"
          >
            <Text style={styles.ctaText}>★ Avaliar restaurante</Text>
          </TouchableOpacity>
        )}
        {!ready && (
          <TouchableOpacity
            style={[styles.cta, pickedUp && order?.rating == null && styles.ctaSecondary]}
            onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Main', params: { screen: 'Home' } }] })}
            activeOpacity={0.9}
            accessibilityRole="button"
          >
            <Text style={[styles.ctaText, pickedUp && order?.rating == null && styles.ctaSecondaryText]}>Voltar ao Início</Text>
          </TouchableOpacity>
        )}
        {ready && (
          <TouchableOpacity
            style={[styles.cta, styles.ctaSecondary]}
            onPress={() => navigation.navigate('OrderDetail', { orderId, keepDetail: true })}
            activeOpacity={0.9}
            accessibilityRole="button"
          >
            <Text style={[styles.ctaText, styles.ctaSecondaryText]}>Ver detalhes do pedido</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
