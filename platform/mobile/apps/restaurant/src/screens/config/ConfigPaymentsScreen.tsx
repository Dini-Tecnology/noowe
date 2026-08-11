/**
 * ConfigPaymentsScreen — Payment methods & fees
 *
 * Toggle payment methods, service fee slider, tip options, split modes.
 *
 * API: PATCH /config/:id/payments
 * Access: OWNER only
 *
 * @module config/ConfigPaymentsScreen
 */

import React, { useMemo, useEffect, useCallback, useState } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Switch,
  TextInput as RNTextInput,
} from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import Slider from '@react-native-community/slider';
import { useI18n } from '@/shared/hooks/useI18n';
import { useColors } from '@/shared/contexts/ThemeContext';
import { useAuth } from '@/shared/hooks/useAuth';
import { useRestaurantConfig } from './hooks/useRestaurantConfig';
import { spacing, borderRadius } from '@/shared/theme/spacing';
import { typography } from '@/shared/theme/typography';
import type { PaymentMethod, SplitMode } from './types/config.types';

// ============================================
// OPTIONS
// ============================================

const PAYMENT_METHODS: { value: PaymentMethod; labelKey: string }[] = [
  { value: 'cash', labelKey: 'config.payments.cash' },
  { value: 'credit_card', labelKey: 'config.payments.creditCard' },
  { value: 'debit_card', labelKey: 'config.payments.debitCard' },
  { value: 'pix', labelKey: 'config.payments.pix' },
  { value: 'apple_pay', labelKey: 'config.payments.applePay' },
  { value: 'google_pay', labelKey: 'config.payments.googlePay' },
  { value: 'voucher', labelKey: 'config.payments.voucher' },
];

const SPLIT_MODES: { value: SplitMode; labelKey: string }[] = [
  { value: 'equal', labelKey: 'config.payments.splitEqual' },
  { value: 'custom', labelKey: 'config.payments.splitCustom' },
  { value: 'by_item', labelKey: 'config.payments.splitByItem' },
  { value: 'by_person', labelKey: 'config.payments.splitByPerson' },
];

// ============================================
// COMPONENT
// ============================================

