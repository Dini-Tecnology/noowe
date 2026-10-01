/**
 * Okinawa Design System - Typography Components
 * 
 * Pre-styled text components following the design system typography scale.
 */

import React from 'react';
import { Text as RNText, TextStyle, StyleProp, StyleSheet, AccessibilityRole } from 'react-native';
import { useOkinawaTheme } from '../contexts/ThemeContext';
import { TypographyKey } from '../theme/typography';

interface TextProps {
  children: React.ReactNode;
  variant?: TypographyKey;
  color?: string;
  align?: 'left' | 'center' | 'right';
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
  accessibilityRole?: AccessibilityRole;
}

const Text: React.FC<TextProps> = ({
  children,
  variant = 'bodyMedium',
  color,
  align = 'left',
  numberOfLines,
  style,
  accessibilityRole,
}) => {
  const { theme } = useOkinawaTheme();
  const typographyStyle = theme.typography[variant];

  const textStyle: TextStyle = {
    ...typographyStyle,
    color: color || theme.colors.foreground,
    textAlign: align,
    ...StyleSheet.flatten(style),
  };

  return (
    <RNText style={textStyle} numberOfLines={numberOfLines} accessibilityRole={accessibilityRole}>
      {children}
    </RNText>
  );
};

// Convenience components for common text types
export const DisplayLarge: React.FC<Omit<TextProps, 'variant'>> = (props) => (
  <Text variant="displayLarge" {...props} />
);

export const DisplayMedium: React.FC<Omit<TextProps, 'variant'>> = (props) => (
  <Text variant="displayMedium" {...props} />
);

export const DisplaySmall: React.FC<Omit<TextProps, 'variant'>> = (props) => (
  <Text variant="displaySmall" {...props} />
);

export const H1: React.FC<Omit<TextProps, 'variant'>> = (props) => (
  <Text variant="h1" {...props} />
);

export const H2: React.FC<Omit<TextProps, 'variant'>> = (props) => (
  <Text variant="h2" {...props} />
);

export const H3: React.FC<Omit<TextProps, 'variant'>> = (props) => (
  <Text variant="h3" {...props} />
);

export const H4: React.FC<Omit<TextProps, 'variant'>> = (props) => (
  <Text variant="h4" {...props} />
);

export const BodyLarge: React.FC<Omit<TextProps, 'variant'>> = (props) => (
  <Text variant="bodyLarge" {...props} />
);

export const BodyMedium: React.FC<Omit<TextProps, 'variant'>> = (props) => (
  <Text variant="bodyMedium" {...props} />
);

export const BodySmall: React.FC<Omit<TextProps, 'variant'>> = (props) => (
  <Text variant="bodySmall" {...props} />
);

export const LabelLarge: React.FC<Omit<TextProps, 'variant'>> = (props) => (
  <Text variant="labelLarge" {...props} />
);

export const LabelMedium: React.FC<Omit<TextProps, 'variant'>> = (props) => (
  <Text variant="labelMedium" {...props} />
);

export const LabelSmall: React.FC<Omit<TextProps, 'variant'>> = (props) => (
  <Text variant="labelSmall" {...props} />
);

export const Caption: React.FC<Omit<TextProps, 'variant'>> = (props) => (
  <Text variant="caption" {...props} />
);

export const Price: React.FC<Omit<TextProps, 'variant'> & { size?: 'sm' | 'md' | 'lg' }> = ({
  size = 'md',
  ...props
}) => {
  const variant = size === 'lg' ? 'priceDisplay' : size === 'md' ? 'priceLarge' : 'priceMedium';
  return <Text variant={variant} {...props} />;
};

// Muted text helper
export const MutedText: React.FC<Omit<TextProps, 'color'>> = (props) => {
  const { theme } = useOkinawaTheme();
  return <Text color={theme.colors.foregroundMuted} {...props} />;
};

// Secondary text helper
export const SecondaryText: React.FC<Omit<TextProps, 'color'>> = (props) => {
  const { theme } = useOkinawaTheme();
  return <Text color={theme.colors.foregroundSecondary} {...props} />;
};

export default Text;
