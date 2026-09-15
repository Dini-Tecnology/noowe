import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Text } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';

const ORANGE_SOFT = '#FFF0EA';

type ChipProps = {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  variant?: 'chip' | 'circle';
};

export function SelectChip({
  label,
  selected,
  disabled,
  onPress,
  variant = 'chip',
}: ChipProps) {
  const colors = useColors();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        chip: {
          paddingHorizontal: variant === 'circle' ? 0 : 16,
          paddingVertical: variant === 'circle' ? 0 : 11,
          minWidth: variant === 'circle' ? 40 : undefined,
          height: variant === 'circle' ? 40 : undefined,
          borderRadius: variant === 'circle' ? 20 : 14,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1.5,
          borderColor: selected ? colors.primary : colors.border,
          backgroundColor: selected ? ORANGE_SOFT : colors.card,
          opacity: disabled ? 0.4 : 1,
        },
        chipText: {
          fontSize: 14,
          fontWeight: '600',
          color: selected ? colors.primary : colors.foreground,
        },
      }),
    [colors, selected, variant, disabled],
  );

  return (
    <TouchableOpacity
      style={styles.chip}
      onPress={onPress}
      disabled={disabled || !onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
    >
      <Text style={styles.chipText}>{label}</Text>
    </TouchableOpacity>
  );
}

type SectionProps = {
  title: string;
  children: React.ReactNode;
};

export function SelectionSection({ title, children }: SectionProps) {
  const colors = useColors();
  return (
    <View style={{ marginBottom: 22 }}>
      <Text
        style={{
          fontSize: 16,
          fontWeight: '700',
          color: colors.foreground,
          marginBottom: 12,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

type BannerProps = {
  message: string;
};

export function HintBanner({ message }: BannerProps) {
  const colors = useColors();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 14,
        backgroundColor: '#FFF3EE',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#FFD7C8',
        marginBottom: 20,
      }}
    >
      <Text style={{ fontSize: 16 }}>⚡</Text>
      <Text
        style={{
          flex: 1,
          fontSize: 14,
          fontWeight: '500',
          color: colors.primary,
          lineHeight: 20,
        }}
      >
        {message}
      </Text>
    </View>
  );
}

type ObservationsProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  compact?: boolean;
};

export function ObservationsField({
  value,
  onChangeText,
  placeholder = 'Aniversário de casamento...',
  compact = false,
}: ObservationsProps) {
  const colors = useColors();
  return (
    <SelectionSection title="Observações">
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.foregroundMuted}
        multiline
        style={{
          minHeight: compact ? 48 : 100,
          maxHeight: compact ? 72 : undefined,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 14,
          padding: 14,
          fontSize: 15,
          color: colors.foreground,
          textAlignVertical: 'top',
          backgroundColor: colors.card,
        }}
      />
    </SelectionSection>
  );
}
