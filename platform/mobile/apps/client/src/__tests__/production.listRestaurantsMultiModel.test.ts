const mockCalls: Array<[string, unknown[]]> = [];
let mockRows: Record<string, unknown>[] = [];

jest.mock('@/shared/services/supabase', () => {
  const builder: Record<string, unknown> = {};
  const chain = (name: string) => (...args: unknown[]) => { mockCalls.push([name, args]); return builder; };
  for (const name of ['select', 'eq', 'overlaps', 'contains', 'order', 'limit', 'ilike', 'in', 'gt']) builder[name] = chain(name);
  builder.then = (resolve: (value: unknown) => unknown) => resolve({ data: mockRows, error: null });
  return { getSupabaseClient: () => ({ from: () => builder }) };
});
jest.mock('expo-crypto', () => ({}));

import customerBackend from '../services/customer-backend';

const parrilaria = {
  id: 'r1', name: 'Parrilaria Noowe', service_type: 'casual_dining', service_models: ['casual_dining', 'quick_service'],
  cuisine_types: [], photos: [], opening_hours: {}, service_config: {},
};

describe('listRestaurants — restaurante com mais de uma categoria (ADR-017)', () => {
  beforeEach(() => { mockCalls.length = 0; mockRows = [parrilaria]; });

  it('o chip Quick filtra pelo array de modelos, não pelo tipo principal', async () => {
    await customerBackend.listRestaurants({ serviceType: 'quick_service' });
    expect(mockCalls).toContainEqual(['contains', ['service_models', ['quick_service']]]);
    expect(mockCalls.some(([name, args]) => name === 'eq' && args[0] === 'service_type')).toBe(false);
  });

  it('expõe todos os modelos do restaurante', async () => {
    const page = await customerBackend.listRestaurants({});
    expect(page.data[0].serviceModels).toEqual(['casual_dining', 'quick_service']);
    expect(page.data[0].serviceType).toBe('casual_dining');
  });

  it('sem a coluna nova, cai no tipo principal', async () => {
    mockRows = [{ ...parrilaria, service_models: null }];
    const page = await customerBackend.listRestaurants({});
    expect(page.data[0].serviceModels).toEqual(['casual_dining']);
  });
});
