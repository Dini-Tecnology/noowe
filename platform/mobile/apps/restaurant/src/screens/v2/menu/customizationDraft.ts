import type { ItemCustomizationDraft } from '@okinawa/shared/services/supabase-api';

/**
 * Editor de personalização do item (ADR-013 §2.9). Regras puras, espelhando os limites que
 * `restaurant_save_item_customization` valida — aqui só para dar o erro antes do envio.
 * São limites de tamanho de formulário, não regra de negócio do estabelecimento.
 */
export const LIMITS = { groups: 10, options: 30, name: 60, ingredients: 20, ingredient: 40, upsell: 5 } as const;

export type OptionForm = { key: string; id?: string; name: string; price: string; isAvailable: boolean };
export type GroupForm = { key: string; id?: string; name: string; required: boolean; maxSelect: number; options: OptionForm[] };
export type CustomizationForm = { groups: GroupForm[]; ingredients: string; upsellItemIds: string[] };

let seq = 0;
const nextKey = () => `k${Date.now().toString(36)}${(seq++).toString(36)}`;

/** "4,50" → 450. Só dígitos contam, como no campo de preço do item. */
export function centsFromInput(value: string): number {
  const digits = value.replace(/\D/g, '').slice(0, 9);
  return digits ? Number(digits) : 0;
}

export function inputFromCents(cents: number): string {
  if (!cents) return '';
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

/** Máscara de digitação: "450" → "4,50". */
export function maskPriceInput(value: string): string {
  return inputFromCents(centsFromInput(value));
}

/** "cebola, picles\nCebola" → ["cebola", "picles"] (sem repetição, ignorando caixa). */
export function parseIngredients(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,\n]/)) {
    const name = raw.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}

export function newOption(): OptionForm {
  return { key: nextKey(), name: '', price: '', isAvailable: true };
}

export function newGroup(): GroupForm {
  return { key: nextKey(), name: '', required: false, maxSelect: 1, options: [newOption()] };
}

export function formFromDraft(draft: ItemCustomizationDraft): CustomizationForm {
  return {
    groups: draft.groups.map((g) => ({
      key: g.id ?? nextKey(),
      id: g.id,
      name: g.name,
      required: g.minSelect >= 1,
      maxSelect: Math.max(1, g.maxSelect),
      options: g.options.map((o) => ({
        key: o.id ?? nextKey(), id: o.id, name: o.name, price: inputFromCents(o.priceDeltaCents), isAvailable: o.isAvailable,
      })),
    })),
    ingredients: draft.removable.join(', '),
    upsellItemIds: draft.upsellItemIds,
  };
}

/**
 * Formulário → payload. "Obrigatório" vira mínimo 1; o máximo nunca passa do número de opções.
 * Ids existentes vão junto, para o servidor atualizar no lugar.
 */
export function draftFromForm(form: CustomizationForm): ItemCustomizationDraft {
  return {
    groups: form.groups.map((g) => {
      const options = g.options.map((o) => ({
        ...(o.id ? { id: o.id } : {}),
        name: o.name.trim(),
        priceDeltaCents: centsFromInput(o.price),
        isAvailable: o.isAvailable,
      }));
      const maxSelect = Math.min(Math.max(1, g.maxSelect), Math.max(1, options.length));
      return { ...(g.id ? { id: g.id } : {}), name: g.name.trim(), minSelect: g.required ? 1 : 0, maxSelect, options };
    }),
    removable: parseIngredients(form.ingredients),
    upsellItemIds: [...new Set(form.upsellItemIds)],
  };
}

/** Primeiro problema do rascunho, no texto que o dono lê; `null` quando pode salvar. */
export function validateDraft(draft: ItemCustomizationDraft, itemId: string): string | null {
  if (draft.groups.length > LIMITS.groups) return `Use no máximo ${LIMITS.groups} grupos de opções.`;
  for (const [index, group] of draft.groups.entries()) {
    const label = group.name || `Grupo ${index + 1}`;
    if (!group.name || group.name.length > LIMITS.name) return `Dê um nome de até ${LIMITS.name} caracteres ao ${label.toLowerCase()}.`;
    if (group.options.length === 0) return `"${label}" precisa de pelo menos uma opção.`;
    if (group.options.length > LIMITS.options) return `"${label}" pode ter no máximo ${LIMITS.options} opções.`;
    if (group.options.some((o) => !o.name || o.name.length > LIMITS.name)) return `Toda opção de "${label}" precisa de nome (até ${LIMITS.name} caracteres).`;
    if (new Set(group.options.map((o) => o.name.toLowerCase())).size !== group.options.length) return `"${label}" tem opções repetidas.`;
    if (group.minSelect >= 1 && !group.options.some((o) => o.isAvailable)) return `"${label}" é obrigatório e não tem opção disponível.`;
  }
  if (draft.removable.length > LIMITS.ingredients) return `Liste no máximo ${LIMITS.ingredients} ingredientes removíveis.`;
  if (draft.removable.some((x) => x.length > LIMITS.ingredient)) return `Cada ingrediente pode ter até ${LIMITS.ingredient} caracteres.`;
  if (draft.upsellItemIds.length > LIMITS.upsell) return `Escolha no máximo ${LIMITS.upsell} sugestões.`;
  if (draft.upsellItemIds.includes(itemId)) return 'O item não pode sugerir a si mesmo.';
  return null;
}
