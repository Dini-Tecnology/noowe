export type MenuItemSummary = {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl?: string;
  isAvailable: boolean;
};

type RawMenuItem = {
  id: string;
  name: string;
  description?: string | null;
  price?: number | string | null;
  image_url?: string | null;
  is_available?: boolean;
};

type RawMenuRow = RawMenuItem & { items?: RawMenuItem[] };

function toPrice(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function mapMenuItemSummary(raw: RawMenuItem): MenuItemSummary {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description || '',
    price: toPrice(raw.price),
    imageUrl: raw.image_url ?? undefined,
    isAvailable: raw.is_available !== false,
  };
}

/** `restaurant_get_menu` devolve categorias com `items` aninhados; a lista de itens é a concatenação deles. */
export function flattenMenuRows(rows: unknown): MenuItemSummary[] {
  const list = Array.isArray(rows) ? (rows as RawMenuRow[]) : [];
  return list.flatMap((row) => (Array.isArray(row.items) ? row.items : [row])).map(mapMenuItemSummary);
}
