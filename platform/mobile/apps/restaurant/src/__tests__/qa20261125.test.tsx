/** QA 25/11/2026: pessoas no card da mesa (CA-B2) e recurso fora do plano (PL-05). */
import { mapTable } from '../screens/v2/shared/useRestaurantOperations';
import { planGate } from '../screens/v2/config/planView';

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => 'Icon' }));
jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => new Proxy({}, { get: () => '#333333' }) }));
jest.mock('@okinawa/shared/services/supabase-api', () => ({ supabaseApiAdapter: {} }));

describe('CA-B2: pessoas no card da mesa', () => {
  const raw = (session: Record<string, unknown>) => ({ id: 't1', table_number: '1', seats: 4, status: 'occupied', active_session: session }) as any;
  it('conta quem está na comanda, não o número da abertura', () => {
    expect(mapTable(raw({ id: 's1', guest_count: 1, headcount: 2 })).guests).toBe(2);
  });
  it('sem headcount, usa o da abertura', () => {
    expect(mapTable(raw({ id: 's1', guest_count: 3 })).guests).toBe(3);
  });
});

describe('PL-05: recurso fora do plano', () => {
  it('Dono vê com cadeado; papéis operacionais não veem; no plano, aparece para todos', () => {
    expect(planGate(['delivery_integrations'], 'delivery_integrations', 'owner')).toBe('locked');
    expect(planGate(['delivery_integrations'], 'delivery_integrations', 'manager')).toBe('hidden');
    expect(planGate(['delivery_integrations'], 'delivery_integrations', 'waiter')).toBe('hidden');
    expect(planGate([], 'delivery_integrations', 'manager')).toBe('open');
  });
});
