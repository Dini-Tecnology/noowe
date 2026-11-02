import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { AlertTriangle, ChevronRight, FileText, KeyRound, Receipt } from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter, type FiscalConfigView } from '@okinawa/shared/services/supabase-api';
import { fiscalConfigSchema, validateForm } from '@okinawa/shared/validation/schemas';
import { userErrorMessage } from '@okinawa/shared/utils/user-error-message';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';
import { V2Shell } from '../v2/shared/V2Shell';
import { ConfigSectionCard } from '../v2/config/ConfigSectionCard';

const EMPTY_FORM = {
  cnpj: '', ie: '', razaoSocial: '', nomeFantasia: '', stateCode: '', regimeTributario: 'simples_nacional',
  ncm: '', cfop: '', icmsOrigem: '', icmsSituacao: '', pisSituacao: '', cofinsSituacao: '',
};
type FormKey = keyof typeof EMPTY_FORM;

const COMPANY_FIELDS: { key: FormKey; label: string; numeric?: boolean; maxLength?: number; uppercase?: boolean }[] = [
  { key: 'cnpj', label: 'CNPJ', numeric: true, maxLength: 18 },
  { key: 'razaoSocial', label: 'Razão social' },
  { key: 'nomeFantasia', label: 'Nome fantasia (opcional)' },
  { key: 'ie', label: 'Inscrição estadual (opcional)', maxLength: 15 },
  { key: 'stateCode', label: 'UF', maxLength: 2, uppercase: true },
];

// Nenhum campo vem preenchido: quem define a tributação é o contador do restaurante (ADR-030).
const TAX_FIELDS: { key: FormKey; label: string; maxLength: number }[] = [
  { key: 'ncm', label: 'NCM padrão', maxLength: 8 },
  { key: 'cfop', label: 'CFOP padrão', maxLength: 4 },
  { key: 'icmsOrigem', label: 'Origem do ICMS', maxLength: 1 },
  { key: 'icmsSituacao', label: 'Situação tributária do ICMS', maxLength: 3 },
  { key: 'pisSituacao', label: 'Situação tributária do PIS', maxLength: 2 },
  { key: 'cofinsSituacao', label: 'Situação tributária do COFINS', maxLength: 2 },
];

const REGIMES = [
  { value: 'simples_nacional', label: 'Simples Nacional' },
  { value: 'lucro_presumido', label: 'Lucro Presumido' },
  { value: 'lucro_real', label: 'Lucro Real' },
];

function formFromConfig(config: FiscalConfigView): typeof EMPTY_FORM {
  const tax = config.taxDefaults ?? {};
  return {
    cnpj: config.cnpj ?? '', ie: config.ie ?? '', razaoSocial: config.razaoSocial ?? '', nomeFantasia: config.nomeFantasia ?? '',
    stateCode: config.stateCode ?? '', regimeTributario: config.regimeTributario ?? 'simples_nacional',
    ncm: tax.ncm ?? '', cfop: tax.cfop ?? '', icmsOrigem: tax.icms_origem ?? '', icmsSituacao: tax.icms_situacao_tributaria ?? '',
    pisSituacao: tax.pis_situacao_tributaria ?? '', cofinsSituacao: tax.cofins_situacao_tributaria ?? '',
  };
}

