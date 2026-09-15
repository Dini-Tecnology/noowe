import React from 'react';
import {
  View,
  TextInput as RNTextInput,
  TouchableOpacity,
  StyleSheet,
  TextInputProps,
} from 'react-native';
import { Text, HelperText } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { AUTH_BRAND, authFieldStyles } from './authScreenTheme';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface AuthTextFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string;
  icon: IconName;
  secureTextEntry?: boolean;
  showPasswordToggle?: boolean;
  showPassword?: boolean;
  onTogglePassword?: () => void;
  inputProps?: Omit<TextInputProps, 'value' | 'onChangeText' | 'placeholder' | 'secureTextEntry'>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export function AuthTextField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  icon,
  secureTextEntry,
  showPasswordToggle,
  showPassword,
  onTogglePassword,
  inputProps,
  accessibilityLabel,
  accessibilityHint,
}: AuthTextFieldProps) {
  const colors = useColors();

  return (
    <View style={authFieldStyles.fieldGroup}>
      <Text style={authFieldStyles.label}>{label}</Text>
      <View
        style={[
          authFieldStyles.inputWrapper,
          { backgroundColor: colors.background },
          !!error && { borderColor: colors.error },
        ]}
      >
        <MaterialCommunityIcons name={icon} size={18} color={AUTH_BRAND.placeholder} />
        <RNTextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={AUTH_BRAND.placeholder}
          secureTextEntry={secureTextEntry}
          style={[authFieldStyles.input, { color: colors.foreground }]}
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={accessibilityHint}
          {...inputProps}
        />
        {showPasswordToggle && onTogglePassword ? (
          <TouchableOpacity
            onPress={onTogglePassword}
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialCommunityIcons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={18}
              color={AUTH_BRAND.placeholder}
            />
          </TouchableOpacity>
        ) : null}
      </View>
      {error ? <HelperText type="error">{error}</HelperText> : null}
    </View>
  );
}
