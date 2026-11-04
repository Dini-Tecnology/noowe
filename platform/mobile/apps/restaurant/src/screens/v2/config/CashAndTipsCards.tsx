import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from 'react-native-paper';
import { Landmark, Users } from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter, type CashSettings, type TipMode, type TipRules } from '@okinawa/shared/services/supabase-api';
import { userErrorMessage } from '@okinawa/shared/utils/user-error-message';
import { useRestaurantRole } from '../../../contexts/RestaurantRoleContext';
import { ROLE_LABELS } from '../shared/staffRoles';
import { ConfigSectionCard } from './ConfigSectionCard';
import { centsFromText, textFromCents, TIP_MODES, TIP_ROLES } from './cashSettings';

/** Fundo de troco, sangria sugerida e virada do dia: Dono e Gerente. Limite de quebra: só o Dono. */
export function CashSettingsCard({ restaurantId }: { restaurantId: string | null | undefined }) {
  const colors = useColors();
  const { serverRoles } = useRestaurantRole();
  const isOwner = serverRoles.includes('owner');
  const [settings, setSettings] = useState<CashSettings | null>(null);
  const [opening, setOpening] = useState('');
  const [sangria, setSangria] = useState('');
  const [limit, setLimit] = useState('');
  const [turnover, setTurnover] = useState('06:00');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!restaurantId) return;
    supabaseApiAdapter.getCashSettings(restaurantId).then((value) => {
      setSettings(value);
      setOpening(textFromCents(value.openingFloatCents));
      setSangria(value.sangriaSuggestCents == null ? '' : textFromCents(value.sangriaSuggestCents));
      setLimit(textFromCents(value.breakLimitCents));
      setTurnover(value.dayTurnover);
    }).catch(() => setSettings(null));
  }, [restaurantId]);

  const save = async () => {
    if (!restaurantId) return;
    const openingCents = centsFromText(opening);
    const sangriaCents = sangria.trim() ? centsFromText(sangria) : null;
    const limitCents = centsFromText(limit);
    if (openingCents === null || limitCents === null || (sangria.trim() && !sangriaCents) || !/^\d{2}:\d{2}$/.test(turnover)) {
      Alert.alert('Confira os valores', 'Use valores em reais e a virada do dia no formato 06:00.');
      return;
    }
    setSaving(true);
    try {
      setSettings(await supabaseApiAdapter.updateCashSettings(restaurantId, {
        openingFloatCents: openingCents, sangriaSuggestCents: sangriaCents, dayTurnover: turnover,
        breakLimitCents: isOwner ? limitCents : null,
      }));
      Alert.alert('Salvo', 'Parâmetros do caixa atualizados.');
    } catch (err) {
      Alert.alert('Não foi possível salvar', userErrorMessage(err, 'Tente novamente.'));
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return null;
  const inputStyle = [styles.input, { color: colors.foreground, backgroundColor: colors.backgroundTertiary }];
  const label = [styles.label, { color: colors.foregroundSecondary }];
  return (
    <ConfigSectionCard title="Caixa" Icon={Landmark}>
      <View style={styles.block}>
        <Text style={label}>Fundo de troco (R$)</Text>
        <TextInput value={opening} onChangeText={setOpening} keyboardType="decimal-pad" accessibilityLabel="Fundo de troco" style={inputStyle} />
        <Text style={label}>Sugerir sangria acima de (R$, opcional)</Text>
        <TextInput value={sangria} onChangeText={setSangria} keyboardType="decimal-pad" accessibilityLabel="Sugerir sangria acima de" style={inputStyle} />
        <Text style={label}>Limite de quebra (R$){isOwner ? '' : ' · só o Dono altera'}</Text>
        <TextInput value={limit} onChangeText={setLimit} editable={isOwner} keyboardType="decimal-pad" accessibilityLabel="Limite de quebra" style={[inputStyle, !isOwner && { opacity: 0.6 }]} />
        <Text style={label}>Virada do dia, sem caixa aberto</Text>
        <TextInput value={turnover} onChangeText={setTurnover} accessibilityLabel="Virada do dia" style={inputStyle} />
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={[styles.save, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}>
          <Text style={styles.saveText}>{saving ? 'Salvando…' : 'Salvar caixa'}</Text>
        </Pressable>
      </View>
    </ConfigSectionCard>
  );
}

/** Retenção e rateio. Quem valida é o contador; a mudança vale do próximo dia operacional. */
export function TipRulesCard({ restaurantId }: { restaurantId: string | null | undefined }) {
  const colors = useColors();
  const [rules, setRules] = useState<TipRules | null>(null);
  const [mode, setMode] = useState<TipMode>('equal');
  const [retention, setRetention] = useState('0');
  const [points, setPoints] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const apply = useCallback((value: TipRules) => {
    const next = value.pending ?? value;
    setRules(value);
    setMode(next.mode);
    setRetention(String(next.retentionBps / 100));
    setPoints(Object.fromEntries(Object.entries(next.rolePoints ?? {}).map(([role, weight]) => [role, String(weight)])));
  }, []);

  useEffect(() => {
    if (!restaurantId) return;
    supabaseApiAdapter.getTipRules(restaurantId).then(apply).catch(() => setRules(null));
  }, [apply, restaurantId]);

  const setRegime = async (regime: 'simples_nacional' | 'outros') => {
    if (!restaurantId) return;
    try {
      await supabaseApiAdapter.setTaxRegime(restaurantId, regime);
      apply(await supabaseApiAdapter.getTipRules(restaurantId));
    } catch (err) {
      Alert.alert('Não foi possível salvar', userErrorMessage(err, 'Tente novamente.'));
    }
  };

  const save = async () => {
    if (!restaurantId || !rules) return;
    const percent = Number(retention.replace(',', '.'));
    if (!Number.isFinite(percent) || percent < 0 || Math.round(percent * 100) > rules.capBps) {
      Alert.alert('Retenção acima do teto', `O teto do regime é ${rules.capBps / 100}%.`);
      return;
    }
    setSaving(true);
    try {
      apply(await supabaseApiAdapter.updateTipRules(restaurantId, {
        mode, retentionBps: Math.round(percent * 100),
        rolePoints: mode === 'points' ? Object.fromEntries(Object.entries(points).filter(([, value]) => value.trim()).map(([role, value]) => [role, Number(value.replace(',', '.'))])) : {},
      }));
      Alert.alert('Salvo', 'Vale a partir do próximo dia operacional.');
    } catch (err) {
      Alert.alert('Não foi possível salvar', userErrorMessage(err, 'Tente novamente.'));
    } finally {
      setSaving(false);
    }
  };

  if (!rules) return null;
  const chip = (selected: boolean) => [styles.chip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? `${colors.primary}18` : colors.card }];
  const chipText = (selected: boolean) => ({ fontSize: 13, fontWeight: '700' as const, color: selected ? colors.primary : colors.foreground });
  const label = [styles.label, { color: colors.foregroundSecondary }];
  const inputStyle = [styles.input, { color: colors.foreground, backgroundColor: colors.backgroundTertiary }];
  return (
    <ConfigSectionCard title="Rateio da gorjeta" Icon={Users}>
      <View style={styles.block}>
        <Text style={[styles.hint, { color: colors.foregroundSecondary }]}>Confirme estes valores com seu contador e com a convenção coletiva da categoria.</Text>
        <Text style={label}>Regime tributário</Text>
        <View style={styles.row}>
          {([['simples_nacional', 'Simples Nacional'], ['outros', 'Outros']] as const).map(([value, text]) => (
            <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: rules.taxRegime === value }} onPress={() => void setRegime(value)} style={chip(rules.taxRegime === value)}>
              <Text style={chipText(rules.taxRegime === value)}>{text}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={label}>Percentual retido (até {rules.capBps / 100}%)</Text>
        <TextInput value={retention} onChangeText={setRetention} keyboardType="decimal-pad" accessibilityLabel="Percentual retido" style={inputStyle} />
        <Text style={label}>Modo de rateio</Text>
        <View style={styles.row}>
          {TIP_MODES.map((item) => (
            <Pressable key={item.mode} accessibilityRole="button" accessibilityState={{ selected: mode === item.mode }} onPress={() => setMode(item.mode)} style={chip(mode === item.mode)}>
              <Text style={chipText(mode === item.mode)}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
        {mode === 'points' && TIP_ROLES.map((role) => (
          <View key={role} style={styles.pointRow}>
            <Text style={{ flex: 1, color: colors.foreground }}>{ROLE_LABELS[role] ?? role}</Text>
            <TextInput
              value={points[role] ?? ''}
              onChangeText={(text) => setPoints((current) => ({ ...current, [role]: text }))}
              keyboardType="decimal-pad"
              placeholder="1"
              placeholderTextColor={colors.foregroundMuted}
              accessibilityLabel={`Pontos de ${ROLE_LABELS[role] ?? role}`}
              style={[inputStyle, styles.pointInput]}
            />
          </View>
        ))}
        {rules.pending ? <Text style={[styles.hint, { color: colors.foregroundSecondary }]}>Mudança agendada: vale a partir de {rules.pending.effectiveDay.split('-').reverse().join('/')}.</Text> : null}
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={[styles.save, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}>
          <Text style={styles.saveText}>{saving ? 'Salvando…' : 'Salvar rateio'}</Text>
        </Pressable>
      </View>
    </ConfigSectionCard>
  );
}

const styles = StyleSheet.create({
  block: { gap: 8, paddingVertical: 8 },
  label: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  hint: { fontSize: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5 },
  input: { height: 44, borderRadius: 12, paddingHorizontal: 12, fontSize: 15 },
  pointRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pointInput: { width: 80 },
  save: { marginTop: 6, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  saveText: { color: '#FFFFFF', fontWeight: '800' },
});
