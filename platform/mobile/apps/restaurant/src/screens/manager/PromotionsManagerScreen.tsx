import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
  Modal,
  ScrollView,
  TextInput as RNTextInput,
  Platform,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  Card,
  IconButton,
  Button,
  Chip,
  FAB,
  Switch,
  ActivityIndicator,
  ProgressBar,
  Divider,
} from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { t } from '@okinawa/shared/i18n';
import ApiService from '@/shared/services/api';

// Types
interface Promotion {
  id: string;
  restaurant_id: string;
  code: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  discount_value: number | null;
  min_order_value: number | null;
  max_uses: number | null;
  current_uses: number;
  max_uses_per_user: number;
  valid_from: string;
  valid_until: string;
  days_of_week: number[] | null;
  hours_from: string | null;
  hours_until: string | null;
  applicable_categories: string[] | null;
}

type FilterStatus = 'all' | 'active' | 'expired';

const PROMOTION_TYPES = [
  { value: 'percentage', labelKey: 'promotions.types.percentage' },
  { value: 'fixed', labelKey: 'promotions.types.fixed' },
  { value: 'free_item', labelKey: 'promotions.types.freeItem' },
  { value: 'bogo', labelKey: 'promotions.types.bogo' },
  { value: 'happy_hour', labelKey: 'promotions.types.happyHour' },
];

const getSTATUS_COLORS = (colors: any): Record<string, string> => ({
  active: colors.success,
  inactive: colors.foregroundSecondary,
  expired: colors.foregroundMuted,
  scheduled: colors.info,
});

// Skeleton Components
const SkeletonCard = ({ colors }: { colors: any }) => (
  <View
    style={{
      height: 100,
      backgroundColor: colors.backgroundTertiary,
      borderRadius: 12,
      marginHorizontal: 16,
      marginBottom: 12,
    }}
  />
);

const SkeletonLoader = ({ colors }: { colors: any }) => (
  <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: 16 }}>
    <SkeletonCard colors={colors} />
    <SkeletonCard colors={colors} />
    <SkeletonCard colors={colors} />
    <SkeletonCard colors={colors} />
  </View>
);

