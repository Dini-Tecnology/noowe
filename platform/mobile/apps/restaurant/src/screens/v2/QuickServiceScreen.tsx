import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { Check, Flame, IceCream, Leaf, Pizza, Zap } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter, type QuickPanelSettings, type QuickPolicyPatch } from '@okinawa/shared/services/supabase-api';
import {
  QUICK_SERVICE_CUISINE_PRESENTATION,
  QUICK_SERVICE_CUISINE_TAGS,
  type QuickServiceCuisineTag,
} from '@okinawa/shared/config/quick-service';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';
import { V2Shell } from './shared/V2Shell';
import { ConfigSectionCard } from './config/ConfigSectionCard';
import { userErrorMessage } from '@okinawa/shared/utils/user-error-message';
import { QuickPolicyCard } from './quick-service/QuickPolicyCard';
import { quickPanelErrorMessage } from './quick-service/quick-panel';

const CUISINE_ICONS: Record<QuickServiceCuisineTag, typeof Zap> = {
  burgers: Flame,
  pizza: Pizza,
  acai: IceCream,
  saudavel: Leaf,
};

/**
 * The cuisine chips (Burgers/Pizza/Açaí/Saudável) and Skip the Line toggle a
 * quick service customer sees as sub-tag filters on the discovery Home.
 * Mirrors FineDiningScreen's amenity chip editor, scoped to quick service's
 * own vocabulary, plus the skip_the_line_enabled flag.
 */
