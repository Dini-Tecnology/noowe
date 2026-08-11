/**
 * CashRegisterScreen - Cash Register Management
 *
 * Full cash register workflow: open session, record movements
 * (sangria/reforco), view balance, and close with reconciliation.
 *
 * @module restaurant/screens/cash-register
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import {
  Text,
  Button,
  TextInput,
  FAB,
  Portal,
  Modal,
  ActivityIndicator,
  Divider,
  SegmentedButtons,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { useI18n } from '@/shared/hooks/useI18n';
import { useWebSocket } from '@/shared/hooks/useWebSocket';
import { useRestaurant } from '@/shared/contexts/RestaurantContext';
import { formatCurrency } from '@okinawa/shared/utils/formatters';
import { getLanguage } from '@okinawa/shared/i18n';
import ApiService from '@/shared/services/api';
import { Card } from '@okinawa/shared/components';
import * as Haptics from 'expo-haptics';

interface CashMovement {
  id: string;
  type: 'sale' | 'sangria' | 'reforco' | 'refund';
  amount: number;
  description: string;
  created_at: string;
  created_by?: string;
}

interface CashSession {
  id: string;
  opening_balance: number;
  current_balance: number;
  expected_balance: number;
  status: 'open' | 'closed';
  opened_at: string;
  closed_at?: string;
  opened_by: string;
  closed_by?: string;
  actual_balance?: number;
  difference?: number;
  closing_notes?: string;
  movements: CashMovement[];
}

interface HistorySession {
  id: string;
  opening_balance: number;
  actual_balance: number;
  expected_balance: number;
  difference: number;
  opened_at: string;
  closed_at: string;
  opened_by: string;
  closed_by: string;
  closing_notes?: string;
}

type TabValue = 'current' | 'history';

export default function CashRegisterScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const { restaurantId } = useRestaurant();
  const { connected, on, off, emit } = useWebSocket('/');
  const locale = getLanguage();

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [session, setSession] = useState<CashSession | null>(null);
  const [history, setHistory] = useState<HistorySession[]>([]);
  const [tab, setTab] = useState<TabValue>('current');
  const [fabOpen, setFabOpen] = useState(false);

  // Open register state
  const [openingBalance, setOpeningBalance] = useState('');
  const [openingLoading, setOpeningLoading] = useState(false);

  // Movement modal state
  const [movementModal, setMovementModal] = useState(false);
  const [movementType, setMovementType] = useState<'sangria' | 'reforco'>('sangria');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementDescription, setMovementDescription] = useState('');
  const [movementLoading, setMovementLoading] = useState(false);

  // Close register state
  const [closeModal, setCloseModal] = useState(false);
  const [actualBalance, setActualBalance] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [closeLoading, setCloseLoading] = useState(false);

  // Expanded history session
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  // Load data
  const loadSession = useCallback(async () => {
    if (!restaurantId) return;
    try {
      const data = await ApiService.getCurrentCashRegister(restaurantId);
      setSession(data?.status === 'open' ? data : null);
    } catch {
      setSession(null);
    }
  }, [restaurantId]);

  const loadHistory = useCallback(async () => {
    if (!restaurantId) return;
    try {
      const data = await ApiService.getCashRegisterHistory(restaurantId);
      setHistory(data || []);
    } catch {
      setHistory([]);
    }
  }, [restaurantId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadSession(), loadHistory()]);
    setLoading(false);
  }, [loadSession, loadHistory]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadSession(), loadHistory()]);
    setRefreshing(false);
  }, [loadSession, loadHistory]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Real-time: refresh cash register when a payment is completed
  useEffect(() => {
    if (!restaurantId || !connected) return;
    emit('restaurant:join', { restaurant_id: restaurantId });

    const onNotification = (data: any) => {
      if (
        data?.type === 'payment:completed' ||
        data?.type === 'tip:created' ||
        data?.type === 'tips:distributed' ||
        data?.type === 'tips:auto_distributed'
      ) {
        loadSession();
      }
    };
    on('notification', onNotification);

    return () => {
      off('notification', onNotification);
      emit('restaurant:leave', { restaurant_id: restaurantId });
    };
  }, [restaurantId, connected, emit, on, off, loadSession]);

  // Actions
  const handleOpenRegister = useCallback(async () => {
    const balance = parseFloat(openingBalance);
    if (isNaN(balance) || balance < 0) {
      Alert.alert(t('common.error'), t('financial.cash_register.opening_balance'));
      return;
    }
    setOpeningLoading(true);
    try {
      await ApiService.openCashRegister({
        restaurant_id: restaurantId!,
        opening_balance: balance,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setOpeningBalance('');
      await loadSession();
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || t('common.error'));
    } finally {
      setOpeningLoading(false);
    }
  }, [openingBalance, restaurantId, t, loadSession]);

  const handleAddMovement = useCallback(async () => {
    const amt = parseFloat(movementAmount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert(t('common.error'), t('financial.cash_register.amount'));
      return;
    }
    setMovementLoading(true);
    try {
      await ApiService.addCashMovement({
        session_id: session!.id,
        type: movementType,
        amount: amt,
        description: movementDescription || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMovementModal(false);
      setMovementAmount('');
      setMovementDescription('');
      await loadSession();
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || t('common.error'));
    } finally {
      setMovementLoading(false);
    }
  }, [movementAmount, movementType, movementDescription, session, t, loadSession]);

  const handleCloseRegister = useCallback(async () => {
    const actual = parseFloat(actualBalance);
    if (isNaN(actual) || actual < 0) {
      Alert.alert(t('common.error'), t('financial.cash_register.actual_balance'));
      return;
    }
    setCloseLoading(true);
    try {
      await ApiService.closeCashRegister({
        session_id: session!.id,
        actual_balance: actual,
        closing_notes: closingNotes || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCloseModal(false);
      setActualBalance('');
      setClosingNotes('');
      setSession(null);
      await Promise.all([loadSession(), loadHistory()]);
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || t('common.error'));
    } finally {
      setCloseLoading(false);
    }
  }, [actualBalance, closingNotes, session, t, loadSession, loadHistory]);

  // Computed values for close modal
  const expectedBalance = session?.expected_balance ?? session?.current_balance ?? 0;
  const actualBalanceNum = parseFloat(actualBalance) || 0;
  const difference = actualBalanceNum - expectedBalance;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        centered: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
        },
        segmented: {
          margin: 16,
        },
        // Open register card
        openCard: {
          margin: 16,
          padding: 24,
          backgroundColor: colors.card,
          borderRadius: 16,
          alignItems: 'center',
        },
        openIcon: {
          width: 80,
          height: 80,
          borderRadius: 40,
          backgroundColor: colors.primary + '20',
          justifyContent: 'center',
          alignItems: 'center',
          marginBottom: 16,
        },
        openTitle: {
          fontSize: 20,
          fontWeight: 'bold',
          color: colors.foreground,
          marginBottom: 8,
        },
        openSubtitle: {
          fontSize: 14,
          color: colors.mutedForeground,
          textAlign: 'center',
          marginBottom: 24,
        },
        openInput: {
          width: '100%',
          marginBottom: 16,
          backgroundColor: colors.background,
        },
        // Current session header
        balanceHeader: {
          backgroundColor: colors.primary,
          padding: 24,
          alignItems: 'center',
          borderBottomLeftRadius: 24,
          borderBottomRightRadius: 24,
        },
        balanceLabel: {
          fontSize: 14,
          color: 'rgba(255,255,255,0.8)',
          marginBottom: 4,
        },
        balanceAmount: {
          fontSize: 36,
          fontWeight: 'bold',
          color: colors.premiumCardForeground,
          marginBottom: 4,
        },
        openingInfo: {
          fontSize: 12,
          color: 'rgba(255,255,255,0.6)',
        },
        // Movements list
        movementsHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingTop: 20,
          paddingBottom: 8,
        },
        movementsTitle: {
          fontSize: 16,
          fontWeight: '600',
          color: colors.foreground,
        },
        movementCard: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: colors.card,
          marginHorizontal: 16,
          marginBottom: 8,
          borderRadius: 12,
        },
        movementIconContainer: {
          width: 40,
          height: 40,
          borderRadius: 20,
          justifyContent: 'center',
          alignItems: 'center',
          marginRight: 12,
        },
        movementInfo: {
          flex: 1,
        },
        movementType: {
          fontSize: 14,
          fontWeight: '600',
          color: colors.foreground,
        },
        movementDesc: {
          fontSize: 12,
          color: colors.mutedForeground,
          marginTop: 2,
        },
        movementAmount: {
          fontSize: 16,
          fontWeight: 'bold',
        },
        movementTime: {
          fontSize: 12,
          color: colors.mutedForeground,
          marginTop: 2,
          textAlign: 'right',
        },
        emptyMovements: {
          textAlign: 'center',
          color: colors.mutedForeground,
          padding: 32,
          fontSize: 14,
        },
        closeButton: {
          margin: 16,
          marginBottom: 100,
        },
        // Modal
        modalContainer: {
          backgroundColor: colors.card,
          margin: 24,
          borderRadius: 16,
          padding: 24,
        },
        modalTitle: {
          fontSize: 18,
          fontWeight: 'bold',
          color: colors.foreground,
          marginBottom: 16,
        },
        modalInput: {
          marginBottom: 12,
          backgroundColor: colors.background,
        },
        modalButtons: {
          flexDirection: 'row',
          justifyContent: 'flex-end',
          gap: 12,
          marginTop: 16,
        },
        // Close flow
        closeRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingVertical: 8,
        },
        closeLabel: {
          fontSize: 14,
          color: colors.mutedForeground,
        },
        closeValue: {
          fontSize: 14,
          fontWeight: '600',
          color: colors.foreground,
        },
        differenceRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingVertical: 12,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          marginTop: 8,
        },
        differenceLabel: {
          fontSize: 16,
          fontWeight: 'bold',
          color: colors.foreground,
        },
        // History
        historyCard: {
          backgroundColor: colors.card,
          marginHorizontal: 16,
          marginBottom: 12,
          borderRadius: 12,
          padding: 16,
        },
        historyHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        historyDate: {
          fontSize: 14,
          fontWeight: '600',
          color: colors.foreground,
        },
        historyBadge: {
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 8,
        },
        historyBadgeText: {
          fontSize: 12,
          fontWeight: '600',
        },
        historyDetails: {
          marginTop: 12,
        },
        historyRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingVertical: 4,
        },
        historyLabel: {
          fontSize: 14,
          color: colors.mutedForeground,
        },
        historyValue: {
          fontSize: 14,
          fontWeight: '500',
          color: colors.foreground,
        },
        emptyHistory: {
          textAlign: 'center',
          color: colors.mutedForeground,
          padding: 48,
          fontSize: 14,
        },
      }),
    [colors],
  );

  // Loading state
  if (loading) {
    return (
      <ScreenContainer hasKeyboard>
      <View style={styles.centered}>
        <ActivityIndicator animating size="large" color={colors.primary} />
        <Text style={{ color: colors.mutedForeground, marginTop: 12 }}>
          {t('common.loading')}
        </Text>
      </View>
      </ScreenContainer>
    );
  }

  // Movement type config
  const getMovementConfig = (type: string) => {
    switch (type) {
      case 'sale':
        return { icon: 'cart', color: colors.success, label: t('orders.title') };
      case 'sangria':
        return { icon: 'cash-minus', color: colors.destructive, label: t('financial.cash_register.sangria') };
      case 'reforco':
        return { icon: 'cash-plus', color: colors.info, label: t('financial.cash_register.reforco') };
      case 'refund':
        return { icon: 'cash-refund', color: colors.warning, label: t('common.cancel') };
      default:
        return { icon: 'cash', color: colors.mutedForeground, label: type };
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // Render no open session (open register card)
  const renderOpenRegister = () => (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      <View style={styles.openCard}>
        <View style={styles.openIcon}>
          <Icon name="cash-register" size={40} color={colors.primary} />
        </View>
        <Text style={styles.openTitle}>{t('financial.cash_register.no_open_session')}</Text>
        <Text style={styles.openSubtitle}>{t('financial.cash_register.open_prompt')}</Text>
        <TextInput
          mode="outlined"
          label={t('financial.cash_register.opening_balance')}
          value={openingBalance}
          onChangeText={setOpeningBalance}
          keyboardType="decimal-pad"
          style={styles.openInput}
          outlineColor={colors.border}
          activeOutlineColor={colors.primary}
          left={<TextInput.Affix text="R$" />}
        />
        <Button
          mode="contained"
          onPress={handleOpenRegister}
          loading={openingLoading}
          disabled={openingLoading || !openingBalance}
          buttonColor={colors.primary}
          icon="lock-open"
        >
          {t('financial.cash_register.open')}
        </Button>
      </View>
    </ScrollView>
  );

  // Render movement item
  const renderMovementItem = ({ item }: { item: CashMovement }) => {
    const config = getMovementConfig(item.type);
    const isNegative = item.type === 'sangria' || item.type === 'refund';

    return (
      <View style={styles.movementCard}>
        <View
          style={[
            styles.movementIconContainer,
            { backgroundColor: config.color + '20' },
          ]}
        >
          <Icon name={config.icon} size={20} color={config.color} />
        </View>
        <View style={styles.movementInfo}>
          <Text style={styles.movementType}>{config.label}</Text>
          {item.description ? (
            <Text style={styles.movementDesc}>{item.description}</Text>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text
            style={[
              styles.movementAmount,
              { color: isNegative ? colors.destructive : colors.success },
            ]}
          >
            {isNegative ? '-' : '+'}{formatCurrency(item.amount, locale)}
          </Text>
          <Text style={styles.movementTime}>{formatTime(item.created_at)}</Text>
        </View>
      </View>
    );
  };

  // Render current session
  const renderCurrentSession = () => {
    if (!session) return renderOpenRegister();

    const movements = [...(session.movements || [])].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    return (
      <FlatList
        data={movements}
        keyExtractor={(item) => item.id}
        renderItem={renderMovementItem}
        getItemLayout={(_, index) => ({
          length: 72,
          offset: 72 * index,
          index,
        })}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <>
            {/* Balance Header */}
            <View style={styles.balanceHeader}>
              <Text style={styles.balanceLabel}>
                {t('financial.cash_register.current_balance')}
              </Text>
              <Text style={styles.balanceAmount}>
                {formatCurrency(session.current_balance, locale)}
              </Text>
              <Text style={styles.openingInfo}>
                {t('financial.cash_register.opening_balance')}: {formatCurrency(session.opening_balance, locale)}
              </Text>
            </View>

            {/* Movements Header */}
            <View style={styles.movementsHeader}>
              <Text style={styles.movementsTitle}>
                {t('financial.cash_register.movements')}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>
                {movements.length}
              </Text>
            </View>
          </>
        }
        ListEmptyComponent={
          <Text style={styles.emptyMovements}>
            {t('common.noResults')}
          </Text>
        }
        ListFooterComponent={
          <Button
            mode="outlined"
            onPress={() => setCloseModal(true)}
            style={styles.closeButton}
            textColor={colors.destructive}
            icon="lock"
          >
            {t('financial.cash_register.close')}
          </Button>
        }
      />
    );
  };

  // Render history tab
  const renderHistory = () => (
    <FlatList
      data={history}
      keyExtractor={(item) => item.id}
      getItemLayout={(_, index) => ({
        length: 100,
        offset: 100 * index,
        index,
      })}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
      contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }}
      renderItem={({ item }) => {
        const isExpanded = expandedSessionId === item.id;
        const diff = item.difference || 0;
        const diffColor = diff > 0 ? colors.success : diff < 0 ? colors.destructive : colors.foreground;
        const diffLabel = diff > 0
          ? t('financial.cash_register.surplus')
          : diff < 0
          ? t('financial.cash_register.shortage')
          : '';

        return (
          <View
            style={styles.historyCard}
          >
            <View style={styles.historyHeader}>
              <View>
                <Text style={styles.historyDate}>{formatDate(item.opened_at)}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>
                  {t('financial.cash_register.opened_by')}: {item.opened_by}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                {diff !== 0 && (
                  <View
                    style={[
                      styles.historyBadge,
                      { backgroundColor: diffColor + '20' },
                    ]}
                  >
                    <Text style={[styles.historyBadgeText, { color: diffColor }]}>
                      {diffLabel}: {formatCurrency(Math.abs(diff), locale)}
                    </Text>
                  </View>
                )}
                <Icon
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={colors.mutedForeground}
                  onPress={() =>
                    setExpandedSessionId(isExpanded ? null : item.id)
                  }
                  style={{ marginTop: 4 }}
                />
              </View>
            </View>

            {isExpanded && (
              <View style={styles.historyDetails}>
                <Divider style={{ marginBottom: 8 }} />
                <View style={styles.historyRow}>
                  <Text style={styles.historyLabel}>
                    {t('financial.cash_register.opening_balance')}
                  </Text>
                  <Text style={styles.historyValue}>
                    {formatCurrency(item.opening_balance, locale)}
                  </Text>
                </View>
                <View style={styles.historyRow}>
                  <Text style={styles.historyLabel}>
                    {t('financial.cash_register.expected_balance')}
                  </Text>
                  <Text style={styles.historyValue}>
                    {formatCurrency(item.expected_balance, locale)}
                  </Text>
                </View>
                <View style={styles.historyRow}>
                  <Text style={styles.historyLabel}>
                    {t('financial.cash_register.actual_balance')}
                  </Text>
                  <Text style={styles.historyValue}>
                    {formatCurrency(item.actual_balance, locale)}
                  </Text>
                </View>
                <View style={[styles.historyRow, { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4, paddingTop: 8 }]}>
                  <Text style={[styles.historyLabel, { fontWeight: 'bold' }]}>
                    {t('financial.cash_register.difference')}
                  </Text>
                  <Text style={[styles.historyValue, { color: diffColor, fontWeight: 'bold' }]}>
                    {formatCurrency(diff, locale)}
                  </Text>
                </View>
                {item.closing_notes ? (
                  <View style={[styles.historyRow, { marginTop: 4 }]}>
                    <Text style={styles.historyLabel}>
                      {t('financial.cash_register.closing_notes')}
                    </Text>
                    <Text style={[styles.historyValue, { flex: 1, textAlign: 'right', marginLeft: 16 }]}>
                      {item.closing_notes}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.historyRow}>
                  <Text style={styles.historyLabel}>
                    {t('financial.cash_register.closed_by')}
                  </Text>
                  <Text style={styles.historyValue}>{item.closed_by}</Text>
                </View>
              </View>
            )}
          </View>
        );
      }}
      ListEmptyComponent={
        <Text style={styles.emptyHistory}>{t('common.noResults')}</Text>
      }
    />
  );

  return (
    <ScreenContainer hasKeyboard>
    <View style={styles.container} accessibilityLabel="Cash register">
      {/* Tab selector */}
      <SegmentedButtons
        value={tab}
        onValueChange={(val) => setTab(val as TabValue)}
        buttons={[
          { value: 'current', label: t('financial.cash_register.title') },
          { value: 'history', label: t('financial.cash_register.history') },
        ]}
        style={styles.segmented}
      />

      {/* Content */}
      {tab === 'current' ? renderCurrentSession() : renderHistory()}

      {/* FAB for adding movements (only when session is open and on current tab) */}
      {session && tab === 'current' && (
        <Portal>
          <FAB.Group
            open={fabOpen}
            visible
            icon={fabOpen ? 'close' : 'plus'}
            actions={[
              {
                icon: 'cash-minus',
                label: t('financial.cash_register.sangria'),
                color: colors.destructive,
                onPress: () => {
                  setMovementType('sangria');
                  setMovementModal(true);
                },
              },
              {
                icon: 'cash-plus',
                label: t('financial.cash_register.reforco'),
                color: colors.success,
                onPress: () => {
                  setMovementType('reforco');
                  setMovementModal(true);
                },
              },
            ]}
            onStateChange={({ open }) => setFabOpen(open)}
            fabStyle={{ backgroundColor: colors.primary }}
            color={colors.premiumCardForeground}
          />
        </Portal>
      )}

      {/* Movement Modal */}
      <Portal>
        <Modal
          visible={movementModal}
          onDismiss={() => setMovementModal(false)}
          contentContainerStyle={styles.modalContainer}
        >
          <Text style={styles.modalTitle}>
            {movementType === 'sangria'
              ? t('financial.cash_register.sangria')
              : t('financial.cash_register.reforco')}
          </Text>
          <TextInput
            mode="outlined"
            label={t('financial.cash_register.amount')}
            value={movementAmount}
            onChangeText={setMovementAmount}
            keyboardType="decimal-pad"
            style={styles.modalInput}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
            left={<TextInput.Affix text="R$" />}
          />
          <TextInput
            mode="outlined"
            label={t('financial.cash_register.description')}
            value={movementDescription}
            onChangeText={setMovementDescription}
            style={styles.modalInput}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
            multiline
          />
          <View style={styles.modalButtons}>
            <Button
              mode="text"
              onPress={() => setMovementModal(false)}
              textColor={colors.mutedForeground}
            >
              {t('common.cancel')}
            </Button>
            <Button
              mode="contained"
              onPress={handleAddMovement}
              loading={movementLoading}
              disabled={movementLoading || !movementAmount}
              buttonColor={
                movementType === 'sangria' ? colors.destructive : colors.success
              }
            >
              {t('common.confirm')}
            </Button>
          </View>
        </Modal>
      </Portal>

      {/* Close Register Modal */}
      <Portal>
        <Modal
          visible={closeModal}
          onDismiss={() => setCloseModal(false)}
          contentContainerStyle={styles.modalContainer}
        >
          <Text style={styles.modalTitle}>
            {t('financial.cash_register.confirm_close')}
          </Text>
          <Text style={{ color: colors.mutedForeground, marginBottom: 16, fontSize: 14 }}>
            {t('financial.cash_register.close_prompt')}
          </Text>

          <TextInput
            mode="outlined"
            label={t('financial.cash_register.actual_balance')}
            value={actualBalance}
            onChangeText={setActualBalance}
            keyboardType="decimal-pad"
            style={styles.modalInput}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
            left={<TextInput.Affix text="R$" />}
          />

          {/* Reconciliation summary */}
          {actualBalance !== '' && (
            <>
              <View style={styles.closeRow}>
                <Text style={styles.closeLabel}>
                  {t('financial.cash_register.expected_balance')}
                </Text>
                <Text style={styles.closeValue}>
                  {formatCurrency(expectedBalance, locale)}
                </Text>
              </View>
              <View style={styles.closeRow}>
                <Text style={styles.closeLabel}>
                  {t('financial.cash_register.actual_balance')}
                </Text>
                <Text style={styles.closeValue}>
                  {formatCurrency(actualBalanceNum, locale)}
                </Text>
              </View>
              <View style={styles.differenceRow}>
                <Text style={styles.differenceLabel}>
                  {t('financial.cash_register.difference')}
                </Text>
                <Text
                  style={[
                    styles.differenceLabel,
                    {
                      color:
                        difference > 0
                          ? colors.success
                          : difference < 0
                          ? colors.destructive
                          : colors.foreground,
                    },
                  ]}
                >
                  {difference > 0
                    ? `+${formatCurrency(difference, locale)} (${t('financial.cash_register.surplus')})`
                    : difference < 0
                    ? `${formatCurrency(difference, locale)} (${t('financial.cash_register.shortage')})`
                    : formatCurrency(0, locale)}
                </Text>
              </View>
            </>
          )}

          <TextInput
            mode="outlined"
            label={t('financial.cash_register.closing_notes')}
            value={closingNotes}
            onChangeText={setClosingNotes}
            style={styles.modalInput}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
            multiline
            numberOfLines={3}
          />

          <View style={styles.modalButtons}>
            <Button
              mode="text"
              onPress={() => setCloseModal(false)}
              textColor={colors.mutedForeground}
            >
              {t('common.cancel')}
            </Button>
            <Button
              mode="contained"
              onPress={handleCloseRegister}
              loading={closeLoading}
              disabled={closeLoading || !actualBalance}
              buttonColor={colors.destructive}
              icon="lock"
            >
              {t('financial.cash_register.confirm_close')}
            </Button>
          </View>
        </Modal>
      </Portal>
    </View>
    </ScreenContainer>
  );
}
