import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';

/** Formats a raw digit string (cents) as a pt-BR currency display, e.g. "1234" -> "12,34". */
export function formatCurrencyDigits(digits: string): string {
  const clean = digits.replace(/\D/g, '').slice(0, 12);
  if (!clean) return '';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(clean) / 100);
}

/** Converts a stored numeric value (reais) into the masked display string. */
export function currencyValueToDisplay(value: number): string {
  if (!value) return '';
  return formatCurrencyDigits(String(Math.round(value * 100)));
}

/** Converts the masked display string back into a raw numeric value (reais) for the DB. */
export function currencyDisplayToValue(display: string): number {
  const digits = display.replace(/\D/g, '');
  return digits ? Number(digits) / 100 : 0;
}

interface CurrencyInputProps {
  value: number;
  onChangeValue: (value: number) => void;
  placeholder?: string;
}

/**
 * Masked "R$" money input. Always displays formatted pt-BR currency as the
 * user types (digit-by-digit, cents-first) and reports back a plain numeric
 * value in reais — callers must persist that raw number, never the display
 * string, so the database never stores a currency symbol/format.
 */
export function CurrencyInput({ value, onChangeValue, placeholder = '0,00' }: CurrencyInputProps) {
  const colors = useColors();

  return (
    <View style={[styles.moneyInput, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Text style={[styles.currencyPrefix, { color: colors.foregroundSecondary }]}>R$</Text>
      <TextInput
        value={currencyValueToDisplay(value)}
        onChangeText={(text) => onChangeValue(currencyDisplayToValue(formatCurrencyDigits(text)))}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor={colors.foregroundMuted}
        style={[styles.moneyTextInput, { color: colors.foreground }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  moneyInput: { minHeight: 50, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
  currencyPrefix: { fontSize: 14, fontWeight: '800', marginRight: 8 },
  moneyTextInput: { flex: 1, fontSize: 16, paddingVertical: 0 },
});
