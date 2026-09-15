/**
 * useThemedStyles hook
 * Provides dynamic styles based on current theme
 */

import { useMemo } from 'react';
import { StyleSheet, ViewStyle, TextStyle, ImageStyle } from 'react-native';
import { useOkinawaTheme } from './ThemeContext';
import type { OkinawaTheme } from '../theme/okinawaThemes';

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

/**
 * Hook to create themed styles
 * @param styleFactory Function that receives theme and returns styles
 * @returns StyleSheet with theme-aware styles
 */
export function useThemedStyles<T extends NamedStyles<T>>(
  styleFactory: (theme: OkinawaTheme, isDark: boolean) => T
): T {
  const { theme, isDark } = useOkinawaTheme();
  
  return useMemo(() => {
    const styles = styleFactory(theme, isDark);
    return StyleSheet.create(styles) as T;
  }, [theme, isDark, styleFactory]);
}

/**
 * Hook to create themed styles with stable reference
 * Use this when you don't need the styles to update on theme change
 * (better performance for static styles)
 */
export function useStaticThemedStyles<T extends NamedStyles<T>>(
  styleFactory: (theme: OkinawaTheme, isDark: boolean) => T
): T {
  const { theme, isDark } = useOkinawaTheme();
  
  // Only create styles once
  return useMemo(() => {
    const styles = styleFactory(theme, isDark);
    return StyleSheet.create(styles) as T;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Common themed style values
 */
export function useCommonStyles() {
  const { theme, isDark } = useOkinawaTheme();
  
  return useMemo(() => ({
    // Containers
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    } as ViewStyle,
    
    safeContainer: {
      flex: 1,
      backgroundColor: theme.colors.background,
    } as ViewStyle,
    
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.colors.background,
    } as ViewStyle,
    
    // Cards
    card: {
      backgroundColor: theme.colors.card,
      borderRadius: theme.borderRadius.card,
      padding: theme.spacing[4],
      ...theme.componentShadows.card,
    } as ViewStyle,
    
    cardElevated: {
      backgroundColor: theme.colors.card,
      borderRadius: theme.borderRadius.card,
      padding: theme.spacing[4],
      ...theme.componentShadows.cardElevated,
    } as ViewStyle,
    
    // Headers
    header: {
      padding: theme.spacing[4],
      backgroundColor: theme.colors.card,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    } as ViewStyle,
    
    // Sections
    section: {
      backgroundColor: theme.colors.card,
      padding: theme.spacing[4],
      marginBottom: theme.spacing[2],
    } as ViewStyle,
    
    // Text
    title: {
      color: theme.colors.foreground,
      fontWeight: '600',
    } as TextStyle,
    
    subtitle: {
      color: theme.colors.foregroundSecondary,
    } as TextStyle,
    
    mutedText: {
      color: theme.colors.foregroundMuted,
    } as TextStyle,
    
    primaryText: {
      color: theme.colors.primary,
    } as TextStyle,
    
    // Dividers
    divider: {
      height: 1,
      backgroundColor: theme.colors.border,
    } as ViewStyle,
    
    // Empty states
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: theme.spacing[8],
    } as ViewStyle,
    
    emptyText: {
      color: theme.colors.foregroundMuted,
      textAlign: 'center',
      marginTop: theme.spacing[4],
    } as TextStyle,
    
    // Status colors
    statusColors: {
      success: theme.colors.success,
      warning: theme.colors.warning,
      error: theme.colors.error,
      info: theme.colors.info,
    },
    
    // Background colors
    successBackground: theme.colors.successBackground,
    warningBackground: theme.colors.warningBackground,
    errorBackground: theme.colors.errorBackground,
    infoBackground: theme.colors.infoBackground,
  }), [theme, isDark]);
}

export default useThemedStyles;
