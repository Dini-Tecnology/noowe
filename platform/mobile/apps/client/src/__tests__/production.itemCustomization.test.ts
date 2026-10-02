import {
  EMPTY_SELECTION,
  hasChoices,
  missingGroups,
  noteFromSpecialInstructions,
  parseMenuCustomizations,
  reconcileSelection,
  sameSelection,
  selectionDeltaCents,
  selectionFromSnapshot,
  selectionPayload,
  selectionSummary,
  snapshotSummary,
  toggleOption,
  toggleRemoved,
  unitPriceWithExtras,
  type ItemCustomizationConfig,
} from '../utils/item-customization';
import { cartOrderItems } from '../utils/cart-order-items';
import { buildReorder } from '../screens/production/quick-service-ui';

// O mesmo item do teste SQL 24: "Ponto" obrigatório (1) e "Adicionais" opcional (até 2).
const burger: ItemCustomizationConfig = {
  groups: [
    { id: 'g-ponto', name: 'Ponto', minSelect: 1, maxSelect: 1, options: [
      { id: 'o-mal', name: 'Mal passado', priceDeltaCents: 0 },
      { id: 'o-ponto', name: 'Ao ponto', priceDeltaCents: 0 },
    ] },
    { id: 'g-add', name: 'Adicionais', minSelect: 0, maxSelect: 2, options: [
      { id: 'o-bacon', name: 'Bacon', priceDeltaCents: 450 },
      { id: 'o-queijo', name: 'Queijo', priceDeltaCents: 300 },
      { id: 'o-ovo', name: 'Ovo', priceDeltaCents: 200 },
    ] },
  ],
  removable: ['cebola', 'picles'],
  upsellItemIds: ['fritas'],
};

describe('personalização — regras de escolha (ADR-013 §2.9)', () => {
  it('grupo de escolha única troca a opção como rádio', () => {
    let sel = toggleOption(burger, EMPTY_SELECTION, 'g-ponto', 'o-mal');
    sel = toggleOption(burger, sel, 'g-ponto', 'o-ponto');
    expect(sel.options).toEqual(['o-ponto']);
  });

  it('grupo com máximo não passa do limite', () => {
    let sel = toggleOption(burger, EMPTY_SELECTION, 'g-add', 'o-bacon');
    sel = toggleOption(burger, sel, 'g-add', 'o-queijo');
    sel = toggleOption(burger, sel, 'g-add', 'o-ovo');
    expect(sel.options).toEqual(['o-bacon', 'o-queijo']);
    expect(toggleOption(burger, sel, 'g-add', 'o-bacon').options).toEqual(['o-queijo']);
  });

  it('opção de outro grupo ou inexistente não muda a seleção', () => {
    expect(toggleOption(burger, EMPTY_SELECTION, 'g-ponto', 'o-bacon')).toBe(EMPTY_SELECTION);
    expect(toggleOption(burger, EMPTY_SELECTION, 'g-x', 'o-mal')).toBe(EMPTY_SELECTION);
  });

  it('grupo obrigatório sem escolha bloqueia o "Adicionar"', () => {
    expect(missingGroups(burger, EMPTY_SELECTION).map((g) => g.name)).toEqual(['Ponto']);
    expect(missingGroups(burger, { options: ['o-mal'], removed: [] })).toEqual([]);
    expect(missingGroups(null, EMPTY_SELECTION)).toEqual([]);
  });

  it('prévia do extra soma em centavos e o unitário não acumula erro de float', () => {
    const sel = { options: ['o-ponto', 'o-bacon', 'o-queijo'], removed: ['cebola'] };
    expect(selectionDeltaCents(burger, sel)).toBe(750);
    expect(unitPriceWithExtras(32.9, 750)).toBe(40.4);
    expect(unitPriceWithExtras(0.1, 20)).toBe(0.3);
  });

  it('resumo usa o mesmo texto que o servidor grava para a cozinha', () => {
    const sel = toggleRemoved({ options: ['o-ponto', 'o-bacon', 'o-queijo'], removed: [] }, 'cebola');
    expect(selectionSummary(burger, sel)).toBe('Ponto: Ao ponto · Adicionais: Bacon, Queijo · Sem cebola');
  });

  it('item sem grupos nem ingredientes não abre o detalhe', () => {
    expect(hasChoices(burger)).toBe(true);
    expect(hasChoices({ groups: [], removable: [], upsellItemIds: ['x'] })).toBe(false);
    expect(hasChoices(null)).toBe(false);
  });
});

