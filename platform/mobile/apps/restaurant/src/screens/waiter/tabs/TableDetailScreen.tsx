/**
 * TableDetailScreen — Table detail with 4 sub-tabs
 *
 * Shows table header with summary info and 4 sub-tabs:
 *   Pessoas | Pedidos | Cardapio | Cobrar
 *
 * @module waiter/tabs/TableDetailScreen
 */

import React, { useState, useMemo, useCallback } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { useI18n } from '@/shared/hooks/useI18n';
import GuestCard from '../components/GuestCard';
import OrderItemCard from '../components/OrderItemCard';
import PaymentMethodSelector from '../components/PaymentMethodSelector';
import { useWaiterPayment } from '../hooks/useWaiterPayment';
import type {
  WaiterTable,
  TableGuest,
  GuestOrder,
  TableDetailTab,
  CartItem,
} from '../types/waiter.types';
import { WAITER_MENU } from '../types/waiter.types';

interface TableDetailScreenProps {
  table: WaiterTable;
  onBack: () => void;
  onAddGuest: (tableNumber: number, guest: TableGuest) => void;
}

function TableDetailScreen({
  table,
  onBack,
  onAddGuest,
}: TableDetailScreenProps) {
  const colors = useColors();
  const { t } = useI18n();
  const payment = useWaiterPayment();

  const [activeSubTab, setActiveSubTab] = useState<TableDetailTab>('guests');
  const [addingGuest, setAddingGuest] = useState(false);
  const [newGuestName, setNewGuestName] = useState('');
  const [orderingForGuest, setOrderingForGuest] = useState<string | null>(null);
  const [pendingOrder, setPendingOrder] = useState<CartItem[]>([]);
  const [menuCategory, setMenuCategory] = useState(WAITER_MENU[0].cat);
  const [sentOrders, setSentOrders] = useState<
    Array<{ id: string; guest: string; item: string; qty: number; price: number; status: string; sentAt: string }>
  >([]);
  const [pickedUpLocal, setPickedUpLocal] = useState<string[]>([]);
  const [orderSentToast, setOrderSentToast] = useState(false);

  const guests = table.guests;
  const paidCount = guests.filter((g) => g.paid).length;
  const paidPct = guests.length > 0 ? Math.round((paidCount / guests.length) * 100) : 0;

  // Combine real + sent orders for display
  const allOrders = useMemo(() => {
    const baseOrders = guests.flatMap((g) =>
      g.orders.map((o) => ({ ...o, guestName: g.name, guestId: g.id, hasApp: g.hasApp })),
    );
    const sentDisplay = sentOrders
      .filter((s) => guests.some((g) => g.id === s.guest))
      .map((s) => ({
        id: s.id,
        item: s.item,
        qty: s.qty,
        price: s.price,
        status: s.status as any,
        sentAt: s.sentAt,
        guestName: guests.find((g) => g.id === s.guest)?.name || 'Convidado',
        guestId: s.guest,
        hasApp: false,
      }));
    return [...baseOrders, ...sentDisplay];
  }, [guests, sentOrders]);

  const tableTotal = allOrders.reduce((a, o) => a + o.price * o.qty, 0);
  const occupiedMinutes = table.occupiedSince
    ? Math.round((Date.now() - new Date(table.occupiedSince).getTime()) / 60000)
    : 0;

  const handleAddGuest = useCallback(() => {
    if (!newGuestName.trim()) return;
    const newGuest: TableGuest = {
      id: `added-${table.number}-${Date.now()}`,
      name: newGuestName.trim(),
      hasApp: false,
      paid: false,
      orders: [],
    };
    onAddGuest(table.number, newGuest);
    setNewGuestName('');
    setAddingGuest(false);
  }, [newGuestName, table.number, onAddGuest]);

  const handleSendOrder = useCallback(() => {
    if (pendingOrder.length === 0 || !orderingForGuest) return;
    const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const newSent = pendingOrder.map((item, i) => ({
      id: `sent-${Date.now()}-${i}`,
      guest: orderingForGuest,
      item: item.item,
      qty: item.qty,
      price: item.price,
      status: 'pending',
      sentAt: now,
    }));
    setSentOrders((prev) => [...prev, ...newSent]);
    setPendingOrder([]);
    setOrderingForGuest(null);
    setActiveSubTab('orders');
    setOrderSentToast(true);
    setTimeout(() => setOrderSentToast(false), 3000);
  }, [pendingOrder, orderingForGuest]);

  const SUB_TABS: Array<{ id: TableDetailTab; labelKey: string; count: number }> = [
    { id: 'guests', labelKey: 'waiter.table.guests', count: guests.length },
    { id: 'orders', labelKey: 'waiter.table.orders', count: allOrders.length },
    { id: 'menu', labelKey: 'waiter.table.menu', count: 0 },
    { id: 'charge', labelKey: 'waiter.table.charge', count: guests.filter((g) => !g.paid).length },
  ];

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
        },
        backBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: 12,
          paddingTop: 12,
        },
        backText: {
          fontSize: 12,
          fontWeight: '600',
          color: colors.primary,
        },
        headerCard: {
          borderRadius: 12,
          backgroundColor: colors.primary + '08',
          padding: 12,
          margin: 12,
        },
        headerRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        tableTitle: {
          fontSize: 20,
          fontWeight: '700',
          color: colors.foreground,
        },
        tableMeta: {
          fontSize: 10,
          color: colors.foregroundMuted,
          marginTop: 2,
        },
        headerRight: {
          alignItems: 'flex-end',
        },
        headerTotal: {
          fontSize: 20,
          fontWeight: '700',
          color: colors.primary,
        },
        progressRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          marginTop: 4,
        },
        progressBar: {
          width: 64,
          height: 6,
          backgroundColor: colors.backgroundTertiary,
          borderRadius: 3,
          overflow: 'hidden',
        },
        progressFill: {
          height: '100%',
          backgroundColor: colors.success,
          borderRadius: 3,
        },
        progressText: {
          fontSize: 10,
          fontWeight: '700',
          color: colors.foregroundMuted,
        },
        subTabContainer: {
          flexDirection: 'row',
          backgroundColor: colors.backgroundTertiary + '60',
          borderRadius: 8,
          marginHorizontal: 12,
          padding: 2,
        },
        subTab: {
          flex: 1,
          paddingVertical: 6,
          borderRadius: 6,
          alignItems: 'center',
        },
        subTabActive: {
          backgroundColor: colors.card,
          elevation: 1,
          shadowColor: colors.shadowColor,
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.1,
          shadowRadius: 2,
        },
        subTabText: {
          fontSize: 10,
          fontWeight: '600',
          color: colors.foregroundMuted,
        },
        subTabTextActive: {
          color: colors.foreground,
        },
        subTabBadge: {
          fontSize: 8,
          color: colors.foregroundMuted + 'AA',
          marginLeft: 2,
        },
        content: {
          flex: 1,
          paddingHorizontal: 12,
          paddingTop: 12,
        },
        // Add guest form
        addGuestForm: {
          borderRadius: 12,
          borderWidth: 2,
          borderStyle: 'dashed',
          borderColor: colors.primary + '30',
          padding: 12,
          gap: 8,
          marginTop: 8,
        },
        addGuestLabel: {
          fontSize: 12,
          fontWeight: '600',
          color: colors.foreground,
        },
        addGuestInput: {
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.background,
          paddingHorizontal: 12,
          paddingVertical: 8,
          fontSize: 14,
          color: colors.foreground,
        },
        addGuestActions: {
          flexDirection: 'row',
          gap: 8,
        },
        addBtn: {
          flex: 1,
          paddingVertical: 8,
          borderRadius: 8,
          backgroundColor: colors.primary,
          alignItems: 'center',
        },
        addBtnDisabled: {
          opacity: 0.4,
        },
        addBtnText: {
          fontSize: 12,
          fontWeight: '700',
          color: colors.premiumCardForeground,
        },
        cancelBtn: {
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
        },
        cancelBtnText: {
          fontSize: 12,
          color: colors.foreground,
        },
        addGuestButton: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          paddingVertical: 10,
          borderRadius: 12,
          borderWidth: 2,
          borderStyle: 'dashed',
          borderColor: colors.foregroundMuted + '30',
          marginTop: 8,
        },
        addGuestButtonText: {
          fontSize: 12,
          fontWeight: '600',
          color: colors.foregroundMuted,
        },
        // Orders status summary
        statusSummary: {
          flexDirection: 'row',
          gap: 4,
          marginBottom: 12,
        },
        statusPill: {
          flex: 1,
          borderRadius: 8,
          padding: 6,
          alignItems: 'center',
        },
        statusCount: {
          fontSize: 14,
          fontWeight: '700',
        },
        statusLabel: {
          fontSize: 8,
          color: colors.foregroundMuted,
          marginTop: 1,
        },
        // Order section header
        sectionHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingVertical: 4,
          paddingHorizontal: 4,
          marginTop: 8,
          marginBottom: 4,
        },
        sectionDot: {
          width: 6,
          height: 6,
          borderRadius: 3,
        },
        sectionText: {
          fontSize: 10,
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        },
        // Empty orders
        emptyOrders: {
          alignItems: 'center',
          paddingVertical: 32,
        },
        emptyOrdersText: {
          fontSize: 12,
          color: colors.foregroundMuted,
          marginTop: 8,
        },
        openMenuBtn: {
          marginTop: 8,
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 8,
          backgroundColor: colors.primary,
        },
        openMenuBtnText: {
          fontSize: 12,
          fontWeight: '700',
          color: colors.premiumCardForeground,
        },
        addItemsBtn: {
          paddingVertical: 10,
          borderRadius: 12,
          borderWidth: 2,
          borderStyle: 'dashed',
          borderColor: colors.primary + '30',
          alignItems: 'center',
          marginTop: 12,
        },
        addItemsText: {
          fontSize: 12,
          fontWeight: '600',
          color: colors.primary,
        },
        // Menu tab
        orderingForBanner: {
          borderRadius: 12,
          backgroundColor: colors.info + '08',
          borderWidth: 1,
          borderColor: colors.info + '30',
          padding: 10,
          marginBottom: 12,
        },
        orderingForLabel: {
          fontSize: 10,
          fontWeight: '600',
          color: colors.info,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        },
        orderingForRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginTop: 4,
        },
        orderingForName: {
          fontSize: 14,
          fontWeight: '700',
          color: colors.foreground,
        },
        orderingForChange: {
          fontSize: 10,
          color: colors.primary,
          textDecorationLine: 'underline',
        },
        guestChips: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 4,
          marginTop: 6,
        },
        guestChip: {
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 8,
          borderWidth: 1,
        },
        guestChipText: {
          fontSize: 10,
          fontWeight: '600',
        },
        categoryPills: {
          flexDirection: 'row',
          gap: 4,
          marginBottom: 12,
        },
        categoryPill: {
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 20,
        },
        categoryPillText: {
          fontSize: 10,
          fontWeight: '500',
        },
        menuItemCard: {
          borderRadius: 12,
          borderWidth: 1,
          padding: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          marginBottom: 6,
        },
        menuItemBody: {
          flex: 1,
        },
        menuItemName: {
          fontSize: 12,
          fontWeight: '600',
          color: colors.foreground,
        },
        menuItemMeta: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginTop: 2,
        },
        menuItemPrice: {
          fontSize: 12,
          fontWeight: '700',
          color: colors.primary,
        },
        menuItemTime: {
          fontSize: 10,
          color: colors.foregroundMuted,
        },
        addToCartBtn: {
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 8,
        },
        addToCartText: {
          fontSize: 10,
          fontWeight: '700',
        },
        qtyControls: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        },
        qtyBtn: {
          width: 24,
          height: 24,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
        },
        qtyBtnText: {
          fontSize: 14,
          fontWeight: '700',
          color: colors.premiumCardForeground,
        },
        qtyText: {
          fontSize: 14,
          fontWeight: '700',
          color: colors.foreground,
          width: 16,
          textAlign: 'center',
        },
        // Cart bar
        cartBar: {
          borderTopWidth: 1,
          borderTopColor: colors.border,
          padding: 12,
          backgroundColor: colors.background,
          gap: 8,
        },
        cartRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        cartInfo: {
          fontSize: 12,
          fontWeight: '600',
          color: colors.foreground,
        },
        cartGuest: {
          fontSize: 10,
          color: colors.foregroundMuted,
        },
        cartTotal: {
          fontSize: 16,
          fontWeight: '700',
          color: colors.primary,
        },
        sendBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingVertical: 12,
          borderRadius: 12,
          backgroundColor: colors.success,
        },
        sendBtnText: {
          fontSize: 14,
          fontWeight: '700',
          color: colors.premiumCardForeground,
        },
        // Charge sub-tab
        chargeBanner: {
          borderRadius: 12,
          backgroundColor: colors.primary + '08',
          borderWidth: 1,
          borderColor: colors.primary + '15',
          padding: 10,
          marginBottom: 12,
        },
        chargeBannerTitle: {
          fontSize: 12,
          fontWeight: '600',
          color: colors.foreground,
        },
        chargeBannerText: {
          fontSize: 10,
          color: colors.foregroundMuted,
          marginTop: 2,
        },
        chargeGuestCard: {
          borderRadius: 12,
          borderWidth: 1,
          padding: 10,
          marginBottom: 6,
        },
        chargeGuestRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        },
        chargeAvatar: {
          width: 28,
          height: 28,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
        },
        chargeAvatarText: {
          fontSize: 10,
          fontWeight: '700',
        },
        chargeGuestBody: {
          flex: 1,
        },
        chargeGuestName: {
          fontSize: 12,
          fontWeight: '600',
          color: colors.foreground,
        },
        chargeGuestStatus: {
          fontSize: 10,
          color: colors.foregroundMuted,
          marginTop: 1,
        },
        chargeGuestTotal: {
          fontSize: 12,
          fontWeight: '700',
          color: colors.foreground,
        },
        chargeBtn: {
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 8,
          backgroundColor: colors.primary,
          marginLeft: 4,
        },
        chargeBtnText: {
          fontSize: 10,
          fontWeight: '700',
          color: colors.premiumCardForeground,
        },
        appBadge: {
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 4,
          backgroundColor: colors.info + '15',
          marginLeft: 4,
        },
        appBadgeText: {
          fontSize: 8,
          color: colors.info,
        },
        chargeSummary: {
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 10,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: colors.backgroundSecondary,
          marginTop: 8,
        },
        chargeSummaryLeft: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        },
        chargeProgressBar: {
          width: 64,
          height: 6,
          backgroundColor: colors.backgroundTertiary,
          borderRadius: 3,
          overflow: 'hidden',
        },
        chargeProgressFill: {
          height: '100%',
          backgroundColor: colors.success,
          borderRadius: 3,
        },
        chargeSummaryText: {
          fontSize: 10,
          color: colors.foregroundMuted,
        },
        chargeSummaryTotal: {
          fontSize: 14,
          fontWeight: '700',
          color: colors.primary,
        },
        // Toast
        toast: {
          position: 'absolute',
          top: 0,
          left: 12,
          right: 12,
          zIndex: 100,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          padding: 12,
          borderRadius: 12,
          backgroundColor: colors.success,
          elevation: 4,
        },
        toastTitle: {
          fontSize: 12,
          fontWeight: '700',
          color: colors.premiumCardForeground,
        },
        toastSubtitle: {
          fontSize: 10,
          color: colors.premiumCardMuted,
        },
      }),
    [colors],
  );

  // Status section config for orders tab
  const STATUS_CONFIG: Record<string, { label: string; color: string; dotColor: string }> = {
    pending: { label: 'ENVIADO', color: colors.warning, dotColor: colors.warning },
    confirmed: { label: 'CONFIRMADO', color: colors.info, dotColor: colors.info },
    preparing: { label: 'PREPARANDO', color: colors.info, dotColor: colors.info },
    ready: { label: 'PRONTO — RETIRAR', color: colors.error, dotColor: colors.error },
    served: { label: 'SERVIDO', color: colors.success, dotColor: colors.success },
  };

  return (
    <ScreenContainer hasKeyboard>
    <View style={styles.container}>
      {/* Toast */}
      {orderSentToast && (
        <View style={styles.toast}>
          <Icon name="check-circle" size={20} color={colors.premiumCardForeground} />
          <View>
            <Text style={styles.toastTitle}>{t('waiter.menu.toast_sent')}</Text>
            <Text style={styles.toastSubtitle}>{t('waiter.menu.toast_sent_detail')}</Text>
          </View>
        </View>
      )}

      {/* Back button */}
      <TouchableOpacity
        style={styles.backBtn}
        onPress={onBack}
        accessibilityLabel={t('waiter.tables.back_to_all')}
        accessibilityRole="button"
      >
        <Icon name="chevron-left" size={14} color={colors.primary} />
        <Text style={styles.backText}>{t('waiter.tables.back_to_all')}</Text>
      </TouchableOpacity>

      {/* Table header */}
      <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.tableTitle}>
              {t('tables.tableNumber', { number: table.number })}
            </Text>
            <Text style={styles.tableMeta}>
              {table.customerName} {'\u00B7'} {guests.length} {t('waiter.tables.people_count')} {'\u00B7'} {occupiedMinutes}min
            </Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.headerTotal}>R$ {tableTotal}</Text>
            <View style={styles.progressRow}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${paidPct}%` }]} />
              </View>
              <Text style={styles.progressText}>{paidPct}%</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Sub-tabs */}
      <View style={styles.subTabContainer}>
        {SUB_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.subTab, activeSubTab === tab.id && styles.subTabActive]}
            onPress={() => setActiveSubTab(tab.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeSubTab === tab.id }}
          >
            <Text
              style={[
                styles.subTabText,
                activeSubTab === tab.id && styles.subTabTextActive,
              ]}
            >
              {t(tab.labelKey)}
              {tab.count > 0 && (
                <Text style={styles.subTabBadge}> ({tab.count})</Text>
              )}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Sub-tab content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* ======= PESSOAS ======= */}
        {activeSubTab === 'guests' && (
          <View>
            {guests.map((guest) => (
              <GuestCard
                key={guest.id}
                guest={guest}
                allOrders={allOrders.filter((o) => o.guestId === guest.id)}
                onOrder={() => {
                  setOrderingForGuest(guest.id);
                  setActiveSubTab('menu');
                  setPendingOrder([]);
                }}
                onCharge={() => {
                  payment.selectGuest(guest.name);
                  setActiveSubTab('charge');
                }}
              />
            ))}

            {addingGuest ? (
              <View style={styles.addGuestForm}>
                <Text style={styles.addGuestLabel}>
                  {t('waiter.guests.add_guest_cta')}
                </Text>
                <TextInput
                  style={styles.addGuestInput}
                  value={newGuestName}
                  onChangeText={setNewGuestName}
                  placeholder={t('waiter.guests.add_guest_placeholder')}
                  placeholderTextColor={colors.foregroundMuted}
                  autoFocus
                />
                <View style={styles.addGuestActions}>
                  <TouchableOpacity
                    style={[
                      styles.addBtn,
                      !newGuestName.trim() && styles.addBtnDisabled,
                    ]}
                    onPress={handleAddGuest}
                    disabled={!newGuestName.trim()}
                    accessibilityLabel={t('waiter.guests.add_guest_confirm')}
                    accessibilityRole="button"
                  >
                    <Text style={styles.addBtnText}>
                      {t('waiter.guests.add_guest_confirm')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => {
                      setAddingGuest(false);
                      setNewGuestName('');
                    }}
                    accessibilityLabel={t('waiter.guests.add_guest_cancel')}
                    accessibilityRole="button"
                  >
                    <Text style={styles.cancelBtnText}>
                      {t('waiter.guests.add_guest_cancel')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.addGuestButton}
                onPress={() => setAddingGuest(true)}
                accessibilityLabel={t('waiter.guests.add_guest_cta')}
                accessibilityRole="button"
              >
                <Icon name="account-plus" size={16} color={colors.foregroundMuted} />
                <Text style={styles.addGuestButtonText}>
                  {t('waiter.guests.add_guest_cta')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ======= PEDIDOS ======= */}
        {activeSubTab === 'orders' && (
          <View>
            {/* Status summary pills */}
            <View style={styles.statusSummary}>
              {[
                { label: t('orders.status.pending'), count: allOrders.filter((o) => ['pending', 'confirmed'].includes(o.status)).length, color: colors.warning },
                { label: t('orders.status.preparing'), count: allOrders.filter((o) => o.status === 'preparing').length, color: colors.info },
                { label: t('orders.status.ready'), count: allOrders.filter((o) => o.status === 'ready').length, color: colors.error },
                { label: t('orders.status.served'), count: allOrders.filter((o) => o.status === 'served').length, color: colors.success },
              ].map((s, i) => (
                <View key={i} style={[styles.statusPill, { backgroundColor: s.color + '12' }]}>
                  <Text style={[styles.statusCount, { color: s.color }]}>{s.count}</Text>
                  <Text style={styles.statusLabel}>{s.label}</Text>
                </View>
              ))}
            </View>

            {/* Orders grouped by status */}
            {['ready', 'preparing', 'confirmed', 'pending', 'served'].map((status) => {
              const items = allOrders.filter((o) => o.status === status);
              if (items.length === 0) return null;
              const cfg = STATUS_CONFIG[status];
              return (
                <View key={status}>
                  <View style={styles.sectionHeader}>
                    <View style={[styles.sectionDot, { backgroundColor: cfg.dotColor }]} />
                    <Text style={[styles.sectionText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                  {items.map((order) => (
                    <OrderItemCard
                      key={order.id}
                      id={order.id}
                      item={order.item}
                      qty={order.qty}
                      price={order.price}
                      status={order.status}
                      guestName={order.guestName}
                      hasApp={order.hasApp}
                      sentAt={order.sentAt}
                      onServe={
                        order.status === 'ready'
                          ? () => setPickedUpLocal((prev) => [...prev, order.id])
                          : undefined
                      }
                    />
                  ))}
                </View>
              );
            })}

            {allOrders.length === 0 && (
              <View style={styles.emptyOrders}>
                <Icon name="book-open-variant" size={32} color={colors.foregroundMuted + '40'} />
                <Text style={styles.emptyOrdersText}>
                  {t('waiter.orders.empty')}
                </Text>
                <TouchableOpacity
                  style={styles.openMenuBtn}
                  onPress={() => setActiveSubTab('menu')}
                  accessibilityLabel={t('waiter.table.menu')}
                  accessibilityRole="button"
                >
                  <Text style={styles.openMenuBtnText}>{t('waiter.table.menu')}</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              style={styles.addItemsBtn}
              onPress={() => {
                setActiveSubTab('menu');
                setOrderingForGuest(null);
              }}
              accessibilityLabel={t('waiter.orders.add_more')}
              accessibilityRole="button"
            >
              <Text style={styles.addItemsText}>{t('waiter.orders.add_more')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ======= CARDAPIO ======= */}
        {activeSubTab === 'menu' && (
          <View>
            {/* Ordering for banner */}
            <View style={styles.orderingForBanner}>
              <Text style={styles.orderingForLabel}>
                {t('waiter.menu.ordering_for_label')}
              </Text>
              {orderingForGuest ? (
                <View style={styles.orderingForRow}>
                  <Text style={styles.orderingForName}>
                    {guests.find((g) => g.id === orderingForGuest)?.name || 'Convidado'}
                  </Text>
                  <TouchableOpacity onPress={() => setOrderingForGuest(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.orderingForChange}>
                      {t('waiter.menu.ordering_for_change')}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.guestChips}>
                  {guests
                    .filter((g) => !g.paid)
                    .map((g) => (
                      <TouchableOpacity
                        key={g.id}
                        style={[
                          styles.guestChip,
                          {
                            borderColor: !g.hasApp ? colors.warning + '40' : colors.border,
                            backgroundColor: !g.hasApp ? colors.warning + '10' : colors.card,
                          },
                        ]}
                        onPress={() => setOrderingForGuest(g.id)}
                        accessibilityLabel={g.name}
                        accessibilityRole="button"
                      >
                        <Text
                          style={[
                            styles.guestChipText,
                            { color: !g.hasApp ? colors.warning : colors.foreground },
                          ]}
                        >
                          {!g.hasApp ? '\u{1F464} ' : '\u{1F4F1} '}
                          {g.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                </View>
              )}
            </View>

            {/* Category pills */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryPills}
            >
              {WAITER_MENU.map((c) => (
                <TouchableOpacity
                  key={c.cat}
                  style={[
                    styles.categoryPill,
                    {
                      backgroundColor:
                        menuCategory === c.cat ? colors.primary : colors.backgroundTertiary,
                    },
                  ]}
                  onPress={() => setMenuCategory(c.cat)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: menuCategory === c.cat }}
                >
                  <Text
                    style={[
                      styles.categoryPillText,
                      {
                        color:
                          menuCategory === c.cat ? colors.premiumCardForeground : colors.foregroundMuted,
                      },
                    ]}
                  >
                    {c.cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Menu items */}
            {WAITER_MENU.find((c) => c.cat === menuCategory)?.items.map((item) => {
              const inCart = pendingOrder.find((o) => o.item === item.name);
              return (
                <View
                  key={item.id}
                  style={[
                    styles.menuItemCard,
                    {
                      borderColor: inCart ? colors.primary + '40' : colors.border,
                      backgroundColor: inCart ? colors.primary + '05' : colors.card,
                    },
                  ]}
                >
                  <View style={styles.menuItemBody}>
                    <Text style={styles.menuItemName}>{item.name}</Text>
                    <View style={styles.menuItemMeta}>
                      <Text style={styles.menuItemPrice}>R$ {item.price}</Text>
                      <Text style={styles.menuItemTime}>{'\u23F1'} {item.time}</Text>
                    </View>
                  </View>
                  {inCart ? (
                    <View style={styles.qtyControls}>
                      <TouchableOpacity
                        style={[styles.qtyBtn, { backgroundColor: colors.backgroundTertiary }]}
                        onPress={() =>
                          setPendingOrder((prev) => {
                            const existing = prev.find((o) => o.item === item.name);
                            if (existing && existing.qty <= 1)
                              return prev.filter((o) => o.item !== item.name);
                            return prev.map((o) =>
                              o.item === item.name ? { ...o, qty: o.qty - 1 } : o,
                            );
                          })
                        }
                        accessibilityLabel={t('waiter.menu.quantity_minus')}
                        accessibilityRole="button"
                      >
                        <Text style={[styles.qtyBtnText, { color: colors.foreground }]}>
                          {'\u2212'}
                        </Text>
                      </TouchableOpacity>
                      <Text style={styles.qtyText}>{inCart.qty}</Text>
                      <TouchableOpacity
                        style={[styles.qtyBtn, { backgroundColor: colors.primary }]}
                        onPress={() =>
                          setPendingOrder((prev) =>
                            prev.map((o) =>
                              o.item === item.name ? { ...o, qty: o.qty + 1 } : o,
                            ),
                          )
                        }
                        accessibilityLabel={t('waiter.menu.quantity_plus')}
                        accessibilityRole="button"
                      >
                        <Text style={styles.qtyBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.addToCartBtn,
                        {
                          backgroundColor: orderingForGuest
                            ? colors.primary
                            : colors.backgroundTertiary,
                        },
                      ]}
                      disabled={!orderingForGuest}
                      onPress={() => {
                        if (!orderingForGuest) return;
                        setPendingOrder((prev) => [
                          ...prev,
                          { itemId: item.id, item: item.name, qty: 1, price: item.price },
                        ]);
                      }}
                      accessibilityLabel={t('waiter.menu.add_to_cart')}
                      accessibilityRole="button"
                    >
                      <Text
                        style={[
                          styles.addToCartText,
                          {
                            color: orderingForGuest ? colors.premiumCardForeground : colors.foregroundMuted,
                          },
                        ]}
                      >
                        {t('waiter.menu.add_to_cart')}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}

            {/* No guest selected hint */}
            {!orderingForGuest && (
              <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                <Text style={{ fontSize: 10, color: colors.foregroundMuted }}>
                  {t('waiter.menu.no_guest_selected')}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ======= COBRAR ======= */}
        {activeSubTab === 'charge' && (
          <View>
            {payment.step === 'guests' && (
              <>
                <View style={styles.chargeBanner}>
                  <Text style={styles.chargeBannerTitle}>
                    {t('waiter.charge.tab')} Mesa {table.number}
                  </Text>
                  <Text style={styles.chargeBannerText}>
                    {t('waiter.charge.info_banner_short')}
                  </Text>
                </View>

                {guests.map((guest) => {
                  const guestOrders = allOrders.filter((o) => o.guestId === guest.id);
                  const guestTotal = guestOrders.reduce((a, o) => a + o.price * o.qty, 0);
                  const avatarColor = guest.paid
                    ? colors.success
                    : guest.hasApp
                      ? colors.info
                      : colors.warning;
                  return (
                    <View
                      key={guest.id}
                      style={[
                        styles.chargeGuestCard,
                        {
                          borderColor: guest.paid
                            ? colors.success + '30'
                            : !guest.hasApp
                              ? colors.warning + '30'
                              : colors.border,
                          backgroundColor: guest.paid ? colors.success + '08' : colors.card,
                          opacity: guest.paid ? 0.6 : 1,
                        },
                      ]}
                    >
                      <View style={styles.chargeGuestRow}>
                        <View style={[styles.chargeAvatar, { backgroundColor: avatarColor + '20' }]}>
                          <Text style={[styles.chargeAvatarText, { color: avatarColor }]}>
                            {guest.paid ? '\u2713' : guest.hasApp ? '\u{1F4F1}' : '!'}
                          </Text>
                        </View>
                        <View style={styles.chargeGuestBody}>
                          <Text style={styles.chargeGuestName}>{guest.name}</Text>
                          <Text style={styles.chargeGuestStatus}>
                            {guest.paid
                              ? t('waiter.charge.guest_paid_via', { method: guest.method || '' })
                              : guest.hasApp
                                ? t('waiter.charge.guest_on_app')
                                : t('waiter.charge.guest_needs_waiter')}
                          </Text>
                        </View>
                        <Text style={styles.chargeGuestTotal}>R$ {guestTotal}</Text>
                        {!guest.paid && !guest.hasApp && (
                          <TouchableOpacity
                            style={styles.chargeBtn}
                            onPress={() => payment.selectGuest(guest.name)}
                            accessibilityLabel={t('waiter.charge.action_charge')}
                            accessibilityRole="button"
                          >
                            <Text style={styles.chargeBtnText}>
                              {t('waiter.charge.action_charge')}
                            </Text>
                          </TouchableOpacity>
                        )}
                        {!guest.paid && guest.hasApp && (
                          <View style={styles.appBadge}>
                            <Text style={styles.appBadgeText}>No app</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}

                <View style={styles.chargeSummary}>
                  <View style={styles.chargeSummaryLeft}>
                    <View style={styles.chargeProgressBar}>
                      <View style={[styles.chargeProgressFill, { width: `${paidPct}%` }]} />
                    </View>
                    <Text style={styles.chargeSummaryText}>
                      {paidCount}/{guests.length} {t('waiter.charge.paid_count')}
                    </Text>
                  </View>
                  <Text style={styles.chargeSummaryTotal}>
                    {t('waiter.charge.total_label', { total: tableTotal })}
                  </Text>
                </View>
              </>
            )}

            {(payment.step === 'method' ||
              payment.step === 'processing' ||
              payment.step === 'done') && (
              <PaymentMethodSelector
                step={payment.step}
                tableNumber={table.number}
                guestName={payment.selectedGuestName}
                amount={Math.round(tableTotal * 0.25)}
                isProcessing={payment.isProcessing}
                onSelectMethod={payment.selectMethod}
                onConfirm={payment.confirmPayment}
                onBack={payment.goBack}
                onNext={payment.goToNext}
              />
            )}
          </View>
        )}

        {/* Bottom spacing */}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Cart bar (menu tab only) */}
      {activeSubTab === 'menu' && pendingOrder.length > 0 && orderingForGuest && (
        <View style={styles.cartBar}>
          <View style={styles.cartRow}>
            <View>
              <Text style={styles.cartInfo}>
                {pendingOrder.reduce((a, o) => a + o.qty, 0)} {t('waiter.menu.cart_items')}
              </Text>
              <Text style={styles.cartGuest}>
                {guests.find((g) => g.id === orderingForGuest)?.name}
              </Text>
            </View>
            <Text style={styles.cartTotal}>
              R$ {pendingOrder.reduce((a, o) => a + o.price * o.qty, 0)}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.sendBtn}
            onPress={handleSendOrder}
            accessibilityLabel={t('waiter.menu.send_to_kitchen')}
            accessibilityRole="button"
          >
            <Icon name="chef-hat" size={16} color={colors.premiumCardForeground} />
            <Text style={styles.sendBtnText}>{t('waiter.menu.send_to_kitchen')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
    </ScreenContainer>
  );
}

export default React.memo(TableDetailScreen);
