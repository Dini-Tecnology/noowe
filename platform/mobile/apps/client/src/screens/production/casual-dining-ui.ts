import {
  CASUAL_DINING_DISCOVERY_AMENITIES,
  CASUAL_DINING_SERVICE_AMENITIES,
  CASUAL_DINING_AMENITY_PRESENTATION,
  parseAmenities,
  parseCasualDiningConfig,
  formatPricePerPerson,
  type CasualDiningAmenity,
  type CasualDiningConfig,
} from '@okinawa/shared/config/casual-dining';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { CustomerRestaurant, RestaurantLiveStatus } from '../../services/customer-backend';

type IoniconName = keyof typeof Ionicons.glyphMap;

export {
  parseAmenities,
  parseCasualDiningConfig,
  formatPricePerPerson,
  CASUAL_DINING_DISCOVERY_AMENITIES,
  CASUAL_DINING_SERVICE_AMENITIES,
};
export type { CasualDiningAmenity, CasualDiningConfig };

export const DISCOVERY_FILTERS: { key: CasualDiningAmenity; label: string; icon: IoniconName }[] =
  CASUAL_DINING_DISCOVERY_AMENITIES.map((key) => ({
    key,
    label: CASUAL_DINING_AMENITY_PRESENTATION[key].label,
    icon: CASUAL_DINING_AMENITY_PRESENTATION[key].icon as IoniconName,
  }));

export function amenityChipLabel(key: string, variant: 'short' | 'long' = 'long'): string {
  const presentation = CASUAL_DINING_AMENITY_PRESENTATION[key as CasualDiningAmenity];
  if (!presentation) return key;
  return variant === 'long' ? presentation.longLabel ?? presentation.label : presentation.label;
}

export function amenityChipIcon(key: string): IoniconName {
  return (CASUAL_DINING_AMENITY_PRESENTATION[key as CasualDiningAmenity]?.icon ?? 'ellipse-outline') as IoniconName;
}

/** Actions on the casual dining restaurant page, under the rating row. */
export const CASUAL_RESTAURANT_ACTIONS: { key: string; label: string; icon: IoniconName }[] = [
  { key: 'menu', label: 'Cardápio', icon: 'restaurant-outline' },
  { key: 'photos', label: 'Fotos', icon: 'heart-outline' },
  { key: 'reviews', label: 'Avaliações', icon: 'star-outline' },
  { key: 'directions', label: 'Como ir', icon: 'location-outline' },
];

/** "Jantar em família" — the casual dining home greets by meal, not by luxury. */
export function casualDiningHeadline(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 11) return 'Café da manhã em família';
  if (hour < 15) return 'Almoço em família';
  if (hour < 18) return 'Lanche em família';
  return 'Jantar em família';
}

export function waitLabel(status: RestaurantLiveStatus | undefined | null): string | null {
  if (!status) return null;
  if (!status.isOpen) return null;
  if (status.estimatedWaitMinutes <= 0) return 'Sem espera';
  return `~${status.estimatedWaitMinutes} min de espera`;
}

export function openLabel(status: RestaurantLiveStatus | undefined | null): string | null {
  if (!status) return null;
  if (!status.isOpen) return status.opensAt ? `Fechado · abre ${status.opensAt}` : 'Fechado agora';
  return status.closesAt ? `Aberto até ${status.closesAt}` : 'Aberto';
}

export function occupancyLabel(status: RestaurantLiveStatus | undefined | null): string | null {
  if (!status || status.occupancyPercent == null) return null;
  return `${status.occupancyPercent}%`;
}

const OCCUPANCY_TONES = {
  baixa: '#16A34A',
  media: '#D97706',
  alta: '#EA580C',
  indisponivel: '#64748B',
} as const;

export function occupancyTone(status: RestaurantLiveStatus | undefined | null): string {
  return OCCUPANCY_TONES[status?.occupancyLevel ?? 'indisponivel'];
}

/**
 * Badges over the photo of a discovery card — only the two family-facing
 * amenities, so the card stays readable at a glance.
 */
export function cardBadges(restaurant: CustomerRestaurant): { key: string; label: string; tone: 'kids' | 'pet' }[] {
  const { keys } = parseAmenities(restaurant.serviceConfig);
  const badges: { key: string; label: string; tone: 'kids' | 'pet' }[] = [];
  if (keys.includes('kids_friendly')) badges.push({ key: 'kids_friendly', label: 'Kids Friendly', tone: 'kids' });
  if (keys.includes('pet_friendly')) badges.push({ key: 'pet_friendly', label: 'Pet OK', tone: 'pet' });
  return badges;
}

/** Restaurants in "Modo Família" are surfaced first on the casual dining home. */
export function sortByFamilyMode(restaurants: CustomerRestaurant[]): CustomerRestaurant[] {
  return [...restaurants].sort((a, b) => {
    const score = (restaurant: CustomerRestaurant) => {
      const config = parseCasualDiningConfig(
        (restaurant.serviceConfig as { casual_dining?: unknown }).casual_dining,
      );
      const { keys } = parseAmenities(restaurant.serviceConfig);
      return (config.familyMode ? 2 : 0) + (keys.includes('kids_friendly') ? 1 : 0);
    };
    return score(b) - score(a);
  });
}

export function hasFamilyMode(restaurant: CustomerRestaurant | undefined | null): boolean {
  if (!restaurant) return false;
  return parseCasualDiningConfig(
    (restaurant.serviceConfig as { casual_dining?: unknown }).casual_dining,
  ).familyMode;
}

export function casualDiningConfigOf(restaurant: CustomerRestaurant | undefined | null): CasualDiningConfig {
  return parseCasualDiningConfig(
    (restaurant?.serviceConfig as { casual_dining?: unknown } | undefined)?.casual_dining,
  );
}

/** Chips shown on the restaurant page: configured amenities, then free text. */
export function restaurantAmenityChips(restaurant: CustomerRestaurant): { key: string; label: string; icon: IoniconName }[] {
  const { keys, freeText } = parseAmenities(restaurant.serviceConfig);
  return [
    ...keys.map((key) => ({ key, label: amenityChipLabel(key), icon: amenityChipIcon(key) })),
    ...freeText.map((label) => ({ key: `free:${label}`, label, icon: 'ellipse-outline' as IoniconName })),
  ];
}
