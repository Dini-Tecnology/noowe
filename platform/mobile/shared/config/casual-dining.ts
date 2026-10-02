/**
 * Casual Dining — the amenity vocabulary and operational config shared by the
 * customer app (discovery filters, restaurant page, family mode) and the
 * restaurant app (the screen that edits them).
 *
 * The keys here are the contract with the database: they're validated by
 * `private.casual_dining_amenity_keys()` and stored in
 * `restaurants.service_config.amenities`, which the discovery list filters by
 * jsonb containment. Adding a key requires the migration to accept it too.
 */

export const CASUAL_DINING_DISCOVERY_AMENITIES = [
  'kids_friendly',
  'pet_friendly',
  'outdoor_seating',
  'parking',
  'accessible',
] as const;

export const CASUAL_DINING_SERVICE_AMENITIES = [
  'table_service',
  'optional_reservation',
  'large_groups',
  'high_chair',
  'wifi',
  'air_conditioning',
  'live_music',
] as const;

export const CASUAL_DINING_AMENITIES = [
  ...CASUAL_DINING_DISCOVERY_AMENITIES,
  ...CASUAL_DINING_SERVICE_AMENITIES,
] as const;

export type CasualDiningDiscoveryAmenity = (typeof CASUAL_DINING_DISCOVERY_AMENITIES)[number];
export type CasualDiningAmenity = (typeof CASUAL_DINING_AMENITIES)[number];

export interface AmenityPresentation {
  /** Short label used on discovery filter chips. */
  label: string;
  /** Longer label used on the restaurant page chips. */
  longLabel?: string;
  /** Ionicons name (customer app). */
  icon: string;
}

export const CASUAL_DINING_AMENITY_PRESENTATION: Record<CasualDiningAmenity, AmenityPresentation> = {
  kids_friendly: { label: 'Kids', longLabel: 'Kids Friendly', icon: 'happy-outline' },
  pet_friendly: { label: 'Pet Friendly', longLabel: 'Pet Friendly', icon: 'paw-outline' },
  outdoor_seating: { label: 'Ao ar livre', longLabel: 'Área ao ar livre', icon: 'sunny-outline' },
  parking: { label: 'Estacionamento', longLabel: 'Estacionamento', icon: 'car-outline' },
  accessible: { label: 'Acessível', longLabel: 'Acessível', icon: 'accessibility-outline' },
  table_service: { label: 'Garçom na mesa', icon: 'restaurant-outline' },
  optional_reservation: { label: 'Reserva opcional', icon: 'calendar-outline' },
  large_groups: { label: 'Grupos 10+', icon: 'people-outline' },
  high_chair: { label: 'Cadeirão', icon: 'body-outline' },
  wifi: { label: 'Wi-Fi', icon: 'wifi-outline' },
  air_conditioning: { label: 'Ar-condicionado', icon: 'snow-outline' },
  live_music: { label: 'Música ao vivo', icon: 'musical-notes-outline' },
};

export function isCasualDiningAmenity(value: unknown): value is CasualDiningAmenity {
  return typeof value === 'string' && (CASUAL_DINING_AMENITIES as readonly string[]).includes(value);
}

/**
 * Reads the amenity list off a restaurant's `service_config`. Values that
 * aren't part of the vocabulary are kept as free text — restaurants configured
 * before this vocabulary existed still show their chips on the detail page.
 */
export function parseAmenities(serviceConfig: unknown): {
  keys: CasualDiningAmenity[];
  freeText: string[];
} {
  const raw = (serviceConfig as { amenities?: unknown } | null)?.amenities;
  const list = Array.isArray(raw) ? raw : [];
  const keys: CasualDiningAmenity[] = [];
  const freeText: string[] = [];
  for (const entry of list) {
    if (isCasualDiningAmenity(entry)) {
      if (!keys.includes(entry)) keys.push(entry);
    } else if (typeof entry === 'string' && entry.trim()) {
      freeText.push(entry.trim());
    }
  }
  return { keys, freeText };
}

export function amenityLabel(key: string, variant: 'short' | 'long' = 'short'): string {
  const presentation = CASUAL_DINING_AMENITY_PRESENTATION[key as CasualDiningAmenity];
  if (!presentation) return key;
  return variant === 'long' ? presentation.longLabel ?? presentation.label : presentation.label;
}

export function amenityIcon(key: string): string {
  return CASUAL_DINING_AMENITY_PRESENTATION[key as CasualDiningAmenity]?.icon ?? 'ellipse-outline';
}

