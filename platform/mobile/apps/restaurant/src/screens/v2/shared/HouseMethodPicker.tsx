import React, { useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';

/**
 * Forma de um pagamento registrado pela equipe (resposta 36): dinheiro não é maquininha.
 * "Dinheiro" entra no caixa; "Maquininha da casa" (crédito, débito, Pix ou vale) entra como pagamento externo.
 * A tela só escolhe a forma: quem decide o que entra no caixa é o servidor.
 */
export const CASH_LABEL = 'Dinheiro';
export const HOUSE_TERMINAL_LABEL = 'Maquininha da casa';
export const HOUSE_TERMINAL_FORMS = [
  { id: 'credit_card', label: 'Crédito' },
  { id: 'debit_card', label: 'Débito' },
  { id: 'pix', label: 'Pix' },
] as const;
export const VOUCHER_LABEL: Record<string, string> = { refeicao: 'Vale-refeição', alimentacao: 'Vale-alimentação' };

export function HouseMethodPicker({ onPick, disabled, vouchers, voucherWithoutKind, buttonStyle, children }: {
  onPick: (method: string, voucherKind?: string) => void;
  disabled?: boolean;
  /** Vales aceitos pelo restaurante, por tipo. */
  vouchers?: string[];
  /** Mostra "Vale" sem tipo (cobrança de balcão). */
  voucherWithoutKind?: boolean;
  buttonStyle?: StyleProp<ViewStyle>;
  /** Outras formas ao lado das duas, como a aproximação. */
  children?: React.ReactNode;
}) {
  const colors = useColors();
  const [terminal, setTerminal] = useState(false);
  const button = [styles.method, { borderColor: colors.border, opacity: disabled ? 0.6 : 1 }, buttonStyle];
  const label = (text: string, color = colors.foreground) => <Text style={{ color, fontWeight: '700' }}>{text}</Text>;

  if (terminal) {
    return (
      <View style={styles.methods}>
        <Text style={[styles.caption, { color: colors.foregroundSecondary }]}>{HOUSE_TERMINAL_LABEL}: qual forma?</Text>
        {HOUSE_TERMINAL_FORMS.map((form) => (
          <Pressable key={form.id} accessibilityRole="button" disabled={disabled} onPress={() => onPick(form.id)} style={button}>
            {label(form.label)}
          </Pressable>
        ))}
        {(vouchers ?? []).map((kind) => (
          <Pressable key={kind} accessibilityRole="button" disabled={disabled} onPress={() => onPick('voucher', kind)} style={button}>
            {label(VOUCHER_LABEL[kind] ?? kind)}
          </Pressable>
        ))}
        {voucherWithoutKind ? (
          <Pressable accessibilityRole="button" disabled={disabled} onPress={() => onPick('voucher')} style={button}>
            {label('Vale')}
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" disabled={disabled} onPress={() => setTerminal(false)} style={[styles.back]}>
          {label('Voltar', colors.foregroundSecondary)}
        </Pressable>
      </View>
    );
  }
  return (
    <View style={styles.methods}>
      <Pressable accessibilityRole="button" disabled={disabled} onPress={() => onPick('cash')} style={button}>
        {label(CASH_LABEL)}
      </Pressable>
      <Pressable accessibilityRole="button" disabled={disabled} onPress={() => setTerminal(true)} style={button}>
        {label(HOUSE_TERMINAL_LABEL)}
      </Pressable>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  method: { flexGrow: 1, minWidth: '45%', alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5 },
  caption: { width: '100%', fontSize: 12, fontWeight: '700' },
  back: { width: '100%', alignItems: 'center', paddingVertical: 8 },
});
