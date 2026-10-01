import { detectCardBrand, formatCardNumber, formatExpiry, isExpired, isValidLuhn, parseExpiry } from '../utils/card';

test('validates card numbers with Luhn and detects the brand', () => {
  expect(isValidLuhn('4111 1111 1111 1111')).toBe(true);
  expect(isValidLuhn('4111 1111 1111 1112')).toBe(false);
  expect(detectCardBrand('4111111111111111')).toBe('visa');
  expect(detectCardBrand('5555555555554444')).toBe('mastercard');
  expect(detectCardBrand('378282246310005')).toBe('amex');
  expect(detectCardBrand('6362970000457013')).toBe('elo');
});

test('formats number and expiry as the user types', () => {
  expect(formatCardNumber('4111111111111111')).toBe('4111 1111 1111 1111');
  expect(formatCardNumber('378282246310005')).toBe('3782 822463 10005');
  expect(formatExpiry('1227')).toBe('12/27');
});

test('parses and expires card validity', () => {
  expect(parseExpiry('13/27')).toBeNull();
  const parsed = parseExpiry('01/26')!;
  expect(isExpired(parsed, new Date(2026, 1, 1))).toBe(true);
  expect(isExpired(parsed, new Date(2026, 0, 15))).toBe(false);
});
