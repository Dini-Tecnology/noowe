/**
 * Okinawa Design System — Liquid Glass bottom navigation (shared base)
 */

import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  Platform,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOkinawaTheme, useColors } from '../contexts/ThemeContext';

export interface LiquidGlassNavItem {
  id: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
}

export interface LiquidGlassBottomNavProps {
  items: LiquidGlassNavItem[];
  activeTab: string;
  onNavigate: (tabId: string) => void;
}

/**
 * `height: 0` evita a faixa branca padrão do React Navigation atrás da barra flutuante.
 */
export const liquidGlassTabNavigatorScreenOptions = {
  headerShown: false,
  tabBarStyle: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    elevation: 0,
    shadowOpacity: 0,
    height: 0,
    minHeight: 0,
  },
};

const LiquidGlassBottomNav: React.FC<LiquidGlassBottomNavProps> = ({
  items,
  activeTab,
  onNavigate,
}) => {
  const { theme, isDark } = useOkinawaTheme();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const scaleValues = useRef<Animated.Value[]>([]);
  const scrollable = items.length > 5;

  useEffect(() => {
    scaleValues.current = items.map((_, index) => scaleValues.current[index] ?? new Animated.Value(1));
  }, [items]);

  const shellBackground = colors.card;
  const shellBorder = isDark ? colors.border : colors.border;
  const inactiveIconColor = colors.foregroundMuted;

  const handlePressIn = (index: number) => {
    const value = scaleValues.current[index];
    if (!value) return;
    Animated.spring(value, {
      toValue: 0.9,
      useNativeDriver: true,
      damping: 15,
      stiffness: 200,
    }).start();
  };

  const handlePressOut = (index: number) => {
    const value = scaleValues.current[index];
    if (!value) return;
    Animated.spring(value, {
      toValue: 1,
      useNativeDriver: true,
      damping: 15,
      stiffness: 200,
    }).start();
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          paddingHorizontal: 12,
          paddingTop: 4,
          backgroundColor: 'transparent',
        },
        navShell: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: scrollable ? 'flex-start' : 'space-around',
          borderRadius: 22,
          borderWidth: StyleSheet.hairlineWidth,
          paddingVertical: 6,
          paddingHorizontal: 2,
          ...Platform.select({
            ios: {
              shadowColor: colors.foreground,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.08,
              shadowRadius: 12,
            },
            android: {},
          }),
        },
        navItem: {
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 2,
          paddingHorizontal: scrollable ? 10 : 6,
          minWidth: scrollable ? 64 : undefined,
        },
        iconContainer: {
          width: 32,
          height: 32,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 10,
          overflow: 'hidden',
          backgroundColor: 'transparent',
        },
        activeGradient: {
          ...StyleSheet.absoluteFillObject,
          borderRadius: 10,
        },
        navLabel: {
          marginTop: 2,
          fontSize: 8,
          fontWeight: '500',
          letterSpacing: 0.3,
          textAlign: 'center',
        },
      }),
    [colors, scrollable],
  );

  const renderItems = () =>
    items.map((item, index) => {
      const Icon = item.icon;
      const isActive = activeTab === item.id;
      const scale = scaleValues.current[index] ?? new Animated.Value(1);

      return (
        <TouchableOpacity
          key={item.id}
          onPress={() => onNavigate(item.id)}
          onPressIn={() => handlePressIn(index)}
          onPressOut={() => handlePressOut(index)}
          activeOpacity={0.75}
          style={styles.navItem}
        >
          <Animated.View style={[styles.iconContainer, { transform: [{ scale }] }]}>
            {isActive && (
              <LinearGradient
                colors={theme.gradients.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.activeGradient}
              />
            )}
            <Icon
              size={17}
              color={isActive ? colors.primaryForeground : inactiveIconColor}
              strokeWidth={isActive ? 2 : 1.5}
            />
          </Animated.View>
          <Text
            numberOfLines={1}
            style={[
              styles.navLabel,
              { color: isActive ? colors.primary : inactiveIconColor },
            ]}
          >
            {item.label}
          </Text>
        </TouchableOpacity>
      );
    });

  return (
    <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 6) }]}>
      <View
        style={[
          styles.navShell,
          { backgroundColor: shellBackground, borderColor: shellBorder },
        ]}
      >
        {scrollable ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 4 }}
          >
            {renderItems()}
          </ScrollView>
        ) : (
          renderItems()
        )}
      </View>
    </View>
  );
};

/** Approximate total height for screen content padding (bar + safe area). */
export const LIQUID_GLASS_BOTTOM_NAV_OFFSET = 81;

export default LiquidGlassBottomNav;
