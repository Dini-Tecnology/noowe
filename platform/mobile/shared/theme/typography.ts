/**
 * Okinawa Design System - Typography
 * Modern Chic font system with clean, elegant hierarchy
 */

import { TextStyle } from 'react-native';

// Font Families
// Titles/Display -> Space Grotesk, Body -> DM Sans, Interface/fallback -> Inter, Numeric -> JetBrains Mono
// Loaded via useFonts() in App.tsx (see shared/theme/fonts.ts); falls back to the OS default
// font automatically until loading completes, since RN silently ignores unknown font names.
export const fontFamily = {
  regular: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semibold: 'DMSans_600SemiBold',
  bold: 'DMSans_700Bold',
  display: 'SpaceGrotesk_700Bold',
  displayMedium: 'SpaceGrotesk_600SemiBold',
  interface: 'Inter_500Medium',
  interfaceRegular: 'Inter_400Regular',
  interfaceSemibold: 'Inter_600SemiBold',
  mono: 'JetBrainsMono_500Medium',
  monoSemibold: 'JetBrainsMono_600SemiBold',
};

// Font Weights
export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

// Font Sizes
export const fontSize = {
  xs: 10,
  sm: 12,
  base: 14,
  md: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
  '5xl': 48,
};

// Line Heights
export const lineHeight = {
  tight: 1.1,
  snug: 1.25,
  normal: 1.5,
  relaxed: 1.625,
  loose: 2,
};

// Letter Spacing
export const letterSpacing = {
  tighter: -0.5,
  tight: -0.25,
  normal: 0,
  wide: 0.5,
  wider: 1,
  widest: 2,
};

// Typography Variants
export interface TypographyVariant extends TextStyle {
  fontSize: number;
  lineHeight: number;
  fontWeight: '400' | '500' | '600' | '700';
  letterSpacing?: number;
}

export const typography: Record<string, TypographyVariant> = {
  // Display / Hero text -> Space Grotesk
  displayLarge: {
    fontFamily: fontFamily.display,
    fontSize: fontSize['5xl'],
    lineHeight: fontSize['5xl'] * lineHeight.tight,
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.tight,
  },
  displayMedium: {
    fontFamily: fontFamily.display,
    fontSize: fontSize['4xl'],
    lineHeight: fontSize['4xl'] * lineHeight.tight,
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.tight,
  },
  displaySmall: {
    fontFamily: fontFamily.display,
    fontSize: fontSize['3xl'],
    lineHeight: fontSize['3xl'] * lineHeight.snug,
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.tight,
  },

  // Headings -> Space Grotesk
  h1: {
    fontFamily: fontFamily.display,
    fontSize: fontSize['2xl'],
    lineHeight: fontSize['2xl'] * lineHeight.snug,
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.tight,
  },
  h2: {
    fontFamily: fontFamily.displayMedium,
    fontSize: fontSize.xl,
    lineHeight: fontSize.xl * lineHeight.snug,
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.normal,
  },
  h3: {
    fontFamily: fontFamily.displayMedium,
    fontSize: fontSize.lg,
    lineHeight: fontSize.lg * lineHeight.normal,
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.normal,
  },
  h4: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    lineHeight: fontSize.md * lineHeight.normal,
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.normal,
  },

  // Body text -> DM Sans
  bodyLarge: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    lineHeight: fontSize.md * lineHeight.relaxed,
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.normal,
  },
  bodyMedium: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.base,
    lineHeight: fontSize.base * lineHeight.relaxed,
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.normal,
  },
  bodySmall: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * lineHeight.relaxed,
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.normal,
  },

  // Labels -> Inter (interface)
  labelLarge: {
    fontFamily: fontFamily.interface,
    fontSize: fontSize.base,
    lineHeight: fontSize.base * lineHeight.normal,
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.wide,
  },
  labelMedium: {
    fontFamily: fontFamily.interface,
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * lineHeight.normal,
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.wide,
  },
  labelSmall: {
    fontFamily: fontFamily.interface,
    fontSize: fontSize.xs,
    lineHeight: fontSize.xs * lineHeight.normal,
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.wider,
  },

  // Captions -> Inter (interface)
  caption: {
    fontFamily: fontFamily.interfaceRegular,
    fontSize: fontSize.xs,
    lineHeight: fontSize.xs * lineHeight.normal,
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.wide,
  },

  // Button text -> Inter (interface)
  buttonLarge: {
    fontFamily: fontFamily.interfaceSemibold,
    fontSize: fontSize.md,
    lineHeight: fontSize.md * lineHeight.normal,
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.wide,
  },
  buttonMedium: {
    fontFamily: fontFamily.interfaceSemibold,
    fontSize: fontSize.base,
    lineHeight: fontSize.base * lineHeight.normal,
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.wide,
  },
  buttonSmall: {
    fontFamily: fontFamily.interface,
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * lineHeight.normal,
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.wider,
  },

  // Numeric / Price -> JetBrains Mono
  priceDisplay: {
    fontFamily: fontFamily.monoSemibold,
    fontSize: fontSize['3xl'],
    lineHeight: fontSize['3xl'] * lineHeight.tight,
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.tight,
  },
  priceLarge: {
    fontFamily: fontFamily.monoSemibold,
    fontSize: fontSize.xl,
    lineHeight: fontSize.xl * lineHeight.tight,
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.normal,
  },
  priceMedium: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.md,
    lineHeight: fontSize.md * lineHeight.tight,
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.normal,
  },

  // Navigation -> Inter (interface)
  navLabel: {
    fontFamily: fontFamily.interface,
    fontSize: fontSize.xs,
    lineHeight: fontSize.xs * lineHeight.normal,
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.wide,
  },

  // Badge / Tag -> Inter (interface)
  badge: {
    fontFamily: fontFamily.interfaceSemibold,
    fontSize: fontSize.xs,
    lineHeight: fontSize.xs * lineHeight.tight,
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.wider,
  },
};

export type TypographyKey = keyof typeof typography;
