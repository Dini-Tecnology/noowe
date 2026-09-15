import React from 'react';
import { View, TextInput, StyleSheet, TextInputProps } from 'react-native';
import { Text } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';

interface V2FormFieldProps extends TextInputProps {
  label: string;
}

export function V2FormField({ label, style, ...inputProps }: V2FormFieldProps) {
  const colors = useColors();

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: colors.foregroundSecondary }]}>{label}</Text>
      <View style={[styles.inputBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TextInput
          placeholderTextColor={colors.foregroundSecondary}
          style={[styles.input, { color: colors.foreground }, style]}
          {...inputProps}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  inputBox: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  input: {
    fontSize: 15,
    paddingVertical: 10,
  },
});
