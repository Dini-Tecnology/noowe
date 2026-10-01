export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'elo' | 'hipercard' | 'diners' | 'unknown';

export const onlyDigits = (value: string) => value.replace(/\D/g, '');

const ELO_PREFIXES = /^(4011|4312|4389|4514|4573|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/;

export function detectCardBrand(number: string): CardBrand {
  const digits = onlyDigits(number);
  if (ELO_PREFIXES.test(digits)) return 'elo';
  if (/^(606282|3841)/.test(digits)) return 'hipercard';
  if (/^3[47]/.test(digits)) return 'amex';
  if (/^3(0[0-5]|[68])/.test(digits)) return 'diners';
  if (/^4/.test(digits)) return 'visa';
  if (/^(5[1-5]|2(2[2-9]|[3-6]|7[01]|720))/.test(digits)) return 'mastercard';
  return 'unknown';
}

export function isValidLuhn(number: string): boolean {
  const digits = onlyDigits(number);
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i]);
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

export function formatCardNumber(value: string): string {
  const digits = onlyDigits(value).slice(0, 19);
  const brand = detectCardBrand(digits);
  if (brand === 'amex') {
    return [digits.slice(0, 4), digits.slice(4, 10), digits.slice(10, 15)].filter(Boolean).join(' ');
  }
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

export function formatExpiry(value: string): string {
  const digits = onlyDigits(value).slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

export function parseExpiry(value: string): { month: number; year: number } | null {
  const match = /^(\d{2})\/(\d{2})$/.exec(value);
  if (!match) return null;
  const month = Number(match[1]);
  if (month < 1 || month > 12) return null;
  return { month, year: 2000 + Number(match[2]) };
}

export function isExpired({ month, year }: { month: number; year: number }, now = new Date()): boolean {
  return new Date(year, month, 1).getTime() <= now.getTime();
}
