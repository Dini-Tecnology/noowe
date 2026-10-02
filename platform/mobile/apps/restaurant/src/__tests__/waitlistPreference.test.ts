import { waitlistPreferenceLabel } from '../screens/v2/shared/waitlistPreference';

describe('waitlistPreferenceLabel', () => {
  it('mostra o setor pedido pelo grupo', () => {
    expect(waitlistPreferenceLabel('Rooftop')).toBe('Rooftop');
    expect(waitlistPreferenceLabel('Salão Principal')).toBe('Salão Principal');
  });

  it('não mostra nada quando o grupo aceita qualquer setor', () => {
    expect(waitlistPreferenceLabel('qualquer')).toBeNull();
    expect(waitlistPreferenceLabel('Qualquer')).toBeNull();
    expect(waitlistPreferenceLabel('')).toBeNull();
    expect(waitlistPreferenceLabel(null)).toBeNull();
    expect(waitlistPreferenceLabel(undefined)).toBeNull();
  });

  it('entende as entradas antigas', () => {
    expect(waitlistPreferenceLabel('salao')).toBe('Salão');
    expect(waitlistPreferenceLabel('terraco')).toBe('Terraço');
  });
});
