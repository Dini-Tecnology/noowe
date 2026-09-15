/* Hallmark · pre-emit critique: P5 H4 E4 S5 R3 V5 */
/* Hallmark · macrostructure: Photographic · tone: warm utilitarian · anchor hue: orange */
import React, { useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useMutation, useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import customerBackend from '../../services/customer-backend';

type RouteParams = { orderId: string; restaurantId?: string };

// No `required_stamps`/`reward_description` field is exposed on
// CustomerLoyalty yet — this mirrors the stamp-card visual from
// StampCardsScreen with a fixed 10-visit cycle rather than wiring in the
// separate stamp_cards table read by the legacy ApiService.
const STAMP_CYCLE = 10;

export default function QuickServiceRatingScreen() {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const colors = useColors();
  const { orderId, restaurantId } = (route.params ?? {}) as RouteParams;
  const [rating, setRating] = useState(0);

  const loyalty = useQuery({
    queryKey: ['loyalty'],
    queryFn: () => customerBackend.listLoyalty(),
    enabled: !!restaurantId,
  });
  const restaurantLoyalty = loyalty.data?.find((entry) => entry.restaurantId === restaurantId);
  const stampsFilled = restaurantLoyalty ? restaurantLoyalty.totalVisits % STAMP_CYCLE : 0;

  const review = useMutation({
    mutationFn: (value: number) =>
      customerBackend.createReview({ orderId, restaurantId: restaurantId ?? '', rating: value }),
  });

  const goHome = () => navigation.reset({ index: 0, routes: [{ name: 'Main', params: { screen: 'Home' } }] });
  const openWallet = () => navigation.navigate('Main', { screen: 'Wallet' });

  const rate = (value: number) => {
    setRating(value);
    if (restaurantId) review.mutate(value);
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 8 },
        skipText: { fontSize: 14, fontWeight: '600', color: colors.foregroundSecondary },
        body: { flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: 16 },
        iconBox: {
          width: 72, height: 72, borderRadius: 20, backgroundColor: colors.backgroundSecondary,
          alignItems: 'center', justifyContent: 'center', marginBottom: 16,
        },
        title: { fontSize: 20, fontWeight: '800', color: colors.foreground, marginBottom: 4, textAlign: 'center' },
        subtitle: { fontSize: 14, color: colors.foregroundSecondary, marginBottom: 24 },
        starsRow: { flexDirection: 'row', gap: 10, marginBottom: 32 },
        starBtn: {
          width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
          backgroundColor: colors.backgroundTertiary,
        },
        loyaltyCard: {
          width: '100%', backgroundColor: colors.card, borderRadius: 18, padding: 18, marginBottom: 24,
          borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
        },
        loyaltyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
        loyaltyTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        loyaltyTitleText: { fontSize: 14, fontWeight: '700', color: colors.foreground },
        stampsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
        stamp: {
          width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
        },
        stampFilled: { backgroundColor: colors.primary },
        stampEmpty: { backgroundColor: colors.backgroundTertiary },
        loyaltySub: { fontSize: 12, color: colors.foregroundSecondary },
        primaryCta: { width: '100%', paddingVertical: 16, borderRadius: 18, alignItems: 'center', backgroundColor: colors.primary },
        primaryCtaText: { fontSize: 16, fontWeight: '700', color: colors.primaryForeground },
        secondaryCta: {
          width: '100%', paddingVertical: 15, borderRadius: 18, alignItems: 'center', marginTop: 10,
          borderWidth: 1.5, borderColor: colors.border,
        },
        secondaryCtaText: { fontSize: 15, fontWeight: '700', color: colors.foreground },
      }),
    [colors],
  );

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goHome} accessibilityRole="button" accessibilityLabel="Pular avaliação">
          <Text style={styles.skipText}>Pular</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <View style={styles.iconBox}>
          <Ionicons name="flash" size={32} color={colors.primary} />
        </View>
        <Text style={styles.title}>Como foi sua experiência?</Text>
        <Text style={styles.subtitle}>Quick Service</Text>

        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((value) => (
            <TouchableOpacity
              key={value}
              style={styles.starBtn}
              onPress={() => rate(value)}
              accessibilityRole="button"
              accessibilityLabel={`${value} estrela${value > 1 ? 's' : ''}`}
              accessibilityState={{ selected: rating >= value }}
            >
              <Ionicons
                name={rating >= value ? 'star' : 'star-outline'}
                size={26}
                color={rating >= value ? colors.ratingGold : colors.foregroundMuted}
              />
            </TouchableOpacity>
          ))}
        </View>

        {restaurantLoyalty && (
          <View style={styles.loyaltyCard}>
            <View style={styles.loyaltyHeader}>
              <View style={styles.loyaltyTitle}>
                <Ionicons name="gift-outline" size={18} color={colors.primary} />
                <Text style={styles.loyaltyTitleText}>Cartão Fidelidade</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.foregroundMuted} />
            </View>
            <View style={styles.stampsRow}>
              {Array.from({ length: STAMP_CYCLE }, (_, index) => (
                <View key={index} style={[styles.stamp, index < stampsFilled ? styles.stampFilled : styles.stampEmpty]}>
                  {index < stampsFilled && <Ionicons name="checkmark" size={14} color={colors.primaryForeground} />}
                </View>
              ))}
            </View>
            <Text style={styles.loyaltySub}>
              {stampsFilled} de {STAMP_CYCLE} visitas · Mais {Math.max(0, STAMP_CYCLE - stampsFilled)} e ganhe um combo grátis!
            </Text>
          </View>
        )}

        <TouchableOpacity style={styles.primaryCta} onPress={goHome} activeOpacity={0.9} accessibilityRole="button">
          <Text style={styles.primaryCtaText}>Voltar ao Início</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryCta} onPress={openWallet} activeOpacity={0.85} accessibilityRole="button">
          <Text style={styles.secondaryCtaText}>Ver Carteira</Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}
