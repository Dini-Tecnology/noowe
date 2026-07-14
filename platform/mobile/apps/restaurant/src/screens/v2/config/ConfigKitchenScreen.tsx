import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from 'react-native-paper';
import {
  Bell,
  Check,
  ChefHat,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Flame,
  Monitor,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  User,
  Wine,
} from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { useRestaurantRole } from '../../../contexts/RestaurantRoleContext';
import { V2ConfirmDialog } from '../shared/V2ConfirmDialog';
import { V2FormSheet } from '../shared/V2FormSheet';
import { V2Shell } from '../shared/V2Shell';
import type { KitchenBarKdsPrefs } from '../shared/v2Types';
import { ConfigSectionCard } from './ConfigSectionCard';

type StationType = 'kitchen' | 'bar' | 'drinks' | 'pastry' | 'cold';

interface CookStation {
  id: string;
  name: string;
  station_type: StationType | string;
  display_color?: string | null;
  description?: string | null;
  kds_label?: string | null;
  late_threshold_minutes?: number | null;
  display_order?: number | null;
}

const DEFAULT_KDS: KitchenBarKdsPrefs = {
  kdsScreens: 2,
  defaultPrepMinutes: 15,
  autoRouting: true,
  priorityAlerts: true,
  fireOrderEnabled: true,
  batchCooking: false,
};

const FLOW_STEPS = [
  { label: 'Pedido', Icon: ClipboardList },
  { label: 'KDS', Icon: Monitor },
  { label: 'Estação', Icon: Flame },
  { label: 'Pronto', Icon: Check },
  { label: 'Entrega', Icon: User },
];

const STATION_COLORS = ['#EF4444', '#0284C7', '#CA8A04', '#EA580C', '#7C3AED', '#059669'];

function stationIconColor(station: CookStation, index: number) {
  if (station.display_color) return station.display_color;
  return STATION_COLORS[index % STATION_COLORS.length];
}

function isBarStation(type: string) {
  return type === 'bar' || type === 'drinks';
}

