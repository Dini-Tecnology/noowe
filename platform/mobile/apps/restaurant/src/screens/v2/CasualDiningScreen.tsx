import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import {
  Baby,
  Car,
  Check,
  Clock,
  Dog,
  Minus,
  Plus,
  Sofa,
  Sparkles,
  Sun,
  Users,
  Wifi,
} from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import {
  CASUAL_DINING_AMENITY_PRESENTATION,
  CASUAL_DINING_DISCOVERY_AMENITIES,
  CASUAL_DINING_SERVICE_AMENITIES,
  DEFAULT_CASUAL_DINING_CONFIG,
  parseCasualDiningConfig,
  serializeCasualDiningConfig,
  type CasualDiningAmenity,
  type CasualDiningConfig,
} from '@okinawa/shared/config/casual-dining';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';
import { V2Shell } from './shared/V2Shell';
import { ConfigSectionCard } from './config/ConfigSectionCard';
import { userErrorMessage } from '@okinawa/shared/utils/user-error-message';

/** lucide icon per amenity — kept local since the shared config only owns Ionicons names for the client app. */
const AMENITY_ICONS: Partial<Record<CasualDiningAmenity, typeof Baby>> = {
  kids_friendly: Baby,
  pet_friendly: Dog,
  outdoor_seating: Sun,
  parking: Car,
  accessible: Sofa,
  wifi: Wifi,
};

