/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V5 */
/* Hallmark · macrostructure: Long Document · tone: warm utilitarian · anchor hue: orange */
import React, { useMemo, useState } from 'react';
import { Image, Modal, ScrollView, StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Text } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import type {
  CustomerRestaurant,
  QuickServiceStatus,
  RestaurantLiveStatus,
} from '../../services/customer-backend';
import { SKIP_THE_LINE_STEPS, quickStateLabel } from './quick-service-ui';
import { formatAveragePrice, formatRatingWithCount, hasRating } from './home-restaurant-ui';
import {
  RESTAURANT_PAGE_ACTIONS,
  amenityChipLimitForWidth,
  casualDiningConfigOf,
  occupancyTone,
  restaurantAmenityChips,
} from './casual-dining-ui';
import { OpeningHoursSheet } from './OpeningHoursSheet';
import { tableLabel } from './shared';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80';

const CHIP_GAP = 8;
const ACTION_GAP = 10;
const PAGE_PADDING = 16;
/** Below this width four journey buttons stop fitting on one line. */
const JOURNEY_SINGLE_ROW_MIN_WIDTH = 400;

/**
 * Width of each journey button (Escanear QR · Reservar · Fila Virtual …).
 * Four buttons need two rows on a phone; three or fewer always fit on one.
 * Floored: fractional widths (125.33pt on a 428pt iPhone 13 Pro Max) sum to
 * exactly the row width, and Yoga's pixel rounding then wraps the last button.
 */
export function journeyButtonWidth(windowWidth: number, actionCount: number): number {
  const columns = actionCount === 0
    ? 1
    : actionCount >= 4 && windowWidth < JOURNEY_SINGLE_ROW_MIN_WIDTH ? 2 : actionCount;
  return Math.floor((windowWidth - PAGE_PADDING * 2 - ACTION_GAP * (columns - 1)) / columns);
}

export interface RestaurantJourneyAction {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  /** `primary` ocupa a largura toda acima da linha de ações (ex.: "Fazer pedido" no Quick Service). */
  variant?: 'primary';
}

export interface RestaurantDetailViewProps {
  restaurant: CustomerRestaurant;
  status: RestaurantLiveStatus | null | undefined;
  isFavorite: boolean;
  favoritePending: boolean;
  /** Entry points enabled for this restaurant (QR, reserva, fila, garçom). */
  journeyActions: RestaurantJourneyAction[];
  /** Quick Service (ADR-013): status de pedidos, tempo de preparo e local de retirada. */
  quickStatus?: QuickServiceStatus | null;
  /** Mostra o card de pedido pelo app e o "Como funciona". */
  showQuickInfo?: boolean;
  /** Lotação de mesas só faz sentido onde há mesa. */
  showOccupancy?: boolean;
  activeSessionHere: boolean;
  tableNumber?: string | null;
  refreshControl: React.ReactElement<any>;
  onBack: () => void;
  onToggleFavorite: () => void;
  onAction: (key: string) => void;
  onLeaveTable: () => void;
}

/**
 * The restaurant page, shared by every service model. What changes between
 * fine dining, casual dining and quick service is only which journey actions
 * arrive in `journeyActions` — derived from capability flags, never from the
 * service model name.
 */
