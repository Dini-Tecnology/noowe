/**
 * CNPJ numérico e alfanumérico (Receita Federal, a partir de julho/2026).
 *
 * Formato: 14 posições. As 12 primeiras são letras maiúsculas ou dígitos
 * (raiz + ordem); as 2 últimas são dígitos verificadores, sempre numéricos.
 * Máscara de exibição: `AA.AAA.AAA/AAAA-DD`. O cálculo é o módulo 11 de sempre,
 * com o valor de cada caractere = código ASCII − 48 ('0'–'9' → 0–9, 'A' → 17 …
 * 'Z' → 42), então todo CNPJ numérico antigo continua válido.
 *
 * @module shared/utils/cnpj
 */

const BASE_LENGTH = 12;
const CNPJ_LENGTH = 14;
const FIRST_DIGIT_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const SECOND_DIGIT_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** Tira máscara e espaços, coloca em maiúsculas e descarta o que não é [0-9A-Z]. */
export function normalizeCnpj(raw: string): string {
  return raw.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

function checkDigit(chars: string, weights: number[]): number {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) sum += (chars.charCodeAt(i) - 48) * weights[i];
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

/** Os 2 dígitos verificadores de uma raiz de 12 posições, ou null se a raiz for inválida. */
export function computeCnpjCheckDigits(base: string): string | null {
  const normalized = normalizeCnpj(base);
  if (normalized.length !== BASE_LENGTH) return null;
  const first = checkDigit(normalized, FIRST_DIGIT_WEIGHTS);
  const second = checkDigit(normalized + first, SECOND_DIGIT_WEIGHTS);
  return `${first}${second}`;
}

export function isValidCnpj(raw: string): boolean {
  const cnpj = normalizeCnpj(raw);
  if (cnpj.length !== CNPJ_LENGTH) return false;
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj)) return false;
  // Sequências de um caractere só (00000000000000, AAAAAAAAAAAAAA…) passam no módulo 11.
  if (/^(.)\1+$/.test(cnpj)) return false;
  return computeCnpjCheckDigits(cnpj.slice(0, BASE_LENGTH)) === cnpj.slice(BASE_LENGTH);
}

/**
 * Máscara de digitação `AA.AAA.AAA/AAAA-DD`. Só aceita [0-9A-Z] (minúsculas viram
 * maiúsculas) e as duas últimas posições só aceitam dígitos.
 */
export function maskCnpjInput(raw: string): string {
  let chars = '';
  for (const char of normalizeCnpj(raw)) {
    if (chars.length >= CNPJ_LENGTH) break;
    if (chars.length >= BASE_LENGTH && !/\d/.test(char)) continue;
    chars += char;
  }
  const parts = [chars.slice(0, 2), chars.slice(2, 5), chars.slice(5, 8), chars.slice(8, 12), chars.slice(12, 14)];
  let masked = parts[0];
  if (parts[1]) masked += `.${parts[1]}`;
  if (parts[2]) masked += `.${parts[2]}`;
  if (parts[3]) masked += `/${parts[3]}`;
  if (parts[4]) masked += `-${parts[4]}`;
  return masked;
}

/** Mensagem em português para o campo, ou null quando vazio/válido. Vazio é permitido (campo opcional). */
export function cnpjErrorMessage(raw: string): string | null {
  if (normalizeCnpj(raw).length === 0) return null;
  return isValidCnpj(raw) ? null : 'CNPJ inválido. Use 14 caracteres (letras e números) no padrão da Receita Federal.';
}
