/**
 * Contract returned by public.get_restaurant_model_capabilities.
 *
 * This module deliberately has no defaults by service model. A missing or
 * malformed server response disables the feature instead of silently bringing
 * back a client-side rule.
 */
export const SERVICE_MODELS = ['fine_dining', 'casual_dining', 'quick_service'] as const;

export type ServiceModel = (typeof SERVICE_MODELS)[number];

export type SplitMode = 'by_owner' | 'equal' | 'by_item' | 'fixed_amount';
export type LoyaltyMode = 'points' | 'tiers' | 'stamps' | 'mixed';
/** Spec §6 "Unidade de consumo": how the customer's order is grouped. */
export type ConsumptionUnit = 'table_with_guests' | 'per_person' | 'individual_cart';
/** Spec §6 "Acompanhamento": what the customer follows after ordering. */
export type OrderTrackingMode = 'item_with_preparer' | 'table_order' | 'pickup_steps';
export type StaffCallType = 'waiter' | 'sommelier' | 'help' | 'bill';
/** ADR-013 §2.3: o que acontece com um pedido pronto que o cliente não retirou. */
export type NoPickupPolicy = 'none' | 'store_credit';
export type AcceptMode = 'auto' | 'manual';

export type RestaurantCapabilities = {
  /** Contract schema version. Consumers must fail closed on unknown versions. */
  contractVersion: 2;
  reservations: boolean;
  reservationRequired: boolean;
  virtualQueue: boolean;
  queueIsPrimaryEntry: boolean;
  orderWhileWaiting: boolean;
  tableSession: boolean;
  tableCheckIn: boolean;
  tableQr: boolean;
  counterQr: boolean;
  guestLink: boolean;
  /** ADR-011: convite por @username com aceite do convidado. */
  userInvite: boolean;
  splitBill: boolean;
  splitModes: SplitMode[];
  serviceFee: boolean;
  staffCalls: boolean;
  staffCallTypes: StaffCallType[];
  familyMode: boolean;
  parties: boolean;
  comboBuilder: boolean;
  prepaidRequired: boolean;
  /** ADR-013: o cliente pede, paga e retira pelo app, sem mesa (substitui o totem). */
  orderAhead: boolean;
  pickupCode: boolean;
  pickupSlots: boolean;
  qualityCheck: boolean;
  loyaltyMode: LoyaltyMode;
  consumptionUnit: ConsumptionUnit;
  orderTracking: OrderTrackingMode;
};

export type RestaurantCapabilityPolicies = {
  serviceFeeBps: number | null;
  tipPresetsBps: number[];
  queueCallToleranceMin: number | null;
  reservationNoShowMin: number | null;
  guestLinkTtlMin: number | null;
  userInviteTtlMin: number | null;
  userSearchMinChars: number | null;
  capacityRequestTtlMin: number | null;
  requireGuestAccount: boolean;
  enforceTableCapacity: boolean;
  capacityOverrideRoles: string[];
  splitFixedRemainder: 'redistribute_unpaid' | 'keep_on_table' | null;
  tipAllocation: 'table_waiter' | 'team_pool' | null;
  comboDiscountBps: number | null;
  pickupCapacityPerSlot: number | null;
  pickupExpiryMin: number | null;
  stampsPerReward: number | null;
  /** ADR-013 — regras de aceite, retirada e pagamento do Quick Service. */
  noPickupPolicy: NoPickupPolicy | null;
  acceptMode: AcceptMode | null;
  acceptTimeoutMin: number | null;
  ordersPaused: boolean;
  defaultPrepMin: number | null;
  closeOrdersBeforeMin: number | null;
  pixExpiryMin: number | null;
  distanceWarningKm: number | null;
  pickupLocation: string | null;
};

export type RestaurantCapabilityContract = {
  contractVersion: 2;
  enabledServiceModels: ServiceModel[];
  serviceModel: ServiceModel;
  capabilities: RestaurantCapabilities;
  policies: RestaurantCapabilityPolicies;
};

/** Feature names used by the current client screens during the transition. */
export type ClientFeatureFlags = {
  reservations: boolean; virtualQueue: boolean; tableManagement: boolean;
  menu: boolean; menuPersonalization: boolean; ordering: boolean; orderTracking: boolean;
  qrOrdering: boolean; callWaiter: boolean; splitPayment: boolean; billing: boolean;
  payments: boolean; guestInvitations: boolean; aiPairing: boolean; loyalty: boolean; postVisit: boolean;
};

const capabilityKeys = [
  'reservations', 'reservationRequired', 'virtualQueue', 'queueIsPrimaryEntry',
  'orderWhileWaiting', 'tableSession', 'tableCheckIn', 'tableQr', 'counterQr',
  'guestLink', 'userInvite', 'splitBill', 'serviceFee', 'staffCalls', 'familyMode', 'parties',
  'comboBuilder', 'prepaidRequired', 'pickupCode', 'pickupSlots', 'qualityCheck',
] as const;

const splitModes: readonly SplitMode[] = ['by_owner', 'equal', 'by_item', 'fixed_amount'];
const loyaltyModes: readonly LoyaltyMode[] = ['points', 'tiers', 'stamps', 'mixed'];
const consumptionUnits: readonly ConsumptionUnit[] = ['table_with_guests', 'per_person', 'individual_cart'];
const orderTrackingModes: readonly OrderTrackingMode[] = ['item_with_preparer', 'table_order', 'pickup_steps'];
const staffCallTypes: readonly StaffCallType[] = ['waiter', 'sommelier', 'help', 'bill'];

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const asNullableNumber = (value: unknown): number | null | undefined => {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
};