export default function PromotionsManagerScreen() {
  const colors = useColors();
  const STATUS_COLORS = getSTATUS_COLORS(colors);

  // State
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Form state
  const [formCode, setFormCode] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formType, setFormType] = useState('percentage');
  const [formDiscountValue, setFormDiscountValue] = useState('');
  const [formMinOrder, setFormMinOrder] = useState('');
  const [formValidFrom, setFormValidFrom] = useState('');
  const [formValidUntil, setFormValidUntil] = useState('');
  const [formMaxUses, setFormMaxUses] = useState('');
  const [formDaysOfWeek, setFormDaysOfWeek] = useState<number[]>([]);
  const [formHoursFrom, setFormHoursFrom] = useState('');
  const [formHoursUntil, setFormHoursUntil] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchPromotions = useCallback(async () => {
    try {
      const response = await ApiService.get('/promotions/current/all');
      setPromotions(response.data || []);
    } catch (err) {
      console.error('Error fetching promotions:', err);
      // Demo data fallback
      setPromotions([
        {
          id: '1',
          restaurant_id: 'rest-1',
          code: 'WELCOME10',
          title: '10% de desconto para novos clientes',
          description: 'Valido para primeiro pedido',
          type: 'percentage',
          status: 'active',
          discount_value: 10,
          min_order_value: 5000,
          max_uses: 100,
          current_uses: 34,
          max_uses_per_user: 1,
          valid_from: '2026-03-01T00:00:00Z',
          valid_until: '2026-06-30T23:59:59Z',
          days_of_week: null,
          hours_from: null,
          hours_until: null,
          applicable_categories: null,
        },
        {
          id: '2',
          restaurant_id: 'rest-1',
          code: 'HAPPYHOUR20',
          title: '20% off em drinks - Happy Hour',
          description: 'Segunda a sexta das 17h as 19h',
          type: 'happy_hour',
          status: 'active',
          discount_value: 20,
          min_order_value: null,
          max_uses: null,
          current_uses: 156,
          max_uses_per_user: 99,
          valid_from: '2026-01-01T00:00:00Z',
          valid_until: '2026-12-31T23:59:59Z',
          days_of_week: [1, 2, 3, 4, 5],
          hours_from: '17:00',
          hours_until: '19:00',
          applicable_categories: ['drinks'],
        },
        {
          id: '3',
          restaurant_id: 'rest-1',
          code: 'ANIVERSARIO',
          title: 'R$30 off no aniversario',
          description: null,
          type: 'fixed',
          status: 'expired',
          discount_value: 3000,
          min_order_value: 10000,
          max_uses: 50,
          current_uses: 50,
          max_uses_per_user: 1,
          valid_from: '2026-01-01T00:00:00Z',
          valid_until: '2026-02-28T23:59:59Z',
          days_of_week: null,
          hours_from: null,
          hours_until: null,
          applicable_categories: null,
        },
        {
          id: '4',
          restaurant_id: 'rest-1',
          code: 'PASCOA2026',
          title: 'Sobremesa especial de Pascoa',
          description: 'Pedidos acima de R$80',
          type: 'free_item',
          status: 'scheduled',
          discount_value: null,
          min_order_value: 8000,
          max_uses: 200,
          current_uses: 0,
          max_uses_per_user: 1,
          valid_from: '2026-04-01T00:00:00Z',
          valid_until: '2026-04-10T23:59:59Z',
          days_of_week: null,
          hours_from: null,
          hours_until: null,
          applicable_categories: null,
        },
      ]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPromotions();
  }, [fetchPromotions]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPromotions();
  }, [fetchPromotions]);

  const handleToggleStatus = useCallback(
    async (promo: Promotion) => {
      const newStatus = promo.status === 'active' ? 'inactive' : 'active';

      Alert.alert(
        t('promotions.toggleConfirm'),
        `${promo.code}: ${promo.status} -> ${newStatus}`,
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.confirm'),
            onPress: async () => {
              try {
                setTogglingId(promo.id);
                await ApiService.patch(`/promotions/${promo.id}`, {
                  status: newStatus,
                });
                setPromotions((prev) =>
                  prev.map((p) =>
                    p.id === promo.id ? { ...p, status: newStatus } : p,
                  ),
                );
              } catch (err) {
                console.error('Error toggling promotion:', err);
                // Optimistic UI update for demo
                setPromotions((prev) =>
                  prev.map((p) =>
                    p.id === promo.id ? { ...p, status: newStatus } : p,
                  ),
                );
              } finally {
                setTogglingId(null);
              }
            },
          },
        ],
      );
    },
    [],
  );

  const resetForm = useCallback(() => {
    setFormCode('');
    setFormTitle('');
    setFormDescription('');
    setFormType('percentage');
    setFormDiscountValue('');
    setFormMinOrder('');
    setFormValidFrom('');
    setFormValidUntil('');
    setFormMaxUses('');
    setFormDaysOfWeek([]);
    setFormHoursFrom('');
    setFormHoursUntil('');
  }, []);

  const handleCreate = useCallback(async () => {
    // Validate required fields
    if (!formCode.trim() || !formTitle.trim() || !formValidFrom || !formValidUntil) {
      Alert.alert(t('errors.validation'), t('errors.required'));
      return;
    }

    try {
      setCreating(true);
      const payload = {
        restaurant_id: 'current', // Will be resolved by backend
        code: formCode.toUpperCase().replace(/\s/g, ''),
        title: formTitle.trim(),
        description: formDescription.trim() || null,
        type: formType,
        discount_value: formDiscountValue ? parseInt(formDiscountValue, 10) : null,
        min_order_value: formMinOrder ? parseInt(formMinOrder, 10) : null,
        valid_from: formValidFrom || new Date().toISOString(),
        valid_until: formValidUntil || new Date(Date.now() + 30 * 86400000).toISOString(),
        max_uses: formMaxUses ? parseInt(formMaxUses, 10) : null,
        days_of_week: formDaysOfWeek.length > 0 ? formDaysOfWeek : null,
        hours_from: formHoursFrom || null,
        hours_until: formHoursUntil || null,
      };

      await ApiService.post('/promotions', payload);
      Alert.alert(t('promotions.createSuccess'));
      setShowCreateModal(false);
      resetForm();
      fetchPromotions();
    } catch (err: any) {
      console.error('Error creating promotion:', err);
      if (err?.response?.status === 409) {
        Alert.alert(t('promotions.duplicateCode'));
      } else {
        Alert.alert(t('errors.generic'));
      }
    } finally {
      setCreating(false);
    }
  }, [
    formCode,
    formTitle,
    formDescription,
    formType,
    formDiscountValue,
    formMinOrder,
    formValidFrom,
    formValidUntil,
    formMaxUses,
    formDaysOfWeek,
    formHoursFrom,
    formHoursUntil,
    fetchPromotions,
    resetForm,
  ]);

  // Filtered promotions
  const filteredPromotions = useMemo(() => {
    if (filter === 'all') return promotions;
    if (filter === 'active') return promotions.filter((p) => p.status === 'active' || p.status === 'scheduled');
    if (filter === 'expired') return promotions.filter((p) => p.status === 'expired' || p.status === 'inactive');
    return promotions;
  }, [promotions, filter]);

  const getTypeBadgeLabel = useCallback((type: string): string => {
    const typeEntry = PROMOTION_TYPES.find((pt) => pt.value === type);
    return typeEntry ? t(typeEntry.labelKey) : type;
  }, []);

  const getStatusLabel = useCallback((status: string): string => {
    switch (status) {
      case 'active':
        return t('promotions.active');
      case 'inactive':
        return t('promotions.inactive');
      case 'expired':
        return t('promotions.expired');
      case 'scheduled':
        return t('promotions.scheduled');
      default:
        return status;
    }
  }, []);

  const formatDate = useCallback((dateStr: string): string => {
    try {
      return new Date(dateStr).toLocaleDateString('pt-BR');
    } catch {
      return dateStr;
    }
  }, []);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        header: {
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 8,
        },
        headerTitle: {
          fontSize: 24,
          fontWeight: 'bold',
          color: colors.foreground,
        },
        filterRow: {
          flexDirection: 'row',
          paddingHorizontal: 16,
          paddingVertical: 8,
          gap: 8,
        },
        filterChip: {
          borderRadius: 20,
        },
        promoCard: {
          marginHorizontal: 16,
          marginBottom: 12,
          backgroundColor: colors.card,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
        },
        promoCardContent: {
          padding: 16,
        },
        promoHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        promoCode: {
          fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
          fontSize: 16,
          fontWeight: '700',
          color: colors.primary,
        },
        statusBadge: {
          paddingHorizontal: 10,
          paddingVertical: 3,
          borderRadius: 12,
        },
        statusBadgeText: {
          fontSize: 12,
          fontWeight: '700',
          color: colors.premiumCardForeground,
        },
        promoTitle: {
          fontSize: 14,
          color: colors.foreground,
          marginTop: 6,
        },
        promoMeta: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 10,
        },
        typeBadge: {
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 6,
          backgroundColor: colors.backgroundTertiary,
        },
        typeBadgeText: {
          fontSize: 12,
          color: colors.foregroundSecondary,
        },
        promoDates: {
          fontSize: 12,
          color: colors.foregroundMuted,
        },
        usageRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 10,
        },
        usageText: {
          fontSize: 12,
          color: colors.foregroundSecondary,
        },
        usageBar: {
          flex: 1,
          height: 6,
          borderRadius: 3,
          marginLeft: 12,
        },
        toggleRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          marginTop: 8,
        },
        toggleLabel: {
          fontSize: 12,
          color: colors.foregroundSecondary,
          marginRight: 8,
        },
        fab: {
          position: 'absolute',
          right: 16,
          bottom: 24,
          backgroundColor: colors.primary,
        },
        emptyContainer: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 40,
        },
        emptyText: {
          fontSize: 16,
          color: colors.foregroundMuted,
          textAlign: 'center',
          marginTop: 12,
        },
        // Modal styles
        modalOverlay: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'flex-end',
        },
        modalContent: {
          backgroundColor: colors.background,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          maxHeight: '90%',
        },
        modalHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 16,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        modalTitle: {
          fontSize: 18,
          fontWeight: '600',
          color: colors.foreground,
        },
        modalBody: {
          padding: 16,
        },
        formLabel: {
          fontSize: 14,
          fontWeight: '500',
          color: colors.foreground,
          marginBottom: 6,
          marginTop: 14,
        },
        formInput: {
          backgroundColor: colors.input,
          borderWidth: 1,
          borderColor: colors.inputBorder,
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: 14,
          color: colors.foreground,
        },
        typeChipRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          marginTop: 4,
        },
        dayChipRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 6,
          marginTop: 4,
        },
        dayChip: {
          width: 36,
          height: 36,
          borderRadius: 18,
          justifyContent: 'center',
          alignItems: 'center',
          borderWidth: 1,
          borderColor: colors.border,
        },
        dayChipActive: {
          width: 36,
          height: 36,
          borderRadius: 18,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.primary,
          borderWidth: 1,
          borderColor: colors.primary,
        },
        dayChipText: {
          fontSize: 12,
          color: colors.foregroundSecondary,
        },
        dayChipTextActive: {
          fontSize: 12,
          color: colors.premiumCardForeground,
          fontWeight: '600',
        },
        modalActions: {
          flexDirection: 'row',
          justifyContent: 'flex-end',
          gap: 12,
          padding: 16,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        },
      }),
    [colors],
  );

  if (loading) {
    return <SkeletonLoader colors={colors} />;
  }

  const DAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  const renderPromoCard = ({ item }: { item: Promotion }) => {
    const usagePercent =
      item.max_uses ? item.current_uses / item.max_uses : 0;

    return (
      <View style={styles.promoCard}>
        <View style={styles.promoCardContent}>
          {/* Header: code + status badge */}
          <View style={styles.promoHeader}>
            <Text style={styles.promoCode}>{item.code}</Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: STATUS_COLORS[item.status] || colors.foregroundMuted },
              ]}
            >
              <Text style={styles.statusBadgeText}>
                {getStatusLabel(item.status)}
              </Text>
            </View>
          </View>

          {/* Title */}
          <Text style={styles.promoTitle} numberOfLines={2}>
            {item.title}
          </Text>

          {/* Type badge + dates */}
          <View style={styles.promoMeta}>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>
                {getTypeBadgeLabel(item.type)}
              </Text>
            </View>
            <Text style={styles.promoDates}>
              {formatDate(item.valid_from)} - {formatDate(item.valid_until)}
            </Text>
          </View>

          {/* Usage count/limit */}
          <View style={styles.usageRow}>
            <Text style={styles.usageText}>
              {item.max_uses
                ? t('promotions.uses', {
                    used: item.current_uses.toString(),
                    limit: item.max_uses.toString(),
                  })
                : t('promotions.usesUnlimited', {
                    used: item.current_uses.toString(),
                  })}
            </Text>
            {item.max_uses && (
              <View style={{ flex: 1, marginLeft: 12 }}>
                <ProgressBar
                  progress={usagePercent}
                  color={usagePercent >= 1 ? colors.warning : colors.primary}
                  style={styles.usageBar}
                />
              </View>
            )}
          </View>

          {/* Toggle active/inactive */}
          {(item.status === 'active' || item.status === 'inactive') && (
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>
                {item.status === 'active'
                  ? t('promotions.deactivate')
                  : t('promotions.activate')}
              </Text>
              <Switch
                value={item.status === 'active'}
                onValueChange={() => handleToggleStatus(item)}
                disabled={togglingId === item.id}
                color={colors.primary}
              />
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderCreateModal = () => (
    <Modal
      visible={showCreateModal}
      transparent
      animationType="slide"
      onRequestClose={() => setShowCreateModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('promotions.create')}</Text>
            <IconButton
              icon="close"
              size={24}
              onPress={() => setShowCreateModal(false)}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            />
          </View>

          <ScrollView style={styles.modalBody}>
            {/* Code */}
            <Text style={styles.formLabel}>{t('promotions.code')}</Text>
            <RNTextInput
              style={styles.formInput}
              value={formCode}
              onChangeText={(text) => setFormCode(text.toUpperCase().replace(/\s/g, ''))}
              placeholder={t('placeholders.promoCode')}
              placeholderTextColor={colors.inputPlaceholder}
              autoCapitalize="characters"
              maxLength={20}
              accessibilityLabel={t('promotions.code')}
            />

            {/* Title */}
            <Text style={styles.formLabel}>{t('promotions.title')}</Text>
            <RNTextInput
              style={styles.formInput}
              value={formTitle}
              onChangeText={setFormTitle}
              placeholder={t('promotions.title')}
              placeholderTextColor={colors.inputPlaceholder}
              accessibilityLabel={t('promotions.title')}
            />

            {/* Description */}
            <Text style={styles.formLabel}>{t('common.description') || 'Description'}</Text>
            <RNTextInput
              style={[styles.formInput, { height: 60, textAlignVertical: 'top' }]}
              value={formDescription}
              onChangeText={setFormDescription}
              multiline
              placeholderTextColor={colors.inputPlaceholder}
              accessibilityLabel={t('common.description') || 'Description'}
            />

            {/* Promotion Type */}
            <Text style={styles.formLabel}>{t('promotions.discountType')}</Text>
            <View style={styles.typeChipRow}>
              {PROMOTION_TYPES.map((pt) => (
                <Chip
                  key={pt.value}
                  selected={formType === pt.value}
                  onPress={() => setFormType(pt.value)}
                  style={styles.filterChip}
                >
                  {t(pt.labelKey)}
                </Chip>
              ))}
            </View>

            {/* Discount Value */}
            {(formType === 'percentage' || formType === 'fixed' || formType === 'happy_hour') && (
              <>
                <Text style={styles.formLabel}>{t('promotions.discountValue')}</Text>
                <RNTextInput
                  style={styles.formInput}
                  value={formDiscountValue}
                  onChangeText={setFormDiscountValue}
                  keyboardType="numeric"
                  placeholder={formType === 'percentage' ? '10' : '1500'}
                  placeholderTextColor={colors.inputPlaceholder}
                  accessibilityLabel={t('promotions.discountValue')}
                />
              </>
            )}

            {/* Min Order Value */}
            <Text style={styles.formLabel}>{t('promotions.minOrder')}</Text>
            <RNTextInput
              style={styles.formInput}
              value={formMinOrder}
              onChangeText={setFormMinOrder}
              keyboardType="numeric"
              placeholder={t('placeholders.minOrderValue')}
              placeholderTextColor={colors.inputPlaceholder}
              accessibilityLabel={t('promotions.minOrder')}
            />

            {/* Valid From */}
            <Text style={styles.formLabel}>{t('promotions.validFrom')}</Text>
            <RNTextInput
              style={styles.formInput}
              value={formValidFrom}
              onChangeText={setFormValidFrom}
              placeholder={t('placeholders.dateFormatISO')}
              placeholderTextColor={colors.inputPlaceholder}
              accessibilityLabel={t('promotions.validFrom')}
            />

            {/* Valid Until */}
            <Text style={styles.formLabel}>{t('promotions.validUntil', { date: '' }).replace(': ', '')}</Text>
            <RNTextInput
              style={styles.formInput}
              value={formValidUntil}
              onChangeText={setFormValidUntil}
              placeholder={t('placeholders.dateFormatEndISO')}
              placeholderTextColor={colors.inputPlaceholder}
              accessibilityLabel={t('promotions.validUntil', { date: '' })}
            />

            {/* Max Uses */}
            <Text style={styles.formLabel}>{t('promotions.maxUses')}</Text>
            <RNTextInput
              style={styles.formInput}
              value={formMaxUses}
              onChangeText={setFormMaxUses}
              keyboardType="numeric"
              placeholder={t('promotions.unlimited')}
              placeholderTextColor={colors.inputPlaceholder}
              accessibilityLabel={t('promotions.maxUses')}
            />

            {/* Happy Hour: Days of Week */}
            {formType === 'happy_hour' && (
              <>
                <Text style={styles.formLabel}>
                  {t('promotions.happyHour.daysOfWeek')}
                </Text>
                <View style={styles.dayChipRow}>
                  {DAY_LABELS.map((label, index) => {
                    const isSelected = formDaysOfWeek.includes(index);
                    return (
                      <TouchableOpacity
                        key={index}
                        style={isSelected ? styles.dayChipActive : styles.dayChip}
                        onPress={() => {
                          setFormDaysOfWeek((prev) =>
                            isSelected
                              ? prev.filter((d) => d !== index)
                              : [...prev, index],
                          );
                        }}
                        accessibilityLabel={`${label} ${isSelected ? 'selected' : 'not selected'}`}
                        accessibilityRole="checkbox"
                      >
                        <Text
                          style={
                            isSelected
                              ? styles.dayChipTextActive
                              : styles.dayChipText
                          }
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.formLabel}>
                  {t('promotions.happyHour.hoursFrom')}
                </Text>
                <RNTextInput
                  style={styles.formInput}
                  value={formHoursFrom}
                  onChangeText={setFormHoursFrom}
                  placeholder={t('placeholders.happyHourStart')}
                  placeholderTextColor={colors.inputPlaceholder}
                  accessibilityLabel={t('promotions.happyHour.hoursFrom')}
                />

                <Text style={styles.formLabel}>
                  {t('promotions.happyHour.hoursUntil')}
                </Text>
                <RNTextInput
                  style={styles.formInput}
                  value={formHoursUntil}
                  onChangeText={setFormHoursUntil}
                  placeholder={t('placeholders.happyHourEnd')}
                  placeholderTextColor={colors.inputPlaceholder}
                  accessibilityLabel={t('promotions.happyHour.hoursUntil')}
                />
              </>
            )}

            {/* Bottom spacing */}
            <View style={{ height: 20 }} />
          </ScrollView>

          <View style={styles.modalActions}>
            <Button
              mode="outlined"
              onPress={() => setShowCreateModal(false)}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              {t('common.cancel')}
            </Button>
            <Button
              mode="contained"
              onPress={handleCreate}
              loading={creating}
              disabled={creating || !formCode.trim() || !formTitle.trim()}
              accessibilityRole="button"
              accessibilityLabel={t('promotions.create')}
            >
              {t('promotions.create')}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );

  return (
    <ScreenContainer hasKeyboard>
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('promotions.title')}</Text>
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        <Chip
          selected={filter === 'all'}
          onPress={() => setFilter('all')}
          style={styles.filterChip}
          accessibilityRole="button"
          accessibilityLabel={t('promotions.filterAll')}
          accessibilityState={{ selected: filter === 'all' }}
        >
          {t('promotions.filterAll')}
        </Chip>
        <Chip
          selected={filter === 'active'}
          onPress={() => setFilter('active')}
          style={styles.filterChip}
          accessibilityRole="button"
          accessibilityLabel={t('promotions.filterActive')}
          accessibilityState={{ selected: filter === 'active' }}
        >
          {t('promotions.filterActive')}
        </Chip>
        <Chip
          selected={filter === 'expired'}
          onPress={() => setFilter('expired')}
          style={styles.filterChip}
          accessibilityRole="button"
          accessibilityLabel={t('promotions.filterExpired')}
          accessibilityState={{ selected: filter === 'expired' }}
        >
          {t('promotions.filterExpired')}
        </Chip>
      </View>

      {/* Promotions List */}
      <FlatList
        data={filteredPromotions}
        renderItem={renderPromoCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 80 }}
        getItemLayout={(_, index) => ({
          length: 160,
          offset: 160 * index,
          index,
        })}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <IconButton
                icon="tag-off-outline"
                size={64}
                iconColor={colors.foregroundMuted}
              />
              <Text style={styles.emptyText}>
                {t('promotions.noPromotions')}
              </Text>
            </View>
          ) : null
        }
      />

      {/* FAB to create */}
      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => {
          resetForm();
          setShowCreateModal(true);
        }}
        color={colors.premiumCardForeground}
        accessibilityRole="button"
        accessibilityLabel={t('promotions.create')}
      />

      {/* Create Modal */}
      {renderCreateModal()}
    </View>
    </ScreenContainer>
  );
}
