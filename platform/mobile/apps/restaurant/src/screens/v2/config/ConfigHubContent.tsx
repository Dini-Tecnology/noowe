import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Image as ImageIcon,
  Tag,
  Users,
  LayoutGrid,
  Bell,
  Download,
  Trash2,
  LogOut,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { useRestaurantRole } from '../../../contexts/RestaurantRoleContext';
import { ConfigHero } from './ConfigHero';
import { ConfigTipCard } from './ConfigTipCard';
import { ConfigModuleCard } from './ConfigModuleCard';
import { ConfigUserCard } from './ConfigUserCard';
import { useAccountActions } from './useAccountActions';
import { useRegisterRemoteRefresh } from '../shared/remoteRefreshRegistry';
import {
  CONFIG_MODULES,
  SERVICE_TYPE_CATALOG,
  calculateProfileProgress,
  calculateServiceTypesProgress,
  calculateExperienceProgress,
  calculateFloorProgress,
  calculateMenuProgress,
  calculateTeamProgress,
  calculateKitchenProgress,
  calculatePaymentsProgress,
  calculateMarketplaceProgress,
  statusFromProgress,
  type ConfigModuleStatus,
} from './configTypes';

const TIP_STORAGE_KEY = 'restaurant_config_hub_tip_dismissed';

interface ModuleState {
  progress: number;
  status: ConfigModuleStatus;
}

interface ProgressMap {
  profile: number;
  service: number;
  experience: number;
  floor: number;
  menu: number;
  team: number;
  kitchen: number;
  payments: number;
  marketplace: number;
}

const EMPTY_PROGRESS: ProgressMap = {
  profile: 0,
  service: 0,
  experience: 0,
  floor: 0,
  menu: 0,
  team: 0,
  kitchen: 0,
  payments: 0,
  marketplace: 0,
};

interface ConfigHubContentProps {
  /** When true, omit LGPD/logout footer (manager hub already has sign-out in header). */
  compact?: boolean;
}

