/**
 * BillsScreen - Accounts Payable Management
 *
 * Lists bills (pending, paid, overdue tabs), supports creating/editing
 * bills via modal, marking as paid, and recurring badge.
 * All strings via t() for i18n compliance.
 *
 * @module restaurant/screens/financial
 */

import React, { useState, useMemo, useCallback } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  Modal,
} from 'react-native';
import {
  Text,
  Card,
  Button,
  Chip,
  FAB,
  TextInput,
  SegmentedButtons,
  ActivityIndicator,
  IconButton,
  Divider,
} from 'react-native-paper';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ApiService from '@/shared/services/api';
import { useI18n } from '@/shared/hooks/useI18n';
import { formatCurrency } from '@okinawa/shared/utils/formatters';
import { getLanguage } from '@okinawa/shared/i18n';
import { useColors } from '@/shared/theme';
import { useRestaurant } from '@/shared/contexts/RestaurantContext';
import { billSchema, validateForm } from '@okinawa/shared/validation/schemas';

// ────────── Types ──────────

type BillStatus = 'pending' | 'paid' | 'overdue' | 'cancelled';
type BillCategory =
  | 'rent'
  | 'utilities'
  | 'supplies'
  | 'staff'
  | 'marketing'
  | 'maintenance'
  | 'other';

interface Bill {
  id: string;
  restaurant_id: string;
  description: string;
  supplier: string | null;
  category: BillCategory;
  amount: number;
  due_date: string;
  paid_date: string | null;
  status: BillStatus;
  is_recurring: boolean;
  recurrence: string | null;
  created_at: string;
}

// ────────── Category Colors ──────────

const getCATEGORY_COLORS = (colors: any): Record<BillCategory, string> => ({
  rent: colors.statusDelivering,
  utilities: colors.warning,
  supplies: colors.success,
  staff: colors.info,
  marketing: colors.errorLight,
  maintenance: colors.statusDelivering,
  other: colors.foregroundSecondary,
});

// ────────── Main Component ──────────