describe('payload e carrinho', () => {
  it('payload é ordenado e sem repetição, para o carrinho fundir e o duplicado bater', () => {
    expect(selectionPayload({ options: ['o-queijo', 'o-bacon', 'o-bacon'], removed: ['picles', 'cebola'] }))
      .toEqual({ options: ['o-bacon', 'o-queijo'], removed: ['cebola', 'picles'] });
    expect(selectionPayload(EMPTY_SELECTION)).toBeUndefined();
    expect(sameSelection({ options: ['b', 'a'], removed: [] }, { options: ['a', 'b'], removed: [] })).toBe(true);
    expect(sameSelection({ options: ['a'], removed: [] }, undefined)).toBe(false);
  });

  it('carrinho → pedido nunca envia preço e leva a personalização de cada linha e etapa do combo', () => {
    const items = cartOrderItems([
      { id: 'l1', menu_item_id: 'burger', name: 'Burger', price: 40.4, quantity: 2,
        customizations: { options: ['o-ponto'], removed: ['cebola'] }, special_instructions: 'bem quente' },
      { id: 'l2', menu_item_id: 'agua', name: 'Água', price: 5, quantity: 1, diner_id: 'd1' },
      { id: 'c1', menu_item_id: 'burger', name: 'Combo', price: 50, quantity: 2, combo: {
        lancheItemId: 'burger', acompanhamentoItemId: 'fritas', bebidaItemId: 'refri',
        customizations: { lanche: { options: ['o-mal'], removed: [] } },
      } },
    ]);
    expect(items).toHaveLength(2 + 6);
    expect(items[0]).toEqual({ menuItemId: 'burger', quantity: 2, specialInstructions: 'bem quente',
      customizations: { options: ['o-ponto'], removed: ['cebola'] } });
    expect(items[1]).toEqual({ menuItemId: 'agua', quantity: 1, specialInstructions: undefined, dinerId: 'd1' });
    const combo = items.slice(2);
    expect(new Set(combo.map((i) => i.comboGroup))).toEqual(new Set(['c1:0', 'c1:1']));
    expect(combo.filter((i) => i.menuItemId === 'burger').every((i) => (i.customizations as any)?.options[0] === 'o-mal')).toBe(true);
    expect(combo.filter((i) => i.menuItemId !== 'burger').every((i) => i.customizations === undefined)).toBe(true);
    expect(items.every((i) => !('price' in i) && !('unitPrice' in i))).toBe(true);
  });

  it('parse do servidor descarta grupo vazio e formato estranho', () => {
    const map = parseMenuCustomizations({
      burger: { groups: [{ id: 'g', name: 'G', minSelect: 1, maxSelect: 1, options: [{ id: 'o', name: 'O', priceDeltaCents: 100 }] },
        { id: 'vazio', name: 'V', options: [] }], removable: ['cebola', 3], upsellItemIds: 'x' },
      lixo: 'abc',
    });
    expect(map.burger.groups.map((g) => g.id)).toEqual(['g']);
    expect(map.burger.removable).toEqual(['cebola']);
    expect(map.burger.upsellItemIds).toEqual([]);
    expect(map.lixo).toEqual({ groups: [], removable: [], upsellItemIds: [] });
    expect(parseMenuCustomizations(null)).toEqual({});
  });
});

describe('"Pedir novamente" com personalização', () => {
  // Snapshot como place_order grava em order_items.customizations.
  const snapshot = [
    { type: 'option', groupId: 'g-ponto', group: 'Ponto', optionId: 'o-ponto', name: 'Ao ponto', priceDeltaCents: 0 },
    { type: 'option', groupId: 'g-add', group: 'Adicionais', optionId: 'o-bacon', name: 'Bacon', priceDeltaCents: 450 },
    { type: 'option', groupId: 'g-add', group: 'Adicionais', optionId: 'o-queijo', name: 'Queijo', priceDeltaCents: 300 },
    { type: 'removed', name: 'cebola' },
  ];
  const special = 'Ponto: Ao ponto · Adicionais: Bacon, Queijo · Sem cebola · bem quente';
  const menu = [{ id: 'burger', name: 'Burger', price: 32.9, imageUrl: null, preparationTime: 8 }];

  it('o resumo do snapshot é o prefixo gravado e a observação original volta limpa', () => {
    expect(snapshotSummary(snapshot)).toBe('Ponto: Ao ponto · Adicionais: Bacon, Queijo · Sem cebola');
    expect(noteFromSpecialInstructions(special, snapshot)).toBe('bem quente');
    expect(noteFromSpecialInstructions('Ponto: Ao ponto · Adicionais: Bacon, Queijo · Sem cebola', snapshot)).toBeUndefined();
    expect(noteFromSpecialInstructions('sem gelo', [])).toBe('sem gelo');
  });

  it('recoloca a escolha com o preço de hoje, sem duplicar o resumo na observação', () => {
    const { cartItems, needsChoice } = buildReorder(
      [{ menuItemId: 'burger', quantity: 1, name: 'Burger', specialInstructions: special, customizations: snapshot }],
      menu, { burger });
    expect(needsChoice).toEqual([]);
    expect(cartItems[0]).toEqual(expect.objectContaining({
      price: 40.4,
      special_instructions: 'bem quente',
      customizations: { options: ['o-bacon', 'o-ponto', 'o-queijo'], removed: ['cebola'] },
      customization_summary: 'Ponto: Ao ponto · Adicionais: Bacon, Queijo · Sem cebola',
    }));
  });

  it('opção que sumiu é descartada; obrigatória que sumiu manda escolher de novo', () => {
    const semBacon = { ...burger, groups: [burger.groups[0], { ...burger.groups[1], options: burger.groups[1].options.slice(1) }] };
    expect(reconcileSelection(semBacon, selectionFromSnapshot(snapshot)))
      .toEqual({ options: ['o-ponto', 'o-queijo'], removed: ['cebola'] });

    const pontoNovo = { ...burger, groups: [{ ...burger.groups[0], options: [{ id: 'o-novo', name: 'Bem passado', priceDeltaCents: 0 }] }] };
    const { cartItems, needsChoice } = buildReorder(
      [{ menuItemId: 'burger', quantity: 1, name: 'Burger', specialInstructions: special, customizations: snapshot }],
      menu, { burger: pontoNovo });
    expect(cartItems).toEqual([]);
    expect(needsChoice).toEqual(['Burger']);
  });
});
