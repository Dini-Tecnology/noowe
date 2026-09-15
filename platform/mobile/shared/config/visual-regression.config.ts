/**
 * Okinawa Visual Regression Testing Configuration
 * 
 * Configuration for visual regression tests using snapshot comparison.
 * Integrates with Storybook for component isolation.
 * 
 * @module shared/config/visual-regression
 */

export const VISUAL_REGRESSION_CONFIG = {
  // Snapshot directories
  snapshotDir: '__snapshots__',
  diffDir: '__diffs__',
  
  // Viewport sizes to test
  viewports: {
    mobile: { width: 375, height: 812 }, // iPhone X
    mobileLarge: { width: 414, height: 896 }, // iPhone 11 Pro Max
    tablet: { width: 768, height: 1024 }, // iPad
    tabletLarge: { width: 1024, height: 1366 }, // iPad Pro
  },
  
  // Threshold for image comparison (0-1)
  threshold: 0.01, // 1% difference allowed
  
  // Components to test
  components: [
    'Button', 'Card', 'Input', 'Badge', 'Avatar', 'AvatarGroup',
    'Text', 'LoadingSpinner', 'EmptyState', 'Skeleton', 'StatusBadge',
    'LiquidGlassNav', 'LiquidGlassBottomNav', 'RestaurantLiquidGlassNav', 'ClientLiquidGlassNav', 'ErrorBoundary',
  ],
  
  // Themes to test
  themes: ['light', 'dark'],
  
  // States to capture
  states: ['default', 'hover', 'active', 'disabled', 'loading', 'error'],
};

/**
 * Storybook configuration for component documentation
 */
export const STORYBOOK_CONFIG = {
  // Storybook server port
  port: 6006,
  
  // Stories location
  stories: ['../components/**/*.stories.@(js|jsx|ts|tsx)'],
  
  // Addons
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-a11y',
    '@storybook/addon-viewport',
  ],
};

export default VISUAL_REGRESSION_CONFIG;
