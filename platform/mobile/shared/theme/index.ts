/**
 * Okinawa Design System - Theme Entry Point
 * Modern Chic aesthetic with Warm Orange primary color
 * 
 * This design system provides:
 * - Semantic color tokens with light/dark mode support
 * - Typography scale with consistent hierarchy
 * - Spacing system based on 4px grid
 * - Shadow/elevation system
 * - Animation presets and timing functions
 */

// Export all theme modules
export * from './colors';
export * from './typography';
export * from './spacing';
export * from './shadows';
export * from './animations';

export {
  OkinawaLightTheme,
  OkinawaDarkTheme,
  type OkinawaTheme,
  default,
} from './okinawa-presets';

export { useColors, useTheme, useOkinawaTheme } from './theme-hooks';

// Migration helper: Convert old theme to new theme
// This helps existing components transition to the new design system
export const legacyThemeMapping = {
  // Old color names -> New semantic tokens
  primary: 'colors.primary',
  primaryLight: 'colors.primaryLight',
  primaryDark: 'colors.primaryDark',
  secondary: 'colors.secondary',
  accent: 'colors.accent',
  
  // Text colors
  text: 'colors.foreground',
  textSecondary: 'colors.foregroundSecondary',
  textMuted: 'colors.foregroundMuted',
  
  // Background colors
  white: 'colors.background',
  gray50: 'colors.backgroundSecondary',
  gray100: 'colors.backgroundTertiary',
  
  // Status colors
  success: 'colors.success',
  warning: 'colors.warning',
  error: 'colors.error',
  info: 'colors.info',
  
  // Border colors
  border: 'colors.border',
  divider: 'colors.borderLight',
  
  // Surface colors
  cardBackground: 'colors.card',
  inputBackground: 'colors.input',
};