export default function BillsScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const CATEGORY_COLORS = getCATEGORY_COLORS(colors);
  const { restaurantId } = useRestaurant();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);

  // Form state
  const [formDescription, setFormDescription] = useState('');
  const [formSupplier, setFormSupplier] = useState('');
  const [formCategory, setFormCategory] = useState<BillCategory>('supplies');
  const [formAmount, setFormAmount] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [formIsRecurring, setFormIsRecurring] = useState(false);
  const [formRecurrence, setFormRecurrence] = useState<string>('monthly');

  const styles = useMemo(() => createStyles(colors), [colors]);

  // ────────── Queries ──────────

  const {
    data: bills = [],
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<Bill[]>({
    queryKey: ['bills', restaurantId, statusFilter],
    queryFn: () => ApiService.getBills(restaurantId!, statusFilter),
    enabled: !!restaurantId,
  });

  // ────────── Mutations ──────────

  const createMutation = useMutation({
    mutationFn: (data: any) => ApiService.createBill(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      ApiService.updateBill(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      closeModal();
    },
  });

  const payMutation = useMutation({
    mutationFn: (id: string) => ApiService.markBillPaid(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => ApiService.deleteBill(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
    },
  });

  // ────────── Handlers ──────────

  const openCreateModal = useCallback(() => {
    setEditingBill(null);
    setFormDescription('');
    setFormSupplier('');
    setFormCategory('supplies');
    setFormAmount('');
    setFormDueDate('');
    setFormIsRecurring(false);
    setFormRecurrence('monthly');
    setModalVisible(true);
  }, []);

  const openEditModal = useCallback((bill: Bill) => {
    setEditingBill(bill);
    setFormDescription(bill.description);
    setFormSupplier(bill.supplier || '');
    setFormCategory(bill.category);
    setFormAmount(String(bill.amount));
    setFormDueDate(bill.due_date.split('T')[0]);
    setFormIsRecurring(bill.is_recurring);
    setFormRecurrence(bill.recurrence || 'monthly');
    setModalVisible(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setEditingBill(null);
  }, []);

  const handleSubmit = useCallback(() => {
    // Validate with Zod schema
    const parsedAmount = parseFloat(formAmount);
    const result = validateForm(billSchema, {
      description: formDescription,
      supplier: formSupplier || '',
      amount: isNaN(parsedAmount) ? 0 : parsedAmount,
      dueDate: formDueDate,
      category: formCategory || undefined,
      isRecurring: formIsRecurring,
    });

    if (!result.success) {
      Alert.alert(t('common.error'), Object.values(result.errors)[0]);
      return;
    }

    const data = {
      restaurant_id: restaurantId!,
      description: formDescription,
      supplier: formSupplier || undefined,
      category: formCategory,
      amount: parsedAmount,
      due_date: formDueDate,
      is_recurring: formIsRecurring,
      recurrence: formIsRecurring ? formRecurrence : undefined,
    };

    if (editingBill) {
      const { restaurant_id, ...updateData } = data;
      updateMutation.mutate({ id: editingBill.id, data: updateData });
    } else {
      createMutation.mutate(data);
    }
  }, [
    restaurantId,
    formDescription,
    formSupplier,
    formCategory,
    formAmount,
    formDueDate,
    formIsRecurring,
    formRecurrence,
    editingBill,
    t,
  ]);

  const handleMarkPaid = useCallback(
    (bill: Bill) => {
      Alert.alert(
        t('financial.bills.mark_paid'),
        t('financial.bills.mark_paid_confirm'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.confirm'),
            onPress: () => payMutation.mutate(bill.id),
          },
        ],
      );
    },
    [t],
  );

  const handleDelete = useCallback(
    (bill: Bill) => {
      Alert.alert(
        t('common.delete'),
        t('financial.bills.delete_confirm'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: () => deleteMutation.mutate(bill.id),
          },
        ],
      );
    },
    [t],
  );

  const getCategoryLabel = useCallback(
    (category: BillCategory): string => {
      const key = `financial.bills.categories.${category}` as any;
      return t(key);
    },
    [t],
  );

  // ────────── Loading State ──────────

  if (isLoading) {
    return (
      <ScreenContainer hasKeyboard>
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
      </ScreenContainer>
    );
  }

  // ────────── Render ──────────

  return (
    <ScreenContainer hasKeyboard>
    <View style={styles.container}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
      >
        {/* Status Filter Tabs */}
        <SegmentedButtons
          value={statusFilter}
          onValueChange={setStatusFilter}
          buttons={[
            { value: 'pending', label: t('financial.bills.pending') },
            { value: 'paid', label: t('financial.bills.paid') },
            { value: 'overdue', label: t('financial.bills.overdue') },
          ]}
          style={styles.segmentedButtons}
        />

        {/* Bills List */}
        {bills.length === 0 ? (
          <View style={styles.emptyState}>
            <IconButton
              icon="file-document-outline"
              size={48}
              iconColor={colors.mutedForeground}
            />
            <Text variant="bodyLarge" style={styles.emptyText}>
              {t('financial.bills.no_bills')}
            </Text>
          </View>
        ) : (
          bills.map((bill) => (
            <Card key={bill.id} style={styles.billCard}>
              <Card.Content>
                <View style={styles.billHeader}>
                  <View style={styles.billInfo}>
                    <View style={styles.billTitleRow}>
                      <Text
                        variant="titleMedium"
                        style={styles.billDescription}
                        numberOfLines={1}
                      >
                        {bill.description}
                      </Text>
                      {bill.is_recurring && (
                        <Chip
                          compact
                          style={styles.recurringChip}
                          textStyle={styles.recurringChipText}
                        >
                          {t('financial.bills.recurring')}
                        </Chip>
                      )}
                    </View>
                    {bill.supplier && (
                      <Text variant="bodySmall" style={styles.supplierText}>
                        {bill.supplier}
                      </Text>
                    )}
                  </View>
                  <Text
                    variant="titleLarge"
                    style={{
                      color:
                        bill.status === 'paid'
                          ? colors.success
                          : bill.status === 'overdue'
                          ? colors.error
                          : colors.foreground,
                      fontWeight: 'bold',
                    }}
                  >
                    {formatCurrency(Number(bill.amount), getLanguage())}
                  </Text>
                </View>

                <View style={styles.billMeta}>
                  <Chip
                    compact
                    style={{
                      backgroundColor: CATEGORY_COLORS[bill.category] + '20',
                    }}
                    textStyle={{
                      color: CATEGORY_COLORS[bill.category],
                      fontSize: 12,
                    }}
                  >
                    {getCategoryLabel(bill.category)}
                  </Chip>
                  <Text variant="bodySmall" style={styles.dateText}>
                    {t('financial.bills.due_date')}:{' '}
                    {new Date(bill.due_date).toLocaleDateString(getLanguage())}
                  </Text>
                </View>

                {bill.status === 'pending' && (
                  <View style={styles.billActions}>
                    <Button
                      mode="contained"
                      compact
                      onPress={() => handleMarkPaid(bill)}
                      icon="check"
                      style={styles.payButton}
                    >
                      {t('financial.bills.mark_paid')}
                    </Button>
                    <IconButton
                      icon="pencil"
                      size={18}
                      onPress={() => openEditModal(bill)}
                      iconColor={colors.primary}
                      accessibilityLabel="Edit bill"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    />
                    <IconButton
                      icon="delete"
                      size={18}
                      onPress={() => handleDelete(bill)}
                      iconColor={colors.error}
                      accessibilityLabel="Delete bill"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    />
                  </View>
                )}

                {bill.status === 'paid' && bill.paid_date && (
                  <Text variant="bodySmall" style={styles.paidDate}>
                    {t('financial.bills.paid_date')}:{' '}
                    {new Date(bill.paid_date).toLocaleDateString(getLanguage())}
                  </Text>
                )}
              </Card.Content>
            </Card>
          ))
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* FAB: Create Bill */}
      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: colors.primary }]}
        color={colors.premiumCardForeground}
        onPress={openCreateModal}
        label={t('financial.bills.create')}
      />

      {/* Create/Edit Bill Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text variant="titleLarge" style={{ color: colors.foreground }}>
                {editingBill
                  ? t('financial.bills.edit')
                  : t('financial.bills.create')}
              </Text>
              <IconButton icon="close" onPress={closeModal} accessibilityLabel="Close" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} />
            </View>

            <ScrollView style={styles.modalForm}>
              <TextInput
                label={t('financial.bills.description')}
                value={formDescription}
                onChangeText={setFormDescription}
                mode="outlined"
                style={styles.input}
              />

              <TextInput
                label={t('financial.bills.supplier')}
                value={formSupplier}
                onChangeText={setFormSupplier}
                mode="outlined"
                style={styles.input}
              />

              <Text variant="labelMedium" style={styles.fieldLabel}>
                {t('financial.cogs.category')}
              </Text>
              <View style={styles.categoryRow}>
                {(
                  [
                    'rent',
                    'utilities',
                    'supplies',
                    'staff',
                    'marketing',
                    'maintenance',
                    'other',
                  ] as BillCategory[]
                ).map((cat) => (
                  <Chip
                    key={cat}
                    selected={formCategory === cat}
                    onPress={() => setFormCategory(cat)}
                    compact
                    style={[
                      styles.categoryChip,
                      formCategory === cat && {
                        backgroundColor: CATEGORY_COLORS[cat] + '30',
                      },
                    ]}
                    textStyle={{ fontSize: 12 }}
                  >
                    {getCategoryLabel(cat)}
                  </Chip>
                ))}
              </View>

              <TextInput
                label={t('financial.bills.amount')}
                value={formAmount}
                onChangeText={setFormAmount}
                mode="outlined"
                keyboardType="decimal-pad"
                left={<TextInput.Affix text="R$" />}
                style={styles.input}
              />

              <TextInput
                label={t('financial.bills.due_date') + ' (YYYY-MM-DD)'}
                value={formDueDate}
                onChangeText={setFormDueDate}
                mode="outlined"
                placeholder={t('placeholders.dateFormatISO')}
                style={styles.input}
              />

              <Divider style={styles.divider} />

              <View style={styles.recurringRow}>
                <Text variant="bodyMedium" style={{ color: colors.foreground }}>
                  {t('financial.bills.recurring')}
                </Text>
                <Chip
                  selected={formIsRecurring}
                  onPress={() => setFormIsRecurring(!formIsRecurring)}
                >
                  {formIsRecurring ? t('common.yes') : t('common.no')}
                </Chip>
              </View>

              {formIsRecurring && (
                <SegmentedButtons
                  value={formRecurrence}
                  onValueChange={setFormRecurrence}
                  buttons={[
                    { value: 'weekly', label: t('financial.week') },
                    { value: 'monthly', label: t('financial.month') },
                    { value: 'yearly', label: t('financial.year') },
                  ]}
                  style={styles.recurrenceButtons}
                />
              )}
            </ScrollView>

            <Button
              mode="contained"
              onPress={handleSubmit}
              loading={createMutation.isPending || updateMutation.isPending}
              disabled={
                !formDescription || !formAmount || !formDueDate
              }
              style={styles.submitButton}
            >
              {t('common.save')}
            </Button>
          </View>
        </View>
      </Modal>
    </View>
    </ScreenContainer>
  );
}

// ────────── Styles ──────────

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.backgroundSecondary,
    },
    center: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    segmentedButtons: {
      margin: 16,
    },
    emptyState: {
      alignItems: 'center',
      padding: 48,
      gap: 8,
    },
    emptyText: {
      color: colors.mutedForeground,
    },
    billCard: {
      marginHorizontal: 16,
      marginBottom: 8,
      elevation: 1,
      backgroundColor: colors.card,
    },
    billHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    billInfo: {
      flex: 1,
      marginRight: 12,
    },
    billTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    billDescription: {
      color: colors.foreground,
      flexShrink: 1,
    },
    recurringChip: {
      backgroundColor: colors.info + '20',
      height: 24,
    },
    recurringChipText: {
      fontSize: 10,
      color: colors.info,
    },
    supplierText: {
      color: colors.mutedForeground,
      marginTop: 2,
    },
    billMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 8,
    },
    dateText: {
      color: colors.mutedForeground,
    },
    billActions: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
      gap: 4,
    },
    payButton: {
      flex: 1,
    },
    paidDate: {
      color: colors.success,
      marginTop: 8,
    },
    fab: {
      position: 'absolute',
      right: 16,
      bottom: 16,
    },
    // Modal
    modalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalContent: {
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      maxHeight: '85%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    modalForm: {
      maxHeight: 400,
    },
    input: {
      marginBottom: 12,
    },
    fieldLabel: {
      color: colors.foreground,
      marginBottom: 8,
    },
    categoryRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 16,
    },
    categoryChip: {
      marginBottom: 4,
    },
    divider: {
      marginVertical: 12,
    },
    recurringRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    recurrenceButtons: {
      marginBottom: 16,
    },
    submitButton: {
      marginTop: 16,
    },
  });
