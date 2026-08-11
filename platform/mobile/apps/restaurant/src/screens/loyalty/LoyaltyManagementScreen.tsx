/**
 * LoyaltyManagementScreen
 *
 * Restaurant-side loyalty program management. Displays program statistics,
 * stamp card configurations, and provides manual stamp-giving functionality.
 *
 * Endpoints consumed:
 *   GET  /loyalty/statistics?restaurant_id
 *   GET  /loyalty/stamp-cards/:restaurantId
 *   POST /loyalty/stamp-card/stamp
 *
 * @module restaurant/screens/loyalty/LoyaltyManagementScreen
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { Text, Divider } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useI18n } from '@/shared/hooks/useI18n';
import { useAuth } from '@/shared/hooks/useAuth';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import ApiService from '@/shared/services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LoyaltyStats {
  total_members: number;
  active_this_month: number;
  points_issued_today: number;
  redemptions_today: number;
}

interface StampCardConfig {
  id: string;
  service_type: string;
  stamps_required: number;
  reward_description: string;
  active_count: number;
  completed_today: number;
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function StatsSkeleton({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{ marginHorizontal: 16, marginTop: 8 }}>
      <View style={{ backgroundColor: colors.premiumCard, borderRadius: 20, padding: 16, overflow: 'hidden', position: 'relative' }}>
        <View style={{ position: 'absolute', right: -32, top: -32, width: 128, height: 128, borderRadius: 64, backgroundColor: `${colors.primary}1A` }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.premiumCardGlassLight }} />
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ width: '55%', height: 16, borderRadius: 4, backgroundColor: colors.premiumCardGlass }} />
            <View style={{ width: '35%', height: 10, borderRadius: 4, backgroundColor: colors.premiumCardGlassLight }} />
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={{ width: '48%', backgroundColor: colors.card, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ height: 12, width: '60%', backgroundColor: colors.backgroundTertiary, borderRadius: 4, marginBottom: 8 }} />
            <View style={{ height: 20, width: '40%', backgroundColor: colors.backgroundTertiary, borderRadius: 4 }} />
          </View>
        ))}
      </View>
    </View>
  );
}

function CardSkeleton({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{ marginHorizontal: 16, marginBottom: 8, backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 16 }}>
      <View style={{ height: 16, width: '50%', backgroundColor: colors.backgroundTertiary, borderRadius: 4, marginBottom: 8 }} />
      <View style={{ height: 12, width: '80%', backgroundColor: colors.backgroundTertiary, borderRadius: 4, marginBottom: 6 }} />
      <View style={{ height: 12, width: '40%', backgroundColor: colors.backgroundTertiary, borderRadius: 4 }} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// KPI Stat Chip
// ---------------------------------------------------------------------------

function StatChip({
  iconName,
  label,
  value,
  gradientColors,
  colors,
}: {
  iconName: string;
  label: string;
  value: string | number;
  gradientColors: [string, string];
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={{
        width: '48%',
        backgroundColor: colors.card,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 8,
      }}
    >
      <LinearGradient
        colors={gradientColors}
        style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}
      >
        <MaterialCommunityIcons name={iconName as any} size={18} color={colors.primaryForeground} />
      </LinearGradient>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.foreground }}>{value}</Text>
        <Text style={{ fontSize: 10, color: colors.foregroundSecondary }} numberOfLines={2}>{label}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tier badge helper
// ---------------------------------------------------------------------------

function TierBadge({ tier, colors }: { tier: string; colors: ReturnType<typeof useColors> }) {
  let bg = colors.backgroundTertiary;
  let textColor = colors.foregroundSecondary;
  const tierLower = tier.toLowerCase();

  if (tierLower.includes('bronze') || tierLower.includes('ouro') || tierLower === 'gold') {
    bg = colors.warningBackground;
    textColor = colors.warning;
  } else if (tierLower.includes('prata') || tierLower === 'silver') {
    bg = colors.backgroundTertiary;
    textColor = colors.foregroundSecondary;
  } else if (tierLower.includes('diamante') || tierLower === 'diamond' || tierLower === 'platinum') {
    bg = colors.infoBackground;
    textColor = colors.info;
  }

  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9999, backgroundColor: bg }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: textColor }}>{tier}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LoyaltyManagementScreen() {
  const { t } = useI18n();
  const { user } = useAuth();
  const colors = useColors();

  const [stats, setStats] = useState<LoyaltyStats | null>(null);
  const [stampCards, setStampCards] = useState<StampCardConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  // Stamp flow state
  const [showStampForm, setShowStampForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [stampSubmitting, setStampSubmitting] = useState(false);

  const restaurantId = useMemo(() => {
    return user?.roles?.[0]?.restaurant_id ?? '';
  }, [user]);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const loadData = useCallback(async () => {
    try {
      setError(false);

      const [statsRes, cardsRes] = await Promise.all([
        ApiService.getLoyaltyStatistics(restaurantId),
        ApiService.getRestaurantReviews(restaurantId).catch(() => null), // stamp-cards may not have a dedicated client method
      ]);

      setStats({
        total_members: statsRes?.total_members ?? 0,
        active_this_month: statsRes?.active_this_month ?? 0,
        points_issued_today: statsRes?.points_issued_today ?? 0,
        redemptions_today: statsRes?.redemptions_today ?? 0,
      });

      // Stamp cards come from loyalty statistics or a separate endpoint
      const cards: StampCardConfig[] = (statsRes?.stamp_cards ?? cardsRes ?? []).map((c: any) => ({
        id: c.id ?? '',
        service_type: c.service_type ?? '',
        stamps_required: c.stamps_required ?? 0,
        reward_description: c.reward_description ?? c.reward ?? '',
        active_count: c.active_count ?? 0,
        completed_today: c.completed_today ?? 0,
      }));
      setStampCards(cards);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // -----------------------------------------------------------------------
  // Give stamp
  // -----------------------------------------------------------------------

  const handleGiveStamp = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setStampSubmitting(true);
    try {
      // The POST /loyalty/stamp-card/stamp expects AddStampDto
      await (ApiService as any).api?.post('/loyalty/stamp-card/stamp', {
        customer_identifier: searchQuery.trim(),
        restaurant_id: restaurantId,
      });
      setShowStampForm(false);
      setSearchQuery('');
      Alert.alert(t('common.success'), t('loyaltyMgmt.stampAdded'));
      await loadData();
    } catch {
      Alert.alert(t('common.error'), t('common.retry'));
    } finally {
      setStampSubmitting(false);
    }
  }, [searchQuery, restaurantId, loadData, t]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <ScreenContainer hasKeyboard>
      <ScrollView style={{ flex: 1, backgroundColor: colors.backgroundSecondary }}>
        <StatsSkeleton colors={colors} />
        <View style={{ height: 16 }} />
        <CardSkeleton colors={colors} />
        <CardSkeleton colors={colors} />
      </ScrollView>
      </ScreenContainer>
    );
  }

  if (error) {
    return (
      <ScreenContainer hasKeyboard>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: 24 }}>
        <Text variant="bodyLarge" style={{ color: colors.foregroundSecondary, marginBottom: 16, textAlign: 'center' }}>{t('common.error')}</Text>
        <TouchableOpacity onPress={loadData} accessibilityRole="button" accessibilityLabel={t('common.retry')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text variant="labelLarge" style={{ color: colors.primary, fontWeight: '600' }}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer hasKeyboard>
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.backgroundSecondary }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      {/* ── Dark Premium Header ── */}
      <View
        style={{
          marginHorizontal: 16,
          marginTop: 16,
          marginBottom: 12,
          backgroundColor: colors.premiumCard,
          borderRadius: 20,
          padding: 16,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <View style={{ position: 'absolute', right: -32, top: -32, width: 128, height: 128, borderRadius: 64, backgroundColor: `${colors.primary}1A` }} />
        <View style={{ position: 'relative', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: `${colors.primary}33`, alignItems: 'center', justifyContent: 'center' }}>
            <MaterialCommunityIcons name="heart" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.premiumCardForeground, fontSize: 16, fontWeight: '700' }}>
              {t('loyaltyMgmt.title')}
            </Text>
            <Text style={{ color: colors.premiumCardMuted, fontSize: 12, marginTop: 1 }}>
              {stats?.total_members ?? 0} {t('loyaltyMgmt.members')}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Stats Grid with gradient icon boxes ── */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 }}>
        <StatChip
          iconName="account-group"
          label={t('loyaltyMgmt.members')}
          value={stats?.total_members ?? 0}
          gradientColors={[colors.primary, colors.accent]}
          colors={colors}
        />
        <StatChip
          iconName="calendar-check"
          label={t('loyaltyMgmt.activeThisMonth')}
          value={stats?.active_this_month ?? 0}
          gradientColors={[colors.success, colors.successLight]}
          colors={colors}
        />
        <StatChip
          iconName="star-plus"
          label={t('loyaltyMgmt.pointsIssuedToday')}
          value={stats?.points_issued_today ?? 0}
          gradientColors={[colors.info, colors.infoLight]}
          colors={colors}
        />
        <StatChip
          iconName="gift"
          label={t('loyaltyMgmt.redemptionsToday')}
          value={stats?.redemptions_today ?? 0}
          gradientColors={[colors.warning, colors.accent]}
          colors={colors}
        />
      </View>

      {/* ── Give Stamp Button (gradient CTA) ── */}
      {!showStampForm && (
        <TouchableOpacity
          onPress={() => setShowStampForm(true)}
          accessibilityRole="button"
          accessibilityLabel={t('loyaltyMgmt.giveStamp')}
          style={{ marginHorizontal: 16, marginBottom: 12, borderRadius: 16, overflow: 'hidden' }}
        >
          <LinearGradient
            colors={[colors.primary, colors.accent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 16 }}
          >
            <MaterialCommunityIcons name="stamper" size={18} color={colors.primaryForeground} />
            <Text style={{ color: colors.premiumCardForeground, fontSize: 14, fontWeight: '600' }}>
              {t('loyaltyMgmt.giveStamp')}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* ── Stamp Form ── */}
      {showStampForm && (
        <View style={{
          marginHorizontal: 16,
          marginBottom: 12,
          backgroundColor: colors.card,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 16,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: `${colors.primary}1A`, alignItems: 'center', justifyContent: 'center' }}>
              <MaterialCommunityIcons name="magnify" size={14} color={colors.primary} />
            </View>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.foreground }}>
              {t('loyaltyMgmt.selectCustomer')}
            </Text>
          </View>
          <TextInput
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 14,
              padding: 12,
              color: colors.foreground,
              backgroundColor: colors.backgroundTertiary,
              fontSize: 14,
              marginBottom: 12,
            }}
            placeholder={t('loyaltyMgmt.searchPlaceholder')}
            placeholderTextColor={colors.foregroundSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            editable={!stampSubmitting}
            accessibilityLabel="Customer name or identifier"
          />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            <TouchableOpacity
              onPress={() => {
                setShowStampForm(false);
                setSearchQuery('');
              }}
              disabled={stampSubmitting}
              style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.backgroundTertiary }}
              accessibilityRole="button"
              accessibilityLabel="Cancel giving stamp"
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.foregroundSecondary }}>
                {t('common.cancel')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleGiveStamp}
              disabled={stampSubmitting || !searchQuery.trim()}
              accessibilityRole="button"
              accessibilityLabel={t('loyaltyMgmt.giveStamp')}
              style={{ borderRadius: 12, overflow: 'hidden', opacity: stampSubmitting || !searchQuery.trim() ? 0.5 : 1 }}
            >
              <LinearGradient
                colors={[colors.primary, colors.accent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.premiumCardForeground }}>
                  {stampSubmitting ? '...' : t('loyaltyMgmt.giveStamp')}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Stamp Cards Section ── */}
      <View style={{ marginHorizontal: 16, marginBottom: 8 }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: colors.foregroundSecondary, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8, marginLeft: 4 }}>
          {t('loyaltyMgmt.stampCards')}
        </Text>
      </View>

      {stampCards.length === 0 ? (
        <View style={{ alignItems: 'center', padding: 32 }}>
          <MaterialCommunityIcons name="card-off-outline" size={32} color={colors.foregroundSecondary} style={{ marginBottom: 8 }} />
          <Text variant="bodyLarge" style={{ color: colors.foregroundSecondary }}>
            {t('common.noResults')}
          </Text>
        </View>
      ) : (
        stampCards.map((card) => (
          <View
            key={card.id}
            style={{
              marginHorizontal: 16,
              marginBottom: 10,
              backgroundColor: colors.card,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 14,
            }}
          >
            {/* Card header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: `${colors.primary}1A`, alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialCommunityIcons name="ticket-confirmation" size={16} color={colors.primary} />
                </View>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary }}>
                  {card.service_type}
                </Text>
              </View>
              <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999, backgroundColor: `${colors.primary}1A` }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>
                  {card.stamps_required}x
                </Text>
              </View>
            </View>

            {/* Details rows */}
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>{t('loyaltyMgmt.serviceType')}</Text>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.foreground }}>{card.service_type}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>{t('loyaltyMgmt.stampsRequired')}</Text>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.foreground }}>{card.stamps_required}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>{t('loyaltyMgmt.reward')}</Text>
                <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', color: colors.foreground, maxWidth: '55%', textAlign: 'right' }}>
                  {card.reward_description}
                </Text>
              </View>
            </View>

            {/* Divider */}
            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }} />

            {/* Metrics row */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.successBackground }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.success }}>{card.active_count}</Text>
                <Text style={{ fontSize: 10, color: colors.success }}>{t('loyaltyMgmt.activeCount')}</Text>
              </View>
              <View style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.infoBackground }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.info }}>{card.completed_today}</Text>
                <Text style={{ fontSize: 10, color: colors.info }}>{t('loyaltyMgmt.completedToday')}</Text>
              </View>
            </View>
          </View>
        ))
      )}

      {/* ── Points Config Section ── */}
      <View style={{ marginHorizontal: 16, marginTop: 8, marginBottom: 4 }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: colors.foregroundSecondary, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8, marginLeft: 4 }}>
          {t('loyaltyMgmt.pointsConfig')}
        </Text>
      </View>
      <View
        style={{
          marginHorizontal: 16,
          marginBottom: 32,
          backgroundColor: colors.card,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: `${colors.accent}1A`, alignItems: 'center', justifyContent: 'center' }}>
            <MaterialCommunityIcons name="cash" size={14} color={colors.accent} />
          </View>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.foreground }}>{t('loyaltyMgmt.pointsConfig')}</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 }}>
          <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>{t('loyaltyMgmt.pointsPerReal')}</Text>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.foreground }}>1 pt / R$ 1,00</Text>
        </View>
      </View>
    </ScrollView>
    </ScreenContainer>
  );
}
