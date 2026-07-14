import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Switch, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import {
  Calendar,
  ChevronDown,
  CircuitBoard,
  Minus,
  PartyPopper,
  Play,
  Plus,
  QrCode,
  Settings2,
  Sparkles,
  Star,
  Store,
  Users,
  Utensils,
  Eye,
  MapPin,
  BookOpen,
  Timer,
  CreditCard,
  Smartphone,
  Check,
} from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { V2Shell } from '../shared/V2Shell';
import type { CustomerExperiencePrefs } from '../shared/v2Types';
import { ConfigSectionCard } from './ConfigSectionCard';
import type { IconComponent } from './configTypes';

const DEFAULT_PREFS: CustomerExperiencePrefs = {
  onlineReservations: true,
  waitlist: true,
  eventReservations: true,
  tableService: true,
  qrOrdering: true,
  counterService: false,
  selfService: false,
  smartAllocation: true,
  postVisitFeedback: true,
  maxAdvanceDays: 30,
  toleranceMinutes: 15,
  requireDeposit: false,
  journeyDiscovery: true,
  journeyReservation: true,
  journeyArrival: true,
  journeyMenu: true,
  journeyOrder: true,
  journeyTracking: true,
  journeyConsumption: true,
  journeyBill: true,
  journeyPayment: true,
  journeyPostVisit: true,
};

type ToggleKey = Exclude<
  keyof CustomerExperiencePrefs,
  'maxAdvanceDays' | 'toleranceMinutes'
>;

type JourneyKey =
  | 'journeyDiscovery'
  | 'journeyReservation'
  | 'journeyArrival'
  | 'journeyMenu'
  | 'journeyOrder'
  | 'journeyTracking'
  | 'journeyConsumption'
  | 'journeyBill'
  | 'journeyPayment'
  | 'journeyPostVisit';

interface JourneyStage {
  key: JourneyKey;
  step: number;
  label: string;
  Icon: IconComponent;
}

interface ToggleItem {
  key: ToggleKey;
  label: string;
  subtitle: string;
  Icon: IconComponent;
  iconColor: string;
}

const CHANNEL_ITEMS: ToggleItem[] = [
  {
    key: 'onlineReservations',
    label: 'Reservas Online',
    subtitle: 'Clientes podem reservar pelo app',
    Icon: Calendar,
    iconColor: '#EA580C',
  },
  {
    key: 'waitlist',
    label: 'Lista de Espera / Fila',
    subtitle: 'Fila virtual inteligente',
    Icon: Users,
    iconColor: '#0284C7',
  },
  {
    key: 'eventReservations',
    label: 'Reserva de Eventos',
    subtitle: 'Grupos e eventos especiais',
    Icon: PartyPopper,
    iconColor: '#D97706',
  },
];

const SERVICE_ITEMS: ToggleItem[] = [
  {
    key: 'tableService',
    label: 'Atendimento na Mesa',
    subtitle: 'Garçom dedicado',
    Icon: Users,
    iconColor: '#16A34A',
  },
  {
    key: 'qrOrdering',
    label: 'Pedido por QR Code',
    subtitle: 'Cliente pede pelo celular',
    Icon: QrCode,
    iconColor: '#EA580C',
  },
  {
    key: 'counterService',
    label: 'Atendimento no Balcão',
    subtitle: 'Retirada no balcão',
    Icon: Store,
    iconColor: '#CA8A04',
  },
  {
    key: 'selfService',
    label: 'Auto-serviço',
    subtitle: 'Cliente se serve',
    Icon: Utensils,
    iconColor: '#6B7280',
  },
];

const INTEL_ITEMS: ToggleItem[] = [
  {
    key: 'smartAllocation',
    label: 'Alocação inteligente',
    subtitle: 'IA sugere melhor mesa',
    Icon: Sparkles,
    iconColor: '#7C3AED',
  },
  {
    key: 'postVisitFeedback',
    label: 'Feedback pós-visita',
    subtitle: 'Avaliação automática',
    Icon: Star,
    iconColor: '#D97706',
  },
];

const JOURNEY_STAGES: JourneyStage[] = [
  { key: 'journeyDiscovery', step: 1, label: 'Descoberta', Icon: Eye },
  { key: 'journeyReservation', step: 2, label: 'Reserva', Icon: Calendar },
  { key: 'journeyArrival', step: 3, label: 'Chegada', Icon: MapPin },
  { key: 'journeyMenu', step: 4, label: 'Cardápio', Icon: BookOpen },
  { key: 'journeyOrder', step: 5, label: 'Pedido', Icon: QrCode },
  { key: 'journeyTracking', step: 6, label: 'Acompanhamento', Icon: Timer },
  { key: 'journeyConsumption', step: 7, label: 'Consumo', Icon: Utensils },
  { key: 'journeyBill', step: 8, label: 'Conta', Icon: CreditCard },
  { key: 'journeyPayment', step: 9, label: 'Pagamento', Icon: Smartphone },
  { key: 'journeyPostVisit', step: 10, label: 'Pós-visita', Icon: Star },
];

