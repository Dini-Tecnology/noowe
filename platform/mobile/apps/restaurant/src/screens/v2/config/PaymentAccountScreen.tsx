import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { Landmark } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { useRestaurantRole } from '../../../contexts/RestaurantRoleContext';
import { V2Shell } from '../shared/V2Shell';
import { ConfigSectionCard } from './ConfigSectionCard';

type CompanyType = 'MEI' | 'LIMITED' | 'INDIVIDUAL' | 'ASSOCIATION';
type AccountStatus = 'none' | 'creating' | 'pending_kyc' | 'active' | 'rejected' | 'disabled';

interface AccountView {
  status: AccountStatus;
  onboardingUrl: string | null;
  stale?: boolean;
}

const COMPANY_TYPES: { value: CompanyType; label: string }[] = [
  { value: 'MEI', label: 'MEI' },
  { value: 'LIMITED', label: 'Limitada' },
  { value: 'INDIVIDUAL', label: 'Individual' },
  { value: 'ASSOCIATION', label: 'Associação' },
];

const EMPTY_FORM = {
  name: '', email: '', cnpj: '', mobilePhone: '', income: '',
  address: '', addressNumber: '', province: '', postalCode: '',
};
type FormKey = keyof typeof EMPTY_FORM;

const FIELDS: { key: FormKey; label: string; keyboard?: 'email-address' | 'number-pad' | 'phone-pad' }[] = [
  { key: 'name', label: 'Razão social' },
  { key: 'cnpj', label: 'CNPJ', keyboard: 'number-pad' },
  { key: 'email', label: 'E-mail da conta', keyboard: 'email-address' },
  { key: 'mobilePhone', label: 'Celular com DDD', keyboard: 'phone-pad' },
  { key: 'income', label: 'Faturamento mensal (R$)', keyboard: 'number-pad' },
  { key: 'postalCode', label: 'CEP', keyboard: 'number-pad' },
  { key: 'address', label: 'Endereço' },
  { key: 'addressNumber', label: 'Número' },
  { key: 'province', label: 'Bairro' },
];

const STATUS_COPY: Record<Exclude<AccountStatus, 'none' | 'creating'>, { title: string; body: string }> = {
  pending_kyc: {
    title: 'Aguardando aprovação',
    body: 'O Asaas precisa analisar os documentos. A análise pode levar até 48 horas depois do envio. Até lá, o cliente não paga pelo app.',
  },
  active: { title: 'Pagamento online ativo', body: 'Os clientes já podem pagar pelo app, e o dinheiro entra na conta do restaurante.' },
  rejected: { title: 'Cadastro reprovado', body: 'O Asaas reprovou o cadastro. Envie os documentos de novo pelo link ou fale com o suporte da NOOWE.' },
  disabled: { title: 'Conta desativada', body: 'Fale com o suporte da NOOWE para reativar o recebimento.' },
};

const ERROR_COPY: Record<string, string> = {
  forbidden: 'Só o dono do restaurante pode cadastrar a conta de recebimento.',
  invalid_request: 'Confira os campos do formulário.',
  payments_not_configured: 'O recebimento online ainda não foi liberado pela NOOWE. Fale com o suporte.',
  provider_account_exists: 'Este CNPJ já tem uma conta no Asaas. Fale com o suporte da NOOWE para vinculá-la.',
  provider_unavailable: 'O Asaas não respondeu. Tente de novo em alguns minutos.',
  account_attach_failed: 'A conta foi criada, mas não conseguimos salvá-la. Não tente de novo: fale com o suporte da NOOWE.',
};

function errorMessage(err: unknown): string {
  const failure = err as { code?: string; providerMessage?: string | null };
  if (failure.code === 'provider_rejected' && failure.providerMessage) return failure.providerMessage;
  return (failure.code && ERROR_COPY[failure.code]) || 'Não foi possível concluir agora. Tente de novo.';
}

