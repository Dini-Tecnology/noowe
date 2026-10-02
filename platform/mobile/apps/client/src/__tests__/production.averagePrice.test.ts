import { formatAveragePrice } from '../screens/production/home-restaurant-ui';

describe('formatAveragePrice — preço médio cadastrado pelo restaurante (centavos → reais só na borda)', () => {
  it('mostra o valor cadastrado em reais, sempre com centavos', () => {
    expect(formatAveragePrice(5000)).toBe('Preço médio R$ 50,00');
    expect(formatAveragePrice(5827)).toBe('Preço médio R$ 58,27');
    expect(formatAveragePrice(2050)).toBe('Preço médio R$ 20,50');
  });

  it('usa separador de milhar em valores altos', () => {
    expect(formatAveragePrice(123456)).toBe('Preço médio R$ 1.234,56');
  });

  it('esconde quando o restaurante não cadastrou preço', () => {
    expect(formatAveragePrice(null)).toBeNull();
    expect(formatAveragePrice(undefined)).toBeNull();
    expect(formatAveragePrice(0)).toBeNull();
    expect(formatAveragePrice(-100)).toBeNull();
  });
});
