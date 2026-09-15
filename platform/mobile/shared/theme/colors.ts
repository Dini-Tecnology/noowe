/**
 * Okinawa Design System - Color Tokens
 * Modern Chic Aesthetic with Warm Orange Primary
 * 
 * All colors use semantic naming for consistent theming
 * across both Client and Restaurant apps
 */

export const colorPalette = {
  // Primary - Warm Sophisticated Orange
  primary: {
    50: '#FFF7ED',
    100: '#FFEDD5',
    200: '#FED7AA',
    300: '#FDBA74',
    400: '#FB923C',
    500: '#F97316',
    600: '#EA580C', // Main brand color
    700: '#C2410C',
    800: '#9A3412',
    900: '#7C2D12',
  },
  
  // Secondary - Teal (Trust, Fresh, Innovation)
  secondary: {
    50: '#F0FDFA',
    100: '#CCFBF1',
    200: '#99F6E4',
    300: '#5EEAD4',
    400: '#2DD4BF',
    500: '#14B8A6',
    600: '#0D9488',
    700: '#0F766E',
    800: '#115E59',
    900: '#134E4A',
  },
  
  // Accent - Warm Gold (Premium, Special Moments)
  accent: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706',
    700: '#B45309',
    800: '#92400E',
    900: '#78350F',
  },
  
  // Neutral - Gray scale
  neutral: {
    0: '#FFFFFF',
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
    950: '#0D1117',
  },
  
  // Status colors
  success: {
    light: '#34D399',
    main: '#10B981',
    dark: '#059669',
  },
  warning: {
    light: '#FBBF24',
    main: '#F59E0B',
    dark: '#D97706',
  },
  error: {
    light: '#F87171',
    main: '#EF4444',
    dark: '#DC2626',
  },
  info: {
    light: '#60A5FA',
    main: '#3B82F6',
    dark: '#2563EB',
  },
};

