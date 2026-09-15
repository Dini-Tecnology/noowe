/** Formats a free-text price range into Brazilian currency, e.g. "40-120" → "R$ 40 – R$ 120". */

function formatBrl(amount: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(amount);
}

function parseAmounts(raw: string): number[] {
  const normalized = raw
    .replace(/\$+/g, '')
    .replace(/r\$/gi, '')
    .replace(/a/gi, '-')
    .replace(/–|—/g, '-');
  const chunks = normalized.split('-').map((part) => part.replace(/\D/g, '')).filter(Boolean);
  return chunks.map((digits) => Number(digits)).filter((n) => Number.isFinite(n) && n > 0);
}

export function maskPriceRange(raw: string): string {
  const amounts = parseAmounts(raw);
  if (amounts.length === 0) return '';
  if (amounts.length === 1) return formatBrl(amounts[0]);
  const [min, max] = amounts[0] <= amounts[1] ? [amounts[0], amounts[1]] : [amounts[1], amounts[0]];
  return `${formatBrl(min)} – ${formatBrl(max)}`;
}

export function isLegacyDollarPriceRange(value: string | null | undefined): boolean {
  return Boolean(value && /^\$+$/.test(value.trim()));
}

export function displayPriceRange(value: string | null | undefined): string {
  if (!value?.trim() || isLegacyDollarPriceRange(value)) return '—';
  if (/r\$/i.test(value)) return value;
  return maskPriceRange(value) || value;
}
