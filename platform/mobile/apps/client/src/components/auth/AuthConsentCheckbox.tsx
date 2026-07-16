import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text, HelperText } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';

interface AuthConsentCheckboxProps {
  checked: boolean;
  onToggle: () => void;
  label: string;
  showError?: boolean;
  errorMessage?: string;
}

export function AuthConsentCheckbox({
  checked,
  onToggle,
  label,
  showError = false,
  errorMessage,
}: AuthConsentCheckboxProps) {
  const colors = useColors();
  const hasError = showError && !checked;

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        style={[
          styles.card,
          { borderColor: colors.border, backgroundColor: colors.card },
          checked && {
            borderColor: colors.primary,
            backgroundColor: `${colors.primary}12`,
          },
          hasError && {
            borderColor: colors.error,
            backgroundColor: `${colors.error}10`,
          },
        ]}
        onPress={onToggle}
        activeOpacity={0.7}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={label}
      >
        <View
          style={[
            styles.checkbox,
            { borderColor: hasError ? colors.error : colors.border },
            checked && {
              backgroundColor: colors.primary,
              borderColor: colors.primary,
            },
          ]}
        >
          {checked ? (
            <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" />
          ) : null}
        </View>
        <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      </TouchableOpacity>
      {hasError && errorMessage ? (
        <HelperText type="error" visible style={styles.error}>
          {errorMessage}
        </HelperText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 8,
    marginBottom: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 12,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  label: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  error: {
    marginTop: 4,
    marginLeft: 4,
  },
});
