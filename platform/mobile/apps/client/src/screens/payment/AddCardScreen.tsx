import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { CardBrandIcon } from '../../components/payment/CardBrandIcon';
import { savedCards } from '../../services/saved-cards';
import { isValidTaxDocument, taxDocumentDigits } from '../../services/tax-document';
import { detectCardBrand, formatCardNumber, formatExpiry, isExpired, isValidLuhn, onlyDigits, parseExpiry } from '../../utils/card';

export type NewCardForm = { number: string; expiry: string; ccv: string; holderName: string; cpf: string; postalCode: string; addressNumber: string; phone: string };

/** Validação só de UX: quem decide se o cartão vale é o provedor, no servidor. */
export function validateNewCard(form: NewCardForm): string | null {
  if (!isValidLuhn(form.number)) return 'Confira o número do cartão.';
  const expiry = parseExpiry(form.expiry);
  if (!expiry) return 'Informe a validade no formato MM/AA.';
  if (isExpired(expiry)) return 'Este cartão está vencido.';
  if (!/^\d{3,4}$/.test(form.ccv)) return 'Confira o código de segurança (CVV).';
  if (form.holderName.trim().length < 3) return 'Informe o nome impresso no cartão.';
  if (!isValidTaxDocument(form.cpf)) return 'Confira o CPF do titular.';
  if (onlyDigits(form.postalCode).length !== 8) return 'Confira o CEP.';
  if (!form.addressNumber.trim()) return 'Informe o número do endereço.';
  if (!/^\d{10,11}$/.test(onlyDigits(form.phone))) return 'Confira o celular com DDD.';
  return null;
}

const EMPTY: NewCardForm = { number: '', expiry: '', ccv: '', holderName: '', cpf: '', postalCode: '', addressNumber: '', phone: '' };

/** "Adicionar cartão": os dados vão uma vez ao servidor, que tokeniza no provedor. Número e CVV não ficam no app. */
export default function AddCardScreen({ route, navigation }: any) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const restaurantId: string | undefined = route?.params?.restaurantId;
  const [form, setForm] = useState<NewCardForm>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof NewCardForm) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const brand = detectCardBrand(form.number);

  const submit = async () => {
    const invalid = validateNewCard(form);
    if (invalid) { setError(invalid); return; }
    const expiry = parseExpiry(form.expiry)!;
    setError(null);
    setBusy(true);
    try {
      await savedCards.add({
        restaurantId: restaurantId ?? '',
        card: { holderName: form.holderName.trim(), number: onlyDigits(form.number), expiryMonth: String(expiry.month).padStart(2, '0'), expiryYear: String(expiry.year), ccv: form.ccv },
        holder: { cpf: taxDocumentDigits(form.cpf), postalCode: onlyDigits(form.postalCode), addressNumber: form.addressNumber.trim(), phone: onlyDigits(form.phone) },
      });
      await queryClient.invalidateQueries({ queryKey: ['saved-cards'] });
      navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar o cartão.');
    } finally {
      // Número e CVV não ficam no estado depois do envio, deu certo ou não.
      setForm((f) => ({ ...f, number: '', ccv: '' }));
      setBusy(false);
    }
  };

  const styles = useMemo(() => StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, height: 56 },
    back: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.backgroundTertiary, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 17, fontWeight: '800', color: colors.foreground },
    content: { padding: 16, gap: 12, paddingBottom: 40 },
    label: { fontSize: 12, fontWeight: '700', color: colors.foregroundSecondary },
    inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 14, height: 48, backgroundColor: colors.backgroundTertiary },
    input: { flex: 1, fontSize: 16, color: colors.foreground },
    row: { flexDirection: 'row', gap: 12 },
    col: { flex: 1, gap: 6 },
    error: { fontSize: 13, fontWeight: '700', color: colors.error },
    hint: { fontSize: 12, color: colors.foregroundSecondary },
    cta: { marginTop: 8, paddingVertical: 16, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center' },
    ctaText: { color: colors.primaryForeground, fontSize: 16, fontWeight: '700' },
  }), [colors]);

  const field = (label: string, key: keyof NewCardForm, props: React.ComponentProps<typeof TextInput>, extra?: React.ReactNode) => (
    <View style={styles.col}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput style={styles.input} placeholderTextColor={colors.foregroundMuted} value={form[key]} onChangeText={set(key)} accessibilityLabel={label} {...props} />
        {extra}
      </View>
    </View>
  );

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
          <Ionicons name="arrow-back" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.title}>Adicionar cartão</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {field('Número do cartão', 'number', { keyboardType: 'number-pad', placeholder: '0000 0000 0000 0000', autoComplete: 'cc-number', value: formatCardNumber(form.number), onChangeText: (t) => set('number')(onlyDigits(t)) },
          <CardBrandIcon brand={brand === 'unknown' ? null : brand} width={36} />)}
        <View style={styles.row}>
          {field('Validade', 'expiry', { keyboardType: 'number-pad', placeholder: 'MM/AA', maxLength: 5, onChangeText: (t) => set('expiry')(formatExpiry(t)) })}
          {field('CVV', 'ccv', { keyboardType: 'number-pad', placeholder: '123', maxLength: 4, secureTextEntry: true, onChangeText: (t) => set('ccv')(onlyDigits(t)) })}
        </View>
        {field('Nome impresso no cartão', 'holderName', { autoCapitalize: 'characters', autoComplete: 'cc-name' })}
        {field('CPF do titular', 'cpf', { keyboardType: 'number-pad', placeholder: '000.000.000-00', maxLength: 14 })}
        <View style={styles.row}>
          {field('CEP', 'postalCode', { keyboardType: 'number-pad', placeholder: '00000-000', maxLength: 9 })}
          {field('Número', 'addressNumber', { placeholder: '123' })}
        </View>
        {field('Celular', 'phone', { keyboardType: 'phone-pad', placeholder: '(11) 99999-9999', maxLength: 15 })}
        <Text style={styles.hint}>Os dados vão direto para o provedor de pagamento. Guardamos só a bandeira e o final do cartão.</Text>
        {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
        <TouchableOpacity style={styles.cta} onPress={submit} disabled={busy} accessibilityRole="button" testID="save-card">
          {busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={styles.ctaText}>Salvar cartão</Text>}
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}
