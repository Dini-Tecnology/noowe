import type { ComponentType } from 'react';
import {
  Store,
  Utensils,
  Sparkles,
  LayoutGrid,
  BookOpen,
  Users,
  ChefHat,
  CreditCard,
  Zap,
  Crown,
  Flame,
  Coffee,
  ClipboardList,
  Wine,
  Car,
  Truck,
  Star,
  Music,
} from 'lucide-react-native';
import type { BusinessHour } from '../shared/v2Types';

export type ConfigModuleStatus = 'complete' | 'configured' | 'needs-attention';
export type ProfileTab = 'info' | 'hours' | 'contact';

export type IconComponent = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

export interface ConfigModuleDef {
  id: string;
  route: string;
  label: string;
  desc: string;
  Icon: IconComponent;
  iconColor: string;
  /** Static fallback progress until module is fully wired */
  staticProgress: number;
  staticStatus: ConfigModuleStatus;
}

export interface ServiceTypeDef {
  id: string;
  name: string;
  desc: string;
  features: string[];
  Icon: IconComponent;
}

export interface ProfileContact {
  id: string;
  type: 'Telefone' | 'WhatsApp' | 'Website' | 'Email';
  value: string;
}

export interface ProfileSocial {
  id: string;
  key: 'instagram' | 'facebook' | 'tiktok' | 'google_business';
  label: string;
  value: string;
  connected: boolean;
}

export const SERVICE_TYPE_CATALOG: ServiceTypeDef[] = [
  {
    id: 'fine_dining',
    name: 'Fine Dining',
    desc: 'Reservas, sommelier, harmonização',
    features: ['Reservas Online', 'Wine Pairing', 'Sommelier', 'Split por item', 'Course-by-Course'],
    Icon: Crown,
  },
  {
    id: 'casual_dining',
    name: 'Casual Dining',
    desc: 'Waitlist, família, grupos',
    features: ['Smart Waitlist', 'Modo Família', 'Grupos'],
    Icon: Utensils,
  },
  {
    id: 'fast_casual',
    name: 'Fast Casual',
    desc: 'Montador de pratos, alérgenos',
    features: ['Dish Builder', 'Alérgenos', 'Nutricional'],
    Icon: Flame,
  },
  {
    id: 'cafe_bakery',
    name: 'Café & Padaria',
    desc: 'Work mode, refill, Wi-Fi',
    features: ['Work Mode', 'Refill', 'Wi-Fi'],
    Icon: Coffee,
  },
  {
    id: 'buffet',
    name: 'Buffet',
    desc: 'Balança inteligente, NFC',
    features: ['Balança Inteligente', 'NFC', 'Self-service'],
    Icon: ClipboardList,
  },
  {
    id: 'pub_bar',
    name: 'Pub & Bar',
    desc: 'Comanda digital, rounds',
    features: ['Comanda Digital', 'Round Builder', 'Consumo Mínimo'],
    Icon: Wine,
  },
  {
    id: 'drive_thru',
    name: 'Drive-Thru',
    desc: 'Geofencing, preparo antecipado',
    features: ['GPS 500m', 'Preparo Automático'],
    Icon: Car,
  },
  {
    id: 'food_truck',
    name: 'Food Truck',
    desc: 'Mapa em tempo real, fila virtual',
    features: ['Mapas GPS', 'Fila Virtual'],
    Icon: Truck,
  },
  {
    id: 'chefs_table',
    name: 'Chef Table',
    desc: 'Menu degustação, notas do chef',
    features: ['Course-by-Course', 'Sommelier Notes'],
    Icon: Star,
  },
  {
    id: 'quick_service',
    name: 'Quick Service',
    desc: 'Skip the line, pickup rápido',
    features: ['Skip the Line', 'Tracking 4 Estágios'],
    Icon: Zap,
  },
  {
    id: 'club',
    name: 'Club & Balada',
    desc: 'Ingressos, VIP, consumo mínimo',
    features: ['Ingressos QR', 'Mapa VIP', 'Consumo Mínimo'],
    Icon: Music,
  },
];