export default function FiscalSetupScreen() {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const { restaurantId } = useRestaurantRole();
  const [config, setConfig] = useState<FiscalConfigView | null>(null);
  const [openIssues, setOpenIssues] = useState(0);
  const [form, setForm] = useState(EMPTY_FORM);
  const [serviceFeeInDocument, setServiceFeeInDocument] = useState(false);
  // O token só existe aqui enquanto é digitado: o servidor nunca o devolve.
  const [focusToken, setFocusToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await supabaseApiAdapter.getFiscalConfig(restaurantId);
      setOpenIssues(result.openIssues);
      setConfig(result.config);
      if (result.config) {
        setForm(formFromConfig(result.config));
        setServiceFeeInDocument(result.config.serviceFeeInDocument);
      }
    } catch (err) {
      setError(userErrorMessage(err, 'Não foi possível carregar o cadastro fiscal.'));
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    void load();
    const unsubscribe = navigation.addListener?.('focus', () => {
      if (!restaurantId) return;
      supabaseApiAdapter.getFiscalConfig(restaurantId).then((result) => setOpenIssues(result.openIssues)).catch(() => undefined);
    });
    return typeof unsubscribe === 'function' ? unsubscribe : undefined;
  }, [load, navigation, restaurantId]);

  const save = useCallback(async () => {
    if (!restaurantId || saving) return;
    setSaved(false);
    const result = validateForm(fiscalConfigSchema, { ...form, ie: form.ie || undefined, nomeFantasia: form.nomeFantasia || undefined });
    if (!result.success) {
      setError(Object.values(result.errors)[0]);
      return;
    }
    if (!focusToken.trim() && !config?.hasToken) {
      setError('Informe o token da Focus NFe.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const next = await supabaseApiAdapter.saveFiscalConfig(restaurantId, {
        cnpj: form.cnpj, ie: form.ie, razaoSocial: form.razaoSocial, nomeFantasia: form.nomeFantasia,
        stateCode: form.stateCode, regimeTributario: form.regimeTributario, serviceFeeInDocument,
        taxDefaults: {
          ncm: form.ncm, cfop: form.cfop, icms_origem: form.icmsOrigem, icms_situacao_tributaria: form.icmsSituacao,
          pis_situacao_tributaria: form.pisSituacao, cofins_situacao_tributaria: form.cofinsSituacao,
        },
      }, focusToken);
      setConfig(next);
      setFocusToken('');
      setSaved(true);
    } catch (err) {
      setError(userErrorMessage(err, 'Não foi possível salvar o cadastro fiscal. Tente de novo.'));
    } finally {
      setSaving(false);
    }
  }, [config?.hasToken, focusToken, form, restaurantId, saving, serviceFeeInDocument]);

  const renderField = (field: { key: FormKey; label: string; numeric?: boolean; maxLength?: number; uppercase?: boolean }) => (
    <View key={field.key} style={styles.field}>
      <Text style={[styles.label, { color: colors.foregroundSecondary }]}>{field.label}</Text>
      <TextInput
        accessibilityLabel={field.label}
        value={form[field.key]}
        onChangeText={(value) => setForm((current) => ({ ...current, [field.key]: field.uppercase ? value.toUpperCase() : value }))}
        keyboardType={field.numeric ? 'number-pad' : undefined}
        maxLength={field.maxLength}
        autoCapitalize={field.uppercase ? 'characters' : undefined}
        style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
      />
    </View>
  );

  const isHomologation = (config?.environment ?? 'homologation') === 'homologation';

  return (
    <V2Shell title="Fiscal" subtitle="NFC-e pela Focus NFe" showBack onRefresh={load}>
      {loading ? (
        <ActivityIndicator testID="fiscal-setup-loading" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.85}
            onPress={() => navigation.navigate('FiscalDocuments')}
            style={[styles.issuesRow, { borderColor: openIssues > 0 ? colors.warning : colors.border, backgroundColor: colors.card }]}
          >
            <AlertTriangle size={18} color={openIssues > 0 ? colors.warning : colors.foregroundSecondary} />
            <Text testID="fiscal-open-issues" style={[styles.issuesText, { color: colors.foreground }]}>
              {openIssues > 0 ? `Notas com problema (${openIssues})` : 'Nenhuma nota com problema'}
            </Text>
            <ChevronRight size={18} color={colors.foregroundSecondary} />
          </TouchableOpacity>

          <ConfigSectionCard title={isHomologation ? 'Ambiente: homologação' : 'Ambiente: produção'} Icon={FileText}>
            <View style={styles.body}>
              <Text style={{ color: colors.foregroundSecondary }}>
                {isHomologation
                  ? 'As notas são de teste e não têm valor fiscal. A NOOWE muda para produção depois da validação com a contabilidade.'
                  : 'As notas emitidas têm valor fiscal.'}
              </Text>
              <Text style={{ color: colors.foregroundSecondary }}>
                Certificado A1 e CSC são cadastrados no painel da Focus NFe, não aqui.
              </Text>
            </View>
          </ConfigSectionCard>

          <ConfigSectionCard title="Dados da empresa" Icon={Receipt}>
            <View style={styles.body}>
              {COMPANY_FIELDS.map(renderField)}
              <Text style={[styles.label, { color: colors.foregroundSecondary }]}>Regime tributário</Text>
              <View style={styles.chips}>
                {REGIMES.map((regime) => {
                  const selected = regime.value === form.regimeTributario;
                  return (
                    <TouchableOpacity
                      key={regime.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setForm((current) => ({ ...current, regimeTributario: regime.value }))}
                      style={[styles.chip, { borderColor: selected ? colors.primary : colors.border }]}
                    >
                      <Text style={{ color: selected ? colors.primary : colors.foreground }}>{regime.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </ConfigSectionCard>

          <ConfigSectionCard title="Tributação padrão" Icon={FileText}>
            <View style={styles.body}>
              <Text style={{ color: colors.foregroundSecondary }}>
                Peça estes códigos ao contador. Valem para os itens do cardápio sem NCM ou CFOP próprios.
              </Text>
              {TAX_FIELDS.map((field) => renderField({ ...field, numeric: true }))}
              <View style={styles.switchRow}>
                <Text style={[styles.switchText, { color: colors.foreground }]}>Incluir a taxa de serviço na nota</Text>
                <Switch
                  accessibilityLabel="Incluir a taxa de serviço na nota"
                  value={serviceFeeInDocument}
                  onValueChange={setServiceFeeInDocument}
                />
              </View>
            </View>
          </ConfigSectionCard>

          <ConfigSectionCard title="Token da Focus NFe" Icon={KeyRound}>
            <View style={styles.body}>
              <Text testID="fiscal-token-status" style={{ color: colors.foregroundSecondary }}>
                {config?.hasToken
                  ? 'Já existe um token guardado. Ele não aparece aqui. Preencha só para trocar.'
                  : 'O token fica guardado no cofre da NOOWE e não aparece de novo neste app.'}
              </Text>
              <TextInput
                accessibilityLabel="Token da Focus NFe"
                value={focusToken}
                onChangeText={setFocusToken}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={config?.hasToken ? 'Deixe em branco para manter' : 'Token de homologação'}
                placeholderTextColor={colors.foregroundMuted}
                style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
              />
            </View>
          </ConfigSectionCard>

          {error ? <Text testID="fiscal-setup-error" style={[styles.message, { color: colors.error }]}>{error}</Text> : null}
          {saved ? (
            <Text testID="fiscal-setup-saved" style={[styles.message, { color: colors.success }]}>
              {openIssues > 0
                ? 'Cadastro salvo. As notas com problema não voltam sozinhas: reenvie cada uma na lista.'
                : 'Cadastro salvo.'}
            </Text>
          ) : null}

          <TouchableOpacity
            accessibilityRole="button"
            disabled={saving}
            style={[styles.button, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
            onPress={() => void save()}
          >
            {saving ? <ActivityIndicator color={colors.primaryForeground} /> : (
              <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Salvar cadastro</Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </V2Shell>
  );
}

const styles = StyleSheet.create({
  body: { padding: 14, gap: 12 },
  message: { fontSize: 13, marginBottom: 12 },
  issuesRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 16 },
  issuesText: { flex: 1, fontSize: 14, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  field: { gap: 4 },
  label: { fontSize: 12, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  switchText: { flex: 1, fontSize: 14 },
  button: { borderRadius: 12, minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { fontSize: 14, fontWeight: '700' },
});
