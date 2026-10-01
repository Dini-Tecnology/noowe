import { AccessibilityInfo, Platform } from 'react-native';
import { componentSizes } from '../config/theme';

/**
 * Accessibility utilities for Project Okinawa
 * Ensures WCAG compliance and better UX for users with disabilities
 */

// ============================================
// ACCESSIBILITY PROPS HELPERS
// ============================================

export interface AccessibilityProps {
  accessible?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: 'none' | 'button' | 'link' | 'search' | 'image' | 'keyboardkey' | 'text' | 'adjustable' | 'imagebutton' | 'header' | 'summary' | 'alert' | 'checkbox' | 'combobox' | 'menu' | 'menubar' | 'menuitem' | 'progressbar' | 'radio' | 'radiogroup' | 'scrollbar' | 'spinbutton' | 'switch' | 'tab' | 'tablist' | 'timer' | 'toolbar';
  accessibilityState?: {
    disabled?: boolean;
    selected?: boolean;
    checked?: boolean | 'mixed';
    busy?: boolean;
    expanded?: boolean;
  };
  accessibilityValue?: {
    min?: number;
    max?: number;
    now?: number;
    text?: string;
  };
}

/**
 * Create accessibility props for a button
 */
export function buttonA11yProps(
  label: string,
  hint?: string,
  disabled?: boolean
): AccessibilityProps {
  return {
    accessible: true,
    accessibilityLabel: label,
    accessibilityHint: hint,
    accessibilityRole: 'button',
    accessibilityState: {
      disabled,
    },
  };
}

/**
 * Create accessibility props for a link
 */
export function linkA11yProps(label: string, hint?: string): AccessibilityProps {
  return {
    accessible: true,
    accessibilityLabel: label,
    accessibilityHint: hint || `Abre ${label}`,
    accessibilityRole: 'link',
  };
}

/**
 * Create accessibility props for an image
 */
export function imageA11yProps(description: string): AccessibilityProps {
  return {
    accessible: true,
    accessibilityLabel: description,
    accessibilityRole: 'image',
  };
}

/**
 * Create accessibility props for a header
 */
export function headerA11yProps(title: string): AccessibilityProps {
  return {
    accessible: true,
    accessibilityLabel: title,
    accessibilityRole: 'header',
  };
}

/**
 * Create accessibility props for a checkbox/toggle
 */
export function checkboxA11yProps(
  label: string,
  checked: boolean,
  disabled?: boolean
): AccessibilityProps {
  return {
    accessible: true,
    accessibilityLabel: label,
    accessibilityRole: 'checkbox',
    accessibilityState: {
      checked,
      disabled,
    },
  };
}

/**
 * Create accessibility props for a switch
 */
export function switchA11yProps(
  label: string,
  enabled: boolean,
  disabled?: boolean
): AccessibilityProps {
  return {
    accessible: true,
    accessibilityLabel: label,
    accessibilityHint: enabled ? 'Ativado. Toque duas vezes para desativar' : 'Desativado. Toque duas vezes para ativar',
    accessibilityRole: 'switch',
    accessibilityState: {
      checked: enabled,
      disabled,
    },
  };
}

/**
 * Create accessibility props for a text input
 */
export function inputA11yProps(
  label: string,
  hint?: string,
  error?: string
): AccessibilityProps {
  return {
    accessible: true,
    accessibilityLabel: error ? `${label}, Erro: ${error}` : label,
    accessibilityHint: hint || `Digite ${label.toLowerCase()}`,
  };
}

/**
 * Create accessibility props for a progress indicator
 */
export function progressA11yProps(
  label: string,
  current: number,
  max: number = 100
): AccessibilityProps {
  const percentage = Math.round((current / max) * 100);
  return {
    accessible: true,
    accessibilityLabel: `${label}: ${percentage}%`,
    accessibilityRole: 'progressbar',
    accessibilityValue: {
      min: 0,
      max,
      now: current,
      text: `${percentage}%`,
    },
  };
}

/**
 * Create accessibility props for a tab
 */
export function tabA11yProps(
  label: string,
  selected: boolean,
  index: number,
  total: number
): AccessibilityProps {
  return {
    accessible: true,
    accessibilityLabel: `${label}, aba ${index + 1} de ${total}`,
    accessibilityRole: 'tab',
    accessibilityState: {
      selected,
    },
  };
}

/**
 * Create accessibility props for a list item
 */
export function listItemA11yProps(
  label: string,
  hint?: string,
  position?: { index: number; total: number }
): AccessibilityProps {
  let fullLabel = label;
  if (position) {
    fullLabel = `${label}, item ${position.index + 1} de ${position.total}`;
  }

  return {
    accessible: true,
    accessibilityLabel: fullLabel,
    accessibilityHint: hint,
  };
}

/**
 * Create accessibility props for an alert
 */
