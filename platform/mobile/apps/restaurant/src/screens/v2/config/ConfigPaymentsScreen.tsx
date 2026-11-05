import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import {
  ChevronRight,
  CreditCard,
  Smartphone,
  Landmark,
} from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { V2Shell } from '../shared/V2Shell';
import type { PaymentMethods } from '../shared/v2Types';
import { ChargePolicyCard } from './ChargePolicyCard';
import { CashSettingsCard, TipRulesCard } from './CashAndTipsCards';
import type { IconComponent } from './configTypes';
import { useRestaurantRole } from '../../../contexts/RestaurantRoleContext';
import { userErrorMessage } from '@okinawa/shared/utils/user-error-message';

export const DEFAULT_PAYMENT_METHODS: PaymentMethods = {
  pix: true,
  creditCard: true,
  debitCard: true,
  cash: false,
  applePay: true,
  googlePay: true,
  tapToPay: false,
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

type MethodKey = 'creditCard' | 'debitCard' | 'pix' | 'applePay' | 'googlePay';

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
];

export default function ConfigPaymentsScreen() {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const { serverRoles } = useRestaurantRole();
  // Métodos aceitos são decisão do Dono; o servidor recusa o resto (aditivo, item G).
  const canEditMethods = serverRoles.includes('owner');
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [methods, setMethods] = useState<PaymentMethods>(DEFAULT_PAYMENT_METHODS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      setError(userErrorMessage(err, 'Erro ao salvar pagamentos'));
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
      setError(userErrorMessage(err, 'Erro ao carregar pagamentos'));
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
          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.85}
            onPress={() => navigation.navigate('PaymentAccount')}
            style={[styles.accountRow, { borderColor: colors.border, backgroundColor: colors.card }]}
          >
            <Landmark size={18} color={colors.primary} />
            <Text style={[styles.accountRowText, { color: colors.foreground }]}>Conta de recebimento</Text>
            <ChevronRight size={18} color={colors.foregroundSecondary} />
          </TouchableOpacity>
          <Text style={[styles.sectionEyebrow, { color: colors.foregroundSecondary }]}>MÉTODOS ACEITOS</Text>
          {!canEditMethods ? (
            <Text style={[styles.accountRowText, { color: colors.foregroundSecondary, fontSize: 13, marginBottom: 8 }]}>
              Só o Dono altera os métodos aceitos.
            </Text>
          ) : null}
          <View style={[styles.methodGrid, { borderColor: colors.border, backgroundColor: colors.card }]}>
            {METHOD_GRID.map((method) => {
              const active = methods[method.key];
              const Icon = method.Icon;
              return (
                <TouchableOpacity
                  key={method.key}
                  activeOpacity={0.85}
                  onPress={() => toggle(method.key)}
                  disabled={!canEditMethods}
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

          <ChargePolicyCard restaurantId={restaurantId} />
          <TipRulesCard restaurantId={restaurantId} />
          <CashSettingsCard restaurantId={restaurantId} />

          {error ? (
            <Text style={{ textAlign: 'center', color: '#EF4444', marginTop: 8 }}>{error}</Text>
          ) : null}
        </>
      )}
    </V2Shell>
  );
}

const styles = StyleSheet.create({
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 16 },
  accountRowText: { flex: 1, fontSize: 14, fontWeight: '600' },
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
    top: 6,
    right: 6,
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