export const CONFIG_MODULES: ConfigModuleDef[] = [
  {
    id: 'config-profile',
    route: 'RestaurantProfile',
    label: 'Perfil do Restaurante',
    desc: 'Nome, logo, fotos, contato',
    Icon: Store,
    iconColor: '#EA580C',
    staticProgress: 0,
    staticStatus: 'needs-attention',
  },
  {
    id: 'config-service-types',
    route: 'ServiceConfig',
    label: 'Tipos de Serviço',
    desc: '11 modelos de operação',
    Icon: Utensils,
    iconColor: '#0D9488',
    staticProgress: 0,
    staticStatus: 'needs-attention',
  },
  {
    id: 'config-experience',
    route: 'ConfigExperience',
    label: 'Experiência do Cliente',
    desc: 'Reservas, fila, QR, pedidos',
    Icon: Sparkles,
    iconColor: '#0284C7',
    staticProgress: 0,
    staticStatus: 'needs-attention',
  },
  {
    id: 'config-floor',
    route: 'ConfigFloor',
    label: 'Mapa do Salão',
    desc: 'Mesas, zonas, áreas VIP',
    Icon: LayoutGrid,
    iconColor: '#D97706',
    staticProgress: 0,
    staticStatus: 'needs-attention',
  },
  {
    id: 'config-menu',
    route: 'Menu',
    label: 'Cardápio',
    desc: 'Categorias, itens, preços',
    Icon: BookOpen,
    iconColor: '#059669',
    staticProgress: 0,
    staticStatus: 'needs-attention',
  },
  {
    id: 'config-team',
    route: 'Staff',
    label: 'Equipe & Permissões',
    desc: 'Cargos, escalas, acesso',
    Icon: Users,
    iconColor: '#7C3AED',
    staticProgress: 0,
    staticStatus: 'needs-attention',
  },
  {
    id: 'config-kitchen',
    route: 'ConfigKitchen',
    label: 'Cozinha & Bar',
    desc: 'Estações, KDS, receitas',
    Icon: ChefHat,
    iconColor: '#EF4444',
    staticProgress: 0,
    staticStatus: 'needs-attention',
  },
  {
    id: 'config-payments',
    route: 'ConfigPayments',
    label: 'Pagamentos',
    desc: 'Taxa, gorjeta, split, métodos',
    Icon: CreditCard,
    iconColor: '#EA580C',
    staticProgress: 0,
    staticStatus: 'needs-attention',
  },
  {
    id: 'config-marketplace',
    route: 'ConfigMarketplace',
    label: 'Marketplace de Features',
    desc: 'Fidelidade, IA, eventos, VIP',
    Icon: Zap,
    iconColor: '#D97706',
    staticProgress: 0,
    staticStatus: 'needs-attention',
  },
];

export const DEFAULT_BUSINESS_HOURS: BusinessHour[] = [
  { day: 'Segunda', open: true, start: '11:00', end: '23:00' },
  { day: 'Terça', open: true, start: '11:00', end: '23:00' },
  { day: 'Quarta', open: true, start: '11:00', end: '23:00' },
  { day: 'Quinta', open: true, start: '11:00', end: '23:00' },
  { day: 'Sexta', open: true, start: '11:00', end: '00:00' },
  { day: 'Sábado', open: true, start: '12:00', end: '00:00' },
  { day: 'Domingo', open: false, start: '12:00', end: '22:00' },
];

export const DEFAULT_SOCIALS: ProfileSocial[] = [
  { id: 's1', key: 'instagram', label: 'Instagram', value: '', connected: false },
  { id: 's2', key: 'facebook', label: 'Facebook', value: '', connected: false },
  { id: 's3', key: 'tiktok', label: 'TikTok', value: '', connected: false },
  { id: 's4', key: 'google_business', label: 'Google Business', value: '', connected: false },
];

export const ROLE_LABEL: Record<string, string> = {
  owner: 'Dono',
  manager: 'Gerente',
  maitre: 'Maître',
  chef: 'Chef',
  barman: 'Barman',
  cook: 'Cozinheiro',
  waiter: 'Garçom',
};

