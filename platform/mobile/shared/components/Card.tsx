/**
 * Okinawa Design System - Card Component
 * 
 * A versatile card component with multiple variants
 * and support for glassmorphism effects.
 */

import React, { useRef } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ViewStyle,
  StyleProp,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useOkinawaTheme } from '../contexts/ThemeContext';

type CardVariant = 'default' | 'elevated' | 'outlined' | 'glass' | 'interactive';

interface CardProps {
  children: React.ReactNode;
  variant?: CardVariant;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  padding?: number;
  borderRadius?: number;
}

const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  onPress,
  style,
  padding,
  borderRadius,
}) => {
  const { theme, isDark } = useOkinawaTheme();
  const scaleValue = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (onPress) {
      Animated.spring(scaleValue, {
        toValue: 0.98,
        useNativeDriver: true,
        damping: 15,
        stiffness: 200,
      }).start();
    }
  };

  const handlePressOut = () => {
    if (onPress) {
      Animated.spring(scaleValue, {
        toValue: 1,
        useNativeDriver: true,
        damping: 15,
        stiffness: 200,
      }).start();
    }
  };

  const getVariantStyles = (): ViewStyle => {
    const basePadding = padding ?? theme.spacing[4];
    const baseRadius = borderRadius ?? theme.borderRadius.card;

    switch (variant) {
      case 'elevated':
        return {
          backgroundColor: theme.colors.card,
          padding: basePadding,
          borderRadius: baseRadius,
          ...theme.componentShadows.card,
        };
      case 'outlined':
        return {
          backgroundColor: theme.colors.card,
          padding: basePadding,
          borderRadius: baseRadius,
          borderWidth: 1,
          borderColor: theme.colors.border,
        };
      case 'interactive':
        return {
          backgroundColor: theme.colors.card,
          padding: basePadding,
          borderRadius: baseRadius,
          borderWidth: 1,
          borderColor: theme.colors.borderLight,
          ...theme.componentShadows.card,
        };
      case 'glass':
        return {
          padding: basePadding,
          borderRadius: baseRadius,
          overflow: 'hidden',
        };
      default:
        return {
          backgroundColor: theme.colors.card,
          padding: basePadding,
          borderRadius: baseRadius,
        };
    }
  };

  const variantStyles = getVariantStyles();
  const combinedStyle = { ...styles.container, ...variantStyles, ...StyleSheet.flatten(style) };

  const renderGlassCard = () => (
    <View style={[combinedStyle, { backgroundColor: 'transparent' }]}>
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={60}
          tint={isDark ? 'dark' : 'light'}
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: isDark
                ? 'rgba(17, 24, 39, 0.6)'
                : 'rgba(255, 255, 255, 0.6)',
            },
          ]}
        />
      ) : (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: isDark
                ? 'rgba(17, 24, 39, 0.85)'
                : 'rgba(255, 255, 255, 0.85)',
            },
          ]}
        />
      )}
      {/* Top Reflection */}
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.2)', 'transparent']}
        style={[StyleSheet.absoluteFillObject, { height: '50%' }]}
      />
      {/* Border */}
      <View
        style={[
          StyleSheet.absoluteFillObject,
          {
            borderRadius: borderRadius ?? theme.borderRadius.card,
            borderWidth: 1,
            borderColor: isDark
              ? 'rgba(55, 65, 81, 0.5)'
              : 'rgba(255, 255, 255, 0.8)',
          },
        ]}
      />
      <View style={{ zIndex: 1 }}>{children}</View>
    </View>
  );

  const renderContent = () => {
    if (variant === 'glass') {
      return renderGlassCard();
    }
    return <View style={combinedStyle}>{children}</View>;
  };

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.9}
      >
        <Animated.View style={{ transform: [{ scale: scaleValue }] }}>
          {renderContent()}
        </Animated.View>
      </TouchableOpacity>
    );
  }

  return renderContent();
};

const styles = StyleSheet.create({
  container: {},
});

export default Card;
