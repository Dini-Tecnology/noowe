export const QUICK_RESTAURANT_ACTIONS = [
  { key: 'scan', label: 'Escanear', icon: 'qr-code-outline', route: 'QrScanner' },
  { key: 'reserve', label: 'Reservar', icon: 'calendar-outline', route: 'CreateReservation' },
  { key: 'waitlist', label: 'Fila virtual', icon: 'timer-outline', route: 'Waitlist' },
  { key: 'menu', label: 'Cardápio', icon: 'restaurant-outline', route: 'Menu' },
] as const;

const DEFAULT_SERVICE_TYPE_PRESENTATION = {
  icon: 'restaurant-outline',
  label: 'Restaurante',
} as const;

export const SERVICE_TYPE_PRESENTATIONS = {
  fine_dining: { icon: 'wine-outline', label: 'Fine dining' },
  casual_dining: { icon: 'restaurant-outline', label: 'Casual dining' },
  quick_service: { icon: 'fast-food-outline', label: 'Serviço rápido' },
} as const;

export function getServiceTypePresentation(serviceType: string) {
  return SERVICE_TYPE_PRESENTATIONS[serviceType as keyof typeof SERVICE_TYPE_PRESENTATIONS]
    ?? DEFAULT_SERVICE_TYPE_PRESENTATION;
}

/**
 * "Preço médio R$ 50,00": o valor que o próprio restaurante cadastrou no painel,
 * em centavos (`restaurants.average_price_cents`). Só aqui, na borda da UI, o
 * valor vira reais. Sem cadastro (null) não há o que mostrar.
 */
export function formatAveragePrice(averagePriceCents: number | null | undefined): string | null {
  if (averagePriceCents == null || !Number.isFinite(averagePriceCents) || averagePriceCents <= 0) return null;
  const reais = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(averagePriceCents / 100);
  // Espaço sem quebra: o card não pode separar "R$" do valor em duas linhas.
  return `Preço médio R$\u00A0${reais}`;
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
}

export const NO_RATING_LABEL = 'Sem avaliação';

/** A restaurant nobody has reviewed yet has no rating — not a rating of zero. */
export function hasRating(rating: number, totalReviews: number): boolean {
  return totalReviews > 0 && rating > 0;
}

/** "4.6" for a rated restaurant, "Sem avaliação" for one nobody reviewed. */
export function formatRating(rating: number, totalReviews: number): string {
  return hasRating(rating, totalReviews) ? rating.toFixed(1) : NO_RATING_LABEL;
}

/** Same, with the review count: "4.6 (120)". */
export function formatRatingWithCount(rating: number, totalReviews: number): string {
  return hasRating(rating, totalReviews) ? `${rating.toFixed(1)} (${totalReviews})` : NO_RATING_LABEL;
}

/**
 * Peso de cada critério no destaque da home. Valores atuais, não constantes de
 * regra: trocar o equilíbrio entre "perto" e "bem avaliado" é mudança de uma
 * linha aqui (CLAUDE.md, convenção de valores).
 */
export const FEATURED_WEIGHTS = { proximity: 0.5, rating: 0.5 } as const;
/** Nota máxima da escala, usada para normalizar a avaliação em 0..1. */
const RATING_SCALE = 5;

export interface FeaturedCandidate {
  id: string;
  rating: number;
  totalReviews: number;
  lat: number | null;
  lng: number | null;
}

/**
 * Proximidade normalizada em 0..1 com decaimento suave: 0km → 1, 1km → 0.5,
 * 4km → 0.2. Não depende do conjunto, então acrescentar um restaurante
 * distante não reordena os demais.
 */
function proximityScore(distance: number | null): number {
  if (distance == null) return 0;
  return 1 / (1 + Math.max(distance, 0));
}

function ratingScore(candidate: FeaturedCandidate): number {
  return hasRating(candidate.rating, candidate.totalReviews)
    ? Math.min(candidate.rating, RATING_SCALE) / RATING_SCALE
    : 0;
}

export function featuredScore(candidate: FeaturedCandidate, distance: number | null): number {
  return proximityScore(distance) * FEATURED_WEIGHTS.proximity
    + ratingScore(candidate) * FEATURED_WEIGHTS.rating;
}

/**
 * O destaque da home: o restaurante mais próximo com a melhor avaliação,
 * combinando os dois critérios em uma nota única em vez de desempatar um pelo
 * outro. Sem localização do usuário, decide só pela avaliação; empate cai para
 * quem tem mais avaliações e, por fim, para a ordem recebida — nunca aleatório,
 * para a home não trocar de destaque a cada render.
 */
