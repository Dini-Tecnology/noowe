import React, { useState, useCallback, useMemo } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
} from 'react-native';
import { Text, Card, ActivityIndicator } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import ApiService from '@/shared/services/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useI18n } from '@/shared/hooks/useI18n';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { spacing, borderRadius } from '@okinawa/shared/theme/spacing';

type Segment = 'new' | 'regular' | 'vip' | 'dormant';

interface CustomerProfile {
  id: string;
  user_id: string;
  restaurant_id: string;
  total_visits: number;
  total_spent: number;
  avg_ticket: number;
  last_visit_at: string | null;
  favorite_items: string[];
  dietary_preferences: string[];
  segment: Segment;
  birthday: string | null;
  notes: string | null;
  user?: {
    id: string;
    full_name: string | null;
    email: string;
    phone: string | null;
    avatar_url: string | null;
  };
}

interface CrmOverview {
  segments: Record<Segment, number>;
  total_customers: number;
  top_customers: CustomerProfile[];
}

const SEGMENT_KEYS: Segment[] = ['new', 'regular', 'vip', 'dormant'];

export default function CustomerCrmScreen() {
  const { t } = useI18n();
  const { user } = useAuth();
  const colors = useColors();

  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);

  const restaurantId = useMemo(() => {
    return user?.roles?.[0]?.restaurant_id ?? '';
  }, [user]);

  // Fetch overview
  const {
    data: overview,
    isLoading: overviewLoading,
    refetch: refetchOverview,
  } = useQuery<CrmOverview>({
    queryKey: ['crm-overview', restaurantId],
    queryFn: async () => {
      const res = await ApiService.get(
        `/customer-crm/overview?restaurant_id=${restaurantId}`,
      );
      return res?.data || res;
    },
  });

  // Fetch customers by segment
  const {
    data: customers,
    isLoading: customersLoading,
    refetch: refetchCustomers,
  } = useQuery<CustomerProfile[]>({
    queryKey: ['crm-customers', restaurantId, selectedSegment],
    queryFn: async () => {
      const segmentParam = selectedSegment
        ? `&segment=${selectedSegment}`
        : '';
      const res = await ApiService.get(
        `/customer-crm/customers?restaurant_id=${restaurantId}${segmentParam}`,
      );
      return res?.data || res || [];
    },
  });

  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    if (!searchQuery.trim()) return customers;
    const q = searchQuery.toLowerCase();
    return customers.filter(
      (c) =>
        (c.user?.full_name || '').toLowerCase().includes(q) ||
        (c.user?.email || '').toLowerCase().includes(q) ||
        (c.user?.phone || '').toLowerCase().includes(q),
    );
  }, [customers, searchQuery]);

  const onRefresh = useCallback(async () => {
    await Promise.all([refetchOverview(), refetchCustomers()]);
  }, [refetchOverview, refetchCustomers]);

  const getSegmentColor = (segment: Segment) => {
    switch (segment) {
      case 'new':
        return colors.info;
      case 'regular':
        return colors.primary;
      case 'vip':
        return colors.warning;
      case 'dormant':
        return colors.foregroundMuted;
    }
  };

  const getSegmentBgColor = (segment: Segment) => {
    switch (segment) {
      case 'new':
        return colors.infoBackground || `${colors.info}15`;
      case 'regular':
        return `${colors.primary}15`;
      case 'vip':
        return colors.warningBackground;
      case 'dormant':
        return colors.backgroundSecondary;
    }
  };

  const formatCurrency = (value: number) => {
    return `R$ ${Number(value).toFixed(2)}`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return t('common.notProvided');
    return new Date(dateStr).toLocaleDateString();
  };

  // Skeleton loading
  if (overviewLoading && !overview) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.foregroundSecondary }]}>
            {t('common.loading')}
          </Text>
        </View>
      </View>
    );
  }

  const renderSegmentCards = () => (
    <View style={styles.segmentRow}>
      {SEGMENT_KEYS.map((segment) => {
        const count = overview?.segments[segment] ?? 0;
        const isActive = selectedSegment === segment;
        const segColor = getSegmentColor(segment);
        const segBg = getSegmentBgColor(segment);

        return (
          <TouchableOpacity
            key={segment}
            style={[
              styles.segmentCard,
              {
                backgroundColor: isActive ? segColor : segBg,
                borderColor: segColor,
                borderWidth: isActive ? 2 : 1,
              },
            ]}
            onPress={() =>
              setSelectedSegment(isActive ? null : segment)
            }
            accessibilityRole="button"
            accessibilityLabel={`${t(`crm.segment_${segment}`)} ${count}`}
            accessibilityState={{ selected: isActive }}
          >
            <Text
              style={[
                styles.segmentCount,
                { color: isActive ? colors.primaryForeground : segColor },
              ]}
            >
              {count}
            </Text>
            <Text
              style={[
                styles.segmentLabel,
                {
                  color: isActive
                    ? colors.primaryForeground
                    : colors.foregroundSecondary,
                },
              ]}
            >
              {t(`crm.segment_${segment}`)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderTotalBanner = () => (
    <View
      style={[
        styles.totalBanner,
        { backgroundColor: colors.backgroundSecondary },
      ]}
    >
      <Text style={[styles.totalLabel, { color: colors.foregroundSecondary }]}>
        {t('crm.totalCustomers')}
      </Text>
      <Text style={[styles.totalCount, { color: colors.foreground }]}>
        {overview?.total_customers ?? 0}
      </Text>
    </View>
  );

  const renderSearch = () => (
    <View
      style={[
        styles.searchContainer,
        { backgroundColor: colors.input, borderColor: colors.inputBorder },
      ]}
    >
      <TextInput
        style={[styles.searchInput, { color: colors.foreground }]}
        placeholder={t('crm.searchPlaceholder')}
        placeholderTextColor={colors.inputPlaceholder}
        value={searchQuery}
        onChangeText={setSearchQuery}
        accessibilityLabel={t('crm.searchPlaceholder')}
      />
    </View>
  );

  const renderCustomerItem = ({ item }: { item: CustomerProfile }) => {
    const segColor = getSegmentColor(item.segment);

    return (
      <TouchableOpacity
        onPress={() => setSelectedCustomer(item)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${item.user?.full_name || item.user?.email}, ${t(`crm.segment_${item.segment}`)}`}
      >
        <Card
          style={[
            styles.customerCard,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          <View style={styles.customerContent}>
            <View style={styles.customerHeader}>
              {/* Segment dot */}
              <View
                style={[styles.segmentDot, { backgroundColor: segColor }]}
              />
              <View style={styles.customerInfo}>
                <Text
                  style={[styles.customerName, { color: colors.foreground }]}
                  numberOfLines={1}
                >
                  {item.user?.full_name || item.user?.email || t('common.user')}
                </Text>
                <Text
                  style={[
                    styles.customerSegment,
                    { color: segColor },
                  ]}
                >
                  {t(`crm.segment_${item.segment}`)}
                </Text>
              </View>
              <View style={styles.customerStats}>
                <Text style={[styles.statsValue, { color: colors.foreground }]}>
                  {formatCurrency(item.total_spent)}
                </Text>
                <Text
                  style={[
                    styles.statsLabel,
                    { color: colors.foregroundMuted },
                  ]}
                >
                  {item.total_visits} {t('crm.visits')}
                </Text>
              </View>
            </View>

            <View style={styles.customerMeta}>
              <Text
                style={[styles.metaText, { color: colors.foregroundMuted }]}
              >
                {t('crm.avgTicket')}: {formatCurrency(item.avg_ticket)}
              </Text>
              {item.last_visit_at && (
                <Text
                  style={[styles.metaText, { color: colors.foregroundMuted }]}
                >
                  {t('crm.lastVisit')}: {formatDate(item.last_visit_at)}
                </Text>
              )}
            </View>
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
        {t('crm.emptyTitle')}
      </Text>
      <Text style={[styles.emptySubtitle, { color: colors.foregroundSecondary }]}>
        {t('crm.emptySubtitle')}
      </Text>
    </View>
  );

  const renderCustomerDetailModal = () => {
    if (!selectedCustomer) return null;

    const customer = selectedCustomer;
    const segColor = getSegmentColor(customer.segment);

    return (
      <Modal
        visible={!!selectedCustomer}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedCustomer(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Header */}
              <View style={styles.modalHeader}>
                <Text
                  style={[styles.modalTitle, { color: colors.foreground }]}
                >
                  {customer.user?.full_name || customer.user?.email || t('common.user')}
                </Text>
                <View
                  style={[
                    styles.segmentBadge,
                    { backgroundColor: segColor },
                  ]}
                >
                  <Text style={[styles.segmentBadgeText, { color: colors.premiumCardForeground }]}>
                    {t(`crm.segment_${customer.segment}`)}
                  </Text>
                </View>
              </View>

              {/* Contact info */}
              {customer.user?.email && (
                <Text
                  style={[
                    styles.detailText,
                    { color: colors.foregroundSecondary },
                  ]}
                >
                  {customer.user.email}
                </Text>
              )}
              {customer.user?.phone && (
                <Text
                  style={[
                    styles.detailText,
                    { color: colors.foregroundSecondary },
                  ]}
                >
                  {customer.user.phone}
                </Text>
              )}

              {/* Stats grid */}
              <View style={styles.statsGrid}>
                <View
                  style={[
                    styles.statBox,
                    { backgroundColor: colors.backgroundSecondary },
                  ]}
                >
                  <Text
                    style={[styles.statBoxValue, { color: colors.primary }]}
                  >
                    {customer.total_visits}
                  </Text>
                  <Text
                    style={[
                      styles.statBoxLabel,
                      { color: colors.foregroundSecondary },
                    ]}
                  >
                    {t('crm.visits')}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statBox,
                    { backgroundColor: colors.backgroundSecondary },
                  ]}
                >
                  <Text
                    style={[styles.statBoxValue, { color: colors.success }]}
                  >
                    {formatCurrency(customer.total_spent)}
                  </Text>
                  <Text
                    style={[
                      styles.statBoxLabel,
                      { color: colors.foregroundSecondary },
                    ]}
                  >
                    {t('crm.totalSpent')}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statBox,
                    { backgroundColor: colors.backgroundSecondary },
                  ]}
                >
                  <Text
                    style={[styles.statBoxValue, { color: colors.warning }]}
                  >
                    {formatCurrency(customer.avg_ticket)}
                  </Text>
                  <Text
                    style={[
                      styles.statBoxLabel,
                      { color: colors.foregroundSecondary },
                    ]}
                  >
                    {t('crm.avgTicket')}
                  </Text>
                </View>
              </View>

              {/* Last visit */}
              <View style={styles.detailSection}>
                <Text
                  style={[
                    styles.detailSectionTitle,
                    { color: colors.foreground },
                  ]}
                >
                  {t('crm.lastVisit')}
                </Text>
                <Text
                  style={[
                    styles.detailText,
                    { color: colors.foregroundSecondary },
                  ]}
                >
                  {formatDate(customer.last_visit_at)}
                </Text>
              </View>

              {/* Birthday */}
              {customer.birthday && (
                <View style={styles.detailSection}>
                  <Text
                    style={[
                      styles.detailSectionTitle,
                      { color: colors.foreground },
                    ]}
                  >
                    {t('crm.birthday')}
                  </Text>
                  <Text
                    style={[
                      styles.detailText,
                      { color: colors.foregroundSecondary },
                    ]}
                  >
                    {formatDate(customer.birthday)}
                  </Text>
                </View>
              )}

              {/* Dietary preferences */}
              {customer.dietary_preferences?.length > 0 && (
                <View style={styles.detailSection}>
                  <Text
                    style={[
                      styles.detailSectionTitle,
                      { color: colors.foreground },
                    ]}
                  >
                    {t('crm.dietaryPreferences')}
                  </Text>
                  <View style={styles.chipRow}>
                    {customer.dietary_preferences.map((pref, idx) => (
                      <View
                        key={idx}
                        style={[
                          styles.chip,
                          { backgroundColor: colors.backgroundTertiary },
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            { color: colors.foregroundSecondary },
                          ]}
                        >
                          {pref}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Favorite items */}
              {customer.favorite_items?.length > 0 && (
                <View style={styles.detailSection}>
                  <Text
                    style={[
                      styles.detailSectionTitle,
                      { color: colors.foreground },
                    ]}
                  >
                    {t('crm.favoriteItems')}
                  </Text>
                  <View style={styles.chipRow}>
                    {customer.favorite_items.map((item, idx) => (
                      <View
                        key={idx}
                        style={[
                          styles.chip,
                          { backgroundColor: `${colors.primary}15` },
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            { color: colors.primary },
                          ]}
                        >
                          {item}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Notes */}
              {customer.notes && (
                <View style={styles.detailSection}>
                  <Text
                    style={[
                      styles.detailSectionTitle,
                      { color: colors.foreground },
                    ]}
                  >
                    {t('crm.notes')}
                  </Text>
                  <Text
                    style={[
                      styles.detailText,
                      { color: colors.foregroundSecondary },
                    ]}
                  >
                    {customer.notes}
                  </Text>
                </View>
              )}
            </ScrollView>

            {/* Close button */}
            <TouchableOpacity
              style={[
                styles.closeButton,
                { backgroundColor: colors.primary },
              ]}
              onPress={() => setSelectedCustomer(null)}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <Text style={{ color: colors.primaryForeground, fontWeight: '600' }}>
                {t('common.close')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <ScreenContainer hasKeyboard>
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {renderTotalBanner()}
      {renderSegmentCards()}
      {renderSearch()}

      <FlatList
        data={filteredCustomers}
        keyExtractor={(item) => item.id}
        renderItem={renderCustomerItem}
        getItemLayout={(_, index) => ({
          length: 100,
          offset: 100 * index,
          index,
        })}
        windowSize={10}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        removeClippedSubviews={true}
        ListEmptyComponent={
          customersLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : (
            renderEmptyState()
          )
        }
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      />

      {renderCustomerDetailModal()}
    </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing[8],
  },
  loadingText: {
    marginTop: spacing[3],
    fontSize: 14,
  },

  // Total banner
  totalBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.screenHorizontal,
    paddingVertical: spacing[3],
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  totalCount: {
    fontSize: 24,
    fontWeight: '700',
  },

  // Segment cards
  segmentRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.screenHorizontal,
    gap: spacing[2],
    paddingBottom: spacing[3],
  },
  segmentCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing[3],
    borderRadius: borderRadius.card,
  },
  segmentCount: {
    fontSize: 24,
    fontWeight: '700',
  },
  segmentLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: spacing[0.5],
    textTransform: 'uppercase',
  },

  // Search
  searchContainer: {
    marginHorizontal: spacing.screenHorizontal,
    marginBottom: spacing[3],
    borderRadius: borderRadius.input,
    borderWidth: 1,
    paddingHorizontal: spacing[3],
  },
  searchInput: {
    height: 42,
    fontSize: 14,
  },

  // Customer card
  listContent: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingBottom: 40,
  },
  customerCard: {
    marginBottom: spacing[2],
    borderRadius: borderRadius.card,
    borderWidth: 1,
  },
  customerContent: {
    padding: spacing[3],
  },
  customerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  segmentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing[2],
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '600',
  },
  customerSegment: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  customerStats: {
    alignItems: 'flex-end',
  },
  statsValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  statsLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  customerMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing[2],
  },
  metaText: {
    fontSize: 12,
  },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[16],
    paddingHorizontal: spacing[8],
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing[2],
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: borderRadius.bottomSheet,
    borderTopRightRadius: borderRadius.bottomSheet,
    padding: spacing[6],
    paddingBottom: spacing[10],
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[2],
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    flex: 1,
  },
  segmentBadge: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.pill,
    marginLeft: spacing[2],
  },
  segmentBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },

  detailText: {
    fontSize: 14,
    marginBottom: spacing[1],
  },

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[4],
    marginBottom: spacing[4],
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing[3],
    borderRadius: borderRadius.card,
  },
  statBoxValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  statBoxLabel: {
    fontSize: 12,
    marginTop: spacing[0.5],
  },

  // Detail sections
  detailSection: {
    marginBottom: spacing[4],
  },
  detailSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing[1],
  },

  // Chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[1.5],
  },
  chip: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.pill,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
  },

  // Close button
  closeButton: {
    alignItems: 'center',
    paddingVertical: spacing[3],
    borderRadius: borderRadius.button,
    marginTop: spacing[4],
  },
});