export default function PaymentAccountScreen() {
  const colors = useColors();
  const { restaurantId, serverRole } = useRestaurantRole();
  const isOwner = serverRole === 'owner';
  const [account, setAccount] = useState<AccountView | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [companyType, setCompanyType] = useState<CompanyType>('LIMITED');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    setError(null);
    try {
      setAccount(await supabaseApiAdapter.getPaymentAccount(restaurantId));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = useCallback(async () => {
    if (!restaurantId || submitting) return;
    const income = form.income.replace(/\D/g, '');
    if (FIELDS.some(({ key }) => !form[key].trim()) || !income) {
      setError('Preencha todos os campos.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { income: _income, ...fields } = form;
      setAccount(await supabaseApiAdapter.startPaymentAccount(restaurantId, {
        ...fields,
        companyType,
        // Reais inteiros digitados viram centavos aqui, na borda da UI.
        incomeCents: Number(income) * 100,
      }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }, [companyType, form, restaurantId, submitting]);

  const showForm = account?.status === 'none' || account?.status === 'creating';
  const copy = account && !showForm ? STATUS_COPY[account.status as keyof typeof STATUS_COPY] : null;

  return (
    <V2Shell title="Conta de recebimento" subtitle="Asaas" showBack onRefresh={load}>
      {loading ? (
        <ActivityIndicator testID="payment-account-loading" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          {error ? <Text testID="payment-account-error" style={[styles.error, { color: colors.error }]}>{error}</Text> : null}

          {copy ? (
            <ConfigSectionCard title={copy.title} Icon={Landmark}>
              <View style={styles.body}>
                <Text style={{ color: colors.foregroundSecondary }}>{copy.body}</Text>
                {account?.stale ? (
                  <Text style={{ color: colors.foregroundSecondary }}>Não conseguimos consultar o Asaas agora. Esta pode não ser a situação mais recente.</Text>
                ) : null}
                {account?.onboardingUrl ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={[styles.button, { backgroundColor: colors.primary }]}
                    onPress={() => void WebBrowser.openBrowserAsync(account.onboardingUrl as string)}
                  >
                    <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Enviar documentos</Text>
                  </TouchableOpacity>
                ) : null}
                {account?.status !== 'active' ? (
                  <TouchableOpacity accessibilityRole="button" style={[styles.button, { borderColor: colors.border, borderWidth: 1 }]} onPress={() => void load()}>
                    <Text style={[styles.buttonText, { color: colors.foreground }]}>Atualizar situação</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </ConfigSectionCard>
          ) : null}

          {showForm && !isOwner ? (
            <ConfigSectionCard title="Sem conta de recebimento" Icon={Landmark}>
              <View style={styles.body}>
                <Text style={{ color: colors.foregroundSecondary }}>Só o dono do restaurante pode cadastrar a conta. Até lá, o cliente não paga pelo app.</Text>
              </View>
            </ConfigSectionCard>
          ) : null}

          {showForm && isOwner ? (
            <ConfigSectionCard title="Dados do restaurante" Icon={Landmark}>
              <View style={styles.body}>
                <Text style={{ color: colors.foregroundSecondary }}>Estes dados vão para o Asaas, que abre a conta em que o restaurante recebe.</Text>
                <View style={styles.chips}>
                  {COMPANY_TYPES.map((type) => {
                    const selected = type.value === companyType;
                    return (
                      <TouchableOpacity
                        key={type.value}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => setCompanyType(type.value)}
                        style={[styles.chip, { borderColor: selected ? colors.primary : colors.border }]}
                      >
                        <Text style={{ color: selected ? colors.primary : colors.foreground }}>{type.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {FIELDS.map((field) => (
                  <View key={field.key} style={styles.field}>
                    <Text style={[styles.label, { color: colors.foregroundSecondary }]}>{field.label}</Text>
                    <TextInput
                      accessibilityLabel={field.label}
                      value={form[field.key]}
                      onChangeText={(value) => setForm((current) => ({ ...current, [field.key]: value }))}
                      keyboardType={field.keyboard}
                      autoCapitalize={field.keyboard === 'email-address' ? 'none' : undefined}
                      style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                    />
                  </View>
                ))}
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={submitting}
                  style={[styles.button, { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }]}
                  onPress={() => void submit()}
                >
                  {submitting ? <ActivityIndicator color={colors.primaryForeground} /> : (
                    <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Cadastrar conta</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ConfigSectionCard>
          ) : null}
        </>
      )}
    </V2Shell>
  );
}

const styles = StyleSheet.create({
  body: { padding: 14, gap: 12 },
  error: { fontSize: 13, marginBottom: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  field: { gap: 4 },
  label: { fontSize: 12, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  button: { borderRadius: 12, minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { fontSize: 14, fontWeight: '700' },
});
