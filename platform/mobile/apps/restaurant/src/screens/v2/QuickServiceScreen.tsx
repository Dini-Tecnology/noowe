import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { Check, Flame, IceCream, Leaf, Pizza, Zap } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { getSupabaseClient } from '@okinawa/shared/services/supabase';
import {
  QUICK_SERVICE_CUISINE_PRESENTATION,
  QUICK_SERVICE_CUISINE_TAGS,
  type QuickServiceCuisineTag,
} from '@okinawa/shared/config/quick-service';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';
import { V2Shell } from './shared/V2Shell';
import { ConfigSectionCard } from './config/ConfigSectionCard';
import { userErrorMessage } from '@okinawa/shared/utils/user-error-message';

const CUISINE_ICONS: Record<QuickServiceCuisineTag, typeof Zap> = {
  burgers: Flame,
  pizza: Pizza,
  acai: IceCream,
  saudavel: Leaf,
};

type QuickOperationalOrder = {
  id: string;
  pickup_code: string | null;
  fulfillment_status: 'checking' | 'ready';
  created_at: string;
};

/**
 * The cuisine chips (Burgers/Pizza/Açaí/Saudável) and Skip the Line toggle a
 * quick service customer sees as sub-tag filters on the discovery Home.
 * Mirrors FineDiningScreen's amenity chip editor, scoped to quick service's
 * own vocabulary, plus the skip_the_line_enabled flag.
 */
export default function QuickServiceScreen() {
  const colors = useColors();
  const { restaurantId } = useRestaurantRole();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cuisineTags, setCuisineTags] = useState<QuickServiceCuisineTag[]>([]);
  const [skipTheLineEnabled, setSkipTheLineEnabled] = useState(false);
  const [operationalOrders, setOperationalOrders] = useState<QuickOperationalOrder[]>([]);
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
      const { data: operations, error: operationsError } = await (getSupabaseClient() as any)
        .from('orders')
        .select('id,pickup_code,fulfillment_status,created_at')
        .eq('restaurant_id', restaurantId)
        .eq('service_model', 'quick_service')
        .eq('payment_status', 'confirmed')
        .in('fulfillment_status', ['checking', 'ready'])
        .order('created_at', { ascending: true });
      if (operationsError) throw operationsError;
      setOperationalOrders((operations ?? []) as QuickOperationalOrder[]);
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

  const toggleSkipTheLine = useCallback(() => {
    setSkipTheLineEnabled((current) => !current);
    schedulePersist();
  }, [schedulePersist]);

  const approveQuality = useCallback(async (orderId: string) => {
    try {
      await supabaseApiAdapter.completeQuickQualityCheck(orderId, true, {
        items: true,
        packaging: true,
        pickupCode: true,
      });
      await load();
    } catch (err) {
      Alert.alert('Não foi possível concluir a conferência', userErrorMessage(err, 'Tente novamente.'));
    }
  }, [load]);

  const confirmPickup = useCallback(async (order: QuickOperationalOrder) => {
    if (!order.pickup_code) return;
    try {
      await supabaseApiAdapter.confirmQuickPickup(order.id, order.pickup_code);
      await load();
    } catch (err) {
      Alert.alert('Retirada não confirmada', userErrorMessage(err, 'Confira o código.'));
    }
  }, [load]);

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
        <View style={[styles.headerIcon, { backgroundColor: '#FEF3C7' }]}>
          <Zap size={18} color="#B45309" />
        </View>
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

          <ConfigSectionCard title="Skip the Line" Icon={Zap}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.foreground }]}>Pré-pedido no app</Text>
                <Text style={[styles.rowSub, { color: colors.foregroundSecondary }]}>
                  Clientes pagam antes de chegar e retiram sem esperar no caixa
                </Text>
              </View>
              <Switch
                value={skipTheLineEnabled}
                onValueChange={toggleSkipTheLine}
                trackColor={{ false: colors.border, true: `${colors.primary}80` }}
                thumbColor={skipTheLineEnabled ? colors.primary : colors.foregroundSecondary}
              />
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

          <ConfigSectionCard title="Conferência" Icon={Check}>
            {operationalOrders.filter((order) => order.fulfillment_status === 'checking').length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.foregroundSecondary }]}>Nenhum pedido aguardando conferência.</Text>
            ) : operationalOrders.filter((order) => order.fulfillment_status === 'checking').map((order) => (
              <View key={order.id} style={[styles.operationRow, { borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>Pedido #{order.id.slice(0, 6).toUpperCase()}</Text>
                  <Text style={[styles.rowSub, { color: colors.foregroundSecondary }]}>Itens, embalagem e código devem ser conferidos</Text>
                </View>
                <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.primary }]} onPress={() => void approveQuality(order.id)}>
                  <Text style={styles.actionText}>Aprovar</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ConfigSectionCard>

          <ConfigSectionCard title="Retirada" Icon={Zap}>
            {operationalOrders.filter((order) => order.fulfillment_status === 'ready').length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.foregroundSecondary }]}>Nenhum pedido pronto para retirada.</Text>
            ) : operationalOrders.filter((order) => order.fulfillment_status === 'ready').map((order) => (
              <View key={order.id} style={[styles.operationRow, { borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>Código {order.pickup_code ?? 'indisponível'}</Text>
                  <Text style={[styles.rowSub, { color: colors.foregroundSecondary }]}>Confirme somente após validar o código do cliente</Text>
                </View>
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: '#16A34A', opacity: order.pickup_code ? 1 : 0.5 }]}
                  disabled={!order.pickup_code}
                  onPress={() => void confirmPickup(order)}
                >
                  <Text style={styles.actionText}>Retirado</Text>
                </TouchableOpacity>
              </View>
            ))}
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
