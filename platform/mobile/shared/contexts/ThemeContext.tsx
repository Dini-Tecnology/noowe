/**
 * Okinawa Theme Context
 * Provides theme state and toggle functionality across the app
 */

import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { OkinawaLightTheme, OkinawaDarkTheme, OkinawaTheme } from '../theme/okinawaThemes';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: OkinawaTheme;
  themeMode: ThemeMode;
  isDark: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
  defaultMode?: ThemeMode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  defaultMode = 'system',
}) => {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState<ThemeMode>(defaultMode);

  const isDark = useMemo(() => {
    if (themeMode === 'system') {
      return systemColorScheme === 'dark';
    }
    return themeMode === 'dark';
  }, [themeMode, systemColorScheme]);

  const theme = useMemo(() => {
    return isDark ? OkinawaDarkTheme : OkinawaLightTheme;
  }, [isDark]);

  const toggleTheme = useCallback(() => {
    setThemeMode(current => {
      if (current === 'light') return 'dark';
      if (current === 'dark') return 'light';
      // If system, toggle based on current appearance
      return isDark ? 'light' : 'dark';
    });
  }, [isDark]);

  const value = useMemo(
    () => ({
      theme,
      themeMode,
      isDark,
      setThemeMode,
      toggleTheme,
    }),
    [theme, themeMode, isDark, toggleTheme]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

// Hook to access theme
export const useOkinawaTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useOkinawaTheme must be used within a ThemeProvider');
  }
  return context;
};

// Shorthand hook for just the theme object
export const useTheme = (): OkinawaTheme => {
  const { theme } = useOkinawaTheme();
  return theme;
};

// Hook for colors only (most common use case)
export const useColors = () => {
  const { theme } = useOkinawaTheme();
  return theme.colors;
};

export default ThemeContext;