export function statusFromProgress(progress: number): ConfigModuleStatus {
  if (progress >= 100) return 'complete';
  if (progress >= 70) return 'configured';
  return 'needs-attention';
}

export function calculateProfileProgress(profile: {
  name?: string | null;
  logo_url?: string | null;
  banner_url?: string | null;
  cover_image_url?: string | null;
  description?: string | null;
  cuisine_type?: string | null;
  phone?: string | null;
  email?: string | null;
  business_hours?: BusinessHour[] | null;
  settings?: {
    cnpj?: string;
    contacts?: ProfileContact[];
    socials?: ProfileSocial[];
  } | null;
}): number {
  const checks = [
    Boolean(profile.name?.trim()),
    Boolean(profile.logo_url || profile.banner_url || profile.cover_image_url),
    Boolean(profile.description?.trim()),
    Boolean(profile.cuisine_type?.trim()),
    Boolean(profile.settings?.cnpj?.trim()),
    Array.isArray(profile.business_hours) && profile.business_hours.some((h) => h.open),
    Boolean(profile.phone?.trim()) ||
      Boolean(profile.email?.trim()) ||
      (Array.isArray(profile.settings?.contacts) && profile.settings.contacts.some((c) => c.value?.trim())),
    Array.isArray(profile.settings?.socials) && profile.settings.socials.some((s) => s.connected || s.value?.trim()),
  ];
  const filled = checks.filter(Boolean).length;
  return Math.round((filled / checks.length) * 100);
}

export function calculateServiceTypesProgress(activeCount: number): number {
  if (activeCount <= 0) return 0;
  if (activeCount >= 3) return 100;
  if (activeCount === 2) return 85;
  return 70;
}

export function calculateExperienceProgress(prefs: Record<string, unknown> | null | undefined): number {
  if (!prefs || typeof prefs !== 'object') return 0;

  const journeyKeys = [
    'journeyDiscovery',
    'journeyReservation',
    'journeyArrival',
    'journeyMenu',
    'journeyOrder',
    'journeyTracking',
    'journeyConsumption',
    'journeyBill',
    'journeyPayment',
    'journeyPostVisit',
  ] as const;
  const channelKeys = ['onlineReservations', 'waitlist', 'eventReservations'] as const;
  const serviceKeys = ['tableService', 'qrOrdering', 'counterService', 'selfService'] as const;
  const intelKeys = ['smartAllocation', 'postVisitFeedback'] as const;

  const ratio = (keys: readonly string[]) => {
    const active = keys.filter((key) => Boolean(prefs[key])).length;
    return active / keys.length;
  };

  const hasReservationSettings =
    typeof prefs.maxAdvanceDays === 'number' || typeof prefs.toleranceMinutes === 'number';

  const score =
    ratio(journeyKeys) * 40 +
    ratio(channelKeys) * 20 +
    (serviceKeys.some((key) => Boolean(prefs[key])) ? 20 : 0) +
    ratio(intelKeys) * 10 +
    (hasReservationSettings ? 10 : 0);

  return Math.round(Math.min(100, score));
}

export function calculateFloorProgress(tables: Array<{ section?: string | null }> | null | undefined): number {
  const list = Array.isArray(tables) ? tables : [];
  if (list.length === 0) return 0;

  const zones = new Set(
    list.map((table) => (table.section === 'Salao' ? 'Salão' : table.section || 'Salão').trim()).filter(Boolean),
  );

  let score = 35;
  if (list.length >= 4) score += 25;
  else if (list.length >= 2) score += 15;
  else score += 5;

  if (list.length >= 8) score += 20;
  if (zones.size >= 2) score += 15;
  if (zones.size >= 3) score += 5;

  return Math.min(100, score);
}

