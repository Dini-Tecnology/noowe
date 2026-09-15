/**
 * Fine Dining — discovery filter vocabulary for the "estilo do restaurante"
 * chips (Casual, Bar, Café). Stored in the same `restaurants.service_config
 * .amenities` jsonb array used by casual dining (see ./casual-dining.ts);
 * the two vocabularies never collide because a restaurant only ever belongs
 * to one service type at a time.
 */

export const FINE_DINING_AMBIANCE = ['casual', 'bar', 'cafe'] as const;

export type FineDiningAmbiance = (typeof FINE_DINING_AMBIANCE)[number];

export interface FineDiningAmbiancePresentation {
  label: string;
  /** Ionicons name (customer app). */
  icon: string;
}

export const FINE_DINING_AMBIANCE_PRESENTATION: Record<FineDiningAmbiance, FineDiningAmbiancePresentation> = {
  casual: { label: 'Casual', icon: 'shirt-outline' },
  bar: { label: 'Bar', icon: 'wine-outline' },
  cafe: { label: 'Café', icon: 'cafe-outline' },
};

export function isFineDiningAmbiance(value: unknown): value is FineDiningAmbiance {
  return typeof value === 'string' && (FINE_DINING_AMBIANCE as readonly string[]).includes(value);
}

/** Reads which of the fine dining ambiance tags a restaurant has set. */
export function parseFineDiningAmbiance(serviceConfig: unknown): FineDiningAmbiance[] {
  const raw = (serviceConfig as { amenities?: unknown } | null)?.amenities;
  const list = Array.isArray(raw) ? raw : [];
  const result: FineDiningAmbiance[] = [];
  for (const entry of list) {
    if (isFineDiningAmbiance(entry) && !result.includes(entry)) result.push(entry);
  }
  return result;
}

export function ambianceLabel(key: string): string {
  return FINE_DINING_AMBIANCE_PRESENTATION[key as FineDiningAmbiance]?.label ?? key;
}
