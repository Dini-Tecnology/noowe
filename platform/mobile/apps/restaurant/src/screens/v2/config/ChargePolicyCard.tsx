import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from 'react-native-paper';
import { Percent } from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { userErrorMessage } from '@okinawa/shared/utils/user-error-message';
import { ConfigSectionCard } from './ConfigSectionCard';
import {
  bpsFromPercent, parseChargePolicies, parsePresets, percentFromBps, presetsText, SERVICE_LABELS, SPLIT_LABELS, toggleSplitMode, type ChargePolicy,
} from './chargePolicy';

/** Dono e Gerente escolhem, por tipo de serviço, taxa de serviço ou gorjeta. Nunca as duas na mesma conta. */
export function ChargePolicyCard({ restaurantId }: { restaurantId: string | null | undefined }) {
  const colors = useColors();
  const [policies, setPolicies] = useState<ChargePolicy[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    try {
      setPolicies(parseChargePolicies(await supabaseApiAdapter.getChargePolicies(restaurantId)));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [restaurantId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <ConfigSectionCard title="Taxa ou gorjeta" Icon={Percent}>
      {failed ? (
        <Pressable accessibilityRole="button" onPress={() => void load()}>
          <Text style={{ color: colors.foregroundSecondary }}>Não foi possível carregar. Toque para tentar de novo.</Text>
        </Pressable>
      ) : !policies ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        policies.map((policy) => (
          <ServicePolicy key={policy.serviceModel} restaurantId={restaurantId!} policy={policy} onSaved={load} />
        ))
      )}
    </ConfigSectionCard>
  );
}

function ServicePolicy({ restaurantId, policy, onSaved }: { restaurantId: string; policy: ChargePolicy; onSaved: () => Promise<void> }) {
  const colors = useColors();
  const [mode, setMode] = useState(policy.feeOrTipMode);
  const [feeText, setFeeText] = useState(String(percentFromBps(policy.serviceFeeBps)));
  const [tipsText, setTipsText] = useState(presetsText(policy.tipPresetsBps));
  const [tipDefault, setTipDefault] = useState(policy.tipDefaultBps);
  const [splitModes, setSplitModes] = useState(policy.splitModes);
  const [saving, setSaving] = useState(false);
  const presets = parsePresets(tipsText);
  const activeDefault = tipDefault !== null && presets.includes(tipDefault) ? tipDefault : null;

  const save = async () => {
    const feePercent = Number(feeText.replace(',', '.'));
    if (mode === 'service_fee' && (!Number.isFinite(feePercent) || feePercent < 0 || feePercent > 100)) {
      Alert.alert('Taxa inválida', 'Informe um percentual entre 0 e 100.');
      return;
    }
    setSaving(true);
    try {
      await supabaseApiAdapter.updateChargePolicy(restaurantId, policy.serviceModel, {
        feeOrTipMode: mode,
        serviceFeeBps: mode === 'service_fee' ? bpsFromPercent(feePercent) : policy.serviceFeeBps,
        tipPresetsBps: presets,
        tipDefaultBps: policy.prepaid ? null : activeDefault,
        splitModes: policy.prepaid ? null : splitModes,
      });
      await onSaved();
      Alert.alert('Salvo', `${SERVICE_LABELS[policy.serviceModel] ?? policy.serviceModel} atualizado.`);
    } catch (err) {
      Alert.alert('Não foi possível salvar', userErrorMessage(err, 'Tente novamente.'));
    } finally {
      setSaving(false);
    }
  };

  const chip = (selected: boolean) => [
    styles.chip,
    { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? `${colors.primary}18` : colors.card },
  ];
  const chipText = (selected: boolean) => ({ fontSize: 13, fontWeight: '700' as const, color: selected ? colors.primary : colors.foreground });

  return (
    <View style={[styles.block, { borderBottomColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>{SERVICE_LABELS[policy.serviceModel] ?? policy.serviceModel}</Text>
      {policy.prepaid ? (
        <Text style={[styles.hint, { color: colors.foregroundSecondary }]}>Pedido pago antes do preparo: só gorjeta opcional, sem nada marcado.</Text>
      ) : (
        <View style={styles.row}>
          {([['service_fee', 'Taxa de serviço'], ['tip', 'Gorjeta']] as const).map(([value, label]) => (
            <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: mode === value }} onPress={() => setMode(value)} style={chip(mode === value)}>
              <Text style={chipText(mode === value)}>{label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {mode === 'service_fee' ? (
        <>
          <Text style={[styles.label, { color: colors.foregroundSecondary }]}>Percentual da taxa</Text>
          <TextInput
            value={feeText}
            onChangeText={setFeeText}
            keyboardType="decimal-pad"
            accessibilityLabel={`Percentual da taxa, ${SERVICE_LABELS[policy.serviceModel] ?? policy.serviceModel}`}
            style={[styles.input, { color: colors.foreground, backgroundColor: colors.backgroundTertiary }]}
          />
          <Text style={[styles.hint, { color: colors.foregroundSecondary }]}>O cliente pode retirar a taxa da própria parte. Fica registrado.</Text>
        </>
      ) : (
        <>
          <Text style={[styles.label, { color: colors.foregroundSecondary }]}>Sugestões de gorjeta (%)</Text>
          <TextInput
            value={tipsText}
            onChangeText={setTipsText}
            placeholder="10, 15, 20"
            placeholderTextColor={colors.foregroundMuted}
            accessibilityLabel={`Sugestões de gorjeta, ${SERVICE_LABELS[policy.serviceModel] ?? policy.serviceModel}`}
            style={[styles.input, { color: colors.foreground, backgroundColor: colors.backgroundTertiary }]}
          />
          {!policy.prepaid && (
            <>
              <Text style={[styles.label, { color: colors.foregroundSecondary }]}>Já vem marcada</Text>
              <View style={styles.row}>
                {[null, ...presets].map((bps) => (
                  <Pressable key={bps ?? 'nenhuma'} accessibilityRole="button" accessibilityState={{ selected: activeDefault === bps }} onPress={() => setTipDefault(bps)} style={chip(activeDefault === bps)}>
                    <Text style={chipText(activeDefault === bps)}>{bps ? `${percentFromBps(bps)}%` : 'Nenhuma'}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </>
      )}

      {!policy.prepaid && (
        <>
          <Text style={[styles.label, { color: colors.foregroundSecondary }]}>Formas de dividir a conta</Text>
          <View style={styles.row}>
            {SPLIT_LABELS.map((item) => {
              const selected = splitModes.includes(item.mode);
              return (
                <Pressable key={item.mode} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => setSplitModes(toggleSplitMode(splitModes, item.mode))} style={chip(selected)}>
                  <Text style={chipText(selected)}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      <Pressable
        accessibilityRole="button"
        disabled={saving}
        onPress={() => void save()}
        style={[styles.save, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
      >
        <Text style={styles.saveText}>{saving ? 'Salvando…' : `Salvar ${SERVICE_LABELS[policy.serviceModel] ?? ''}`}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { paddingVertical: 12, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 15, fontWeight: '800' },
  label: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  hint: { fontSize: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5 },
  input: { height: 44, borderRadius: 12, paddingHorizontal: 12, fontSize: 15 },
  save: { marginTop: 6, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  saveText: { color: '#FFFFFF', fontWeight: '800' },
});