export default function ConfigExperienceScreen() {
  const colors = useColors();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<CustomerExperiencePrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reservationOpen, setReservationOpen] = useState(true);
  const [journeyOpen, setJourneyOpen] = useState(true);
  const prefsRef = useRef(prefs);
  const restaurantIdRef = useRef(restaurantId);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  useEffect(() => {
    restaurantIdRef.current = restaurantId;
  }, [restaurantId]);

  const persist = useCallback(async (next: CustomerExperiencePrefs) => {
    const id = restaurantIdRef.current;
    if (!id) return;
    try {
      const data = await supabaseApiAdapter.getRestaurantProfile();
      const currentSettings = data?.settings ?? {};
      await supabaseApiAdapter.updateRestaurantProfile(id, {
        settings: { ...currentSettings, customer_experience: next },
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar preferências');
    }
  }, []);

  const schedulePersist = useCallback(
    (next: CustomerExperiencePrefs) => {
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
        const stored = data.settings?.customer_experience;
        if (stored && typeof stored === 'object') {
          setPrefs({ ...DEFAULT_PREFS, ...stored });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar preferências');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updatePrefs = (patch: Partial<CustomerExperiencePrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      schedulePersist(next);
      return next;
    });
  };

  const toggle = (key: ToggleKey) => {
    updatePrefs({ [key]: !prefsRef.current[key] });
  };

  const toggleJourney = (key: JourneyKey) => {
    updatePrefs({ [key]: !prefsRef.current[key] });
  };

  const journeyActive = useMemo(
    () => JOURNEY_STAGES.filter((stage) => prefs[stage.key]).length,
    [prefs],
  );

  return (
    <V2Shell
      title="Experiência do Cliente"
      subtitle="Como seus clientes interagem com o estabelecimento"
      showBack
      onRefresh={load}
      headerRight={
        <View style={[styles.headerIcon, { backgroundColor: '#E0F2FE' }]}>
          <Sparkles size={18} color="#0284C7" />
        </View>
      }
    >
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          <View style={styles.journeyWrap}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setJourneyOpen((open) => !open)}
              style={[
                styles.journeyCard,
                {
                  backgroundColor: colors.card,
                  borderColor: journeyOpen ? colors.primary : colors.border,
                },
              ]}
            >
              <View style={[styles.journeyIcon, { backgroundColor: `${colors.primary}18` }]}>
                <Play size={16} color={colors.primary} fill={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.foreground }]}>Jornada do Cliente</Text>
                <Text style={[styles.rowSub, { color: colors.foregroundSecondary }]}>
                  {journeyActive}/{JOURNEY_STAGES.length} etapas ativas
                </Text>
              </View>
              <ChevronDown
                size={18}
                color={colors.foregroundSecondary}
                style={{ transform: [{ rotate: journeyOpen ? '0deg' : '-90deg' }] }}
              />
            </TouchableOpacity>

            {journeyOpen ? (
              <View style={[styles.journeyList, { borderColor: colors.border, backgroundColor: colors.card }]}>
                {JOURNEY_STAGES.map((stage, index) => {
                  const active = prefs[stage.key];
                  const Icon = stage.Icon;
                  return (
                    <TouchableOpacity
                      key={stage.key}
                      activeOpacity={0.8}
                      onPress={() => toggleJourney(stage.key)}
                      style={[
                        styles.journeyRow,
                        index < JOURNEY_STAGES.length - 1 && {
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: colors.border,
                        },
                      ]}
                    >
                      <View style={[styles.journeyStageIcon, { backgroundColor: `${colors.primary}15` }]}>
                        <Icon size={15} color={colors.primary} />
                      </View>
                      <Text style={[styles.journeyStep, { color: colors.foregroundSecondary }]}>
                        {stage.step}
                      </Text>
                      <Text style={[styles.journeyLabel, { color: colors.foreground }]}>{stage.label}</Text>
                      <View
                        style={[
                          styles.journeyCheck,
                          {
                            backgroundColor: active ? colors.success : 'transparent',
                            borderColor: active ? colors.success : colors.border,
                          },
                        ]}
                      >
                        {active ? <Check size={12} color="#FFF" strokeWidth={3} /> : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
          </View>

          <ConfigSectionCard title="Canais de Entrada" Icon={Calendar}>
            {CHANNEL_ITEMS.map((item, index) => (
              <ToggleRow
                key={item.key}
                item={item}
                value={prefs[item.key]}
                onToggle={() => toggle(item.key)}
                colors={colors}
                showDivider={index < CHANNEL_ITEMS.length - 1}
              />
            ))}
          </ConfigSectionCard>

          <ConfigSectionCard title="Modelo de Atendimento" Icon={Utensils}>
            {SERVICE_ITEMS.map((item, index) => (
              <ToggleRow
                key={item.key}
                item={item}
                value={prefs[item.key]}
                onToggle={() => toggle(item.key)}
                colors={colors}
                showDivider={index < SERVICE_ITEMS.length - 1}
              />
            ))}
          </ConfigSectionCard>

          <ConfigSectionCard title="Inteligência" Icon={CircuitBoard}>
            {INTEL_ITEMS.map((item, index) => (
              <ToggleRow
                key={item.key}
                item={item}
                value={prefs[item.key]}
                onToggle={() => toggle(item.key)}
                colors={colors}
                showDivider={index < INTEL_ITEMS.length - 1}
              />
            ))}
          </ConfigSectionCard>

          <View style={styles.wrap}>
            <TouchableOpacity
              style={styles.collapseHeader}
              onPress={() => setReservationOpen((open) => !open)}
              activeOpacity={0.8}
            >
              <View style={styles.titleRow}>
                <View style={[styles.sectionIcon, { backgroundColor: `${colors.primary}15` }]}>
                  <Settings2 size={14} color={colors.primary} />
                </View>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  Configurações de Reserva
                </Text>
              </View>
              <ChevronDown
                size={18}
                color={colors.foregroundSecondary}
                style={{ transform: [{ rotate: reservationOpen ? '0deg' : '-90deg' }] }}
              />
            </TouchableOpacity>

            {reservationOpen ? (
              <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <StepperRow
                  label="Antecedência máxima (dias)"
                  value={prefs.maxAdvanceDays}
                  suffix=""
                  min={1}
                  max={365}
                  step={1}
                  colors={colors}
                  onChange={(maxAdvanceDays) => updatePrefs({ maxAdvanceDays })}
                  showDivider
                />
                <StepperRow
                  label="Tolerância (min)"
                  value={prefs.toleranceMinutes}
                  suffix="min"
                  min={0}
                  max={120}
                  step={5}
                  colors={colors}
                  onChange={(toleranceMinutes) => updatePrefs({ toleranceMinutes })}
                  showDivider
                />
                <ToggleRow
                  item={{
                    key: 'requireDeposit',
                    label: 'Exigir depósito',
                    subtitle: 'Caução na reserva',
                    Icon: Settings2,
                    iconColor: colors.foregroundSecondary,
                  }}
                  value={prefs.requireDeposit}
                  onToggle={() => toggle('requireDeposit')}
                  colors={colors}
                  showDivider={false}
                  hideIcon
                />
              </View>
            ) : null}
          </View>

          {error ? (
            <Text style={{ textAlign: 'center', color: '#EF4444', marginTop: 8 }}>{error}</Text>
          ) : null}
        </>
      )}
    </V2Shell>
  );
}

function ToggleRow({
  item,
  value,
  onToggle,
  colors,
  showDivider,
  hideIcon = false,
}: {
  item: ToggleItem;
  value: boolean;
  onToggle: () => void;
  colors: ReturnType<typeof useColors>;
  showDivider: boolean;
  hideIcon?: boolean;
}) {
  const Icon = item.Icon;
  return (
    <View
      style={[
        styles.row,
        showDivider && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
    >
      {!hideIcon ? (
        <View style={[styles.itemIcon, { backgroundColor: `${item.iconColor}18` }]}>
          <Icon size={16} color={item.iconColor} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: colors.foreground }]}>{item.label}</Text>
        <Text style={[styles.rowSub, { color: colors.foregroundSecondary }]}>{item.subtitle}</Text>
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
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  journeyWrap: { marginBottom: 14 },
  journeyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  journeyList: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 8,
  },
  journeyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  journeyStageIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  journeyStep: { width: 14, fontSize: 13, fontWeight: '700' },
  journeyLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  journeyCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  journeyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrap: { marginBottom: 14 },
  collapseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { fontSize: 13, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: 14, fontWeight: '700' },
  rowSub: { fontSize: 12, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: { minWidth: 44, textAlign: 'center', fontSize: 14, fontWeight: '700' },
});
