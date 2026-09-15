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

export function formatPriceLevel(averageTicket: number | null): string | null {
  if (averageTicket == null || averageTicket <= 0) return null;
  if (averageTicket <= 50) return '$';
  if (averageTicket <= 100) return '$$';
  if (averageTicket <= 200) return '$$$';
  return '$$$$';
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
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
