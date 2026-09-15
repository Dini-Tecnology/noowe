import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Switch,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { Text } from 'react-native-paper';
import { Check, ChevronRight, SlidersHorizontal, Sparkles, Utensils } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';
import { V2Shell } from './shared/V2Shell';
import { SERVICE_TYPE_CATALOG } from './config/configTypes';
import {
  isSupportedServiceType,
  type ServiceType,
  type ServiceTypeFeatureKey,
} from '@okinawa/shared/config/service-types';

type FeatureMap = Record<string, Record<string, boolean>>;

const FEATURE_KEYS: Partial<Record<ServiceType, Record<string, ServiceTypeFeatureKey>>> = {
  fine_dining: {
    'Reservas Online': 'reservations',
    'Wine Pairing': 'aiPairing',
    Sommelier: 'aiPairing',
    'Split por item': 'splitPayment',
    'Course-by-Course': 'menuPersonalization',
  },
  casual_dining: {
    'Smart Waitlist': 'virtualQueue',
    'Modo Família': 'guestInvitations',
    Grupos: 'guestInvitations',
  },
  quick_service: {
    'Skip the Line': 'ordering',
    'Tracking 4 Estágios': 'orderTracking',
  },
};

function toUiFeatureStates(typeId: string, raw: Record<string, boolean>): Record<string, boolean> {
  const type = SERVICE_TYPE_CATALOG.find((item) => item.id === typeId);
  if (!type || !isSupportedServiceType(typeId)) return raw;
  const keys = FEATURE_KEYS[typeId] ?? {};
  return Object.fromEntries(type.features.map((label) => [label, raw[keys[label] ?? label] ?? true]));
}

function toPersistedFeatureStates(typeId: string, raw: Record<string, boolean>): Record<string, boolean> {
  if (!isSupportedServiceType(typeId)) return raw;
  const keys = FEATURE_KEYS[typeId] ?? {};
  const result: Record<string, boolean> = {};
  for (const [label, enabled] of Object.entries(raw)) {
    result[keys[label] ?? label] = enabled;
  }
  return result;
}

/** Service types with their own discovery sub-tag editor screen. */
const DISCOVERY_FILTER_ROUTES: Partial<Record<string, string>> = {
  fine_dining: 'FineDining',
  casual_dining: 'CasualDining',
  quick_service: 'QuickService',
};

