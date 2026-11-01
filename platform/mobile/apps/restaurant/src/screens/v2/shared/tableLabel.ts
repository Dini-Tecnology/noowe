/**
 * Rótulo de mesa com um único prefixo. `tables.table_number` é texto livre ("6", "Mesa 6",
 * "Varanda 2"), então concatenar "Mesa " à mão produzia "Mesa Mesa 6".
 */
export function formatTableLabel(value: string | number | null | undefined): string {
  const text = String(value ?? '').trim();
  if (!text) return 'Mesa';
  const withPrefix = /^mesa(\s|$)/i.exec(text);
  if (withPrefix) return `Mesa${text.slice(4)}`.trim();
  return `Mesa ${text}`;
}
