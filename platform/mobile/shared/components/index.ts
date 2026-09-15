/**
 * Okinawa Design System - Shared Components Export
 * 
 * Central export point for all reusable components.
 * Import components from this file for cleaner imports across the app.
 * 
 * @module shared/components
 */

// ============================================
// ERROR HANDLING
// ============================================
export { ErrorBoundary, withErrorBoundary } from './ErrorBoundary';

// ============================================
// CORE UI COMPONENTS
// ============================================
export { default as Button } from './Button';
export { default as Card } from './Card';
export { default as Input } from './Input';
export { default as Badge } from './Badge';
export { default as Avatar, AvatarGroup } from './Avatar';

// ============================================
// TYPOGRAPHY
// ============================================
export { default as Text } from './Text';
export {
  DisplayLarge,
  DisplayMedium,
  DisplaySmall,
  H1,
  H2,
  H3,
  H4,
  BodyLarge,
  BodyMedium,
  BodySmall,
  LabelLarge,
  LabelMedium,
  LabelSmall,
  Caption,
  Price,
  MutedText,
  SecondaryText,
} from './Text';

// ============================================
// NAVIGATION COMPONENTS
// ============================================
export { default as LiquidGlassNav } from './LiquidGlassNav';
export {
  default as LiquidGlassBottomNav,
  LIQUID_GLASS_BOTTOM_NAV_OFFSET,
  liquidGlassTabNavigatorScreenOptions,
} from './LiquidGlassBottomNav';
export type { LiquidGlassNavItem, LiquidGlassBottomNavProps } from './LiquidGlassBottomNav';
export { default as RestaurantLiquidGlassNav } from './RestaurantLiquidGlassNav';
export { default as ClientLiquidGlassNav } from './ClientLiquidGlassNav';

// ============================================
// DOMAIN COMPONENTS
// ============================================
export { OrderCard } from './orders/OrderCard';
export type { OrderCardProps, OrderCardOrder, OrderCardItem } from './orders/OrderCard';

// ============================================
// LEGAL / COMPLIANCE COMPONENTS
// ============================================
export { AIDisclaimerModal } from './AIDisclaimerModal';
export { NooweDialog } from './NooweDialog';
export type { NooweDialogAction } from './NooweDialog';
export { BetaBadge } from './BetaBadge';
export { LegalConsentSection } from './LegalConsentSection';
export type { LegalConsentProps } from './LegalConsentSection';

// ============================================
// ACCESSIBLE COMPONENT WRAPPERS
// ============================================
export {
  AccessibleButton,
  AccessibleIconButton,
  AccessibleTextInput,
  AccessibleFAB,
} from './AccessibleComponents';

// ============================================
// UTILITY COMPONENTS
// ============================================
export { LoadingSpinner } from './LoadingSpinner';
export { ErrorMessage } from './ErrorMessage';
export { EmptyState } from './EmptyState';
export { StatusBadge } from './StatusBadge';
