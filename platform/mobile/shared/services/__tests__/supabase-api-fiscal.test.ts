import { supabaseApiAdapter } from '../supabase-api';
import { getSupabaseClient } from '../supabase';

jest.mock('../supabase', () => ({ getSupabaseClient: jest.fn() }));
jest.mock('../supabase-auth', () => ({ getOptionalSupabaseSessionUser: jest.fn() }));
jest.mock('../active-restaurant', () => ({ getActiveRestaurantId: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));

describe('notas com problema no adapter', () => {
  const query: Record<string, jest.Mock> = {};
  const from = jest.fn(() => query);

  beforeEach(() => {
    jest.clearAllMocks();
    for (const method of ['select', 'eq', 'in']) query[method] = jest.fn(() => query);
    query.order = jest.fn().mockResolvedValue({ data: [], error: null });
    (getSupabaseClient as jest.Mock).mockReturnValue({ from });
  });

  it('pede só os estados que esperam a gerência, do restaurante ativo', async () => {
    await supabaseApiAdapter.getFiscalIssues('r1');
    expect(from).toHaveBeenCalledWith('fiscal_documents');
    expect(query.eq).toHaveBeenCalledWith('restaurant_id', 'r1');
    expect(query.in).toHaveBeenCalledWith('status', ['blocked', 'rejected', 'failed']);
  });

  it('nomeia a FK da mesa: table_sessions tem duas para tables e o PostgREST recusa sem isso', async () => {
    await supabaseApiAdapter.getFiscalIssues('r1');
    expect(query.select.mock.calls[0][0]).toContain('tables!table_sessions_table_id_fkey');
  });

  it('não traz a foto da nota para o app', async () => {
    await supabaseApiAdapter.getFiscalIssues('r1');
    expect(query.select.mock.calls[0][0]).not.toMatch(/snapshot|\*/);
  });
});
