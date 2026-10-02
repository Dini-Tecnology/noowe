import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Código de retirada disponível offline (ADR-013): o cliente pode estar sem sinal
 * no balcão. Guarda só o que a tela de retirada precisa — nada de dados de pagamento.
 */
export type CachedPickup = {
  orderId: string;
  pickupCode: string;
  restaurantName: string;
  callName: string | null;
  pickupExpiresAt: string | null;
  fulfillmentStatus: string;
  savedAt: string;
};

const KEY = 'noowe:quick:pickup-codes:v1';
/** Pedidos terminais são descartados; o cache nunca cresce sem limite. */
const MAX_ENTRIES = 10;
const TERMINAL = ['picked_up', 'not_picked_up', 'cancelled', 'delivered'];

async function readAll(): Promise<CachedPickup[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(entries: CachedPickup[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // Sem armazenamento, a tela online continua funcionando.
  }
}

export async function savePickupForOffline(entry: Omit<CachedPickup, 'savedAt'>): Promise<void> {
  const others = (await readAll()).filter((item) => item.orderId !== entry.orderId);
  if (TERMINAL.includes(entry.fulfillmentStatus)) {
    await writeAll(others);
    return;
  }
  await writeAll([{ ...entry, savedAt: new Date().toISOString() }, ...others]);
}

export async function loadPickupFromCache(orderId: string): Promise<CachedPickup | null> {
  return (await readAll()).find((item) => item.orderId === orderId) ?? null;
}
