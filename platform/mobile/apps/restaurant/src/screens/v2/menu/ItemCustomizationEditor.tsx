import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from 'react-native-paper';
import { Eye, EyeOff, Minus, Plus, Trash2 } from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { userErrorMessage } from '@okinawa/shared/utils/user-error-message';
import { V2FormSheet } from '../shared/V2FormSheet';
import {
  LIMITS,
  draftFromForm,
  formFromDraft,
  maskPriceInput,
  newGroup,
  newOption,
  validateDraft,
  type CustomizationForm,
  type GroupForm,
} from './customizationDraft';

interface Props {
  item: { id: string; name: string } | null;
  /** Itens do cardápio, para escolher as sugestões ("Adicione também"). */
  menuItems: { id: string; name: string }[];
  onClose: () => void;
}

const EMPTY_FORM: CustomizationForm = { groups: [], ingredients: '', upsellItemIds: [] };

/**
 * Personalização do item (ADR-013 §2.9): grupos obrigatórios/opcionais com extras pagos,
 * ingredientes que o cliente pode retirar e sugestões de upsell. Vale para todos os modelos;
 * o servidor valida e precifica a escolha do cliente.
 */
export function ItemCustomizationEditor({ item, menuItems, onClose }: Props) {
  const colors = useColors();
  // Montado com `key` por item: cada abertura começa do zero, carregando.
  const [form, setForm] = useState<CustomizationForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(item !== null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    supabaseApiAdapter.getItemCustomization(item.id)
      .then((draft) => { if (!cancelled) setForm(formFromDraft(draft)); })
      .catch((err) => { if (!cancelled) setError(userErrorMessage(err, 'Não foi possível carregar a personalização.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [item]);

  const updateGroup = (key: string, patch: (group: GroupForm) => GroupForm) =>
    setForm((current) => ({ ...current, groups: current.groups.map((g) => (g.key === key ? patch(g) : g)) }));

  const save = async () => {
    if (!item || saving) return;
    const draft = draftFromForm(form);
    const problem = validateDraft(draft, item.id);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await supabaseApiAdapter.saveItemCustomization(item.id, draft);
      onClose();
    } catch (err) {
      setError(userErrorMessage(err, 'Não foi possível salvar a personalização.'));
    } finally {
      setSaving(false);
    }
  };

  const input = [styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }];
  const upsellChoices = menuItems.filter((m) => m.id !== item?.id);

  return (
    <V2FormSheet
      visible={item !== null}
      title="Personalização"
      subtitle={item ? `${item.name} · opções, ingredientes e sugestões` : undefined}
      saveLabel="Salvar personalização"
      saving={saving}
      saveDisabled={loading}
      onClose={() => { if (!saving) onClose(); }}
      onSave={() => void save()}
    >
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
      ) : (
        <>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Grupos de opções</Text>
          <Text style={[styles.hint, { color: colors.foregroundSecondary }]}>
            Ex.: “Ponto da carne” (obrigatório, escolha 1) ou “Adicionais” (opcional, até 3, com preço).
          </Text>

          {form.groups.map((group, index) => (
            <View key={group.key} style={[styles.groupCard, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}>
              <View style={styles.row}>
                <TextInput
                  value={group.name}
                  onChangeText={(name) => updateGroup(group.key, (g) => ({ ...g, name }))}
                  placeholder={`Nome do grupo ${index + 1}`}
                  placeholderTextColor={colors.foregroundMuted}
                  maxLength={LIMITS.name}
                  style={[...input, { flex: 1 }]}
                  accessibilityLabel={`Nome do grupo ${index + 1}`}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remover grupo"
                  onPress={() => setForm((c) => ({ ...c, groups: c.groups.filter((g) => g.key !== group.key) }))}
                  style={styles.iconBtn}
                >
                  <Trash2 size={16} color="#EF4444" />
                </Pressable>
              </View>

              <View style={styles.row}>
                <Pressable
                  accessibilityRole="switch"
                  accessibilityState={{ checked: group.required }}
                  onPress={() => updateGroup(group.key, (g) => ({ ...g, required: !g.required }))}
                  style={[styles.chip, { borderColor: group.required ? colors.primary : colors.border, backgroundColor: group.required ? `${colors.primary}15` : colors.card }]}
                >
                  <Text style={{ color: group.required ? colors.primary : colors.foreground, fontWeight: '700', fontSize: 12 }}>
                    {group.required ? 'Obrigatório' : 'Opcional'}
                  </Text>
                </Pressable>
                <Text style={[styles.hint, { color: colors.foregroundSecondary, flex: 1, marginBottom: 0 }]}>Escolhe até</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Diminuir máximo"
                  onPress={() => updateGroup(group.key, (g) => ({ ...g, maxSelect: Math.max(1, g.maxSelect - 1) }))}
                  style={styles.iconBtn}
                >
                  <Minus size={14} color={colors.foreground} />
                </Pressable>
                <Text style={{ color: colors.foreground, fontWeight: '800', minWidth: 18, textAlign: 'center' }}>{group.maxSelect}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Aumentar máximo"
                  onPress={() => updateGroup(group.key, (g) => ({ ...g, maxSelect: Math.min(g.options.length || 1, g.maxSelect + 1) }))}
                  style={styles.iconBtn}
                >
                  <Plus size={14} color={colors.foreground} />
                </Pressable>
              </View>

              {group.options.map((option) => (
                <View key={option.key} style={styles.row}>
                  <TextInput
                    value={option.name}
                    onChangeText={(name) => updateGroup(group.key, (g) => ({ ...g, options: g.options.map((o) => (o.key === option.key ? { ...o, name } : o)) }))}
                    placeholder="Opção"
                    placeholderTextColor={colors.foregroundMuted}
                    maxLength={LIMITS.name}
                    style={[...input, { flex: 1 }, !option.isAvailable && { opacity: 0.5 }]}
                    accessibilityLabel="Nome da opção"
                  />
                  <TextInput
                    value={option.price}
                    onChangeText={(price) => updateGroup(group.key, (g) => ({ ...g, options: g.options.map((o) => (o.key === option.key ? { ...o, price: maskPriceInput(price) } : o)) }))}
                    placeholder="+ R$ 0,00"
                    placeholderTextColor={colors.foregroundMuted}
                    keyboardType="number-pad"
                    style={[...input, { width: 96 }]}
                    accessibilityLabel="Preço adicional"
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={option.isAvailable ? 'Marcar opção indisponível' : 'Marcar opção disponível'}
                    onPress={() => updateGroup(group.key, (g) => ({ ...g, options: g.options.map((o) => (o.key === option.key ? { ...o, isAvailable: !o.isAvailable } : o)) }))}
                    style={styles.iconBtn}
                  >
                    {option.isAvailable ? <Eye size={15} color="#22C55E" /> : <EyeOff size={15} color="#EF4444" />}
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remover opção"
                    onPress={() => updateGroup(group.key, (g) => {
                      const options = g.options.filter((o) => o.key !== option.key);
                      return { ...g, options, maxSelect: Math.min(g.maxSelect, Math.max(1, options.length)) };
                    })}
                    style={styles.iconBtn}
                  >
                    <Trash2 size={15} color={colors.foregroundSecondary} />
                  </Pressable>
                </View>
              ))}

              {group.options.length < LIMITS.options && (
                <Pressable
                  onPress={() => updateGroup(group.key, (g) => ({ ...g, options: [...g.options, newOption()] }))}
                  style={styles.linkBtn}
                  accessibilityRole="button"
                >
                  <Plus size={14} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>Opção</Text>
                </Pressable>
              )}
            </View>
          ))}

          {form.groups.length < LIMITS.groups && (
            <Pressable
              onPress={() => setForm((c) => ({ ...c, groups: [...c.groups, newGroup()] }))}
              style={[styles.addGroup, { borderColor: colors.primary }]}
              accessibilityRole="button"
            >
              <Plus size={16} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: '800' }}>Adicionar grupo</Text>
            </Pressable>
          )}

          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Ingredientes removíveis</Text>
          <Text style={[styles.hint, { color: colors.foregroundSecondary }]}>Separe por vírgula. O cliente toca no que não quer.</Text>
          <TextInput
            value={form.ingredients}
            onChangeText={(ingredients) => setForm((c) => ({ ...c, ingredients }))}
            placeholder="cebola, picles, molho"
            placeholderTextColor={colors.foregroundMuted}
            style={[...input, { minHeight: 64, paddingTop: 12, textAlignVertical: 'top' }]}
            multiline
            accessibilityLabel="Ingredientes removíveis"
          />

          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Adicione também</Text>
          <Text style={[styles.hint, { color: colors.foregroundSecondary }]}>
            Até {LIMITS.upsell} itens sugeridos quando o cliente abre este item.
          </Text>
          <View style={styles.chips}>
            {upsellChoices.map((m) => {
              const selected = form.upsellItemIds.includes(m.id);
              const full = !selected && form.upsellItemIds.length >= LIMITS.upsell;
              return (
                <Pressable
                  key={m.id}
                  disabled={full}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected, disabled: full }}
                  onPress={() => setForm((c) => ({
                    ...c,
                    upsellItemIds: selected ? c.upsellItemIds.filter((id) => id !== m.id) : [...c.upsellItemIds, m.id],
                  }))}
                  style={[styles.chip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? `${colors.primary}15` : colors.card }, full && { opacity: 0.4 }]}
                >
                  <Text style={{ color: selected ? colors.primary : colors.foreground, fontWeight: selected ? '800' : '600', fontSize: 12 }}>{m.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </V2FormSheet>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 14, fontWeight: '800', marginTop: 10, marginBottom: 4 },
  hint: { fontSize: 12, lineHeight: 17, marginBottom: 10 },
  groupCard: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 8, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 14 },
  iconBtn: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 6 },
  addGroup: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 },
  error: { color: '#DC2626', backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, fontSize: 13, marginTop: 8 },
});
