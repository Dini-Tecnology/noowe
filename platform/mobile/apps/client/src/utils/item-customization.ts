/**
 * ADR-013 §2.9 — personalização de item (modificadores, ingredientes removíveis, upsell).
 *
 * Tudo aqui é só para a tela: o app envia ids de opção e nomes de ingrediente, e o servidor
 * (`private.price_item_customizations`) valida e precifica. O extra exibido é uma prévia.
 */

export type CustomizationOption = { id: string; name: string; priceDeltaCents: number };
export type CustomizationGroup = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: CustomizationOption[];
};
export type ItemCustomizationConfig = {
  groups: CustomizationGroup[];
  removable: string[];
  upsellItemIds: string[];
};
export type CustomizationSelection = { options: string[]; removed: string[] };
/** Mapa por item, como `customer_get_menu_customizations` devolve. */
export type MenuCustomizations = Record<string, ItemCustomizationConfig>;

export const EMPTY_SELECTION: CustomizationSelection = { options: [], removed: [] };

const toInt = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback;
const toArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** Lê o jsonb do servidor sem confiar no formato: entrada estranha vira item sem personalização. */
export function parseMenuCustomizations(value: unknown): MenuCustomizations {
  const out: MenuCustomizations = {};
  for (const [itemId, raw] of Object.entries(toRecord(value))) {
    const row = toRecord(raw);
    out[itemId] = {
      groups: toArray(row.groups).map((g) => {
        const group = toRecord(g);
        return {
          id: String(group.id ?? ''),
          name: String(group.name ?? ''),
          minSelect: toInt(group.minSelect, 0),
          maxSelect: toInt(group.maxSelect, 1),
          options: toArray(group.options).map((o) => {
            const option = toRecord(o);
            return { id: String(option.id ?? ''), name: String(option.name ?? ''), priceDeltaCents: toInt(option.priceDeltaCents, 0) };
          }),
        };
      }).filter((g) => g.id && g.options.length > 0),
      removable: toArray(row.removable).filter((x): x is string => typeof x === 'string' && x.length > 0),
      upsellItemIds: toArray(row.upsellItemIds).filter((x): x is string => typeof x === 'string' && x.length > 0),
    };
  }
  return out;
}

/** O item tem algo a escolher (grupos ou ingredientes)? Então "Adicionar" abre o detalhe. */
export function hasChoices(config: ItemCustomizationConfig | null | undefined): boolean {
  return !!config && (config.groups.length > 0 || config.removable.length > 0);
}

export const isRequired = (group: CustomizationGroup) => group.minSelect >= 1;

/** Regra de escolha do grupo, no texto que o cliente vê. */
export function groupRuleLabel(group: CustomizationGroup): string {
  if (group.minSelect === group.maxSelect) return `Escolha ${group.minSelect}`;
  if (group.minSelect >= 1) return `Escolha de ${group.minSelect} a ${group.maxSelect}`;
  return group.maxSelect === 1 ? 'Opcional · até 1' : `Opcional · até ${group.maxSelect}`;
}

/**
 * Grupo de escolha única troca a opção (rádio). Nos demais, alterna; ao bater o máximo,
 * a seleção não muda — o servidor recusaria de qualquer jeito.
 */
export function toggleOption(
  config: ItemCustomizationConfig,
  selection: CustomizationSelection,
  groupId: string,
  optionId: string,
): CustomizationSelection {
  const group = config.groups.find((g) => g.id === groupId);
  if (!group || !group.options.some((o) => o.id === optionId)) return selection;
  const groupOptionIds = new Set(group.options.map((o) => o.id));
  const chosenInGroup = selection.options.filter((id) => groupOptionIds.has(id));
  if (selection.options.includes(optionId)) {
    return { ...selection, options: selection.options.filter((id) => id !== optionId) };
  }
  if (group.maxSelect === 1) {
    return { ...selection, options: [...selection.options.filter((id) => !groupOptionIds.has(id)), optionId] };
  }
  if (chosenInGroup.length >= group.maxSelect) return selection;
  return { ...selection, options: [...selection.options, optionId] };
}

export function toggleRemoved(selection: CustomizationSelection, ingredient: string): CustomizationSelection {
  return selection.removed.includes(ingredient)
    ? { ...selection, removed: selection.removed.filter((x) => x !== ingredient) }
    : { ...selection, removed: [...selection.removed, ingredient] };
}

/** Grupos obrigatórios ainda sem a quantidade mínima — bloqueiam o "Adicionar". */
export function missingGroups(config: ItemCustomizationConfig | null | undefined, selection: CustomizationSelection): CustomizationGroup[] {
  if (!config) return [];
  return config.groups.filter((group) => {
    const ids = new Set(group.options.map((o) => o.id));
    return selection.options.filter((id) => ids.has(id)).length < group.minSelect;
  });
}

