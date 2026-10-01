import { formatAverageMenuPrice } from '../screens/production/home-restaurant-ui';

describe('formatAverageMenuPrice — preço médio do cardápio (centavos → reais só na borda)', () => {
  it('formata em reais com centavos quando não é redondo', () => {
    expect(formatAverageMenuPrice(5827)).toBe('Preço médio R$\u00A058,27');
    expect(formatAverageMenuPrice(2050)).toBe('Preço médio R$\u00A020,50');
  });

  it('não mostra ",00" em valores redondos', () => {
    expect(formatAverageMenuPrice(6600)).toBe('Preço médio R$\u00A066');
  });

  it('esconde quando não há cardápio', () => {
    expect(formatAverageMenuPrice(null)).toBeNull();
    expect(formatAverageMenuPrice(undefined)).toBeNull();
    expect(formatAverageMenuPrice(0)).toBeNull();
  });
});