export interface CasualDiningConfig {
  /** Kids menu highlighted, kids-first plating, family suggestions. */
  familyMode: boolean;
  /** Waitlist for walk-ins, with the estimated wait shown to the customer. */
  waitlistEnabled: boolean;
  estimatedWaitDisplay: boolean;
  /** Reservation accepted but not required (walk-in friendly). */
  reservationsOptional: boolean;
  /** Every diner at the table orders from their own phone, split by person. */
  sharedOrdering: boolean;
  /** "Chamar garçom" button inside the menu / comanda. */
  callWaiterButton: boolean;
  maxGroupSize: number;
  /** Party size from which a reservation becomes mandatory. */
  groupReservationRequired: number;
  averageMealDuration: number;
  /** Legacy per-person range keys; the page now shows the owner-set average price (ADR-014). */
  pricePerPersonMin: number | null;
  pricePerPersonMax: number | null;
}

export const DEFAULT_CASUAL_DINING_CONFIG: CasualDiningConfig = {
  familyMode: true,
  waitlistEnabled: true,
  estimatedWaitDisplay: true,
  reservationsOptional: true,
  sharedOrdering: true,
  callWaiterButton: true,
  maxGroupSize: 12,
  groupReservationRequired: 8,
  averageMealDuration: 75,
  pricePerPersonMin: null,
  pricePerPersonMax: null,
};

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function positiveNumberOr<T extends number | null>(value: unknown, fallback: T): number | T {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Accepts the snake_case shape stored in jsonb and the camelCase app shape. */
export function parseCasualDiningConfig(value: unknown): CasualDiningConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_CASUAL_DINING_CONFIG };
  }
  const raw = value as Record<string, unknown>;
  const pick = (snake: string, camel: string) => (raw[snake] !== undefined ? raw[snake] : raw[camel]);
  return {
    familyMode: booleanOr(pick('family_mode', 'familyMode'), DEFAULT_CASUAL_DINING_CONFIG.familyMode),
    waitlistEnabled: booleanOr(pick('waitlist_enabled', 'waitlistEnabled'), DEFAULT_CASUAL_DINING_CONFIG.waitlistEnabled),
    estimatedWaitDisplay: booleanOr(pick('estimated_wait_display', 'estimatedWaitDisplay'), DEFAULT_CASUAL_DINING_CONFIG.estimatedWaitDisplay),
    reservationsOptional: booleanOr(pick('reservations_optional', 'reservationsOptional'), DEFAULT_CASUAL_DINING_CONFIG.reservationsOptional),
    sharedOrdering: booleanOr(pick('shared_ordering', 'sharedOrdering'), DEFAULT_CASUAL_DINING_CONFIG.sharedOrdering),
    callWaiterButton: booleanOr(pick('call_waiter_button', 'callWaiterButton'), DEFAULT_CASUAL_DINING_CONFIG.callWaiterButton),
    maxGroupSize: positiveNumberOr(pick('max_group_size', 'maxGroupSize'), DEFAULT_CASUAL_DINING_CONFIG.maxGroupSize),
    groupReservationRequired: positiveNumberOr(pick('group_reservation_required', 'groupReservationRequired'), DEFAULT_CASUAL_DINING_CONFIG.groupReservationRequired),
    averageMealDuration: positiveNumberOr(pick('average_meal_duration', 'averageMealDuration'), DEFAULT_CASUAL_DINING_CONFIG.averageMealDuration),
    pricePerPersonMin: positiveNumberOr(pick('price_per_person_min', 'pricePerPersonMin'), null),
    pricePerPersonMax: positiveNumberOr(pick('price_per_person_max', 'pricePerPersonMax'), null),
  };
}

/** The jsonb shape persisted by `restaurant_update_casual_dining_config`. */
export function serializeCasualDiningConfig(config: CasualDiningConfig): Record<string, unknown> {
  return {
    family_mode: config.familyMode,
    waitlist_enabled: config.waitlistEnabled,
    estimated_wait_display: config.estimatedWaitDisplay,
    reservations_optional: config.reservationsOptional,
    shared_ordering: config.sharedOrdering,
    call_waiter_button: config.callWaiterButton,
    max_group_size: config.maxGroupSize,
    group_reservation_required: config.groupReservationRequired,
    average_meal_duration: config.averageMealDuration,
    price_per_person_min: config.pricePerPersonMin,
    price_per_person_max: config.pricePerPersonMax,
  };
}
