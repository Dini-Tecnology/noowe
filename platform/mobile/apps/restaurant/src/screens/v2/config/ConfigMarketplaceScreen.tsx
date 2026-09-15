import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Switch, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import {
  Award,
  Brain,
  ChartLine,
  ChevronRight,
  Clock,
  Crown,
  Gift,
  PartyPopper,
  Star,
  Zap,
} from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { V2Shell } from '../shared/V2Shell';
import type { MarketplaceFeatures } from '../shared/v2Types';
import type { IconComponent } from './configTypes';

const DEFAULT_FEATURES: MarketplaceFeatures = {
  loyalty: true,
  events: false,
  happyHour: false,
  aiRecommendations: true,
  vip: false,
  experiencePackages: false,
  smartReviews: false,
  advancedAnalytics: false,
};

type FeatureTier = 'Premium' | 'Pro' | 'Grátis';

interface FeatureDef {
  key: keyof MarketplaceFeatures;
  title: string;
  description: string;
  tier: FeatureTier;
  Icon: IconComponent;
  iconColor: string;
}

const FEATURE_CATALOG: FeatureDef[] = [
  {
    key: 'loyalty',
    title: 'Programa de Fidelidade',
    description: 'Pontos, recompensas e leaderboard',
    tier: 'Premium',
    Icon: Award,
    iconColor: '#EA580C',
  },
  {
    key: 'events',
    title: 'Gestão de Eventos',
    description: 'Eventos, ingressos e check-in',
    tier: 'Pro',
    Icon: PartyPopper,
    iconColor: '#0D9488',
  },
  {
    key: 'happyHour',
    title: 'Happy Hour',
    description: 'Preços automáticos por horário',
    tier: 'Grátis',
    Icon: Clock,
    iconColor: '#16A34A',
  },
  {
    key: 'aiRecommendations',
    title: 'IA de Recomendações',
    description: 'Sugestões inteligentes e harmonização',
    tier: 'Premium',
    Icon: Brain,
    iconColor: '#0284C7',
  },
  {
    key: 'vip',
    title: 'Programa VIP',
    description: 'Áreas exclusivas e benefícios',
    tier: 'Pro',
    Icon: Crown,
    iconColor: '#D97706',
  },
  {
    key: 'experiencePackages',
    title: 'Pacotes de Experiência',
    description: 'Combos e experiências gastronômicas',
    tier: 'Grátis',
    Icon: Gift,
    iconColor: '#EA580C',
  },
  {
    key: 'smartReviews',
    title: 'Avaliações Inteligentes',
    description: 'Feedback automático pós-visita',
    tier: 'Grátis',
    Icon: Star,
    iconColor: '#EA580C',
  },
  {
    key: 'advancedAnalytics',
    title: 'Analytics Avançado',
    description: 'Previsões e insights por IA',
    tier: 'Premium',
    Icon: ChartLine,
    iconColor: '#EF4444',
  },
];

const TIER_STYLE: Record<FeatureTier, { bg: string; color: string }> = {
  Premium: { bg: '#FEE2E2', color: '#DC2626' },
  Pro: { bg: '#E0F2FE', color: '#0284C7' },
  Grátis: { bg: '#DCFCE7', color: '#16A34A' },
};