export function alertA11yProps(message: string): AccessibilityProps {
  return {
    accessible: true,
    accessibilityLabel: message,
    accessibilityRole: 'alert',
  };
}

// ============================================
// SCREEN READER UTILITIES
// ============================================

/**
 * Announce a message to screen reader users
 */
export function announceForAccessibility(message: string): void {
  AccessibilityInfo.announceForAccessibility(message);
}

/**
 * Check if screen reader is enabled
 */
export async function isScreenReaderEnabled(): Promise<boolean> {
  return AccessibilityInfo.isScreenReaderEnabled();
}

/**
 * Check if reduce motion is enabled
 */
export async function isReduceMotionEnabled(): Promise<boolean> {
  return AccessibilityInfo.isReduceMotionEnabled();
}

/**
 * Add screen reader change listener
 */
export function addScreenReaderListener(
  callback: (isEnabled: boolean) => void
): { remove: () => void } {
  const subscription = AccessibilityInfo.addEventListener(
    'screenReaderChanged',
    callback
  );
  return {
    remove: () => subscription.remove(),
  };
}

// ============================================
// TOUCH TARGET UTILITIES
// ============================================

/**
 * Get minimum touch target size (44x44 for accessibility)
 */
export const MIN_TOUCH_TARGET = componentSizes.touchTarget.min;

/**
 * Ensure minimum touch target size
 */
export function ensureMinTouchTarget(size: number): number {
  return Math.max(size, MIN_TOUCH_TARGET);
}

/**
 * Get touch target style to ensure minimum size
 */
export function touchTargetStyle(
  width?: number,
  height?: number
): { minWidth: number; minHeight: number } {
  return {
    minWidth: width ? ensureMinTouchTarget(width) : MIN_TOUCH_TARGET,
    minHeight: height ? ensureMinTouchTarget(height) : MIN_TOUCH_TARGET,
  };
}

// ============================================
// SEMANTIC ELEMENT HELPERS
// ============================================

/**
 * Format currency for screen readers
 */
export function formatCurrencyForA11y(value: number, currency: string = 'BRL'): string {
  const formatted = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format(value);

  // Convert R$ 10,00 to "10 reais"
  const numericValue = value.toFixed(2).replace('.', ' reais e ').replace(/\.?0+$/, '');
  return numericValue.endsWith(' reais e ') ? numericValue.replace(' reais e ', ' reais') : numericValue + ' centavos';
}

/**
 * Format date for screen readers
 */
export function formatDateForA11y(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

/**
 * Format time for screen readers
 */
export function formatTimeForA11y(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  return `${hours} horas${minutes > 0 ? ` e ${minutes} minutos` : ''}`;
}

/**
 * Format rating for screen readers
 */
export function formatRatingForA11y(rating: number, maxRating: number = 5): string {
  return `Avaliação ${rating} de ${maxRating} estrelas`;
}

/**
 * Format quantity for screen readers
 */
export function formatQuantityForA11y(quantity: number, item: string): string {
  return quantity === 1 ? `1 ${item}` : `${quantity} ${item}s`;
}

// ============================================
// FOCUS MANAGEMENT
// ============================================

/**
 * Set focus to an element (for screen readers)
 */
export function setAccessibilityFocus(ref: any): void {
  if (ref?.current && Platform.OS === 'ios') {
    AccessibilityInfo.setAccessibilityFocus(ref.current);
  }
}

// ============================================
// CONTRAST UTILITIES
// ============================================

/**
 * Check if color has sufficient contrast for WCAG AA
 * Returns true if contrast ratio is >= 4.5:1 for normal text
 */
export function hassufficientContrast(
  foreground: string,
  background: string
): boolean {
  const getLuminance = (hex: string): number => {
    const rgb = parseInt(hex.replace('#', ''), 16);
    const r = ((rgb >> 16) & 0xff) / 255;
    const g = ((rgb >> 8) & 0xff) / 255;
    const b = (rgb & 0xff) / 255;

    const toLinear = (c: number) =>
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  };

  const l1 = getLuminance(foreground);
  const l2 = getLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  const ratio = (lighter + 0.05) / (darker + 0.05);
  return ratio >= 4.5;
}

export default {
  buttonA11yProps,
  linkA11yProps,
  imageA11yProps,
  headerA11yProps,
  checkboxA11yProps,
  switchA11yProps,
  inputA11yProps,
  progressA11yProps,
  tabA11yProps,
  listItemA11yProps,
  alertA11yProps,
  announceForAccessibility,
  isScreenReaderEnabled,
  isReduceMotionEnabled,
  addScreenReaderListener,
  MIN_TOUCH_TARGET,
  ensureMinTouchTarget,
  touchTargetStyle,
  formatCurrencyForA11y,
  formatDateForA11y,
  formatTimeForA11y,
  formatRatingForA11y,
  formatQuantityForA11y,
  setAccessibilityFocus,
  hassufficientContrast,
};
