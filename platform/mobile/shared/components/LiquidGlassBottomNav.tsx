/**
 * Okinawa Design System — Liquid Glass bottom navigation (shared base)
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MoreHorizontal, X } from 'lucide-react-native';
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
  const [moreOpen, setMoreOpen] = useState(false);
  const hasOverflow = items.length > 5;
  const primaryItems = hasOverflow ? items.slice(0, 4) : items;
  const overflowItems = hasOverflow ? items.slice(4) : [];
  const activeInOverflow = overflowItems.some((item) => item.id === activeTab);

  useEffect(() => {
    scaleValues.current = Array.from(
      { length: items.length + (hasOverflow ? 1 : 0) },
      (_, index) => scaleValues.current[index] ?? new Animated.Value(1),
    );
  }, [hasOverflow, items]);

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
          justifyContent: 'space-around',
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
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 2,
          paddingHorizontal: 4,
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
        modalBackdrop: {
          flex: 1,
          justifyContent: 'flex-end',
          backgroundColor: 'rgba(15, 23, 42, 0.42)',
        },
        moreSheet: {
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          borderWidth: StyleSheet.hairlineWidth,
          paddingHorizontal: 18,
          paddingTop: 14,
        },
        moreHeader: {
          minHeight: 44,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        },
        moreTitle: { fontSize: 17, fontWeight: '800' },
        closeButton: {
          width: 38,
          height: 38,
          borderRadius: 13,
          alignItems: 'center',
          justifyContent: 'center',
        },
        overflowGrid: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 10,
        },
        overflowItem: {
          width: '48.5%',
          minHeight: 76,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: 18,
          padding: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        },
        overflowIcon: {
          width: 38,
          height: 38,
          borderRadius: 13,
          alignItems: 'center',
          justifyContent: 'center',
        },
        overflowLabel: { flex: 1, fontSize: 12, fontWeight: '700' },
      }),
    [colors],
  );

  const renderItems = (visibleItems: LiquidGlassNavItem[]) =>
    visibleItems.map((item) => {
      const index = items.findIndex((candidate) => candidate.id === item.id);
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

  const moreIndex = items.length;
  const moreScale = scaleValues.current[moreIndex] ?? new Animated.Value(1);

  return (
    <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 6) }]}>
      <View
        style={[
          styles.navShell,
          { backgroundColor: shellBackground, borderColor: shellBorder },
        ]}
      >
        {renderItems(primaryItems)}
        {hasOverflow ? (
          <TouchableOpacity
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Mais opções"
            accessibilityState={{ expanded: moreOpen, selected: activeInOverflow }}
            onPress={() => setMoreOpen(true)}
            onPressIn={() => handlePressIn(moreIndex)}
            onPressOut={() => handlePressOut(moreIndex)}
            style={styles.navItem}
          >
            <Animated.View style={[styles.iconContainer, { transform: [{ scale: moreScale }] }]}>
              {activeInOverflow ? (
                <LinearGradient
                  colors={theme.gradients.primary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.activeGradient}
                />
              ) : null}
              <MoreHorizontal
                size={18}
                color={activeInOverflow ? colors.primaryForeground : inactiveIconColor}
                strokeWidth={activeInOverflow ? 2 : 1.5}
              />
            </Animated.View>
            <Text style={[styles.navLabel, { color: activeInOverflow ? colors.primary : inactiveIconColor }]}>Mais</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Modal visible={moreOpen} transparent animationType="slide" onRequestClose={() => setMoreOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setMoreOpen(false)}>
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={[
              styles.moreSheet,
              {
                paddingBottom: Math.max(insets.bottom, 18) + 10,
                backgroundColor: shellBackground,
                borderColor: shellBorder,
              },
            ]}
          >
            <View style={styles.moreHeader}>
              <View>
                <Text style={[styles.moreTitle, { color: colors.foreground }]}>Mais opções</Text>
                <Text style={{ color: colors.foregroundSecondary, fontSize: 12, marginTop: 2 }}>Acesse as demais áreas</Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Fechar mais opções"
                onPress={() => setMoreOpen(false)}
                style={[styles.closeButton, { backgroundColor: colors.backgroundSecondary }]}
              >
                <X size={19} color={colors.foregroundSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.overflowGrid}>
              {overflowItems.map((item) => {
                const Icon = item.icon;
                const isActive = item.id === activeTab;
                return (
                  <TouchableOpacity
                    key={item.id}
                    activeOpacity={0.76}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    onPress={() => {
                      setMoreOpen(false);
                      onNavigate(item.id);
                    }}
                    style={[
                      styles.overflowItem,
                      {
                        borderColor: isActive ? colors.primary : colors.border,
                        backgroundColor: isActive ? `${colors.primary}10` : colors.backgroundSecondary,
                      },
                    ]}
                  >
                    <View style={[styles.overflowIcon, { backgroundColor: isActive ? colors.primary : colors.card }]}>
                      <Icon size={18} color={isActive ? colors.primaryForeground : colors.foregroundSecondary} strokeWidth={1.8} />
                    </View>
                    <Text style={[styles.overflowLabel, { color: isActive ? colors.primary : colors.foreground }]}>{item.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

/** Approximate total height for screen content padding (bar + safe area). */
export const LIQUID_GLASS_BOTTOM_NAV_OFFSET = 81;

export default LiquidGlassBottomNav;
