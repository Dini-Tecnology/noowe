import { Platform, StyleSheet } from 'react-native';

/** Shared NOOWE auth screen visual tokens */
export const AUTH_BRAND = {
  googleBg: '#FFEBEE',
  googleText: '#E53935',
  appleBg: '#F3F4F6',
  appleText: '#111827',
  biometricBg: '#E8F5E9',
  biometricText: '#2E7D32',
  inputBorder: '#E5E7EB',
  label: '#6B7280',
  placeholder: '#9CA3AF',
  borderRadius: 12,
  socialBorderRadius: 12,
} as const;

export const authFieldStyles = StyleSheet.create({
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: AUTH_BRAND.label,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: AUTH_BRAND.inputBorder,
    borderRadius: AUTH_BRAND.borderRadius,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 13 : 10,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    padding: 0,
  },
});
