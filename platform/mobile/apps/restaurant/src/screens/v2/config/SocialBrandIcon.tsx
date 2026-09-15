import { View, StyleSheet } from 'react-native';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import type { ProfileSocial } from './configTypes';

const BRAND: Record<ProfileSocial['key'], { icon: string; bg: string; fg: string }> = {
  instagram: { icon: 'instagram', bg: '#E1306C', fg: '#FFFFFF' },
  facebook: { icon: 'facebook-f', bg: '#1877F2', fg: '#FFFFFF' },
  tiktok: { icon: 'tiktok', bg: '#010101', fg: '#FFFFFF' },
  google_business: { icon: 'google', bg: '#FFFFFF', fg: '#4285F4' },
};

export function SocialBrandIcon({ socialKey, size = 28 }: { socialKey: ProfileSocial['key']; size?: number }) {
  const brand = BRAND[socialKey];
  const iconSize = Math.round(size * 0.48);
  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: size * 0.28,
          backgroundColor: brand.bg,
          borderWidth: socialKey === 'google_business' ? StyleSheet.hairlineWidth : 0,
          borderColor: '#E5E7EB',
        },
      ]}
    >
      <FontAwesome5 name={brand.icon as any} size={iconSize} color={brand.fg} brand />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
});
