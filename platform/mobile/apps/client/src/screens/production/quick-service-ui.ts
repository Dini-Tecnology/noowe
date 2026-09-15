import Ionicons from '@expo/vector-icons/Ionicons';

type IoniconName = keyof typeof Ionicons.glyphMap;

export type QuickServiceFilterKey = 'skip_the_line' | 'burgers' | 'pizza' | 'acai' | 'saudavel';

/**
 * Sub-tag filters on the quick_service home tab. `skip_the_line` filters on
 * the restaurant's `skip_the_line_enabled` flag; the rest filter on
 * `cuisine_types`. Unlike casual/fine dining's multi-select amenity chips,
 * these behave like a single-select radio row — the mockup only ever shows
 * one chip highlighted at a time.
 */
export const QUICK_SERVICE_FILTERS: { key: QuickServiceFilterKey; label: string; icon: IoniconName; cuisine?: string }[] = [
  { key: 'skip_the_line', label: 'Skip the Line', icon: 'flash' },
  { key: 'burgers', label: 'Burgers', icon: 'fast-food-outline', cuisine: 'Burgers' },
  { key: 'pizza', label: 'Pizza', icon: 'pizza-outline', cuisine: 'Pizza' },
  { key: 'acai', label: 'Açaí', icon: 'ice-cream-outline', cuisine: 'Açaí' },
  { key: 'saudavel', label: 'Saudável', icon: 'leaf-outline', cuisine: 'Saudável' },
];

/** The 3 steps shown on the restaurant page's "Como funciona o Skip the Line" card. */
export const SKIP_THE_LINE_STEPS: { title: string; icon: IoniconName }[] = [
  { title: 'Monte seu pedido pelo app', icon: 'restaurant-outline' },
  { title: 'Pague na hora — sem fila no caixa', icon: 'card-outline' },
  { title: 'Receba o código e retire no balcão express', icon: 'qr-code-outline' },
];
