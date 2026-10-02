import {
  LIMITS,
  centsFromInput,
  draftFromForm,
  formFromDraft,
  maskPriceInput,
  newGroup,
  parseIngredients,
  validateDraft,
  type CustomizationForm,
} from '../screens/v2/menu/customizationDraft';

const form = (patch: Partial<CustomizationForm> = {}): CustomizationForm => ({
  groups: [{
    key: 'g1', id: 'grp-1', name: 'Ponto', required: true, maxSelect: 3,
    options: [
      { key: 'o1', id: 'opt-1', name: 'Ao ponto', price: '', isAvailable: true },
      { key: 'o2', name: ' Bem passado ', price: '1,50', isAvailable: true },
    ],
  }],
  ingredients: 'cebola, Picles\npicles, ',
  upsellItemIds: ['fritas', 'fritas'],
  ...patch,
});

describe('editor de personalização (ADR-013 §2.9)', () => {
  it('preço em centavos a partir do campo mascarado', () => {
    expect(centsFromInput('4,50')).toBe(450);
    expect(centsFromInput('R$ 1.234,56')).toBe(123456);
    expect(centsFromInput('')).toBe(0);
    expect(maskPriceInput('450')).toBe('4,50');
  });

  it('ingredientes sem repetição, ignorando caixa e vazios', () => {
    expect(parseIngredients('cebola, Picles\npicles, ')).toEqual(['cebola', 'Picles']);
  });

  it('formulário vira payload: obrigatório = mínimo 1, máximo limitado às opções, ids preservados', () => {
    const draft = draftFromForm(form());
    expect(draft.groups[0]).toEqual({
      id: 'grp-1', name: 'Ponto', minSelect: 1, maxSelect: 2,
      options: [
        { id: 'opt-1', name: 'Ao ponto', priceDeltaCents: 0, isAvailable: true },
        { name: 'Bem passado', priceDeltaCents: 150, isAvailable: true },
      ],
    });
    expect(draft.removable).toEqual(['cebola', 'Picles']);
    expect(draft.upsellItemIds).toEqual(['fritas']);
  });

  it('ida e volta do servidor mantém o que o dono vê', () => {
    const back = formFromDraft(draftFromForm(form()));
    expect(back.groups[0].required).toBe(true);
    expect(back.groups[0].options[1].price).toBe('1,50');
    expect(back.ingredients).toBe('cebola, Picles');
  });

  it('valida antes de enviar, com a mesma faixa do servidor', () => {
    expect(validateDraft(draftFromForm(form()), 'burger')).toBeNull();
    expect(validateDraft(draftFromForm(form({ groups: [{ ...newGroup(), name: '' }] })), 'burger')).toMatch(/nome/);
    expect(validateDraft(draftFromForm(form({ groups: [{ ...newGroup(), name: 'Vazio', options: [] }] })), 'burger')).toMatch(/pelo menos uma opção/);
    const repetida = form();
    repetida.groups[0].options[1].name = 'ao ponto';
    expect(validateDraft(draftFromForm(repetida), 'burger')).toMatch(/repetidas/);
    const semDisponivel = form();
    semDisponivel.groups[0].options = semDisponivel.groups[0].options.map((o) => ({ ...o, isAvailable: false }));
    expect(validateDraft(draftFromForm(semDisponivel), 'burger')).toMatch(/obrigatório e não tem opção disponível/);
    expect(validateDraft(draftFromForm(form({ upsellItemIds: ['burger'] })), 'burger')).toMatch(/si mesmo/);
    const muitos = Array.from({ length: LIMITS.upsell + 1 }, (_, i) => `i${i}`);
    expect(validateDraft(draftFromForm(form({ upsellItemIds: muitos })), 'burger')).toMatch(/no máximo/);
  });
});