export default function ConfigMarketplaceScreen() {
  const colors = useColors();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [features, setFeatures] = useState<MarketplaceFeatures>(DEFAULT_FEATURES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const featuresRef = useRef(features);
  const restaurantIdRef = useRef(restaurantId);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    featuresRef.current = features;
  }, [features]);

  useEffect(() => {
    restaurantIdRef.current = restaurantId;
  }, [restaurantId]);

  const persist = useCallback(async (next: MarketplaceFeatures) => {
    const id = restaurantIdRef.current;
    if (!id) return;
    try {
      await supabaseApiAdapter.updateRestaurantProfile(id, { features: next });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar features');
    }
  }, []);

  const schedulePersist = useCallback(
    (next: MarketplaceFeatures) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void persist(next);
      }, 350);
    },
    [persist],
  );

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await supabaseApiAdapter.getRestaurantProfile();
      if (data) {
        setRestaurantId(data.id ?? null);
        const stored = data.features;
        if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
          setFeatures({ ...DEFAULT_FEATURES, ...stored });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar marketplace');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (key: keyof MarketplaceFeatures) => {
    setFeatures((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      schedulePersist(next);
      return next;
    });
  };

  const stats = useMemo(() => {
    const active = FEATURE_CATALOG.filter((f) => features[f.key]).length;
    const free = FEATURE_CATALOG.filter((f) => f.tier === 'Grátis').length;
    return {
      active,
      available: FEATURE_CATALOG.length,
      free,
    };
  }, [features]);

  return (
    <V2Shell
      title="Marketplace de Features"
      subtitle="Ative módulos avançados para seu negócio"
      showBack
      onRefresh={load}
      headerRight={
        <View style={styles.headerRight}>
          <View style={[styles.headerIcon, { backgroundColor: '#FFEDD5' }]}>
            <Zap size={18} color="#EA580C" />
          </View>
          <View style={[styles.activeBadge, { backgroundColor: '#FEE2E2' }]}>
            <Text style={{ color: '#DC2626', fontSize: 11, fontWeight: '800' }}>
              {stats.active} ativos
            </Text>
          </View>
        </View>
      }
    >
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          <View style={styles.statsRow}>
            <StatCard value={stats.active} label="Ativos" tone="danger" colors={colors} />
            <StatCard value={stats.available} label="Disponíveis" tone="neutral" colors={colors} />
            <StatCard value={stats.free} label="Grátis" tone="success" colors={colors} />
          </View>

          <View style={{ gap: 10 }}>
            {FEATURE_CATALOG.map((feature) => {
              const active = features[feature.key];
              const Icon = feature.Icon;
              const tier = TIER_STYLE[feature.tier];
              return (
                <View
                  key={feature.key}
                  style={[
                    styles.featureCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <View style={[styles.featureIcon, { backgroundColor: `${feature.iconColor}18` }]}>
                    <Icon size={18} color={feature.iconColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.featureTitleRow}>
                      <Text style={[styles.featureTitle, { color: colors.foreground }]} numberOfLines={1}>
                        {feature.title}
                      </Text>
                      <View style={[styles.tierBadge, { backgroundColor: tier.bg }]}>
                        <Text style={{ color: tier.color, fontSize: 10, fontWeight: '800' }}>
                          {feature.tier}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.featureDesc, { color: colors.foregroundSecondary }]}>
                      {feature.description}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.chevronBtn, { backgroundColor: colors.backgroundSecondary }]}
                    hitSlop={8}
                  >
                    <ChevronRight size={14} color={colors.foregroundSecondary} />
                  </TouchableOpacity>
                  <Switch
                    value={active}
                    onValueChange={() => toggle(feature.key)}
                    trackColor={{ false: colors.border, true: `${colors.primary}80` }}
                    thumbColor={active ? colors.primary : colors.foregroundSecondary}
                  />
                </View>
              );
            })}
          </View>

          {error ? (
            <Text style={{ textAlign: 'center', color: '#EF4444', marginTop: 12 }}>{error}</Text>
          ) : null}
        </>
      )}
    </V2Shell>
  );
}

function StatCard({
  value,
  label,
  tone,
  colors,
}: {
  value: number;
  label: string;
  tone: 'danger' | 'neutral' | 'success';
  colors: ReturnType<typeof useColors>;
}) {
  const toneColor =
    tone === 'danger' ? '#EF4444' : tone === 'success' ? colors.success : colors.foreground;
  const bg =
    tone === 'danger' ? '#FEF2F2' : tone === 'success' ? `${colors.success}12` : colors.card;
  return (
    <View style={[styles.statCard, { borderColor: colors.border, backgroundColor: bg }]}>
      <Text style={[styles.statValue, { color: toneColor }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.foregroundSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 12,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  featureTitle: { fontSize: 13, fontWeight: '800', flexShrink: 1 },
  tierBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  featureDesc: { fontSize: 11, marginTop: 3 },
  chevronBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
