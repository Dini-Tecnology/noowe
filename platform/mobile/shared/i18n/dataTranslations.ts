/**
 * Data Translations - Mapping Backend Enums and Status to i18n Keys
 *
 * This file provides utility functions to translate backend data structures
 * (enums, status codes, etc.) to their corresponding i18n translation keys.
 *
 * Usage:
 * import { getOrderStatusKey, getPaymentMethodKey } from '@/shared/i18n/dataTranslations';
 * const { t } = useI18n();
 * const translatedStatus = t(getOrderStatusKey(order.status));
 */

// ============================================================
// ORDER STATUS MAPPINGS
// ============================================================

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'delivering'
  | 'delivered'
  | 'completed'
  | 'cancelled';

export const ORDER_STATUS_KEYS: Record<OrderStatus, string> = {
  pending: 'orders.status.pending',
  confirmed: 'orders.status.confirmed',
  preparing: 'orders.status.preparing',
  ready: 'orders.status.ready',
  delivering: 'orders.status.delivering',
  delivered: 'orders.status.delivered',
  completed: 'orders.status.completed',
  cancelled: 'orders.status.cancelled',
};

export const getOrderStatusKey = (status: OrderStatus): string => {
  return ORDER_STATUS_KEYS[status] || 'orders.status.pending';
};

// ============================================================
// ORDER TYPE MAPPINGS
// ============================================================

export type OrderType = 'dine_in' | 'pickup' | 'delivery';

export const ORDER_TYPE_KEYS: Record<OrderType, string> = {
  dine_in: 'orders.orderType.dine_in',
  pickup: 'orders.orderType.pickup',
  delivery: 'orders.orderType.delivery',
};

export const getOrderTypeKey = (type: OrderType): string => {
  return ORDER_TYPE_KEYS[type] || 'orders.orderType.dine_in';
};

// ============================================================
// RESERVATION STATUS MAPPINGS
// ============================================================

export type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'seated'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export const RESERVATION_STATUS_KEYS: Record<ReservationStatus, string> = {
  pending: 'reservations.status.pending',
  confirmed: 'reservations.status.confirmed',
  seated: 'reservations.status.seated',
  completed: 'reservations.status.completed',
  cancelled: 'reservations.status.cancelled',
  no_show: 'reservations.status.no_show',
};

export const getReservationStatusKey = (status: ReservationStatus): string => {
  return RESERVATION_STATUS_KEYS[status] || 'reservations.status.pending';
};

// ============================================================
// TABLE STATUS MAPPINGS
// ============================================================

export type TableStatus = 'available' | 'occupied' | 'reserved' | 'cleaning';

export const TABLE_STATUS_KEYS: Record<TableStatus, string> = {
  available: 'tables.status.available',
  occupied: 'tables.status.occupied',
  reserved: 'tables.status.reserved',
  cleaning: 'tables.status.cleaning',
};

export const getTableStatusKey = (status: TableStatus): string => {
  return TABLE_STATUS_KEYS[status] || 'tables.status.available';
};

// ============================================================
// PAYMENT METHOD MAPPINGS
// ============================================================

export type PaymentMethod =
  | 'credit_card'
  | 'debit_card'
  | 'pix'
  | 'cash'
  | 'wallet';

export const PAYMENT_METHOD_KEYS: Record<PaymentMethod, string> = {
  credit_card: 'payment.creditCard',
  debit_card: 'payment.debitCard',
  pix: 'payment.pix',
  cash: 'payment.cash',
  wallet: 'payment.wallet',
};

export const getPaymentMethodKey = (method: PaymentMethod): string => {
  return PAYMENT_METHOD_KEYS[method] || 'payment.cash';
};

// ============================================================
// STAFF ROLE MAPPINGS
// ============================================================

export type StaffRole =
  | 'owner'
  | 'manager'
  | 'chef'
  | 'cook'
  | 'waiter'
  | 'barman'
  | 'maitre'
  | 'cashier'
  | 'host'
  | 'delivery';

export const STAFF_ROLE_KEYS: Record<StaffRole, string> = {
  owner: 'staff.roles.owner',
  manager: 'staff.roles.manager',
  chef: 'staff.roles.chef',
  cook: 'staff.roles.cook',
  waiter: 'staff.roles.waiter',
  barman: 'staff.roles.barman',
  maitre: 'staff.roles.maitre',
  cashier: 'staff.roles.cashier',
  host: 'staff.roles.host',
  delivery: 'staff.roles.delivery',
};

export const getStaffRoleKey = (role: StaffRole): string => {
  return STAFF_ROLE_KEYS[role] || 'staff.noRole';
};

// ============================================================
// STAFF STATUS MAPPINGS
// ============================================================

export type StaffStatus = 'active' | 'inactive' | 'on_break';

export const STAFF_STATUS_KEYS: Record<StaffStatus, string> = {
  active: 'staff.status.active',
  inactive: 'staff.status.inactive',
  on_break: 'staff.status.on_break',
};

export const getStaffStatusKey = (status: StaffStatus): string => {
  return STAFF_STATUS_KEYS[status] || 'staff.status.inactive';
};

