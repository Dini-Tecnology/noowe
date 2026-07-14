import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Switch, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import {
  CreditCard,
  FingerprintPattern,
  Heart,
  Minus,
  Percent,
  Plus,
  Smartphone,
  User,
  Users,
  ClipboardList,
  DollarSign,
} from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { V2Shell } from '../shared/V2Shell';
import type { PaymentMethods } from '../shared/v2Types';
import { ConfigSectionCard } from './ConfigSectionCard';
import type { IconComponent } from './configTypes';

export const DEFAULT_PAYMENT_METHODS: PaymentMethods = {
  pix: true,
  creditCard: true,
  debitCard: true,
  cash: false,
  applePay: true,
  googlePay: true,
  tapToPay: true,
  pixKey: '',
  feePercent: 10,
  serviceFeeEnabled: true,
  tipsEnabled: true,
  tipOptions: [10, 15, 20],
  tipAllowCustom: true,
  splitIndividual: true,
  splitEqual: true,
  splitByItem: true,
  splitFixed: true,
};

type MethodKey = 'creditCard' | 'debitCard' | 'pix' | 'applePay' | 'googlePay' | 'tapToPay';

const METHOD_GRID: {
  key: MethodKey;
  label: string;
  Icon: IconComponent;
  iconColor: string;
}[] = [
  { key: 'creditCard', label: 'Crédito', Icon: CreditCard, iconColor: '#EF4444' },
  { key: 'debitCard', label: 'Débito', Icon: CreditCard, iconColor: '#0284C7' },
  { key: 'pix', label: 'PIX', Icon: CreditCard, iconColor: '#16A34A' },
  { key: 'applePay', label: 'Apple Pay', Icon: Smartphone, iconColor: '#111827' },
  { key: 'googlePay', label: 'Google Pay', Icon: Smartphone, iconColor: '#CA8A04' },
  { key: 'tapToPay', label: 'TAP to Pay', Icon: FingerprintPattern, iconColor: '#EA580C' },
];

const SPLIT_ITEMS: {
  key: keyof Pick<PaymentMethods, 'splitIndividual' | 'splitEqual' | 'splitByItem' | 'splitFixed'>;
  label: string;
  subtitle: string;
  Icon: IconComponent;
}[] = [
  { key: 'splitIndividual', label: 'Individual', subtitle: 'Cada um paga o seu', Icon: User },
  { key: 'splitEqual', label: 'Dividir igualmente', subtitle: 'Total dividido por todos', Icon: Users },
  { key: 'splitByItem', label: 'Por item', subtitle: 'Selecionar itens para pagar', Icon: ClipboardList },
  { key: 'splitFixed', label: 'Valor fixo', subtitle: 'Escolher quanto pagar', Icon: DollarSign },
];

const PREVIEW_SUBTOTAL = 342;

