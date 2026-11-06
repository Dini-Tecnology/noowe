import React from 'react';
import { StyleSheet, Switch, TextInput, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { formatTaxDocument, isValidTaxDocument, taxDocumentDigits } from '../../services/tax-document';
import { billShares } from '../../services/bill-shares';

export interface ReceiptDocumentState {
  enabled: boolean;
  document: string;
}

export const RECEIPT_DOCUMENT_OFF: ReceiptDocumentState = { enabled: false, document: '' };

/**
 * O que vai para a cobrança: o CPF marcado, ou null quando desmarcado (a nota sai como consumidor não identificado).
 * `undefined` quando o documento digitado é inválido: quem chama avisa e não cobra.
 */
export function receiptDocumentForPayment(state: ReceiptDocumentState): string | null | undefined {
  if (!state.enabled) return null;
  return isValidTaxDocument(state.document) ? taxDocumentDigits(state.document) : undefined;
}

export const INVALID_RECEIPT_DOCUMENT = 'Confira o CPF da nota ou desmarque "CPF na nota".';

/** "CPF na nota" (opcional): vai na nota fiscal do restaurante. Sugere o CPF já usado para pagar, quando há. */
export function ReceiptDocumentField({ value, onChange, fallback }: {
  value: ReceiptDocumentState;
  onChange: (next: ReceiptDocumentState) => void;
  /** CPF digitado para gerar a cobrança nesta tela, se houver. */
  fallback?: string;
}) {
  const colors = useColors();
  const toggle = async (enabled: boolean) => {
    if (!enabled) return onChange({ ...value, enabled: false });
    onChange({ ...value, enabled: true });
    if (value.document) return;
    let document = fallback && isValidTaxDocument(fallback) ? fallback : '';
    // A sugestão é conveniência: sem ela, a pessoa digita.
    if (!document) {
      try { document = (await billShares.myTaxDocument()) ?? ''; } catch { document = ''; }
    }
    if (document) onChange({ enabled: true, document: formatTaxDocument(document) });
  };
  const invalid = value.enabled && taxDocumentDigits(value.document).length > 0 && !isValidTaxDocument(value.document)
    && [11, 14].includes(taxDocumentDigits(value.document).length);
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: colors.foreground }]}>CPF na nota</Text>
          <Text style={[styles.hint, { color: colors.foregroundMuted }]}>Opcional. Sem CPF, a nota sai como consumidor não identificado.</Text>
        </View>
        <Switch value={value.enabled} onValueChange={(v) => { void toggle(v); }} accessibilityLabel="CPF na nota" testID="receipt-document-switch" />
      </View>
      {value.enabled && (
        <>
          <TextInput
            style={[styles.input, { borderColor: invalid ? colors.error : colors.border, color: colors.foreground }]}
            placeholder="CPF ou CNPJ"
            placeholderTextColor={colors.foregroundMuted}
            keyboardType="number-pad"
            maxLength={18}
            value={value.document}
            onChangeText={(document) => onChange({ ...value, document })}
            onBlur={() => { if (isValidTaxDocument(value.document)) onChange({ ...value, document: formatTaxDocument(value.document) }); }}
            accessibilityLabel="CPF na nota"
            testID="receipt-document-input"
          />
          {invalid && <Text style={[styles.hint, { color: colors.error }]}>CPF ou CNPJ inválido.</Text>}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { fontSize: 15, fontWeight: '600' },
  hint: { fontSize: 12, lineHeight: 16 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
});
