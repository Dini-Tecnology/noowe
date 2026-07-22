import { V2Tone } from './v2Theme';

export type OrderStatus = 'new' | 'preparing' | 'ready';
export type KdsStatus = 'queue' | 'preparing' | 'ready';
export type OrderFilter = 'all' | OrderStatus;
export type KdsFilter = KdsStatus;

export interface TabOrder {
  id: string;
  table: string;
  items: string[];
  total: number;
  time: string;
  status: OrderStatus;
  /** Real backend status (pending/confirmed/preparing/ready/…), before collapsing to OrderStatus. */
  rawStatus: string;
  customerName?: string;
  notes?: string;
  createdAt?: string;
}

export interface HubOrder {
  table: string;
  name: string;
  avatar: string;
  items: string;
  value: string;
  time: string;
  status: string;
  action: string;
}

export interface KdsOrder {
  id: string;
  table: string;
  meta: string;
  status: KdsStatus;
  items: [string, string][];
  total?: number;
  time?: string;
  customerName?: string;
}

export interface RestaurantProfile {
  name: string;
  cnpj: string;
  address: string;
  phone: string;
  email: string;
}

export interface BusinessHour {
  day: string;
  open: boolean;
  start: string;
  end: string;
}

export interface NotificationPrefs {
  newOrders: boolean;
  kitchen: boolean;
  reservations: boolean;
  payments: boolean;
  sound: boolean;
}

export interface PaymentMethods {
  pix: boolean;
  creditCard: boolean;
  debitCard: boolean;
  cash: boolean;
  applePay: boolean;
  googlePay: boolean;
  tapToPay: boolean;
  pixKey: string;
  feePercent: number;
  serviceFeeEnabled: boolean;
  tipsEnabled: boolean;
  tipOptions: number[];
  tipAllowCustom: boolean;
  splitIndividual: boolean;
  splitEqual: boolean;
  splitByItem: boolean;
  splitFixed: boolean;
}

export interface KitchenBarKdsPrefs {
  kdsScreens: number;
  defaultPrepMinutes: number;
  autoRouting: boolean;
  priorityAlerts: boolean;
  fireOrderEnabled: boolean;
  batchCooking: boolean;
}

export interface MarketplaceFeatures {
  loyalty: boolean;
  events: boolean;
  happyHour: boolean;
  aiRecommendations: boolean;
  vip: boolean;
  experiencePackages: boolean;
  smartReviews: boolean;
  advancedAnalytics: boolean;
}

export interface CustomerExperiencePrefs {
  onlineReservations: boolean;
  waitlist: boolean;
  eventReservations: boolean;
  tableService: boolean;
  qrOrdering: boolean;
  counterService: boolean;
  selfService: boolean;
  smartAllocation: boolean;
  postVisitFeedback: boolean;
  maxAdvanceDays: number;
  toleranceMinutes: number;
  requireDeposit: boolean;
  journeyDiscovery: boolean;
  journeyReservation: boolean;
  journeyArrival: boolean;
  journeyMenu: boolean;
  journeyOrder: boolean;
  journeyTracking: boolean;
  journeyConsumption: boolean;
  journeyBill: boolean;
  journeyPayment: boolean;
  journeyPostVisit: boolean;
}

export function hubStatusTone(status: string): V2Tone {
  if (status === 'Confirmado') return 'info';
  if (status === 'Pendente') return 'warning';
  return 'info';
}

export function orderStatusLabel(status: OrderStatus): string {
  const map: Record<OrderStatus, string> = {
    new: 'Novo',
    preparing: 'Preparando',
    ready: 'Pronto',
  };
  return map[status];
}

export function orderStatusTone(status: OrderStatus): V2Tone {
  const map: Record<OrderStatus, V2Tone> = {
    new: 'warning',
    preparing: 'info',
    ready: 'success',
  };
  return map[status];
}

export function kdsStatusLabel(status: KdsStatus): string {
  const map: Record<KdsStatus, string> = {
    queue: 'Na fila',
    preparing: 'Preparando',
    ready: 'Pronto',
  };
  return map[status];
}

export function kdsStatusTone(status: KdsStatus): V2Tone {
  const map: Record<KdsStatus, V2Tone> = {
    queue: 'warning',
    preparing: 'info',
    ready: 'success',
  };
  return map[status];
}
