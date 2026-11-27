import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { userErrorMessage } from '@okinawa/shared/utils/user-error-message';
import { V2Shell } from './shared/V2Shell';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';

type Field = 'points_per_real' | 'points_redemption_rate' | 'min_points_for_redemption' | 'cashback_percentage'
  | 'tier_silver_min_cents' | 'tier_gold_min_cents' | 'tier_platinum_min_cents';
type Toggle = 'points_enabled' | 'cashback_enabled';
export type LoyaltyDraft = Record<Field, string> & Record<Toggle, boolean>;

// cents: o Dono digita reais; o servidor guarda centavos e confere a ordem das faixas.
// note: explicação longa fica abaixo do rótulo; o placeholder só cabe um exemplo curto.
const FIELDS: { key: Field; label: string; hint: string; note?: string; needs: Toggle; cents?: boolean }[] = [
  { key: 'points_per_real', label: 'Pontos por R$ 1 consumido', hint: 'Ex.: 1', note: 'Creditados depois do pagamento, para quem pagou', needs: 'points_enabled' },
  { key: 'points_redemption_rate', label: 'Valor de cada ponto no resgate (R$)', hint: 'Ex.: 0,05', needs: 'points_enabled' },
  { key: 'min_points_for_redemption', label: 'Mínimo de pontos para resgatar', hint: 'Ex.: 100', needs: 'points_enabled' },
  { key: 'tier_silver_min_cents', label: 'Gasto para Prata (R$)', hint: 'Ex.: 500', needs: 'points_enabled', cents: true },
  { key: 'tier_gold_min_cents', label: 'Gasto para Ouro (R$)', hint: 'Ex.: 2000', needs: 'points_enabled', cents: true },
  { key: 'tier_platinum_min_cents', label: 'Gasto para Platina (R$)', hint: 'Ex.: 5000', needs: 'points_enabled', cents: true },
  { key: 'cashback_percentage', label: 'Cashback (%)', hint: 'De 0 a 100', needs: 'cashback_enabled' },
];

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
const reais = (v: unknown) => (v === null || v === undefined ? '' : text(Number(v) / 100));
const num = (v: string) => {
  const n = Number(v.trim().replace(',', '.'));
  return v.trim() === '' || !Number.isFinite(n) || n < 0 ? null : n;
};

export function rowToLoyaltyDraft(row: Record<string, unknown> | null | undefined): LoyaltyDraft {
  return {
    points_enabled: Boolean(row?.points_enabled),
    cashback_enabled: Boolean(row?.cashback_enabled),
    points_per_real: text(row?.points_per_real),
    points_redemption_rate: text(row?.points_redemption_rate),
    min_points_for_redemption: text(row?.min_points_for_redemption),
    cashback_percentage: text(row?.cashback_percentage),
    tier_silver_min_cents: reais(row?.tier_silver_min_cents),
    tier_gold_min_cents: reais(row?.tier_gold_min_cents),
    tier_platinum_min_cents: reais(row?.tier_platinum_min_cents),
  };
}

/** Valida e converte; devolve a mensagem do primeiro campo inválido. O servidor confere de novo. */
export function loyaltyDraftToPayload(d: LoyaltyDraft): { payload?: Record<string, unknown>; error?: string } {
  const payload: Record<string, unknown> = { points_enabled: d.points_enabled, cashback_enabled: d.cashback_enabled };
  for (const f of FIELDS) {
    // Faixa em branco: o servidor mantém a atual.
    if (f.cents) {
      if (d[f.key].trim() === '') continue;
      const r = num(d[f.key]);
      if (r === null) return { error: `Confira: ${f.label}` };
      payload[f.key] = Math.round(r * 100);
      continue;
    }
    const v = d[f.key].trim() === '' && !d[f.needs] ? 0 : num(d[f.key]);
    if (v === null || (f.key === 'cashback_percentage' && v > 100)) return { error: `Confira: ${f.label}` };
    payload[f.key] = v;
  }
  const [s, g, p] = (['tier_silver_min_cents', 'tier_gold_min_cents', 'tier_platinum_min_cents'] as const).map((k) => payload[k] as number | undefined);
  if (s !== undefined && g !== undefined && p !== undefined && !(s > 0 && s < g && g < p)) {
    return { error: 'As faixas devem crescer: Prata < Ouro < Platina' };
  }
  return { payload };
}

export default function LoyaltyScreen() {
  const colors = useColors();
  const { restaurantId } = useRestaurantRole();
  const [draft, setDraft] = useState<LoyaltyDraft>(rowToLoyaltyDraft(null));
  const [members, setMembers] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const [stats, config] = await Promise.all([
        supabaseApiAdapter.getLoyaltyStats(restaurantId).catch(() => null),
        supabaseApiAdapter.getLoyaltyConfig(restaurantId),
      ]);
      setMembers(stats?.active_members ?? 0);
      setDraft(rowToLoyaltyDraft(config));
    } catch (err) {
      setMessage({ ok: false, text: userErrorMessage(err, 'Erro ao carregar o programa') });
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount: the async loader sets state after its request resolves, not synchronously
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!restaurantId) return;
    const { payload, error } = loyaltyDraftToPayload(draft);
    if (!payload) { setMessage({ ok: false, text: error ?? 'Valores inválidos' }); return; }
    setSaving(true);
    setMessage(null);
    try {
      setDraft(rowToLoyaltyDraft(await supabaseApiAdapter.saveLoyaltyConfig(restaurantId, payload)));
      setMessage({ ok: true, text: 'Programa salvo' });
    } catch (err) {
      setMessage({ ok: false, text: userErrorMessage(err, 'Erro ao salvar o programa') });
    } finally {
      setSaving(false);
    }
  };

  const toggleRow = (key: Toggle, label: string) => (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <Text style={{ flex: 1, fontWeight: '600', color: colors.foreground }}>{label}</Text>
      <Switch accessibilityLabel={label} value={draft[key]} onValueChange={(v) => setDraft((p) => ({ ...p, [key]: v }))} />
    </View>
  );

  return (
    <V2Shell title="Fidelidade" subtitle={`${members} membros ativos`} showBack onRefresh={load}>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          <View style={[styles.list, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {toggleRow('points_enabled', 'Programa de pontos')}
            {toggleRow('cashback_enabled', 'Cashback')}
            {FIELDS.filter((f) => draft[f.needs]).map((f) => (
              <View key={f.key} style={[styles.row, { borderBottomColor: colors.border, flexDirection: 'column', alignItems: 'stretch' }]}>
                <Text style={{ fontWeight: '600', color: colors.foreground }}>{f.label}</Text>
                {f.note ? <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>{f.note}</Text> : null}
                <TextInput
                  accessibilityLabel={f.label}
                  value={draft[f.key]}
                  onChangeText={(v) => setDraft((p) => ({ ...p, [f.key]: v }))}
                  keyboardType="decimal-pad"
                  placeholder={f.hint}
                  placeholderTextColor={colors.foregroundSecondary}
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
                />
              </View>
            ))}
          </View>
          {message && (
            <Text style={{ textAlign: 'center', marginBottom: 8, color: message.ok ? '#22C55E' : '#EF4444' }}>{message.text}</Text>
          )}
          <TouchableOpacity
            accessibilityRole="button"
            style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
            onPress={() => void save()}
            disabled={saving}
          >
            <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 15 }}>{saving ? 'Salvando…' : 'Salvar programa'}</Text>
          </TouchableOpacity>
        </>
      )}
    </V2Shell>
  );
}

const styles = StyleSheet.create({
  list: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15 },
  saveBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
});
