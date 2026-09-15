export const MVP_SERVICE_TYPES = ['fine_dining', 'casual_dining', 'quick_service'] as const;

export type ServiceType = (typeof MVP_SERVICE_TYPES)[number];

export type ServiceTypeFeatureKey =
  | 'reservations'
  | 'virtualQueue'
  | 'tableManagement'
  | 'menu'
  | 'menuPersonalization'
  | 'ordering'
  | 'orderTracking'
  | 'qrOrdering'
  | 'callWaiter'
  | 'splitPayment'
  | 'billing'
  | 'payments'
  | 'guestInvitations'
  | 'aiPairing'
  | 'loyalty'
  | 'postVisit';

export type ServiceTypeFeatures = Record<ServiceTypeFeatureKey, boolean>;

export interface CustomerExperienceConfig {
  onlineReservations?: boolean;
  waitlist?: boolean;
  eventReservations?: boolean;
  tableService?: boolean;
  qrOrdering?: boolean;
  counterService?: boolean;
  selfService?: boolean;
  smartAllocation?: boolean;
  postVisitFeedback?: boolean;
  journeyDiscovery?: boolean;
  journeyReservation?: boolean;
  journeyArrival?: boolean;
  journeyMenu?: boolean;
  journeyOrder?: boolean;
  journeyTracking?: boolean;
  journeyConsumption?: boolean;
  journeyBill?: boolean;
  journeyPayment?: boolean;
  journeyPostVisit?: boolean;
}

export interface ServiceTypeDefinition {
  type: ServiceType;
  name: string;
  description: string;
  icon: string;
  features: ServiceTypeFeatures;
}

const COMMON_FEATURES: ServiceTypeFeatures = {
  reservations: false,
  virtualQueue: false,
  tableManagement: false,
  menu: true,
  menuPersonalization: false,
  ordering: true,
  orderTracking: true,
  qrOrdering: true,
  callWaiter: false,
  splitPayment: true,
  billing: true,
  payments: true,
  guestInvitations: false,
  aiPairing: false,
  loyalty: true,
  postVisit: true,
};

export const DISABLED_SERVICE_TYPE_FEATURES: ServiceTypeFeatures = Object.fromEntries(
  Object.keys(COMMON_FEATURES).map((key) => [key, false]),
) as ServiceTypeFeatures;

export const SERVICE_TYPE_CONFIGS: Record<ServiceType, ServiceTypeDefinition> = {
  fine_dining: {
    type: 'fine_dining',
    name: 'Fine Dining',
    description: 'Serviço completo de mesa, reservas e experiência personalizada',
    icon: 'crown',
    features: {
      ...COMMON_FEATURES,
      reservations: true,
      virtualQueue: true,
      tableManagement: true,
      menuPersonalization: true,
      callWaiter: true,
      guestInvitations: true,
      aiPairing: true,
    },
  },
  casual_dining: {
    type: 'casual_dining',
    name: 'Casual Dining',
    description: 'Reservas opcionais, fila de espera e atendimento à mesa',
    icon: 'utensils',
    features: {
      ...COMMON_FEATURES,
      reservations: true,
      virtualQueue: true,
      tableManagement: true,
      callWaiter: true,
      guestInvitations: true,
    },
  },
  quick_service: {
    type: 'quick_service',
    name: 'Quick Service',
    description: 'Pedido rápido, preparo e retirada no balcão',
    icon: 'zap',
    features: {
      ...COMMON_FEATURES,
      virtualQueue: true,
      tableManagement: false,
      callWaiter: false,
      guestInvitations: false,
    },
  },
};

export function isSupportedServiceType(value: unknown): value is ServiceType {
  return typeof value === 'string' && (MVP_SERVICE_TYPES as readonly string[]).includes(value);
}

function booleanRecord(value: unknown): Partial<ServiceTypeFeatures> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Partial<ServiceTypeFeatures> = {};
  for (const key of Object.keys(COMMON_FEATURES) as ServiceTypeFeatureKey[]) {
    const candidate = (value as Record<string, unknown>)[key];
    if (typeof candidate === 'boolean') result[key] = candidate;
  }
  return result;
}

export function getServiceTypeFeatures(
  serviceType: ServiceType,
  options?: {
    featureOverrides?: unknown;
    customerExperience?: CustomerExperienceConfig | null;
  },
): ServiceTypeFeatures {
  const features: ServiceTypeFeatures = {
    ...SERVICE_TYPE_CONFIGS[serviceType].features,
    ...booleanRecord(options?.featureOverrides),
  };
  const experience = options?.customerExperience;
  if (!experience) return features;

  if (experience.onlineReservations === false || experience.journeyReservation === false) {
    features.reservations = false;
    features.guestInvitations = false;
  }
  if (experience.waitlist === false || experience.journeyArrival === false) {
    features.virtualQueue = false;
  }
  if (experience.tableService === false) {
    features.tableManagement = false;
    features.callWaiter = false;
  }
  if (experience.journeyMenu === false) {
    features.menu = false;
    features.menuPersonalization = false;
    features.aiPairing = false;
  }
  if (experience.qrOrdering === false) features.qrOrdering = false;
  if (experience.journeyOrder === false) {
    features.ordering = false;
    features.qrOrdering = false;
  }
  if (experience.journeyTracking === false) features.orderTracking = false;
  if (experience.journeyBill === false) {
    features.billing = false;
    features.splitPayment = false;
  }
  if (experience.journeyPayment === false) {
    features.payments = false;
    features.splitPayment = false;
  }
  if (experience.postVisitFeedback === false || experience.journeyPostVisit === false) {
    features.postVisit = false;
  }

  return features;
}

export function getDefaultCustomerExperience(serviceType: ServiceType): Required<CustomerExperienceConfig> {
  const features = SERVICE_TYPE_CONFIGS[serviceType].features;
  return {
    onlineReservations: features.reservations,
    waitlist: features.virtualQueue,
    eventReservations: features.guestInvitations,
    tableService: features.tableManagement,
    qrOrdering: features.qrOrdering,
    counterService: serviceType === 'quick_service',
    selfService: false,
    smartAllocation: features.tableManagement,
    postVisitFeedback: features.postVisit,
    journeyDiscovery: true,
    journeyReservation: features.reservations,
    journeyArrival: true,
    journeyMenu: features.menu,
    journeyOrder: features.ordering,
    journeyTracking: features.orderTracking,
    journeyConsumption: serviceType !== 'quick_service',
    journeyBill: features.billing,
    journeyPayment: features.payments,
    journeyPostVisit: features.postVisit,
  };
}
