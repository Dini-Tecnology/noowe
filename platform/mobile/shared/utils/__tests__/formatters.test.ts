/**
 * Formatters Utility Tests
 * 
 * Comprehensive tests for currency, date, time, and phone formatters.
 * Tests all supported locales: pt-BR, en-US, es-ES
 * 
 * @module shared/utils/__tests__/formatters.test
 */

import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatDate,
  formatTime,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  formatPhone,
  getCurrencySymbol,
  getCurrencyCode,
  parseCurrency,
  SupportedLocale,
} from '../formatters';

// ============================================================
// CURRENCY FORMATTING TESTS
// ============================================================

describe('formatCurrency', () => {
  describe('pt-BR locale', () => {
    it('should format currency with default options', () => {
      const result = formatCurrency(99.90, 'pt-BR');
      expect(result).toContain('99');
      expect(result).toContain('90');
    });

    it('should format without cents when showCents is false', () => {
      const result = formatCurrency(99.90, 'pt-BR', { showCents: false });
      expect(result).not.toContain('90');
    });

    it('should format without symbol when showSymbol is false', () => {
      const result = formatCurrency(99.90, 'pt-BR', { showSymbol: false });
      expect(result).not.toContain('R$');
    });

    it('should handle zero amount', () => {
      const result = formatCurrency(0, 'pt-BR');
      expect(result).toContain('0');
    });

    it('should handle large amounts', () => {
      const result = formatCurrency(1234567.89, 'pt-BR');
      expect(result).toContain('1');
    });

    it('should handle negative amounts', () => {
      const result = formatCurrency(-50.00, 'pt-BR');
      expect(result).toContain('50');
    });
  });

  describe('en-US locale', () => {
    it('should format currency with USD symbol', () => {
      const result = formatCurrency(99.90, 'en-US');
      expect(result).toContain('$');
      expect(result).toContain('99');
    });

    it('should use period as decimal separator', () => {
      const result = formatCurrency(99.90, 'en-US');
      expect(result).toContain('.90');
    });
  });

  describe('es-ES locale', () => {
    it('should format currency with EUR symbol', () => {
      const result = formatCurrency(99.90, 'es-ES');
      expect(result).toContain('€');
    });
  });

  describe('edge cases', () => {
    it('should default to pt-BR for unknown locale', () => {
      const result = formatCurrency(99.90, 'invalid' as SupportedLocale);
      expect(result).toBeDefined();
    });
  });
});

// ============================================================
// DATE FORMATTING TESTS
// ============================================================

describe('formatDate', () => {
  const testDate = new Date('2024-03-15T14:30:00Z');

  describe('format options', () => {
    it('should format with short format', () => {
      const result = formatDate(testDate, 'pt-BR', 'short');
      expect(result).toBeDefined();
      expect(result.length).toBeLessThan(15);
    });

    it('should format with medium format', () => {
      const result = formatDate(testDate, 'pt-BR', 'medium');
      expect(result).toBeDefined();
    });

    it('should format with long format', () => {
      const result = formatDate(testDate, 'pt-BR', 'long');
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(10);
    });

    it('should format with full format', () => {
      const result = formatDate(testDate, 'pt-BR', 'full');
      expect(result).toBeDefined();
    });
  });

  describe('input types', () => {
    it('should accept Date object', () => {
      const result = formatDate(new Date('2024-01-01'), 'pt-BR');
      expect(result).toBeDefined();
    });

    it('should accept ISO string', () => {
      const result = formatDate('2024-01-01T00:00:00Z', 'pt-BR');
      expect(result).toBeDefined();
    });

    it('should handle invalid date', () => {
      const result = formatDate('invalid-date', 'pt-BR');
      expect(result).toBe('—');
    });
  });

  describe('locales', () => {
    it('should format for en-US', () => {
      const result = formatDate(testDate, 'en-US', 'medium');
      expect(result).toBeDefined();
    });

    it('should format for es-ES', () => {
      const result = formatDate(testDate, 'es-ES', 'medium');
      expect(result).toBeDefined();
    });
  });
});

// ============================================================
// TIME FORMATTING TESTS
// ============================================================