export function calculateMenuProgress(
  menu: Array<{ items?: unknown[] }> | Array<Record<string, unknown>> | null | undefined,
): number {
  if (!Array.isArray(menu) || menu.length === 0) return 0;

  const grouped = menu.some((entry) => Array.isArray((entry as { items?: unknown[] }).items));
  let categoryCount = 0;
  let itemCount = 0;

  if (grouped) {
    categoryCount = menu.length;
    itemCount = menu.reduce((sum, category) => {
      const items = (category as { items?: unknown[] }).items;
      return sum + (Array.isArray(items) ? items.length : 0);
    }, 0);
  } else {
    const categoryIds = new Set(
      menu.map((item) => String((item as { category_id?: string }).category_id || 'uncategorized')),
    );
    categoryCount = categoryIds.size;
    itemCount = menu.length;
  }

  if (itemCount <= 0) return categoryCount > 0 ? 25 : 0;
  if (categoryCount >= 3 && itemCount >= 12) return 100;
  if (categoryCount >= 2 && itemCount >= 6) return 85;
  if (itemCount >= 3) return 70;
  return 45;
}

export function calculateTeamProgress(
  staff: Array<{ is_active?: boolean; role?: string }> | null | undefined,
): number {
  const list = Array.isArray(staff) ? staff : [];
  const active = list.filter((member) => member.is_active !== false);
  if (active.length === 0) return 0;

  const roles = new Set(active.map((member) => member.role).filter(Boolean));
  let score = 40;
  if (active.length >= 2) score += 20;
  if (active.length >= 4) score += 15;
  if (roles.size >= 2) score += 15;
  if (roles.size >= 3) score += 10;
  return Math.min(100, score);
}

export function calculateKitchenProgress(
  stations: unknown[] | null | undefined,
  kdsConfig: Record<string, unknown> | null | undefined,
): number {
  const stationCount = Array.isArray(stations) ? stations.length : 0;
  if (stationCount <= 0 && !kdsConfig) return 0;

  let score = 0;
  if (stationCount >= 1) score += 35;
  if (stationCount >= 2) score += 20;
  if (stationCount >= 4) score += 15;

  if (kdsConfig && typeof kdsConfig === 'object') {
    score += 15;
    if (Number(kdsConfig.kds_screens ?? 0) >= 1) score += 5;
    if (Number(kdsConfig.default_prep_minutes ?? 0) > 0) score += 5;
    if (kdsConfig.auto_routing === true) score += 5;
  }

  return Math.min(100, score);
}

export function calculatePaymentsProgress(methods: Record<string, unknown> | null | undefined): number {
  if (!methods || typeof methods !== 'object') return 0;

  const methodKeys = ['creditCard', 'debitCard', 'pix', 'applePay', 'googlePay', 'tapToPay', 'cash'] as const;
  const enabledMethods = methodKeys.filter((key) => Boolean(methods[key])).length;
  if (enabledMethods === 0) return 15;

  let score = Math.min(40, enabledMethods * 8);
  if (methods.serviceFeeEnabled === true && Number(methods.feePercent ?? 0) >= 0) score += 15;
  if (methods.tipsEnabled === true && Array.isArray(methods.tipOptions) && methods.tipOptions.length > 0) {
    score += 20;
  }
  const splitKeys = ['splitIndividual', 'splitEqual', 'splitByItem', 'splitFixed'] as const;
  if (splitKeys.some((key) => Boolean(methods[key]))) score += 15;
  if (methods.tipAllowCustom === true) score += 10;

  return Math.min(100, score);
}

export function calculateMarketplaceProgress(features: Record<string, unknown> | null | undefined): number {
  if (!features || typeof features !== 'object' || Array.isArray(features)) return 0;

  const catalogKeys = [
    'loyalty',
    'events',
    'happyHour',
    'aiRecommendations',
    'vip',
    'experiencePackages',
    'smartReviews',
    'advancedAnalytics',
  ] as const;

  const known = catalogKeys.filter((key) => key in features);
  if (known.length === 0) return 0;

  const active = catalogKeys.filter((key) => Boolean(features[key])).length;
  // Having opened/saved marketplace counts as configured; more active features raise completion.
  const base = 40;
  const bonus = Math.round((active / catalogKeys.length) * 60);
  return Math.min(100, base + bonus);
}
