import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Animated,
  TouchableOpacity,
  Pressable,
  Dimensions,
  Alert,
} from 'react-native';
import {
  Text,
  Card,
  ProgressBar,
  IconButton,
  ActivityIndicator,
  Chip,
  Button,
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { gradients } from '@okinawa/shared/theme/colors';
import logger from '@okinawa/shared/utils/logger';
import { t } from '@okinawa/shared/i18n';
import ApiService from '@/shared/services/api';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';

// Types
interface LoyaltyProfile {
  points: number;
  tier: string;
  total_visits: number;
  total_spent: number;
  current_tier: {
    name: string;
    min_points: number;
    max_points: number | null;
    benefits: string[];
    discount_percentage: number;
  };
  next_tier: {
    name: string;
    min_points: number;
  } | null;
  points_to_next_tier: number | null;
}

interface StampCard {
  id: string;
  service_type: string;
  current_stamps: number;
  required_stamps: number;
  reward_description: string;
  completed: boolean;
  completed_cycles: number;
}

interface PromotionPreview {
  id: string;
  code: string;
  title: string;
  type: string;
  discount_value: number | null;
  valid_until: string;
}

// Note: Tier colors represent real-world medal colors and are intentionally static
// Using theme gradient tokens where applicable
const getTIER_GRADIENTS = (colors: any): Record<string, string[]> => ({
  bronze: [colors.tierBronze, colors.tierBronze],
  silver: [colors.tierSilver, colors.tierSilver],
  gold: gradients.accent,
  platinum: [colors.tierPlatinum, colors.tierPlatinum],
});

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const STAMP_CARD_WIDTH = SCREEN_WIDTH * 0.7;

// Skeleton Components
const SkeletonBlock = ({ width, height, colors }: { width: number | string; height: number; colors: any }) => (
  <View
    style={{
      width: typeof width === 'string' ? undefined : width,
      flex: typeof width === 'string' ? 1 : undefined,
      height,
      backgroundColor: colors.backgroundTertiary,
      borderRadius: 16,
      marginBottom: 12,
    }}
  />
);

const SkeletonLoader = ({ colors }: { colors: any }) => (
  <ScrollView style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
    <SkeletonBlock width="100%" height={180} colors={colors} />
    <SkeletonBlock width="60%" height={20} colors={colors} />
    <SkeletonBlock width="100%" height={100} colors={colors} />
    <SkeletonBlock width="40%" height={20} colors={colors} />
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <SkeletonBlock width={STAMP_CARD_WIDTH} height={120} colors={colors} />
      <SkeletonBlock width={STAMP_CARD_WIDTH} height={120} colors={colors} />
    </View>
  </ScrollView>
);

// Stamp dots component
const StampDots = ({
  total,
  filled,
  colors,
}: {
  total: number;
  filled: number;
  colors: any;
}) => (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
    {Array.from({ length: total }, (_, i) => (
      <View
        key={i}
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: i < filled ? colors.primary : colors.backgroundTertiary,
          borderWidth: 1,
          borderColor: i < filled ? colors.primary : colors.border,
        }}
      />
    ))}
  </View>
);

