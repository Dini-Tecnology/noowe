/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V5 */
/* Hallmark · macrostructure: Long Document · tone: warm utilitarian · anchor hue: orange */
import React, { useMemo } from 'react';
import { Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import type {
  CustomerRestaurant,
  RestaurantLiveStatus,
} from '../../services/customer-backend';
import {
  CASUAL_RESTAURANT_ACTIONS,
  casualDiningConfigOf,
  formatPricePerPerson,
  occupancyTone,
  restaurantAmenityChips,
} from './casual-dining-ui';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80';

export interface CasualDiningRestaurantViewProps {
  restaurant: CustomerRestaurant;
  status: RestaurantLiveStatus | null | undefined;
  isFavorite: boolean;
  favoritePending: boolean;
  hasWaitlist: boolean;
  hasReservations: boolean;
  activeSessionHere: boolean;
  tableNumber?: string | null;
  refreshControl: React.ReactElement<any>;
  onBack: () => void;
  onToggleFavorite: () => void;
  onAction: (key: string) => void;
  onEnter: () => void;
  onReserve: () => void;
  onLeaveTable: () => void;
}

/**
 * The casual dining restaurant page: identity, live room status, and a single
 * "Entrar no Restaurante" call to action. Unlike fine dining — where the
 * decision is *which reservation to make* — a casual dining guest usually
 * shows up, so the page leads with whether they can walk in right now.
 */
export default function CasualDiningRestaurantView({
  restaurant,
  status,
  isFavorite,
  favoritePending,
  hasWaitlist,
  hasReservations,
  activeSessionHere,
  tableNumber,
  refreshControl,
  onBack,
  onToggleFavorite,
  onAction,
  onEnter,
  onReserve,
  onLeaveTable,
}: CasualDiningRestaurantViewProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const config = useMemo(() => casualDiningConfigOf(restaurant), [restaurant]);
  const amenities = useMemo(() => restaurantAmenityChips(restaurant), [restaurant]);
  const priceLabel = useMemo(
    () => formatPricePerPerson(config, restaurant.averageTicket),
    [config, restaurant.averageTicket],
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: { flex: 1, backgroundColor: colors.background },
        content: { paddingBottom: 40 },
        topBar: {
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 16, paddingBottom: 8, gap: 12,
        },
        topBarBtn: {
          width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
          backgroundColor: colors.backgroundTertiary,
        },
        topBarTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.foreground },
        identity: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 12 },
        logoBox: {
          width: 92, height: 92, borderRadius: 24, backgroundColor: colors.backgroundSecondary,
          alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 14,
        },
        logo: { width: '100%', height: '100%' },
        name: { fontSize: 24, fontWeight: '800', color: colors.foreground, letterSpacing: -0.4, textAlign: 'center' },
        tagline: {
          marginTop: 6, fontSize: 15, lineHeight: 21, color: colors.foregroundSecondary, textAlign: 'center',
        },
        metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
        metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
        metaText: { fontSize: 14, fontWeight: '600', color: colors.foreground },
        metaDivider: { fontSize: 14, color: colors.foregroundMuted },
        metaPrice: { fontSize: 14, color: colors.foregroundSecondary },
        leaveTableRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
        leaveTableText: { fontSize: 13, fontWeight: '600', color: colors.foregroundSecondary, textDecorationLine: 'underline' },
        actionsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 22 },
        action: {
          flex: 1, minHeight: 72, alignItems: 'center', justifyContent: 'center', gap: 8,
          borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
        },
        actionLabel: { fontSize: 12, fontWeight: '600', color: colors.foregroundSecondary },
        amenities: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginTop: 20 },
        amenity: {
          flexDirection: 'row', alignItems: 'center', gap: 6,
          paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: colors.backgroundTertiary,
        },
        amenityText: { fontSize: 13, color: colors.foregroundSecondary },
        statusCard: {
          marginHorizontal: 16, marginTop: 22, padding: 14, borderRadius: 16,
          backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.primaryLight,
        },
        statusHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
        statusTitle: { fontSize: 14, fontWeight: '700', color: colors.foreground },
        statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
        statusItem: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
        statusLabel: { fontSize: 13, color: colors.foregroundSecondary },
        statusValue: { fontSize: 13, fontWeight: '700' },
        hint: {
          flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 12,
          paddingHorizontal: 12, paddingVertical: 11, borderRadius: 16,
          backgroundColor: colors.backgroundSecondary,
        },
        hintText: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.primary },
        cta: {
          marginHorizontal: 16, marginTop: 22, paddingVertical: 18, borderRadius: 20,
          backgroundColor: colors.primary, alignItems: 'center',
        },
        ctaText: { fontSize: 17, fontWeight: '700', color: colors.primaryForeground },
        secondaryCta: {
          marginHorizontal: 16, marginTop: 10, paddingVertical: 15, borderRadius: 18,
          borderWidth: 1.5, borderColor: colors.border, alignItems: 'center',
        },
        secondaryCtaText: { fontSize: 15, fontWeight: '700', color: colors.foreground },
      }),
    [colors],
  );

  const waitText = status?.isOpen
    ? status.estimatedWaitMinutes > 0
      ? `~${status.estimatedWaitMinutes} min`
      : 'Sem espera'
    : '—';

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
      refreshControl={refreshControl}
      alwaysBounceVertical
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.topBarBtn} onPress={onBack} accessibilityRole="button" accessibilityLabel="Voltar">
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle} numberOfLines={1}>{restaurant.name}</Text>
        <TouchableOpacity
          style={styles.topBarBtn}
          onPress={onToggleFavorite}
          disabled={favoritePending}
          accessibilityRole="button"
          accessibilityLabel={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
          accessibilityState={{ selected: isFavorite, busy: favoritePending }}
        >
          <Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.identity}>
        <View style={styles.logoBox}>
          <Image
            source={{ uri: restaurant.logoUrl || restaurant.bannerUrl || FALLBACK_IMAGE }}
            style={styles.logo}
            resizeMode="cover"
          />
        </View>
        <Text style={styles.name}>{restaurant.name}</Text>
        {restaurant.description ? <Text style={styles.tagline}>{restaurant.description}</Text> : null}

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="star" size={15} color={colors.ratingGold} />
            <Text style={styles.metaText}>{restaurant.rating.toFixed(1)} ({restaurant.totalReviews})</Text>
          </View>
          {priceLabel ? (
            <>
              <Text style={styles.metaDivider}>|</Text>
              <Text style={styles.metaPrice}>{priceLabel}</Text>
            </>
          ) : null}
        </View>

        {activeSessionHere && (
          <TouchableOpacity onPress={onLeaveTable} accessibilityRole="button" style={styles.leaveTableRow}>
            <Ionicons name="exit-outline" size={14} color={colors.foregroundSecondary} />
            <Text style={styles.leaveTableText}>Mesa {tableNumber} · Sair da mesa</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.actionsRow}>
        {CASUAL_RESTAURANT_ACTIONS.map((action) => (
          <TouchableOpacity
            key={action.key}
            style={styles.action}
            onPress={() => onAction(action.key)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={action.label}
          >
            <Ionicons name={action.icon} size={22} color={colors.primary} />
            <Text style={styles.actionLabel}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {amenities.length > 0 && (
        <View style={styles.amenities}>
          {amenities.map((amenity) => (
            <View key={amenity.key} style={styles.amenity}>
              <Ionicons name={amenity.icon} size={13} color={colors.foregroundMuted} />
              <Text style={styles.amenityText}>{amenity.label}</Text>
            </View>
          ))}
        </View>
      )}

      {status && (
        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <Ionicons name="time-outline" size={15} color={colors.primary} />
            <Text style={styles.statusTitle}>Status Agora</Text>
          </View>
          <View style={styles.statusRow}>
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>Lotação:</Text>
              <Text style={[styles.statusValue, { color: occupancyTone(status) }]}>
                {status.occupancyPercent == null ? '—' : `${status.occupancyPercent}%`}
              </Text>
            </View>
            {config.estimatedWaitDisplay && (
              <View style={styles.statusItem}>
                <Text style={styles.statusLabel}>Espera:</Text>
                <Text style={[styles.statusValue, { color: colors.foreground }]}>{waitText}</Text>
              </View>
            )}
            <Text style={[styles.statusValue, { color: status.isOpen ? colors.success : colors.foregroundMuted }]}>
              {status.isOpen ? (status.closesAt ? `Aberto até ${status.closesAt}` : 'Aberto') : 'Fechado'}
            </Text>
          </View>
        </View>
      )}

      {hasWaitlist && config.reservationsOptional && (
        <View style={styles.hint}>
          <Ionicons name="flash-outline" size={16} color={colors.primary} />
          <Text style={styles.hintText}>Walk-in com fila inteligente ou reserve antecipado</Text>
        </View>
      )}

      <TouchableOpacity style={styles.cta} onPress={onEnter} activeOpacity={0.9} accessibilityRole="button">
        <Text style={styles.ctaText}>Entrar no Restaurante</Text>
      </TouchableOpacity>

      {hasReservations && (
        <TouchableOpacity style={styles.secondaryCta} onPress={onReserve} activeOpacity={0.85} accessibilityRole="button">
          <Text style={styles.secondaryCtaText}>Reservar mesa</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}
