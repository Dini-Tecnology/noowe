/**
 * Entrada de valores em reais digitados "da direita para a esquerda" (5 → 0,05; 5000 → 50,00),
 * sempre em centavos inteiros: nenhum `float` toca o dinheiro (invariante 1).
 *
 * @module shared/utils/money-input
 */

/** R$ 9.999.999,99 — cabe com folga em bigint e é mais do que qualquer preço médio real. */
const MAX_DIGITS = 9;

/** Só os dígitos digitados, sem zeros à esquerda e no limite de tamanho. */
function centsDigits(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^0+/, '').slice(0, MAX_DIGITS);
}

/** "R$ 50,00" para um valor em centavos inteiros. */
export function formatCentsBRL(cents: number): string {
  const digits = String(Math.max(0, Math.trunc(cents))).padStart(3, '0');
  const reais = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${reais},${digits.slice(-2)}`;
}

/** Máscara do campo: devolve "" quando não há valor (campo vazio = não informar). */
export function maskCentsInput(raw: string): string {
  const digits = centsDigits(raw);
  return digits ? formatCentsBRL(Number(digits)) : '';
}

/** Centavos inteiros do que foi digitado; `null` quando vazio ou zero. */
export function parseCentsInput(masked: string): number | null {
  const digits = centsDigits(masked);
  return digits ? Number(digits) : null;
}
