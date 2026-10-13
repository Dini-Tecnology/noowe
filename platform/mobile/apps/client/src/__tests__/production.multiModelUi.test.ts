import { restaurantExperiences, serviceTypesLabel } from '../screens/production/home-restaurant-ui';

describe('restaurantExperiences (ADR-017)', () => {
  it('Casual + Quick oferece Na mesa e Retirada', () => {
    expect(restaurantExperiences(['casual_dining', 'quick_service'])).toEqual([
      { key: 'table', label: 'Na mesa', model: 'casual_dining' },
      { key: 'pickup', label: 'Retirada', model: 'quick_service' },
    ]);
  });

  it('um modelo só não tem o que escolher', () => {
    expect(restaurantExperiences(['quick_service'])).toHaveLength(1);
    expect(restaurantExperiences(['fine_dining'])).toHaveLength(1);
  });

  it('Fine + Casual conta como uma experiência de salão', () => {
    expect(restaurantExperiences(['fine_dining', 'casual_dining'])).toHaveLength(1);
  });
});

describe('serviceTypesLabel', () => {
  it('lista todas as categorias, tipo principal primeiro', () => {
    expect(serviceTypesLabel('casual_dining', ['quick_service', 'casual_dining'])).toBe('Casual dining · Serviço rápido');
  });
});
