import React, { useCallback, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { useCart } from '@/shared/contexts/CartContext';
import customerBackend, { type CustomerMenuItem } from '../../services/customer-backend';
import { useServiceTypeFor } from '../../hooks/useServiceTypeFeatures';
import { money, StateView } from './shared';
import { comboDiscountAmount } from './quick-service-ui';
import { ItemCustomizationSheet } from '../../components/menu/ItemCustomizationPicker';
import {
  hasChoices,
  selectionDeltaCents,
  selectionPayload,
  selectionSummary,
  type CustomizationSelection,
} from '../../utils/item-customization';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=200&q=80';

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
  const cart = useCart();
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
  // ADR-013 §2.9: item de etapa com opções abre a personalização antes de entrar no combo.
  const customizations = useQuery({
    queryKey: ['menu-customizations', restaurantId],
    queryFn: () => customerBackend.getMenuCustomizations(restaurantId!),
    enabled: !!restaurantId,
  });
  const configOf = useCallback((itemId: string) => customizations.data?.[itemId] ?? null, [customizations.data]);
  const [stepChoices, setStepChoices] = useState<Partial<Record<StepKey, CustomizationSelection>>>({});
  const [customizing, setCustomizing] = useState<{ key: StepKey; item: CustomerMenuItem } | null>(null);

  // O desconto é da política do restaurante (comboDiscountBps), não um literal da tela.
  const { policies } = useServiceTypeFor(restaurantId, 'quick_service');
  const discountBps = policies?.comboDiscountBps ?? 0;

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
  const discount = comboDiscountAmount(subtotal, discountBps);
  // Extras entram cheios, sem o desconto do combo — o mesmo que o servidor cobra (ADR-013 §2.9).
  const extrasCents = STEPS.reduce((sum, s) => {
    const item = selection[s.key];
    return sum + (item ? selectionDeltaCents(configOf(item.id), stepChoices[s.key] ?? { options: [], removed: [] }) : 0);
  }, 0);
  const total = (Math.round((subtotal - discount) * 100) + extrasCents) / 100;
  const isLastStep = stepIndex === STEPS.length - 1;
  const canAdvance = !!selection[step.key];

  const restaurant = useQuery({
    queryKey: ['restaurant', restaurantId],
    queryFn: () => customerBackend.getRestaurant(restaurantId!),
    enabled: !!restaurantId,
  });

  const addComboToCart = useCallback(() => {
    if (!restaurantId || !selection.lanche || !selection.acompanhamento || !selection.bebida) return;
    cart.setRestaurant(restaurantId, restaurant.data?.name ?? 'Quick Service');
    const picked = { lanche: selection.lanche, acompanhamento: selection.acompanhamento, bebida: selection.bebida };
    const stepCustomizations: Partial<Record<StepKey, { options: string[]; removed: string[] }>> = {};
    const summaries: string[] = [];
    for (const s of STEPS) {
      const payload = selectionPayload(stepChoices[s.key]);
      if (!payload) continue;
      stepCustomizations[s.key] = payload;
      const text = selectionSummary(configOf(picked[s.key].id), payload);
      if (text) summaries.push(`${picked[s.key].name}: ${text}`);
    }
    cart.addItem({
      menu_item_id: selection.lanche.id,
      name: `Combo: ${selection.lanche.name} + ${selection.acompanhamento.name} + ${selection.bebida.name}`,
      price: total,
      customization_summary: summaries.length ? summaries.join(' / ') : undefined,
      quantity: 1,
      image_url: selection.lanche.imageUrl ?? undefined,
      preparation_time: Math.max(
        selection.lanche.preparationTime ?? 0,
        selection.acompanhamento.preparationTime ?? 0,
        selection.bebida.preparationTime ?? 0,
      ) || null,
      combo: {
        lancheItemId: selection.lanche.id,
        acompanhamentoItemId: selection.acompanhamento.id,
        bebidaItemId: selection.bebida.id,
        // Preço de lista inclui os extras, para o carrinho mostrar só o desconto do combo.
        listPrice: (Math.round((selection.lanche.price + selection.acompanhamento.price + selection.bebida.price) * 100) + extrasCents) / 100,
        ...(Object.keys(stepCustomizations).length ? { customizations: stepCustomizations } : {}),
      },
    });
    navigation.replace('Cart');
  }, [cart, configOf, extrasCents, navigation, restaurant.data?.name, restaurantId, selection, stepChoices, total]);

  const selectItem = useCallback((key: StepKey, item: CustomerMenuItem) => {
    if (hasChoices(configOf(item.id))) {
      setCustomizing({ key, item });
      return;
    }
    setSelection((current) => ({ ...current, [key]: item }));
    setStepChoices((current) => ({ ...current, [key]: undefined }));
  }, [configOf]);

  const goNext = useCallback(() => {
    if (!canAdvance) return;
    if (isLastStep) {
      if (allSelected) addComboToCart();
      return;
    }
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }, [addComboToCart, allSelected, canAdvance, isLastStep]);

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
              <Text style={styles.summaryLabel}>Desconto combo (-{discountBps / 100}%)</Text>
              <Text style={[styles.summaryValue, styles.summaryValueDiscount]}>-{money(discount)}</Text>
            </View>
            {extrasCents > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Adicionais</Text>
                <Text style={styles.summaryValue}>+{money(extrasCents / 100)}</Text>
              </View>
            )}
            <View style={styles.divider} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Combo</Text>
              <Text style={styles.totalValue}>{money(total)}</Text>
            </View>
          </View>
        )}

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.cta, !canAdvance && styles.ctaDisabled]}
            onPress={goNext}
            disabled={!canAdvance}
            activeOpacity={0.9}
            accessibilityRole="button"
          >
            <Text style={styles.ctaText}>
              {isLastStep ? 'Adicionar à comanda' : 'Próximo'}
            </Text>
            <Ionicons name="arrow-forward" size={16} color={colors.primaryForeground} />
          </TouchableOpacity>
        </View>
      </View>
      <ItemCustomizationSheet
        key={customizing ? `${customizing.key}:${customizing.item.id}` : 'none'}
        item={customizing?.item ?? null}
        config={customizing ? configOf(customizing.item.id) : null}
        initial={customizing && selection[customizing.key]?.id === customizing.item.id ? stepChoices[customizing.key] : undefined}
        confirmLabel="Escolher"
        onClose={() => setCustomizing(null)}
        onConfirm={(choice) => {
          if (!customizing) return;
          setSelection((current) => ({ ...current, [customizing.key]: customizing.item }));
          setStepChoices((current) => ({ ...current, [customizing.key]: choice }));
          setCustomizing(null);
        }}
      />
    </ScreenContainer>
  );
}