export default function QuickServiceScreen() {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const { restaurantId } = useRestaurantRole();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cuisineTags, setCuisineTags] = useState<QuickServiceCuisineTag[]>([]);
  // Valor antigo, só repassado ao salvar: o pré-pedido do Quick vem da política (orderAhead), não desta chave.
  const [skipTheLineEnabled, setSkipTheLineEnabled] = useState(false);
  const [settings, setSettings] = useState<QuickPanelSettings | null>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [counterQr, setCounterQr] = useState<{ qrData: string; label: string } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cuisineTagsRef = useRef(cuisineTags);
  const skipTheLineRef = useRef(skipTheLineEnabled);

  useEffect(() => { cuisineTagsRef.current = cuisineTags; }, [cuisineTags]);
  useEffect(() => { skipTheLineRef.current = skipTheLineEnabled; }, [skipTheLineEnabled]);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    try {
      setError(null);
      const data = await supabaseApiAdapter.getQuickServiceConfig(restaurantId);
      // As regras de retirada vivem na política do restaurante; o painel de pedidos tem a sua própria tela.
      const panel = await supabaseApiAdapter.getQuickPanel(restaurantId);
      setSettings(panel.settings);
      const raw = Array.isArray(data?.cuisineTags) ? data.cuisineTags : [];
      setCuisineTags(
        raw.filter((key: unknown): key is QuickServiceCuisineTag =>
          typeof key === 'string' && key in QUICK_SERVICE_CUISINE_PRESENTATION,
        ),
      );
      setSkipTheLineEnabled(Boolean(data?.skipTheLineEnabled));
    } catch (err) {
      setError(userErrorMessage(err, 'Erro ao carregar configuração'));
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial remote load
    void load();
  }, [load]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const persist = useCallback(async () => {
    if (!restaurantId) return;
    try {
      await supabaseApiAdapter.updateQuickServiceConfig(
        restaurantId,
        cuisineTagsRef.current,
        skipTheLineRef.current,
      );
      setError(null);
    } catch (err) {
      setError(userErrorMessage(err, 'Erro ao salvar configuração'));
    }
  }, [restaurantId]);

  const schedulePersist = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void persist(); }, 350);
  }, [persist]);

  const toggleCuisineTag = useCallback((key: QuickServiceCuisineTag) => {
    setCuisineTags((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
    schedulePersist();
  }, [schedulePersist]);

  const savePolicy = useCallback(async (patch: QuickPolicyPatch) => {
    if (!restaurantId) return;
    setSavingPolicy(true);
    setPolicyError(null);
    try {
      await supabaseApiAdapter.updateQuickServicePolicy(restaurantId, patch);
      await load();
      Alert.alert('Configurações salvas', 'As regras do Quick Service foram atualizadas.');
    } catch (err) {
      setPolicyError(quickPanelErrorMessage(err));
    } finally {
      setSavingPolicy(false);
    }
  }, [restaurantId, load]);

  const generateCounterQr = useCallback(async () => {
    if (!restaurantId) return;
    try {
      setCounterQr(await supabaseApiAdapter.generateCounterQR(restaurantId));
    } catch (err) {
      Alert.alert('QR não gerado', userErrorMessage(err, 'Tente novamente.'));
    }
  }, [restaurantId]);

  return (
    <V2Shell
      title="Quick Service"
      subtitle="Cozinha e Skip the Line"
      showBack
      onRefresh={load}
      headerRight={
        <TouchableOpacity
          style={[styles.headerIcon, { backgroundColor: '#FEF3C7' }]}
          onPress={() => navigation.navigate('QuickOrders')}
          accessibilityRole="button"
          accessibilityLabel="Abrir pedidos do Quick Service"
        >
          <Zap size={18} color="#B45309" />
        </TouchableOpacity>
      }
    >
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          <ConfigSectionCard title="Tipo de Cozinha" Icon={Flame}>
            <View style={styles.chipsWrap}>
              {QUICK_SERVICE_CUISINE_TAGS.map((key) => {
                const selected = cuisineTags.includes(key);
                const Icon = CUISINE_ICONS[key] ?? Check;
                const presentation = QUICK_SERVICE_CUISINE_PRESENTATION[key];
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => toggleCuisineTag(key)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected ? colors.primary : colors.backgroundSecondary,
                        borderColor: selected ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Icon size={14} color={selected ? '#FFFFFF' : colors.foregroundSecondary} />
                    <Text style={[styles.chipText, { color: selected ? '#FFFFFF' : colors.foreground }]}>
                      {presentation.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ConfigSectionCard>

          <ConfigSectionCard title="QR do balcão" Icon={Zap}>
            <View style={styles.qrSection}>
              {counterQr ? (
                <>
                  <View style={styles.qrCanvas}><QRCode value={counterQr.qrData} size={180} ecl="H" /></View>
                  <Text style={[styles.rowSub, { color: colors.foregroundSecondary }]}>Ao gerar outro código para este balcão, o anterior é revogado.</Text>
                </>
              ) : null}
              <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.primary }]} onPress={() => void generateCounterQr()}>
                <Text style={styles.actionText}>{counterQr ? 'Gerar novo QR' : 'Gerar QR do balcão'}</Text>
              </TouchableOpacity>
            </View>
          </ConfigSectionCard>

          <ConfigSectionCard title="Regras de retirada e pedidos" Icon={Zap}>
            {settings ? (
              <QuickPolicyCard
                key={JSON.stringify(settings)}
                settings={settings}
                saving={savingPolicy}
                error={policyError}
                onSave={(patch) => { void savePolicy(patch); }}
              />
            ) : (
              <Text style={[styles.emptyText, { color: colors.foregroundSecondary }]}>Configurações indisponíveis.</Text>
            )}
          </ConfigSectionCard>

          {error ? (
            <Text style={{ textAlign: 'center', color: '#EF4444', marginTop: 8 }}>{error}</Text>
          ) : null}
        </>
      )}
    </V2Shell>
  );
}

const styles = StyleSheet.create({
  headerIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 14 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 18, borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  rowTitle: { fontSize: 13, fontWeight: '700' },
  rowSub: { fontSize: 11, marginTop: 2 },
  operationRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: StyleSheet.hairlineWidth },
  actionButton: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  actionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  emptyText: { padding: 14, fontSize: 12 },
  qrSection: { alignItems: 'center', gap: 12, padding: 16 },
  qrCanvas: { padding: 14, borderRadius: 16, backgroundColor: '#FFFFFF' },
});