export default function RestaurantDetailView({
  restaurant,
  status,
  isFavorite,
  favoritePending,
  journeyActions,
  quickStatus,
  showQuickInfo = false,
  showOccupancy = true,
  activeSessionHere,
  tableNumber,
  refreshControl,
  onBack,
  onToggleFavorite,
  onAction,
  onLeaveTable,
}: RestaurantDetailViewProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [allAmenitiesOpen, setAllAmenitiesOpen] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(false);
  const config = useMemo(() => casualDiningConfigOf(restaurant), [restaurant]);
  const amenities = useMemo(() => restaurantAmenityChips(restaurant), [restaurant]);
  const priceLabel = useMemo(
    () => formatAveragePrice(restaurant.averagePriceCents),
    [restaurant.averagePriceCents],
  );

  // Chips are capped so the page never turns into a wall of tags; how many fit
  // depends on how wide the device is. The rest live behind the "…" chip.
  const visibleAmenities = useMemo(
    () => amenities.slice(0, amenityChipLimitForWidth(width)),
    [amenities, width],
  );
  const hiddenAmenityCount = amenities.length - visibleAmenities.length;
  const rated = hasRating(restaurant.rating, restaurant.totalReviews);

  const primaryActions = useMemo(() => journeyActions.filter((action) => action.variant === 'primary'), [journeyActions]);
  const rowActions = useMemo(() => journeyActions.filter((action) => action.variant !== 'primary'), [journeyActions]);
  const journeyItemWidth = useMemo(
    () => journeyButtonWidth(width, rowActions.length),
    [width, rowActions.length],
  );
  const quickState = quickStatus
    ? quickStateLabel(quickStatus.state, quickStatus.closesAt, quickStatus.acceptsUntilMinutes)
    : null;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: { flex: 1, backgroundColor: colors.background },
        content: { paddingBottom: 40 },
        topBar: {
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: PAGE_PADDING, paddingBottom: 8, gap: 12,
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
        metaTextMuted: { fontWeight: '500', color: colors.foregroundSecondary },
        metaDivider: { fontSize: 14, color: colors.foregroundMuted },
        metaPrice: { fontSize: 14, color: colors.foregroundSecondary },
        leaveTableRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
        leaveTableText: { fontSize: 13, fontWeight: '600', color: colors.foregroundSecondary, textDecorationLine: 'underline' },
        actionsRow: { flexDirection: 'row', gap: ACTION_GAP, paddingHorizontal: PAGE_PADDING, marginTop: 22 },
        action: {
          flex: 1, minHeight: 72, alignItems: 'center', justifyContent: 'center', gap: 8,
          borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
        },
        actionLabel: { fontSize: 12, fontWeight: '600', color: colors.foregroundSecondary },
        amenities: {
          flexDirection: 'row', flexWrap: 'wrap', gap: CHIP_GAP,
          paddingHorizontal: PAGE_PADDING, marginTop: 20,
        },
        amenity: {
          flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%',
          paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: colors.backgroundTertiary,
        },
        amenityText: { flexShrink: 1, fontSize: 13, color: colors.foregroundSecondary },
        amenityMoreText: { fontWeight: '700' },
        statusCard: {
          marginHorizontal: PAGE_PADDING, marginTop: 22, padding: 14, borderRadius: 16,
          backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.primaryLight,
        },
        statusHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
        statusTitle: { fontSize: 14, fontWeight: '700', color: colors.foreground },
        statusLink: { marginLeft: 'auto', fontSize: 12, fontWeight: '600', color: colors.primary },
        statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
        statusItem: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
        statusLabel: { fontSize: 13, color: colors.foregroundSecondary },
        statusValue: { fontSize: 13, fontWeight: '700' },
        journeyRow: {
          flexDirection: 'row', flexWrap: 'wrap', gap: ACTION_GAP,
          paddingHorizontal: PAGE_PADDING, marginTop: 22,
        },
        primaryBtn: {
          minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
          marginHorizontal: PAGE_PADDING, marginTop: 22, borderRadius: 18, backgroundColor: colors.primary,
        },
        primaryBtnText: { fontSize: 16, fontWeight: '800', color: colors.primaryForeground },
        quickCard: {
          marginHorizontal: PAGE_PADDING, marginTop: 14, padding: 14, borderRadius: 16, gap: 8,
          backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.primaryLight,
        },
        quickRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        quickRowText: { flex: 1, fontSize: 13, color: colors.foregroundSecondary },
        quickStateText: { flex: 1, fontSize: 13, fontWeight: '700' },
        stepsCard: {
          marginHorizontal: PAGE_PADDING, marginTop: 14, padding: 14, borderRadius: 16, gap: 10,
          backgroundColor: colors.backgroundTertiary,
        },
        stepsTitle: { fontSize: 14, fontWeight: '700', color: colors.foreground },
        stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
        stepNumber: {
          width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
          backgroundColor: colors.primary,
        },
        stepNumberText: { fontSize: 12, fontWeight: '800', color: colors.primaryForeground },
        stepText: { flex: 1, fontSize: 13, color: colors.foregroundSecondary },
        journeyBtn: {
          minHeight: 84, alignItems: 'center', justifyContent: 'center', gap: 8,
          paddingHorizontal: 6, borderRadius: 16, backgroundColor: colors.backgroundTertiary,
        },
        journeyLabel: {
          fontSize: 12, fontWeight: '600', color: colors.foreground, textAlign: 'center',
        },
        sheetBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
        sheet: {
          backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24,
          paddingHorizontal: 20, paddingTop: 12, maxHeight: '75%',
        },
        sheetHandle: {
          alignSelf: 'center', width: 44, height: 4, borderRadius: 2,
          backgroundColor: colors.border, marginBottom: 14,
        },
        sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.foreground, marginBottom: 14 },
        sheetChips: { flexDirection: 'row', flexWrap: 'wrap', gap: CHIP_GAP, paddingBottom: 20 },
        sheetClose: {
          marginTop: 4, paddingVertical: 15, borderRadius: 18, alignItems: 'center',
          backgroundColor: colors.primary,
        },
        sheetCloseText: { fontSize: 15, fontWeight: '700', color: colors.primaryForeground },
      }),
    [colors],
  );

  const waitText = status?.isOpen
    ? status.estimatedWaitMinutes > 0
      ? `~${status.estimatedWaitMinutes} min`
      : 'Sem espera'
    : '—';

  return (
    <>
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
              <Ionicons
                name={rated ? 'star' : 'star-outline'}
                size={15}
                color={rated ? colors.ratingGold : colors.foregroundMuted}
              />
              <Text style={[styles.metaText, !rated && styles.metaTextMuted]}>
                {formatRatingWithCount(restaurant.rating, restaurant.totalReviews)}
              </Text>
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
              <Text style={styles.leaveTableText}>{tableLabel(tableNumber)} · Sair da mesa</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.actionsRow}>
          {RESTAURANT_PAGE_ACTIONS.map((action) => (
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
            {visibleAmenities.map((amenity) => (
              <View key={amenity.key} style={styles.amenity}>
                <Ionicons name={amenity.icon} size={13} color={colors.foregroundMuted} />
                <Text style={styles.amenityText} numberOfLines={1}>{amenity.label}</Text>
              </View>
            ))}
            {hiddenAmenityCount > 0 && (
              <TouchableOpacity
                style={styles.amenity}
                onPress={() => setAllAmenitiesOpen(true)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Ver todas as ${amenities.length} características do restaurante`}
              >
                <Ionicons name="ellipsis-horizontal" size={14} color={colors.foregroundMuted} />
                <Text style={[styles.amenityText, styles.amenityMoreText]}>+{hiddenAmenityCount}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {status && (
          <TouchableOpacity
            style={styles.statusCard}
            onPress={() => setHoursOpen(true)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Ver horários de funcionamento"
          >
            <View style={styles.statusHeader}>
              <Ionicons name="time-outline" size={15} color={colors.primary} />
              <Text style={styles.statusTitle}>Status Agora</Text>
              <Text style={styles.statusLink}>Ver horários</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.primary} />
            </View>
            <View style={styles.statusRow}>
              {showOccupancy && (
                <View style={styles.statusItem}>
                  <Text style={styles.statusLabel}>Lotação:</Text>
                  <Text style={[styles.statusValue, { color: occupancyTone(status) }]}>
                    {status.occupancyPercent == null ? '—' : `${status.occupancyPercent}%`}
                  </Text>
                </View>
              )}
              {showOccupancy && config.estimatedWaitDisplay && (
                <View style={styles.statusItem}>
                  <Text style={styles.statusLabel}>Espera:</Text>
                  <Text style={[styles.statusValue, { color: colors.foreground }]}>{waitText}</Text>
                </View>
              )}
              <Text style={[styles.statusValue, { color: status.isOpen ? colors.success : colors.foregroundMuted }]}>
                {status.isOpen
                  ? (status.closesAt ? `Aberto até ${status.closesAt}` : 'Aberto')
                  : (status.opensAt ? `Fechado · abre às ${status.opensAt}` : 'Fechado')}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {primaryActions.map((action) => (
          <TouchableOpacity
            key={action.key}
            style={styles.primaryBtn}
            onPress={action.onPress}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel={action.label}
          >
            <Ionicons name={action.icon} size={22} color={colors.primaryForeground} />
            <Text style={styles.primaryBtnText}>{action.label}</Text>
          </TouchableOpacity>
        ))}

        {showQuickInfo && (
          <View style={styles.quickCard} accessibilityLabel="Pedido pelo app">
            {quickState && (
              <View style={styles.quickRow}>
                <Ionicons
                  name={quickState.tone === 'ok' ? 'radio-button-on' : 'pause-circle-outline'}
                  size={16}
                  color={quickState.tone === 'ok' ? colors.success : colors.foregroundMuted}
                />
                <Text style={[styles.quickStateText, { color: quickState.tone === 'ok' ? colors.success : colors.foreground }]}>
                  {quickState.label}
                </Text>
              </View>
            )}
            {quickStatus && quickStatus.estimatedPrepMinutes > 0 && (
              <View style={styles.quickRow}>
                <Ionicons name="timer-outline" size={16} color={colors.foregroundMuted} />
                <Text style={styles.quickRowText}>
                  {`Preparo em ~${quickStatus.estimatedPrepMinutes} min`}
                  {quickStatus.ordersInQueue > 0 ? ` · ${quickStatus.ordersInQueue} na fila` : ''}
                </Text>
              </View>
            )}
            {quickStatus?.pickupLocation && (
              <View style={styles.quickRow}>
                <Ionicons name="location-outline" size={16} color={colors.foregroundMuted} />
                <Text style={styles.quickRowText}>{`Retirada: ${quickStatus.pickupLocation}`}</Text>
              </View>
            )}
          </View>
        )}

        {rowActions.length > 0 && (
          <View style={styles.journeyRow}>
            {rowActions.map((action) => (
              <TouchableOpacity
                key={action.key}
                style={[styles.journeyBtn, { width: journeyItemWidth }]}
                onPress={action.onPress}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={action.label}
              >
                <Ionicons name={action.icon} size={25} color={colors.primary} />
                <Text style={styles.journeyLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {showQuickInfo && (
          <View style={styles.stepsCard}>
            <Text style={styles.stepsTitle}>Como funciona</Text>
            {SKIP_THE_LINE_STEPS.map((step, index) => (
              <View key={step.title} style={styles.stepRow}>
                <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{index + 1}</Text></View>
                <Text style={styles.stepText}>{step.title}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <OpeningHoursSheet
        visible={hoursOpen}
        onClose={() => setHoursOpen(false)}
        openingHours={restaurant.openingHours}
      />

      <Modal
        visible={allAmenitiesOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setAllAmenitiesOpen(false)}
      >
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={() => setAllAmenitiesOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Fechar"
          />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>O que este restaurante oferece</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.sheetChips}>
                {amenities.map((amenity) => (
                  <View key={amenity.key} style={styles.amenity}>
                    <Ionicons name={amenity.icon} size={13} color={colors.foregroundMuted} />
                    <Text style={styles.amenityText}>{amenity.label}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
            <TouchableOpacity
              style={styles.sheetClose}
              onPress={() => setAllAmenitiesOpen(false)}
              activeOpacity={0.9}
              accessibilityRole="button"
            >
              <Text style={styles.sheetCloseText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}