export default function ConfigPaymentsScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const { user } = useAuth();

  const restaurantId = useMemo(() => {
    const roles = user?.roles || [];
    return roles.find((r) => r.restaurant_id)?.restaurant_id || '';
  }, [user]);

  const { config, isLoading, updatePayments, isSaving } = useRestaurantConfig(restaurantId);

  const [enabledMethods, setEnabledMethods] = useState<string[]>([]);
  const [serviceFeePct, setServiceFeePct] = useState(10);
  const [tipOptions, setTipOptions] = useState<number[]>([10, 12, 15]);
  const [splitModes, setSplitModes] = useState<string[]>(['equal', 'custom']);
  const [newTipValue, setNewTipValue] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (config?.payment_config) {
      setEnabledMethods(config.payment_config.enabledMethods || []);
      setServiceFeePct(config.payment_config.serviceFeePct ?? 10);
      setTipOptions(config.payment_config.tipOptions || [10, 12, 15]);
      setSplitModes(config.payment_config.splitModes || ['equal', 'custom']);
    }
  }, [config]);

  const toggleMethod = useCallback((method: string) => {
    setEnabledMethods((prev) =>
      prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method],
    );
    setIsDirty(true);
  }, []);

  const toggleSplitMode = useCallback((mode: string) => {
    setSplitModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode],
    );
    setIsDirty(true);
  }, []);

  const addTipOption = useCallback(() => {
    const val = parseInt(newTipValue, 10);
    if (isNaN(val) || val <= 0 || val > 100) return;
    if (tipOptions.includes(val)) return;
    setTipOptions((prev) => [...prev, val].sort((a, b) => a - b));
    setNewTipValue('');
    setIsDirty(true);
  }, [newTipValue, tipOptions]);

  const removeTipOption = useCallback((val: number) => {
    setTipOptions((prev) => prev.filter((v) => v !== val));
    setIsDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    try {
      await updatePayments({
        enabledMethods,
        serviceFeePct,
        tipOptions,
        splitModes,
      });
      setIsDirty(false);
      Alert.alert(t('config.saved'));
    } catch {
      Alert.alert(t('errors.generic'));
    }
  }, [enabledMethods, serviceFeePct, tipOptions, splitModes, updatePayments, t]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.backgroundSecondary },
        section: {
          backgroundColor: colors.card,
          marginHorizontal: spacing.screenHorizontal,
          marginTop: spacing[4],
          padding: spacing[4],
          borderRadius: borderRadius.card,
          borderWidth: 1,
          borderColor: colors.cardBorder,
        },
        sectionTitle: { ...typography.h3, color: colors.foreground, marginBottom: spacing[3] },
        toggleRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: spacing[2.5],
          borderBottomWidth: 1,
          borderBottomColor: colors.borderLight,
        },
        toggleLabel: { ...typography.bodyLarge, color: colors.foreground, flex: 1 },
        feeRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: spacing[2],
        },
        feeLabel: { ...typography.bodyLarge, color: colors.foreground },
        feeValue: { ...typography.h3, color: colors.primary },
        tipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginBottom: spacing[3] },
        tipChip: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing[3],
          paddingVertical: spacing[1.5],
          borderRadius: borderRadius.pill,
          backgroundColor: colors.primary,
        },
        tipChipText: { ...typography.labelMedium, color: colors.primaryForeground },
        tipRemove: { ...typography.labelMedium, color: colors.primaryForeground, marginLeft: spacing[1] },
        addTipRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
        addTipInput: {
          backgroundColor: colors.input,
          borderWidth: 1,
          borderColor: colors.inputBorder,
          borderRadius: borderRadius.input,
          paddingHorizontal: spacing[3],
          paddingVertical: spacing[2],
          color: colors.foreground,
          ...typography.bodyMedium,
          width: 80,
        },
        addTipButton: {
          backgroundColor: colors.primary,
          paddingHorizontal: spacing[3],
          paddingVertical: spacing[2],
          borderRadius: borderRadius.button,
        },
        addTipButtonText: { ...typography.labelMedium, color: colors.primaryForeground },
        checkRow: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: spacing[2],
        },
        checkbox: {
          width: 24,
          height: 24,
          borderRadius: borderRadius.xs,
          borderWidth: 2,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: spacing[3],
        },
        checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
        checkmark: { ...typography.labelSmall, color: colors.primaryForeground },
        checkLabel: { ...typography.bodyLarge, color: colors.foreground },
        saveButton: {
          backgroundColor: colors.primary,
          marginHorizontal: spacing.screenHorizontal,
          marginTop: spacing[5],
          marginBottom: spacing[10],
          paddingVertical: spacing[3],
          borderRadius: borderRadius.button,
          alignItems: 'center',
        },
        saveButtonDisabled: { opacity: 0.5 },
        saveButtonText: { ...typography.buttonLarge, color: colors.primaryForeground },
      }),
    [colors],
  );

  if (isLoading) {
    return (
      <ScreenContainer hasKeyboard>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer hasKeyboard>
    <ScrollView style={styles.container}>
      {/* Payment Methods */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('config.payments.methods')}</Text>
        {PAYMENT_METHODS.map((pm) => (
          <View key={pm.value} style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t(pm.labelKey)}</Text>
            <Switch
              value={enabledMethods.includes(pm.value)}
              onValueChange={() => toggleMethod(pm.value)}
              trackColor={{ false: colors.backgroundTertiary, true: colors.primaryLight }}
              thumbColor={enabledMethods.includes(pm.value) ? colors.primary : colors.foregroundMuted}
            />
          </View>
        ))}
      </View>

      {/* Service Fee */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('config.payments.serviceFee')}</Text>
        <View style={styles.feeRow}>
          <Text style={styles.feeLabel}>{t('config.payments.serviceFee')}</Text>
          <Text style={styles.feeValue}>{t('config.payments.serviceFeePercent', { value: serviceFeePct })}</Text>
        </View>
        <Slider
          minimumValue={0}
          maximumValue={20}
          step={1}
          value={serviceFeePct}
          onValueChange={(val) => { setServiceFeePct(val); setIsDirty(true); }}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor={colors.backgroundTertiary}
          thumbTintColor={colors.primary}
        />
      </View>

      {/* Tip Options */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('config.payments.tipOptions')}</Text>
        <View style={styles.tipsRow}>
          {tipOptions.map((tip) => (
            <TouchableOpacity
              key={tip}
              style={styles.tipChip}
              onPress={() => removeTipOption(tip)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${tip}%, ${t('config.payments.removeTipOption') || t('common.delete')}`}
            >
              <Text style={styles.tipChipText}>{tip}%</Text>
              <Text style={styles.tipRemove}>x</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.addTipRow}>
          <RNTextInput
            style={styles.addTipInput}
            value={newTipValue}
            onChangeText={setNewTipValue}
            keyboardType="numeric"
            placeholder={t('placeholders.percent')}
            placeholderTextColor={colors.inputPlaceholder}
            accessibilityLabel={t('config.payments.addTipOption')}
          />
          <TouchableOpacity style={styles.addTipButton} onPress={addTipOption} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('config.payments.addTipOption')}>
            <Text style={styles.addTipButtonText}>{t('config.payments.addTipOption')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Split Modes */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('config.payments.splitModes')}</Text>
        {SPLIT_MODES.map((mode) => (
          <TouchableOpacity
            key={mode.value}
            style={styles.checkRow}
            onPress={() => toggleSplitMode(mode.value)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t(mode.labelKey)}
            accessibilityState={{ selected: splitModes.includes(mode.value) }}
          >
            <View style={[styles.checkbox, splitModes.includes(mode.value) && styles.checkboxChecked]}>
              {splitModes.includes(mode.value) && <Text style={styles.checkmark}>{'✓'}</Text>}
            </View>
            <Text style={styles.checkLabel}>{t(mode.labelKey)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Save */}
      <TouchableOpacity
        style={[styles.saveButton, (!isDirty || isSaving) && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={!isDirty || isSaving}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('config.save')}
      >
        <Text style={styles.saveButtonText}>
          {isSaving ? t('config.saving') : t('config.save')}
        </Text>
      </TouchableOpacity>
    </ScrollView>
    </ScreenContainer>
  );
}