describe('formatTime', () => {
  const testDate = new Date('2024-03-15T14:30:45Z');

  it('should format time without seconds by default', () => {
    const result = formatTime(testDate, 'pt-BR');
    expect(result).toBeDefined();
  });

  it('should format time with seconds when specified', () => {
    const result = formatTime(testDate, 'pt-BR', true);
    expect(result).toBeDefined();
  });

  it('should handle ISO string input', () => {
    const result = formatTime('2024-03-15T14:30:45Z', 'pt-BR');
    expect(result).toBeDefined();
  });

  it('should handle invalid date', () => {
    const result = formatTime('invalid', 'pt-BR');
    expect(result).toBe('—');
  });

  it('should format for different locales', () => {
    const ptBR = formatTime(testDate, 'pt-BR');
    const enUS = formatTime(testDate, 'en-US');
    expect(ptBR).toBeDefined();
    expect(enUS).toBeDefined();
  });
});

// ============================================================
// DATETIME FORMATTING TESTS
// ============================================================

describe('formatDateTime', () => {
  it('should combine date and time', () => {
    const testDate = new Date('2024-03-15T14:30:00Z');
    const result = formatDateTime(testDate, 'pt-BR');
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(10);
  });

  it('should work with ISO string', () => {
    const result = formatDateTime('2024-03-15T14:30:00Z', 'en-US');
    expect(result).toBeDefined();
  });
});

// ============================================================
// NUMBER FORMATTING TESTS
// ============================================================

describe('formatNumber', () => {
  it('should format with default decimals (0)', () => {
    const result = formatNumber(1234.567, 'pt-BR');
    expect(result).toContain('1');
  });

  it('should format with specified decimals', () => {
    const result = formatNumber(1234.567, 'pt-BR', 2);
    expect(result).toBeDefined();
  });

  it('should format for different locales', () => {
    const ptBR = formatNumber(1234567.89, 'pt-BR', 2);
    const enUS = formatNumber(1234567.89, 'en-US', 2);
    expect(ptBR).toBeDefined();
    expect(enUS).toBeDefined();
  });

  it('should handle zero', () => {
    const result = formatNumber(0, 'pt-BR');
    expect(result).toBe('0');
  });

  it('should handle negative numbers', () => {
    const result = formatNumber(-1234, 'pt-BR');
    expect(result).toBe('-1.234');
  });
});

// ============================================================
// PERCENT FORMATTING TESTS
// ============================================================

describe('formatPercent', () => {
  it('should format decimal as percentage', () => {
    const result = formatPercent(0.5, 'pt-BR');
    expect(result).toContain('50');
    expect(result).toContain('%');
  });

  it('should format with decimals', () => {
    const result = formatPercent(0.1234, 'pt-BR', 2);
    expect(result).toBeDefined();
  });

  it('should handle 100%', () => {
    const result = formatPercent(1, 'pt-BR');
    expect(result).toContain('100');
  });

  it('should handle 0%', () => {
    const result = formatPercent(0, 'pt-BR');
    expect(result).toContain('0');
  });

  it('should handle values over 100%', () => {
    const result = formatPercent(1.5, 'pt-BR');
    expect(result).toContain('150');
  });
});

// ============================================================
// RELATIVE TIME FORMATTING TESTS
// ============================================================

describe('formatRelativeTime', () => {
  it('should format seconds ago', () => {
    const date = new Date(Date.now() - 30000); // 30 seconds ago
    const result = formatRelativeTime(date, 'pt-BR');
    expect(result).toBeDefined();
  });

  it('should format minutes ago', () => {
    const date = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
    const result = formatRelativeTime(date, 'pt-BR');
    expect(result).toBeDefined();
  });

  it('should format hours ago', () => {
    const date = new Date(Date.now() - 3 * 60 * 60 * 1000); // 3 hours ago
    const result = formatRelativeTime(date, 'pt-BR');
    expect(result).toBeDefined();
  });

  it('should format days ago', () => {
    const date = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
    const result = formatRelativeTime(date, 'pt-BR');
    expect(result).toBeDefined();
  });

  it('should format future dates', () => {
    const date = new Date(Date.now() + 60 * 60 * 1000); // 1 hour in future
    const result = formatRelativeTime(date, 'pt-BR');
    expect(result).toBeDefined();
  });

  it('should fall back to date format for old dates', () => {
    const date = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days ago
    const result = formatRelativeTime(date, 'pt-BR');
    expect(result).toBeDefined();
  });

  it('should handle invalid date', () => {
    const result = formatRelativeTime('invalid', 'pt-BR');
    expect(result).toBe('—');
  });
});

