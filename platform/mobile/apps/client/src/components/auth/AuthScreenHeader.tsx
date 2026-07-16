import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { Text } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { CLIENT_BRANDING } from '../../constants/branding';
import { AUTH_BRAND } from './authScreenTheme';

interface AuthScreenHeaderProps {
  title: string;
  subtitle: string;
}

export function AuthScreenHeader({ title, subtitle }: AuthScreenHeaderProps) {
  const colors = useColors();

  return (
    <View style={styles.header}>
      <View style={styles.logoWrapper}>
        <Image
          source={CLIENT_BRANDING.icon}
          style={styles.logoIcon}
          resizeMode="cover"
          accessibilityLabel="NOOWE"
        />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground ?? colors.foregroundSecondary }]}>
        {subtitle}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoWrapper: {
    width: 72,
    height: 72,
    borderRadius: AUTH_BRAND.borderRadius,
    overflow: 'hidden',
    marginBottom: 20,
  },
  logoIcon: {
    width: 72,
    height: 72,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
  },
});