export default function CasualDiningScreen() {
  const colors = useColors();
  const { restaurantId } = useRestaurantRole();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [amenities, setAmenities] = useState<CasualDiningAmenity[]>([]);
  const [config, setConfig] = useState<CasualDiningConfig>(DEFAULT_CASUAL_DINING_CONFIG);

  const amenitiesRef = useRef(amenities);
  const configRef = useRef(config);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { amenitiesRef.current = amenities; }, [amenities]);
  useEffect(() => { configRef.current = config; }, [config]);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    try {
      setError(null);
      const data = await supabaseApiAdapter.getCasualDiningConfig(restaurantId);
      const rawAmenities = Array.isArray(data?.amenities) ? data.amenities : [];
      setAmenities(
        rawAmenities.filter((key: unknown): key is CasualDiningAmenity =>
          typeof key === 'string' && key in CASUAL_DINING_AMENITY_PRESENTATION,
        ),
      );
      setConfig(parseCasualDiningConfig(data?.config));
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
      await supabaseApiAdapter.updateCasualDiningConfig(
        restaurantId,
        amenitiesRef.current,
        serializeCasualDiningConfig(configRef.current),
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

  const toggleAmenity = useCallback((key: CasualDiningAmenity) => {
    setAmenities((current) => {
      const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
      return next;
    });
    schedulePersist();
  }, [schedulePersist]);

  const updateConfig = useCallback((patch: Partial<CasualDiningConfig>) => {
    setConfig((current) => ({ ...current, ...patch }));
    schedulePersist();
  }, [schedulePersist]);

  const toggleConfig = useCallback((key: keyof CasualDiningConfig) => {
    updateConfig({ [key]: !configRef.current[key] } as Partial<CasualDiningConfig>);
  }, [updateConfig]);

  const familyModeSummary = useMemo(() => {
    if (!config.familyMode) return 'Desativado';
    return amenities.includes('kids_friendly') ? 'Ativo · Cardápio kids em destaque' : 'Ativo';
  }, [config.familyMode, amenities]);

  return (
    <V2Shell
      title="Casual Dining"
      subtitle="Waitlist, modo família, grupos"
      showBack
      onRefresh={load}
      headerRight={
        <View style={[styles.headerIcon, { backgroundColor: '#FEF3E2' }]}>
          <Sparkles size={18} color="#EA580C" />
        </View>
      }
    >
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          <ConfigSectionCard title="Filtros de Descoberta" Icon={Users}>
            <View style={styles.chipsWrap}>
              {CASUAL_DINING_DISCOVERY_AMENITIES.map((key) => {
                const selected = amenities.includes(key);
                const Icon = AMENITY_ICONS[key] ?? Check;
                const presentation = CASUAL_DINING_AMENITY_PRESENTATION[key];
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => toggleAmenity(key)}
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
                      {presentation.longLabel ?? presentation.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ConfigSectionCard>

          <ConfigSectionCard title="Comodidades" Icon={Sofa}>
            <View style={styles.chipsWrap}>
              {CASUAL_DINING_SERVICE_AMENITIES.map((key) => {
                const selected = amenities.includes(key);
                const Icon = AMENITY_ICONS[key] ?? Check;
                const presentation = CASUAL_DINING_AMENITY_PRESENTATION[key];
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => toggleAmenity(key)}
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

          <ConfigSectionCard title="Modo Família" Icon={Baby}>
            <ToggleRow
              label="Modo Família"
              subtitle={familyModeSummary}
              value={config.familyMode}
              onToggle={() => toggleConfig('familyMode')}
              colors={colors}
              showDivider
            />
            <ToggleRow
              label="Botão chamar garçom"
              subtitle={config.callWaiterButton ? 'Visível no cardápio e na comanda' : 'Desativado'}
              value={config.callWaiterButton}
              onToggle={() => toggleConfig('callWaiterButton')}
              colors={colors}
              showDivider
            />
            <ToggleRow
              label="Pedido compartilhado"
              subtitle={config.sharedOrdering ? 'Cada pessoa pede pelo próprio celular' : 'Desativado'}
              value={config.sharedOrdering}
              onToggle={() => toggleConfig('sharedOrdering')}
              colors={colors}
              showDivider={false}
            />
          </ConfigSectionCard>

          <ConfigSectionCard title="Lista de Espera" Icon={Clock}>
            <ToggleRow
              label="Fila inteligente"
              subtitle={config.waitlistEnabled ? 'Aceita walk-in com fila' : 'Somente reserva'}
              value={config.waitlistEnabled}
              onToggle={() => toggleConfig('waitlistEnabled')}
              colors={colors}
              showDivider
            />
            <ToggleRow
              label="Reserva opcional"
              subtitle={config.reservationsOptional ? 'Aceita walk-in e reserva' : 'Reserva obrigatória'}
              value={config.reservationsOptional}
              onToggle={() => toggleConfig('reservationsOptional')}
              colors={colors}
              showDivider
            />
            <ToggleRow
              label="Mostrar tempo estimado"
              subtitle={config.estimatedWaitDisplay ? 'Cliente vê a espera em tempo real' : 'Oculto'}
              value={config.estimatedWaitDisplay}
              onToggle={() => toggleConfig('estimatedWaitDisplay')}
              colors={colors}
              showDivider={false}
            />
          </ConfigSectionCard>

          <ConfigSectionCard title="Grupos" Icon={Users}>
            <StepperRow
              label="Tamanho máximo do grupo"
              value={config.maxGroupSize}
              suffix=" pessoas"
              min={2}
              max={40}
              step={1}
              colors={colors}
              onChange={(maxGroupSize) => updateConfig({ maxGroupSize })}
              showDivider
            />
            <StepperRow
              label="Reserva obrigatória a partir de"
              value={config.groupReservationRequired}
              suffix=" pessoas"
              min={2}
              max={config.maxGroupSize}
              step={1}
              colors={colors}
              onChange={(groupReservationRequired) => updateConfig({ groupReservationRequired })}
              showDivider={false}
            />
          </ConfigSectionCard>

          {error ? (
            <Text style={{ textAlign: 'center', color: '#EF4444', marginTop: 8 }}>{error}</Text>
          ) : null}
        </>
      )}
    </V2Shell>
  );
}

function ToggleRow({
  label,
  subtitle,
  value,
  onToggle,
  colors,
  showDivider,
}: {
  label: string;
  subtitle: string;
  value: boolean;
  onToggle: () => void;
  colors: ReturnType<typeof useColors>;
  showDivider: boolean;
}) {
  return (
    <View
      style={[
        styles.row,
        showDivider && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: colors.foreground }]}>{label}</Text>
        <Text style={[styles.rowSub, { color: colors.foregroundSecondary }]}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: colors.border, true: `${colors.primary}80` }}
        thumbColor={value ? colors.primary : colors.foregroundSecondary}
      />
    </View>
  );
}

function StepperRow({
  label,
  value,
  suffix,
  min,
  max,
  step,
  colors,
  onChange,
  showDivider,
}: {
  label: string;
  value: number;
  suffix: string;
  min: number;
  max: number;
  step: number;
  colors: ReturnType<typeof useColors>;
  onChange: (next: number) => void;
  showDivider: boolean;
}) {
  return (
    <View
      style={[
        styles.row,
        showDivider && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
    >
      <Text style={[styles.rowTitle, { flex: 1, color: colors.foreground }]}>{label}</Text>
      <View style={styles.stepper}>
        <TouchableOpacity
          style={[styles.stepBtn, { borderColor: colors.border }]}
          onPress={() => onChange(Math.max(min, value - step))}
          accessibilityLabel={`Diminuir ${label}`}
        >
          <Minus size={14} color={colors.foregroundSecondary} />
        </TouchableOpacity>
        <Text style={[styles.stepValue, { color: colors.foreground }]}>
          {value}
          {suffix}
        </Text>
        <TouchableOpacity
          style={[styles.stepBtn, { borderColor: colors.border }]}
          onPress={() => onChange(Math.min(max, value + step))}
          accessibilityLabel={`Aumentar ${label}`}
        >
          <Plus size={14} color={colors.foregroundSecondary} />
        </TouchableOpacity>
      </View>
    </View>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  rowTitle: { fontSize: 14, fontWeight: '600' },
  rowSub: { fontSize: 12, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  stepValue: { fontSize: 14, fontWeight: '700', minWidth: 76, textAlign: 'center' },
});
