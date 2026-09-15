/**
 * Quick Service — discovery filter vocabulary for the cuisine chips
 * (Burgers, Pizza, Açaí, Saudável). Stored in `restaurants.cuisine_types`
 * (jsonb array), separate from the `service_config.amenities` array casual
 * and fine dining use. Must stay in sync with the client's
 * `QUICK_SERVICE_FILTERS` (apps/client/src/screens/production/quick-service-ui.ts),
 * which reads these same `cuisine` values plus the unrelated
 * `skip_the_line` filter (a boolean flag, not a cuisine tag).
 */

export const QUICK_SERVICE_CUISINE_TAGS = ['burgers', 'pizza', 'acai', 'saudavel'] as const;

export type QuickServiceCuisineTag = (typeof QUICK_SERVICE_CUISINE_TAGS)[number];

export interface QuickServiceCuisinePresentation {
  label: string;
  /** Ionicons name (customer app). */
  icon: string;
}

export const QUICK_SERVICE_CUISINE_PRESENTATION: Record<QuickServiceCuisineTag, QuickServiceCuisinePresentation> = {
  burgers: { label: 'Burgers', icon: 'fast-food-outline' },
  pizza: { label: 'Pizza', icon: 'pizza-outline' },
  acai: { label: 'Açaí', icon: 'ice-cream-outline' },
  saudavel: { label: 'Saudável', icon: 'leaf-outline' },
};

export function isQuickServiceCuisineTag(value: unknown): value is QuickServiceCuisineTag {
  return typeof value === 'string' && (QUICK_SERVICE_CUISINE_TAGS as readonly string[]).includes(value);
}

/** Reads which of the quick service cuisine tags a restaurant has set. */
export function parseQuickServiceCuisineTags(cuisineTypes: unknown): QuickServiceCuisineTag[] {
  const list = Array.isArray(cuisineTypes) ? cuisineTypes : [];
  const result: QuickServiceCuisineTag[] = [];
  for (const entry of list) {
    if (isQuickServiceCuisineTag(entry) && !result.includes(entry)) result.push(entry);
  }
  return result;
}

export function quickServiceCuisineLabel(key: string): string {
  return QUICK_SERVICE_CUISINE_PRESENTATION[key as QuickServiceCuisineTag]?.label ?? key;
}
