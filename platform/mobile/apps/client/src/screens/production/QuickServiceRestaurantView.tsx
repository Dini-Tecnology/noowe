/* Hallmark · pre-emit critique: P5 H5 E4 S4 R4 V5 */
/* Hallmark · macrostructure: Long Document · tone: warm utilitarian · anchor hue: orange */
import React, { useMemo } from 'react';
import { Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import customerBackend, { type CustomerRestaurant, type RestaurantLiveStatus } from '../../services/customer-backend';
import { SKIP_THE_LINE_STEPS } from './quick-service-ui';
import { money } from './shared';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80';

const HEADER_GRADIENT = ['#FF5724', '#F97316', '#F59E0B'] as const;

export interface QuickServiceRestaurantViewProps {
  restaurant: CustomerRestaurant;
  status: RestaurantLiveStatus | null | undefined;
  distanceLabel: string | null;
  hoursLabel: string | null;
  refreshControl: React.ReactElement<any>;
  onBack: () => void;
  onSkipTheLine: () => void;
  onOrderOnSite: () => void;
}

/**
 * The quick_service restaurant page: unlike casual/fine dining, the decision
 * here is "how fast can I get my food", not "which table/reservation". It
 * leads with the live queue and the Skip the Line explainer instead of a
 * hero photo + amenity chips.
 */
export default function QuickServiceRestaurantView({
  restaurant,
  status,
  distanceLabel,
  hoursLabel,
  refreshControl,
  onBack,
  onSkipTheLine,
  onOrderOnSite,
}: QuickServiceRestaurantViewProps) {
  const colors = useColors();

  const menu = useQuery({
    queryKey: ['menu', restaurant.id],
    queryFn: () => customerBackend.getMenu(restaurant.id),
  });

  // "Combos em destaque" surfaces the items the restaurant flagged as
  // popular — there's no discount/original-price field on menu items yet,
  // so this stays an honest "featured" rail rather than fabricating a % off.
  const featuredItems = useMemo(
    () => (menu.data?.items ?? []).filter((item) => item.isPopular).slice(0, 8),
    [menu.data],
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: { flex: 1, backgroundColor: colors.background },
        content: { paddingBottom: 40 },
        gradientHeader: { paddingTop: 8, paddingBottom: 20, paddingHorizontal: 16 },
        topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
        backBtn: {
          width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(255,255,255,0.20)',
        },
        headerTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF', flex: 1, textAlign: 'center', marginHorizontal: 8 },
        identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
        logoBox: {
          width: 64, height: 64, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.16)',
          alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        },
        logo: { width: '100%', height: '100%' },
        name: { fontSize: 21, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.4 },
        metaText: { fontSize: 13, color: 'rgba(255,255,255,0.9)', marginTop: 4 },
        body: { paddingHorizontal: 16, marginTop: -8, gap: 16 },
        queueCard: {
          backgroundColor: colors.card, borderRadius: 18, padding: 16,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
        },
        queueLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        queueDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
        queueTitle: { fontSize: 15, fontWeight: '700', color: colors.foreground },
        queueSub: { fontSize: 12, color: colors.foregroundSecondary, marginTop: 2 },
        queueWait: { fontSize: 12, color: colors.foregroundSecondary },
        stlCard: {
          borderRadius: 18, padding: 16, gap: 12,
          backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.primaryLight,
        },
        stlTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        stlTitleText: { fontSize: 15, fontWeight: '700', color: colors.primary },
        stlStep: { flexDirection: 'row', alignItems: 'center', gap: 10 },
        stlStepBadge: {
          width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary,
          alignItems: 'center', justifyContent: 'center',
        },
        stlStepBadgeText: { fontSize: 11, fontWeight: '700', color: colors.primaryForeground },
        stlStepText: { flex: 1, fontSize: 13, color: colors.foreground },
        sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.foreground },
        comboCard: {
          width: 150, borderRadius: 16, backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border, overflow: 'hidden',
        },
        comboImage: { width: '100%', height: 90, backgroundColor: colors.backgroundTertiary },
        comboBody: { padding: 10, gap: 4 },
        comboName: { fontSize: 13, fontWeight: '700', color: colors.foreground },
        comboPrice: { fontSize: 14, fontWeight: '800', color: colors.primary },
        ctaBar: { flexDirection: 'row', gap: 10 },
        ctaPrimary: {
          flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          paddingVertical: 16, borderRadius: 16, backgroundColor: colors.primary,
        },
        ctaPrimaryText: { fontSize: 15, fontWeight: '700', color: colors.primaryForeground },
        ctaSecondary: {
          flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          paddingVertical: 16, borderRadius: 16, backgroundColor: colors.card,
          borderWidth: 1.5, borderColor: colors.border,
        },
        ctaSecondaryText: { fontSize: 15, fontWeight: '700', color: colors.foreground },
      }),
    [colors],
  );

  const waitText = status?.isOpen
    ? status.estimatedWaitMinutes > 0
      ? `~${status.estimatedWaitMinutes} min de espera`
      : 'Sem espera'
    : 'Fechado agora';

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={refreshControl}
      alwaysBounceVertical
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient colors={HEADER_GRADIENT as unknown as [string, string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradientHeader}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={onBack} accessibilityRole="button" accessibilityLabel="Voltar">
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{restaurant.name}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.identity}>
          <View style={styles.logoBox}>
            <Image source={{ uri: restaurant.logoUrl || restaurant.bannerUrl || FALLBACK_IMAGE }} style={styles.logo} resizeMode="cover" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{restaurant.name}</Text>
            <Text style={styles.metaText}>
              {[restaurant.cuisineTypes[0] ?? 'Fast Food Premium', distanceLabel, hoursLabel]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <Text style={styles.metaText}>★ {restaurant.rating.toFixed(1)} ({restaurant.totalReviews})</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.body}>
        <View style={styles.queueCard}>
          <View style={styles.queueLeft}>
            <View style={styles.queueDot} />
            <View>
              <Text style={styles.queueTitle}>Fila rápida</Text>
              <Text style={styles.queueSub}>
                {status && status.groupsWaiting > 0
                  ? `${status.groupsWaiting} pedidos na fila`
                  : 'Sem pedidos na fila agora'}
              </Text>
            </View>
          </View>
          <Text style={styles.queueWait}>{waitText}</Text>
        </View>

        <View style={styles.stlCard}>
          <View style={styles.stlTitle}>
            <Ionicons name="flash" size={16} color={colors.primary} />
            <Text style={styles.stlTitleText}>Como funciona o Skip the Line</Text>
          </View>
          {SKIP_THE_LINE_STEPS.map((step, index) => (
            <View key={step.title} style={styles.stlStep}>
              <View style={styles.stlStepBadge}>
                <Text style={styles.stlStepBadgeText}>{index + 1}</Text>
              </View>
              <Text style={styles.stlStepText}>{step.title}</Text>
            </View>
          ))}
        </View>

        {featuredItems.length > 0 && (
          <View style={{ gap: 12 }}>
            <Text style={styles.sectionTitle}>Combos em destaque</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {featuredItems.map((item) => (
                <View key={item.id} style={styles.comboCard}>
                  <Image
                    source={{ uri: item.imageUrl || FALLBACK_IMAGE }}
                    style={styles.comboImage}
                    resizeMode="cover"
                  />
                  <View style={styles.comboBody}>
                    <Text style={styles.comboName} numberOfLines={2}>{item.name}</Text>
                    <Text style={styles.comboPrice}>{money(item.price)}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.ctaBar}>
          <TouchableOpacity style={styles.ctaPrimary} onPress={onSkipTheLine} activeOpacity={0.9} accessibilityRole="button">
            <Ionicons name="flash" size={18} color={colors.primaryForeground} />
            <Text style={styles.ctaPrimaryText}>Skip the Line</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ctaSecondary} onPress={onOrderOnSite} activeOpacity={0.85} accessibilityRole="button">
            <Ionicons name="storefront-outline" size={18} color={colors.foreground} />
            <Text style={styles.ctaSecondaryText}>Pedir no Local</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}