export default function LoyaltyHomeScreen() {
  const colors = useColors();
  const TIER_GRADIENTS = getTIER_GRADIENTS(colors);
  const navigation = useNavigation();

  // State
  const [profile, setProfile] = useState<LoyaltyProfile | null>(null);
  const [stampCards, setStampCards] = useState<StampCard[]>([]);
  const [promotions, setPromotions] = useState<PromotionPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Animated progress bar
  const progressAnim = useMemo(() => new Animated.Value(0), []);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      // Fetch loyalty profile
      const profileData = await ApiService.get('/loyalty/profile', {
        params: { restaurant_id: 'current' },
      });
      setProfile(profileData.data);

      // Fetch stamp cards
      try {
        const stampData = await ApiService.get('/loyalty/stamp-cards/current');
        setStampCards(stampData.data || []);
      } catch {
        setStampCards([]);
      }

      // Fetch active promotions preview
      try {
        const promoData = await ApiService.get('/promotions/current');
        setPromotions((promoData.data || []).slice(0, 3));
      } catch {
        setPromotions([]);
      }
    } catch (err: any) {
      logger.error('Error fetching loyalty data:', err);
      setError(err?.message || 'Failed to load data');
      // Set default profile for demo
      setProfile({
        points: 1269,
        tier: 'gold',
        total_visits: 47,
        total_spent: 2400,
        current_tier: {
          name: 'gold',
          min_points: 2000,
          max_points: 4999,
          benefits: ['10% desconto', 'Eventos exclusivos'],
          discount_percentage: 10,
        },
        next_tier: {
          name: 'platinum',
          min_points: 5000,
        },
        points_to_next_tier: 3731,
      });
      setStampCards([
        {
          id: '1',
          service_type: 'dine-in',
          current_stamps: 7,
          required_stamps: 10,
          reward_description: 'Sobremesa grátis',
          completed: false,
          completed_cycles: 2,
        },
        {
          id: '2',
          service_type: 'delivery',
          current_stamps: 3,
          required_stamps: 10,
          reward_description: 'Frete grátis',
          completed: false,
          completed_cycles: 0,
        },
      ]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Animate progress bar when profile loads
  useEffect(() => {
    if (profile && profile.next_tier) {
      const tierRange = profile.next_tier.min_points - profile.current_tier.min_points;
      const progress = tierRange > 0
        ? (profile.points - profile.current_tier.min_points) / tierRange
        : 1;

      Animated.timing(progressAnim, {
        toValue: Math.min(Math.max(progress, 0), 1),
        duration: 1000,
        useNativeDriver: false,
      }).start();
    } else if (profile) {
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: false,
      }).start();
    }
  }, [profile, progressAnim]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const handleNavigateHistory = useCallback(() => {
    navigation.navigate('LoyaltyHistory' as never);
  }, [navigation]);

  const handleNavigateStampCards = useCallback(() => {
    navigation.navigate('StampCards' as never);
  }, [navigation]);

  const getServiceTypeLabel = useCallback((type: string): string => {
    switch (type) {
      case 'dine-in':
        return t('loyalty.stamps.dineIn');
      case 'delivery':
        return t('loyalty.stamps.delivery');
      case 'takeout':
        return t('loyalty.stamps.takeout');
      default:
        return type;
    }
  }, []);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        heroCard: {
          margin: 16,
          borderRadius: 20,
          overflow: 'hidden',
        },
        heroContent: {
          padding: 24,
          alignItems: 'center',
        },
        heroPoints: {
          fontSize: 48,
          fontWeight: 'bold',
          color: colors.primaryForeground,
        },
        heroLabel: {
          fontSize: 16,
          color: colors.glassStrong,
          marginTop: 4,
        },
        tierBadge: {
          flexDirection: 'row',
          alignItems: 'center',
          marginTop: 12,
          paddingHorizontal: 16,
          paddingVertical: 6,
          borderRadius: 20,
          backgroundColor: colors.glassBorder,
        },
        tierBadgeText: {
          fontSize: 14,
          fontWeight: '600',
          color: colors.primaryForeground,
          marginLeft: 4,
        },
        progressSection: {
          margin: 16,
          marginTop: 0,
        },
        progressLabel: {
          fontSize: 14,
          color: colors.foregroundSecondary,
          marginBottom: 8,
        },
        progressBar: {
          height: 10,
          borderRadius: 5,
        },
        tierRow: {
          flexDirection: 'row',
          justifyContent: 'space-around',
          marginTop: 12,
        },
        tierItem: {
          alignItems: 'center',
          opacity: 0.5,
        },
        tierItemActive: {
          alignItems: 'center',
          opacity: 1,
        },
        tierItemText: {
          fontSize: 12,
          color: colors.foregroundSecondary,
          marginTop: 4,
        },
        tierItemTextActive: {
          fontSize: 12,
          color: colors.primary,
          fontWeight: '600',
          marginTop: 4,
        },
        sectionHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 16,
          marginTop: 16,
          marginBottom: 8,
        },
        sectionTitle: {
          fontSize: 18,
          fontWeight: '600',
          color: colors.foreground,
        },
        seeAll: {
          fontSize: 14,
          color: colors.primary,
        },
        stampCardsScroll: {
          paddingLeft: 16,
          paddingRight: 8,
        },
        stampCard: {
          width: STAMP_CARD_WIDTH,
          marginRight: 12,
          borderRadius: 20,
          backgroundColor: colors.card,
          padding: 16,
          borderWidth: 1,
          borderColor: colors.border,
        },
        stampCardTitle: {
          fontSize: 16,
          fontWeight: '600',
          color: colors.foreground,
        },
        stampCardCounter: {
          fontSize: 14,
          color: colors.foregroundSecondary,
          marginTop: 4,
        },
        stampCardReward: {
          fontSize: 12,
          color: colors.primary,
          marginTop: 8,
          fontStyle: 'italic',
        },
        promoCard: {
          marginHorizontal: 16,
          marginBottom: 8,
          backgroundColor: colors.card,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: colors.border,
        },
        promoRow: {
          flexDirection: 'row',
          alignItems: 'center',
          padding: 12,
        },
        promoCode: {
          fontFamily: 'monospace',
          fontSize: 14,
          fontWeight: '700',
          color: colors.primary,
          backgroundColor: colors.backgroundTertiary,
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 4,
          overflow: 'hidden',
        },
        promoTitle: {
          flex: 1,
          fontSize: 14,
          color: colors.foreground,
          marginLeft: 12,
        },
        promoValidity: {
          fontSize: 12,
          color: colors.foregroundMuted,
        },
        quickActions: {
          flexDirection: 'row',
          justifyContent: 'space-around',
          paddingHorizontal: 16,
          paddingVertical: 16,
          marginTop: 8,
        },
        quickAction: {
          alignItems: 'center',
          flex: 1,
        },
        quickActionIcon: {
          width: 48,
          height: 48,
          borderRadius: 16,
          backgroundColor: `${colors.primary}1A`,
          justifyContent: 'center',
          alignItems: 'center',
        },
        quickActionLabel: {
          fontSize: 12,
          color: colors.foregroundSecondary,
          marginTop: 6,
          textAlign: 'center',
        },
        completedBadge: {
          position: 'absolute',
          top: 8,
          right: 8,
          backgroundColor: colors.successBackground,
          borderRadius: 9999,
          paddingHorizontal: 10,
          paddingVertical: 4,
        },
        completedBadgeText: {
          fontSize: 12,
          fontWeight: '700',
          color: colors.success,
        },
      }),
    [colors],
  );

  if (loading) {
    return (<ScreenContainer><SkeletonLoader colors={colors} /></ScreenContainer>);
  }

  if (!profile) {
    return (
      <ScreenContainer>
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
        <IconButton icon="star-outline" size={64} iconColor={colors.foregroundMuted} />
        <Text variant="titleMedium" style={{ color: colors.foreground, marginTop: 12, textAlign: 'center' }}>
          {t('loyalty.detail.emptyTitle')}
        </Text>
        <Text variant="bodyMedium" style={{ color: colors.foregroundMuted, marginTop: 8, textAlign: 'center' }}>
          {t('loyalty.detail.emptyMessage')}
        </Text>
      </View>
    
      </ScreenContainer>
    );
  }

  const tierGradient = TIER_GRADIENTS[profile.tier] || TIER_GRADIENTS.bronze;
  const tierName = t(`loyalty.tiers.${profile.tier}`) || profile.tier;
  const tiers = ['bronze', 'silver', 'gold', 'platinum'];

  return (
    <ScreenContainer>
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      {/* Hero Card — Points + Tier with LinearGradient */}
      <View style={styles.heroCard}>
        <LinearGradient
          colors={tierGradient as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.heroContent}>
            <Text style={styles.heroPoints}>
              {profile.points.toLocaleString('pt-BR')}
            </Text>
            <Text style={styles.heroLabel}>{t('loyalty.home.points')}</Text>
            <View style={styles.tierBadge}>
              <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: colors.glassBorder, alignItems: 'center', justifyContent: 'center' }}>
                <IconButton icon="crown" size={14} iconColor={colors.primaryForeground} style={{ margin: 0 }} />
              </View>
              <Text style={styles.tierBadgeText}>{tierName}</Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* Tier Progress */}
      <View style={styles.progressSection}>
        <Text style={styles.progressLabel}>
          {profile.next_tier
            ? t('loyalty.home.pointsToNext', {
                points: profile.points_to_next_tier?.toString() || '0',
                tier: t(`loyalty.tiers.${profile.next_tier.name}`),
              })
            : t('loyalty.home.reachedMax')}
        </Text>
        <ProgressBar
          progress={profile.next_tier ? 0 : 1}
          color={colors.primary}
          style={styles.progressBar}
        />

        {/* Tier indicators */}
        <View style={styles.tierRow}>
          {tiers.map((tierKey) => {
            const isActive = tierKey === profile.tier;
            return (
              <View
                key={tierKey}
                style={isActive ? styles.tierItemActive : styles.tierItem}
              >
                <View style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  backgroundColor: isActive ? `${colors.primary}1A` : colors.backgroundTertiary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <IconButton
                    icon={isActive ? 'shield-check' : 'shield-outline'}
                    size={18}
                    iconColor={
                      isActive ? colors.primary : colors.foregroundMuted
                    }
                    style={{ margin: 0 }}
                  />
                </View>
                <Text style={isActive ? styles.tierItemTextActive : styles.tierItemText}>
                  {t(`loyalty.tiers.${tierKey}`)}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Stamp Cards Section */}
      {stampCards.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {t('loyalty.home.stampCards')}
            </Text>
            <TouchableOpacity
              onPress={handleNavigateStampCards}
              accessibilityLabel={t('loyalty.home.stampCards')}
              accessibilityRole="button"
            >
              <Text style={styles.seeAll}>{t('loyalty.loadMore')}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.stampCardsScroll}
          >
            {stampCards.map((card) => (
              <View key={card.id} style={styles.stampCard}>
                {card.completed && (
                  <View style={styles.completedBadge}>
                    <Text style={styles.completedBadgeText}>
                      {t('loyalty.stamps.completed')}
                    </Text>
                  </View>
                )}
                <Text style={styles.stampCardTitle}>
                  {getServiceTypeLabel(card.service_type)}
                </Text>
                <Text style={styles.stampCardCounter}>
                  {t('loyalty.stamps.earned', {
                    count: card.current_stamps.toString(),
                  })}{' '}
                  {t('loyalty.stamps.required', {
                    count: card.required_stamps.toString(),
                  })}
                </Text>
                <StampDots
                  total={card.required_stamps}
                  filled={card.current_stamps}
                  colors={colors}
                />
                {card.reward_description ? (
                  <Text style={styles.stampCardReward}>
                    {t('loyalty.stamps.reward')}: {card.reward_description}
                  </Text>
                ) : null}
              </View>
            ))}
          </ScrollView>
        </>
      )}

      {/* Active Promotions */}
      {promotions.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {t('loyalty.home.promotions')}
            </Text>
          </View>
          {promotions.map((promo) => (
            <View key={promo.id} style={styles.promoCard}>
              <View style={styles.promoRow}>
                <Text style={styles.promoCode}>{promo.code}</Text>
                <Text style={styles.promoTitle} numberOfLines={1}>
                  {promo.title}
                </Text>
                <Text style={styles.promoValidity}>
                  {t('promotions.validUntil', {
                    date: new Date(promo.valid_until).toLocaleDateString('pt-BR'),
                  })}
                </Text>
              </View>
            </View>
          ))}
        </>
      )}

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.quickAction}
          onPress={handleNavigateHistory}
          accessibilityLabel={t('loyalty.home.viewHistory')}
          accessibilityRole="button"
        >
          <View style={styles.quickActionIcon}>
            <IconButton icon="history" size={24} iconColor={colors.primary} style={{ margin: 0 }} />
          </View>
          <Text style={styles.quickActionLabel}>
            {t('loyalty.home.viewHistory')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.quickAction}
          onPress={() => navigation.navigate('Coupons' as never)}
          accessibilityLabel={t('loyalty.home.myCoupons')}
          accessibilityRole="button"
        >
          <View style={styles.quickActionIcon}>
            <IconButton icon="ticket-percent" size={24} iconColor={colors.primary} style={{ margin: 0 }} />
          </View>
          <Text style={styles.quickActionLabel}>
            {t('loyalty.home.myCoupons')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.quickAction}
          onPress={() => Alert.alert(
            t('loyalty.home.programRules'),
            t('loyalty.home.programRulesDescription'),
            [{ text: t('common.ok') }],
          )}
          accessibilityLabel={t('loyalty.home.programRules')}
          accessibilityRole="button"
        >
          <View style={styles.quickActionIcon}>
            <IconButton icon="information-outline" size={24} iconColor={colors.primary} style={{ margin: 0 }} />
          </View>
          <Text style={styles.quickActionLabel}>
            {t('loyalty.home.programRules')}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  
    </ScreenContainer>
  );
}