/** Prévia do extra em centavos. Quem cobra é o servidor. */
export function selectionDeltaCents(config: ItemCustomizationConfig | null | undefined, selection: CustomizationSelection): number {
  if (!config) return 0;
  const chosen = new Set(selection.options);
  return config.groups.reduce(
    (sum, group) => sum + group.options.reduce((acc, o) => acc + (chosen.has(o.id) ? o.priceDeltaCents : 0), 0),
    0,
  );
}

/** Mesmo texto que o servidor grava para a cozinha: "Ponto: Ao ponto · Sem cebola, sem picles". */
export function selectionSummary(config: ItemCustomizationConfig | null | undefined, selection: CustomizationSelection): string {
  if (!config) return '';
  const chosen = new Set(selection.options);
  const parts = config.groups
    .map((group) => ({ group, names: group.options.filter((o) => chosen.has(o.id)).map((o) => o.name) }))
    .filter(({ names }) => names.length > 0)
    .map(({ group, names }) => `${group.name}: ${names.join(', ')}`);
  if (selection.removed.length > 0) parts.push(`Sem ${selection.removed.join(', sem ')}`);
  return parts.join(' · ');
}

/**
 * Formato enviado ao servidor. Ordenado para que o mesmo pedido gere o mesmo fingerprint
 * (bloqueio de duplicado) e o carrinho funda linhas iguais.
 */
export function selectionPayload(selection: CustomizationSelection | null | undefined): CustomizationSelection | undefined {
  if (!selection) return undefined;
  const options = [...new Set(selection.options)].sort();
  const removed = [...new Set(selection.removed)].sort();
  return options.length === 0 && removed.length === 0 ? undefined : { options, removed };
}

export function sameSelection(a: CustomizationSelection | null | undefined, b: CustomizationSelection | null | undefined): boolean {
  return JSON.stringify(selectionPayload(a) ?? null) === JSON.stringify(selectionPayload(b) ?? null);
}

/** "Pedir novamente": recupera a escolha do snapshot gravado em `order_items.customizations`. */
export function selectionFromSnapshot(snapshot: unknown): CustomizationSelection | undefined {
  const entries = toArray(snapshot).map(toRecord);
  const options = entries.filter((e) => e.type === 'option' && typeof e.optionId === 'string').map((e) => e.optionId as string);
  const removed = entries.filter((e) => e.type === 'removed' && typeof e.name === 'string').map((e) => e.name as string);
  return selectionPayload({ options, removed });
}

/** Preço unitário exibido (reais, só para a tela) = base + extras. Soma em centavos para não acumular erro. */
export function unitPriceWithExtras(basePrice: number, deltaCents: number): number {
  return (Math.round(basePrice * 100) + deltaCents) / 100;
}

/**
 * Resumo a partir do snapshot, na ordem em que o servidor o gravou — idêntico ao prefixo que
 * `place_order` pôs em `special_instructions`.
 */
export function snapshotSummary(snapshot: unknown): string {
  const entries = toArray(snapshot).map(toRecord);
  const parts: string[] = [];
  let currentGroup: string | null = null;
  let names: string[] = [];
  const flush = () => {
    if (currentGroup !== null && names.length > 0) parts.push(`${currentGroup}: ${names.join(', ')}`);
  };
  for (const entry of entries.filter((e) => e.type === 'option')) {
    const group = String(entry.group ?? '');
    if (group !== currentGroup) {
      flush();
      currentGroup = group;
      names = [];
    }
    names.push(String(entry.name ?? ''));
  }
  flush();
  const removed = entries.filter((e) => e.type === 'removed').map((e) => String(e.name ?? ''));
  if (removed.length > 0) parts.push(`Sem ${removed.join(', sem ')}`);
  return parts.join(' · ');
}

/** Tira o resumo da personalização de `special_instructions`, devolvendo só a observação do cliente. */
export function noteFromSpecialInstructions(special: string | null | undefined, snapshot: unknown): string | undefined {
  if (!special) return undefined;
  const summary = snapshotSummary(snapshot);
  if (!summary) return special;
  if (special === summary) return undefined;
  return special.startsWith(`${summary} · `) ? special.slice(summary.length + 3) || undefined : special;
}

/**
 * Reaproveita uma escolha antiga com a configuração de hoje: descarta opção ou ingrediente
 * que não existe mais. Devolve `null` quando falta escolha obrigatória — o cliente refaz.
 */
export function reconcileSelection(
  config: ItemCustomizationConfig | null | undefined,
  previous: CustomizationSelection | undefined,
): CustomizationSelection | undefined | null {
  if (!config) return undefined;
  const validOptions = new Set(config.groups.flatMap((g) => g.options.map((o) => o.id)));
  const next: CustomizationSelection = {
    options: (previous?.options ?? []).filter((id) => validOptions.has(id)),
    removed: (previous?.removed ?? []).filter((name) => config.removable.includes(name)),
  };
  if (missingGroups(config, next).length > 0) return null;
  const overflow = config.groups.some((g) => next.options.filter((id) => g.options.some((o) => o.id === id)).length > g.maxSelect);
  return overflow ? null : selectionPayload(next);
}