// Semantic Light Theme Tokens
export const lightTheme = {
  // Backgrounds
  background: colorPalette.neutral[0],
  backgroundSecondary: colorPalette.neutral[50],
  backgroundTertiary: colorPalette.neutral[100],
  
  // Foregrounds / Text
  foreground: colorPalette.neutral[900],
  foregroundSecondary: colorPalette.neutral[600],
  foregroundMuted: colorPalette.neutral[400],
  foregroundInverse: colorPalette.neutral[0],
  
  // Cards
  card: colorPalette.neutral[0],
  cardHover: colorPalette.neutral[50],
  cardBorder: colorPalette.neutral[200],
  
  // Primary Actions
  primary: colorPalette.primary[600],
  primaryLight: colorPalette.primary[400],
  primaryDark: colorPalette.primary[700],
  primaryForeground: colorPalette.neutral[0],
  primaryGlow: 'rgba(234, 88, 12, 0.25)',
  
  // Secondary Actions
  secondary: colorPalette.secondary[600],
  secondaryLight: colorPalette.secondary[400],
  secondaryDark: colorPalette.secondary[700],
  secondaryForeground: colorPalette.neutral[0],
  
  // Accent
  accent: colorPalette.accent[500],
  accentLight: colorPalette.accent[300],
  accentForeground: colorPalette.neutral[900],
  
  // Borders
  border: colorPalette.neutral[200],
  borderLight: colorPalette.neutral[100],
  borderFocus: colorPalette.primary[500],
  
  // Input
  input: colorPalette.neutral[50],
  inputBorder: colorPalette.neutral[200],
  inputFocus: colorPalette.primary[500],
  inputPlaceholder: colorPalette.neutral[400],
  
  // Status
  success: colorPalette.success.main,
  successLight: colorPalette.success.light,
  successBackground: '#ECFDF5',
  warning: colorPalette.warning.main,
  warningLight: colorPalette.warning.light,
  warningBackground: '#FFFBEB',
  error: colorPalette.error.main,
  errorLight: colorPalette.error.light,
  errorBackground: '#FEF2F2',
  info: colorPalette.info.main,
  infoLight: colorPalette.info.light,
  infoBackground: '#EFF6FF',
  
  // Glassmorphism
  glass: 'rgba(255, 255, 255, 0.6)',
  glassStrong: 'rgba(255, 255, 255, 0.8)',
  glassBorder: 'rgba(255, 255, 255, 0.8)',
  
  // Shadows
  shadowColor: 'rgba(0, 0, 0, 0.1)',
  shadowColorStrong: 'rgba(0, 0, 0, 0.2)',
  
  // Overlays
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',
  
  // Rating
  ratingGold: '#FFD700',
  ratingEmpty: colorPalette.neutral[200],
  
  // KDS Specific (Restaurant App)
  kdsUrgent: colorPalette.error.main,
  kdsHigh: colorPalette.warning.main,
  kdsNormal: colorPalette.success.main,
  kdsNew: colorPalette.info.main,
  
  // Table Status (Restaurant App)
  tableAvailable: colorPalette.success.main,
  tableOccupied: colorPalette.error.main,
  tableReserved: colorPalette.info.main,
  tableCleaning: colorPalette.warning.main,

  // Muted tokens (legacy compatibility)
  muted: colorPalette.neutral[200],
  mutedForeground: colorPalette.neutral[500],
  cardForeground: colorPalette.neutral[900],
  successMuted: 'rgba(16, 185, 129, 0.15)',
  destructive: colorPalette.error.main,

  // Loyalty Tier Colors
  tierBronze: '#CD7F32',
  tierBronzeBackground: 'rgba(205, 127, 50, 0.12)',
  tierSilver: '#C0C0C0',
  tierSilverBackground: 'rgba(192, 192, 192, 0.12)',
  tierGold: '#FFD700',
  tierGoldBackground: 'rgba(255, 215, 0, 0.12)',
  tierPlatinum: '#E5E4E2',
  tierPlatinumBackground: 'rgba(229, 228, 226, 0.12)',

  // Order/Reservation Status Colors
  statusPending: colorPalette.warning.main,
  statusPendingBackground: 'rgba(245, 158, 11, 0.12)',
  statusConfirmed: colorPalette.info.main,
  statusConfirmedBackground: 'rgba(59, 130, 246, 0.12)',
  statusPreparing: colorPalette.primary[500],
  statusPreparingBackground: 'rgba(249, 115, 22, 0.12)',
  statusReady: colorPalette.success.main,
  statusReadyBackground: 'rgba(16, 185, 129, 0.12)',
  statusCompleted: colorPalette.success.dark,
  statusCompletedBackground: 'rgba(5, 150, 105, 0.12)',
  statusCancelled: colorPalette.error.main,
  statusCancelledBackground: 'rgba(239, 68, 68, 0.12)',
  statusDelivering: '#8B5CF6',
  statusDeliveringBackground: 'rgba(139, 92, 246, 0.12)',

  // Onboarding slide accents (brand-aligned)
  onboardingSlide1: colorPalette.primary[500],
  onboardingSlide2: colorPalette.secondary[500],
  onboardingSlide3: colorPalette.accent[500],
  onboardingSlide4: '#8B5CF6',

  // Wallet (contrast-safe data surface and semantic action colours)
  walletSurfaceStart: colorPalette.primary[800],
  walletSurfaceEnd: colorPalette.primary[700],
  walletSurfaceMetric: colorPalette.primary[800],
  walletForeground: colorPalette.neutral[0],
  walletPositive: '#047857',
  walletPositiveBackground: '#ECFDF5',
  walletInfo: '#1D4ED8',
  walletInfoBackground: '#EFF6FF',
  walletWarning: '#B45309',
  walletWarningBackground: '#FFFBEB',

  // Premium Dark Card (always dark, for elevated feature headers)
  premiumCard: colorPalette.neutral[800],
  premiumCardForeground: colorPalette.neutral[0],
  premiumCardMuted: 'rgba(255, 255, 255, 0.6)',
  premiumCardBorder: 'rgba(255, 255, 255, 0.2)',
  premiumCardGlass: 'rgba(255, 255, 255, 0.15)',
  premiumCardGlassLight: 'rgba(255, 255, 255, 0.1)',
};

