import React, { useEffect, useState } from 'react';
import { StyleSheet, Switch, TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { formatTaxDocument, isValidTaxDocument, maskTaxDocument, taxDocumentDigits } from '../../services/tax-document';
import { billShares } from '../../services/bill-shares';
import { AuthConsentCheckbox } from '../auth/AuthConsentCheckbox';

export interface ReceiptDocumentState {
  enabled: boolean;
  document: string;
  /** LGPD: "Salvar meu CPF para as próximas compras", desmarcado por padrão. */
  save?: boolean;
}

export const RECEIPT_DOCUMENT_OFF: ReceiptDocumentState = { enabled: false, document: '', save: false };

/** Texto exato que a pessoa aceita; vai para o servidor como registro do consentimento. */
export const SAVE_TAX_DOCUMENT_CONSENT = 'Salvar meu CPF para as próximas compras';

/** Campos do consentimento para a cobrança: só quando a pessoa marcou salvar um CPF válido. */
export function taxDocumentConsentForPayment(state: ReceiptDocumentState): { saveTaxDocument?: true; taxDocumentConsentText?: string } {
  return state.enabled && state.save && isValidTaxDocument(state.document)
    ? { saveTaxDocument: true, taxDocumentConsentText: SAVE_TAX_DOCUMENT_CONSENT } : {};
}

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
  // CPF salvo com consentimento: oferecido, nunca preenchido sem a pessoa pedir.
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    // A oferta é conveniência: se falhar, a pessoa digita.
    Promise.resolve().then(() => billShares.myTaxDocument()).then((d) => { if (alive) setSaved(d ?? null); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const toggle = (enabled: boolean) => {
    if (!enabled) return onChange({ ...value, enabled: false });
    const document = value.document || (fallback && isValidTaxDocument(fallback) ? formatTaxDocument(fallback) : '');
    onChange({ ...value, enabled: true, document });
  };
  const usingSaved = saved !== null && taxDocumentDigits(value.document) === saved;
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
          {saved !== null && !usingSaved && (
            <TouchableOpacity onPress={() => onChange({ ...value, document: formatTaxDocument(saved), save: false })}
              accessibilityRole="button" testID="receipt-document-use-saved">
              <Text style={[styles.link, { color: colors.primary }]}>Usar meu CPF salvo ({maskTaxDocument(saved)})</Text>
            </TouchableOpacity>
          )}
          {!usingSaved && (
            <AuthConsentCheckbox checked={!!value.save} onToggle={() => onChange({ ...value, save: !value.save })}
              label={SAVE_TAX_DOCUMENT_CONSENT} />
          )}
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
  link: { fontSize: 14, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
});