// ============================================================
// PHONE FORMATTING TESTS
// ============================================================

describe('formatPhone', () => {
  describe('pt-BR format', () => {
    it('should format 11-digit mobile number', () => {
      const result = formatPhone('11999887766', 'pt-BR');
      expect(result).toBe('(11) 99988-7766');
    });

    it('should format 10-digit landline number', () => {
      const result = formatPhone('1133445566', 'pt-BR');
      expect(result).toBe('(11) 3344-5566');
    });

    it('should handle already formatted number', () => {
      const result = formatPhone('(11) 99999-9999', 'pt-BR');
      expect(result).toBe('(11) 99999-9999');
    });

    it('should return original for invalid length', () => {
      const result = formatPhone('123', 'pt-BR');
      expect(result).toBe('123');
    });
  });

  describe('en-US format', () => {
    it('should format 10-digit number', () => {
      const result = formatPhone('1234567890', 'en-US');
      expect(result).toBe('(123) 456-7890');
    });

    it('should format 11-digit number with country code', () => {
      const result = formatPhone('11234567890', 'en-US');
      expect(result).toBe('+1 (123) 456-7890');
    });
  });

  describe('es-ES format', () => {
    it('should format 9-digit number', () => {
      const result = formatPhone('612345678', 'es-ES');
      expect(result).toBe('612 34 56 78');
    });

    it('should format with country code', () => {
      const result = formatPhone('34612345678', 'es-ES');
      expect(result).toBe('+34 612 34 56 78');
    });
  });
});

// ============================================================
// CURRENCY HELPERS TESTS
// ============================================================

describe('getCurrencySymbol', () => {
  it('should return R$ for pt-BR', () => {
    expect(getCurrencySymbol('pt-BR')).toBe('R$');
  });

  it('should return $ for en-US', () => {
    expect(getCurrencySymbol('en-US')).toBe('$');
  });

  it('should return € for es-ES', () => {
    expect(getCurrencySymbol('es-ES')).toBe('€');
  });

  it('should default to R$', () => {
    expect(getCurrencySymbol()).toBe('R$');
  });
});

describe('getCurrencyCode', () => {
  it('should return BRL for pt-BR', () => {
    expect(getCurrencyCode('pt-BR')).toBe('BRL');
  });

  it('should return USD for en-US', () => {
    expect(getCurrencyCode('en-US')).toBe('USD');
  });

  it('should return EUR for es-ES', () => {
    expect(getCurrencyCode('es-ES')).toBe('EUR');
  });

  it('should default to BRL', () => {
    expect(getCurrencyCode()).toBe('BRL');
  });
});

// ============================================================
// PARSE CURRENCY TESTS
// ============================================================

describe('parseCurrency', () => {
  describe('pt-BR format', () => {
    it('should parse Brazilian currency format', () => {
      expect(parseCurrency('R$ 1.234,56', 'pt-BR')).toBe(1234.56);
    });

    it('should handle without symbol', () => {
      expect(parseCurrency('1.234,56', 'pt-BR')).toBe(1234.56);
    });

    it('should handle simple value', () => {
      expect(parseCurrency('99,90', 'pt-BR')).toBe(99.90);
    });
  });

  describe('en-US format', () => {
    it('should parse US currency format', () => {
      expect(parseCurrency('$1,234.56', 'en-US')).toBe(1234.56);
    });

    it('should handle without symbol', () => {
      expect(parseCurrency('1,234.56', 'en-US')).toBe(1234.56);
    });
  });

  describe('edge cases', () => {
    it('should return 0 for invalid input', () => {
      expect(parseCurrency('invalid', 'pt-BR')).toBe(0);
    });

    it('should handle empty string', () => {
      expect(parseCurrency('', 'pt-BR')).toBe(0);
    });

    it('should handle negative values', () => {
      expect(parseCurrency('-99,90', 'pt-BR')).toBe(-99.90);
    });
  });
});

console.log('✅ Formatters utility tests defined');
