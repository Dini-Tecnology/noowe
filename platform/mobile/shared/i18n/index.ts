import { ptBR, TranslationKeys } from './pt-BR';
import { enUS } from './en-US';
import { esES } from './es-ES';
import { ptBRSupplement } from './pt-BR-supplement';
import { enUSSupplement } from './en-US-supplement';
import { esESSupplement } from './es-ES-supplement';

function mergeTranslations<T extends Record<string, unknown>>(
  base: T,
  extra: Record<string, unknown>
): T {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    const baseVal = out[key];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      baseVal &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal)
    ) {
      out[key] = mergeTranslations(baseVal as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

// Supported languages
export type SupportedLanguage = 'pt-BR' | 'en-US' | 'es-ES';

// Default language
const defaultLanguage: SupportedLanguage = 'pt-BR';

// Available translations
const translations: Record<SupportedLanguage, TranslationKeys> = {
  'pt-BR': mergeTranslations(ptBR as unknown as Record<string, unknown>, ptBRSupplement as unknown as Record<string, unknown>) as TranslationKeys,
  'en-US': mergeTranslations(enUS as unknown as Record<string, unknown>, enUSSupplement as unknown as Record<string, unknown>) as TranslationKeys,
  'es-ES': mergeTranslations(esES as unknown as Record<string, unknown>, esESSupplement as unknown as Record<string, unknown>) as TranslationKeys,
};

// Language display names
export const languageNames: Record<SupportedLanguage, string> = {
  'pt-BR': 'Português',
  'en-US': 'English',
  'es-ES': 'Español',
};

// Language flags (emoji)
export const languageFlags: Record<SupportedLanguage, string> = {
  'pt-BR': '🇧🇷',
  'en-US': '🇺🇸',
  'es-ES': '🇪🇸',
};

// Current language (can be changed dynamically)
let currentLanguage: SupportedLanguage = defaultLanguage;

/**
 * Set the current language
 */
export function setLanguage(lang: SupportedLanguage | string): void {
  if (translations[lang as SupportedLanguage]) {
    currentLanguage = lang as SupportedLanguage;
  } else {
    console.warn(`Language ${lang} not available, using ${defaultLanguage}`);
    currentLanguage = defaultLanguage;
  }
}

/**
 * Get the current language
 */
export function getLanguage(): SupportedLanguage {
  return currentLanguage;
}

/**
 * Get all supported languages
 */
export function getSupportedLanguages(): SupportedLanguage[] {
  return Object.keys(translations) as SupportedLanguage[];
}

/**
 * Get language info for language picker
 */
export function getLanguageOptions(): Array<{
  code: SupportedLanguage;
  name: string;
  flag: string;
}> {
  return getSupportedLanguages().map((code) => ({
    code,
    name: languageNames[code],
    flag: languageFlags[code],
  }));
}

/**
 * Get translation by key path (e.g., 'common.loading')
 */
export function t(keyPath: string, params?: Record<string, string | number>): string {
  const keys = keyPath.split('.');
  let value: any = translations[currentLanguage];

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      console.warn(`Translation key not found: ${keyPath}`);
      return keyPath;
    }
  }

  if (typeof value !== 'string') {
    console.warn(`Translation value is not a string: ${keyPath}`);
    return keyPath;
  }

  // Replace parameters like {{name}} with actual values
  if (params) {
    return value.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return params[key]?.toString() ?? `{{${key}}}`;
    });
  }

  return value;
}

/**
 * Hook-friendly translation function that returns the current translations object
 */
export function useTranslations(): TranslationKeys {
  return translations[currentLanguage];
}

/**
 * Get nested translation object (e.g., 'orders.status')
 */
export function getTranslationSection<T = Record<string, string>>(section: string): T {
  const keys = section.split('.');
  let value: any = translations[currentLanguage];

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      console.warn(`Translation section not found: ${section}`);
      return {} as T;
    }
  }

  return value as T;
}

/**
 * Translate with fallback
 * If key not found in current language, try to find in fallback language
 */
export function tWithFallback(
  keyPath: string,
  params?: Record<string, string | number>,
  fallbackLang: SupportedLanguage = 'en-US',
): string {
  const keys = keyPath.split('.');
  let value: any = translations[currentLanguage];

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      // Try fallback language
      let fallbackValue: any = translations[fallbackLang];
      for (const fbKey of keys) {
        if (fallbackValue && typeof fallbackValue === 'object' && fbKey in fallbackValue) {
          fallbackValue = fallbackValue[fbKey];
        } else {
          return keyPath;
        }
      }
      value = fallbackValue;
      break;
    }
  }

  if (typeof value !== 'string') {
    return keyPath;
  }

  if (params) {
    return value.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return params[key]?.toString() ?? `{{${key}}}`;
    });
  }

  return value;
}

// Export types and translations
export { ptBR, enUS, esES };
export type { TranslationKeys };

// Default export
export default {
  t,
  tWithFallback,
  setLanguage,
  getLanguage,
  getSupportedLanguages,
  getLanguageOptions,
  useTranslations,
  getTranslationSection,
};
