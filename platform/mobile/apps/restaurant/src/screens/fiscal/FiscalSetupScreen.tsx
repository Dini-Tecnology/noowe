/**
 * FiscalSetupScreen - Fiscal Configuration (NFC-e) Setup
 *
 * Allows restaurant owners to configure fiscal emission:
 * - CNPJ, IE, tax regime
 * - CSC ID and token (from SEFAZ portal)
 * - Certificate upload (.pfx) placeholder
 * - Auto-emit toggle
 *
 * @module restaurant/screens/fiscal
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import {
  Text,
  Button,
  TextInput,
  Switch,
  ActivityIndicator,
  Divider,
  HelperText,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { useI18n } from '@/shared/hooks/useI18n';
import { useRestaurant } from '@/shared/contexts/RestaurantContext';
import ApiService from '@/shared/services/api';
import { Card } from '@okinawa/shared/components';
import * as Haptics from 'expo-haptics';
import { fiscalConfigSchema, validateForm } from '@okinawa/shared/validation/schemas';

interface FiscalConfigData {
  cnpj: string;
  ie: string;
  razaoSocial: string;
  nomeFantasia: string;
  stateCode: string;
  regimeTributario: string;
  cscId: string;
  cscToken: string;
  autoEmit: boolean;
  certificateUploaded: boolean;
  isActive: boolean;
}

const formatCNPJ = (text: string): string => {
  const cleaned = text.replace(/\D/g, '').slice(0, 14);
  return cleaned
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5');
};

const REGIME_OPTIONS = [
  { value: 'simples_nacional', label: 'Simples Nacional' },
  { value: 'lucro_presumido', label: 'Lucro Presumido' },
  { value: 'lucro_real', label: 'Lucro Real' },
];

export default function FiscalSetupScreen() {
  const colors = useColors();
  const { t } = useI18n();
  const { restaurant } = useRestaurant();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<FiscalConfigData>({
    cnpj: '',
    ie: '',
    razaoSocial: '',
    nomeFantasia: '',
    stateCode: '',
    regimeTributario: 'simples_nacional',
    cscId: '',
    cscToken: '',
    autoEmit: true,
    certificateUploaded: false,
    isActive: false,
  });
  const [selectedRegimeIndex, setSelectedRegimeIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = useCallback(async () => {
    if (!restaurant?.id) return;
    setLoading(true);
    setError(null);
    try {
      const response = await ApiService.get(
        `/fiscal/config?restaurant_id=${restaurant.id}`,
      );
      if (response.data) {
        const data = response.data;
        setConfig({
          cnpj: data.cnpj || '',
          ie: data.ie || '',
          razaoSocial: data.razao_social || '',
          nomeFantasia: data.nome_fantasia || '',
          stateCode: data.state_code || '',
          regimeTributario: data.regime_tributario || 'simples_nacional',
          cscId: data.csc_id || '',
          cscToken: data.csc_token || '',
          autoEmit: data.auto_emit ?? true,
          certificateUploaded: data.certificate_uploaded ?? false,
          isActive: data.is_active ?? false,
        });
        const regimeIdx = REGIME_OPTIONS.findIndex(
          (r) => r.value === data.regime_tributario,
        );
        if (regimeIdx >= 0) setSelectedRegimeIndex(regimeIdx);
      }
    } catch {
      // Config may not exist yet -- that's fine
    } finally {
      setLoading(false);
    }
  }, [restaurant?.id]);

  const handleSave = useCallback(async () => {
    if (!restaurant?.id) return;

    const result = validateForm(fiscalConfigSchema, {
      cnpj: config.cnpj,
      ie: config.ie || undefined,
      razaoSocial: config.razaoSocial,
      nomeFantasia: config.nomeFantasia || undefined,
      stateCode: config.stateCode,
      regimeTributario: config.regimeTributario,
    });

    if (!result.success) {
      Alert.alert(t('common.error'), Object.values(result.errors)[0]);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await ApiService.post('/fiscal/config', {
        restaurantId: restaurant.id,
        cnpj: config.cnpj,
        ie: config.ie,
        razaoSocial: config.razaoSocial,
        nomeFantasia: config.nomeFantasia,
        stateCode: config.stateCode,
        endereco: {},
        regimeTributario: config.regimeTributario,
        taxDefaults: {
          cfop: '5102',
          ncm_default: '00000000',
          icms_csosn: '102',
          pis_cst: '99',
          cofins_cst: '99',
          pis_aliquota: 0,
          cofins_aliquota: 0,
        },
        cscId: config.cscId,
        cscToken: config.cscToken,
        autoEmit: config.autoEmit,
        fiscalProvider: 'focus_nfe',
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        t('common.success'),
        t('financial.fiscal.setup.save'),
      );
    } catch (err: any) {
      setError(err.message || t('common.error'));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  }, [config, restaurant?.id, t]);

  const handleCertificateUpload = useCallback(() => {
    // [PLACEHOLDER] In production, use DocumentPicker to select .pfx file
    Alert.alert(
      t('financial.fiscal.setup.certificate'),
      'Certificate upload will be available in production. ' +
        'Select a .pfx file and enter the password.',
      [{ text: t('common.ok') }],
    );
  }, [t]);

  const updateField = useCallback(
    (field: keyof FiscalConfigData, value: string | boolean) => {
      setConfig((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  if (loading) {
    return (
      <ScreenContainer hasKeyboard>
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.foregroundSecondary }]}>
          {t('common.loading')}
        </Text>
      </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer hasKeyboard>
    <View style={{ flex: 1, backgroundColor: colors.background }} accessibilityLabel="Fiscal setup">
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Icon
            name="file-document-outline"
            size={28}
            color={colors.primary}
          />
          <Text
            style={[styles.title, { color: colors.foreground }]}
            variant="headlineSmall"
          >
            {t('financial.fiscal.setup.title')}
          </Text>
        </View>

        {/* Company Data */}
        <Card style={[styles.card, { backgroundColor: colors.card }]}>
          <Text
            style={[styles.sectionTitle, { color: colors.foreground }]}
            variant="titleMedium"
          >
            Dados da Empresa
          </Text>

          <TextInput
            label={t('financial.fiscal.setup.cnpj')}
            value={formatCNPJ(config.cnpj)}
            onChangeText={(v) => updateField('cnpj', v.replace(/\D/g, '').slice(0, 14))}
            mode="outlined"
            keyboardType="numeric"
            maxLength={18}
            style={styles.input}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
          />

          <TextInput
            label={t('financial.fiscal.setup.ie')}
            value={config.ie}
            onChangeText={(v) => updateField('ie', v)}
            mode="outlined"
            style={styles.input}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
          />

          <TextInput
            label={t('formLabels.razaoSocial')}
            value={config.razaoSocial}
            onChangeText={(v) => updateField('razaoSocial', v)}
            mode="outlined"
            style={styles.input}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
          />

          <TextInput
            label={t('formLabels.nomeFantasia')}
            value={config.nomeFantasia}
            onChangeText={(v) => updateField('nomeFantasia', v)}
            mode="outlined"
            style={styles.input}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
          />

          <TextInput
            label={t('formLabels.stateCode')}
            value={config.stateCode}
            onChangeText={(v) =>
              updateField('stateCode', v.toUpperCase().substring(0, 2))
            }
            mode="outlined"
            maxLength={2}
            style={styles.input}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
          />
        </Card>

        {/* Tax Regime */}
        <Card style={[styles.card, { backgroundColor: colors.card }]}>
          <Text
            style={[styles.sectionTitle, { color: colors.foreground }]}
            variant="titleMedium"
          >
            {t('financial.fiscal.setup.regime')}
          </Text>

          {REGIME_OPTIONS.map((option, index) => (
            <Button
              key={option.value}
              mode={
                selectedRegimeIndex === index ? 'contained' : 'outlined'
              }
              onPress={() => {
                setSelectedRegimeIndex(index);
                updateField('regimeTributario', option.value);
                Haptics.selectionAsync();
              }}
              style={styles.regimeButton}
              buttonColor={
                selectedRegimeIndex === index ? colors.primary : undefined
              }
              textColor={
                selectedRegimeIndex === index
                  ? colors.premiumCardForeground
                  : colors.foreground
              }
            >
              {option.label}
            </Button>
          ))}
        </Card>

        {/* CSC */}
        <Card style={[styles.card, { backgroundColor: colors.card }]}>
          <Text
            style={[styles.sectionTitle, { color: colors.foreground }]}
            variant="titleMedium"
          >
            CSC (SEFAZ)
          </Text>

          <TextInput
            label={t('financial.fiscal.setup.csc_id')}
            value={config.cscId}
            onChangeText={(v) => updateField('cscId', v)}
            mode="outlined"
            style={styles.input}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
          />

          <TextInput
            label={t('financial.fiscal.setup.csc_token')}
            value={config.cscToken}
            onChangeText={(v) => updateField('cscToken', v)}
            mode="outlined"
            secureTextEntry
            style={styles.input}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
          />

          <HelperText type="info" visible>
            {t('financial.fiscal.setup.help_csc')}
          </HelperText>
        </Card>

        {/* Certificate */}
        <Card style={[styles.card, { backgroundColor: colors.card }]}>
          <Text
            style={[styles.sectionTitle, { color: colors.foreground }]}
            variant="titleMedium"
          >
            {t('financial.fiscal.setup.certificate')}
          </Text>

          <View style={styles.certRow}>
            <Icon
              name={
                config.certificateUploaded
                  ? 'check-circle'
                  : 'file-certificate-outline'
              }
              size={24}
              color={
                config.certificateUploaded
                  ? colors.success
                  : colors.foregroundSecondary
              }
            />
            <Text
              style={[
                styles.certStatus,
                {
                  color: config.certificateUploaded
                    ? colors.success
                    : colors.foregroundSecondary,
                },
              ]}
            >
              {config.certificateUploaded
                ? t('financial.fiscal.setup.cert_uploaded')
                : 'Nenhum certificado enviado'}
            </Text>
          </View>

          <Button
            mode="outlined"
            onPress={handleCertificateUpload}
            icon="upload"
            style={styles.uploadButton}
            textColor={colors.primary}
          >
            {t('financial.fiscal.setup.upload_cert')}
          </Button>
        </Card>

        {/* Auto-emit */}
        <Card style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.switchRow}>
            <View style={styles.switchLabel}>
              <Icon
                name="lightning-bolt"
                size={20}
                color={colors.primary}
              />
              <Text style={[styles.switchText, { color: colors.foreground }]}>
                {t('financial.fiscal.setup.auto_emit')}
              </Text>
            </View>
            <Switch
              value={config.autoEmit}
              onValueChange={(v) => {
                updateField('autoEmit', v);
                Haptics.selectionAsync();
              }}
              color={colors.primary}
            />
          </View>
        </Card>

        {/* Error */}
        {error && (
          <Text style={[styles.errorText, { color: colors.destructive }]}>
            {error}
          </Text>
        )}

        {/* Save Button */}
        <Button
          mode="contained"
          onPress={handleSave}
          loading={saving}
          disabled={saving}
          style={[styles.saveButton, { backgroundColor: colors.primary }]}
          labelStyle={styles.saveLabel}
          icon="content-save"
        >
          {t('financial.fiscal.setup.save')}
        </Button>

        <Divider style={styles.divider} />

        {/* Help Section */}
        <View style={styles.helpSection}>
          <Icon
            name="information-outline"
            size={20}
            color={colors.info}
          />
          <Text
            style={[styles.helpText, { color: colors.foregroundSecondary }]}
          >
            {t('financial.fiscal.setup.help_csc')}
            {'. '}
            Seu contador pode ajudar com esse processo.
          </Text>
        </View>
      </ScrollView>
    </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  title: {
    fontWeight: '700',
  },
  card: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    fontWeight: '600',
    marginBottom: 12,
  },
  input: {
    marginBottom: 12,
  },
  regimeButton: {
    marginBottom: 8,
  },
  certRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  certStatus: {
    fontSize: 14,
  },
  uploadButton: {
    marginTop: 4,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  switchText: {
    fontSize: 16,
  },
  errorText: {
    textAlign: 'center',
    marginBottom: 12,
    fontSize: 14,
  },
  saveButton: {
    marginTop: 8,
    paddingVertical: 6,
    borderRadius: 12,
  },
  saveLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    marginVertical: 20,
  },
  helpSection: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 4,
  },
  helpText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
  },
});
