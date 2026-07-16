/**
 * Phone Validation & Formatting Utilities
 *
 * Centralized Brazilian phone number validation and formatting
 * used across both Client and Restaurant mobile apps.
 *
 * @module shared/utils/phone-validation
 */

/**
 * Validate a Brazilian phone number.
 *
 * Accepts raw digits or formatted strings (parentheses, dashes, spaces
 * are stripped before validation). Valid lengths are 10 (landline) and
 * 11 (mobile with 9th digit).
 *
 * @param phone - Phone number string (raw or formatted)
 * @returns true when the cleaned number has 10 or 11 digits
 */
export function validateBrazilianPhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10 && cleaned.length <= 11;
}

/**
 * Format a Brazilian phone number for display.
 *
 * - 11 digits (mobile):  (XX) XXXXX-XXXX
 * - 10 digits (landline): (XX) XXXX-XXXX
 * - Other lengths: returned as-is
 *
 * @param phone - Phone number string (raw or formatted)
 * @returns Formatted phone string
 */
export function formatBrazilianPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '').slice(0, 11);
  if (!cleaned) return '';
  if (cleaned.length < 3) return `(${cleaned}`;

  const areaCode = cleaned.slice(0, 2);
  const local = cleaned.slice(2);
  if (local.length <= 4) return `(${areaCode}) ${local}`;

  const prefixLength = cleaned.length === 11 ? 5 : 4;
  return `(${areaCode}) ${local.slice(0, prefixLength)}-${local.slice(prefixLength)}`;
}

export function formatBrazilianPostalCode(postalCode: string): string {
  const digits = postalCode.replace(/\D/g, '').slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

/**
 * Validate a phone number with country-code awareness.
 *
 * Currently supports:
 * - BR (+55): 10-11 digits
 * - US (+1):  10 digits
 * - Generic:  7-15 digits
 *
 * @param phone       - Phone number string (raw or formatted)
 * @param countryCode - Country dial code (e.g. "+55")
 */
export function validatePhone(phone: string, countryCode: string = '+55'): boolean {
  const cleaned = phone.replace(/\D/g, '');

  switch (countryCode) {
    case '+55': // Brazil
      return cleaned.length >= 10 && cleaned.length <= 11;
    case '+1': // US/Canada
      return cleaned.length === 10;
    default:
      return cleaned.length >= 7 && cleaned.length <= 15;
  }
}