// ============================================================
// DIETARY INFO MAPPINGS
// ============================================================

export type DietaryInfo =
  | 'vegetarian'
  | 'vegan'
  | 'glutenFree'
  | 'lactoseFree'
  | 'spicy';

export const DIETARY_INFO_KEYS: Record<DietaryInfo, string> = {
  vegetarian: 'menu.dietaryInfo.vegetarian',
  vegan: 'menu.dietaryInfo.vegan',
  glutenFree: 'menu.dietaryInfo.glutenFree',
  lactoseFree: 'menu.dietaryInfo.lactoseFree',
  spicy: 'menu.dietaryInfo.spicy',
};

export const getDietaryInfoKey = (info: DietaryInfo): string => {
  return DIETARY_INFO_KEYS[info] || info;
};

// ============================================================
// WALLET TRANSACTION TYPE MAPPINGS
// ============================================================

export type WalletTransactionType = 'credit' | 'debit';

export const WALLET_TRANSACTION_KEYS: Record<WalletTransactionType, string> = {
  credit: 'wallet.income',
  debit: 'wallet.expense',
};

export const getWalletTransactionKey = (type: WalletTransactionType): string => {
  return WALLET_TRANSACTION_KEYS[type] || 'wallet.transaction';
};

// ============================================================
// TIP TYPE MAPPINGS
// ============================================================

export type TipType = 'order' | 'direct' | 'pooled';

export const TIP_TYPE_KEYS: Record<TipType, string> = {
  order: 'tips.orderTip',
  direct: 'tips.directTip',
  pooled: 'tips.pooledTip',
};

export const getTipTypeKey = (type: TipType): string => {
  return TIP_TYPE_KEYS[type] || type;
};

// ============================================================
// LOYALTY TIER MAPPINGS
// ============================================================

export type LoyaltyTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export const LOYALTY_TIER_KEYS: Record<LoyaltyTier, string> = {
  bronze: 'loyalty.tiers.bronze',
  silver: 'loyalty.tiers.silver',
  gold: 'loyalty.tiers.gold',
  platinum: 'loyalty.tiers.platinum',
};

export const getLoyaltyTierKey = (tier: LoyaltyTier): string => {
  return LOYALTY_TIER_KEYS[tier] || 'loyalty.tiers.bronze';
};

// ============================================================
// NOTIFICATION TYPE MAPPINGS
// ============================================================

export type NotificationType =
  | 'order_update'
  | 'reservation_update'
  | 'promotion'
  | 'new_message';

export const NOTIFICATION_TYPE_KEYS: Record<NotificationType, string> = {
  order_update: 'notifications.orderUpdate',
  reservation_update: 'notifications.reservationUpdate',
  promotion: 'notifications.promotion',
  new_message: 'notifications.newMessage',
};

export const getNotificationTypeKey = (type: NotificationType): string => {
  return NOTIFICATION_TYPE_KEYS[type] || type;
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Generic function to get a translation key from a mapping
 * @param value - The value to translate
 * @param mapping - The mapping object with key-value pairs
 * @param fallback - Fallback translation key
 */
export function getTranslationKey<T extends string>(
  value: T,
  mapping: Record<T, string>,
  fallback: string
): string {
  return mapping[value] || fallback;
}

/**
 * Create a dynamic status label getter function for use in components
 * This is useful when you need to use the t() function inside a component
 *
 * Usage:
 * const getStatusLabel = createStatusLabelGetter(t, ORDER_STATUS_KEYS);
 * const label = getStatusLabel(order.status);
 */
export function createStatusLabelGetter<T extends string>(
  translateFn: (key: string) => string,
  mapping: Record<T, string>
): (status: T) => string {
  return (status: T) => translateFn(mapping[status] || status);
}

// ============================================================
// EXPORTS FOR COMMON USE CASES
// ============================================================

export const DataTranslations = {
  order: {
    status: ORDER_STATUS_KEYS,
    type: ORDER_TYPE_KEYS,
    getStatus: getOrderStatusKey,
    getType: getOrderTypeKey,
  },
  reservation: {
    status: RESERVATION_STATUS_KEYS,
    getStatus: getReservationStatusKey,
  },
  table: {
    status: TABLE_STATUS_KEYS,
    getStatus: getTableStatusKey,
  },
  payment: {
    method: PAYMENT_METHOD_KEYS,
    getMethod: getPaymentMethodKey,
  },
  staff: {
    role: STAFF_ROLE_KEYS,
    status: STAFF_STATUS_KEYS,
    getRole: getStaffRoleKey,
    getStatus: getStaffStatusKey,
  },
  menu: {
    dietary: DIETARY_INFO_KEYS,
    getDietary: getDietaryInfoKey,
  },
  wallet: {
    transaction: WALLET_TRANSACTION_KEYS,
    getTransaction: getWalletTransactionKey,
  },
  loyalty: {
    tier: LOYALTY_TIER_KEYS,
    getTier: getLoyaltyTierKey,
  },
  notification: {
    type: NOTIFICATION_TYPE_KEYS,
    getType: getNotificationTypeKey,
  },
};

export default DataTranslations;
