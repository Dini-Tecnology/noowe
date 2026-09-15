import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { Text } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { RESTAURANT_BRANDING } from '../../constants/branding';

interface AuthScreenHeaderProps {
  title: string;
  subtitle: string;
}

const LOGO_SIZE = 140;
const LOGO_RADIUS = 36;

export function AuthScreenHeader({ title, subtitle }: AuthScreenHeaderProps) {
  const colors = useColors();

  return (
    <View style={styles.header}>
      <View
        style={styles.logoWrapper}
        collapsable={false}
        renderToHardwareTextureAndroid
      >
        <Image
          source={RESTAURANT_BRANDING.icon}
          style={styles.logoIcon}
          resizeMode="cover"
          accessibilityLabel="NOOWE Restaurant"
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
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_RADIUS,
    overflow: 'hidden',
    marginBottom: 20,
    backgroundColor: '#F7F3EB',
  },
  logoIcon: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_RADIUS,
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