// Semantic Dark Theme Tokens
export const darkTheme = {
  // Backgrounds
  background: colorPalette.neutral[950],
  backgroundSecondary: colorPalette.neutral[900],
  backgroundTertiary: colorPalette.neutral[800],
  
  // Foregrounds / Text
  foreground: colorPalette.neutral[50],
  foregroundSecondary: colorPalette.neutral[300],
  foregroundMuted: colorPalette.neutral[500],
  foregroundInverse: colorPalette.neutral[900],
  
  // Cards
  card: colorPalette.neutral[900],
  cardHover: colorPalette.neutral[800],
  cardBorder: colorPalette.neutral[700],
  
  // Primary Actions
  primary: colorPalette.primary[500],
  primaryLight: colorPalette.primary[400],
  primaryDark: colorPalette.primary[600],
  primaryForeground: colorPalette.neutral[0],
  primaryGlow: 'rgba(249, 115, 22, 0.35)',
  
  // Secondary Actions
  secondary: colorPalette.secondary[500],
  secondaryLight: colorPalette.secondary[400],
  secondaryDark: colorPalette.secondary[600],
  secondaryForeground: colorPalette.neutral[0],
  
  // Accent
  accent: colorPalette.accent[400],
  accentLight: colorPalette.accent[300],
  accentForeground: colorPalette.neutral[900],
  
  // Borders
  border: colorPalette.neutral[700],
  borderLight: colorPalette.neutral[800],
  borderFocus: colorPalette.primary[500],
  
  // Input
  input: colorPalette.neutral[800],
  inputBorder: colorPalette.neutral[700],
  inputFocus: colorPalette.primary[500],
  inputPlaceholder: colorPalette.neutral[500],
  
  // Status
  success: colorPalette.success.main,
  successLight: colorPalette.success.light,
  successBackground: 'rgba(16, 185, 129, 0.1)',
  warning: colorPalette.warning.main,
  warningLight: colorPalette.warning.light,
  warningBackground: 'rgba(245, 158, 11, 0.1)',
  error: colorPalette.error.main,
  errorLight: colorPalette.error.light,
  errorBackground: 'rgba(239, 68, 68, 0.1)',
  info: colorPalette.info.main,
  infoLight: colorPalette.info.light,
  infoBackground: 'rgba(59, 130, 246, 0.1)',
  
  // Glassmorphism
  glass: 'rgba(17, 24, 39, 0.6)',
  glassStrong: 'rgba(17, 24, 39, 0.8)',
  glassBorder: 'rgba(55, 65, 81, 0.5)',
  
  // Shadows
  shadowColor: 'rgba(0, 0, 0, 0.3)',
  shadowColorStrong: 'rgba(0, 0, 0, 0.5)',
  
  // Overlays
  overlay: 'rgba(0, 0, 0, 0.7)',
  overlayLight: 'rgba(0, 0, 0, 0.5)',
  
  // Rating
  ratingGold: '#FFD700',
  ratingEmpty: colorPalette.neutral[600],
  
  // KDS Specific (Restaurant App)
  kdsUrgent: colorPalette.error.main,
  kdsHigh: colorPalette.warning.main,
  kdsNormal: colorPalette.success.main,
  kdsNew: colorPalette.info.main,
  
  // Table Status (Restaurant App)
  tableAvailable: colorPalette.success.main,
  tableOccupied: colorPalette.error.main,
  tableReserved: colorPalette.info.main,
  tableCleaning: colorPalette.warning.main,

  // Muted tokens (legacy compatibility)
  muted: colorPalette.neutral[700],
  mutedForeground: colorPalette.neutral[400],
  cardForeground: colorPalette.neutral[50],
  successMuted: 'rgba(16, 185, 129, 0.2)',
  destructive: colorPalette.error.main,

  // Loyalty Tier Colors
  tierBronze: '#CD7F32',
  tierBronzeBackground: 'rgba(205, 127, 50, 0.2)',
  tierSilver: '#D4D4D4',
  tierSilverBackground: 'rgba(212, 212, 212, 0.15)',
  tierGold: '#FFD700',
  tierGoldBackground: 'rgba(255, 215, 0, 0.15)',
  tierPlatinum: '#E5E4E2',
  tierPlatinumBackground: 'rgba(229, 228, 226, 0.15)',

  // Order/Reservation Status Colors
  statusPending: colorPalette.warning.main,
  statusPendingBackground: 'rgba(245, 158, 11, 0.2)',
  statusConfirmed: colorPalette.info.main,
  statusConfirmedBackground: 'rgba(59, 130, 246, 0.2)',
  statusPreparing: colorPalette.primary[500],
  statusPreparingBackground: 'rgba(249, 115, 22, 0.2)',
  statusReady: colorPalette.success.main,
  statusReadyBackground: 'rgba(16, 185, 129, 0.2)',
  statusCompleted: colorPalette.success.dark,
  statusCompletedBackground: 'rgba(5, 150, 105, 0.2)',
  statusCancelled: colorPalette.error.main,
  statusCancelledBackground: 'rgba(239, 68, 68, 0.2)',
  statusDelivering: '#A78BFA',
  statusDeliveringBackground: 'rgba(167, 139, 250, 0.2)',

  // Onboarding slide accents (brand-aligned)
  onboardingSlide1: colorPalette.primary[400],
  onboardingSlide2: colorPalette.secondary[400],
  onboardingSlide3: colorPalette.accent[400],
  onboardingSlide4: '#A78BFA',

  // Wallet (contrast-safe in dark mode)
  walletSurfaceStart: colorPalette.primary[900],
  walletSurfaceEnd: colorPalette.primary[800],
  walletSurfaceMetric: colorPalette.primary[900],
  walletForeground: colorPalette.neutral[0],
  walletPositive: '#6EE7B7',
  walletPositiveBackground: '#064E3B',
  walletInfo: '#93C5FD',
  walletInfoBackground: '#1E3A8A',
  walletWarning: '#FCD34D',
  walletWarningBackground: '#78350F',

  // Premium Dark Card (always dark, for elevated feature headers)
  premiumCard: colorPalette.neutral[800],
  premiumCardForeground: colorPalette.neutral[0],
  premiumCardMuted: 'rgba(255, 255, 255, 0.6)',
  premiumCardBorder: 'rgba(255, 255, 255, 0.2)',
  premiumCardGlass: 'rgba(255, 255, 255, 0.15)',
  premiumCardGlassLight: 'rgba(255, 255, 255, 0.1)',
};

// Gradients
export const gradients = {
  primary: ['#EA580C', '#F59E0B'],
  primarySubtle: ['rgba(234, 88, 12, 0.8)', 'rgba(245, 158, 11, 0.8)'],
  secondary: ['#0D9488', '#14B8A6'],
  accent: ['#D97706', '#FBBF24'],
  hero: ['#EA580C', '#0D9488'],
  glass: ['rgba(255, 255, 255, 0.4)', 'rgba(255, 255, 255, 0)'],
  glassDark: ['rgba(0, 0, 0, 0.3)', 'rgba(0, 0, 0, 0)'],
  cardShine: ['rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0.1)', 'rgba(255, 255, 255, 0)'],
};

export type ThemeColors = typeof lightTheme;
export type ColorPalette = typeof colorPalette;
