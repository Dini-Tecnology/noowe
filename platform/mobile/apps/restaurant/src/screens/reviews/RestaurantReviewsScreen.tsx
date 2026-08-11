/**
 * RestaurantReviewsScreen
 *
 * Restaurant-side review management screen. Shows review statistics,
 * rating distribution, filterable review list, and ability to respond.
 *
 * Endpoints consumed:
 *   GET  /reviews/restaurant/:restaurantId
 *   GET  /reviews/restaurant/:restaurantId/stats
 *   POST /reviews/:id/owner-response
 *
 * @module restaurant/screens/reviews/RestaurantReviewsScreen
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
} from 'react-native';
import { Text, Avatar, Button, Snackbar } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useI18n } from '@/shared/hooks/useI18n';
import { useAuth } from '@/shared/hooks/useAuth';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { useWebSocket } from '@okinawa/shared/hooks/useWebSocket';
import ApiService from '@/shared/services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReviewStats {
  avg_rating: number;
  total_reviews: number;
  five_star_percent: number;
  one_star_percent: number;
  distribution: Array<{ stars: number; count: number; percent: number }>;
}

interface Review {
  id: string;
  user_name: string;
  user_avatar?: string;
  rating: number;
  comment: string;
  created_at: string;
  owner_response?: string;
}

type FilterValue = 'all' | '5' | '4' | '3' | '2' | '1' | 'unresponded';

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function ReviewSkeleton({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{ marginHorizontal: 16, marginTop: 8, backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 16 }}>
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.backgroundTertiary }} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ height: 14, width: '50%', backgroundColor: colors.backgroundTertiary, borderRadius: 4 }} />
          <View style={{ height: 10, width: '30%', backgroundColor: colors.backgroundTertiary, borderRadius: 4 }} />
        </View>
      </View>
      <View style={{ height: 14, width: '90%', backgroundColor: colors.backgroundTertiary, borderRadius: 4, marginBottom: 6 }} />
      <View style={{ height: 14, width: '60%', backgroundColor: colors.backgroundTertiary, borderRadius: 4 }} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Star display helper
// ---------------------------------------------------------------------------

function StarRow({ rating, size = 16, color }: { rating: number; size?: number; color: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Text key={star} style={{ fontSize: size, color: star <= rating ? color : `${color}33` }}>
          {star <= rating ? '\u2605' : '\u2606'}
        </Text>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RestaurantReviewsScreen() {
  const { t } = useI18n();
  const { user } = useAuth();
  const colors = useColors();

  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [newReviewBanner, setNewReviewBanner] = useState(false);

  const restaurantId = useMemo(() => {
    return user?.roles?.[0]?.restaurant_id ?? '';
  }, [user]);

  // FIX-12: WebSocket listener for real-time review notifications
  const { connected, on, off } = useWebSocket('/events');

  useEffect(() => {
    if (!connected || !restaurantId) return;

    const handleReviewCreated = (data: any) => {
      if (data?.restaurant_id === restaurantId || !data?.restaurant_id) {
        setNewReviewBanner(true);
        // Auto-reload reviews
        loadData();
      }
    };

    on('review:created', handleReviewCreated);

    return () => {
      off('review:created', handleReviewCreated);
    };
  }, [connected, restaurantId]);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const loadData = useCallback(async () => {
    try {
      setError(false);

      // Build filter params
      const filterParams: Record<string, any> = {};
      if (filter !== 'all' && filter !== 'unresponded') {
        const starVal = parseInt(filter, 10);
        filterParams.min_rating = starVal;
        filterParams.max_rating = starVal;
      }

      const [statsRes, reviewsRes] = await Promise.all([
        ApiService.getRestaurantReviewStats(restaurantId),
        ApiService.getRestaurantReviews(restaurantId),
      ]);

      // Process stats
      setStats({
        avg_rating: statsRes?.avg_rating ?? 0,
        total_reviews: statsRes?.total_reviews ?? 0,
        five_star_percent: statsRes?.five_star_percent ?? 0,
        one_star_percent: statsRes?.one_star_percent ?? 0,
        distribution: statsRes?.distribution ?? [
          { stars: 5, count: 0, percent: 0 },
          { stars: 4, count: 0, percent: 0 },
          { stars: 3, count: 0, percent: 0 },
          { stars: 2, count: 0, percent: 0 },
          { stars: 1, count: 0, percent: 0 },
        ],
      });

      // Process reviews
      let reviewsList: Review[] = (reviewsRes?.reviews ?? reviewsRes ?? []).map((r: any) => ({
        id: r.id,
        user_name: r.user_name ?? r.user?.full_name ?? t('common.user'),
        user_avatar: r.user_avatar ?? r.user?.avatar_url,
        rating: r.rating ?? 0,
        comment: r.comment ?? '',
        created_at: r.created_at ?? '',
        owner_response: r.owner_response ?? null,
      }));

      // Apply client-side filter for unresponded and star rating
      if (filter === 'unresponded') {
        reviewsList = reviewsList.filter((r) => !r.owner_response);
      } else if (filter !== 'all') {
        const starVal = parseInt(filter, 10);
        reviewsList = reviewsList.filter((r) => r.rating === starVal);
      }

      setReviews(reviewsList);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [restaurantId, filter, t]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // -----------------------------------------------------------------------
  // Send response
  // -----------------------------------------------------------------------

  const handleSendResponse = useCallback(async () => {
    if (!respondingTo || !responseText.trim()) return;
    setSubmitting(true);
    try {
      await ApiService.addOwnerResponse(respondingTo, responseText.trim());
      setRespondingTo(null);
      setResponseText('');
      await loadData();
    } catch {
      // Keep form open on error
    } finally {
      setSubmitting(false);
    }
  }, [respondingTo, responseText, loadData]);

  // -----------------------------------------------------------------------
  // Filter chips config
  // -----------------------------------------------------------------------

  const filters: Array<{ value: FilterValue; label: string }> = [
    { value: 'all', label: t('reviews.filter.all') },
    { value: '5', label: '5\u2605' },
    { value: '4', label: '4\u2605' },
    { value: '3', label: '3\u2605' },
    { value: '2', label: '2\u2605' },
    { value: '1', label: '1\u2605' },
    { value: 'unresponded', label: t('reviews.filter.unresponded') },
  ];

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <ScreenContainer hasKeyboard>
      <ScrollView style={{ flex: 1, backgroundColor: colors.backgroundSecondary }}>
        <View style={{ marginHorizontal: 16, marginTop: 16, marginBottom: 8 }}>
          <View style={{ backgroundColor: colors.premiumCard, borderRadius: 20, padding: 16, overflow: 'hidden', position: 'relative' }}>
            <View style={{ position: 'absolute', right: -32, top: -32, width: 128, height: 128, borderRadius: 64, backgroundColor: `${colors.accent}1A` }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)' }} />
              <View style={{ flex: 1, gap: 6 }}>
                <View style={{ width: '50%', height: 16, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)' }} />
                <View style={{ width: '30%', height: 10, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)' }} />
              </View>
            </View>
          </View>
        </View>
        <ReviewSkeleton colors={colors} />
        <ReviewSkeleton colors={colors} />
        <ReviewSkeleton colors={colors} />
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
    <View style={{ flex: 1 }}>
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
          <View style={{ position: 'absolute', right: -32, top: -32, width: 128, height: 128, borderRadius: 64, backgroundColor: `${colors.accent}1A` }} />
          <View style={{ position: 'relative', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: `${colors.accent}33`, alignItems: 'center', justifyContent: 'center' }}>
              <MaterialCommunityIcons name="star" size={22} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.premiumCardForeground, fontSize: 16, fontWeight: '700' }}>
                {t('reviews.title')}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 1 }}>
                {stats?.total_reviews ?? 0} {t('reviews.total')}
              </Text>
            </View>
            {/* Average rating badge */}
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: colors.premiumCardForeground, fontSize: 24, fontWeight: '700' }}>
                {(stats?.avg_rating ?? 0).toFixed(1)}
              </Text>
              <StarRow rating={Math.round(stats?.avg_rating ?? 0)} size={12} color={colors.accent} />
            </View>
          </View>
        </View>

        {/* ── Rating Distribution ── */}
        <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colors.foregroundSecondary, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8, marginLeft: 4 }}>
            {t('reviews.distributionTitle')}
          </Text>
          <View style={{ backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 14 }}>
            {(stats?.distribution ?? []).map((d) => (
              <View key={d.stars} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Text style={{ width: 14, textAlign: 'right', fontSize: 12, fontWeight: '600', color: colors.foregroundSecondary }}>{d.stars}</Text>
                <MaterialCommunityIcons name="star" size={12} color={colors.accent} />
                <View style={{ flex: 1, height: 8, backgroundColor: colors.backgroundTertiary, borderRadius: 4, overflow: 'hidden' }}>
                  <View style={{
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: colors.accent,
                    width: `${d.percent}%`,
                  }} />
                </View>
                <Text style={{ width: 38, textAlign: 'right', fontSize: 12, color: colors.foregroundSecondary }}>{d.percent.toFixed(0)}%</Text>
              </View>
            ))}
            {/* Stats highlights */}
            <View style={{ flexDirection: 'row', marginTop: 8, gap: 8 }}>
              <View style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.successBackground }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.success }}>{(stats?.five_star_percent ?? 0).toFixed(0)}%</Text>
                <Text style={{ fontSize: 10, color: colors.success }}>{t('reviews.fiveStarPercent')}</Text>
              </View>
              <View style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.errorBackground }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.error }}>{(stats?.one_star_percent ?? 0).toFixed(0)}%</Text>
                <Text style={{ fontSize: 10, color: colors.error }}>{t('reviews.oneStarPercent')}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Filter Segment ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 16,
            marginBottom: 12,
          }}
        >
          <View style={{
            flexDirection: 'row',
            backgroundColor: `${colors.backgroundTertiary}4D`,
            borderRadius: 14,
            padding: 4,
            gap: 3,
          }}>
            {filters.map((f) => (
              <TouchableOpacity
                key={f.value}
                onPress={() => setFilter(f.value)}
                accessibilityRole="button"
                accessibilityLabel={f.label}
                accessibilityState={{ selected: filter === f.value }}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 11,
                  backgroundColor: filter === f.value ? colors.card : 'transparent',
                  ...(filter === f.value ? {
                    shadowColor: colors.shadowColor,
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.08,
                    shadowRadius: 4,
                    elevation: 2,
                  } : {}),
                }}
              >
                <Text style={{
                  fontSize: 12,
                  fontWeight: filter === f.value ? '600' : '500',
                  color: filter === f.value ? colors.foreground : colors.foregroundSecondary,
                }}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* ── Reviews List ── */}
        {reviews.length === 0 ? (
          <View style={{ alignItems: 'center', padding: 32 }}>
            <MaterialCommunityIcons name="message-text-outline" size={32} color={colors.foregroundSecondary} style={{ marginBottom: 8 }} />
            <Text variant="bodyLarge" style={{ color: colors.foregroundSecondary }}>
              {t('reviews.noReviews')}
            </Text>
          </View>
        ) : (
          reviews.map((review) => (
            <View
              key={review.id}
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
              {/* Review Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                {review.user_avatar ? (
                  <Avatar.Image size={40} source={{ uri: review.user_avatar }} />
                ) : (
                  <Avatar.Text size={40} label={review.user_name.slice(0, 2).toUpperCase()} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.foreground }}>
                    {review.user_name}
                  </Text>
                  <StarRow rating={review.rating} size={14} color={colors.accent} />
                </View>
                <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>
                  {review.created_at
                    ? new Date(review.created_at).toLocaleDateString('pt-BR')
                    : ''}
                </Text>
              </View>

              {/* Comment */}
              <Text style={{ fontSize: 14, color: colors.foreground, lineHeight: 19, marginBottom: 10 }}>
                {review.comment}
              </Text>

              {/* Existing owner response */}
              {review.owner_response && (
                <View style={{ backgroundColor: `${colors.primary}0D`, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: `${colors.primary}1A` }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <MaterialCommunityIcons name="reply" size={12} color={colors.primary} />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary }}>
                      {t('reviews.response')}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, color: colors.foreground, lineHeight: 17 }}>
                    {review.owner_response}
                  </Text>
                </View>
              )}

              {/* Response action / form */}
              {!review.owner_response && respondingTo !== review.id && (
                <TouchableOpacity
                  onPress={() => setRespondingTo(review.id)}
                  accessibilityRole="button"
                  accessibilityLabel={t('reviews.respond')}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    paddingVertical: 8,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    marginTop: 4,
                  }}
                >
                  <MaterialCommunityIcons name="reply-outline" size={14} color={colors.primary} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary }}>
                    {t('reviews.respond')}
                  </Text>
                </TouchableOpacity>
              )}

              {respondingTo === review.id && (
                <View style={{ marginTop: 10 }}>
                  <TextInput
                    style={{
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 14,
                      padding: 12,
                      color: colors.foreground,
                      minHeight: 80,
                      textAlignVertical: 'top',
                      marginBottom: 8,
                      backgroundColor: colors.backgroundTertiary,
                      fontSize: 14,
                    }}
                    placeholder={t('reviews.responsePlaceholder')}
                    placeholderTextColor={colors.foregroundSecondary}
                    value={responseText}
                    onChangeText={setResponseText}
                    multiline
                    editable={!submitting}
                    accessibilityLabel={t('reviews.responsePlaceholder')}
                  />
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => {
                        setRespondingTo(null);
                        setResponseText('');
                      }}
                      disabled={submitting}
                      accessibilityRole="button"
                      accessibilityLabel={t('common.cancel')}
                      style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.backgroundTertiary }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.foregroundSecondary }}>
                        {t('common.cancel')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSendResponse}
                      disabled={submitting || !responseText.trim()}
                      accessibilityRole="button"
                      accessibilityLabel={t('reviews.sendResponse')}
                      style={{ overflow: 'hidden', borderRadius: 12, opacity: submitting || !responseText.trim() ? 0.5 : 1 }}
                    >
                      <LinearGradient
                        colors={[colors.primary, colors.accent]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.premiumCardForeground }}>
                          {submitting ? '...' : t('reviews.sendResponse')}
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          ))
        )}

        {/* Bottom spacing */}
        <View style={{ height: 32 }} />
      </ScrollView>

      {/* FIX-12: New review notification banner */}
      <Snackbar
        visible={newReviewBanner}
        onDismiss={() => setNewReviewBanner(false)}
        duration={4000}
        action={{
          label: t('common.close'),
          onPress: () => setNewReviewBanner(false),
        }}
        style={{ backgroundColor: colors.primary }}
      >
        {t('reviews.newReviewReceived') || 'Nova avaliacao recebida!'}
      </Snackbar>
    </View>
    </ScreenContainer>
  );
}