export default function ConfigKitchenScreen() {
  const colors = useColors();
  const { restaurantId } = useRestaurantRole();
  const [stations, setStations] = useState<CookStation[]>([]);
  const [kds, setKds] = useState<KitchenBarKdsPrefs>(DEFAULT_KDS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prepOpen, setPrepOpen] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editor, setEditor] = useState<CookStation | null | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<CookStation | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kdsLabel, setKdsLabel] = useState('KDS 1');
  const [prepMinutes, setPrepMinutes] = useState('12');
  const [stationType, setStationType] = useState<StationType>('kitchen');
  const [formError, setFormError] = useState<string | null>(null);
  const kdsRef = useRef(kds);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    kdsRef.current = kds;
  }, [kds]);

  const persistKds = useCallback(
    async (next: KitchenBarKdsPrefs) => {
      if (!restaurantId) return;
      try {
        await supabaseApiAdapter.updateKdsConfig(restaurantId, {
          kds_screens: next.kdsScreens,
          default_prep_minutes: next.defaultPrepMinutes,
          auto_routing: next.autoRouting,
          priority_alerts: next.priorityAlerts,
          fire_order_enabled: next.fireOrderEnabled,
          batch_cooking: next.batchCooking,
        });
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao salvar configurações KDS');
      }
    },
    [restaurantId],
  );

  const scheduleKdsPersist = useCallback(
    (next: KitchenBarKdsPrefs) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void persistKds(next);
      }, 350);
    },
    [persistKds],
  );

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  const load = useCallback(async () => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const [rawStations, rawKds] = await Promise.all([
        supabaseApiAdapter.getCookStations(restaurantId),
        supabaseApiAdapter.getKdsConfig(restaurantId),
      ]);
      setStations(Array.isArray(rawStations) ? rawStations : []);
      if (rawKds && typeof rawKds === 'object') {
        setKds({
          kdsScreens: Number(rawKds.kds_screens ?? DEFAULT_KDS.kdsScreens),
          defaultPrepMinutes: Number(rawKds.default_prep_minutes ?? DEFAULT_KDS.defaultPrepMinutes),
          autoRouting: rawKds.auto_routing ?? DEFAULT_KDS.autoRouting,
          priorityAlerts: rawKds.priority_alerts ?? DEFAULT_KDS.priorityAlerts,
          fireOrderEnabled: rawKds.fire_order_enabled ?? DEFAULT_KDS.fireOrderEnabled,
          batchCooking: rawKds.batch_cooking ?? DEFAULT_KDS.batchCooking,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar Cozinha & Bar');
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateKds = (patch: Partial<KitchenBarKdsPrefs>) => {
    setKds((prev) => {
      const next = { ...prev, ...patch };
      scheduleKdsPersist(next);
      return next;
    });
  };

  const openEditor = (station?: CookStation) => {
    setName(station?.name ?? '');
    setDescription(station?.description ?? '');
    setKdsLabel(station?.kds_label ?? 'KDS 1');
    setPrepMinutes(String(station?.late_threshold_minutes ?? 12));
    setStationType((station?.station_type as StationType) || 'kitchen');
    setFormError(null);
    setEditor(station ?? null);
  };

  const closeEditor = () => {
    if (isSubmitting) return;
    setEditor(undefined);
    setFormError(null);
  };

  const saveStation = async () => {
    if (!restaurantId) return;
    const cleanName = name.trim();
    const minutes = Number(prepMinutes);
    if (!cleanName) {
      setFormError('Informe o nome da estação.');
      return;
    }
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 120) {
      setFormError('Informe um tempo entre 1 e 120 minutos.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        name: cleanName,
        description: description.trim(),
        kds_label: kdsLabel.trim() || 'KDS 1',
        late_threshold_minutes: minutes,
        station_type: stationType,
        display_color: STATION_COLORS[stations.length % STATION_COLORS.length],
      };
      if (editor) {
        await supabaseApiAdapter.updateCookStation(editor.id, payload);
      } else {
        await supabaseApiAdapter.createCookStation(restaurantId, payload);
      }
      setEditor(undefined);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não foi possível salvar a estação.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsSubmitting(true);
    try {
      await supabaseApiAdapter.deleteCookStation(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível excluir a estação.');
      setDeleteTarget(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <V2Shell
        title="Cozinha & Bar"
        subtitle="Estações, KDS e fluxo operacional"
        showBack
        onRefresh={load}
        headerRight={
          <View style={[styles.headerIcon, { backgroundColor: '#FEE2E2' }]}>
            <ChefHat size={18} color="#EF4444" />
          </View>
        }
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            <View style={[styles.flowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.flowTitle, { color: colors.foregroundSecondary }]}>FLUXO DE PRODUÇÃO</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.flowRow}>
                {FLOW_STEPS.map((step, index) => {
                  const Icon = step.Icon;
                  return (
                    <View key={step.label} style={styles.flowStep}>
                      <View style={[styles.flowIcon, { backgroundColor: `${colors.primary}15` }]}>
                        <Icon size={16} color={colors.primary} />
                      </View>
                      <Text style={[styles.flowLabel, { color: colors.foregroundSecondary }]}>{step.label}</Text>
                      {index < FLOW_STEPS.length - 1 ? (
                        <View style={[styles.flowLine, { backgroundColor: colors.border }]} />
                      ) : null}
                    </View>
                  );
                })}
              </ScrollView>
              <View style={styles.flowNav}>
                <ChevronLeft size={14} color={colors.foregroundSecondary} />
                <View style={[styles.flowTrack, { backgroundColor: colors.border }]}>
                  <View style={[styles.flowThumb, { backgroundColor: colors.foregroundSecondary }]} />
                </View>
                <ChevronRight size={14} color={colors.foregroundSecondary} />
              </View>
            </View>

            <View style={styles.listHeader}>
              <Text style={[styles.sectionHeading, { color: colors.foreground }]}>Estações de Preparo</Text>
              <Pressable onPress={() => openEditor()} hitSlop={8} style={styles.newBtn}>
                <Plus size={14} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>Nova</Text>
              </Pressable>
            </View>

            <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
              {stations.length === 0 ? (
                <View style={styles.emptyStations}>
                  <Text style={{ color: colors.foregroundSecondary, textAlign: 'center', fontSize: 13 }}>
                    Nenhuma estação cadastrada. Adicione Grill, Frios, Bar e outras.
                  </Text>
                  <Pressable style={[styles.emptyCta, { backgroundColor: colors.primary }]} onPress={() => openEditor()}>
                    <Plus size={16} color="#FFF" />
                    <Text style={{ color: '#FFF', fontWeight: '700' }}>Nova estação</Text>
                  </Pressable>
                </View>
              ) : (
                stations.map((station, index) => {
                  const color = stationIconColor(station, index);
                  const Icon = isBarStation(String(station.station_type)) ? Wine : ChefHat;
                  const subtitle = [station.description, station.kds_label].filter(Boolean).join(' - ');
                  return (
                    <View
                      key={station.id}
                      style={[
                        styles.stationRow,
                        index < stations.length - 1 && {
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: colors.border,
                        },
                      ]}
                    >
                      <View style={[styles.stationIcon, { backgroundColor: `${color}18` }]}>
                        <Icon size={16} color={color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.rowTitle, { color: colors.foreground }]}>{station.name}</Text>
                        <Text style={[styles.rowSub, { color: colors.foregroundSecondary }]}>
                          {subtitle || 'Estação de preparo'}
                        </Text>
                      </View>
                      <Text style={[styles.prepTime, { color: colors.foreground }]}>
                        {Number(station.late_threshold_minutes ?? 0)}min
                      </Text>
                      <Pressable
                        onPress={() => openEditor(station)}
                        style={[styles.iconBtn, { backgroundColor: colors.backgroundSecondary }]}
                      >
                        <Pencil size={14} color={colors.foregroundSecondary} />
                      </Pressable>
                      <Pressable
                        onPress={() => setDeleteTarget(station)}
                        style={[styles.iconBtn, { backgroundColor: '#FEF2F2' }]}
                      >
                        <Trash2 size={14} color="#EF4444" />
                      </Pressable>
                    </View>
                  );
                })
              )}
            </View>

            <ConfigSectionCard title="Configurações KDS" Icon={Monitor}>
              <StepperRow
                label="Telas KDS"
                value={kds.kdsScreens}
                suffix=""
                min={1}
                max={8}
                step={1}
                colors={colors}
                onChange={(kdsScreens) => updateKds({ kdsScreens })}
                showDivider
              />
              <StepperRow
                label="Tempo padrão (min)"
                value={kds.defaultPrepMinutes}
                suffix="min"
                min={1}
                max={120}
                step={1}
                colors={colors}
                onChange={(defaultPrepMinutes) => updateKds({ defaultPrepMinutes })}
                showDivider
              />
              <ToggleRow
                label="Roteamento automático"
                subtitle="Enviar itens para estação correta"
                Icon={RefreshCw}
                value={kds.autoRouting}
                onToggle={() => updateKds({ autoRouting: !kdsRef.current.autoRouting })}
                colors={colors}
                showDivider
              />
              <ToggleRow
                label="Alertas de prioridade"
                subtitle="Notificar itens atrasados"
                Icon={Bell}
                value={kds.priorityAlerts}
                onToggle={() => updateKds({ priorityAlerts: !kdsRef.current.priorityAlerts })}
                colors={colors}
                showDivider={false}
              />
            </ConfigSectionCard>

            <View style={styles.wrap}>
              <TouchableOpacity
                style={styles.collapseHeader}
                onPress={() => setPrepOpen((open) => !open)}
                activeOpacity={0.8}
              >
                <View style={styles.titleRow}>
                  <View style={[styles.sectionIcon, { backgroundColor: `${colors.primary}15` }]}>
                    <Settings2 size={14} color={colors.primary} />
                  </View>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Modo de Preparo</Text>
                </View>
                <ChevronDown
                  size={18}
                  color={colors.foregroundSecondary}
                  style={{ transform: [{ rotate: prepOpen ? '0deg' : '-90deg' }] }}
                />
              </TouchableOpacity>
              {prepOpen ? (
                <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <ToggleRow
                    label="Fire Order"
                    subtitle="Chef controla quando iniciar cada prato"
                    value={kds.fireOrderEnabled}
                    onToggle={() => updateKds({ fireOrderEnabled: !kdsRef.current.fireOrderEnabled })}
                    colors={colors}
                    showDivider
                  />
                  <ToggleRow
                    label="Batch Cooking"
                    subtitle="Agrupar itens iguais"
                    value={kds.batchCooking}
                    onToggle={() => updateKds({ batchCooking: !kdsRef.current.batchCooking })}
                    colors={colors}
                    showDivider={false}
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

      <V2FormSheet
        visible={editor !== undefined}
        title={editor ? 'Editar estação' : 'Nova estação'}
        subtitle="Nome, tipo, KDS e tempo alvo de preparo"
        saveLabel={editor ? 'Salvar alterações' : 'Cadastrar estação'}
        saving={isSubmitting}
        onClose={closeEditor}
        onSave={() => void saveStation()}
      >
        <Field label="Nome" required colors={colors}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Ex.: Grill / Chapa"
            placeholderTextColor={colors.foregroundMuted}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
          />
        </Field>
        <Field label="Descrição" colors={colors}>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Ex.: Carnes, grelhados"
            placeholderTextColor={colors.foregroundMuted}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
          />
        </Field>
        <Field label="Rótulo KDS" colors={colors}>
          <TextInput
            value={kdsLabel}
            onChangeText={setKdsLabel}
            placeholder="Ex.: KDS 1 ou KDS Bar"
            placeholderTextColor={colors.foregroundMuted}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
          />
        </Field>
        <Field label="Tempo alvo (min)" required colors={colors}>
          <TextInput
            value={prepMinutes}
            onChangeText={(value) => setPrepMinutes(value.replace(/\D/g, '').slice(0, 3))}
            keyboardType="number-pad"
            placeholder="12"
            placeholderTextColor={colors.foregroundMuted}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
          />
        </Field>
        <Field label="Tipo" colors={colors}>
          <View style={styles.shapeRow}>
            {[
              { id: 'kitchen' as const, label: 'Cozinha' },
              { id: 'cold' as const, label: 'Frios' },
              { id: 'pastry' as const, label: 'Confeitaria' },
              { id: 'bar' as const, label: 'Bar' },
            ].map((option) => {
              const active = stationType === option.id;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => setStationType(option.id)}
                  style={[
                    styles.shapeChip,
                    {
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? `${colors.primary}12` : colors.card,
                    },
                  ]}
                >
                  <Text style={{ color: active ? colors.primary : colors.foregroundSecondary, fontWeight: '700', fontSize: 12 }}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Field>
        {formError ? <Text style={styles.formError}>{formError}</Text> : null}
      </V2FormSheet>

      <V2ConfirmDialog
        visible={deleteTarget !== null}
        title="Excluir estação?"
        message={`A estação “${deleteTarget?.name ?? ''}” será removida do KDS.`}
        confirmLabel="Excluir"
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}

function Field({
  label,
  required,
  colors,
  children,
}: {
  label: string;
  required?: boolean;
  colors: ReturnType<typeof useColors>;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: colors.foreground, fontWeight: '700', fontSize: 13, marginBottom: 8 }}>
        {label}
        {required ? <Text style={{ color: colors.primary }}> *</Text> : null}
      </Text>
      {children}
    </View>
  );
}

function ToggleRow({
  label,
  subtitle,
  Icon,
  value,
  onToggle,
  colors,
  showDivider,
}: {
  label: string;
  subtitle: string;
  Icon?: React.ComponentType<{ size?: number; color?: string }>;
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
      {Icon ? (
        <View style={[styles.itemIcon, { backgroundColor: `${colors.primary}15` }]}>
          <Icon size={16} color={colors.primary} />
        </View>
      ) : null}
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
  flowCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  flowTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    marginBottom: 12,
  },
  flowRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 8 },
  flowStep: { alignItems: 'center', width: 64, position: 'relative' },
  flowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowLabel: { fontSize: 10, fontWeight: '600', marginTop: 6 },
  flowLine: {
    position: 'absolute',
    right: -10,
    top: 17,
    width: 16,
    height: 2,
  },
  flowNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  flowTrack: { flex: 1, height: 3, borderRadius: 2 },
  flowThumb: { width: '28%', height: 3, borderRadius: 2 },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionHeading: { fontSize: 14, fontWeight: '800' },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  card: { borderWidth: 1, borderRadius: 16, overflow: 'hidden', marginBottom: 14 },
  emptyStations: { padding: 20, alignItems: 'center', gap: 12 },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  stationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  stationIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prepTime: { fontSize: 13, fontWeight: '800', minWidth: 40, textAlign: 'right' },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
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
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
  },
  shapeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shapeChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  formError: { color: '#EF4444', fontSize: 12, marginTop: 4 },
});