const asStringArray = (value: unknown): string[] | null => (
  Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null
);

export function isServiceModel(value: unknown): value is ServiceModel {
  return typeof value === 'string' && (SERVICE_MODELS as readonly string[]).includes(value);
}

/** Returns null when the response cannot safely drive the UI. */
export function parseRestaurantCapabilityContract(value: unknown): RestaurantCapabilityContract | null {
  const root = asRecord(value);
  const capabilities = asRecord(root?.capabilities);
  const policies = asRecord(root?.policies);
  if (!root || !capabilities || !policies || root.contractVersion !== 2 || !isServiceModel(root.serviceModel)) return null;

  const enabledServiceModels = asStringArray(root.enabledServiceModels);
  if (!enabledServiceModels || !enabledServiceModels.every(isServiceModel) || !enabledServiceModels.includes(root.serviceModel)) return null;

  if (capabilityKeys.some((key) => typeof capabilities[key] !== 'boolean')) return null;
  const rawSplitModes = asStringArray(capabilities.splitModes);
  const rawStaffCallTypes = asStringArray(capabilities.staffCallTypes);
  if (!rawSplitModes || !rawSplitModes.every((mode) => splitModes.includes(mode as SplitMode))) return null;
  if (!rawStaffCallTypes || !rawStaffCallTypes.every((type) => staffCallTypes.includes(type as StaffCallType))) return null;
  if (!loyaltyModes.includes(capabilities.loyaltyMode as LoyaltyMode)) return null;
  if (!consumptionUnits.includes(capabilities.consumptionUnit as ConsumptionUnit)) return null;
  if (!orderTrackingModes.includes(capabilities.orderTracking as OrderTrackingMode)) return null;

  const numberArray = (field: string): number[] | null => {
    const result = policies[field];
    return Array.isArray(result) && result.every((item) => typeof item === 'number' && Number.isFinite(item))
      ? result as number[]
      : null;
  };
  const nullableNumberFields = [
    'serviceFeeBps', 'queueCallToleranceMin', 'reservationNoShowMin', 'guestLinkTtlMin',
    'userInviteTtlMin', 'userSearchMinChars', 'capacityRequestTtlMin',
    'comboDiscountBps', 'pickupCapacityPerSlot', 'pickupExpiryMin', 'stampsPerReward',
  ] as const;
  if (nullableNumberFields.some((field) => asNullableNumber(policies[field]) === undefined)) return null;
  if (!numberArray('tipPresetsBps') || !asStringArray(policies.capacityOverrideRoles)) return null;
  if (typeof policies.requireGuestAccount !== 'boolean' || typeof policies.enforceTableCapacity !== 'boolean') return null;
  if (policies.splitFixedRemainder !== null && policies.splitFixedRemainder !== 'redistribute_unpaid' && policies.splitFixedRemainder !== 'keep_on_table') return null;
  if (policies.tipAllocation !== null && policies.tipAllocation !== 'table_waiter' && policies.tipAllocation !== 'team_pool') return null;

  // ADR-013: campos novos são opcionais no contrato — um servidor anterior à
  // migration de 2026-10-01 não os envia, e isso não pode derrubar o app.
  const optionalNumber = (field: string): number | null => {
    const raw = policies[field];
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  };
  return {
    ...(value as RestaurantCapabilityContract),
    capabilities: { ...(capabilities as unknown as RestaurantCapabilities), orderAhead: capabilities.orderAhead === true },
    policies: {
      ...(policies as unknown as RestaurantCapabilityPolicies),
      noPickupPolicy: policies.noPickupPolicy === 'none' || policies.noPickupPolicy === 'store_credit'
        ? policies.noPickupPolicy : null,
      acceptMode: policies.acceptMode === 'auto' || policies.acceptMode === 'manual' ? policies.acceptMode : null,
      acceptTimeoutMin: optionalNumber('acceptTimeoutMin'),
      ordersPaused: policies.ordersPaused === true,
      defaultPrepMin: optionalNumber('defaultPrepMin'),
      closeOrdersBeforeMin: optionalNumber('closeOrdersBeforeMin'),
      pixExpiryMin: optionalNumber('pixExpiryMin'),
      distanceWarningKm: optionalNumber('distanceWarningKm'),
      pickupLocation: typeof policies.pickupLocation === 'string' && policies.pickupLocation ? policies.pickupLocation : null,
    },
  };
}

/** Bridges the server contract to existing screens without deciding by model. */
export function clientFeaturesFromCapabilities(contract: RestaurantCapabilityContract): ClientFeatureFlags {
  const { capabilities } = contract;
  return {
    reservations: capabilities.reservations,
    virtualQueue: capabilities.virtualQueue,
    tableManagement: capabilities.tableSession,
    menu: true,
    menuPersonalization: capabilities.comboBuilder,
    ordering: true,
    orderTracking: true,
    qrOrdering: capabilities.tableSession,
    callWaiter: capabilities.staffCalls,
    splitPayment: capabilities.splitBill,
    billing: capabilities.tableSession,
    payments: true,
    guestInvitations: capabilities.guestLink,
    aiPairing: false,
    loyalty: true,
    postVisit: true,
  };
}
