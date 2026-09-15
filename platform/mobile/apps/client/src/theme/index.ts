/**
 * Noowe App Theme
 * Re-exports from shared theme system for semantic token usage
 */

// Re-export everything from shared theme
export * from '@okinawa/shared/theme';
export { useOkinawaTheme, useTheme, useColors, ThemeProvider } from '@okinawa/shared/contexts/ThemeContext';

// Import shared theme values
import { lightTheme, darkTheme, colorPalette, gradients } from '@okinawa/shared/theme/colors';
import { MD3LightTheme as DefaultTheme, MD3DarkTheme } from 'react-native-paper';

/**
 * Legacy color mapping for backward compatibility
 * @deprecated Use useColors() hook instead
 */
export const colors = {
  // Primary
  primary: colorPalette.primary[600],
  primaryLight: colorPalette.primary[400],
  primaryDark: colorPalette.primary[700],
  
  // Secondary
  secondary: colorPalette.secondary[600],
  secondaryLight: colorPalette.secondary[400],
  secondaryDark: colorPalette.secondary[700],
  
  // Accent
  accent: colorPalette.accent[500],

  // Status colors
  success: colorPalette.success.main,
  successLight: colorPalette.success.light,
  warning: colorPalette.warning.main,
  warningLight: colorPalette.warning.light,
  error: colorPalette.error.main,
  errorLight: colorPalette.error.light,
  info: colorPalette.info.main,
  infoLight: colorPalette.info.light,

  // Neutral colors
  white: colorPalette.neutral[0],
  black: colorPalette.neutral[950],
  gray50: colorPalette.neutral[50],
  gray100: colorPalette.neutral[100],
  gray200: colorPalette.neutral[200],
  gray300: colorPalette.neutral[300],
  gray400: colorPalette.neutral[400],
  gray500: colorPalette.neutral[500],
  gray600: colorPalette.neutral[600],
  gray700: colorPalette.neutral[700],
  gray800: colorPalette.neutral[800],
  gray900: colorPalette.neutral[900],

  // Semantic mappings
  text: lightTheme.foreground,
  textSecondary: lightTheme.foregroundSecondary,
  textMuted: lightTheme.foregroundMuted,
  border: lightTheme.border,
  divider: lightTheme.borderLight,
  backdrop: lightTheme.overlay,
  cardBackground: lightTheme.card,
  inputBackground: lightTheme.input,

  // Rating colors
  ratingGold: lightTheme.ratingGold,
  ratingEmpty: lightTheme.ratingEmpty,
};

/**
 * React Native Paper theme for light mode
 */
export const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: lightTheme.primary,
    secondary: lightTheme.secondary,
    tertiary: lightTheme.accent,
    background: lightTheme.background,
    surface: lightTheme.backgroundSecondary,
    surfaceVariant: lightTheme.backgroundTertiary,
    error: lightTheme.error,
    onPrimary: lightTheme.primaryForeground,
    onSecondary: lightTheme.secondaryForeground,
    onBackground: lightTheme.foreground,
    onSurface: lightTheme.foreground,
    onSurfaceVariant: lightTheme.foregroundSecondary,
    outline: lightTheme.border,
    elevation: {
      level0: 'transparent',
      level1: lightTheme.card,
      level2: lightTheme.backgroundSecondary,
      level3: lightTheme.backgroundTertiary,
      level4: lightTheme.backgroundTertiary,
      level5: colorPalette.neutral[200],
    },
  },
  custom: {
    success: lightTheme.success,
    successLight: lightTheme.successLight,
    successBackground: lightTheme.successBackground,
    warning: lightTheme.warning,
    warningLight: lightTheme.warningLight,
    warningBackground: lightTheme.warningBackground,
    error: lightTheme.error,
    errorLight: lightTheme.errorLight,
    errorBackground: lightTheme.errorBackground,
    info: lightTheme.info,
    infoLight: lightTheme.infoLight,
    infoBackground: lightTheme.infoBackground,
    textMuted: lightTheme.foregroundMuted,
    divider: lightTheme.borderLight,
    cardBackground: lightTheme.card,
    inputBackground: lightTheme.input,
    ratingGold: lightTheme.ratingGold,
    ratingEmpty: lightTheme.ratingEmpty,
    backdrop: lightTheme.overlay,
    // Glassmorphism
    glass: lightTheme.glass,
    glassStrong: lightTheme.glassStrong,
    glassBorder: lightTheme.glassBorder,
  },
};

/**
 * React Native Paper theme for dark mode
 */
export const paperDarkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: darkTheme.primary,
    secondary: darkTheme.secondary,
    tertiary: darkTheme.accent,
    background: darkTheme.background,
    surface: darkTheme.backgroundSecondary,
    surfaceVariant: darkTheme.backgroundTertiary,
    error: darkTheme.error,
    onPrimary: darkTheme.primaryForeground,
    onSecondary: darkTheme.secondaryForeground,
    onBackground: darkTheme.foreground,
    onSurface: darkTheme.foreground,
    onSurfaceVariant: darkTheme.foregroundSecondary,
    outline: darkTheme.border,
    elevation: {
      level0: 'transparent',
      level1: darkTheme.card,
      level2: darkTheme.backgroundSecondary,
      level3: darkTheme.backgroundTertiary,
      level4: colorPalette.neutral[700],
      level5: colorPalette.neutral[600],
    },
  },
  custom: {
    success: darkTheme.success,
    successLight: darkTheme.successLight,
    successBackground: darkTheme.successBackground,
    warning: darkTheme.warning,
    warningLight: darkTheme.warningLight,
    warningBackground: darkTheme.warningBackground,
    error: darkTheme.error,
    errorLight: darkTheme.errorLight,
    errorBackground: darkTheme.errorBackground,
    info: darkTheme.info,
    infoLight: darkTheme.infoLight,
    infoBackground: darkTheme.infoBackground,
    textMuted: darkTheme.foregroundMuted,
    divider: darkTheme.borderLight,
    cardBackground: darkTheme.card,
    inputBackground: darkTheme.input,
    ratingGold: darkTheme.ratingGold,
    ratingEmpty: darkTheme.ratingEmpty,
    backdrop: darkTheme.overlay,
    // Glassmorphism
    glass: darkTheme.glass,
    glassStrong: darkTheme.glassStrong,
    glassBorder: darkTheme.glassBorder,
  },
};

// Type exports
export type AppTheme = typeof theme;
export type CustomColors = typeof theme.custom;