export default function ConfigPaymentsScreen() {
  const colors = useColors();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [methods, setMethods] = useState<PaymentMethods>(DEFAULT_PAYMENT_METHODS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewTip, setPreviewTip] = useState(15);
  const methodsRef = useRef(methods);
  const restaurantIdRef = useRef(restaurantId);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    methodsRef.current = methods;
  }, [methods]);

  useEffect(() => {
    restaurantIdRef.current = restaurantId;
  }, [restaurantId]);

  const persist = useCallback(async (next: PaymentMethods) => {
    const id = restaurantIdRef.current;
    if (!id) return;
    try {
      const data = await supabaseApiAdapter.getRestaurantProfile();
      const currentSettings = data?.settings ?? {};
      await supabaseApiAdapter.updateRestaurantProfile(id, {
        settings: { ...currentSettings, payment_methods: next },
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar pagamentos');
    }
  }, []);

  const schedulePersist = useCallback(
    (next: PaymentMethods) => {
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
        const stored = data.settings?.payment_methods;
        if (stored && typeof stored === 'object') {
          setMethods({
            ...DEFAULT_PAYMENT_METHODS,
            ...stored,
            tipOptions: Array.isArray(stored.tipOptions)
              ? stored.tipOptions
              : DEFAULT_PAYMENT_METHODS.tipOptions,
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar pagamentos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const update = (patch: Partial<PaymentMethods>) => {
    setMethods((prev) => {
      const next = { ...prev, ...patch };
      schedulePersist(next);
      return next;
    });
  };

  const toggle = <K extends keyof PaymentMethods>(key: K) => {
    const current = methodsRef.current[key];
    if (typeof current === 'boolean') {
      update({ [key]: !current } as Partial<PaymentMethods>);
    }
  };

  const serviceFeeAmount = useMemo(() => {
    if (!methods.serviceFeeEnabled) return 0;
    return (PREVIEW_SUBTOTAL * methods.feePercent) / 100;
  }, [methods.feePercent, methods.serviceFeeEnabled]);

  const tipAmount = useMemo(() => {
    if (!methods.tipsEnabled) return 0;
    return (PREVIEW_SUBTOTAL * previewTip) / 100;
  }, [methods.tipsEnabled, previewTip]);

  return (
    <V2Shell
      title="Pagamentos"
      subtitle="Taxa, gorjeta, split e métodos aceitos"
      showBack
      onRefresh={load}
      headerRight={
        <View style={[styles.headerIcon, { backgroundColor: `${colors.primary}18` }]}>
          <CreditCard size={18} color={colors.primary} />
        </View>
      }
    >
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          <Text style={[styles.sectionEyebrow, { color: colors.foregroundSecondary }]}>MÉTODOS ACEITOS</Text>
          <View style={[styles.methodGrid, { borderColor: colors.border, backgroundColor: colors.card }]}>
            {METHOD_GRID.map((method) => {
              const active = methods[method.key];
              const Icon = method.Icon;
              return (
                <TouchableOpacity
                  key={method.key}
                  activeOpacity={0.85}
                  onPress={() => toggle(method.key)}
                  style={[
                    styles.methodCell,
                    {
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? `${colors.primary}08` : colors.backgroundSecondary,
                    },
                  ]}
                >
                  <Icon size={20} color={method.iconColor} />
                  <Text style={[styles.methodLabel, { color: colors.foreground }]}>{method.label}</Text>
                  {active ? (
                    <View style={[styles.methodCheck, { backgroundColor: colors.primary }]}>
                      <Text style={styles.methodCheckText}>✓</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>

          <ConfigSectionCard title="Taxa de Serviço" Icon={Percent}>
            <ToggleRow
              label="Taxa de serviço"
              subtitle="Incluir automaticamente"
              value={methods.serviceFeeEnabled}
              onToggle={() => toggle('serviceFeeEnabled')}
              colors={colors}
              showDivider
            />
            <StepperRow
              label="Percentual"
              value={methods.feePercent}
              suffix="%"
              min={0}
              max={30}
              step={1}
              colors={colors}
              onChange={(feePercent) => update({ feePercent })}
              showDivider={false}
            />
          </ConfigSectionCard>

          <ConfigSectionCard title="Gorjetas" Icon={Heart}>
            <ToggleRow
              label="Sistema de gorjetas"
              subtitle="Sugerir gorjeta no fechamento"
              value={methods.tipsEnabled}
              onToggle={() => toggle('tipsEnabled')}
              colors={colors}
              showDivider
            />
            <View style={[styles.tipBlock, { borderBottomColor: colors.border }]}>
              <Text style={[styles.tipTitle, { color: colors.foregroundSecondary }]}>Percentuais sugeridos</Text>
              <View style={styles.tipPills}>
                {methods.tipOptions.map((option) => (
                  <View
                    key={option}
                    style={[styles.tipPill, { backgroundColor: `${colors.primary}18` }]}
                  >
                    <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 13 }}>{option}%</Text>
                  </View>
                ))}
              </View>
            </View>
            <ToggleRow
              label="Gorjeta personalizada"
              subtitle="Permitir valor livre"
              value={methods.tipAllowCustom}
              onToggle={() => toggle('tipAllowCustom')}
              colors={colors}
              showDivider={false}
            />
          </ConfigSectionCard>

          <ConfigSectionCard title="Divisão de Conta" Icon={Users}>
            {SPLIT_ITEMS.map((item, index) => {
              const Icon = item.Icon;
              return (
                <ToggleRow
                  key={item.key}
                  label={item.label}
                  subtitle={item.subtitle}
                  Icon={Icon}
                  value={methods[item.key]}
                  onToggle={() => toggle(item.key)}
                  colors={colors}
                  showDivider={index < SPLIT_ITEMS.length - 1}
                />
              );
            })}
          </ConfigSectionCard>

          <View style={[styles.previewCard, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}33` }]}>
            <Text style={[styles.previewEyebrow, { color: colors.foregroundSecondary }]}>
              Pré-visualização do Cliente: Tela de pagamento
            </Text>
            <Text style={[styles.previewTotal, { color: colors.foreground }]}>
              R$ {PREVIEW_SUBTOTAL.toFixed(2).replace('.', ',')}
            </Text>
            {methods.serviceFeeEnabled ? (
              <Text style={[styles.previewFee, { color: colors.foregroundSecondary }]}>
                Taxa de serviço: R$ {serviceFeeAmount.toFixed(2).replace('.', ',')} ({methods.feePercent}%)
              </Text>
            ) : null}
            {methods.tipsEnabled ? (
              <View style={styles.previewTips}>
                {methods.tipOptions.map((option) => {
                  const active = previewTip === option;
                  return (
                    <TouchableOpacity
                      key={option}
                      onPress={() => setPreviewTip(option)}
                      style={[
                        styles.previewTipBtn,
                        {
                          backgroundColor: active ? colors.primary : colors.card,
                          borderColor: active ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text style={{ color: active ? '#FFF' : colors.foreground, fontWeight: '800' }}>
                        {option}%
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
            {methods.tipsEnabled ? (
              <Text style={[styles.previewFee, { color: colors.foregroundSecondary, marginTop: 8 }]}>
                Gorjeta ({previewTip}%): R$ {tipAmount.toFixed(2).replace('.', ',')}
              </Text>
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
  Icon?: IconComponent;
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
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    marginBottom: 8,
  },
  methodGrid: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  methodCell: {
    width: '31%',
    flexGrow: 1,
    minWidth: 96,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 8,
    position: 'relative',
  },
  methodLabel: { fontSize: 12, fontWeight: '700' },
  methodCheck: {
    position: 'absolute',
    bottom: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodCheckText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  tipBlock: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tipTitle: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  tipPills: { flexDirection: 'row', gap: 8 },
  tipPill: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  previewCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
  },
  previewEyebrow: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  previewTotal: { fontSize: 28, fontWeight: '800' },
  previewFee: { fontSize: 12, marginTop: 4 },
  previewTips: { flexDirection: 'row', gap: 10, marginTop: 14 },
  previewTipBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