export function ConfigHubContent({ compact = false }: ConfigHubContentProps) {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const { restaurantId, restaurants } = useRestaurantRole();
  const currentRestaurant = restaurants.find((r) => r.id === restaurantId);

  const [showTip, setShowTip] = useState(true);
  const [restaurantName, setRestaurantName] = useState(currentRestaurant?.name ?? 'Restaurante');
  const [serviceLabel, setServiceLabel] = useState(currentRestaurant?.serviceType ?? '');
  const [progressMap, setProgressMap] = useState<ProgressMap>(EMPTY_PROGRESS);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(TIP_STORAGE_KEY)
      .then((value) => {
        if (!cancelled && value === '1') setShowTip(false);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const loadProgress = useCallback(async () => {
    if (!restaurantId) {
      setProgressMap(EMPTY_PROGRESS);
      return;
    }

    try {
      const results = await Promise.allSettled([
        supabaseApiAdapter.getRestaurantProfile(restaurantId),
        supabaseApiAdapter.getServiceConfigs(restaurantId),
        supabaseApiAdapter.getRestaurantTables(restaurantId),
        supabaseApiAdapter.getMenu(restaurantId, true),
        supabaseApiAdapter.getStaff(restaurantId),
        supabaseApiAdapter.getCookStations(restaurantId),
        supabaseApiAdapter.getKdsConfig(restaurantId),
      ]);

      const profile = results[0].status === 'fulfilled' ? results[0].value : null;
      const configs = results[1].status === 'fulfilled' ? results[1].value : [];
      const tables = results[2].status === 'fulfilled' ? results[2].value : [];
      const menu = results[3].status === 'fulfilled' ? results[3].value : [];
      const staff = results[4].status === 'fulfilled' ? results[4].value : [];
      const stations = results[5].status === 'fulfilled' ? results[5].value : [];
      const kdsConfig = results[6].status === 'fulfilled' ? results[6].value : null;

      if (profile) {
        setRestaurantName(profile.name ?? currentRestaurant?.name ?? 'Restaurante');
        const typeId = profile.service_type ?? currentRestaurant?.serviceType ?? '';
        const typeMeta = SERVICE_TYPE_CATALOG.find((t) => t.id === typeId);
        setServiceLabel(typeMeta?.name ?? typeId.replace(/_/g, ' '));
      }

      const rows = Array.isArray(configs) ? configs : [];
      const activeCount = rows.filter((row: { is_active?: boolean }) => row.is_active).length;

      setProgressMap({
        profile: profile ? calculateProfileProgress(profile) : 0,
        service: calculateServiceTypesProgress(activeCount),
        experience: calculateExperienceProgress(profile?.settings?.customer_experience),
        floor: calculateFloorProgress(Array.isArray(tables) ? tables : []),
        menu: calculateMenuProgress(Array.isArray(menu) ? menu : []),
        team: calculateTeamProgress(Array.isArray(staff) ? staff : []),
        kitchen: calculateKitchenProgress(Array.isArray(stations) ? stations : [], kdsConfig),
        payments: calculatePaymentsProgress(profile?.settings?.payment_methods),
        marketplace: calculateMarketplaceProgress(profile?.features),
      });
    } catch {
      // keep previous progress values
    }
  }, [restaurantId, currentRestaurant?.name, currentRestaurant?.serviceType]);

  useRegisterRemoteRefresh(loadProgress);

  useEffect(() => {
    void loadProgress();
    const unsubscribe = navigation.addListener?.('focus', () => {
      void loadProgress();
    });
    return typeof unsubscribe === 'function' ? unsubscribe : undefined;
  }, [loadProgress, navigation]);

  const moduleStates = useMemo(() => {
    const byId: Record<string, number> = {
      'config-profile': progressMap.profile,
      'config-service-types': progressMap.service,
      'config-experience': progressMap.experience,
      'config-floor': progressMap.floor,
      'config-menu': progressMap.menu,
      'config-team': progressMap.team,
      'config-kitchen': progressMap.kitchen,
      'config-payments': progressMap.payments,
      'config-marketplace': progressMap.marketplace,
    };

    const map: Record<string, ModuleState> = {};
    for (const mod of CONFIG_MODULES) {
      const progress = byId[mod.id] ?? mod.staticProgress;
      map[mod.id] = { progress, status: statusFromProgress(progress) };
    }
    return map;
  }, [progressMap]);

  const overallProgress = useMemo(() => {
    const values = CONFIG_MODULES.map((m) => moduleStates[m.id]?.progress ?? 0);
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  }, [moduleStates]);

  const stats = useMemo(() => {
    const statuses = CONFIG_MODULES.map((m) => moduleStates[m.id]?.status ?? 'needs-attention');
    return {
      complete: statuses.filter((s) => s === 'complete').length,
      configured: statuses.filter((s) => s === 'configured').length,
      pending: statuses.filter((s) => s === 'needs-attention').length,
    };
  }, [moduleStates]);

  const { handleSignOut, handleExportData, handleDeleteAccount } = useAccountActions();

  const dismissTip = async () => {
    setShowTip(false);
    try {
      await AsyncStorage.setItem(TIP_STORAGE_KEY, '1');
    } catch {
      // ignore
    }
  };

  const openModule = (route: string, params?: Record<string, unknown>) => {
    if (route === 'Tables' || route === 'Kitchen' || route === 'Orders' || route === 'Hub' || route === 'Settings') {
      navigation.navigate('Tabs', { screen: route });
      return;
    }
    if (params) navigation.navigate(route, params);
    else navigation.navigate(route);
  };

  const quickActions = [
    {
      label: 'Atualizar fotos',
      Icon: ImageIcon,
      color: colors.primary,
      onPress: () => openModule('RestaurantProfile', { initialTab: 'info' }),
    },
    {
      label: 'Editar preços',
      Icon: Tag,
      color: colors.success,
      onPress: () => openModule('Menu'),
    },
    {
      label: 'Escalar equipe',
      Icon: Users,
      color: colors.info ?? '#0284C7',
      onPress: () => openModule('Staff'),
    },
    {
      label: 'Ajustar mesas',
      Icon: LayoutGrid,
      color: colors.warning,
      onPress: () => openModule('ConfigFloor'),
    },
  ];

  const footerItems = [
    {
      icon: Bell,
      label: 'Notificações',
      subtitle: 'Alertas e avisos',
      onPress: () => openModule('NotificationSettings'),
    },
    {
      icon: Download,
      label: 'Exportar meus dados',
      subtitle: 'Baixe uma cópia dos seus dados (LGPD)',
      onPress: () => void handleExportData(),
    },
    {
      icon: Trash2,
      label: 'Excluir minha conta',
      subtitle: 'Solicitar exclusão dos seus dados',
      onPress: handleDeleteAccount,
    },
    {
      icon: LogOut,
      label: 'Sair da conta',
      subtitle: 'Encerrar sessão neste dispositivo',
      onPress: handleSignOut,
    },
  ];

  return (
    <View>
      <ConfigUserCard />
      <ConfigHero
        restaurantName={restaurantName}
        serviceLabel={serviceLabel}
        overallProgress={overallProgress}
      />

      {showTip ? <ConfigTipCard onDismiss={() => void dismissTip()} /> : null}

      <View style={styles.statsRow}>
        <StatCard value={stats.complete} label="Completos" tone="success" colors={colors} />
        <StatCard value={stats.configured} label="Configurados" tone="primary" colors={colors} />
        <StatCard value={stats.pending} label="Pendentes" tone="warning" colors={colors} />
      </View>

      <View style={{ marginTop: 4 }}>
        {CONFIG_MODULES.map((mod) => {
          const state = moduleStates[mod.id];
          return (
            <ConfigModuleCard
              key={mod.id}
              label={mod.label}
              desc={mod.desc}
              progress={state.progress}
              status={state.status}
              Icon={mod.Icon}
              iconColor={mod.iconColor}
              onPress={() => openModule(mod.route)}
            />
          );
        })}
      </View>

      <View style={[styles.quickCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Text style={[styles.quickTitle, { color: colors.foregroundSecondary }]}>Ações rápidas</Text>
        <View style={styles.quickGrid}>
          {quickActions.map((action) => (
            <TouchableOpacity
              key={action.label}
              onPress={action.onPress}
              style={[styles.quickBtn, { backgroundColor: colors.backgroundSecondary }]}
            >
              <action.Icon size={14} color={action.color} />
              <Text style={[styles.quickLabel, { color: colors.foreground }]}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {!compact ? (
        <View style={[styles.footerList, { borderColor: colors.border, backgroundColor: colors.card }]}>
          {footerItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <TouchableOpacity
                key={item.label}
                onPress={item.onPress}
                style={[
                  styles.footerRow,
                  index < footerItems.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <View style={[styles.footerIcon, { backgroundColor: `${colors.primary}15` }]}>
                  <Icon size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.footerLabel, { color: colors.foreground }]}>{item.label}</Text>
                  <Text style={[styles.footerSub, { color: colors.foregroundSecondary }]}>{item.subtitle}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

    </View>
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
  tone: 'success' | 'primary' | 'warning';
  colors: ReturnType<typeof useColors>;
}) {
  const toneColor =
    tone === 'success' ? colors.success : tone === 'warning' ? colors.warning : colors.primary;
  return (
    <View
      style={[
        styles.statCard,
        { borderColor: `${toneColor}33`, backgroundColor: `${toneColor}0D` },
      ]}
    >
      <Text style={[styles.statValue, { color: toneColor }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.foregroundSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 9, fontWeight: '600', marginTop: 2 },
  quickCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginTop: 8,
    marginBottom: 12,
  },
  quickTitle: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickBtn: {
    width: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  quickLabel: { fontSize: 11, fontWeight: '600' },
  footerList: { borderWidth: 1, borderRadius: 16, overflow: 'hidden', marginBottom: 8 },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  footerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerLabel: { fontSize: 14, fontWeight: '700' },
  footerSub: { fontSize: 11, marginTop: 2 },
});
