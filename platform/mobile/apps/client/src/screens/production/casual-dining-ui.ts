import {
  CASUAL_DINING_DISCOVERY_AMENITIES,
  CASUAL_DINING_SERVICE_AMENITIES,
  CASUAL_DINING_AMENITY_PRESENTATION,
  parseAmenities,
  parseCasualDiningConfig,
  type CasualDiningAmenity,
  type CasualDiningConfig,
} from '@okinawa/shared/config/casual-dining';
import { FINE_DINING_AMBIANCE_PRESENTATION, isFineDiningAmbiance } from '@okinawa/shared/config/fine-dining';
import { QUICK_SERVICE_CUISINE_PRESENTATION, isQuickServiceCuisineTag } from '@okinawa/shared/config/quick-service';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { CustomerRestaurant, RestaurantLiveStatus } from '../../services/customer-backend';

type IoniconName = keyof typeof Ionicons.glyphMap;

export {
  parseAmenities,
  parseCasualDiningConfig,
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

/**
 * Amenidades cadastradas como texto livre ("Terraço", "Bar", "Café") ainda
 * precisam de um ícone próprio; sem essa tabela caem no `ellipse-outline` e a
 * página do restaurante vira um mural de círculos idênticos.
 */
const FREE_TEXT_AMENITY_ICON_RULES: { icon: IoniconName; pattern: RegExp }[] = [
  { icon: 'wifi-outline', pattern: /\bwi[\s-]?fi\b|\binternet\b/i },
  { icon: 'car-outline', pattern: /estacionamento|valet|garagem/i },
  { icon: 'accessibility-outline', pattern: /acess[íi]vel|acessibilidade|rampa|cadeirante/i },
  { icon: 'paw-outline', pattern: /\bpet\b|animais|cachorr/i },
  { icon: 'happy-outline', pattern: /\bkids?\b|infantil|crian[çc]a/i },
  { icon: 'body-outline', pattern: /cadeir[ãa]o/i },
  { icon: 'people-outline', pattern: /grupos?|festas?|aniversári/i },
  { icon: 'calendar-outline', pattern: /reserva/i },
  { icon: 'snow-outline', pattern: /ar[\s-]?condicionado|climatizad/i },
  { icon: 'musical-notes-outline', pattern: /m[úu]sica ao vivo|live music|dj\b/i },
  { icon: 'wine-outline', pattern: /\bbar\b|adega|drinks?|coquet/i },
  { icon: 'cafe-outline', pattern: /\bcaf[eé]\b|cafeteria/i },
  { icon: 'leaf-outline', pattern: /terra[çc]o|varanda|jardim|rooftop|deck/i },
  { icon: 'sunny-outline', pattern: /ao ar livre|outdoor|externo/i },
  { icon: 'restaurant-outline', pattern: /gar[çc]om|table service/i },
  { icon: 'card-outline', pattern: /cart[ãa]o|pix|pagamento/i },
];

export function amenityChipIconForFreeText(text: string): IoniconName {
  const rule = FREE_TEXT_AMENITY_ICON_RULES.find((entry) => entry.pattern.test(text));
  return rule?.icon ?? ('ellipse-outline' as IoniconName);
}

/** Actions on the restaurant page, under the rating row. */
export const RESTAURANT_PAGE_ACTIONS: { key: string; label: string; icon: IoniconName }[] = [
  { key: 'menu', label: 'Cardápio', icon: 'restaurant-outline' },
  { key: 'photos', label: 'Fotos', icon: 'images-outline' },
  { key: 'reviews', label: 'Avaliações', icon: 'star-outline' },
  { key: 'directions', label: 'Como ir', icon: 'location-outline' },
];

/** Hard ceiling of amenity chips shown inline on the restaurant page. */
export const MAX_AMENITY_CHIPS = 6;

/**
 * How many amenity chips fit inline before the "…" chip takes over. Narrow
 * phones show fewer so the block never pushes the page content down; no
 * device shows more than `MAX_AMENITY_CHIPS`.
 */
export function amenityChipLimitForWidth(width: number): number {
  if (width < 340) return 4;
  if (width < 380) return 5;
  return MAX_AMENITY_CHIPS;
}

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

export interface RestaurantChip {
  key: string;
  label: string;
  icon: IoniconName;
}

/**
 * Chips shown on the restaurant page. `service_config.amenities` holds two
 * different vocabularies — casual dining's amenities and fine dining's
 * ambiance tags — so both are resolved here; anything else is kept as free
 * text. A restaurant with no amenities at all falls back to its cuisine
 * tags, which is what quick service carries instead. Which vocabulary a row
 * uses is a property of the row, never of the service model name.
 */
export function restaurantAmenityChips(restaurant: CustomerRestaurant): RestaurantChip[] {
  const { keys, freeText } = parseAmenities(restaurant.serviceConfig);
  const chips: RestaurantChip[] = [
    ...keys.map((key) => ({ key, label: amenityChipLabel(key), icon: amenityChipIcon(key) })),
    ...freeText.map((value) => {
      const ambiance = isFineDiningAmbiance(value) ? FINE_DINING_AMBIANCE_PRESENTATION[value] : null;
      return {
        key: `tag:${value}`,
        label: ambiance?.label ?? value,
        icon: (ambiance?.icon ?? amenityChipIconForFreeText(value)) as IoniconName,
      };
    }),
  ];
  if (chips.length > 0) return chips;

  return restaurant.cuisineTypes.map((value) => {
    const cuisine = isQuickServiceCuisineTag(value) ? QUICK_SERVICE_CUISINE_PRESENTATION[value] : null;
    return {
      key: `cuisine:${value}`,
      label: cuisine?.label ?? value,
      icon: (cuisine?.icon ?? 'restaurant-outline') as IoniconName,
    };
  });
}