export default function ServiceConfigScreen() {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const { restaurantId, reloadRestaurants } = useRestaurantRole();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const [featureStates, setFeatureStates] = useState<FeatureMap>({});
  const [expandedType, setExpandedType] = useState<string | null>('fine_dining');
  const [primaryType, setPrimaryType] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    try {
      const [configs, profile] = await Promise.all([
        supabaseApiAdapter.getServiceConfigs(restaurantId),
        supabaseApiAdapter.getRestaurantProfile(restaurantId),
      ]);
      const rows = Array.isArray(configs) ? configs : [];
      const active = rows.filter((r: { is_active?: boolean }) => r.is_active).map((r: { service_type: string }) => r.service_type);
      setActiveIds(active.length > 0 ? active : profile?.service_type ? [profile.service_type] : []);
      setPrimaryType(profile?.service_type ?? active[0] ?? null);

      const nextFeatures: FeatureMap = {};
      for (const row of rows) {
        const meta = row.config_metadata?.features;
        if (meta && typeof meta === 'object') {
          nextFeatures[row.service_type] = toUiFeatureStates(
            row.service_type,
            meta as Record<string, boolean>,
          );
        }
      }
      // Seed defaults for catalog types
      for (const type of SERVICE_TYPE_CATALOG) {
        if (!nextFeatures[type.id]) {
          nextFeatures[type.id] = Object.fromEntries(type.features.map((f) => [f, true]));
        }
      }
      setFeatureStates(nextFeatures);
    } catch (err) {
      Alert.alert('Erro', err instanceof Error ? err.message : 'Não foi possível carregar tipos de serviço.');
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial remote load
    void load();
  }, [load]);

  const persist = async (nextActive: string[], nextFeatures: FeatureMap, nextPrimary?: string | null) => {
    if (!restaurantId) return;
    setSaving(true);
    try {
      const configs = SERVICE_TYPE_CATALOG.map((type) => ({
        service_type: type.id,
        is_active: nextActive.includes(type.id),
        config_metadata: {
          features: toPersistedFeatureStates(type.id, nextFeatures[type.id] ?? {}),
        },
      }));
      const primary =
        nextPrimary && isSupportedServiceType(nextPrimary) && nextActive.includes(nextPrimary)
          ? nextPrimary
          : nextActive.find(isSupportedServiceType);
      if (!primary || !isSupportedServiceType(primary)) {
        throw new Error('Mantenha ao menos um tipo de serviço compatível ativo.');
      }
      await supabaseApiAdapter.upsertServiceConfigs(restaurantId, configs, primary);
      setPrimaryType(primary);
      await reloadRestaurants();
    } catch (err) {
      Alert.alert('Falha ao salvar', err instanceof Error ? err.message : 'Tente novamente.');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const toggleType = (id: string) => {
    const isActive = activeIds.includes(id);
    const type = SERVICE_TYPE_CATALOG.find((t) => t.id === id);
    if (!isActive && !type?.mvp) {
      Alert.alert(
        'Em breve',
        `${type?.name ?? 'Este tipo de serviço'} ainda não está disponível no app do cliente. Você poderá ativá-lo assim que for lançado.`,
      );
      return;
    }
    if (isActive && activeIds.length === 1) {
      Alert.alert('Tipo obrigatório', 'Ative outro tipo compatível antes de desativar o tipo atual.');
      return;
    }
    const next = isActive ? activeIds.filter((x) => x !== id) : [...activeIds, id];
    let nextFeatures = featureStates;
    if (!isActive && !featureStates[id]) {
      const type = SERVICE_TYPE_CATALOG.find((t) => t.id === id);
      if (type) {
        nextFeatures = {
          ...featureStates,
          [id]: Object.fromEntries(type.features.map((f) => [f, true])),
        };
        setFeatureStates(nextFeatures);
      }
    }
    setActiveIds(next);
    void persist(next, nextFeatures, primaryType);
  };

  const toggleFeature = (typeId: string, feature: string) => {
    const enabled = !(featureStates[typeId]?.[feature] ?? true);
    const canonicalKey = isSupportedServiceType(typeId) ? FEATURE_KEYS[typeId]?.[feature] : undefined;
    const linkedLabels = canonicalKey && isSupportedServiceType(typeId)
      ? Object.entries(FEATURE_KEYS[typeId] ?? {})
          .filter(([, key]) => key === canonicalKey)
          .map(([label]) => label)
      : [feature];
    const typeFeatures = { ...(featureStates[typeId] ?? {}) };
    for (const label of linkedLabels) typeFeatures[label] = enabled;
    const next: FeatureMap = {
      ...featureStates,
      [typeId]: typeFeatures,
    };
    setFeatureStates(next);
    void persist(activeIds, next, primaryType);
  };

  const featureCount = useMemo(
    () =>
      SERVICE_TYPE_CATALOG.filter((t) => activeIds.includes(t.id)).reduce((acc, type) => {
        const states = featureStates[type.id] ?? {};
        return acc + type.features.filter((f) => states[f] !== false).length;
      }, 0),
    [activeIds, featureStates],
  );

  return (
    <V2Shell
      title="Tipos de Serviço"
      subtitle="Selecione os modelos que seu estabelecimento opera"
      showBack
      onRefresh={load}
      headerRight={
        <View style={[styles.badge, { backgroundColor: `${colors.secondary}18` }]}>
          <Text style={{ color: colors.secondary, fontSize: 10, fontWeight: '800' }}>
            {activeIds.length}/11
          </Text>
        </View>
      }
    >
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          <View style={styles.statsRow}>
            <Stat value={activeIds.length} label="Ativos" color={colors.primary} colors={colors} />
            <Stat value={featureCount} label="Features" color={colors.success} colors={colors} />
            <Stat value={11} label="Disponíveis" color={colors.foreground} colors={colors} />
          </View>

          <View style={[styles.infoBanner, { borderColor: `${colors.info}33`, backgroundColor: `${colors.info}0D` }]}>
            <Sparkles size={12} color={colors.info} />
            <Text style={{ flex: 1, fontSize: 11, color: colors.info, fontWeight: '600' }}>
              Cada tipo ativa automaticamente as features relevantes. Toque para expandir e personalizar.
            </Text>
          </View>

          {SERVICE_TYPE_CATALOG.map((type) => {
            const isActive = activeIds.includes(type.id);
            const isExpanded = expandedType === type.id;
            const Icon = type.Icon;
            return (
              <View
                key={type.id}
                style={[
                  styles.typeCard,
                  {
                    borderColor: isActive ? colors.primary : colors.border,
                    backgroundColor: isActive ? `${colors.primary}08` : colors.card,
                  },
                ]}
              >
                <TouchableOpacity
                  onPress={() => setExpandedType(isExpanded ? null : type.id)}
                  style={styles.typeHeader}
                  activeOpacity={0.85}
                >
                  <View
                    style={[
                      styles.typeIcon,
                      {
                        backgroundColor: isActive ? `${colors.primary}22` : colors.backgroundSecondary,
                      },
                    ]}
                  >
                    <Icon size={20} color={isActive ? colors.primary : colors.foregroundSecondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.typeName, { color: colors.foreground }]}>{type.name}</Text>
                      {isActive ? <Check size={14} color={colors.primary} /> : null}
                      {primaryType === type.id ? (
                        <View style={[styles.primaryPill, { backgroundColor: `${colors.primary}18` }]}>
                          <Text style={{ color: colors.primary, fontSize: 9, fontWeight: '800' }}>PRIMÁRIO</Text>
                        </View>
                      ) : null}
                      {!type.mvp ? (
                        <View style={[styles.primaryPill, { backgroundColor: `${colors.foregroundSecondary}18` }]}>
                          <Text style={{ color: colors.foregroundSecondary, fontSize: 9, fontWeight: '800' }}>EM BREVE</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={{ fontSize: 11, color: colors.foregroundSecondary }}>{type.desc}</Text>
                  </View>
                  <ChevronRight
                    size={16}
                    color={colors.foregroundSecondary}
                    style={{ transform: [{ rotate: isExpanded ? '90deg' : '0deg' }] }}
                  />
                </TouchableOpacity>

                {isExpanded ? (
                  <View style={styles.expanded}>
                    <TouchableOpacity
                      onPress={() => toggleType(type.id)}
                      disabled={saving}
                      style={[
                        styles.toggleTypeBtn,
                        {
                          backgroundColor: isActive
                            ? `${colors.error}14`
                            : type.mvp
                              ? colors.primary
                              : colors.backgroundSecondary,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: isActive ? colors.error : type.mvp ? '#FFF' : colors.foregroundSecondary,
                          fontSize: 11,
                          fontWeight: '700',
                        }}
                      >
                        {isActive ? 'Desativar tipo' : type.mvp ? 'Ativar tipo' : 'Em breve'}
                      </Text>
                    </TouchableOpacity>

                    {isActive ? (
                      <>
                        {primaryType !== type.id && type.mvp ? (
                          <TouchableOpacity
                            onPress={() => {
                              setPrimaryType(type.id);
                              void persist(activeIds, featureStates, type.id as ServiceType);
                            }}
                            style={[styles.makePrimaryBtn, { borderColor: colors.border }]}
                          >
                            <Utensils size={12} color={colors.primary} />
                            <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>
                              Definir como primário
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                        {DISCOVERY_FILTER_ROUTES[type.id] ? (
                          <TouchableOpacity
                            onPress={() => navigation.navigate(DISCOVERY_FILTER_ROUTES[type.id]!)}
                            style={[styles.makePrimaryBtn, { borderColor: colors.border }]}
                          >
                            <SlidersHorizontal size={12} color={colors.primary} />
                            <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>
                              Editar filtros de descoberta
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                        <View style={[styles.featureCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                          {type.features.map((feature, index) => {
                            const enabled = featureStates[type.id]?.[feature] ?? true;
                            return (
                              <View
                                key={feature}
                                style={[
                                  styles.featureRow,
                                  index < type.features.length - 1 && {
                                    borderBottomWidth: StyleSheet.hairlineWidth,
                                    borderBottomColor: colors.border,
                                  },
                                ]}
                              >
                                <Text
                                  style={{
                                    flex: 1,
                                    fontSize: 12,
                                    fontWeight: '600',
                                    color: enabled ? colors.foreground : colors.foregroundSecondary,
                                    textDecorationLine: enabled ? 'none' : 'line-through',
                                  }}
                                >
                                  {feature}
                                </Text>
                                <Switch
                                  value={enabled}
                                  onValueChange={() => toggleFeature(type.id, feature)}
                                  trackColor={{ false: colors.border, true: `${colors.primary}80` }}
                                  thumbColor={enabled ? colors.primary : colors.foregroundSecondary}
                                />
                              </View>
                            );
                          })}
                        </View>
                      </>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </>
      )}
    </V2Shell>
  );
}

function Stat({
  value,
  label,
  color,
  colors,
}: {
  value: number;
  label: string;
  color: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.stat, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Text style={{ fontSize: 18, fontWeight: '800', color }}>{value}</Text>
      <Text style={{ fontSize: 9, color: colors.foregroundSecondary, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  stat: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  typeCard: { borderWidth: 2, borderRadius: 16, marginBottom: 8, overflow: 'hidden' },
  typeHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  typeIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeName: { fontSize: 13, fontWeight: '700' },
  primaryPill: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  expanded: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  toggleTypeBtn: {
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  makePrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
  },
  featureCard: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
