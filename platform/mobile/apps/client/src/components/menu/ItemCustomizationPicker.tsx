import React, { useMemo, useState } from 'react';
import { Image, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import type { CustomerMenuItem } from '../../services/customer-backend';
import {
  EMPTY_SELECTION,
  groupRuleLabel,
  isRequired,
  missingGroups,
  selectionDeltaCents,
  toggleOption,
  toggleRemoved,
  unitPriceWithExtras,
  type CustomizationSelection,
  type ItemCustomizationConfig,
} from '../../utils/item-customization';

// Mesmo formato de `money` em screens/production/shared.tsx (componente não importa de telas).
const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

interface PickerProps {
  config: ItemCustomizationConfig;
  selection: CustomizationSelection;
  onChange: (next: CustomizationSelection) => void;
  /** "Adicione também": itens sugeridos pelo restaurante, já resolvidos do cardápio. */
  upsellItems?: CustomerMenuItem[];
  onUpsell?: (item: CustomerMenuItem) => void;
}

/**
 * Grupos obrigatórios/opcionais, ingredientes removíveis e upsell (ADR-013 §2.9).
 * Usado no detalhe do item (todos os modelos) e nas etapas do combo.
 */
export function ItemCustomizationPicker({ config, selection, onChange, upsellItems = [], onUpsell }: PickerProps) {
  const colors = useColors();
  const styles = useMemo(() => StyleSheet.create({
    section: { gap: 8, marginBottom: 18 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    title: { fontSize: 15, fontWeight: '700', color: colors.foreground, flexShrink: 1 },
    rule: { fontSize: 12, color: colors.foregroundSecondary },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    badgeText: { fontSize: 11, fontWeight: '700' },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12,
      borderRadius: 12, borderWidth: 1,
    },
    rowText: { flex: 1, fontSize: 14, color: colors.foreground },
    rowPrice: { fontSize: 13, fontWeight: '600', color: colors.foregroundSecondary },
    upsellRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    upsellImage: { width: 48, height: 48, borderRadius: 10, backgroundColor: colors.backgroundTertiary },
    upsellName: { fontSize: 14, fontWeight: '600', color: colors.foreground },
    upsellPrice: { fontSize: 12, color: colors.foregroundSecondary },
    upsellBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  }), [colors]);

  const missing = new Set(missingGroups(config, selection).map((g) => g.id));
  const chosen = new Set(selection.options);

  return (
    <View>
      {config.groups.map((group) => {
        const single = group.maxSelect === 1;
        const required = isRequired(group);
        const pending = missing.has(group.id);
        return (
          <View key={group.id} style={styles.section}>
            <View style={styles.headerRow}>
              <View style={{ flexShrink: 1 }}>
                <Text style={styles.title}>{group.name}</Text>
                <Text style={styles.rule}>{groupRuleLabel(group)}</Text>
              </View>
              {required && (
                <View style={[styles.badge, { backgroundColor: pending ? colors.warningBackground : colors.successBackground }]}>
                  <Text style={[styles.badgeText, { color: pending ? colors.warning : colors.success }]}>
                    {pending ? 'Obrigatório' : 'OK'}
                  </Text>
                </View>
              )}
            </View>
            {group.options.map((option) => {
              const selected = chosen.has(option.id);
              const icon = single
                ? (selected ? 'radio-button-on' : 'radio-button-off')
                : (selected ? 'checkbox' : 'square-outline');
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[styles.row, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? `${colors.primary}10` : colors.card }]}
                  onPress={() => onChange(toggleOption(config, selection, group.id, option.id))}
                  accessibilityRole={single ? 'radio' : 'checkbox'}
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={`${group.name}: ${option.name}`}
                >
                  <Ionicons name={icon} size={20} color={selected ? colors.primary : colors.foregroundMuted} />
                  <Text style={styles.rowText}>{option.name}</Text>
                  {option.priceDeltaCents > 0 && <Text style={styles.rowPrice}>+ {money(option.priceDeltaCents / 100)}</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        );
      })}

      {config.removable.length > 0 && (
        <View style={styles.section}>
          <View>
            <Text style={styles.title}>Remover ingredientes</Text>
            <Text style={styles.rule}>Toque no que você não quer</Text>
          </View>
          {config.removable.map((ingredient) => {
            const removed = selection.removed.includes(ingredient);
            return (
              <TouchableOpacity
                key={ingredient}
                style={[styles.row, { borderColor: removed ? colors.error : colors.border, backgroundColor: colors.card }]}
                onPress={() => onChange(toggleRemoved(selection, ingredient))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: removed }}
                accessibilityLabel={`Sem ${ingredient}`}
              >
                <Ionicons name={removed ? 'remove-circle' : 'remove-circle-outline'} size={20} color={removed ? colors.error : colors.foregroundMuted} />
                <Text style={[styles.rowText, removed && { textDecorationLine: 'line-through', color: colors.foregroundMuted }]}>
                  {ingredient}
                </Text>
                {removed && <Text style={[styles.rowPrice, { color: colors.error }]}>Sem</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {upsellItems.length > 0 && onUpsell && (
        <View style={styles.section}>
          <Text style={styles.title}>Adicione também</Text>
          {upsellItems.map((item) => (
            <View key={item.id} style={styles.upsellRow}>
              {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.upsellImage} /> : <View style={styles.upsellImage} />}
              <View style={{ flex: 1 }}>
                <Text style={styles.upsellName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.upsellPrice}>{money(item.price)}</Text>
              </View>
              <TouchableOpacity
                style={styles.upsellBtn}
                onPress={() => onUpsell(item)}
                accessibilityRole="button"
                accessibilityLabel={`Adicionar ${item.name}`}
              >
                <Ionicons name="add" size={18} color={colors.primaryForeground} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

interface SheetProps {
  item: CustomerMenuItem | null;
  config: ItemCustomizationConfig | null;
  initial?: CustomizationSelection;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: (selection: CustomizationSelection) => void;
}

/** Folha só com a personalização — usada nas etapas do combo. */
export function ItemCustomizationSheet({ item, config, initial, confirmLabel = 'Confirmar', onClose, onConfirm }: SheetProps) {
  const colors = useColors();
  const [selection, setSelection] = useState<CustomizationSelection>(initial ?? EMPTY_SELECTION);
  const styles = useMemo(() => StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
    sheet: { maxHeight: '85%', backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
    title: { fontSize: 18, fontWeight: '800', color: colors.foreground, marginBottom: 14 },
    btn: { paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginTop: 8 },
    btnText: { fontSize: 16, fontWeight: '700' },
  }), [colors]);

  if (!item || !config) return null;
  const missing = missingGroups(config, selection);
  const unit = unitPriceWithExtras(item.price, selectionDeltaCents(config, selection));
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{item.name}</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            <ItemCustomizationPicker config={config} selection={selection} onChange={setSelection} />
          </ScrollView>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: missing.length ? colors.backgroundTertiary : colors.primary }]}
            disabled={missing.length > 0}
            onPress={() => onConfirm(selection)}
            accessibilityRole="button"
            accessibilityState={{ disabled: missing.length > 0 }}
          >
            <Text style={[styles.btnText, { color: missing.length ? colors.foregroundMuted : colors.primaryForeground }]}>
              {missing.length ? `Escolha: ${missing[0].name}` : `${confirmLabel} · ${money(unit)}`}
            </Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