export function pickFeatured<T extends FeaturedCandidate>(
  restaurants: T[],
  location: { latitude: number; longitude: number } | null,
  distanceOf: (location: { latitude: number; longitude: number }, target: { lat: number; lng: number }) => number,
): T | undefined {
  if (restaurants.length === 0) return undefined;

  let best: T | undefined;
  let bestScore = -Infinity;
  for (const restaurant of restaurants) {
    const distance = location && restaurant.lat != null && restaurant.lng != null
      ? distanceOf(location, { lat: restaurant.lat, lng: restaurant.lng })
      : null;
    const score = featuredScore(restaurant, distance);
    if (
      score > bestScore
      || (score === bestScore && best != null && restaurant.totalReviews > best.totalReviews)
    ) {
      best = restaurant;
      bestScore = score;
    }
  }
  return best;
}

/** Labels for the boolean flags a restaurant sets in menu_items.dietary_info. */
export const DIETARY_LABELS: Record<string, string> = {
  vegetarian: 'Vegetariano',
  vegan: 'Vegano',
  gluten_free: 'Sem Glúten',
  lactose_free: 'Sem Lactose',
  dairy_free: 'Sem Lactose',
  nut_free: 'Sem Nozes',
  spicy: 'Picante',
  low_carb: 'Low Carb',
  organic: 'Orgânico',
};

export function dietaryTags(dietaryInfo: Record<string, boolean>): string[] {
  return Object.entries(dietaryInfo)
    .filter(([, value]) => value)
    .map(([key]) => DIETARY_LABELS[key] ?? key);
}

export function formatPrepTime(minutes: number | null): string | null {
  if (minutes == null || minutes <= 0) return null;
  return `${minutes}min`;
}

/**
 * Call-team reasons for the fine_dining "Chamar Equipe" screen. `callType`
 * maps to service_calls.call_type via customer_call_waiter's p_call_type.
 */
export const CALL_TEAM_REASONS = [
  { callType: 'waiter', icon: 'hand-left-outline', title: 'Chamar Garçom', subtitle: 'Dúvidas sobre pratos, pedidos especiais', tint: '#FFF0EA', iconColor: '#EA580C' },
  { callType: 'sommelier', icon: 'wine-outline', title: 'Chamar Sommelier', subtitle: 'Harmonização de vinhos e drinks', tint: '#ECFDF5', iconColor: '#16A34A' },
  { callType: 'help', icon: 'help-circle-outline', title: 'Preciso de Ajuda', subtitle: 'Acessibilidade, limpeza, outros', tint: '#F1F5F9', iconColor: '#64748B' },
] as const;

/**
 * Rule-based wine/drink pairing suggestion — keyword matching against the
 * item's name/description, not a real model call. Used by the "Harmonização"
 * screen reachable from the fine_dining menu until a real recommendation
 * service exists.
 */
const PAIRING_RULES: { keywords: string[]; suggestion: string }[] = [
  { keywords: ['atum', 'salmão', 'peixe', 'ceviche', 'ostra', 'camarão', 'polvo', 'sushi', 'sashimi'], suggestion: 'Vinho branco seco ou espumante brut — realça o frescor dos frutos do mar.' },
  { keywords: ['carne', 'wagyu', 'costela', 'picanha', 'cordeiro', 'filé', 'burrata'], suggestion: 'Tinto encorpado (Malbec ou Cabernet Sauvignon) — combina com a intensidade da carne.' },
  { keywords: ['massa', 'risoto', 'queijo', 'trufa'], suggestion: 'Branco encorpado ou tinto leve, como um Pinot Noir.' },
  { keywords: ['sobremesa', 'chocolate', 'doce', 'sorvete'], suggestion: 'Vinho de sobremesa (Late Harvest ou Porto) ou espumante moscatel.' },
  { keywords: ['vegetal', 'salada', 'legume'], suggestion: 'Branco leve e ácido, como Sauvignon Blanc.' },
];
const DEFAULT_PAIRING = 'Espumante brut — combina com praticamente qualquer prato do menu.';

export function suggestPairing(itemName: string, itemDescription: string | null): string {
  const haystack = `${itemName} ${itemDescription ?? ''}`.toLowerCase();
  const match = PAIRING_RULES.find((rule) => rule.keywords.some((word) => haystack.includes(word)));
  return match?.suggestion ?? DEFAULT_PAIRING;
}
