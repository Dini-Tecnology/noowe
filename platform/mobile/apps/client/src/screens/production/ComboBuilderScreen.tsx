import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import customerBackend, { type CustomerMenuItem } from '../../services/customer-backend';
import { money, StateView } from './shared';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=200&q=80';

const DISCOUNT_PERCENT = 20;

/**
 * The 3 pools a combo is built from. Matched by category name — the same
 * fixed vocabulary the customer_order_custom_combo RPC validates against —
 * since there's no dedicated "combo role" field on menu items.
 */
const STEPS = [
  { key: 'lanche', label: 'Lanche', categoryName: 'burgers', icon: 'fast-food-outline' as const },
  { key: 'acompanhamento', label: 'Acompanhamento', categoryName: 'acompanhamentos', icon: 'restaurant-outline' as const },
  { key: 'bebida', label: 'Bebida', categoryName: 'bebidas', icon: 'wine-outline' as const },
] as const;

type StepKey = (typeof STEPS)[number]['key'];

export default function ComboBuilderScreen({ route, navigation }: any) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const restaurantId = route?.params?.restaurantId as string | undefined;
  const [stepIndex, setStepIndex] = useState(0);
  const [selection, setSelection] = useState<Record<StepKey, CustomerMenuItem | null>>({
    lanche: null,
    acompanhamento: null,
    bebida: null,
  });

  const menu = useQuery({
    queryKey: ['menu', restaurantId],
    queryFn: () => customerBackend.getMenu(restaurantId!),
    enabled: !!restaurantId,
  });

  const step = STEPS[stepIndex];

  const poolForStep = useCallback(
    (key: StepKey) => {
      const stepDef = STEPS.find((s) => s.key === key)!;
      const category = menu.data?.categories.find(
        (c) => c.name.trim().toLowerCase() === stepDef.categoryName,
      );
      if (!category) return [];
      return (menu.data?.items ?? []).filter((item) => item.categoryId === category.id);
    },
    [menu.data],
  );

  const currentPool = useMemo(() => poolForStep(step.key), [poolForStep, step.key]);

  const selectedItems = [selection.lanche, selection.acompanhamento, selection.bebida];
  const allSelected = selectedItems.every(Boolean);
  const subtotal = selectedItems.reduce((sum, item) => sum + (item?.price ?? 0), 0);
  const discount = subtotal * (DISCOUNT_PERCENT / 100);
  const total = subtotal - discount;
  const isLastStep = stepIndex === STEPS.length - 1;
  const canAdvance = !!selection[step.key];

  const place = useMutation({
    mutationFn: () =>
      customerBackend.orderCustomCombo({
        restaurantId: restaurantId!,
        lancheItemId: selection.lanche!.id,
        acompanhamentoItemId: selection.acompanhamento!.id,
        bebidaItemId: selection.bebida!.id,
      }),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      navigation.replace('OrderDetail', { orderId: order.id });
    },
    onError: (error: Error) => Alert.alert('Não foi possível montar o combo', error.message),
  });

  const selectItem = useCallback((key: StepKey, item: CustomerMenuItem) => {
    setSelection((current) => ({ ...current, [key]: item }));
  }, []);

  const goNext = useCallback(() => {
    if (!canAdvance) return;
    if (isLastStep) {
      if (allSelected) place.mutate();
      return;
    }
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }, [allSelected, canAdvance, isLastStep, place]);

  const goBackStep = useCallback(() => {
    if (stepIndex === 0) {
      navigation.goBack();
      return;
    }
    setStepIndex((i) => Math.max(i - 1, 0));
  }, [navigation, stepIndex]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
        backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.backgroundTertiary, alignItems: 'center', justifyContent: 'center' },
        headerTitle: { fontSize: 18, fontWeight: '700', color: colors.foreground, flex: 1, textAlign: 'center', marginRight: 40 },
        progressRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, marginBottom: 8 },
        progressBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
        progressBarActive: { backgroundColor: colors.primary },
        progressBarDone: { backgroundColor: colors.primaryLight },
        stepLabelsRow: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 16 },
        stepLabelWrap: { flex: 1, alignItems: 'center' },
        stepLabelText: { fontSize: 11, color: colors.foregroundMuted, fontWeight: '600' },
        stepLabelTextActive: { color: colors.primary },
        banner: {
          flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 16,
          paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14,
          backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.primaryLight,
        },
        bannerText: { flex: 1, fontSize: 12, lineHeight: 16, color: colors.primary, fontWeight: '600' },
        listContent: { paddingHorizontal: 16, gap: 10, paddingBottom: 16 },
        itemCard: {
          flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16,
          borderWidth: 2, borderColor: colors.border, backgroundColor: colors.card,
        },
        itemCardSelected: { borderColor: colors.primary, backgroundColor: `${colors.primary}0D` },
        itemImage: { width: 52, height: 52, borderRadius: 12, backgroundColor: colors.backgroundTertiary },
        itemName: { fontSize: 14, fontWeight: '700', color: colors.foreground },
        itemDescription: { fontSize: 12, color: colors.foregroundSecondary, marginTop: 2 },
        itemPrice: { fontSize: 14, fontWeight: '700', color: colors.foreground },
        checkCircle: {
          width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.border,
          alignItems: 'center', justifyContent: 'center',
        },
        checkCircleSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
        summaryCard: {
          marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 16, gap: 6,
          backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
        },
        summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
        summaryLabel: { fontSize: 13, color: colors.foregroundSecondary },
        summaryValue: { fontSize: 13, fontWeight: '600', color: colors.foreground },
        summaryValueStrike: { textDecorationLine: 'line-through', color: colors.foregroundMuted },
        summaryValueDiscount: { color: colors.success, fontWeight: '700' },
        divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 2 },
        totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
        totalLabel: { fontSize: 15, fontWeight: '700', color: colors.foreground },
        totalValue: { fontSize: 20, fontWeight: '800', color: colors.primary },
        footer: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4 },
        cta: {
          paddingVertical: 16, borderRadius: 16, backgroundColor: colors.primary,
          alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
        },
        ctaDisabled: { opacity: 0.5 },
        ctaText: { fontSize: 15, fontWeight: '700', color: colors.primaryForeground },
      }),
    [colors],
  );

  if (!restaurantId) {
    return (
      <ScreenContainer edges={['top']}>
        <StateView empty="Restaurante não encontrado." emptyIcon="fast-food-outline" />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={['top']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={goBackStep} accessibilityRole="button" accessibilityLabel="Voltar">
            <Ionicons name="arrow-back" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Monte seu Combo</Text>
        </View>

        <View style={styles.progressRow}>
          {STEPS.map((s, index) => (
            <View
              key={s.key}
              style={[
                styles.progressBar,
                index < stepIndex && styles.progressBarDone,
                index === stepIndex && styles.progressBarActive,
              ]}
            />
          ))}
        </View>
        <View style={styles.stepLabelsRow}>
          {STEPS.map((s, index) => (
            <View key={s.key} style={styles.stepLabelWrap}>
              <Text style={[styles.stepLabelText, index === stepIndex && styles.stepLabelTextActive]}>{s.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.banner}>
          <Ionicons name="flash" size={16} color={colors.primary} />
          <Text style={styles.bannerText}>
            Etapa {stepIndex + 1}/{STEPS.length}: Escolha {step.label.toLowerCase()}
          </Text>
        </View>

        <StateView
          loading={menu.isLoading}
          error={menu.error}
          onRetry={() => menu.refetch()}
          empty={!menu.isLoading && currentPool.length === 0 ? 'Nenhuma opção disponível para esta etapa.' : undefined}
          emptyIcon="fast-food-outline"
        />

        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          {currentPool.map((item) => {
            const selected = selection[step.key]?.id === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.itemCard, selected && styles.itemCardSelected]}
                onPress={() => selectItem(step.key, item)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Image source={{ uri: item.imageUrl || FALLBACK_IMAGE }} style={styles.itemImage} resizeMode="cover" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                  {item.description ? (
                    <Text style={styles.itemDescription} numberOfLines={1}>{item.description}</Text>
                  ) : null}
                </View>
                <Text style={styles.itemPrice}>{money(item.price)}</Text>
                <View style={[styles.checkCircle, selected && styles.checkCircleSelected]}>
                  {selected && <Ionicons name="checkmark" size={14} color={colors.primaryForeground} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {subtotal > 0 && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Original</Text>
              <Text style={[styles.summaryValue, styles.summaryValueStrike]}>{money(subtotal)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Desconto combo (-{DISCOUNT_PERCENT}%)</Text>
              <Text style={[styles.summaryValue, styles.summaryValueDiscount]}>-{money(discount)}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Combo</Text>
              <Text style={styles.totalValue}>{money(total)}</Text>
            </View>
          </View>
        )}

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.cta, (!canAdvance || place.isPending) && styles.ctaDisabled]}
            onPress={goNext}
            disabled={!canAdvance || place.isPending}
            activeOpacity={0.9}
            accessibilityRole="button"
          >
            <Text style={styles.ctaText}>
              {place.isPending ? 'Confirmando...' : isLastStep ? 'Confirmar Combo' : 'Próximo'}
            </Text>
            {!place.isPending && <Ionicons name="arrow-forward" size={16} color={colors.primaryForeground} />}
          </TouchableOpacity>
        </View>
      </View>
    </ScreenContainer>
  );
}
